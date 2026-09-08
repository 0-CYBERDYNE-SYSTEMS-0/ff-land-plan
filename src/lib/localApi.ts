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
import { fetchSoilProfile } from '@/lib/soil';
import { SCENARIOS } from '@/lib/growth';
import { buildEnvSeries, extractWeatherOverrides, meanDailyGddForRange } from '@/lib/sim/environment';
import { simulateRun } from '@/lib/sim/engine';
import type { CreateSimRunInput, RunConfig, RunRecord } from '@/lib/sim/types';

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

  // Sim runs (deterministic engine runs — SPEC-SIM-ECOSYSTEM; the legacy
  // slider `Simulation`s above stay until the Simulations page migrates)
  createSimRun: (input: CreateSimRunInput) => Promise<RunRecord>;
  listSimRuns: (farmId: number) => Promise<RunRecord[]>;
  deleteSimRun: (id: string) => Promise<void>;

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
    state.simRuns = state.simRuns.filter((r) => r.farmId !== id);
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
      yieldTonHa, waterUseMm, carbonKgHa, profitUsdHa, stressScore, summary,
    };

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

  // Sim runs: fork the plan, compose the frozen env series (real archive →
  // ERA5 normals → defaults), replay the whole run synchronously for the
  // summary, and persist config + envSeries + summary ONLY (replay is the
  // storage — never per-tick state). Soil/climate fetches are forever-cached
  // and never throw; offline runs fall back to documented defaults.
  createSimRun: async (input) => {
    const farm = farmOrThrow(input.farmId);
    const plan = state.plans[input.farmId];
    if (!plan) throw new Error(`Farm ${input.farmId} has no plan to simulate`);
    const scenario = input.scenario ?? 'baseline';
    const preset = SCENARIOS[scenario];
    const config: RunConfig = {
      farmId: input.farmId,
      // Deep fork: a run never aliases the live plan (which keeps mutating).
      basePlan: structuredClone(plan),
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
      dayCount: Math.min(365, Math.max(1, Math.round(input.dayCount ?? 90))),
      seed: input.seed ?? 1,
      scenario,
      tempDeltaC: input.tempDeltaC ?? preset.tempDeltaC,
      precipMultiplier: input.precipMultiplier ?? preset.precipMultiplier,
      interventions: input.interventions ?? [],
      lat: farm.lat,
      lng: farm.lng,
    };
    const [normals, soil] = await Promise.all([
      fetchClimateNormals(farm.lat, farm.lng),
      fetchSoilProfile(farm.lat, farm.lng),
    ]);
    const envSeries = await buildEnvSeries(config.startDate, config.dayCount, {
      lat: farm.lat,
      lng: farm.lng,
      tempDeltaC: config.tempDeltaC,
      precipMultiplier: config.precipMultiplier,
      climateNormals: normals,
      weatherOverrides: extractWeatherOverrides(config.interventions),
    });
    // Kill the invisible 20 °C default when real climate exists: the run's
    // GDD pace comes from the normals over the actual window.
    const meanDailyGddC = meanDailyGddForRange(normals, config.startDate, config.dayCount);
    if (meanDailyGddC !== null) config.meanDailyGddC = meanDailyGddC;
    const { summary } = simulateRun(
      config,
      envSeries,
      { soil, crops: [...cropLibrary, ...state.customCrops] },
    );
    const record: RunRecord = {
      id: `run:${input.farmId}:${Date.now().toString(36)}`,
      farmId: input.farmId,
      label: input.label?.trim() || `${preset.label} · ${config.dayCount}d`,
      createdAt: new Date().toISOString(),
      config,
      envSeries,
      summary,
      status: 'complete',
    };
    state.simRuns = [record, ...state.simRuns];
    persist();
    return record;
  },
  listSimRuns: async (farmId) =>
    state.simRuns.filter((r) => r.farmId === farmId).map((r) => ({ ...r })),
  deleteSimRun: async (id) => {
    state.simRuns = state.simRuns.filter((r) => r.id !== id);
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
