// Core data model for the deterministic sim engine
// (quality/SPEC-SIM-ECOSYSTEM.md §3.2 — sketch refined in place, invariants kept).
//
// Two load-bearing invariants:
//   1. NO Math.random anywhere under src/lib/sim/ — the same
//      (RunConfig, envSeries) must replay byte-identically. RunRecord persists
//      config + envSeries + summary ONLY; replay is the storage. Never persist
//      per-tick SimState snapshots (localStorage budget is ~5 MB, whole-blob
//      rewrites).
//   2. Every environment number traces to a source via EnvSourceTag.

import type { PlanState, PlanSurface, ScenarioType } from '@/types';

/** Provenance chip for one environment value. */
export type EnvSourceTag =
  | 'open-meteo-archive' // observed ERA5 daily value (Open-Meteo archive API)
  | 'open-meteo-forecast' // reserved for forecast-backed days (not produced yet)
  | 'era5-normals' // synthesized from ERA5 climate normals (monthly means)
  | 'model-estimate' // v1 proxy formula (documented fallback, e.g. ETO proxy)
  | 'scenario-delta' // = raw source value + run scenario perturbation (see `raw`)
  | 'default'; // documented built-in fallback (no site data at all)

/** One composed day. Effective values include the run scenario; when the
 * scenario perturbed a field, that field's tag becomes 'scenario-delta' and
 * the pre-scenario value + its source tag move into `raw`. */
export interface DailyEnvironment {
  date: string; // "YYYY-MM-DD"
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  /** Reference ET (FAO-56 ET0, mm/day): real archive/normals value when
   * available, else the documented temp-range proxy (model-estimate). */
  etoMm: number;
  /** max(0, (tMin + tMax)/2 − 10), °C·day — computed from EFFECTIVE temps so
   * climate scenarios actually move the GDD clock. */
  gddBase10C: number;
  provenance: {
    tMinC: EnvSourceTag;
    tMaxC: EnvSourceTag;
    precipMm: EnvSourceTag;
    etoMm: EnvSourceTag;
  };
  /** Pre-scenario values; present only when the scenario changed the day. */
  raw?: { tMinC: number; tMaxC: number; precipMm: number; source: EnvSourceTag };
}

/**
 * Explicit management actions applied on their date during stepDay.
 * - irrigate/fertilize target `cells` when listed, else all cells in the run
 *   (`zone` is accepted per spec but zones don't exist in v1 — a run is one
 *   zone; reserved for Phase 3).
 * - 'weather' deltas are consumed at series-composition time by
 *   buildEnvSeries (extractWeatherOverrides) and ignored by stepDay: the
 *   composed env series is the single weather truth a step sees.
 */
export type Intervention =
  | { kind: 'irrigate'; date: string; cells?: string[]; zone?: string; mm: number }
  | { kind: 'fertilize'; date: string; cells?: string[]; zone?: string; nKgHa: number }
  | { kind: 'plant'; date: string; cell: string; cropId: number }
  | { kind: 'harvest'; date: string; cell: string }
  | { kind: 'surface'; date: string; surface: PlanSurface } // greenhouse/tent/etc.
  | { kind: 'weather'; fromDate: string; tempDeltaC?: number; precipMultiplier?: number };

export interface CellStress {
  water: number;
  heat: number;
  cold: number;
  /** Real since Phase 3: pool vs remaining seasonal N demand (ecosystem.ts). */
  nitrogen: number;
}

/** Static per-cell neighbor context, built once per run (and on 'plant'
 * interventions) by ecosystem.buildNeighborCache. Chebyshev radius 2 cells:
 * at the default cellM 0.25 the window spans ~1 m ≈ 2× typical 30–45 cm
 * spacings. Counts are one-directional (A's list decides — A liking B does
 * not imply B liking A). */
export interface NeighborContext {
  /** Neighbors whose slug is listed in this crop's `companions`. */
  companions: number;
  /** Neighbors whose slug is listed in this crop's `antagonists`. */
  antagonists: number;
  /** Same-crop neighbors — pest host density (ratio over the 24-cell window). */
  sameCrop: number;
}

/** Living per-cell state. Cells exist only for planted keys (sparse, like
 * PlanState.planting). moistureFrac is the memory: droughts carry over. */
export interface CellState {
  cropId: number;
  /** Run day index at which growth starts (0 = present from the start). Water
   * bucket dynamics still run before this day — the cell is in the ground. */
  plantedAtDay: number;
  /** 0..1 of the AWC bucket capacity — the living memory. */
  moistureFrac: number;
  /** Plant-available N, kg/ha. OM-derived start + daily mineralization −
   * uptake − leaching (ecosystem.ts). */
  nitrogenKgHa: number;
  gddAccumC: number;
  biomassFrac: number; // 0..1 = gddAccum / gddRequired
  stage: number; // 0..5 = round(biomass × 5)
  floweringFrac: number; // 0..1 bump across the stage 3–4 band
  pestPressure: number; // 0..1, daily dynamics in ecosystem.ts
  /** Season-high pestPressure — the yield penalty reads the peak, not today. */
  peakPestPressure?: number;
  /** Day this cell becomes harvestable (biomass crossed 1.0 + grace days);
   * set once, undefined until the crossing. */
  readyAtDay?: number;
  /** Yield already paid for this planting — counts once; the crop stays
   * standing (a twin, not a clearing sim). */
  harvested?: boolean;
  /** Season stress accumulation (Σ daily meanStress and growing-day count)
   * — the harvest yield penalty reads this mean, not the harvest-day
   * snapshot, so season-long nitrogen/water management shows in yield. */
  stressSum?: number;
  stressDaysCount?: number;
  stress: CellStress;
}

export interface SimState {
  dayIndex: number; // days completed; stepDay(state, day d) returns dayIndex d+1
  /** Current run surface (shelter source); mutable mid-run via 'surface'. */
  surface: PlanSurface;
  cells: Record<string, CellState>; // sparse, planted cells only
  /** Neighbor context per cell key — cached (built at createRun, rebuilt on
   * 'plant'); drivers read it, nothing rescans the grid per day. */
  neighbors?: Record<string, NeighborContext>;
  /** Run-wide populations for display wiring (bees/butterflies/pests) —
   * pure derivation from cell state, recomputed each stepDay. */
  creatures: Record<string, number>;
  events: SimEvent[]; // accumulates across stepped days (replay artifact)
}

/** Per-day aggregates folded into RunSummary by simulateRun. Returned
 * additively by stepDay (computed inside its single per-cell pass — no
 * second scan of the grid per day). */
export interface DayStats {
  liveCells: number;
  /** Mean per-cell ET0 × Kc(post-step biomass) across live cells, mm. */
  waterUseMm: number;
  /** Cell-days with max stress ≥ STRESS_ONSET (any term). */
  stressCellDays: number;
  stressDays: { water: number; heat: number; cold: number; nitrogen: number };
  /** Cell-days with pestPressure ≥ PEST_OUTBREAK. */
  outbreakDays: number;
}

export type SimEventKind =
  | 'planted'
  | 'irrigated'
  | 'fertilized'
  | 'harvested'
  | 'stage'
  | 'harvest-ready'
  | 'stress-onset'
  | 'stress-end'
  | 'frost'
  | 'outbreak' // pestPressure crossed 0.6 upward (hysteresis: ends below 0.3)
  | 'outbreak-end'
  | 'harvest-too-early'; // manual harvest below the 0.8 biomass minimum

export interface SimEvent {
  dayIndex: number;
  date: string;
  kind: SimEventKind;
  cell?: string;
  cropId?: number;
  message: string;
  data?: Record<string, number>;
}

export interface RunConfig {
  farmId: number;
  /** Forked at create time (deep copy) — runs never mutate the live plan. */
  basePlan: PlanState;
  /** "YYYY-MM-DD" of dayIndex 0. */
  startDate: string;
  /** Planned sim days. */
  dayCount: number;
  seed: number;
  /** Label/provenance; the effective deltas live in the two fields below. */
  scenario: ScenarioType;
  tempDeltaC: number;
  precipMultiplier: number;
  interventions: Intervention[];
  /** Auto-harvest ripe cells (biomass 1.0 + grace days) and pay their yield.
   * Default true; false leaves harvests to manual interventions. */
  autoHarvest?: boolean;
  /** Climatological mean daily GDD (base 10 °C) over the run window, derived
   * from ERA5 normals — normalizes gddRequired so real weather deviation shows
   * up as schedule delay. Absent → 10 °C·day (≈ a 20 °C mean day). */
  meanDailyGddC?: number;
  /** Farm coords kept for provenance + envSeries re-composition on extension. */
  lat?: number;
  lng?: number;
}

export interface RunSummary {
  daysSimulated: number;
  rainMm: number;
  irrigatedMm: number;
  etoMmTotal: number;
  totalYieldKg: number;
  /** cropId → kg (JSON keys are strings). */
  yieldKgByCrop: Record<string, number>;
  /** Cell-days with max stress ≥ 0.4 (drivers.STRESS_ONSET). */
  stressCellDays: number;
  /** Seasonal crop-water use, mm — Σ over days of the mean per-cell
   * ET0 × Kc(biomass) across live cells (an average cell's season depth). */
  waterUseMm: number;
  /** Cell-days at/above STRESS_ONSET per term (nitrogen included since Phase 3). */
  stressDays: { water: number; heat: number; cold: number; nitrogen: number };
  /** Cell-days with pestPressure ≥ ecosystem.PEST_OUTBREAK (0.6). */
  outbreakDays: number;
  /** Residual plant-available N at run end, mean over live cells, kg/ha. */
  meanNitrogenKgHa: number;
  /** First day any cell reached biomass 1.0. */
  harvestReadyDay: number | null;
  matureCells: number; // cells at biomass ≥ 1.0 at the end (harvest keeps them standing)
  cellCount: number; // cells alive at the end (harvests mark, not remove)
  eventCounts: Record<string, number>;
}

/** What localStorage holds for one run — tiny by design: config + frozen
 * envSeries + summary. Replay (config × envSeries through simulateRun)
 * rebuilds all state in milliseconds; NEVER persist per-tick snapshots. */
export interface RunRecord {
  id: string;
  farmId: number;
  label: string;
  createdAt: string;
  config: RunConfig;
  /** Frozen provenance artifact ⇒ stable replay regardless of later weather. */
  envSeries: DailyEnvironment[];
  summary: RunSummary;
  status: 'running' | 'complete';
}

/** Body for Api.createSimRun. The plan is resolved from the store server-side
 * (localApi) / by the backend (rest) — callers never ship a PlanState. */
export interface CreateSimRunInput {
  farmId: number;
  label?: string;
  /** "YYYY-MM-DD"; default = today (UTC). */
  startDate?: string;
  /** Default 90, clamped 1..365. */
  dayCount?: number;
  /** Default 'baseline'; sets tempDeltaC/precipMultiplier from its preset. */
  scenario?: ScenarioType;
  /** Explicit deltas win over the scenario preset when provided. */
  tempDeltaC?: number;
  precipMultiplier?: number;
  seed?: number; // default 1
  interventions?: Intervention[];
}
