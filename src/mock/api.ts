// In-memory mock API that lets the whole app boot without a backend.
// Mirrors the contract of the original server so a real `fetch`-based
// client can drop in without touching the page components.

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
  SimulationResults,
  Weather,
  WeatherHistoryPoint,
} from '@/types';
import {
  seedAlerts,
  seedCells,
  seedCrops,
  seedFarms,
  seedForecast,
  seedHistory,
  seedNdvi,
  seedReadings,
  seedSensors,
  seedSimulations,
  seedWeather,
} from './seed';

// Mutable in-memory state. The dev session is single-user; persistence is
// intentionally ephemeral so a refresh resets to a known-good baseline.

const state = {
  farms: [...seedFarms] as Farm[],
  crops: [...seedCrops] as Crop[],
  cells: [...seedCells] as FarmCell[],
  sensors: [...seedSensors] as Sensor[],
  readings: { ...seedReadings } as Record<number, SensorReading[]>,
  alerts: [...seedAlerts] as Alert[],
  simulations: [...seedSimulations] as Simulation[],
  ndvi: { ...seedNdvi } as Record<number, NdviEstimate>,
  weather: { ...seedWeather } as Weather,
  history: [...seedHistory] as WeatherHistoryPoint[],
  forecast: [...seedForecast] as ForecastDay[],
};

let nextFarmId = state.farms.length + 1;
let nextCropId = state.crops.length + 1;
let nextSensorId = state.sensors.length + 1;
let nextReadingId = 100;
let nextAlertId = state.alerts.length + 1;
let nextSimId = state.simulations.length + 1;
let nextCellId = state.cells.length + 1;

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function farmOrThrow(id: number): Farm {
  const f = state.farms.find((x) => x.id === id);
  if (!f) throw new Error(`Farm ${id} not found`);
  return f;
}

function cropOrThrow(id: number): Crop {
  const c = state.crops.find((x) => x.id === id);
  if (!c) throw new Error(`Crop ${id} not found`);
  return c;
}

function sensorOrThrow(id: number): Sensor {
  const s = state.sensors.find((x) => x.id === id);
  if (!s) throw new Error(`Sensor ${id} not found`);
  return s;
}

export interface MockApi {
  // Farms
  listFarms: () => Promise<Farm[]>;
  getFarm: (id: number) => Promise<Farm>;
  createFarm: (input: Omit<Farm, 'id' | 'createdAt'>) => Promise<Farm>;
  updateFarm: (id: number, patch: Partial<Farm>) => Promise<Farm>;
  deleteFarm: (id: number) => Promise<void>;

  // Weather
  getWeather: (farmId: number) => Promise<Weather>;
  getForecast: (farmId: number) => Promise<ForecastDay[]>;
  getWeatherHistory: (farmId: number, limit?: number) => Promise<WeatherHistoryPoint[]>;

  // Alerts
  listAlerts: (farmId: number) => Promise<Alert[]>;
  markAlertRead: (id: number) => Promise<Alert>;
  markAllAlertsRead: (farmId: number) => Promise<{ updated: number }>;

  // Sensors
  listSensors: (farmId: number) => Promise<Sensor[]>;
  createSensor: (farmId: number, input: { name: string; sensorType: Sensor['sensorType'] }) => Promise<Sensor>;
  deleteSensor: (id: number) => Promise<void>;
  listReadings: (sensorId: number, limit?: number) => Promise<SensorReading[]>;
  addReading: (sensorId: number, value: number, unit: string) => Promise<SensorReading>;

  // Cells / NDVI
  listCells: (farmId: number) => Promise<FarmCell[]>;
  setCellCrop: (farmId: number, cellId: number, cropId: number | null) => Promise<FarmCell>;
  getNdvi: (farmId: number) => Promise<NdviEstimate>;

  // Simulations
  listSimulations: (farmId: number) => Promise<Simulation[]>;
  createSimulation: (
    farmId: number,
    input: Omit<Simulation, 'id' | 'farmId' | 'status' | 'results' | 'createdAt'>,
  ) => Promise<Simulation>;
  deleteSimulation: (id: number) => Promise<void>;

  // Crops
  listCrops: () => Promise<Crop[]>;
  createCrop: (input: Omit<Crop, 'id' | 'isCustom'>) => Promise<Crop>;
}

export const mockApi: MockApi = {
  // Farms
  listFarms: () => delay([...state.farms]),
  getFarm: (id) => delay({ ...farmOrThrow(id) }),
  createFarm: (input) => {
    const farm: Farm = {
      ...input,
      id: nextFarmId++,
      createdAt: new Date().toISOString(),
    };
    state.farms = [farm, ...state.farms];
    return delay(farm);
  },
  updateFarm: (id, patch) => {
    const f = farmOrThrow(id);
    Object.assign(f, patch);
    return delay({ ...f });
  },
  deleteFarm: (id) => {
    state.farms = state.farms.filter((f) => f.id !== id);
    state.cells = state.cells.filter((c) => c.farmId !== id);
    state.alerts = state.alerts.filter((a) => a.farmId !== id);
    state.simulations = state.simulations.filter((s) => s.farmId !== id);
    state.sensors = state.sensors.filter((s) => s.farmId !== id);
    return delay(undefined);
  },

  // Weather
  getWeather: () => delay({ ...state.weather }),
  getForecast: () => delay([...state.forecast]),
  getWeatherHistory: (_farmId, limit = 24) => delay(state.history.slice(0, limit)),

  // Alerts
  listAlerts: (farmId) => delay(state.alerts.filter((a) => a.farmId === farmId)),
  markAlertRead: (id) => {
    const a = state.alerts.find((x) => x.id === id);
    if (!a) throw new Error(`Alert ${id} not found`);
    a.isRead = true;
    return delay({ ...a });
  },
  markAllAlertsRead: (farmId) => {
    const before = state.alerts.filter((a) => a.farmId === farmId && !a.isRead).length;
    state.alerts = state.alerts.map((a) => (a.farmId === farmId ? { ...a, isRead: true } : a));
    return delay({ updated: before });
  },

  // Sensors
  listSensors: (farmId) => delay(state.sensors.filter((s) => s.farmId === farmId)),
  createSensor: (farmId, input) => {
    const sensor: Sensor = {
      id: nextSensorId++,
      farmId,
      name: input.name,
      sensorType: input.sensorType,
      isActive: true,
      lastValue: null,
      lastUnit: null,
      lastReadingAt: null,
    };
    state.sensors = [...state.sensors, sensor];
    return delay(sensor);
  },
  deleteSensor: (id) => {
    state.sensors = state.sensors.filter((s) => s.id !== id);
    delete state.readings[id];
    return delay(undefined);
  },
  listReadings: (sensorId, limit = 20) => {
    const r = state.readings[sensorId] ?? [];
    return delay(r.slice(-limit));
  },
  addReading: (sensorId, value, unit) => {
    const sensor = sensorOrThrow(sensorId);
    const reading: SensorReading = {
      id: nextReadingId++,
      sensorId,
      value,
      recordedAt: new Date().toISOString(),
    };
    state.readings[sensorId] = [...(state.readings[sensorId] ?? []), reading];
    sensor.lastValue = value;
    sensor.lastUnit = unit;
    sensor.lastReadingAt = reading.recordedAt;
    return delay(reading);
  },

  // Cells
  listCells: (farmId) => delay(state.cells.filter((c) => c.farmId === farmId)),
  setCellCrop: (farmId, cellId, cropId) => {
    const c = state.cells.find((x) => x.id === cellId && x.farmId === farmId);
    if (!c) throw new Error(`Cell ${cellId} not found on farm ${farmId}`);
    c.cropId = cropId;
    return delay({ ...c });
  },
  getNdvi: (farmId) => {
    const n = state.ndvi[farmId];
    if (n) return delay({ ...n });
    const empty: NdviEstimate = { farmId, ndviGrid: [], timestamp: new Date().toISOString() };
    return delay(empty);
  },

  // Simulations
  listSimulations: (farmId) => delay(state.simulations.filter((s) => s.farmId === farmId)),
  createSimulation: (farmId, input) => {
    const baseYield = 30;
    const tempPenalty = Math.max(0, Math.abs(input.tempDeltaC) - 1) * 3;
    const precipPenalty = input.precipMultiplier < 1 ? (1 - input.precipMultiplier) * 25 : 0;
    const fertilizerBoost = input.fertilizerBoost * 1.5;
    const yieldTonHa = Math.max(2, baseYield - tempPenalty - precipPenalty + fertilizerBoost);
    const waterUseMm = Math.round(input.durationDays * 4.5 * input.precipMultiplier);
    const carbonKgHa = Math.round(700 + input.fertilizerBoost * 60);
    const profitUsdHa = Math.round(yieldTonHa * 60 - waterUseMm * 0.4 - input.fertilizerBoost * 30);
    const stressScore = Math.min(
      100,
      Math.round(tempPenalty * 4 + precipPenalty * 2 + (input.fertilizerBoost > 4 ? 30 : 0)),
    );
    const summary =
      input.scenarioType === 'baseline'
        ? 'Standard weather produces a healthy baseline yield.'
        : input.scenarioType === 'drought'
          ? 'Reduced precipitation drops yield and increases stress markedly.'
          : input.scenarioType === 'heat_stress'
            ? 'Elevated temperature shortens the growing window and reduces yield.'
            : input.scenarioType === 'optimal'
              ? 'Optimal inputs boost yield with minimal crop stress.'
              : 'Climate change scenario shows the impact of +2°C warming.';

    const results: SimulationResults = {
      yieldTonHa,
      waterUseMm,
      carbonKgHa,
      profitUsdHa,
      stressScore,
      summary,
    };

    const sim: Simulation = {
      id: nextSimId++,
      farmId,
      ...input,
      status: 'complete',
      results: JSON.stringify(results),
      createdAt: new Date().toISOString(),
    };
    state.simulations = [sim, ...state.simulations];
    return delay(sim, 400);
  },
  deleteSimulation: (id) => {
    state.simulations = state.simulations.filter((s) => s.id !== id);
    return delay(undefined);
  },

  // Crops
  listCrops: () => delay([...state.crops]),
  createCrop: (input) => {
    const crop: Crop = { ...input, id: nextCropId++, isCustom: true };
    state.crops = [crop, ...state.crops];
    return delay(crop);
  },
};
