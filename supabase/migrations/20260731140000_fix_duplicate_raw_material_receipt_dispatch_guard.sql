BEGIN;

-- ============================================================================
-- FIX DUPLICATE RAW MATERIAL RECEIPT DISPATCH GUARD
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_prevent_duplicate_raw_material_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm_invoice TEXT;
  v_norm_dispatch TEXT;
  v_existing_receipt_id TEXT;
BEGIN
  -- If receipt is deleted, skip duplicate check
  IF COALESCE(NEW.is_deleted, FALSE) = TRUE THEN
    RETURN NEW;
  END IF;

  v_norm_invoice := NULLIF(UPPER(BTRIM(NEW.invoice_number)), '');
  v_norm_dispatch := NULLIF(UPPER(BTRIM(NEW.dispatch_note_number)), '');

  -- If both invoice and dispatch note numbers are empty/NULL, skip duplicate check
  IF v_norm_invoice IS NULL AND v_norm_dispatch IS NULL THEN
    RETURN NEW;
  END IF;

  -- If this is an UPDATE and key components (organization_id, supplier_id, normalized invoice, normalized dispatch note, is_deleted)
  -- did not change, allow the update so existing receipts can still be safely edited.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id = NEW.organization_id
       AND OLD.supplier_id = NEW.supplier_id
       AND COALESCE(OLD.is_deleted, FALSE) = COALESCE(NEW.is_deleted, FALSE)
       AND NULLIF(UPPER(BTRIM(OLD.invoice_number)), '') IS NOT DISTINCT FROM v_norm_invoice
       AND NULLIF(UPPER(BTRIM(OLD.dispatch_note_number)), '') IS NOT DISTINCT FROM v_norm_dispatch THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Deterministik kilit sırası: Önce invoice lock (varsa), sonra dispatch lock (varsa)
  IF v_norm_invoice IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('raw_material_receipt_invoice_guard:' || NEW.organization_id::TEXT || ':' || NEW.supplier_id || ':' || v_norm_invoice));
  END IF;

  IF v_norm_dispatch IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('raw_material_receipt_dispatch_guard:' || NEW.organization_id::TEXT || ':' || NEW.supplier_id || ':' || v_norm_dispatch));
  END IF;

  -- 1. Query for any existing active receipt with same org + supplier + normalized invoice
  IF v_norm_invoice IS NOT NULL THEN
    SELECT id INTO v_existing_receipt_id
    FROM public.raw_material_receipts
    WHERE organization_id = NEW.organization_id
      AND supplier_id = NEW.supplier_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND invoice_number IS NOT NULL
      AND NULLIF(UPPER(BTRIM(invoice_number)), '') = v_norm_invoice
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
    LIMIT 1;

    IF v_existing_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Bu tedarikçi için bu fatura numarasıyla (%) daha önce bir satın alma fişi oluşturulmuş (Fiş ID: %). Eksik ürün varsa mevcut fişi düzenleyerek yeni satır ekleyin.',
        NEW.invoice_number, v_existing_receipt_id;
    END IF;
  END IF;

  -- 2. Query for any existing active receipt with same org + supplier + normalized dispatch_note_number
  IF v_norm_dispatch IS NOT NULL THEN
    SELECT id INTO v_existing_receipt_id
    FROM public.raw_material_receipts
    WHERE organization_id = NEW.organization_id
      AND supplier_id = NEW.supplier_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND dispatch_note_number IS NOT NULL
      AND NULLIF(UPPER(BTRIM(dispatch_note_number)), '') = v_norm_dispatch
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
    LIMIT 1;

    IF v_existing_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Bu tedarikçi için bu sevk irsaliyesi numarasıyla (%) daha önce bir satın alma fişi oluşturulmuş (Fiş ID: %). Eksik ürün varsa mevcut fişi düzenleyerek yeni satır ekleyin.',
        NEW.dispatch_note_number, v_existing_receipt_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_raw_material_receipt ON public.raw_material_receipts;

CREATE TRIGGER trg_prevent_duplicate_raw_material_receipt
BEFORE INSERT OR UPDATE OF organization_id, supplier_id, invoice_number, dispatch_note_number, is_deleted
ON public.raw_material_receipts
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_prevent_duplicate_raw_material_receipt();

COMMIT;
