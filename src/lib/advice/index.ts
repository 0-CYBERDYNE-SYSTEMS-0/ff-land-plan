// Advice seam entry point (SPEC-JEV-ADVICE): env config resolution, provider
// selection, and the pure scan→overlay mapping consumed by AdvicePanel +
// renderPlan's opt-in adviceDots layer. With VITE_ADVICE_URL and
// VITE_ADVICE_MOCK unset, enabled is false and nothing else in the app
// activates — the seam is invisible.

import { heuristicProvider } from './heuristic';
import { createJevProvider } from './jev';
import { mockProvider } from './mock';
import type { AdviceProvider, AdviceScan, CellAdvice } from './types';

export type { AdviceProvider, AdviceScan, AdviceSource, CellAdvice, CompanionVerdict, SeasonFit, SpacingRisk } from './types';

export interface AdviceConfig {
  /** False ⇒ the whole seam is inert (AdvicePanel renders null). */
  enabled: boolean;
  mode: 'mock' | 'live' | null;
}

/** VITE_ADVICE_MOCK=1 wins over the URL (cheap flag-on testing); empty string
 *  counts as unset so a copied .env.example never half-enables the seam. */
export function resolveAdviceConfig(): AdviceConfig {
  const mockFlag = import.meta.env.VITE_ADVICE_MOCK;
  if (typeof mockFlag === 'string' && mockFlag !== '' && mockFlag !== '0') {
    return { enabled: true, mode: 'mock' };
  }
  const url = import.meta.env.VITE_ADVICE_URL;
  if (typeof url === 'string' && url.trim() !== '') {
    return { enabled: true, mode: 'live' };
  }
  return { enabled: false, mode: null };
}

export function getAdviceProvider(config: AdviceConfig): AdviceProvider | null {
  if (!config.enabled || config.mode === null) return null;
  if (config.mode === 'mock') return mockProvider;
  const url = import.meta.env.VITE_ADVICE_URL;
  if (typeof url === 'string' && url.trim() !== '') return createJevProvider(url);
  return heuristicProvider;
}

// --- Scan → overlay dots ------------------------------------------------------

export type AdviceLevel = 'ok' | 'warn' | 'bad';

/** Corner-dot payload for RenderOptions.adviceDots (structurally identical to
 *  the inline renderPlan type — kept here so lib stays render-free). */
export interface AdviceDot {
  level: AdviceLevel;
  /** Deciding confidence < 0.75: rendered as a ring instead of a disc. */
  hollow: boolean;
}

export interface AdviceMark extends AdviceDot {
  /** Human label of the deciding verdict, e.g. "spacing violation". */
  reason: string;
  confidence: number;
}

const LEVEL_SEVERITY: Record<AdviceLevel, number> = { ok: 0, warn: 1, bad: 2 };

/** Aggregate one cell's three verdicts into a single mark. Spacing is checked
 *  first (most actionable), then companion, then season; a higher severity
 *  wins, ties keep the earlier axis. Cells with nothing to flag score 'ok'. */
export function adviceMarkFor(cell: CellAdvice): AdviceMark {
  const candidates: AdviceMark[] = [];
  if (cell.spacingRisk.verdict === 'violation') {
    candidates.push({ level: 'bad', hollow: false, reason: 'spacing violation', confidence: cell.spacingRisk.confidence });
  } else if (cell.spacingRisk.verdict === 'tight') {
    candidates.push({ level: 'warn', hollow: false, reason: 'spacing tight', confidence: cell.spacingRisk.confidence });
  }
  if (cell.companion.verdict === 'conflict') {
    candidates.push({ level: 'bad', hollow: false, reason: 'companion conflict', confidence: cell.companion.confidence });
  }
  if (cell.seasonFit.verdict === 'poor') {
    candidates.push({ level: 'warn', hollow: false, reason: 'season poor', confidence: cell.seasonFit.confidence });
  }
  if (candidates.length === 0) {
    return { level: 'ok', hollow: false, reason: 'no issues', confidence: cell.spacingRisk.confidence };
  }
  let best = candidates[0];
  for (const candidate of candidates) {
    if (LEVEL_SEVERITY[candidate.level] > LEVEL_SEVERITY[best.level]) best = candidate;
  }
  return { ...best, hollow: best.confidence < 0.75 };
}

/**
 * Overlay marks for the interactive canvas: ONLY cells worth flagging
 * (warn/bad) get a dot so a clean plan never blankets the blueprint with
 * green markers. The panel's counts still cover every scanned cell.
 */
export function adviceDotsFor(scan: AdviceScan): Map<string, AdviceDot> {
  const dots = new Map<string, AdviceDot>();
  for (const cell of Object.values(scan.cells)) {
    const mark = adviceMarkFor(cell);
    if (mark.level === 'ok') continue;
    dots.set(cell.cellKey, { level: mark.level, hollow: mark.hollow });
  }
  return dots;
}
