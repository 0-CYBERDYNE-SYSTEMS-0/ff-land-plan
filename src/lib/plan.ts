// Plot plan model + intelligence. Sparse string-keyed cell maps ("x,y") keep
// empty plans free and big plans cheap. Plant counts use per-crop summed area
// (regions are invisible to the math); companion checks compare crop-pair cell
// sets within a 1 m radius.

import type { Crop, GardenAsset, PlanState } from '@/types';
import { assetBySlug } from '@/data/assets';

export const CELL_M = 0.25;
export const CELL_AREA_M2 = CELL_M * CELL_M;
export const MAX_DIM_M = 60;

export const cellKey = (x: number, y: number) => `${x},${y}`;
export const parseKey = (key: string): [number, number] => {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
};

export const planCols = (plan: PlanState) => Math.round(plan.widthM / plan.cellM);
export const planRows = (plan: PlanState) => Math.round(plan.heightM / plan.cellM);

export function createDefaultPlan(farmId: number): PlanState {
  return {
    farmId,
    widthM: 20,
    heightM: 12,
    cellM: CELL_M,
    allowOutsideBeds: true,
    planting: {},
    ground: {},
    updatedAt: new Date().toISOString(),
  };
}

export function canPlantAt(plan: PlanState, key: string): boolean {
  const slug = plan.ground[key];
  if (slug) {
    const asset = assetBySlug(slug);
    return asset ? asset.plantable : false;
  }
  return plan.allowOutsideBeds;
}

// Drop cells that fall outside new dimensions (after a resize).
export function clampPlan(plan: PlanState): PlanState {
  const cols = planCols(plan);
  const rows = planRows(plan);
  const inBounds = (key: string) => {
    const [x, y] = parseKey(key);
    return x >= 0 && y >= 0 && x < cols && y < rows;
  };
  const planting: Record<string, number> = {};
  const ground: Record<string, string> = {};
  for (const k of Object.keys(plan.planting)) if (inBounds(k)) planting[k] = plan.planting[k];
  for (const k of Object.keys(plan.ground)) if (inBounds(k)) ground[k] = plan.ground[k];
  return { ...plan, planting, ground };
}

// --- Stats -------------------------------------------------------------------

export interface CropStat {
  crop: Crop;
  cells: number;
  areaM2: number;
  plants: number;
  yieldKg: number;
  waterLDay: number;
}

export interface PlanStats {
  perCrop: CropStat[];
  plantedAreaM2: number;
  bedAreaM2: number;
  infrastructureAreaM2: number;
  totalYieldKg: number;
  totalWaterLDay: number;
  families: string[];
}

const DEFAULT_SPACING_CM = 30;

export function plantsForArea(crop: Crop, cells: number): number {
  if (cells === 0) return 0;
  const areaM2 = cells * CELL_AREA_M2;
  const spacing = (crop.spacingCm ?? DEFAULT_SPACING_CM) / 100;
  const rowSpacing = (crop.rowSpacingCm ?? crop.spacingCm ?? DEFAULT_SPACING_CM) / 100;
  return Math.max(1, Math.floor(areaM2 / (spacing * rowSpacing)));
}

export function computeStats(plan: PlanState, crops: Crop[]): PlanStats {
  const byId = new Map(crops.map((c) => [c.id, c]));
  const cellCounts = new Map<number, number>();
  for (const key of Object.keys(plan.planting)) {
    const id = plan.planting[key];
    cellCounts.set(id, (cellCounts.get(id) ?? 0) + 1);
  }

  const perCrop: CropStat[] = [];
  for (const [id, cells] of cellCounts) {
    const crop = byId.get(id);
    if (!crop) continue;
    const areaM2 = cells * CELL_AREA_M2;
    const plants = plantsForArea(crop, cells);
    perCrop.push({
      crop,
      cells,
      areaM2,
      plants,
      yieldKg: plants * (crop.yieldKgPerPlant ?? 0),
      waterLDay: areaM2 * crop.waterNeedMmDay, // 1 mm over 1 m² = 1 L
    });
  }
  perCrop.sort((a, b) => b.cells - a.cells);

  let bedAreaM2 = 0;
  let infrastructureAreaM2 = 0;
  for (const key of Object.keys(plan.ground)) {
    const asset = assetBySlug(plan.ground[key]);
    if (!asset) continue;
    if (asset.plantable) bedAreaM2 += CELL_AREA_M2;
    else infrastructureAreaM2 += CELL_AREA_M2;
  }

  const families = [...new Set(perCrop.map((s) => s.crop.family).filter((f): f is string => !!f))];

  return {
    perCrop,
    plantedAreaM2: Object.keys(plan.planting).length * CELL_AREA_M2,
    bedAreaM2,
    infrastructureAreaM2,
    totalYieldKg: perCrop.reduce((s, c) => s + c.yieldKg, 0),
    totalWaterLDay: perCrop.reduce((s, c) => s + c.waterLDay, 0),
    families,
  };
}

// --- Companion / antagonist adjacency ----------------------------------------

export interface PlanPairing {
  a: Crop;
  b: Crop;
  kind: 'antagonist' | 'companion';
  cells: string[]; // offending/benefiting cells (for canvas highlight)
}

const ADJ_RADIUS_CELLS = 4; // 1 m at 0.25 m cells

function slugsToIds(slugs: string[] | undefined, crops: Crop[]): Set<number> {
  if (!slugs?.length) return new Set();
  const ids = new Set<number>();
  for (const s of slugs) {
    const m = crops.find((c) => c.slug === s);
    if (m) ids.add(m.id);
  }
  return ids;
}

export function findPairings(plan: PlanState, crops: Crop[]): PlanPairing[] {
  const byId = new Map(crops.map((c) => [c.id, c]));
  const cellsByCrop = new Map<number, string[]>();
  for (const key of Object.keys(plan.planting)) {
    const id = plan.planting[key];
    const arr = cellsByCrop.get(id);
    if (arr) arr.push(key);
    else cellsByCrop.set(id, [key]);
  }
  const present = [...cellsByCrop.keys()];
  const keySets = new Map<number, Set<string>>(
    present.map((id) => [id, new Set(cellsByCrop.get(id))]),
  );

  const pairings: PlanPairing[] = [];
  const seen = new Set<string>();

  for (const aId of present) {
    const a = byId.get(aId);
    if (!a) continue;
    const antagonistIds = slugsToIds(a.antagonists, crops);
    const companionIds = slugsToIds(a.companions, crops);

    for (const bId of present) {
      if (aId === bId) continue;
      const kind: PlanPairing['kind'] | null = antagonistIds.has(bId)
        ? 'antagonist'
        : companionIds.has(bId)
          ? 'companion'
          : null;
      if (!kind) continue;
      const pairKey = `${Math.min(aId, bId)}:${Math.max(aId, bId)}:${kind}`;
      if (seen.has(pairKey)) continue;

      // Scan the smaller crop's cells against the other's cell set.
      const [scanId, againstId] =
        (cellsByCrop.get(aId)?.length ?? 0) <= (cellsByCrop.get(bId)?.length ?? 0)
          ? [aId, bId]
          : [bId, aId];
      const against = keySets.get(againstId);
      if (!against) continue;

      const touching: string[] = [];
      outer: for (const key of cellsByCrop.get(scanId) ?? []) {
        const [x, y] = parseKey(key);
        for (let dy = -ADJ_RADIUS_CELLS; dy <= ADJ_RADIUS_CELLS; dy++) {
          for (let dx = -ADJ_RADIUS_CELLS; dx <= ADJ_RADIUS_CELLS; dx++) {
            if (against.has(cellKey(x + dx, y + dy))) {
              touching.push(key);
              if (touching.length > 400) break outer; // highlight cap
              break;
            }
          }
        }
      }

      if (touching.length > 0) {
        seen.add(pairKey);
        const b = byId.get(bId);
        if (b) pairings.push({ a, b, kind, cells: touching });
      }
    }
  }

  // Antagonists first, then alphabetical — stable display order.
  return pairings.sort((p, q) =>
    p.kind !== q.kind ? (p.kind === 'antagonist' ? -1 : 1) : p.a.name.localeCompare(q.a.name),
  );
}

export function conflictCellSet(pairings: PlanPairing[]): Set<string> {
  const set = new Set<string>();
  for (const p of pairings) if (p.kind === 'antagonist') for (const c of p.cells) set.add(c);
  return set;
}

export const assetForCell = (plan: PlanState, key: string): GardenAsset | undefined => {
  const slug = plan.ground[key];
  return slug ? assetBySlug(slug) : undefined;
};
