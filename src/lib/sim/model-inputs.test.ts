import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import type { RunConfig } from './types';
import { freezeRunModelInputs, freezeRunModelInputsV2, inspectRunModelSupport } from './model-inputs';
import { simulateRun } from './engine';

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

  it('does not repair an incomplete v2 record from the current crop catalog', () => {
    const run = config({ cropModelVersion: 'crop-model-v2' });
    const frozen = freezeRunModelInputsV2(run, { crops: [cropLibrary[0]!] });
    const changed = freezeRunModelInputs(run, {
      crops: [{ ...cropLibrary[0]!, name: 'Changed crop' }],
      cropParametersV2: [{
        cropId: 1,
        thermal: null,
        production: { rueGPerMjInterceptedPar: 2, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported', missing: [] },
        rootZone: { effectiveRootDepthCm: 20, depletionFraction: 0.5, status: 'supported', missing: [] },
        lifecycle: 'plant',
      }],
    }, frozen);
    expect(changed.model).toBe('run-inputs-v2');
    if (changed.model !== 'run-inputs-v2') throw new Error('Expected frozen v2 inputs');
    expect(changed.crops[0]?.name).toBe(cropLibrary[0]?.name);
    expect(changed.cropParameters[0]?.production.status).toBe('unsupported');
  });

  it('does not claim a v2 estimate until the daily reducer is available, even with complete parameters', () => {
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
        production: { rueGPerMjInterceptedPar: 2, interceptedParFraction: 0.5, harvestIndex: 0.5, status: 'supported' as const, missing: [] },
        rootZone: { effectiveRootDepthCm: 20, depletionFraction: 0.5, status: 'supported' as const, missing: [] },
        lifecycle: 'plant' as const,
      }],
      qualification: { status: 'supported' as const, reasons: [] },
    };
    const support = inspectRunModelSupport({ ...run, modelInputs: inputs });
    const result = simulateRun({ ...run, modelInputs: inputs }, []);

    expect(support).toMatchObject({ status: 'unsupported', canReplay: false });
    expect(support.reasons).toContain('Frozen v2 parameters are complete, but the v2 daily state reducer is not enabled yet.');
    expect(result.summary).toMatchObject({
      daysSimulated: 0,
      totalYieldKg: 0,
      modelQualification: { status: 'unsupported' },
    });
  });

  it('rejects an unknown persisted model version without attempting replay', () => {
    const support = inspectRunModelSupport({ ...config(), cropModelVersion: 'crop-model-v3' as never });
    expect(support).toMatchObject({ model: 'unknown', status: 'unsupported', canReplay: false });
    expect(support.preserveStoredSummary).toBe(true);
  });
});
