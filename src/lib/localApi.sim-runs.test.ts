import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunRecord } from '@/lib/sim/types';
import type { PlanState } from '@/types';

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
  deleteFarmRecords: vi.fn(async (farmId: number, includeRuns: boolean) => {
    const stores = includeRuns ? ['runs', 'seasons', 'observations', 'calibrations'] : ['seasons', 'observations', 'calibrations'];
    for (const name of stores) {
      const records = dbState.records.get(name);
      for (const [key, value] of records ?? []) {
        if ((value as { farmId?: number }).farmId === farmId) records?.delete(key);
      }
    }
  }),
  clearRecords: vi.fn(async (store: string) => { dbState.records.get(store)?.clear(); }),
  dispatchStorageFailed: vi.fn(),
  dispatchStorageSaved: vi.fn(),
  dispatchStorageConflict: vi.fn(),
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

function run(id: string): RunRecord {
  return {
    id,
    farmId: 1,
    label: id,
    createdAt: '2026-10-24T00:00:00.000Z',
    config: {
      farmId: 1,
      basePlan,
      startDate: '2026-10-24',
      dayCount: 1,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
    },
    envSeries: [],
    summary: {
      daysSimulated: 0,
      rainMm: 0,
      irrigatedMm: 0,
      etoMmTotal: 0,
      totalYieldKg: 0,
      yieldKgByCrop: {},
      stressCellDays: 0,
      waterUseMm: 0,
      stressDays: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
      outbreakDays: 0,
      meanNitrogenKgHa: 0,
      harvestReadyDay: null,
      matureCells: 0,
      cellCount: 0,
      eventCounts: {},
    },
    status: 'complete',
  };
}

async function loadApi(timeline: boolean, campaign = false) {
  vi.stubEnv('VITE_FF_TIMELINE', String(timeline));
  vi.stubEnv('VITE_FF_CAMPAIGN', String(campaign));
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  const { localApi } = await import('@/lib/localApi');
  const { state } = await import('@/lib/store');
  return { localApi, state };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  dbState.records.clear();
});

describe('localApi.saveSimRun', () => {
  it('upserts complete frozen records at the front and enforces the 40-run cap', async () => {
    const { localApi, state } = await loadApi(true);
    state.simRuns = Array.from({ length: 40 }, (_, index) => ({
      ...run(`old-${index}`),
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));

    const savedFork = {
      ...run('fork-1'),
      createdAt: '2026-12-01T00:00:00.000Z',
      parentId: 'parent-1',
      forkedAtDay: 4,
    };
    await localApi.saveSimRun(savedFork);
    expect(state.simRuns).toHaveLength(0);
    let records = await localApi.listSimRuns(1);
    expect(records).toHaveLength(40);
    expect(records[0]).toEqual(savedFork);
    expect(records.some((entry) => entry.id === 'old-0')).toBe(false);

    const updated = { ...savedFork, label: 'Fork with ensemble' };
    await localApi.saveSimRun(updated);
    records = await localApi.listSimRuns(1);
    expect(records.filter((entry) => entry.id === 'fork-1')).toHaveLength(1);
    expect(records[0]?.label).toBe('Fork with ensemble');
    await localApi.deleteSimRun('fork-1');
    expect((await localApi.listSimRuns(1))).toHaveLength(39);
  });

  it('rejects writes while the timeline feature flag is off', async () => {
    const { localApi } = await loadApi(false);
    await expect(localApi.saveSimRun(run('fork-1'))).rejects.toThrow('VITE_FF_TIMELINE=true');
  });

  it('deletes IndexedDB runs when their farm is deleted', async () => {
    const { localApi } = await loadApi(true);
    await localApi.saveSimRun(run('run-to-delete'));

    await localApi.deleteFarm(1);

    expect(await localApi.listSimRuns(1)).toEqual([]);
  });

  it('lists and deletes legacy runs from localStorage while IndexedDB is not authoritative', async () => {
    const { localApi, state } = await loadApi(false);
    state.simRuns = [run('legacy-local')];

    expect(await localApi.listSimRuns(1)).toEqual([run('legacy-local')]);
    await localApi.deleteSimRun('legacy-local');

    expect(state.simRuns).toEqual([]);
    expect(await localApi.listSimRuns(1)).toEqual([]);
    expect(dbState.records.get('runs')?.size ?? 0).toBe(0);
  });

  it('stores campaign seasons in IndexedDB only when campaign is enabled and preserves them when disabled', async () => {
    const { localApi } = await loadApi(false, true);
    const season = {
      id: 'season:1:2026',
      farmId: 1,
      year: 2026,
      label: '2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      environmentIds: ['env:1:1'],
      runIds: [],
      soil: [],
      harvests: [],
      updatedAt: '2026-12-31T00:00:00.000Z',
    };
    await localApi.saveSeason(season);
    expect(await localApi.listSeasons(1)).toEqual([season]);

    vi.resetModules();
    vi.stubEnv('VITE_FF_CAMPAIGN', 'false');
    const { localApi: disabledApi } = await import('@/lib/localApi');
    await expect(disabledApi.listSeasons(1)).rejects.toThrow('VITE_FF_CAMPAIGN=true');
    expect(dbState.records.get('seasons')?.get(season.id)).toEqual(season);

    vi.resetModules();
    vi.stubEnv('VITE_FF_CAMPAIGN', 'true');
    const { localApi: enabledApi } = await import('@/lib/localApi');
    await enabledApi.deleteSeason(season.id);
    expect(await enabledApi.listSeasons(1)).toEqual([]);
  });

  it('keeps IndexedDB authoritative for run reads after timeline and campaign flags turn off', async () => {
    const { localApi } = await loadApi(true);
    const saved = run('run:1:kept-in-idb');
    await localApi.saveSimRun(saved);

    vi.resetModules();
    vi.stubEnv('VITE_FF_TIMELINE', 'false');
    vi.stubEnv('VITE_FF_CAMPAIGN', 'false');
    const [{ localApi: disabledApi }, { state }] = await Promise.all([
      import('@/lib/localApi'),
      import('@/lib/store'),
    ]);
    expect(state.simRuns).toEqual([]);
    expect(await disabledApi.listSimRuns(1)).toEqual([saved]);
  });
});
