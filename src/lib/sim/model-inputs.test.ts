import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { lettuceRosalbaRUEReference, lettuceYumaRootProfileReference } from '@/data/cropModelV2LettuceReferences';
import { cropThermalParams } from '@/data/cropThermalParams';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { Observation } from '@/types';
import type {
  CropEstablishmentInput,
  FrozenCropModelParametersV2,
  FrozenCropModelParametersV4,
  RunConfig,
  RunModelInputsV2,
  RunRecord,
} from './types';
import {
  freezeEnvironmentModelInputsV2,
  freezeRunModelInputs,
  freezeRunModelInputsV2,
  freezeRunModelInputsV3,
  freezeRunModelInputsV4,
  inspectRunModelSupport,
} from './model-inputs';
import { NO_CLIMATE_EQUIPMENT } from './environment-climate';
import { createRun, simulateRun, stepDay } from './engine';
import { collectRunPredictionPairs } from './scorecard';

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
      updatedAt: '2026-10-01',
    },
    startDate: '2026-10-01',
    dayCount: 7,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    cropStartEvents: { '0,0': 'transplanting' },
    ...overrides,
  };
}

function lettuceSourceParameterFixture(): FrozenCropModelParametersV2 {
  const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
  const thermal = cropThermalParams.find((parameter) => parameter.cropId === lettuce.id)!;
  const rue = lettuceRosalbaRUEReference;
  const root = lettuceYumaRootProfileReference;
  const sourceLimitations = [
    'Synthetic integration fixture composes Michelon Green Wave transplant thermal targets with greenhouse Rosalba production RUE and direct-seeded Yuma iceberg/romaine root parameters; it is not a validated cultivar/environment set.',
    'The Michelon thermal target is used only to satisfy the frozen daily engine contract; it shares a source with the potential holdout record and is not independent holdout evidence.',
    'The source RUE is for above-ground dry matter; the fixed 0.5 PAR interception fraction and 0.5 harvest index are synthetic fixture values.',
    'Initial above-ground dry matter is synthetic zero; no transplant seedling mass, nursery development, or seed reserve is inferred.',
  ];
  return {
    cropId: lettuce.id,
    thermal,
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: rue.value,
      initialDryMatterGPerM2: 0,
      interceptedParFraction: 0.5,
      harvestIndex: 0.5,
      status: 'qualified',
      missing: [],
      limitations: sourceLimitations,
      evidence: {
        evidenceId: rue.evidenceId,
        sourceCitation: rue.sourceCitation,
        sourceUrl: rue.sourceUrl,
        validDomain: rue.validDomain,
      },
    },
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: root.maximumRootDepthCm,
      depletionFraction: root.depletionFractionAtEtc5MmDay,
      cropCoefficient: 1,
      initialStorageFraction: 0.7,
      rootDevelopment: {
        methodVersion: root.methodVersion,
        storageExpansionMethod: root.storageExpansionMethod,
        startEvent: 'direct-sowing',
        initialRootDepthCm: root.initialRootDepthCm,
        growthStartsAfterCdays: root.growthStartsAfterCdays,
        growthMmPerCday: root.growthMmPerCday,
        thermalBaseC: root.thermalBaseC,
        thermalUpperC: root.thermalUpperC,
        thermalAccumulationMethod: root.thermalAccumulationMethod,
        evidence: {
          evidenceId: root.evidenceId,
          sourceCitation: root.sourceCitation,
          sourceUrl: root.sourceUrl,
          validDomain: root.validDomain,
        },
      },
      status: 'qualified',
      missing: [],
      limitations: [
        'This source root profile is for direct-seeded Yuma field lettuce; it does not define transplanted root development.',
        'The 90 cm maximum is a site-specific inferred effective depth, not a measured or generic maximum.',
        'Newly reached soil is initialized at the synthetic 0.7 available-water fraction; root expansion is a single-bucket boundary assumption, not a layered soil profile.',
        'The fixed crop coefficient 1.0 is a synthetic test value, not a stage-specific source coefficient.',
      ],
      evidence: {
        evidenceId: root.evidenceId,
        sourceCitation: root.sourceCitation,
        sourceUrl: root.sourceUrl,
        validDomain: root.validDomain,
      },
    },
    lifecycle: 'plant',
  };
}

function syntheticStartEventParameter(
  cropId: number,
  thermal: NonNullable<FrozenCropModelParametersV2['thermal']>,
): FrozenCropModelParametersV2 {
  const evidence = {
    evidenceId: 'TEST-SYNTHETIC-START-EVENT',
    sourceCitation: 'Synthetic software acceptance fixture; no biological claim',
    sourceUrl: 'test-only:crop-start-event',
    validDomain: 'software acceptance only',
  };
  return {
    cropId,
    thermal,
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: 2,
      initialDryMatterGPerM2: 0,
      interceptedParFraction: 0.5,
      harvestIndex: 0.5,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic production values exercise event timing only.'],
      evidence,
    },
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: 20,
      depletionFraction: 0.5,
      cropCoefficient: 1,
      initialStorageFraction: 0.7,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic static root-zone values exercise event timing only.'],
      evidence,
    },
    lifecycle: 'plant',
  };
}

describe('frozen crop model inputs and replay support', () => {
  it('replays a complete v1 crop snapshot without consulting changed live catalog data', () => {
    const run = config();
    const original = { ...cropLibrary[0]!, name: 'Frozen tomato' };
    const frozen = freezeRunModelInputs(run, {
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [original],
    });
    const support = inspectRunModelSupport({ ...run, modelInputs: frozen });
    expect(support).toMatchObject({ model: 'crop-model-v1', status: 'supported', canReplay: true });
    expect(frozen.crops[0]?.name).toBe('Frozen tomato');
    expect(freezeRunModelInputs(run, {
      crops: [{ ...original, name: 'Changed current catalog' }],
    }, frozen).crops[0]?.name).toBe('Frozen tomato');
  });

  it('marks persisted records without frozen model inputs unsupported and preserves their summary', () => {
    const support = inspectRunModelSupport(config());
    expect(support).toMatchObject({
      model: 'crop-model-v1',
      status: 'unsupported',
      canReplay: false,
      preserveStoredSummary: true,
    });
    expect(support.reasons).toContain('Historical record has no frozen model inputs.');
  });

  it('keeps transient direct v1 calculations compatible without labeling them persisted replay', () => {
    expect(inspectRunModelSupport(config(), false)).toMatchObject({
      model: 'crop-model-v1',
      status: 'qualified',
      canReplay: true,
      preserveStoredSummary: false,
    });
  });

  it('freezes v2 parameters and explicit unsupported reasons for every referenced crop', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const frozen = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [cropLibrary[0]!],
    });
    expect(frozen.model).toBe('run-inputs-v2');
    expect(frozen.parameterSetVersion).toBe('crop-parameters-v3');
    expect(frozen.soil?.source).toBe('unknown');
    expect(frozen.cropParameters).toHaveLength(1);
    expect(frozen.cropParameters[0]).toMatchObject({
      cropId: 1,
      thermal: { cropId: 1, gddToMaturityCdays: [1024, 1117] },
      production: { status: 'unsupported', rueGPerMjInterceptedPar: null },
      rootZone: { status: 'unsupported', effectiveRootDepthCm: null },
    });
    expect(frozen.qualification.status).toBe('unsupported');
    expect(inspectRunModelSupport({ ...run, modelInputs: frozen })).toMatchObject({
      model: 'crop-model-v2',
      status: 'unsupported',
      canReplay: false,
      preserveStoredSummary: true,
    });
  });

  it('requires the versioned start-event inputs to replay crop-model-v2 records', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const current = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [cropLibrary[0]!],
    });
    const legacyParameterSet = {
      ...current,
      parameterSetVersion: 'crop-parameters-v2',
    } as unknown as RunModelInputsV2;

    expect(inspectRunModelSupport({ ...run, modelInputs: legacyParameterSet })).toMatchObject({
      status: 'unsupported',
      canReplay: false,
      preserveStoredSummary: true,
    });
  });

  it('starts direct-sown and transplanted crops on their respective frozen events', () => {
    const bean = cropLibrary.find((crop) => crop.id === 27)!;
    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const beanThermal = cropThermalParams.find((parameter) => parameter.cropId === bean.id)!;
    const tomatoThermal = cropThermalParams.find((parameter) => parameter.cropId === tomato.id)!;
    const daySeries = Array.from({ length: 5 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 4,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    }));
    const directSownRun = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: { ...config().basePlan, planting: { '0,0': bean.id } },
      cropStartEvents: { '0,0': 'direct-sowing' },
    });
    const directSownInputs = freezeRunModelInputsV2(directSownRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [bean],
      cropParametersV2: [syntheticStartEventParameter(bean.id, beanThermal)],
    });
    const transplantRun = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': tomato.id },
        plantedAt: { '0,0': '2026-10-03' },
      },
      cropStartEvents: { '0,0': 'transplanting' },
    });
    const transplantInputs = freezeRunModelInputsV2(transplantRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [syntheticStartEventParameter(tomato.id, tomatoThermal)],
    });
    const directSown = simulateRun({ ...directSownRun, modelInputs: directSownInputs }, daySeries);
    const beforeTransplant = simulateRun({ ...transplantRun, modelInputs: transplantInputs }, daySeries.slice(0, 2));
    const transplanted = simulateRun({ ...transplantRun, modelInputs: transplantInputs }, daySeries);
    const directSownSupport = inspectRunModelSupport({ ...directSownRun, modelInputs: directSownInputs });
    const incompatibleStart = inspectRunModelSupport({
      ...transplantRun,
      cropStartEvents: { '0,0': 'direct-sowing' },
      modelInputs: transplantInputs,
    });
    const missingAsOfStartState = inspectRunModelSupport({
      ...transplantRun,
      basePlan: { ...transplantRun.basePlan, plantedAt: { '0,0': '2026-09-30' } },
      modelInputs: transplantInputs,
    });

    expect(directSown.finalState.cells['0,0']?.startEvent).toBe('direct-sowing');
    expect(directSown.finalState.cells['0,0']?.gddAccumC).toBeGreaterThan(0);
    expect(directSown.finalState.cells['0,0']?.dryMatterGPerM2).toBeGreaterThan(0);
    expect(directSown.summary.waterUseMm).toBeGreaterThan(0);
    expect(directSownSupport.reasons.some((reason) => reason.includes('emergence delay and seed reserves are not modeled'))).toBe(true);
    expect(beforeTransplant.finalState.cells['0,0']?.gddAccumC).toBe(0);
    expect(beforeTransplant.finalState.cells['0,0']?.dryMatterGPerM2).toBe(0);
    expect(transplanted.finalState.cells['0,0']?.startEvent).toBe('transplanting');
    expect(transplanted.finalState.cells['0,0']?.gddAccumC).toBeGreaterThan(0);
    expect(transplanted.finalState.cells['0,0']?.gddAccumC).toBeLessThan(directSown.finalState.cells['0,0']!.gddAccumC);
    expect(incompatibleStart).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
    expect(incompatibleStart.reasons.some((reason) => reason.includes('outside the thermal source start-event domain'))).toBe(true);
    expect(missingAsOfStartState).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
    expect(missingAsOfStartState.reasons.some((reason) => reason.includes('frozen as-of-start crop state'))).toBe(true);
  });

  it('gates v3 crop fluxes until observed emergence and applies per-cell transplant state on its event', () => {
    const bean = cropLibrary.find((crop) => crop.id === 27)!;
    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const beanThermal = cropThermalParams.find((parameter) => parameter.cropId === bean.id)!;
    const tomatoThermal = cropThermalParams.find((parameter) => parameter.cropId === tomato.id)!;
    const evidence = {
      classification: 'synthetic' as const,
      evidenceId: 'TEST-ESTABLISHMENT-EVENT-GATE',
      validDomain: 'synthetic software reducer acceptance only',
    };
    const days = Array.from({ length: 4 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 4,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    }));
    const beanKey = targetCellKey({ kind: 'floor' }, '0,0');
    const beanEstablishment: CropEstablishmentInput = {
      startEvent: 'direct-sowing',
      establishedAtDate: '2026-10-03',
      initialAboveGroundDryMatterGPerM2: 12,
      evidence,
    };
    const beanRun = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': bean.id },
        plantedAt: { '0,0': '2026-10-01' },
      },
      cropStartEvents: { [beanKey]: 'direct-sowing' },
    });
    const beanInputs = freezeRunModelInputsV3(beanRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [bean],
      cropParametersV2: [syntheticStartEventParameter(bean.id, beanThermal)],
      cropEstablishmentByCell: { [beanKey]: beanEstablishment },
    });
    const activeBeanRun = { ...beanRun, modelInputs: beanInputs };
    const beanSupport = inspectRunModelSupport(activeBeanRun);
    let beanState = createRun(activeBeanRun);
    const beforeEmergence = stepDay(beanState, days[0]!, activeBeanRun);
    beanState = beforeEmergence.state;
    const secondPreEmergence = stepDay(beanState, days[1]!, activeBeanRun);
    beanState = secondPreEmergence.state;
    const emergence = stepDay(beanState, days[2]!, activeBeanRun);
    const beanCellBefore = secondPreEmergence.state.cells[beanKey]!;
    const beanCellAfter = emergence.state.cells[beanKey]!;

    const tomatoKey = targetCellKey({ kind: 'floor' }, '0,0');
    const tomatoEstablishment: CropEstablishmentInput = {
      startEvent: 'transplanting',
      establishedAtDate: '2026-10-03',
      initialAboveGroundDryMatterGPerM2: 7,
      evidence,
    };
    const transplantRun = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': tomato.id },
        plantedAt: { '0,0': '2026-10-03' },
      },
      cropStartEvents: { [tomatoKey]: 'transplanting' },
    });
    const transplantInputs = freezeRunModelInputsV3(transplantRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [syntheticStartEventParameter(tomato.id, tomatoThermal)],
      cropEstablishmentByCell: { [tomatoKey]: tomatoEstablishment },
    });
    const activeTransplantRun = { ...transplantRun, modelInputs: transplantInputs };
    const preTransplant = simulateRun(activeTransplantRun, days.slice(0, 2));
    const transplant = simulateRun(activeTransplantRun, days);

    expect(beanSupport).toMatchObject({ model: 'crop-model-v3', status: 'qualified', canReplay: true });
    expect(beanSupport.reasons.some((reason) => reason.includes('start on the sowing date'))).toBe(false);
    expect(beanSupport.reasons).toContain(
      `Crop ${bean.id}: maturity is a source target range; the endpoint uses the conservative upper target.`,
    );
    expect(beanSupport.reasons).toContain(
      'A separate physiology thermal accumulator starts at establishment; intermediate v3 crop-stage mapping has no source support, so stage remains unavailable throughout the run, including at and after the maturity endpoint.',
    );
    expect(beanSupport.reasons).toContain(
      'The 3D crop mesh remains at its smallest juvenile archetype pose throughout the run, including after maturity; it is an illustrative placeholder, not crop growth or a stage estimate.',
    );
    expect(beanCellBefore.gddAccumC).toBe(0);
    expect(beanCellBefore.sourceThermalCdays).toBeGreaterThan(0);
    expect(beanCellBefore.stageEstimateAvailable).toBe(false);
    expect(beanCellBefore.biomassFrac).toBe(0);
    expect(beanCellBefore.dryMatterGPerM2).toBe(0);
    expect(beanCellBefore.rootThermalCdays).toBeUndefined();
    expect(beanCellBefore.stressDaysCount).toBe(0);
    expect(beforeEmergence.dayStats.waterUseMm).toBe(0);
    expect(secondPreEmergence.dayStats.waterUseMm).toBe(0);
    expect(beanCellAfter.establishmentApplied).toBe(true);
    expect(beanCellAfter.gddAccumC).toBeGreaterThan(0);
    expect(beanCellAfter.sourceThermalCdays).toBeGreaterThan(beanCellAfter.gddAccumC);
    expect(beanCellAfter.dryMatterGPerM2).toBeGreaterThan(beanEstablishment.initialAboveGroundDryMatterGPerM2);
    expect(emergence.dayStats.waterUseMm).toBeGreaterThan(0);
    expect(preTransplant.finalState.cells[tomatoKey]?.dryMatterGPerM2).toBe(0);
    expect(preTransplant.finalState.cells[tomatoKey]?.gddAccumC).toBe(0);
    expect(transplant.finalState.cells[tomatoKey]?.establishmentApplied).toBe(true);
    expect(transplant.finalState.cells[tomatoKey]?.dryMatterGPerM2).toBeGreaterThan(7);

    const stageObservation: Observation = {
      id: 'v3-stage-without-map',
      farmId: activeTransplantRun.farmId,
      date: days[0]!.date,
      metric: 'stage',
      value: 1,
      unit: 'fraction',
      source: 'manual',
    };
    const baseline = simulateRun(activeTransplantRun, days);
    const withStageObservation = simulateRun(activeTransplantRun, days, {}, [stageObservation]);
    expect(withStageObservation.finalState.cells[tomatoKey]).toMatchObject({
      biomassFrac: baseline.finalState.cells[tomatoKey]?.biomassFrac,
      gddAccumC: baseline.finalState.cells[tomatoKey]?.gddAccumC,
      sourceThermalCdays: baseline.finalState.cells[tomatoKey]?.sourceThermalCdays,
      readyAtDay: baseline.finalState.cells[tomatoKey]?.readyAtDay,
    });
    expect(withStageObservation.finalState.modelQualificationReasons).toContain(
      'Stage observations are not assimilated for crop-model-v3: no source-supported intermediate-stage mapping exists, and biomassFrac only marks the source maturity endpoint.',
    );
    const stageRecord: RunRecord = {
      id: 'run:v3:stage-observation',
      farmId: activeTransplantRun.farmId,
      label: 'V3 stage observation',
      createdAt: '2026-10-01T00:00:00.000Z',
      config: activeTransplantRun,
      envSeries: days,
      observations: [stageObservation],
      summary: withStageObservation.summary,
      status: 'complete',
    };
    expect(collectRunPredictionPairs(stageRecord)).toEqual([{
      observationId: stageObservation.id,
      metric: 'stage',
      date: stageObservation.date,
      observed: stageObservation.value,
      predicted: null,
    }]);
  });

  it('validates intervention establishment evidence and v3 qualification status', () => {
    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const thermal = cropThermalParams.find((parameter) => parameter.cropId === tomato.id)!;
    const establishment: CropEstablishmentInput = {
      startEvent: 'transplanting',
      establishedAtDate: '2026-10-02',
      initialAboveGroundDryMatterGPerM2: 7,
      evidence: {
        classification: 'synthetic',
        evidenceId: 'TEST-INTERVENTION-ESTABLISHMENT',
        validDomain: 'software acceptance only',
      },
    };
    const plant = {
      kind: 'plant' as const,
      date: '2026-10-02',
      cell: '0,0',
      cropId: tomato.id,
      startEvent: 'transplanting' as const,
      establishment,
    };
    const run = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: { ...config().basePlan, planting: {} },
      cropStartEvents: {},
      interventions: [plant],
    });
    const modelInputs = freezeRunModelInputsV3(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [syntheticStartEventParameter(tomato.id, thermal)],
      cropEstablishmentByCell: {},
    });

    expect(inspectRunModelSupport({ ...run, modelInputs })).toMatchObject({
      status: 'qualified',
      canReplay: true,
    });
    expect(inspectRunModelSupport({ ...run, modelInputs }).reasons)
      .toContain(`Crop ${tomato.id}: synthetic establishment state is a software fixture, not biological evidence.`);

    const invalidEvidencePlant = {
      ...plant,
      establishment: {
        ...establishment,
        evidence: { ...establishment.evidence, classification: 'unknown' },
      },
    } as unknown as RunConfig['interventions'][number];
    const invalidEvidence = inspectRunModelSupport({
      ...run,
      interventions: [invalidEvidencePlant],
      modelInputs,
    });
    expect(invalidEvidence).toMatchObject({ status: 'unsupported', canReplay: false });
    expect(invalidEvidence.reasons.some((reason) => reason.includes('evidence classification is unknown'))).toBe(true);

    const invalidStatusInputs = {
      ...modelInputs,
      qualification: { ...modelInputs.qualification, status: 'pending' },
    } as unknown as typeof modelInputs;
    expect(inspectRunModelSupport({ ...run, modelInputs: invalidStatusInputs }))
      .toMatchObject({ status: 'unsupported', canReplay: false });
  });

  it('keeps v3 sowing-to-maturity thermal time separate from emergence-relative physiology', () => {
    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const sourceThermal = cropThermalParams.find((parameter) => parameter.cropId === tomato.id)!;
    const thermal = {
      ...sourceThermal,
      gddToMaturityCdays: [60, 60] as const,
      startEvents: ['direct-sowing'] as const,
    };
    const parameter = syntheticStartEventParameter(tomato.id, thermal);
    const key = targetCellKey({ kind: 'floor' }, '0,0');
    const run = config({
      cropModelVersion: 'crop-model-v3',
      dayCount: 4,
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': tomato.id },
        plantedAt: { '0,0': '2026-10-01' },
      },
      cropStartEvents: { [key]: 'direct-sowing' },
    });
    const modelInputs = freezeRunModelInputsV3(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [parameter],
      cropEstablishmentByCell: {
        [key]: {
          startEvent: 'direct-sowing',
          establishedAtDate: '2026-10-03',
          initialAboveGroundDryMatterGPerM2: 10,
          evidence: {
            classification: 'synthetic',
            evidenceId: 'TEST-V3-SOURCE-AND-PHYSIOLOGY-CLOCKS',
            validDomain: 'software acceptance only',
          },
        },
      },
    });
    const activeRun = { ...run, modelInputs };
    const series = Array.from({ length: 4 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 4,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    }));
    let state = createRun(activeRun);
    const states = series.map((day) => {
      const result = stepDay(state, day, activeRun);
      state = result.state;
      return result.state.cells[key]!;
    });

    expect(states[1]?.sourceThermalCdays).toBeGreaterThan(0);
    expect(states[1]?.gddAccumC).toBe(0);
    expect(states[1]?.biomassFrac).toBe(0);
    expect(states[1]?.stageEstimateAvailable).toBe(false);
    expect(states[2]?.gddAccumC).toBeGreaterThan(0);
    expect(states[2]?.sourceThermalCdays).toBeGreaterThan(states[2]!.gddAccumC);
    expect(states[2]?.biomassFrac).toBe(0);
    expect(states[2]?.stageEstimateAvailable).toBe(false);
    expect(states[3]?.sourceThermalCdays).toBe(60);
    expect(states[3]?.biomassFrac).toBe(1);
    expect(states[3]?.stageEstimateAvailable).toBe(false);
  });

  it('applies qualified heat response and terminal frost mortality after establishment', () => {
    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const thermal = cropThermalParams.find((parameter) => parameter.cropId === tomato.id)!;
    const key = targetCellKey({ kind: 'floor' }, '0,0');
    const run = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': tomato.id },
        plantedAt: { '0,0': '2026-10-01' },
      },
      cropStartEvents: { [key]: 'transplanting' },
    });
    const modelInputs = freezeRunModelInputsV3(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [syntheticStartEventParameter(tomato.id, thermal)],
      cropEstablishmentByCell: {
        [key]: {
          startEvent: 'transplanting',
          establishedAtDate: '2026-10-01',
          initialAboveGroundDryMatterGPerM2: 10,
          evidence: {
            classification: 'synthetic',
            evidenceId: 'TEST-V3-STRESS-MORTALITY',
            validDomain: 'software acceptance only',
          },
        },
      },
    });
    const activeRun = { ...run, modelInputs };
    const day = (date: string, tMinC: number, tMaxC: number) => ({
      date,
      tMinC,
      tMaxC,
      precipMm: 0,
      etoMm: 4,
      dliNaturalMol: 18,
      gddBase10C: Math.max(0, (tMinC + tMaxC) / 2 - 10),
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    });
    const mildEnv = day('2026-10-01', 20, 25);
    const hotEnv = day('2026-10-01', 20, 37);
    const mild = stepDay(createRun(activeRun), mildEnv, activeRun);
    const hot = stepDay(createRun(activeRun), hotEnv, activeRun);
    const hotCell = hot.state.cells[key]!;

    expect(hotCell.stress.heat).toBeGreaterThan(0);
    expect(hotCell.dryMatterGPerM2).toBeGreaterThan(10);
    expect(hotCell.dryMatterGPerM2).toBeLessThan(mild.state.cells[key]!.dryMatterGPerM2!);

    const warmLivingEnv = day('2026-10-01', 20, 25);
    expect(warmLivingEnv.gddBase10C).toBeGreaterThan(0);
    const living = stepDay(createRun(activeRun), warmLivingEnv, activeRun);
    const frostEnv = day('2026-10-02', -2, 3);
    const frost = stepDay(living.state, frostEnv, activeRun);
    const postDeathWarmEnv = day('2026-10-03', 20, 25);
    expect(postDeathWarmEnv.gddBase10C).toBeGreaterThan(0);
    const afterDeath = stepDay(frost.state, postDeathWarmEnv, activeRun);
    const livingCell = living.state.cells[key]!;
    const frostCell = frost.state.cells[key]!;
    const afterDeathCell = afterDeath.state.cells[key]!;

    expect(livingCell.gddAccumC).toBeGreaterThan(0);
    expect(livingCell.sourceThermalCdays).toBeGreaterThan(0);
    expect(frostCell.dead).toBe(true);
    expect(frostCell.gddAccumC).toBeGreaterThan(0);
    expect(frostCell.sourceThermalCdays).toBeGreaterThan(0);
    expect(afterDeathCell.dryMatterGPerM2).toBe(frostCell.dryMatterGPerM2);
    expect(afterDeathCell.gddAccumC).toBe(frostCell.gddAccumC);
    expect(afterDeathCell.sourceThermalCdays).toBe(frostCell.sourceThermalCdays);
    expect(afterDeath.dayStats.waterUseMm).toBe(0);
  });

  it('rejects v3 direct-sow records that shift sowing-start roots to delayed emergence', () => {
    const bean = cropLibrary.find((crop) => crop.id === 27)!;
    const thermal = cropThermalParams.find((parameter) => parameter.cropId === bean.id)!;
    const key = targetCellKey({ kind: 'floor' }, '0,0');
    const run = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: { ...config().basePlan, planting: { '0,0': bean.id } },
      cropStartEvents: { [key]: 'direct-sowing' },
    });
    const parameter = syntheticStartEventParameter(bean.id, thermal);
    parameter.rootZone.rootDevelopment = {
      methodVersion: 'thermal-linear-root-depth-v1',
      storageExpansionMethod: 'uniform-initial-awc-fraction-v1',
      startEvent: 'direct-sowing',
      initialRootDepthCm: 12,
      growthStartsAfterCdays: 200,
      growthMmPerCday: 1.2,
      thermalBaseC: 4.5,
      thermalUpperC: 28,
      thermalAccumulationMethod: 'single sine horizontal cutoff',
      evidence: {
        evidenceId: 'test-yuma-root-profile',
        sourceCitation: 'Synthetic test only',
        sourceUrl: 'test-only:root-profile',
        validDomain: 'software acceptance only',
      },
    };
    const inputs = freezeRunModelInputsV3(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [bean],
      cropParametersV2: [parameter],
      cropEstablishmentByCell: {
        [key]: {
          startEvent: 'direct-sowing',
          establishedAtDate: '2026-10-03',
          initialAboveGroundDryMatterGPerM2: 5,
          evidence: {
            classification: 'synthetic',
            evidenceId: 'test-observed-emergence',
            validDomain: 'software acceptance only',
          },
        },
      },
    });
    const support = inspectRunModelSupport({ ...run, modelInputs: inputs });
    expect(support).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
    expect(support.reasons.some((reason) => reason.includes('cannot be shifted to a delayed emergence date'))).toBe(true);

    const tomato = cropLibrary.find((crop) => crop.id === 1)!;
    const tomatoThermal = cropThermalParams.find((candidate) => candidate.cropId === tomato.id)!;
    const transplantRun = config({
      cropModelVersion: 'crop-model-v3',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': tomato.id },
        plantedAt: { '0,0': '2026-10-01' },
      },
      cropStartEvents: { [key]: 'transplanting' },
    });
    const transplantParameter = syntheticStartEventParameter(tomato.id, tomatoThermal);
    transplantParameter.rootZone.rootDevelopment = { ...parameter.rootZone.rootDevelopment! };
    const transplantInputs = freezeRunModelInputsV3(transplantRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [tomato],
      cropParametersV2: [transplantParameter],
      cropEstablishmentByCell: {
        [key]: {
          startEvent: 'transplanting',
          establishedAtDate: '2026-10-01',
          initialAboveGroundDryMatterGPerM2: 5,
          evidence: {
            classification: 'synthetic',
            evidenceId: 'test-transplant-establishment',
            validDomain: 'software acceptance only',
          },
        },
      },
    });
    const transplantSupport = inspectRunModelSupport({ ...transplantRun, modelInputs: transplantInputs });
    expect(transplantSupport).toMatchObject({ status: 'qualified', canReplay: true });
    expect(transplantSupport.reasons).toContain(
      `Crop ${tomato.id}: root-depth reference starts at direct-sowing, while this run starts at transplanting; root development is outside its source event domain.`,
    );
  });

  it('scopes v2 irrigation to its target and carries water stress into production', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const target = { kind: 'growing-level' as const, growingSpaceId: 'space-a', levelId: 'high' };
    const levelCell = targetCellKey(target, '0,0');
    const run = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': lettuce.id },
        targets: {
          [growingTargetKey(target)]: {
            growingSpaceId: target.growingSpaceId,
            levelId: target.levelId,
            planting: { '0,0': lettuce.id },
          },
        },
      },
      cropStartEvents: { '0,0': 'transplanting', [levelCell]: 'transplanting' },
      interventions: [{ kind: 'irrigate', date: '2026-10-01', target, cells: ['0,0'], mm: 18 }],
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });
    modelInputs.cropParameters[0]!.rootZone.initialStorageFraction = 0;
    const result = simulateRun({ ...run, modelInputs }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 5,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }]);

    expect(result.finalState.cells['0,0']?.rootZoneWaterMm).toBe(0);
    expect(result.finalState.cells[levelCell]?.rootZoneWaterMm).toBeCloseTo(13, 10);
    expect(result.finalState.cells['0,0']?.startEvent).toBe('transplanting');
    expect(result.finalState.cells[levelCell]?.startEvent).toBe('transplanting');
    expect(result.finalState.cells['0,0']?.dryMatterGPerM2).toBe(0);
    expect(result.finalState.cells[levelCell]?.dryMatterGPerM2).toBeCloseTo(5.42, 10);
    expect(result.summary.waterUseMm).toBeCloseTo(2.5, 10);
    expect(result.events.find((event) => event.kind === 'irrigated')).toMatchObject({ target });
  });

  it('reconciles v2 dry-matter harvest across floor and elevated occupied cell areas', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const target = { kind: 'growing-level' as const, growingSpaceId: 'space-a', levelId: 'high' };
    const firstLevelCell = targetCellKey(target, '0,0');
    const secondLevelCell = targetCellKey(target, '1,0');
    const run = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: {
        ...config().basePlan,
        planting: { '0,0': lettuce.id },
        targets: {
          [growingTargetKey(target)]: {
            growingSpaceId: target.growingSpaceId,
            levelId: target.levelId,
            planting: { '0,0': lettuce.id, '1,0': lettuce.id },
          },
        },
      },
      cropStartEvents: {
        '0,0': 'transplanting',
        [firstLevelCell]: 'transplanting',
        [secondLevelCell]: 'transplanting',
      },
      interventions: [
        { kind: 'harvest', date: '2026-10-01', cell: '0,0' },
        { kind: 'harvest', date: '2026-10-01', cell: '0,0', target },
        { kind: 'harvest', date: '2026-10-01', cell: '1,0', target },
      ],
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });
    const frozenRun = { ...run, modelInputs };
    const state = createRun(frozenRun);
    for (const [key, cell] of Object.entries(state.cells)) {
      state.cells[key] = { ...cell, biomassFrac: 1, gddAccumC: 731, dryMatterGPerM2: 100 };
    }
    const result = stepDay(state, {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }, frozenRun);
    const harvests = result.events.filter((event) => event.kind === 'harvested');

    expect(harvests).toHaveLength(3);
    expect(harvests.filter((event) => event.target?.kind === 'growing-level')).toHaveLength(2);
    expect(harvests.reduce((sum, event) => sum + (event.kind === 'harvested' ? event.data.yieldKg : 0), 0))
      .toBeCloseTo(0.009375, 12);
    expect(Object.values(result.state.cells).every((cell) => cell.harvested)).toBe(true);

    const spacingVariantInputs = structuredClone(modelInputs);
    spacingVariantInputs.crops[0] = {
      ...spacingVariantInputs.crops[0]!,
      spacingCm: 5,
      rowSpacingCm: 5,
      yieldKgPerPlant: 1000,
    };
    const spacingVariantRun = { ...run, modelInputs: spacingVariantInputs };
    const spacingVariantState = createRun(spacingVariantRun);
    for (const [key, cell] of Object.entries(spacingVariantState.cells)) {
      spacingVariantState.cells[key] = { ...cell, biomassFrac: 1, gddAccumC: 731, dryMatterGPerM2: 100 };
    }
    const spacingVariant = stepDay(spacingVariantState, {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }, spacingVariantRun);
    expect(spacingVariant.events.filter((event) => event.kind === 'harvested')
      .reduce((sum, event) => sum + (event.kind === 'harvested' ? event.data.yieldKg : 0), 0))
      .toBeCloseTo(0.009375, 12);
  });

  it('freezes soil provenance on v2 inputs and qualifies missing provenance', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const soil = { awcMmPerCm: 1.7, organicMatterPct: 2.4, source: 'usda-sda' as const };
    const frozen = freezeRunModelInputsV2(run, { soil, crops: [cropLibrary[0]!] });
    expect(frozen.soil).toEqual({ ...soil });

    const unknown = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [cropLibrary[0]!],
    });
    expect(unknown.soil?.source).toBe('unknown');
    expect(inspectRunModelSupport({ ...run, modelInputs: unknown }).reasons)
      .toContain('Frozen v2 soil AWC provenance is unknown.');

    const inconsistent = {
      ...unknown,
      soil: { ...unknown.soil!, source: 'soilgrids' as const },
    };
    expect(inspectRunModelSupport({ ...run, modelInputs: inconsistent }).reasons)
      .toContain('Frozen v2 numeric soil AWC is paired with SoilGrids classification-only provenance.');

    const legacy = freezeRunModelInputs(config(), { soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 }, crops: [cropLibrary[0]!] });
    const converted = freezeRunModelInputsV2(run, { soil, crops: [cropLibrary[0]!] }, legacy);
    expect(converted.soil).toEqual({ awcMmPerCm: 1.7, organicMatterPct: 2.4, source: 'unknown' });
  });

  it('preserves malformed persisted root-development records without throwing during inspection', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const run = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: { ...config().basePlan, planting: { '0,0': lettuce.id } },
    });
    const valid = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4 },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });

    for (const malformedEvidence of [null, undefined]) {
      const malformed = structuredClone(valid);
      const rootDevelopment = malformed.cropParameters[0]!.rootZone.rootDevelopment as unknown as Record<string, unknown>;
      if (malformedEvidence === null) rootDevelopment.evidence = null;
      else delete rootDevelopment.evidence;

      expect(inspectRunModelSupport({ ...run, modelInputs: malformed })).toMatchObject({
        status: 'unsupported',
        canReplay: false,
        preserveStoredSummary: true,
      });
    }
  });

  it('does not repair an incomplete v2 record from the current crop catalog', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const frozen = freezeRunModelInputsV2(run, { crops: [cropLibrary[0]!] });
    const changed = freezeRunModelInputs(run, {
      crops: [{ ...cropLibrary[0]!, name: 'Changed crop' }],
      cropParametersV2: [{
        cropId: 1,
        thermal: null,
        production: { equationFamily: 'LINTUL-net-RUE', rueGPerMjInterceptedPar: 2, initialDryMatterGPerM2: 0, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported', missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
        rootZone: { method: 'FAO-56', effectiveRootDepthCm: 20, depletionFraction: 0.5, cropCoefficient: 1, initialStorageFraction: 0.7, status: 'supported', missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
        lifecycle: 'plant',
      }],
    }, frozen);
    expect(changed.model).toBe('run-inputs-v2');
    if (changed.model !== 'run-inputs-v2') throw new Error('Expected frozen v2 inputs');
    expect(changed.crops[0]?.name).toBe(cropLibrary[0]?.name);
    expect(changed.cropParameters[0]?.production.status).toBe('unsupported');
  });

  it('runs the v2 reducer with complete frozen inputs and keeps empirical accuracy qualified', () => {
    const run = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: { ...config().basePlan, cellM: 0.25 },
    });
    const crop = cropLibrary.find((entry) => entry.id === 1)!;
    const thermal = cropThermalParams.find((entry) => entry.cropId === crop.id)!;
    const inputs = {
      model: 'run-inputs-v2' as const,
      parameterSetVersion: 'crop-parameters-v3' as const,
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [crop],
      cropParameters: [{
        cropId: crop.id,
        thermal,
        production: { equationFamily: 'LINTUL-net-RUE' as const, rueGPerMjInterceptedPar: 2, initialDryMatterGPerM2: 0, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported' as const, missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
        rootZone: { method: 'FAO-56' as const, effectiveRootDepthCm: 20, depletionFraction: 0.5, cropCoefficient: 1, initialStorageFraction: 0.7, status: 'supported' as const, missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
        lifecycle: 'plant' as const,
      }],
      qualification: { status: 'supported' as const, reasons: [] },
    };
    const support = inspectRunModelSupport({ ...run, modelInputs: inputs });
    const result = simulateRun({ ...run, modelInputs: inputs }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }]);

    expect(support).toMatchObject({ status: 'qualified', canReplay: true });
    expect(support.reasons).toContain('Empirical v2 crop-model accuracy remains UNVERIFIED for this parameter set.');
    expect(support.reasons).toContain('Surface runoff is assumed to be 0 mm/day because the run has no frozen runoff input; infiltration and runoff uncertainty remain unmodeled.');
    expect(result.summary).toMatchObject({
      daysSimulated: 1,
      totalYieldKg: 0,
      yieldBasis: 'dry-matter',
      modelQualification: { status: 'qualified' },
    });
    expect(result.finalState.cells['0,0']?.dryMatterGPerM2).toBe(0);
    expect(result.finalState.cells['0,0']?.rootZoneWaterMm).toBeCloseTo(21.8, 8);
    const unknownLight = simulateRun({ ...run, modelInputs: inputs }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
    }]);
    expect(unknownLight.finalState.cells['0,0']?.dryMatterGPerM2).toBe(0);
    expect(unknownLight.summary.modelQualification?.reasons)
      .toContain('Crop 1: Daily usable DLI is unknown on one or more simulated days.');

    const repeatedUnknownLight = simulateRun({ ...run, modelInputs: inputs }, Array.from({ length: 10 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const },
    })));
    expect(repeatedUnknownLight.summary.modelQualification?.reasons.filter((reason) => reason.includes('Daily usable DLI is unknown')))
      .toHaveLength(1);

    const enclosed = simulateRun({
      ...run,
      environment: {
        id: 'env:1:greenhouse',
        farmId: 1,
        archetype: 'greenhouse-glass',
        label: 'Greenhouse',
        x: 0,
        y: 0,
        widthM: 2,
        heightM: 2,
        cellM: 0.25,
      },
      modelInputs: inputs,
    }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }]);
    expect(enclosed.finalState.cells['0,0']?.dryMatterGPerM2).toBeGreaterThan(0);
    expect(enclosed.finalState.cells['0,0']?.dryMatterGPerM2).toBeLessThan(4);
    expect(enclosed.summary.modelQualification?.reasons).toContain(
      'Without an environment-v1 climate state, enclosed natural DLI uses frozen calibration cover transmission when present, otherwise the archetype default; only explicitly frozen target lighting is included.',
    );

    const climateDay = {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    };
    const zeroKcInputs = structuredClone(inputs);
    zeroKcInputs.cropParameters[0]!.rootZone.cropCoefficient = 0;
    const frozenKcInputs = structuredClone(inputs);
    frozenKcInputs.cropParameters[0]!.rootZone.cropCoefficient = 1.5;
    const climateConfig = {
      ...run,
      environment: {
        id: 'env:1:greenhouse-climate-test',
        farmId: 1,
        archetype: 'greenhouse-glass' as const,
        label: 'Greenhouse',
        x: 0,
        y: 0,
        widthM: 2,
        heightM: 2,
        cellM: 0.25,
      },
      climateModel: 'environment-v1' as const,
      climateEquipment: NO_CLIMATE_EQUIPMENT,
    };
    const noFrozenTranspiration = simulateRun({ ...climateConfig, modelInputs: zeroKcInputs }, [climateDay]);
    const frozenTranspiration = simulateRun({ ...climateConfig, modelInputs: frozenKcInputs }, [climateDay]);
    expect(noFrozenTranspiration.finalState.climate?.rhPct).toBeLessThan(frozenTranspiration.finalState.climate!.rhPct);
    expect(frozenTranspiration.summary.waterUseMm).toBeGreaterThan(noFrozenTranspiration.summary.waterUseMm);
    const dryRootZoneInputs = structuredClone(frozenKcInputs);
    dryRootZoneInputs.cropParameters[0]!.rootZone.initialStorageFraction = 0;
    const dryRootZoneClimate = simulateRun({ ...climateConfig, modelInputs: dryRootZoneInputs }, [climateDay]);
    expect(dryRootZoneClimate.summary.waterUseMm).toBe(0);
    expect(dryRootZoneClimate.finalState.climate?.rhPct).toBe(frozenTranspiration.finalState.climate?.rhPct);
    expect(frozenTranspiration.summary.modelQualification?.reasons).toContain(
      'Enclosed v2 climate transpiration is lagged potential ET using frozen, stage-independent root-zone Kc and the previous climate ET factor; it is not reduced by current root-zone Ks. CO₂ uptake uses thermal progress times fixed PAR interception as a qualified leaf-area proxy, not measured LAI.',
    );

    const targetLight = {
      ...NO_CLIMATE_EQUIPMENT,
      ppfdUmol: 150,
      photoperiodH: 12,
    };
    const naturalPlusSupplement = simulateRun({
      ...run,
      environment: {
        id: 'env:1:greenhouse',
        farmId: 1,
        archetype: 'greenhouse-glass',
        label: 'Greenhouse',
        x: 0,
        y: 0,
        widthM: 2,
        heightM: 2,
        cellM: 0.25,
      },
      climateTargetEquipment: { [growingTargetKey({ kind: 'floor' })]: targetLight },
      modelInputs: inputs,
    }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
    }]);
    expect(naturalPlusSupplement.finalState.cells['0,0']?.dryMatterGPerM2).toBeGreaterThan(0);
    expect(naturalPlusSupplement.summary.modelQualification?.reasons)
      .toContain('Crop 1: Known supplemental DLI is used as a lower bound because natural DLI is unknown on one or more simulated days.');

    const supplementOnly = simulateRun({
      ...run,
      environment: {
        id: 'env:1:tent',
        farmId: 1,
        archetype: 'grow-tent',
        label: 'Tent',
        x: 0,
        y: 0,
        widthM: 2,
        heightM: 2,
        cellM: 0.25,
      },
      climateTargetEquipment: { [growingTargetKey({ kind: 'floor' })]: targetLight },
      modelInputs: inputs,
    }, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
    }]);
    expect(supplementOnly.finalState.cells['0,0']?.dryMatterGPerM2).toBeGreaterThan(0);
    expect(supplementOnly.summary.modelQualification?.reasons)
      .not.toContain('Crop 1: Known supplemental DLI is used as a lower bound because natural DLI is unknown on one or more simulated days.');

    const sunnySeries = Array.from({ length: 80 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 3,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    }));
    const productiveRun = { ...run, autoHarvest: true, modelInputs: inputs };
    const productive = simulateRun(productiveRun, sunnySeries);
    const productiveReplay = simulateRun(productiveRun, sunnySeries);

    expect(productive.finalState.cells['0,0']?.dryMatterGPerM2).toBeCloseTo(252, 8);
    const harvestedEvents = productive.events.filter((event) => event.kind === 'harvested');
    expect(harvestedEvents).toHaveLength(1);
    expect(harvestedEvents[0]?.dayIndex).toBe(62);
    const harvestIndex = inputs.cropParameters[0]!.production.harvestIndex;
    const expectedPayoutKg = 252 * 0.25 * 0.25 * harvestIndex / 1000;
    expect(harvestIndex).toBe(0.5);
    expect(expectedPayoutKg).toBe(0.007875);
    const harvestedEvent = harvestedEvents[0];
    if (harvestedEvent?.kind === 'harvested') {
      expect(Math.abs(harvestedEvent.data.yieldKg - expectedPayoutKg)).toBeLessThanOrEqual(1e-12);
    }
    expect(productive.summary.yieldBasis).toBe('dry-matter');
    expect(productive.summary.harvestReadyDay).toBe(62);
    expect(productive.finalState.cells['0,0']?.harvested).toBe(true);
    expect(productive.summary.totalYieldKg).toBe(0.01);
    expect(productive.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(productiveReplay.events).toEqual(productive.events);
    expect(productiveReplay.finalState).toEqual(productive.finalState);
    expect(productiveReplay.summary).toEqual(productive.summary);
    expect(productive.finalState.cells['0,0']?.gddAccumC).toBe(1117);
    expect(productive.summary.rootZoneBalanceResidualMaxAbsMm).toBeLessThanOrEqual(1e-6);
    expect(productive.summary.rootZoneBalanceResidualAccumulatedMm).toBeCloseTo(0, 8);

    const autoHarvestDisabledRun = { ...run, autoHarvest: false, modelInputs: inputs };
    expect(autoHarvestDisabledRun.interventions).toEqual([]);
    const autoHarvestDisabled = simulateRun(autoHarvestDisabledRun, sunnySeries);
    const autoHarvestDisabledReplay = simulateRun(autoHarvestDisabledRun, sunnySeries);
    const disabledHarvestEvents = autoHarvestDisabled.events.filter((event) => event.kind === 'harvested');
    expect(autoHarvestDisabled.summary.harvestReadyDay).toBe(62);
    expect(autoHarvestDisabled.finalState.cells['0,0']?.biomassFrac).toBe(1);
    expect(autoHarvestDisabled.finalState.cells['0,0']?.harvested ?? false).toBe(false);
    expect(disabledHarvestEvents).toHaveLength(0);
    expect(autoHarvestDisabled.summary.totalYieldKg).toBe(0);
    expect(autoHarvestDisabledReplay.events).toEqual(autoHarvestDisabled.events);
    expect(autoHarvestDisabledReplay.finalState).toEqual(autoHarvestDisabled.finalState);
    expect(autoHarvestDisabledReplay.summary).toEqual(autoHarvestDisabled.summary);

    const replacementCrop = cropLibrary.find((entry) => entry.id !== crop.id && entry.category !== 'fungus')!;
    const replantInputs = structuredClone(inputs) as RunModelInputsV2;
    replantInputs.crops.push(replacementCrop);
    replantInputs.cropParameters.push({
      ...structuredClone(inputs.cropParameters[0]!),
      cropId: replacementCrop.id,
      thermal: {
        ...thermal,
        accumulationMethod: 'study thermal-time',
        sourceCitation: 'Synthetic replant transition fixture',
        sourceUrl: 'test-only:replant-fixture',
      },
      rootZone: { ...structuredClone(inputs.cropParameters[0]!.rootZone), effectiveRootDepthCm: 10 },
    });
    const replantConfig = {
      ...run,
      interventions: [{ kind: 'plant' as const, date: '2026-10-01', cell: '0,0', cropId: replacementCrop.id, startEvent: 'transplanting' as const }],
      modelInputs: replantInputs,
    };
    const replantDay = {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    };
    const beforeReplant = createRun(replantConfig);
    const replantResult = stepDay({
      ...beforeReplant,
      cells: {
        ...beforeReplant.cells,
        '0,0': {
          ...beforeReplant.cells['0,0']!,
          rootZoneWaterMm: 23.8,
          rootZoneResidualAccumulatedMm: 0.125,
          rootZoneResidualMaxAbsMm: 0.001,
          rootZoneReplantDrainageMm: 2,
        },
      },
    }, replantDay, replantConfig);
    expect(replantResult.state.cells['0,0']).toMatchObject({
      startEvent: 'transplanting',
      rootZoneWaterMm: 17,
      rootZoneResidualAccumulatedMm: 0.125,
      rootZoneResidualMaxAbsMm: 0.001,
      rootZoneReplantDrainageMm: 8.8,
    });
    expect(replantResult.state.modelQualificationReasons).toContain(
      'Crop 2: replanting changed effective root-zone capacity from 34 mm to 17 mm; existing storage was retained up to the new capacity and any excess was counted as transition drainage.',
    );
    const replantedRun = simulateRun(replantConfig, [replantDay]);
    expect(replantedRun.summary.rootZoneReplantDrainageMm).toBeCloseTo(6.8, 8);

    const notYetPlanted = {
      ...run,
      basePlan: { ...run.basePlan, plantedAt: { '0,0': '2026-10-02' } },
      modelInputs: inputs,
    };
    const prePlant = simulateRun(notYetPlanted, [{
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
    }]);
    expect(prePlant.finalState.cells['0,0']?.rootZoneWaterMm).toBeCloseTo(23.8, 8);
    expect(prePlant.finalState.cells['0,0']?.dryMatterGPerM2).toBe(0);
    expect(prePlant.summary.waterUseMm).toBe(0);

    const dryStartInputs = structuredClone(inputs);
    dryStartInputs.cropParameters[0]!.rootZone.initialStorageFraction = 0;
    const greenhouseSnapshot = {
      id: 'env:1:pre-plant',
      farmId: 1,
      archetype: 'greenhouse-glass' as const,
      label: 'Greenhouse',
      x: 0,
      y: 0,
      widthM: 2,
      heightM: 2,
      cellM: 0.25,
    };
    const prePlantClimateConfig = {
      ...notYetPlanted,
      environment: greenhouseSnapshot,
      climateModel: 'environment-v1' as const,
      modelInputs: dryStartInputs,
    };
    const prePlantClimateDay = {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    };
    const dormantRun = simulateRun(prePlantClimateConfig, [prePlantClimateDay]);
    const emptyWorldRun = simulateRun({
      ...prePlantClimateConfig,
      basePlan: { ...prePlantClimateConfig.basePlan, planting: {}, plantedAt: undefined },
    }, [prePlantClimateDay]);
    expect(dormantRun.finalState.climate).toEqual(emptyWorldRun.finalState.climate);
    expect(dormantRun.summary.stressCellDays).toBe(0);
    expect(dormantRun.summary.stressDays.water).toBe(0);
    expect(dormantRun.events.filter((event) => event.kind === 'stress-onset')).toEqual([]);
  });

  it('runs the source-parameter lettuce fixture with synthetic inputs and closes root expansion water', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const run = config({
      cropModelVersion: 'crop-model-v2',
      basePlan: { ...config().basePlan, planting: { '0,0': lettuce.id } },
      dayCount: 20,
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4 },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });
    const frozenRun = { ...run, modelInputs };
    expect(modelInputs.qualification.status).toBe('qualified');
    const support = inspectRunModelSupport(frozenRun);
    expect(support).toMatchObject({ status: 'qualified', canReplay: true });

    const series = Array.from({ length: 20 }, (_, index) => ({
      date: new Date(Date.parse('2026-10-01T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    }));
    const result = simulateRun(frozenRun, series);
    const cell = result.finalState.cells['0,0']!;
    const initialStorageMm = 1.5 * lettuceYumaRootProfileReference.initialRootDepthCm * 0.7;

    expect(cell.rootZoneDepthCm).toBeGreaterThan(lettuceYumaRootProfileReference.initialRootDepthCm);
    expect(cell.rootZoneExpansionInflowMm).toBeGreaterThan(0);
    expect(result.summary.rootZoneExpansionInflowMm).toBeCloseTo(cell.rootZoneExpansionInflowMm!, 12);
    expect(cell.rootZoneWaterMm).toBeCloseTo(initialStorageMm + cell.rootZoneExpansionInflowMm!, 10);
    expect(result.summary.rootZoneBalanceResidualAccumulatedMm).toBeCloseTo(0, 10);
    expect(result.summary.rootZoneBalanceResidualMaxAbsMm).toBeLessThanOrEqual(1e-6);
    expect(cell.dryMatterGPerM2).toBe(0);
    expect(result.summary.modelQualification?.reasons).toContain(
      'Crop 2: Synthetic integration fixture composes Michelon Green Wave transplant thermal targets with greenhouse Rosalba production RUE and direct-seeded Yuma iceberg/romaine root parameters; it is not a validated cultivar/environment set.',
    );

    const oneDayRun = simulateRun(frozenRun, [
      { ...series[0]!, dliNaturalMol: 18 },
    ]);
    expect(oneDayRun.finalState.cells['0,0']?.dryMatterGPerM2).toBeCloseTo(5.42, 12);
  });

  it('stops source root expansion at maturity and after manual harvest', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const run = config({
      cropModelVersion: 'crop-model-v2',
      autoHarvest: false,
      basePlan: { ...config().basePlan, planting: { '0,0': lettuce.id } },
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4 },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });
    const frozenRun = { ...run, modelInputs };
    const initial = createRun(frozenRun);

    for (const endpoint of [{ biomassFrac: 1, harvested: false }, { biomassFrac: 0.5, harvested: true }]) {
      const state = structuredClone(initial);
      state.dayIndex = 20;
      state.cells['0,0'] = {
        ...state.cells['0,0']!,
        gddAccumC: 731,
        biomassFrac: endpoint.biomassFrac,
        harvested: endpoint.harvested,
        rootThermalCdays: 300,
        rootZoneDepthCm: 24,
        rootZoneExpansionInflowMm: 12.6,
        rootZoneWaterMm: 25.2,
      };
      const result = stepDay(state, {
        date: '2026-10-21',
        tMinC: 20,
        tMaxC: 30,
        precipMm: 0,
        etoMm: 0,
        dliNaturalMol: 0,
        gddBase10C: 15,
        provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default', dliNaturalMol: 'default' },
      }, frozenRun);
      expect(result.state.cells['0,0']).toMatchObject({
        rootThermalCdays: 300,
        rootZoneDepthCm: 24,
        rootZoneExpansionInflowMm: 12.6,
      });
    }
  });

  it('stops v2 root-zone and enclosure transpiration after harvest while v1 remains unchanged', () => {
    const lettuce = cropLibrary.find((crop) => crop.id === 2)!;
    const environment = {
      id: 'env:1:postharvest-flux',
      farmId: 1,
      archetype: 'greenhouse-glass' as const,
      label: 'Greenhouse',
      x: 0,
      y: 0,
      widthM: 2,
      heightM: 2,
      cellM: 0.25,
    };
    const run = config({
      cropModelVersion: 'crop-model-v2',
      climateModel: 'environment-v1',
      climateEquipment: NO_CLIMATE_EQUIPMENT,
      environment,
      autoHarvest: false,
      basePlan: { ...config().basePlan, planting: { '0,0': lettuce.id } },
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4 },
      crops: [lettuce],
      cropParametersV2: [lettuceSourceParameterFixture()],
    });
    const frozenRun = { ...run, modelInputs };
    const climateDay = {
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 2,
      dliNaturalMol: 18,
      gddBase10C: 15,
      provenance: { tMinC: 'default' as const, tMaxC: 'default' as const, precipMm: 'default' as const, etoMm: 'default' as const, dliNaturalMol: 'default' as const },
    };
    const planted = createRun(frozenRun);
    planted.cells['0,0'] = {
      ...planted.cells['0,0']!,
      biomassFrac: 0.8,
      dryMatterGPerM2: 100,
    };
    const preHarvest = stepDay(structuredClone(planted), climateDay, frozenRun);
    const harvestRun = {
      ...frozenRun,
      interventions: [{ kind: 'harvest' as const, date: climateDay.date, cell: '0,0' }],
    };
    const postHarvest = stepDay(structuredClone(planted), climateDay, harvestRun);
    const emptyRun = {
      ...frozenRun,
      basePlan: { ...frozenRun.basePlan, planting: {} },
    };
    const emptyWorld = stepDay(createRun(emptyRun), climateDay, emptyRun);

    const legacyRun = { ...run, cropModelVersion: 'crop-model-v1' as const };
    const legacyModelInputs = freezeRunModelInputs(legacyRun, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4 },
      crops: [lettuce],
    });
    const legacyHarvestRun = {
      ...legacyRun,
      modelInputs: legacyModelInputs,
      interventions: [{ kind: 'harvest' as const, date: climateDay.date, cell: '0,0' }],
    };
    const legacyPlanted = createRun(legacyHarvestRun);
    legacyPlanted.cells['0,0'] = { ...legacyPlanted.cells['0,0']!, biomassFrac: 0.8 };
    const legacyPostHarvest = stepDay(legacyPlanted, climateDay, legacyHarvestRun);

    expect(preHarvest.dayStats.waterUseMm).toBeGreaterThan(0);
    expect(postHarvest.state.cells['0,0']?.harvested).toBe(true);
    expect(postHarvest.dayStats.waterUseMm).toBe(0);
    expect(postHarvest.state.cells['0,0']?.rootZoneWaterMm).toBe(planted.cells['0,0']?.rootZoneWaterMm);
    expect(postHarvest.state.climate).toEqual(emptyWorld.state.climate);
    expect(legacyPostHarvest.state.cells['0,0']?.harvested).toBe(true);
    expect(legacyPostHarvest.dayStats.waterUseMm).toBeGreaterThan(0);
  });

  it('rejects an unknown persisted model version without attempting replay', () => {
    const support = inspectRunModelSupport({ ...config(), cropModelVersion: 'crop-model-v5' as never });
    expect(support).toMatchObject({ model: 'unknown', status: 'unsupported', canReplay: false });
    expect(support.preserveStoredSummary).toBe(true);
  });

  it('names the unsupported v4 lifecycle and keeps replay fail-closed with otherwise complete inputs', () => {
    const crop = cropLibrary.find((entry) => entry.slug === 'broccoli')!;
    const cellKey = targetCellKey({ kind: 'floor' }, '0,0');
    const run = config({
      cropModelVersion: 'crop-model-v4',
      climateModel: 'environment-v2',
      environment: {
        id: 'environment:1:v4-lifecycle-test',
        farmId: 1,
        archetype: 'greenhouse-glass',
        label: 'Synthetic greenhouse fixture',
        x: 0,
        y: 0,
        widthM: 1,
        heightM: 1,
        cellM: 0.25,
      },
      basePlan: { ...config().basePlan, planting: { '0,0': crop.id } },
      cropStartEvents: { [cellKey]: 'transplanting' },
    });
    const evidence = {
      evidenceId: 'v4-lifecycle-classifier-test',
      sourceCitation: 'Synthetic classifier fixture; no crop-performance claim',
      sourceUrl: 'test-only:v4-lifecycle-classifier',
      validDomain: 'software classifier test only',
    };
    const parameterFor = (lifecycle: 'plant' | 'fungus' | 'unsupported'): FrozenCropModelParametersV4 => ({
      cropId: crop.id,
      thermal: cropThermalParams.find((entry) => entry.cropId === crop.id)!,
      rootZone: {
        method: 'FAO-56',
        effectiveRootDepthCm: 20,
        depletionFraction: 0.5,
        cropCoefficient: 1,
        initialStorageFraction: 0.7,
        status: 'qualified',
        missing: [],
        limitations: ['Synthetic root-zone inputs isolate classifier behavior.'],
        evidence,
      },
      lifecycle,
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: 2,
        status: 'qualified',
        missing: [],
        limitations: ['Synthetic production inputs isolate classifier behavior.'],
        evidence,
        canopy: {
          kPar: 0.65,
          specificLeafAreaM2PerKg: 20,
          leafStemPartitionParameterM2PerKg: 1,
          evidence,
        },
        allocation: {
          canopyShare: 0.7,
          harvestableShare: 0.3,
          classification: 'synthetic',
          evidenceId: evidence.evidenceId,
          validDomain: evidence.validDomain,
        },
      },
    });
    const sourceFor = (lifecycle: 'plant' | 'fungus' | 'unsupported') => ({
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' as const },
      crops: [crop],
      cropParametersV4: [parameterFor(lifecycle)],
      cropCanopyEstablishmentByCell: {
        [cellKey]: {
          startEvent: 'transplanting' as const,
          establishedAtDate: run.startDate,
          initialCanopyDryMatterGPerM2: 10,
          initialHarvestableDryMatterGPerM2: 5,
          evidence: { classification: 'synthetic' as const, evidenceId: evidence.evidenceId, validDomain: evidence.validDomain },
        },
      },
    });
    const environmentModelInputs = freezeEnvironmentModelInputsV2(run);
    expect(environmentModelInputs).toBeDefined();
    if (!environmentModelInputs) throw new Error('Expected frozen environment-v2 test inputs');

    const supportedInputs = freezeRunModelInputsV4(run, sourceFor('plant'));
    expect(inspectRunModelSupport({ ...run, modelInputs: supportedInputs, environmentModelInputs }))
      .toMatchObject({ status: 'qualified', canReplay: true, preserveStoredSummary: false });

    for (const lifecycle of ['fungus', 'unsupported'] as const) {
      const nonPlantInputs = freezeRunModelInputsV4(run, sourceFor(lifecycle));
      expect(nonPlantInputs.qualification.status).toBe('unsupported');
      expect(nonPlantInputs.cropParameters[0]?.lifecycle).toBe(lifecycle);
      const support = inspectRunModelSupport({ ...run, modelInputs: nonPlantInputs, environmentModelInputs });
      expect(support).toMatchObject({
        model: 'crop-model-v4',
        status: 'unsupported',
        canReplay: false,
        preserveStoredSummary: true,
      });
      expect(support.reasons).toContain(
        `Crop ${crop.id}: lifecycle '${lifecycle}' cannot use crop-model-v4 plant canopy interception, dry-matter production, or canopy/harvestable-pool allocation calculations.`,
      );
      expect(support.reasons).not.toContain(
        `Crop ${crop.id}: one or more frozen v4 parameter values are missing, invalid, or unsupported.`,
      );
    }
  });
});

describe('crop-model-v3 frozen-input harvest payout', () => {
  const crop = cropLibrary.find((entry) => entry.id === 1)!;
  const thermal = cropThermalParams.find((entry) => entry.cropId === crop.id)!;
  const initialDryMatterGPerM2 = 12;
  const harvestIndex = 0.5;
  const cellM = 0.4;
  const eligibleCells = ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'];
  const unestablishedCell = '6,0';
  const deadCell = '7,0';
  const immatureCell = '8,0';
  const startDate = '2026-10-01';
  const target = { kind: 'floor' as const };
  const maturityTarget = thermal.gddToMaturityCdays[1];
  const expectedPayoutKg = initialDryMatterGPerM2 * cellM ** 2 * harvestIndex / 1000;

  function dateAtOffset(offset: number): string {
    return new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * 86_400_000)
      .toISOString().slice(0, 10);
  }

  function dailyEnvironment(offset: number) {
    return {
      date: dateAtOffset(offset),
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 15,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    };
  }

  function frozenRun(options: {
    cells: string[];
    autoHarvest: boolean;
    interventions?: RunConfig['interventions'];
  }): RunConfig {
    const cellKeys = options.cells.map((cell) => targetCellKey(target, cell));
    const establishmentEvidence = {
      classification: 'synthetic' as const,
      evidenceId: 'TEST-V3-HARVEST-PAYOUT',
      validDomain: 'synthetic v3 payout regression only',
    };
    const run = config({
      cropModelVersion: 'crop-model-v3',
      autoHarvest: options.autoHarvest,
      interventions: options.interventions ?? [],
      basePlan: {
        ...config().basePlan,
        widthM: options.cells.length * cellM,
        heightM: cellM,
        cellM,
        planting: Object.fromEntries(options.cells.map((cell) => [cell, crop.id])),
        plantedAt: Object.fromEntries(options.cells.map((cell) => [cell, startDate])),
      },
      cropStartEvents: Object.fromEntries(cellKeys.map((key) => [key, 'transplanting' as const])),
    });
    const modelInputs = freezeRunModelInputsV3(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'usda-sda' },
      crops: [crop],
      cropParametersV2: [
        {
          ...syntheticStartEventParameter(crop.id, thermal),
          production: {
            ...syntheticStartEventParameter(crop.id, thermal).production,
            harvestIndex,
          },
        },
      ],
      cropEstablishmentByCell: Object.fromEntries(options.cells.map((_cell, index) => {
        const key = cellKeys[index]!;
        return [key, {
          startEvent: 'transplanting' as const,
          establishedAtDate: startDate,
          initialAboveGroundDryMatterGPerM2: initialDryMatterGPerM2,
          evidence: establishmentEvidence,
        }];
      })),
    });
    return { ...run, modelInputs };
  }

  function findMaturity(run: RunConfig, cells: string[]): { dayIndex: number; envSeries: ReturnType<typeof dailyEnvironment>[] } {
    let state = createRun(run);
    const envSeries: ReturnType<typeof dailyEnvironment>[] = [];
    for (let offset = 0; offset < 500; offset++) {
      const env = dailyEnvironment(offset);
      envSeries.push(env);
      state = stepDay(state, env, run).state;
      if (cells.every((cell) => state.cells[targetCellKey(target, cell)]?.biomassFrac === 1)) {
        envSeries.push(dailyEnvironment(offset + 1));
        return { dayIndex: offset, envSeries };
      }
    }
    throw new Error('Frozen v3 fixture did not reach its maturity endpoint within 500 days.');
  }

  function runRecord(
    id: string,
    run: RunConfig,
    envSeries: ReturnType<typeof dailyEnvironment>[],
    summary: RunRecord['summary'],
  ): RunRecord {
    return {
      id,
      farmId: run.farmId,
      label: id,
      createdAt: `${startDate}T00:00:00.000Z`,
      config: run,
      envSeries,
      summary,
      status: 'complete',
    };
  }

  it('pays manual v3 harvests only for established mature live cells and replays the saved summary', () => {
    const manualCells = [...eligibleCells, unestablishedCell, deadCell, immatureCell];
    const harvestDate = startDate;
    const manualSeededPath = () => {
      const run = frozenRun({
        cells: manualCells,
        autoHarvest: false,
        interventions: manualCells.map((cell) => ({ kind: 'harvest' as const, date: harvestDate, cell })),
      });
      const support = inspectRunModelSupport(run);
      expect(support, JSON.stringify(support)).toMatchObject({ status: 'qualified', canReplay: true });
      const state = createRun(run);
      for (const cell of eligibleCells) {
        const key = targetCellKey(target, cell);
        state.cells[key] = {
          ...state.cells[key]!,
          biomassFrac: 1,
          dryMatterGPerM2: initialDryMatterGPerM2,
          gddAccumC: maturityTarget,
          sourceThermalCdays: maturityTarget,
          establishmentApplied: true,
        };
      }
      const unestablishedKey = targetCellKey(target, unestablishedCell);
      // Seed the impossible mature-but-unestablished state to isolate the manual payout guard;
      // the frozen transplant date above remains valid and supportable.
      state.cells[unestablishedKey] = {
        ...state.cells[unestablishedKey]!,
        biomassFrac: 1,
        dryMatterGPerM2: initialDryMatterGPerM2,
        gddAccumC: maturityTarget,
        sourceThermalCdays: maturityTarget,
        establishmentApplied: false,
      };
      const deadKey = targetCellKey(target, deadCell);
      state.cells[deadKey] = {
        ...state.cells[deadKey]!,
        biomassFrac: 1,
        dryMatterGPerM2: initialDryMatterGPerM2,
        gddAccumC: maturityTarget,
        sourceThermalCdays: maturityTarget,
        establishmentApplied: true,
        dead: true,
      };
      const immatureKey = targetCellKey(target, immatureCell);
      state.cells[immatureKey] = {
        ...state.cells[immatureKey]!,
        biomassFrac: 0,
        dryMatterGPerM2: initialDryMatterGPerM2,
        gddAccumC: maturityTarget / 2,
        sourceThermalCdays: maturityTarget / 2,
        establishmentApplied: true,
      };
      return { run, result: stepDay(state, dailyEnvironment(0), run) };
    };

    const first = manualSeededPath();
    const replay = manualSeededPath();
    const harvested = first.result.events.filter((event) => event.kind === 'harvested');
    const tooEarly = first.result.events.filter((event) => event.kind === 'harvest-too-early');
    expect(first.result.events).toEqual(replay.result.events);
    expect(first.result.state).toEqual(replay.result.state);
    expect(harvested).toHaveLength(6);
    expect(harvested.map((event) => event.cell).sort()).toEqual(
      eligibleCells.map((cell) => targetCellKey(target, cell)).sort(),
    );
    for (const event of harvested) {
      if (event.kind === 'harvested') expect(event.data.yieldKg).toBeCloseTo(0.00096, 12);
    }
    expect(harvested.reduce((sum, event) => (
      sum + (event.kind === 'harvested' ? event.data.yieldKg : 0)
    ), 0)).toBeCloseTo(0.00576, 12);
    expect(tooEarly).toHaveLength(1);
    expect(tooEarly[0]?.cell).toBe(targetCellKey(target, immatureCell));
    expect(harvested.some((event) => event.cell === targetCellKey(target, unestablishedCell))).toBe(false);
    expect(harvested.some((event) => event.cell === targetCellKey(target, deadCell))).toBe(false);

    const baseline = frozenRun({ cells: eligibleCells, autoHarvest: false });
    const maturity = findMaturity(baseline, eligibleCells);
    const actualHarvestDate = maturity.envSeries[maturity.dayIndex + 1]!.date;
    const manualInterventions = eligibleCells.flatMap((cell, index) => {
      const request = { kind: 'harvest' as const, date: actualHarvestDate, cell };
      return index === 0 ? [request, { ...request }] : [request];
    });
    const manualRun = {
      ...baseline,
      interventions: manualInterventions,
    };
    const original = simulateRun(manualRun, maturity.envSeries);
    const record = runRecord('run:v3:manual-harvest-payout', manualRun, maturity.envSeries, original.summary);
    const persistedReplay = simulateRun(record.config, record.envSeries);
    const persistedHarvests = original.events.filter((event) => event.kind === 'harvested');
    expect(manualRun.interventions.filter((intervention) => (
      intervention.kind === 'harvest' && intervention.cell === eligibleCells[0]
    ))).toHaveLength(2);
    expect(persistedHarvests).toHaveLength(6);
    expect(persistedHarvests.map((event) => event.cell)).toHaveLength(
      new Set(persistedHarvests.map((event) => event.cell)).size,
    );
    expect(persistedHarvests.every((event) => event.dayIndex === maturity.dayIndex + 1)).toBe(true);
    expect(persistedHarvests.every((event) => event.kind !== 'harvested' || event.data.yieldKg === expectedPayoutKg)).toBe(true);
    expect(persistedReplay.events).toEqual(original.events);
    expect(persistedReplay.finalState).toEqual(original.finalState);
    expect(persistedReplay.summary).toEqual(record.summary);
    expect(record.summary.totalYieldKg).toBe(0.01);
    expect(original.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(record.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
  });

  it('auto-harvests v3 on the actual frozen maturity endpoint once and replays the saved summary', () => {
    const baseline = frozenRun({ cells: eligibleCells, autoHarvest: false });
    const maturity = findMaturity(baseline, eligibleCells);
    const autoRun = { ...baseline, autoHarvest: true };
    const original = simulateRun(autoRun, maturity.envSeries);
    const record = runRecord('run:v3:auto-harvest-payout', autoRun, maturity.envSeries, original.summary);
    const replay = simulateRun(record.config, record.envSeries);
    const harvested = original.events.filter((event) => event.kind === 'harvested');

    expect(harvested).toHaveLength(6);
    expect(harvested.every((event) => event.dayIndex === maturity.dayIndex)).toBe(true);
    expect(harvested.every((event) => event.kind !== 'harvested' || event.data.yieldKg === expectedPayoutKg)).toBe(true);
    expect(harvested.reduce((sum, event) => (
      sum + (event.kind === 'harvested' ? event.data.yieldKg : 0)
    ), 0)).toBeCloseTo(0.00576, 12);
    expect(harvested.map((event) => event.cell)).toHaveLength(new Set(harvested.map((event) => event.cell)).size);
    expect(original.events.some((event) => event.kind === 'harvested' && event.dayIndex === maturity.dayIndex + 1)).toBe(false);
    for (const cell of eligibleCells) {
      expect(original.finalState.cells[targetCellKey(target, cell)]).toMatchObject({
        biomassFrac: 1,
        sourceThermalCdays: maturityTarget,
        readyAtDay: maturity.dayIndex,
        harvested: true,
      });
    }
    expect(original.summary.totalYieldKg).toBe(0.01);
    expect(record.summary.totalYieldKg).toBe(0.01);
    expect(original.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(record.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(replay.events).toEqual(original.events);
    expect(replay.finalState).toEqual(original.finalState);
    expect(replay.summary).toEqual(record.summary);
  });
});
