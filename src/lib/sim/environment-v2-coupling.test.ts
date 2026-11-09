import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { cropThermalParams } from '@/data/cropThermalParams';
import { archetypes, LEGACY_SURFACE_FOR_ARCHETYPE } from '@/creative/archetypes';
import fixture from '../../../quality/beta/evidence/fao56-environment-v2-transpiration-coupling.json';
import type {
  DailyEnvironment,
  FrozenCropModelParametersV4,
  RunConfig,
} from './types';
import { dailyThermalUnits } from './crop-model-v2';
import { environmentDay, NO_CLIMATE_EQUIPMENT } from './environment-climate';
import { createRun, simulateRun, stepDay } from './engine';
import { freezeEnvironmentModelInputsV2, freezeRunModelInputsV4, inspectRunModelSupport } from './model-inputs';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';

const crop = cropLibrary.find((entry) => entry.slug === 'broccoli')!;
const cellKeys = ['0,0', '1,0'].map((cell) => targetCellKey({ kind: 'floor' }, cell));
const evidence = {
  evidenceId: fixture.id,
  sourceCitation: 'Synthetic software fixture; no biological claim',
  sourceUrl: 'test-only:fao56-environment-v2',
  validDomain: 'synthetic software invariant only',
};

function cropParameters(rootDevelopment = false): FrozenCropModelParametersV4 {
  const thermal = cropThermalParams.find((entry) => entry.cropId === crop.id)!;
  return {
    cropId: crop.id,
    thermal,
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: rootDevelopment ? 40 : 20,
      depletionFraction: 0.5,
      cropCoefficient: 1,
      initialStorageFraction: 1,
      ...(rootDevelopment ? {
        rootDevelopment: {
          methodVersion: 'thermal-linear-root-depth-v1',
          storageExpansionMethod: 'uniform-initial-awc-fraction-v1',
          startEvent: 'transplanting',
          initialRootDepthCm: 20,
          growthStartsAfterCdays: 0,
          growthMmPerCday: 1,
          thermalBaseC: 0,
          thermalUpperC: 40,
          thermalAccumulationMethod: 'single sine horizontal cutoff',
          evidence: {
            evidenceId: fixture.id,
            sourceCitation: 'Synthetic root-temperature ordering check',
            sourceUrl: 'test-only:root-temperature-ordering',
            validDomain: 'synthetic software invariant only',
          },
        },
      } : {}),
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic root-zone values exercise software coupling only.'],
      evidence,
    },
    lifecycle: 'plant',
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: 2,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic production values are not crop parameters.'],
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
        evidenceId: fixture.id,
        validDomain: 'synthetic software invariant only',
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
      cellM: fixture.frozenSyntheticInputs.basePlanCellM,
      allowOutsideBeds: false,
      ground: {},
      planting: { '0,0': crop.id, '1,0': crop.id },
      updatedAt: '2026-10-27',
    },
    cropModelVersion: 'crop-model-v4',
    climateModel: 'environment-v2',
    environment: {
      id: 'env:1:greenhouse-v2-fixture',
      farmId: 1,
      archetype: fixture.frozenSyntheticInputs.environmentArchetype as 'greenhouse-glass',
      label: 'Frozen greenhouse fixture',
      x: 0,
      y: 0,
      widthM: fixture.frozenSyntheticInputs.environmentWidthM,
      heightM: fixture.frozenSyntheticInputs.environmentDepthM,
      cellM: fixture.frozenSyntheticInputs.basePlanCellM,
    },
    startDate: '2026-10-27',
    dayCount: 2,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    cropStartEvents: Object.fromEntries(cellKeys.map((key) => [key, 'transplanting'])),
    ...overrides,
  };
}

function dailyEnvironment(
  date: string,
  tMinC = fixture.frozenSyntheticInputs.dailyOutdoorTemperatureC[0],
  tMaxC = fixture.frozenSyntheticInputs.dailyOutdoorTemperatureC[1],
): DailyEnvironment {
  return {
    date,
    tMinC,
    tMaxC,
    precipMm: fixture.frozenSyntheticInputs.precipitationMm,
    etoMm: fixture.frozenSyntheticInputs.dailyOutdoorEtoMm,
    dliNaturalMol: fixture.frozenSyntheticInputs.dailyDliMolParM2,
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

function frozenRun(options: { rootDevelopment?: boolean; storageFraction?: number } = {}): RunConfig {
  const run = config();
  const parameters = cropParameters(options.rootDevelopment);
  parameters.rootZone.initialStorageFraction = options.storageFraction ?? 1;
  const modelInputs = freezeRunModelInputsV4(run, {
    soil: {
      awcMmPerCm: fixture.frozenSyntheticInputs.rootZone.awcMmPerCm,
      organicMatterPct: 5,
      source: 'usda-sda',
    },
    crops: [crop],
    cropParametersV4: [parameters],
    cropCanopyEstablishmentByCell: Object.fromEntries(cellKeys.map((key) => [key, {
      startEvent: 'transplanting',
      establishedAtDate: run.startDate,
      initialCanopyDryMatterGPerM2: fixture.frozenSyntheticInputs.crop.initialCanopyDryMatterGPerM2,
      initialHarvestableDryMatterGPerM2: fixture.frozenSyntheticInputs.crop.initialHarvestableDryMatterGPerM2,
      evidence: { classification: 'synthetic', evidenceId: fixture.id, validDomain: 'synthetic software fixture only' },
    }])),
  });
  const environmentModelInputs = freezeEnvironmentModelInputsV2(run, {
    ...fixture.frozenSyntheticInputs.priorRoomClimateState,
    etFactor: fixture.frozenSyntheticInputs.priorRoomClimateState.etFactor,
  });
  return { ...run, modelInputs, environmentModelInputs };
}

function expectedClimate(run: RunConfig, env: DailyEnvironment, transpirationKgDay: number) {
  const environmentInputs = run.environmentModelInputs!;
  return environmentDay(
    run.environment!,
    {
      tMinC: env.tMinC,
      tMaxC: env.tMaxC,
      precipMm: env.precipMm,
      ...(env.dliNaturalMol !== undefined ? { dliNaturalMol: env.dliNaturalMol } : {}),
    },
    environmentInputs.climateEquipment,
    environmentInputs.initialClimateState ?? undefined,
    { transpirationKgDay, environmentModelInputs: environmentInputs },
  );
}

describe('environment-v2 FAO-56 water coupling', () => {
  it('reuses each two-cell actual-transpiration flux for root loss and room humidity', () => {
    const run = frozenRun();
    expect(inspectRunModelSupport(run)).toMatchObject({ status: 'qualified', canReplay: true });
    const base = createRun(run);
    const wetStart = {
      ...base,
      cells: Object.fromEntries(cellKeys.map((key) => [key, { ...base.cells[key]!, rootZoneWaterMm: 30 }])),
    };
    const dryStart = {
      ...base,
      cells: Object.fromEntries(cellKeys.map((key) => [key, { ...base.cells[key]!, rootZoneWaterMm: 7.5 }])),
    };
    const env = dailyEnvironment('2026-10-27');
    const wet = stepDay(wetStart, env, run);
    const dry = stepDay(dryStart, env, run);

    for (const key of cellKeys) {
      expect(wetStart.cells[key]!.rootZoneWaterMm! - wet.state.cells[key]!.rootZoneWaterMm!).toBe(5);
      expect(dryStart.cells[key]!.rootZoneWaterMm! - dry.state.cells[key]!.rootZoneWaterMm!).toBe(2.5);
      expect(wet.state.cells[key]!.rootZoneResidualMaxAbsMm).toBeLessThanOrEqual(1e-6);
      expect(dry.state.cells[key]!.rootZoneResidualMaxAbsMm).toBeLessThanOrEqual(1e-6);
      expect(wet.state.cells[key]!.rootZoneResidualAccumulatedMm).toBeCloseTo(0, 12);
      expect(dry.state.cells[key]!.rootZoneResidualAccumulatedMm).toBeCloseTo(0, 12);
      expect(wet.state.cells[key]!.canopyDryMatterGPerM2).toBe(fixture.frozenSyntheticInputs.crop.initialCanopyDryMatterGPerM2);
      expect(wet.state.cells[key]!.harvestableDryMatterGPerM2).toBe(fixture.frozenSyntheticInputs.crop.initialHarvestableDryMatterGPerM2);
      expect(dry.state.cells[key]!.canopyDryMatterGPerM2).toBe(fixture.frozenSyntheticInputs.crop.initialCanopyDryMatterGPerM2);
      expect(dry.state.cells[key]!.harvestableDryMatterGPerM2).toBe(fixture.frozenSyntheticInputs.crop.initialHarvestableDryMatterGPerM2);
    }
    expect((wetStart.cells[cellKeys[0]!]!.rootZoneWaterMm! - wet.state.cells[cellKeys[0]!]!.rootZoneWaterMm!)
      * fixture.frozenSyntheticInputs.plantedCellAreaM2 * cellKeys.length).toBe(fixture.frozenSyntheticInputs.rootZone.wetExpectedEnvironmentTranspirationKgDay);
    expect((dryStart.cells[cellKeys[0]!]!.rootZoneWaterMm! - dry.state.cells[cellKeys[0]!]!.rootZoneWaterMm!)
      * fixture.frozenSyntheticInputs.plantedCellAreaM2 * cellKeys.length).toBe(fixture.frozenSyntheticInputs.rootZone.dryExpectedEnvironmentTranspirationKgDay);
    expect(wet.state.climate).toEqual(expectedClimate(run, env, fixture.frozenSyntheticInputs.rootZone.wetExpectedEnvironmentTranspirationKgDay));
    expect(dry.state.climate).toEqual(expectedClimate(run, env, fixture.frozenSyntheticInputs.rootZone.dryExpectedEnvironmentTranspirationKgDay));
    expect(wet.state.climate!.rhPct).toBeGreaterThan(dry.state.climate!.rhPct);
    expect(wet.state.climate!.rhPct).toBeLessThan(100);
    expect(dry.state.climate!.rhPct).toBeLessThan(100);
  });

  it('uses outdoor temperatures on tick one and the previous room temperatures on tick two for root growth', () => {
    const run = frozenRun({ rootDevelopment: true });
    run.environmentModelInputs = {
      ...run.environmentModelInputs!,
      initialClimateState: {
        ...fixture.frozenSyntheticInputs.priorRoomClimateState,
        tMinC: -10,
        tMaxC: -5,
      },
    };
    const firstOutdoor = dailyEnvironment('2026-10-27', 15, 20);
    const secondOutdoor = dailyEnvironment('2026-10-28', 0, 5);
    const first = stepDay(createRun(run), firstOutdoor, run);
    const firstCell = first.state.cells[cellKeys[0]!]!;
    const expectedFirstThermal = dailyThermalUnits(15, 20, {
      tBaseC: 0,
      tUpperC: 40,
      accumulationMethod: 'single sine horizontal cutoff',
    })!;
    expect(firstCell.rootThermalCdays).toBe(expectedFirstThermal);
    expect(firstCell.rootThermalCdays).not.toBe(dailyThermalUnits(-10, -5, {
      tBaseC: 0,
      tUpperC: 40,
      accumulationMethod: 'single sine horizontal cutoff',
    }));
    expect(first.state.climate).toBeDefined();

    const second = stepDay(first.state, secondOutdoor, run);
    const expectedSecondThermal = dailyThermalUnits(first.state.climate!.tMinC, first.state.climate!.tMaxC, {
      tBaseC: 0,
      tUpperC: 40,
      accumulationMethod: 'single sine horizontal cutoff',
    })!;
    const currentOutdoorThermal = dailyThermalUnits(0, 5, {
      tBaseC: 0,
      tUpperC: 40,
      accumulationMethod: 'single sine horizontal cutoff',
    })!;
    expect(second.state.cells[cellKeys[0]!]!.rootThermalCdays).toBe(firstCell.rootThermalCdays! + expectedSecondThermal);
    expect(second.state.cells[cellKeys[0]!]!.rootThermalCdays).not.toBe(firstCell.rootThermalCdays! + currentOutdoorThermal);
  });

  it("uses tick one's computed room ET factor for tick two's root-zone uptake", () => {
    const run = frozenRun();
    const initialEtFactor = run.environmentModelInputs!.initialClimateState!.etFactor;
    const first = stepDay(createRun(run), dailyEnvironment('2026-10-27'), run);
    const firstEtFactor = first.state.climate!.etFactor;
    expect(firstEtFactor).not.toBe(initialEtFactor);

    const firstStorageMm = first.state.cells[cellKeys[0]!]!.rootZoneWaterMm!;
    const second = stepDay(first.state, dailyEnvironment('2026-10-28'), run);
    const secondActualTranspirationMm = firstStorageMm - second.state.cells[cellKeys[0]!]!.rootZoneWaterMm!;
    const expectedFromPreviousRoomMm = fixture.frozenSyntheticInputs.dailyOutdoorEtoMm
      * firstEtFactor
      * fixture.frozenSyntheticInputs.rootZone.cropCoefficient;
    const incorrectlyReusedInitialEtMm = fixture.frozenSyntheticInputs.dailyOutdoorEtoMm
      * initialEtFactor
      * fixture.frozenSyntheticInputs.rootZone.cropCoefficient;

    expect(Math.abs(secondActualTranspirationMm - expectedFromPreviousRoomMm)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(secondActualTranspirationMm - incorrectlyReusedInitialEtMm)).toBeGreaterThan(1e-12);
  });

  it('keeps v1 replay behavior and refuses incomplete or unknown v2 inputs', () => {
    const base = frozenRun();
    const v1 = { ...base, climateModel: 'environment-v1' as const, environmentModelInputs: undefined };
    const v1ModelInputs = freezeRunModelInputsV4(v1, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' },
      crops: [crop], cropParametersV4: [cropParameters()],
      cropCanopyEstablishmentByCell: Object.fromEntries(cellKeys.map((key) => [key, {
        startEvent: 'transplanting', establishedAtDate: v1.startDate,
        initialCanopyDryMatterGPerM2: 10, initialHarvestableDryMatterGPerM2: 5,
        evidence: { classification: 'synthetic', evidenceId: fixture.id, validDomain: 'synthetic software fixture only' },
      }])),
    });
    const v1Config = { ...v1, modelInputs: v1ModelInputs };
    const v1Wet = simulateRun(v1Config, [dailyEnvironment('2026-10-27')]);
    const v1Repeat = simulateRun(v1Config, [dailyEnvironment('2026-10-27')]);
    expect(v1Wet).toEqual(v1Repeat);
    const v1DryParameters = cropParameters();
    v1DryParameters.rootZone.initialStorageFraction = 0.25;
    const v1DryInputs = freezeRunModelInputsV4(v1, {
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' },
      crops: [crop], cropParametersV4: [v1DryParameters],
      cropCanopyEstablishmentByCell: Object.fromEntries(cellKeys.map((key) => [key, {
        startEvent: 'transplanting', establishedAtDate: v1.startDate,
        initialCanopyDryMatterGPerM2: 10, initialHarvestableDryMatterGPerM2: 5,
        evidence: { classification: 'synthetic', evidenceId: fixture.id, validDomain: 'synthetic software fixture only' },
      }])),
    });
    const v1Dry = simulateRun({ ...v1, modelInputs: v1DryInputs }, [dailyEnvironment('2026-10-27')]);
    expect(v1Wet.finalState.climate).toEqual(v1Dry.finalState.climate);

    const missing = { ...base, environmentModelInputs: undefined };
    expect(inspectRunModelSupport(missing)).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
    expect(() => createRun(missing)).toThrow(/environment-v2/);
    expect(() => stepDay(createRun(base), dailyEnvironment('2026-10-27'), missing)).toThrow(/environment-v2/);
    const unknown = {
      ...base,
      environmentModelInputs: { ...base.environmentModelInputs!, model: 'environment-inputs-v9' } as unknown as RunConfig['environmentModelInputs'],
    };
    expect(inspectRunModelSupport(unknown)).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
    const wrongCropModel = { ...base, cropModelVersion: 'crop-model-v3' as const };
    expect(inspectRunModelSupport(wrongCropModel)).toMatchObject({ status: 'unsupported', canReplay: false, preserveStoredSummary: true });
  });

  it('replays from the frozen archetype, equipment, defaults and calibration snapshot', () => {
    const run = frozenRun();
    const day = dailyEnvironment('2026-10-27');
    const baseline = simulateRun(run, [day]);
    const changedLiveConfig = {
      ...run,
      climateEquipment: { ...NO_CLIMATE_EQUIPMENT, heatingKw: 50, ppfdUmol: 500 },
      climateTargetEquipment: { [growingTargetKey({ kind: 'floor' })]: { ...NO_CLIMATE_EQUIPMENT, ppfdUmol: 1000, photoperiodH: 18 } },
      calibration: {
        version: 'farm-calibration-v1' as const,
        revision: 99,
        farmId: run.farmId,
        environmentId: run.environment!.id,
        fittedAt: '2026-10-28T00:00:00.000Z',
        pairedDays: 1,
        parameters: { coverTransmission: 0.01, uValueWm2K: 50 },
      },
    };
    const currentArchetype = archetypes['greenhouse-glass'];
    const savedArchetype = structuredClone(currentArchetype);
    const savedLegacySurface = LEGACY_SURFACE_FOR_ARCHETYPE['greenhouse-glass'];
    try {
      currentArchetype.coverTransmission = 0;
      currentArchetype.uValueWm2K = 50;
      currentArchetype.etFactor = 1.3;
      LEGACY_SURFACE_FOR_ARCHETYPE['greenhouse-glass'] = 'indoor';
      const changed = simulateRun(changedLiveConfig, [day]);
      expect(changed).toEqual(baseline);
    } finally {
      Object.assign(currentArchetype, savedArchetype);
      LEGACY_SURFACE_FOR_ARCHETYPE['greenhouse-glass'] = savedLegacySurface;
    }
    expect(run.environmentModelInputs?.archetype).not.toBe(currentArchetype);
    expect(run.environmentModelInputs?.legacySurface).toBe(savedLegacySurface);
    expect(run.environmentModelInputs?.outdoorDefaults).toEqual({ rhPct: 60, co2Ppm: 420 });
  });
});
