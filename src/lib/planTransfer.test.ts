import { describe, expect, it } from 'vitest';
import { growingTargetKey, planForTarget, planWithTarget } from '@/lib/growingTargets';
import type { GrowingTargetRef } from '@/types';
import type { PlanState } from '@/types';
import { parsePlanJson, serializePlanJson } from './planTransfer';

const plan: PlanState = {
  farmId: 2,
  widthM: 10,
  heightM: 8,
  cellM: 0.25,
  allowOutsideBeds: false,
  surface: 'hoophouse',
  planting: { '3,4': 1, '5,7': 1000 },
  ground: { '2,2': 'raised-bed', '6,6': 'water-tap' },
  updatedAt: '2026-10-17T12:00:00.000Z',
  plantedAt: { '3,4': '2026-09-01T00:00:00.000Z' },
};

describe('plan JSON transfer', () => {
  it('round-trips all plan fields and binds an import to its target farm', () => {
    const exported = serializePlanJson(plan);
    expect(parsePlanJson(exported, plan.farmId)).toEqual(plan);
    expect(parsePlanJson(exported, 9)).toEqual({ ...plan, farmId: 9 });
  });

  it('round-trips the selected growing level without replacing sibling target maps', () => {
    const lower: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'lower' };
    const upper: GrowingTargetRef = { kind: 'growing-level', growingSpaceId: 'rack-a', levelId: 'upper' };
    const lowerKey = growingTargetKey(lower);
    const upperKey = growingTargetKey(upper);
    const worldPlan: PlanState = {
      ...plan,
      targets: {
        [lowerKey]: { growingSpaceId: 'rack-a', levelId: 'lower', planting: { '1,1': 2 } },
        [upperKey]: { growingSpaceId: 'rack-a', levelId: 'upper', planting: { '2,2': 3 } },
      },
    };
    const selectedView = { ...planForTarget(worldPlan, upper), planting: { '4,5': 1000 } };
    const exported = serializePlanJson(selectedView);
    expect((JSON.parse(exported) as { plan: PlanState }).plan.targets).toBeUndefined();

    const imported = parsePlanJson(exported, 9);
    const saved = planWithTarget({ ...worldPlan, farmId: 9 }, upper, imported);
    expect(saved.targets?.[upperKey]?.planting).toEqual({ '4,5': 1000 });
    expect(saved.targets?.[lowerKey]).toEqual(worldPlan.targets?.[lowerKey]);
  });

  it('rejects malformed or unsupported files without returning a partial plan', () => {
    expect(() => parsePlanJson('{', 1)).toThrow('not valid JSON');
    expect(() => parsePlanJson('{"format":"other","version":1,"plan":{}}', 1)).toThrow('Unsupported plan file');
    const malformed = JSON.parse(serializePlanJson(plan)) as { plan: PlanState };
    malformed.plan.planting['bad-key'] = 1;
    expect(() => parsePlanJson(JSON.stringify(malformed), 1)).toThrow('invalid cell');

    const ambiguous = JSON.parse(serializePlanJson(plan)) as { plan: PlanState };
    ambiguous.plan.targets = {
      'level/rack-a/upper': { growingSpaceId: 'rack-a', levelId: 'upper', planting: { '0,0': 1 } },
    };
    expect(() => parsePlanJson(JSON.stringify(ambiguous), 1)).toThrow('selected growing target');
  });
});
