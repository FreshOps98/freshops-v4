import { ProductionPlan, ProductionPlanItem, Order, FinishedGoodsStock, OrderApprovalStatus, OrderComputedStatus, StockMovement, StockMovementType } from '../types';
import { getTodayISO } from './dateHelper';

export function normalizeProductionPlan(plan: any): ProductionPlan {
  const defaultDate = getTodayISO();
  const isLockedVal = plan?.isLocked !== undefined ? !!plan.isLocked : (plan?.is_locked !== undefined ? !!plan.is_locked : undefined);
  return {
    id: plan?.id || 'p_' + Math.random().toString(36).substring(2, 9),
    productionDate: plan?.productionDate || plan?.date || plan?.production_date || defaultDate,
    date: plan?.date || plan?.productionDate || plan?.production_date || defaultDate,
    status: plan?.status || 'Planlandı',
    note: plan?.note || '',
    createdAt: plan?.createdAt || plan?.created_at || new Date().toISOString(),
    updatedAt: plan?.updatedAt || plan?.updated_at || new Date().toISOString(),
    isDeleted: plan?.isDeleted !== undefined ? !!plan.isDeleted : !!plan?.is_deleted,
    isDemo: plan?.isDemo !== undefined ? !!plan.isDemo : !!plan?.is_demo,
    completedAt: plan?.completedAt || plan?.completed_at || undefined,
    closedAt: plan?.closedAt || plan?.closed_at || undefined,
    closedWithShortage: plan?.closedWithShortage !== undefined ? !!plan.closedWithShortage : (plan?.closed_with_shortage !== undefined ? !!plan.closed_with_shortage : undefined),
    carriedOverToPlanIds: Array.isArray(plan?.carriedOverToPlanIds) ? plan.carriedOverToPlanIds : (Array.isArray(plan?.carried_over_to_plan_ids) ? plan.carried_over_to_plan_ids : undefined),
    isLocked: isLockedVal,
    lockedAt: plan?.lockedAt || plan?.locked_at || undefined,
    lockedReason: plan?.lockedReason || plan?.locked_reason || undefined
  };
}

export function normalizeProductionPlanItem(item: any): ProductionPlanItem {
  const isLockedVal = item?.isLocked !== undefined ? !!item.isLocked : (item?.is_locked !== undefined ? !!item.is_locked : undefined);
  const carryOverQty = item?.carryOverQuantityTotal ?? item?.carry_over_quantity_total;
  return {
    id: item?.id || 'pi_' + Math.random().toString(36).substring(2, 9),
    productionPlanId: item?.productionPlanId || item?.production_plan_id || '',
    orderId: item?.orderId || item?.order_id || '',
    orderItemId: item?.orderItemId || item?.order_item_id || '',
    customerId: item?.customerId || item?.customer_id || '',
    productId: item?.productId || item?.product_id || '',
    plannedQuantity: typeof (item?.plannedQuantity ?? item?.planned_quantity) === 'number' ? (item?.plannedQuantity ?? item?.planned_quantity) : 0,
    producedQuantity: typeof (item?.producedQuantity ?? item?.produced_quantity) === 'number' ? (item?.producedQuantity ?? item?.produced_quantity) : 0,
    status: item?.status || 'Planlandı',
    note: item?.note || '',
    rawMaterialsDeducted: item?.rawMaterialsDeducted !== undefined ? !!item.rawMaterialsDeducted : !!item?.raw_materials_deducted,
    finishedGoodsCreated: item?.finishedGoodsCreated !== undefined ? !!item.finishedGoodsCreated : !!item?.finished_goods_created,
    deductedAt: item?.deductedAt || item?.deducted_at,
    deductionMovementIds: item?.deductionMovementIds || item?.deduction_movement_ids || [],
    finishedGoodsStockId: item?.finishedGoodsStockId || item?.finished_goods_stock_id,
    estimatedTotalCost: typeof (item?.estimatedTotalCost ?? item?.estimated_total_cost) === 'number' ? (item?.estimatedTotalCost ?? item?.estimated_total_cost) : 0,
    unitCost: typeof (item?.unitCost ?? item?.unit_cost) === 'number' ? (item?.unitCost ?? item?.unit_cost) : 0,
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    updatedAt: item?.updatedAt || item?.updated_at || new Date().toISOString(),
    isCarryOver: item?.isCarryOver !== undefined ? !!item.isCarryOver : (item?.is_carry_over !== undefined ? !!item.is_carry_over : undefined),
    sourceCarryOverFromPlanId: item?.sourceCarryOverFromPlanId || item?.source_carry_over_from_plan_id || undefined,
    sourceCarryOverFromPlanItemId: item?.sourceCarryOverFromPlanItemId || item?.source_carry_over_from_plan_item_id || undefined,
    carryOverReason: item?.carryOverReason || item?.carry_over_reason || undefined,
    carryOverCreatedAt: item?.carryOverCreatedAt || item?.carry_over_created_at || undefined,
    carryOverQuantityTotal: typeof carryOverQty === 'number' ? carryOverQty : undefined,
    carryOverSources: Array.isArray(item?.carryOverSources) ? item.carryOverSources : (Array.isArray(item?.carry_over_sources) ? item.carry_over_sources : []),
    isLocked: isLockedVal,
    lockedAt: item?.lockedAt || item?.locked_at || undefined,
    lockedReason: item?.lockedReason || item?.locked_reason || undefined,
    isDeleted: item?.isDeleted !== undefined ? !!item.isDeleted : (item?.is_deleted !== undefined ? !!item.is_deleted : undefined),
    deletedAt: item?.deletedAt || item?.deleted_at || undefined,
    deletedReason: item?.deletedReason || item?.deleted_reason || undefined
  };
}

export function normalizeOrder(order: any): Order {
  const oldStatus = order?.status || 'Taslak';
  
  let approvalStatus: OrderApprovalStatus = order?.approvalStatus;
  if (!approvalStatus) {
    if (oldStatus === 'Taslak') {
      approvalStatus = 'Taslak';
    } else if (oldStatus === 'İptal') {
      approvalStatus = 'İptal';
    } else {
      approvalStatus = 'Onaylandı';
    }
  }

  const computedStatus: OrderComputedStatus = order?.computedStatus || oldStatus;

  return {
    id: order?.id || '',
    orderNumber: order?.orderNumber || (order?.id ? order.id.replace('ord_', '').toUpperCase() : ''),
    customerId: order?.customerId || '',
    orderDate: order?.orderDate || getTodayISO(),
    deliveryDate: order?.deliveryDate || getTodayISO(),
    status: computedStatus,
    approvalStatus: approvalStatus,
    computedStatus: computedStatus,
    note: order?.note || '',
    createdAt: order?.createdAt || new Date().toISOString(),
    updatedAt: order?.updatedAt || new Date().toISOString(),
    isDeleted: order?.isDeleted || false,
    isDemo: order?.isDemo || false,
    costSettingsSnapshot: order?.costSettingsSnapshot || undefined
  };
}

export function normalizeFinishedGoodsStock(stock: any): FinishedGoodsStock {
  const quantityProduced = typeof stock?.quantityProduced === 'number' ? stock.quantityProduced : 0;
  
  let lotNo = stock?.lotNo ?? stock?.lot_no ?? stock?.payload?.lotNo ?? stock?.payload?.lot_no ?? undefined;
  if (lotNo && lotNo.startsWith('fgs_')) {
    lotNo = undefined;
  }

  return {
    id: stock?.id || 'fgs_' + Math.random().toString(36).substring(2, 9),
    productId: stock?.productId || '',
    customerId: stock?.customerId || '',
    orderId: stock?.orderId || '',
    orderItemId: stock?.orderItemId || '',
    productionPlanId: stock?.productionPlanId || '',
    productionPlanItemId: stock?.productionPlanItemId || '',
    productionRunId:
      stock?.productionRunId ||
      stock?.production_run_id ||
      undefined,
    productionDate: stock?.productionDate || getTodayISO(),
    deliveryDate: stock?.deliveryDate || getTodayISO(),
    quantityProduced,
    quantityRemaining: typeof stock?.quantityRemaining === 'number' ? stock.quantityRemaining : quantityProduced,
    status: stock?.status || 'Stokta',
    unitCost: typeof stock?.unitCost === 'number' ? stock.unitCost : 0,
    totalCost: typeof stock?.totalCost === 'number' ? stock.totalCost : 0,
    note: stock?.note || '',
    createdAt: stock?.createdAt || new Date().toISOString(),
    updatedAt: stock?.updatedAt || new Date().toISOString(),
    isDeleted: stock?.isDeleted || false,
    isDemo: stock?.isDemo || false,
    lotNo,
    lotDate: stock?.lotDate || stock?.payload?.lotDate || undefined,
    lotDateOffsetDays: typeof stock?.lotDateOffsetDays === 'number' ? stock.lotDateOffsetDays : (typeof stock?.payload?.lotDateOffsetDays === 'number' ? stock.payload.lotDateOffsetDays : undefined)
  };
}

export function normalizeStockMovement(movement: any): StockMovement {
  let type: StockMovementType = 'Stok Girişi';
  const rawType = String(movement?.type || '').trim();
  const normalizedRaw = rawType.toLowerCase();

  if (
    normalizedRaw === 'giriş' || 
    normalizedRaw === 'stok girişi' || 
    normalizedRaw === 'stock girişi' || 
    normalizedRaw === 'stok girisi' || 
    normalizedRaw === 'stock_in' || 
    normalizedRaw === 'stock in'
  ) {
    type = 'Stok Girişi';
  } else if (
    normalizedRaw === 'çıkış' || 
    normalizedRaw === 'stok çıkışı' || 
    normalizedRaw === 'stock çıkışı' || 
    normalizedRaw === 'stok cikisi' || 
    normalizedRaw === 'stock_out' || 
    normalizedRaw === 'stock out'
  ) {
    type = 'Stok Çıkışı';
  } else if (
    normalizedRaw === 'fire' || 
    normalizedRaw === 'fire çıkışı' || 
    normalizedRaw === 'fire cikisi'
  ) {
    type = 'Fire Çıkışı';
  } else if (
    normalizedRaw === 'üretim tüketimi' || 
    normalizedRaw === 'uretim tuketimi' || 
    normalizedRaw === 'production consumption' || 
    normalizedRaw === 'sarfiyat' || 
    normalizedRaw === 'üretim sarfiyatı' ||
    normalizedRaw === 'uretim sarfiyati'
  ) {
    type = 'Üretim Tüketimi';
  } else if (
    normalizedRaw === 'düzeltme' || 
    normalizedRaw === 'duzeltme' || 
    normalizedRaw === 'sayım düzeltmesi' || 
    normalizedRaw === 'sayim duzeltmesi' || 
    normalizedRaw === 'adjustment'
  ) {
    type = 'Sayım Düzeltmesi';
  } else if (
    normalizedRaw === 'üretim silme iadesi' ||
    normalizedRaw === 'uretim silme iadesi' ||
    normalizedRaw === 'üretim geri alma' ||
    normalizedRaw === 'uretim geri alma' ||
    normalizedRaw === 'iade'
  ) {
    type = 'Sayım Düzeltmesi'; // Map return/reversal as stock adjustment to correct stock quantity
  } else {
    // If not matched, try searching for keywords
    if (
      normalizedRaw.includes('çıkış') || 
      normalizedRaw.includes('cikisi') || 
      normalizedRaw.includes('tüketim') || 
      normalizedRaw.includes('tuketimi') || 
      normalizedRaw.includes('sarfiyat') || 
      normalizedRaw.includes('out') || 
      normalizedRaw.includes('fire')
    ) {
      if (normalizedRaw.includes('fire')) {
        type = 'Fire Çıkışı';
      } else if (
        normalizedRaw.includes('tüketim') || 
        normalizedRaw.includes('tuketimi') || 
        normalizedRaw.includes('sarfiyat')
      ) {
        type = 'Üretim Tüketimi';
      } else {
        type = 'Stok Çıkışı';
      }
    } else {
      type = 'Stok Girişi';
    }
  }

  const quantity = typeof movement?.quantity === 'number' ? movement.quantity : 0;
  const unitPrice = typeof movement?.unitPrice === 'number' ? movement.unitPrice : null;
  const totalCost = typeof movement?.totalCost === 'number' 
    ? movement.totalCost 
    : (unitPrice !== null ? unitPrice * quantity : undefined);

  return {
    id: movement?.id || 'mov_' + Math.random().toString(36).substring(2, 9),
    rawMaterialId: movement?.rawMaterialId || '',
    type,
    quantity,
    date: movement?.date || getTodayISO(),
    note: movement?.note || '',
    createdAt: movement?.createdAt || new Date().toISOString(),
    unitPrice: unitPrice || undefined,
    totalCost,
    productionPlanId: movement?.productionPlanId,
    productionPlanItemId: movement?.productionPlanItemId,
    orderId: movement?.orderId,
    orderItemId: movement?.orderItemId,
    productId: movement?.productId,
    isDeleted: !!movement?.isDeleted,
    isDemo: !!movement?.isDemo
  };
}
