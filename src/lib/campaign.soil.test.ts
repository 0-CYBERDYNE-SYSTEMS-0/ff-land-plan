import { describe, expect, it } from 'vitest';
import { cropLibrary } from '@/data/crops';
import { growingTargetKey } from '@/lib/growingTargets';
import { createRun, simulateRun } from '@/lib/sim/engine';
import { freezeRunModelInputs } from '@/lib/sim/model-inputs';
import type { DailyEnvironment, RunAssetPhysicsSnapshot, RunConfig, RunRecord } from '@/lib/sim/types';
import type { Environment, GrowingTargetRef, SeasonRecord, SeasonSoilCarry, SoilCarry } from '@/types';
import {
  buildSeasonPreview,
  campaignScopeKey,
  clearEnvironmentPlanting,
  normalizeSeasonRecord,
  rotationCellKey,
  rotationHint,
  rotationIndexFromSeasons,
} from './campaign';

const tomato = cropLibrary.find((crop) => crop.family === 'Solanaceae')!;
const tomatoFamily = tomato.family ?? tomato.name;
const coverCrop = cropLibrary.find((crop) => crop.category === 'cover_crop')!;
const floor: GrowingTargetRef = { kind: 'floor' };
const envSnapshot = {
  id: 'env:1:1',
  farmId: 1,
  archetype: 'open-field' as const,
  label: 'Field',
  x: 0,
  y: 0,
  widthM: 1,
  heightM: 1,
  cellM: 0.25,
};

function weather(days = 1, startDate = '2026-05-01'): DailyEnvironment[] {
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10),
    tMinC: 15,
    tMaxC: 25,
    precipMm: 0,
    etoMm: 2,
    gddBase10C: 10,
    provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
  }));
}

function config(cropId?: number, overrides: Partial<RunConfig> = {}): RunConfig {
  const base: RunConfig = {
    farmId: 1,
    basePlan: {
      farmId: 1,
      widthM: 1,
      heightM: 1,
      cellM: 0.25,
      allowOutsideBeds: false,
      ground: {},
      planting: cropId === undefined ? {} : { '0,0': cropId },
      updatedAt: '2026-05-01',
    },
    environment: envSnapshot,
    startDate: '2026-05-01',
    dayCount: 1,
    seed: 7,
    scenario: 'baseline',
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
    ...overrides,
  };
  base.modelInputs ??= freezeRunModelInputs(base, {
    soil: { awcMmPerCm: 15, organicMatterPct: 2 },
    crops: cropLibrary,
  });
  return base;
}

function record(id: string, configValue: RunConfig): RunRecord {
  const envSeries = weather(configValue.dayCount, configValue.startDate);
  return {
    id,
    farmId: configValue.farmId,
    label: id,
    createdAt: `${configValue.startDate}T00:00:00.000Z`,
    config: configValue,
    envSeries,
    summary: simulateRun(configValue, envSeries).summary,
    status: 'complete',
  };
}

const startingSoil: SoilCarry = {
  organicMatterPct: 1,
  nPoolKgHa: 500,
  inoculum: { Solanaceae: 0.4, Fabaceae: 0.5 },
};

describe('campaign soil carry', () => {
  it('rejects overlapping runs in one world but allows sequential windows and separate worlds', () => {
    const first = record('first', config(tomato.id, { dayCount: 2 }));
    const overlapping = record('alternate', config(coverCrop.id, { startDate: '2026-05-02' }));
    expect(() => buildSeasonPreview([first, overlapping])).toThrow(
      'Choose one alternative run per overlapping period in the same world.',
    );

    const sequential = record('sequential', config(tomato.id, { startDate: '2026-05-03' }));
    expect(() => buildSeasonPreview([first, sequential])).not.toThrow();

    const otherWorld = record('other-world', config(coverCrop.id, {
      environment: { ...envSnapshot, id: 'env:1:2' },
    }));
    expect(() => buildSeasonPreview([first, otherWorld])).not.toThrow();
  });

  it('uses an explicit N pool and applies target-scoped early inoculum pressure', () => {
    const input = config(tomato.id, {
      dayCount: 14,
      soilCarryByTarget: { floor: { ...startingSoil, nPoolKgHa: 777 } },
    });
    expect(createRun(input).cells['0,0']?.nitrogenKgHa).toBe(777);

    const noCarry = simulateRun(config(tomato.id, { dayCount: 14 }), weather(14));
    const carry = simulateRun(config(tomato.id, {
      dayCount: 14,
      soilCarryByTarget: { floor: startingSoil },
    }), weather(14));
    expect(carry.finalState.cells['0,0']!.biomassFrac).toBeLessThan(noCarry.finalState.cells['0,0']!.biomassFrac);

    const ordinary = config(tomato.id, { dayCount: 14 });
    const emptyCampaign = config(tomato.id, { dayCount: 14, soilCarryByTarget: {} });
    expect(simulateRun(emptyCampaign, weather(14)).finalState)
      .toEqual(simulateRun(ordinary, weather(14)).finalState);

    const frozenConfig = config(tomato.id, { dayCount: 14, soilCarryByTarget: { floor: startingSoil } });
    const frozenCarry = simulateRun(frozenConfig, weather(14));
    const contextCarry = simulateRun(ordinary, weather(14), { carry: startingSoil });
    const serializedCarry = simulateRun(JSON.parse(JSON.stringify(frozenConfig)) as RunConfig, weather(14));
    expect(frozenCarry.finalState).toEqual(contextCarry.finalState);
    expect(serializedCarry.finalState).toEqual(frozenCarry.finalState);
  });

  it('builds cover-crop OM and repeat-family inoculum, and applies bare-fallow decay once', () => {
    const scope: SeasonSoilCarry = { environmentId: envSnapshot.id, target: floor, soilIn: startingSoil, soilOut: startingSoil };
    const coverRun = record('cover', config(coverCrop.id));
    const covered = buildSeasonPreview([coverRun], { soilIn: [scope] });
    const coverOut = covered.soil[0]!.soilOut;
    expect(coverOut.organicMatterPct).toBe(1.02);
    expect(coverOut.inoculum.Fabaceae).toBe(0.85);
    expect(coverOut.inoculum.Solanaceae).toBe(0.28);

    const fallowRun = record('fallow', config());
    const composted = buildSeasonPreview([fallowRun], {
      soilIn: [scope],
      compostAppsByScope: { [campaignScopeKey(envSnapshot.id, floor)]: 2 },
    });
    expect(composted.soil[0]!.soilOut.organicMatterPct).toBe(1.15);
    expect(composted.soil[0]!.soilOut.inoculum.Fabaceae).toBe(0.35);
    expect(composted.soil[0]!.soilOut.inoculum.Solanaceae).toBe(0.28);

    const interventionRun = record('intervention', config(undefined, {
      interventions: [{ kind: 'plant', date: '2026-05-01', cell: '0,0', cropId: coverCrop.id }],
    }));
    const interventionPreview = buildSeasonPreview([interventionRun], { soilIn: [scope] });
    expect(interventionPreview.soil[0]!.soilOut.organicMatterPct).toBe(1.02);
  });

  it('never applies soil carry to a hydro target', () => {
    const target: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'hydro-1', levelId: 'level-1' };
    const key = growingTargetKey(target);
    const hydroEnvironment = {
      ...envSnapshot,
      layout: {
        access: [],
        reservations: [],
        growingSpaces: [{
          id: 'hydro-1', label: 'Hydro', kind: 'hydro' as const, x: 0, y: 0, widthM: 1, depthM: 1,
          levels: [{ id: 'level-1', label: 'Channel', elevationM: 0 }],
        }],
      },
    };
    const hydroCarry = { ...startingSoil, nPoolKgHa: 777 };
    const hydroConfig = config(tomato.id, {
      environment: hydroEnvironment,
      basePlan: {
        ...config(tomato.id).basePlan,
        planting: {},
        targets: { [key]: { growingSpaceId: 'hydro-1', levelId: 'level-1', planting: { '0,0': tomato.id } } },
      },
      soilCarryByTarget: { [key]: hydroCarry },
    });
    const initial = createRun(hydroConfig);
    expect(initial.cells[`${key}|0,0`]!.nitrogenKgHa).not.toBe(hydroCarry.nPoolKgHa);
    const preview = buildSeasonPreview([record('hydro', hydroConfig)], {
      soilIn: [{ environmentId: envSnapshot.id, target, soilIn: hydroCarry, soilOut: hydroCarry }],
    });
    expect(preview.soil).toEqual([]);

    const floorHydroCarry = { ...startingSoil, nPoolKgHa: 777, inoculum: { Solanaceae: 0.4 } };
    const floorHydroPhysics = {
      model: 'assets-v1',
      room: {} as RunAssetPhysicsSnapshot['room'],
      targets: {},
      soillessCells: { floor: ['0,0'] },
      hydroRequiredCells: {},
    } satisfies RunAssetPhysicsSnapshot;
    const floorHydroConfig = config(tomato.id, {
      assetPhysics: floorHydroPhysics,
      soilCarryByTarget: { floor: floorHydroCarry },
    });
    expect(createRun(floorHydroConfig).cells['0,0']!.nitrogenKgHa).not.toBe(floorHydroCarry.nPoolKgHa);
    expect(simulateRun(floorHydroConfig, weather()).finalState)
      .toEqual(simulateRun(config(tomato.id, { assetPhysics: floorHydroPhysics }), weather()).finalState);
    const floorPreview = buildSeasonPreview([record('floor-hydro', floorHydroConfig)], {
      soilIn: [{ environmentId: envSnapshot.id, target: floor, soilIn: floorHydroCarry, soilOut: floorHydroCarry }],
    });
    expect(floorPreview.soil[0]!.soilOut.inoculum.Solanaceae).toBe(0.28);
  });
});

describe('campaign records and rotation', () => {
  it('clears floor and level crops while retaining ground and equipment', () => {
    const environment: Environment = {
      ...envSnapshot,
      plan: {
        ...config(tomato.id).basePlan,
        plantedAt: { '0,0': '2026-05-01' },
        targets: { 'level/rack/upper': { growingSpaceId: 'rack', levelId: 'upper', planting: { '0,0': tomato.id } } },
      },
      instances: [{ id: 'light-1', slug: 'grow-light', x: 0, y: 0, widthM: 1, depthM: 0.25, mount: { kind: 'environment' } }],
    };
    const cleared = clearEnvironmentPlanting(environment);
    expect(cleared.plan.planting).toEqual({});
    expect(cleared.plan.targets).toBeUndefined();
    expect(cleared.plan.plantedAt).toBeUndefined();
    expect(cleared.plan.ground).toEqual(environment.plan.ground);
    expect(cleared.instances).toEqual(environment.instances);
  });

  it('keeps rotation histories isolated by environment and growing target', () => {
    const target: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack', levelId: 'upper' };
    const season = {
      id: 'season:1:2025', farmId: 1, year: 2025, label: '2025',
      startDate: '2025-01-01', endDate: '2025-12-31', environmentIds: ['env:1:1'], runIds: [],
      soil: [],
      harvests: [{ date: '2025-08-01', cropId: tomato.id, kg: 1, family: tomatoFamily, cell: '0,0', environmentId: 'env:1:1', target }],
      updatedAt: '2025-12-31T00:00:00.000Z',
    };
    const index = rotationIndexFromSeasons([season]);
    expect(index[rotationCellKey('env:1:1', target, '0,0')]).toEqual([{ year: 2025, family: tomatoFamily }]);
    expect(index[rotationCellKey('env:1:2', target, '0,0')]).toBeUndefined();
    expect(rotationHint(index, 'env:1:1', target, '0,0', tomatoFamily, 2027)?.warning).toBe(true);
    expect(rotationHint(index, 'env:1:1', floor, '0,0', tomatoFamily, 2027)).toBeNull();
  });

  it('adapts a legacy singular soil record only when its world identity is known', () => {
    const legacy = {
      id: 'season:1:2020', farmId: 1, year: 2020, label: '2020',
      startDate: '2020-01-01', endDate: '2020-12-31', environmentIds: ['env:1:1'], runIds: [],
      soilIn: startingSoil, soilOut: startingSoil, harvests: [], updatedAt: '2020-12-31T00:00:00.000Z',
    } as unknown as SeasonRecord;
    expect(normalizeSeasonRecord(legacy).soil).toEqual([
      { environmentId: 'env:1:1', target: floor, soilIn: startingSoil, soilOut: startingSoil },
    ]);
    expect(normalizeSeasonRecord({ ...legacy, environmentIds: [] }).soil).toEqual([]);
  });
});
