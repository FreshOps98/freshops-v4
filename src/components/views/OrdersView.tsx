import React, { useState } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (SİPARİŞLER EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - Orders (Siparişler) & OrderItems (Sipariş Kalemleri) -> Müşteri talepleri, miktarlar, birim satış fiyatları.
 *    - Customers -> Siparişi veren müşteri kimliği ve özel sevkiyat notu.
 *    - Products -> Satılan mamul ürünün detayları (gramaj, paketleme katsayıları vb.).
 *    - Recipes & RawMaterials -> Sipariş maliyeti ve hammadde ihtiyaçlarını (MRP) hesaplamak için kullanılır.
 *    - CostSettings -> Paket başı işçilik, genel gider payları vb. parametreler.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAddOrder -> Yeni bir müşteri siparişi (ve ilişkili tüm kalemleri) oluşturur.
 *    - onUpdateOrder -> Sipariş durumunu (Taslak, Onaylandı vb.), miktar ve kalemlerini günceller.
 *    - onDeleteOrder -> Siparişi ve kalemlerini sistemden kaldırır.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - orders -> Siparişe ait üst bilgiler bu tabloya kaydedilir.
 *    - order_items -> Siparişe ait ürün satırları `order_id` referansıyla bu tabloya yazılır.
 *    - product_recipes & raw_materials -> Veritabanı seviyesinde JOIN yapılarak sipariş bazında anlık MRP (Maddi Gereksinim Planlama) raporları çekilebilir.
 */
import { 
  Order, 
  OrderItem, 
  Customer, 
  Product, 
  ProductRecipeItem, 
  RawMaterial, 
  CostSettings, 
  OrderStatus,
  StockMovement,
  ProductionPlanItem,
  FinishedGoodsStock,
  FinishedGoodsMovement,
  ProductionRun
} from '../../types';
import { 
  calculateNetRequirement, 
  calculateSafetyAdjustedRequirement, 
  calculateGrossRequirement, 
  calculateEstimatedWaste, 
  resolveSafetyRate, 
  resolveWasteRate,
  calculateRawMaterialRequirementsForOrder,
  calculateOrderCost,
  calculateWeightedAverageCost,
  calculateOrderOperationalSummary,
  calculateOrderItemOperationalSummary,
  getOrderDisplayNumber,
  calculateOrderRealizedFinancials,
  resolveCostSettingsForOrder
} from '../../services/calcService';
import { formatCurrency, formatWeight, formatDate, formatShortDate } from '../../utils/format';
import { getTodayISO, getTomorrowISO } from '../../utils/dateHelper';
import { Plus, Search, Eye, Edit2, Trash2, X, AlertTriangle, Calculator, DollarSign, CheckCircle2, Sliders, ShoppingBag, Activity } from 'lucide-react';
import { supabaseDataService } from '../../services/supabaseDataService';
import { OrderTraceabilityModal } from '../traceability/OrderTraceabilityModal';
import { OrderTraceabilityResponse } from '../../types';

function renderStatusBadge(status: string) {
  const colors: Record<string, string> = {
    'Taslak': 'bg-slate-100 text-slate-600 border-slate-200',
    'Onaylandı': 'bg-blue-50 text-blue-700 border-blue-200',
    'Üretim Planlandı': 'bg-purple-50 text-purple-700 border-purple-200',
    'Üretildi': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Sevk Edildi': 'bg-emerald-900/10 text-emerald-900 border-emerald-900/20',
    'İptal': 'bg-rose-50 text-rose-700 border-rose-200',
    'Sevkiyata Hazır': 'bg-amber-50 text-amber-700 border-amber-200',
    'Kısmi Sevk': 'bg-indigo-50 text-indigo-700 border-indigo-200'
  };
  const cls = colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      {status}
    </span>
  );
}

function getOrderMetrics(
  orderId: string, 
  items: OrderItem[], 
  planItems: ProductionPlanItem[], 
  fgStocks: FinishedGoodsStock[], 
  fgMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[]
) {
  const summary = calculateOrderOperationalSummary(
    orderId,
    items,
    planItems,
    fgStocks,
    fgMovements,
    productionRuns
  );

  return {
    totalOrderQuantity: summary.orderedQuantity,
    totalPlannedQuantity: summary.effectivePlannedQuantity,
    totalProducedQuantity: summary.producedQuantity,
    nihaiUrunStoguBekleyen: summary.finishedGoodsRemaining,
    totalShippedQuantity: summary.shippedQuantity,
    kalanPlanlanabilirAdet: summary.remainingToPlan,
    kalanUretimAdedi: summary.remainingToProduce,
    kalanSevkiyatAdedi: summary.remainingToShip
  };
}

function getOrderItemMetrics(
  orderItemId: string,
  itemQuantity: number,
  planItems: ProductionPlanItem[], 
  fgStocks: FinishedGoodsStock[], 
  fgMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[],
  productId?: string,
  orderId?: string
) {
  const summary = calculateOrderItemOperationalSummary(
    orderItemId,
    itemQuantity,
    planItems,
    fgStocks,
    fgMovements,
    productionRuns,
    productId,
    orderId
  );

  return {
    totalOrderQuantity: summary.orderedQuantity,
    totalPlannedQuantity: summary.effectivePlannedQuantity,
    totalProducedQuantity: summary.producedQuantity,
    nihaiUrunStoguBekleyen: summary.finishedGoodsRemaining,
    totalShippedQuantity: summary.shippedQuantity,
    kalanPlanlanabilirAdet: summary.remainingToPlan,
    kalanUretimAdedi: summary.remainingToProduce,
    kalanSevkiyatAdedi: summary.remainingToShip
  };
}

function parseDateRobust(dateVal: any): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  const str = String(dateVal).trim();
  if (!str) return null;

  // Check DD.MM.YYYY
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
    const [d, m, y] = str.split('.').map(Number);
    return new Date(y, m - 1, d);
  }

  // Check YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
    const parts = str.split('T')[0].split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d;
}

function compareDates(a: Date | null, b: Date | null, desc: boolean) {
  if (!a && !b) return 0;
  if (!a) return 1; // Put a at the end
  if (!b) return -1; // Put b at the end
  
  const timeA = a.getTime();
  const timeB = b.getTime();
  if (desc) {
    return timeB - timeA;
  } else {
    return timeA - timeB;
  }
}

function canDeleteOrderSafely(
  orderId: string,
  orderItems: OrderItem[],
  productionPlanItems: ProductionPlanItem[],
  finishedGoodsStocks: FinishedGoodsStock[],
  finishedGoodsMovements: FinishedGoodsMovement[],
  productionRuns?: ProductionRun[]
): { canDelete: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const orderItemIds = orderItems.filter(item => item.orderId === orderId).map(item => item.id);

  const matches = (obj: any): boolean => {
    if (!obj) return false;
    
    const oId = obj.orderId || obj.order_id;
    const oiId = obj.orderItemId || obj.order_item_id;
    
    if (oId === orderId) return true;
    if (oiId && orderItemIds.includes(oiId)) return true;

    if (obj.payload) {
      const pOId = obj.payload.orderId || obj.payload.order_id;
      const pOiId = obj.payload.orderItemId || obj.payload.order_item_id;
      if (pOId === orderId) return true;
      if (pOiId && orderItemIds.includes(pOiId)) return true;
    }

    return false;
  };

  const hasPlan = productionPlanItems.some(matches);
  if (hasPlan) {
    reasons.push('Üretim planı mevcut');
  }

  const hasRun = productionRuns?.some(matches);
  if (hasRun) {
    reasons.push('Üretim kaydı mevcut');
  }

  const hasFGStock = finishedGoodsStocks.some(matches);
  if (hasFGStock) {
    reasons.push('Nihai ürün stoğu mevcut');
  }

  const hasFGMovement = finishedGoodsMovements.some(matches);
  if (hasFGMovement) {
    reasons.push('Sevkiyat veya stok hareket kaydı mevcut');
  }

  return {
    canDelete: reasons.length === 0,
    reasons
  };
}

interface OrdersViewProps {
  orders: Order[];
  orderItems: OrderItem[];
  customers: Customer[];
  products: Product[];
  recipes: ProductRecipeItem[];
  rawMaterials: RawMaterial[];
  currentStocks: Record<string, number>;
  costSettings: CostSettings;
  stockMovements: StockMovement[];
  productionPlanItems: ProductionPlanItem[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  productionRuns?: ProductionRun[];
  onAddOrder: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]) => Promise<any> | void;
  onUpdateOrder: (id: string, updates: Partial<Order>, items?: OrderItem[]) => void;
  onDeleteOrder: (id: string) => Promise<boolean> | void;
}

export default function OrdersView({
  orders,
  orderItems,
  customers,
  products,
  recipes,
  rawMaterials,
  currentStocks,
  costSettings,
  stockMovements,
  productionPlanItems,
  finishedGoodsStocks,
  finishedGoodsMovements,
  productionRuns,
  onAddOrder,
  onUpdateOrder,
  onDeleteOrder
}: OrdersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortOption, setSortOption] = useState<string>('orderDateDesc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [deleteBlockInfo, setDeleteBlockInfo] = useState<{ isOpen: boolean; reasons: string[] } | null>(null);
  const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<{ isOpen: boolean; orderId: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, sortOption]);
  
  // View/Modal states
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Traceability Modal states
  const [isTraceabilityModalOpen, setIsTraceabilityModalOpen] = useState(false);
  const [isTraceabilityLoading, setIsTraceabilityLoading] = useState(false);
  const [traceabilityError, setTraceabilityError] = useState<string | null>(null);
  const [traceabilityData, setTraceabilityData] = useState<OrderTraceabilityResponse | null>(null);
  const [traceabilityActiveId, setTraceabilityActiveId] = useState<string | null>(null);
  const traceabilityRequestCounterRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      traceabilityRequestCounterRef.current += 1;
    };
  }, []);

  const handleOpenOrderTraceability = async (orderId: string) => {
    traceabilityRequestCounterRef.current += 1;
    const currentRequestToken = traceabilityRequestCounterRef.current;

    // Clear previous data and show loading in open modal immediately
    setTraceabilityData(null);
    setTraceabilityError(null);
    setTraceabilityActiveId(orderId);
    setIsTraceabilityLoading(true);
    setIsTraceabilityModalOpen(true);

    try {
      const result = await supabaseDataService.getOrderTraceabilityAtomic(orderId);
      // Ensure we only process if this is still the active request
      if (currentRequestToken === traceabilityRequestCounterRef.current) {
        setTraceabilityData(result);
        setIsTraceabilityLoading(false);
      }
    } catch (err: unknown) {
      console.error("Order traceability fetch error:", err);
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

  // Form states - General Order Info
  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(getTodayISO());
  const [deliveryDate, setDeliveryDate] = useState(getTomorrowISO());
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('Onaylandı');
  const [note, setNote] = useState('');

  // Form states - Order Items Builder (temporary list inside modal)
  const [tempItems, setTempItems] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState<string>('350');
  const [customSafetyRate, setCustomSafetyRate] = useState<string>(''); // override
  const [customWasteOverrides, setCustomWasteOverrides] = useState<Record<string, string>>({}); // materialId -> wasteRate

  // Filters
  const statuses: OrderStatus[] = ['Taslak', 'Onaylandı', 'Üretim Planlandı', 'Üretildi', 'Sevkiyata Hazır', 'Kısmi Sevk', 'Sevk Edildi', 'İptal'];

  const handleOpenAddModal = () => {
    setEditingOrder(null);
    setCustomerId(customers[0]?.id || '');
    setOrderDate(getTodayISO());
    setDeliveryDate(getTomorrowISO());
    setOrderStatus('Onaylandı');
    setNote('');
    setTempItems([]);
    
    // reset item line builder
    resetItemLineForm();

    setIsModalOpen(true);
  };

  const handleOpenEditModal = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOrder(order);
    setCustomerId(order.customerId);
    setOrderDate(order.orderDate);
    setDeliveryDate(order.deliveryDate);
    setOrderStatus(order.approvalStatus || (order.status === 'Taslak' || order.status === 'İptal' ? order.status : 'Onaylandı'));
    setNote(order.note);

    const activeItems = orderItems.filter(i => i.orderId === order.id);
    setTempItems(activeItems.map(item => {
      const prod = products.find(p => p.id === item.productId);
      const wastes: Record<string, string> = {};
      if (item.wasteRateOverrides) {
        Object.keys(item.wasteRateOverrides).forEach(k => {
          wastes[k] = String(item.wasteRateOverrides?.[k]);
        });
      }
      return {
        id: item.id,
        productId: item.productId,
        productName: prod?.name || '',
        quantity: item.quantity,
        unitSalePrice: item.unitSalePrice,
        safetyRateOverride: item.safetyRateOverride !== undefined ? String(item.safetyRateOverride) : '',
        wasteRateOverrides: wastes
      };
    }));

    resetItemLineForm();
    setIsModalOpen(true);
  };

  const resetItemLineForm = () => {
    setSelectedProductId(products[0]?.id || '');
    setItemQuantity('350');
    setCustomSafetyRate('');
    setCustomWasteOverrides({});
  };

  const handleAddTempItem = () => {
    if (itemQuantity === undefined || itemQuantity === null || itemQuantity.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const qty = parseInt(itemQuantity, 10);
    if (!selectedProductId || isNaN(qty) || qty <= 0) {
      alert('Lütfen geçerli, pozitif bir sipariş adedi girin.');
      return;
    }
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    // formatted overrides
    const parsedSafety = customSafetyRate !== '' ? parseFloat(customSafetyRate) : undefined;
    const parsedWastes: Record<string, number> = {};
    Object.keys(customWasteOverrides).forEach(k => {
      if (customWasteOverrides[k] !== '') {
        parsedWastes[k] = parseFloat(customWasteOverrides[k]);
      }
    });

    const newItem = {
      id: 'temp_' + Math.random().toString(36).substring(2, 9),
      productId: selectedProductId,
      productName: prod.name,
      quantity: qty,
      unitSalePrice: prod.salePrice,
      safetyRateOverride: customSafetyRate,
      wasteRateOverrides: { ...customWasteOverrides }
    };

    setTempItems([...tempItems, newItem]);
    resetItemLineForm();
  };

  const handleRemoveTempItem = (id: string) => {
    setTempItems(tempItems.filter(t => t.id !== id));
  };

  const handleSaveOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || tempItems.length === 0) {
      alert('Lütfen müşteri seçin ve en az 1 ürün kalemi ekleyin.');
      return;
    }

    const orderData = {
      customerId,
      orderDate,
      deliveryDate,
      approvalStatus: orderStatus,
      computedStatus: orderStatus as any,
      status: orderStatus,
      note
    };

    const formattedItems = tempItems.map(item => {
      const wastes: Record<string, number> = {};
      Object.keys(item.wasteRateOverrides).forEach(k => {
        if (item.wasteRateOverrides[k] !== '') {
          wastes[k] = parseFloat(item.wasteRateOverrides[k]);
        }
      });

      return {
        id: item.id.startsWith('temp_') ? undefined : item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitSalePrice: item.unitSalePrice,
        safetyRateOverride: item.safetyRateOverride !== '' ? parseFloat(item.safetyRateOverride) : undefined,
        wasteRateOverrides: Object.keys(wastes).length > 0 ? wastes : undefined
      } as any;
    });

    try {
      if (editingOrder) {
        await onUpdateOrder(editingOrder.id, orderData, formattedItems);
        if (detailOrder?.id === editingOrder.id) {
          setDetailOrder({ ...detailOrder, ...orderData });
        }
      } else {
        await onAddOrder(orderData, formattedItems);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving order:", err);
      // Keep the modal open and don't reset form so the user can fix/retry
    }
  };

  const handleDeleteOrderClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const checkResult = canDeleteOrderSafely(
      id,
      orderItems,
      productionPlanItems,
      finishedGoodsStocks,
      finishedGoodsMovements,
      productionRuns
    );
    if (!checkResult.canDelete) {
      setDeleteBlockInfo({ isOpen: true, reasons: checkResult.reasons });
    } else {
      setDeleteConfirmInfo({ isOpen: true, orderId: id });
    }
  };

  const confirmDeleteOrder = async () => {
    if (!deleteConfirmInfo?.orderId) return;

    setIsDeleting(true);
    try {
      // 1. Re-check safely
      const checkResult = canDeleteOrderSafely(
        deleteConfirmInfo.orderId,
        orderItems,
        productionPlanItems,
        finishedGoodsStocks,
        finishedGoodsMovements,
        productionRuns
      );
      if (!checkResult.canDelete) {
        setDeleteBlockInfo({ isOpen: true, reasons: checkResult.reasons });
        setDeleteConfirmInfo(null);
        setIsDeleting(false);
        return;
      }

      // 2. Perform the async deletion
      const success = await onDeleteOrder(deleteConfirmInfo.orderId);
      if (success) {
        if (detailOrder?.id === deleteConfirmInfo.orderId) {
          setDetailOrder(null);
        }
        setDeleteConfirmInfo(null);
      }
    } catch (err) {
      console.error("Error in confirmDeleteOrder:", err);
      alert("Sipariş silinirken beklenmeyen bir hata oluştu.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const matchesSearch = (cust?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (o.note || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || o.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  // Sort orders
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortOption) {
      case 'orderDateDesc': {
        const dateA = parseDateRobust(a.orderDate);
        const dateB = parseDateRobust(b.orderDate);
        const dateCompare = compareDates(dateA, dateB, true);
        if (dateCompare !== 0) return dateCompare;
        const createdA = parseDateRobust(a.createdAt);
        const createdB = parseDateRobust(b.createdAt);
        const createdCompare = compareDates(createdA, createdB, true);
        if (createdCompare !== 0) return createdCompare;
        return b.id.localeCompare(a.id);
      }
      case 'orderDateAsc': {
        const dateA = parseDateRobust(a.orderDate);
        const dateB = parseDateRobust(b.orderDate);
        const dateCompare = compareDates(dateA, dateB, false);
        if (dateCompare !== 0) return dateCompare;
        const createdA = parseDateRobust(a.createdAt);
        const createdB = parseDateRobust(b.createdAt);
        const createdCompare = compareDates(createdA, createdB, true);
        if (createdCompare !== 0) return createdCompare;
        return b.id.localeCompare(a.id);
      }
      case 'deliveryDateAsc': {
        const dateA = parseDateRobust(a.deliveryDate);
        const dateB = parseDateRobust(b.deliveryDate);
        return compareDates(dateA, dateB, false);
      }
      case 'deliveryDateDesc': {
        const dateA = parseDateRobust(a.deliveryDate);
        const dateB = parseDateRobust(b.deliveryDate);
        return compareDates(dateA, dateB, true);
      }
      case 'totalPriceDesc': {
        const priceA = orderItems.filter(i => i.orderId === a.id).reduce((sum, i) => sum + (i.quantity * i.unitSalePrice), 0);
        const priceB = orderItems.filter(i => i.orderId === b.id).reduce((sum, i) => sum + (i.quantity * i.unitSalePrice), 0);
        return priceB - priceA;
      }
      case 'totalPriceAsc': {
        const priceA = orderItems.filter(i => i.orderId === a.id).reduce((sum, i) => sum + (i.quantity * i.unitSalePrice), 0);
        const priceB = orderItems.filter(i => i.orderId === b.id).reduce((sum, i) => sum + (i.quantity * i.unitSalePrice), 0);
        return priceA - priceB;
      }
      default:
        return 0;
    }
  });

  const pageSize = 10;
  const totalItems = sortedOrders.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const paginatedOrders = sortedOrders.slice(startIndex, startIndex + pageSize);

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  // Calculate Order Breakdown for Detail Screen
  const getOrderDetailStats = (order: Order) => {
    const activeItems = orderItems.filter(i => i.orderId === order.id);
    const resolvedCostSettings = resolveCostSettingsForOrder(costSettings, order);
    const costBreakdown = calculateOrderCost(activeItems, products, recipes, rawMaterials, resolvedCostSettings, stockMovements);
    const realizedBreakdown = calculateOrderRealizedFinancials(
      activeItems,
      products,
      recipes,
      rawMaterials,
      resolvedCostSettings,
      stockMovements || [],
      finishedGoodsMovements || []
    );

    const itemsCalculations = activeItems.map(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return null;

      const safetyRate = resolveSafetyRate(item, prod, resolvedCostSettings);
      const prodRecipes = recipes.filter(r => r.productId === prod.id);

      const resolvedIngredients = prodRecipes.map(recipe => {
        const rm = rawMaterials.find(m => m.id === recipe.rawMaterialId);
        if (!rm) return null;

        const wasteRate = resolveWasteRate(item, recipe, rm);
        const yieldRate = 100 - wasteRate;

        const netReq = calculateNetRequirement(item.quantity, recipe.quantity, rm.unit === 'kg' ? 'kg' : rm.unit);
        const safetyAdj = calculateSafetyAdjustedRequirement(netReq, safetyRate);
        const grossReq = calculateGrossRequirement(safetyAdj, wasteRate);
        const estimatedWaste = calculateEstimatedWaste(grossReq, safetyAdj);
        const stock = currentStocks[rm.id] || 0;
        const missing = stock < grossReq ? grossReq - stock : 0;

        return {
          materialName: rm.name,
          unit: rm.unit,
          recipeQty: recipe.quantity,
          netReq,
          safetyRate,
          wasteRate,
          yieldRate,
          grossReq,
          estimatedWaste,
          stock,
          missing,
          cost: grossReq * (rm.averageCost ?? calculateWeightedAverageCost(rm.id, stockMovements || [], rm.purchasePrice))
        };
      }).filter(Boolean);

      return {
        item,
        productName: prod.name,
        packageWeightGrams: prod.packageWeightGrams,
        ingredients: resolvedIngredients
      };
    }).filter(Boolean);

    return {
      breakdown: costBreakdown,
      realizedBreakdown,
      items: itemsCalculations
    };
  };

  const orderStats = detailOrder ? getOrderDetailStats(detailOrder) : null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Müşteri Siparişleri</h1>
          <p className="text-sm text-slate-500 mt-1">Sipariş oluşturma, hammadde planlama önizlemesi ve sevk durum takibi.</p>
        </div>
        {!detailOrder && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={16} />
            Yeni Sipariş Gir
          </button>
        )}
      </div>

      {detailOrder && orderStats ? (
        /* DETAILED ORDER BOARD */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
            <button
              onClick={() => setDetailOrder(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
            >
              <X size={16} />
              Sipariş Listesine Geri Dön
            </button>

            <button
              onClick={() => handleOpenOrderTraceability(detailOrder.id)}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-xs inline-flex"
              title="Uçtan Uca Sipariş İzlenebilirliği"
            >
              <Activity size={14} className="text-indigo-600" />
              Sipariş Lot İzlenebilirliği
            </button>
          </div>

          {/* Quick Stats Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center gap-2">
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold self-start">
                  Sipariş No: {getOrderDisplayNumber(detailOrder.id, orders)}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold">Onay:</span>
                  {renderStatusBadge(detailOrder.approvalStatus || (detailOrder.status === 'Taslak' || detailOrder.status === 'İptal' ? detailOrder.status : 'Onaylandı'))}
                  <span className="text-[10px] text-slate-400 font-semibold ml-2">Operasyon:</span>
                  {renderStatusBadge(detailOrder.computedStatus || detailOrder.status)}
                </div>
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                Müşteri: {customers.find(c => c.id === detailOrder.customerId)?.name}
              </h2>
              <div className="text-xs text-slate-400 space-y-1">
                <p>Sipariş Tarihi: {formatDate(detailOrder.orderDate)}</p>
                <p className="font-semibold text-slate-700">Sevk (Teslim) Tarihi: {formatDate(detailOrder.deliveryDate)}</p>
                {detailOrder.note && <p className="italic bg-slate-50 p-2 rounded-lg text-slate-500 mt-1">Not: "{detailOrder.note}"</p>}
              </div>
            </div>

            {/* Discrepancy warning if physical shipping differs from ordered */}
            {orderStats.realizedBreakdown.orderedQuantity !== orderStats.realizedBreakdown.shippedQuantity && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3.5 rounded-xl flex items-start gap-2.5 w-full animate-in fade-in">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Fiziksel Sevk Farkı / Fire Tespit Edildi:</span>
                  <p className="mt-0.5 text-slate-600 leading-relaxed">
                    Sipariş edilen toplam <strong className="text-slate-800">{orderStats.realizedBreakdown.orderedQuantity} paket</strong> üründen, fire/kırık/bozulma sebebiyle yalnızca <strong className="text-slate-800">{orderStats.realizedBreakdown.shippedQuantity} paket</strong> fiilen sevk edildi.
                    {orderStats.realizedBreakdown.orderedQuantity > orderStats.realizedBreakdown.shippedQuantity && (
                      <span className="block mt-1 font-semibold text-rose-700">
                        Sevk edilemeyen eksik miktar: {orderStats.realizedBreakdown.orderedQuantity - orderStats.realizedBreakdown.shippedQuantity} paket
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Financial indicators for the order */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full animate-in fade-in">
              
              {/* ESTIMATED FINANCIALS */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Sipariş / Planlanan Finansallar
                </h4>
                
                <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-slate-400 text-[9px] uppercase font-semibold">Sipariş Toplamı (Ciro)</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(orderStats.breakdown.totalRevenue)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-rose-400 text-[9px] uppercase font-semibold">Planlanan Maliyet</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(orderStats.breakdown.totalCost)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-emerald-400 text-[9px] uppercase font-semibold">Tahmini Kâr</p>
                    <p className={`text-sm font-bold mt-1 ${orderStats.breakdown.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(orderStats.breakdown.totalProfit)}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <p className="text-slate-400 text-[9px] uppercase font-semibold">Tahmini Kâr Marjı</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">%{orderStats.breakdown.profitMarginPercent.toFixed(1)}</p>
                  </div>
                </div>

                {/* Breakdown details */}
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs space-y-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">Birim Maliyet Açılımı</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[9px]">Hammadde & Ambalaj:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.breakdown.rawMaterialCostSum)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">İşçilik Gideri:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.breakdown.laborCost)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Genel Giderler:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.breakdown.overheadCost)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Sevk / Lojistik:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.breakdown.deliveryCost)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* REALIZED FINANCIALS */}
              <div className="bg-emerald-50/30 p-5 rounded-2xl border border-emerald-100/50 space-y-4">
                <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-emerald-100/50 pb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Gerçekleşen / Sevk Edilen Finansallar
                </h4>
                
                <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                  <div className="bg-white p-3 rounded-xl border border-emerald-100/30 shadow-2xs">
                    <p className="text-emerald-500 text-[9px] uppercase font-bold">Gerçekleşen Ciro</p>
                    <p className="text-sm font-black text-emerald-800 mt-1">{formatCurrency(orderStats.realizedBreakdown.realizedRevenue)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100/30 shadow-2xs">
                    <p className="text-rose-500 text-[9px] uppercase font-bold">Gerçekleşen Maliyet</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(orderStats.realizedBreakdown.realizedCost)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100/30 shadow-2xs">
                    <p className="text-emerald-600 text-[9px] uppercase font-bold">Gerçekleşen Net Kâr</p>
                    <p className={`text-sm font-black mt-1 ${orderStats.realizedBreakdown.realizedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatCurrency(orderStats.realizedBreakdown.realizedProfit)}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100/30 shadow-2xs">
                    <p className="text-slate-500 text-[9px] uppercase font-bold">Gerçekleşen Marj</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">%{orderStats.realizedBreakdown.realizedProfitMarginPercent.toFixed(1)}</p>
                  </div>
                </div>

                {/* Realized breakdown details */}
                <div className="bg-white p-3 rounded-xl border border-emerald-100/30 shadow-2xs space-y-2">
                  <p className="text-[9px] font-bold text-emerald-600/70 uppercase tracking-wider border-b border-slate-100 pb-1.5">Sevk Miktarına Göre Fiili Dağılım</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[9px]">Hammadde & Ambalaj:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.realizedBreakdown.rawMaterialCost)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">İşçilik Gideri:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.realizedBreakdown.laborCost)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Genel Giderler:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.realizedBreakdown.overheadCost)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Sevk / Lojistik:</span>
                      <strong className="text-slate-700">{formatCurrency(orderStats.realizedBreakdown.deliveryCost)}</strong>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Sipariş Durum & Adet Detayları (Bento Grid) */}
          {(() => {
            const metrics = getOrderMetrics(detailOrder.id, orderItems, productionPlanItems, finishedGoodsStocks, finishedGoodsMovements, productionRuns);
            return (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4 animate-in fade-in">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sipariş Operasyonel Miktar Özetleri</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4 text-center">
                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                    <p className="text-slate-400 text-[10px] font-semibold uppercase">Sipariş Edilen</p>
                    <p className="text-base font-extrabold text-slate-800 mt-1">{metrics.totalOrderQuantity} Adet</p>
                  </div>
                  <div className="bg-blue-50/30 p-3 rounded-xl border border-blue-50">
                    <p className="text-blue-500 text-[10px] font-semibold uppercase">Planlanan</p>
                    <p className="text-base font-extrabold text-blue-700 mt-1">{metrics.totalPlannedQuantity} Adet</p>
                  </div>
                  <div className="bg-emerald-50/30 p-3 rounded-xl border border-emerald-50">
                    <p className="text-emerald-600 text-[10px] font-semibold uppercase font-bold">Üretilen</p>
                    <p className="text-base font-extrabold text-emerald-700 mt-1">{metrics.totalProducedQuantity} Adet</p>
                  </div>
                  <div className="bg-amber-50/30 p-3 rounded-xl border border-amber-50">
                    <p className="text-amber-500 text-[10px] font-semibold uppercase">Stokta Bekleyen</p>
                    <p className="text-base font-extrabold text-amber-700 mt-1">{metrics.nihaiUrunStoguBekleyen} Adet</p>
                  </div>
                  <div className="bg-teal-50/30 p-3 rounded-xl border border-teal-50">
                    <p className="text-teal-500 text-[10px] font-semibold uppercase">Sevk Edilen</p>
                    <p className="text-base font-extrabold text-teal-700 mt-1">{metrics.totalShippedQuantity} Adet</p>
                  </div>
                  <div className="bg-indigo-50/30 p-3 rounded-xl border border-indigo-50">
                    <p className="text-indigo-500 text-[10px] font-semibold uppercase">Kalan Planlanacak</p>
                    <p className="text-base font-extrabold text-indigo-700 mt-1">{metrics.kalanPlanlanabilirAdet} Adet</p>
                  </div>
                  <div className="bg-orange-50/30 p-3 rounded-xl border border-orange-50">
                    <p className="text-orange-500 text-[10px] font-semibold uppercase">Kalan Üretilecek</p>
                    <p className="text-base font-extrabold text-orange-700 mt-1">{metrics.kalanUretimAdedi} Adet</p>
                  </div>
                  <div className="bg-rose-50/30 p-3 rounded-xl border border-rose-50">
                    <p className="text-rose-500 text-[10px] font-semibold uppercase">Kalan Sevk</p>
                    <p className="text-base font-extrabold text-rose-700 mt-1">{metrics.kalanSevkiyatAdedi} Adet</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ITEM BREAKDOWNS & EXACT MATHEMATICAL VERIFICATIONS */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Hammadde Girdi Gereksinim Analizi</h3>
            
            {orderStats.items.map((line: any, idx: number) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-xs">
                {/* Product details */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-50 pb-2.5">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{line.productName}</h4>
                    <p className="text-[11px] text-slate-400">
                      Tekli paket: {line.packageWeightGrams} g • Sipariş Adedi: <span className="font-bold text-slate-700">{line.item.quantity} Adet</span> (Tutar: <span className="font-semibold text-slate-700">{formatCurrency(line.item.quantity * line.item.unitSalePrice)}</span>)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-bold">
                      Birim Fiyat: {formatCurrency(line.item.unitSalePrice)}
                    </span>
                    {(() => {
                      const itemShipped = finishedGoodsMovements
                        .filter(m => m.orderItemId === line.item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
                        .reduce((sum, m) => sum + (m.quantity || 0), 0);
                      return (
                        <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-100/60 px-2 py-1 rounded-md font-bold">
                          Gerçekleşen Ciro: {formatCurrency(itemShipped * line.item.unitSalePrice)} ({itemShipped} Paket sevk edildi)
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Item-level metrics */}
                {(() => {
                  const itemMetrics = getOrderItemMetrics(line.item.id, line.item.quantity, productionPlanItems, finishedGoodsStocks, finishedGoodsMovements, productionRuns, line.item.productId, line.item.orderId);
                  return (
                    <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-100/80 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 text-center text-[10px] font-semibold text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase">Sipariş Edilen</span>
                        <strong className="text-slate-800 text-[11px] font-bold">{itemMetrics.totalOrderQuantity} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-blue-500 block text-[9px] uppercase">Planlanan</span>
                        <strong className="text-blue-700 text-[11px] font-bold">{itemMetrics.totalPlannedQuantity} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-emerald-600 block text-[9px] uppercase font-bold">Üretilen</span>
                        <strong className="text-emerald-700 text-[11px] font-bold">{itemMetrics.totalProducedQuantity} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-amber-500 block text-[9px] uppercase">Stokta Bekleyen</span>
                        <strong className="text-amber-700 text-[11px] font-bold">{itemMetrics.nihaiUrunStoguBekleyen} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-teal-500 block text-[9px] uppercase">Sevk Edilen</span>
                        <strong className="text-teal-700 text-[11px] font-bold">{itemMetrics.totalShippedQuantity} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-indigo-500 block text-[9px] uppercase">Kalan Planlanacak</span>
                        <strong className="text-indigo-700 text-[11px] font-bold">{itemMetrics.kalanPlanlanabilirAdet} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-orange-500 block text-[9px] uppercase">Kalan Üretilecek</span>
                        <strong className="text-orange-700 text-[11px] font-bold">{itemMetrics.kalanUretimAdedi} Adet</strong>
                      </div>
                      <div className="border-l border-slate-200/60 pl-2">
                        <span className="text-rose-500 block text-[9px] uppercase">Kalan Sevk</span>
                        <strong className="text-rose-700 text-[11px] font-bold">{itemMetrics.kalanSevkiyatAdedi} Adet</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Ingredients table - exactly "Hammadde İhtiyacı" table as specified */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="py-2">Hammadde</th>
                        <th className="py-2 text-right">Net İhtiyaç</th>
                        <th className="py-2 text-right">Fire Oranı %</th>
                        <th className="py-2 text-right">Randıman</th>
                        <th className="py-2 text-right">Güvenlik Payı</th>
                        <th className="py-2 text-right text-emerald-600">Gerekli Ham (Brüt)</th>
                        <th className="py-2 text-right text-amber-600">Tahmini Fire</th>
                        <th className="py-2 text-right">Mevcut Stok</th>
                        <th className="py-2 text-right">Eksik / Fazla</th>
                        <th className="py-2 text-right">Tahmini Maliyet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-700">
                      {line.ingredients.map((ing: any, i: number) => {
                        const isUnder = ing.stock < ing.grossReq;
                        const diff = ing.stock - ing.grossReq;

                        return (
                          <tr key={i}>
                            <td className="py-3 font-semibold text-slate-900">{ing.materialName}</td>
                            <td className="py-3 text-right font-medium">{formatWeight(ing.netReq, ing.unit)}</td>
                            <td className="py-3 text-right text-red-500 font-medium">%{ing.wasteRate}</td>
                            <td className="py-3 text-right text-emerald-600 font-medium">%{ing.yieldRate}</td>
                            <td className="py-3 text-right text-slate-400 font-medium">%{ing.safetyRate}</td>
                            <td className="py-3 text-right font-extrabold text-emerald-700">{formatWeight(ing.grossReq, ing.unit)}</td>
                            <td className="py-3 text-right font-medium text-amber-600">{formatWeight(ing.estimatedWaste, ing.unit)}</td>
                            <td className="py-3 text-right font-semibold text-slate-800">{formatWeight(ing.stock, ing.unit)}</td>
                            <td className={`py-3 text-right font-bold ${isUnder ? 'text-red-600' : 'text-emerald-600'}`}>
                              {isUnder ? (
                                <span>{formatWeight(Math.abs(diff), ing.unit)} Eksik</span>
                              ) : (
                                <span>{formatWeight(diff, ing.unit)} Fazla</span>
                              )}
                            </td>
                            <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(ing.cost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* STANDARD ORDER CATALOG LIST */
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Müşteri adı veya sipariş notu ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 shadow-xs"
            >
              <option value="all">Tüm Durumlar</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 shadow-xs"
            >
              <option value="orderDateDesc">Sipariş Tarihi: Yeniden Eskiye</option>
              <option value="orderDateAsc">Sipariş Tarihi: Eskiden Yeniye</option>
              <option value="deliveryDateAsc">Sevk Tarihi: En Yakından En Uzağa</option>
              <option value="deliveryDateDesc">Sevk Tarihi: En Uzaktan En Yakına</option>
              <option value="totalPriceDesc">Toplam Tutar: Yüksekten Düşüğe</option>
              <option value="totalPriceAsc">Toplam Tutar: Düşükten Yükseğe</option>
            </select>
          </div>

          {/* Orders Listing Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                    <th className="py-3 px-4">Sipariş No</th>
                    <th className="py-3 px-4">Müşteri</th>
                    <th className="py-3 px-4">Sipariş Tarihi</th>
                    <th className="py-3 px-4">Sevk Tarihi</th>
                    <th className="py-3 px-4 text-right">Ürün Adedi</th>
                    <th className="py-3 px-4 text-right">Toplam Tutar</th>
                    <th className="py-3 px-4 text-right">Gerçekleşen Tutar</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-400 font-medium bg-white">
                        Eşleşen sipariş kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((ord) => {
                      const cust = customers.find(c => c.id === ord.customerId);
                      const items = orderItems.filter(i => i.orderId === ord.id);
                      const totalPackages = items.reduce((sum, i) => sum + i.quantity, 0);
                      const totalCiro = items.reduce((sum, i) => sum + (i.quantity * i.unitSalePrice), 0);
                      
                      const realizedCiro = items.reduce((sum, item) => {
                        const shippedQuantity = finishedGoodsMovements
                          .filter(m => m.orderItemId === item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
                          .reduce((innerSum, m) => innerSum + (m.quantity || 0), 0);
                        return sum + (shippedQuantity * item.unitSalePrice);
                      }, 0);

                      return (
                        <tr
                          key={ord.id}
                          onClick={() => setDetailOrder(ord)}
                          className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                        >
                          <td className="py-3.5 px-4 font-bold text-emerald-600">{getOrderDisplayNumber(ord.id, orders)}</td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">{cust?.name}</td>
                          <td className="py-3.5 px-4 text-slate-400">{formatShortDate(ord.orderDate)}</td>
                          <td className="py-3.5 px-4 font-semibold text-slate-700">{formatShortDate(ord.deliveryDate)}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-800">{totalPackages} Paket</td>
                          <td className="py-3.5 px-4 text-right font-bold text-slate-950">{formatCurrency(totalCiro)}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-emerald-700">{formatCurrency(realizedCiro)}</td>
                          <td className="py-3.5 px-4">
                            {renderStatusBadge(ord.computedStatus || ord.status)}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setDetailOrder(ord)}
                              className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-slate-50 cursor-pointer inline-block"
                              title="Detay Görüntüle / Hammadde İhtiyaç Analizi"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={(e) => handleOpenEditModal(ord, e)}
                              className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-slate-50 cursor-pointer inline-block"
                              title="Siparişi Düzenle"
                            >
                              <Edit2 size={13} />
                            </button>
                            {(() => {
                              const checkResult = canDeleteOrderSafely(
                                ord.id,
                                orderItems,
                                productionPlanItems,
                                finishedGoodsStocks,
                                finishedGoodsMovements,
                                productionRuns
                              );
                              return (
                                <button
                                  onClick={(e) => handleDeleteOrderClick(ord.id, e)}
                                  className={`p-1 rounded-md inline-block transition-colors ${
                                    checkResult.canDelete
                                      ? 'text-slate-400 hover:text-red-600 hover:bg-slate-50 cursor-pointer'
                                      : 'text-gray-300 hover:text-gray-400 hover:bg-slate-50/50 cursor-not-allowed'
                                  }`}
                                  title={
                                    checkResult.canDelete
                                      ? 'Siparişi Sil'
                                      : 'Üretim veya operasyon kaydı olan siparişler silinemez.'
                                  }
                                >
                                  <Trash2 size={13} />
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 p-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 font-semibold">
                  Toplam <span className="font-bold text-slate-700">{totalItems}</span> sipariş
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={activePage === 1}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Önceki
                  </button>
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        activePage === page
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={activePage === totalPages}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Sonraki
                  </button>
                </div>
                <p className="text-xs text-slate-400 font-semibold">
                  Sayfa {activePage} / {totalPages}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT ORDER MODAL (LARGE WITH ITEMS BUILDER) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingOrder ? 'Siparişi Düzenle' : 'Yeni Müşteri Siparişi Gir'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSaveOrderSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* SECTION 1: GENERAL DATA */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Müşteri Seçin *</label>
                  <select
                    required
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                  >
                    <option value="">-- Müşteri Seçin --</option>
                    {customers.filter(c => c.isActive).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Sipariş Tarihi *</label>
                  <input
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Sevk (Teslim) Tarihi *</label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Sipariş Onay Durumu *</label>
                  <select
                    value={orderStatus === 'Taslak' || orderStatus === 'Onaylandı' || orderStatus === 'İptal' ? orderStatus : 'Onaylandı'}
                    onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold"
                  >
                    <option value="Taslak">Taslak</option>
                    <option value="Onaylandı">Onaylandı</option>
                    <option value="İptal">İptal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Operasyon Durumu (Sistem)</label>
                  <div className="w-full bg-slate-100/60 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 flex items-center h-[28px] mt-0.5">
                    {(() => {
                      const opStatus = editingOrder 
                        ? (editingOrder.computedStatus || editingOrder.status) 
                        : (orderStatus === 'Taslak' ? 'Taslak' : orderStatus === 'İptal' ? 'İptal' : 'Onaylandı');
                      return renderStatusBadge(opStatus);
                    })()}
                  </div>
                </div>
              </div>

              {/* SECTION 2: TEMPORARY LINE ITEM BUILDER */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Calculator size={14} className="text-emerald-600" />
                  Sipariş Kalemi Ekle
                </h4>
                
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/50 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Ürün Seçin *</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                    >
                      {products.filter(p => p.isActive).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.salePrice)})</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Sipariş Adedi *</label>
                    <input
                      type="text"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Özel Güvenlik % (Override)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Ürün varsayılanı"
                      value={customSafetyRate}
                      onChange={(e) => setCustomSafetyRate(e.target.value)}
                      className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800"
                    />
                  </div>

                  {/* Waste Overrides in ingredients */}
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Özel Malzeme Fire % Overrides</label>
                    <div className="bg-white p-1.5 rounded-lg border border-slate-200 max-h-[80px] overflow-y-auto space-y-1">
                      {selectedProductId && (() => {
                        const prodRecipes = recipes.filter(r => r.productId === selectedProductId);
                        const weightIngredients = prodRecipes.filter(r => {
                          const rm = rawMaterials.find(m => m.id === r.rawMaterialId);
                          return rm?.unit === 'kg';
                        });

                        if (weightIngredients.length === 0) {
                          return <p className="text-[10px] text-slate-400 italic">Meyve/sebze girdisi yok.</p>;
                        }

                        return weightIngredients.map(item => {
                          const rm = rawMaterials.find(m => m.id === item.rawMaterialId);
                          if (!rm) return null;
                          return (
                            <div key={rm.id} className="flex justify-between items-center gap-2 text-[10px]">
                              <span className="truncate max-w-[80px]">{rm.name}:</span>
                              <input
                                type="number"
                                min={0}
                                max={99}
                                placeholder={`Örn: %${rm.defaultWasteRate}`}
                                value={customWasteOverrides[rm.id] || ''}
                                onChange={(e) => setCustomWasteOverrides({
                                  ...customWasteOverrides,
                                  [rm.id]: e.target.value
                                })}
                                className="w-12 bg-slate-50 px-1 border border-slate-200 rounded text-right text-[10px]"
                              />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTempItem}
                    className="md:col-span-1 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-xs transition-colors flex justify-center cursor-pointer"
                  >
                    Ekle
                  </button>
                </div>
              </div>

              {/* SECTION 3: ADDED LINE ITEMS TABLE */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Eklenmiş Ürün Kalemleri</h4>
                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="py-2.5 px-3">Ürün</th>
                        <th className="py-2.5 px-3 text-right">Adet</th>
                        <th className="py-2.5 px-3 text-right">Birim Satış Fiyatı</th>
                        <th className="py-2.5 px-3 text-right">Toplam Satış Tutarı</th>
                        <th className="py-2.5 px-3">Güvenlik / Fire Override</th>
                        <th className="py-2.5 px-3 text-right">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-700">
                      {tempItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                            Henüz sipariş kalemi eklenmedi. Yukarıdan ürün seçip ekleyin.
                          </td>
                        </tr>
                      ) : (
                        tempItems.map((item, i) => {
                          const total = item.quantity * item.unitSalePrice;
                          const hasOverrides = item.safetyRateOverride !== '' || Object.keys(item.wasteRateOverrides || {}).some(k => item.wasteRateOverrides[k] !== '');

                          return (
                            <tr key={item.id || i}>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{item.productName}</td>
                              <td className="py-2.5 px-3 text-right font-bold">{item.quantity} Adet</td>
                              <td className="py-2.5 px-3 text-right">{formatCurrency(item.unitSalePrice)}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(total)}</td>
                              <td className="py-2.5 px-3">
                                {hasOverrides ? (
                                  <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                                    Özel Ayar Var
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTempItem(item.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 size={13} />
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

              {/* Note field */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Sipariş Notu</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ek teslimat istekleri veya notlar..."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800"
                />
              </div>

              {/* Total calculations preview inside modal */}
              {tempItems.length > 0 && (() => {
                const orderTotalCiro = tempItems.reduce((sum, item) => sum + (item.quantity * item.unitSalePrice), 0);
                return (
                  <div className="flex justify-end pt-2">
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-right space-y-1">
                      <p className="text-xs text-emerald-700 font-semibold">Toplam Sipariş Tutarı:</p>
                      <h4 className="text-lg font-black text-emerald-900">{formatCurrency(orderTotalCiro)}</h4>
                      <p className="text-[9px] text-emerald-500">Kayıt sonrasında sistem hammadde stoğu ve maliyet kârlılık raporlarını otomatik çıkarır.</p>
                    </div>
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={tempItems.length === 0}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
                >
                  Siparişi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Blocked Warning Modal */}
      {deleteBlockInfo?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Sipariş silinemez</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bu siparişte üretim veya operasyon kaydı mevcuttur. Üretim planı, üretim kaydı, nihai stok veya sevkiyat bağlantısı olan siparişler silinemez.
                </p>
              </div>
            </div>

            {deleteBlockInfo.reasons && deleteBlockInfo.reasons.length > 0 && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tespit Edilen Bağlantılar:</p>
                <ul className="list-disc list-inside text-xs text-rose-600 font-semibold space-y-1 pl-1">
                  {deleteBlockInfo.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
              <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                Veri bütünlüğünü korumak için bu sipariş sistemde tutulmalıdır.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDeleteBlockInfo(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 transition-colors cursor-pointer font-bold"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmInfo?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">Siparişi silmek üzeresiniz</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Bu sipariş henüz üretim veya sevkiyat sürecine girmediği için güvenli şekilde silinebilir. Sipariş ve sipariş kalemleri kalıcı olarak kaldırılacaktır. Bu işlem geri alınamaz.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 text-xs">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmInfo(null)}
                className="px-4 py-2 border border-slate-200 font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteOrder}
                className="px-4 py-2 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Siliniyor...' : 'Evet, Siparişi Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Order Traceability Modal */}
      <OrderTraceabilityModal
        isOpen={isTraceabilityModalOpen}
        isLoading={isTraceabilityLoading}
        error={traceabilityError}
        data={traceabilityData}
        onClose={() => {
          setIsTraceabilityModalOpen(false);
          // Also set the token reference to ignore pending calls if closed
          traceabilityRequestCounterRef.current += 1;
        }}
        onRetry={traceabilityActiveId ? () => handleOpenOrderTraceability(traceabilityActiveId) : undefined}
      />
    </div>
  );
}
