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
  nitrogen: number; // always 0 in Phase 1 — N dynamics land in Phase 3
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
  /** Initialized in Phase 1 (soil OM heuristic); uptake/mineralization Phase 3. */
  nitrogenKgHa: number;
  gddAccumC: number;
  biomassFrac: number; // 0..1 = gddAccum / gddRequired
  stage: number; // 0..5 = round(biomass × 5)
  floweringFrac: number; // 0..1 bump across the stage 3–4 band
  pestPressure: number; // field only in Phase 1 — dynamics land in Phase 3
  stress: CellStress;
}

export interface SimState {
  dayIndex: number; // days completed; stepDay(state, day d) returns dayIndex d+1
  /** Current run surface (shelter source); mutable mid-run via 'surface'. */
  surface: PlanSurface;
  cells: Record<string, CellState>; // sparse, planted cells only
  creatures: Record<string, number>; // populations arrive in Phase 3 — empty for now
  events: SimEvent[]; // accumulates across stepped days (replay artifact)
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
  | 'frost';

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
  /** First day any cell reached biomass 1.0. */
  harvestReadyDay: number | null;
  matureCells: number; // cells at biomass ≥ 1.0 at the end
  cellCount: number; // cells alive at the end (harvests remove theirs)
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
