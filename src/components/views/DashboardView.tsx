import React from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (DASHBOARD EKRAI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ KAYNAKLARI:
 *    - Customers (Müşteriler) -> Müşteri bazlı sipariş dağılımlarını hesaplar.
 *    - RawMaterials (Hammaddeler) -> Stok durumları ve kritik eşikleri kontrol eder.
 *    - Products (Ürünler) -> Satış analizi ve ürün listelemede kullanılır.
 *    - Orders & OrderItems (Siparişler) -> Ciro, sipariş adedi ve teslimat takvimi çıkarır.
 *    - WasteRecords (Fire Kayıtları) -> Ortalama fire oranlarını hesaplar.
 *    - StockMovements (Hammadde Hareketleri) -> Güncel hammadde stoklarını doğrulamak için hesaplamaya girer.
 *    - FinishedGoodsStocks & Movements -> Mamul ürün stoklarını analiz eder.
 *    - ProductionRuns (Üretim Kayıtları) -> Tamamlanan üretim miktarlarını gösterir.
 * 
 * 2. VERİ KAYNAĞI MERKEZİ:
 *    - Bu ekrana gelen tüm veriler ana bileşen olan 'App.tsx' üzerinden beslenir.
 *    - 'App.tsx' ise verileri 'dataService.ts' katmanından (localStorage / Supabase geçişi) okur.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - customers -> Müşteri analitiği için
 *    - raw_materials -> Hammadde durumları için
 *    - products -> Mamul analizleri için
 *    - orders -> Sipariş durumları ve toplamlar
 *    - order_items -> Sipariş edilen ürün kalemleri ve fiyatlar
 *    - stock_movements -> Stok değişim geçmişi
 *    - waste_records -> Fire ve verimlilik oranları
 *    - finished_goods_stocks -> Mamul stok analitiği
 *    - production_runs -> Gerçekleşen üretim hacimleri
 */
import { 
  Customer, 
  RawMaterial, 
  Product, 
  ProductRecipeItem, 
  Order, 
  OrderItem, 
  WasteRecord, 
  CostSettings,
  StockMovement,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  ProductionRun
} from '../../types';
import { 
  calculateDashboardMetrics,
  calculateOrderProductionProgress,
  OrderProductionProgressItem
} from '../../services/calcService';
import { formatCurrency, formatWeight, formatShortDate, formatDate } from '../../utils/format';
import { getTodayISO, getTomorrowISO, parseISODateSafe } from '../../utils/dateHelper';
import { 
  TrendingDown, 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  ShoppingCart, 
  Scale,
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  User
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

interface DashboardViewProps {
  customers: Customer[];
  rawMaterials: RawMaterial[];
  products: Product[];
  recipes: ProductRecipeItem[];
  orders: Order[];
  orderItems: OrderItem[];
  wasteRecords: WasteRecord[];
  costSettings: CostSettings;
  currentStocks: Record<string, number>;
  stockMovements: StockMovement[];
  productionPlans: any[];
  productionPlanItems: any[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  onNavigate: (view: string) => void;
}

export default function DashboardView({
  customers,
  rawMaterials,
  products,
  recipes,
  orders,
  orderItems,
  wasteRecords,
  costSettings,
  currentStocks,
  stockMovements,
  productionPlans,
  productionPlanItems,
  productionRuns,
  finishedGoodsStocks,
  finishedGoodsMovements,
  onNavigate
}: DashboardViewProps) {
  
  const todayStr = getTodayISO();
  const [showAllProgress, setShowAllProgress] = React.useState(false);

  const progressItems = calculateOrderProductionProgress({
    orders,
    orderItems,
    customers,
    products,
    productionPlanItems,
    productionRuns,
    finishedGoodsStocks,
    finishedGoodsMovements,
    todayStr
  });

  // Run the centralized calculation function
  const metrics = calculateDashboardMetrics({
    selectedDate: todayStr,
    orders,
    orderItems,
    customers,
    products,
    productRecipes: recipes,
    rawMaterials,
    stockMovements,
    productionPlans,
    productionPlanItems,
    productionRuns,
    finishedGoodsStocks,
    finishedGoodsMovements,
    settings: costSettings,
    wasteRecords,
    currentStocks
  });

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280'];

  const sevkBekleyenMamul = finishedGoodsStocks
    .filter(stock => 
      !stock.isDeleted && 
      stock.quantityRemaining > 0 && 
      stock.status !== 'Fire' && 
      stock.status !== 'İptal' && 
      stock.status !== 'Sevk Edildi'
    )
    .reduce((sum, stock) => sum + stock.quantityRemaining, 0);

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const turkishMonths = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const label = `${d.getDate()} ${turkishMonths[d.getMonth()]}`;
    return { dateStr, label };
  });

  const weeklyProductionAndShipmentData = last7Days.map(({ dateStr, label }) => {
    const produced = productionRuns
      .filter(r => !r.isDeleted && r.productionDate === dateStr)
      .reduce((sum, r) => sum + (r.producedQuantity || 0), 0);

    const shipped = finishedGoodsMovements
      .filter(m => !m.isDeleted && m.type === 'Sevkiyat çıkışı' && m.date === dateStr)
      .reduce((sum, m) => sum + (m.quantity || 0), 0);

    return {
      name: label,
      "Üretim": produced,
      "Sevkiyat": shipped
    };
  });

  const hasWeeklyData = weeklyProductionAndShipmentData.some(d => d["Üretim"] > 0 || d["Sevkiyat"] > 0);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-100 pb-5 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Yönetim Paneli</h1>
          <p className="text-sm text-slate-500 mt-1">
            Üretim, hammadde stoğu ve verimlilik göstergelerine genel bakış. Bugün: {formatShortDate(todayStr)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-medium self-start md:self-center">
          <Calendar size={14} />
          <span>Sistem Tarihi: {parseISODateSafe(todayStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* MISSING STOCK NOTIFICATIONS */}
      {metrics.missingRawMaterials.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start animate-pulse">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-red-800">KRİTİK UYARI: Üretim İçin Eksik Hammadde Tespit Edildi!</h3>
            <p className="text-xs text-red-700 mt-1">
              Bugün veya yarın sevk edilecek siparişleri karşılamak için aşağıdaki hammaddeler yetersizdir:
            </p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-medium text-red-900">
              {metrics.missingRawMaterials.map((alert, i) => (
                <div key={i} className="bg-red-100/50 p-2 rounded-lg border border-red-200/50">
                  <span className="font-bold">{alert.name}</span>: Gerekli:{' '}
                  {formatWeight(alert.required, alert.unit as any)}, Eldeki:{' '}
                  {formatWeight(alert.available, alert.unit as any)}, Eksik:{' '}
                  <span className="text-red-600 font-extrabold">{formatWeight(alert.missing, alert.unit as any)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY STATS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bugun Toplam Siparis */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Bugünkü Sipariş</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{metrics.todayOrderQuantity} Adet</h3>
          </div>
          <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl">
            <ShoppingCart size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Bugünkü Sipariş</div>
            <p className="text-slate-300">Sipariş tarihi bugün olan ve iptal edilmemiş aktif siparişlerin toplam adetidir.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Yarın Sevk Edilecek */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Yarın Sevk Edilecek</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{metrics.tomorrowShipmentQuantity} Paket</h3>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>Hazır: {metrics.tomorrowReadyQuantity} p.</span>
              <span>|</span>
              <span className={metrics.tomorrowMissingQuantity > 0 ? 'text-red-500 font-bold flex items-center gap-0.5' : 'text-emerald-600 font-medium'}>
                {metrics.tomorrowMissingQuantity > 0 ? (
                  <>
                    <AlertTriangle size={10} className="shrink-0 animate-bounce" />
                    Eksik: {metrics.tomorrowMissingQuantity} p.
                  </>
                ) : (
                  'Eksik Yok'
                )}
              </span>
            </div>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl self-start">
            <Package size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Yarın Sevk Edilecek</div>
            <p className="text-slate-300">Yarın sevk edilecek onaylı siparişlerin toplam paket adedi ile mevcut hazır nihai ürün stoğu karşılaştırmasıdır.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Bugün Üretilecek Paket */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Bugün Üretilecek</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{metrics.todayPlannedProductionQuantity} Paket</h3>
            <div className="text-[10px] text-slate-500 font-medium truncate max-w-[160px]">
              Plan: {metrics.todayPlannedProductionQuantity} | Üretilen: {metrics.todayCompletedProductionQuantity} | Kalan: {Math.max(0, metrics.todayPlannedProductionQuantity - metrics.todayCompletedProductionQuantity)}
            </div>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl self-start">
            <TrendingUp size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Bugün Üretilecek</div>
            <p className="text-slate-300">Bugünün üretim planındaki toplam planlanan paket miktarı, şu ana kadar tamamlanan üretim ve kalan hedef adetidir.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Planın Gerisinde */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Planın Gerisinde</p>
            <h3 className={`text-lg md:text-xl font-bold ${(metrics.behindScheduleTotalQuantity || 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.behindScheduleTotalQuantity || 0} Paket
            </h3>
            <div className="text-[10px] text-slate-500 font-medium truncate max-w-[160px]">
              {(metrics.behindScheduleItemsCount || 0) > 0 ? `${metrics.behindScheduleItemsCount} üretim kalemi geride` : 'Tüm planlar zamanında'}
            </div>
          </div>
          <div className={`p-2.5 rounded-xl self-start ${
            (metrics.behindScheduleTotalQuantity || 0) > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'
          }`}>
            <AlertTriangle size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Planın Gerisinde</div>
            <p className="text-slate-300">Eksik kapatılan veya hedefin altında kalan aktif üretim planlarındaki toplam üretilmemiş paket açığıdır.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Kritik Stok Sayisi */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Kritik Stok</p>
            <h3 className={`text-lg md:text-xl font-bold ${metrics.criticalStockCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.criticalStockCount} Hammadde
            </h3>
            <div className={`text-[10px] ${metrics.missingRawMaterials.length > 0 ? 'text-red-500 font-bold' : 'text-slate-500'}`}>
              Eksik: {metrics.missingRawMaterials.length} hammadde
            </div>
          </div>
          <div className={`p-2.5 rounded-xl self-start ${metrics.criticalStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-600'}`}>
            <AlertTriangle size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Kritik Stok</div>
            <p className="text-slate-300">Kritik stok seviyesinin altına düşen hammadde sayısını gösterir. Üretim planını aksatabilecek eksiklikleri takip eder.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Tahmini Maliyet */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Bugün Üretim Maliyeti</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{formatCurrency(metrics.todayProductionCost)}</h3>
          </div>
          <div className="bg-rose-50 text-rose-600 p-2.5 rounded-xl">
            <DollarSign size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Bugün Üretim Maliyeti</div>
            <p className="text-slate-300">Bugünkü üretim planına göre hammadde birim maliyetleri, işçilik ve genel gider formülleriyle hesaplanan tahmini toplam üretim maliyetidir.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Tahmini Ciro */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Bugün Tahmini Ciro</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{formatCurrency(metrics.todayEstimatedRevenue)}</h3>
          </div>
          <div className="bg-teal-50 text-teal-600 p-2.5 rounded-xl">
            <TrendingUp size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Bugün Tahmini Ciro</div>
            <p className="text-slate-300">Bugün teslim veya sevk edilecek siparişlerin satış birim fiyatlarından hesaplanan tahmini toplam satış geliri / cirosudur.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Bugun Toplam Hammadde */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Hammadde İhtiyacı</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">{formatWeight(metrics.todayRawMaterialRequirementKg, 'kg')}</h3>
          </div>
          <div className="bg-cyan-50 text-cyan-600 p-2.5 rounded-xl">
            <Scale size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Hammadde İhtiyacı</div>
            <p className="text-slate-300">Bugünkü üretim planı için kalan üretim hedeflerine göre reçete kırılımlarından hesaplanan toplam hammadde ağırlığı ihtiyacıdır.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>

        {/* Sevk Bekleyen Mamul */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between relative group cursor-help transition-all hover:border-slate-200 hover:shadow-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">Sevk Bekleyen Mamul</p>
            <h3 className="text-lg md:text-xl font-bold text-slate-800">
              {sevkBekleyenMamul.toLocaleString('tr-TR')} Pkt
            </h3>
            <div className="text-[10px] text-slate-500 font-medium">
              Nihai ürün stoğunda sevke hazır
            </div>
          </div>
          <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl self-start">
            <Package size={18} />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] font-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 leading-relaxed border border-slate-700/50">
            <div className="font-bold mb-1 text-slate-200">Sevk Bekleyen Mamul</div>
            <p className="text-slate-300">Nihai ürün stoğunda bulunan, üretilmiş ancak henüz müşterilere sevk edilmemiş toplam paket/adet miktarıdır.</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      </div>

      {/* SİPARİŞ BAZLI ÜRETİM İLERLEMESİ */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-50 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Activity size={18} className="text-emerald-600" />
              Sipariş Bazlı Üretim İlerlemesi
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Aktif siparişler için planlanan üretim, gerçekleşen üretim ve sevk tarihine göre ilerleme takibi.
            </p>
          </div>
          
          {/* ÜST ÖZET CHIPS */}
          <div className="flex flex-wrap gap-2">
            <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aktif Kalem:</span>
              <span className="text-xs font-black text-slate-800">{progressItems.length}</span>
            </div>
            <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Geciken:</span>
              <span className="text-xs font-black text-rose-600">
                {progressItems.filter(item => item.isExpired).length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Kalan Üretim:</span>
              <span className="text-xs font-black text-slate-800">
                {progressItems.reduce((sum, item) => sum + item.remainingQty, 0)} Adet
              </span>
            </div>
          </div>
        </div>

        {/* PROGRESS LIST */}
        <div className="space-y-4">
          {progressItems.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Package className="mx-auto text-slate-300 mb-3" size={32} />
              <p className="text-sm font-semibold text-slate-600">Aktif Sipariş Bulunmamaktadır</p>
              <p className="text-xs text-slate-400 mt-1">Takip edilecek açık, üretim aşamasında veya sevk edilmemiş sipariş kalemi yok.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {(showAllProgress ? progressItems : progressItems.slice(0, 5)).map((item) => (
                  <div 
                    key={item.orderItemId} 
                    className="border border-slate-150/70 hover:border-slate-300 rounded-2xl p-4 transition-all hover:shadow-xs bg-slate-50/20"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                      
                      {/* Sol Taraf: Sipariş ve Ürün Bilgileri */}
                      <div className="lg:col-span-4 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                              {item.orderNo}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${item.statusColor}`}>
                              {item.statusLabel}
                            </span>
                            {item.isExpired && (
                              <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[9px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-rose-500 animate-ping"></span>
                                {item.delayDays} gün gecikti
                              </span>
                            )}
                          </div>
                          {item.shippedQty !== undefined && item.shippedQty > 0 && (
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-pulse">
                              Kısmi Sevk: {item.shippedQty} / {item.orderQty} Pkt
                            </span>
                          )}
                        </div>
                        
                        <div>
                          <div className="text-xs font-black text-slate-800 truncate" title={item.customerName}>
                            {item.customerName}
                          </div>
                          <div className="text-xs font-bold text-emerald-600 truncate mt-0.5">
                            {item.productName}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <div className="flex items-center gap-1">
                            <Clock size={10} />
                            <span>Sipariş: {formatShortDate(item.orderDate)}</span>
                          </div>
                          <span>•</span>
                          <div className={`flex items-center gap-1 ${item.isExpired ? 'text-rose-600' : ''}`}>
                            <Calendar size={10} />
                            <span>Sevk: {formatShortDate(item.deliveryDate)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Orta Kısım: Progress Bar ve Karşılaştırmalı Rakamlar */}
                      <div className="lg:col-span-5 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 font-bold">Üretim İlerlemesi:</span>
                            <span className="font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              %{item.progressPercent.toFixed(0)}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">
                            Hedef: <strong className="text-slate-800 font-black">{item.orderQty} Paket</strong>
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.progressPercent >= 100 ? 'bg-emerald-500' :
                              item.progressPercent >= 80 ? 'bg-teal-500' :
                              item.progressPercent > 0 ? 'bg-blue-500' :
                              'bg-slate-300'
                            }`}
                            style={{ width: `${Math.min(100, item.progressPercent)}%` }}
                          ></div>
                        </div>

                        {/* Rakam Detayları */}
                        <div className="grid grid-cols-4 gap-1.5 text-[10px] text-center font-bold text-slate-600">
                          <div className="bg-slate-100/50 py-1 px-1 rounded-lg">
                            <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Sipariş</span>
                            <span className="font-extrabold text-slate-700">{item.orderQty}</span>
                          </div>
                          <div className="bg-slate-100/50 py-1 px-1 rounded-lg">
                            <span className="block text-[8px] text-slate-400 font-extrabold uppercase">Planlanan</span>
                            <span className={`font-extrabold ${item.plannedQty < item.orderQty ? 'text-amber-600 underline decoration-dotted' : 'text-slate-700'}`} title={item.plannedQty < item.orderQty ? "Sipariş miktarı henüz tamamen planlanmadı!" : undefined}>
                              {item.plannedQty}
                            </span>
                          </div>
                          <div className="bg-emerald-50/50 py-1 px-1 rounded-lg border border-emerald-100/50">
                            <span className="block text-[8px] text-emerald-600 font-extrabold uppercase">Üretilen</span>
                            <span className="font-extrabold text-emerald-700">{item.producedQty}</span>
                          </div>
                          <div className="bg-rose-50/50 py-1 px-1 rounded-lg border border-rose-100/50">
                            <span className="block text-[8px] text-rose-500 font-extrabold uppercase">Kalan</span>
                            <span className="font-extrabold text-rose-700">{item.remainingQty}</span>
                          </div>
                        </div>
                      </div>

                      {/* Sağ Taraf: Parti Numaraları */}
                      <div className="lg:col-span-3 space-y-1.5 lg:pl-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 h-full flex flex-col justify-center">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Package size={11} className="text-slate-400" />
                          <span>Üretilen Parti Numaraları</span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-[64px] overflow-y-auto pr-1">
                          {item.lots.length > 0 ? (
                            item.lots.map(lot => (
                              <span 
                                key={lot} 
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md tracking-wide font-mono transition-colors"
                              >
                                {lot}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[10px] font-semibold italic">
                              Henüz üretim girişi yapılmadı
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>

              {/* GÖSTER / GİZLE BUTONU */}
              {progressItems.length > 5 && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setShowAllProgress(!showAllProgress)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-xl transition-colors"
                  >
                    {showAllProgress ? (
                      <>
                        <span>Daha Az Göster</span>
                        <ChevronUp size={14} />
                      </>
                    ) : (
                      <>
                        <span>Tümünü Göster ({progressItems.length})</span>
                        <ChevronDown size={14} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CHARTS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Siparis Adetleri (Bar Chart) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Ürün Bazlı Sipariş Adetleri (Bugün & Yarın)</h4>
          <div className="h-[280px]">
            {metrics.productOrderChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Sipariş kaydı bulunmuyor
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.productOrderChartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  <Bar dataKey="Adet" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Hammadde İhtiyacı Dağılımı (Donut Chart) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Meyve-Sebze Brüt İhtiyaç Dağılımı (kg)</h4>
          <div className="h-[280px] flex flex-col sm:flex-row items-center justify-center">
            {metrics.rawMaterialRequirementChartData.length === 0 ? (
              <div className="text-xs text-slate-400">Hammadde ihtiyacı yok</div>
            ) : (
              <>
                <div className="w-full sm:w-1/2 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.rawMaterialRequirementChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {metrics.rawMaterialRequirementChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value} kg`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/2 flex flex-col gap-1.5 px-4 text-xs font-medium text-slate-600 overflow-y-auto max-h-[220px]">
                  {metrics.rawMaterialRequirementChartData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="truncate max-w-[120px]">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-slate-800">{entry.value} kg</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Ürün Bazlı Karlılık (Bar Chart) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Ürün Bazlı Karlılık Dağılımı</h4>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.profitabilityChartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                <Tooltip formatter={(value) => `${value} TL`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Maliyet" name="Toplam Maliyet" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar dataKey="Kar" name="Kâr Tutarı" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Haftalık Üretim & Sevkiyat Trendi (Bar Chart) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Haftalık Üretim & Sevkiyat Trendi</h4>
          <div className="h-[280px]">
            {!hasWeeklyData ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 bg-slate-50/50 rounded-xl py-12">
                <Package className="mx-auto text-slate-300 mb-2" size={24} />
                <span>Bu dönem için üretim/sevkiyat verisi yok</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyProductionAndShipmentData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} label={{ value: 'Miktar (Pkt)', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#94A3B8' } }} />
                  <Tooltip formatter={(value) => `${value} Pkt`} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Üretim" name="Üretim" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="Sevkiyat" name="Sevkiyat" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* TOP NEEDED RAW MATERIALS & TODAY PRODUCTION */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* TOP NEEDED MATERIALS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs xl:col-span-1">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">En Çok İhtiyaç Duyulan 5 Hammadde</h4>
          <p className="text-xs text-slate-500 mb-4">Üretim planı veya teslimatlar için brüt ihtiyaç miktarları.</p>
          <div className="space-y-3">
            {metrics.topRequiredMaterials.length === 0 ? (
              <div className="text-center text-xs py-10 text-slate-400 bg-slate-50 rounded-xl">
                Hammadde ihtiyacı bulunmuyor
              </div>
            ) : (
              metrics.topRequiredMaterials.map((r, i) => {
                const ratio = Math.min(100, (r.currentStock / r.grossRequirement) * 100);
                const isUnder = r.currentStock < r.grossRequirement;
                
                return (
                  <div key={r.rawMaterialId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{r.rawMaterialName}</span>
                      <span className="text-slate-500">
                        {formatWeight(r.grossRequirement, r.unit as any)} (Stok: {formatWeight(r.currentStock, r.unit as any)})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${isUnder ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${ratio}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <button 
            onClick={() => onNavigate('stock')}
            className="w-full mt-5 py-2 text-xs font-semibold text-center text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            Hammadde Stoğuna Git
          </button>
        </div>

        {/* TODAY PRODUCTION & TOMORROW SHIPPING */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs xl:col-span-2 space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Bugün Üretilecek Ürünler Listesi ({todayStr})</h4>
            <div className="overflow-x-auto">
              {metrics.todayProductionItems.length === 0 ? (
                <div className="text-center text-xs py-6 text-slate-400 bg-slate-50 rounded-xl">
                  Bugün için planlanan üretim bulunmuyor
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase font-semibold">
                      <th className="py-2">Ürün</th>
                      <th className="py-2">Müşteri</th>
                      <th className="py-2 text-right">Planlanan</th>
                      <th className="py-2 text-right">Üretilen</th>
                      <th className="py-2 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {metrics.todayProductionItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 font-medium text-slate-900">{item.productName}</td>
                        <td className="py-2.5 text-slate-500">{item.customerName}</td>
                        <td className="py-2.5 text-right font-bold">{item.plannedQuantity} Adet</td>
                        <td className="py-2.5 text-right font-bold text-emerald-600">{item.producedQuantity} Adet</td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.status === 'Tamamlandı' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            item.status === 'Eksik üretildi' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            item.status === 'Taslak' ? 'bg-slate-50 text-slate-700 border border-slate-200' :
                            'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Yarın Sevk Edilecek Ürünler Listesi ({getTomorrowISO()})</h4>
            <div className="overflow-x-auto">
              {metrics.tomorrowShipmentItems.length === 0 ? (
                <div className="text-center text-xs py-6 text-slate-400 bg-slate-50 rounded-xl">
                  Yarın sevk edilecek sipariş bulunmuyor
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase font-semibold">
                      <th className="py-2">Müşteri</th>
                      <th className="py-2">Ürün</th>
                      <th className="py-2 text-right">Miktar</th>
                      <th className="py-2 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {metrics.tomorrowShipmentItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 font-medium text-slate-900">{item.customerName}</td>
                        <td className="py-2.5 text-slate-500">{item.productName}</td>
                        <td className="py-2.5 text-right font-bold">{item.quantity} Adet</td>
                        <td className="py-2.5 text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.status === 'Sevk Edildi' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            item.status === 'Sevkiyata Hazır' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                            item.status === 'Kısmi Sevk' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
