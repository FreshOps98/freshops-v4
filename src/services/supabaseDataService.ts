import {
  Customer,
  RawMaterial,
  Product,
  ProductRecipeItem,
  StockMovement,
  Order,
  OrderItem,
  ProductionPlan,
  ProductionPlanItem,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  WasteRecord,
  CostSettings,
  ProductionRun,
  CloseProductionPlanAction,
  Supplier,
  RawMaterialReceipt,
  RawMaterialLot,
  CreateRawMaterialReceiptInput
} from '../types';
import { generateId } from './localDataService';
import { supabase } from '../lib/supabaseClient';

// Helper Functions
function toNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// ==========================================
// SNAKE_CASE <-> CAMELCASE MAPPING FUNCTIONS
// ==========================================

export function dbToCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name || '',
    type: row.customer_type || row.type || 'Diğer',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    deliveryNote: row.delivery_note || '',
    isActive: row.is_active !== false,
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function customerToDb(item: any) {
  return {
    id: item.id,
    name: item.name || 'Bilinmeyen Müşteri',
    customer_type: item.type || 'Diğer',
    phone: item.phone || null,
    email: item.email || null,
    address: item.address || null,
    delivery_note: item.deliveryNote || null,
    is_active: item.isActive !== false,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToRawMaterial(row: any): RawMaterial & { currentStock?: number } {
  return {
    id: row.id,
    name: row.name || '',
    category: row.category || 'Diğer',
    unit: row.unit || 'kg',
    purchasePrice: toNumber(row.purchase_price, 0),
    averageCost: toNumber(row.average_cost !== undefined && row.average_cost !== null ? row.average_cost : row.purchase_price, 0),
    defaultWasteRate: toNumber(row.default_waste_rate, 0),
    defaultYieldRate: toNumber(row.default_yield_rate, 100),
    criticalStockLevel: toNumber(row.critical_stock_level, 0),
    currentStock: toNumber(row.current_stock, 0),
    isActive: row.is_active !== false,
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function rawMaterialToDb(item: any) {
  return {
    id: item.id,
    name: item.name || 'Bilinmeyen Hammadde',
    category: item.category || 'Diğer',
    unit: item.unit || 'kg',
    purchase_price: toNumber(item.purchasePrice, 0),
    average_cost: toNumber(item.averageCost !== undefined ? item.averageCost : item.purchasePrice, 0),
    default_waste_rate: toNumber(item.defaultWasteRate, 0),
    default_yield_rate: toNumber(item.defaultYieldRate, 100),
    critical_stock_level: toNumber(item.criticalStockLevel, 0),
    current_stock: toNumber(item.currentStock, 0),
    is_active: item.isActive !== false,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToProduct(row: any): Product & { costPrice?: number; lotPrefix?: string } {
  return {
    id: row.id,
    name: row.name || '',
    category: row.category || 'Diğer',
    packageWeightGrams: toNumber(row.package_weight_grams, 0),
    salePrice: toNumber(row.sale_price, 0),
    costPrice: toNumber(row.cost_price, 0),
    defaultSafetyRate: toNumber(row.default_safety_rate, 3),
    lotPrefix: row.lot_prefix || '',
    isActive: row.is_active !== false,
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function productToDb(item: any) {
  return {
    id: item.id,
    name: item.name || 'Bilinmeyen Ürün',
    category: item.category || 'Diğer',
    package_weight_grams: toNumber(item.packageWeightGrams, 0),
    sale_price: toNumber(item.salePrice, 0),
    cost_price: toNumber(item.costPrice, 0),
    default_safety_rate: toNumber(item.defaultSafetyRate, 3),
    lot_prefix: item.lotPrefix || null,
    is_active: item.isActive !== false,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToRecipe(row: any): ProductRecipeItem {
  return {
    id: row.id,
    productId: row.product_id,
    rawMaterialId: row.raw_material_id,
    quantity: toNumber(row.quantity, 0),
    unit: row.unit || 'g',
    wasteRateOverride: row.waste_rate_override !== null && row.waste_rate_override !== undefined ? toNumber(row.waste_rate_override, 0) : undefined,
    notes: row.notes || ''
  };
}

export function recipeToDb(item: any) {
  return {
    id: item.id,
    product_id: item.productId,
    raw_material_id: item.rawMaterialId,
    quantity: toNumber(item.quantity, 0),
    unit: item.unit || 'g',
    waste_rate_override: item.wasteRateOverride !== undefined ? toNumber(item.wasteRateOverride, 0) : null,
    notes: item.notes || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToOrder(row: any): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderNumber: row.order_number || '',
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    approvalStatus: row.approval_status,
    computedStatus: row.computed_status || row.status,
    totalAmount: toNumber(row.total_amount, 0),
    realizedAmount: toNumber(row.realized_amount, 0),
    costSettingsSnapshot: row.cost_settings_snapshot || undefined,
    note: row.note || '',
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function orderToDb(item: any) {
  return {
    id: item.id,
    customer_id: item.customerId,
    order_number: item.orderNumber || null,
    order_date: item.orderDate,
    delivery_date: item.deliveryDate,
    status: item.status,
    approval_status: item.approvalStatus,
    computed_status: item.computedStatus || item.status,
    total_amount: toNumber(item.totalAmount, 0),
    realized_amount: toNumber(item.realizedAmount, 0),
    cost_settings_snapshot: item.costSettingsSnapshot || null,
    note: item.note || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToOrderItem(row: any): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    quantity: toNumber(row.quantity, 0),
    unit: row.unit || 'adet',
    unitSalePrice: toNumber(row.unit_sale_price, 0),
    totalPrice: toNumber(row.total_price, toNumber(row.quantity, 0) * toNumber(row.unit_sale_price, 0)),
    safetyRateOverride: row.safety_rate_override !== null && row.safety_rate_override !== undefined ? toNumber(row.safety_rate_override, 0) : undefined,
    wasteRateOverrides: row.waste_rate_overrides || undefined,
    note: row.note || ''
  } as any;
}

export function orderItemToDb(item: any) {
  const quantity = toNumber(item.quantity, 0);
  const uPrice = toNumber(item.unitSalePrice, 0);
  const tPrice = toNumber(item.totalPrice, quantity * uPrice);
  return {
    id: item.id,
    order_id: item.orderId,
    product_id: item.productId,
    quantity,
    unit: item.unit || 'adet',
    unit_sale_price: uPrice,
    total_price: tPrice,
    safety_rate_override: item.safetyRateOverride !== undefined ? toNumber(item.safetyRateOverride, 0) : null,
    waste_rate_overrides: item.wasteRateOverrides || null,
    note: item.note || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToProductionPlan(row: any): ProductionPlan {
  return {
    id: row.id,
    productionDate: row.production_date || row.plan_date || '',
    status: row.status || 'Planlandı',
    note: row.note || '',
    completedAt: row.completed_at || undefined,
    closedAt: row.closed_at || undefined,
    closedWithShortage: !!row.closed_with_shortage,
    carriedOverToPlanIds: row.carried_over_to_plan_ids || [],
    isLocked: !!row.is_locked,
    lockedAt: row.locked_at || undefined,
    lockedReason: row.locked_reason || undefined,
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function productionPlanToDb(item: any) {
  return {
    id: item.id,
    production_date: item.productionDate || item.date || new Date().toISOString().slice(0, 10),
    status: item.status || 'Planlandı',
    note: item.note || null,
    completed_at: item.completedAt || null,
    closed_at: item.closedAt || null,
    closed_with_shortage: !!item.closedWithShortage,
    carried_over_to_plan_ids: item.carriedOverToPlanIds || null,
    is_locked: !!item.isLocked,
    locked_at: item.lockedAt || null,
    locked_reason: item.lockedReason || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToProductionPlanItem(row: any): ProductionPlanItem {
  return {
    id: row.id,
    productionPlanId: row.production_plan_id,
    orderId: row.order_id || '',
    orderItemId: row.order_item_id || '',
    customerId: row.customer_id || '',
    productId: row.product_id || '',
    plannedQuantity: toNumber(row.planned_quantity, 0),
    producedQuantity: toNumber(row.produced_quantity, 0),
    status: row.status || 'Planlandı',
    note: row.note || '',
    rawMaterialsDeducted: !!row.raw_materials_deducted,
    deductedAt: row.deducted_at || undefined,
    deductionMovementIds: row.deduction_movement_ids || [],
    finishedGoodsCreated: !!row.finished_goods_created,
    finishedGoodsStockId: row.finished_goods_stock_id || undefined,
    estimatedTotalCost: toNumber(row.estimated_total_cost, 0),
    unitCost: toNumber(row.unit_cost, 0),
    isCarryOver: !!row.is_carry_over,
    sourceCarryOverFromPlanId: row.source_carry_over_from_plan_id || undefined,
    sourceCarryOverFromPlanItemId: row.source_carry_over_from_plan_item_id || undefined,
    carryOverReason: row.carry_over_reason || undefined,
    carryOverCreatedAt: row.carry_over_created_at || undefined,
    carryOverQuantityTotal: toNumber(row.carry_over_quantity_total, 0),
    carryOverSources: row.carry_over_sources || [],
    isLocked: !!row.is_locked,
    lockedAt: row.locked_at || undefined,
    lockedReason: row.locked_reason || undefined,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at || undefined,
    deletedReason: row.deleted_reason || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function productionPlanItemToDb(item: any) {
  return {
    id: item.id,
    production_plan_id: item.productionPlanId,
    order_id: item.orderId || null,
    order_item_id: item.orderItemId || null,
    customer_id: item.customerId || null,
    product_id: item.productId,
    planned_quantity: toNumber(item.plannedQuantity, 0),
    produced_quantity: toNumber(item.producedQuantity, 0),
    status: item.status || 'Planlandı',
    note: item.note || null,
    raw_materials_deducted: !!item.rawMaterialsDeducted,
    deducted_at: item.deductedAt || null,
    deduction_movement_ids: item.deductionMovementIds || null,
    finished_goods_created: !!item.finishedGoodsCreated,
    finished_goods_stock_id: item.finishedGoodsStockId || null,
    estimated_total_cost: toNumber(item.estimatedTotalCost, 0),
    unit_cost: toNumber(item.unitCost, 0),
    is_carry_over: !!item.isCarryOver,
    source_carry_over_from_plan_id: item.sourceCarryOverFromPlanId || null,
    source_carry_over_from_plan_item_id: item.sourceCarryOverFromPlanItemId || null,
    carry_over_reason: item.carryOverReason || null,
    carry_over_created_at: item.carryOverCreatedAt || null,
    carry_over_quantity_total: toNumber(item.carryOverQuantityTotal, 0),
    carry_over_sources: item.carryOverSources || null,
    is_locked: !!item.isLocked,
    locked_at: item.lockedAt || null,
    locked_reason: item.lockedReason || null,
    is_deleted: !!item.isDeleted,
    deleted_at: item.deletedAt || null,
    deleted_reason: item.deletedReason || null,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToProductionRun(row: any): ProductionRun {
  return {
    id: row.id,
    productionPlanId: row.production_plan_id,
    productionPlanItemId: row.production_plan_item_id || '',
    orderId: row.order_id || '',
    orderItemId: row.order_item_id || '',
    customerId: row.customer_id || '',
    productId: row.product_id,
    producedQuantity: toNumber(row.produced_quantity, 0),
    productionDate: row.production_date || row.run_date || '',
    note: row.note || '',
    rawMaterialsDeducted: !!row.raw_materials_deducted,
    rawMaterialMovementIds: row.raw_material_movement_ids || [],
    finishedGoodsCreated: !!row.finished_goods_created,
    finishedGoodsStockId: row.finished_goods_stock_id || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    lotNo: row.lot_no || undefined,
    lotDate: row.lot_date || undefined,
    lotDateOffsetDays: row.lot_date_offset_days !== null && row.lot_date_offset_days !== undefined ? toNumber(row.lot_date_offset_days, 0) : undefined
  };
}

export function productionRunToDb(item: any) {
  const fallbackDate = new Date().toISOString().split('T')[0];
  return {
    id: item.id,
    production_plan_id: item.productionPlanId,
    production_plan_item_id: item.productionPlanItemId || null,
    order_id: item.orderId || null,
    order_item_id: item.orderItemId || null,
    customer_id: item.customerId || null,
    product_id: item.productId,
    produced_quantity: toNumber(item.producedQuantity, 0),
    production_date: item.productionDate || item.run_date || fallbackDate,
    note: item.note || null,
    raw_materials_deducted: !!item.rawMaterialsDeducted,
    raw_material_movement_ids: item.rawMaterialMovementIds || null,
    finished_goods_created: !!item.finishedGoodsCreated,
    finished_goods_stock_id: item.finishedGoodsStockId || null,
    is_deleted: !!item.isDeleted,
    deleted_at: item.deletedAt || null,
    deleted_reason: item.deletedReason || null,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString(),
    lot_no: item.lotNo || null,
    lot_date: item.lotDate || null,
    lot_date_offset_days: item.lotDateOffsetDays !== undefined ? toNumber(item.lotDateOffsetDays, 0) : null
  };
}

export function dbToStockMovement(row: any): StockMovement {
  return {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    type: row.movement_type || row.type || 'Stok Girişi',
    quantity: toNumber(row.quantity, 0),
    unit: row.unit || 'kg',
    date: row.movement_date || row.date || '',
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
    unitPrice: row.unit_price !== null && row.unit_price !== undefined ? toNumber(row.unit_price, 0) : undefined,
    totalCost: row.total_cost !== null && row.total_cost !== undefined ? toNumber(row.total_cost, 0) : undefined,
    productionPlanId: row.production_plan_id || undefined,
    productionPlanItemId: row.production_plan_item_id || undefined,
    orderId: row.order_id || undefined,
    orderItemId: row.order_item_id || undefined,
    productId: row.product_id || undefined,
    productionRunId: row.production_run_id || undefined,
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo
  };
}

export function stockMovementToDb(item: any) {
  const fallbackDate = new Date().toISOString().split('T')[0];
  return {
    id: item.id,
    raw_material_id: item.rawMaterialId,
    movement_type: item.type || item.movementType || 'Stok Girişi',
    quantity: toNumber(item.quantity, 0),
    unit: item.unit || 'kg',
    movement_date: item.date || item.movementDate || fallbackDate,
    unit_price: item.unitPrice !== undefined ? toNumber(item.unitPrice, 0) : null,
    total_cost: item.totalCost !== undefined ? toNumber(item.totalCost, 0) : null,
    production_plan_id: item.productionPlanId || null,
    production_plan_item_id: item.productionPlanItemId || null,
    order_id: item.orderId || null,
    order_item_id: item.orderItemId || null,
    product_id: item.productId || null,
    production_run_id: item.productionRunId || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    note: item.note || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToFinishedGoodsStock(row: any): FinishedGoodsStock {
  return {
    id: row.id,
    productId: row.product_id,
    customerId: row.customer_id || '',
    orderId: row.order_id || '',
    orderItemId: row.order_item_id || '',
    productionPlanId: row.production_plan_id || '',
    productionPlanItemId: row.production_plan_item_id || '',
    productionRunId: row.production_run_id || undefined,
    productionDate: row.production_date || '',
    deliveryDate: row.delivery_date || '',
    quantityProduced: toNumber(row.quantity_produced, 0),
    quantityRemaining: toNumber(row.quantity_remaining !== undefined && row.quantity_remaining !== null ? row.quantity_remaining : row.quantity_produced, 0),
    status: row.status || 'Stokta',
    unitCost: toNumber(row.unit_cost, 0),
    totalCost: toNumber(row.total_cost, 0),
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    lotNo: row.lot_no || undefined,
    lotDate: row.lot_date || undefined,
    lotDateOffsetDays: row.lot_date_offset_days !== null && row.lot_date_offset_days !== undefined ? toNumber(row.lot_date_offset_days, 0) : undefined
  };
}

export function finishedGoodsStockToDb(item: any) {
  return {
    id: item.id,
    product_id: item.productId,
    customer_id: item.customerId || null,
    order_id: item.orderId || null,
    order_item_id: item.orderItemId || null,
    production_plan_id: item.productionPlanId || null,
    production_plan_item_id: item.productionPlanItemId || null,
    production_run_id: item.productionRunId || null,
    production_date: item.productionDate,
    delivery_date: item.deliveryDate,
    quantity_produced: toNumber(item.quantityProduced, 0),
    quantity_remaining: toNumber(item.quantityRemaining !== undefined ? item.quantityRemaining : item.quantityProduced, 0),
    status: item.status || 'Stokta',
    unit_cost: toNumber(item.unitCost, 0),
    total_cost: toNumber(item.totalCost, 0),
    note: item.note || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString(),
    lot_no: item.lotNo || null,
    lot_date: item.lotDate || null,
    lot_date_offset_days: item.lotDateOffsetDays !== undefined ? toNumber(item.lotDateOffsetDays, 0) : null
  };
}

export function dbToFinishedGoodsMovement(row: any): FinishedGoodsMovement {
  return {
    id: row.id,
    finishedGoodsStockId: row.finished_goods_stock_id,
    productionRunId: row.production_run_id || undefined,
    productId: row.product_id,
    customerId: row.customer_id || '',
    orderId: row.order_id || '',
    orderItemId: row.order_item_id || '',
    type: row.movement_type || row.type || '',
    quantity: toNumber(row.quantity, 0),
    date: row.movement_date || row.date || '',
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
    isDeleted: !!row.is_deleted,
    isDemo: !!row.is_demo,
    isShipment: !!row.is_shipment,
    reason: row.reason || '',
    previousQuantity: row.previous_quantity !== null && row.previous_quantity !== undefined ? toNumber(row.previous_quantity, 0) : undefined,
    newQuantity: row.new_quantity !== null && row.new_quantity !== undefined ? toNumber(row.new_quantity, 0) : undefined,
    difference: row.difference !== null && row.difference !== undefined ? toNumber(row.difference, 0) : undefined,
    lotNo: row.lot_no || undefined
  };
}

export function finishedGoodsMovementToDb(item: any) {
  const fallbackDate = new Date().toISOString().split('T')[0];
  return {
    id: item.id,
    finished_goods_stock_id: item.finishedGoodsStockId,
    production_run_id: item.productionRunId || null,
    product_id: item.productId,
    customer_id: item.customerId || null,
    order_id: item.orderId || null,
    order_item_id: item.orderItemId || null,
    movement_type: item.type || item.movementType || '',
    quantity: toNumber(item.quantity, 0),
    movement_date: item.date || item.movementDate || fallbackDate,
    note: item.note || null,
    is_deleted: !!item.isDeleted,
    is_demo: !!item.isDemo,
    is_shipment: !!item.isShipment,
    reason: item.reason || null,
    previous_quantity: item.previousQuantity !== undefined ? toNumber(item.previousQuantity, 0) : null,
    new_quantity: item.newQuantity !== undefined ? toNumber(item.newQuantity, 0) : null,
    difference: item.difference !== undefined ? toNumber(item.difference, 0) : null,
    lot_no: item.lotNo || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToCostSettings(row: any): CostSettings {
  if (!row) {
    return {
      defaultSafetyRate: 3,
      laborCostPerPackage: 2.50,
      overheadCostPerPackage: 1.20,
      deliveryCostPerPackage: 0.80,
      useAverageWasteRate: false,
      stockWarningThreshold: 10,
      lotDateOffsetDays: 0,
      currency: 'TRY'
    };
  }
  return {
    defaultSafetyRate: toNumber(row.default_safety_rate, 3),
    laborCostPerPackage: toNumber(row.labor_cost_per_package, 2.50),
    overheadCostPerPackage: toNumber(row.overhead_cost_per_package, 1.20),
    deliveryCostPerPackage: toNumber(row.delivery_cost_per_package, 0.80),
    useAverageWasteRate: !!row.use_average_waste_rate,
    stockWarningThreshold: toNumber(row.stock_warning_threshold, 10),
    lotDateOffsetDays: row.lot_date_offset_days !== null && row.lot_date_offset_days !== undefined ? toNumber(row.lot_date_offset_days, 0) : 0,
    currency: row.currency || 'TRY'
  };
}

export function costSettingsToDb(item: any) {
  return {
    default_safety_rate: toNumber(item.defaultSafetyRate, 3),
    labor_cost_per_package: toNumber(item.laborCostPerPackage, 2.50),
    overhead_cost_per_package: toNumber(item.overheadCostPerPackage, 1.20),
    delivery_cost_per_package: toNumber(item.deliveryCostPerPackage, 0.80),
    use_average_waste_rate: !!item.useAverageWasteRate,
    stock_warning_threshold: toNumber(item.stockWarningThreshold, 10),
    lot_date_offset_days: item.lotDateOffsetDays !== undefined ? toNumber(item.lotDateOffsetDays, 0) : 0,
    currency: item.currency || 'TRY'
  };
}

export function dbToSupplier(row: any): Supplier {
  return {
    id: row.id,
    name: row.name || '',
    note: row.note || '',
    isActive: row.is_active !== false,
    isDeleted: !!row.is_deleted,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function supplierToDb(item: any) {
  return {
    id: item.id,
    name: item.name,
    note: item.note || null,
    is_active: item.isActive !== false,
    is_deleted: !!item.isDeleted,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString()
  };
}

export function dbToRawMaterialReceipt(row: any): RawMaterialReceipt {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    receiptDate: row.receipt_date,
    invoiceNumber: row.invoice_number || '',
    dispatchNoteNumber: row.dispatch_note_number || '',
    note: row.note || '',
    idempotencyKey: row.idempotency_key || '',
    isDeleted: !!row.is_deleted,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function dbToRawMaterialLot(row: any): RawMaterialLot {
  return {
    id: row.id,
    rawMaterialReceiptId: row.raw_material_receipt_id,
    rawMaterialId: row.raw_material_id,
    inboundStockMovementId: row.inbound_stock_movement_id,
    internalLotNo: row.internal_lot_no || '',
    kunyeNumber: row.kunye_number || '',
    kunyeStatus: row.kunye_status || 'provided',
    quantityReceived: toNumber(row.quantity_received, 0),
    quantityRemaining: toNumber(row.quantity_remaining, 0),
    unit: row.unit || '',
    unitPrice: toNumber(row.unit_price, 0),
    note: row.note || '',
    isDeleted: !!row.is_deleted,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function dbToWasteRecord(row: any): WasteRecord {
  return {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    inputQuantity: toNumber(row.input_quantity, 0),
    wasteQuantity: toNumber(row.waste_quantity, 0),
    usableQuantity: toNumber(row.usable_quantity, 0),
    wasteRate: toNumber(row.waste_rate, 0),
    yieldRate: toNumber(row.yield_rate, 100),
    reason: row.reason || 'Diğer',
    date: row.date || '',
    note: row.note || ''
  };
}

export function wasteRecordToDb(item: any) {
  return {
    id: item.id,
    raw_material_id: item.rawMaterialId,
    input_quantity: toNumber(item.inputQuantity, 0),
    waste_quantity: toNumber(item.wasteQuantity, 0),
    usable_quantity: toNumber(item.usableQuantity, 0),
    waste_rate: toNumber(item.wasteRate, 0),
    yield_rate: toNumber(item.yieldRate, 100),
    date: item.date || '',
    reason: item.reason || 'Diğer',
    note: item.note || null
  };
}

// Clean undefined values from object recursively
function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  
  const cleaned: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = cleanUndefined(val);
    }
  }
  return cleaned;
}

// Upsert utility
async function upsertRows(tableName: string, rows: any[]) {
  if (!rows || rows.length === 0) return { success: true, count: 0 };
  const cleanedRows = rows.map(cleanUndefined);

  const { data, error } = await supabase
    .from(tableName)
    .upsert(cleanedRows, { onConflict: "id" })
    .select();

  if (error) {
    console.error(`Error during upsert on table ${tableName}:`, error);
    throw error;
  }
  return { success: true, count: data?.length ?? rows.length };
}

// ==========================================
// SUPABASE DATA SERVICE EXPORTED METHODS
// ==========================================

export const supabaseDataService = {
  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(dbToCustomer);
  },

  async addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
    const newId = 'cust_' + generateId();
    const fullCustomer: Customer = {
      ...customer,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const mapped = customerToDb(fullCustomer);
    const { data, error } = await supabase
      .from('customers')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToCustomer(data);
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    const { data: existing, error: getErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToCustomer(existing);
    const updatedObj = {
      ...existingObj,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const mapped = customerToDb(updatedObj);
    const { data, error } = await supabase
      .from('customers')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToCustomer(data);
  },

  async deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- RAW MATERIALS ---
  async getRawMaterials(): Promise<RawMaterial[]> {
    const { data, error } = await supabase
      .from('raw_materials')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(dbToRawMaterial);
  },

  async addRawMaterial(rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>): Promise<RawMaterial> {
    const newId = 'rm_' + generateId();
    const fullRm: RawMaterial = {
      ...rm,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const mapped = rawMaterialToDb(fullRm);
    const { data, error } = await supabase
      .from('raw_materials')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToRawMaterial(data);
  },

  async updateRawMaterial(id: string, updates: Partial<RawMaterial>): Promise<RawMaterial> {
    const { data: existing, error: getErr } = await supabase
      .from('raw_materials')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToRawMaterial(existing);
    const updatedObj = {
      ...existingObj,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const mapped = rawMaterialToDb(updatedObj);
    delete (mapped as any).current_stock;
    delete (mapped as any).average_cost;
    const { data, error } = await supabase
      .from('raw_materials')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToRawMaterial(data);
  },

  async deleteRawMaterial(id: string): Promise<void> {
    const { error } = await supabase
      .from('raw_materials')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- PRODUCTS ---
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(dbToProduct);
  },

  async addProduct(prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    const newId = 'prod_' + generateId();
    const fullProd: Product = {
      ...prod,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const mapped = productToDb(fullProd);
    const { data, error } = await supabase
      .from('products')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToProduct(data);
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const { data: existing, error: getErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToProduct(existing);
    const updatedObj = {
      ...existingObj,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    const mapped = productToDb(updatedObj);
    const { data, error } = await supabase
      .from('products')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToProduct(data);
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- RECIPES ---
  async getRecipes(): Promise<ProductRecipeItem[]> {
    const { data, error } = await supabase
      .from('product_recipes')
      .select('*');
    if (error) throw error;
    return (data || []).map(dbToRecipe);
  },

  async addRecipeItem(item: Omit<ProductRecipeItem, 'id'>): Promise<ProductRecipeItem> {
    const newId = 'rec_' + generateId();
    const fullItem = {
      ...item,
      id: newId
    };
    const mapped = recipeToDb(fullItem);
    const { data, error } = await supabase
      .from('product_recipes')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToRecipe(data);
  },

  async updateRecipeItem(id: string, updates: Partial<ProductRecipeItem>): Promise<ProductRecipeItem> {
    const { data: existing, error: getErr } = await supabase
      .from('product_recipes')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToRecipe(existing);
    const updatedObj = {
      ...existingObj,
      ...updates
    };
    const mapped = recipeToDb(updatedObj);
    const { data, error } = await supabase
      .from('product_recipes')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToRecipe(data);
  },

  async deleteRecipeItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('product_recipes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- STOCK MOVEMENTS ---
  async getStockMovements(): Promise<StockMovement[]> {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .order('movement_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToStockMovement);
  },

  async addStockMovement(mov: Omit<StockMovement, 'id' | 'createdAt'>): Promise<StockMovement> {
    const newId = 'mov_' + generateId();
    const fullMov = {
      ...mov,
      id: newId,
      createdAt: new Date().toISOString()
    };
    const mapped = stockMovementToDb(fullMov);
    const { data, error } = await supabase
      .from('stock_movements')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToStockMovement(data);
  },

  async updateStockMovement(id: string, updates: Partial<StockMovement>): Promise<StockMovement> {
    const { data: existing, error: getErr } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToStockMovement(existing);
    const updatedObj = {
      ...existingObj,
      ...updates
    };
    const mapped = stockMovementToDb(updatedObj);
    const { data, error } = await supabase
      .from('stock_movements')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToStockMovement(data);
  },

  async deleteStockMovement(id: string): Promise<void> {
    const { error } = await supabase
      .from('stock_movements')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- ORDERS ---
  async getOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('delivery_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToOrder);
  },

  async addOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]): Promise<Order> {
    let costSettings = null;
    try {
      costSettings = await this.getCostSettings();
    } catch (e) {
      console.warn("Failed to fetch cost settings snapshot for order:", e);
    }

    const { data: newOrder, error: orderErr } = await supabase.rpc("create_order_with_items", {
      p_customer_id: order.customerId,
      p_order_date: order.orderDate,
      p_delivery_date: order.deliveryDate,
      p_status: order.status || "Onaylandı",
      p_approval_status: order.approvalStatus || "Onaylandı",
      p_computed_status: order.computedStatus || order.status || "Onaylandı",
      p_note: order.note || null,
      p_cost_settings_snapshot: order.costSettingsSnapshot || costSettings || null,
      p_items: items.map(item => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unit: item.unit || "adet",
        unitSalePrice: Number(item.unitSalePrice || (item as any).salePrice || 0),
        safetyRateOverride: item.safetyRateOverride ?? null,
        wasteRateOverrides: item.wasteRateOverrides ?? null
      }))
    });

    if (orderErr) throw orderErr;

    return dbToOrder(newOrder);
  },

  async updateOrder(id: string, updates: Partial<Order>, items?: OrderItem[]): Promise<Order> {
    const { data: existing, error: getErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToOrder(existing);
    
    let totalAmount = existingObj.totalAmount;
    if (items) {
      totalAmount = items.reduce((sum, item) => sum + (toNumber(item.quantity, 0) * toNumber(item.unitSalePrice, 0)), 0);
    }

    const updatedObj = {
      ...existingObj,
      ...updates,
      totalAmount,
      updatedAt: new Date().toISOString()
    };

    const mappedOrder = orderToDb(updatedObj);
    const { data: updatedOrder, error: orderErr } = await supabase
      .from('orders')
      .update(mappedOrder)
      .eq('id', id)
      .select()
      .single();
    if (orderErr) throw orderErr;

    if (items) {
      const { error: delErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', id);
      if (delErr) throw delErr;

      const mappedItems = items.map(item => {
        const fullItem = {
          ...item,
          id: item.id || 'item_' + generateId(),
          orderId: id,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return orderItemToDb(fullItem);
      });

      const { error: insErr } = await supabase
        .from('order_items')
        .insert(mappedItems);
      if (insErr) throw insErr;
    }

    return dbToOrder(updatedOrder);
  },

  async deleteOrder(id: string): Promise<void> {
    // Delete associated order items first due to foreign keys
    const { error: itemsErr } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id);
    if (itemsErr) throw itemsErr;

    const { error: orderErr } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);
    if (orderErr) throw orderErr;
  },

  async getOrderItems(): Promise<OrderItem[]> {
    const { data, error } = await supabase
      .from('order_items')
      .select('*');
    if (error) throw error;
    return (data || []).map(dbToOrderItem);
  },

  async saveOrderItems(list: OrderItem[]): Promise<void> {
    const mapped = list.map(orderItemToDb);
    await upsertRows('order_items', mapped);
  },

  // --- PRODUCTION PLANS ---
  async getProductionPlans(): Promise<ProductionPlan[]> {
    const { data, error } = await supabase
      .from('production_plans')
      .select('*')
      .order('production_date', { ascending: false });
    if (error) {
      // Fallback order by plan_date if table has plan_date instead of production_date
      const { data: fbData, error: fbError } = await supabase
        .from('production_plans')
        .select('*')
        .order('plan_date' as any, { ascending: false });
      if (fbError) throw fbError;
      return (fbData || []).map(dbToProductionPlan);
    }
    return (data || []).map(dbToProductionPlan);
  },

  async addProductionPlan(plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]): Promise<ProductionPlan> {
    const planId = 'plan_' + generateId();
    const fullPlan: ProductionPlan = {
      ...plan,
      id: planId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const mappedPlan = productionPlanToDb(fullPlan);
    const mappedItems = items.map(item => {
      const fullItem = {
        ...item,
        id: 'plan_item_' + generateId(),
        productionPlanId: planId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return productionPlanItemToDb(fullItem);
    });

    const { data: newPlan, error: planErr } = await supabase
      .from('production_plans')
      .insert([mappedPlan])
      .select()
      .single();
    if (planErr) throw planErr;

    const { error: itemsErr } = await supabase
      .from('production_plan_items')
      .insert(mappedItems);
    if (itemsErr) throw itemsErr;

    return dbToProductionPlan(newPlan);
  },

  async updateProductionPlan(id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]): Promise<ProductionPlan> {
    const { data: existing, error: getErr } = await supabase
      .from('production_plans')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToProductionPlan(existing);
    const updatedObj = {
      ...existingObj,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const mappedPlan = productionPlanToDb(updatedObj);
    const { data: updatedPlan, error: planErr } = await supabase
      .from('production_plans')
      .update(mappedPlan)
      .eq('id', id)
      .select()
      .single();
    if (planErr) throw planErr;

    if (items) {
      // 1. Get existing production plan items from Supabase (only active, non-deleted ones)
      const { data: dbItems, error: dbItemsErr } = await supabase
        .from('production_plan_items')
        .select('*')
        .eq('production_plan_id', id)
        .eq('is_deleted', false);
      if (dbItemsErr) throw dbItemsErr;

      // Map incoming items
      const mappedItems = items.map(item => {
        const fullItem = {
          ...item,
          id: item.id || 'plan_item_' + generateId(),
          productionPlanId: id,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return productionPlanItemToDb(fullItem);
      });

      // 2. Identify items that were deleted/removed (are in dbItems but NOT in items)
      const incomingIds = new Set(items.map(item => item.id).filter(Boolean));
      const deletedItems = (dbItems || []).filter(dbItem => !incomingIds.has(dbItem.id));

      // 3. Process deleted items
      for (const dbItem of deletedItems) {
        // Check if there are any production runs referencing this item
        const { data: runs, error: runErr } = await supabase
          .from('production_runs')
          .select('id')
          .eq('production_plan_item_id', dbItem.id);

        const hasRuns = runs && runs.length > 0;

        if (hasRuns) {
          // Keep the row, soft-delete/cancel it to avoid foreign key constraint errors
          const { error: softDelErr } = await supabase
            .from('production_plan_items')
            .update({
              is_deleted: true,
              status: 'İptal',
              deleted_at: new Date().toISOString(),
              deleted_reason: 'Kullanıcı tarafından plandan kaldırıldı (Üretim geçmişi olduğu için korunuyor)',
              updated_at: new Date().toISOString()
            })
            .eq('id', dbItem.id);
          if (softDelErr) throw softDelErr;
        } else {
          // No production runs exist, we can safely delete it
          const { error: hardDelErr } = await supabase
            .from('production_plan_items')
            .delete()
            .eq('id', dbItem.id);
          if (hardDelErr) throw hardDelErr;
        }
      }

      // 4. Upsert/Save the incoming items (both insert new and update existing ones without deleting anything!)
      if (mappedItems.length > 0) {
        const { error: upsertErr } = await supabase
          .from('production_plan_items')
          .upsert(mappedItems, { onConflict: 'id' });
        if (upsertErr) throw upsertErr;
      }
    }

    return dbToProductionPlan(updatedPlan);
  },

  async deleteProductionPlan(id: string): Promise<void> {
    // Delete plan items first
    const { error: itemsErr } = await supabase
      .from('production_plan_items')
      .delete()
      .eq('production_plan_id', id);
    if (itemsErr) throw itemsErr;

    const { error: planErr } = await supabase
      .from('production_plans')
      .delete()
      .eq('id', id);
    if (planErr) throw planErr;
  },

  async addOrderItemToProductionPlan(
    productionPlanId: string,
    orderId: string,
    orderItemId: string,
    productId: string,
    plannedQuantity: number,
    unit: string = 'Adet'
  ): Promise<any> {
    try {
      // 1. Try to call the RPC
      const { data, error } = await supabase.rpc("add_order_item_to_production_plan_atomic", {
        p_production_plan_id: productionPlanId,
        p_order_id: orderId,
        p_order_item_id: orderItemId,
        p_product_id: productId,
        p_planned_quantity: Number(plannedQuantity),
        p_unit: unit
      });

      if (!error) {
        return data;
      }
      
      console.warn("RPC add_order_item_to_production_plan_atomic failed or not found, falling back to JS implementation:", error);
    } catch (rpcErr) {
      console.warn("RPC add_order_item_to_production_plan_atomic invocation failed, falling back to JS implementation:", rpcErr);
    }

    // 2. Fallback JS Implementation (atomic & robust)
    // Get the customer ID from the order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('id', orderId)
      .single();
    if (orderErr) throw orderErr;

    // Check if item already exists and is active (is_deleted = false)
    const { data: existing, error: existErr } = await supabase
      .from('production_plan_items')
      .select('id')
      .eq('production_plan_id', productionPlanId)
      .eq('order_item_id', orderItemId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (existErr) throw existErr;

    if (existing) {
      return {
        success: true,
        id: existing.id,
        message: 'Bu sipariş kalemi zaten bu plana eklenmiş.',
        inserted: false
      };
    }

    const newItemId = 'ppi_' + generateId();
    const { error: insErr } = await supabase
      .from('production_plan_items')
      .insert({
        id: newItemId,
        production_plan_id: productionPlanId,
        order_id: orderId,
        order_item_id: orderItemId,
        customer_id: order.customer_id,
        product_id: productId,
        planned_quantity: Number(plannedQuantity),
        produced_quantity: 0,
        status: 'Planlandı',
        note: '',
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    if (insErr) throw insErr;

    // Update order status/computed status to 'Üretim Planlandı'
    const { error: updErr } = await supabase
      .from('orders')
      .update({
        status: 'Üretim Planlandı',
        computed_status: 'Üretim Planlandı',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    if (updErr) throw updErr;

    return {
      success: true,
      id: newItemId,
      message: 'Sipariş başarıyla plana eklendi.',
      inserted: true
    };
  },

  async closeProductionPlanAndCarryOverAtomic(
    sourcePlanId: string,
    actions: CloseProductionPlanAction[]
  ): Promise<any> {
    try {
      const mappedActions = actions.map(act => {
        let rpcAction = '';
        if (act.action === 'carry_tomorrow') {
          rpcAction = 'tomorrow';
        } else if (act.action === 'carry_date') {
          rpcAction = 'custom';
        } else if (act.action === 'close_without_carry') {
          rpcAction = 'close_without_carry';
        } else {
          rpcAction = act.action; // fallback
        }

        if ((rpcAction === 'tomorrow' || rpcAction === 'custom') && !act.targetDate) {
          throw new Error(`${act.planItemId} kimlikli devir kalemi için hedef tarih (targetDate) belirtilmemiş.`);
        }

        return {
          plan_item_id: act.planItemId,
          action: rpcAction,
          target_date: act.targetDate || null
        };
      });

      const { data, error } = await supabase.rpc('close_production_plan_and_carry_over_atomic', {
        p_source_plan_id: sourcePlanId,
        p_actions: mappedActions
      });

      if (error) {
        console.error("RPC close_production_plan_and_carry_over_atomic failed details:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      if (data === null || data === undefined) {
        throw new Error("Sunucudan boş yanıt döndü (Data is null or undefined).");
      }

      if (data.success === false) {
        throw new Error(data.error || data.message || "İşlem başarısız oldu.");
      }

      return data;
    } catch (err: any) {
      console.error("close_production_plan_and_carry_over_atomic execution caught error:", err);
      throw err;
    }
  },

  async getProductionPlanItems(): Promise<ProductionPlanItem[]> {
    const { data, error } = await supabase
      .from('production_plan_items')
      .select('*');
    if (error) throw error;
    return (data || []).map(dbToProductionPlanItem);
  },

  async saveProductionPlanItems(list: ProductionPlanItem[]): Promise<void> {
    const mapped = list.map(productionPlanItemToDb);
    await upsertRows('production_plan_items', mapped);
  },

  // --- FINISHED GOODS STOCK ---
  async getFinishedGoods(): Promise<FinishedGoodsStock[]> {
    const { data, error } = await supabase
      .from('finished_goods_stocks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToFinishedGoodsStock);
  },

  async addFinishedGood(item: Omit<FinishedGoodsStock, 'id' | 'createdAt' | 'updatedAt'>): Promise<FinishedGoodsStock> {
    const newId = 'fg_' + generateId();
    const fullItem = {
      ...item,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const mapped = finishedGoodsStockToDb(fullItem);
    const { data, error } = await supabase
      .from('finished_goods_stocks')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToFinishedGoodsStock(data);
  },

  async updateFinishedGood(id: string, updates: Partial<FinishedGoodsStock>): Promise<FinishedGoodsStock> {
    const { data: existing, error: getErr } = await supabase
      .from('finished_goods_stocks')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;

    const existingObj = dbToFinishedGoodsStock(existing);
    const updatedObj = {
      ...existingObj,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const mapped = finishedGoodsStockToDb(updatedObj);
    const { data, error } = await supabase
      .from('finished_goods_stocks')
      .update(mapped)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbToFinishedGoodsStock(data);
  },

  async deleteFinishedGood(id: string): Promise<void> {
    const { error } = await supabase
      .from('finished_goods_stocks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- FINISHED GOODS MOVEMENTS ---
  async getFinishedGoodsMovements(): Promise<any[]> {
    const { data, error } = await supabase
      .from('finished_goods_movements')
      .select('*');
    if (error) throw error;
    return (data || []).map(dbToFinishedGoodsMovement);
  },

  async saveFinishedGoodsMovements(list: any[]): Promise<void> {
    const mapped = list.map(finishedGoodsMovementToDb);
    await upsertRows('finished_goods_movements', mapped);
  },

  // --- WASTE RECORDS ---
  async getWasteRecords(): Promise<WasteRecord[]> {
    const { data, error } = await supabase
      .from('waste_records')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToWasteRecord);
  },

  async addWasteRecord(rec: Omit<WasteRecord, 'id' | 'wasteRate' | 'yieldRate'>): Promise<WasteRecord> {
    const wasteRate = rec.inputQuantity > 0 ? (rec.wasteQuantity / rec.inputQuantity) * 100 : 0;
    const yieldRate = rec.inputQuantity > 0 ? (rec.usableQuantity / rec.inputQuantity) * 100 : 100;
    const fullRec = {
      ...rec,
      id: 'waste_' + generateId(),
      wasteRate,
      yieldRate
    };
    const mapped = wasteRecordToDb(fullRec);
    const { data, error } = await supabase
      .from('waste_records')
      .insert([mapped])
      .select()
      .single();
    if (error) throw error;
    return dbToWasteRecord(data);
  },

  async deleteWasteRecord(id: string): Promise<void> {
    const { error } = await supabase
      .from('waste_records')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async saveWasteRecords(list: WasteRecord[]): Promise<void> {
    const mapped = list.map(wasteRecordToDb);
    await upsertRows('waste_records', mapped);
  },

  // --- COST SETTINGS ---
  async getCostSettings(): Promise<CostSettings> {
    const { data, error } = await supabase
      .from('cost_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return dbToCostSettings(data);
  },

  async saveCostSettings(settings: CostSettings): Promise<void> {
    const mapped = costSettingsToDb(settings);
    const { data: existing, error: selectError } = await supabase
      .from("cost_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("cost_settings")
        .update(mapped)
        .eq("id", existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("cost_settings")
        .insert(mapped);
      if (insertError) throw insertError;
    }
  },

  // --- PRODUCTION RUNS ---
  async getProductionRuns(): Promise<any[]> {
    const { data, error } = await supabase
      .from('production_runs')
      .select('*');
    if (error) throw error;
    return (data || []).map(dbToProductionRun);
  },

  async saveProductionRuns(list: any[]): Promise<void> {
    const mapped = list.map(productionRunToDb);
    await upsertRows('production_runs', mapped);
  },

  async saveCustomers(list: Customer[]): Promise<void> {
    const mapped = list.map(customerToDb);
    await upsertRows('customers', mapped);
  },

  async saveRawMaterials(list: RawMaterial[]): Promise<void> {
    const mapped = list.map(rawMaterialToDb);
    await upsertRows('raw_materials', mapped);
  },

  async saveProducts(list: Product[]): Promise<void> {
    const mapped = list.map(productToDb);
    await upsertRows('products', mapped);
  },

  async saveRecipes(list: ProductRecipeItem[]): Promise<void> {
    const mapped = list.map(recipeToDb);
    await upsertRows('product_recipes', mapped);
  },

  async saveOrders(list: Order[]): Promise<void> {
    const mapped = list.map(orderToDb);
    await upsertRows('orders', mapped);
  },

  async saveStockMovements(list: StockMovement[]): Promise<void> {
    const mapped = list.map(stockMovementToDb);
    await upsertRows('stock_movements', mapped);
  },

  async saveProductionPlans(list: ProductionPlan[]): Promise<void> {
    const mapped = list.map(productionPlanToDb);
    await upsertRows('production_plans', mapped);
  },

  async saveFinishedGoods(list: FinishedGoodsStock[]): Promise<void> {
    const mapped = list.map(finishedGoodsStockToDb);
    await upsertRows('finished_goods_stocks', mapped);
  },

  // --- SUPPLIERS, RECEIPTS & LOTS (Purchase Integrations) ---
  async getSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(dbToSupplier);
  },

  async getRawMaterialReceipts(): Promise<RawMaterialReceipt[]> {
    const { data, error } = await supabase
      .from('raw_material_receipts')
      .select('*')
      .eq('is_deleted', false)
      .order('receipt_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToRawMaterialReceipt);
  },

  async getRawMaterialLots(): Promise<RawMaterialLot[]> {
    const { data, error } = await supabase
      .from('raw_material_lots')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(dbToRawMaterialLot);
  },

  async createOrGetSupplierAtomic(name: string, note?: string): Promise<{ supplierId: string; name: string; created: boolean }> {
    const { data, error } = await supabase.rpc('create_or_get_supplier_atomic', {
      p_name: name,
      p_note: note || null
    });
    if (error) throw error;
    return {
      supplierId: data.supplierId || data.supplier_id,
      name: data.name,
      created: !!(data.created || data.already_exists === false)
    };
  },

  async createRawMaterialReceiptAtomic(input: CreateRawMaterialReceiptInput): Promise<any> {
    const { data, error } = await supabase.rpc('create_raw_material_receipt_atomic', {
      p_supplier_id: input.supplierId,
      p_receipt_date: input.receiptDate,
      p_lines: input.lines,
      p_idempotency_key: input.idempotencyKey,
      p_invoice_number: input.invoiceNumber || null,
      p_dispatch_note_number: input.dispatchNoteNumber || null,
      p_note: input.note || null
    });
    if (error) throw error;
    return data;
  }
};

// ==========================================
// MIGRATION AND UTILITY FUNCTIONS
// ==========================================

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  isAdmin: boolean;
  userEmail: string;
  message: string;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        isAdmin: false,
        userEmail: '',
        message: 'Supabase oturumu bulunamadı. Lütfen giriş yapın.'
      };
    }

    const { data: isAdmin, error } = await supabase.rpc('is_freshops_admin');
    if (error) {
      console.error("is_freshops_admin RPC error:", error);
      return {
        success: true,
        isAdmin: false,
        userEmail: session.user?.email || '',
        message: `Bağlantı başarılı fakat yetki kontrolü başarısız oldu: ${error.message}`
      };
    }

    return {
      success: true,
      isAdmin: !!isAdmin,
      userEmail: session.user?.email || '',
      message: isAdmin ? 'Bağlantı başarılı ve admin yetkisi doğrulandı.' : 'Bağlantı başarılı fakat admin yetkisi bulunmuyor.'
    };
  } catch (err: any) {
    console.error("testSupabaseConnection exception:", err);
    return {
      success: false,
      isAdmin: false,
      userEmail: '',
      message: `Bağlantı hatası: ${err.message || err}`
    };
  }
}

async function countTableRows(tableName: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Error counting table ${tableName}:`, error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`Exception counting table ${tableName}:`, err);
    return 0;
  }
}

export async function countSupabaseRows(): Promise<Record<string, number>> {
  const tableNames = [
    'customers',
    'raw_materials',
    'products',
    'product_recipes',
    'orders',
    'order_items',
    'production_plans',
    'production_plan_items',
    'stock_movements',
    'finished_goods_stocks',
    'finished_goods_movements',
    'production_runs',
    'cost_settings'
  ];

  const counts: Record<string, number> = {};
  for (const name of tableNames) {
    counts[name] = await countTableRows(name);
  }
  return counts;
}

export async function migrateLocalDataToSupabase(): Promise<{
  success: boolean;
  message: string;
  counts: Record<string, number>;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Supabase yetki hatası: Admin oturumu doğrulanamadı.");
  }

  const counts: Record<string, number> = {};

  // For migration, we simply load whatever is currently in localStorage and upload them using our new mapper functions
  const runMigration = async <T,>(
    tableName: string,
    localData: T[],
    mapper: (item: T) => any
  ) => {
    if (localData && localData.length > 0) {
      const mapped = localData.map(mapper);
      const res = await upsertRows(tableName, mapped);
      counts[tableName] = res.count;
    } else {
      counts[tableName] = 0;
    }
  };

  try {
    const { localDataService } = await import('./localDataService');
    
    await runMigration('customers', localDataService.getCustomers(), customerToDb);
    await runMigration('raw_materials', localDataService.getRawMaterials(), rawMaterialToDb);
    await runMigration('products', localDataService.getProducts(), productToDb);
    await runMigration('product_recipes', localDataService.getRecipes(), recipeToDb);
    await runMigration('orders', localDataService.getOrders(), orderToDb);
    await runMigration('order_items', localDataService.getOrderItems(), orderItemToDb);
    await runMigration('production_plans', localDataService.getProductionPlans(), productionPlanToDb);
    await runMigration('production_plan_items', localDataService.getProductionPlanItems(), productionPlanItemToDb);
    await runMigration('stock_movements', localDataService.getStockMovements(), stockMovementToDb);
    await runMigration('finished_goods_stocks', localDataService.getFinishedGoods(), finishedGoodsStockToDb);
    await runMigration('finished_goods_movements', localDataService.getFinishedGoodsMovements(), finishedGoodsMovementToDb);
    await runMigration('production_runs', localDataService.getProductionRuns(), productionRunToDb);
    
    // cost_settings
    const costSettings = localDataService.getCostSettings();
    if (costSettings) {
      await supabaseDataService.saveCostSettings(costSettings);
      counts['cost_settings'] = 1;
    }

    return {
      success: true,
      message: 'Tüm local veriler başarıyla Supabase tablolarına aktarıldı.',
      counts
    };
  } catch (err: any) {
    console.error("migrateLocalDataToSupabase error:", err);
    return {
      success: false,
      message: `${err.message || err}`,
      counts
    };
  }
}

export async function resetAllFreshOpsData() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Supabase oturumu bulunamadı. Lütfen tekrar giriş yapın.");
  }

  const { data, error } = await supabase.rpc("reset_all_freshops_data");
  if (error) {
    console.error("Supabase reset RPC error:", error);
    throw error;
  }
  return data;
}
