// Mock advice provider (SPEC-JEV-ADVICE): deterministic FNV-1a-style hash of
// the cellKey → plausible verdicts, mirroring the decision bench in the field
// brief. Same seed ⇒ identical rebuilds; used for UI development and smoke
// tests so flag-on behaviour is reproducible without a live endpoint.

import { parseKey } from '@/lib/plan';
import type { Crop, PlanState } from '@/types';
import type { AdviceProvider, AdviceScan, CellAdvice, CompanionVerdict, SeasonFit, SpacingRisk } from './types';

/** 32-bit FNV-1a over the key's char codes (>>> 0 keeps it unsigned). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic 0..1 roll for a (cellKey, channel) pair. */
const roll = (key: string, channel: string) => (fnv1a(`${key}:${channel}`) % 1000) / 1000;

/** Deterministic 0.62..0.94 confidence so some marks render hollow (< 0.75). */
const confidence = (key: string, channel: string) => 0.62 + (fnv1a(`${key}:${channel}:c`) % 33) / 100;

function pickSeason(r: number): SeasonFit {
  return r < 0.5 ? 'good' : r < 0.85 ? 'fair' : 'poor';
}
function pickSpacing(r: number): SpacingRisk {
  return r < 0.72 ? 'ok' : r < 0.9 ? 'tight' : 'violation';
}
function pickCompanion(r: number): CompanionVerdict {
  return r < 0.6 ? 'neutral' : r < 0.85 ? 'ally' : 'conflict';
}

export const mockProvider: AdviceProvider = {
  id: 'mock',
  async scan(plan: PlanState, _cropById: Map<number, Crop>): Promise<AdviceScan> {
    const cells: Record<string, CellAdvice> = {};
    for (const key of Object.keys(plan.planting)) {
      const [x, y] = parseKey(key);
      cells[key] = {
        cellKey: key,
        x,
        y,
        seasonFit: { verdict: pickSeason(roll(key, 'season')), confidence: confidence(key, 'season') },
        spacingRisk: { verdict: pickSpacing(roll(key, 'spacing')), confidence: confidence(key, 'spacing') },
        companion: { verdict: pickCompanion(roll(key, 'companion')), confidence: confidence(key, 'companion') },
      };
    }
    return { source: 'mock', cells, scannedAt: Date.now() };
  },
};
