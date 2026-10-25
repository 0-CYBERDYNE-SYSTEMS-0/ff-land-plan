import type { RunRecord, RunConfig, Intervention } from './types';
import { simulateRun, type SimRunCtx } from './engine';
import { freezeRunModelInputs } from './model-inputs';
import { canonicalizeObservations } from './observations';

export interface RunForkPatch {
  /** Future management actions only; weather and structural changes stay frozen. */
  interventions?: Intervention[];
}

export interface ComparisonMetric {
  a: number | null;
  b: number | null;
  /** Signed delta B − A. Missing inputs produce a missing delta. */
  delta: number | null;
}

export interface RunComparison {
  a: { id: string; label: string };
  b: { id: string; label: string };
  totalYieldKg: ComparisonMetric;
  waterUseMm: ComparisonMetric;
  stressCellDays: ComparisonMetric;
  stressDays: {
    water: ComparisonMetric;
    heat: ComparisonMetric;
    cold: ComparisonMetric;
    nitrogen: ComparisonMetric;
    light: ComparisonMetric;
  };
  harvestReadyDay: ComparisonMetric;
  outbreakDays: ComparisonMetric;
}

let forkSequence = 0;

function interventionDate(intervention: Intervention): string {
  return intervention.kind === 'weather' ? intervention.fromDate : intervention.date;
}

function isManagementIntervention(intervention: Intervention): boolean {
  return intervention.kind === 'irrigate'
    || intervention.kind === 'fertilize'
    || intervention.kind === 'plant'
    || intervention.kind === 'harvest'
    || intervention.kind === 'refill-water';
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Promote an active run at a completed-day boundary into a saved management fork. */
export function forkRun(
  parent: RunRecord,
  afterDayCount: number,
  patch: RunForkPatch = {},
  ctx: SimRunCtx = {},
): RunRecord {
  if (!Number.isInteger(afterDayCount) || afterDayCount < 0 || afterDayCount > parent.envSeries.length) {
    throw new RangeError(`Fork boundary must be a completed-day count from 0 to ${parent.envSeries.length}.`);
  }

  const boundaryDate = afterDayCount === 0 ? null : parent.envSeries[afterDayCount - 1]?.date;
  const lastDate = parent.envSeries[parent.envSeries.length - 1]?.date;
  if (afterDayCount > 0 && (!boundaryDate || !isIsoDate(boundaryDate))) {
    throw new RangeError('Fork boundary does not identify a valid completed run day.');
  }
  if (lastDate && !isIsoDate(lastDate)) {
    throw new RangeError('Run series does not end on a valid calendar date.');
  }

  const futureManagement: Intervention[] = patch.interventions ?? [];
  for (const intervention of futureManagement) {
    if (!isManagementIntervention(intervention)) {
      throw new TypeError('Run forks accept management interventions only; weather and structural changes stay frozen.');
    }
    const date = interventionDate(intervention);
    if (!isIsoDate(date) || (boundaryDate ? date <= boundaryDate : date < parent.config.startDate)) {
      throw new RangeError('Fork interventions must use a valid date after the completed-day boundary.');
    }
    if (!lastDate || date > lastDate) {
      throw new RangeError('Fork interventions must fall inside the parent run series.');
    }
  }

  const config: RunConfig = structuredClone(parent.config);
  const completedInterventions = afterDayCount === 0
    ? []
    : parent.config.interventions.filter((intervention) => interventionDate(intervention) <= boundaryDate!);
  config.interventions = [...completedInterventions, ...structuredClone(futureManagement)];
  config.modelInputs = freezeRunModelInputs(config, ctx, config.modelInputs);
  const envSeries = structuredClone(parent.envSeries);
  const observations = parent.observations === undefined
    ? undefined
    : canonicalizeObservations(parent.observations).filter((observation) =>
      boundaryDate !== null && observation.date <= boundaryDate,
    );
  const replayCtx: SimRunCtx = {
    soil: config.modelInputs.soil,
    crops: config.modelInputs.crops,
  };
  const { summary } = simulateRun(config, envSeries, replayCtx, observations ?? []);
  const forkId = ++forkSequence;
  const createdAt = new Date().toISOString();

  return {
    id: `run:${parent.farmId}:${Date.now().toString(36)}:fork:${afterDayCount}:${forkId.toString(36)}`,
    farmId: parent.farmId,
    parentId: parent.id,
    forkedAtDay: afterDayCount,
    label: `${parent.label} ⟂ d${afterDayCount}`,
    createdAt,
    config,
    envSeries,
    ...(observations !== undefined ? { observations } : {}),
    summary,
    status: 'complete',
  };
}

function metric(a: number | null | undefined, b: number | null | undefined): ComparisonMetric {
  const aValue = typeof a === 'number' && Number.isFinite(a) ? a : null;
  const bValue = typeof b === 'number' && Number.isFinite(b) ? b : null;
  return {
    a: aValue,
    b: bValue,
    delta: aValue === null || bValue === null ? null : bValue - aValue,
  };
}

/** Compare B against A without treating an unobserved value as zero. */
export function compareRuns(a: RunRecord, b: RunRecord): RunComparison {
  const aStress = a.summary.stressDays;
  const bStress = b.summary.stressDays;
  return {
    a: { id: a.id, label: a.label },
    b: { id: b.id, label: b.label },
    totalYieldKg: metric(a.summary.totalYieldKg, b.summary.totalYieldKg),
    waterUseMm: metric(a.summary.waterUseMm, b.summary.waterUseMm),
    stressCellDays: metric(a.summary.stressCellDays, b.summary.stressCellDays),
    stressDays: {
      water: metric(aStress.water, bStress.water),
      heat: metric(aStress.heat, bStress.heat),
      cold: metric(aStress.cold, bStress.cold),
      nitrogen: metric(aStress.nitrogen, bStress.nitrogen),
      light: metric(aStress.light, bStress.light),
    },
    harvestReadyDay: metric(a.summary.harvestReadyDay, b.summary.harvestReadyDay),
    outbreakDays: metric(a.summary.outbreakDays, b.summary.outbreakDays),
  };
}
