import React, { useState } from 'react';
import { 
  X, 
  Activity, 
  Calendar, 
  ShoppingBag, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  RefreshCw, 
  Truck, 
  DollarSign,
  Package
} from 'lucide-react';
import { OrderTraceabilityResponse, ProductionTraceabilityResponse } from '../../types';
import { formatCurrency, formatDate } from '../../utils/format';
import { ProductionTraceabilityModal } from './ProductionTraceabilityModal';

interface OrderTraceabilityModalProps {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  data: OrderTraceabilityResponse | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function OrderTraceabilityModal({
  isOpen,
  isLoading,
  error,
  data,
  onClose,
  onRetry
}: OrderTraceabilityModalProps) {
  const [selectedRunData, setSelectedRunData] = useState<ProductionTraceabilityResponse | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedRunData(null);
    onClose();
  };

  const getStatusColorClass = (status: string | null) => {
    if (!status) return 'bg-amber-50 text-amber-700 border-amber-100';
    const s = status.trim();
    if (s === 'Tamamlandı' || s === 'Sevk Edildi') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    }
    if (s === 'Kısmi Sevk' || s === 'Kısmi Sevk Edildi') {
      return 'bg-blue-50 text-blue-700 border-blue-100';
    }
    if (s === 'İptal') {
      return 'bg-rose-50 text-rose-700 border-rose-100';
    }
    return 'bg-amber-50 text-amber-700 border-amber-100';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" id="order-traceability-modal">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all w-full max-w-5xl border border-slate-100 flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 text-indigo-700 p-2 rounded-lg">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Uçtan Uca Sipariş İzlenebilirliği</h3>
                <p className="text-xs text-slate-500 font-medium">Sipariş kalemleri, üretim girdileri ve sevkiyat geçmişi</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/30">
            
            {isLoading && (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Uçtan uca izlenebilirlik verileri yükleniyor...</p>
              </div>
            )}

            {error && (
              <div className="py-12 flex flex-col items-center justify-center gap-4 max-w-md mx-auto text-center">
                <div className="bg-rose-50 text-rose-600 p-3 rounded-full">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Yükleme Başarısız Oldu</h4>
                  <p className="text-sm text-slate-500 mt-1">{error}</p>
                </div>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" /> Yeniden Dene
                  </button>
                )}
              </div>
            )}

            {!isLoading && !error && data && (
              <>
                {/* Section A: Order Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                  <div className="space-y-1.5 md:col-span-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Müşteri</span>
                    <span className="text-sm font-bold text-slate-900 block truncate">
                      {data.customer?.name || 'Bilinmeyen Müşteri'}
                    </span>
                    <span className="text-xs text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">
                      Sipariş No: <span className="font-bold text-slate-700">{data.order.orderNumber}</span>
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tarihler</span>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Kayıt: <span className="font-semibold text-slate-800">{formatDate(data.order.orderDate)}</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span>Teslim: <span className="font-semibold text-indigo-900">{formatDate(data.order.deliveryDate)}</span></span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Finansal Özet</span>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Toplam: <span className="font-semibold text-slate-800">{formatCurrency(data.order.totalAmount)}</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Gerçekleşen: <span className="font-bold text-emerald-700">{formatCurrency(data.order.realizedAmount)}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Operational and Approval Badges */}
                  <div className="md:col-span-4 border-t border-slate-50 pt-3 flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Sipariş Durumu:</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusColorClass(data.order.computedStatus || data.order.status)}`}>
                        {data.order.computedStatus || data.order.status}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        data.order.approvalStatus === 'Onaylandı'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : data.order.approvalStatus === 'Reddedildi'
                          ? 'bg-rose-50 text-rose-700 border-rose-100'
                          : 'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {data.order.approvalStatus}
                      </span>
                    </div>
                    {data.order.note && (
                      <span className="text-[11px] text-slate-500 italic font-medium max-w-md truncate">
                        Not: {data.order.note}
                      </span>
                    )}
                  </div>
                </div>

                {/* Section B: Order Items */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                    <ShoppingBag className="h-4 w-4 text-slate-400" /> Sipariş Edilen Ürün Kalemleri ({data.orderItems.length})
                  </h4>
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <th className="py-2.5 px-4">Ürün Adı</th>
                            <th className="py-2.5 px-4 text-right">Miktar</th>
                            <th className="py-2.5 px-4 text-right">Birim Satış Fiyatı</th>
                            <th className="py-2.5 px-4 text-right">Toplam Tutar</th>
                            <th className="py-2.5 px-4 text-center">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                          {data.orderItems.map((item) => (
                            <tr key={item.id} className={`hover:bg-slate-50/50 ${item.isDeleted ? 'bg-rose-50/20' : ''}`}>
                              <td className="py-3 px-4 font-semibold text-slate-900">
                                {item.productName || 'Ürün kaydı bulunamadı'}
                              </td>
                              <td className="py-3 px-4 text-right font-black text-slate-800">
                                {item.orderedQuantity.toLocaleString('tr-TR')} Adet
                              </td>
                              <td className="py-3 px-4 text-right text-slate-600 font-medium">
                                {formatCurrency(item.unitSalePrice)}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-indigo-900">
                                {formatCurrency(item.orderedQuantity * item.unitSalePrice)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {item.isDeleted ? (
                                  <span className="text-[9px] bg-rose-50 text-rose-700 font-bold border border-rose-100 rounded px-1.5 py-0.5">
                                    Silindi / Tarihsel
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-100 rounded px-1.5 py-0.5">
                                    Aktif
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {data.orderItems.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                                Sipariş kalemi bulunamadı.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Section C: Production Runs */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                    <Layers className="h-4 w-4 text-slate-400" /> Bu Siparişe Ait Üretim Girişleri ({data.productionRuns.length})
                  </h4>

                  {data.productionRuns.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-100 p-6 text-center text-slate-400 font-medium shadow-sm flex flex-col items-center justify-center gap-2">
                      <Package className="h-8 w-8 text-slate-300" />
                      <span>Bu sipariş için henüz bir üretim kaydı gerçekleştirilmemiş.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.productionRuns.map((run) => {
                        const hasAllocations = run.allocations && run.allocations.length > 0;
                        const isRunDeleted = run.productionRun.isDeleted;

                        return (
                          <div 
                            key={run.productionRun.id} 
                            className={`bg-white rounded-xl border p-4 shadow-sm flex flex-col justify-between hover:shadow transition-shadow ${
                              isRunDeleted ? 'border-rose-100 bg-rose-50/10' : 'border-slate-100'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-xs font-bold text-slate-900 block truncate">
                                    {run.product?.name || 'Bilinmeyen Ürün'}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400 mt-0.5 block">
                                    Run ID: {run.productionRun.id}
                                  </span>
                                </div>

                                {isRunDeleted ? (
                                  <span className="text-[9px] bg-rose-50 text-rose-700 font-bold border border-rose-100 rounded px-1.5 py-0.5 shrink-0">
                                    Geri Alındı / Silindi
                                  </span>
                                ) : (
                                  <span className={`text-[9px] font-bold border rounded px-1.5 py-0.5 shrink-0 ${
                                    run.productionRun.status === 'Tamamlandı'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-100'
                                  }`}>
                                    {run.productionRun.status}
                                  </span>
                                )}
                              </div>

                              {/* Production quantities and Date */}
                              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-600 font-medium">
                                <div>
                                  <span>Kayıt Tarihi:</span>
                                  <span className="block font-semibold text-slate-800">{formatDate(run.productionRun.createdAt)}</span>
                                </div>
                                <div>
                                  <span>Üretilen Miktar:</span>
                                  <span className="block font-bold text-indigo-950">{run.productionRun.producedQuantity} Pkt</span>
                                </div>
                                {run.finishedGoodsStock && (
                                  <>
                                    <div>
                                      <span>Parti No (Lot):</span>
                                      <span className="block font-bold text-slate-800">{run.finishedGoodsStock.lotNo}</span>
                                    </div>
                                    <div>
                                      <span>Stokta Kalan:</span>
                                      <span className="block font-bold text-amber-700">{run.finishedGoodsStock.quantityRemaining} Pkt</span>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Allocations info */}
                              <div className="text-[11px] flex items-center justify-between py-1 text-slate-500 font-medium">
                                <span>Kullanılan Hammadde Lotu Sayısı:</span>
                                <span className={`font-bold ${hasAllocations ? 'text-indigo-600' : 'text-slate-400'}`}>
                                  {run.allocations?.length || 0} Lot
                                </span>
                              </div>
                            </div>

                            {/* View detailed production input lot traceability button */}
                            <div className="border-t border-slate-50 pt-2.5 mt-3 flex justify-end">
                              <button
                                onClick={() => setSelectedRunData(run)}
                                className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 hover:border-indigo-200 text-indigo-700 text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Info className="h-3.5 w-3.5" /> Girdi Lotlarını Gör
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section D: Shipment Movements */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                    <Truck className="h-4 w-4 text-slate-400" /> Sevkiyat Giriş ve Çıkış Hareketleri ({data.shipmentMovements.length})
                  </h4>
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <th className="py-2.5 px-4">Tarih</th>
                            <th className="py-2.5 px-4">Ürün</th>
                            <th className="py-2.5 px-4 text-center">Parti No</th>
                            <th className="py-2.5 px-4">İşlem Türü</th>
                            <th className="py-2.5 px-4 text-right">Miktar</th>
                            <th className="py-2.5 px-4 text-right">Değişim</th>
                            <th className="py-2.5 px-4">Açıklama</th>
                            <th className="py-2.5 px-4 text-center">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                          {data.shipmentMovements.map((mov) => {
                            const isMovementDeleted = mov.isDeleted;
                            const isGeriAlma = mov.movementType.toLowerCase() === 'sevkiyat geri alma';

                            let statusLabel = 'Aktif';
                            let statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';

                            if (isMovementDeleted) {
                              statusLabel = 'Geri Alındı / İptal';
                              statusStyle = 'bg-rose-100 text-rose-800 border-rose-200';
                            } else if (isGeriAlma) {
                              statusLabel = 'Geri Alma Kaydı';
                              statusStyle = 'bg-amber-50 text-amber-700 border-amber-100';
                            }

                            return (
                              <tr key={mov.id} className={`hover:bg-slate-50/30 ${isMovementDeleted ? 'bg-rose-50/20 text-slate-500' : ''}`}>
                                <td className="py-3 px-4 font-medium text-slate-600">
                                  {formatDate(mov.movementDate)}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900">
                                  {mov.productName || 'Ürün kaydı bulunamadı'}
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                                  {mov.finishedGoodsLotNo || '-'}
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    mov.movementType === 'Sevkiyat' || mov.isShipment
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-indigo-50 text-indigo-700'
                                  }`}>
                                    {mov.movementType}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-black text-slate-800">
                                  {mov.quantity.toLocaleString('tr-TR')} {mov.unit}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-500 font-medium">
                                  {mov.previousQuantity != null && mov.newQuantity != null ? (
                                    <span>{mov.previousQuantity} → {mov.newQuantity}</span>
                                  ) : '-'}
                                </td>
                                <td className="py-3 px-4 max-w-[180px] truncate" title={mov.note || ''}>
                                  {mov.note || '-'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <div className="inline-flex flex-col items-center">
                                    <span className={`text-[9px] font-bold border rounded px-1.5 py-0.5 ${statusStyle}`}>
                                      {statusLabel}
                                    </span>
                                    {isMovementDeleted && mov.deletedReason && (
                                      <span className="text-[8px] text-rose-600 block mt-0.5 italic max-w-[100px] truncate" title={mov.deletedReason}>
                                        {mov.deletedReason}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {data.shipmentMovements.length === 0 && (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-slate-400 font-medium">
                                Sevkiyat hareketi bulunamadı.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </>
            )}

          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-6 py-3.5 bg-slate-50 text-right shrink-0">
            <button
              onClick={handleClose}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
            >
              Kapat
            </button>
          </div>

        </div>
      </div>

      {/* Nested Production Traceability Modal */}
      <ProductionTraceabilityModal
        isOpen={selectedRunData !== null}
        isLoading={false}
        error={null}
        data={selectedRunData}
        onClose={() => setSelectedRunData(null)}
      />
    </div>
  );
}
