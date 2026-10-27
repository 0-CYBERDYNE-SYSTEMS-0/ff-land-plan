// Persistent app store. Plans, settings and small records live in one
// localStorage blob (`ff-pro:v1`), loaded synchronously at boot and written
// debounced. Large sim runs migrate to IndexedDB before their local copies are
// removed.

import type {
  Crop,
  Farm,
  FarmCell,
  NdviEstimate,
  PlanState,
  Sensor,
  SensorReading,
  SitePlan,
  Simulation,
} from '@/types';
import type { RunRecord } from '@/lib/sim/types';
import {
  dispatchStorageConflict,
  dispatchStorageFailed,
  dispatchStorageSaved,
  getAllRecords,
  getRecord,
  putRecordIfAbsent,
} from '@/lib/db';
import { migrateEnvironmentStore } from '@/lib/environment-model';
import { CAMPAIGN_ENABLED, ENV_RECORDS_ENABLED, TIMELINE_ENABLED, TWIN_ENABLED } from '@/lib/featureFlags';
import {
  seedCells,
  seedFarms,
  seedNdvi,
  seedPlans,
  seedReadings,
  seedSensors,
  seedSimulations,
} from '@/data/seed';
import { seedDemoSites } from '@/data/demoWorlds';
import { estimateFrostDates } from '@/lib/frost';

const STORAGE_KEY = 'ff-pro:v1';
const RUN_MIGRATION_KEY = 'ff-pro:idb-runs-authoritative:v1';
const LOCAL_STORAGE_OPERATION = 'localStorage persist';

export interface StoreRecoveryState {
  message: string;
  raw: string | null;
  quarantineFailed: boolean;
}

export let storeRecovery: StoreRecoveryState | null = null;
let needsInitializationPersist = false;
let storageConflict = false;
let editorHasPendingWork = false;
let saveRevision = 0;
let durableSaveRevision = 0;
let retryHandler: (() => Promise<boolean | null>) | null = null;

function indexedDbRunsAreAuthoritative(): boolean {
  try {
    return localStorage.getItem(RUN_MIGRATION_KEY) === '1';
  } catch {
    return false;
  }
}

export interface AppState {
  version?: 2;
  /** True after legacy profiles have received their missing sample records. */
  sampleDataInitialized: true;
  /** Seed farm IDs explicitly removed by the user. */
  deletedSampleFarmIds: number[];
  farms: Farm[];
  customCrops: Crop[];
  cells: FarmCell[]; // legacy voxel cells (Monitoring still reads them)
  sensors: Sensor[];
  readings: Record<number, SensorReading[]>;
  simulations: Simulation[];
  ndvi: Record<number, NdviEstimate>;
  plans: Record<number, PlanState>;
  sites: Record<number, SitePlan>;
  selectedEnvironmentIds: Record<number, string>;
  alertReads: Record<number, true>;
  /** Deterministic sim engine runs (SPEC-SIM-ECOSYSTEM). Each RunRecord holds
   * config + frozen envSeries + summary only — state is rebuilt by replay,
   * never stored per-tick. Not seeded, not re-seeded with demo content. */
  simRuns: RunRecord[];
  counters: { farm: number; crop: number; sensor: number; reading: number; sim: number };
}

function seedState(): AppState {
  const farms = seedFarms.map((f) => ({
    ...f,
    elevationM: null,
    ...estimateFrostDates(f.lat),
  }));
  const sites = ENV_RECORDS_ENABLED ? seedDemoSites() : {};
  const selectedEnvironmentIds = ENV_RECORDS_ENABLED
    ? Object.fromEntries(Object.entries(sites).map(([farmId, site]) => [farmId, site.environments[0]!.id]))
    : {};
  return {
    ...(ENV_RECORDS_ENABLED ? { version: 2 as const } : {}),
    sampleDataInitialized: true,
    deletedSampleFarmIds: [],
    farms,
    customCrops: [],
    cells: [...seedCells],
    sensors: [...seedSensors],
    readings: { ...seedReadings },
    simulations: [...seedSimulations],
    ndvi: { ...seedNdvi },
    plans: { ...seedPlans },
    sites,
    selectedEnvironmentIds,
    alertReads: {},
    simRuns: [],
    counters: {
      farm: farms.length + 1,
      crop: 1000, // custom crops start above the static library range
      sensor: seedSensors.length + 1,
      reading: 100,
      sim: seedSimulations.length + 1,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStoredBlob(value: unknown): asserts value is Partial<AppState> {
  if (!isRecord(value)) throw new Error('Stored app data must be a JSON object.');
  const arrayKeys = ['farms', 'customCrops', 'cells', 'sensors', 'simulations', 'simRuns', 'deletedSampleFarmIds'] as const;
  for (const key of arrayKeys) {
    if (value[key] !== undefined && !Array.isArray(value[key])) {
      throw new Error(`Stored app data field "${key}" is invalid.`);
    }
  }
  const recordKeys = ['readings', 'ndvi', 'plans', 'sites', 'selectedEnvironmentIds', 'alertReads', 'counters'] as const;
  for (const key of recordKeys) {
    if (value[key] !== undefined && !isRecord(value[key])) {
      throw new Error(`Stored app data field "${key}" is invalid.`);
    }
  }
  if (Array.isArray(value.deletedSampleFarmIds) && value.deletedSampleFarmIds.some((id) => !Number.isInteger(id))) {
    throw new Error('Stored sample deletion markers are invalid.');
  }
  if (isRecord(value.plans) && Object.values(value.plans).some((plan) => !isRecord(plan))) {
    throw new Error('Stored plan data is invalid.');
  }
  if (isRecord(value.sites) && Object.values(value.sites).some((site) => !isRecord(site) || !Array.isArray(site.environments))) {
    throw new Error('Stored site data is invalid.');
  }
}

function load(): AppState {
  const fresh = seedState();
  if (typeof localStorage === 'undefined') return fresh;

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fresh;
    const rawParsed: unknown = JSON.parse(raw);
    assertStoredBlob(rawParsed);
    const migrated = ENV_RECORDS_ENABLED
      ? migrateEnvironmentStore(rawParsed)
      : {
          ...rawParsed,
          sites: rawParsed.sites ?? {},
          selectedEnvironmentIds: rawParsed.selectedEnvironmentIds ?? {},
        };
    const parsed = { ...rawParsed, ...migrated } as AppState;
    const seedMissingSamples = parsed.sampleDataInitialized !== true;
    const deletedSampleFarmIds = Array.isArray(parsed.deletedSampleFarmIds)
      ? parsed.deletedSampleFarmIds.filter((id): id is number => Number.isInteger(id))
      : [];
    const deletedSamples = new Set(deletedSampleFarmIds);
    const seedFarmIds = new Set(fresh.farms.map((farm) => farm.id));
    const storedFarms = Array.isArray(parsed.farms) ? parsed.farms : [];
    const storedFarmById = new Map(storedFarms.map((farm) => [farm.id, farm]));

    // Legacy profiles without the marker receive any genuinely absent sample
    // records once. Existing sample rows always overlay their seed defaults;
    // subsequent deletions are represented by deletedSampleFarmIds.
    const farms = fresh.farms.flatMap((seedFarm) => {
      if (deletedSamples.has(seedFarm.id)) return [];
      const stored = storedFarmById.get(seedFarm.id);
      if (stored) return [{ ...seedFarm, ...stored }];
      return seedMissingSamples ? [seedFarm] : [];
    });
    for (const stored of storedFarms) {
      if (!seedFarmIds.has(stored.id)) farms.push(stored);
    }

    const plans = {
      ...(seedMissingSamples ? fresh.plans : {}),
      ...(parsed.plans ?? {}),
    };
    const sites = {
      ...(seedMissingSamples && ENV_RECORDS_ENABLED ? fresh.sites : {}),
      ...(parsed.sites ?? {}),
    };
    const selectedEnvironmentIds = {
      ...(seedMissingSamples && ENV_RECORDS_ENABLED ? fresh.selectedEnvironmentIds : {}),
      ...(parsed.selectedEnvironmentIds ?? {}),
    };
    for (const [key, site] of Object.entries(parsed.sites ?? {})) {
      if (parsed.selectedEnvironmentIds?.[Number(key)] === undefined) {
        delete selectedEnvironmentIds[Number(key)];
      }
      if (site.environments.length === 0) delete selectedEnvironmentIds[Number(key)];
    }
    for (const farmId of deletedSamples) {
      delete plans[farmId];
      delete sites[farmId];
      delete selectedEnvironmentIds[farmId];
    }

    // Forward-compat: merge over a fresh shape, while the sample-specific maps
    // above preserve stored plans and canonical v2 site records exactly.
    const merged = { ...fresh, ...parsed };
    merged.farms = farms;
    merged.plans = plans;
    merged.sites = sites;
    merged.selectedEnvironmentIds = selectedEnvironmentIds;
    merged.sampleDataInitialized = true;
    merged.deletedSampleFarmIds = deletedSampleFarmIds;

    // Sim runs are additive user data (never seeded): keep the stored list
    // as-is; missing/corrupt key degrades to empty.
    merged.simRuns = indexedDbRunsAreAuthoritative() ? [] : (parsed.simRuns ?? fresh.simRuns)
      .filter((run) => !deletedSamples.has(run.farmId));

    if (deletedSamples.size > 0) {
      const deletedSensorIds = new Set(merged.sensors.filter((sensor) => deletedSamples.has(sensor.farmId)).map((sensor) => sensor.id));
      merged.cells = merged.cells.filter((cell) => !deletedSamples.has(cell.farmId));
      merged.sensors = merged.sensors.filter((sensor) => !deletedSamples.has(sensor.farmId));
      merged.simulations = merged.simulations.filter((simulation) => !deletedSamples.has(simulation.farmId));
      merged.readings = Object.fromEntries(Object.entries(merged.readings).filter(([id]) => !deletedSensorIds.has(Number(id))));
      for (const farmId of deletedSamples) delete merged.ndvi[farmId];
    }

    // Keep the farm-id counter ahead of every present farm so it can never
    // collide with the seed range or itself.
    const maxFarmId = merged.farms.reduce((m, f) => Math.max(m, f.id), 0);
    merged.counters.farm = Math.max(merged.counters.farm, maxFarmId + 1);
    if (seedMissingSamples) needsInitializationPersist = true;
    return ENV_RECORDS_ENABLED ? { ...merged, version: 2 } : merged;
  } catch (err) {
    // Quarantine is best-effort, but the original raw value remains untouched.
    let quarantineFailed = raw === null;
    try {
      if (raw !== null) localStorage.setItem(`${STORAGE_KEY}:corrupt`, raw);
    } catch {
      quarantineFailed = true;
    }
    storeRecovery = {
      message: err instanceof Error ? err.message : String(err),
      raw,
      quarantineFailed,
    };
    console.error('FarmFriend: stored data could not be loaded; original data was preserved.', err);
    return fresh;
  }
}

export const state: AppState = load();

export type SimRunStorageMode = 'indexeddb' | 'localstorage';

let simRunMigration: Promise<SimRunStorageMode> | null = null;

function sameRecord(a: RunRecord, b: RunRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function migrateLegacySimRuns(): Promise<SimRunStorageMode> {
  assertStoreWritable();
  if (indexedDbRunsAreAuthoritative()) {
    state.simRuns = [];
    return 'indexeddb';
  }

  const migrationEnabled = TIMELINE_ENABLED || CAMPAIGN_ENABLED || TWIN_ENABLED;
  let existingRuns: RunRecord[];
  try {
    existingRuns = await getAllRecords<RunRecord>('runs');
  } catch (error) {
    if (!migrationEnabled) return 'localstorage';
    throw error;
  }
  if (!migrationEnabled && existingRuns.length === 0) return 'localstorage';

  assertStoreWritable();

  const legacyRuns = structuredClone(state.simRuns);

  const uniqueRuns = new Map<string, RunRecord>();
  for (const run of legacyRuns) {
    const existing = uniqueRuns.get(run.id);
    if (existing && !sameRecord(existing, run)) {
      const error = new Error(`Legacy sim runs contain conflicting records for ${run.id}.`);
      dispatchStorageFailed('IndexedDB legacy run migration', error);
      throw error;
    }
    uniqueRuns.set(run.id, run);
  }

  for (const run of uniqueRuns.values()) {
    assertStoreWritable();
    await putRecordIfAbsent('runs', run.id, run);
  }

  for (const [id, expected] of uniqueRuns) {
    const stored = await getRecord<RunRecord>('runs', id);
    if (!stored || !sameRecord(stored, expected)) {
      const error = new Error(`Could not verify migrated sim run ${id}; the local copy was kept.`);
      dispatchStorageFailed('IndexedDB legacy run migration', error);
      throw error;
    }
  }

  assertStoreWritable();
  try {
    localStorage.setItem(RUN_MIGRATION_KEY, '1');
  } catch (error) {
    dispatchStorageFailed('localStorage run-migration marker', error);
    throw error;
  }

  assertStoreWritable();
  state.simRuns = [];
  persist();
  persistNow();
  return 'indexeddb';
}

/** Select one durable run store, migrating before IndexedDB becomes authoritative. */
export function ensureLegacySimRunsMigrated(): Promise<SimRunStorageMode> {
  assertStoreWritable();
  simRunMigration ??= migrateLegacySimRuns();
  return simRunMigration;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let storageConflictMessage: string | null = null;

export interface StorePersistAck {
  revision: number;
  durableRevision: number;
}

const persistAcknowledgements = new Map<number, {
  resolve: (ack: StorePersistAck) => void;
  reject: (error: Error) => void;
}>();

export function getStoreSaveRevisions(): { requested: number; durable: number } {
  return { requested: saveRevision, durable: durableSaveRevision };
}

export function getStoreConflict(): string | null {
  return storageConflictMessage;
}

export function setEditorPendingWork(pending: boolean): void {
  editorHasPendingWork = pending;
  if (!pending && !dirty && !storageConflict && !storeRecovery && durableSaveRevision > 0) {
    dispatchStorageSaved(LOCAL_STORAGE_OPERATION, durableSaveRevision);
  }
}

export function registerStorageRetryHandler(handler: () => Promise<boolean | null>): () => void {
  retryHandler = handler;
  return () => {
    if (retryHandler === handler) retryHandler = null;
  };
}

export async function retryStorageWrite(): Promise<boolean> {
  if (storeRecovery || storageConflict) return false;
  if (retryHandler) {
    const handled = await retryHandler();
    if (handled !== null) return handled;
  }
  const saved = persistNow();
  if (saved && !retryHandler) setEditorPendingWork(false);
  return saved;
}

export function assertStoreWritable(): void {
  if (storeRecovery) {
    const error = new Error('Stored FarmFriend data needs recovery before it can be edited. Download the original data and reload after recovery.');
    dispatchStorageFailed('stored data recovery', error);
    throw error;
  }
  if (storageConflict) {
    const error = new Error(storageConflictMessage ?? 'Another tab changed FarmFriend data. Preserve pending work in each tab, then reopen the app.');
    dispatchStorageFailed('localStorage conflict', error);
    throw error;
  }
}

function flush(): boolean {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!dirty) return true; // nothing changed since the last committed write
  if (storeRecovery || storageConflict) {
    rejectPersistAcknowledgements(new Error(storageConflictMessage
      ?? 'Stored FarmFriend data needs recovery before it can be saved.'));
    return false;
  }
  try {
    // ONE atomic setItem of ONE snapshot key — never clear+write or split
    // across keys: a partially-applied commit is how storage ends up
    // re-seeding over user data (dogfood CRIT-001 evidence).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    dirty = false;
    durableSaveRevision = saveRevision;
    resolvePersistAcknowledgements();
    if (!editorHasPendingWork) dispatchStorageSaved(LOCAL_STORAGE_OPERATION, durableSaveRevision);
    return true;
  } catch (err) {
    // Leave `dirty` set: a transient quota failure (e.g. a same-origin tab
    // momentarily filling storage) gets retried on the next flush.
    dispatchStorageFailed('localStorage persist', err);
    rejectPersistAcknowledgements(err instanceof Error ? err : new Error(String(err)));
    return false;
  }
}

function resolvePersistAcknowledgements(): void {
  for (const [revision, acknowledgement] of persistAcknowledgements) {
    if (revision > durableSaveRevision) continue;
    persistAcknowledgements.delete(revision);
    acknowledgement.resolve({ revision, durableRevision: durableSaveRevision });
  }
}

function rejectPersistAcknowledgements(error: Error): void {
  for (const [revision, acknowledgement] of persistAcknowledgements) {
    persistAcknowledgements.delete(revision);
    acknowledgement.reject(error);
  }
}

export function persist(): number {
  assertStoreWritable();
  saveRevision += 1;
  dirty = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 500);
  return saveRevision;
}

export function persistNow(): boolean {
  if (storeRecovery || storageConflict) return false;
  return flush();
}

/** Resolve only after the debounced localStorage snapshot has committed atomically. */
export async function persistWithAck(): Promise<StorePersistAck> {
  const revision = persist();
  return new Promise<StorePersistAck>((resolve, reject) => {
    persistAcknowledgements.set(revision, { resolve, reject });
  });
}

if (needsInitializationPersist) {
  try {
    persist();
    persistNow();
  } catch {
    // The loaded legacy blob remains intact; the next launch can retry migration.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || event.newValue === event.oldValue) return;
    storageConflict = true;
    storageConflictMessage = 'FarmFriend data changed in another tab. Keep both tabs open, preserve any pending work, then reopen each tab. Changes are not merged.';
    dispatchStorageConflict(storageConflictMessage);
  });
}

// Flush pending writes when the tab is hidden or closing. pagehide/beforeunload
// cover actual document unloads, which visibilitychange alone misses.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  window.addEventListener('beforeunload', persistNow);
}
