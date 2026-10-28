import { describe, expect, it, vi } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { lettuceRosalbaRUEReference, lettuceYumaRootProfileReference } from '@/data/cropModelV2LettuceReferences';
import { cropThermalParams } from '@/data/cropThermalParams';
import fao56V2AvailableWaterCapFixture from '../../../quality/beta/evidence/fao56-v2-available-water-cap-synthetic.json';
import fao56V2AwcVariantFixture from '../../../quality/beta/evidence/fao56-v2-awc-variant-positive-drainage-synthetic.json';
import fao56V2PositiveDrainageFixture from '../../../quality/beta/evidence/fao56-v2-positive-drainage-synthetic.json';
import fao56V2RootDrydownFixture from '../../../quality/beta/evidence/fao56-v2-root-drydown-integration-synthetic.json';
import fao56V2SameDayDrainageEtRerunFixture from '../../../quality/beta/evidence/fao56-v2-same-day-drainage-et-synthetic-rerun-01.json';
import fao56V2TomatoRootDepthFixture from '../../../quality/beta/evidence/fao56-v2-tomato-root-depth-drydown-synthetic.json';
import v3AutoHarvestMixedTargetFixture from '../../../quality/beta/evidence/v3-auto-harvest-mixed-target-synthetic.json';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { Crop, CropStartEvent, Observation } from '@/types';
import type {
  CropEstablishmentInput,
  FrozenCropModelParametersV2,
  FrozenCropModelParametersV4,
  RunConfig,
  RunModelInputsV1,
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
import * as cropModelV2 from './crop-model-v2';
import { stepFao56RootZone } from './crop-model-v2';
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

  it('replays a JSON-archived versionless v1 record against changed live crop and soil context', () => {
    const frozenCrop: Crop = {
      id: 1,
      name: 'Frozen tomato',
      scientificName: 'Solanum lycopersicum',
      category: 'vegetable',
      growthDays: 75,
      waterNeedMmDay: 4,
      nitrogenNeed: 'medium',
      sunRequirement: 'full',
      minTempC: 10,
      maxTempC: 35,
      yieldTonHa: 25,
      colorHex: '#d34a3f',
      description: 'Fixed archive-replay fixture crop.',
      isCustom: false,
      slug: 'tomato',
      yieldKgPerPlant: 0.5,
    };
    const frozenInputs: RunModelInputsV1 = {
      model: 'run-inputs-v1',
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [frozenCrop],
    };
    const frozenConfig: RunConfig = {
      farmId: 1,
      basePlan: {
        farmId: 1,
        widthM: 1,
        heightM: 1,
        cellM: 0.25,
        allowOutsideBeds: false,
        ground: {},
        planting: { '0,0': frozenCrop.id },
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      modelInputs: frozenInputs,
      startDate: '2026-10-01',
      dayCount: 3,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
    };
    const envSeries: RunRecord['envSeries'] = [
      {
        date: '2026-10-01', tMinC: 15, tMaxC: 20, precipMm: 0, etoMm: 1, gddBase10C: 7.5,
        provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
      },
      {
        date: '2026-10-02', tMinC: 15, tMaxC: 20, precipMm: 0, etoMm: 1, gddBase10C: 7.5,
        provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
      },
      {
        date: '2026-10-03', tMinC: 15, tMaxC: 20, precipMm: 0, etoMm: 1, gddBase10C: 7.5,
        provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
      },
    ];
    const original = simulateRun(frozenConfig, envSeries);
    const record: RunRecord = {
      id: 'run:1:historical-v1',
      farmId: 1,
      label: 'Historical v1 record',
      createdAt: '2026-10-01T00:00:00.000Z',
      config: frozenConfig,
      envSeries,
      summary: original.summary,
      status: 'complete',
    };
    const archivedRecord: RunRecord = JSON.parse(JSON.stringify(record));
    const changedLiveCrop: Crop = { ...frozenCrop, name: 'Changed live tomato', growthDays: 1, yieldKgPerPlant: 999 };
    const changedSoil = { awcMmPerCm: 0.1, organicMatterPct: 99 };
    const archivedInputs = archivedRecord.config.modelInputs;

    expect(archivedRecord.config.cropModelVersion).toBeUndefined();
    expect(archivedInputs).toEqual(frozenInputs);
    expect(changedLiveCrop.id).toBe(frozenCrop.id);
    if (!archivedInputs || archivedInputs.model !== 'run-inputs-v1') {
      throw new Error('Expected the archived record to retain its frozen v1 inputs.');
    }
    expect(changedLiveCrop).not.toEqual(archivedInputs.crops[0]);
    expect(changedSoil).not.toEqual(frozenInputs.soil);

    const replay = simulateRun(archivedRecord.config, archivedRecord.envSeries, {
      soil: changedSoil,
      crops: [changedLiveCrop],
    });
    expect(replay.events).toEqual(original.events);
    expect(replay.finalState).toEqual(original.finalState);
    expect(replay.summary).toEqual(archivedRecord.summary);
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

  it('integrates adjusted-p root dry-down with water-stressed production', () => {
    const fixture = fao56V2RootDrydownFixture;
    const input = fixture.syntheticInputs;
    const expected = fixture.expected;
    const startDate = input.dailyEnvironment.startDate;
    const cellKey = input.crop.cell;
    const cellM = 0.25;
    const tomato = cropLibrary.find((entry) => entry.id === input.crop.catalogCropId)!;
    const cropTraits = input.crop.stressTraits;
    expect(tomato.slug).toBe(input.crop.slug);
    expect(tomato.category).toBe(cropTraits.category);
    expect(tomato.family).toBe(cropTraits.family);
    expect(tomato.minTempC).toBe(cropTraits.minimumTemperatureC);
    expect(tomato.maxTempC).toBe(cropTraits.maximumTemperatureC);
    expect(tomato.nitrogenNeed).toBe(cropTraits.nitrogenNeedClass);
    const thermal = input.crop.thermalParameters;
    const soil = input.soil;
    const root = input.rootZone;
    const production = input.production;
    const requireCropStartEvent = (event: string): CropStartEvent => {
      if (event === 'direct-sowing' || event === 'transplanting') return event;
      throw new Error(`Unsupported crop start event in fixture: ${event}`);
    };
    const frozenStartEvents = thermal.startEvents.map(requireCropStartEvent);
    const cropStartEvent = requireCropStartEvent(input.crop.startEvent);

    const frozenParameter = (initialStorageFraction: number): FrozenCropModelParametersV2 => ({
      cropId: input.crop.catalogCropId,
      thermal: {
        tBaseC: thermal.tBaseC,
        tUpperC: thermal.tUpperC,
        gddToMaturityCdays: [
          thermal.gddToMaturityCdays[0]!,
          thermal.gddToMaturityCdays[1]!,
        ],
        startEvents: frozenStartEvents,
        accumulationStart: thermal.accumulationStart,
        maturityEndpoint: thermal.maturityEndpoint,
        accumulationMethod: thermal.accumulationMethod,
        sourceCitation: thermal.sourceCitation,
        sourceUrl: thermal.sourceUrl,
      },
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: production.rueGPerMjInterceptedPar,
        initialDryMatterGPerM2: production.initialDryMatterGPerM2,
        interceptedParFraction: production.interceptedParFraction,
        harvestIndex: production.harvestIndex,
        status: 'qualified',
        missing: [...production.missing],
        limitations: [...production.limitations],
        evidence: { ...production.evidence },
      },
      rootZone: {
        method: 'FAO-56',
        effectiveRootDepthCm: soil.effectiveRootDepthCm,
        depletionFraction: root.tableDepletionFractionP,
        cropCoefficient: root.cropCoefficient,
        initialStorageFraction,
        status: 'qualified',
        missing: [...root.missing],
        limitations: [...root.limitations],
        evidence: { ...root.evidence },
      },
      lifecycle: 'plant',
    });

    const makeRun = (initialStorageFraction: number) => {
      const run = config({
        cropModelVersion: 'crop-model-v2',
        startDate,
        dayCount: input.dailyEnvironment.dayCount,
        autoHarvest: input.crop.autoHarvest,
        basePlan: {
          ...config().basePlan,
          widthM: cellM,
          heightM: cellM,
          cellM,
          planting: { [cellKey]: input.crop.catalogCropId },
          plantedAt: { [cellKey]: startDate },
        },
        cropStartEvents: { [cellKey]: cropStartEvent },
      });
      const modelInputs = freezeRunModelInputsV2(run, {
        soil: { awcMmPerCm: soil.awcMmPerCm, organicMatterPct: soil.organicMatterPct },
        crops: [tomato],
        cropParametersV2: [frozenParameter(initialStorageFraction)],
      });
      return { ...run, modelInputs };
    };

    const dryRun = makeRun(root.dryControlInitialStorageFraction);
    const wetRun = makeRun(root.wetControlInitialStorageFraction);
    const dryParameters = structuredClone(dryRun.modelInputs.cropParameters[0]!);
    dryParameters.rootZone.initialStorageFraction = root.wetControlInitialStorageFraction;
    expect(dryParameters).toEqual(wetRun.modelInputs.cropParameters[0]);
    expect({ ...dryRun, modelInputs: undefined }).toEqual({ ...wetRun, modelInputs: undefined });
    for (const run of [dryRun, wetRun]) {
      expect(run.cropModelVersion).toBe(fixture.frozenModelInputs.cropModelVersion);
      expect(run.modelInputs.model).toBe(fixture.frozenModelInputs.runInputsModel);
      expect(run.modelInputs.parameterSetVersion).toBe(fixture.frozenModelInputs.parameterSetVersion);
      expect(run.modelInputs.qualification.status).toBe('qualified');
      expect(inspectRunModelSupport(run)).toMatchObject({ status: 'qualified', canReplay: true });
      expect(inspectRunModelSupport(run).reasons).toContain(
        'Empirical v2 crop-model accuracy remains UNVERIFIED for this parameter set.',
      );
    }

    const days = Array.from({ length: input.dailyEnvironment.dayCount }, (_, offset) => ({
      date: new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10),
      tMinC: input.dailyEnvironment.tMinC,
      tMaxC: input.dailyEnvironment.tMaxC,
      precipMm: input.dailyEnvironment.precipMm,
      etoMm: input.dailyEnvironment.etoMm,
      dliNaturalMol: input.dailyEnvironment.dliNaturalMol,
      gddBase10C: input.dailyEnvironment.gddBase10C,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    }));
    const totalAvailableWaterMm = soil.awcMmPerCm * soil.effectiveRootDepthCm;
    const potentialEtcMmDay = input.dailyEnvironment.etoMm * root.cropCoefficient;
    const adjustedP = Math.max(0.1, Math.min(
      0.8,
      root.tableDepletionFractionP + 0.04 * (5 - potentialEtcMmDay),
    ));
    expect(root.tableDepletionFractionP).toBe(0.4);
    expect(Math.abs(adjustedP - root.expectedAdjustedDepletionFractionP)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(adjustedP * totalAvailableWaterMm - root.readilyAvailableWaterMm)).toBeLessThanOrEqual(1e-12);

    const stepAllDays = (run: ReturnType<typeof makeRun>) => {
      const initialState = createRun(run);
      let state = initialState;
      const steps = days.map((environment) => {
        const previousState = state;
        const result = stepDay(previousState, environment, run);
        state = result.state;
        return {
          previousCell: previousState.cells[cellKey]!,
          cell: state.cells[cellKey]!,
          result,
        };
      });
      return { initialState, finalState: state, steps };
    };
    const dryTrace = stepAllDays(dryRun);
    const wetTrace = stepAllDays(wetRun);
    const dryInitialCell = dryTrace.initialState.cells[cellKey]!;
    const wetInitialCell = wetTrace.initialState.cells[cellKey]!;
    const initialNitrogenPoolKgHa = soil.nitrogenPoolInitialization.initialPoolKgHa;
    const finalNitrogenPoolLowerBoundKgHa = soil.nitrogenPoolInitialization.conservativePoolLowerBoundAfterTenDaysKgHa;
    expect(initialNitrogenPoolKgHa).toBe(600);
    expect(dryInitialCell.nitrogenKgHa).toBe(initialNitrogenPoolKgHa);
    expect(wetInitialCell.nitrogenKgHa).toBe(initialNitrogenPoolKgHa);
    expect(dryInitialCell.rootZoneWaterMm).toBe(root.dryControlInitialStorageMm);
    expect(totalAvailableWaterMm - dryInitialCell.rootZoneWaterMm!).toBe(root.dryControlInitialDepletionMm);
    expect(wetInitialCell.rootZoneWaterMm).toBe(root.wetControlInitialStorageMm);
    expect(totalAvailableWaterMm - wetInitialCell.rootZoneWaterMm!).toBe(root.wetControlInitialDepletionMm);

    const checkCellState = (step: typeof dryTrace.steps[number]) => {
      const { cell, result, previousCell } = step;
      expect(result.dayStats.liveCells).toBe(1);
      expect(cell.biomassFrac).toBeLessThan(1);
      expect(cell.dead).not.toBe(true);
      expect(cell.harvested).not.toBe(true);
      expect(cell.stress.heat).toBe(0);
      expect(cell.stress.cold).toBe(0);
      expect(cell.stress.nitrogen).toBe(0);
      expect(result.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
      const residual = previousCell.rootZoneWaterMm!
        - result.dayStats.waterUseMm
        - cell.rootZoneWaterMm!;
      expect(Math.abs(residual)).toBeLessThanOrEqual(1e-9);
      expect(cell.rootZoneResidualMaxAbsMm).toBeDefined();
      expect(cell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(1e-9);
      return residual;
    };

    const dryWaterResiduals: number[] = [];
    for (const [index, row] of expected.dryDailyRows.entries()) {
      const step = dryTrace.steps[index]!;
      const { previousCell, cell, result } = step;
      dryWaterResiduals.push(checkCellState(step));
      const startDepletionMm = totalAvailableWaterMm - previousCell.rootZoneWaterMm!;
      const endDepletionMm = totalAvailableWaterMm - cell.rootZoneWaterMm!;
      const dryMatterIncrementGPerM2 = cell.dryMatterGPerM2! - previousCell.dryMatterGPerM2!;
      expect(Math.abs(startDepletionMm - row.startDepletionMm)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs((1 - cell.stress.water) - row.stressCoefficient)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(result.dayStats.waterUseMm - row.actualTranspirationMm)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(endDepletionMm - row.endDepletionMm)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(cell.rootZoneWaterMm! - row.endStorageMm)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(dryMatterIncrementGPerM2 - row.dryMatterIncrementGPerM2)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(cell.dryMatterGPerM2! - row.cumulativeDryMatterGPerM2)).toBeLessThanOrEqual(1e-8);
    }
    const wetWaterResiduals: number[] = [];
    for (const [index, step] of wetTrace.steps.entries()) {
      wetWaterResiduals.push(checkCellState(step));
      expect(1 - step.cell.stress.water).toBe(expected.wetControl.stressCoefficientEachDay);
      expect(step.result.dayStats.waterUseMm).toBe(expected.wetControl.actualTranspirationMmEachDay);
      expect(step.cell.rootZoneWaterMm).toBe(root.wetControlInitialStorageMm - (index + 1) * expected.wetControl.actualTranspirationMmEachDay);
      expect(step.cell.dryMatterGPerM2).toBe((index + 1) * production.expectedUnstressedGainGPerM2Day);
    }
    expect(Math.abs(dryWaterResiduals.reduce((sum, residual) => sum + residual, 0))).toBeLessThanOrEqual(1e-8);
    expect(Math.abs(wetWaterResiduals.reduce((sum, residual) => sum + residual, 0))).toBeLessThanOrEqual(1e-8);
    const dryTraceFinalCell = dryTrace.finalState.cells[cellKey]!;
    const wetTraceFinalCell = wetTrace.finalState.cells[cellKey]!;
    expect(dryTraceFinalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(wetTraceFinalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(dryTraceFinalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(wetTraceFinalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(Math.abs(dryTraceFinalCell.rootZoneResidualAccumulatedMm!)).toBeLessThanOrEqual(1e-8);
    expect(Math.abs(wetTraceFinalCell.rootZoneResidualAccumulatedMm!)).toBeLessThanOrEqual(1e-8);
    expect(dryTraceFinalCell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(1e-9);
    expect(wetTraceFinalCell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(1e-9);
    expect(dryTrace.finalState.cells[cellKey]!.nitrogenKgHa).toBeGreaterThanOrEqual(finalNitrogenPoolLowerBoundKgHa);
    expect(wetTrace.finalState.cells[cellKey]!.nitrogenKgHa).toBeGreaterThanOrEqual(finalNitrogenPoolLowerBoundKgHa);

    const dryRunResult = simulateRun(dryRun, days);
    const dryReplay = simulateRun(dryRun, days);
    const wetRunResult = simulateRun(wetRun, days);
    const wetReplay = simulateRun(wetRun, days);
    expect(dryRunResult.finalState).toEqual(dryTrace.finalState);
    expect(wetRunResult.finalState).toEqual(wetTrace.finalState);
    expect(dryRunResult.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(wetRunResult.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(dryReplay.events).toEqual(dryRunResult.events);
    expect(dryReplay.finalState).toEqual(dryRunResult.finalState);
    expect(dryReplay.summary).toEqual(dryRunResult.summary);
    expect(wetReplay.events).toEqual(wetRunResult.events);
    expect(wetReplay.finalState).toEqual(wetRunResult.finalState);
    expect(wetReplay.summary).toEqual(wetRunResult.summary);
    expect(dryRunResult.summary).toMatchObject({
      daysSimulated: input.dailyEnvironment.dayCount,
      totalYieldKg: 0,
      yieldBasis: 'dry-matter',
      modelQualification: { status: 'qualified' },
    });
    expect(wetRunResult.summary).toMatchObject({
      daysSimulated: input.dailyEnvironment.dayCount,
      totalYieldKg: 0,
      yieldBasis: 'dry-matter',
      modelQualification: { status: 'qualified' },
    });
    const dryCumulativeDryMatter = dryRunResult.finalState.cells[cellKey]!.dryMatterGPerM2!;
    const wetCumulativeDryMatter = wetRunResult.finalState.cells[cellKey]!.dryMatterGPerM2!;
    expect(Math.abs(dryCumulativeDryMatter - expected.dryCumulativeDryMatterGainGPerM2)).toBeLessThanOrEqual(1e-8);
    expect(Math.abs(wetCumulativeDryMatter - expected.wetControl.cumulativeDryMatterGainGPerM2)).toBeLessThanOrEqual(1e-8);
    expect(Math.abs((wetCumulativeDryMatter - dryCumulativeDryMatter) - expected.wetMinusDryDryMatterGainGPerM2))
      .toBeLessThanOrEqual(1e-8);
    expect(wetCumulativeDryMatter).toBeGreaterThan(dryCumulativeDryMatter);

    const drainageFixture = fao56V2PositiveDrainageFixture;
    const drainageInput = drainageFixture.syntheticInputs;
    const drainageRoot = drainageInput.rootZone;
    const drainageExpected = drainageFixture.expected.calculation;
    const drainageRun = {
      ...makeRun(drainageRoot.initialStorageFraction),
      dayCount: drainageInput.dailyEnvironment.dayCount,
    };
    const drainageParameters = drainageRun.modelInputs.cropParameters[0]!;
    const drainageRunSoil = drainageRun.modelInputs.soil;
    if (!drainageRunSoil || typeof drainageRunSoil.awcMmPerCm !== 'number') {
      throw new Error('Expected frozen drainage soil inputs with a numeric AWC.');
    }
    const drainageEffectiveRootDepthCm = drainageRoot.effectiveRootDepthCm;
    const drainageCapacityMm = drainageRunSoil.awcMmPerCm * drainageEffectiveRootDepthCm;

    expect(drainageInput.soil.awcMmPerCm).toBe(2);
    expect(drainageRunSoil.awcMmPerCm).toBe(drainageInput.soil.awcMmPerCm);
    expect(drainageEffectiveRootDepthCm).toBe(80);
    expect(drainageInput.soil.effectiveRootDepthCm).toBe(drainageEffectiveRootDepthCm);
    expect(drainageCapacityMm).toBe(drainageExpected.totalAvailableWaterMm);
    expect(drainageCapacityMm).toBe(160);
    expect(drainageParameters.rootZone.effectiveRootDepthCm).toBe(drainageEffectiveRootDepthCm);
    expect(drainageParameters.rootZone.initialStorageFraction).toBe(drainageRoot.initialStorageFraction);
    expect(drainageInput.rootZone.rootDevelopment).toContain('none');
    expect(drainageParameters.rootZone.rootDevelopment).toBeUndefined();

    const drainageInitialState = createRun(drainageRun);
    const drainageInitialCell = drainageInitialState.cells[cellKey]!;
    expect(drainageInitialCell.rootZoneWaterMm).toBeDefined();
    expect(drainageInitialCell.rootZoneWaterMm).toBe(drainageFixture.expected.integratedPreStepState.cellRootZoneWaterMm);
    expect(drainageInitialCell.rootZoneWaterMm).toBe(159);
    expect(drainageInitialCell.rootZoneDepthCm).toBeUndefined();
    expect(drainageInitialCell.rootThermalCdays).toBeUndefined();

    const directDrainageStep = stepFao56RootZone(
      { waterMm: drainageRoot.initialStorageMm },
      {
        awcMmPerCm: drainageInput.soil.awcMmPerCm,
        effectiveRootDepthCm: drainageEffectiveRootDepthCm,
        depletionFraction: drainageRoot.expectedAdjustedDepletionFractionP,
      },
      {
        precipMm: drainageRoot.precipitationMm,
        runoffMm: drainageRoot.runoffMm,
        irrigationMm: drainageRoot.irrigationMm,
        capillaryRiseMm: drainageRoot.capillaryRiseMm,
        rootGrowthStorageMm: drainageRoot.rootGrowthStorageMm,
        potentialTranspirationMm: drainageRoot.potentialTranspirationMmDay,
      },
    );
    expect(Math.abs(directDrainageStep.deepDrainageMm - drainageExpected.deepPercolationMm)).toBeLessThanOrEqual(1e-12);
    expect(directDrainageStep.state.waterMm).toBe(drainageExpected.endStorageMm);
    expect(directDrainageStep.depletionMm).toBe(drainageExpected.endDepletionMm);
    expect(directDrainageStep.rootGrowthStorageMm).toBe(0);
    expect(directDrainageStep.actualTranspirationMm).toBe(drainageExpected.actualTranspirationMm);
    expect(directDrainageStep.residualMm).toBe(drainageExpected.waterBalanceResidualMm);
    expect(directDrainageStep.state.residualAccumulatedMm).toBeDefined();
    expect(directDrainageStep.state.residualAccumulatedMm).toBe(drainageExpected.waterBalanceResidualMm);

    const drainageEnvironment = drainageInput.dailyEnvironment;
    const drainageDay = {
      ...days[0]!,
      date: drainageEnvironment.startDate,
      tMinC: drainageEnvironment.tMinC,
      tMaxC: drainageEnvironment.tMaxC,
      precipMm: drainageEnvironment.precipMm,
      etoMm: drainageEnvironment.etoMm,
      dliNaturalMol: drainageEnvironment.dliNaturalMol,
      gddBase10C: drainageEnvironment.gddBase10C,
    };
    const drainageStep = (() => {
      const rootStepSpy = vi.spyOn(cropModelV2, 'stepFao56RootZone');
      try {
        const result = stepDay(drainageInitialState, drainageDay, drainageRun);
        expect(rootStepSpy).toHaveBeenCalledTimes(1);
        const observedCall = rootStepSpy.mock.calls[0];
        if (!observedCall) throw new Error('Expected the stepDay root-zone call to be observed.');
        const [observedState, observedParameters, observedFluxes] = observedCall;
        expect(observedState.waterMm).toBe(159);
        expect(observedParameters.awcMmPerCm).toBe(2);
        expect(observedParameters.effectiveRootDepthCm).toBe(80);
        expect(observedParameters.depletionFraction).toBe(cropModelV2.fao56AdjustedDepletionFraction(0.4, 0));
        expect(observedFluxes.precipMm).toBe(5);
        expect(observedFluxes.irrigationMm).toBe(0);
        expect(observedFluxes.runoffMm).toBe(0);
        expect(observedFluxes.capillaryRiseMm).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(observedFluxes, 'capillaryRiseMm')).toBe(false);
        expect(observedFluxes.rootGrowthStorageMm).toBe(0);
        expect(observedFluxes.potentialTranspirationMm).toBe(0);
        return result;
      } finally {
        rootStepSpy.mockRestore();
      }
    })();
    const drainageFinalCell = drainageStep.state.cells[cellKey]!;
    expect(drainageStep.effectiveEnv.precipMm).toBe(drainageEnvironment.precipMm);
    expect(drainageStep.effectiveEnv.precipMm).toBe(5);
    expect(drainageStep.dayStats.waterUseMm).toBe(drainageRoot.actualTranspirationMmDay);
    expect(drainageStep.dayStats.waterUseMm).toBe(0);
    expect(drainageFinalCell.rootZoneWaterMm).toBe(drainageExpected.endStorageMm);
    expect(drainageFinalCell.rootZoneExpansionInflowMm).toBeUndefined();
    expect(drainageFinalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(drainageFinalCell.rootZoneResidualAccumulatedMm).toBe(0);
    expect(drainageFinalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(drainageFinalCell.rootZoneResidualMaxAbsMm).toBe(0);
    // Daily deep drainage is not persisted; infer it from the integrated mass balance.
    const inferredDrainageMm = drainageInitialCell.rootZoneWaterMm!
      + drainageStep.effectiveEnv.precipMm
      - drainageStep.dayStats.waterUseMm
      - drainageFinalCell.rootZoneWaterMm!
      - drainageFinalCell.rootZoneResidualAccumulatedMm!;
    expect(Math.abs(inferredDrainageMm - drainageExpected.deepPercolationMm)).toBeLessThanOrEqual(1e-12);

    const drainageRunResult = simulateRun(drainageRun, [drainageDay]);
    const drainageRunCell = drainageRunResult.finalState.cells[cellKey]!;
    expect(drainageRunResult.summary.daysSimulated).toBe(drainageInput.dailyEnvironment.dayCount);
    expect(drainageRunResult.summary.rainMm).toBe(5);
    expect(drainageRunResult.summary.waterUseMm).toBe(0);
    expect(drainageRunCell.rootZoneWaterMm).toBe(drainageExpected.endStorageMm);
    expect(drainageRunCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(drainageRunCell.rootZoneResidualAccumulatedMm).toBe(0);
    expect(drainageRunCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(drainageRunCell.rootZoneResidualMaxAbsMm).toBe(0);
    expect(drainageRunResult.summary.rootZoneBalanceResidualAccumulatedMm).toBeDefined();
    expect(drainageRunResult.summary.rootZoneBalanceResidualAccumulatedMm).toBe(0);
    expect(drainageRunResult.summary.rootZoneBalanceResidualMaxAbsMm).toBeDefined();
    expect(drainageRunResult.summary.rootZoneBalanceResidualMaxAbsMm).toBe(0);
    expect(drainageRunCell).toEqual(drainageFinalCell);
  });

  it('replays preregistered paired tomato root-depth dry-down scenarios', () => {
    const fixture = fao56V2TomatoRootDepthFixture;
    const input = fixture.syntheticInputs;
    const expected = fixture.expected;
    const tolerances = fixture.toleranceReview.numericTolerances;
    const tomato = cropLibrary.find((crop) => crop.id === input.crop.catalogCropId)!;
    const thermal = input.crop.thermalParameters;
    const production = input.production;
    const root = input.rootZone;
    const cellKey = input.crop.cell;
    const startDate = input.crop.transplantDate;
    const cellM = input.crop.cellSizeM;
    expect(tomato.slug).toBe(input.crop.slug);
    const evidence = {
      evidenceId: fixture.source.evidenceId,
      sourceCitation: fixture.source.citation,
      sourceUrl: fixture.source.url,
      validDomain: 'FAO-56 Table 22 tomato maximum effective-root-depth range and p at ETc approximately 5 mm/day; fixed endpoints are synthetic boundary scenarios only.',
    };
    const productionEvidence = {
      evidenceId: fixture.id,
      sourceCitation: 'Synthetic v2 root-depth production-response software fixture.',
      sourceUrl: `test-only:${fixture.id}`,
      validDomain: 'Synthetic software invariant only; no tomato production evidence is asserted.',
    };
    const requireCropStartEvent = (event: string): CropStartEvent => {
      if (event === 'direct-sowing' || event === 'transplanting') return event;
      throw new Error(`Unsupported crop start event in fixture: ${event}`);
    };
    const startEvent = requireCropStartEvent(input.crop.startEvent);
    const startEvents = thermal.startEvents.map(requireCropStartEvent);
    const days = Array.from({ length: input.dailyEnvironment.dayCount }, (_, offset) => ({
      date: new Date(Date.parse(`${input.dailyEnvironment.startDate}T00:00:00Z`) + offset * 86_400_000)
        .toISOString().slice(0, 10),
      tMinC: input.dailyEnvironment.tMinC,
      tMaxC: input.dailyEnvironment.tMaxC,
      precipMm: input.dailyEnvironment.precipitationMm,
      etoMm: input.dailyEnvironment.etoMm,
      dliNaturalMol: input.dailyEnvironment.dliNaturalMol,
      gddBase10C: input.dailyEnvironment.gddBase10C,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    }));
    const makeRun = (effectiveRootDepthCm: number) => {
      const run = config({
        cropModelVersion: 'crop-model-v2',
        startDate,
        dayCount: input.dailyEnvironment.dayCount,
        autoHarvest: input.crop.autoHarvest,
        basePlan: {
          ...config().basePlan,
          widthM: cellM,
          heightM: cellM,
          cellM,
          planting: { [cellKey]: input.crop.catalogCropId },
          plantedAt: { [cellKey]: startDate },
        },
        cropStartEvents: { [cellKey]: startEvent },
      });
      const modelInputs = freezeRunModelInputsV2(run, {
        soil: {
          awcMmPerCm: input.soil.awcMmPerCm,
          organicMatterPct: input.soil.organicMatterPct,
        },
        crops: [tomato],
        cropParametersV2: [{
          cropId: input.crop.catalogCropId,
          thermal: {
            tBaseC: thermal.tBaseC,
            tUpperC: thermal.tUpperC,
            gddToMaturityCdays: [thermal.gddToMaturityCdays[0]!, thermal.gddToMaturityCdays[1]!],
            startEvents,
            accumulationStart: thermal.accumulationStart,
            maturityEndpoint: thermal.maturityEndpoint,
            accumulationMethod: thermal.accumulationMethod,
            sourceCitation: thermal.sourceCitation,
            sourceUrl: thermal.sourceUrl,
          },
          production: {
            equationFamily: 'LINTUL-net-RUE',
            rueGPerMjInterceptedPar: production.rueGPerMjInterceptedPar,
            initialDryMatterGPerM2: production.initialDryMatterGPerM2,
            interceptedParFraction: production.interceptedParFraction,
            harvestIndex: production.harvestIndex,
            status: 'qualified',
            missing: [],
            limitations: [production.classification],
            evidence: productionEvidence,
          },
          rootZone: {
            method: 'FAO-56',
            effectiveRootDepthCm,
            depletionFraction: root.tableDepletionFractionAtEtc5MmDay,
            cropCoefficient: root.cropCoefficient,
            initialStorageFraction: root.initialStorageFraction,
            status: 'qualified',
            missing: [],
            limitations: [root.depthInterpretation],
            evidence,
          },
          lifecycle: 'plant',
        }],
      });
      return { ...run, modelInputs };
    };
    const shallowRun = makeRun(root.fixedEffectiveRootDepthScenariosCm[0]!);
    const deepRun = makeRun(root.fixedEffectiveRootDepthScenariosCm[1]!);
    const traceRun = (run: typeof shallowRun) => {
      let state = createRun(run);
      const initialState = state;
      const steps = days.map((day) => {
        const previousState = state;
        const result = stepDay(previousState, day, run);
        state = result.state;
        return { previousCell: previousState.cells[cellKey]!, cell: state.cells[cellKey]!, result };
      });
      return { initialState, finalState: state, steps };
    };

    expect(config().cropModelVersion).toBeUndefined();
    expect(fixture.modelDispatch).toMatchObject({
      cropModelVersion: 'crop-model-v2',
      runInputsVersion: 'run-inputs-v2',
      parameterSetVersion: 'crop-parameters-v3',
      newRunDefaultChanged: false,
    });
    expect(root.fixedEffectiveRootDepthScenariosCm).toEqual([70, 150]);
    expect(root.adjustedDepletionFraction).toBe(0.36);
    expect(root.readilyAvailableWaterMm).toEqual([37.8, 81]);
    expect(Math.abs(cropModelV2.fao56AdjustedDepletionFraction(
      root.tableDepletionFractionAtEtc5MmDay,
      input.dailyEnvironment.etoMm * root.cropCoefficient,
    ) - root.adjustedDepletionFraction)).toBeLessThanOrEqual(
      tolerances.pAndRaw.maximumAbsoluteDeviation,
    );
    expect(days).toHaveLength(10);
    expect(days.every((day) => day.tMinC === 20 && day.tMaxC === 30
      && day.precipMm === 0 && day.etoMm === 5 && day.dliNaturalMol === 18 && day.gddBase10C === 15)).toBe(true);

    const normalizedShallowInputs = structuredClone(shallowRun.modelInputs);
    normalizedShallowInputs.cropParameters[0]!.rootZone.effectiveRootDepthCm = 150;
    expect(normalizedShallowInputs).toEqual(deepRun.modelInputs);
    expect({ ...shallowRun, modelInputs: undefined }).toEqual({ ...deepRun, modelInputs: undefined });

    type RootDepthExpectedScenario = typeof expected.shallow70cm | typeof expected.deep150cm;
    const traceScenario = (run: typeof shallowRun, scenario: RootDepthExpectedScenario) => {
      expect(run.cropModelVersion).toBe(fixture.modelDispatch.cropModelVersion);
      expect(run.startDate).toBe(input.crop.transplantDate);
      expect(run.dayCount).toBe(input.dailyEnvironment.dayCount);
      expect(run.scenario).toBe('baseline');
      expect(run.tempDeltaC).toBe(0);
      expect(run.precipMultiplier).toBe(1);
      expect(run.interventions).toEqual([]);
      expect(run.autoHarvest).toBe(false);
      expect(run.basePlan.cellM).toBe(input.crop.cellSizeM);
      expect(run.modelInputs.model).toBe(fixture.modelDispatch.runInputsVersion);
      expect(run.modelInputs.parameterSetVersion).toBe(fixture.modelDispatch.parameterSetVersion);
      expect(run.environment).toBeUndefined();
      expect(run.modelInputs.soil?.source).toBe('unknown');
      expect(run.modelInputs.soil?.awcMmPerCm).toBe(input.soil.awcMmPerCm);
      expect(run.modelInputs.soil?.organicMatterPct).toBe(input.soil.organicMatterPct);
      expect(run.modelInputs.crops.map((crop) => crop.id)).toEqual([input.crop.catalogCropId]);
      expect(run.modelInputs.cropParameters).toHaveLength(1);
      expect(run.modelInputs.qualification.status).toBe('qualified');
      expect(inspectRunModelSupport(run)).toMatchObject({ status: 'qualified', canReplay: true });
      const frozenParameter = run.modelInputs.cropParameters[0]!;
      expect(frozenParameter.thermal).toMatchObject({
        tBaseC: thermal.tBaseC,
        tUpperC: thermal.tUpperC,
        gddToMaturityCdays: thermal.gddToMaturityCdays,
        startEvents,
        sourceCitation: thermal.sourceCitation,
        sourceUrl: thermal.sourceUrl,
      });
      expect(frozenParameter.production).toMatchObject({
        equationFamily: production.equationFamily,
        rueGPerMjInterceptedPar: production.rueGPerMjInterceptedPar,
        initialDryMatterGPerM2: production.initialDryMatterGPerM2,
        interceptedParFraction: production.interceptedParFraction,
        harvestIndex: production.harvestIndex,
      });
      const effectiveRootDepthCm = frozenParameter.rootZone.effectiveRootDepthCm;
      if (effectiveRootDepthCm === null) throw new Error('Expected frozen effective root depth.');
      expect(effectiveRootDepthCm).toBe(scenario.tawMm / input.soil.awcMmPerCm);
      expect(frozenParameter.rootZone.depletionFraction).toBe(0.4);
      expect(frozenParameter.rootZone.cropCoefficient).toBe(1.2);
      expect(frozenParameter.rootZone.initialStorageFraction).toBe(1);
      expect(frozenParameter.rootZone.rootDevelopment).toBeUndefined();
      const capacityMm = run.modelInputs.soil!.awcMmPerCm! * effectiveRootDepthCm;
      expect(capacityMm).toBe(scenario.tawMm);
      expect(Math.abs(root.adjustedDepletionFraction * capacityMm - scenario.rawMm))
        .toBeLessThanOrEqual(tolerances.pAndRaw.maximumAbsoluteDeviation);

      const trace = traceRun(run);
      const initialCell = trace.initialState.cells[cellKey]!;
      expect(initialCell.rootZoneWaterMm).toBe(scenario.tawMm);
      expect(initialCell.rootZoneDepthCm).toBeUndefined();
      expect(initialCell.rootThermalCdays).toBeUndefined();
      expect(initialCell.rootZoneExpansionInflowMm).toBeUndefined();
      const firstStressDay = trace.steps.findIndex(({ cell }) => 1 - cell.stress.water < 1) + 1 || null;
      expect(firstStressDay).toBe(scenario.stressBeginsOnDay);

      const waterTolerance = tolerances.waterFluxStorageDepletionAndResidual.maximumAbsoluteDeviation;
      const ksTolerance = tolerances.stressCoefficient.maximumAbsoluteDeviation;
      const dmTolerance = tolerances.dailyDryMatterGain.maximumAbsoluteDeviation;
      const cumulativeTolerance = tolerances.cumulativeDryMatter.maximumAbsoluteDeviation;
      for (const [index, row] of scenario.dailyRows.entries()) {
        const { previousCell, cell, result } = trace.steps[index]!;
        const startDepletionMm = scenario.tawMm - previousCell.rootZoneWaterMm!;
        const endDepletionMm = scenario.tawMm - cell.rootZoneWaterMm!;
        const actualTranspirationMm = result.dayStats.waterUseMm;
        const dryMatterIncrementGPerM2 = cell.dryMatterGPerM2! - previousCell.dryMatterGPerM2!;
        expect(result.effectiveEnv.precipMm).toBe(0);
        expect(result.effectiveEnv.etoMm).toBe(5);
        expect(Math.abs(startDepletionMm - row.startDepletionMm)).toBeLessThanOrEqual(waterTolerance);
        expect(Math.abs((1 - cell.stress.water) - row.stressCoefficient)).toBeLessThanOrEqual(ksTolerance);
        expect(Math.abs(actualTranspirationMm - row.actualTranspirationMm)).toBeLessThanOrEqual(waterTolerance);
        expect(actualTranspirationMm).toBeLessThanOrEqual(6);
        expect(actualTranspirationMm).toBeLessThanOrEqual(previousCell.rootZoneWaterMm!);
        expect(Math.abs(cell.rootZoneWaterMm! - row.endStorageMm)).toBeLessThanOrEqual(waterTolerance);
        expect(Math.abs(endDepletionMm - row.endDepletionMm)).toBeLessThanOrEqual(waterTolerance);
        expect(Math.abs(dryMatterIncrementGPerM2 - row.dryMatterIncrementGPerM2)).toBeLessThanOrEqual(dmTolerance);
        expect(Math.abs(cell.dryMatterGPerM2! - row.cumulativeDryMatterGPerM2)).toBeLessThanOrEqual(cumulativeTolerance);
        expect(Math.abs(previousCell.rootZoneWaterMm! - actualTranspirationMm - cell.rootZoneWaterMm!))
          .toBeLessThanOrEqual(waterTolerance);
        expect(cell.rootZoneDepthCm).toBeUndefined();
        expect(cell.rootThermalCdays).toBeUndefined();
        expect(cell.rootZoneExpansionInflowMm).toBeUndefined();
        expect(cell.rootZoneResidualAccumulatedMm).toBeDefined();
        expect(Math.abs(cell.rootZoneResidualAccumulatedMm!)).toBeLessThanOrEqual(waterTolerance);
        expect(cell.rootZoneResidualMaxAbsMm).toBeDefined();
        expect(cell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(waterTolerance);
        expect(cell.rootZoneWaterMm).toBeGreaterThanOrEqual(0);
        expect(cell.stress.heat).toBe(0);
        expect(cell.stress.cold).toBe(0);
        expect(cell.stress.nitrogen).toBe(0);
        expect(cell.dead).not.toBe(true);
        expect(cell.harvested).not.toBe(true);
        expect(cell.biomassFrac).toBeLessThan(1);
        expect(result.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
      }
      return trace;
    };

    const shallowTrace = traceScenario(shallowRun, expected.shallow70cm);
    const deepTrace = traceScenario(deepRun, expected.deep150cm);
    expect(Math.abs(shallowTrace.finalState.cells[cellKey]!.dryMatterGPerM2! - 38.27543048469388))
      .toBeLessThanOrEqual(tolerances.cumulativeDryMatter.maximumAbsoluteDeviation);
    expect(deepTrace.finalState.cells[cellKey]!.dryMatterGPerM2).toBe(40);
    expect(shallowTrace.finalState.cells[cellKey]!.dryMatterGPerM2)
      .toBeLessThan(deepTrace.finalState.cells[cellKey]!.dryMatterGPerM2!);

    for (const [run, trace] of [[shallowRun, shallowTrace], [deepRun, deepTrace]] as const) {
      const result = simulateRun(run, days);
      const replay = simulateRun(run, days);
      expect(result.finalState).toEqual(trace.finalState);
      expect(result.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
      expect(result.summary).toMatchObject({
        daysSimulated: 10,
        totalYieldKg: 0,
        yieldBasis: 'dry-matter',
        modelQualification: { status: 'qualified' },
      });
      expect(replay.events).toEqual(result.events);
      expect(replay.finalState).toEqual(result.finalState);
      expect(replay.summary).toEqual(result.summary);
    }
  });

  it('reconciles v2 frozen AWC variant with positive root drainage', () => {
    const fixture = fao56V2AwcVariantFixture;
    const input = fixture.syntheticInputs;
    const expected = fixture.expected;
    const parent = fao56V2RootDrydownFixture.syntheticInputs;
    const cellKey = parent.crop.cell;
    const cellM = 0.25;
    const startDate = input.dailyEnvironment.startDate;
    const tomato = cropLibrary.find((entry) => entry.id === parent.crop.catalogCropId)!;
    const thermal = parent.crop.thermalParameters;
    const root = parent.rootZone;
    const production = parent.production;
    const requireCropStartEvent = (event: string): CropStartEvent => {
      if (event === 'direct-sowing' || event === 'transplanting') return event;
      throw new Error(`Unsupported crop start event in fixture: ${event}`);
    };
    const frozenStartEvents = thermal.startEvents.map(requireCropStartEvent);
    const cropStartEvent = requireCropStartEvent(parent.crop.startEvent);
    const frozenParameter: FrozenCropModelParametersV2 = {
      cropId: parent.crop.catalogCropId,
      thermal: {
        tBaseC: thermal.tBaseC,
        tUpperC: thermal.tUpperC,
        gddToMaturityCdays: [thermal.gddToMaturityCdays[0]!, thermal.gddToMaturityCdays[1]!],
        startEvents: frozenStartEvents,
        accumulationStart: thermal.accumulationStart,
        maturityEndpoint: thermal.maturityEndpoint,
        accumulationMethod: thermal.accumulationMethod,
        sourceCitation: thermal.sourceCitation,
        sourceUrl: thermal.sourceUrl,
      },
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: production.rueGPerMjInterceptedPar,
        initialDryMatterGPerM2: production.initialDryMatterGPerM2,
        interceptedParFraction: production.interceptedParFraction,
        harvestIndex: production.harvestIndex,
        status: 'qualified',
        missing: [...production.missing],
        limitations: [...production.limitations],
        evidence: { ...production.evidence },
      },
      rootZone: {
        method: 'FAO-56',
        effectiveRootDepthCm: input.soil.effectiveRootDepthCm,
        depletionFraction: root.tableDepletionFractionP,
        cropCoefficient: root.cropCoefficient,
        initialStorageFraction: input.rootZone.initialStorageFraction,
        status: 'qualified',
        missing: [...root.missing],
        limitations: [...root.limitations],
        evidence: { ...root.evidence },
      },
      lifecycle: 'plant',
    };
    const run = config({
      cropModelVersion: 'crop-model-v2',
      startDate,
      dayCount: input.dailyEnvironment.dayCount,
      autoHarvest: parent.crop.autoHarvest,
      basePlan: {
        ...config().basePlan,
        widthM: cellM,
        heightM: cellM,
        cellM,
        planting: { [cellKey]: parent.crop.catalogCropId },
        plantedAt: { [cellKey]: startDate },
      },
      cropStartEvents: { [cellKey]: cropStartEvent },
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: { awcMmPerCm: input.soil.awcMmPerCm, organicMatterPct: input.soil.organicMatterPct },
      crops: [tomato],
      cropParametersV2: [frozenParameter],
    });
    const drainageRun = { ...run, modelInputs };
    const drainageSoil = drainageRun.modelInputs.soil;
    if (!drainageSoil || typeof drainageSoil.awcMmPerCm !== 'number') {
      throw new Error('Expected frozen AWC variant inputs with a numeric AWC.');
    }
    const capacityMm = drainageSoil.awcMmPerCm * input.soil.effectiveRootDepthCm;

    expect(fixture.id).toBe('FAO56-V2-AWC-VARIANT-POSITIVE-DRAINAGE-SYNTHETIC-01');
    expect(fixture.parentFixture.id).toBe(fao56V2PositiveDrainageFixture.id);
    expect(parent.soil.awcMmPerCm).toBe(2);
    expect(parent.soil.effectiveRootDepthCm).toBe(80);
    expect(input.soil.awcMmPerCm).toBe(1.0);
    expect(input.soil.effectiveRootDepthCm).toBe(80);
    expect(input.soil.totalAvailableWaterMm).toBe(80);
    expect(input.soil.organicMatterPct).toBe(2.4);
    expect(input.rootZone.initialStorageFraction).toBe(0.99375);
    expect(input.rootZone.initialStorageMm).toBe(79.5);
    expect(input.dailyEnvironment).toMatchObject({
      startDate: '2026-10-01',
      dayCount: 1,
      intervalDays: 1,
      tMinC: 20,
      tMaxC: 30,
      precipMm: 5,
      etoMm: 0,
      dliNaturalMol: 18,
      gddBase10C: 15,
    });
    expect(fixture.frozenModelInputs.cropModelVersion).toBe('crop-model-v2');
    expect(drainageRun.cropModelVersion).toBe('crop-model-v2');
    expect(drainageRun.modelInputs.model).toBe('run-inputs-v2');
    expect(drainageRun.modelInputs.parameterSetVersion).toBe('crop-parameters-v3');
    expect(drainageRun.environment).toBeUndefined();
    expect(fixture.frozenModelInputs.climateRoute).toContain('no environment-v2');
    expect(drainageRun.modelInputs.soil?.source).toBe('unknown');
    expect(drainageRun.modelInputs.soil?.awcMmPerCm).toBe(1.0);
    expect(drainageRun.modelInputs.soil?.organicMatterPct).toBe(2.4);
    expect(input.rootZone.rootDevelopment).toContain('none');
    expect(drainageRun.modelInputs.cropParameters[0]?.rootZone.rootDevelopment).toBeUndefined();
    expect(drainageRun.modelInputs.cropParameters[0]?.rootZone.effectiveRootDepthCm).toBe(80);
    expect(drainageRun.modelInputs.cropParameters[0]?.rootZone.depletionFraction).toBe(0.4);
    expect(drainageRun.modelInputs.cropParameters[0]?.rootZone.cropCoefficient).toBe(1.2);
    expect(drainageRun.modelInputs.cropParameters[0]?.rootZone.initialStorageFraction).toBe(0.99375);
    expect(drainageRun.modelInputs.cropParameters[0]?.lifecycle).toBe(fixture.frozenModelInputs.cropLifecycle);
    expect(capacityMm).toBe(expected.calculation.capacityMm);
    expect(capacityMm).toBe(80);
    expect(drainageRun.modelInputs.qualification.status).toBe('qualified');

    const initialState = createRun(drainageRun);
    const initialCell = initialState.cells[cellKey]!;
    expect(cellKey).toBe(fixture.frozenModelInputs.cell);
    expect(Object.keys(drainageRun.basePlan.planting)).toHaveLength(fixture.frozenModelInputs.cellCount);
    expect(Object.keys(drainageRun.basePlan.planting)).toEqual([cellKey]);
    expect(drainageRun.dayCount).toBe(1);
    expect(initialCell.rootZoneWaterMm).toBeDefined();
    expect(initialCell.rootZoneWaterMm).toBe(expected.calculation.initialStorageMm);
    expect(initialCell.rootZoneWaterMm).toBe(79.5);
    expect(initialCell.rootZoneDepthCm).toBeUndefined();
    expect(initialCell.rootThermalCdays).toBeUndefined();
    expect(initialCell.rootZoneExpansionInflowMm).toBeUndefined();

    const depletionFraction = cropModelV2.fao56AdjustedDepletionFraction(
      input.rootZone.tableDepletionFractionP,
      input.rootZone.potentialTranspirationMmDay,
    );
    const directStep = stepFao56RootZone(
      { waterMm: input.rootZone.initialStorageMm },
      {
        awcMmPerCm: input.soil.awcMmPerCm,
        effectiveRootDepthCm: input.rootZone.effectiveRootDepthCm,
        depletionFraction,
      },
      {
        precipMm: input.rootZone.precipitationMm,
        irrigationMm: input.rootZone.irrigationMm,
        runoffMm: input.rootZone.runoffMm,
        capillaryRiseMm: input.rootZone.capillaryRiseMm,
        rootGrowthStorageMm: input.rootZone.rootGrowthStorageMm,
        potentialTranspirationMm: input.rootZone.potentialTranspirationMmDay,
      },
    );
    expect(Math.abs(directStep.deepDrainageMm - expected.directRootZoneStep.deepDrainageMm))
      .toBeLessThanOrEqual(1e-12);
    expect(directStep.capacityMm).toBe(80);
    expect(directStep.state.waterMm).toBe(expected.directRootZoneStep.finalWaterMm);
    expect(directStep.depletionMm).toBe(expected.calculation.endDepletionMm);
    expect(directStep.rootGrowthStorageMm).toBe(0);
    expect(directStep.actualTranspirationMm).toBe(expected.calculation.actualTranspirationMm);
    expect(directStep.residualMm).toBe(expected.directRootZoneStep.residualMm);
    expect(directStep.state.residualAccumulatedMm).toBeDefined();
    expect(directStep.state.residualAccumulatedMm).toBe(0);

    const environment = input.dailyEnvironment;
    const day = {
      date: environment.startDate,
      tMinC: environment.tMinC,
      tMaxC: environment.tMaxC,
      precipMm: environment.precipMm,
      etoMm: environment.etoMm,
      dliNaturalMol: environment.dliNaturalMol,
      gddBase10C: environment.gddBase10C,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    };
    const step = (() => {
      const rootStepSpy = vi.spyOn(cropModelV2, 'stepFao56RootZone');
      try {
        const result = stepDay(initialState, day, drainageRun);
        expect(rootStepSpy).toHaveBeenCalledTimes(1);
        const observedCall = rootStepSpy.mock.calls[0];
        if (!observedCall) throw new Error('Expected the stepDay root-zone call to be observed.');
        const [observedState, observedParameters, observedFluxes] = observedCall;
        expect(observedState.waterMm).toBe(79.5);
        expect(observedParameters.awcMmPerCm).toBe(1.0);
        expect(observedParameters.effectiveRootDepthCm).toBe(80);
        expect(observedParameters.depletionFraction).toBe(cropModelV2.fao56AdjustedDepletionFraction(0.4, 0));
        expect(observedFluxes.precipMm).toBe(5);
        expect(observedFluxes.irrigationMm).toBe(0);
        expect(observedFluxes.runoffMm).toBe(0);
        expect(observedFluxes.capillaryRiseMm).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(observedFluxes, 'capillaryRiseMm')).toBe(false);
        expect(observedFluxes.rootGrowthStorageMm).toBe(0);
        expect(observedFluxes.potentialTranspirationMm).toBe(0);
        return result;
      } finally {
        rootStepSpy.mockRestore();
      }
    })();
    const finalCell = step.state.cells[cellKey]!;
    expect(step.effectiveEnv.precipMm).toBe(5);
    expect(step.dayStats.waterUseMm).toBe(0);
    expect(finalCell.rootZoneWaterMm).toBe(80);
    expect(finalCell.rootZoneExpansionInflowMm).toBeUndefined();
    expect(finalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(finalCell.rootZoneResidualAccumulatedMm).toBe(0);
    expect(finalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(finalCell.rootZoneResidualMaxAbsMm).toBe(0);
    const inferredDrainageMm = initialCell.rootZoneWaterMm!
      + step.effectiveEnv.precipMm
      - step.dayStats.waterUseMm
      - finalCell.rootZoneWaterMm!
      - finalCell.rootZoneResidualAccumulatedMm!;
    expect(Math.abs(inferredDrainageMm - expected.calculation.deepDrainageMm)).toBeLessThanOrEqual(1e-12);

    const runResult = simulateRun(drainageRun, [day]);
    const runCell = runResult.finalState.cells[cellKey]!;
    expect(runResult.summary.daysSimulated).toBe(1);
    expect(runResult.summary.rainMm).toBe(5);
    expect(runResult.summary.waterUseMm).toBe(0);
    expect(runCell.rootZoneWaterMm).toBe(80);
    expect(runCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(runCell.rootZoneResidualAccumulatedMm).toBe(0);
    expect(runCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(runCell.rootZoneResidualMaxAbsMm).toBe(0);
    expect(runResult.summary.rootZoneBalanceResidualAccumulatedMm).toBeDefined();
    expect(runResult.summary.rootZoneBalanceResidualAccumulatedMm).toBe(0);
    expect(runResult.summary.rootZoneBalanceResidualMaxAbsMm).toBeDefined();
    expect(runResult.summary.rootZoneBalanceResidualMaxAbsMm).toBe(0);
    expect(runCell).toEqual(finalCell);
  });

  it('applies v2 transpiration before same-day drainage and replays exactly', () => {
    const fixture = fao56V2SameDayDrainageEtRerunFixture;
    const input = fixture.syntheticInputs;
    const expected = fixture.expected;
    const parentRecord = fao56V2RootDrydownFixture;
    const parent = parentRecord.syntheticInputs;
    const inherited = fixture.frozenInheritedInputs;
    const parentCrop = inherited.parentCropRouting;
    const runInputs = inherited.runConfig;
    const cell = fixture.frozenModelRoute.cell;
    const cellKey = cell.coordinate;
    const startDate = runInputs.startDate;
    const waterToleranceMm = 1e-12;
    const residualLimitMm = 1e-6;
    const expectWater = (actual: number, value: number) => {
      expect(Math.abs(actual - value)).toBeLessThanOrEqual(waterToleranceMm);
    };
    const tomatoSnapshot = inherited.tomatoCatalogSnapshot;
    const tomato = structuredClone(tomatoSnapshot.object) as (typeof cropLibrary)[number];
    const liveCatalogTomato = cropLibrary.find((entry) => entry.id === tomato.id);
    if (!liveCatalogTomato) throw new Error('Expected the registered tomato catalog entry.');
    const thermal = parentCrop.thermalParameters;
    const production = inherited.productionParameters;
    const root = inherited.rootZoneMetadata;
    const lifecycle = inherited.modelInputQualification.cropLifecycle;
    if (production.status !== 'qualified' || root.status !== 'qualified' || lifecycle !== 'plant') {
      throw new Error('The registered v2 routing qualification values are unsupported.');
    }
    const requireCropStartEvent = (event: string): CropStartEvent => {
      if (event === 'direct-sowing' || event === 'transplanting') return event;
      throw new Error(`Unsupported crop start event in fixture: ${event}`);
    };
    const cropStartEvent = requireCropStartEvent(runInputs.cropStartEvent);
    const frozenParameter: FrozenCropModelParametersV2 = {
      cropId: tomato.id,
      thermal: {
        tBaseC: thermal.tBaseC,
        tUpperC: thermal.tUpperC,
        gddToMaturityCdays: [thermal.gddToMaturityCdays[0]!, thermal.gddToMaturityCdays[1]!],
        startEvents: thermal.startEvents.map(requireCropStartEvent),
        accumulationStart: thermal.accumulationStart,
        maturityEndpoint: thermal.maturityEndpoint,
        accumulationMethod: thermal.accumulationMethod,
        sourceCitation: thermal.sourceCitation,
        sourceUrl: thermal.sourceUrl,
      },
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: production.rueGPerMjInterceptedPar,
        initialDryMatterGPerM2: production.initialDryMatterGPerM2,
        interceptedParFraction: production.interceptedParFraction,
        harvestIndex: production.harvestIndex,
        status: production.status,
        missing: [...production.missing],
        limitations: [...production.limitations],
        evidence: { ...production.evidence },
      },
      rootZone: {
        method: 'FAO-56',
        effectiveRootDepthCm: input.soil.effectiveRootDepthCm,
        depletionFraction: input.rootZoneMethod.tableDepletionFractionP,
        cropCoefficient: input.rootZoneMethod.cropCoefficient,
        initialStorageFraction: input.soil.initialStorageFraction,
        status: root.status,
        missing: [...root.missing],
        limitations: [...root.limitations],
        evidence: { ...root.evidence },
      },
      lifecycle,
    };
    const run = config({
      cropModelVersion: 'crop-model-v2',
      farmId: runInputs.farmId,
      startDate: runInputs.startDate,
      dayCount: runInputs.dayCount,
      seed: runInputs.seed,
      scenario: 'baseline',
      tempDeltaC: runInputs.tempDeltaC,
      precipMultiplier: runInputs.precipMultiplier,
      autoHarvest: runInputs.autoHarvest,
      interventions: [...runInputs.interventions],
      basePlan: structuredClone(runInputs.basePlan),
      cropStartEvents: { [cellKey]: cropStartEvent },
    });
    const sameDayRun = {
      ...run,
      modelInputs: freezeRunModelInputsV2(run, {
        soil: {
          awcMmPerCm: input.soil.awcMmPerCm,
          organicMatterPct: inherited.soilOrganicMatter.organicMatterPct,
        },
        crops: [tomato],
        cropParametersV2: [frozenParameter],
      }),
    };

    expect(fixture.id).toBe('FAO56-V2-SAME-DAY-DRAINAGE-ET-SYNTHETIC-RERUN-01');
    expect(fixture.supersedes).toMatchObject({
      id: 'FAO56-V2-SAME-DAY-DRAINAGE-ET-SYNTHETIC-01',
      path: 'quality/beta/evidence/fao56-v2-same-day-drainage-et-synthetic.json',
    });
    expect(fixture.parentFixture).toMatchObject({
      id: 'FAO56-V2-ADJUSTED-P-ROOT-DRYDOWN-SYNTHETIC-01',
      path: 'quality/beta/evidence/fao56-v2-root-drydown-integration-synthetic.json',
      gitCommit: '488fccc59ab2731d08faca8975c6aa9d9b881ce5',
      gitBlob: '2569f88987ce56230b0c47f2bf11b4ab0c6e710c',
      sha256: '1c2892db9cde9ba338c2a87a7db19683d93b7560106d240688756c4df7b8ae91',
    });
    expect(parentRecord.id).toBe(fixture.parentFixture.id);
    expect(inherited.parentFixtureId).toBe(parentRecord.id);
    expect(inherited.parentCropRouting).toEqual(parent.crop);
    expect(inherited.productionParameters).toEqual(parent.production);
    expect(inherited.rootZoneMetadata).toMatchObject({
      method: parent.rootZone.method,
      tableDepletionFractionP: parent.rootZone.tableDepletionFractionP,
      dailyPotentialETcAdjustment: parent.rootZone.dailyPotentialETcAdjustment,
      cropCoefficient: parent.rootZone.cropCoefficient,
      rootDevelopment: parent.rootZone.rootDevelopment,
      status: parent.rootZone.status,
      missing: parent.rootZone.missing,
      limitations: parent.rootZone.limitations,
      evidence: parent.rootZone.evidence,
    });
    expect(inherited.soilOrganicMatter.organicMatterPct).toBe(parent.soil.organicMatterPct);
    expect(inherited.nitrogenPoolInitialization).toEqual(parent.soil.nitrogenPoolInitialization);
    expect(inherited.modelInputQualification).toEqual({
      cropLifecycle: 'plant',
      productionStatus: 'qualified with explicit synthetic limitations',
      rootZoneStatus: 'qualified with explicit software-domain limitations',
      soilSourceTag: 'unknown',
    });
    expect(inherited.parentCropRouting).toMatchObject({
      catalogCropId: 1,
      slug: 'tomato',
      startEvent: 'transplanting',
      cultivar: 'not asserted; catalog identity routes the software fixture only',
      stressTraits: {
        category: 'vegetable',
        family: 'Solanaceae',
        minimumTemperatureC: 10,
        maximumTemperatureC: 32,
        nitrogenNeedClass: 'high',
        seasonalNitrogenNeedKgHa: 180,
      },
      thermalParameters: {
        tBaseC: 7.2,
        tUpperC: 33.3,
        gddToMaturityCdays: [1024, 1117],
        startEvents: ['transplanting'],
        accumulationStart: 'Transplanting at 3–5 true leaves',
        maturityEndpoint: 'First ripe harvest (four or more fruits show ripe color)',
        accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 6',
        sourceCitation: 'Andrews et al., OSU Extension EM 9305, Tomato degree-days, Table 6 (four cultivars; 1844–2010 °F·days).',
        sourceUrl: 'https://extension.oregonstate.edu/catalog/em-9305-vegetable-degree-models-introduction-farmers-gardeners',
        useLimit: 'Frozen only to keep the reducer crop active and below maturity for ten days; cultivar and maturity accuracy are not asserted.',
      },
      initialDryMatterGPerM2: 0,
      autoHarvest: false,
      cell: '0,0',
    });
    expect(inherited.productionParameters).toMatchObject({
      equationFamily: 'LINTUL-net-RUE',
      dailyLightIntegralMolM2: 18,
      parMolPerMj: 4.5,
      interceptedParFraction: 0.5,
      rueGPerMjInterceptedPar: 2,
      harvestIndex: 0.5,
      expectedUnstressedGainGPerM2Day: 4,
      initialDryMatterGPerM2: 0,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic production inputs used only to exercise v2 water-stress coupling to dry matter.'],
      evidence: {
        evidenceId: 'A05-FAO56-ADJUSTED-P-SYNTHETIC-PRODUCTION-INPUTS',
        sourceCitation: 'Synthetic software fixture; no biological claim.',
        sourceUrl: 'test-only:fao56-v2-adjusted-p-root-drydown',
        validDomain: 'Software integration only; not a source parameter, cultivar estimate, or prediction.',
      },
      purpose: 'Synthetic inputs isolate the existing v2 water-stress multiplier in the RUE production path; no crop parameter accuracy is claimed.',
    });
    expect(inherited.rootZoneMetadata).toMatchObject({
      method: 'FAO-56 root-zone balance as integrated by crop-model-v2',
      tableDepletionFractionP: 0.4,
      dailyPotentialETcAdjustment: 'clamp(pTable + 0.04 * (5 - ETc), 0.1, 0.8)',
      cropCoefficient: 1.2,
      rootDevelopment: 'none; fixed 80 cm effective depth',
      status: 'qualified',
      missing: [],
      limitations: [
        'This is a synthetic reducer integration, not a site soil profile or crop prediction.',
        'The source-derived Example 37 values are not used as reducer output expectations.',
      ],
      evidence: {
        evidenceId: 'FAO56-EXAMPLE37-ROOT-ZONE-ARITHMETIC-REPRODUCTION-01',
        sourceCitation: 'Allen et al. (1998), FAO-56, Chapter 8, Example 37, and the general depletion-fraction adjustment.',
        sourceUrl: 'https://www.fao.org/4/x0490e/x0490e0e.htm',
        validDomain: 'Synthetic v2 reducer inputs only; no Example 37 output reproduction or crop accuracy claim.',
      },
    });
    expect(inherited.soilOrganicMatter).toMatchObject({ organicMatterPct: 2.4, sourceTag: 'unknown' });
    expect(inherited.nitrogenPoolInitialization).toMatchObject({
      initialPoolKgHa: 600,
      dailyMineralizationKgHa: 1.2,
      seasonalNeedKgHa: 180,
      maximumDailyDemandKgHa: 2.417188899,
      conservativePoolLowerBoundAfterTenDaysKgHa: 587.7,
      stressThresholdMaximumKgHa: 216,
      expectedNitrogenStress: 0,
    });
    expect(inherited.dailyEnvironmentRouting).toMatchObject({
      startDate: '2026-10-01',
      dayCount: 1,
      intervalDays: 1,
      tMinC: 20,
      tMaxC: 30,
      precipMm: 5,
      etoMm: 5,
      dliNaturalMol: 18,
      gddBase10C: 15,
      runtimeProvenanceTags: 'default',
    });
    expect(runInputs).toMatchObject({
      cropModelVersion: 'crop-model-v2',
      farmId: 1,
      startDate: '2026-10-01',
      dayCount: 1,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      autoHarvest: false,
      interventions: [],
      cellKey: '0,0',
      cellSizeM: 0.25,
      cropStartEvent: 'transplanting',
      cropStartEvents: { '0,0': 'transplanting' },
      environmentSnapshot: 'omitted',
      basePlan: {
        farmId: 1,
        widthM: 0.25,
        heightM: 0.25,
        cellM: 0.25,
        allowOutsideBeds: false,
        ground: {},
        planting: { '0,0': 1 },
        plantedAt: { '0,0': '2026-10-01' },
        updatedAt: '2026-10-01',
      },
    });
    expect(run).toEqual({
      cropModelVersion: runInputs.cropModelVersion,
      farmId: runInputs.farmId,
      autoHarvest: runInputs.autoHarvest,
      basePlan: runInputs.basePlan,
      startDate: runInputs.startDate,
      dayCount: runInputs.dayCount,
      seed: runInputs.seed,
      scenario: runInputs.scenario,
      tempDeltaC: runInputs.tempDeltaC,
      precipMultiplier: runInputs.precipMultiplier,
      interventions: runInputs.interventions,
      cropStartEvents: runInputs.cropStartEvents,
    });
    expect(tomatoSnapshot).toMatchObject({
      sourcePath: 'src/data/crops.ts',
      gitCommit: '488fccc59ab2731d08faca8975c6aa9d9b881ce5',
      gitBlob: '4ac9c7700170c36e5a2eb7e32a98d3fbe6052350',
      sourceFileSha256: '7911ef22a7fc085a4aaf5f33df7136017a1ae9d1230b4652c5bcf878d903e087',
      objectSha256: '5437c81621b28f76d45671cf8058a388d43b23e5c1922a3e1dee8a3b268fa0ce',
    });
    expect(tomato).toEqual(tomatoSnapshot.object);
    expect(liveCatalogTomato).toEqual(tomatoSnapshot.object);
    expect(fixture.classification).toContain('synthetic');
    expect(fixture.priorAttemptDisposition).toContain('non-qualifying');
    expect(fixture.candidateResult).toBeNull();
    expect(fixture.candidateComparison).toBe(false);
    expect(fixture.measuredOutputComparison).toBe(false);
    expect(fixture.tolerances.oneStepWaterArithmetic).toContain('<=1e-12 mm');
    expect(fixture.tolerances.cellDayWaterBalanceResidual).toContain('<=1e-6 mm');
    expect(expected).toMatchObject({
      deepPercolationMm: 0,
      actualTranspirationMm: 6,
      endDepletionMm: 2,
      endStorageMm: 158,
      waterBalanceResidualMm: 0,
    });
    expect(fixture.frozenModelRoute).toMatchObject({
      cropModelVersion: 'crop-model-v2',
      runInputsVersion: 'run-inputs-v2',
      parameterSetVersion: 'crop-parameters-v3',
      climateRoute: 'one-day standard open-field v2 route; no environment-v2 snapshot',
      cell: { coordinate: '0,0', cropSlug: 'tomato', catalogCropId: 1 },
      rootDevelopment: 'none; fixed effective root depth, no root-growth storage inflow',
      soilSourceTag: 'unknown; hydraulic values are synthetic software inputs, not an observed profile',
    });
    expect(input.soil).toMatchObject({
      awcMmPerCm: 2,
      effectiveRootDepthCm: 80,
      totalAvailableWaterMm: 160,
      initialPlantAvailableStorageMm: 159,
      initialDepletionMm: 1,
      initialStorageFraction: 0.99375,
    });
    expect(input.rootZoneMethod).toMatchObject({
      tableDepletionFractionP: 0.4,
      tablePReferenceEtoMmDay: 5,
      referenceEvapotranspirationMm: 5,
      cropCoefficient: 1.2,
      potentialCropTranspirationMm: 6,
      adjustedDepletionFractionP: 0.36,
      readilyAvailableWaterMm: 57.6,
      startingStressCoefficientKs: 1,
    });
    expect(input.dailyForcing).toMatchObject({
      dayCount: 1,
      startDate: '2026-10-01',
      precipitationMm: 5,
      etoMm: 5,
      runoffMm: 0,
      irrigationMm: 0,
      capillaryRiseMm: 0,
      rootGrowthStorageMm: 0,
      potentialTranspirationMm: 6,
      ancillaryRoutingInputs: { tMinC: 20, tMaxC: 30, dliNaturalMol: 18, gddBase10C: 15 },
    });
    expect(inherited.dailyEnvironmentRouting).toMatchObject({
      startDate,
      dayCount: input.dailyForcing.dayCount,
      precipMm: input.dailyForcing.precipitationMm,
      etoMm: input.dailyForcing.etoMm,
      tMinC: input.dailyForcing.ancillaryRoutingInputs.tMinC,
      tMaxC: input.dailyForcing.ancillaryRoutingInputs.tMaxC,
      dliNaturalMol: input.dailyForcing.ancillaryRoutingInputs.dliNaturalMol,
      gddBase10C: input.dailyForcing.ancillaryRoutingInputs.gddBase10C,
      runtimeProvenanceTags: 'default',
    });
    expect(tomato.slug).toBe(cell.cropSlug);
    expect(sameDayRun.cropModelVersion).toBe(fixture.frozenModelRoute.cropModelVersion);
    expect(sameDayRun.modelInputs.model).toBe(fixture.frozenModelRoute.runInputsVersion);
    expect(sameDayRun.modelInputs.parameterSetVersion).toBe(fixture.frozenModelRoute.parameterSetVersion);
    expect(sameDayRun.modelInputs.soil).toMatchObject({
      source: 'unknown',
      awcMmPerCm: 2,
      organicMatterPct: 2.4,
    });
    expect(sameDayRun.modelInputs.crops).toEqual([tomato]);
    expect(sameDayRun.modelInputs.cropParameters[0]).toEqual(frozenParameter);
    expect(sameDayRun.environment).toBeUndefined();
    expect(Object.keys(sameDayRun.basePlan.planting)).toEqual([cellKey]);

    const initialState = createRun(sameDayRun);
    const initialCell = initialState.cells[cellKey]!;
    expect(initialCell.nitrogenKgHa).toBe(inherited.nitrogenPoolInitialization.initialPoolKgHa);
    expect(input.soil.awcMmPerCm * input.soil.effectiveRootDepthCm).toBe(input.soil.totalAvailableWaterMm);
    expect(initialCell.rootZoneWaterMm).toBe(input.soil.initialPlantAvailableStorageMm);
    expect(initialCell.rootZoneDepthCm).toBeUndefined();
    expect(initialCell.rootZoneExpansionInflowMm).toBeUndefined();

    const adjustedP = cropModelV2.fao56AdjustedDepletionFraction(
      input.rootZoneMethod.tableDepletionFractionP,
      input.rootZoneMethod.potentialCropTranspirationMm,
    );
    const expectedAdjustedP = Math.max(
      0.1,
      Math.min(0.8, input.rootZoneMethod.tableDepletionFractionP
        + 0.04 * (5 - input.rootZoneMethod.potentialCropTranspirationMm)),
    );
    expect(adjustedP).toBe(expectedAdjustedP);
    expect(frozenParameter.rootZone.depletionFraction).toBe(input.rootZoneMethod.tableDepletionFractionP);

    const directStep = stepFao56RootZone(
      { waterMm: input.soil.initialPlantAvailableStorageMm },
      {
        awcMmPerCm: input.soil.awcMmPerCm,
        effectiveRootDepthCm: input.soil.effectiveRootDepthCm,
        depletionFraction: adjustedP,
      },
      {
        precipMm: input.dailyForcing.precipitationMm,
        irrigationMm: input.dailyForcing.irrigationMm,
        runoffMm: input.dailyForcing.runoffMm,
        capillaryRiseMm: input.dailyForcing.capillaryRiseMm,
        rootGrowthStorageMm: input.dailyForcing.rootGrowthStorageMm,
        potentialTranspirationMm: input.dailyForcing.potentialTranspirationMm,
      },
    );
    expectWater(directStep.capacityMm, input.soil.totalAvailableWaterMm);
    expectWater(directStep.readilyAvailableWaterMm, input.rootZoneMethod.readilyAvailableWaterMm);
    expect(directStep.stressCoefficient).toBe(input.rootZoneMethod.startingStressCoefficientKs);
    expectWater(directStep.deepDrainageMm, expected.deepPercolationMm);
    expectWater(directStep.actualTranspirationMm, expected.actualTranspirationMm);
    expectWater(directStep.depletionMm, expected.endDepletionMm);
    expectWater(directStep.state.waterMm, expected.endStorageMm);
    expectWater(directStep.residualMm, expected.waterBalanceResidualMm);
    expectWater(directStep.state.residualAccumulatedMm!, expected.waterBalanceResidualMm);

    const forcing = input.dailyForcing;
    const day = {
      date: forcing.startDate,
      tMinC: forcing.ancillaryRoutingInputs.tMinC,
      tMaxC: forcing.ancillaryRoutingInputs.tMaxC,
      precipMm: forcing.precipitationMm,
      etoMm: forcing.etoMm,
      dliNaturalMol: forcing.ancillaryRoutingInputs.dliNaturalMol,
      gddBase10C: forcing.ancillaryRoutingInputs.gddBase10C,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    };
    const stepped = (() => {
      const rootStepSpy = vi.spyOn(cropModelV2, 'stepFao56RootZone');
      try {
        const result = stepDay(initialState, day, sameDayRun);
        expect(rootStepSpy).toHaveBeenCalledTimes(1);
        const observedCall = rootStepSpy.mock.calls[0];
        if (!observedCall) throw new Error('Expected the stepDay root-zone call to be observed.');
        const [observedState, observedParameters, observedFluxes] = observedCall;
        expect(observedState.waterMm).toBe(input.soil.initialPlantAvailableStorageMm);
        expect(observedParameters.awcMmPerCm).toBe(input.soil.awcMmPerCm);
        expect(observedParameters.effectiveRootDepthCm).toBe(input.soil.effectiveRootDepthCm);
        expect(observedParameters.depletionFraction).toBe(adjustedP);
        expect(observedFluxes.precipMm).toBe(forcing.precipitationMm);
        expect(observedFluxes.irrigationMm).toBe(forcing.irrigationMm);
        expect(observedFluxes.runoffMm).toBe(forcing.runoffMm);
        expect(observedFluxes.capillaryRiseMm ?? 0).toBe(forcing.capillaryRiseMm);
        expect(observedFluxes.rootGrowthStorageMm).toBe(forcing.rootGrowthStorageMm);
        expect(observedFluxes.potentialTranspirationMm).toBe(forcing.potentialTranspirationMm);
        const observedResult = rootStepSpy.mock.results[0];
        if (!observedResult || observedResult.type !== 'return') {
          throw new Error('Expected the observed root-zone call to return normally.');
        }
        return { result, rootStep: observedResult.value };
      } finally {
        rootStepSpy.mockRestore();
      }
    })();
    const finalCell = stepped.result.state.cells[cellKey]!;
    expect(stepped.result.effectiveEnv.precipMm).toBe(forcing.precipitationMm);
    expectWater(stepped.result.dayStats.waterUseMm, expected.actualTranspirationMm);
    expectWater(stepped.rootStep.deepDrainageMm, expected.deepPercolationMm);
    expectWater(stepped.rootStep.actualTranspirationMm, expected.actualTranspirationMm);
    expectWater(finalCell.rootZoneWaterMm!, expected.endStorageMm);
    expectWater(input.soil.totalAvailableWaterMm - finalCell.rootZoneWaterMm!, expected.endDepletionMm);
    expect(finalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(Math.abs(finalCell.rootZoneResidualAccumulatedMm!)).toBeLessThanOrEqual(residualLimitMm);
    expect(finalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(finalCell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(residualLimitMm);
    expect(stepped.result.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);

    const runResult = simulateRun(sameDayRun, [day]);
    const replay = simulateRun(structuredClone(sameDayRun), [structuredClone(day)]);
    const runCell = runResult.finalState.cells[cellKey]!;
    expect(runResult.summary.daysSimulated).toBe(1);
    expect(runResult.summary.rainMm).toBe(5);
    expectWater(runResult.summary.waterUseMm, expected.actualTranspirationMm);
    expectWater(runCell.rootZoneWaterMm!, expected.endStorageMm);
    expect(runCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expect(Math.abs(runCell.rootZoneResidualAccumulatedMm!)).toBeLessThanOrEqual(residualLimitMm);
    expect(runCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expect(runCell.rootZoneResidualMaxAbsMm!).toBeLessThanOrEqual(residualLimitMm);
    expect(runResult.summary.rootZoneBalanceResidualAccumulatedMm).toBeDefined();
    expect(Math.abs(runResult.summary.rootZoneBalanceResidualAccumulatedMm!)).toBeLessThanOrEqual(residualLimitMm);
    expect(runResult.summary.rootZoneBalanceResidualMaxAbsMm).toBeDefined();
    expect(runResult.summary.rootZoneBalanceResidualMaxAbsMm!).toBeLessThanOrEqual(residualLimitMm);
    expect(runResult.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(runResult.finalState).toEqual(stepped.result.state);
    expect(replay.events).toEqual(runResult.events);
    expect(replay.finalState).toEqual(runResult.finalState);
    expect(replay.summary).toEqual(runResult.summary);
  });

  it('caps v2 actual uptake at frozen available root-zone water', () => {
    const fixture = fao56V2AvailableWaterCapFixture;
    const input = fixture.syntheticInputs;
    const expected = fixture.expected.calculation;
    const directExpected = fixture.expected.directRootZoneStep.expected;
    const waterTolerance = fixture.tolerances.waterArithmetic.maximumAbsoluteDeviation;
    const dimensionlessTolerance = fixture.tolerances.dimensionlessArithmetic.maximumAbsoluteDeviation;
    const cellKey = input.run.cellKey;
    const scenario = input.run.scenario;
    if (scenario !== 'baseline') throw new Error('Expected the preregistered baseline scenario.');
    const crop = cropLibrary.find((entry) => entry.id === input.cropSnapshot.id);
    if (!crop) throw new Error('Expected the preregistered tomato catalog entry.');
    expect(fixture.id).toBe('FAO56-V2-AVAILABLE-WATER-CAP-SYNTHETIC-01');
    expect(crop).toEqual(input.cropSnapshot);
    expect(input.cropSnapshotSourceMetadata).toBe('src/data/crops.ts cropLibrary entry id 1; frozen for replay identity only');
    expect(input.thermalParameters).toMatchObject({
      tBaseC: 7.2,
      tUpperC: 33.3,
      gddToMaturityCdays: [1024, 1117],
      startEvents: ['transplanting'],
      accumulationStart: 'Transplanting at 3–5 true leaves',
      maturityEndpoint: 'First ripe harvest (four or more fruits show ripe color)',
      accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 6',
    });
    expect(input.soil).toMatchObject({ awcMmPerCm: 1, organicMatterPct: 2.4, source: 'unknown' });
    expect(input.rootZoneParameters).toMatchObject({
      method: 'FAO-56',
      effectiveRootDepthCm: 5,
      rootDevelopment: 'none; static effective depth and zero root-growth storage',
      tableDepletionFractionP: 0.4,
      cropCoefficient: 1.2,
      initialStorageFraction: 0.2,
      initialStorageMm: 1,
      lifecycle: 'plant',
    });
    expect(input.waterFluxesMm).toMatchObject({
      precipitation: 0,
      irrigation: 0,
      runoff: 0,
      capillaryRise: 'omitted at reducer boundary; defaults to 0',
      rootGrowthStorage: 0,
      referenceEvapotranspiration: 5,
      cropCoefficient: 1.2,
      potentialTranspiration: 6,
    });
    expect(input.dailyEnvironment).toMatchObject({
      date: '2026-10-01',
      tMinC: 20,
      tMaxC: 30,
      precipMm: 0,
      etoMm: 5,
      dliNaturalMol: 18,
      gddBase10C: 15,
    });
    expect(input.run).toMatchObject({
      farmId: 1,
      startDate: '2026-10-01',
      dayCount: 1,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      autoHarvest: false,
      interventions: [],
      cellKey: '0,0',
      cellSizeM: 0.25,
      cropStartEvent: 'transplanting',
      cropStartEvents: { '0,0': 'transplanting' },
      environmentClimateSnapshot: 'omitted',
    });
    expect(fixture.modelDispatch).toMatchObject({
      cropModelVersion: 'crop-model-v2',
      runInputsVersion: 'run-inputs-v2',
      parameterSetVersion: 'crop-parameters-v3',
      climateRoute: 'standard open-field one-cell route; no environment-v2 snapshot',
    });

    const requireCropStartEvent = (event: string): CropStartEvent => {
      if (event === 'direct-sowing' || event === 'transplanting') return event;
      throw new Error(`Unsupported crop start event in fixture: ${event}`);
    };
    const frozenThermal = {
      tBaseC: input.thermalParameters.tBaseC,
      tUpperC: input.thermalParameters.tUpperC,
      gddToMaturityCdays: [
        input.thermalParameters.gddToMaturityCdays[0]!,
        input.thermalParameters.gddToMaturityCdays[1]!,
      ] as [number, number],
      startEvents: input.thermalParameters.startEvents.map(requireCropStartEvent),
      accumulationStart: input.thermalParameters.accumulationStart,
      maturityEndpoint: input.thermalParameters.maturityEndpoint,
      accumulationMethod: input.thermalParameters.accumulationMethod,
      sourceCitation: input.thermalParameters.sourceCitation,
      sourceUrl: input.thermalParameters.sourceUrl,
    };
    const frozenParameter: FrozenCropModelParametersV2 = {
      cropId: input.cropSnapshot.id,
      thermal: frozenThermal,
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: input.productionParameters.rueGPerMjInterceptedPar,
        initialDryMatterGPerM2: input.productionParameters.initialDryMatterGPerM2,
        interceptedParFraction: input.productionParameters.interceptedParFraction,
        harvestIndex: input.productionParameters.harvestIndex,
        status: 'qualified',
        missing: [...input.productionParameters.missing],
        limitations: [...input.productionParameters.limitations],
        evidence: { ...input.productionParameters.evidence },
      },
      rootZone: {
        method: 'FAO-56',
        effectiveRootDepthCm: input.rootZoneParameters.effectiveRootDepthCm,
        depletionFraction: input.rootZoneParameters.tableDepletionFractionP,
        cropCoefficient: input.rootZoneParameters.cropCoefficient,
        initialStorageFraction: input.rootZoneParameters.initialStorageFraction,
        status: 'qualified',
        missing: [...input.rootZoneParameters.missing],
        limitations: [...input.rootZoneParameters.limitations],
        evidence: { ...input.rootZoneParameters.evidence },
      },
      lifecycle: 'plant',
    };
    expect(frozenThermal).toEqual(input.thermalParameters);
    expect(frozenParameter.production).toMatchObject(input.productionParameters);
    expect(frozenParameter.rootZone).toMatchObject({
      effectiveRootDepthCm: 5,
      depletionFraction: 0.4,
      cropCoefficient: 1.2,
      initialStorageFraction: 0.2,
    });
    expect(frozenParameter.lifecycle).toBe(input.rootZoneParameters.lifecycle);

    const run = config({
      cropModelVersion: 'crop-model-v2',
      farmId: input.run.farmId,
      startDate: input.run.startDate,
      dayCount: input.run.dayCount,
      seed: input.run.seed,
      scenario,
      tempDeltaC: input.run.tempDeltaC,
      precipMultiplier: input.run.precipMultiplier,
      autoHarvest: input.run.autoHarvest,
      interventions: [...input.run.interventions],
      basePlan: {
        ...config().basePlan,
        widthM: input.run.cellSizeM,
        heightM: input.run.cellSizeM,
        cellM: input.run.cellSizeM,
        planting: { [cellKey]: crop.id },
        plantedAt: { [cellKey]: input.run.startDate },
      },
      cropStartEvents: { [cellKey]: requireCropStartEvent(input.run.cropStartEvent) },
    });
    const modelInputs = freezeRunModelInputsV2(run, {
      soil: {
        awcMmPerCm: input.soil.awcMmPerCm,
        organicMatterPct: input.soil.organicMatterPct,
      },
      crops: [crop],
      cropParametersV2: [frozenParameter],
    });
    const uptakeRun = { ...run, modelInputs };
    expect(uptakeRun.cropModelVersion).toBe(fixture.modelDispatch.cropModelVersion);
    expect(uptakeRun.modelInputs.model).toBe(fixture.modelDispatch.runInputsVersion);
    expect(uptakeRun.modelInputs.parameterSetVersion).toBe(fixture.modelDispatch.parameterSetVersion);
    expect(uptakeRun.environment).toBeUndefined();
    expect(uptakeRun).toMatchObject({
      farmId: input.run.farmId,
      startDate: input.run.startDate,
      dayCount: input.run.dayCount,
      seed: input.run.seed,
      scenario: input.run.scenario,
      tempDeltaC: input.run.tempDeltaC,
      precipMultiplier: input.run.precipMultiplier,
      autoHarvest: input.run.autoHarvest,
      interventions: input.run.interventions,
    });
    expect(uptakeRun.basePlan.planting).toEqual({ [cellKey]: input.cropSnapshot.id });
    expect(Object.keys(uptakeRun.basePlan.planting)).toHaveLength(1);
    expect(uptakeRun.dayCount).toBe(1);
    expect(uptakeRun.basePlan).toMatchObject({
      widthM: 0.25,
      heightM: 0.25,
      cellM: 0.25,
      plantedAt: { '0,0': '2026-10-01' },
    });
    expect(uptakeRun.modelInputs.soil).toMatchObject({
      awcMmPerCm: 1,
      organicMatterPct: 2.4,
      source: 'unknown',
    });
    expect(uptakeRun.modelInputs.crops[0]).toEqual(input.cropSnapshot);
    expect(uptakeRun.modelInputs.cropParameters[0]?.thermal).toEqual(input.thermalParameters);
    expect(uptakeRun.modelInputs.cropParameters[0]?.rootZone).toMatchObject({
      effectiveRootDepthCm: 5,
      depletionFraction: 0.4,
      cropCoefficient: 1.2,
      initialStorageFraction: 0.2,
    });
    expect(uptakeRun.modelInputs.cropParameters[0]?.rootZone.rootDevelopment).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(
      uptakeRun.modelInputs.cropParameters[0]?.rootZone,
      'rootDevelopment',
    )).toBe(false);
    expect(uptakeRun.modelInputs.qualification.status).toBe('qualified');
    expect(inspectRunModelSupport(uptakeRun)).toMatchObject({ status: 'qualified', canReplay: true });

    const initialState = createRun(uptakeRun);
    const initialCell = initialState.cells[cellKey]!;
    const capacityMm = input.soil.awcMmPerCm * input.rootZoneParameters.effectiveRootDepthCm;
    expect(capacityMm).toBe(expected.capacityMm);
    expect(initialCell.rootZoneWaterMm).toBeDefined();
    expect(initialCell.rootZoneWaterMm).toBe(expected.initialStorageMm);
    expect(initialCell.rootZoneDepthCm).toBeUndefined();
    expect(initialCell.rootThermalCdays).toBeUndefined();
    expect(initialCell.rootZoneExpansionInflowMm).toBeUndefined();

    const environment = input.dailyEnvironment;
    const day = {
      date: environment.date,
      tMinC: environment.tMinC,
      tMaxC: environment.tMaxC,
      precipMm: environment.precipMm,
      etoMm: environment.etoMm,
      dliNaturalMol: environment.dliNaturalMol,
      gddBase10C: environment.gddBase10C,
      provenance: {
        tMinC: 'default' as const,
        tMaxC: 'default' as const,
        precipMm: 'default' as const,
        etoMm: 'default' as const,
        dliNaturalMol: 'default' as const,
      },
    };
    const adjustedP = cropModelV2.fao56AdjustedDepletionFraction(
      input.rootZoneParameters.tableDepletionFractionP,
      input.waterFluxesMm.potentialTranspiration,
    );
    expect(Math.abs(adjustedP - expected.adjustedDepletionFractionP)).toBeLessThanOrEqual(dimensionlessTolerance);
    const directStep = stepFao56RootZone(
      { waterMm: expected.initialStorageMm },
      {
        awcMmPerCm: input.soil.awcMmPerCm,
        effectiveRootDepthCm: input.rootZoneParameters.effectiveRootDepthCm,
        depletionFraction: adjustedP,
      },
      {
        precipMm: input.waterFluxesMm.precipitation,
        irrigationMm: input.waterFluxesMm.irrigation,
        runoffMm: input.waterFluxesMm.runoff,
        rootGrowthStorageMm: input.waterFluxesMm.rootGrowthStorage,
        potentialTranspirationMm: input.waterFluxesMm.potentialTranspiration,
      },
    );
    const expectWater = (actual: number, expectedValue: number) => {
      expect(Math.abs(actual - expectedValue)).toBeLessThanOrEqual(waterTolerance);
    };
    const expectDimensionless = (actual: number, expectedValue: number) => {
      expect(Math.abs(actual - expectedValue)).toBeLessThanOrEqual(dimensionlessTolerance);
    };
    expectWater(directStep.capacityMm, expected.capacityMm);
    expectWater(directStep.state.waterMm, directExpected.stateWaterMm);
    expectWater(directStep.readilyAvailableWaterMm, expected.readilyAvailableWaterMm);
    expectDimensionless(directStep.stressCoefficient, directExpected.stressCoefficient);
    expectWater(directStep.actualTranspirationMm, directExpected.actualTranspirationMm);
    expectWater(directStep.deepDrainageMm, directExpected.deepDrainageMm);
    expectWater(directStep.depletionMm, directExpected.depletionMm);
    expectWater(directStep.residualMm, directExpected.residualMm);
    expect(directStep.state.residualAccumulatedMm).toBeDefined();
    expectWater(directStep.state.residualAccumulatedMm!, directExpected.residualMm);
    const stressedPotentialDemandMm = input.waterFluxesMm.potentialTranspiration * directStep.stressCoefficient;
    expectWater(stressedPotentialDemandMm, expected.ksAdjustedPotentialTranspirationMm);
    expect(stressedPotentialDemandMm).toBeGreaterThan(input.rootZoneParameters.initialStorageMm);
    expect(directStep.actualTranspirationMm).toBeLessThanOrEqual(input.rootZoneParameters.initialStorageMm);

    const step = (() => {
      const rootStepSpy = vi.spyOn(cropModelV2, 'stepFao56RootZone');
      try {
        const result = stepDay(initialState, day, uptakeRun);
        expect(rootStepSpy).toHaveBeenCalledTimes(1);
        const observedCall = rootStepSpy.mock.calls[0];
        if (!observedCall) throw new Error('Expected the stepDay root-zone call to be observed.');
        const [observedState, observedParameters, observedFluxes] = observedCall;
        expect(observedState.waterMm).toBe(expected.initialStorageMm);
        expect(observedParameters.awcMmPerCm).toBe(input.soil.awcMmPerCm);
        expect(observedParameters.effectiveRootDepthCm).toBe(input.rootZoneParameters.effectiveRootDepthCm);
        expectDimensionless(observedParameters.depletionFraction, expected.adjustedDepletionFractionP);
        expect(observedFluxes.precipMm).toBe(0);
        expect(observedFluxes.irrigationMm).toBe(0);
        expect(observedFluxes.runoffMm).toBe(0);
        expect(observedFluxes.capillaryRiseMm).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(observedFluxes, 'capillaryRiseMm')).toBe(false);
        expect(observedFluxes.rootGrowthStorageMm).toBe(0);
        expect(observedFluxes.potentialTranspirationMm).toBe(6);
        const observedResult = rootStepSpy.mock.results[0]?.value;
        if (!observedResult) throw new Error('Expected the original root-zone reducer to return a result.');
        expectDimensionless(observedResult.stressCoefficient, expected.stressCoefficientKs);
        expectWater(observedResult.actualTranspirationMm, expected.actualTranspirationMm);
        expectWater(observedResult.state.waterMm, expected.finalStorageMm);
        expectWater(observedResult.deepDrainageMm, expected.deepDrainageMm);
        expectWater(observedResult.residualMm, expected.waterBalanceResidualMm);
        return result;
      } finally {
        rootStepSpy.mockRestore();
      }
    })();
    const finalCell = step.state.cells[cellKey]!;
    expect(step.effectiveEnv.etoMm).toBe(5);
    expect(step.effectiveEnv.precipMm).toBe(0);
    expect(step.effectiveEnv).toMatchObject({
      date: environment.date,
      tMinC: environment.tMinC,
      tMaxC: environment.tMaxC,
      precipMm: environment.precipMm,
      etoMm: environment.etoMm,
      dliNaturalMol: environment.dliNaturalMol,
      gddBase10C: environment.gddBase10C,
    });
    expectWater(step.dayStats.waterUseMm, expected.actualTranspirationMm);
    expect(finalCell.rootZoneWaterMm).toBeDefined();
    expectWater(finalCell.rootZoneWaterMm!, expected.finalStorageMm);
    expect(finalCell.rootZoneWaterMm).toBeGreaterThanOrEqual(0);
    expect(finalCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expectWater(finalCell.rootZoneResidualAccumulatedMm!, expected.waterBalanceResidualMm);
    expect(finalCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expectWater(finalCell.rootZoneResidualMaxAbsMm!, expected.waterBalanceResidualMm);
    expect(step.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);

    const runResult = simulateRun(uptakeRun, [day]);
    const replay = simulateRun(uptakeRun, [day]);
    const runCell = runResult.finalState.cells[cellKey]!;
    expect(runResult.summary.daysSimulated).toBe(1);
    expect(runResult.summary.rainMm).toBe(0);
    expectWater(runResult.summary.waterUseMm, expected.actualTranspirationMm);
    expect(runCell.rootZoneWaterMm).toBeDefined();
    expectWater(runCell.rootZoneWaterMm!, expected.finalStorageMm);
    expect(runCell.rootZoneResidualAccumulatedMm).toBeDefined();
    expectWater(runCell.rootZoneResidualAccumulatedMm!, expected.waterBalanceResidualMm);
    expect(runCell.rootZoneResidualMaxAbsMm).toBeDefined();
    expectWater(runCell.rootZoneResidualMaxAbsMm!, expected.waterBalanceResidualMm);
    expect(runResult.summary.rootZoneBalanceResidualAccumulatedMm).toBeDefined();
    expectWater(runResult.summary.rootZoneBalanceResidualAccumulatedMm!, expected.waterBalanceResidualMm);
    expect(runResult.summary.rootZoneBalanceResidualMaxAbsMm).toBeDefined();
    expectWater(runResult.summary.rootZoneBalanceResidualMaxAbsMm!, expected.waterBalanceResidualMm);
    expect(runResult.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(runResult.finalState).toEqual(step.state);
    expect(replay.events).toEqual(runResult.events);
    expect(replay.finalState).toEqual(runResult.finalState);
    expect(replay.summary).toEqual(runResult.summary);
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

    const firstEligibleDayIndex = autoHarvestDisabled.summary.harvestReadyDay! + 1;
    const firstEligibleDate = sunnySeries[firstEligibleDayIndex]!.date;
    expect(firstEligibleDayIndex).toBe(63);
    expect(firstEligibleDate).toBe('2026-12-03');
    const duplicateHarvestRequest = {
      kind: 'harvest' as const,
      date: firstEligibleDate,
      cell: '0,0',
    };
    const duplicateManualHarvestRun = {
      ...autoHarvestDisabledRun,
      interventions: [duplicateHarvestRequest, { ...duplicateHarvestRequest }],
    };
    expect(duplicateManualHarvestRun.interventions).toEqual([
      duplicateHarvestRequest,
      duplicateHarvestRequest,
    ]);
    const duplicateManualHarvest = simulateRun(duplicateManualHarvestRun, sunnySeries);
    const duplicateManualHarvestReplay = simulateRun(duplicateManualHarvestRun, sunnySeries);
    const duplicateHarvestEvents = duplicateManualHarvest.events.filter((event) => event.kind === 'harvested');
    expect(duplicateHarvestEvents).toHaveLength(1);
    expect(duplicateHarvestEvents[0]).toMatchObject({
      dayIndex: firstEligibleDayIndex,
      date: firstEligibleDate,
      kind: 'harvested',
      cell: '0,0',
    });
    const duplicateHarvestEvent = duplicateHarvestEvents[0];
    if (duplicateHarvestEvent?.kind === 'harvested') {
      expect(Math.abs(duplicateHarvestEvent.data.yieldKg - 0.007875)).toBeLessThanOrEqual(1e-12);
    }
    expect(duplicateManualHarvest.finalState.cells['0,0']?.harvested).toBe(true);
    expect(duplicateManualHarvest.summary.totalYieldKg).toBe(0.01);
    expect(duplicateManualHarvest.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(duplicateManualHarvestReplay.events).toEqual(duplicateManualHarvest.events);
    expect(duplicateManualHarvestReplay.finalState).toEqual(duplicateManualHarvest.finalState);
    expect(duplicateManualHarvestReplay.summary).toEqual(duplicateManualHarvest.summary);

    const earlyHarvestDate = sunnySeries[0]!.date;
    expect(earlyHarvestDate).toBe('2026-10-01');
    const earlyHarvestRequest = {
      kind: 'harvest' as const,
      date: earlyHarvestDate,
      cell: '0,0',
    };
    const eligibleHarvestRequest = {
      ...earlyHarvestRequest,
      date: firstEligibleDate,
    };
    const earlyHarvestRetryRun = {
      ...autoHarvestDisabledRun,
      interventions: [earlyHarvestRequest, eligibleHarvestRequest],
    };
    expect(earlyHarvestRetryRun.autoHarvest).toBe(false);
    expect(earlyHarvestRetryRun.interventions).toEqual([
      earlyHarvestRequest,
      eligibleHarvestRequest,
    ]);

    const earlyHarvestTick = stepDay(createRun(earlyHarvestRetryRun), sunnySeries[0]!, earlyHarvestRetryRun);
    const earlyRejectedEvents = earlyHarvestTick.events.filter((event) => event.kind === 'harvest-too-early');
    expect(earlyRejectedEvents).toHaveLength(1);
    expect(earlyRejectedEvents[0]).toMatchObject({
      dayIndex: 0,
      date: earlyHarvestDate,
      kind: 'harvest-too-early',
      cell: '0,0',
      data: { biomass: 0, minimum: 0.8 },
    });
    expect(earlyHarvestTick.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(earlyHarvestTick.state.cells['0,0']?.harvested ?? false).toBe(false);

    const earlyHarvestRetry = simulateRun(earlyHarvestRetryRun, sunnySeries);
    const earlyHarvestRetryReplay = simulateRun(earlyHarvestRetryRun, sunnySeries);
    const retryEarlyEvents = earlyHarvestRetry.events.filter((event) => event.kind === 'harvest-too-early');
    const retryHarvestedEvents = earlyHarvestRetry.events.filter((event) => event.kind === 'harvested');
    expect(retryEarlyEvents).toHaveLength(1);
    expect(retryEarlyEvents[0]).toMatchObject({
      dayIndex: 0,
      date: earlyHarvestDate,
      cell: '0,0',
      data: { biomass: 0, minimum: 0.8 },
    });
    expect(retryHarvestedEvents).toHaveLength(1);
    expect(retryHarvestedEvents[0]).toMatchObject({
      dayIndex: firstEligibleDayIndex,
      date: firstEligibleDate,
      kind: 'harvested',
      cell: '0,0',
    });
    const retryHarvestedEvent = retryHarvestedEvents[0];
    if (retryHarvestedEvent?.kind === 'harvested') {
      expect(Math.abs(retryHarvestedEvent.data.yieldKg - 0.007875)).toBeLessThanOrEqual(1e-12);
    }
    expect(earlyHarvestRetry.summary.harvestReadyDay).toBe(62);
    expect(earlyHarvestRetry.finalState.cells['0,0']?.harvested).toBe(true);
    expect(earlyHarvestRetry.summary.totalYieldKg).toBe(0.01);
    expect(earlyHarvestRetry.summary.yieldKgByCrop[String(crop.id)]).toBe(0.01);
    expect(earlyHarvestRetryReplay.events).toEqual(earlyHarvestRetry.events);
    expect(earlyHarvestRetryReplay.finalState).toEqual(earlyHarvestRetry.finalState);
    expect(earlyHarvestRetryReplay.summary).toEqual(earlyHarvestRetry.summary);

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
  const elevatedTarget = { kind: 'growing-level' as const, growingSpaceId: 'space-a', levelId: 'high' };
  const floorSiblingCell = '0,0';
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
    elevatedCells?: string[];
    autoHarvest: boolean;
    interventions?: RunConfig['interventions'];
    omitSoilSource?: boolean;
  }): RunConfig {
    const elevatedCells = options.elevatedCells ?? [];
    const cellKeys = [
      ...options.cells.map((cell) => targetCellKey(target, cell)),
      ...elevatedCells.map((cell) => targetCellKey(elevatedTarget, cell)),
    ];
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
        widthM: Math.max(options.cells.length, elevatedCells.length) * cellM,
        heightM: cellM,
        cellM,
        planting: Object.fromEntries(options.cells.map((cell) => [cell, crop.id])),
        plantedAt: Object.fromEntries(options.cells.map((cell) => [cell, startDate])),
        ...(elevatedCells.length > 0 ? {
          targets: {
            [growingTargetKey(elevatedTarget)]: {
              growingSpaceId: elevatedTarget.growingSpaceId,
              levelId: elevatedTarget.levelId,
              planting: Object.fromEntries(elevatedCells.map((cell) => [cell, crop.id])),
              plantedAt: Object.fromEntries(elevatedCells.map((cell) => [cell, startDate])),
            },
          },
        } : {}),
      },
      cropStartEvents: Object.fromEntries(cellKeys.map((key) => [key, 'transplanting' as const])),
    });
    const modelInputs = freezeRunModelInputsV3(run, {
      soil: {
        awcMmPerCm: 1.5,
        organicMatterPct: 2.4,
        ...(!options.omitSoilSource ? { source: 'usda-sda' as const } : {}),
      },
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
      cropEstablishmentByCell: Object.fromEntries(cellKeys.map((key) => [key, {
        startEvent: 'transplanting' as const,
        establishedAtDate: startDate,
        initialAboveGroundDryMatterGPerM2: initialDryMatterGPerM2,
        evidence: establishmentEvidence,
      }])),
    });
    return { ...run, modelInputs };
  }

  function findMaturity(run: RunConfig, cellKeys: string[]): { dayIndex: number; envSeries: ReturnType<typeof dailyEnvironment>[] } {
    let state = createRun(run);
    const envSeries: ReturnType<typeof dailyEnvironment>[] = [];
    for (let offset = 0; offset < 500; offset++) {
      const env = dailyEnvironment(offset);
      envSeries.push(env);
      state = stepDay(state, env, run).state;
      if (cellKeys.every((key) => state.cells[key]?.biomassFrac === 1)) {
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
    const maturity = findMaturity(baseline, eligibleCells.map((cell) => targetCellKey(target, cell)));
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

  it('reconciles v3 elevated-target harvest mass without harvesting its floor sibling', () => {
    const elevatedCellKeys = eligibleCells.map((cell) => targetCellKey(elevatedTarget, cell));
    const baseline = frozenRun({
      cells: [floorSiblingCell],
      elevatedCells: eligibleCells,
      autoHarvest: false,
    });
    const allCellKeys = [targetCellKey(target, floorSiblingCell), ...elevatedCellKeys];
    const maturity = findMaturity(baseline, allCellKeys);
    const harvestDate = maturity.envSeries[maturity.dayIndex + 1]!.date;
    const manualRun = {
      ...baseline,
      interventions: eligibleCells.map((cell) => ({
        kind: 'harvest' as const,
        date: harvestDate,
        cell,
        target: elevatedTarget,
      })),
    };
    const original = simulateRun(manualRun, maturity.envSeries);
    const record = runRecord('run:v3:elevated-target-manual-harvest', manualRun, maturity.envSeries, original.summary);
    const replay = simulateRun(record.config, record.envSeries);
    const harvested = original.events.filter((event) => event.kind === 'harvested');

    expect(manualRun.interventions).toHaveLength(6);
    expect(manualRun.interventions.every((intervention) => (
      intervention.kind === 'harvest' && intervention.target?.kind === 'growing-level'
    ))).toBe(true);
    expect(harvested).toHaveLength(6);
    expect(harvested.map((event) => event.cell).sort()).toEqual([...elevatedCellKeys].sort());
    expect(harvested.every((event) => event.dayIndex === maturity.dayIndex + 1)).toBe(true);
    expect(harvested.every((event) => (
      event.target?.kind === 'growing-level' &&
      event.target.growingSpaceId === elevatedTarget.growingSpaceId &&
      event.target.levelId === elevatedTarget.levelId
    ))).toBe(true);
    for (const event of harvested) {
      if (event.kind === 'harvested') {
        expect(Math.abs(event.data.yieldKg - 0.00096)).toBeLessThanOrEqual(1e-12);
      }
    }
    const elevatedYieldKg = harvested.reduce((sum, event) => (
      sum + (event.kind === 'harvested' ? event.data.yieldKg : 0)
    ), 0);
    expect(Math.abs(elevatedYieldKg - 0.00576)).toBeLessThanOrEqual(1e-12);
    expect(harvested.some((event) => event.cell === floorSiblingCell)).toBe(false);

    const floorSibling = original.finalState.cells[floorSiblingCell];
    expect(floorSibling).toMatchObject({
      biomassFrac: 1,
      dryMatterGPerM2: initialDryMatterGPerM2,
      sourceThermalCdays: maturityTarget,
      establishmentApplied: true,
    });
    expect(floorSibling?.dead).not.toBe(true);
    expect(floorSibling?.harvested).not.toBe(true);
    expect(original.summary.totalYieldKg).toBe(0.01);
    expect(original.summary.yieldKgByCrop).toEqual({ [String(crop.id)]: 0.01 });
    expect(record.summary.totalYieldKg).toBe(0.01);
    expect(record.summary.yieldKgByCrop).toEqual({ [String(crop.id)]: 0.01 });
    expect(replay.events).toEqual(original.events);
    expect(replay.finalState).toEqual(original.finalState);
    expect(replay.summary).toEqual(record.summary);
  });

  it('keeps a mature v3 crop standing when auto-harvest is disabled and replays through the next day', () => {
    const cellKey = targetCellKey(target, eligibleCells[0]!);
    const noAutoRun = frozenRun({ cells: [eligibleCells[0]!], autoHarvest: false });
    expect(noAutoRun.cropModelVersion).toBe('crop-model-v3');
    const frozenInputs = noAutoRun.modelInputs;
    if (!frozenInputs || frozenInputs.model !== 'run-inputs-v3') {
      throw new Error('Expected frozen v3 inputs for the no-auto-harvest case.');
    }
    expect(frozenInputs.parameterSetVersion).toBe('crop-parameters-v4');
    expect(noAutoRun.autoHarvest).toBe(false);
    expect(noAutoRun.interventions).toEqual([]);

    const maturity = findMaturity(noAutoRun, [cellKey]);
    expect(maturity.envSeries).toHaveLength(maturity.dayIndex + 2);
    const original = simulateRun(noAutoRun, maturity.envSeries);
    const record = runRecord('run:v3:no-auto-harvest-maturity', noAutoRun, maturity.envSeries, original.summary);
    const replay = simulateRun(record.config, record.envSeries);
    const cell = original.finalState.cells[cellKey];

    expect(original.summary.daysSimulated).toBe(maturity.dayIndex + 2);
    expect(original.summary.totalYieldKg).toBe(0);
    expect(original.summary.yieldKgByCrop).toEqual({});
    expect(original.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(cell).toMatchObject({
      biomassFrac: 1,
      sourceThermalCdays: maturityTarget,
    });
    expect(cell?.dead).not.toBe(true);
    expect(cell?.harvested).not.toBe(true);
    expect(replay.events).toEqual(original.events);
    expect(replay.finalState).toEqual(original.finalState);
    expect(replay.summary).toEqual(record.summary);
  });

  it('auto-harvests v3 on the actual frozen maturity endpoint once and replays the saved summary', () => {
    const baseline = frozenRun({ cells: eligibleCells, autoHarvest: false });
    const maturity = findMaturity(baseline, eligibleCells.map((cell) => targetCellKey(target, cell)));
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

  it('auto-harvests v3 floor and elevated targets once at the frozen maturity endpoint and replays exactly', () => {
    const baseline = frozenRun({
      cells: [floorSiblingCell],
      elevatedCells: eligibleCells,
      autoHarvest: false,
      omitSoilSource: true,
    });
    const expectedCellKeys = [
      targetCellKey(target, floorSiblingCell),
      ...eligibleCells.map((cell) => targetCellKey(elevatedTarget, cell)),
    ];
    const frozenInputs = baseline.modelInputs;
    expect(baseline.cropModelVersion).toBe('crop-model-v3');
    expect(frozenInputs).toMatchObject({
      model: 'run-inputs-v3',
      parameterSetVersion: 'crop-parameters-v4',
      soil: { awcMmPerCm: 1.5, organicMatterPct: 2.4, source: 'unknown' },
    });
    if (!frozenInputs || frozenInputs.model !== 'run-inputs-v3') {
      throw new Error('Expected frozen crop-model-v3 run inputs.');
    }
    expect(frozenInputs.qualification.status).toBe('qualified');
    const registeredCropSnapshot = Object.fromEntries(
      Object.entries(v3AutoHarvestMixedTargetFixture.syntheticInputs.catalogCropSnapshot)
        .filter(([key]) => key !== 'source'),
    );
    expect(frozenInputs.crops).toHaveLength(1);
    expect(frozenInputs.crops[0]).toEqual(registeredCropSnapshot);
    expect(frozenInputs.cropParameters).toHaveLength(1);
    expect(frozenInputs.cropParameters[0]?.production).toMatchObject({
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: 2,
      harvestIndex,
      status: 'qualified',
    });
    expect(Object.prototype.hasOwnProperty.call(
      frozenInputs.cropParameters[0]?.production,
      'initialDryMatterGPerM2',
    )).toBe(false);
    expect(frozenInputs.cropParameters[0]?.rootZone).toMatchObject({
      method: 'FAO-56',
      effectiveRootDepthCm: 20,
      depletionFraction: 0.5,
      cropCoefficient: 1,
      initialStorageFraction: 0.7,
      status: 'qualified',
    });
    expect(frozenInputs.cropParameters[0]?.lifecycle).toBe('plant');
    const registeredThermal = v3AutoHarvestMixedTargetFixture.syntheticInputs.thermal;
    expect(registeredThermal).toMatchObject({
      tBaseC: 7.2,
      tUpperC: 33.3,
      gddToMaturityCdays: [1024, 1117],
      startEvents: ['transplanting'],
      accumulationStart: 'Transplanting at 3–5 true leaves',
      maturityEndpoint: 'First ripe harvest (four or more fruits show ripe color)',
      accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 6',
    });
    const frozenThermal = frozenInputs.cropParameters[0]?.thermal;
    expect({
      tBaseC: frozenThermal?.tBaseC,
      tUpperC: frozenThermal?.tUpperC,
      gddToMaturityCdays: frozenThermal?.gddToMaturityCdays,
      startEvents: frozenThermal?.startEvents,
      accumulationStart: frozenThermal?.accumulationStart,
      maturityEndpoint: frozenThermal?.maturityEndpoint,
      accumulationMethod: frozenThermal?.accumulationMethod,
    }).toEqual(registeredThermal);
    expect(Object.keys(frozenInputs.establishmentByCell).sort()).toEqual([...expectedCellKeys].sort());
    expect(Object.keys(baseline.cropStartEvents ?? {}).sort()).toEqual([...expectedCellKeys].sort());
    for (const key of expectedCellKeys) {
      expect(baseline.cropStartEvents?.[key]).toBe('transplanting');
      expect(frozenInputs.establishmentByCell[key]).toMatchObject({
        startEvent: 'transplanting',
        establishedAtDate: startDate,
        initialAboveGroundDryMatterGPerM2: initialDryMatterGPerM2,
      });
    }

    const support = inspectRunModelSupport(baseline);
    expect(support).toMatchObject({ status: 'qualified', canReplay: true });
    const maturity = findMaturity(baseline, expectedCellKeys);
    const maturityEnvironment = maturity.envSeries[maturity.dayIndex];
    const nextDayEnvironment = maturity.envSeries[maturity.dayIndex + 1];
    expect(maturityEnvironment?.date).toBe(dateAtOffset(maturity.dayIndex));
    expect(nextDayEnvironment?.date).toBe(dateAtOffset(maturity.dayIndex + 1));
    expect(maturity.envSeries).toHaveLength(maturity.dayIndex + 2);

    const autoRun = { ...baseline, autoHarvest: true };
    expect(inspectRunModelSupport(autoRun)).toMatchObject({ status: 'qualified', canReplay: true });
    const original = simulateRun(autoRun, maturity.envSeries);
    const record = runRecord('run:v3:auto-harvest-mixed-target', autoRun, maturity.envSeries, original.summary);
    const replay = simulateRun(record.config, record.envSeries);
    const harvested = original.events.filter((event) => event.kind === 'harvested');

    expect(harvested).toHaveLength(7);
    expect(harvested.map((event) => event.cell).sort()).toEqual([...expectedCellKeys].sort());
    expect(new Set(harvested.map((event) => event.cell)).size).toBe(7);
    expect(harvested.every((event) => event.dayIndex === maturity.dayIndex)).toBe(true);
    expect(harvested.every((event) => event.date === maturityEnvironment?.date)).toBe(true);
    const floorHarvest = harvested.find((event) => event.cell === targetCellKey(target, floorSiblingCell));
    expect(floorHarvest).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(floorHarvest, 'target')).toBe(false);
    for (const event of harvested) {
      if (event.kind !== 'harvested') continue;
      if (event.cell === targetCellKey(target, floorSiblingCell)) {
        expect(Object.prototype.hasOwnProperty.call(event, 'target')).toBe(false);
      } else {
        expect(event.target).toEqual(elevatedTarget);
      }
      expect(Math.abs(event.data.yieldKg - expectedPayoutKg)).toBeLessThanOrEqual(1e-12);
    }
    const totalPayoutKg = harvested.reduce((sum, event) => (
      sum + (event.kind === 'harvested' ? event.data.yieldKg : 0)
    ), 0);
    expect(Math.abs(totalPayoutKg - 0.00672)).toBeLessThanOrEqual(1e-12);
    expect(original.events.filter((event) => (
      event.kind === 'harvested' && event.dayIndex === maturity.dayIndex + 1
    ))).toHaveLength(0);

    for (const key of expectedCellKeys) {
      expect(original.finalState.cells[key]).toMatchObject({
        biomassFrac: 1,
        readyAtDay: maturity.dayIndex,
        harvested: true,
      });
    }
    expect(original.summary.totalYieldKg).toBe(0.01);
    expect(original.summary.yieldKgByCrop).toEqual({ [String(crop.id)]: 0.01 });
    expect(replay.summary.totalYieldKg).toBe(0.01);
    expect(replay.summary.yieldKgByCrop).toEqual({ [String(crop.id)]: 0.01 });
    expect(replay.events).toEqual(original.events);
    expect(replay.finalState).toEqual(original.finalState);
    expect(replay.summary).toEqual(record.summary);
  });
});
