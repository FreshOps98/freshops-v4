export function getTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTomorrowISO(): string {
  return addDaysISO(getTodayISO(), 1);
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = parseISODateSafe(dateStr);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODateSafe(dateStr: any): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? new Date() : dateStr;
  if (typeof dateStr !== 'string') return new Date();
  
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function isSameDayISO(a: string, b: string): boolean {
  const da = parseISODateSafe(a);
  const db = parseISODateSafe(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

export function isBeforeISO(a: string, b: string): boolean {
  const da = parseISODateSafe(a);
  const db = parseISODateSafe(b);
  const ta = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  const tb = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime();
  return ta < tb;
}

export function isAfterISO(a: string, b: string): boolean {
  const da = parseISODateSafe(a);
  const db = parseISODateSafe(b);
  const ta = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime();
  const tb = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime();
  return ta > tb;
}

export function isBetweenISO(date: string, start: string, end: string): boolean {
  const d = parseISODateSafe(date);
  const s = parseISODateSafe(start);
  const e = parseISODateSafe(end);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ts = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const te = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
  return t >= ts && t <= te;
}

export function startOfWeekMondayISO(dateStr: string): string {
  const d = parseISODateSafe(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function endOfWeekSundayISO(dateStr: string): string {
  const mondayStr = startOfWeekMondayISO(dateStr);
  return addDaysISO(mondayStr, 6);
}
