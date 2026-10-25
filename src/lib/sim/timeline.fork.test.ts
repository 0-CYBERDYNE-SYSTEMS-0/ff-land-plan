import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import type { PlanState } from '@/types';
import { createRun, simulateRun, stepDay, type SimRunCtx } from './engine';
import { freezeRunModelInputs } from './model-inputs';
import type { DailyEnvironment, RunConfig, RunRecord } from './types';
import { forkRun } from './timeline';

const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
} as const;

const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
const ctx: SimRunCtx = { crops: [tomato] };

function plan(): PlanState {
  return {
    farmId: 1,
    widthM: 1,
    heightM: 1,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting: { '0,0': tomato.id },
    ground: {},
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function weatherSeries(): DailyEnvironment[] {
  return [
    ['2026-05-01', 14, 25, 0],
    ['2026-05-02', 13, 24, 0],
    ['2026-05-03', 12, 23, 0],
    ['2026-05-04', 11, 22, 1],
  ].map(([date, tMinC, tMaxC, precipMm]) => ({
    date: String(date),
    tMinC: Number(tMinC),
    tMaxC: Number(tMaxC),
    precipMm: Number(precipMm),
    etoMm: 1.5,
    gddBase10C: Math.max(0, (Number(tMinC) + Number(tMaxC)) / 2 - 10),
    provenance: PROVENANCE,
  }));
}

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    farmId: 1,
    basePlan: plan(),
    startDate: '2026-05-01',
    dayCount: 4,
    seed: 7,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    meanDailyGddC: 8.5,
    interventions: [
      { kind: 'irrigate', date: '2026-05-02', mm: 8 },
      { kind: 'fertilize', date: '2026-05-04', nKgHa: 30 },
    ],
    ...overrides,
  };
}

function record(runConfig: RunConfig, envSeries: DailyEnvironment[]): RunRecord {
  return {
    id: 'run:1:parent',
    farmId: 1,
    label: 'Baseline',
    createdAt: '2026-05-01T00:00:00.000Z',
    config: runConfig,
    envSeries,
    summary: simulateRun(runConfig, envSeries, ctx).summary,
    status: 'complete',
  };
}

function prefix(run: RunRecord, afterDayCount: number) {
  let state = createRun(run.config, ctx);
  const result: Array<{ dayStats: unknown; biomass: Record<string, number>; events: unknown }> = [];
  for (let dayIndex = 0; dayIndex < afterDayCount; dayIndex += 1) {
    const stepped = stepDay(state, run.envSeries[dayIndex]!, run.config, ctx);
    state = stepped.state;
    result.push({
      dayStats: stepped.dayStats,
      biomass: Object.fromEntries(Object.entries(state.cells).map(([key, cell]) => [key, cell.biomassFrac])),
      events: stepped.events,
    });
  }
  return result;
}

describe('forkRun', () => {
  it('keeps the completed prefix identical and forks only future management', () => {
    const parent = record(config(), weatherSeries());
    const fork = forkRun(parent, 2, {
      interventions: [
        { kind: 'irrigate', date: '2026-05-03', mm: 4 },
        { kind: 'fertilize', date: '2026-05-03', nKgHa: 12 },
      ],
    }, ctx);

    expect(fork.id).not.toBe(parent.id);
    expect(fork.label).toBe('Baseline ⟂ d2');
    expect(fork.parentId).toBe(parent.id);
    expect(fork.forkedAtDay).toBe(2);
    expect(fork.config.meanDailyGddC).toBe(parent.config.meanDailyGddC);
    expect(fork.config.basePlan).toEqual(parent.config.basePlan);
    expect(fork.config.basePlan).not.toBe(parent.config.basePlan);
    expect(fork.envSeries).toEqual(parent.envSeries);
    expect(fork.envSeries).not.toBe(parent.envSeries);
    expect(fork.config.interventions).toEqual([
      parent.config.interventions[0],
      { kind: 'irrigate', date: '2026-05-03', mm: 4 },
      { kind: 'fertilize', date: '2026-05-03', nKgHa: 12 },
    ]);
    expect(prefix(fork, 2)).toEqual(prefix(parent, 2));
    expect(fork.summary).toEqual(simulateRun(fork.config, fork.envSeries, ctx).summary);
  });

  it('rejects weather, structural and non-future patches', () => {
    const parent = record(config(), weatherSeries());

    expect(() => forkRun(parent, 2, {
      interventions: [{ kind: 'weather', fromDate: '2026-05-03', tempDeltaC: 2 }],
    }, ctx)).toThrow('management interventions only');
    expect(() => forkRun(parent, 2, {
      interventions: [{ kind: 'surface', date: '2026-05-03', surface: 'greenhouse' }],
    }, ctx)).toThrow('management interventions only');
    expect(() => forkRun(parent, 2, {
      interventions: [{ kind: 'irrigate', date: '2026-05-02', mm: 4 }],
    }, ctx)).toThrow('after the completed-day boundary');
  });

  it('reuses frozen custom-crop and soil inputs when the live catalog changes', () => {
    const customCrop = { ...tomato, id: 9811, isCustom: true, yieldKgPerPlant: 0.8 };
    const originalCtx: SimRunCtx = {
      soil: { awcMmPerCm: 2.1, organicMatterPct: 4.2 },
      crops: [customCrop],
    };
    const runConfig = config({
      basePlan: { ...plan(), planting: { '0,0': customCrop.id } },
    });
    runConfig.modelInputs = freezeRunModelInputs(runConfig, originalCtx);
    const parentRecord: RunRecord = {
      ...record(runConfig, weatherSeries()),
      summary: simulateRun(runConfig, weatherSeries(), originalCtx).summary,
    };
    const changedCtx: SimRunCtx = {
      soil: { awcMmPerCm: 0.4, organicMatterPct: 0 },
      crops: [{ ...customCrop, name: 'Revised custom crop', yieldKgPerPlant: 0.05 }],
    };

    const fork = forkRun(parentRecord, 2, {
      interventions: [{ kind: 'irrigate', date: '2026-05-03', mm: 4 }],
    }, changedCtx);

    expect(fork.config.modelInputs).toEqual(parentRecord.config.modelInputs);
    expect(fork.config.modelInputs?.crops[0]?.name).toBe(customCrop.name);
    expect(prefix(fork, 2)).toEqual(prefix(parentRecord, 2));
    expect(fork.summary).toEqual(simulateRun(fork.config, fork.envSeries, changedCtx).summary);
  });
});
