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
  WasteRecord,
  CostSettings
} from '../types';
import { normalizeOrder, normalizeFinishedGoodsStock, normalizeStockMovement, normalizeProductionPlan, normalizeProductionPlanItem } from '../utils/normalize';
import { getTodayISO, getTomorrowISO } from '../utils/dateHelper';

// Helper to generate unique IDs
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// STORAGE KEYS
export const KEYS = {
  CUSTOMERS: 'tazeuret_customers',
  RAW_MATERIALS: 'tazeuret_raw_materials',
  PRODUCTS: 'tazeuret_products',
  RECIPES: 'tazeuret_recipes',
  STOCK_MOVEMENTS: 'tazeuret_stock_movements',
  ORDERS: 'tazeuret_orders',
  ORDER_ITEMS: 'tazeuret_order_items',
  PRODUCTION_PLANS: 'tazeuret_production_plans',
  PRODUCTION_PLAN_ITEMS: 'tazeuret_production_plan_items',
  FINISHED_GOODS: 'tazeuret_finished_goods_stocks',
  FINISHED_GOODS_MOVEMENTS: 'tazeuret_finished_goods_movements',
  WASTE_RECORDS: 'tazeuret_waste_records',
  COST_SETTINGS: 'tazeuret_cost_settings',
  PRODUCTION_RUNS: 'tazeuret_production_runs'
};

// INITIAL MOCK DATA - Marked with isDemo: true
const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust_otel_a',
    name: 'Otel A',
    type: 'Otel',
    phone: '0212 555 1111',
    email: 'info@otela.com',
    address: 'Beşiktaş, İstanbul',
    deliveryNote: 'Arka kapıdan teslimat yapılacak, sabah 08:00 öncesi.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'cust_kafe_b',
    name: 'Kafe B',
    type: 'Kafe',
    phone: '0212 555 2222',
    email: 'siparis@kafeb.com',
    address: 'Kadıköy, İstanbul',
    deliveryNote: 'Mutfak şefine teslim edilecek.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'cust_catering_c',
    name: 'Catering C',
    type: 'Catering',
    phone: '0216 444 3333',
    email: 'operasyon@cateringc.com',
    address: 'Ümraniye, İstanbul',
    deliveryNote: 'Hafta içi 09:00 - 12:00 arası teslimat.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'cust_market_d',
    name: 'Market D',
    type: 'Market',
    phone: '0850 333 4444',
    email: 'satinalma@marketd.com',
    address: 'Şişli, İstanbul',
    deliveryNote: 'Mal kabul departmanına barkod kontrolü ile.',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

const INITIAL_RAW_MATERIALS: RawMaterial[] = [
  {
    id: 'rm_ananas',
    name: 'Ananas',
    category: 'Meyve',
    unit: 'kg',
    purchasePrice: 45,
    defaultWasteRate: 40,
    defaultYieldRate: 60,
    criticalStockLevel: 50,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_kivi',
    name: 'Kivi',
    category: 'Meyve',
    unit: 'kg',
    purchasePrice: 60,
    defaultWasteRate: 25,
    defaultYieldRate: 75,
    criticalStockLevel: 20,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_uzum',
    name: 'Üzüm',
    category: 'Meyve',
    unit: 'kg',
    purchasePrice: 50,
    defaultWasteRate: 10,
    defaultYieldRate: 90,
    criticalStockLevel: 20,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_kavun',
    name: 'Kavun',
    category: 'Meyve',
    unit: 'kg',
    purchasePrice: 25,
    defaultWasteRate: 35,
    defaultYieldRate: 65,
    criticalStockLevel: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_karpuz',
    name: 'Karpuz',
    category: 'Meyve',
    unit: 'kg',
    purchasePrice: 15,
    defaultWasteRate: 35,
    defaultYieldRate: 65,
    criticalStockLevel: 50,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_havuc',
    name: 'Havuç',
    category: 'Sebze',
    unit: 'kg',
    purchasePrice: 18,
    defaultWasteRate: 15,
    defaultYieldRate: 85,
    criticalStockLevel: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_salatalik',
    name: 'Salatalık',
    category: 'Sebze',
    unit: 'kg',
    purchasePrice: 22,
    defaultWasteRate: 12,
    defaultYieldRate: 88,
    criticalStockLevel: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_marul',
    name: 'Marul',
    category: 'Sebze',
    unit: 'kg',
    purchasePrice: 20,
    defaultWasteRate: 20,
    defaultYieldRate: 80,
    criticalStockLevel: 25,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_kap_125',
    name: '125 g kap',
    category: 'Ambalaj',
    unit: 'adet',
    purchasePrice: 1.20,
    defaultWasteRate: 0,
    defaultYieldRate: 100,
    criticalStockLevel: 1000,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_kap_250',
    name: '250 g kap',
    category: 'Ambalaj',
    unit: 'adet',
    purchasePrice: 1.60,
    defaultWasteRate: 0,
    defaultYieldRate: 100,
    criticalStockLevel: 1000,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'rm_kap_300',
    name: '300 g kap',
    category: 'Ambalaj',
    unit: 'adet',
    purchasePrice: 1.90,
    defaultWasteRate: 0,
    defaultYieldRate: 100,
    criticalStockLevel: 1000,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod_ananas_125',
    name: '125 g Ananas Dilimleri',
    category: 'Ananas',
    packageWeightGrams: 125,
    salePrice: 35,
    defaultSafetyRate: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'prod_meyve_mix_250',
    name: '250 g Meyve Mix',
    category: 'Meyve Mix',
    packageWeightGrams: 250,
    salePrice: 55,
    defaultSafetyRate: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'prod_sebze_mix_300',
    name: '300 g Sebze Mix',
    category: 'Sebze Mix',
    packageWeightGrams: 300,
    salePrice: 45,
    defaultSafetyRate: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'prod_karpuz_200',
    name: '200 g Karpuz Dilimleri',
    category: 'Tekli Meyve',
    packageWeightGrams: 200,
    salePrice: 30,
    defaultSafetyRate: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'prod_kavun_150',
    name: '150 g Kavun Dilimleri',
    category: 'Tekli Meyve',
    packageWeightGrams: 150,
    salePrice: 28,
    defaultSafetyRate: 3,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  },
  {
    id: 'prod_salata_mix_250',
    name: '250 g Salata Mix',
    category: 'Salata Mix',
    packageWeightGrams: 250,
    salePrice: 38,
    defaultSafetyRate: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

const INITIAL_RECIPES: ProductRecipeItem[] = [
  { id: 'rec_1', productId: 'prod_ananas_125', rawMaterialId: 'rm_ananas', quantity: 125, unit: 'g' },
  { id: 'rec_2', productId: 'prod_ananas_125', rawMaterialId: 'rm_kap_125', quantity: 1, unit: 'adet' },
  { id: 'rec_3', productId: 'prod_meyve_mix_250', rawMaterialId: 'rm_ananas', quantity: 100, unit: 'g' },
  { id: 'rec_4', productId: 'prod_meyve_mix_250', rawMaterialId: 'rm_kivi', quantity: 50, unit: 'g' },
  { id: 'rec_5', productId: 'prod_meyve_mix_250', rawMaterialId: 'rm_uzum', quantity: 50, unit: 'g' },
  { id: 'rec_6', productId: 'prod_meyve_mix_250', rawMaterialId: 'rm_kavun', quantity: 50, unit: 'g' },
  { id: 'rec_7', productId: 'prod_meyve_mix_250', rawMaterialId: 'rm_kap_250', quantity: 1, unit: 'adet' },
  { id: 'rec_8', productId: 'prod_sebze_mix_300', rawMaterialId: 'rm_havuc', quantity: 100, unit: 'g' },
  { id: 'rec_9', productId: 'prod_sebze_mix_300', rawMaterialId: 'rm_salatalik', quantity: 100, unit: 'g' },
  { id: 'rec_10', productId: 'prod_sebze_mix_300', rawMaterialId: 'rm_marul', quantity: 100, unit: 'g' },
  { id: 'rec_11', productId: 'prod_sebze_mix_300', rawMaterialId: 'rm_kap_300', quantity: 1, unit: 'adet' },
  { id: 'rec_12', productId: 'prod_karpuz_200', rawMaterialId: 'rm_karpuz', quantity: 200, unit: 'g' },
  { id: 'rec_13', productId: 'prod_karpuz_200', rawMaterialId: 'rm_kap_250', quantity: 1, unit: 'adet' },
  { id: 'rec_14', productId: 'prod_kavun_150', rawMaterialId: 'rm_kavun', quantity: 150, unit: 'g' },
  { id: 'rec_15', productId: 'prod_kavun_150', rawMaterialId: 'rm_kap_125', quantity: 1, unit: 'adet' },
  { id: 'rec_16', productId: 'prod_salata_mix_250', rawMaterialId: 'rm_marul', quantity: 150, unit: 'g' },
  { id: 'rec_17', productId: 'prod_salata_mix_250', rawMaterialId: 'rm_salatalik', quantity: 50, unit: 'g' },
  { id: 'rec_18', productId: 'prod_salata_mix_250', rawMaterialId: 'rm_havuc', quantity: 50, unit: 'g' },
  { id: 'rec_19', productId: 'prod_salata_mix_250', rawMaterialId: 'rm_kap_250', quantity: 1, unit: 'adet' }
];

const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [
  { id: 'mov_1', rawMaterialId: 'rm_ananas', type: 'Stok Girişi', quantity: 55, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 45, totalCost: 55 * 45 },
  { id: 'mov_2', rawMaterialId: 'rm_kivi', type: 'Stok Girişi', quantity: 30, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 60, totalCost: 30 * 60 },
  { id: 'mov_3', rawMaterialId: 'rm_uzum', type: 'Stok Girişi', quantity: 25, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 50, totalCost: 25 * 50 },
  { id: 'mov_4', rawMaterialId: 'rm_kavun', type: 'Stok Girişi', quantity: 40, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 25, totalCost: 40 * 25 },
  { id: 'mov_5', rawMaterialId: 'rm_karpuz', type: 'Stok Girişi', quantity: 60, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 15, totalCost: 60 * 15 },
  { id: 'mov_6', rawMaterialId: 'rm_havuc', type: 'Stok Girişi', quantity: 35, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 18, totalCost: 35 * 18 },
  { id: 'mov_7', rawMaterialId: 'rm_salatalik', type: 'Stok Girişi', quantity: 35, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 22, totalCost: 35 * 22 },
  { id: 'mov_8', rawMaterialId: 'rm_marul', type: 'Stok Girişi', quantity: 40, date: getTodayISO(), note: 'İlk stok yüklemesi', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 20, totalCost: 40 * 20 },
  { id: 'mov_9', rawMaterialId: 'rm_kap_125', type: 'Stok Girişi', quantity: 1500, date: getTodayISO(), note: 'Karton alımı', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 1.20, totalCost: 1500 * 1.20 },
  { id: 'mov_10', rawMaterialId: 'rm_kap_250', type: 'Stok Girişi', quantity: 1200, date: getTodayISO(), note: 'Karton alımı', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 1.60, totalCost: 1200 * 1.60 },
  { id: 'mov_11', rawMaterialId: 'rm_kap_300', type: 'Stok Girişi', quantity: 1100, date: getTodayISO(), note: 'Karton alımı', createdAt: new Date().toISOString(), isDemo: true, unitPrice: 1.90, totalCost: 1100 * 1.90 }
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord_demo_1',
    customerId: 'cust_otel_a',
    orderDate: getTodayISO(),
    deliveryDate: getTomorrowISO(),
    status: 'Onaylandı',
    approvalStatus: 'Onaylandı',
    computedStatus: 'Onaylandı',
    note: 'Sipariş zamanında sevk edilmeli.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDemo: true
  }
];

const INITIAL_ORDER_ITEMS: OrderItem[] = [
  {
    id: 'item_demo_1',
    orderId: 'ord_demo_1',
    productId: 'prod_ananas_125',
    quantity: 350,
    unitSalePrice: 35
  }
];

const INITIAL_COST_SETTINGS: CostSettings = {
  defaultSafetyRate: 3,
  laborCostPerPackage: 2.5,
  overheadCostPerPackage: 1.5,
  deliveryCostPerPackage: 1.0,
  useAverageWasteRate: false,
  stockWarningThreshold: 15
};

// INITIALIZATION LOGIC
function loadFromStorage<T>(key: string, defaultValue: T): T {
  const data = localStorage.getItem(key);
  if (!data) {
    // We always save the default empty array or configuration value
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    console.error('Error parsing localStorage key ' + key, e);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Dynamic stock calculation helper
export function calculateCurrentStock(rawMaterialId: string, stockMovements: StockMovement[]): number {
  let stock = 0;
  const list = stockMovements.filter(m => m.rawMaterialId === rawMaterialId && !m.isDeleted);
  for (const m of list) {
    if (m.type === 'Stok Girişi' || m.type === 'Giriş') {
      stock += m.quantity;
    } else if (m.type === 'Stok Çıkışı' || m.type === 'Çıkış' || m.type === 'Fire Çıkışı' || m.type === 'Fire' || m.type === 'Üretim Tüketimi' || m.type === 'Üretim tüketimi') {
      stock -= m.quantity;
    } else if (m.type === 'Sayım Düzeltmesi' || m.type === 'Düzeltme') {
      stock += m.quantity; // Sayım düzeltmesi adds quantity (e.g., -10 to deduct, +10 to add)
    } else if (m.type === 'Üretim Geri Alma' || m.type === 'Üretim Silme İadesi') {
      stock += m.quantity;
    }
  }
  return stock;
}

export const localDataService = {
  // INITIALIZE ALL AS EMPTY BY DEFAULT
  init() {
    loadFromStorage(KEYS.CUSTOMERS, []);
    loadFromStorage(KEYS.RAW_MATERIALS, []);
    loadFromStorage(KEYS.PRODUCTS, []);
    loadFromStorage(KEYS.RECIPES, []);
    loadFromStorage(KEYS.STOCK_MOVEMENTS, []);
    loadFromStorage(KEYS.ORDERS, []);
    loadFromStorage(KEYS.ORDER_ITEMS, []);
    loadFromStorage(KEYS.PRODUCTION_PLANS, []);
    loadFromStorage(KEYS.PRODUCTION_PLAN_ITEMS, []);
    loadFromStorage(KEYS.FINISHED_GOODS, []);
    loadFromStorage(KEYS.FINISHED_GOODS_MOVEMENTS, []);
    loadFromStorage(KEYS.WASTE_RECORDS, []);
    loadFromStorage(KEYS.COST_SETTINGS, INITIAL_COST_SETTINGS);
  },

  // RESET ALL DATA
  resetAllData() {
    Object.values(KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    localDataService.init();
  },

  // CLEAR DEMO DATA ONLY
  clearDemoData() {
    // Customers
    const customers = localDataService.getCustomers();
    const demoCustomerIds = new Set(
      customers.filter(c => 
        c.isDemo || 
        c.id.startsWith('cust_otel_a') || 
        c.id.startsWith('cust_kafe_b') || 
        c.id.startsWith('cust_catering_c') || 
        c.id.startsWith('cust_market_d') ||
        ['Otel A', 'Kafe B', 'Catering C', 'Market D', 'Otel Grand Palas'].includes(c.name)
      ).map(c => c.id)
    );
    localDataService.saveCustomers(customers.filter(c => !demoCustomerIds.has(c.id) && !c.isDemo));

    // Raw Materials
    const materials = localDataService.getRawMaterials();
    const demoMaterialIds = new Set(
      materials.filter(m => 
        m.isDemo || 
        m.id.startsWith('rm_ananas') || 
        m.id.startsWith('rm_kivi') || 
        m.id.startsWith('rm_uzum') || 
        m.id.startsWith('rm_kavun') || 
        m.id.startsWith('rm_karpuz') || 
        m.id.startsWith('rm_havuc') || 
        m.id.startsWith('rm_salatalik') || 
        m.id.startsWith('rm_marul') || 
        m.id.startsWith('rm_kap_') ||
        ['Ananas', 'Kivi', 'Üzüm', 'Kavun', 'Karpuz', 'Havuç', 'Salatalık', 'Marul', '125 g kap', '250 g kap', '300 g kap'].includes(m.name)
      ).map(m => m.id)
    );
    localDataService.saveRawMaterials(materials.filter(m => !demoMaterialIds.has(m.id) && !m.isDemo));

    // Products
    const products = localDataService.getProducts();
    const demoProductIds = new Set(
      products.filter(p => 
        p.isDemo || 
        p.id.startsWith('prod_ananas_125') || 
        p.id.startsWith('prod_meyve_mix_250') || 
        p.id.startsWith('prod_sebze_mix_300') || 
        p.id.startsWith('prod_karpuz_200') || 
        p.id.startsWith('prod_kavun_150') || 
        p.id.startsWith('prod_salata_mix_250') ||
        ['125 g Ananas Dilimleri', '250 g Meyve Mix', '300 g Sebze Mix', '200 g Karpuz Dilimleri', '150 g Kavun Dilimleri', '250 g Salata Mix'].includes(p.name)
      ).map(p => p.id)
    );
    localDataService.saveProducts(products.filter(p => !demoProductIds.has(p.id) && !p.isDemo));

    // Recipes
    const recipes = localDataService.getRecipes();
    localDataService.saveRecipes(recipes.filter(r => !demoProductIds.has(r.productId)));

    // Stock Movements
    const movements = localDataService.getStockMovements();
    localDataService.saveStockMovements(movements.filter(m => 
      !m.isDemo && 
      !demoMaterialIds.has(m.rawMaterialId) && 
      !['mov_1', 'mov_2', 'mov_3', 'mov_4', 'mov_5', 'mov_6', 'mov_7', 'mov_8', 'mov_9', 'mov_10', 'mov_11'].includes(m.id)
    ));

    // Orders
    const orders = localDataService.getOrders();
    const demoOrderIds = new Set(
      orders.filter(o => 
        o.isDemo || 
        o.id === 'ord_demo_1' || 
        demoCustomerIds.has(o.customerId)
      ).map(o => o.id)
    );
    localDataService.saveOrders(orders.filter(o => !demoOrderIds.has(o.id) && !o.isDemo));

    // Order Items
    const orderItems = localDataService.getOrderItems();
    localDataService.saveOrderItems(orderItems.filter(item => !demoOrderIds.has(item.orderId)));

    // Production Plans & Items
    const plans = localDataService.getProductionPlans();
    const demoPlanIds = new Set(
      plans.filter(p => p.isDemo).map(p => p.id)
    );
    localDataService.saveProductionPlans(plans.filter(p => !demoPlanIds.has(p.id) && !p.isDemo));

    const planItems = localDataService.getProductionPlanItems();
    localDataService.saveProductionPlanItems(planItems.filter(item => !demoPlanIds.has(item.productionPlanId) && !demoOrderIds.has(item.orderId)));

    // Finished Goods
    const finishedGoods = localDataService.getFinishedGoods();
    localDataService.saveFinishedGoods(finishedGoods.filter(fg => !fg.isDemo && !demoProductIds.has(fg.productId) && !demoOrderIds.has(fg.orderId)));

    // Waste Records
    const waste = localDataService.getWasteRecords();
    localDataService.saveWasteRecords(waste.filter(w => !w.rawMaterialId || !demoMaterialIds.has(w.rawMaterialId)));
  },

  // CUSTOMERS
  getCustomers(): Customer[] {
    return loadFromStorage<Customer[]>(KEYS.CUSTOMERS, []);
  },
  saveCustomers(customers: Customer[]) {
    saveToStorage(KEYS.CUSTOMERS, customers);
  },
  addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const list = localDataService.getCustomers();
    const newCust: Customer = {
      ...customer,
      id: 'cust_' + generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newCust);
    localDataService.saveCustomers(list);
    return newCust;
  },
  updateCustomer(id: string, updates: Partial<Customer>): Customer {
    const list = localDataService.getCustomers();
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Customer not found');
    list[idx] = {
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    localDataService.saveCustomers(list);
    return list[idx];
  },
  deleteCustomer(id: string) {
    const list = localDataService.getCustomers();
    const filtered = list.filter(c => c.id !== id);
    localDataService.saveCustomers(filtered);
  },

  // RAW MATERIALS
  getRawMaterials(): RawMaterial[] {
    const list = loadFromStorage<RawMaterial[]>(KEYS.RAW_MATERIALS, []);
    return list.map(rm => ({
      ...rm,
      purchasePrice: typeof rm.purchasePrice === 'number' ? rm.purchasePrice : 0,
      averageCost: typeof rm.averageCost === 'number' ? rm.averageCost : (rm.averageCost ?? rm.purchasePrice ?? 0)
    }));
  },
  saveRawMaterials(list: RawMaterial[]) {
    saveToStorage(KEYS.RAW_MATERIALS, list);
  },
  addRawMaterial(rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>): RawMaterial {
    const list = localDataService.getRawMaterials();
    const newRm: RawMaterial = {
      ...rm,
      id: 'rm_' + generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newRm);
    localDataService.saveRawMaterials(list);
    return newRm;
  },
  updateRawMaterial(id: string, updates: Partial<RawMaterial>): RawMaterial {
    const list = localDataService.getRawMaterials();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('RawMaterial not found');
    list[idx] = {
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    localDataService.saveRawMaterials(list);
    return list[idx];
  },
  deleteRawMaterial(id: string) {
    const list = localDataService.getRawMaterials();
    const filtered = list.filter(r => r.id !== id);
    localDataService.saveRawMaterials(filtered);
  },

  // PRODUCTS
  getProducts(): Product[] {
    return loadFromStorage<Product[]>(KEYS.PRODUCTS, []);
  },
  saveProducts(list: Product[]) {
    saveToStorage(KEYS.PRODUCTS, list);
  },
  addProduct(prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const list = localDataService.getProducts();
    const newProd: Product = {
      ...prod,
      id: 'prod_' + generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    list.push(newProd);
    localDataService.saveProducts(list);
    return newProd;
  },
  updateProduct(id: string, updates: Partial<Product>): Product {
    const list = localDataService.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Product not found');
    list[idx] = {
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    localDataService.saveProducts(list);
    return list[idx];
  },
  deleteProduct(id: string) {
    const list = localDataService.getProducts();
    const filtered = list.filter(p => p.id !== id);
    localDataService.saveProducts(filtered);
    // Also clean up recipes for this product
    const recs = localDataService.getRecipes();
    const cleanRecs = recs.filter(r => r.productId !== id);
    localDataService.saveRecipes(cleanRecs);
  },

  // RECIPES
  getRecipes(): ProductRecipeItem[] {
    return loadFromStorage<ProductRecipeItem[]>(KEYS.RECIPES, []);
  },
  saveRecipes(list: ProductRecipeItem[]) {
    saveToStorage(KEYS.RECIPES, list);
  },
  addRecipeItem(item: Omit<ProductRecipeItem, 'id'>): ProductRecipeItem {
    const list = localDataService.getRecipes();
    const newItem: ProductRecipeItem = {
      ...item,
      id: 'rec_' + generateId()
    };
    list.push(newItem);
    localDataService.saveRecipes(list);
    return newItem;
  },
  updateRecipeItem(id: string, updates: Partial<ProductRecipeItem>): ProductRecipeItem {
    const list = localDataService.getRecipes();
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Recipe item not found');
    list[idx] = {
      ...list[idx],
      ...updates
    };
    localDataService.saveRecipes(list);
    return list[idx];
  },
  deleteRecipeItem(id: string) {
    const list = localDataService.getRecipes();
    const filtered = list.filter(r => r.id !== id);
    localDataService.saveRecipes(filtered);
  },

  // STOCK MOVEMENTS
  getStockMovements(): StockMovement[] {
    const list = loadFromStorage<any[]>(KEYS.STOCK_MOVEMENTS, []);
    return list.map(m => normalizeStockMovement(m));
  },
  saveStockMovements(list: StockMovement[]) {
    saveToStorage(KEYS.STOCK_MOVEMENTS, list);
  },
  addStockMovement(mov: Omit<StockMovement, 'id' | 'createdAt'>): StockMovement {
    const list = localDataService.getStockMovements();
    const newMov = normalizeStockMovement({
      ...mov,
      id: 'mov_' + generateId(),
      createdAt: new Date().toISOString()
    });
    list.push(newMov);
    localDataService.saveStockMovements(list);

    // Section 6: Update the related raw material's purchasePrice with this unitPrice!
    if ((newMov.type === 'Stok Girişi' || newMov.type === 'Giriş') && typeof newMov.unitPrice === 'number' && newMov.unitPrice > 0) {
      localDataService.updateRawMaterial(newMov.rawMaterialId, { purchasePrice: newMov.unitPrice });
    }

    return newMov;
  },
  updateStockMovement(id: string, updates: Partial<StockMovement>): StockMovement {
    const list = localDataService.getStockMovements();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) throw new Error('Stock movement not found');
    
    const updated = normalizeStockMovement({
      ...list[idx],
      ...updates
    });
    list[idx] = updated;
    localDataService.saveStockMovements(list);

    // Section 6: If movement is "Stok Girişi", update the raw material's purchasePrice with this unitPrice!
    if ((updated.type === 'Stok Girişi' || updated.type === 'Giriş') && typeof updated.unitPrice === 'number' && updated.unitPrice > 0 && !updated.isDeleted) {
      localDataService.updateRawMaterial(updated.rawMaterialId, { purchasePrice: updated.unitPrice });
    }

    return updated;
  },
  deleteStockMovement(id: string) {
    const list = localDataService.getStockMovements();
    const idx = list.findIndex(m => m.id === id);
    if (idx !== -1) {
      // Soft delete
      list[idx].isDeleted = true;
      localDataService.saveStockMovements(list);
    }
  },

  // Calculate stocks in real-time based on movements
  getCurrentStocks(): Record<string, number> {
    const materials = localDataService.getRawMaterials();
    const movements = localDataService.getStockMovements();
    const stocks: Record<string, number> = {};
    for (const m of materials) {
      stocks[m.id] = calculateCurrentStock(m.id, movements);
    }
    return stocks;
  },

  // ORDERS
  getOrders(): Order[] {
    const list = loadFromStorage<any[]>(KEYS.ORDERS, []);
    return list.map(o => normalizeOrder(o));
  },
  saveOrders(list: Order[]) {
    saveToStorage(KEYS.ORDERS, list);
  },
  addOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]): Order {
    const list = localDataService.getOrders();
    const orderId = 'ord_' + generateId();
    const newOrder = normalizeOrder({
      ...order,
      id: orderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    list.push(newOrder);
    localDataService.saveOrders(list);

    // Save order items
    const orderItems = localDataService.getOrderItems();
    const newItems: OrderItem[] = items.map(item => ({
      ...item,
      id: 'item_' + generateId(),
      orderId
    }));
    orderItems.push(...newItems);
    localDataService.saveOrderItems(orderItems);

    return newOrder;
  },
  updateOrder(id: string, updates: Partial<Order>, items?: OrderItem[]): Order {
    const list = localDataService.getOrders();
    const idx = list.findIndex(o => o.id === id);
    if (idx === -1) throw new Error('Order not found');
    list[idx] = normalizeOrder({
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    });
    localDataService.saveOrders(list);

    if (items) {
      // replace items for this order
      const allItems = localDataService.getOrderItems();
      const otherItems = allItems.filter(item => item.orderId !== id);
      const formattedItems = items.map(item => {
        if (!item.id) {
          return { ...item, id: 'item_' + generateId(), orderId: id };
        }
        return item;
      });
      otherItems.push(...formattedItems);
      localDataService.saveOrderItems(otherItems);
    }

    return list[idx];
  },
  deleteOrder(id: string) {
    const list = localDataService.getOrders();
    const filtered = list.filter(o => o.id !== id);
    localDataService.saveOrders(filtered);

    // also delete order items
    const allItems = localDataService.getOrderItems();
    const otherItems = allItems.filter(item => item.orderId !== id);
    localDataService.saveOrderItems(otherItems);
  },

  // ORDER ITEMS
  getOrderItems(): OrderItem[] {
    return loadFromStorage<OrderItem[]>(KEYS.ORDER_ITEMS, []);
  },
  saveOrderItems(list: OrderItem[]) {
    saveToStorage(KEYS.ORDER_ITEMS, list);
  },

  // PRODUCTION PLANS
  getProductionPlans(): ProductionPlan[] {
    const list = loadFromStorage<any[]>(KEYS.PRODUCTION_PLANS, []);
    return list.map(p => normalizeProductionPlan(p));
  },
  saveProductionPlans(list: ProductionPlan[]) {
    saveToStorage(KEYS.PRODUCTION_PLANS, list);
  },
  addProductionPlan(plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]): ProductionPlan {
    const list = localDataService.getProductionPlans();
    const planId = 'plan_' + generateId();
    const newPlan = normalizeProductionPlan({
      ...plan,
      id: planId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    list.push(newPlan);
    localDataService.saveProductionPlans(list);

    const planItems = localDataService.getProductionPlanItems();
    const newPlanItems: ProductionPlanItem[] = items.map(item => normalizeProductionPlanItem({
      ...item,
      id: 'plan_item_' + generateId(),
      productionPlanId: planId
    }));
    planItems.push(...newPlanItems);
    localDataService.saveProductionPlanItems(planItems);

    return newPlan;
  },
  updateProductionPlan(id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]): ProductionPlan {
    const list = localDataService.getProductionPlans();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Production plan not found');
    list[idx] = normalizeProductionPlan({
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    });
    localDataService.saveProductionPlans(list);

    if (items) {
      const allItems = localDataService.getProductionPlanItems();
      const otherItems = allItems.filter(item => item.productionPlanId !== id);
      const formatted = items.map(item => {
        if (!item.id) {
          return normalizeProductionPlanItem({ ...item, id: 'plan_item_' + generateId(), productionPlanId: id });
        }
        return normalizeProductionPlanItem(item);
      });
      otherItems.push(...formatted);
      localDataService.saveProductionPlanItems(otherItems);
    }

    return list[idx];
  },
  deleteProductionPlan(id: string) {
    const list = localDataService.getProductionPlans();
    localDataService.saveProductionPlans(list.filter(p => p.id !== id));

    const items = localDataService.getProductionPlanItems();
    localDataService.saveProductionPlanItems(items.filter(i => i.productionPlanId !== id));
  },

  getProductionPlanItems(): ProductionPlanItem[] {
    const list = loadFromStorage<any[]>(KEYS.PRODUCTION_PLAN_ITEMS, []);
    return list.map(item => normalizeProductionPlanItem(item));
  },
  saveProductionPlanItems(list: ProductionPlanItem[]) {
    saveToStorage(KEYS.PRODUCTION_PLAN_ITEMS, list);
  },

  // FINISHED GOODS TRACKING
  getFinishedGoods(): FinishedGoodsStock[] {
    const list = loadFromStorage<any[]>(KEYS.FINISHED_GOODS, []);
    return list.map(fg => normalizeFinishedGoodsStock(fg));
  },
  saveFinishedGoods(list: FinishedGoodsStock[]) {
    saveToStorage(KEYS.FINISHED_GOODS, list);
  },
  addFinishedGood(item: Omit<FinishedGoodsStock, 'id' | 'createdAt' | 'updatedAt'>): FinishedGoodsStock {
    const list = localDataService.getFinishedGoods();
    const newItem = normalizeFinishedGoodsStock({
      ...item,
      id: 'fg_' + generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    list.push(newItem);
    localDataService.saveFinishedGoods(list);
    return newItem;
  },
  updateFinishedGood(id: string, updates: Partial<FinishedGoodsStock>): FinishedGoodsStock {
    const list = localDataService.getFinishedGoods();
    const idx = list.findIndex(fg => fg.id === id);
    if (idx === -1) throw new Error('Finished goods record not found');
    list[idx] = normalizeFinishedGoodsStock({
      ...list[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    });
    localDataService.saveFinishedGoods(list);
    return list[idx];
  },
  deleteFinishedGood(id: string) {
    const list = localDataService.getFinishedGoods();
    const idx = list.findIndex(fg => fg.id === id);
    if (idx !== -1) {
      // Soft delete (Requirement 15)
      list[idx].isDeleted = true;
      list[idx].updatedAt = new Date().toISOString();
      localDataService.saveFinishedGoods(list);
    }
  },

  // WASTE RECORDS
  getWasteRecords(): WasteRecord[] {
    return loadFromStorage<WasteRecord[]>(KEYS.WASTE_RECORDS, []);
  },
  saveWasteRecords(list: WasteRecord[]) {
    saveToStorage(KEYS.WASTE_RECORDS, list);
  },
  addWasteRecord(rec: Omit<WasteRecord, 'id' | 'wasteRate' | 'yieldRate'>): WasteRecord {
    const list = localDataService.getWasteRecords();
    
    // Auto calculate wasteRate & yieldRate:
    const wasteRate = rec.inputQuantity > 0 ? (rec.wasteQuantity / rec.inputQuantity) * 100 : 0;
    const yieldRate = rec.inputQuantity > 0 ? (rec.usableQuantity / rec.inputQuantity) * 100 : 100;

    const newRec: WasteRecord = {
      ...rec,
      id: 'waste_' + generateId(),
      wasteRate,
      yieldRate
    };
    list.push(newRec);
    localDataService.saveWasteRecords(list);

    // Record a Stock Movement automatically:
    localDataService.addStockMovement({
      rawMaterialId: rec.rawMaterialId,
      type: 'Fire Çıkışı',
      quantity: rec.wasteQuantity,
      date: rec.date,
      note: `Üretim firesi kaydı - ${rec.reason}. ${rec.note || ''}`
    });

    return newRec;
  },
  deleteWasteRecord(id: string) {
    const list = localDataService.getWasteRecords();
    localDataService.saveWasteRecords(list.filter(w => w.id !== id));
  },

  // FINISHED GOODS MOVEMENTS
  getFinishedGoodsMovements(): any[] {
    return loadFromStorage<any[]>(KEYS.FINISHED_GOODS_MOVEMENTS, []);
  },
  saveFinishedGoodsMovements(list: any[]) {
    saveToStorage(KEYS.FINISHED_GOODS_MOVEMENTS, list);
  },

  // COST SETTINGS
  getCostSettings(): CostSettings {
    return loadFromStorage<CostSettings>(KEYS.COST_SETTINGS, INITIAL_COST_SETTINGS);
  },
  saveCostSettings(settings: CostSettings) {
    saveToStorage(KEYS.COST_SETTINGS, settings);
  },

  // PRODUCTION RUNS
  getProductionRuns(): any[] {
    return loadFromStorage<any[]>(KEYS.PRODUCTION_RUNS, []);
  },
  saveProductionRuns(runs: any[]) {
    saveToStorage(KEYS.PRODUCTION_RUNS, runs);
  }
};
