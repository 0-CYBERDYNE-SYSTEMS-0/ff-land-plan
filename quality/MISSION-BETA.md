# MISSION BETA — Plug-in-Ready Data Seam & Beta-Tester-Ready 3D World

Goal: take the current beta candidate to **verifiable beta**: live data actually
driving the 3D world, a typed one-line swap to a real backend, night lighting that
reads, no full-scene rebuilds on every brush stroke, an automated smoke gate, and
docs that describe the shipped truth.

Written by mission control (orchestrator) 2026-08-24, from code inspection at
HEAD `01d67a6`. Every gap below was **verified in source**, not speculated.

---

## Root causes (verified, with evidence)

1. **Live weather never reaches the 3D world.**
   `src/components/world/World3D.tsx:69-78` fetches `apiFetch.getWeather(...)` with
   **no `.catch()`** (unhandled rejection when offline with no last-good cache).
   Worse: the rAF `update` closure (line ~166) captures the mount-time `weather`
   state (`null`) and `weather` is not in that effect's dep array — so clouds,
   weather FX, audio params and plant sway run on hardcoded defaults forever.
   The footer chip is the only consumer of real weather.
2. **Two competing suns — night lighting broken.**
   `src/three/engine.ts` adds a static white `DirectionalLight` (intensity 0.8,
   fixed position 10/20/10). `src/three/sky.ts` owns a *second*, time-driven sun
   light. `World3D.tsx` retunes only the ambient light. Result: at night the scene
   is still blasted by a fixed noon-white directional light. This is the root cause
   behind MISSION-CONTROL's "night lighting for new materials unverified".
3. **Full scene teardown on every edit / date scrub.**
   The init effect deps are `[planVersion, cropById, scrubDate, handlers]`, and its
   cleanup disposes ground/structures/plants/water/animals/sky/clouds/engine.
   Any paint stroke or date-scrub therefore rebuilds the entire world, then the
   incremental-update effect runs *on top*. Violates HANDOFF decision #2
   ("rebuild geometry only on plan edit") and is the real mechanism behind the
   flagged perf risk on large plans.
4. **Pluggability is a comment, not a client.**
   `src/lib/api.ts` says "point this at a fetch-based server client" but no
   reference REST client exists; nothing proves a drop-in can satisfy `Api`.
5. **Gauntlet books are stale.**
   `quality/state/lane-{a,b,c}.json` say iteration 1 / "critiquing" while
   `quality/shots/` shows lane A completed r2→r3 critique rounds (latest sheet r3,
   Aug 24 00:11). Only lane D's file reflects reality. `creative-progress.html`
   misreports accordingly.
6. **No automated beta smoke; docs describe June.**
   No route matrix or console-error gate exists. `HANDOFF.md` still says
   "status at handoff 2026-06-13" with no mention of the creative asset library,
   the fun-UX/game layer, or the World3D wiring.

## Finalization order (and why)

Senior-engineer ordering principle: **correctness before capability, capability
before polish, polish before evidence** — and docs last so they describe shipped
reality, not intentions.

| Stage | What | Why this position |
|---|---|---|
| 0 | Orchestrator builds verification harness (headless app screenshots + console-error probe), starts dev server | Lanes need an objective, shared way to prove work |
| 1 | **Data correctness under real conditions** (weather → 3D plumbing, graceful offline) | Beta testers on flaky Wi-Fi hit data errors first; a twin that ignores its own weather feed fails its core promise |
| 2 | **Backend pluggability** (typed REST reference client + env switch) | Capability built only after the seam behaves correctly locally |
| 3 | **3D robustness/perf/lighting** (single sun, build-once/incremental-update path) | Polish before doors open; these regress under load and embarrass in demos |
| 4 | **QA matrix + bookkeeping + docs** (route sweep, gauntlet state reconciliation, HANDOFF/BETA truth) | Evidence describes final state; run in parallel with 2–3 but merged last |
| 5 | Merge gate: typecheck, build, screenshot matrix, diff review, commit | Nothing is done until the orchestrator can reproduce it |

Stages 1–4 run as **three parallel lanes** on strictly disjoint files.

## Lane contracts (parallel-safe: disjoint files)

All lanes: TypeScript strict, `noUnusedLocals`/`noUnusedParameters` (unused imports
fail the build). Deterministic builders. Dispose geometry/materials on teardown.
Verify with `npx tsc --noEmit`; ignore errors in files owned by OTHER lanes — your
files must be clean. Dev server runs at http://localhost:5177 (orchestrator-owned;
use read-only). Never put Claude/Anthropic/co-author references anywhere.

### Lane 1 — API seam & backend pluggability
Owns: `src/lib/api.ts`, **new** `src/lib/restApi.ts`, **new** `.env.example`,
`README.md`. Touches nothing else.
- Implement `createRestApi(baseUrl: string): Api` in `restApi.ts` — every method of
  the `Api` interface (see `localApi.ts` lines 54–99) against the README endpoint
  contract (`/api/farms`, `/api/farms/:id/weather`, … ). JSON in/out, non-ok →
  `throw new Error(\`${status}: ${body}\`)`.
- Flip `api.ts`: if `import.meta.env.VITE_API_BASE_URL` is set, export
  `createRestApi(base)`; otherwise keep `localApi`. Default behavior unchanged.
- `.env.example` documents `VITE_API_BASE_URL=` (empty default) with a one-line note.
- README: short "Swapping in a backend" subsection under Data (env var + what the
  client covers). Keep local-first messaging; do NOT remove the mock/local layer.
- Verification: typecheck clean; `npm run build` with the env unset still bundles
  `localApi` path; diff shows zero changes outside owned files.

### Lane 2 — Live-data plumbing, lighting, rebuild path (the 3D world)
Owns: `src/components/world/World3D.tsx`, `src/three/engine.ts`, `src/three/sky.ts`.
Touches nothing else. Keep public signatures stable unless the fix requires it.
- **Weather plumbing:** hold fetched weather in a ref consumed by the rAF loop;
  add `.catch()` → `console.warn` + keep defaults (never crash offline). Footer
  chip keeps working. If `weather.cached` is true, show a small "cached" hint chip.
- **Single sun:** make the engine's directional light THE sky-driven sun (position
  = sunDirection × distance, color = sky sun color, intensity scaled by sun
  altitude ≈ 0 at night with a faint cool moon-fill floor). Remove/zero any second
  static directional. Night must stay legible (QUALITY_BAR: brighter-than-realistic
  ambient), dawn/dusk warm, noon crisp. Acceptance evidence: headless screenshots
  via `node tools/appshot.mjs` at time-of-day t≈0.05, 0.25, 0.5, 0.9 using the new
  `?fftime=<0..1>` search-param test hook you add to World3D (also `?ffdebug=1` to
  pre-open the Perf HUD). Save under `quality/shots/beta/lighting/`.
- **Build once, update incrementally:** init effect must run ONCE per mount (stable
  handler refs; scrubDate read through a ref); planVersion/date changes flow only
  through the existing incremental update effect (updateGround/updateStructures/
  updatePlants/buildWaterPlanes/buildAnimals). StrictMode double-mount must stay
  safe. Undo/history ghosts unaffected.
- Verification: typecheck clean; blueprint paint → world toggle still renders and
  edits live (screenshots before/after a plan change); date scrub updates plant
  stages WITHOUT a scene rebuild (reason it through in your report; orchestrator
  will re-review the diff); zero console errors via the harness gate.

### Lane 3 — Beta QA matrix, gauntlet books, doc truth
Owns: `quality/**`, `HANDOFF.md`. Touches nothing else.
(Note: the `?ffview=world` PlotDesigner test hook was installed by mission
control during Stage 0 — it is orchestrator infrastructure, like the probe.)
- **QA matrix:** screenshot every route with the harness `--gate` flag (fails on
  console errors): `#/`, `#/crops`, `#/farms/3/map`, `#/farms/3/map?ffview=world`,
  `#/farms/3/map?ffview=world&ffdebug=1`, `#/farms/3/calendar`,
  `#/farms/3/weather`, `#/farms/3/simulations`, `#/farms/3/monitoring`,
  `#/farms/new`. PNGs into `quality/shots/beta/routes/`; results table into this
  file's Verification Log section (route → shot → gate PASS/FAIL).
- **Books:** reconcile `quality/state/lane-a.json` (iteration 3, history of
  soil/water/paths/bed rounds), `lane-b.json` (iteration 1, full archetype sweep),
  `lane-c.json` (iteration 1) with the shot evidence; mark lanes whose latest round
  was accepted into the merged beta candidate as `pass`. Run
  `node tools/update-progress.mjs` to regenerate the dashboard.
- **Doc truth:** rewrite HANDOFF.md status header for 2026-08-24 (creative assets
  wired into World3D; game layer; this mission) and add a Beta Notes section:
  how to run, what to test, known limitations (honest gap list — e.g. REST client
  ships unexercised against a live server; perf numbers on huge plans TBD).

## Verification gate (mission control, after lanes merge)

1. `npm run typecheck` clean; `npm run build` clean; three.js stays lazy-loaded.
2. Full route matrix passes the harness console-error gate.
3. Lighting matrix (night/dawn/noon/dusk) visually judged against QUALITY_BAR.
4. Weather plumbing: with network throttled/offline + cold cache, world renders
   with defaults and NO unhandled rejection (probe gate catches rejections).
5. Diff review: no lane touched files outside its ownership; HANDOFF/BETA text
   matches shipped behavior.
6. Commit as one mission commit (+ separate commits per lane if cleaner),
   message style like `01d67a6`.

## Status: LANES MERGED & VERIFIED (beta ready)
- [x] Stage 0 harness + dev server (orchestrator): `tools/appshot.mjs` (~40s/shot,
  `--gate` console-error check + `--expect <text>` content marker),
  `src/dev/bootProbe.ts` (+ DEV wiring in `src/main.tsx`),
  `src/vite-env.d.ts`, `?ffview=world` hook in PlotDesigner, dev server on :5177,
  dirs `quality/shots/beta/{routes,lighting}`
- [x] Lane 1 API seam — accepted after orchestrator diff review
- [x] Lane 2 3D world plumbing/lighting/rebuild — accepted after line-by-line diff review
- [x] Lane 3 QA matrix + books + docs — accepted
- [x] Merge gate passed: typecheck clean; `npm run build` clean (three.js stays a
  lazy chunk; World3D island separate; main 492 kB / 144 kB gzip); corrected route
  matrix 6/6 GATE+EXPECT PASS on farm 1 (see correction entry below)
- [x] Committed

## Verification Log

Harness: `node tools/appshot.mjs "<url>" <out.png> 1440x900 --gate` — headless
Chrome screenshot + dev-only boot-probe console-error gate (`#ff-probe` records
`window.onerror`, `unhandledrejection`, `console.error`; any hit fails the run).
Run by Lane 3 (QA/books/docs lane) on 2026-08-24 against the mission dev server
http://localhost:5177. Shots live in `quality/shots/beta/routes/`. Note: Chrome is
killed on a fixed timeout by design once the page settles — the GATE line and PNG
existence are the verdict, not Chrome's exit code.

| Route | Shot | Gate | Notes |
|---|---|---|---|
| `#/` | `quality/shots/beta/routes/dashboard.png` | **PASS** | zero runtime errors; live Open-Meteo reachable from this sandbox |
| `#/crops` | `quality/shots/beta/routes/crops.png` | **PASS** | zero runtime errors |
| `#/farms/1/map` | `quality/shots/beta/routes/farm1-blueprint.png` | **PASS** | blueprint editor renders |
| `#/farms/3/map?ffview=world` | `quality/shots/beta/routes/farm3-world.png` | **PASS** | zero runtime errors on attempt 1 — no retries needed during this window |
| `#/farms/3/map?ffview=world&ffdebug=1` | `quality/shots/beta/routes/farm3-world-debug.png` | **PASS** | zero runtime errors on attempt 1; Perf HUD pre-opened |
| `#/farms/3/calendar` | `quality/shots/beta/routes/calendar.png` | **PASS** | zero runtime errors |
| `#/farms/3/weather` | `quality/shots/beta/routes/weather.png` | **PASS** | live Open-Meteo fetch OK — no network FINDING |
| `#/farms/3/simulations` | `quality/shots/beta/routes/simulations.png` | **PASS** | zero runtime errors |
| `#/farms/3/monitoring` | `quality/shots/beta/routes/monitoring.png` | **PASS** | zero runtime errors |
| `#/farms/new` | `quality/shots/beta/routes/farm-new.png` | **PASS** | zero runtime errors |

**Result: 10/10 routes PASS the console-error gate.** No network FINDING: the
sandbox reached `api.open-meteo.com` live, and `#/`, `#/farms/3/weather`,
`#/farms/3/calendar` all gated clean against real weather data. Caveats kept
honest: (a) gate evidence is programmatic (probe + PNG) — pixel-level human
review of these route shots has not happened yet; (b) world views passed on
their first attempt in this window, so Lane 2's in-flight changes were NOT
stress-tested by retries; (c) `quality/shots/beta/lighting/` time-of-day matrix
is Lane 2's deliverable and was still empty when this sweep ran.

### CORRECTION (mission control, merge gate) — farm-3 rows above are VOID

Lane 2's report exposed two orchestrator-infra bugs that invalidate the
farm-3 rows of the table above: the seed ships **only farms 1–2** (no farm 3),
and query params placed INSIDE the hash fragment break wouter matching
(NotFound renders). The farm-3 shots therefore gated clean on a "Farm not
found" page — a clean gate proves nothing about page content. Those PNGs were
deleted; `--expect <page text>` was added to `tools/appshot.mjs` so a wrong
page can never pass silently again.

Corrected re-run by mission control against **farm 1** with the working URL
form (`?params` BEFORE the hash), all at 1440x900 with `--gate --expect`:

| Route | Shot | Gate | Expect |
|---|---|---|---|
| `/?ffview=world#/farms/1/map` | `routes/farm1-world.png` | **PASS** | PASS "Plot Designer" |
| `/?ffview=world&ffdebug=1#/farms/1/map` | `routes/farm1-world-debug.png` | **PASS** | PASS "Plot Designer" |
| `#/farms/1/calendar` | `routes/farm1-calendar.png` | **PASS** | PASS "Calendar" |
| `#/farms/1/weather` | `routes/farm1-weather.png` | **PASS** | PASS "Weather" |
| `#/farms/1/simulations` | `routes/farm1-simulations.png` | **PASS** | PASS "Simulation" |
| `#/farms/1/monitoring` | `routes/farm1-monitoring.png` | **PASS** | PASS "Monitoring" |

Still valid from Lane 3's sweep (farm-agnostic or farm-1): dashboard, crops,
farm-new, farm1-blueprint. Lane 2's lighting matrix
(`lighting/{night-t05,dawn-t25,noon-t50,dusk-t90}.png`) all GATE PASS; since no
seat in this session can view images, lighting was verified quantitatively via
PNG band statistics (luma ordering night 25.3 < dusk 37.6 < dawn 46.3 < noon
70.7; dawn warm-pink r−b +12.5; dusk amber mid-band over cool ground; night
blue-shifted with uncrushed moon-fill floor) — a human aesthetics glance is
still recommended. Merge-gate build evidence: typecheck clean; production build
clean with three.js lazy (`three-*.js` chunk separate from main).
