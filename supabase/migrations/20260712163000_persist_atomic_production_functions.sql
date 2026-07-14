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

  v_ordered_quantity numeric := 0;
  v_produced_quantity numeric := 0;
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
   * Kullanıcı tarafından yönetilen özel durumları koru.
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

  /*
   * Sevkiyat durumları en yüksek önceliğe sahiptir.
   */
  ELSIF COALESCE(v_order.realized_amount, 0) > 0
    AND COALESCE(v_order.realized_amount, 0)
      < COALESCE(v_order.total_amount, 0)
  THEN
    v_new_status := 'Kısmi Sevk';

  ELSIF COALESCE(v_order.total_amount, 0) > 0
    AND COALESCE(v_order.realized_amount, 0)
      >= COALESCE(v_order.total_amount, 0)
  THEN
    v_new_status := 'Sevk Edildi';

  ELSE
    /*
     * Siparişin toplam miktarını aktif sipariş kalemlerinden hesapla.
     */
    SELECT COALESCE(
      SUM(GREATEST(COALESCE(oi.quantity, 0), 0)),
      0
    )
    INTO v_ordered_quantity
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
      AND oi.organization_id = v_org_id
      AND COALESCE(oi.is_deleted, false) = false;

    /*
     * Gerçekleşen üretimi aktif üretim kayıtlarından hesapla.
     * Geri alınan üretim kayıtları is_deleted=true olduğu için dahil edilmez.
     */
    SELECT COALESCE(
      SUM(GREATEST(COALESCE(pr.produced_quantity, 0), 0)),
      0
    )
    INTO v_produced_quantity
    FROM public.production_runs pr
    WHERE pr.order_id = v_order.id
      AND pr.organization_id = v_org_id
      AND COALESCE(pr.is_deleted, false) = false
      AND COALESCE(pr.status, '') <> 'Üretim Geri Alındı';

    IF v_ordered_quantity > 0
      AND v_produced_quantity >= v_ordered_quantity
    THEN
      v_new_status := 'Sevkiyata Hazır';

    ELSIF v_produced_quantity > 0 THEN
      v_new_status := 'Üretimde';

    ELSE
      /*
       * Yalnızca açık bir plandaki aktif kalem siparişi
       * Üretim Planlandı durumuna getirir.
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
      )
      INTO v_has_active_plan_item;

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
    updated_at = now()
  WHERE id = v_order.id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', v_new_status,
    'orderedQuantity', v_ordered_quantity,
    'producedQuantity', v_produced_quantity,
    'realizedAmount', COALESCE(v_order.realized_amount, 0),
    'totalAmount', COALESCE(v_order.total_amount, 0)
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.add_order_item_to_production_plan_atomic(
  p_production_plan_id text,
  p_order_id text,
  p_order_item_id text,
  p_product_id text,
  p_planned_quantity numeric,
  p_unit text DEFAULT 'adet'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_plan_status TEXT;
  v_is_locked BOOLEAN;
  v_closed_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_closed_with_shortage BOOLEAN;

  v_customer_id TEXT;
  v_existing_id TEXT;
  v_existing_is_deleted BOOLEAN;
  v_new_item_id TEXT;
BEGIN
  /*
   * p_unit eski frontend/RPC imzasıyla uyumluluk için korunur.
   * production_plan_items tablosunda unit kolonu olmadığı için kullanılmaz.
   */

  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Aktif organizasyon bulunamadı.'
    );
  END IF;

  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Planlanan miktar 0’dan büyük olmalıdır.'
    );
  END IF;

  /*
   * Planı transaction boyunca kilitle.
   * Plan kapatma ile plana kalem ekleme aynı anda çalışamaz.
   */
  SELECT
    status,
    COALESCE(is_locked, FALSE),
    closed_at,
    completed_at,
    COALESCE(closed_with_shortage, FALSE)
  INTO
    v_plan_status,
    v_is_locked,
    v_closed_at,
    v_completed_at,
    v_closed_with_shortage
  FROM public.production_plans
  WHERE id = p_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Üretim planı bulunamadı veya erişim yetkisi yok.'
    );
  END IF;

  IF v_is_locked = TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu üretim planı kilitli olduğu için yeni kalem eklenemez.'
    );
  END IF;

  IF v_closed_at IS NOT NULL
     OR v_completed_at IS NOT NULL
     OR v_closed_with_shortage = TRUE
     OR LOWER(TRIM(COALESCE(v_plan_status, ''))) IN (
       'tamamlandı',
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'completed',
       'cancelled'
     )
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu üretim planı kapalı veya tamamlanmış olduğu için yeni kalem eklenemez.'
    );
  END IF;

  /*
   * Sipariş aynı organizasyona ait olmalı.
   */
  SELECT customer_id
  INTO v_customer_id
  FROM public.orders
  WHERE id = p_order_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sipariş bulunamadı veya erişim yetkisi yok.'
    );
  END IF;

  /*
   * Sipariş kalemi verilen sipariş ve ürünle eşleşmeli.
   */
  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items
    WHERE id = p_order_item_id
      AND order_id = p_order_id
      AND product_id = p_product_id
      AND COALESCE(is_deleted, FALSE) = FALSE
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sipariş kalemi bulunamadı veya siparişle eşleşmiyor.'
    );
  END IF;

  /*
   * Aynı sipariş kalemini tekrar oluşturma.
   * Bulunan satırı transaction boyunca kilitle.
   */
  SELECT
    id,
    COALESCE(is_deleted, FALSE)
  INTO
    v_existing_id,
    v_existing_is_deleted
  FROM public.production_plan_items
  WHERE organization_id = v_org_id
    AND production_plan_id = p_production_plan_id
    AND order_item_id = p_order_item_id
  ORDER BY
    COALESCE(is_deleted, FALSE) ASC,
    created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_is_deleted = TRUE THEN
      UPDATE public.production_plan_items
      SET
        is_deleted = FALSE,
        deleted_at = NULL,
        deleted_reason = NULL,
        planned_quantity = p_planned_quantity,
        produced_quantity = 0,
        status = 'Planlandı',
        updated_at = NOW()
      WHERE id = v_existing_id
        AND organization_id = v_org_id;

      PERFORM public.recompute_order_status_atomic(p_order_id);

      RETURN json_build_object(
        'success', true,
        'id', v_existing_id,
        'inserted', false,
        'reactivated', true,
        'message', 'Silinmiş plan kalemi yeniden aktif edildi.'
      );
    END IF;

    PERFORM public.recompute_order_status_atomic(p_order_id);

    RETURN json_build_object(
      'success', true,
      'id', v_existing_id,
      'inserted', false,
      'reactivated', false,
      'message', 'Bu sipariş kalemi zaten bu plana ekli. Tekrar işlem yapılmadı.'
    );
  END IF;

  /*
   * Yeni plan kalemi oluştur.
   * unit kolonu gerçek tabloda bulunmadığı için INSERT listesinde yoktur.
   */
  v_new_item_id :=
    'pi_' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10);

  INSERT INTO public.production_plan_items (
    id,
    organization_id,
    production_plan_id,
    order_id,
    order_item_id,
    customer_id,
    product_id,
    planned_quantity,
    produced_quantity,
    status,
    is_deleted,
    created_at,
    updated_at
  )
  VALUES (
    v_new_item_id,
    v_org_id,
    p_production_plan_id,
    p_order_id,
    p_order_item_id,
    v_customer_id,
    p_product_id,
    p_planned_quantity,
    0,
    'Planlandı',
    FALSE,
    NOW(),
    NOW()
  );

  PERFORM public.recompute_order_status_atomic(p_order_id);

  RETURN json_build_object(
    'success', true,
    'id', v_new_item_id,
    'inserted', true,
    'reactivated', false,
    'message', 'Sipariş kalemi üretim planına eklendi.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_production_run_atomic(
  p_production_plan_item_id text,
  p_produced_quantity numeric,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_ppi record;
  v_plan record;
  v_product record;
  v_cs record;

  v_run_id text;
  v_fgs_id text;
  v_fgm_id text;
  v_sm_id text;

  v_lot_date date;
  v_lot_no text;
  v_lot_offset integer := 0;

  v_material_total numeric := 0;
  v_labor_cost numeric := 0;
  v_overhead_cost numeric := 0;
  v_unit_cost numeric := 0;
  v_total_cost numeric := 0;

  v_recipe record;
  v_net_qty numeric;
  v_gross_qty numeric;
  v_waste_rate numeric;
  v_unit_price numeric;
  v_new_plan_item_produced numeric;

  v_movement_ids jsonb := '[]'::jsonb;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_ppi.production_plan_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_ppi.product_id
    AND organization_id = v_org_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  SELECT *
  INTO v_cs
  FROM public.cost_settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF FOUND THEN
    v_lot_offset := COALESCE(v_cs.lot_date_offset_days, 0);
    v_labor_cost := COALESCE(v_cs.labor_cost_per_package, 0);
    v_overhead_cost := COALESCE(v_cs.overhead_cost_per_package, 0);
  ELSE
    v_lot_offset := 0;
    v_labor_cost := 0;
    v_overhead_cost := 0;
  END IF;

  v_lot_date := v_plan.production_date + v_lot_offset;
  v_lot_no := COALESCE(NULLIF(v_product.lot_prefix, ''), upper(substr(v_product.name, 1, 3)))
              || '-' || to_char(v_lot_date, 'DDMMYY');

  v_run_id := public.freshops_id('run');

  INSERT INTO public.production_runs (
    id,
    organization_id,
    production_plan_id,
    production_plan_item_id,
    order_id,
    order_item_id,
    customer_id,
    product_id,
    production_date,
    produced_quantity,
    waste_quantity,
    unit,
    status,
    lot_no,
    lot_date,
    lot_date_offset_days,
    unit_cost,
    total_cost,
    raw_materials_deducted,
    raw_material_movement_ids,
    finished_goods_created,
    note,
    is_deleted,
    is_demo
  )
  VALUES (
    v_run_id,
    v_org_id,
    v_ppi.production_plan_id,
    v_ppi.id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    v_ppi.customer_id,
    v_ppi.product_id,
    v_plan.production_date,
    p_produced_quantity,
    0,
    'adet',
    'Tamamlandı',
    v_lot_no,
    v_lot_date,
    v_lot_offset,
    0,
    0,
    false,
    '[]'::jsonb,
    false,
    p_note,
    false,
    false
  );

  FOR v_recipe IN
    SELECT
      pr.raw_material_id,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit,
      rm.average_cost,
      rm.purchase_price
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON rm.id = pr.raw_material_id
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = false
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = false
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);

    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));
    v_unit_price := COALESCE(NULLIF(v_recipe.average_cost, 0), v_recipe.purchase_price, 0);

    INSERT INTO public.stock_movements (
      id,
      organization_id,
      raw_material_id,
      movement_type,
      quantity,
      unit,
      unit_price,
      movement_date,
      production_run_id,
      production_plan_id,
      production_plan_item_id,
      order_id,
      order_item_id,
      product_id,
      note,
      is_deleted,
      is_demo
    )
    VALUES (
      public.freshops_id('sm'),
      v_org_id,
      v_recipe.raw_material_id,
      'Üretim Tüketimi',
      v_gross_qty,
      v_recipe.raw_unit,
      v_unit_price,
      v_plan.production_date,
      v_run_id,
      v_ppi.production_plan_id,
      v_ppi.id,
      v_ppi.order_id,
      v_ppi.order_item_id,
      v_ppi.product_id,
      'Üretim tüketimi - Run: ' || v_run_id || ', Lot: ' || v_lot_no,
      false,
      false
    )
    RETURNING id INTO v_sm_id;

    v_movement_ids := v_movement_ids || to_jsonb(v_sm_id);
    v_material_total := v_material_total + (v_gross_qty * v_unit_price);
  END LOOP;

  v_total_cost := v_material_total + (p_produced_quantity * (v_labor_cost + v_overhead_cost));

  IF p_produced_quantity > 0 THEN
    v_unit_cost := v_total_cost / p_produced_quantity;
  ELSE
    v_unit_cost := 0;
  END IF;

  v_fgs_id := public.freshops_id('fgs');

  INSERT INTO public.finished_goods_stocks (
    id,
    organization_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    production_plan_id,
    production_plan_item_id,
    production_run_id,
    production_date,
    delivery_date,
    lot_no,
    lot_date,
    lot_date_offset_days,
    quantity_produced,
    quantity_remaining,
    unit,
    status,
    unit_cost,
    total_cost,
    note,
    is_deleted,
    is_demo
  )
  VALUES (
    v_fgs_id,
    v_org_id,
    v_ppi.product_id,
    v_ppi.customer_id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    v_ppi.production_plan_id,
    v_ppi.id,
    v_run_id,
    v_plan.production_date,
    (SELECT delivery_date FROM public.orders WHERE id = v_ppi.order_id),
    v_lot_no,
    v_lot_date,
    v_lot_offset,
    p_produced_quantity,
    p_produced_quantity,
    'adet',
    'Stokta',
    v_unit_cost,
    v_total_cost,
    'Üretim girişi - Run: ' || v_run_id,
    false,
    false
  );

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
    note,
    is_shipment,
    is_deleted,
    is_demo
  )
  VALUES (
    public.freshops_id('fgm'),
    v_org_id,
    v_fgs_id,
    v_run_id,
    v_ppi.product_id,
    v_ppi.customer_id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    'Üretim girişi',
    p_produced_quantity,
    'adet',
    v_plan.production_date,
    0,
    p_produced_quantity,
    p_produced_quantity,
    v_lot_no,
    'Üretim girişi - Run: ' || v_run_id,
    false,
    false,
    false
  )
  RETURNING id INTO v_fgm_id;

  v_new_plan_item_produced := COALESCE(v_ppi.produced_quantity, 0) + p_produced_quantity;

  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_plan_item_produced,
    status = CASE
      WHEN v_new_plan_item_produced >= planned_quantity THEN 'Tamamlandı'
      ELSE 'Kısmi Üretildi'
    END,
    raw_materials_deducted = true,
    deducted_at = now(),
    deduction_movement_ids = v_movement_ids,
    finished_goods_created = true,
    finished_goods_stock_id = v_fgs_id,
    estimated_total_cost = v_total_cost,
    unit_cost = v_unit_cost,
    updated_at = now()
  WHERE id = v_ppi.id;

  UPDATE public.production_runs
  SET
    unit_cost = v_unit_cost,
    total_cost = v_total_cost,
    raw_materials_deducted = true,
    raw_material_movement_ids = v_movement_ids,
    finished_goods_created = true,
    finished_goods_stock_id = v_fgs_id,
    updated_at = now()
  WHERE id = v_run_id;

  UPDATE public.production_plans
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = v_plan.id
          AND is_deleted = false
          AND produced_quantity < planned_quantity
      )
      THEN 'Tamamlandı'
      ELSE 'Planlandı'
    END,
    updated_at = now()
  WHERE id = v_plan.id;

  PERFORM public.recompute_order_status_atomic(v_ppi.order_id);

  RETURN jsonb_build_object(
    'productionRunId', v_run_id,
    'finishedGoodsStockId', v_fgs_id,
    'lotNo', v_lot_no,
    'producedQuantity', p_produced_quantity,
    'unitCost', v_unit_cost,
    'totalCost', v_total_cost,
    'rawMaterialMovementIds', v_movement_ids
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.recompute_order_status_atomic(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.recompute_order_status_atomic(TEXT)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.add_order_item_to_production_plan_atomic(
    TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT
  )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.add_order_item_to_production_plan_atomic(
    TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT
  )
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
TO authenticated, service_role;
