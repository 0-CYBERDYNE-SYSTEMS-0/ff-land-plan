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
import { plantsForArea } from '@/lib/plan';
import type { SoilProfile } from '@/lib/soil';
import type { Crop } from '@/types';
import type {
  CellState,
  CellStress,
  DailyEnvironment,
  DayStats,
  Intervention,
  RunConfig,
  RunSummary,
  SimEvent,
  SimState,
} from './types';
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
  uptakeDemandKgHa,
} from './ecosystem';
import { isoDayNumber } from './environment';

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Shared no-intervention array — keeps the hot stepDay path allocation-free
 * when the run has no interventions at all. */
const EMPTY_TODAY: Intervention[] = [];

export interface SimRunCtx {
  /** Farm soil (only AWC + OM are read; both optional). */
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> | null;
  /** Crop lookup incl. custom crops; defaults to the static library. */
  crops?: Crop[];
}

const MOISTURE_INIT = 0.7; // documented v1 start: a wet-but-not-saturated bucket

/** Auto-harvest fires this many days after biomass first crosses 1.0. */
export const HARVEST_GRACE_DAYS = 3;
/** Manual 'harvest' interventions pay out only from this biomass on. */
export const MIN_MANUAL_HARVEST_BIOMASS = 0.8;

function initialCell(
  cropId: number,
  plantedAtDay: number,
  ctx: SimRunCtx,
): CellState {
  return {
    cropId,
    plantedAtDay,
    moistureFrac: MOISTURE_INIT,
    nitrogenKgHa: initialNitrogenKgHa(ctx.soil?.organicMatterPct),
    gddAccumC: 0,
    biomassFrac: 0,
    stage: 0,
    floweringFrac: 0,
    pestPressure: 0,
    peakPestPressure: 0,
    stressSum: 0,
    stressDaysCount: 0,
    stress: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
  };
}

function cropMapOf(ctx: SimRunCtx): Map<number, Crop> {
  const map = new Map<number, Crop>();
  for (const c of ctx.crops ?? cropLibrary) map.set(c.id, c);
  return map;
}

/** Initial state at dayIndex 0: one cell per basePlan planting key. Cells
 * planted (per plan plantedAt) after startDate carry that offset and only
 * start accumulating GDD once dayIndex reaches it. The neighbor context is
 * built once here and rebuilt only on 'plant' interventions. */
export function createRun(config: RunConfig, ctx: SimRunCtx = {}): SimState {
  const start = isoDayNumber(config.startDate);
  const planting = config.basePlan.planting ?? {};
  const plantedAt = config.basePlan.plantedAt ?? {};
  const cropMap = cropMapOf(ctx);
  const cropGet = (id: number) => cropMap.get(id);
  const cells: Record<string, CellState> = {};
  for (const key of Object.keys(planting)) {
    const iso = plantedAt[key];
    const offset = iso !== undefined ? isoDayNumber(iso) - start : 0;
    cells[key] = initialCell(planting[key], Math.max(0, offset), ctx);
  }
  return {
    dayIndex: 0,
    surface: config.basePlan.surface ?? 'outdoor',
    cells,
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
): string[] {
  if (cellList && cellList.length > 0) {
    return cellList.filter((k) => k in cells);
  }
  return Object.keys(cells);
}

const STRESS_TERMS = ['water', 'heat', 'cold', 'nitrogen'] as const;

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
    const prevV = prevStress[term];
    const nextV = nextStress[term];
    if (prevV < STRESS_ONSET && nextV >= STRESS_ONSET) {
      out.push({
        dayIndex,
        date,
        kind: 'stress-onset',
        cell: key,
        cropId,
        message: `${term} stress onset for ${name} at ${key}`,
        data: { value: r2(nextV) },
      });
    } else if (prevV >= STRESS_ONSET && nextV < STRESS_RELIEF) {
      out.push({
        dayIndex,
        date,
        kind: 'stress-end',
        cell: key,
        cropId,
        message: `${term} stress relieved for ${name} at ${key}`,
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
      a.stage === b.stage &&
      a.floweringFrac === b.floweringFrac &&
      a.pestPressure === b.pestPressure &&
      a.peakPestPressure === b.peakPestPressure &&
      a.readyAtDay === b.readyAtDay &&
      a.harvested === b.harvested &&
      a.stressSum === b.stressSum &&
      a.stressDaysCount === b.stressDaysCount &&
      a.stress.water === b.stress.water &&
      a.stress.heat === b.stress.heat &&
      a.stress.cold === b.stress.cold &&
      a.stress.nitrogen === b.stress.nitrogen)
  );
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
): { state: SimState; events: SimEvent[]; dayStats: DayStats } {
  const dayIndex = state.dayIndex;
  const date = env.date;
  const crops = cropMapOf(ctx);
  const params = soilWaterParams(ctx.soil?.awcMmPerCm);
  const capacity = bucketCapacityMm(params);
  const events: SimEvent[] = [];

  const todays = config.interventions.length
    ? config.interventions.filter((iv) => iv.kind !== 'weather' && iv.date === date)
    : EMPTY_TODAY;

  let cells = state.cells;
  // Harvest events are per sim cell, so spread each crop's whole-area plant
  // count over its occupied cells to keep payouts aligned with plan stats.
  const cellsPerCrop = new Map<number, number>();
  for (const cell of Object.values(cells)) {
    cellsPerCrop.set(cell.cropId, (cellsPerCrop.get(cell.cropId) ?? 0) + 1);
  }
  const plantsPerCell = (cropId: number): number => {
    const count = cellsPerCrop.get(cropId) ?? 0;
    const crop = crops.get(cropId);
    return crop && count > 0 ? plantsForArea(crop, count) / count : 0;
  };
  let cellsOwned = false;
  const ownCells = () => {
    if (!cellsOwned) {
      cells = { ...cells };
      cellsOwned = true;
    }
  };
  let surface = state.surface;
  // Neighbor cache: built at createRun; rebuilt here only when a 'plant'
  // intervention adds a cell (O(cells × 24), rare).
  let neighbors = state.neighbors;
  const cropGet = (id: number) => crops.get(id);
  // Run-constant OM-derived pool reference driving the daily mineralization
  // trickle (see ecosystem.mineralizationKgHa).
  const omRef = initialNitrogenKgHa(ctx.soil?.organicMatterPct);

  // Interventions first: plants/harvests/fertilizer/irrigation targets resolve
  // against the post-plant cell set.
  for (const iv of todays) {
    switch (iv.kind) {
      case 'plant': {
        const existing = cells[iv.cell];
        if (existing) {
          cellsPerCrop.set(existing.cropId, (cellsPerCrop.get(existing.cropId) ?? 1) - 1);
        }
        ownCells();
        cells[iv.cell] = initialCell(iv.cropId, dayIndex, ctx);
        cellsPerCrop.set(iv.cropId, (cellsPerCrop.get(iv.cropId) ?? 0) + 1);
        neighbors = buildNeighborCache(cells, cropGet);
        events.push({
          dayIndex,
          date,
          kind: 'planted',
          cell: iv.cell,
          cropId: iv.cropId,
          message: `Planted ${crops.get(iv.cropId)?.name ?? `crop ${iv.cropId}`} at ${iv.cell}`,
        });
        break;
      }
      case 'harvest': {
        // Manual harvest: pays out once (harvested flag) when the crop is
        // ripe enough (biomass ≥ 0.8), applying the pest peak penalty. The
        // crop stays standing — a twin, not a clearing sim. Too early →
        // 'harvest-too-early' event, no payout.
        const c = cells[iv.cell];
        if (c && !c.harvested) {
          const crop = crops.get(c.cropId);
          const name = crop?.name ?? `crop ${c.cropId}`;
          if (c.biomassFrac >= MIN_MANUAL_HARVEST_BIOMASS) {
            const seasonMean =
              (c.stressDaysCount ?? 0) > 0 ? (c.stressSum ?? 0) / c.stressDaysCount! : meanStress(c.stress);
            const kg = r2(
              (crop?.yieldKgPerPlant ?? 0) *
                plantsPerCell(c.cropId) *
                (1 - 0.5 * seasonMean) *
                (1 - 0.3 * (c.peakPestPressure ?? c.pestPressure)),
            );
            ownCells();
            cells[iv.cell] = { ...c, harvested: true };
            events.push({
              dayIndex,
              date,
              kind: 'harvested',
              cell: iv.cell,
              cropId: c.cropId,
              message: `Harvested ${name} at ${iv.cell}`,
              data: { yieldKg: kg },
            });
          } else {
            events.push({
              dayIndex,
              date,
              kind: 'harvest-too-early',
              cell: iv.cell,
              cropId: c.cropId,
              message: `${name} at ${iv.cell} is not ready to harvest (biomass ${r2(c.biomassFrac)} < ${MIN_MANUAL_HARVEST_BIOMASS})`,
              data: { biomass: c.biomassFrac, minimum: MIN_MANUAL_HARVEST_BIOMASS },
            });
          }
        }
        break;
      }
      case 'fertilize': {
        const targets = targetCells(iv.cells, cells);
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
            message: `Fertilized ${targets.length} cell(s) with ${iv.nKgHa} kg/ha N`,
            data: { nKgHa: iv.nKgHa, cellCount: targets.length },
          });
        }
        break;
      }
      case 'irrigate': {
        const targets = targetCells(iv.cells, cells);
        if (targets.length > 0) {
          events.push({
            dayIndex,
            date,
            kind: 'irrigated',
            message: `Irrigated ${targets.length} cell(s) with ${iv.mm} mm`,
            data: { mmPerCell: iv.mm, cellCount: targets.length, totalMm: r2(iv.mm * targets.length) },
          });
        }
        break;
      }
      case 'surface': {
        surface = iv.surface;
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
  const irrigationByCell = new Map<string, number>();
  for (const iv of todays) {
    if (iv.kind !== 'irrigate') continue;
    for (const k of targetCells(iv.cells, cells)) {
      irrigationByCell.set(k, (irrigationByCell.get(k) ?? 0) + iv.mm);
    }
  }

  let liveCells = 0;
  let etcMmSum = 0;
  let statsStressCellDays = 0;
  let outbreakCellDays = 0;
  const statsStressDays = { water: 0, heat: 0, cold: 0, nitrogen: 0 };
  let beeCapacity = 0;
  let butterflyCapacity = 0;
  let pestSum = 0;

  // Shelter at ingestion: one effective env per day feeds every consumer in
  // the pass below (outdoor passes through by reference).
  const env2 = effectiveEnvironmentForSurface(env, surface);

  for (const key of Object.keys(cells)) {
    const prev = cells[key]!;
    const crop = crops.get(prev.cropId);
    const kc = kcForBiomass(prev.biomassFrac);
    const bucket = stepBucketMoisture(
      prev.moistureFrac * capacity,
      env2,
      kc,
      irrigationByCell.get(key) ?? 0,
      params,
    );
    const moistureFrac = r4(bucket.moistureFrac);
    const water = waterStressFromMoisture(moistureFrac);

    let gddAccumC = prev.gddAccumC;
    let biomassFrac = prev.biomassFrac;
    let stage = prev.stage;
    let floweringFrac = prev.floweringFrac;
    let heat = 0;
    let cold = 0;
    let frost = false;
    let pestPressure = prev.pestPressure;

    // --- Nitrogen pool (Phase 3): mineralize always, uptake + stress while
    // the crop is growing, leach on heavy water-input days (rain + irrigation).
    const tMeanC = (env2.tMinC + env2.tMaxC) / 2;
    let nitrogenKgHa = r2(prev.nitrogenKgHa + mineralizationKgHa(omRef, tMeanC));
    let nitrogen = 0;
    let required = 0;
    const growing = crop !== undefined && dayIndex >= prev.plantedAtDay;
    if (growing && crop) {
      required = gddRequiredC(crop, config.meanDailyGddC);
      const seasonalNeed = nitrogenNeedKgHa(crop);
      // Stress reads the pool available going into today vs the remaining
      // seasonal need at the current biomass.
      nitrogen = nitrogenStress(nitrogenKgHa, seasonalNeed, prev.biomassFrac);
      const demand = uptakeDemandKgHa(
        seasonalNeed,
        env2.gddBase10C / required, // potential (unstressed) biomass gain
        prev.biomassFrac,
      );
      nitrogenKgHa = r2(nitrogenKgHa - Math.min(nitrogenKgHa, demand));
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
      const nb = neighbors?.[key];
      const maxStress = Math.min(
        1,
        Math.max(water, heat, cold, nitrogen) + antagonistStressAdd(nb),
      );
      gddAccumC = r2(prev.gddAccumC + gddGain(env2, maxStress, companionRateBonus(nb)));
      biomassFrac = r4(biomassFromGdd(gddAccumC, required));
      stage = stageForBiomass(biomassFrac);
      floweringFrac = r4(floweringForBiomass(biomassFrac));
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

    const nextStress: CellStress = { water, heat, cold, nitrogen };
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
        readyAtDay = dayIndex + HARVEST_GRACE_DAYS;
      }
      if (readyAtDay !== undefined && dayIndex >= readyAtDay) {
        harvested = true;
        const kg = r2(
          (crop?.yieldKgPerPlant ?? 0) *
            plantsPerCell(prev.cropId) *
            (1 - 0.5 * seasonMeanStress) *
            (1 - 0.3 * peakPestPressure),
        );
        events.push({
          dayIndex,
          date,
          kind: 'harvested',
          cell: key,
          cropId: prev.cropId,
          message: `Harvested ${crop?.name ?? `crop ${prev.cropId}`} at ${key}`,
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
      stage,
      floweringFrac,
      pestPressure,
      peakPestPressure: r4(peakPestPressure),
      readyAtDay,
      harvested,
      stressSum: r4(stressSum),
      stressDaysCount,
      stress: nextStress,
    };

    const name = crop?.name ?? `crop ${prev.cropId}`;
    if (stage > prev.stage) {
      events.push({
        dayIndex,
        date,
        kind: 'stage',
        cell: key,
        cropId: prev.cropId,
        message: `${name} at ${key} reached stage ${stage}`,
        data: { stage, biomass: biomassFrac },
      });
    }
    if (prev.biomassFrac < 1 && biomassFrac >= 1) {
      events.push({
        dayIndex,
        date,
        kind: 'harvest-ready',
        cell: key,
        cropId: prev.cropId,
        message: `${name} at ${key} is harvest-ready`,
        data: { gddAccumC },
      });
    }
    if (frost) {
      events.push({
        dayIndex,
        date,
        kind: 'frost',
        cell: key,
        cropId: prev.cropId,
        message: `Frost hit ${name} at ${key} (low ${r1(env2.tMinC)} °C)`,
        data: { tMinC: r1(env2.tMinC) },
      });
    }
    if (prev.pestPressure < PEST_OUTBREAK && pestPressure >= PEST_OUTBREAK) {
      events.push({
        dayIndex,
        date,
        kind: 'outbreak',
        cell: key,
        cropId: prev.cropId,
        message: `Pest outbreak on ${name} at ${key} (pressure ${r2(pestPressure)})`,
        data: { pressure: r2(pestPressure) },
      });
    } else if (prev.pestPressure >= PEST_OUTBREAK && pestPressure < PEST_OUTBREAK_END) {
      events.push({
        dayIndex,
        date,
        kind: 'outbreak-end',
        cell: key,
        cropId: prev.cropId,
        message: `Pest pressure eased on ${name} at ${key} (pressure ${r2(pestPressure)})`,
        data: { pressure: r2(pestPressure) },
      });
    }
    // Stress onset/relief events — skipped entirely on the common no-stress
    // day (prev below onset AND next below relief threshold).
    const prevStress = prev.stress;
    const prevMax = Math.max(prevStress.water, prevStress.heat, prevStress.cold, prevStress.nitrogen);
    const nextMax = Math.max(nextStress.water, nextStress.heat, nextStress.cold, nextStress.nitrogen);
    if (prevMax >= STRESS_ONSET || nextMax >= STRESS_RELIEF) {
      pushStressTermEvents(events, prevStress, nextStress, dayIndex, date, key, prev.cropId, name);
    }

    if (!sameCell(prev, next)) {
      ownCells();
      cells[key] = next;
    }

    // Day aggregates + creature capacities, folded into this same pass.
    liveCells++;
    etcMmSum += env2.etoMm * kcForBiomass(biomassFrac);
    if (nextMax >= STRESS_ONSET) statsStressCellDays++;
    if (nextStress.water >= STRESS_ONSET) statsStressDays.water++;
    if (nextStress.heat >= STRESS_ONSET) statsStressDays.heat++;
    if (nextStress.cold >= STRESS_ONSET) statsStressDays.cold++;
    if (nextStress.nitrogen >= STRESS_ONSET) statsStressDays.nitrogen++;
    if (pestPressure >= PEST_OUTBREAK) outbreakCellDays++;
    butterflyCapacity += floweringFrac;
    if (crop && isInsectPollinated(crop)) beeCapacity += floweringFrac;
    pestSum += pestPressure;
  }

  const dayStats: DayStats = {
    liveCells,
    waterUseMm: liveCells > 0 ? etcMmSum / liveCells : 0,
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
    cells, // previous ref when nothing changed; owned copy otherwise
    neighbors,
    creatures: creaturesEqual ? state.creatures : nextCreatures,
    events: events.length > 0 ? [...state.events, ...events] : state.events,
  };
  return { state: nextState, events, dayStats };
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
): SimulateResult {
  let st = createRun(config, ctx);
  let rainMm = 0;
  let etoMm = 0;
  let irrigatedMm = 0;
  let stressCellDays = 0;
  let waterUseMm = 0;
  let outbreakDays = 0;
  const stressDays = { water: 0, heat: 0, cold: 0, nitrogen: 0 };
  let harvestReadyDay: number | null = null;
  const yieldByCrop = new Map<number, number>();
  const eventCounts = new Map<string, number>();

  for (const env of envSeries) {
    const res = stepDay(st, env, config, ctx);
    st = res.state;
    // Summary rain/ET reflect the world the run lives in: the effective env
    // (an enclosed run reports 0 rain, attenuated ET0).
    const eff = effectiveEnvironmentForSurface(env, st.surface);
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
    stressDays,
    outbreakDays,
    meanNitrogenKgHa: finalKeys.length > 0 ? r1(nSum / finalKeys.length) : 0,
    harvestReadyDay,
    matureCells,
    cellCount: finalKeys.length,
    eventCounts: counts,
  };
  return { finalState: st, events: st.events, summary };
}
