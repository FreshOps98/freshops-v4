import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  Truck, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Info, 
  RefreshCw, 
  Calendar, 
  ChevronRight, 
  Layers, 
  User, 
  Tag, 
  FileText,
  Building2,
  PackageCheck,
  X,
  History,
  CornerDownRight
} from 'lucide-react';
import { Supplier, SupplierTraceabilityResponse } from '../../types';
import { supabaseDataService } from '../../services/supabaseDataService';
import { formatCurrency, formatDate } from '../../utils/format';

interface SuppliersViewProps {
  suppliers: Supplier[];
  onCreateSupplier: (name: string, note?: string) => Promise<{ supplierId: string; name: string; created: boolean }>;
}

export default function SuppliersView({
  suppliers,
  onCreateSupplier
}: SuppliersViewProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Traceability lazy-load states
  const [traceabilityData, setTraceabilityData] = useState<SupplierTraceabilityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestCounterRef = useRef(0);

  // New Supplier modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierNote, setNewSupplierNote] = useState('');
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Component unmount and fast selector protection
  useEffect(() => {
    return () => {
      requestCounterRef.current += 1;
    };
  }, []);

  // Fetch traceability when selected supplier changes
  const fetchTraceability = async (supplierId: string) => {
    requestCounterRef.current += 1;
    const currentRequestToken = requestCounterRef.current;

    setIsLoading(true);
    setError(null);
    setTraceabilityData(null);

    try {
      const data = await supabaseDataService.getSupplierTraceabilityAtomic(supplierId);
      
      if (currentRequestToken === requestCounterRef.current) {
        setTraceabilityData(data);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      console.error("Supplier traceability error:", err);
      if (currentRequestToken === requestCounterRef.current) {
        const message = err instanceof Error 
          ? err.message 
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message || 'Tedarikçi detayları yüklenirken hata oluştu.')
            : 'Tedarikçi detayları yüklenirken hata oluştu.';
        setError(message);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (selectedSupplierId) {
      fetchTraceability(selectedSupplierId);
    } else {
      setTraceabilityData(null);
      setIsLoading(false);
      setError(null);
    }
  }, [selectedSupplierId]);

  // Filtered supplier list
  const filteredSuppliers = suppliers.filter(s => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return !s.isDeleted;
    return !s.isDeleted && (
      s.name.toLowerCase().includes(term) || 
      (s.note && s.note.toLowerCase().includes(term))
    );
  });

  // Automatically select the first supplier if none is selected
  useEffect(() => {
    if (filteredSuppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(filteredSuppliers[0].id);
    }
  }, [filteredSuppliers, selectedSupplierId]);

  // Handle Create Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;

    setIsCreating(true);
    setModalMessage(null);

    try {
      const result = await onCreateSupplier(newSupplierName.trim(), newSupplierNote.trim() || undefined);
      
      if (result.created) {
        setModalMessage({ type: 'success', text: `"${result.name}" tedarikçisi başarıyla oluşturuldu.` });
        setTimeout(() => {
          setIsModalOpen(false);
          setNewSupplierName('');
          setNewSupplierNote('');
          setModalMessage(null);
          // Auto select and load details
          setSelectedSupplierId(result.supplierId);
        }, 1500);
      } else {
        setModalMessage({ type: 'info', text: `"${result.name}" tedarikçisi zaten sistemde kayıtlı. Bu tedarikçi seçildi.` });
        setTimeout(() => {
          setIsModalOpen(false);
          setNewSupplierName('');
          setNewSupplierNote('');
          setModalMessage(null);
          // Auto select and load details
          setSelectedSupplierId(result.supplierId);
        }, 2000);
      }
    } catch (err: unknown) {
      console.error("Create supplier error:", err);
      const msg = err instanceof Error ? err.message : 'Tedarikçi oluşturulurken bir hata oluştu.';
      setModalMessage({ type: 'error', text: msg });
    } finally {
      setIsCreating(false);
    }
  };

  // Compute summary stats from traceability data
  const getSummaryStats = () => {
    if (!traceabilityData) return { receiptsCount: 0, lotsCount: 0, totalReceiptValue: 0, productionUsagesCount: 0 };
    
    let receiptsCount = traceabilityData.receipts.length;
    let lotsCount = 0;
    let totalReceiptValue = 0;
    let productionUsagesCount = 0;

    traceabilityData.receipts.forEach(r => {
      if (r.lots) {
        lotsCount += r.lots.length;
        r.lots.forEach(l => {
          totalReceiptValue += (l.quantityReceived * l.unitPrice);
          if (l.productionUsages) {
            productionUsagesCount += l.productionUsages.length;
          }
        });
      }
    });

    return { receiptsCount, lotsCount, totalReceiptValue, productionUsagesCount };
  };

  const stats = getSummaryStats();
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-4rem)] p-6 bg-slate-50 overflow-hidden" id="suppliers-view-container">
      
      {/* LEFT PANEL: Master List */}
      <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-xl flex flex-col shadow-xs overflow-hidden shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg border border-emerald-100/50">
              <Truck className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-800">Tedarikçi Listesi</span>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-xs"
            title="Yeni Tedarikçi Ekle"
          >
            <Plus className="h-4 w-4" />
            <span>Yeni</span>
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 bg-slate-50/20">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tedarikçi ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-hidden focus:border-emerald-500 text-slate-800"
            />
          </div>
        </div>

        {/* Supplier List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredSuppliers.map((s) => {
            const isSelected = s.id === selectedSupplierId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSupplierId(s.id)}
                className={`w-full text-left p-3.5 flex items-start gap-3 transition-all cursor-pointer border-l-2 ${
                  isSelected 
                    ? 'bg-emerald-50/40 border-l-emerald-600 text-slate-900' 
                    : 'border-l-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${
                  isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate block">{s.name}</span>
                    <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${isSelected ? 'translate-x-0.5 text-emerald-600' : 'text-slate-300'}`} />
                  </div>
                  {s.note && (
                    <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                      {s.note}
                    </p>
                  )}
                  <span className="text-[9px] text-slate-400 block mt-1 font-mono">ID: {s.id}</span>
                </div>
              </button>
            );
          })}

          {filteredSuppliers.length === 0 && (
            <div className="p-8 text-center text-slate-400 font-medium text-xs flex flex-col items-center justify-center gap-2">
              <Truck className="h-6 w-6 text-slate-300" />
              <span>Tedarikçi bulunamadı.</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Details & Traceability */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col shadow-xs overflow-hidden">
        
        {/* Detail Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {selectedSupplier ? (
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{selectedSupplier.name}</h3>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                  selectedSupplier.isActive 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                    : 'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  {selectedSupplier.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              {selectedSupplier.note && (
                <p className="text-xs text-slate-500 font-medium mt-1 italic">
                  Not: "{selectedSupplier.note}"
                </p>
              )}
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-bold text-slate-800">Tedarikçi Detayları</h3>
              <p className="text-xs text-slate-400 font-medium">Sol menüden bir tedarikçi seçin</p>
            </div>
          )}

          {selectedSupplierId && (
            <button
              onClick={() => fetchTraceability(selectedSupplierId)}
              disabled={isLoading}
              className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              Yeniden Yükle
            </button>
          )}
        </div>

        {/* Content body with custom states */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          
          {/* 1. Loading State */}
          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
              <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
              <p className="text-xs text-slate-500 font-semibold">Tedarikçiden nihai ürüne uçtan uca lot izlenebilirlik haritası yükleniyor...</p>
            </div>
          )}

          {/* 2. Error State */}
          {error && !isLoading && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-12 max-w-md mx-auto text-center">
              <div className="bg-rose-50 text-rose-600 p-3 rounded-full border border-rose-100">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">İzlenebilirlik Yüklenemedi</h4>
                <p className="text-xs text-slate-500 mt-1">{error}</p>
              </div>
              {selectedSupplierId && (
                <button
                  onClick={() => fetchTraceability(selectedSupplierId)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Yeniden Dene
                </button>
              )}
            </div>
          )}

          {/* 3. Empty Supplier State */}
          {!selectedSupplierId && !isLoading && !error && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
              <Truck className="h-10 w-10 text-slate-300" />
              <p className="text-xs font-bold">Lütfen detaylarını ve izlenebilirlik zincirini incelemek istediğiniz tedarikçiyi soldan seçin.</p>
            </div>
          )}

          {/* 4. Normal Successful View */}
          {!isLoading && !error && traceabilityData && (
            <div className="space-y-6">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="bg-blue-50 text-blue-700 p-2.5 rounded-lg border border-blue-100/50">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Satın Alma Fişi</span>
                    <span className="text-sm font-black text-slate-800">{stats.receiptsCount} Fiş</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="bg-indigo-50 text-indigo-700 p-2.5 rounded-lg border border-indigo-100/50">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Hammadde Lotu</span>
                    <span className="text-sm font-black text-slate-800">{stats.lotsCount} Lot</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="bg-emerald-50 text-emerald-700 p-2.5 rounded-lg border border-emerald-100/50">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Toplam Kabul Tutar</span>
                    <span className="text-sm font-black text-emerald-700">{formatCurrency(stats.totalReceiptValue)}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="bg-purple-50 text-purple-700 p-2.5 rounded-lg border border-purple-100/50">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Üretim Kullanımı</span>
                    <span className="text-sm font-black text-slate-800">{stats.productionUsagesCount} Kullanım</span>
                  </div>
                </div>
              </div>

              {/* Purchase Receipts & Inner Traceability */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="h-4 w-4 text-slate-400" /> Satın Alma ve Lot Dağılım Geçmişi ({traceabilityData.receipts.length})
                </h4>

                {traceabilityData.receipts.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-100 p-8 text-center text-slate-400 font-medium text-xs flex flex-col items-center justify-center gap-2 shadow-xs">
                    <PackageCheck className="h-8 w-8 text-slate-300" />
                    <span>Tedarikçiye ait henüz bir hammadde satın alma fişi bulunamadı.</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {traceabilityData.receipts.map((receipt) => (
                      <div 
                        key={receipt.id} 
                        className={`bg-white rounded-xl border overflow-hidden shadow-xs transition-shadow hover:shadow ${
                          receipt.isDeleted ? 'border-rose-100 bg-rose-50/10' : 'border-slate-100'
                        }`}
                      >
                        {/* Receipt Banner */}
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex flex-wrap items-center gap-4">
                            <span className="font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs font-mono">
                              Fiş: {receipt.id.substring(0, 13)}...
                            </span>
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>Fiş Tarihi: <span className="font-semibold text-slate-800">{formatDate(receipt.receiptDate)}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>Fatura: <span className="font-bold text-slate-700">{receipt.invoiceNumber || '-'}</span></span>
                              <span className="text-slate-300">|</span>
                              <span>İrsaliye: <span className="font-bold text-slate-700">{receipt.dispatchNoteNumber || '-'}</span></span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {receipt.isDeleted ? (
                              <span className="text-[9px] bg-rose-100 text-rose-800 font-bold border border-rose-200 rounded px-1.5 py-0.5">
                                Fiş İptal Edildi
                              </span>
                            ) : (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-100 rounded px-1.5 py-0.5">
                                Fiş Aktif
                              </span>
                            )}
                          </div>
                        </div>

                        {receipt.note && (
                          <div className="px-4 py-2 border-b border-slate-50 text-xs italic text-slate-500 bg-amber-50/10 font-medium">
                            Not: "{receipt.note}"
                          </div>
                        )}

                        {/* Receipts Lots */}
                        <div className="p-4 space-y-4">
                          {receipt.lots.map((lot) => {
                            const totalLotValue = lot.quantityReceived * lot.unitPrice;
                            return (
                              <div key={lot.id} className="border border-slate-100 rounded-lg p-4 bg-slate-50/40 space-y-4">
                                
                                {/* Lot Details Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-medium text-slate-600">
                                  <div className="md:col-span-2 space-y-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hammadde</span>
                                    <span className="text-sm font-bold text-slate-900 block truncate">
                                      {lot.rawMaterial?.name || 'Bilinmeyen Hammadde'}
                                    </span>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      <span className="text-[9px] bg-indigo-50 text-indigo-700 font-mono font-bold border border-indigo-100 rounded px-1.5 py-0.5">
                                        Dahili Lot: {lot.internalLotNo}
                                      </span>
                                      {lot.kunyeNumber && (
                                        <span className="text-[9px] bg-slate-100 text-slate-700 font-mono font-bold border border-slate-200 rounded px-1.5 py-0.5" title="Künye Numarası">
                                          Künye No: {lot.kunyeNumber} ({lot.kunyeStatus === 'provided' ? 'Gerçek Künye' : 'Dahili / Dummy Künye'})
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Miktarlar</span>
                                    <div className="flex flex-col gap-0.5">
                                      <span>Kabul: <span className="font-bold text-indigo-900">{lot.quantityReceived} {lot.unit}</span></span>
                                      <span>Kalan: <span className={`font-bold ${lot.quantityRemaining > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{lot.quantityRemaining} {lot.unit}</span></span>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Finansal Değer</span>
                                    <div className="flex flex-col gap-0.5">
                                      <span>Birim Fiyat: <span className="font-semibold text-slate-700">{formatCurrency(lot.unitPrice)} / {lot.unit}</span></span>
                                      <span>Toplam Tutar: <span className="font-bold text-slate-800">{formatCurrency(totalLotValue)}</span></span>
                                    </div>
                                  </div>
                                </div>

                                {/* Stock Inbound Movement Summary */}
                                {lot.inboundStockMovement && (
                                  <div className="bg-white border border-slate-100 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-3 font-medium text-slate-600">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-slate-400" />
                                      <span>Stok Giriş Hareketi:</span>
                                      <span className="font-bold text-slate-800">{formatDate(lot.inboundStockMovement.movementDate)}</span>
                                      <span className="text-slate-300">|</span>
                                      <span>Giriş Miktarı: <span className="font-semibold text-slate-800">{lot.inboundStockMovement.quantity} {lot.unit}</span></span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] text-slate-400 font-mono">ID: {lot.inboundStockMovement.id.substring(0, 10)}...</span>
                                      {lot.inboundStockMovement.isDeleted && (
                                        <span className="text-[9px] bg-rose-50 text-rose-700 font-bold border border-rose-100 rounded px-1.5 py-0.5">
                                          Giriş Silindi / Geçersiz
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Production Usage (Traceability to Finished Goods) */}
                                <div className="space-y-2 border-t border-slate-100 pt-3">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Bu Lottan Üretilen Nihai Ürünler</span>
                                  
                                  {lot.productionUsages && lot.productionUsages.length > 0 ? (
                                    <div className="space-y-2 bg-white rounded-lg border border-slate-100 overflow-hidden divide-y divide-slate-100 shadow-3xs">
                                      {lot.productionUsages.map((usage) => {
                                        const isAllocationReversed = usage.isReversed;
                                        const isRunDeleted = usage.productionRun?.isDeleted;
                                        const isStockDeleted = usage.finishedGoodsStock?.isDeleted;
                                        const isHistorical = isAllocationReversed || isRunDeleted || isStockDeleted;

                                        return (
                                          <div 
                                            key={usage.allocationId} 
                                            className={`p-3 text-xs font-medium flex flex-col md:flex-row justify-between md:items-center gap-3 ${
                                              isHistorical ? 'bg-rose-50/25 text-rose-950/80' : 'text-slate-700'
                                            }`}
                                          >
                                            <div className="space-y-1.5 min-w-0 flex-1">
                                              {/* Left section: Raw consumption and product */}
                                              <div className="flex flex-wrap items-center gap-2">
                                                <CornerDownRight className="h-4.5 w-4.5 text-slate-400 shrink-0 mt-0.5" />
                                                <span className="font-bold text-slate-900 text-xs">
                                                  {usage.product?.name || 'Reçetesiz Ürün'}
                                                </span>
                                                <span className="text-slate-300">|</span>
                                                <span className="font-semibold text-slate-600">
                                                  Tüketilen Girdi: <span className="font-bold text-indigo-950">{usage.quantityConsumed} {usage.unit}</span>
                                                </span>
                                                <span className="text-slate-300">|</span>
                                                <span className="text-slate-500">
                                                  Yöntem: <span className="font-semibold">{usage.allocationMethod === 'fifo' ? 'FIFO Otomatik' : 'Manuel'}</span>
                                                </span>
                                              </div>

                                              {/* Bottom info: lot, runs, customer */}
                                              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pl-6">
                                                <span>Parti No (Nihai): <span className="font-mono font-bold text-slate-800">{usage.finishedGoodsStock?.lotNo || '-'}</span></span>
                                                <span>Üretilen: <span className="font-semibold text-slate-800">{usage.finishedGoodsStock?.quantityProduced ?? usage.productionRun?.producedQuantity ?? 0} Pkt</span></span>
                                                <span>Stok Kalan: <span className="font-bold text-slate-800">{usage.finishedGoodsStock?.quantityRemaining ?? 0} Pkt</span></span>
                                                {usage.order && (
                                                  <span>Sipariş: <span className="font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-1 py-0.2 rounded">#{usage.order.orderNumber}</span></span>
                                                )}
                                                {usage.customer && (
                                                  <span>Müşteri: <span className="font-semibold text-slate-700 truncate max-w-[120px] inline-block align-bottom">{usage.customer.name}</span></span>
                                                )}
                                              </div>
                                              
                                              {/* Deleted details inside hierarchy */}
                                              {isHistorical && (
                                                <div className="pl-6 pt-1 text-[10px] text-rose-600 font-semibold space-y-1">
                                                  {isAllocationReversed && (
                                                    <p className="flex items-center gap-1.5">
                                                      <History className="h-3.5 w-3.5" />
                                                      <span>Lot Tahsisi Geri Alındı: {usage.reversalReason || 'Açıklama girilmemiş'} ({usage.reversedAt ? formatDate(usage.reversedAt) : ''})</span>
                                                    </p>
                                                  )}
                                                  {isRunDeleted && (
                                                    <p className="flex items-center gap-1.5">
                                                      <AlertTriangle className="h-3.5 w-3.5" />
                                                      <span>Üretim Kaydı Silindi / İptal: {usage.productionRun.deletedReason || 'Açıklama girilmemiş'} ({usage.productionRun.deletedAt ? formatDate(usage.productionRun.deletedAt) : ''})</span>
                                                    </p>
                                                  )}
                                                  {isStockDeleted && (
                                                    <p className="flex items-center gap-1.5">
                                                      <AlertTriangle className="h-3.5 w-3.5" />
                                                      <span>Nihai Ürün Stok Satırı Silindi / Geçersiz</span>
                                                    </p>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                            {/* Right section: status badges */}
                                            <div className="flex flex-row md:flex-col items-end gap-1.5 justify-between shrink-0 pl-6 md:pl-0">
                                              <span className="text-[10px] font-mono text-slate-400">Run ID: {usage.productionRunId.substring(0, 8)}...</span>
                                              
                                              <div className="flex items-center gap-1.5">
                                                {isHistorical ? (
                                                  <span className="text-[9px] bg-rose-100 text-rose-800 font-bold border border-rose-200 rounded px-1.5 py-0.5">
                                                    Geri Alındı / İptal Edildi
                                                  </span>
                                                ) : (
                                                  <span className={`text-[9px] font-bold border rounded px-1.5 py-0.5 ${
                                                    usage.productionRun?.status === 'Tamamlandı'
                                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                      : 'bg-amber-50 text-amber-700 border-amber-100'
                                                  }`}>
                                                    {usage.productionRun?.status || 'Beklemede'}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic font-medium bg-white p-3 rounded-lg border border-slate-100 flex items-center gap-1.5">
                                      <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                      Bu lot henüz üretimde kullanılmadı.
                                    </p>
                                  )}
                                </div>

                              </div>
                            );
                          })}

                          {receipt.lots.length === 0 && (
                            <div className="text-center py-4 text-slate-400 font-medium text-xs">
                              Bu fişe ait lot kaydı bulunamadı.
                            </div>
                          )}
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>

      {/* NEW SUPPLIER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" id="create-supplier-modal">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isCreating && setIsModalOpen(false)} />
          
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-2xl transition-all w-full max-w-md border border-slate-100">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-50 text-emerald-700 p-1.5 rounded-lg">
                    <Truck className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Yeni Tedarikçi Tanımla</h3>
                </div>
                <button
                  onClick={() => !isCreating && setIsModalOpen(false)}
                  disabled={isCreating}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveSupplier}>
                <div className="p-5 space-y-4 text-xs font-medium text-slate-600">
                  {modalMessage && (
                    <div className={`p-3 rounded-lg border flex gap-2 items-start ${
                      modalMessage.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                        : modalMessage.type === 'info'
                        ? 'bg-blue-50 text-blue-800 border-blue-100'
                        : 'bg-rose-50 text-rose-800 border-rose-100'
                    }`}>
                      {modalMessage.type === 'success' && <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />}
                      {modalMessage.type === 'info' && <Info className="h-4.5 w-4.5 text-blue-500 shrink-0 mt-0.5" />}
                      {modalMessage.type === 'error' && <AlertTriangle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />}
                      <span>{modalMessage.text}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-700">Tedarikçi Adı *</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Özgür Kağıtçılık San. Tic."
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      disabled={isCreating}
                      className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-hidden focus:border-emerald-500 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-700">Özel Not / Açıklama</label>
                    <textarea
                      placeholder="Tedarikçi ile ilgili sevkiyat, iletişim vb. notlar..."
                      value={newSupplierNote}
                      onChange={(e) => setNewSupplierNote(e.target.value)}
                      disabled={isCreating}
                      rows={3}
                      className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-hidden focus:border-emerald-500 text-slate-800 resize-none"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isCreating}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !newSupplierName.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    {isCreating ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Kaydediliyor...
                      </>
                    ) : (
                      'Tedarikçiyi Kaydet'
                    )}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
