BEGIN;

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
  v_input_lot_count INT;
  v_input_lot_ids TEXT[];
  v_raw_material_ids TEXT[];
  v_inbound_movement_ids TEXT[];
  v_audit_movement_ids TEXT[];
  v_suffix_movement_ids TEXT[];

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
  v_rm_category TEXT;
  v_allocation_count INT;
  v_new_sm_note TEXT;
  v_total_remaining_before NUMERIC;
  v_current_stock_before NUMERIC;

  v_updated_rm_ids TEXT[] := '{}'::TEXT[];
  v_recalc_rm_id TEXT;
  v_current_stock NUMERIC;
  v_total_remaining_qty NUMERIC;
  v_weighted_avg_cost NUMERIC;
  v_last_purchase_price NUMERIC;

  v_correction_id TEXT;
  v_user_id UUID;
  v_updated_lots_json JSONB;
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

  v_input_lot_count := jsonb_array_length(p_lines);
  IF v_input_lot_count = 0 THEN
    RAISE EXCEPTION 'p_lines boş bir array olamaz.';
  END IF;

  SELECT array_agg(id ORDER BY id)
  INTO v_receipt_lot_ids
  FROM public.raw_material_lots
  WHERE raw_material_receipt_id = p_receipt_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

  v_receipt_lot_count := COALESCE(cardinality(v_receipt_lot_ids), 0);
  IF v_input_lot_count <> v_receipt_lot_count THEN
    RAISE EXCEPTION 'Gönderilen satır sayısı (%) fişteki aktif lot sayısı (%) ile eşleşmiyor.',
      v_input_lot_count, v_receipt_lot_count;
  END IF;

  SELECT array_agg(BTRIM(val->>'lotId') ORDER BY BTRIM(val->>'lotId'))
  INTO v_input_lot_ids
  FROM jsonb_array_elements(p_lines) AS val;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_input_lot_ids) AS u(lot_id)
    WHERE lot_id IS NULL OR lot_id = ''
  ) THEN
    RAISE EXCEPTION 'lotId boş olamaz.';
  END IF;

  IF (
    SELECT COUNT(DISTINCT lot_id)
    FROM unnest(v_input_lot_ids) AS u(lot_id)
  ) <> v_input_lot_count THEN
    RAISE EXCEPTION 'p_lines içinde mükerrer (duplicate) lotId bulunamaz.';
  END IF;

  IF v_input_lot_ids <> v_receipt_lot_ids THEN
    RAISE EXCEPTION 'Gönderilen lot listesi fişteki aktif lot listesiyle uyuşmuyor. Eksik veya geçersiz lotlar var.';
  END IF;

  PERFORM id
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id
  ORDER BY id
  FOR UPDATE;

  SELECT array_agg(DISTINCT raw_material_id ORDER BY raw_material_id)
  INTO v_raw_material_ids
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  PERFORM id
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
    AND organization_id = v_org_id
  ORDER BY id
  FOR UPDATE;

  SELECT array_agg(DISTINCT inbound_stock_movement_id ORDER BY inbound_stock_movement_id)
  INTO v_inbound_movement_ids
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  -- The raw-material row is already locked. Lock the complete movement stream too,
  -- so a quantity correction cannot race a concurrent stock insert/update.
  PERFORM id
  FROM public.stock_movements
  WHERE organization_id = v_org_id
    AND raw_material_id = ANY(v_raw_material_ids)
  ORDER BY raw_material_id, created_at, id
  FOR UPDATE;

  v_audit_movement_ids := COALESCE(v_inbound_movement_ids, '{}'::TEXT[]);

  -- Pre-scan quantity changes so BEFORE_STATE includes every movement snapshot
  -- that may be shifted by a historical inbound-quantity correction.
  v_line_idx := 0;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_line_idx := v_line_idx + 1;
    v_line_lot_id := BTRIM(v_line->>'lotId');

    SELECT *
    INTO r_lot
    FROM public.raw_material_lots
    WHERE id = v_line_lot_id
      AND raw_material_receipt_id = p_receipt_id
      AND organization_id = v_org_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lot bulunamadı veya bu satın alma fişine ait değil: %',
        v_line_idx, v_line_lot_id;
    END IF;

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

    IF v_line_quantity IS DISTINCT FROM r_lot.quantity_received THEN
      SELECT *
      INTO r_inbound_movement
      FROM public.stock_movements
      WHERE id = r_lot.inbound_stock_movement_id
        AND organization_id = v_org_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Satır %: Lota bağlı satın alma stok hareketi bulunamadı.', v_line_idx;
      END IF;

      SELECT array_agg(sm.id ORDER BY sm.created_at, sm.id)
      INTO v_suffix_movement_ids
      FROM public.stock_movements AS sm
      WHERE sm.organization_id = v_org_id
        AND sm.raw_material_id = r_lot.raw_material_id
        AND (sm.created_at, sm.id) >= (r_inbound_movement.created_at, r_inbound_movement.id);

      SELECT array_agg(DISTINCT movement_id ORDER BY movement_id)
      INTO v_audit_movement_ids
      FROM unnest(
        COALESCE(v_audit_movement_ids, '{}'::TEXT[])
        || COALESCE(v_suffix_movement_ids, '{}'::TEXT[])
      ) AS u(movement_id);
    END IF;
  END LOOP;

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
    ) ORDER BY id
  )
  INTO v_before_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'raw_material_id', raw_material_id,
      'movement_type', movement_type,
      'quantity', quantity,
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
  )
  INTO v_before_movements_json
  FROM public.stock_movements
  WHERE id = ANY(v_audit_movement_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'purchase_price', purchase_price,
      'average_cost', average_cost,
      'current_stock', current_stock
    ) ORDER BY id
  )
  INTO v_before_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
    AND organization_id = v_org_id;

  v_before_state := jsonb_build_object(
    'receipt', v_before_receipt_json,
    'lots', v_before_lots_json,
    'stock_movements', v_before_movements_json,
    'raw_materials', v_before_materials_json
  );

  IF v_invoice_clean IS DISTINCT FROM v_receipt.invoice_number
     OR v_dispatch_clean IS DISTINCT FROM v_receipt.dispatch_note_number
     OR v_note_clean IS DISTINCT FROM v_receipt.note THEN
    v_has_changes := TRUE;
  END IF;

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

    SELECT *
    INTO r_lot
    FROM public.raw_material_lots
    WHERE id = v_line_lot_id
      AND raw_material_receipt_id = p_receipt_id
      AND organization_id = v_org_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lot bulunamadı veya bu satın alma fişine ait değil: %',
        v_line_idx, v_line_lot_id;
    END IF;

    SELECT *
    INTO r_material
    FROM public.raw_materials
    WHERE id = r_lot.raw_material_id
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lot ile ilişkili hammadde bulunamadı veya aktif değil: %',
        v_line_idx, r_lot.raw_material_id;
    END IF;

    SELECT *
    INTO r_inbound_movement
    FROM public.stock_movements
    WHERE id = r_lot.inbound_stock_movement_id
      AND organization_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Lota bağlı satın alma stok hareketi bulunamadı.', v_line_idx;
    END IF;

    BEGIN
      v_line_price := (v_line->>'unitPrice')::NUMERIC;
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

    v_rm_category := r_material.category;
    v_line_kunye_status := BTRIM(v_line->>'kunyeStatus');
    v_line_kunye_number := BTRIM(v_line->>'kunyeNumber');
    v_line_note := NULLIF(BTRIM(v_line->>'note'), '');

    IF v_line_kunye_status IN ('null', 'NULL') THEN
      v_line_kunye_status := NULL;
    END IF;
    IF v_line_kunye_number IN ('null', 'NULL') THEN
      v_line_kunye_number := NULL;
    END IF;

    IF BTRIM(v_rm_category) IN ('Meyve', 'Sebze') THEN
      IF v_line_kunye_status IS NULL OR v_line_kunye_status = '' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu boş bırakılamaz.',
          v_line_idx, BTRIM(v_rm_category);
      ELSIF v_line_kunye_status = 'not_applicable' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu "not_applicable" olamaz.',
          v_line_idx, BTRIM(v_rm_category);
      ELSIF v_line_kunye_status NOT IN ('provided', 'internal_placeholder') THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye durumu yalnızca "provided" veya "internal_placeholder" olabilir.',
          v_line_idx, BTRIM(v_rm_category);
      END IF;

      IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
        RAISE EXCEPTION 'Satır %: % kategorisindeki hammadde için künye numarası boş bırakılamaz.',
          v_line_idx, BTRIM(v_rm_category);
      END IF;
    ELSE
      IF v_line_kunye_status IS NULL
         OR v_line_kunye_status = ''
         OR v_line_kunye_status = 'not_applicable' THEN
        v_line_kunye_status := 'not_applicable';
        v_line_kunye_number := NULL;
      ELSIF v_line_kunye_status IN ('provided', 'internal_placeholder') THEN
        IF v_line_kunye_number IS NULL OR v_line_kunye_number = '' THEN
          RAISE EXCEPTION 'Satır %: Künye durumu "%" olduğunda künye numarası boş bırakılamaz.',
            v_line_idx, v_line_kunye_status;
        END IF;
      ELSE
        RAISE EXCEPTION 'Satır %: Geçersiz künye durumu: "%".',
          v_line_idx, v_line_kunye_status;
      END IF;
    END IF;

    v_price_changed := v_line_price IS DISTINCT FROM r_lot.unit_price;
    v_quantity_changed := v_line_quantity IS DISTINCT FROM r_lot.quantity_received;

    IF v_price_changed OR v_quantity_changed THEN
      SELECT COUNT(*)
      INTO v_allocation_count
      FROM public.production_run_raw_material_lot_allocations
      WHERE raw_material_lot_id = v_line_lot_id
        AND organization_id = v_org_id;

      IF v_allocation_count > 0 THEN
        IF v_quantity_changed THEN
          RAISE EXCEPTION 'Üretimde kullanılmış lotun kabul miktarı değiştirilemez.';
        ELSE
          RAISE EXCEPTION 'Üretimde kullanılmış lotun birim fiyatı değiştirilemez.';
        END IF;
      END IF;

      IF ABS(r_lot.quantity_remaining - r_lot.quantity_received) > 0.0001 THEN
        IF v_quantity_changed THEN
          RAISE EXCEPTION 'Üretimde kullanılmış lotun kabul miktarı değiştirilemez.';
        ELSE
          RAISE EXCEPTION 'Üretimde kullanılmış lotun birim fiyatı değiştirilemez.';
        END IF;
      END IF;
    END IF;

    IF r_inbound_movement.raw_material_id IS DISTINCT FROM r_lot.raw_material_id
       OR r_inbound_movement.movement_type IS DISTINCT FROM 'Stok Girişi'
       OR r_inbound_movement.is_deleted = TRUE
       OR r_inbound_movement.source_type IS DISTINCT FROM 'raw_material_receipt'
       OR r_inbound_movement.source_id IS DISTINCT FROM p_receipt_id THEN
      RAISE EXCEPTION 'Satır %: Lota bağlı satın alma stok hareketi güvenli düzeltme koşullarını sağlamıyor.', v_line_idx;
    END IF;

    IF v_quantity_changed THEN
      IF r_inbound_movement.previous_stock IS NULL OR r_inbound_movement.new_stock IS NULL THEN
        RAISE EXCEPTION 'Satır %: Satın alma stok hareketinin stok bakiyesi alanları eksik.', v_line_idx;
      END IF;

      IF ABS(r_inbound_movement.quantity - r_lot.quantity_received) > 0.0001
         OR ABS(r_inbound_movement.difference - r_lot.quantity_received) > 0.0001
         OR ABS(
           (r_inbound_movement.new_stock - r_inbound_movement.previous_stock)
           - r_lot.quantity_received
         ) > 0.0001 THEN
        RAISE EXCEPTION 'Satır %: Lot miktarı ile satın alma stok hareketi uyuşmuyor; otomatik miktar düzeltmesi durduruldu.', v_line_idx;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.stock_movements AS sm
        WHERE sm.organization_id = v_org_id
          AND sm.raw_material_id = r_lot.raw_material_id
          AND (sm.created_at, sm.id) > (r_inbound_movement.created_at, r_inbound_movement.id)
          AND sm.movement_type IN ('Sayım Düzeltmesi', 'Düzeltme')
      ) THEN
        RAISE EXCEPTION 'Bu satın alma hareketinden sonra sayım/düzeltme hareketi bulunduğu için kabul miktarı otomatik değiştirilemez.';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.stock_movements AS sm
        WHERE sm.organization_id = v_org_id
          AND sm.raw_material_id = r_lot.raw_material_id
          AND (sm.created_at, sm.id) > (r_inbound_movement.created_at, r_inbound_movement.id)
          AND (sm.previous_stock IS NULL OR sm.new_stock IS NULL)
      ) THEN
        RAISE EXCEPTION 'Sonraki stok hareketlerinden birinde stok bakiyesi eksik olduğu için kabul miktarı otomatik değiştirilemez.';
      END IF;

      SELECT COALESCE(current_stock, 0)
      INTO v_current_stock_before
      FROM public.raw_materials
      WHERE id = r_lot.raw_material_id
        AND organization_id = v_org_id;

      SELECT COALESCE(SUM(rml.quantity_remaining), 0)
      INTO v_total_remaining_before
      FROM public.raw_material_lots AS rml
      JOIN public.raw_material_receipts AS rmr
        ON rmr.id = rml.raw_material_receipt_id
       AND rmr.organization_id = rml.organization_id
      WHERE rml.raw_material_id = r_lot.raw_material_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rmr.is_deleted = FALSE;

      IF ABS(v_current_stock_before - v_total_remaining_before) > 0.0001 THEN
        RAISE EXCEPTION 'Mevcut hammadde stoğu ile lotların kalan miktarı uyuşmuyor. Hammadde: %, Mevcut Stok: %, Lot Kalan: %',
          r_lot.raw_material_id, v_current_stock_before, v_total_remaining_before;
      END IF;

      v_quantity_delta := v_line_quantity - r_lot.quantity_received;

      IF v_current_stock_before + v_quantity_delta < 0 THEN
        RAISE EXCEPTION 'Miktar düzeltmesi hammadde stoğunu negatife düşüremez.';
      END IF;

      UPDATE public.raw_material_lots
      SET quantity_received = v_line_quantity,
          quantity_remaining = v_line_quantity,
          unit_price = v_line_price,
          updated_at = NOW()
      WHERE id = v_line_lot_id
        AND organization_id = v_org_id;

      UPDATE public.stock_movements
      SET quantity = v_line_quantity,
          difference = v_line_quantity,
          unit_price = v_line_price,
          total_cost = v_line_quantity * v_line_price,
          new_stock = previous_stock + v_line_quantity,
          updated_at = NOW()
      WHERE id = r_lot.inbound_stock_movement_id
        AND organization_id = v_org_id;

      -- All later movements are relative movements (absolute adjustments were
      -- rejected above), so their historical balance snapshots shift by delta.
      UPDATE public.stock_movements AS sm
      SET previous_stock = sm.previous_stock + v_quantity_delta,
          new_stock = sm.new_stock + v_quantity_delta,
          updated_at = NOW()
      WHERE sm.organization_id = v_org_id
        AND sm.raw_material_id = r_lot.raw_material_id
        AND (sm.created_at, sm.id) > (r_inbound_movement.created_at, r_inbound_movement.id);

      UPDATE public.raw_materials
      SET current_stock = current_stock + v_quantity_delta,
          updated_at = NOW()
      WHERE id = r_lot.raw_material_id
        AND organization_id = v_org_id;

      v_has_changes := TRUE;

      IF NOT (r_lot.raw_material_id = ANY(v_updated_rm_ids)) THEN
        v_updated_rm_ids := array_append(v_updated_rm_ids, r_lot.raw_material_id);
      END IF;
    ELSIF v_price_changed THEN
      UPDATE public.raw_material_lots
      SET unit_price = v_line_price,
          updated_at = NOW()
      WHERE id = v_line_lot_id
        AND organization_id = v_org_id;

      UPDATE public.stock_movements
      SET unit_price = v_line_price,
          total_cost = quantity * v_line_price,
          updated_at = NOW()
      WHERE id = r_lot.inbound_stock_movement_id
        AND organization_id = v_org_id;

      v_has_changes := TRUE;

      IF NOT (r_lot.raw_material_id = ANY(v_updated_rm_ids)) THEN
        v_updated_rm_ids := array_append(v_updated_rm_ids, r_lot.raw_material_id);
      END IF;
    END IF;

    IF v_line_kunye_status IS DISTINCT FROM r_lot.kunye_status
       OR v_line_kunye_number IS DISTINCT FROM r_lot.kunye_number
       OR v_line_note IS DISTINCT FROM r_lot.note THEN
      UPDATE public.raw_material_lots
      SET kunye_status = v_line_kunye_status,
          kunye_number = v_line_kunye_number,
          note = v_line_note,
          updated_at = NOW()
      WHERE id = v_line_lot_id
        AND organization_id = v_org_id;

      v_has_changes := TRUE;
    END IF;
  END LOOP;

  IF NOT v_has_changes THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'noChanges', TRUE,
      'receiptId', p_receipt_id,
      'updatedAt', v_receipt.updated_at::TEXT,
      'correctionId', NULL,
      'updatedLots', '[]'::JSONB,
      'recalculatedRawMaterials', '[]'::JSONB
    );
  END IF;

  FOR r_lot IN
    SELECT rml.id, rml.internal_lot_no, rml.inbound_stock_movement_id
    FROM public.raw_material_lots AS rml
    WHERE rml.raw_material_receipt_id = p_receipt_id
      AND rml.organization_id = v_org_id
      AND rml.is_deleted = FALSE
  LOOP
    v_new_sm_note := 'Satın alma girişi. Belge: '
      || COALESCE(v_invoice_clean, '')
      || CASE
           WHEN v_invoice_clean IS NOT NULL AND v_dispatch_clean IS NOT NULL THEN ' / '
           ELSE ''
         END
      || COALESCE(v_dispatch_clean, '')
      || ' | Lot No: ' || r_lot.internal_lot_no
      || ' | Fiş ID: ' || p_receipt_id;

    UPDATE public.stock_movements
    SET note = v_new_sm_note,
        updated_at = NOW()
    WHERE id = r_lot.inbound_stock_movement_id
      AND organization_id = v_org_id;
  END LOOP;

  UPDATE public.raw_material_receipts
  SET invoice_number = v_invoice_clean,
      dispatch_note_number = v_dispatch_clean,
      note = v_note_clean,
      updated_at = NOW()
  WHERE id = p_receipt_id
    AND organization_id = v_org_id;

  IF cardinality(v_updated_rm_ids) > 0 THEN
    FOREACH v_recalc_rm_id IN ARRAY v_updated_rm_ids LOOP
      SELECT COALESCE(current_stock, 0)
      INTO v_current_stock
      FROM public.raw_materials
      WHERE id = v_recalc_rm_id
        AND organization_id = v_org_id;

      SELECT COALESCE(SUM(rml.quantity_remaining), 0)
      INTO v_total_remaining_qty
      FROM public.raw_material_lots AS rml
      JOIN public.raw_material_receipts AS rmr
        ON rmr.id = rml.raw_material_receipt_id
       AND rmr.organization_id = rml.organization_id
      WHERE rml.raw_material_id = v_recalc_rm_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rmr.is_deleted = FALSE;

      IF ABS(v_current_stock - v_total_remaining_qty) > 0.0001 THEN
        RAISE EXCEPTION 'Mevcut hammadde stoğu ile lotların kalan miktarı uyuşmuyor. Hammadde: %, Mevcut Stok: %, Lot Kalan: %',
          v_recalc_rm_id, v_current_stock, v_total_remaining_qty;
      END IF;

      IF v_total_remaining_qty > 0 THEN
        SELECT COALESCE(
          SUM(rml.quantity_remaining * rml.unit_price) / v_total_remaining_qty,
          0
        )
        INTO v_weighted_avg_cost
        FROM public.raw_material_lots AS rml
        JOIN public.raw_material_receipts AS rmr
          ON rmr.id = rml.raw_material_receipt_id
         AND rmr.organization_id = rml.organization_id
        WHERE rml.raw_material_id = v_recalc_rm_id
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rmr.is_deleted = FALSE;
      ELSE
        v_weighted_avg_cost := 0;
      END IF;

      SELECT rml.unit_price
      INTO v_last_purchase_price
      FROM public.raw_material_lots AS rml
      JOIN public.raw_material_receipts AS rmr
        ON rmr.id = rml.raw_material_receipt_id
       AND rmr.organization_id = rml.organization_id
      WHERE rml.raw_material_id = v_recalc_rm_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rmr.is_deleted = FALSE
      ORDER BY rmr.receipt_date DESC,
               rmr.created_at DESC,
               rml.created_at DESC,
               rml.id DESC
      LIMIT 1;

      v_last_purchase_price := COALESCE(v_last_purchase_price, 0);

      UPDATE public.raw_materials
      SET average_cost = v_weighted_avg_cost,
          purchase_price = v_last_purchase_price,
          updated_at = NOW()
      WHERE id = v_recalc_rm_id
        AND organization_id = v_org_id;
    END LOOP;
  END IF;

  SELECT jsonb_build_object(
    'id', rmr.id,
    'supplier_id', rmr.supplier_id,
    'receipt_date', rmr.receipt_date::TEXT,
    'invoice_number', rmr.invoice_number,
    'dispatch_note_number', rmr.dispatch_note_number,
    'note', rmr.note,
    'updated_at', rmr.updated_at::TEXT
  )
  INTO v_after_receipt_json
  FROM public.raw_material_receipts AS rmr
  WHERE rmr.id = p_receipt_id
    AND rmr.organization_id = v_org_id;

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
    ) ORDER BY id
  )
  INTO v_after_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'raw_material_id', raw_material_id,
      'movement_type', movement_type,
      'quantity', quantity,
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
  )
  INTO v_after_movements_json
  FROM public.stock_movements
  WHERE id = ANY(v_audit_movement_ids)
    AND organization_id = v_org_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'purchase_price', purchase_price,
      'average_cost', average_cost,
      'current_stock', current_stock
    ) ORDER BY id
  )
  INTO v_after_materials_json
  FROM public.raw_materials
  WHERE id = ANY(v_raw_material_ids)
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

  SELECT jsonb_agg(
    jsonb_build_object(
      'lotId', id,
      'unitPrice', unit_price,
      'quantityReceived', quantity_received,
      'quantityRemaining', quantity_remaining,
      'kunyeStatus', kunye_status,
      'kunyeNumber', kunye_number,
      'note', note
    ) ORDER BY id
  )
  INTO v_updated_lots_json
  FROM public.raw_material_lots
  WHERE id = ANY(v_receipt_lot_ids)
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
    'recalculatedRawMaterials', v_recalculated_raw_materials_json
  );
END;
$function$;

COMMENT ON FUNCTION public.update_raw_material_receipt_atomic(
  TEXT,
  TIMESTAMPTZ,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TEXT
) IS
'Atomically corrects a raw-material receipt. p_lines accepts lotId, unitPrice, optional quantityReceived, kunyeStatus, kunyeNumber and note. Quantity and price changes are blocked after any lot-allocation history.';

COMMIT;
