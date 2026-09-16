// Real weather via Open-Meteo (free, keyless, CORS-enabled).
// Trap (verified): soil temperature/moisture and UV are HOURLY-only variables —
// they are not available in `current=`. We request them hourly and read the
// array element matching `current.time` (requires `timezone=auto` so indices
// align with local time).

import type { Alert, ForecastDay, Weather, WeatherHistoryPoint } from '@/types';

const WMO_DESC: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  56: 'Freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

export const wmoDescription = (code: number): string => WMO_DESC[code] ?? 'Unknown';

interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    cloud_cover: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    soil_temperature_0cm: (number | null)[];
    soil_moisture_0_to_1cm: (number | null)[];
    uv_index: (number | null)[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

export interface FarmWeather {
  weather: Weather;
  forecast: ForecastDay[];
  history: WeatherHistoryPoint[];
}

const lastGoodKey = (lat: number, lng: number) =>
  `ff-pro:weather:${lat.toFixed(2)},${lng.toFixed(2)}`;

function readLastGood(lat: number, lng: number): FarmWeather | null {
  try {
    const raw = localStorage.getItem(lastGoodKey(lat, lng));
    return raw ? (JSON.parse(raw) as FarmWeather) : null;
  } catch {
    return null;
  }
}

function writeLastGood(lat: number, lng: number, data: FarmWeather) {
  try {
    localStorage.setItem(lastGoodKey(lat, lng), JSON.stringify(data));
  } catch {
    // quota — last-good cache is best-effort
  }
}

export async function fetchFarmWeather(lat: number, lng: number): Promise<FarmWeather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,cloud_cover,weather_code',
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,soil_temperature_0cm,soil_moisture_0_to_1cm,uv_index',
  );
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
  );
  url.searchParams.set('past_days', '1');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  let json: OpenMeteoResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    json = (await res.json()) as OpenMeteoResponse;
  } catch (err) {
    const cached = readLastGood(lat, lng);
    if (cached) {
      return { ...cached, weather: { ...cached.weather, cached: true } };
    }
    throw err instanceof Error ? err : new Error('Weather fetch failed');
  }

  const { current, hourly, daily } = json;
  // Locate the current hour in the hourly arrays ("2026-06-11T14:23" → "2026-06-11T14:00").
  const hourIso = `${current.time.slice(0, 13)}:00`;
  let idx = hourly.time.indexOf(hourIso);
  if (idx === -1) idx = Math.max(0, hourly.time.length - 1);

  const weather: Weather = {
    current: {
      tempC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeedKmh: current.wind_speed_10m,
      precipMm: current.precipitation,
      uvIndex: hourly.uv_index[idx] ?? 0,
      cloudCover: current.cloud_cover,
      soilTempC: hourly.soil_temperature_0cm[idx] ?? current.temperature_2m,
      // Open-Meteo soil moisture is volumetric m³/m³ (~0–0.5); express as %.
      soilMoisture: Math.round((hourly.soil_moisture_0_to_1cm[idx] ?? 0) * 200),
      weatherCode: current.weather_code,
      weatherDesc: wmoDescription(current.weather_code),
    },
    cached: false,
    timestamp: new Date().toISOString(),
  };

  // Forecast: skip the past day (index 0), keep the next 7.
  const forecast: ForecastDay[] = daily.time
    .map((date, i) => ({
      date,
      maxTempC: daily.temperature_2m_max[i],
      minTempC: daily.temperature_2m_min[i],
      precipMm: daily.precipitation_sum[i],
      weatherCode: daily.weather_code[i],
    }))
    .slice(1);

  // History: the trailing 24 completed hours.
  const history: WeatherHistoryPoint[] = [];
  for (let i = Math.max(0, idx - 24); i < idx; i++) {
    history.push({
      tempC: hourly.temperature_2m[i],
      humidity: hourly.relative_humidity_2m[i],
      soilMoisture: Math.round((hourly.soil_moisture_0_to_1cm[i] ?? 0) * 200),
    });
  }

  const result = { weather, forecast, history };
  writeLastGood(lat, lng, result);
  return result;
}

// --- Real alerts, derived from the live forecast ---------------------------

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Alert ids are deterministic hashes of farm:type:date, so read-state can be
// persisted against the id across recomputations.
export function deriveAlerts(
  farmId: number,
  forecast: ForecastDay[],
  isRead: (id: number) => boolean,
  soilMoisturePct?: number | null,
): Alert[] {
  const alerts: Alert[] = [];
  const push = (
    alertType: Alert['alertType'],
    severity: Alert['severity'],
    message: string,
    date: string,
  ) => {
    const id = hashId(`${farmId}:${alertType}:${date}`);
    alerts.push({
      id,
      farmId,
      alertType,
      severity,
      message,
      isRead: isRead(id),
      createdAt: new Date().toISOString(),
    });
  };

  forecast.slice(0, 3).forEach((d) => {
    if (d.minTempC <= -2) {
      push('frost', 'critical', `Hard freeze ${d.date}: low of ${Math.round(d.minTempC)}°C — protect or harvest tender crops.`, d.date);
    } else if (d.minTempC <= 2) {
      push('frost', 'warning', `Frost risk ${d.date}: low of ${Math.round(d.minTempC)}°C — cover tender plants overnight.`, d.date);
    }
    if (d.maxTempC >= 40) {
      push('heat', 'critical', `Extreme heat ${d.date}: high of ${Math.round(d.maxTempC)}°C — shade cloth and deep watering needed.`, d.date);
    } else if (d.maxTempC >= 35) {
      push('heat', 'warning', `Heat stress ${d.date}: high of ${Math.round(d.maxTempC)}°C — water early, watch transplants.`, d.date);
    }
    if (d.precipMm >= 50) {
      push('flood', 'critical', `Very heavy rain ${d.date}: ${Math.round(d.precipMm)} mm forecast — check drainage and low beds.`, d.date);
    } else if (d.precipMm >= 25) {
      push('flood', 'warning', `Heavy rain ${d.date}: ${Math.round(d.precipMm)} mm forecast — hold off on irrigation.`, d.date);
    }
  });

  const weekPrecip = forecast.reduce((s, d) => s + d.precipMm, 0);
  // Gate on current soil moisture when we have it (audit OPS-008): with wet
  // soil the Weather page correctly says Irrigation Need "Low" — the dashboard
  // must not contradict it with "plan irrigation". Same 40% threshold as the
  // Weather indicator.
  if (
    forecast.length >= 6 &&
    weekPrecip < 5 &&
    (soilMoisturePct == null || soilMoisturePct <= 40)
  ) {
    push('drought', 'info', `Dry week ahead: only ${weekPrecip.toFixed(1)} mm of rain forecast over ${forecast.length} days — plan irrigation.`, forecast[0].date);
  }

  return alerts;
}
