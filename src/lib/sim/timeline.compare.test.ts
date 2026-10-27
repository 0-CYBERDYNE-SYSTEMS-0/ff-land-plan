import { describe, expect, it } from 'vitest';
import type { PlanState } from '@/types';
import type { RunConfig, RunRecord, RunSummary } from './types';
import { compareRuns, yieldMassUnit } from './timeline';

function runConfig(): RunConfig {
  const basePlan: PlanState = {
    farmId: 1,
    widthM: 1,
    heightM: 1,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting: {},
    ground: {},
    updatedAt: '',
  };
  return {
    farmId: 1,
    basePlan,
    startDate: '2026-05-01',
    dayCount: 1,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
  };
}

function summary(overrides: Partial<RunSummary>): RunSummary {
  return {
    daysSimulated: 90,
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
    ...overrides,
  };
}

function record(id: string, label: string, runSummary: RunSummary): RunRecord {
  return {
    id,
    farmId: 1,
    label,
    createdAt: '2026-05-01T00:00:00.000Z',
    config: runConfig(),
    envSeries: [],
    summary: runSummary,
    status: 'complete',
  };
}

describe('compareRuns', () => {
  it('returns signed deltas as B minus A and preserves missing harvest/light values', () => {
    const a = record('run-a', 'A', summary({
      totalYieldKg: 100,
      waterUseMm: 120,
      stressCellDays: 40,
      stressDays: { water: 12, heat: 7, cold: 2, nitrogen: 5 },
      harvestReadyDay: null,
      outbreakDays: 9,
    }));
    const b = record('run-b', 'B', summary({
      totalYieldKg: 135,
      waterUseMm: 95,
      stressCellDays: 31,
      stressDays: { water: 4, heat: 9, cold: 2, nitrogen: 1, light: 3 },
      harvestReadyDay: 22,
      outbreakDays: 4,
    }));

    const comparison = compareRuns(a, b);

    expect(comparison.a).toEqual({ id: 'run-a', label: 'A' });
    expect(comparison.b).toEqual({ id: 'run-b', label: 'B' });
    expect(comparison.totalYieldKg).toEqual({ a: 100, b: 135, delta: 35 });
    expect(comparison.waterUseMm).toEqual({ a: 120, b: 95, delta: -25 });
    expect(comparison.stressCellDays).toEqual({ a: 40, b: 31, delta: -9 });
    expect(comparison.stressDays.water.delta).toBe(-8);
    expect(comparison.stressDays.heat.delta).toBe(2);
    expect(comparison.stressDays.light).toEqual({ a: null, b: 3, delta: null });
    expect(comparison.harvestReadyDay).toEqual({ a: null, b: 22, delta: null });
    expect(comparison.outbreakDays.delta).toBe(-5);
  });

  it('omits numeric comparisons for a v2 placeholder summary', () => {
    const a = record('run-a', 'A', summary({ totalYieldKg: 100, modelQualification: undefined }));
    const b = record('run-b', 'B', summary({
      totalYieldKg: 0,
      waterUseMm: 0,
      stressCellDays: 0,
      modelQualification: {
        status: 'unsupported',
        reasons: ['The crop-model-v2 daily reducer is not enabled yet.'],
      },
    }));

    const comparison = compareRuns(a, b);

    expect(comparison.totalYieldKg).toEqual({ a: 100, b: null, delta: null });
    expect(comparison.waterUseMm).toEqual({ a: 0, b: null, delta: null });
    expect(comparison.stressCellDays).toEqual({ a: 0, b: null, delta: null });
  });

  it('does not compare fresh-matter yield with v2 dry-matter yield', () => {
    const a = record('run-a', 'A', summary({ totalYieldKg: 100, waterUseMm: 50 }));
    const b = record('run-b', 'B', summary({ totalYieldKg: 3, waterUseMm: 40, yieldBasis: 'dry-matter' }));

    const comparison = compareRuns(a, b);

    expect(comparison.totalYieldKg).toEqual({ a: null, b: null, delta: null });
    expect(comparison.waterUseMm).toEqual({ a: 50, b: 40, delta: -10 });
    expect(comparison.yieldBasis).toBe('incompatible');
    expect(yieldMassUnit(comparison.yieldBasis)).toBeNull();
  });

  it('labels same-basis v2 comparison output as dry matter', () => {
    const a = record('run-a', 'A', summary({ totalYieldKg: 3, yieldBasis: 'dry-matter' }));
    const b = record('run-b', 'B', summary({ totalYieldKg: 4, yieldBasis: 'dry-matter' }));
    const comparison = compareRuns(a, b);

    expect(comparison.yieldBasis).toBe('dry-matter');
    expect(yieldMassUnit(comparison.yieldBasis)).toBe('kg DM');
  });
});
