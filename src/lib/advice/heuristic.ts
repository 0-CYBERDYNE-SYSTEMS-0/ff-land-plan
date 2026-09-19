// Heuristic advice provider (SPEC-JEV-ADVICE): pure local rules over the plan,
// reusing the plan intelligence in plan.ts (spacingViolationSet, findPairings)
// so catalog logic is never duplicated. Confidences are FIXED rule outputs —
// documented constants, not calibrated probabilities.

import {
  conflictCellSet,
  findPairings,
  parseKey,
  spacingViolationSet,
} from '@/lib/plan';
import type { Crop, PlanState } from '@/types';
import type { AdviceProvider, AdviceScan, CellAdvice } from './types';

// Rule confidences (see module comment): spacing flags come straight from the
// deterministic violation set; companion flags from the pairing engine.
const CONF_SPACING_VIOLATION = 0.9;
const CONF_SPACING_OK = 0.8;
const CONF_COMPANION_CONFLICT = 0.85;
const CONF_COMPANION_ALLY = 0.8;
const CONF_COMPANION_NEUTRAL = 0.7;
// Honest placeholder (spec): no growth-model hook exists yet, so seasonFit is
// a flat 'fair' at low confidence — do not fake precision.
const CONF_SEASON_PLACEHOLDER = 0.55;

export const heuristicProvider: AdviceProvider = {
  id: 'heuristic',
  async scan(plan: PlanState, cropById: Map<number, Crop>): Promise<AdviceScan> {
    const violations = spacingViolationSet(plan, cropById);
    const pairings = findPairings(plan, [...cropById.values()]);
    const conflicts = conflictCellSet(pairings);
    const allies = new Set<string>();
    for (const pairing of pairings) {
      if (pairing.kind !== 'companion') continue;
      for (const key of pairing.cells) allies.add(key);
    }

    const cells: Record<string, CellAdvice> = {};
    for (const key of Object.keys(plan.planting)) {
      const [x, y] = parseKey(key);
      cells[key] = {
        cellKey: key,
        x,
        y,
        seasonFit: { verdict: 'fair', confidence: CONF_SEASON_PLACEHOLDER },
        spacingRisk: violations.has(key)
          ? { verdict: 'violation', confidence: CONF_SPACING_VIOLATION }
          : { verdict: 'ok', confidence: CONF_SPACING_OK },
        companion: conflicts.has(key)
          ? { verdict: 'conflict', confidence: CONF_COMPANION_CONFLICT }
          : allies.has(key)
            ? { verdict: 'ally', confidence: CONF_COMPANION_ALLY }
            : { verdict: 'neutral', confidence: CONF_COMPANION_NEUTRAL },
      };
    }
    return { source: 'heuristic', cells, scannedAt: Date.now() };
  },
};
