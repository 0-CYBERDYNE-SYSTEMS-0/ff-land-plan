import { describe, expect, it } from 'vitest';
import type { EnvironmentSnapshot, Observation } from '@/types';
import { environmentDay, NO_CLIMATE_EQUIPMENT } from './environment-climate';
import { fitFarmCalibration } from './calibration';
import { simulateRun } from './engine';
import type { DailyEnvironment, FarmCalibration, RunConfig } from './types';

const environment: EnvironmentSnapshot = {
  id: 'env:1:hoophouse',
  farmId: 1,
  archetype: 'hoophouse',
  label: 'North tunnel',
  x: 0,
  y: 0,
  widthM: 6,
  heightM: 3,
  cellM: 0.25,
};

const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
  dliNaturalMol: 'default',
} as const;

function envSeries(days = 14): DailyEnvironment[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10);
    const tMinC = 7 + (index % 6) * 2;
    const tMaxC = 17 + (index % 7) * 3;
    return {
      date,
      tMinC,
      tMaxC,
      precipMm: 0,
      etoMm: 1,
      dliNaturalMol: 15 + (index % 8) * 2,
      gddBase10C: Math.max(0, (tMinC + tMaxC) / 2 - 10),
      provenance: PROVENANCE,
    };
  });
}

function dliObservations(days: DailyEnvironment[], coverTransmission: number): Observation[] {
  return days.map((day, index) => ({
    id: `dli-${index}`,
    farmId: 1,
    environmentId: environment.id,
    metric: 'dliMol',
    value: day.dliNaturalMol! * coverTransmission,
    unit: 'mol/m²/day',
    date: day.date,
    source: 'sensor',
  }));
}

describe('farm calibration', () => {
  it('recovers cover transmission from 14 paired, distinct DLI days', () => {
    const days = envSeries();
    const result = fitFarmCalibration({
      farmId: 1,
      environment,
      envSeries: days,
      observations: dliObservations(days, 0.78),
    });

    expect(result.status).toBe('fitted');
    if (result.status !== 'fitted') return;
    expect(result.pairedDays).toBe(14);
    expect(result.proposal.calibration.parameters.coverTransmission).toBe(0.78);
    expect(result.proposal.changes).toEqual([
      { parameter: 'coverTransmission', from: 0.85, to: 0.78 },
    ]);
  });

  it('requires 14 paired days and counts distinct dates rather than sensor rows', () => {
    const days = envSeries(13);
    const result = fitFarmCalibration({
      farmId: 1,
      environment,
      envSeries: days,
      observations: dliObservations(days, 0.78),
    });
    expect(result).toEqual({ status: 'insufficient-data', pairedDays: 13, minimumPairedDays: 14 });

    const oneDate = envSeries(1);
    const observations = [
      ...dliObservations(oneDate, 0.78),
      { ...dliObservations(oneDate, 0.78)[0]!, id: 'second-sensor' },
    ];
    expect(fitFarmCalibration({ farmId: 1, environment, envSeries: oneDate, observations }).status)
      .toBe('insufficient-data');
  });

  it('fits U only after cover is known and only when the climate model responds to U', () => {
    const days = envSeries();
    const coverTransmission = 0.78;
    const uValueWm2K = 3.2;
    const airTemps: Observation[] = days.map((day, index) => {
      const climate = environmentDay(
        environment,
        { tMinC: day.tMinC, tMaxC: day.tMaxC, precipMm: 0, dliNaturalMol: day.dliNaturalMol },
        NO_CLIMATE_EQUIPMENT,
        undefined,
        { modelOverrides: { coverTransmission, uValueWm2K } },
      );
      return {
        id: `temp-${index}`,
        farmId: 1,
        environmentId: environment.id,
        metric: 'airTempC',
        value: (climate.tMinC + climate.tMaxC) / 2,
        unit: '°C',
        date: day.date,
        source: 'sensor',
      };
    });

    const noCover = fitFarmCalibration({ farmId: 1, environment, envSeries: days, observations: airTemps });
    expect(noCover.status).toBe('not-identifiable');

    const existing: FarmCalibration = {
      version: 'farm-calibration-v1',
      revision: 4,
      farmId: 1,
      environmentId: environment.id,
      fittedAt: '2026-06-14T00:00:00.000Z',
      pairedDays: 14,
      parameters: { coverTransmission },
    };
    const fitted = fitFarmCalibration({
      farmId: 1,
      environment,
      envSeries: days,
      observations: airTemps,
      existing,
    });
    expect(fitted.status).toBe('fitted');
    if (fitted.status !== 'fitted') return;
    expect(fitted.proposal.calibration.revision).toBe(5);
    expect(fitted.proposal.calibration.parameters).toEqual({ coverTransmission, uValueWm2K });
    expect(Object.keys(fitted.proposal.calibration.parameters).sort()).toEqual(['coverTransmission', 'uValueWm2K']);
  });

  it('applies an approved calibration only to its frozen environment in replay', () => {
    const day = envSeries(1)[0]!;
    const baseConfig: RunConfig = {
      farmId: 1,
      basePlan: {
        farmId: 1,
        widthM: 6,
        heightM: 3,
        cellM: 0.25,
        allowOutsideBeds: true,
        planting: {},
        ground: {},
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      environment,
      climateModel: 'environment-v1',
      climateEquipment: { ...NO_CLIMATE_EQUIPMENT },
      startDate: day.date,
      dayCount: 1,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
    };
    const base = simulateRun(baseConfig, [day]).finalState.climate!;
    const calibrated = simulateRun({
      ...baseConfig,
      calibration: {
        version: 'farm-calibration-v1',
        revision: 1,
        farmId: 1,
        environmentId: environment.id,
        fittedAt: '2026-06-01T00:00:00.000Z',
        pairedDays: 14,
        parameters: { coverTransmission: 0.78, uValueWm2K: 3.2 },
      },
    }, [day]).finalState.climate!;
    const wrongWorld = simulateRun({
      ...baseConfig,
      calibration: {
        version: 'farm-calibration-v1',
        revision: 1,
        farmId: 1,
        environmentId: 'env:1:other',
        fittedAt: '2026-06-01T00:00:00.000Z',
        pairedDays: 14,
        parameters: { coverTransmission: 0.78, uValueWm2K: 3.2 },
      },
    }, [day]).finalState.climate!;

    expect(calibrated.dliMol).toBeLessThan(base.dliMol);
    expect(wrongWorld).toEqual(base);
  });
});
