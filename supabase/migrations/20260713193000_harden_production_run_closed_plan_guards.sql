-- Migration: Harden production run closed plan guards
-- Date: 2026-07-13 19:30:00

--------------------------------------------------
-- 1. CREATE PRODUCTION RUN ATOMIC
--------------------------------------------------

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
  
  -- Extra variables for hardening
  v_production_plan_id text;
  v_remaining_quantity numeric;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- 1. Get the production plan ID without locking first
  SELECT production_plan_id
  INTO v_production_plan_id
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2. Lock the production plan FOR UPDATE (prevents deadlock with close_production_plan_and_carry_over_atomic)
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- 3. Check if the production plan is closed or locked
  IF COALESCE(v_plan.is_locked, false) = true
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, false) = true
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION
      'Bu üretim planı kapalı veya kilitli olduğu için yeni üretim girişi yapılamaz.';
  END IF;

  -- 4. Lock and reload the production plan item, validating it belongs to the locked plan
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND production_plan_id = v_plan.id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 5. Check if the production plan item is closed or locked
  IF COALESCE(v_ppi.is_locked, false) = true
     OR LOWER(TRIM(COALESCE(v_ppi.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION
      'Bu üretim planı kalemi kapalı veya kilitli olduğu için üretim girişi yapılamaz.';
  END IF;

  -- 6. Check remaining quantity to prevent excess production
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0)
    - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION
      'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- Rest of the creation flow (retained exactly)
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


--------------------------------------------------
-- 2. UNDO PRODUCTION RUN ATOMIC
--------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_production_run_atomic(
  p_production_run_id text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_run record;
  v_fgs record;
  v_plan_item record;
  v_reversal_stock_movement_ids jsonb := '[]'::jsonb;
  v_fgm_reversal_id text;
  v_new_produced_quantity numeric;
  v_realized_amount numeric := 0;
  v_order_status text;
  sm record;
  rm record;
  v_previous_stock numeric;
  v_new_stock numeric;
  v_stock_reversal_id text;
  
  -- Extra variable for hardening
  v_plan record;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  SELECT *
  INTO v_run
  FROM public.production_runs
  WHERE id = p_production_run_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production run not found or already reversed.';
  END IF;

  -- 2A. Lock the production plan FOR UPDATE and check if closed or locked
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_run.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  IF COALESCE(v_plan.is_locked, false) = true
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, false) = true
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION
      'Kapalı veya kilitli üretim planındaki üretim geri alınamaz.';
  END IF;

  -- Aktif sevkiyat varsa üretim geri alınamaz
  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_movements fgm
    WHERE fgm.production_run_id = v_run.id
      AND fgm.organization_id = v_org_id
      AND fgm.is_deleted = false
      AND fgm.is_shipment = true
      AND fgm.movement_type = 'Sevkiyat çıkışı'
  ) THEN
    RAISE EXCEPTION 'Production cannot be reversed while active shipments exist. Reverse shipments first.';
  END IF;

  SELECT *
  INTO v_fgs
  FROM public.finished_goods_stocks
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished goods stock for this production run not found.';
  END IF;

  IF COALESCE(v_fgs.quantity_remaining, 0) <> COALESCE(v_fgs.quantity_produced, 0) THEN
    RAISE EXCEPTION 'Finished goods stock is not fully available. Reverse all shipments before reversing production.';
  END IF;

  SELECT *
  INTO v_plan_item
  FROM public.production_plan_items
  WHERE id = v_run.production_plan_item_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2B. Check if the production plan item is closed or locked
  IF COALESCE(v_plan_item.is_locked, false) = true
     OR LOWER(TRIM(COALESCE(v_plan_item.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION
      'Kapalı veya kilitli üretim planı kalemindeki üretim geri alınamaz.';
  END IF;

  -- Hammadde tüketimlerini geri iade hareketiyle dengele (retained exactly)
  FOR sm IN
    SELECT *
    FROM public.stock_movements
    WHERE production_run_id = v_run.id
      AND organization_id = v_org_id
      AND is_deleted = false
      AND movement_type = 'Üretim Tüketimi'
    ORDER BY created_at ASC
  LOOP
    SELECT *
    INTO rm
    FROM public.raw_materials
    WHERE id = sm.raw_material_id
      AND organization_id = v_org_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Raw material not found for movement %', sm.id;
    END IF;

    v_previous_stock := COALESCE(rm.current_stock, 0);
    v_new_stock := v_previous_stock + COALESCE(sm.quantity, 0);
    v_stock_reversal_id := public.freshops_id('sm');

    INSERT INTO public.stock_movements (
      id,
      organization_id,
      raw_material_id,
      movement_type,
      quantity,
      unit,
      movement_date,
      previous_stock,
      new_stock,
      difference,
      production_run_id,
      order_id,
      order_item_id,
      source_type,
      source_id,
      note,
      is_deleted,
      is_demo
    )
    VALUES (
      v_stock_reversal_id,
      v_org_id,
      sm.raw_material_id,
      'Üretim Geri Alma',
      sm.quantity,
      sm.unit,
      CURRENT_DATE,
      v_previous_stock,
      v_new_stock,
      sm.quantity,
      v_run.id,
      v_run.order_id,
      v_run.order_item_id,
      'production_run_reversal',
      v_run.id,
      COALESCE(p_reason, 'Üretim geri alındı'),
      false,
      false
    );

    v_reversal_stock_movement_ids :=
      v_reversal_stock_movement_ids || to_jsonb(v_stock_reversal_id);
  END LOOP;

  -- Mamul stoktan üretimi geri al
  v_fgm_reversal_id := public.freshops_id('fgm');

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
    is_demo
  )
  VALUES (
    v_fgm_reversal_id,
    v_org_id,
    v_fgs.id,
    v_run.id,
    v_run.product_id,
    v_run.customer_id,
    v_run.order_id,
    v_run.order_item_id,
    'Üretim Geri Alma',
    v_fgs.quantity_remaining,
    v_fgs.unit,
    CURRENT_DATE,
    v_fgs.quantity_remaining,
    0,
    -v_fgs.quantity_remaining,
    v_fgs.lot_no,
    'Üretim geri alma',
    COALESCE(p_reason, 'Üretim geri alındı'),
    false,
    false,
    false
  );

  UPDATE public.finished_goods_stocks
  SET
    quantity_remaining = 0,
    is_deleted = true,
    deleted_at = now(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = now()
  WHERE id = v_fgs.id;

  UPDATE public.production_runs
  SET
    status = 'Üretim Geri Alındı',
    raw_materials_deducted = false,
    finished_goods_created = false,
    is_deleted = true,
    deleted_at = now(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = now()
  WHERE id = v_run.id;

  v_new_produced_quantity := GREATEST(
    COALESCE(v_plan_item.produced_quantity, 0)
    - COALESCE(v_run.produced_quantity, 0),
    0
  );

  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_produced_quantity,
    status = CASE
      WHEN v_new_produced_quantity <= 0 THEN 'Planlandı'
      WHEN v_new_produced_quantity < planned_quantity THEN 'Kısmi Üretildi'
      ELSE 'Tamamlandı'
    END,
    raw_materials_deducted = false,
    deducted_at = NULL,
    deduction_movement_ids = NULL,
    finished_goods_created = false,
    finished_goods_stock_id = NULL,
    updated_at = now()
  WHERE id = v_plan_item.id;

  UPDATE public.production_plans pp
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = false
          AND COALESCE(ppi.produced_quantity, 0) > 0
      ) THEN 'Planlandı'
      WHEN EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = false
          AND COALESCE(ppi.produced_quantity, 0)
            < COALESCE(ppi.planned_quantity, 0)
      ) THEN 'Kısmi Üretildi'
      ELSE 'Tamamlandı'
    END,
    completed_at = NULL,
    closed_at = NULL,
    closed_with_shortage = false,
    updated_at = now()
  WHERE pp.id = v_run.production_plan_id
    AND pp.organization_id = v_org_id;

  -- Sipariş tutarı aktif sevkiyata göre tekrar hesaplanır
  SELECT COALESCE(SUM(fgm.quantity * oi.unit_sale_price), 0)
  INTO v_realized_amount
  FROM public.finished_goods_movements fgm
  JOIN public.order_items oi
    ON oi.id = fgm.order_item_id
  WHERE fgm.order_id = v_run.order_id
    AND fgm.organization_id = v_org_id
    AND fgm.is_shipment = true
    AND fgm.is_deleted = false
    AND fgm.movement_type = 'Sevkiyat çıkışı'
    AND oi.is_deleted = false;

  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_stocks fgs
    WHERE fgs.order_id = v_run.order_id
      AND fgs.organization_id = v_org_id
      AND fgs.is_deleted = false
      AND COALESCE(fgs.quantity_remaining, 0) > 0
  ) THEN
    v_order_status := 'Sevkiyata Hazır';
  ELSIF EXISTS (
    SELECT 1
    FROM public.production_plan_items ppi
    WHERE ppi.order_id = v_run.order_id
      AND ppi.organization_id = v_org_id
      AND ppi.is_deleted = false
  ) THEN
    v_order_status := 'Üretim Planlandı';
  ELSE
    v_order_status := 'Onaylandı';
  END IF;

  UPDATE public.orders
  SET
    realized_amount = v_realized_amount,
    status = v_order_status,
    computed_status = v_order_status,
    updated_at = now()
  WHERE id = v_run.order_id
    AND organization_id = v_org_id;

  -- Güvenli son stok düzeltmesi
  PERFORM public.recalculate_raw_material_stocks();

  RETURN jsonb_build_object(
    'productionRunId', v_run.id,
    'finishedGoodsStockId', v_fgs.id,
    'finishedGoodsReversalMovementId', v_fgm_reversal_id,
    'rawMaterialReversalMovementIds', v_reversal_stock_movement_ids,
    'newProducedQuantity', v_new_produced_quantity,
    'orderStatus', v_order_status,
    'realizedAmount', v_realized_amount
  );
END;
$function$;


--------------------------------------------------
-- 3. YETKİLER
--------------------------------------------------

REVOKE ALL ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
TO authenticated, service_role;
