// Monthly Daily Light Integral (DLI) per farm from the Open-Meteo Archive API
// (ERA5 reanalysis, keyless, CORS *) — ONE request for the last complete
// calendar year of daily `shortwave_radiation_sum` (MJ/m²), aggregated into 12
// monthly means converted to the horticultural unit mol/m²/day via
// `DLI_mol ≈ MJ × 2.02` (≈45 % PAR fraction of shortwave × 4.5 mol/MJ PAR —
// the standard horticultural-lighting conversion, e.g. McCree / FAO PAR
// norms). Results are cached hard in localStorage per rounded coordinate and
// refreshed when the cached window's year is no longer the last full year.

export type MonthlyDli = number[]; // 12 entries, index 0 = January, mol/m²/day

interface LightCacheEntry {
  version: 2;
  year: number; // calendar year the window covered
  dli: MonthlyDli;
}

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const MIN_USABLE_MONTHS = 10; // ERA5 gaps happen; don't model light from <10 months

const cacheKey = (lat: number, lng: number) => `ff-pro:light:${lat.toFixed(2)},${lng.toFixed(2)}`;

// In-flight dedupe per coords (failures are never memoized, so a later call
// can retry).
const inflight = new Map<string, Promise<MonthlyDli | null>>();

function lastFullYear(): number {
  return new Date().getUTCFullYear() - 1;
}

function readCache(key: string, year: number): MonthlyDli | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as LightCacheEntry;
    if (!entry || entry.version !== 2 || entry.year !== year) return null;
    if (!Array.isArray(entry.dli) || entry.dli.length !== 12) return null;
    return entry.dli;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: LightCacheEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // quota / private mode — session-only is fine
  }
}

/**
 * 12 monthly mean DLI values (mol/m²/day, index 0 = January) for the last
 * complete calendar year at a location, or null when offline / malformed /
 * <10 usable months. Never throws.
 */
export async function fetchMonthlyDli(lat: number, lng: number): Promise<MonthlyDli | null> {
  const year = lastFullYear();
  const key = cacheKey(lat, lng);
  const cached = readCache(key, year);
  if (cached) return cached;
  const hit = inflight.get(key);
  if (hit) return hit;
  const promise = (async (): Promise<MonthlyDli | null> => {
    try {
      const url =
        `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
        `&start_date=${year}-01-01&end_date=${year}-12-31` +
        `&daily=shortwave_radiation_sum` +
        `&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        daily?: { time?: string[]; shortwave_radiation_sum?: (number | null)[] } | null;
      };
      const time = json?.daily?.time;
      const sums = json?.daily?.shortwave_radiation_sum;
      if (!Array.isArray(time) || !Array.isArray(sums) || time.length !== sums.length || time.length === 0) {
        return null;
      }
      // Monthly means of usable daily sums; null days are skipped, not zeroed.
      const monthSum = new Array<number>(12).fill(0);
      const monthN = new Array<number>(12).fill(0);
      for (let i = 0; i < time.length; i++) {
        const v = sums[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const mo = Number(String(time[i]).slice(5, 7));
        if (!(mo >= 1 && mo <= 12)) continue;
        monthSum[mo - 1] += v;
        monthN[mo - 1]++;
      }
      const usable = monthN.filter((n) => n > 0).length;
      if (usable < MIN_USABLE_MONTHS) return null;
      const mean = monthSum.map((v, m) =>
        monthN[m] > 0 ? Math.round((v / monthN[m]) * 2.02 * 100) / 100 : null,
      );
      // A month with no usable samples is MISSING data, not darkness — zero
      // would read as maximum light stress. Impute from the nearest usable
      // neighbors (circular across the year).
      const dli: MonthlyDli = mean.map((v, m) => {
        if (v !== null) return v;
        for (let step = 1; step < 12; step++) {
          const a = mean[(m + step) % 12];
          if (a !== null) return a;
          const b = mean[(m - step + 12) % 12];
          if (b !== null) return b;
        }
        return 0; // unreachable: usable >= MIN_USABLE_MONTHS guarantees a neighbor
      });
      writeCache(key, { version: 2, year, dli });
      return dli;
    } catch {
      return null; // never throw past the module boundary
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}
