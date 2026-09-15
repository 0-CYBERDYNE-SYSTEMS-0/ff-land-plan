// River flood exposure via Open-Meteo's GloFAS downstream API (free, keyless,
// CORS `*`). One request covers 30 d history + 7 d forecast of daily river
// discharge (m³/s). GloFAS publishes no absolute risk thresholds, so risk is
// RELATIVE: the forecast-window max is compared against the past-30-day
// distribution (≥ p95 'high', ≥ p75 'elevated', else 'low'). Points with no
// river (ocean/coastal) return all-null series ⇒ null.

export type FloodRiskLevel = 'low' | 'elevated' | 'high';

export interface FloodRisk {
  dischargeM3s: number;
  riskLevel: FloodRiskLevel;
  fetchedAt: string;
}

interface OtmFloodResponse {
  daily: {
    time: string[];
    river_discharge: (number | null)[];
  };
}

// 12 h TTL memo per coordinate; dedupes in-flight requests (weatherMemo
// pattern in localApi.ts). Failures are not memoized.
const TTL_MS = 12 * 60 * 60 * 1000;
const memo = new Map<string, { at: number; promise: Promise<FloodRisk | null> }>();

// Percentile by simple sorted-index: ascending sort, index = floor(p/100 ×
// (n−1)). Good enough for a 30-sample baseline and fully deterministic.
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function fetchFloodRisk(lat: number, lng: number): Promise<FloodRisk | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async (): Promise<FloodRisk | null> => {
    try {
      const url = new URL('https://flood-api.open-meteo.com/v1/flood');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
      url.searchParams.set('daily', 'river_discharge');
      url.searchParams.set('past_days', '30');
      url.searchParams.set('forecast_days', '7');
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as OtmFloodResponse;
      const series = json.daily?.river_discharge;
      if (!series || series.length < 8) return null;
      // Layout: past_days=30 + forecast_days=7 ⇒ history first, last 7 = forecast window.
      const forecast = series.slice(-7);
      const history = series.slice(0, -7).filter((v): v is number => typeof v === 'number');
      const fMax = Math.max(
        ...forecast.filter((v): v is number => typeof v === 'number'),
      );
      // No usable history or no discharge at all (ocean/coastal cell) ⇒ null.
      if (!Number.isFinite(fMax) || history.length < 5) return null;
      const p95 = percentile(history, 95);
      const p75 = percentile(history, 75);
      const riskLevel: FloodRiskLevel = fMax >= p95 ? 'high' : fMax >= p75 ? 'elevated' : 'low';
      return { dischargeM3s: fMax, riskLevel, fetchedAt: new Date().toISOString() };
    } catch {
      return null; // never throw past the module boundary
    }
  })();
  memo.set(key, { at: Date.now(), promise });
  return promise;
}
