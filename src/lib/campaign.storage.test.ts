import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunRecord } from '@/lib/sim/types';
import type { PlanState } from '@/types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  failKey: string | null = null;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new DOMException('Storage quota exceeded.', 'QuotaExceededError');
    this.values.set(key, String(value));
  }
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

function run(id: string, label = id): RunRecord {
  return {
    id,
    farmId: 1,
    label,
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

let storage: MemoryStorage;
let storageEvents: CustomEvent[];

function setFlags(timeline: boolean, campaign: boolean): void {
  vi.stubEnv('VITE_FF_TIMELINE', String(timeline));
  vi.stubEnv('VITE_FF_CAMPAIGN', String(campaign));
}

function setStorage(): void {
  storage = new MemoryStorage();
  storageEvents = [];
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    dispatchEvent: (event: CustomEvent) => {
      storageEvents.push(event);
      return true;
    },
  });
}

async function storeWithLegacyRuns(legacy: RunRecord[]) {
  const initialStore = await import('@/lib/store');
  storage.setItem('ff-pro:v1', JSON.stringify({ ...initialStore.state, simRuns: legacy }));
  vi.resetModules();
  return import('@/lib/store');
}

beforeEach(() => {
  vi.resetModules();
  setStorage();
  setFlags(false, false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('sim-run IndexedDB migration', () => {
  it('copies legacy runs losslessly, clears localStorage, and keeps IndexedDB authoritative after flags turn off', async () => {
    const legacy = [run('run:1:a'), run('run:1:b', 'changed label')];
    setFlags(true, false);

    const store = await storeWithLegacyRuns(legacy);
    expect(store.state.simRuns).toEqual(legacy);
    await expect(store.ensureLegacySimRunsMigrated()).resolves.toBe('indexeddb');
    expect(store.state.simRuns).toEqual([]);
    expect(storage.getItem('ff-pro:idb-runs-authoritative:v1')).toBe('1');
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).simRuns).toEqual([]);

    const db = await import('@/lib/db');
    expect((await db.getAllRecords<RunRecord>('runs')).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...legacy].sort((a, b) => a.id.localeCompare(b.id)));

    vi.resetModules();
    setFlags(false, false);
    const reloaded = await import('@/lib/store');
    expect(reloaded.state.simRuns).toEqual([]);
    await expect(reloaded.ensureLegacySimRunsMigrated()).resolves.toBe('indexeddb');
    expect((await (await import('@/lib/db')).getAllRecords<RunRecord>('runs')).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...legacy].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('keeps localStorage as the run store when both features are off and no migration has occurred', async () => {
    const legacy = [run('run:1:local')];
    const store = await storeWithLegacyRuns(legacy);
    await expect(store.ensureLegacySimRunsMigrated()).resolves.toBe('localstorage');
    expect(store.state.simRuns).toEqual(legacy);
    expect(storage.getItem('ff-pro:idb-runs-authoritative:v1')).toBeNull();
    expect((await (await import('@/lib/db')).getAllRecords<RunRecord>('runs'))).toEqual([]);
  });

  it('detects an existing unmarked IDB store and marks it authoritative without discarding runs', async () => {
    const existing = run('run:1:unmarked');
    const db = await import('@/lib/db');
    await db.putRecord('runs', existing.id, existing);
    vi.resetModules();
    setFlags(false, false);

    const store = await import('@/lib/store');
    await expect(store.ensureLegacySimRunsMigrated()).resolves.toBe('indexeddb');
    expect(storage.getItem('ff-pro:idb-runs-authoritative:v1')).toBe('1');
    expect(await (await import('@/lib/db')).getRecord<RunRecord>('runs', existing.id)).toEqual(existing);
  });

  it('surfaces localStorage quota failure while retaining a verified IDB copy and the old blob', async () => {
    const legacy = [run('run:1:quota')];
    setFlags(false, true);

    const store = await storeWithLegacyRuns(legacy);
    storage.failKey = 'ff-pro:v1';
    await expect(store.ensureLegacySimRunsMigrated()).resolves.toBe('indexeddb');

    expect(storage.getItem('ff-pro:idb-runs-authoritative:v1')).toBe('1');
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).simRuns).toEqual(legacy);
    expect(await (await import('@/lib/db')).getRecord<RunRecord>('runs', legacy[0]!.id)).toEqual(legacy[0]);
    expect(storageEvents.map((event) => ({ type: event.type, detail: event.detail }))).toContainEqual(expect.objectContaining({
      type: 'storage-failed',
      detail: expect.objectContaining({ operation: 'localStorage persist', message: expect.stringContaining('quota') }),
    }));

    vi.resetModules();
    const reloaded = await import('@/lib/store');
    expect(reloaded.state.simRuns).toEqual([]);
    await expect(reloaded.ensureLegacySimRunsMigrated()).resolves.toBe('indexeddb');
  });
});
