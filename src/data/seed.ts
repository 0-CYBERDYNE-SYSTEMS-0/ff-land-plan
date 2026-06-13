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

export const seedPlans: Record<number, PlanState> = {
  1: buildNorthMeadowPlan(),
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
