// Growth drivers: GDD accumulation, thermal stress, biomass/stage/flowering
// mapping (SPEC-SIM-ECOSYSTEM §3.1 drivers.ts). All pure functions of their
// inputs — determinism is what makes replay-as-storage work.

import { SURFACE_SHELTER } from '@/lib/growth';
import type { Crop, PlanSurface } from '@/types';
import type { CellStress, DailyEnvironment } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Fallback mean daily GDD when no climate normals exist: 10 °C·day is what a
 * 20 °C mean day accumulates at base 10 — the legacy growth.ts baseline. */
export const FALLBACK_MEAN_DAILY_GDD_C = 10;

/** GDD gain multiplier loss at max stress: gain ×(1 − 0.6·maxStress). */
export const STRESS_RATE_FACTOR = 0.6;

/** A stress term ≥ 0.4 counts as "on" (events + stressCellDays). */
export const STRESS_ONSET = 0.4;
/** An "on" stress term falling below 0.2 emits a stress-end event. */
export const STRESS_RELIEF = 0.2;

/** GDD needed for full biomass: catalog growthDays × climatological mean
 * daily GDD over the run window. Deviation of actual weather (or stress-
 * slowed accumulation) from that pace shows up as schedule delay. */
export function gddRequiredC(crop: Crop, meanDailyGddC: number | undefined): number {
  const pace = meanDailyGddC ?? FALLBACK_MEAN_DAILY_GDD_C;
  return Math.max(1, crop.growthDays) * pace;
}

/**
 * Surface-sheltered temps for a cell. The SCENARIO delta (effective − raw) is
 * attenuated by growth.ts SURFACE_SHELTER (greenhouse 0.35, tent 0.12, …) —
 * an enclosure moderates the manipulation, not the underlying climate. With
 * no scenario on the day (no `raw`), shelter is moot and temps pass through.
 */
export function shelteredTemps(
  env: DailyEnvironment,
  surface: PlanSurface,
): { tMinC: number; tMaxC: number } {
  const raw = env.raw;
  if (!raw) return { tMinC: env.tMinC, tMaxC: env.tMaxC };
  const shelter = SURFACE_SHELTER[surface] ?? 1;
  if (shelter >= 1) return { tMinC: env.tMinC, tMaxC: env.tMaxC };
  return {
    tMinC: raw.tMinC + (env.tMinC - raw.tMinC) * shelter,
    tMaxC: raw.tMaxC + (env.tMaxC - raw.tMaxC) * shelter,
  };
}

export interface ThermalStress {
  heat: number;
  cold: number;
  /** True frost hit (sheltered tMin ≤ 0 °C on a non-hardy crop). */
  frost: boolean;
}

/** Heat/cold stress vs the crop's real temp band, /10 per °C beyond it — the
 * same slope as growth.ts scenarioGrowthMod, but against daily tMax (heat)
 * and tMin (cold) instead of a single mean. */
export function thermalStress(crop: Crop, tMinC: number, tMaxC: number): ThermalStress {
  const heat = tMaxC > crop.maxTempC ? Math.min(1, (tMaxC - crop.maxTempC) / 10) : 0;
  const cold = tMinC < crop.minTempC ? Math.min(1, (crop.minTempC - tMinC) / 10) : 0;
  const frost = tMinC <= 0 && crop.frostTolerance !== 'hardy';
  return { heat, cold, frost };
}

/** Today's GDD gain, reduced by the worst stress: ×(1 − 0.6·maxStress). */
export function gddGain(env: DailyEnvironment, maxStress: number): number {
  return env.gddBase10C * (1 - STRESS_RATE_FACTOR * clamp01(maxStress));
}

export function biomassFromGdd(gddAccumC: number, gddRequired: number): number {
  return clamp01(gddAccumC / gddRequired);
}

/** Discrete voxel-asset stage 0..5 from biomass (growth.ts stageForScale). */
export function stageForBiomass(biomassFrac: number): number {
  return Math.min(5, Math.max(0, Math.round(biomassFrac * 5)));
}

/**
 * Flowering intensity 0..1: a triangular bump across the stage 3–4 band —
 * 0 at biomass ≤ 0.5, peak 1.0 at 0.7, back to 0 at ≥ 0.9 (fruiting set).
 */
export function floweringForBiomass(biomassFrac: number): number {
  const b = biomassFrac;
  if (b <= 0.5 || b >= 0.9) return 0;
  return 1 - Math.abs(b - 0.7) / 0.2;
}

/** Mean of the four stress terms (yield penalty input). */
export function meanStress(stress: CellStress): number {
  return (stress.water + stress.heat + stress.cold + stress.nitrogen) / 4;
}
