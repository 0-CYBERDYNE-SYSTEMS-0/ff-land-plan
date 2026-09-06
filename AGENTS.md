# AGENTS.md

This file provides guidance to AI coding agents (Codex / Claude Code / ZCode)
when working with code in this repository. Last refreshed 2026-08-25 against
`2c29eb9`.

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

## CI/CD

GitHub Actions (`.github/workflows/`) gates every PR to `main` and every push
to `main` with three parallel jobs: `typecheck + build` (uploads `dist/` as an
artifact), `headless smoke` (dev server + `appshot --gate --expect` on
`#/farms/1/map` and `--expect` on `showcase.html`; PNGs uploaded as artifacts),
and `secret + private-file scan` (gitleaks over full git history, pinned
binary, plus `tools/check-private-files.mjs` — locally:
`npm run check:private`). Pushing a `v*` tag triggers `release.yml` → typed +
built tarball attached to an auto-created GitHub Release. Dependabot opens
weekly npm/Actions bump PRs (react/react-dom/@types/* bump as one unit).
`tools/appshot.mjs` resolves Chrome via `FF_CHROME_BIN`, then macOS paths,
then Linux paths (CI uses the runner's `google-chrome`); it passes
`--enable-unsafe-swiftshader` for GPU-less runners and accepts `--vt <ms>`
and `FF_CHROME_FLAGS`. Branch protection is plan-gated, so `main-guard.yml`
is the enforcement: any non-merge commit landing on `main` without an
associated PR turns that run red — land ALL changes via green PRs.

Caveats:

- `npm run lint` is defined but broken — ESLint is not installed and there is
  no config. Use `npm run typecheck` instead. TS strict +
  `noUnusedLocals`/`noUnusedParameters`: an unused import fails the build.
- There are no tests and no test runner. Verification = typecheck + build +
  the headless screenshot harness below.
- Headless smoke: start the dev server, then
  `node tools/appshot.mjs "<url>" <out.png> [WxH] [--gate] [--expect "<text>"]`
  (~40 s/shot; Chrome is killed on a timeout BY DESIGN after the page settles —
  trust the GATE/EXPECT output lines and PNG bytes, never exit codes).
  `--gate` fails on console errors/unhandled rejections captured by a dev-only
  boot probe (`src/dev/bootProbe.ts`, wired in `main.tsx` under DEV only);
  `--expect` asserts page content so a clean gate on a NotFound page can't
  pass silently. On `showcase.html` there is no boot probe — assert
  `--expect "showcase-ready N"` instead. Scratch PNGs go in `$TMPDIR/<dir>/`
  (create it first; Chrome won't mkdir), never `/tmp` root.

## Architecture

**Many frontends, one backend.** `PlanState` (`{ground:{'x,y':slug},
planting:{'x,y':cropId}}` sparse maps) plus two seams serve every view:

- **Data seam:** `src/lib/api.ts` exports `apiFetch: Api`. Default is the
  local-first client (`src/lib/localApi.ts`: persistent localStorage store via
  `src/lib/store.ts` + real Open-Meteo weather in `src/lib/weather.ts`). Set
  `VITE_API_BASE_URL` (see `.env.example`) to swap in the typed fetch client
  `src/lib/restApi.ts` — no page changes. The `Api` interface (in
  `localApi.ts`) mirrors the README endpoint contract; keep all three in sync.
- **Mutation seam:** `src/components/designer/usePlanEditor.ts` (~1,300 lines)
  owns ALL plan editing state/mutations (undo/redo snapshots, 600 ms autosave,
  pointer/pinch/wheel, zoom API, tools). Never fork mutation logic or write
  `planRef.current` ad hoc outside its snapshot paths.

Frontends consuming those seams:

1. **Blueprint** (`#/farms/:id/map`, 2D canvas editor): tools Select(V),
   Brush(B), Rect(R), Asset(A), Erase(E), Pick(I), Fill(G), Line(L); brush
   1×1/3×3/5×5; ghost previews; Spacing-violation + Companions overlays;
   plants/ground layer toggles; zoom cluster; starter templates
   (`src/data/templates.ts` → crop NAMES resolved to ids at apply time;
   custom crop ids start at 1000 and are never renumbered).
   **`drawPlan` (`src/lib/renderPlan.ts`) has three consumers** (interactive
   canvas, PNG export, 3D ground tiles) — any new visual layer MUST be an
   opt-in `RenderOptions` flag defaulting OFF (`ghost`, `spacingViolations`,
   `companionHalos`, `layers` are shipped examples). Keep renderPlan free of
   remote `drawImage` (export taint).
2. **World3D** (lazy island, vanilla three.js — NOT react-three-fiber; React 18
   constraint): init effect runs ONCE per mount/farm (deps `[sceneReady,
   farmId]`; everything else flows through refs or the incremental-update
   effect keyed on `planVersion`). Live weather reaches the rAF loop through a
   ref (graceful offline fallback + "cached" chip). `src/three/sky.ts` owns THE
   directional sun + moon fill (engine adds ambient only — never add a second
   sun). Time-of-day/date-scrub test hooks: `?ffview=world&fftime=<0..1>&ffdebug=1`
   placed BEFORE the hash (`/?params#/farms/1/map`) — params inside the hash
   fragment break wouter matching.
3. **Creative asset library** (`src/creative/`, ~7.5k lines): 157 deterministic
   voxel builders across four registries — terrain (14 tiles), crops (17
   archetypes × 6 growth stages covering ALL catalog crops via
   `crops/map.ts`), structures (20), creatures/tools/atmosphere (20). Built on
   `src/creative/voxel.ts` (palette, baked face shading, seeded PRNG — same
   seed ⇒ identical rebuilds; NEVER use `Math.random` there). Consumed by thin
   adapters: `src/three/plants.ts` (InstancedMesh per crop+stage,
   `makeCropFor(name, stage)`), `ground.ts` (tile builders by ground slug),
   `structures.ts` (one instance per contiguous region at size derived from
   `assetLibrary` records; linear items per-cell), `animals.ts`
   (coop→hens+rooster, beehive→bees, pond→ducks, barn→cow+pig+sheep, planted
   cells→butterflies), `dressing.ts` (tool props near sheds/taps/bed edges).
   One voxel = 10 cm world scale. Preview surface: `showcase.html`
   (`#lane=a|b|c|d`, `only=id`, `mode=sheet|big`).
4. **Ops views**: Dashboard/Calendar/Weather/Simulations/Monitoring pages
   (TanStack Query v5, Wouter hash routing, shadcn-style local UI primitives).

Layout invariants of PlotDesigner (don't regress): page root `xl:h-full` flex
column; canvas card `flex min-h-0 flex-col` absorbing toolbar wrap; below xl
canvas is `h-[60dvh]` with panels on page scroll; canvas sizing effect keyed on
`isLoading`.

## Related docs (read before changing sensitive areas)

- `HANDOFF.md` — current status, code map, traps, verification gates.
- `README.md` — REST endpoint contract + backend swap instructions.
- `SPEC.md` — product spec/scope (Amendments section binding for the designer).
- `quality/MISSION-BETA.md`, `quality/MISSION-BLUEPRINT.md` — mission
  contracts + verification logs for the last two merged efforts.
- `quality/ASSETS.md` + `quality/QUALITY_BAR.md` — asset inventory and the
  builder↔critic quality bar ("best Minecraft farm build" standard).
- `implementation-notes.md` — incremental decisions ledger; keep appending.
