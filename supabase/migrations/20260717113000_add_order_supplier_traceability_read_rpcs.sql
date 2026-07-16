-- ============================================================================
-- FreshOps Order and Supplier Read-Only Traceability RPC Layer (Phase 1C-B)
-- ============================================================================

-- 1. Order Traceability RPC
CREATE OR REPLACE FUNCTION public.get_order_traceability_atomic(
  p_order_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_order_json JSONB;
  v_order_items_json JSONB;
  v_production_runs_json JSONB;
  v_shipment_movements_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify order existence and ownership (allow historical is_deleted tracing)
  PERFORM 1
  FROM public.orders
  WHERE id = p_order_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sipariş kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build order object (with nested customer object via LEFT JOIN)
  SELECT jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'orderDate', o.order_date,
    'deliveryDate', o.delivery_date,
    'status', o.status,
    'computedStatus', o.computed_status,
    'approvalStatus', o.approval_status,
    'totalAmount', o.total_amount,
    'realizedAmount', o.realized_amount,
    'note', o.note,
    'isDeleted', o.is_deleted,
    'customer', CASE
                  WHEN c.id IS NOT NULL THEN jsonb_build_object(
                    'id', c.id,
                    'name', c.name
                  )
                  ELSE NULL
                END
  )
  INTO v_order_json
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = v_org_id
  WHERE o.id = p_order_id AND o.organization_id = v_org_id;

  -- Build order items array (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'orderId', oi.order_id,
      'productId', oi.product_id,
      'productName', p.name,
      'orderedQuantity', oi.quantity,
      'unitSalePrice', oi.unit_sale_price,
      'isDeleted', COALESCE(oi.is_deleted, FALSE)
    )
    ORDER BY oi.id ASC
  ), '[]'::jsonb)
  INTO v_order_items_json
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id AND p.organization_id = v_org_id
  WHERE oi.order_id = p_order_id
    AND oi.organization_id = v_org_id;

  -- Build production runs array using the canonical Phase 1C-A function (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    public.get_production_run_traceability_atomic(pr.id)
    ORDER BY pr.created_at ASC, pr.id ASC
  ), '[]'::jsonb)
  INTO v_production_runs_json
  FROM public.production_runs pr
  WHERE pr.order_id = p_order_id
    AND pr.organization_id = v_org_id;

  -- Build shipment movements array (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', fgm.id,
      'finishedGoodsStockId', fgm.finished_goods_stock_id,
      'productionRunId', fgm.production_run_id,
      'orderId', fgm.order_id,
      'orderItemId', fgm.order_item_id,
      'productId', fgm.product_id,
      'productName', p.name,
      'finishedGoodsLotNo', fgs.lot_no,
      'movementType', fgm.movement_type,
      'quantity', fgm.quantity,
      'unit', fgm.unit,
      'movementDate', fgm.movement_date::TEXT,
      'previousQuantity', fgm.previous_quantity,
      'newQuantity', fgm.new_quantity,
      'difference', fgm.difference,
      'isShipment', fgm.is_shipment,
      'isDeleted', fgm.is_deleted,
      'deletedAt', fgm.deleted_at,
      'deletedReason', fgm.deleted_reason,
      'note', fgm.note,
      'createdAt', fgm.created_at
    )
    ORDER BY fgm.created_at ASC, fgm.id ASC
  ), '[]'::jsonb)
  INTO v_shipment_movements_json
  FROM public.finished_goods_movements fgm
  LEFT JOIN public.finished_goods_stocks fgs ON fgs.id = fgm.finished_goods_stock_id AND fgs.organization_id = v_org_id
  LEFT JOIN public.products p ON p.id = fgm.product_id AND p.organization_id = v_org_id
  WHERE fgm.order_id = p_order_id
    AND fgm.organization_id = v_org_id
    AND fgm.movement_type IN ('Sevkiyat çıkışı', 'Sevkiyat Geri Alma');

  -- Combine into final canonical order traceability response
  RETURN jsonb_build_object(
    'success', TRUE,
    'order', v_order_json,
    'orderItems', v_order_items_json,
    'productionRuns', v_production_runs_json,
    'shipmentMovements', v_shipment_movements_json
  );
END;
$$;


-- 2. Supplier Traceability RPC
CREATE OR REPLACE FUNCTION public.get_supplier_traceability_atomic(
  p_supplier_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_supplier_json JSONB;
  v_receipts_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify supplier existence and ownership (allow historical / inactive / soft-deleted)
  PERFORM 1
  FROM public.suppliers
  WHERE id = p_supplier_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tedarikçi kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build supplier object
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'note', s.note,
    'isActive', s.is_active,
    'isDeleted', s.is_deleted
  )
  INTO v_supplier_json
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id;

  -- Build nested receipts array with its lots and production usages (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', rmr.id,
      'supplierId', rmr.supplier_id,
      'receiptDate', rmr.receipt_date::TEXT,
      'invoiceNumber', rmr.invoice_number,
      'dispatchNoteNumber', rmr.dispatch_note_number,
      'note', rmr.note,
      'idempotencyKey', rmr.idempotency_key,
      'isDeleted', rmr.is_deleted,
      'createdAt', rmr.created_at,
      'lots', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', rml.id,
            'internalLotNo', rml.internal_lot_no,
            'kunyeNumber', rml.kunye_number,
            'kunyeStatus', rml.kunye_status,
            'quantityReceived', rml.quantity_received,
            'quantityRemaining', rml.quantity_remaining,
            'unit', rml.unit,
            'unitPrice', rml.unit_price,
            'note', rml.note,
            'inboundStockMovementId', rml.inbound_stock_movement_id,
            'isDeleted', rml.is_deleted,
            'createdAt', rml.created_at,
            'rawMaterial', jsonb_build_object(
              'id', rm.id,
              'name', rm.name,
              'unit', rm.unit
            ),
            'inboundStockMovement', jsonb_build_object(
              'id', sm.id,
              'movementType', sm.movement_type,
              'movementDate', sm.movement_date::TEXT,
              'quantity', sm.quantity,
              'isDeleted', sm.is_deleted
            ),
            'productionUsages', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'allocationId', alloc.id,
                  'productionRunId', alloc.production_run_id,
                  'quantityConsumed', alloc.quantity_consumed,
                  'unit', alloc.unit,
                  'isReversed', alloc.is_reversed,
                  'reversedAt', alloc.reversed_at,
                  'reversalReason', alloc.reversal_reason,
                  'createdAt', alloc.created_at,
                  'productionRun', jsonb_build_object(
                    'id', pr.id,
                    'status', pr.status,
                    'producedQuantity', pr.produced_quantity,
                    'createdAt', pr.created_at
                  ),
                  'finishedGoodsStock', CASE
                    WHEN fgs.id IS NOT NULL THEN jsonb_build_object(
                      'id', fgs.id,
                      'lotNo', fgs.lot_no,
                      'quantityProduced', fgs.quantity_produced,
                      'quantityRemaining', fgs.quantity_remaining,
                      'unit', fgs.unit,
                      'status', fgs.status
                    )
                    ELSE NULL
                  END,
                  'order', CASE
                    WHEN o.id IS NOT NULL THEN jsonb_build_object(
                      'id', o.id,
                      'orderNumber', o.order_number,
                      'status', o.status,
                      'computedStatus', o.computed_status
                    )
                    ELSE NULL
                  END,
                  'product', jsonb_build_object(
                    'id', p.id,
                    'name', p.name
                  )
                )
                ORDER BY alloc.created_at ASC, alloc.id ASC
              ), '[]'::jsonb)
              FROM public.production_run_raw_material_lot_allocations alloc
              JOIN public.production_runs pr ON pr.id = alloc.production_run_id AND pr.organization_id = v_org_id
              LEFT JOIN public.finished_goods_stocks fgs ON fgs.production_run_id = pr.id AND fgs.organization_id = v_org_id
              LEFT JOIN public.orders o ON o.id = alloc.order_id AND o.organization_id = v_org_id
              JOIN public.products p ON p.id = alloc.product_id AND p.organization_id = v_org_id
              WHERE alloc.raw_material_lot_id = rml.id
                AND alloc.organization_id = v_org_id
            )
          )
          ORDER BY rml.created_at ASC, rml.id ASC
        ), '[]'::jsonb)
        FROM public.raw_material_lots rml
        JOIN public.raw_materials rm ON rm.id = rml.raw_material_id AND rm.organization_id = v_org_id
        JOIN public.stock_movements sm ON sm.id = rml.inbound_stock_movement_id AND sm.organization_id = v_org_id
        WHERE rml.raw_material_receipt_id = rmr.id
          AND rml.organization_id = v_org_id
      )
    )
    ORDER BY rmr.receipt_date ASC, rmr.id ASC
  ), '[]'::jsonb)
  INTO v_receipts_json
  FROM public.raw_material_receipts rmr
  WHERE rmr.supplier_id = p_supplier_id
    AND rmr.organization_id = v_org_id;

  -- Combine into final canonical supplier traceability response
  RETURN jsonb_build_object(
    'success', TRUE,
    'supplier', v_supplier_json,
    'receipts', v_receipts_json
  );
END;
$$;


-- 3. Security Permissions (GRANTS & REVOKES)
REVOKE ALL ON FUNCTION public.get_order_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_traceability_atomic(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_supplier_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_traceability_atomic(TEXT) TO authenticated, service_role;
