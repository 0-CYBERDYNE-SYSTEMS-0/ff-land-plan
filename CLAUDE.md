# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository. Last refreshed 2026-09-25 against `112eda9` — kept in
sync with `AGENTS.md` (which has the fuller version).

## Project

FarmFriend Voxel Digital Twin — a React 18 + TypeScript + Vite SPA for farm
planning (voxel crop map, weather, sensors, simulations) with a procedural
voxel 3D world. The directory is `ff-land-plan` but the package name is
`ff-voxel-twin`; both refer to this project.

## Commands

```bash
npm run dev            # Vite dev server on http://localhost:5173
npm run build          # tsc -b && vite build → dist/
npm run preview        # serve the production build on port 4173
npm run typecheck      # tsc --noEmit — the primary verification gate
npm run check:private  # filename guard against committing env/keys/data exports
```

Caveats:

- `npm run lint` is defined but broken — ESLint is not installed and there is
  no config. Use `npm run typecheck` instead. TS strict +
  `noUnusedLocals`/`noUnusedParameters`: an unused import fails the build.
- There are no tests and no test runner. Verification = typecheck + build +
  the headless screenshot harness: `node tools/appshot.mjs "<url>" <out.png>
  [WxH] [--gate] [--expect "<text>"] [--vt <ms>]` (~40 s/shot; Chrome killed
  on timeout BY DESIGN — trust GATE/EXPECT lines, not exit codes; scratch PNGs
  in `$TMPDIR/<dir>/`, create dirs first). `--gate` fails on console errors
  caught by the DEV-only boot probe (`src/dev/bootProbe.ts`); always pair it
  with `--expect` (CI uses `"25 cm cells"`) so a NotFound page can't pass.
  Showcase pages have no boot probe — assert `--expect "showcase-ready"`.

## CI

`.github/workflows/ci.yml` runs on every PR/push to `main`: typecheck+build
and gitleaks + `check-private-files.mjs` (no screenshot job — run appshot
locally when needed). `main-guard.yml` turns red for any non-merge commit on
`main` without a PR — land ALL changes via PRs. `v*` tags trigger
`release.yml`.

## Architecture

**Many frontends, one backend.** `PlanState` (sparse `{ground:{'x,y':slug},
planting:{'x,y':cropId}}`) plus two seams serve every view:

- **Data seam** — `src/lib/api.ts` exports `apiFetch: Api`. Default:
  local-first (`localApi.ts`: localStorage store via `store.ts` + real
  Open-Meteo weather). Set `VITE_API_BASE_URL` to swap in `restApi.ts`; no
  page changes. Keep the `Api` interface, localApi, restApi and the README
  endpoint list in sync.
- **Mutation seam** — `usePlanEditor.ts` owns ALL plan editing (undo
  snapshots, 600 ms autosave, tools, zoom API). Never fork it or write
  `planRef.current` outside its snapshot paths.

Frontends:

1. **Blueprint** (2D editor): Select(V)/Brush(B)/Rect(R)/Asset(A)/Erase(E)/
   Pick(I)/Fill(G)/Line(L), ghost previews, Spacing + Companions overlays,
   layer toggles, zoom cluster, starter templates (`src/data/templates.ts`;
   crop NAMES resolved at apply time; custom ids ≥1000 never renumbered).
   **Law:** `drawPlan` feeds canvas + PNG export + 3D ground tiles — new
   visual layers (incl. the `simMoisture`/`simStress`/`simReady` overlays)
   must be opt-in `RenderOptions` flags defaulting OFF.
2. **World3D** (vanilla three.js island, lazy-loaded): mount-once init effect
   (`[sceneReady, farmId]` deps; refs or the `planVersion` effect elsewhere);
   sky.ts owns THE single sun; live weather reaches rAF via a ref. Test hooks
   BEFORE the hash: `/?ffview=world&fftime=<0..1>&ffdebug=1#/farms/1/map`.
3. **Creative library** (`src/creative/`): 170+ deterministic voxel builders
   in five registries (terrain / crops×6 stages / structures /
   creatures+tools / environments incl. the surface-shell kit
   `environments/shells.ts`), consumed by thin adapters in `src/three/`
   (`plants/ground/structures/shell/animals/dressing.ts`). Seeded PRNG only —
   never `Math.random`. One voxel = 10 cm. Preview:
   `showcase.html#lane=a|b|c|d|e` (`only=id`, `mode=sheet|big`).
4. **Ops views**: Dashboard/Calendar/Weather/Simulations/Monitoring.

**Sim engine** (`src/lib/sim/`, spec `quality/SPEC-SIM-ECOSYSTEM.md`): pure
daily-tick reducer (`createRun` / `stepDay` / `simulateRun`); replay is the
storage, so every outcome must be a function of (config, envSeries) — no
`Math.random`, keyed draws via `rng.ts`. `sim/view.ts` is the projection seam
to 2D/3D. `simLegacy.ts` still feeds the old simulations list.

**Plan surfaces**: `outdoor | greenhouse | hoophouse | tent | indoor |
warehouse` (`PlanSurface`, per canvas via Settings drawer). Enclosed surfaces
swap shell/floor/ambient and shelter the sim — see
`quality/MISSION-ENVIRONMENTS.md`.

Layout invariants of PlotDesigner (don't regress): `xl:h-full` flex column;
canvas card absorbs toolbar wrap; below-xl `h-[60dvh]` + page scroll;
sizing effect keyed on `isLoading`.

## Traps that will bite you

1. Open-Meteo soil/UV are hourly-only (`weather.ts` handles it — don't
   "simplify" into `current=`).
2. QueryClient defaults: `staleTime: Infinity` + URL-joining default queryFn —
   pass explicit `queryFn`s; override staleTime for weather queries.
3. Soil moisture m³/m³ → % via ×200 in `weather.ts`.
4. Keep `renderPlan.ts` free of remote `drawImage` (export taint).
5. Custom crop ids start at 1000; plans persist ids in localStorage.
6. React 18 (not 19) — why R3F is off the table.
7. Query params go BEFORE the hash; params inside the hash break wouter
   (NotFound). Seed ships farms 1–9 (`src/data/seed.ts`; 8 = hoophouse,
   9 = warehouse), but a browser with an older localStorage store may lack
   the newer ones.
8. Continuously rendering pages (World3D, sim runs) never quiesce under
   virtual time; appshot falls back to its Chrome `--timeout` (25 s with
   `--vt`, `--vt 0` = real-time dump, override via `FF_SHOT_TIMEOUT_MS`).
   DEV `?ffvis2d=drought|baseline[&ffvis2dDay=N]` loads a real sim run into
   the Blueprint for headless gates.

## Related docs

`HANDOFF.md` (status/code map/traps) · `README.md` (endpoints + backend swap)
· `SPEC.md` · `quality/SPEC-*.md` + `quality/MISSION-*.md` (contracts +
verification logs) · `quality/ASSETS.md` · `quality/QUALITY_BAR.md` ·
`implementation-notes.md` (decisions ledger — keep appending).
