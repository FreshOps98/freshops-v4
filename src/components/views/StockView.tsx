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
import { RawMaterial, StockMovement, StockMovementType, Order, OrderItem, Product, ProductRecipeItem, CostSettings, ProductionRun, FinishedGoodsStock, FinishedGoodsMovement, Supplier, RawMaterialReceipt, RawMaterialLot, CreateRawMaterialReceiptInput, RawMaterialReceiptLineInput, UpdateRawMaterialReceiptInput, UpdateRawMaterialReceiptResult, KunyeStatus } from '../../types';
import { calculateUnifiedRawMaterialNeeds, calculateWeightedAverageCost } from '../../services/calcService';
import { formatCurrency, formatWeight, formatDate, formatShortDate } from '../../utils/format';
import { Plus, Search, HelpCircle, History, Info, AlertTriangle, ArrowUpRight, ArrowDownLeft, Trash2, Edit2, Calendar, X, Sliders, Edit3 } from 'lucide-react';
import { getTodayISO, getTomorrowISO } from '../../utils/dateHelper';
import RawMaterialReceiptCorrectionModal from '../purchases/RawMaterialReceiptCorrectionModal';

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
  suppliers?: Supplier[];
  rawMaterialReceipts?: RawMaterialReceipt[];
  rawMaterialLots?: RawMaterialLot[];
  onCreateOrGetSupplier?: (name: string, note?: string) => Promise<{ supplierId: string; name: string; created: boolean }>;
  onCreateRawMaterialReceipt?: (input: CreateRawMaterialReceiptInput) => Promise<any>;
  onUpdateRawMaterialReceipt?: (input: UpdateRawMaterialReceiptInput) => Promise<UpdateRawMaterialReceiptResult>;
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
  onDeleteMovement,
  suppliers = [],
  rawMaterialReceipts = [],
  rawMaterialLots = [],
  onCreateOrGetSupplier,
  onCreateRawMaterialReceipt,
  onUpdateRawMaterialReceipt
}: StockViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReceiptCorrectionModalOpen, setIsReceiptCorrectionModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'movements' | 'purchase_history'>('status');
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

  // Form states - Purchase Entry / Receipt / Lot
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseSupplierName, setPurchaseSupplierName] = useState('');
  const [isCreatingNewSupplier, setIsCreatingNewSupplier] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(getTodayISO());
  const [purchaseInvoiceNumber, setPurchaseInvoiceNumber] = useState('');
  const [purchaseDispatchNoteNumber, setPurchaseDispatchNoteNumber] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<Array<{
    rawMaterialId: string;
    quantity: string;
    unitPrice: string;
    kunyeNumber: string;
    kunyeStatus: KunyeStatus;
    note: string;
  }>>([]);
  const [isPurchaseSubmitting, setIsPurchaseSubmitting] = useState(false);
  const [purchaseIdempotencyKey, setPurchaseIdempotencyKey] = useState('');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Master Detail Active Receipt State
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  // Fast lookups
  const supplierMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    (suppliers || []).forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [suppliers]);

  const rmMap = React.useMemo(() => {
    const map: Record<string, { name: string; unit: string }> = {};
    rawMaterials.forEach(rm => {
      map[rm.id] = { name: rm.name, unit: rm.unit };
    });
    return map;
  }, [rawMaterials]);

  // Memoized sorted receipts and safe selections
  const sortedReceipts = React.useMemo(() => {
    return [...(rawMaterialReceipts || [])].sort((a, b) => {
      const dateA = a.receiptDate || '';
      const dateB = b.receiptDate || '';
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      const createdA = a.createdAt || '';
      const createdB = b.createdAt || '';
      return createdB.localeCompare(createdA);
    });
  }, [rawMaterialReceipts]);

  const activeReceiptId = React.useMemo(() => {
    if (sortedReceipts.length === 0) return null;
    const exists = sortedReceipts.some(r => r.id === selectedReceiptId);
    if (!exists) return sortedReceipts[0].id;
    return selectedReceiptId;
  }, [sortedReceipts, selectedReceiptId]);

  const selectedReceipt = React.useMemo(() => {
    return sortedReceipts.find(r => r.id === activeReceiptId) || null;
  }, [sortedReceipts, activeReceiptId]);

  const selectedReceiptLots = React.useMemo(() => {
    if (!activeReceiptId) return [];
    return (rawMaterialLots || []).filter(lot => lot.rawMaterialReceiptId === activeReceiptId && !lot.isDeleted);
  }, [rawMaterialLots, activeReceiptId]);

  const handleOpenPurchaseModal = () => {
    setPurchaseSupplierId('');
    setPurchaseSupplierName('');
    setIsCreatingNewSupplier(false);
    setPurchaseDate(getTodayISO());
    setPurchaseInvoiceNumber('');
    setPurchaseDispatchNoteNumber('');
    setPurchaseNote('');
    const activeMaterials = rawMaterials.filter(rm => rm.isActive);
    const firstMaterial = activeMaterials[0];
    const isFruitOrVeg = firstMaterial ? (firstMaterial.category === 'Meyve' || firstMaterial.category === 'Sebze') : false;
    setPurchaseLines([{ 
      rawMaterialId: firstMaterial?.id || '', 
      quantity: '10', 
      unitPrice: firstMaterial?.purchasePrice?.toString() || '0', 
      kunyeNumber: '', 
      kunyeStatus: isFruitOrVeg ? 'provided' : 'not_applicable',
      note: '' 
    }]);
    setPurchaseIdempotencyKey(`purchase-ui-${crypto.randomUUID()}`);
    setPurchaseError(null);
    setIsPurchaseModalOpen(true);
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPurchaseError(null);

    if (!onCreateOrGetSupplier || !onCreateRawMaterialReceipt) {
      setPurchaseError("Satın alma servisi kullanılamıyor.");
      return;
    }

    let finalSupplierId = purchaseSupplierId;
    if (isCreatingNewSupplier) {
      if (!purchaseSupplierName.trim()) {
        setPurchaseError('Lütfen tedarikçi adı girin.');
        return;
      }
    } else {
      if (!finalSupplierId) {
        setPurchaseError('Lütfen bir tedarikçi seçin.');
        return;
      }
    }

    if (!purchaseInvoiceNumber.trim() && !purchaseDispatchNoteNumber.trim()) {
      setPurchaseError('Fatura numarası veya sevk irsaliyesi numarasından en az biri dolu olmalıdır.');
      return;
    }

    if (purchaseLines.length === 0) {
      setPurchaseError('En az bir hammadde satırı eklemelisiniz.');
      return;
    }

    for (let i = 0; i < purchaseLines.length; i++) {
      const line = purchaseLines[i];
      if (!line.rawMaterialId) {
        setPurchaseError(`${i + 1}. satırda hammadde seçilmemiş.`);
        return;
      }
      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) {
        setPurchaseError(`${i + 1}. satırda miktar pozitif bir sayı olmalıdır.`);
        return;
      }
      const price = parseFloat(line.unitPrice);
      if (isNaN(price) || price < 0) {
        setPurchaseError(`${i + 1}. satırda birim fiyat sıfır veya pozitif bir sayı olmalıdır.`);
        return;
      }
      if (line.kunyeStatus !== 'not_applicable' && !line.kunyeNumber.trim()) {
        setPurchaseError(`${i + 1}. satırda künye numarası zorunludur.`);
        return;
      }
    }

    setIsPurchaseSubmitting(true);

    try {
      if (isCreatingNewSupplier && onCreateOrGetSupplier) {
        const supRes = await onCreateOrGetSupplier(purchaseSupplierName.trim(), 'Satın alma girişi sırasında otomatik oluşturuldu.');
        finalSupplierId = supRes.supplierId;
      }

      const mappedLines: RawMaterialReceiptLineInput[] = purchaseLines.map(line => ({
        raw_material_id: line.rawMaterialId,
        quantity: parseFloat(line.quantity),
        unit_price: parseFloat(line.unitPrice),
        kunye_number: line.kunyeStatus === 'not_applicable' ? null : (line.kunyeNumber.trim() || null),
        kunye_status: line.kunyeStatus,
        note: line.note.trim() || null
      }));

      if (onCreateRawMaterialReceipt) {
        await onCreateRawMaterialReceipt({
          supplierId: finalSupplierId,
          receiptDate: purchaseDate,
          lines: mappedLines,
          idempotencyKey: purchaseIdempotencyKey,
          invoiceNumber: purchaseInvoiceNumber.trim() || undefined,
          dispatchNoteNumber: purchaseDispatchNoteNumber.trim() || undefined,
          note: purchaseNote.trim() || undefined
        });
      }

      setIsPurchaseModalOpen(false);
    } catch (err: any) {
      console.error("Purchase submission error:", err);
      setPurchaseError(err.message || 'Satın alma girişi sırasında beklenmeyen bir hata oluştu.');
    } finally {
      setIsPurchaseSubmitting(false);
    }
  };

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
    if (movementType === 'Stok Girişi' || movementType === 'Giriş') {
      alert("Satın alma kaynaklı stok girişleri Satın Alma Girişi ekranından kaydedilmelidir.");
      return;
    }

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
    const isBoundToLot = (rawMaterialLots || []).some(lot => lot.inboundStockMovementId === mov.id);
    if (isBoundToLot) {
      alert("Lot ile bağlı satın alma hareketleri manuel olarak değiştirilemez.");
      return;
    }

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
    const wasIncoming = editingMovement.type === 'Stok Girişi' || editingMovement.type === 'Giriş';
    if (isIncoming && !wasIncoming) {
      alert("Satın alma kaynaklı stok girişleri Satın Alma Girişi ekranından kaydedilmelidir.");
      return;
    }

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
    const isBoundToLot = (rawMaterialLots || []).some(lot => lot.inboundStockMovementId === mov.id);
    if (isBoundToLot) {
      alert("Lot ile bağlı satın alma hareketleri manuel olarak değiştirilemez.");
      return;
    }

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
        <div className="flex gap-2">
          <button
            onClick={handleOpenPurchaseModal}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer border border-indigo-700/20"
          >
            <Plus size={16} />
            Satın Alma Girişi
          </button>
          <button
            onClick={() => {
              const activeMaterials = rawMaterials.filter(rm => rm.isActive);
              const defaultMaterial = activeMaterials[0] || rawMaterials[0];
              const defaultId = defaultMaterial ? defaultMaterial.id : '';
              setRawMaterialId(defaultId);
              setMovementType('Stok Çıkışı');
              setQuantity('10');
              setUnitPrice('');
              setDate(todayStr);
              setNote('');
              setIsMovementModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={16} />
            Diğer Stok Hareketi
          </button>
        </div>
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
        <button
          onClick={() => {
            setActiveTab('purchase_history');
            if (rawMaterialReceipts.length > 0 && !selectedReceiptId) {
              setSelectedReceiptId(rawMaterialReceipts[0].id);
            }
          }}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'purchase_history' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Satın Alma / Lot Geçmişi
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
      ) : activeTab === 'movements' ? (
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
      ) : (
        /* PURCHASE / LOT HISTORY VIEW */
        sortedReceipts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 font-medium font-sans">
            Kayıtlı satın alma fişi bulunmamaktadır.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans">
            {/* Left Master List */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden max-h-[700px] overflow-y-auto divide-y divide-slate-100">
              <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-700">Satın Alma Fişleri</h4>
              </div>
              {sortedReceipts.map((receipt) => {
                const isSelected = receipt.id === activeReceiptId;
                const supplierName = supplierMap[receipt.supplierId] || 'Bilinmeyen Tedarikçi';
                return (
                  <div
                    key={receipt.id}
                    onClick={() => setSelectedReceiptId(receipt.id)}
                    className={`p-4 text-left cursor-pointer transition-all hover:bg-slate-50 ${
                      isSelected ? 'bg-indigo-50/50 border-l-4 border-indigo-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{formatDate(receipt.receiptDate)}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded font-bold">
                        {receipt.id.substring(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-1">{supplierName}</div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-slate-500 font-semibold">
                      <div>Fatura: {receipt.invoiceNumber || '-'}</div>
                      <div>İrsaliye: {receipt.dispatchNoteNumber || '-'}</div>
                    </div>
                    {receipt.note && (
                      <div className="text-[10px] text-slate-400 italic mt-1.5 truncate">
                        {receipt.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Detail Panel */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
              {selectedReceipt ? (
                <>
                  <div className="border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Satın Alma Detayları</h4>
                      <div className="flex items-center gap-2">
                        {onUpdateRawMaterialReceipt && (
                          <button
                            type="button"
                            onClick={() => setIsReceiptCorrectionModalOpen(true)}
                            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-indigo-100 transition-colors cursor-pointer"
                          >
                            <Edit3 size={12} />
                            <span>Fişi Düzenle</span>
                          </button>
                        )}
                        <span className="text-xs font-mono text-slate-400 font-semibold">{selectedReceipt.id}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-semibold">
                      Tedarikçi: <span className="font-bold text-slate-800">{supplierMap[selectedReceipt.supplierId] || 'Bilinmeyen Tedarikçi'}</span>
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Partiler / Lotlar ({selectedReceiptLots.length})</h5>
                    {selectedReceiptLots.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 font-medium text-xs">
                        Bu fişe bağlı lot kaydı bulunmuyor.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedReceiptLots.map((lot) => {
                          const rmInfo = rmMap[lot.rawMaterialId] || { name: 'Silinmiş Hammadde', unit: '' };
                          return (
                            <div key={lot.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900">{rmInfo.name}</span>
                                <span className="text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-lg">
                                  {lot.internalLotNo}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Künye Türü</span>
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                                    lot.kunyeStatus === 'provided'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : lot.kunyeStatus === 'internal_placeholder'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                        : 'bg-slate-50 text-slate-600 border border-slate-100'
                                  }`}>
                                    {lot.kunyeStatus === 'provided' ? 'Gerçek Künye' : lot.kunyeStatus === 'internal_placeholder' ? 'Dahili / Dummy Künye' : 'Künye Gerekmiyor'}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Künye No / Kodu</span>
                                  <span className="font-mono font-bold text-slate-800">{lot.kunyeNumber || '-'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Birim Fiyat</span>
                                  <span className="font-bold text-slate-700">{formatCurrency(lot.unitPrice)}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Kabul Miktarı</span>
                                  <span className="font-bold text-slate-800">{formatWeight(lot.quantityReceived, rmInfo.unit)}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Kalan Stok</span>
                                  <span className={`font-extrabold ${lot.quantityRemaining > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {formatWeight(lot.quantityRemaining, rmInfo.unit)}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Toplam Tutar</span>
                                  <span className="font-bold text-slate-900">{formatCurrency(lot.quantityReceived * lot.unitPrice)}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 font-semibold">
                                <div>Hareket ID: <span className="font-mono">{lot.inboundStockMovementId}</span></div>
                                {lot.note && (
                                  <div className="italic text-slate-400">Not: {lot.note}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-400 font-medium">
                  Lütfen detayını görmek istediğiniz satın alma fişini seçin.
                </div>
              )}
            </div>
          </div>
        )
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
                    <option value="Stok Çıkışı">Stok Çıkışı</option>
                    <option value="Fire Çıkışı">Fire Çıkışı</option>
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

      {/* PURCHASE ENTRY (SATIN ALMA GİRİŞİ) MODAL */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-4xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Yeni Satın Alma Girişi ve Lot Tanımlama</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5 font-mono select-all">Benzersiz Talep Anahtarı: {purchaseIdempotencyKey}</p>
              </div>
              <button 
                onClick={() => {
                  if (!isPurchaseSubmitting) {
                    setIsPurchaseModalOpen(false);
                  }
                }} 
                disabled={isPurchaseSubmitting}
                className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handlePurchaseSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
              {purchaseError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <span>{purchaseError}</span>
                </div>
              )}

              {/* Tedarikçi Bilgileri */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold text-slate-700">Tedarikçi Seçimi / Tanımı</h4>
                  <div className="flex bg-slate-200 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewSupplier(false)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                        !isCreatingNewSupplier ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/55'
                      }`}
                    >
                      Kayıtlı Tedarikçi
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewSupplier(true)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                        isCreatingNewSupplier ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/55'
                      }`}
                    >
                      Yeni Tedarikçi Yarat
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isCreatingNewSupplier ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Yeni Tedarikçi Adı *</label>
                      <input
                        type="text"
                        required
                        value={purchaseSupplierName}
                        onChange={(e) => setPurchaseSupplierName(e.target.value)}
                        placeholder="Örn: Taze Gıda Ltd. Şti."
                        className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Tedarikçi Seçin *</label>
                      <select
                        required
                        value={purchaseSupplierId}
                        onChange={(e) => setPurchaseSupplierId(e.target.value)}
                        className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">Seçiniz...</option>
                        {(suppliers || []).map(sup => (
                          <option key={sup.id} value={sup.id}>{sup.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Satın Alma Giriş Tarihi *</label>
                    <input
                      type="date"
                      required
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Belge & Fiş Bilgileri */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fatura Numarası</label>
                  <input
                    type="text"
                    value={purchaseInvoiceNumber}
                    onChange={(e) => setPurchaseInvoiceNumber(e.target.value)}
                    placeholder="E-Fatura veya Seri No"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Sevk İrsaliye Numarası</label>
                  <input
                    type="text"
                    value={purchaseDispatchNoteNumber}
                    onChange={(e) => setPurchaseDispatchNoteNumber(e.target.value)}
                    placeholder="İrsaliye No"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Genel Fiş Açıklaması</label>
                  <input
                    type="text"
                    value={purchaseNote}
                    onChange={(e) => setPurchaseNote(e.target.value)}
                    placeholder="Ek açıklama veya not..."
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Hammadde Giriş Kalemleri */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-700">Satın Alınan Hammaddeler & Kalemler</h4>
                  <button
                    type="button"
                    onClick={() => {
                      const activeMaterials = rawMaterials.filter(rm => rm.isActive);
                      const firstMaterial = activeMaterials[0];
                      const isFruitOrVeg = firstMaterial ? (firstMaterial.category === 'Meyve' || firstMaterial.category === 'Sebze') : false;
                      setPurchaseLines([
                        ...purchaseLines,
                        {
                          rawMaterialId: firstMaterial?.id || '',
                          quantity: '10',
                          unitPrice: firstMaterial?.purchasePrice?.toString() || '0',
                          kunyeNumber: '',
                          kunyeStatus: isFruitOrVeg ? 'provided' : 'not_applicable',
                          note: ''
                        }
                      ]);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                  >
                    + Yeni Satır Ekle
                  </button>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                  {purchaseLines.map((line, idx) => {
                    const selectedRM = rawMaterials.find(r => r.id === line.rawMaterialId);
                    const rmUnit = selectedRM?.unit || '';
                    const isFruitOrVeg = selectedRM ? (selectedRM.category === 'Meyve' || selectedRM.category === 'Sebze') : false;

                    return (
                      <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-end font-sans">
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Hammadde *</label>
                          <select
                            required
                            value={line.rawMaterialId}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              updated[idx].rawMaterialId = e.target.value;
                              const rm = rawMaterials.find(r => r.id === e.target.value);
                              if (rm) {
                                updated[idx].unitPrice = rm.purchasePrice.toString();
                                const isFruitOrVeg = rm.category === 'Meyve' || rm.category === 'Sebze';
                                updated[idx].kunyeStatus = isFruitOrVeg ? 'provided' : 'not_applicable';
                                updated[idx].kunyeNumber = '';
                              }
                              setPurchaseLines(updated);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                          >
                            <option value="" disabled>Hammadde Seçin</option>
                            {rawMaterials.filter(rm => rm.isActive).map(rm => (
                              <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Miktar ({rmUnit || 'Birim'}) *</label>
                          <input
                            type="text"
                            required
                            value={line.quantity}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              updated[idx].quantity = e.target.value;
                              setPurchaseLines(updated);
                            }}
                            placeholder="Miktar"
                            className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                          />
                        </div>

                        <div className="md:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Birim Fiyat *</label>
                          <input
                            type="text"
                            required
                            value={line.unitPrice}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              updated[idx].unitPrice = e.target.value;
                              setPurchaseLines(updated);
                            }}
                            placeholder="Fiyat"
                            className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Künye Türü *</label>
                          <select
                            required
                            value={line.kunyeStatus}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              const newStatus = e.target.value as KunyeStatus;
                              updated[idx].kunyeStatus = newStatus;
                              if (newStatus === 'not_applicable') {
                                updated[idx].kunyeNumber = '';
                              }
                              setPurchaseLines(updated);
                            }}
                            className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                          >
                            <option value="provided">Gerçek Künye</option>
                            <option value="internal_placeholder">Dahili / Dummy</option>
                            {!isFruitOrVeg && (
                              <option value="not_applicable">Künye Gerekmiyor</option>
                            )}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Künye No / Kodu *</label>
                          <input
                            type="text"
                            required={line.kunyeStatus !== 'not_applicable'}
                            disabled={line.kunyeStatus === 'not_applicable'}
                            value={line.kunyeStatus === 'not_applicable' ? '' : line.kunyeNumber}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              updated[idx].kunyeNumber = e.target.value;
                              setPurchaseLines(updated);
                            }}
                            placeholder={line.kunyeStatus === 'not_applicable' ? 'Gerekmiyor' : 'Künye girin'}
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none font-mono ${
                              line.kunyeStatus === 'not_applicable'
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          />
                        </div>

                        <div className="md:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Satır Açıklaması</label>
                          <input
                            type="text"
                            value={line.note}
                            onChange={(e) => {
                              const updated = [...purchaseLines];
                              updated[idx].note = e.target.value;
                              setPurchaseLines(updated);
                            }}
                            placeholder="Detaylar..."
                            className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                          />
                        </div>

                        <div className="md:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (purchaseLines.length > 1) {
                                setPurchaseLines(purchaseLines.filter((_, i) => i !== idx));
                              }
                            }}
                            disabled={purchaseLines.length <= 1}
                            className="text-xs text-rose-500 hover:text-rose-700 disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded hover:bg-rose-50 cursor-pointer"
                            title="Satırı Sil"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Toplam Bilgi ve Alt Butonlar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-4 gap-4 shrink-0 font-sans">
                <div className="text-xs text-slate-500">
                  Toplam Tutar:{' '}
                  <span className="font-bold text-slate-800 text-sm">
                    {formatCurrency(
                      purchaseLines.reduce((sum, line) => {
                        const q = parseFloat(line.quantity) || 0;
                        const p = parseFloat(line.unitPrice) || 0;
                        return sum + q * p;
                      }, 0)
                    )}
                  </span>
                </div>

                <div className="flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsPurchaseModalOpen(false)}
                    disabled={isPurchaseSubmitting}
                    className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    İptal Et
                  </button>
                  <button
                    type="submit"
                    disabled={isPurchaseSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPurchaseSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Kaydediliyor...</span>
                      </>
                    ) : (
                      <span>Satın Alma Girişini Tamamla</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isReceiptCorrectionModalOpen && onUpdateRawMaterialReceipt && (
        <RawMaterialReceiptCorrectionModal
          isOpen={isReceiptCorrectionModalOpen}
          onClose={() => setIsReceiptCorrectionModalOpen(false)}
          receipt={selectedReceipt}
          lots={rawMaterialLots}
          rawMaterials={rawMaterials}
          onUpdateReceipt={onUpdateRawMaterialReceipt}
        />
      )}
    </div>
  );
}
