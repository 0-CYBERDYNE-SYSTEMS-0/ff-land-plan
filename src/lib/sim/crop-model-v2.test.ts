import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import a02TomatoThermalFixture from '../../../quality/beta/evidence/a02-tomato-thermal-location-window-synthetic.json';
import rootReferenceCoverageRecord from '../../../quality/beta/evidence/fao56-root-reference-coverage.json';
import waterSaParameterReferences from '../../../quality/beta/evidence/water-sa-2018-vegetable-parameter-references.json';
import {
  dailyDryMatterProduction,
  dailyThermalUnits,
  effectiveRootDepthCmAtThermalTime,
  fao56AdjustedDepletionFraction,
  fractionalParInterceptionFromLai,
  leafAreaIndexFromCanopyDryMatter,
  stepFao56RootZone,
  thermalDevelopmentRange,
  type RootZoneState,
} from './crop-model-v2';
import type { DailyEnvironment, FrozenCropModelParametersV2, RunConfig, SimState } from './types';
import { freezeRunModelInputsV2 } from './model-inputs';
import { createRun, simulateRun, stepDay } from './engine';

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

const a02SourceEvidence = a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.evidence;
const a02RootEvidence = a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.evidence;
const a02Thermal: NonNullable<FrozenCropModelParametersV2['thermal']> = {
  tBaseC: a02TomatoThermalFixture.frozenThermalParameters.tBaseC,
  tUpperC: a02TomatoThermalFixture.frozenThermalParameters.tUpperC,
  gddToMaturityCdays: [...a02TomatoThermalFixture.frozenThermalParameters.gddToMaturityCdays] as [number, number],
  startEvents: ['transplanting'],
  accumulationStart: a02TomatoThermalFixture.frozenThermalParameters.accumulationStart,
  maturityEndpoint: a02TomatoThermalFixture.frozenThermalParameters.maturityEndpoint,
  accumulationMethod: a02TomatoThermalFixture.frozenThermalParameters.accumulationMethod,
  sourceCitation: a02TomatoThermalFixture.source.citation,
  sourceUrl: a02TomatoThermalFixture.source.url,
};

const a02SyntheticCropParameters: FrozenCropModelParametersV2 = {
  cropId: a02TomatoThermalFixture.syntheticReducerInputs.cropParameterAssembly.cropId,
  thermal: a02Thermal,
  production: {
    equationFamily: 'LINTUL-net-RUE',
    rueGPerMjInterceptedPar: a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.rueGPerMjInterceptedPar,
    initialDryMatterGPerM2: a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.initialDryMatterGPerM2,
    interceptedParFraction: a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.interceptedParFraction,
    harvestIndex: a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.harvestIndex,
    status: 'qualified',
    missing: [],
    limitations: a02TomatoThermalFixture.syntheticReducerInputs.productionParameters.limitations,
    evidence: a02SourceEvidence,
  },
  rootZone: {
    method: 'FAO-56',
    effectiveRootDepthCm: a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.effectiveRootDepthCm,
    depletionFraction: a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.depletionFraction,
    cropCoefficient: a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.cropCoefficient,
    initialStorageFraction: a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.initialStorageFraction,
    status: 'qualified',
    missing: [],
    limitations: a02TomatoThermalFixture.syntheticReducerInputs.rootZoneParameters.limitations,
    evidence: a02RootEvidence,
  },
  lifecycle: 'plant',
};

function a02BaseConfig(): RunConfig {
  const { basePlan, runConfig } = a02TomatoThermalFixture.syntheticReducerInputs;
  return {
    farmId: runConfig.farmId,
    basePlan: { ...basePlan, updatedAt: runConfig.startDate },
    cropModelVersion: 'crop-model-v2',
    startDate: runConfig.startDate,
    dayCount: a02TomatoThermalFixture.samePrefixHorizonControl.longHorizonDays,
    seed: runConfig.seed,
    scenario: 'baseline',
    tempDeltaC: runConfig.tempDeltaC,
    precipMultiplier: runConfig.precipMultiplier,
    interventions: [],
    autoHarvest: false,
    cropStartEvents: { ...runConfig.cropStartEvents } as NonNullable<RunConfig['cropStartEvents']>,
  };
}

function a02WeatherDays(
  startDate: string,
  days: number,
  tMinC: number,
  tMaxC: number,
): DailyEnvironment[] {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const common = a02TomatoThermalFixture.syntheticReducerInputs.commonDailyFields;
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    tMinC,
    tMaxC,
    precipMm: common.precipMm,
    etoMm: common.etoMm,
    dliNaturalMol: common.dliNaturalMol,
    gddBase10C: common.gddBase10C,
    provenance: {
      tMinC: 'default' as const,
      tMaxC: 'default' as const,
      precipMm: 'default' as const,
      etoMm: 'default' as const,
      dliNaturalMol: 'default' as const,
    },
  }));
}

function a02Checkpoints(config: RunConfig, days: DailyEnvironment[]): { day5: SimState; final: SimState } {
  let state = createRun(config);
  let day5: SimState | undefined;
  for (const day of days.slice(0, config.dayCount)) {
    state = stepDay(state, day, config).state;
    if (state.dayIndex === 5) day5 = state;
  }
  return { day5: day5!, final: state };
}

function expectA02ThermalState(
  state: SimState,
  expectedGddAccumC: number,
  expectedBiomassFrac: number,
): void {
  const cell = state.cells['0,0']!;
  expect(Math.abs(cell.gddAccumC - expectedGddAccumC))
    .toBeLessThanOrEqual(a02TomatoThermalFixture.tolerances.gddAccumC.maximumAbsoluteDeviation);
  expect(Math.abs(cell.biomassFrac - expectedBiomassFrac))
    .toBeLessThanOrEqual(a02TomatoThermalFixture.tolerances.biomassFrac.maximumAbsoluteDeviation);
}

function expectA02ThermalStatesEqual(first: SimState, second: SimState): void {
  const secondCell = second.cells['0,0']!;
  expectA02ThermalState(first, secondCell.gddAccumC, secondCell.biomassFrac);
}

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

  it('reproduces the preregistered source canopy dry-matter-to-LAI and FI_PAR equations', () => {
    const fixture = waterSaParameterReferences.preregisteredSyntheticCanopyDryMassFixture;
    const { sourceParameterSet: parameters } = fixture;
    const table6Parameters = waterSaParameterReferences.table6SelectedSwbParameterSets.find((parameter) =>
      parameter.crop === 'broccoli' && parameter.cultivar === 'Parthenon' && parameter.season === 'winter');
    const table5Measurement = waterSaParameterReferences.table5MeasuredParameterReferences.find((parameter) =>
      parameter.crop === 'broccoli' && parameter.cultivar === 'Parthenon' && parameter.season === 'winter-2008');
    expect(table6Parameters).toBeDefined();
    expect(table5Measurement).toBeDefined();
    expect(parameters.canopyExtinctionParKpar).toBe(table6Parameters!.canopyExtinctionParKpar);
    expect(parameters.specificLeafAreaM2PerKg).toBe(table6Parameters!.specificLeafAreaM2PerKg);
    expect(parameters.leafStemPartitionParameterM2PerKg).toBe(table6Parameters!.leafStemPartitionParameterM2PerKg);
    expect(fixture.sourceTableDiscrepancy.winter2008.table5MeasuredParthenonKpar).toBe(table5Measurement!.kpar);
    expect(fixture.sourceTableDiscrepancy.disposition).toContain('no biological attribution');
    expect(fixture.sourceTableDiscrepancy.winter2008.table5MeasuredParthenonKpar)
      .not.toBe(fixture.sourceTableDiscrepancy.winter2008.table6SelectedBroccoliWinterKpar);
    const leafAreaIndices = fixture.syntheticCanopyDryMatterKgPerM2.map((canopyDm) =>
      leafAreaIndexFromCanopyDryMatter(
        canopyDm,
        parameters.specificLeafAreaM2PerKg,
        parameters.leafStemPartitionParameterM2PerKg,
      ));
    const fractions = leafAreaIndices.map((lai) =>
      fractionalParInterceptionFromLai(lai, parameters.canopyExtinctionParKpar));

    expect(fixture.candidateComparison).toBe(false);
    for (let index = 0; index < leafAreaIndices.length; index += 1) {
      expect(Math.abs(leafAreaIndices[index]! - fixture.expectedLaiM2PerM2[index]!))
        .toBeLessThanOrEqual(fixture.tolerance.maximumAbsoluteDeviation);
      expect(Math.abs(fractions[index]! - fixture.expectedFractions[index]!))
        .toBeLessThanOrEqual(fixture.tolerance.maximumAbsoluteDeviation);
    }
    expect(leafAreaIndices[0]).toBe(0);
    expect(fractions[0]).toBe(0);
    expect(leafAreaIndices[1]).toBeLessThan(leafAreaIndices[2]!);
    expect(leafAreaIndices[2]).toBeLessThan(leafAreaIndices[3]!);
    expect(fractions[1]).toBeLessThan(fractions[2]!);
    expect(fractions[2]).toBeLessThan(fractions[3]!);
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

  it('runs frozen tomato thermal state across synthetic locations and horizons', () => {
    const baseConfig = a02BaseConfig();
    const tomato = cropLibrary.find((crop) => crop.id === a02TomatoThermalFixture.crop.catalogCropId)!;
    const modelInputs = freezeRunModelInputsV2(baseConfig, {
      soil: {
        awcMmPerCm: a02TomatoThermalFixture.syntheticReducerInputs.soil.awcMmPerCm,
        organicMatterPct: a02TomatoThermalFixture.syntheticReducerInputs.soil.organicMatterPct,
      },
      crops: [tomato],
      cropParametersV2: [a02SyntheticCropParameters],
    });
    const targetRange = a02TomatoThermalFixture.frozenThermalParameters.gddToMaturityCdays;

    expect(modelInputs.qualification.status)
      .toBe(a02TomatoThermalFixture.syntheticReducerInputs.cropParameterAssembly.qualificationAfterFreeze.expectedStatus);
    expect(modelInputs.cropParameters[0]?.thermal?.gddToMaturityCdays).toEqual(targetRange);

    for (const weatherCase of a02TomatoThermalFixture.weatherCases) {
      const days = a02WeatherDays(
        baseConfig.startDate,
        weatherCase.days,
        weatherCase.dailyTMinC,
        weatherCase.dailyTMaxC,
      );
      const shortConfig: RunConfig = { ...baseConfig, dayCount: 5, modelInputs };
      const longConfig: RunConfig = { ...baseConfig, dayCount: weatherCase.days, modelInputs };
      expect({ ...longConfig, dayCount: shortConfig.dayCount }).toEqual(shortConfig);
      expect(shortConfig.modelInputs).toBe(longConfig.modelInputs);
      expect(shortConfig.modelInputs?.model).toBe('run-inputs-v2');
      expect(shortConfig.modelInputs?.model === 'run-inputs-v2'
        ? shortConfig.modelInputs.cropParameters[0]?.thermal?.gddToMaturityCdays
        : undefined).toEqual([1024, 1117]);

      const shortRun = a02Checkpoints(shortConfig, days);
      const longRun = a02Checkpoints(longConfig, days);
      expectA02ThermalState(
        shortRun.day5,
        weatherCase.expectedGddAccumCAfter5Days,
        weatherCase.expectedBiomassFracAfter5Days,
      );
      expectA02ThermalState(
        longRun.day5,
        weatherCase.expectedGddAccumCAfter5Days,
        weatherCase.expectedBiomassFracAfter5Days,
      );
      expectA02ThermalStatesEqual(shortRun.day5, longRun.day5);
      expectA02ThermalState(
        longRun.final,
        weatherCase.expectedGddAccumCAfter10Days,
        weatherCase.expectedBiomassFracAfter10Days,
      );
    }

    const control = a02TomatoThermalFixture.meanDailyGddCIndependenceControl;
    const warmCase = a02TomatoThermalFixture.weatherCases.find((weatherCase) =>
      weatherCase.locationTag === control.locationTag && weatherCase.windowTag === control.windowTag)!;
    const warmDays = a02WeatherDays(baseConfig.startDate, control.horizonDays, warmCase.dailyTMinC, warmCase.dailyTMaxC);
    const meanDailyGddZero: RunConfig = {
      ...baseConfig,
      dayCount: control.horizonDays,
      modelInputs,
      meanDailyGddC: control.pairedConfigs[0]!.meanDailyGddC,
    };
    const meanDailyGddFourteen: RunConfig = {
      ...meanDailyGddZero,
      meanDailyGddC: control.pairedConfigs[1]!.meanDailyGddC,
    };
    expect({ ...meanDailyGddFourteen, meanDailyGddC: meanDailyGddZero.meanDailyGddC })
      .toEqual(meanDailyGddZero);
    expect(meanDailyGddZero.modelInputs).toBe(meanDailyGddFourteen.modelInputs);
    expect(meanDailyGddZero.modelInputs?.model === 'run-inputs-v2'
      ? meanDailyGddZero.modelInputs.cropParameters[0]?.thermal?.gddToMaturityCdays
      : undefined).toEqual(control.expectedBoth.targetRangeCdays);

    const zeroRun = a02Checkpoints(meanDailyGddZero, warmDays);
    const fourteenRun = a02Checkpoints(meanDailyGddFourteen, warmDays);
    expectA02ThermalState(
      zeroRun.day5,
      control.expectedBoth.gddAccumCAfter5Days,
      control.expectedBoth.biomassFracAfter5Days,
    );
    expectA02ThermalState(
      zeroRun.final,
      control.expectedBoth.gddAccumCAfter10Days,
      control.expectedBoth.biomassFracAfter10Days,
    );
    expectA02ThermalState(
      fourteenRun.day5,
      control.expectedBoth.gddAccumCAfter5Days,
      control.expectedBoth.biomassFracAfter5Days,
    );
    expectA02ThermalState(
      fourteenRun.final,
      control.expectedBoth.gddAccumCAfter10Days,
      control.expectedBoth.biomassFracAfter10Days,
    );
    expectA02ThermalStatesEqual(zeroRun.day5, fourteenRun.day5);
    expectA02ThermalStatesEqual(zeroRun.final, fourteenRun.final);
  });

  it('replays a complete frozen v2 run deterministically with finite output', () => {
    const baseConfig = a02BaseConfig();
    const tomato = cropLibrary.find((crop) => crop.id === a02TomatoThermalFixture.crop.catalogCropId)!;
    const modelInputs = freezeRunModelInputsV2(baseConfig, {
      soil: {
        awcMmPerCm: a02TomatoThermalFixture.syntheticReducerInputs.soil.awcMmPerCm,
        organicMatterPct: a02TomatoThermalFixture.syntheticReducerInputs.soil.organicMatterPct,
      },
      crops: [tomato],
      cropParametersV2: [a02SyntheticCropParameters],
    });
    const weatherCase = a02TomatoThermalFixture.weatherCases[0]!;
    const config: RunConfig = { ...baseConfig, dayCount: weatherCase.days, modelInputs };
    const weather = a02WeatherDays(
      config.startDate,
      weatherCase.days,
      weatherCase.dailyTMinC,
      weatherCase.dailyTMaxC,
    );

    expect(config.cropModelVersion).toBe('crop-model-v2');
    expect(config.modelInputs?.model).toBe('run-inputs-v2');

    const first = simulateRun(config, weather);
    const replay = simulateRun(config, weather);

    expect(replay.events).toEqual(first.events);
    expect(replay.finalState).toEqual(first.finalState);
    expect(replay.summary).toEqual(first.summary);

    function expectFiniteNumericLeaves(value: unknown, path: string): void {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          expectFiniteNumericLeaves(child, `${path}.${key}`);
        }
      }
    }

    expectFiniteNumericLeaves(first, 'first result');
    expectFiniteNumericLeaves(replay, 'replay result');
  });
});
