import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanState, SitePlan } from '@/types';

const mocks = vi.hoisted(() => ({
  savePlan: vi.fn(),
  dispatchStorageFailed: vi.fn(),
  dispatchStorageSaved: vi.fn(),
  setEditorPendingWork: vi.fn(),
  persistNow: vi.fn(() => true),
  registerStorageRetryHandler: vi.fn((_handler: () => Promise<boolean | null>) => undefined),
}));

vi.mock('@/lib/api', () => ({ apiFetch: { savePlan: mocks.savePlan } }));
vi.mock('@/lib/db', () => ({
  dispatchStorageFailed: mocks.dispatchStorageFailed,
  dispatchStorageSaved: mocks.dispatchStorageSaved,
}));
vi.mock('@/lib/store', () => ({
  setEditorPendingWork: mocks.setEditorPendingWork,
  persistNow: mocks.persistNow,
  registerStorageRetryHandler: (handler: () => Promise<boolean | null>) => {
    mocks.registerStorageRetryHandler(handler);
    return () => undefined;
  },
}));

function plan(farmId: number, value: number): PlanState {
  return {
    farmId,
    widthM: 4,
    heightM: 3,
    cellM: 0.25,
    allowOutsideBeds: true,
    planting: { '0,0': value },
    ground: {},
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

async function loadQueue() {
  vi.resetModules();
  const windowTarget = new EventTarget();
  vi.stubGlobal('window', windowTarget);
  const [queue, query] = await Promise.all([
    import('@/lib/planSaveQueue'),
    import('@/lib/queryClient'),
  ]);
  const retryHandler = mocks.registerStorageRetryHandler.mock.calls.at(-1)?.[0];
  return { queue, queryClient: query.queryClient, windowTarget, retryHandler };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('tab-level plan save queue', () => {
  it('keeps the debounce and captures each selected target for the pagehide flush', async () => {
    const { queue, windowTarget } = await loadQueue();
    mocks.savePlan.mockImplementation(async (saved: PlanState) => structuredClone(saved));
    const firstTarget = { farmId: 4, environmentId: 'env:4:1' };
    const switchedTarget = { farmId: 4, environmentId: 'env:4:2' };
    queue.stagePlanSave(firstTarget, plan(4, 1));
    queue.stagePlanSave(switchedTarget, plan(4, 2));

    expect(mocks.savePlan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(599);
    expect(mocks.savePlan).not.toHaveBeenCalled();

    windowTarget.dispatchEvent(new Event('pagehide'));
    await queue.flushPendingPlanSaves();

    expect(mocks.savePlan.mock.calls.map(([saved, target]) => [saved.farmId, target, saved.planting['0,0']]))
      .toEqual([[4, 'env:4:1', 1], [4, 'env:4:2', 2]]);
    expect(queue.getPendingPlanWorkSnapshot()).toEqual([]);
  });

  it('acknowledges the requested revision even if an unrelated later save fails', async () => {
    const { queue } = await loadQueue();
    const importedTarget = { farmId: 4, environmentId: 'env:4:1' };
    const unrelatedTarget = { farmId: 5, environmentId: null };
    queue.stagePlanSave(importedTarget, plan(4, 7));
    const importedRevision = queue.getPendingPlanWorkSnapshot(4)[0]!;
    queue.stagePlanSave(unrelatedTarget, plan(5, 8));
    mocks.savePlan.mockImplementationOnce(async (saved: PlanState) => structuredClone(saved))
      .mockRejectedValueOnce(new Error('Unrelated plan failed'));

    expect(await queue.flushPlanSaveRevision(importedRevision)).toBe(true);
    expect(queue.getPendingPlanWorkSnapshot(4)).toEqual([]);
    expect(queue.getPendingPlanWorkSnapshot(5)).toMatchObject([{ status: 'failed' }]);
  });

  it('does not acknowledge an import revision that was superseded before it reached storage', async () => {
    const { queue } = await loadQueue();
    const target = { farmId: 4, environmentId: 'env:4:1' };
    const importedRevision = queue.stagePlanSave(target, plan(4, 7));
    queue.stagePlanSave(target, plan(4, 9));
    mocks.savePlan.mockImplementation(async (saved: PlanState) => structuredClone(saved));

    expect(await queue.flushPlanSaveRevision(importedRevision)).toBe(false);
    expect(await queue.flushPendingPlanSaves()).toBe(true);
    expect(mocks.savePlan).toHaveBeenCalledTimes(1);
    expect(mocks.savePlan.mock.calls[0]?.[0].planting['0,0']).toBe(9);
  });

  it('keeps a failed snapshot available after navigation and retries through the tab handler', async () => {
    const { queue, queryClient, retryHandler } = await loadQueue();
    const target = { farmId: 8, environmentId: 'env:8:1' };
    queue.stagePlanSave(target, plan(8, 6));
    mocks.savePlan.mockRejectedValueOnce(new Error('Temporary storage failure'))
      .mockImplementation(async (saved: PlanState) => structuredClone(saved));

    expect(await queue.flushPendingPlanSaves()).toBe(false);
    expect(queue.getPlanSaveStatus(8)).toMatchObject({ state: 'error' });
    expect(queue.getPendingPlanWorkSnapshot(8)).toMatchObject([{
      target,
      revision: 1,
      lastDurableRevision: 0,
      status: 'failed',
      plan: { planting: { '0,0': 6 } },
    }]);

    expect(retryHandler).toBeTypeOf('function');
    expect(await retryHandler!()).toBe(true);
    expect(queue.getPendingPlanWorkSnapshot(8)).toEqual([]);
    expect(queue.getPlanSaveStatus(8).state).toBe('saved');
    expect(queryClient.getQueryData(['plan', 8, 'env:8:1'])).toMatchObject({ planting: { '0,0': 6 } });
    expect(mocks.savePlan).toHaveBeenCalledTimes(2);
  });

  it('restores the latest failed plan over stale site data before a later edit replaces its snapshot', async () => {
    const { queue } = await loadQueue();
    const target = { farmId: 9, environmentId: 'env:9:1' };
    queue.stagePlanSave(target, plan(9, 5));
    mocks.savePlan.mockRejectedValueOnce(new Error('Temporary storage failure'));
    expect(await queue.flushPendingPlanSaves()).toBe(false);

    const stalePlan = plan(9, 1);
    const staleSite: SitePlan = {
      farmId: 9,
      widthM: 8,
      heightM: 6,
      cellM: 0.25,
      environments: [
        {
          id: 'env:9:1', farmId: 9, archetype: 'open-field', label: 'Field 1',
          x: 0, y: 0, widthM: 4, heightM: 3, cellM: 0.25, plan: stalePlan,
        },
        {
          id: 'env:9:2', farmId: 9, archetype: 'open-field', label: 'Field 2',
          x: 4, y: 0, widthM: 4, heightM: 3, cellM: 0.25, plan: plan(9, 2),
        },
      ],
      updatedAt: '2026-10-26T00:00:00.000Z',
    };

    const restoredSite = queue.siteWithPendingPlanSnapshots(staleSite);
    expect(restoredSite.environments[0]?.plan.planting).toEqual({ '0,0': 5 });
    // Simulate switching to another world and back, then editing from the
    // restored canonical plan rather than the stale query result.
    const returnedEnvironment = restoredSite.environments.find((entry) => entry.id === target.environmentId)!;
    const editedPlan = {
      ...returnedEnvironment.plan,
      planting: { ...returnedEnvironment.plan.planting, '1,0': 8 },
    };
    const siteAfterEdit = queue.siteWithPlanSnapshot(restoredSite, target.environmentId!, editedPlan);
    queue.stagePlanSave(target, siteAfterEdit.environments[0]!.plan);

    expect(queue.getPendingPlanWorkSnapshot(9)).toMatchObject([{
      target,
      revision: 2,
      status: 'failed',
      plan: { planting: { '0,0': 5, '1,0': 8 } },
    }]);
  });

  it('prevents growing-world deletion and history mutation when the pending plan save fails', async () => {
    const { queue } = await loadQueue();
    queue.stagePlanSave({ farmId: 5, environmentId: 'env:5:1' }, plan(5, 4));
    mocks.savePlan.mockRejectedValueOnce(new Error('Quota exceeded'));
    const deleteWorldAndRecordHistory = vi.fn(async () => undefined);

    await expect(queue.deleteWorldAfterPlanSave(deleteWorldAndRecordHistory))
      .rejects.toThrow(/plan could not be saved.*world was not deleted/i);

    expect(deleteWorldAndRecordHistory).not.toHaveBeenCalled();
    expect(queue.getPendingPlanWorkSnapshot(5)).toMatchObject([{ status: 'failed', plan: { planting: { '0,0': 4 } } }]);
  });

  it('marks the latest staged revision failed when an older in-flight save fails', async () => {
    const { queue } = await loadQueue();
    const target = { farmId: 7, environmentId: 'env:7:1' };
    let rejectFirst!: (error: Error) => void;
    const firstSave = new Promise<PlanState>((_resolve, reject) => { rejectFirst = reject; });
    mocks.savePlan.mockReturnValueOnce(firstSave)
      .mockImplementation(async (saved: PlanState) => structuredClone(saved));

    queue.stagePlanSave(target, plan(7, 1));
    const inFlight = queue.flushPendingPlanSaves();
    expect(mocks.savePlan).toHaveBeenCalledTimes(1);
    queue.stagePlanSave(target, plan(7, 2));
    rejectFirst(new Error('Old revision failed'));

    expect(await inFlight).toBe(false);
    expect(queue.getPendingPlanWorkSnapshot(7)).toMatchObject([{
      target,
      revision: 2,
      lastDurableRevision: 0,
      status: 'failed',
      plan: { planting: { '0,0': 2 } },
    }]);
    expect(mocks.dispatchStorageSaved).not.toHaveBeenCalledWith('plan save', expect.anything());

    expect(await queue.flushPendingPlanSaves()).toBe(true);
    expect(mocks.savePlan.mock.calls[1]?.[0].planting['0,0']).toBe(2);
    expect(queue.getPendingPlanWorkSnapshot(7)).toEqual([]);
    expect(mocks.dispatchStorageSaved).toHaveBeenCalledWith('plan save', 2);
  });

  it('does not let an older successful acknowledgement regress plan or site query caches', async () => {
    const { queue, queryClient } = await loadQueue();
    const target = { farmId: 7, environmentId: 'env:7:1' };
    const previousPlan = plan(7, 0);
    const newerPlan = plan(7, 2);
    const site: SitePlan = {
      farmId: 7,
      widthM: 4,
      heightM: 3,
      cellM: 0.25,
      environments: [{
        id: 'env:7:1', farmId: 7, archetype: 'open-field', label: 'Field',
        x: 0, y: 0, widthM: 4, heightM: 3, cellM: 0.25, plan: previousPlan,
      }],
      updatedAt: '2026-10-26T00:00:00.000Z',
    };
    queryClient.setQueryData(['plan', 7, target.environmentId], previousPlan);
    queryClient.setQueryData(['site-plan', 7], site);
    let finishFirst!: (saved: PlanState) => void;
    let finishSecond!: (saved: PlanState) => void;
    const firstSave = new Promise<PlanState>((resolve) => { finishFirst = resolve; });
    const secondSave = new Promise<PlanState>((resolve) => { finishSecond = resolve; });
    mocks.savePlan.mockReturnValueOnce(firstSave).mockReturnValueOnce(secondSave);

    queue.stagePlanSave(target, plan(7, 1));
    const flushing = queue.flushPendingPlanSaves();
    queue.stagePlanSave(target, newerPlan);
    finishFirst(plan(7, 1));
    await Promise.resolve();

    expect(mocks.savePlan).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(['plan', 7, target.environmentId])).toEqual(previousPlan);
    expect(queryClient.getQueryData<SitePlan>(['site-plan', 7])?.environments[0]?.plan).toEqual(previousPlan);

    finishSecond(newerPlan);
    expect(await flushing).toBe(true);
    expect(queryClient.getQueryData(['plan', 7, target.environmentId])).toEqual(newerPlan);
    expect(queryClient.getQueryData<SitePlan>(['site-plan', 7])?.environments[0]?.plan).toEqual(newerPlan);
  });

  it('does not clear the plan-save failure until pending work for every farm is durable', async () => {
    const { queue } = await loadQueue();
    let finishSecond!: (saved: PlanState) => void;
    const secondSave = new Promise<PlanState>((resolve) => { finishSecond = resolve; });
    mocks.savePlan.mockImplementation((saved: PlanState, environmentId?: string) =>
      environmentId === 'env:2:1' ? secondSave : Promise.resolve(structuredClone(saved)));
    queue.stagePlanSave({ farmId: 1, environmentId: 'env:1:1' }, plan(1, 1));
    queue.stagePlanSave({ farmId: 2, environmentId: 'env:2:1' }, plan(2, 2));

    const flushing = queue.flushPendingPlanSaves();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.savePlan).toHaveBeenCalledTimes(2);
    expect(mocks.dispatchStorageSaved).not.toHaveBeenCalledWith('plan save', expect.anything());
    finishSecond(plan(2, 2));
    expect(await flushing).toBe(true);
    expect(mocks.dispatchStorageSaved).toHaveBeenCalledTimes(1);
  });

  it('starts a pending save immediately on pagehide', async () => {
    const { queue, windowTarget } = await loadQueue();
    mocks.savePlan.mockImplementation(async (saved: PlanState) => structuredClone(saved));
    queue.stagePlanSave({ farmId: 2, environmentId: null }, plan(2, 3));

    windowTarget.dispatchEvent(new Event('pagehide'));
    expect(mocks.savePlan).toHaveBeenCalledTimes(1);
    expect(mocks.persistNow).toHaveBeenCalledTimes(1);
    await queue.flushPendingPlanSaves();
    expect(queue.getPendingPlanWorkSnapshot(2)).toEqual([]);
  });
});
