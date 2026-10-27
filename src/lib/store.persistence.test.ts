import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanState } from '@/types';

const dbMocks = vi.hoisted(() => ({
  dispatchStorageConflict: vi.fn(),
  dispatchStorageFailed: vi.fn(),
  dispatchStorageSaved: vi.fn(),
  getAllRecords: vi.fn(async () => [] as unknown[]),
  getRecord: vi.fn(async () => undefined),
  putRecordIfAbsent: vi.fn(async () => false),
  putRecord: vi.fn(async () => undefined),
  deleteRecord: vi.fn(async () => undefined),
  deleteFarmRecords: vi.fn(async () => undefined),
  clearRecords: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => dbMocks);

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failAppWrites = false;
  failQuarantine = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if ((this.failAppWrites && key === 'ff-pro:v1') || (this.failQuarantine && key === 'ff-pro:v1:corrupt')) {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    }
    this.values.set(key, String(value));
  }
}

function installStorage(storage = new MemoryStorage()): MemoryStorage {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  vi.stubGlobal('window', new EventTarget());
  return storage;
}

function plan(farmId: number, planting: Record<string, number> = {}): PlanState {
  return {
    farmId,
    widthM: 8,
    heightM: 6,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting,
    ground: {},
    plantedAt: Object.fromEntries(Object.keys(planting).map((key) => [key, '2026-10-20'])),
    updatedAt: '2026-10-20T12:00:00.000Z',
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('BETA-01 local persistence', () => {
  it('seeds missing legacy samples once while preserving stored metadata and an intentionally empty plan', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    const storedFarm = {
      id: 1,
      name: 'My North Meadow',
      description: 'Saved farm metadata',
      lat: 44.1,
      lng: -121.2,
      areHa: 3,
      soilType: 'clay',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    storage.setItem('ff-pro:v1', JSON.stringify({ farms: [storedFarm], plans: { 1: plan(1) } }));
    vi.resetModules();

    const { state } = await import('@/lib/store');
    expect(state.farms.find((farm) => farm.id === 1)?.name).toBe('My North Meadow');
    expect(state.farms.some((farm) => farm.id === 2)).toBe(true);
    expect(state.plans[1]).toMatchObject({ widthM: 8, heightM: 6, planting: {}, ground: {}, plantedAt: {} });
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).sampleDataInitialized).toBe(true);

    const storedAfterMigration = JSON.parse(storage.getItem('ff-pro:v1')!);
    storedAfterMigration.farms = storedAfterMigration.farms.filter((farm: { id: number }) => farm.id !== 2);
    delete storedAfterMigration.plans[2];
    storage.setItem('ff-pro:v1', JSON.stringify(storedAfterMigration));
    vi.resetModules();
    const reloaded = await import('@/lib/store');
    expect(reloaded.state.farms.some((farm) => farm.id === 2)).toBe(false);
    expect(reloaded.state.plans[2]).toBeUndefined();
  });

  it('preserves canonical v2 worlds and selected-world preference when flag-off', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    const firstPlan = plan(1, { '0,0': 1 });
    const secondPlan = plan(1, { '2,3': 2 });
    const site = {
      farmId: 1,
      widthM: 30,
      heightM: 24,
      cellM: 0.5,
      environments: [
        { id: 'env:1:custom-a', farmId: 1, archetype: 'open-field', label: 'Saved A', x: 0, y: 0, widthM: 10, heightM: 8, cellM: 0.5, plan: firstPlan },
        { id: 'env:1:custom-b', farmId: 1, archetype: 'grow-tent', label: 'Saved B', x: 12, y: 0, widthM: 18, heightM: 24, cellM: 0.5, plan: secondPlan },
      ],
      updatedAt: '2026-10-20T12:00:00.000Z',
    };
    const savedLegacyPlan = { ...plan(1, { '7,8': 3 }), widthM: 17, plantedAt: { '7,8': '2026-10-11' } };
    storage.setItem('ff-pro:v1', JSON.stringify({
      version: 2,
      sampleDataInitialized: true,
      deletedSampleFarmIds: [],
      farms: [{ id: 1, name: 'Saved farm', lat: 45, lng: -122, areHa: 1, soilType: null, description: null, createdAt: '2026-01-01' }],
      plans: { 1: savedLegacyPlan },
      sites: { 1: site },
      selectedEnvironmentIds: { 1: 'env:1:custom-b' },
      customCrops: [{ id: 1000, name: 'Saved crop', colorHex: '#123456' }],
    }));
    vi.resetModules();

    const { state } = await import('@/lib/store');
    expect(state.sites[1]).toEqual(site);
    expect(state.plans[1]).toEqual(savedLegacyPlan);
    expect(state.selectedEnvironmentIds[1]).toBe('env:1:custom-b');
    expect(state.customCrops).toEqual([{ id: 1000, name: 'Saved crop', colorHex: '#123456' }]);
  });

  it('keeps v2 multi-world data through flag-off persistence and a later flag-on load', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    const storage = installStorage();
    const site = {
      farmId: 1,
      widthM: 20,
      heightM: 10,
      cellM: 0.25,
      environments: [
        { id: 'env:1:1', farmId: 1, archetype: 'open-field', label: 'Saved 1', x: 0, y: 0, widthM: 8, heightM: 6, cellM: 0.25, plan: plan(1, { '1,1': 5 }) },
        { id: 'env:1:2', farmId: 1, archetype: 'greenhouse-glass', label: 'Saved 2', x: 10, y: 0, widthM: 10, heightM: 8, cellM: 0.25, plan: plan(1, { '3,4': 8 }) },
      ],
      updatedAt: '2026-10-21T00:00:00.000Z',
    };
    storage.setItem('ff-pro:v1', JSON.stringify({
      version: 2,
      sampleDataInitialized: true,
      deletedSampleFarmIds: [],
      farms: [],
      plans: {},
      sites: { 1: site },
      selectedEnvironmentIds: { 1: 'env:1:2' },
    }));
    vi.resetModules();
    const flagOn = await import('@/lib/store');
    expect(flagOn.state.sites[1]).toEqual(site);

    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    vi.resetModules();
    const flagOff = await import('@/lib/store');
    expect(flagOff.state.sites[1]).toEqual(site);
    expect(flagOff.state.selectedEnvironmentIds[1]).toBe('env:1:2');
    await flagOff.persistWithAck();

    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    vi.resetModules();
    const reloadedFlagOn = await import('@/lib/store');
    expect(reloadedFlagOn.state.sites[1]).toEqual(site);
    expect(reloadedFlagOn.state.selectedEnvironmentIds[1]).toBe('env:1:2');
  });

  it('keeps intentional empty plans and sample-farm deletion across repeated reloads', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    const [{ state }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const emptyPlan = plan(1);
    await localApi.savePlan(emptyPlan);
    await localApi.deleteFarm(2);

    expect(JSON.parse(storage.getItem('ff-pro:v1')!).plans[1].planting).toEqual({});
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).deletedSampleFarmIds).toEqual([2]);
    expect(state.farms.some((farm) => farm.id === 2)).toBe(false);

    vi.resetModules();
    const firstReload = await import('@/lib/store');
    expect(firstReload.state.farms.some((farm) => farm.id === 2)).toBe(false);
    expect(firstReload.state.plans[1]).toMatchObject({ planting: {}, ground: {}, widthM: 8, heightM: 6 });
    vi.resetModules();
    const secondReload = await import('@/lib/store');
    expect(secondReload.state.farms.some((farm) => farm.id === 2)).toBe(false);
    expect(secondReload.state.deletedSampleFarmIds).toEqual([2]);
  });

  it('keeps an intentionally empty sample site after deleting its last world', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    const storage = installStorage();
    const environment = {
      id: 'env:1:1',
      farmId: 1,
      archetype: 'open-field',
      label: 'Saved field',
      x: 0,
      y: 0,
      widthM: 8,
      heightM: 6,
      cellM: 0.25,
      plan: plan(1, { '1,1': 4 }),
    };
    storage.setItem('ff-pro:v1', JSON.stringify({
      version: 2,
      sampleDataInitialized: true,
      deletedSampleFarmIds: [],
      farms: [],
      plans: { 1: plan(1, { '1,1': 4 }) },
      sites: { 1: { farmId: 1, widthM: 8, heightM: 6, cellM: 0.25, environments: [environment], updatedAt: environment.plan.updatedAt } },
      selectedEnvironmentIds: { 1: environment.id },
    }));
    vi.resetModules();
    const { localApi } = await import('@/lib/localApi');
    await localApi.deleteEnvironment(1, environment.id);

    vi.resetModules();
    const reloaded = await import('@/lib/store');
    expect(reloaded.state.sites[1]?.environments).toEqual([]);
    expect(reloaded.state.selectedEnvironmentIds[1]).toBeUndefined();
  });

  it('rolls back a failed environment deletion before a later store retry', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    const storage = installStorage();
    vi.resetModules();
    const [{ state, persistWithAck, retryStorageWrite }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const first = {
      id: 'env:1:1', farmId: 1, archetype: 'open-field' as const, label: 'Field 1',
      x: 0, y: 0, widthM: 4, heightM: 3, cellM: 0.25, plan: plan(1, { '0,0': 1 }),
    };
    const second = {
      ...first,
      id: 'env:1:2', label: 'Field 2', x: 4, plan: plan(1, { '1,0': 2 }),
    };
    state.sites[1] = {
      farmId: 1, widthM: 8, heightM: 3, cellM: 0.25,
      environments: [first, second], updatedAt: '2026-10-26T00:00:00.000Z',
    };
    state.selectedEnvironmentIds[1] = first.id;
    state.plans[1] = plan(1, { '5,5': 9 });
    await persistWithAck();
    const durableBefore = storage.getItem('ff-pro:v1');
    storage.failAppWrites = true;

    await expect(localApi.deleteEnvironment(1, first.id)).rejects.toThrow(/quota/i);

    expect(state.sites[1]?.environments.map((environment) => environment.id)).toEqual([first.id, second.id]);
    expect(state.selectedEnvironmentIds[1]).toBe(first.id);
    expect(state.plans[1]).toEqual(plan(1, { '5,5': 9 }));
    expect(storage.getItem('ff-pro:v1')).toBe(durableBefore);
    expect(await retryStorageWrite()).toBe(false);

    storage.failAppWrites = false;
    expect(await retryStorageWrite()).toBe(true);
    const retried = JSON.parse(storage.getItem('ff-pro:v1')!);
    expect(retried.sites[1].environments.map((environment: { id: string }) => environment.id)).toEqual([first.id, second.id]);
    expect(retried.selectedEnvironmentIds[1]).toBe(first.id);
  });

  it('rolls back a failed sensor deletion before a later store retry', async () => {
    const storage = installStorage();
    vi.resetModules();
    const [{ state, persistWithAck, retryStorageWrite }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const sensor = {
      id: 9001, farmId: 1, name: 'Retry sensor', sensorType: 'soil_moisture' as const, isActive: true,
      lastValue: 20, lastUnit: '%', lastReadingAt: '2026-10-25T00:00:00.000Z',
    };
    const reading = { id: 9001, sensorId: 9001, value: 20, recordedAt: '2026-10-25T00:00:00.000Z' };
    state.sensors = [...state.sensors, sensor];
    state.readings[9001] = [reading];
    await persistWithAck();
    storage.failAppWrites = true;

    await expect(localApi.deleteSensor(sensor.id)).rejects.toThrow(/quota/i);
    expect(state.sensors.some((entry) => entry.id === sensor.id)).toBe(true);
    expect(state.readings[sensor.id]).toEqual([reading]);
    expect(await retryStorageWrite()).toBe(false);

    storage.failAppWrites = false;
    expect(await retryStorageWrite()).toBe(true);
    const retried = JSON.parse(storage.getItem('ff-pro:v1')!);
    expect(retried.sensors.some((entry: { id: number }) => entry.id === sensor.id)).toBe(true);
    expect(retried.readings[sensor.id]).toEqual([reading]);
  });

  it('preserves a concurrent reading for another sensor when a failed delete rolls back', async () => {
    const storage = installStorage();
    vi.resetModules();
    const [{ state, persistWithAck, retryStorageWrite }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const deletedSensor = {
      id: 9101, farmId: 1, name: 'Deleted sensor', sensorType: 'soil_moisture' as const, isActive: true,
      lastValue: 20, lastUnit: '%', lastReadingAt: '2026-10-25T00:00:00.000Z',
    };
    const otherSensor = {
      id: 9102, farmId: 1, name: 'Other sensor', sensorType: 'soil_moisture' as const, isActive: true,
      lastValue: null, lastUnit: null, lastReadingAt: null,
    };
    const originalReading = { id: 9101, sensorId: deletedSensor.id, value: 20, recordedAt: '2026-10-25T00:00:00.000Z' };
    state.sensors = [...state.sensors, deletedSensor, otherSensor];
    state.readings[deletedSensor.id] = [originalReading];
    state.readings[otherSensor.id] = [];
    await persistWithAck();
    storage.failAppWrites = true;

    const deletion = localApi.deleteSensor(deletedSensor.id);
    const readingWrite = localApi.addReading(otherSensor.id, 35, '%');
    const results = await Promise.allSettled([deletion, readingWrite]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(state.sensors.some((sensor) => sensor.id === deletedSensor.id)).toBe(true);
    expect(state.readings[deletedSensor.id]).toEqual([originalReading]);
    expect(state.readings[otherSensor.id]).toHaveLength(1);
    expect(await retryStorageWrite()).toBe(false);

    storage.failAppWrites = false;
    expect(await retryStorageWrite()).toBe(true);
    const retried = JSON.parse(storage.getItem('ff-pro:v1')!);
    expect(retried.readings[deletedSensor.id]).toEqual([originalReading]);
    expect(retried.readings[otherSensor.id]).toHaveLength(1);
  });

  it('rolls back a failed legacy simulation deletion before a later store retry', async () => {
    const storage = installStorage();
    vi.resetModules();
    const [{ state, persistWithAck, retryStorageWrite }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const simulation = state.simulations[0]!;
    await persistWithAck();
    storage.failAppWrites = true;

    await expect(localApi.deleteSimulation(simulation.id)).rejects.toThrow(/quota/i);
    expect(state.simulations).toContainEqual(simulation);
    expect(await retryStorageWrite()).toBe(false);

    storage.failAppWrites = false;
    expect(await retryStorageWrite()).toBe(true);
    const retried = JSON.parse(storage.getItem('ff-pro:v1')!);
    expect(retried.simulations).toContainEqual(simulation);
  });

  it('commits farm removal before IndexedDB deletion and restores the app blob if that transaction fails', async () => {
    const storage = installStorage();
    vi.resetModules();
    const [{ state }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const originalFarm = structuredClone(state.farms.find((farm) => farm.id === 1)!);
    dbMocks.deleteFarmRecords.mockImplementationOnce(async () => {
      const committed = JSON.parse(storage.getItem('ff-pro:v1')!);
      expect(committed.farms.some((farm: { id: number }) => farm.id === 1)).toBe(false);
      throw new Error('IndexedDB farm deletion aborted');
    });

    await expect(localApi.deleteFarm(1)).rejects.toThrow(/deletion aborted/i);

    expect(state.farms.find((farm) => farm.id === 1)).toEqual(originalFarm);
    expect(state.deletedSampleFarmIds).not.toContain(1);
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).farms.some((farm: { id: number }) => farm.id === 1)).toBe(true);
  });

  it('flushes the target captured by a pending plan before pagehide returns', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    vi.resetModules();
    const [queue] = await Promise.all([import('@/lib/planSaveQueue'), import('@/lib/store')]);
    const target = { farmId: 1, environmentId: null };
    queue.stagePlanSave(target, plan(1, { '2,3': 7 }));

    window.dispatchEvent(new Event('pagehide'));
    await queue.flushPendingPlanSaves();

    expect(JSON.parse(storage.getItem('ff-pro:v1')!).plans[1].planting).toEqual({ '2,3': 7 });
    expect(queue.getPendingPlanWorkSnapshot(1)).toEqual([]);
  });

  it('rejects a failed plan write, retains it in memory, and acknowledges only a successful retry', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    const [{ state, persist, persistNow, retryStorageWrite }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    persist();
    expect(persistNow()).toBe(true);
    const durableBefore = storage.getItem('ff-pro:v1');
    const pending = plan(1, { '4,5': 7 });
    const latest = plan(1, { '4,5': 7, '6,5': 8 });
    storage.failAppWrites = true;

    await expect(localApi.savePlan(pending)).rejects.toThrow(/persist|quota/i);
    expect(state.plans[1]?.planting).toEqual({ '4,5': 7 });
    expect(storage.getItem('ff-pro:v1')).toBe(durableBefore);
    await expect(localApi.savePlan(latest)).rejects.toThrow(/persist|quota/i);
    expect(state.plans[1]?.planting).toEqual(latest.planting);
    expect(storage.getItem('ff-pro:v1')).toBe(durableBefore);
    expect(await retryStorageWrite()).toBe(false);

    storage.failAppWrites = false;
    expect(await retryStorageWrite()).toBe(true);
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).plans[1].planting).toEqual(latest.planting);
  });

  it('keeps the 500 ms app-store debounce and resolves only after its snapshot commits', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    const storage = installStorage();
    vi.resetModules();
    const { localApi } = await import('@/lib/localApi');
    vi.useFakeTimers();
    const saving = localApi.savePlan(plan(1, { '1,2': 5 }));
    let acknowledged = false;
    void saving.then(() => { acknowledged = true; });

    await vi.advanceTimersByTimeAsync(499);
    expect(acknowledged).toBe(false);
    expect(storage.getItem('ff-pro:v1')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await expect(saving).resolves.toMatchObject({ planting: { '1,2': 5 } });
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).plans[1].planting).toEqual({ '1,2': 5 });
  });

  it('preserves malformed raw data and blocks edits when recovery quarantine also fails', async () => {
    const storage = installStorage();
    const raw = '{not-json';
    storage.setItem('ff-pro:v1', raw);
    storage.failQuarantine = true;
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const store = await import('@/lib/store');
    expect(store.storeRecovery).toMatchObject({ raw, quarantineFailed: true });
    expect(storage.getItem('ff-pro:v1')).toBe(raw);
    expect(() => store.persist()).toThrow(/recovery/i);
    expect(store.persistNow()).toBe(false);
    expect(storage.getItem('ff-pro:v1')).toBe(raw);

    storage.failQuarantine = false;
    storage.setItem('ff-pro:v1', '[]');
    vi.resetModules();
    const invalidShape = await import('@/lib/store');
    expect(invalidShape.storeRecovery).toMatchObject({ raw: '[]', quarantineFailed: false });
    expect(storage.getItem('ff-pro:v1')).toBe('[]');
  });

  it('blocks a write after another tab changes the app blob while editor work is pending', async () => {
    const storage = installStorage();
    const original = JSON.stringify({ sampleDataInitialized: true, deletedSampleFarmIds: [] });
    storage.setItem('ff-pro:v1', original);
    vi.resetModules();
    const store = await import('@/lib/store');
    store.setEditorPendingWork(true);
    const event = new Event('storage') as StorageEvent;
    Object.defineProperties(event, {
      key: { value: 'ff-pro:v1' },
      oldValue: { value: original },
      newValue: { value: '{"other-tab":true}' },
    });
    window.dispatchEvent(event);

    expect(store.getStoreConflict()).toMatch(/another tab/i);
    await expect(store.persistWithAck()).rejects.toThrow(/another tab/i);
    expect(storage.getItem('ff-pro:v1')).toBe(original);
  });

  it('blocks farm mutations before changing memory or deleting IndexedDB records on conflict', async () => {
    const storage = installStorage();
    const original = JSON.stringify({ sampleDataInitialized: true, deletedSampleFarmIds: [] });
    storage.setItem('ff-pro:v1', original);
    vi.resetModules();
    const [{ state }, { localApi }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
    ]);
    const farmsBefore = structuredClone(state.farms);
    const nextFarmId = state.counters.farm;
    const event = new Event('storage') as StorageEvent;
    Object.defineProperties(event, {
      key: { value: 'ff-pro:v1' },
      oldValue: { value: original },
      newValue: { value: '{"other-tab":true}' },
    });
    window.dispatchEvent(event);
    vi.clearAllMocks();

    await expect(localApi.createFarm({
      name: 'Blocked farm', lat: 45, lng: -122, areHa: 1, soilType: null, description: null,
    })).rejects.toThrow(/another tab/i);
    await expect(localApi.deleteFarm(1)).rejects.toThrow(/another tab/i);

    expect(state.farms).toEqual(farmsBefore);
    expect(state.counters.farm).toBe(nextFarmId);
    expect(dbMocks.getAllRecords).not.toHaveBeenCalled();
    expect(dbMocks.deleteFarmRecords).not.toHaveBeenCalled();
    expect(storage.getItem('ff-pro:v1')).toBe(original);
  });
});
