# SPEC — Jev Advice Seam (opt-in, flag-gated)

Status: experimental · Owner: lead (liquid fleet) · Branch: `feat/jev-advice-seam`
Field brief: `dogfood-output/jev-experience.html` (untracked, local-only)

## Mission (one sentence)

Add an env-gated "plan advice" seam that produces per-cell typed verdicts
(seasonFit / spacingRisk / companion) from pluggable providers — deterministic
heuristic + mock locally by default, an HTTP "Jev" provider only when
`VITE_ADVICE_URL` is set — with the hard guarantee that **with no env vars set
the app is byte-identical to `main`**.

## Why

Jev (TypeSafe AI, announced 2026-09-15) is the first "System One" model: it
returns typed, schema-constrained decisions with calibrated confidence in
70–500 ms at ~$0.00008/decision — the right primitive for per-cell plan
advice. It is early access, so the live provider cannot be integration-tested
today; the mock and heuristic providers carry the testing burden until access
arrives, at which point flipping `VITE_ADVICE_URL` is the only change.

## Non-negotiable invariants (repo rules; violations = reject)

1. **RenderOptions overlays are opt-in and default OFF.** `drawPlan` pixels
   must be byte-identical when the field is absent. No remote `drawImage`, no
   fetch, no async in the render path. PNG export and the 3D ground path pass
   the new field **never**.
2. **`usePlanEditor` is THE mutation seam.** Touch it only to pipe the new
   overlay input in exactly the way `simChannels` already flows in; no
   `planRef` ad hoc; zero changes to mutations, undo/redo, autosave, pointer
   handling.
3. **Advice is read-only and advisory.** It never blocks or gates a write, and
   no existing flow may require it.
4. **Flag-off = invisible.** With `VITE_ADVICE_URL` and `VITE_ADVICE_MOCK`
   unset, `AdvicePanel` returns `null` and no overlay work happens. There is
   no user-visible trace of the feature.
5. **No new npm dependencies.** `fetch` + existing UI primitives only. TS
   strict + `noUnusedLocals`/`noUnusedParameters` must pass.
6. **Determinism in lib code:** no `Math.random` anywhere under
   `src/lib/advice/` (mock provider is hash-based).

## Design

### Module: `src/lib/advice/` (new)

- `types.ts`
  - `type SeasonFit = 'good' | 'fair' | 'poor'`
    `type SpacingRisk = 'ok' | 'tight' | 'violation'`
    `type CompanionVerdict = 'ally' | 'neutral' | 'conflict'`
  - `interface CellAdvice { cellKey: string; x: number; y: number;
    seasonFit: { verdict: SeasonFit; confidence: number };
    spacingRisk: { verdict: SpacingRisk; confidence: number };
    companion: { verdict: CompanionVerdict; confidence: number } }`
  - `type AdviceSource = 'mock' | 'heuristic' | 'live' | 'fallback'`
  - `interface AdviceScan { source: AdviceSource; cells: Record<string, CellAdvice>;
    scannedAt: number; note?: string }`
  - `interface AdviceProvider { id: AdviceSource;
    scan(plan: PlanState, cropById: Map<number, Crop>): Promise<AdviceScan> }`
- `heuristic.ts` — pure local rules reusing `plan.ts` exports
  (`spacingViolationSet`, pairings) + crop catalog metadata. Heuristic
  confidences are fixed values (documented: rule-based, not calibrated).
  `seasonFit` is an honest placeholder (`'fair'`, 0.55) until a growth-model
  hook exists — do not fake precision.
- `mock.ts` — deterministic FNV-1a-style hash of `cellKey` → plausible
  verdicts/confidences (mirrors the decision bench in the field brief). For UI
  development and smoke tests.
- `jev.ts` — live provider, used only when `VITE_ADVICE_URL` is set. One
  batched `POST` per scan (request `{ schema: 'ff.cellAdvice.v0', cells: [...],
  context: {...} }`, response `{ decisions: [{ cellKey, outputs: {...} }] }`;
  documented in README). `AbortController` timeout 4 s. On any error/non-2xx/
  schema mismatch: fall back to the heuristic provider, mark `source:
  'fallback'` with a short `note`. Errors never throw to the UI.
- `index.ts` — `resolveAdviceConfig(): { enabled: boolean; mode: 'mock' | 'live' | null }`
  from `import.meta.env` (`VITE_ADVICE_MOCK=1` wins over URL for testing;
  `enabled` false when both absent). Also exports `getAdviceProvider(config)`.

### Render overlay: `renderPlan.ts` (one field)

```ts
/** cellKey → advice mark: 3px corner dot (top-left); hollow when
 *  confidence < 0.75. Opt-in, default OFF; only the interactive canvas
 *  may pass it (never PNG export, never the 3D ground path). */
adviceDots?: Map<string, { level: 'ok' | 'warn' | 'bad'; hollow: boolean }> | null;
```

Color: ok = green, warn = amber, bad = red (same palette family as existing
overlays). Drawn as the LAST overlay layer.

### Overlay pipe: `usePlanEditor.ts` (minimal)

Accept an optional `adviceDots` input exactly the way `simChannels` flows in
(read its path first and mirror it), add it to the `overlayOpts` memo + deps,
pass to `drawPlan`. Nothing else changes.

### UI: `src/components/designer/AdvicePanel.tsx` (new)

Same conventions as `PairingsPanel` (`Card` + `CardHeader`/`CardContent`,
`editor: PlanEditor` prop). Returns `null` when `!resolveAdviceConfig().enabled`.

Content when enabled:
- Title "Advice (Jev seam)" + source chip (`mock` | `heuristic` | `live` | `fallback`).
- Manual **Scan plan** button (TanStack Query, `enabled: false` + `refetch`;
  key `['advice-scan', farmId]`). No auto-scan, no autosave coupling — even a
  live key cannot incur runaway cost.
- **Show on map** toggle (default OFF) → callback wires `adviceDots` through
  `PlotDesigner` state into `usePlanEditor`. Results go stale (chip) when
  `planVersion` changes after a scan.
- Counts (ok/warn/bad) + up to 6 notable cells (bad first), e.g.
  `4,7 — spacing violation (0.82)`. Footer: "Advisory only — never blocks edits."

### Mount: `PlotDesigner.tsx`

Hold `adviceDots` state; pass into `usePlanEditor` (new optional field) and
mount `<AdvicePanel … />` after `<PairingsPanel />` in the right rail.

### Env + docs

- `.env.example`: append commented `VITE_ADVICE_URL=` and `VITE_ADVICE_MOCK=`
  with a two-line explanation.
- `README.md`: short "Optional (experimental): Jev advice endpoint" subsection
  under the API contract: request/response schema, env vars, fallback promise.
- `implementation-notes.md`: append a dated entry (decision + rollback).

## Workstreams

- **A — lib seam** (`src/lib/advice/*`): types, heuristic, mock, jev, resolver.
- **B — render overlay** (`renderPlan.ts` + `usePlanEditor.ts` pipe).
- **C — UI + wiring** (`AdvicePanel.tsx`, `PlotDesigner.tsx`, env/docs).

## Gates (all must pass before commit)

1. `npm run typecheck` — clean.
2. `npm run build` — clean.
3. Flag-off smoke: dev server, `appshot --gate --expect` on `#/farms/1/map`
   passes and the rendered page shows **no** Advice panel (visual check).
4. Flag-on smoke: relaunch dev with `VITE_ADVICE_MOCK=1`, same route:
   `--expect "Advice"` passes; Scan renders mock verdicts; overlay toggle
   draws corner dots; PNG export unchanged.
5. Diff review: invariants 1–6 hold.

## Rollback

Delete `src/lib/advice/` + `AdvicePanel.tsx`; revert four small diffs
(`renderPlan.ts`, `usePlanEditor.ts`, `PlotDesigner.tsx`, docs). Flag-off
means the merge itself is zero-risk.

## Amendment 1 (2026-09-18, binding): OpenRouter transport

Jev is served via OpenRouter as `typesafe/jev-1.13` (modality `text->decisions`,
32k context, `supported_parameters: []` — no `response_format`). The live
provider gains a second transport: `VITE_OPENROUTER_API_KEY` (optional
`VITE_ADVICE_MODEL`) sends the ff.cellAdvice.v0 batch in 120-cell chunks as
OpenAI-compatible chat completions with the schema in the system prompt;
replies are parsed with the same strict validation. Precedence: mock >
`VITE_ADVICE_URL` > OpenRouter > disabled. All fallback and flag-off
guarantees are unchanged. The key stays in gitignored `.env.local` — `VITE_`
vars are bundled into the client, so this transport is local-dev-only until
proxied server-side.
