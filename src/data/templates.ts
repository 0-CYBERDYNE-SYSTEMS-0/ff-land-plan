// Starter garden templates for the Plot Designer (cold-start aid). Data only —
// no logic. `ground` values MUST be asset slugs that exist in `assetLibrary`
// (src/data/assets.ts) AND be allowed on the template's `surface` (paint-time
// gating is bypassed by templates — be correct by construction);
// `planting` values are crop NAMES resolved against the loaded catalog at
// apply time (see TemplatesCard) so custom crops and future catalog edits
// never invalidate this file. Layouts use realistic 0.25 m-cell spacing;
// garden designs stay under ~60 cells, the field/enclosed designs are larger.

import type { PlanSurface } from '@/types';

export interface GardenTemplate {
  id: string;
  name: string;
  description: string;
  /** Canvas surface stamped onto the plan at apply time (enclosed templates
   *  carry their own shell — see widthM/heightM). Omitted = keep current. */
  surface?: PlanSurface;
  /** Canvas width in meters stamped at apply time; omitted = keep current. */
  widthM?: number;
  /** Canvas height in meters stamped at apply time; omitted = keep current. */
  heightM?: number;
  /** "x,y" -> asset slug (existing `assetLibrary` slugs only). */
  ground: Record<string, string>;
  /** "x,y" -> crop name exactly as spelled in the catalog. */
  planting: Record<string, string>;
  /** "Crop name" -> days before today to backdate that crop's cells at apply
   *  time, so a template opens with crops already at different growth stages. */
  plantedAtDaysAgo?: Record<string, number>;
}

export const templates: GardenTemplate[] = [
  {
    id: 'salad-garden',
    name: 'Salad Garden',
    description: 'Two 1 m raised beds and a gravel path — cut-and-come-again salads ready in weeks.',
    ground: {
      // Left bed (x0–3), right bed (x6–9), gravel path between (x4–5).
      ...bed('raised-bed', 0, 0, 3, 4),
      ...bed('raised-bed', 6, 0, 9, 4),
      ...bed('path-gravel', 4, 0, 5, 4),
    },
    planting: {
      ...row('Lettuce', 0, 0, 3),
      ...row('Spinach', 0, 2, 3),
      ...row('Radish', 0, 4, 3),
      ...row('Arugula', 6, 0, 9),
      ...row('Lettuce', 6, 2, 9),
      ...row('Spinach', 6, 4, 9),
    },
  },
  {
    id: 'salsa-bed',
    name: 'Salsa Bed',
    description: 'Tomato, pole beans climbing a trellis, onions and cilantro beside the compost bays.',
    ground: {
      // In-ground bed (x0–6 plus x7,y4) with a climbable trellis column at
      // x7,y0–2 (trellis is `plantable`, so beans paint straight onto it),
      // compost bays beside it.
      ...bed('inground-bed', 0, 0, 6, 4),
      '7,0': 'trellis', '7,1': 'trellis', '7,2': 'trellis', '7,4': 'inground-bed',
      '9,0': 'compost-bin', '9,1': 'compost-bin',
    },
    planting: {
      ...row('Onion', 0, 0, 2),
      '5,2': 'Tomato',
      ...row('Cilantro', 0, 3, 2),
      '7,0': 'Pole Bean', '7,1': 'Pole Bean', '7,2': 'Pole Bean',
    },
  },
  {
    id: 'pollinator-strip',
    name: 'Pollinator Strip',
    description: 'Marigold and borage with flowering herbs along a woodchip path — bee heaven.',
    ground: {
      // Two-metre strip (x0–11, y0–1) over a woodchip path (y2).
      ...bed('inground-bed', 0, 0, 11, 1),
      ...bed('path-woodchip', 0, 2, 11, 2),
    },
    planting: {
      '0,0': 'Marigold', '3,0': 'Borage', '6,0': 'Marigold', '9,0': 'Borage',
      '1,1': 'Chives', '4,1': 'Dill', '7,1': 'Oregano', '10,1': 'Thyme',
    },
  },
  {
    id: 'four-bed-rotation',
    name: 'Four-Bed Rotation',
    description: 'Four raised beds rotate families — legumes, brassicas, roots, fruiting — with paths and a bean trellis.',
    ground: {
      // Beds at x0–2 / x5–7 / x10–12 / x15–17 (y0–2), gravel paths between,
      // trellis closing the legume bed's east side.
      ...bed('raised-bed', 0, 0, 1, 2),
      ...bed('raised-bed', 5, 0, 7, 2),
      ...bed('raised-bed', 10, 0, 12, 2),
      ...bed('raised-bed', 15, 0, 17, 2),
      ...bed('path-gravel', 3, 0, 4, 2),
      ...bed('path-gravel', 8, 0, 9, 2),
      ...bed('path-gravel', 13, 0, 14, 2),
      '2,0': 'trellis', '2,1': 'trellis', '2,2': 'trellis',
    },
    planting: {
      // Legumes (bed 1)
      '0,0': 'Pea', '0,2': 'Bush Bean',
      '2,0': 'Pole Bean', '2,1': 'Pole Bean', '2,2': 'Pole Bean',
      // Brassicas (bed 2)
      '5,0': 'Kale', '7,0': 'Broccoli', '6,2': 'Cabbage',
      // Roots (bed 3)
      '10,0': 'Carrot', '12,0': 'Beet', '11,2': 'Radish',
      // Fruiting (bed 4)
      '16,0': 'Tomato', '16,2': 'Pepper',
    },
  },
  {
    id: 'three-sisters-field',
    name: 'Three Sisters Field',
    description: 'A 6 m field of corn, pole beans and pumpkin — three crops growing together, ready to simulate.',
    ground: {
      ...bed('inground-bed', 0, 0, 23, 23),
    },
    planting: {
      // Corn blocks (wind-pollination-friendly) in three bands.
      ...block('Sweet Corn', 2, 2, 21, 3),
      ...block('Sweet Corn', 2, 10, 21, 11),
      ...block('Sweet Corn', 2, 18, 21, 19),
      // Pole beans climbing beside each corn band.
      ...row('Pole Bean', 2, 4, 21),
      ...row('Pole Bean', 2, 12, 21),
      ...row('Pole Bean', 2, 20, 21),
      // Pumpkin ground cover between bands, spaced ~1 m apart.
      '2,7': 'Pumpkin', '6,7': 'Pumpkin', '10,7': 'Pumpkin', '14,7': 'Pumpkin', '18,7': 'Pumpkin',
      '2,15': 'Pumpkin', '6,15': 'Pumpkin', '10,15': 'Pumpkin', '14,15': 'Pumpkin', '18,15': 'Pumpkin',
    },
    plantedAtDaysAgo: { 'Sweet Corn': 40, 'Pole Bean': 30, 'Pumpkin': 15 },
  },
  {
    id: 'tunnel-tomatoes',
    name: 'Tunnel Tomatoes',
    description: 'A 10×8 m high tunnel: three in-ground beds under trellis lines — tomatoes, peppers and heat-loving herbs.',
    surface: 'hoophouse',
    widthM: 10,
    heightM: 8,
    ground: {
      // Three in-ground beds (~1.75 m wide) running the tunnel length with
      // ~1.25 m aisles; a trellis line at the head of each bed carries the vines.
      ...bed('inground-bed', 1, 2, 38, 8),
      ...bed('inground-bed', 1, 13, 38, 19),
      ...bed('inground-bed', 1, 24, 38, 30),
      ...bed('trellis', 1, 2, 38, 2),
      ...bed('trellis', 1, 13, 38, 13),
      ...bed('trellis', 1, 24, 38, 24),
    },
    planting: {
      ...row('Tomato', 2, 3, 37),
      ...row('Pepper', 2, 6, 37),
      ...row('Tomato', 2, 14, 37),
      ...row('Basil', 2, 17, 37),
      ...row('Pepper', 2, 25, 37),
      ...row('Lettuce', 2, 28, 37),
    },
    plantedAtDaysAgo: { Tomato: 35, Pepper: 28, Basil: 21, Lettuce: 14 },
  },
  {
    id: 'warehouse-greens',
    name: 'Warehouse Greens',
    description: 'A 12×10 m vertical-farm hall: glowing rack rows of lettuce and basil between taped aisles.',
    surface: 'warehouse',
    widthM: 12,
    heightM: 10,
    ground: {
      // Five 0.5 m rack rows (2 cells deep) with ~2 m aisles; climate gear at
      // the walls, a seedling-tray nursery and a CO2 tank by the corners.
      ...bed('plant-rack', 2, 2, 45, 3),
      ...bed('plant-rack', 2, 10, 45, 11),
      ...bed('plant-rack', 2, 18, 45, 19),
      ...bed('plant-rack', 2, 26, 45, 27),
      ...bed('plant-rack', 2, 34, 45, 35),
      ...bed('clip-fan', 0, 5, 0, 5),
      ...bed('clip-fan', 47, 22, 47, 22),
      ...bed('hvac-unit', 0, 37, 3, 37),
      ...bed('hvac-unit', 44, 37, 47, 37),
      ...bed('co2-tank', 46, 0, 47, 0),
      ...bed('seedling-tray', 46, 30, 47, 31),
    },
    planting: {
      ...row('Lettuce', 2, 2, 45),
      ...row('Basil', 2, 3, 45),
      ...row('Lettuce', 2, 10, 45),
      ...row('Lettuce', 2, 11, 45),
      ...row('Basil', 2, 18, 45),
      ...row('Basil', 2, 19, 45),
      ...row('Lettuce', 2, 26, 45),
      ...row('Lettuce', 2, 27, 45),
      ...row('Basil', 2, 34, 45),
      ...row('Lettuce', 2, 35, 45),
    },
    plantedAtDaysAgo: { Lettuce: 14, Basil: 21 },
  },
  {
    id: 'tent-starters',
    name: 'Tent Starters',
    description: 'A 5×5 m grow tent: peppers and basil under the LED bar, seedling trays hardening off by the door.',
    surface: 'tent',
    widthM: 5,
    heightM: 5,
    ground: {
      // 3×3 m grow-tent footprint mid-canvas, an LED bar over the canopy,
      // seedling trays staged in the near corner.
      ...bed('grow-tent', 4, 4, 15, 15),
      ...bed('grow-light', 4, 3, 15, 3),
      ...bed('seedling-tray', 1, 1, 2, 1),
      ...bed('seedling-tray', 1, 3, 2, 3),
    },
    planting: {
      ...row('Pepper', 6, 7, 13),
      ...row('Pepper', 6, 9, 13),
      ...row('Basil', 6, 11, 13),
      ...row('Basil', 6, 13, 13),
    },
    plantedAtDaysAgo: { Pepper: 28, Basil: 21 },
  },
];

// --- key helpers (module-private; keep template literals terse) --------------

function bed(slug: string, x0: number, y0: number, x1: number, y1: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out[`${x},${y}`] = slug;
  }
  return out;
}

function row(cropName: string, x0: number, y: number, x1: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let x = x0; x <= x1; x++) out[`${x},${y}`] = cropName;
  return out;
}

function block(cropName: string, x0: number, y0: number, x1: number, y1: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) out[`${x},${y}`] = cropName;
  }
  return out;
}
