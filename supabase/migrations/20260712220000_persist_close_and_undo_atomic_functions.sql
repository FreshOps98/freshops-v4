-- Migration: Persist close and undo atomic functions matching staging exactly
-- Date: 2026-07-12 22:00:00

--------------------------------------------------
-- 1. CLOSE PRODUCTION PLAN
--------------------------------------------------

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


--------------------------------------------------
-- 2. UNDO PRODUCTION RUN
--------------------------------------------------

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

  -- Hammadde tüketimlerini geri iade hareketiyle dengele
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


--------------------------------------------------
-- 3. YETKİLER
--------------------------------------------------

REVOKE ALL ON FUNCTION
  public.close_production_plan_and_carry_over_atomic(TEXT, JSONB)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.close_production_plan_and_carry_over_atomic(TEXT, JSONB)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.undo_production_run_atomic(TEXT, TEXT)
TO authenticated, service_role;
