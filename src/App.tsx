import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { 
  Customer, 
  Product, 
  ProductRecipeItem, 
  RawMaterial, 
  Order, 
  OrderItem, 
  StockMovement, 
  ProductionPlan, 
  ProductionPlanItem, 
  CostSettings,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  ProductionPlanStatus,
  ProductionRun,
  CloseProductionPlanAction,
  Supplier,
  RawMaterialReceipt,
  RawMaterialLot,
  CreateRawMaterialReceiptInput,
  UpdateRawMaterialReceiptInput,
  UpdateRawMaterialReceiptResult
} from './types';
import { formatCurrency } from './utils/format';
import { getTodayISO, getTomorrowISO, parseISODateSafe } from './utils/dateHelper';
import { 
  completeProductionPlanItem, 
  shipFinishedGoods, 
  syncOrderStatuses,
  calculateRequirementsForProducedQuantity,
  calculateWeightedAverageCost,
  calculateProductCost,
  getProducedQuantityForPlanItem,
  calculateCurrentStock,
  calculateProductionPlanStatus,
  calculateProductionPlanItemStatus,
  normalizeProductionPlanStatus,
  syncProductionPlanStatuses,
  isProductionPlanClosed,
  resolveCostSettingsForOrder
} from './services/calcService';
import { 
  normalizeProductionPlan, 
  normalizeProductionPlanItem, 
  normalizeOrder, 
  normalizeFinishedGoodsStock 
} from './utils/normalize';

// Views
import DashboardView from './components/views/DashboardView';
import CustomersView from './components/views/CustomersView';
import SuppliersView from './components/views/SuppliersView';
import ProductsView from './components/views/ProductsView';
import RawMaterialsView from './components/views/RawMaterialsView';
import StockView from './components/views/StockView';
import OrdersView from './components/views/OrdersView';
import ProductionPlanView from './components/views/ProductionPlanView';
import FinishedGoodsView from './components/views/FinishedGoodsView';
import { dataService, supabaseDataService, USE_SUPABASE } from './services/dataService';
import { localDataService } from './services/localDataService';
import { testSupabaseConnection, countSupabaseRows, migrateLocalDataToSupabase } from './services/supabaseDataService';
import { supabase } from './lib/supabaseClient';
import { LoginScreen } from './components/Auth/LoginScreen';

// Safe helper functions
export function safeNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function safeText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

const SHOW_SUPABASE_DEV_TOOLS = (import.meta as any).env.VITE_SHOW_SUPABASE_DEV_TOOLS === 'true';

// React Error Boundary Component
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-slate-100 font-sans">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-rose-500">Uygulama Hatası</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin veya verileri sıfırlamayı deneyin.
            </p>
            <p className="text-[11px] text-red-400 leading-relaxed max-h-32 overflow-auto border border-slate-700 p-2.5 rounded-lg bg-slate-950 font-mono text-left">
              {this.state.error?.toString()}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Sayfayı Yenile
              </button>
              <button
                onClick={async () => {
                  try {
                    localStorage.clear();
                    // Clear keys
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i);
                      if (k && k.startsWith('tazeuret_')) keysToRemove.push(k);
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    window.location.reload();
                  } catch (e) {
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Önbelleği Temizle
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Icons
import { 
  LayoutDashboard, 
  Users, 
  UtensilsCrossed, 
  Apple, 
  Boxes, 
  ShoppingCart, 
  FileCheck2, 
  Settings, 
  ClipboardList, 
  Activity,
  AlertTriangle,
  LogOut,
  Truck
} from 'lucide-react';

// INITIAL DATA SEEDS (If localStorage is empty)
const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'cust_1', name: 'Otel Grand Palas', type: 'Otel', phone: '0532 111 2233', email: 'ahmet@grandpalas.com', address: 'Antalya Merkez', deliveryNote: 'Sabah saat 08:00 teslimatı.', isActive: true, createdAt: '2026-06-25T10:00:00Z', updatedAt: '2026-06-25T10:00:00Z' },
  { id: 'cust_2', name: 'Nirvana Kafe Zinciri', type: 'Kafe', phone: '0544 222 3344', email: 'elif@nirvanacafe.com', address: 'İzmir Alsancak', deliveryNote: 'Kasalarda teslim alınacak.', isActive: true, createdAt: '2026-06-25T11:00:00Z', updatedAt: '2026-06-25T11:00:00Z' },
  { id: 'cust_3', name: 'Saray Restoranları', type: 'Restoran', phone: '0555 333 4455', email: 'mehmet@saray.com', address: 'İstanbul Kadıköy', deliveryNote: 'Arka kapıdan teslimat.', isActive: true, createdAt: '2026-06-26T09:00:00Z', updatedAt: '2026-06-26T09:00:00Z' }
];

const INITIAL_RAW_MATERIALS: RawMaterial[] = [
  { id: 'rm_1', name: 'Taze Ananas (Soyulmamış)', category: 'Meyve', unit: 'kg', purchasePrice: 45, averageCost: 45, defaultWasteRate: 40, defaultYieldRate: 60, criticalStockLevel: 50, isActive: true, createdAt: '2026-06-20T08:00:00Z', updatedAt: '2026-06-20T08:00:00Z' },
  { id: 'rm_2', name: 'Dilimli Karpuz (Kabuklu)', category: 'Meyve', unit: 'kg', purchasePrice: 12, averageCost: 12, defaultWasteRate: 35, defaultYieldRate: 65, criticalStockLevel: 100, isActive: true, createdAt: '2026-06-20T08:10:00Z', updatedAt: '2026-06-20T08:10:00Z' },
  { id: 'rm_3', name: 'Kavun (Kabuklu)', category: 'Meyve', unit: 'kg', purchasePrice: 15, averageCost: 15, defaultWasteRate: 30, defaultYieldRate: 70, criticalStockLevel: 80, isActive: true, createdAt: '2026-06-20T08:20:00Z', updatedAt: '2026-06-20T08:20:00Z' },
  { id: 'rm_4', name: 'Kırmızı Elma', category: 'Meyve', unit: 'kg', purchasePrice: 20, averageCost: 20, defaultWasteRate: 20, defaultYieldRate: 80, criticalStockLevel: 40, isActive: true, createdAt: '2026-06-20T08:30:00Z', updatedAt: '2026-06-20T08:30:00Z' },
  { id: 'rm_5', name: 'Taze Havuç', category: 'Sebze', unit: 'kg', purchasePrice: 18, averageCost: 18, defaultWasteRate: 15, defaultYieldRate: 85, criticalStockLevel: 30, isActive: true, createdAt: '2026-06-20T08:40:00Z', updatedAt: '2026-06-20T08:40:00Z' },
  { id: 'rm_6', name: '125g Plastik Kase Ambalaj', category: 'Ambalaj', unit: 'adet', purchasePrice: 2.5, averageCost: 2.5, defaultWasteRate: 0, defaultYieldRate: 100, criticalStockLevel: 200, isActive: true, createdAt: '2026-06-20T08:50:00Z', updatedAt: '2026-06-20T08:50:00Z' },
  { id: 'rm_7', name: '250g Plastik Kase Ambalaj', category: 'Ambalaj', unit: 'adet', purchasePrice: 3.0, averageCost: 3.0, defaultWasteRate: 0, defaultYieldRate: 100, criticalStockLevel: 200, isActive: true, createdAt: '2026-06-20T08:55:00Z', updatedAt: '2026-06-20T08:55:00Z' },
  { id: 'rm_8', name: 'Kürdan & Plastik Çatal', category: 'Yardımcı Malzeme', unit: 'adet', purchasePrice: 0.2, averageCost: 0.2, defaultWasteRate: 0, defaultYieldRate: 100, criticalStockLevel: 500, isActive: true, createdAt: '2026-06-20T09:00:00Z', updatedAt: '2026-06-20T09:00:00Z' }
];

const INITIAL_PRODUCTS: Product[] = [
  { id: 'prod_1', name: '125 g Ananas Dilimleri', category: 'Ananas', defaultSafetyRate: 3, salePrice: 35, packageWeightGrams: 125, isActive: true, createdAt: '2026-06-22T10:00:00Z', updatedAt: '2026-06-22T10:00:00Z' },
  { id: 'prod_2', name: '250 g Meyve Mix', category: 'Meyve Mix', defaultSafetyRate: 3, salePrice: 55, packageWeightGrams: 250, isActive: true, createdAt: '2026-06-22T11:00:00Z', updatedAt: '2026-06-22T11:00:00Z' },
  { id: 'prod_3', name: '300 g Sebze Mix', category: 'Sebze Mix', defaultSafetyRate: 3, salePrice: 48, packageWeightGrams: 300, isActive: true, createdAt: '2026-06-22T12:00:00Z', updatedAt: '2026-06-22T12:00:00Z' }
];

const INITIAL_RECIPES: ProductRecipeItem[] = [
  // 125g Ananas Dilimleri
  { id: 'rec_1', productId: 'prod_1', rawMaterialId: 'rm_1', quantity: 125, unit: 'g' },
  { id: 'rec_2', productId: 'prod_1', rawMaterialId: 'rm_6', quantity: 1, unit: 'adet' },
  { id: 'rec_3', productId: 'prod_1', rawMaterialId: 'rm_8', quantity: 1, unit: 'adet' },

  // 250g Meyve Mix
  { id: 'rec_4', productId: 'prod_2', rawMaterialId: 'rm_1', quantity: 80, unit: 'g' },
  { id: 'rec_5', productId: 'prod_2', rawMaterialId: 'rm_2', quantity: 90, unit: 'g' },
  { id: 'rec_6', productId: 'prod_2', rawMaterialId: 'rm_3', quantity: 80, unit: 'g' },
  { id: 'rec_7', productId: 'prod_2', rawMaterialId: 'rm_7', quantity: 1, unit: 'adet' },
  { id: 'rec_8', productId: 'prod_2', rawMaterialId: 'rm_8', quantity: 2, unit: 'adet' },

  // 300g Sebze Mix
  { id: 'rec_9', productId: 'prod_3', rawMaterialId: 'rm_4', quantity: 150, unit: 'g' },
  { id: 'rec_10', productId: 'prod_3', rawMaterialId: 'rm_5', quantity: 150, unit: 'g' },
  { id: 'rec_11', productId: 'prod_3', rawMaterialId: 'rm_7', quantity: 1, unit: 'adet' }
];

const INITIAL_ORDERS: Order[] = [
  { id: 'ord_1', customerId: 'cust_1', orderDate: getTodayISO(), deliveryDate: getTomorrowISO(), status: 'Onaylandı', approvalStatus: 'Onaylandı', computedStatus: 'Onaylandı', note: 'Sabah saat 08:00 teslimatı.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ord_2', customerId: 'cust_2', orderDate: getTodayISO(), deliveryDate: getTomorrowISO(), status: 'Onaylandı', approvalStatus: 'Onaylandı', computedStatus: 'Onaylandı', note: 'Kasalarda teslim alınacak.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];

const INITIAL_ORDER_ITEMS: OrderItem[] = [
  // Order 1 (Otel A): 350 packages of 125g Ananas Dilimleri
  { id: 'oi_1', orderId: 'ord_1', productId: 'prod_1', quantity: 350, unitSalePrice: 35 },
  // Order 2 (Kafe B): 200 packages of 250g Meyve Mix
  { id: 'oi_2', orderId: 'ord_2', productId: 'prod_2', quantity: 200, unitSalePrice: 55 }
];

const INITIAL_STOCK_MOVEMENTS: StockMovement[] = [
  { id: 'm_1', rawMaterialId: 'rm_1', type: 'Giriş', quantity: 55, date: getTodayISO(), note: 'Açılış eldeki taze ananas stoğu', createdAt: new Date().toISOString(), unitPrice: 45, totalCost: 55 * 45 },
  { id: 'm_2', rawMaterialId: 'rm_2', type: 'Giriş', quantity: 100, date: getTodayISO(), note: 'Açılış karpuz stoğu', createdAt: new Date().toISOString(), unitPrice: 12, totalCost: 100 * 12 },
  { id: 'm_3', rawMaterialId: 'rm_3', type: 'Giriş', quantity: 70, date: getTodayISO(), note: 'Açılış kavun stoğu', createdAt: new Date().toISOString(), unitPrice: 15, totalCost: 70 * 15 },
  { id: 'm_4', rawMaterialId: 'rm_4', type: 'Giriş', quantity: 80, date: getTodayISO(), note: 'Açılış elma stoğu', createdAt: new Date().toISOString(), unitPrice: 20, totalCost: 80 * 20 },
  { id: 'm_5', rawMaterialId: 'rm_5', type: 'Giriş', quantity: 60, date: getTodayISO(), note: 'Açılış havuç stoğu', createdAt: new Date().toISOString(), unitPrice: 18, totalCost: 60 * 18 },
  { id: 'm_6', rawMaterialId: 'rm_6', type: 'Giriş', quantity: 1000, date: getTodayISO(), note: 'Kutu ambalaj girişi', createdAt: new Date().toISOString(), unitPrice: 2.5, totalCost: 1000 * 2.5 },
  { id: 'm_7', rawMaterialId: 'rm_7', type: 'Giriş', quantity: 1000, date: getTodayISO(), note: 'Kutu ambalaj girişi', createdAt: new Date().toISOString(), unitPrice: 3.0, totalCost: 1000 * 3.0 },
  { id: 'm_8', rawMaterialId: 'rm_8', type: 'Giriş', quantity: 2000, date: getTodayISO(), note: 'Kürdan çatal girişi', createdAt: new Date().toISOString(), unitPrice: 0.2, totalCost: 2000 * 0.2 }
];

const DEFAULT_COST_SETTINGS: CostSettings = {
  defaultSafetyRate: 3,
  laborCostPerPackage: 2.50,
  overheadCostPerPackage: 1.20,
  deliveryCostPerPackage: 0.80,
  useAverageWasteRate: false,
  stockWarningThreshold: 10,
  lotDateOffsetDays: 0
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(!USE_SUPABASE);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const loadedTablesRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    // 1. Get current session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setCheckingSession(false);
    });

    // 2. Listen to changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
      } else {
        setSession(currentSession);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadAllDataFromSupabase = async () => {
    let hasError = false;
    const errors: string[] = [];

    const loadTable = async <T,>(
      name: string,
      fetcher: () => Promise<T>,
      setter: (data: T) => void,
      normalizer?: (data: T) => T
    ) => {
      try {
        const data = await fetcher();
        if (data !== undefined && data !== null) {
          setter(normalizer ? normalizer(data) : data);
          loadedTablesRef.current[name] = true;
        }
      } catch (err: any) {
        console.error(`${name} yüklenirken hata oluştu:`, err);
        hasError = true;
        errors.push(name);
      }
    };

    await Promise.all([
      loadTable('customers', () => supabaseDataService.getCustomers(), setCustomers),
      loadTable('raw_materials', () => supabaseDataService.getRawMaterials(), (data) => {
        const initialized = data.map(rm => ({
          ...rm,
          averageCost: typeof rm.averageCost === 'number' ? rm.averageCost : (rm.averageCost ?? rm.purchasePrice ?? 0)
        }));
        setRawMaterials(initialized);
      }),
      loadTable('products', () => supabaseDataService.getProducts(), setProducts),
      loadTable('product_recipes', () => supabaseDataService.getRecipes(), setRecipes),
      loadTable('orders', () => supabaseDataService.getOrders(), (data) => setOrders(data.map(normalizeOrder))),
      loadTable('order_items', () => supabaseDataService.getOrderItems(), setOrderItems),
      loadTable('stock_movements', () => supabaseDataService.getStockMovements(), setStockMovements),
      loadTable('production_plans', () => supabaseDataService.getProductionPlans(), (data) => setProductionPlans(data.map(normalizeProductionPlan))),
      loadTable('production_plan_items', () => supabaseDataService.getProductionPlanItems(), (data) => setProductionPlanItems(data.map(normalizeProductionPlanItem))),
      loadTable('finished_goods_stocks', () => supabaseDataService.getFinishedGoods(), (data) => setFinishedGoodsStocks(data.map(normalizeFinishedGoodsStock))),
      loadTable('finished_goods_movements', () => supabaseDataService.getFinishedGoodsMovements(), setFinishedGoodsMovements),
      loadTable('production_runs', () => supabaseDataService.getProductionRuns(), setProductionRuns),
      loadTable('cost_settings', () => supabaseDataService.getCostSettings(), setCostSettings),
      loadTable('suppliers', () => supabaseDataService.getSuppliers(), setSuppliers),
      loadTable('raw_material_receipts', () => supabaseDataService.getRawMaterialReceipts(), setRawMaterialReceipts),
      loadTable('raw_material_lots', () => supabaseDataService.getRawMaterialLots(), setRawMaterialLots)
    ]);

    if (hasError) {
      setDataLoadError("Bazı veriler Supabase’den yüklenirken hata oluştu.");
    } else {
      setDataLoadError(null);
    }
    setIsDataLoaded(true);
  };

  // Load data from Supabase on mount or auth session change
  useEffect(() => {
    if (USE_SUPABASE && session) {
      loadAllDataFromSupabase();
    }
  }, [session]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Supabase signOut error:", error);
      }
    } catch (err) {
      console.error("Unexpected logout error:", err);
    } finally {
      // Clear Supabase keys from localStorage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });
      } catch (storageErr) {
        console.error("Error clearing Supabase keys from localStorage fallback:", storageErr);
      }

      // Clear Supabase keys from sessionStorage
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('sb-')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          sessionStorage.removeItem(key);
        });
      } catch (storageErr) {
        console.error("Error clearing Supabase keys from sessionStorage fallback:", storageErr);
      }

      setSession(null);
      
      // Force reload to completely reset all runtime structures and display the LoginScreen
      window.location.reload();
    }
  };

  // Core database states synced with dataService (local or active Supabase layer in the future)
  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getCustomers();
    if (list.length === 0 && typeof INITIAL_CUSTOMERS !== 'undefined') {
      dataService.saveCustomers(INITIAL_CUSTOMERS);
      return INITIAL_CUSTOMERS;
    }
    return list;
  });

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getRawMaterials();
    if (list.length === 0 && typeof INITIAL_RAW_MATERIALS !== 'undefined') {
      dataService.saveRawMaterials(INITIAL_RAW_MATERIALS);
      return INITIAL_RAW_MATERIALS;
    }
    return list;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getProducts();
    if (list.length === 0 && typeof INITIAL_PRODUCTS !== 'undefined') {
      dataService.saveProducts(INITIAL_PRODUCTS);
      return INITIAL_PRODUCTS;
    }
    return list;
  });

  const [recipes, setRecipes] = useState<ProductRecipeItem[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getRecipes();
    if (list.length === 0 && typeof INITIAL_RECIPES !== 'undefined') {
      dataService.saveRecipes(INITIAL_RECIPES);
      return INITIAL_RECIPES;
    }
    return list;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getOrders();
    if (list.length === 0 && typeof INITIAL_ORDERS !== 'undefined') {
      const normalized = INITIAL_ORDERS.map(normalizeOrder);
      dataService.saveOrders(normalized);
      return normalized;
    }
    return Array.isArray(list) ? list.map(normalizeOrder) : [];
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getOrderItems();
    if (list.length === 0 && typeof INITIAL_ORDER_ITEMS !== 'undefined') {
      dataService.saveOrderItems(INITIAL_ORDER_ITEMS);
      return INITIAL_ORDER_ITEMS;
    }
    return list;
  });

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getStockMovements();
    if (list.length === 0 && typeof INITIAL_STOCK_MOVEMENTS !== 'undefined') {
      dataService.saveStockMovements(INITIAL_STOCK_MOVEMENTS);
      return INITIAL_STOCK_MOVEMENTS;
    }
    return list;
  });

  const [productionPlans, setProductionPlans] = useState<ProductionPlan[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getProductionPlans();
    return Array.isArray(list) ? list.map(normalizeProductionPlan) : [];
  });

  const [productionPlanItems, setProductionPlanItems] = useState<ProductionPlanItem[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getProductionPlanItems();
    return Array.isArray(list) ? list.map(normalizeProductionPlanItem) : [];
  });

  const [finishedGoodsStocks, setFinishedGoodsStocks] = useState<FinishedGoodsStock[]>(() => {
    if (USE_SUPABASE) return [];
    const list = dataService.getFinishedGoods();
    return Array.isArray(list) ? list.map(normalizeFinishedGoodsStock) : [];
  });

  const [finishedGoodsMovements, setFinishedGoodsMovements] = useState<FinishedGoodsMovement[]>(() => {
    if (USE_SUPABASE) return [];
    return dataService.getFinishedGoodsMovements();
  });

  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>(() => {
    if (USE_SUPABASE) return [];
    return dataService.getProductionRuns();
  });

  const [costSettings, setCostSettings] = useState<CostSettings>(() => {
    if (USE_SUPABASE) return DEFAULT_COST_SETTINGS;
    const settings = dataService.getCostSettings();
    return settings ? settings : DEFAULT_COST_SETTINGS;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterialReceipts, setRawMaterialReceipts] = useState<RawMaterialReceipt[]>([]);
  const [rawMaterialLots, setRawMaterialLots] = useState<RawMaterialLot[]>([]);

  // Settings form states
  const [settingsLaborCost, setSettingsLaborCost] = useState<string>('');
  const [settingsOverheadCost, setSettingsOverheadCost] = useState<string>('');
  const [settingsDeliveryCost, setSettingsDeliveryCost] = useState<string>('');
  const [settingsStockWarning, setSettingsStockWarning] = useState<string>('');
  const [settingsSafetyRate, setSettingsSafetyRate] = useState<string>('');
  const [settingsUseAverageWaste, setSettingsUseAverageWaste] = useState<boolean>(false);
  const [settingsLotDateOffsetDays, setSettingsLotDateOffsetDays] = useState<string>('');
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Supabase Migration UI States
  const [testResult, setTestResult] = useState<{
    success: boolean;
    isAdmin: boolean;
    userEmail: string;
    message: string;
  } | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [rowCounts, setRowCounts] = useState<Record<string, number> | null>(null);
  const [checkingCounts, setCheckingCounts] = useState<boolean>(false);
  const [migratingData, setMigratingData] = useState<boolean>(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    message: string;
    counts: Record<string, number>;
  } | null>(null);
  const [showMigrateConfirmModal, setShowMigrateConfirmModal] = useState<boolean>(false);

  const handleClearDemoData = () => {
    // Customers
    const demoCustomerIds = new Set(
      customers.filter(c => 
        c.isDemo || 
        c.id.startsWith('cust_') || 
        ['Otel Grand Palas', 'Nirvana Kafe Zinciri', 'Saray Restoranları'].includes(c.name)
      ).map(c => c.id)
    );
    const cleanedCustomers = customers.filter(c => !demoCustomerIds.has(c.id));
    setCustomers(cleanedCustomers);

    // Raw Materials
    const demoMaterialIds = new Set(
      rawMaterials.filter(m => 
        m.isDemo || 
        m.id.startsWith('rm_') ||
        ['Taze Ananas (Soyulmamış)', 'Dilimli Karpuz (Kabuklu)', 'Kavun (Kabuklu)', 'Kırmızı Elma', 'Taze Havuç', '125g Plastik Kase Ambalaj', '250g Plastik Kase Ambalaj', 'Kürdan & Plastik Çatal'].includes(m.name)
      ).map(m => m.id)
    );
    const cleanedMaterials = rawMaterials.filter(m => !demoMaterialIds.has(m.id));
    setRawMaterials(cleanedMaterials);

    // Products
    const demoProductIds = new Set(
      products.filter(p => 
        p.isDemo || 
        p.id.startsWith('prod_') ||
        ['125 g Ananas Dilimleri', '250 g Meyve Mix', '300 g Sebze Mix'].includes(p.name)
      ).map(p => p.id)
    );
    const cleanedProducts = products.filter(p => !demoProductIds.has(p.id));
    setProducts(cleanedProducts);

    // Recipes
    setRecipes(prev => prev.filter(r => !demoProductIds.has(r.productId) && !demoMaterialIds.has(r.rawMaterialId)));

    // Stock Movements
    setStockMovements(prev => prev.filter(m => !m.isDemo && !m.id.startsWith('m_') && !demoMaterialIds.has(m.rawMaterialId)));

    // Orders
    const demoOrderIds = new Set(
      orders.filter(o => 
        o.isDemo || 
        o.id.startsWith('ord_') ||
        demoCustomerIds.has(o.customerId)
      ).map(o => o.id)
    );
    setOrders(prev => prev.filter(o => !demoOrderIds.has(o.id)));
    setOrderItems(prev => prev.filter(i => !demoOrderIds.has(i.orderId) && !demoProductIds.has(i.productId)));

    // Production plans
    const demoPlanIds = new Set(
      productionPlans.filter(p => p.isDemo || p.id.startsWith('plan_')).map(p => p.id)
    );
    setProductionPlans(prev => prev.filter(p => !demoPlanIds.has(p.id)));
    setProductionPlanItems(prev => prev.filter(item => !demoPlanIds.has(item.productionPlanId) && !demoProductIds.has(item.productId)));

    // Finished Goods
    setFinishedGoodsStocks(prev => prev.filter(fg => !fg.isDemo && !demoProductIds.has(fg.productId) && !demoOrderIds.has(fg.orderId)));
    setFinishedGoodsMovements(prev => prev.filter(fgm => !fgm.isDemo && !demoProductIds.has(fgm.productId)));

    // Production runs
    setProductionRuns(prev => prev.filter(r => !demoProductIds.has(r.productId) && !demoCustomerIds.has(r.customerId)));

    alert('Demo verileri başarıyla temizlendi.');
  };

  const handleResetAllData = () => {
    setShowResetConfirmModal(true);
    setResetConfirmText('');
    setResetError(null);
  };

  const executeResetAllData = async () => {
    if (USE_SUPABASE) {
      if (resetConfirmText.trim().toUpperCase() !== "RESET FRESHOPS") {
        setResetError("Lütfen onaylamak için tam olarak 'RESET FRESHOPS' yazın.");
        return;
      }
      setIsResetting(true);
      setResetError(null);
      try {
        await dataService.resetAllData();

        // RPC successful - Clear storage cache (only keys with prefix tazeuret_)
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('tazeuret_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Reset states to empty arrays and default settings
        setCustomers([]);
        setRawMaterials([]);
        setProducts([]);
        setRecipes([]);
        setOrders([]);
        setOrderItems([]);
        setStockMovements([]);
        setProductionPlans([]);
        setProductionPlanItems([]);
        setFinishedGoodsStocks([]);
        setFinishedGoodsMovements([]);
        setProductionRuns([]);
        setCostSettings(DEFAULT_COST_SETTINGS);

        // Instantly navigate to dashboard to prevent other views from rendering empty state errors
        setActiveTab('dashboard');

        // Reload from Supabase to load default cost_settings and clear other structures
        await loadAllDataFromSupabase();

        alert('Tüm veriler başarıyla sıfırlandı.');
        setResetConfirmText('');
        setShowResetConfirmModal(false);
      } catch (err: any) {
        console.error("Database reset error:", err);
        setResetError("Veriler sıfırlanırken hata oluştu. Lütfen tekrar deneyin.");
      } finally {
        setIsResetting(false);
      }
    } else {
      // Local storage fallback flow
      try {
        await dataService.resetAllData();
        setCustomers([]);
        setRawMaterials([]);
        setProducts([]);
        setRecipes([]);
        setOrders([]);
        setOrderItems([]);
        setStockMovements([]);
        setProductionPlans([]);
        setProductionPlanItems([]);
        setFinishedGoodsStocks([]);
        setFinishedGoodsMovements([]);
        setProductionRuns([]);
        setCostSettings(DEFAULT_COST_SETTINGS);
        
        setActiveTab('dashboard');
        alert('Tüm veriler başarıyla sıfırlandı.');
        setResetConfirmText('');
        setShowResetConfirmModal(false);
      } catch (err: any) {
        console.error("Local data reset error:", err);
        setResetError("Veriler sıfırlanırken hata oluştu.");
      }
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await testSupabaseConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        isAdmin: false,
        userEmail: '',
        message: err.message || 'Bir hata oluştu.'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCheckCounts = async () => {
    setCheckingCounts(true);
    setRowCounts(null);
    try {
      const counts = await countSupabaseRows();
      setRowCounts(counts);
    } catch (err: any) {
      alert(`Sayım sırasında hata oluştu: ${err.message}`);
    } finally {
      setCheckingCounts(false);
    }
  };

  const handleMigrateData = async () => {
    setMigratingData(true);
    setMigrationResult(null);
    try {
      const res = await migrateLocalDataToSupabase();
      setMigrationResult(res);
      if (res.success) {
        // Refresh counts automatically upon successful migration!
        const counts = await countSupabaseRows();
        setRowCounts(counts);
      }
    } catch (err: any) {
      setMigrationResult({
        success: false,
        message: err.message || 'Beklenmeyen hata.',
        counts: {}
      });
    } finally {
      setMigratingData(false);
      setShowMigrateConfirmModal(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      setSettingsLaborCost((costSettings?.laborCostPerPackage ?? 0).toString());
      setSettingsOverheadCost((costSettings?.overheadCostPerPackage ?? 0).toString());
      setSettingsDeliveryCost((costSettings?.deliveryCostPerPackage ?? 0).toString());
      setSettingsStockWarning((costSettings?.stockWarningThreshold ?? 0).toString());
      setSettingsSafetyRate((costSettings?.defaultSafetyRate ?? 0).toString());
      setSettingsUseAverageWaste(costSettings?.useAverageWasteRate ?? false);
      setSettingsLotDateOffsetDays((costSettings?.lotDateOffsetDays ?? 0).toString());
    }
  }, [activeTab, costSettings]);

  const handleSaveSettings = () => {
    const labor = parseFloat(settingsLaborCost);
    const overhead = parseFloat(settingsOverheadCost);
    const delivery = parseFloat(settingsDeliveryCost);
    const stockWarn = parseInt(settingsStockWarning);
    const safety = parseFloat(settingsSafetyRate);
    const lotOffset = settingsLotDateOffsetDays.trim() === '' ? 0 : parseInt(settingsLotDateOffsetDays, 10);

    if (isNaN(labor) || labor < 0 ||
        isNaN(overhead) || overhead < 0 ||
        isNaN(delivery) || delivery < 0 ||
        isNaN(stockWarn) || stockWarn < 0 ||
        isNaN(safety) || safety < 0 ||
        isNaN(lotOffset) || lotOffset < 0 || lotOffset > 30) {
      alert('Lütfen tüm değerleri geçerli, pozitif sayılar olarak girin. Parti Tarih Ofseti 0 ile 30 arasında olmalıdır.');
      return;
    }

    const updatedSettings = {
      laborCostPerPackage: labor,
      overheadCostPerPackage: overhead,
      deliveryCostPerPackage: delivery,
      stockWarningThreshold: stockWarn,
      defaultSafetyRate: safety,
      useAverageWasteRate: settingsUseAverageWaste,
      lotDateOffsetDays: lotOffset
    };

    setCostSettings(updatedSettings);
    dataService.saveCostSettings(updatedSettings);

    alert('Maliyet ayarları başarıyla kaydedildi.');
  };

  const handleCancelSettings = () => {
    setSettingsLaborCost((costSettings?.laborCostPerPackage ?? 0).toString());
    setSettingsOverheadCost((costSettings?.overheadCostPerPackage ?? 0).toString());
    setSettingsDeliveryCost((costSettings?.deliveryCostPerPackage ?? 0).toString());
    setSettingsStockWarning((costSettings?.stockWarningThreshold ?? 0).toString());
    setSettingsSafetyRate((costSettings?.defaultSafetyRate ?? 0).toString());
    setSettingsUseAverageWaste(costSettings?.useAverageWasteRate ?? false);
    setSettingsLotDateOffsetDays((costSettings?.lotDateOffsetDays ?? 0).toString());
    alert('Değişiklikler iptal edildi, önceki ayarlara dönüldü.');
  };

  // Automatically update raw material purchase price based on the latest actual stock entry price
  useEffect(() => {
    setRawMaterials(prevMaterials => {
      let changed = false;
      const updated = prevMaterials.map(rm => {
        // Find all non-deleted entry movements for this raw material
        const entries = stockMovements.filter(m => 
          m.rawMaterialId === rm.id && 
          !m.isDeleted && 
          (m.type === 'Giriş' || m.type === 'Stok Girişi') && 
          m.unitPrice !== undefined && 
          m.unitPrice !== null
        );

        if (entries.length === 0) return rm;

        // Sort by date desc, then by createdAt desc to get the most recent entry
        const sorted = [...entries].sort((a, b) => {
          const dateComp = b.date.localeCompare(a.date);
          if (dateComp !== 0) return dateComp;
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });

        const latestPrice = sorted[0].unitPrice!;
        if (rm.purchasePrice !== latestPrice) {
          changed = true;
          return { ...rm, purchasePrice: latestPrice };
        }
        return rm;
      });

      return changed ? updated : prevMaterials;
    });
  }, [stockMovements]);

  // Persist State Effects
  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveCustomers(customers);
  }, [customers]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveRawMaterials(rawMaterials);
  }, [rawMaterials]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveProducts(products);
  }, [products]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveRecipes(recipes);
  }, [recipes]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveOrders(orders);
  }, [orders]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveOrderItems(orderItems);
  }, [orderItems]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveStockMovements(stockMovements);
  }, [stockMovements]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveProductionPlans(productionPlans);
  }, [productionPlans]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveProductionPlanItems(productionPlanItems);
  }, [productionPlanItems]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveFinishedGoods(finishedGoodsStocks);
  }, [finishedGoodsStocks]);

  useEffect(() => {
    if (USE_SUPABASE) return;
    dataService.saveProductionRuns(productionRuns);
  }, [productionRuns]);

  useEffect(() => {
    if (USE_SUPABASE) return; // Do not run migration in Supabase mode
    if (productionPlanItems.length > 0 && productionRuns.length === 0) {
      const oldItemsWithProducedQty = productionPlanItems.filter(pi => (pi.producedQuantity || 0) > 0);
      if (oldItemsWithProducedQty.length > 0) {
        const migrated: ProductionRun[] = oldItemsWithProducedQty.map(pi => {
          const runId = 'run_mig_' + pi.id + '_' + Math.random().toString(36).substring(2, 5);
          return {
            id: runId,
            productionPlanId: pi.productionPlanId,
            productionPlanItemId: pi.id,
            orderId: pi.orderId,
            orderItemId: pi.orderItemId,
            customerId: pi.customerId,
            productId: pi.productId,
            producedQuantity: pi.producedQuantity || 0,
            productionDate: getTodayISO(),
            note: 'Eski sistemden taşınan üretim kaydı',
            rawMaterialsDeducted: pi.rawMaterialsDeducted || false,
            rawMaterialMovementIds: pi.deductionMovementIds || [],
            finishedGoodsCreated: pi.finishedGoodsCreated || false,
            finishedGoodsStockId: pi.finishedGoodsStockId,
            createdAt: pi.createdAt || new Date().toISOString(),
            updatedAt: pi.updatedAt || new Date().toISOString()
          };
        });
        setProductionRuns(migrated);
      }
    }
  }, [productionPlanItems]);

  useEffect(() => {
    if (USE_SUPABASE && !isDataLoaded) return;
    if (USE_SUPABASE && !loadedTablesRef.current['finished_goods_movements']) return;
    localStorage.setItem('tazeuret_finished_goods_movements', JSON.stringify(finishedGoodsMovements));
    if (USE_SUPABASE) {
      dataService.saveFinishedGoodsMovements(finishedGoodsMovements);
    }
  }, [finishedGoodsMovements, isDataLoaded]);

  useEffect(() => {
    if (USE_SUPABASE && !isDataLoaded) return;
    if (USE_SUPABASE && !loadedTablesRef.current['cost_settings']) return;
    localStorage.setItem('tazeuret_cost_settings', JSON.stringify(costSettings));
  }, [costSettings, isDataLoaded]);

  // Automatically sync computedStatus for all orders when related states change
  useEffect(() => {
    const synced = syncOrderStatuses(orders, orderItems, productionPlanItems, finishedGoodsStocks, finishedGoodsMovements);
    let hasChanged = false;
    if (synced.length !== orders.length) {
      hasChanged = true;
    } else {
      for (let i = 0; i < orders.length; i++) {
        if (
          synced[i].computedStatus !== orders[i].computedStatus ||
          synced[i].approvalStatus !== orders[i].approvalStatus ||
          synced[i].status !== orders[i].status
        ) {
          hasChanged = true;
          break;
        }
      }
    }

    if (hasChanged) {
      setOrders(synced);
    }
  }, [orders, orderItems, productionPlanItems, finishedGoodsStocks, finishedGoodsMovements]);

  // Automatically sync production plans and plan items statuses when they or production runs change
  useEffect(() => {
    if (USE_SUPABASE) {
      return;
    }

    // 1. Sync Production Plan Items status
    let itemsChanged = false;
    const syncedPlanItems = productionPlanItems.map(item => {
      const parentPlan = productionPlans.find(p => p.id === item.productionPlanId);
      if (item.isLocked || (parentPlan && isProductionPlanClosed(parentPlan))) {
        return item;
      }
      const computedStatus = calculateProductionPlanItemStatus(item.id, productionPlanItems, productionRuns, orders, orderItems);
      if (item.status !== computedStatus) {
        itemsChanged = true;
        return {
          ...item,
          status: computedStatus,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });

    if (itemsChanged) {
      setProductionPlanItems(syncedPlanItems);
    }

    // 2. Sync Production Plans status
    let plansChanged = false;
    const currentItemsToUse = itemsChanged ? syncedPlanItems : productionPlanItems;
    const syncedPlans = productionPlans.map(plan => {
      if (isProductionPlanClosed(plan)) {
        return plan;
      }
      const computedStatus = calculateProductionPlanStatus(plan.id, currentItemsToUse, productionRuns, plan.status);
      if (plan.status !== computedStatus) {
        plansChanged = true;
        const completedAt = computedStatus === "Tamamlandı" 
          ? (plan.completedAt || new Date().toISOString()) 
          : undefined;
        return {
          ...plan,
          status: computedStatus,
          completedAt,
          updatedAt: new Date().toISOString()
        };
      }
      return plan;
    });

    if (plansChanged) {
      setProductionPlans(syncedPlans);
    }
  }, [productionPlanItems, productionRuns, productionPlans, orders, orderItems]);

  // Compute Current Stocks
  const currentStocks: Record<string, number> = {};
  
  rawMaterials.forEach(rm => {
    currentStocks[rm.id] = USE_SUPABASE
      ? (typeof rm.currentStock === 'number' ? rm.currentStock : 0)
      : calculateCurrentStock(rm.id, stockMovements);
  });

  // --- HANDLERS: CUSTOMERS ---
  const handleAddCustomer = async (c: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanCustomer(c);
        const data = await supabaseDataService.getCustomers();
        setCustomers(data);
      } catch (err: any) {
        console.error("Error adding customer:", err);
        alert(`Müşteri eklenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      const newCustomer: Customer = {
        ...c,
        id: 'cust_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setCustomers([...customers, newCustomer]);
    }
  };

  const handleUpdateCustomer = async (id: string, updates: Partial<Customer>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanCustomer(id, updates);
        const data = await supabaseDataService.getCustomers();
        setCustomers(data);
      } catch (err: any) {
        console.error("Error updating customer:", err);
        alert(`Müşteri güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setCustomers(customers.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (USE_SUPABASE) {
      try {
        await dataService.deleteCleanCustomer(id);
        const data = await supabaseDataService.getCustomers();
        setCustomers(data);
      } catch (err: any) {
        console.error("Error deleting customer:", err);
        alert(`Müşteri silinirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setCustomers(customers.filter(c => c.id !== id));
    }
  };

  // --- HANDLERS: PRODUCTS & RECIPES (ProductsView Props Compliance) ---
  const handleAddProduct = async (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (USE_SUPABASE) {
      try {
        const newProduct = await dataService.addCleanProduct(p);
        const data = await supabaseDataService.getProducts();
        setProducts(data);
        return newProduct;
      } catch (err: any) {
        console.error("Error adding product:", err);
        alert(`Ürün eklenirken hata oluştu: ${err.message || err}`);
        throw err;
      }
    } else {
      const newProduct: Product = {
        ...p,
        id: 'prod_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setProducts([...products, newProduct]);
      return newProduct;
    }
  };

  const handleUpdateProduct = async (id: string, updates: Partial<Product>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanProduct(id, updates);
        const data = await supabaseDataService.getProducts();
        setProducts(data);
      } catch (err: any) {
        console.error("Error updating product:", err);
        alert(`Ürün güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setProducts(products.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (USE_SUPABASE) {
      try {
        await dataService.deleteCleanProduct(id);
        const [pData, rData] = await Promise.all([
          supabaseDataService.getProducts(),
          supabaseDataService.getRecipes()
        ]);
        setProducts(pData);
        setRecipes(rData);
      } catch (err: any) {
        console.error("Error deleting product:", err);
        alert(`Ürün silinirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setProducts(products.filter(p => p.id !== id));
      setRecipes(recipes.filter(r => r.productId !== id));
    }
  };

  const handleAddRecipeItem = async (item: Omit<ProductRecipeItem, 'id'>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanRecipeItem(item);
        const data = await supabaseDataService.getRecipes();
        setRecipes(data);
      } catch (err: any) {
        console.error("Error adding recipe item:", err);
        alert(`Reçete kalemi eklenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      const newRecipe: ProductRecipeItem = {
        ...item,
        id: 'rec_' + Math.random().toString(36).substring(2, 9)
      };
      setRecipes([...recipes, newRecipe]);
    }
  };

  const handleUpdateRecipeItem = async (id: string, updates: Partial<ProductRecipeItem>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanRecipeItem(id, updates);
        const data = await supabaseDataService.getRecipes();
        setRecipes(data);
      } catch (err: any) {
        console.error("Error updating recipe item:", err);
        alert(`Reçete kalemi güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setRecipes(recipes.map(r => r.id === id ? { ...r, ...updates } : r));
    }
  };

  const handleDeleteRecipeItem = async (id: string) => {
    if (USE_SUPABASE) {
      try {
        await dataService.deleteCleanRecipeItem(id);
        const data = await supabaseDataService.getRecipes();
        setRecipes(data);
      } catch (err: any) {
        console.error("Error deleting recipe item:", err);
        alert(`Reçete kalemi silinirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setRecipes(recipes.filter(r => r.id !== id));
      dataService.deleteRecipeItem(id);
    }
  };

  // --- HANDLERS: RAW MATERIALS ---
  const handleAddRawMaterial = async (rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanRawMaterial(rm);
        const data = await supabaseDataService.getRawMaterials();
        setRawMaterials(data.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
      } catch (err: any) {
        console.error("Error adding raw material:", err);
        alert(`Hammadde eklenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      const newRm: RawMaterial = {
        ...rm,
        id: 'rm_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setRawMaterials([...rawMaterials, newRm]);
    }
  };

  const handleUpdateRawMaterial = async (id: string, updates: Partial<RawMaterial>) => {
    if (USE_SUPABASE) {
      try {
        // Exclude currentStock and averageCost from being updated by the frontend
        const { currentStock, averageCost, ...cleanUpdates } = updates as any;
        await dataService.updateCleanRawMaterial(id, cleanUpdates);
        const data = await supabaseDataService.getRawMaterials();
        setRawMaterials(data.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
      } catch (err: any) {
        console.error("Error updating raw material:", err);
        alert(`Hammadde güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setRawMaterials(rawMaterials.map(rm => rm.id === id ? { ...rm, ...updates, updatedAt: new Date().toISOString() } : rm));
    }
  };

  const handleDeleteRawMaterial = async (id: string) => {
    if (USE_SUPABASE) {
      try {
        await dataService.deleteCleanRawMaterial(id);
        const [rmData, rData] = await Promise.all([
          supabaseDataService.getRawMaterials(),
          supabaseDataService.getRecipes()
        ]);
        setRawMaterials(rmData.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
        setRecipes(rData);
      } catch (err: any) {
        console.error("Error deleting raw material:", err);
        alert(`Hammadde silinirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setRawMaterials(rawMaterials.filter(rm => rm.id !== id));
      setRecipes(recipes.filter(r => r.rawMaterialId !== id));
    }
  };

  // --- HANDLERS: STOCK MOVEMENTS ---
  const handleAddStockMovement = async (mov: Omit<StockMovement, 'id' | 'createdAt'>) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanStockMovement(mov);
        const [smData, rmData] = await Promise.all([
          supabaseDataService.getStockMovements(),
          supabaseDataService.getRawMaterials()
        ]);
        setStockMovements(smData);
        setRawMaterials(rmData.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
      } catch (err: any) {
        console.error("Error adding stock movement:", err);
        alert(`Stok hareketi eklenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      const newMov: StockMovement = {
        ...mov,
        id: 'm_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString()
      };
      setStockMovements([...stockMovements, newMov]);

      // If stock entry, update raw material son alış fiyatı (purchasePrice) and averageCost
      if ((mov.type === 'Giriş' || mov.type === 'Stok Girişi') && mov.unitPrice !== undefined) {
        setRawMaterials(prev => prev.map(rm => {
          if (rm.id === mov.rawMaterialId) {
            const currentStock = calculateCurrentStock(rm.id, stockMovements);
            const existingAvgCost = rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice);
            const prevQty = currentStock > 0 ? currentStock : 0;
            const newQty = mov.quantity;
            const newPrice = mov.unitPrice ?? 0;
            let newAvgCost = existingAvgCost;
            if (prevQty + newQty > 0) {
              newAvgCost = (prevQty * existingAvgCost + newQty * newPrice) / (prevQty + newQty);
            } else {
              newAvgCost = newPrice;
            }
            return {
              ...rm,
              purchasePrice: mov.unitPrice!,
              averageCost: newAvgCost
            };
          }
          return rm;
        }));
      }
    }
  };

  const handleUpdateStockMovement = async (id: string, updates: Partial<StockMovement>) => {
    const isBoundToLot = rawMaterialLots.some(lot => lot.inboundStockMovementId === id);
    if (isBoundToLot) {
      alert("Lot ile bağlı satın alma hareketleri manuel olarak değiştirilemez.");
      return;
    }

    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanStockMovement(id, updates);
        const [smData, rmData] = await Promise.all([
          supabaseDataService.getStockMovements(),
          supabaseDataService.getRawMaterials()
        ]);
        setStockMovements(smData);
        setRawMaterials(rmData.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
      } catch (err: any) {
        console.error("Error updating stock movement:", err);
        alert(`Stok hareketi güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setStockMovements(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

      // If stock entry, update raw material son alış fiyatı (purchasePrice) and averageCost
      const foundMovement = stockMovements.find(m => m.id === id);
      const rawMaterialIdToUse = updates.rawMaterialId || foundMovement?.rawMaterialId;
      const typeToUse = updates.type || foundMovement?.type;
      const unitPriceToUse = updates.unitPrice !== undefined ? updates.unitPrice : foundMovement?.unitPrice;
      const quantityToUse = updates.quantity !== undefined ? updates.quantity : foundMovement?.quantity;

      if (rawMaterialIdToUse && (typeToUse === 'Giriş' || typeToUse === 'Stok Girişi') && unitPriceToUse !== undefined && quantityToUse !== undefined) {
        setRawMaterials(prev => prev.map(rm => {
          if (rm.id === rawMaterialIdToUse) {
            const otherMovements = stockMovements.filter(m => m.id !== id);
            const currentStock = calculateCurrentStock(rm.id, otherMovements);
            const existingAvgCost = rm.averageCost ?? calculateWeightedAverageCost(rm.id, otherMovements, rm.purchasePrice);
            const prevQty = currentStock > 0 ? currentStock : 0;
            const newQty = quantityToUse;
            const newPrice = unitPriceToUse;
            let newAvgCost = existingAvgCost;
            if (prevQty + newQty > 0) {
              newAvgCost = (prevQty * existingAvgCost + newQty * newPrice) / (prevQty + newQty);
            } else {
              newAvgCost = newPrice;
            }
            return {
              ...rm,
              purchasePrice: unitPriceToUse,
              averageCost: newAvgCost
            };
          }
          return rm;
        }));
      }
    }
  };

  const handleDeleteStockMovement = async (id: string) => {
    const isBoundToLot = rawMaterialLots.some(lot => lot.inboundStockMovementId === id);
    if (isBoundToLot) {
      alert("Lot ile bağlı satın alma hareketleri manuel olarak değiştirilemez.");
      return;
    }

    if (USE_SUPABASE) {
      try {
        await dataService.deleteCleanStockMovement(id);
        const [smData, rmData] = await Promise.all([
          supabaseDataService.getStockMovements(),
          supabaseDataService.getRawMaterials()
        ]);
        setStockMovements(smData);
        setRawMaterials(rmData.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
      } catch (err: any) {
        console.error("Error deleting stock movement:", err);
        alert(`Stok hareketi silinirken hata oluştu: ${err.message || err}`);
      }
    } else {
      // Soft delete stock movement
      setStockMovements(prev => prev.map(m => m.id === id ? { ...m, isDeleted: true } : m));
    }
  };

  // --- HANDLERS: PURCHASE / SUPPLIERS / RECEIPTS / LOTS ---
  const handleCreateOrGetSupplier = async (name: string, note?: string): Promise<{ supplierId: string; name: string; created: boolean }> => {
    if (USE_SUPABASE) {
      try {
        const result = await supabaseDataService.createOrGetSupplierAtomic(name, note);
        const supList = await supabaseDataService.getSuppliers();
        setSuppliers(supList);
        return result;
      } catch (err: any) {
        console.error("Error in createOrGetSupplierAtomic:", err);
        alert(`Tedarikçi işlemi sırasında hata oluştu: ${err.message || err}`);
        throw err;
      }
    } else {
      const existing = suppliers.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) {
        return { supplierId: existing.id, name: existing.name, created: false };
      }
      const newId = 'sup_' + Math.random().toString(36).substring(2, 9);
      const newSup: Supplier = {
        id: newId,
        name: name.trim(),
        note: note,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setSuppliers([...suppliers, newSup]);
      return { supplierId: newId, name: newSup.name, created: true };
    }
  };

  const handleCreateRawMaterialReceipt = async (input: CreateRawMaterialReceiptInput): Promise<any> => {
    if (USE_SUPABASE) {
      try {
        const result = await supabaseDataService.createRawMaterialReceiptAtomic(input);
        const [rmList, smList, supList, recList, lotList] = await Promise.all([
          supabaseDataService.getRawMaterials(),
          supabaseDataService.getStockMovements(),
          supabaseDataService.getSuppliers(),
          supabaseDataService.getRawMaterialReceipts(),
          supabaseDataService.getRawMaterialLots()
        ]);

        setRawMaterials(rmList.map(item => ({
          ...item,
          averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
        })));
        setStockMovements(smList);
        setSuppliers(supList);
        setRawMaterialReceipts(recList);
        setRawMaterialLots(lotList);

        return result;
      } catch (err: any) {
        console.error("Error in createRawMaterialReceiptAtomic:", err);
        alert(`Satın alma işlemi sırasında hata oluştu: ${err.message || err}`);
        throw err;
      }
    } else {
      const receiptId = 'rmr_' + Math.random().toString(36).substring(2, 9);
      const newReceipt: RawMaterialReceipt = {
        id: receiptId,
        supplierId: input.supplierId,
        receiptDate: input.receiptDate,
        invoiceNumber: input.invoiceNumber || '',
        dispatchNoteNumber: input.dispatchNoteNumber || '',
        note: input.note || '',
        idempotencyKey: input.idempotencyKey,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const newLots: RawMaterialLot[] = [];
      const newMovements: StockMovement[] = [];

      input.lines.forEach((line, index) => {
        const smId = 'mov_' + Math.random().toString(36).substring(2, 9);
        const lotId = 'lot_' + Math.random().toString(36).substring(2, 9);
        const rm = rawMaterials.find(r => r.id === line.raw_material_id);
        const rmUnit = rm?.unit || 'kg';

        const newMov: StockMovement = {
          id: smId,
          rawMaterialId: line.raw_material_id,
          type: 'Stok Girişi',
          quantity: line.quantity,
          unit: rmUnit,
          date: input.receiptDate,
          note: `Satın Alma - Fiş: ${receiptId}`,
          unitPrice: line.unit_price,
          totalCost: line.quantity * line.unit_price,
          createdAt: new Date().toISOString()
        };

        const newLot: RawMaterialLot = {
          id: lotId,
          rawMaterialReceiptId: receiptId,
          rawMaterialId: line.raw_material_id,
          inboundStockMovementId: smId,
          internalLotNo: `LOT-${receiptId.toUpperCase()}-${index + 1}`,
          kunyeNumber: line.kunye_number || '',
          kunyeStatus: line.kunye_status || 'provided',
          quantityReceived: line.quantity,
          quantityRemaining: line.quantity,
          unit: rmUnit,
          unitPrice: line.unit_price,
          note: line.note || '',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        newMovements.push(newMov);
        newLots.push(newLot);
      });

      setRawMaterialReceipts([...rawMaterialReceipts, newReceipt]);
      setRawMaterialLots([...rawMaterialLots, ...newLots]);
      setStockMovements([...stockMovements, ...newMovements]);

      setRawMaterials(prev => prev.map(rm => {
        const itemLines = input.lines.filter(l => l.raw_material_id === rm.id);
        if (itemLines.length > 0) {
          const totalQty = itemLines.reduce((sum, l) => sum + l.quantity, 0);
          const lastLine = itemLines[itemLines.length - 1];
          const currentStock = calculateCurrentStock(rm.id, stockMovements);
          const existingAvgCost = rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice);
          const prevQty = currentStock > 0 ? currentStock : 0;
          const newQty = totalQty;
          const newPrice = lastLine.unit_price;
          let newAvgCost = existingAvgCost;
          if (prevQty + newQty > 0) {
            newAvgCost = (prevQty * existingAvgCost + totalQty * newPrice) / (prevQty + newQty);
          } else {
            newAvgCost = newPrice;
          }
          return {
            ...rm,
            purchasePrice: lastLine.unit_price,
            averageCost: newAvgCost
          };
        }
        return rm;
      }));

      return { success: true, alreadyCreated: false, receiptId };
    }
  };

  const handleUpdateRawMaterialReceipt = async (input: UpdateRawMaterialReceiptInput): Promise<UpdateRawMaterialReceiptResult> => {
    if (USE_SUPABASE) {
      try {
        const result = await supabaseDataService.updateRawMaterialReceiptAtomic(input);
        
        if (result.success === false || result.noChanges === true) {
          return result;
        }
        
        // Refresh all relevant states on success without blocking the result
        let partialRefreshError = false;
        try {
          const results = await Promise.allSettled([
            supabaseDataService.getRawMaterials(),
            supabaseDataService.getStockMovements(),
            supabaseDataService.getSuppliers(),
            supabaseDataService.getRawMaterialReceipts(),
            supabaseDataService.getRawMaterialLots()
          ]);

          const [rmRes, smRes, supRes, recRes, lotRes] = results;

          if (rmRes.status === 'fulfilled') {
            const rmList = rmRes.value;
            setRawMaterials(rmList.map(item => ({
              ...item,
              averageCost: typeof item.averageCost === 'number' ? item.averageCost : (item.averageCost ?? item.purchasePrice ?? 0)
            })));
          } else {
            partialRefreshError = true;
            console.error("Error refreshing rawMaterials:", rmRes.reason);
          }

          if (smRes.status === 'fulfilled') {
            setStockMovements(smRes.value);
          } else {
            partialRefreshError = true;
            console.error("Error refreshing stockMovements:", smRes.reason);
          }

          if (supRes.status === 'fulfilled') {
            setSuppliers(supRes.value);
          } else {
            partialRefreshError = true;
            console.error("Error refreshing suppliers:", supRes.reason);
          }

          if (recRes.status === 'fulfilled') {
            setRawMaterialReceipts(recRes.value);
          } else {
            partialRefreshError = true;
            console.error("Error refreshing rawMaterialReceipts:", recRes.reason);
          }

          if (lotRes.status === 'fulfilled') {
            setRawMaterialLots(lotRes.value);
          } else {
            partialRefreshError = true;
            console.error("Error refreshing rawMaterialLots:", lotRes.reason);
          }
        } catch (refreshErr: unknown) {
          console.error("Error refreshing state after successful updateRawMaterialReceiptAtomic:", refreshErr);
          partialRefreshError = true;
        }

        return {
          ...result,
          partialRefreshError
        };
      } catch (err: unknown) {
        console.error("Error in updateRawMaterialReceiptAtomic:", err);
        throw err;
      }
    } else {
      throw new Error(
        'Satın alma fişi düzeltme işlemi yalnızca veritabanı modunda kullanılabilir.'
      );
    }
  };

  // --- HANDLERS: ORDERS ---
  const handleAddOrder = async (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanOrder(order, items);
        
        // Fetch fresh orders and order items from Supabase
        const [freshOrders, freshOrderItems] = await Promise.all([
          supabaseDataService.getOrders(),
          supabaseDataService.getOrderItems()
        ]);
        
        setOrders(freshOrders.map(normalizeOrder));
        setOrderItems(freshOrderItems);
      } catch (err: any) {
        console.error("Error adding order via RPC:", err);
        alert(`Sipariş oluşturulurken hata oluştu: ${err.message || err}`);
        throw err; // propagate error so that OrdersView doesn't close the modal
      }
    } else {
      const orderId = 'ord_' + Math.random().toString(36).substring(2, 9);
      const newOrder: Order = {
        ...order,
        id: orderId,
        orderNumber: orderId.replace('ord_', '').toUpperCase(),
        costSettingsSnapshot: {
          defaultSafetyRate: costSettings.defaultSafetyRate,
          laborCostPerPackage: costSettings.laborCostPerPackage,
          overheadCostPerPackage: costSettings.overheadCostPerPackage,
          deliveryCostPerPackage: costSettings.deliveryCostPerPackage,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const formattedItems: OrderItem[] = items.map(item => ({
        ...item,
        id: 'oi_' + Math.random().toString(36).substring(2, 9),
        orderId
      }));

      setOrders([...orders, newOrder]);
      setOrderItems([...orderItems, ...formattedItems]);
    }
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Order>, items?: OrderItem[]) => {
    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanOrder(id, updates, items);
        const [freshOrders, freshOrderItems] = await Promise.all([
          supabaseDataService.getOrders(),
          supabaseDataService.getOrderItems()
        ]);
        setOrders(freshOrders.map(normalizeOrder));
        setOrderItems(freshOrderItems);
      } catch (err: any) {
        console.error("Error updating order:", err);
        alert(`Sipariş güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setOrders(orders.map(o => o.id === id ? { ...o, ...updates, updatedAt: new Date().toISOString() } : o));

      if (items) {
        const remainingItems = orderItems.filter(i => i.orderId !== id);
        const formattedItems = items.map(item => ({
          ...item,
          id: item.id || 'oi_' + Math.random().toString(36).substring(2, 9),
          orderId: id
        }));
        setOrderItems([...remainingItems, ...formattedItems]);
      }
    }
  };

  const handleDeleteOrder = async (id: string): Promise<boolean> => {
    try {
      await dataService.deleteCleanOrder(id);
      setOrders(orders.filter(o => o.id !== id));
      setOrderItems(orderItems.filter(i => i.orderId !== id));
      return true;
    } catch (err: any) {
      console.error("Error deleting clean order:", err);
      alert("Sipariş Supabase’den silinemedi. Lütfen tekrar deneyin.");
      return false;
    }
  };

  // --- HANDLERS: PRODUCTION PLANS ---
  const handleAddProductionPlan = async (plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]) => {
    if (USE_SUPABASE) {
      try {
        await dataService.addCleanProductionPlan(plan, items);
        const [pData, piData] = await Promise.all([
          supabaseDataService.getProductionPlans(),
          supabaseDataService.getProductionPlanItems()
        ]);
        setProductionPlans(pData.map(normalizeProductionPlan));
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
      } catch (err: any) {
        console.error("Error adding production plan:", err);
        alert(`Üretim planı eklenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      const planId = 'plan_' + Math.random().toString(36).substring(2, 9);
      const newPlan: ProductionPlan = {
        ...plan,
        id: planId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const formattedItems: ProductionPlanItem[] = items.map(item => ({
        ...item,
        id: 'pi_' + Math.random().toString(36).substring(2, 9),
        productionPlanId: planId
      }));

      setProductionPlans(prev => [...prev, newPlan]);
      setProductionPlanItems(prev => [...prev, ...formattedItems]);
    }
  };

  const handleUpdateProductionPlan = async (id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]) => {
    if (USE_SUPABASE) {
      try {
        await dataService.updateCleanProductionPlan(id, updates, items);
        const [pData, piData] = await Promise.all([
          supabaseDataService.getProductionPlans(),
          supabaseDataService.getProductionPlanItems()
        ]);
        setProductionPlans(pData.map(normalizeProductionPlan));
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
      } catch (err: any) {
        console.error("Error updating production plan:", err);
        alert(`Üretim planı güncellenirken hata oluştu: ${err.message || err}`);
      }
    } else {
      setProductionPlans(prev => prev.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));

      if (items) {
        setProductionPlanItems(prev => {
          const remainingItems = prev.filter(i => i.productionPlanId !== id);
          return [...remainingItems, ...items];
        });
      }
    }
  };

  const handleClosePlanAndCarryOver = async (sourcePlanId: string, actions: CloseProductionPlanAction[]) => {
    // 1. Call the main close and carryover operation
    await dataService.closeProductionPlanAndCarryOver(sourcePlanId, actions);

    // 2. Safely reload states in a separate try/catch
    try {
      if (USE_SUPABASE) {
        const [pData, piData, oData] = await Promise.all([
          supabaseDataService.getProductionPlans(),
          supabaseDataService.getProductionPlanItems(),
          supabaseDataService.getOrders()
        ]);
        setProductionPlans(pData.map(normalizeProductionPlan));
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
        setOrders(oData.map(normalizeOrder));
      } else {
        setProductionPlans(localDataService.getProductionPlans().map(normalizeProductionPlan));
        setProductionPlanItems(localDataService.getProductionPlanItems().map(normalizeProductionPlanItem));
        setOrders(localDataService.getOrders().map(normalizeOrder));
      }
    } catch (reloadErr) {
      console.error("Error reloading states after successful plan close:", reloadErr);
    }
  };

  const handleUpdatePlanItemStatus = (
    itemId: string,
    status: ProductionPlanStatus,
    producedQuantity: number,
    note?: string
  ) => {
    if (status === 'Tamamlandı' || status === 'Eksik üretildi') {
      const result = completeProductionPlanItem(
        itemId,
        producedQuantity,
        status,
        productionPlanItems,
        orderItems,
        orders,
        products,
        recipes,
        rawMaterials,
        costSettings,
        stockMovements
      );

      setProductionPlanItems(result.updatedPlanItems);
      if (result.newStockMovements.length > 0) {
        setStockMovements([...stockMovements, ...result.newStockMovements]);
      }
      if (result.newFinishedGoodsStock) {
        const existingFG = finishedGoodsStocks.find(s => s.productionPlanItemId === itemId);
        if (!existingFG) {
          setFinishedGoodsStocks([...finishedGoodsStocks, result.newFinishedGoodsStock]);
          
          const newFGMov: FinishedGoodsMovement = {
            id: 'fgm_' + Math.random().toString(36).substring(2, 9),
            finishedGoodsStockId: result.newFinishedGoodsStock.id,
            productId: result.newFinishedGoodsStock.productId,
            customerId: result.newFinishedGoodsStock.customerId,
            orderId: result.newFinishedGoodsStock.orderId,
            orderItemId: result.newFinishedGoodsStock.orderItemId,
            type: 'Üretim girişi',
            quantity: result.newFinishedGoodsStock.quantityProduced,
            date: new Date().toISOString().split('T')[0],
            note: `Üretim Girişi - P-#${result.newFinishedGoodsStock.productionPlanId.substring(0, 5).toUpperCase()}`,
            createdAt: new Date().toISOString()
          };
          setFinishedGoodsMovements([...finishedGoodsMovements, newFGMov]);
        }
      }
    } else {
      setProductionPlanItems(productionPlanItems.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            status,
            note: note !== undefined ? note : item.note,
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      }));
    }
  };

  const updateProductionPlanStatus = (
    planId: string,
    currentPlanItems: ProductionPlanItem[],
    currentRuns: ProductionRun[]
  ) => {
    setProductionPlans(prevPlans =>
      prevPlans.map(plan => {
        if (plan.id !== planId) return plan;

        const items = currentPlanItems.filter(pi => pi.productionPlanId === planId && pi.status !== 'İptal');
        if (items.length === 0) return plan;

        const itemStatusesAndQuantities = items.map(pi => {
          const runs = currentRuns.filter(r => r.productionPlanItemId === pi.id && !r.isDeleted);
          const produced = runs.reduce((sum, r) => sum + r.producedQuantity, 0);
          const remaining = Math.max(0, pi.plannedQuantity - produced);
          return {
            produced,
            remaining,
            planned: pi.plannedQuantity
          };
        });

        const allCompleted = itemStatusesAndQuantities.every(iq => iq.remaining === 0 && iq.produced >= iq.planned);
        const noneProduced = itemStatusesAndQuantities.every(iq => iq.produced === 0);

        let newStatus: ProductionPlanStatus = 'Üretimde';
        if (allCompleted) {
          newStatus = 'Tamamlandı';
        } else if (noneProduced) {
          newStatus = 'Planlandı';
        }

        return {
          ...plan,
          status: newStatus,
          updatedAt: new Date().toISOString()
        };
      })
    );
  };

  const getProductLotPrefix = (product: any, recipe?: any): string => {
    const raw =
      product?.lotPrefix ??
      product?.batchPrefix ??
      product?.payload?.lotPrefix ??
      product?.payload?.batchPrefix ??
      recipe?.lotPrefix ??
      recipe?.batchPrefix ??
      recipe?.payload?.lotPrefix ??
      recipe?.payload?.batchPrefix ??
      "";
    return String(raw).toUpperCase()
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ş/g, 'S')
      .replace(/İ/g, 'I')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 3)
      .trim();
  };

  const generateLotNo = (lotPrefix: string, productionDateStr: string, lotDateOffsetDays: number): { lotNo: string; lotDate: string; lotDateOffsetDays: number } => {
    // productionDateStr is in format YYYY-MM-DD
    const dateObj = new Date(productionDateStr + 'T12:00:00'); // Use noon to avoid timezone shifts
    dateObj.setDate(dateObj.getDate() + lotDateOffsetDays);
    
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = String(dateObj.getFullYear()).slice(-2); // last 2 digits of year
    
    const formattedDate = `${day}${month}${year}`;
    const lotNo = `${lotPrefix.toUpperCase()}-${formattedDate}`;
    
    return {
      lotNo,
      lotDate: dateObj.toISOString().split('T')[0],
      lotDateOffsetDays
    };
  };

  const handleCreateProductionRun = (
    productionPlanItemId: string,
    producedQuantity: number,
    note: string = ''
  ): boolean | Promise<boolean> => {
    const item = productionPlanItems.find(pi => pi.id === productionPlanItemId);
    if (!item) {
      alert("Üretim plan kalemi bulunamadı.");
      return false;
    }

    const plan = productionPlans.find(p => p.id === item.productionPlanId);
    if (!plan) {
      alert("Kapatılacak üretim planı bulunamadı.");
      return false;
    }

    if (isProductionPlanClosed(plan) || (plan as any).isLocked) {
      alert("Bu üretim planı kapatılmıştır. Yeni üretim girişi yapılamaz.");
      return false;
    }

    if (item.status === 'İptal') {
      alert("Bu üretim kalemi iptal edilmiştir. Yeni üretim girişi yapılamaz.");
      return false;
    }

    if ((item as any).isLocked) {
      alert("Bu üretim kalemi kilitlenmiştir. Yeni üretim girişi yapılamaz.");
      return false;
    }

    const product = products.find(p => p.id === item.productId);
    if (!product) {
      alert("Ürün bulunamadı.");
      return false;
    }

    const matchingRecipe = recipes?.find(r => r.productId === product.id);
    const cleanPrefix = getProductLotPrefix(product, matchingRecipe);
    const isAlphanumeric3 = /^[A-Z0-9]{3}$/.test(cleanPrefix);
    if (!isAlphanumeric3) {
      alert("Bu ürün için parti numarası oluşturulamadı. Lütfen Ürün Reçeteleri ekranında bu ürüne 3 karakterlik Parti Ön Kodu tanımlayın.");
      return false;
    }

    if (isNaN(producedQuantity) || producedQuantity <= 0) {
      alert("Lütfen geçerli, pozitif bir üretilen adet girin.");
      return false;
    }

    if (!Number.isInteger(producedQuantity)) {
      alert("Üretilen adet tam sayı olmalı.");
      return false;
    }

    const runsForItem = productionRuns.filter(r => r.productionPlanItemId === productionPlanItemId && !r.isDeleted);
    const totalAlreadyProduced = runsForItem.reduce((sum, r) => sum + r.producedQuantity, 0);
    const remainingToProduce = item.plannedQuantity - totalAlreadyProduced;

    if (remainingToProduce <= 0) {
      alert("Bu kalemde üretilecek kalan miktar kalmadı.");
      return false;
    }

    if (producedQuantity > remainingToProduce) {
      alert(`Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: ${remainingToProduce}`);
      return false;
    }

    if (USE_SUPABASE) {
      return (async () => {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc("create_production_run_atomic", {
            p_production_plan_item_id: item.id,
            p_produced_quantity: Number(producedQuantity),
            p_note: note || null
          });

          if (rpcError) {
            console.error("RPC Error:", rpcError);
            alert(`Üretim kaydedilirken hata oluştu: ${rpcError.message || rpcError}`);
            return false;
          }

          const [
            pData,
            piData,
            prData,
            smData,
            rmData,
            fgsData,
            fgmData,
            oData,
            oiData
          ] = await Promise.all([
            supabaseDataService.getProductionPlans(),
            supabaseDataService.getProductionPlanItems(),
            supabaseDataService.getProductionRuns(),
            supabaseDataService.getStockMovements(),
            supabaseDataService.getRawMaterials(),
            supabaseDataService.getFinishedGoods(),
            supabaseDataService.getFinishedGoodsMovements(),
            supabaseDataService.getOrders(),
            supabaseDataService.getOrderItems()
          ]);

          setProductionPlans(pData.map(normalizeProductionPlan));
          setProductionPlanItems(piData.map(normalizeProductionPlanItem));
          setProductionRuns(prData);
          setStockMovements(smData);
          setRawMaterials(rmData.map(rm => ({
            ...rm,
            averageCost: typeof rm.averageCost === 'number' ? rm.averageCost : (rm.averageCost ?? rm.purchasePrice ?? 0)
          })));
          setFinishedGoodsStocks(fgsData.map(normalizeFinishedGoodsStock));
          setFinishedGoodsMovements(fgmData);
          setOrders(oData.map(normalizeOrder));
          setOrderItems(oiData);

          return true;
        } catch (err: any) {
          console.error("Error running atomic production run:", err);
          alert(`Üretim kaydedilirken beklenmedik bir hata oluştu: ${err.message || err}`);
          return false;
        }
      })();
    }

    const orderItem = orderItems.find(oi => oi.id === item.orderItemId);
    const requirements = calculateRequirementsForProducedQuantity(
      item.productId,
      producedQuantity,
      orderItem,
      products,
      recipes,
      rawMaterials,
      costSettings,
      stockMovements,
      orders
    );

    // Check if stock is insufficient for any required raw material
    let isStockInsufficient = false;
    for (const req of requirements) {
      const currentStock = currentStocks[req.rawMaterialId] || 0;
      if (currentStock < req.grossRequirement) {
        isStockInsufficient = true;
        break;
      }
    }

    if (isStockInsufficient) {
      // Calculate requirements for exactly 1 unit to find the unit gross requirement
      const requirementsForOne = calculateRequirementsForProducedQuantity(
        item.productId,
        1,
        orderItem,
        products,
        recipes,
        rawMaterials,
        costSettings,
        stockMovements,
        orders
      );

      let maxProducible = Infinity;
      for (const req1 of requirementsForOne) {
        if (req1.grossRequirement > 0) {
          const currentStock = currentStocks[req1.rawMaterialId] || 0;
          const materialMax = Math.floor(currentStock / req1.grossRequirement);
          if (materialMax < maxProducible) {
            maxProducible = materialMax;
          }
        }
      }
      if (maxProducible === Infinity) maxProducible = 0;

      const missingQuantity = producedQuantity - maxProducible;

      let warningMessage = `⚠️ Bu üretim için hammadde yetersiz!\n\n`;
      warningMessage += `• Girilen hedef üretim miktarı: ${producedQuantity} adet\n`;
      warningMessage += `• Mevcut stokla üretilebilecek maksimum miktar: ${maxProducible} adet\n`;
      warningMessage += `• Eksik üretim miktarı: ${missingQuantity} adet\n\n`;
      warningMessage += `Bu eksik ${missingQuantity} adet üretim için reçeteye göre gereken eksik hammaddeler:\n`;

      for (const req of requirements) {
        const currentStock = currentStocks[req.rawMaterialId] || 0;
        if (currentStock < req.grossRequirement) {
          const rm = rawMaterials.find(m => m.id === req.rawMaterialId);
          const rmName = rm ? rm.name : req.rawMaterialName;
          const missingAmount = req.grossRequirement - currentStock;
          warningMessage += `- ${rmName}: ${missingAmount.toFixed(2)} ${req.unit} eksik\n`;
        }
      }

      alert(warningMessage);
      return false;
    }

    const runId = 'run_' + Math.random().toString(36).substring(2, 9);
    const newMovements: StockMovement[] = [];
    const rawMaterialMovementIds: string[] = [];

    for (const req of requirements) {
      const rm = rawMaterials.find(m => m.id === req.rawMaterialId);
      if (!rm) continue;

      const purchasePrice = rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice);
      const estimatedCost = req.grossRequirement * purchasePrice;
      const moveId = 'sm_' + Math.random().toString(36).substring(2, 9);
      
      newMovements.push({
        id: moveId,
        rawMaterialId: rm.id,
        type: 'Üretim Tüketimi',
        quantity: req.grossRequirement,
        date: new Date().toISOString().split('T')[0],
        note: `Üretim Tüketimi - Giriş No: #${runId.substring(4).toUpperCase()}, Plan No: P-#${item.productionPlanId.substring(0, 5).toUpperCase()}, Ürün: ${product.name}`,
        createdAt: new Date().toISOString(),
        unitPrice: purchasePrice,
        totalCost: estimatedCost,
        productionPlanId: item.productionPlanId,
        productionPlanItemId: item.id,
        orderId: item.orderId,
        orderItemId: item.orderItemId,
        productId: item.productId,
        productionRunId: runId,
        isDeleted: false,
      });
      rawMaterialMovementIds.push(moveId);
    }

    const order = orders.find(o => o.id === item.orderId);
    const resolvedCostSettings = resolveCostSettingsForOrder(costSettings, order);
    const costBreakdown = calculateProductCost(product, recipes, rawMaterials, resolvedCostSettings, stockMovements);
    const unitCost = costBreakdown.totalCostPerPackage;
    const totalCost = unitCost * producedQuantity;
    const deliveryDate = order ? order.deliveryDate : new Date().toISOString().split('T')[0];

    // Generate lot information
    const lotOffset = costSettings.lotDateOffsetDays ?? 0;
    const prodDateStr = new Date().toISOString().split('T')[0];
    const lotInfo = generateLotNo(cleanPrefix, prodDateStr, lotOffset);

    const finishedGoodsStockId = 'fgs_' + Math.random().toString(36).substring(2, 9);
    const newFG: FinishedGoodsStock = {
      id: finishedGoodsStockId,
      productId: item.productId,
      customerId: item.customerId,
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      productionPlanId: item.productionPlanId,
      productionPlanItemId: item.id,
      productionRunId: runId,
      productionDate: prodDateStr,
      deliveryDate: deliveryDate,
      quantityProduced: producedQuantity,
      quantityRemaining: producedQuantity,
      status: 'Stokta',
      unitCost,
      totalCost,
      note: `Üretim Girişi - Giriş No: #${runId.substring(4).toUpperCase()}, Plan No: P-#${item.productionPlanId.substring(0, 5).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lotNo: lotInfo.lotNo,
      lotDate: lotInfo.lotDate,
      lotDateOffsetDays: lotInfo.lotDateOffsetDays
    };

    const newRun: ProductionRun = {
      id: runId,
      productionPlanId: item.productionPlanId,
      productionPlanItemId: item.id,
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      customerId: item.customerId,
      productId: item.productId,
      producedQuantity: producedQuantity,
      productionDate: prodDateStr,
      note: note,
      rawMaterialsDeducted: true,
      rawMaterialMovementIds: rawMaterialMovementIds,
      finishedGoodsCreated: true,
      finishedGoodsStockId: finishedGoodsStockId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lotNo: lotInfo.lotNo,
      lotDate: lotInfo.lotDate,
      lotDateOffsetDays: lotInfo.lotDateOffsetDays
    };

    const updatedRuns = [...productionRuns, newRun];
    setProductionRuns(updatedRuns);

    if (newMovements.length > 0) {
      setStockMovements(prev => [...prev, ...newMovements]);
    }
    setFinishedGoodsStocks(prev => [...prev, newFG]);

    const newFGMov: FinishedGoodsMovement = {
      id: 'fgm_' + Math.random().toString(36).substring(2, 9),
      finishedGoodsStockId: finishedGoodsStockId,
      productId: item.productId,
      customerId: item.customerId,
      orderId: item.orderId,
      orderItemId: item.orderItemId,
      type: 'Üretim girişi',
      quantity: producedQuantity,
      date: new Date().toISOString().split('T')[0],
      note: `Üretim Girişi - Giriş No: #${runId.substring(4).toUpperCase()}, P-#${item.productionPlanId.substring(0, 5).toUpperCase()}`,
      createdAt: new Date().toISOString()
    };
    setFinishedGoodsMovements(prev => [...prev, newFGMov]);

    const newTotalProduced = totalAlreadyProduced + producedQuantity;
    let newStatus: ProductionPlanStatus = 'Planın Gerisinde';
    if (newTotalProduced === item.plannedQuantity) {
      newStatus = 'Tamamlandı';
    } else if (newTotalProduced > item.plannedQuantity) {
      newStatus = 'Plan Üstü Üretim';
    } else if (newTotalProduced === 0) {
      newStatus = 'Planlandı';
    }

    const tempPlanItems = productionPlanItems.map(pi => pi.id === item.id ? {
      ...pi,
      producedQuantity: newTotalProduced,
      status: newStatus,
      rawMaterialsDeducted: true,
      finishedGoodsCreated: true,
      updatedAt: new Date().toISOString()
    } : pi);

    setProductionPlanItems(tempPlanItems);
    updateProductionPlanStatus(item.productionPlanId, tempPlanItems, updatedRuns);

    setOrders(prevOrders => {
      return syncOrderStatuses(
        prevOrders,
        orderItems,
        tempPlanItems,
        [...finishedGoodsStocks, newFG],
        [...finishedGoodsMovements, newFGMov],
        updatedRuns
      );
    });

    return true;
  };

  const deleteProductionRunCascade = (runId: string) => {
    const run = productionRuns.find(r => r.id === runId);
    if (!run) {
      alert("Silinecek üretim girişi bulunamadı.");
      return;
    }

    // Plan check
    const plan = productionPlans.find(p => p.id === run.productionPlanId);
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için üretim girişleri silinemez.");
      return;
    }

    const now = new Date().toISOString();

    // Find linked finished goods stocks
    const linkedFGStocks = finishedGoodsStocks.filter(fg => 
      (fg.productionRunId === runId || fg.id === run.finishedGoodsStockId) && !fg.isDeleted
    );

    // Check if any of these finished goods stocks have already been shipped
    let hasShipped = false;
    for (const fg of linkedFGStocks) {
      if (fg.quantityRemaining < fg.quantityProduced) {
        hasShipped = true;
        break;
      }
      
      const hasShippingMovement = finishedGoodsMovements.some(fgm => 
        fgm.finishedGoodsStockId === fg.id && 
        (fgm.type === 'Sevkiyat çıkışı' || fgm.type === 'Sevkiyat Çıkışı') && 
        !fgm.isDeleted
      );
      if (hasShippingMovement) {
        hasShipped = true;
        break;
      }
    }

    if (hasShipped) {
      alert("Bu üretimden oluşan nihai ürünlerden sevkiyat yapılmış. Bu üretim girişi silinemez. Stok düzeltmesi yapın.");
      return;
    }

    // Soft delete the production run
    const updatedRuns = productionRuns.map(r => r.id === runId ? {
      ...r,
      isDeleted: true,
      deletedAt: now,
      deletedReason: "Kullanıcı üretim geçmişinden sildi",
      updatedAt: now
    } : r);

    // Soft delete associated stock movements
    const rawMaterialMovementIdsSet = new Set(run.rawMaterialMovementIds || []);
    const updatedStockMovements = stockMovements.map(m => {
      const isLinked = m.productionRunId === runId || rawMaterialMovementIdsSet.has(m.id);
      if (isLinked) {
        return {
          ...m,
          isDeleted: true,
          deletedAt: now,
          deletedReason: "ProductionRun silindiği için hammadde tüketimi geri alındı",
          updatedAt: now
        };
      }
      return m;
    });

    // Generate recipe-based hammadde return logs for Stock Movement History
    const orderItemForRun = orderItems.find(oi => oi.id === run.orderItemId);
    const requirements = calculateRequirementsForProducedQuantity(
      run.productId,
      run.producedQuantity,
      orderItemForRun,
      products,
      recipes,
      rawMaterials,
      costSettings,
      stockMovements
    );

    const newIadeMovements: StockMovement[] = [];
    const productForRun = products.find(p => p.id === run.productId);
    const prodNameForRun = productForRun ? productForRun.name : '';

    for (const req of requirements) {
      const rm = rawMaterials.find(m => m.id === req.rawMaterialId);
      if (!rm) continue;

      const originalMovement = stockMovements.find(m => m.productionRunId === runId && m.rawMaterialId === rm.id);
      const originalUnitPrice = originalMovement?.unitPrice;
      const purchasePrice = originalUnitPrice ?? rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements, rm.purchasePrice);
      const estimatedCost = req.grossRequirement * purchasePrice;
      const moveId = 'sm_iade_' + Math.random().toString(36).substring(2, 9);

      newIadeMovements.push({
        id: moveId,
        rawMaterialId: rm.id,
        type: 'Üretim Silme İadesi',
        quantity: req.grossRequirement,
        date: now.split('T')[0],
        note: `Üretim Geri Alma (İade) - Giriş No: #${runId.substring(4).toUpperCase()}, Ürün: ${prodNameForRun}`,
        createdAt: now,
        unitPrice: purchasePrice,
        totalCost: estimatedCost,
        productionPlanId: run.productionPlanId,
        productionPlanItemId: run.productionPlanItemId,
        orderId: run.orderId,
        orderItemId: run.orderItemId,
        productId: run.productId,
        productionRunId: runId,
        isDeleted: false,
      });
    }

    const finalStockMovements = [...updatedStockMovements, ...newIadeMovements];

    // Soft delete associated finished goods stock
    const updatedFGStocks = finishedGoodsStocks.map(fg => {
      const isLinked = fg.productionRunId === runId || fg.id === run.finishedGoodsStockId;
      if (isLinked) {
        return {
          ...fg,
          isDeleted: true,
          deletedAt: now,
          deletedReason: "ProductionRun silindiği için nihai ürün stoğundan kaldırıldı",
          updatedAt: now
        };
      }
      return fg;
    });

    // Soft delete associated finished goods movements, but keep the original 'Üretim girişi' log
    const linkedFGStockIds = new Set(
      finishedGoodsStocks
        .filter(fg => fg.productionRunId === runId || fg.id === run.finishedGoodsStockId)
        .map(fg => fg.id)
    );

    const updatedFGMovements = finishedGoodsMovements.map(fgm => {
      const isLinked = fgm.finishedGoodsStockId === run.finishedGoodsStockId || linkedFGStockIds.has(fgm.finishedGoodsStockId);
      if (isLinked && fgm.type !== 'Üretim girişi') {
        return {
          ...fgm,
          isDeleted: true,
          deletedAt: now,
          deletedReason: "ProductionRun silindiği için nihai ürün hareketi geri alındı"
        };
      }
      return fgm;
    });

    // Create a new 'Üretim Geri Alındı' audit log
    const newGeriAlindiMovement: FinishedGoodsMovement = {
      id: 'fgm_reverse_' + runId + '_' + Date.now(),
      finishedGoodsStockId: run.finishedGoodsStockId || (Array.from(linkedFGStockIds)[0] || ''),
      productionRunId: runId,
      productId: run.productId,
      customerId: run.customerId,
      orderId: run.orderId,
      orderItemId: run.orderItemId,
      type: 'Üretim Geri Alındı',
      quantity: run.producedQuantity,
      date: now.split('T')[0], // YYYY-MM-DD
      note: 'Üretim geçmişinden silindi / geri alındı',
      createdAt: now,
      isDeleted: false
    };

    const finalFGMovements = [...updatedFGMovements, newGeriAlindiMovement];

    const item = productionPlanItems.find(pi => pi.id === run.productionPlanItemId);
    let updatedPlanItems = productionPlanItems;
    let updatedPlans = productionPlans;

    if (item) {
      const remainingRuns = updatedRuns.filter(r => r.productionPlanItemId === item.id && !r.isDeleted);
      const newTotalProduced = remainingRuns.reduce((sum, r) => sum + r.producedQuantity, 0);
      
      let newItemStatus: ProductionPlanStatus = 'Planlandı';
      if (newTotalProduced > 0) {
        if (newTotalProduced >= item.plannedQuantity) {
          newItemStatus = 'Tamamlandı';
        } else {
          newItemStatus = 'Planın Gerisinde';
        }
      }

      updatedPlanItems = productionPlanItems.map(pi => pi.id === item.id ? {
        ...pi,
        producedQuantity: newTotalProduced,
        status: newItemStatus,
        isLocked: false,
        updatedAt: now
      } : pi);

      updatedPlans = productionPlans.map(p => {
        if (p.id === item.productionPlanId) {
          const computedStatus = calculateProductionPlanStatus(p.id, updatedPlanItems, updatedRuns);
          return {
            ...p,
            status: computedStatus,
            closedWithShortage: false,
            completedAt: computedStatus === 'Tamamlandı' ? (p.completedAt || now) : undefined,
            closedAt: undefined,
            isLocked: false,
            updatedAt: now
          };
        }
        return p;
      });
    }

    const updatedOrders = syncOrderStatuses(
      orders,
      orderItems,
      updatedPlanItems,
      updatedFGStocks.filter(fg => !fg.isDeleted),
      finalFGMovements.filter(fgm => !fgm.isDeleted),
      updatedRuns
    );

    // Set all states
    setProductionRuns(updatedRuns);
    setStockMovements(finalStockMovements);
    setFinishedGoodsStocks(updatedFGStocks);
    setFinishedGoodsMovements(finalFGMovements);
    setProductionPlanItems(updatedPlanItems);
    setProductionPlans(updatedPlans);
    setOrders(updatedOrders);

    // Persist to localStorage
    localStorage.setItem('tazeuret_production_runs', JSON.stringify(updatedRuns));
    localStorage.setItem('tazeuret_stock_movements', JSON.stringify(finalStockMovements));
    localStorage.setItem('tazeuret_finished_goods_stocks', JSON.stringify(updatedFGStocks));
    localStorage.setItem('tazeuret_finished_goods_movements', JSON.stringify(finalFGMovements));
    localStorage.setItem('tazeuret_production_plan_items', JSON.stringify(updatedPlanItems));
    localStorage.setItem('tazeuret_production_plans', JSON.stringify(updatedPlans));
    localStorage.setItem('tazeuret_orders', JSON.stringify(updatedOrders));

    alert("Üretim girişi silindi ve bağlı stok kayıtları geri alındı.");
  };

  const handleDeleteProductionRun = (runId: string) => {
    deleteProductionRunCascade(runId);
  };

  const handleUndoProductionRun = async (
    runId: string,
    reason?: string
  ): Promise<boolean> => {
    console.log("Undo production run clicked", runId);
    if (USE_SUPABASE) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc("undo_production_run_atomic", {
          p_production_run_id: runId,
          p_reason: reason || "Kullanıcı tarafından geri alındı"
        });

        console.log("RPC success/error:", { data: rpcData, error: rpcError });

        if (rpcError) {
          console.error("RPC Error:", rpcError);
          alert(`Üretim geri alınırken hata oluştu: ${rpcError.message || rpcError}`);
          return false;
        }

        // Fetch all updated tables
        const [
          rmData,
          smData,
          fgsData,
          fgmData,
          prData,
          piData,
          pData,
          oData,
          oiData,
          cData
        ] = await Promise.all([
          supabaseDataService.getRawMaterials(),
          supabaseDataService.getStockMovements(),
          supabaseDataService.getFinishedGoods(),
          supabaseDataService.getFinishedGoodsMovements(),
          supabaseDataService.getProductionRuns(),
          supabaseDataService.getProductionPlanItems(),
          supabaseDataService.getProductionPlans(),
          supabaseDataService.getOrders(),
          supabaseDataService.getOrderItems(),
          supabaseDataService.getCustomers()
        ]);

        const initializedRmData = rmData.map(rm => ({
          ...rm,
          averageCost: typeof rm.averageCost === 'number' ? rm.averageCost : (rm.averageCost ?? rm.purchasePrice ?? 0)
        }));

        setRawMaterials(initializedRmData);
        setStockMovements(smData);
        setFinishedGoodsStocks(fgsData.map(normalizeFinishedGoodsStock));
        setFinishedGoodsMovements(fgmData);
        setProductionRuns(prData);
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
        setProductionPlans(pData.map(normalizeProductionPlan));
        setOrders(oData.map(normalizeOrder));
        setOrderItems(oiData);
        setCustomers(cData);

        return true;
      } catch (err: any) {
        console.error("Error running atomic undo production run:", err);
        alert(`Üretim geri alınırken beklenmedik bir hata oluştu: ${err.message || err}`);
        return false;
      }
    } else {
      // Local storage fallback flow
      deleteProductionRunCascade(runId);
      return true;
    }
  };

  const handleDeleteProductionPlanItem = (itemId: string): boolean | Promise<boolean> => {
    const item = productionPlanItems.find(pi => pi.id === itemId);
    if (!item) {
      alert("Üretim plan kalemi bulunamadı.");
      return false;
    }

    const plan = productionPlans.find(p => p.id === item.productionPlanId);
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için plan kalemleri silinemez.");
      return false;
    }

    // Check if there are any active production runs
    const activeRuns = productionRuns.filter(r => r.productionPlanItemId === itemId && !r.isDeleted);
    if (activeRuns.length > 0) {
      alert("Bu üretim kaleminde üretim girişi var. Önce üretim girişlerini silmelisiniz.");
      return false;
    }

    if (USE_SUPABASE) {
      return (async () => {
        try {
          const currentPlanItems = productionPlanItems.filter(pi => pi.productionPlanId === item.productionPlanId);
          // Omit the deleted item from the list passed to updateCleanProductionPlan
          const updatedActiveItems = currentPlanItems.filter(pi => pi.id !== itemId && !pi.isDeleted);
          
          await dataService.updateCleanProductionPlan(item.productionPlanId, {}, updatedActiveItems);

          // Fetch fresh lists
          const [pData, piData] = await Promise.all([
            supabaseDataService.getProductionPlans(),
            supabaseDataService.getProductionPlanItems()
          ]);
          setProductionPlans(pData.map(normalizeProductionPlan));
          setProductionPlanItems(piData.map(normalizeProductionPlanItem));

          // Sync order statuses
          const updatedPlanItems = piData.map(normalizeProductionPlanItem);
          setOrders(prevOrders => {
            return syncOrderStatuses(
              prevOrders,
              orderItems,
              updatedPlanItems,
              finishedGoodsStocks.filter(fg => !fg.isDeleted),
              finishedGoodsMovements.filter(fgm => !(fgm as any).isDeleted),
              productionRuns.filter(r => !r.isDeleted)
            );
          });

          alert("Üretim kalemi plandan silindi.");
          return true;
        } catch (err: any) {
          console.error("Error deleting production plan item:", err);
          alert(`Üretim kalemi silinirken hata oluştu: ${err.message || err}`);
          return false;
        }
      })();
    } else {
      // Soft delete the plan item
      const updatedPlanItems = productionPlanItems.map(pi => 
        pi.id === itemId 
          ? { ...pi, isDeleted: true, deletedAt: new Date().toISOString(), deletedReason: "User requested delete", updatedAt: new Date().toISOString() } 
          : pi
      );

      setProductionPlanItems(updatedPlanItems);

      // Sync other states/status
      const remainingPlanItems = updatedPlanItems.filter(pi => pi.productionPlanId === item.productionPlanId && !pi.isDeleted);
      const activeRunsForPlan = productionRuns.filter(r => r.productionPlanId === item.productionPlanId && !r.isDeleted);
      
      // Update production plan status since an item has been removed
      updateProductionPlanStatus(item.productionPlanId, updatedPlanItems, activeRunsForPlan);

      // Sync order statuses
      setOrders(prevOrders => {
        return syncOrderStatuses(
          prevOrders,
          orderItems,
          updatedPlanItems,
          finishedGoodsStocks.filter(fg => !fg.isDeleted),
          finishedGoodsMovements.filter(fgm => !(fgm as any).isDeleted),
          productionRuns.filter(r => !r.isDeleted)
        );
      });

      alert("Üretim kalemi plandan silindi.");
      return true;
    }
  };

  const handleAddOrderItemToPlan = async (
    productionPlanId: string,
    orderId: string,
    orderItemId: string,
    productId: string,
    plannedQuantity: number,
    unit: string = 'Adet'
  ): Promise<any> => {
    try {
      const res = await dataService.addOrderItemToProductionPlan(
        productionPlanId,
        orderId,
        orderItemId,
        productId,
        plannedQuantity,
        unit
      );

      if (res && res.success === false) {
        alert(res.error || res.message || "Sipariş plana eklenirken hata oluştu.");
        return res;
      }

      // Reload states
      if (USE_SUPABASE) {
        const [pData, piData, oData] = await Promise.all([
          supabaseDataService.getProductionPlans(),
          supabaseDataService.getProductionPlanItems(),
          supabaseDataService.getOrders()
        ]);
        setProductionPlans(pData.map(normalizeProductionPlan));
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
        setOrders(oData.map(normalizeOrder));
      } else {
        setProductionPlans(localDataService.getProductionPlans());
        setProductionPlanItems(localDataService.getProductionPlanItems());
        setOrders(localDataService.getOrders());
      }
      return res;
    } catch (err: any) {
      console.error("Error adding order item to plan:", err);
      alert(`Sipariş plana eklenirken hata oluştu: ${err.message || err}`);
      return { success: false, error: err.message || err };
    }
  };

  const handleShipFinishedGoods = (
    idOrShipments: string | { stockId: string; quantity: number }[],
    quantity?: number,
    note?: string
  ): boolean | Promise<boolean> => {
    if (USE_SUPABASE) {
      return (async () => {
        try {
          if (typeof idOrShipments === 'string') {
            const { data: rpcData, error: rpcError } = await supabase.rpc("ship_finished_goods_atomic", {
              p_finished_goods_stock_id: idOrShipments,
              p_ship_quantity: Number(quantity),
              p_note: note || null
            });

            if (rpcError) {
              console.error("RPC Error:", rpcError);
              alert(`Sevkiyat kaydedilirken hata oluştu: ${rpcError.message || rpcError}`);
              return false;
            }
          } else {
            for (const shipment of idOrShipments) {
              const { data: rpcData, error: rpcError } = await supabase.rpc("ship_finished_goods_atomic", {
                p_finished_goods_stock_id: shipment.stockId,
                p_ship_quantity: Number(shipment.quantity),
                p_note: note || null
              });

              if (rpcError) {
                console.error("RPC Error:", rpcError);
                alert(`Sevkiyat kaydedilirken hata oluştu: ${rpcError.message || rpcError}`);
                return false;
              }
            }
          }

          // Fetch all updated tables requested
          const [
            fgsData,
            fgmData,
            oData,
            oiData,
            cData,
            prData,
            piData,
            pData
          ] = await Promise.all([
            supabaseDataService.getFinishedGoods(),
            supabaseDataService.getFinishedGoodsMovements(),
            supabaseDataService.getOrders(),
            supabaseDataService.getOrderItems(),
            supabaseDataService.getCustomers(),
            supabaseDataService.getProductionRuns(),
            supabaseDataService.getProductionPlanItems(),
            supabaseDataService.getProductionPlans()
          ]);

          setFinishedGoodsStocks(fgsData.map(normalizeFinishedGoodsStock));
          setFinishedGoodsMovements(fgmData);
          setOrders(oData.map(normalizeOrder));
          setOrderItems(oiData);
          setCustomers(cData);
          setProductionRuns(prData);
          setProductionPlanItems(piData.map(normalizeProductionPlanItem));
          setProductionPlans(pData.map(normalizeProductionPlan));

          return true;
        } catch (err: any) {
          console.error("Error running atomic ship finished goods:", err);
          alert(`Sevkiyat kaydedilirken beklenmedik bir hata oluştu: ${err.message || err}`);
          return false;
        }
      })();
    }

    if (typeof idOrShipments === 'string') {
      const result = shipFinishedGoods(idOrShipments, quantity!, finishedGoodsStocks, note);
      setFinishedGoodsStocks(result.updatedStocks);
      if (result.newMovement) {
        setFinishedGoodsMovements(prev => [...prev, result.newMovement!]);
      }
    } else {
      let currentStocks = [...finishedGoodsStocks];
      const newMovements: FinishedGoodsMovement[] = [];
      
      for (const shipment of idOrShipments) {
        const result = shipFinishedGoods(shipment.stockId, shipment.quantity, currentStocks, note);
        currentStocks = result.updatedStocks;
        if (result.newMovement) {
          newMovements.push(result.newMovement);
        }
      }
      
      setFinishedGoodsStocks(currentStocks);
      if (newMovements.length > 0) {
        setFinishedGoodsMovements(prev => [...prev, ...newMovements]);
      }
    }
    return true;
  };

  const handleUndoFinishedGoodsShipment = async (
    movementId: string,
    reason?: string
  ): Promise<boolean> => {
    if (USE_SUPABASE) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc("undo_finished_goods_shipment_atomic", {
          p_finished_goods_movement_id: movementId,
          p_reason: reason || "Kullanıcı tarafından geri alındı"
        });

        if (rpcError) {
          console.error("RPC Error:", rpcError);
          alert(`Sevkiyat geri alınırken hata oluştu: ${rpcError.message || rpcError}`);
          return false;
        }

        // Fetch all updated tables requested
        const [
          fgsData,
          fgmData,
          oData,
          oiData,
          cData,
          prData,
          piData,
          pData
        ] = await Promise.all([
          supabaseDataService.getFinishedGoods(),
          supabaseDataService.getFinishedGoodsMovements(),
          supabaseDataService.getOrders(),
          supabaseDataService.getOrderItems(),
          supabaseDataService.getCustomers(),
          supabaseDataService.getProductionRuns(),
          supabaseDataService.getProductionPlanItems(),
          supabaseDataService.getProductionPlans()
        ]);

        setFinishedGoodsStocks(fgsData.map(normalizeFinishedGoodsStock));
        setFinishedGoodsMovements(fgmData);
        setOrders(oData.map(normalizeOrder));
        setOrderItems(oiData);
        setCustomers(cData);
        setProductionRuns(prData);
        setProductionPlanItems(piData.map(normalizeProductionPlanItem));
        setProductionPlans(pData.map(normalizeProductionPlan));

        return true;
      } catch (err: any) {
        console.error("Error running atomic undo finished goods shipment:", err);
        alert(`Sevkiyat geri alınırken beklenmedik bir hata oluştu: ${err.message || err}`);
        return false;
      }
    } else {
      // Local storage fallback flow
      const movement = finishedGoodsMovements.find(m => m.id === movementId);
      if (!movement) {
        alert("Sevkiyat hareketi bulunamadı.");
        return false;
      }

      const stock = finishedGoodsStocks.find(s => s.id === movement.finishedGoodsStockId);
      if (!stock) {
        alert("Nihai ürün stoğu bulunamadı.");
        return false;
      }

      // Mark current movement as isDeleted = true
      const updatedMovements = finishedGoodsMovements.map(m => m.id === movementId ? { ...m, isDeleted: true } : m);

      // Create reverse movement entry
      const undoMovement: FinishedGoodsMovement = {
        id: 'fgm_' + Math.random().toString(36).substring(2, 9),
        finishedGoodsStockId: stock.id,
        productId: stock.productId,
        customerId: stock.customerId,
        orderId: stock.orderId,
        orderItemId: stock.orderItemId,
        type: 'Sayım düzeltmesi',
        quantity: movement.quantity,
        date: new Date().toISOString().split('T')[0],
        note: reason || "Kullanıcı tarafından geri alındı",
        createdAt: new Date().toISOString(),
        isDeleted: false,
        isShipment: false
      };

      const updatedQtyRemaining = stock.quantityRemaining + movement.quantity;
      let newStatus: any = 'Stokta';
      if (updatedQtyRemaining === 0) {
        newStatus = 'Sevk Edildi';
      } else if (updatedQtyRemaining > 0 && updatedQtyRemaining < stock.quantityProduced) {
        newStatus = 'Kısmi Sevk';
      } else if (updatedQtyRemaining === stock.quantityProduced) {
        newStatus = 'Stokta';
      }

      const updatedStocks = finishedGoodsStocks.map(s => s.id === stock.id ? {
        ...s,
        quantityRemaining: updatedQtyRemaining,
        status: newStatus,
        updatedAt: new Date().toISOString()
      } : s);

      setFinishedGoodsStocks(updatedStocks);
      setFinishedGoodsMovements([...updatedMovements, undoMovement]);

      if (stock.orderId) {
        const order = orders.find(o => o.id === stock.orderId);
        if (order) {
          const orderItem = orderItems.find(oi => oi.id === stock.orderItemId);
          if (orderItem) {
            const unitPrice = orderItem.unitPrice || 0;
            const updatedRealizedAmount = Math.max(0, (order.realizedAmount || 0) - (movement.quantity * unitPrice));
            const updatedOrders = orders.map(o => o.id === order.id ? {
              ...o,
              realizedAmount: updatedRealizedAmount,
              status: 'Sevkiyata Hazır' as any,
              computedStatus: 'Sevkiyata Hazır' as any
            } : o);
            setOrders(updatedOrders);
          }
        }
      }

      return true;
    }
  };

  const handleUpdateFinishedGoodsStock = (id: string, updates: Partial<FinishedGoodsStock>) => {
    setFinishedGoodsStocks(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAdjustFinishedGoodsStock = (
    idOrAdjustments: string | { id: string; newRemaining: number }[],
    secondArg: any,
    thirdArg: string,
    fourthArg: string,
    fifthArg?: string,
    overallPreviousRemaining?: number,
    overallNewRemaining?: number
  ) => {
    if (typeof idOrAdjustments === 'string') {
      const id = idOrAdjustments;
      const newRemaining = secondArg as number;
      const reason = thirdArg;
      const date = fourthArg;
      const note = fifthArg || '';

      const stock = finishedGoodsStocks.find(s => s.id === id);
      if (!stock) return;

      const previousQuantity = stock.quantityRemaining;
      const difference = newRemaining - previousQuantity;
      const adjustmentQuantity = Math.abs(difference);

      // 1. Update stock
      setFinishedGoodsStocks(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            quantityRemaining: newRemaining,
            note: `${item.note || ''} (Stok Düzeltme: ${reason} - ${newRemaining} Adet, ${note})`.trim(),
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      }));

      // 2. Create FinishedGoodsMovement if there is a difference
      if (difference !== 0) {
        const newMovement: FinishedGoodsMovement = {
          id: 'fgm_adj_' + Math.random().toString(36).substring(2, 9),
          finishedGoodsStockId: id,
          productId: stock.productId,
          customerId: stock.customerId,
          orderId: stock.orderId,
          orderItemId: stock.orderItemId,
          type: 'Sayım düzeltmesi',
          quantity: adjustmentQuantity,
          date: date || new Date().toISOString().split('T')[0],
          note: `${reason}: ${previousQuantity} → ${newRemaining} Adet. ${note}`.trim(),
          createdAt: new Date().toISOString(),
          isDeleted: false,
          movementType: 'stock_adjustment',
          isShipment: false,
          reason: reason,
          previousQuantity: previousQuantity,
          newQuantity: newRemaining,
          difference: difference,
          adjustmentQuantity: adjustmentQuantity,
          lotNo: stock.lotNo
        };

        setFinishedGoodsMovements(prev => [...prev, newMovement]);
      }
    } else {
      const adjustments = idOrAdjustments;
      const reason = secondArg as string;
      const date = thirdArg;
      const note = fourthArg;
      const lotNo = fifthArg;

      if (adjustments.length === 0) return;

      // 1. Update stock items in batch
      setFinishedGoodsStocks(prev => prev.map(item => {
        const adj = adjustments.find(a => a.id === item.id);
        if (adj) {
          return {
            ...item,
            quantityRemaining: adj.newRemaining,
            note: `${item.note || ''} (Stok Düzeltme: ${reason} - ${adj.newRemaining} Adet, ${note})`.trim(),
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      }));

      // Grab first stock item to fetch metadata
      const firstAdj = adjustments[0];
      const stock = finishedGoodsStocks.find(s => s.id === firstAdj.id);
      if (!stock) return;

      const prevTotal = overallPreviousRemaining !== undefined
        ? overallPreviousRemaining
        : adjustments.reduce((sum, adj) => {
            const s = finishedGoodsStocks.find(st => st.id === adj.id);
            return sum + (s ? s.quantityRemaining : 0);
          }, 0);

      const newTotal = overallNewRemaining !== undefined
        ? overallNewRemaining
        : adjustments.reduce((sum, adj) => sum + adj.newRemaining, 0);

      const difference = newTotal - prevTotal;
      const adjustmentQuantity = Math.abs(difference);

      if (difference !== 0) {
        const newMovement: FinishedGoodsMovement = {
          id: 'fgm_adj_' + Math.random().toString(36).substring(2, 9),
          finishedGoodsStockId: stock.id,
          productId: stock.productId,
          customerId: stock.customerId,
          orderId: stock.orderId,
          orderItemId: stock.orderItemId,
          type: 'Sayım düzeltmesi',
          quantity: adjustmentQuantity,
          date: date || new Date().toISOString().split('T')[0],
          note: `${reason}: ${prevTotal} → ${newTotal} Adet. ${note}`.trim(),
          createdAt: new Date().toISOString(),
          isDeleted: false,
          movementType: 'stock_adjustment',
          isShipment: false,
          reason: reason,
          previousQuantity: prevTotal,
          newQuantity: newTotal,
          difference: difference,
          adjustmentQuantity: adjustmentQuantity,
          lotNo: lotNo || stock.lotNo
        };

        setFinishedGoodsMovements(prev => [...prev, newMovement]);
      }
    }
  };

  const handleDeleteFinishedGoodsStock = (id: string) => {
    setFinishedGoodsStocks(prev => prev.map(item => item.id === id ? { ...item, isDeleted: true } : item));
  };

  if (checkingSession) {
    return (
      <div id="session-check-loading" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans text-slate-100 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.06),transparent_50%)] bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.06),transparent_50%)]" />
        <div className="relative text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-400">Oturum kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLoginSuccess={async () => {
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            setSession(currentSession);
          } catch (err) {
            console.error("Error retrieving session on login success:", err);
          }
        }}
      />
    );
  }

  if (USE_SUPABASE && !isDataLoaded) {
    return (
      <div id="supabase-loading" className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans text-slate-100 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.06),transparent_50%)] bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.06),transparent_50%)]" />
        <div className="relative text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-400">Veriler Supabase'den yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden antialiased">
      
      {/* SIDEBAR NAVIGATION CONTROL */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-white font-extrabold text-lg">F</div>
          <span className="text-xl font-bold tracking-tight text-white">FreshOps</span>
        </div>
        
        <nav className="flex-1 py-4 overflow-y-auto space-y-1">
          <div className="px-5 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Yönetim</div>
          
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'customers' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users size={16} />
            Müşteriler
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'suppliers' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Truck size={16} />
            Tedarikçiler
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'products' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <UtensilsCrossed size={16} />
            Ürün Reçeteleri
          </button>

          <button
            onClick={() => setActiveTab('rawMaterials')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'rawMaterials' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Apple size={16} />
            Hammaddeler
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'stock' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Boxes size={16} />
            Stok & Hareketler
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'orders' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ShoppingCart size={16} />
            Siparişler
          </button>

          <div className="px-5 py-2 mt-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Planlama & Sevk</div>

          <button
            onClick={() => setActiveTab('productionPlan')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'productionPlan' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ClipboardList size={16} />
            Üretim Planlama
          </button>

          <button
            onClick={() => setActiveTab('finishedGoods')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'finishedGoods' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileCheck2 size={16} />
            Nihai Ürün Stoğu ve Sevkiyat
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
              activeTab === 'settings' ? 'bg-emerald-500/10 text-emerald-400 border-r-2 border-emerald-500 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings size={16} />
            Maliyet Ayarları
          </button>

          <button
            id="sidebar-logout-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleLogout();
            }}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 mt-4 border-t border-slate-800/50 pt-3"
            style={{ position: 'relative', zIndex: 40 }}
          >
            <LogOut size={16} />
            Çıkış Yap
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between shrink-0">
          <span>FreshOps v1.0</span>
          <span>{USE_SUPABASE ? (SHOW_SUPABASE_DEV_TOOLS ? 'SupabaseDB Active' : 'Veritabanı Aktif') : 'Yerel Depolama'}</span>
        </div>
      </aside>

      {/* WORKSPACE VIEWPORT / MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden h-screen">
        
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800">
              {activeTab === 'dashboard' && 'Üretim Dashboard'}
              {activeTab === 'customers' && 'Müşteriler'}
              {activeTab === 'suppliers' && 'Tedarikçiler'}
              {activeTab === 'products' && 'Ürün Reçeteleri'}
              {activeTab === 'rawMaterials' && 'Hammadde Tanımları'}
              {activeTab === 'stock' && 'Hammadde Stoğu & Hareketleri'}
              {activeTab === 'orders' && 'Siparişler'}
              {activeTab === 'productionPlan' && 'Günlük Üretim Planlama'}
              {activeTab === 'finishedGoods' && 'Nihai Ürün Stoğu ve Sevkiyat'}
              {activeTab === 'settings' && 'Maliyet Ayarları'}
            </h2>
            <span className="text-sm text-slate-300">|</span>
            <span className="text-sm text-slate-500 font-semibold">{parseISODateSafe(getTodayISO()).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800">
              <Activity size={14} className="text-emerald-500 animate-pulse" />
              <span>Üretim Hattı Aktif</span>
            </div>
            
            <button
              id="header-logout-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleLogout();
              }}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-800 cursor-pointer transition-colors"
              title="Çıkış Yap"
            >
              <LogOut size={14} className="text-rose-500" />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          
          {dataLoadError && (
            <div id="data-load-error-alert" className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex items-center justify-between text-sm shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <span className="font-medium">{dataLoadError}</span>
              </div>
              <button 
                onClick={() => setDataLoadError(null)} 
                className="text-amber-500 hover:text-amber-700 font-bold px-2 cursor-pointer transition-colors"
                title="Kapat"
              >
                ×
              </button>
            </div>
          )}

          {/* TAB ROUTER */}
          {activeTab === 'dashboard' && (
            <DashboardView
              customers={customers}
              rawMaterials={rawMaterials}
              products={products}
              recipes={recipes}
              orders={orders}
              orderItems={orderItems}
              wasteRecords={[]}
              costSettings={costSettings}
              currentStocks={currentStocks}
              stockMovements={stockMovements}
              productionPlans={productionPlans}
              productionPlanItems={productionPlanItems}
              productionRuns={productionRuns}
              finishedGoodsStocks={finishedGoodsStocks}
              finishedGoodsMovements={finishedGoodsMovements}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              customers={customers}
              orders={orders}
              orderItems={orderItems}
              products={products}
              finishedGoodsMovements={finishedGoodsMovements}
              onAdd={handleAddCustomer}
              onUpdate={handleUpdateCustomer}
              onDelete={handleDeleteCustomer}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={suppliers}
              onCreateSupplier={handleCreateOrGetSupplier}
              rawMaterials={rawMaterials}
              rawMaterialReceipts={rawMaterialReceipts}
              rawMaterialLots={rawMaterialLots}
              onUpdateRawMaterialReceipt={handleUpdateRawMaterialReceipt}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              products={products}
              recipes={recipes}
              rawMaterials={rawMaterials}
              costSettings={costSettings}
              stockMovements={stockMovements}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onAddRecipeItem={handleAddRecipeItem}
              onUpdateRecipeItem={handleUpdateRecipeItem}
              onDeleteRecipeItem={handleDeleteRecipeItem}
            />
          )}

          {activeTab === 'rawMaterials' && (
            <RawMaterialsView
              rawMaterials={rawMaterials}
              currentStocks={currentStocks}
              stockMovements={stockMovements}
              onAdd={handleAddRawMaterial}
              onUpdate={handleUpdateRawMaterial}
              onDelete={handleDeleteRawMaterial}
            />
          )}

          {activeTab === 'stock' && (
            <StockView
              rawMaterials={rawMaterials}
              stockMovements={stockMovements}
              currentStocks={currentStocks}
              orders={orders}
              orderItems={orderItems}
              products={products}
              recipes={recipes}
              costSettings={costSettings}
              productionPlans={productionPlans}
              productionPlanItems={productionPlanItems}
              productionRuns={productionRuns}
              finishedGoodsStocks={finishedGoodsStocks}
              finishedGoodsMovements={finishedGoodsMovements}
              onAddMovement={handleAddStockMovement}
              onUpdateMovement={handleUpdateStockMovement}
              onDeleteMovement={handleDeleteStockMovement}
              suppliers={suppliers}
              rawMaterialReceipts={rawMaterialReceipts}
              rawMaterialLots={rawMaterialLots}
              onCreateOrGetSupplier={handleCreateOrGetSupplier}
              onCreateRawMaterialReceipt={handleCreateRawMaterialReceipt}
              onUpdateRawMaterialReceipt={handleUpdateRawMaterialReceipt}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              orderItems={orderItems}
              customers={customers}
              products={products}
              recipes={recipes}
              rawMaterials={rawMaterials}
              currentStocks={currentStocks}
              costSettings={costSettings}
              stockMovements={stockMovements}
              productionPlanItems={productionPlanItems}
              finishedGoodsStocks={finishedGoodsStocks}
              finishedGoodsMovements={finishedGoodsMovements}
              productionRuns={productionRuns}
              onAddOrder={handleAddOrder}
              onUpdateOrder={handleUpdateOrder}
              onDeleteOrder={handleDeleteOrder}
            />
          )}

          {activeTab === 'productionPlan' && (
            <ProductionPlanView
              productionPlans={productionPlans}
              productionPlanItems={productionPlanItems}
              orders={orders}
              orderItems={orderItems}
              customers={customers}
              products={products}
              recipes={recipes}
              rawMaterials={rawMaterials}
              currentStocks={currentStocks}
              costSettings={costSettings}
              stockMovements={stockMovements}
              productionRuns={productionRuns}
              finishedGoodsStocks={finishedGoodsStocks}
              finishedGoodsMovements={finishedGoodsMovements}
              onAddPlan={handleAddProductionPlan}
              onUpdatePlan={handleUpdateProductionPlan}
              onUpdatePlanItemStatus={handleUpdatePlanItemStatus}
              onCreateProductionRun={handleCreateProductionRun}
              onDeleteProductionRun={handleDeleteProductionRun}
              onUndoProductionRun={handleUndoProductionRun}
              onDeleteProductionPlanItem={handleDeleteProductionPlanItem}
              onAddOrderItemToPlan={handleAddOrderItemToPlan}
              onClosePlanAndCarryOver={handleClosePlanAndCarryOver}
            />
          )}

          {activeTab === 'finishedGoods' && (
            <FinishedGoodsView
              products={products}
              orders={orders}
              orderItems={orderItems}
              productionPlans={productionPlans}
              productionPlanItems={productionPlanItems}
              customers={customers}
              finishedGoodsStocks={finishedGoodsStocks}
              finishedGoodsMovements={finishedGoodsMovements}
              onShipFinishedGoods={handleShipFinishedGoods}
              onUpdateFinishedGood={handleUpdateFinishedGoodsStock}
              onDeleteFinishedGood={handleDeleteFinishedGoodsStock}
              onAdjustFinishedGoodsStock={handleAdjustFinishedGoodsStock}
              onUndoFinishedGoodsShipment={handleUndoFinishedGoodsShipment}
            />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-xl">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-sm">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Maliyet & Güvenlik Parametreleri</h2>
                  <p className="text-xs text-slate-500 mt-1">Sistemdeki paket başına işçilik, genel gider payı, sevkiyat payı ve varsayılan güvenlik payı katsayıları.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Paket Başı İşçilik Maliyeti (TL) *</label>
                    <input
                      type="text"
                      value={settingsLaborCost}
                      onChange={(e) => setSettingsLaborCost(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Paket Başı Genel Gider (Overhead) (TL) *</label>
                    <input
                      type="text"
                      value={settingsOverheadCost}
                      onChange={(e) => setSettingsOverheadCost(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Paket Başı Sevkiyat/Lojistik (TL) *</label>
                    <input
                      type="text"
                      value={settingsDeliveryCost}
                      onChange={(e) => setSettingsDeliveryCost(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Stok Uyarı Eşiği (Gün) *</label>
                    <input
                      type="text"
                      value={settingsStockWarning}
                      onChange={(e) => setSettingsStockWarning(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Parti Tarih Ofseti (Gün)</label>
                    <input
                      type="text"
                      value={settingsLotDateOffsetDays}
                      onChange={(e) => setSettingsLotDateOffsetDays(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Parti numarasındaki tarih için üretim tarihine kaç gün ekleneceğini belirler. Örn. 0 = üretim günü, 2 = üretim tarihi + 2 gün.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Varsayılan Güvenlik Payı % *</label>
                    <input
                      type="text"
                      value={settingsSafetyRate}
                      onChange={(e) => setSettingsSafetyRate(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="useAverageWaste"
                      checked={settingsUseAverageWaste}
                      onChange={(e) => setSettingsUseAverageWaste(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="useAverageWaste" className="text-xs font-semibold text-slate-600 cursor-pointer">
                      Ortalama Fire Oranını Kullan
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={handleCancelSettings}
                    className="px-4 py-2 border border-slate-200 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
                  >
                    Kaydet
                  </button>
                </div>
              </div>

              {/* SUPABASE MIGRATION SECTION */}
              {SHOW_SUPABASE_DEV_TOOLS && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Supabase Veri Yönetimi ve Aktarımı</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {USE_SUPABASE ? (
                        <>
                          Uygulama <strong className="text-emerald-600 font-bold">SupabaseDB modunda</strong> çalışıyor. Local verileri aktarma aracı sadece gerektiğinde manuel yedek aktarımı için kullanılmalıdır.
                        </>
                      ) : (
                        <>
                          Yerel localStorage verilerini güvenli bir şekilde Supabase veritabanına aktarmak ve bağlantıyı test etmek için bu paneli kullanabilirsiniz. 
                          <strong className="text-emerald-600 ml-1 font-bold">Uygulama hâlâ LocalDB modundadır.</strong>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      {testingConnection ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowMigrateConfirmModal(true)}
                      disabled={migratingData}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      {migratingData ? 'Aktarılıyor...' : 'Local Verileri Supabase’e Aktar'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCheckCounts}
                      disabled={checkingCounts}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      {checkingCounts ? 'Sorgulanıyor...' : 'Supabase Kayıt Sayılarını Kontrol Et'}
                    </button>
                  </div>

                  {/* TEST RESULT */}
                  {testResult && (
                    <div className={`p-4 rounded-xl text-xs border ${testResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                      <p className="font-bold mb-1">Bağlantı Test Sonucu:</p>
                      <p>{testResult.message}</p>
                      {testResult.success && (
                        <div className="mt-2 space-y-0.5 text-[11px] text-emerald-700 font-medium">
                          <p>• Aktif Kullanıcı: <span className="font-bold">{testResult.userEmail}</span></p>
                          <p>• Admin Yetkisi: <span className="font-bold">{testResult.isAdmin ? 'EVET' : 'HAYIR'}</span></p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MIGRATION RESULT */}
                  {migrationResult && (
                    <div className={`p-4 rounded-xl text-xs border ${migrationResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                      <p className="font-bold mb-1">Veri Aktarım Sonucu:</p>
                      <p className="mb-2">{migrationResult.message}</p>
                      {migrationResult.success && Object.keys(migrationResult.counts).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-emerald-100 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-medium text-emerald-700">
                          {Object.entries(migrationResult.counts).map(([tbl, count]) => (
                            <div key={tbl} className="flex justify-between">
                              <span className="opacity-85">{tbl}:</span>
                              <span className="font-bold">{count} kayıt</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ROW COUNTS */}
                  {rowCounts && (
                    <div className="p-4 bg-slate-100/80 border border-slate-200/60 rounded-xl text-xs text-slate-700">
                      <p className="font-bold text-slate-800 mb-2">Supabase Veritabanı Kayıt Sayıları:</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-medium">
                        {Object.entries(rowCounts).map(([tbl, count]) => (
                          <div key={tbl} className="flex justify-between border-b border-slate-200/40 py-0.5">
                            <span className="text-slate-500">{tbl}:</span>
                            <span className="font-bold text-slate-800">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DATA MANAGEMENT SECTION */}
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 space-y-4 shadow-xs">
                <div>
                  <h3 className="text-sm font-bold text-rose-800">Veri Yönetimi</h3>
                  <p className="text-xs text-rose-600 mt-1">Tüm operasyonel verileri kalıcı olarak sıfırlamak için kullanılır. Bu işlem geri alınamaz.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetAllData}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    Tüm Verileri Sıfırla
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <footer className="h-12 bg-white border-t border-slate-200 flex items-center px-6 shadow-sm shrink-0 justify-between">
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-slate-600 font-medium">
                {USE_SUPABASE ? (SHOW_SUPABASE_DEV_TOOLS ? 'SupabaseDB Aktif' : 'Veritabanı Aktif') : 'Üretim Hattı Aktif'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-slate-600 font-medium">Senkronize</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-slate-300"></div>
              <span className="text-slate-500 font-medium">Sipariş Bekleme: Yok</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Güvenlik Payı Varsayılanı: <span className="text-slate-800 font-bold">%{costSettings?.defaultSafetyRate ?? 3}</span>
          </div>
        </footer>

      </main>

      {/* TÜM VERİLERİ SIFIRLA ONAY MODALI */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <h3 className="font-bold text-red-700 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                Tüm Verileri Sıfırla
              </h3>
              <button
                onClick={() => !isResetting && setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer text-xs disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 text-sm text-slate-600 space-y-4">
              <p className="font-bold text-slate-800 text-base">Tüm verileri sıfırlamak üzeresiniz</p>
              
              <p className="leading-relaxed text-slate-500 text-xs">
                {USE_SUPABASE ? (
                  "Bu işlem Supabase veritabanındaki tüm FreshOps operasyonel verilerini kalıcı olarak siler. Müşteriler, hammaddeler, ürünler, reçeteler, siparişler, stok hareketleri, üretim planları, üretim kayıtları ve mamul stokları silinir. Kullanıcı hesabınız ve giriş bilgileriniz silinmez. Bu işlem geri alınamaz."
                ) : (
                  "Bu işlem tarayıcınızdaki tüm FreshOps operasyonel verilerini kalıcı olarak siler. Müşteriler, hammaddeler, ürünler, reçeteler, siparişler, stok hareketleri, üretim planları, üretim kayıtları ve mamul stokları silinir. Bu işlem geri alınamaz."
                )}
              </p>

              {USE_SUPABASE && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-rose-600">
                    Devam etmek için aşağıdaki kutuya <span className="font-bold underline">RESET FRESHOPS</span> yazın.
                  </p>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    disabled={isResetting}
                    placeholder="RESET FRESHOPS"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 disabled:bg-slate-50 disabled:text-slate-400 uppercase"
                  />
                </div>
              )}

              {resetError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                  {resetError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="px-4 py-2 border border-slate-200 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={executeResetAllData}
                disabled={isResetting || (USE_SUPABASE && resetConfirmText.trim().toUpperCase() !== "RESET FRESHOPS")}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md disabled:bg-red-300 disabled:cursor-not-allowed disabled:shadow-none min-w-[120px] flex items-center justify-center"
              >
                {isResetting ? "Veriler sıfırlanıyor..." : "Kalıcı Olarak Sıfırla"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPABASE MIGRATION CONFIRM MODAL */}
      {showMigrateConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Activity size={16} className="text-emerald-600 animate-pulse" />
                Local Verileri Supabase’e Aktar
              </h3>
              <button
                onClick={() => setShowMigrateConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 text-sm text-slate-600 space-y-3">
              <p className="font-medium text-slate-800 text-base">Aktarımı onaylıyor musunuz?</p>
              <p className="leading-relaxed text-slate-500">
                Bu işlem local verilerinizi (Müşteriler, Hammaddeler, Reçeteler, Siparişler vb.) Supabase veritabanındaki tablolara güvenli bir şekilde eşler ve yükler. 
                <strong className="text-emerald-600 block mt-1">Local verileriniz silinmeyecektir.</strong>
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowMigrateConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                onClick={handleMigrateData}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
              >
                Evet, Aktar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
