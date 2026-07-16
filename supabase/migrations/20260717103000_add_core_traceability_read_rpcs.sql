-- ============================================================================
-- FreshOps Core Read-Only Traceability RPC Layer (Phase 1C-A)
-- ============================================================================

-- 1. Production Run Traceability RPC
CREATE OR REPLACE FUNCTION public.get_production_run_traceability_atomic(
  p_production_run_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run_id TEXT;
  v_finished_goods_stock_id TEXT;
  v_run_json JSONB;
  v_fgs_json JSONB;
  v_order_json JSONB;
  v_product_json JSONB;
  v_allocations_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify production run existence and ownership (is_deleted can be true/false for history)
  SELECT
    pr.id,
    pr.finished_goods_stock_id
  INTO
    v_run_id,
    v_finished_goods_stock_id
  FROM public.production_runs pr
  WHERE pr.id = p_production_run_id
    AND pr.organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Üretim kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build productionRun object
  SELECT jsonb_build_object(
    'id', pr.id,
    'status', pr.status,
    'producedQuantity', pr.produced_quantity,
    'productionPlanId', pr.production_plan_id,
    'productionPlanItemId', pr.production_plan_item_id,
    'orderId', pr.order_id,
    'orderItemId', pr.order_item_id,
    'productId', pr.product_id,
    'customerId', pr.customer_id,
    'isDeleted', pr.is_deleted,
    'deletedAt', pr.deleted_at,
    'deletedReason', pr.deleted_reason,
    'createdAt', pr.created_at
  )
  INTO v_run_json
  FROM public.production_runs pr
  WHERE pr.id = p_production_run_id AND pr.organization_id = v_org_id;

  -- Build finishedGoodsStock object (can be NULL if not found)
  SELECT jsonb_build_object(
    'id', fgs.id,
    'lotNo', fgs.lot_no,
    'quantityProduced', fgs.quantity_produced,
    'quantityRemaining', fgs.quantity_remaining,
    'unit', fgs.unit,
    'status', fgs.status,
    'isDeleted', fgs.is_deleted,
    'deletedAt', fgs.deleted_at,
    'deletedReason', fgs.deleted_reason
  )
  INTO v_fgs_json
  FROM public.finished_goods_stocks fgs
  WHERE fgs.organization_id = v_org_id
    AND (
      (
        v_finished_goods_stock_id IS NOT NULL
        AND fgs.id = v_finished_goods_stock_id
      )
      OR
      (
        v_finished_goods_stock_id IS NULL
        AND fgs.production_run_id = p_production_run_id
      )
    )
  ORDER BY
    CASE
      WHEN fgs.id = v_finished_goods_stock_id THEN 0
      ELSE 1
    END,
    fgs.created_at DESC,
    fgs.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_fgs_json := NULL;
  END IF;

  -- Build order object (can be NULL if not found or order_id is NULL)
  SELECT jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'status', o.status,
    'computedStatus', o.computed_status
  )
  INTO v_order_json
  FROM public.orders o
  WHERE o.id = (SELECT order_id FROM public.production_runs WHERE id = p_production_run_id AND organization_id = v_org_id)
    AND o.organization_id = v_org_id;

  IF NOT FOUND THEN
    v_order_json := NULL;
  END IF;

  -- Build product object (can be NULL if not found)
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name
  )
  INTO v_product_json
  FROM public.products p
  WHERE p.id = (SELECT product_id FROM public.production_runs WHERE id = p_production_run_id AND organization_id = v_org_id)
    AND p.organization_id = v_org_id;

  IF NOT FOUND THEN
    v_product_json := NULL;
  END IF;

  -- Build allocations list with deterministic order
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'allocationId', alloc.id,
      'allocationMethod', alloc.allocation_method,
      'quantityConsumed', alloc.quantity_consumed,
      'unit', alloc.unit,
      'isReversed', alloc.is_reversed,
      'reversedAt', alloc.reversed_at,
      'reversalReason', alloc.reversal_reason,

      'rawMaterial', jsonb_build_object(
        'id', rm.id,
        'name', rm.name,
        'unit', rm.unit
      ),

      'rawMaterialLot', jsonb_build_object(
        'id', rml.id,
        'internalLotNo', rml.internal_lot_no,
        'kunyeNumber', rml.kunye_number,
        'kunyeStatus', rml.kunye_status,
        'quantityReceived', rml.quantity_received,
        'quantityRemaining', rml.quantity_remaining,
        'unit', rml.unit,
        'unitPrice', rml.unit_price,
        'isDeleted', rml.is_deleted
      ),

      'receipt', jsonb_build_object(
        'id', rmr.id,
        'receiptDate', rmr.receipt_date::TEXT,
        'invoiceNumber', rmr.invoice_number,
        'dispatchNoteNumber', rmr.dispatch_note_number,
        'note', rmr.note,
        'isDeleted', rmr.is_deleted
      ),

      'supplier', jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'note', s.note,
        'isActive', s.is_active,
        'isDeleted', s.is_deleted
      ),

      'stockMovement', jsonb_build_object(
        'id', sm.id,
        'movementType', sm.movement_type,
        'movementDate', sm.movement_date::TEXT,
        'quantity', sm.quantity,
        'isDeleted', sm.is_deleted
      )
    )
    ORDER BY 
      rm.name ASC,
      rmr.receipt_date ASC,
      rml.created_at ASC,
      alloc.id ASC
  ), '[]'::jsonb)
  INTO v_allocations_json
  FROM public.production_run_raw_material_lot_allocations alloc
  JOIN public.raw_materials rm ON rm.id = alloc.raw_material_id AND rm.organization_id = v_org_id
  JOIN public.raw_material_lots rml ON rml.id = alloc.raw_material_lot_id AND rml.organization_id = v_org_id
  JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id AND rmr.organization_id = v_org_id
  JOIN public.suppliers s ON s.id = rmr.supplier_id AND s.organization_id = v_org_id
  JOIN public.stock_movements sm ON sm.id = alloc.stock_movement_id AND sm.organization_id = v_org_id
  WHERE alloc.production_run_id = p_production_run_id
    AND alloc.organization_id = v_org_id;

  -- Combine into final canonical response
  RETURN jsonb_build_object(
    'success', TRUE,
    'productionRun', v_run_json,
    'finishedGoodsStock', v_fgs_json,
    'order', v_order_json,
    'product', v_product_json,
    'allocations', v_allocations_json
  );
END;
$$;


-- 2. Finished Goods Stock Traceability RPC
CREATE OR REPLACE FUNCTION public.get_finished_goods_traceability_atomic(
  p_finished_goods_stock_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run_id TEXT;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Find and validate finished goods stock (allow historical is_deleted tracing)
  SELECT production_run_id
  INTO v_run_id
  FROM public.finished_goods_stocks
  WHERE id = p_finished_goods_stock_id 
    AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nihai ürün stok kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  IF v_run_id IS NULL OR TRIM(v_run_id) = '' THEN
    RAISE EXCEPTION 'Nihai ürün stok kaydı bir üretim kaydı ile ilişkili değil.';
  END IF;

  -- Delegate to production run traceability
  RETURN public.get_production_run_traceability_atomic(v_run_id);
END;
$$;


-- 3. Security Permissions (GRANTS & REVOKES)
REVOKE ALL ON FUNCTION public.get_production_run_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_production_run_traceability_atomic(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_finished_goods_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finished_goods_traceability_atomic(TEXT) TO authenticated, service_role;
