CREATE UNIQUE INDEX IF NOT EXISTS
  production_plan_items_active_order_item_unique
ON public.production_plan_items (
  organization_id,
  production_plan_id,
  order_item_id
)
WHERE
  COALESCE(is_deleted, false) = false
  AND order_item_id IS NOT NULL
  AND status NOT IN ('İptal', 'İptal Edildi');
