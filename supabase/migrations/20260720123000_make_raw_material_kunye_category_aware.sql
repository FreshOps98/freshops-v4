-- ============================================================================
-- FreshOps Category-Aware Kunye Requirement Migration
-- ============================================================================

-- 1. Schema Adjustments - Part A (Drop old constraints & make column nullable)
-- 1.1 Drop existing constraints safely (without CASCADE)
ALTER TABLE public.raw_material_lots DROP CONSTRAINT IF EXISTS raw_material_lots_kunye_number_not_empty;
ALTER TABLE public.raw_material_lots DROP CONSTRAINT IF EXISTS raw_material_lots_kunye_status_check;
ALTER TABLE public.raw_material_lots DROP CONSTRAINT IF EXISTS raw_material_lots_kunye_consistency_check;

-- 1.2 Alter kunye_number column to be nullable
ALTER TABLE public.raw_material_lots ALTER COLUMN kunye_number DROP NOT NULL;

-- 2. Normalize existing test data based on category and current rules
-- Match raw_material_lots with raw_materials by id and organization_id.
-- For lots whose raw material category is NOT 'Meyve' or 'Sebze',
-- and whose kunye_status is 'internal_placeholder', set kunye_status to 'not_applicable' and kunye_number to NULL.
UPDATE public.raw_material_lots rml
SET kunye_status = 'not_applicable',
    kunye_number = NULL
FROM public.raw_materials rm
WHERE rml.raw_material_id = rm.id
  AND rml.organization_id = rm.organization_id
  AND rm.category NOT IN ('Meyve', 'Sebze')
  AND rml.kunye_status = 'internal_placeholder';

-- 3. Schema Adjustments - Part B (Add updated constraints)
-- 3.1 Create updated kunye_status check constraint
ALTER TABLE public.raw_material_lots ADD CONSTRAINT raw_material_lots_kunye_status_check CHECK (
  kunye_status IN ('provided', 'internal_placeholder', 'not_applicable')
);

-- 3.2 Create new kunye_consistency_check constraint
ALTER TABLE public.raw_material_lots ADD CONSTRAINT raw_material_lots_kunye_consistency_check CHECK (
  (kunye_status IN ('provided', 'internal_placeholder') AND kunye_number IS NOT NULL AND TRIM(kunye_number) <> '')
  OR
  (kunye_status = 'not_applicable' AND kunye_number IS NULL)
);

-- 4. Update create_raw_material_receipt_atomic Function
CREATE OR REPLACE FUNCTION public.create_raw_material_receipt_atomic(
  p_supplier_id TEXT,
  p_receipt_date DATE,
  p_lines JSONB,
  p_idempotency_key TEXT,
  p_invoice_number TEXT DEFAULT NULL,
  p_dispatch_note_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_idempotency_clean TEXT;
  v_supplier_id_clean TEXT;
  v_invoice_clean TEXT;
  v_dispatch_clean TEXT;
  v_note_clean TEXT;
  
  v_existing_receipt RECORD;
  v_lots_result_json JSONB := '[]'::JSONB;
  
  -- Line loop variables
  v_lines_count INT;
  v_rm_ids TEXT[];
  r_rm RECORD;
  v_line JSONB;
  v_line_idx INT;
  v_rm_id TEXT;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_kunye_no TEXT;
  v_kunye_stat TEXT;
  v_line_note TEXT;
  v_rm_unit TEXT;
  v_rm_category TEXT; -- Added category variable
  
  -- DB Insert variables
  v_receipt_id TEXT;
  v_sm_id TEXT;
  v_lot_id TEXT;
  v_internal_lot_no TEXT;
  v_sm_note TEXT;
  
  v_sm_previous_stock NUMERIC;
  v_sm_new_stock NUMERIC;
  v_sm_total_cost NUMERIC;
  
  v_found_count INT := 0;
BEGIN
  -- 3.1 Tenant Context Validation
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- 3.2 Idempotency Validation and Lock
  v_idempotency_clean := BTRIM(p_idempotency_key);
  IF v_idempotency_clean IS NULL OR v_idempotency_clean = '' THEN
    RAISE EXCEPTION 'Idempotency key boş olamaz.';
  END IF;

  -- Transaction level advisory lock for this particular request
  PERFORM pg_advisory_xact_lock(hashtext('receipt_lock_' || v_org_id::TEXT || '_' || v_idempotency_clean));

  -- Check if this receipt is already processed
  SELECT id, supplier_id, receipt_date, invoice_number, dispatch_note_number, idempotency_key, is_deleted
  INTO v_existing_receipt
  FROM public.raw_material_receipts
  WHERE organization_id = v_org_id
    AND TRIM(idempotency_key) = v_idempotency_clean;

  IF FOUND THEN
    IF v_existing_receipt.is_deleted = TRUE THEN
      RAISE EXCEPTION 'Bu benzersiz istek anahtarı (idempotency key) ile oluşturulmuş satın alma fişi daha önce silinmiştir.';
    END IF;

    -- Aggregate already created lots and movements for response
    SELECT jsonb_agg(
      jsonb_build_object(
        'lineNo', line_no,
        'lotId', lot_id,
        'internalLotNo', internal_lot_no,
        'rawMaterialId', raw_material_id,
        'stockMovementId', inbound_stock_movement_id,
        'quantityReceived', quantity_received,
        'quantityRemaining', quantity_remaining,
        'unit', unit,
        'unitPrice', unit_price,
        'kunyeNumber', kunye_number,
        'kunyeStatus', kunye_status,
        'previousStock', COALESCE(previous_stock, 0),
        'newStock', COALESCE(new_stock, 0),
        'totalCost', COALESCE(total_cost, 0)
      )
    ) INTO v_lots_result_json
    FROM (
      SELECT
        row_number() OVER (ORDER BY rml.created_at, rml.id) AS line_no,
        rml.id AS lot_id,
        rml.internal_lot_no,
        rml.raw_material_id,
        rml.inbound_stock_movement_id,
        rml.quantity_received,
        rml.quantity_remaining,
        rml.unit,
        rml.unit_price,
        rml.kunye_number,
        rml.kunye_status,
        sm.previous_stock,
        sm.new_stock,
        sm.total_cost
      FROM public.raw_material_lots rml
      JOIN public.stock_movements sm ON rml.inbound_stock_movement_id = sm.id
      WHERE rml.raw_material_receipt_id = v_existing_receipt.id
        AND rml.organization_id = v_org_id
        AND sm.organization_id = v_org_id
        AND rml.is_deleted = FALSE
    ) q;

    RETURN jsonb_build_object(
      'success', true,
      'alreadyCreated', true,
      'receiptId', v_existing_receipt.id,
      'supplierId', v_existing_receipt.supplier_id,
      'receiptDate', v_existing_receipt.receipt_date::TEXT,
      'invoiceNumber', v_existing_receipt.invoice_number,
      'dispatchNoteNumber', v_existing_receipt.dispatch_note_number,
      'idempotencyKey', v_existing_receipt.idempotency_key,
      'lots', COALESCE(v_lots_result_json, '[]'::jsonb)
    );
  END IF;

  -- 3.3 Supplier & Document Validations
  v_supplier_id_clean := BTRIM(p_supplier_id);
  IF v_supplier_id_clean IS NULL OR v_supplier_id_clean = '' THEN
    RAISE EXCEPTION 'p_supplier_id boş olamaz.';
  END IF;

  SELECT id INTO v_supplier_id_clean
  FROM public.suppliers
  WHERE id = v_supplier_id_clean
    AND organization_id = v_org_id
    AND is_active = TRUE
    AND is_deleted = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belirtilen tedarikçi bulunamadı, aktif değil veya silinmiş.';
  END IF;

  IF p_receipt_date IS NULL THEN
    RAISE EXCEPTION 'p_receipt_date boş bırakılamaz.';
  END IF;

  v_invoice_clean := NULLIF(BTRIM(p_invoice_number), '');
  v_dispatch_clean := NULLIF(BTRIM(p_dispatch_note_number), '');

  IF v_invoice_clean IS NULL AND v_dispatch_clean IS NULL THEN
    RAISE EXCEPTION 'Fatura numarası veya sevk irsaliyesi numarasından en az biri dolu olmalıdır.';
  END IF;

  v_note_clean := NULLIF(BTRIM(p_note), '');

  -- 3.4 Lines JSON Array Validation
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines mutlaka bir array olmalıdır.';
  END IF;
  
  v_lines_count := jsonb_array_length(p_lines);
  IF v_lines_count = 0 THEN
    RAISE EXCEPTION 'p_lines array''i boş olamaz.';
  END IF;

  -- 3.5 Extract and lock raw materials deterministically to prevent deadlocks
  SELECT array_agg(DISTINCT BTRIM(val->>'raw_material_id')) INTO v_rm_ids
  FROM jsonb_array_elements(p_lines) AS val
  WHERE (val->>'raw_material_id') IS NOT NULL AND BTRIM(val->>'raw_material_id') <> '';

  IF v_rm_ids IS NULL OR cardinality(v_rm_ids) = 0 THEN
    RAISE EXCEPTION 'p_lines içindeki raw_material_id değerleri geçerli değildir.';
  END IF;

  v_found_count := 0;

  FOR r_rm IN 
    SELECT id, name, unit, is_active, is_deleted, organization_id
    FROM public.raw_materials
    WHERE id = ANY(v_rm_ids)
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    v_found_count := v_found_count + 1;
  END LOOP;

  IF v_found_count <> cardinality(v_rm_ids) THEN
    RAISE EXCEPTION 'Hammadde bulunamadı veya erişim yetkisi yok.';
  END IF;

  -- 3.6 Create Receipt Header Record
  v_receipt_id := public.freshops_id('rmr');
  INSERT INTO public.raw_material_receipts (
    id,
    organization_id,
    supplier_id,
    receipt_date,
    invoice_number,
    dispatch_note_number,
    note,
    idempotency_key,
    is_deleted,
    created_at,
    updated_at
  ) VALUES (
    v_receipt_id,
    v_org_id,
    v_supplier_id_clean,
    p_receipt_date,
    v_invoice_clean,
    v_dispatch_clean,
    v_note_clean,
    v_idempotency_clean,
    FALSE,
    NOW(),
    NOW()
  );

  -- 3.7 Process each purchase line and stock movement
  v_line_idx := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'Satır %: Geçersiz satır verisi, satır bir JSON objesi olmalıdır.', v_line_idx + 1;
    END IF;

    -- Validate numeric conversion to prevent unhandled database exceptions during casting
    BEGIN
      v_qty := (v_line->>'quantity')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Satır %: Miktar (quantity) geçerli bir sayı olmalıdır.', v_line_idx + 1;
    END;

    BEGIN
      v_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Satır %: Birim fiyat (unit_price) geçerli bir sayı olmalıdır.', v_line_idx + 1;
    END;

    v_rm_id := BTRIM(v_line->>'raw_material_id');
    v_kunye_no := BTRIM(v_line->>'kunye_number');
    v_kunye_stat := BTRIM(v_line->>'kunye_status');
    v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

    -- Validation of item parameters
    IF v_rm_id IS NULL OR v_rm_id = '' THEN
      RAISE EXCEPTION 'Satır %: raw_material_id boş olamaz.', v_line_idx + 1;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Satır %: miktar (quantity) 0''dan büyük olmalıdır.', v_line_idx + 1;
    END IF;

    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Satır %: birim fiyat (unit_price) 0 veya daha büyük olmalıdır.', v_line_idx + 1;
    END IF;

    -- Retrieve verified raw material unit and category (Tenant-safe)
    SELECT unit, category INTO v_rm_unit, v_rm_category
    FROM public.raw_materials
    WHERE id = v_rm_id
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Hammadde bulunamadı veya erişim yetkisi yok: %', v_line_idx + 1, v_rm_id;
    END IF;

    -- Category-aware validation and normalization
    IF BTRIM(v_rm_category) IN ('Meyve', 'Sebze') THEN
      -- Meyve ve Sebze: Künye zorunludur.
      IF v_kunye_stat IS NULL OR v_kunye_stat = '' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu boş bırakılamaz.', v_line_idx + 1, BTRIM(v_rm_category);
      ELSIF v_kunye_stat = 'not_applicable' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu "not_applicable" olamaz.', v_line_idx + 1, BTRIM(v_rm_category);
      ELSIF v_kunye_stat NOT IN ('provided', 'internal_placeholder') THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu yalnızca "provided" veya "internal_placeholder" olabilir.', v_line_idx + 1, BTRIM(v_rm_category);
      END IF;

      IF v_kunye_no IS NULL OR v_kunye_no = '' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye numarası boş bırakılamaz.', v_line_idx + 1, BTRIM(v_rm_category);
      END IF;
    ELSE
      -- Diğer kategoriler (Ambalaj, Yardımcı Malzeme, Diğer vb.)
      IF v_kunye_stat IS NULL OR v_kunye_stat = '' OR v_kunye_stat = 'not_applicable' THEN
        v_kunye_stat := 'not_applicable';
        v_kunye_no := NULL;
      ELSIF v_kunye_stat IN ('provided', 'internal_placeholder') THEN
        IF v_kunye_no IS NULL OR v_kunye_no = '' THEN
          RAISE EXCEPTION 'Satır %: Künye durumu "%" olduğunda künye numarası boş bırakılamaz.', v_line_idx + 1, v_kunye_stat;
        END IF;
      ELSE
        RAISE EXCEPTION 'Satır %: Geçersiz künye durumu: "%". Yalnızca "provided", "internal_placeholder" veya "not_applicable" kullanılabilir.', v_line_idx + 1, v_kunye_stat;
      END IF;
    END IF;

    -- Generate FreshOps IDs
    v_sm_id := public.freshops_id('sm');
    v_lot_id := public.freshops_id('rml');

    -- Construct Readable Lot Number: HML-YYYYMMDD-<RECEIPT_SHORT_ID>-<3_DIGIT_LINE_NO>
    v_internal_lot_no := 'HML-' || to_char(p_receipt_date, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_receipt_id FROM 5)) || '-' || LPAD((v_line_idx + 1)::TEXT, 3, '0');

    -- Standard movement note linking to documents
    v_sm_note := 'Satın alma girişi. Belge: ' || 
                 COALESCE(v_invoice_clean, '') || 
                 CASE WHEN v_invoice_clean IS NOT NULL AND v_dispatch_clean IS NOT NULL THEN ' / ' ELSE '' END || 
                 COALESCE(v_dispatch_clean, '') || 
                 ' | Lot No: ' || v_internal_lot_no || 
                 ' | Fiş ID: ' || v_receipt_id;

    -- Insert stock movement (existing trigger trg_apply_raw_material_stock_movement handles stock computation and weighted average costs)
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
      v_rm_id,
      'Stok Girişi',
      v_qty,
      v_rm_unit,
      v_price,
      p_receipt_date,
      v_qty,
      'raw_material_receipt',
      v_receipt_id,
      v_sm_note,
      FALSE,
      FALSE,
      NOW(),
      NOW()
    ) RETURNING previous_stock, new_stock, total_cost INTO v_sm_previous_stock, v_sm_new_stock, v_sm_total_cost;

    -- Create corresponding raw material lot trace record
    INSERT INTO public.raw_material_lots (
      id,
      organization_id,
      raw_material_receipt_id,
      raw_material_id,
      inbound_stock_movement_id,
      internal_lot_no,
      kunye_number,
      kunye_status,
      quantity_received,
      quantity_remaining,
      unit,
      unit_price,
      note,
      is_deleted,
      created_at,
      updated_at
    ) VALUES (
      v_lot_id,
      v_org_id,
      v_receipt_id,
      v_rm_id,
      v_sm_id,
      v_internal_lot_no,
      v_kunye_no,
      v_kunye_stat,
      v_qty,
      v_qty, -- Initially, remaining equals received
      v_rm_unit,
      v_price,
      v_line_note,
      FALSE,
      NOW(),
      NOW()
    );

    -- Append lot result object to the JSON list
    v_lots_result_json := v_lots_result_json || jsonb_build_array(
      jsonb_build_object(
        'lineNo', v_line_idx + 1,
        'lotId', v_lot_id,
        'internalLotNo', v_internal_lot_no,
        'rawMaterialId', v_rm_id,
        'stockMovementId', v_sm_id,
        'quantityReceived', v_qty,
        'quantityRemaining', v_qty,
        'unit', v_rm_unit,
        'unitPrice', v_price,
        'kunyeNumber', v_kunye_no,
        'kunyeStatus', v_kunye_stat,
        'previousStock', COALESCE(v_sm_previous_stock, 0),
        'newStock', COALESCE(v_sm_new_stock, 0),
        'totalCost', COALESCE(v_sm_total_cost, 0)
      )
    );

    v_line_idx := v_line_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyCreated', false,
    'receiptId', v_receipt_id,
    'supplierId', v_supplier_id_clean,
    'receiptDate', p_receipt_date::TEXT,
    'invoiceNumber', v_invoice_clean,
    'dispatchNoteNumber', v_dispatch_clean,
    'idempotencyKey', v_idempotency_clean,
    'lots', v_lots_result_json
  );
END;
$$;

-- 4. Set Privileges (Revoke and Grant as required)
REVOKE ALL ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
