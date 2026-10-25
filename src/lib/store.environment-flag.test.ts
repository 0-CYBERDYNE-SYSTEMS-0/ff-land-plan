import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeEnvironment } from '@/lib/environment-model';
import type { Environment, PlanState } from '@/types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function legacyPlan(farmId: number, surface: 'greenhouse' | 'warehouse'): PlanState {
  return {
    farmId,
    widthM: 4,
    heightM: 4,
    cellM: 0.25,
    allowOutsideBeds: true,
    surface,
    planting: {},
    ground: {},
    updatedAt: '2026-10-24T00:00:00.000Z',
  };
}

function environment(farmId: number, archetype: 'greenhouse-glass' | 'warehouse-vertical', id: string): Environment {
  return makeEnvironment(farmId, { archetype }, id, '2026-10-24T00:00:00.000Z');
}

function installStorage(raw: unknown): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem('ff-pro:v1', JSON.stringify(raw));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  return storage;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('ENV_RECORDS flag compatibility', () => {
  it('keeps greenhouse and warehouse surfaces and run summaries when disabled', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    vi.resetModules();
    const greenhouse = environment(1, 'greenhouse-glass', 'env:1:1');
    const warehouse = environment(9, 'warehouse-vertical', 'env:9:1');
    installStorage({
      version: 2,
      farms: [{ id: 1 }, { id: 9 }],
      plans: { 1: legacyPlan(1, 'greenhouse'), 9: legacyPlan(9, 'warehouse') },
      sites: {
        1: { farmId: 1, widthM: 4, heightM: 4, cellM: 0.25, environments: [greenhouse], updatedAt: greenhouse.plan.updatedAt },
        9: { farmId: 9, widthM: 4, heightM: 4, cellM: 0.25, environments: [warehouse], updatedAt: warehouse.plan.updatedAt },
      },
      selectedEnvironmentIds: { 1: greenhouse.id, 9: warehouse.id },
    });

    const [{ state }, { localApi }, { cropLibrary }, { simulateRun }, { ENV_RECORDS_ENABLED }] = await Promise.all([
      import('@/lib/store'),
      import('@/lib/localApi'),
      import('@/data/crops'),
      import('@/lib/sim/engine'),
      import('@/lib/featureFlags'),
    ]);
    expect(ENV_RECORDS_ENABLED).toBe(false);
    const greenhousePlan = await localApi.getPlan(1);
    const warehousePlan = await localApi.getPlan(9);
    expect(greenhousePlan?.surface).toBe('greenhouse');
    expect(warehousePlan?.surface).toBe('warehouse');
    expect(state.sites[1]!.environments).toHaveLength(1);
    const weather = Array.from({ length: 3 }, (_, day) => ({
      date: `2026-10-${String(day + 1).padStart(2, '0')}`,
      tMinC: 8,
      tMaxC: 18,
      precipMm: 2,
      etoMm: 1,
      gddBase10C: 3,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const },
    }));
    const config = (farmId: number, plan: PlanState) => ({
      farmId,
      basePlan: plan,
      startDate: weather[0]!.date,
      dayCount: weather.length,
      seed: 1,
      scenario: 'baseline' as const,
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
    });
    const greenhouseSummary = simulateRun(config(1, greenhousePlan!), weather, { crops: cropLibrary }).summary;
    const warehouseSummary = simulateRun(config(9, warehousePlan!), weather, { crops: cropLibrary }).summary;
    expect(greenhouseSummary.rainMm).toBe(0);
    expect(warehouseSummary.rainMm).toBe(0);
    expect(warehouseSummary.etoMmTotal).not.toBe(greenhouseSummary.etoMmTotal);

    const multi = environment(1, 'warehouse-vertical', 'env:1:2');
    state.sites[1]!.environments.push(multi);
    expect(await localApi.getPlan(1)).toBeNull();
    await expect(localApi.savePlan(greenhousePlan!, undefined)).rejects.toThrow('Choose a growing world');

    const storage = globalThis.localStorage;
    const beforeReload = structuredClone(state.sites[1]);
    const { persist, persistNow } = await import('@/lib/store');
    persist();
    persistNow();
    vi.resetModules();
    const reloaded = await import('@/lib/store');
    expect(reloaded.state.sites[1]).toEqual(beforeReload);
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).sites[1].environments).toHaveLength(2);
    const { localApi: reloadedApi } = await import('@/lib/localApi');
    const reloadedGreenhouse = await reloadedApi.getPlan(1, greenhouse.id);
    const reloadedWarehouse = await reloadedApi.getPlan(9, warehouse.id);
    expect(reloadedGreenhouse?.surface).toBe('greenhouse');
    expect(reloadedWarehouse?.surface).toBe('warehouse');
    expect(simulateRun(config(1, reloadedGreenhouse!), weather, { crops: cropLibrary }).summary).toEqual(greenhouseSummary);
    expect(simulateRun(config(9, reloadedWarehouse!), weather, { crops: cropLibrary }).summary).toEqual(warehouseSummary);
  });

  it('does not migrate a v1 blob while disabled', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'false');
    vi.resetModules();
    const old = legacyPlan(1, 'greenhouse');
    installStorage({ farms: [{ id: 1 }], plans: { 1: old } });
    const { state } = await import('@/lib/store');
    expect(state.version).toBeUndefined();
    expect(state.sites).toEqual({});
    expect(state.plans[1]!.surface).toBe('greenhouse');
  });

  it('keeps every demo environment and selected id through enabled load and reload', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    vi.resetModules();
    const field = environment(1, 'greenhouse-glass', 'env:1:1');
    field.plan.planting = { '0,0': 11 };
    const tent = makeEnvironment(1, { archetype: 'grow-tent', label: 'Seed tent' }, 'env:1:2');
    tent.plan.planting = { '2,3': 22 };
    const site = {
      farmId: 1,
      widthM: 8,
      heightM: 6,
      cellM: 0.25,
      environments: [field, tent],
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    const storage = installStorage({
      version: 2,
      farms: [{ id: 1 }],
      plans: { 1: legacyPlan(1, 'greenhouse') },
      sites: { 1: site },
      selectedEnvironmentIds: { 1: tent.id },
    });

    vi.resetModules();
    const first = await import('@/lib/store');
    expect(first.state.sites[1]!.environments.map((entry) => entry.id)).toEqual([field.id, tent.id]);
    expect(first.state.sites[1]!.environments[0]!.plan.planting).toEqual({ '0,0': 11 });
    expect(first.state.sites[1]!.environments[1]!.plan.planting).toEqual({ '2,3': 22 });
    expect(first.state.selectedEnvironmentIds[1]).toBe(tent.id);
    first.persist();
    first.persistNow();

    vi.resetModules();
    const second = await import('@/lib/store');
    expect(second.state.sites[1]).toEqual(first.state.sites[1]);
    expect(second.state.selectedEnvironmentIds[1]).toBe(tent.id);
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).sites[1].environments).toHaveLength(2);
  });

  it('preserves a historical plan timestamp when restoring an environment snapshot', async () => {
    vi.stubEnv('VITE_FF_ENV_RECORDS', 'true');
    vi.resetModules();
    const initial = environment(1, 'greenhouse-glass', 'env:1:1');
    const storage = installStorage({
      version: 2,
      farms: [{ id: 1 }],
      plans: {},
      sites: {
        1: {
          farmId: 1,
          widthM: initial.widthM,
          heightM: initial.heightM,
          cellM: initial.cellM,
          environments: [initial],
          updatedAt: initial.plan.updatedAt,
        },
      },
      selectedEnvironmentIds: { 1: initial.id },
    });
    const [{ localApi }, { state, persistNow }] = await Promise.all([
      import('@/lib/localApi'),
      import('@/lib/store'),
    ]);
    const restored = structuredClone(state.sites[1]!.environments[0]!);
    restored.plan.updatedAt = '2026-06-01T12:00:00.000Z';

    const saved = await localApi.saveEnvironment(restored);
    persistNow();

    expect(saved.plan.updatedAt).toBe(restored.plan.updatedAt);
    expect(JSON.parse(storage.getItem('ff-pro:v1')!).sites[1].environments[0].plan.updatedAt)
      .toBe(restored.plan.updatedAt);
  });
});
