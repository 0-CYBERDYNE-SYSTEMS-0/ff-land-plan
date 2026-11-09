import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { Observation } from '@/types';
import fixture from '../../../quality/beta/evidence/water-sa-2018-dynamic-canopy-engine-fixture.json';
import type {
  DailyEnvironment,
  FrozenCropModelParametersV4,
  RunConfig,
  RunRecord,
} from './types';
import { fractionalParInterceptionFromLai, leafAreaIndexFromCanopyDryMatter } from './crop-model-v2';
import { createRun, simulateRun, stepDay } from './engine';
import { freezeRunModelInputsV4, inspectRunModelSupport } from './model-inputs';
import { collectRunPredictionPairs } from './scorecard';

const crop = cropLibrary.find((entry) => entry.slug === 'broccoli')!;
const cellKey = targetCellKey({ kind: 'floor' }, '0,0');
const elevatedTarget = { kind: 'growing-level' as const, growingSpaceId: 'space-a', levelId: 'high' };
const harvestAreaCells = [
  { target: { kind: 'floor' as const }, cell: '0,0', harvestablePoolGPerM2: 5 },
  { target: elevatedTarget, cell: '0,0', harvestablePoolGPerM2: 8 },
  { target: elevatedTarget, cell: '1,0', harvestablePoolGPerM2: 13 },
];
const harvestAreaCellM = 0.4;
const sourceEvidence = {
  evidenceId: fixture.source.evidenceId,
  sourceCitation: fixture.source.citation,
  sourceUrl: fixture.source.url,
  validDomain: 'selected winter broccoli SWB parameters; seasonal source reference only',
};

function v4Parameter(): FrozenCropModelParametersV4 {
  const thermal = cropThermalParams.find((entry) => entry.cropId === crop.id)!;
  return {
    cropId: crop.id,
    thermal,
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: 20,
      depletionFraction: 0.5,
      cropCoefficient: 1,
      initialStorageFraction: 1,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic root-zone values isolate the v4 production equations; no root response is compared.'],
      evidence: {
        evidenceId: fixture.id,
        sourceCitation: 'Synthetic software fixture; no biological claim',
        sourceUrl: 'test-only:water-sa-v4-root-isolation',
        validDomain: 'synthetic equation test only',
      },
    },
    lifecycle: 'plant',
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: fixture.frozenSyntheticInputs.syntheticNetRueGPerMjInterceptedPar,
      status: 'qualified',
      missing: [],
      limitations: [
        'Synthetic intercepted-PAR RUE and allocation shares are software fixture values, not crop parameters.',
        'The selected Water SA canopy parameters remain source references; this fixture is not a broccoli prediction.',
        'Source cultivar Parthenon (var. cymosa) and the FarmFriend broccoli catalog record (var. italica) are distinct domains.',
      ],
      evidence: {
        evidenceId: fixture.id,
        sourceCitation: 'Synthetic software fixture; no biological claim',
        sourceUrl: 'test-only:water-sa-v4-intercepted-par-rue',
        validDomain: 'synthetic equation test only',
      },
      canopy: {
        kPar: fixture.source.sourceParameters.kPar,
        specificLeafAreaM2PerKg: fixture.source.sourceParameters.specificLeafAreaM2PerKg,
        leafStemPartitionParameterM2PerKg: fixture.source.sourceParameters.leafStemPartitionParameterM2PerKg,
        evidence: sourceEvidence,
      },
      allocation: {
        canopyShare: fixture.frozenSyntheticInputs.syntheticDailyCanopyAllocationShare,
        harvestableShare: fixture.frozenSyntheticInputs.syntheticDailyHarvestableAllocationShare,
        classification: 'synthetic',
        evidenceId: fixture.id,
        validDomain: 'synthetic software fixture only',
      },
    },
  };
}

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 1,
      allowOutsideBeds: false,
      ground: {},
      planting: { '0,0': crop.id },
      updatedAt: '2026-10-01',
    },
    cropModelVersion: 'crop-model-v4',
    startDate: '2026-10-01',
    dayCount: 2,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    cropStartEvents: { [cellKey]: 'transplanting' },
    ...overrides,
  };
}

function dailyEnvironment(date: string, dli = fixture.frozenSyntheticInputs.dailyDliMolParM2): DailyEnvironment {
  return {
    date,
    tMinC: 15,
    tMaxC: 20,
    precipMm: fixture.frozenSyntheticInputs.dailyPrecipitationMm,
    etoMm: fixture.frozenSyntheticInputs.dailyEtoMm,
    dliNaturalMol: dli,
    gddBase10C: 7.5,
    provenance: {
      tMinC: 'default',
      tMaxC: 'default',
      precipMm: 'default',
      etoMm: 'default',
      dliNaturalMol: 'default',
    },
  };
}

function frozenRun(overrides: Partial<RunConfig> = {}) {
  const run = config(overrides);
  const modelInputs = freezeRunModelInputsV4(run, {
    soil: { awcMmPerCm: 1.5, organicMatterPct: 5 },
    crops: [crop],
    cropParametersV4: [v4Parameter()],
    cropCanopyEstablishmentByCell: {
      [cellKey]: {
        startEvent: 'transplanting',
        establishedAtDate: run.startDate,
        initialCanopyDryMatterGPerM2: fixture.frozenSyntheticInputs.initialPerCellCanopyDryMatterGPerM2,
        initialHarvestableDryMatterGPerM2: fixture.frozenSyntheticInputs.initialPerCellHarvestableDryMatterGPerM2,
        evidence: { classification: 'synthetic', evidenceId: fixture.id, validDomain: 'synthetic software fixture only' },
      },
    },
  });
  return { ...run, modelInputs };
}

function harvestAreaRun(options: { autoHarvest: boolean; spacingVariant?: boolean }): RunConfig {
  const harvestDate = '2026-10-01';
  const run = config({
    basePlan: {
      ...config().basePlan,
      widthM: 2,
      heightM: 1,
      cellM: harvestAreaCellM,
      planting: { '0,0': crop.id },
      targets: {
        [growingTargetKey(elevatedTarget)]: {
          growingSpaceId: elevatedTarget.growingSpaceId,
          levelId: elevatedTarget.levelId,
          planting: { '0,0': crop.id, '1,0': crop.id },
        },
      },
    },
    cropStartEvents: Object.fromEntries(harvestAreaCells.map((entry) => [
      targetCellKey(entry.target, entry.cell),
      'transplanting',
    ])),
    interventions: options.autoHarvest ? [] : harvestAreaCells.map((entry) => ({
      kind: 'harvest' as const,
      date: harvestDate,
      cell: entry.cell,
      ...(entry.target.kind === 'floor' ? {} : { target: entry.target }),
    })),
    autoHarvest: options.autoHarvest,
  });
  const modelInputs = freezeRunModelInputsV4(run, {
    soil: { awcMmPerCm: 1.5, organicMatterPct: 5 },
    crops: [crop],
    cropParametersV4: [v4Parameter()],
    cropCanopyEstablishmentByCell: Object.fromEntries(harvestAreaCells.map((entry) => [
      targetCellKey(entry.target, entry.cell),
      {
        startEvent: 'transplanting' as const,
        establishedAtDate: run.startDate,
        initialCanopyDryMatterGPerM2: fixture.frozenSyntheticInputs.initialPerCellCanopyDryMatterGPerM2,
        initialHarvestableDryMatterGPerM2: entry.harvestablePoolGPerM2,
        evidence: { classification: 'synthetic' as const, evidenceId: fixture.id, validDomain: 'synthetic software fixture only' },
      },
    ])),
  });
  if (!options.spacingVariant) return { ...run, modelInputs };

  const spacingVariantInputs = structuredClone(modelInputs);
  spacingVariantInputs.crops[0] = {
    ...spacingVariantInputs.crops[0]!,
    spacingCm: 5,
    rowSpacingCm: 5,
    yieldKgPerPlant: 1000,
  };
  return { ...run, modelInputs: spacingVariantInputs };
}

function manualHarvestResult(run: RunConfig) {
  const start = createRun(run);
  for (const entry of harvestAreaCells) {
    const key = targetCellKey(entry.target, entry.cell);
    start.cells[key] = { ...start.cells[key]!, biomassFrac: 1 };
  }
  return stepDay(start, dailyEnvironment(run.startDate, 0), run);
}

function automaticHarvestResult(run: RunConfig) {
  const start = createRun(run);
  const maturityTarget = cropThermalParams.find((entry) => entry.cropId === crop.id)!.gddToMaturityCdays[1];
  for (const entry of harvestAreaCells) {
    const key = targetCellKey(entry.target, entry.cell);
    start.cells[key] = {
      ...start.cells[key]!,
      biomassFrac: 0,
      gddAccumC: maturityTarget - 1,
      sourceThermalCdays: maturityTarget - 1,
    };
  }
  return stepDay(start, dailyEnvironment(run.startDate), run);
}

function expectSameFrozenPools(firstRun: RunConfig, secondRun: RunConfig): void {
  const firstState = createRun(firstRun);
  const secondState = createRun(secondRun);
  for (const entry of harvestAreaCells) {
    const key = targetCellKey(entry.target, entry.cell);
    expect(firstState.cells[key]!.harvestableDryMatterGPerM2)
      .toBe(secondState.cells[key]!.harvestableDryMatterGPerM2);
  }
}

function expectAreaReconciledPayout(run: RunConfig, result: ReturnType<typeof stepDay>): number {
  expect(run.basePlan.cellM).toBe(harvestAreaCellM);
  const harvested = result.events.filter((event) => event.kind === 'harvested');
  expect(harvested).toHaveLength(harvestAreaCells.length);
  expect(harvested.filter((event) => event.target?.kind === 'growing-level')).toHaveLength(2);

  let expectedTotalKg = 0;
  for (const entry of harvestAreaCells) {
    const key = targetCellKey(entry.target, entry.cell);
    const cell = result.state.cells[key]!;
    const expectedCellKg = (cell.harvestableDryMatterGPerM2 ?? 0) * run.basePlan.cellM ** 2 / 1000;
    const payout = harvested.find((event) => event.cell === key);
    expect(cell.harvested).toBe(true);
    expect(payout?.kind === 'harvested' ? payout.data.yieldKg : undefined).toBeCloseTo(expectedCellKg, 12);
    expectedTotalKg += expectedCellKg;
  }

  const actualTotalKg = harvested.reduce((sum, event) => (
    sum + (event.kind === 'harvested' ? event.data.yieldKg : 0)
  ), 0);
  expect(actualTotalKg).toBeCloseTo(expectedTotalKg, 12);
  return actualTotalKg;
}

function expectWithinFixtureTolerance(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12);
}

describe('crop-model-v4 dynamic canopy and two-pool production', () => {
  it('preserves a v4 record when its explicit frozen inputs are absent', () => {
    expect(inspectRunModelSupport(config())).toMatchObject({
      model: 'crop-model-v4', status: 'unsupported', canReplay: false, preserveStoredSummary: true,
    });
  });

  it('freezes the versioned per-cell canopy inputs and replays the preregistered two-day fixture', () => {
    const run = frozenRun();
    expect(run.modelInputs).toMatchObject({ model: 'run-inputs-v4', parameterSetVersion: 'crop-parameters-v5' });
    const support = inspectRunModelSupport(run);
    expect(support).toMatchObject({ model: 'crop-model-v4', status: 'qualified', canReplay: true });
    expect(support.reasons.join(' ')).toContain('var. italica');

    const start = createRun(run);
    const initial = start.cells['0,0']!;
    expect(initial.canopyDryMatterGPerM2).toBe(10);
    expect(initial.harvestableDryMatterGPerM2).toBe(5);
    expect(initial.dryMatterGPerM2).toBe(initial.canopyDryMatterGPerM2! + initial.harvestableDryMatterGPerM2!);

    let state = start;
    for (const row of fixture.expectedDailyRows) {
      const previous = state.cells['0,0']!;
      const canopyStart = previous.canopyDryMatterGPerM2!;
      const lai = leafAreaIndexFromCanopyDryMatter(
        canopyStart / 1000,
        fixture.source.sourceParameters.specificLeafAreaM2PerKg,
        fixture.source.sourceParameters.leafStemPartitionParameterM2PerKg,
      );
      const interception = fractionalParInterceptionFromLai(lai, fixture.source.sourceParameters.kPar);
      expectWithinFixtureTolerance(lai, row.leafAreaIndexM2PerM2);
      expectWithinFixtureTolerance(interception, row.interceptedParFraction);

      const result = stepDay(state, dailyEnvironment(`2026-10-0${row.day}`), run);
      state = result.state;
      const cell = state.cells['0,0']!;
      expectWithinFixtureTolerance(cell.canopyDryMatterGPerM2!, row.endingCanopyDryMatterGPerM2);
      expectWithinFixtureTolerance(cell.harvestableDryMatterGPerM2!, row.endingHarvestableDryMatterGPerM2);
      expectWithinFixtureTolerance(cell.dryMatterGPerM2!, row.endingTotalAboveGroundDryMatterGPerM2);
      expect(cell.dryMatterGPerM2).toBe(cell.canopyDryMatterGPerM2! + cell.harvestableDryMatterGPerM2!);
      const totalIncrement = cell.dryMatterGPerM2! - previous.dryMatterGPerM2!;
      const canopyIncrement = cell.canopyDryMatterGPerM2! - previous.canopyDryMatterGPerM2!;
      const harvestableIncrement = cell.harvestableDryMatterGPerM2! - previous.harvestableDryMatterGPerM2!;
      expectWithinFixtureTolerance(totalIncrement, row.netDryMatterGainGPerM2);
      expectWithinFixtureTolerance(totalIncrement - canopyIncrement - harvestableIncrement, 0);
    }

    const summary = simulateRun(run, [dailyEnvironment('2026-10-01'), dailyEnvironment('2026-10-02')]).summary;
    expect(summary.yieldBasis).toBe('dry-matter');
    expect(summary.modelQualification?.status).toBe('qualified');
  });

  it('keeps the preregistered v5 control on LINTUL PAR when total-solar forcing is present', () => {
    const run = frozenRun();
    expect(run.modelInputs).toMatchObject({ model: 'run-inputs-v4', parameterSetVersion: 'crop-parameters-v5' });
    expect(run.modelInputs?.model === 'run-inputs-v4'
      ? run.modelInputs.cropParameters[0]?.production
      : null).toMatchObject({ equationFamily: 'LINTUL-net-RUE', canopy: { kPar: fixture.source.sourceParameters.kPar } });

    const withoutTotalSolar = [dailyEnvironment('2026-10-01'), dailyEnvironment('2026-10-02')];
    const withTotalSolar = withoutTotalSolar.map((env) => ({
      ...env,
      solarRadiationMJm2Day: 18,
      provenance: { ...env.provenance, solarRadiationMJm2Day: 'synthetic' as const },
    }));
    const baseline = simulateRun(run, withoutTotalSolar);
    const forced = simulateRun(run, withTotalSolar);
    expect(forced.events).toEqual(baseline.events);
    expect(forced.finalState.cells).toEqual(baseline.finalState.cells);
    expect(forced.summary).toEqual(baseline.summary);

    const record: RunRecord = {
      id: 'run:v4:water-sa-v5-solar-control',
      farmId: run.farmId,
      label: fixture.id,
      createdAt: `${run.startDate}T00:00:00.000Z`,
      config: run,
      envSeries: withTotalSolar,
      summary: forced.summary,
      status: 'complete',
    };
    const replay = simulateRun(record.config, record.envSeries);
    expect(replay.events).toEqual(forced.events);
    expect(replay.finalState.cells).toEqual(forced.finalState.cells);
    expect(replay.summary).toEqual(record.summary);
  });

  it('holds both pools on known-zero and unknown-light days', () => {
    const run = frozenRun();
    const start = createRun(run);
    const before = start.cells['0,0']!;
    const zeroResult = stepDay(start, dailyEnvironment('2026-10-01', 0), run);
    const zero = zeroResult.state.cells['0,0']!;
    expect(zero.canopyDryMatterGPerM2).toBe(before.canopyDryMatterGPerM2);
    expect(zero.harvestableDryMatterGPerM2).toBe(before.harvestableDryMatterGPerM2);
    expect(zero.dryMatterGPerM2).toBe(before.dryMatterGPerM2);
    expect(zero.dryMatterGPerM2).toBe(zero.canopyDryMatterGPerM2! + zero.harvestableDryMatterGPerM2!);

    const unknownEnv = { ...dailyEnvironment('2026-10-01'), dliNaturalMol: undefined };
    const unknownResult = stepDay(start, unknownEnv, run);
    const unknown = unknownResult.state.cells['0,0']!;
    expect(unknown.canopyDryMatterGPerM2).toBe(before.canopyDryMatterGPerM2);
    expect(unknown.harvestableDryMatterGPerM2).toBe(before.harvestableDryMatterGPerM2);
    expect(unknown.dryMatterGPerM2).toBe(before.dryMatterGPerM2);
    expect(unknown.dryMatterGPerM2).toBe(unknown.canopyDryMatterGPerM2! + unknown.harvestableDryMatterGPerM2!);
    expect(unknownResult.state.modelQualificationReasons?.some((reason) => (
      /unknown/i.test(reason) && /(DLI|light)/i.test(reason)
    ))).toBe(true);
  });

  it('ignores and does not score stage observations without a source-supported stage map', () => {
    const run = frozenRun();
    const env = dailyEnvironment('2026-10-01');
    const observation: Observation = {
      id: 'stage-v4',
      farmId: run.farmId,
      date: env.date,
      metric: 'stage',
      value: 1,
      unit: 'fraction',
      source: 'manual',
    };
    const withoutObservation = stepDay(createRun(run), env, run);
    const withObservation = stepDay(createRun(run), env, run, {}, [observation]);
    const baselineCell = withoutObservation.state.cells['0,0']!;
    const observedCell = withObservation.state.cells['0,0']!;
    expect(observedCell).toMatchObject({
      biomassFrac: baselineCell.biomassFrac,
      gddAccumC: baselineCell.gddAccumC,
      sourceThermalCdays: baselineCell.sourceThermalCdays,
      readyAtDay: baselineCell.readyAtDay,
    });
    expect(withObservation.state.modelQualificationReasons).toContain(
      'Stage observations are not assimilated for crop-model-v4: no source-supported intermediate-stage mapping exists, and biomassFrac only marks the source maturity endpoint.',
    );
    expect(withObservation.events.some((event) => event.kind === 'harvest-ready')).toBe(false);

    const record: RunRecord = {
      id: 'run:v4:stage-observation',
      farmId: run.farmId,
      label: 'V4 stage observation',
      createdAt: `${run.startDate}T00:00:00.000Z`,
      config: run,
      envSeries: [env],
      observations: [observation],
      summary: simulateRun(run, [env], {}, [observation]).summary,
      status: 'complete',
    };
    expect(collectRunPredictionPairs(record)).toEqual([{
      observationId: observation.id,
      metric: 'stage',
      date: observation.date,
      observed: observation.value,
      predicted: null,
    }]);
  });

  it('pays out the harvestable pool directly without applying a second harvest index', () => {
    const harvestDate = '2026-10-01';
    const run = frozenRun({ interventions: [{ kind: 'harvest', date: harvestDate, cell: '0,0' }] });
    const start = createRun(run);
    start.cells['0,0'] = { ...start.cells['0,0']!, biomassFrac: 0.8 };
    const early = stepDay(start, dailyEnvironment(harvestDate), run);
    expect(early.events.find((event) => event.kind === 'harvest-too-early')).toMatchObject({
      message: expect.stringContaining('frozen source maturity endpoint'),
      data: { minimum: 1 },
    });
    expect(early.events.some((event) => event.kind === 'harvested')).toBe(false);

    start.cells['0,0'] = { ...start.cells['0,0']!, biomassFrac: 1 };
    const result = stepDay(start, dailyEnvironment(harvestDate), run);
    const payout = result.events.find((event) => event.kind === 'harvested');
    expect(payout?.data?.yieldKg).toBe(0.005);
  });

  it('reconciles manual floor and elevated harvest payout to area across spacing variants', () => {
    const run = harvestAreaRun({ autoHarvest: false });
    const spacingVariant = harvestAreaRun({ autoHarvest: false, spacingVariant: true });
    expectSameFrozenPools(run, spacingVariant);
    const result = manualHarvestResult(run);
    const spacingVariantResult = manualHarvestResult(spacingVariant);

    const actualTotalKg = expectAreaReconciledPayout(run, result);
    const spacingVariantTotalKg = expectAreaReconciledPayout(spacingVariant, spacingVariantResult);
    expect(spacingVariantTotalKg).toBeCloseTo(actualTotalKg, 12);
    for (const entry of harvestAreaCells) {
      const key = targetCellKey(entry.target, entry.cell);
      expect(result.state.cells[key]!.harvestableDryMatterGPerM2).toBe(entry.harvestablePoolGPerM2);
      expect(spacingVariantResult.state.cells[key]!.harvestableDryMatterGPerM2)
        .toBe(result.state.cells[key]!.harvestableDryMatterGPerM2);
    }
  });

  it('reconciles automatic floor and elevated harvest payout to area across spacing variants', () => {
    const run = harvestAreaRun({ autoHarvest: true });
    const spacingVariant = harvestAreaRun({ autoHarvest: true, spacingVariant: true });
    expectSameFrozenPools(run, spacingVariant);
    const result = automaticHarvestResult(run);
    const spacingVariantResult = automaticHarvestResult(spacingVariant);

    const actualTotalKg = expectAreaReconciledPayout(run, result);
    const spacingVariantTotalKg = expectAreaReconciledPayout(spacingVariant, spacingVariantResult);
    expect(spacingVariantTotalKg).toBeCloseTo(actualTotalKg, 12);
    for (const entry of harvestAreaCells) {
      const key = targetCellKey(entry.target, entry.cell);
      expect(spacingVariantResult.state.cells[key]!.harvestableDryMatterGPerM2)
        .toBeCloseTo(result.state.cells[key]!.harvestableDryMatterGPerM2!, 12);
    }
  });

  it('stops v4 growth and uptake after terminal frost and blocks a mature manual harvest deterministically', () => {
    const run = frozenRun({ autoHarvest: false, dayCount: 2 });
    const modelInputs = run.modelInputs;
    if (modelInputs?.model !== 'run-inputs-v4') throw new Error('frozenRun must provide v4 model inputs');
    const maturityEndpoint = modelInputs.cropParameters[0]!.thermal!.gddToMaturityCdays[1];
    const frostDay: DailyEnvironment = {
      ...dailyEnvironment('2026-10-01', 0),
      tMinC: -20,
      tMaxC: 0,
      precipMm: 0,
      etoMm: 4,
      gddBase10C: 0,
    };
    const warmDay: DailyEnvironment = {
      ...dailyEnvironment('2026-10-02', 0),
      precipMm: 0,
      etoMm: 4,
    };
    const manualHarvestRun = {
      ...run,
      interventions: [{ kind: 'harvest' as const, date: warmDay.date, cell: '0,0' }],
    };

    const replayPath = () => {
      const afterFrost = stepDay(createRun(run), frostDay, run);
      const afterWarm = stepDay(afterFrost.state, warmDay, run);

      // Place the already-dead cell at its frozen maturity endpoint so this
      // manual-harvest check cannot pass merely because the crop is immature.
      const matureDeadState = structuredClone(afterFrost.state);
      matureDeadState.cells[cellKey] = {
        ...matureDeadState.cells[cellKey]!,
        biomassFrac: 1,
        sourceThermalCdays: maturityEndpoint,
      };
      const matureManualHarvest = stepDay(matureDeadState, warmDay, manualHarvestRun);

      return { afterFrost, afterWarm, matureManualHarvest };
    };

    const first = replayPath();
    const second = replayPath();
    const frostCell = first.afterFrost.state.cells[cellKey]!;
    const warmCell = first.afterWarm.state.cells[cellKey]!;
    const matureDeadCell = first.matureManualHarvest.state.cells[cellKey]!;

    expect(frostCell.dead).toBe(true);
    expect(frostCell.biomassFrac).toBeLessThan(1);
    expect(frostCell.sourceThermalCdays).toBeLessThan(maturityEndpoint);
    expect(warmCell.dead).toBe(true);
    expect(warmCell.gddAccumC).toBe(frostCell.gddAccumC);
    expect(warmCell.sourceThermalCdays).toBe(frostCell.sourceThermalCdays);
    expect(warmCell.biomassFrac).toBe(frostCell.biomassFrac);
    expect(warmCell.canopyDryMatterGPerM2).toBe(frostCell.canopyDryMatterGPerM2);
    expect(warmCell.harvestableDryMatterGPerM2).toBe(frostCell.harvestableDryMatterGPerM2);
    expect(warmCell.rootZoneWaterMm).toBe(frostCell.rootZoneWaterMm);
    expect(first.afterWarm.dayStats.waterUseMm).toBe(0);

    expect(matureDeadCell.dead).toBe(true);
    expect(matureDeadCell.biomassFrac).toBe(1);
    expect(matureDeadCell.sourceThermalCdays).toBe(maturityEndpoint);
    expect(first.matureManualHarvest.state.dayIndex).toBe(2);
    expect(first.matureManualHarvest.events.filter((event) => event.kind === 'harvested')).toHaveLength(0);
    expect(matureDeadCell.harvested).not.toBe(true);

    expect(second.afterFrost.state).toEqual(first.afterFrost.state);
    expect(second.afterFrost.events).toEqual(first.afterFrost.events);
    expect(second.afterWarm.state).toEqual(first.afterWarm.state);
    expect(second.afterWarm.events).toEqual(first.afterWarm.events);
    expect(second.matureManualHarvest.state).toEqual(first.matureManualHarvest.state);
    expect(second.matureManualHarvest.events).toEqual(first.matureManualHarvest.events);
  });

  it('rejects incomplete or inconsistent frozen pools and allocation shares', () => {
    const run = config();
    const invalidPools = freezeRunModelInputsV4(run, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5 },
      crops: [crop],
      cropParametersV4: [v4Parameter()],
      cropCanopyEstablishmentByCell: {
        [cellKey]: {
          startEvent: 'transplanting',
          establishedAtDate: run.startDate,
          initialCanopyDryMatterGPerM2: -1,
          initialHarvestableDryMatterGPerM2: 5,
          evidence: { classification: 'synthetic', evidenceId: fixture.id, validDomain: 'test' },
        },
      },
    });
    expect(inspectRunModelSupport({ ...run, modelInputs: invalidPools })).toMatchObject({
      status: 'unsupported', canReplay: false, preserveStoredSummary: true,
    });

    const invalidAllocation = frozenRun();
    const malformed = structuredClone(invalidAllocation.modelInputs);
    malformed.cropParameters[0]!.production.allocation.harvestableShare = 0.3;
    expect(inspectRunModelSupport({ ...invalidAllocation, modelInputs: malformed })).toMatchObject({
      status: 'unsupported', canReplay: false, preserveStoredSummary: true,
    });
  });
});
