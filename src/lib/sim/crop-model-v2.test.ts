import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import rootReferenceCoverageRecord from '../../../quality/beta/evidence/fao56-root-reference-coverage.json';
import waterSaParameterReferences from '../../../quality/beta/evidence/water-sa-2018-vegetable-parameter-references.json';
import {
  dailyDryMatterProduction,
  dailyThermalUnits,
  effectiveRootDepthCmAtThermalTime,
  fao56AdjustedDepletionFraction,
  fractionalParInterceptionFromLai,
  stepFao56RootZone,
  thermalDevelopmentRange,
  type RootZoneState,
} from './crop-model-v2';

const rootReferenceCoverage = rootReferenceCoverageRecord as {
  catalogCoverage: Array<{
    cropId: number;
    cropSlug: string;
    status: string;
    maximumEffectiveRootDepthRangeM?: [number, number];
    depletionFractionAtEtc5MmDay?: number;
  }>;
  sourceArithmeticFixture: {
    inputs: {
      soil: {
        fieldCapacityM3PerM3: number;
        wiltingPointM3PerM3: number;
        availableWaterMmPerCm: number;
      };
      soilQualification: string;
      rootDepthM: number;
      totalAvailableWaterMm: number;
      tableDepletionFractionP: number;
      initialDepletionMm: number;
      referenceEvapotranspirationMmDay: number;
      cropCoefficient: number;
      potentialCropEvapotranspirationMmDay: number;
      dailyFluxes: {
        precipitationMm: number;
        irrigationMm: number;
        capillaryRiseMm: number;
        runoffMm: number;
      };
    };
    expectedDisplayedRows: Array<{
      day: number;
      ks: number;
      adjustedEtMmDay: number;
      endDepletionMm: number;
    }>;
    tolerances: {
      endDepletionMm: { maximumDeviation: number; unit: string };
      ks: { maximumDeviation: number; unit: string };
      adjustedEtMmDay: { maximumDeviation: number; unit: string };
    };
    candidateComparison: boolean;
  };
};

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

  it('applies the frozen lettuce root-depth trajectory with its source-specific cap', () => {
    const params = {
      initialRootDepthCm: 12,
      growthStartsAfterCdays: 200,
      growthMmPerCday: 1.2,
      maximumRootDepthCm: 90,
    };

    expect(effectiveRootDepthCmAtThermalTime(0, params)).toBe(12);
    expect(effectiveRootDepthCmAtThermalTime(200, params)).toBe(12);
    expect(effectiveRootDepthCmAtThermalTime(300, params)).toBe(24);
    expect(effectiveRootDepthCmAtThermalTime(1000, params)).toBe(90);
  });

  it('adjusts FAO-56 depletion fraction around ETc of 5 mm/day', () => {
    expect(fao56AdjustedDepletionFraction(0.4, 2)).toBeCloseTo(0.52, 12);
    expect(fao56AdjustedDepletionFraction(0.4, 5)).toBe(0.4);
    expect(fao56AdjustedDepletionFraction(0.4, 6)).toBeCloseTo(0.36, 12);
    expect(fao56AdjustedDepletionFraction(0.4, 10)).toBeCloseTo(0.2, 12);
    expect(fao56AdjustedDepletionFraction(0.4, 30)).toBe(0.1);
  });

  it('reproduces FAO-56 Example 37 displayed root-zone arithmetic with its fixed p', () => {
    const fixture = rootReferenceCoverage.sourceArithmeticFixture;
    const { inputs, expectedDisplayedRows, tolerances } = fixture;
    const depthCm = inputs.rootDepthM * 100;
    const { fieldCapacityM3PerM3, wiltingPointM3PerM3, availableWaterMmPerCm } = inputs.soil;
    expect(availableWaterMmPerCm).toBeCloseTo((fieldCapacityM3PerM3 - wiltingPointM3PerM3) * 10, 12);
    expect(inputs.soil.availableWaterMmPerCm * depthCm).toBe(inputs.totalAvailableWaterMm);
    expect(inputs.referenceEvapotranspirationMmDay * inputs.cropCoefficient)
      .toBe(inputs.potentialCropEvapotranspirationMmDay);
    expect(inputs.soil.wiltingPointM3PerM3).toBe(0.12);
    expect(inputs.soilQualification).toContain('Do not substitute the generic Table 19 silt wilting point 0.15');
    expect(fixture.candidateComparison).toBe(false);
    expect(Object.values(inputs.dailyFluxes)).toEqual([0, 0, 0, 0]);

    const params = {
      awcMmPerCm: inputs.soil.availableWaterMmPerCm,
      effectiveRootDepthCm: depthCm,
      depletionFraction: inputs.tableDepletionFractionP,
    };
    let state: RootZoneState = { waterMm: inputs.totalAvailableWaterMm - inputs.initialDepletionMm };
    for (const expected of expectedDisplayedRows) {
      const result = stepFao56RootZone(state, params, {
        precipMm: inputs.dailyFluxes.precipitationMm,
        irrigationMm: inputs.dailyFluxes.irrigationMm,
        capillaryRiseMm: inputs.dailyFluxes.capillaryRiseMm,
        runoffMm: inputs.dailyFluxes.runoffMm,
        potentialTranspirationMm: inputs.potentialCropEvapotranspirationMmDay,
      });
      const endDepletionMm = result.capacityMm - result.state.waterMm;
      expect(Math.abs(result.stressCoefficient - expected.ks), `day ${expected.day} Ks`)
        .toBeLessThanOrEqual(tolerances.ks.maximumDeviation);
      expect(Math.abs(result.actualTranspirationMm - expected.adjustedEtMmDay), `day ${expected.day} adjusted ET`)
        .toBeLessThanOrEqual(tolerances.adjustedEtMmDay.maximumDeviation);
      expect(Math.abs(endDepletionMm - expected.endDepletionMm), `day ${expected.day} depletion`)
        .toBeLessThanOrEqual(tolerances.endDepletionMm.maximumDeviation);
      expect(result.deepDrainageMm).toBe(0);
      expect(Math.abs(result.residualMm)).toBeLessThanOrEqual(1e-6);
      state = result.state;
    }
    expect(state.residualAccumulatedMm).toBeCloseTo(0, 12);
  });

  it('covers every built-in catalog crop with a Table 22 reference or explicit unresolved status', () => {
    const entries = rootReferenceCoverage.catalogCoverage;
    expect(entries.map((entry) => entry.cropId).sort((a, b) => a - b))
      .toEqual(cropLibrary.map((crop) => crop.id).sort((a, b) => a - b));
    expect(new Set(entries.map((entry) => entry.cropSlug)).size).toBe(cropLibrary.length);
    expect(entries.filter((entry) => entry.status === 'reference-only')).toHaveLength(19);
    expect(entries.filter((entry) => entry.status === 'unverified-no-direct-match')).toHaveLength(31);
    for (const entry of entries.filter((candidate) => candidate.status === 'reference-only')) {
      expect(entry.maximumEffectiveRootDepthRangeM).toHaveLength(2);
      expect(entry.maximumEffectiveRootDepthRangeM![0]).toBeGreaterThan(0);
      expect(entry.maximumEffectiveRootDepthRangeM![1]).toBeGreaterThanOrEqual(entry.maximumEffectiveRootDepthRangeM![0]);
      expect(entry.depletionFractionAtEtc5MmDay).toBeGreaterThan(0);
      expect(entry.depletionFractionAtEtc5MmDay).toBeLessThanOrEqual(1);
    }
  });

  it('reproduces the preregistered synthetic LAI-to-PAR interception equation', () => {
    const fixture = waterSaParameterReferences.preregisteredSyntheticCanopyEquationFixture;
    const fractions = fixture.inputs.laiValues.map((lai) =>
      fractionalParInterceptionFromLai(lai, fixture.inputs.kpar));

    expect(fixture.candidateComparison).toBe(false);
    expect(fractions[0]).toBe(0);
    for (let index = 0; index < fractions.length; index += 1) {
      expect(Math.abs(fractions[index]! - fixture.expectedFractions[index]!))
        .toBeLessThanOrEqual(fixture.tolerance.maximumDeviation);
      expect(fractions[index]).toBeGreaterThanOrEqual(0);
      expect(fractions[index]).toBeLessThan(1);
      if (index > 0) expect(fractions[index]).toBeGreaterThan(fractions[index - 1]!);
    }
  });

  it('accounts for explicitly assumed storage entering as the root front expands', () => {
    const previousStorageMm = 1.5 * 12 * 0.7;
    const rootGrowthStorageMm = 1.5 * (13.2 - 12) * 0.7;
    const result = stepFao56RootZone(
      { waterMm: previousStorageMm },
      { awcMmPerCm: 1.5, effectiveRootDepthCm: 13.2, depletionFraction: 0.5 },
      {
        precipMm: 0,
        irrigationMm: 0,
        rootGrowthStorageMm,
        potentialTranspirationMm: 0,
      },
    );

    expect(result.rootGrowthStorageMm).toBeCloseTo(1.26, 12);
    expect(result.capacityMm).toBeCloseTo(19.8, 12);
    expect(result.state.waterMm).toBeCloseTo(previousStorageMm + rootGrowthStorageMm, 12);
    expect(result.residualMm).toBeCloseTo(0, 12);
  });
});
