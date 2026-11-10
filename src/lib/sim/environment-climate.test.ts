import { describe, expect, it } from 'vitest';

import { makeEnvironment } from '@/lib/environment-model';
import { archetypes } from '@/creative/archetypes';
import {
  effectivePhotoperiodH,
  environmentDay,
  NO_CLIMATE_EQUIPMENT,
  withEnvironmentClimate,
  type ClimateEquipmentInput,
  type EnvironmentClimateDay,
  type OutdoorClimateDay,
} from '@/lib/sim/environment-climate';

const noGear: ClimateEquipmentInput = { ...NO_CLIMATE_EQUIPMENT };

function outdoor(overrides: Partial<OutdoorClimateDay> = {}): OutdoorClimateDay {
  return {
    tMinC: 0,
    tMaxC: 8,
    precipMm: 12,
    dliNaturalMol: 0,
    rhPct: 65,
    co2Ppm: 420,
    ...overrides,
  };
}

function saturationVaporPressureKPa(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

function absoluteHumidityGm3(tempC: number, rhPct: number): number {
  return 2167 * saturationVaporPressureKPa(tempC) * rhPct / 100 / (tempC + 273.15);
}

describe('growing-world climate prototype', () => {
  it('keeps open-field temperature, rain and ET byte-exact', () => {
    const field = makeEnvironment(1, { archetype: 'open-field' }, 'env:1:1');
    const weather = outdoor({ tMinC: -3.25, tMaxC: 14.5, precipMm: 8.2, dliNaturalMol: 17 });

    const day = environmentDay(field, weather, noGear);

    expect(day.tMinC).toBe(weather.tMinC);
    expect(day.tMaxC).toBe(weather.tMaxC);
    expect(day.rainMm).toBe(weather.precipMm);
    expect(day.etFactor).toBe(1);
    expect(day.dliMol).toBe(17);
  });

  it('leaves open-field daily environments untouched and tags enclosed outputs as modeled', () => {
    const field = makeEnvironment(1, { archetype: 'open-field' }, 'env:1:1');
    const greenhouse = makeEnvironment(1, { archetype: 'greenhouse-glass' }, 'env:1:2');
    const weather = outdoor({ tMinC: 2, tMaxC: 25, precipMm: 6, dliNaturalMol: 24 });
    const outdoorClimate = environmentDay(field, weather, noGear);
    const indoorClimate = environmentDay(greenhouse, weather, noGear);
    const source = {
      date: '2026-06-01',
      tMinC: weather.tMinC,
      tMaxC: weather.tMaxC,
      precipMm: weather.precipMm,
      etoMm: 4,
      gddBase10C: 3.5,
      provenance: { tMinC: 'open-meteo-archive', tMaxC: 'open-meteo-archive', precipMm: 'open-meteo-archive', etoMm: 'open-meteo-archive' },
    } as const;
    const fieldResult = withEnvironmentClimate(source, outdoorClimate, archetypes['open-field']);
    const greenhouseResult = withEnvironmentClimate(source, indoorClimate, archetypes['greenhouse-glass']);

    expect(fieldResult).toBe(source);
    expect(greenhouseResult.precipMm).toBe(0);
    expect(greenhouseResult.provenance.tMinC).toBe('model-estimate');
    expect(greenhouseResult.climate?.provenance.derivedFrom).toBe('archetype');
  });

  it('uses installed heating capacity when a greenhouse setpoint requests heat', () => {
    const greenhouse = makeEnvironment(1, {
      archetype: 'greenhouse-glass',
      widthM: 4,
      heightM: 3,
    }, 'env:1:1');
    const day = environmentDay(greenhouse, outdoor(), { ...noGear, heatingKw: 2 });

    expect(day.tMinC).toBeGreaterThanOrEqual(4);
    expect(day.tMinC).toBeLessThanOrEqual(12);
    expect(day.tMaxC).toBeGreaterThan(outdoor().tMaxC);
    expect(day.provenance.derivedFrom).toBe('equipment');
  });

  it('does not install invisible HVAC from archetype setpoints', () => {
    const greenhouse = makeEnvironment(1, {
      archetype: 'greenhouse-glass',
      widthM: 4,
      heightM: 3,
    }, 'env:1:1');

    const day = environmentDay(greenhouse, outdoor(), noGear);

    expect(day.tMinC).toBe(outdoor().tMinC);
    expect(day.provenance.derivedFrom).toBe('archetype');
  });

  it('keeps bounded finite outputs for malformed weather and extreme model inputs', () => {
    const greenhouse = makeEnvironment(1, {
      archetype: 'greenhouse-glass',
      widthM: 4,
      heightM: 3,
    }, 'env:1:1');
    const day = environmentDay(
      {
        ...greenhouse,
        widthM: Number.NaN,
        heightM: Number.POSITIVE_INFINITY,
        layout: { ...greenhouse.layout!, usableHeightM: Number.NaN },
      },
      outdoor({
        tMinC: Number.NaN,
        tMaxC: Number.POSITIVE_INFINITY,
        precipMm: Number.POSITIVE_INFINITY,
        dliNaturalMol: Number.POSITIVE_INFINITY,
        rhPct: Number.NaN,
        co2Ppm: Number.NaN,
      }),
      {
        ...noGear,
        heatingKw: Number.POSITIVE_INFINITY,
        coolingKw: Number.MAX_VALUE,
        dehumLpd: Number.MAX_VALUE,
        achBoost: Number.MAX_VALUE,
        co2KgDay: Number.MAX_VALUE,
      },
      { rhPct: Number.NaN, co2Ppm: Number.NaN },
      { transpirationKgDay: Number.POSITIVE_INFINITY, leafAreaIndex: Number.POSITIVE_INFINITY },
    );
    const numbers = [
      day.tMinC, day.tMaxC, day.rhPct, day.vpdKPa, day.dliMol, day.co2Ppm,
      day.leafWetHours, day.etFactor, day.rainMm, day.ach,
    ];

    expect(numbers.every(Number.isFinite)).toBe(true);
    expect(day.tMinC).toBeGreaterThanOrEqual(-80);
    expect(day.tMaxC).toBeLessThanOrEqual(80);
    expect(day.rhPct).toBeGreaterThanOrEqual(0);
    expect(day.rhPct).toBeLessThanOrEqual(100);
  });

  it('holds a sealed tent near its setpoints across an outdoor temperature shift when powered', () => {
    const tent = makeEnvironment(1, { archetype: 'grow-tent' }, 'env:1:1');
    const equipment = { ...noGear, heatingKw: 3, coolingKw: 3 };
    const cold = environmentDay(tent, outdoor({ tMinC: -8, tMaxC: 35 }), equipment);
    const warmer = environmentDay(tent, outdoor({ tMinC: -1, tMaxC: 42 }), equipment);

    expect(Math.abs(cold.tMinC - warmer.tMinC)).toBeLessThan(3);
    expect(Math.abs(cold.tMaxC - warmer.tMaxC)).toBeLessThan(3);
    expect(cold.rainMm).toBe(0);
  });

  it('calculates natural and installed-light DLI and caps it at the archetype limit', () => {
    const greenhouse = makeEnvironment(1, { archetype: 'greenhouse-glass' }, 'env:1:1');
    const tent = makeEnvironment(1, { archetype: 'grow-tent' }, 'env:1:2');
    const glassDli = environmentDay(
      greenhouse,
      outdoor({ dliNaturalMol: 30 }),
      noGear,
    ).dliMol;
    const litTent = environmentDay(
      tent,
      outdoor({ dliNaturalMol: 30 }),
      { ...noGear, ppfdUmol: 200, lightingW: 40, photoperiodH: 18 },
    );
    const overlitTent = environmentDay(
      tent,
      outdoor(),
      { ...noGear, ppfdUmol: 900, lightingW: 160, photoperiodH: 24 },
    );

    expect(glassDli).toBeCloseTo(21, 6);
    expect(litTent.dliMol).toBeCloseTo(12.96, 6);
    expect(overlitTent.dliMol).toBe(45);
  });

  it('uses an explicit environment photoperiod override for climate and crop DLI', () => {
    const tent = makeEnvironment(1, { archetype: 'grow-tent' }, 'env:1:1');
    const equipment = { ...noGear, ppfdUmol: 200, lightingW: 40, photoperiodH: 18 };
    const shortDay = { ...tent, setpoints: { photoperiodH: 12 } };
    const lightsOff = { ...tent, setpoints: { photoperiodH: 0 } };

    expect(tent.setpoints).toBeUndefined();
    expect(effectivePhotoperiodH(shortDay, equipment.photoperiodH)).toBe(12);
    expect(environmentDay(shortDay, outdoor(), equipment).dliMol).toBeCloseTo(8.64, 6);
    expect(environmentDay(lightsOff, outdoor(), equipment).dliMol).toBe(0);
  });

  it('carries humidity and CO2 deterministically and only enriches with explicit gear', () => {
    const tent = makeEnvironment(1, { archetype: 'grow-tent' }, 'env:1:1');
    const previous = { rhPct: 80, co2Ppm: 900 };
    const equipment = { ...noGear, co2TargetPpm: 1000, co2KgDay: 2 };
    const first = environmentDay(tent, outdoor({ tMinC: 20, tMaxC: 20, precipMm: 0 }), equipment, previous);
    const second = environmentDay(tent, outdoor({ tMinC: 20, tMaxC: 20, precipMm: 0 }), equipment, previous);
    const noCo2 = environmentDay(tent, outdoor(), noGear, previous);
    const undersizedCo2 = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, precipMm: 0 }),
      { ...noGear, co2TargetPpm: 1000, co2KgDay: 0.01 },
      previous,
    );
    const baselineHumidity = environmentDay(tent, outdoor(), noGear, previous);
    const dehumidified = environmentDay(tent, outdoor(), { ...noGear, dehumLpd: 0.05 }, previous);
    const co2Environment = {
      ...tent,
      setpoints: { ...tent.setpoints, co2Ppm: 1200 },
    };
    const co2Setpoint = environmentDay(
      co2Environment,
      outdoor({ tMinC: 20, tMaxC: 20, precipMm: 0 }),
      equipment,
      previous,
    );
    const co2SetpointWithoutTank = environmentDay(
      co2Environment,
      outdoor({ tMinC: 20, tMaxC: 20, precipMm: 0 }),
      noGear,
      previous,
    );

    expect(first).toEqual(second);
    expect(first.co2Ppm).toBeCloseTo(1000, 5);
    expect(co2Setpoint.co2Ppm).toBeCloseTo(1200, 5);
    expect(co2SetpointWithoutTank.co2Ppm).toBeLessThan(1200);
    expect(first.co2Ppm).toBeGreaterThan(noCo2.co2Ppm);
    expect(noCo2.co2Ppm).toBeLessThan(previous.co2Ppm);
    expect(undersizedCo2.co2Ppm).toBeGreaterThan(noCo2.co2Ppm);
    expect(undersizedCo2.co2Ppm).toBeLessThan(1000);
    expect(dehumidified.rhPct).toBeLessThan(baselineHumidity.rhPct);
    expect(first.vpdKPa).toBeGreaterThanOrEqual(0);
    expect(first.ach).toBeGreaterThan(0);
  });

  it('uses hourly ACH as a daily mixed-air exchange and carries humidity mass across temperature changes', () => {
    const warehouse = makeEnvironment(1, { archetype: 'warehouse-vertical' }, 'env:1:1');
    const previous = { rhPct: 80, co2Ppm: 1200, tMinC: 20, tMaxC: 20 };
    const warmOutdoor = outdoor({ tMinC: 40, tMaxC: 40, rhPct: 0, co2Ppm: 420, precipMm: 0 });
    const warmDay = environmentDay(warehouse, warmOutdoor, noGear, previous);
    const leak = 1 - Math.exp(-warmDay.ach * 24);
    const previousAbs = absoluteHumidityGm3(20, 80);
    const outdoorAbs = absoluteHumidityGm3(40, 0);
    const mixedAbs = previousAbs + (outdoorAbs - previousAbs) * leak;
    const saturation = absoluteHumidityGm3((warmDay.tMinC + warmDay.tMaxC) / 2, 100);

    expect(warmDay.co2Ppm).toBeCloseTo(420 + (1200 - 420) * (1 - leak), 6);
    expect(warmDay.rhPct).toBeCloseTo(Math.min(mixedAbs, saturation) / saturation * 100, 6);
    expect(warmDay.rhPct).toBeLessThan(5);

    const nextOutdoor = outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, co2Ppm: 420, precipMm: 0 });
    const nextDay = environmentDay(warehouse, nextOutdoor, noGear, warmDay);
    const nextLeak = 1 - Math.exp(-nextDay.ach * 24);
    const nextPreviousAbs = absoluteHumidityGm3((warmDay.tMinC + warmDay.tMaxC) / 2, warmDay.rhPct);
    const nextMixedAbs = nextPreviousAbs * (1 - nextLeak);
    const nextSaturation = absoluteHumidityGm3((nextDay.tMinC + nextDay.tMaxC) / 2, 100);
    expect(nextDay.rhPct).toBeCloseTo(Math.min(nextMixedAbs, nextSaturation) / nextSaturation * 100, 6);
  });

  it('removes newly transpired moisture continuously at higher ACH', () => {
    const greenhouse = makeEnvironment(1, { archetype: 'greenhouse-glass' }, 'env:1:1');
    const lowVentOutdoor = outdoor({ tMinC: 20, tMaxC: 24, rhPct: 0, precipMm: 0 });
    const highVentOutdoor = outdoor({ tMinC: 34, tMaxC: 36, rhPct: 0, precipMm: 0 });
    const lowVent = environmentDay(greenhouse, lowVentOutdoor, noGear, undefined, { transpirationKgDay: 1 });
    const highVent = environmentDay(greenhouse, highVentOutdoor, noGear, undefined, { transpirationKgDay: 1 });
    const volumeM3 = greenhouse.widthM * greenhouse.heightM * greenhouse.layout!.usableHeightM!;
    const expectedHumidity = (day: EnvironmentClimateDay, weather: OutdoorClimateDay) => {
      const outdoorAh = absoluteHumidityGm3((weather.tMinC + weather.tMaxC) / 2, weather.rhPct ?? 60);
      const exchangePerDay = day.ach * 24;
      const sourceRetention = (1 - Math.exp(-exchangePerDay)) / exchangePerDay;
      const indoorAh = outdoorAh + 1000 / volumeM3 * sourceRetention;
      const saturationAh = absoluteHumidityGm3((day.tMinC + day.tMaxC) / 2, 100);
      return Math.min(indoorAh, saturationAh) / saturationAh * 100;
    };

    expect(highVent.ach).toBeGreaterThan(lowVent.ach);
    expect(lowVent.rhPct).toBeCloseTo(expectedHumidity(lowVent, lowVentOutdoor), 6);
    expect(highVent.rhPct).toBeCloseTo(expectedHumidity(highVent, highVentOutdoor), 6);
    expect(highVent.rhPct).toBeLessThan(lowVent.rhPct);
  });

  it('condenses supersaturated vapour and applies the installed dehumidifier RH curve', () => {
    const tent = makeEnvironment(1, { archetype: 'grow-tent' }, 'env:1:1');
    const humidDay = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      noGear,
      undefined,
      { transpirationKgDay: 0.5 },
    );
    const baseline = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      noGear,
      undefined,
      { transpirationKgDay: 0.5 },
    );
    const derated = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      { ...noGear, dehumLpd: 0.02, dehumDerateBelowRh: 70 },
      undefined,
      { transpirationKgDay: 0.5 },
    );
    const unrestricted = environmentDay(
      { ...tent, setpoints: { ...tent.setpoints, rhMaxPct: 60 } },
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      { ...noGear, dehumLpd: 0.02, dehumDerateBelowRh: 50 },
      undefined,
      { transpirationKgDay: 0.5 },
    );
    const saturated = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      noGear,
      undefined,
      { transpirationKgDay: 1 },
    );
    const afterCondensation = environmentDay(
      tent,
      outdoor({ tMinC: 20, tMaxC: 20, rhPct: 0, precipMm: 0 }),
      noGear,
      saturated,
    );

    expect(humidDay.rhPct).toBeGreaterThan(70);
    expect(derated.rhPct).toBeLessThan(baseline.rhPct);
    expect(unrestricted.rhPct).toBeLessThan(derated.rhPct);
    expect(saturated.rhPct).toBe(100);
    expect(afterCondensation.rhPct).toBeLessThan(20);
  });
});
