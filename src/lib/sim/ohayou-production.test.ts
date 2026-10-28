import { describe, expect, it } from 'vitest';
import { ohayouSpringControlDailyProduction } from './ohayou-production';

describe('Ohayou spring-control total-solar production equation', () => {
  const syntheticLeafAreaIndexM2PerM2 = 1.2;

  it('produces exactly zero dry matter at zero total solar radiation', () => {
    expect(ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: 0,
      leafAreaIndexM2PerM2: syntheticLeafAreaIndexM2PerM2,
    })).toEqual({
      status: 'calculated',
      interceptedSolarRadiationMJPerM2Day: 0,
      dryMatterGainGPerM2Day: 0,
    });
  });

  it('applies the source equation at low and higher synthetic solar fixture values', () => {
    const lowSolarFixtureMJPerM2Day = 2;
    const higherSolarFixtureMJPerM2Day = 18;
    const interceptedFraction = 1 - Math.exp(-1.09 * syntheticLeafAreaIndexM2PerM2);
    const lowSolar = ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: lowSolarFixtureMJPerM2Day,
      leafAreaIndexM2PerM2: syntheticLeafAreaIndexM2PerM2,
    });
    const higherSolar = ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: higherSolarFixtureMJPerM2Day,
      leafAreaIndexM2PerM2: syntheticLeafAreaIndexM2PerM2,
    });

    expect(lowSolar.status).toBe('calculated');
    expect(higherSolar.status).toBe('calculated');
    if (lowSolar.status !== 'calculated' || higherSolar.status !== 'calculated') return;

    expect(lowSolar.interceptedSolarRadiationMJPerM2Day)
      .toBeCloseTo(lowSolarFixtureMJPerM2Day * interceptedFraction, 12);
    expect(lowSolar.dryMatterGainGPerM2Day)
      .toBeCloseTo(1.16 * lowSolarFixtureMJPerM2Day * interceptedFraction, 12);
    expect(higherSolar.interceptedSolarRadiationMJPerM2Day)
      .toBeCloseTo(higherSolarFixtureMJPerM2Day * interceptedFraction, 12);
    expect(higherSolar.dryMatterGainGPerM2Day)
      .toBeCloseTo(1.16 * higherSolarFixtureMJPerM2Day * interceptedFraction, 12);
    expect(higherSolar.dryMatterGainGPerM2Day).toBeGreaterThan(lowSolar.dryMatterGainGPerM2Day);
  });

  it('does not return numeric production when total solar radiation or LAI is missing or non-finite', () => {
    const invalidValues = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const;

    for (const solarRadiationMJm2Day of invalidValues) {
      const result = ohayouSpringControlDailyProduction({
        solarRadiationMJm2Day,
        leafAreaIndexM2PerM2: syntheticLeafAreaIndexM2PerM2,
      });
      expect(result.status).toBe('unavailable');
      expect(result).not.toHaveProperty('dryMatterGainGPerM2Day');
    }

    for (const invalidLai of invalidValues) {
      const result = ohayouSpringControlDailyProduction({
        solarRadiationMJm2Day: 0,
        leafAreaIndexM2PerM2: invalidLai,
      });
      expect(result.status).toBe('unavailable');
      expect(result).not.toHaveProperty('dryMatterGainGPerM2Day');
    }
  });

  it('does not return numeric production for negative inputs or an overflowing result', () => {
    const negativeSolar = ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: -1,
      leafAreaIndexM2PerM2: syntheticLeafAreaIndexM2PerM2,
    });
    const negativeLai = ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: 1,
      leafAreaIndexM2PerM2: -1,
    });
    const overflowingGain = ohayouSpringControlDailyProduction({
      solarRadiationMJm2Day: Number.MAX_VALUE,
      leafAreaIndexM2PerM2: Number.MAX_VALUE,
    });

    expect(negativeSolar.status).toBe('unavailable');
    expect(negativeSolar).not.toHaveProperty('dryMatterGainGPerM2Day');
    expect(negativeLai.status).toBe('unavailable');
    expect(negativeLai).not.toHaveProperty('dryMatterGainGPerM2Day');
    expect(overflowingGain).toEqual({
      status: 'unavailable',
      reason: 'Calculated dry-matter gain is non-finite.',
    });
  });
});
