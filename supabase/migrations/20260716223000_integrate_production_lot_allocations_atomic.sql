-- ============================================================================
-- FreshOps Integrate Production Lot Allocations Atomic Migration (Phase 1B)
-- ============================================================================

-- 1. Create the new main production atomic function supporting lot allocations
CREATE OR REPLACE FUNCTION public.create_production_run_with_lots_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC,
  p_note TEXT,
  p_lot_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_ppi RECORD;
  v_plan RECORD;
  v_product RECORD;
  v_cs RECORD;

  v_run_id TEXT;
  v_fgs_id TEXT;
  v_fgm_id TEXT;
  v_sm_id TEXT;

  v_lot_date DATE;
  v_lot_no TEXT;
  v_lot_offset INTEGER := 0;

  v_material_total NUMERIC := 0;
  v_labor_cost NUMERIC := 0;
  v_overhead_cost NUMERIC := 0;
  v_unit_cost NUMERIC := 0;
  v_total_cost NUMERIC := 0;

  v_recipe RECORD;
  v_net_qty NUMERIC;
  v_gross_qty NUMERIC;
  v_waste_rate NUMERIC;
  v_unit_price NUMERIC;
  v_new_plan_item_produced NUMERIC;

  v_movement_ids JSONB := '[]'::JSONB;
  
  v_production_plan_id TEXT;
  v_remaining_quantity NUMERIC;

  -- Phase 1B variables
  v_use_manual BOOLEAN := FALSE;
  v_allocations_json_array JSONB := '[]'::JSONB;
  v_alloc_id TEXT;
  v_remaining_needed NUMERIC;
  v_total_available_lot_qty NUMERIC;
  v_allocated NUMERIC;
  v_manual_allocated_sum NUMERIC;
  v_loop_processed_sum NUMERIC;
  v_invalid_rm_count INTEGER;
  v_rm_id TEXT;
  r_lot RECORD;
BEGIN
  -- Authenticate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Validate Produced Quantity
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- 1. Get the production plan ID without locking first
  SELECT production_plan_id
  INTO v_production_plan_id
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2. Lock the production plan FOR UPDATE
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- 3. Check if the production plan is closed or locked
  IF COALESCE(v_plan.is_locked, FALSE) = TRUE
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kapalı veya kilitli olduğu için yeni üretim girişi yapılamaz.';
  END IF;

  -- 4. Lock and reload the production plan item
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND production_plan_id = v_plan.id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 5. Check if the production plan item is closed or locked
  IF COALESCE(v_ppi.is_locked, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_ppi.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kalemi kapalı veya kilitli olduğu için üretim girişi yapılamaz.';
  END IF;

  -- 6. Check remaining quantity to prevent excess production
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0) - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION 'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- 7. Validate and parse lot allocations if manual selection is active
  IF p_lot_allocations IS NOT NULL AND jsonb_array_length(p_lot_allocations) > 0 THEN
    v_use_manual := TRUE;

    IF jsonb_typeof(p_lot_allocations) <> 'array' THEN
      RAISE EXCEPTION 'p_lot_allocations must be a JSON array.';
    END IF;

    -- Validate that each element is an object with valid fields
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_lot_allocations) elem
      WHERE jsonb_typeof(elem) <> 'object'
    ) THEN
      RAISE EXCEPTION 'Her lot allocation girdisi bir JSON objesi olmalıdır.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_lot_allocations) elem
      WHERE elem->>'rawMaterialId' IS NULL 
         OR TRIM(elem->>'rawMaterialId') = ''
         OR elem->>'rawMaterialLotId' IS NULL 
         OR TRIM(elem->>'rawMaterialLotId') = ''
         OR elem->>'quantity' IS NULL
         OR (elem->>'quantity')::NUMERIC <= 0
    ) THEN
      RAISE EXCEPTION 'Lot allocation girdileri geçerli rawMaterialId, rawMaterialLotId ve sıfırdan büyük quantity içermelidir.';
    END IF;

    -- Check for duplicate rawMaterialId + rawMaterialLotId
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_lot_allocations) elem
      GROUP BY elem->>'rawMaterialId', elem->>'rawMaterialLotId'
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'Aynı hammadde ve lot çifti birden fazla kez gönderilemez.';
    END IF;

    -- Check if any raw material in input is NOT in product's active recipe
    SELECT COUNT(*)
    INTO v_invalid_rm_count
    FROM (
      SELECT DISTINCT elem->>'rawMaterialId' AS rm_id
      FROM jsonb_array_elements(p_lot_allocations) elem
    ) p
    LEFT JOIN public.product_recipes pr ON pr.raw_material_id = p.rm_id
      AND pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
    WHERE pr.raw_material_id IS NULL;

    IF v_invalid_rm_count > 0 THEN
      RAISE EXCEPTION 'Reçetede bulunmayan hammadde lot allocation girdisi tespit edildi.';
    END IF;
  END IF;

  -- 8. Advisory locking of recipe raw materials in deterministic ascending order of ID
  FOR v_rm_id IN
    SELECT DISTINCT pr.raw_material_id
    FROM public.product_recipes pr
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
    ORDER BY pr.raw_material_id ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_org_id::TEXT || ':raw-material-lot:' || v_rm_id,
        0
      )
    );
  END LOOP;

  -- Get Product Settings & Cost Details
  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_ppi.product_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

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
  v_lot_no := COALESCE(NULLIF(v_product.lot_prefix, ''), UPPER(SUBSTR(v_product.name, 1, 3)))
              || '-' || TO_CHAR(v_lot_date, 'DDMMYY');

  v_run_id := public.freshops_id('run');

  -- Insert core production run record (raw_materials_deducted will be false initially, updated after lot allocations)
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
    FALSE,
    '[]'::JSONB,
    FALSE,
    p_note,
    FALSE,
    FALSE
  );

  -- 9. Iterate recipe requirements & allocate raw material lots
  FOR v_recipe IN
    SELECT
      pr.raw_material_id,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit,
      rm.average_cost,
      rm.purchase_price,
      rm.name AS raw_material_name
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON rm.id = pr.raw_material_id
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = FALSE
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);

    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    -- Standard unit conversion
    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));
    v_unit_price := COALESCE(NULLIF(v_recipe.average_cost, 0), v_recipe.purchase_price, 0);

    -- Create single aggregate Stock Movement row for 'Üretim Tüketimi'
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
      FALSE,
      FALSE
    )
    RETURNING id INTO v_sm_id;

    v_movement_ids := v_movement_ids || TO_JSONB(v_sm_id);
    v_material_total := v_material_total + (v_gross_qty * v_unit_price);

    -- Lot allocations
    IF v_use_manual THEN
      -- Manual Selection Mode
      SELECT COALESCE(SUM((elem->>'quantity')::NUMERIC), 0)
      INTO v_manual_allocated_sum
      FROM jsonb_array_elements(p_lot_allocations) elem
      WHERE elem->>'rawMaterialId' = v_recipe.raw_material_id;

      IF ABS(v_manual_allocated_sum - v_gross_qty) > 0.000000001 THEN
        RAISE EXCEPTION 'Manuel lot miktar toplamı reçete brüt ihtiyacı ile eşleşmiyor. Hammadde: %, Gereken: %, Manuel Toplam: %',
          v_recipe.raw_material_name, v_gross_qty, v_manual_allocated_sum;
      END IF;

      v_loop_processed_sum := 0;

      FOR r_lot IN
        SELECT 
          rml.id AS lot_id,
          rml.internal_lot_no,
          rml.quantity_remaining,
          rml.kunye_number,
          rml.kunye_status,
          m.qty AS manual_qty
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        JOIN (
          SELECT 
            (elem->>'rawMaterialLotId') AS lot_id,
            (elem->>'quantity')::NUMERIC AS qty
          FROM jsonb_array_elements(p_lot_allocations) AS elem
          WHERE (elem->>'rawMaterialId') = v_recipe.raw_material_id
        ) m ON m.lot_id = rml.id
        WHERE rml.raw_material_id = v_recipe.raw_material_id
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
        ORDER BY 
          rmr.receipt_date ASC,
          rml.created_at ASC,
          rml.id ASC
        FOR UPDATE OF rml
      LOOP
        -- Check lot limits
        IF r_lot.quantity_remaining < r_lot.manual_qty THEN
          SELECT COALESCE(SUM(quantity_remaining), 0)
          INTO v_total_available_lot_qty
          FROM public.raw_material_lots
          WHERE raw_material_id = v_recipe.raw_material_id
            AND organization_id = v_org_id
            AND is_deleted = FALSE;

          RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
            v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
        END IF;

        -- Deduct from lot
        UPDATE public.raw_material_lots
        SET
          quantity_remaining = quantity_remaining - r_lot.manual_qty,
          updated_at = NOW()
        WHERE id = r_lot.lot_id
          AND organization_id = v_org_id
          AND quantity_remaining >= r_lot.manual_qty;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Lot güncellemesi başarısız oldu. Lot ID: %', r_lot.lot_id;
        END IF;

        -- Create allocation entry
        v_alloc_id := public.freshops_id('prla');
        INSERT INTO public.production_run_raw_material_lot_allocations (
          id,
          organization_id,
          production_run_id,
          production_plan_id,
          production_plan_item_id,
          order_id,
          order_item_id,
          product_id,
          raw_material_id,
          raw_material_lot_id,
          stock_movement_id,
          quantity_consumed,
          unit,
          allocation_method,
          is_reversed,
          reversed_at,
          reversal_reason,
          created_at,
          updated_at
        )
        VALUES (
          v_alloc_id,
          v_org_id,
          v_run_id,
          v_ppi.production_plan_id,
          v_ppi.id,
          v_ppi.order_id,
          v_ppi.order_item_id,
          v_ppi.product_id,
          v_recipe.raw_material_id,
          r_lot.lot_id,
          v_sm_id,
          r_lot.manual_qty,
          v_recipe.raw_unit,
          'manual',
          FALSE,
          NULL,
          NULL,
          NOW(),
          NOW()
        );

        -- Add to output list
        v_allocations_json_array := v_allocations_json_array || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT(
            'allocationId', v_alloc_id,
            'rawMaterialId', v_recipe.raw_material_id,
            'rawMaterialLotId', r_lot.lot_id,
            'internalLotNo', r_lot.internal_lot_no,
            'kunyeNumber', r_lot.kunye_number,
            'allocatedQuantity', r_lot.manual_qty,
            'unit', v_recipe.raw_unit,
            'allocationMethod', 'manual'
          )
        );

        v_loop_processed_sum := v_loop_processed_sum + r_lot.manual_qty;
      END LOOP;

      -- Check if we successfully fulfilled the amount
      IF ABS(v_loop_processed_sum - v_gross_qty) > 0.000000001 THEN
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_total_available_lot_qty
        FROM public.raw_material_lots
        WHERE raw_material_id = v_recipe.raw_material_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE;

        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

    ELSE
      -- FIFO Mode
      v_remaining_needed := v_gross_qty;

      SELECT COALESCE(SUM(rml.quantity_remaining), 0)
      INTO v_total_available_lot_qty
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
      WHERE rml.raw_material_id = v_recipe.raw_material_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rml.quantity_remaining > 0
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE;

      IF v_total_available_lot_qty < v_gross_qty THEN
        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

      FOR r_lot IN
        SELECT 
          rml.id AS lot_id,
          rml.internal_lot_no,
          rml.quantity_remaining,
          rml.kunye_number,
          rml.kunye_status
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        WHERE rml.raw_material_id = v_recipe.raw_material_id
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rml.quantity_remaining > 0
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
        ORDER BY 
          rmr.receipt_date ASC,
          rml.created_at ASC,
          rml.id ASC
        FOR UPDATE OF rml
      LOOP
        IF v_remaining_needed <= 0 THEN
          EXIT;
        END IF;

        v_allocated := LEAST(r_lot.quantity_remaining, v_remaining_needed);

        UPDATE public.raw_material_lots
        SET
          quantity_remaining = quantity_remaining - v_allocated,
          updated_at = NOW()
        WHERE id = r_lot.lot_id
          AND organization_id = v_org_id
          AND quantity_remaining >= v_allocated;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Lot güncellemesi başarısız oldu. Lot ID: %', r_lot.lot_id;
        END IF;

        -- Create allocation entry
        v_alloc_id := public.freshops_id('prla');
        INSERT INTO public.production_run_raw_material_lot_allocations (
          id,
          organization_id,
          production_run_id,
          production_plan_id,
          production_plan_item_id,
          order_id,
          order_item_id,
          product_id,
          raw_material_id,
          raw_material_lot_id,
          stock_movement_id,
          quantity_consumed,
          unit,
          allocation_method,
          is_reversed,
          reversed_at,
          reversal_reason,
          created_at,
          updated_at
        )
        VALUES (
          v_alloc_id,
          v_org_id,
          v_run_id,
          v_ppi.production_plan_id,
          v_ppi.id,
          v_ppi.order_id,
          v_ppi.order_item_id,
          v_ppi.product_id,
          v_recipe.raw_material_id,
          r_lot.lot_id,
          v_sm_id,
          v_allocated,
          v_recipe.raw_unit,
          'fifo',
          FALSE,
          NULL,
          NULL,
          NOW(),
          NOW()
        );

        -- Add to output list
        v_allocations_json_array := v_allocations_json_array || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT(
            'allocationId', v_alloc_id,
            'rawMaterialId', v_recipe.raw_material_id,
            'rawMaterialLotId', r_lot.lot_id,
            'internalLotNo', r_lot.internal_lot_no,
            'kunyeNumber', r_lot.kunye_number,
            'allocatedQuantity', v_allocated,
            'unit', v_recipe.raw_unit,
            'allocationMethod', 'fifo'
          )
        );

        v_remaining_needed := v_remaining_needed - v_allocated;
      END LOOP;

      IF v_remaining_needed > 0 THEN
        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

    END IF;
  END LOOP;

  -- 10. Core Cost Calculations & Inserting Finished Goods Stocks/Movements
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
    FALSE,
    FALSE
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
    FALSE,
    FALSE,
    FALSE
  )
  RETURNING id INTO v_fgm_id;

  v_new_plan_item_produced := COALESCE(v_ppi.produced_quantity, 0) + p_produced_quantity;

  -- 11. Update Production Plan Items & Production Run & Plan Statuses
  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_plan_item_produced,
    status = CASE
      WHEN v_new_plan_item_produced >= planned_quantity THEN 'Tamamlandı'
      ELSE 'Kısmi Üretildi'
    END,
    raw_materials_deducted = TRUE,
    deducted_at = NOW(),
    deduction_movement_ids = v_movement_ids,
    finished_goods_created = TRUE,
    finished_goods_stock_id = v_fgs_id,
    estimated_total_cost = v_total_cost,
    unit_cost = v_unit_cost,
    updated_at = NOW()
  WHERE id = v_ppi.id;

  UPDATE public.production_runs
  SET
    unit_cost = v_unit_cost,
    total_cost = v_total_cost,
    raw_materials_deducted = TRUE,
    raw_material_movement_ids = v_movement_ids,
    finished_goods_created = TRUE,
    finished_goods_stock_id = v_fgs_id,
    updated_at = NOW()
  WHERE id = v_run_id;

  UPDATE public.production_plans
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = v_plan.id
          AND is_deleted = FALSE
          AND produced_quantity < planned_quantity
      )
      THEN 'Tamamlandı'
      ELSE 'Planlandı'
    END,
    updated_at = NOW()
  WHERE id = v_plan.id;

  -- Recompute Order status
  PERFORM public.recompute_order_status_atomic(v_ppi.order_id);

  RETURN JSONB_BUILD_OBJECT(
    'productionRunId', v_run_id,
    'finishedGoodsStockId', v_fgs_id,
    'lotNo', v_lot_no,
    'producedQuantity', p_produced_quantity,
    'unitCost', v_unit_cost,
    'totalCost', v_total_cost,
    'rawMaterialMovementIds', v_movement_ids,
    'rawMaterialLotAllocations', v_allocations_json_array
  );
END;
$$;


-- 2. Legacy RPC compatibility wrapper: delegating to the lot allocations implementation
CREATE OR REPLACE FUNCTION public.create_production_run_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC,
  p_note TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.create_production_run_with_lots_atomic(
    p_production_plan_item_id,
    p_produced_quantity,
    p_note,
    NULL
  );
END;
$$;


-- 3. Update undo_production_run_atomic with strict lot reversal integrations
CREATE OR REPLACE FUNCTION public.undo_production_run_atomic(
  p_production_run_id TEXT,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run RECORD;
  v_fgs RECORD;
  v_plan_item RECORD;
  v_reversal_stock_movement_ids JSONB := '[]'::JSONB;
  v_fgm_reversal_id TEXT;
  v_new_produced_quantity NUMERIC;
  v_realized_amount NUMERIC := 0;
  v_order_status TEXT;
  sm RECORD;
  rm RECORD;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
  v_stock_reversal_id TEXT;
  
  v_plan RECORD;

  -- Reversal details
  v_alloc_count INTEGER;
  v_rm_id TEXT;
  r_alloc RECORD;
  v_reversed_allocations_json JSONB := '[]'::JSONB;
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- 1. Fetch & lock production run
  SELECT *
  INTO v_run
  FROM public.production_runs
  WHERE id = p_production_run_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production run not found or already reversed.';
  END IF;

  -- 2. Fetch & Lock the production plan
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_run.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  IF COALESCE(v_plan.is_locked, FALSE) = TRUE
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION 'Kapalı veya kilitli üretim planındaki üretim geri alınamaz.';
  END IF;

  -- Shipment Guard
  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_movements fgm
    WHERE fgm.production_run_id = v_run.id
      AND fgm.organization_id = v_org_id
      AND fgm.is_deleted = FALSE
      AND fgm.is_shipment = TRUE
      AND fgm.movement_type = 'Sevkiyat çıkışı'
  ) THEN
    RAISE EXCEPTION 'Production cannot be reversed while active shipments exist. Reverse shipments first.';
  END IF;

  -- Fetch & Lock Finished Goods Stock
  SELECT *
  INTO v_fgs
  FROM public.finished_goods_stocks
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished goods stock for this production run not found.';
  END IF;

  IF COALESCE(v_fgs.quantity_remaining, 0) <> COALESCE(v_fgs.quantity_produced, 0) THEN
    RAISE EXCEPTION 'Finished goods stock is not fully available. Reverse all shipments before reversing production.';
  END IF;

  -- Fetch & Lock Production Plan Item
  SELECT *
  INTO v_plan_item
  FROM public.production_plan_items
  WHERE id = v_run.production_plan_item_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  IF COALESCE(v_plan_item.is_locked, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan_item.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Kapalı veya kilitli üretim planı kalemindeki üretim geri alınamaz.';
  END IF;

  -- 3. Find and check active allocations for this run (strictly fail if none)
  SELECT COUNT(*)
  INTO v_alloc_count
  FROM public.production_run_raw_material_lot_allocations
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_reversed = FALSE;

  IF v_alloc_count = 0 THEN
    RAISE EXCEPTION 'Bu üretime ait aktif lot tahsis (allocation) kaydı bulunamadı.';
  END IF;

  -- 4. Advisory lock on allocation raw materials in ascending order of raw_material_id
  FOR v_rm_id IN
    SELECT DISTINCT raw_material_id
    FROM public.production_run_raw_material_lot_allocations
    WHERE production_run_id = v_run.id
      AND organization_id = v_org_id
      AND is_reversed = FALSE
    ORDER BY raw_material_id ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_org_id::TEXT || ':raw-material-lot:' || v_rm_id,
        0
      )
    );
  END LOOP;

  -- 5. Lock and update lot rows in deterministic order to restore quantities
  FOR r_alloc IN
    SELECT 
      alloc.id AS alloc_id,
      alloc.raw_material_lot_id,
      alloc.quantity_consumed,
      rml.quantity_remaining,
      rml.quantity_received,
      rml.internal_lot_no
    FROM public.production_run_raw_material_lot_allocations alloc
    JOIN public.raw_material_lots rml ON rml.id = alloc.raw_material_lot_id
    JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
    WHERE alloc.production_run_id = v_run.id
      AND alloc.organization_id = v_org_id
      AND alloc.is_reversed = FALSE
      AND rml.organization_id = v_org_id
      AND rmr.organization_id = v_org_id
    ORDER BY 
      rmr.receipt_date ASC,
      rml.created_at ASC,
      rml.id ASC
    FOR UPDATE OF rml
  LOOP
    -- Ensure received capacity limits are not violated
    IF r_alloc.quantity_remaining + r_alloc.quantity_consumed > r_alloc.quantity_received THEN
      RAISE EXCEPTION 'Lot miktarı geri yüklenemedi. Lot limitleri aşılıyor. Lot: %, Mevcut Kalan: %, Geri Yüklenen: %, Giriş Miktarı: %',
        r_alloc.internal_lot_no, r_alloc.quantity_remaining, r_alloc.quantity_consumed, r_alloc.quantity_received;
    END IF;

    -- Update raw material lot
    UPDATE public.raw_material_lots
    SET
      quantity_remaining = quantity_remaining + r_alloc.quantity_consumed,
      updated_at = NOW()
    WHERE id = r_alloc.raw_material_lot_id
      AND organization_id = v_org_id;

    v_reversed_allocations_json := v_reversed_allocations_json || JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'allocationId', r_alloc.alloc_id,
        'rawMaterialLotId', r_alloc.raw_material_lot_id,
        'internalLotNo', r_alloc.internal_lot_no,
        'quantityRestored', r_alloc.quantity_consumed
      )
    );
  END LOOP;

  -- 6. Mark allocations as reversed (do not delete)
  UPDATE public.production_run_raw_material_lot_allocations
  SET
    is_reversed = TRUE,
    reversed_at = NOW(),
    reversal_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = NOW()
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_reversed = FALSE;

  -- 7. Add balancing Stock Movements (original aggregate reversal logic retained exactly)
  FOR sm IN
    SELECT *
    FROM public.stock_movements
    WHERE production_run_id = v_run.id
      AND organization_id = v_org_id
      AND is_deleted = FALSE
      AND movement_type = 'Üretim Tüketimi'
    ORDER BY created_at ASC
  LOOP
    SELECT *
    INTO rm
    FROM public.raw_materials
    WHERE id = sm.raw_material_id
      AND organization_id = v_org_id
      AND is_active = TRUE
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
      movement_date,
      quantity,
      unit,
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
      CURRENT_DATE,
      sm.quantity,
      sm.unit,
      v_previous_stock,
      v_new_stock,
      sm.quantity,
      v_run.id,
      v_run.order_id,
      v_run.order_item_id,
      'production_run_reversal',
      v_run.id,
      COALESCE(p_reason, 'Üretim geri alındı'),
      FALSE,
      FALSE
    );

    v_reversal_stock_movement_ids := v_reversal_stock_movement_ids || TO_JSONB(v_stock_reversal_id);
  END LOOP;

  -- 8. Reversal for Finished Goods Movement
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
    FALSE,
    FALSE,
    FALSE
  );

  UPDATE public.finished_goods_stocks
  SET
    quantity_remaining = 0,
    is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = NOW()
  WHERE id = v_fgs.id;

  UPDATE public.production_runs
  SET
    status = 'Üretim Geri Alındı',
    raw_materials_deducted = FALSE,
    finished_goods_created = FALSE,
    is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = NOW()
  WHERE id = v_run.id;

  v_new_produced_quantity := GREATEST(
    COALESCE(v_plan_item.produced_quantity, 0) - COALESCE(v_run.produced_quantity, 0),
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
    raw_materials_deducted = FALSE,
    deducted_at = NULL,
    deduction_movement_ids = NULL,
    finished_goods_created = FALSE,
    finished_goods_stock_id = NULL,
    updated_at = NOW()
  WHERE id = v_plan_item.id;

  -- 9. Update Production Plan Status
  UPDATE public.production_plans pp
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = FALSE
          AND COALESCE(ppi.produced_quantity, 0) > 0
      ) THEN 'Planlandı'
      WHEN EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = FALSE
          AND COALESCE(ppi.produced_quantity, 0) < COALESCE(ppi.planned_quantity, 0)
      ) THEN 'Kısmi Üretildi'
      ELSE 'Tamamlandı'
    END,
    completed_at = NULL,
    closed_at = NULL,
    closed_with_shortage = FALSE,
    updated_at = NOW()
  WHERE pp.id = v_run.production_plan_id
    AND pp.organization_id = v_org_id;

  -- 10. Recalculate Order Realized amount and status
  SELECT COALESCE(SUM(fgm.quantity * oi.unit_sale_price), 0)
  INTO v_realized_amount
  FROM public.finished_goods_movements fgm
  JOIN public.order_items oi ON oi.id = fgm.order_item_id
  WHERE fgm.order_id = v_run.order_id
    AND fgm.organization_id = v_org_id
    AND fgm.is_shipment = TRUE
    AND fgm.is_deleted = FALSE
    AND fgm.movement_type = 'Sevkiyat çıkışı'
    AND oi.is_deleted = FALSE;

  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_stocks fgs
    WHERE fgs.order_id = v_run.order_id
      AND fgs.organization_id = v_org_id
      AND fgs.is_deleted = FALSE
      AND COALESCE(fgs.quantity_remaining, 0) > 0
  ) THEN
    v_order_status := 'Sevkiyata Hazır';
  ELSIF EXISTS (
    SELECT 1
    FROM public.production_plan_items ppi
    WHERE ppi.order_id = v_run.order_id
      AND ppi.organization_id = v_org_id
      AND ppi.is_deleted = FALSE
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
    updated_at = NOW()
  WHERE id = v_run.order_id
    AND organization_id = v_org_id;

  -- Recalculate raw material stocks securely
  PERFORM public.recalculate_raw_material_stocks();

  RETURN JSONB_BUILD_OBJECT(
    'productionRunId', v_run.id,
    'finishedGoodsStockId', v_fgs.id,
    'finishedGoodsReversalMovementId', v_fgm_reversal_id,
    'rawMaterialReversalMovementIds', v_reversal_stock_movement_ids,
    'newProducedQuantity', v_new_produced_quantity,
    'orderStatus', v_order_status,
    'realizedAmount', v_realized_amount,
    'reversedRawMaterialLotAllocations', v_reversed_allocations_json
  );
END;
$$;


-- 11. Security Roles Setup & Revocations
REVOKE ALL ON FUNCTION public.create_production_run_with_lots_atomic(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_run_with_lots_atomic(TEXT, NUMERIC, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_production_run_atomic(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_run_atomic(TEXT, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.undo_production_run_atomic(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_production_run_atomic(TEXT, TEXT) TO authenticated, service_role;
