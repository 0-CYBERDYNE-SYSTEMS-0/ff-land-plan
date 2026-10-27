import { growingTargetKey, parseTargetCellKey } from '@/lib/growingTargets';
import { archetypes } from '@/creative/archetypes';
import type { GrowingTargetRef, Observation, ObservationMetric } from '@/types';
import { createRun, stepDay, type SimRunCtx } from './engine';
import { canonicalizeObservations, observationMatchesRun, observationTarget } from './observations';
import { inspectRunModelSupport } from './model-inputs';
import type { RunRecord, SimEvent, SimState } from './types';

export interface TwinPredictionPair {
  observationId: string;
  metric: ObservationMetric;
  date: string;
  observed: number;
  predicted: number | null;
}

export interface TwinScorecard {
  metric: ObservationMetric;
  n: number;
  mae: number;
  /** Mean observed − predicted; positive bias means the model was low. */
  bias: number;
  windowDays: number;
}

const METRIC_ORDER: ObservationMetric[] = [
  'airTempC', 'rhPct', 'vpdKPa', 'co2Ppm', 'dliMol', 'soilMoistureFrac', 'soilTempC', 'yieldKg', 'stage',
];

function validDateNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? Math.floor(parsed.getTime() / 86_400_000)
    : Number.NaN;
}

function stateMean(
  state: SimState,
  observation: Observation,
  field: 'moistureFrac' | 'biomassFrac',
): number | null {
  const targetKey = growingTargetKey(observationTarget(observation));
  const values = Object.entries(state.cells)
    .filter(([key]) => growingTargetKey(parseTargetCellKey(key).target) === targetKey)
    .map(([, cell]) => cell[field]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function eventTarget(event: SimEvent): GrowingTargetRef {
  return event.target ?? (event.cell ? parseTargetCellKey(event.cell).target : { kind: 'floor' });
}

function predict(
  observation: Observation,
  before: SimState,
  events: SimEvent[],
  effectiveEnv: ReturnType<typeof stepDay>['effectiveEnv'],
  outdoorDliAvailable: boolean,
): number | null {
  switch (observation.metric) {
    case 'airTempC': return (effectiveEnv.tMinC + effectiveEnv.tMaxC) / 2;
    case 'rhPct': return effectiveEnv.climate?.rhPct ?? null;
    case 'vpdKPa': return effectiveEnv.climate?.vpdKPa ?? null;
    case 'co2Ppm': return effectiveEnv.climate?.co2Ppm ?? null;
    case 'dliMol': return effectiveEnv.climate?.dliMol
      ?? (outdoorDliAvailable ? effectiveEnv.dliNaturalMol ?? null : null);
    case 'soilMoistureFrac': return stateMean(before, observation, 'moistureFrac');
    case 'soilTempC': return null;
    case 'yieldKg': {
      const targetKey = growingTargetKey(observationTarget(observation));
      const amount = events
        .filter((event) => event.kind === 'harvested'
          && growingTargetKey(eventTarget(event)) === targetKey)
        .reduce((sum, event) => sum + (event.kind === 'harvested' ? event.data?.yieldKg ?? 0 : 0), 0);
      return amount;
    }
    case 'stage': return stateMean(before, observation, 'biomassFrac');
  }
}

/** Replay a frozen run and pair each measured value with the model prediction at that day boundary. */
export function collectRunPredictionPairs(record: RunRecord, ctx: SimRunCtx = {}): TwinPredictionPair[] {
  if (!inspectRunModelSupport(record.config).canReplay) return [];
  const observations = canonicalizeObservations(record.observations ?? [])
    .filter((observation) => observationMatchesRun(observation, record.config));
  if (observations.length === 0) return [];
  let state = createRun(record.config, ctx);
  const outdoorDliAvailable = record.config.environment
    ? archetypes[record.config.environment.archetype]?.kind === 'open'
    : (record.config.basePlan.surface ?? 'outdoor') === 'outdoor';
  const pairs: TwinPredictionPair[] = [];
  let observationIndex = 0;
  for (const environment of record.envSeries) {
    const todays: Observation[] = [];
    while (observationIndex < observations.length && observations[observationIndex]!.date < environment.date) {
      observationIndex += 1;
    }
    while (observationIndex < observations.length && observations[observationIndex]!.date === environment.date) {
      todays.push(observations[observationIndex]!);
      observationIndex += 1;
    }
    const before = state;
    const result = stepDay(before, environment, record.config, ctx, observations);
    for (const observation of todays) {
      pairs.push({
        observationId: observation.id,
        metric: observation.metric,
        date: observation.date,
        observed: observation.value,
        predicted: predict(observation, before, result.events, result.effectiveEnv, outdoorDliAvailable),
      });
    }
    state = result.state;
  }
  return pairs;
}

/** Compute rolling model error. Bias is signed observed − predicted. */
export function computeTwinScorecards(
  pairs: readonly TwinPredictionPair[],
  asOfDate: string,
  windowDays = 30,
): TwinScorecard[] {
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new RangeError('Scorecard windowDays must be a positive integer.');
  }
  const endDay = validDateNumber(asOfDate);
  if (!Number.isFinite(endDay)) throw new TypeError('Scorecard asOfDate must be a valid YYYY-MM-DD date.');
  const startDay = endDay - windowDays + 1;
  const byMetric = new Map<ObservationMetric, Array<{ error: number }>>();
  for (const pair of pairs) {
    const day = validDateNumber(pair.date);
    if (!Number.isFinite(day) || day < startDay || day > endDay
      || pair.predicted === null || !Number.isFinite(pair.predicted) || !Number.isFinite(pair.observed)) continue;
    if (!byMetric.has(pair.metric)) byMetric.set(pair.metric, []);
    byMetric.get(pair.metric)!.push({ error: pair.observed - pair.predicted });
  }
  return METRIC_ORDER.flatMap((metric) => {
    const errors = byMetric.get(metric);
    if (!errors?.length) return [];
    return [{
      metric,
      n: errors.length,
      mae: errors.reduce((sum, row) => sum + Math.abs(row.error), 0) / errors.length,
      bias: errors.reduce((sum, row) => sum + row.error, 0) / errors.length,
      windowDays,
    }];
  });
}
