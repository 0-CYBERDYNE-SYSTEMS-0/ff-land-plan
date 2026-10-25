import { describe, expect, it } from 'vitest';
import { archetypes } from '@/creative/archetypes';
import { growingTargetKey } from '@/lib/growingTargets';
import type { EnvironmentAssetInstance, EnvironmentLayout, GrowingTargetRef, PlanState } from '@/types';
import { equipmentTermsFor } from './equipment';

function plan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    farmId: 1,
    widthM: 10,
    heightM: 8,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting: {},
    ground: {},
    updatedAt: '',
    ...overrides,
  };
}

function instance(
  id: string,
  slug: string,
  mount: EnvironmentAssetInstance['mount'],
  x = 0.25,
  y = 0.125,
  widthM = 0.5,
  depthM = 0.25,
): EnvironmentAssetInstance {
  return { id, slug, mount, x, y, widthM, depthM };
}

function rackLayout(): EnvironmentLayout {
  return {
    usableHeightM: 2.4,
    access: [],
    reservations: [],
    growingSpaces: [{
      id: 'rack-a',
      label: 'Rack A',
      kind: 'rack',
      x: 0,
      y: 0,
      widthM: 1,
      depthM: 0.5,
      levels: [
        { id: 'bottom', label: 'Bottom', elevationM: 0.3, planting: { '0,0': 1 } },
        { id: 'middle', label: 'Middle', elevationM: 0.9, planting: { '0,0': 1 } },
        { id: 'upper', label: 'Upper', elevationM: 1.5, planting: { '0,0': 1 } },
        { id: 'top', label: 'Top', elevationM: 2.1, planting: { '0,0': 1 } },
      ],
    }],
  };
}

describe('equipmentTermsFor', () => {
  it('matches one LED bar DLI and does not multiply overlapping PPFD', () => {
    const smallPlan = plan({ widthM: 1, heightM: 0.5 });
    const light = instance('light-1', 'grow-light', { kind: 'environment' });
    const one = equipmentTermsFor(smallPlan, archetypes['grow-room'], { instances: [light] });
    const two = equipmentTermsFor(smallPlan, archetypes['grow-room'], {
      instances: [light, { ...light, id: 'light-2' }],
    });

    expect(one.ppfdUmol).toBeCloseTo(208, 6);
    expect(one.lightingW).toBe(40);
    expect(one.photoperiodH).toBe(18);
    expect(one.ppfdUmol * one.photoperiodH * 3600 / 1e6).toBeCloseTo(13.4784, 4);
    expect(two.ppfdUmol).toBeCloseTo(one.ppfdUmol, 6);
    expect(two.lightingW).toBe(80);
  });

  it('uses the geometric union of partial light footprints', () => {
    const room = plan({ widthM: 2, heightM: 1 });
    const left = instance('light-left', 'grow-light', { kind: 'environment' }, 0.5, 0.25);
    const right = instance('light-right', 'grow-light', { kind: 'environment' }, 1, 0.25);
    const terms = equipmentTermsFor(room, archetypes['grow-room'], { instances: [left, right] });

    // Each 0.5 m² footprint covers 1 × 0.5 m. They overlap by half, so
    // their 0.75 m² union covers 3/8 of the 2 m² room: 208 × 3/8 = 78 PPFD.
    expect(terms.ppfdUmol).toBeCloseTo(78, 6);
    expect(terms.lightingW).toBe(80);
  });

  it('counts a mounted instance by id once and treats one legacy footprint as one bar', () => {
    const smallPlan = plan({ widthM: 1, heightM: 0.5 });
    const mounted = instance('one-id', 'grow-light', { kind: 'floor' });
    const duplicatedId = equipmentTermsFor(smallPlan, archetypes['grow-room'], {
      instances: [mounted, { ...mounted }],
    });
    const paintedFootprints = equipmentTermsFor(plan({
      widthM: 1,
      heightM: 0.25,
      ground: { '0,0': 'grow-light', '1,0': 'grow-light', '2,0': 'grow-light', '3,0': 'grow-light' },
    }), archetypes['grow-room']);

    expect(duplicatedId.lightingW).toBe(40);
    expect(paintedFootprints.lightingW).toBe(80);
  });

  it('keeps identical x/y lights on different levels separate in target summaries', () => {
    const bottom: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'bottom' };
    const top: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'top' };
    const targetPlan = plan({
      widthM: 1,
      heightM: 0.5,
      targets: {
        [growingTargetKey(bottom)]: { growingSpaceId: 'rack-a', levelId: 'bottom', planting: { '0,0': 1 } },
        [growingTargetKey(top)]: { growingSpaceId: 'rack-a', levelId: 'top', planting: { '0,0': 2 } },
      },
    });
    const environment = {
      layout: rackLayout(),
      instances: [
        instance('light-bottom', 'grow-light', { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'bottom' }),
        instance('light-top', 'grow-light', { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'top' }),
      ],
    };

    const room = equipmentTermsFor(targetPlan, archetypes['warehouse-vertical'], environment);
    const bottomTerms = equipmentTermsFor(targetPlan, archetypes['warehouse-vertical'], environment, bottom);
    const topTerms = equipmentTermsFor(targetPlan, archetypes['warehouse-vertical'], environment, top);

    expect(room.lightingW).toBe(80);
    expect(room.ppfdUmol).toBeCloseTo(208, 6);
    expect(room.tiers).toBe(4);
    expect(bottomTerms.lightingW).toBe(40);
    expect(topTerms.lightingW).toBe(40);
    expect(bottomTerms.ppfdUmol).toBeCloseTo(208, 6);
    expect(topTerms.ppfdUmol).toBeCloseTo(208, 6);
    expect(bottomTerms.tiers).toBe(1);
    expect(topTerms.tiers).toBe(1);
  });

  it('applies equipment by floor, environment, and level mount without leaking across targets', () => {
    const level: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'top' };
    const environment = {
      layout: rackLayout(),
      instances: [
        instance('global-co2', 'co2-tank', { kind: 'environment' }, 0, 0, 0.5, 0.5),
        instance('floor-water', 'rain-barrel', { kind: 'floor' }, 0, 0, 0.75, 0.75),
        instance('top-hydro', 'hydro-channel', { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'top' }, 0, 0, 1, 0.25),
        instance('bottom-water', 'ibc-tote', { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'bottom' }, 0, 0, 1.25, 1.25),
      ],
    };
    const targetPlan = plan({ widthM: 4, heightM: 3, targets: {
      [growingTargetKey(level)]: { growingSpaceId: 'rack-a', levelId: 'top', planting: { '0,0': 1 } },
    } });

    const room = equipmentTermsFor(targetPlan, archetypes['grow-room'], environment);
    const floor = equipmentTermsFor(targetPlan, archetypes['grow-room'], environment, { kind: 'floor' });
    const top = equipmentTermsFor(targetPlan, archetypes['grow-room'], environment, level);

    expect(room.waterStoreL).toBe(1200);
    expect(room.soilless).toBe(true);
    expect(room.co2TargetPpm).toBe(1000);
    expect(room.co2KgDay).toBe(2);
    expect(floor.waterStoreL).toBe(200);
    expect(floor.soilless).toBe(false);
    expect(floor.co2KgDay).toBe(2);
    expect(top.waterStoreL).toBe(0);
    expect(top.soilless).toBe(true);
    expect(top.co2KgDay).toBe(2);
  });

  it('sums HVAC and dehumidifier capacity, caps fan terms, and ignores unannotated props', () => {
    const equipment = [
      ...Array.from({ length: 8 }, (_, index) => instance(`fan-${index}`, 'clip-fan', { kind: 'environment' }, index, 0, 0.3, 0.3)),
      instance('hvac-1', 'hvac-unit', { kind: 'environment' }, 0, 0, 1, 0.4),
      instance('hvac-2', 'hvac-unit', { kind: 'environment' }, 1, 0, 1, 0.4),
      instance('dehum-1', 'dehumidifier', { kind: 'floor' }, 0, 0, 0.6, 0.6),
      instance('dehum-2', 'dehumidifier', { kind: 'floor' }, 1, 0, 0.6, 0.6),
      instance('nursery-1', 'seedling-tray', { kind: 'floor' }, 0, 1, 0.6, 0.3),
    ];
    const terms = equipmentTermsFor(plan(), archetypes['grow-room'], { instances: equipment });
    const withShed = equipmentTermsFor(plan(), archetypes['grow-room'], {
      instances: [...equipment, instance('shed', 'shed', { kind: 'floor' }, 3, 0, 2, 3)],
    });
    const zeroVent = equipmentTermsFor(plan(), { ...archetypes['grow-room'], achInfiltration: 0 }, { instances: equipment });

    expect(terms.achBoost).toBeCloseTo(0.9, 6);
    expect(terms.mixing).toBe(1);
    expect(terms.heatingKw).toBe(4);
    expect(terms.coolingKw).toBe(5);
    expect(terms.coolingElectricalKw).toBe(2);
    expect(terms.dehumLpd).toBe(40);
    expect(terms.nursery).toBe(true);
    expect(withShed).toEqual(terms);
    expect(zeroVent.achBoost).toBe(0);
    expect(zeroVent.mixing).toBe(1);
  });

  it('leaves hydro dry without a specified reservoir and requires explicit water storage', () => {
    const hydro = instance('hydro-1', 'hydro-channel', { kind: 'floor' }, 0, 0, 1, 0.25);
    const dry = equipmentTermsFor(plan(), archetypes['greenhouse-glass'], { instances: [hydro] });
    const watered = equipmentTermsFor(plan(), archetypes['greenhouse-glass'], {
      instances: [hydro, instance('water-1', 'rain-barrel', { kind: 'floor' }, 0, 0, 0.75, 0.75)],
    });

    expect(dry.soilless).toBe(true);
    expect(dry.waterStoreL).toBe(0);
    expect(dry).toMatchObject({ soilless: true, waterStoreL: 0 });
    expect(watered.waterStoreL).toBe(200);
  });

  it('returns zero physics for an empty plan or assets without catalog physics', () => {
    const empty = equipmentTermsFor(plan(), archetypes['grow-room']);
    const props = equipmentTermsFor(plan({ ground: { '0,0': 'grow-bench', '1,0': 'shed' } }), archetypes['grow-room']);

    expect(props).toEqual(empty);
    expect(empty).toMatchObject({
      ppfdUmol: 0,
      lightingW: 0,
      photoperiodH: 0,
      achBoost: 0,
      mixing: 0,
      heatingKw: 0,
      coolingKw: 0,
      coolingElectricalKw: 0,
      dehumLpd: 0,
      co2TargetPpm: null,
      co2KgDay: 0,
      tiers: 1,
      soilless: false,
      waterStoreL: 0,
      nursery: false,
    });
  });
});
