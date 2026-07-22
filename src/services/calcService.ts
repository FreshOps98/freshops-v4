import { 
  Customer, 
  RawMaterial, 
  Product, 
  ProductRecipeItem, 
  Order, 
  OrderItem, 
  CostSettings,
  StockMovement,
  ProductionPlan,
  ProductionPlanItem,
  ProductionPlanStatus,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  OrderApprovalStatus,
  OrderComputedStatus,
  ProductionRun
} from '../types';
import { USE_SUPABASE } from './dataService';

export function resolveCostSettingsForOrder(
  settings: CostSettings,
  order?: { costSettingsSnapshot?: any }
): CostSettings {
  if (!order || !order.costSettingsSnapshot) {
    return settings;
  }
  const snap = order.costSettingsSnapshot;
  return {
    ...settings,
    defaultSafetyRate: snap.defaultSafetyRate !== undefined && snap.defaultSafetyRate !== null ? snap.defaultSafetyRate : settings.defaultSafetyRate,
    laborCostPerPackage: snap.laborCostPerPackage !== undefined && snap.laborCostPerPackage !== null ? snap.laborCostPerPackage : settings.laborCostPerPackage,
    overheadCostPerPackage: snap.overheadCostPerPackage !== undefined && snap.overheadCostPerPackage !== null ? snap.overheadCostPerPackage : settings.overheadCostPerPackage,
    deliveryCostPerPackage: snap.deliveryCostPerPackage !== undefined && snap.deliveryCostPerPackage !== null ? snap.deliveryCostPerPackage : settings.deliveryCostPerPackage,
  };
}

export function resolveCostSettingsForOrderId(
  settings: CostSettings,
  orderId: string | undefined,
  orders: Order[]
): CostSettings {
  if (!orderId || !orders) return settings;
  const order = orders.find(o => o.id === orderId);
  return resolveCostSettingsForOrder(settings, order);
}

export function calculateWeightedAverageCost(
  rawMaterialId: string,
  stockMovements: StockMovement[],
  fallbackPurchasePrice: number
): number {
  if (!stockMovements || stockMovements.length === 0) return fallbackPurchasePrice;

  // Filter for this raw material, excluding soft deleted
  const rawMovements = stockMovements.filter(
    m => m.rawMaterialId === rawMaterialId && !m.isDeleted
  );

  if (rawMovements.length === 0) return fallbackPurchasePrice;

  // Sort them chronologically by date, then createdAt, then ID
  const sortedMovements = [...rawMovements].sort((a, b) => {
    const dateCompare = (a.date || '').localeCompare(b.date || '');
    if (dateCompare !== 0) return dateCompare;
    const createA = a.createdAt || '';
    const createB = b.createdAt || '';
    const createdCompare = createA.localeCompare(createB);
    if (createdCompare !== 0) return createdCompare;
    return (a.id || '').localeCompare(b.id || '');
  });

  let currentQty = 0;
  let currentCost = fallbackPurchasePrice;
  let hasSetFirstCost = false;

  for (const m of sortedMovements) {
    const normType = (m.type || '').trim().toLowerCase().replace(/[-_]/g, ' ');
    const qty = m.quantity || 0;
    const price = m.unitPrice !== undefined && m.unitPrice !== null ? m.unitPrice : 0;

    // Determine if it is a purchase entry
    const isPurchase = 
      normType === 'stok girişi' || 
      normType === 'stok girisi' || 
      normType === 'giriş' || 
      normType === 'giris' || 
      normType === 'stock in' || 
      normType === 'stock_in';

    // Determine quantity change
    let qtyChange = 0;
    if (isPurchase) {
      qtyChange = qty;
    } else if (
      normType === 'stok çıkışı' || 
      normType === 'stok cikisi' || 
      normType === 'çıkış' || 
      normType === 'cikis' || 
      normType === 'stock out' || 
      normType === 'stock_out' ||
      normType === 'fire çıkışı' || 
      normType === 'fire cikisi' || 
      normType === 'fire' ||
      normType === 'üretim tüketimi' || 
      normType === 'uretim tuketimi' || 
      normType === 'production consumption' || 
      normType === 'production_consumption' || 
      normType === 'production-consumption'
    ) {
      qtyChange = -qty;
    } else if (
      normType === 'üretim silme iadesi' ||
      normType === 'uretim silme iadesi' ||
      normType === 'üretim geri alma' ||
      normType === 'uretim geri alma'
    ) {
      qtyChange = qty;
    } else if (
      normType === 'sayım düzeltmesi' || 
      normType === 'sayim duzeltmesi' || 
      normType === 'düzeltme' || 
      normType === 'duzeltme' || 
      normType === 'adjustment'
    ) {
      qtyChange = qty; // can be positive or negative
    }

    if (isPurchase && qtyChange > 0) {
      const actualPrice = price > 0 ? price : fallbackPurchasePrice;
      if (!hasSetFirstCost) {
        currentCost = actualPrice;
        hasSetFirstCost = true;
      } else {
        const prevQty = currentQty > 0 ? currentQty : 0;
        if (prevQty + qtyChange > 0) {
          currentCost = (prevQty * currentCost + qtyChange * actualPrice) / (prevQty + qtyChange);
        } else {
          currentCost = actualPrice;
        }
      }
      currentQty += qtyChange;
    } else {
      currentQty += qtyChange;
    }
  }

  return currentCost;
}

export function calculateNetRequirement(orderQuantity: number, recipeQuantity: number, unit: 'kg' | 'adet' | 'paket'): number {
  if (unit === 'kg') {
    return (orderQuantity * recipeQuantity) / 1000;
  }
  return orderQuantity * recipeQuantity;
}

export function isClosedOrderStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase().trim();
  return [
    "completed",
    "complete",
    "done",
    "closed",
    "shipped",
    "delivered",
    "fulfilled",
    "tamamlandı",
    "tamamlandi",
    "kapandı",
    "kapandi",
    "sevk edildi",
    "teslim edildi"
  ].includes(normalized);
}

export function getObjectNumberProperty(obj: any, keys: string[]): number {
  if (!obj) return 0;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const num = Number(obj[key]);
      if (!isNaN(num)) return num;
    }
  }
  return 0;
}

export function calculateDailyProductionBehind(
  date: string,
  productionPlans: any[],
  productionPlanItems: any[],
  productionRuns: any[]
) {
  const activePlans = (productionPlans || []).filter(p => !p.isDeleted && (p.productionDate === date || p.date === date));
  const activePlanIds = activePlans.map(p => p.id);
  const activeItems = (productionPlanItems || []).filter(pi => 
    !pi.isDeleted && 
    pi.status !== 'İptal' && 
    activePlanIds.includes(pi.productionPlanId)
  );

  let totalPlanned = 0;
  let totalProduced = 0;
  let behindItemsCount = 0;

  for (const item of activeItems) {
    const planned = getObjectNumberProperty(item, ['plannedQuantity', 'planned_quantity', 'planned', 'quantity']);
    const produced = getProducedQuantityForPlanItem(item.id, productionPlanItems, productionRuns);
    totalPlanned += planned;
    totalProduced += produced;
    if (planned > produced) {
      behindItemsCount++;
    }
  }

  const behind = Math.max(totalPlanned - totalProduced, 0);

  return {
    planned: totalPlanned,
    produced: totalProduced,
    behind: behind,
    behindItemsCount: behindItemsCount
  };
}

export function calculateSafetyAdjustedRequirement(netRequirement: number, safetyRate: number): number {
  return netRequirement * (1 + safetyRate / 100);
}

export function calculateYieldRate(wasteRate: number): number {
  return 100 - wasteRate;
}

export function calculateGrossRequirement(safetyAdjustedRequirement: number, wasteRate: number): number {
  if (wasteRate >= 100) return safetyAdjustedRequirement;
  const yieldRatio = 1 - wasteRate / 100;
  return safetyAdjustedRequirement / yieldRatio;
}

export function calculateEstimatedWaste(grossRequirement: number, safetyAdjustedRequirement: number): number {
  return Math.max(0, grossRequirement - safetyAdjustedRequirement);
}

export interface RawMaterialRequirement {
  rawMaterialId: string;
  rawMaterialName: string;
  category: string;
  unit: 'kg' | 'adet' | 'paket';
  netRequirement: number;
  safetyRate: number;
  safetyAdjustedRequirement: number;
  wasteRate: number;
  yieldRate: number;
  grossRequirement: number;
  estimatedWaste: number;
  purchasePrice: number;
  estimatedCost: number;
}

// Resolves safety rate according to priority
export function resolveSafetyRate(
  orderItem: Partial<OrderItem> | undefined,
  product: Product,
  settings: CostSettings
): number {
  if (orderItem && orderItem.safetyRateOverride !== undefined && orderItem.safetyRateOverride !== null) {
    return orderItem.safetyRateOverride;
  }
  if (product.defaultSafetyRate !== undefined && product.defaultSafetyRate !== null) {
    return product.defaultSafetyRate;
  }
  return settings.defaultSafetyRate;
}

// Resolves waste rate according to priority
export function resolveWasteRate(
  orderItem: Partial<OrderItem> | undefined,
  recipeItem: ProductRecipeItem,
  rawMaterial: RawMaterial
): number {
  if (orderItem && orderItem.wasteRateOverrides && orderItem.wasteRateOverrides[rawMaterial.id] !== undefined) {
    return orderItem.wasteRateOverrides[rawMaterial.id];
  }
  if (recipeItem.wasteRateOverride !== undefined && recipeItem.wasteRateOverride !== null) {
    return recipeItem.wasteRateOverride;
  }
  return rawMaterial.defaultWasteRate;
}

export function calculateRawMaterialRequirementsForOrder(
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[],
  orders?: Order[]
): RawMaterialRequirement[] {
  const requirementsMap: Record<string, RawMaterialRequirement> = {};

  for (const item of orderItems) {
    const product = products.find(p => p.id === item.productId);
    if (!product || !product.isActive) continue;

    const orderObj = orders?.find(o => o.id === item.orderId);
    const resolvedSettings = resolveCostSettingsForOrder(settings, orderObj);
    const safetyRate = resolveSafetyRate(item, product, resolvedSettings);
    const productRecipes = recipes.filter(r => r.productId === product.id);

    for (const recipe of productRecipes) {
      const rawMaterial = rawMaterials.find(rm => rm.id === recipe.rawMaterialId);
      if (!rawMaterial || !rawMaterial.isActive) continue;

      const wasteRate = resolveWasteRate(item, recipe, rawMaterial);
      const yieldRate = calculateYieldRate(wasteRate);

      const netReq = calculateNetRequirement(item.quantity, recipe.quantity, rawMaterial.unit);
      const safetyAdjReq = calculateSafetyAdjustedRequirement(netReq, safetyRate);
      const grossReq = calculateGrossRequirement(safetyAdjReq, wasteRate);
      const estimatedWaste = calculateEstimatedWaste(grossReq, safetyAdjReq);
      
      const purchasePrice = stockMovements 
        ? (rawMaterial.averageCost ?? calculateWeightedAverageCost(rawMaterial.id, stockMovements, rawMaterial.purchasePrice))
        : (rawMaterial.averageCost ?? rawMaterial.purchasePrice);
      const estimatedCost = grossReq * purchasePrice;

      if (requirementsMap[rawMaterial.id]) {
        // Accumulate requirements for same raw material
        const existing = requirementsMap[rawMaterial.id];
        
        // Since we aggregate, we'll calculate weighted wasteRate and safetyRate, or just combine quantities and compute averages.
        // For a combined display, sum up the quantities.
        existing.netRequirement += netReq;
        existing.safetyAdjustedRequirement += safetyAdjReq;
        existing.grossRequirement += grossReq;
        existing.estimatedWaste += estimatedWaste;
        existing.estimatedCost += estimatedCost;
        
        // Use average rates just as representation
        // (Weighted by netRequirement or simply current if uniform)
      } else {
        requirementsMap[rawMaterial.id] = {
          rawMaterialId: rawMaterial.id,
          rawMaterialName: rawMaterial.name,
          category: rawMaterial.category,
          unit: rawMaterial.unit,
          netRequirement: netReq,
          safetyRate,
          safetyAdjustedRequirement: safetyAdjReq,
          wasteRate,
          yieldRate,
          grossRequirement: grossReq,
          estimatedWaste,
          purchasePrice,
          estimatedCost
        };
      }
    }
  }

  return Object.values(requirementsMap);
}

export function calculateRawMaterialRequirementsForProductionPlan(
  planItems: { productId: string; quantity: number; orderItem?: OrderItem }[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[],
  orders?: Order[]
): RawMaterialRequirement[] {
  const requirementsMap: Record<string, RawMaterialRequirement> = {};

  for (const item of planItems) {
    const product = products.find(p => p.id === item.productId);
    if (!product) continue;

    const orderObj = orders?.find(o => o.id === item.orderItem?.orderId);
    const resolvedSettings = resolveCostSettingsForOrder(settings, orderObj);
    const safetyRate = resolveSafetyRate(item.orderItem, product, resolvedSettings);
    const productRecipes = recipes.filter(r => r.productId === product.id);

    for (const recipe of productRecipes) {
      const rawMaterial = rawMaterials.find(rm => rm.id === recipe.rawMaterialId);
      if (!rawMaterial) continue;

      const wasteRate = resolveWasteRate(item.orderItem, recipe, rawMaterial);
      const yieldRate = calculateYieldRate(wasteRate);

      const netReq = calculateNetRequirement(item.quantity, recipe.quantity, rawMaterial.unit);
      const safetyAdjReq = calculateSafetyAdjustedRequirement(netReq, safetyRate);
      const grossReq = calculateGrossRequirement(safetyAdjReq, wasteRate);
      const estimatedWaste = calculateEstimatedWaste(grossReq, safetyAdjReq);
      
      const purchasePrice = stockMovements
        ? (rawMaterial.averageCost ?? calculateWeightedAverageCost(rawMaterial.id, stockMovements, rawMaterial.purchasePrice))
        : (rawMaterial.averageCost ?? rawMaterial.purchasePrice);
      const estimatedCost = grossReq * purchasePrice;

      if (requirementsMap[rawMaterial.id]) {
        const existing = requirementsMap[rawMaterial.id];
        existing.netRequirement += netReq;
        existing.safetyAdjustedRequirement += safetyAdjReq;
        existing.grossRequirement += grossReq;
        existing.estimatedWaste += estimatedWaste;
        existing.estimatedCost += estimatedCost;
      } else {
        requirementsMap[rawMaterial.id] = {
          rawMaterialId: rawMaterial.id,
          rawMaterialName: rawMaterial.name,
          category: rawMaterial.category,
          unit: rawMaterial.unit,
          netRequirement: netReq,
          safetyRate,
          safetyAdjustedRequirement: safetyAdjReq,
          wasteRate,
          yieldRate,
          grossRequirement: grossReq,
          estimatedWaste,
          purchasePrice,
          estimatedCost
        };
      }
    }
  }

  return Object.values(requirementsMap);
}

export interface StockAvailability {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: 'kg' | 'adet' | 'paket';
  currentStock: number;
  criticalStockLevel: number;
  requiredAmount: number;
  status: 'Yeterli' | 'Kritik' | 'Eksik';
  missingAmount: number;
}

export function calculateStockAvailability(
  requirements: { rawMaterialId: string; grossRequirement: number }[],
  rawMaterials: RawMaterial[],
  currentStocks: Record<string, number>
): StockAvailability[] {
  return rawMaterials.map(rm => {
    const req = requirements.find(r => r.rawMaterialId === rm.id);
    const requiredAmount = req ? req.grossRequirement : 0;
    const currentStock = currentStocks[rm.id] !== undefined ? currentStocks[rm.id] : 0;

    let status: 'Yeterli' | 'Kritik' | 'Eksik' = 'Yeterli';
    let missingAmount = 0;

    if (currentStock < requiredAmount) {
      status = 'Eksik';
      missingAmount = requiredAmount - currentStock;
    } else if (currentStock <= rm.criticalStockLevel) {
      status = 'Kritik';
    }

    return {
      rawMaterialId: rm.id,
      rawMaterialName: rm.name,
      unit: rm.unit,
      currentStock,
      criticalStockLevel: rm.criticalStockLevel,
      requiredAmount,
      status,
      missingAmount
    };
  });
}

export interface ProductCostBreakdown {
  productId: string;
  productName: string;
  rawMaterialCost: number; // sum of (gross amount * purchasePrice) for 1 package
  packagingCost: number; // separate display of packaging if desired
  laborCost: number;
  overheadCost: number;
  deliveryCost: number;
  totalCostPerPackage: number;
  salePrice: number;
  profitPerPackage: number;
  profitMarginPercent: number;
}

export function calculateProductCost(
  product: Product,
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[]
): ProductCostBreakdown {
  const productRecipes = recipes.filter(r => r.productId === product.id);
  let rawMaterialCost = 0;
  let packagingCost = 0;

  const safetyRate = resolveSafetyRate(undefined, product, settings);

  for (const recipe of productRecipes) {
    const rm = rawMaterials.find(m => m.id === recipe.rawMaterialId);
    if (!rm || !rm.isActive) continue;

    const wasteRate = resolveWasteRate(undefined, recipe, rm);
    // net for 1 package is recipe.quantity
    const netReq = calculateNetRequirement(1, recipe.quantity, rm.unit);
    const safetyAdj = calculateSafetyAdjustedRequirement(netReq, safetyRate);
    const grossReq = calculateGrossRequirement(safetyAdj, wasteRate);
    
    const purchasePrice = stockMovements
      ? (rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice))
      : (rm.averageCost ?? rm.purchasePrice);
    const cost = grossReq * purchasePrice;

    if (rm.category === 'Ambalaj') {
      packagingCost += cost;
    } else {
      rawMaterialCost += cost;
    }
  }

  const laborCost = settings.laborCostPerPackage;
  const overheadCost = settings.overheadCostPerPackage;
  const deliveryCost = settings.deliveryCostPerPackage;
  const totalCostPerPackage = rawMaterialCost + packagingCost + laborCost + overheadCost + deliveryCost;
  const profitPerPackage = product.salePrice - totalCostPerPackage;
  const profitMarginPercent = product.salePrice > 0 ? (profitPerPackage / product.salePrice) * 100 : 0;

  return {
    productId: product.id,
    productName: product.name,
    rawMaterialCost,
    packagingCost,
    laborCost,
    overheadCost,
    deliveryCost,
    totalCostPerPackage,
    salePrice: product.salePrice,
    profitPerPackage,
    profitMarginPercent
  };
}

export interface OrderCostBreakdown {
  orderId: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMarginPercent: number;
  requirements: RawMaterialRequirement[];
  rawMaterialCostSum: number;
  laborCost: number;
  overheadCost: number;
  deliveryCost: number;
}

export interface OrderRealizedFinancials {
  realizedRevenue: number;
  realizedCost: number;
  realizedProfit: number;
  realizedProfitMarginPercent: number;
  shippedQuantity: number;
  orderedQuantity: number;
  rawMaterialCost: number;
  laborCost: number;
  overheadCost: number;
  deliveryCost: number;
}

export function calculateOrderRealizedFinancials(
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[],
  finishedGoodsMovements: FinishedGoodsMovement[]
): OrderRealizedFinancials {
  let realizedRevenue = 0;
  let realizedCost = 0;
  let totalShippedQuantity = 0;
  let totalOrderedQuantity = 0;
  let rawMaterialCost = 0;
  let laborCost = 0;
  let overheadCost = 0;
  let deliveryCost = 0;

  for (const item of orderItems) {
    totalOrderedQuantity += item.quantity;
    
    // Calculate shipped quantity for this item
    const itemShipped = finishedGoodsMovements
      .filter(m => m.orderItemId === item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
      .reduce((sum, m) => sum + (m.quantity || 0), 0);
      
    totalShippedQuantity += itemShipped;
    realizedRevenue += itemShipped * item.unitSalePrice;

    // Find the product to get its unit cost
    const product = products.find(p => p.id === item.productId);
    if (product) {
      const pCost = calculateProductCost(product, recipes, rawMaterials, settings, stockMovements);
      
      // Calculate actual produced quantity for this item
      const itemProduced = finishedGoodsMovements
        .filter(m => m.orderItemId === item.id && m.type === 'Üretim girişi' && !m.isDeleted)
        .reduce((sum, m) => sum + (m.quantity || 0), 0);

      // Find stock movements of type 'Üretim Tüketimi' linked to this item
      const itemMovements = stockMovements.filter(m => {
        if (m.isDeleted) return false;
        
        const normType = normalizeMovementType(m.type);
        if (normType !== 'Üretim Tüketimi') return false;

        return (m.orderItemId === item.id) || 
               (m.orderId === item.orderId && m.productId === item.productId);
      });

      let actualRawMaterialAndPkgCost = 0;
      if (itemMovements.length > 0) {
        let totalMovementCost = 0;
        for (const m of itemMovements) {
          const cost = typeof m.totalCost === 'number' && !isNaN(m.totalCost) 
            ? m.totalCost 
            : Math.abs(m.quantity) * (m.unitPrice ?? 0);
          totalMovementCost += Math.abs(cost);
        }

        // Proportional to shipped amount vs produced amount (fallback to ordered quantity if itemProduced is 0)
        const baseQty = itemProduced > 0 ? itemProduced : item.quantity;
        actualRawMaterialAndPkgCost = totalMovementCost * (itemShipped / (baseQty || 1));
      } else {
        // Fallback calculation:
        actualRawMaterialAndPkgCost = itemShipped * (pCost.rawMaterialCost + pCost.packagingCost);
      }

      const itemLaborCost = itemShipped * pCost.laborCost;
      const itemOverheadCost = itemShipped * pCost.overheadCost;
      const itemDeliveryCost = itemShipped * pCost.deliveryCost;

      rawMaterialCost += actualRawMaterialAndPkgCost;
      laborCost += itemLaborCost;
      overheadCost += itemOverheadCost;
      deliveryCost += itemDeliveryCost;
      
      realizedCost += actualRawMaterialAndPkgCost + itemLaborCost + itemOverheadCost + itemDeliveryCost;
    }
  }

  const realizedProfit = realizedRevenue - realizedCost;
  const realizedProfitMarginPercent = realizedRevenue > 0 ? (realizedProfit / realizedRevenue) * 100 : 0;

  return {
    realizedRevenue,
    realizedCost,
    realizedProfit,
    realizedProfitMarginPercent,
    shippedQuantity: totalShippedQuantity,
    orderedQuantity: totalOrderedQuantity,
    rawMaterialCost,
    laborCost,
    overheadCost,
    deliveryCost
  };
}

export function calculateOrderCost(
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[]
): OrderCostBreakdown {
  const reqs = calculateRawMaterialRequirementsForOrder(orderItems, products, recipes, rawMaterials, settings, stockMovements);
  
  let totalRevenue = 0;
  for (const item of orderItems) {
    totalRevenue += item.quantity * item.unitSalePrice;
  }

  let rawMaterialCostSum = 0;
  for (const req of reqs) {
    rawMaterialCostSum += req.estimatedCost;
  }

  // package counts to calculate flat costs
  let totalPackages = 0;
  for (const item of orderItems) {
    totalPackages += item.quantity;
  }

  const laborCost = totalPackages * settings.laborCostPerPackage;
  const overheadCost = totalPackages * settings.overheadCostPerPackage;
  const deliveryCost = totalPackages * settings.deliveryCostPerPackage;

  const totalCost = rawMaterialCostSum + laborCost + overheadCost + deliveryCost;
  const totalProfit = totalRevenue - totalCost;
  const profitMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    orderId: orderItems[0]?.orderId || '',
    totalRevenue,
    totalCost,
    totalProfit,
    profitMarginPercent,
    requirements: reqs,
    rawMaterialCostSum,
    laborCost,
    overheadCost,
    deliveryCost
  };
}

export function calculateProfit(salePrice: number, cost: number): { profit: number; marginPercent: number } {
  const profit = salePrice - cost;
  const marginPercent = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  return { profit, marginPercent };
}

// SECTION 15 HELPERS

export function getProductionRunsForPlanItem(productionPlanItemId: string, productionRuns: ProductionRun[]): ProductionRun[] {
  if (!productionRuns) return [];
  return productionRuns.filter(r => r.productionPlanItemId === productionPlanItemId && !r.isDeleted);
}

export function getProducedQuantityForPlanItem(
  productionPlanItemId: string,
  productionPlanItems: ProductionPlanItem[],
  productionRuns: ProductionRun[]
): number {
  const runs = getProductionRunsForPlanItem(productionPlanItemId, productionRuns);
  if (runs.length > 0) {
    return runs.reduce((sum, r) => sum + r.producedQuantity, 0);
  }
  const item = productionPlanItems.find(pi => pi.id === productionPlanItemId);
  return item ? (item.producedQuantity || 0) : 0;
}

export function getRemainingQuantityForPlanItem(
  productionPlanItemId: string,
  productionPlanItems: ProductionPlanItem[],
  productionRuns: ProductionRun[]
): number {
  const item = productionPlanItems.find(pi => pi.id === productionPlanItemId);
  if (!item) return 0;
  const produced = getProducedQuantityForPlanItem(productionPlanItemId, productionPlanItems, productionRuns);
  return Math.max(0, item.plannedQuantity - produced);
}

export function getProducedQuantityForOrderItem(
  orderItemId: string,
  productionPlanItems: ProductionPlanItem[],
  productionRuns: ProductionRun[]
): number {
  return getOrderItemProducedQuantity(orderItemId, productionPlanItems, productionRuns);
}

export function getRemainingProductionForOrderItem(
  orderItemId: string,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  productionRuns: ProductionRun[]
): number {
  const item = orderItems.find(oi => oi.id === orderItemId);
  if (!item) return 0;
  const produced = getProducedQuantityForOrderItem(orderItemId, productionPlanItems, productionRuns);
  return Math.max(0, item.quantity - produced);
}

export function calculateRequirementsForProducedQuantity(
  productId: string,
  producedQuantity: number,
  orderItem: OrderItem | undefined,
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[],
  orders?: Order[]
): RawMaterialRequirement[] {
  const planItems = [{ productId, quantity: producedQuantity, orderItem }];
  return calculateRawMaterialRequirementsForProductionPlan(
    planItems,
    products,
    recipes,
    rawMaterials,
    settings,
    stockMovements,
    orders
  );
}

export function getOrderItemProducedQuantity(
  orderItemId: string,
  productionPlanItems: ProductionPlanItem[],
  productionRuns?: ProductionRun[]
): number {
  if (productionRuns && productionRuns.length > 0) {
    const runs = productionRuns.filter(r => r.orderItemId === orderItemId && !r.isDeleted);
    return runs.reduce((sum, r) => sum + r.producedQuantity, 0);
  }
  return productionPlanItems
    .filter(pi => pi.orderItemId === orderItemId && pi.status !== 'İptal' && !pi.isDeleted)
    .reduce((sum, pi) => sum + (pi.producedQuantity || 0), 0);
}

export function getOrderItemPlannedQuantity(orderItemId: string, productionPlanItems: ProductionPlanItem[]): number {
  return productionPlanItems
    .filter(pi => pi.orderItemId === orderItemId && pi.status !== 'İptal' && !pi.isDeleted)
    .reduce((sum, pi) => {
      const isClosed = pi.status === 'Eksikle Kapatıldı' || 
                       pi.status === 'Tamamlandı' || 
                       (pi.status as string) === 'closed_with_shortage' || 
                       pi.isLocked === true;
      if (isClosed) {
        return sum + (pi.producedQuantity || 0);
      }
      return sum + (pi.plannedQuantity || 0);
    }, 0);
}

export function calculateOrderOperationalSummary(
  orderId: string,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  finishedGoodsStocks: FinishedGoodsStock[],
  finishedGoodsMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[]
) {
  const items = orderItems.filter(oi => oi.orderId === orderId);
  
  let orderedQuantity = 0;
  let effectivePlannedQuantity = 0;
  let producedQuantity = 0;
  let finishedGoodsRemaining = 0;
  let shippedQuantity = 0;
  let remainingToPlan = 0;
  let remainingToProduce = 0;
  let remainingToShip = 0;

  items.forEach(item => {
    const summary = calculateOrderItemOperationalSummary(
      item.id,
      item.quantity,
      productionPlanItems,
      finishedGoodsStocks,
      finishedGoodsMovements,
      productionRuns
    );

    orderedQuantity += summary.orderedQuantity;
    effectivePlannedQuantity += summary.effectivePlannedQuantity;
    producedQuantity += summary.producedQuantity;
    finishedGoodsRemaining += summary.finishedGoodsRemaining;
    shippedQuantity += summary.shippedQuantity;
    remainingToPlan += summary.remainingToPlan;
    remainingToProduce += summary.remainingToProduce;
    remainingToShip += summary.remainingToShip;
  });

  return {
    orderedQuantity,
    effectivePlannedQuantity,
    producedQuantity,
    finishedGoodsRemaining,
    shippedQuantity,
    remainingToPlan,
    remainingToProduce,
    remainingToShip
  };
}

export function calculateOrderItemOperationalSummary(
  orderItemId: string,
  itemQuantity: number,
  productionPlanItems: ProductionPlanItem[],
  finishedGoodsStocks: FinishedGoodsStock[],
  finishedGoodsMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[],
  productId?: string,
  orderId?: string
) {
  const itemProduced = getOrderItemProducedQuantity(orderItemId, productionPlanItems, productionRuns);

  const itemShipped = finishedGoodsMovements
    .filter(m => m.orderItemId === orderItemId && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
    .reduce((sum, m) => sum + (m.quantity || 0), 0);

  const itemFG = finishedGoodsStocks
    .filter(f => {
      // 1. Exclude deleted finished goods stock
      if (f.isDeleted) return false;

      // 2. Exclude deleted ProductionRun if any productionRunId is associated
      if (f.productionRunId && productionRuns) {
        const linkedRun = productionRuns.find(r => r.id === f.productionRunId);
        if (linkedRun && linkedRun.isDeleted) return false;
      }

      // 3. Exclude status === 'İptal' or 'Fire'
      const statusLower = (f.status || '').toLowerCase();
      if (statusLower === 'iptal' || statusLower === 'fire' || f.status === 'İptal' || f.status === 'Fire') return false;

      // 4. Exclude quantityRemaining <= 0
      if ((f.quantityRemaining || 0) <= 0) return false;

      // 5. Connection match (either orderItemId directly or fallback)
      const targetOrderId = orderId || (productionPlanItems && productionPlanItems.find(pi => pi.orderItemId === orderItemId)?.orderId);
      const targetProductId = productId || (productionPlanItems && productionPlanItems.find(pi => pi.orderItemId === orderItemId)?.productId);

      if (f.orderItemId === orderItemId) {
        return true;
      }

      // Fallback matching
      if (targetOrderId && targetProductId) {
        return f.orderId === targetOrderId && f.productId === targetProductId;
      }

      return false;
    })
    .reduce((sum, f) => sum + (f.quantityRemaining || 0), 0);

  const activePlanItems = productionPlanItems.filter(
    pi => pi.orderItemId === orderItemId && pi.status !== 'İptal' && !pi.isDeleted
  );
  
  const rawEffectivePlannedQuantity = activePlanItems.reduce((sum, pi) => {
    const isClosed = pi.status === 'Eksikle Kapatıldı' || 
                     pi.status === 'Tamamlandı' || 
                     (pi.status as string) === 'closed_with_shortage' || 
                     pi.isLocked === true;
    if (isClosed) {
      let pQty = pi.producedQuantity || 0;
      if (productionRuns && productionRuns.length > 0) {
        pQty = productionRuns
          .filter(r => r.productionPlanItemId === pi.id && !r.isDeleted)
          .reduce((s, r) => s + r.producedQuantity, 0);
      }
      return sum + pQty;
    }
    return sum + (pi.plannedQuantity || 0);
  }, 0);

  const itemEffectivePlanned = Math.min(rawEffectivePlannedQuantity, itemQuantity);

  const itemRemainingToPlan = Math.max(itemQuantity - itemEffectivePlanned, 0);
  const itemRemainingToProduce = Math.max(itemQuantity - itemProduced, 0);
  const itemRemainingToShip = Math.max(itemFG, 0);

  return {
    orderedQuantity: itemQuantity,
    effectivePlannedQuantity: itemEffectivePlanned,
    producedQuantity: itemProduced,
    finishedGoodsRemaining: itemFG,
    shippedQuantity: itemShipped,
    remainingToPlan: itemRemainingToPlan,
    remainingToProduce: itemRemainingToProduce,
    remainingToShip: itemRemainingToShip
  };
}

export function getOrderItemRemainingToPlan(
  orderItemId: string,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[]
): number {
  const item = orderItems.find(oi => oi.id === orderItemId);
  if (!item) return 0;
  const planned = getOrderItemPlannedQuantity(orderItemId, productionPlanItems);
  return Math.max(0, item.quantity - planned);
}

export function getOrderItemRemainingToProduce(
  orderItemId: string,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  productionRuns?: ProductionRun[]
): number {
  const item = orderItems.find(oi => oi.id === orderItemId);
  if (!item) return 0;
  const produced = getOrderItemProducedQuantity(orderItemId, productionPlanItems, productionRuns);
  return Math.max(0, item.quantity - produced);
}

export function getOrderItemFinishedGoodsQuantity(orderItemId: string, finishedGoodsStock: FinishedGoodsStock[]): number {
  return finishedGoodsStock
    .filter(fg => fg.orderItemId === orderItemId && fg.status !== 'İptal' && fg.status !== 'Fire')
    .reduce((sum, fg) => sum + (fg.quantityRemaining || 0), 0);
}

export function getOrderItemShippedQuantity(orderItemId: string, finishedGoodsMovements: FinishedGoodsMovement[]): number {
  return finishedGoodsMovements
    .filter(m => m.orderItemId === orderItemId && m.type === 'Sevkiyat çıkışı')
    .reduce((sum, m) => sum + (m.quantity || 0), 0);
}

export function calculateProductionPlanRequirements(
  productionPlanId: string,
  productionPlanItems: ProductionPlanItem[],
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[]
): RawMaterialRequirement[] {
  const activePlanItems = productionPlanItems.filter(
    i => i.productionPlanId === productionPlanId && i.status !== 'İptal'
  );
  
  const formattedItems = activePlanItems.map(pi => {
    const orderItem = orderItems.find(oi => oi.id === pi.orderItemId);
    return {
      productId: pi.productId,
      quantity: pi.plannedQuantity,
      orderItem
    };
  });
  
  return calculateRawMaterialRequirementsForProductionPlan(
    formattedItems,
    products,
    recipes,
    rawMaterials,
    settings,
    stockMovements
  );
}

export function calculateProductionItemRequirements(
  productionPlanItem: ProductionPlanItem,
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements?: StockMovement[]
): RawMaterialRequirement[] {
  const orderItem = orderItems.find(oi => oi.id === productionPlanItem.orderItemId);
  const formattedItems = [{
    productId: productionPlanItem.productId,
    quantity: productionPlanItem.plannedQuantity,
    orderItem
  }];
  
  return calculateRawMaterialRequirementsForProductionPlan(
    formattedItems,
    products,
    recipes,
    rawMaterials,
    settings,
    stockMovements
  );
}

export function calculateRemainingRequirementsForProductionPlan(
  productionPlanId: string,
  productionPlanItems: ProductionPlanItem[],
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[],
  productionRuns: ProductionRun[],
  productionPlans?: ProductionPlan[]
): (RawMaterialRequirement & {
  totalPlannedRequirement: number;
  alreadyConsumedRequirement: number;
  remainingRequirement: number;
})[] {
  const activePlanItems = productionPlanItems.filter(
    i => i.productionPlanId === productionPlanId && i.status !== 'İptal' && !(i as any).isDeleted
  );

  const plan = productionPlans?.find(p => p.id === productionPlanId);
  const isClosed = isProductionPlanClosed(plan);

  const formattedItems = activePlanItems.map(pi => {
    const orderItem = orderItems.find(oi => oi.id === pi.orderItemId);
    const producedQty = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
    const remainingQty = isClosed ? 0 : Math.max(0, pi.plannedQuantity - producedQty);

    return {
      productId: pi.productId,
      quantity: remainingQty,
      orderItem
    };
  });

  const requirements = calculateRawMaterialRequirementsForProductionPlan(
    formattedItems,
    products,
    recipes,
    rawMaterials,
    settings,
    stockMovements
  );

  const totalPlannedFormattedItems = activePlanItems.map(pi => {
    const orderItem = orderItems.find(oi => oi.id === pi.orderItemId);
    return {
      productId: pi.productId,
      quantity: pi.plannedQuantity,
      orderItem
    };
  });

  const totalPlannedRequirements = calculateRawMaterialRequirementsForProductionPlan(
    totalPlannedFormattedItems,
    products,
    recipes,
    rawMaterials,
    settings,
    stockMovements
  );

  return requirements.map(req => {
    const totalPlanReq = totalPlannedRequirements.find(tp => tp.rawMaterialId === req.rawMaterialId);
    const totalPlannedRequirementVal = totalPlanReq ? totalPlanReq.grossRequirement : 0;
    const remainingRequirementVal = req.grossRequirement;
    const alreadyConsumedRequirementVal = Math.max(0, totalPlannedRequirementVal - remainingRequirementVal);

    return {
      ...req,
      totalPlannedRequirement: totalPlannedRequirementVal,
      alreadyConsumedRequirement: alreadyConsumedRequirementVal,
      remainingRequirement: remainingRequirementVal
    };
  });
}

export function deductRawMaterialsForProductionItem(
  productionPlanItem: ProductionPlanItem,
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[],
  orders?: Order[]
): StockMovement[] {
  if (productionPlanItem.rawMaterialsDeducted) return [];

  const product = products.find(p => p.id === productionPlanItem.productId);
  if (!product) return [];

  const qtyToUse = productionPlanItem.producedQuantity;
  if (qtyToUse <= 0) return [];

  const orderObj = orders?.find(o => o.id === productionPlanItem.orderId);
  const resolvedSettings = resolveCostSettingsForOrder(settings, orderObj);

  const orderItem = orderItems.find(oi => oi.id === productionPlanItem.orderItemId);
  const safetyRate = resolveSafetyRate(orderItem, product, resolvedSettings);
  const productRecipes = recipes.filter(r => r.productId === product.id);

  const newMovements: StockMovement[] = [];

  for (const recipe of productRecipes) {
    const rm = rawMaterials.find(m => m.id === recipe.rawMaterialId);
    if (!rm) continue;

    const wasteRate = resolveWasteRate(orderItem, recipe, rm);
    const netReq = calculateNetRequirement(qtyToUse, recipe.quantity, rm.unit);
    const safetyAdjReq = calculateSafetyAdjustedRequirement(netReq, safetyRate);
    const grossReq = calculateGrossRequirement(safetyAdjReq, wasteRate);

    const purchasePrice = rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice);
    const estimatedCost = grossReq * purchasePrice;

    newMovements.push({
      id: 'sm_' + Math.random().toString(36).substring(2, 9),
      rawMaterialId: rm.id,
      type: 'Üretim Tüketimi',
      quantity: grossReq,
      date: new Date().toISOString().split('T')[0],
      note: `Üretim Sarfiyatı - Plan No: P-#${productionPlanItem.productionPlanId.substring(0, 5).toUpperCase()}, Ürün: ${product.name}`,
      createdAt: new Date().toISOString(),
      unitPrice: purchasePrice,
      totalCost: estimatedCost,
      productionPlanId: productionPlanItem.productionPlanId,
      productionPlanItemId: productionPlanItem.id,
      orderId: productionPlanItem.orderId,
      orderItemId: productionPlanItem.orderItemId,
      productId: productionPlanItem.productId
    });
  }

  return newMovements;
}

export function createFinishedGoodsFromProductionItem(
  productionPlanItem: ProductionPlanItem,
  orderItems: OrderItem[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[],
  deliveryDate: string,
  orders?: Order[]
): FinishedGoodsStock | null {
  if (productionPlanItem.finishedGoodsCreated) return null;

  const product = products.find(p => p.id === productionPlanItem.productId);
  if (!product) return null;

  const qtyToUse = productionPlanItem.producedQuantity;
  if (qtyToUse <= 0) return null;

  const orderObj = orders?.find(o => o.id === productionPlanItem.orderId);
  const resolvedSettings = resolveCostSettingsForOrder(settings, orderObj);

  const costBreakdown = calculateProductCost(product, recipes, rawMaterials, resolvedSettings, stockMovements);
  const unitCost = costBreakdown.totalCostPerPackage;
  const totalCost = unitCost * qtyToUse;

  return {
    id: 'fgs_' + Math.random().toString(36).substring(2, 9),
    productId: productionPlanItem.productId,
    customerId: productionPlanItem.customerId,
    orderId: productionPlanItem.orderId,
    orderItemId: productionPlanItem.orderItemId,
    productionPlanId: productionPlanItem.productionPlanId,
    productionPlanItemId: productionPlanItem.id,
    productionDate: new Date().toISOString().split('T')[0],
    deliveryDate: deliveryDate,
    quantityProduced: qtyToUse,
    quantityRemaining: qtyToUse,
    status: 'Stokta',
    unitCost,
    totalCost,
    note: `Üretim Girişi - Plan No: P-#${productionPlanItem.productionPlanId.substring(0, 5).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function completeProductionPlanItem(
  productionPlanItemId: string,
  producedQuantity: number,
  status: ProductionPlanStatus,
  productionPlanItems: ProductionPlanItem[],
  orderItems: OrderItem[],
  orders: Order[],
  products: Product[],
  recipes: ProductRecipeItem[],
  rawMaterials: RawMaterial[],
  settings: CostSettings,
  stockMovements: StockMovement[]
): {
  updatedPlanItems: ProductionPlanItem[];
  newStockMovements: StockMovement[];
  newFinishedGoodsStock: FinishedGoodsStock | null;
} {
  const item = productionPlanItems.find(i => i.id === productionPlanItemId);
  if (!item) {
    return {
      updatedPlanItems: productionPlanItems,
      newStockMovements: [],
      newFinishedGoodsStock: null
    };
  }

  const order = orders.find(o => o.id === item.orderId);
  const deliveryDate = order ? order.deliveryDate : new Date().toISOString().split('T')[0];

  const updatedItem: ProductionPlanItem = {
    ...item,
    producedQuantity: producedQuantity,
    status: status,
    updatedAt: new Date().toISOString()
  };

  let newMovements: StockMovement[] = [];
  let newFG: FinishedGoodsStock | null = null;

  if (!updatedItem.rawMaterialsDeducted && producedQuantity > 0) {
    newMovements = deductRawMaterialsForProductionItem(
      updatedItem,
      orderItems,
      products,
      recipes,
      rawMaterials,
      settings,
      stockMovements,
      orders
    );
    if (newMovements.length > 0) {
      updatedItem.rawMaterialsDeducted = true;
      updatedItem.deductedAt = new Date().toISOString();
      updatedItem.deductionMovementIds = newMovements.map(m => m.id);
    }
  }

  if (!updatedItem.finishedGoodsCreated && producedQuantity > 0) {
    newFG = createFinishedGoodsFromProductionItem(
      updatedItem,
      orderItems,
      products,
      recipes,
      rawMaterials,
      settings,
      stockMovements,
      deliveryDate,
      orders
    );
    if (newFG) {
      updatedItem.finishedGoodsCreated = true;
      updatedItem.finishedGoodsStockId = newFG.id;
    }
  }

  const product = products.find(p => p.id === item.productId);
  if (product) {
    const costBreakdown = calculateProductCost(product, recipes, rawMaterials, settings, stockMovements);
    updatedItem.unitCost = costBreakdown.totalCostPerPackage;
    updatedItem.estimatedTotalCost = costBreakdown.totalCostPerPackage * producedQuantity;
  }

  const updatedPlanItems = productionPlanItems.map(pi => pi.id === productionPlanItemId ? updatedItem : pi);

  return {
    updatedPlanItems,
    newStockMovements: newMovements,
    newFinishedGoodsStock: newFG
  };
}

export function shipFinishedGoods(
  finishedGoodsStockId: string,
  quantity: number,
  finishedGoodsStocks: FinishedGoodsStock[],
  note?: string
): {
  updatedStocks: FinishedGoodsStock[];
  newMovement: FinishedGoodsMovement | null;
} {
  const stock = finishedGoodsStocks.find(s => s.id === finishedGoodsStockId);
  if (!stock || quantity <= 0) {
    return { updatedStocks: finishedGoodsStocks, newMovement: null };
  }

  const actualShipQty = Math.min(quantity, stock.quantityRemaining);
  const newRemaining = stock.quantityRemaining - actualShipQty;
  const newStatus = newRemaining === 0 ? 'Sevk Edildi' : 'Kısmi Sevk';

  const updatedStock: FinishedGoodsStock = {
    ...stock,
    quantityRemaining: newRemaining,
    status: newStatus,
    note: note || stock.note,
    updatedAt: new Date().toISOString()
  };

  const newMovement: FinishedGoodsMovement = {
    id: 'fgm_' + Math.random().toString(36).substring(2, 9),
    finishedGoodsStockId: finishedGoodsStockId,
    productId: stock.productId,
    customerId: stock.customerId,
    orderId: stock.orderId,
    orderItemId: stock.orderItemId,
    type: 'Sevkiyat çıkışı',
    quantity: actualShipQty,
    date: new Date().toISOString().split('T')[0],
    note: note || 'Sevkiyat Çıkışı',
    createdAt: new Date().toISOString()
  };

  const updatedStocks = finishedGoodsStocks.map(s => s.id === finishedGoodsStockId ? updatedStock : s);

  return {
    updatedStocks,
    newMovement
  };
}

export function calculateOrderComputedStatus(
  order: Order,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  finishedGoodsStock: FinishedGoodsStock[],
  finishedGoodsMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[]
): OrderComputedStatus {
  const approvalStatus = order.approvalStatus || 'Taslak';

  // 1. Eğer approvalStatus === "İptal" ise: computedStatus = "İptal"
  if (approvalStatus === 'İptal') {
    return 'İptal';
  }

  // 2. Eğer approvalStatus === "Taslak" ise: computedStatus = "Taslak"
  if (approvalStatus === 'Taslak') {
    return 'Taslak';
  }

  const totalAmount = order.totalAmount || 0;
  const realizedAmount = order.realizedAmount || 0;

  // Rule 3: Eğer realized_amount >= total_amount ise: computedStatus = "Sevk Edildi"
  if (realizedAmount >= totalAmount && totalAmount > 0) {
    return 'Sevk Edildi';
  }

  // Rule 2: Eğer realized_amount > 0 VE realized_amount < total_amount ise: computedStatus = "Kısmi Sevk"
  if (realizedAmount > 0 && realizedAmount < totalAmount) {
    return 'Kısmi Sevk';
  }

  // Rule 1: Eğer realized_amount = 0 ise ve üretim/mamul stok hazırsa: computedStatus = "Sevkiyata Hazır"
  if (realizedAmount === 0) {
    const hasFinishedGoodsReady = finishedGoodsStock.some(
      s => s.orderId === order.id && !s.isDeleted && s.quantityRemaining > 0
    );
    if (hasFinishedGoodsReady) {
      return 'Sevkiyata Hazır';
    }
  }

  const items = orderItems.filter(oi => oi.orderId === order.id);
  if (items.length === 0) {
    return 'Onaylandı'; // If no items, fallback
  }

  // 3. Eğer siparişteki tüm ürün adetleri tamamen sevk edildiyse veya eldeki üretimlerin tamamı sevk edildiyse: computedStatus = "Sevk Edildi"
  const isFullyShipped = items.every(item => {
    const shippedQuantity = finishedGoodsMovements
      .filter(m => m.orderItemId === item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
      .reduce((sum, m) => sum + m.quantity, 0);

    if (shippedQuantity >= item.quantity && item.quantity > 0) {
      return true;
    }

    const itemStocks = finishedGoodsStock.filter(s => s.orderItemId === item.id && !s.isDeleted);
    if (itemStocks.length > 0) {
      const allStocksDisposed = itemStocks.every(s => 
        s.status === 'Sevk Edildi' || 
        s.status?.toLowerCase() === 'shipped' || 
        s.status === 'Fire' || 
        s.status === 'İptal' || 
        s.quantityRemaining === 0
      );
      if (allStocksDisposed) {
        return true;
      }
    }

    return false;
  });

  if (isFullyShipped) {
    // Sadece "hiç sevkiyat yok + tamamı fire/iptal oldu" senaryosunda sipariş durumu "İptal" görünmeli.
    // Eğer sevk edilen miktar 0'dan büyükse durum "Sevk Edildi" kalmalı.
    const totalOrderShippedQuantity = items.reduce((sum, item) => {
      const shippedQuantity = finishedGoodsMovements
        .filter(m => m.orderItemId === item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
        .reduce((innerSum, m) => innerSum + m.quantity, 0);
      return sum + shippedQuantity;
    }, 0);

    if (totalOrderShippedQuantity === 0) {
      return 'İptal';
    }

    return 'Sevk Edildi';
  }

  // 4. Eğer siparişteki tüm ürün adetleri tamamen üretildiyse:
  const isFullyProduced = items.every(item => {
    const producedQuantity = getOrderItemProducedQuantity(item.id, productionPlanItems, productionRuns);
    return producedQuantity >= item.quantity;
  });

  if (isFullyProduced) {
    // Sevk edilmemiş ama sevkiyata hazırsa (stokta bekleyen ürün varsa): computedStatus = "Sevkiyata Hazır"
    const hasRemainingStock = items.some(item => {
      const itemStocks = finishedGoodsStock.filter(s => s.orderItemId === item.id && !s.isDeleted);
      return itemStocks.some(s => s.quantityRemaining > 0);
    });

    if (hasRemainingStock) {
      return 'Sevkiyata Hazır';
    }
    return 'Üretildi';
  }

  // 5. Eğer siparişten herhangi bir adet üretim planına eklendiyse: computedStatus = "Üretim Planlandı"
  const hasAnyProductionPlan = productionPlanItems.some(
    pi => pi.orderId === order.id && pi.status !== 'İptal' && pi.plannedQuantity > 0 && !pi.isDeleted
  );

  if (hasAnyProductionPlan) {
    return 'Üretim Planlandı';
  }

  // 6. Eğer approvalStatus === "Onaylandı" ve henüz üretim planına eklenmemişse: computedStatus = "Onaylandı"
  return 'Onaylandı';
}

export function syncOrderStatuses(
  orders: Order[],
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  finishedGoodsStock: FinishedGoodsStock[],
  finishedGoodsMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[]
): Order[] {
  if (USE_SUPABASE) {
    return orders;
  }
  return orders.map(order => {
    const approvalStatus = order.approvalStatus || (
      (order.status === 'Taslak' || order.status === 'İptal') ? order.status : 'Onaylandı'
    );
    const computedStatus = calculateOrderComputedStatus(
      { ...order, approvalStatus },
      orderItems,
      productionPlanItems,
      finishedGoodsStock,
      finishedGoodsMovements,
      productionRuns
    );
    return {
      ...order,
      approvalStatus,
      computedStatus,
      status: computedStatus, // Keep original status field synced as well
      updatedAt: new Date().toISOString()
    };
  });
}

export function normalizeMovementType(type: string): 'Stok Girişi' | 'Stok Çıkışı' | 'Fire Çıkışı' | 'Üretim Tüketimi' | 'Sayım Düzeltmesi' | 'Üretim Geri Alma' | 'Üretim Silme İadesi' | string {
  const t = type.trim().toLowerCase().replace(/[-_]/g, ' ');
  
  if (
    t === 'üretim tüketimi' || 
    t === 'uretim tuketimi' || 
    t === 'production consumption' || 
    t === 'production_consumption' || 
    t === 'production-consumption' ||
    t === 'üretim sarfiyatı' ||
    t === 'uretim sarfiyati' ||
    t === 'sarfiyat'
  ) {
    return 'Üretim Tüketimi';
  }
  
  if (
    t === 'stok girişi' || 
    t === 'giriş' || 
    t === 'giris' || 
    t === 'stock in' || 
    t === 'stock_in'
  ) {
    return 'Stok Girişi';
  }
  
  if (
    t === 'stok çıkışı' || 
    t === 'çıkış' || 
    t === 'cikis' || 
    t === 'stock out' || 
    t === 'stock_out'
  ) {
    return 'Stok Çıkışı';
  }
  
  if (
    t === 'fire çıkışı' || 
    t === 'fire cikisi' || 
    t === 'fire'
  ) {
    return 'Fire Çıkışı';
  }
  
  if (
    t === 'sayım düzeltmesi' || 
    t === 'sayim duzeltmesi' || 
    t === 'düzeltme' || 
    t === 'duzeltme' || 
    t === 'adjustment'
  ) {
    return 'Sayım Düzeltmesi';
  }

  if (
    t === 'üretim geri alma' ||
    t === 'uretim geri alma'
  ) {
    return 'Üretim Geri Alma';
  }

  if (
    t === 'üretim silme iadesi' ||
    t === 'uretim silme iadesi'
  ) {
    return 'Üretim Silme İadesi';
  }
  
  return type;
}

export function calculateCurrentStock(rawMaterialId: string, stockMovements: StockMovement[]): number {
  let stock = 0;
  for (const m of stockMovements) {
    if (m.rawMaterialId !== rawMaterialId || m.isDeleted) continue;
    
    const normType = normalizeMovementType(m.type);
    if (normType === 'Stok Girişi') {
      stock += m.quantity;
    } else if (normType === 'Stok Çıkışı') {
      stock -= m.quantity;
    } else if (normType === 'Fire Çıkışı') {
      stock -= m.quantity;
    } else if (normType === 'Üretim Tüketimi') {
      stock -= m.quantity;
    } else if (normType === 'Sayım Düzeltmesi') {
      stock += m.quantity;
    } else if (normType === 'Üretim Geri Alma' || normType === 'Üretim Silme İadesi') {
      stock += m.quantity;
    }
  }
  return stock;
}

export interface DashboardMetrics {
  todayOrderQuantity: number;
  tomorrowShipmentQuantity: number;
  todayPlannedProductionQuantity: number;
  todayCompletedProductionQuantity: number;
  todayProductionCost: number;
  todayEstimatedRevenue: number;
  todayRawMaterialRequirementKg: number;
  criticalStockCount: number;
  missingRawMaterials: {
    name: string;
    rawMaterialId: string;
    required: number;
    available: number;
    missing: number;
    unit: string;
  }[];
  averageWasteRate: number;
  wasteRateSource: 'varsayilan' | 'gercek';
  topRequiredMaterials: {
    rawMaterialId: string;
    rawMaterialName: string;
    unit: string;
    grossRequirement: number;
    currentStock: number;
  }[];
  todayProductionItems: {
    id: string;
    productName: string;
    customerName: string;
    plannedQuantity: number;
    producedQuantity: number;
    status: string;
  }[];
  tomorrowShipmentItems: {
    id: string;
    customerName: string;
    productName: string;
    quantity: number;
    status: string;
  }[];
  productOrderChartData: { name: string; Adet: number }[];
  rawMaterialRequirementChartData: { name: string; value: number }[];
  profitabilityChartData: {
    name: string;
    Maliyet: number;
    Fiyat: number;
    Kar: number;
  }[];
  tomorrowReadyQuantity: number;
  tomorrowMissingQuantity: number;
  behindScheduleItemsCount?: number;
  behindScheduleTotalQuantity?: number;
}

export function calculateDashboardMetrics(params: {
  selectedDate: string;
  orders: Order[];
  orderItems: OrderItem[];
  customers: Customer[];
  products: Product[];
  productRecipes: ProductRecipeItem[];
  rawMaterials: RawMaterial[];
  stockMovements: StockMovement[];
  productionPlans: any[];
  productionPlanItems: any[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  settings: CostSettings;
  wasteRecords?: any[];
  currentStocks?: Record<string, number>;
}): DashboardMetrics {
  const {
    selectedDate,
    orders,
    orderItems,
    customers,
    products,
    productRecipes,
    rawMaterials,
    stockMovements,
    productionPlans,
    productionPlanItems,
    productionRuns,
    finishedGoodsStocks,
    finishedGoodsMovements,
    settings,
    wasteRecords,
    currentStocks
  } = params;

  const getCurrentStock = (rawMaterialId: string): number => {
    if (currentStocks && typeof currentStocks[rawMaterialId] === 'number') {
      return currentStocks[rawMaterialId];
    }
    return calculateCurrentStock(rawMaterialId, activeStockMovements);
  };

  // Helpers
  const addDaysISO = (dateStr: string, days: number): string => {
    const parts = dateStr.split('T')[0].split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  };

  // Soft delete records excluded
  const activeOrders = orders.filter(o => !o.isDeleted);
  const activeOrderItems = orderItems.filter(i => !(i as any).isDeleted);
  const activeProductionPlans = productionPlans.filter(p => !p.isDeleted);
  const activeProductionPlanItems = productionPlanItems.filter(p => !(p as any).isDeleted);
  const activeProductionRuns = productionRuns.filter(p => !p.isDeleted);
  const activeStockMovements = stockMovements.filter(p => !p.isDeleted);
  const activeFinishedGoodsStocks = finishedGoodsStocks.filter(p => !p.isDeleted);
  const activeFinishedGoodsMovements = finishedGoodsMovements.filter(p => !(p as any).isDeleted);

  const tomorrowDate = addDaysISO(selectedDate, 1);

  // 1. Bugunki Siparis Karti
  const todayOrders = activeOrders.filter(o => 
    (o.orderDate === selectedDate || (o.createdAt && o.createdAt.startsWith(selectedDate))) && 
    o.approvalStatus !== "İptal"
  );
  const todayOrderQuantity = todayOrders.reduce((sum, o) => {
    const items = activeOrderItems.filter(i => i.orderId === o.id);
    return sum + items.reduce((s, i) => s + i.quantity, 0);
  }, 0);

  // 2. Yarin Sevk Edilecek Karti
  const tomorrowOrders = activeOrders.filter(o => 
    o.deliveryDate === tomorrowDate && 
    o.approvalStatus === "Onaylandı" && 
    o.computedStatus !== "Sevk Edildi"
  );
  const tomorrowShipmentQuantity = tomorrowOrders.reduce((sum, o) => {
    const items = activeOrderItems.filter(i => i.orderId === o.id);
    return sum + items.reduce((s, i) => s + i.quantity, 0);
  }, 0);

  const tomorrowReadyQuantity = activeFinishedGoodsStocks
    .filter(fg => fg.deliveryDate === tomorrowDate && fg.quantityRemaining > 0)
    .reduce((sum, fg) => sum + fg.quantityRemaining, 0);

  const tomorrowMissingQuantity = Math.max(0, tomorrowShipmentQuantity - tomorrowReadyQuantity);

  // 3. Bugun Uretilecek Karti
  const todayPlans = activeProductionPlans.filter(p => p.productionDate === selectedDate);
  const todayPlanItems = activeProductionPlanItems.filter(item => {
    const belongsToToday = todayPlans.some(p => p.id === item.productionPlanId);
    if (!belongsToToday || item.status === "İptal") return false;
    
    // Check if the order is closed or fully produced already
    const oItem = activeOrderItems.find(oi => oi.id === item.orderItemId);
    const order = oItem ? activeOrders.find(o => o.id === oItem.orderId) : null;
    if (oItem) {
      const orderQuantity = oItem.quantity;
      const totalProducedForOrderItem = getOrderItemProducedQuantity(oItem.id, activeProductionPlanItems, activeProductionRuns);
      const remainingToProduce = Math.max(orderQuantity - totalProducedForOrderItem, 0);

      const isClosed = isClosedOrderStatus(order?.status) || 
                       isClosedOrderStatus(order?.computedStatus) || 
                       isClosedOrderStatus((oItem as any)?.status) || 
                       isClosedOrderStatus((oItem as any)?.computedStatus) ||
                       remainingToProduce <= 0;
      if (isClosed) {
        const producedForThisItemToday = activeProductionRuns
          .filter(r => r.productionPlanItemId === item.id && !r.isDeleted)
          .reduce((sum, r) => sum + r.producedQuantity, 0);
        if (producedForThisItemToday <= 0) {
          return false;
        }
      }
    }
    return true;
  });
  const todayPlannedProductionQuantity = todayPlanItems.reduce((sum, item) => sum + item.plannedQuantity, 0);

  const todayRuns = activeProductionRuns.filter(run => 
    run.productionDate === selectedDate || 
    todayPlanItems.some(item => item.id === run.productionPlanItemId)
  );
  const todayCompletedProductionQuantity = todayRuns.reduce((sum, run) => sum + run.producedQuantity, 0);

  // 4. Bugun Uretim Maliyeti Karti
  let todayProductionCost = 0;
  if (todayRuns.length > 0) {
    for (const run of todayRuns) {
      const product = products.find(p => p.id === run.productId);
      if (!product) continue;
      const costBreakdown = calculateProductCost(product, productRecipes, rawMaterials, settings, activeStockMovements);
      todayProductionCost += run.producedQuantity * costBreakdown.totalCostPerPackage;
    }
  } else if (todayPlanItems.length > 0) {
    for (const item of todayPlanItems) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;
      const costBreakdown = calculateProductCost(product, productRecipes, rawMaterials, settings, activeStockMovements);
      todayProductionCost += item.plannedQuantity * costBreakdown.totalCostPerPackage;
    }
  }

  // 5. Bugun Tahmini Ciro Karti
  const revenueOrders = activeOrders.filter(o => 
    o.deliveryDate === selectedDate && 
    o.approvalStatus === "Onaylandı" && 
    o.computedStatus !== "İptal"
  );
  let todayEstimatedRevenue = 0;
  for (const order of revenueOrders) {
    const items = activeOrderItems.filter(i => i.orderId === order.id);
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      const salePrice = (item.unitSalePrice !== undefined && item.unitSalePrice !== null) 
        ? item.unitSalePrice 
        : (product ? product.salePrice : 0);
      todayEstimatedRevenue += item.quantity * salePrice;
    }
  }

  // 6. Hammadde Ihtiyaci Karti & Alerts (Unified calculation using central engine)
  const dashboardReqs = calculateUnifiedRawMaterialNeeds({
    orders,
    orderItems,
    products,
    productRecipes,
    rawMaterials,
    stockMovements,
    productionPlans,
    productionPlanItems,
    productionRuns,
    finishedGoodsStocks,
    finishedGoodsMovements,
    settings,
    targetDate: tomorrowDate,
    mode: "tomorrow_orders"
  });

  const todayRawMaterialRequirementKg = dashboardReqs
    .filter(r => r.unit === 'kg')
    .reduce((sum, r) => sum + r.grossRequirement, 0);

  // 7. Missing & Critical Stock
  const missingRawMaterials: {
    name: string;
    rawMaterialId: string;
    required: number;
    available: number;
    missing: number;
    unit: string;
  }[] = [];
  let criticalStockCount = 0;

  for (const rm of rawMaterials.filter(m => m.isActive)) {
    const stock = getCurrentStock(rm.id);
    const req = dashboardReqs.find(r => r.rawMaterialId === rm.id);
    const requiredGross = req ? req.grossRequirement : 0;

    if (requiredGross > stock) {
      missingRawMaterials.push({
        name: rm.name,
        rawMaterialId: rm.id,
        required: requiredGross,
        available: stock,
        missing: requiredGross - stock,
        unit: rm.unit
      });
    } else if (stock <= rm.criticalStockLevel) {
      criticalStockCount++;
    }
  }

  // 8. Ortalama Fire Orani Karti
  let averageWasteRate = 0;
  let wasteRateSource: 'varsayilan' | 'gercek' = 'varsayilan';

  const actualWasteRecords = wasteRecords || (() => {
    const data = localStorage.getItem('tazeuret_waste_records');
    return data ? JSON.parse(data) : [];
  })();

  if (actualWasteRecords && actualWasteRecords.length > 0) {
    const totalWaste = actualWasteRecords.reduce((sum, r) => sum + r.wasteRate, 0);
    averageWasteRate = totalWaste / actualWasteRecords.length;
    wasteRateSource = 'gercek';
  } else {
    const activeRMs = rawMaterials.filter(m => m.isActive);
    const totalDefaultWaste = activeRMs.reduce((sum, m) => sum + (m.defaultWasteRate || 0), 0);
    averageWasteRate = activeRMs.length > 0 ? totalDefaultWaste / activeRMs.length : 0;
    wasteRateSource = 'varsayilan';
  }

  // 9. Top 5 Needed Materials
  const topRequiredMaterials = [...dashboardReqs]
    .sort((a, b) => b.grossRequirement - a.grossRequirement)
    .slice(0, 5)
    .map(r => {
      const stock = getCurrentStock(r.rawMaterialId);
      return {
        rawMaterialId: r.rawMaterialId,
        rawMaterialName: r.rawMaterialName,
        unit: r.unit,
        grossRequirement: r.grossRequirement,
        currentStock: stock
      };
    });

  // 10. Tables list
  const todayProductionItems = todayPlanItems.map(pi => {
    const prod = products.find(p => p.id === pi.productId);
    const cust = customers.find(c => c.id === pi.customerId);
    return {
      id: pi.id,
      productName: prod?.name || 'Bilinmeyen Ürün',
      customerName: cust?.name || 'Bilinmeyen Müşteri',
      plannedQuantity: pi.plannedQuantity,
      producedQuantity: pi.producedQuantity || 0,
      status: pi.status || 'Onaylandı'
    };
  });

  const tomorrowShipmentItems = tomorrowOrders.flatMap(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const items = activeOrderItems.filter(i => i.orderId === o.id);
    return items.map(item => {
      const prod = products.find(p => p.id === item.productId);
      return {
        id: item.id,
        customerName: cust?.name || 'Bilinmeyen Müşteri',
        productName: prod?.name || 'Bilinmeyen Ürün',
        quantity: item.quantity,
        status: o.computedStatus || o.status
      };
    });
  });

  // 11. Charts Data
  // Product Order Charts Today + Tomorrow
  const chartOrders = activeOrders.filter(o => 
    (o.deliveryDate === selectedDate || o.deliveryDate === tomorrowDate) && 
    o.approvalStatus !== 'İptal'
  );
  const chartItems = activeOrderItems.filter(i => chartOrders.some(o => o.id === i.orderId));
  const productQuantities: Record<string, number> = {};
  for (const item of chartItems) {
    const prod = products.find(p => p.id === item.productId);
    if (prod) {
      productQuantities[prod.name] = (productQuantities[prod.name] || 0) + item.quantity;
    }
  }
  const productOrderChartData = Object.keys(productQuantities).map(name => ({
    name,
    Adet: productQuantities[name]
  }));

  // Raw Material Share (kg only)
  const rawMaterialRequirementChartData = dashboardReqs
    .filter(r => r.unit === 'kg')
    .map(r => ({
      name: r.rawMaterialName,
      value: parseFloat(r.grossRequirement.toFixed(2))
    }));

  // Profitability Chart
  const profitabilityChartData = products
    .filter(p => p.isActive)
    .map(p => {
      const breakdown = calculateProductCost(p, productRecipes, rawMaterials, settings, activeStockMovements);
      return {
        name: p.name.split(' ').slice(1).join(' ') || p.name,
        Maliyet: parseFloat(breakdown.totalCostPerPackage.toFixed(2)),
        Fiyat: p.salePrice,
        Kar: parseFloat(breakdown.profitPerPackage.toFixed(2))
      };
    });

  // Planın Gerisinde (Behind schedule) calculation
  const dailyBehindMetrics = calculateDailyProductionBehind(
    selectedDate,
    activeProductionPlans,
    activeProductionPlanItems,
    activeProductionRuns
  );

  const behindScheduleItemsCount = dailyBehindMetrics.behindItemsCount;
  const behindScheduleTotalQuantity = dailyBehindMetrics.behind;

  return {
    todayOrderQuantity,
    tomorrowShipmentQuantity,
    todayPlannedProductionQuantity,
    todayCompletedProductionQuantity,
    todayProductionCost,
    todayEstimatedRevenue,
    todayRawMaterialRequirementKg,
    criticalStockCount,
    missingRawMaterials,
    averageWasteRate,
    wasteRateSource,
    topRequiredMaterials,
    todayProductionItems,
    tomorrowShipmentItems,
    productOrderChartData,
    rawMaterialRequirementChartData,
    profitabilityChartData,
    tomorrowReadyQuantity,
    tomorrowMissingQuantity,
    behindScheduleItemsCount,
    behindScheduleTotalQuantity
  };
}

export function calculateUnifiedRawMaterialNeeds(params: {
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
  productRecipes: ProductRecipeItem[];
  rawMaterials: RawMaterial[];
  stockMovements: StockMovement[];
  productionPlans: any[];
  productionPlanItems: any[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  settings: CostSettings;
  targetDate?: string;
  dateRange?: { start: string; end: string };
  mode: "remaining_orders" | "production_plan_remaining" | "today_plan" | "tomorrow_orders";
  productionPlanId?: string;
}): RawMaterialRequirement[] {
  const {
    orders,
    orderItems,
    products,
    productRecipes,
    rawMaterials,
    stockMovements,
    productionPlans,
    productionPlanItems,
    productionRuns,
    finishedGoodsStocks,
    finishedGoodsMovements,
    settings,
    targetDate,
    mode,
    productionPlanId
  } = params;

  // 1. Exclude soft deleted records
  const activeOrders = orders.filter(o => !o.isDeleted);
  const activeOrderItems = orderItems.filter(oi => !(oi as any).isDeleted);
  const activeProductionPlans = productionPlans.filter(p => !p.isDeleted);
  const activeProductionPlanItems = productionPlanItems.filter(pi => !(pi as any).isDeleted);
  const activeProductionRuns = productionRuns.filter(r => !r.isDeleted);
  const activeStockMovements = stockMovements.filter(m => !m.isDeleted);
  const activeFinishedGoodsStocks = finishedGoodsStocks.filter(s => !s.isDeleted);
  const activeFinishedGoodsMovements = finishedGoodsMovements.filter(m => !(m as any).isDeleted);

  let formattedItems: { productId: string; quantity: number; orderItem?: OrderItem }[] = [];

  if (mode === "remaining_orders") {
    // Approved active open orders requiring production
    const approvedOrders = activeOrders.filter(o => o.approvalStatus === "Onaylandı");
    
    for (const order of approvedOrders) {
      const computedStatus = calculateOrderComputedStatus(
        order,
        activeOrderItems,
        activeProductionPlanItems,
        activeFinishedGoodsStocks,
        activeFinishedGoodsMovements,
        activeProductionRuns
      );

      // Skip fully shipped or produced or canceled orders
      if (computedStatus === "Sevk Edildi" || computedStatus === "Üretildi" || computedStatus === "İptal") {
        continue;
      }

      const items = activeOrderItems.filter(oi => oi.orderId === order.id);
      for (const item of items) {
        const producedQty = activeProductionRuns
          .filter(r => r.orderItemId === item.id)
          .reduce((sum, r) => sum + r.producedQuantity, 0);
        
        const remainingToProduce = Math.max(0, item.quantity - producedQty);
        if (remainingToProduce > 0) {
          formattedItems.push({
            productId: item.productId,
            quantity: remainingToProduce,
            orderItem: item
          });
        }
      }
    }
  } else if (mode === "production_plan_remaining") {
    if (productionPlanId) {
      const plan = activeProductionPlans.find(p => p.id === productionPlanId);
      const isClosed = isProductionPlanClosed(plan);
      
      const planItems = activeProductionPlanItems.filter(
        pi => pi.productionPlanId === productionPlanId && pi.status !== "İptal"
      );

      for (const pi of planItems) {
        const producedQty = activeProductionRuns
          .filter(r => r.productionPlanItemId === pi.id)
          .reduce((sum, r) => sum + r.producedQuantity, 0);

        const remainingToProduce = isClosed ? 0 : Math.max(0, pi.plannedQuantity - producedQty);
        const orderItem = activeOrderItems.find(oi => oi.id === pi.orderItemId);
        
        formattedItems.push({
          productId: pi.productId,
          quantity: remainingToProduce,
          orderItem
        });
      }
    }
  } else if (mode === "today_plan") {
    const todayStr = targetDate || new Date().toISOString().split("T")[0];
    const todayPlans = activeProductionPlans.filter(p => (p.productionDate || p.date) === todayStr);
    const todayPlanItems = activeProductionPlanItems.filter(
      pi => todayPlans.some(p => p.id === pi.productionPlanId) && pi.status !== "İptal"
    );

    for (const pi of todayPlanItems) {
      const plan = activeProductionPlans.find(p => p.id === pi.productionPlanId);
      const isClosed = isProductionPlanClosed(plan);

      const producedQty = activeProductionRuns
        .filter(r => r.productionPlanItemId === pi.id)
        .reduce((sum, r) => sum + r.producedQuantity, 0);

      const remainingToProduce = isClosed ? 0 : Math.max(0, pi.plannedQuantity - producedQty);
      const orderItem = activeOrderItems.find(oi => oi.id === pi.orderItemId);

      formattedItems.push({
        productId: pi.productId,
        quantity: remainingToProduce,
        orderItem
      });
    }
  } else if (mode === "tomorrow_orders") {
    const tomorrowStr = targetDate || (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split("T")[0];
    })();

    const tomorrowOrders = activeOrders.filter(
      o => o.deliveryDate === tomorrowStr && o.approvalStatus === "Onaylandı"
    );

    for (const order of tomorrowOrders) {
      const computedStatus = calculateOrderComputedStatus(
        order,
        activeOrderItems,
        activeProductionPlanItems,
        activeFinishedGoodsStocks,
        activeFinishedGoodsMovements,
        activeProductionRuns
      );

      if (computedStatus === "Sevk Edildi" || computedStatus === "Üretildi" || computedStatus === "İptal") {
        continue;
      }

      const items = activeOrderItems.filter(oi => oi.orderId === order.id);
      for (const item of items) {
        const producedQty = activeProductionRuns
          .filter(r => r.orderItemId === item.id)
          .reduce((sum, r) => sum + r.producedQuantity, 0);

        const remainingToProduce = Math.max(0, item.quantity - producedQty);
        if (remainingToProduce > 0) {
          formattedItems.push({
            productId: item.productId,
            quantity: remainingToProduce,
            orderItem: item
          });
        }
      }
    }
  }

  // Calculate using the standard production plan requirements runner
  return calculateRawMaterialRequirementsForProductionPlan(
    formattedItems,
    products,
    productRecipes,
    rawMaterials,
    settings,
    activeStockMovements
  );
}

export function normalizeProductionPlanStatus(status: string): ProductionPlanStatus {
  if (!status) return 'Planlandı';
  const s = status.trim();
  const lower = s.toLowerCase();
  
  if (lower === 'tamamlandı' || lower === 'completed' || lower === 'plan tamamlandı') {
    return 'Tamamlandı';
  }
  if (lower === 'eksikle kapatıldı' || lower === 'eksiklekapatildi' || lower === 'eksik üretildi') {
    return 'Eksikle Kapatıldı';
  }
  if (lower === 'planın gerisinde' || lower === 'planingerisinde' || lower === 'kısmi üretildi' || lower === 'kismi uretildi' || lower === 'üretimde' || lower === 'uretimde' || lower === 'kısmi' || lower === 'eksik üretildi' || lower === 'hazırlanıyor') {
    return 'Planın Gerisinde';
  }
  if (lower === 'plan üstü üretim' || lower === 'planustuuretim') {
    return 'Plan Üstü Üretim';
  }
  if (lower === 'planlandı' || lower === 'bekliyor') {
    return 'Planlandı';
  }
  if (lower === 'iptal') {
    return 'İptal';
  }
  if (lower === 'boş plan' || lower === 'bos plan') {
    return 'Boş Plan';
  }
  
  return s as ProductionPlanStatus;
}

export function calculateProductionPlanStatus(
  productionPlanId: string,
  productionPlanItems: any[],
  productionRuns: any[],
  currentStatus?: string
): ProductionPlanStatus {
  const activeItems = productionPlanItems.filter(
    pi => pi.productionPlanId === productionPlanId && !pi.isDeleted
  );

  if (activeItems.length === 0) {
    return "Boş Plan";
  }

  const nonCanceledItems = activeItems.filter(pi => pi.status !== "İptal");
  if (nonCanceledItems.length === 0) {
    return "İptal";
  }

  // Find non-deleted runs associated with this plan's items
  const activeRuns = productionRuns.filter(
    r => r.productionPlanId === productionPlanId && !r.isDeleted
  );

  const totalProduced = activeRuns.reduce((sum, r) => sum + r.producedQuantity, 0);
  if (totalProduced === 0) {
    return "Planlandı";
  }

  let allCompleted = true;
  for (const item of nonCanceledItems) {
    const itemRuns = activeRuns.filter(r => r.productionPlanItemId === item.id);
    const producedQty = itemRuns.reduce((sum, r) => sum + r.producedQuantity, 0);
    const remainingToProduce = Math.max(0, item.plannedQuantity - producedQty);
    if (remainingToProduce > 0) {
      allCompleted = false;
      break;
    }
  }

  if (allCompleted) {
    return "Tamamlandı";
  }

  if (currentStatus === "Eksikle Kapatıldı") {
    return "Eksikle Kapatıldı";
  }

  return "Planın Gerisinde";
}

export function calculateProductionPlanItemStatus(
  productionPlanItemId: string,
  productionPlanItems: any[],
  productionRuns: any[],
  orders?: any[],
  orderItems?: any[]
): ProductionPlanStatus {
  const item = productionPlanItems.find(pi => pi.id === productionPlanItemId);
  if (!item) return "Planlandı";
  if (item.status === "İptal") return "İptal";
  if (item.isLocked === true) return item.status;

  const runs = productionRuns.filter(
    r => r.productionPlanItemId === productionPlanItemId && !r.isDeleted
  );
  const producedQuantity = runs.reduce((sum, r) => sum + r.producedQuantity, 0);
  const remainingQuantity = Math.max(0, item.plannedQuantity - producedQuantity);

  if (producedQuantity === 0) {
    if (orderItems && orders) {
      const oItem = orderItems.find(oi => oi.id === item.orderItemId);
      const order = oItem ? orders.find(o => o.id === oItem.orderId) : null;
      if (oItem) {
        const orderQuantity = oItem.quantity;
        const totalProducedForOrderItem = getOrderItemProducedQuantity(oItem.id, productionPlanItems, productionRuns);
        const remainingToProduce = Math.max(orderQuantity - totalProducedForOrderItem, 0);

        const isClosed = isClosedOrderStatus(order?.status) || 
                         isClosedOrderStatus(order?.computedStatus) || 
                         isClosedOrderStatus((oItem as any)?.status) || 
                         isClosedOrderStatus((oItem as any)?.computedStatus) ||
                         remainingToProduce <= 0;
        if (isClosed) {
          return "Devirle Tamamlandı";
        }
      }
    }
    return "Planlandı";
  }
  if (producedQuantity > item.plannedQuantity) {
    return "Plan Üstü Üretim";
  }
  if (remainingQuantity === 0) {
    return "Tamamlandı";
  }

  if (orderItems && orders) {
    const oItem = orderItems.find(oi => oi.id === item.orderItemId);
    const order = oItem ? orders.find(o => o.id === oItem.orderId) : null;
    if (oItem) {
      const orderQuantity = oItem.quantity;
      const totalProducedForOrderItem = getOrderItemProducedQuantity(oItem.id, productionPlanItems, productionRuns);
      const remainingToProduce = Math.max(orderQuantity - totalProducedForOrderItem, 0);

      const isClosed = isClosedOrderStatus(order?.status) || 
                       isClosedOrderStatus(order?.computedStatus) || 
                       isClosedOrderStatus((oItem as any)?.status) || 
                       isClosedOrderStatus((oItem as any)?.computedStatus) ||
                       remainingToProduce <= 0;
      if (isClosed) {
        return "Devirle Tamamlandı";
      }
    }
  }

  return "Planın Gerisinde";
}

export function syncProductionPlanStatuses(
  productionPlans: any[],
  productionPlanItems: any[],
  productionRuns: any[]
): any[] {
  return productionPlans.map(plan => {
    if (isProductionPlanClosed(plan)) {
      return plan;
    }
    const computedStatus = calculateProductionPlanStatus(plan.id, productionPlanItems, productionRuns, plan.status);

    return {
      ...plan,
      status: computedStatus,
      updatedAt: new Date().toISOString()
    };
  });
}

export function isProductionPlanClosed(plan: ProductionPlan | undefined | null): boolean {
  if (!plan) return false;
  if (plan.closedAt) return true;
  if (plan.completedAt) return true;
  if (plan.closedWithShortage === true) return true;
  if (plan.isLocked === true) return true;

  const status = (plan.status || '').toLocaleLowerCase('tr-TR').trim();
  if (
    status === "eksikle kapatıldı" ||
    status === "iptal" ||
    status === "iptal edildi" ||
    status === "kapalı" ||
    status === "eksikle_kapatildi" ||
    status === "closed_with_shortage" ||
    status === "cancelled" ||
    status === "closed"
  ) {
    return true;
  }
  return false;
}

export function getOrderDisplayNumber(orderId: string | undefined, orders: Order[]): string {
  if (!orderId) return 'Sipariş bulunamadı';
  const order = orders.find(o => o.id === orderId);
  if (!order) return 'Sipariş bulunamadı';
  if (order.orderNumber) {
    return order.orderNumber.startsWith('#') ? order.orderNumber : `#${order.orderNumber}`;
  }
  return order.id.startsWith('#') ? order.id : `#${order.id.replace('ord_', '').toUpperCase()}`;
}

export interface OrderProductionProgressItem {
  orderId: string;
  orderItemId: string;
  orderNo: string;
  customerName: string;
  productName: string;
  orderQty: number;
  plannedQty: number;
  producedQty: number;
  remainingQty: number;
  progressPercent: number;
  orderDate: string;
  deliveryDate: string;
  lots: string[];
  isExpired: boolean;
  delayDays: number;
  statusLabel: string;
  statusColor: string;
  shippedQty?: number;
}

export function calculateOrderProductionProgress({
  orders,
  orderItems,
  customers,
  products,
  productionPlanItems,
  productionRuns,
  finishedGoodsStocks,
  finishedGoodsMovements,
  todayStr
}: {
  orders: Order[];
  orderItems: OrderItem[];
  customers: Customer[];
  products: Product[];
  productionPlanItems: ProductionPlanItem[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  todayStr: string;
}): OrderProductionProgressItem[] {
  if (!orders || !orderItems) return [];
  
  const progressList: OrderProductionProgressItem[] = [];
  
  orders.forEach(order => {
    if (order.isDeleted) return;
    
    // Filter out canceled or completely shipped orders overall
    const statusLower = (order.status || '').toLowerCase().trim();
    const appStatusLower = (order.approvalStatus || '').toLowerCase().trim();
    if (
      statusLower === 'iptal' || 
      statusLower === 'sevk edildi' ||
      statusLower === 'kapandı' ||
      statusLower === 'kapandi' ||
      appStatusLower === 'iptal'
    ) {
      return;
    }

    // Also filter out dynamically calculated 'İptal' status orders
    const computedStatus = calculateOrderComputedStatus(
      order,
      orderItems,
      productionPlanItems,
      finishedGoodsStocks,
      finishedGoodsMovements,
      productionRuns
    );
    if (computedStatus === 'İptal') {
      return;
    }
    
    const items = orderItems.filter(oi => oi.orderId === order.id);
    const customer = customers.find(c => c.id === order.customerId);
    const customerName = customer ? customer.name : 'Bilinmeyen Müşteri';
    
    items.forEach(oi => {
      const product = products.find(p => p.id === oi.productId);
      if (!product) return;
      
      // Calculate shipped quantity for this specific order item
      const shippedQty = finishedGoodsMovements
        .filter(m => m.orderItemId === oi.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
        .reduce((sum, m) => sum + (m.quantity || 0), 0);
        
      // Check if finished goods stocks indicate this item is shipped
      const itemStocks = finishedGoodsStocks ? finishedGoodsStocks.filter(fgs => fgs.orderItemId === oi.id && !fgs.isDeleted) : [];
      const hasFGS = itemStocks.length > 0;
      const isSevkEdildi = (hasFGS && itemStocks.every(f => f.status === 'Sevk Edildi' || f.status?.toLowerCase() === 'shipped')) ||
                           (shippedQty >= oi.quantity && oi.quantity > 0);
        
      // Exclude if completely shipped
      if (isSevkEdildi || (shippedQty >= oi.quantity && oi.quantity > 0)) {
        return;
      }

      // Also exclude if completely cancelled or fire/zayiat at the item/stock level
      const isItemIptal = hasFGS && itemStocks.every(f => f.status === 'İptal' || f.status === 'Fire' || f.status?.toLowerCase() === 'cancelled');
      if (isItemIptal && shippedQty === 0) {
        return;
      }
      
      const orderNo = order.orderNumber 
        ? (order.orderNumber.startsWith('#') ? order.orderNumber : `#${order.orderNumber}`)
        : `#${order.id.replace('ord_', '').toUpperCase()}`;
        
      const orderQty = oi.quantity;
      const rawPlanned = getOrderItemPlannedQuantity(oi.id, productionPlanItems);
      const plannedQty = Math.min(rawPlanned, orderQty);
      const producedQty = getOrderItemProducedQuantity(oi.id, productionPlanItems, productionRuns);
      const remainingQty = Math.max(0, orderQty - producedQty);
      const progressPercent = orderQty > 0 ? Math.min((producedQty / orderQty) * 100, 100) : 0;
      
      // Extract lot numbers
      const lotsSet = new Set<string>();
      if (productionRuns) {
        productionRuns
          .filter(r => r.orderItemId === oi.id && !r.isDeleted && r.lotNo)
          .forEach(r => lotsSet.add(r.lotNo!));
      }
      if (finishedGoodsStocks) {
        finishedGoodsStocks
          .filter(f => f.orderItemId === oi.id && !f.isDeleted && f.lotNo)
          .forEach(f => lotsSet.add(f.lotNo!));
      }
      const lots = Array.from(lotsSet).filter(l => l.trim() !== "");
      
      // Delay and expiration
      const isExpired = todayStr > order.deliveryDate;
      let delayDays = 0;
      if (isExpired) {
        const tDate = new Date(todayStr);
        const dDate = new Date(order.deliveryDate);
        const diffTime = tDate.getTime() - dDate.getTime();
        delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      
      // Status label and color
      let statusLabel = "";
      let statusColor = "";
      
      if (isExpired) {
        statusLabel = "Sevk Tarihi Geçti";
        statusColor = "bg-rose-50 text-rose-700 border-rose-200";
      } else if (producedQty >= orderQty) {
        statusLabel = "Hazır / Sevke Yakın";
        statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
      } else if (progressPercent >= 80) {
        statusLabel = "Tamamlanmaya Yakın";
        statusColor = "bg-teal-50 text-teal-700 border-teal-200";
      } else if (producedQty > 0) {
        statusLabel = "Üretimde";
        statusColor = "bg-blue-50 text-blue-700 border-blue-200";
      } else if (plannedQty > 0) {
        statusLabel = "Planlandı";
        statusColor = "bg-amber-50 text-amber-700 border-amber-200";
      } else {
        statusLabel = "Planlanmadı";
        statusColor = "bg-slate-50 text-slate-700 border-slate-200";
      }
      
      progressList.push({
        orderId: order.id,
        orderItemId: oi.id,
        orderNo,
        customerName,
        productName: product.name,
        orderQty,
        plannedQty,
        producedQty,
        remainingQty,
        progressPercent,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        lots,
        isExpired,
        delayDays,
        statusLabel,
        statusColor,
        shippedQty
      });
    });
  });
  
  // Sort list based on the criteria
  progressList.sort((a, b) => {
    // 1. Sevk tarihi geçmiş olanlar en üstte
    if (a.isExpired !== b.isExpired) {
      return a.isExpired ? -1 : 1;
    }
    
    // 2. Sonra sevk tarihi en yakın olanlar (deliveryDate ascending)
    if (a.deliveryDate !== b.deliveryDate) {
      return a.deliveryDate.localeCompare(b.deliveryDate);
    }
    
    // 3. Aynı tarihtekiler için: üretim ilerlemesi düşük olanlar üstte
    if (a.progressPercent !== b.progressPercent) {
      return a.progressPercent - b.progressPercent;
    }
    
    // 4. Kalan üretimi yüksek olanlar üstte
    return b.remainingQty - a.remainingQty;
  });
  
  return progressList;
}



