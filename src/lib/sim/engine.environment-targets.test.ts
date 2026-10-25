import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { ArchetypeId, EnvironmentLayout, GrowingTargetRef, PlanState } from '@/types';
import { createRun, stepDay } from './engine';
import type { DailyEnvironment, RunConfig } from './types';
import type { EquipmentTerms } from './equipment';

const PROVENANCE = {
  tMinC: 'default',
  tMaxC: 'default',
  precipMm: 'default',
  etoMm: 'default',
} as const;

function day(date: string, overrides: Partial<DailyEnvironment> = {}): DailyEnvironment {
  return {
    date,
    tMinC: 20,
    tMaxC: 24,
    precipMm: 0,
    etoMm: 0,
    gddBase10C: 7,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    farmId: 1,
    widthM: 0.5,
    heightM: 0.25,
    cellM: 0.25,
    allowOutsideBeds: true,
    ground: {},
    planting: {},
    updatedAt: '2026-05-01',
    ...overrides,
  };
}

function layout(kind: 'rack' | 'hydro' = 'rack'): EnvironmentLayout {
  return {
    usableHeightM: 2.4,
    access: [],
    reservations: [],
    growingSpaces: [{
      id: 'space-a',
      label: 'Space A',
      kind,
      x: 0,
      y: 0,
      widthM: 0.5,
      depthM: 0.25,
      levels: [
        { id: 'low', label: 'Lower', elevationM: 0.3 },
        { id: 'high', label: 'Upper', elevationM: 1.5 },
      ],
    }],
  };
}

function environment(archetype: ArchetypeId, worldLayout: EnvironmentLayout) {
  return {
    id: 'env:1:1',
    farmId: 1,
    archetype,
    label: 'Test world',
    x: 0,
    y: 0,
    widthM: 2,
    heightM: 1,
    cellM: 0.25,
    layout: worldLayout,
    instances: [],
  };
}

const emptyTerms: EquipmentTerms = {
  ppfdUmol: 0,
  lightingW: 0,
  photoperiodH: 0,
  achBoost: 0,
  mixing: 0,
  heatingKw: 0,
  coolingKw: 0,
  coolingElectricalKw: 0,
  dehumLpd: 0,
  dehumDerateBelowRh: 50,
  co2TargetPpm: null,
  co2KgDay: 0,
  tiers: 1,
  soilless: false,
  waterStoreL: 0,
  nursery: false,
};

function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    farmId: 1,
    basePlan: plan(),
    startDate: '2026-05-01',
    dayCount: 2,
    seed: 1,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    ...overrides,
  };
}

describe('environment target simulation', () => {
  it('keeps floor and level cells separate through planting, watering and fertilizing', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const basil = cropLibrary.find((crop) => crop.slug === 'basil')!;
    const target: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'space-a', levelId: 'high' };
    const key = growingTargetKey(target);
    const basePlan = plan({
      planting: { '0,0': tomato.id },
      targets: { [key]: { growingSpaceId: 'space-a', levelId: 'high', planting: { '0,0': tomato.id } } },
    });
    const worldLayout = layout();
    const runConfig = config({
      basePlan,
      environment: environment('grow-room', worldLayout),
      interventions: [
        { kind: 'plant', date: '2026-05-01', cell: '0,0', target, cropId: basil.id },
        { kind: 'fertilize', date: '2026-05-01', target, nKgHa: 60 },
        { kind: 'irrigate', date: '2026-05-01', target, mm: 10 },
      ],
    });
    const initial = createRun(runConfig, { crops: [tomato, basil] });
    const floorKey = '0,0';
    const levelKey = targetCellKey(target, '0,0');
    expect(initial.cells[floorKey]?.cropId).toBe(tomato.id);
    expect(initial.cells[floorKey]?.target).toBeUndefined();
    expect(initial.cells[levelKey]?.target).toEqual(target);
    expect(initial.neighbors?.[floorKey]?.sameCrop).toBe(0);

    const result = stepDay(initial, day('2026-05-01'), runConfig, { crops: [tomato, basil] });
    expect(result.state.cells[floorKey]?.cropId).toBe(tomato.id);
    expect(result.state.cells[levelKey]?.cropId).toBe(basil.id);
    expect(result.state.cells[levelKey]?.target).toEqual(target);
    expect(result.state.cells[levelKey]?.moistureFrac).toBeGreaterThan(result.state.cells[floorKey]!.moistureFrac);
    expect(result.state.cells[levelKey]?.nitrogenKgHa).toBeGreaterThan(result.state.cells[floorKey]!.nitrogenKgHa);
    expect(result.events.find((event) => event.kind === 'planted')).toMatchObject({ cell: levelKey, target });
    expect(result.events.find((event) => event.kind === 'irrigated')).toMatchObject({ target });
    expect(result.events.find((event) => event.kind === 'fertilized')).toMatchObject({ target });
  });

  it('shares one reservoir across hydro targets and reports water and nutrient stress after depletion', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const target: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'space-a', levelId: 'high' };
    const targetKey = growingTargetKey(target);
    const basePlan = plan({
      planting: { '0,0': tomato.id },
      targets: { [targetKey]: { growingSpaceId: 'space-a', levelId: 'high', planting: { '0,0': tomato.id } } },
    });
    const runConfig = config({
      basePlan,
      environment: environment('grow-room', layout('hydro')),
      interventions: [{ kind: 'irrigate', date: '2026-05-01', allTargets: true, mm: 1 }],
      assetPhysics: {
        model: 'assets-v1',
        room: { ...emptyTerms, waterStoreL: 0.0625 },
        targets: {},
        soillessCells: { floor: ['0,0'], [targetKey]: ['0,0'] },
        hydroRequiredCells: { [targetKey]: ['0,0'] },
      },
    });
    const initial = createRun(runConfig, { crops: [tomato] });
    const result = stepDay(initial, day('2026-05-01'), runConfig, { crops: [tomato] });
    const floor = result.state.cells['0,0']!;
    const level = result.state.cells[targetCellKey(target, '0,0')]!;

    expect(initial.waterStoreL).toBe(0.0625); // documented initial-full v1 assumption
    expect(result.state.waterStoreL).toBe(0);
    expect(result.events.find((event) => event.kind === 'water-short')?.data?.unmetCells).toBe(1);
    expect(floor.stress).toMatchObject({ water: 0, nitrogen: 0 });
    expect(level.stress).toMatchObject({ water: 1, nitrogen: 1 });
  });

  it('refills an enclosed rain store while keeping indoor crop rain at zero', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const runConfig = config({
      basePlan: plan({ planting: { '0,0': tomato.id } }),
      environment: environment('greenhouse-glass', layout()),
      interventions: [{ kind: 'refill-water', date: '2026-05-02', litres: 20 }],
      assetPhysics: {
        model: 'assets-v1',
        room: { ...emptyTerms, waterStoreL: 10 },
        targets: {},
        soillessCells: {},
        hydroRequiredCells: {},
      },
    });
    const initial = { ...createRun(runConfig, { crops: [tomato] }), waterStoreL: 0 };
    const rainy = stepDay(initial, day('2026-05-01', { precipMm: 1 }), runConfig, { crops: [tomato] });
    const refilled = stepDay(rainy.state, day('2026-05-02'), runConfig, { crops: [tomato] });

    expect(rainy.state.waterStoreL).toBe(2); // 1 mm × 2 m² roof catchment
    expect(rainy.effectiveEnv.precipMm).toBe(0);
    expect(refilled.state.waterStoreL).toBe(10);
    expect(refilled.events.find((event) => event.kind === 'water-refilled')?.data?.acceptedL).toBe(8);
    expect(refilled.events.find((event) => event.kind === 'water-short')?.data?.requestedL).toBe(20);
  });

  it('keeps legacy soil irrigation unlimited when no physical store is configured', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const runConfig = config({
      basePlan: plan({ planting: { '0,0': tomato.id } }),
      interventions: [{ kind: 'irrigate', date: '2026-05-01', mm: 10 }],
    });
    const initial = createRun(runConfig, { crops: [tomato] });
    const result = stepDay(initial, day('2026-05-01'), runConfig, { crops: [tomato] });

    expect(result.state.cells['0,0']?.moistureFrac).toBeGreaterThan(initial.cells['0,0']!.moistureFrac);
    expect(result.events.some((event) => event.kind === 'water-short')).toBe(false);
    expect(result.state.waterStoreL).toBeUndefined();
  });

  it('replays the frozen climate model and leaves records without a model version on the legacy path', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const runConfig = config({
      basePlan: plan({ planting: { '0,0': tomato.id } }),
      environment: environment('greenhouse-glass', layout()),
      climateModel: 'environment-v1',
      climateEquipment: {
        ppfdUmol: 0,
        lightingW: 0,
        photoperiodH: 0,
        achBoost: 0,
        heatingKw: 0,
        coolingKw: 0,
        dehumLpd: 0,
        co2TargetPpm: null,
        co2KgDay: 0,
      },
    });
    const weather = day('2026-05-01', { tMinC: 3, tMaxC: 20, precipMm: 8 });
    const first = stepDay(createRun(runConfig, { crops: [tomato] }), weather, runConfig, { crops: [tomato] });
    const replay = stepDay(createRun(runConfig, { crops: [tomato] }), weather, runConfig, { crops: [tomato] });
    const legacyConfig = { ...runConfig, climateModel: undefined };
    const legacy = stepDay(createRun(legacyConfig, { crops: [tomato] }), weather, legacyConfig, { crops: [tomato] });

    expect(first).toEqual(replay);
    expect(first.state.climate).toBeDefined();
    expect(first.effectiveEnv.provenance.tMinC).toBe('model-estimate');
    expect(legacy.state.climate).toBeUndefined();
    expect(legacy.effectiveEnv.climate).toBeUndefined();
  });

  it('applies supplemental DLI only to its mounted target', () => {
    const tomato = cropLibrary.find((crop) => crop.slug === 'tomato')!;
    const lower: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'space-a', levelId: 'low' };
    const upper: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'space-a', levelId: 'high' };
    const basePlan = plan({
      planting: { '0,0': tomato.id },
      targets: {
        [growingTargetKey(lower)]: { growingSpaceId: 'space-a', levelId: 'low', planting: { '0,0': tomato.id } },
        [growingTargetKey(upper)]: { growingSpaceId: 'space-a', levelId: 'high', planting: { '0,0': tomato.id } },
      },
    });
    const noLight = {
      ppfdUmol: 0,
      lightingW: 0,
      photoperiodH: 0,
      achBoost: 0,
      heatingKw: 0,
      coolingKw: 0,
      dehumLpd: 0,
      co2TargetPpm: null,
      co2KgDay: 0,
    };
    const runConfig = config({
      basePlan,
      environment: { ...environment('grow-room', layout()), setpoints: { photoperiodH: 12 } },
      climateModel: 'environment-v1',
      climateEquipment: noLight,
      climateTargetEquipment: {
        floor: noLight,
        [growingTargetKey(lower)]: noLight,
        [growingTargetKey(upper)]: { ...noLight, ppfdUmol: 200, lightingW: 40, photoperiodH: 18 },
      },
    });
    const created = createRun(runConfig, { crops: [tomato] });
    const result = stepDay(created, day('2026-05-01'), runConfig, { crops: [tomato] });
    const upperCell = result.state.cells[targetCellKey(upper, '0,0')]!;
    const lowerCell = result.state.cells[targetCellKey(lower, '0,0')]!;

    expect(upperCell.stress.light).toBeDefined();
    expect(upperCell.stress.light).toBeLessThan(lowerCell.stress.light!);
    expect(upperCell.stress.light).toBeGreaterThan(0.1);
    expect(lowerCell.stress.light).toBe(0.4);
  });
});
