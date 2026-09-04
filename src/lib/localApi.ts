// Local-first API. Same surface the pages always consumed (via the
// `src/lib/api.ts` seam), now backed by the persistent store — and the weather
// methods hit Open-Meteo for real. A fetch-based server client can still drop
// in behind the same interface.

import type {
  Alert,
  Crop,
  Farm,
  FarmCell,
  ForecastDay,
  NdviEstimate,
  PlanState,
  Sensor,
  SensorReading,
  Simulation,
  SimulationResults,
  Weather,
  WeatherHistoryPoint,
} from '@/types';
import { cropLibrary } from '@/data/crops';
import { state, persist } from '@/lib/store';
import { deriveAlerts, fetchFarmWeather, type FarmWeather } from '@/lib/weather';
import { fetchClimateNormals } from '@/lib/climate';
import { fetchSeasonEnsembles } from '@/lib/ensembles';
import { fetchClimateProjection } from '@/lib/cmip6';
import { runSimulation } from '@/lib/sim';

function farmOrThrow(id: number): Farm {
  const f = state.farms.find((x) => x.id === id);
  if (!f) throw new Error(`Farm ${id} not found`);
  return f;
}

function sensorOrThrow(id: number): Sensor {
  const s = state.sensors.find((x) => x.id === id);
  if (!s) throw new Error(`Sensor ${id} not found`);
  return s;
}

// One Open-Meteo call serves weather + forecast + history for a farm; memoize
// per coordinate for 15 minutes and dedupe in-flight requests.
const WEATHER_TTL_MS = 15 * 60 * 1000;
const weatherMemo = new Map<string, { at: number; promise: Promise<FarmWeather> }>();

function farmWeather(farm: Farm): Promise<FarmWeather> {
  const key = `${farm.lat.toFixed(2)},${farm.lng.toFixed(2)}`;
  const hit = weatherMemo.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.promise;
  const promise = fetchFarmWeather(farm.lat, farm.lng).catch((err) => {
    weatherMemo.delete(key); // don't cache failures
    throw err;
  });
  weatherMemo.set(key, { at: Date.now(), promise });
  return promise;
}

export interface Api {
  // Farms
  listFarms: () => Promise<Farm[]>;
  getFarm: (id: number) => Promise<Farm>;
  createFarm: (input: Omit<Farm, 'id' | 'createdAt'>) => Promise<Farm>;
  updateFarm: (id: number, patch: Partial<Farm>) => Promise<Farm>;
  deleteFarm: (id: number) => Promise<void>;

  // Weather (real, Open-Meteo)
  getWeather: (farmId: number) => Promise<Weather>;
  getForecast: (farmId: number) => Promise<ForecastDay[]>;
  getWeatherHistory: (farmId: number, limit?: number) => Promise<WeatherHistoryPoint[]>;

  // Alerts (derived from the real forecast)
  listAlerts: (farmId: number) => Promise<Alert[]>;
  markAlertRead: (id: number) => Promise<Alert>;
  markAllAlertsRead: (farmId: number) => Promise<{ updated: number }>;

  // Sensors (manual readings)
  listSensors: (farmId: number) => Promise<Sensor[]>;
  createSensor: (farmId: number, input: { name: string; sensorType: Sensor['sensorType'] }) => Promise<Sensor>;
  deleteSensor: (id: number) => Promise<void>;
  listReadings: (sensorId: number, limit?: number) => Promise<SensorReading[]>;
  addReading: (sensorId: number, value: number, unit: string) => Promise<SensorReading>;

  // Legacy voxel cells / NDVI (Monitoring page)
  listCells: (farmId: number) => Promise<FarmCell[]>;
  setCellCrop: (farmId: number, cellId: number, cropId: number | null) => Promise<FarmCell>;
  getNdvi: (farmId: number) => Promise<NdviEstimate>;

  // Plot plans (designer)
  getPlan: (farmId: number) => Promise<PlanState | null>;
  savePlan: (plan: PlanState) => Promise<PlanState>;

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

export const localApi: Api = {
  // Farms
  listFarms: async () => [...state.farms],
  getFarm: async (id) => ({ ...farmOrThrow(id) }),
  createFarm: async (input) => {
    const farm: Farm = {
      ...input,
      id: state.counters.farm++,
      createdAt: new Date().toISOString(),
    };
    state.farms = [farm, ...state.farms];
    persist();
    return farm;
  },
  updateFarm: async (id, patch) => {
    const f = farmOrThrow(id);
    Object.assign(f, patch);
    persist();
    return { ...f };
  },
  deleteFarm: async (id) => {
    state.farms = state.farms.filter((f) => f.id !== id);
    state.cells = state.cells.filter((c) => c.farmId !== id);
    state.simulations = state.simulations.filter((s) => s.farmId !== id);
    state.sensors = state.sensors.filter((s) => s.farmId !== id);
    delete state.plans[id];
    persist();
  },

  // Weather
  getWeather: async (farmId) => (await farmWeather(farmOrThrow(farmId))).weather,
  getForecast: async (farmId) => (await farmWeather(farmOrThrow(farmId))).forecast,
  getWeatherHistory: async (farmId, limit = 24) =>
    (await farmWeather(farmOrThrow(farmId))).history.slice(-limit),

  // Alerts
  listAlerts: async (farmId) => {
    const farm = farmOrThrow(farmId);
    try {
      const { forecast } = await farmWeather(farm);
      return deriveAlerts(farmId, forecast, (id) => !!state.alertReads[id]);
    } catch {
      return []; // offline with no cache → no alerts rather than an error wall
    }
  },
  markAlertRead: async (id) => {
    state.alertReads[id] = true;
    persist();
    // Caller only uses invalidation; echo a minimal record.
    return {
      id, farmId: 0, alertType: 'frost', severity: 'info',
      message: '', isRead: true, createdAt: new Date().toISOString(),
    };
  },
  markAllAlertsRead: async (farmId) => {
    const farm = farmOrThrow(farmId);
    const { forecast } = await farmWeather(farm);
    const alerts = deriveAlerts(farmId, forecast, () => false);
    let updated = 0;
    for (const a of alerts) {
      if (!state.alertReads[a.id]) {
        state.alertReads[a.id] = true;
        updated++;
      }
    }
    persist();
    return { updated };
  },

  // Sensors
  listSensors: async (farmId) => state.sensors.filter((s) => s.farmId === farmId),
  createSensor: async (farmId, input) => {
    const sensor: Sensor = {
      id: state.counters.sensor++,
      farmId,
      name: input.name,
      sensorType: input.sensorType,
      isActive: true,
      lastValue: null,
      lastUnit: null,
      lastReadingAt: null,
    };
    state.sensors = [...state.sensors, sensor];
    persist();
    return sensor;
  },
  deleteSensor: async (id) => {
    state.sensors = state.sensors.filter((s) => s.id !== id);
    delete state.readings[id];
    persist();
  },
  listReadings: async (sensorId, limit = 20) =>
    (state.readings[sensorId] ?? []).slice(-limit),
  addReading: async (sensorId, value, unit) => {
    const sensor = sensorOrThrow(sensorId);
    const reading: SensorReading = {
      id: state.counters.reading++,
      sensorId,
      value,
      recordedAt: new Date().toISOString(),
    };
    state.readings[sensorId] = [...(state.readings[sensorId] ?? []), reading];
    sensor.lastValue = value;
    sensor.lastUnit = unit;
    sensor.lastReadingAt = reading.recordedAt;
    persist();
    return reading;
  },

  // Legacy cells / NDVI
  listCells: async (farmId) => state.cells.filter((c) => c.farmId === farmId),
  setCellCrop: async (farmId, cellId, cropId) => {
    const c = state.cells.find((x) => x.id === cellId && x.farmId === farmId);
    if (!c) throw new Error(`Cell ${cellId} not found on farm ${farmId}`);
    c.cropId = cropId;
    persist();
    return { ...c };
  },
  getNdvi: async (farmId) => {
    const n = state.ndvi[farmId];
    if (n) return { ...n };
    return { farmId, ndviGrid: [], timestamp: new Date().toISOString() };
  },

  // Plans
  getPlan: async (farmId) => state.plans[farmId] ?? null,
  savePlan: async (plan) => {
    state.plans[plan.farmId] = { ...plan, updatedAt: new Date().toISOString() };
    persist();
    return state.plans[plan.farmId];
  },

  // Simulations
  listSimulations: async (farmId) => state.simulations.filter((s) => s.farmId === farmId),
  createSimulation: async (farmId, input) => {
    // Real plan-aware engine (lib/sim.ts): inventory from the actual plan,
    // daily series from the live forecast + ERA5 normals, per-crop stress →
    // outcomes. Every fetch is graceful: offline degrades to cached weather
    // and/or the climate-derived series, never a rejection.
    const farm = farmOrThrow(farmId);
    let forecast;
    try {
      forecast = (await farmWeather(farm)).forecast;
    } catch {
      // offline → engine uses climate normals / documented fallback
    }
    const climate = await fetchClimateNormals(farm.lat, farm.lng);
    // Season ensembles (cache-served after the first run) power the yield
    // range; the CMIP6 projection is heavy + forever-cached, so only fetch it
    // when the climate_change scenario will actually use it.
    const ensembles = await fetchSeasonEnsembles(farm.lat, farm.lng);
    const projection =
      input.scenarioType === 'climate_change'
        ? await fetchClimateProjection(farm.lat, farm.lng)
        : null;
    const outcome = runSimulation({
      farm,
      plan: state.plans[farmId] ?? null,
      crops: [...cropLibrary, ...state.customCrops],
      input,
      forecast,
      climate,
      ensembles,
      projection,
    });
    const results: SimulationResults = outcome;

    const sim: Simulation = {
      id: state.counters.sim++,
      farmId,
      ...input,
      status: 'complete',
      results: JSON.stringify(results),
      createdAt: new Date().toISOString(),
    };
    state.simulations = [sim, ...state.simulations];
    persist();
    return sim;
  },
  deleteSimulation: async (id) => {
    state.simulations = state.simulations.filter((s) => s.id !== id);
    persist();
  },

  // Crops
  listCrops: async () => [...cropLibrary, ...state.customCrops],
  createCrop: async (input) => {
    const crop: Crop = { ...input, id: state.counters.crop++, isCustom: true };
    state.customCrops = [crop, ...state.customCrops];
    persist();
    return crop;
  },
};
