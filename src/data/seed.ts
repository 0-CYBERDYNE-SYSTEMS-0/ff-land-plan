// First-run seed data for the persistent store. Crops come from the real
// library in data/crops.ts; weather and alerts are live (Open-Meteo) and are
// not seeded. Legacy voxel cells remain only for the Monitoring page.

import type {
  Farm,
  FarmCell,
  NdviEstimate,
  Sensor,
  SensorReading,
  Simulation,
  PlanState,
} from '@/types';

// --- Farms ---------------------------------------------------------------

export const seedFarms: Farm[] = [
  {
    id: 1,
    name: 'North Meadow',
    description: 'Mixed vegetable plot near the creek',
    lat: 45.5231,
    lng: -122.6765,
    areHa: 2.4,
    soilType: 'loam',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
  },
  {
    id: 2,
    name: 'South Wheat Field',
    description: 'Winter wheat, drained lowland',
    lat: 45.5101,
    lng: -122.6901,
    areHa: 8.1,
    soilType: 'clay',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 200).toISOString(),
  },
  {
    id: 3,
    name: 'Backyard Homestead',
    description: 'Suburban backyard: raised beds, greenhouse, coop and an orchard',
    lat: 45.5231,
    lng: -122.6765,
    areHa: 0.025,
    soilType: 'loam',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  },
  {
    id: 4,
    name: 'Market Field',
    description: 'Row-crop field with polytunnels, orchard and grain blocks',
    lat: 45.5101,
    lng: -122.6901,
    areHa: 0.096,
    soilType: 'clay',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(),
  },
  {
    id: 5,
    name: 'Grow Tent — Room 1',
    description: 'Inside a 6×5 m tent: racks, NFT channels and LED runs',
    lat: 45.5301,
    lng: -122.6601,
    areHa: 0.003,
    soilType: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
  },
  {
    id: 6,
    name: 'Mushroom Warehouse',
    description: 'Sealed indoor room — vertical racks of oyster, button and shiitake',
    lat: 45.5401,
    lng: -122.6401,
    areHa: 0.01,
    soilType: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
  },
  {
    id: 7,
    name: 'Greenhouse Range',
    description: 'Glasshouse benches and NFT channels under the sun and LEDs',
    lat: 45.5451,
    lng: -122.6301,
    areHa: 0.007,
    soilType: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
  },
  {
    id: 8,
    name: 'High Tunnel Tomatoes',
    description: 'A 10×8 m passive poly high tunnel: trellised tomatoes and peppers in ground soil',
    lat: 45.5281,
    lng: -122.6815,
    areHa: 0.008,
    soilType: 'loam',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
  },
  {
    id: 9,
    name: 'Vertical Greens Warehouse',
    description: 'A sealed 12×10 m vertical-farm hall of glowing rack rows — lettuce and basil year-round',
    lat: 45.5521,
    lng: -122.6201,
    areHa: 0.012,
    soilType: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
  },
];

// --- Plot plans (designer showcase) -----------------------------------------

function planKey(x: number, y: number): string {
  return `${x},${y}`;
}

function fillGround(plan: PlanState, x: number, y: number, w: number, h: number, assetSlug: string) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      plan.ground[planKey(xx, yy)] = assetSlug;
    }
  }
}

function fillCrop(plan: PlanState, x: number, y: number, w: number, h: number, cropId: number) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      plan.planting[planKey(xx, yy)] = cropId;
    }
  }
}

function buildNorthMeadowPlan(): PlanState {
  const plan: PlanState = {
    farmId: 1,
    widthM: 18,
    heightM: 12,
    cellM: 0.25,
    allowOutsideBeds: false,
    planting: {},
    ground: {},
    updatedAt: new Date().toISOString(),
  };

  // Circulation and infrastructure.
  fillGround(plan, 0, 0, 72, 3, 'path-woodchip');
  fillGround(plan, 0, 32, 72, 3, 'path-woodchip');
  fillGround(plan, 17, 0, 3, 48, 'path-gravel');
  fillGround(plan, 34, 0, 3, 48, 'path-gravel');
  fillGround(plan, 58, 4, 8, 8, 'shed');
  fillGround(plan, 58, 14, 5, 5, 'compost-bin');
  fillGround(plan, 64, 14, 3, 3, 'rain-barrel');
  fillGround(plan, 58, 22, 8, 6, 'pond');
  fillGround(plan, 58, 31, 3, 3, 'beehive');
  fillGround(plan, 61, 31, 8, 10, 'chicken-coop');
  fillGround(plan, 5, 36, 12, 10, 'fruit-tree');

  // Plantable growing structures.
  fillGround(plan, 3, 5, 12, 9, 'raised-bed');
  fillGround(plan, 3, 18, 12, 9, 'raised-bed');
  fillGround(plan, 21, 5, 12, 9, 'raised-bed');
  fillGround(plan, 21, 18, 12, 9, 'inground-bed');
  fillGround(plan, 39, 5, 15, 20, 'greenhouse');
  fillGround(plan, 36, 29, 18, 8, 'polytunnel');
  fillGround(plan, 15, 5, 1, 9, 'trellis');
  fillGround(plan, 33, 18, 1, 9, 'trellis');

  // Bed 1: tomato guild.
  fillCrop(plan, 4, 6, 5, 6, 1); // tomato
  fillCrop(plan, 9, 6, 3, 6, 5); // basil
  fillCrop(plan, 12, 6, 2, 6, 42); // marigold

  // Bed 2: quick spring salad succession.
  fillCrop(plan, 4, 19, 4, 6, 2); // lettuce
  fillCrop(plan, 8, 19, 3, 6, 9); // carrot
  fillCrop(plan, 11, 19, 3, 6, 11); // radish

  // Bed 3: visible pairing conflict for QA (tomato next to kale).
  fillCrop(plan, 22, 6, 5, 6, 1); // tomato
  fillCrop(plan, 27, 6, 5, 6, 18); // kale

  // Bed 4: trellised cucumbers and legumes.
  fillCrop(plan, 22, 19, 4, 6, 22); // cucumber
  fillCrop(plan, 26, 19, 3, 6, 27); // bush bean
  fillCrop(plan, 29, 19, 3, 6, 29); // pea

  // Greenhouse: tender crops.
  fillCrop(plan, 41, 7, 5, 7, 6); // pepper
  fillCrop(plan, 46, 7, 5, 7, 1); // tomato
  fillCrop(plan, 41, 15, 4, 6, 5); // basil
  fillCrop(plan, 45, 15, 4, 6, 15); // spinach

  // Polytunnel: warm-season cucurbits and flowers.
  fillCrop(plan, 38, 31, 5, 4, 23); // zucchini
  fillCrop(plan, 43, 31, 4, 4, 43); // nasturtium
  fillCrop(plan, 47, 31, 5, 4, 45); // borage

  return plan;
}

function buildSouthWheatPlan(): PlanState {
  const plan: PlanState = {
    farmId: 2,
    widthM: 40,
    heightM: 24,
    cellM: 0.25,
    allowOutsideBeds: false,
    planting: {},
    ground: {},
    updatedAt: new Date().toISOString(),
    plantedAt: {},
  };

  // --- Paths and fences ---
  // North woodchip path (row 0-3)
  fillGround(plan, 0, 0, 160, 4, 'path-woodchip');
  // South woodchip path (row 91-95)
  fillGround(plan, 0, 91, 160, 5, 'path-woodchip');
  // Central gravel path (row 45-49)
  fillGround(plan, 0, 45, 160, 5, 'path-gravel');
  // West fence line (col 0-3)
  fillGround(plan, 0, 4, 4, 87, 'fence');
  // East fence line (col 152-155)
  fillGround(plan, 152, 4, 4, 87, 'fence');
  // Inter-zone paths
  fillGround(plan, 36, 4, 4, 41, 'path-woodchip');   // between Zone A and B
  fillGround(plan, 73, 4, 4, 41, 'path-woodchip');   // between Zone B and C
  fillGround(plan, 110, 4, 4, 41, 'path-woodchip');  // between Zone C and D
  fillGround(plan, 147, 4, 4, 41, 'path-woodchip');  // between Zone D and east fence

  // --- Infrastructure (north edge, row 0-3) ---
  fillGround(plan, 58, 0, 9, 4, 'shed');           // shed 58-66, 0-3
  fillGround(plan, 58, 4, 6, 6, 'compost-bin');    // compost 58-63, 4-9
  fillGround(plan, 64, 4, 3, 6, 'rain-barrel');    // rain barrel 64-66, 4-9
  fillGround(plan, 58, 11, 3, 3, 'beehive');       // beehive 58-60, 11-13
  fillGround(plan, 62, 11, 5, 3, 'beehive');       // beehive 62-66, 11-13

  // --- Water feature: pond at southeast corner ---
  fillGround(plan, 136, 78, 20, 16, 'pond');
  // Irrigation lines radiating from pond
  fillGround(plan, 130, 82, 6, 2, 'path-gravel');
  fillGround(plan, 136, 74, 2, 4, 'path-gravel');
  fillGround(plan, 156, 82, 4, 2, 'path-gravel');

  // --- Livestock: chicken coop + run on east side ---
  fillGround(plan, 152, 50, 8, 12, 'chicken-coop');
  fillGround(plan, 152, 62, 8, 16, 'chicken-coop');

  // --- Orchard: 4 fruit trees on south edge ---
  fillGround(plan, 108, 80, 6, 10, 'fruit-tree');   // tree 1
  fillGround(plan, 118, 80, 6, 10, 'fruit-tree');  // tree 2
  fillGround(plan, 128, 80, 6, 10, 'fruit-tree');  // tree 3
  fillGround(plan, 138, 80, 6, 10, 'fruit-tree');  // tree 4

  // --- Zone A: Brassicas (col 4-35, row 4-44) ---
  // 4 raised beds with paths between
  fillGround(plan, 4, 4, 32, 8, 'raised-bed');     // bed 1 (row 4-11)
  fillGround(plan, 4, 13, 32, 8, 'raised-bed');    // bed 2 (row 13-20)
  fillGround(plan, 4, 22, 32, 8, 'raised-bed');    // bed 3 (row 22-29)
  fillGround(plan, 4, 31, 32, 8, 'raised-bed');    // bed 4 (row 31-38)
  // Path between beds
  fillGround(plan, 4, 12, 32, 1, 'path-woodchip');
  fillGround(plan, 4, 21, 32, 1, 'path-woodchip');
  fillGround(plan, 4, 30, 32, 1, 'path-woodchip');
  // Crops in Zone A
  fillCrop(plan, 5, 5, 14, 6, 20);   // cabbage (bed 1 left)
  fillCrop(plan, 19, 5, 2, 6, 12);   // onion border
  fillCrop(plan, 21, 5, 14, 6, 19);  // broccoli (bed 1 right)
  fillCrop(plan, 5, 14, 14, 6, 18);   // kale (bed 2 left)
  fillCrop(plan, 19, 14, 2, 6, 12);  // onion border
  fillCrop(plan, 21, 14, 14, 6, 21); // cauliflower (bed 2 right)
  fillCrop(plan, 5, 23, 14, 6, 20);   // cabbage (bed 3 left)
  fillCrop(plan, 19, 23, 2, 6, 13);  // garlic border
  fillCrop(plan, 21, 23, 14, 6, 18);  // kale (bed 3 right)
  fillCrop(plan, 5, 32, 14, 6, 19);   // broccoli (bed 4 left)
  fillCrop(plan, 19, 32, 2, 6, 13);  // garlic border
  fillCrop(plan, 21, 32, 14, 6, 21);  // cauliflower (bed 4 right)

  // --- Zone B: Nightshades (col 41-72, row 4-44) ---
  // 3 raised beds + trellis
  fillGround(plan, 41, 4, 32, 10, 'raised-bed');   // bed 1 (row 4-13)
  fillGround(plan, 41, 15, 32, 10, 'raised-bed');  // bed 2 (row 15-24)
  fillGround(plan, 41, 26, 32, 10, 'raised-bed');  // bed 3 (row 26-35)
  // Trellis
  fillGround(plan, 72, 4, 1, 40, 'trellis');
  // Path between beds
  fillGround(plan, 41, 14, 32, 1, 'path-woodchip');
  fillGround(plan, 41, 25, 32, 1, 'path-woodchip');
  // Crops in Zone B - tomato-basil guild
  fillCrop(plan, 42, 5, 10, 8, 1);   // tomato (bed 1 left)
  fillCrop(plan, 52, 5, 6, 8, 5);    // basil interplanted
  fillCrop(plan, 58, 5, 8, 8, 6);    // pepper (bed 1 right)
  fillCrop(plan, 42, 16, 10, 8, 1);  // tomato (bed 2 left)
  fillCrop(plan, 52, 16, 6, 8, 5);   // basil interplanted
  fillCrop(plan, 58, 16, 8, 8, 7);   // eggplant (bed 2 right)
  fillCrop(plan, 42, 27, 10, 8, 6);  // pepper (bed 3 left)
  fillCrop(plan, 52, 27, 6, 8, 5);   // basil interplanted
  fillCrop(plan, 58, 27, 8, 8, 1);  // tomato (bed 3 right)

  // --- Zone C: Roots + Alliums (col 78-109, row 4-44) ---
  // 4 raised beds
  fillGround(plan, 78, 4, 32, 8, 'raised-bed');    // bed 1 (row 4-11)
  fillGround(plan, 78, 13, 32, 8, 'raised-bed');   // bed 2 (row 13-20)
  fillGround(plan, 78, 22, 32, 8, 'raised-bed');   // bed 3 (row 22-29)
  fillGround(plan, 78, 31, 32, 8, 'raised-bed');   // bed 4 (row 31-38)
  // Path between beds
  fillGround(plan, 78, 12, 32, 1, 'path-woodchip');
  fillGround(plan, 78, 21, 32, 1, 'path-woodchip');
  fillGround(plan, 78, 30, 32, 1, 'path-woodchip');
  // Crops in Zone C
  fillCrop(plan, 79, 5, 15, 6, 9);   // carrot (bed 1 left)
  fillCrop(plan, 94, 5, 15, 6, 10);  // beet (bed 1 right)
  fillCrop(plan, 79, 14, 15, 6, 12); // onion (bed 2 left)
  fillCrop(plan, 94, 14, 15, 6, 13); // garlic (bed 2 right)
  fillCrop(plan, 79, 23, 15, 6, 9);  // carrot (bed 3 left)
  fillCrop(plan, 94, 23, 15, 6, 10); // beet (bed 3 right)
  fillCrop(plan, 79, 32, 15, 6, 14); // leek (bed 4 left)
  fillCrop(plan, 94, 32, 15, 6, 12); // onion (bed 4 right)

  // --- Zone D: Legumes + Cucurbits (col 115-146, row 4-44) ---
  // 3 in-ground beds + trellis
  fillGround(plan, 115, 4, 32, 10, 'inground-bed');  // bed 1 (row 4-13)
  fillGround(plan, 115, 15, 32, 10, 'inground-bed'); // bed 2 (row 15-24)
  fillGround(plan, 115, 26, 32, 10, 'inground-bed'); // bed 3 (row 26-35)
  // Trellis
  fillGround(plan, 146, 4, 1, 40, 'trellis');
  // Path between beds
  fillGround(plan, 115, 14, 32, 1, 'path-woodchip');
  fillGround(plan, 115, 25, 32, 1, 'path-woodchip');
  // Crops in Zone D
  fillCrop(plan, 116, 5, 10, 8, 22);  // cucumber on trellis side (bed 1 left)
  fillCrop(plan, 126, 5, 8, 8, 27);   // bush bean (bed 1 middle)
  fillCrop(plan, 134, 5, 8, 8, 29);   // pea (bed 1 right)
  fillCrop(plan, 116, 16, 10, 8, 22); // cucumber (bed 2 left)
  fillCrop(plan, 126, 16, 8, 8, 27);  // bush bean (bed 2 middle)
  fillCrop(plan, 134, 16, 8, 8, 23);  // zucchini at ends (bed 2 right)
  fillCrop(plan, 116, 27, 10, 8, 29); // pea (bed 3 left)
  fillCrop(plan, 126, 27, 8, 8, 27);  // bush bean (bed 3 middle)
  fillCrop(plan, 134, 27, 8, 8, 23); // zucchini (bed 3 right)

  // --- Greenhouse: col 4-24, row 52-72 (20x12 cells) ---
  fillGround(plan, 4, 52, 21, 21, 'greenhouse');
  // Greenhouse crops: tender crops (tomato, pepper, basil, eggplant)
  fillCrop(plan, 6, 55, 5, 6, 1);   // tomato
  fillCrop(plan, 12, 55, 5, 6, 6);  // pepper
  fillCrop(plan, 18, 55, 4, 6, 5);  // basil
  fillCrop(plan, 6, 62, 5, 6, 7);  // eggplant
  fillCrop(plan, 12, 62, 5, 6, 1);  // tomato
  fillCrop(plan, 18, 62, 4, 6, 5);  // basil

  // --- Polytunnel: col 26-50, row 54-70 (24x8 cells, adjusted to 25x17) ---
  fillGround(plan, 26, 54, 25, 17, 'polytunnel');
  // Polytunnel crops: warm-season crops (zucchini, melon, cucumber)
  fillCrop(plan, 28, 56, 7, 5, 23);  // zucchini
  fillCrop(plan, 36, 56, 7, 5, 25);  // melon
  fillCrop(plan, 44, 56, 5, 5, 22);  // cucumber
  fillCrop(plan, 28, 62, 7, 5, 23);  // zucchini
  fillCrop(plan, 36, 62, 7, 5, 25);  // melon
  fillCrop(plan, 44, 62, 5, 5, 22);  // cucumber

  // --- Cold frames: 2 small ones ---
  fillGround(plan, 4, 74, 7, 7, 'cold-frame');     // cold frame 1: col 4-10, row 74-80
  fillGround(plan, 12, 74, 7, 7, 'cold-frame');    // cold frame 2: col 12-18, row 74-80
  // Cold frame crops: early starts (lettuce, spinach)
  fillCrop(plan, 5, 75, 5, 5, 2);   // lettuce
  fillCrop(plan, 13, 75, 5, 5, 15); // spinach

  // --- Herb spiral: col 26-42, row 74-86 ---
  fillGround(plan, 26, 74, 17, 13, 'raised-bed');
  // Herb spiral crops: dense planting
  fillCrop(plan, 27, 75, 4, 4, 5);   // basil
  fillCrop(plan, 32, 75, 4, 4, 33);  // parsley
  fillCrop(plan, 37, 75, 4, 4, 36);  // thyme
  fillCrop(plan, 27, 80, 4, 4, 37);  // rosemary
  fillCrop(plan, 32, 80, 4, 4, 40);  // chives
  fillCrop(plan, 37, 80, 4, 4, 35);  // dill

  // --- Berry patch: strawberry bed (col 44-60, row 74-86) ---
  fillGround(plan, 44, 74, 17, 13, 'raised-bed');
  fillCrop(plan, 45, 75, 15, 11, 30); // strawberry

  // --- Grain patch: wheat (col 62-78, row 74-86) ---
  fillGround(plan, 62, 74, 17, 13, 'inground-bed');
  fillCrop(plan, 63, 75, 15, 11, 3); // wheat (the farm's namesake!)

  // --- Flower border: col 80-156, row 52-56 ---
  // Marigold, nasturtium, borage, sunflower mix along paths
  fillCrop(plan, 80, 52, 8, 5, 42);   // marigold
  fillCrop(plan, 88, 52, 8, 5, 43);   // nasturtium
  fillCrop(plan, 96, 52, 8, 5, 45);   // borage
  fillCrop(plan, 104, 52, 8, 5, 44);  // sunflower
  fillCrop(plan, 112, 52, 8, 5, 42);  // marigold
  fillCrop(plan, 120, 52, 8, 5, 43);  // nasturtium
  fillCrop(plan, 128, 52, 8, 5, 45);  // borage
  fillCrop(plan, 136, 52, 8, 5, 44);  // sunflower
  fillCrop(plan, 144, 52, 8, 5, 42);  // marigold

  // --- Cover crop: crimson clover (col 80-100, row 74-86) ---
  fillCrop(plan, 80, 74, 21, 13, 46); // crimson clover (nitrogen fixer)

  // --- plantedAt dates (keyed by CELL "x,y", matching the renderer + editor) ---
  // plants.ts and usePlanEditor read/write `plantedAt` by cell key, so stamp
  // every planted cell from its crop's date rather than keying by crop id.
  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;
  const daysAgo = (d: number) => new Date(now - dayMs * d).toISOString();

  const plantedAtByCrop: Record<number, string> = {
    // Spring crops (brassicas, roots, peas, lettuce, spinach) — ~60 days ago.
    20: daysAgo(60), 19: daysAgo(60), 18: daysAgo(60), 21: daysAgo(60),
    9: daysAgo(60), 10: daysAgo(60), 12: daysAgo(60), 13: daysAgo(60), 14: daysAgo(60),
    29: daysAgo(60), 2: daysAgo(60), 15: daysAgo(60),
    // Summer crops — ~30 days ago (melon included).
    1: daysAgo(30), 6: daysAgo(30), 7: daysAgo(30), 22: daysAgo(30),
    23: daysAgo(30), 27: daysAgo(30), 25: daysAgo(30),
    // Herbs — ~45 days ago.
    5: daysAgo(45), 33: daysAgo(45), 36: daysAgo(45), 37: daysAgo(45),
    40: daysAgo(45), 35: daysAgo(45),
    // Flowers — ~40 days ago.
    42: daysAgo(40), 43: daysAgo(40), 44: daysAgo(40), 45: daysAgo(40),
    // Perennials & field crops.
    30: daysAgo(90), // strawberry
    3: daysAgo(20),  // wheat
    46: daysAgo(10), // crimson clover
    4: daysAgo(365), // apple tree
  };

  for (const [key, cropId] of Object.entries(plan.planting)) {
    const date = plantedAtByCrop[cropId];
    if (date) plan.plantedAt![key] = date;
  }

  return plan;
}

// --- Demo farms 3–6 (backyard, market field, grow tent, mushroom) -----------

const DAY_MS = 86_400_000;

/** Stamp every planted cell with a per-crop "days ago" date so the growth
 *  simulation opens mid-season and animates day-by-day. */
function stampPlantedAt(plan: PlanState, daysAgoByCrop: Record<number, number>, fallbackDays = 20): void {
  const now = Date.now();
  const plantedAt: Record<string, string> = {};
  for (const [key, cropId] of Object.entries(plan.planting)) {
    const days = daysAgoByCrop[cropId] ?? fallbackDays;
    plantedAt[key] = new Date(now - days * DAY_MS).toISOString();
  }
  plan.plantedAt = plantedAt;
}

// Crop ids used below (from data/crops.ts).
const TOMATO = 1, LETTUCE = 2, WHEAT = 3, BASIL = 5, PEPPER = 6, CARROT = 9,
  BEET = 10, RADISH = 11, ONION = 12, GARLIC = 13, SPINACH = 15, ARUGULA = 16,
  CUCUMBER = 22, ZUCCHINI = 23, MELON = 25, CORN = 26, BUSH_BEAN = 27, POLE_BEAN = 28,
  STRAWBERRY = 30, BLUEBERRY = 32, PARSLEY = 33, CILANTRO = 34, DILL = 35, THYME = 36,
  CHIVES = 40, MINT = 41, MARIGOLD = 42, NASTURTIUM = 43, SUNFLOWER = 44,
  BORAGE = 45, CRIMSON_CLOVER = 46, WINTER_RYE = 47,
  OYSTER = 48, BUTTON = 49, SHIITAKE = 50;

function buildBackyardPlan(): PlanState {
  const plan: PlanState = {
    farmId: 3, widthM: 18, heightM: 14, cellM: 0.25, allowOutsideBeds: false,
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // Perimeter picket fence + front gate.
  fillGround(plan, 0, 0, 72, 1, 'picket-fence');
  fillGround(plan, 0, 55, 72, 1, 'picket-fence');
  fillGround(plan, 0, 1, 1, 54, 'picket-fence');
  fillGround(plan, 71, 1, 1, 54, 'picket-fence');
  fillGround(plan, 35, 55, 2, 1, 'gate');

  // Central gravel path from the gate up through the yard.
  fillGround(plan, 35, 1, 2, 54, 'path-gravel');

  // Left of path: shed + water, then greenhouse + cold frame.
  fillGround(plan, 4, 4, 8, 12, 'shed');
  fillGround(plan, 13, 4, 3, 3, 'rain-barrel');
  fillGround(plan, 16, 4, 1, 1, 'water-tap');
  fillGround(plan, 4, 20, 10, 16, 'greenhouse');
  fillGround(plan, 15, 20, 3, 5, 'cold-frame');

  // Right of path: compost, three raised beds + trellis, in-ground bed.
  fillGround(plan, 58, 4, 4, 12, 'compost-bin');
  fillGround(plan, 40, 4, 5, 10, 'raised-bed');
  fillGround(plan, 46, 4, 5, 10, 'raised-bed');
  fillGround(plan, 52, 4, 5, 10, 'raised-bed');
  fillGround(plan, 40, 3, 17, 1, 'trellis');
  fillGround(plan, 58, 20, 12, 12, 'inground-bed');

  // Bottom: pond + beehive, chicken coop, herb bed, specimen fruit tree.
  fillGround(plan, 40, 36, 8, 6, 'pond');
  fillGround(plan, 49, 37, 2, 2, 'beehive');
  fillGround(plan, 58, 38, 8, 16, 'chicken-coop');
  fillGround(plan, 20, 4, 12, 10, 'inground-bed'); // herb bed
  fillGround(plan, 6, 44, 4, 4, 'fruit-tree');      // specimen tree

  // --- planting ---
  // Greenhouse: tender crops.
  fillCrop(plan, 5, 21, 4, 6, TOMATO);
  fillCrop(plan, 9, 21, 4, 6, PEPPER);
  fillCrop(plan, 5, 27, 4, 4, BASIL);
  fillCrop(plan, 9, 27, 4, 4, SPINACH);
  // Cold frame: early lettuce.
  fillCrop(plan, 15, 21, 2, 4, LETTUCE);
  // Herb bed (left of path).
  fillCrop(plan, 21, 5, 3, 4, BASIL);
  fillCrop(plan, 24, 5, 3, 4, PARSLEY);
  fillCrop(plan, 27, 5, 3, 4, CHIVES);
  fillCrop(plan, 21, 9, 3, 4, DILL);
  fillCrop(plan, 24, 9, 3, 4, MINT);
  fillCrop(plan, 27, 9, 3, 4, THYME);
  // Raised bed 1: tomato guild.
  fillCrop(plan, 40, 5, 2, 4, TOMATO);
  fillCrop(plan, 42, 5, 2, 4, BASIL);
  fillCrop(plan, 44, 5, 1, 4, MARIGOLD);
  // Raised bed 2: salad.
  fillCrop(plan, 46, 5, 2, 4, LETTUCE);
  fillCrop(plan, 48, 5, 2, 4, CARROT);
  // Raised bed 3: legumes + roots.
  fillCrop(plan, 52, 5, 2, 4, BUSH_BEAN);
  fillCrop(plan, 54, 5, 2, 4, RADISH);
  // Trellis: pole beans climbing.
  fillCrop(plan, 40, 3, 17, 1, POLE_BEAN);
  // In-ground bed: roots + alliums.
  fillCrop(plan, 59, 21, 5, 4, CARROT);
  fillCrop(plan, 64, 21, 5, 4, BEET);
  fillCrop(plan, 59, 26, 5, 4, ONION);
  fillCrop(plan, 64, 26, 5, 4, GARLIC);
  // Pollinator flowers near the pond + beehive.
  fillCrop(plan, 36, 32, 2, 2, MARIGOLD);
  fillCrop(plan, 36, 44, 2, 2, BORAGE);
  fillCrop(plan, 44, 43, 2, 2, NASTURTIUM);
  // Berry patch near the chicken coop.
  fillCrop(plan, 52, 44, 2, 2, STRAWBERRY);
  fillCrop(plan, 55, 44, 2, 2, BLUEBERRY);

  stampPlantedAt(plan, {
    [TOMATO]: 60, [PEPPER]: 55, [BASIL]: 40, [SPINACH]: 30, [LETTUCE]: 25,
    [PARSLEY]: 45, [CHIVES]: 45, [DILL]: 40, [MINT]: 40, [THYME]: 50,
    [CARROT]: 55, [BEET]: 40, [RADISH]: 20, [ONION]: 70, [GARLIC]: 90,
    [BUSH_BEAN]: 40, [POLE_BEAN]: 45, [MARIGOLD]: 35, [BORAGE]: 35,
    [NASTURTIUM]: 40, [STRAWBERRY]: 60, [BLUEBERRY]: 200,
  });
  return plan;
}

function buildMarketFieldPlan(): PlanState {
  const plan: PlanState = {
    farmId: 4, widthM: 40, heightM: 24, cellM: 0.25, allowOutsideBeds: false,
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // Perimeter fence + central crossing paths.
  fillGround(plan, 0, 0, 160, 1, 'fence');
  fillGround(plan, 0, 95, 160, 1, 'fence');
  fillGround(plan, 0, 1, 1, 94, 'fence');
  fillGround(plan, 159, 1, 1, 94, 'fence');
  fillGround(plan, 2, 46, 156, 4, 'path-gravel');
  fillGround(plan, 78, 1, 4, 94, 'path-gravel');

  // Barn + storage cluster (top-right corner, kept clear of crops).
  fillGround(plan, 130, 2, 18, 12, 'barn');
  fillGround(plan, 150, 4, 4, 2, 'hay-bale');
  fillGround(plan, 150, 7, 4, 2, 'hay-bale');
  fillGround(plan, 152, 11, 3, 3, 'crate-stack');

  // Field hand.
  fillGround(plan, 80, 6, 2, 2, 'scarecrow');

  // Protected growing + water (bottom-left).
  fillGround(plan, 6, 78, 12, 16, 'polytunnel');
  fillGround(plan, 20, 80, 10, 12, 'greenhouse');
  fillGround(plan, 32, 82, 5, 5, 'ibc-tote');
  fillGround(plan, 38, 82, 1, 1, 'water-tap');

  // Irrigation runs across the field.
  fillGround(plan, 2, 30, 74, 1, 'irrigation-line');
  fillGround(plan, 82, 30, 74, 1, 'irrigation-line');
  fillGround(plan, 2, 60, 74, 1, 'irrigation-line');
  fillGround(plan, 82, 60, 74, 1, 'irrigation-line');

  // Orchard (bottom-centre) — new fruit-tree structure.
  fillGround(plan, 44, 88, 4, 4, 'fruit-tree');
  fillGround(plan, 52, 88, 4, 4, 'fruit-tree');
  fillGround(plan, 60, 88, 4, 4, 'fruit-tree');
  fillGround(plan, 68, 88, 4, 4, 'fruit-tree');

  // --- planting ---
  // Corn block (left of the vertical path).
  fillCrop(plan, 4, 6, 70, 22, CORN);
  // Wheat block (right of the vertical path, clear of the barn).
  fillCrop(plan, 82, 6, 46, 22, WHEAT);
  // Cover crops between the crop blocks and the central path.
  fillCrop(plan, 4, 32, 70, 10, CRIMSON_CLOVER);
  fillCrop(plan, 82, 32, 46, 10, WINTER_RYE);
  // Sunflower pollinator border.
  fillCrop(plan, 4, 42, 70, 2, SUNFLOWER);
  fillCrop(plan, 82, 42, 46, 2, SUNFLOWER);
  // Polytunnel: warm-season cucurbits.
  fillCrop(plan, 7, 79, 4, 6, ZUCCHINI);
  fillCrop(plan, 11, 79, 4, 6, MELON);
  fillCrop(plan, 7, 86, 4, 6, CUCUMBER);
  // Greenhouse: tender crops.
  fillCrop(plan, 21, 81, 4, 5, TOMATO);
  fillCrop(plan, 25, 81, 3, 5, PEPPER);
  fillCrop(plan, 21, 87, 3, 4, BASIL);

  stampPlantedAt(plan, {
    [CORN]: 45, [WHEAT]: 90, [CRIMSON_CLOVER]: 55, [WINTER_RYE]: 80,
    [SUNFLOWER]: 50, [ZUCCHINI]: 35, [MELON]: 45, [CUCUMBER]: 40,
    [TOMATO]: 60, [PEPPER]: 55, [BASIL]: 40,
  });
  return plan;
}

function buildGrowTentPlan(): PlanState {
  const plan: PlanState = {
    farmId: 5, widthM: 6, heightM: 5, cellM: 0.25, allowOutsideBeds: false,
    surface: 'tent',
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // The canvas IS the tent interior: mylar floor (surface), racks along the
  // back wall, NFT channel runs down the middle, LED bars over every run, and
  // a clear mylar aisle at the front.
  fillGround(plan, 1, 1, 4, 2, 'plant-rack');
  fillGround(plan, 8, 1, 4, 2, 'plant-rack');
  fillGround(plan, 15, 1, 4, 2, 'plant-rack');
  fillGround(plan, 1, 4, 18, 1, 'grow-light');
  fillGround(plan, 1, 8, 20, 1, 'hydro-channel');
  fillGround(plan, 1, 9, 20, 1, 'grow-light');
  fillGround(plan, 1, 12, 20, 1, 'hydro-channel');
  fillGround(plan, 1, 13, 20, 1, 'grow-light');
  fillGround(plan, 0, 6, 1, 1, 'clip-fan');
  fillGround(plan, 23, 10, 1, 1, 'clip-fan');

  // Herbs up the racks (plants lift onto the shelf decks), greens in the channels.
  fillCrop(plan, 1, 1, 4, 2, BASIL);
  fillCrop(plan, 8, 1, 4, 2, MINT);
  fillCrop(plan, 15, 1, 4, 2, CHIVES);
  fillCrop(plan, 1, 8, 20, 1, LETTUCE);
  fillCrop(plan, 1, 12, 20, 1, SPINACH);

  stampPlantedAt(plan, {
    [BASIL]: 30, [MINT]: 35, [CHIVES]: 40, [LETTUCE]: 22, [SPINACH]: 26,
  }, 28);
  return plan;
}

function buildMushroomPlan(): PlanState {
  const plan: PlanState = {
    farmId: 6, widthM: 12, heightM: 8, cellM: 0.25, allowOutsideBeds: false,
    surface: 'indoor',
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // Sealed warehouse: vertical rack walls of mushrooms in four fruiting aisles,
  // climate gear along the walls, packing corner by the door.
  const rackCols = [3, 10, 17, 24, 31, 38];
  for (const bandRow of [3, 9, 15, 21]) {
    for (const rx of rackCols) fillGround(plan, rx, bandRow, 4, 2, 'plant-rack');
  }
  fillGround(plan, 2, 0, 4, 1, 'hvac-unit');
  fillGround(plan, 20, 0, 4, 1, 'hvac-unit');
  fillGround(plan, 38, 0, 4, 1, 'hvac-unit');
  fillGround(plan, 0, 6, 1, 1, 'clip-fan');
  fillGround(plan, 12, 6, 1, 1, 'clip-fan');
  fillGround(plan, 26, 6, 1, 1, 'clip-fan');
  fillGround(plan, 40, 6, 1, 1, 'clip-fan');
  fillGround(plan, 43, 26, 5, 5, 'ibc-tote');
  fillGround(plan, 43, 20, 1, 1, 'water-tap');
  fillGround(plan, 36, 27, 3, 3, 'crate-stack');
  fillGround(plan, 40, 28, 3, 3, 'crate-stack');
  fillGround(plan, 33, 28, 1, 1, 'signpost');

  // Mushroom species per rack band — oyster front, button middle, shiitake back.
  const bandCrop: Record<number, number> = { 3: OYSTER, 9: BUTTON, 15: SHIITAKE, 21: OYSTER };
  for (const bandRow of [3, 9, 15, 21]) {
    for (const rx of rackCols) fillCrop(plan, rx, bandRow, 4, 2, bandCrop[bandRow]!);
  }

  stampPlantedAt(plan, { [OYSTER]: 16, [BUTTON]: 20, [SHIITAKE]: 26 }, 20);
  return plan;
}

function buildGreenhousePlan(): PlanState {
  const plan: PlanState = {
    farmId: 7, widthM: 10, heightM: 7, cellM: 0.25, allowOutsideBeds: false,
    surface: 'greenhouse',
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // Glass range: bench rows of tender crops, NFT channels of greens, supplemental
  // LED runs, airflow fans in the corners. Gravel-floor surface does the rest.
  const benchXs = [2, 9, 16, 23, 30];
  for (const bx of benchXs) {
    fillGround(plan, bx, 3, 5, 2, 'grow-bench');
    fillGround(plan, bx, 8, 5, 2, 'grow-bench');
  }
  fillGround(plan, 2, 6, 33, 1, 'grow-light');
  fillGround(plan, 2, 11, 33, 1, 'grow-light');
  fillGround(plan, 2, 14, 36, 1, 'hydro-channel');
  fillGround(plan, 2, 16, 36, 1, 'hydro-channel');
  fillGround(plan, 0, 0, 1, 1, 'clip-fan');
  fillGround(plan, 39, 0, 1, 1, 'clip-fan');
  fillGround(plan, 0, 26, 1, 1, 'clip-fan');
  fillGround(plan, 39, 26, 1, 1, 'clip-fan');
  fillGround(plan, 37, 19, 2, 2, 'water-tap');
  fillGround(plan, 30, 19, 1, 1, 'signpost');

  // Benches: fruiting crops front, salads and berries behind.
  const benchCrops = [TOMATO, PEPPER, BASIL, CUCUMBER, STRAWBERRY];
  const benchCrops2 = [LETTUCE, ARUGULA, PARSLEY, CILANTRO, SPINACH];
  benchXs.forEach((bx, i) => {
    fillCrop(plan, bx, 3, 5, 2, benchCrops[i]!);
    fillCrop(plan, bx, 8, 5, 2, benchCrops2[i]!);
  });
  fillCrop(plan, 2, 14, 36, 1, LETTUCE);
  fillCrop(plan, 2, 16, 36, 1, SPINACH);

  stampPlantedAt(plan, {
    [TOMATO]: 55, [PEPPER]: 50, [BASIL]: 35, [CUCUMBER]: 40, [STRAWBERRY]: 70,
    [LETTUCE]: 24, [ARUGULA]: 20, [PARSLEY]: 40, [CILANTRO]: 28, [SPINACH]: 27,
  }, 30);
  return plan;
}

function buildHoophousePlan(): PlanState {
  const plan: PlanState = {
    farmId: 8, widthM: 10, heightM: 8, cellM: 0.25, allowOutsideBeds: false,
    surface: 'hoophouse',
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // High tunnel: crops grow in ground soil (no hydro, no benches) — three
  // in-ground beds under trellis lines, drip irrigation down each bed, roll-up
  // side aisles kept clear, seedling trays staging by the door.
  // fillGround/fillCrop take (x, y, w, h) — these were originally written as
  // corner coordinates, which pushed crops up to row 56 of a 32-row grid and
  // produced the audit's impossible "Coverage 153%" (OPS-002).
  fillGround(plan, 1, 2, 38, 7, 'inground-bed');
  fillGround(plan, 1, 13, 38, 7, 'inground-bed');
  fillGround(plan, 1, 24, 38, 7, 'inground-bed');
  fillGround(plan, 1, 2, 38, 1, 'trellis');
  fillGround(plan, 1, 13, 38, 1, 'trellis');
  fillGround(plan, 1, 24, 38, 1, 'trellis');
  fillGround(plan, 0, 4, 1, 4, 'irrigation-line');
  fillGround(plan, 0, 15, 1, 4, 'irrigation-line');
  fillGround(plan, 0, 26, 1, 4, 'irrigation-line');
  fillGround(plan, 36, 0, 2, 1, 'seedling-tray');
  fillGround(plan, 38, 30, 1, 1, 'water-tap');

  // Bed 1 trellised tomatoes + basil understory; bed 2 peppers + salad; bed 3
  // tomatoes + spinach (winter-hardy tunnel crop).
  fillCrop(plan, 2, 3, 36, 1, TOMATO);
  fillCrop(plan, 2, 6, 36, 2, BASIL);
  fillCrop(plan, 2, 14, 36, 2, PEPPER);
  fillCrop(plan, 2, 17, 36, 2, LETTUCE);
  fillCrop(plan, 2, 25, 36, 2, TOMATO);
  fillCrop(plan, 2, 28, 36, 2, SPINACH);

  stampPlantedAt(plan, {
    [TOMATO]: 60, [BASIL]: 30, [PEPPER]: 45, [LETTUCE]: 18, [SPINACH]: 22,
  }, 25);
  return plan;
}

function buildWarehousePlan(): PlanState {
  const plan: PlanState = {
    farmId: 9, widthM: 12, heightM: 10, cellM: 0.25, allowOutsideBeds: false,
    surface: 'warehouse',
    planting: {}, ground: {}, updatedAt: new Date().toISOString(),
  };

  // Sealed vertical-farm hall: glowing rack canyons with taped aisles, HVAC at
  // the walls, CO2 enrichment, a DWC raft pond and a seedling nursery corner.
  const rackRows = [2, 10, 18, 26, 34];
  for (const ry of rackRows) fillGround(plan, 2, ry, 44, 2, 'plant-rack');
  fillGround(plan, 0, 6, 1, 1, 'clip-fan');
  fillGround(plan, 46, 14, 1, 1, 'clip-fan');
  fillGround(plan, 0, 37, 4, 1, 'hvac-unit');
  fillGround(plan, 43, 37, 4, 1, 'hvac-unit');
  fillGround(plan, 46, 0, 1, 1, 'co2-tank');
  fillGround(plan, 46, 30, 2, 2, 'seedling-tray');
  fillGround(plan, 0, 28, 4, 6, 'hydro-raft');
  fillGround(plan, 0, 0, 2, 2, 'crate-stack');

  // Rack rows alternate lettuce and basil down the hall; rafts carry lettuce.
  for (const [i, ry] of rackRows.entries()) {
    fillCrop(plan, 2, ry, 44, 2, i % 2 === 0 ? LETTUCE : BASIL);
  }
  fillCrop(plan, 0, 29, 4, 4, LETTUCE);

  stampPlantedAt(plan, { [LETTUCE]: 16, [BASIL]: 24 }, 18);
  return plan;
}

export const seedPlans: Record<number, PlanState> = {
  1: buildNorthMeadowPlan(),
  2: buildSouthWheatPlan(),
  3: buildBackyardPlan(),
  4: buildMarketFieldPlan(),
  5: buildGrowTentPlan(),
  6: buildMushroomPlan(),
  7: buildGreenhousePlan(),
  8: buildHoophousePlan(),
  9: buildWarehousePlan(),
};

// --- Cells (legacy voxel grid; Monitoring still reads these) --------------

function buildCells(farmId: number, count: number): FarmCell[] {
  const cells: FarmCell[] = [];
  for (let i = 0; i < count; i++) {
    const x = i % 16;
    const y = Math.floor(i / 16) % 8;
    const z = 0;
    cells.push({
      id: farmId * 1000 + i,
      farmId,
      x,
      y,
      z,
      cropId: i % 3 === 0 ? (i % 2 === 0 ? 1 : 2) : null,
      soilMoisture: 30 + ((i * 7) % 40),
      nitrogenLevel: 40 + ((i * 11) % 50),
    });
  }
  return cells;
}

export const seedCells: FarmCell[] = [
  ...buildCells(1, 128),
  ...buildCells(2, 128),
];

// --- Sensors (manual-reading stations) -------------------------------------

export const seedSensors: Sensor[] = [
  {
    id: 1,
    farmId: 1,
    name: 'North Probe',
    sensorType: 'soil_moisture',
    isActive: true,
    lastValue: 52,
    lastUnit: '%',
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 2,
    farmId: 1,
    name: 'Greenhouse Temp',
    sensorType: 'temperature',
    isActive: true,
    lastValue: 24.3,
    lastUnit: '°C',
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: 3,
    farmId: 2,
    name: 'Field A LoRa',
    sensorType: 'soil_moisture',
    isActive: true,
    lastValue: 38,
    lastUnit: '%',
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

export const seedReadings: Record<number, SensorReading[]> = {
  1: Array.from({ length: 18 }, (_, i) => ({
    id: i,
    sensorId: 1,
    value: 45 + Math.sin(i / 2) * 8,
    recordedAt: new Date(Date.now() - (18 - i) * 1000 * 60 * 30).toISOString(),
  })),
  2: Array.from({ length: 18 }, (_, i) => ({
    id: i,
    sensorId: 2,
    value: 22 + Math.cos(i / 3) * 3,
    recordedAt: new Date(Date.now() - (18 - i) * 1000 * 60 * 30).toISOString(),
  })),
  3: Array.from({ length: 18 }, (_, i) => ({
    id: i,
    sensorId: 3,
    value: 32 + Math.sin(i / 2) * 5,
    recordedAt: new Date(Date.now() - (18 - i) * 1000 * 60 * 30).toISOString(),
  })),
};

// --- Simulations ---------------------------------------------------------

export const seedSimulations: Simulation[] = [
  {
    id: 1,
    farmId: 1,
    name: 'Spring Baseline',
    scenarioType: 'baseline',
    durationDays: 90,
    tempDeltaC: 0,
    precipMultiplier: 1,
    fertilizerBoost: 0,
    status: 'complete',
    results: JSON.stringify({
      yieldTonHa: 28.4,
      waterUseMm: 420,
      carbonKgHa: 850,
      profitUsdHa: 1280,
      stressScore: 18,
      summary: 'Standard weather assumptions produce a healthy 28.4 t/ha season.',
    }),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 2,
    farmId: 1,
    name: 'Drought Stress',
    scenarioType: 'drought',
    durationDays: 90,
    tempDeltaC: 2,
    precipMultiplier: 0.5,
    fertilizerBoost: 0,
    status: 'complete',
    results: JSON.stringify({
      yieldTonHa: 17.1,
      waterUseMm: 210,
      carbonKgHa: 640,
      profitUsdHa: 420,
      stressScore: 71,
      summary: 'Halved precipitation drops yield by ~40% and stresses crops severely.',
    }),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 3,
    farmId: 1,
    name: 'Optimal Inputs',
    scenarioType: 'optimal',
    durationDays: 90,
    tempDeltaC: 0,
    precipMultiplier: 1.2,
    fertilizerBoost: 2,
    status: 'complete',
    results: JSON.stringify({
      yieldTonHa: 36.8,
      waterUseMm: 510,
      carbonKgHa: 1080,
      profitUsdHa: 1920,
      stressScore: 8,
      summary: 'Optimal irrigation + fertilizer boosts yield 30% with minimal stress.',
    }),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
  },
];

// --- NDVI ----------------------------------------------------------------

function buildNdvi(farmId: number): NdviEstimate {
  const grid = Array.from({ length: 128 }, (_, i) => {
    const x = i % 16;
    const y = Math.floor(i / 16);
    return {
      x,
      y,
      ndvi: Math.max(0, Math.min(1, 0.45 + Math.sin(x / 2) * 0.15 + Math.cos(y / 3) * 0.1)),
    };
  });
  return {
    farmId,
    ndviGrid: grid,
    timestamp: new Date().toISOString(),
  };
}

export const seedNdvi: Record<number, NdviEstimate> = {
  1: buildNdvi(1),
  2: buildNdvi(2),
};
