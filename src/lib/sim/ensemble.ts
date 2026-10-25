import type { SeasonEnsembles, SeasonYear } from '@/lib/ensembles';
import { archetypes } from '@/creative/archetypes';
import { etoProxyMm, isoDayNumber, isoFromDayNumber } from './environment';
import { simulateRun, type SimRunCtx } from './engine';
import type { DailyEnvironment, EnsembleBand, RunConfig, RunEnsembleResult } from './types';

const MAX_ENSEMBLE_YEARS = 5;
const round2 = (value: number) => Math.round(value * 100) / 100;

export interface EnsembleSample {
  year: number;
  totalYieldKg: number;
  harvestReadyDay: number | null;
  waterUseMm: number;
}

export interface RunEnsembleOptions {
  maxYears?: number;
  onProgress?: (completed: number, total: number) => void;
  /** Needed only to replay legacy records without frozen modelInputs. */
  ctx?: SimRunCtx;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sourceTags(source: SeasonEnsembles['source']): {
  weather: DailyEnvironment['provenance']['tMinC'];
  eto: DailyEnvironment['provenance']['etoMm'];
} {
  return source === 'era5'
    ? { weather: 'open-meteo-archive', eto: 'open-meteo-archive' }
    : { weather: 'nasa-power', eto: 'model-estimate' };
}

function naturalLightRequired(config: RunConfig): boolean {
  const environment = config.environment;
  if (config.climateModel !== 'environment-v1' || !environment) return false;
  const archetype = archetypes[environment.archetype];
  return !!archetype && archetype.kind !== 'open' && archetype.dliMode !== 'supplement-only' && archetype.coverTransmission > 0;
}

function historicalWindow(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  startYear: number,
): { startDate: string; envSeries: DailyEnvironment[] } | null {
  const startDate = `${startYear}${config.startDate.slice(4)}`;
  if (!validIsoDate(startDate)) return null;
  const daysByDate = new Map<string, { day: SeasonYear['daily'][number]; source: SeasonYear['source'] }>();
  for (const season of ensembles.years) {
    for (const day of season.daily) {
      if (validIsoDate(day.date)) daysByDate.set(day.date, { day, source: season.source });
    }
  }

  const startDay = isoDayNumber(startDate);
  const overrides = config.interventions
    .filter((intervention) => intervention.kind === 'weather')
    .map((intervention) => ({
      offset: isoDayNumber(intervention.fromDate) - isoDayNumber(config.startDate),
      tempDeltaC: intervention.tempDeltaC,
      precipMultiplier: intervention.precipMultiplier,
    }))
    .sort((a, b) => a.offset - b.offset);
  const envSeries: DailyEnvironment[] = [];

  for (let index = 0; index < config.dayCount; index += 1) {
    const date = isoFromDayNumber(startDay + index);
    const historicalDay = daysByDate.get(date);
    if (!historicalDay) return null;
    const { day: observed } = historicalDay;
    const source = sourceTags(historicalDay.source ?? ensembles.source);
    let tempDeltaC = config.tempDeltaC;
    let precipMultiplier = config.precipMultiplier;
    for (const override of overrides) {
      if (override.offset > index) break;
      if (override.tempDeltaC !== undefined) tempDeltaC = override.tempDeltaC;
      if (override.precipMultiplier !== undefined) precipMultiplier = override.precipMultiplier;
    }

    const rawTMinC = observed.tminC;
    const rawTMaxC = observed.tmaxC;
    const rawPrecipMm = observed.precipMm;
    const tMinC = round2(rawTMinC + tempDeltaC);
    const tMaxC = round2(rawTMaxC + tempDeltaC);
    const precipMm = round2(rawPrecipMm * precipMultiplier);
    const deltaApplied = tempDeltaC !== 0 || precipMultiplier !== 1;
    const provenance: DailyEnvironment['provenance'] = {
      tMinC: tempDeltaC === 0 ? source.weather : 'scenario-delta',
      tMaxC: tempDeltaC === 0 ? source.weather : 'scenario-delta',
      precipMm: precipMultiplier === 1 ? source.weather : 'scenario-delta',
      etoMm: source.eto,
      ...(observed.dliNaturalMol !== undefined ? { dliNaturalMol: 'model-estimate' as const } : {}),
    };
    envSeries.push({
      date,
      tMinC,
      tMaxC,
      precipMm,
      etoMm: round2(Number.isFinite(observed.et0Mm) ? observed.et0Mm : etoProxyMm(tMinC, tMaxC)),
      ...(observed.dliNaturalMol !== undefined ? { dliNaturalMol: observed.dliNaturalMol } : {}),
      gddBase10C: round2(Math.max(0, (tMinC + tMaxC) / 2 - 10)),
      provenance,
      ...(deltaApplied ? {
        raw: {
          tMinC: round2(rawTMinC),
          tMaxC: round2(rawTMaxC),
          precipMm: round2(rawPrecipMm),
          source: source.weather,
        },
      } : {}),
    });
  }
  return { startDate, envSeries };
}

function shiftDate(value: string, fromStart: number, toStart: number): string {
  return isoFromDayNumber(toStart + isoDayNumber(value) - fromStart);
}

function configForHistoricalYear(config: RunConfig, startDate: string): RunConfig {
  const fromStart = isoDayNumber(config.startDate);
  const toStart = isoDayNumber(startDate);
  const shifted = structuredClone(config);
  shifted.startDate = startDate;
  if (shifted.basePlan.plantedAt) {
    shifted.basePlan.plantedAt = Object.fromEntries(
      Object.entries(shifted.basePlan.plantedAt).map(([cell, date]) => [cell, shiftDate(date, fromStart, toStart)]),
    );
  }
  for (const target of Object.values(shifted.basePlan.targets ?? {})) {
    if (target.plantedAt) {
      target.plantedAt = Object.fromEntries(
        Object.entries(target.plantedAt).map(([cell, date]) => [cell, shiftDate(date, fromStart, toStart)]),
      );
    }
  }
  shifted.interventions = shifted.interventions.map((intervention) => intervention.kind === 'weather'
    ? { ...intervention, fromDate: shiftDate(intervention.fromDate, fromStart, toStart) }
    : { ...intervention, date: shiftDate(intervention.date, fromStart, toStart) });
  return shifted;
}

export function selectedEnsembleYears(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  maxYears = MAX_ENSEMBLE_YEARS,
): number[] {
  const requested = Number.isFinite(maxYears) ? Math.round(maxYears) : MAX_ENSEMBLE_YEARS;
  const limit = Math.min(MAX_ENSEMBLE_YEARS, Math.max(1, requested));
  return [...new Set(ensembles.years.map((season) => season.year))]
    .sort((a, b) => a - b)
    .filter((year) => historicalWindow(config, ensembles, year) !== null)
    .slice(-limit);
}

/** Missing natural-light input must not silently remove enclosed-crop light stress. */
export function ensembleUnavailableReason(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  maxYears = MAX_ENSEMBLE_YEARS,
): string | null {
  if (!naturalLightRequired(config)) return null;
  const years = selectedEnsembleYears(config, ensembles, maxYears);
  if (years.length === 0) return null;
  for (const year of years) {
    const window = historicalWindow(config, ensembles, year);
    if (window?.envSeries.some((day) => day.dliNaturalMol === undefined)) {
      return 'Historical natural DLI is unavailable for this enclosed growing world, so its light stress cannot be replayed credibly.';
    }
  }
  return null;
}

export function ensembleLimitations(config: RunConfig): string[] {
  if (!naturalLightRequired(config)) return [];
  return ['Natural DLI uses the latest complete year’s monthly means repeated across historical weather years (model-estimate).'];
}

/** Run one historical start year; incomplete calendar windows are skipped. */
export function runEnsembleYear(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  year: number,
  ctx: SimRunCtx = {},
): EnsembleSample | null {
  const window = historicalWindow(config, ensembles, year);
  if (!window) return null;
  const yearConfig = configForHistoricalYear(config, window.startDate);
  const { summary } = simulateRun(yearConfig, window.envSeries, ctx);
  return {
    year,
    totalYieldKg: summary.totalYieldKg,
    harvestReadyDay: summary.harvestReadyDay,
    waterUseMm: summary.waterUseMm,
  };
}

function band(values: Array<number | null>): EnsembleBand {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length < 3) return { p10: null, p50: null, p90: null, samples: sorted.length };
  const quantile = (p: number) => {
    const position = (sorted.length - 1) * p;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const fraction = position - lowerIndex;
    return round2(sorted[lowerIndex]! + (sorted[upperIndex]! - sorted[lowerIndex]!) * fraction);
  };
  return { p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9), samples: sorted.length };
}

export function summarizeEnsemble(
  source: SeasonEnsembles['source'],
  samples: EnsembleSample[],
  limitations: string[] = [],
): RunEnsembleResult | null {
  if (samples.length < 3) return null;
  const sorted = [...samples].sort((a, b) => a.year - b.year);
  return {
    source,
    years: sorted.map((sample) => sample.year),
    ...(limitations.length > 0 ? { limitations: [...limitations] } : {}),
    totalYieldKg: band(sorted.map((sample) => sample.totalYieldKg)),
    harvestReadyDay: band(sorted.map((sample) => sample.harvestReadyDay)),
    waterUseMm: band(sorted.map((sample) => sample.waterUseMm)),
  };
}

/** Synchronous reference implementation; the browser uses the worker wrapper. */
export function runEnsemble(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  options: RunEnsembleOptions = {},
): RunEnsembleResult | null {
  if (ensembleUnavailableReason(config, ensembles, options.maxYears)) return null;
  const years = selectedEnsembleYears(config, ensembles, options.maxYears);
  const samples: EnsembleSample[] = [];
  years.forEach((year, index) => {
    const sample = runEnsembleYear(config, ensembles, year, options.ctx);
    if (sample) samples.push(sample);
    options.onProgress?.(index + 1, years.length);
  });
  return summarizeEnsemble(ensembles.source, samples, ensembleLimitations(config));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function dateOffsetMap(values: Record<string, string> | undefined, start: number): Record<string, number> | undefined {
  if (!values) return undefined;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, isoDayNumber(value) - start]));
}

/** Normalize calendar dates to relative days while retaining every action's timing. */
export function ensembleCacheKey(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  maxYears = MAX_ENSEMBLE_YEARS,
  ctx?: SimRunCtx,
): string {
  const start = isoDayNumber(config.startDate);
  const normalizedPlan = structuredClone(config.basePlan);
  normalizedPlan.plantedAt = dateOffsetMap(normalizedPlan.plantedAt, start) as unknown as Record<string, string> | undefined;
  if (normalizedPlan.targets) {
    for (const target of Object.values(normalizedPlan.targets)) {
      target.plantedAt = dateOffsetMap(target.plantedAt, start) as unknown as Record<string, string> | undefined;
    }
  }
  const normalized = {
    ...structuredClone(config),
    startDate: config.startDate.slice(5),
    basePlan: normalizedPlan,
    interventions: config.interventions.map((intervention) => intervention.kind === 'weather'
      ? { ...intervention, fromDate: isoDayNumber(intervention.fromDate) - start }
      : { ...intervention, date: isoDayNumber(intervention.date) - start }),
  };
  const input = stableStringify({
    config: normalized,
    ensembles,
    selectedYears: selectedEnsembleYears(config, ensembles, maxYears),
    ...(!config.modelInputs && ctx ? { legacyContext: ctx } : {}),
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }
  return `ensemble-v1:${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/** Bounded in-memory cache for the small result only; no yearly states are retained. */
export class EnsembleResultCache {
  private readonly values = new Map<string, RunEnsembleResult>();

  constructor(readonly limit = 16) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Ensemble cache limit must be a positive integer.');
  }

  get(key: string): RunEnsembleResult | undefined {
    const value = this.values.get(key);
    if (!value) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return structuredClone(value);
  }

  set(key: string, value: RunEnsembleResult): void {
    this.values.delete(key);
    this.values.set(key, structuredClone(value));
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }
}

export const ensembleResultCache = new EnsembleResultCache();

export function runEnsembleCached(
  config: RunConfig,
  ensembles: SeasonEnsembles,
  options: RunEnsembleOptions = {},
  cache = ensembleResultCache,
): { key: string; result: RunEnsembleResult | null } {
  const key = ensembleCacheKey(config, ensembles, options.maxYears, options.ctx);
  const cached = cache.get(key);
  if (cached) return { key, result: cached };
  const result = runEnsemble(config, ensembles, options);
  if (result) cache.set(key, result);
  return { key, result };
}
