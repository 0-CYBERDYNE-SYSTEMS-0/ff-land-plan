// Per-cell daily water bucket in mm (SPEC-SIM-ECOSYSTEM §3.1 soil-water.ts).
//
// capacity = AWC (mm of water per cm of soil) × root depth (cm). AWC comes
// from SoilProfile.awcMmPerCm (USDA SDA / SSURGO); documented fallback
// 1.5 mm/cm ≈ a fine loam (SDA loams run ~1.5–2.0, sands ~0.7–1.1). Root
// depth is a v1 constant 30 cm for every crop — per-crop depth is a later
// refinement hook (soilWaterParams already takes it).
//
// Daily update (per cell):
//   bucket' = clamp(bucket + precip + irrigation − et0 × Kc(stage), 0, capacity)
//   moistureFrac = bucket / capacity
// Clamping at 0 means ET cannot extract water the bucket doesn't have.
// The bucket itself is reconstructed from moistureFrac × capacity each step,
// so CellState stores one number, not two.

import type { DailyEnvironment } from './types';

export const DEFAULT_AWC_MM_PER_CM = 1.5;
export const DEFAULT_ROOT_DEPTH_CM = 30;

export interface SoilWaterParams {
  awcMmPerCm: number;
  rootDepthCm: number;
}

export function soilWaterParams(
  awcMmPerCm: number | null | undefined,
  rootDepthCm: number = DEFAULT_ROOT_DEPTH_CM,
): SoilWaterParams {
  return {
    awcMmPerCm:
      typeof awcMmPerCm === 'number' && Number.isFinite(awcMmPerCm) && awcMmPerCm > 0
        ? awcMmPerCm
        : DEFAULT_AWC_MM_PER_CM,
    rootDepthCm: rootDepthCm > 0 ? rootDepthCm : DEFAULT_ROOT_DEPTH_CM,
  };
}

/** Total plant-available water in the root zone, mm (≥ 1 guard). */
export function bucketCapacityMm(p: SoilWaterParams): number {
  return Math.max(1, p.awcMmPerCm * p.rootDepthCm);
}

/**
 * FAO-56-shaped single Kc curve by biomass thirds (documented ramp):
 *   biomass ≤ 0.25        → 0.30  (initial)
 *   0.25 → 0.50 (linear)  → 1.15  (developing)
 *   0.50 → 0.75           → 1.15  (mid-season plateau)
 *   0.75 → 1.00 (linear)  → 0.80  (late season senescence)
 */
export function kcForBiomass(biomassFrac: number): number {
  const b = Math.min(1, Math.max(0, biomassFrac));
  if (b <= 0.25) return 0.3;
  if (b <= 0.5) return 0.3 + ((b - 0.25) / 0.25) * (1.15 - 0.3);
  if (b <= 0.75) return 1.15;
  return 1.15 - ((b - 0.75) / 0.25) * (1.15 - 0.8);
}

/**
 * Water stress from bucket fill (documented curve): 0 while moistureFrac ≥ 0.5
 * (half the plant-available water still held), then linear to 1.0 at 0.1 and
 * pinned at 1 below that.
 */
export function waterStressFromMoisture(moistureFrac: number): number {
  if (moistureFrac >= 0.5) return 0;
  return Math.min(1, Math.max(0, (0.5 - moistureFrac) / 0.4));
}

export function stepBucketMoisture(
  bucketMm: number,
  env: DailyEnvironment,
  kc: number,
  irrigationMm: number,
  params: SoilWaterParams,
): { bucketMm: number; moistureFrac: number } {
  const capacity = bucketCapacityMm(params);
  const et = env.etoMm * kc;
  const next = Math.min(capacity, Math.max(0, bucketMm + env.precipMm + irrigationMm - et));
  return { bucketMm: next, moistureFrac: next / capacity };
}
