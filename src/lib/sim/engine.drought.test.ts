import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { simulateRun } from './engine';
import type { DailyEnvironment, RunConfig } from './types';

const PROVENANCE: DailyEnvironment['provenance'] = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
};

function weatherSeries(drought: boolean): DailyEnvironment[] {
  return Array.from({ length: 49 }, (_, day) => ({
    date: new Date(Date.UTC(2026, 4, day + 1)).toISOString().slice(0, 10),
    // The drought preset adds 2 °C and halves precipitation. The warming is
    // below lettuce's heat limit, so it incorrectly accelerates maturity.
    tMinC: drought ? 14 : 12,
    tMaxC: drought ? 24 : 22,
    precipMm: drought ? 4 : 8,
    etoMm: 2.5,
    gddBase10C: drought ? 9 : 7,
    provenance: drought
      ? { ...PROVENANCE, tMinC: 'scenario-delta', tMaxC: 'scenario-delta', precipMm: 'scenario-delta' }
      : PROVENANCE,
    ...(drought ? { raw: { tMinC: 12, tMaxC: 22, precipMm: 8, source: 'default' as const } } : {}),
  }));
}

function config(scenario: 'baseline' | 'drought'): RunConfig {
  const crop = cropLibrary.find((item) => item.slug === 'lettuce')!;
  return {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 0.25,
      allowOutsideBeds: true,
      ground: {},
      planting: { '0,0': crop.id, '1,0': crop.id, '0,1': crop.id, '1,1': crop.id },
      updatedAt: '2026-05-01',
    },
    startDate: '2026-05-01',
    dayCount: 49,
    seed: 417,
    scenario,
    tempDeltaC: scenario === 'drought' ? 2 : 0,
    precipMultiplier: scenario === 'drought' ? 0.5 : 1,
    interventions: [],
    meanDailyGddC: 8,
  };
}

describe('drought scenario yield', () => {
  it('does not out-yield baseline when its warming component speeds maturity', () => {
    const baseline = simulateRun(config('baseline'), weatherSeries(false));
    const drought = simulateRun(config('drought'), weatherSeries(true));

    expect(drought.summary.totalYieldKg).toBeLessThanOrEqual(baseline.summary.totalYieldKg);
  });
});
