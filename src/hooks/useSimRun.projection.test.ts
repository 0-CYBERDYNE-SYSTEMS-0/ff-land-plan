import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import { dailyThermalUnits } from '@/lib/sim/crop-model-v2';
import type { EnvironmentLayout, GrowingTargetRef } from '@/types';
import type { DailyEnvironment, RunRecord, SimState } from '@/lib/sim';

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

  it('shows v3 source thermal progress while marking intermediate stages unavailable', () => {
    const v3State: SimState = {
      ...state,
      dayIndex: 1,
      climate: {
        tMinC: 18,
        tMaxC: 26,
        rhPct: 70,
        vpdKPa: 0.6,
        dliMol: 12,
        dliAvailable: true,
        co2Ppm: 420,
        leafWetHours: 0,
        etFactor: 0.8,
        rainMm: 0,
        ach: 1,
        provenance: { source: 'model-estimate', derivedFrom: 'equipment' },
      },
      cells: {
        '0,0': {
          ...stableCell,
          gddAccumC: 8,
          sourceThermalCdays: 35,
          stageEstimateAvailable: false,
          rootZoneWaterMm: 8,
          rootZoneDepthCm: 12,
        },
      },
    };
    const thermal = {
      tBaseC: 8,
      tUpperC: 32,
      gddToMaturityCdays: [100, 120] as const,
      accumulationMethod: 'single sine horizontal cutoff',
    };
    const env: DailyEnvironment = {
      date: '2026-05-01',
      tMinC: -5,
      tMaxC: 0,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 0,
      provenance: {
        tMinC: 'open-meteo-archive',
        tMaxC: 'open-meteo-archive',
        precipMm: 'open-meteo-archive',
        etoMm: 'open-meteo-archive',
      },
    };
    const v3Record = {
      ...record,
      envSeries: [env],
      config: {
        ...record.config,
        cropModelVersion: 'crop-model-v3',
        modelInputs: {
          model: 'run-inputs-v3',
          soil: { awcMmPerCm: 1.5 },
          cropParameters: [{
            cropId: crop.id,
            thermal,
            rootZone: {
              effectiveRootDepthCm: 90,
              rootDevelopment: { initialRootDepthCm: 10 },
            },
          }],
        },
      },
    } as unknown as RunRecord;
    const progress = buildRunProgressRows(v3State, '2026-05-01', new Map([[crop.id, crop]]));
    const diagnostics = buildCellDiagnostics(v3State, v3Record, new Map([[crop.id, crop]]), env, null);

    expect(progress[0]?.stageAvailable).toBe(false);
    expect(diagnostics[0]).toMatchObject({
      gddLabel: 'Source thermal',
      gddAccumC: 35,
      gddRequiredC: 120,
      todayTMinC: 18,
      todayTMaxC: 26,
      sources: { temp: 'model-estimate' },
      rootDepthCm: 12,
      awcMmPerCm: 1.5,
      awcCapMm: 18,
      bucketMm: 8,
    });
    expect(diagnostics[0]?.todayGddC).toBeCloseTo(dailyThermalUnits(18, 26, thermal)!, 8);
    expect(diagnostics[0]?.moistureFrac).toBeCloseTo(8 / 18, 8);

    const missingFrozenAwc = {
      ...v3Record,
      config: {
        ...v3Record.config,
        modelInputs: { ...v3Record.config.modelInputs, soil: { awcMmPerCm: null } },
      },
    } as unknown as RunRecord;
    const unavailableRoot = buildCellDiagnostics(v3State, missingFrozenAwc, new Map([[crop.id, crop]]), env, null)[0];
    expect(unavailableRoot).toMatchObject({
      rootDepthCm: null,
      awcMmPerCm: null,
      awcCapMm: null,
      bucketMm: null,
      moistureFrac: null,
    });
  });

  it('does not invent today source thermal units before planting, after death or maturity, or for invalid inputs', () => {
    const thermal = {
      tBaseC: 8,
      tUpperC: 32,
      gddToMaturityCdays: [100, 120] as const,
      accumulationMethod: 'single sine horizontal cutoff',
    };
    const env: DailyEnvironment = {
      date: '2026-05-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 15,
      provenance: {
        tMinC: 'open-meteo-archive',
        tMaxC: 'open-meteo-archive',
        precipMm: 'open-meteo-archive',
        etoMm: 'open-meteo-archive',
      },
    };
    const v3Record = {
      ...record,
      envSeries: [env],
      config: {
        ...record.config,
        cropModelVersion: 'crop-model-v3',
        modelInputs: {
          model: 'run-inputs-v3',
          soil: { awcMmPerCm: 1.5 },
          cropParameters: [{ cropId: crop.id, thermal }],
        },
      },
    } as unknown as RunRecord;
    const active = { ...stableCell, sourceThermalCdays: 35, stageEstimateAvailable: false };
    const getToday = (cell: typeof active & { plantedAtDay?: number; dead?: boolean; biomassFrac: number }, method = thermal) => {
      const stateAtDay: SimState = {
        ...state,
        dayIndex: 1,
        cells: { '0,0': { ...cell } },
      };
      const recordWithMethod = {
        ...v3Record,
        config: {
          ...v3Record.config,
          modelInputs: {
            ...v3Record.config.modelInputs,
            cropParameters: [{ cropId: crop.id, thermal: method }],
          },
        },
      } as RunRecord;
      return buildCellDiagnostics(stateAtDay, recordWithMethod, new Map([[crop.id, crop]]), env, null)[0]?.todayGddC;
    };

    expect(getToday({ ...active, plantedAtDay: 2 })).toBe(0);
    expect(getToday({ ...active, dead: true })).toBe(0);
    expect(getToday({ ...active, biomassFrac: 1 })).toBe(0);
    expect(getToday(active, { ...thermal, accumulationMethod: 'unknown method' })).toBeNull();

    const beforeFirstTick = buildCellDiagnostics(
      { ...state, dayIndex: 0, cells: { '0,0': active } },
      v3Record,
      new Map([[crop.id, crop]]),
      env,
      null,
    )[0];
    expect(beforeFirstTick?.todayGddC).toBe(0);
    expect(beforeFirstTick?.todayEtMm).toBeNull();
    expect(beforeFirstTick?.todayTMinC).toBeNull();
    expect(beforeFirstTick?.todayTMaxC).toBeNull();
    expect(beforeFirstTick?.sources).toEqual({ temp: null, precip: null, eto: null });
  });
});
