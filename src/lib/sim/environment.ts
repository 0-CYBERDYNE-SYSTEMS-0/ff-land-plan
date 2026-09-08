// Daily environment composer (SPEC-SIM-ECOSYSTEM §3.1 environment.ts).
//
// Provenance ladder per day, best data first (climate.ts is the style
// precedent: cached hard in localStorage, never throws):
//   1. Past dates: Open-Meteo archive API (ERA5 reanalysis) observed daily
//      tmin/tmax/precip/et0 → 'open-meteo-archive'. Cached in localStorage by
//      (lat, lng, range), bounded entry count.
//   2. No archive row (future dates, fetch failure, ERA5 gaps): synthesize a
//      deterministic day from ERA5 climate normals → 'era5-normals'.
//   3. No normals either (offline, nothing cached): documented generic
//      temperate default with a seeded seasonal sine → 'default'.
//   ETO uses the observed archive value when present, else the normals monthly
//   mean, else a documented Hargreaves-style temp-range proxy
//   → 'model-estimate' (never observed data).
// Finally the run scenario (tempDeltaC / precipMultiplier) perturbs the day;
// perturbed fields are re-tagged 'scenario-delta' and keep their pre-scenario
// values in `raw`. Mid-run 'weather' interventions override the global deltas
// from their fromDate on (omitted fields inherit the previous effective value).
//
// Determinism: synthetic variation is drawn from uniform01(seed, dayIndex,
// salt) — same seed ⇒ identical series. No Math.random.

import { fetchClimateNormals, type ClimateNormals } from '@/lib/climate';
import type { Intervention } from './types';
import type { DailyEnvironment, EnvSourceTag } from './types';
import { uniform01 } from './rng';

const MS_DAY = 86_400_000;
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const ARCHIVE_EARLIEST = '1940-01-02';
const ARCHIVE_LAG_DAYS = 6; // ERA5 ingest delay — never request the last week
const CACHE_PREFIX = 'ff-pro:simenv:';
const CACHE_MAX_ENTRIES = 12; // ~365 rows/entry; evict oldest range on overflow

export function isoDayNumber(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / MS_DAY) : 0;
}

export function isoFromDayNumber(day: number): string {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface WeatherOverride {
  fromDate: string;
  tempDeltaC?: number;
  precipMultiplier?: number;
}

/** Mid-run 'weather' interventions as env-composer overrides. */
export function extractWeatherOverrides(
  interventions: readonly Intervention[] | undefined,
): WeatherOverride[] {
  if (!interventions) return [];
  const out: WeatherOverride[] = [];
  for (const iv of interventions) {
    if (iv.kind === 'weather') {
      out.push({
        fromDate: iv.fromDate,
        tempDeltaC: iv.tempDeltaC,
        precipMultiplier: iv.precipMultiplier,
      });
    }
  }
  return out;
}

export interface BuildEnvOpts {
  lat: number;
  lng: number;
  tempDeltaC: number;
  precipMultiplier: number;
  /** Preloaded normals; undefined → fetch (forever-cached, never throws);
   * null → skip the fetch (known offline / already failed). */
  climateNormals?: ClimateNormals | null;
  weatherOverrides?: WeatherOverride[];
}

interface ArchiveRow {
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  etoMm: number | null; // null → per-day ETO proxy fallback
}

interface ArchiveCacheBlob {
  v: 1;
  lat: number;
  lng: number;
  start: string;
  end: string;
  days: Record<string, ArchiveRow>;
}

function readArchiveCache(key: string, lat: number, lng: number, start: string, end: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const blob = JSON.parse(raw) as ArchiveCacheBlob;
    if (!blob || blob.v !== 1 || blob.lat !== lat || blob.lng !== lng) return null;
    if (blob.start !== start || blob.end !== end) return null;
    return blob.days;
  } catch {
    return null;
  }
}

// Bounded cache: when over the entry cap, evict the ranges with the oldest
// start date (keys sort by their embedded "start" segment).
function evictArchiveCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length <= CACHE_MAX_ENTRIES) return;
    const startOf = (k: string) => k.split(':').at(-2) ?? '';
    keys.sort((a, b) => startOf(a).localeCompare(startOf(b)));
    for (const k of keys.slice(0, keys.length - CACHE_MAX_ENTRIES)) {
      localStorage.removeItem(k);
    }
  } catch {
    // best-effort
  }
}

function writeArchiveCache(
  key: string,
  lat: number,
  lng: number,
  start: string,
  end: string,
  days: Record<string, ArchiveRow>,
): void {
  try {
    const blob: ArchiveCacheBlob = { v: 1, lat, lng, start, end, days };
    localStorage.setItem(key, JSON.stringify(blob));
    evictArchiveCache();
  } catch {
    // quota / private mode — cache is best-effort
  }
}

// One archive pull per (lat, lng, range). Resolves null on any failure —
// never throws past the module boundary (climate.ts precedent).
async function fetchArchiveDays(
  lat: number,
  lng: number,
  startISO: string,
  endISO: string,
): Promise<Map<string, ArchiveRow> | null> {
  const key = `${CACHE_PREFIX}${lat.toFixed(2)},${lng.toFixed(2)}:${startISO}:${endISO}`;
  const cached = readArchiveCache(key, lat, lng, startISO, endISO);
  if (cached) return new Map(Object.entries(cached));
  try {
    const url =
      `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
      `&start_date=${startISO}&end_date=${endISO}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
      `&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: Partial<{
        time: unknown[];
        temperature_2m_max: (number | null)[];
        temperature_2m_min: (number | null)[];
        precipitation_sum: (number | null)[];
        et0_fao_evapotranspiration: (number | null)[];
      }> | null;
    };
    const daily = json?.daily;
    const time = daily?.time;
    const tmax = daily?.temperature_2m_max;
    const tmin = daily?.temperature_2m_min;
    const precip = daily?.precipitation_sum;
    const et0 = daily?.et0_fao_evapotranspiration;
    if (!Array.isArray(time) || !tmax || !tmin || !precip || !et0) return null;
    const days: Record<string, ArchiveRow> = {};
    for (let i = 0; i < time.length; i++) {
      const ds = time[i];
      const tx = tmax[i];
      const tn = tmin[i];
      const pr = precip[i];
      const ev = et0[i];
      if (typeof ds !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
      if (typeof tx !== 'number' || typeof tn !== 'number') continue; // no temps → skip day
      if (!Number.isFinite(tx) || !Number.isFinite(tn)) continue;
      // null precip contributes 0 — gaps never fabricate rain (climate.ts policy)
      days[ds] = {
        tMinC: round2(tn),
        tMaxC: round2(tx),
        precipMm: round2(typeof pr === 'number' && Number.isFinite(pr) ? pr : 0),
        etoMm: typeof ev === 'number' && Number.isFinite(ev) ? round2(ev) : null,
      };
    }
    if (Object.keys(days).length === 0) return null;
    writeArchiveCache(key, lat, lng, startISO, endISO, days);
    return new Map(Object.entries(days));
  } catch {
    return null; // never throw past the module boundary
  }
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month1: number): number {
  if (month1 === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
  return DAYS_IN_MONTH[month1 - 1] ?? 30;
}

interface SynthDay {
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  etoMm: number | null;
  source: EnvSourceTag;
}

const RAIN_PROB = 0.35; // fraction of days with rain (normals + default synth)

/**
 * Documented ETO proxy (model-estimate, v1): Hargreaves-inspired temp-range
 * formula without the radiation term —
 *   eto = 0.5 + 0.12·(tMean − 5) + 0.08·(tMax − tMin), clamped [0.5, 8] mm/day.
 * Temperate summer (~20 °C, 10 K range) ≈ 3.1; hot (~27 °C, 14 K) ≈ 4.3;
 * cool spring (~10 °C, 8 K) ≈ 1.7 mm/day.
 */
export function etoProxyMm(tMinC: number, tMaxC: number): number {
  const tMean = (tMinC + tMaxC) / 2;
  return Math.min(8, Math.max(0.5, 0.5 + 0.12 * (tMean - 5) + 0.08 * (tMaxC - tMinC)));
}

// Normals-synthesized day: month-mean temps ± seeded noise (±3 K common-mode,
// ±1 K extra tMax wobble keeps the diurnal range varied); rain on RAIN_PROB of
// days with seeded amounts whose expectation preserves the normals monthly
// total (wet-day mean = monthly/daysInMonth / RAIN_PROB).
function synthFromNormals(
  iso: string,
  seed: number,
  dayIndex: number,
  normals: ClimateNormals,
): SynthDay {
  const month1 = Number(iso.slice(5, 7));
  const year = Number(iso.slice(0, 4));
  const m = normals.monthly[month1 - 1];
  const noise = (uniform01(seed, dayIndex, 'tn') - 0.5) * 6;
  const wobble = (uniform01(seed, dayIndex, 'tx') - 0.5) * 2;
  const tMinC = m.tminC + noise;
  const tMaxC = m.tmaxC + noise + wobble;
  const dailyMean = m.precipMm / daysInMonth(year, month1);
  const rains = uniform01(seed, dayIndex, 'rain') < RAIN_PROB;
  const amount = rains ? Math.min(80, (dailyMean / RAIN_PROB) * 2 * uniform01(seed, dayIndex, 'amt')) : 0;
  return {
    tMinC,
    tMaxC,
    precipMm: m.precipMm > 0 ? amount : 0,
    etoMm: m.et0Mm > 0 ? m.et0Mm : null, // null → proxy (some normals lack ET0)
    source: 'era5-normals',
  };
}

// No site data at all: documented generic temperate default — seasonal sine
// tMean = 18 + 9·sin(2π(doy − 105 + phase)/365.25) (phase 183 d in the S
// hemisphere), ±6 K diurnal split ± seeded 2 K noise; rain p=0.35, wet-day
// mean ≈ 6 mm (seeded ×[0,2)) ≈ 766 mm/yr — enough to keep buckets cycling
// against the ~2.6 mm/day mean ET0 proxy rather than pinning at 0. Roughly a
// mild coastal climate; exercises the engine offline, never shown as real.
function synthDefault(iso: string, seed: number, dayIndex: number, lat: number): SynthDay {
  const y = Number(iso.slice(0, 4));
  const start = Date.UTC(y, 0, 1);
  const doy = (Date.UTC(y, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - start) / MS_DAY + 1;
  const phase = lat >= 0 ? 0 : 183;
  const tMean = 18 + 9 * Math.sin((2 * Math.PI * (doy - 105 + phase)) / 365.25);
  const noise = (uniform01(seed, dayIndex, 'tn') - 0.5) * 4;
  const wobble = (uniform01(seed, dayIndex, 'tx') - 0.5) * 2;
  const tMinC = tMean - 6 + noise;
  const tMaxC = tMean + 6 + noise + wobble;
  const rains = uniform01(seed, dayIndex, 'rain') < RAIN_PROB;
  const amount = rains ? Math.min(50, 6 * 2 * uniform01(seed, dayIndex, 'amt')) : 0;
  return { tMinC, tMaxC, precipMm: amount, etoMm: null, source: 'default' };
}

/** Climatological mean daily GDD (base 10) over the run window from monthly
 * normals — the "expected pace" normalizer for gddRequired. Null when no
 * normals (engine falls back to 10 °C·day ≈ a 20 °C mean day). */
export function meanDailyGddForRange(
  normals: ClimateNormals | null | undefined,
  startISO: string,
  dayCount: number,
): number | null {
  if (!normals || dayCount <= 0) return null;
  const start = isoDayNumber(startISO);
  let sum = 0;
  for (let i = 0; i < dayCount; i++) {
    const iso = isoFromDayNumber(start + i);
    const m = normals.monthly[Number(iso.slice(5, 7)) - 1];
    if (!m) return null;
    sum += Math.max(0, (m.tminC + m.tmaxC) / 2 - 10);
  }
  return round2(sum / dayCount);
}

/** Compose the run's frozen daily environment series (see module header). */
export async function buildEnvSeries(
  startISO: string,
  dayCount: number,
  opts: BuildEnvOpts,
): Promise<DailyEnvironment[]> {
  if (dayCount <= 0) return [];
  const start = isoDayNumber(startISO);
  const normals =
    opts.climateNormals !== undefined
      ? opts.climateNormals
      : await fetchClimateNormals(opts.lat, opts.lng);

  // Archive window = intersection of the run with (1940.., today − lag).
  const today = isoDayNumber(new Date().toISOString().slice(0, 10));
  const archiveEnd = Math.min(start + dayCount - 1, today - ARCHIVE_LAG_DAYS);
  const archiveStart = Math.max(start, isoDayNumber(ARCHIVE_EARLIEST));
  const archive =
    archiveEnd >= archiveStart
      ? await fetchArchiveDays(
          opts.lat,
          opts.lng,
          isoFromDayNumber(archiveStart),
          isoFromDayNumber(archiveEnd),
        )
      : null;

  const series: DailyEnvironment[] = [];
  for (let i = 0; i < dayCount; i++) {
    const day = start + i;
    const date = isoFromDayNumber(day);

    // Effective deltas: latest 'weather' override at/before this day wins;
    // omitted fields inherit the previous effective value (global first).
    let tempDeltaC = opts.tempDeltaC;
    let precipMultiplier = opts.precipMultiplier;
    for (const o of opts.weatherOverrides ?? []) {
      if (isoDayNumber(o.fromDate) <= day) {
        if (o.tempDeltaC !== undefined) tempDeltaC = o.tempDeltaC;
        if (o.precipMultiplier !== undefined) precipMultiplier = o.precipMultiplier;
      }
    }

    const row = archive?.get(date);
    let tMinC: number;
    let tMaxC: number;
    let precipMm: number;
    let eto: number | null;
    let source: EnvSourceTag;
    if (row) {
      tMinC = row.tMinC;
      tMaxC = row.tMaxC;
      precipMm = row.precipMm;
      eto = row.etoMm;
      source = 'open-meteo-archive';
    } else {
      const synth =
        normals != null
          ? synthFromNormals(date, day, i, normals)
          : synthDefault(date, day, i, opts.lat);
      tMinC = synth.tMinC;
      tMaxC = synth.tMaxC;
      precipMm = synth.precipMm;
      eto = synth.etoMm;
      source = synth.source;
    }

    const provenance: DailyEnvironment['provenance'] = {
      tMinC: source,
      tMaxC: source,
      precipMm: source,
      etoMm: eto !== null ? source : 'model-estimate',
    };

    let raw: DailyEnvironment['raw'];
    if (tempDeltaC !== 0 || precipMultiplier !== 1) {
      raw = { tMinC, tMaxC, precipMm, source };
    }
    if (tempDeltaC !== 0) {
      tMinC += tempDeltaC;
      tMaxC += tempDeltaC;
      provenance.tMinC = 'scenario-delta';
      provenance.tMaxC = 'scenario-delta';
    }
    if (precipMultiplier !== 1) {
      precipMm = precipMm * precipMultiplier;
      provenance.precipMm = 'scenario-delta';
    }
    if (eto === null) eto = etoProxyMm(tMinC, tMaxC);

    series.push({
      date,
      tMinC: round2(tMinC),
      tMaxC: round2(tMaxC),
      precipMm: round2(precipMm),
      etoMm: round2(eto),
      gddBase10C: round2(Math.max(0, (tMinC + tMaxC) / 2 - 10)),
      provenance,
      raw: raw
        ? {
            tMinC: round2(raw.tMinC),
            tMaxC: round2(raw.tMaxC),
            precipMm: round2(raw.precipMm),
            source: raw.source,
          }
        : undefined,
    });
  }
  return series;
}
