import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import { targetCellKey } from '@/lib/growingTargets';
import type { CropStartEvent, Observation } from '@/types';
import fixture from '../../../quality/beta/evidence/ohayou-v4-replay-integration-synthetic.json';
import { leafAreaIndexFromCanopyDryMatter } from './crop-model-v2';
import { createRun, simulateRun, stepDay, type SimRunCtx } from './engine';
import { freezeEnvironmentModelInputsV2, freezeRunModelInputs, freezeRunModelInputsV4, inspectRunModelSupport } from './model-inputs';
import { ReplayStateCache, replayRunToDay, UnsupportedRunReplayError } from './replay-cache';
import { forkRun } from './timeline';
import { createTwinRunRecord } from './twin';
import type { DailyEnvironment, FrozenCropModelParametersV4, RunConfig, RunRecord } from './types';

const CROP_ID = fixture.syntheticInputs.crop.catalogCropId;
const crop = cropLibrary.find((entry) => entry.id === CROP_ID)!;
const cellKey = targetCellKey({ kind: 'floor' }, fixture.syntheticInputs.crop.cell);
const sourceEvidence = {
  evidenceId: fixture.source.evidenceId,
  sourceCitation: fixture.source.citation,
  sourceUrl: fixture.source.url,
  validDomain: 'Ohayou Spring Control K and RUE only; canopy LAI inputs are synthetic',
};
const syntheticEvidence = {
  evidenceId: fixture.id,
  sourceCitation: 'Synthetic software fixture; no biological claim',
  sourceUrl: 'test-only:ohayou-v4-total-solar-integration',
  validDomain: 'synthetic reducer integration only',
};
const dailyRows = fixture.syntheticInputs.dailyEnvironment.envSeries as Array<{
  date: string;
  solarRadiationMJm2Day?: number | null;
  dliNaturalMol?: number;
}>;
const expectedRows = fixture.expected.dailyRows;
const tolerance = fixture.tolerances.dailyDryMatterClosure.maximumAbsoluteResidual;
const ctx: SimRunCtx = { crops: [crop] };

function closeToFixture(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function v6Parameter(): FrozenCropModelParametersV4 {
  const thermal = cropThermalParams.find((entry) => entry.cropId === CROP_ID)!;
  return {
    cropId: CROP_ID,
    thermal: {
      ...thermal,
      tBaseC: fixture.syntheticInputs.crop.thermal.tBaseC,
      tUpperC: fixture.syntheticInputs.crop.thermal.tUpperC,
      gddToMaturityCdays: [
        fixture.syntheticInputs.crop.thermal.gddToMaturityCdays[0]!,
        fixture.syntheticInputs.crop.thermal.gddToMaturityCdays[1]!,
      ],
      startEvents: fixture.syntheticInputs.crop.thermal.startEvents as CropStartEvent[],
      accumulationStart: fixture.syntheticInputs.crop.thermal.accumulationStart,
      maturityEndpoint: fixture.syntheticInputs.crop.thermal.maturityEndpoint,
      accumulationMethod: fixture.syntheticInputs.crop.thermal.accumulationMethod,
      sourceCitation: fixture.syntheticInputs.crop.thermal.sourceCitation,
      sourceUrl: fixture.syntheticInputs.crop.thermal.sourceUrl,
    },
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: fixture.syntheticInputs.rootZone.effectiveRootDepthCm,
      depletionFraction: fixture.syntheticInputs.rootZone.depletionFraction,
      cropCoefficient: fixture.syntheticInputs.rootZone.cropCoefficient,
      initialStorageFraction: fixture.syntheticInputs.rootZone.initialStorageFraction,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic root-zone values isolate production; no root response is evaluated.'],
      evidence: syntheticEvidence,
    },
    lifecycle: fixture.syntheticInputs.crop.lifecycle as 'plant',
    production: {
      equationFamily: fixture.syntheticInputs.production.equationFamily as 'OHAYOU-SPRING-CONTROL-TOTAL-SOLAR-RUE-V1',
      rueGPerMjInterceptedTotalSolar: fixture.syntheticInputs.production.sourceRUEGPerMjInterceptedTotalSolar,
      stressFactor: fixture.syntheticInputs.production.stressFactor,
      stressFactorClassification: 'synthetic',
      status: 'qualified',
      missing: [],
      limitations: [
        'Ohayou Spring Control K and RUE are source-derived coefficients; LAI, stress and allocation are synthetic software inputs.',
        'This is not a complete Ohayou model or a crop-accuracy result.',
      ],
      evidence: sourceEvidence,
      canopy: {
        kTotalSolar: fixture.syntheticInputs.production.sourceKTotalSolar,
        specificLeafAreaM2PerKg: fixture.syntheticInputs.production.laiMapping.specificLeafAreaM2PerKg,
        leafStemPartitionParameterM2PerKg: fixture.syntheticInputs.production.laiMapping.leafStemPartitionParameterM2PerKg,
        laiMappingClassification: 'synthetic',
        evidence: sourceEvidence,
      },
      allocation: {
        canopyShare: fixture.syntheticInputs.production.dailyAllocation.canopyShare,
        harvestableShare: fixture.syntheticInputs.production.dailyAllocation.harvestableShare,
        classification: 'synthetic',
        evidenceId: fixture.id,
        validDomain: 'synthetic software fixture only',
      },
    },
  };
}

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  const plan = fixture.syntheticInputs.run.plan;
  return {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: plan.widthM,
      heightM: plan.heightM,
      cellM: plan.cellM,
      allowOutsideBeds: false,
      ground: {},
      planting: { [fixture.syntheticInputs.crop.cell]: CROP_ID },
      updatedAt: fixture.preparedDate,
    },
    cropModelVersion: 'crop-model-v4',
    startDate: fixture.syntheticInputs.run.startDate,
    dayCount: fixture.syntheticInputs.run.dayCount,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: fixture.syntheticInputs.run.tempDeltaC,
    precipMultiplier: fixture.syntheticInputs.run.precipMultiplier,
    interventions: [],
    autoHarvest: false,
    cropStartEvents: { [cellKey]: fixture.syntheticInputs.crop.startEvent as CropStartEvent },
    ...overrides,
  };
}

function dailyEnvironmentSeries(): DailyEnvironment[] {
  const shared = fixture.syntheticInputs.dailyEnvironment.sharedDailyValues;
  return dailyRows.map((row) => ({
    date: row.date,
    ...shared,
    ...(Object.hasOwn(row, 'solarRadiationMJm2Day')
      ? { solarRadiationMJm2Day: row.solarRadiationMJm2Day }
      : {}),
    ...(row.dliNaturalMol !== undefined ? { dliNaturalMol: row.dliNaturalMol } : {}),
    provenance: {
      tMinC: 'default',
      tMaxC: 'default',
      precipMm: 'default',
      etoMm: 'default',
      solarRadiationMJm2Day: 'synthetic',
    },
  }));
}

function frozenRun(overrides: Partial<RunConfig> = {}): RunConfig {
  const run = config(overrides);
  const modelInputs = freezeRunModelInputsV4(run, {
    soil: {
      awcMmPerCm: fixture.syntheticInputs.soil.awcMmPerCm,
      organicMatterPct: fixture.syntheticInputs.soil.organicMatterPct,
    },
    crops: [crop],
    cropParametersV4: [v6Parameter()],
    cropCanopyEstablishmentByCell: {
      [cellKey]: {
        startEvent: fixture.syntheticInputs.crop.startEvent as CropStartEvent,
        establishedAtDate: fixture.syntheticInputs.run.startDate,
        initialCanopyDryMatterGPerM2: fixture.syntheticInputs.production.initialPools.canopyDryMatterGPerM2,
        initialHarvestableDryMatterGPerM2: fixture.syntheticInputs.production.initialPools.harvestableDryMatterGPerM2,
        evidence: {
          classification: 'synthetic',
          evidenceId: fixture.id,
          validDomain: 'synthetic software fixture only',
        },
      },
    },
  });
  return { ...run, modelInputs };
}

function record(): RunRecord {
  const frozen = frozenRun();
  const envSeries = dailyEnvironmentSeries();
  return {
    id: 'run:1:ohayou-v6-synthetic',
    farmId: frozen.farmId,
    label: fixture.id,
    createdAt: `${fixture.preparedDate}T00:00:00.000Z`,
    config: frozen,
    envSeries,
    summary: simulateRun(frozen, envSeries, ctx).summary,
    status: 'complete',
  };
}

function expectRecordReplay(saved: RunRecord): void {
  const persisted = JSON.parse(JSON.stringify(saved)) as RunRecord;
  const original = simulateRun(saved.config, saved.envSeries, ctx, saved.observations ?? []);
  const frozenCrop = persisted.config.modelInputs?.model === 'run-inputs-v4'
    ? persisted.config.modelInputs.crops.find((entry) => entry.id === CROP_ID)
    : undefined;
  const conflictingCrop = { ...crop, minTempC: 40, maxTempC: 41 };
  expect(frozenCrop).toMatchObject({ id: CROP_ID, minTempC: crop.minTempC, maxTempC: crop.maxTempC });
  expect(conflictingCrop).toMatchObject({ id: CROP_ID, minTempC: 40, maxTempC: 41 });
  expect(conflictingCrop.minTempC).not.toBe(frozenCrop?.minTempC);
  expect(conflictingCrop.maxTempC).not.toBe(frozenCrop?.maxTempC);
  const conflictingCtx = { ...ctx, crops: [conflictingCrop] };
  const replay = simulateRun(persisted.config, persisted.envSeries, conflictingCtx, persisted.observations ?? []);
  expect(replay.events).toEqual(original.events);
  expect(replay.finalState.cells).toEqual(original.finalState.cells);
  expect(replay.finalState.modelQualificationReasons).toEqual(original.finalState.modelQualificationReasons);
  expect(replay.summary).toEqual(original.summary);
  expect(replay.summary).toEqual(saved.summary);
}

describe('crop-model-v4 Ohayou total-solar frozen integration', () => {
  it('runs the preregistered daily recurrence, preserves JSON semantics and exactly replays a RunRecord', () => {
    const run = frozenRun();
    expect(crop.slug).toBe(fixture.syntheticInputs.crop.catalogSlug);
    expect(run.modelInputs).toMatchObject({ model: 'run-inputs-v4', parameterSetVersion: 'crop-parameters-v6' });
    expect(run.modelInputs?.model === 'run-inputs-v4' ? run.modelInputs.cropParameters[0]?.production : null).toMatchObject({
      equationFamily: fixture.modelDispatch.equationFamily,
      rueGPerMjInterceptedTotalSolar: fixture.syntheticInputs.production.sourceRUEGPerMjInterceptedTotalSolar,
      stressFactor: fixture.syntheticInputs.production.stressFactor,
      stressFactorClassification: 'synthetic',
      evidence: { evidenceId: fixture.source.evidenceId },
      canopy: {
        kTotalSolar: fixture.syntheticInputs.production.sourceKTotalSolar,
        specificLeafAreaM2PerKg: fixture.syntheticInputs.production.laiMapping.specificLeafAreaM2PerKg,
        leafStemPartitionParameterM2PerKg: fixture.syntheticInputs.production.laiMapping.leafStemPartitionParameterM2PerKg,
        laiMappingClassification: 'synthetic',
      },
      allocation: { classification: 'synthetic' },
    });
    const support = inspectRunModelSupport(run);
    expect(support, support.reasons.join('\n')).toMatchObject({ status: 'qualified', canReplay: true, preserveStoredSummary: false });
    const start = createRun(run, ctx);
    let state = start;
    let totalClosures = 0;
    const envSeries = dailyEnvironmentSeries();

    expect(start.cells['0,0']).toMatchObject({
      canopyDryMatterGPerM2: 10,
      harvestableDryMatterGPerM2: 5,
      dryMatterGPerM2: 15,
      nitrogenKgHa: fixture.syntheticInputs.soil.initialNitrogenPoolKgHa,
      rootZoneWaterMm: fixture.syntheticInputs.rootZone.initialStorageMm,
    });

    for (const [index, expected] of expectedRows.entries()) {
      const env = envSeries[index]!;
      expect(env.solarRadiationMJm2Day).toBe(expected.solarRadiationMJm2Day);
      expect(env.dliNaturalMol).toBe(dailyRows[index]?.dliNaturalMol);
      expect(env.provenance.solarRadiationMJm2Day).toBe('synthetic');
      const before = state.cells['0,0']!;
      const beginningCanopy = before.canopyDryMatterGPerM2!;
      const lai = leafAreaIndexFromCanopyDryMatter(
        beginningCanopy / 1000,
        fixture.syntheticInputs.production.laiMapping.specificLeafAreaM2PerKg,
        fixture.syntheticInputs.production.laiMapping.leafStemPartitionParameterM2PerKg,
      );
      const interceptedFraction = 1 - Math.exp(-fixture.syntheticInputs.production.sourceKTotalSolar * lai);
      const solar = env.solarRadiationMJm2Day;
      const interceptedSolar = typeof solar === 'number' ? solar * interceptedFraction : null;
      const stepped = stepDay(state, env, run, ctx);
      state = stepped.state;
      const after = state.cells['0,0']!;
      const dmGain = after.dryMatterGPerM2! - before.dryMatterGPerM2!;

      closeToFixture(lai, expected.leafAreaIndexM2PerM2);
      closeToFixture(beginningCanopy, expected.beginningCanopyDryMatterGPerM2);
      closeToFixture(interceptedFraction, expected.interceptedSolarFraction);
      if (interceptedSolar === null || expected.interceptedSolarRadiationMJm2Day === null) {
        expect(interceptedSolar).toBeNull();
        expect(expected.interceptedSolarRadiationMJm2Day).toBeNull();
      } else {
        closeToFixture(interceptedSolar, expected.interceptedSolarRadiationMJm2Day);
      }

      if (expected.productionStatus === 'calculated') {
        closeToFixture(dmGain, expected.dryMatterGainGPerM2Day as number);
        if (solar === 0) {
          expect(interceptedSolar).toBe(0);
          expect(dmGain).toBe(0);
          expect(after.canopyDryMatterGPerM2).toBe(before.canopyDryMatterGPerM2);
          expect(after.harvestableDryMatterGPerM2).toBe(before.harvestableDryMatterGPerM2);
        }
        if (typeof solar === 'number' && solar > 0) {
          const reducerImpliedInterceptedSolar = dmGain
            / fixture.syntheticInputs.production.sourceRUEGPerMjInterceptedTotalSolar
            / fixture.syntheticInputs.production.stressFactor;
          closeToFixture(reducerImpliedInterceptedSolar, expected.interceptedSolarRadiationMJm2Day as number);
          closeToFixture(reducerImpliedInterceptedSolar / solar, expected.interceptedSolarFraction);
        }
      } else {
        expect(dmGain).toBe(0);
        expect(expected.dryMatterGainGPerM2Day).toBeNull();
        expect(after.canopyDryMatterGPerM2).toBe(before.canopyDryMatterGPerM2);
        expect(after.harvestableDryMatterGPerM2).toBe(before.harvestableDryMatterGPerM2);
        expect(state.modelQualificationReasons).toContain('qualificationReason' in expected ? expected.qualificationReason : '');
      }
      closeToFixture(after.canopyDryMatterGPerM2!, expected.endingCanopyDryMatterGPerM2);
      closeToFixture(after.harvestableDryMatterGPerM2!, expected.endingHarvestableDryMatterGPerM2);
      closeToFixture(after.dryMatterGPerM2!, expected.endingTotalAboveGroundDryMatterGPerM2);
      expect(after.dryMatterGPerM2).toBe(after.canopyDryMatterGPerM2! + after.harvestableDryMatterGPerM2!);
      const canopyIncrement = after.canopyDryMatterGPerM2! - before.canopyDryMatterGPerM2!;
      const harvestableIncrement = after.harvestableDryMatterGPerM2! - before.harvestableDryMatterGPerM2!;
      const closureResidual = dmGain - canopyIncrement - harvestableIncrement;
      closeToFixture(closureResidual, 0);
      totalClosures += Math.abs(closureResidual);
      expect(after.stress).toMatchObject({ water: 0, heat: 0, cold: 0, nitrogen: 0 });
      expect(after.stress.light ?? 0).toBe(0);
      expect(after.pestPressure).toBe(0);
      expect(after.rootZoneWaterMm).toBe(fixture.syntheticInputs.rootZone.initialStorageMm);
      expect(stepped.events.some((event) => event.kind === 'harvested')).toBe(false);
    }

    expect(totalClosures).toBeLessThanOrEqual(tolerance);
    expect(state.cells['0,0']?.canopyDryMatterGPerM2).toBeCloseTo(fixture.expected.finalPools.canopyDryMatterGPerM2, 12);
    expect(state.cells['0,0']?.harvestableDryMatterGPerM2).toBeCloseTo(fixture.expected.finalPools.harvestableDryMatterGPerM2, 12);
    expect(state.cells['0,0']?.dryMatterGPerM2).toBeCloseTo(fixture.expected.finalPools.totalAboveGroundDryMatterGPerM2, 12);
    expect(state.events.filter((event) => event.kind === 'harvested')).toHaveLength(fixture.expected.harvestEvents);
    const result = simulateRun(run, envSeries, ctx);
    expect(result.summary.stressDays).toMatchObject({ water: 0, heat: 0, cold: 0, nitrogen: 0 });
    expect(result.summary.daysSimulated).toBe(fixture.syntheticInputs.run.dayCount);
    expect(result.summary.totalYieldKg).toBe(0);
    expect(result.summary.modelQualification?.status).toBe('qualified');

    const saved = record();
    const parsed = JSON.parse(JSON.stringify(saved)) as RunRecord;
    expect(parsed.envSeries[2]?.solarRadiationMJm2Day).toBe(0);
    expect(parsed.envSeries[3]?.solarRadiationMJm2Day).toBeNull();
    expect(Object.hasOwn(parsed.envSeries[4]!, 'solarRadiationMJm2Day')).toBe(false);
    const runtimeUndefinedDay = { ...parsed.envSeries[4]!, solarRadiationMJm2Day: undefined };
    const parsedUndefinedDay = JSON.parse(JSON.stringify(runtimeUndefinedDay)) as DailyEnvironment;
    expect(Object.hasOwn(parsedUndefinedDay, 'solarRadiationMJm2Day')).toBe(false);
    const replay = simulateRun(parsed.config, parsed.envSeries, ctx, parsed.observations ?? []);
    const originalReplay = simulateRun(saved.config, saved.envSeries, ctx, saved.observations ?? []);
    expect(replay.events).toEqual(originalReplay.events);
    expect(replay.finalState.cells).toEqual(originalReplay.finalState.cells);
    expect(replay.finalState.modelQualificationReasons).toEqual(originalReplay.finalState.modelQualificationReasons);
    expect(replay.summary).toEqual(originalReplay.summary);
    const undefinedSolarReplay = simulateRun(parsed.config, [
      ...parsed.envSeries.slice(0, 4),
      runtimeUndefinedDay,
    ], ctx);
    expect(undefinedSolarReplay.finalState.cells).toEqual(replay.finalState.cells);
    expect(undefinedSolarReplay.finalState.modelQualificationReasons).toEqual(replay.finalState.modelQualificationReasons);
    expectRecordReplay(parsed);
  });

  it('preserves v6 parameters and the complete solar series through freeze, fork and twin', () => {
    const parent = record();
    const frozenAgain = freezeRunModelInputsV4(parent.config, {}, parent.config.modelInputs);
    expect(frozenAgain.parameterSetVersion).toBe('crop-parameters-v6');
    expect(frozenAgain.cropParameters).toEqual(parent.config.modelInputs?.model === 'run-inputs-v4'
      ? parent.config.modelInputs.cropParameters
      : []);

    const fork = forkRun(parent, 1, {
      interventions: [{ kind: 'fertilize', date: '2026-10-03', nKgHa: 1 }],
    }, ctx);
    expect(fork.config.modelInputs).toMatchObject({ parameterSetVersion: 'crop-parameters-v6' });
    expect(fork.config.modelInputs).toEqual(parent.config.modelInputs);
    expect(fork.config.interventions).toEqual([{ kind: 'fertilize', date: '2026-10-03', nKgHa: 1 }]);
    expect(fork.envSeries).toEqual(parent.envSeries);
    expectRecordReplay(fork);

    const observation: Observation = {
      id: 'ohayou-v6-stage-note',
      farmId: parent.farmId,
      date: '2026-10-02',
      metric: 'stage',
      value: 0.2,
      unit: 'fraction',
      source: 'manual',
    };
    const twin = createTwinRunRecord(parent, [observation], ctx, {
      id: 'run:1:ohayou-v6-twin',
      createdAt: '2026-10-28T00:00:00.000Z',
    });
    expect(twin.config.modelInputs).toMatchObject({ parameterSetVersion: 'crop-parameters-v6' });
    expect(twin.config.modelInputs).toEqual(parent.config.modelInputs);
    expect(twin.envSeries).toEqual(parent.envSeries);
    expectRecordReplay(twin);
  });

  it('rejects unsupported replay, fork and twin while preserving stored records and v1 defaults', () => {
    const parent = record();
    const sentinel = {
      ...parent.summary,
      daysSimulated: fixture.expected.distinctiveStoredSummarySentinel.daysSimulated,
      totalYieldKg: fixture.expected.distinctiveStoredSummarySentinel.totalYieldKg,
      yieldBasis: fixture.expected.distinctiveStoredSummarySentinel.yieldBasis as 'dry-matter',
    };
    const historical = { ...parent, config: { ...parent.config, modelInputs: undefined }, summary: sentinel };
    const incompleteInputs = structuredClone(parent.config.modelInputs!);
    if (incompleteInputs.model === 'run-inputs-v4') {
      const production = incompleteInputs.cropParameters[0]!.production;
      if ('rueGPerMjInterceptedTotalSolar' in production) production.rueGPerMjInterceptedTotalSolar = null;
    }
    const incompleteV6 = {
      ...parent,
      config: { ...parent.config, modelInputs: incompleteInputs },
      summary: sentinel,
    } as RunRecord;
    const unknownV6 = {
      ...parent,
      config: {
        ...parent.config,
        modelInputs: { ...parent.config.modelInputs!, parameterSetVersion: 'crop-parameters-v7' },
      },
      summary: sentinel,
    } as unknown as RunRecord;
    const refrozenUnknown = freezeRunModelInputsV4(
      unknownV6.config,
      {},
      unknownV6.config.modelInputs,
    );
    expect(refrozenUnknown.parameterSetVersion).toBe('crop-parameters-v7');
    expect(refrozenUnknown.cropParameters).toEqual(unknownV6.config.modelInputs?.model === 'run-inputs-v4'
      ? unknownV6.config.modelInputs.cropParameters
      : []);
    expect(refrozenUnknown.qualification.status).toBe('unsupported');
    expect(refrozenUnknown.qualification.reasons.join(' ')).toContain('was preserved without re-freezing');
    const unknownFamilyInputs = structuredClone(parent.config.modelInputs!);
    if (unknownFamilyInputs.model === 'run-inputs-v4') {
      const production = unknownFamilyInputs.cropParameters[0]!.production as { equationFamily: string };
      production.equationFamily = 'OHAYOU-SPRING-CONTROL-TOTAL-SOLAR-RUE-V2';
    }
    const unknownFamilyV6 = {
      ...parent,
      config: { ...parent.config, modelInputs: unknownFamilyInputs },
      summary: sentinel,
    } as RunRecord;

    for (const unsupported of [historical, incompleteV6, unknownV6, unknownFamilyV6]) {
      const configBefore = structuredClone(unsupported.config);
      const summaryBefore = structuredClone(unsupported.summary);
      const support = inspectRunModelSupport(unsupported.config, true);
      expect(support).toMatchObject({ canReplay: false, preserveStoredSummary: true, status: 'unsupported' });
      expect(() => replayRunToDay(
        unsupported,
        unsupported.envSeries.length,
        ctx,
        new ReplayStateCache(),
      )).toThrow(UnsupportedRunReplayError);
      expect(() => forkRun(unsupported, 0, {}, ctx)).toThrow();
      expect(() => createTwinRunRecord(unsupported, [], ctx)).toThrow();
      expect(unsupported.config).toEqual(configBefore);
      expect(unsupported.summary).toEqual(summaryBefore);
    }

    const ordinaryConfig = { ...parent.config, cropModelVersion: undefined, modelInputs: undefined };
    expect(freezeRunModelInputs(ordinaryConfig, ctx).model).toBe('run-inputs-v1');
  });

  it('fails closed for v6 total-solar production with a non-open environment climate', () => {
    const parent = record();
    const environment = {
      id: 'env:1:ohayou-greenhouse-boundary',
      farmId: parent.farmId,
      archetype: 'greenhouse-glass' as const,
      label: 'Synthetic greenhouse boundary',
      x: 0,
      y: 0,
      widthM: 2,
      heightM: 1,
      cellM: 1,
    };
    const environmentV1 = {
      ...parent.config,
      environment,
      climateModel: 'environment-v1' as const,
    };
    const supportV1 = inspectRunModelSupport(environmentV1, false);
    expect(supportV1).toMatchObject({ canReplay: false, status: 'unsupported' });
    expect(supportV1.reasons.join(' ')).toContain('non-open environment-v1/v2 climate is unsupported');
    const stateV1 = createRun(environmentV1, ctx);
    expect(() => stepDay(stateV1, parent.envSeries[0]!, environmentV1, ctx))
      .toThrow('non-open environment-v1/v2 climate is unsupported');

    const environmentV2Base = { ...environmentV1, climateModel: 'environment-v2' as const };
    const environmentV2 = {
      ...environmentV2Base,
      environmentModelInputs: freezeEnvironmentModelInputsV2(environmentV2Base),
    };
    const supportV2 = inspectRunModelSupport(environmentV2, false);
    expect(supportV2).toMatchObject({ canReplay: false, status: 'unsupported' });
    expect(supportV2.reasons.join(' ')).toContain('non-open environment-v1/v2 climate is unsupported');
    expect(() => createRun(environmentV2, ctx)).toThrow('non-open environment-v1/v2 climate is unsupported');

    const openV1 = {
      ...environmentV1,
      environment: { ...environment, archetype: 'open-field' as const },
    };
    expect(inspectRunModelSupport(openV1, false).canReplay).toBe(true);
  });
});
