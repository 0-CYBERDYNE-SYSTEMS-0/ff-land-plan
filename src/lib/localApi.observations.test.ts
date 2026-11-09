import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FarmCalibration, RunRecord } from '@/lib/sim/types';
import type { Environment, ObservationInput, PlanState } from '@/types';

const dbState = vi.hoisted(() => ({ records: new Map<string, Map<string, unknown>>() }));

vi.mock('@/lib/db', () => ({
  getRecord: vi.fn(async (store: string, key: string) => dbState.records.get(store)?.get(key)),
  getAllRecords: vi.fn(async (store: string) => [...(dbState.records.get(store)?.values() ?? [])]),
  putRecord: vi.fn(async (store: string, key: string, value: unknown) => {
    const records = dbState.records.get(store) ?? new Map<string, unknown>();
    records.set(key, structuredClone(value));
    dbState.records.set(store, records);
  }),
  putRecordIfAbsent: vi.fn(async (store: string, key: string, value: unknown) => {
    const records = dbState.records.get(store) ?? new Map<string, unknown>();
    if (records.has(key)) return false;
    records.set(key, structuredClone(value));
    dbState.records.set(store, records);
    return true;
  }),
  deleteRecord: vi.fn(async (store: string, key: string) => { dbState.records.get(store)?.delete(key); }),
  clearRecords: vi.fn(async (store: string) => { dbState.records.get(store)?.clear(); }),
  dispatchStorageFailed: vi.fn(),
}));

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const basePlan: PlanState = {
  farmId: 1,
  widthM: 1,
  heightM: 1,
  cellM: 0.25,
  allowOutsideBeds: false,
  ground: {},
  planting: {},
  updatedAt: '2026-10-24T00:00:00.000Z',
};

const environment: Environment = {
  id: 'env:1:1',
  farmId: 1,
  archetype: 'greenhouse-glass',
  label: 'Glasshouse',
  x: 0,
  y: 0,
  widthM: 1,
  heightM: 1,
  cellM: 0.25,
  plan: basePlan,
};

async function loadApi(twin: boolean) {
  vi.stubEnv('VITE_FF_TWIN', String(twin));
  vi.stubEnv('VITE_FF_TIMELINE', 'false');
  vi.stubEnv('VITE_FF_CAMPAIGN', 'false');
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  const [{ localApi }, { state }] = await Promise.all([
    import('@/lib/localApi'),
    import('@/lib/store'),
  ]);
  state.sites[1] = {
    farmId: 1,
    widthM: 1,
    heightM: 1,
    cellM: 0.25,
    environments: [structuredClone(environment)],
    updatedAt: '2026-10-24T00:00:00.000Z',
  };
  return { localApi, state };
}

const observationInput: ObservationInput = {
  farmId: 1,
  environmentId: environment.id,
  metric: 'airTempC',
  value: 20,
  unit: '°C',
  date: '2026-10-24',
  source: 'manual',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  dbState.records.clear();
});

describe('localApi twin observation storage', () => {
  it('keeps observation methods inert behind the default-off flag', async () => {
    const { localApi } = await loadApi(false);
    await expect(localApi.listObservations(1)).rejects.toThrow('VITE_FF_TWIN=true');
    await expect(localApi.addObservation(observationInput)).rejects.toThrow('VITE_FF_TWIN=true');
    await expect(localApi.createSensor(1, { name: 'Probe', sensorType: 'temperature', environmentId: environment.id }))
      .rejects.toThrow('VITE_FF_TWIN=true');
  });

  it('stores, filters, and deletes validated observations and associates sensors with a world', async () => {
    const { localApi } = await loadApi(true);
    const sensor = await localApi.createSensor(1, { name: 'Tent probe', sensorType: 'temperature', environmentId: environment.id });
    expect(sensor.environmentId).toBe(environment.id);
    expect((await localApi.updateSensor(sensor.id, { environmentId: null })).environmentId).toBeUndefined();

    const saved = await localApi.addObservation(observationInput);
    expect(saved.id).toMatch(/^obs:/);
    expect(await localApi.listObservations(1, environment.id)).toEqual([saved]);
    expect(await localApi.listObservations(1, 'missing')).toEqual([]);
    const updated = await localApi.updateObservation(saved.id, { value: 21, date: '2026-10-25', environmentId: null });
    expect(updated).toMatchObject({ value: 21, date: '2026-10-25' });
    expect(updated.environmentId).toBeUndefined();
    expect(await localApi.listObservations(1, environment.id)).toEqual([]);
    await expect(localApi.updateObservation(saved.id, { environmentId: 'missing' })).rejects.toThrow('Growing world');
    await localApi.deleteObservation(saved.id);
    expect(await localApi.listObservations(1)).toEqual([]);
  });

  it('persists approved environment calibrations by revision and rejects stale approvals', async () => {
    const { localApi } = await loadApi(true);
    const calibration: FarmCalibration = {
      version: 'farm-calibration-v1',
      revision: 1,
      farmId: 1,
      environmentId: environment.id,
      fittedAt: '2026-10-24T12:00:00.000Z',
      pairedDays: 14,
      parameters: { coverTransmission: 0.78, uValueWm2K: 3.2 },
    };
    await localApi.saveFarmCalibration(calibration);
    expect(await localApi.listFarmCalibrations(1)).toEqual([calibration]);
    await expect(localApi.saveFarmCalibration(calibration)).rejects.toThrow('Expected revision 2');
    const next = { ...calibration, revision: 2, fittedAt: '2026-10-25T12:00:00.000Z' };
    await localApi.saveFarmCalibration(next);
    expect(await localApi.listFarmCalibrations(1)).toEqual([next]);
  });

  it('stores twin records in IndexedDB when timeline and campaign flags are off', async () => {
    const { localApi, state } = await loadApi(true);
    const run = {
      id: 'run:1:twin',
      farmId: 1,
      label: 'Twin · baseline',
      createdAt: '2026-10-24T12:00:00.000Z',
      config: { farmId: 1, basePlan, startDate: '2026-10-24', dayCount: 1, seed: 1, scenario: 'baseline', tempDeltaC: 0, precipMultiplier: 1, interventions: [] },
      envSeries: [],
      observations: [{ id: 'obs:1', ...observationInput }],
      summary: {},
      status: 'complete',
    } as unknown as RunRecord;

    await localApi.saveSimRun(run);
    expect(state.simRuns).toEqual([]);
    expect(dbState.records.get('runs')?.get(run.id)).toEqual(run);
    expect(await localApi.listSimRuns(1)).toEqual([run]);
  });
});
