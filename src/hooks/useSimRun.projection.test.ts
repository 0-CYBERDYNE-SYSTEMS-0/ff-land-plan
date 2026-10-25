import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { EnvironmentLayout, GrowingTargetRef } from '@/types';
import type { RunRecord, SimState } from '@/lib/sim';

let buildCellDiagnostics: typeof import('./useSimRun').buildCellDiagnostics;
let buildRunProgressRows: typeof import('./useSimRun').buildRunProgressRows;

beforeAll(async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  ({ buildCellDiagnostics, buildRunProgressRows } = await import('./useSimRun'));
});

afterAll(() => vi.unstubAllGlobals());

const target: GrowingTargetRef = {
  kind: 'growing-level',
  growingSpaceId: 'rack-a',
  levelId: 'tier-2',
};

const layout: EnvironmentLayout = {
  access: [],
  reservations: [],
  growingSpaces: [{
    id: 'rack-a',
    label: 'Rack A',
    kind: 'rack',
    x: 0,
    y: 0,
    widthM: 1,
    depthM: 1,
    levels: [{ id: 'tier-2', label: 'Upper tier', elevationM: 1 }],
  }],
};

const crop = cropLibrary[0]!;
const stableCell = {
  cropId: crop.id,
  plantedAtDay: 0,
  moistureFrac: 0.7,
  nitrogenKgHa: 80,
  gddAccumC: 12,
  biomassFrac: 0.2,
  stage: 1,
  floweringFrac: 0,
  pestPressure: 0,
  stress: { water: 0, heat: 0, cold: 0, nitrogen: 0 },
};

const state: SimState = {
  dayIndex: 0,
  archetype: 'warehouse-vertical',
  surface: 'warehouse',
  cells: {
    '0,0': { ...stableCell },
    [targetCellKey(target, '0,0')]: { ...stableCell, target },
  },
  creatures: { bees: 0, butterflies: 0, pests: 0 },
  events: [],
};

const record = {
  config: {
    startDate: '2026-05-01',
    environment: { layout },
  },
  envSeries: [],
} as unknown as RunRecord;

describe('sim run projections', () => {
  it('keeps the same crop and sow date separate by floor and growing level', () => {
    const cropById = new Map([[crop.id, crop]]);
    const progress = buildRunProgressRows(state, '2026-05-01', cropById, layout);
    const diagnostics = buildCellDiagnostics(state, record, cropById, null, null);

    expect(progress).toHaveLength(2);
    expect(progress.map((row) => row.targetKey).sort()).toEqual(['floor', growingTargetKey(target)].sort());
    expect(progress.find((row) => row.targetKey === 'floor')?.targetLabel).toBe('Floor');
    expect(progress.find((row) => row.targetKey === growingTargetKey(target))?.targetLabel).toBe('Rack A · Upper tier');
    expect(new Set(progress.map((row) => row.label)).size).toBe(2);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((row) => row.targetKey).sort()).toEqual(['floor', growingTargetKey(target)].sort());
  });
});
