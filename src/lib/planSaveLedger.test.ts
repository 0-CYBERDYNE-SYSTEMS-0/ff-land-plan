import { describe, expect, it } from 'vitest';

import { PlanSaveLedger, type PlanSaveTarget } from '@/lib/planSaveLedger';
import type { PlanState } from '@/types';

const target: PlanSaveTarget = { farmId: 4, environmentId: 'env:4:2' };

function plan(planting: Record<string, number>): PlanState {
  return {
    farmId: target.farmId,
    widthM: 4,
    heightM: 3,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting,
    ground: {},
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

describe('PlanSaveLedger', () => {
  it('keeps a newer revision pending when an older acknowledgement arrives', () => {
    const ledger = new PlanSaveLedger();
    const first = ledger.stage(target, plan({ '0,0': 1 }));
    ledger.markSaving(target, first.revision);
    const second = ledger.stage(target, plan({ '0,0': 1, '1,0': 2 }));

    expect(ledger.acknowledge(target, first.revision)).toBe(false);
    expect(ledger.getPendingWorkSnapshot()).toEqual([{
      target,
      revision: second.revision,
      lastDurableRevision: first.revision,
      status: 'pending',
      plan: second.plan,
    }]);

    expect(ledger.acknowledge(target, second.revision)).toBe(true);
    expect(ledger.getPendingWorkSnapshot()).toEqual([]);
    expect(ledger.durableRevisionFor(target)).toBe(second.revision);
  });

  it('keeps the latest pending plan marked failed until a later acknowledgement', () => {
    const ledger = new PlanSaveLedger();
    const durable = ledger.stage(target, plan({ '0,0': 1 }));
    expect(ledger.acknowledge(target, durable.revision)).toBe(true);
    const failed = ledger.stage(target, plan({ '0,0': 1, '1,0': 2 }));
    ledger.markFailed(target, failed.revision);

    const retry = ledger.getPendingWorkSnapshot()[0]!;
    expect(retry).toMatchObject({ revision: failed.revision, status: 'failed', lastDurableRevision: durable.revision });
    expect(retry.plan.planting).toEqual({ '0,0': 1, '1,0': 2 });
    expect(ledger.acknowledge(target, failed.revision)).toBe(true);
    expect(ledger.hasPending()).toBe(false);
  });
});
