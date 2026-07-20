import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, AlertTriangle, Save, Clock, History, FileText, CheckCircle2, 
  ArrowRight, MessageSquare, Info, ChevronDown, ChevronUp, DollarSign
} from 'lucide-react';
import { 
  RawMaterialReceipt, RawMaterialLot, RawMaterial, 
  UpdateRawMaterialReceiptInput, UpdateRawMaterialReceiptResult, 
  RawMaterialReceiptCorrection, KunyeStatus 
} from '../../types';
import { supabaseDataService } from '../../services/supabaseDataService';
import { formatCurrency, formatDate } from '../../utils/format';

interface RawMaterialReceiptCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: RawMaterialReceipt | null;
  lots: RawMaterialLot[];
  rawMaterials: RawMaterial[];
  onUpdateReceipt: (input: UpdateRawMaterialReceiptInput) => Promise<UpdateRawMaterialReceiptResult>;
  onSuccess?: () => void;
}

interface EditableLine {
  id: string;
  rawMaterialId: string;
  internalLotNo: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: number;
  kunyeStatus: KunyeStatus;
  kunyeNumber: string | null;
  note: string;
  isFruitOrVeg: boolean;
  isPriceLocked: boolean;
}

export default function RawMaterialReceiptCorrectionModal({
  isOpen,
  onClose,
  receipt,
  lots,
  rawMaterials,
  onUpdateReceipt,
  onSuccess
}: RawMaterialReceiptCorrectionModalProps) {
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dispatchNoteNumber, setDispatchNoteNumber] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [reason, setReason] = useState('');
  
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // History State
  const [corrections, setCorrections] = useState<RawMaterialReceiptCorrection[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCorrectionId, setExpandedCorrectionId] = useState<string | null>(null);

  // Fast mapping for raw material names
  const rmMap = React.useMemo(() => {
    const map: Record<string, { name: string; category: string; unit: string }> = {};
    rawMaterials.forEach(rm => {
      map[rm.id] = { name: rm.name, category: rm.category, unit: rm.unit };
    });
    return map;
  }, [rawMaterials]);

  // Load Initial Data
  useEffect(() => {
    if (isOpen && receipt) {
      // Filter lots for this receipt
      const receiptLots = lots.filter(lot => lot.rawMaterialReceiptId === receipt.id);
      
      const initialLines = receiptLots.map(lot => {
        const rm = rawMaterials.find(r => r.id === lot.rawMaterialId);
        const isFruitOrVeg = rm ? (rm.category === 'Meyve' || rm.category === 'Sebze') : false;
        const isPriceLocked = Math.abs(lot.quantityRemaining - lot.quantityReceived) > 0.0001;
        
        return {
          id: lot.id,
          rawMaterialId: lot.rawMaterialId,
          internalLotNo: lot.internalLotNo,
          quantityReceived: lot.quantityReceived,
          quantityRemaining: lot.quantityRemaining,
          unit: lot.unit,
          unitPrice: lot.unitPrice,
          kunyeStatus: lot.kunyeStatus || (isFruitOrVeg ? 'provided' : 'not_applicable'),
          kunyeNumber: lot.kunyeNumber,
          note: lot.note || '',
          isFruitOrVeg,
          isPriceLocked
        };
      });

      setLines(initialLines);
      setInvoiceNumber(receipt.invoiceNumber || '');
      setDispatchNoteNumber(receipt.dispatchNoteNumber || '');
      setGeneralNote(receipt.note || '');
      setReason('');
      setFormError(null);
      setExpandedCorrectionId(null);
      
      void fetchCorrections();
    }
  }, [isOpen, receipt, lots, rawMaterials]);

  const fetchCorrections = async () => {
    if (!receipt) return;
    setLoadingHistory(true);
    try {
      const history = await supabaseDataService.getRawMaterialReceiptCorrections(receipt.id);
      setCorrections(history);
    } catch (err) {
      console.error("Error fetching corrections:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen || !receipt) return null;

  // Handler for line editing
  const handleLineFieldChange = (lotId: string, field: keyof EditableLine, value: any) => {
    setLines(prev => prev.map(line => {
      if (line.id === lotId) {
        const updated = { ...line, [field]: value };
        
        // If status changed to 'not_applicable', clear kunyeNumber
        if (field === 'kunyeStatus' && value === 'not_applicable') {
          updated.kunyeNumber = null;
        }
        
        return updated;
      }
      return line;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validations
    if (!reason.trim()) {
      setFormError("Düzeltme gerekçesi girmek zorunludur. Lütfen geçerli bir neden girin.");
      return;
    }

    if (!invoiceNumber.trim() && !dispatchNoteNumber.trim()) {
      setFormError("Fatura numarası veya sevk irsaliyesi numarasından en az biri dolu olmalıdır.");
      return;
    }

    // Line validations
    for (const line of lines) {
      const rmInfo = rmMap[line.rawMaterialId] || { name: 'Bilinmeyen Hammadde', category: '' };
      
      if (line.isFruitOrVeg) {
        if (line.kunyeStatus === 'not_applicable') {
          setFormError(`"${rmInfo.name}" Meyve/Sebze kategorisindedir, dolayısıyla Künye Durumu 'Künye Yok' olamaz.`);
          return;
        }
        if (!line.kunyeNumber || !line.kunyeNumber.trim()) {
          setFormError(`"${rmInfo.name}" (Meyve/Sebze) için künye numarası girilmesi zorunludur.`);
          return;
        }
      } else {
        if (line.kunyeStatus !== 'not_applicable' && (!line.kunyeNumber || !line.kunyeNumber.trim())) {
          setFormError(`"${rmInfo.name}" için künye numarası girilmesi zorunludur veya künye durumu 'Künye Yok' seçilmelidir.`);
          return;
        }
      }

      if (line.unitPrice === undefined || line.unitPrice === null || line.unitPrice < 0) {
        setFormError(`"${rmInfo.name}" için birim fiyat sıfır veya pozitif bir sayı olmalıdır.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateRawMaterialReceiptInput = {
        receiptId: receipt.id,
        expectedUpdatedAt: receipt.updatedAt,
        reason: reason.trim(),
        invoiceNumber: invoiceNumber.trim() || null,
        dispatchNoteNumber: dispatchNoteNumber.trim() || null,
        note: generalNote.trim() || null,
        lines: lines.map(line => ({
          lotId: line.id,
          unitPrice: Number(line.unitPrice),
          kunyeStatus: line.kunyeStatus,
          kunyeNumber: line.kunyeStatus === 'not_applicable' ? null : (line.kunyeNumber?.trim() || null),
          note: line.note.trim() || null
        }))
      };

      await onUpdateReceipt(payload);
      setShowSuccessToast(true);
      onSuccess?.();
      
      setTimeout(() => {
        setShowSuccessToast(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Receipt correction failed:", err);
      // Clean and descriptive error message
      if (err.message && err.message.includes("lock")) {
        setFormError("Hata: Bu fatura başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.");
      } else {
        setFormError(err.message || "Fatura düzeltilirken beklenmedik bir hata oluştu.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Difference calculator for change logs
  const renderChangeLog = (correction: RawMaterialReceiptCorrection) => {
    const before = correction.beforeState;
    const after = correction.afterState;
    if (!before || !after) return null;

    const changes: React.ReactNode[] = [];

    if (before.receipt.invoice_number !== after.receipt.invoice_number) {
      changes.push(
        <div key="invoice" className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Fatura No:</span>
          <span className="line-through text-red-500 font-mono">{before.receipt.invoice_number || 'boş'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span className="text-emerald-600 font-mono font-bold">{after.receipt.invoice_number || 'boş'}</span>
        </div>
      );
    }

    if (before.receipt.dispatch_note_number !== after.receipt.dispatch_note_number) {
      changes.push(
        <div key="dispatch" className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">İrsaliye No:</span>
          <span className="line-through text-red-500 font-mono">{before.receipt.dispatch_note_number || 'boş'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span className="text-emerald-600 font-mono font-bold">{after.receipt.dispatch_note_number || 'boş'}</span>
        </div>
      );
    }

    if (before.receipt.note !== after.receipt.note) {
      changes.push(
        <div key="note" className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Açıklama:</span>
          <span className="line-through text-red-400 max-w-[120px] truncate">{before.receipt.note || 'yok'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span className="text-emerald-600 font-medium max-w-[120px] truncate">{after.receipt.note || 'yok'}</span>
        </div>
      );
    }

    // Compare lines
    const beforeLines = before.lots || [];
    const afterLines = after.lots || [];

    afterLines.forEach((afterLine: any) => {
      const beforeLine = beforeLines.find((l: any) => l.id === afterLine.id);
      if (!beforeLine) return;

      const rmInfo = rmMap[afterLine.raw_material_id] || { name: 'Bilinmeyen Hammadde' };
      const lineChanges: React.ReactNode[] = [];

      if (beforeLine.unit_price !== afterLine.unit_price) {
        lineChanges.push(
          <span key="price" className="inline-flex items-center gap-1">
            Fiyat: <span className="line-through text-red-400">{formatCurrency(beforeLine.unit_price)}</span>
            <ArrowRight size={10} />
            <span className="text-emerald-600 font-bold">{formatCurrency(afterLine.unit_price)}</span>
          </span>
        );
      }

      if (beforeLine.kunye_number !== afterLine.kunye_number) {
        lineChanges.push(
          <span key="kunye" className="inline-flex items-center gap-1">
            Künye: <span className="line-through text-red-400 font-mono">{beforeLine.kunye_number || 'yok'}</span>
            <ArrowRight size={10} />
            <span className="text-emerald-600 font-mono font-bold">{afterLine.kunye_number || 'yok'}</span>
          </span>
        );
      }

      if (beforeLine.kunye_status !== afterLine.kunye_status) {
        const getStatusLabel = (st: string) => {
          if (st === 'provided') return 'Gerçek';
          if (st === 'internal_placeholder') return 'Dahili';
          return 'Gerekmiyor';
        };
        lineChanges.push(
          <span key="status" className="inline-flex items-center gap-1">
            Durum: <span className="line-through text-red-400">{getStatusLabel(beforeLine.kunye_status)}</span>
            <ArrowRight size={10} />
            <span className="text-emerald-600 font-bold">{getStatusLabel(afterLine.kunye_status)}</span>
          </span>
        );
      }

      if (beforeLine.note !== afterLine.note) {
        lineChanges.push(
          <span key="linenote" className="inline-flex items-center gap-1">
            Not: <span className="line-through text-red-400 max-w-[80px] truncate">{beforeLine.note || 'yok'}</span>
            <ArrowRight size={10} />
            <span className="text-emerald-600 font-medium max-w-[80px] truncate">{afterLine.note || 'yok'}</span>
          </span>
        );
      }

      if (lineChanges.length > 0) {
        changes.push(
          <div key={`line-${afterLine.id}`} className="pl-3 border-l-2 border-indigo-200 py-0.5 space-y-0.5">
            <span className="text-slate-500 font-bold text-[10px] uppercase block">{rmInfo.name}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 font-semibold">
              {lineChanges}
            </div>
          </div>
        );
      }
    });

    if (changes.length === 0) {
      return <div className="text-[11px] text-slate-400 italic">Hiçbir değer değişmedi (sadece imza güncellendi).</div>;
    }

    return <div className="space-y-2 mt-2 bg-slate-50 border border-slate-100 p-3 rounded-lg">{changes}</div>;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900 text-white px-6 py-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-indigo-500 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">
                Güvenli Düzeltme
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {receipt.id}</span>
            </div>
            <h3 className="font-bold text-base mt-1 text-white">Satın Alma Fişi & Fatura Güvenli Düzenleme</h3>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Success Alert */}
        <AnimatePresence>
          {showSuccessToast && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-500 text-white px-6 py-3 font-semibold text-xs flex items-center gap-2 shadow-inner shrink-0"
            >
              <CheckCircle2 size={16} />
              <span>Satın alma fişi ve ilişkili partiler başarıyla, atomik biçimde düzeltildi!</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-xs text-rose-800 font-semibold animate-pulse">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <div>{formError}</div>
            </div>
          )}

          {/* Reason Input */}
          <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4.5 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
              <MessageSquare size={15} />
              <span>Düzeltme Gerekçesi (Zorunlu) *</span>
            </div>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fatura eşleme hatası, hatalı künye girişi, birim fiyat düzeltmesi vb."
              className="w-full bg-white px-3.5 py-2 rounded-xl border border-amber-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-amber-400 font-semibold"
            />
            <p className="text-[10px] text-amber-700/80 font-medium">
              Mevzuat gereği her düzeltme için açıklama girilmelidir. Bu açıklama audit günlüğüne kaydedilecektir.
            </p>
          </div>

          {/* Header Metadata fields */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} className="text-indigo-600" />
              <span>Fatura / Fiş Genel Bilgileri</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Fatura Numarası</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="örn. ABC202600001"
                  className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Sevk İrsaliyesi Numarası</label>
                <input
                  type="text"
                  value={dispatchNoteNumber}
                  onChange={(e) => setDispatchNoteNumber(e.target.value)}
                  placeholder="örn. IRS202600001"
                  className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Genel Fiş Notu</label>
              <input
                type="text"
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                placeholder="Önemli açıklamalar, kantar ağırlığı vb."
                className="w-full bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-semibold"
              />
            </div>
          </div>

          {/* Lots Lines list */}
          <div className="space-y-4">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-600" />
              <span>Partiler (Lotlar) ve Birim Fiyat / Künye Düzeltmeleri</span>
            </h4>

            <div className="space-y-4">
              {lines.map((line, index) => {
                const rmInfo = rmMap[line.rawMaterialId] || { name: 'Bilinmeyen Hammadde', category: 'Diğer', unit: 'kg' };
                return (
                  <div key={line.id} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs hover:border-slate-300 transition-colors">
                    {/* Line Header */}
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-800">{index + 1}. {rmInfo.name}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold font-mono">
                          {line.internalLotNo}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">Kategori: {rmInfo.category}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        Miktar: <span className="font-bold text-slate-800">{line.quantityReceived} {line.unit}</span> (Kalan: <span className="font-extrabold text-slate-800">{line.quantityRemaining} {line.unit}</span>)
                      </div>
                    </div>

                    {/* Line Controls */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Price Control (4 cols) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Birim Fiyat (TL)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.0001"
                            disabled={line.isPriceLocked}
                            value={line.unitPrice === 0 ? '' : line.unitPrice}
                            onChange={(e) => handleLineFieldChange(line.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className={`w-full px-3 py-1.5 rounded-xl border text-xs font-bold focus:outline-none focus:border-indigo-500 ${
                              line.isPriceLocked 
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                                : 'bg-white text-slate-800 border-slate-200'
                            }`}
                          />
                        </div>
                        {line.isPriceLocked && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold mt-1">
                            <Info size={11} />
                            <span>Kullanıldığı için fiyat kilitli</span>
                          </div>
                        )}
                      </div>

                      {/* Tag Status Control (4 cols) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Künye Durumu</label>
                        <select
                          value={line.kunyeStatus}
                          onChange={(e) => handleLineFieldChange(line.id, 'kunyeStatus', e.target.value as KunyeStatus)}
                          className="w-full bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="provided">Gerçek Künye</option>
                          <option value="internal_placeholder">Dahili / Dummy Künye</option>
                          {!line.isFruitOrVeg && (
                            <option value="not_applicable">Künye Gerekmiyor / Yok</option>
                          )}
                        </select>
                      </div>

                      {/* Tag Number Control (3 cols) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Künye Numarası</label>
                        <input
                          type="text"
                          disabled={line.kunyeStatus === 'not_applicable'}
                          value={line.kunyeNumber || ''}
                          onChange={(e) => handleLineFieldChange(line.id, 'kunyeNumber', e.target.value)}
                          placeholder={line.kunyeStatus === 'not_applicable' ? 'Gerekmiyor' : 'örn. 0123456789'}
                          className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:border-indigo-500 ${
                            line.kunyeStatus === 'not_applicable'
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-white text-slate-800 border-slate-200 font-mono font-bold'
                          }`}
                        />
                      </div>

                      {/* Line Note (3 cols) */}
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Satır Açıklaması</label>
                        <input
                          type="text"
                          value={line.note}
                          onChange={(e) => handleLineFieldChange(line.id, 'note', e.target.value)}
                          placeholder="Bu satıra özel açıklama"
                          className="w-full bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit History Logs */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} className="text-indigo-600" />
              <span>Düzeltme ve Değişiklik Geçmişi (Audit Logs)</span>
            </h4>

            {loadingHistory ? (
              <div className="text-center py-4 text-xs text-slate-400 font-semibold flex items-center justify-center gap-2">
                <Clock size={14} className="animate-spin text-slate-400" />
                <span>Geçmiş kayıtlar yükleniyor...</span>
              </div>
            ) : corrections.length === 0 ? (
              <div className="text-xs text-slate-400 italic bg-slate-50 border border-slate-100/50 p-4 rounded-2xl text-center">
                Bu satın alma fişine ait herhangi bir düzeltme kaydı bulunmuyor. Fiş tamamen orijinal halinde.
              </div>
            ) : (
              <div className="space-y-3">
                {corrections.map((corr) => {
                  const isExpanded = expandedCorrectionId === corr.id;
                  return (
                    <div key={corr.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/40">
                      <div 
                        onClick={() => setExpandedCorrectionId(isExpanded ? null : corr.id)}
                        className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-slate-200 font-mono text-slate-700 px-2 py-0.5 rounded font-bold">
                              {corr.id}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {formatDate(corr.createdAt)}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-700 line-clamp-1">
                            Açıklama: <span className="text-indigo-600 italic font-bold">"{corr.reason}"</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="text-[10px] font-bold uppercase tracking-wider">Detayları Gör</span>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-white text-xs">
                          {renderChangeLog(corr)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4.5 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-400 font-semibold max-w-sm">
            Değişikliklerin tamamı organization_id bazında, tenant-safe ve audit-logged olarak kaydedilir.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4.5 py-2.5 border border-slate-200 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || showSuccessToast}
              className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Clock size={14} className="animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Düzeltmeleri Kaydet (Atomik)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
