/**
 * Plant view projection — the pure seam between sim truth and visual
 * expression (quality/SPEC-GROWTH-VISUAL.md §2.1).
 *
 * Laws (binding):
 *  - PURE: no globals, no clock, no engine writes, no framework imports
 *    (three-free so 2D renderPlan overlays can reuse this in wave 5).
 *  - DETERMINISTIC: same inputs ⇒ identical output. No Math.random — all
 *    variation is seeded from FNV-1a(cellKey) → mulberry32.
 *  - TOTAL: must not throw on any CellState (optional fields may be missing).
 *  - Derived channels ONLY: never alters stepDay semantics; every state below
 *    is computed from what the engine already exposes.
 */

import type { Crop } from '@/types';
import type { CellState, DailyEnvironment } from './types';

export type PlantLifecycle = 'alive' | 'dead' | 'harvested' | 'overripe';

/** Seeded per-cell genetic variation (de-clone channel). Channel multipliers
 * stay within ±4% — jitter inside palette discipline, never a new hue. */
export interface PlantVariation {
  r: number;
  g: number;
  b: number;
  lean01: number;
  scale01: number;
}

export interface PlantViewParams {
  /** Continuous 0..1 growth (biomassFrac). */
  growth: number;
  /** Resolved keyframe index 0..stageCount-1 on the crop's keyframe axis. */
  stage: number;
  stageCount: number;
  lifecycle: PlantLifecycle;
  /** 0..1 droop/lean channel → renderer matrix (base-anchored lean + squash). */
  wilt: number;
  /** Condition tint multiplier; null = untinted (≤0.2 stress, renderer convention). */
  tint: { r: number; g: number; b: number } | null;
  /** Passthrough of floweringFrac for pollinator gating. */
  flowering: number;
  /** Passthrough of moistureFrac (0..1) for the soil-pad tint channel;
   *  null when the cell carries no moisture reading (pad untinted). */
  moisture: number | null;
  variation: PlantVariation;
}

// --- seeded hashing (determinism law — mirrors voxel.ts's mulberry32) -------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-cell variation, stable forever for a cellKey (same key ⇒ same plant). */
export function variationForCell(cellKey: string): PlantVariation {
  const rng = mulberry32(fnv1a(`var:${cellKey}`));
  return {
    r: 0.96 + rng() * 0.08,
    g: 0.96 + rng() * 0.08,
    b: 0.96 + rng() * 0.08,
    lean01: rng(),
    scale01: rng(),
  };
}

// --- condition channels ------------------------------------------------------

/**
 * Effective condition stress 0..1: MAX of the four stress terms (the same
 * max-of-terms aggregation RunInspector rows use) with pest pressure folded
 * in at the documented 0.8 weight (visual-only; mirrors World3D applyRunGrowth).
 */
export function effectiveStress(cell: CellState): number {
  const terms = cell.stress;
  const worst = Math.max(terms.water, terms.heat, terms.cold, terms.nitrogen);
  return Math.min(1, Math.max(worst, (cell.pestPressure ?? 0) * 0.8));
}

/** Stress tint multiplier — the curve the renderer's batch tint always used
 * (plants.ts applyStressTint), now applied per instance. */
export function stressTintMultiplier(stress: number): { r: number; g: number; b: number } {
  return { r: 1, g: 1 - stress * 0.35, b: 1 - stress * 0.55 };
}

/**
 * Wilt droop channel 0..1: water stress dominates, heat adds half weight;
 * smoothstep onset at 0.35, saturated at 0.9 (SPEC-GROWTH-VISUAL §2.3).
 */
export function wiltAmount(cell: CellState): number {
  const waterEff = Math.min(1, Math.max(0, cell.stress.water + cell.stress.heat * 0.5));
  if (waterEff <= 0.35) return 0;
  if (waterEff >= 0.9) return 1;
  const t = (waterEff - 0.35) / 0.55;
  return t * t * (3 - 2 * t);
}

/**
 * Keyframe index for a continuous growth value on a per-crop keyframe axis.
 * stageCount 6 ⇒ identical to the engine's `stageForBiomass` (round(g×5)) —
 * the engine's 0..5 stage field is NEVER remapped, this only extends the
 * visual axis for crops whose archetype grows more keyframes (waves 2–3).
 */
export function growthToStage(growth: number, stageCount: number): number {
  const n = Math.max(1, Math.round(stageCount));
  return Math.min(n - 1, Math.max(0, Math.round(growth * (n - 1))));
}

// --- per-crop keyframe axis (SPEC §2.4 — "more keyframes, per-archetype") ----
// The visual keyframe axis extends past the engine's 0..5 only where richer
// keyframes have been authored (waves 2–3); every other crop stays on the
// engine axis so the no-run path is unchanged. Keyed by crop NAME (the axis
// makeCropFor consumes, name-keyed like the Tier-3 specials) and mirrored by
// archetype id for the showcase/scrub surface.

/** Crops whose VISUAL axis has more than 6 authored keyframes. */
export const CROP_STAGE_COUNTS: Record<string, number> = {
  'Sweet Corn': 10,
  Apple: 10,
};

/** Archetype-keyed mirror (showcase lane B + scrub tool address archetypes). */
const ARCH_STAGE_COUNTS: Record<string, number> = {
  corn: 10,
  'apple-tree': 10,
};

/** Keyframe count for a crop name OR archetype id (default 6 = engine axis). */
export function stageCountFor(id: string): number {
  return CROP_STAGE_COUNTS[id] ?? ARCH_STAGE_COUNTS[id] ?? 6;
}

// --- lifecycle derivation (SPEC §2.3 — tuned ONLY here, engine untouched) ----

/** Hard frost kill: cold stress at/above this reads as frost death. */
const DEAD_FROST_COLD = 0.95;
/** Chronic decline: this many stress days at sustained high stress kills. */
const DEAD_CHRONIC_DAYS = 21;
const DEAD_CHRONIC_STRESS = 0.85;

/** Overripe grace window (days past readyAtDay) by crop category. */
function graceDaysFor(crop: Crop): number {
  return crop.category === 'fruit' ? 21 : 7;
}

export interface PlantViewInput {
  cell: CellState;
  crop: Crop;
  /** Run day environment (future channels read it; current math does not). */
  env: DailyEnvironment | null;
  dayIndex: number;
  cellKey: string;
  /** Per-crop keyframe count on the visual axis (default 6 = engine axis). */
  stageCount?: number;
}

/**
 * Project one cell's sim truth to its visual parameters. Pure and total —
 * call sites: World3D run reconcile (plants.ts viewByCell), the showcase
 * scrub tool, and (wave 5) the 2D blueprint overlays.
 */
export function projectPlant(input: PlantViewInput): PlantViewParams {
  const { cell, crop, dayIndex, cellKey } = input;
  const stageCount = input.stageCount ?? 6;
  const growth = Math.min(1, Math.max(0, cell.biomassFrac));
  const stress = effectiveStress(cell);

  // Precedence: harvested > dead > overripe > alive (SPEC §2.3).
  let lifecycle: PlantLifecycle = 'alive';
  if (cell.harvested) {
    lifecycle = 'harvested';
  } else if (
    cell.stress.cold >= DEAD_FROST_COLD ||
    ((cell.stressDaysCount ?? 0) >= DEAD_CHRONIC_DAYS && stress >= DEAD_CHRONIC_STRESS)
  ) {
    lifecycle = 'dead';
  } else if (cell.readyAtDay !== undefined && dayIndex > cell.readyAtDay + graceDaysFor(crop)) {
    lifecycle = 'overripe';
  }

  let wilt = wiltAmount(cell);
  if (lifecycle === 'dead') wilt = Math.max(wilt, 0.85); // Tier-2 geometry lands in wave 2
  if (lifecycle === 'harvested') wilt = 0;

  return {
    growth,
    stage: growthToStage(growth, stageCount),
    stageCount,
    lifecycle,
    wilt,
    tint: stress > 0.2 ? stressTintMultiplier(stress) : null,
    flowering: Math.min(1, Math.max(0, cell.floweringFrac ?? 0)),
    moisture: cell.moistureFrac === undefined ? null : Math.min(1, Math.max(0, cell.moistureFrac)),
    variation: variationForCell(cellKey),
  };
}
