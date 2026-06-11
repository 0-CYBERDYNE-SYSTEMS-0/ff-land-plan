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
