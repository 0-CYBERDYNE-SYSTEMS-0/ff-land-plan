// Air quality via Open-Meteo's CAMS downstream API (free, keyless, CORS `*`).
// Ozone is HOURLY-only, so we read the array element for the current local
// hour (same hourly-index approach as weather.ts; `timezone=auto` aligns the
// array with local wall-clock time).

export interface AirQuality {
  ozoneUgM3: number | null;
  fetchedAt: string;
}

interface OtmAirQualityResponse {
  utc_offset_seconds: number;
  hourly: {
    time: string[];
    ozone: (number | null)[];
  };
}

// 1 h TTL memo per coordinate; dedupes in-flight requests (weatherMemo
// pattern in localApi.ts). Failures are not memoized.
const TTL_MS = 60 * 60 * 1000;
const memo = new Map<string, { at: number; promise: Promise<AirQuality | null> }>();

export function fetchAirQuality(lat: number, lng: number): Promise<AirQuality | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async (): Promise<AirQuality | null> => {
    try {
      const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
      url.searchParams.set('hourly', 'ozone');
      url.searchParams.set('forecast_days', '3');
      url.searchParams.set('timezone', 'auto');
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as OtmAirQualityResponse;
      const { hourly, utc_offset_seconds: off } = json;
      if (!hourly?.time?.length) return null;
      // Current hour in the location's local time: shift now by the API's
      // UTC offset, then truncate ("...T14:37" → "...T14:00") — mirrors the
      // weather.ts hourly-index pattern without a second request.
      const local = new Date(Date.now() + off * 1000);
      const hourIso = local.toISOString().slice(0, 13) + ':00';
      let idx = hourly.time.indexOf(hourIso);
      if (idx === -1) idx = Math.max(0, hourly.time.length - 1);
      const ozone = hourly.ozone?.[idx] ?? null;
      return { ozoneUgM3: typeof ozone === 'number' ? ozone : null, fetchedAt: new Date().toISOString() };
    } catch {
      return null; // never throw past the module boundary
    }
  })();
  memo.set(key, { at: Date.now(), promise });
  return promise;
}
