import React, { useState, useRef } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (ÜRETİM PLANLAMA EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - ProductionPlans (Üretim Planları) & Items (Plan Kalemleri) -> Günlük veya periyodik üretim hedefleri.
 *    - Orders & OrderItems -> Plana bağlanmış orijinal müşteri siparişleri ve miktarları.
 *    - Customers & Products -> Plana konu olan müşteri ve ürün kimlik detayları.
 *    - Recipes & RawMaterials -> Plan bazında hammadde ihtiyaçlarını (reçete patlatma) hesaplamak için kullanılır.
 *    - StockMovements -> Plan için depoda yeterli hammadde var mı kontrolü (stok müsaitliği analizi).
 *    - ProductionRuns -> Gerçekleşen üretim emirleri ve hammadde düşüm geçmişi.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAddPlan -> Yeni bir üretim günü/plajı ve ilişkili alt kalemleri ekler.
 *    - onUpdatePlan -> Plan detaylarını günceller (örneğin kilit açma, kapatma vb.).
 *    - onUpdatePlanItemStatus -> Plan satırının (Bekliyor, Üretimde, Tamamlandı) durumunu tetikler.
 *    - onCreateProductionRun -> Plana ait bir üründen gerçekleşen fiili üretim miktarını kaydeder (Stok hammadde düşümünü de tetikler).
 *    - onDeleteProductionRun -> Gerçekleşen hatalı bir üretimi iptal eder (hammadde stokunu geri iade eder).
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - production_plans -> Planın üst bilgilerini tutar.
 *    - production_plan_items -> Planda yer alan her bir ürün/sipariş satırı bu tabloya referanslanır.
 *    - production_runs -> Gerçekleşen üretim miktarları ve stok hareket ilişkileri bu tabloda izlenir.
 */
import { 
  Order, 
  OrderItem, 
  Customer, 
  Product, 
  ProductRecipeItem, 
  RawMaterial, 
  CostSettings, 
  ProductionPlan, 
  ProductionPlanItem, 
  ProductionPlanStatus,
  StockMovement,
  ProductionRun,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  CloseProductionPlanAction
} from '../../types';
import { 
  calculateProductionPlanRequirements,
  calculateRemainingRequirementsForProductionPlan,
  calculateStockAvailability,
  getOrderItemProducedQuantity,
  getOrderItemPlannedQuantity,
  getOrderItemRemainingToPlan,
  getOrderItemRemainingToProduce,
  getOrderItemFinishedGoodsQuantity,
  getOrderItemShippedQuantity,
  getProductionRunsForPlanItem,
  getProducedQuantityForPlanItem,
  getRemainingQuantityForPlanItem,
  isProductionPlanClosed,
  getOrderDisplayNumber,
  calculateRequirementsForProducedQuantity
} from '../../services/calcService';
import { formatCurrency, formatWeight, formatDate, formatShortDate } from '../../utils/format';
import { getTodayISO, getTomorrowISO, parseISODateSafe, addDaysISO } from '../../utils/dateHelper';
import { supabaseDataService } from '../../services/supabaseDataService';
import { ProductionTraceabilityModal } from '../traceability/ProductionTraceabilityModal';
import { ProductionTraceabilityResponse } from '../../types';
import { 
  Plus, 
  Calendar, 
  ClipboardList, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  Layers, 
  Package, 
  Clock,
  Filter,
  Check,
  X,
  Trash2,
  Info
} from 'lucide-react';

interface ProductionPlanViewProps {
  productionPlans: ProductionPlan[];
  productionPlanItems: ProductionPlanItem[];
  orders: Order[];
  orderItems: OrderItem[];
  customers: Customer[];
  products: Product[];
  recipes: ProductRecipeItem[];
  rawMaterials: RawMaterial[];
  currentStocks: Record<string, number>;
  costSettings: CostSettings;
  stockMovements: StockMovement[];
  productionRuns: ProductionRun[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  onAddPlan: (plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]) => void;
  onUpdatePlan: (id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]) => void;
  onUpdatePlanItemStatus: (itemId: string, status: ProductionPlanStatus, producedQuantity: number, note?: string) => void;
  onCreateProductionRun: (productionPlanItemId: string, producedQuantity: number, note?: string) => boolean | Promise<boolean>;
  onDeleteProductionRun?: (runId: string) => void;
  onDeleteProductionPlanItem?: (itemId: string) => boolean | Promise<boolean>;
  onUndoProductionRun?: (runId: string, reason?: string) => Promise<boolean>;
  onAddOrderItemToPlan?: (productionPlanId: string, orderId: string, orderItemId: string, productId: string, plannedQuantity: number, unit?: string) => Promise<any>;
  onClosePlanAndCarryOver?: (sourcePlanId: string, actions: CloseProductionPlanAction[]) => Promise<any>;
}

export default function ProductionPlanView({
  productionPlans,
  productionPlanItems,
  orders,
  orderItems,
  customers,
  products,
  recipes,
  rawMaterials,
  currentStocks,
  costSettings,
  stockMovements,
  productionRuns,
  finishedGoodsStocks,
  finishedGoodsMovements,
  onAddPlan,
  onUpdatePlan,
  onUpdatePlanItemStatus,
  onCreateProductionRun,
  onDeleteProductionRun,
  onDeleteProductionPlanItem,
  onUndoProductionRun,
  onAddOrderItemToPlan,
  onClosePlanAndCarryOver
}: ProductionPlanViewProps) {
  // State for production date selection
  const [selectedProductionDate, setSelectedProductionDate] = useState(getTodayISO()); // Default to today
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // States for "Üretime Eklenebilir Siparişler" Filters
  const [activeMainFilter, setActiveMainFilter] = useState<'all' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'overdue'>('all');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterDeliveryStartDate, setFilterDeliveryStartDate] = useState('');
  const [filterDeliveryEndDate, setFilterDeliveryEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOnlyRemaining, setFilterOnlyRemaining] = useState(true);

  // Raw inputs for eklenecek adet inside rows
  const [addQuantities, setAddQuantities] = useState<Record<string, string>>({});

  // Input states for item produced quantity and status modification
  const [editingProducedQty, setEditingProducedQty] = useState<Record<string, string>>({});
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [productionErrors, setProductionErrors] = useState<Record<string, string>>({});

  // Helper to calculate stock availability details dynamically for an entered quantity
  const getStockWarningDetails = (pi: ProductionPlanItem) => {
    const rawQty = editingProducedQty[pi.id];
    if (rawQty === undefined || rawQty.trim() === '') return null;
    const qty = Number(rawQty);
    if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return null;

    const orderItem = orderItems.find(oi => oi.id === pi.orderItemId);
    const requirements = calculateRequirementsForProducedQuantity(
      pi.productId,
      qty,
      orderItem,
      products,
      recipes,
      rawMaterials,
      costSettings,
      stockMovements
    );

    let isStockInsufficient = false;
    for (const req of requirements) {
      const currentStock = currentStocks[req.rawMaterialId] || 0;
      if (currentStock < req.grossRequirement) {
        isStockInsufficient = true;
        break;
      }
    }

    if (!isStockInsufficient) return null;

    // Calculate requirements for exactly 1 unit to find the unit gross requirement
    const requirementsForOne = calculateRequirementsForProducedQuantity(
      pi.productId,
      1,
      orderItem,
      products,
      recipes,
      rawMaterials,
      costSettings,
      stockMovements
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

    const missingQuantity = qty - maxProducible;
    const missingMaterials: { name: string; missingAmount: number; unit: string }[] = [];

    for (const req of requirements) {
      const currentStock = currentStocks[req.rawMaterialId] || 0;
      if (currentStock < req.grossRequirement) {
        const rm = rawMaterials.find(m => m.id === req.rawMaterialId);
        const rmName = rm ? rm.name : req.rawMaterialName;
        const missingAmount = req.grossRequirement - currentStock;
        missingMaterials.push({
          name: rmName,
          missingAmount,
          unit: req.unit
        });
      }
    }

    return {
      maxProducible,
      missingQuantity,
      missingMaterials
    };
  };

  // Modal states for closing plan and handling carryovers
  const [showClosePlanModal, setShowClosePlanModal] = useState(false);
  const [showClosePlanConfirmModal, setShowClosePlanConfirmModal] = useState(false);
  const [closePlanItemOptions, setClosePlanItemOptions] = useState<Record<string, {
    action: 'tomorrow' | 'custom' | 'none';
    customDate: string;
    carryQty: number;
    itemId: string;
    productId: string;
    orderId: string;
    orderItemId: string;
    customerId: string;
    note: string;
  }>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const closePlanRequestInFlightRef = useRef(false);

  // Delete item modal states
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);

  // Delete production run modal states
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [showDeleteRunModal, setShowDeleteRunModal] = useState(false);

  // Undo production run modal states
  const [undoProductionRunTarget, setUndoProductionRunTarget] = useState<ProductionRun | null>(null);
  const [undoProductionRunReason, setUndoProductionRunReason] = useState<string>('Kullanıcı tarafından geri alındı');
  const [isUndoProductionRunModalOpen, setIsUndoProductionRunModalOpen] = useState(false);
  const [isUndoingProductionRun, setIsUndoingProductionRun] = useState(false);
  const [undoProductionRunError, setUndoProductionRunError] = useState<string | null>(null);

  // Traceability Modal states
  const [isTraceabilityModalOpen, setIsTraceabilityModalOpen] = useState(false);
  const [isTraceabilityLoading, setIsTraceabilityLoading] = useState(false);
  const [traceabilityError, setTraceabilityError] = useState<string | null>(null);
  const [traceabilityData, setTraceabilityData] = useState<ProductionTraceabilityResponse | null>(null);
  const [traceabilityActiveId, setTraceabilityActiveId] = useState<string | null>(null);
  const traceabilityRequestCounterRef = useRef(0);

  React.useEffect(() => {
    return () => {
      traceabilityRequestCounterRef.current += 1;
    };
  }, []);

  const handleOpenProductionTraceability = async (runId: string) => {
    traceabilityRequestCounterRef.current += 1;
    const currentRequestToken = traceabilityRequestCounterRef.current;

    // Clear previous data and show loading in open modal immediately
    setTraceabilityData(null);
    setTraceabilityError(null);
    setTraceabilityActiveId(runId);
    setIsTraceabilityLoading(true);
    setIsTraceabilityModalOpen(true);

    try {
      const result = await supabaseDataService.getProductionRunTraceabilityAtomic(runId);
      // Ensure we only process if this is still the active request
      if (currentRequestToken === traceabilityRequestCounterRef.current) {
        setTraceabilityData(result);
        setIsTraceabilityLoading(false);
      }
    } catch (err: unknown) {
      console.error("Traceability fetch error:", err);
      if (currentRequestToken === traceabilityRequestCounterRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' &&
                err !== null &&
                'message' in err
              ? String((err as { message?: unknown }).message || 'İzlenebilirlik bilgileri yüklenemedi.')
              : 'İzlenebilirlik bilgileri yüklenemedi.';
        setTraceabilityError(message);
        setIsTraceabilityLoading(false);
      }
    }
  };

  // Functions for confirming/opening delete confirmations
  const openDeleteProductionPlanItemConfirm = (itemId: string) => {
    const item = productionPlanItems.find(pi => pi.id === itemId);
    if (!item) {
      alert("Silinecek üretim kalemi bulunamadı.");
      return;
    }
    const plan = productionPlans.find(p => p.id === item.productionPlanId);
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için üretim kalemleri silinemez.");
      return;
    }

    // Check if there are active production runs
    const activeRuns = productionRuns.filter(r => r.productionPlanItemId === itemId && !r.isDeleted);
    if (activeRuns.length > 0) {
      alert("Bu üretim kaleminde üretim girişi var. Önce üretim girişlerini silmelisiniz.");
      return;
    }

    setDeleteItemId(itemId);
    setShowDeleteItemModal(true);
  };

  const openDeleteProductionRunConfirm = (runId: string) => {
    const run = productionRuns.find(r => r.id === runId);
    if (!run) {
      alert("Silinecek üretim girişi bulunamadı.");
      return;
    }

    const plan = productionPlans.find(p => p.id === run.productionPlanId);
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için üretim geçmişi değiştirilemez.");
      return;
    }

    // Security check: has shipment been made?
    const linkedFG = finishedGoodsStocks.find(fg => fg.productionRunId === runId && !fg.isDeleted);
    if (linkedFG) {
      const hasShipment = finishedGoodsMovements.some(
        fgm => fgm.finishedGoodsStockId === linkedFG.id && fgm.type === 'Sevkiyat çıkışı' && !(fgm as any).isDeleted
      );
      if (hasShipment || linkedFG.quantityRemaining < linkedFG.quantityProduced) {
        alert("Bu üretimden oluşan nihai ürünlerden sevkiyat yapılmış. Bu üretim girişi silinemez. Stok düzeltmesi yapın.");
        return;
      }
    }

    setDeleteRunId(runId);
    setShowDeleteRunModal(true);
  };

  const confirmDeleteProductionPlanItem = () => {
    if (!deleteItemId) return;
    const item = productionPlanItems.find(pi => pi.id === deleteItemId);
    const plan = item ? productionPlans.find(p => p.id === item.productionPlanId) : null;
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için üretim kalemleri silinemez.");
      return;
    }
    if (onDeleteProductionPlanItem) {
      const success = onDeleteProductionPlanItem(deleteItemId);
      if (success) {
        setShowDeleteItemModal(false);
        setDeleteItemId(null);
      }
    }
  };

  const confirmDeleteProductionRun = () => {
    if (!deleteRunId) return;
    const run = productionRuns.find(r => r.id === deleteRunId);
    const plan = run ? productionPlans.find(p => p.id === run.productionPlanId) : null;
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu plan kapatıldığı için üretim geçmişi değiştirilemez.");
      return;
    }
    if (onDeleteProductionRun) {
      onDeleteProductionRun(deleteRunId);
      setShowDeleteRunModal(false);
      setDeleteRunId(null);
    }
  };

  const openClosePlanModal = () => {
    if (!activePlanToRender) return;
    if (isProductionPlanClosed(activePlanToRender)) {
      alert("Bu plan zaten kapatılmış.");
      return;
    }
    const planItems = productionPlanItems.filter(
      pi => pi.productionPlanId === activePlanToRender.id && pi.status !== 'İptal' && !(pi as any).isDeleted
    );

    const initialOptions: typeof closePlanItemOptions = {};
    const tomorrowISO = addDaysISO(activePlanToRender.productionDate, 1);

    planItems.forEach(pi => {
      const produced = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
      const remaining = Math.max(0, pi.plannedQuantity - produced);
      
      if (remaining > 0) {
        initialOptions[pi.id] = {
          action: 'tomorrow',
          customDate: tomorrowISO,
          carryQty: remaining,
          itemId: pi.id,
          productId: pi.productId,
          orderId: pi.orderId,
          orderItemId: pi.orderItemId,
          customerId: pi.customerId,
          note: pi.note || ''
        };
      }
    });

    setClosePlanItemOptions(initialOptions);
    setShowClosePlanModal(true);
  };

  const handleCloseAndCarryOverPlan = async () => {
    if (!activePlanToRender) {
      alert("Kapatılacak üretim planı bulunamadı.");
      return;
    }

    if (isProductionPlanClosed(activePlanToRender)) {
      alert("Bu plan zaten kapatılmış.");
      return;
    }

    // Check if any items with "custom" action don't have a customDate selected
    let customDateMissing = false;
    Object.entries(closePlanItemOptions).forEach(([itemId, opt]) => {
      const option = opt as any;
      if (option.action === 'custom' && !option.customDate) {
        customDateMissing = true;
      }
    });

    if (customDateMissing) {
      alert("Lütfen devir tarihi seçin.");
      return;
    }

    // Check total shortage
    let totalShortage = 0;
    activePlanItems.forEach(pi => {
      const produced = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
      const shortage = Math.max(0, pi.plannedQuantity - produced);
      totalShortage += shortage;
    });

    if (Object.keys(closePlanItemOptions).length > 0 && totalShortage === 0) {
      alert("Eksik üretim miktarı bulunamadı.");
      return;
    }

    if (closePlanRequestInFlightRef.current) {
      return;
    }

    setIsProcessing(true);
    closePlanRequestInFlightRef.current = true;

    try {
      // 1. Map options to actionsToSend (Frontend domain fields only)
      const actionsToSend: CloseProductionPlanAction[] = [];
      let hasAnyCarryover = false;

      Object.entries(closePlanItemOptions).forEach(([itemId, opt]) => {
        const option = opt as any;
        let resolvedAction: 'carry_tomorrow' | 'carry_date' | 'close_without_carry' = 'close_without_carry';
        let resolvedTargetDate: string | undefined = undefined;

        if (option.action === 'tomorrow' || option.action === 'custom') {
          resolvedAction = option.action === 'tomorrow' ? 'carry_tomorrow' : 'carry_date';
          hasAnyCarryover = true;
          
          resolvedTargetDate = option.action === 'tomorrow' 
            ? addDaysISO(activePlanToRender.productionDate, 1) 
            : option.customDate;
        }

        actionsToSend.push({
          planItemId: itemId,
          action: resolvedAction,
          targetDate: resolvedTargetDate
        });
      });

      // 2. Call our atomic service method
      if (onClosePlanAndCarryOver) {
        await onClosePlanAndCarryOver(activePlanToRender.id, actionsToSend);
      } else {
        throw new Error("onClosePlanAndCarryOver prop is not defined.");
      }

      setShowClosePlanModal(false);

      if (hasAnyCarryover) {
        alert("Plan kapatıldı ve eksik üretimler devredildi.");
      } else {
        alert("Plan eksikle kapatıldı.");
      }
    } catch (e: any) {
      console.error("Detailed close plan error:", e);
      const errorMsg = e.message || e.details || e.hint || "Devir planı oluşturulurken hata oluştu.";
      alert(`Hata: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
      closePlanRequestInFlightRef.current = false;
    }
  };

  const handleCompletePlanWithoutShortage = async () => {
    if (!activePlanToRender) return;

    if (isProductionPlanClosed(activePlanToRender)) {
      alert("Bu plan zaten kapatılmış.");
      return;
    }

    if (closePlanRequestInFlightRef.current) {
      return;
    }

    setIsProcessing(true);
    closePlanRequestInFlightRef.current = true;

    try {
      if (onClosePlanAndCarryOver) {
        // Eksiksiz plan da aynı atomic RPC ile kapatılmalı
        await onClosePlanAndCarryOver(activePlanToRender.id, []);
      } else {
        throw new Error("onClosePlanAndCarryOver prop is not defined.");
      }

      setShowClosePlanConfirmModal(false);
      alert("Üretim planı tamamlandı.");
    } catch (err: any) {
      console.error("Error completing plan:", err);
      const errorMsg = err.message || err.details || err.hint || "Plan kapatılırken bir hata oluştu.";
      alert(`Hata: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
      closePlanRequestInFlightRef.current = false;
    }
  };

  const todayStr = getTodayISO();
  const tomorrowStr = getTomorrowISO();

  // 7 days quick selection list generator
  const get7DaysList = () => {
    const days = [];
    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    
    for (let i = 0; i < 7; i++) {
      const dateStr = addDaysISO(todayStr, i);
      const dateObj = parseISODateSafe(dateStr);
      
      const dayIndex = dateObj.getDay();
      const dayName = dayNames[dayIndex];
      
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const displayDate = `${day}.${month}`;
      
      let label = '';
      if (i === 0) {
        label = `Bugün ${displayDate}`;
      } else if (i === 1) {
        label = `Yarın ${displayDate}`;
      } else {
        label = `${dayName} ${displayDate}`;
      }
      
      days.push({
        dateStr,
        label
      });
    }
    return days;
  };

  const quickDaysList = get7DaysList();

  // Safe Date Helpers
  const parseDateSafe = (d: any): Date | null => {
    if (!d) return null;
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const isSameDay = (dateA: any, dateB: any): boolean => {
    const d1 = parseDateSafe(dateA);
    const d2 = parseDateSafe(dateB);
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const startOfToday = (): Date => {
    return parseISODateSafe(getTodayISO());
  };

  const startOfWeekMonday = (date: Date): Date => {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1);
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const endOfWeekSunday = (date: Date): Date => {
    const monday = startOfWeekMonday(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  };

  const isDateInRange = (date: any, start: Date, end: Date): boolean => {
    const d = parseDateSafe(date);
    if (!d) return false;
    return d >= start && d <= end;
  };

  const safeFormatDate = (d: string) => {
    try {
      if (!d) return 'Geçersiz Tarih';
      return formatDate(d);
    } catch (e) {
      console.error(e);
      return d || 'Geçersiz Tarih';
    }
  };

  const safeFormatShortDate = (d: string) => {
    try {
      if (!d) return 'Geçersiz Tarih';
      return formatShortDate(d);
    } catch (e) {
      console.error(e);
      return d || 'Geçersiz Tarih';
    }
  };

  // 1. Find or load production plan for the selected date
  const activePlanToRender = productionPlans.find(
    p => p.productionDate === selectedProductionDate || p.date === selectedProductionDate
  ) || null;

  // 2. Get items that belong to the active plan
  const activePlanItems = activePlanToRender 
    ? productionPlanItems.filter(i => i.productionPlanId === activePlanToRender.id && !i.isDeleted)
    : [];

  const isClosedPlan = activePlanToRender ? isProductionPlanClosed(activePlanToRender) : false;

  // Calculate merged hammadde requirements for the active plan
  const getPlanRequirementsBreakdown = (planId: string) => {
    const reqs = calculateRemainingRequirementsForProductionPlan(
      planId,
      productionPlanItems,
      orderItems,
      products,
      recipes,
      rawMaterials,
      costSettings,
      stockMovements,
      productionRuns,
      productionPlans
    );

    const stockAvailability = calculateStockAvailability(
      reqs.map(r => ({ rawMaterialId: r.rawMaterialId, grossRequirement: r.remainingRequirement })),
      rawMaterials,
      currentStocks
    );

    return {
      requirements: reqs,
      availability: stockAvailability
    };
  };

  const activePlanDetails = activePlanToRender ? getPlanRequirementsBreakdown(activePlanToRender.id) : null;

  // Filter open, active order items that can be added to production
  const addableOrderItems = orderItems.filter(item => {
    const order = orders.find(o => o.id === item.orderId);
    if (!order) return false;

    // Must be approved ("Onaylandı")
    const approvalStatus = order.approvalStatus || (order.status === 'Taslak' || order.status === 'İptal' ? order.status : 'Onaylandı');
    if (approvalStatus !== 'Onaylandı') return false;

    // Must not be cancelled or fully shipped
    const computedStatus = order.computedStatus || order.status;
    if (computedStatus === 'İptal' || computedStatus === 'Sevk Edildi') return false;

    // Remaining plan calculation
    const plannedQty = getOrderItemPlannedQuantity(item.id, productionPlanItems);
    const remainingToPlan = item.quantity - plannedQty;
    if (remainingToPlan <= 0) return false;

    // Remaining production calculation
    const producedQty = getOrderItemProducedQuantity(item.id, productionPlanItems);
    const remainingToProduce = item.quantity - producedQty;

    // Filter by "only remaining to produce"
    if (filterOnlyRemaining && remainingToProduce <= 0) return false;

    // Main Tab Date Filters
    if (activeMainFilter === 'today') {
      if (!isSameDay(order.deliveryDate, todayStr)) return false;
    } else if (activeMainFilter === 'tomorrow') {
      if (!isSameDay(order.deliveryDate, tomorrowStr)) return false;
    } else if (activeMainFilter === 'thisWeek') {
      if (!isDateInRange(order.deliveryDate, startOfWeekMonday(startOfToday()), endOfWeekSunday(startOfToday()))) return false;
    } else if (activeMainFilter === 'nextWeek') {
      const nextMonday = startOfWeekMonday(startOfToday());
      nextMonday.setDate(nextMonday.getDate() + 7);
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextMonday.getDate() + 6);
      nextSunday.setHours(23, 59, 59, 999);
      if (!isDateInRange(order.deliveryDate, nextMonday, nextSunday)) return false;
    } else if (activeMainFilter === 'overdue') {
      const delDate = parseDateSafe(order.deliveryDate);
      const today = startOfToday();
      today.setHours(0, 0, 0, 0);
      const isOverdue = delDate ? delDate < today : false;
      if (!isOverdue) return false;
    }

    // Secondary Dropdown & Input Filters
    if (filterCustomer && order.customerId !== filterCustomer) return false;
    if (filterProduct && item.productId !== filterProduct) return false;

    if (filterDeliveryStartDate) {
      const d = parseDateSafe(order.deliveryDate);
      const s = parseDateSafe(filterDeliveryStartDate);
      if (d && s && d < s) return false;
    }
    if (filterDeliveryEndDate) {
      const d = parseDateSafe(order.deliveryDate);
      const e = parseDateSafe(filterDeliveryEndDate);
      if (d && e && d > e) return false;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const cust = customers.find(c => c.id === order.customerId);
      const prod = products.find(p => p.id === item.productId);
      const customerName = cust?.name?.toLowerCase() || '';
      const productName = prod?.name?.toLowerCase() || '';
      const orderNo = getOrderDisplayNumber(item.orderId, orders).toLowerCase();
      const orderIdMatch = item.orderId.toLowerCase();
      const matchesQuery = customerName.includes(query) || productName.includes(query) || orderNo.includes(query) || orderIdMatch.includes(query);
      if (!matchesQuery) return false;
    }

    return true;
  });

  const handleCreateEmptyPlan = () => {
    onAddPlan({
      productionDate: selectedProductionDate,
      date: selectedProductionDate,
      status: 'Planlandı',
      note: `${safeFormatShortDate(selectedProductionDate)} Üretim Planı`
    }, []);
  };

  const handleAddItemToPlan = (item: OrderItem) => {
    if (!activePlanToRender) {
      alert("Lütfen önce bu tarih için bir üretim planı oluşturun.");
      return;
    }

    if (isProductionPlanClosed(activePlanToRender)) {
      alert("Bu plan kapatıldığı için yeni plan kalemi eklenemez.");
      return;
    }

    const qtyStr = addQuantities[item.id];
    if (qtyStr === undefined || qtyStr.trim() === '') {
      alert("Üretime eklenecek adet girin.");
      return;
    }

    const qty = parseFloat(qtyStr);
    if (isNaN(qty)) {
      alert("Lütfen geçerli bir sayı girin.");
      return;
    }

    if (!Number.isInteger(qty)) {
      alert("Adet tam sayı olmalı.");
      return;
    }

    if (qty === 0) {
      alert("Adet 0’dan büyük olmalı.");
      return;
    }

    if (qty < 0) {
      alert("Adet negatif olamaz.");
      return;
    }

    const orderQuantity = item.quantity;
    const totalProducedForOrder = getOrderItemProducedQuantity(item.id, productionPlanItems);
    const remainingProduction = Math.max(orderQuantity - totalProducedForOrder, 0);

    const activePlanItem = activePlanItems.find(pi => pi.orderItemId === item.id);
    const activePlanPlanned = activePlanItem ? activePlanItem.plannedQuantity : 0;
    const activePlanProduced = activePlanItem ? activePlanItem.producedQuantity || 0 : 0;
    const currentPlanExistingOpenQuantityForOrder = Math.max(activePlanPlanned - activePlanProduced, 0);

    const maxAddableToCurrentPlan = Math.max(remainingProduction - currentPlanExistingOpenQuantityForOrder, 0);

    if (qty > maxAddableToCurrentPlan) {
      alert(`Bu sipariş için bu plana en fazla ${maxAddableToCurrentPlan} adet ekleyebilirsiniz.`);
      return;
    }

    const order = orders.find(o => o.id === item.orderId);
    if (!order) return;

    // Avoid duplicating the same orderItem in the same plan. If already exists, we accumulate.
    const existingIndex = activePlanItems.findIndex(i => i.orderItemId === item.id);
    let updatedItemsList = [...activePlanItems];

    if (existingIndex !== -1) {
      const existing = updatedItemsList[existingIndex];
      const newPlanned = existing.plannedQuantity + qty;
      updatedItemsList[existingIndex] = {
        ...existing,
        plannedQuantity: newPlanned
      };
    } else {
      const newItem: ProductionPlanItem = {
        id: 'pi_' + Math.random().toString(36).substring(2, 9),
        productionPlanId: activePlanToRender.id,
        orderId: item.orderId,
        orderItemId: item.id,
        customerId: order.customerId,
        productId: item.productId,
        plannedQuantity: qty,
        producedQuantity: 0,
        status: 'Planlandı',
        note: '',
        rawMaterialsDeducted: false,
        finishedGoodsCreated: false
      };
      updatedItemsList.push(newItem);
    }

    if (onAddOrderItemToPlan) {
      onAddOrderItemToPlan(
        activePlanToRender.id,
        item.orderId,
        item.id,
        item.productId,
        qty,
        item.unit || 'Adet'
      );
    } else {
      onUpdatePlan(activePlanToRender.id, {}, updatedItemsList);
    }
    
    // Clear input
    setAddQuantities(prev => ({ ...prev, [item.id]: '' }));
  };

  const handleRemoveItemFromPlan = (itemId: string) => {
    if (!activePlanToRender) return;
    if (onDeleteProductionPlanItem) {
      onDeleteProductionPlanItem(itemId);
    } else {
      const itemToRemove = activePlanItems.find(i => i.id === itemId);
      if (itemToRemove && (itemToRemove.rawMaterialsDeducted || itemToRemove.finishedGoodsCreated)) {
        alert("Bu ürünün hammaddeleri stoktan düşülmüş veya nihai ürün stoğu oluşturulmuş. Stok hareketi gerçekleşmiş plan kalemlerini silemezsiniz!");
        return;
      }
      if (confirm("Bu ürünü üretim planından çıkarmak istediğinize emin misiniz?")) {
        const updated = activePlanItems.filter(i => i.id !== itemId);
        onUpdatePlan(activePlanToRender.id, {}, updated);
      }
    }
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

  const handleRegisterProductionRun = (pi: ProductionPlanItem) => {
    const plan = productionPlans.find(p => p.id === pi.productionPlanId);
    if (plan && isProductionPlanClosed(plan)) {
      alert("Bu üretim planı kapalı veya kilitli olduğu için üretim girişi yapılamaz.");
      return;
    }

    const rawQty = editingProducedQty[pi.id];
    
    if (rawQty === undefined || rawQty.trim() === '') {
      alert("Üretilen adet girin.");
      return;
    }
    
    const qty = Number(rawQty);

    if (isNaN(qty)) {
      alert("Üretilen adet geçerli bir sayı olmalı.");
      return;
    }

    if (qty === 0) {
      alert("Üretilen adet 0’dan büyük olmalı.");
      return;
    }

    if (qty < 0) {
      alert("Üretilen adet negatif olamaz.");
      return;
    }

    if (!Number.isInteger(qty)) {
      alert("Üretilen adet tam sayı olmalı.");
      return;
    }

    const totalAlreadyProduced = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
    const remainingToProduce = pi.plannedQuantity - totalAlreadyProduced;

    if (qty > remainingToProduce) {
      alert("Kalan üretim miktarından fazla üretim giremezsiniz.");
      return;
    }

    // Lot prefix validation
    const product = products.find(p => p.id === pi.productId);
    if (!product) {
      alert("Ürün bulunamadı.");
      return;
    }

    const matchingRecipe = recipes?.find(r => r.productId === product.id);
    const prefix = getProductLotPrefix(product, matchingRecipe);
    const isAlphanumeric3 = /^[A-Z0-9]{3}$/.test(prefix);

    if (!isAlphanumeric3) {
      setProductionErrors(prev => ({
        ...prev,
        [pi.id]: "Bu ürün için parti numarası oluşturulamadı. Lütfen Ürün Reçeteleri ekranında bu ürüne 3 karakterlik Parti Ön Kodu tanımlayın."
      }));
      return;
    }

    // Clear error if validation passed
    if (productionErrors[pi.id]) {
      setProductionErrors(prev => {
        const next = { ...prev };
        delete next[pi.id];
        return next;
      });
    }

    const note = editingNotes[pi.id] || '';
    const res = onCreateProductionRun(pi.id, qty, note);
    
    const handleSuccess = (ok: boolean) => {
      if (ok) {
        setEditingProducedQty({ ...editingProducedQty, [pi.id]: '' });
        setEditingNotes({ ...editingNotes, [pi.id]: '' });
        setProductionErrors(prev => {
          const next = { ...prev };
          delete next[pi.id];
          return next;
        });
      }
    };

    if (res instanceof Promise) {
      res.then(handleSuccess).catch(err => {
        console.error("Üretim kaydedilirken hata oluştu:", err);
      });
    } else {
      handleSuccess(res);
    }
  };

  // Product Grouping calculation for active plan
  const groupedProducts: Record<string, { product: Product | undefined; totalPlanned: number; totalProduced: number; items: ProductionPlanItem[] }> = {};
  activePlanItems.forEach(item => {
    if (!groupedProducts[item.productId]) {
      groupedProducts[item.productId] = {
        product: products.find(p => p.id === item.productId),
        totalPlanned: 0,
        totalProduced: 0,
        items: []
      };
    }
    groupedProducts[item.productId].totalPlanned += item.plannedQuantity;
    groupedProducts[item.productId].totalProduced += getProducedQuantityForPlanItem(item.id, productionPlanItems, productionRuns);
    groupedProducts[item.productId].items.push(item);
  });

  return (
    <div className="space-y-6 text-xs">
      
      {/* 1. PRODUCTION DATE SELECTOR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="text-emerald-500" size={18} />
              Üretim Tarihi Seçimi
            </h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Üretimi hangi gün yapacağınızı seçin. Sipariş teslimat gününden bağımsız olarak parçalı üretim yapabilirsiniz.
            </p>
          </div>

          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-x-visible max-w-full pb-2 sm:pb-0 scrollbar-thin">
            {quickDaysList.map((day) => (
              <button
                key={day.dateStr}
                id={`btn-date-${day.dateStr}`}
                onClick={() => {
                  setSelectedProductionDate(day.dateStr);
                  setShowCustomDatePicker(false);
                }}
                className={`px-3 py-2 rounded-xl font-bold transition-all text-xs cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedProductionDate === day.dateStr && !showCustomDatePicker
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {day.label}
              </button>
            ))}

            <button
              id="btn-custom-date"
              onClick={() => setShowCustomDatePicker(!showCustomDatePicker)}
              className={`px-3 py-2 rounded-xl font-bold transition-all text-xs cursor-pointer whitespace-nowrap shrink-0 ${
                showCustomDatePicker
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Özel Tarih Seç...
            </button>
          </div>
        </div>

        {showCustomDatePicker && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 max-w-xs animate-fadeIn">
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Üretim Tarihi Girin:</label>
            <input
              type="date"
              value={selectedProductionDate}
              onChange={(e) => setSelectedProductionDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* 2. PRODUCTION EMRI VE PLAN EKRANI */}
      {activePlanToRender ? (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ClipboardList className="text-emerald-600" size={18} />
                <h3 className="text-sm font-extrabold text-slate-800">
                  {safeFormatDate(selectedProductionDate)} Üretim Planı
                </h3>
                <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${
                  activePlanToRender.status === 'Tamamlandı' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  activePlanToRender.status === 'Eksikle Kapatıldı' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  activePlanToRender.status === 'Üretimde' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  {activePlanToRender.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">"{activePlanToRender.note}"</p>
            </div>

            <div className="flex gap-2">
              {!isProductionPlanClosed(activePlanToRender) && (
                <>
                  <button
                    onClick={() => onUpdatePlan(activePlanToRender.id, { status: 'Hazırlanıyor' })}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer text-xs"
                  >
                    Hazırlanıyor'a Al
                  </button>
                  <button
                    onClick={() => onUpdatePlan(activePlanToRender.id, { status: 'Üretimde' })}
                    className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all cursor-pointer text-xs"
                  >
                    Üretime Al
                  </button>
                </>
              )}
              {isProductionPlanClosed(activePlanToRender) ? (
                <button
                  disabled
                  className="px-3 py-2 bg-slate-100 text-slate-500 border border-slate-200 font-bold rounded-xl flex items-center gap-1.5 cursor-not-allowed opacity-95 text-xs"
                >
                  <Check size={14} />
                  Plan Kapatıldı ✓
                </button>
              ) : (
                <button
                  onClick={() => {
                    const planItems = productionPlanItems.filter(
                      pi => pi.productionPlanId === activePlanToRender.id && pi.status !== 'İptal' && !(pi as any).isDeleted
                    );
                    
                    if (planItems.length === 0) {
                      alert("Planda aktif üretim kalemi bulunmadığı için tamamlanamaz.");
                      return;
                    }

                    setShowClosePlanConfirmModal(true);
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all cursor-pointer text-xs"
                >
                  Günü / Planı Kapat
                </button>
              )}
            </div>
          </div>

          {/* Big Alert Info Box for Closed Plan */}
          {isClosedPlan && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs animate-fadeIn ${
              activePlanToRender.status === 'Tamamlandı' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              activePlanToRender.status === 'Eksikle Kapatıldı' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              activePlanToRender.status === 'İptal' ? 'bg-red-50 text-red-800 border-red-200' :
              'bg-slate-50 text-slate-800 border-slate-200'
            }`}>
              <Info className={`shrink-0 mt-0.5 ${
                activePlanToRender.status === 'Tamamlandı' ? 'text-emerald-600' :
                activePlanToRender.status === 'Eksikle Kapatıldı' ? 'text-amber-600' :
                activePlanToRender.status === 'İptal' ? 'text-red-600' :
                'text-slate-600'
              }`} size={16} />
              <div className="space-y-1">
                <h4 className="font-extrabold text-xs uppercase tracking-wide">Üretim Planı Bilgisi</h4>
                <p className="text-[11px] font-medium leading-relaxed">
                  {activePlanToRender.status === 'Tamamlandı' && (
                    'Bu plan kapatıldı. Bu plana yeni üretim girişi yapılamaz.'
                  )}
                  {activePlanToRender.status === 'Eksikle Kapatıldı' && (
                    'Bu plan eksikle kapatıldı. Bu plana yeni üretim girişi yapılamaz. Eksik üretimler devredildiyse hedef tarihteki üretim planında takip edilir.'
                  )}
                  {activePlanToRender.status === 'İptal' && (
                    'Bu plan iptal edildi. Bu plana yeni üretim girişi yapılamaz.'
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Products & Items in Selected Production Plan */}
            <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Package size={15} className="text-emerald-600" />
                Plandaki Ürünler & Parçalı Üretim Takibi
              </h3>

              {activePlanItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic">
                  Bu plana henüz ürün eklenmemiş. Aşağıdaki "Üretime Eklenebilir Siparişler" listesinden ekleme yapın.
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.keys(groupedProducts).map(prodId => {
                    const group = groupedProducts[prodId];
                    return (
                      <div key={prodId} className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Ürün Başlığı</span>
                            <h4 className="font-extrabold text-slate-900 text-xs mt-0.5">{group.product?.name}</h4>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/50">
                              Toplam Planlanan: {group.totalPlanned} Adet
                            </span>
                          </div>
                        </div>

                        {/* Customer rows associated with this product */}
                        <div className="space-y-3">
                          {group.items.map(pi => {
                            const cust = customers.find(c => c.id === pi.customerId);
                            const order = orders.find(o => o.id === pi.orderId);
                            
                            // Calculate correct totals
                            const totalAlreadyProduced = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
                            const remainingToProduce = Math.max(0, pi.plannedQuantity - totalAlreadyProduced);
                            const isCompleted = remainingToProduce === 0;

                            // Find previous runs for this plan item
                            const runsForItem = productionRuns.filter(r => r.productionPlanItemId === pi.id && !r.isDeleted);

                            const completionRate = pi.plannedQuantity > 0 ? Math.round((totalAlreadyProduced / pi.plannedQuantity) * 100) : 0;
                            const shortageQuantity = Math.max(0, pi.plannedQuantity - totalAlreadyProduced);
                            const carryOverQuantity = pi.isCarryOver ? 0 : shortageQuantity;

                            return (
                              <div key={pi.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-100">
                                  <div>
                                    <div className="flex items-center gap-1.5 text-slate-800 font-extrabold text-xs">
                                      <Users size={13} className="text-emerald-500" />
                                      <span>{cust?.name}</span>
                                      {pi.isCarryOver && (
                                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                                          {pi.carryOverQuantityTotal && pi.carryOverQuantityTotal > 0 
                                            ? `Devir +${pi.carryOverQuantityTotal}` 
                                            : 'Devir Üretim'
                                          }
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400 mt-1">
                                      <span>Sipariş No: <strong className="text-slate-600">{getOrderDisplayNumber(pi.orderId, orders)}</strong></span>
                                      <span>•</span>
                                      <span>Teslim Tarihi: <strong className="text-slate-600">{formatShortDate(order?.deliveryDate || '')}</strong></span>
                                      <span>•</span>
                                      <span>Ürün: <strong className="text-slate-600">{group.product?.name}</strong></span>
                                      {pi.isCarryOver && (
                                        <>
                                          <span>•</span>
                                          <span className="text-indigo-600 font-bold">
                                            Önceki günden devreden: {pi.carryOverQuantityTotal || pi.plannedQuantity} adet
                                          </span>
                                        </>
                                      )}
                                      {pi.isCarryOver && pi.sourceCarryOverFromPlanId && !pi.carryOverQuantityTotal && (
                                        <>
                                          <span>•</span>
                                          <span className="text-indigo-600 font-medium">
                                            {(() => {
                                              const sourcePlan = productionPlans.find(p => p.id === pi.sourceCarryOverFromPlanId);
                                              const sourceDateStr = sourcePlan ? safeFormatShortDate(sourcePlan.productionDate) : '';
                                              return sourceDateStr ? `${sourceDateStr} planından devredildi` : 'Önceki plandan devredildi';
                                            })()}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                      pi.status === 'Tamamlandı' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                      pi.status === 'Planın Gerisinde' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      pi.status === 'Plan Üstü Üretim' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                      pi.status === 'Eksikle Kapatıldı' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                                      pi.status === 'İptal' ? 'bg-red-50 text-red-700 border-red-200' :
                                      pi.status === 'Devirle Tamamlandı' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                      'bg-slate-50 text-slate-600 border-slate-200'
                                    }`}>
                                      {pi.status === 'Bekliyor' ? 'Planlandı' : pi.status === 'Eksik üretildi' ? 'Kısmi Üretildi' : pi.status}
                                    </span>
                                    {!isClosedPlan ? (
                                      <button
                                        onClick={() => openDeleteProductionPlanItemConfirm(pi.id)}
                                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer hover:bg-red-50 rounded transition-colors animate-fadeIn"
                                        title="Plandan Çıkar"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    ) : (
                                      <span className="text-slate-400 text-[10px] font-medium" title="Plan kapatıldığı için değişiklik yapılamaz.">
                                        Plan kapatıldığı için değişiklik yapılamaz.
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Column values grid */}
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 text-center">
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Planlanan</span>
                                    <span className="font-bold text-slate-800 text-[11px]">{pi.plannedQuantity} Adet</span>
                                    {pi.isCarryOver && pi.carryOverQuantityTotal && pi.carryOverQuantityTotal > 0 ? (
                                      <span className="text-[8px] text-slate-500 block">Normal: {pi.plannedQuantity - pi.carryOverQuantityTotal}</span>
                                    ) : null}
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Üretilen</span>
                                    <span className="font-bold text-emerald-700 text-[11px]">{totalAlreadyProduced} Adet</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Kalan</span>
                                    <span className="font-bold text-amber-600 text-[11px]">{remainingToProduce} Adet</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Oran</span>
                                    <span className="font-bold text-blue-600 text-[11px]">{completionRate}%</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Eksik</span>
                                    <span className="font-bold text-red-600 text-[11px]">{shortageQuantity} Adet</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 block font-semibold uppercase">Devir</span>
                                    <span className="font-bold text-indigo-600 text-[11px]">
                                      {pi.isCarryOver 
                                        ? `${pi.carryOverQuantityTotal || pi.plannedQuantity}` 
                                        : `${carryOverQuantity}`
                                      } Adet
                                    </span>
                                  </div>
                                </div>

                                {/* Bu Girişte Üretilecek Adet inputu & Action Button */}
                                {isClosedPlan ? (
                                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-lg text-[10px] flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                                    <div>
                                      {activePlanToRender.status === 'Eksikle Kapatıldı' ? (
                                        <span className="font-semibold block">Bu plan eksikle kapatılmıştır. Eksik üretimler devir planında veya yeni üretim planında takip edilmelidir.</span>
                                      ) : (
                                        <span className="font-semibold block">Bu üretim planı kapatılmıştır. Bu güne yeni üretim girişi yapılamaz.</span>
                                      )}
                                    </div>
                                  </div>
                                ) : !isCompleted ? (
                                  <div className="space-y-2">
                                    {productionErrors[pi.id] && (
                                      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs flex items-start gap-2.5">
                                        <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                          <span className="font-extrabold block text-rose-900 mb-0.5">Hata: Parti No Otomasyonu</span>
                                          <span className="text-rose-700 font-semibold leading-relaxed">{productionErrors[pi.id]}</span>
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                                      <div className="flex-1 w-full">
                                        <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Bu Girişte Üretilecek Adet:</label>
                                        <input
                                          type="text"
                                          placeholder="Üretilen adet gir"
                                          value={editingProducedQty[pi.id] !== undefined ? editingProducedQty[pi.id] : ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setEditingProducedQty({ ...editingProducedQty, [pi.id]: val });
                                            if (productionErrors[pi.id]) {
                                              setProductionErrors(prev => {
                                                const next = { ...prev };
                                                delete next[pi.id];
                                                return next;
                                              });
                                            }
                                          }}
                                          className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 text-xs focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all shadow-xs"
                                        />
                                      </div>
                                      <div className="flex-1 w-full">
                                        <label className="text-[9px] font-bold text-slate-500 block mb-0.5">Üretim Notu / Açıklama:</label>
                                        <input
                                          type="text"
                                          placeholder="Örn. Fire, vardiya vb. (Opsiyonel)"
                                          value={editingNotes[pi.id] || ''}
                                          onChange={(e) => {
                                            setEditingNotes({ ...editingNotes, [pi.id]: e.target.value });
                                            if (productionErrors[pi.id]) {
                                              setProductionErrors(prev => {
                                                const next = { ...prev };
                                                delete next[pi.id];
                                                return next;
                                              });
                                            }
                                          }}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 transition-all"
                                        />
                                      </div>
                                      <div className="w-full sm:w-auto pt-4 sm:pt-3.5 flex items-end">
                                        <button
                                          onClick={() => handleRegisterProductionRun(pi)}
                                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-xl transition-all text-xs cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                          Üretimi Kaydet
                                        </button>
                                      </div>
                                    </div>

                                    {/* Canlı Dinamik Hammadde Kontrol Uyarı Kartı */}
                                    {(() => {
                                      const warn = getStockWarningDetails(pi);
                                      if (!warn) return null;
                                      return (
                                        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs space-y-2 mt-2 animate-fadeIn shadow-xs">
                                          <div className="flex items-start gap-2.5">
                                            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                              <span className="font-extrabold text-amber-900 block text-xs">⚠️ Hammadde Miktarı Yetersiz!</span>
                                              <p className="text-slate-600 font-semibold leading-relaxed mt-1">
                                                Girilen hedef üretim miktarı: <strong className="text-amber-950 font-black">{editingProducedQty[pi.id]}</strong> adet. <br />
                                                Mevcut stokla üretilebilecek maksimum miktar: <strong className="text-emerald-800 font-black">{warn.maxProducible}</strong> adet. <br />
                                                Eksik üretim miktarı: <strong className="text-amber-900 font-black">{warn.missingQuantity}</strong> adet.
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className="bg-white/85 p-3 rounded-lg border border-amber-100/50 space-y-1.5">
                                            <span className="font-extrabold text-slate-500 block text-[9px] uppercase tracking-wider">
                                              Bu eksik {warn.missingQuantity} adet üretim için reçeteye göre gereken eksik hammaddeler:
                                            </span>
                                            <div className="grid grid-cols-1 divide-y divide-slate-100 text-[11px]">
                                              {warn.missingMaterials.map((mat, idx) => (
                                                <div key={idx} className="py-1.5 flex justify-between items-center">
                                                  <span className="font-extrabold text-slate-700">{mat.name}</span>
                                                  <span className="font-extrabold text-red-600">
                                                    {mat.missingAmount.toFixed(2)} {mat.unit} eksik
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-[10px] flex items-center gap-2">
                                    <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                                    <div>
                                      <span className="font-extrabold block">Plan Tamamlandı ✓</span>
                                      <span className="text-slate-500">Planlanan {pi.plannedQuantity} adedin tamamı başarıyla üretildi. Yeni üretim girişi kilitlendi.</span>
                                    </div>
                                  </div>
                                )}

                                {/* Render previous production runs history list */}
                                {runsForItem.length > 0 && (
                                  <div className="pt-2 border-t border-dashed border-slate-200">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Üretim Geçmişi (Parçalı Girişler)</span>
                                    <div className="space-y-1">
                                      {runsForItem.map((run, idx) => (
                                        <div key={run.id} className="flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded text-[10px] border border-slate-100">
                                          <div className="flex items-center gap-1">
                                            <span className="font-extrabold text-slate-700">#{idx + 1} Giriş:</span>
                                            <span className="font-bold text-emerald-700">{run.producedQuantity} Adet</span>
                                            {run.lotNo && (
                                              <span className="ml-1 text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.2 font-extrabold shrink-0">
                                                Parti No: {run.lotNo}
                                              </span>
                                            )}
                                            {run.note && <span className="text-slate-400 italic font-medium">({run.note})</span>}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-slate-400 font-medium">{formatShortDate(run.productionDate)}</span>
                                            
                                            {run.id && (
                                              <button
                                                onClick={() => handleOpenProductionTraceability(run.id)}
                                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 font-bold px-1.5 py-0.5 rounded transition-all text-[9px] cursor-pointer inline-flex items-center gap-0.5 shrink-0"
                                                title="Üretim Girdi İzlenebilirliği"
                                              >
                                                İzlenebilirlik
                                              </button>
                                            )}

                                            {isClosedPlan && (
                                              <span 
                                                className="text-slate-400 text-[9px] font-medium"
                                                title="Plan kapatıldığı için üretim geçmişi değiştirilemez."
                                              >
                                                Plan kapatıldı
                                              </span>
                                            )}
                                            {(onUndoProductionRun || onDeleteProductionRun) && 
                                             !isClosedPlan && 
                                             !run.isDeleted && 
                                             (run as any).status !== "Üretim Geri Alındı" && 
                                             run.id && (
                                              <button
                                                onClick={() => {
                                                  if (isClosedPlan) {
                                                    alert("Bu üretim planı kapalı veya kilitli olduğu için üretim geri alınamaz.");
                                                    return;
                                                  }
                                                  console.log("Undo production clicked", run.id, run);
                                                  setUndoProductionRunTarget(run);
                                                  setUndoProductionRunReason("Kullanıcı tarafından geri alındı");
                                                  setUndoProductionRunError(null);
                                                  setIsUndoProductionRunModalOpen(true);
                                                }}
                                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 font-bold px-1.5 py-0.5 rounded transition-all text-[9px] cursor-pointer inline-flex items-center gap-0.5"
                                                title="Bu Girişi Geri Al"
                                              >
                                                Geri Al
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Consolidated Raw Material Requirements */}
            <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Layers size={15} className="text-emerald-600" />
                Birleşik Kalan Hammadde İhtiyacı
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Bu plan tarihinde henüz üretilmemiş kalan üretim miktarına göre hesaplanmış hammadde ihtiyacıdır.
              </p>

              {activePlanToRender && isProductionPlanClosed(activePlanToRender) ? (
                <div className="bg-slate-50 border border-slate-200 text-slate-700 p-4 rounded-xl text-xs text-center font-bold">
                  {activePlanToRender.status === 'Tamamlandı' ? (
                    <p className="text-emerald-700">Kalan hammadde ihtiyacı yok. Plan tamamlandı.</p>
                  ) : (
                    <p className="text-amber-700">Bu plan eksikle kapatıldı. Eksik üretimler devir planında veya yeni üretim planında takip edilir.</p>
                  )}
                </div>
              ) : activePlanDetails && activePlanDetails.requirements.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                          <th className="py-2">Hammadde</th>
                          <th className="py-2 text-right">Kalan Net İhtiyaç</th>
                          <th className="py-2 text-right">Kalan Ham İhtiyaç</th>
                          <th className="py-2 text-right">Eldeki Stok</th>
                          <th className="py-2 text-right">Eksik / Fazla</th>
                          <th className="py-2 text-right">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-slate-600">
                        {activePlanDetails.requirements.map((req) => {
                          const stockItem = activePlanDetails.availability.find(a => a.rawMaterialId === req.rawMaterialId);
                          const isShort = stockItem?.status === 'Eksik';
                          const remainingGross = req.grossRequirement;
                          const currentStock = stockItem?.currentStock || 0;
                          
                          // Calculate eksik/fazla amount based on remaining gross
                          const diff = currentStock - remainingGross;
                          const isShortAmount = diff < 0;
                          const absDiff = Math.abs(diff);

                          return (
                            <tr key={req.rawMaterialId} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-bold text-slate-800">
                                <div>{req.rawMaterialName}</div>
                                <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                                  Toplam Plan: {formatWeight(req.totalPlannedRequirement, req.unit)} | Tüketilen: {formatWeight(req.alreadyConsumedRequirement, req.unit)}
                                </div>
                              </td>
                              <td className="py-2.5 text-right text-slate-500">{formatWeight(req.netRequirement, req.unit)}</td>
                              <td className="py-2.5 text-right font-black text-slate-700">{formatWeight(remainingGross, req.unit)}</td>
                              <td className="py-2.5 text-right font-semibold text-slate-700">{formatWeight(currentStock, req.unit)}</td>
                              <td className={`py-2.5 text-right font-bold ${isShortAmount ? 'text-red-600' : 'text-slate-500'}`}>
                                {isShortAmount ? `Eksik: ${formatWeight(absDiff, req.unit)}` : `Fazla: ${formatWeight(absDiff, req.unit)}`}
                              </td>
                              <td className="py-2.5 text-right">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  isShort ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}>
                                  {isShort ? 'Eksik' : 'Yeterli'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {activePlanDetails.availability.some(a => a.status === 'Eksik') && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5 items-start">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                      <p className="text-[10px] text-amber-700">
                        Üretimi gerçekleştirmeden önce eksik hammaddelerin stok girişlerini tamamlayınız.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400 italic text-center py-6">
                  Hesaplanacak hammadde gereksinimi bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* CREATE EMPTY PLAN STATE */
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-4 max-w-lg mx-auto">
          <div className="bg-slate-50 text-slate-400 p-4 rounded-full w-14 h-14 flex items-center justify-center mx-auto border border-slate-100">
            <ClipboardList size={28} />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-bold text-slate-800 text-sm">
              Bu tarih için henüz üretim planı oluşturulmamış.
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              {safeFormatDate(selectedProductionDate)} tarihinde fiilen yapılacak parçalı veya birleşik üretim emirlerini yönetmek için önce yeni bir plan açmanız gerekmektedir.
            </p>
          </div>
          <button
            onClick={handleCreateEmptyPlan}
            className="px-5 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
          >
            <Plus size={15} />
            Bu Tarih İçin Üretim Planı Oluştur
          </button>
        </div>
      )}

      {/* 3. ÜRETİME EKLENEBİLİR SİPARİŞ KALEMLERİ */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
            <Filter className="text-emerald-500" size={16} />
            Üretime Eklenebilir Açık Siparişler
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sipariş teslimat tarihinden bağımsız olarak, planlanmamış ve üretilmemiş tüm açık siparişler listelenmektedir.
          </p>
        </div>

        {/* Main Tab Date Filters */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          <button
            onClick={() => setActiveMainFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Tüm Açık Siparişler
          </button>
          <button
            onClick={() => setActiveMainFilter('today')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'today'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Bugün Teslim Edilecekler
          </button>
          <button
            onClick={() => setActiveMainFilter('tomorrow')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'tomorrow'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Yarın Teslim Edilecekler
          </button>
          <button
            onClick={() => setActiveMainFilter('thisWeek')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'thisWeek'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Bu Hafta Gidecekler (Tr Paz-Pzt)
          </button>
          <button
            onClick={() => setActiveMainFilter('nextWeek')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'nextWeek'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Gelecek Hafta Gidecekler
          </button>
          <button
            onClick={() => setActiveMainFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeMainFilter === 'overdue'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-red-50/50 text-red-600 hover:bg-red-50 border border-red-100'
            }`}
          >
            Teslim Tarihi Geçmiş Açık Siparişler
          </button>
        </div>

        {/* Secondary Dropdowns & Text Search Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
          <div className="sm:col-span-2 md:col-span-1">
            <label className="text-[10px] font-bold text-slate-500 block mb-1">Arama Kutusu (Müşteri/Ürün/Sipariş):</label>
            <input
              type="text"
              placeholder="Arama..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">Müşteri Filtresi:</label>
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
            >
              <option value="">Hepsi</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">Ürün Filtresi:</label>
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
            >
              <option value="">Hepsi</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">Teslim Tarih Başlangıç:</label>
            <input
              type="date"
              value={filterDeliveryStartDate}
              onChange={(e) => setFilterDeliveryStartDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">Teslim Tarih Bitiş:</label>
            <input
              type="date"
              value={filterDeliveryEndDate}
              onChange={(e) => setFilterDeliveryEndDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
            />
          </div>

          <div className="flex items-center gap-1.5 pt-4">
            <input
              type="checkbox"
              id="filterOnlyRemaining"
              checked={filterOnlyRemaining}
              onChange={(e) => setFilterOnlyRemaining(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="filterOnlyRemaining" className="text-[10px] font-bold text-slate-600 select-none cursor-pointer">Sadece Kalan Üretimi Olanlar</label>
          </div>
        </div>

        {/* Clear Filters Button if any is set */}
        {(filterCustomer || filterProduct || filterDeliveryStartDate || filterDeliveryEndDate || searchQuery || activeMainFilter !== 'all') && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setFilterCustomer('');
                setFilterProduct('');
                setFilterDeliveryStartDate('');
                setFilterDeliveryEndDate('');
                setSearchQuery('');
                setActiveMainFilter('all');
              }}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-bold underline cursor-pointer"
            >
              Filtreleri Temizle
            </button>
          </div>
        )}

        {/* Addable items table */}
        {addableOrderItems.length === 0 ? (
          <div className="text-center py-8 text-slate-400 italic">
            Filtrelere uygun eklenebilir açık sipariş kalemi bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase">
                  <th className="py-2">Müşteri / Sipariş No</th>
                  <th className="py-2">Ürün</th>
                  <th className="py-2">Sipariş Tarihi</th>
                  <th className="py-2">Teslim Tarihi</th>
                  <th className="py-2 text-right">Sipariş Adet</th>
                  <th className="py-2 text-right">Planlanan</th>
                  <th className="py-2 text-right">Üretilen</th>
                  <th className="py-2 text-right">Kalan Üretim</th>
                  <th className="py-2 text-right">Kalan Planlanacak</th>
                  <th className="py-2 text-center w-32">Bu Plana Eklenecek</th>
                  <th className="py-2 text-right w-16">Ekle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {addableOrderItems.map((item) => {
                  const customer = customers.find(c => c.id === (orders.find(o => o.id === item.orderId)?.customerId));
                  const product = products.find(p => p.id === item.productId);
                  const order = orders.find(o => o.id === item.orderId);
                  
                  const planned = getOrderItemPlannedQuantity(item.id, productionPlanItems);
                  const produced = getOrderItemProducedQuantity(item.id, productionPlanItems);
                  const remainingToProduce = Math.max(0, item.quantity - produced);
                  const remainingToPlan = Math.max(0, item.quantity - planned);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3">
                        <span className="font-bold text-slate-800 block">{customer?.name}</span>
                        <span className="text-[10px] text-slate-400">Sipariş No: {getOrderDisplayNumber(item.orderId, orders)}</span>
                      </td>
                      <td className="py-3 font-semibold text-slate-900">{product?.name}</td>
                      <td className="py-3">{safeFormatShortDate(order?.orderDate || '')}</td>
                      <td className="py-3 font-semibold text-slate-700">{safeFormatShortDate(order?.deliveryDate || '')}</td>
                      <td className="py-3 text-right font-medium">{item.quantity} Adet</td>
                      <td className="py-3 text-right text-slate-500">{planned}</td>
                      <td className="py-3 text-right font-semibold text-emerald-600">{produced}</td>
                      <td className="py-3 text-right font-bold text-amber-600">{remainingToProduce}</td>
                      <td className="py-3 text-right font-bold text-blue-600">{remainingToPlan}</td>
                      <td className="py-3 text-center">
                        <input
                          type="number"
                          placeholder={isClosedPlan ? "Plan kapalı" : "Adet gir"}
                          disabled={isClosedPlan}
                          value={addQuantities[item.id] || ''}
                          onChange={(e) => setAddQuantities({ ...addQuantities, [item.id]: e.target.value })}
                          className="w-20 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleAddItemToPlan(item)}
                          disabled={isClosedPlan}
                          className={`font-bold px-3 py-1 rounded transition-all text-[10px] ${
                            isClosedPlan 
                              ? "bg-slate-300 text-slate-500 cursor-not-allowed" 
                              : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          }`}
                        >
                          Ekle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. GÜNÜ / PLANI KAPAT MODALI */}
      {showClosePlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Layers size={16} className="text-amber-600" />
                Günü / Planı Kapat ve Devret
              </h3>
              <button
                onClick={() => setShowClosePlanModal(false)}
                disabled={isProcessing}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Bu plandaki aşağıdaki ürünlerin üretimi henüz tamamlanmamıştır. Devir işlemlerini seçip planı kapatabilirsiniz. Devredilen ürünler hedef tarihteki üretim planına otomatik olarak eklenecektir.
              </p>

              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-100">
                      <th className="px-4 py-3">Ürün Adı</th>
                      <th className="px-4 py-3 text-right">Planlanan</th>
                      <th className="px-4 py-3 text-right">Üretilen</th>
                      <th className="px-4 py-3 text-right text-amber-600">Eksik</th>
                      <th className="px-4 py-3">Kapatma / Devir Aksiyonu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {Object.entries(closePlanItemOptions).map(([itemId, opt]) => {
                      const option = opt as any;
                      const product = products.find(p => p.id === option.productId);
                      return (
                        <tr key={itemId} className="hover:bg-slate-50/30">
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-800 block">{product?.name}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium">
                            {productionPlanItems.find(pi => pi.id === itemId)?.plannedQuantity} Adet
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-emerald-600">
                            {getProducedQuantityForPlanItem(itemId, productionPlanItems, productionRuns)} Adet
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-amber-600">{option.carryQty} Adet</td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                                  <input
                                    type="radio"
                                    name={`action-${itemId}`}
                                    checked={option.action === 'tomorrow'}
                                    disabled={isProcessing}
                                    onChange={() => setClosePlanItemOptions({
                                      ...closePlanItemOptions,
                                      [itemId]: { ...option, action: 'tomorrow' }
                                    })}
                                    className="text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  Yarına Devret
                                </label>

                                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                                  <input
                                    type="radio"
                                    name={`action-${itemId}`}
                                    checked={option.action === 'custom'}
                                    disabled={isProcessing}
                                    onChange={() => setClosePlanItemOptions({
                                      ...closePlanItemOptions,
                                      [itemId]: { ...option, action: 'custom' }
                                    })}
                                    className="text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  Tarih Seç
                                </label>

                                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                                  <input
                                    type="radio"
                                    name={`action-${itemId}`}
                                    checked={option.action === 'none'}
                                    disabled={isProcessing}
                                    onChange={() => setClosePlanItemOptions({
                                      ...closePlanItemOptions,
                                      [itemId]: { ...option, action: 'none' }
                                    })}
                                    className="text-emerald-600 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  Devretmeden Kapat
                                </label>
                              </div>

                              {option.action === 'custom' && (
                                <div className="pt-1.5">
                                  <input
                                    type="date"
                                    value={option.customDate}
                                    disabled={isProcessing}
                                    onChange={(e) => setClosePlanItemOptions({
                                      ...closePlanItemOptions,
                                      [itemId]: { ...option, customDate: e.target.value }
                                    })}
                                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                                onClick={() => setShowClosePlanModal(false)}
                                disabled={isProcessing}
                                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Vazgeç
              </button>
              <button
                onClick={handleCloseAndCarryOverPlan}
                disabled={isProcessing}
                className={`px-4 py-2 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs ${isProcessing ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <Check size={14} />
                {isProcessing ? 'İşlem Yapılıyor...' : 'İşlemleri Tamamla ve Planı Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GÜNÜ / PLANI KAPAT GÜVENLİK ONAY MODALI */}
      {showClosePlanConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500 animate-pulse" />
                Üretim planını kapatmak üzeresiniz
              </h3>
              <button
                onClick={() => setShowClosePlanConfirmModal(false)}
                disabled={isProcessing}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-[12px] text-slate-600 leading-relaxed font-semibold">
                Bu üretim gününü kapatırsanız, bu güne artık yeni üretim planı ekleyemezsiniz. Devam eden veya eksik kalan üretimler varsa önce kontrol etmeniz önerilir. Devam etmek istiyor musunuz?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 font-medium">
                ⚠️ Bu işlemden sonra bu gün için daha fazla üretim planlanamaz.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowClosePlanConfirmModal(false)}
                disabled={isProcessing}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Vazgeç
              </button>
              <button
                onClick={async () => {
                  if (!activePlanToRender) return;
                  
                  const planItems = productionPlanItems.filter(
                    pi => pi.productionPlanId === activePlanToRender.id && pi.status !== 'İptal' && !(pi as any).isDeleted
                  );
                  
                  if (planItems.length === 0) {
                    alert("Planda aktif üretim kalemi bulunmadığı için tamamlanamaz.");
                    return;
                  }

                  // Find all items with remaining quantity
                  const remainingItems = planItems.map(pi => {
                    const produced = getProducedQuantityForPlanItem(pi.id, productionPlanItems, productionRuns);
                    const remaining = Math.max(0, pi.plannedQuantity - produced);
                    const product = products.find(p => p.id === pi.productId);
                    return {
                      name: product ? product.name : "Ürün",
                      remaining
                    };
                  }).filter(x => x.remaining > 0);

                  if (remainingItems.length > 0) {
                    setShowClosePlanConfirmModal(false);
                    // Open Günü / Planı Kapat ve Devret modal
                    openClosePlanModal();
                  } else {
                    // No remaining items, complete the plan with the atomic RPC!
                    await handleCompletePlanWithoutShortage();
                  }
                }}
                disabled={isProcessing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-xs disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'İşlem Yapılıyor...' : 'Evet, Planı Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAN KALEMİ SİLME ONAY MODALI */}
      {showDeleteItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                Üretim Kalemini Sil
              </h3>
              <button
                onClick={() => setShowDeleteItemModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              <p className="text-[12px] text-slate-600 leading-relaxed font-semibold">
                Bu üretim kalemi plandan silinecek. Bu işlem planlanan miktarı ve hammadde ihtiyacını günceller. Devam etmek istiyor musunuz?
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteItemModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDeleteProductionPlanItem}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-xs"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÜRETİM GİRİŞİ SİLME ONAY MODALI */}
      {showDeleteRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 animate-pulse" />
                Üretim Girişini Sil / Geri Al
              </h3>
              <button
                onClick={() => setShowDeleteRunModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3">
              <p className="text-[12px] text-slate-600 leading-relaxed font-semibold">
                Bu üretim girişi silinecek. Bu işlem bu girişe bağlı hammadde tüketimini geri alır ve oluşan nihai ürün stoğunu siler. Devam etmek istiyor musunuz?
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteRunModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDeleteProductionRun}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer text-xs"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÜRETİM GERİ AL ONAY MODALI */}
      {isUndoProductionRunModalOpen && undoProductionRunTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 text-xs">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle size={16} className="text-rose-500 animate-pulse" />
                <span>Üretim Girişini Geri Al</span>
              </div>
              <button 
                type="button"
                onClick={() => { setIsUndoProductionRunModalOpen(false); setUndoProductionRunTarget(null); setUndoProductionRunError(null); }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {undoProductionRunError ? (
                <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-xl space-y-1">
                  <p className="font-bold text-xs">Hata</p>
                  <p className="text-[11px] font-semibold">{undoProductionRunError}</p>
                </div>
              ) : (
                <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-xl space-y-1">
                  <p className="font-bold text-xs">Üretim Geri Alma Onayı</p>
                  <p className="text-[11px]">
                    Bu üretim girişi geri alınacak. Hammadde stoğu, mamul stoğu ve sipariş durumu yeniden hesaplanacak. Devam edilsin mi?
                  </p>
                </div>
              )}

              <div className="space-y-2 border border-slate-100 p-3 rounded-xl bg-slate-50/50">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium block">Miktar</span>
                    <span className="text-slate-800 font-bold block text-emerald-700">
                      {undoProductionRunTarget.producedQuantity} Adet
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Tarih</span>
                    <span className="text-slate-800 font-bold block font-mono">
                      {undoProductionRunTarget.productionDate}
                    </span>
                  </div>
                  {undoProductionRunTarget.lotNo && (
                    <div className="col-span-2">
                      <span className="text-slate-400 font-medium block">Parti No (Lot)</span>
                      <span className="text-indigo-700 font-extrabold block">
                        {undoProductionRunTarget.lotNo}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-600">Geri Alma Nedeni *</label>
                <input
                  type="text"
                  required
                  value={undoProductionRunReason}
                  onChange={(e) => setUndoProductionRunReason(e.target.value)}
                  placeholder="Örn: Yanlış miktar girildi"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 font-bold focus:outline-none focus:border-rose-500 text-slate-800 h-[34px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsUndoProductionRunModalOpen(false); setUndoProductionRunTarget(null); setUndoProductionRunError(null); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors"
                  disabled={isUndoingProductionRun}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const plan = productionPlans.find(p => p.id === undoProductionRunTarget.productionPlanId);
                    if (plan && isProductionPlanClosed(plan)) {
                      setUndoProductionRunError("Bu üretim planı kapalı olduğu için üretim geri alınamaz.");
                      return;
                    }

                    if (!undoProductionRunReason.trim()) {
                      setUndoProductionRunError("Lütfen geri alma nedenini girin.");
                      return;
                    }

                    // Security check: has shipment been made?
                    const linkedFG = finishedGoodsStocks.find(fg => fg.productionRunId === undoProductionRunTarget.id && !fg.isDeleted);
                    if (linkedFG) {
                      const hasShipment = finishedGoodsMovements.some(
                        fgm => fgm.finishedGoodsStockId === linkedFG.id && 
                               (fgm.type === 'Sevkiyat çıkışı' || fgm.movementType === 'Sevkiyat çıkışı') && 
                               !fgm.isDeleted
                      );
                      if (hasShipment || linkedFG.quantityRemaining < linkedFG.quantityProduced) {
                        setUndoProductionRunError("Bu üretim geri alınamaz. Önce ilgili sevkiyat hareketlerini geri alın.");
                        return;
                      }
                    }

                    setIsUndoingProductionRun(true);
                    setUndoProductionRunError(null);
                    try {
                      console.log("Undo production RPC starting", undoProductionRunTarget.id);
                      if (onUndoProductionRun) {
                        const ok = await onUndoProductionRun(undoProductionRunTarget.id, undoProductionRunReason);
                        console.log("Undo production RPC result:", ok);
                        if (ok) {
                          setIsUndoProductionRunModalOpen(false);
                          setUndoProductionRunTarget(null);
                        } else {
                          setUndoProductionRunError("Üretim geri alınırken bir hata oluştu.");
                        }
                      } else {
                        // Fallback delete
                        if (onDeleteProductionRun) {
                          onDeleteProductionRun(undoProductionRunTarget.id);
                        }
                        setIsUndoProductionRunModalOpen(false);
                        setUndoProductionRunTarget(null);
                      }
                    } catch (err: any) {
                      console.error("Undo production RPC error:", err);
                      const errMsg = err.message || String(err);
                      if (errMsg.includes("shipment") || errMsg.includes("sevkiyat") || errMsg.includes("mühür") || errMsg.includes("stok")) {
                        setUndoProductionRunError("Bu üretim geri alınamaz. Önce ilgili sevkiyat hareketlerini geri alın.");
                      } else {
                        setUndoProductionRunError(`Hata: ${errMsg}`);
                      }
                    } finally {
                      setIsUndoingProductionRun(false);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1"
                  disabled={isUndoingProductionRun}
                >
                  {isUndoingProductionRun ? "İşleniyor..." : "Onayla ve Geri Al"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Production Traceability Modal */}
      <ProductionTraceabilityModal
        isOpen={isTraceabilityModalOpen}
        isLoading={isTraceabilityLoading}
        error={traceabilityError}
        data={traceabilityData}
        onClose={() => {
          setIsTraceabilityModalOpen(false);
          // Also set the token reference to ignore pending calls if closed
          traceabilityRequestCounterRef.current += 1;
        }}
        onRetry={traceabilityActiveId ? () => handleOpenProductionTraceability(traceabilityActiveId) : undefined}
      />

    </div>
  );
}
