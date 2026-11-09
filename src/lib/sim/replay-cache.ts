import { createRun, stepDay, type SimRunCtx } from './engine';
import type { RunRecord, SimState } from './types';
import { canonicalizeObservations } from './observations';
import { inspectRunModelSupport } from './model-inputs';

interface ReplayEntry {
  runId: string;
  dayIndex: number;
  state: SimState;
}

/** Small LRU of immutable post-day states. The limit is shared across runs. */
export class ReplayStateCache {
  private readonly entries = new Map<string, ReplayEntry>();

  constructor(readonly limit = 64) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Replay cache limit must be a positive integer.');
  }

  get size(): number {
    return this.entries.size;
  }

  get(runId: string, dayIndex: number): SimState | undefined {
    const key = JSON.stringify([runId, dayIndex]);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.state;
  }

  nearestAtOrBefore(runId: string, dayIndex: number): SimState | undefined {
    let bestKey: string | undefined;
    let bestEntry: ReplayEntry | undefined;
    for (const [key, entry] of this.entries) {
      if (entry.runId === runId && entry.dayIndex <= dayIndex
        && (!bestEntry || entry.dayIndex > bestEntry.dayIndex)) {
        bestKey = key;
        bestEntry = entry;
      }
    }
    if (!bestKey || !bestEntry) return undefined;
    this.entries.delete(bestKey);
    this.entries.set(bestKey, bestEntry);
    return bestEntry.state;
  }

  set(runId: string, dayIndex: number, state: SimState): void {
    const key = JSON.stringify([runId, dayIndex]);
    this.entries.delete(key);
    this.entries.set(key, { runId, dayIndex, state });
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  invalidateRun(runId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.runId === runId) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const replayStateCache = new ReplayStateCache(64);

export class UnsupportedRunReplayError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(' ') || 'This run does not have supported frozen model inputs.');
    this.name = 'UnsupportedRunReplayError';
  }
}

type ReplayableRun = Pick<RunRecord, 'id' | 'config' | 'envSeries' | 'observations'>;

/** Fold from the nearest cached completed-day state, then cache each new boundary. */
export function replayRunToDay(
  run: ReplayableRun,
  targetDay: number,
  ctx: SimRunCtx = {},
  cache: ReplayStateCache = replayStateCache,
): SimState {
  const support = inspectRunModelSupport(run.config);
  if (!support.canReplay) throw new UnsupportedRunReplayError(support.reasons);
  const requested = Number.isFinite(targetDay) ? Math.round(targetDay) : 0;
  const dayCount = Math.min(run.envSeries.length, Math.max(0, requested));
  const observations = canonicalizeObservations(run.observations ?? []);
  let state = cache.nearestAtOrBefore(run.id, dayCount);
  if (!state) {
    state = createRun(run.config, ctx);
    cache.set(run.id, 0, state);
  }
  for (let day = state.dayIndex; day < dayCount; day += 1) {
    state = stepDay(state, run.envSeries[day]!, run.config, ctx, observations).state;
    cache.set(run.id, state.dayIndex, state);
  }
  return state;
}
