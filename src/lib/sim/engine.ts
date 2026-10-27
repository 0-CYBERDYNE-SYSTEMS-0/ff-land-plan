// Deterministic daily-tick sim engine (SPEC-SIM-ECOSYSTEM §3.1 engine.ts).
//
//   createRun(config, ctx) → initial SimState (from the forked basePlan)
//   stepDay(state, env, config, ctx) → { state, events }   — PURE reducer
//   simulateRun(config, envSeries, ctx) → { finalState, events, summary }
//
// Invariants:
//   - NO Math.random: every outcome is a function of (config, envSeries);
//     same inputs replay byte-identically (replay is the storage).
//   - Copy-on-write with structural sharing: untouched cells keep their
//     object identity; the cells Record is cloned at most once per day.
//   - Interventions mutate SimState inside the run — never PlanState.
//   - Water bucket + GDD are the living memory: droughts and heat carry over.

import { cropLibrary } from '@/data/crops';
import { ARCHETYPE_FOR_SURFACE, LEGACY_SURFACE_FOR_ARCHETYPE, archetypes } from '@/creative/archetypes';
import { effectivePlantingArea } from '@/lib/plan';
import { growingTargetKey, parseTargetCellKey, targetCellKey } from '@/lib/growingTargets';
import { effectivePhotoperiodH, environmentDay, NO_CLIMATE_EQUIPMENT, withEnvironmentClimate } from './environment-climate';
import type { SoilProfile } from '@/lib/soil';
import type { ArchetypeId, Crop, GrowingTargetRef, SoilCarry } from '@/types';
import type { Observation } from '@/types';
import type {
  CellState,
  CellStress,
  DailyEnvironment,
  DayStats,
  FrozenCropModelParametersV2,
  Intervention,
  RunConfig,
  RunSummary,
  SimEvent,
  SimState,
} from './types';
import { assimilateObservations, canonicalizeObservations } from './observations';
import {
  bucketCapacityMm,
  kcForBiomass,
  soilWaterParams,
  stepBucketMoisture,
  waterStressFromMoisture,
} from './soil-water';
import {
  STRESS_ONSET,
  STRESS_RELIEF,
  antagonistStressAdd,
  biomassFromGdd,
  companionRateBonus,
  effectiveEnvironmentForSurface,
  floweringForBiomass,
  gddGain,
  gddRequiredC,
  lightStressFromDli,
  meanStress,
  stageForBiomass,
  thermalStress,
} from './drivers';
import {
  BEES_PER_FLOWERING_CELL,
  BUTTERFLIES_PER_FLOWERING_CELL,
  N_LEACH_FRACTION,
  N_LEACH_MM,
  NEIGHBOR_WINDOW,
  PEST_OUTBREAK,
  PEST_OUTBREAK_END,
  PESTS_PER_MEAN_PRESSURE,
  buildNeighborCache,
  creaturesFromCells,
  initialNitrogenKgHa,
  isInsectPollinated,
  mineralizationKgHa,
  nitrogenNeedKgHa,
  nitrogenStress,
  stepPestPressure,
  soilborneGrowthFactor,
  uptakeDemandKgHa,
} from './ecosystem';
import { isoDayNumber } from './environment';
import { inspectRunModelSupport } from './model-inputs';
import { dailyDryMatterProduction, dailyThermalUnits, stepFao56RootZone, thermalDevelopmentRange } from './crop-model-v2';

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Shared no-intervention array — keeps the hot stepDay path allocation-free
 * when the run has no interventions at all. */
const EMPTY_TODAY: Intervention[] = [];
const FLOOR_TARGET: GrowingTargetRef = { kind: 'floor' };

export interface SimRunCtx {
  /** Farm soil (only AWC + OM are read; both optional). */
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> | null;
  /** Crop lookup incl. custom crops; defaults to the static library. */
  crops?: Crop[];
  /** Legacy floor-only campaign adapter; new runs freeze soilCarryByTarget in RunConfig. */
  carry?: SoilCarry;
}

const MOISTURE_INIT = 0.7; // documented v1 start: a wet-but-not-saturated bucket

/** Auto-harvest fires this many days after biomass first crosses 1.0. */
export const HARVEST_GRACE_DAYS = 3;
/** Manual 'harvest' interventions pay out only from this biomass on. */
export const MIN_MANUAL_HARVEST_BIOMASS = 0.8;

function eventTarget(key: string): { target?: GrowingTargetRef } {
  const target = parseTargetCellKey(key).target;
  return target.kind === 'floor' ? {} : { target };
}

function displayCell(key: string): string {
  return parseTargetCellKey(key).localCellKey;
}

function initialCell(
  cropId: number,
  plantedAtDay: number,
  soil: SimRunCtx['soil'],
  target?: GrowingTargetRef,
  carry?: SoilCarry,
  modelParameters?: FrozenCropModelParametersV2,
): CellState {
  const rootZone = modelParameters?.rootZone;
  const awc = soil?.awcMmPerCm;
  const rootZoneWaterMm = rootZone
    && typeof rootZone.effectiveRootDepthCm === 'number'
    && typeof rootZone.initialStorageFraction === 'number'
    && typeof awc === 'number' && Number.isFinite(awc) && awc > 0
    ? awc * rootZone.effectiveRootDepthCm * rootZone.initialStorageFraction
    : undefined;
  return {
    cropId,
    plantedAtDay,
    ...(target && target.kind !== 'floor' ? { target } : {}),
    moistureFrac: MOISTURE_INIT,
    nitrogenKgHa: initialNitrogenKgHa(carry?.organicMatterPct ?? soil?.organicMatterPct, carry?.nPoolKgHa),
    gddAccumC: 0,
    biomassFrac: 0,
    ...(modelParameters ? { dryMatterGPerM2: 0 } : {}),
    ...(rootZoneWaterMm !== undefined ? { rootZoneWaterMm } : {}),
    stage: 0,
    floweringFrac: 0,
    pestPressure: 0,
    peakPestPressure: 0,
    stressSum: 0,
    stressDaysCount: 0,
    stress: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
  };
}

function v2ParametersFor(config: RunConfig, cropId: number): FrozenCropModelParametersV2 | undefined {
  return config.modelInputs?.model === 'run-inputs-v2'
    ? config.modelInputs.cropParameters.find((parameter) => parameter.cropId === cropId)
    : undefined;
}

function v2HarvestDryMatterKg(cell: CellState, config: RunConfig): number {
  const harvestIndex = v2ParametersFor(config, cell.cropId)?.production.harvestIndex ?? 0;
  const cellM = Number.isFinite(config.basePlan.cellM) && config.basePlan.cellM > 0 ? config.basePlan.cellM : 0.25;
  return (cell.dryMatterGPerM2 ?? 0) * cellM * cellM * harvestIndex / 1000;
}

function soilFor(config: RunConfig, ctx: SimRunCtx): SimRunCtx['soil'] {
  return config.modelInputs ? config.modelInputs.soil : ctx.soil;
}

function carryForTarget(
  config: RunConfig,
  ctx: SimRunCtx,
  target: GrowingTargetRef = FLOOR_TARGET,
): SoilCarry | undefined {
  if (target.kind === 'growing-level') {
    const space = config.environment?.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
    if (!space || space.kind === 'hydro') return undefined;
  }
  return config.soilCarryByTarget?.[growingTargetKey(target)]
    ?? (target.kind === 'floor' ? ctx.carry : undefined);
}

function cropMapOf(config: RunConfig, ctx: SimRunCtx): Map<number, Crop> {
  const map = new Map<number, Crop>();
  const crops = config.modelInputs?.crops ?? ctx.crops ?? cropLibrary;
  for (const c of crops) map.set(c.id, c);
  return map;
}

interface HarvestPlantGroup {
  cropId: number;
  system: string;
  cells: number;
}

function growingSystemForCell(key: string, config: RunConfig): string {
  const parsed = parseTargetCellKey(key);
  const target = parsed.target;
  if (target.kind === 'floor') {
    if (config.assetPhysics?.soillessCells.floor?.includes(parsed.localCellKey)) return 'hydro';
    const ground = config.basePlan.ground[parsed.localCellKey] ?? '';
    if (ground.includes('hydro')) return 'hydro';
    if (ground.includes('pot') || ground.includes('container')) return 'containers';
    return 'soil-beds';
  }
  const space = config.environment?.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
  switch (space?.kind) {
    case 'hydro': return 'hydro';
    case 'rack': return 'racks';
    case 'bench': return 'containers';
    default: return 'soil-beds';
  }
}

function harvestGroupKey(cropId: number, system: string): string {
  return JSON.stringify([cropId, system]);
}

function climateEnabledFor(config: RunConfig, archetype: ArchetypeId): boolean {
  return config.climateModel === 'environment-v1'
    && !!config.environment
    && config.environment.archetype === archetype
    && archetypes[config.environment.archetype]?.kind !== 'open';
}

function climateInputsFor(
  config: RunConfig,
  state: SimState,
  env: DailyEnvironment,
  crops: Map<number, Crop>,
  archetype: ArchetypeId,
  surface: SimState['surface'],
  cells: Record<string, CellState>,
): { env: DailyEnvironment; climate?: ReturnType<typeof environmentDay> } {
  if (!climateEnabledFor(config, archetype)) return { env: effectiveEnvironmentForSurface(env, surface) };
  const environment = config.environment!;
  const modelArchetype = archetypes[environment.archetype]!;
  const cellM = Number.isFinite(config.basePlan.cellM) && config.basePlan.cellM > 0 ? config.basePlan.cellM : 0.25;
  const cellArea = cellM * cellM;
  const floorArea = Math.max(0.01, environment.widthM * environment.heightM);
  const previousEtFactor = state.climate?.etFactor ?? modelArchetype.etFactor;
  let transpirationKgDay = 0;
  let leafAreaM2 = 0;
  for (const cell of Object.values(cells)) {
    if (config.cropModelVersion === 'crop-model-v2' && state.dayIndex < cell.plantedAtDay) continue;
    const crop = crops.get(cell.cropId);
    if (!crop) continue;
    if (config.cropModelVersion === 'crop-model-v2') {
      const parameters = v2ParametersFor(config, cell.cropId);
      if (!parameters) continue;
      const progress = Math.max(0, Math.min(1, cell.biomassFrac));
      const interception = parameters.production.interceptedParFraction ?? 0;
      const cropCoefficient = parameters.rootZone.cropCoefficient ?? 0;
      // v2 uses its frozen FAO-56 crop coefficient for climate water flux.
      // Its fixed PAR interception times thermal progress is only a qualified
      // canopy proxy; it is not a dynamic LAI model.
      transpirationKgDay += env.etoMm * previousEtFactor * cropCoefficient * cellArea;
      leafAreaM2 += progress * interception * cellArea;
      continue;
    }
    const cover = Math.max(0, Math.min(1, cell.biomassFrac));
    const kc = kcForBiomass(cell.biomassFrac);
    transpirationKgDay += env.etoMm * previousEtFactor * kc * cellArea;
    leafAreaM2 += cover * cellArea;
  }
  const roomEquipment = config.climateEquipment ?? NO_CLIMATE_EQUIPMENT;
  const calibration = config.calibration?.farmId === config.farmId
    && config.calibration.environmentId === environment.id
    ? config.calibration.parameters
    : undefined;
  const climate = environmentDay(
    environment,
    {
      tMinC: env.tMinC,
      tMaxC: env.tMaxC,
      precipMm: env.precipMm,
      ...(env.dliNaturalMol !== undefined ? { dliNaturalMol: env.dliNaturalMol } : {}),
    },
    roomEquipment,
    state.climate,
    {
      transpirationKgDay,
      leafAreaIndex: leafAreaM2 / floorArea,
      ...(calibration ? { modelOverrides: calibration } : {}),
    },
  );
  return { env: withEnvironmentClimate(env, climate, modelArchetype), climate };
}

function hydroCellsForRun(config: RunConfig, key: string): { required: boolean; covered: boolean } {
  const parsed = parseTargetCellKey(key);
  const targetKey = growingTargetKey(parsed.target);
  const model = config.assetPhysics;
  if (!model) return { required: false, covered: false };
  const localKey = parsed.localCellKey;
  const covered = model.soillessCells[targetKey]?.includes(localKey) ?? false;
  const required = covered || (model.hydroRequiredCells[targetKey]?.includes(localKey) ?? false);
  return { required, covered };
}

function carryForCell(
  config: RunConfig,
  ctx: SimRunCtx,
  target: GrowingTargetRef,
  localCellKey: string,
): SoilCarry | undefined {
  if (hydroCellsForRun(config, targetCellKey(target, localCellKey)).required) return undefined;
  return carryForTarget(config, ctx, target);
}

function targetDliForCell(
  key: string,
  config: RunConfig,
  outdoor: DailyEnvironment,
): number | undefined {
  const environment = config.environment;
  if (!environment || (config.climateModel !== 'environment-v1' && config.cropModelVersion !== 'crop-model-v2')) return undefined;
  const parsed = parseTargetCellKey(key);
  const target = parsed.target;
  const archetype = archetypes[environment.archetype];
  if (!archetype || archetype.kind === 'open') return undefined;
  const equipment = config.climateTargetEquipment?.[growingTargetKey(target)] ?? NO_CLIMATE_EQUIPMENT;
  const naturalAvailable = outdoor.dliNaturalMol !== undefined;
  const photoperiodH = effectivePhotoperiodH(environment, equipment.photoperiodH);
  const space = target.kind === 'growing-level'
    ? environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId)
    : undefined;
  const targetLevel = target.kind === 'growing-level'
    ? space?.levels.find((entry) => entry.id === target.levelId)
    : undefined;
  const topLevel = space?.levels
    .slice()
    .sort((a, b) => b.elevationM - a.elevationM || a.id.localeCompare(b.id))[0];
  const levelGetsNaturalLight = target.kind === 'floor' || targetLevel?.id === topLevel?.id;
  const fittedCoverTransmission = config.calibration?.farmId === config.farmId
    && config.calibration.environmentId === environment.id
    ? config.calibration.parameters.coverTransmission
    : undefined;
  const coverTransmission = fittedCoverTransmission !== undefined && Number.isFinite(fittedCoverTransmission)
    ? Math.min(1, Math.max(0, fittedCoverTransmission))
    : archetype.coverTransmission;
  const naturalDli = naturalAvailable && levelGetsNaturalLight && archetype.dliMode !== 'supplement-only'
    ? outdoor.dliNaturalMol! * coverTransmission
    : 0;
  const installedLight = equipment.ppfdUmol > 0 && photoperiodH > 0;
  if (!naturalAvailable && archetype.dliMode !== 'supplement-only' && !installedLight) return undefined;
  const supplementalDli = equipment.ppfdUmol * photoperiodH * 3600 / 1e6;
  return Math.min(archetype.maxDliMol, naturalDli + supplementalDli);
}

/** Initial state at dayIndex 0: one cell per basePlan planting key. Cells
 * planted (per plan plantedAt) after startDate carry that offset and only
 * start accumulating GDD once dayIndex reaches it. The neighbor context is
 * built once here and rebuilt only on 'plant' interventions. */
export function createRun(config: RunConfig, ctx: SimRunCtx = {}): SimState {
  const start = isoDayNumber(config.startDate);
  const planting = config.basePlan.planting ?? {};
  const plantedAt = config.basePlan.plantedAt ?? {};
  const cropMap = cropMapOf(config, ctx);
  const soil = soilFor(config, ctx);
  const parametersFor = (cropId: number) => v2ParametersFor(config, cropId);
  const cropGet = (id: number) => cropMap.get(id);
  const cells: Record<string, CellState> = {};
  for (const key of Object.keys(planting)) {
    const iso = plantedAt[key];
    const offset = iso !== undefined ? isoDayNumber(iso) - start : 0;
    cells[key] = initialCell(
      planting[key],
      Math.max(0, offset),
      soil,
      FLOOR_TARGET,
      carryForCell(config, ctx, FLOOR_TARGET, key),
      parametersFor(planting[key]),
    );
  }
  for (const targetPlan of Object.values(config.basePlan.targets ?? {})) {
    const target: GrowingTargetRef = {
      kind: 'growing-level',
      growingSpaceId: targetPlan.growingSpaceId,
      levelId: targetPlan.levelId,
    };
    for (const key of Object.keys(targetPlan.planting)) {
      const iso = targetPlan.plantedAt?.[key];
      const offset = iso !== undefined ? isoDayNumber(iso) - start : 0;
      cells[targetCellKey(target, key)] = initialCell(
        targetPlan.planting[key]!,
        Math.max(0, offset),
        soil,
        target,
        carryForCell(config, ctx, target, key),
        parametersFor(targetPlan.planting[key]!),
      );
    }
  }
  const archetype = config.environment?.archetype
    ?? ARCHETYPE_FOR_SURFACE[config.basePlan.surface ?? 'outdoor'];
  const surface = config.environment
    ? LEGACY_SURFACE_FOR_ARCHETYPE[archetype]
    : config.basePlan.surface ?? 'outdoor';
  return {
    dayIndex: 0,
    archetype,
    surface,
    cells,
    ...(config.assetPhysics ? { waterStoreL: Math.max(0, config.assetPhysics.room.waterStoreL) } : {}),
    neighbors: buildNeighborCache(cells, cropGet),
    creatures: creaturesFromCells(cells, cropGet),
    events: [],
  };
}

// Irrigation/fertilization targets: explicit `cells` when listed (unknown keys
// ignored), else every cell in the run. `zone` is reserved — a run is one
// zone in v1.
function targetCells(
  cellList: string[] | undefined,
  cells: Record<string, CellState>,
  target: GrowingTargetRef = FLOOR_TARGET,
  allTargets = false,
): string[] {
  if (allTargets) {
    return cellList?.length
      ? cellList.filter((key) => key in cells)
      : Object.keys(cells);
  }
  if (cellList && cellList.length > 0) {
    return cellList.map((cell) => targetCellKey(target, cell)).filter((key) => key in cells);
  }
  const targetKey = growingTargetKey(target);
  return Object.keys(cells).filter((key) => growingTargetKey(parseTargetCellKey(key).target) === targetKey);
}

const STRESS_TERMS = ['water', 'heat', 'cold', 'nitrogen', 'light'] as const;

/** Onset/relief events for one stress term (STRESS_ONSET/STRESS_RELIEF
 * hysteresis). Module-level so the hot per-cell loop stays allocation-lean. */
function pushStressTermEvents(
  out: SimEvent[],
  prevStress: CellStress,
  nextStress: CellStress,
  dayIndex: number,
  date: string,
  key: string,
  cropId: number,
  name: string,
): void {
  for (const term of STRESS_TERMS) {
    const prevRaw = prevStress[term];
    const nextRaw = nextStress[term];
    if (prevRaw === undefined && nextRaw === undefined) continue;
    const prevV = prevRaw ?? 0;
    const nextV = nextRaw ?? 0;
    if (prevV < STRESS_ONSET && nextV >= STRESS_ONSET) {
      out.push({
        dayIndex,
        date,
        kind: 'stress-onset',
        cell: key,
        ...eventTarget(key),
        cropId,
        message: `${term} stress onset for ${name} at ${displayCell(key)}`,
        data: { value: r2(nextV) },
      });
    } else if (prevV >= STRESS_ONSET && nextV < STRESS_RELIEF) {
      out.push({
        dayIndex,
        date,
        kind: 'stress-end',
        cell: key,
        ...eventTarget(key),
        cropId,
        message: `${term} stress relieved for ${name} at ${displayCell(key)}`,
        data: { value: r2(nextV) },
      });
    }
  }
}

function sameCell(a: CellState, b: CellState): boolean {
  return (
    a === b ||
    (a.cropId === b.cropId &&
      a.plantedAtDay === b.plantedAtDay &&
      a.moistureFrac === b.moistureFrac &&
      a.nitrogenKgHa === b.nitrogenKgHa &&
      a.gddAccumC === b.gddAccumC &&
      a.biomassFrac === b.biomassFrac &&
      a.dryMatterGPerM2 === b.dryMatterGPerM2 &&
      a.rootZoneWaterMm === b.rootZoneWaterMm &&
      a.rootZoneResidualAccumulatedMm === b.rootZoneResidualAccumulatedMm &&
      a.rootZoneResidualMaxAbsMm === b.rootZoneResidualMaxAbsMm &&
      a.rootZoneReplantDrainageMm === b.rootZoneReplantDrainageMm &&
      a.stage === b.stage &&
      a.floweringFrac === b.floweringFrac &&
      a.pestPressure === b.pestPressure &&
      a.peakPestPressure === b.peakPestPressure &&
      a.readyAtDay === b.readyAtDay &&
      a.harvested === b.harvested &&
      a.stressSum === b.stressSum &&
      a.stressDaysCount === b.stressDaysCount &&
      growingTargetKey(a.target ?? FLOOR_TARGET) === growingTargetKey(b.target ?? FLOOR_TARGET) &&
      a.stress.water === b.stress.water &&
      a.stress.heat === b.stress.heat &&
      a.stress.cold === b.stress.cold &&
      a.stress.nitrogen === b.stress.nitrogen &&
      a.stress.light === b.stress.light)
  );
}

function maxCellStress(stress: CellStress): number {
  return Math.max(stress.water, stress.heat, stress.cold, stress.nitrogen, stress.light ?? 0);
}

function dailyModelQualification(cropId: number, reason: string): string {
  const detail = reason.replace(/[.]+$/, '');
  return `Crop ${cropId}: ${detail} on one or more simulated days.`;
}

/** Advance one day. `env` is that day's composed environment (the run's
 * frozen series entry); 'weather' interventions are NOT applied here — they
 * are baked into the series by buildEnvSeries. Returns the new state
 * (structural sharing), the day's events, and the day's summary aggregates
 * (computed inside the single per-cell pass — callers fold them into
 * RunSummary instead of rescanning the grid). */
export function stepDay(
  state: SimState,
  env: DailyEnvironment,
  config: RunConfig,
  ctx: SimRunCtx = {},
  observations: readonly Observation[] = [],
): { state: SimState; events: SimEvent[]; dayStats: DayStats; effectiveEnv: DailyEnvironment } {
  if (config.cropModelVersion === 'crop-model-v2') {
    const support = inspectRunModelSupport(config, false);
    if (!support.canReplay) throw new Error(support.reasons.join(' ') || 'This v2 run has unsupported frozen model inputs.');
  }
  const dayIndex = state.dayIndex;
  const date = env.date;
  const crops = cropMapOf(config, ctx);
  const assimilation = assimilateObservations(state, config, observations, date, [...crops.values()]);
  state = assimilation.state;
  const soil = soilFor(config, ctx);
  const isV2 = config.cropModelVersion === 'crop-model-v2';
  const modelQualificationReasons = new Set(state.modelQualificationReasons ?? []);
  const params = soilWaterParams(soil?.awcMmPerCm);
  const capacity = bucketCapacityMm(params);
  const events: SimEvent[] = [...assimilation.events];

  const todays = config.interventions.length
    ? config.interventions.filter((iv) => iv.kind !== 'weather' && iv.date === date)
    : EMPTY_TODAY;
  const storeCapacityL = Math.max(0, config.assetPhysics?.room.waterStoreL ?? 0);
  let waterStoreL = config.assetPhysics
    ? Math.min(storeCapacityL, Math.max(0, state.waterStoreL ?? storeCapacityL))
    : undefined;
  const irrigationByCell = new Map<string, number>();
  const waterSuppliedToday = new Set<string>();
  const climateArchetype = config.environment ? archetypes[config.environment.archetype] : undefined;
  if (config.assetPhysics && storeCapacityL > 0 && climateArchetype && climateArchetype.kind !== 'open') {
    const roofAreaM2 = Math.max(0, config.environment!.widthM * config.environment!.heightM);
    const rainL = Math.max(0, Number.isFinite(env.precipMm) ? env.precipMm : 0) * roofAreaM2;
    waterStoreL = Math.min(storeCapacityL, waterStoreL! + rainL);
  }

  let cells = state.cells;
  // Yield uses actual area grouped by crop and growing system. Equivalent
  // targets share one spacing floor; separately enumerated tiers are never
  // multiplied by a rack factor again.
  const harvestGroups = new Map<string, HarvestPlantGroup>();
  const updateHarvestGroup = (cropId: number, key: string, delta: number) => {
    const system = growingSystemForCell(key, config);
    const groupKey = harvestGroupKey(cropId, system);
    const group = harvestGroups.get(groupKey) ?? { cropId, system, cells: 0 };
    group.cells += delta;
    if (group.cells <= 0) harvestGroups.delete(groupKey);
    else harvestGroups.set(groupKey, group);
  };
  for (const [key, cell] of Object.entries(cells)) updateHarvestGroup(cell.cropId, key, 1);
  const plantsPerCell = (cropId: number, key: string): number => {
    const group = harvestGroups.get(harvestGroupKey(cropId, growingSystemForCell(key, config)));
    const crop = crops.get(cropId);
    if (!crop || !group || group.cells <= 0) return 0;
    const cellM = Number.isFinite(config.basePlan.cellM) && config.basePlan.cellM > 0 ? config.basePlan.cellM : 0.25;
    const totalPlants = effectivePlantingArea(crop, [{ cells: group.cells, cellM, system: group.system }]);
    return totalPlants / group.cells;
  };
  let cellsOwned = false;
  const ownCells = () => {
    if (!cellsOwned) {
      cells = { ...cells };
      cellsOwned = true;
    }
  };
  let surface = state.surface;
  let archetype = state.archetype;
  // Neighbor cache: built at createRun; rebuilt here only when a 'plant'
  // intervention adds a cell (O(cells × 24), rare).
  let neighbors = state.neighbors;
  const cropGet = (id: number) => crops.get(id);
  // Interventions first: plants/harvests/fertilizer/irrigation targets resolve
  // against the post-plant cell set.
  for (const iv of todays) {
    switch (iv.kind) {
      case 'plant': {
        const cellKey = targetCellKey(iv.target ?? FLOOR_TARGET, iv.cell);
        const existing = cells[cellKey];
        if (existing) updateHarvestGroup(existing.cropId, cellKey, -1);
        ownCells();
        const target = iv.target ?? FLOOR_TARGET;
        const nextParameters = v2ParametersFor(config, iv.cropId);
        let nextCell = initialCell(
          iv.cropId,
          dayIndex,
          soil,
          target,
          carryForCell(config, ctx, target, iv.cell),
          nextParameters,
        );
        if (isV2 && existing?.rootZoneWaterMm !== undefined && nextParameters) {
          const awc = soil?.awcMmPerCm;
          const previousDepthCm = v2ParametersFor(config, existing.cropId)?.rootZone.effectiveRootDepthCm;
          const nextDepthCm = nextParameters.rootZone.effectiveRootDepthCm;
          if (typeof awc === 'number' && Number.isFinite(awc) && awc > 0
            && typeof previousDepthCm === 'number' && typeof nextDepthCm === 'number') {
            const previousCapacityMm = awc * previousDepthCm;
            const nextCapacityMm = awc * nextDepthCm;
            const replantDrainageMm = Math.max(0, existing.rootZoneWaterMm - nextCapacityMm);
            nextCell = {
              ...nextCell,
              rootZoneWaterMm: Math.min(existing.rootZoneWaterMm, nextCapacityMm),
              ...(existing.rootZoneResidualAccumulatedMm !== undefined
                ? { rootZoneResidualAccumulatedMm: existing.rootZoneResidualAccumulatedMm }
                : {}),
              ...(existing.rootZoneResidualMaxAbsMm !== undefined
                ? { rootZoneResidualMaxAbsMm: existing.rootZoneResidualMaxAbsMm }
                : {}),
              rootZoneReplantDrainageMm: (existing.rootZoneReplantDrainageMm ?? 0) + replantDrainageMm,
            };
            if (previousCapacityMm !== nextCapacityMm) {
              modelQualificationReasons.add(
                `Crop ${iv.cropId}: replanting changed effective root-zone capacity from ${r4(previousCapacityMm)} mm to ${r4(nextCapacityMm)} mm; existing storage was retained up to the new capacity and any excess was counted as transition drainage.`,
              );
            }
          }
        }
        cells[cellKey] = nextCell;
        updateHarvestGroup(iv.cropId, cellKey, 1);
        neighbors = buildNeighborCache(cells, cropGet);
        events.push({
          dayIndex,
          date,
          kind: 'planted',
          cell: cellKey,
          ...eventTarget(cellKey),
          cropId: iv.cropId,
          message: `Planted ${crops.get(iv.cropId)?.name ?? `crop ${iv.cropId}`} at ${displayCell(cellKey)}`,
        });
        break;
      }
      case 'harvest': {
        // Manual harvest: pays out once (harvested flag) when the crop is
        // ripe enough (biomass ≥ 0.8), applying the pest peak penalty. The
        // crop stays standing — a twin, not a clearing sim. Too early →
        // 'harvest-too-early' event, no payout.
        const cellKey = targetCellKey(iv.target ?? FLOOR_TARGET, iv.cell);
        const c = cells[cellKey];
        if (c && !c.harvested) {
          const crop = crops.get(c.cropId);
          const name = crop?.name ?? `crop ${c.cropId}`;
          if (c.biomassFrac >= MIN_MANUAL_HARVEST_BIOMASS) {
            const seasonMean =
              (c.stressDaysCount ?? 0) > 0 ? (c.stressSum ?? 0) / c.stressDaysCount! : meanStress(c.stress);
            const kg = config.cropModelVersion === 'crop-model-v2'
              ? v2HarvestDryMatterKg(c, config)
              : (crop?.yieldKgPerPlant ?? 0) *
                plantsPerCell(c.cropId, cellKey) *
                (1 - 0.5 * seasonMean) *
                (1 - 0.3 * (c.peakPestPressure ?? c.pestPressure));
            ownCells();
            cells[cellKey] = { ...c, harvested: true };
            events.push({
              dayIndex,
              date,
              kind: 'harvested',
              cell: cellKey,
              ...eventTarget(cellKey),
              cropId: c.cropId,
              message: `Harvested ${name}${config.cropModelVersion === 'crop-model-v2' ? ' (dry matter)' : ''} at ${displayCell(cellKey)}`,
              data: { yieldKg: kg },
            });
          } else {
            events.push({
              dayIndex,
              date,
              kind: 'harvest-too-early',
              cell: cellKey,
              ...eventTarget(cellKey),
              cropId: c.cropId,
              message: `${name} at ${displayCell(cellKey)} is not ready to harvest (biomass ${r2(c.biomassFrac)} < ${MIN_MANUAL_HARVEST_BIOMASS})`,
              data: { biomass: c.biomassFrac, minimum: MIN_MANUAL_HARVEST_BIOMASS },
            });
          }
        }
        break;
      }
      case 'fertilize': {
        const targets = targetCells(iv.cells, cells, iv.target ?? FLOOR_TARGET, iv.allTargets);
        if (targets.length > 0) {
          ownCells();
          for (const k of targets) {
            const c = cells[k]!;
            cells[k] = { ...c, nitrogenKgHa: r2(c.nitrogenKgHa + iv.nKgHa) };
          }
          events.push({
            dayIndex,
            date,
            kind: 'fertilized',
            ...(iv.target && iv.target.kind !== 'floor' ? { target: iv.target } : {}),
            message: `Fertilized ${targets.length} cell(s) with ${iv.nKgHa} kg/ha N`,
            data: { nKgHa: iv.nKgHa, cellCount: targets.length },
          });
        }
        break;
      }
      case 'irrigate': {
        // Resolved after planting interventions so same-day planted cells are
        // included, preserving the legacy order-independent watering pass.
        break;
      }
      case 'refill-water': {
        const requestedL = Math.max(0, Number.isFinite(iv.litres) ? iv.litres : 0);
        const acceptedL = config.assetPhysics
          ? Math.min(requestedL, Math.max(0, storeCapacityL - (waterStoreL ?? 0)))
          : 0;
        if (waterStoreL !== undefined) waterStoreL += acceptedL;
        if (acceptedL > 0) {
          events.push({
            dayIndex,
            date,
            kind: 'water-refilled',
            message: `Refilled the shared water store with ${r2(acceptedL)} L`,
            data: { requestedL, acceptedL, remainingL: waterStoreL ?? 0 },
          });
        }
        if (acceptedL < requestedL) {
          events.push({
            dayIndex,
            date,
            kind: 'water-short',
            message: 'The shared water store could not accept the full refill',
            data: { requestedL, acceptedL, remainingL: waterStoreL ?? 0, capacityL: storeCapacityL },
          });
        }
        break;
      }
      case 'surface': {
        surface = iv.surface;
        archetype = ARCHETYPE_FOR_SURFACE[iv.surface];
        break;
      }
      case 'weather':
        // Deltas are baked into the composed env series; nothing to do here.
        break;
    }
  }

  // Per-cell water + growth pass. Water applied to cells (incl. same-day
  // plants); multiple irrigations sum. ONE pass per day: day stats and the
  // creature populations accumulate inside this loop.
  for (const iv of todays) {
    if (iv.kind !== 'irrigate') continue;
    const targets = targetCells(iv.cells, cells, iv.target ?? FLOOR_TARGET, iv.allTargets)
      .sort((a, b) => {
        const ta = growingTargetKey(parseTargetCellKey(a).target);
        const tb = growingTargetKey(parseTargetCellKey(b).target);
        return ta.localeCompare(tb) || displayCell(a).localeCompare(displayCell(b));
      });
    const requestedMm = Math.max(0, Number.isFinite(iv.mm) ? iv.mm : 0);
    const cellM = Number.isFinite(config.basePlan.cellM) && config.basePlan.cellM > 0 ? config.basePlan.cellM : 0.25;
    const cellAreaM2 = cellM * cellM;
    let totalDeliveredMm = 0;
    let unmetCells = 0;
    for (const key of targets) {
      const hydro = hydroCellsForRun(config, key);
      let deliveredMm = requestedMm;
      if (hydro.required && !hydro.covered) {
        deliveredMm = 0;
      } else if (hydro.required || storeCapacityL > 0) {
        const availableL = waterStoreL ?? 0;
        deliveredMm = Math.min(requestedMm, availableL / cellAreaM2);
        waterStoreL = Math.max(0, availableL - deliveredMm * cellAreaM2);
      }
      irrigationByCell.set(key, (irrigationByCell.get(key) ?? 0) + deliveredMm);
      if (deliveredMm > 0) waterSuppliedToday.add(key);
      totalDeliveredMm += deliveredMm;
      if (deliveredMm < requestedMm) unmetCells += 1;
    }
    if (targets.length > 0) {
      events.push({
        dayIndex,
        date,
        kind: 'irrigated',
        ...(iv.target && iv.target.kind !== 'floor' ? { target: iv.target } : {}),
        message: `Irrigated ${targets.length} cell(s) with up to ${requestedMm} mm`,
        data: { mmPerCell: targets.length ? r2(totalDeliveredMm / targets.length) : 0, cellCount: targets.length, totalMm: r2(totalDeliveredMm) },
      });
    }
    if (unmetCells > 0) {
      events.push({
        dayIndex,
        date,
        kind: 'water-short',
        ...(iv.target && iv.target.kind !== 'floor' ? { target: iv.target } : {}),
        message: `Water was short for ${unmetCells} of ${targets.length} cell(s)`,
        data: {
          requestedMm,
          unmetCells,
          cellCount: targets.length,
          remainingL: waterStoreL ?? 0,
        },
      });
    }
  }

  let liveCells = 0;
  let etcMmSum = 0;
  let actualTranspirationSumMm = 0;
  let statsStressCellDays = 0;
  let outbreakCellDays = 0;
  const statsStressDays: DayStats['stressDays'] = { water: 0, heat: 0, cold: 0, nitrogen: 0 };
  let lightStressObserved = false;
  let beeCapacity = 0;
  let butterflyCapacity = 0;
  let pestSum = 0;

  // One effective environment per day feeds every consumer in the pass below.
  const climateResult = climateInputsFor(config, state, env, crops, archetype, surface, cells);
  const env2 = climateResult.env;
  // The drought preset includes a +2 °C scenario delta. Without a guard, that
  // extra warmth can accelerate crops past their harvest threshold before the
  // rainfall deficit becomes limiting. Keep drought growth's thermal pace no
  // faster than the same day's raw climate while retaining water/heat stress.
  const growthEnv =
    config.scenario === 'drought' && surface === 'outdoor' && !climateResult.climate && env.raw
      ? {
          ...env2,
          gddBase10C: Math.min(
            env2.gddBase10C,
            Math.max(0, (env.raw.tMinC + env.raw.tMaxC) / 2 - 10),
          ),
        }
      : env2;

  for (const key of Object.keys(cells)) {
    const prev = cells[key]!;
    const crop = crops.get(prev.cropId);
    const growing = crop !== undefined && dayIndex >= prev.plantedAtDay;
    const hydro = hydroCellsForRun(config, key);
    const target = parseTargetCellKey(key).target;
    const carry = hydro.required ? undefined : carryForTarget(config, ctx, target);
    const hydroAvailable = hydro.required && hydro.covered
      && ((waterStoreL ?? 0) > 0 || waterSuppliedToday.has(key));
    const kc = kcForBiomass(prev.biomassFrac);
    const modelParameters = isV2 ? v2ParametersFor(config, prev.cropId) : undefined;
    let rootZoneWaterMm = prev.rootZoneWaterMm;
    let rootZoneResidualAccumulatedMm = prev.rootZoneResidualAccumulatedMm;
    let rootZoneResidualMaxAbsMm = prev.rootZoneResidualMaxAbsMm;
    const rootZoneReplantDrainageMm = prev.rootZoneReplantDrainageMm;
    let actualTranspirationMm = 0;
    let moistureFrac: number;
    let water: number;
    if (isV2 && modelParameters) {
      const awc = soil?.awcMmPerCm;
      if (typeof awc !== 'number' || !Number.isFinite(awc) || awc <= 0 || rootZoneWaterMm === undefined) {
        throw new Error(`Crop-model-v2 root-zone storage is unavailable for crop ${prev.cropId}.`);
      }
      const root = modelParameters.rootZone;
      const result = stepFao56RootZone(
        { waterMm: rootZoneWaterMm, residualAccumulatedMm: rootZoneResidualAccumulatedMm },
        {
          awcMmPerCm: awc,
          effectiveRootDepthCm: root.effectiveRootDepthCm!,
          depletionFraction: root.depletionFraction!,
        },
        {
          precipMm: env2.precipMm,
          irrigationMm: irrigationByCell.get(key) ?? 0,
          runoffMm: 0,
          potentialTranspirationMm: growing
            ? env2.etoMm * root.cropCoefficient!
            : 0,
        },
      );
      rootZoneWaterMm = result.state.waterMm;
      rootZoneResidualAccumulatedMm = result.state.residualAccumulatedMm;
      rootZoneResidualMaxAbsMm = Math.max(rootZoneResidualMaxAbsMm ?? 0, Math.abs(result.residualMm));
      moistureFrac = r4(result.state.waterMm / result.capacityMm);
      water = growing ? 1 - result.stressCoefficient : 0;
      actualTranspirationMm = result.actualTranspirationMm;
    } else {
      const bucket = stepBucketMoisture(
        prev.moistureFrac * capacity,
        env2,
        kc,
        irrigationByCell.get(key) ?? 0,
        params,
      );
      moistureFrac = r4(bucket.moistureFrac);
      water = hydro.required
        ? (hydroAvailable ? 0 : 1)
        : waterStressFromMoisture(moistureFrac);
    }

    let gddAccumC = prev.gddAccumC;
    let biomassFrac = prev.biomassFrac;
    let dryMatterGPerM2 = prev.dryMatterGPerM2;
    let stage = prev.stage;
    let floweringFrac = prev.floweringFrac;
    let heat = 0;
    let cold = 0;
    let frost = false;
    let pestPressure = prev.pestPressure;
    let light: number | undefined;

    // --- Nitrogen pool (Phase 3): mineralize always, uptake + stress while
    // the crop is growing, leach on heavy water-input days (rain + irrigation).
    const tMeanC = (env2.tMinC + env2.tMaxC) / 2;
    const omRef = initialNitrogenKgHa(carry?.organicMatterPct ?? soil?.organicMatterPct);
    let nitrogenKgHa = r2(prev.nitrogenKgHa + mineralizationKgHa(omRef, tMeanC));
    let nitrogen = 0;
    let required = 0;
    if (growing && crop) {
      required = isV2 && modelParameters?.thermal
        ? modelParameters.thermal.gddToMaturityCdays[1]
        : gddRequiredC(crop, config.meanDailyGddC);
      const seasonalNeed = nitrogenNeedKgHa(crop);
      // Stress reads the pool available going into today vs the remaining
      // seasonal need at the current biomass.
      if (hydro.required) {
        nitrogen = hydroAvailable ? 0 : 1;
      } else {
        nitrogen = nitrogenStress(nitrogenKgHa, seasonalNeed, prev.biomassFrac);
        const demand = uptakeDemandKgHa(
          seasonalNeed,
          env2.gddBase10C / required, // potential (unstressed) biomass gain
          prev.biomassFrac,
        );
        nitrogenKgHa = r2(nitrogenKgHa - Math.min(nitrogenKgHa, demand));
      }
    }
    const waterInMm = env2.precipMm + (irrigationByCell.get(key) ?? 0);
    if (waterInMm > N_LEACH_MM) {
      nitrogenKgHa = r2(nitrogenKgHa * (1 - N_LEACH_FRACTION));
    }

    // Growth only once the crop is actually in the ground (plantedAtDay);
    // water dynamics run from the day the cell exists. Nitrogen is now a
    // real term in the stress max; neighbors bend rate (companions) and
    // stress (antagonists).
    if (growing && crop) {
      // env2 already carries the sheltered temps (idempotent with
      // shelteredTemps: raw handling reads env.raw, preserved by the spread).
      const th = thermalStress(crop, env2.tMinC, env2.tMaxC);
      heat = th.heat;
      cold = th.cold;
      frost = th.frost;
      if (climateResult.climate) {
        light = lightStressFromDli(crop, targetDliForCell(key, config, env));
      }
      const nb = neighbors?.[key];
      const maxStress = Math.min(
        1,
        Math.max(water, heat, cold, nitrogen, light ?? 0) + antagonistStressAdd(nb),
      );
      if (isV2 && modelParameters?.thermal) {
        const dailyThermal = dailyThermalUnits(env2.tMinC, env2.tMaxC, modelParameters.thermal);
        if (dailyThermal === null) {
          modelQualificationReasons.add(dailyModelQualification(prev.cropId, 'Source thermal method could not be evaluated.'));
        } else {
          gddAccumC = Math.min(
            modelParameters.thermal.gddToMaturityCdays[1],
            prev.gddAccumC + dailyThermal,
          );
          const [progressMin, progressMax] = thermalDevelopmentRange(
            gddAccumC,
            modelParameters.thermal.gddToMaturityCdays,
          );
          biomassFrac = progressMin;
          if (progressMin !== progressMax) {
            modelQualificationReasons.add(`Crop ${prev.cropId}: maturity is a source target range; stage uses the conservative upper target.`);
          }
        }
        const enclosed = archetypes[archetype]?.kind !== 'open';
        const dli = enclosed ? targetDliForCell(key, config, env) : env2.dliNaturalMol;
        if (enclosed && dli !== undefined && env.dliNaturalMol === undefined
          && config.environment
          && archetypes[config.environment.archetype]?.dliMode !== 'supplement-only') {
          modelQualificationReasons.add(dailyModelQualification(
            prev.cropId,
            'Known supplemental DLI is used as a lower bound because natural DLI is unknown.',
          ));
        }
        if (prev.biomassFrac < 1 && !prev.harvested) {
          const production = dailyDryMatterProduction({
            dliMolParM2: dli,
            interceptedParFraction: modelParameters.production.interceptedParFraction,
            rueGPerMjInterceptedPar: modelParameters.production.rueGPerMjInterceptedPar,
            stressFactor: Math.max(0, 1 - water),
          });
          if (production.status === 'supported') {
            dryMatterGPerM2 = (prev.dryMatterGPerM2 ?? 0) + production.dryMatterGainGM2;
          } else {
            modelQualificationReasons.add(dailyModelQualification(prev.cropId, production.reason));
          }
        }
        stage = stageForBiomass(biomassFrac);
        floweringFrac = r4(floweringForBiomass(biomassFrac));
      } else {
        const dailyGdd = gddGain(growthEnv, maxStress, companionRateBonus(nb));
        const soilborneFactor = carry
          ? soilborneGrowthFactor(crop.family, carry.inoculum, dayIndex - prev.plantedAtDay, prev.biomassFrac)
          : 1;
        gddAccumC = r2(prev.gddAccumC + dailyGdd * soilborneFactor);
        biomassFrac = r4(biomassFromGdd(gddAccumC, required));
        stage = stageForBiomass(biomassFrac);
        floweringFrac = r4(floweringForBiomass(biomassFrac));
      }
      pestPressure = stepPestPressure(
        prev.pestPressure,
        {
          tMeanC: (env2.tMinC + env2.tMaxC) / 2,
          tMinShelteredC: env2.tMinC,
          precipMm: env2.precipMm,
          moistureFrac,
          hostRatio: (nb?.sameCrop ?? 0) / NEIGHBOR_WINDOW,
        },
        config.seed,
        dayIndex,
        key,
      );
    }

    const nextStress: CellStress = { water, heat, cold, nitrogen, ...(light !== undefined ? { light } : {}) };
    const peakPestPressure = Math.max(prev.peakPestPressure ?? 0, pestPressure);

    // Season stress accumulation — the yield penalty reads this mean.
    let stressSum = prev.stressSum ?? 0;
    let stressDaysCount = prev.stressDaysCount ?? 0;
    if (growing) {
      stressSum = r4(stressSum + meanStress(nextStress));
      stressDaysCount++;
    }
    const seasonMeanStress = stressDaysCount > 0 ? stressSum / stressDaysCount : 0;

    // Auto-harvest: biomass crossing 1.0 schedules payout HARVEST_GRACE_DAYS
    // later; the crop keeps standing, `harvested` keeps yield counting once.
    let readyAtDay = prev.readyAtDay;
    let harvested = prev.harvested;
    if (config.autoHarvest !== false && !harvested) {
      if (readyAtDay === undefined && prev.biomassFrac < 1 && biomassFrac >= 1) {
        readyAtDay = isV2 ? dayIndex : dayIndex + HARVEST_GRACE_DAYS;
      }
      if (readyAtDay !== undefined && dayIndex >= readyAtDay) {
        harvested = true;
        const kg = isV2
          ? v2HarvestDryMatterKg({ ...prev, dryMatterGPerM2 }, config)
          : (crop?.yieldKgPerPlant ?? 0) *
            plantsPerCell(prev.cropId, key) *
            (1 - 0.5 * seasonMeanStress) *
            (1 - 0.3 * peakPestPressure);
        events.push({
          dayIndex,
          date,
          kind: 'harvested',
          cell: key,
          ...eventTarget(key),
          cropId: prev.cropId,
          message: `Harvested ${crop?.name ?? `crop ${prev.cropId}`}${isV2 ? ' (dry matter)' : ''} at ${displayCell(key)}`,
          data: { yieldKg: kg, seasonMeanStress: r2(seasonMeanStress), peakPest: r2(peakPestPressure) },
        });
      }
    }

    const next: CellState = {
      cropId: prev.cropId,
      plantedAtDay: prev.plantedAtDay,
      moistureFrac,
      nitrogenKgHa,
      gddAccumC,
      biomassFrac,
      ...(dryMatterGPerM2 !== undefined ? { dryMatterGPerM2 } : {}),
      ...(rootZoneWaterMm !== undefined ? { rootZoneWaterMm } : {}),
      ...(rootZoneResidualAccumulatedMm !== undefined ? { rootZoneResidualAccumulatedMm } : {}),
      ...(rootZoneResidualMaxAbsMm !== undefined ? { rootZoneResidualMaxAbsMm } : {}),
      ...(rootZoneReplantDrainageMm !== undefined ? { rootZoneReplantDrainageMm } : {}),
      stage,
      floweringFrac,
      pestPressure,
      peakPestPressure: r4(peakPestPressure),
      readyAtDay,
      harvested,
      stressSum: r4(stressSum),
      stressDaysCount,
      ...(prev.target ? { target: prev.target } : {}),
      stress: nextStress,
    };

    const name = crop?.name ?? `crop ${prev.cropId}`;
    if (stage > prev.stage) {
      events.push({
        dayIndex,
        date,
        kind: 'stage',
        cell: key,
        ...eventTarget(key),
        cropId: prev.cropId,
        message: `${name} at ${displayCell(key)} reached stage ${stage}`,
        data: { stage, biomass: biomassFrac },
      });
    }
    if (prev.biomassFrac < 1 && biomassFrac >= 1) {
      events.push({
        dayIndex,
        date,
        kind: 'harvest-ready',
        cell: key,
        ...eventTarget(key),
        cropId: prev.cropId,
        message: `${name} at ${displayCell(key)} is harvest-ready`,
        data: { gddAccumC },
      });
    }
    if (frost) {
      events.push({
        dayIndex,
        date,
        kind: 'frost',
        cell: key,
        ...eventTarget(key),
        cropId: prev.cropId,
        message: `Frost hit ${name} at ${displayCell(key)} (low ${r1(env2.tMinC)} °C)`,
        data: { tMinC: r1(env2.tMinC) },
      });
    }
    if (prev.pestPressure < PEST_OUTBREAK && pestPressure >= PEST_OUTBREAK) {
      events.push({
        dayIndex,
        date,
        kind: 'outbreak',
        cell: key,
        ...eventTarget(key),
        cropId: prev.cropId,
        message: `Pest outbreak on ${name} at ${displayCell(key)} (pressure ${r2(pestPressure)})`,
        data: { pressure: r2(pestPressure) },
      });
    } else if (prev.pestPressure >= PEST_OUTBREAK && pestPressure < PEST_OUTBREAK_END) {
      events.push({
        dayIndex,
        date,
        kind: 'outbreak-end',
        cell: key,
        ...eventTarget(key),
        cropId: prev.cropId,
        message: `Pest pressure eased on ${name} at ${displayCell(key)} (pressure ${r2(pestPressure)})`,
        data: { pressure: r2(pestPressure) },
      });
    }
    // Stress onset/relief events — skipped entirely on the common no-stress
    // day (prev below onset AND next below relief threshold).
    const prevStress = prev.stress;
    const prevMax = maxCellStress(prevStress);
    const nextMax = maxCellStress(nextStress);
    if (prevMax >= STRESS_ONSET || nextMax >= STRESS_RELIEF) {
      pushStressTermEvents(events, prevStress, nextStress, dayIndex, date, key, prev.cropId, name);
    }

    if (!sameCell(prev, next)) {
      ownCells();
      cells[key] = next;
    }

    // Day aggregates + creature capacities, folded into this same pass.
    if (!isV2 || growing) liveCells++;
    etcMmSum += env2.etoMm * kcForBiomass(biomassFrac);
    actualTranspirationSumMm += actualTranspirationMm;
    if (nextMax >= STRESS_ONSET) statsStressCellDays++;
    if (nextStress.water >= STRESS_ONSET) statsStressDays.water++;
    if (nextStress.heat >= STRESS_ONSET) statsStressDays.heat++;
    if (nextStress.cold >= STRESS_ONSET) statsStressDays.cold++;
    if (nextStress.nitrogen >= STRESS_ONSET) statsStressDays.nitrogen++;
    if (nextStress.light !== undefined) {
      lightStressObserved = true;
      if (nextStress.light >= STRESS_ONSET) statsStressDays.light = (statsStressDays.light ?? 0) + 1;
    }
    if (pestPressure >= PEST_OUTBREAK) outbreakCellDays++;
    butterflyCapacity += floweringFrac;
    if (crop && isInsectPollinated(crop)) beeCapacity += floweringFrac;
    pestSum += pestPressure;
  }

  if (lightStressObserved) statsStressDays.light ??= 0;
  const dayStats: DayStats = {
    liveCells,
    waterUseMm: liveCells > 0 ? (isV2 ? actualTranspirationSumMm : etcMmSum) / liveCells : 0,
    stressCellDays: statsStressCellDays,
    stressDays: statsStressDays,
    outbreakDays: outbreakCellDays,
  };

  // Run-wide creature populations (bees/butterflies/pests) for display
  // wiring — identity preserved when nothing moved.
  const nextCreatures: Record<string, number> = {
    bees: Math.round(beeCapacity * BEES_PER_FLOWERING_CELL),
    butterflies: Math.round(butterflyCapacity * BUTTERFLIES_PER_FLOWERING_CELL),
    pests: Math.round(liveCells > 0 ? (pestSum / liveCells) * PESTS_PER_MEAN_PRESSURE : 0),
  };
  const creaturesEqual =
    state.creatures.bees === nextCreatures.bees &&
    state.creatures.butterflies === nextCreatures.butterflies &&
    state.creatures.pests === nextCreatures.pests;

  const nextState: SimState = {
    dayIndex: dayIndex + 1,
    surface,
    archetype,
    ...(climateResult.climate ? { climate: climateResult.climate } : {}),
    ...(config.assetPhysics ? { waterStoreL: waterStoreL ?? 0 } : {}),
    cells, // previous ref when nothing changed; owned copy otherwise
    ...(modelQualificationReasons.size > 0 ? { modelQualificationReasons: [...modelQualificationReasons] } : {}),
    neighbors,
    creatures: creaturesEqual ? state.creatures : nextCreatures,
    events: events.length > 0 ? [...state.events, ...events] : state.events,
  };
  return { state: nextState, events, dayStats, effectiveEnv: env2 };
}

export interface SimulateResult {
  finalState: SimState;
  events: SimEvent[];
  summary: RunSummary;
}

/** Fold stepDay across the frozen series. A season is milliseconds of
 * arithmetic — persistence calls this once at create time to compute the
 * RunSummary synchronously. */
export function simulateRun(
  config: RunConfig,
  envSeries: readonly DailyEnvironment[],
  ctx: SimRunCtx = {},
  observations: readonly Observation[] = [],
): SimulateResult {
  const modelSupport = config.cropModelVersion === 'crop-model-v2'
    ? inspectRunModelSupport(config, false)
    : undefined;
  if (modelSupport && !modelSupport.canReplay) {
    const finalState = createRun(config, ctx);
    return {
      finalState,
      events: [],
      summary: {
        daysSimulated: 0,
        rainMm: 0,
        irrigatedMm: 0,
        etoMmTotal: 0,
        totalYieldKg: 0,
        yieldKgByCrop: {},
        stressCellDays: 0,
        waterUseMm: 0,
        stressDays: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
        outbreakDays: 0,
        meanNitrogenKgHa: 0,
        harvestReadyDay: null,
        matureCells: 0,
        cellCount: Object.keys(finalState.cells).length,
        eventCounts: {},
        modelQualification: {
          status: 'unsupported',
          reasons: modelSupport.reasons,
        },
      },
    };
  }
  const frozenObservations = canonicalizeObservations(observations);
  let st = createRun(config, ctx);
  let rainMm = 0;
  let etoMm = 0;
  let irrigatedMm = 0;
  let stressCellDays = 0;
  let waterUseMm = 0;
  let outbreakDays = 0;
  const stressDays = { water: 0, heat: 0, cold: 0, nitrogen: 0 };
  let lightStressDays = 0;
  let hasLightStressData = false;
  let harvestReadyDay: number | null = null;
  const yieldByCrop = new Map<number, number>();
  const eventCounts = new Map<string, number>();

  for (const env of envSeries) {
    const res = stepDay(st, env, config, ctx, frozenObservations);
    st = res.state;
    // Summary rain/ET reflect the world the run lives in: the effective env
    // (an enclosed run reports 0 rain, attenuated ET0).
    const eff = res.effectiveEnv;
    rainMm += eff.precipMm;
    etoMm += eff.etoMm;
    const ds = res.dayStats;
    if (ds) {
      stressCellDays += ds.stressCellDays;
      waterUseMm += ds.waterUseMm;
      outbreakDays += ds.outbreakDays;
      stressDays.water += ds.stressDays.water;
      stressDays.heat += ds.stressDays.heat;
      stressDays.cold += ds.stressDays.cold;
      stressDays.nitrogen += ds.stressDays.nitrogen;
      if (ds.stressDays.light !== undefined) {
        hasLightStressData = true;
        lightStressDays += ds.stressDays.light;
      }
    }
    for (const ev of res.events) {
      eventCounts.set(ev.kind, (eventCounts.get(ev.kind) ?? 0) + 1);
      if (ev.kind === 'harvest-ready' && harvestReadyDay === null) harvestReadyDay = ev.dayIndex;
      if (ev.kind === 'harvested' && ev.cropId !== undefined && ev.data) {
        yieldByCrop.set(ev.cropId, (yieldByCrop.get(ev.cropId) ?? 0) + (ev.data.yieldKg ?? 0));
      }
      if (ev.kind === 'irrigated' && ev.data) irrigatedMm += ev.data.totalMm ?? 0;
    }
  }

  const yieldKgByCrop: Record<string, number> = {};
  let totalYieldKg = 0;
  for (const [id, kg] of yieldByCrop) {
    yieldKgByCrop[String(id)] = r2(kg);
    totalYieldKg += kg;
  }
  const counts: Record<string, number> = {};
  for (const [k, v] of eventCounts) counts[k] = v;
  let matureCells = 0;
  let nSum = 0;
  const finalKeys = Object.keys(st.cells);
  for (const key of finalKeys) {
    const c = st.cells[key]!;
    if (c.biomassFrac >= 1) matureCells++;
    nSum += c.nitrogenKgHa;
  }

  const summary: RunSummary = {
    daysSimulated: envSeries.length,
    rainMm: r1(rainMm),
    irrigatedMm: r1(irrigatedMm),
    etoMmTotal: r1(etoMm),
    totalYieldKg: r2(totalYieldKg),
    yieldKgByCrop,
    stressCellDays,
    waterUseMm: r1(waterUseMm),
    stressDays: { ...stressDays, ...(hasLightStressData ? { light: lightStressDays } : {}) },
    outbreakDays,
    meanNitrogenKgHa: finalKeys.length > 0 ? r1(nSum / finalKeys.length) : 0,
    harvestReadyDay,
    matureCells,
    cellCount: finalKeys.length,
    eventCounts: counts,
    ...(config.cropModelVersion === 'crop-model-v2'
      ? {
          yieldBasis: 'dry-matter' as const,
          modelQualification: {
            status: 'qualified' as const,
            reasons: [...new Set([
              ...(modelSupport?.reasons ?? []),
              ...(st.modelQualificationReasons ?? []),
            ])],
          },
          rootZoneBalanceResidualAccumulatedMm: finalKeys.reduce(
            (sum, key) => sum + (st.cells[key]?.rootZoneResidualAccumulatedMm ?? 0),
            0,
          ),
          rootZoneBalanceResidualMaxAbsMm: finalKeys.reduce(
            (max, key) => Math.max(max, st.cells[key]?.rootZoneResidualMaxAbsMm ?? 0),
            0,
          ),
          rootZoneReplantDrainageMm: finalKeys.reduce(
            (sum, key) => sum + (st.cells[key]?.rootZoneReplantDrainageMm ?? 0),
            0,
          ),
        }
      : {}),
  };
  return { finalState: st, events: st.events, summary };
}
