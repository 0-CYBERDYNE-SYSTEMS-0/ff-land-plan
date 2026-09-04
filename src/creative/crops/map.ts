/**
 * Lane B crop mapping — every catalog crop (src/data/crops.ts) → an archetype
 * plus palette overrides / scale / structural variant.
 *
 * Keep in sync with the crop library: keys are the catalog `name` field.
 * When a new crop lands in src/data/crops.ts, add a row here.
 */
import * as THREE from 'three';
import { PALETTE } from '@/creative/voxel';
import type { CropPalette } from './shared';
import { makeTomato, TOMATO_PAL } from './tomato';
import {
  makeLeafyHead, makeBrassica, makeGreensOpen,
  LEAFYHEAD_PAL, BRASSICA_PAL, GREENS_PAL,
  CAULIFLOWER_PAL, CABBAGE_PAL, KALE_PAL, CHARD_PAL,
} from './heads';
import {
  makeWheat, makeCorn, WHEAT_PAL, CORN_PAL,
} from './grains';
import {
  makeRootCarrot, makeAllium, makePotato,
  CARROT_PAL, ALLIUM_PAL, POTATO_PAL,
  RADISH_PAL, BEET_PAL, GARLIC_PAL, LEEK_PAL,
} from './roots';
import {
  makeCucurbit, makeLegumeTrellis, makeBushBean, makeStrawberry,
  CUCURBIT_PAL, LEGUME_PAL, BUSHBEAN_PAL, STRAWBERRY_PAL,
  ZUCCHINI_PAL, MELON_PAL, CUCUMBER_PAL, PEA_PAL,
} from './vines';
import {
  makeHerbClump, makeHerbShrub, HERBCLUMP_PAL, HERBSHRUB_PAL,
  DILL_PAL, PARSLEY_PAL, SAGE_PAL, THYME_PAL, CHIVES_PAL,
} from './herbs';
import { makeBerryBush, makeAppleTree, BERRYBUSH_PAL, APPLETREE_PAL, BLUEBERRY_PAL } from './bushes';
import { makeMushroom, MUSHROOM_PAL } from './mushrooms';

export type ArchetypeId =
  | 'tomato' | 'leafy-head' | 'wheat' | 'corn' | 'root-carrot' | 'allium'
  | 'potato' | 'brassica' | 'greens-open' | 'cucurbit-vine' | 'legume-trellis'
  | 'bush-bean' | 'strawberry' | 'herb-clump' | 'herb-shrub' | 'berry-bush'
  | 'apple-tree' | 'mushroom';

export interface CropAssetMapping {
  archetype: ArchetypeId;
  palette?: Partial<CropPalette>;
  /** whole-plant size variant for small/large cultivars (uniform scale). */
  scale?: number;
  /** structural variant understood by some builders ('feathery', 'mat', 'tubes'). */
  variant?: 'feathery' | 'mat' | 'tubes';
}

/** Default palette per archetype — overrides layer on top of these. */
export const ARCHETYPE_DEFAULTS: Record<ArchetypeId, CropPalette> = {
  tomato: TOMATO_PAL,
  'leafy-head': LEAFYHEAD_PAL,
  wheat: WHEAT_PAL,
  corn: CORN_PAL,
  'root-carrot': CARROT_PAL,
  allium: ALLIUM_PAL,
  potato: POTATO_PAL,
  brassica: BRASSICA_PAL,
  'greens-open': GREENS_PAL,
  'cucurbit-vine': CUCURBIT_PAL,
  'legume-trellis': LEGUME_PAL,
  'bush-bean': BUSHBEAN_PAL,
  strawberry: STRAWBERRY_PAL,
  'herb-clump': HERBCLUMP_PAL,
  'herb-shrub': HERBSHRUB_PAL,
  'berry-bush': BERRYBUSH_PAL,
  'apple-tree': APPLETREE_PAL,
  mushroom: MUSHROOM_PAL,
};

type BuildFn = (stage: number, pal: CropPalette, opts?: { variant?: 'feathery' | 'mat' | 'tubes' }) => THREE.Object3D;

const BUILDERS: Record<ArchetypeId, BuildFn> = {
  tomato: (s, p) => makeTomato(s, p),
  'leafy-head': (s, p) => makeLeafyHead(s, p),
  wheat: (s, p) => makeWheat(s, p),
  corn: (s, p) => makeCorn(s, p),
  'root-carrot': (s, p) => makeRootCarrot(s, p),
  allium: (s, p) => makeAllium(s, p),
  potato: (s, p) => makePotato(s, p),
  brassica: (s, p) => makeBrassica(s, p),
  'greens-open': (s, p) => makeGreensOpen(s, p),
  'cucurbit-vine': (s, p) => makeCucurbit(s, p),
  'legume-trellis': (s, p) => makeLegumeTrellis(s, p),
  'bush-bean': (s, p) => makeBushBean(s, p),
  strawberry: (s, p) => makeStrawberry(s, p),
  'herb-clump': (s, p, o) => makeHerbClump(s, p, o ?? {}),
  'herb-shrub': (s, p, o) => makeHerbShrub(s, p, o ?? {}),
  'berry-bush': (s, p) => makeBerryBush(s, p),
  'apple-tree': (s, p) => makeAppleTree(s, p),
  mushroom: (s, p) => makeMushroom(s, p),
};

export const cropAssetMap: Record<string, CropAssetMapping> = {
  // --- vegetables ---------------------------------------------------------
  Tomato: { archetype: 'tomato' },
  Pepper: { archetype: 'tomato', palette: { fruit: PALETTE.pepperRed, unripe: 0x7fa04a, accent: PALETTE.flowerWhite } },
  Eggplant: { archetype: 'tomato', palette: { fruit: PALETTE.eggplant, unripe: 0x8a7aa8, mature: 0x4a7038 } },
  Lettuce: { archetype: 'leafy-head' },
  Cabbage: { archetype: 'leafy-head', palette: CABBAGE_PAL },
  Cauliflower: { archetype: 'leafy-head', palette: CAULIFLOWER_PAL },
  Wheat: { archetype: 'wheat' },
  'Sweet Corn': { archetype: 'corn' },
  Carrot: { archetype: 'root-carrot' },
  Beet: { archetype: 'root-carrot', palette: BEET_PAL },
  Radish: { archetype: 'root-carrot', palette: RADISH_PAL, scale: 0.85 },
  Onion: { archetype: 'allium' },
  Garlic: { archetype: 'allium', palette: GARLIC_PAL, scale: 0.85 },
  Leek: { archetype: 'allium', palette: LEEK_PAL },
  Potato: { archetype: 'potato' },
  Broccoli: { archetype: 'brassica' },
  Kale: { archetype: 'brassica', palette: KALE_PAL },
  Spinach: { archetype: 'greens-open', scale: 0.9 },
  Arugula: { archetype: 'greens-open', palette: { mature: 0x4a8a3a, light: 0x86c05e }, scale: 0.85 },
  'Swiss Chard': { archetype: 'greens-open', palette: CHARD_PAL, scale: 1.1 },
  Pumpkin: { archetype: 'cucurbit-vine', scale: 1.15 },
  Zucchini: { archetype: 'cucurbit-vine', palette: ZUCCHINI_PAL },
  Melon: { archetype: 'cucurbit-vine', palette: MELON_PAL },
  Cucumber: { archetype: 'cucurbit-vine', palette: CUCUMBER_PAL },
  'Pole Bean': { archetype: 'legume-trellis' },
  Pea: { archetype: 'legume-trellis', palette: PEA_PAL, scale: 0.9 },
  'Bush Bean': { archetype: 'bush-bean' },
  Strawberry: { archetype: 'strawberry' },

  // --- herbs ---------------------------------------------------------------
  Basil: { archetype: 'herb-clump' },
  Parsley: { archetype: 'herb-clump', palette: PARSLEY_PAL },
  Cilantro: { archetype: 'herb-clump', palette: { mature: 0x5a9448, accent: 0xf0ecdc } },
  Dill: { archetype: 'herb-clump', palette: DILL_PAL, variant: 'feathery' },
  Mint: { archetype: 'herb-clump', palette: { mature: 0x2e6e3a, dark: 0x1f5028, accent: 0xd88ac9 } },
  Rosemary: { archetype: 'herb-shrub' },
  Thyme: { archetype: 'herb-shrub', palette: THYME_PAL, variant: 'mat', scale: 0.85 },
  Sage: { archetype: 'herb-shrub', palette: SAGE_PAL },
  Oregano: { archetype: 'herb-shrub', palette: { mature: 0x6a8a58, accent: 0xcfa9d8 }, scale: 0.9 },
  Chives: { archetype: 'herb-shrub', palette: CHIVES_PAL, variant: 'tubes' },

  // --- fruit ----------------------------------------------------------------
  Apple: { archetype: 'apple-tree' },
  Raspberry: { archetype: 'berry-bush' },
  Blueberry: { archetype: 'berry-bush', palette: BLUEBERRY_PAL, scale: 0.95 },

  // --- flowers & companions --------------------------------------------------
  Marigold: { archetype: 'herb-clump', palette: { mature: 0x5a8a40, accent: PALETTE.flowerOrange, fruit: PALETTE.flowerYellow } },
  Nasturtium: {
    archetype: 'cucurbit-vine', scale: 0.55,
    palette: { mature: 0x6a9a4a, accent: PALETTE.flowerOrange, fruit: PALETTE.flowerRed, unripe: PALETTE.flowerOrange },
  },
  Sunflower: { archetype: 'corn', palette: { accent: 0xe8b62c, fruit: 0xf2c53d, unripe: 0xd9c05a } },
  Borage: { archetype: 'greens-open', palette: { mature: 0x5a7a52, accent: 0x6f86d8, fruit: 0x8296e0 } },

  // --- cover crops ------------------------------------------------------------
  'Crimson Clover': { archetype: 'greens-open', scale: 0.7, palette: { mature: 0x4f8a44, accent: 0xa93226, fruit: 0xc23b2c } },
  'Winter Rye': { archetype: 'wheat', palette: { young: 0x84b062, mature: 0x5c8450, fruit: 0xc9ab62 } },

  // --- fungi -------------------------------------------------------------------
  'Oyster Mushroom': { archetype: 'mushroom', palette: { fruit: 0xd9d2c0, unripe: 0xb8b2a0, mature: 0xd2cbb8, accent: 0xb6ab90 } },
  'Button Mushroom': { archetype: 'mushroom', palette: { fruit: 0xede7da, unripe: 0xcfc6b4, mature: 0xe2dccd, accent: 0xd8a88c, stem: 0xe8e0d2 } },
  'Shiitake': { archetype: 'mushroom', palette: { fruit: 0x8a5a33, unripe: 0x9c6b44, mature: 0x7a4f2c, dark: 0x543620, light: 0xb07a4a } },
};

/** Build the plant for a catalog crop name at a growth stage (null if unmapped). */
export function makeCropFor(name: string, stage: number): THREE.Object3D | null {
  const m = cropAssetMap[name];
  if (!m || stage < 0 || stage > 5) return null;
  const pal: CropPalette = { ...ARCHETYPE_DEFAULTS[m.archetype], ...m.palette };
  const obj = BUILDERS[m.archetype](stage, pal, m.variant ? { variant: m.variant } : undefined);
  if (m.scale !== undefined && m.scale !== 1) obj.scale.setScalar(m.scale);
  return obj;
}
