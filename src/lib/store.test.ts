import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

let storage: MemoryStorage;

beforeEach(() => {
  vi.resetModules();
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('demo seed persistence', () => {
  it('keeps edited demo records through first migration and never reseeds after initialization', async () => {
    const first = await import('./store');
    expect(first.state.farms).toHaveLength(9);
    first.state.farms.find((farm) => farm.id === 1)!.name = 'My North Meadow';
    first.state.plans[1] = {
      ...first.state.plans[1]!,
      planting: { ...first.state.plans[1]!.planting, '0,0': 1000 },
    };
    // Simulate an install saved before the one-time seed-version marker existed.
    first.state.demoSeedsVersion = 0;
    first.persist();
    first.persistNow();

    vi.resetModules();
    const migrated = await import('./store');
    expect(migrated.state.farms.find((farm) => farm.id === 1)?.name).toBe('My North Meadow');
    expect(migrated.state.plans[1]?.planting['0,0']).toBe(1000);
    expect(migrated.state.demoSeedsVersion).toBe(1);

    migrated.state.farms = migrated.state.farms.filter((farm) => farm.id !== 9);
    delete migrated.state.plans[9];
    migrated.persist();
    migrated.persistNow();

    vi.resetModules();
    const reloaded = await import('./store');
    expect(reloaded.state.farms.some((farm) => farm.id === 9)).toBe(false);
    expect(reloaded.state.plans[9]).toBeUndefined();
    expect(reloaded.state.farms.find((farm) => farm.id === 1)?.name).toBe('My North Meadow');
    expect(reloaded.state.plans[1]?.planting['0,0']).toBe(1000);
  });
});
