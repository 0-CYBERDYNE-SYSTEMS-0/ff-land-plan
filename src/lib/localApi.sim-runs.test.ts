import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyEnvironment, EnvironmentModelInputsV2, RunRecord } from '@/lib/sim/types';
import type { SoilProfile } from '@/lib/soil';
import type { PlanState } from '@/types';
import { freezeEnvironmentModelInputsV2 } from '@/lib/sim/model-inputs';

const dbState = vi.hoisted(() => ({ records: new Map<string, Map<string, unknown>>() }));
const createRunMocks = vi.hoisted(() => ({
  buildEnvSeries: vi.fn(),
  fetchClimateNormals: vi.fn(),
  fetchSoilProfile: vi.fn(),
}));

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
vi.mock('@/lib/sim/environment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sim/environment')>();
  return { ...actual, buildEnvSeries: createRunMocks.buildEnvSeries };
});
vi.mock('@/lib/climate', () => ({ fetchClimateNormals: createRunMocks.fetchClimateNormals }));
vi.mock('@/lib/soil', () => ({ fetchSoilProfile: createRunMocks.fetchSoilProfile }));

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

function solarEnvironmentSeries(): DailyEnvironment[] {
  const base = {
    tMinC: 15,
    tMaxC: 20,
    precipMm: 0,
    etoMm: 0,
    gddBase10C: 7.5,
    provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
  } as const;
  return [
    {
      ...base,
      date: '2026-10-01',
      solarRadiationMJm2Day: 0,
      provenance: { ...base.provenance, solarRadiationMJm2Day: 'synthetic' },
    },
    {
      ...base,
      date: '2026-10-02',
      solarRadiationMJm2Day: null,
      provenance: { ...base.provenance, solarRadiationMJm2Day: 'synthetic' },
    },
  ];
}

function createdRunEnvironmentSeries(startDate: string, dayCount: number): DailyEnvironment[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return {
      date: date.toISOString().slice(0, 10),
      tMinC: 15,
      tMaxC: 20,
      precipMm: 0,
      etoMm: 0,
      gddBase10C: 7.5,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
    };
  });
}

function environmentV2Run(): RunRecord {
  const base = run('run:env2:local-roundtrip');
  const environment = {
    id: 'env:1:greenhouse-roundtrip',
    farmId: 1,
    archetype: 'greenhouse-glass' as const,
    label: 'Frozen greenhouse',
    x: 0,
    y: 0,
    widthM: 10,
    heightM: 10,
    cellM: 0.5,
  };
  const config = {
    ...base.config,
    cropModelVersion: 'crop-model-v4' as const,
    climateModel: 'environment-v2' as const,
    environment,
    modelInputs: {
      model: 'run-inputs-v4' as const,
      parameterSetVersion: 'crop-parameters-v5' as const,
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' as const },
      crops: [],
      cropParameters: [],
      establishmentByCell: {},
      qualification: { status: 'qualified' as const, reasons: [] },
    },
  };
  const environmentModelInputs: EnvironmentModelInputsV2 = freezeEnvironmentModelInputsV2(config, {
    tMinC: 15,
    tMaxC: 20,
    rhPct: 60,
    co2Ppm: 420,
    etFactor: 1,
  })!;
  return {
    ...base,
    config: { ...config, environmentModelInputs },
    envSeries: solarEnvironmentSeries(),
    summary: {
      ...base.summary,
      daysSimulated: 17,
      totalYieldKg: 42.125,
      yieldBasis: 'dry-matter',
      waterUseMm: 6.75,
      modelQualification: { status: 'qualified', reasons: ['distinctive stored v2 summary'] },
    },
  };
}

async function loadApi(timeline: boolean, campaign = false) {
  vi.stubEnv('VITE_FF_TIMELINE', String(timeline));
  vi.stubEnv('VITE_FF_CAMPAIGN', String(campaign));
  vi.resetModules();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  createRunMocks.buildEnvSeries.mockReset();
  createRunMocks.fetchClimateNormals.mockReset();
  createRunMocks.fetchSoilProfile.mockReset();
  createRunMocks.buildEnvSeries.mockImplementation(async (startDate: string, dayCount: number) =>
    createdRunEnvironmentSeries(startDate, dayCount));
  createRunMocks.fetchClimateNormals.mockResolvedValue(null);
  createRunMocks.fetchSoilProfile.mockResolvedValue({
    source: 'usda-sda',
    name: 'Synthetic test profile',
    texture: null,
    ph: null,
    organicMatterPct: 2.4,
    cecCmolKg: null,
    awcMmPerCm: 1.7,
    soilType: null,
  } satisfies SoilProfile);
  const { localApi } = await import('@/lib/localApi');
  const { state } = await import('@/lib/store');
  return { localApi, state };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
  dbState.records.clear();
});

describe('localApi.createSimRun', () => {
  it('keeps v1 as the default and persists an explicit supported v2 version separately at a fixed time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T00:00:00.000Z'));
    let entropy = 0;
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(++entropy);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const { localApi, state } = await loadApi(true);
    state.plans[1] = structuredClone(basePlan);

    const v1 = await localApi.createSimRun({ farmId: 1, startDate: '2026-10-24', dayCount: 1 });
    const v2 = await localApi.createSimRun({
      farmId: 1,
      startDate: '2026-10-24',
      dayCount: 1,
      cropModelVersion: 'crop-model-v2',
    });
    const records = await localApi.listSimRuns(1);

    expect(v1.createdAt).toBe(v2.createdAt);
    expect(v1.id).not.toBe(v2.id);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.id))).toEqual(new Set([v1.id, v2.id]));
    expect(v1.config.cropModelVersion).toBe('crop-model-v1');
    expect(v1.config.modelInputs).toMatchObject({ model: 'run-inputs-v1' });
    expect(v2.config.cropModelVersion).toBe('crop-model-v2');
    expect(v2.config.modelInputs).toMatchObject({
      model: 'run-inputs-v2',
      parameterSetVersion: 'crop-parameters-v3',
      qualification: { status: 'supported' },
    });
    expect(records.find((record) => record.id === v1.id)).toEqual(v1);
    expect(records.find((record) => record.id === v2.id)).toEqual(v2);

    const archivedV1: RunRecord = JSON.parse(JSON.stringify(v1));
    const archivedV2: RunRecord = JSON.parse(JSON.stringify(v2));
    await expect(localApi.saveSimRun(archivedV1)).resolves.toEqual(archivedV1);
    await expect(localApi.saveSimRun(archivedV2)).resolves.toEqual(archivedV2);
    const archivedRecords = await localApi.listSimRuns(1);

    expect(archivedRecords).toHaveLength(2);
    expect(archivedRecords.find((record) => record.id === archivedV1.id)).toEqual(archivedV1);
    expect(archivedRecords.find((record) => record.id === archivedV2.id)).toEqual(archivedV2);
    expect(archivedV1.config.cropModelVersion).toBe('crop-model-v1');
    expect(archivedV1.config.modelInputs).toMatchObject({ model: 'run-inputs-v1' });
    expect(archivedV2.config.cropModelVersion).toBe('crop-model-v2');
    expect(archivedV2.config.modelInputs).toMatchObject({
      model: 'run-inputs-v2',
      parameterSetVersion: 'crop-parameters-v3',
    });
    expect(archivedRecords.find((record) => record.id === archivedV1.id)?.summary).toEqual(v1.summary);
    expect(archivedRecords.find((record) => record.id === archivedV2.id)?.summary).toEqual(v2.summary);

    vi.stubGlobal('crypto', {});
    await expect(localApi.createSimRun({ farmId: 1, startDate: '2026-10-24', dayCount: 1 }))
      .rejects.toThrow('Secure randomness is unavailable');
    expect(await localApi.listSimRuns(1)).toHaveLength(2);
  });
});

describe('localApi.saveSimRun', () => {
  it('round-trips environment-v2 frozen climate inputs and the stored summary through save/list', async () => {
    const { localApi } = await loadApi(true);
    const saved = environmentV2Run();

    await expect(localApi.saveSimRun(saved)).resolves.toEqual(saved);
    const [listed] = await localApi.listSimRuns(saved.farmId);

    expect(listed).toEqual(saved);
    expect(listed?.config.climateModel).toBe('environment-v2');
    expect(listed?.config.environmentModelInputs).toEqual(saved.config.environmentModelInputs);
    expect(listed?.summary).toEqual(saved.summary);
    expect(listed?.envSeries.map((day) => day.solarRadiationMJm2Day)).toEqual([0, null]);
  });

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
