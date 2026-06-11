# HANDOFF — FarmFriend Pro upgrade (`pro-upgrade` branch)

**Status at handoff: Phases 1–2 of 7 complete and committed. Phase 3 (Plot
Designer) is ~40% done — both support libraries are written, typechecked, and
committed; the page component is NOT started.** Typecheck is clean. The app has
not been smoke-tested in a browser since the weather swap — do that early.

Read these first, in order:
1. `SPEC.md` — what we're building. **The "Amendments (post Opus review)"
   section is binding** — it overrides the prose above it where they differ.
2. `implementation-notes.md` — decisions/tradeoffs made so far. Keep appending
   to it; it's a deliverable.
3. This file.

## Where things stand

| Phase | State |
| --- | --- |
| 1. Types, real crop dataset (47), asset library (21) | ✅ committed `1eca669` |
| 2. Persistent store, local API, live Open-Meteo weather, frost heuristic, geocoding | ✅ committed `1eca669` |
| 3. Plot Designer (canvas) | 🟡 libs done (`src/lib/plan.ts`, `src/lib/renderPlan.ts`); **page component not started** |
| 4. FarmForm geocoding + frost dates; plan-aware Dashboard | ⬜ |
| 5. Planting calendar (`/farms/:id/calendar`) | ⬜ |
| 6. PNG/CSV exports + Crops page upgrade | ⬜ |
| 7. QA, README, final commits | ⬜ |

Git: branch `pro-upgrade`; restore point is `main @ 770c186`. History:
`6c655e8` (spec+notes) → `1eca669` (phases 1–2) → libs committed after.
Working tree should be clean when you start; `npm run typecheck` must stay clean
(note: `npm run lint` is broken repo-wide — no ESLint installed; typecheck is the gate).

## What was built (the 30-second architecture tour)

- **`src/lib/api.ts`** is still the single seam every page imports
  (`apiFetch`). It now points at **`src/lib/localApi.ts`** (the old
  `src/mock/api.ts` is deleted), which implements the same interface backed by:
  - **`src/lib/store.ts`** — one localStorage blob `ff-pro:v1`, loaded sync at
    boot, saved via debounced `persist()` (500 ms) with quota try/catch.
    First-run seeds come from `src/data/seed.ts` (moved from `src/mock/`).
  - **`src/lib/weather.ts`** — real Open-Meteo. One fetch serves
    weather + forecast + history; `localApi.farmWeather()` memoizes per
    coordinate for 15 min and dedupes in-flight calls. Alerts are **derived
    from the live forecast** (frost/heat/flood/drought) with deterministic
    hash ids so read-state persists across recomputation.
- **`src/data/crops.ts`** — 47 real crops. IDs 1–5 deliberately match the old
  seed cells (tomato/lettuce/wheat/apple/basil) so legacy demo data renders.
  Companions/antagonists reference **slugs**, not ids.
- **`src/data/assets.ts`** — 21 placeable assets; `plantable: true` means crops
  may be painted on top (beds, greenhouse, etc.).
- **`src/lib/plan.ts`** — sparse `PlanState` model (`Record<"x,y", …>`),
  `computeStats` (plant counts via summed area — **no flood fill, on purpose**),
  `findPairings` (companion/antagonist adjacency within 4 cells = 1 m).
- **`src/lib/renderPlan.ts`** — the one draw routine used by both the live
  canvas and `renderPlanToPng` (title + legend + 1 m scale bar already done).
- **`src/lib/frost.ts`** — latitude→frost-date heuristic (formula documented in
  SPEC amendment 8). `src/lib/geocode.ts` — Open-Meteo geocoding search.

Legacy kept on purpose: `FarmCell`/`listCells`/`setCellCrop`/NDVI/sensors/sims
are untouched — Monitoring and Dashboard still read them. Don't migrate or
delete; the designer uses `getPlan`/`savePlan` instead.

## Next task: finish Phase 3 — `src/pages/PlotDesigner.tsx`

Replaces `VoxelMap` at route `/farms/:id/map` (update `src/App.tsx`, delete
`src/pages/VoxelMap.tsx`, rename the "Voxel Editor" label in
`src/components/layout/FarmNav.tsx` and `AppShell.tsx`'s mobile nav to "Plot
Designer").

Non-negotiable architecture (SPEC amendments 1, 7; Opus verdict):
- **Single `<canvas>`; never DOM cells.** Plan data lives in a **ref**;
  imperative redraw via `drawPlan()` on rAF or on-change. React state only for
  chrome: active tool, crop, asset, zoom display, stats, pairings, saved-at.
- Tools: select **V**, brush **B** (1×1 / 3×3), rectangle **R**, asset stamp
  **A**, erase **E** (layer toggle plants/ground); wheel zoom around cursor
  (emoji per cell at ≥16 px), space/middle-drag pan, zoom-to-fit button.
- Hit test: `floor((mouseX − offsetX) / cellPx)`. Planting allowed per
  `canPlantAt()` (bed cells, or anywhere if `allowOutsideBeds`).
- Undo/redo: snapshot `{planting, ground}` (shallow clones) per stroke
  (pointerdown→pointerup), cap 50; redo cleared on new stroke. Cmd+Z / ⇧Cmd+Z.
- Autosave: debounce ~600 ms after each committed stroke →
  `apiFetch.savePlan(planRef.current)`; show a "Saved ✓" indicator. Load via
  `apiFetch.getPlan(farmId)` → `createDefaultPlan(farmId)` when null.
- Stats/pairings: recompute after each stroke (cheap — sparse maps);
  `conflictCellSet(pairings)` feeds the amber highlights in `drawPlan`.
  Live plant-count readout while painting is an approved cheap win.
- Plan settings dialog: width/height (2–60 m, then `clampPlan`),
  `allowOutsideBeds` toggle.
- Side panel: crop palette (searchable, emoji+color chips), asset palette
  (grouped by category), per-crop stats (area, ≈N plants, yield kg), totals
  (water L/day, families), pairing warnings ("Fennel inhibits tomato — keep
  1 m apart") and companion notes.

Then phases 4–6 per SPEC (calendar math helpers belong in a new
`src/lib/calendar.ts`, using `monthDayToDoy`/`dateFromMonthDay` from frost.ts),
then Phase 7.

## Traps that will actually bite you

1. **Open-Meteo soil/UV are hourly-only.** Already handled in `weather.ts`
   (current-hour index + `timezone=auto`) — verified live on 2026-06-11. Don't
   "simplify" them into `current=`; they silently vanish.
2. **QueryClient defaults are hostile to weather**: global
   `staleTime: Infinity` + a default queryFn that fetches the queryKey as a
   URL. Any new weather/alert/forecast `useQuery` MUST pass its own `queryFn`
   and `staleTime: 15 * 60 * 1000`. The existing pages (Weather, Dashboard,
   Monitoring) already pass their own queryFn via `apiFetch` — but they inherit
   `staleTime: Infinity`, which is now wrong for weather; per-query overrides
   are part of remaining work (Phase 4/7 polish).
3. **Soil moisture units**: Open-Meteo returns volumetric m³/m³ (~0–0.5);
   `weather.ts` maps to % via ×200. If readings look halved/doubled, that line
   is the suspect.
4. **PNG export taint**: keep `renderPlan.ts` free of `drawImage` from remote
   URLs or `toBlob()` throws. Emoji as `fillText` is safe.
5. **Custom crop ids start at 1000** (`store.ts` counters) — static library ids
   stay below that. Don't renumber library crops; plans persist cropIds in
   localStorage.
6. **`ctx.roundRect`** requires TS ≥5.x DOM lib (present, 5.6) and a modern
   browser — fine for Vite dev targets, just don't downgrade TS.
7. Garlic/cover-crop calendar offsets are **positive large weeks** (fall
   planting ≈ weeks 18–30 after last frost) — an approximation, flagged in
   implementation-notes. The calendar must handle `lastFrost: null`
   (|lat| < 10 → treat as direct-sow year-round, SPEC amendment 8).

## Verification gates (run before calling anything done)

1. `npm run typecheck` — clean (it is at handoff).
2. `npm run build` — not yet run on this branch; run it.
3. Browser smoke: `npm run dev` → every page loads, no console errors; Weather
   page shows real Portland data for seed farms; refresh persists farms/plans.
   Clear `localStorage` (`ff-pro:*`) to test first-run seeding.
4. End-to-end (SPEC "Verification plan"): create farm via geocoding → weather →
   design plot → counts/conflicts → refresh persists → calendar dates sane →
   PNG + CSV export.

## Workflow the user asked for (keep honoring it)

Orchestrator implements; **Opus** for heavy design reasoning (its spec review
verdicts are already folded into SPEC amendments); **Sonnet** for
status/verification passes (browser QA); **Haiku** for all git operations.
Commit after each completed phase, message style as in `1eca669`.
**Never** put Claude/Anthropic/co-author references in commits or files.
Keep `implementation-notes.md` updated as you go — it's an explicit user
deliverable, same as the code.

Task list state at handoff: #1 ✅, #2 ✅, #3 in_progress, #4–7 pending.
