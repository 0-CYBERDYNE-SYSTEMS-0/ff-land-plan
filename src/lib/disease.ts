// Disease (blight/mildew) pressure index from the Open-Meteo forecast API
// (free, keyless, CORS `*` — same family as weather.ts).
//
// Model: classic Hjärne-type late-blight/downy-mildew thresholds used by
// Colorado State Extension and other land-grant literature for potato
// late blight and cucurbit downy mildew "blight units" — an hour is risky
// when relative humidity ≥ 90 % AND temperature is between 10 °C and 25 °C
// (cool, wet leaf-wetness conditions in which Phytophthora infestans and
// downy mildew oospores sporulate). Daily score = riskyHours / 24; the
// 7-day index is a weighted mean of the 7 daily scores × 100 ⇒ 0–100.
// Weights decay linearly from day 1 (w = 2.0) to day 7 (w = 1.0), so today
// counts double the last forecast day — near-term pressure matters most for
// "scout today" guidance.

export interface DiseasePressure {
  index: number; // 0–100
  riskLevel: 'low' | 'moderate' | 'high';
  fetchedAt: string;
}

interface OtmForecastResponse {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    relative_humidity_2m: (number | null)[];
  };
}

// Origin comments: Hjärne-type late-blight thresholds (Colorado State
// Extension convention) — see module header.
const RISKY_RH_PCT = 90;
const RISKY_T_MIN_C = 10;
const RISKY_T_MAX_C = 25;
const HIGH_INDEX = 50; // ≥ 50 ⇒ high
const MODERATE_INDEX = 25; // ≥ 25 ⇒ moderate, else low
const DAYS = 7;
const HOURS_PER_DAY = 24;

// 1 h TTL memo per coordinate; dedupes in-flight requests (weatherMemo /
// airquality.ts pattern). Failures are not memoized.
const TTL_MS = 60 * 60 * 1000;
const memo = new Map<string, { at: number; promise: Promise<DiseasePressure | null> }>();

function riskLevelFor(index: number): DiseasePressure['riskLevel'] {
  if (index >= HIGH_INDEX) return 'high';
  if (index >= MODERATE_INDEX) return 'moderate';
  return 'low';
}

export function fetchDiseasePressure(lat: number, lng: number): Promise<DiseasePressure | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async (): Promise<DiseasePressure | null> => {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
      url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m');
      url.searchParams.set('forecast_days', String(DAYS));
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as OtmForecastResponse;
      const { hourly } = json;
      // Guard malformed/short arrays (timezone=auto ⇒ rows are local days).
      if (!hourly?.time?.length) return null;
      const temps = hourly.temperature_2m ?? [];
      const rhs = hourly.relative_humidity_2m ?? [];
      if (!temps.length || temps.length !== hourly.time.length || rhs.length !== temps.length) {
        return null;
      }

      // Bucket risky hours per local calendar day (same string prefix the
      // weather.ts daily rows use, thanks to timezone=auto).
      const perDay = new Map<string, { risky: number; hours: number }>();
      for (let i = 0; i < temps.length; i++) {
        const t = temps[i];
        const rh = rhs[i];
        if (typeof t !== 'number' || typeof rh !== 'number') continue;
        const day = hourly.time[i].slice(0, 10);
        const slot = perDay.get(day) ?? { risky: 0, hours: 0 };
        slot.hours += 1;
        if (rh >= RISKY_RH_PCT && t >= RISKY_T_MIN_C && t <= RISKY_T_MAX_C) slot.risky += 1;
        perDay.set(day, slot);
      }
      if (!perDay.size) return null;

      // Daily score = riskyHours/24 (HOURS_PER_DAY, not the observed count —
      // partial edge days then contribute proportionally). Weighted mean with
      // linear decay: day i (1-based) gets w = 2 − (i − 1)/6.
      let weighted = 0;
      let weightSum = 0;
      let day = 0;
      for (const slot of perDay.values()) {
        day += 1;
        const weight = 2 - (day - 1) / (DAYS - 1);
        weighted += (slot.risky / HOURS_PER_DAY) * weight;
        weightSum += weight;
      }
      const index = Math.round((weighted / weightSum) * 100);
      return { index, riskLevel: riskLevelFor(index), fetchedAt: new Date().toISOString() };
    } catch {
      return null; // never throw past the module boundary
    }
  })();
  memo.set(key, { at: Date.now(), promise });
  // Failed lookups (null) must not occupy the TTL slot — drop them so the
  // next call retries; successful results keep their 1 h cache.
  void promise.then((r) => {
    if (r === null) memo.delete(key);
  });
  return promise;
}
