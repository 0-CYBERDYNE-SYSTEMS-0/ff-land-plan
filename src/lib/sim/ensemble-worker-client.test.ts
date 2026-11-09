import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonEnsembles } from '@/lib/ensembles';
import { runEnsembleInWorker } from './ensemble-worker-client';
import type { RunConfig } from './types';

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
    updatedAt: '2026-01-01',
  },
  startDate: '2026-01-01',
  dayCount: 1,
  seed: 1,
  scenario: 'baseline',
  tempDeltaC: 0,
  precipMultiplier: 1,
  interventions: [],
};

const ensembles: SeasonEnsembles = {
  source: 'era5',
  years: [2022, 2023, 2024].map((year) => ({
    year,
    source: 'era5',
    daily: [{
      date: `${year}-01-01`,
      tminC: 5,
      tmaxC: 10,
      tmeanC: 7.5,
      precipMm: 0,
      et0Mm: 1,
    }],
  })),
};

describe('ensemble worker cancellation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('terminates the worker and rejects with AbortError when cancelled', async () => {
    let worker: { terminated: boolean } | undefined;
    class FakeWorker {
      onmessage = null;
      onerror = null;
      terminated = false;
      constructor() { worker = this; }
      postMessage() {}
      terminate() { this.terminated = true; }
    }
    vi.stubGlobal('Worker', FakeWorker);

    const controller = new AbortController();
    const result = runEnsembleInWorker(config, ensembles, { signal: controller.signal });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker?.terminated).toBe(true);
  });
});
