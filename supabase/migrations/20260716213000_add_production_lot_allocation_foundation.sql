-- ============================================================================
-- FreshOps Production-Raw Material Lot Allocation Foundation Migration
-- ============================================================================

-- 1. Create public.production_run_raw_material_lot_allocations table
CREATE TABLE IF NOT EXISTS public.production_run_raw_material_lot_allocations (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('prla'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  production_run_id TEXT NOT NULL REFERENCES public.production_runs(id) ON DELETE RESTRICT,
  production_plan_id TEXT NOT NULL REFERENCES public.production_plans(id) ON DELETE RESTRICT,
  production_plan_item_id TEXT NOT NULL REFERENCES public.production_plan_items(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  raw_material_id TEXT NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  raw_material_lot_id TEXT NOT NULL REFERENCES public.raw_material_lots(id) ON DELETE RESTRICT,
  stock_movement_id TEXT NOT NULL REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  quantity_consumed NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  allocation_method TEXT NOT NULL,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_run_lot_allocations_quantity_consumed_positive CHECK (quantity_consumed > 0),
  CONSTRAINT production_run_lot_allocations_unit_not_empty CHECK (TRIM(unit) <> ''),
  CONSTRAINT production_run_lot_allocations_method_check CHECK (allocation_method IN ('fifo', 'manual')),
  CONSTRAINT production_run_lot_allocations_reversal_check CHECK (
    (is_reversed = FALSE AND reversed_at IS NULL) 
    OR 
    (is_reversed = TRUE AND reversed_at IS NOT NULL)
  )
);

-- Unique index to prevent duplicate allocations for the same run, lot, and stock movement under the same tenant
CREATE UNIQUE INDEX IF NOT EXISTS production_run_lot_allocations_unique_idx 
ON public.production_run_raw_material_lot_allocations (organization_id, production_run_id, raw_material_lot_id, stock_movement_id);

-- Performance and Query Indexes
CREATE INDEX IF NOT EXISTS production_run_lot_allocations_org_idx 
ON public.production_run_raw_material_lot_allocations (organization_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_run_idx 
ON public.production_run_raw_material_lot_allocations (production_run_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_lot_idx 
ON public.production_run_raw_material_lot_allocations (raw_material_lot_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_rm_idx 
ON public.production_run_raw_material_lot_allocations (raw_material_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_order_idx 
ON public.production_run_raw_material_lot_allocations (order_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_product_idx 
ON public.production_run_raw_material_lot_allocations (product_id);


-- 2. Row Level Security (RLS) setup
ALTER TABLE public.production_run_raw_material_lot_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'production_run_raw_material_lot_allocations' 
      AND policyname = 'select_production_run_lot_allocations_by_tenant'
  ) THEN
    CREATE POLICY select_production_run_lot_allocations_by_tenant 
    ON public.production_run_raw_material_lot_allocations
    FOR SELECT
    TO authenticated
    USING (organization_id = public.current_organization_id());
  END IF;
END $$;


-- 3. Role Permissions (GRANTS)
REVOKE ALL ON public.production_run_raw_material_lot_allocations FROM PUBLIC;
GRANT SELECT ON public.production_run_raw_material_lot_allocations TO authenticated;
GRANT ALL ON public.production_run_raw_material_lot_allocations TO service_role;


-- 4. Salt-okuma FIFO önizleme RPC'si
CREATE OR REPLACE FUNCTION public.preview_production_lot_allocation_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC
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
  v_remaining_quantity NUMERIC;
  v_can_produce BOOLEAN := TRUE;
  v_materials_array JSONB := '[]'::JSONB;
  
  v_recipe RECORD;
  v_waste_rate NUMERIC;
  v_net_qty NUMERIC;
  v_gross_qty NUMERIC;
  
  v_total_available_lot_qty NUMERIC;
  v_remaining_needed NUMERIC;
  v_suggested_lots_array JSONB;
  r_lot RECORD;
  v_allocated NUMERIC;
  v_sufficient BOOLEAN;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Validate Produced Quantity
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- Get and Validate Production Plan Item
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- Get and Validate Production Plan
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_ppi.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- Check if Plan is Locked or Closed
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

  -- Check if Plan Item is Locked or Closed
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

  -- Validate Remaining Quantity
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0)
    - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION 'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- Iterate over recipe requirements for the product
  FOR v_recipe IN
    SELECT
      pr.raw_material_id,
      rm.name AS raw_material_name,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON rm.id = pr.raw_material_id
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = FALSE
    ORDER BY pr.raw_material_id ASC
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);

    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    -- Standard Unit Conversion (g to kg)
    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    -- Calculate Gross Quantity incorporating waste rate
    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));

    -- Sum total remaining quantity in active, non-deleted lots for this material
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

    -- FIFO Suggestion Logic
    v_remaining_needed := v_gross_qty;
    v_suggested_lots_array := '[]'::JSONB;

    FOR r_lot IN
      SELECT 
        rml.id AS lot_id,
        rml.internal_lot_no,
        rml.quantity_remaining,
        rml.kunye_number,
        rml.kunye_status,
        rmr.id AS receipt_id,
        rmr.receipt_date,
        rmr.invoice_number,
        rmr.dispatch_note_number,
        s.id AS supplier_id,
        s.name AS supplier_name
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
      JOIN public.suppliers s ON s.id = rmr.supplier_id
      WHERE rml.raw_material_id = v_recipe.raw_material_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rml.quantity_remaining > 0
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE
        AND s.organization_id = v_org_id
        AND s.is_deleted = FALSE
      ORDER BY 
        rmr.receipt_date ASC,
        rml.created_at ASC,
        rml.id ASC
    LOOP
      IF v_remaining_needed <= 0 THEN
        EXIT;
      END IF;

      v_allocated := LEAST(r_lot.quantity_remaining, v_remaining_needed);
      v_remaining_needed := v_remaining_needed - v_allocated;

      v_suggested_lots_array := v_suggested_lots_array || jsonb_build_array(
        jsonb_build_object(
          'rawMaterialLotId', r_lot.lot_id,
          'internalLotNo', r_lot.internal_lot_no,
          'allocatedQuantity', v_allocated,
          'quantityRemaining', r_lot.quantity_remaining,
          'kunyeNumber', r_lot.kunye_number,
          'kunyeStatus', r_lot.kunye_status,
          'supplierId', r_lot.supplier_id,
          'supplierName', r_lot.supplier_name,
          'receiptId', r_lot.receipt_id,
          'receiptDate', r_lot.receipt_date::TEXT,
          'invoiceNumber', r_lot.invoice_number,
          'dispatchNoteNumber', r_lot.dispatch_note_number
        )
      );
    END LOOP;

    v_sufficient := (v_remaining_needed <= 0);
    IF NOT v_sufficient THEN
      v_can_produce := FALSE;
    END IF;

    -- Append material allocation info
    v_materials_array := v_materials_array || jsonb_build_array(
      jsonb_build_object(
        'rawMaterialId', v_recipe.raw_material_id,
        'rawMaterialName', v_recipe.raw_material_name,
        'requiredQuantity', v_gross_qty,
        'unit', v_recipe.raw_unit,
        'availableLotQuantity', v_total_available_lot_qty,
        'sufficient', v_sufficient,
        'suggestedLots', v_suggested_lots_array
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'canProduce', v_can_produce,
    'productionPlanItemId', p_production_plan_item_id,
    'producedQuantity', p_produced_quantity,
    'materials', v_materials_array
  );
END;
$$;


-- 5. Preview function execution privileges
REVOKE ALL ON FUNCTION public.preview_production_lot_allocation_atomic(TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_production_lot_allocation_atomic(TEXT, NUMERIC) TO authenticated, service_role;
