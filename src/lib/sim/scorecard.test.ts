import { describe, expect, it } from 'vitest';
import { computeTwinScorecards, type TwinPredictionPair } from './scorecard';

describe('twin scorecards', () => {
  it('computes rolling 30-day MAE and signed observed-minus-predicted bias', () => {
    const pairs: TwinPredictionPair[] = [
      { observationId: 'a', metric: 'airTempC', date: '2026-05-02', observed: 12, predicted: 10 },
      { observationId: 'b', metric: 'airTempC', date: '2026-05-10', observed: 8, predicted: 10 },
      { observationId: 'c', metric: 'airTempC', date: '2026-04-10', observed: 100, predicted: 0 },
      { observationId: 'd', metric: 'dliMol', date: '2026-05-12', observed: 16, predicted: 18 },
      { observationId: 'e', metric: 'dliMol', date: '2026-05-12', observed: 9, predicted: null },
    ];

    expect(computeTwinScorecards(pairs, '2026-05-12')).toEqual([
      { metric: 'airTempC', n: 2, mae: 2, bias: 0, windowDays: 30 },
      { metric: 'dliMol', n: 1, mae: 2, bias: -2, windowDays: 30 },
    ]);
  });

  it('rejects an invalid rolling window or end date', () => {
    expect(() => computeTwinScorecards([], '2026-05-12', 0)).toThrow('positive integer');
    expect(() => computeTwinScorecards([], '2026-02-30')).toThrow('YYYY-MM-DD');
  });
});
