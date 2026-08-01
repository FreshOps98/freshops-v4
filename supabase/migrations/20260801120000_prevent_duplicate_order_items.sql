BEGIN;

-- ============================================================================
-- PREVENT DUPLICATE ORDER ITEMS IN THE SAME ORDER
-- ============================================================================

-- 1. Update create_order_with_items RPC to validate p_items array against duplicate productIds
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_customer_id TEXT,
  p_order_date TEXT,
  p_delivery_date TEXT,
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
  v_dup_count INT;
  v_item JSONB;
  v_item_id TEXT;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_unit TEXT;
  v_safety_override NUMERIC;
  v_waste_overrides JSONB;
  v_product_id TEXT;
  v_result JSONB;
  v_seq INT;
BEGIN
  v_org_id := public.current_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Aktif organizasyon bulunamadı.';
  END IF;

  -- 1. Payload validation: check for duplicate productId in p_items
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    SELECT COUNT(*) - COUNT(DISTINCT (elem->>'productId'))
    INTO v_dup_count
    FROM jsonb_array_elements(p_items) AS elem
    WHERE elem->>'productId' IS NOT NULL AND elem->>'productId' <> '';

    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'Aynı ürün bir siparişte birden fazla kalem olarak kaydedilemez. Ürün miktarlarını tek kalemde birleştirin.';
    END IF;
  END IF;

  -- 2. Calculate total amount
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      v_price := COALESCE((v_item->>'unitSalePrice')::NUMERIC, 0);
      v_total_amount := v_total_amount + (v_qty * v_price);
    END LOOP;
  END IF;

  -- 3. Order ID and Order Number generation
  v_order_id := 'ord_' || replace(gen_random_uuid()::TEXT, '-', '');

  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(order_number, '\D', '', 'g'), '') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM public.orders
  WHERE organization_id = v_org_id;

  v_order_number := 'SIP-' || LPAD(v_seq::TEXT, 5, '0');

  -- 4. Insert order header
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
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    v_org_id,
    p_customer_id,
    v_order_number,
    p_order_date,
    p_delivery_date,
    p_status,
    p_approval_status,
    p_computed_status,
    v_total_amount,
    0,
    p_cost_settings_snapshot,
    p_note,
    FALSE,
    NOW(),
    NOW()
  );

  -- 5. Insert order_items
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_product_id := v_item->>'productId';
      v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
      v_price := COALESCE((v_item->>'unitSalePrice')::NUMERIC, 0);
      v_unit := COALESCE(v_item->>'unit', 'adet');

      IF v_item->>'safetyRateOverride' IS NOT NULL AND (v_item->>'safetyRateOverride') <> '' THEN
        v_safety_override := (v_item->>'safetyRateOverride')::NUMERIC;
      ELSE
        v_safety_override := NULL;
      END IF;

      v_waste_overrides := v_item->'wasteRateOverrides';

      v_item_id := 'ori_' || replace(gen_random_uuid()::TEXT, '-', '');

      INSERT INTO public.order_items (
        id,
        organization_id,
        order_id,
        product_id,
        quantity,
        unit,
        unit_sale_price,
        safety_rate_override,
        waste_rate_overrides,
        is_deleted,
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
        v_safety_override,
        v_waste_overrides,
        FALSE,
        NOW(),
        NOW()
      );
    END LOOP;
  END IF;

  SELECT row_to_json(o)::jsonb INTO v_result
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;


-- 2. Create trigger function to enforce single active order_item per product in an order
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

  -- 2. If TG_OP = 'UPDATE' and key fields have not changed and row was already active, allow update (enables safe updates on existing legacy rows)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
       AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id
       AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
       AND COALESCE(OLD.is_deleted, FALSE) = FALSE THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 3. Advisory lock per organization + order_id + product_id to prevent concurrent race conditions
  IF NEW.organization_id IS NOT NULL AND NEW.order_id IS NOT NULL AND NEW.product_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('order_item_duplicate_guard:' || NEW.organization_id::TEXT || ':' || NEW.order_id || ':' || NEW.product_id));
  END IF;

  -- 4. Search for conflicting active order_item row
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
