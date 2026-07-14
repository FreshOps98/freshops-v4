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
  plan_date TEXT NOT NULL,
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
     OR LOWER(TRIM(COALESCE(v_plan_status, ''))) IN (
       'tamamlandı',
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'completed',
       'cancelled'
     )
  THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Bu üretim planı kapalı veya tamamlanmış olduğu için yeni kalem eklenemez.'
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

-- 17. CREATE PRODUCTION RUN ATOMIC
CREATE OR REPLACE FUNCTION public.create_production_run_atomic(
  p_production_plan_item_id text,
  p_produced_quantity numeric,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_ppi record;
  v_plan record;
  v_product record;
  v_cs record;

  v_run_id text;
  v_fgs_id text;
  v_fgm_id text;
  v_sm_id text;

  v_lot_date date;
  v_lot_no text;
  v_lot_offset integer := 0;

  v_material_total numeric := 0;
  v_labor_cost numeric := 0;
  v_overhead_cost numeric := 0;
  v_unit_cost numeric := 0;
  v_total_cost numeric := 0;

  v_recipe record;
  v_net_qty numeric;
  v_gross_qty numeric;
  v_waste_rate numeric;
  v_unit_price numeric;
  v_new_plan_item_produced numeric;

  v_movement_ids jsonb := '[]'::jsonb;
  
  -- Extra variables for hardening
  v_production_plan_id text;
  v_remaining_quantity numeric;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than zero.';
  END IF;

  -- 1. Get the production plan ID without locking first
  SELECT production_plan_id
  INTO v_production_plan_id
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2. Lock the production plan FOR UPDATE (prevents deadlock with close_production_plan_and_carry_over_atomic)
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  -- 3. Check if the production plan is closed or locked
  IF COALESCE(v_plan.is_locked, false) = true
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, false) = true
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION
      'Bu üretim planı kapalı veya kilitli olduğu için yeni üretim girişi yapılamaz.';
  END IF;

  -- 4. Lock and reload the production plan item, validating it belongs to the locked plan
  SELECT *
  INTO v_ppi
  FROM public.production_plan_items
  WHERE id = p_production_plan_item_id
    AND production_plan_id = v_plan.id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 5. Check if the production plan item is closed or locked
  IF COALESCE(v_ppi.is_locked, false) = true
     OR LOWER(TRIM(COALESCE(v_ppi.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION
      'Bu üretim planı kalemi kapalı veya kilitli olduğu için üretim girişi yapılamaz.';
  END IF;

  -- 6. Check remaining quantity to prevent excess production
  v_remaining_quantity := GREATEST(
    COALESCE(v_ppi.planned_quantity, 0)
    - COALESCE(v_ppi.produced_quantity, 0),
    0
  );

  IF p_produced_quantity > v_remaining_quantity THEN
    RAISE EXCEPTION
      'Kalan üretim miktarından fazla üretim giremezsiniz. Kalan: %, Girilen: %',
      v_remaining_quantity,
      p_produced_quantity;
  END IF;

  -- Rest of the creation flow (retained exactly)
  SELECT *
  INTO v_product
  FROM public.products
  WHERE id = v_ppi.product_id
    AND organization_id = v_org_id
    AND is_deleted = false;

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
  v_lot_no := COALESCE(NULLIF(v_product.lot_prefix, ''), upper(substr(v_product.name, 1, 3)))
              || '-' || to_char(v_lot_date, 'DDMMYY');

  v_run_id := public.freshops_id('run');

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
    false,
    '[]'::jsonb,
    false,
    p_note,
    false,
    false
  );

  FOR v_recipe IN
    SELECT
      pr.raw_material_id,
      pr.quantity AS recipe_quantity,
      pr.unit AS recipe_unit,
      COALESCE(pr.waste_rate_override, rm.default_waste_rate, 0) AS waste_rate,
      rm.unit AS raw_unit,
      rm.average_cost,
      rm.purchase_price
    FROM public.product_recipes pr
    JOIN public.raw_materials rm ON rm.id = pr.raw_material_id
    WHERE pr.product_id = v_ppi.product_id
      AND pr.organization_id = v_org_id
      AND pr.is_deleted = false
      AND rm.organization_id = v_org_id
      AND rm.is_deleted = false
  LOOP
    v_waste_rate := COALESCE(v_recipe.waste_rate, 0);

    IF v_waste_rate >= 100 THEN
      RAISE EXCEPTION 'Waste rate cannot be 100 or greater. raw_material_id=%', v_recipe.raw_material_id;
    END IF;

    IF v_recipe.recipe_unit = 'g' AND v_recipe.raw_unit = 'kg' THEN
      v_net_qty := (p_produced_quantity * v_recipe.recipe_quantity) / 1000;
    ELSE
      v_net_qty := p_produced_quantity * v_recipe.recipe_quantity;
    END IF;

    v_gross_qty := v_net_qty / (1 - (v_waste_rate / 100.0));
    v_unit_price := COALESCE(NULLIF(v_recipe.average_cost, 0), v_recipe.purchase_price, 0);

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
      false,
      false
    )
    RETURNING id INTO v_sm_id;

    v_movement_ids := v_movement_ids || to_jsonb(v_sm_id);
    v_material_total := v_material_total + (v_gross_qty * v_unit_price);
  END LOOP;

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
    false,
    false
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
    false,
    false,
    false
  )
  RETURNING id INTO v_fgm_id;

  v_new_plan_item_produced := COALESCE(v_ppi.produced_quantity, 0) + p_produced_quantity;

  UPDATE public.production_plan_items
  SET
    produced_quantity = v_new_plan_item_produced,
    status = CASE
      WHEN v_new_plan_item_produced >= planned_quantity THEN 'Tamamlandı'
      ELSE 'Kısmi Üretildi'
    END,
    raw_materials_deducted = true,
    deducted_at = now(),
    deduction_movement_ids = v_movement_ids,
    finished_goods_created = true,
    finished_goods_stock_id = v_fgs_id,
    estimated_total_cost = v_total_cost,
    unit_cost = v_unit_cost,
    updated_at = now()
  WHERE id = v_ppi.id;

  UPDATE public.production_runs
  SET
    unit_cost = v_unit_cost,
    total_cost = v_total_cost,
    raw_materials_deducted = true,
    raw_material_movement_ids = v_movement_ids,
    finished_goods_created = true,
    finished_goods_stock_id = v_fgs_id,
    updated_at = now()
  WHERE id = v_run_id;

  UPDATE public.production_plans
  SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.production_plan_items
        WHERE production_plan_id = v_plan.id
          AND is_deleted = false
          AND produced_quantity < planned_quantity
      )
      THEN 'Tamamlandı'
      ELSE 'Planlandı'
    END,
    updated_at = now()
  WHERE id = v_plan.id;

  PERFORM public.recompute_order_status_atomic(v_ppi.order_id);

  RETURN jsonb_build_object(
    'productionRunId', v_run_id,
    'finishedGoodsStockId', v_fgs_id,
    'lotNo', v_lot_no,
    'producedQuantity', p_produced_quantity,
    'unitCost', v_unit_cost,
    'totalCost', v_total_cost,
    'rawMaterialMovementIds', v_movement_ids
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


-- 19. UNDO PRODUCTION RUN ATOMIC
CREATE OR REPLACE FUNCTION public.undo_production_run_atomic(
  p_production_run_id text,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_run record;
  v_fgs record;
  v_plan_item record;
  v_reversal_stock_movement_ids jsonb := '[]'::jsonb;
  v_fgm_reversal_id text;
  v_new_produced_quantity numeric;
  v_realized_amount numeric := 0;
  v_order_status text;
  sm record;
  rm record;
  v_previous_stock numeric;
  v_new_stock numeric;
  v_stock_reversal_id text;
  
  -- Extra variable for hardening
  v_plan record;
BEGIN
  v_org_id := public.current_organization_id();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for current user.';
  END IF;

  SELECT *
  INTO v_run
  FROM public.production_runs
  WHERE id = p_production_run_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production run not found or already reversed.';
  END IF;

  -- 2A. Lock the production plan FOR UPDATE and check if closed or locked
  SELECT *
  INTO v_plan
  FROM public.production_plans
  WHERE id = v_run.production_plan_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan not found.';
  END IF;

  IF COALESCE(v_plan.is_locked, false) = true
     OR v_plan.closed_at IS NOT NULL
     OR v_plan.completed_at IS NOT NULL
     OR COALESCE(v_plan.closed_with_shortage, false) = true
     OR LOWER(TRIM(COALESCE(v_plan.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled',
       'completed'
     )
  THEN
    RAISE EXCEPTION
      'Kapalı veya kilitli üretim planındaki üretim geri alınamaz.';
  END IF;

  -- Aktif sevkiyat varsa üretim geri alınamaz
  IF EXISTS (
    SELECT 1
    FROM public.finished_goods_movements fgm
    WHERE fgm.production_run_id = v_run.id
      AND fgm.organization_id = v_org_id
      AND fgm.is_deleted = false
      AND fgm.is_shipment = true
      AND fgm.movement_type = 'Sevkiyat çıkışı'
  ) THEN
    RAISE EXCEPTION 'Production cannot be reversed while active shipments exist. Reverse shipments first.';
  END IF;

  SELECT *
  INTO v_fgs
  FROM public.finished_goods_stocks
  WHERE production_run_id = v_run.id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished goods stock for this production run not found.';
  END IF;

  IF COALESCE(v_fgs.quantity_remaining, 0) <> COALESCE(v_fgs.quantity_produced, 0) THEN
    RAISE EXCEPTION 'Finished goods stock is not fully available. Reverse all shipments before reversing production.';
  END IF;

  SELECT *
  INTO v_plan_item
  FROM public.production_plan_items
  WHERE id = v_run.production_plan_item_id
    AND organization_id = v_org_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production plan item not found.';
  END IF;

  -- 2B. Check if the production plan item is closed or locked
  IF COALESCE(v_plan_item.is_locked, false) = true
     OR LOWER(TRIM(COALESCE(v_plan_item.status, ''))) IN (
       'eksikle kapatıldı',
       'iptal',
       'iptal edildi',
       'kapalı',
       'cancelled'
     )
  THEN
    RAISE EXCEPTION
      'Kapalı veya kilitli üretim planı kalemindeki üretim geri alınamaz.';
  END IF;

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
      quantity,
      unit,
      movement_date,
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
      sm.quantity,
      sm.unit,
      CURRENT_DATE,
      v_previous_stock,
      v_new_stock,
      sm.quantity,
      v_run.id,
      v_run.order_id,
      v_run.order_item_id,
      'production_run_reversal',
      v_run.id,
      COALESCE(p_reason, 'Üretim geri alındı'),
      false,
      false
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

  -- Güvenli son stok düzeltmesi
  PERFORM public.recalculate_raw_material_stocks();

  RETURN jsonb_build_object(
    'productionRunId', v_run.id,
    'finishedGoodsStockId', v_fgs.id,
    'finishedGoodsReversalMovementId', v_fgm_reversal_id,
    'rawMaterialReversalMovementIds', v_reversal_stock_movement_ids,
    'newProducedQuantity', v_new_produced_quantity,
    'orderStatus', v_order_status,
    'realizedAmount', v_realized_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
TO authenticated, service_role;


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
