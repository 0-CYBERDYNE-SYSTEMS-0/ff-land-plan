# HANDOFF — FarmFriend voxel-3D upgrade (`pro-upgrade` branch)

**Status at handoff (2026-06-13): ALL 3D phases 0–5 are complete.** The voxel-3D
initiative is fully shipped. Typecheck and `npm run build` are both clean.

Read in order: this file → `SPEC.md` (the "Amendments" section is binding for
the 2D designer) → `implementation-notes.md` (keep appending; it's a
deliverable).

## Where things stand

| Work | State |
| --- | --- |
| Pro upgrade phases 1–7 (crops, store, weather, designer, calendar, exports) | ✅ `1eca669` … `cd8fef5` |
| 3D Phase 0a — editor access fixes (mount race, responsive layout, touch) | ✅ `336959d` |
| 3D Phase 0b — decompose PlotDesigner into `usePlanEditor` + components | ✅ `261941f` |
| 3D Phase 1 — read-only World view (three.js island) | ✅ |
| 3D Phase 2 — procedural plant models | ✅ |
| 3D Phase 3 — time-scrub growth animation | ✅ |
| 3D Phase 4 — edit-in-3D via raycasting | ✅ |
| 3D Phase 5 — undo/redo history visualization | ✅ |

Uncommitted: `src/data/seed.ts` carries ~95 lines of a half-finished
"showcase plan" seed (demo plot for first-run). It typechecks but was never
verified in-browser. Finish it or revert it — do not blindly commit it.

## The 3D architecture (decided after Opus review — do not relitigate casually)

Full reasoning lives in this branch's planning session; the decisions:

1. **Vanilla three.js in a React island — NOT react-three-fiber.** The app is
   React 18; R3F v9+ requires React 19, so R3F would pin us to its legacy v8
   maintenance branch. One `<World3D>` component owns a canvas, builds the
   scene imperatively in an effect, runs its own rAF loop, and receives plain
   props (`PlanState`, date, weather, lat/lng). Only revisit if React 19
   upgrade happens first. Use `camera-controls` (yomotsu) for orbit/pinch.
2. **Draw-call budget < 80 worst case.** Ground layer = ONE plane with a baked
   `CanvasTexture` (reuse `renderPlan.drawPlan` onto an offscreen canvas —
   do not write a second ground renderer). Plants = one `InstancedMesh` per
   crop present (≤47, typically <10). Structures = one `InstancedMesh` per
   asset archetype (≤21). Rebuild geometry only on plan edit, never per frame.
3. **Fully procedural models, no asset packs.** Per-crop voxel plant from data
   we have: `category` → archetype shape, `colorHex` → color, `growthDays` →
   height scale, seeded per-cell jitter to kill the clone look. Far-LOD =
   instanced billboards (also the mobile tier).
4. **2D stays the editor ("Blueprint"); 3D ships read-only first ("World"
   toggle).** `PlanState` is the single source of truth; `World3D` is a pure
   projection. Edit-in-3D arrives in Phase 4 by raycasting to the grid and
   calling the SAME mutation functions via `usePlanEditor` — never fork the
   mutation logic.
5. **Lazy-load the entire 3D bundle.** `React.lazy(() => import(World3D))`
   behind the toggle + a `manualChunks` entry for `three` in `vite.config.ts`.
   The main bundle is already 295 kB gzip (recharts); three.js must not load
   on dashboard pages.
6. **Schema changes are additive + optional only** (`store.ts` merges loaded
   blobs over the seed shape, so old localStorage plans keep working):
   `plantedAt?: Record<"x,y", string>` (fallback: derive sow date from
   `calendar.ts`), `structureHeights?`, `elevation?` (defer), `view3d?`
   (camera memory).

## Phase 1 scope (shipped 2026-06-13)

Deliverable: flip a Blueprint/World toggle and the saved plan stands up as an
orbitable 3D model, desktop + tablet. Concretely:

- `src/three/engine.ts` — renderer/scene/camera/rAF lifecycle, resize.
- `src/three/groundTexture.ts` — `PlanState` → offscreen canvas via
  `drawPlan` → `CanvasTexture` on a ground plane.
- `src/three/structures.ts` — procedural box models per asset slug
  (raised bed frame, greenhouse translucent box, fence post+rail, pond,
  shed…), instanced per archetype, default heights in code.
- Plants as instanced voxel boxes (colorHex, category-based height; full
  procedural plants are Phase 2).
- `src/components/world/World3D.tsx` — the lazy island; `ViewToggle.tsx` in
  the designer header; wired into `src/pages/PlotDesigner.tsx`.
- `camera-controls` + `three` as new deps; `fitToBox` the plot on mount.
- `vite.config.ts` `manualChunks` splits three.js into its own lazy chunk.

## Phase 2 scope (shipped 2026-06-13)

Deliverable: replace the colored voxel plant boxes with procedural plant
geometry (stem + leaves/fruit) that reflects the crop's archetype. Keep the
instanced-per-crop draw-call budget.

Concretely:
- `src/three/plants.ts` rewritten with `BufferGeometryUtils.mergeGeometries`.
- Per-crop-category procedural geometry: vegetable = stem + leaves + fruit;
  herb = bushy cluster; fruit = woody stem + canopy; grain = stalk + tassel;
  flower = stem + head; cover_crop = flat ground cover.
- Color from `crop.colorHex`, height scale from `growthDays` relative to
  category baseline.
- Seeded per-cell jitter (position, rotation, height variation) to kill the
  clone look.

## Phase 3 scope (shipped 2026-06-13)

Deliverable: time-scrub growth animation. Date picker in World3D footer scales
plant height by maturity progress.

- `plantedAt?: Record<string, string>` added to `PlanState`.
- `getGrowthScale(crop, plantedAt, currentDate)` returns 0-1 maturity.
- Plants scale in Y dimension by growth factor.

## Phase 4 scope (shipped 2026-06-13)

Deliverable: edit-in-3D via raycasting to the grid, calling the SAME mutation
functions via `usePlanEditor`.

- `src/three/use3DEditor.ts` — hook wrapping raycasting + mutations.
- `getCellFromRaycast`: ray vs ground plane at y=0 → cell coordinates.
- `handlePointerDown/Move/Up`: calls `applyBrushAt`, `replacePlan`, etc.
- Wired into `World3D.tsx` canvas pointer events.

## Phase 5 scope (shipped 2026-06-13)

Deliverable: undo/redo history visualization as translucent ghost overlays.

- `src/three/historyViz.ts` — `buildGhostPlants` / `disposeGhostPlants`.
- Green ghosts (undo stack), blue ghosts (redo stack), opacity 0.25.
- "Show History" toggle in World3D footer.

## Editor code map (post-decomposition)

- `src/components/designer/usePlanEditor.ts` (852 lines) — ALL editor state:
  plan/viewport/drag refs, undo/redo, autosave, pointer+pinch+wheel handlers,
  stats/pairings, exports, data fetching. **This hook is the seam both
  BlueprintCanvas and the future World3D consume.**
- `src/components/designer/BlueprintCanvas.tsx` — canvas element, DOM effects
  (ResizeObserver sizing, non-passive wheel listener, redraw, keyboard).
- `DesignerToolbar.tsx`, `CropPalette.tsx`, `AssetPalette.tsx`,
  `StatsPanel.tsx`, `PairingsPanel.tsx`, `SelectionPanel.tsx` — presentational.
- Layout invariants (fixed in `336959d`, don't regress): page root is
  `xl:h-full` flex column; canvas card is `flex min-h-0 flex-col` so the
  canvas absorbs toolbar wrap; below `xl` the canvas is `h-[60dvh]` and the
  panels are reached by normal page scroll; the canvas sizing effect is keyed
  on `isLoading` because the skeleton early-return means refs are null on
  mount.

Legacy kept on purpose: `FarmCell`/`listCells`/NDVI/sensors/sims still feed
Monitoring and Dashboard. Don't migrate or delete; the designer uses
`getPlan`/`savePlan`.

## Traps that will actually bite you

1. **Open-Meteo soil/UV are hourly-only** — handled in `weather.ts`
   (current-hour index + `timezone=auto`). Don't "simplify" into `current=`.
2. **QueryClient defaults are hostile to weather**: global
   `staleTime: Infinity` + a URL-joining default queryFn. New queries must
   pass their own `queryFn`; weather queries should override `staleTime`.
3. **Soil moisture units**: Open-Meteo volumetric m³/m³ mapped to % via ×200
   in `weather.ts`.
4. **PNG export taint**: keep `renderPlan.ts` free of remote `drawImage` or
   `toBlob()` throws. This now also protects the 3D ground texture.
5. **Custom crop ids start at 1000** (`store.ts`); never renumber library
   crops — plans persist cropIds in localStorage.
6. **TS strict + noUnusedLocals/noUnusedParameters**: unused imports fail the
   build. `npm run lint` is broken repo-wide (no ESLint installed);
   `npm run typecheck` is the gate.
7. **React 18, not 19** — this is why R3F is off the table (decision 1).
   A React 19 bump is a separate, deliberate project.

## Verification gates (run before calling anything done)

1. `npm run typecheck` — clean at handoff.
2. `npm run build` — clean at handoff (1.04 MB main chunk / 295 kB gzip;
   the chunk-size warning is recharts and is expected — but three.js must
   land in its own lazy chunk, not here).
3. Playwright smoke on `npm run dev` → `#/farms/1/map`: first load shows the
   grid centered and filling the canvas; paint → "Unsaved"→"Saved"; wheel
   zoom changes px/cell; palette reachable by scroll at 1024×768 and 390×844;
   zero console errors. (Phase 0 evidence lived in /tmp/ff-editor-audit and
   /tmp/ff-editor-fix; regenerate as needed.)
4. After Phase 1: dashboard network tab must show NO three.js chunk until the
   World toggle is clicked.

## Suggested skills for the next session

- `webapp-testing` or `browse` — Playwright smoke tests against the dev
  server (the verification gates above).
- `investigate` — if a regression appears, root-cause before patching.
- `qa` / `qa-only` — end-of-phase sweep across viewports.

## Workflow the user asked for (keep honoring it)

Orchestrator plans and verifies; **Opus** for heavy design reasoning;
**Sonnet** workers implement under precise specs; **Haiku** for all git
operations. Commit after each completed phase (message style as in
`336959d`). **Never** put Claude/Anthropic/co-author references in commits or
any project file. Keep `implementation-notes.md` updated as you go.
