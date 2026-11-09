import { describe, expect, it } from 'vitest';

import { growingCellWorldPosition, parseTargetCellKey, planForTarget, planWithTarget, growingTargetKey, targetCellKey } from '@/lib/growingTargets';
import type { EnvironmentLayout, PlanState } from '@/types';

const plan: PlanState = {
  farmId: 1,
  widthM: 4,
  heightM: 4,
  cellM: 0.25,
  allowOutsideBeds: true,
  planting: { '1,2': 10 },
  ground: { '0,0': 'raised-bed' },
  plantedAt: { '1,2': '2026-10-24' },
  updatedAt: '2026-10-24T00:00:00.000Z',
};

describe('growing target identity', () => {
  it('keeps floor cell keys compatible and round-trips encoded level ids', () => {
    const floorCell = targetCellKey({ kind: 'floor' }, '1,2');
    const levelTarget = { kind: 'growing-level' as const, growingSpaceId: 'rack/a', levelId: 'level:3' };
    const levelCell = targetCellKey(levelTarget, '1,2');

    expect(floorCell).toBe('1,2');
    expect(parseTargetCellKey(floorCell)).toEqual({ target: { kind: 'floor' }, localCellKey: '1,2' });
    expect(parseTargetCellKey(levelCell)).toEqual({ target: levelTarget, localCellKey: '1,2' });
    expect(growingTargetKey(levelTarget)).toBe('level/rack%2Fa/level%3A3');
  });

  it('keeps target maps isolated while returning a floor-compatible editor view', () => {
    const target = { kind: 'growing-level' as const, growingSpaceId: 'rack-1', levelId: 'level-2' };
    const updated = planWithTarget(plan, target, {
      ...plan,
      planting: { '1,2': 20 },
      plantedAt: { '1,2': '2026-10-25' },
      ground: {},
    });

    expect(updated.planting).toEqual(plan.planting);
    expect(updated.plantedAt).toEqual(plan.plantedAt);
    expect(updated.ground).toEqual(plan.ground);
    expect(updated.targets?.[growingTargetKey(target)]).toEqual({
      growingSpaceId: 'rack-1',
      levelId: 'level-2',
      planting: { '1,2': 20 },
      plantedAt: { '1,2': '2026-10-25' },
    });
    expect(planForTarget(updated, target).planting).toEqual({ '1,2': 20 });
    expect(planForTarget(updated, { kind: 'floor' }).planting).toEqual(plan.planting);
  });

  it('maps identical local cells to their own finite floor and tier elevations', () => {
    const first = { kind: 'growing-level' as const, growingSpaceId: 'rack', levelId: 'lower' };
    const second = { kind: 'growing-level' as const, growingSpaceId: 'rack', levelId: 'upper' };
    const layout: EnvironmentLayout = {
      access: [],
      reservations: [],
      growingSpaces: [{
        id: 'rack', label: 'Rack', kind: 'rack', x: 0, y: 0, widthM: 1, depthM: 1,
        levels: [
          { id: 'lower', label: 'Lower', elevationM: 0.7, planting: {} },
          { id: 'upper', label: 'Upper', elevationM: 1.4, planting: {} },
        ],
      }],
    };

    const lower = growingCellWorldPosition(targetCellKey(first, '1,2'), plan, { layout });
    const upper = growingCellWorldPosition(targetCellKey(second, '1,2'), plan, { layout });
    const floor = growingCellWorldPosition('1,2', plan, { layout });

    expect(lower).toMatchObject({ localCellKey: '1,2', x: upper?.x, z: upper?.z, y: 0.7 });
    expect(upper).toMatchObject({ localCellKey: '1,2', x: lower?.x, z: lower?.z, y: 1.4 });
    expect(floor).toMatchObject({ localCellKey: '1,2', x: lower?.x, z: lower?.z, y: 0 });
    expect([lower?.x, lower?.y, lower?.z, upper?.x, upper?.y, upper?.z].every(Number.isFinite)).toBe(true);
  });

  it('rejects malformed, out-of-bounds, or orphaned target addresses', () => {
    const target = { kind: 'growing-level' as const, growingSpaceId: 'missing', levelId: 'upper' };
    expect(growingCellWorldPosition('oops', plan, undefined)).toBeNull();
    expect(growingCellWorldPosition('99,99', plan, undefined)).toBeNull();
    expect(growingCellWorldPosition(targetCellKey(target, '1,2'), plan, undefined)).toBeNull();
  });
});
