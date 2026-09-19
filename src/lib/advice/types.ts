// Advice seam types (SPEC-JEV-ADVICE): per-cell typed verdicts from pluggable
// providers. Advice is read-only and advisory — nothing here ever blocks a
// plan write. See index.ts for config resolution and the scan→overlay mapping.

import type { Crop, PlanState } from '@/types';

export type SeasonFit = 'good' | 'fair' | 'poor';
export type SpacingRisk = 'ok' | 'tight' | 'violation';
export type CompanionVerdict = 'ally' | 'neutral' | 'conflict';

export interface CellAdvice {
  cellKey: string;
  x: number;
  y: number;
  seasonFit: { verdict: SeasonFit; confidence: number };
  spacingRisk: { verdict: SpacingRisk; confidence: number };
  companion: { verdict: CompanionVerdict; confidence: number };
}

export type AdviceSource = 'mock' | 'heuristic' | 'live' | 'fallback';

export interface AdviceScan {
  source: AdviceSource;
  /** cellKey → advice; covers exactly the plan's planted cells. */
  cells: Record<string, CellAdvice>;
  scannedAt: number;
  note?: string;
}

export interface AdviceProvider {
  id: AdviceSource;
  scan(plan: PlanState, cropById: Map<number, Crop>): Promise<AdviceScan>;
}
