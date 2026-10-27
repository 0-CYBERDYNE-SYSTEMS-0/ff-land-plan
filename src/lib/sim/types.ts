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

import type { ArchetypeId, Crop, CropStartEvent, EnvironmentSnapshot, GrowingTargetKey, GrowingTargetRef, Observation, ObservationMetric, PlanState, PlanSurface, ScenarioType, SoilCarry } from '@/types';
import type { EnvironmentClimateDay } from './environment-climate';
import type { ClimateEquipmentInput } from './environment-climate';
import type { EquipmentTerms } from './equipment';

export interface RunAssetPhysicsSnapshot {
  model: 'assets-v1';
  room: EquipmentTerms;
  targets: Partial<Record<GrowingTargetKey, EquipmentTerms>>;
  /** Local cells physically covered by a hydro asset at run creation. */
  soillessCells: Partial<Record<GrowingTargetKey, string[]>>;
  /** Cells on a hydro-designed level that require installed hydro coverage. */
  hydroRequiredCells: Partial<Record<GrowingTargetKey, string[]>>;
}

export type CropModelVersion = 'crop-model-v1' | 'crop-model-v2' | 'crop-model-v3';

/** Minimum crop/soil inputs frozen by the legacy reducer. */
export interface RunModelInputsV1 {
  model: 'run-inputs-v1';
  soil: { awcMmPerCm: number | null; organicMatterPct: number | null } | null;
  /** Only crops referenced by the frozen plan or its planting interventions. */
  crops: Crop[];
}

export interface FrozenCropModelParametersV2 {
  cropId: number;
  /** Source-specific thermal reference; cultivar selection may still be required. */
  thermal: {
    tBaseC: number;
    tUpperC?: number;
    gddToMaturityCdays: readonly [number, number];
    startEvents: readonly CropStartEvent[];
    accumulationStart: string;
    maturityEndpoint: string;
    accumulationMethod: string;
    sourceCitation: string;
    sourceUrl: string;
  } | null;
  production: {
    equationFamily: 'LINTUL-net-RUE';
    rueGPerMjInterceptedPar: number | null;
    /** Frozen initial above-ground dry matter; zero is an explicit assumption. */
    initialDryMatterGPerM2: number | null;
    interceptedParFraction: number | null;
    harvestIndex: number | null;
    status: 'unsupported' | 'qualified' | 'supported';
    missing: string[];
    /** Explicit domain/measurement assumptions; these qualify, but do not prevent replay. */
    limitations?: string[];
    evidence: { evidenceId: string | null; sourceCitation: string | null; sourceUrl: string | null; validDomain: string | null };
  };
  rootZone: {
    method: 'FAO-56';
    /** Maximum effective depth for static profiles; cap for rootDevelopment profiles. */
    effectiveRootDepthCm: number | null;
    depletionFraction: number | null;
    cropCoefficient: number | null;
    initialStorageFraction: number | null;
    /** Optional versioned root-depth trajectory; absent on historical static v2 inputs. */
    rootDevelopment?: {
      methodVersion: 'thermal-linear-root-depth-v1';
      storageExpansionMethod: 'uniform-initial-awc-fraction-v1';
      startEvent: CropStartEvent;
      initialRootDepthCm: number;
      growthStartsAfterCdays: number;
      growthMmPerCday: number;
      thermalBaseC: number;
      thermalUpperC?: number;
      thermalAccumulationMethod: string;
      evidence: { evidenceId: string; sourceCitation: string; sourceUrl: string; validDomain: string };
    };
    /** Explicit assumptions are retained and surfaced when replayed. */
    limitations?: string[];
    status: 'unsupported' | 'qualified' | 'supported';
    missing: string[];
    evidence: { evidenceId: string | null; sourceCitation: string | null; sourceUrl: string | null; validDomain: string | null };
  };
  lifecycle: 'plant' | 'fungus' | 'unsupported';
}

/** V3 keeps crop-level production parameters separate from the per-cell
 * establishment state; initial above-ground DM is supplied for each cell. */
export type FrozenCropModelParametersV3 = Omit<FrozenCropModelParametersV2, 'production'> & {
  production: Omit<FrozenCropModelParametersV2['production'], 'initialDryMatterGPerM2'>;
};

export interface CropEstablishmentInput {
  startEvent: CropStartEvent;
  /** Emergence date for direct-sowing; transplant date for transplanting. */
  establishedAtDate: string;
  initialAboveGroundDryMatterGPerM2: number;
  evidence: {
    classification: 'measured' | 'explicit-assumption' | 'synthetic';
    evidenceId: string;
    validDomain: string;
  };
}

/** Complete v2 snapshot shape, including explicit missing-parameter status. */
export interface RunModelInputsV2 {
  model: 'run-inputs-v2';
  parameterSetVersion: 'crop-parameters-v3';
  soil: { awcMmPerCm: number | null; organicMatterPct: number | null; source?: 'usda-sda' | 'soilgrids' | 'unknown' } | null;
  crops: Crop[];
  cropParameters: FrozenCropModelParametersV2[];
  qualification: { status: 'supported' | 'qualified' | 'unsupported'; reasons: string[] };
}

/** V3 freezes per-cell post-emergence state and uses a separate establishment
 * event date; older v2 inputs retain their historical sowing-day behavior. */
export interface RunModelInputsV3 {
  model: 'run-inputs-v3';
  parameterSetVersion: 'crop-parameters-v4';
  soil: RunModelInputsV2['soil'];
  crops: Crop[];
  cropParameters: FrozenCropModelParametersV3[];
  establishmentByCell: Record<string, CropEstablishmentInput>;
  qualification: { status: 'supported' | 'qualified' | 'unsupported'; reasons: string[] };
}

export type RunModelInputs = RunModelInputsV1 | RunModelInputsV2 | RunModelInputsV3;

export interface FarmCalibration {
  version: 'farm-calibration-v1';
  revision: number;
  farmId: number;
  environmentId: string;
  fittedAt: string;
  pairedDays: number;
  parameters: Partial<{ coverTransmission: number; uValueWm2K: number }>;
}

export interface EnsembleBand {
  p10: number | null;
  p50: number | null;
  p90: number | null;
  samples: number;
}

export interface RunEnsembleResult {
  source: 'era5' | 'nasa-power';
  years: number[];
  /** Explicit model/input caveats shown beside the percentile bands. */
  limitations?: string[];
  totalYieldKg: EnsembleBand;
  harvestReadyDay: EnsembleBand;
  waterUseMm: EnsembleBand;
}

/** Provenance chip for one environment value. */
export type EnvSourceTag =
  | 'open-meteo-archive' // observed ERA5 daily value (Open-Meteo archive API)
  | 'nasa-power' // daily temperature/precipitation from NASA POWER
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
  /** Outdoor monthly-mean DLI input, frozen when light data is available. */
  dliNaturalMol?: number;
  /** max(0, (tMin + tMax)/2 − 10), °C·day — computed from EFFECTIVE temps so
   * climate scenarios actually move the GDD clock. */
  gddBase10C: number;
  provenance: {
    tMinC: EnvSourceTag;
    tMaxC: EnvSourceTag;
    precipMm: EnvSourceTag;
    etoMm: EnvSourceTag;
    dliNaturalMol?: EnvSourceTag;
  };
  /** Derived interior values attached only to the current effective day. */
  climate?: EnvironmentClimateDay;
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
  | { kind: 'irrigate'; date: string; cells?: string[]; target?: GrowingTargetRef; allTargets?: boolean; zone?: string; mm: number }
  | { kind: 'fertilize'; date: string; cells?: string[]; target?: GrowingTargetRef; allTargets?: boolean; zone?: string; nKgHa: number }
  | { kind: 'refill-water'; date: string; litres: number }
  | { kind: 'plant'; date: string; cell: string; target?: GrowingTargetRef; cropId: number; startEvent?: CropStartEvent; establishment?: CropEstablishmentInput }
  | { kind: 'harvest'; date: string; cell: string; target?: GrowingTargetRef }
  | { kind: 'surface'; date: string; surface: PlanSurface } // greenhouse/tent/etc.
  | { kind: 'weather'; fromDate: string; tempDeltaC?: number; precipMultiplier?: number };

export interface CellStress {
  water: number;
  heat: number;
  cold: number;
  /** Real since Phase 3: pool vs remaining seasonal N demand (ecosystem.ts). */
  nitrogen: number;
  light?: number;
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
  /** V1/v2 development clock; in v3 this is establishment-relative physiology, not source maturity time. */
  gddAccumC: number;
  biomassFrac: number; // v1/v2 thermal progress; v3 source-maturity endpoint latch, not mass fraction
  /** v2/v3 above-ground dry matter, g DM/m² of planted cell area. */
  dryMatterGPerM2?: number;
  /** v2 FAO-56 effective root-zone storage and accumulated closure residual, mm. */
  rootZoneWaterMm?: number;
  /** Frozen establishment event whose date is represented by plantedAtDay. */
  startEvent?: CropStartEvent;
  /** V3 day at which the emerged/transplanted above-ground state activates. */
  physiologyStartDay?: number;
  /** V3 initial above-ground DM applied once at physiologyStartDay. */
  establishmentDryMatterGPerM2?: number;
  /** V3 latch prevents the initial state from being applied twice. */
  establishmentApplied?: boolean;
  /** V3 source-event thermal clock; starts at sowing/transplant per frozen thermal evidence. */
  sourceThermalCdays?: number;
  /** V3 has no source-supported stage map; remains false even when maturity is known. */
  stageEstimateAvailable?: boolean;
  /** V3 terminal crop mortality; v1/v2 visual mortality remains projected. */
  dead?: boolean;
  /** v2 root-growth thermal clock and effective rooting depth. */
  rootThermalCdays?: number;
  rootZoneDepthCm?: number;
  /** Cumulative storage entering as newly rooted subsoil is added to the bucket, mm. */
  rootZoneExpansionInflowMm?: number;
  rootZoneResidualAccumulatedMm?: number;
  rootZoneResidualMaxAbsMm?: number;
  /** v2 water removed when a replant shrinks effective root-zone capacity, mm. */
  rootZoneReplantDrainageMm?: number;
  stage: number; // v1/v2: 0..5 from progress; v3: endpoint-only without sourced intermediate mapping
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
  /** Omitted only for historic floor cells; elevated cells keep their target. */
  target?: GrowingTargetRef;
  stress: CellStress;
}

export interface SimState {
  dayIndex: number; // days completed; stepDay(state, day d) returns dayIndex d+1
  /** Current archetype; 'surface' is the one-release legacy climate adapter. */
  archetype: ArchetypeId;
  surface: PlanSurface;
  /** Current deterministic interior estimate; absent for legacy/outdoor runs. */
  climate?: EnvironmentClimateDay;
  /** Remaining shared physical water storage, present for ASSET_PHYSICS runs. */
  waterStoreL?: number;
  cells: Record<string, CellState>; // sparse, planted cells only
  /** Runtime qualifications from explicitly unknown daily model inputs. */
  modelQualificationReasons?: string[];
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
  stressDays: { water: number; heat: number; cold: number; nitrogen: number; light?: number };
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
  | 'assimilated'
  | 'harvest-too-early' // manual harvest below the 0.8 biomass minimum
  | 'water-short'
  | 'water-refilled';

export interface SimEventDataByKind {
  planted: {};
  irrigated: { mmPerCell: number; cellCount: number; totalMm: number };
  fertilized: { nKgHa: number; cellCount: number };
  'water-refilled': { requestedL: number; acceptedL: number; remainingL: number };
  'water-short': {
    requestedL?: number;
    acceptedL?: number;
    remainingL?: number;
    capacityL?: number;
    requestedMm?: number;
    unmetCells?: number;
    cellCount?: number;
    deliveredMm?: number;
  };
  stage: { stage: number; biomass: number };
  'harvest-ready': { biomass?: number; gddAccumC?: number };
  'stress-onset': { value: number };
  'stress-end': { value: number };
  frost: { tMinC: number };
  outbreak: { pressure: number };
  'outbreak-end': { pressure: number };
  assimilated: { metric: ObservationMetric; innovation: number };
  harvested: { yieldKg: number; seasonMeanStress?: number; peakPest?: number };
  'harvest-too-early': { biomass: number; minimum: number };
}

interface SimEventBase {
  dayIndex: number;
  date: string;
  cell?: string;
  /** Omitted only for historic floor events; elevated cell keys are also qualified. */
  target?: GrowingTargetRef;
  cropId?: number;
  message: string;
}

interface SimEventDataFields {
  metric: ObservationMetric;
  innovation: number;
  yieldKg: number;
  seasonMeanStress: number;
  peakPest: number;
  biomass: number;
  gddAccumC: number;
  stage: number;
  value: number;
  minimum: number;
  tMinC: number;
  pressure: number;
  mmPerCell: number;
  cellCount: number;
  totalMm: number;
  requestedL: number;
  acceptedL: number;
  remainingL: number;
  capacityL: number;
  requestedMm: number;
  unmetCells: number;
  deliveredMm: number;
  nKgHa: number;
}

type SimEventDataFor<K extends SimEventKind> = SimEventDataByKind[K] & {
  [P in Exclude<keyof SimEventDataFields, keyof SimEventDataByKind[K]>]?: never;
};

export type SimEvent = {
  [K in SimEventKind]: SimEventBase & { kind: K } & (
    K extends 'assimilated'
      ? { data: SimEventDataFor<K> }
      : K extends 'planted'
        ? { data?: SimEventDataFor<K> }
        : { data: SimEventDataFor<K> }
  )
}[SimEventKind];

export interface RunConfig {
  farmId: number;
  /** Missing on historical records, which retain the v1 equations. */
  cropModelVersion?: CropModelVersion;
  /** Forked at create time (deep copy) — runs never mutate the live plan. */
  basePlan: PlanState;
  /** Frozen world metadata/layout. Absent only on historical v1 RunRecords;
   * basePlan is the sole plan snapshot and is never duplicated here. */
  environment?: EnvironmentSnapshot;
  /** Missing means the pre-environment legacy surface model. */
  climateModel?: 'environment-v1';
  /** User-approved, per-world model calibration frozen for deterministic replay. */
  calibration?: FarmCalibration;
  /** Frozen placed-asset contributions used by replay; absent means legacy semantics. */
  assetPhysics?: RunAssetPhysicsSnapshot;
  /** New records freeze model-driving soil values and the crops they use; absent on legacy runs. */
  modelInputs?: RunModelInputs;
  /** v2 event keyed by canonical targetCellKey; basePlan.plantedAt supplies its date. */
  cropStartEvents?: Record<string, CropStartEvent>;
  /** Frozen equipment contribution used by the climate solver during replay. */
  climateEquipment?: ClimateEquipmentInput;
  /** Frozen light/air terms per growing target; keys use growingTargetKey(). */
  climateTargetEquipment?: Partial<Record<GrowingTargetKey, ClimateEquipmentInput>>;
  /** Campaign carry copied into this run; only soil-growing targets are read. */
  soilCarryByTarget?: Partial<Record<GrowingTargetKey, SoilCarry>>;
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
  /** v1 catalog yields are fresh-mass estimates; v2/v3 harvest-index output is dry mass. */
  yieldBasis?: 'fresh-matter' | 'dry-matter';
  /** cropId → kg (JSON keys are strings). */
  yieldKgByCrop: Record<string, number>;
  /** Cell-days with max stress ≥ 0.4 (drivers.STRESS_ONSET). */
  stressCellDays: number;
  /** Seasonal crop-water use, mm — Σ over days of the mean per-cell
   * ET0 × Kc(biomass) across live cells (an average cell's season depth). */
  waterUseMm: number;
  /** Cell-days at/above STRESS_ONSET per term (nitrogen included since Phase 3). */
  stressDays: { water: number; heat: number; cold: number; nitrogen: number; light?: number };
  /** Cell-days with pestPressure ≥ ecosystem.PEST_OUTBREAK (0.6). */
  outbreakDays: number;
  /** Residual plant-available N at run end, mean over live cells, kg/ha. */
  meanNitrogenKgHa: number;
  /** First day any cell reached biomass 1.0. */
  harvestReadyDay: number | null;
  matureCells: number; // cells at biomass ≥ 1.0 at the end (harvest keeps them standing)
  cellCount: number; // cells alive at the end (harvests mark, not remove)
  eventCounts: Record<string, number>;
  /** Missing on historical summaries; explicit on newly generated v2 records. */
  modelQualification?: { status: 'supported' | 'qualified' | 'unsupported'; reasons: string[] };
  /** v2 unrounded per-cell FAO-56 closure totals across the run. */
  rootZoneBalanceResidualAccumulatedMm?: number;
  rootZoneBalanceResidualMaxAbsMm?: number;
  /** v2 water counted as drainage when replanting shrinks root-zone capacity, mm. */
  rootZoneReplantDrainageMm?: number;
  /** v2 water brought into the moving root-zone control volume, mm. */
  rootZoneExpansionInflowMm?: number;
}

/** Persist run inputs (config, frozen envSeries, optional observations) + summary.
 * Replay rebuilds all state in milliseconds; NEVER persist per-tick snapshots. */
export interface RunRecord {
  id: string;
  farmId: number;
  /** Parent record for a saved counterfactual fork. */
  parentId?: string;
  /** Number of completed days at the fork boundary. */
  forkedAtDay?: number;
  label: string;
  createdAt: string;
  config: RunConfig;
  /** Frozen provenance artifact ⇒ stable replay regardless of later weather. */
  envSeries: DailyEnvironment[];
  /** Frozen measured inputs used by deterministic twin replay. */
  observations?: Observation[];
  summary: RunSummary;
  /** Small historical uncertainty result; never stores per-year states. */
  ensembleCache?: { key: string; configKey?: string; result: RunEnsembleResult };
  status: 'running' | 'complete';
}

/** Body for Api.createSimRun. The plan is resolved from the store server-side
 * (localApi) / by the backend (rest) — callers never ship a PlanState. */
export interface CreateSimRunInput {
  farmId: number;
  /** New callers name the environment. Omission is a legacy one-world adapter. */
  environmentId?: string;
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
  /** Explicit, target-scoped campaign input. Omission retains ordinary soil defaults. */
  soilCarryByTarget?: Partial<Record<GrowingTargetKey, SoilCarry>>;
}
