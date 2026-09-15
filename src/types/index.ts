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
  description: string;
  /** Surfaces this asset is offered on. Omitted = available everywhere. */
  surfaces?: PlanSurface[];
}

export interface PlanState {
  farmId: number;
  widthM: number;
  heightM: number;
  cellM: number;
  allowOutsideBeds: boolean;
  /** Simulation surface (canvas zone). Missing = 'outdoor'. */
  surface?: PlanSurface;
  planting: Record<string, number>; // "x,y" -> cropId
  ground: Record<string, string>; // "x,y" -> asset slug
  updatedAt: string;
  // Optional: when each cell was planted (ISO date). Fallback: derive from calendar.
  plantedAt?: Record<string, string>;
}
