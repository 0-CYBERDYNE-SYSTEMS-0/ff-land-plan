// Growth drivers: GDD accumulation, thermal stress, biomass/stage/flowering
// mapping (SPEC-SIM-ECOSYSTEM §3.1 drivers.ts). All pure functions of their
// inputs — determinism is what makes replay-as-storage work.

import { SURFACE_SHELTER } from '@/lib/growth';
import type { Crop, PlanSurface } from '@/types';
import type { CellStress, DailyEnvironment, NeighborContext } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// Same 2dp idiom as environment.ts round2 / engine.ts r2.
const round2 = (v: number) => Math.round(v * 100) / 100;

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

/**
 * Beta approximation for reduced wind/VPD under enclosure: reference ET is
 * scaled per surface. Single-table constant, trivially tunable.
 */
export const SURFACE_ET_FACTOR: Record<PlanSurface, number> = {
  outdoor: 1,
  greenhouse: 0.85,
  hoophouse: 0.9,
  tent: 0.75,
  indoor: 0.6,
  warehouse: 0.6,
};

/**
 * The environment a cell on `surface` actually experiences — computed ONCE
 * per day and fed to every sim consumer (shelter at ingestion). Outdoor
 * returns `env` by reference: zero-cost, behavior-identical. Enclosed
 * surfaces get SURFACE_SHELTER-attenuated temps (scenario ΔT only, semantics
 * unchanged), gddBase10C recomputed from those temps with environment.ts's
 * max(0, mean − 10) formula so GDD pace matches stress, and precipMm 0 —
 * roofs keep rain out, so enclosed runs are irrigation-driven. That
 * deliberately supersedes simLegacy's scenario-only precip attenuation. ET0
 * scales by SURFACE_ET_FACTOR.
 */
export function effectiveEnvironmentForSurface(
  env: DailyEnvironment,
  surface: PlanSurface,
): DailyEnvironment {
  if ((SURFACE_SHELTER[surface] ?? 1) >= 1) return env;
  const { tMinC, tMaxC } = shelteredTemps(env, surface);
  return {
    ...env,
    tMinC,
    tMaxC,
    gddBase10C: round2(Math.max(0, (tMinC + tMaxC) / 2 - 10)),
    precipMm: 0,
    etoMm: round2(env.etoMm * SURFACE_ET_FACTOR[surface]),
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

/** Today's GDD gain, reduced by the worst stress and lifted by companion
 * neighbors: ×(1 − 0.6·maxStress) ×(1 + neighborBonus). */
export function gddGain(env: DailyEnvironment, maxStress: number, neighborBonus = 0): number {
  return env.gddBase10C * (1 - STRESS_RATE_FACTOR * clamp01(maxStress)) * (1 + neighborBonus);
}

// Companion / antagonist neighbor terms (Phase 3, from SimState.neighbors —
// ecosystem.buildNeighborCache). Asymmetric: only the cell whose OWN list
// names the neighbor gets the effect.

/** +4% GDD rate per listed companion, capped at +12% (3 companions). */
export const COMPANION_RATE_BONUS = 0.04;
export const COMPANION_BONUS_CAP = 0.12;

export function companionRateBonus(n: NeighborContext | undefined): number {
  if (!n || n.companions <= 0) return 0;
  return Math.min(COMPANION_BONUS_CAP, n.companions * COMPANION_RATE_BONUS);
}

/** +0.05 flat stress per listed antagonist, capped at 0.15 — added on top of
 * the max() that drives the GDD rate. */
export const ANTAGONIST_STRESS_ADD = 0.05;
export const ANTAGONIST_STRESS_CAP = 0.15;

export function antagonistStressAdd(n: NeighborContext | undefined): number {
  if (!n || n.antagonists <= 0) return 0;
  return Math.min(ANTAGONIST_STRESS_CAP, n.antagonists * ANTAGONIST_STRESS_ADD);
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
