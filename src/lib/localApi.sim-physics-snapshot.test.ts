import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropLibrary } from '@/data/crops';
import type { DailyEnvironment } from '@/lib/sim/types';
import type { SoilProfile } from '@/lib/soil';
import type { Environment, SitePlan } from '@/types';

const mocks = vi.hoisted(() => ({
  buildEnvSeries: vi.fn(),
  fetchClimateNormals: vi.fn(),
  fetchMonthlyDli: vi.fn(),
  fetchSoilProfile: vi.fn(),
}));

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

vi.mock('@/lib/sim/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sim/environment')>();
  return { ...actual, buildEnvSeries: mocks.buildEnvSeries };
});
vi.mock('@/lib/climate', () => ({ fetchClimateNormals: mocks.fetchClimateNormals }));
vi.mock('@/lib/light', () => ({ fetchMonthlyDli: mocks.fetchMonthlyDli }));
vi.mock('@/lib/soil', () => ({ fetchSoilProfile: mocks.fetchSoilProfile }));

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function dailySeries(startDate: string, count: number, dliNaturalMol?: number): DailyEnvironment[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return {
      date: date.toISOString().slice(0, 10),
      tMinC: 18,
      tMaxC: 24,
      precipMm: 0,
      etoMm: 1,
      ...(dliNaturalMol !== undefined ? { dliNaturalMol } : {}),
      gddBase10C: 11,
      provenance: {
        tMinC: 'default',
        tMaxC: 'default',
        precipMm: 'default',
        etoMm: 'default',
        ...(dliNaturalMol !== undefined ? { dliNaturalMol: 'model-estimate' } : {}),
      },
    };
  });
}

async function loadApi(flags: { records: boolean; climate: boolean; physics: boolean }) {
  vi.stubEnv('VITE_FF_ENV_RECORDS', String(flags.records));
  vi.stubEnv('VITE_FF_ENV_CLIMATE', String(flags.climate));
  vi.stubEnv('VITE_FF_ASSET_PHYSICS', String(flags.physics));
  vi.resetModules();
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  mocks.fetchClimateNormals.mockImplementation(async () => null);
  mocks.fetchSoilProfile.mockImplementation(async () => null);
  mocks.fetchMonthlyDli.mockImplementation(async () => Array(12).fill(24));
  mocks.buildEnvSeries.mockImplementation(async (...args: unknown[]) => {
    const startDate = String(args[0]);
    const count = Number(args[1]);
    const options = args[2] as { monthlyDli?: number[] } | undefined;
    const month = Number(startDate.slice(5, 7)) - 1;
    return dailySeries(startDate, count, options?.monthlyDli?.[month]);
  });
  const [{ state }, { localApi }, { makeEnvironment }, { simulateRun }, { persistNow }] = await Promise.all([
    import('@/lib/store'),
    import('@/lib/localApi'),
    import('@/lib/environment-model'),
    import('@/lib/sim/engine'),
    import('@/lib/store'),
  ]);
  return { state, localApi, makeEnvironment, simulateRun, persistNow };
}

function roomEnvironment(makeEnvironment: typeof import('@/lib/environment-model').makeEnvironment): Environment {
  const environment = makeEnvironment(1, {
    archetype: 'grow-room',
    widthM: 1,
    heightM: 0.5,
    cellM: 0.25,
  }, 'env:1:1', '2026-06-01T00:00:00.000Z');
  const crop = cropLibrary.find((entry) => entry.slug === 'lettuce')!;
  environment.plan.planting = { '0,0': crop.id };
  environment.instances = [
    { id: 'light-1', slug: 'grow-light', mount: { kind: 'floor' }, x: 0.25, y: 0.125, widthM: 0.5, depthM: 0.25 },
    { id: 'store-1', slug: 'rain-barrel', mount: { kind: 'floor' }, x: 0, y: 0, widthM: 0.75, depthM: 0.75 },
  ];
  return environment;
}

function siteFor(environment: Environment): SitePlan {
  return {
    farmId: environment.farmId,
    widthM: environment.widthM,
    heightM: environment.heightM,
    cellM: environment.cellM,
    environments: [environment],
    updatedAt: environment.plan.updatedAt,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  dbState.records.clear();
});

describe('local sim run physics snapshots', () => {
  it('keeps climate and asset physics inert when environment records are disabled', async () => {
    const { state, localApi, makeEnvironment, persistNow } = await loadApi({
      records: false,
      climate: true,
      physics: true,
    });
    const environment = roomEnvironment(makeEnvironment);
    state.sites[1] = siteFor(environment);

    const record = await localApi.createSimRun({ farmId: 1, startDate: '2026-06-01', dayCount: 1 });
    persistNow();

    expect(await localApi.listSimRuns(1)).toEqual([record]);
    expect(record.config.environment).toBeUndefined();
    expect(record.config.assetPhysics).toBeUndefined();
    expect(record.config.climateModel).toBeUndefined();
    expect(mocks.fetchMonthlyDli).not.toHaveBeenCalled();
  });

  it('freezes equipment, climate inputs and DLI into replayable runs when all flags are enabled', async () => {
    const { state, localApi, makeEnvironment, simulateRun, persistNow } = await loadApi({
      records: true,
      climate: true,
      physics: true,
    });
    const environment = roomEnvironment(makeEnvironment);
    state.sites[1] = siteFor(environment);
    const originalInstanceX = environment.instances![0]!.x;
    mocks.fetchSoilProfile.mockResolvedValue({
      awcMmPerCm: 1.7,
      organicMatterPct: 3.4,
    } as SoilProfile);

    const record = await localApi.createSimRun({
      farmId: 1,
      environmentId: environment.id,
      startDate: '2026-06-01',
      dayCount: 1,
    });
    environment.instances![0]!.x = 12;
    persistNow();

    expect(record.config.environment?.archetype).toBe('grow-room');
    expect(record.config.environment?.instances?.[0]?.x).toBe(originalInstanceX);
    expect(record.config.assetPhysics?.model).toBe('assets-v1');
    expect(record.config.assetPhysics?.room).toMatchObject({ lightingW: 40, waterStoreL: 200 });
    expect(record.config.climateModel).toBe('environment-v1');
    expect(record.config.climateEquipment?.lightingW).toBe(40);
    expect(record.config.modelInputs).toMatchObject({
      model: 'run-inputs-v1',
      soil: { awcMmPerCm: 1.7, organicMatterPct: 3.4 },
      crops: [{ id: cropLibrary.find((entry) => entry.slug === 'lettuce')!.id }],
    });
    expect(record.envSeries[0]?.dliNaturalMol).toBe(24);
    expect(mocks.fetchMonthlyDli).toHaveBeenCalledOnce();

    const replay = simulateRun(record.config, record.envSeries, { crops: [...cropLibrary] });
    expect(replay.finalState.climate?.dliMol).toBeCloseTo(13.4784, 4);
    expect(replay.summary).toEqual(record.summary);
  });
});
