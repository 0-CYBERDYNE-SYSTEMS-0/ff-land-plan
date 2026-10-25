// Shared domain types for FarmFriend.
// Names match the API contract used by the original backend so a real server
// can drop in behind the in-memory mock with no client changes.

export type SoilType = 'loam' | 'clay' | 'sandy' | 'silt' | 'peat' | 'chalky';

export interface Farm {
  id: number;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  areHa: number;
  soilType: SoilType | null;
  createdAt: string;
  elevationM?: number | null;
  // "MM-DD", user-overridable; defaulted from the latitude heuristic in lib/frost.ts.
  // null = frost-free climate (|lat| < 10).
  lastFrost?: string | null;
  firstFrost?: string | null;
}

export interface WeatherCurrent {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windSpeedKmh: number;
  precipMm: number;
  uvIndex: number;
  cloudCover: number;
  soilTempC: number;
  soilMoisture: number;
  weatherCode: number;
  weatherDesc: string;
}

export interface Weather {
  current: WeatherCurrent;
  cached: boolean;
  timestamp: string;
}

export interface WeatherHistoryPoint {
  tempC: number;
  humidity: number;
  soilMoisture: number;
}

export interface ForecastDay {
  date: string;
  maxTempC: number;
  minTempC: number;
  precipMm: number;
  weatherCode: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType = 'frost' | 'heat' | 'drought' | 'flood' | 'pest' | 'nutrient';

export interface Alert {
  id: number;
  farmId: number;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type SensorType = 'soil_moisture' | 'temperature' | 'humidity' | 'ndvi_proxy' | 'rainfall';

export interface Sensor {
  id: number;
  farmId: number;
  name: string;
  sensorType: SensorType;
  environmentId?: string;
  isActive: boolean;
  lastValue: number | null;
  lastUnit: string | null;
  lastReadingAt: string | null;
}

export interface SensorReading {
  id: number;
  sensorId: number;
  value: number;
  recordedAt: string;
}

export type ObservationMetric =
  | 'airTempC' | 'rhPct' | 'vpdKPa' | 'co2Ppm' | 'dliMol'
  | 'soilMoistureFrac' | 'soilTempC' | 'yieldKg' | 'stage';

export interface Observation {
  id: string;
  farmId: number;
  environmentId?: string;
  growingSpaceId?: string;
  levelId?: string;
  metric: ObservationMetric;
  value: number;
  unit: string;
  date: string;
  at?: string;
  source: 'manual' | 'csv' | 'sensor' | 'lab' | 'photo';
  quality?: 'ok' | 'suspect';
}

export type ObservationInput = Omit<Observation, 'id'>;
export type ObservationPatch = Partial<Omit<ObservationInput, 'farmId' | 'environmentId' | 'growingSpaceId' | 'levelId'>> & {
  environmentId?: string | null;
  growingSpaceId?: string | null;
  levelId?: string | null;
};

export interface FarmCell {
  id: number;
  farmId: number;
  x: number;
  y: number;
  z: number;
  cropId: number | null;
  soilMoisture: number;
  nitrogenLevel: number;
}

export interface NdviCell {
  x: number;
  y: number;
  ndvi: number;
}

export interface NdviEstimate {
  farmId: number;
  ndviGrid: NdviCell[];
  timestamp: string;
}

export type ScenarioType =
  | 'baseline'
  | 'drought'
  | 'heat_stress'
  | 'optimal'
  | 'climate_change';

export type SimulationStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface SimulationResults {
  yieldTonHa: number;
  waterUseMm: number;
  carbonKgHa: number;
  profitUsdHa: number;
  stressScore: number;
  summary: string;
}

export interface Simulation {
  id: number;
  farmId: number;
  name: string;
  scenarioType: ScenarioType;
  durationDays: number;
  tempDeltaC: number;
  precipMultiplier: number;
  fertilizerBoost: number;
  status: SimulationStatus;
  results: string | null;
  createdAt: string;
}

export type CropCategory = 'vegetable' | 'grain' | 'fruit' | 'herb' | 'cover_crop' | 'flower' | 'fungus';

export type FrostTolerance = 'tender' | 'half-hardy' | 'hardy';

export interface Crop {
  id: number;
  name: string;
  scientificName: string | null;
  category: CropCategory;
  growthDays: number;
  waterNeedMmDay: number;
  nitrogenNeed: 'low' | 'medium' | 'high';
  sunRequirement: 'full' | 'partial' | 'shade';
  minTempC: number;
  maxTempC: number;
  yieldTonHa: number;
  colorHex: string;
  description: string | null;
  isCustom: boolean;
  // Agronomy fields (optional so legacy/custom crops stay valid; helpers in
  // lib/plan.ts fall back to defaults when absent).
  slug?: string;
  family?: string;
  spacingCm?: number;
  rowSpacingCm?: number;
  sowDepthCm?: number;
  frostTolerance?: FrostTolerance;
  // Calendar offsets in weeks relative to the farm's last spring frost.
  sowIndoorsWeeksBeforeLastFrost?: number | null;
  transplantWeeksAfterLastFrost?: number | null;
  directSowStartWeeks?: number | null;
  directSowEndWeeks?: number | null;
  harvestWindowDays?: number;
  yieldKgPerPlant?: number;
  companions?: string[]; // crop slugs
  antagonists?: string[]; // crop slugs
  emoji?: string;
}

// --- Plot plan (sparse, replaces FarmCell for the designer) -----------------

export type AssetCategory = 'growing' | 'equipment' | 'infrastructure' | 'life';
export type AssetPattern = 'solid' | 'stripes' | 'dots' | 'cross';

/**
 * Simulation surface of a plan canvas. Enclosed surfaces swap the 3D floor +
 * add an enclosure shell, gate weather, and dampen climate stress in the
 * growth model (see lib/growth.ts). Missing/undefined = 'outdoor'.
 * `hoophouse` = passive unheated poly high tunnel (tracks outdoor nights),
 * `warehouse` = sealed weather-blind vertical-farm hall.
 */
export type PlanSurface = 'outdoor' | 'greenhouse' | 'hoophouse' | 'tent' | 'indoor' | 'warehouse';

export type ArchetypeId =
  | 'open-field'
  | 'garden-beds'
  | 'greenhouse-glass'
  | 'hoophouse'
  | 'cold-frame'
  | 'grow-tent'
  | 'grow-room'
  | 'warehouse-vertical'
  | 'container-farm';
export type EnvKind = 'open' | 'protected' | 'sealed';
export type PlanningProfileId =
  | 'field'
  | 'garden'
  | 'glasshouse'
  | 'tunnel'
  | 'cold-frame'
  | 'compact-enclosed'
  | 'grow-room'
  | 'vertical'
  | 'container';
export type GrowingSystem = 'soil-beds' | 'containers' | 'hydro' | 'racks';
export type SiteEdge = 'north' | 'east' | 'south' | 'west';

export interface PlanningProfile {
  id: PlanningProfileId;
  label: string;
  supportedSystems: GrowingSystem[];
  allowOutsideBeds: boolean;
  compatibleTemplates: string[];
  accessDefaults: { edge: SiteEdge; offsetM: number; widthM: number }[];
  reservationDefaults: {
    id: string;
    kind: 'aisle' | 'service';
    x: number;
    y: number;
    widthM: number;
    depthM: number;
    edge?: SiteEdge;
    offsetM?: number;
  }[];
  warningRules: string[];
  tierPlanningAvailable: boolean;
}

export interface EnvironmentArchetype {
  id: ArchetypeId;
  label: string;
  purpose: string;
  previewAssetId: string;
  kind: EnvKind;
  defaultFootprint: { wM: number; hM: number };
  defaultUsableHeightM?: number;
  coverTransmission: number;
  uValueWm2K: number;
  achInfiltration: number;
  achVented: number;
  volumePerM2: number;
  thermalMassKJm2K: number;
  etFactor: number;
  plantScale: number;
  maxDliMol: number;
  rainEnters: boolean;
  dliMode: 'natural' | 'natural+supplement' | 'supplement-only';
  floorTile: string | null;
  shell: 'none' | 'greenhouse' | 'hoophouse' | 'cold-frame' | 'tent' | 'room' | 'warehouse' | 'container';
  bg: { dark: string; light: string };
  planningProfile: PlanningProfileId;
  palette: AssetCategory[];
  tierPlanningAvailable: boolean;
  setpoints?: { heatC?: number; coolC?: number; rhMaxPct?: number; photoperiodH?: number };
}

export interface EnvironmentAccess {
  id: string;
  edge: SiteEdge;
  offsetM: number;
  widthM: number;
}

export interface EnvironmentReservation {
  id: string;
  kind: 'aisle' | 'service';
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  edge?: SiteEdge;
  offsetM?: number;
}

export interface GrowingSpaceLevel {
  id: string;
  label: string;
  elevationM: number;
  clearanceM?: number;
  /** @deprecated Read-only migration input; normalized plans store crops in PlanState.targets. */
  planting?: Record<string, number>;
  /** @deprecated Read-only migration input; normalized plans store dates in PlanState.targets. */
  plantedAt?: Record<string, string>;
}

export interface GrowingSpace {
  id: string;
  label: string;
  kind: 'bed' | 'bench' | 'rack' | 'hydro';
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  levels: GrowingSpaceLevel[];
}

export interface EnvironmentLayout {
  usableHeightM?: number;
  access: EnvironmentAccess[];
  reservations: EnvironmentReservation[];
  growingSpaces: GrowingSpace[];
}

export type GrowingTargetRef =
  | { kind: 'floor' }
  | { kind: 'growing-level'; growingSpaceId: string; levelId: string };

/** Stable, encoded key for a non-floor crop target. */
export type GrowingTargetKey = string;

export interface GrowingTargetPlan {
  growingSpaceId: string;
  levelId: string;
  /** Environment-local cell keys (`x,y`), restricted to the parent space. */
  planting: Record<string, number>;
  plantedAt?: Record<string, string>;
}

export type EnvironmentAssetMount =
  | { kind: 'floor' }
  | { kind: 'environment' }
  | { kind: 'growing-level'; growingSpaceId: string; levelId: string };

export interface EnvironmentAssetInstance {
  id: string;
  slug: string;
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  mount: EnvironmentAssetMount;
}

export interface Environment {
  id: string;
  farmId: number;
  archetype: ArchetypeId;
  label: string;
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  /** Canonical grid resolution; nested plan dimensions mirror this record. */
  cellM: number;
  plan: PlanState;
  layout?: EnvironmentLayout;
  instances?: EnvironmentAssetInstance[];
  setpoints?: { heatC?: number; coolC?: number; rhMaxPct?: number; co2Ppm?: number; photoperiodH?: number };
}

export type EnvironmentSnapshot = Omit<Environment, 'plan'>;

export interface CreateEnvironmentInput {
  archetype: ArchetypeId;
  label?: string;
  x?: number;
  y?: number;
  widthM?: number;
  heightM?: number;
  usableHeightM?: number;
  cellM?: number;
  layout?: EnvironmentLayout;
}

export interface SitePlan {
  farmId: number;
  widthM: number;
  heightM: number;
  cellM: number;
  environments: Environment[];
  updatedAt: string;
}

export interface SoilCarry {
  organicMatterPct: number;
  nPoolKgHa: number;
  ph?: number;
  inoculum: Record<string, number>;
}

export interface SeasonHarvest {
  date: string;
  cropId: number;
  kg: number;
  cell: string;
  family: string;
  /** Absent only for legacy/outdoor records that had no growing-world id. */
  environmentId?: string;
  /** Legacy cell-only harvests resolve to the floor target when loaded. */
  target: GrowingTargetRef;
}

export interface SeasonSoilCarry {
  environmentId: string;
  target: GrowingTargetRef;
  soilIn: SoilCarry;
  soilOut: SoilCarry;
}

export interface SeasonRecord {
  id: string;
  farmId: number;
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  environmentIds: string[];
  runIds: string[];
  /** One carry per soil-growing surface; hydro targets never inherit soil carry. */
  soil: SeasonSoilCarry[];
  /** Legacy adapter for records written before carry was target-scoped. */
  soilIn?: SoilCarry;
  soilOut?: SoilCarry;
  harvests: SeasonHarvest[];
  updatedAt: string;
}

export interface GardenAsset {
  slug: string;
  label: string;
  category: AssetCategory;
  defaultWM: number;
  defaultHM: number;
  colorHex: string;
  pattern: AssetPattern;
  emoji: string;
  plantable: boolean;
  /** Optional documented physical contribution; absent means zero contribution. */
  physics?: AssetPhysics;
  description: string;
  /** Surfaces this asset is offered on. Omitted = available everywhere. */
  surfaces?: PlanSurface[];
}

export type AssetPhysics =
  | { kind: 'light'; watts: number; efficacyUmolJ: number; photoperiodH?: number; footprintM2: number }
  | { kind: 'fan'; achBoost: number; mixing: number }
  | { kind: 'hvac'; heatingKw: number; coolingKw: number; electricalKw: number }
  | { kind: 'dehumidifier'; litresPerDay: number; derateBelowRh: number }
  | { kind: 'co2'; targetPpm: number; kgPerDay: number }
  | { kind: 'rack'; tiers: number }
  | { kind: 'soilless'; reservoirL: number }
  | { kind: 'water-store'; litres: number }
  | { kind: 'nursery' };

export interface PlanState {
  farmId: number;
  widthM: number;
  heightM: number;
  cellM: number;
  allowOutsideBeds: boolean;
  /** Simulation surface (canvas zone). Missing = 'outdoor'. */
  surface?: PlanSurface;
  planting: Record<string, number>; // "x,y" -> cropId
  /** Per-level crop maps; floor planting remains in `planting` for legacy replay compatibility. */
  targets?: Record<GrowingTargetKey, GrowingTargetPlan>;
  ground: Record<string, string>; // "x,y" -> asset slug
  updatedAt: string;
  // Optional: when each cell was planted (ISO date). Fallback: derive from calendar.
  plantedAt?: Record<string, string>;
}
