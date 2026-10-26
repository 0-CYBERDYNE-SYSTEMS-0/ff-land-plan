// Starter layouts for the Plot Designer. Crop names resolve against the loaded
// catalog at apply time; equipment and growing-level ids stay local to each
// template so a template is deterministic and replaceable as one edit.

import type {
  ArchetypeId,
  EnvironmentAssetInstance,
  GrowingSpace,
  PlanSurface,
} from '@/types';

export interface TemplateTargetPlanting {
  growingSpaceId: string;
  levelId: string;
  /** "x,y" -> crop name exactly as spelled in the catalog. */
  planting: Record<string, string>;
  plantedAtDaysAgo?: number;
}

export interface GardenTemplate {
  id: string;
  name: string;
  description: string;
  /** Archetypes this layout was measured and placed for. */
  archetypes: ArchetypeId[];
  /** Canvas surface stamped only on legacy single-plan canvases. */
  surface?: PlanSurface;
  /** Canvas dimensions stamped on legacy plans and used for setup sizing. */
  widthM?: number;
  heightM?: number;
  /** "x,y" -> asset slug. */
  ground: Record<string, string>;
  /** "x,y" -> crop name exactly as spelled in the catalog. */
  planting: Record<string, string>;
  plantedAtDaysAgo?: Record<string, number>;
  /** Physical growing surfaces and installed equipment for world templates. */
  growingSpaces?: GrowingSpace[];
  instances?: EnvironmentAssetInstance[];
  /** Crop maps on elevated levels. Floor crops remain in `planting`. */
  targets?: TemplateTargetPlanting[];
}

const levelSet = (spaceId: string) => [
  { id: `${spaceId}:level:1`, label: 'Level 1', elevationM: 0.2 },
  { id: `${spaceId}:level:2`, label: 'Level 2', elevationM: 0.65 },
  { id: `${spaceId}:level:3`, label: 'Level 3', elevationM: 1.1 },
  { id: `${spaceId}:level:4`, label: 'Level 4', elevationM: 1.55 },
];
function rackTemplateSpace(
  id: string,
  label: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { space: GrowingSpace; instances: EnvironmentAssetInstance[]; targets: TemplateTargetPlanting[] } {
  const cellM = 0.25;
  const widthM = (x1 - x0 + 1) * cellM;
  const depthM = (y1 - y0 + 1) * cellM;
  const space: GrowingSpace = {
    id,
    label,
    kind: 'rack',
    x: x0 * cellM,
    y: y0 * cellM,
    widthM,
    depthM,
    levels: levelSet(id),
  };
  const instances: EnvironmentAssetInstance[] = [{
    id: `${id}:rack`,
    slug: 'plant-rack',
    x: space.x,
    y: space.y,
    widthM,
    depthM,
    mount: { kind: 'floor' },
  }];
  const lightsPerLevel = Math.ceil((widthM * depthM) / 0.5);
  const segmentWidthM = widthM / lightsPerLevel;
  for (const level of space.levels) {
    for (let index = 0; index < lightsPerLevel; index += 1) {
      instances.push({
        id: `${id}:light:${level.id}:${index + 1}`,
        slug: 'grow-light',
        x: space.x + index * segmentWidthM,
        y: space.y,
        widthM: segmentWidthM,
        depthM,
        mount: { kind: 'growing-level', growingSpaceId: id, levelId: level.id },
      });
    }
  }
  const cropCells = (crop: string, y: number): Record<string, string> => row(crop, x0 + 1, y, x1 - 1);
  return {
    space,
    instances,
    targets: [
      { growingSpaceId: id, levelId: space.levels[0]!.id, planting: cropCells('Lettuce', y0), plantedAtDaysAgo: 16 },
      { growingSpaceId: id, levelId: space.levels[2]!.id, planting: cropCells('Basil', y1), plantedAtDaysAgo: 21 },
    ],
  };
}

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

const warehouseRacks = [
  rackTemplateSpace('rack-west-1', 'West rack 1', 5, 2, 18, 3),
  rackTemplateSpace('rack-east-1', 'East rack 1', 28, 2, 45, 3),
  rackTemplateSpace('rack-west-2', 'West rack 2', 5, 12, 18, 13),
  rackTemplateSpace('rack-east-2', 'East rack 2', 28, 12, 45, 13),
  rackTemplateSpace('rack-west-3', 'West rack 3', 5, 22, 18, 23),
  rackTemplateSpace('rack-east-3', 'East rack 3', 28, 22, 45, 23),
  rackTemplateSpace('rack-west-4', 'West rack 4', 5, 32, 18, 33),
  rackTemplateSpace('rack-east-4', 'East rack 4', 28, 32, 45, 33),
];

const containerRack = rackTemplateSpace('container-rack-1', 'Container rack', 7, 3, 42, 4);

const greenhouseBench = (id: string, label: string, x: number, y: number, crop: string): {
  space: GrowingSpace;
  instances: EnvironmentAssetInstance[];
  target: TemplateTargetPlanting;
} => {
  const space: GrowingSpace = {
    id,
    label,
    kind: 'bench',
    x,
    y,
    widthM: 3,
    depthM: 0.75,
    levels: [{ id: `${id}:bench-top`, label: 'Bench top', elevationM: 0.58 }],
  };
  const level = space.levels[0]!;
  const lightCount = Math.ceil((space.widthM * space.depthM) / 0.5);
  const lightWidthM = space.widthM / lightCount;
  return {
    space,
    instances: [
      { id: `${id}:bench`, slug: 'grow-bench', x, y, widthM: 3, depthM: 0.75, mount: { kind: 'floor' } },
      ...Array.from({ length: lightCount }, (_, index) => ({
        id: `${id}:light:${index + 1}`,
        slug: 'grow-light',
        x: x + index * lightWidthM,
        y,
        widthM: lightWidthM,
        depthM: space.depthM,
        mount: { kind: 'growing-level' as const, growingSpaceId: id, levelId: level.id },
      })),
    ],
    target: {
      growingSpaceId: id,
      levelId: space.levels[0]!.id,
      planting: row(crop, Math.round(x / 0.25) + 1, Math.round(y / 0.25) + 1, Math.round((x + space.widthM) / 0.25) - 2),
      plantedAtDaysAgo: 18,
    },
  };
};

const greenhouseBenches = [
  greenhouseBench('bench-west', 'West bench', 0.75, 1.5, 'Tomato'),
  greenhouseBench('bench-east', 'East bench', 4.75, 1.5, 'Lettuce'),
];

const roomBench = greenhouseBench('room-bench', 'Grow bench', 0.5, 1, 'Lettuce');

export const templates: GardenTemplate[] = [
  {
    id: 'salad-garden',
    name: 'Salad Garden',
    description: 'Two raised beds and a gravel path — cut-and-come-again salads ready in weeks.',
    archetypes: ['garden-beds', 'greenhouse-glass'],
    ground: {
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
    archetypes: ['open-field', 'garden-beds'],
    ground: {
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
    archetypes: ['open-field', 'garden-beds'],
    ground: {
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
    archetypes: ['open-field', 'garden-beds'],
    ground: {
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
      '0,0': 'Pea', '0,2': 'Bush Bean', '2,0': 'Pole Bean', '2,1': 'Pole Bean', '2,2': 'Pole Bean',
      '5,0': 'Kale', '7,0': 'Broccoli', '6,2': 'Cabbage',
      '10,0': 'Carrot', '12,0': 'Beet', '11,2': 'Radish',
      '16,0': 'Tomato', '16,2': 'Pepper',
    },
  },
  {
    id: 'three-sisters-field',
    name: 'Three Sisters Field',
    description: 'A 6 m field of corn, pole beans and pumpkin — three crops growing together, ready to simulate.',
    archetypes: ['open-field'],
    ground: { ...bed('inground-bed', 0, 0, 23, 23) },
    planting: {
      ...block('Sweet Corn', 2, 2, 21, 3),
      ...block('Sweet Corn', 2, 10, 21, 11),
      ...block('Sweet Corn', 2, 18, 21, 19),
      ...row('Pole Bean', 2, 4, 21),
      ...row('Pole Bean', 2, 12, 21),
      ...row('Pole Bean', 2, 20, 21),
      '2,7': 'Pumpkin', '6,7': 'Pumpkin', '10,7': 'Pumpkin', '14,7': 'Pumpkin', '18,7': 'Pumpkin',
      '2,15': 'Pumpkin', '6,15': 'Pumpkin', '10,15': 'Pumpkin', '14,15': 'Pumpkin', '18,15': 'Pumpkin',
    },
    plantedAtDaysAgo: { 'Sweet Corn': 40, 'Pole Bean': 30, 'Pumpkin': 15 },
  },
  {
    id: 'tunnel-tomatoes',
    name: 'Tunnel Tomatoes',
    description: 'Three in-ground beds under trellis lines — tomatoes, peppers and heat-loving herbs.',
    archetypes: ['hoophouse'],
    surface: 'hoophouse',
    widthM: 10,
    heightM: 8,
    ground: {
      ...bed('inground-bed', 1, 2, 38, 8),
      ...bed('inground-bed', 1, 13, 38, 19),
      ...bed('inground-bed', 1, 24, 38, 26),
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
      ...row('Spinach', 2, 26, 37),
    },
    plantedAtDaysAgo: { Tomato: 35, Pepper: 28, Basil: 21, Spinach: 14 },
  },
  {
    id: 'cold-frame-salads',
    name: 'Cold Frame Salads',
    description: 'A compact low bed with hardy greens, clear of the south access opening.',
    archetypes: ['cold-frame'],
    widthM: 2,
    heightM: 1.5,
    ground: { ...bed('inground-bed', 1, 1, 6, 3) },
    planting: {
      ...row('Lettuce', 2, 1, 5),
      ...row('Spinach', 2, 2, 5),
      ...row('Radish', 2, 3, 5),
    },
    plantedAtDaysAgo: { Lettuce: 14, Spinach: 12, Radish: 8 },
  },
  {
    id: 'greenhouse-benches',
    name: 'Greenhouse Benches',
    description: 'Two accessible bench tops with a door aisle and protected tomatoes and greens.',
    archetypes: ['greenhouse-glass'],
    widthM: 8,
    heightM: 6,
    ground: {},
    planting: {},
    growingSpaces: greenhouseBenches.map(({ space }) => space),
    instances: greenhouseBenches.flatMap(({ instances }) => instances),
    targets: greenhouseBenches.map(({ target }) => target),
  },
  {
    id: 'tent-starters',
    name: 'Tent Starters',
    description: 'A grow tent with LED bars, fans and starter plants, leaving the south service strip clear.',
    archetypes: ['grow-tent'],
    surface: 'tent',
    widthM: 5,
    heightM: 5,
    ground: {
      ...bed('grow-tent', 4, 4, 15, 15),
      ...bed('seedling-tray', 8, 8, 9, 9),
    },
    planting: {
      ...row('Pepper', 6, 7, 13),
      ...row('Pepper', 6, 9, 13),
      ...row('Basil', 6, 11, 13),
      ...row('Basil', 6, 13, 13),
    },
    plantedAtDaysAgo: { Pepper: 28, Basil: 21 },
    instances: [
      { id: 'tent:light:1', slug: 'grow-light', x: 1.75, y: 1.25, widthM: 0.5, depthM: 0.25, mount: { kind: 'environment' } },
      { id: 'tent:light:2', slug: 'grow-light', x: 2.75, y: 1.25, widthM: 0.5, depthM: 0.25, mount: { kind: 'environment' } },
      { id: 'tent:fan:1', slug: 'clip-fan', x: 3.75, y: 2, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment' } },
    ],
  },
  {
    id: 'grow-room-benches',
    name: 'Grow Room Bench',
    description: 'An installed bench with lettuce and basil targets inside a serviceable grow room.',
    archetypes: ['grow-room'],
    widthM: 4,
    heightM: 3,
    ground: {},
    planting: {},
    growingSpaces: [roomBench.space],
    instances: roomBench.instances,
    targets: [roomBench.target],
  },
  {
    id: 'warehouse-greens',
    name: 'Warehouse Greens',
    description: 'Four rack rows with four selectable tiers, aisle clearance, mounted LEDs, HVAC and CO₂ equipment.',
    archetypes: ['warehouse-vertical'],
    surface: 'warehouse',
    widthM: 12,
    heightM: 10,
    ground: {
      '47,0': 'crate-stack',
    },
    planting: {},
    growingSpaces: warehouseRacks.map(({ space }) => space),
    instances: [
      ...warehouseRacks.flatMap(({ instances }) => instances),
      { id: 'warehouse:fan:west', slug: 'clip-fan', x: 0.25, y: 1.5, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment' } },
      { id: 'warehouse:fan:east', slug: 'clip-fan', x: 11.25, y: 3.5, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment' } },
      { id: 'warehouse:hvac:west', slug: 'hvac-unit', x: 0, y: 8.75, widthM: 1, depthM: 0.4, mount: { kind: 'environment' } },
      { id: 'warehouse:hvac:east', slug: 'hvac-unit', x: 10.75, y: 8.75, widthM: 1, depthM: 0.4, mount: { kind: 'environment' } },
      { id: 'warehouse:co2', slug: 'co2-tank', x: 11.25, y: 0, widthM: 0.5, depthM: 0.5, mount: { kind: 'floor' } },
      { id: 'warehouse:nursery', slug: 'seedling-tray', x: 11, y: 7.5, widthM: 0.6, depthM: 0.3, mount: { kind: 'floor' } },
    ],
    targets: warehouseRacks.flatMap(({ targets }) => targets),
  },
  {
    id: 'container-farm-greens',
    name: 'Container Farm Greens',
    description: 'A narrow four-tier rack, planted on two levels and lit by mounted LED bars; the service strip stays open.',
    archetypes: ['container-farm'],
    widthM: 11.5,
    heightM: 2.25,
    ground: {},
    planting: {},
    growingSpaces: [containerRack.space],
    instances: [
      ...containerRack.instances,
      { id: 'container:co2', slug: 'co2-tank', x: 10.75, y: 0, widthM: 0.5, depthM: 0.5, mount: { kind: 'environment' } },
      { id: 'container:hvac', slug: 'hvac-unit', x: 10.25, y: 1.6, widthM: 1, depthM: 0.4, mount: { kind: 'environment' } },
    ],
    targets: containerRack.targets,
  },
];
