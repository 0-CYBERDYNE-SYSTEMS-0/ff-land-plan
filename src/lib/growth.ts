// Growth model shared by the 3D plant renderer and the World3D simulation HUD.
// Deterministic, catalog-driven, scenario-aware.
import type { Crop, ScenarioType } from '@/types';

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

/** Baseline growing-season temperature (°C) the scenario deltas apply against. */
const BASELINE_TEMP_C = 20;

export interface GrowthMod {
  /** Multiplier on growth rate (1 = catalog growthDays). <1 = slower/smaller. */
  rate: number;
  /** 0..1 visual stress (drives stunting + the brown/yellow tint). */
  stress: number;
}

/**
 * How a scenario modulates one crop's growth, from its real temp/water
 * tolerance. Heat/cold stress when the scenario temp leaves [minTempC, maxTempC];
 * water stress when precipitation is cut and the crop is thirsty.
 */
export function scenarioGrowthMod(crop: Crop, scenario: ScenarioType): GrowthMod {
  const p = SCENARIOS[scenario];
  const effTemp = BASELINE_TEMP_C + p.tempDeltaC;

  let stress = 0;
  if (effTemp > crop.maxTempC) stress += Math.min(1, (effTemp - crop.maxTempC) / 10);
  else if (effTemp < crop.minTempC) stress += Math.min(1, (crop.minTempC - effTemp) / 10);
  if (p.precipMultiplier < 1) stress += (1 - p.precipMultiplier) * Math.min(1, crop.waterNeedMmDay / 5);

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
