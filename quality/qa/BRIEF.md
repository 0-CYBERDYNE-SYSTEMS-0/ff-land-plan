# QA BRIEF — ff-voxel-twin audit (pro-upgrade working tree)

Read this fully. It applies to every QA lane. Deviations must be noted in your report.

## Ground rules (hard)
1. **READ-ONLY on the repo.** You must NOT edit, create, or delete ANY file under `src/`, `index.html`, or config. Your only permitted repo writes are your own two findings files (`quality/qa/findings-<lane>.json` and `.md`). This is an audit — a separate approved pass will do fixes.
2. Dev server is ALREADY RUNNING at `http://localhost:5173`. Never start your own server (port conflicts). If it seems down, retry twice, then note it and fall back to static analysis.
3. `npm run lint` is broken (ESLint absent) — never use it. `npm run typecheck` and `npm run build` were already run by the orchestrator; do NOT re-run build (expensive). You may run typecheck once if you need to confirm a code-level suspicion compiles.
4. Scratch screenshots go ONLY in `/var/folders/pr/ny57nkls6_3cdvtsdrcr2rpm0000gn/T/ffqa-<lane>/` (already created). Never `/tmp` root, never the repo.
5. No `git checkout`/`stash`/`restore`/`commit`. Working tree is deliberately dirty (in-flight HUD work is the thing under test).

## Tooling cheat-sheet
- **Headless screenshot + console gate (~40 s/shot):**
  `node tools/appshot.mjs "<url>#[route]" "<out.png>" [WxH] --gate --expect "<text>"`
  - `--gate` reads the DEV-only boot probe (`#ff-probe`): fails on any window.onerror / unhandled rejection / console.error.
  - `--expect` asserts visible text in serialized DOM — ALWAYS pair `--gate` with `--expect` (a clean gate on a NotFound page proves nothing).
  - Trust the GATE/EXPECT output lines and PNG bytes (>1000 bytes = rendered). Chrome is killed on timeout BY DESIGN — never judge by exit codes.
- **Live-clock screenshot (animated pages: charts, world sim):**
  `node tools/appshot-live.mjs "<url>#[route]" "<out.png>" [WxH] --wait <ms> [--full] [--scroll <px>]`
  No gate/expect — screenshot only. Use sparingly (default 9 s wait).
- Budget: **≤8 appshots + ≤3 live shots** per lane. Choose targets wisely; static code traces are free.
- URL params go BEFORE the hash: `http://localhost:5173/?ffview=world&fftime=0.4&ffdebug=1#/farms/1/map`. Params inside the hash break wouter → NotFound.

## Evidence discipline
Every finding MUST carry evidence, one of:
- **Code trace:** `file:line` citations quoting the decisive lines (grep + offset Read; do not dump whole files), explaining expected vs actual behavior.
- **Repro:** exact steps (URL, clicks, inputs) + observed result; appshot gate/expect output or screenshot path if visual.
No speculation. If you believe something is broken but cannot prove it, include it with `"confidence": "low"` and say exactly what would confirm it. Confidence: `high` (proved by trace or repro) / `medium` (strong reasoning, one link untested) / `low`.

Severity:
- **P0** — blocks a core user flow, data loss/corruption, or crash in normal use.
- **P1** — feature broken or materially misleading as shipped (user-visible wrong behavior).
- **P2** — degraded/edge-case impact, confusing UX, minor wrong behavior.
- **P3** — hygiene: dead code, doc drift, inconsistency, no direct user impact.

## Output contract (exactly two files)
1. `quality/qa/findings-<lane>.json` — JSON array:
```json
[{"id":"ED-1","area":"designer/toolbar","title":"…","severity":"P1",
  "evidence":"usePlanEditor.ts:752 — …","expected":"…","actual":"…",
  "confidence":"high","fixHint":"one line, optional"}]
```
ids prefixed per lane: `ED-` (editor), `WD-` (world), `OP-` (ops).
2. `quality/qa/findings-<lane>.md` — human report:
   - **Verdict** paragraph (is this lane ready?).
   - **Checks run** table: every probe attempted → PASS / FAIL / NOT TESTED (with how).
   - **Findings** detailed (grouped by severity).
   - **Verified wired ✅** — features you traced end-to-end that WORK. This list is mandatory; an audit that only lists failures is incomplete.

## Token discipline
Grep before reading. Use Read with offset/limit around cited lines. No full-file dumps in reports. Target ≤60 tool uses. Your final message back to the orchestrator should be a ≤40-line summary: verdict, counts by severity, top findings by id, path to your findings files, and anything you could NOT test.

## Project context you need
- React 18 + TS + Vite SPA, wouter HASH routing, TanStack Query v5, localStorage-first (`src/lib/localApi.ts` via `apiFetch` in `src/lib/api.ts`; `VITE_API_BASE_URL` unset → local). Seed farms ids 1–7 (`src/data/seed.ts`); farm 1 = "North Meadow".
- Routes: `#/` dashboard, `#/farms/new`, `#/farms/:id/edit`, `#/farms/:id/map` (PlotDesigner: 2D + World3D), `#/farms/:id/calendar|weather|simulations|monitoring`, `#/crops`. Showcase: `http://localhost:5173/showcase.html#lane=a|b|c|d` (no boot probe; assert `--expect "showcase-ready N"`).
- The working tree contains UNCOMMITTED in-flight work: World HUD restructure per `quality/SPEC-WORLD-HUD.md` (read it), creative-asset polish across `src/creative/`, sim realism (`SURFACE_PLANT_SCALE` in `src/lib/growth.ts`). This audit decides whether it's ready to commit.
- Mutation seam invariant: ALL plan edits flow through `src/components/designer/usePlanEditor.ts` (undo/redo, 600 ms autosave, tools, zoom).
- renderPlan invariant: `drawPlan` visual layers must be opt-in `RenderOptions` flags defaulting OFF; PNG export (`renderPlanToPng`) must render none of the overlays.
- World3D: init effect runs ONCE per `[sceneReady, farmId]`; `sceneReady` requires crops loaded; live weather via ref; `src/three/sky.ts` owns THE sun. Headless world PNGs race plan loading — judge world content by GATE/EXPECT + code, not PNG bytes.
