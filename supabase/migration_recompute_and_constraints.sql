-- ==========================================
-- FRESHOPS IDEMPOTENT MIGRATION SCRIPT
-- ==========================================

-- 1. UPDATE ORDERS STATUS & COMPUTED_STATUS CHECK CONSTRAINTS
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'Bekliyor', 'Onaylandı', 'Planlandı', 'Üretim Planlandı', 'Üretimde', 
  'Üretim Tamamlandı', 'Sevkiyata Hazır', 'Kısmi Sevk', 'Sevk Edildi', 
  'Tamamlandı', 'İptal', 'İptal Edildi', 'Taslak', 'Üretildi'
));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_computed_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_computed_status_check CHECK (computed_status IN (
  'Bekliyor', 'Onaylandı', 'Planlandı', 'Üretim Planlandı', 'Üretimde', 
  'Üretim Tamamlandı', 'Sevkiyata Hazır', 'Kısmi Sevk', 'Sevk Edildi', 
  'Tamamlandı', 'İptal', 'İptal Edildi', 'Taslak', 'Üretildi'
));


-- 2. CENTRAL ORDER STATUS RECOMPUTATION HELPER
CREATE OR REPLACE FUNCTION recompute_order_status_atomic(p_order_id TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_current_computed_status TEXT;
  v_realized_amount NUMERIC;
  v_total_amount NUMERIC;
  v_new_status TEXT;
  v_has_active_stock BOOLEAN;
  v_has_active_production_plan BOOLEAN;
BEGIN
  -- Fetch current status of the order
  SELECT status, computed_status, COALESCE(realized_amount, 0), COALESCE(total_amount, 0)
  INTO v_current_status, v_current_computed_status, v_realized_amount, v_total_amount
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sipariş bulunamadı.');
  END IF;

  -- 1. Eğer order.status veya order.computed_status "Taslak", "İptal", "İptal Edildi" ise bu statüler korunmalı.
  IF v_current_status IN ('Taslak', 'İptal', 'İptal Edildi') THEN
    v_new_status := v_current_status;
  ELSIF v_current_computed_status IN ('Taslak', 'İptal', 'İptal Edildi') THEN
    v_new_status := v_current_computed_status;
  ELSE
    -- 2. Eğer realized_amount > 0 ve realized_amount < total_amount ise: Kısmi Sevk
    IF v_realized_amount > 0 AND v_realized_amount < v_total_amount THEN
      v_new_status := 'Kısmi Sevk';
    -- 3. Eğer realized_amount >= total_amount ve total_amount > 0 ise: Sevk Edildi
    ELSIF v_realized_amount >= v_total_amount AND v_total_amount > 0 THEN
      v_new_status := 'Sevk Edildi';
    ELSE
      -- realized_amount = 0 durumları
      -- 4. Eğer realized_amount = 0 ve bu siparişe bağlı aktif mamul stoğu varsa (is_deleted = false ve quantity_remaining > 0): Sevkiyata Hazır
      SELECT EXISTS (
        SELECT 1 FROM finished_goods_stocks
        WHERE order_id = p_order_id
          AND is_deleted = false
          AND quantity_remaining > 0
      ) INTO v_has_active_stock;

      IF v_has_active_stock THEN
        v_new_status := 'Sevkiyata Hazır';
      ELSE
        -- 5. Eğer realized_amount = 0 ve aktif mamul stoğu yok ama sipariş aktif bir üretim planı kalemine bağlıysa (is_deleted = false): Üretim Planlandı
        SELECT EXISTS (
          SELECT 1 FROM production_plan_items
          WHERE order_id = p_order_id
            AND is_deleted = false
        ) INTO v_has_active_production_plan;

        IF v_has_active_production_plan THEN
          v_new_status := 'Üretim Planlandı';
        ELSE
          -- 6. Eğer sipariş henüz üretim planına bağlı değilse ve onaylıysa (veya diğer): Onaylandı
          v_new_status := 'Onaylandı';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Update order statuses in the table
  UPDATE orders
  SET status = v_new_status,
      computed_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_status', v_new_status
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_order_status_atomic(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION recompute_order_status_atomic(TEXT) TO service_role;


-- 3. UPDATE SHIP FINISHED GOODS ATOMIC RPC (With recompute call and only real columns)
CREATE OR REPLACE FUNCTION ship_finished_goods_atomic(
  p_finished_goods_stock_id TEXT,
  p_ship_quantity NUMERIC,
  p_note TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock RECORD;
  v_order_item RECORD;
  v_order RECORD;
  v_actual_ship_qty NUMERIC;
  v_new_remaining NUMERIC;
  v_new_stock_status TEXT;
  v_new_movement_id TEXT;
  v_order_item_unit_price NUMERIC;
  v_realized_amount_diff NUMERIC;
  v_new_realized_amount NUMERIC;
BEGIN
  -- 1. Get the stock row
  SELECT * INTO v_stock
  FROM finished_goods_stocks
  WHERE id = p_finished_goods_stock_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nihai ürün stoğu bulunamadı.'
    );
  END IF;

  -- 2. Determine actual ship quantity
  v_actual_ship_qty := LEAST(p_ship_quantity, v_stock.quantity_remaining);
  IF v_actual_ship_qty <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Gönderilecek miktar geçersiz veya stok kalmadı.'
    );
  END IF;

  -- 3. Calculate new remaining quantity and stock status
  v_new_remaining := v_stock.quantity_remaining - v_actual_ship_qty;
  IF v_new_remaining = 0 THEN
    v_new_stock_status := 'Sevk Edildi';
  ELSE
    v_new_stock_status := 'Kısmi Sevk';
  END IF;

  -- 4. Update finished goods stocks
  UPDATE finished_goods_stocks
  SET quantity_remaining = v_new_remaining,
      status = v_new_stock_status,
      updated_at = NOW()
  WHERE id = p_finished_goods_stock_id;

  -- 5. Insert shipment movement using real columns (NO 'type' or 'date')
  v_new_movement_id := 'fgm_' || encode(gen_random_bytes(6), 'hex');
  INSERT INTO finished_goods_movements (
    id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    movement_date,
    note,
    is_deleted,
    is_shipment,
    previous_quantity,
    new_quantity,
    difference,
    created_at,
    updated_at
  ) VALUES (
    v_new_movement_id,
    p_finished_goods_stock_id,
    v_stock.production_run_id,
    v_stock.product_id,
    v_stock.customer_id,
    v_stock.order_id,
    v_stock.order_item_id,
    'Sevkiyat çıkışı',
    v_actual_ship_qty,
    CURRENT_DATE::TEXT,
    COALESCE(p_note, 'Sevkiyat Çıkışı'),
    FALSE,
    TRUE,
    v_stock.quantity_remaining,
    v_new_remaining,
    -v_actual_ship_qty,
    NOW(),
    NOW()
  );

  -- 6. Update orders if order_id is present
  IF v_stock.order_id IS NOT NULL THEN
    -- Fetch order item unit price
    SELECT * INTO v_order_item
    FROM order_items
    WHERE id = v_stock.order_item_id;

    IF FOUND THEN
      v_order_item_unit_price := COALESCE(v_order_item.unit_sale_price, 0);
      v_realized_amount_diff := v_actual_ship_qty * v_order_item_unit_price;
      
      -- Fetch order
      SELECT * INTO v_order
      FROM orders
      WHERE id = v_stock.order_id;

      IF FOUND THEN
        v_new_realized_amount := COALESCE(v_order.realized_amount, 0) + v_realized_amount_diff;

        -- Update order realized amount
        UPDATE orders
        SET realized_amount = v_new_realized_amount,
            updated_at = NOW()
        WHERE id = v_stock.order_id;

        -- Call central recompute status
        PERFORM recompute_order_status_atomic(v_stock.order_id);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'movement_id', v_new_movement_id,
    'actual_quantity', v_actual_ship_qty,
    'remaining_quantity', v_new_remaining
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ship_finished_goods_atomic(TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION ship_finished_goods_atomic(TEXT, NUMERIC, TEXT) TO service_role;


-- 4. UPDATE UNDO FINISHED GOODS SHIPMENT ATOMIC RPC (With recompute call and only real columns)
CREATE OR REPLACE FUNCTION undo_finished_goods_shipment_atomic(
  p_finished_goods_movement_id TEXT,
  p_reason TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement RECORD;
  v_stock RECORD;
  v_order_item RECORD;
  v_order RECORD;
  v_undo_movement_id TEXT;
  v_new_remaining NUMERIC;
  v_new_stock_status TEXT;
  v_order_item_unit_price NUMERIC;
  v_realized_amount_diff NUMERIC;
  v_new_realized_amount NUMERIC;
BEGIN
  -- 1. Get the movement row
  SELECT * INTO v_movement
  FROM finished_goods_movements
  WHERE id = p_finished_goods_movement_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sevkiyat hareketi bulunamadı.'
    );
  END IF;

  IF v_movement.is_deleted = TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu sevkiyat hareketi zaten iptal edilmiş.'
    );
  END IF;

  -- 2. Get the stock row
  SELECT * INTO v_stock
  FROM finished_goods_stocks
  WHERE id = v_movement.finished_goods_stock_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nihai ürün stoğu bulunamadı.'
    );
  END IF;

  -- 3. Mark the movement as deleted
  UPDATE finished_goods_movements
  SET is_deleted = TRUE,
      deleted_at = NOW(),
      deleted_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_finished_goods_movement_id;

  -- 4. Insert reverse Sayım düzeltmesi movement using real columns (NO 'type' or 'date')
  v_undo_movement_id := 'fgm_' || encode(gen_random_bytes(6), 'hex');
  v_new_remaining := v_stock.quantity_remaining + v_movement.quantity;

  INSERT INTO finished_goods_movements (
    id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    movement_date,
    note,
    is_deleted,
    is_shipment,
    previous_quantity,
    new_quantity,
    difference,
    created_at,
    updated_at
  ) VALUES (
    v_undo_movement_id,
    v_stock.id,
    v_stock.production_run_id,
    v_stock.product_id,
    v_stock.customer_id,
    v_stock.order_id,
    v_stock.order_item_id,
    'Sayım düzeltmesi',
    v_movement.quantity,
    CURRENT_DATE::TEXT,
    COALESCE(p_reason, 'Sevkiyat Geri Alındı'),
    FALSE,
    FALSE,
    v_stock.quantity_remaining,
    v_new_remaining,
    v_movement.quantity,
    NOW(),
    NOW()
  );

  -- 5. Calculate new stock remaining quantity and status
  IF v_new_remaining = 0 THEN
    v_new_stock_status := 'Sevk Edildi';
  ELSIF v_new_remaining > 0 AND v_new_remaining < v_stock.quantity_produced THEN
    v_new_stock_status := 'Kısmi Sevk';
  ELSE
    v_new_stock_status := 'Stokta';
  END IF;

  -- 6. Update finished goods stock
  UPDATE finished_goods_stocks
  SET quantity_remaining = v_new_remaining,
      status = v_new_stock_status,
      updated_at = NOW()
  WHERE id = v_stock.id;

  -- 7. Update orders if order_id is present
  IF v_stock.order_id IS NOT NULL THEN
    -- Fetch order item unit price
    SELECT * INTO v_order_item
    FROM order_items
    WHERE id = v_stock.order_item_id;

    IF FOUND THEN
      v_order_item_unit_price := COALESCE(v_order_item.unit_sale_price, 0);
      v_realized_amount_diff := v_movement.quantity * v_order_item_unit_price;

      -- Fetch order
      SELECT * INTO v_order
      FROM orders
      WHERE id = v_stock.order_id;

      IF FOUND THEN
        -- Subtract the amount, keeping it non-negative
        v_new_realized_amount := GREATEST(0, COALESCE(v_order.realized_amount, 0) - v_realized_amount_diff);

        -- Update order realized amount
        UPDATE orders
        SET realized_amount = v_new_realized_amount,
            updated_at = NOW()
        WHERE id = v_stock.order_id;

        -- Call central recompute status
        PERFORM recompute_order_status_atomic(v_stock.order_id);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'undo_movement_id', v_undo_movement_id,
    'new_remaining_quantity', v_new_remaining
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION undo_finished_goods_shipment_atomic(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION undo_finished_goods_shipment_atomic(TEXT, TEXT) TO service_role;


-- 5. RUN DYNAMIC BACKFILL FOR ALL EXISTING ORDERS
DO $$
DECLARE
  v_ord RECORD;
BEGIN
  FOR v_ord IN SELECT id FROM orders LOOP
    PERFORM recompute_order_status_atomic(v_ord.id);
  END LOOP;
END $$;
