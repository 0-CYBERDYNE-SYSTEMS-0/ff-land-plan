// Latitude-based frost date estimate (documented heuristic — a starting point,
// always user-overridable in the farm form):
//   L = clamp(|lat|, 0, 67)
//   frost-free season = clamp(365 − 6.4·L, 30, 365) days, minus ~2 days/100 m elevation
//   season midpoint = day 203 (N hemisphere) / day 21 (S hemisphere)
//   last frost = mid − season/2 ; first frost = mid + season/2 (mod 365)
//   |lat| < 10 → frost-free climate → nulls.

export interface FrostDates {
  lastFrost: string | null; // "MM-DD"
  firstFrost: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function doyToMonthDay(doy: number): string {
  // Non-leap reference year keeps "MM-DD" stable.
  const d = new Date(2025, 0, 1);
  d.setDate(((Math.round(doy) - 1 + 365) % 365) + 1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthDayToDoy(md: string): number {
  const [m, d] = md.split('-').map(Number);
  const date = new Date(2025, (m ?? 1) - 1, d ?? 1);
  const start = new Date(2025, 0, 0);
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

export function estimateFrostDates(lat: number, elevationM = 0): FrostDates {
  const L = clamp(Math.abs(lat), 0, 67);
  if (L < 10) return { lastFrost: null, firstFrost: null };

  let season = clamp(365 - 6.4 * L, 30, 365);
  season = clamp(season - 2 * (Math.max(0, elevationM) / 100), 30, 365);

  const mid = lat >= 0 ? 203 : 21;
  const last = mid - season / 2;
  const first = mid + season / 2;
  return { lastFrost: doyToMonthDay(last), firstFrost: doyToMonthDay(first) };
}

// Date (this year or next) for an "MM-DD" + week offset; used by the calendar.
export function dateFromMonthDay(md: string, year: number, offsetDays = 0): Date {
  const [m, d] = md.split('-').map(Number);
  const date = new Date(year, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + offsetDays);
  return date;
}
