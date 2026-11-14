// Sim-only light constants (DLI stress floors and CEA targets), consumed by
// scenarioGrowthMod (scenario-params.ts) and sim/drivers.ts.
import type { CropCategory } from '@/types';

/**
 * Minimum daily light integral (mol/m²/day) a crop category needs for
 * unimpeded growth, per horticultural-extension norms (e.g. Cornell / Purdue
 * extension DLI tables: fruiting crops ≈20+, grains ≈18, leafy vegetables
 * ≈14, herbs/flowers ≈10, cover crops tolerate ≈8). `fungus` is never
 * light-stressed (mushrooms fruit in the dark).
 */
export const DLI_NEED_MOL: Record<CropCategory, number> = {
  fruit: 20,
  grain: 18,
  vegetable: 14,
  herb: 10,
  flower: 10,
  cover_crop: 8,
  fungus: 0,
};

/** Explicit name used by the environment climate model; values preserve the
 * shipped minimum-stress thresholds above. */
export const DLI_MIN_MOL = DLI_NEED_MOL;

/** Representative CEA targets for sizing lights, separate from stress floors. */
export const DLI_TARGET_MOL: Record<CropCategory, number> = {
  fruit: 25,
  grain: 18,
  vegetable: 14,
  herb: 14,
  cover_crop: 8,
  flower: 10,
  fungus: 0,
};

/**
 * Weight of the light-deficit term in the stress sum. Supplemental LEDs are
 * the normal grower mitigation for a low-DLI enclosed structure — this term
 * models the *unlit* case, so it contributes a fraction of stress
 * proportional to the deficit but never dominates temperature/water stress.
 */
export const LIGHT_STRESS_WEIGHT = 0.4;
