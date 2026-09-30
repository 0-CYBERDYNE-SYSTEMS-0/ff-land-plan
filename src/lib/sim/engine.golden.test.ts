import { describe, expect, it } from 'vitest';
import { simulateRun } from './engine';
import type { DailyEnvironment, RunConfig } from './types';

type WeatherDay = Omit<DailyEnvironment, 'date' | 'provenance'>;

const WARM_PATTERN: WeatherDay[] = [
  { tMinC: 11, tMaxC: 23, precipMm: 4, etoMm: 2.1, gddBase10C: 7 },
  { tMinC: 12, tMaxC: 25, precipMm: 0, etoMm: 2.3, gddBase10C: 8.5 },
  { tMinC: 13, tMaxC: 26, precipMm: 1.5, etoMm: 2.6, gddBase10C: 9.5 },
  { tMinC: 14, tMaxC: 28, precipMm: 0, etoMm: 2.9, gddBase10C: 11 },
  { tMinC: 15, tMaxC: 29, precipMm: 0.5, etoMm: 3.1, gddBase10C: 12 },
  { tMinC: 13, tMaxC: 25, precipMm: 8, etoMm: 2.5, gddBase10C: 9 },
  { tMinC: 12, tMaxC: 24, precipMm: 0, etoMm: 2.2, gddBase10C: 8 },
];

const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
} as const;

function warmSeries(drought = false): DailyEnvironment[] {
  return Array.from({ length: 30 }, (_, dayIndex) => {
    const weather = WARM_PATTERN[dayIndex % WARM_PATTERN.length]!;
    const date = new Date(Date.UTC(2026, 4, dayIndex + 1)).toISOString().slice(0, 10);
    return {
      date,
      ...weather,
      ...(drought ? { precipMm: 0, etoMm: 4.5 } : {}),
      provenance: PROVENANCE,
    };
  });
}

function greenhouseSeries(): DailyEnvironment[] {
  return warmSeries().map((day) => ({
    ...day,
    tMinC: day.tMinC + 4,
    tMaxC: day.tMaxC + 4,
    gddBase10C: day.gddBase10C + 4,
    provenance: {
      ...day.provenance,
      tMinC: 'scenario-delta',
      tMaxC: 'scenario-delta',
    },
    raw: {
      tMinC: day.tMinC,
      tMaxC: day.tMaxC,
      precipMm: day.precipMm,
      source: 'default',
    },
  }));
}

const coldSeries: DailyEnvironment[] = Array.from({ length: 4 }, (_, dayIndex) => ({
  date: `2026-01-0${dayIndex + 1}`,
  tMinC: 2,
  tMaxC: 8,
  precipMm: 0,
  etoMm: 0.5,
  gddBase10C: 0,
  provenance: PROVENANCE,
}));

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 0.25,
      allowOutsideBeds: false,
      ground: {},
      planting: { '0,0': 1 },
      updatedAt: '2026-05-01',
    },
    startDate: '2026-05-01',
    dayCount: 30,
    seed: 417,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    meanDailyGddC: 8.5,
    ...overrides,
  };
}

function goldenOutput(result: ReturnType<typeof simulateRun>) {
  const cell = result.finalState.cells['0,0']!;
  return {
    summary: result.summary,
    surface: result.finalState.surface,
    cell: {
      moistureFrac: cell.moistureFrac,
      nitrogenKgHa: cell.nitrogenKgHa,
      gddAccumC: cell.gddAccumC,
      biomassFrac: cell.biomassFrac,
      stage: cell.stage,
      floweringFrac: cell.floweringFrac,
      pestPressure: cell.pestPressure,
      peakPestPressure: cell.peakPestPressure,
      stress: cell.stress,
      stressSum: cell.stressSum,
      stressDaysCount: cell.stressDaysCount,
      readyAtDay: cell.readyAtDay ?? null,
      harvested: cell.harvested ?? false,
    },
    events: result.events.map(({ dayIndex, kind, data }) => ({
      dayIndex,
      kind,
      data: data ?? null,
    })),
  };
}

describe('simulateRun golden outputs', () => {
  it('matches the baseline scenario', () => {
    const result = simulateRun(config(), warmSeries());
    expect(goldenOutput(result)).toMatchSnapshot('baseline');
  });

  it('matches the drought scenario', () => {
    const result = simulateRun(
      config({ scenario: 'drought' }),
      warmSeries(true),
    );
    expect(goldenOutput(result)).toMatchSnapshot('drought');
  });

  it('matches the greenhouse scenario', () => {
    const result = simulateRun(
      config({
        tempDeltaC: 4,
        interventions: [{ kind: 'surface', date: '2026-05-01', surface: 'greenhouse' }],
      }),
      greenhouseSeries(),
    );
    expect(goldenOutput(result)).toMatchSnapshot('greenhouse');
  });

  it('matches the cold-window scenario', () => {
    const result = simulateRun(
      config({
        startDate: '2026-01-01',
        dayCount: coldSeries.length,
        meanDailyGddC: 0,
      }),
      coldSeries,
    );
    expect(goldenOutput(result)).toMatchSnapshot('cold-window');
  });
});
