BEGIN;

-- ============================================================================
-- PREVENT DUPLICATE ORDER ITEMS IN THE SAME ORDER & ATOMIC ORDER FUNCTIONS
-- ============================================================================

-- 1. Update create_order_with_items RPC with correct DATE signature and live function behavior
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_id TEXT,
  p_order_date DATE,
  p_delivery_date DATE,
  p_status TEXT DEFAULT 'Onaylandı',
  p_approval_status TEXT DEFAULT 'Onaylandı',
  p_computed_status TEXT DEFAULT 'Onaylandı',
  p_note TEXT DEFAULT NULL,
  p_cost_settings_snapshot JSONB DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_order_id TEXT;
  v_order_number TEXT;
  v_total_amount NUMERIC := 0;
  v_customer_check TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_product_id TEXT;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_unit TEXT;
  v_safety_override NUMERIC;
  v_waste_overrides JSONB;
  v_prod_price NUMERIC;
  v_item_total NUMERIC;
  v_dup_count INT;
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aktif organizasyon bulunamadı.';
  END IF;

  -- 1. Validate p_items array
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sipariş için en az bir kalem girilmelidir.';
  END IF;

  -- 2. Validate customer exists in org and is not deleted
  SELECT id INTO v_customer_check
  FROM public.customers
  WHERE id = p_customer_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE;

  IF v_customer_check IS NULL THEN
    RAISE EXCEPTION 'Geçerli bir müşteri seçilmelidir.';
  END IF;

  -- 3. Check for duplicate product IDs in p_items payload (supporting both productId and product_id)
  SELECT COUNT(*) - COUNT(DISTINCT TRIM(COALESCE(elem->>'productId', elem->>'product_id')))
  INTO v_dup_count
  FROM jsonb_array_elements(p_items) AS elem
  WHERE TRIM(COALESCE(elem->>'productId', elem->>'product_id')) IS NOT NULL
    AND TRIM(COALESCE(elem->>'productId', elem->>'product_id')) <> '';

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Aynı ürün bir siparişte birden fazla kalem olarak kaydedilemez. Ürün miktarlarını tek kalemde birleştirin.';
  END IF;

  -- 4. Validate items and calculate total_amount BEFORE inserting order header
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := TRIM(COALESCE(v_item->>'productId', v_item->>'product_id'));
    IF v_product_id IS NULL OR v_product_id = '' THEN
      RAISE EXCEPTION 'Sipariş kalemi için geçerli bir ürün seçilmelidir.';
    END IF;

    SELECT sale_price INTO v_prod_price
    FROM public.products
    WHERE id = v_product_id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    IF v_prod_price IS NULL THEN
      RAISE EXCEPTION 'Seçilen ürün bulunamadı veya bu organizasyona ait değil.';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Ürün miktarı pozitif olmalıdır.';
    END IF;

    IF v_item->>'unitSalePrice' IS NOT NULL AND (v_item->>'unitSalePrice') <> '' THEN
      v_price := (v_item->>'unitSalePrice')::NUMERIC;
    ELSIF v_item->>'unit_sale_price' IS NOT NULL AND (v_item->>'unit_sale_price') <> '' THEN
      v_price := (v_item->>'unit_sale_price')::NUMERIC;
    ELSE
      v_price := COALESCE(v_prod_price, 0);
    END IF;

    v_item_total := v_qty * v_price;
    v_total_amount := v_total_amount + v_item_total;
  END LOOP;

  -- 5. Generate Order ID and Order Number using live methods
  v_order_id := public.freshops_id('ord');
  v_order_number := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));

  -- 6. Insert Order Header
  INSERT INTO public.orders (
    id,
    organization_id,
    customer_id,
    order_number,
    order_date,
    delivery_date,
    status,
    approval_status,
    computed_status,
    total_amount,
    realized_amount,
    cost_settings_snapshot,
    note,
    is_deleted,
    is_demo,
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    v_org_id,
    p_customer_id,
    v_order_number,
    p_order_date,
    p_delivery_date,
    COALESCE(p_status, 'Onaylandı'),
    COALESCE(p_approval_status, 'Onaylandı'),
    COALESCE(p_computed_status, p_status, 'Onaylandı'),
    v_total_amount,
    0,
    p_cost_settings_snapshot,
    p_note,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

  -- 7. Insert Order Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := TRIM(COALESCE(v_item->>'productId', v_item->>'product_id'));
    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_unit := COALESCE(v_item->>'unit', 'adet');

    SELECT sale_price INTO v_prod_price
    FROM public.products
    WHERE id = v_product_id;

    IF v_item->>'unitSalePrice' IS NOT NULL AND (v_item->>'unitSalePrice') <> '' THEN
      v_price := (v_item->>'unitSalePrice')::NUMERIC;
    ELSIF v_item->>'unit_sale_price' IS NOT NULL AND (v_item->>'unit_sale_price') <> '' THEN
      v_price := (v_item->>'unit_sale_price')::NUMERIC;
    ELSE
      v_price := COALESCE(v_prod_price, 0);
    END IF;

    v_item_total := v_qty * v_price;

    IF v_item->>'safetyRateOverride' IS NOT NULL AND (v_item->>'safetyRateOverride') <> '' THEN
      v_safety_override := (v_item->>'safetyRateOverride')::NUMERIC;
    ELSIF v_item->>'safety_rate_override' IS NOT NULL AND (v_item->>'safety_rate_override') <> '' THEN
      v_safety_override := (v_item->>'safety_rate_override')::NUMERIC;
    ELSE
      v_safety_override := NULL;
    END IF;

    v_waste_overrides := COALESCE(v_item->'wasteRateOverrides', v_item->'waste_rate_overrides');

    v_item_id := public.freshops_id('ori');

    INSERT INTO public.order_items (
      id,
      organization_id,
      order_id,
      product_id,
      quantity,
      unit,
      unit_sale_price,
      total_price,
      safety_rate_override,
      waste_rate_overrides,
      is_deleted,
      is_demo,
      created_at,
      updated_at
    ) VALUES (
      v_item_id,
      v_org_id,
      v_order_id,
      v_product_id,
      v_qty,
      v_unit,
      v_price,
      v_item_total,
      v_safety_override,
      v_waste_overrides,
      FALSE,
      FALSE,
      NOW(),
      NOW()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'totalAmount', v_total_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_with_items(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;


-- 2. Create update_order_with_items_atomic RPC for atomic order updates
CREATE OR REPLACE FUNCTION public.update_order_with_items_atomic(
  p_order_id TEXT,
  p_customer_id TEXT DEFAULT NULL,
  p_order_date DATE DEFAULT NULL,
  p_delivery_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_approval_status TEXT DEFAULT NULL,
  p_computed_status TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_cost_settings_snapshot JSONB DEFAULT NULL,
  p_items JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_existing_order public.orders%ROWTYPE;
  v_customer_check TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_product_id TEXT;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_unit TEXT;
  v_safety_override NUMERIC;
  v_waste_overrides JSONB;
  v_prod_price NUMERIC;
  v_item_total NUMERIC;
  v_total_amount NUMERIC := 0;
  v_existing_item public.order_items%ROWTYPE;
  v_incoming_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aktif organizasyon bulunamadı.';
  END IF;

  -- 1. Lock and fetch existing order header
  SELECT * INTO v_existing_order
  FROM public.orders
  WHERE id = p_order_id
    AND organization_id = v_org_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF v_existing_order.id IS NULL THEN
    RAISE EXCEPTION 'Güncellenecek sipariş bulunamadı veya erişim yetkiniz yok.';
  END IF;

  -- 2. Customer validation if updated
  IF p_customer_id IS NOT NULL AND p_customer_id <> '' THEN
    SELECT id INTO v_customer_check
    FROM public.customers
    WHERE id = p_customer_id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, FALSE) = FALSE;

    IF v_customer_check IS NULL THEN
      RAISE EXCEPTION 'Geçerli bir müşteri seçilmelidir.';
    END IF;
  END IF;

  -- 3. Items processing if p_items provided
  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RAISE EXCEPTION 'Sipariş için en az bir kalem bulunmalıdır.';
    END IF;

    -- Collect incoming item IDs to detect removed items and validate cross-order IDs
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_item_id := TRIM(COALESCE(v_item->>'id', v_item->>'item_id'));
      IF v_item_id IS NOT NULL AND v_item_id <> '' AND NOT (v_item_id LIKE 'temp_%') THEN
        SELECT * INTO v_existing_item
        FROM public.order_items
        WHERE id = v_item_id;

        IF v_existing_item.id IS NOT NULL AND (v_existing_item.order_id <> p_order_id OR v_existing_item.organization_id <> v_org_id) THEN
          RAISE EXCEPTION 'Geçersiz sipariş kalemi kimliği.';
        END IF;

        v_product_id := TRIM(COALESCE(v_item->>'productId', v_item->>'product_id'));
        IF v_existing_item.id IS NOT NULL AND v_existing_item.product_id <> v_product_id THEN
          RAISE EXCEPTION 'Mevcut bir sipariş kaleminin ürünü değiştirilemez. Kalemi kaldırıp yeni ürün olarak ekleyin.';
        END IF;

        v_incoming_ids := array_append(v_incoming_ids, v_item_id);
      END IF;
    END LOOP;

    -- Remove existing active order_items that are omitted from p_items payload
    DELETE FROM public.order_items
    WHERE order_id = p_order_id
      AND organization_id = v_org_id
      AND COALESCE(is_deleted, FALSE) = FALSE
      AND NOT (id = ANY(v_incoming_ids));

    -- Upsert/Insert items in p_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_item_id := TRIM(COALESCE(v_item->>'id', v_item->>'item_id'));
      v_product_id := TRIM(COALESCE(v_item->>'productId', v_item->>'product_id'));

      IF v_product_id IS NULL OR v_product_id = '' THEN
        RAISE EXCEPTION 'Sipariş kalemi için geçerli bir ürün seçilmelidir.';
      END IF;

      SELECT sale_price INTO v_prod_price
      FROM public.products
      WHERE id = v_product_id
        AND organization_id = v_org_id
        AND COALESCE(is_deleted, FALSE) = FALSE;

      IF v_prod_price IS NULL THEN
        RAISE EXCEPTION 'Seçilen ürün bulunamadı veya bu organizasyona ait değil.';
      END IF;

      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Ürün miktarı pozitif olmalıdır.';
      END IF;

      IF v_item->>'unitSalePrice' IS NOT NULL AND (v_item->>'unitSalePrice') <> '' THEN
        v_price := (v_item->>'unitSalePrice')::NUMERIC;
      ELSIF v_item->>'unit_sale_price' IS NOT NULL AND (v_item->>'unit_sale_price') <> '' THEN
        v_price := (v_item->>'unit_sale_price')::NUMERIC;
      ELSE
        v_price := COALESCE(v_prod_price, 0);
      END IF;

      v_unit := COALESCE(v_item->>'unit', 'adet');
      v_item_total := v_qty * v_price;
      v_total_amount := v_total_amount + v_item_total;

      IF v_item->>'safetyRateOverride' IS NOT NULL AND (v_item->>'safetyRateOverride') <> '' THEN
        v_safety_override := (v_item->>'safetyRateOverride')::NUMERIC;
      ELSIF v_item->>'safety_rate_override' IS NOT NULL AND (v_item->>'safety_rate_override') <> '' THEN
        v_safety_override := (v_item->>'safety_rate_override')::NUMERIC;
      ELSE
        v_safety_override := NULL;
      END IF;

      v_waste_overrides := COALESCE(v_item->'wasteRateOverrides', v_item->'waste_rate_overrides');

      IF v_item_id IS NOT NULL AND v_item_id <> '' AND NOT (v_item_id LIKE 'temp_%') THEN
        -- Update existing item by ID
        UPDATE public.order_items
        SET quantity = v_qty,
            unit = v_unit,
            unit_sale_price = v_price,
            total_price = v_item_total,
            safety_rate_override = v_safety_override,
            waste_rate_overrides = v_waste_overrides,
            updated_at = NOW()
        WHERE id = v_item_id
          AND order_id = p_order_id
          AND organization_id = v_org_id;
      ELSE
        -- Insert NEW item
        v_item_id := public.freshops_id('ori');
        INSERT INTO public.order_items (
          id,
          organization_id,
          order_id,
          product_id,
          quantity,
          unit,
          unit_sale_price,
          total_price,
          safety_rate_override,
          waste_rate_overrides,
          is_deleted,
          is_demo,
          created_at,
          updated_at
        ) VALUES (
          v_item_id,
          v_org_id,
          p_order_id,
          v_product_id,
          v_qty,
          v_unit,
          v_price,
          v_item_total,
          v_safety_override,
          v_waste_overrides,
          FALSE,
          FALSE,
          NOW(),
          NOW()
        );
      END IF;
    END LOOP;
  ELSE
    v_total_amount := v_existing_order.total_amount;
  END IF;

  -- 4. Update Order Header
  UPDATE public.orders
  SET customer_id = COALESCE(p_customer_id, customer_id),
      order_date = COALESCE(p_order_date, order_date),
      delivery_date = COALESCE(p_delivery_date, delivery_date),
      status = COALESCE(p_status, status),
      approval_status = COALESCE(p_approval_status, approval_status),
      computed_status = COALESCE(p_computed_status, p_status, computed_status),
      note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE note END,
      cost_settings_snapshot = CASE WHEN p_cost_settings_snapshot IS NOT NULL THEN p_cost_settings_snapshot ELSE cost_settings_snapshot END,
      total_amount = v_total_amount,
      updated_at = NOW()
  WHERE id = p_order_id
    AND organization_id = v_org_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'totalAmount', v_total_amount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_order_with_items_atomic(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_with_items_atomic(TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;


-- 3. Create trigger function to enforce single active order_item per product in an order
CREATE OR REPLACE FUNCTION public.trg_fn_prevent_duplicate_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id TEXT;
BEGIN
  -- 1. If row is soft-deleted, skip duplicate check
  IF COALESCE(NEW.is_deleted, FALSE) = TRUE THEN
    RETURN NEW;
  END IF;

  -- 2. On UPDATE, if key fields remain unchanged and row was active, allow UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
       AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id
       AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
       AND COALESCE(OLD.is_deleted, FALSE) = FALSE THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 3. Advisory lock per organization + order_id + product_id
  IF NEW.organization_id IS NOT NULL AND NEW.order_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('order_item_duplicate_guard:' || NEW.organization_id::TEXT || ':' || NEW.order_id || ':' || NEW.product_id));
  END IF;

  -- 4. Check for conflicting active row
  SELECT id INTO v_existing_id
  FROM public.order_items
  WHERE organization_id = NEW.organization_id
    AND order_id = NEW.order_id
    AND product_id = NEW.product_id
    AND COALESCE(is_deleted, FALSE) = FALSE
    AND (TG_OP = 'INSERT' OR id <> NEW.id)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Aynı ürün bir siparişte birden fazla kalem olarak kaydedilemez. Ürün miktarlarını tek kalemde birleştirin.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_order_item ON public.order_items;

CREATE TRIGGER trg_prevent_duplicate_order_item
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_prevent_duplicate_order_item();

COMMIT;
