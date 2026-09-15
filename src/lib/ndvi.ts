// Plan-derived NDVI proxy. Deterministic model of canopy density from the
// PlotDesigner plan — NOT satellite imagery. Same plan + date ⇒ same grid.
// Pure: no fetch, no Math.random.
import type { Crop, PlanState } from '@/types';
import { growthProgress, stageForScale } from '@/lib/growth';

/** NDVI proxy for bare soil (documented model constant). */
export const SOIL_NDVI = 0.12;
/** Packed/compacted ground (paths) reflects almost no canopy. */
export const PATH_NDVI = 0.08;

// Curve anchors: stage 0 (bare seedling row) ≈ soil+0.13, stage 5 (dense
// canopy) ≈ 0.75. Linear in stage so the growth timeline reads clearly.
const STAGE_BASE = 0.25;
const STAGE_SPAN = 0.5;

// Category modifiers (documented): cover crops and dense grasses/grains
// canopy tighter than their stage suggests; flowers and herbs are airier.
const DENSE_CATEGORIES = new Set(['cover_crop', 'grain']);
const AIRY_CATEGORIES = new Set(['flower', 'herb']);

// Small ground-slug context map. Unknown slugs fall back to SOIL_NDVI.
// Keep this tiny — it is a cheap contextual hint, not a full asset model.
function groundNdvi(slug: string): number {
  if (slug.includes('path')) return PATH_NDVI;
  return SOIL_NDVI;
}

export interface PlanNdviGrid {
  cells: { x: number; y: number; ndvi: number }[];
  sampledAt: string;
  note: string;
}

/** Max points before downsampling (panel renders buckets + avg only). */
const MAX_POINTS = 4_000;

/**
 * NDVI proxy for every planted cell: stage curve from growthProgress →
 * stageForScale, adjusted by crop category, clamped to 0..1. Ground-only
 * cells contribute their slug context value. Above MAX_POINTS the grid is
 * downsampled with an even stride (every k-th cell after sorting by x,y) —
 * documented so averages stay representative.
 */
export function planNdviGrid(
  plan: PlanState,
  cropById: Map<number, Crop>,
  opts?: { date?: Date },
): PlanNdviGrid {
  const date = opts?.date ?? new Date();
  const entries = Object.entries(plan.planting);
  const groundEntries = Object.entries(plan.ground);

  // Sort for a stable stride even though Record order is insertion-ordered.
  const sorted = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const stride = Math.max(1, Math.ceil(sorted.length / MAX_POINTS));

  const cells: { x: number; y: number; ndvi: number }[] = [];
  sorted.forEach(([key, cropId], i) => {
    if (i % stride !== 0) return;
    const [x, y] = key.split(',').map(Number);
    const crop = cropById.get(cropId);
    let ndvi: number;
    if (!crop) {
      ndvi = SOIL_NDVI;
    } else {
      const progress = growthProgress(crop, plan.plantedAt?.[key], date);
      const stage = stageForScale(progress);
      ndvi = STAGE_BASE + STAGE_SPAN * (stage / 5);
      if (DENSE_CATEGORIES.has(crop.category)) ndvi += 0.05;
      else if (AIRY_CATEGORIES.has(crop.category)) ndvi -= 0.03;
      ndvi = Math.max(0, Math.min(1, ndvi));
    }
    cells.push({ x, y, ndvi });
  });

  // Ground-only context cells (paths etc.) — cheap, same stride logic.
  groundEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const gStride = Math.max(1, Math.ceil(groundEntries.length / MAX_POINTS));
  groundEntries.forEach(([key, slug], i) => {
    if (i % gStride !== 0) return;
    if (key in plan.planting) return; // planted cell already counted
    const [x, y] = key.split(',').map(Number);
    cells.push({ x, y, ndvi: groundNdvi(slug) });
  });

  return {
    cells,
    sampledAt: date.toISOString(),
    note: 'Modeled from plan (not satellite imagery)',
  };
}
