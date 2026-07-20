-- ============================================================================
-- FreshOps Raw Material Purchase Receipt Correction Migration
-- ============================================================================

-- 1. Create Raw Material Receipt Corrections (Audit) Table
CREATE TABLE IF NOT EXISTS public.raw_material_receipt_corrections (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('rmrc'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  raw_material_receipt_id TEXT NOT NULL REFERENCES public.raw_material_receipts(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT raw_material_receipt_corrections_reason_not_empty CHECK (BTRIM(reason) <> '')
);

-- 2. Indexes for Performance & Tenant Partitioning
CREATE INDEX IF NOT EXISTS raw_material_receipt_corrections_org_idx 
ON public.raw_material_receipt_corrections (organization_id);

CREATE INDEX IF NOT EXISTS raw_material_receipt_corrections_receipt_idx 
ON public.raw_material_receipt_corrections (raw_material_receipt_id);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.raw_material_receipt_corrections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'raw_material_receipt_corrections' 
      AND policyname = 'select_raw_material_receipt_corrections_by_tenant'
  ) THEN
    CREATE POLICY select_raw_material_receipt_corrections_by_tenant 
    ON public.raw_material_receipt_corrections
    FOR SELECT
    TO authenticated
    USING (organization_id = public.current_organization_id());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'raw_material_receipt_corrections' 
      AND policyname = 'service_role_all_on_corrections'
  ) THEN
    CREATE POLICY service_role_all_on_corrections 
    ON public.raw_material_receipt_corrections
    FOR ALL
    TO service_role
    USING (TRUE);
  END IF;
END $$;

-- 4. Set Privileges on Table
REVOKE ALL ON public.raw_material_receipt_corrections FROM PUBLIC;
GRANT SELECT ON public.raw_material_receipt_corrections TO authenticated;
GRANT ALL ON public.raw_material_receipt_corrections TO service_role;

-- 5. Create atomic correction function
CREATE OR REPLACE FUNCTION public.update_raw_material_receipt_atomic(
  p_receipt_id TEXT,
  p_expected_updated_at TIMESTAMPTZ,
  p_lines JSONB,
  p_reason TEXT,
  p_invoice_number TEXT DEFAULT NULL,
  p_dispatch_note_number TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_reason_clean TEXT;
  v_invoice_clean TEXT;
  v_dispatch_clean TEXT;
  v_note_clean TEXT;

  v_receipt RECORD;
  v_receipt_lot_ids TEXT[];
  v_receipt_lot_count INT;
  v_input_lot_count INT;
  v_input_lot_ids TEXT[];

  v_raw_material_ids TEXT[];
  v_stock_movement_ids TEXT[];

  -- State Capture Variables
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

  v_after_receipt_record RECORD;

  -- Line Processing Loop Variables
  v_line_idx INT;
  v_line JSONB;
  v_line_lot_id TEXT;
  v_line_price NUMERIC;
  v_line_kunye_status TEXT;
  v_line_kunye_number TEXT;
  v_line_note TEXT;

  r_lot RECORD;
  r_material RECORD;
  v_rm_unit TEXT;
  v_rm_category TEXT;
  v_allocation_count INT;
  v_new_sm_note TEXT;

  -- Recalculation Tracking
  v_updated_rm_ids TEXT[] := '{}'::TEXT[];
  v_recalc_rm_id TEXT;
  v_current_stock NUMERIC;
  v_total_remaining_qty NUMERIC;
  v_weighted_avg_cost NUMERIC;
  v_last_purchase_price NUMERIC;

  -- Final result / correction
  v_correction_id TEXT;
  v_user_id UUID;
  v_updated_lots_json JSONB;
  v_recalculated_raw_materials_json JSONB;
  v_updated_at_str TEXT;

  -- Check if there are any changes
  v_has_changes BOOLEAN := FALSE;
BEGIN
  -- 5.1 Tenant & Context Validation
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- 5.2 Input Parameter Validation & Normalization
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

  -- 5.3 Header Lock & Validation
  SELECT * INTO v_receipt
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

  -- Concurrency Check (Optimistic Locking) using IS DISTINCT FROM for NULL safety
  IF v_receipt.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Fiş başka bir işlem tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.';
  END IF;

  -- 5.4 p_lines JSON Array & Contents Validation
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'p_lines mutlaka geçerli bir array olmalıdır.';
  END IF;

  v_input_lot_count := jsonb_array_length(p_lines);
  IF v_input_lot_count = 0 THEN
    RAISE EXCEPTION 'p_lines boş bir array olamaz.';
  END IF;

  -- Retrieve all current active lot IDs for this receipt
  SELECT array_agg(id ORDER BY id ASC) INTO v_receipt_lot_ids
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

  v_receipt_lot_count := COALESCE(cardinality(v_receipt_lot_ids), 0);

  IF v_input_lot_count <> v_receipt_lot_count THEN
    RAISE EXCEPTION 'Gönderilen satır sayısı (%) fişteki aktif lot sayısı (%) ile eşleşmiyor.', v_input_lot_count, v_receipt_lot_count;
  END IF;

  -- Extract and validate input lot IDs
  SELECT array_agg(BTRIM(val->>'lotId') ORDER BY BTRIM(val->>'lotId') ASC) INTO v_input_lot_ids
  FROM jsonb_array_elements(p_lines) AS val;

  IF EXISTS (SELECT 1 FROM unnest(v_input_lot_ids) x WHERE x IS NULL OR x = '') THEN
    RAISE EXCEPTION 'lotId boş olamaz.';
  END IF;

  -- Check for duplicates
  IF (SELECT COUNT(DISTINCT x) FROM unnest(v_input_lot_ids) x) <> v_input_lot_count THEN
    RAISE EXCEPTION 'p_lines içinde mükerrer (duplicate) lotId bulunamaz.';
  END IF;

  -- Ensure exact match with receipt lots
  IF v_input_lot_ids <> v_receipt_lot_ids THEN
    RAISE EXCEPTION 'Gönderilen lot listesi fişteki aktif lot listesiyle uyuşmuyor. Eksik veya geçersiz lotlar var.';
  END IF;

  -- 5.5 Deterministic Row Locking to prevent Deadlocks
  -- Lock lots in order
  PERFORM id 
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id
  ORDER BY id ASC
  FOR UPDATE;

  -- Lock materials in order
  SELECT array_agg(DISTINCT raw_material_id ORDER BY raw_material_id ASC) INTO v_raw_material_ids
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  PERFORM id
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
    AND organization_id = v_org_id
  ORDER BY id ASC
  FOR UPDATE;

  -- Lock stock movements in order
  SELECT array_agg(DISTINCT inbound_stock_movement_id ORDER BY inbound_stock_movement_id ASC) INTO v_stock_movement_ids
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  PERFORM id
  FROM public.stock_movements
  WHERE id = ANY(v_stock_movement_ids)
    AND organization_id = v_org_id
  ORDER BY id ASC
  FOR UPDATE;

  -- 5.6 State Capture: BEFORE_STATE (fully multitenant qualified)
  v_before_receipt_json := jsonb_build_object(
    'id', v_receipt.id,
    'supplier_id', v_receipt.supplier_id,
    'receipt_date', v_receipt.receipt_date::TEXT,
    'invoice_number', v_receipt.invoice_number,
    'dispatch_note_number', v_receipt.dispatch_note_number,
    'note', v_receipt.note,
    'updated_at', v_receipt.updated_at::TEXT
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'internal_lot_no', internal_lot_no,
      'raw_material_id', raw_material_id,
      'kunye_status', kunye_status,
      'kunye_number', kunye_number,
      'unit_price', unit_price,
      'quantity_received', quantity_received,
      'quantity_remaining', quantity_remaining,
      'note', note,
      'inbound_stock_movement_id', inbound_stock_movement_id
    ) ORDER BY id ASC
  ) INTO v_before_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'raw_material_id', raw_material_id,
      'unit_price', unit_price,
      'total_cost', total_cost,
      'note', note
    ) ORDER BY id ASC
  ) INTO v_before_movements_json
  FROM public.stock_movements
  WHERE id = ANY(v_stock_movement_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'purchase_price', purchase_price,
      'average_cost', average_cost,
      'current_stock', current_stock
    ) ORDER BY id ASC
  ) INTO v_before_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
    AND organization_id = v_org_id;

  v_before_state := jsonb_build_object(
    'receipt', v_before_receipt_json,
    'lots', v_before_lots_json,
    'stock_movements', v_before_movements_json,
    'raw_materials', v_before_materials_json
  );

  -- Track Header Changes
  IF v_invoice_clean IS DISTINCT FROM v_receipt.invoice_number OR
     v_dispatch_clean IS DISTINCT FROM v_receipt.dispatch_note_number OR
     v_note_clean IS DISTINCT FROM v_receipt.note THEN
    v_has_changes := TRUE;
  END IF;

  -- 5.7 Process Lines Updates
  v_line_idx := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_idx := v_line_idx + 1;

    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'Satır %: Geçersiz satır verisi, satır bir JSON objesi olmalıdır.', v_line_idx;
    END IF;

    v_line_lot_id := BTRIM(v_line->>'lotId');
    IF v_line_lot_id IS NULL OR v_line_lot_id = '' THEN
      RAISE EXCEPTION 'Satır %: lotId boş olamaz.', v_line_idx;
    END IF;

    -- Validate and cast unitPrice
    BEGIN
      v_line_price := (v_line->>'unitPrice')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) geçerli bir sayı olmalıdır.', v_line_idx;
    END;

    IF v_line_price IS NULL OR v_line_price < 0 THEN
      RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) 0 veya daha büyük olmalıdır.', v_line_idx;
    END IF;

    IF v_line_price::TEXT IN ('NaN', 'Infinity', '-Infinity') OR v_line_price::TEXT LIKE '%NaN%' OR v_line_price::TEXT LIKE '%Infinity%' THEN
      RAISE EXCEPTION 'Satır %: Birim fiyat (unitPrice) sonlu ve geçerli bir sayı olmalıdır.', v_line_idx;
    END IF;

    -- Fetch existing lot record
    SELECT * INTO r_lot
    FROM public.raw_material_lots
    WHERE id = v_line_lot_id
      AND raw_material_receipt_id = p_receipt_id
      AND organization_id = v_org_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lot bulunamadı veya bu satın alma fişine ait değil: %', v_line_idx, v_line_lot_id;
    END IF;

    -- Fetch hammadde record (is_active and is_deleted filters)
    SELECT * INTO r_material
    FROM public.raw_materials
    WHERE id = r_lot.raw_material_id
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lot ile ilişkili hammadde bulunamadı veya aktif değil: %', v_line_idx, r_lot.raw_material_id;
    END IF;

    v_rm_unit := r_material.unit;
    v_rm_category := r_material.category;

    -- Normalize & Extract kunye parameters from payload
    v_line_kunye_status := BTRIM(v_line->>'kunyeStatus');
    v_line_kunye_number := BTRIM(v_line->>'kunyeNumber');
    v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

    -- JSON Null Safeguards
    IF v_line_kunye_status = 'null' OR v_line_kunye_status = 'NULL' THEN
      v_line_kunye_status := NULL;
    END IF;
    IF v_line_kunye_number = 'null' OR v_line_kunye_number = 'NULL' THEN
      v_line_kunye_number := NULL;
    END IF;

    -- Category-aware validation and normalization
    IF BTRIM(v_rm_category) IN ('Meyve', 'Sebze') THEN
      -- Meyve ve Sebze: Künye zorunludur.
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
      -- Diğer kategoriler (Ambalaj, Yardımcı Malzeme, Diğer vb.)
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

    -- Unit Price Security checks
    IF v_line_price <> r_lot.unit_price THEN
      -- 1. Check if lot has any allocations
      SELECT COUNT(*) INTO v_allocation_count
      FROM public.production_run_raw_material_lot_allocations
      WHERE raw_material_lot_id = v_line_lot_id
        AND organization_id = v_org_id;

      IF v_allocation_count > 0 THEN
        RAISE EXCEPTION 'Üretimde kullanılmış lotun birim fiyatı değiştirilemez.';
      END IF;

      -- 2. Check remaining matches received with tolerance (0.0001)
      IF ABS(r_lot.quantity_remaining - r_lot.quantity_received) > 0.0001 THEN
        RAISE EXCEPTION 'Üretimde kullanılmış lotun birim fiyatı değiştirilemez.';
      END IF;

      -- We have a price change
      v_has_changes := TRUE;

      -- Apply update to the lot price
      UPDATE public.raw_material_lots
      SET unit_price = v_line_price,
          updated_at = NOW()
      WHERE id = v_line_lot_id
        AND organization_id = v_org_id;

      -- Apply update to the inbound stock movement price and total cost
      UPDATE public.stock_movements
      SET unit_price = v_line_price,
          total_cost = quantity * v_line_price,
          updated_at = NOW()
      WHERE id = r_lot.inbound_stock_movement_id
        AND organization_id = v_org_id;

      -- Track for cost recalculations
      IF NOT (r_lot.raw_material_id = ANY(v_updated_rm_ids)) THEN
        v_updated_rm_ids := array_append(v_updated_rm_ids, r_lot.raw_material_id);
      END IF;
    END IF;

    -- Check if metadata fields have changed
    IF v_line_kunye_status IS DISTINCT FROM r_lot.kunye_status OR
       v_line_kunye_number IS DISTINCT FROM r_lot.kunye_number OR
       v_line_note IS DISTINCT FROM r_lot.note THEN
      
      v_has_changes := TRUE;

      -- Update other non-price fields on lot
      UPDATE public.raw_material_lots
      SET kunye_status = v_line_kunye_status,
          kunye_number = v_line_kunye_number,
          note = v_line_note,
          updated_at = NOW()
      WHERE id = v_line_lot_id
        AND organization_id = v_org_id;
    END IF;

  END LOOP;

  -- 5.8 Idempotency & Change Verification (Early exit on zero-change scenarios)
  IF NOT v_has_changes THEN
    RETURN jsonb_build_object(
      'success', true,
      'noChanges', true,
      'receiptId', p_receipt_id,
      'updatedAt', v_receipt.updated_at::TEXT,
      'correctionId', NULL,
      'updatedLots', '[]'::jsonb,
      'recalculatedRawMaterials', '[]'::jsonb
    );
  END IF;

  -- 5.9 Synchronize stock movement notes with updated header document fields
  FOR r_lot IN
    SELECT rml.id, rml.internal_lot_no, rml.inbound_stock_movement_id
    FROM public.raw_material_lots rml
    WHERE rml.raw_material_receipt_id = p_receipt_id
      AND rml.organization_id = v_org_id
      AND rml.is_deleted = FALSE
  LOOP
    v_new_sm_note := 'Satın alma girişi. Belge: ' || 
                     COALESCE(v_invoice_clean, '') || 
                     CASE WHEN v_invoice_clean IS NOT NULL AND v_dispatch_clean IS NOT NULL THEN ' / ' ELSE '' END || 
                     COALESCE(v_dispatch_clean, '') || 
                     ' | Lot No: ' || r_lot.internal_lot_no || 
                     ' | Fiş ID: ' || p_receipt_id;

    UPDATE public.stock_movements
    SET note = v_new_sm_note,
        updated_at = NOW()
    WHERE id = r_lot.inbound_stock_movement_id
      AND organization_id = v_org_id;
  END LOOP;

  -- 5.10 Update Receipt Header Record and refresh updated_at
  UPDATE public.raw_material_receipts
  SET invoice_number = v_invoice_clean,
      dispatch_note_number = v_dispatch_clean,
      note = v_note_clean,
      updated_at = NOW()
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  -- 5.11 Recalculate average_cost and purchase_price for affected raw materials
  IF cardinality(v_updated_rm_ids) > 0 THEN
    FOREACH v_recalc_rm_id IN ARRAY v_updated_rm_ids LOOP
      -- Read current stock of raw material
      SELECT COALESCE(current_stock, 0) INTO v_current_stock
      FROM public.raw_materials
      WHERE id = v_recalc_rm_id
        AND organization_id = v_org_id;

      -- Calculate total quantity_remaining of active, non-deleted purchase lots
      SELECT COALESCE(SUM(rml.quantity_remaining), 0) INTO v_total_remaining_qty
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rml.raw_material_receipt_id = rmr.id
      WHERE rml.raw_material_id = v_recalc_rm_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE;

      -- Tolerance verification to prevent inconsistent state alterations (0.0001)
      IF ABS(v_current_stock - v_total_remaining_qty) > 0.0001 THEN
        RAISE EXCEPTION 'Mevcut hammadde stoğu ile lotların kalan miktarı uyuşmuyor. Hammadde: %, Mevcut Stok: %, Lot Kalan: %',
                        v_recalc_rm_id, v_current_stock, v_total_remaining_qty;
      END IF;

      -- Calculate weighted average cost of remaining stock
      IF v_total_remaining_qty > 0 THEN
        SELECT COALESCE(SUM(rml.quantity_remaining * rml.unit_price) / v_total_remaining_qty, 0) INTO v_weighted_avg_cost
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rml.raw_material_receipt_id = rmr.id
        WHERE rml.raw_material_id = v_recalc_rm_id
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE;
      ELSE
        v_weighted_avg_cost := 0;
      END IF;

      -- Calculate purchase_price (latest active purchase lot)
      SELECT rml.unit_price INTO v_last_purchase_price
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rml.raw_material_receipt_id = rmr.id
      WHERE rml.raw_material_id = v_recalc_rm_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE;

      IF v_last_purchase_price IS NULL THEN
        v_last_purchase_price := 0;
      END IF;

      -- Update material metrics (stock is strictly conserved!)
      UPDATE public.raw_materials
      SET average_cost = v_weighted_avg_cost,
          purchase_price = v_last_purchase_price,
          updated_at = NOW()
      WHERE id = v_recalc_rm_id
        AND organization_id = v_org_id;

    END LOOP;
  END IF;

  -- 5.12 State Capture: AFTER_STATE (fully multitenant qualified)
  SELECT row_to_json(r) INTO v_after_receipt_record
  FROM (
    SELECT id, supplier_id, receipt_date::TEXT, invoice_number, dispatch_note_number, note, updated_at::TEXT
    FROM public.raw_material_receipts
    WHERE id = p_receipt_id
      AND organization_id = v_org_id
  ) r;

  v_after_receipt_json := jsonb_build_object(
    'id', v_after_receipt_record.id,
    'supplier_id', v_after_receipt_record.supplier_id,
    'receipt_date', v_after_receipt_record.receipt_date,
    'invoice_number', v_after_receipt_record.invoice_number,
    'dispatch_note_number', v_after_receipt_record.dispatch_note_number,
    'note', v_after_receipt_record.note,
    'updated_at', v_after_receipt_record.updated_at
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'internal_lot_no', internal_lot_no,
      'raw_material_id', raw_material_id,
      'kunye_status', kunye_status,
      'kunye_number', kunye_number,
      'unit_price', unit_price,
      'quantity_received', quantity_received,
      'quantity_remaining', quantity_remaining,
      'note', note,
      'inbound_stock_movement_id', inbound_stock_movement_id
    ) ORDER BY id ASC
  ) INTO v_after_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'raw_material_id', raw_material_id,
      'unit_price', unit_price,
      'total_cost', total_cost,
      'note', note
    ) ORDER BY id ASC
  ) INTO v_after_movements_json
  FROM public.stock_movements
  WHERE id = ANY(v_stock_movement_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'purchase_price', purchase_price,
      'average_cost', average_cost,
      'current_stock', current_stock
    ) ORDER BY id ASC
  ) INTO v_after_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
    AND organization_id = v_org_id;

  v_after_state := jsonb_build_object(
    'receipt', v_after_receipt_json,
    'lots', v_after_lots_json,
    'stock_movements', v_after_movements_json,
    'raw_materials', v_after_materials_json
  );

  -- 5.13 Idempotency & Change Verification Fallback
  IF v_before_state = v_after_state THEN
    SELECT updated_at::TEXT INTO v_updated_at_str
    FROM public.raw_material_receipts
    WHERE id = p_receipt_id
      AND organization_id = v_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'noChanges', true,
      'receiptId', p_receipt_id,
      'updatedAt', v_updated_at_str,
      'correctionId', NULL,
      'updatedLots', '[]'::jsonb,
      'recalculatedRawMaterials', '[]'::jsonb
    );
  END IF;

  -- 5.14 Audit Logging (In-transaction audit table entry)
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

  -- Construct final return payloads (fully multitenant qualified)
  SELECT jsonb_agg(
    jsonb_build_object(
      'lotId', id,
      'unitPrice', unit_price,
      'kunyeStatus', kunye_status,
      'kunyeNumber', kunye_number,
      'note', note
    ) ORDER BY id ASC
  ) INTO v_updated_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rawMaterialId', id,
        'purchasePrice', purchase_price,
        'averageCost', average_cost
      ) ORDER BY id ASC
    ),
    '[]'::jsonb
  ) INTO v_recalculated_raw_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_updated_rm_ids)
    AND organization_id = v_org_id;

  SELECT updated_at::TEXT INTO v_updated_at_str
  FROM public.raw_material_receipts
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'noChanges', false,
    'receiptId', p_receipt_id,
    'updatedAt', v_updated_at_str,
    'correctionId', v_correction_id,
    'updatedLots', v_updated_lots_json,
    'recalculatedRawMaterials', v_recalculated_raw_materials_json
  );
END;
$$;

-- 6. Set privileges on function (revoking public, granting to roles)
REVOKE ALL ON FUNCTION public.update_raw_material_receipt_atomic(TEXT, TIMESTAMPTZ, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_raw_material_receipt_atomic(TEXT, TIMESTAMPTZ, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
