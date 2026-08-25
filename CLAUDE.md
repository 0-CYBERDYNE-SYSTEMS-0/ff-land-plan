# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository. Last refreshed 2026-08-25 against `2c29eb9` — kept in
sync with `AGENTS.md` (which has the fuller version).

## Project

FarmFriend Voxel Digital Twin — a React 18 + TypeScript + Vite SPA for farm
planning (voxel crop map, weather, sensors, simulations) with a procedural
voxel 3D world. The directory is `ff-land-plan` but the package name is
`ff-voxel-twin`; both refer to this project.

## Commands

```bash
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build on port 4173
npm run typecheck  # tsc --noEmit — the primary verification gate
```

Caveats:

- `npm run lint` is defined but broken — ESLint is not installed and there is
  no config. Use `npm run typecheck` instead. TS strict +
  `noUnusedLocals`/`noUnusedParameters`: an unused import fails the build.
- There are no tests and no test runner. Verification = typecheck + build +
  the headless screenshot harness: `node tools/appshot.mjs "<url>" <out.png>
  [WxH] [--gate] [--expect "<text>"]` (~40 s/shot; Chrome killed on timeout BY
  DESIGN — trust GATE/EXPECT lines, not exit codes; scratch PNGs in
  `$TMPDIR/<dir>/`, create dirs first; showcase pages assert
  `--expect "showcase-ready N"`).

## Architecture

**Many frontends, one backend.** Two seams serve every view:

- **Data seam** — `src/lib/api.ts` exports `apiFetch: Api`. Default:
  local-first (`localApi.ts`: localStorage store + real Open-Meteo weather).
  Set `VITE_API_BASE_URL` to swap in `restApi.ts`; no page changes. Keep the
  `Api` interface, localApi, restApi and the README endpoint list in sync.
- **Mutation seam** — `usePlanEditor.ts` owns ALL plan editing (undo
  snapshots, 600 ms autosave, tools, zoom API). Never fork it.

Frontends:

1. **Blueprint** (2D editor): Select(V)/Brush(B)/Rect(R)/Asset(A)/Erase(E)/
   Pick(I)/Fill(G)/Line(L), ghost previews, Spacing + Companions overlays,
   layer toggles, zoom cluster, starter templates (`src/data/templates.ts`;
   crop NAMES resolved at apply time; custom ids ≥1000 never renumbered).
   **Law:** `drawPlan` feeds canvas + PNG export + 3D ground tiles — new
   visual layers must be opt-in `RenderOptions` flags defaulting OFF.
2. **World3D** (vanilla three.js island, lazy-loaded): mount-once init effect
   (`[sceneReady, farmId]` deps; refs elsewhere); sky.ts owns THE single sun;
   live weather reaches rAF via a ref. Test hooks BEFORE the hash:
   `/?ffview=world&fftime=<0..1>&ffdebug=1#/farms/1/map`.
3. **Creative library** (`src/creative/`): 157 deterministic voxel builders
   (terrain / crops×6 stages / structures / creatures+tools+presets) consumed
   by thin adapters (`plants/ground/structures/animals/dressing.ts`). Seeded
   PRNG only — never `Math.random`. One voxel = 10 cm. Preview:
   `showcase.html#lane=a|b|c|d`.
4. **Ops views**: Dashboard/Calendar/Weather/Simulations/Monitoring.

Layout invariants of PlotDesigner (don't regress): `xl:h-full` flex column;
canvas card absorbs toolbar wrap; below-xl `h-[60dvh]` + page scroll;
sizing effect keyed on `isLoading`.

## Traps that will bite you

1. Open-Meteo soil/UV are hourly-only (`weather.ts` handles it).
2. QueryClient defaults: `staleTime: Infinity` + URL-joining default queryFn —
   pass explicit `queryFn`s; override staleTime for weather queries.
3. Soil moisture m³/m³ → % via ×200 in `weather.ts`.
4. Keep `renderPlan.ts` free of remote `drawImage` (export taint).
5. Custom crop ids start at 1000; plans persist ids in localStorage.
6. `npm run lint` is broken repo-wide; typecheck is the gate.
7. React 18 (not 19) — why R3F is off the table.
8. Query params go BEFORE the hash; params inside the hash break wouter
   (NotFound). Seed ships farms 1–2 only — there is no farm 3.

## Related docs

`HANDOFF.md` (status/code map/traps) · `README.md` (endpoints + backend swap)
· `SPEC.md` · `quality/MISSION-BETA.md` · `quality/MISSION-BLUEPRINT.md` ·
`quality/ASSETS.md` · `quality/QUALITY_BAR.md` · `implementation-notes.md`.
