BEGIN;

-- ============================================================================
-- 1. DATABASE LEVEL DUPLICATE RECEIPT PROTECTION (TRIGGER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_prevent_duplicate_raw_material_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm_invoice TEXT;
  v_existing_receipt_id TEXT;
BEGIN
  -- If receipt is deleted or invoice_number is empty/NULL, skip duplicate check
  IF NEW.is_deleted = TRUE OR NEW.invoice_number IS NULL THEN
    RETURN NEW;
  END IF;

  v_norm_invoice := LOWER(BTRIM(NEW.invoice_number));
  IF v_norm_invoice = '' THEN
    RETURN NEW;
  END IF;

  -- If this is an UPDATE and key components (organization_id, supplier_id, normalized invoice, is_deleted)
  -- did not change, allow the update so existing duplicate receipts can still be safely edited.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id = NEW.organization_id
       AND OLD.supplier_id = NEW.supplier_id
       AND OLD.is_deleted = FALSE
       AND OLD.invoice_number IS NOT NULL
       AND LOWER(BTRIM(OLD.invoice_number)) = v_norm_invoice THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Acquire transaction-level advisory lock on (org, supplier, normalized invoice)
  PERFORM pg_advisory_xact_lock(hashtext('raw_material_receipt_invoice_guard:' || NEW.organization_id::TEXT || ':' || NEW.supplier_id || ':' || v_norm_invoice));

  -- Query for any existing active receipt with same org + supplier + normalized invoice
  SELECT id INTO v_existing_receipt_id
  FROM public.raw_material_receipts
  WHERE organization_id = NEW.organization_id
    AND supplier_id = NEW.supplier_id
    AND COALESCE(is_deleted, FALSE) = FALSE
    AND invoice_number IS NOT NULL
    AND LOWER(BTRIM(invoice_number)) = v_norm_invoice
    AND (TG_OP = 'INSERT' OR id <> NEW.id)
  LIMIT 1;

  IF v_existing_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu tedarikçi için bu fatura numarasıyla (%) daha önce bir satın alma fişi oluşturulmuş (Fiş ID: %). Eksik ürün varsa mevcut fişi düzenleyerek yeni satır ekleyin.',
      NEW.invoice_number, v_existing_receipt_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_raw_material_receipt ON public.raw_material_receipts;

CREATE TRIGGER trg_prevent_duplicate_raw_material_receipt
BEFORE INSERT OR UPDATE OF organization_id, supplier_id, invoice_number, is_deleted
ON public.raw_material_receipts
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_prevent_duplicate_raw_material_receipt();


-- ============================================================================
-- 2. EXTENDED ATOMIC RECEIPT UPDATE RPC (ALLOW ADDING NEW LINES)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_raw_material_receipt_atomic(
  p_receipt_id TEXT,
  p_expected_updated_at TIMESTAMPTZ,
  p_lines JSONB,
  p_reason TEXT,
  p_invoice_number TEXT DEFAULT NULL,
  p_dispatch_note_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_reason_clean TEXT;
  v_invoice_clean TEXT;
  v_dispatch_clean TEXT;
  v_note_clean TEXT;

  v_receipt RECORD;
  v_receipt_lot_ids TEXT[];
  v_receipt_lot_count INT;
  v_input_line_count INT;

  v_seen_existing_lot_ids TEXT[] := '{}'::TEXT[];
  v_existing_rm_ids TEXT[] := '{}'::TEXT[];
  v_new_rm_ids TEXT[] := '{}'::TEXT[];
  v_all_rm_ids TEXT[] := '{}'::TEXT[];

  v_inbound_movement_ids TEXT[];
  v_audit_movement_ids TEXT[];

  v_before_receipt_json JSONB;
  v_before_lots_json JSONB;
  v_before_movements_json JSONB;
  v_before_materials_json JSONB;
  v_before_state JSONB;

  v_after_receipt_json JSONB;
  v_after_lots_json JSONB;
  v_after_movements_json JSONB;
  v_after_materials_json JSONB;
  v_after_state JSONB;

  v_line_idx INT;
  v_line JSONB;
  v_line_lot_id TEXT;
  v_line_rm_id TEXT;
  v_line_price NUMERIC;
  v_line_quantity NUMERIC;
  v_line_kunye_status TEXT;
  v_line_kunye_number TEXT;
  v_line_note TEXT;

  v_price_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_quantity_delta NUMERIC;

  r_lot RECORD;
  r_material RECORD;
  r_inbound_movement RECORD;
  v_rm_unit TEXT;
  v_rm_category TEXT;
  v_allocation_count INT;
  v_new_sm_note TEXT;

  v_updated_rm_ids TEXT[] := '{}'::TEXT[];
  v_recalc_rm_id TEXT;
  v_current_stock NUMERIC;
  v_total_remaining_qty NUMERIC;
  v_weighted_avg_cost NUMERIC;
  v_last_purchase_price NUMERIC;

  v_max_lot_suffix INT := 0;
  v_sample_lot_no TEXT;
  v_lot_prefix TEXT;
  v_new_internal_lot_no TEXT;

  v_sm_id TEXT;
  v_lot_id TEXT;

  v_added_lot_ids TEXT[] := '{}'::TEXT[];
  v_added_sm_ids TEXT[] := '{}'::TEXT[];

  v_correction_id TEXT;
  v_user_id UUID;
  v_updated_lots_json JSONB;
  v_added_lots_json JSONB;
  v_recalculated_raw_materials_json JSONB;
  v_updated_at_str TEXT;
  v_has_changes BOOLEAN := FALSE;
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  v_reason_clean := BTRIM(p_reason);
  IF v_reason_clean IS NULL OR v_reason_clean = '' THEN
    RAISE EXCEPTION 'Düzeltme nedeni (p_reason) boş olamaz.';
  END IF;

  v_invoice_clean := NULLIF(BTRIM(p_invoice_number), '');
  v_dispatch_clean := NULLIF(BTRIM(p_dispatch_note_number), '');
  v_note_clean := NULLIF(BTRIM(p_note), '');

  IF v_invoice_clean IS NULL AND v_dispatch_clean IS NULL THEN
    RAISE EXCEPTION 'Fatura numarası veya sevk irsaliyesi numarasından en az biri dolu olmalıdır.';
  END IF;

  -- Lock target raw material receipt row
  SELECT *
  INTO v_receipt
  FROM public.raw_material_receipts
  WHERE id = p_receipt_id
    AND organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belirtilen satın alma fişi bulunamadı veya erişim yetkiniz yok.';
  END IF;

  IF v_receipt.is_deleted = TRUE THEN
    RAISE EXCEPTION 'Silinmiş satın alma fişleri güncellenemez.';
  END IF;

  IF v_receipt.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Fiş başka bir işlem tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines mutlaka geçerli bir array olmalıdır.';
  END IF;

  v_input_line_count := jsonb_array_length(p_lines);
  IF v_input_line_count = 0 THEN
    RAISE EXCEPTION 'p_lines boş bir array olamaz.';
  END IF;

  -- Get active lot IDs belonging to this receipt
  SELECT array_agg(id ORDER BY id)
  INTO v_receipt_lot_ids
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

  v_receipt_lot_ids := COALESCE(v_receipt_lot_ids, '{}'::TEXT[]);
  v_receipt_lot_count := COALESCE(cardinality(v_receipt_lot_ids), 0);

  -- Validate existing active lot presence in payload and collect new line raw materials
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_lot_id := NULLIF(BTRIM(v_line->>'lotId'), '');
    IF v_line_lot_id IS NOT NULL THEN
      -- Existing lot check
      IF NOT (v_line_lot_id = ANY(v_receipt_lot_ids)) THEN
        RAISE EXCEPTION 'Satır %: Lot % bu satın alma fişine ait değil veya aktif değil.',
          v_line_idx, v_line_lot_id;
      END IF;
      IF v_line_lot_id = ANY(v_seen_existing_lot_ids) THEN
        RAISE EXCEPTION 'p_lines içinde mükerrer (duplicate) lotId bulunamaz: %', v_line_lot_id;
      END IF;
      v_seen_existing_lot_ids := array_append(v_seen_existing_lot_ids, v_line_lot_id);
    ELSE
      -- New line check
      v_line_rm_id := NULLIF(BTRIM(COALESCE(v_line->>'rawMaterialId', v_line->>'raw_material_id')), '');
      IF v_line_rm_id IS NULL THEN
        RAISE EXCEPTION 'Yeni satır eklendiğinde rawMaterialId zorunludur.';
      END IF;
      v_new_rm_ids := array_append(v_new_rm_ids, v_line_rm_id);
    END IF;
  END LOOP;

  -- Ensure all existing active lots are retained in the payload
  IF COALESCE(cardinality(v_seen_existing_lot_ids), 0) <> v_receipt_lot_count THEN
    RAISE EXCEPTION 'Gönderilen satırlarda eksik lot var. Fişteki mevcut aktif lotların silinmesine izin verilmez.';
  END IF;

  -- Lock existing lots
  IF v_receipt_lot_count > 0 THEN
    PERFORM id
    FROM public.raw_material_lots
    WHERE id = ANY(v_receipt_lot_ids)
      AND organization_id = v_org_id
    ORDER BY id
    FOR UPDATE;

    SELECT array_agg(DISTINCT raw_material_id ORDER BY raw_material_id)
    INTO v_existing_rm_ids
    FROM public.raw_material_lots
    WHERE id = ANY(v_receipt_lot_ids)
      AND organization_id = v_org_id;

    SELECT array_agg(DISTINCT inbound_stock_movement_id ORDER BY inbound_stock_movement_id)
    INTO v_inbound_movement_ids
    FROM public.raw_material_lots
    WHERE id = ANY(v_receipt_lot_ids)
      AND organization_id = v_org_id;
  END IF;

  v_existing_rm_ids := COALESCE(v_existing_rm_ids, '{}'::TEXT[]);
  v_new_rm_ids := COALESCE(v_new_rm_ids, '{}'::TEXT[]);

  -- Combine and lock all affected raw materials in deterministic order
  SELECT array_agg(DISTINCT rm_id ORDER BY rm_id)
  INTO v_all_rm_ids
  FROM unnest(v_existing_rm_ids || v_new_rm_ids) AS rm_id;

  PERFORM id
  FROM public.raw_materials
  WHERE id = ANY(v_all_rm_ids)
    AND organization_id = v_org_id
    AND is_active = TRUE
    AND is_deleted = FALSE
  ORDER BY id ASC
  FOR UPDATE;

  -- Lock existing stock movements if any
  IF v_existing_rm_ids IS NOT NULL AND cardinality(v_existing_rm_ids) > 0 THEN
    PERFORM id
    FROM public.stock_movements
    WHERE organization_id = v_org_id
      AND raw_material_id = ANY(v_existing_rm_ids)
    ORDER BY raw_material_id, created_at, id
    FOR UPDATE;
  END IF;

  v_audit_movement_ids := COALESCE(v_inbound_movement_ids, '{}'::TEXT[]);

  -- SNAPSHOT BEFORE STATE
  SELECT jsonb_build_object(
    'id', id,
    'supplier_id', supplier_id,
    'receipt_date', receipt_date::TEXT,
    'invoice_number', invoice_number,
    'dispatch_note_number', dispatch_note_number,
    'note', note,
    'updated_at', updated_at::TEXT
  )
  INTO v_before_receipt_json
  FROM public.raw_material_receipts
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'raw_material_id', raw_material_id,
        'inbound_stock_movement_id', inbound_stock_movement_id,
        'internal_lot_no', internal_lot_no,
        'quantity_received', quantity_received,
        'quantity_remaining', quantity_remaining,
        'unit', unit,
        'unit_price', unit_price,
        'kunye_status', kunye_status,
        'kunye_number', kunye_number,
        'note', note,
        'is_deleted', is_deleted
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_before_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'raw_material_id', raw_material_id,
        'movement_type', movement_type,
        'quantity', quantity,
        'unit', unit,
        'difference', difference,
        'unit_price', unit_price,
        'total_cost', total_cost,
        'previous_stock', previous_stock,
        'new_stock', new_stock,
        'movement_date', movement_date::TEXT,
        'created_at', created_at::TEXT,
        'source_type', source_type,
        'source_id', source_id,
        'note', note,
        'is_deleted', is_deleted
      ) ORDER BY created_at, id
    ),
    '[]'::JSONB
  )
  INTO v_before_movements_json
  FROM public.stock_movements
  WHERE id = ANY(v_audit_movement_ids)
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'unit', unit,
        'purchase_price', purchase_price,
        'average_cost', average_cost,
        'current_stock', current_stock
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_before_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_all_rm_ids)
    AND organization_id = v_org_id;

  v_before_state := jsonb_build_object(
    'receipt', v_before_receipt_json,
    'lots', v_before_lots_json,
    'stock_movements', v_before_movements_json,
    'raw_materials', v_before_materials_json
  );

  -- Determine lot numbering scheme for new lines
  SELECT COALESCE(
    MAX(
      COALESCE(
        (regexp_match(internal_lot_no, '-([0-9]+)$'))[1]::integer,
        0
      )
    ),
    0
  ) INTO v_max_lot_suffix
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id;

  SELECT internal_lot_no INTO v_sample_lot_no
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id
  LIMIT 1;

  IF v_sample_lot_no IS NOT NULL AND v_sample_lot_no ~ '-[0-9]+$' THEN
    v_lot_prefix := regexp_replace(v_sample_lot_no, '-[0-9]+$', '');
  ELSE
    v_lot_prefix := 'HML-' || to_char(v_receipt.receipt_date, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(p_receipt_id FROM 5));
  END IF;

  -- PROCESS EACH LINE IN p_lines
  v_line_idx := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_idx := v_line_idx + 1;
    v_line_lot_id := NULLIF(BTRIM(v_line->>'lotId'), '');

    IF v_line_lot_id IS NOT NULL THEN
      -- Existing lot update logic
      SELECT *
      INTO r_lot
      FROM public.raw_material_lots
      WHERE id = v_line_lot_id
        AND raw_material_receipt_id = p_receipt_id
        AND organization_id = v_org_id
        AND is_deleted = FALSE;

      BEGIN
        v_line_quantity := COALESCE(
          NULLIF(BTRIM(v_line->>'quantityReceived'), '')::NUMERIC,
          r_lot.quantity_received
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Satır %: Kabul miktarı (quantityReceived) geçerli bir sayı olmalıdır.', v_line_idx;
      END;

      IF v_line_quantity IS NULL OR v_line_quantity <= 0 THEN
        RAISE EXCEPTION 'Satır %: Kabul miktarı (quantityReceived) 0''dan büyük olmalıdır.', v_line_idx;
      END IF;

      IF v_line_quantity::TEXT IN ('NaN', 'Infinity', '-Infinity')
         OR v_line_quantity::TEXT LIKE '%NaN%'
         OR v_line_quantity::TEXT LIKE '%Infinity%' THEN
        RAISE EXCEPTION 'Satır %: Kabul miktarı (quantityReceived) sonlu ve geçerli bir sayı olmalıdır.', v_line_idx;
      END IF;

      BEGIN
        v_line_price := COALESCE(
          NULLIF(BTRIM(v_line->>'unitPrice'), '')::NUMERIC,
          r_lot.unit_price
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) geçerli bir sayı olmalıdır.', v_line_idx;
      END;

      IF v_line_price IS NULL OR v_line_price < 0 THEN
        RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) 0 veya daha büyük olmalıdır.', v_line_idx;
      END IF;

      IF v_line_price::TEXT IN ('NaN', 'Infinity', '-Infinity')
         OR v_line_price::TEXT LIKE '%NaN%'
         OR v_line_price::TEXT LIKE '%Infinity%' THEN
        RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) sonlu ve geçerli bir sayı olmalıdır.', v_line_idx;
      END IF;

      v_line_kunye_status := BTRIM(v_line->>'kunyeStatus');
      v_line_kunye_number := NULLIF(BTRIM(v_line->>'kunyeNumber'), '');
      v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

      SELECT unit, category
      INTO v_rm_unit, v_rm_category
      FROM public.raw_materials
      WHERE id = r_lot.raw_material_id
        AND organization_id = v_org_id;

      -- Category-aware künye validation
      IF BTRIM(v_rm_category) IN ('Meyve', 'Sebze') THEN
        IF v_line_kunye_status IS NULL OR v_line_kunye_status = '' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu boş bırakılamaz.', v_line_idx, BTRIM(v_rm_category);
        ELSIF v_line_kunye_status = 'not_applicable' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu "not_applicable" olamaz.', v_line_idx, BTRIM(v_rm_category);
        ELSIF v_line_kunye_status NOT IN ('provided', 'internal_placeholder') THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu yalnızca "provided" veya "internal_placeholder" olabilir.', v_line_idx, BTRIM(v_rm_category);
        END IF;

        IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye numarası boş bırakılamaz.', v_line_idx, BTRIM(v_rm_category);
        END IF;
      ELSE
        IF v_line_kunye_status IS NULL OR v_line_kunye_status = '' OR v_line_kunye_status = 'not_applicable' THEN
          v_line_kunye_status := 'not_applicable';
          v_line_kunye_number := NULL;
        ELSIF v_line_kunye_status IN ('provided', 'internal_placeholder') THEN
          IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
            RAISE EXCEPTION 'Satır %: Künye durumu "%" olduğunda künye numarası boş bırakılamaz.', v_line_idx, v_line_kunye_status;
          END IF;
        ELSE
          RAISE EXCEPTION 'Satır %: Geçersiz künye durumu: "%". Yalnızca "provided", "internal_placeholder" veya "not_applicable" kullanılabilir.', v_line_idx, v_line_kunye_status;
        END IF;
      END IF;

      v_price_changed := (v_line_price IS DISTINCT FROM r_lot.unit_price);
      v_quantity_changed := (v_line_quantity IS DISTINCT FROM r_lot.quantity_received);

      IF v_price_changed OR v_quantity_changed THEN
        SELECT COUNT(*)
        INTO v_allocation_count
        FROM public.production_lot_allocations
        WHERE raw_material_lot_id = r_lot.id
          AND organization_id = v_org_id;

        IF v_allocation_count > 0 THEN
          RAISE EXCEPTION 'Satır %: Bu lot (%) üretimde kullanıldığı için miktar veya fiyatı değiştirilemez.',
            v_line_idx, r_lot.internal_lot_no;
        END IF;
      END IF;

      -- Handle quantity change for existing lot
      IF v_quantity_changed THEN
        v_quantity_delta := v_line_quantity - r_lot.quantity_received;

        UPDATE public.raw_material_lots
        SET quantity_received = v_line_quantity,
            quantity_remaining = quantity_remaining + v_quantity_delta,
            updated_at = NOW()
        WHERE id = r_lot.id
          AND organization_id = v_org_id;

        UPDATE public.stock_movements
        SET quantity = v_line_quantity,
            difference = v_line_quantity,
            total_cost = v_line_quantity * v_line_price,
            updated_at = NOW()
        WHERE id = r_lot.inbound_stock_movement_id
          AND organization_id = v_org_id;

        IF NOT (r_lot.raw_material_id = ANY(v_updated_rm_ids)) THEN
          v_updated_rm_ids := array_append(v_updated_rm_ids, r_lot.raw_material_id);
        END IF;
      END IF;

      -- Handle price change for existing lot
      IF v_price_changed THEN
        UPDATE public.raw_material_lots
        SET unit_price = v_line_price,
            updated_at = NOW()
        WHERE id = r_lot.id
          AND organization_id = v_org_id;

        UPDATE public.stock_movements
        SET unit_price = v_line_price,
            total_cost = quantity * v_line_price,
            updated_at = NOW()
        WHERE id = r_lot.inbound_stock_movement_id
          AND organization_id = v_org_id;

        IF NOT (r_lot.raw_material_id = ANY(v_updated_rm_ids)) THEN
          v_updated_rm_ids := array_append(v_updated_rm_ids, r_lot.raw_material_id);
        END IF;
      END IF;

      -- Update metadata on lot
      UPDATE public.raw_material_lots
      SET kunye_status = v_line_kunye_status,
          kunye_number = v_line_kunye_number,
          note = v_line_note,
          updated_at = NOW()
      WHERE id = r_lot.id
        AND organization_id = v_org_id;

    ELSE
      -- NEW LINE ADDITION
      v_line_rm_id := NULLIF(BTRIM(COALESCE(v_line->>'rawMaterialId', v_line->>'raw_material_id')), '');
      
      BEGIN
        v_line_quantity := (COALESCE(v_line->>'quantityReceived', v_line->>'quantity', v_line->>'quantity_received'))::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Satır %: Kabul miktarı geçerli bir sayı olmalıdır.', v_line_idx;
      END;

      IF v_line_quantity IS NULL OR v_line_quantity <= 0 THEN
        RAISE EXCEPTION 'Satır %: Kabul miktarı 0''dan büyük olmalıdır.', v_line_idx;
      END IF;

      BEGIN
        v_line_price := COALESCE((COALESCE(v_line->>'unitPrice', v_line->>'unit_price'))::NUMERIC, 0);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Satır %: Birim fiyat geçerli bir sayı olmalıdır.', v_line_idx;
      END;

      IF v_line_price IS NULL OR v_line_price < 0 THEN
        RAISE EXCEPTION 'Satır %: Birim fiyat 0 veya daha büyük olmalıdır.', v_line_idx;
      END IF;

      v_line_kunye_status := BTRIM(v_line->>'kunyeStatus');
      v_line_kunye_number := NULLIF(BTRIM(v_line->>'kunyeNumber'), '');
      v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

      SELECT unit, category
      INTO v_rm_unit, v_rm_category
      FROM public.raw_materials
      WHERE id = v_line_rm_id
        AND organization_id = v_org_id
        AND is_active = TRUE
        AND is_deleted = FALSE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Satır %: Hammadde bulunamadı veya erişim yetkiniz yok: %', v_line_idx, v_line_rm_id;
      END IF;

      -- Category-aware künye validation
      IF BTRIM(v_rm_category) IN ('Meyve', 'Sebze') THEN
        IF v_line_kunye_status IS NULL OR v_line_kunye_status = '' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu boş bırakılamaz.', v_line_idx, BTRIM(v_rm_category);
        ELSIF v_line_kunye_status = 'not_applicable' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu "not_applicable" olamaz.', v_line_idx, BTRIM(v_rm_category);
        ELSIF v_line_kunye_status NOT IN ('provided', 'internal_placeholder') THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu yalnızca "provided" veya "internal_placeholder" olabilir.', v_line_idx, BTRIM(v_rm_category);
        END IF;

        IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
          RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye numarası boş bırakılamaz.', v_line_idx, BTRIM(v_rm_category);
        END IF;
      ELSE
        IF v_line_kunye_status IS NULL OR v_line_kunye_status = '' OR v_line_kunye_status = 'not_applicable' THEN
          v_line_kunye_status := 'not_applicable';
          v_line_kunye_number := NULL;
        ELSIF v_line_kunye_status IN ('provided', 'internal_placeholder') THEN
          IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
            RAISE EXCEPTION 'Satır %: Künye durumu "%" olduğunda künye numarası boş bırakılamaz.', v_line_idx, v_line_kunye_status;
          END IF;
        ELSE
          RAISE EXCEPTION 'Satır %: Geçersiz künye durumu: "%". Yalnızca "provided", "internal_placeholder" veya "not_applicable" kullanılabilir.', v_line_idx, v_line_kunye_status;
        END IF;
      END IF;

      -- Generate IDs and Lot Number
      v_sm_id := public.freshops_id('sm');
      v_lot_id := public.freshops_id('rml');

      v_max_lot_suffix := v_max_lot_suffix + 1;
      v_new_internal_lot_no := v_lot_prefix || '-' || LPAD(v_max_lot_suffix::TEXT, 3, '0');

      v_new_sm_note := 'Satın alma girişi. Belge: ' ||
                       COALESCE(v_invoice_clean, '') ||
                       CASE WHEN v_invoice_clean IS NOT NULL AND v_dispatch_clean IS NOT NULL THEN ' / ' ELSE '' END ||
                       COALESCE(v_dispatch_clean, '') ||
                       ' | Lot No: ' || v_new_internal_lot_no ||
                       ' | Fiş ID: ' || p_receipt_id;

      -- Insert stock movement (trg_apply_raw_material_stock_movement trigger handles current_stock & costs)
      INSERT INTO public.stock_movements (
        id,
        organization_id,
        raw_material_id,
        movement_type,
        quantity,
        unit,
        unit_price,
        movement_date,
        difference,
        source_type,
        source_id,
        note,
        is_deleted,
        is_demo,
        created_at,
        updated_at
      ) VALUES (
        v_sm_id,
        v_org_id,
        v_line_rm_id,
        'Stok Girişi',
        v_line_quantity,
        v_rm_unit,
        v_line_price,
        v_receipt.receipt_date,
        v_line_quantity,
        'raw_material_receipt',
        p_receipt_id,
        v_new_sm_note,
        FALSE,
        FALSE,
        NOW(),
        NOW()
      );

      -- Insert raw_material_lots record
      INSERT INTO public.raw_material_lots (
        id,
        organization_id,
        raw_material_receipt_id,
        raw_material_id,
        inbound_stock_movement_id,
        internal_lot_no,
        quantity_received,
        quantity_remaining,
        unit,
        unit_price,
        kunye_status,
        kunye_number,
        note,
        is_deleted,
        created_at,
        updated_at
      ) VALUES (
        v_lot_id,
        v_org_id,
        p_receipt_id,
        v_line_rm_id,
        v_sm_id,
        v_new_internal_lot_no,
        v_line_quantity,
        v_line_quantity,
        v_rm_unit,
        v_line_price,
        v_line_kunye_status,
        v_line_kunye_number,
        v_line_note,
        FALSE,
        NOW(),
        NOW()
      );

      v_added_lot_ids := array_append(v_added_lot_ids, v_lot_id);
      v_added_sm_ids := array_append(v_added_sm_ids, v_sm_id);

      IF NOT (v_line_rm_id = ANY(v_updated_rm_ids)) THEN
        v_updated_rm_ids := array_append(v_updated_rm_ids, v_line_rm_id);
      END IF;

    END IF;
  END LOOP;

  -- Recalculate WAC & stock metrics for updated raw materials if needed
  FOREACH v_recalc_rm_id IN ARRAY v_updated_rm_ids LOOP
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO v_total_remaining_qty
    FROM public.raw_material_lots
    WHERE raw_material_id = v_recalc_rm_id
      AND organization_id = v_org_id
      AND is_deleted = FALSE;

    SELECT current_stock INTO v_current_stock
    FROM public.raw_materials
    WHERE id = v_recalc_rm_id
      AND organization_id = v_org_id;

    IF ABS(v_total_remaining_qty - v_current_stock) > 0.0001 THEN
      RAISE EXCEPTION 'Hammadde (ID: %) için mevcut stok (%) ile aktif lot bakiyeleri toplamı (%) arasında uyuşmazlık bulunmaktadır. İşlem güvenlik nedeniyle iptal edildi.',
        v_recalc_rm_id, v_current_stock, v_total_remaining_qty;
    END IF;
  END LOOP;

  -- Update receipt header
  UPDATE public.raw_material_receipts
  SET invoice_number = v_invoice_clean,
      dispatch_note_number = v_dispatch_clean,
      note = v_note_clean,
      updated_at = NOW()
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  -- SNAPSHOT AFTER STATE
  SELECT jsonb_build_object(
    'id', id,
    'supplier_id', supplier_id,
    'receipt_date', receipt_date::TEXT,
    'invoice_number', invoice_number,
    'dispatch_note_number', dispatch_note_number,
    'note', note,
    'updated_at', updated_at::TEXT
  )
  INTO v_after_receipt_json
  FROM public.raw_material_receipts
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'raw_material_id', raw_material_id,
        'inbound_stock_movement_id', inbound_stock_movement_id,
        'internal_lot_no', internal_lot_no,
        'quantity_received', quantity_received,
        'quantity_remaining', quantity_remaining,
        'unit', unit,
        'unit_price', unit_price,
        'kunye_status', kunye_status,
        'kunye_number', kunye_number,
        'note', note,
        'is_deleted', is_deleted
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_after_lots_json
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'raw_material_id', raw_material_id,
        'movement_type', movement_type,
        'quantity', quantity,
        'unit', unit,
        'difference', difference,
        'unit_price', unit_price,
        'total_cost', total_cost,
        'previous_stock', previous_stock,
        'new_stock', new_stock,
        'movement_date', movement_date::TEXT,
        'created_at', created_at::TEXT,
        'source_type', source_type,
        'source_id', source_id,
        'note', note,
        'is_deleted', is_deleted
      ) ORDER BY created_at, id
    ),
    '[]'::JSONB
  )
  INTO v_after_movements_json
  FROM public.stock_movements
  WHERE (id = ANY(v_audit_movement_ids) OR id = ANY(v_added_sm_ids))
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'unit', unit,
        'purchase_price', purchase_price,
        'average_cost', average_cost,
        'current_stock', current_stock
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_after_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_all_rm_ids)
    AND organization_id = v_org_id;

  v_after_state := jsonb_build_object(
    'receipt', v_after_receipt_json,
    'lots', v_after_lots_json,
    'stock_movements', v_after_movements_json,
    'raw_materials', v_after_materials_json
  );

  IF v_before_state = v_after_state THEN
    SELECT updated_at::TEXT
    INTO v_updated_at_str
    FROM public.raw_material_receipts
    WHERE id = p_receipt_id
      AND organization_id = v_org_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'noChanges', TRUE,
      'receiptId', p_receipt_id,
      'updatedAt', v_updated_at_str,
      'correctionId', NULL,
      'updatedLots', '[]'::JSONB,
      'addedLots', '[]'::JSONB,
      'recalculatedRawMaterials', '[]'::JSONB
    );
  END IF;

  v_correction_id := public.freshops_id('rmrc');
  v_user_id := auth.uid();

  INSERT INTO public.raw_material_receipt_corrections (
    id,
    organization_id,
    raw_material_receipt_id,
    reason,
    before_state,
    after_state,
    created_by,
    created_at
  ) VALUES (
    v_correction_id,
    v_org_id,
    p_receipt_id,
    v_reason_clean,
    v_before_state,
    v_after_state,
    v_user_id,
    NOW()
  );

  -- Prepare response objects
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lotId', id,
        'unitPrice', unit_price,
        'quantityReceived', quantity_received,
        'quantityRemaining', quantity_remaining,
        'kunyeStatus', kunye_status,
        'kunyeNumber', kunye_number,
        'note', note
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_updated_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lotId', id,
        'internalLotNo', internal_lot_no,
        'rawMaterialId', raw_material_id,
        'unitPrice', unit_price,
        'quantityReceived', quantity_received,
        'quantityRemaining', quantity_remaining,
        'kunyeStatus', kunye_status,
        'kunyeNumber', kunye_number,
        'note', note
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_added_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_added_lot_ids)
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rawMaterialId', id,
        'purchasePrice', purchase_price,
        'averageCost', average_cost,
        'currentStock', current_stock
      ) ORDER BY id
    ),
    '[]'::JSONB
  )
  INTO v_recalculated_raw_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_updated_rm_ids)
    AND organization_id = v_org_id;

  SELECT updated_at::TEXT
  INTO v_updated_at_str
  FROM public.raw_material_receipts
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'noChanges', FALSE,
    'receiptId', p_receipt_id,
    'updatedAt', v_updated_at_str,
    'correctionId', v_correction_id,
    'updatedLots', v_updated_lots_json,
    'addedLots', v_added_lots_json,
    'recalculatedRawMaterials', v_recalculated_raw_materials_json
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_raw_material_receipt_atomic(TEXT, TIMESTAMPTZ, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_raw_material_receipt_atomic(TEXT, TIMESTAMPTZ, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.update_raw_material_receipt_atomic(
  TEXT,
  TIMESTAMPTZ,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
'Atomically corrects a raw-material receipt and supports adding new raw material lines. Existing active lots cannot be removed.';

COMMIT;
