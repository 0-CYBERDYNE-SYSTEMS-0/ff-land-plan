import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { simulateRun } from './engine';
import type { DailyEnvironment, RunConfig } from './types';

const CELL_KEYS = Array.from({ length: 100 }, (_, i) => `${i % 10},${Math.floor(i / 10)}`);
const DAYS = 50;
const HARVEST_DAY = '2026-06-15';
const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
} as const;

const CROPS = [
  { slug: 'tomato', kgPerCell: 0.585, totalKg: 58.5 },
  { slug: 'garlic', kgPerCell: 0.175, totalKg: 17.5 },
] as const;

function warmSeries(): DailyEnvironment[] {
  return Array.from({ length: DAYS }, (_, dayIndex) => ({
    date: new Date(Date.UTC(2026, 4, dayIndex + 1)).toISOString().slice(0, 10),
    tMinC: 13,
    tMaxC: 19,
    precipMm: 0,
    etoMm: 0,
    gddBase10C: 6,
    provenance: PROVENANCE,
  }));
}

function config(cropId: number, automatic: boolean): RunConfig {
  const interventions: RunConfig['interventions'] = automatic
    ? []
    : CELL_KEYS.map((cell) => ({ kind: 'harvest', date: HARVEST_DAY, cell }));
  return {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 2.5,
      heightM: 2.5,
      cellM: 0.25,
      allowOutsideBeds: true,
      ground: {},
      planting: Object.fromEntries(CELL_KEYS.map((cell) => [cell, cropId])),
      updatedAt: '2026-05-01',
    },
    startDate: '2026-05-01',
    dayCount: DAYS,
    seed: 417,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions,
    autoHarvest: automatic,
    meanDailyGddC: 1,
  };
}

describe('spacing-based harvest yield', () => {
  for (const crop of CROPS) {
    const catalogCrop = cropLibrary.find((item) => item.slug === crop.slug)!;

    for (const automatic of [false, true]) {
      const path = automatic ? 'automatic' : 'manual';
      it(`aggregates ${crop.slug} yield without per-cell rounding on the ${path} path`, () => {
        const result = simulateRun(config(catalogCrop.id, automatic), warmSeries());
        const harvests = result.events.filter(
          (event) => event.kind === 'harvested' && event.cropId === catalogCrop.id,
        );

        expect(harvests).toHaveLength(100);
        const payouts = harvests.map((event) => event.data?.yieldKg ?? Number.NaN);
        expect(payouts.every((kg) => Math.abs(kg - crop.kgPerCell) < 1e-12)).toBe(true);
        expect(new Set(payouts).size).toBe(1);
        expect(payouts[0]).not.toBe(Math.round(payouts[0]! * 100) / 100);
        expect(result.summary.totalYieldKg).toBe(crop.totalKg);
        expect(result.summary.yieldKgByCrop[String(catalogCrop.id)]).toBe(crop.totalKg);
      });
    }
  }
});
