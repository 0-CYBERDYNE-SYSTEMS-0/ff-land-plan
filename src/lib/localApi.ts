// Local-first API. Same surface the pages always consumed (via the
// `src/lib/api.ts` seam), now backed by the persistent store — and the weather
// methods hit Open-Meteo for real. A fetch-based server client can still drop
// in behind the same interface.

import type {
  Alert,
  Crop,
  CreateEnvironmentInput,
  Environment,
  EnvironmentAssetInstance,
  Farm,
  FarmCell,
  ForecastDay,
  NdviEstimate,
  Observation,
  ObservationInput,
  ObservationPatch,
  PlanState,
  GrowingTargetKey,
  GrowingTargetRef,
  SitePlan,
  Sensor,
  SensorReading,
  SeasonRecord,
  Simulation,
  Weather,
  WeatherHistoryPoint,
} from '@/types';
import { cropLibrary } from '@/data/crops';
import { seedFarms } from '@/data/seed';
import { assetLibrary } from '@/data/assets';
import { archetypes } from '@/creative/archetypes';
import { assertStoreWritable, state, persistWithAck, ensureLegacySimRunsMigrated } from '@/lib/store';
import { deleteFarmRecords, deleteRecord, getAllRecords, getRecord, putRecord } from '@/lib/db';
import { deriveAlerts, fetchFarmWeather, type FarmWeather } from '@/lib/weather';
import { fetchClimateNormals } from '@/lib/climate';
import { fetchSoilProfile } from '@/lib/soil';
import { SCENARIOS } from '@/lib/growth';
import { buildEnvSeries, extractWeatherOverrides, meanDailyGddForRange } from '@/lib/sim/environment';
import { simulateRun } from '@/lib/sim/engine';
import { freezeRunModelInputs } from '@/lib/sim/model-inputs';
import type { ClimateEquipmentInput } from '@/lib/sim/environment-climate';
import { NO_CLIMATE_EQUIPMENT } from '@/lib/sim/environment-climate';
import { equipmentTermsFor } from '@/lib/sim/equipment';
import type { CreateSimRunInput, RunAssetPhysicsSnapshot, RunConfig, RunRecord } from '@/lib/sim/types';
import type { FarmCalibration } from '@/lib/sim/calibration';
import { canonicalizeObservations } from '@/lib/sim/observations';
import { environmentSnapshot, legacyPlanForEnvironment, makeEnvironment, normalizeEnvironment, siteForEnvironments } from '@/lib/environment-model';
import { growingTargetKey, parseTargetCellKey } from '@/lib/growingTargets';
import { normalizeSeasonRecord } from '@/lib/campaign';
import { ASSET_PHYSICS_ENABLED, CAMPAIGN_ENABLED, ENV_CLIMATE_ENABLED, ENV_RECORDS_ENABLED, TIMELINE_ENABLED, TWIN_ENABLED } from '@/lib/featureFlags';
import { fetchMonthlyDli } from '@/lib/light';

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

function validateSensorEnvironment(farmId: number, environmentId: string | undefined): void {
  if (!environmentId) return;
  const exists = state.sites[farmId]?.environments.some((environment) => environment.id === environmentId);
  if (!exists) throw new Error(`Growing world ${environmentId} not found on farm ${farmId}.`);
}

let observationSequence = 0;

function newObservationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `obs:${uuid}`;
  observationSequence += 1;
  return `obs:${Date.now().toString(36)}:${observationSequence.toString(36)}`;
}

function newSimRunId(farmId: number): string {
  const cryptoApi = globalThis.crypto;
  try {
    const uuid = cryptoApi?.randomUUID?.();
    if (uuid) return `run:${farmId}:${uuid}`;
  } catch {
    // Fall back to getRandomValues when randomUUID is unavailable.
  }
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure randomness is unavailable; cannot create a unique sim run ID.');
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `run:${farmId}:${token}`;
}

function newestRunFirst(a: RunRecord, b: RunRecord): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
}

async function storeLocalRunWithCap(run: RunRecord): Promise<void> {
  assertStoreWritable();
  const previous = state.simRuns;
  state.simRuns = [structuredClone(run), ...previous.filter((entry) => entry.id !== run.id)]
    .sort(newestRunFirst)
    .slice(0, 40);
  try {
    await persistWithAck();
  } catch (error) {
    state.simRuns = previous;
    throw new Error('Could not persist this sim run to localStorage. The previous run list was retained.', { cause: error });
  }
}

async function storeRunWithCap(run: RunRecord, mode: 'indexeddb' | 'localstorage'): Promise<void> {
  assertStoreWritable();
  if (mode === 'localstorage') {
    await storeLocalRunWithCap(run);
    return;
  }
  const existing = await getAllRecords<RunRecord>('runs');
  const retained = [run, ...existing.filter((entry) => entry.id !== run.id)]
    .sort(newestRunFirst)
    .slice(0, 40);
  const retainedIds = new Set(retained.map((entry) => entry.id));
  assertStoreWritable();
  await putRecord('runs', run.id, structuredClone(run));
  assertStoreWritable();
  await Promise.all(existing
    .filter((entry) => !retainedIds.has(entry.id))
    .map((entry) => deleteRecord('runs', entry.id)));
}

function siteOrThrow(farmId: number): SitePlan {
  const site = state.sites[farmId];
  if (!site) throw new Error(`Farm ${farmId} has no site plan`);
  return site;
}

function requireEnvironmentRecords(): void {
  if (!ENV_RECORDS_ENABLED) {
    throw new Error('Growing-world records are disabled. Set VITE_FF_ENV_RECORDS=true to enable them.');
  }
}

function environmentIndex(site: SitePlan, environmentId: string): number {
  return site.environments.findIndex((environment) => environment.id === environmentId);
}

function nextEnvironmentId(farmId: number, environments: Environment[]): string {
  const used = new Set(environments.map((environment) => environment.id));
  let seq = 1;
  while (used.has(`env:${farmId}:${seq}`)) seq++;
  return `env:${farmId}:${seq}`;
}

function cloneEnvironmentWithNewIds(source: Environment, id: string): Environment {
  const copied = structuredClone(source);
  copied.id = id;
  copied.label = `${source.label} copy`;
  const spaceIds = new Map<string, string>();
  const levelIds = new Map<string, string>();
  copied.layout?.growingSpaces.forEach((space, spaceIndex) => {
    const nextSpaceId = `${id}:space:${spaceIndex + 1}`;
    spaceIds.set(space.id, nextSpaceId);
    space.id = nextSpaceId;
    space.levels.forEach((level, levelIndex) => {
      const nextLevelId = `${nextSpaceId}:level:${levelIndex + 1}`;
      levelIds.set(level.id, nextLevelId);
      level.id = nextLevelId;
    });
  });
  copied.instances?.forEach((instance, index) => {
    instance.id = `${id}:asset:${index + 1}`;
    if (instance.mount.kind === 'growing-level') {
      instance.mount = {
        kind: 'growing-level',
        growingSpaceId: spaceIds.get(instance.mount.growingSpaceId) ?? instance.mount.growingSpaceId,
        levelId: levelIds.get(instance.mount.levelId) ?? instance.mount.levelId,
      };
    }
  });
  if (copied.plan.targets) {
    copied.plan.targets = Object.fromEntries(Object.values(copied.plan.targets).map((targetPlan) => {
      const growingSpaceId = spaceIds.get(targetPlan.growingSpaceId) ?? targetPlan.growingSpaceId;
      const levelId = levelIds.get(targetPlan.levelId) ?? targetPlan.levelId;
      const targetKey = growingTargetKey({ kind: 'growing-level', growingSpaceId, levelId });
      return [targetKey, {
        ...targetPlan,
        growingSpaceId,
        levelId,
        planting: { ...targetPlan.planting },
        ...(targetPlan.plantedAt ? { plantedAt: { ...targetPlan.plantedAt } } : {}),
      }];
    }));
  }
  return copied;
}

function climateEquipment(terms: ReturnType<typeof equipmentTermsFor>): ClimateEquipmentInput {
  return {
    ppfdUmol: terms.ppfdUmol,
    lightingW: terms.lightingW,
    photoperiodH: terms.photoperiodH,
    achBoost: terms.achBoost,
    heatingKw: terms.heatingKw,
    coolingKw: terms.coolingKw,
    dehumLpd: terms.dehumLpd,
    dehumDerateBelowRh: terms.dehumDerateBelowRh,
    co2TargetPpm: terms.co2TargetPpm,
    co2KgDay: terms.co2KgDay,
  };
}

function soillessCellsForTarget(
  environment: Environment,
  plan: PlanState,
  target: GrowingTargetRef,
): string[] {
  const cellM = plan.cellM > 0 ? plan.cellM : 0.25;
  const covered = new Set<string>();
  const assetBySlug = new Map(assetLibrary.map((asset) => [asset.slug, asset]));
  if (target.kind === 'floor') {
    for (const [cell, slug] of Object.entries(plan.ground)) {
      if (assetBySlug.get(slug)?.physics?.kind === 'soilless') covered.add(cell);
    }
  }

  const bounds = target.kind === 'floor'
    ? { x: 0, y: 0, widthM: plan.widthM, depthM: plan.heightM }
    : (() => {
      const space = environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
      return space && space.levels.some((level) => level.id === target.levelId)
        ? { x: space.x, y: space.y, widthM: space.widthM, depthM: space.depthM }
        : null;
    })();
  if (!bounds) return [...covered].sort();

  const instances: EnvironmentAssetInstance[] = (environment.instances ?? []).filter((instance) => {
    if (assetBySlug.get(instance.slug)?.physics?.kind !== 'soilless') return false;
    if (target.kind === 'floor') return instance.mount.kind === 'floor';
    return instance.mount.kind === 'growing-level'
      && instance.mount.growingSpaceId === target.growingSpaceId
      && instance.mount.levelId === target.levelId;
  });
  const x0 = Math.max(0, Math.floor(bounds.x / cellM));
  const y0 = Math.max(0, Math.floor(bounds.y / cellM));
  const x1 = Math.ceil((bounds.x + bounds.widthM) / cellM);
  const y1 = Math.ceil((bounds.y + bounds.depthM) / cellM);
  for (const instance of instances) {
    const ix1 = instance.x + instance.widthM;
    const iy1 = instance.y + instance.depthM;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const cx0 = x * cellM;
        const cy0 = y * cellM;
        const overlaps = cx0 < ix1 && cx0 + cellM > instance.x && cy0 < iy1 && cy0 + cellM > instance.y;
        if (overlaps) covered.add(`${x},${y}`);
      }
    }
  }
  return [...covered].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    return ay! - by! || ax! - bx!;
  });
}

function hydroRequiredCellsForTarget(
  environment: Environment,
  plan: PlanState,
  target: GrowingTargetRef,
): string[] {
  if (target.kind !== 'growing-level') return [];
  const space = environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
  if (space?.kind !== 'hydro' || !space.levels.some((level) => level.id === target.levelId)) return [];
  const cellM = plan.cellM > 0 ? plan.cellM : 0.25;
  const x0 = Math.max(0, Math.floor(space.x / cellM));
  const y0 = Math.max(0, Math.floor(space.y / cellM));
  const x1 = Math.ceil((space.x + space.widthM) / cellM);
  const y1 = Math.ceil((space.y + space.depthM) / cellM);
  const cells: string[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const x0M = x * cellM;
      const y0M = y * cellM;
      if (x0M < space.x + space.widthM && x0M + cellM > space.x
        && y0M < space.y + space.depthM && y0M + cellM > space.y) {
        cells.push(`${x},${y}`);
      }
    }
  }
  return cells;
}

function runAssetPhysicsSnapshot(environment: Environment, plan: PlanState): RunAssetPhysicsSnapshot {
  const archetype = archetypes[environment.archetype];
  const targets: GrowingTargetRef[] = [
    { kind: 'floor' },
    ...(environment.layout?.growingSpaces.flatMap((space) => space.levels.map((level) => ({
      kind: 'growing-level' as const,
      growingSpaceId: space.id,
      levelId: level.id,
    }))) ?? []),
  ];
  const room = equipmentTermsFor(plan, archetype, environment);
  const targetTerms = Object.fromEntries(targets.map((target) => [
    growingTargetKey(target),
    equipmentTermsFor(plan, archetype, environment, target),
  ])) as Partial<Record<GrowingTargetKey, ReturnType<typeof equipmentTermsFor>>>;
  const soillessCells = Object.fromEntries(targets.map((target) => [
    growingTargetKey(target),
    soillessCellsForTarget(environment, plan, target),
  ])) as Partial<Record<GrowingTargetKey, string[]>>;
  const hydroRequiredCells = Object.fromEntries(targets.map((target) => [
    growingTargetKey(target),
    hydroRequiredCellsForTarget(environment, plan, target),
  ])) as Partial<Record<GrowingTargetKey, string[]>>;
  return { model: 'assets-v1', room, targets: targetTerms, soillessCells, hydroRequiredCells };
}

function soilCarryInputsForRun(
  carryByTarget: CreateSimRunInput['soilCarryByTarget'],
  environment: Environment | undefined,
): RunConfig['soilCarryByTarget'] {
  if (!carryByTarget) return undefined;
  return Object.fromEntries(Object.entries(carryByTarget).filter(([key]) => {
    if (key === 'floor') return true;
    const target = parseTargetCellKey(`${key}|0,0`).target;
    if (target.kind !== 'growing-level') return false;
    const space = environment?.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
    return !!space && space.kind !== 'hydro';
  }));
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
  createSensor: (farmId: number, input: { name: string; sensorType: Sensor['sensorType']; environmentId?: string }) => Promise<Sensor>;
  updateSensor: (id: number, patch: { environmentId: string | null }) => Promise<Sensor>;
  deleteSensor: (id: number) => Promise<void>;
  listReadings: (sensorId: number, limit?: number) => Promise<SensorReading[]>;
  addReading: (sensorId: number, value: number, unit: string) => Promise<SensorReading>;

  // Twin observations and approved per-world calibrations
  listObservations: (farmId: number, environmentId?: string) => Promise<Observation[]>;
  addObservation: (input: ObservationInput) => Promise<Observation>;
  updateObservation: (id: string, patch: ObservationPatch) => Promise<Observation>;
  deleteObservation: (id: string) => Promise<void>;
  listFarmCalibrations: (farmId: number) => Promise<FarmCalibration[]>;
  saveFarmCalibration: (calibration: FarmCalibration) => Promise<FarmCalibration>;

  // Legacy voxel cells / NDVI (Monitoring page)
  listCells: (farmId: number) => Promise<FarmCell[]>;
  setCellCrop: (farmId: number, cellId: number, cropId: number | null) => Promise<FarmCell>;
  getNdvi: (farmId: number) => Promise<NdviEstimate>;

  // Plot plans (designer)
  getPlan: (farmId: number, environmentId?: string) => Promise<PlanState | null>;
  savePlan: (plan: PlanState, environmentId?: string) => Promise<PlanState>;
  getSitePlan: (farmId: number) => Promise<SitePlan | null>;
  saveSitePlan: (site: SitePlan) => Promise<SitePlan>;
  createEnvironment: (farmId: number, input: CreateEnvironmentInput) => Promise<Environment>;
  getEnvironment: (farmId: number, environmentId: string) => Promise<Environment | null>;
  saveEnvironment: (environment: Environment) => Promise<Environment>;
  duplicateEnvironment: (farmId: number, environmentId: string) => Promise<Environment>;
  deleteEnvironment: (farmId: number, environmentId: string) => Promise<void>;
  getSelectedEnvironmentId: (farmId: number) => Promise<string | null>;
  setSelectedEnvironmentId: (farmId: number, environmentId: string | null) => Promise<void>;

  // Simulations (legacy records only — the farm-blind creation arithmetic was
  // deleted with the run manager; old stored sims stay readable/deletable)
  listSimulations: (farmId: number) => Promise<Simulation[]>;
  deleteSimulation: (id: number) => Promise<void>;

  // Sim runs (deterministic engine runs — SPEC-SIM-ECOSYSTEM; the Simulations
  // page is a run manager over these)
  createSimRun: (input: CreateSimRunInput) => Promise<RunRecord>;
  listSimRuns: (farmId: number) => Promise<RunRecord[]>;
  saveSimRun: (run: RunRecord) => Promise<RunRecord>;
  deleteSimRun: (id: string) => Promise<void>;

  // Campaign records (season summaries over replayable sim runs)
  listSeasons: (farmId: number) => Promise<SeasonRecord[]>;
  saveSeason: (season: SeasonRecord) => Promise<SeasonRecord>;
  deleteSeason: (id: string) => Promise<void>;

  // Crops
  listCrops: () => Promise<Crop[]>;
  createCrop: (input: Omit<Crop, 'id' | 'isCustom'>) => Promise<Crop>;
}

export const localApi: Api = {
  // Farms
  listFarms: async () => [...state.farms],
  getFarm: async (id) => ({ ...farmOrThrow(id) }),
  createFarm: async (input) => {
    assertStoreWritable();
    const farm: Farm = {
      ...input,
      id: state.counters.farm++,
      createdAt: new Date().toISOString(),
    };
    state.farms = [farm, ...state.farms];
    await persistWithAck();
    return farm;
  },
  updateFarm: async (id, patch) => {
    assertStoreWritable();
    const f = farmOrThrow(id);
    Object.assign(f, patch);
    await persistWithAck();
    return { ...f };
  },
  deleteFarm: async (id) => {
    assertStoreWritable();
    const previous = structuredClone(state);
    const runStorage = await ensureLegacySimRunsMigrated();
    assertStoreWritable();
    state.farms = state.farms.filter((f) => f.id !== id);
    state.cells = state.cells.filter((c) => c.farmId !== id);
    state.simulations = state.simulations.filter((s) => s.farmId !== id);
    if (runStorage === 'localstorage') {
      state.simRuns = state.simRuns.filter((r) => r.farmId !== id);
    }
    state.sensors = state.sensors.filter((s) => s.farmId !== id);
    delete state.plans[id];
    delete state.sites[id];
    delete state.selectedEnvironmentIds[id];
    if (seedFarms.some((farm) => farm.id === id) && !state.deletedSampleFarmIds.includes(id)) {
      state.deletedSampleFarmIds = [...state.deletedSampleFarmIds, id].sort((a, b) => a - b);
    }
    try {
      await persistWithAck();
    } catch (error) {
      Object.assign(state, previous);
      throw error;
    }
    try {
      assertStoreWritable();
      await deleteFarmRecords(id, runStorage === 'indexeddb', assertStoreWritable);
    } catch (error) {
      Object.assign(state, previous);
      try {
        await persistWithAck();
      } catch {
        // The in-memory snapshot remains available for the shell Retry action.
      }
      throw error;
    }
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
      const { forecast, weather } = await farmWeather(farm);
      return deriveAlerts(farmId, forecast, (id) => !!state.alertReads[id], weather.current?.soilMoisture ?? null);
    } catch {
      return []; // offline with no cache → no alerts rather than an error wall
    }
  },
  markAlertRead: async (id) => {
    assertStoreWritable();
    state.alertReads[id] = true;
    await persistWithAck();
    // Caller only uses invalidation; echo a minimal record.
    return {
      id, farmId: 0, alertType: 'frost', severity: 'info',
      message: '', isRead: true, createdAt: new Date().toISOString(),
    };
  },
  markAllAlertsRead: async (farmId) => {
    assertStoreWritable();
    const farm = farmOrThrow(farmId);
    const { forecast, weather } = await farmWeather(farm);
    assertStoreWritable();
    const alerts = deriveAlerts(farmId, forecast, () => false, weather.current?.soilMoisture ?? null);
    let updated = 0;
    for (const a of alerts) {
      if (!state.alertReads[a.id]) {
        state.alertReads[a.id] = true;
        updated++;
      }
    }
    await persistWithAck();
    return { updated };
  },

  // Sensors
  listSensors: async (farmId) => state.sensors.filter((s) => s.farmId === farmId),
  createSensor: async (farmId, input) => {
    assertStoreWritable();
    if (input.environmentId && !TWIN_ENABLED) {
      throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to associate sensors with a growing world.');
    }
    validateSensorEnvironment(farmId, input.environmentId);
    const sensor: Sensor = {
      id: state.counters.sensor++,
      farmId,
      name: input.name,
      sensorType: input.sensorType,
      ...(input.environmentId ? { environmentId: input.environmentId } : {}),
      isActive: true,
      lastValue: null,
      lastUnit: null,
      lastReadingAt: null,
    };
    state.sensors = [...state.sensors, sensor];
    await persistWithAck();
    return sensor;
  },
  updateSensor: async (id, patch) => {
    assertStoreWritable();
    const sensor = sensorOrThrow(id);
    if (patch.environmentId && !TWIN_ENABLED) {
      throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to associate sensors with a growing world.');
    }
    validateSensorEnvironment(sensor.farmId, patch.environmentId ?? undefined);
    if (patch.environmentId === null) delete sensor.environmentId;
    else sensor.environmentId = patch.environmentId;
    await persistWithAck();
    return structuredClone(sensor);
  },
  deleteSensor: async (id) => {
    assertStoreWritable();
    const previousSensors = state.sensors;
    const previousReadings = state.readings;
    const nextSensors = previousSensors.filter((sensor) => sensor.id !== id);
    const nextReadings = { ...previousReadings };
    delete nextReadings[id];
    state.sensors = nextSensors;
    state.readings = nextReadings;
    try {
      await persistWithAck();
    } catch (error) {
      if (state.sensors === nextSensors) state.sensors = previousSensors;
      if (state.readings === nextReadings) {
        const restoredReadings = { ...nextReadings };
        if (Object.hasOwn(previousReadings, id)) restoredReadings[id] = previousReadings[id];
        else delete restoredReadings[id];
        state.readings = restoredReadings;
      }
      throw error;
    }
  },
  listReadings: async (sensorId, limit = 20) =>
    (state.readings[sensorId] ?? []).slice(-limit),
  addReading: async (sensorId, value, unit) => {
    assertStoreWritable();
    const sensor = sensorOrThrow(sensorId);
    const reading: SensorReading = {
      id: state.counters.reading++,
      sensorId,
      value,
      recordedAt: new Date().toISOString(),
    };
    // Cap per sensor to the newest 500 (localStorage-quota driver).
    state.readings[sensorId] = [...(state.readings[sensorId] ?? []), reading].slice(-500);
    sensor.lastValue = value;
    sensor.lastUnit = unit;
    sensor.lastReadingAt = reading.recordedAt;
    await persistWithAck();
    return reading;
  },
  listObservations: async (farmId, environmentId) => {
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable observations.');
    farmOrThrow(farmId);
    return (await getAllRecords<Observation>('observations'))
      .filter((observation) => observation.farmId === farmId
        && (environmentId === undefined || observation.environmentId === environmentId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map((observation) => structuredClone(observation));
  },
  addObservation: async (input) => {
    assertStoreWritable();
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable observations.');
    farmOrThrow(input.farmId);
    validateSensorEnvironment(input.farmId, input.environmentId);
    const [observation] = canonicalizeObservations([{ ...input, id: newObservationId() }]);
    assertStoreWritable();
    await putRecord('observations', observation!.id, observation!);
    return structuredClone(observation!);
  },
  updateObservation: async (id, patch) => {
    assertStoreWritable();
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable observations.');
    const existing = await getRecord<Observation>('observations', id);
    if (!existing) throw new Error(`Observation ${id} not found.`);
    const { environmentId, growingSpaceId, levelId, ...values } = patch;
    const cleanPatch: Partial<ObservationInput> = {
      ...values,
      ...(environmentId === undefined ? {} : { environmentId: environmentId ?? undefined }),
      ...(growingSpaceId === null || levelId === null
        ? { growingSpaceId: undefined, levelId: undefined }
        : {
          ...(growingSpaceId === undefined ? {} : { growingSpaceId }),
          ...(levelId === undefined ? {} : { levelId }),
        }),
    };
    const next: Observation = { ...existing, ...cleanPatch, id: existing.id, farmId: existing.farmId };
    if (next.environmentId !== existing.environmentId) validateSensorEnvironment(next.farmId, next.environmentId);
    const [validated] = canonicalizeObservations([next]);
    assertStoreWritable();
    await putRecord('observations', id, validated!);
    return structuredClone(validated!);
  },
  deleteObservation: async (id) => {
    assertStoreWritable();
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable observations.');
    await deleteRecord('observations', id);
  },

  // Legacy cells / NDVI
  listCells: async (farmId) => state.cells.filter((c) => c.farmId === farmId),
  setCellCrop: async (farmId, cellId, cropId) => {
    assertStoreWritable();
    const c = state.cells.find((x) => x.id === cellId && x.farmId === farmId);
    if (!c) throw new Error(`Cell ${cellId} not found on farm ${farmId}`);
    c.cropId = cropId;
    await persistWithAck();
    return { ...c };
  },
  getNdvi: async (farmId) => {
    const n = state.ndvi[farmId];
    if (n) return { ...n };
    return { farmId, ndviGrid: [], timestamp: new Date().toISOString() };
  },

  // Site/world records. Farm-only plan calls are deliberately a single-world
  // compatibility adapter; new planner calls always name their environment.
  getSitePlan: async (farmId) => {
    const site = state.sites[farmId];
    return site ? structuredClone(site) : null;
  },
  saveSitePlan: async (site) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    const normalized = siteForEnvironments(
      site.farmId,
      site.environments.map((environment) => normalizeEnvironment(environment, true)),
      site,
    );
    state.sites[site.farmId] = normalized;
    if (normalized.environments.length === 1) {
      state.plans[site.farmId] = legacyPlanForEnvironment(normalized.environments[0]!);
    }
    await persistWithAck();
    return structuredClone(normalized);
  },
  createEnvironment: async (farmId, input) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    farmOrThrow(farmId);
    const oldSite = state.sites[farmId] ?? {
      farmId,
      widthM: 0,
      heightM: 0,
      cellM: input.cellM ?? 0.25,
      environments: [],
      updatedAt: new Date().toISOString(),
    };
    const id = nextEnvironmentId(farmId, oldSite.environments);
    const x = input.x ?? (oldSite.environments.length === 0
      ? 0
      : Math.max(...oldSite.environments.map((environment) => environment.x + environment.widthM)));
    const environment = makeEnvironment(farmId, { ...input, x }, id);
    const next = siteForEnvironments(farmId, [...oldSite.environments, environment], oldSite);
    state.sites[farmId] = next;
    state.selectedEnvironmentIds[farmId] = id;
    if (next.environments.length === 1) state.plans[farmId] = legacyPlanForEnvironment(environment);
    await persistWithAck();
    return structuredClone(environment);
  },
  getEnvironment: async (farmId, environmentId) => {
    const site = state.sites[farmId];
    const environment = site?.environments.find((entry) => entry.id === environmentId);
    return environment ? structuredClone(environment) : null;
  },
  saveEnvironment: async (environment) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    farmOrThrow(environment.farmId);
    const site = siteOrThrow(environment.farmId);
    const index = environmentIndex(site, environment.id);
    if (index < 0) throw new Error(`Growing world ${environment.id} not found on farm ${environment.farmId}`);
    const normalized = normalizeEnvironment(environment, true);
    const environments = [...site.environments];
    environments[index] = normalized;
    state.sites[environment.farmId] = siteForEnvironments(environment.farmId, environments, site);
    if (environments.length === 1) state.plans[environment.farmId] = legacyPlanForEnvironment(normalized);
    await persistWithAck();
    return structuredClone(normalized);
  },
  duplicateEnvironment: async (farmId, environmentId) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    const site = siteOrThrow(farmId);
    const source = site.environments.find((entry) => entry.id === environmentId);
    if (!source) throw new Error(`Growing world ${environmentId} not found on farm ${farmId}`);
    const id = nextEnvironmentId(farmId, site.environments);
    const duplicate = cloneEnvironmentWithNewIds(source, id);
    duplicate.x = Math.max(...site.environments.map((environment) => environment.x + environment.widthM));
    duplicate.plan.updatedAt = new Date().toISOString();
    state.sites[farmId] = siteForEnvironments(farmId, [...site.environments, duplicate], site);
    state.selectedEnvironmentIds[farmId] = id;
    await persistWithAck();
    return structuredClone(duplicate);
  },
  deleteEnvironment: async (farmId, environmentId) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    const site = siteOrThrow(farmId);
    const index = environmentIndex(site, environmentId);
    if (index < 0) throw new Error(`Growing world ${environmentId} not found on farm ${farmId}`);
    const previousSelection = state.selectedEnvironmentIds[farmId];
    const previousPlan = state.plans[farmId];
    const environments = site.environments.filter((environment) => environment.id !== environmentId);
    const nextSite = siteForEnvironments(farmId, environments, site);
    state.sites[farmId] = nextSite;
    const clearsSelection = previousSelection === environmentId;
    if (clearsSelection) delete state.selectedEnvironmentIds[farmId];
    const updatesLegacyPlan = environments.length === 1;
    const nextPlan = updatesLegacyPlan ? legacyPlanForEnvironment(environments[0]!) : undefined;
    if (nextPlan) state.plans[farmId] = nextPlan;
    try {
      await persistWithAck();
    } catch (error) {
      if (state.sites[farmId] === nextSite) state.sites[farmId] = site;
      if (clearsSelection && state.selectedEnvironmentIds[farmId] === undefined && previousSelection !== undefined) {
        state.selectedEnvironmentIds[farmId] = previousSelection;
      }
      if (updatesLegacyPlan && state.plans[farmId] === nextPlan) {
        if (previousPlan === undefined) delete state.plans[farmId];
        else state.plans[farmId] = previousPlan;
      }
      throw error;
    }
  },
  getSelectedEnvironmentId: async (farmId) => state.selectedEnvironmentIds[farmId] ?? null,
  setSelectedEnvironmentId: async (farmId, environmentId) => {
    assertStoreWritable();
    requireEnvironmentRecords();
    farmOrThrow(farmId);
    if (environmentId === null) {
      delete state.selectedEnvironmentIds[farmId];
    } else {
      const site = state.sites[farmId];
      if (!site || !site.environments.some((environment) => environment.id === environmentId)) {
        throw new Error(`Growing world ${environmentId} not found on farm ${farmId}`);
      }
      state.selectedEnvironmentIds[farmId] = environmentId;
    }
    await persistWithAck();
  },
  getPlan: async (farmId, environmentId) => {
    const site = state.sites[farmId];
    if (!site) {
      if (environmentId || ENV_RECORDS_ENABLED) return null;
      return structuredClone(state.plans[farmId] ?? null);
    }
    const environment = environmentId
      ? site.environments.find((entry) => entry.id === environmentId)
      : site.environments.length === 1 ? site.environments[0] : undefined;
    return environment ? legacyPlanForEnvironment(environment) : null;
  },
  savePlan: async (plan, environmentId) => {
    assertStoreWritable();
    if (environmentId && !ENV_RECORDS_ENABLED) requireEnvironmentRecords();
    const site = state.sites[plan.farmId];
    if (!site) {
      if (ENV_RECORDS_ENABLED) {
        throw new Error(`Farm ${plan.farmId} has no growing world to save.`);
      }
      state.plans[plan.farmId] = { ...plan, updatedAt: new Date().toISOString() };
      await persistWithAck();
      return structuredClone(state.plans[plan.farmId]!);
    }
    const environment = environmentId
      ? site.environments.find((entry) => entry.id === environmentId)
      : site.environments.length === 1 ? site.environments[0] : undefined;
    if (!environment) {
      throw new Error(site.environments.length > 1
        ? 'Choose a growing world before saving this plan.'
        : `Farm ${plan.farmId} has no growing world to save.`);
    }
    const normalized = normalizeEnvironment({
      ...environment,
      plan: { ...plan, farmId: plan.farmId, updatedAt: new Date().toISOString() },
    });
    const environments = site.environments.map((entry) => entry.id === environment.id ? normalized : entry);
    state.sites[plan.farmId] = siteForEnvironments(plan.farmId, environments, site);
    if (environments.length === 1) state.plans[plan.farmId] = legacyPlanForEnvironment(normalized);
    await persistWithAck();
    return structuredClone(normalized.plan);
  },

  // Simulations (legacy): list + delete only — see the Api interface note.
  listSimulations: async (farmId) => state.simulations.filter((s) => s.farmId === farmId),
  deleteSimulation: async (id) => {
    assertStoreWritable();
    const previous = state.simulations;
    const next = previous.filter((simulation) => simulation.id !== id);
    state.simulations = next;
    try {
      await persistWithAck();
    } catch (error) {
      if (state.simulations === next) state.simulations = previous;
      throw error;
    }
  },

  // Sim runs: fork the plan, compose the frozen env series (real archive →
  // ERA5 normals → defaults), replay the whole run synchronously for the
  // summary, and persist config + envSeries + summary ONLY (replay is the
  // storage — never per-tick state). Soil/climate fetches are forever-cached
  // and never throw; offline runs fall back to documented defaults.
  createSimRun: async (input) => {
    assertStoreWritable();
    const farm = farmOrThrow(input.farmId);
    const runStorage = await ensureLegacySimRunsMigrated();
    if (input.soilCarryByTarget && !CAMPAIGN_ENABLED) {
      throw new Error('Campaign features are disabled. Set VITE_FF_CAMPAIGN=true to use soil carry.');
    }
    const site = state.sites[input.farmId];
    let environment: Environment | undefined;
    let plan: PlanState | undefined;
    if (ENV_RECORDS_ENABLED) {
      environment = input.environmentId
        ? site?.environments.find((entry) => entry.id === input.environmentId)
        : site?.environments.length === 1 ? site.environments[0] : undefined;
      plan = environment?.plan;
    } else {
      if (input.environmentId) requireEnvironmentRecords();
      if (site && site.environments.length > 1) {
        throw new Error('This farm has several growing worlds. Enable growing-world records and choose one before creating a run.');
      }
      environment = site?.environments[0];
      plan = environment ? legacyPlanForEnvironment(environment) : state.plans[input.farmId];
    }
    if (!plan) {
      throw new Error(site?.environments.length
        ? 'Choose a growing world before creating this run.'
        : `Farm ${input.farmId} has no plan to simulate`);
    }
    const scenario = input.scenario ?? 'baseline';
    const preset = SCENARIOS[scenario];
    const climateEnabled = ENV_RECORDS_ENABLED
      && ENV_CLIMATE_ENABLED
      && !!environment
      && archetypes[environment.archetype].kind !== 'open';
    const assetPhysics = ASSET_PHYSICS_ENABLED && ENV_RECORDS_ENABLED && environment
      ? runAssetPhysicsSnapshot(environment, plan)
      : undefined;
    const soilCarryByTarget = CAMPAIGN_ENABLED
      ? soilCarryInputsForRun(input.soilCarryByTarget, environment)
      : undefined;
    const config: RunConfig = {
      farmId: input.farmId,
      cropModelVersion: input.cropModelVersion ?? 'crop-model-v1',
      // Deep fork: a run never aliases the live plan (which keeps mutating).
      basePlan: structuredClone(plan),
      ...(ENV_RECORDS_ENABLED && environment ? { environment: environmentSnapshot(environment) } : {}),
      ...(assetPhysics ? { assetPhysics } : {}),
      ...(climateEnabled ? {
        climateModel: 'environment-v1' as const,
        climateEquipment: assetPhysics ? climateEquipment(assetPhysics.room) : { ...NO_CLIMATE_EQUIPMENT },
        climateTargetEquipment: assetPhysics
          ? Object.fromEntries(Object.entries(assetPhysics.targets).map(([key, terms]) => [key, climateEquipment(terms!)]))
          : {},
      } : {}),
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
      dayCount: Math.min(365, Math.max(1, Math.round(input.dayCount ?? 90))),
      seed: input.seed ?? 1,
      scenario,
      tempDeltaC: input.tempDeltaC ?? preset.tempDeltaC,
      precipMultiplier: input.precipMultiplier ?? preset.precipMultiplier,
      interventions: input.interventions ?? [],
      ...(soilCarryByTarget && Object.keys(soilCarryByTarget).length > 0
        ? { soilCarryByTarget: structuredClone(soilCarryByTarget) }
        : {}),
      lat: farm.lat,
      lng: farm.lng,
    };
    const [normals, soil, monthlyDli, calibration] = await Promise.all([
      fetchClimateNormals(farm.lat, farm.lng),
      fetchSoilProfile(farm.lat, farm.lng),
      climateEnabled ? fetchMonthlyDli(farm.lat, farm.lng) : Promise.resolve(null),
      TWIN_ENABLED && environment
        ? getRecord<FarmCalibration>('calibrations', environment.id)
        : Promise.resolve(undefined),
    ]);
    if (calibration?.farmId === farm.id && calibration.environmentId === environment?.id) {
      config.calibration = structuredClone(calibration);
    }
    const envSeries = await buildEnvSeries(config.startDate, config.dayCount, {
      lat: farm.lat,
      lng: farm.lng,
      tempDeltaC: config.tempDeltaC,
      precipMultiplier: config.precipMultiplier,
      climateNormals: normals,
      weatherOverrides: extractWeatherOverrides(config.interventions),
      ...(climateEnabled ? { monthlyDli } : {}),
    });
    // Kill the invisible 20 °C default when real climate exists: the run's
    // GDD pace comes from the normals over the actual window.
    const meanDailyGddC = meanDailyGddForRange(normals, config.startDate, config.dayCount);
    if (meanDailyGddC !== null) config.meanDailyGddC = meanDailyGddC;
    const runCtx = { soil, crops: [...cropLibrary, ...state.customCrops] };
    config.modelInputs = freezeRunModelInputs(config, runCtx);
    const { summary } = simulateRun(config, envSeries, runCtx);
    const record: RunRecord = {
      id: newSimRunId(input.farmId),
      farmId: input.farmId,
      // Two identical-param creates must not share a label — the RunInspector
      // reads "solid = X · ghost = X" when A/B-ing same-labeled runs.
      label:
        input.label?.trim() ||
        `${preset.label} · ${config.startDate} · ${config.dayCount}d · ${Date.now().toString(36).slice(-4)}`,
      createdAt: new Date().toISOString(),
      config,
      envSeries,
      summary,
      status: 'complete',
    };
    // Cap IndexedDB to the newest 40 complete records; the environment series
    // no longer shares the localStorage plan/settings blob.
    await storeRunWithCap(record, runStorage);
    return record;
  },
  listSimRuns: async (farmId) => {
    const mode = await ensureLegacySimRunsMigrated();
    const runs = mode === 'indexeddb' ? await getAllRecords<RunRecord>('runs') : state.simRuns;
    return runs
      .filter((run) => run.farmId === farmId)
      .sort(newestRunFirst)
      .map((run) => structuredClone(run));
  },
  saveSimRun: async (run) => {
    assertStoreWritable();
    if (!TIMELINE_ENABLED && !(TWIN_ENABLED && (run.observations?.length ?? 0) > 0)) {
      throw new Error('Timeline features are disabled. Set VITE_FF_TIMELINE=true to save forks or ensemble results.');
    }
    const mode = await ensureLegacySimRunsMigrated();
    const saved = structuredClone(run);
    assertStoreWritable();
    await storeRunWithCap(saved, mode);
    return structuredClone(saved);
  },
  deleteSimRun: async (id) => {
    assertStoreWritable();
    const mode = await ensureLegacySimRunsMigrated();
    assertStoreWritable();
    if (mode === 'indexeddb') {
      await deleteRecord('runs', id);
      return;
    }
    const previous = state.simRuns;
    state.simRuns = previous.filter((run) => run.id !== id);
    try {
      await persistWithAck();
    } catch (error) {
      state.simRuns = previous;
      throw new Error('Could not delete this sim run from localStorage. The previous run list was retained.', { cause: error });
    }
  },

  listSeasons: async (farmId) => {
    if (!CAMPAIGN_ENABLED) throw new Error('Campaign features are disabled. Set VITE_FF_CAMPAIGN=true to enable seasons.');
    return (await getAllRecords<SeasonRecord>('seasons'))
      .filter((season) => season.farmId === farmId)
      .map(normalizeSeasonRecord)
      .sort((a, b) => b.year - a.year || b.updatedAt.localeCompare(a.updatedAt))
      .map((season) => structuredClone(season));
  },
  saveSeason: async (season) => {
    assertStoreWritable();
    if (!CAMPAIGN_ENABLED) throw new Error('Campaign features are disabled. Set VITE_FF_CAMPAIGN=true to enable seasons.');
    farmOrThrow(season.farmId);
    const saved = structuredClone(season);
    assertStoreWritable();
    await putRecord('seasons', saved.id, saved);
    return structuredClone(saved);
  },
  deleteSeason: async (id) => {
    assertStoreWritable();
    if (!CAMPAIGN_ENABLED) throw new Error('Campaign features are disabled. Set VITE_FF_CAMPAIGN=true to enable seasons.');
    assertStoreWritable();
    await deleteRecord('seasons', id);
  },

  listFarmCalibrations: async (farmId) => {
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable calibration.');
    farmOrThrow(farmId);
    return (await getAllRecords<FarmCalibration>('calibrations'))
      .filter((calibration) => calibration.farmId === farmId)
      .sort((a, b) => a.environmentId.localeCompare(b.environmentId))
      .map((calibration) => structuredClone(calibration));
  },
  saveFarmCalibration: async (calibration) => {
    assertStoreWritable();
    if (!TWIN_ENABLED) throw new Error('Twin features are disabled. Set VITE_FF_TWIN=true to enable calibration.');
    farmOrThrow(calibration.farmId);
    validateSensorEnvironment(calibration.farmId, calibration.environmentId);
    if (calibration.version !== 'farm-calibration-v1' || !Number.isInteger(calibration.revision) || calibration.revision < 1) {
      throw new Error('Calibration version or revision is invalid.');
    }
    const existing = await getRecord<FarmCalibration>('calibrations', calibration.environmentId);
    const expectedRevision = existing ? existing.revision + 1 : 1;
    if (calibration.revision !== expectedRevision) {
      throw new Error(`Calibration changed since this proposal was prepared. Expected revision ${expectedRevision}.`);
    }
    const saved = structuredClone(calibration);
    assertStoreWritable();
    await putRecord('calibrations', saved.environmentId, saved);
    return structuredClone(saved);
  },

  // Crops
  listCrops: async () => [...cropLibrary, ...state.customCrops],
  createCrop: async (input) => {
    assertStoreWritable();
    const crop: Crop = { ...input, id: state.counters.crop++, isCustom: true };
    state.customCrops = [crop, ...state.customCrops];
    await persistWithAck();
    return crop;
  },
};
