import { simulateRun, type SimRunCtx } from './engine';
import { freezeRunModelInputs, inspectRunModelSupport } from './model-inputs';
import { canonicalizeObservations, observationMatchesRun } from './observations';
import type { Observation } from '@/types';
import type { RunRecord } from './types';

export interface CreateTwinRunOptions {
  id?: string;
  createdAt?: string;
  label?: string;
}

let twinSequence = 0;

/** Create an immutable-input twin record from a saved run; the source record is never edited. */
export function createTwinRunRecord(
  parent: RunRecord,
  observations: readonly Observation[],
  ctx: SimRunCtx = {},
  options: CreateTwinRunOptions = {},
): RunRecord {
  const support = inspectRunModelSupport(parent.config);
  if (!support.canReplay) {
    throw new Error(support.reasons.join(' ') || 'This run does not have supported frozen model inputs.');
  }
  const config = structuredClone(parent.config);
  config.modelInputs = freezeRunModelInputs(config, ctx, config.modelInputs);
  const dates = new Set(parent.envSeries.map((day) => day.date));
  const frozenObservations = canonicalizeObservations([
    ...(parent.observations ?? []),
    ...observations,
  ]).filter((observation) => dates.has(observation.date) && observationMatchesRun(observation, config));
  if (frozenObservations.length === 0) {
    throw new TypeError('A twin run needs at least one observation in this run’s farm, world, target, and date scope.');
  }

  const replayCtx: SimRunCtx = {
    soil: config.modelInputs.soil,
    crops: config.modelInputs.crops,
  };
  const { summary } = simulateRun(config, parent.envSeries, replayCtx, frozenObservations);
  const sequence = ++twinSequence;
  const createdAt = options.createdAt ?? new Date().toISOString();
  return {
    id: options.id ?? `run:${parent.farmId}:${Date.now().toString(36)}:twin:${sequence.toString(36)}`,
    farmId: parent.farmId,
    parentId: parent.id,
    label: options.label ?? `Twin · ${parent.label}`,
    createdAt,
    config,
    envSeries: structuredClone(parent.envSeries),
    observations: frozenObservations,
    summary,
    status: 'complete',
  };
}
