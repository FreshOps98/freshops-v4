-- 20260730103000_add_finished_goods_stock_adjustment_atomic.sql

-- 1. Ensure columns and indexes on public.finished_goods_movements
ALTER TABLE public.finished_goods_movements
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finished_goods_movements_idempotency
  ON public.finished_goods_movements (organization_id, idempotency_key, finished_goods_stock_id)
  WHERE idempotency_key IS NOT NULL;

-- 2. RECOMPUTE ORDER STATUS ATOMIC
CREATE OR REPLACE FUNCTION public.recompute_order_status_atomic(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_order record;
  v_new_status text;

  v_realized_amount numeric := 0;
  v_shipped_quantity numeric := 0;
  v_ordered_quantity numeric := 0;
  v_remaining_fg_quantity numeric := 0;
  v_all_items_fully_produced boolean := false;
  v_has_active_plan_item boolean := false;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not accessible.';
  END IF;

  /*
   * 1. Kullanıcı tarafından yönetilen özel durumları koru.
   */
  IF v_order.status IN (
      'Taslak',
      'Bekliyor',
      'İptal',
      'İptal Edildi'
    )
  THEN
    v_new_status := v_order.status;

  ELSIF v_order.computed_status IN (
      'Taslak',
      'Bekliyor',
      'İptal',
      'İptal Edildi'
    )
  THEN
    v_new_status := v_order.computed_status;

  ELSE
    /*
     * 2. Realized amount yalnızca aktif "Sevkiyat çıkışı" hareketlerinden hesaplanır.
     * Sayım Düzeltmesi hareketi realized_amount'a eklenmez.
     */
    SELECT COALESCE(SUM(fgm.quantity * COALESCE(oi.unit_sale_price, 0)), 0)
    INTO v_realized_amount
    FROM public.finished_goods_movements fgm
    JOIN public.order_items oi
      ON oi.id = fgm.order_item_id
     AND oi.organization_id = v_org_id
     AND COALESCE(oi.is_deleted, false) = false
    WHERE fgm.order_id = v_order.id
      AND fgm.organization_id = v_org_id
      AND COALESCE(fgm.is_deleted, false) = false
      AND COALESCE(fgm.is_shipment, false) = true
      AND fgm.movement_type = 'Sevkiyat çıkışı';

    /*
     * 3. Aktif sevkiyat miktarı
     */
    SELECT COALESCE(SUM(fgm.quantity), 0)
    INTO v_shipped_quantity
    FROM public.finished_goods_movements fgm
    WHERE fgm.order_id = v_order.id
      AND fgm.organization_id = v_org_id
      AND COALESCE(fgm.is_deleted, false) = false
      AND COALESCE(fgm.is_shipment, false) = true
      AND fgm.movement_type = 'Sevkiyat çıkışı';

    /*
     * 4. Sipariş toplam miktarı (aktif order_items)
     */
    SELECT COALESCE(SUM(GREATEST(COALESCE(oi.quantity, 0), 0)), 0)
    INTO v_ordered_quantity
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
      AND oi.organization_id = v_org_id
      AND COALESCE(oi.is_deleted, false) = false;

    /*
     * 5. Aktif kalan mamul stoğu miktarı
     */
    SELECT COALESCE(SUM(GREATEST(COALESCE(fgs.quantity_remaining, 0), 0)), 0)
    INTO v_remaining_fg_quantity
    FROM public.finished_goods_stocks fgs
    WHERE fgs.order_id = v_order.id
      AND fgs.organization_id = v_org_id
      AND COALESCE(fgs.is_deleted, false) = false;

    /*
     * 6. Tüm aktif order_item'ların üretilip üretilmediği kontrolü
     */
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
        AND oi.organization_id = v_org_id
        AND COALESCE(oi.is_deleted, false) = false
        AND oi.quantity > (
          SELECT COALESCE(SUM(pr.produced_quantity), 0)
          FROM public.production_runs pr
          WHERE pr.order_item_id = oi.id
            AND pr.organization_id = v_org_id
            AND COALESCE(pr.is_deleted, false) = false
            AND COALESCE(pr.status, '') <> 'Üretim Geri Alındı'
        )
    ) INTO v_all_items_fully_produced;

    /*
     * Durum Kuralları:
     */
    IF v_shipped_quantity > 0 THEN
      IF (v_ordered_quantity > 0 AND v_shipped_quantity >= v_ordered_quantity)
         OR (COALESCE(v_order.total_amount, 0) > 0 AND v_realized_amount >= COALESCE(v_order.total_amount, 0))
      THEN
        v_new_status := 'Sevk Edildi';
      ELSIF v_all_items_fully_produced AND v_remaining_fg_quantity = 0 THEN
        -- Fire / Stok Düzeltmesi ile mamul stogu sıfırlanmış ama operasyonu bitmiş sipariş
        v_new_status := 'Sevk Edildi';
      ELSE
        v_new_status := 'Kısmi Sevk';
      END IF;
    ELSIF v_remaining_fg_quantity > 0 THEN
      v_new_status := 'Sevkiyata Hazır';
    ELSE
      /*
       * Sevkiyat yok, mamul stoğu yok -> Aktif Üretim Planı kontrolü
       */
      SELECT EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        JOIN public.production_plans pp
          ON pp.id = ppi.production_plan_id
         AND pp.organization_id = ppi.organization_id
        WHERE ppi.order_id = v_order.id
          AND ppi.organization_id = v_org_id
          AND COALESCE(ppi.is_deleted, false) = false
          AND ppi.status NOT IN (
            'İptal',
            'İptal Edildi',
            'Tamamlandı',
            'Eksikle Kapatıldı'
          )
          AND COALESCE(pp.is_deleted, false) = false
          AND pp.status NOT IN (
            'Tamamlandı',
            'Eksikle Kapatıldı',
            'İptal',
            'İptal Edildi'
          )
          AND pp.closed_at IS NULL
          AND pp.completed_at IS NULL
          AND COALESCE(pp.is_locked, false) = false
      ) INTO v_has_active_plan_item;

      IF v_has_active_plan_item THEN
        v_new_status := 'Üretim Planlandı';
      ELSE
        v_new_status := 'Onaylandı';
      END IF;
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = v_new_status,
    computed_status = v_new_status,
    realized_amount = v_realized_amount,
    updated_at = NOW()
  WHERE id = v_order.id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', v_new_status,
    'realizedAmount', v_realized_amount,
    'shippedQuantity', v_shipped_quantity,
    'orderedQuantity', v_ordered_quantity,
    'remainingFgQuantity', v_remaining_fg_quantity
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_order_status_atomic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_order_status_atomic(text) TO authenticated, service_role;


-- 3. ADJUST FINISHED GOODS STOCK ATOMIC
CREATE OR REPLACE FUNCTION public.adjust_finished_goods_stock_atomic(
  p_adjustments jsonb,
  p_reason text,
  p_movement_date date,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_idem_key text;
  v_adj jsonb;
  v_stock_id text;
  v_exp_prev numeric;
  v_new_rem numeric;

  v_stock_ids text[] := ARRAY[]::text[];
  v_stock record;
  v_stocks record[];
  
  -- Group consistency variables
  v_first_order_id text;
  v_first_order_item_id text;
  v_first_product_id text;
  v_first_lot_no text;
  v_first_set boolean := false;

  v_existing_movement_count integer := 0;
  v_matching_movement_count integer := 0;

  v_created_movement_ids text[] := ARRAY[]::text[];
  v_affected_order_ids text[] := ARRAY[]::text[];
  v_adj_count integer := 0;
  v_no_changes boolean := true;

  v_curr_remaining numeric;
  v_qty_produced numeric;
  v_diff numeric;
  v_active_shipment_qty numeric;
  v_new_stock_status text;
  v_fgm_id text;
  v_reason_clean text;
BEGIN
  -- 1. Tenant Verification
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- 2. Validate Reason
  v_reason_clean := BTRIM(p_reason);
  IF v_reason_clean IS NULL OR v_reason_clean = '' THEN
    RAISE EXCEPTION 'Düzeltme nedeni (p_reason) boş olamaz.';
  END IF;

  -- 3. Validate Adjustments Array
  IF p_adjustments IS NULL OR jsonb_typeof(p_adjustments) <> 'array' OR jsonb_array_length(p_adjustments) = 0 THEN
    RAISE EXCEPTION 'p_adjustments boş olamaz ve dizi tipinde olmalıdır.';
  END IF;

  -- 4. Clean Idempotency Key
  v_idem_key := NULLIF(BTRIM(p_idempotency_key), '');

  -- 5. Idempotency Check if key provided
  IF v_idem_key IS NOT NULL THEN
    SELECT COUNT(*), COUNT(DISTINCT finished_goods_stock_id)
    INTO v_existing_movement_count, v_matching_movement_count
    FROM public.finished_goods_movements
    WHERE organization_id = v_org_id
      AND idempotency_key = v_idem_key;

    IF v_existing_movement_count > 0 THEN
      -- Check if existing movements match current request payload
      -- For each adjustment in p_adjustments, check if a matching movement exists with new_quantity = new_remaining
      FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
      LOOP
        v_stock_id := COALESCE(v_adj->>'stock_id', v_adj->>'stockId');
        v_new_rem := COALESCE(v_adj->>'new_remaining', v_adj->>'newRemaining')::numeric;

        IF NOT EXISTS (
          SELECT 1 FROM public.finished_goods_movements
          WHERE organization_id = v_org_id
            AND idempotency_key = v_idem_key
            AND finished_goods_stock_id = v_stock_id
            AND new_quantity = v_new_rem
        ) THEN
          RAISE EXCEPTION 'İdempotent anahtarı ( % ) farklı bir istek parametresiyle kullanılmış.', v_idem_key;
        END IF;
      END LOOP;

      -- If all payload items matched existing movements:
      SELECT ARRAY_AGG(DISTINCT id), ARRAY_AGG(DISTINCT order_id)
      INTO v_created_movement_ids, v_affected_order_ids
      FROM public.finished_goods_movements
      WHERE organization_id = v_org_id
        AND idempotency_key = v_idem_key;

      RETURN jsonb_build_object(
        'success', true,
        'alreadyApplied', true,
        'noChanges', false,
        'adjustmentCount', v_existing_movement_count,
        'orderIds', COALESCE(v_affected_order_ids, ARRAY[]::text[]),
        'movementIds', COALESCE(v_created_movement_ids, ARRAY[]::text[])
      );
    END IF;
  END IF;

  -- 6. Extract stock IDs and check duplicate stock_id in request
  FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
  LOOP
    v_stock_id := COALESCE(v_adj->>'stock_id', v_adj->>'stockId');
    IF v_stock_id IS NULL OR BTRIM(v_stock_id) = '' THEN
      RAISE EXCEPTION 'p_adjustments içinde geçerli stock_id bulunmalıdır.';
    END IF;

    IF v_stock_id = ANY(v_stock_ids) THEN
      RAISE EXCEPTION 'Aynı stock_id ( % ) istekte birden fazla kez bulunamaz.', v_stock_id;
    END IF;

    v_stock_ids := array_append(v_stock_ids, v_stock_id);
  END LOOP;

  -- 7. Lock target stock rows in ID order FOR UPDATE
  FOR v_stock IN
    SELECT *
    FROM public.finished_goods_stocks
    WHERE id = ANY(v_stock_ids)
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, false) = false
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    -- Group consistency validation
    IF NOT v_first_set THEN
      v_first_order_id := COALESCE(v_stock.order_id, '');
      v_first_order_item_id := COALESCE(v_stock.order_item_id, '');
      v_first_product_id := COALESCE(v_stock.product_id, '');
      v_first_lot_no := COALESCE(v_stock.lot_no, '');
      v_first_set := true;
    ELSE
      IF COALESCE(v_stock.order_id, '') <> v_first_order_id
         OR COALESCE(v_stock.order_item_id, '') <> v_first_order_item_id
         OR COALESCE(v_stock.product_id, '') <> v_first_product_id
         OR COALESCE(v_stock.lot_no, '') <> v_first_lot_no
      THEN
        RAISE EXCEPTION 'Toplu düzeltmedeki tüm stoklar aynı organizasyon, sipariş, sipariş kalemi, ürün ve lot grubuna ait olmalıdır.';
      END IF;
    END IF;
  END LOOP;

  -- Check if all requested stock IDs were found and locked
  IF array_length(v_stock_ids, 1) <> (
    SELECT COUNT(*) FROM public.finished_goods_stocks
    WHERE id = ANY(v_stock_ids) AND organization_id = v_org_id AND COALESCE(is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'İstenen stok kayıtlarından bazıları bulunamadı veya silinmiş.';
  END IF;

  -- 8. Apply adjustments one by one
  FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
  LOOP
    v_stock_id := COALESCE(v_adj->>'stock_id', v_adj->>'stockId');
    v_exp_prev := (COALESCE(v_adj->>'expected_previous_quantity', v_adj->>'expectedPreviousQuantity'))::numeric;
    v_new_rem := (COALESCE(v_adj->>'new_remaining', v_adj->>'newRemaining'))::numeric;

    IF v_exp_prev IS NULL THEN
      RAISE EXCEPTION 'Stok ( % ) için expected_previous_quantity belirtilmelidir.', v_stock_id;
    END IF;
    IF v_new_rem IS NULL THEN
      RAISE EXCEPTION 'Stok ( % ) için new_remaining belirtilmelidir.', v_stock_id;
    END IF;

    IF v_new_rem < 0 THEN
      RAISE EXCEPTION 'Kalan stok miktarı negatif olamaz (stock_id: % ).', v_stock_id;
    END IF;

    -- Fetch current stock row
    SELECT * INTO v_stock
    FROM public.finished_goods_stocks
    WHERE id = v_stock_id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, false) = false;

    v_curr_remaining := COALESCE(v_stock.quantity_remaining, 0);
    v_qty_produced := COALESCE(v_stock.quantity_produced, 0);

    -- Stale data check
    IF v_curr_remaining <> v_exp_prev THEN
      RAISE EXCEPTION 'Stale data hatası: Stok ( % ) miktarı değişmiş. Beklenen: %, Veritabanı: %',
        v_stock_id, v_exp_prev, v_curr_remaining;
    END IF;

    -- Upper bound check
    IF v_new_rem > v_qty_produced THEN
      RAISE EXCEPTION 'Yeni kalan miktar ( % ), üretilen miktardan ( % ) fazla olamaz (stock_id: % ).',
        v_new_rem, v_qty_produced, v_stock_id;
    END IF;

    v_diff := v_new_rem - v_curr_remaining;

    -- Only proceed if there is an actual change in quantity
    IF v_diff <> 0 THEN
      v_no_changes := false;
      v_adj_count := v_adj_count + 1;

      -- Check active shipment for this stock item
      SELECT COALESCE(SUM(quantity), 0)
      INTO v_active_shipment_qty
      FROM public.finished_goods_movements
      WHERE finished_goods_stock_id = v_stock.id
        AND organization_id = v_org_id
        AND COALESCE(is_deleted, false) = false
        AND COALESCE(is_shipment, false) = true
        AND movement_type = 'Sevkiyat çıkışı';

      -- Determine stock status
      IF v_new_rem > 0 AND v_active_shipment_qty = 0 THEN
        v_new_stock_status := 'Stokta';
      ELSIF v_new_rem > 0 AND v_active_shipment_qty > 0 THEN
        v_new_stock_status := 'Kısmi Sevk';
      ELSIF v_new_rem = 0 AND v_active_shipment_qty > 0 THEN
        v_new_stock_status := 'Sevk Edildi';
      ELSIF v_new_rem = 0 AND v_active_shipment_qty = 0 THEN
        v_new_stock_status := 'Fire';
      ELSE
        v_new_stock_status := v_stock.status;
      END IF;

      -- Update stock record (total_cost and quantity_produced are untouched)
      UPDATE public.finished_goods_stocks
      SET
        quantity_remaining = v_new_rem,
        status = v_new_stock_status,
        updated_at = NOW()
      WHERE id = v_stock.id
        AND organization_id = v_org_id;

      -- Generate movement ID
      v_fgm_id := public.freshops_id('fgm');

      -- Insert finished_goods_movements record
      INSERT INTO public.finished_goods_movements (
        id,
        organization_id,
        finished_goods_stock_id,
        production_run_id,
        product_id,
        customer_id,
        order_id,
        order_item_id,
        movement_type,
        quantity,
        unit,
        movement_date,
        previous_quantity,
        new_quantity,
        difference,
        lot_no,
        reason,
        note,
        is_shipment,
        is_deleted,
        is_demo,
        idempotency_key,
        created_at,
        updated_at
      )
      VALUES (
        v_fgm_id,
        v_org_id,
        v_stock.id,
        v_stock.production_run_id,
        v_stock.product_id,
        v_stock.customer_id,
        v_stock.order_id,
        v_stock.order_item_id,
        'Sayım Düzeltmesi',
        ABS(v_diff),
        COALESCE(v_stock.unit, 'adet'),
        p_movement_date,
        v_curr_remaining,
        v_new_rem,
        v_diff,
        v_stock.lot_no,
        v_reason_clean,
        COALESCE(p_note, 'Sayım Düzeltmesi: ' || v_reason_clean),
        FALSE,
        FALSE,
        COALESCE(v_stock.is_demo, FALSE),
        v_idem_key,
        NOW(),
        NOW()
      );

      v_created_movement_ids := array_append(v_created_movement_ids, v_fgm_id);

      IF v_stock.order_id IS NOT NULL AND NOT (v_stock.order_id = ANY(v_affected_order_ids)) THEN
        v_affected_order_ids := array_append(v_affected_order_ids, v_stock.order_id);
      END IF;
    END IF;
  END LOOP;

  -- 9. Recompute order status for affected orders
  IF array_length(v_affected_order_ids, 1) > 0 THEN
    FOREACH v_stock_id IN ARRAY v_affected_order_ids
    LOOP
      PERFORM public.recompute_order_status_atomic(v_stock_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyApplied', false,
    'noChanges', v_no_changes,
    'adjustmentCount', v_adj_count,
    'orderIds', COALESCE(v_affected_order_ids, ARRAY[]::text[]),
    'movementIds', COALESCE(v_created_movement_ids, ARRAY[]::text[])
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_finished_goods_stock_atomic(jsonb, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_finished_goods_stock_atomic(jsonb, text, date, text, text) TO authenticated, service_role;
