// Ground-truth soil profile per farm location. Primary source: USDA NRCS Soil
// Data Access (SDA / SSURGO — US only, keyless, CORS-open; error bodies are
// XML even when JSON was requested). Fallback: ISRIC SoilGrids classification
// (global, class NAME only — its properties endpoint is paused as of
// 2026-09, so texture/chemistry stay null there). Soil is static: cache
// forever in localStorage; `clearSoilCache` lets the UI force a refetch.

export interface SoilProfile {
  source: 'usda-sda' | 'soilgrids';
  name: string; // SDA map unit name, or best SoilGrids class (USDA class when present, else WRB)
  texture: { sandPct: number; siltPct: number; clayPct: number } | null; // SDA sandtotal_r/silttotal_r/claytotal_r (%)
  ph: number | null; // SDA ph1to1h2o_r (1:1 water pH)
  organicMatterPct: number | null; // SDA om_r (% by weight)
  cecCmolKg: number | null; // SDA cec7_r — CEC in cmol(+)/kg, used as-is
  awcMmPerCm: number | null; // SDA awc_r is cm/cm; ×10 → mm of water held per cm of soil
  soilType: 'loam' | 'clay' | 'sandy' | 'silt' | null; // simplified USDA triangle from texture; null when texture unknown
}

const SDA_URL = 'https://sdmdataaccess.nrcs.usda.gov/Tabular/SDMTabularService/post.rest';
const SOILGRIDS_URL = 'https://rest.isric.org/soilgrids/v2.0/classification/query';
const TIMEOUT_MS = 20_000;

const cacheKey = (lat: number, lng: number) => `ff-pro:soil:${lat.toFixed(2)},${lng.toFixed(2)}`;

// Dedupe concurrent lookups per coordinate (same pattern as weatherMemo in
// localApi.ts); no TTL — successful results go to localStorage forever.
const inflight = new Map<string, Promise<SoilProfile | null>>();

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// One SDA round-trip. Errors come back as XML (`ServiceExceptionReport`) even
// with format=JSON — any body not starting with `{` is a failure, and JSON
// parse failures are caught by the caller.
async function sdaQuery(sql: string): Promise<unknown[][] | null> {
  const text = await fetchText(SDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ format: 'JSON', query: sql }),
  });
  if (!text.startsWith('{')) return null;
  const data = JSON.parse(text) as { Table?: unknown };
  if (!Array.isArray(data.Table)) return null;
  return data.Table as unknown[][];
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Simplified USDA texture triangle (documented simplification, applied in
// order): clay ≥ 40 → 'clay'; sand ≥ 70 → 'sandy'; silt ≥ 80, or sand < 20
// with silt ≥ 60 → 'silt'; everything else → 'loam'.
export function deriveSoilType(t: SoilProfile['texture']): SoilProfile['soilType'] {
  if (!t) return null;
  if (t.clayPct >= 40) return 'clay';
  if (t.sandPct >= 70) return 'sandy';
  if (t.siltPct >= 80 || (t.sandPct < 20 && t.siltPct >= 60)) return 'silt';
  return 'loam';
}

// Step 1: point → map unit (WKT is `point(lon lat)`). Step 2: major
// component's (majcompflag, highest comppct_r) shallowest surface horizon.
// A map unit with no usable horizon row counts as "no SDA data" so non-soil
// units (e.g. Urban land) still get a SoilGrids class name.
async function fetchSda(lat: number, lng: number): Promise<SoilProfile | null> {
  const mukeys = await sdaQuery(
    `SELECT mukey, muname FROM mapunit WHERE mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lng} ${lat})'))`,
  );
  const mukeyRow = mukeys?.[0];
  const mukey = num(mukeyRow?.[0]);
  const muname = typeof mukeyRow?.[1] === 'string' ? (mukeyRow[1] as string) : '';
  if (!mukey || !muname) return null;
  const horizons = await sdaQuery(
    `SELECT TOP 1 ch.sandtotal_r, ch.silttotal_r, ch.claytotal_r, ch.ph1to1h2o_r, ch.om_r, ch.cec7_r, ch.awc_r ` +
      `FROM component c INNER JOIN chorizon ch ON ch.cokey = c.cokey ` +
      `WHERE c.mukey = ${mukey} AND c.majcompflag = 'Yes' AND ch.hzdept_r IS NOT NULL ` +
      `ORDER BY c.comppct_r DESC, ch.hzdept_r ASC`,
  );
  const h = horizons?.[0];
  if (!h) return null;
  const sandPct = num(h[0]);
  const siltPct = num(h[1]);
  const clayPct = num(h[2]);
  const texture =
    sandPct !== null && siltPct !== null && clayPct !== null ? { sandPct, siltPct, clayPct } : null;
  const awc = num(h[6]);
  return {
    source: 'usda-sda',
    name: muname,
    texture,
    ph: num(h[3]),
    organicMatterPct: num(h[4]),
    cecCmolKg: num(h[5]),
    awcMmPerCm: awc === null ? null : Math.round(awc * 1000) / 100,
    soilType: deriveSoilType(texture),
  };
}

// Classification only — the SoilGrids properties endpoint is paused (all
// nulls, verified 2026-09) and is intentionally NOT called here.
async function fetchSoilgrids(lat: number, lng: number): Promise<SoilProfile | null> {
  const text = await fetchText(`${SOILGRIDS_URL}?lat=${lat}&lon=${lng}&number=5`);
  const data = JSON.parse(text) as { usda_class_name?: unknown; wrb_class_name?: unknown };
  const name =
    typeof data.usda_class_name === 'string' && data.usda_class_name
      ? data.usda_class_name
      : typeof data.wrb_class_name === 'string'
        ? data.wrb_class_name
        : '';
  if (!name) return null;
  return {
    source: 'soilgrids',
    name,
    texture: null,
    ph: null,
    organicMatterPct: null,
    cecCmolKg: null,
    awcMmPerCm: null,
    soilType: null,
  };
}

interface CacheBlob {
  v: 1;
  p: SoilProfile;
}

function readCache(key: string): SoilProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const blob = JSON.parse(raw) as CacheBlob;
    if (blob.v !== 1 || !blob.p || typeof blob.p.name !== 'string') return null;
    return blob.p;
  } catch {
    return null;
  }
}

function writeCache(key: string, profile: SoilProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify({ v: 1, p: profile } satisfies CacheBlob));
  } catch {
    // quota / private mode — cache is best-effort
  }
}

// Try SDA → SoilGrids → null. Resolves null on any failure, never rejects.
export function fetchSoilProfile(lat: number, lng: number): Promise<SoilProfile | null> {
  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  const hit = inflight.get(key);
  if (hit) return hit;
  const promise = (async () => {
    let profile: SoilProfile | null = null;
    try {
      profile = (await fetchSda(lat, lng)) ?? (await fetchSoilgrids(lat, lng));
    } catch {
      profile = null; // never throw past the module
    }
    if (profile) writeCache(key, profile);
    else inflight.delete(key); // failed lookup: allow a retry on the next call
    return profile;
  })();
  inflight.set(key, promise);
  return promise;
}

export function clearSoilCache(lat: number, lng: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(cacheKey(lat, lng));
  } catch {
    // best-effort
  }
}
