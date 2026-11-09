import type { PlanState } from '@/types';

export interface PlanSaveTarget {
  farmId: number;
  environmentId: string | null;
}

export type PlanSaveStatus = 'pending' | 'saving' | 'failed';

export interface PendingPlanSaveSnapshot {
  target: PlanSaveTarget;
  revision: number;
  lastDurableRevision: number;
  status: PlanSaveStatus;
  plan: PlanState;
}

interface LedgerEntry {
  target: PlanSaveTarget;
  revision: number;
  status: PlanSaveStatus;
  plan: PlanState;
}

export function planSaveTargetKey(target: PlanSaveTarget): string {
  return `${target.farmId}:${target.environmentId ?? 'legacy'}`;
}

/** Tracks pending edits and durable acknowledgements independently per farm/world. */
export class PlanSaveLedger {
  private readonly nextRevision = new Map<string, number>();
  private readonly durableRevision = new Map<string, number>();
  private readonly pending = new Map<string, LedgerEntry>();

  stage(target: PlanSaveTarget, plan: PlanState): PendingPlanSaveSnapshot {
    const key = planSaveTargetKey(target);
    const revision = (this.nextRevision.get(key) ?? 0) + 1;
    const previous = this.pending.get(key);
    this.nextRevision.set(key, revision);
    const entry: LedgerEntry = {
      target: { ...target },
      revision,
      status: previous?.status === 'failed' ? 'failed' : 'pending',
      plan: structuredClone(plan),
    };
    this.pending.set(key, entry);
    return this.snapshotEntry(key, entry);
  }

  nextPending(): PendingPlanSaveSnapshot | null {
    for (const [key, entry] of this.pending) {
      if (entry.status !== 'saving') return this.snapshotEntry(key, entry);
    }
    return null;
  }

  markSaving(target: PlanSaveTarget, revision: number): void {
    this.updateStatus(target, revision, 'saving');
  }

  markFailed(target: PlanSaveTarget, revision: number): void {
    const key = planSaveTargetKey(target);
    const entry = this.pending.get(key);
    if (entry && entry.revision >= revision) entry.status = 'failed';
  }

  acknowledge(target: PlanSaveTarget, revision: number): boolean {
    const key = planSaveTargetKey(target);
    const durable = Math.max(this.durableRevision.get(key) ?? 0, revision);
    this.durableRevision.set(key, durable);
    const current = this.pending.get(key);
    if (current?.revision === revision) this.pending.delete(key);
    return (this.nextRevision.get(key) ?? 0) === revision;
  }

  durableRevisionFor(target: PlanSaveTarget): number {
    return this.durableRevision.get(planSaveTargetKey(target)) ?? 0;
  }

  getPendingWorkSnapshot(): PendingPlanSaveSnapshot[] {
    return [...this.pending].map(([key, entry]) => this.snapshotEntry(key, entry));
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  private updateStatus(target: PlanSaveTarget, revision: number, status: PlanSaveStatus): void {
    const key = planSaveTargetKey(target);
    const entry = this.pending.get(key);
    if (entry?.revision === revision) entry.status = status;
  }

  private snapshotEntry(key: string, entry: LedgerEntry): PendingPlanSaveSnapshot {
    return {
      target: { ...entry.target },
      revision: entry.revision,
      lastDurableRevision: this.durableRevision.get(key) ?? 0,
      status: entry.status,
      plan: structuredClone(entry.plan),
    };
  }
}
