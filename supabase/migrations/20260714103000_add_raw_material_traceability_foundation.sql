-- ============================================================================
-- FreshOps Raw Material Purchasing and Lot Traceability Foundation Migration
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
  CONSTRAINT raw_material_receipts_doc_check CHECK (
    (invoice_number IS NOT NULL AND TRIM(invoice_number) <> '')
    OR
    (dispatch_note_number IS NOT NULL AND TRIM(dispatch_note_number) <> '')
  )
);


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


-- 4. Create Indexes
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


-- 5. Tenant Security: Row Level Security (RLS)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_lots ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policy setup using safe DO blocks
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


-- 6. Role Permissions (GRANTS)
-- Revoke all from PUBLIC to ensure security
REVOKE ALL ON public.suppliers FROM PUBLIC;
REVOKE ALL ON public.raw_material_receipts FROM PUBLIC;
REVOKE ALL ON public.raw_material_lots FROM PUBLIC;

-- Grant SELECT to authenticated (read-only for first phase, write operations will use RPC)
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.raw_material_receipts TO authenticated;
GRANT SELECT ON public.raw_material_lots TO authenticated;

-- Grant ALL to service_role
GRANT ALL ON public.suppliers TO service_role;
GRANT ALL ON public.raw_material_receipts TO service_role;
GRANT ALL ON public.raw_material_lots TO service_role;
