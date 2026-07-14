import React, { useState } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (STOK HAREKETLERİ EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - RawMaterials -> Giriş/çıkış yapılacak hammadde kimlik bilgileri ve birimleri.
 *    - StockMovements (Stok Hareketleri) -> Sisteme girilen tüm hammadde giriş, çıkış ve fire fişleri.
 *    - CurrentStocks -> Her hammadde için anlık olarak hesaplanmış net stok miktarları.
 *    - Orders, OrderItems, Products, Recipes, ProductionPlans -> Gelecekteki siparişler ve planlar için hammadde ihtiyaçlarını tahmin etmek ve karşılaştırmak için kullanılır.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAddMovement -> Manuel veya otomatik stok girişi/çıkışı ekler.
 *    - onUpdateMovement -> Stok hareketi miktarını veya notunu günceller.
 *    - onDeleteMovement -> Yanlış girilen bir stok hareketini (soft-delete yöntemiyle) siler.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - stock_movements -> Her bir stok kaydı bu tabloya yazılır. `raw_material_id` üzerinden hammadde kartına bağlanır.
 *    - raw_materials -> Stok listelerinde hammadde isimleri ve kritik limitleri eşleştirmek için kullanılır.
 */
import { RawMaterial, StockMovement, StockMovementType, Order, OrderItem, Product, ProductRecipeItem, CostSettings, ProductionRun, FinishedGoodsStock, FinishedGoodsMovement } from '../../types';
import { calculateUnifiedRawMaterialNeeds, calculateWeightedAverageCost } from '../../services/calcService';
import { formatCurrency, formatWeight, formatDate, formatShortDate } from '../../utils/format';
import { Plus, Search, HelpCircle, History, Info, AlertTriangle, ArrowUpRight, ArrowDownLeft, Trash2, Edit2, Calendar, X, Sliders } from 'lucide-react';
import { getTodayISO, getTomorrowISO } from '../../utils/dateHelper';

interface StockViewProps {
  rawMaterials: RawMaterial[];
  stockMovements: StockMovement[];
  currentStocks: Record<string, number>;
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
  recipes: ProductRecipeItem[];
  costSettings: CostSettings;
  productionPlans: any[];
  productionPlanItems: any[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  onAddMovement: (mov: Omit<StockMovement, 'id' | 'createdAt'>) => void;
  onUpdateMovement: (id: string, updates: Partial<StockMovement>) => void;
  onDeleteMovement: (id: string) => void;
}

export default function StockView({
  rawMaterials,
  stockMovements,
  currentStocks,
  orders,
  orderItems,
  products,
  recipes,
  costSettings,
  productionPlans,
  productionPlanItems,
  productionRuns,
  finishedGoodsStocks,
  finishedGoodsMovements,
  onAddMovement,
  onUpdateMovement,
  onDeleteMovement
}: StockViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'movements'>('status');
  const [stockMovementPage, setStockMovementPage] = useState<number>(1);

  // Selected Stock Movement for Editing
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);

  // Form states - Stock Movement
  const [rawMaterialId, setRawMaterialId] = useState('');
  const [movementType, setMovementType] = useState<StockMovementType>('Stok Girişi');
  const [quantity, setQuantity] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [date, setDate] = useState(getTodayISO());
  const [note, setNote] = useState('');

  // Form states - Stock Correction
  const [correctionMaterialId, setCorrectionMaterialId] = useState('');
  const [currentRemaining, setCurrentRemaining] = useState<number>(0);
  const [newCorrectRemaining, setNewCorrectRemaining] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('Sayım Farkı');
  const [correctionDate, setCorrectionDate] = useState(getTodayISO());
  const [correctionNote, setCorrectionNote] = useState<string>('');

  const todayStr = getTodayISO();
  const tomorrowStr = getTomorrowISO();

  // Calculate gross requirements using unified central engine
  const todayReqs = calculateUnifiedRawMaterialNeeds({
    orders,
    orderItems,
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
    targetDate: todayStr,
    mode: "today_plan"
  });

  const tomorrowReqs = calculateUnifiedRawMaterialNeeds({
    orders,
    orderItems,
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
    targetDate: tomorrowStr,
    mode: "tomorrow_orders"
  });

  // Tomorrow calculation details for debugging/clarity
  const tomorrowOrdersFiltered = orders.filter(o => 
    !o.isDeleted &&
    o.deliveryDate === tomorrowStr && 
    o.approvalStatus === "Onaylandı" && 
    o.computedStatus !== "Sevk Edildi"
  );
  const tomorrowShipmentQuantity = tomorrowOrdersFiltered.reduce((sum, o) => {
    const items = orderItems.filter(i => !(i as any).isDeleted && i.orderId === o.id);
    return sum + items.reduce((s, i) => s + i.quantity, 0);
  }, 0);

  const tomorrowReadyQuantity = finishedGoodsStocks
    .filter(fg => !fg.isDeleted && fg.deliveryDate === tomorrowStr && fg.quantityRemaining > 0)
    .reduce((sum, fg) => sum + fg.quantityRemaining, 0);

  const tomorrowRemainingQuantity = Math.max(0, tomorrowShipmentQuantity - tomorrowReadyQuantity);

  // Generate Tomorrow's Stock Deficit Warnings
  const tomorrowWarnings: string[] = [];
  rawMaterials.forEach(rm => {
    const stock = currentStocks[rm.id] || 0;
    const reqTomorrow = tomorrowReqs.find(r => r.rawMaterialId === rm.id);
    const requiredGrossTomorrow = reqTomorrow ? reqTomorrow.grossRequirement : 0;

    if (requiredGrossTomorrow > 0 && stock < requiredGrossTomorrow) {
      const missing = requiredGrossTomorrow - stock;
      tomorrowWarnings.push(
        `Yarınki üretim için ${rm.name} eksik. Gerekli: ${formatWeight(requiredGrossTomorrow, rm.unit)}, Mevcut: ${formatWeight(stock, rm.unit)}, Eksik: ${formatWeight(missing, rm.unit)}.`
      );
    }
  });

  const handleSelectRawMaterial = (id: string) => {
    setRawMaterialId(id);
    const rm = rawMaterials.find(m => m.id === id);
    if (rm) {
      setUnitPrice(rm.purchasePrice.toString());
    } else {
      setUnitPrice('');
    }
  };

  const handleAddMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawMaterialId) {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (quantity === undefined || quantity === null || quantity.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert('Lütfen geçerli pozitif bir miktar girin.');
      return;
    }

    let priceNum = 0;
    const isIncoming = movementType === 'Stok Girişi' || movementType === 'Giriş';
    if (isIncoming) {
      if (unitPrice === undefined || unitPrice === null || unitPrice.trim() === '') {
        alert('Bu alan boş bırakılamaz.');
        return;
      }
      priceNum = parseFloat(unitPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        alert('Lütfen geçerli bir birim alış fiyatı girin.');
        return;
      }
    }

    onAddMovement({
      rawMaterialId,
      type: movementType,
      quantity: qtyNum,
      date,
      note,
      unitPrice: isIncoming ? priceNum : undefined,
      totalCost: isIncoming ? qtyNum * priceNum : undefined
    });

    setIsMovementModalOpen(false);
    setRawMaterialId('');
    setQuantity('');
    setUnitPrice('');
    setNote('');
  };

  // Open correction modal
  const handleOpenCorrection = (rm: RawMaterial) => {
    setCorrectionMaterialId(rm.id);
    setCurrentRemaining(currentStocks[rm.id] || 0);
    setNewCorrectRemaining((currentStocks[rm.id] || 0).toString());
    setCorrectionReason('Sene Sonu Sayımı');
    setCorrectionDate(getTodayISO());
    setCorrectionNote('');
    setIsCorrectionModalOpen(true);
  };

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCorrectRemaining === undefined || newCorrectRemaining === null || newCorrectRemaining.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const newQty = parseFloat(newCorrectRemaining);
    if (isNaN(newQty) || newQty < 0) {
      alert('Lütfen geçerli pozitif bir yeni doğru miktar girin.');
      return;
    }

    const difference = newQty - currentRemaining;
    if (difference === 0) {
      alert('Mevcut stok ile yeni girilen stok arasında fark bulunmuyor.');
      setIsCorrectionModalOpen(false);
      return;
    }

    // Sayım düzeltmesi creates a stock movement with "Sayım Düzeltmesi" type
    onAddMovement({
      rawMaterialId: correctionMaterialId,
      type: 'Sayım Düzeltmesi',
      quantity: difference, // difference can be positive or negative
      date: correctionDate,
      note: `Stok Sayım Düzeltmesi (${correctionReason}). Önceki: ${currentRemaining}, Yeni: ${newQty}. ${correctionNote}`
    });

    setIsCorrectionModalOpen(false);
  };

  // Open Edit Stock Movement Modal
  const handleOpenEditMovement = (mov: StockMovement) => {
    const isProductionRelated = mov.productionPlanItemId !== undefined && mov.productionPlanItemId !== null;
    if (isProductionRelated) {
      if (!confirm('Uygulama Uyarısı:\nBu hareket üretim tamamlamadan oluşmuş. Düzenleme üretim kayıtlarını etkileyebilir. Devam etmek istiyor musunuz?')) {
        return;
      }
    }

    setEditingMovement(mov);
    setRawMaterialId(mov.rawMaterialId);
    setMovementType(mov.type);
    setQuantity(mov.quantity.toString());
    setUnitPrice(mov.unitPrice !== undefined ? mov.unitPrice.toString() : '');
    setDate(mov.date);
    setNote(mov.note || '');
    setIsEditModalOpen(true);
  };

  const handleEditMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement) return;

    if (quantity === undefined || quantity === null || quantity.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const qtyNum = parseFloat(quantity);
    if (!rawMaterialId || isNaN(qtyNum) || qtyNum <= 0) {
      alert('Lütfen geçerli pozitif bir miktar girin.');
      return;
    }

    const isIncoming = movementType === 'Stok Girişi' || movementType === 'Giriş';
    let priceNum = 0;
    if (isIncoming) {
      if (unitPrice === undefined || unitPrice === null || unitPrice.trim() === '') {
        alert('Bu alan boş bırakılamaz.');
        return;
      }
      priceNum = parseFloat(unitPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        alert('Lütfen geçerli bir birim alış fiyatı girin.');
        return;
      }
    }

    onUpdateMovement(editingMovement.id, {
      rawMaterialId,
      type: movementType,
      quantity: qtyNum,
      date,
      note,
      unitPrice: isIncoming ? priceNum : undefined,
      totalCost: isIncoming ? qtyNum * priceNum : undefined
    });

    setIsEditModalOpen(false);
    setEditingMovement(null);
  };

  const handleDeleteMovement = (mov: StockMovement) => {
    const isProductionRelated = mov.productionPlanItemId !== undefined && mov.productionPlanItemId !== null;
    let confirmMsg = 'Bu stok hareket kaydını silmek istediğinize emin misiniz?';
    if (isProductionRelated) {
      confirmMsg = 'Uygulama Uyarısı:\nBu hareket üretim tamamlamadan oluşmuş. Silme işlemi üretim kayıtlarını etkileyebilir. Devam etmek istiyor musunuz?';
    }

    if (confirm(confirmMsg)) {
      onDeleteMovement(mov.id);
    }
  };

  const filteredMaterials = rawMaterials.filter(rm =>
    rm.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeMovements = stockMovements.filter(m => !m.isDeleted);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Hammadde Stok Kontrolü</h1>
          <p className="text-sm text-slate-500 mt-1">Hammadde stok seviyeleri, otomatik sipariş kontrolleri ve stok hareket kayıtları.</p>
        </div>
        <button
          onClick={() => {
            const activeMaterials = rawMaterials.filter(rm => rm.isActive);
            const defaultMaterial = activeMaterials[0] || rawMaterials[0];
            const defaultId = defaultMaterial ? defaultMaterial.id : '';
            setRawMaterialId(defaultId);
            setMovementType('Stok Girişi');
            setQuantity('10');
            setUnitPrice(defaultMaterial ? defaultMaterial.purchasePrice.toString() : '');
            setDate(todayStr);
            setNote('Satın alma girişi');
            setIsMovementModalOpen(true);
          }}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
        >
          <Plus size={16} />
          Stok Hareketi Ekle
        </button>
      </div>

      {/* TOMORROW STOCK DEFICIT WARNING BOARD */}
      {tomorrowWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="text-red-500" size={20} />
            <h3 className="text-xs font-bold uppercase tracking-wider">Yarınki Siparişler İçin Hammadde Eksikliği Tespit Edildi!</h3>
          </div>
          <div className="space-y-1.5 text-xs text-red-700 font-medium pl-7">
            {tomorrowWarnings.map((warn, i) => (
              <p key={i} className="list-item list-disc">
                {warn}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* TABS VIEW */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('status')}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'status' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Mevcut Stok Durumu
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'movements' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Stok Hareket Geçmişi
        </button>
      </div>

      {activeTab === 'status' ? (
        /* STATUS TABLE VIEW */
        <div className="space-y-4">
          {/* HESAP ÖZETİ BİLGİLENDİRME KARTLARI */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Yarınki Toplam Sipariş</span>
              <p className="text-sm font-bold text-slate-700">{tomorrowShipmentQuantity} Paket</p>
            </div>
            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-4 pt-2 sm:pt-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Hazır Nihai Ürün</span>
              <p className="text-sm font-bold text-emerald-600">{tomorrowReadyQuantity} Paket</p>
            </div>
            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-4 pt-2 sm:pt-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Kalan Üretilecek (İhtiyaca Esas)</span>
              <p className="text-sm font-bold text-amber-600">{tomorrowRemainingQuantity} Paket</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Hammadde adına göre süz..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                    <th className="py-3 px-4">Hammadde Adı</th>
                    <th className="py-3 px-4 text-right">Mevcut Stok</th>
                    <th className="py-3 px-4 text-right">Kritik Limit</th>
                    <th className="py-3 px-4 text-right">Son Alış Fiyatı</th>
                    <th className="py-3 px-4 text-right">Ortalama Maliyet</th>
                    <th className="py-3 px-4">Birim</th>
                    <th className="py-3 px-4">Stok Durumu</th>
                    <th className="py-3 px-4 text-right">Bugünkü İhtiyaç</th>
                    <th className="py-3 px-4 text-right">Yarınki İhtiyaç</th>
                    <th className="py-3 px-4 text-right">Sipariş Eksik Miktarı</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {filteredMaterials.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-slate-400 bg-white font-medium">
                        Sistemde kayıtlı hammadde bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    filteredMaterials.map((rm) => {
                      const stock = currentStocks[rm.id] || 0;
                      
                      const reqToday = todayReqs.find(r => r.rawMaterialId === rm.id);
                      const grossToday = reqToday ? reqToday.grossRequirement : 0;

                      const reqTomorrow = tomorrowReqs.find(r => r.rawMaterialId === rm.id);
                      const grossTomorrow = reqTomorrow ? reqTomorrow.grossRequirement : 0;

                      // Deficit relative to tomorrow: tomorrow gross - stock. Negative is 0.
                      const missingAmount = grossTomorrow > stock ? grossTomorrow - stock : 0;

                      let status: 'Yeterli' | 'Kritik' | 'Eksik' = 'Yeterli';
                      if (stock < grossTomorrow && grossTomorrow > 0) {
                        status = 'Eksik';
                      } else if (stock <= rm.criticalStockLevel) {
                        status = 'Kritik';
                      }

                      return (
                        <tr key={rm.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">{rm.name}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                            {formatWeight(stock, rm.unit)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-slate-400">
                            {formatWeight(rm.criticalStockLevel, rm.unit)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                            {formatCurrency(rm.purchasePrice)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                            {formatCurrency(rm.averageCost ?? calculateWeightedAverageCost(rm.id, activeMovements, rm.purchasePrice))}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">{rm.unit}</td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              status === 'Eksik' ? 'bg-red-50 text-red-700 border border-red-200' :
                              status === 'Kritik' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-slate-500">
                            {grossToday > 0 ? formatWeight(grossToday, rm.unit) : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-medium text-slate-500">
                            {grossTomorrow > 0 ? formatWeight(grossTomorrow, rm.unit) : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold">
                            {missingAmount > 0 ? (
                              <span className="text-red-600">
                                {formatWeight(missingAmount, rm.unit)} eksik
                              </span>
                            ) : (
                              <span className="text-emerald-600">Tam</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleOpenCorrection(rm)}
                              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer"
                              title="Stok Düzelt"
                            >
                              <Sliders size={11} />
                              Stok Düzelt
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* MOVEMENTS LOG VIEW */
        (() => {
          const STOCK_MOVEMENT_PAGE_SIZE = 50;
          const reversedMovements = [...activeMovements].sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : new Date(a.date).getTime();
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : new Date(b.date).getTime();
            return timeB - timeA;
          });
          const totalStockMovements = reversedMovements.length;
          const totalStockPages = Math.ceil(totalStockMovements / STOCK_MOVEMENT_PAGE_SIZE) || 1;
          const activeStockPage = Math.min(stockMovementPage, totalStockPages);
          const startIndex = (activeStockPage - 1) * STOCK_MOVEMENT_PAGE_SIZE;
          const paginatedMovements = reversedMovements.slice(startIndex, startIndex + STOCK_MOVEMENT_PAGE_SIZE);

          const pageNumbers = [];
          for (let i = 1; i <= totalStockPages; i++) {
            pageNumbers.push(i);
          }

          return (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="py-3 px-4">Tarih</th>
                        <th className="py-3 px-4">Hammadde</th>
                        <th className="py-3 px-4">Kayıt Tipi</th>
                        <th className="py-3 px-4 text-right">Miktar</th>
                        <th className="py-3 px-4 text-right">Birim Fiyat</th>
                        <th className="py-3 px-4 text-right">Toplam Tutar</th>
                        <th className="py-3 px-4">Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      {paginatedMovements.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-slate-400 font-medium bg-white">
                            Henüz stok hareketi kaydedilmemiş.
                          </td>
                        </tr>
                      ) : (
                        paginatedMovements.map((mov) => {
                          const rm = rawMaterials.find(m => m.id === mov.rawMaterialId);
                          
                          let typeColor = 'bg-slate-50 text-slate-700 border-slate-200';

                          if (mov.type === 'Stok Girişi' || mov.type === 'Giriş') {
                            typeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          } else if (mov.type === 'Stok Çıkışı' || mov.type === 'Çıkış') {
                            typeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                          } else if (mov.type === 'Fire Çıkışı' || mov.type === 'Fire') {
                            typeColor = 'bg-red-50 text-red-700 border-red-200';
                          } else if (mov.type === 'Sayım Düzeltmesi' || mov.type === 'Düzeltme') {
                            typeColor = 'bg-amber-50 text-amber-700 border-amber-200';
                          } else if (mov.type === 'Üretim Tüketimi' || mov.type === 'Üretim tüketimi') {
                            typeColor = 'bg-violet-50 text-violet-700 border-violet-200';
                          } else if (mov.type === 'Üretim Silme İadesi' || mov.type === 'Üretim Geri Alma') {
                            typeColor = 'bg-teal-50 text-teal-700 border-teal-200';
                          }

                          const isIncoming = mov.type === 'Stok Girişi' || mov.type === 'Giriş' || mov.type === 'Üretim Silme İadesi' || mov.type === 'Üretim Geri Alma';
                          const isOutgoing = mov.type === 'Stok Çıkışı' || mov.type === 'Çıkış' || mov.type === 'Fire Çıkışı' || mov.type === 'Fire' || mov.type === 'Üretim Tüketimi' || mov.type === 'Üretim tüketimi';

                          return (
                            <tr key={mov.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-500">{formatShortDate(mov.date)}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900">{rm?.name || 'Silinmiş Malzeme'}</td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeColor}`}>
                                  {mov.type}
                                </span>
                              </td>
                              <td className={`py-3 px-4 text-right font-bold ${
                                isIncoming ? 'text-emerald-600' : isOutgoing ? 'text-red-600' : 'text-slate-700'
                              }`}>
                                {isIncoming ? '+' : isOutgoing ? '-' : ''}{formatWeight(Math.abs(mov.quantity), rm?.unit as any)}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-600 font-medium">
                                {mov.unitPrice !== undefined && mov.unitPrice !== null ? formatCurrency(mov.unitPrice) : '-'}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-600 font-semibold">
                                {mov.totalCost !== undefined && mov.totalCost !== null ? formatCurrency(mov.totalCost) : '-'}
                              </td>
                              <td className="py-3 px-4 max-w-[240px] truncate text-slate-500">{mov.note}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalStockMovements > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 p-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-semibold">
                      Toplam <span className="font-bold text-slate-700">{totalStockMovements}</span> hareket
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStockMovementPage(prev => Math.max(prev - 1, 1))}
                        disabled={activeStockPage === 1}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Önceki
                      </button>
                      {pageNumbers.map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setStockMovementPage(page)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            activeStockPage === page
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setStockMovementPage(prev => Math.min(prev + 1, totalStockPages))}
                        disabled={activeStockPage === totalStockPages}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Sonraki
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold">
                      Sayfa {activeStockPage} / {totalStockPages}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* ADD STOCK MOVEMENT MODAL */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Stok Hareketi Ekle</h3>
              <button onClick={() => setIsMovementModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddMovementSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hammadde Seçin *</label>
                <select
                  required
                  value={rawMaterialId}
                  onChange={(e) => handleSelectRawMaterial(e.target.value)}
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                >
                  <option value="" disabled>Seçiniz</option>
                  {rawMaterials.filter(rm => rm.isActive).map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} [{rm.unit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hareket Tipi *</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as StockMovementType)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="Stok Girişi">Stok Girişi (Satın Alma)</option>
                    <option value="Stok Çıkışı">Stok Çıkışı (Kullanım)</option>
                    <option value="Fire Çıkışı">Fire Çıkışı (Zayiat)</option>
                    <option value="Sayım Düzeltmesi">Sayım Düzeltmesi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Miktar *</label>
                  <input
                    type="text"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Miktar"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {(movementType === 'Stok Girişi' || movementType === 'Giriş') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Birim Alış Fiyatı (TL) *</label>
                    <input
                      type="text"
                      required
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      placeholder="Birim fiyat"
                      className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Toplam Tutar</label>
                    <div className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 font-bold h-[34px] flex items-center">
                      {formatCurrency((parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kayıt Tarihi *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Açıklama / Referans</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Fatura no, sayımsal açıklama vb."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
                >
                  Hareketi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT STOCK MOVEMENT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Stok Hareketini Düzenle</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditMovementSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hammadde *</label>
                <select
                  required
                  value={rawMaterialId}
                  onChange={(e) => handleSelectRawMaterial(e.target.value)}
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                >
                  {rawMaterials.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} [{rm.unit}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hareket Tipi *</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as StockMovementType)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="Stok Girişi">Stok Girişi (Satın Alma)</option>
                    <option value="Stok Çıkışı">Stok Çıkışı (Kullanım)</option>
                    <option value="Fire Çıkışı">Fire Çıkışı (Zayiat)</option>
                    <option value="Sayım Düzeltmesi">Sayım Düzeltmesi</option>
                    <option value="Üretim Tüketimi" disabled>Üretim Tüketimi (Otomatik)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Miktar *</label>
                  <input
                    type="text"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Miktar"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {(movementType === 'Stok Girişi' || movementType === 'Giriş') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Birim Alış Fiyatı (TL) *</label>
                    <input
                      type="text"
                      required
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      placeholder="Birim fiyat"
                      className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Toplam Tutar</label>
                    <div className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 font-bold h-[34px] flex items-center">
                      {formatCurrency((parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kayıt Tarihi *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Açıklama / Referans</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Fatura no, açıklama vb."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingMovement(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
                >
                  Değişiklikleri Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOK DUZELT (STOCK CORRECTION) MODAL */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-800">
                <Sliders size={16} className="text-amber-500" />
                <h3 className="font-bold">Stok Düzelt (Sayım Farkı)</h3>
              </div>
              <button onClick={() => setIsCorrectionModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCorrectionSubmit} className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs space-y-1">
                <p className="font-bold">Fiziksel Sayım Düzeltmesi</p>
                <p>Mevcut sistemsel kalan miktar ile gerçek fiziksel miktar arasındaki fark otomatik olarak hesaplanıp "Sayım Düzeltmesi" olarak kaydedilecektir.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mevcut Sistem Stoğu</label>
                  <div className="w-full bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 font-bold h-[34px] flex items-center">
                    {formatWeight(currentRemaining, rawMaterials.find(r => r.id === correctionMaterialId)?.unit as any)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Yeni Doğru Stok (Fiziksel) *</label>
                  <input
                    type="text"
                    required
                    value={newCorrectRemaining}
                    onChange={(e) => setNewCorrectRemaining(e.target.value)}
                    placeholder="Gerçek kalan miktar"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Düzeltme Nedeni</label>
                  <select
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="Aylık Rutin Sayım">Aylık Rutin Sayım</option>
                    <option value="Sene Sonu Sayımı">Sene Sonu Sayımı</option>
                    <option value="Hasar / Bozulma">Hasar / Bozulma</option>
                    <option value="Giriş Hatası Düzeltme">Giriş Hatası Düzeltme</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Düzeltme Tarihi *</label>
                  <input
                    type="date"
                    required
                    value={correctionDate}
                    onChange={(e) => setCorrectionDate(e.target.value)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hesaplanan Fark Hareketi</label>
                <div className="w-full bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 h-[34px] flex items-center justify-between">
                  <span>Oluşacak düzeltme:</span>
                  <span className={`font-bold ${
                    (parseFloat(newCorrectRemaining) - currentRemaining) > 0 ? 'text-emerald-600' : 
                    (parseFloat(newCorrectRemaining) - currentRemaining) < 0 ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {(parseFloat(newCorrectRemaining) - currentRemaining) > 0 ? '+' : ''}
                    {isNaN(parseFloat(newCorrectRemaining)) ? '0' : formatWeight(parseFloat(newCorrectRemaining) - currentRemaining, rawMaterials.find(r => r.id === correctionMaterialId)?.unit as any)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Düzeltme Notu</label>
                <input
                  type="text"
                  value={correctionNote}
                  onChange={(e) => setCorrectionNote(e.target.value)}
                  placeholder="Eklemek istediğiniz özel not"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 cursor-pointer"
                >
                  Düzeltmeyi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
