import { cropLibrary } from '@/data/crops';
import { growingTargetKey, parseTargetCellKey } from '@/lib/growingTargets';
import type { Crop, GrowingTargetRef, Observation } from '@/types';
import { floweringForBiomass, gddRequiredC, stageForBiomass } from './drivers';
import type { RunConfig, SimEvent, SimState } from './types';

const METRICS = new Set<Observation['metric']>([
  'airTempC', 'rhPct', 'vpdKPa', 'co2Ppm', 'dliMol', 'soilMoistureFrac', 'soilTempC', 'yieldKg', 'stage',
]);
const SOURCES = new Set<Observation['source']>(['manual', 'csv', 'sensor', 'lab', 'photo']);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sameObservation(a: Observation, b: Observation): boolean {
  const entries = (value: Observation) => Object.entries(value)
    .filter(([, field]) => field !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify(entries(a)) === JSON.stringify(entries(b));
}

function compareObservation(a: Observation, b: Observation): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Validate and freeze a unique observation set in its replay-defining order. */
export function canonicalizeObservations(input: readonly Observation[]): Observation[] {
  const byId = new Map<string, Observation>();
  for (const source of input) {
    const observation = structuredClone(source);
    if (!observation.id.trim()) throw new TypeError('Observation id must be a non-empty stable key.');
    if (!Number.isInteger(observation.farmId) || observation.farmId < 0) throw new TypeError('Observation farmId must be a non-negative integer.');
    if (!validDate(observation.date)) throw new TypeError(`Observation ${observation.id} needs a valid YYYY-MM-DD date.`);
    if (!METRICS.has(observation.metric)) throw new TypeError(`Observation ${observation.id} has an unsupported metric.`);
    if (!Number.isFinite(observation.value)) throw new TypeError(`Observation ${observation.id} value must be finite.`);
    if (!observation.unit.trim()) throw new TypeError(`Observation ${observation.id} needs a unit.`);
    if (!SOURCES.has(observation.source)) throw new TypeError(`Observation ${observation.id} has an unsupported source.`);
    if (observation.quality !== undefined && observation.quality !== 'ok' && observation.quality !== 'suspect') {
      throw new TypeError(`Observation ${observation.id} has an unsupported quality.`);
    }
    if (observation.environmentId !== undefined && !observation.environmentId.trim()) {
      throw new TypeError(`Observation ${observation.id} environmentId cannot be empty.`);
    }
    const hasSpace = observation.growingSpaceId !== undefined;
    const hasLevel = observation.levelId !== undefined;
    if (hasSpace !== hasLevel || (hasSpace && (!observation.growingSpaceId!.trim() || !observation.levelId!.trim()))) {
      throw new TypeError(`Observation ${observation.id} must name both growingSpaceId and levelId, or neither.`);
    }
    if ((observation.metric === 'soilMoistureFrac' || observation.metric === 'stage') && observation.unit !== 'fraction') {
      throw new TypeError(`Observation ${observation.id} ${observation.metric} values must use unit "fraction".`);
    }
    if (observation.at !== undefined && !Number.isFinite(Date.parse(observation.at))) {
      throw new TypeError(`Observation ${observation.id} at must be a valid timestamp.`);
    }

    const existing = byId.get(observation.id);
    if (existing && !sameObservation(existing, observation)) {
      throw new TypeError(`Observation id ${observation.id} has conflicting records.`);
    }
    if (!existing) byId.set(observation.id, observation);
  }
  return [...byId.values()].sort(compareObservation);
}

export function observationTarget(observation: Observation): GrowingTargetRef {
  return observation.growingSpaceId && observation.levelId
    ? { kind: 'growing-level', growingSpaceId: observation.growingSpaceId, levelId: observation.levelId }
    : { kind: 'floor' };
}

/** Missing environment ids are accepted only by legacy runs without a world snapshot. */
export function observationMatchesRun(observation: Observation, config: RunConfig): boolean {
  const environmentMatches = config.environment
    ? observation.environmentId === config.environment.id
    : observation.environmentId === undefined;
  const targetMatches = observation.growingSpaceId === undefined
    ? observation.levelId === undefined
    : !!config.environment?.layout?.growingSpaces.some((space) =>
      space.id === observation.growingSpaceId
      && space.levels.some((level) => level.id === observation.levelId),
    );
  return observation.farmId === config.farmId && environmentMatches && targetMatches;
}

function observationCells(state: SimState, observation: Observation): [string, SimState['cells'][string]][] {
  const targetKey = growingTargetKey(observationTarget(observation));
  return Object.entries(state.cells).filter(([key]) => growingTargetKey(parseTargetCellKey(key).target) === targetKey);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function targetEventFields(target: GrowingTargetRef): Pick<SimEvent, 'target'> | Record<string, never> {
  return target.kind === 'floor' ? {} : { target };
}

/** Apply state observations at the day boundary; driver and yield readings only score/calibrate. */
export function assimilateObservations(
  inputState: SimState,
  config: RunConfig,
  observations: readonly Observation[] = [],
  date: string,
  crops: readonly Crop[] = config.modelInputs?.crops ?? cropLibrary,
): { state: SimState; events: SimEvent[] } {
  const todays = observations
    .filter((observation) => observation.date === date && observationMatchesRun(observation, config)
      && (observation.metric === 'soilMoistureFrac' || observation.metric === 'stage'))
    .sort(compareObservation);
  if (todays.length === 0) return { state: inputState, events: [] };

  const cropById = new Map(crops.map((crop) => [crop.id, crop]));
  let cells = inputState.cells;
  let cellsOwned = false;
  const ownCells = () => {
    if (!cellsOwned) {
      cells = { ...cells };
      cellsOwned = true;
    }
  };
  const events: SimEvent[] = [];
  for (const observation of todays) {
    const target = observationTarget(observation);
    const matchedCells = observationCells({ ...inputState, cells }, observation);
    if (matchedCells.length === 0) continue;
    const values = matchedCells.map(([, cell]) => observation.metric === 'soilMoistureFrac' ? cell.moistureFrac : cell.biomassFrac);
    const predicted = values.reduce((sum, value) => sum + value, 0) / values.length;
    const observed = Math.min(1, Math.max(0, observation.value));
    const innovation = observed - predicted;

    for (const [key, cell] of matchedCells) {
      if (observation.metric === 'soilMoistureFrac') {
        const moistureFrac = Math.min(1, Math.max(0, cell.moistureFrac + 0.5 * (observed - cell.moistureFrac)));
        if (moistureFrac === cell.moistureFrac) continue;
        ownCells();
        cells[key] = { ...cell, moistureFrac };
        continue;
      }

      const biomassFrac = round4(Math.max(cell.biomassFrac, cell.biomassFrac + 0.3 * (observed - cell.biomassFrac)));
      if (biomassFrac === cell.biomassFrac) continue;
      const crop = cropById.get(cell.cropId);
      const required = crop ? gddRequiredC(crop, config.meanDailyGddC) : 1;
      const crossedReady = cell.biomassFrac < 1 && biomassFrac >= 1;
      ownCells();
      cells[key] = {
        ...cell,
        biomassFrac,
        gddAccumC: Math.max(cell.gddAccumC, biomassFrac * required),
        stage: stageForBiomass(biomassFrac),
        floweringFrac: round4(floweringForBiomass(biomassFrac)),
        ...(crossedReady ? { readyAtDay: inputState.dayIndex } : {}),
      };
      if (crossedReady) {
        events.push({
          dayIndex: inputState.dayIndex,
          date,
          kind: 'harvest-ready',
          cell: key,
          ...targetEventFields(target),
          cropId: cell.cropId,
          message: `${crop?.name ?? `Crop ${cell.cropId}`} at ${parseTargetCellKey(key).localCellKey} is harvest-ready by observation`,
          data: { biomass: biomassFrac },
        });
      }
    }
    events.push({
      dayIndex: inputState.dayIndex,
      date,
      kind: 'assimilated',
      ...targetEventFields(target),
      message: `Assimilated ${observation.metric} observation ${observation.id}`,
      data: { metric: observation.metric, innovation: round4(innovation) },
    });
  }

  return cellsOwned ? { state: { ...inputState, cells }, events } : { state: inputState, events };
}
