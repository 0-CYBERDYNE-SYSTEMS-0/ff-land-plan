/**
 * Per-crop special builders (SPEC-GROWTH-VISUAL §2.5 Tier 3) — assembled from
 * one module per de-cloned crop family so builder agents never conflict.
 * Consulted by makeCropFor BEFORE the archetype dispatch; null entries keep
 * the archetype fallback.
 */
import type { SpecialBuildFn } from './types';
import { buildPepper } from './pepper';
import { buildEggplant } from './eggplant';
import { buildSunflower } from './sunflower';
import { buildPumpkin, buildZucchini, buildMelon, buildCucumber } from './squash';

export const SPECIAL_BUILDERS: Record<string, SpecialBuildFn | null> = {
  Pepper: buildPepper,
  Eggplant: buildEggplant,
  Sunflower: buildSunflower,
  Pumpkin: buildPumpkin,
  Zucchini: buildZucchini,
  Melon: buildMelon,
  Cucumber: buildCucumber,
};
