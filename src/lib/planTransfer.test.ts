import { describe, expect, it } from 'vitest';
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

  it('rejects malformed or unsupported files without returning a partial plan', () => {
    expect(() => parsePlanJson('{', 1)).toThrow('not valid JSON');
    expect(() => parsePlanJson('{"format":"other","version":1,"plan":{}}', 1)).toThrow('Unsupported plan file');
    const malformed = JSON.parse(serializePlanJson(plan)) as { plan: PlanState };
    malformed.plan.planting['bad-key'] = 1;
    expect(() => parsePlanJson(JSON.stringify(malformed), 1)).toThrow('invalid cell');
  });
});
