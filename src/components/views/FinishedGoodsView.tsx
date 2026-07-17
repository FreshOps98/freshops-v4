import React, { useState } from 'react';
import { 
  Product, 
  Order, 
  OrderItem, 
  ProductionPlan, 
  ProductionPlanItem, 
  Customer, 
  FinishedGoodsStock, 
  FinishedGoodsMovement,
  FinishedGoodsStatus
} from '../../types';
import { formatDate, formatShortDate } from '../../utils/format';
import { getOrderDisplayNumber } from '../../services/calcService';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Check, 
  PackageCheck, 
  Truck, 
  Layers, 
  Calendar, 
  Users, 
  ClipboardList, 
  ListOrdered,
  XCircle,
  FileText,
  Sliders,
  X
} from 'lucide-react';
import { getTodayISO, getTomorrowISO } from '../../utils/dateHelper';
import { supabaseDataService } from '../../services/supabaseDataService';
import { ProductionTraceabilityModal } from '../traceability/ProductionTraceabilityModal';
import { ProductionTraceabilityResponse } from '../../types';

interface FinishedGoodsViewProps {
  products: Product[];
  orders: Order[];
  orderItems: OrderItem[];
  productionPlans: ProductionPlan[];
  productionPlanItems: ProductionPlanItem[];
  customers: Customer[];
  finishedGoodsStocks: FinishedGoodsStock[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  onShipFinishedGoods: (idOrShipments: any, quantity?: number, note?: string) => boolean | Promise<boolean>;
  onUpdateFinishedGood: (id: string, updates: Partial<FinishedGoodsStock>) => void;
  onDeleteFinishedGood: (id: string) => void;
  onAdjustFinishedGoodsStock?: (
    idOrAdjustments: any,
    newRemainingOrReason: any,
    reasonOrDate: string,
    dateOrNote: string,
    noteOrLotNo?: string,
    overallPreviousRemaining?: number,
    overallNewRemaining?: number
  ) => void;
  onUndoFinishedGoodsShipment?: (movementId: string, reason?: string) => boolean | Promise<boolean>;
}

interface GroupedFinishedGood {
  groupKey: string; // Composite key
  orderId: string;
  productId: string;
  customerId: string;
  productionPlanId: string;
  productionDate: string;
  deliveryDate: string;
  quantityProduced: number;
  quantityRemaining: number;
  quantityShipped: number;
  status: FinishedGoodsStatus;
  latestActivityDate: string;
  stocks: FinishedGoodsStock[];
}

interface DetailGroup {
  detailGroupKey: string; // lotNo
  lotNo: string;
  productId: string;
  customerId: string;
  orderId: string;
  orderItemId: string;
  quantityProduced: number;
  quantityRemaining: number;
  quantityShipped: number;
  status: FinishedGoodsStatus;
  stocks: FinishedGoodsStock[];
  stockIds: string[];
}

type TabType = 'bugun' | 'stokta' | 'yarin' | 'hazir' | 'sevk' | 'iptal';

export default function FinishedGoodsView({
  products,
  orders,
  orderItems,
  productionPlans,
  productionPlanItems,
  customers,
  finishedGoodsStocks,
  finishedGoodsMovements,
  onShipFinishedGoods,
  onUpdateFinishedGood,
  onDeleteFinishedGood,
  onAdjustFinishedGoodsStock,
  onUndoFinishedGoodsShipment
}: FinishedGoodsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('bugun');
  const [shippedOrdersPage, setShippedOrdersPage] = useState<number>(1);
  const [shipQuantities, setShipQuantities] = useState<Record<string, string>>({});
  const [shipNotes, setShipNotes] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setShippedOrdersPage(1);
  }, [activeTab]);

  // Modals state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [selectedDetailGroup, setSelectedDetailGroup] = useState<DetailGroup | null>(null);

  // Traceability Modal states
  const [isTraceabilityModalOpen, setIsTraceabilityModalOpen] = useState(false);
  const [isTraceabilityLoading, setIsTraceabilityLoading] = useState(false);
  const [traceabilityError, setTraceabilityError] = useState<string | null>(null);
  const [traceabilityData, setTraceabilityData] = useState<ProductionTraceabilityResponse | null>(null);
  const [traceabilityActiveId, setTraceabilityActiveId] = useState<string | null>(null);
  const traceabilityRequestCounterRef = React.useRef(0);

  const handleOpenFinishedGoodsTraceability = async (stockId: string) => {
    traceabilityRequestCounterRef.current += 1;
    const currentRequestToken = traceabilityRequestCounterRef.current;

    // Clear previous data and show loading in open modal immediately
    setTraceabilityData(null);
    setTraceabilityError(null);
    setTraceabilityActiveId(stockId);
    setIsTraceabilityLoading(true);
    setIsTraceabilityModalOpen(true);

    try {
      const result = await supabaseDataService.getFinishedGoodsTraceabilityAtomic(stockId);
      // Ensure we only process if this is still the active request
      if (currentRequestToken === traceabilityRequestCounterRef.current) {
        setTraceabilityData(result);
        setIsTraceabilityLoading(false);
      }
    } catch (err: any) {
      console.error("Finished goods traceability fetch error:", err);
      if (currentRequestToken === traceabilityRequestCounterRef.current) {
        setTraceabilityError(err.message || 'İzlenebilirlik verileri yüklenirken bir hata oluştu.');
        setIsTraceabilityLoading(false);
      }
    }
  };

  // Undo Shipment Modal State
  const [undoTarget, setUndoTarget] = useState<FinishedGoodsMovement | null>(null);
  const [undoReason, setUndoReason] = useState<string>('Kullanıcı tarafından geri alındı');
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // Helper to determine if a shipment movement is the latest active one for its specific stock ID
  const isLatestActiveShipmentForStock = (mId: string, stockId: string) => {
    const stockShipments = finishedGoodsMovements.filter(
      x => !x.isDeleted && 
           x.finishedGoodsStockId === stockId && 
           (x.isShipment || x.type === 'Sevkiyat çıkışı' || x.movementType === 'Sevkiyat çıkışı')
    );
    if (stockShipments.length === 0) return false;
    const sorted = [...stockShipments].sort((a, b) => {
      const timeA = a.createdAt || '';
      const timeB = b.createdAt || '';
      if (timeA && timeB) {
        const cmp = timeB.localeCompare(timeA);
        if (cmp !== 0) return cmp;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
    return sorted[0]?.id === mId;
  };

  // Form state - Correction
  const [correctRemaining, setCorrectRemaining] = useState<string>('');
  const [correctReason, setCorrectReason] = useState<string>('Sayım Farkı');
  const [correctDate, setCorrectDate] = useState<string>(getTodayISO());
  const [correctNote, setCorrectNote] = useState<string>('');

  const todayStr = getTodayISO();
  const tomorrowStr = getTomorrowISO();

  // Helper mappings
  const getProduct = (id: string) => products.find(p => p.id === id);
  const getCustomer = (id: string) => customers.find(c => c.id === id);
  const getOrder = (id: string) => orders.find(o => o.id === id);
  const getPlan = (id: string) => productionPlans.find(p => p.id === id);

  const isProductionReversalMovement = (m: FinishedGoodsMovement) => {
    if (m.isDeleted) return false;
    const mType = m.type;
    const mMovType = m.movementType;
    return mType === 'Üretim Geri Alma' ||
           mType === 'Üretim Geri Alındı' ||
           mMovType === 'Üretim Geri Alma' ||
           mMovType === 'Üretim Geri Alındı';
  };

  const isProductionReversedStock = (stock: FinishedGoodsStock) => {
    if (!stock.isDeleted) return false;

    return finishedGoodsMovements.some(m =>
      !m.isDeleted &&
      (
        m.finishedGoodsStockId === stock.id ||
        (
          stock.productionRunId &&
          m.productionRunId === stock.productionRunId
        )
      ) &&
      isProductionReversalMovement(m)
    );
  };

  const isGenuineCancelStock = (stock: FinishedGoodsStock) => {
    const order = getOrder(stock.orderId);
    const isOrderCancelled = order?.status === 'İptal' || order?.computedStatus === 'İptal' || order?.approvalStatus === 'İptal';
    const isStockCancelled = stock.status === 'İptal' || (stock as any).status?.toLowerCase() === 'cancelled';
    const hasCancelMovement = finishedGoodsMovements.some(m =>
      !m.isDeleted &&
      m.finishedGoodsStockId === stock.id &&
      m.type === 'İptal'
    );
    return isOrderCancelled || isStockCancelled || hasCancelMovement;
  };

  const isGenuineFireStock = (stock: FinishedGoodsStock) => {
    const isStockFire = stock.status === 'Fire';
    const hasFireMovement = finishedGoodsMovements.some(m =>
      !m.isDeleted &&
      m.finishedGoodsStockId === stock.id &&
      m.type === 'Fire çıkışı'
    );
    return isStockFire || hasFireMovement;
  };

  // Only consider non-deleted stocks
  const activeStocks = finishedGoodsStocks.filter(s => !s.isDeleted);

  // Composite key function for grouping
  const getGroupKey = (stock: FinishedGoodsStock) => {
    const orderItemId = stock.orderItemId || (stock as any).order_item_id || '';
    const orderId = stock.orderId || '';
    const productId = stock.productId || '';
    const customerId = stock.customerId || '';
    const deliveryDate = stock.deliveryDate || getOrder(orderId)?.deliveryDate || '';
    
    if (orderItemId) {
      return `${orderItemId}-${productId}-${customerId}-${deliveryDate}`;
    }
    return `${orderId}-${productId}-${customerId}-${deliveryDate}`;
  };

  const getLatestActivityDateForGroup = (stocks: FinishedGoodsStock[]): string => {
    return stocks.reduce((max, s) => {
      const sDate = s.updatedAt || s.createdAt || s.productionDate || '';
      return sDate > max ? sDate : max;
    }, '');
  };

  const getDetailGroups = (stocks: FinishedGoodsStock[]): DetailGroup[] => {
    const groups: Record<string, FinishedGoodsStock[]> = {};
    for (const s of stocks) {
      const lot = s.lotNo || 'Tanımsız';
      if (!groups[lot]) {
        groups[lot] = [];
      }
      groups[lot].push(s);
    }

    return Object.entries(groups).map(([lot, lotStocks]) => {
      const firstStock = lotStocks[0];
      const quantityProduced = lotStocks.reduce((sum, s) => sum + s.quantityProduced, 0);
      const quantityRemaining = lotStocks.reduce((sum, s) => sum + s.quantityRemaining, 0);
      
      // Real shipments only
      const quantityShipped = lotStocks.reduce((sum, s) => {
        const stockShipments = finishedGoodsMovements
          .filter(m => m.finishedGoodsStockId === s.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
          .reduce((sumM, m) => sumM + m.quantity, 0);
        return sum + stockShipments;
      }, 0);

      const allCanceled = lotStocks.every(s => isGenuineCancelStock(s));
      const allFire = lotStocks.every(s => isGenuineFireStock(s));
      let status: FinishedGoodsStatus = 'Stokta';
      if (allCanceled) {
        status = 'İptal';
      } else if (allFire) {
        status = 'Fire';
      } else {
        if (quantityRemaining > 0 && quantityShipped === 0) {
          status = 'Stokta';
        } else if (quantityShipped > 0 && quantityRemaining > 0) {
          status = 'Kısmi Sevk';
        } else if (quantityRemaining === 0 && quantityShipped > 0) {
          status = 'Sevk Edildi';
        } else if (quantityRemaining === 0 && quantityShipped === 0) {
          const anyStockFire = lotStocks.some(s => isGenuineFireStock(s));
          if (anyStockFire) {
            status = 'Fire';
          } else {
            const anyStockCancel = lotStocks.some(s => isGenuineCancelStock(s));
            if (anyStockCancel) {
              status = 'İptal';
            } else {
              status = 'Stokta';
            }
          }
        }
      }

      return {
        detailGroupKey: lot,
        lotNo: lot,
        productId: firstStock.productId,
        customerId: firstStock.customerId,
        orderId: firstStock.orderId,
        orderItemId: firstStock.orderItemId,
        quantityProduced,
        quantityRemaining,
        quantityShipped,
        status,
        stocks: lotStocks,
        stockIds: lotStocks.map(s => s.id)
      };
    });
  };

  const sortGroupedRowsByLatestActivityDesc = (rows: GroupedFinishedGood[]): GroupedFinishedGood[] => {
    return [...rows].sort((a, b) => b.latestActivityDate.localeCompare(a.latestActivityDate));
  };

  const getGroupedFinishedGoodsRows = (tabKey: TabType): GroupedFinishedGood[] => {
    const groups: Record<string, FinishedGoodsStock[]> = {};
    const stocksToProcess = tabKey === 'iptal' 
      ? finishedGoodsStocks.filter(s => !isProductionReversedStock(s))
      : activeStocks;

    for (const stock of stocksToProcess) {
      const key = getGroupKey(stock);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(stock);
    }

    const groupedRows: GroupedFinishedGood[] = Object.entries(groups).map(([key, stocks]) => {
      const sortedStocksForMetadata = [...stocks].sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || a.productionDate || '';
        const dateB = b.updatedAt || b.createdAt || b.productionDate || '';
        return dateB.localeCompare(dateA);
      });

      const latestStock = sortedStocksForMetadata[0];
      const orderId = latestStock.orderId;
      const productId = latestStock.productId;
      const customerId = latestStock.customerId;
      const productionPlanId = latestStock.productionPlanId;

      const order = getOrder(orderId);
      const deliveryDate = latestStock.deliveryDate || order?.deliveryDate || '';

      const productionDate = stocks.reduce((max, s) => {
        const plan = getPlan(s.productionPlanId);
        const pDate = s.productionDate || plan?.productionDate || plan?.date || '';
        return pDate > max ? pDate : max;
      }, '');

      const quantityProduced = stocks.reduce((sum, s) => sum + s.quantityProduced, 0);
      const quantityRemaining = stocks.reduce((sum, s) => sum + s.quantityRemaining, 0);

      // Real shipments only
      const quantityShipped = stocks.reduce((sum, s) => {
        const sShipments = finishedGoodsMovements
          .filter(m => m.finishedGoodsStockId === s.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
          .reduce((sumM, m) => sumM + m.quantity, 0);
        return sum + sShipments;
      }, 0);

      const latestActivityDate = getLatestActivityDateForGroup(stocks);

      const allCanceled = stocks.every(s => isGenuineCancelStock(s));
      const allFire = stocks.every(s => isGenuineFireStock(s));
      let status: FinishedGoodsStatus = 'Stokta';
      if (allCanceled) {
        status = 'İptal';
      } else if (allFire) {
        status = 'Fire';
      } else {
        if (quantityRemaining > 0 && quantityShipped === 0) {
          status = 'Stokta';
        } else if (quantityShipped > 0 && quantityRemaining > 0) {
          status = 'Kısmi Sevk';
        } else if (quantityRemaining === 0 && quantityShipped > 0) {
          status = 'Sevk Edildi';
        } else if (quantityRemaining === 0 && quantityShipped === 0) {
          const anyStockFire = stocks.some(s => isGenuineFireStock(s));
          if (anyStockFire) {
            status = 'Fire';
          } else {
            const anyStockCancel = stocks.some(s => isGenuineCancelStock(s));
            if (anyStockCancel) {
              status = 'İptal';
            } else {
              status = 'Stokta';
            }
          }
        }
      }

      return {
        groupKey: key,
        orderId,
        productId,
        customerId,
        productionPlanId,
        productionDate,
        deliveryDate,
        quantityProduced,
        quantityRemaining,
        quantityShipped,
        status,
        latestActivityDate,
        stocks
      };
    });

    const filteredRows = groupedRows.filter(group => {
      switch (tabKey) {
        case 'bugun':
          return group.stocks.some(stock => {
            const plan = getPlan(stock.productionPlanId);
            const planDate = stock.productionDate || plan?.productionDate || plan?.date;
            return planDate === todayStr || stock.createdAt.startsWith(todayStr);
          });

        case 'stokta':
          return group.quantityRemaining > 0 && group.status !== 'İptal' && group.status !== 'Fire';

        case 'yarin':
          return group.deliveryDate === tomorrowStr && group.quantityRemaining > 0;

        case 'hazir':
          return group.quantityRemaining > 0 && group.status !== 'İptal' && group.status !== 'Fire';

        case 'sevk':
          return group.quantityShipped > 0 || group.status === 'Sevk Edildi';

        case 'iptal': {
          const isOrderCancelled = group.stocks.some(s => {
            const order = getOrder(s.orderId);
            return order?.status === 'İptal' || order?.computedStatus === 'İptal' || order?.approvalStatus === 'İptal';
          });

          const hasCanceledOrFireStatus = group.stocks.some(s => {
            const sStatus = s.status || '';
            return sStatus === 'Fire' || sStatus === 'İptal' || sStatus.toLowerCase() === 'cancelled';
          });

          const hasRelevantMovement = group.stocks.some(s =>
            finishedGoodsMovements.some(m =>
              !m.isDeleted &&
              m.finishedGoodsStockId === s.id &&
              (m.type === 'Fire çıkışı' || m.type === 'İptal')
            )
          );

          return isOrderCancelled || hasCanceledOrFireStatus || hasRelevantMovement;
        }

        default:
          return true;
      }
    });

    return sortGroupedRowsByLatestActivityDesc(filteredRows);
  };

  const currentGroupedList = getGroupedFinishedGoodsRows(activeTab);

  const isShippedTab = activeTab === 'sevk';
  const SHIPPED_TAB_PAGE_SIZE = 10;
  const totalShippedItems = currentGroupedList.length;
  const totalShippedPages = Math.ceil(totalShippedItems / SHIPPED_TAB_PAGE_SIZE) || 1;
  const activeShippedPage = isShippedTab ? Math.min(shippedOrdersPage, totalShippedPages) : 1;

  const listToRender = isShippedTab
    ? currentGroupedList.slice((activeShippedPage - 1) * SHIPPED_TAB_PAGE_SIZE, activeShippedPage * SHIPPED_TAB_PAGE_SIZE)
    : currentGroupedList;

  // FIFO Group Shipment across all lots in the main row
  const handleExecuteGroupShipment = (group: GroupedFinishedGood) => {
    const rawQty = shipQuantities[group.groupKey];
    if (rawQty === undefined || rawQty === null || rawQty.trim() === '') {
      alert("Bu alan boş bırakılamaz.");
      return;
    }
    const qty = parseInt(rawQty, 10);

    if (isNaN(qty) || qty <= 0) {
      alert("Lütfen geçerli, pozitif bir sevk adedi girin.");
      return;
    }

    if (qty > group.quantityRemaining) {
      alert(`Yetersiz stok! En fazla ${group.quantityRemaining} adet sevk edebilirsiniz.`);
      return;
    }

    const sortedStocksForFIFO = [...group.stocks].sort((a, b) => {
      const dateA = a.productionDate || a.createdAt || '';
      const dateB = b.productionDate || b.createdAt || '';
      return dateA.localeCompare(dateB);
    });

    const shipments: { stockId: string; quantity: number }[] = [];
    let remainingToShip = qty;

    for (const stock of sortedStocksForFIFO) {
      if (remainingToShip <= 0) break;
      if (stock.quantityRemaining <= 0) continue;

      const shipFromThisStock = Math.min(remainingToShip, stock.quantityRemaining);
      shipments.push({
        stockId: stock.id,
        quantity: shipFromThisStock
      });
      remainingToShip -= shipFromThisStock;
    }

    const res = onShipFinishedGoods(shipments, undefined, shipNotes[group.groupKey] || '');

    const handleSuccess = (ok: boolean) => {
      if (ok) {
        alert(`${qty} Adet ürün FIFO esasıyla başarıyla sevk edildi!`);
        setShipQuantities(prev => ({ ...prev, [group.groupKey]: '' }));
        setShipNotes(prev => ({ ...prev, [group.groupKey]: '' }));
      }
    };

    if (res instanceof Promise) {
      res.then(handleSuccess).catch(err => {
        console.error("Sevkiyat kaydedilirken hata oluştu:", err);
      });
    } else {
      handleSuccess(res !== false);
    }
  };

  // Dedicated Stock Correction / Adjustment submit
  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDetailGroup) return;

    if (correctRemaining === undefined || correctRemaining === null || correctRemaining.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const newRemaining = parseInt(correctRemaining, 10);
    if (isNaN(newRemaining) || newRemaining < 0) {
      alert('Lütfen geçerli pozitif bir miktar girin.');
      return;
    }

    if (newRemaining > selectedDetailGroup.quantityProduced) {
      alert('Kalan miktar üretilen toplam miktardan büyük olamaz.');
      return;
    }

    // Distribute newRemaining among selectedDetailGroup.stocks
    let remainingToDistribute = newRemaining;
    const sortedStocks = [...selectedDetailGroup.stocks].sort((a, b) => {
      const dateA = a.productionDate || a.createdAt || '';
      const dateB = b.productionDate || b.createdAt || '';
      return dateA.localeCompare(dateB);
    });

    const adjustments: { id: string; newRemaining: number }[] = [];

    for (let i = 0; i < sortedStocks.length; i++) {
      const s = sortedStocks[i];
      let targetRemainingForStock = 0;
      if (i === sortedStocks.length - 1) {
        targetRemainingForStock = Math.max(0, Math.min(remainingToDistribute, s.quantityProduced));
      } else {
        targetRemainingForStock = Math.min(remainingToDistribute, s.quantityProduced);
        remainingToDistribute -= targetRemainingForStock;
      }

      adjustments.push({ id: s.id, newRemaining: targetRemainingForStock });

      if (!onAdjustFinishedGoodsStock) {
        onUpdateFinishedGood(s.id, {
          quantityRemaining: targetRemainingForStock,
          note: `${s.note || ''} (Stok Düzeltme: ${correctReason} - ${targetRemainingForStock} Adet, ${correctNote})`.trim()
        });
      }
    }

    if (onAdjustFinishedGoodsStock) {
      onAdjustFinishedGoodsStock(
        adjustments,
        correctReason,
        correctDate,
        correctNote,
        selectedDetailGroup.lotNo,
        selectedDetailGroup.quantityRemaining,
        newRemaining
      );
    }

    alert(`${newRemaining} Adet yeni kalan miktar ${selectedDetailGroup.lotNo} partisi için kaydedildi!`);
    setIsCorrectionModalOpen(false);
    setSelectedDetailGroup(null);
  };

  // CARD CALCULATIONS
  const bugünÜretilenToplam = activeStocks
    .filter(s => {
      const plan = getPlan(s.productionPlanId);
      const planDate = s.productionDate || plan?.productionDate || plan?.date;
      return planDate === todayStr || s.createdAt.startsWith(todayStr);
    })
    .reduce((sum, s) => sum + s.quantityProduced, 0);

  const stoktaKalanHazırÜrün = activeStocks.reduce((sum, s) => sum + s.quantityRemaining, 0);

  const yarınGidecekSiparişPayı = orderItems
    .filter(item => {
      const o = getOrder(item.orderId);
      return o?.deliveryDate === tomorrowStr && o.status !== 'İptal';
    })
    .reduce((sum, item) => sum + item.quantity, 0);

  const sevkEdilenMiktar = finishedGoodsMovements
    .filter(m => m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
    .reduce((sum, m) => sum + m.quantity, 0);

  return (
    <div className="space-y-6 text-xs font-sans text-slate-800">
      
      {/* CARD STATUS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Bugün Üretilen Toplam</p>
          <h3 className="text-xl font-black text-emerald-950">
            {bugünÜretilenToplam} Pkt
          </h3>
          <p className="text-[10px] text-emerald-600">Bugünkü üretimlerden nihai stoğa giren.</p>
        </div>

        <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">Stokta Kalan Hazır Ürün</p>
          <h3 className="text-xl font-black text-blue-950">
            {stoktaKalanHazırÜrün} Pkt
          </h3>
          <p className="text-[10px] text-blue-600">Sevkiyatı bekleyen hazır paket miktarı.</p>
        </div>

        <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Yarın Gidecek Sipariş Payı</p>
          <h3 className="text-xl font-black text-amber-950">
            {yarınGidecekSiparişPayı} Pkt
          </h3>
          <p className="text-[10px] text-amber-600">Yarın ({tomorrowStr}) vadeli sipariş talepleri.</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1 shadow-xs">
          <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Sevk Edilen Miktar</p>
          <h3 className="text-xl font-black text-slate-900">
            {sevkEdilenMiktar} Pkt
          </h3>
          <p className="text-[10px] text-slate-500">Müşterilere fiilen çıkışı yapılan kümülatif.</p>
        </div>
      </div>

      {/* CORE STOCK TABS CONTROL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50 px-5 pt-3.5 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTab('bugun')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'bugun'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Bugün Üretildi ({getGroupedFinishedGoodsRows('bugun').length})
          </button>
          
          <button
            onClick={() => setActiveTab('stokta')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'stokta'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Stokta Bekleyenler ({getGroupedFinishedGoodsRows('stokta').length})
          </button>

          <button
            onClick={() => setActiveTab('yarin')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'yarin'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Yarın Gidecek ({getGroupedFinishedGoodsRows('yarin').length})
          </button>

          <button
            onClick={() => setActiveTab('hazir')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'hazir'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sevkiyata Hazır ({getGroupedFinishedGoodsRows('hazir').length})
          </button>

          <button
            onClick={() => setActiveTab('sevk')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'sevk'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Sevk Edilen ({getGroupedFinishedGoodsRows('sevk').length})
          </button>

          <button
            onClick={() => setActiveTab('iptal')}
            className={`px-4 py-2 text-xs font-bold transition-all rounded-t-xl border-b-2 cursor-pointer ${
              activeTab === 'iptal'
                ? 'border-emerald-600 text-emerald-700 bg-white font-extrabold shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            İptal / Fire ({getGroupedFinishedGoodsRows('iptal').length})
          </button>
        </div>

        {/* LEDGER GRID TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase bg-slate-50/10">
                <th className="py-3 px-4">Bağlı Üretim Planı</th>
                <th className="py-3 px-4">Üretim / Teslim Tarihi</th>
                <th className="py-3 px-4">Müşteri / Sipariş No</th>
                <th className="py-3 px-4">Ürün</th>
                <th className="py-3 px-4 text-right">Üretilen Adet</th>
                <th className="py-3 px-4 text-right">Sevk Edilen</th>
                <th className="py-3 px-4 text-right">Kalan Adet</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-4 text-center">Yönetim</th>
                <th className="py-3 px-4 text-right w-64">Sevkiyat Çıkışı Yap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {listToRender.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 font-medium italic">
                    Bu sekmede görüntülenecek herhangi bir nihai ürün stoğu bulunmuyor.
                  </td>
                </tr>
              ) : (
                listToRender.map(group => {
                  const product = getProduct(group.productId);
                  const customer = getCustomer(group.customerId);
                  const planIds = Array.from(new Set(group.stocks.map(s => s.productionPlanId).filter(Boolean)));
                  
                  const prodDates = Array.from(new Set(group.stocks.map(s => {
                    const plan = getPlan(s.productionPlanId);
                    return s.productionDate || plan?.productionDate || plan?.date || '';
                  }).filter(Boolean)));
                  const displayProdDate = prodDates.sort().map(d => formatShortDate(d)).join(' / ');
                  const displayDelivDate = formatShortDate(group.deliveryDate);

                  const isExpanded = !!expandedGroups[group.groupKey];
                  const lotsCount = Array.from(new Set(group.stocks.map(s => s.lotNo).filter(Boolean))).length;

                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr 
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [group.groupKey]: !isExpanded }))}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">
                          {planIds.length > 0 ? planIds.map(pid => `P-#${pid.substring(0, 5).toUpperCase()}`).join(', ') : 'Manuel'}
                          <span className="block text-[9px] text-slate-400 font-normal">Plan No</span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              <Layers size={10} className="text-slate-400" />
                              {displayProdDate || 'Girilmemiş'}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Calendar size={10} className="text-slate-400" />
                              {displayDelivDate || 'Girilmemiş'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-slate-900">{customer?.name || 'Silinmiş Müşteri'}</span>
                            <span className="text-[10px] font-mono text-slate-400">Sipariş: {getOrderDisplayNumber(group.orderId, orders)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-bold text-slate-800">
                          <div>
                            <div>{product?.name || 'Silinmiş Ürün'}</div>
                            <span className="inline-flex mt-1 text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-bold w-fit">
                              {lotsCount} Parti
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right font-black text-slate-700">{group.quantityProduced} Pkt</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          {group.quantityShipped > 0 ? `${group.quantityShipped} Pkt` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-amber-700">{group.quantityRemaining} Pkt</td>

                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${
                            group.status === 'Sevk Edildi' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            group.status === 'Kısmi Sevk' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            group.status === 'Stokta' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            group.status === 'İptal' ? 'bg-red-50 text-red-700 border-red-200' :
                            group.status === 'Fire' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {group.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedGroups(prev => ({ ...prev, [group.groupKey]: !isExpanded }));
                            }}
                            className={`px-2.5 py-1 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg cursor-pointer inline-flex items-center gap-1 font-bold ${
                              isExpanded ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'border border-slate-200'
                            }`}
                          >
                            <span>{isExpanded ? 'Detayları Gizle' : 'Detayları Göster'}</span>
                            <span className="bg-slate-200/60 text-slate-700 text-[10px] px-1.5 py-0.1 rounded-full">{lotsCount}</span>
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                          {group.quantityRemaining > 0 ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <input
                                type="number"
                                placeholder={group.quantityRemaining.toString()}
                                value={shipQuantities[group.groupKey] !== undefined ? shipQuantities[group.groupKey] : ''}
                                onChange={(e) => setShipQuantities({ ...shipQuantities, [group.groupKey]: e.target.value })}
                                className="w-14 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-[11px]"
                              />
                              <input
                                type="text"
                                placeholder="Sevk Notu..."
                                value={shipNotes[group.groupKey] || ''}
                                onChange={(e) => setShipNotes({ ...shipNotes, [group.groupKey]: e.target.value })}
                                className="w-24 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[10px]"
                              />
                              <button
                                onClick={() => handleExecuteGroupShipment(group)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-2 py-1 rounded transition-colors text-[10px] cursor-pointer inline-flex items-center gap-1"
                              >
                                <Truck size={10} />
                                Grup Sevk Et
                              </button>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-bold flex items-center justify-end gap-1 ${
                              group.status === 'İptal' ? 'text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-lg' :
                              group.status === 'Fire' ? 'text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-lg' :
                              'text-emerald-600'
                            }`}>
                              {group.status === 'İptal' ? (
                                <>
                                  <XCircle size={10} /> Sipariş İptal Edildi
                                </>
                              ) : group.status === 'Fire' ? (
                                <>
                                  <AlertTriangle size={10} /> Tamamı Fire / Zayiat
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={11} /> Sevkiyatı Tamamlandı
                                </>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/40">
                          <td colSpan={10} className="p-4 border-t border-b border-slate-100">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                                  <Layers size={13} className="text-slate-400" />
                                  Parti No Bazlı Stok Detayları
                                </span>
                                <span className="text-[10px] text-slate-400">Toplam {lotsCount} Parti Grubu</span>
                              </div>
                              
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase bg-slate-50/20">
                                    <th className="py-2.5 px-3">Parti Numarası / Geçmiş</th>
                                    <th className="py-2.5 px-3">Üretim / Teslim Tarihi</th>
                                    <th className="py-2.5 px-3 text-right">Üretilen Toplam</th>
                                    <th className="py-2.5 px-3 text-right">Sevk Edilen</th>
                                    <th className="py-2.5 px-3 text-right">Kalan Envanter</th>
                                    <th className="py-2.5 px-3">Durum</th>
                                    <th className="py-2.5 px-3 text-center">Yönetim</th>
                                    <th className="py-2.5 px-3 text-right w-64">Parti Özel Sevkiyatı</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-600 bg-white">
                                  {getDetailGroups(group.stocks).map(detailGroup => {
                                    const dates = Array.from(new Set(detailGroup.stocks.map(s => s.productionDate).filter(Boolean)));
                                    const displayProdDate = dates.sort().map(d => formatShortDate(d)).join(' - ');
                                    const displayDelivDate = formatShortDate(group.deliveryDate);
                                    
                                    // Extract adjustments for this lot
                                    const lotAdjs = finishedGoodsMovements.filter(m => 
                                      detailGroup.stockIds.includes(m.finishedGoodsStockId) && 
                                      (m.type === 'Sayım düzeltmesi' || m.movementType === 'stock_adjustment') &&
                                      !m.isDeleted
                                    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

                                    return (
                                      <tr key={detailGroup.detailGroupKey} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="py-3 px-3 font-mono font-bold text-slate-600">
                                          <div>
                                            <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 font-bold text-[10px]">
                                              Parti No: {detailGroup.lotNo}
                                            </span>
                                            
                                            {detailGroup.stocks.length > 1 ? (
                                              <div className="mt-1.5 space-y-1">
                                                <span className="block text-[9px] text-indigo-900/70 font-semibold mb-1">
                                                  Birleştirilen Kayıtlar ({detailGroup.stocks.length} Giriş):
                                                </span>
                                                {detailGroup.stocks.map((s, idx) => (
                                                  <div key={s.id} className="flex items-center justify-between gap-2 bg-slate-50/80 hover:bg-slate-100 p-1 rounded border border-slate-100 text-[9px] font-medium text-slate-600">
                                                    <span>Giriş #{idx + 1}: {s.quantityProduced} Pkt / Kalan: {s.quantityRemaining} Pkt</span>
                                                    <button
                                                      onClick={() => handleOpenFinishedGoodsTraceability(s.id)}
                                                      className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold px-1.5 py-0.5 rounded text-[8px] transition-colors cursor-pointer shrink-0"
                                                      title="Kaydın girdi lot izlenebilirliği"
                                                    >
                                                      İzlenebilirlik
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              detailGroup.stocks[0]?.id && (
                                                <div className="mt-1.5">
                                                  <button
                                                    onClick={() => handleOpenFinishedGoodsTraceability(detailGroup.stocks[0].id)}
                                                    className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold px-1.5 py-0.5 rounded text-[9px] transition-all cursor-pointer inline-flex items-center gap-0.5 shrink-0"
                                                    title="Parti girdi lot izlenebilirliği"
                                                  >
                                                    İzlenebilirlik
                                                  </button>
                                                </div>
                                              )
                                            )}
                                            
                                            {/* Dynamic Adjustment Logs */}
                                            {lotAdjs.length > 0 && (() => {
                                              const latestAdj = lotAdjs[0];
                                              const sessionMovements = lotAdjs.filter(m => {
                                                const timeDiff = Math.abs(new Date(m.createdAt).getTime() - new Date(latestAdj.createdAt).getTime());
                                                return timeDiff <= 5000 && m.reason === latestAdj.reason;
                                              });

                                              const prevTotal = detailGroup.stocks.reduce((sum, s) => {
                                                const m = sessionMovements.find(mov => mov.finishedGoodsStockId === s.id);
                                                return sum + (m ? (m.previousQuantity ?? 0) : s.quantityRemaining);
                                              }, 0);

                                              const newTotal = detailGroup.stocks.reduce((sum, s) => {
                                                const m = sessionMovements.find(mov => mov.finishedGoodsStockId === s.id);
                                                return sum + (m ? (m.newQuantity ?? 0) : s.quantityRemaining);
                                              }, 0);

                                              const diff = newTotal - prevTotal;
                                              const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

                                              return (
                                                <div className="mt-1.5 text-[10px] text-amber-600 font-semibold flex flex-col gap-0.5 bg-amber-50/50 p-1.5 rounded-lg border border-amber-100/50 w-fit">
                                                  <span>
                                                    Son düzeltme: {prevTotal} Pkt → {newTotal} Pkt
                                                  </span>
                                                  <span>
                                                    Sayım farkı: {diffStr} Pkt
                                                  </span>
                                                  <span className="text-[9px] text-slate-400 font-normal">
                                                    Nedeni: {latestAdj.reason || 'Belirtilmemiş'} ({formatShortDate(latestAdj.date)})
                                                  </span>
                                                  {lotAdjs.length > sessionMovements.length && (
                                                    <span className="text-[9px] text-amber-800 underline font-bold">
                                                      +{lotAdjs.length - sessionMovements.length} geçmiş düzeltme daha var
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </td>
                                        
                                        <td className="py-3 px-3 text-slate-500">
                                          <div className="flex flex-col gap-0.5 text-[10px]">
                                            <span className="font-semibold text-slate-700">{displayProdDate || 'Girilmemiş'}</span>
                                            <span className="text-slate-400">Termin: {displayDelivDate || 'Girilmemiş'}</span>
                                          </div>
                                        </td>
                                        
                                        <td className="py-3 px-3 text-right font-black text-slate-700">{detailGroup.quantityProduced} Pkt</td>
                                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                                          {detailGroup.quantityShipped > 0 ? `${detailGroup.quantityShipped} Pkt` : '-'}
                                        </td>
                                        <td className="py-3 px-3 text-right font-black text-amber-700">{detailGroup.quantityRemaining} Pkt</td>
                                        
                                        <td className="py-3 px-3">
                                          <span className={`inline-flex px-1.5 py-0.5 rounded-full font-bold text-[8px] uppercase border ${
                                            detailGroup.status === 'Sevk Edildi' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            detailGroup.status === 'Kısmi Sevk' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            detailGroup.status === 'Stokta' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            detailGroup.status === 'İptal' ? 'bg-red-50 text-red-700 border-red-200' :
                                            detailGroup.status === 'Fire' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                            'bg-slate-50 text-slate-600 border-slate-200'
                                          }`}>
                                            {detailGroup.status}
                                          </span>
                                        </td>
                                        
                                        {/* Management action: ONLY "Düzelt" is present here */}
                                        <td className="py-3 px-3 text-center">
                                          <button
                                            onClick={() => {
                                              setSelectedDetailGroup(detailGroup);
                                              setCorrectRemaining(detailGroup.quantityRemaining.toString());
                                              setCorrectReason('Sayım Farkı');
                                              setCorrectDate(getTodayISO());
                                              setCorrectNote('');
                                              setIsCorrectionModalOpen(true);
                                            }}
                                            className="px-2.5 py-1 text-amber-600 hover:bg-amber-50 border border-amber-200 rounded-lg cursor-pointer inline-flex items-center gap-1 font-bold text-[10px]"
                                            title="Stok Düzelt"
                                          >
                                            <Sliders size={10} />
                                            <span>Düzelt</span>
                                          </button>
                                        </td>
                                        
                                        {/* Shipment form input for the lot */}
                                        <td className="py-3 px-3 text-right">
                                          {detailGroup.quantityRemaining > 0 ? (
                                            <div className="flex items-center gap-1 justify-end">
                                              <input
                                                type="number"
                                                placeholder={detailGroup.quantityRemaining.toString()}
                                                value={shipQuantities[detailGroup.detailGroupKey] !== undefined ? shipQuantities[detailGroup.detailGroupKey] : ''}
                                                onChange={(e) => setShipQuantities({ ...shipQuantities, [detailGroup.detailGroupKey]: e.target.value })}
                                                className="w-12 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-[10px]"
                                              />
                                              <input
                                                type="text"
                                                placeholder="Not..."
                                                value={shipNotes[detailGroup.detailGroupKey] || ''}
                                                onChange={(e) => setShipNotes({ ...shipNotes, [detailGroup.detailGroupKey]: e.target.value })}
                                                className="w-16 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[9px]"
                                              />
                                              <button
                                                onClick={() => {
                                                  const rawQty = shipQuantities[detailGroup.detailGroupKey];
                                                  if (rawQty === undefined || rawQty === null || rawQty.trim() === '') {
                                                    alert("Bu alan boş bırakılamaz.");
                                                    return;
                                                  }
                                                  const qty = parseInt(rawQty, 10);

                                                  if (isNaN(qty) || qty <= 0) {
                                                    alert("Lütfen geçerli, pozitif bir sevk adedi girin.");
                                                    return;
                                                  }

                                                  if (qty > detailGroup.quantityRemaining) {
                                                    alert(`Yetersiz stok! En fazla ${detailGroup.quantityRemaining} adet sevk edebilirsiniz.`);
                                                    return;
                                                  }

                                                  // FIFO Shipment inside this specific lot
                                                  const sortedStocks = [...detailGroup.stocks].sort((a, b) => {
                                                    const dateA = a.productionDate || a.createdAt || '';
                                                    const dateB = b.productionDate || b.createdAt || '';
                                                    return dateA.localeCompare(dateB);
                                                  });

                                                  const shipments: { stockId: string; quantity: number }[] = [];
                                                  let remainingToShip = qty;

                                                  for (const s of sortedStocks) {
                                                    if (remainingToShip <= 0) break;
                                                    if (s.quantityRemaining <= 0) continue;

                                                    const shipFromThisStock = Math.min(remainingToShip, s.quantityRemaining);
                                                    shipments.push({
                                                      stockId: s.id,
                                                      quantity: shipFromThisStock
                                                    });
                                                    remainingToShip -= shipFromThisStock;
                                                  }

                                                  const res = onShipFinishedGoods(shipments, undefined, shipNotes[detailGroup.detailGroupKey] || '');

                                                  const handleSuccess = (ok: boolean) => {
                                                    if (ok) {
                                                      alert(`${qty} Adet ürün ${detailGroup.lotNo} partisinden başarıyla sevk edildi!`);
                                                      setShipQuantities(prev => ({ ...prev, [detailGroup.detailGroupKey]: '' }));
                                                      setShipNotes(prev => ({ ...prev, [detailGroup.detailGroupKey]: '' }));
                                                    }
                                                  };

                                                  if (res instanceof Promise) {
                                                    res.then(handleSuccess).catch(err => {
                                                      console.error("Sevkiyat kaydedilirken hata oluştu:", err);
                                                    });
                                                  } else {
                                                    handleSuccess(res !== false);
                                                  }
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-1.5 py-0.5 rounded transition-colors text-[9px] cursor-pointer inline-flex items-center gap-0.5"
                                              >
                                                <Truck size={8} />
                                                Sevk Et
                                              </button>
                                            </div>
                                          ) : (
                                            <span className={`text-[9px] font-bold flex items-center justify-end gap-0.5 ${
                                              detailGroup.status === 'İptal' ? 'text-rose-600 bg-rose-50/50 px-1 py-0.2 rounded font-extrabold border border-rose-100' :
                                              detailGroup.status === 'Fire' ? 'text-amber-600 bg-amber-50/50 px-1 py-0.2 rounded font-extrabold border border-amber-100' :
                                              'text-emerald-600 font-bold'
                                            }`}>
                                              {detailGroup.status === 'İptal' ? (
                                                <>
                                                  <XCircle size={8} /> İptal Edildi
                                                </>
                                              ) : detailGroup.status === 'Fire' ? (
                                                <>
                                                  <AlertTriangle size={8} /> Fire / Zayiat
                                                </>
                                              ) : (
                                                <>
                                                  <CheckCircle2 size={9} /> Sevk Edildi
                                                </>
                                              )}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Shipped Tab Pagination Controls */}
        {isShippedTab && totalShippedItems > 0 && (() => {
          const pageNumbers = [];
          for (let i = 1; i <= totalShippedPages; i++) {
            pageNumbers.push(i);
          }
          return (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 p-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-semibold">
                Toplam <span className="font-bold text-slate-700">{totalShippedItems}</span> sevk kaydı
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShippedOrdersPage(prev => Math.max(prev - 1, 1))}
                  disabled={activeShippedPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Önceki
                </button>
                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setShippedOrdersPage(page)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      activeShippedPage === page
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShippedOrdersPage(prev => Math.min(prev + 1, totalShippedPages))}
                  disabled={activeShippedPage === totalShippedPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Sonraki
                </button>
              </div>
              <p className="text-xs text-slate-400 font-semibold">
                Sayfa {activeShippedPage} / {totalShippedPages}
              </p>
            </div>
          );
        })()}
      </div>

      {/* STOK DÜZELT MODAL (CORRECTION) */}
      {isCorrectionModalOpen && selectedDetailGroup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 text-xs">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 font-bold">
                <Sliders size={16} className="text-amber-500" />
                <span>Nihai Ürün Stok Düzelt</span>
              </div>
              <button onClick={() => { setIsCorrectionModalOpen(false); setSelectedDetailGroup(null); }} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCorrectionSubmit} className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl space-y-1">
                <p className="font-bold text-xs">Fiziksel Sayım Düzeltmesi</p>
                <p className="text-[11px]">Fiziksel sayım, zayiat, fire veya paket kaybı gibi durumlarda kalan stok miktarını düzeltirsiniz. Bu işlem sevkiyat olarak sayılmaz.</p>
              </div>

              <div className="space-y-2 border border-slate-100 p-3 rounded-xl bg-slate-50/50">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium block">Ürün</span>
                    <span className="text-slate-800 font-bold block">
                      {getProduct(selectedDetailGroup.productId)?.name || 'Bilinmiyor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Sipariş No</span>
                    <span className="text-slate-800 font-bold block font-mono">
                      {getOrderDisplayNumber(selectedDetailGroup.orderId, orders)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Müşteri</span>
                    <span className="text-slate-800 font-bold block">
                      {getCustomer(selectedDetailGroup.customerId)?.name || 'Bilinmiyor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Parti No (Readonly)</span>
                    <span className="text-slate-800 font-bold block font-mono">
                      {selectedDetailGroup.lotNo}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Mevcut Kalan Stok</label>
                  <div className="w-full bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 font-bold h-[34px] flex items-center text-slate-500 select-none">
                    {selectedDetailGroup.quantityRemaining} Pkt
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Yeni Doğru Kalan Stok *</label>
                  <input
                    type="number"
                    required
                    value={correctRemaining}
                    onChange={(e) => setCorrectRemaining(e.target.value)}
                    placeholder="Gerçek kalan adet"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 font-bold focus:outline-none focus:border-emerald-500 text-slate-800 h-[34px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Düzeltme Nedeni</label>
                  <select
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 focus:outline-none h-[34px] cursor-pointer"
                  >
                    <option value="Sayım Farkı">Sayım Farkı</option>
                    <option value="Hasar / Kırılma">Hasar / Kırılma</option>
                    <option value="Paket Zayiatı">Paket Zayiatı</option>
                    <option value="Müşteri İadesi">Müşteri İadesi</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Düzeltme Tarihi *</label>
                  <input
                    type="date"
                    required
                    value={correctDate}
                    onChange={(e) => setCorrectDate(e.target.value)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 focus:outline-none h-[34px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Düzeltme Notu</label>
                <input
                  type="text"
                  value={correctNote}
                  onChange={(e) => setCorrectNote(e.target.value)}
                  placeholder="Eklemek istediğiniz açıklama..."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 focus:outline-none h-[34px]"
                />
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => { setIsCorrectionModalOpen(false); setSelectedDetailGroup(null); }}
                  className="px-4 py-2 border border-slate-200 font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 cursor-pointer shadow-sm"
                >
                  Düzeltmeyi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEVKİYAT GERİ AL MODAL (UNDO SHIPMENT) */}
      {isUndoModalOpen && undoTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 text-xs">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 font-bold">
                <X size={16} className="text-rose-500" />
                <span>Sevkiyat Çıkışını Geri Al</span>
              </div>
              <button 
                type="button"
                onClick={() => { setIsUndoModalOpen(false); setUndoTarget(null); }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-xl space-y-1">
                <p className="font-bold text-xs">Sevkiyat Geri Alma Onayı</p>
                <p className="text-[11px]">
                  Bu sevkiyat hareketi geri alınacak. Mamul stoğu ve sipariş durumu yeniden hesaplanacak. Devam edilsin mi?
                </p>
              </div>

              <div className="space-y-2 border border-slate-100 p-3 rounded-xl bg-slate-50/50">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium block">Ürün</span>
                    <span className="text-slate-800 font-bold block">
                      {getProduct(undoTarget.productId)?.name || 'Bilinmiyor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Miktar</span>
                    <span className="text-slate-800 font-bold block">
                      {undoTarget.quantity} Pkt
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Müşteri</span>
                    <span className="text-slate-800 font-bold block">
                      {getCustomer(undoTarget.customerId)?.name || 'Bilinmiyor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block">Tarih</span>
                    <span className="text-slate-800 font-bold block font-mono">
                      {undoTarget.date}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-600">Geri Alma Nedeni *</label>
                <input
                  type="text"
                  required
                  value={undoReason}
                  onChange={(e) => setUndoReason(e.target.value)}
                  placeholder="Örn: Yanlış miktar girildi veya iptal edildi"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 font-bold focus:outline-none focus:border-rose-500 text-slate-800 h-[34px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setIsUndoModalOpen(false); setUndoTarget(null); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors"
                  disabled={isUndoing}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!undoReason.trim()) {
                      alert("Lütfen geri alma nedenini girin.");
                      return;
                    }
                    setIsUndoing(true);
                    try {
                      console.log("Undo shipment clicked", undoTarget.id);
                      const res = onUndoFinishedGoodsShipment!(undoTarget.id, undoReason);
                      
                      const handleResult = (ok: boolean) => {
                        console.log("RPC result:", ok);
                        setIsUndoing(false);
                        setIsUndoModalOpen(false);
                        setUndoTarget(null);
                        if (ok) {
                          alert("Sevkiyat hareketi başarıyla geri alındı.");
                        } else {
                          alert("Sevkiyat geri alınırken bir hata oluştu.");
                        }
                      };

                      if (res instanceof Promise) {
                        const ok = await res;
                        handleResult(ok);
                      } else {
                        handleResult(res);
                      }
                    } catch (err: any) {
                      console.error("Sevkiyat geri alınırken hata oluştu:", err);
                      setIsUndoing(false);
                      alert(`Hata: ${err.message || err}`);
                    }
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-1"
                  disabled={isUndoing}
                >
                  {isUndoing ? "İşleniyor..." : "Onayla ve Geri Al"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEVKİYAT VE STOK GEÇMİŞİ HAREKET LOGLARI */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-1.5">
          <FileText size={16} className="text-slate-500" />
          Nihai Ürün Hareket Logları
        </h3>
        <p className="text-[11px] text-slate-400">
          Nihai ürün stoğuna giriş (üretim tamamlandığında) ve stoğundan çıkış (sevkiyat yapıldığında veya sayım farkı düzeltildiğinde) hareketlerinin geçmiş kütüğüdür.
        </p>

        {finishedGoodsMovements.length === 0 ? (
          <div className="text-slate-400 italic text-center py-4">
            Henüz herhangi bir nihai ürün hareketi kaydedilmemiş.
          </div>
        ) : (
          <div className="overflow-y-auto max-h-60 border border-slate-100 rounded-xl">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-semibold uppercase">
                  <th className="py-2 px-3">Tarih</th>
                  <th className="py-2 px-3">Müşteri</th>
                  <th className="py-2 px-3">Ürün</th>
                  <th className="py-2 px-3">İşlem Türü</th>
                  <th className="py-2 px-3 text-right">Miktar</th>
                  <th className="py-2 px-3">Açıklama / Not</th>
                  <th className="py-2 px-3 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {[...finishedGoodsMovements].sort((a, b) => {
                  const timeA = a.createdAt || '';
                  const timeB = b.createdAt || '';
                  if (timeA && timeB) {
                    const cmp = timeB.localeCompare(timeA);
                    if (cmp !== 0) return cmp;
                  }
                  const dateA = a.date || '';
                  const dateB = b.date || '';
                  if (dateA && dateB) {
                    const cmp = dateB.localeCompare(dateA);
                    if (cmp !== 0) return cmp;
                  }
                  return (b.id || '').localeCompare(a.id || '');
                }).map(m => {
                  const customer = getCustomer(m.customerId);
                  const product = getProduct(m.productId);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/30">
                      <td className="py-2.5 px-3 font-mono">{m.date}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{customer?.name || '-'}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{product?.name || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          m.type === 'Üretim girişi' ? 'bg-blue-50 text-blue-700' :
                          m.type === 'Sevkiyat çıkışı' ? 'bg-emerald-50 text-emerald-700' :
                          m.type === 'Sayım düzeltmesi' ? 'bg-amber-50 text-amber-700' :
                          m.type === 'Üretim Geri Alındı' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {m.type}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${
                        m.type === 'Üretim girişi' ? 'text-blue-700' :
                        m.type === 'Sevkiyat çıkışı' ? 'text-emerald-700' :
                        m.type === 'Üretim Geri Alındı' ? 'text-rose-600' :
                        'text-amber-700'
                      }`}>
                        {m.type === 'Üretim Geri Alındı' ? '-' : (m.type === 'Üretim girişi' ? '+' : '')}{m.quantity} Pkt
                      </td>
                      <td className="py-2.5 px-3 italic text-slate-400">{m.note || '-'}</td>
                      <td className="py-2.5 px-3 text-right">
                        {!m.isDeleted && (m.isShipment || m.type === 'Sevkiyat çıkışı' || m.movementType === 'Sevkiyat çıkışı') && isLatestActiveShipmentForStock(m.id, m.finishedGoodsStockId) && onUndoFinishedGoodsShipment && (
                          <button
                            onClick={() => {
                              console.log("Undo shipment clicked", m.id);
                              setUndoTarget(m);
                              setUndoReason("Kullanıcı tarafından geri alındı");
                              setIsUndoModalOpen(true);
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 font-bold px-1.5 py-0.5 rounded transition-all text-[9px] cursor-pointer inline-flex items-center gap-0.5"
                          >
                            Geri Al
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
        onRetry={traceabilityActiveId ? () => handleOpenFinishedGoodsTraceability(traceabilityActiveId) : undefined}
      />

    </div>
  );
}
