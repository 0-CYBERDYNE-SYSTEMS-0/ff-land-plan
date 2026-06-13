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

  // --- plantedAt dates ---
  const now = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;

  // Spring crops (brassicas, roots, peas, lettuce, spinach) - ~60 days ago
  const springDate = new Date(now - dayMs * 60).toISOString();
  [20, 19, 18, 21, 9, 10, 12, 13, 14, 29, 2, 15].forEach((id) => {
    plan.plantedAt![id] = springDate;
  });

  // Summer crops (tomato, pepper, eggplant, cucumber, zucchini, bush bean) - ~30 days ago
  const summerDate = new Date(now - dayMs * 30).toISOString();
  [1, 6, 7, 22, 23, 27].forEach((id) => {
    plan.plantedAt![id] = summerDate;
  });

  // Herbs - ~45 days ago
  const herbDate = new Date(now - dayMs * 45).toISOString();
  [5, 33, 36, 37, 40, 35].forEach((id) => {
    plan.plantedAt![id] = herbDate;
  });

  // Flowers - ~40 days ago
  const flowerDate = new Date(now - dayMs * 40).toISOString();
  [42, 43, 44, 45].forEach((id) => {
    plan.plantedAt![id] = flowerDate;
  });

  // Strawberries - perennial, ~90 days ago
  plan.plantedAt![30] = new Date(now - dayMs * 90).toISOString();

  // Wheat - ~20 days ago (spring wheat)
  plan.plantedAt![3] = new Date(now - dayMs * 20).toISOString();

  // Cover crop (crimson clover) - ~10 days ago
  plan.plantedAt![46] = new Date(now - dayMs * 10).toISOString();

  // Apple trees - perennial, ~365 days ago
  plan.plantedAt![4] = new Date(now - dayMs * 365).toISOString();

  // Melon (in polytunnel) - ~30 days ago (summer crop)
  plan.plantedAt![25] = summerDate;

  return plan;
}

export const seedPlans: Record<number, PlanState> = {
  1: buildNorthMeadowPlan(),
  2: buildSouthWheatPlan(),
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
