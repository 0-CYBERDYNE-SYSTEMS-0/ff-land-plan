/**
 * Run-environment → live-weather bridge (SPEC-GROWTH-VISUAL wave 4).
 *
 * When a sim run is active, the world's weather presentation (clouds, rain/
 * snow, fog, wind sway, sun dimming) must tell the run's story — a drought
 * day looks like drought — instead of showing the live forecast. This module
 * projects one `DailyEnvironment` (the run's envSeries day) onto the
 * `WeatherCurrent` shape the renderer already consumes. Pure and
 * deterministic: same env ⇒ same weather, no clock, no rng.
 *
 * The no-run path never calls this — World3D keeps reading the live ref
 * byte-identically when no run is active.
 */

import type { WeatherCurrent } from '@/types';
import type { DailyEnvironment } from './types';

/** WMO-ish weather codes (Open-Meteo convention used by src/lib/weather.ts). */
const CODE_CLEAR = 0;
const CODE_OVERCAST = 3;
const CODE_RAIN = 63;
const CODE_SNOW = 71;

/**
 * Project a run day's environment onto the live-weather shape. `base`
 * supplies the fields the environment series has no opinion about (uvIndex
 * etc.) so the result is always a complete WeatherCurrent.
 */
export function envToWeatherCurrent(env: DailyEnvironment, base: WeatherCurrent): WeatherCurrent {
  const tempC = (env.tMinC + env.tMaxC) / 2;
  const precipMm = Math.max(0, env.precipMm);
  // Aridity 0..1: high ET₀ with no rain is a drought day.
  const aridity = Math.min(1, Math.max(0, (env.etoMm - precipMm * 0.5) / 8));
  // cloudCover is in PERCENT in WeatherCurrent (default 30) — rain storms in,
  // drought stays near-cloudless.
  const cloudCover = Math.min(98, Math.max(4, 4 + precipMm * 7.5));
  // Humidity runs with rain and against drought — it gates the fog system
  // (weather-fx: fog above 70%), so drought days stay crisp and hazy-free.
  const humidity = Math.min(96, Math.max(22, Math.round(42 + precipMm * 5.5 - aridity * 18)));
  const windSpeedKmh = 6 + precipMm * 2.2 + aridity * 2;

  let weatherCode = CODE_CLEAR;
  let weatherDesc = 'Clear (sim)';
  if (precipMm > 0.2) {
    if (tempC <= 2) {
      weatherCode = CODE_SNOW;
      weatherDesc = 'Snow (sim)';
    } else {
      weatherCode = CODE_RAIN;
      weatherDesc = 'Rain (sim)';
    }
  } else if (cloudCover > 60) {
    weatherCode = CODE_OVERCAST;
    weatherDesc = 'Overcast (sim)';
  }

  return {
    ...base,
    tempC,
    precipMm,
    cloudCover,
    humidity,
    windSpeedKmh,
    weatherCode,
    weatherDesc,
    feelsLikeC: tempC,
    soilTempC: tempC - 1.5,
    soilMoisture: Math.min(1, Math.max(0.02, 0.1 + precipMm * 0.06 + (1 - aridity) * 0.2)),
  };
}
