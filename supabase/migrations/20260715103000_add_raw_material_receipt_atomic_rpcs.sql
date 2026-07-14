-- ============================================================================
-- FreshOps Raw Material Receipt Atomic & Idempotent RPCs Migration
-- ============================================================================

-- 1. Idempotency Column Infrastructure for public.raw_material_receipts
DO $$
BEGIN
  -- Add idempotency_key column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'raw_material_receipts' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.raw_material_receipts ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

-- Add check constraint if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'raw_material_receipts_idempotency_key_check'
  ) THEN
    ALTER TABLE public.raw_material_receipts 
      ADD CONSTRAINT raw_material_receipts_idempotency_key_check 
      CHECK (idempotency_key IS NULL OR TRIM(idempotency_key) <> '');
  END IF;
END $$;

-- Create Unique Index for organization_id and idempotency_key (including deleted ones)
CREATE UNIQUE INDEX IF NOT EXISTS raw_material_receipts_org_idempotency_key_idx
ON public.raw_material_receipts (organization_id, TRIM(idempotency_key))
WHERE idempotency_key IS NOT NULL;


-- 2. CREATE OR GET SUPPLIER ATOMIC FUNCTION
CREATE OR REPLACE FUNCTION public.create_or_get_supplier_atomic(
  p_name TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_clean_name TEXT;
  v_supplier_id TEXT;
  v_created BOOLEAN := false;
  v_existing_supplier RECORD;
BEGIN
  -- Fetch the organization ID from the authenticated user context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  v_clean_name := BTRIM(p_name);
  IF v_clean_name = '' OR v_clean_name IS NULL THEN
    RAISE EXCEPTION 'Tedarikçi adı boş olamaz.';
  END IF;

  -- Transaction level advisory lock on lowercase supplier name to prevent concurrency issues
  PERFORM pg_advisory_xact_lock(hashtext('supplier_lock_' || v_org_id::TEXT || '_' || LOWER(v_clean_name)));

  -- Check if there is an existing, active, non-deleted supplier under the same tenant
  SELECT * INTO v_existing_supplier
  FROM public.suppliers
  WHERE organization_id = v_org_id
    AND TRIM(LOWER(name)) = TRIM(LOWER(v_clean_name))
    AND is_active = TRUE
    AND is_deleted = FALSE;

  IF FOUND THEN
    v_supplier_id := v_existing_supplier.id;
    v_clean_name := v_existing_supplier.name;
  ELSE
    -- Generate custom FreshOps ID for supplier and insert
    v_supplier_id := public.freshops_id('sup');
    INSERT INTO public.suppliers (
      id,
      organization_id,
      name,
      note,
      is_active,
      is_deleted,
      created_at,
      updated_at
    ) VALUES (
      v_supplier_id,
      v_org_id,
      v_clean_name,
      NULLIF(BTRIM(p_note), ''),
      TRUE,
      FALSE,
      NOW(),
      NOW()
    );
    v_created := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'supplierId', v_supplier_id,
    'name', v_clean_name,
    'created', v_created
  );
END;
$$;


-- 3. CREATE RAW MATERIAL RECEIPT ATOMIC FUNCTION
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
  
  -- DB Insert variables
  v_receipt_id TEXT;
  v_sm_id TEXT;
  v_lot_id TEXT;
  v_internal_lot_no TEXT;
  v_sm_note TEXT;
  
  v_sm_previous_stock NUMERIC;
  v_sm_new_stock NUMERIC;
  v_sm_total_cost NUMERIC;
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
  SELECT array_agg(DISTINCT (val->>'raw_material_id')) INTO v_rm_ids
  FROM jsonb_array_elements(p_lines) AS val
  WHERE (val->>'raw_material_id') IS NOT NULL;

  IF v_rm_ids IS NULL OR cardinality(v_rm_ids) = 0 THEN
    RAISE EXCEPTION 'p_lines içindeki raw_material_id değerleri geçerli değildir.';
  END IF;

  FOR r_rm IN 
    SELECT id, name, unit, is_active, is_deleted, organization_id
    FROM public.raw_materials
    WHERE id = ANY(v_rm_ids)
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    IF r_rm.organization_id <> v_org_id THEN
      RAISE EXCEPTION 'Yetkisiz hammadde erişimi: %', r_rm.id;
    END IF;
    IF r_rm.is_active = FALSE OR r_rm.is_deleted = TRUE THEN
      RAISE EXCEPTION 'Hammadde aktif değil veya silinmiş: % (%)', r_rm.name, r_rm.id;
    END IF;
  END LOOP;

  -- Ensure all distinct IDs are verified
  DECLARE
    v_found_count INT;
  BEGIN
    SELECT count(*) INTO v_found_count
    FROM public.raw_materials
    WHERE id = ANY(v_rm_ids)
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE;
      
    IF v_found_count <> cardinality(v_rm_ids) THEN
      RAISE EXCEPTION 'Girdiğiniz hammaddelerden bazıları bulunamadı, aktif değil veya silinmiş.';
    END IF;
  END;

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
    v_rm_id := v_line->>'raw_material_id';
    v_qty := (v_line->>'quantity')::NUMERIC;
    v_price := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
    v_kunye_no := BTRIM(v_line->>'kunye_number');
    v_kunye_stat := v_line->>'kunye_status';
    v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

    -- Validation of item parameters
    IF v_rm_id IS NULL OR BTRIM(v_rm_id) = '' THEN
      RAISE EXCEPTION 'Satır %: raw_material_id boş olamaz.', v_line_idx + 1;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Satır %: miktar (quantity) 0''dan büyük olmalıdır.', v_line_idx + 1;
    END IF;

    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Satır %: birim fiyat (unit_price) 0 veya daha büyük olmalıdır.', v_line_idx + 1;
    END IF;

    IF v_kunye_no IS NULL OR v_kunye_no = '' THEN
      RAISE EXCEPTION 'Satır %: künye numarası (kunye_number) boş olamaz.', v_line_idx + 1;
    END IF;

    IF v_kunye_stat IS NULL OR v_kunye_stat NOT IN ('provided', 'internal_placeholder') THEN
      RAISE EXCEPTION 'Satır %: künye durumu (kunye_status) yalnızca "provided" veya "internal_placeholder" olabilir.', v_line_idx + 1;
    END IF;

    -- Retrieve verified raw material unit
    SELECT unit INTO v_rm_unit
    FROM public.raw_materials
    WHERE id = v_rm_id;

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


-- 4. FUNCTION-LEVEL GRANTS AND SECURITY
-- Revoke all execute rights from PUBLIC
REVOKE ALL ON FUNCTION public.create_or_get_supplier_atomic(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- Grant execute rights to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.create_or_get_supplier_atomic(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
