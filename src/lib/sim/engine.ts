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
import type { SoilProfile } from '@/lib/soil';
import type { Crop } from '@/types';
import type {
  CellState,
  CellStress,
  DailyEnvironment,
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
  biomassFromGdd,
  floweringForBiomass,
  gddGain,
  gddRequiredC,
  meanStress,
  shelteredTemps,
  stageForBiomass,
  thermalStress,
} from './drivers';
import { isoDayNumber } from './environment';

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export interface SimRunCtx {
  /** Farm soil (only AWC + OM are read; both optional). */
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> | null;
  /** Crop lookup incl. custom crops; defaults to the static library. */
  crops?: Crop[];
}

const MOISTURE_INIT = 0.7; // documented v1 start: a wet-but-not-saturated bucket

// Soil OM heuristic (documented): total-N pool ≈ OM% × 250 kg/ha, clamped
// [200, 1200]; default 500 when soil is unknown. Static in Phase 1 — uptake
// and mineralization dynamics arrive in Phase 3.
function initialNitrogenKgHa(organicMatterPct: number | null | undefined): number {
  if (typeof organicMatterPct !== 'number' || !Number.isFinite(organicMatterPct)) return 500;
  return Math.min(1200, Math.max(200, organicMatterPct * 250));
}

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
    pestPressure: 0, // dynamics land in Phase 3
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
 * start accumulating GDD once dayIndex reaches it. */
export function createRun(config: RunConfig, ctx: SimRunCtx = {}): SimState {
  const start = isoDayNumber(config.startDate);
  const planting = config.basePlan.planting ?? {};
  const plantedAt = config.basePlan.plantedAt ?? {};
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
    creatures: {}, // populations arrive in Phase 3
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
      a.stress.water === b.stress.water &&
      a.stress.heat === b.stress.heat &&
      a.stress.cold === b.stress.cold &&
      a.stress.nitrogen === b.stress.nitrogen)
  );
}

/** Advance one day. `env` is that day's composed environment (the run's
 * frozen series entry); 'weather' interventions are NOT applied here — they
 * are baked into the series by buildEnvSeries. Returns the new state
 * (structural sharing) and the day's events. */
export function stepDay(
  state: SimState,
  env: DailyEnvironment,
  config: RunConfig,
  ctx: SimRunCtx = {},
): { state: SimState; events: SimEvent[] } {
  const dayIndex = state.dayIndex;
  const date = env.date;
  const crops = cropMapOf(ctx);
  const params = soilWaterParams(ctx.soil?.awcMmPerCm);
  const capacity = bucketCapacityMm(params);
  const events: SimEvent[] = [];

  const todays = config.interventions.filter((iv) => iv.kind !== 'weather' && iv.date === date);

  let cells = state.cells;
  let cellsOwned = false;
  const ownCells = () => {
    if (!cellsOwned) {
      cells = { ...cells };
      cellsOwned = true;
    }
  };
  let surface = state.surface;

  // Interventions first: plants/harvests/fertilizer/irrigation targets resolve
  // against the post-plant cell set.
  for (const iv of todays) {
    switch (iv.kind) {
      case 'plant': {
        ownCells();
        cells[iv.cell] = initialCell(iv.cropId, dayIndex, ctx);
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
        const c = cells[iv.cell];
        if (c) {
          ownCells();
          const crop = crops.get(c.cropId);
          const kg = r2((crop?.yieldKgPerPlant ?? 0) * (1 - 0.5 * meanStress(c.stress)));
          delete cells[iv.cell];
          events.push({
            dayIndex,
            date,
            kind: 'harvested',
            cell: iv.cell,
            cropId: c.cropId,
            message: `Harvested ${crop?.name ?? `crop ${c.cropId}`} at ${iv.cell}`,
            data: { yieldKg: kg },
          });
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
  // plants); multiple irrigations sum.
  const irrigationByCell = new Map<string, number>();
  for (const iv of todays) {
    if (iv.kind !== 'irrigate') continue;
    for (const k of targetCells(iv.cells, cells)) {
      irrigationByCell.set(k, (irrigationByCell.get(k) ?? 0) + iv.mm);
    }
  }

  for (const key of Object.keys(cells)) {
    const prev = cells[key]!;
    const crop = crops.get(prev.cropId);
    const kc = kcForBiomass(prev.biomassFrac);
    const bucket = stepBucketMoisture(
      prev.moistureFrac * capacity,
      env,
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

    // Growth only once the crop is actually in the ground (plantedAtDay);
    // water dynamics run from the day the cell exists.
    if (crop && dayIndex >= prev.plantedAtDay) {
      const t = shelteredTemps(env, surface);
      const th = thermalStress(crop, t.tMinC, t.tMaxC);
      heat = th.heat;
      cold = th.cold;
      frost = th.frost;
      const maxStress = Math.max(water, heat, cold); // nitrogen stress: Phase 3
      gddAccumC = r2(prev.gddAccumC + gddGain(env, maxStress));
      biomassFrac = r4(biomassFromGdd(gddAccumC, gddRequiredC(crop, config.meanDailyGddC)));
      stage = stageForBiomass(biomassFrac);
      floweringFrac = r4(floweringForBiomass(biomassFrac));
    }

    const nextStress: CellStress = { water, heat, cold, nitrogen: 0 };
    const next: CellState = {
      cropId: prev.cropId,
      plantedAtDay: prev.plantedAtDay,
      moistureFrac,
      nitrogenKgHa: prev.nitrogenKgHa,
      gddAccumC,
      biomassFrac,
      stage,
      floweringFrac,
      pestPressure: prev.pestPressure,
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
        message: `Frost hit ${name} at ${key} (low ${r1(env.tMinC)} °C)`,
        data: { tMinC: r1(env.tMinC) },
      });
    }
    for (const term of ['water', 'heat', 'cold'] as const) {
      const prevV = prev.stress[term];
      const nextV = nextStress[term];
      if (prevV < STRESS_ONSET && nextV >= STRESS_ONSET) {
        events.push({
          dayIndex,
          date,
          kind: 'stress-onset',
          cell: key,
          cropId: prev.cropId,
          message: `${term} stress onset for ${name} at ${key}`,
          data: { value: r2(nextV) },
        });
      } else if (prevV >= STRESS_ONSET && nextV < STRESS_RELIEF) {
        events.push({
          dayIndex,
          date,
          kind: 'stress-end',
          cell: key,
          cropId: prev.cropId,
          message: `${term} stress relieved for ${name} at ${key}`,
          data: { value: r2(nextV) },
        });
      }
    }

    if (!sameCell(prev, next)) {
      ownCells();
      cells[key] = next;
    }
  }

  const nextState: SimState = {
    dayIndex: dayIndex + 1,
    surface,
    cells, // previous ref when nothing changed; owned copy otherwise
    creatures: state.creatures,
    events: events.length > 0 ? [...state.events, ...events] : state.events,
  };
  return { state: nextState, events };
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
  let harvestReadyDay: number | null = null;
  const yieldByCrop = new Map<number, number>();
  const eventCounts = new Map<string, number>();

  for (const env of envSeries) {
    const res = stepDay(st, env, config, ctx);
    st = res.state;
    rainMm += env.precipMm; // effective (scenario) rain — the world the run lives in
    etoMm += env.etoMm;
    for (const ev of res.events) {
      eventCounts.set(ev.kind, (eventCounts.get(ev.kind) ?? 0) + 1);
      if (ev.kind === 'harvest-ready' && harvestReadyDay === null) harvestReadyDay = ev.dayIndex;
      if (ev.kind === 'harvested' && ev.cropId !== undefined && ev.data) {
        yieldByCrop.set(ev.cropId, (yieldByCrop.get(ev.cropId) ?? 0) + (ev.data.yieldKg ?? 0));
      }
      if (ev.kind === 'irrigated' && ev.data) irrigatedMm += ev.data.totalMm ?? 0;
    }
    for (const key of Object.keys(st.cells)) {
      const s = st.cells[key]!.stress;
      if (Math.max(s.water, s.heat, s.cold, s.nitrogen) >= STRESS_ONSET) stressCellDays++;
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
  for (const key of Object.keys(st.cells)) {
    if (st.cells[key]!.biomassFrac >= 1) matureCells++;
  }

  const summary: RunSummary = {
    daysSimulated: envSeries.length,
    rainMm: r1(rainMm),
    irrigatedMm: r1(irrigatedMm),
    etoMmTotal: r1(etoMm),
    totalYieldKg: r2(totalYieldKg),
    yieldKgByCrop,
    stressCellDays,
    harvestReadyDay,
    matureCells,
    cellCount: Object.keys(st.cells).length,
    eventCounts: counts,
  };
  return { finalState: st, events: st.events, summary };
}
