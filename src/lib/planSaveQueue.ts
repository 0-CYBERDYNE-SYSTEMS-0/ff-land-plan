import { apiFetch } from '@/lib/api';
import { dispatchStorageFailed, dispatchStorageSaved } from '@/lib/db';
import { PlanSaveLedger, type PendingPlanSaveSnapshot, type PlanSaveTarget } from '@/lib/planSaveLedger';
import { queryClient } from '@/lib/queryClient';
import { persistNow, registerStorageRetryHandler, setEditorPendingWork } from '@/lib/store';
import type { PlanState, SitePlan } from '@/types';

export type PlanSaveUiState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface PlanSaveUiSnapshot {
  state: PlanSaveUiState;
  savedAt: string | null;
  error: string | null;
}

export interface PlanSaveEventDetail extends PlanSaveUiSnapshot {
  farmId: number;
  acknowledgement?: {
    target: PlanSaveTarget;
    revision: number;
    saved: PlanState;
    current: boolean;
  };
}

const AUTOSAVE_MS = 600;
const ledger = new PlanSaveLedger();
const savedAtByFarm = new Map<number, string>();
const errorByFarm = new Map<number, string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<boolean> | null = null;
let flushingForPagehide = false;

function pendingForFarm(farmId: number): PendingPlanSaveSnapshot[] {
  return ledger.getPendingWorkSnapshot().filter((entry) => entry.target.farmId === farmId);
}

function uiSnapshot(farmId: number): PlanSaveUiSnapshot {
  const pending = pendingForFarm(farmId);
  if (pending.some((entry) => entry.status === 'failed')) {
    return { state: 'error', savedAt: savedAtByFarm.get(farmId) ?? null, error: errorByFarm.get(farmId) ?? 'The plan save failed.' };
  }
  if (pending.some((entry) => entry.status === 'saving')) {
    return { state: 'saving', savedAt: savedAtByFarm.get(farmId) ?? null, error: null };
  }
  if (pending.length > 0) {
    return { state: 'dirty', savedAt: savedAtByFarm.get(farmId) ?? null, error: errorByFarm.get(farmId) ?? null };
  }
  return {
    state: savedAtByFarm.has(farmId) ? 'saved' : 'idle',
    savedAt: savedAtByFarm.get(farmId) ?? null,
    error: null,
  };
}

function publish(farmId: number, acknowledgement?: PlanSaveEventDetail['acknowledgement']): void {
  if (typeof window === 'undefined') return;
  const detail: PlanSaveEventDetail = {
    farmId,
    ...uiSnapshot(farmId),
    ...(acknowledgement ? { acknowledgement } : {}),
  };
  window.dispatchEvent(new CustomEvent<PlanSaveEventDetail>('plan-save-state', { detail }));
}

export function getPlanSaveStatus(farmId: number): PlanSaveUiSnapshot {
  return uiSnapshot(farmId);
}

/** Snapshot contract for BETA-03; pending entries include their last durable revision. */
export function getPendingPlanWorkSnapshot(farmId?: number): PendingPlanSaveSnapshot[] {
  const pending = ledger.getPendingWorkSnapshot();
  return farmId === undefined ? pending : pending.filter((entry) => entry.target.farmId === farmId);
}

export function siteWithPlanSnapshot(site: SitePlan, environmentId: string, plan: PlanState): SitePlan {
  return {
    ...site,
    environments: site.environments.map((environment) => environment.id === environmentId
      ? { ...environment, plan: structuredClone(plan) }
      : environment),
  };
}

export function siteWithPendingPlanSnapshots(site: SitePlan): SitePlan {
  const pendingByEnvironment = new Map(getPendingPlanWorkSnapshot(site.farmId)
    .filter((entry) => entry.target.environmentId !== null)
    .map((entry) => [entry.target.environmentId!, entry.plan]));
  if (pendingByEnvironment.size === 0) return site;
  return {
    ...site,
    environments: site.environments.map((environment) => {
      const pendingPlan = pendingByEnvironment.get(environment.id);
      return pendingPlan ? { ...environment, plan: structuredClone(pendingPlan) } : environment;
    }),
  };
}

export function stagePlanSave(target: PlanSaveTarget, plan: PlanState): PendingPlanSaveSnapshot {
  const snapshot = ledger.stage(target, plan);
  setEditorPendingWork(ledger.hasPending());
  publish(target.farmId);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { void flushPendingPlanSaves(); }, AUTOSAVE_MS);
  return snapshot;
}

export function flushPendingPlanSaves(): Promise<boolean> {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  if (flushPromise) return flushPromise;

  const flush = async (): Promise<boolean> => {
    while (true) {
      const pending = ledger.nextPending();
      if (!pending) return true;
      ledger.markSaving(pending.target, pending.revision);
      publish(pending.target.farmId);
      try {
        const saving = apiFetch.savePlan(pending.plan, pending.target.environmentId ?? undefined);
        // The local API mutates the app blob before its first await. During
        // pagehide, commit that snapshot synchronously; unload cannot wait for
        // the normal debounced persistence acknowledgement.
        if (flushingForPagehide) persistNow();
        const saved = await saving;
        const current = ledger.acknowledge(pending.target, pending.revision);
        if (current) {
          if (pending.target.environmentId === null) {
            queryClient.setQueryData(['plan', pending.target.farmId], saved);
          } else {
            queryClient.setQueryData(['plan', pending.target.farmId, pending.target.environmentId], saved);
            queryClient.setQueryData<SitePlan | null>(['site-plan', pending.target.farmId], (site) => site
              ? {
                ...site,
                environments: site.environments.map((environment) => environment.id === pending.target.environmentId
                  ? { ...environment, plan: structuredClone(saved) }
                  : environment),
              }
              : site);
          }
        }
        savedAtByFarm.set(pending.target.farmId, new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        if (current) errorByFarm.delete(pending.target.farmId);
        setEditorPendingWork(ledger.hasPending());
        publish(pending.target.farmId, { target: pending.target, revision: pending.revision, saved, current });
        if (!ledger.hasPending()) {
          dispatchStorageSaved('plan save', pending.revision);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ledger.markFailed(pending.target, pending.revision);
        errorByFarm.set(pending.target.farmId, message);
        setEditorPendingWork(ledger.hasPending());
        publish(pending.target.farmId);
        dispatchStorageFailed('plan save', error);
        return false;
      }
    }
  };

  const current = flush();
  flushPromise = current;
  void current.finally(() => {
    if (flushPromise === current) flushPromise = null;
  });
  return current;
}

/** Keep destructive world removal behind a successful acknowledgement of all pending plans. */
export async function deleteWorldAfterPlanSave(deleteWorld: () => Promise<void>): Promise<void> {
  if (!await flushPendingPlanSaves()) {
    throw new Error('The plan could not be saved, so this growing world was not deleted. Retry the save and try again.');
  }
  await deleteWorld();
}

registerStorageRetryHandler(async () => {
  if (!ledger.hasPending()) return null;
  return flushPendingPlanSaves();
});

if (typeof window !== 'undefined') {
  const flushBeforeExit = () => {
    flushingForPagehide = true;
    void flushPendingPlanSaves().finally(() => { flushingForPagehide = false; });
  };
  window.addEventListener('pagehide', flushBeforeExit);
  window.addEventListener('beforeunload', flushBeforeExit);
}
