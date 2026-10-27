import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import { growingTargetKey } from '@/lib/growingTargets';
import type { RunConfig, RunModelInputsV2 } from './types';
import { freezeRunModelInputs, freezeRunModelInputsV2, inspectRunModelSupport } from './model-inputs';
import { NO_CLIMATE_EQUIPMENT } from './environment-climate';
import { createRun, simulateRun, stepDay } from './engine';

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
    ...overrides,
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
    expect(frozen.parameterSetVersion).toBe('crop-parameters-v2');
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

  it('does not repair an incomplete v2 record from the current crop catalog', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const frozen = freezeRunModelInputsV2(run, { crops: [cropLibrary[0]!] });
    const changed = freezeRunModelInputs(run, {
      crops: [{ ...cropLibrary[0]!, name: 'Changed crop' }],
      cropParametersV2: [{
        cropId: 1,
        thermal: null,
        production: { equationFamily: 'LINTUL-net-RUE', rueGPerMjInterceptedPar: 2, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported', missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
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
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const crop = cropLibrary.find((entry) => entry.id === 1)!;
    const thermal = cropThermalParams.find((entry) => entry.cropId === crop.id)!;
    const inputs = {
      model: 'run-inputs-v2' as const,
      parameterSetVersion: 'crop-parameters-v2' as const,
      soil: { awcMmPerCm: 1.7, organicMatterPct: 2.4 },
      crops: [crop],
      cropParameters: [{
        cropId: crop.id,
        thermal,
        production: { equationFamily: 'LINTUL-net-RUE' as const, rueGPerMjInterceptedPar: 2, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported' as const, missing: [], evidence: { evidenceId: 'test-only', sourceCitation: 'Synthetic reducer contract fixture', sourceUrl: 'test-only:fixture', validDomain: 'software test only' } },
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
    const productive = simulateRun({ ...run, modelInputs: inputs }, sunnySeries);

    expect(productive.finalState.cells['0,0']?.dryMatterGPerM2).toBeCloseTo(252, 8);
    expect(productive.summary.totalYieldKg).toBeGreaterThan(0);
    expect(productive.summary.yieldBasis).toBe('dry-matter');
    expect(productive.summary.harvestReadyDay).toBe(62);
    const harvestedEvent = productive.events.find((event) => event.kind === 'harvested');
    expect(harvestedEvent?.dayIndex).toBe(62);
    expect(productive.finalState.cells['0,0']?.gddAccumC).toBe(1117);
    expect(productive.summary.rootZoneBalanceResidualMaxAbsMm).toBeLessThanOrEqual(1e-6);
    expect(productive.summary.rootZoneBalanceResidualAccumulatedMm).toBeCloseTo(0, 8);

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
      interventions: [{ kind: 'plant' as const, date: '2026-10-01', cell: '0,0', cropId: replacementCrop.id }],
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

  it('rejects an unknown persisted model version without attempting replay', () => {
    const support = inspectRunModelSupport({ ...config(), cropModelVersion: 'crop-model-v3' as never });
    expect(support).toMatchObject({ model: 'unknown', status: 'unsupported', canReplay: false });
    expect(support.preserveStoredSummary).toBe(true);
  });
});
