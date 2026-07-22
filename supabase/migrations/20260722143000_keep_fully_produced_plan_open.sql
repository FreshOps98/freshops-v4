-- Migration: Keep fully produced plans open until explicit user closure
-- Date: 2026-07-22

---------------------------------------------------
-- 1. BEFORE INSERT OR UPDATE TRIGGER ON PRODUCTION_PLANS
---------------------------------------------------

CREATE OR REPLACE FUNCTION public.keep_production_plan_open_until_explicit_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_produced BOOLEAN;
BEGIN
  -- If status is being set to 'Tamamlandı' / 'completed' / 'plan tamamlandı'
  -- BUT none of the explicit closure fields are set (is_locked, completed_at, closed_at, closed_with_shortage),
  -- then this is an automatic completion attempt based on item progress alone.
  -- In this case, keep the plan open ('Üretimde' or 'Planlandı').
  IF LOWER(TRIM(COALESCE(NEW.status, ''))) IN ('tamamlandı', 'completed', 'plan tamamlandı') THEN
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


---------------------------------------------------
-- 2. NORMALIZE CORRUPTED RECORDS
---------------------------------------------------

UPDATE public.production_plans AS p
SET status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.production_plan_items AS ppi
    WHERE ppi.production_plan_id = p.id
      AND ppi.organization_id = p.organization_id
      AND COALESCE(ppi.is_deleted, FALSE) = FALSE
      AND COALESCE(ppi.produced_quantity, 0) > 0
  ) THEN 'Üretimde'
  ELSE 'Planlandı'
END,
updated_at = NOW()
WHERE LOWER(TRIM(COALESCE(p.status, ''))) IN ('tamamlandı', 'completed', 'plan tamamlandı')
  AND COALESCE(p.is_locked, FALSE) = FALSE
  AND p.completed_at IS NULL
  AND p.closed_at IS NULL
  AND COALESCE(p.closed_with_shortage, FALSE) = FALSE
  AND COALESCE(p.is_deleted, FALSE) = FALSE;


---------------------------------------------------
-- 3. UPDATE ADD_ORDER_ITEM_TO_PRODUCTION_PLAN_ATOMIC RPC
---------------------------------------------------

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

  /*
   * Yalnızca gerçekten kapatılmış / iptal edilmiş planlara ekleme yapılamaz.
   * "Tamamlandı" (completed) olan ancak explicit kapatılmamış planlar açık kabul edilir.
   */
  IF v_closed_at IS NOT NULL
     OR v_completed_at IS NOT NULL
     OR v_closed_with_shortage = TRUE
     OR LOWER(TRIM(COALESCE(v_plan_status, ''))) IN (
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

REVOKE ALL ON FUNCTION public.add_order_item_to_production_plan_atomic(text, text, text, text, numeric, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_order_item_to_production_plan_atomic(text, text, text, text, numeric, text) TO authenticated, service_role;
