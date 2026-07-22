import { ProductionPlan } from '../types';

export function isProductionPlanClosed(plan: ProductionPlan | undefined | null): boolean {
  if (!plan) return false;
  if (plan.closedAt) return true;
  if (plan.completedAt) return true;
  if (plan.closedWithShortage === true) return true;
  if (plan.isLocked === true) return true;

  const status = (plan.status || '').toLocaleLowerCase('tr-TR').trim();
  if (
    status === "eksikle kapatıldı" ||
    status === "iptal" ||
    status === "iptal edildi" ||
    status === "kapalı" ||
    status === "eksikle_kapatildi" ||
    status === "closed_with_shortage" ||
    status === "cancelled" ||
    status === "closed"
  ) {
    return true;
  }
  return false;
}
