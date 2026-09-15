// CMIP6 climate projections via the Open-Meteo Climate API (keyless/CORS*,
// HEAVILY weighted — exactly TWO short 5-year windows per cache miss, cached
// FOREVER in localStorage: projections do not change). Baseline 2021–2025 vs
// horizon 2041–2045, single model MRI_AGCM3_2_S, daily tmean + precip.
// Deltas: ΔT = mean(tmean₂₀₄₀s) − mean(tmean₂₀₂₀s); precip % change guarded —
// if either window's mean monthly precip < 5 mm the relative delta is
// meaningless (arid/frozen baseline) ⇒ deltaPrecipPct = null and the sim
// applies the temperature delta only. Never throws.
// Live-verified 2026-09-04 from the sandbox (Portland OR): daily arrays return
// as documented with °C / mm units.

export interface ClimateProjection {
  model: string;
  horizon: string;
  deltaTempC: number;
  deltaPrecipPct: number | null;
}

interface Cmip6CacheEntry {
  version: 1;
  projection: ClimateProjection;
}

const CMIP6_URL = 'https://climate-api.open-meteo.com/v1/climate';
const MODEL = 'MRI_AGCM3_2_S'; // single model per spec — keeps deltas cheap and deterministic
const BASELINE = { start: '2021-01-01', end: '2025-12-31' }; // near-present 5-y window
const HORIZON = { start: '2041-01-01', end: '2045-12-31' }; // "2040s" 5-y window
const HORIZON_LABEL = '2041-2045';
const MIN_MEAN_MONTHLY_PRECIP_MM = 5; // below this the % precip delta is noise → null (spec guard)
const MONTHS_IN_WINDOW = 60; // 5 years × 12 months

const cacheKey = (lat: number, lng: number) => `ff-pro:cmip6:${lat.toFixed(2)},${lng.toFixed(2)}`;

interface Cmip6Payload {
  daily?: {
    time?: unknown;
    temperature_2m_mean?: unknown;
    precipitation_sum?: unknown;
  } | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

async function fetchWindow(lat: number, lng: number, w: { start: string; end: string }): Promise<{ tmeanSum: number; tmeanN: number; precipSum: number } | null> {
  const url =
    `${CMIP6_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${w.start}&end_date=${w.end}&models=${MODEL}` +
    `&daily=temperature_2m_mean,precipitation_sum`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as Cmip6Payload;
  const daily = json?.daily;
  const time = daily?.time;
  const tmean = daily?.temperature_2m_mean;
  const precip = daily?.precipitation_sum;
  if (!Array.isArray(time) || !Array.isArray(tmean) || !Array.isArray(precip)) return null;
  if (tmean.length !== time.length || precip.length !== time.length) return null;
  let tmeanSum = 0;
  let tmeanN = 0;
  let precipSum = 0;
  for (let i = 0; i < time.length; i++) {
    const t = tmean[i];
    const p = precip[i];
    if (finite(t)) {
      tmeanSum += t;
      tmeanN++;
    }
    if (finite(p)) precipSum += p;
  }
  if (tmeanN === 0) return null;
  return { tmeanSum, tmeanN, precipSum };
}

/**
 * Fetch the CMIP6 2040s-vs-baseline deltas for a point. Exactly two network
 * requests per cache miss; result cached forever. Never throws.
 */
export async function fetchClimateProjection(lat: number, lng: number): Promise<ClimateProjection | null> {
  const key = cacheKey(lat, lng);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw) as Cmip6CacheEntry;
      if (entry?.version === 1 && entry.projection) return entry.projection;
    }
  } catch {
    // malformed cache — refetch
  }
  try {
    const [base, fut] = await Promise.all([
      fetchWindow(lat, lng, BASELINE),
      fetchWindow(lat, lng, HORIZON),
    ]);
    if (!base || !fut) return null;
    const deltaTempC = Math.round((fut.tmeanSum / fut.tmeanN - base.tmeanSum / base.tmeanN) * 100) / 100;
    const baseMonthly = base.precipSum / MONTHS_IN_WINDOW;
    const futMonthly = fut.precipSum / MONTHS_IN_WINDOW;
    const deltaPrecipPct =
      baseMonthly < MIN_MEAN_MONTHLY_PRECIP_MM || futMonthly < MIN_MEAN_MONTHLY_PRECIP_MM
        ? null
        : Math.round(((futMonthly - baseMonthly) / baseMonthly) * 100 * 100) / 100;
    const projection: ClimateProjection = { model: MODEL, horizon: HORIZON_LABEL, deltaTempC, deltaPrecipPct };
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, projection } satisfies Cmip6CacheEntry));
    } catch {
      // quota / private mode — session-only is fine
    }
    return projection;
  } catch {
    return null; // never throw past the module boundary
  }
}
