export type CustomerType = 'Otel' | 'Kafe' | 'Restoran' | 'Catering' | 'Market' | 'Kurumsal' | 'Diğer';

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  phone: string;
  email: string;
  address: string;
  deliveryNote: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
}

export type RawMaterialCategory = 'Meyve' | 'Sebze' | 'Ambalaj' | 'Yardımcı Malzeme' | 'Diğer';
export type RawMaterialUnit = 'kg' | 'adet' | 'paket';

export interface RawMaterial {
  id: string;
  name: string;
  category: RawMaterialCategory;
  unit: RawMaterialUnit;
  purchasePrice: number;
  averageCost?: number; // Hareketli ağırlıklı ortalama maliyet
  defaultWasteRate: number; // in percent (e.g., 40 for 40%)
  defaultYieldRate: number; // in percent (e.g., 60 for 60%)
  criticalStockLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  currentStock?: number;
}

export type ProductCategory = 'Ananas' | 'Meyve Mix' | 'Sebze Mix' | 'Salata Mix' | 'Tekli Meyve' | 'Tekli Sebze' | 'Diğer';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  packageWeightGrams: number;
  salePrice: number;
  defaultSafetyRate: number; // in percent (e.g., 3 for 3%)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  lotPrefix?: string;
}

export interface ProductRecipeItem {
  id: string;
  productId: string;
  rawMaterialId: string;
  quantity: number; // quantity in recipe (e.g., grams for kg, or count for pieces)
  unit: 'g' | 'adet' | 'paket';
  wasteRateOverride?: number; // custom waste rate if overridden
  notes?: string;
}

export type StockMovementType = 'Stok Girişi' | 'Stok Çıkışı' | 'Fire Çıkışı' | 'Üretim Tüketimi' | 'Sayım Düzeltmesi' | 'Giriş' | 'Çıkış' | 'Fire' | 'Düzeltme' | 'Üretim tüketimi' | 'Üretim Silme İadesi' | 'Üretim Geri Alma';

export interface StockMovement {
  id: string;
  rawMaterialId: string;
  type: StockMovementType;
  quantity: number;
  unit?: string;
  date: string;
  note: string;
  createdAt: string;
  unitPrice?: number;
  totalCost?: number;
  productionPlanId?: string;
  productionPlanItemId?: string;
  orderId?: string;
  orderItemId?: string;
  productId?: string;
  productionRunId?: string;
  isDeleted?: boolean;
  isDemo?: boolean;
}

export type OrderStatus = 'Taslak' | 'Onaylandı' | 'Üretim Planlandı' | 'Üretildi' | 'Sevkiyata Hazır' | 'Kısmi Sevk' | 'Sevk Edildi' | 'İptal';
export type OrderApprovalStatus = 'Taslak' | 'Onaylandı' | 'İptal';
export type OrderComputedStatus = 'Taslak' | 'Onaylandı' | 'Üretim Planlandı' | 'Üretildi' | 'Sevkiyata Hazır' | 'Kısmi Sevk' | 'Sevk Edildi' | 'İptal';

export interface Order {
  id: string;
  orderNumber?: string;
  customerId: string;
  orderDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  status: OrderStatus;
  approvalStatus: OrderApprovalStatus;
  computedStatus: OrderComputedStatus;
  totalAmount?: number;
  realizedAmount?: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  costSettingsSnapshot?: {
    defaultSafetyRate: number;
    laborCostPerPackage: number;
    overheadCostPerPackage: number;
    deliveryCostPerPackage: number;
  };
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unit?: string;
  unitSalePrice: number;
  totalPrice?: number;
  safetyRateOverride?: number;
  wasteRateOverrides?: Record<string, number>; // rawMaterialId -> wasteRate override
  note?: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductionPlanStatus = 'Bekliyor' | 'Hazırlanıyor' | 'Üretimde' | 'Tamamlandı' | 'Eksik üretildi' | 'İptal' | 'Planlandı' | 'Kısmi Üretildi' | 'Boş Plan' | 'Planın Gerisinde' | 'Plan Üstü Üretim' | 'Eksikle Kapatıldı' | 'Devirle Tamamlandı' | 'Sonraki Günde Tamamlandı';

export interface ProductionPlan {
  id: string;
  productionDate: string; // YYYY-MM-DD
  date?: string; // YYYY-MM-DD for backward compatibility
  status: ProductionPlanStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  closedAt?: string;
  closedWithShortage?: boolean;
  carriedOverToPlanIds?: string[];
  isDeleted?: boolean;
  isDemo?: boolean;
  isLocked?: boolean;
  lockedAt?: string;
  lockedReason?: string;
}

export interface ProductionPlanItem {
  id: string;
  productionPlanId: string;
  orderId: string;
  orderItemId: string;
  customerId: string;
  productId: string;
  plannedQuantity: number;
  producedQuantity: number;
  status: ProductionPlanStatus;
  note: string;
  rawMaterialsDeducted?: boolean;
  deductedAt?: string;
  deductionMovementIds?: string[];
  finishedGoodsCreated?: boolean;
  finishedGoodsStockId?: string;
  estimatedTotalCost?: number;
  unitCost?: number;
  isCarryOver?: boolean;
  sourceCarryOverFromPlanId?: string;
  sourceCarryOverFromPlanItemId?: string;
  carryOverReason?: string;
  carryOverCreatedAt?: string;
  carryOverQuantityTotal?: number;
  carryOverSources?: {
    planId: string;
    planItemId: string;
    quantity: number;
    date: string;
  }[];
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedReason?: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedReason?: string;
}

export type FinishedGoodsStatus = 'Stokta' | 'Sevkiyata Hazır' | 'Sevk Edildi' | 'İptal' | 'Fire' | 'Kısmi Sevk';

export interface FinishedGoodsStock {
  id: string;
  productId: string;
  customerId: string;
  orderId: string;
  orderItemId: string;
  productionPlanId: string;
  productionPlanItemId: string;
  productionRunId?: string;
  productionDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  quantityProduced: number;
  quantityRemaining: number;
  status: FinishedGoodsStatus;
  unitCost: number;
  totalCost: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  lotNo?: string;
  lotDate?: string;
  lotDateOffsetDays?: number;
}

export type FinishedGoodsMovementType = 'Üretim girişi' | 'Sevkiyat çıkışı' | 'Fire çıkışı' | 'İptal' | 'Sayım düzeltmesi' | 'Üretim Geri Alındı' | 'Üretim Geri Alma';

export interface FinishedGoodsMovement {
  id: string;
  finishedGoodsStockId: string;
  productId: string;
  customerId: string;
  orderId: string;
  orderItemId: string;
  type: FinishedGoodsMovementType;
  quantity: number;
  date: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  productionRunId?: string;
  movementType?: string;
  isShipment?: boolean;
  reason?: string;
  previousQuantity?: number;
  newQuantity?: number;
  difference?: number;
  adjustmentQuantity?: number;
  lotNo?: string;
}

export type WasteReason = 'Kabuk' | 'Çekirdek' | 'Ezilme' | 'Çürük' | 'Gramaj sapması' | 'Üretim hatası' | 'Müşteri iptali' | 'Diğer';

export interface WasteRecord {
  id: string;
  rawMaterialId: string;
  productId?: string;
  productionPlanId?: string;
  inputQuantity: number; // ham miktar
  usableQuantity: number; // kullanılabilir net miktar
  wasteQuantity: number; // fire miktarı
  wasteRate: number; // calculated %
  yieldRate: number; // calculated %
  reason: WasteReason;
  date: string; // YYYY-MM-DD
  note: string;
}

export interface CostSettings {
  defaultSafetyRate: number;
  laborCostPerPackage: number;
  overheadCostPerPackage: number;
  deliveryCostPerPackage: number;
  useAverageWasteRate: boolean; // Settings option: Son 30 gün fire ortalamasını öneri olarak göster/kullan
  stockWarningThreshold: number; // Stok uyarı eşiği
  lotDateOffsetDays?: number;
  currency?: string;
}

export interface ProductionRun {
  id: string;
  productionPlanId: string;
  productionPlanItemId: string;
  orderId: string;
  orderItemId: string;
  customerId: string;
  productId: string;
  producedQuantity: number;
  productionDate: string;
  note: string;
  rawMaterialsDeducted?: boolean;
  rawMaterialMovementIds?: string[];
  finishedGoodsCreated?: boolean;
  finishedGoodsStockId?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  isDemo?: boolean;
  lotNo?: string;
  lotDate?: string;
  lotDateOffsetDays?: number;
}

export interface CloseProductionPlanAction {
  planItemId: string;
  action: 'carry_tomorrow' | 'carry_date' | 'close_without_carry';
  targetDate?: string;
  plan_item_id?: string;  // snake_case backup
  target_date?: string;  // snake_case backup
}

// New Raw Material Purchase & Lot Traceability Types
export type KunyeStatus = 'provided' | 'internal_placeholder' | 'not_applicable';

export interface Supplier {
  id: string;
  name: string;
  note?: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RawMaterialReceipt {
  id: string;
  supplierId: string;
  receiptDate: string;
  invoiceNumber?: string;
  dispatchNoteNumber?: string;
  note?: string;
  idempotencyKey?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RawMaterialLot {
  id: string;
  rawMaterialReceiptId: string;
  rawMaterialId: string;
  inboundStockMovementId: string;
  internalLotNo: string;
  kunyeNumber: string | null;
  kunyeStatus: KunyeStatus;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: number;
  note?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RawMaterialReceiptCorrectionModalLot = RawMaterialLot & {
  hasProductionUsageHistory?: boolean;
};

export interface RawMaterialReceiptLineInput {
  raw_material_id: string;
  quantity: number;
  unit_price: number;
  kunye_number: string | null;
  kunye_status: KunyeStatus;
  note?: string | null;
}

export interface CreateRawMaterialReceiptInput {
  supplierId: string;
  receiptDate: string;
  lines: RawMaterialReceiptLineInput[];
  idempotencyKey: string;
  invoiceNumber?: string;
  dispatchNoteNumber?: string;
  note?: string;
}

export interface CreateRawMaterialReceiptResult {
  receipt_id: string;
  already_created: boolean;
}

export interface CreateOrGetSupplierResult {
  supplier_id: string;
  already_exists: boolean;
}

export interface UpdateRawMaterialReceiptLineInput {
  lotId: string;
  unitPrice: number;
  quantityReceived: number;
  kunyeStatus: KunyeStatus;
  kunyeNumber: string | null;
  note?: string | null;
}

export interface UpdateRawMaterialReceiptInput {
  receiptId: string;
  expectedUpdatedAt: string;
  lines: UpdateRawMaterialReceiptLineInput[];
  reason: string;
  invoiceNumber?: string | null;
  dispatchNoteNumber?: string | null;
  note?: string | null;
}

export interface UpdateRawMaterialReceiptResult {
  success: boolean;
  noChanges: boolean;
  receiptId: string;
  updatedAt: string;
  correctionId: string | null;
  updatedLots: {
    lotId: string;
    kunyeStatus: KunyeStatus;
    kunyeNumber: string | null;
    note: string | null;
    unitPrice: number;
    quantityReceived: number;
    quantityRemaining: number;
  }[];
  recalculatedRawMaterials: {
    rawMaterialId: string;
    purchasePrice: number;
    averageCost: number;
  }[];
}

export interface RawMaterialReceiptCorrectionState {
  receipt: {
    id: string;
    supplier_id: string;
    receipt_date: string;
    invoice_number: string | null;
    dispatch_note_number: string | null;
    note: string | null;
    updated_at: string;
  };
  lots: {
    id: string;
    raw_material_id: string;
    unit_price: number;
    kunye_status: KunyeStatus;
    kunye_number: string | null;
    note: string | null;
    quantity_received: number;
    quantity_remaining: number;
    inbound_stock_movement_id?: string;
  }[];
  stock_movements: {
    id: string;
    raw_material_id: string;
    movement_type: string;
    quantity: number;
    unit_price: number;
    total_cost: number;
    previous_stock: number;
    new_stock: number;
    movement_date: string;
    created_at: string;
    source_type: string;
    source_id: string;
    note: string | null;
    is_deleted: boolean;
  }[];
  raw_materials: {
    id: string;
    purchase_price: number;
    average_cost: number;
    current_stock?: number;
  }[];
}

export interface RawMaterialReceiptCorrection {
  id: string;
  organizationId: string;
  rawMaterialReceiptId: string;
  beforeState: RawMaterialReceiptCorrectionState;
  afterState: RawMaterialReceiptCorrectionState;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

// Production Lot Traceability Types
export interface ProductionTraceabilityRawMaterial {
  id: string;
  name: string;
  unit: string;
}

export interface ProductionTraceabilityRawMaterialLot {
  id: string;
  internalLotNo: string;
  kunyeNumber: string;
  kunyeStatus: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: number;
  isDeleted: boolean;
}

export interface ProductionTraceabilityReceipt {
  id: string;
  receiptDate: string;
  invoiceNumber: string | null;
  dispatchNoteNumber: string | null;
  note: string | null;
  isDeleted: boolean;
}

export interface ProductionTraceabilitySupplier {
  id: string;
  name: string;
  note: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface ProductionTraceabilityStockMovement {
  id: string;
  movementType: string;
  movementDate: string;
  quantity: number;
  isDeleted: boolean;
}

export interface ProductionTraceabilityAllocation {
  allocationId: string;
  allocationMethod: string;
  quantityConsumed: number;
  unit: string;
  isReversed: boolean;
  reversedAt: string | null;
  reversalReason: string | null;
  rawMaterial: ProductionTraceabilityRawMaterial;
  rawMaterialLot: ProductionTraceabilityRawMaterialLot;
  receipt: ProductionTraceabilityReceipt;
  supplier: ProductionTraceabilitySupplier;
  stockMovement: ProductionTraceabilityStockMovement;
}

export interface ProductionTraceabilityRun {
  id: string;
  status: string;
  producedQuantity: number;
  productionPlanId: string;
  productionPlanItemId: string;
  orderId: string | null;
  orderItemId: string | null;
  productId: string;
  customerId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
  createdAt: string;
}

export interface ProductionTraceabilityFinishedGoodsStock {
  id: string;
  lotNo: string;
  quantityProduced: number;
  quantityRemaining: number;
  unit: string;
  status: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
}

export interface ProductionTraceabilityOrder {
  id: string;
  orderNumber: string;
  status: string;
  computedStatus: string;
}

export interface ProductionTraceabilityProduct {
  id: string;
  name: string;
}

export interface ProductionTraceabilityResponse {
  success: boolean;
  productionRun: ProductionTraceabilityRun;
  finishedGoodsStock: ProductionTraceabilityFinishedGoodsStock | null;
  order: ProductionTraceabilityOrder | null;
  product: ProductionTraceabilityProduct | null;
  allocations: ProductionTraceabilityAllocation[];
}

export interface OrderTraceabilityOrder {
  id: string;
  customerId: string | null;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string;
  status: string;
  computedStatus: string;
  approvalStatus: string;
  totalAmount: number;
  realizedAmount: number;
  note: string | null;
  isDeleted: boolean;
}

export interface OrderTraceabilityCustomer {
  id: string;
  name: string;
}

export interface OrderTraceabilityOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string | null;
  orderedQuantity: number;
  unitSalePrice: number;
  isDeleted: boolean;
}

export interface OrderTraceabilityShipmentMovement {
  id: string;
  finishedGoodsStockId: string | null;
  productionRunId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  productId: string | null;
  productName: string | null;
  finishedGoodsLotNo: string | null;
  movementType: string;
  quantity: number;
  unit: string;
  movementDate: string;
  previousQuantity: number | null;
  newQuantity: number | null;
  difference: number | null;
  isShipment: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
  note: string | null;
  createdAt: string;
}

export interface OrderTraceabilityResponse {
  success: boolean;
  order: OrderTraceabilityOrder;
  customer: OrderTraceabilityCustomer | null;
  orderItems: OrderTraceabilityOrderItem[];
  productionRuns: ProductionTraceabilityResponse[];
  shipmentMovements: OrderTraceabilityShipmentMovement[];
}

export interface SupplierTraceabilitySupplier {
  id: string;
  name: string;
  note: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface SupplierTraceabilityRawMaterial {
  id: string;
  name: string;
  unit: string;
}

export interface SupplierTraceabilityInboundStockMovement {
  id: string;
  movementType: string;
  movementDate: string;
  quantity: number;
  isDeleted: boolean;
  previousStock: number | null;
  newStock: number | null;
  unitPrice: number | null;
}

export interface SupplierTraceabilityProductionRun {
  id: string;
  status: string;
  producedQuantity: number;
  productionDate: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedReason: string | null;
  createdAt: string;
}

export interface SupplierTraceabilityFinishedGoodsStock {
  id: string;
  lotNo: string;
  quantityProduced: number;
  quantityRemaining: number;
  unit: string;
  status: string;
  isDeleted: boolean;
}

export interface SupplierTraceabilityOrder {
  id: string;
  orderNumber: string;
  status: string;
  computedStatus: string | null;
}

export interface SupplierTraceabilityCustomer {
  id: string;
  name: string;
}

export interface SupplierTraceabilityProduct {
  id: string;
  name: string;
}

export interface SupplierTraceabilityProductionUsage {
  allocationId: string;
  allocationMethod: string;
  productionRunId: string;
  quantityConsumed: number;
  unit: string;
  isReversed: boolean;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  productionRun: SupplierTraceabilityProductionRun;
  finishedGoodsStock: SupplierTraceabilityFinishedGoodsStock | null;
  order: SupplierTraceabilityOrder | null;
  customer: SupplierTraceabilityCustomer | null;
  product: SupplierTraceabilityProduct | null;
}

export interface SupplierTraceabilityLot {
  id: string;
  internalLotNo: string;
  kunyeNumber: string | null;
  kunyeStatus: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: number;
  note: string | null;
  inboundStockMovementId: string;
  isDeleted: boolean;
  createdAt: string;
  rawMaterial: SupplierTraceabilityRawMaterial;
  inboundStockMovement: SupplierTraceabilityInboundStockMovement;
  productionUsages: SupplierTraceabilityProductionUsage[];
}

export interface SupplierTraceabilityReceipt {
  id: string;
  supplierId: string;
  receiptDate: string;
  invoiceNumber: string | null;
  dispatchNoteNumber: string | null;
  note: string | null;
  idempotencyKey: string | null;
  isDeleted: boolean;
  createdAt: string;
  lots: SupplierTraceabilityLot[];
}

export interface SupplierTraceabilityResponse {
  success: boolean;
  supplier: SupplierTraceabilitySupplier;
  receipts: SupplierTraceabilityReceipt[];
}





