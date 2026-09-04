// Historical climate normals via the Open-Meteo Archive API (ERA5 reanalysis,
// 1940→; keyless, CORS *). One ~10-year daily pull per farm (~3,650 rows, free
// tier ≈10k calls/day) → derived normals cached hard in localStorage.
// Units: temperatures °C, precip + ET₀ mm (ET₀ = FAO-56 reference ET), GDD in
// °C·day (base 10 °C). Frost dates are medians over the window computed from
// ERA5 2 m tmin — a climate NORMAL, not an agrometeorological guarantee for
// any specific year.

import { doyToMonthDay } from '@/lib/frost';

/** Daily archive arrays; `time` holds "YYYY-MM-DD" keys, all indices aligned. */
export interface ArchiveDaily {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  et0_fao_evapotranspiration: (number | null)[];
}

export interface ClimateNormals {
  startYear: number;
  endYear: number;
  baselineTempC: number; // growing-season (N: Apr–Sep, S: Oct–Mar) mean of daily (tmax+tmin)/2, °C
  annualGddBase10C: number; // mean annual Σ max(0, (tmax+tmin)/2 − 10), °C·day
  annualPrecipMm: number; // mean annual precipitation total, mm
  lastFrost: string | null; // "MM-DD", median across years of the last tmin<0 day (N: Jan–Jun, S: Jul–Dec half)
  firstFrost: string | null; // "MM-DD", mirror half (N: Jul–Dec, S: Jan–Jun)
  tropical: boolean; // <2 of the years had any frost day → frost dates are null
  monthly: { month: number; tminC: number; tmaxC: number; precipMm: number; et0Mm: number }[]; // 1..12 cross-year means (precip/et0 = mean of monthly totals)
}

interface ClimateCacheEntry {
  version: 1;
  startYear: number;
  endYear: number;
  normals: ClimateNormals;
}

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const WINDOW_YEARS = 10;
const MIN_YEAR_DAYS = 300; // a calendar year counts as "usable" with ≥300 usable days
const BASE_GDD_C = 10;

const cacheKey = (lat: number, lng: number) => `ff-pro:climate:${lat.toFixed(2)},${lng.toFixed(2)}`;

// Last 10 COMPLETE calendar years (this year is never complete).
function planWindow(): { startYear: number; endYear: number } {
  const endYear = new Date().getUTCFullYear() - 1;
  return { startYear: endYear - (WINDOW_YEARS - 1), endYear };
}

// In-flight dedupe per coords (localStorage is the durable cache; failures are
// never memoized, so a later call can retry).
const inflight = new Map<string, Promise<ClimateNormals | null>>();

function readCache(key: string, startYear: number, endYear: number): ClimateNormals | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ClimateCacheEntry;
    if (!entry || entry.version !== 1) return null;
    if (entry.startYear !== startYear || entry.endYear !== endYear) return null;
    const n = entry.normals;
    if (!n || typeof n.baselineTempC !== 'number' || !Array.isArray(n.monthly) || n.monthly.length !== 12) return null;
    return n;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: ClimateCacheEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // quota / private mode — session-only is fine
  }
}

export async function fetchClimateNormals(lat: number, lng: number): Promise<ClimateNormals | null> {
  const { startYear, endYear } = planWindow();
  const key = cacheKey(lat, lng);
  const cached = readCache(key, startYear, endYear);
  if (cached) return cached;
  const hit = inflight.get(key);
  if (hit) return hit;
  const promise = (async (): Promise<ClimateNormals | null> => {
    try {
      const url =
        `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
        `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
        `&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as { daily?: Partial<ArchiveDaily> | null };
      const daily = json?.daily;
      if (!daily) return null;
      const normals = deriveClimateNormals(lat, startYear, endYear, daily as ArchiveDaily);
      if (normals) writeCache(key, { version: 1, startYear, endYear, normals });
      return normals;
    } catch {
      return null; // never throw past the module boundary
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUM_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function doyOf(ds: string): number {
  const m = Number(ds.slice(5, 7));
  const doy = CUM_DAYS[m - 1] + Number(ds.slice(8, 10));
  return m > 2 && isLeap(Number(ds.slice(0, 4))) ? doy + 1 : doy;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const zeros = (): number[] => new Array<number>(12).fill(0);

interface YearAccum {
  tempDays: number; // days with usable tmin+tmax
  growSum: number;
  growN: number;
  gdd: number;
  anyFrost: boolean;
  lastFrostDoy: number | null;
  firstFrostDoy: number | null;
  mTminSum: number[];
  mTminN: number[];
  mTmaxSum: number[];
  mTmaxN: number[];
  mPrecip: number[];
  mPrecipN: number[];
  mEt0: number[];
  mEt0N: number[];
}

function newAccum(): YearAccum {
  return {
    tempDays: 0, growSum: 0, growN: 0, gdd: 0,
    anyFrost: false, lastFrostDoy: null, firstFrostDoy: null,
    mTminSum: zeros(), mTminN: zeros(),
    mTmaxSum: zeros(), mTmaxN: zeros(),
    mPrecip: zeros(), mPrecipN: zeros(),
    mEt0: zeros(), mEt0N: zeros(),
  };
}

// Pure derivation from already-fetched daily arrays. Returns null on malformed
// input or when <3 usable years remain (ERA5 gaps: days with null tmin/tmax
// are skipped for temperature stats rather than poisoning means with NaN;
// null precip/et0 values contribute 0 — gaps are rare and never fabricate rain).
export function deriveClimateNormals(
  lat: number,
  startYear: number,
  endYear: number,
  daily: ArchiveDaily,
): ClimateNormals | null {
  const { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: precip, et0_fao_evapotranspiration: et0 } = daily;
  const n = time?.length ?? 0;
  if (!n) return null;
  if (!Array.isArray(tmax) || !Array.isArray(tmin) || !Array.isArray(precip) || !Array.isArray(et0)) return null;
  if (tmax.length !== n || tmin.length !== n || precip.length !== n || et0.length !== n) return null;

  const north = lat >= 0;
  const growMonths = new Set(north ? [4, 5, 6, 7, 8, 9] : [10, 11, 12, 1, 2, 3]);
  const lastHalf = new Set(north ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]); // half where frost season ends
  const firstHalf = new Set(north ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6]); // half where it starts

  const val = (arr: (number | null)[], i: number): number | null => {
    const v = arr[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  const years = new Map<number, YearAccum>();
  for (let i = 0; i < n; i++) {
    const ds = time[i];
    if (typeof ds !== 'string' || !DATE_RE.test(ds)) continue;
    const y = Number(ds.slice(0, 4));
    const mo = Number(ds.slice(5, 7));
    const acc = years.get(y) ?? newAccum();
    years.set(y, acc);

    const tx = val(tmax, i);
    const tn = val(tmin, i);
    const pr = val(precip, i);
    const ev = val(et0, i);

    if (tx !== null && tn !== null) {
      const tmean = (tx + tn) / 2;
      acc.tempDays++;
      acc.mTminSum[mo - 1] += tn;
      acc.mTminN[mo - 1]++;
      acc.mTmaxSum[mo - 1] += tx;
      acc.mTmaxN[mo - 1]++;
      if (growMonths.has(mo)) {
        acc.growSum += tmean;
        acc.growN++;
      }
      acc.gdd += Math.max(0, tmean - BASE_GDD_C);
      if (tn < 0) {
        acc.anyFrost = true;
        const doy = doyOf(ds);
        if (lastHalf.has(mo)) acc.lastFrostDoy = Math.max(acc.lastFrostDoy ?? -Infinity, doy);
        if (firstHalf.has(mo)) acc.firstFrostDoy = acc.firstFrostDoy === null ? doy : Math.min(acc.firstFrostDoy, doy);
      }
    }
    if (pr !== null) {
      acc.mPrecip[mo - 1] += pr;
      acc.mPrecipN[mo - 1]++;
    }
    if (ev !== null) {
      acc.mEt0[mo - 1] += ev;
      acc.mEt0N[mo - 1]++;
    }
  }

  const usable = [...years.values()].filter((a) => a.tempDays >= MIN_YEAR_DAYS);
  if (usable.length < 3) return null;

  let growSum = 0;
  let growN = 0;
  let gdd = 0;
  let precipTotal = 0;
  let frostYears = 0;
  const lastDoys: number[] = [];
  const firstDoys: number[] = [];
  const mTminSum = zeros();
  const mTminN = zeros();
  const mTmaxSum = zeros();
  const mTmaxN = zeros();
  const mPrecipTot = zeros();
  const mPrecipYears = zeros(); // years with ≥1 data day in that month
  const mEt0Tot = zeros();
  const mEt0Years = zeros();

  for (const a of usable) {
    growSum += a.growSum;
    growN += a.growN;
    gdd += a.gdd;
    precipTotal += a.mPrecip.reduce((s, v) => s + v, 0);
    if (a.anyFrost) frostYears++;
    if (a.lastFrostDoy !== null) lastDoys.push(a.lastFrostDoy);
    if (a.firstFrostDoy !== null) firstDoys.push(a.firstFrostDoy);
    for (let m = 0; m < 12; m++) {
      mTminSum[m] += a.mTminSum[m];
      mTminN[m] += a.mTminN[m];
      mTmaxSum[m] += a.mTmaxSum[m];
      mTmaxN[m] += a.mTmaxN[m];
      if (a.mPrecipN[m] > 0) {
        mPrecipTot[m] += a.mPrecip[m];
        mPrecipYears[m]++;
      }
      if (a.mEt0N[m] > 0) {
        mEt0Tot[m] += a.mEt0[m];
        mEt0Years[m]++;
      }
    }
  }

  if (growN === 0) return null;
  const tropical = frostYears < 2;
  const lastDoy = median(lastDoys);
  const firstDoy = median(firstDoys);

  return {
    startYear,
    endYear,
    baselineTempC: round2(growSum / growN),
    annualGddBase10C: round2(gdd / usable.length),
    annualPrecipMm: round2(precipTotal / usable.length),
    lastFrost: tropical || lastDoy === null ? null : doyToMonthDay(lastDoy),
    firstFrost: tropical || firstDoy === null ? null : doyToMonthDay(firstDoy),
    tropical,
    monthly: Array.from({ length: 12 }, (_, m) => ({
      month: m + 1,
      tminC: mTminN[m] ? round2(mTminSum[m] / mTminN[m]) : 0,
      tmaxC: mTmaxN[m] ? round2(mTmaxSum[m] / mTmaxN[m]) : 0,
      precipMm: mPrecipYears[m] ? round2(mPrecipTot[m] / mPrecipYears[m]) : 0,
      et0Mm: mEt0Years[m] ? round2(mEt0Tot[m] / mEt0Years[m]) : 0,
    })),
  };
}
