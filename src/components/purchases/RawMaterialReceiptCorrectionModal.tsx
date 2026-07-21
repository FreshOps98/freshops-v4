import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, AlertTriangle, Save, Clock, History, FileText, CheckCircle2,
  ArrowRight, MessageSquare, Info, ChevronDown, ChevronUp, DollarSign
} from 'lucide-react';
import {
  RawMaterialReceipt, RawMaterialLot, RawMaterial,
  UpdateRawMaterialReceiptInput, UpdateRawMaterialReceiptResult,
  RawMaterialReceiptCorrection, KunyeStatus, RawMaterialReceiptCorrectionModalLot,
  RawMaterialReceiptCorrectionState, SupplierTraceabilityLot
} from '../../types';
import { supabaseDataService } from '../../services/supabaseDataService';
import { formatCurrency, formatDate } from '../../utils/format';

interface RawMaterialReceiptCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: RawMaterialReceipt | null;
  lots: RawMaterialReceiptCorrectionModalLot[];
  rawMaterials: RawMaterial[];
  onUpdateReceipt: (input: UpdateRawMaterialReceiptInput) => Promise<UpdateRawMaterialReceiptResult>;
  onSuccess?: () => void;
}

interface EditableLine {
  id: string;
  rawMaterialId: string;
  internalLotNo: string;
  quantityReceived: string;
  quantityReceivedInitial: number;
  quantityRemaining: number;
  unit: string;
  unitPrice: string;
  unitPriceInitial: number;
  kunyeStatus: KunyeStatus;
  kunyeNumber: string | null;
  note: string;
  isFruitOrVeg: boolean;
  hasProductionUsageHistory: boolean;
}

function getErrorMessage(error: unknown): string {
  if (!error) return "Bilinmeyen bir hata oluştu.";
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

function isOptimisticConcurrencyError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();
  const triggers = [
    'başka bir işlem',
    'güncellenmiş',
    'güncelleme zamanı',
    'beklenen güncelleme',
    'optimistic',
    'concurrency',
    'lock'
  ];
  return triggers.some(trigger => lowerMessage.includes(trigger));
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
  const [lineErrors, setLineErrors] = useState<Record<string, { price?: string; quantity?: string; kunye?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<UpdateRawMaterialReceiptResult | null>(null);

  const [traceabilityLots, setTraceabilityLots] = useState<Record<string, SupplierTraceabilityLot>>({});
  const [loadingTraceability, setLoadingTraceability] = useState(true);
  const [traceabilityVerified, setTraceabilityVerified] = useState(false);
  const [traceabilityError, setTraceabilityError] = useState<string | null>(null);
  const [linesIntegrityVerified, setLinesIntegrityVerified] = useState(false);
  const [isQuantityChangedOnSubmit, setIsQuantityChangedOnSubmit] = useState(false);

  // Fetch supplier traceability on open to check for usage history
  useEffect(() => {
    if (!isOpen || !receipt) {
      setTraceabilityLots({});
      setLoadingTraceability(false);
      setTraceabilityVerified(false);
      setTraceabilityError(null);
      return;
    }

    const loadTraceability = async () => {
      setLoadingTraceability(true);
      setTraceabilityVerified(false);
      setTraceabilityError(null);
      try {
        const res = await supabaseDataService.getSupplierTraceabilityAtomic(receipt.supplierId);
        if (res && res.receipts) {
          const map: Record<string, SupplierTraceabilityLot> = {};
          res.receipts.forEach(r => {
            if (r.lots) {
              r.lots.forEach(lot => {
                map[lot.id] = lot;
              });
            }
          });
          setTraceabilityLots(map);
          setTraceabilityVerified(true);
        } else {
          setTraceabilityLots({});
          setTraceabilityVerified(true);
        }
      } catch (err: unknown) {
        console.error("Error fetching supplier traceability in modal:", err);
        setTraceabilityError("Lot kullanım geçmişi doğrulanamadı. Güvenlik nedeniyle miktar ve fiyat değişiklikleri kilitlenmiştir. Lütfen sayfayı yenileyip tekrar deneyin.");
        setTraceabilityVerified(false);
      } finally {
        setLoadingTraceability(false);
      }
    };

    void loadTraceability();
  }, [isOpen, receipt]);

  // History State
  const [corrections, setCorrections] = useState<RawMaterialReceiptCorrection[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCorrectionId, setExpandedCorrectionId] = useState<string | null>(null);

  // Fast mapping for hammadde names
  const rmMap = React.useMemo(() => {
    const map: Record<string, { name: string; category: string; unit: string }> = {};
    rawMaterials.forEach(rm => {
      map[rm.id] = { name: rm.name, category: rm.category, unit: rm.unit };
    });
    return map;
  }, [rawMaterials]);

  const initializedReceiptIdRef = useRef<string | null>(null);

  // Load Initial Data
  useEffect(() => {
    if (!isOpen) {
      initializedReceiptIdRef.current = null;
      setLinesIntegrityVerified(false);
      setIsQuantityChangedOnSubmit(false);
      return;
    }

    if (receipt && initializedReceiptIdRef.current !== receipt.id) {
      initializedReceiptIdRef.current = receipt.id;

      // Filter active lots for this receipt using the real typed field isDeleted
      const activeReceiptLots = lots.filter(lot => lot.rawMaterialReceiptId === receipt.id && lot.isDeleted !== true);

      // Ensure no duplicate lot IDs
      const lotIds = new Set<string>();
      let hasDuplicate = false;
      for (const lot of activeReceiptLots) {
        if (lotIds.has(lot.id)) {
          hasDuplicate = true;
        }
        lotIds.add(lot.id);
      }

      const initialLines = activeReceiptLots.map(lot => {
        const rm = rawMaterials.find(r => r.id === lot.rawMaterialId);
        const isFruitOrVeg = rm ? (rm.category === 'Meyve' || rm.category === 'Sebze') : false;

        return {
          id: lot.id,
          rawMaterialId: lot.rawMaterialId,
          internalLotNo: lot.internalLotNo,
          quantityReceived: lot.quantityReceived.toString(),
          quantityReceivedInitial: lot.quantityReceived,
          quantityRemaining: lot.quantityRemaining,
          unit: lot.unit,
          unitPrice: lot.unitPrice.toString(),
          unitPriceInitial: lot.unitPrice,
          kunyeStatus: lot.kunyeStatus || (isFruitOrVeg ? 'provided' : 'not_applicable'),
          kunyeNumber: lot.kunyeNumber,
          note: lot.note || '',
          isFruitOrVeg,
          hasProductionUsageHistory: lot.hasProductionUsageHistory === true
        };
      });

      // Bütünlük doğrulama kuralları:
      // 1. Mükerrer lot olmamalı
      // 2. En az bir aktif lot olmalı
      // 3. Her aktif lot ID'si lines içinde tam olarak bir kez yer almalı
      const isIntegrityOk = !hasDuplicate && activeReceiptLots.length > 0 && (activeReceiptLots.length === lotIds.size);

      setLines(initialLines);
      setLineErrors({});
      setInvoiceNumber(receipt.invoiceNumber || '');
      setDispatchNoteNumber(receipt.dispatchNoteNumber || '');
      setGeneralNote(receipt.note || '');
      setReason('');
      setSuccessResult(null);
      setExpandedCorrectionId(null);
      setIsQuantityChangedOnSubmit(false);

      if (!isIntegrityOk) {
        setLinesIntegrityVerified(false);
        setFormError("Kritik Hata: Fişe bağlı hammadde satırları (lotlar) arasında bütünlük hatası var. Bazı satırlar eksik, fazla veya mükerrer. Lütfen sayfayı yenileyip tekrar deneyin.");
      } else {
        setLinesIntegrityVerified(true);
        setFormError(null);
      }

      void fetchCorrections();
    }
  }, [isOpen, receipt, lots, rawMaterials]);

  const fetchCorrections = async () => {
    if (!receipt) return;
    setLoadingHistory(true);
    try {
      const history = await supabaseDataService.getRawMaterialReceiptCorrections(receipt.id);
      setCorrections(history);
    } catch (err: unknown) {
      console.error("Error fetching corrections:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen || !receipt) return null;

  // Handler for line editing
  const handleLineFieldChange = <K extends keyof EditableLine>(
    lotId: string,
    field: K,
    value: EditableLine[K]
  ) => {
    setLines(prev => prev.map(line => {
      if (line.id === lotId) {
        const updated = { ...line, [field]: value };

        // If status changed to 'not_applicable', clear kunyeNumber
        if (field === 'kunyeStatus' && (value as unknown) === 'not_applicable') {
          updated.kunyeNumber = null;
        }

        return updated;
      }
      return line;
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setFormError(null);
    setLineErrors({});

    // Guard Checks
    if (isSubmitting) return;

    if (loadingTraceability || !traceabilityVerified) {
      if (traceabilityError) {
        setFormError(traceabilityError);
      } else {
        setFormError("Hammadde izlenebilirlik geçmişi doğrulanıyor. Lütfen bekleyin...");
      }
      return;
    }

    if (!linesIntegrityVerified) {
      setFormError("Kritik Hata: Fişe bağlı hammadde satırları (lotlar) arasında bütünlük hatası var. Bazı satırlar eksik, fazla veya mükerrer. Lütfen sayfayı yenileyip tekrar deneyin.");
      return;
    }

    if (lines.length === 0) {
      setFormError("Fişe bağlı hammadde satırı bulunamadı.");
      return;
    }

    // 2. Base Validations
    if (!reason.trim()) {
      setFormError("Düzeltme gerekçesi girmek zorunludur. Lütfen geçerli bir neden girin.");
      return;
    }

    if (!invoiceNumber.trim() && !dispatchNoteNumber.trim()) {
      setFormError("Fatura numarası veya sevk irsaliyesi numarasından en az biri dolu olmalıdır.");
      return;
    }

    const newLineErrors: Record<string, { price?: string; quantity?: string; kunye?: string }> = {};
    let hasLineErrors = false;

    // Line validations
    for (const line of lines) {
      const rmInfo = rmMap[line.rawMaterialId] || { name: 'Bilinmeyen Hammadde', category: '' };
      const errors: { price?: string; quantity?: string; kunye?: string } = {};

      if (line.isFruitOrVeg) {
        if (line.kunyeStatus === 'not_applicable') {
          errors.kunye = "Meyve/Sebze kategorisindeki hammadde için Künye Durumu 'Künye Yok' olamaz.";
          setFormError(`"${rmInfo.name}" Meyve/Sebze kategorisindedir, dolayısıyla Künye Durumu 'Künye Yok' olamaz.`);
          hasLineErrors = true;
        } else if (!line.kunyeNumber || !line.kunyeNumber.trim()) {
          errors.kunye = "Meyve/Sebze için künye numarası girilmesi zorunludur.";
          setFormError(`"${rmInfo.name}" (Meyve/Sebze) için künye numarası girilmesi zorunludur.`);
          hasLineErrors = true;
        }
      } else {
        if (line.kunyeStatus !== 'not_applicable' && (!line.kunyeNumber || !line.kunyeNumber.trim())) {
          errors.kunye = "Künye numarası zorunludur veya künye durumu 'Künye Yok' seçilmelidir.";
          setFormError(`"${rmInfo.name}" için künye numarası girilmesi zorunludur veya künye durumu 'Künye Yok' seçilmelidir.`);
          hasLineErrors = true;
        }
      }

      const rawPrice = line.unitPrice.trim();
      if (rawPrice === "") {
        errors.price = "Birim fiyat boş bırakılamaz.";
        setFormError("Birim fiyat boş bırakılamaz.");
        hasLineErrors = true;
      } else {
        const parsedPrice = Number(rawPrice);
        if (isNaN(parsedPrice) || !isFinite(parsedPrice) || parsedPrice <= 0) {
          errors.price = "Birim fiyat 0’dan büyük olmalıdır.";
          setFormError("Birim fiyat 0’dan büyük olmalıdır.");
          hasLineErrors = true;
        }
      }

      const rawQty = line.quantityReceived.trim();
      if (rawQty === "") {
        errors.quantity = "Kabul miktarı boş bırakılamaz.";
        setFormError(`"${rmInfo.name}" için kabul miktarı boş bırakılamaz.`);
        hasLineErrors = true;
      } else {
        const parsedQty = Number(rawQty);
        if (isNaN(parsedQty) || !isFinite(parsedQty) || parsedQty <= 0) {
          errors.quantity = "Kabul miktarı sıfırdan büyük geçerli bir sayı olmalıdır.";
          setFormError(`"${rmInfo.name}" için kabul miktarı sıfırdan büyük geçerli bir sayı olmalıdır.`);
          hasLineErrors = true;
        }
      }

      if (Object.keys(errors).length > 0) {
        newLineErrors[line.id] = errors;
      }

      if (hasLineErrors) {
        setLineErrors(newLineErrors);
        return;
      }
    }

    // Verify lines integrity on submit
    const submitActiveLots = lots.filter(lot => lot.rawMaterialReceiptId === receipt.id && lot.isDeleted !== true);
    const submitLotIds = new Set(submitActiveLots.map(l => l.id));

    // Check if the lines to be submitted match the active lots exactly and contain no duplicates
    const activeLotIdsInLines = new Set<string>();
    let submitHasDuplicate = false;
    for (const line of lines) {
      if (activeLotIdsInLines.has(line.id)) {
        submitHasDuplicate = true;
      }
      activeLotIdsInLines.add(line.id);
    }

    const setsMatch = submitLotIds.size === activeLotIdsInLines.size && [...submitLotIds].every(id => activeLotIdsInLines.has(id));

    if (submitHasDuplicate || !setsMatch || submitActiveLots.length === 0) {
      setFormError("Kritik Hata: Gönderilecek veriler arasında bütünlük hatası bulunuyor (mükerrer, eksik veya fazla lot). İşlem iptal edildi.");
      return;
    }

    // Change detection logic
    let hasChanges = false;
    let quantityChanged = false;

    // Check header changes
    if (
      invoiceNumber.trim() !== (receipt.invoiceNumber || '') ||
      dispatchNoteNumber.trim() !== (receipt.dispatchNoteNumber || '') ||
      generalNote.trim() !== (receipt.note || '')
    ) {
      hasChanges = true;
    }

    // Check line changes
    for (const line of lines) {
      const originalLot = lots.find(l => l.id === line.id);
      const originalNote = originalLot?.note || '';
      const originalKunyeStatus = originalLot?.kunyeStatus || (line.isFruitOrVeg ? 'provided' : 'not_applicable');
      const originalKunyeNumber = originalLot?.kunyeNumber || null;

      const hasUsage = line.hasProductionUsageHistory === true || (traceabilityLots[line.id]?.productionUsages?.length ?? 0) > 0;
      const isQuantityLocked = Math.abs(line.quantityRemaining - line.quantityReceivedInitial) > 0.0001 || hasUsage;

      const currentPrice = Number(line.unitPrice.trim());
      const currentQty = isQuantityLocked ? line.quantityReceivedInitial : Number(line.quantityReceived.trim());
      const currentKunyeStatus = line.kunyeStatus;
      const currentKunyeNumber = line.kunyeStatus === 'not_applicable' ? null : (line.kunyeNumber?.trim() || null);
      const currentNote = line.note.trim();

      const originalPrice = originalLot?.unitPrice ?? line.unitPriceInitial;
      const originalQty = line.quantityReceivedInitial;

      if (Math.abs(currentQty - originalQty) > 0.0001) {
        quantityChanged = true;
      }

      if (
        Math.abs(currentPrice - originalPrice) > 0.0001 ||
        Math.abs(currentQty - originalQty) > 0.0001 ||
        currentKunyeStatus !== originalKunyeStatus ||
        currentKunyeNumber !== originalKunyeNumber ||
        currentNote !== originalNote
      ) {
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      setIsQuantityChangedOnSubmit(false);
      setSuccessResult({
        success: true,
        noChanges: true,
        receiptId: receipt.id,
        updatedAt: receipt.updatedAt,
        correctionId: null,
        updatedLots: [],
        recalculatedRawMaterials: []
      });
      return;
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
        lines: lines.map(line => {
          const hasUsage = line.hasProductionUsageHistory === true || (traceabilityLots[line.id]?.productionUsages?.length ?? 0) > 0;
          const isQuantityLocked = Math.abs(line.quantityRemaining - line.quantityReceivedInitial) > 0.0001 || hasUsage;

          return {
            lotId: line.id,
            unitPrice: Number(line.unitPrice.trim()),
            quantityReceived: isQuantityLocked ? line.quantityReceivedInitial : Number(line.quantityReceived.trim()),
            kunyeStatus: line.kunyeStatus,
            kunyeNumber: line.kunyeStatus === 'not_applicable' ? null : (line.kunyeNumber?.trim() || null),
            note: line.note.trim() || null
          };
        })
      };

      const result = await onUpdateReceipt(payload);
      if (result.success === false) {
        setFormError("İşlem başarısız oldu. Güncelleme tamamlanamadı.");
      } else {
        setIsQuantityChangedOnSubmit(quantityChanged);
        setSuccessResult(result);
      }
    } catch (err: unknown) {
      console.error("Receipt correction failed:", err);
      const errMsg = getErrorMessage(err);
      if (isOptimisticConcurrencyError(errMsg)) {
        setFormError("Bu fiş başka bir işlem tarafından güncellendi. Verileri yenileyip tekrar deneyin.");
      } else {
        setFormError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    if (isSubmitting) return;
    if (successResult) {
      if (successResult.success && successResult.noChanges === false) {
        onSuccess?.();
      }
      setSuccessResult(null);
    }
    onClose();
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

    type LotStateItem = RawMaterialReceiptCorrectionState['lots'][number];

    afterLines.forEach((afterLine: LotStateItem) => {
      const beforeLine = beforeLines.find((l: LotStateItem) => l.id === afterLine.id);
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

      const qtyBefore = beforeLine.quantity_received;
      const qtyAfter = afterLine.quantity_received;
      if (qtyBefore !== undefined && qtyAfter !== undefined && Math.abs(qtyBefore - qtyAfter) > 0.0001) {
        lineChanges.push(
          <span key="quantity" className="inline-flex items-center gap-1">
            Kabul Miktarı: <span className="line-through text-red-400">{qtyBefore} {rmInfo.unit || ''}</span>
            <ArrowRight size={10} />
            <span className="text-emerald-600 font-bold">{qtyAfter} {rmInfo.unit || ''}</span>
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
            onClick={handleModalClose}
            disabled={isSubmitting}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${isSubmitting ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <X size={20} />
          </button>
        </div>

        {successResult ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-center overflow-y-auto bg-slate-50">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
              <CheckCircle2 size={36} className="animate-bounce" />
            </div>
            {(() => {
              return (
                <>
                  <h4 className="text-lg font-bold text-slate-800">
                    {successResult.noChanges
                      ? "Herhangi bir değişiklik bulunmadı"
                      : isQuantityChangedOnSubmit
                        ? "Kabul Miktarı ve Fiş Başarıyla Güncellendi"
                        : "Fiş Bilgileri Başarıyla Güncellendi"}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md font-semibold leading-relaxed">
                    {successResult.noChanges
                      ? "Herhangi bir değişiklik bulunmadı. Düzeltme kaydı oluşturulmadı."
                      : isQuantityChangedOnSubmit
                        ? "Kabul miktarı ve ilişkili tüm stok bakiye hareketleri başarıyla düzeltildi."
                        : "Satın alma fişi başarıyla güncellendi."}
                  </p>
                </>
              );
            })()}

            {!successResult.noChanges && successResult.correctionId && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 w-full max-w-md text-left space-y-2.5 shadow-xs font-sans mt-2">
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Düzeltme Kayıt ID</span>
                  <span className="text-slate-700 font-mono font-bold bg-slate-100 px-2 py-0.5 rounded">{successResult.correctionId}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Güncellenme Zamanı</span>
                  <span className="text-slate-700 font-semibold">{formatDate(successResult.updatedAt)}</span>
                </div>
              </div>
            )}

            {successResult.partialRefreshError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3 text-xs text-amber-800 font-semibold max-w-md text-left mt-2 shadow-xs">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                <div>Fiş başarıyla kaydedildi ancak ekran verilerinin bir kısmı yenilenemedi. Lütfen sayfayı yenileyin.</div>
              </div>
            )}

            <div className="pt-4">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-6 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all active:scale-95 cursor-pointer"
              >
                Kapat ve Listeyi Yenile
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">

          {loadingTraceability && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3 text-xs text-indigo-800 font-semibold items-center animate-pulse">
              <Clock className="text-indigo-500 shrink-0 animate-spin" size={16} />
              <div>Lot kilit ve üretim geçmişi kontrol ediliyor. Lütfen bekleyin...</div>
            </div>
          )}

          {traceabilityError && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-xs text-rose-800 font-semibold">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <div>{traceabilityError}</div>
            </div>
          )}

          {!linesIntegrityVerified && !loadingTraceability && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-xs text-rose-800 font-semibold">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <div>Kritik Hata: Fişe bağlı hammadde satırları (lotlar) arasında bütünlük hatası var. Bazı satırlar eksik, fazla veya mükerrer. Lütfen sayfayı yenileyip tekrar deneyin.</div>
            </div>
          )}

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
                const hasUsage = line.hasProductionUsageHistory === true || (traceabilityLots[line.id]?.productionUsages?.length ?? 0) > 0;
                const isPriceLocked = loadingTraceability || !traceabilityVerified || !linesIntegrityVerified || Math.abs(line.quantityRemaining - line.quantityReceivedInitial) > 0.0001 || hasUsage;
                const isQuantityLocked = loadingTraceability || !traceabilityVerified || !linesIntegrityVerified || Math.abs(line.quantityRemaining - line.quantityReceivedInitial) > 0.0001 || hasUsage;

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
                        Orijinal Miktar: <span className="font-bold text-slate-800">{line.quantityReceivedInitial} {line.unit}</span> (Kalan: <span className="font-extrabold text-slate-800">{line.quantityRemaining} {line.unit}</span>)
                      </div>
                    </div>

                    {/* Line Controls */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Price Control (2 cols) */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Birim Fiyat (TL)</label>
                        <div className="relative">
                          <input
                            type="text"
                            disabled={isPriceLocked}
                            value={line.unitPrice}
                            onChange={(e) => handleLineFieldChange(line.id, 'unitPrice', e.target.value)}
                            placeholder="0.0000"
                            className={`w-full px-3 py-1.5 rounded-xl border text-xs font-bold focus:outline-none focus:border-indigo-500 ${
                              isPriceLocked
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-800 border-slate-200'
                            }`}
                          />
                        </div>
                        {isPriceLocked && (
                          <div className="flex flex-col gap-0.5 text-[9px] text-amber-600 font-bold mt-1 leading-tight">
                            <div className="flex items-center gap-1">
                              <Info size={10} className="shrink-0" />
                              <span>Fiyat kilitli</span>
                            </div>
                            {!linesIntegrityVerified ? (
                              <span className="text-slate-500 font-medium">
                                Fiş bütünlük hatası nedeniyle kilitlendi.
                              </span>
                            ) : !traceabilityVerified ? (
                              <span className="text-slate-500 font-medium">
                                Lot kullanım geçmişi doğrulanamadığı için kilitli.
                              </span>
                            ) : hasUsage ? (
                              <span className="text-slate-500 font-medium">
                                Üretimde kullanıldığı için fiyat kilitli.
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">
                                Kalan miktar kabulden farklı olduğu için fiyat kilitli.
                              </span>
                            )}
                          </div>
                        )}
                        {lineErrors[line.id]?.price && (
                          <span className="text-[10px] text-rose-500 font-bold block mt-1">
                            {lineErrors[line.id]?.price}
                          </span>
                        )}
                      </div>

                      {/* Kabul Miktarı Control (2 cols) */}
                      <div className="md:col-span-2 space-y-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Kabul Miktarı</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0.0001"
                            disabled={isQuantityLocked}
                            value={line.quantityReceived}
                            onChange={(e) => handleLineFieldChange(line.id, 'quantityReceived', e.target.value)}
                            placeholder="0.00"
                            className={`w-full pr-10 px-3 py-1.5 rounded-xl border text-xs font-bold focus:outline-none focus:border-indigo-500 ${
                              isQuantityLocked
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-800 border-slate-200'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-extrabold text-slate-400 font-mono">
                            {line.unit}
                          </span>
                        </div>
                        {isQuantityLocked && (
                          <div className="flex flex-col gap-0.5 text-[9px] text-amber-600 font-bold mt-1 leading-tight">
                            <div className="flex items-center gap-1">
                              <Info size={10} className="shrink-0" />
                              <span>Miktar kilitli</span>
                            </div>
                            {!linesIntegrityVerified ? (
                              <span className="text-slate-500 font-medium">
                                Fiş bütünlük hatası nedeniyle kilitlendi.
                              </span>
                            ) : !traceabilityVerified ? (
                              <span className="text-slate-500 font-medium">
                                Lot kullanım geçmişi doğrulanamadığı için kilitli.
                              </span>
                            ) : hasUsage ? (
                              <span className="text-slate-500 font-medium">
                                Aktif veya geri alınmış üretim geçmişi nedeniyle miktar kilitli.
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">
                                Lot kalan miktarı kabul miktarından farklı (stoktan eksilmiş veya kullanılmış).
                              </span>
                            )}
                          </div>
                        )}
                        {lineErrors[line.id]?.quantity && (
                          <span className="text-[10px] text-rose-500 font-bold block mt-1">
                            {lineErrors[line.id]?.quantity}
                          </span>
                        )}
                      </div>

                      {/* Tag Status Control (2 cols) */}
                      <div className="md:col-span-2 space-y-1">
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
                        {lineErrors[line.id]?.kunye && (
                          <span className="text-[10px] text-rose-500 font-bold block mt-1">
                            {lineErrors[line.id]?.kunye}
                          </span>
                        )}
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
              onClick={handleModalClose}
              disabled={isSubmitting}
              className="px-4.5 py-2.5 border border-slate-200 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || loadingTraceability || !traceabilityVerified || !linesIntegrityVerified}
              className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Clock size={14} className="animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : loadingTraceability ? (
                <>
                  <Clock size={14} className="animate-spin" />
                  <span>Kontrol Ediliyor...</span>
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
      </>
    )}
  </motion.div>
    </div>
  );
}
