import { describe, expect, it } from 'vitest';
import { simulateRun } from './engine';
import type { DailyEnvironment, RunConfig } from './types';

describe('simulateRun cold-window growth', () => {
  it('keeps growth outputs finite when the climatological GDD pace is zero', () => {
    const config: RunConfig = {
      farmId: 1,
      basePlan: {
        farmId: 1,
        widthM: 1,
        heightM: 1,
        cellM: 0.25,
        allowOutsideBeds: false,
        ground: {},
        planting: { '0,0': 1 },
        updatedAt: '2026-01-01',
      },
      startDate: '2026-01-01',
      dayCount: 1,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
      // A fully cold normals window returns exactly zero from
      // meanDailyGddForRange; localApi persists this non-null value.
      meanDailyGddC: 0,
    };
    const coldDay: DailyEnvironment = {
      date: '2026-01-01',
      tMinC: 2,
      tMaxC: 8,
      precipMm: 0,
      etoMm: 0.5,
      gddBase10C: 0,
      provenance: {
        tMinC: 'default',
        tMaxC: 'default',
        precipMm: 'default',
        etoMm: 'default',
      },
    };

    const result = simulateRun(config, [coldDay]);
    const cell = result.finalState.cells['0,0']!;

    expect(cell.biomassFrac).toBe(0);
    expect(Number.isFinite(cell.stage)).toBe(true);
    expect(Number.isFinite(cell.floweringFrac)).toBe(true);
    expect(Number.isFinite(cell.nitrogenKgHa)).toBe(true);
    expect(Number.isFinite(result.summary.waterUseMm)).toBe(true);
  });
});
