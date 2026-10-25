import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import type { Observation, PlanState } from '@/types';
import { createRun, simulateRun } from './engine';
import { canonicalizeObservations, assimilateObservations, observationMatchesRun } from './observations';
import { ReplayStateCache, replayRunToDay } from './replay-cache';
import { collectRunPredictionPairs } from './scorecard';
import { forkRun } from './timeline';
import { createTwinRunRecord } from './twin';
import type { DailyEnvironment, RunConfig, RunRecord } from './types';

const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
} as const;

const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;

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

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    farmId: 1,
    basePlan: plan(),
    startDate: '2026-05-01',
    dayCount: 3,
    seed: 17,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    meanDailyGddC: 8,
    interventions: [],
    ...overrides,
  };
}

function weather(): DailyEnvironment[] {
  return [
    ['2026-05-01', 12, 24],
    ['2026-05-02', 13, 25],
    ['2026-05-03', 14, 26],
  ].map(([date, tMinC, tMaxC]) => ({
    date: String(date),
    tMinC: Number(tMinC),
    tMaxC: Number(tMaxC),
    precipMm: 0,
    etoMm: 2,
    gddBase10C: Math.max(0, (Number(tMinC) + Number(tMaxC)) / 2 - 10),
    provenance: PROVENANCE,
  }));
}

function observation(overrides: Partial<Observation> & Pick<Observation, 'id' | 'date' | 'metric' | 'value' | 'unit'>): Observation {
  return {
    farmId: 1,
    source: 'sensor',
    ...overrides,
  };
}

function record(runConfig: RunConfig, observations?: Observation[]): RunRecord {
  const envSeries = weather();
  return {
    id: 'run:1:baseline',
    farmId: 1,
    label: 'Baseline',
    createdAt: '2026-05-01T00:00:00.000Z',
    config: runConfig,
    envSeries,
    ...(observations ? { observations } : {}),
    summary: simulateRun(runConfig, envSeries, { crops: [tomato] }, observations ?? []).summary,
    status: 'complete',
  };
}

describe('frozen observations and replay', () => {
  it('canonicalizes by date and id and rejects conflicting duplicate ids', () => {
    const later = observation({ id: 'z', date: '2026-05-02', metric: 'stage', value: 0.4, unit: 'fraction' });
    const first = observation({ id: 'a', date: '2026-05-01', metric: 'stage', value: 0.3, unit: 'fraction' });
    const sameFirst = { source: 'sensor' as const, unit: 'fraction', value: 0.3, metric: 'stage' as const, date: '2026-05-01', id: 'a', farmId: 1 };
    expect(canonicalizeObservations([later, first, sameFirst])).toEqual([first, later]);
    expect(() => canonicalizeObservations([
      first,
      { ...first, value: 0.6 },
    ])).toThrow('conflicting records');
    expect(() => canonicalizeObservations([
      observation({ id: 'bad-unit', date: '2026-05-01', metric: 'stage', value: 3, unit: 'stage' }),
    ])).toThrow('unit "fraction"');
  });

  it('matches observations to the exact farm, environment, and growing target', () => {
    const runConfig = config({
      environment: {
        id: 'env:1:1',
        farmId: 1,
        archetype: 'hoophouse',
        label: 'Tunnel',
        x: 0,
        y: 0,
        widthM: 6,
        heightM: 3,
        cellM: 0.25,
        layout: {
          access: [],
          reservations: [],
          growingSpaces: [{
            id: 'rack', label: 'Rack', kind: 'rack', x: 0, y: 0, widthM: 1, depthM: 1,
            levels: [{ id: 'level-1', label: 'Level 1', elevationM: 0.5 }],
          }],
        },
      },
    });
    const base = observation({ id: 'scope', date: '2026-05-01', metric: 'stage', value: 0.5, unit: 'fraction' });
    expect(observationMatchesRun({ ...base, environmentId: 'env:1:1' }, runConfig)).toBe(true);
    expect(observationMatchesRun(base, runConfig)).toBe(false);
    expect(observationMatchesRun({ ...base, environmentId: 'env:1:other' }, runConfig)).toBe(false);
    expect(observationMatchesRun({ ...base, environmentId: 'env:1:1', growingSpaceId: 'rack', levelId: 'level-1' }, runConfig)).toBe(true);
    expect(observationMatchesRun({ ...base, environmentId: 'env:1:1', growingSpaceId: 'rack', levelId: 'level-2' }, runConfig)).toBe(false);
  });

  it('nudges bounded moisture and monotonic biomass at the day boundary', () => {
    const runConfig = config();
    const initial = createRun(runConfig, { crops: [tomato] });
    const wetness = assimilateObservations(initial, runConfig, [
      observation({ id: 'm1', date: '2026-05-01', metric: 'soilMoistureFrac', value: -2, unit: 'fraction' }),
    ], '2026-05-01', [tomato]);
    expect(wetness.state.cells['0,0']!.moistureFrac).toBe(0.35);
    expect(wetness.events[0]?.kind).toBe('assimilated');

    const growth = assimilateObservations(initial, runConfig, [
      observation({ id: 's1', date: '2026-05-01', metric: 'stage', value: 2, unit: 'fraction' }),
    ], '2026-05-01', [tomato]);
    expect(growth.state.cells['0,0']!.biomassFrac).toBe(0.3);
    expect(growth.state.cells['0,0']!.stage).toBeGreaterThan(0);
    const lowerAgain = assimilateObservations(growth.state, runConfig, [
      observation({ id: 's2', date: '2026-05-02', metric: 'stage', value: 0.1, unit: 'fraction' }),
    ], '2026-05-02', [tomato]);
    expect(lowerAgain.state.cells['0,0']!.biomassFrac).toBe(0.3);
    expect(lowerAgain.events[0]?.data).toMatchObject({ metric: 'stage', innovation: -0.2 });
  });

  it('keeps driver observations out of state and replays frozen inputs identically', () => {
    const runConfig = config();
    const driver = observation({ id: 'temp', date: '2026-05-01', metric: 'airTempC', value: 33, unit: '°C' });
    const initial = createRun(runConfig, { crops: [tomato] });
    const driverResult = assimilateObservations(initial, runConfig, [driver], '2026-05-01', [tomato]);
    expect(driverResult.state).toBe(initial);
    expect(driverResult.events).toEqual([]);

    const observations = [
      observation({ id: 's2', date: '2026-05-02', metric: 'stage', value: 0.7, unit: 'fraction' }),
      observation({ id: 's1', date: '2026-05-01', metric: 'stage', value: 0.4, unit: 'fraction' }),
      driver,
    ];
    const saved = record(runConfig, observations);
    const cache = new ReplayStateCache();
    const replay = replayRunToDay(saved, 3, { crops: [tomato] }, cache);
    const replayAgain = replayRunToDay(saved, 3, { crops: [tomato] }, new ReplayStateCache());
    expect(replay).toEqual(replayAgain);
    expect(replay).toEqual(simulateRun(runConfig, saved.envSeries, { crops: [tomato] }, observations).finalState);
    expect(canonicalizeObservations(saved.observations ?? []).map((item) => item.id)).toEqual(['s1', 'temp', 's2']);
  });

  it('builds prediction pairs from the frozen run at the matching day boundary', () => {
    const runConfig = config();
    const saved = record(runConfig, [
      observation({ id: 'air', date: '2026-05-01', metric: 'airTempC', value: 20, unit: '°C' }),
      observation({ id: 'stage', date: '2026-05-01', metric: 'stage', value: 0.6, unit: 'fraction' }),
    ]);
    expect(collectRunPredictionPairs(saved, { crops: [tomato] })).toEqual([
      { observationId: 'air', metric: 'airTempC', date: '2026-05-01', observed: 20, predicted: 18 },
      { observationId: 'stage', metric: 'stage', date: '2026-05-01', observed: 0.6, predicted: 0 },
    ]);
  });

  it('does not score indoor DLI against raw outdoor light when the run has no climate model', () => {
    const runConfig = config({ basePlan: { ...plan(), surface: 'greenhouse' } });
    const saved = record(runConfig, [
      observation({ id: 'dli', date: '2026-05-01', metric: 'dliMol', value: 14, unit: 'mol/m²/day' }),
    ]);
    saved.envSeries[0] = {
      ...saved.envSeries[0]!,
      dliNaturalMol: 20,
      provenance: { ...saved.envSeries[0]!.provenance, dliNaturalMol: 'default' },
    };
    expect(collectRunPredictionPairs(saved, { crops: [tomato] })[0]?.predicted).toBeNull();
  });

  it('creates a twin without mutating its source and forks only completed observations', () => {
    const runConfig = config();
    const parent = record(runConfig);
    const before = JSON.stringify(parent);
    const twin = createTwinRunRecord(parent, [
      observation({ id: 's3', date: '2026-05-03', metric: 'stage', value: 0.9, unit: 'fraction' }),
      observation({ id: 's1', date: '2026-05-01', metric: 'stage', value: 0.5, unit: 'fraction' }),
      observation({ id: 's2', date: '2026-05-02', metric: 'stage', value: 0.6, unit: 'fraction' }),
    ], { crops: [tomato] }, { id: 'run:1:twin', createdAt: '2026-05-04T00:00:00.000Z' });
    expect(JSON.stringify(parent)).toBe(before);
    expect(twin.parentId).toBe(parent.id);
    expect(twin.label).toContain('Twin');
    expect(twin.observations?.map((item) => item.id)).toEqual(['s1', 's2', 's3']);
    expect(twin.summary).toEqual(simulateRun(runConfig, twin.envSeries, { crops: [tomato] }, twin.observations).summary);

    const fork = forkRun(twin, 2, {}, { crops: [tomato] });
    expect(fork.observations?.map((item) => item.id)).toEqual(['s1', 's2']);
    expect(replayRunToDay(fork, 2, { crops: [tomato] }, new ReplayStateCache()))
      .toEqual(replayRunToDay(twin, 2, { crops: [tomato] }, new ReplayStateCache()));
  });
});
