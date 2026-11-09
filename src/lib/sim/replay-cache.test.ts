import { describe, expect, it } from 'vitest';
import { createRun, simulateRun, stepDay } from './engine';
import { replayRunToDay, ReplayStateCache } from './replay-cache';
import { freezeRunModelInputs } from './model-inputs';
import type { DailyEnvironment, RunConfig, RunRecord, SimState } from './types';

function cachedState(dayIndex: number): SimState {
  return { dayIndex } as SimState;
}

function runFixture(): RunRecord {
  const config: RunConfig = {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 0.25,
      allowOutsideBeds: false,
      ground: {},
      planting: {},
      updatedAt: '2026-05-01T00:00:00.000Z',
    },
    startDate: '2026-05-01',
    dayCount: 4,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
  };
  config.modelInputs = freezeRunModelInputs(config);
  const provenance = { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' } as const;
  const envSeries: DailyEnvironment[] = Array.from({ length: 4 }, (_, index) => ({
    date: `2026-05-0${index + 1}`,
    tMinC: 12 + index,
    tMaxC: 22 + index,
    precipMm: index,
    etoMm: 1.2,
    gddBase10C: 7 + index,
    provenance,
  }));
  return {
    id: 'run:cache-test',
    farmId: 1,
    label: 'Cache test',
    createdAt: '2026-05-01T00:00:00.000Z',
    config,
    envSeries,
    summary: simulateRun(config, envSeries).summary,
    status: 'complete',
  };
}

describe('ReplayStateCache', () => {
  it('keeps at most 64 entries and evicts least recently used states', () => {
    const cache = new ReplayStateCache(3);
    cache.set('a', 0, cachedState(0));
    cache.set('a', 1, cachedState(1));
    cache.set('b', 0, cachedState(0));
    expect(cache.get('a', 0)?.dayIndex).toBe(0);
    cache.set('c', 0, cachedState(0));

    expect(cache.size).toBe(3);
    expect(cache.get('a', 1)).toBeUndefined();
    expect(cache.get('a', 0)?.dayIndex).toBe(0);
  });

  it('invalidates every cached boundary when a same-id run is amended', () => {
    const cache = new ReplayStateCache();
    cache.set('run-a', 0, cachedState(0));
    cache.set('run-a', 4, cachedState(4));
    cache.set('run-b', 2, cachedState(2));
    cache.invalidateRun('run-a');

    expect(cache.get('run-a', 0)).toBeUndefined();
    expect(cache.get('run-a', 4)).toBeUndefined();
    expect(cache.get('run-b', 2)?.dayIndex).toBe(2);
  });

  it('replays from the nearest cached completed-day boundary', () => {
    const run = runFixture();
    const cache = new ReplayStateCache();
    let state = createRun(run.config);
    for (let index = 0; index < 2; index += 1) {
      state = stepDay(state, run.envSeries[index]!, run.config).state;
    }
    cache.set(run.id, state.dayIndex, state);

    const replayed = replayRunToDay(run, 4, {}, cache);
    expect(replayed).toEqual(simulateRun(run.config, run.envSeries).finalState);
    expect(cache.get(run.id, 4)).toBe(replayed);
    expect(replayRunToDay(run, 4, {}, cache)).toBe(replayed);
  });

  it('rejects a historical record that would need the current catalog or caller context', () => {
    const run = runFixture();
    const unsupported = { ...run, config: { ...run.config, modelInputs: undefined } };

    expect(() => replayRunToDay(unsupported, 2, { crops: [] }, new ReplayStateCache()))
      .toThrow('Historical record has no frozen model inputs.');
  });
});
