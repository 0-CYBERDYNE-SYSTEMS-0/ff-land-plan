// Live "Jev" advice provider (SPEC-JEV-ADVICE): one batched POST per scan to
// VITE_ADVICE_URL. Jev (TypeSafe AI) returns schema-constrained typed
// decisions, so the response is validated STRICTLY — any network error,
// timeout, non-2xx, or shape/coverage mismatch falls back to the heuristic
// provider with source 'fallback' and a short note. Errors never reach the UI.

import { parseKey } from '@/lib/plan';
import type { Crop, PlanState } from '@/types';
import { heuristicProvider } from './heuristic';
import type {
  AdviceProvider,
  AdviceScan,
  CellAdvice,
  CompanionVerdict,
  SeasonFit,
  SpacingRisk,
} from './types';

const TIMEOUT_MS = 4000;
const SCHEMA = 'ff.cellAdvice.v0';

interface JevRequest {
  schema: typeof SCHEMA;
  cells: Array<{ cellKey: string; x: number; y: number; crop: string | null }>;
  context: { surface: string; cellM: number; widthM: number; heightM: number };
}

interface JevDecision {
  cellKey: string;
  outputs: {
    seasonFit?: { verdict?: unknown; confidence?: unknown };
    spacingRisk?: { verdict?: unknown; confidence?: unknown };
    companion?: { verdict?: unknown; confidence?: unknown };
  };
}

interface JevResponse {
  decisions?: unknown;
}

const SEASON_FITS: readonly SeasonFit[] = ['good', 'fair', 'poor'];
const SPACING_RISKS: readonly SpacingRisk[] = ['ok', 'tight', 'violation'];
const COMPANION_VERDICTS: readonly CompanionVerdict[] = ['ally', 'neutral', 'conflict'];

function parseOutput<T extends string>(
  output: { verdict?: unknown; confidence?: unknown } | undefined,
  allowed: readonly T[],
): { verdict: T; confidence: number } | null {
  if (!output) return null;
  const { verdict, confidence } = output;
  if (typeof verdict !== 'string' || !(allowed as readonly string[]).includes(verdict)) return null;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { verdict: verdict as T, confidence };
}

/** Strict parse: every planted cell covered, all three outputs well-formed. */
function parseResponse(data: unknown, plantedKeys: string[]): Record<string, CellAdvice> | null {
  const decisions = (data as JevResponse | null)?.decisions;
  if (!Array.isArray(decisions)) return null;
  const byKey = new Map<string, JevDecision>();
  for (const raw of decisions) {
    const decision = raw as JevDecision;
    if (typeof decision?.cellKey !== 'string' || typeof decision?.outputs !== 'object' || decision.outputs === null) {
      return null;
    }
    byKey.set(decision.cellKey, decision);
  }
  const cells: Record<string, CellAdvice> = {};
  for (const key of plantedKeys) {
    const decision = byKey.get(key);
    if (!decision) return null; // partial coverage = schema mismatch
    const seasonFit = parseOutput(decision.outputs.seasonFit, SEASON_FITS);
    const spacingRisk = parseOutput(decision.outputs.spacingRisk, SPACING_RISKS);
    const companion = parseOutput(decision.outputs.companion, COMPANION_VERDICTS);
    if (!seasonFit || !spacingRisk || !companion) return null;
    const [x, y] = parseKey(key);
    cells[key] = { cellKey: key, x, y, seasonFit, spacingRisk, companion };
  }
  return cells;
}

/**
 * Live provider factory. One batched POST per scan; strict schema coverage
 * (every planted cell, all three verdicts, confidences in 0..1). Any failure
 * — abort/timeout, non-2xx, JSON, shape — returns the heuristic scan
 * re-marked as 'fallback'; this function never rejects.
 */
export function createJevProvider(url: string): AdviceProvider {
  return {
    id: 'live',
    async scan(plan: PlanState, cropById: Map<number, Crop>): Promise<AdviceScan> {
      const fallback = async (note: string): Promise<AdviceScan> => {
        const base = await heuristicProvider.scan(plan, cropById);
        return { ...base, source: 'fallback', note };
      };
      try {
        const plantedKeys = Object.keys(plan.planting);
        const request: JevRequest = {
          schema: SCHEMA,
          cells: plantedKeys.map((key) => {
            const [x, y] = parseKey(key);
            const crop = cropById.get(plan.planting[key]);
            return { cellKey: key, x, y, crop: crop?.slug ?? crop?.name ?? null };
          }),
          context: {
            surface: plan.surface ?? 'outdoor',
            cellM: plan.cellM,
            widthM: plan.widthM,
            heightM: plan.heightM,
          },
        };
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timer);
        }
        if (!response.ok) return await fallback(`Jev endpoint returned ${response.status}`);
        const cells = parseResponse(await response.json(), plantedKeys);
        if (!cells) return await fallback('Jev response failed schema validation');
        return { source: 'live', cells, scannedAt: Date.now() };
      } catch {
        return await fallback('Jev request failed (timeout or network error)');
      }
    },
  };
}
