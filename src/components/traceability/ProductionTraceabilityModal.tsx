import React from 'react';
import { 
  X, 
  Activity, 
  ShoppingBag, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  RefreshCw
} from 'lucide-react';
import { ProductionTraceabilityResponse } from '../../types';

interface ProductionTraceabilityModalProps {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  data: ProductionTraceabilityResponse | null;
  onClose: () => void;
  onRetry?: () => void;
}

export const ProductionTraceabilityModal: React.FC<ProductionTraceabilityModalProps> = ({
  isOpen,
  isLoading,
  error,
  data,
  onClose,
  onRetry
}) => {
  if (!isOpen) return null;

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatOnlyDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-50 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-600" size={18} />
            <div>
              <h3 className="font-bold text-slate-950 text-sm">Üretim ve Girdi Lot İzlenebilirliği</h3>
              <p className="text-slate-500 text-[10px]">Geriye dönük tedarikçi ve satın alma detayları</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Loading State */}
          {isLoading && (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium text-xs">İzlenebilirlik bilgileri yükleniyor...</p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="p-5 bg-rose-50 border border-rose-100 text-rose-900 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="font-bold text-xs">Sistem Hatası</p>
                  <p className="text-[11px] text-rose-800/90 leading-relaxed">{error}</p>
                </div>
              </div>
              {onRetry && (
                <div className="flex justify-end">
                  <button 
                    onClick={onRetry}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    <span>Yeniden Dene</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Data State */}
          {!isLoading && !error && data && (
            <>
              {/* Top Summary Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Finished Goods & Production Run Info */}
                <div className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-3">
                  <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Üretilen Nihai Ürün ve Parti</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Nihai Ürün Adı</span>
                      <span className="text-slate-950 font-bold text-xs">{data.product?.name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Parti / Lot No</span>
                      <span className="text-slate-950 font-bold font-mono text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                        {data.finishedGoodsStock?.lotNo || 'Atanmadı'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Üretilen Miktar</span>
                      <span className="text-slate-950 font-bold text-xs">
                        {data.productionRun?.producedQuantity} {data.finishedGoodsStock?.unit || 'paket'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Mevcut Kalan Stok</span>
                      <span className="text-slate-950 font-bold text-xs">
                        {data.finishedGoodsStock ? `${data.finishedGoodsStock.quantityRemaining} ${data.finishedGoodsStock.unit}` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Üretim Kayıt Tarihi</span>
                      <span className="text-slate-950 font-semibold text-xs">{formatDate(data.productionRun?.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Üretim Durumu</span>
                      <span className="text-slate-950 font-semibold text-xs">
                        {data.productionRun?.isDeleted ? (
                          <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">Silindi</span>
                        ) : (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                            {data.productionRun?.status || 'Tamamlandı'}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Orders & Technical IDs */}
                <div className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-3">
                  <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-indigo-600" />
                    <span>Sipariş ve Plan Detayları</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Sipariş Numarası</span>
                      <span className="text-slate-950 font-bold font-mono text-xs">
                        {data.order?.orderNumber ? `#${data.order.orderNumber}` : 'Müşteri Siparişi Yok / Doğrudan Üretim'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Müşteri</span>
                      <span className="text-slate-950 font-semibold text-xs">
                        {data.productionRun?.customerId ? 'İlişkili Müşteri Var' : 'Genel Stok Üretimi'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Üretim Giriş Kaydı</span>
                      <span className="text-slate-500 font-mono text-[10px] select-all block truncate" title={data.productionRun?.id}>
                        {data.productionRun?.id}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block text-[10px]">Kayıt Tarihi</span>
                      <span className="text-slate-950 font-semibold text-xs">{formatDate(data.productionRun?.createdAt)}</span>
                    </div>
                    
                    {data.productionRun?.isDeleted && (
                      <div className="col-span-2 bg-rose-50 text-rose-900 p-2 rounded-lg border border-rose-100 mt-1">
                        <span className="font-bold block text-[10px]">Silinme Nedeni & Zamanı:</span>
                        <span className="text-[10px] block text-rose-800">
                          {formatDate(data.productionRun.deletedAt)} - {data.productionRun.deletedReason || 'Belirtilmedi'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Allocations Title */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Layers size={15} className="text-emerald-700" />
                    <span>Kullanılan Hammaddeler ve Tedarikçi Girişleri</span>
                  </h4>
                  <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px]">
                    {data.allocations.length} Kalem Tüketim
                  </span>
                </div>

                {/* Allocations List */}
                {data.allocations.length === 0 ? (
                  <div className="py-12 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 bg-slate-50/50">
                    <Info size={24} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-xs">Bu üretim için hammadde lot tahsis kaydı bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.allocations.map((alloc) => {
                      const isReversed = alloc.isReversed;
                      return (
                        <div 
                          key={alloc.allocationId}
                          className={`border rounded-xl p-4 transition-all duration-150 ${
                            isReversed 
                              ? 'bg-rose-50/40 border-rose-200/80' 
                              : 'bg-white border-slate-150 shadow-xs hover:border-slate-300'
                          }`}
                        >
                          {/* Title block of Allocation */}
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100/70 pb-2.5 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-900 text-white font-bold px-2 py-0.5 rounded text-[10px]">
                                {alloc.rawMaterial?.name || 'Hammadde'}
                              </span>
                              <span className="font-bold text-slate-900 text-xs">
                                {alloc.quantityConsumed} {alloc.unit} Tüketildi
                              </span>
                              
                              {/* Reversal / Deletion status of allocation */}
                              {isReversed && (
                                <span className="bg-rose-600 text-white font-bold px-2 py-0.5 rounded text-[9px] flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  <span>Geri Alındı / İptal Edildi</span>
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-slate-400">Yöntem:</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded ${
                                alloc.allocationMethod === 'fifo' 
                                  ? 'bg-emerald-50 text-emerald-800' 
                                  : 'bg-amber-50 text-amber-800'
                              }`}>
                                {alloc.allocationMethod === 'fifo' ? 'FIFO Otomatik' : 'Manuel Seçim'}
                              </span>
                            </div>
                          </div>

                          {/* Reversal Detail Card */}
                          {isReversed && (
                            <div className="mb-3 p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-950 text-[10px] space-y-0.5">
                              <span className="font-bold">Geri Alma Detayı:</span>
                              <p className="leading-normal text-rose-800">
                                {alloc.reversedAt ? `${formatDate(alloc.reversedAt)} tarihinde` : ''} geri alındı.{' '}
                                {alloc.reversalReason ? `Gerekçe: ${alloc.reversalReason}` : ''}
                              </p>
                            </div>
                          )}

                          {/* 3-Column Trace Info */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            
                            {/* Raw Material Lot Info */}
                            <div className="space-y-1.5">
                              <span className="text-slate-400 font-bold block text-[9px] tracking-wider uppercase">Girdi Parti/Lot Detayları</span>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Dahili Lot No:</span>
                                  <span className="font-bold font-mono text-slate-800 text-[10px] bg-slate-100 px-1 py-0.5 rounded">
                                    {alloc.rawMaterialLot?.internalLotNo || '-'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Künye No:</span>
                                  <span className="font-semibold text-slate-800">{alloc.rawMaterialLot?.kunyeNumber || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Künye Türü:</span>
                                  <span className="text-slate-800">
                                    {alloc.rawMaterialLot?.kunyeStatus === 'provided' ? (
                                      <span className="text-emerald-700 font-bold">Gerçek Künye</span>
                                    ) : alloc.rawMaterialLot?.kunyeStatus === 'internal_placeholder' ? (
                                      <span className="text-amber-700 font-bold">Dahili / Dummy Künye</span>
                                    ) : (
                                      <span className="text-slate-500 italic">Künye Gerekmiyor</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Supplier & Receipt Info */}
                            <div className="space-y-1.5">
                              <span className="text-slate-400 font-bold block text-[9px] tracking-wider uppercase">Tedarikçi ve Giriş Evrağı</span>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Tedarikçi:</span>
                                  <span className="font-bold text-slate-800 truncate max-w-[130px]" title={alloc.supplier?.name}>
                                    {alloc.supplier?.name || 'Bilinmiyor'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Giriş Tarihi:</span>
                                  <span className="font-semibold text-slate-800">{formatOnlyDate(alloc.receipt?.receiptDate)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Fatura No:</span>
                                  <span className="font-semibold text-slate-800">
                                    {alloc.receipt?.invoiceNumber || '-'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">İrsaliye No:</span>
                                  <span className="font-semibold text-slate-800">
                                    {alloc.receipt?.dispatchNoteNumber || '-'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Financial & Stock Details */}
                            <div className="space-y-1.5">
                              <span className="text-slate-400 font-bold block text-[9px] tracking-wider uppercase">Finansal & Stok Hareketi</span>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Alış Birim Fiyatı:</span>
                                  <span className="font-bold text-slate-800">
                                    {alloc.rawMaterialLot?.unitPrice != null 
                                      ? `${alloc.rawMaterialLot.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺` 
                                      : '-'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Hammadde Hareketi:</span>
                                  <span className="font-semibold text-slate-800">{alloc.stockMovement?.movementType || 'Üretim Tüketimi'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Hareket Tarihi:</span>
                                  <span className="font-semibold text-slate-800">{formatOnlyDate(alloc.stockMovement?.movementDate)}</span>
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
};
