// Per-season historical weather ensembles (Wave 3 L1). ONE archive request
// (Open-Meteo ERA5, 1940→, keyless/CORS*) covering the last 10 COMPLETE
// calendar years (same window rule as climate.ts — recomputed here, not
// imported), split per year into daily tmean/precip/ET₀ arrays (2 dp).
// Fallback when ERA5 fails: per-year NASA POWER daily (keyless/CORS*,
// −9999 sentinels are real data gaps → skip the day) with ET₀ derived by the
// FAO-56 Hargreaves proxy. Never throws; <3 usable years ⇒ null.
// Live-verified 2026-09-04 from the sandbox (Portland OR): both endpoints
// return the documented shapes/units.

export interface SeasonYear {
  year: number;
  daily: { tmeanC: number; precipMm: number; et0Mm: number }[];
}

export interface SeasonEnsembles {
  years: SeasonYear[];
  source: 'era5' | 'nasa-power';
}

interface SeasonsCacheEntry {
  version: 1;
  startYear: number;
  endYear: number;
  ensembles: SeasonEnsembles;
}

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const WINDOW_YEARS = 10; // same 10-complete-year window as climate.ts
const MIN_YEAR_DAYS = 300; // calendar year counts as usable with ≥300 usable days (climate.ts rule)
const POWER_MISSING = -900; // POWER fill values are -999/-9999; anything ≤ -900 is a sentinel
const CACHE_VERSION = 1;

const cacheKey = (lat: number, lng: number) => `ff-pro:seasons:${lat.toFixed(2)},${lng.toFixed(2)}`;

// Last 10 COMPLETE calendar years (this year is never complete).
function planWindow(): { startYear: number; endYear: number } {
  const endYear = new Date().getUTCFullYear() - 1;
  return { startYear: endYear - (WINDOW_YEARS - 1), endYear };
}

// In-flight dedupe per coords; failures are never memoized so a later call retries.
const inflight = new Map<string, Promise<SeasonEnsembles | null>>();

function readCache(key: string, startYear: number, endYear: number): SeasonEnsembles | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as SeasonsCacheEntry;
    if (!entry || entry.version !== CACHE_VERSION) return null;
    if (entry.startYear !== startYear || entry.endYear !== endYear) return null;
    if (!entry.ensembles || !Array.isArray(entry.ensembles.years)) return null;
    return entry.ensembles;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: SeasonsCacheEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // quota / private mode — session-only is fine
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Round to 2 dp at the module boundary (all stored/compared values are 2 dp).
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Extraterrestrial radiation RA (MJ/m²/day) for the 12 mid-month days of a
 * latitude — FAO-56 Annex 2 (Table 2.6), eqs 21–25: RA = (24·60/π)·Gsc·dr·
 * (ωs·sinφ·sinδ + cosφ·cosδ), Gsc = 0.0820, J = mid-month day-of-year.
 * Deterministic pure function of (latDeg, month); exported so callers/tests
 * can inspect the 12-entry table.
 */
export function raMidMonthTable(latDeg: number): number[] {
  const phi = (Math.max(-90, Math.min(90, latDeg)) * Math.PI) / 180;
  // FAO-56 Table 2.6 mid-month day-of-year (per month, non-leap convention)
  const midMonthDoy = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
  return midMonthDoy.map((j) => {
    const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365); // eq 23
    const delta = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39); // eq 24
    const x = -Math.tan(phi) * Math.tan(delta);
    const ws = Math.acos(Math.max(-1, Math.min(1, x))); // eq 25, clamped (polar night/midnight sun)
    return round2((24 * 60 / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta))); // eq 21
  });
}

// Hargreaves ET₀ proxy (FAO-56 eq 52), used ONLY where POWER has no ET₀
// variable: et0 = 0.0023 · RA · (tmean + 17.8) · sqrt(max(0, tmax − tmin)).
function hargreavesEt0(ra: number, tmeanC: number, tmaxC: number, tminC: number): number {
  return 0.0023 * ra * (tmeanC + 17.8) * Math.sqrt(Math.max(0, tmaxC - tminC));
}

interface Era5Daily {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  precipitation_sum?: unknown;
  et0_fao_evapotranspiration?: unknown;
}

// Split the single ERA5 response into per-calendar-year arrays; a day needs
// tmax+tmin+precip+et0 all finite to count. Years sorted ascending.
function splitEra5(daily: Era5Daily): SeasonYear[] {
  const time = daily.time;
  const tmax = daily.temperature_2m_max;
  const tmin = daily.temperature_2m_min;
  const precip = daily.precipitation_sum;
  const et0 = daily.et0_fao_evapotranspiration;
  if (!Array.isArray(time) || !Array.isArray(tmax) || !Array.isArray(tmin) || !Array.isArray(precip) || !Array.isArray(et0)) return [];
  if (tmax.length !== time.length || tmin.length !== time.length || precip.length !== time.length || et0.length !== time.length) return [];
  const byYear = new Map<number, { n: number; daily: { tmeanC: number; precipMm: number; et0Mm: number }[] }>();
  for (let i = 0; i < time.length; i++) {
    const ds = time[i];
    if (typeof ds !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
    const tx = tmax[i];
    const tn = tmin[i];
    const pr = precip[i];
    const ev = et0[i];
    if (!finite(tx) || !finite(tn) || !finite(pr) || !finite(ev)) continue;
    const year = Number(ds.slice(0, 4));
    const acc = byYear.get(year) ?? { n: 0, daily: [] };
    acc.n++;
    acc.daily.push({ tmeanC: round2((tx + tn) / 2), precipMm: round2(pr), et0Mm: round2(ev) });
    byYear.set(year, acc);
  }
  return [...byYear.entries()]
    .filter(([, a]) => a.n >= MIN_YEAR_DAYS)
    .sort(([a], [b]) => a - b)
    .map(([year, a]) => ({ year, daily: a.daily }));
}

interface PowerPayload {
  properties?: { parameter?: Record<string, Record<string, number> | undefined> } | null;
}

// One POWER request per calendar year; −9999-family sentinels skip the day.
// ET₀ derived with Hargreaves from the month's mid-month RA.
async function fetchPowerYear(lat: number, lng: number, year: number, raTable: number[]): Promise<SeasonYear | null> {
  const url =
    `${POWER_URL}?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG` +
    `&latitude=${lat}&longitude=${lng}` +
    `&start=${year}0101&end=${year}1231&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as PowerPayload;
  const params = json?.properties?.parameter;
  const tmax = params?.T2M_MAX;
  const tmin = params?.T2M_MIN;
  const precip = params?.PRECTOTCORR;
  if (!tmax || !tmin || !precip) return null;
  const daily: { tmeanC: number; precipMm: number; et0Mm: number }[] = [];
  for (const key of Object.keys(tmax)) {
    if (!/^\d{8}$/.test(key)) continue;
    const tx = tmax[key];
    const tn = tmin[key];
    const pr = precip[key];
    if (!finite(tx) || !finite(tn) || !finite(pr)) continue;
    if (tx <= POWER_MISSING || tn <= POWER_MISSING || pr <= POWER_MISSING) continue; // sentinel → skip day
    const mo = Number(key.slice(4, 6)) - 1;
    const tmean = (tx + tn) / 2;
    daily.push({
      tmeanC: round2(tmean),
      precipMm: round2(pr),
      et0Mm: round2(hargreavesEt0(raTable[mo]!, tmean, tx, tn)),
    });
  }
  if (daily.length < MIN_YEAR_DAYS) return null;
  return { year, daily };
}

/**
 * Fetch 10 per-year historical daily ensembles. ERA5 in ONE archive request;
 * on any ERA5 failure, per-year NASA POWER daily requests (Hargreaves ET₀).
 * Never throws; returns null when fewer than 3 usable years remain.
 */
export async function fetchSeasonEnsembles(lat: number, lng: number): Promise<SeasonEnsembles | null> {
  const { startYear, endYear } = planWindow();
  const key = cacheKey(lat, lng);
  const cached = readCache(key, startYear, endYear);
  if (cached) return cached;
  const hit = inflight.get(key);
  if (hit) return hit;
  const promise = (async (): Promise<SeasonEnsembles | null> => {
    try {
      let ensembles: SeasonEnsembles | null = null;
      try {
        const url =
          `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
          `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
          `&timezone=auto`;
        const res = await fetch(url);
        if (res.ok) {
          const json = (await res.json()) as { daily?: Era5Daily | null };
          if (json?.daily) {
            const years = splitEra5(json.daily);
            if (years.length >= 3) ensembles = { years, source: 'era5' };
          }
        }
      } catch {
        // ERA5 unreachable/malformed — fall through to POWER
      }
      if (!ensembles) {
        const raTable = raMidMonthTable(lat);
        const years: SeasonYear[] = [];
        for (let y = startYear; y <= endYear; y++) {
          try {
            const sy = await fetchPowerYear(lat, lng, y, raTable);
            if (sy) years.push(sy);
          } catch {
            // per-year failure just drops that year
          }
        }
        years.sort((a, b) => a.year - b.year);
        if (years.length >= 3) ensembles = { years, source: 'nasa-power' };
      }
      if (ensembles) writeCache(key, { version: CACHE_VERSION, startYear, endYear, ensembles });
      return ensembles;
    } catch {
      return null; // never throw past the module boundary
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}
