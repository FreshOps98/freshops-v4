-- ============================================================================
-- SUPABASE SQL SCHEMA DOCUMENTATION / CREATION SCRIPTS
-- ============================================================================
--
-- Supabase Veritabanınızda (SQL Editor sekmesinde) çalıştırmak için aşağıdaki 
-- tabloları ve ilişkilerini oluşturacak olan DDL scriptlerini kullanabilirsiniz.
-- Tüm tablo yapıları, tipler ve kolon isimleri servis katmanıyla birebir uyumludur.
--
-- ----------------------------------------------------------------------------

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Otel', 'Kafe', 'Restoran', 'Catering', 'Market', etc.
  phone TEXT,
  email TEXT,
  address TEXT,
  delivery_note TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RAW MATERIALS TABLE
CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Meyve', 'Sebze', 'Ambalaj', etc.
  unit TEXT NOT NULL, -- 'kg', 'adet', etc.
  purchase_price NUMERIC DEFAULT 0,
  default_waste_rate NUMERIC DEFAULT 0,
  default_yield_rate NUMERIC DEFAULT 100,
  critical_stock_level NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'Ananas', 'Meyve Mix', etc.
  package_weight_grams NUMERIC NOT NULL,
  sale_price NUMERIC NOT NULL,
  default_safety_rate NUMERIC DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. PRODUCT RECIPES TABLE
CREATE TABLE IF NOT EXISTS product_recipes (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id TEXT REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

-- 5. STOCK MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  raw_material_id TEXT REFERENCES raw_materials(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'Stok Girişi', 'Stok Çıkışı', 'Fire Çıkışı', etc.
  quantity NUMERIC NOT NULL,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  note TEXT,
  unit_price NUMERIC,
  total_cost NUMERIC,
  production_plan_id TEXT,
  production_plan_item_id TEXT,
  order_id TEXT,
  order_item_id TEXT,
  product_id TEXT,
  production_run_id TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  order_number TEXT,
  order_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  status TEXT NOT NULL, -- 'Onaylandı', 'Bekliyor', etc.
  approval_status TEXT NOT NULL,
  computed_status TEXT NOT NULL,
  total_amount NUMERIC DEFAULT 0,
  realized_amount NUMERIC DEFAULT 0,
  cost_settings_snapshot JSONB,
  note TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ADD STATUS CHECK CONSTRAINTS
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('Bekliyor', 'Onaylandı', 'Planlandı', 'Üretim Planlandı', 'Üretimde', 'Üretim Tamamlandı', 'Sevkiyata Hazır', 'Kısmi Sevk', 'Sevk Edildi', 'Tamamlandı', 'İptal', 'İptal Edildi', 'Taslak', 'Üretildi'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_computed_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_computed_status_check CHECK (computed_status IN ('Bekliyor', 'Onaylandı', 'Planlandı', 'Üretim Planlandı', 'Üretimde', 'Üretim Tamamlandı', 'Sevkiyata Hazır', 'Kısmi Sevk', 'Sevk Edildi', 'Tamamlandı', 'İptal', 'İptal Edildi', 'Taslak', 'Üretildi'));

-- 7. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  unit_sale_price NUMERIC NOT NULL
);

-- 8. PRODUCTION PLANS TABLE
CREATE TABLE IF NOT EXISTS production_plans (
  id TEXT PRIMARY KEY,
  production_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'Bekliyor', 'Üretimde', 'Tamamlandı'
  note TEXT,
  closed_with_shortage BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. PRODUCTION PLAN ITEMS TABLE
CREATE TABLE IF NOT EXISTS production_plan_items (
  id TEXT PRIMARY KEY,
  production_plan_id TEXT REFERENCES production_plans(id) ON DELETE CASCADE,
  order_id TEXT,
  order_item_id TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  planned_quantity NUMERIC NOT NULL,
  produced_quantity NUMERIC DEFAULT 0,
  status TEXT NOT NULL,
  raw_materials_deducted BOOLEAN DEFAULT FALSE,
  finished_goods_created BOOLEAN DEFAULT FALSE,
  finished_goods_stock_id TEXT,
  note TEXT,
  is_locked BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. FINISHED GOODS STOCKS TABLE
CREATE TABLE IF NOT EXISTS finished_goods_stocks (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id TEXT,
  production_plan_id TEXT REFERENCES production_plans(id) ON DELETE SET NULL,
  production_plan_item_id TEXT,
  production_run_id TEXT,
  production_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  quantity_produced NUMERIC NOT NULL,
  quantity_remaining NUMERIC NOT NULL,
  status TEXT NOT NULL, -- 'Stokta', 'Sevk Edildi'
  unit_cost NUMERIC,
  total_cost NUMERIC,
  note TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. FINISHED GOODS MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS finished_goods_movements (
  id TEXT PRIMARY KEY,
  finished_goods_stock_id TEXT,
  production_run_id TEXT,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id TEXT,
  movement_type TEXT NOT NULL, -- 'Üretim girişi', 'Sevkiyat çıkışı'
  quantity NUMERIC NOT NULL,
  movement_date TEXT NOT NULL,
  note TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,
  previous_quantity NUMERIC,
  new_quantity NUMERIC,
  difference NUMERIC,
  is_shipment BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. WASTE RECORDS TABLE
CREATE TABLE IF NOT EXISTS waste_records (
  id TEXT PRIMARY KEY,
  raw_material_id TEXT REFERENCES raw_materials(id) ON DELETE CASCADE,
  input_quantity NUMERIC NOT NULL,
  waste_quantity NUMERIC NOT NULL,
  usable_quantity NUMERIC NOT NULL,
  waste_rate NUMERIC NOT NULL,
  yield_rate NUMERIC NOT NULL,
  date TEXT NOT NULL,
  reason TEXT,
  note TEXT,
  operator TEXT
);

-- 13. COST SETTINGS TABLE
CREATE TABLE IF NOT EXISTS cost_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_safety_rate NUMERIC DEFAULT 3,
  labor_cost_per_package NUMERIC DEFAULT 2.5,
  overhead_cost_per_package NUMERIC DEFAULT 1.5,
  delivery_cost_per_package NUMERIC DEFAULT 1.0,
  use_average_waste_rate BOOLEAN DEFAULT FALSE,
  stock_warning_threshold INTEGER DEFAULT 15
);

-- 14. PRODUCTION RUNS TABLE
CREATE TABLE IF NOT EXISTS production_runs (
  id TEXT PRIMARY KEY,
  production_plan_id TEXT REFERENCES production_plans(id) ON DELETE CASCADE,
  production_plan_item_id TEXT,
  order_id TEXT,
  order_item_id TEXT,
  customer_id TEXT,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  produced_quantity NUMERIC NOT NULL,
  production_date TEXT NOT NULL,
  note TEXT,
  raw_materials_deducted BOOLEAN DEFAULT TRUE,
  raw_material_movement_ids TEXT[], -- Array structure
  finished_goods_created BOOLEAN DEFAULT TRUE,
  finished_goods_stock_id TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: cost_settings table should only have 1 active row (Singleton).
INSERT INTO cost_settings (id, default_safety_rate, labor_cost_per_package, overhead_cost_per_package, delivery_cost_per_package, use_average_waste_rate, stock_warning_threshold)
VALUES (1, 3, 2.5, 1.5, 1.0, FALSE, 15)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- FreshOps Raw Material Purchasing and Lot Traceability Foundation
-- ============================================================================

-- 1. Create public.suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('sup'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  name TEXT NOT NULL,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suppliers_name_not_empty CHECK (TRIM(name) <> '')
);

-- Partial unique index to prevent duplicate names (case-insensitive & trimmed) for active, non-deleted suppliers under the same tenant
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_name_active_idx ON public.suppliers (organization_id, TRIM(LOWER(name)))
WHERE is_active = TRUE AND is_deleted = FALSE;


-- 2. Create public.raw_material_receipts table
CREATE TABLE IF NOT EXISTS public.raw_material_receipts (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('rmr'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  supplier_id TEXT NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  receipt_date DATE NOT NULL,
  invoice_number TEXT,
  dispatch_note_number TEXT,
  note TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT,
  CONSTRAINT raw_material_receipts_doc_check CHECK (
    (invoice_number IS NOT NULL AND TRIM(invoice_number) <> '')
    OR
    (dispatch_note_number IS NOT NULL AND TRIM(dispatch_note_number) <> '')
  ),
  CONSTRAINT raw_material_receipts_idempotency_key_check CHECK (idempotency_key IS NULL OR TRIM(idempotency_key) <> '')
);

-- Create Unique Index for organization_id and idempotency_key (including deleted ones)
CREATE UNIQUE INDEX IF NOT EXISTS raw_material_receipts_org_idempotency_key_idx
ON public.raw_material_receipts (organization_id, TRIM(idempotency_key))
WHERE idempotency_key IS NOT NULL;


-- 3. Create public.raw_material_lots table
CREATE TABLE IF NOT EXISTS public.raw_material_lots (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('rml'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  raw_material_receipt_id TEXT NOT NULL REFERENCES public.raw_material_receipts(id) ON DELETE RESTRICT,
  raw_material_id TEXT NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  inbound_stock_movement_id TEXT NOT NULL REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  internal_lot_no TEXT NOT NULL,
  kunye_number TEXT NOT NULL,
  kunye_status TEXT NOT NULL,
  quantity_received NUMERIC NOT NULL,
  quantity_remaining NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT raw_material_lots_internal_lot_no_not_empty CHECK (TRIM(internal_lot_no) <> ''),
  CONSTRAINT raw_material_lots_kunye_number_not_empty CHECK (TRIM(kunye_number) <> ''),
  CONSTRAINT raw_material_lots_kunye_status_check CHECK (kunye_status IN ('provided', 'internal_placeholder')),
  CONSTRAINT raw_material_lots_qty_received_positive CHECK (quantity_received > 0),
  CONSTRAINT raw_material_lots_qty_remaining_nonnegative CHECK (quantity_remaining >= 0),
  CONSTRAINT raw_material_lots_qty_remaining_le_received CHECK (quantity_remaining <= quantity_received),
  CONSTRAINT raw_material_lots_unit_not_empty CHECK (TRIM(unit) <> ''),
  CONSTRAINT raw_material_lots_unit_price_nonnegative CHECK (unit_price >= 0),
  CONSTRAINT raw_material_lots_org_lot_key UNIQUE (organization_id, internal_lot_no),
  CONSTRAINT raw_material_lots_inbound_stock_movement_id_key UNIQUE (inbound_stock_movement_id)
);


-- 4. Create public.production_run_raw_material_lot_allocations table
CREATE TABLE IF NOT EXISTS public.production_run_raw_material_lot_allocations (
  id TEXT PRIMARY KEY DEFAULT public.freshops_id('prla'),
  organization_id UUID NOT NULL DEFAULT public.current_organization_id(),
  production_run_id TEXT NOT NULL REFERENCES public.production_runs(id) ON DELETE RESTRICT,
  production_plan_id TEXT NOT NULL REFERENCES public.production_plans(id) ON DELETE RESTRICT,
  production_plan_item_id TEXT NOT NULL REFERENCES public.production_plan_items(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id TEXT REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  raw_material_id TEXT NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  raw_material_lot_id TEXT NOT NULL REFERENCES public.raw_material_lots(id) ON DELETE RESTRICT,
  stock_movement_id TEXT NOT NULL REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  quantity_consumed NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  allocation_method TEXT NOT NULL,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_run_lot_allocations_quantity_consumed_positive CHECK (quantity_consumed > 0),
  CONSTRAINT production_run_lot_allocations_unit_not_empty CHECK (TRIM(unit) <> ''),
  CONSTRAINT production_run_lot_allocations_method_check CHECK (allocation_method IN ('fifo', 'manual')),
  CONSTRAINT production_run_lot_allocations_reversal_check CHECK (
    (is_reversed = FALSE AND reversed_at IS NULL) 
    OR 
    (is_reversed = TRUE AND reversed_at IS NOT NULL)
  )
);

-- Unique index to prevent duplicate allocations for the same run, lot, and stock movement under the same tenant
CREATE UNIQUE INDEX IF NOT EXISTS production_run_lot_allocations_unique_idx 
ON public.production_run_raw_material_lot_allocations (organization_id, production_run_id, raw_material_lot_id, stock_movement_id);


-- 5. Indexes for purchasing and allocation tables
CREATE INDEX IF NOT EXISTS suppliers_organization_id_idx ON public.suppliers (organization_id);

CREATE INDEX IF NOT EXISTS raw_material_receipts_organization_id_idx ON public.raw_material_receipts (organization_id);
CREATE INDEX IF NOT EXISTS raw_material_receipts_supplier_id_idx ON public.raw_material_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS raw_material_receipts_receipt_date_idx ON public.raw_material_receipts (receipt_date);

CREATE INDEX IF NOT EXISTS raw_material_lots_organization_id_idx ON public.raw_material_lots (organization_id);
CREATE INDEX IF NOT EXISTS raw_material_lots_raw_material_receipt_id_idx ON public.raw_material_lots (raw_material_receipt_id);
CREATE INDEX IF NOT EXISTS raw_material_lots_raw_material_id_idx ON public.raw_material_lots (raw_material_id);
CREATE INDEX IF NOT EXISTS raw_material_lots_inbound_stock_movement_id_idx ON public.raw_material_lots (inbound_stock_movement_id);
CREATE INDEX IF NOT EXISTS raw_material_lots_internal_lot_no_idx ON public.raw_material_lots (internal_lot_no);
CREATE INDEX IF NOT EXISTS raw_material_lots_kunye_number_idx ON public.raw_material_lots (kunye_number);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_org_idx 
ON public.production_run_raw_material_lot_allocations (organization_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_run_idx 
ON public.production_run_raw_material_lot_allocations (production_run_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_lot_idx 
ON public.production_run_raw_material_lot_allocations (raw_material_lot_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_rm_idx 
ON public.production_run_raw_material_lot_allocations (raw_material_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_order_idx 
ON public.production_run_raw_material_lot_allocations (order_id);

CREATE INDEX IF NOT EXISTS production_run_lot_allocations_product_idx 
ON public.production_run_raw_material_lot_allocations (product_id);


-- 6. Tenant Security: Row Level Security (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_run_raw_material_lot_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'suppliers' 
      AND policyname = 'select_suppliers_by_tenant'
  ) THEN
    CREATE POLICY select_suppliers_by_tenant ON public.suppliers
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
      AND tablename = 'raw_material_receipts' 
      AND policyname = 'select_raw_material_receipts_by_tenant'
  ) THEN
    CREATE POLICY select_raw_material_receipts_by_tenant ON public.raw_material_receipts
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
      AND tablename = 'raw_material_lots' 
      AND policyname = 'select_raw_material_lots_by_tenant'
  ) THEN
    CREATE POLICY select_raw_material_lots_by_tenant ON public.raw_material_lots
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
      AND tablename = 'production_run_raw_material_lot_allocations' 
      AND policyname = 'select_production_run_lot_allocations_by_tenant'
  ) THEN
    CREATE POLICY select_production_run_lot_allocations_by_tenant 
    ON public.production_run_raw_material_lot_allocations
    FOR SELECT
    TO authenticated
    USING (organization_id = public.current_organization_id());
  END IF;
END $$;


-- 7. Role Permissions (GRANTS & REVOKES)
REVOKE ALL ON public.suppliers FROM PUBLIC;
REVOKE ALL ON public.raw_material_receipts FROM PUBLIC;
REVOKE ALL ON public.raw_material_lots FROM PUBLIC;
REVOKE ALL ON public.production_run_raw_material_lot_allocations FROM PUBLIC;

GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.raw_material_receipts TO authenticated;
GRANT SELECT ON public.raw_material_lots TO authenticated;
GRANT SELECT ON public.production_run_raw_material_lot_allocations TO authenticated;

GRANT ALL ON public.suppliers TO service_role;
GRANT ALL ON public.raw_material_receipts TO service_role;
GRANT ALL ON public.raw_material_lots TO service_role;
GRANT ALL ON public.production_run_raw_material_lot_allocations TO service_role;

-- 15. RECOMPUTE ORDER STATUS ATOMIC RPC
CREATE OR REPLACE FUNCTION public.recompute_order_status_atomic(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_order record;
  v_new_status text;

  v_ordered_quantity numeric := 0;
  v_produced_quantity numeric := 0;
  v_has_active_plan_item boolean := false;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not accessible.';
  END IF;

  /*
   * Kullanıcı tarafından yönetilen özel durumları koru.
   */
  IF v_order.status IN (
      'Taslak',
      'Bekliyor',
      'İptal',
      'İptal Edildi'
    )
  THEN
    v_new_status := v_order.status;

  ELSIF v_order.computed_status IN (
      'Taslak',
      'Bekliyor',
      'İptal',
      'İptal Edildi'
    )
  THEN
    v_new_status := v_order.computed_status;

  /*
   * Sevkiyat durumları en yüksek önceliğe sahiptir.
   */
  ELSIF COALESCE(v_order.realized_amount, 0) > 0
    AND COALESCE(v_order.realized_amount, 0)
      < COALESCE(v_order.total_amount, 0)
  THEN
    v_new_status := 'Kısmi Sevk';

  ELSIF COALESCE(v_order.total_amount, 0) > 0
    AND COALESCE(v_order.realized_amount, 0)
      >= COALESCE(v_order.total_amount, 0)
  THEN
    v_new_status := 'Sevk Edildi';

  ELSE
    /*
     * Siparişin toplam miktarını aktif sipariş kalemlerinden hesapla.
     */
    SELECT COALESCE(
      SUM(GREATEST(COALESCE(oi.quantity, 0), 0)),
      0
    )
    INTO v_ordered_quantity
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
      AND oi.organization_id = v_org_id
      AND COALESCE(oi.is_deleted, false) = false;

    /*
     * Gerçekleşen üretimi aktif üretim kayıtlarından hesapla.
     * Geri alınan üretim kayıtları is_deleted=true olduğu için dahil edilmez.
     */
    SELECT COALESCE(
      SUM(GREATEST(COALESCE(pr.produced_quantity, 0), 0)),
      0
    )
    INTO v_produced_quantity
    FROM public.production_runs pr
    WHERE pr.order_id = v_order.id
      AND pr.organization_id = v_org_id
      AND COALESCE(pr.is_deleted, false) = false
      AND COALESCE(pr.status, '') <> 'Üretim Geri Alındı';

    IF v_ordered_quantity > 0
      AND v_produced_quantity >= v_ordered_quantity
    THEN
      v_new_status := 'Sevkiyata Hazır';

    ELSIF v_produced_quantity > 0 THEN
      v_new_status := 'Üretimde';

    ELSE
      /*
       * Yalnızca açık bir plandaki aktif kalem siparişi
       * Üretim Planlandı durumuna getirir.
       */
      SELECT EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        JOIN public.production_plans pp
          ON pp.id = ppi.production_plan_id
         AND pp.organization_id = ppi.organization_id
        WHERE ppi.order_id = v_order.id
          AND ppi.organization_id = v_org_id
          AND COALESCE(ppi.is_deleted, false) = false
          AND ppi.status NOT IN (
            'İptal',
            'İptal Edildi',
            'Tamamlandı',
            'Eksikle Kapatıldı'
          )
          AND COALESCE(pp.is_deleted, false) = false
          AND pp.status NOT IN (
            'Tamamlandı',
            'Eksikle Kapatıldı',
            'İptal',
            'İptal Edildi'
          )
          AND pp.closed_at IS NULL
          AND pp.completed_at IS NULL
          AND COALESCE(pp.is_locked, false) = false
      )
      INTO v_has_active_plan_item;

      IF v_has_active_plan_item THEN
        v_new_status := 'Üretim Planlandı';
      ELSE
        v_new_status := 'Onaylandı';
      END IF;
    END IF;
  END IF;

  UPDATE public.orders
  SET
    status = v_new_status,
    computed_status = v_new_status,
    updated_at = now()
  WHERE id = v_order.id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', v_new_status,
    'orderedQuantity', v_ordered_quantity,
    'producedQuantity', v_produced_quantity,
    'realizedAmount', COALESCE(v_order.realized_amount, 0),
    'totalAmount', COALESCE(v_order.total_amount, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.recompute_order_status_atomic(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.recompute_order_status_atomic(TEXT)
TO authenticated, service_role;


-- 15.5. KEEP PRODUCTION PLAN OPEN UNTIL EXPLICIT CLOSE TRIGGER
CREATE OR REPLACE FUNCTION public.keep_production_plan_open_until_explicit_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_produced BOOLEAN;
BEGIN
  IF LOWER(TRIM(TRANSLATE(COALESCE(NEW.status, ''), 'İI', 'ii'))) IN ('tamamlandı', 'completed', 'plan tamamlandı') THEN
    IF COALESCE(NEW.is_locked, FALSE) = FALSE
       AND NEW.completed_at IS NULL
       AND NEW.closed_at IS NULL
       AND COALESCE(NEW.closed_with_shortage, FALSE) = FALSE
    THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = NEW.id
          AND organization_id = NEW.organization_id
          AND COALESCE(is_deleted, FALSE) = FALSE
          AND COALESCE(produced_quantity, 0) > 0
      ) INTO v_has_produced;

      IF v_has_produced THEN
        NEW.status := 'Üretimde';
      ELSE
        NEW.status := 'Planlandı';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_keep_production_plan_open_until_explicit_close ON public.production_plans;

CREATE TRIGGER trg_keep_production_plan_open_until_explicit_close
BEFORE INSERT OR UPDATE ON public.production_plans
FOR EACH ROW
EXECUTE FUNCTION public.keep_production_plan_open_until_explicit_close();


-- 16. ADD ORDER ITEM TO PRODUCTION PLAN ATOMIC RPC
CREATE OR REPLACE FUNCTION public.add_order_item_to_production_plan_atomic(
  p_production_plan_id text,
  p_order_id text,
  p_order_item_id text,
  p_product_id text,
  p_planned_quantity numeric,
  p_unit text DEFAULT 'adet'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_plan_status TEXT;
  v_is_locked BOOLEAN;
  v_closed_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_closed_with_shortage BOOLEAN;

  v_customer_id TEXT;
  v_existing_id TEXT;
  v_existing_is_deleted BOOLEAN;
  v_new_item_id TEXT;
  v_has_produced BOOLEAN;
  v_new_plan_status TEXT;
BEGIN
  /*
   * p_unit eski frontend/RPC imzasıyla uyumluluk için korunur.
   * production_plan_items tablosunda unit kolonu olmadığı için kullanılmaz.
   */

  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Aktif organizasyon bulunamadı.'
    );
  END IF;

  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Planlanan miktar 0’dan büyük olmalıdır.'
    );
  END IF;

  /*
   * Planı transaction boyunca kilitle.
   * Plan kapatma ile plana kalem ekleme aynı anda çalışamaz.
   */
  SELECT
    status,
    COALESCE(is_locked, FALSE),
    closed_at,
    completed_at,
    COALESCE(closed_with_shortage, FALSE)
  INTO
    v_plan_status,
    v_is_locked,
    v_closed_at,
    v_completed_at,
    v_closed_with_shortage
  FROM public.production_plans
  WHERE id = p_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Üretim planı bulunamadı veya erişim yetkisi yok.'
    );
  END IF;

  IF v_is_locked = TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu üretim planı kilitli olduğu için yeni kalem eklenemez.'
    );
  END IF;

  IF v_closed_at IS NOT NULL
     OR v_completed_at IS NOT NULL
     OR v_closed_with_shortage = TRUE
     OR LOWER(TRIM(TRANSLATE(COALESCE(v_plan_status, ''), 'İI', 'ii'))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'eksikle_kapatildi',
       'closed_with_shortage',
       'cancelled',
       'closed'
     )
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu üretim planı kapalı veya iptal edildiği için yeni kalem eklenemez.'
    );
  END IF;

  /*
   * Sipariş aynı organizasyona ait olmalı.
   */
  SELECT customer_id
  INTO v_customer_id
  FROM public.orders
  WHERE id = p_order_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sipariş bulunamadı veya erişim yetkisi yok.'
    );
  END IF;

  /*
   * Sipariş kalemi verilen sipariş ve ürünle eşleşmeli.
   */
  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items
    WHERE id = p_order_item_id
      AND order_id = p_order_id
      AND product_id = p_product_id
      AND COALESCE(is_deleted, FALSE) = FALSE
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sipariş kalemi bulunamadı veya siparişle eşleşmiyor.'
    );
  END IF;

  /*
   * Aynı sipariş kalemini tekrar oluşturma.
   * Bulunan satırı transaction boyunca kilitle.
   */
  SELECT
    id,
    COALESCE(is_deleted, FALSE)
  INTO
    v_existing_id,
    v_existing_is_deleted
  FROM public.production_plan_items
  WHERE organization_id = v_org_id
    AND production_plan_id = p_production_plan_id
    AND order_item_id = p_order_item_id
  ORDER BY
    COALESCE(is_deleted, FALSE) ASC,
    created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_is_deleted = TRUE THEN
      UPDATE public.production_plan_items
      SET
        is_deleted = FALSE,
        deleted_at = NULL,
        deleted_reason = NULL,
        planned_quantity = p_planned_quantity,
        produced_quantity = 0,
        status = 'Planlandı',
        updated_at = NOW()
      WHERE id = v_existing_id
        AND organization_id = v_org_id;

      SELECT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = p_production_plan_id
          AND organization_id = v_org_id
          AND COALESCE(is_deleted, FALSE) = FALSE
          AND COALESCE(produced_quantity, 0) > 0
      ) INTO v_has_produced;

      IF v_has_produced THEN
        v_new_plan_status := 'Üretimde';
      ELSE
        v_new_plan_status := 'Planlandı';
      END IF;

      UPDATE public.production_plans
      SET
        status = v_new_plan_status,
        completed_at = NULL,
        closed_at = NULL,
        closed_with_shortage = FALSE,
        is_locked = FALSE,
        updated_at = NOW()
      WHERE id = p_production_plan_id
        AND organization_id = v_org_id;

      PERFORM public.recompute_order_status_atomic(p_order_id);

      RETURN json_build_object(
        'success', true,
        'id', v_existing_id,
        'inserted', false,
        'reactivated', true,
        'message', 'Silinmiş plan kalemi yeniden aktif edildi.'
      );
    END IF;

    PERFORM public.recompute_order_status_atomic(p_order_id);

    RETURN json_build_object(
      'success', true,
      'id', v_existing_id,
      'inserted', false,
      'reactivated', false,
      'message', 'Bu sipariş kalemi zaten bu plana ekli. Tekrar işlem yapılmadı.'
    );
  END IF;

  /*
   * Yeni plan kalemi oluştur.
   * unit kolonu gerçek tabloda bulunmadığı için INSERT listesinde yoktur.
   */
  v_new_item_id :=
    'pi_' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10);

  INSERT INTO public.production_plan_items (
    id,
    organization_id,
    production_plan_id,
    order_id,
    order_item_id,
    customer_id,
    product_id,
    planned_quantity,
    produced_quantity,
    status,
    is_deleted,
    created_at,
    updated_at
  )
  VALUES (
    v_new_item_id,
    v_org_id,
    p_production_plan_id,
    p_order_id,
    p_order_item_id,
    v_customer_id,
    p_product_id,
    p_planned_quantity,
    0,
    'Planlandı',
    FALSE,
    NOW(),
    NOW()
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.production_plan_items
    WHERE production_plan_id = p_production_plan_id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND COALESCE(produced_quantity, 0) > 0
  ) INTO v_has_produced;

  IF v_has_produced THEN
    v_new_plan_status := 'Üretimde';
  ELSE
    v_new_plan_status := 'Planlandı';
  END IF;

  UPDATE public.production_plans
  SET
    status = v_new_plan_status,
    completed_at = NULL,
    closed_at = NULL,
    closed_with_shortage = FALSE,
    is_locked = FALSE,
    updated_at = NOW()
  WHERE id = p_production_plan_id
    AND organization_id = v_org_id;

  PERFORM public.recompute_order_status_atomic(p_order_id);

  RETURN json_build_object(
    'success', true,
    'id', v_new_item_id,
    'inserted', true,
    'reactivated', false,
    'message', 'Sipariş kalemi üretim planına eklendi.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.add_order_item_to_production_plan_atomic(
    TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT
  )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.add_order_item_to_production_plan_atomic(
    TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT
  )
TO authenticated, service_role;


-- 17. CREATE PRODUCTION RUN ATOMIC (WITH LOT ALLOCATIONS SUPPORT)
CREATE OR REPLACE FUNCTION public.create_production_run_with_lots_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC,
  p_note TEXT,
  p_lot_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_ppi RECORD;
  v_plan RECORD;
  v_product RECORD;
  v_cs RECORD;

  v_run_id TEXT;
  v_fgs_id TEXT;
  v_fgm_id TEXT;
  v_sm_id TEXT;

  v_lot_date DATE;
  v_lot_no TEXT;
  v_lot_offset INTEGER := 0;

  v_material_total NUMERIC := 0;
  v_labor_cost NUMERIC := 0;
  v_overhead_cost NUMERIC := 0;
  v_unit_cost NUMERIC := 0;
  v_total_cost NUMERIC := 0;

  v_recipe RECORD;
  v_net_qty NUMERIC;
  v_gross_qty NUMERIC;
  v_waste_rate NUMERIC;
  v_unit_price NUMERIC;
  v_new_plan_item_produced NUMERIC;

  v_movement_ids JSONB := '[]'::JSONB;
  
  v_production_plan_id TEXT;
  v_remaining_quantity NUMERIC;

  -- Phase 1B variables
  v_use_manual BOOLEAN := FALSE;
  v_allocations_json_array JSONB := '[]'::JSONB;
  v_alloc_id TEXT;
  v_remaining_needed NUMERIC;
  v_total_available_lot_qty NUMERIC;
  v_allocated NUMERIC;
  v_manual_allocated_sum NUMERIC;
  v_loop_processed_sum NUMERIC;
  v_invalid_rm_count INTEGER;
  v_rm_id TEXT;
  r_lot RECORD;
BEGIN
  -- Authenticate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Validate Produced Quantity
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- 1. Get the production plan ID without locking first
  SELECT production_plan_id
  INTO v_production_plan_id
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2. Lock the production plan FOR UPDATE
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- 3. Check if the production plan is closed or locked
  IF COALESCE(v_plan.is_locked, FALSE) = TRUE
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kapalı veya kilitli olduğu için yeni üretim girişi yapılamaz.';
  END IF;

  -- 4. Lock and reload the production plan item
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND production_plan_id = v_plan.id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 5. Check if the production plan item is closed or locked
  IF COALESCE(v_ppi.is_locked, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_ppi.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kalemi kapalı veya kilitli olduğu için üretim girişi yapılamaz.';
  END IF;

  -- 6. Check remaining quantity to prevent excess production
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0) - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION 'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- 5b. Check for duplicate active recipe raw materials
  IF EXISTS (
    SELECT 1
    FROM public.product_recipes pr
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
    GROUP BY BTRIM(pr.raw_material_id)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ürünün aktif reçetesinde mükerrer hammadde tanımlanmış. Lütfen reçeteyi düzeltin.';
  END IF;

  -- 7. Validate and parse lot allocations if manual selection is active
  IF p_lot_allocations IS NOT NULL THEN
    IF jsonb_typeof(p_lot_allocations) <> 'array' THEN
      RAISE EXCEPTION 'p_lot_allocations must be a JSON array.';
    END IF;

    IF jsonb_array_length(p_lot_allocations) > 0 THEN
      v_use_manual := TRUE;

      -- Validate each element in array safely
      DECLARE
        v_elem JSONB;
        v_elem_rm_id TEXT;
        v_elem_lot_id TEXT;
        v_elem_qty_text TEXT;
        v_elem_qty NUMERIC;
      BEGIN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_lot_allocations) LOOP
          IF jsonb_typeof(v_elem) <> 'object' THEN
            RAISE EXCEPTION 'Her lot allocation girdisi bir JSON objesi olmalıdır.';
          END IF;

          v_elem_rm_id := BTRIM(v_elem->>'rawMaterialId');
          v_elem_lot_id := BTRIM(v_elem->>'rawMaterialLotId');
          v_elem_qty_text := v_elem->>'quantity';

          IF v_elem_rm_id IS NULL OR v_elem_rm_id = '' THEN
            RAISE EXCEPTION 'rawMaterialId boş olamaz.';
          END IF;

          IF v_elem_lot_id IS NULL OR v_elem_lot_id = '' THEN
            RAISE EXCEPTION 'rawMaterialLotId boş olamaz.';
          END IF;

          IF v_elem_qty_text IS NULL OR TRIM(v_elem_qty_text) = '' THEN
            RAISE EXCEPTION 'quantity boş olamaz.';
          END IF;

          -- Safe numeric cast check
          IF LOWER(BTRIM(v_elem_qty_text)) IN ('nan', 'infinity', '-infinity', '+infinity') THEN
            RAISE EXCEPTION 'Geçersiz miktar değeri: %. Sayısal bir değer girilmelidir.', v_elem_qty_text;
          END IF;

          BEGIN
            v_elem_qty := v_elem_qty_text::NUMERIC;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Geçersiz miktar değeri: %. Sayısal bir değer girilmelidir.', v_elem_qty_text;
          END;

          IF v_elem_qty <= 0 THEN
            RAISE EXCEPTION 'Lot allocation girdisinde quantity sıfırdan büyük olmalıdır.';
          END IF;
        END LOOP;
      END;

      -- Check for duplicate rawMaterialId + rawMaterialLotId
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_lot_allocations) elem
        GROUP BY BTRIM(elem->>'rawMaterialId'), BTRIM(elem->>'rawMaterialLotId')
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Aynı hammadde ve lot çifti birden fazla kez gönderilemez.';
      END IF;

      -- Check if any raw material in input is NOT in product's active recipe
      SELECT COUNT(*)
      INTO v_invalid_rm_count
      FROM (
        SELECT DISTINCT BTRIM(elem->>'rawMaterialId') AS rm_id
        FROM jsonb_array_elements(p_lot_allocations) elem
      ) p
      LEFT JOIN public.product_recipes pr ON BTRIM(pr.raw_material_id) = p.rm_id
        AND pr.product_id = v_ppi.product_id
        AND pr.organization_id = v_org_id
        AND pr.is_deleted = FALSE
      WHERE pr.raw_material_id IS NULL;

      IF v_invalid_rm_count > 0 THEN
        RAISE EXCEPTION 'Reçetede bulunmayan hammadde lot allocation girdisi tespit edildi.';
      END IF;
    END IF;
  END IF;

  -- 8. Advisory locking of recipe raw materials in deterministic ascending order of ID
  FOR v_rm_id IN
    SELECT DISTINCT BTRIM(pr.raw_material_id)
    FROM public.product_recipes pr
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
    ORDER BY BTRIM(pr.raw_material_id) ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_org_id::TEXT || ':raw-material-lot:' || v_rm_id,
        0
      )
    );
  END LOOP;

  -- Get Product Settings & Cost Details
  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_ppi.product_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  SELECT *
  INTO v_cs
  FROM public.cost_settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF FOUND THEN
    v_lot_offset := COALESCE(v_cs.lot_date_offset_days, 0);
    v_labor_cost := COALESCE(v_cs.labor_cost_per_package, 0);
    v_overhead_cost := COALESCE(v_cs.overhead_cost_per_package, 0);
  ELSE
    v_lot_offset := 0;
    v_labor_cost := 0;
    v_overhead_cost := 0;
  END IF;

  v_lot_date := v_plan.production_date + v_lot_offset;
  v_lot_no := COALESCE(NULLIF(v_product.lot_prefix, ''), UPPER(SUBSTR(v_product.name, 1, 3)))
              || '-' || TO_CHAR(v_lot_date, 'DDMMYY');

  v_run_id := public.freshops_id('run');

  -- Insert core production run record (raw_materials_deducted will be false initially, updated after lot allocations)
  INSERT INTO public.production_runs (
    id,
    organization_id,
    production_plan_id,
    production_plan_item_id,
    order_id,
    order_item_id,
    customer_id,
    product_id,
    production_date,
    produced_quantity,
    waste_quantity,
    unit,
    status,
    lot_no,
    lot_date,
    lot_date_offset_days,
    unit_cost,
    total_cost,
    raw_materials_deducted,
    raw_material_movement_ids,
    finished_goods_created,
    note,
    is_deleted,
    is_demo
  )
  VALUES (
    v_run_id,
    v_org_id,
    v_ppi.production_plan_id,
    v_ppi.id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    v_ppi.customer_id,
    v_ppi.product_id,
    v_plan.production_date,
    p_produced_quantity,
    0,
    'adet',
    'Tamamlandı',
    v_lot_no,
    v_lot_date,
    v_lot_offset,
    0,
    0,
    FALSE,
    '[]'::JSONB,
    FALSE,
    p_note,
    FALSE,
    FALSE
  );

  -- 9. Iterate recipe requirements & allocate raw material lots
  FOR v_recipe IN
    SELECT
      BTRIM(pr.raw_material_id) AS raw_material_id,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit,
      rm.average_cost,
      rm.purchase_price,
      rm.name AS raw_material_name
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON BTRIM(rm.id) = BTRIM(pr.raw_material_id)
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = FALSE
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);

    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    -- Standard unit conversion
    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));
    v_unit_price := COALESCE(NULLIF(v_recipe.average_cost, 0), v_recipe.purchase_price, 0);

    -- Create single aggregate Stock Movement row for 'Üretim Tüketimi'
    INSERT INTO public.stock_movements (
      id,
      organization_id,
      raw_material_id,
      movement_type,
      quantity,
      unit,
      unit_price,
      movement_date,
      production_run_id,
      production_plan_id,
      production_plan_item_id,
      order_id,
      order_item_id,
      product_id,
      note,
      is_deleted,
      is_demo
    )
    VALUES (
      public.freshops_id('sm'),
      v_org_id,
      v_recipe.raw_material_id,
      'Üretim Tüketimi',
      v_gross_qty,
      v_recipe.raw_unit,
      v_unit_price,
      v_plan.production_date,
      v_run_id,
      v_ppi.production_plan_id,
      v_ppi.id,
      v_ppi.order_id,
      v_ppi.order_item_id,
      v_ppi.product_id,
      'Üretim tüketimi - Run: ' || v_run_id || ', Lot: ' || v_lot_no,
      FALSE,
      FALSE
    )
    RETURNING id INTO v_sm_id;

    v_movement_ids := v_movement_ids || TO_JSONB(v_sm_id);
    v_material_total := v_material_total + (v_gross_qty * v_unit_price);

    -- Lot allocations
    IF v_use_manual THEN
      -- Validate that all sent lots for this raw material exist and are valid/compatible (Point 4)
      DECLARE
        v_sent_lot_count INT;
        v_matched_lot_count INT;
      BEGIN
        SELECT COUNT(DISTINCT BTRIM(elem->>'rawMaterialLotId'))
        INTO v_sent_lot_count
        FROM jsonb_array_elements(p_lot_allocations) elem
        WHERE BTRIM(elem->>'rawMaterialId') = BTRIM(v_recipe.raw_material_id);

        IF v_sent_lot_count > 0 THEN
          SELECT COUNT(*)
          INTO v_matched_lot_count
          FROM public.raw_material_lots rml
          JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
          WHERE BTRIM(rml.id) IN (
            SELECT DISTINCT BTRIM(elem->>'rawMaterialLotId')
            FROM jsonb_array_elements(p_lot_allocations) elem
            WHERE BTRIM(elem->>'rawMaterialId') = BTRIM(v_recipe.raw_material_id)
          )
            AND rml.organization_id = v_org_id
            AND BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
            AND rml.is_deleted = FALSE
            AND rmr.organization_id = v_org_id
            AND rmr.is_deleted = FALSE
            AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit));

          IF v_matched_lot_count <> v_sent_lot_count THEN
            RAISE EXCEPTION 'Seçilen lotlardan biri bulunamadı veya organizasyon, hammadde ya da birim ile uyuşmuyor.';
          END IF;
        END IF;
      END;

      -- Manual Selection Mode
      SELECT COALESCE(SUM((elem->>'quantity')::NUMERIC), 0)
      INTO v_manual_allocated_sum
      FROM jsonb_array_elements(p_lot_allocations) elem
      WHERE BTRIM(elem->>'rawMaterialId') = BTRIM(v_recipe.raw_material_id);

      IF ABS(v_manual_allocated_sum - v_gross_qty) > 0.000000001 THEN
        RAISE EXCEPTION 'Manuel lot miktar toplamı reçete brüt ihtiyacı ile eşleşmiyor. Hammadde: %, Gereken: %, Manuel Toplam: %',
          v_recipe.raw_material_name, v_gross_qty, v_manual_allocated_sum;
      END IF;

      v_loop_processed_sum := 0;

      FOR r_lot IN
        SELECT 
          rml.id AS lot_id,
          rml.internal_lot_no,
          rml.quantity_remaining,
          rml.kunye_number,
          rml.kunye_status,
          m.qty AS manual_qty
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        JOIN (
          SELECT 
            BTRIM(elem->>'rawMaterialLotId') AS lot_id,
            (elem->>'quantity')::NUMERIC AS qty
          FROM jsonb_array_elements(p_lot_allocations) AS elem
          WHERE BTRIM(elem->>'rawMaterialId') = BTRIM(v_recipe.raw_material_id)
        ) m ON m.lot_id = BTRIM(rml.id)
        WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
          AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit))
        ORDER BY 
          rmr.receipt_date ASC,
          rml.created_at ASC,
          rml.id ASC
        FOR UPDATE OF rml
      LOOP
        -- Check lot limits
        IF r_lot.quantity_remaining < r_lot.manual_qty THEN
          SELECT COALESCE(SUM(rml.quantity_remaining), 0)
          INTO v_total_available_lot_qty
          FROM public.raw_material_lots rml
          JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
          WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
            AND rml.organization_id = v_org_id
            AND rml.is_deleted = FALSE
            AND rml.quantity_remaining > 0
            AND rmr.organization_id = v_org_id
            AND rmr.is_deleted = FALSE
            AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit));

          RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
            v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
        END IF;

        -- Deduct from lot
        UPDATE public.raw_material_lots
        SET
          quantity_remaining = quantity_remaining - r_lot.manual_qty,
          updated_at = NOW()
        WHERE id = r_lot.lot_id
          AND organization_id = v_org_id
          AND quantity_remaining >= r_lot.manual_qty;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Lot güncellemesi başarısız oldu. Lot ID: %', r_lot.lot_id;
        END IF;

        -- Create allocation entry
        v_alloc_id := public.freshops_id('prla');
        INSERT INTO public.production_run_raw_material_lot_allocations (
          id,
          organization_id,
          production_run_id,
          production_plan_id,
          production_plan_item_id,
          order_id,
          order_item_id,
          product_id,
          raw_material_id,
          raw_material_lot_id,
          stock_movement_id,
          quantity_consumed,
          unit,
          allocation_method,
          is_reversed,
          reversed_at,
          reversal_reason,
          created_at,
          updated_at
        )
        VALUES (
          v_alloc_id,
          v_org_id,
          v_run_id,
          v_ppi.production_plan_id,
          v_ppi.id,
          v_ppi.order_id,
          v_ppi.order_item_id,
          v_ppi.product_id,
          v_recipe.raw_material_id,
          r_lot.lot_id,
          v_sm_id,
          r_lot.manual_qty,
          v_recipe.raw_unit,
          'manual',
          FALSE,
          NULL,
          NULL,
          NOW(),
          NOW()
        );

        -- Add to output list
        v_allocations_json_array := v_allocations_json_array || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT(
            'allocationId', v_alloc_id,
            'rawMaterialId', v_recipe.raw_material_id,
            'rawMaterialLotId', r_lot.lot_id,
            'internalLotNo', r_lot.internal_lot_no,
            'kunyeNumber', r_lot.kunye_number,
            'allocatedQuantity', r_lot.manual_qty,
            'unit', v_recipe.raw_unit,
            'allocationMethod', 'manual'
          )
        );

        v_loop_processed_sum := v_loop_processed_sum + r_lot.manual_qty;
      END LOOP;

      -- Check if we successfully fulfilled the amount
      IF ABS(v_loop_processed_sum - v_gross_qty) > 0.000000001 THEN
        SELECT COALESCE(SUM(rml.quantity_remaining), 0)
        INTO v_total_available_lot_qty
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rml.quantity_remaining > 0
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
          AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit));

        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

    ELSE
      -- FIFO Mode
      v_remaining_needed := v_gross_qty;

      SELECT COALESCE(SUM(rml.quantity_remaining), 0)
      INTO v_total_available_lot_qty
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
      WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rml.quantity_remaining > 0
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE
        AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit));

      IF v_total_available_lot_qty < v_gross_qty THEN
        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

      FOR r_lot IN
        SELECT 
          rml.id AS lot_id,
          rml.internal_lot_no,
          rml.quantity_remaining,
          rml.kunye_number,
          rml.kunye_status
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rml.quantity_remaining > 0
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
          AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit))
        ORDER BY 
          rmr.receipt_date ASC,
          rml.created_at ASC,
          rml.id ASC
        FOR UPDATE OF rml
      LOOP
        IF v_remaining_needed <= 0 THEN
          EXIT;
        END IF;

        v_allocated := LEAST(r_lot.quantity_remaining, v_remaining_needed);

        UPDATE public.raw_material_lots
        SET
          quantity_remaining = quantity_remaining - v_allocated,
          updated_at = NOW()
        WHERE id = r_lot.lot_id
          AND organization_id = v_org_id
          AND quantity_remaining >= v_allocated;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Lot güncellemesi başarısız oldu. Lot ID: %', r_lot.lot_id;
        END IF;

        -- Create allocation entry
        v_alloc_id := public.freshops_id('prla');
        INSERT INTO public.production_run_raw_material_lot_allocations (
          id,
          organization_id,
          production_run_id,
          production_plan_id,
          production_plan_item_id,
          order_id,
          order_item_id,
          product_id,
          raw_material_id,
          raw_material_lot_id,
          stock_movement_id,
          quantity_consumed,
          unit,
          allocation_method,
          is_reversed,
          reversed_at,
          reversal_reason,
          created_at,
          updated_at
        )
        VALUES (
          v_alloc_id,
          v_org_id,
          v_run_id,
          v_ppi.production_plan_id,
          v_ppi.id,
          v_ppi.order_id,
          v_ppi.order_item_id,
          v_ppi.product_id,
          v_recipe.raw_material_id,
          r_lot.lot_id,
          v_sm_id,
          v_allocated,
          v_recipe.raw_unit,
          'fifo',
          FALSE,
          NULL,
          NULL,
          NOW(),
          NOW()
        );

        -- Add to output list
        v_allocations_json_array := v_allocations_json_array || JSONB_BUILD_ARRAY(
          JSONB_BUILD_OBJECT(
            'allocationId', v_alloc_id,
            'rawMaterialId', v_recipe.raw_material_id,
            'rawMaterialLotId', r_lot.lot_id,
            'internalLotNo', r_lot.internal_lot_no,
            'kunyeNumber', r_lot.kunye_number,
            'allocatedQuantity', v_allocated,
            'unit', v_recipe.raw_unit,
            'allocationMethod', 'fifo'
          )
        );

        v_remaining_needed := v_remaining_needed - v_allocated;
      END LOOP;

      IF v_remaining_needed > 0 THEN
        SELECT COALESCE(SUM(rml.quantity_remaining), 0)
        INTO v_total_available_lot_qty
        FROM public.raw_material_lots rml
        JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
        WHERE BTRIM(rml.raw_material_id) = BTRIM(v_recipe.raw_material_id)
          AND rml.organization_id = v_org_id
          AND rml.is_deleted = FALSE
          AND rml.quantity_remaining > 0
          AND rmr.organization_id = v_org_id
          AND rmr.is_deleted = FALSE
          AND LOWER(BTRIM(rml.unit)) = LOWER(BTRIM(v_recipe.raw_unit));

        RAISE EXCEPTION 'Yeterli hammadde lot stoku bulunamadı. Hammadde: %, Gereken: %, Mevcut: %',
          v_recipe.raw_material_name, v_gross_qty, v_total_available_lot_qty;
      END IF;

    END IF;
  END LOOP;

  -- 10. Core Cost Calculations & Inserting Finished Goods Stocks/Movements
  v_total_cost := v_material_total + (p_produced_quantity * (v_labor_cost + v_overhead_cost));

  IF p_produced_quantity > 0 THEN
    v_unit_cost := v_total_cost / p_produced_quantity;
  ELSE
    v_unit_cost := 0;
  END IF;

  v_fgs_id := public.freshops_id('fgs');

  INSERT INTO public.finished_goods_stocks (
    id,
    organization_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    production_plan_id,
    production_plan_item_id,
    production_run_id,
    production_date,
    delivery_date,
    lot_no,
    lot_date,
    lot_date_offset_days,
    quantity_produced,
    quantity_remaining,
    unit,
    status,
    unit_cost,
    total_cost,
    note,
    is_deleted,
    is_demo
  )
  VALUES (
    v_fgs_id,
    v_org_id,
    v_ppi.product_id,
    v_ppi.customer_id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    v_ppi.production_plan_id,
    v_ppi.id,
    v_run_id,
    v_plan.production_date,
    (SELECT delivery_date FROM public.orders WHERE id = v_ppi.order_id),
    v_lot_no,
    v_lot_date,
    v_lot_offset,
    p_produced_quantity,
    p_produced_quantity,
    'adet',
    'Stokta',
    v_unit_cost,
    v_total_cost,
    'Üretim girişi - Run: ' || v_run_id,
    FALSE,
    FALSE
  );

  INSERT INTO public.finished_goods_movements (
    id,
    organization_id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    unit,
    movement_date,
    previous_quantity,
    new_quantity,
    difference,
    lot_no,
    note,
    is_shipment,
    is_deleted,
    is_demo
  )
  VALUES (
    public.freshops_id('fgm'),
    v_org_id,
    v_fgs_id,
    v_run_id,
    v_ppi.product_id,
    v_ppi.customer_id,
    v_ppi.order_id,
    v_ppi.order_item_id,
    'Üretim girişi',
    p_produced_quantity,
    'adet',
    v_plan.production_date,
    0,
    p_produced_quantity,
    p_produced_quantity,
    v_lot_no,
    'Üretim girişi - Run: ' || v_run_id,
    FALSE,
    FALSE,
    FALSE
  )
  RETURNING id INTO v_fgm_id;

  v_new_plan_item_produced := COALESCE(v_ppi.produced_quantity, 0) + p_produced_quantity;

  -- 11. Update Production Plan Items & Production Run & Plan Statuses
  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_plan_item_produced,
    status = CASE
      WHEN v_new_plan_item_produced >= planned_quantity THEN 'Tamamlandı'
      ELSE 'Kısmi Üretildi'
    END,
    raw_materials_deducted = TRUE,
    deducted_at = NOW(),
    deduction_movement_ids = v_movement_ids,
    finished_goods_created = TRUE,
    finished_goods_stock_id = v_fgs_id,
    estimated_total_cost = v_total_cost,
    unit_cost = v_unit_cost,
    updated_at = NOW()
  WHERE id = v_ppi.id;

  UPDATE public.production_runs
  SET
    unit_cost = v_unit_cost,
    total_cost = v_total_cost,
    raw_materials_deducted = TRUE,
    raw_material_movement_ids = v_movement_ids,
    finished_goods_created = TRUE,
    finished_goods_stock_id = v_fgs_id,
    updated_at = NOW()
  WHERE id = v_run_id;

  UPDATE public.production_plans
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = v_plan.id
          AND is_deleted = FALSE
          AND produced_quantity < planned_quantity
      )
      THEN 'Tamamlandı'
      ELSE 'Planlandı'
    END,
    updated_at = NOW()
  WHERE id = v_plan.id;

  -- Recompute Order status
  PERFORM public.recompute_order_status_atomic(v_ppi.order_id);

  RETURN JSONB_BUILD_OBJECT(
    'productionRunId', v_run_id,
    'finishedGoodsStockId', v_fgs_id,
    'lotNo', v_lot_no,
    'producedQuantity', p_produced_quantity,
    'unitCost', v_unit_cost,
    'totalCost', v_total_cost,
    'rawMaterialMovementIds', v_movement_ids,
    'rawMaterialLotAllocations', v_allocations_json_array
  );
END;
$$;


-- 17b. Legacy RPC compatibility wrapper: delegating to the lot allocations implementation
CREATE OR REPLACE FUNCTION public.create_production_run_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC,
  p_note TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.create_production_run_with_lots_atomic(
    p_production_plan_item_id,
    p_produced_quantity,
    p_note,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_production_run_with_lots_atomic(TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_run_with_lots_atomic(TEXT, NUMERIC, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_production_run_atomic(TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_run_atomic(TEXT, NUMERIC, TEXT) TO authenticated, service_role;
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.create_production_run_atomic(TEXT, NUMERIC, TEXT)
TO authenticated, service_role;


-- 18. CLOSE PRODUCTION PLAN AND CARRY OVER ATOMIC
CREATE OR REPLACE FUNCTION public.close_production_plan_and_carry_over_atomic(
  p_source_plan_id text,
  p_actions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_source_plan record;
  v_source_item record;
  v_action jsonb;

  v_action_type text;
  v_target_date date;
  v_resolved_target_date date;
  v_days_added integer;

  v_target_plan record;
  v_target_plan_id text;
  v_existing_target_item record;

  v_shortage numeric;
  v_has_shortage boolean := false;
  v_has_carryover boolean := false;
  v_source_already_added boolean := false;

  v_carry_source jsonb;
  v_target_plan_ids jsonb := '[]'::jsonb;
  v_result_items jsonb := '[]'::jsonb;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aktif organizasyon bulunamadı.';
  END IF;

  IF p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' THEN
    RAISE EXCEPTION 'p_actions bir JSON array olmalıdır.';
  END IF;

  /*
   * Kaynak planı transaction boyunca kilitle.
   * Aynı anda gelen ikinci kapatma isteği burada bekler.
   */
  SELECT *
  INTO v_source_plan
  FROM public.production_plans
  WHERE id = p_source_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Üretim planı bulunamadı veya erişim yetkisi yok.';
  END IF;

  /*
   * İdempotency:
   * Plan ilk istek tarafından kapanmışsa ikinci çağrı hiçbir devir yapmaz.
   */
  IF v_source_plan.status IN (
      'Tamamlandı',
      'Eksikle Kapatıldı',
      'İptal',
      'İptal Edildi'
    )
    OR v_source_plan.closed_at IS NOT NULL
    OR v_source_plan.completed_at IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyClosed', true,
      'sourcePlanId', v_source_plan.id,
      'status', v_source_plan.status,
      'carriedOverToPlanIds',
        COALESCE(v_source_plan.carried_over_to_plan_ids, '[]'::jsonb),
      'message', 'Plan daha önce kapatılmış. Tekrar işlem yapılmadı.'
    );
  END IF;

  /*
   * Her aktif kaynak plan kalemini DB üzerinden değerlendir.
   * Eksik miktar frontend'den alınmaz; DB'den hesaplanır.
   */
  FOR v_source_item IN
    SELECT *
    FROM public.production_plan_items
    WHERE production_plan_id = v_source_plan.id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, false) = false
      AND status NOT IN ('İptal', 'İptal Edildi')
    ORDER BY created_at
    FOR UPDATE
  LOOP
    v_shortage := GREATEST(
      COALESCE(v_source_item.planned_quantity, 0)
      - COALESCE(v_source_item.produced_quantity, 0),
      0
    );

    IF v_shortage <= 0 THEN
      CONTINUE;
    END IF;

    v_has_shortage := true;

    /*
     * Her eksik plan kalemi için frontend bir karar göndermeli.
     */
    v_action := NULL;

    SELECT action_item
    INTO v_action
    FROM jsonb_array_elements(p_actions) AS action_item
    WHERE action_item->>'plan_item_id' = v_source_item.id
    LIMIT 1;

    IF v_action IS NULL THEN
      RAISE EXCEPTION
        'Eksik plan kalemi için kapatma/devir seçimi bulunamadı. plan_item_id=%',
        v_source_item.id;
    END IF;

    v_action_type := LOWER(
      COALESCE(
        v_action->>'action',
        ''
      )
    );

    /*
     * Devretmeden kapatma.
     */
    IF v_action_type IN (
      'none',
      'close_without_carry',
      'devretmeden_kapat'
    ) THEN
      v_result_items := v_result_items || jsonb_build_array(
        jsonb_build_object(
          'sourcePlanItemId', v_source_item.id,
          'action', 'close_without_carry',
          'shortage', v_shortage
        )
      );

      CONTINUE;
    END IF;

    /*
     * Yarına veya özel tarihe devir.
     * Frontend target_date alanını kesin tarih olarak gönderir.
     */
    IF v_action_type NOT IN (
      'tomorrow',
      'custom',
      'carry'
    ) THEN
      RAISE EXCEPTION
        'Geçersiz kapatma aksiyonu: %. plan_item_id=%',
        v_action_type,
        v_source_item.id;
    END IF;

    IF NULLIF(v_action->>'target_date', '') IS NULL THEN
      RAISE EXCEPTION
        'Devir tarihi zorunludur. plan_item_id=%',
        v_source_item.id;
    END IF;

    BEGIN
      v_target_date := (v_action->>'target_date')::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION
        'Geçersiz devir tarihi. plan_item_id=%, target_date=%',
        v_source_item.id,
        v_action->>'target_date';
    END;

    IF v_target_date <= v_source_plan.production_date THEN
      RAISE EXCEPTION
        'Devir tarihi kaynak plan tarihinden sonra olmalıdır. plan_item_id=%',
        v_source_item.id;
    END IF;

    /*
     * Hedef tarih kapalıysa en fazla 30 gün ileri giderek
     * ilk açık plan gününü bul.
     */
    v_resolved_target_date := v_target_date;
    v_days_added := 0;
    v_target_plan_id := NULL;

    LOOP
      IF v_days_added >= 30 THEN
        RAISE EXCEPTION
          '30 gün içinde açık bir hedef üretim planı bulunamadı.';
      END IF;

      /*
       * Aynı organizasyon+tarih için eş zamanlı plan oluşturmayı önle.
       */
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          v_org_id::text || ':' || v_resolved_target_date::text,
          0
        )
      );

      SELECT *
      INTO v_target_plan
      FROM public.production_plans
      WHERE organization_id = v_org_id
        AND production_date = v_resolved_target_date
        AND COALESCE(is_deleted, false) = false
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        IF v_target_plan.status IN (
            'Tamamlandı',
            'Eksikle Kapatıldı',
            'İptal',
            'İptal Edildi'
          )
          OR v_target_plan.closed_at IS NOT NULL
          OR v_target_plan.completed_at IS NOT NULL
          OR COALESCE(v_target_plan.is_locked, false) = true
        THEN
          v_resolved_target_date := v_resolved_target_date + 1;
          v_days_added := v_days_added + 1;
          CONTINUE;
        END IF;

        v_target_plan_id := v_target_plan.id;
        EXIT;
      END IF;

      INSERT INTO public.production_plans (
        organization_id,
        production_date,
        status,
        note,
        closed_with_shortage,
        carried_over_to_plan_ids,
        is_locked,
        is_deleted,
        is_demo
      )
      VALUES (
        v_org_id,
        v_resolved_target_date,
        'Planlandı',
        to_char(v_resolved_target_date, 'DD.MM.YYYY')
          || ' Üretim Planı (Devir Üretim Dahil)',
        false,
        '[]'::jsonb,
        false,
        false,
        false
      )
      RETURNING *
      INTO v_target_plan;

      v_target_plan_id := v_target_plan.id;
      EXIT;
    END LOOP;

    v_has_carryover := true;

    /*
     * Hedef plan ID'sini sonuç listesine yalnızca bir kez ekle.
     */
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_target_plan_ids) AS x(value)
      WHERE x.value = v_target_plan_id
    ) THEN
      v_target_plan_ids :=
        v_target_plan_ids || jsonb_build_array(v_target_plan_id);
    END IF;

    /*
     * Aynı hedef planda aynı sipariş kalemi için aktif satırı kilitle.
     */
    SELECT *
    INTO v_existing_target_item
    FROM public.production_plan_items
    WHERE production_plan_id = v_target_plan_id
      AND organization_id = v_org_id
      AND order_item_id = v_source_item.order_item_id
      AND product_id = v_source_item.product_id
      AND COALESCE(is_deleted, false) = false
      AND status NOT IN ('İptal', 'İptal Edildi')
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    v_carry_source := jsonb_build_object(
      'planId', v_source_plan.id,
      'planItemId', v_source_item.id,
      'quantity', v_shortage,
      'date', v_source_plan.production_date
    );

    IF FOUND THEN
      /*
       * Aynı kaynak kalem bu hedef satıra daha önce eklenmiş mi?
       * CamelCase ve snake_case JSON anahtarlarını destekler.
       */
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(
            v_existing_target_item.carry_over_sources,
            '[]'::jsonb
          )
        ) AS src
        WHERE COALESCE(
          src->>'planItemId',
          src->>'plan_item_id'
        ) = v_source_item.id
      )
      INTO v_source_already_added;

      IF NOT v_source_already_added THEN
        UPDATE public.production_plan_items
        SET
          planned_quantity =
            COALESCE(planned_quantity, 0) + v_shortage,
          is_carry_over = true,
          carry_over_reason = 'Eksik üretim devri',
          carry_over_created_at =
            COALESCE(carry_over_created_at, now()),
          carry_over_quantity_total =
            COALESCE(carry_over_quantity_total, 0) + v_shortage,
          carry_over_sources =
            COALESCE(carry_over_sources, '[]'::jsonb)
            || jsonb_build_array(v_carry_source),
          updated_at = now()
        WHERE id = v_existing_target_item.id
          AND organization_id = v_org_id;
      END IF;

    ELSE
      INSERT INTO public.production_plan_items (
        organization_id,
        production_plan_id,
        order_id,
        order_item_id,
        customer_id,
        product_id,
        planned_quantity,
        produced_quantity,
        status,
        note,
        is_carry_over,
        source_carry_over_from_plan_id,
        source_carry_over_from_plan_item_id,
        carry_over_reason,
        carry_over_created_at,
        carry_over_quantity_total,
        carry_over_sources,
        is_locked,
        is_deleted,
        is_demo
      )
      VALUES (
        v_org_id,
        v_target_plan_id,
        v_source_item.order_id,
        v_source_item.order_item_id,
        v_source_item.customer_id,
        v_source_item.product_id,
        v_shortage,
        0,
        'Planlandı',
        COALESCE(v_source_item.note, ''),
        true,
        v_source_plan.id,
        v_source_item.id,
        'Eksik üretim devri',
        now(),
        v_shortage,
        jsonb_build_array(v_carry_source),
        false,
        false,
        false
      );
    END IF;

    v_result_items := v_result_items || jsonb_build_array(
      jsonb_build_object(
        'sourcePlanItemId', v_source_item.id,
        'action', 'carry',
        'shortage', v_shortage,
        'requestedTargetDate', v_target_date,
        'resolvedTargetDate', v_resolved_target_date,
        'targetPlanId', v_target_plan_id,
        'alreadyAdded', v_source_already_added
      )
    );
  END LOOP;

  /*
   * Kaynak plan kalemlerini kapat ve kilitle.
   */
  UPDATE public.production_plan_items
  SET
    status = CASE
      WHEN COALESCE(produced_quantity, 0)
        >= COALESCE(planned_quantity, 0)
      THEN 'Tamamlandı'
      ELSE 'Eksikle Kapatıldı'
    END,
    is_locked = true,
    locked_at = now(),
    locked_reason = 'Üretim planı kapatıldı',
    updated_at = now()
  WHERE production_plan_id = v_source_plan.id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
    AND status NOT IN ('İptal', 'İptal Edildi');

  /*
   * Kaynak planı tek transaction içinde kapat.
   */
  UPDATE public.production_plans
  SET
    status = CASE
      WHEN v_has_shortage
      THEN 'Eksikle Kapatıldı'
      ELSE 'Tamamlandı'
    END,

    completed_at = CASE
      WHEN v_has_shortage
      THEN NULL
      ELSE now()
    END,

    closed_at = CASE
      WHEN v_has_shortage
      THEN now()
      ELSE NULL
    END,

    closed_with_shortage = v_has_shortage,

    carried_over_to_plan_ids = (
      SELECT COALESCE(
        jsonb_agg(DISTINCT plan_id),
        '[]'::jsonb
      )
      FROM (
        SELECT value AS plan_id
        FROM jsonb_array_elements_text(
          COALESCE(
            v_source_plan.carried_over_to_plan_ids,
            '[]'::jsonb
          )
          || v_target_plan_ids
        )
      ) AS ids
    ),

    is_locked = true,
    locked_at = now(),
    locked_reason = 'Üretim planı kapatıldı',
    updated_at = now()
  WHERE id = v_source_plan.id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyClosed', false,
    'sourcePlanId', v_source_plan.id,
    'status',
      CASE
        WHEN v_has_shortage
        THEN 'Eksikle Kapatıldı'
        ELSE 'Tamamlandı'
      END,
    'hasShortage', v_has_shortage,
    'hasCarryover', v_has_carryover,
    'carriedOverToPlanIds', v_target_plan_ids,
    'items', v_result_items,
    'message',
      CASE
        WHEN v_has_carryover
        THEN 'Plan kapatıldı ve eksik üretimler devredildi.'
        WHEN v_has_shortage
        THEN 'Plan eksikle kapatıldı.'
        ELSE 'Plan tamamlandı ve kapatıldı.'
      END
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.close_production_plan_and_carry_over_atomic(TEXT, JSONB)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.close_production_plan_and_carry_over_atomic(TEXT, JSONB)
TO authenticated, service_role;


-- 19. UNDO PRODUCTION RUN ATOMIC (WITH LOT ALLOCATION REVERSAL INTEGRATION)
CREATE OR REPLACE FUNCTION public.undo_production_run_atomic(
  p_production_run_id TEXT,
  p_reason TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run RECORD;
  v_fgs RECORD;
  v_plan_item RECORD;
  v_reversal_stock_movement_ids JSONB := '[]'::JSONB;
  v_fgm_reversal_id TEXT;
  v_new_produced_quantity NUMERIC;
  v_realized_amount NUMERIC := 0;
  v_order_status TEXT;
  sm RECORD;
  rm RECORD;
  v_previous_stock NUMERIC;
  v_new_stock NUMERIC;
  v_stock_reversal_id TEXT;
  
  v_plan RECORD;

  -- Reversal details
  v_alloc_count INTEGER;
  v_processed_alloc_count INTEGER := 0;
  v_rm_id TEXT;
  r_alloc RECORD;
  v_reversed_allocations_json JSONB := '[]'::JSONB;
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- 1. Fetch & lock production run
  SELECT *
  INTO v_run
  FROM public.production_runs
  WHERE id = p_production_run_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production run not found or already reversed.';
  END IF;

  -- 2. Fetch & Lock the production plan
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_run.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  IF COALESCE(v_plan.is_locked, FALSE) = TRUE
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION 'Kapalı veya kilitli üretim planındaki üretim geri alınamaz.';
  END IF;

  -- Shipment Guard
  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_movements fgm
    WHERE fgm.production_run_id = v_run.id
      AND fgm.organization_id = v_org_id
      AND fgm.is_deleted = FALSE
      AND fgm.is_shipment = TRUE
      AND fgm.movement_type = 'Sevkiyat çıkışı'
  ) THEN
    RAISE EXCEPTION 'Production cannot be reversed while active shipments exist. Reverse shipments first.';
  END IF;

  -- Fetch & Lock Finished Goods Stock
  SELECT *
  INTO v_fgs
  FROM public.finished_goods_stocks
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished goods stock for this production run not found.';
  END IF;

  IF COALESCE(v_fgs.quantity_remaining, 0) <> COALESCE(v_fgs.quantity_produced, 0) THEN
    RAISE EXCEPTION 'Finished goods stock is not fully available. Reverse all shipments before reversing production.';
  END IF;

  -- Fetch & Lock Production Plan Item
  SELECT *
  INTO v_plan_item
  FROM public.production_plan_items
  WHERE id = v_run.production_plan_item_id
    AND organization_id = v_org_id
    AND is_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  IF COALESCE(v_plan_item.is_locked, FALSE) = TRUE
     OR LOWER(TRIM(COALESCE(v_plan_item.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Kapalı veya kilitli üretim planı kalemindeki üretim geri alınamaz.';
  END IF;

  -- 3. Find and check active allocations for this run (strictly fail if none)
  SELECT COUNT(*)
  INTO v_alloc_count
  FROM public.production_run_raw_material_lot_allocations
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_reversed = FALSE;

  IF v_alloc_count = 0 THEN
    RAISE EXCEPTION 'Bu üretime ait aktif lot tahsis (allocation) kaydı bulunamadı.';
  END IF;

  -- 3b. Verify allocation and stock movement integrity (Point 7)
  DECLARE
    v_sm_item RECORD;
    v_sum_allocated NUMERIC;
    v_mismatch_count INT;
  BEGIN
    -- Check 1 & 2: Loop through each active "Üretim Tüketimi" stock movement for this production run
    FOR v_sm_item IN
      SELECT *
      FROM public.stock_movements
      WHERE production_run_id = v_run.id
        AND organization_id = v_org_id
        AND is_deleted = FALSE
        AND movement_type = 'Üretim Tüketimi'
    LOOP
      -- Calculate sum of quantity_consumed for active allocations pointing to this stock movement
      SELECT COALESCE(SUM(quantity_consumed), 0)
      INTO v_sum_allocated
      FROM public.production_run_raw_material_lot_allocations
      WHERE stock_movement_id = v_sm_item.id
        AND organization_id = v_org_id
        AND is_reversed = FALSE;

      IF ABS(v_sum_allocated - v_sm_item.quantity) > 0.000000001 THEN
        RAISE EXCEPTION 'Bütünlük hatası: Stok hareketi miktarı ile lot allocation miktarları eşleşmiyor.';
      END IF;

      -- Check if any associated active allocation has mismatched raw_material_id or unit
      SELECT COUNT(*)
      INTO v_mismatch_count
      FROM public.production_run_raw_material_lot_allocations alloc
      WHERE alloc.stock_movement_id = v_sm_item.id
        AND alloc.organization_id = v_org_id
        AND alloc.is_reversed = FALSE
        AND (
          BTRIM(alloc.raw_material_id) <> BTRIM(v_sm_item.raw_material_id)
          OR LOWER(BTRIM(alloc.unit)) <> LOWER(BTRIM(v_sm_item.unit))
        );

      IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION 'Bütünlük hatası: Lot allocation hammadde veya birim bilgisi stok hareketiyle uyuşmuyor.';
      END IF;
    END LOOP;

    -- Check 3: Ensure all active allocations for this run point to an active 'Üretim Tüketimi' stock movement of this run
    SELECT COUNT(*)
    INTO v_mismatch_count
    FROM public.production_run_raw_material_lot_allocations alloc
    WHERE alloc.production_run_id = v_run.id
      AND alloc.organization_id = v_org_id
      AND alloc.is_reversed = FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM public.stock_movements sm_check
        WHERE sm_check.id = alloc.stock_movement_id
          AND sm_check.production_run_id = v_run.id
          AND sm_check.organization_id = v_org_id
          AND sm_check.is_deleted = FALSE
          AND sm_check.movement_type = 'Üretim Tüketimi'
      );

    IF v_mismatch_count > 0 THEN
      RAISE EXCEPTION 'Bütünlük hatası: Geçersiz veya kayıp stok hareketi referansına sahip lot allocation kaydı tespit edildi.';
    END IF;
  END;

  -- 4. Advisory lock on allocation raw materials in ascending order of raw_material_id
  FOR v_rm_id IN
    SELECT DISTINCT BTRIM(raw_material_id)
    FROM public.production_run_raw_material_lot_allocations
    WHERE production_run_id = v_run.id
      AND organization_id = v_org_id
      AND is_reversed = FALSE
    ORDER BY BTRIM(raw_material_id) ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_org_id::TEXT || ':raw-material-lot:' || v_rm_id,
        0
      )
    );
  END LOOP;

  -- 5. Lock and update lot rows in deterministic order to restore quantities
  v_processed_alloc_count := 0;

  FOR r_alloc IN
    SELECT 
      alloc.id AS alloc_id,
      alloc.raw_material_lot_id,
      alloc.quantity_consumed,
      rml.quantity_remaining,
      rml.quantity_received,
      rml.internal_lot_no
    FROM public.production_run_raw_material_lot_allocations alloc
    JOIN public.raw_material_lots rml ON BTRIM(rml.id) = BTRIM(alloc.raw_material_lot_id)
    JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
    WHERE alloc.production_run_id = v_run.id
      AND alloc.organization_id = v_org_id
      AND alloc.is_reversed = FALSE
      AND rml.organization_id = v_org_id
      AND rmr.organization_id = v_org_id
    ORDER BY 
      rmr.receipt_date ASC,
      rml.created_at ASC,
      rml.id ASC
    FOR UPDATE OF rml
  LOOP
    v_processed_alloc_count := v_processed_alloc_count + 1;

    -- Ensure received capacity limits are not violated
    IF r_alloc.quantity_remaining + r_alloc.quantity_consumed > r_alloc.quantity_received THEN
      RAISE EXCEPTION 'Lot miktarı geri yüklenemedi. Lot limitleri aşılıyor. Lot: %, Mevcut Kalan: %, Geri Yüklenen: %, Giriş Miktarı: %',
        r_alloc.internal_lot_no, r_alloc.quantity_remaining, r_alloc.quantity_consumed, r_alloc.quantity_received;
    END IF;

    -- Update raw material lot
    UPDATE public.raw_material_lots
    SET
      quantity_remaining = quantity_remaining + r_alloc.quantity_consumed,
      updated_at = NOW()
    WHERE id = r_alloc.raw_material_lot_id
      AND organization_id = v_org_id
      AND (quantity_remaining + r_alloc.quantity_consumed <= quantity_received);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lot miktarı geri yüklenemedi. Lot limitleri aşılıyor veya satır bulunamadı. Lot ID: %', r_alloc.raw_material_lot_id;
    END IF;

    v_reversed_allocations_json := v_reversed_allocations_json || JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'allocationId', r_alloc.alloc_id,
        'rawMaterialLotId', r_alloc.raw_material_lot_id,
        'internalLotNo', r_alloc.internal_lot_no,
        'quantityRestored', r_alloc.quantity_consumed
      )
    );
  END LOOP;

  -- Verify processed count
  IF v_processed_alloc_count <> v_alloc_count THEN
    RAISE EXCEPTION 'Geri yüklenecek lot tahsis kayıt sayısı uyuşmuyor. Beklenen: %, İşlenen: %',
      v_alloc_count, v_processed_alloc_count;
  END IF;

  -- 6. Mark allocations as reversed (do not delete)
  UPDATE public.production_run_raw_material_lot_allocations
  SET
    is_reversed = TRUE,
    reversed_at = NOW(),
    reversal_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = NOW()
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_reversed = FALSE;

  -- Hammadde tüketimlerini geri iade hareketiyle dengele (retained exactly)
  FOR sm IN
    SELECT *
    FROM public.stock_movements
    WHERE production_run_id = v_run.id
      AND organization_id = v_org_id
      AND is_deleted = false
      AND movement_type = 'Üretim Tüketimi'
    ORDER BY created_at ASC
  LOOP
    SELECT *
    INTO rm
    FROM public.raw_materials
    WHERE id = sm.raw_material_id
      AND organization_id = v_org_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Raw material not found for movement %', sm.id;
    END IF;

    v_previous_stock := COALESCE(rm.current_stock, 0);
    v_new_stock := v_previous_stock + COALESCE(sm.quantity, 0);
    v_stock_reversal_id := public.freshops_id('sm');

    INSERT INTO public.stock_movements (
      id,
      organization_id,
      raw_material_id,
      movement_type,
      movement_date,
      quantity,
      unit,
      previous_stock,
      new_stock,
      difference,
      production_run_id,
      order_id,
      order_item_id,
      source_type,
      source_id,
      note,
      is_deleted,
      is_demo
    )
    VALUES (
      v_stock_reversal_id,
      v_org_id,
      sm.raw_material_id,
      'Üretim Geri Alma',
      CURRENT_DATE,
      sm.quantity,
      sm.unit,
      v_previous_stock,
      v_new_stock,
      sm.quantity,
      v_run.id,
      v_run.order_id,
      v_run.order_item_id,
      'production_run_reversal',
      v_run.id,
      COALESCE(p_reason, 'Üretim geri alındı'),
      FALSE,
      FALSE
    );

    v_reversal_stock_movement_ids :=
      v_reversal_stock_movement_ids || to_jsonb(v_stock_reversal_id);
  END LOOP;

  -- Mamul stoktan üretimi geri al
  v_fgm_reversal_id := public.freshops_id('fgm');

  INSERT INTO public.finished_goods_movements (
    id,
    organization_id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    unit,
    movement_date,
    previous_quantity,
    new_quantity,
    difference,
    lot_no,
    reason,
    note,
    is_shipment,
    is_deleted,
    is_demo
  )
  VALUES (
    v_fgm_reversal_id,
    v_org_id,
    v_fgs.id,
    v_run.id,
    v_run.product_id,
    v_run.customer_id,
    v_run.order_id,
    v_run.order_item_id,
    'Üretim Geri Alma',
    v_fgs.quantity_remaining,
    v_fgs.unit,
    CURRENT_DATE,
    v_fgs.quantity_remaining,
    0,
    -v_fgs.quantity_remaining,
    v_fgs.lot_no,
    'Üretim geri alma',
    COALESCE(p_reason, 'Üretim geri alındı'),
    false,
    false,
    false
  );

  UPDATE public.finished_goods_stocks
  SET
    quantity_remaining = 0,
    is_deleted = true,
    deleted_at = now(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = now()
  WHERE id = v_fgs.id;

  UPDATE public.production_runs
  SET
    status = 'Üretim Geri Alındı',
    raw_materials_deducted = false,
    finished_goods_created = false,
    is_deleted = true,
    deleted_at = now(),
    deleted_reason = COALESCE(p_reason, 'Üretim geri alındı'),
    updated_at = now()
  WHERE id = v_run.id;

  v_new_produced_quantity := GREATEST(
    COALESCE(v_plan_item.produced_quantity, 0)
    - COALESCE(v_run.produced_quantity, 0),
    0
  );

  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_produced_quantity,
    status = CASE
      WHEN v_new_produced_quantity <= 0 THEN 'Planlandı'
      WHEN v_new_produced_quantity < planned_quantity THEN 'Kısmi Üretildi'
      ELSE 'Tamamlandı'
    END,
    raw_materials_deducted = false,
    deducted_at = NULL,
    deduction_movement_ids = NULL,
    finished_goods_created = false,
    finished_goods_stock_id = NULL,
    updated_at = now()
  WHERE id = v_plan_item.id;

  UPDATE public.production_plans pp
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = false
          AND COALESCE(ppi.produced_quantity, 0) > 0
      ) THEN 'Planlandı'
      WHEN EXISTS (
        SELECT 1
        FROM public.production_plan_items ppi
        WHERE ppi.production_plan_id = pp.id
          AND ppi.organization_id = v_org_id
          AND ppi.is_deleted = false
          AND COALESCE(ppi.produced_quantity, 0)
            < COALESCE(ppi.planned_quantity, 0)
      ) THEN 'Kısmi Üretildi'
      ELSE 'Tamamlandı'
    END,
    completed_at = NULL,
    closed_at = NULL,
    closed_with_shortage = false,
    updated_at = now()
  WHERE pp.id = v_run.production_plan_id
    AND pp.organization_id = v_org_id;

  -- Sipariş tutarı aktif sevkiyata göre tekrar hesaplanır
  SELECT COALESCE(SUM(fgm.quantity * oi.unit_sale_price), 0)
  INTO v_realized_amount
  FROM public.finished_goods_movements fgm
  JOIN public.order_items oi
    ON oi.id = fgm.order_item_id
  WHERE fgm.order_id = v_run.order_id
    AND fgm.organization_id = v_org_id
    AND fgm.is_shipment = true
    AND fgm.is_deleted = false
    AND fgm.movement_type = 'Sevkiyat çıkışı'
    AND oi.is_deleted = false;

  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_stocks fgs
    WHERE fgs.order_id = v_run.order_id
      AND fgs.organization_id = v_org_id
      AND fgs.is_deleted = false
      AND COALESCE(fgs.quantity_remaining, 0) > 0
  ) THEN
    v_order_status := 'Sevkiyata Hazır';
  ELSIF EXISTS (
    SELECT 1
    FROM public.production_plan_items ppi
    WHERE ppi.order_id = v_run.order_id
      AND ppi.organization_id = v_org_id
      AND ppi.is_deleted = false
  ) THEN
    v_order_status := 'Üretim Planlandı';
  ELSE
    v_order_status := 'Onaylandı';
  END IF;

  UPDATE public.orders
  SET
    realized_amount = v_realized_amount,
    status = v_order_status,
    computed_status = v_order_status,
    updated_at = now()
  WHERE id = v_run.order_id
    AND organization_id = v_org_id;

  -- Recalculate raw material stocks securely
  PERFORM public.recalculate_raw_material_stocks();

  RETURN JSONB_BUILD_OBJECT(
    'productionRunId', v_run.id,
    'finishedGoodsStockId', v_fgs.id,
    'finishedGoodsReversalMovementId', v_fgm_reversal_id,
    'rawMaterialReversalMovementIds', v_reversal_stock_movement_ids,
    'newProducedQuantity', v_new_produced_quantity,
    'orderStatus', v_order_status,
    'realizedAmount', v_realized_amount,
    'reversedRawMaterialLotAllocations', v_reversed_allocations_json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_production_run_atomic(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_production_run_atomic(TEXT, TEXT) TO authenticated, service_role;


-- 17. SHIP FINISHED GOODS ATOMIC RPC
CREATE OR REPLACE FUNCTION ship_finished_goods_atomic(
  p_finished_goods_stock_id TEXT,
  p_ship_quantity NUMERIC,
  p_note TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock RECORD;
  v_order_item RECORD;
  v_order RECORD;
  v_actual_ship_qty NUMERIC;
  v_new_remaining NUMERIC;
  v_new_stock_status TEXT;
  v_new_movement_id TEXT;
  v_order_item_unit_price NUMERIC;
  v_realized_amount_diff NUMERIC;
  v_new_realized_amount NUMERIC;
BEGIN
  -- 1. Get the stock row
  SELECT * INTO v_stock
  FROM finished_goods_stocks
  WHERE id = p_finished_goods_stock_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nihai ürün stoğu bulunamadı.'
    );
  END IF;

  -- 2. Determine actual ship quantity
  v_actual_ship_qty := LEAST(p_ship_quantity, v_stock.quantity_remaining);
  IF v_actual_ship_qty <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Gönderilecek miktar geçersiz veya stok kalmadı.'
    );
  END IF;

  -- 3. Calculate new remaining quantity and stock status
  v_new_remaining := v_stock.quantity_remaining - v_actual_ship_qty;
  IF v_new_remaining = 0 THEN
    v_new_stock_status := 'Sevk Edildi';
  ELSE
    v_new_stock_status := 'Kısmi Sevk';
  END IF;

  -- 4. Update finished goods stocks
  UPDATE finished_goods_stocks
  SET quantity_remaining = v_new_remaining,
      status = v_new_stock_status,
      updated_at = NOW()
  WHERE id = p_finished_goods_stock_id;

  -- 5. Insert shipment movement using real columns (NO 'type' or 'date')
  v_new_movement_id := 'fgm_' || encode(gen_random_bytes(6), 'hex');
  INSERT INTO finished_goods_movements (
    id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    movement_date,
    note,
    is_deleted,
    is_shipment,
    previous_quantity,
    new_quantity,
    difference,
    created_at,
    updated_at
  ) VALUES (
    v_new_movement_id,
    p_finished_goods_stock_id,
    v_stock.production_run_id,
    v_stock.product_id,
    v_stock.customer_id,
    v_stock.order_id,
    v_stock.order_item_id,
    'Sevkiyat çıkışı',
    v_actual_ship_qty,
    CURRENT_DATE::TEXT,
    COALESCE(p_note, 'Sevkiyat Çıkışı'),
    FALSE,
    TRUE,
    v_stock.quantity_remaining,
    v_new_remaining,
    -v_actual_ship_qty,
    NOW(),
    NOW()
  );

  -- 6. Update orders if order_id is present
  IF v_stock.order_id IS NOT NULL THEN
    -- Fetch order item unit price
    SELECT * INTO v_order_item
    FROM order_items
    WHERE id = v_stock.order_item_id;

    IF FOUND THEN
      v_order_item_unit_price := COALESCE(v_order_item.unit_sale_price, 0);
      v_realized_amount_diff := v_actual_ship_qty * v_order_item_unit_price;
      
      -- Fetch order
      SELECT * INTO v_order
      FROM orders
      WHERE id = v_stock.order_id;

      IF FOUND THEN
        v_new_realized_amount := COALESCE(v_order.realized_amount, 0) + v_realized_amount_diff;

        -- Update order realized amount
        UPDATE orders
        SET realized_amount = v_new_realized_amount,
            updated_at = NOW()
        WHERE id = v_stock.order_id;

        -- Call central recompute status
        PERFORM recompute_order_status_atomic(v_stock.order_id);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'movement_id', v_new_movement_id,
    'actual_quantity', v_actual_ship_qty,
    'remaining_quantity', v_new_remaining
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ship_finished_goods_atomic(TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION ship_finished_goods_atomic(TEXT, NUMERIC, TEXT) TO service_role;


-- 18. UNDO FINISHED GOODS SHIPMENT ATOMIC RPC
CREATE OR REPLACE FUNCTION undo_finished_goods_shipment_atomic(
  p_finished_goods_movement_id TEXT,
  p_reason TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement RECORD;
  v_stock RECORD;
  v_order_item RECORD;
  v_order RECORD;
  v_undo_movement_id TEXT;
  v_new_remaining NUMERIC;
  v_new_stock_status TEXT;
  v_order_item_unit_price NUMERIC;
  v_realized_amount_diff NUMERIC;
  v_new_realized_amount NUMERIC;
BEGIN
  -- 1. Get the movement row
  SELECT * INTO v_movement
  FROM finished_goods_movements
  WHERE id = p_finished_goods_movement_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Sevkiyat hareketi bulunamadı.'
    );
  END IF;

  IF v_movement.is_deleted = TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu sevkiyat hareketi zaten iptal edilmiş.'
    );
  END IF;

  -- 2. Get the stock row
  SELECT * INTO v_stock
  FROM finished_goods_stocks
  WHERE id = v_movement.finished_goods_stock_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Nihai ürün stoğu bulunamadı.'
    );
  END IF;

  -- 3. Mark the movement as deleted
  UPDATE finished_goods_movements
  SET is_deleted = TRUE,
      deleted_at = NOW(),
      deleted_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_finished_goods_movement_id;

  -- 4. Insert reverse Sayım düzeltmesi movement using real columns (NO 'type' or 'date')
  v_undo_movement_id := 'fgm_' || encode(gen_random_bytes(6), 'hex');
  v_new_remaining := v_stock.quantity_remaining + v_movement.quantity;

  INSERT INTO finished_goods_movements (
    id,
    finished_goods_stock_id,
    production_run_id,
    product_id,
    customer_id,
    order_id,
    order_item_id,
    movement_type,
    quantity,
    movement_date,
    note,
    is_deleted,
    is_shipment,
    previous_quantity,
    new_quantity,
    difference,
    created_at,
    updated_at
  ) VALUES (
    v_undo_movement_id,
    v_stock.id,
    v_stock.production_run_id,
    v_stock.product_id,
    v_stock.customer_id,
    v_stock.order_id,
    v_stock.order_item_id,
    'Sayım düzeltmesi',
    v_movement.quantity,
    CURRENT_DATE::TEXT,
    COALESCE(p_reason, 'Sevkiyat Geri Alındı'),
    FALSE,
    FALSE,
    v_stock.quantity_remaining,
    v_new_remaining,
    v_movement.quantity,
    NOW(),
    NOW()
  );

  -- 5. Calculate new stock remaining quantity and status
  IF v_new_remaining = 0 THEN
    v_new_stock_status := 'Sevk Edildi';
  ELSIF v_new_remaining > 0 AND v_new_remaining < v_stock.quantity_produced THEN
    v_new_stock_status := 'Kısmi Sevk';
  ELSE
    v_new_stock_status := 'Stokta';
  END IF;

  -- 6. Update finished goods stock
  UPDATE finished_goods_stocks
  SET quantity_remaining = v_new_remaining,
      status = v_new_stock_status,
      updated_at = NOW()
  WHERE id = v_stock.id;

  -- 7. Update orders if order_id is present
  IF v_stock.order_id IS NOT NULL THEN
    -- Fetch order item unit price
    SELECT * INTO v_order_item
    FROM order_items
    WHERE id = v_stock.order_item_id;

    IF FOUND THEN
      v_order_item_unit_price := COALESCE(v_order_item.unit_sale_price, 0);
      v_realized_amount_diff := v_movement.quantity * v_order_item_unit_price;

      -- Fetch order
      SELECT * INTO v_order
      FROM orders
      WHERE id = v_stock.order_id;

      IF FOUND THEN
        -- Subtract the amount, keeping it non-negative
        v_new_realized_amount := GREATEST(0, COALESCE(v_order.realized_amount, 0) - v_realized_amount_diff);

        -- Update order realized amount
        UPDATE orders
        SET realized_amount = v_new_realized_amount,
            updated_at = NOW()
        WHERE id = v_stock.order_id;

        -- Call central recompute status
        PERFORM recompute_order_status_atomic(v_stock.order_id);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'undo_movement_id', v_undo_movement_id,
    'new_remaining_quantity', v_new_remaining
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION undo_finished_goods_shipment_atomic(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION undo_finished_goods_shipment_atomic(TEXT, TEXT) TO service_role;


-- ============================================================================
-- FreshOps Core Read-Only Traceability RPC Layer (Phase 1C-A)
-- ============================================================================

-- 1. Production Run Traceability RPC
CREATE OR REPLACE FUNCTION public.get_production_run_traceability_atomic(
  p_production_run_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run_id TEXT;
  v_finished_goods_stock_id TEXT;
  v_run_json JSONB;
  v_fgs_json JSONB;
  v_order_json JSONB;
  v_product_json JSONB;
  v_allocations_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify production run existence and ownership (is_deleted can be true/false for history)
  SELECT
    pr.id,
    pr.finished_goods_stock_id
  INTO
    v_run_id,
    v_finished_goods_stock_id
  FROM public.production_runs pr
  WHERE pr.id = p_production_run_id
    AND pr.organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Üretim kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build productionRun object
  SELECT jsonb_build_object(
    'id', pr.id,
    'status', pr.status,
    'producedQuantity', pr.produced_quantity,
    'productionPlanId', pr.production_plan_id,
    'productionPlanItemId', pr.production_plan_item_id,
    'orderId', pr.order_id,
    'orderItemId', pr.order_item_id,
    'productId', pr.product_id,
    'customerId', pr.customer_id,
    'isDeleted', pr.is_deleted,
    'deletedAt', pr.deleted_at,
    'deletedReason', pr.deleted_reason,
    'createdAt', pr.created_at
  )
  INTO v_run_json
  FROM public.production_runs pr
  WHERE pr.id = p_production_run_id AND pr.organization_id = v_org_id;

  -- Build finishedGoodsStock object (can be NULL if not found)
  SELECT jsonb_build_object(
    'id', fgs.id,
    'lotNo', fgs.lot_no,
    'quantityProduced', fgs.quantity_produced,
    'quantityRemaining', fgs.quantity_remaining,
    'unit', fgs.unit,
    'status', fgs.status,
    'isDeleted', fgs.is_deleted,
    'deletedAt', fgs.deleted_at,
    'deletedReason', fgs.deleted_reason
  )
  INTO v_fgs_json
  FROM public.finished_goods_stocks fgs
  WHERE fgs.organization_id = v_org_id
    AND (
      (
        v_finished_goods_stock_id IS NOT NULL
        AND fgs.id = v_finished_goods_stock_id
      )
      OR
      (
        v_finished_goods_stock_id IS NULL
        AND fgs.production_run_id = p_production_run_id
      )
    )
  ORDER BY
    CASE
      WHEN fgs.id = v_finished_goods_stock_id THEN 0
      ELSE 1
    END,
    fgs.created_at DESC,
    fgs.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_fgs_json := NULL;
  END IF;

  -- Build order object (can be NULL if not found or order_id is NULL)
  SELECT jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'status', o.status,
    'computedStatus', o.computed_status
  )
  INTO v_order_json
  FROM public.orders o
  WHERE o.id = (SELECT order_id FROM public.production_runs WHERE id = p_production_run_id AND organization_id = v_org_id)
    AND o.organization_id = v_org_id;

  IF NOT FOUND THEN
    v_order_json := NULL;
  END IF;

  -- Build product object (can be NULL if not found)
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name
  )
  INTO v_product_json
  FROM public.products p
  WHERE p.id = (SELECT product_id FROM public.production_runs WHERE id = p_production_run_id AND organization_id = v_org_id)
    AND p.organization_id = v_org_id;

  IF NOT FOUND THEN
    v_product_json := NULL;
  END IF;

  -- Build allocations list with deterministic order
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'allocationId', alloc.id,
      'allocationMethod', alloc.allocation_method,
      'quantityConsumed', alloc.quantity_consumed,
      'unit', alloc.unit,
      'isReversed', alloc.is_reversed,
      'reversedAt', alloc.reversed_at,
      'reversalReason', alloc.reversal_reason,

      'rawMaterial', jsonb_build_object(
        'id', rm.id,
        'name', rm.name,
        'unit', rm.unit
      ),

      'rawMaterialLot', jsonb_build_object(
        'id', rml.id,
        'internalLotNo', rml.internal_lot_no,
        'kunyeNumber', rml.kunye_number,
        'kunyeStatus', rml.kunye_status,
        'quantityReceived', rml.quantity_received,
        'quantityRemaining', rml.quantity_remaining,
        'unit', rml.unit,
        'unitPrice', rml.unit_price,
        'isDeleted', rml.is_deleted
      ),

      'receipt', jsonb_build_object(
        'id', rmr.id,
        'receiptDate', rmr.receipt_date::TEXT,
        'invoiceNumber', rmr.invoice_number,
        'dispatchNoteNumber', rmr.dispatch_note_number,
        'note', rmr.note,
        'isDeleted', rmr.is_deleted
      ),

      'supplier', jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'note', s.note,
        'isActive', s.is_active,
        'isDeleted', s.is_deleted
      ),

      'stockMovement', jsonb_build_object(
        'id', sm.id,
        'movementType', sm.movement_type,
        'movementDate', sm.movement_date::TEXT,
        'quantity', sm.quantity,
        'isDeleted', sm.is_deleted
      )
    )
    ORDER BY 
      rm.name ASC,
      rmr.receipt_date ASC,
      rml.created_at ASC,
      alloc.id ASC
  ), '[]'::jsonb)
  INTO v_allocations_json
  FROM public.production_run_raw_material_lot_allocations alloc
  JOIN public.raw_materials rm ON rm.id = alloc.raw_material_id AND rm.organization_id = v_org_id
  JOIN public.raw_material_lots rml ON rml.id = alloc.raw_material_lot_id AND rml.organization_id = v_org_id
  JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id AND rmr.organization_id = v_org_id
  JOIN public.suppliers s ON s.id = rmr.supplier_id AND s.organization_id = v_org_id
  JOIN public.stock_movements sm ON sm.id = alloc.stock_movement_id AND sm.organization_id = v_org_id
  WHERE alloc.production_run_id = p_production_run_id
    AND alloc.organization_id = v_org_id;

  -- Combine into final canonical response
  RETURN jsonb_build_object(
    'success', TRUE,
    'productionRun', v_run_json,
    'finishedGoodsStock', v_fgs_json,
    'order', v_order_json,
    'product', v_product_json,
    'allocations', v_allocations_json
  );
END;
$$;


-- 2. Finished Goods Stock Traceability RPC
CREATE OR REPLACE FUNCTION public.get_finished_goods_traceability_atomic(
  p_finished_goods_stock_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_run_id TEXT;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Find and validate finished goods stock (allow historical is_deleted tracing)
  SELECT production_run_id
  INTO v_run_id
  FROM public.finished_goods_stocks
  WHERE id = p_finished_goods_stock_id 
    AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nihai ürün stok kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  IF v_run_id IS NULL OR TRIM(v_run_id) = '' THEN
    RAISE EXCEPTION 'Nihai ürün stok kaydı bir üretim kaydı ile ilişkili değil.';
  END IF;

  -- Delegate to production run traceability
  RETURN public.get_production_run_traceability_atomic(v_run_id);
END;
$$;


-- 3. Security Permissions (GRANTS & REVOKES)
REVOKE ALL ON FUNCTION public.get_production_run_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_production_run_traceability_atomic(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_finished_goods_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_finished_goods_traceability_atomic(TEXT) TO authenticated, service_role;


-- ============================================================================
-- FreshOps Order and Supplier Read-Only Traceability RPC Layer (Phase 1C-B)
-- ============================================================================

-- 1. Order Traceability RPC
CREATE OR REPLACE FUNCTION public.get_order_traceability_atomic(
  p_order_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_order_json JSONB;
  v_customer_json JSONB;
  v_order_items_json JSONB;
  v_production_runs_json JSONB;
  v_shipment_movements_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify order existence and ownership (allow historical is_deleted tracing)
  PERFORM 1
  FROM public.orders
  WHERE id = p_order_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sipariş kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build order object (removed nested customer object, added customerId)
  SELECT jsonb_build_object(
    'id', o.id,
    'customerId', o.customer_id,
    'orderNumber', o.order_number,
    'orderDate', o.order_date,
    'deliveryDate', o.delivery_date,
    'status', o.status,
    'computedStatus', o.computed_status,
    'approvalStatus', o.approval_status,
    'totalAmount', o.total_amount,
    'realizedAmount', o.realized_amount,
    'note', o.note,
    'isDeleted', o.is_deleted
  )
  INTO v_order_json
  FROM public.orders o
  WHERE o.id = p_order_id AND o.organization_id = v_org_id;

  -- Build top-level customer object separately (returns NULL if not found)
  SELECT CASE
    WHEN c.id IS NOT NULL THEN jsonb_build_object(
      'id', c.id,
      'name', c.name
    )
    ELSE NULL
  END
  INTO v_customer_json
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = v_org_id
  WHERE o.id = p_order_id AND o.organization_id = v_org_id;

  -- Build order items array (sorted deterministically, left join products to keep historical rows)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'orderId', oi.order_id,
      'productId', oi.product_id,
      'productName', p.name,
      'orderedQuantity', oi.quantity,
      'unitSalePrice', oi.unit_sale_price,
      'isDeleted', COALESCE(oi.is_deleted, FALSE)
    )
    ORDER BY oi.id ASC
  ), '[]'::jsonb)
  INTO v_order_items_json
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id AND p.organization_id = v_org_id
  WHERE oi.order_id = p_order_id
    AND oi.organization_id = v_org_id;

  -- Build production runs array using the canonical Phase 1C-A function (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    public.get_production_run_traceability_atomic(pr.id)
    ORDER BY pr.created_at ASC, pr.id ASC
  ), '[]'::jsonb)
  INTO v_production_runs_json
  FROM public.production_runs pr
  WHERE pr.order_id = p_order_id
    AND pr.organization_id = v_org_id;

  -- Build shipment movements array (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', fgm.id,
      'finishedGoodsStockId', fgm.finished_goods_stock_id,
      'productionRunId', fgm.production_run_id,
      'orderId', fgm.order_id,
      'orderItemId', fgm.order_item_id,
      'productId', fgm.product_id,
      'productName', p.name,
      'finishedGoodsLotNo', fgs.lot_no,
      'movementType', fgm.movement_type,
      'quantity', fgm.quantity,
      'unit', fgm.unit,
      'movementDate', fgm.movement_date::TEXT,
      'previousQuantity', fgm.previous_quantity,
      'newQuantity', fgm.new_quantity,
      'difference', fgm.difference,
      'isShipment', fgm.is_shipment,
      'isDeleted', fgm.is_deleted,
      'deletedAt', fgm.deleted_at,
      'deletedReason', fgm.deleted_reason,
      'note', fgm.note,
      'createdAt', fgm.created_at
    )
    ORDER BY fgm.created_at ASC, fgm.id ASC
  ), '[]'::jsonb)
  INTO v_shipment_movements_json
  FROM public.finished_goods_movements fgm
  LEFT JOIN public.finished_goods_stocks fgs ON fgs.id = fgm.finished_goods_stock_id AND fgs.organization_id = v_org_id
  LEFT JOIN public.products p ON p.id = fgm.product_id AND p.organization_id = v_org_id
  WHERE fgm.order_id = p_order_id
    AND fgm.organization_id = v_org_id
    AND fgm.movement_type IN ('Sevkiyat çıkışı', 'Sevkiyat Geri Alma');

  -- Combine into final canonical order traceability response
  RETURN jsonb_build_object(
    'success', TRUE,
    'order', v_order_json,
    'customer', v_customer_json,
    'orderItems', v_order_items_json,
    'productionRuns', v_production_runs_json,
    'shipmentMovements', v_shipment_movements_json
  );
END;
$$;


-- 2. Supplier Traceability RPC
CREATE OR REPLACE FUNCTION public.get_supplier_traceability_atomic(
  p_supplier_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_supplier_json JSONB;
  v_receipts_json JSONB;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Verify supplier existence and ownership (allow historical / inactive / soft-deleted)
  PERFORM 1
  FROM public.suppliers
  WHERE id = p_supplier_id AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tedarikçi kaydı bulunamadı veya bu işleme yetkiniz yok.';
  END IF;

  -- Build supplier object
  SELECT jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'note', s.note,
    'isActive', s.is_active,
    'isDeleted', s.is_deleted
  )
  INTO v_supplier_json
  FROM public.suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id;

  -- Build nested receipts array with its lots and production usages (sorted deterministically)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', rmr.id,
      'supplierId', rmr.supplier_id,
      'receiptDate', rmr.receipt_date::TEXT,
      'invoiceNumber', rmr.invoice_number,
      'dispatchNoteNumber', rmr.dispatch_note_number,
      'note', rmr.note,
      'idempotencyKey', rmr.idempotency_key,
      'isDeleted', rmr.is_deleted,
      'createdAt', rmr.created_at,
      'lots', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', rml.id,
            'internalLotNo', rml.internal_lot_no,
            'kunyeNumber', rml.kunye_number,
            'kunyeStatus', rml.kunye_status,
            'quantityReceived', rml.quantity_received,
            'quantityRemaining', rml.quantity_remaining,
            'unit', rml.unit,
            'unitPrice', rml.unit_price,
            'note', rml.note,
            'inboundStockMovementId', rml.inbound_stock_movement_id,
            'isDeleted', rml.is_deleted,
            'createdAt', rml.created_at,
            'rawMaterial', jsonb_build_object(
              'id', rm.id,
              'name', rm.name,
              'unit', rm.unit
            ),
            'inboundStockMovement', jsonb_build_object(
              'id', sm.id,
              'movementType', sm.movement_type,
              'movementDate', sm.movement_date::TEXT,
              'quantity', sm.quantity,
              'isDeleted', sm.is_deleted,
              'previousStock', sm.previous_stock,
              'newStock', sm.new_stock,
              'unitPrice', sm.unit_price
            ),
            'productionUsages', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'allocationId', alloc.id,
                  'allocationMethod', alloc.allocation_method,
                  'productionRunId', alloc.production_run_id,
                  'quantityConsumed', alloc.quantity_consumed,
                  'unit', alloc.unit,
                  'isReversed', alloc.is_reversed,
                  'reversedAt', alloc.reversed_at,
                  'reversalReason', alloc.reversal_reason,
                  'createdAt', alloc.created_at,
                  'productionRun', jsonb_build_object(
                    'id', pr.id,
                    'status', pr.status,
                    'producedQuantity', pr.produced_quantity,
                    'productionDate', pr.production_date,
                    'isDeleted', pr.is_deleted,
                    'deletedAt', pr.deleted_at,
                    'deletedReason', pr.deleted_reason,
                    'createdAt', pr.created_at
                  ),
                  'finishedGoodsStock', CASE
                    WHEN fgs.id IS NOT NULL THEN jsonb_build_object(
                      'id', fgs.id,
                      'lotNo', fgs.lot_no,
                      'quantityProduced', fgs.quantity_produced,
                      'quantityRemaining', fgs.quantity_remaining,
                      'unit', fgs.unit,
                      'status', fgs.status,
                      'isDeleted', fgs.is_deleted
                    )
                    ELSE NULL
                  END,
                  'order', CASE
                    WHEN o.id IS NOT NULL THEN jsonb_build_object(
                      'id', o.id,
                      'orderNumber', o.order_number,
                      'status', o.status,
                      'computedStatus', o.computed_status
                    )
                    ELSE NULL
                  END,
                  'customer', CASE
                    WHEN c.id IS NOT NULL THEN jsonb_build_object(
                      'id', c.id,
                      'name', c.name
                    )
                    ELSE NULL
                  END,
                  'product', CASE
                    WHEN p.id IS NOT NULL THEN jsonb_build_object(
                      'id', p.id,
                      'name', p.name
                    )
                    ELSE NULL
                  END
                )
                ORDER BY
                  pr.created_at DESC,
                  alloc.created_at DESC,
                  alloc.id DESC
              ), '[]'::jsonb)
              FROM public.production_run_raw_material_lot_allocations alloc
              JOIN public.production_runs pr ON pr.id = alloc.production_run_id AND pr.organization_id = v_org_id
              LEFT JOIN LATERAL (
                SELECT fgs_candidate.*
                FROM public.finished_goods_stocks fgs_candidate
                WHERE fgs_candidate.organization_id = v_org_id
                  AND (
                    (
                      pr.finished_goods_stock_id IS NOT NULL
                      AND fgs_candidate.id = pr.finished_goods_stock_id
                    )
                    OR
                    (
                      pr.finished_goods_stock_id IS NULL
                      AND fgs_candidate.production_run_id = pr.id
                    )
                  )
                ORDER BY
                  CASE
                    WHEN fgs_candidate.id = pr.finished_goods_stock_id THEN 0
                    ELSE 1
                  END,
                  fgs_candidate.created_at DESC,
                  fgs_candidate.id DESC
                LIMIT 1
              ) fgs ON TRUE
              LEFT JOIN public.orders o ON o.id = alloc.order_id AND o.organization_id = v_org_id
              LEFT JOIN public.customers c ON c.id = COALESCE(o.customer_id, fgs.customer_id) AND c.organization_id = v_org_id
              LEFT JOIN public.products p ON p.id = alloc.product_id AND p.organization_id = v_org_id
              WHERE alloc.raw_material_lot_id = rml.id
                AND alloc.organization_id = v_org_id
            )
          )
          ORDER BY
            rm.name ASC,
            rml.created_at ASC,
            rml.id ASC
        ), '[]'::jsonb)
        FROM public.raw_material_lots rml
        JOIN public.raw_materials rm ON rm.id = rml.raw_material_id AND rm.organization_id = v_org_id
        JOIN public.stock_movements sm ON sm.id = rml.inbound_stock_movement_id AND sm.organization_id = v_org_id
        WHERE rml.raw_material_receipt_id = rmr.id
          AND rml.organization_id = v_org_id
      )
    )
    ORDER BY
      rmr.receipt_date DESC,
      rmr.created_at DESC,
      rmr.id DESC
  ), '[]'::jsonb)
  INTO v_receipts_json
  FROM public.raw_material_receipts rmr
  WHERE rmr.supplier_id = p_supplier_id
    AND rmr.organization_id = v_org_id;

  -- Combine into final canonical supplier traceability response
  RETURN jsonb_build_object(
    'success', TRUE,
    'supplier', v_supplier_json,
    'receipts', v_receipts_json
  );
END;
$$;


-- 3. Security Permissions (GRANTS & REVOKES)
REVOKE ALL ON FUNCTION public.get_order_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_traceability_atomic(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_supplier_traceability_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_traceability_atomic(TEXT) TO authenticated, service_role;


-- ============================================================================
-- FreshOps Purchase and Allocation RPC Layer
-- ============================================================================

-- 1. CREATE OR GET SUPPLIER ATOMIC FUNCTION
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


-- 2. CREATE RAW MATERIAL RECEIPT ATOMIC FUNCTION
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

    IF v_kunye_no IS NULL OR v_kunye_no = '' THEN
      RAISE EXCEPTION 'Satır %: künye numarası (kunye_number) boş olamaz.', v_line_idx + 1;
    END IF;

    IF v_kunye_stat IS NULL OR v_kunye_stat NOT IN ('provided', 'internal_placeholder') THEN
      RAISE EXCEPTION 'Satır %: künye durumu (kunye_status) yalnızca "provided" veya "internal_placeholder" olabilir.', v_line_idx + 1;
    END IF;

    -- Retrieve verified raw material unit
    SELECT unit INTO v_rm_unit
    FROM public.raw_materials
    WHERE id = v_rm_id
      AND organization_id = v_org_id
      AND is_active = TRUE
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Satır %: Hammadde bulunamadı veya erişim yetkisi yok: %', v_line_idx + 1, v_rm_id;
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

    -- Insert stock movement (existing trigger handles stock computation and weighted average costs)
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


-- 3. PREVIEW PRODUCTION LOT ALLOCATION ATOMIC FUNCTION
CREATE OR REPLACE FUNCTION public.preview_production_lot_allocation_atomic(
  p_production_plan_item_id TEXT,
  p_produced_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_ppi RECORD;
  v_plan RECORD;
  v_remaining_quantity NUMERIC;
  v_can_produce BOOLEAN := TRUE;
  v_materials_array JSONB := '[]'::JSONB;
  
  v_recipe RECORD;
  v_waste_rate NUMERIC;
  v_net_qty NUMERIC;
  v_gross_qty NUMERIC;
  
  v_total_available_lot_qty NUMERIC;
  v_remaining_needed NUMERIC;
  v_suggested_lots_array JSONB;
  r_lot RECORD;
  v_allocated NUMERIC;
  v_sufficient BOOLEAN;
BEGIN
  -- Validate Tenant Context
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  -- Validate Produced Quantity
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- Get and Validate Production Plan Item
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- Get and Validate Production Plan
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_ppi.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- Check if Plan is Locked or Closed
  IF COALESCE(v_plan.is_locked, FALSE) = TRUE 
     OR v_plan.closed_at IS NOT NULL 
     OR v_plan.completed_at IS NOT NULL 
     OR COALESCE(v_plan.closed_with_shortage, FALSE) = TRUE 
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kapalı veya kilitli olduğu için yeni üretim girişi yapılamaz.';
  END IF;

  -- Check if Plan Item is Locked or Closed
  IF COALESCE(v_ppi.is_locked, FALSE) = TRUE 
     OR LOWER(TRIM(COALESCE(v_ppi.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Bu üretim planı kalemi kapalı veya kilitli olduğu için üretim girişi yapılamaz.';
  END IF;

  -- Validate Remaining Quantity
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0)
    - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION 'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- Iterate over recipe requirements for the product
  FOR v_recipe IN
    SELECT
      pr.raw_material_id,
      rm.name AS raw_material_name,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON rm.id = pr.raw_material_id
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = FALSE
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = FALSE
    ORDER BY pr.raw_material_id ASC
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);
    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    -- Standard Unit Conversion (g to kg)
    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    -- Calculate Gross Quantity incorporating waste rate
    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));

    -- Sum total remaining quantity in active, non-deleted lots for this material
    SELECT COALESCE(SUM(rml.quantity_remaining), 0)
    INTO v_total_available_lot_qty
    FROM public.raw_material_lots rml
    JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
    WHERE rml.raw_material_id = v_recipe.raw_material_id
      AND rml.organization_id = v_org_id
      AND rml.is_deleted = FALSE
      AND rml.quantity_remaining > 0
      AND rmr.organization_id = v_org_id
      AND rmr.is_deleted = FALSE;

    -- FIFO Suggestion Logic
    v_remaining_needed := v_gross_qty;
    v_suggested_lots_array := '[]'::JSONB;

    FOR r_lot IN
      SELECT 
        rml.id AS lot_id,
        rml.internal_lot_no,
        rml.quantity_remaining,
        rml.kunye_number,
        rml.kunye_status,
        rmr.id AS receipt_id,
        rmr.receipt_date,
        rmr.invoice_number,
        rmr.dispatch_note_number,
        s.id AS supplier_id,
        s.name AS supplier_name
      FROM public.raw_material_lots rml
      JOIN public.raw_material_receipts rmr ON rmr.id = rml.raw_material_receipt_id
      JOIN public.suppliers s ON s.id = rmr.supplier_id
      WHERE rml.raw_material_id = v_recipe.raw_material_id
        AND rml.organization_id = v_org_id
        AND rml.is_deleted = FALSE
        AND rml.quantity_remaining > 0
        AND rmr.organization_id = v_org_id
        AND rmr.is_deleted = FALSE
        AND s.organization_id = v_org_id
        AND s.is_deleted = FALSE
      ORDER BY 
        rmr.receipt_date ASC,
        rml.created_at ASC,
        rml.id ASC
    LOOP
      IF v_remaining_needed <= 0 THEN
        EXIT;
      END IF;

      v_allocated := LEAST(r_lot.quantity_remaining, v_remaining_needed);
      v_remaining_needed := v_remaining_needed - v_allocated;

      v_suggested_lots_array := v_suggested_lots_array || jsonb_build_array(
        jsonb_build_object(
          'rawMaterialLotId', r_lot.lot_id,
          'internalLotNo', r_lot.internal_lot_no,
          'allocatedQuantity', v_allocated,
          'quantityRemaining', r_lot.quantity_remaining,
          'kunyeNumber', r_lot.kunye_number,
          'kunyeStatus', r_lot.kunye_status,
          'supplierId', r_lot.supplier_id,
          'supplierName', r_lot.supplier_name,
          'receiptId', r_lot.receipt_id,
          'receiptDate', r_lot.receipt_date::TEXT,
          'invoiceNumber', r_lot.invoice_number,
          'dispatchNoteNumber', r_lot.dispatch_note_number
        )
      );
    END LOOP;

    v_sufficient := (v_remaining_needed <= 0);
    IF NOT v_sufficient THEN
      v_can_produce := FALSE;
    END IF;

    -- Append material allocation info
    v_materials_array := v_materials_array || jsonb_build_array(
      jsonb_build_object(
        'rawMaterialId', v_recipe.raw_material_id,
        'rawMaterialName', v_recipe.raw_material_name,
        'requiredQuantity', v_gross_qty,
        'unit', v_recipe.raw_unit,
        'availableLotQuantity', v_total_available_lot_qty,
        'sufficient', v_sufficient,
        'suggestedLots', v_suggested_lots_array
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'canProduce', v_can_produce,
    'productionPlanItemId', p_production_plan_item_id,
    'producedQuantity', p_produced_quantity,
    'materials', v_materials_array
  );
END;
$$;


-- 4. FUNCTION-LEVEL GRANTS AND SECURITY
REVOKE ALL ON FUNCTION public.create_or_get_supplier_atomic(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_production_lot_allocation_atomic(TEXT, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_or_get_supplier_atomic(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_raw_material_receipt_atomic(TEXT, DATE, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_production_lot_allocation_atomic(TEXT, NUMERIC) TO authenticated, service_role;

