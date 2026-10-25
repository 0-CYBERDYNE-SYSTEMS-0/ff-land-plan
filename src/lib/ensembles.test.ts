import { describe, expect, it } from 'vitest';
import { splitEra5 } from './ensembles';

describe('historical season inputs', () => {
  it('retains calendar dates and actual daily temperature range', () => {
    const start = Date.UTC(2018, 0, 1);
    const count = 300;
    const time = Array.from({ length: count }, (_, index) =>
      new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    );
    const years = splitEra5({
      time,
      temperature_2m_max: time.map((_, index) => 24 + index / 100),
      temperature_2m_min: time.map((_, index) => 12 + index / 100),
      precipitation_sum: time.map(() => 0.5),
      et0_fao_evapotranspiration: time.map(() => 2.1),
    });

    expect(years).toHaveLength(1);
    expect(years[0]?.source).toBe('era5');
    expect(years[0]?.daily[0]).toEqual({
      date: '2018-01-01',
      tminC: 12,
      tmaxC: 24,
      tmeanC: 18,
      precipMm: 0.5,
      et0Mm: 2.1,
    });
    expect(years[0]?.daily.at(-1)?.date).toBe('2018-10-27');
  });
});
