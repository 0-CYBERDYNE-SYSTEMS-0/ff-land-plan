// Ecosystem dynamics for the sim engine (SPEC-SIM-ECOSYSTEM Phase 3):
// per-cell nitrogen pool, static neighbor context (companions/antagonists/
// host density), pest pressure, and the run-wide creature populations the
// world dresses with later.
//
// All pure functions of their inputs. Any stochastic bite is a keyed draw
// via uniform01(seed, dayIndex, salt) — no Math.random, same config replays
// byte-identically. Nothing here scans the grid more than once per run
// except 'plant' interventions, which rebuild the neighbor cache.

import type { Crop } from '@/types';
import { uniform01 } from './rng';
import type { CellState, NeighborContext } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// --- Nitrogen pool (kg/ha, per cell) -----------------------------------------

/** OM → season mineralizable N: 1% soil organic matter ≈ 250 kg N/ha in the
 * 30 cm root zone (OM ≈ 5% N by weight, ~2.24M kg soil/ha), of which the
 * pool models the mineralizable share. FAO-style heuristic. */
export const N_PER_OM_PCT = 250;
export const N_POOL_MIN_KG_HA = 200;
export const N_POOL_MAX_KG_HA = 1200;
/** Default starting pool when the farm has no soil profile. */
export const DEFAULT_N_POOL_KG_HA = 500;

/** Documented default when soil is unknown; clamps the OM heuristic. Same
 * numbers the engine shipped in Phase 1 — dynamics now act on top. */
export function initialNitrogenKgHa(organicMatterPct: number | null | undefined): number {
  if (typeof organicMatterPct !== 'number' || !Number.isFinite(organicMatterPct)) {
    return DEFAULT_N_POOL_KG_HA;
  }
  return Math.min(N_POOL_MAX_KG_HA, Math.max(N_POOL_MIN_KG_HA, organicMatterPct * N_PER_OM_PCT));
}

/** Seasonal crop N demand from the catalog band (standard extension-table
 * uptake classes; custom crops default to 'medium'). */
export const NITROGEN_NEED_KG_HA = { low: 60, medium: 120, high: 180 } as const;

export function nitrogenNeedKgHa(crop: Crop): number {
  return NITROGEN_NEED_KG_HA[crop.nitrogenNeed ?? 'medium'];
}

/** Fraction of the OM-derived pool that mineralizes per day at optimum
 * temperature: 0.2%/day ≈ 18% of the pool over a 90-day season — the top of
 * the FAO 1–4%-of-soil-N range, generous because our pool IS the
 * mineralizable share. Scaled by mineralizationTempFactor. */
export const N_MINERAL_FRAC_PER_DAY = 0.002;
/** Mineralization is ~0 at/below 2 °C and unrestricted at/above 20 °C. */
export const MINERAL_TEMP_MIN_C = 2;
export const MINERAL_TEMP_MAX_C = 20;

export function mineralizationTempFactor(tMeanC: number): number {
  return clamp01((tMeanC - MINERAL_TEMP_MIN_C) / (MINERAL_TEMP_MAX_C - MINERAL_TEMP_MIN_C));
}

/** Daily mineralization trickle off the run's OM-derived pool reference. */
export function mineralizationKgHa(omPoolRefKgHa: number, tMeanC: number): number {
  return omPoolRefKgHa * N_MINERAL_FRAC_PER_DAY * mineralizationTempFactor(tMeanC);
}

/** Daily uptake demand: the seasonal need spread over the growth window by
 * the day's potential (unstressed) biomass gain — uptake follows growth. */
export function uptakeDemandKgHa(
  seasonalNeedKgHa: number,
  potentialBiomassGain: number,
  biomassFrac: number,
): number {
  const remaining = Math.max(0, 1 - biomassFrac);
  return seasonalNeedKgHa * Math.min(clamp01(potentialBiomassGain), remaining);
}

/** A day whose water input (rain + irrigation) exceeds this leaches
 * N_LEACH_FRACTION of the available pool below the root zone. */
export const N_LEACH_MM = 20;
export const N_LEACH_FRACTION = 0.1;

/** Nitrogen stress 0..1: 0 while the pool holds ≥ 1.2× the remaining
 * seasonal need (N_STRESS_BUFFER ≈ one fertilizer pass of headroom), 1 when
 * the pool is empty, linear between. Mature crops (nothing left to take up)
 * are never stressed. */
export const N_STRESS_BUFFER = 1.2;
const N_REMAINING_EPSILON_KG_HA = 1; // below this much remaining need, no stress

export function nitrogenStress(
  poolKgHa: number,
  seasonalNeedKgHa: number,
  biomassFrac: number,
): number {
  const remaining = seasonalNeedKgHa * Math.max(0, 1 - biomassFrac);
  if (remaining <= N_REMAINING_EPSILON_KG_HA) return 0;
  return clamp01(1 - Math.max(0, poolKgHa) / (N_STRESS_BUFFER * remaining));
}

// --- Neighbor context (companions / antagonists / host density) --------------

/** Chebyshev scan radius in CELLS. Fixed 2: at the default plan cellM 0.25 m
 * the window spans ~1 m ≈ 2× typical 30–45 cm crop spacings. */
export const NEIGHBOR_RADIUS = 2;
/** Cells around the center in the radius-2 Chebyshev window (host-density
 * denominator: sameCrop / 24). */
export const NEIGHBOR_WINDOW = (2 * NEIGHBOR_RADIUS + 1) ** 2 - 1;

const EMPTY_NEIGHBORS: NeighborContext = { companions: 0, antagonists: 0, sameCrop: 0 };

export function emptyNeighbors(): NeighborContext {
  return { ...EMPTY_NEIGHBORS };
}

function parseCellKey(key: string): { x: number; y: number } | null {
  const i = key.indexOf(',');
  if (i < 0) return null;
  const x = Number(key.slice(0, i));
  const y = Number(key.slice(i + 1));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const cellKey = (x: number, y: number) => `${x},${y}`;

function relates(
  crop: Crop | undefined,
  other: Crop | undefined,
  list: string[] | undefined,
): boolean {
  return !!(crop && other && other.slug && list?.includes(other.slug));
}

/** One O(cells × 24) pass over the planted grid. Matches on catalog slug
 * (the companions/antagonists lists hold slugs); crops without a slug
 * (custom) never relate. Asymmetric by design: A's lists decide — A liking
 * B with B neutral to A bonuses A only. */
export function buildNeighborCache(
  cells: Record<string, CellState>,
  cropOf: (id: number) => Crop | undefined,
): Record<string, NeighborContext> {
  const out: Record<string, NeighborContext> = {};
  const positions = new Map<string, { x: number; y: number; cropId: number }>();
  for (const key of Object.keys(cells)) {
    const p = parseCellKey(key);
    if (p) positions.set(key, { ...p, cropId: cells[key]!.cropId });
  }
  for (const [key, pos] of positions) {
    const crop = cropOf(pos.cropId);
    const ctx: NeighborContext = { companions: 0, antagonists: 0, sameCrop: 0 };
    for (let dx = -NEIGHBOR_RADIUS; dx <= NEIGHBOR_RADIUS; dx++) {
      for (let dy = -NEIGHBOR_RADIUS; dy <= NEIGHBOR_RADIUS; dy++) {
        if (dx === 0 && dy === 0) continue;
        const other = positions.get(cellKey(pos.x + dx, pos.y + dy));
        if (!other) continue;
        if (other.cropId === pos.cropId) ctx.sameCrop++;
        const otherCrop = cropOf(other.cropId);
        if (relates(crop, otherCrop, crop?.companions)) ctx.companions++;
        if (relates(crop, otherCrop, crop?.antagonists)) ctx.antagonists++;
      }
    }
    out[key] = ctx;
  }
  return out;
}

// --- Pest pressure (per cell, 0..1) -------------------------------------------

/** Warm-and-humid proxy: mean temp inside the pest activity band AND a wet
 * day (rain ≥ PEST_WET_MM) or a damp bucket (moistureFrac ≥ PEST_WET_MOISTURE). */
export const PEST_TEMP_MIN_C = 18;
export const PEST_TEMP_MAX_C = 30;
export const PEST_WET_MM = 0.2;
export const PEST_WET_MOISTURE = 0.7;
/** Pressure gained on a favorable day at zero host density; host factor and
 * the seeded bite multiply it (monoculture ≈ ×1.5, bite ∈ [0.5, 1.5)).
 * Tuned so isolated cells hover low while wet monocultures climb toward
 * outbreak over a few weeks — decay matches growth at zero host density so
 * dry spells actually clear an infestation. */
export const PEST_GROWTH_PER_DAY = 0.015;
/** Slow decay on unfavorable days. */
export const PEST_DECAY_PER_DAY = 0.015;
/** A frost day (sheltered tMin ≤ 0) knocks the population to 20%. */
export const PEST_FROST_SURVIVAL = 0.2;
/** Outbreak = crossing 0.6 upward; ends (hysteresis) below 0.3. */
export const PEST_OUTBREAK = 0.6;
export const PEST_OUTBREAK_END = 0.3;

export interface PestDayInput {
  tMeanC: number;
  tMinShelteredC: number;
  precipMm: number;
  moistureFrac: number;
  /** sameCrop / 24 — host density in the radius-2 window. */
  hostRatio: number;
}

export function stepPestPressure(
  prev: number,
  d: PestDayInput,
  seed: number,
  dayIndex: number,
  cellKey: string,
): number {
  let p = prev;
  const favorable =
    d.tMeanC >= PEST_TEMP_MIN_C &&
    d.tMeanC <= PEST_TEMP_MAX_C &&
    (d.precipMm >= PEST_WET_MM || d.moistureFrac >= PEST_WET_MOISTURE);
  if (d.tMinShelteredC <= 0) {
    p *= PEST_FROST_SURVIVAL;
  } else if (favorable) {
    const bite = 0.5 + uniform01(seed, dayIndex, `pest:${cellKey}`);
    p += PEST_GROWTH_PER_DAY * (0.5 + clamp01(d.hostRatio)) * bite;
  } else {
    p *= 1 - PEST_DECAY_PER_DAY;
  }
  return Math.min(1, Math.max(0, p));
}

// --- Creatures (run-wide display populations) ---------------------------------

/** Bee-pollinated fruiting crops of the catalog; category 'fruit' (apple,
 * strawberry, raspberry, blueberry) counts too. Wind/self-pollinated
 * staples (corn, wheat, brassicas, alliums, herbs) do not. */
export const INSECT_POLLINATED_SLUGS = new Set([
  'tomato',
  'pepper',
  'eggplant',
  'cucumber',
  'zucchini',
  'pumpkin',
  'melon',
]);

export function isInsectPollinated(crop: Crop | undefined): boolean {
  if (!crop) return false;
  return crop.category === 'fruit' || INSECT_POLLINATED_SLUGS.has(crop.slug ?? '');
}

/** Peak bees at full flowering per pollinated cell; butterflies sample all
 * flowers at lower weight; pests scale off mean plot pressure. */
export const BEES_PER_FLOWERING_CELL = 8;
export const BUTTERFLIES_PER_FLOWERING_CELL = 3;
export const PESTS_PER_MEAN_PRESSURE = 20;

/** Pure derivation called from stepDay — the world reads SimState.creatures
 * (animals.ts wiring is Phase-3 UI work, not this module's job). */
export function creaturesFromCells(
  cells: Record<string, CellState>,
  cropOf: (id: number) => Crop | undefined,
): Record<string, number> {
  let beeCapacity = 0;
  let butterflyCapacity = 0;
  let pestSum = 0;
  let n = 0;
  for (const key of Object.keys(cells)) {
    const c = cells[key]!;
    const crop = cropOf(c.cropId);
    const f = c.floweringFrac;
    butterflyCapacity += f;
    if (isInsectPollinated(crop)) beeCapacity += f;
    pestSum += c.pestPressure;
    n++;
  }
  return {
    bees: Math.round(beeCapacity * BEES_PER_FLOWERING_CELL),
    butterflies: Math.round(butterflyCapacity * BUTTERFLIES_PER_FLOWERING_CELL),
    pests: Math.round(n > 0 ? (pestSum / n) * PESTS_PER_MEAN_PRESSURE : 0),
  };
}
