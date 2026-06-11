import type {
  Alert,
  Crop,
  Farm,
  FarmCell,
  ForecastDay,
  NdviEstimate,
  Sensor,
  SensorReading,
  Simulation,
  Weather,
  WeatherHistoryPoint,
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

// --- Crops ---------------------------------------------------------------

export const seedCrops: Crop[] = [
  {
    id: 1,
    name: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    category: 'vegetable',
    growthDays: 80,
    waterNeedMmDay: 5.5,
    nitrogenNeed: 'high',
    sunRequirement: 'full',
    minTempC: 16,
    maxTempC: 32,
    yieldTonHa: 35,
    colorHex: '#D4380D',
    description: 'Warm-season crop, prefers well-drained loam.',
    isCustom: false,
  },
  {
    id: 2,
    name: 'Lettuce',
    scientificName: 'Lactuca sativa',
    category: 'vegetable',
    growthDays: 45,
    waterNeedMmDay: 3.2,
    nitrogenNeed: 'medium',
    sunRequirement: 'partial',
    minTempC: 7,
    maxTempC: 24,
    yieldTonHa: 22,
    colorHex: '#7DC900',
    description: 'Cool-season leafy green, bolts in heat.',
    isCustom: false,
  },
  {
    id: 3,
    name: 'Wheat',
    scientificName: 'Triticum aestivum',
    category: 'grain',
    growthDays: 130,
    waterNeedMmDay: 4.0,
    nitrogenNeed: 'high',
    sunRequirement: 'full',
    minTempC: 4,
    maxTempC: 30,
    yieldTonHa: 7.5,
    colorHex: '#FFAE00',
    description: 'Cool-season cereal, winter or spring varieties.',
    isCustom: false,
  },
  {
    id: 4,
    name: 'Apple',
    scientificName: 'Malus domestica',
    category: 'fruit',
    growthDays: 365,
    waterNeedMmDay: 4.5,
    nitrogenNeed: 'medium',
    sunRequirement: 'full',
    minTempC: -10,
    maxTempC: 32,
    yieldTonHa: 30,
    colorHex: '#D4380D',
    description: 'Deciduous tree, needs chill hours.',
    isCustom: false,
  },
  {
    id: 5,
    name: 'Basil',
    scientificName: 'Ocimum basilicum',
    category: 'herb',
    growthDays: 60,
    waterNeedMmDay: 4.0,
    nitrogenNeed: 'medium',
    sunRequirement: 'full',
    minTempC: 15,
    maxTempC: 32,
    yieldTonHa: 8,
    colorHex: '#00A86B',
    description: 'Warm-season herb, frost-sensitive.',
    isCustom: false,
  },
  {
    id: 6,
    name: 'Crimson Clover',
    scientificName: 'Trifolium incarnatum',
    category: 'cover_crop',
    growthDays: 90,
    waterNeedMmDay: 2.5,
    nitrogenNeed: 'low',
    sunRequirement: 'full',
    minTempC: 5,
    maxTempC: 28,
    yieldTonHa: 4,
    colorHex: '#C03030',
    description: 'Nitrogen-fixing cover crop.',
    isCustom: false,
  },
];

// --- Cells (voxel grid) -------------------------------------------------

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

// --- Weather -------------------------------------------------------------

function makeWeather(): Weather {
  return {
    current: {
      tempC: 18.4,
      feelsLikeC: 17.6,
      humidity: 62,
      windSpeedKmh: 12,
      precipMm: 0.4,
      uvIndex: 4.2,
      cloudCover: 35,
      soilTempC: 16.8,
      soilMoisture: 48,
      weatherCode: 2,
      weatherDesc: 'Partly cloudy',
    },
    cached: false,
    timestamp: new Date().toISOString(),
  };
}

function makeHistory(): WeatherHistoryPoint[] {
  const out: WeatherHistoryPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    out.push({
      tempC: 12 + Math.sin(i / 3) * 6 + (i % 4) * 0.5,
      humidity: 50 + ((i * 3) % 30),
      soilMoisture: 40 + ((i * 5) % 30),
    });
  }
  return out;
}

function makeForecast(): ForecastDay[] {
  const out: ForecastDay[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      date: d.toISOString().slice(0, 10),
      maxTempC: 18 + Math.sin(i / 2) * 5,
      minTempC: 8 + Math.cos(i / 2) * 3,
      precipMm: i % 3 === 0 ? 2.4 : 0,
      weatherCode: i % 4 === 0 ? 61 : i % 3 === 0 ? 3 : 1,
    });
  }
  return out;
}

export const seedWeather = makeWeather();
export const seedHistory = makeHistory();
export const seedForecast = makeForecast();

// --- Sensors -------------------------------------------------------------

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

// --- Alerts --------------------------------------------------------------

export const seedAlerts: Alert[] = [
  {
    id: 1,
    farmId: 1,
    alertType: 'frost',
    severity: 'warning',
    message: 'Low of 2°C forecast for tomorrow morning — protect tender crops.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 2,
    farmId: 1,
    alertType: 'drought',
    severity: 'info',
    message: 'Soil moisture trending down 8% over the past 72 hours.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 3,
    farmId: 1,
    alertType: 'nutrient',
    severity: 'warning',
    message: 'Nitrogen levels below 35% in the southern 12 cells.',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
  },
];

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
