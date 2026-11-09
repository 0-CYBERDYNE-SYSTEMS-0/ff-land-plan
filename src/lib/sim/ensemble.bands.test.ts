import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import type { SeasonEnsembles, SeasonYear } from '@/lib/ensembles';
import { freezeRunModelInputs, freezeRunModelInputsV2 } from './model-inputs';
import type { RunConfig } from './types';
import { ensembleCacheKey, ensembleUnavailableReason, EnsembleResultCache, runEnsemble, runEnsembleCached, summarizeEnsemble } from './ensemble';

const lettuce = cropLibrary.find((crop) => crop.slug === 'lettuce')!;

function config(startDate = '2026-05-01'): RunConfig {
  const runConfig: RunConfig = {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 0.25,
      allowOutsideBeds: false,
      ground: {},
      planting: { '0,0': lettuce.id },
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    startDate,
    dayCount: 90,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [{ kind: 'irrigate', date: `${startDate.slice(0, 4)}-05-10`, mm: 8 }],
    meanDailyGddC: 8,
  };
  runConfig.modelInputs = freezeRunModelInputs(runConfig, {
    soil: { awcMmPerCm: 2, organicMatterPct: 3 },
    crops: [lettuce],
  });
  return runConfig;
}

function years(): SeasonEnsembles {
  const seasons: SeasonYear[] = [2019, 2020, 2021, 2022].map((year, yearIndex) => {
    const start = Date.UTC(year, 0, 1);
    const count = (Date.UTC(year + 1, 0, 1) - start) / 86_400_000;
    return {
      year,
      source: 'era5',
      daily: Array.from({ length: count }, (_, offset) => {
        const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
        const tmeanC = 19 + yearIndex * 1.5;
        return {
          date,
          tminC: tmeanC - 5,
          tmaxC: tmeanC + 5,
          tmeanC,
          precipMm: yearIndex * 0.5,
          et0Mm: 1.5 + yearIndex * 0.2,
        };
      }),
    };
  });
  return { years: seasons, source: 'era5' };
}

describe('historical ensemble bands', () => {
  it('does not turn unavailable v2 runs into zero-valued ensemble estimates', () => {
    const v2 = config();
    v2.cropModelVersion = 'crop-model-v2';
    v2.modelInputs = undefined;
    const reason = ensembleUnavailableReason(v2, years());

    expect(reason).toContain('Frozen crop-model-v2 parameter inputs are missing');
    expect(runEnsemble(v2, years())).toBeNull();
  });

  it('does not label dry-matter v2 output as a fresh-matter ensemble band', () => {
    const v2 = config();
    v2.cropModelVersion = 'crop-model-v2';
    v2.modelInputs = freezeRunModelInputsV2(v2, {
      soil: { awcMmPerCm: 2, organicMatterPct: 3 },
      crops: [lettuce],
      cropParametersV2: [{
        cropId: lettuce.id,
        thermal: {
          tBaseC: 5,
          gddToMaturityCdays: [700, 800],
          startEvents: ['transplanting'],
          accumulationStart: 'planting',
          maturityEndpoint: 'first harvest',
          accumulationMethod: 'study thermal-time',
          sourceCitation: 'Synthetic test contract',
          sourceUrl: 'test-only:fixture',
        },
        production: {
          equationFamily: 'LINTUL-net-RUE',
          rueGPerMjInterceptedPar: 2,
          initialDryMatterGPerM2: 0,
          interceptedParFraction: 0.5,
          harvestIndex: 0.5,
          status: 'supported',
          missing: [],
          evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic test contract', sourceUrl: 'test-only:fixture', validDomain: 'software test only' },
        },
        rootZone: {
          method: 'FAO-56',
          effectiveRootDepthCm: 20,
          depletionFraction: 0.5,
          cropCoefficient: 1,
          initialStorageFraction: 0.7,
          status: 'supported',
          missing: [],
          evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic test contract', sourceUrl: 'test-only:fixture', validDomain: 'software test only' },
        },
        lifecycle: 'plant',
      }],
    });
    v2.cropStartEvents = { '0,0': 'transplanting' };

    expect(ensembleUnavailableReason(v2, years()))
      .toContain('cannot represent crop-model-v2 dry-matter output');
    expect(runEnsemble(v2, years())).toBeNull();
  });

  it('does not replay a saved v1 config from a caller-supplied current context', () => {
    const saved = { ...config(), modelInputs: undefined };

    expect(ensembleUnavailableReason(saved, years(), 5, true))
      .toContain('Historical record has no frozen model inputs.');
    expect(runEnsemble(saved, years(), {
      persistedConfig: true,
      ctx: { soil: { awcMmPerCm: 2, organicMatterPct: 3 }, crops: [lettuce] },
    })).toBeNull();
  });

  it('returns deterministic ordered bands for the same frozen inputs', () => {
    const historical = years();
    const first = runEnsemble(config(), historical);
    const second = runEnsemble(config(), historical);

    expect(first).toEqual(second);
    expect(first).not.toBeNull();
    expect(first!.years).toEqual([2019, 2020, 2021, 2022]);
    for (const metric of [first!.totalYieldKg, first!.harvestReadyDay, first!.waterUseMm]) {
      if (metric.p10 !== null && metric.p50 !== null && metric.p90 !== null) {
        expect(metric.p10).toBeLessThanOrEqual(metric.p50);
        expect(metric.p50).toBeLessThanOrEqual(metric.p90);
      }
    }
  });

  it('keys equivalent date-shifted management by relative timing and distinguishes changed timing', () => {
    const historical = years();
    const first = config('2026-05-01');
    const shifted = config('2027-05-01');
    const shiftedDay = config('2027-05-01');
    shiftedDay.interventions = [{ kind: 'irrigate', date: '2027-05-11', mm: 8 }];

    expect(ensembleCacheKey(first, historical)).toBe(ensembleCacheKey(shifted, historical));
    expect(ensembleCacheKey(first, historical)).not.toBe(ensembleCacheKey(shiftedDay, historical));

    const legacy = { ...first, modelInputs: undefined };
    expect(ensembleCacheKey(legacy, historical, 5, {
      soil: { awcMmPerCm: 2, organicMatterPct: 3 },
      crops: [lettuce],
    })).not.toBe(ensembleCacheKey(legacy, historical, 5, {
      soil: { awcMmPerCm: 1, organicMatterPct: 3 },
      crops: [lettuce],
    }));
  });

  it('caches only the small result and keeps missing harvest dates missing', () => {
    const cache = new EnsembleResultCache(2);
    const historical = years();
    const first = runEnsembleCached(config(), historical, {}, cache);
    const again = runEnsembleCached(config(), historical, {}, cache);
    expect(again).toEqual(first);
    expect(cache.get(first.key)).toEqual(first.result);

    const summary = summarizeEnsemble('era5', [
      { year: 1, totalYieldKg: 2, harvestReadyDay: null, waterUseMm: 3 },
      { year: 2, totalYieldKg: 4, harvestReadyDay: 12, waterUseMm: 5 },
      { year: 3, totalYieldKg: 6, harvestReadyDay: null, waterUseMm: 7 },
    ]);
    expect(summary?.harvestReadyDay).toEqual({ p10: null, p50: null, p90: null, samples: 1 });
  });

  it('skips a historical year when its requested calendar window has a missing day', () => {
    const historical = years();
    historical.years = historical.years.map((season) => season.year === 2019
      ? { ...season, daily: season.daily.filter((day) => day.date !== '2019-05-15') }
      : season);
    historical.years = historical.years.map((season) => season.year === 2020
      ? { ...season, daily: season.daily.filter((day) => day.date !== '2020-05-15') }
      : season);
    historical.years = historical.years.map((season) => season.year === 2021
      ? { ...season, daily: season.daily.filter((day) => day.date !== '2021-05-15') }
      : season);

    expect(runEnsemble(config(), historical)).toBeNull();
  });
});
