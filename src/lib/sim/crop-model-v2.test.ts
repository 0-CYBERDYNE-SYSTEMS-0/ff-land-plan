import { describe, expect, it } from 'vitest';
import { cropThermalParams } from '@/data/cropThermalParams';
import {
  dailyDryMatterProduction,
  dailyThermalUnits,
  stepFao56RootZone,
  thermalDevelopmentRange,
} from './crop-model-v2';

describe('crop model v2 equation helpers', () => {
  it('produces exactly zero photosynthetic dry matter at known zero usable light', () => {
    expect(dailyDryMatterProduction({
      dliMolParM2: 0,
      interceptedParFraction: null,
      rueGPerMjInterceptedPar: null,
      stressFactor: null,
    })).toEqual({ status: 'supported', interceptedParMjM2: 0, dryMatterGainGM2: 0 });
  });

  it('does not treat unknown light or missing production inputs as sufficient', () => {
    expect(dailyDryMatterProduction({
      dliMolParM2: undefined,
      interceptedParFraction: 0.5,
      rueGPerMjInterceptedPar: 2.2,
      stressFactor: 1,
    })).toMatchObject({ status: 'unsupported' });
    expect(dailyDryMatterProduction({
      dliMolParM2: 18,
      interceptedParFraction: null,
      rueGPerMjInterceptedPar: 2.2,
      stressFactor: 1,
    })).toMatchObject({ status: 'unsupported' });
  });

  it('converts DLI to intercepted PAR and applies net RUE and explicit stress', () => {
    expect(dailyDryMatterProduction({
      dliMolParM2: 18,
      interceptedParFraction: 0.5,
      rueGPerMjInterceptedPar: 2.2,
      stressFactor: 0.75,
    })).toEqual({
      status: 'supported',
      interceptedParMjM2: 2,
      dryMatterGainGM2: 3.3000000000000003,
    });
  });

  it('uses the fixed source thermal target range instead of a run-window mean', () => {
    const tomato = cropThermalParams.find((param) => param.cropSlug === 'tomato')!;
    const coldDay = dailyThermalUnits(8, 14, tomato);
    const warmDay = dailyThermalUnits(18, 30, tomato);
    expect(coldDay).toBeGreaterThan(0);
    expect(warmDay).toBeGreaterThan(coldDay!);
    expect(thermalDevelopmentRange(500, tomato.gddToMaturityCdays)).toEqual([
      500 / 1117,
      500 / 1024,
    ]);
    expect(tomato.gddToMaturityCdays).toEqual([1024, 1117]);
  });

  it('applies the source upper threshold with the stated single-sine method', () => {
    const tomato = cropThermalParams.find((param) => param.cropSlug === 'tomato')!;
    const belowBase = dailyThermalUnits(-2, 5, tomato);
    const aboveUpper = dailyThermalUnits(36, 40, tomato);
    expect(belowBase).toBe(0);
    expect(aboveUpper).toBeCloseTo(tomato.tUpperC! - tomato.tBaseC, 8);
  });

  it('caps both daily extrema for a max-min upper cutoff', () => {
    const corn = cropThermalParams.find((param) => param.cropSlug === 'corn')!;

    expect(dailyThermalUnits(35, 40, corn)).toBe(20);
  });

  it('closes the water balance with bounded transpiration and accumulated residual', () => {
    const params = { awcMmPerCm: 1.5, effectiveRootDepthCm: 20, depletionFraction: 0.5 };
    const first = stepFao56RootZone(
      { waterMm: 10 },
      params,
      { precipMm: 8, irrigationMm: 5, runoffMm: 1, potentialTranspirationMm: 30 },
    );
    expect(first.actualTranspirationMm).toBeLessThanOrEqual(22);
    expect(first.state.waterMm).toBe(0);
    expect(first.residualMm).toBeLessThanOrEqual(1e-12);
    expect(first.residualMm).toBeGreaterThanOrEqual(-1e-12);
    const second = stepFao56RootZone(
      first.state,
      params,
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 4 },
    );
    expect(second.actualTranspirationMm).toBe(0);
    expect(second.stressCoefficient).toBe(0);
    expect(Math.abs(second.state.residualAccumulatedMm ?? 0)).toBeLessThanOrEqual(1e-6);
  });

  it('applies FAO-56 Ks to potential transpiration before extracting root-zone water', () => {
    const stressed = stepFao56RootZone(
      { waterMm: 4 },
      { awcMmPerCm: 1, effectiveRootDepthCm: 20, depletionFraction: 0.5 },
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 4 },
    );

    expect(stressed.stressCoefficient).toBeCloseTo(0.4, 12);
    expect(stressed.actualTranspirationMm).toBeCloseTo(1.6, 12);
    expect(stressed.state.waterMm).toBeCloseTo(2.4, 12);
    expect(stressed.residualMm).toBeCloseTo(0, 12);
    expect(stressed.state.residualAccumulatedMm).toBeCloseTo(0, 12);
  });

  it('uses the supplied crop root depth and refuses impossible water inputs', () => {
    const shallow = stepFao56RootZone(
      { waterMm: 10 },
      { awcMmPerCm: 1, effectiveRootDepthCm: 10, depletionFraction: 0.5 },
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 20 },
    );
    const deep = stepFao56RootZone(
      { waterMm: 10 },
      { awcMmPerCm: 1, effectiveRootDepthCm: 30, depletionFraction: 0.5 },
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 20 },
    );
    expect(shallow.capacityMm).toBe(10);
    expect(deep.capacityMm).toBe(30);
    expect(shallow.actualTranspirationMm).toBe(10);
    expect(deep.actualTranspirationMm).toBe(10);
    expect(() => stepFao56RootZone(
      { waterMm: 10 },
      { awcMmPerCm: 1, effectiveRootDepthCm: 10, depletionFraction: 0.5 },
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 20 },
    )).not.toThrow();
    expect(() => stepFao56RootZone(
      { waterMm: 11 },
      { awcMmPerCm: 1, effectiveRootDepthCm: 10, depletionFraction: 0.5 },
      { precipMm: 0, irrigationMm: 0, potentialTranspirationMm: 0 },
    )).toThrow(RangeError);
  });
});
