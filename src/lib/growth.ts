// Growth model shared by the 3D plant renderer and the World3D simulation HUD.
// Deterministic, catalog-driven, scenario-aware.
import type { Crop, PlanSurface, ScenarioType } from '@/types';

export interface ScenarioParams {
  label: string;
  tempDeltaC: number;
  precipMultiplier: number;
  fertilizerBoost: number;
}

// Mirrors the preset table on the Simulations page so the two surfaces agree.
export const SCENARIOS: Record<ScenarioType, ScenarioParams> = {
  baseline: { label: 'Current Conditions', tempDeltaC: 0, precipMultiplier: 1, fertilizerBoost: 0 },
  drought: { label: 'Drought Stress', tempDeltaC: 2, precipMultiplier: 0.5, fertilizerBoost: 0 },
  heat_stress: { label: 'Heat Stress', tempDeltaC: 3, precipMultiplier: 0.9, fertilizerBoost: 0 },
  optimal: { label: 'Optimal Input', tempDeltaC: 0, precipMultiplier: 1.2, fertilizerBoost: 2 },
  climate_change: { label: 'Climate +2°C', tempDeltaC: 2, precipMultiplier: 0.8, fertilizerBoost: 0 },
};

/** Default baseline growing-season temperature (°C) the scenario deltas apply
 * against when no farm-specific climate context is provided (offline / no
 * climate data yet). */
export const DEFAULT_BASELINE_TEMP_C = 20;

/** Optional real-climate inputs for the growth model. `ambientTempC` is the
 * live right-now temperature (a 34 °C heatwave should stress cool-season
 * crops today); `baselineTempC` is the seasonal mean (climate normals).
 * Ambient wins when both are present. Both are optional so callers degrade
 * gracefully offline. */
export interface GrowthModCtx {
  baselineTempC?: number;
  ambientTempC?: number;
}

export interface GrowthMod {
  /** Multiplier on growth rate (1 = catalog growthDays). <1 = slower/smaller. */
  rate: number;
  /** 0..1 visual stress (drives stunting + the brown/yellow tint). */
  stress: number;
}

/**
 * How much of the outdoor climate scenario reaches the crop on each surface.
 * A tent with HVAC shrugs off drought/heat; a greenhouse moderates it; the
 * open field takes the full scenario. This is the digital-twin payoff of
 * enclosed canvases: identical plans, radically different stress outcomes.
 */
export const SURFACE_SHELTER: Record<PlanSurface, number> = {
  outdoor: 1,
  greenhouse: 0.35,
  // Passive film tunnel: blocks wind/rain and traps day solar, but nights
  // track the outdoors (between the open field and a heated greenhouse).
  hoophouse: 0.55,
  tent: 0.12,
  indoor: 0.15,
  // Sealed LED hall is weather-blind.
  warehouse: 0.06,
};

/**
 * Max plant height multiplier per surface: a 1.5 m tent cannot hold a 2.6 m
 * tomato, so plants on enclosed surfaces are capped to a size the enclosure
 * could actually contain.
 */
export const SURFACE_PLANT_SCALE: Record<PlanSurface, number> = {
  outdoor: 1,
  greenhouse: 0.7,
  // Full-size vine crops are the hoophouse norm.
  hoophouse: 0.85,
  tent: 0.45,
  indoor: 0.6,
  // Warehouse greens live on 45-60 cm tier pitch — small plants.
  warehouse: 0.35,
};

/**
 * How a scenario modulates one crop's growth, from its real temp/water
 * tolerance. Heat/cold stress when the effective temp leaves
 * [minTempC, maxTempC]; water stress when precipitation is cut and the crop
 * is thirsty. Enclosed surfaces attenuate the scenario by SURFACE_SHELTER.
 *
 * The effective base temperature comes from the optional `ctx`: the live
 * `ambientTempC` when connected (right-now weather stress), else the
 * seasonal `baselineTempC`, else the legacy 20 °C constant — so an
 * undefined ctx is byte-identical to the pre-climate behavior and offline
 * callers never crash. Like the scenario ΔT, the ambient DEVIATION from the
 * baseline is sheltered by the surface: a 34 °C heatwave sways an outdoor
 * bed but barely reaches a ventilated tent.
 */
export function scenarioGrowthMod(
  crop: Crop,
  scenario: ScenarioType,
  surface: PlanSurface = 'outdoor',
  ctx?: GrowthModCtx,
): GrowthMod {
  const p = SCENARIOS[scenario];
  const shelter = SURFACE_SHELTER[surface];
  const baseline = ctx?.baselineTempC ?? DEFAULT_BASELINE_TEMP_C;
  const effBase =
    ctx?.ambientTempC !== undefined
      ? baseline + (ctx.ambientTempC - baseline) * shelter
      : baseline;
  const effTemp = effBase + p.tempDeltaC * shelter;

  let stress = 0;
  if (effTemp > crop.maxTempC) stress += Math.min(1, (effTemp - crop.maxTempC) / 10);
  else if (effTemp < crop.minTempC) stress += Math.min(1, (crop.minTempC - effTemp) / 10);
  if (p.precipMultiplier < 1) {
    stress += (1 - p.precipMultiplier) * SURFACE_SHELTER[surface] * Math.min(1, crop.waterNeedMmDay / 5);
  }

  if (p.fertilizerBoost > 0) stress = Math.max(0, stress - p.fertilizerBoost * 0.05);
  stress = Math.max(0, Math.min(1, stress));

  let rate = 1 - stress * 0.6;
  if (scenario === 'optimal') rate = Math.min(1.2, rate + 0.1);
  return { rate: Math.max(0.2, Math.min(1.2, rate)), stress };
}

const MS_DAY = 86_400_000;

/** Growth progress 0..1 for a crop at a date, given a scenario growth rate. */
export function growthProgress(
  crop: Crop,
  plantedAt: string | undefined,
  currentDate: Date,
  rate = 1,
): number {
  if (!plantedAt) return 1; // no planting date -> show mature
  const planted = new Date(plantedAt);
  const daysSince = (currentDate.getTime() - planted.getTime()) / MS_DAY;
  const maturityDays = crop.growthDays ?? 60;
  return Math.max(0, Math.min(1, (daysSince * rate) / maturityDays));
}

/** Map growth progress 0..1 to a discrete voxel-asset stage 0..5. */
export function stageForScale(scale: number): number {
  return Math.max(0, Math.min(5, Math.round(scale * 5)));
}
