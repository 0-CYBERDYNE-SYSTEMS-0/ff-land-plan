// Live "Jev" advice providers (SPEC-JEV-ADVICE, amended 2026-09-18: OpenRouter
// transport). Two transports share one strict contract — one batched call
// family per scan, strict response validation, and any failure (network,
// timeout, non-2xx, shape/coverage mismatch) falls back to the heuristic
// provider with source 'fallback' and a short note. Errors never reach the UI.
//
//  - createJevProvider(url): raw custom endpoint speaking ff.cellAdvice.v0.
//  - createOpenRouterProvider(key, model): the same contract through
//    OpenRouter's OpenAI-compatible chat API (model typesafe/jev-1.13,
//    modality text->decisions — no response_format support, so the schema
//    rides in the prompt and the reply is parsed strictly).

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

const SCHEMA = 'ff.cellAdvice.v0';
const CUSTOM_TIMEOUT_MS = 4000;
const OPENROUTER_TIMEOUT_MS = 30000;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Cells per OpenRouter call: ~40 tokens/cell keeps chunks far under the
 *  32k context of typesafe/jev-1.13 even at the max plot size. */
const OPENROUTER_CHUNK_CELLS = 120;

export const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';

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

/** Strict parse: every requested cell covered, all three outputs well-formed. */
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

function buildRequest(plan: PlanState, cropById: Map<number, Crop>, keys: string[]): JevRequest {
  return {
    schema: SCHEMA,
    cells: keys.map((key) => {
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
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Raw custom endpoint transport. One batched POST per scan; this function
 * never rejects — any failure returns the heuristic scan re-marked as
 * 'fallback'.
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
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRequest(plan, cropById, plantedKeys)),
          },
          CUSTOM_TIMEOUT_MS,
        );
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

// --- OpenRouter transport -----------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a farm-planning decision function for a voxel farm twin.',
  'For every input cell you emit exactly three calibrated verdicts:',
  'seasonFit (good|fair|poor), spacingRisk (ok|tight|violation), companion (ally|neutral|conflict).',
  'Calibration matters: confidence is your honest probability in [0,1], not urgency.',
  'Respond with ONLY a JSON object, no prose, no code fences:',
  '{"decisions":[{"cellKey":string,"outputs":{"seasonFit":{"verdict":string,"confidence":number},"spacingRisk":{"verdict":string,"confidence":number},"companion":{"verdict":string,"confidence":number}}}]}',
  'Cover every input cellKey exactly once.',
].join(' ');

/** Model replies may still arrive fence-wrapped despite instructions. */
function parseContentJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function callOpenRouterChunk(
  key: string,
  model: string,
  request: JevRequest,
  chunkKeys: string[],
): Promise<Record<string, CellAdvice>> {
  const response = await fetchWithTimeout(
    OPENROUTER_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'http://localhost:5173',
        'X-Title': 'FarmFriend Voxel Twin',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(request) },
        ],
      }),
    },
    OPENROUTER_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenRouter reply had no message content');
  const cells = parseResponse(parseContentJson(content), chunkKeys);
  if (!cells) throw new Error('OpenRouter reply failed schema validation');
  return cells;
}

/**
 * OpenRouter transport for typesafe/jev-1.13 (SPEC-JEV-ADVICE amendment):
 * the ff.cellAdvice.v0 batch is chunked (context-window safety), sent as one
 * chat completion per chunk, parsed strictly, and merged. All-or-nothing:
 * any chunk failure falls back to the heuristic scan marked 'fallback'.
 */
export function createOpenRouterProvider(key: string, model: string): AdviceProvider {
  return {
    id: 'live',
    async scan(plan: PlanState, cropById: Map<number, Crop>): Promise<AdviceScan> {
      const fallback = async (note: string): Promise<AdviceScan> => {
        const base = await heuristicProvider.scan(plan, cropById);
        return { ...base, source: 'fallback', note };
      };
      try {
        const plantedKeys = Object.keys(plan.planting);
        const merged: Record<string, CellAdvice> = {};
        const chunks = Math.max(1, Math.ceil(plantedKeys.length / OPENROUTER_CHUNK_CELLS));
        for (let i = 0; i < plantedKeys.length; i += OPENROUTER_CHUNK_CELLS) {
          const chunkKeys = plantedKeys.slice(i, i + OPENROUTER_CHUNK_CELLS);
          const chunkCells = await callOpenRouterChunk(
            key,
            model,
            buildRequest(plan, cropById, chunkKeys),
            chunkKeys,
          );
          Object.assign(merged, chunkCells);
        }
        return {
          source: 'live',
          cells: merged,
          scannedAt: Date.now(),
          note: `live via OpenRouter · ${model} · ${chunks} call${chunks === 1 ? '' : 's'}`,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'request failed';
        return await fallback(`Jev via OpenRouter: ${detail}`);
      }
    },
  };
}
