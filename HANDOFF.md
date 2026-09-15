# HANDOFF — FarmFriend voxel-3D upgrade (`pro-upgrade` branch)

**Status at handoff (2026-08-25): pro-upgrade phases 1–7 and all 3D phases 0–5 are
complete; the fun-UX/game layer is shipped; the `src/creative/` voxel asset library
is wired into the live World3D renderer AND fully paintable; beta hardening and
the Blueprint power-tools mission are both MERGED & VERIFIED** (see
`quality/MISSION-BETA.md` and `quality/MISSION-BLUEPRINT.md`). Typecheck and
production build are clean.

Shipped since the 2026-06-13 handoff:

- **Fun-UX / game layer:** dynamic sky with time-of-day sun, clouds, weather FX,
  flight mode, guided tour, living animals, audio, achievements, and a Perf HUD
  (behind Debug).
- **Creative voxel asset library:** `src/creative/` — 157 deterministic builders
  (14 terrain tiles, 103 crop stage builds across 17 archetypes covering all 47
  catalog crops, 20 structures, 20 creatures/tools/atmosphere) — all runtime-QA'd,
  wired into World3D via four thin adapters (`src/three/{plants,ground,structures,
  animals,dressing}.ts`), and **paintable from the designer** (barn wakes cows/
  pigs/sheep; tools auto-dress scenes near sheds/taps/beds).
- **Beta hardening (merged):** live weather actually drives clouds/rain FX/audio/
  plant sway (ref-based rAF plumbing, graceful offline + "cached" chip); single-
  sun lighting (sky owns THE directional sun + moon fill; night stays legible);
  mount-once World3D init (brush strokes/date scrubs no longer rebuild the scene);
  typed REST client behind `VITE_API_BASE_URL`; automated route smoke gate.
- **Blueprint power tools (merged):** ghost previews, Pick/Fill/Line/5×5 brush,
  spacing-violation tint + companion halos (real catalog math), layer toggles,
  zoom cluster, 6px mobile fit floor, Esc/Space/cursor fixes, starter templates
  (Salad Garden, Salsa Bed, Pollinator Strip, Four-Bed Rotation), recently-used +
  asset search, inspector upgrade. Zero PlanState schema changes — old plans load.

Read in order: this file → `SPEC.md` (the "Amendments" section is binding for
the 2D designer) → `implementation-notes.md` (keep appending; it's a
deliverable).

## Growth Visual Evolution mission milestones (branch `growth-visual-evolution`, 2026-09-12)

Branch cut from `pro-upgrade@6e23a98`; binding spec
`quality/SPEC-GROWTH-VISUAL.md`; one dated entry per wave in
`implementation-notes.md`. Never merged by agents.

- **Wave 0 — DONE (ec7c559).** Baseline verified (Draws 273), showcase scrub
  tool (`#mode=scrub`), spec authored, ASSETS.md corrected (50 crops).
- **Wave 1 — DONE (e81865d).** `src/lib/sim/view.ts` pure projection seam
  (PlantViewParams); Tier-1 per-instance channels in plants.ts
  (instanceColor stress tint + genetic variation, wilt matrix channel);
  batch-MAX tint replaced in run mode; `?ffvis=stress` proof hook.
- **Wave 2 — DONE (e5b6215).** Tier-2 lifecycle state geometry for all 18
  archetypes (`src/creative/crops/states/`): dead/desiccated,
  harvested/stubble, overripe (+ CropPalette stress/dead slots); state axis
  in template keys; day-keyed reconcile; lettuce bolting pose.
- **Wave 3 — DONE (ada50bd).** Tier-3: 7 de-cloned crop specials
  (`src/creative/crops/specials/` — Pepper, Eggplant, Sunflower, Pumpkin,
  Zucchini, Melon, Cucumber); 10-keyframe visual axes (mechanism in
  view.ts `stageCountFor` + registry `Archetype.stages`; corn phenology +
  apple age series opted in); allium tops-down; s5 "pick me" fixes across
  every flagged archetype; leafy-head vs brassica silhouette split. Critic
  27/27 PASS; Draws still 273; lane-B sheet now 117 assets.
- **Wave 4 — DONE.** World coupling: run `envSeries` day drives weather FX /
  sky mood (dome greys under overcast, sun/ambient dim) / sway via the pure
  `envToWeatherCurrent` bridge (day-keyed cache — zero per-frame allocs);
  soil pads separated into 2 shared instanced meshes with per-cell moisture
  tint through `PlantViewParams.moisture` (Draws 273→274, +1 flat pad mesh);
  ghost A/B growth easing (per-cell visualP carried across stage re-buckets);
  `?ffvis=drought|rain` demos + `#ff-env-bridge` DOM probe for headless
  proof. Critic round 4 ALL PASS; interactive real-run verification (drought
  run to day 90, A/B ghost to day 19). Known follow-ups: stress-tint
  strength backlog (wave 1/3), rain streaks subtle under headless.
- **Wave 5 — DONE (2026-09-13).** 2D parity + docs. Blueprint sim overlays as
  opt-in `RenderOptions` flags (`simMoisture` banded soil, `simStress` red
  severity wash, `simReady` amber corner triangles) default OFF — fed by the
  SAME projection layer (`projectPlant`/`effectiveStress`), day-keyed, pushed
  by PlotDesigner only while a run is active (toolbar Moisture/Stress/Ready
  toggles appear then; PNG export path untouched). Unmapped custom crops
  (ids ≥ 1000) now render through `makeCropForCustom` (per-category archetype
  recolored by the crop's own colorHex) in plants, ghosts AND the world — the
  pre-voxel primitive fallback is gone for every catalog category. Showcase
  scrub gained `custom:<Name>:<category>:<hex>` tokens to preview that path.
  DEV `?ffvis2d=drought|baseline[&ffvis2dDay=N]` composes a REAL run (same
  createSimRun path as the Simulations page) + seeks + enables overlays, with
  a `#ff-plan-channels` DOM probe for headless gates; appshot grew a Chrome
  `--timeout=25000` bound (sim-run pages never quiesce under virtual time).
  Verified: typecheck/build green; plain blueprint GATE+EXPECT; drought DOM
  gate (day 25, m=414 s=414 r=52) + baseline day 40 (s=79 r=24) — scenario
  contrast machine-asserted; world GATE **Draws: 274**; lane-B sheet 117;
  tomato scrub ×2 byte-identical; critic PASS on both overlay screenshots and
  the custom-crop scrub sheet (18 cells). Known follow-ups recorded in the
  notes: ready-marker window is only the 3-day standing-grace period (engine
  auto-harvests); May-start baseline runs chronically kill the field (sim
  tuning question, out of visual scope); stress-wash alpha subtle at low zoom
  (wave-1/3 tint-strength backlog); interactive in-world custom-crop painting
  left unverified (browser contention) — showcase + type coverage instead.

**Mission complete (2026-09-13).** All six waves green. Merge-readiness
summary at the end of `quality/SPEC-GROWTH-VISUAL.md`; per-wave verification
logs in `implementation-notes.md`. Branch never merged by agents.

## Beta Notes (2026-08-25)

### How to run

- `npm install`, then `npm run dev`. Vite's default URL is
  http://localhost:5173 (the current beta session runs at http://localhost:5177).
  Verification gate: `npm run typecheck` (`npx tsc --noEmit`).
- Routing is hash-based: `#/` (dashboard), `#/crops`, `#/farms/1/map`,
  `#/farms/1/calendar`, `#/farms/1/weather`, `#/farms/1/simulations`,
  `#/farms/1/monitoring`, `#/farms/new`. The seed ships demo farms 1–7
  (see `src/data/seed.ts`; demo-farms pass 2026-09-03).
- Dev-only test hooks on the map page: `?ffview=world` opens the 3D World view
  directly, `?fftime=<0..1>` pins time of day, `?ffdebug=1` pre-opens the Perf
  HUD. Put these in the REAL query string, BEFORE the hash — params inside the
  hash fragment break wouter matching (renders NotFound). Working form:
  `http://localhost:5177/?ffview=world&fftime=0.05&ffdebug=1#/farms/1/map`.
- Automated smoke: `node tools/appshot.mjs "<url>" <out.png> 1440x900 --gate [--expect "<page text>"]`
  screenshots a route and fails on console errors / unhandled rejections;
  `--expect` additionally verifies the right page rendered (a clean gate on a
  NotFound page proves nothing).

### Tester checklist

1. Paint a plan: open `#/farms/1/map`, paint soil/crops/structures with the
   palettes, then flip **Blueprint → World** and confirm the plan stands up in 3D
   with creatures wandering near the coop.
2. In World view, scrub the date and watch plants move through growth stages; run
   the guided tour; try flight mode. Paint a **Barn** — cows, pigs and sheep
   appear around it; tool props (wheelbarrow, watering can, leaning hoe/fork)
   auto-dress near sheds, taps and bed edges.
3. Weather: `#/farms/1/weather` shows live Open-Meteo data (dashboard consumes it
   too). With the network cut, the world should keep rendering on defaults and the
   weather page falls back to last-good cache — no crashes.
4. Calendar (`#/farms/1/calendar`) and the designer exports still work end to end.
5. Blueprint editor power tools: hover **ghost previews** (brush/asset/erase),
   zoom cluster (−/%/Fit/+) bottom-right, **Pick** (I / Alt-click), **Fill**
   (G, flood of identical cells), **Line** (L), 5×5 brush (`[` `]` cycle),
   **Spacing** violation tint + **Companions** halos overlays, plants/ground
   layer toggles, rect-drag HUD. Starter templates in the rail
   (TemplatesCard first) apply with confirm; one undo restores the prior plan.

### Known limitations (honest list)

- The REST client (`src/lib/restApi.ts`) ships type-checked against the `Api`
  interface but is **unexercised against a live server**. It activates only when
  `VITE_API_BASE_URL` is set (see `.env.example`); default behavior stays local-mock.
- Performance **has been profiled** (2026-09-04, headless Chrome via the Perf
  HUD at noon, 1440×900): farm 1 North Meadow 34 FPS / 273 draws / 2.3 M tris;
  farm 6 Mushroom Warehouse 46 FPS / 82 draws / 1.6 M tris; farm 4 Market Field
  (40×24 m, ~4,000 planted cells) 8 FPS / 665 draws / **18.6 M tris** — the
  triangle count scales linearly with planted cells (~3.9 k tris/plant, no
  pathological builder), so the real lever for very large outdoor plans is a
  plant LOD/imposter system (project-scale, not yet scheduled). A real GPU
  scores higher than headless SwiftShader. Perf HUD still lives behind
  `?ffdebug=1`.
- The single-sun night-lighting rework has a produced time-of-day matrix
  (night/dawn/noon/dusk) in `quality/shots/beta/lighting/` with quantitative
  pixel-band signatures recorded in `quality/MISSION-BETA.md`. Aesthetic
  glance done 2026-09-04: all four shots readable with believable sun
  direction; minor nits only (dawn sky→ground transition slightly harsh, dusk
  orange band reads slightly flat) — recorded, no action taken.
- Offline weather fallback serves the **last-good cache only**; that behavior is
  documented here but not yet covered by an automated test.
- Barn livestock spawn (cow/pig/sheep; coop→hens) is **interactively verified**
  as of the 2026-08-25 browser QA pass (see `implementation-notes.md`): animals
  spawn visibly in World view, the paint→save→3D pipeline works end to end, and
  the Perf HUD stayed healthy.
- Wide-spacing pairs (e.g. fruit trees, ≥4 m thresholds) are only flagged by the
  spacing overlay within its ±4-cell scan window (~1.41 m radius).

## Environments update (2026-09-13 — branch `indoor-environments`)

Indoor growing became a first-class world: six plan surfaces
(`outdoor|greenhouse|hoophouse|tent|indoor|warehouse`), voxel shells from
`src/creative/environments/` behind the cached adapter in `src/three/shell.ts`,
showcase lane `e`, 5 new equipment slugs, seed farms 8/9, enclosed starter
templates. Read `quality/MISSION-ENVIRONMENTS.md` + the 2026-09-13 ledger
entry before touching surface behavior. Trap: four surface-keyed sites do NOT
fail typecheck when incomplete — `SURFACE_OPTIONS` (DesignerToolbar),
`SLUG_MAP` (structures.ts), `SLUG_TILES` (ground.ts), showcase lane wiring —
audit them by hand when adding a surface. Visual human-eye pass over the new
renders is the one open gate before mainline merge.

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

## Where things stand (continued)

| Work | State |
| --- | --- |
| Fun-UX / game layer (sky, clouds, weather FX, flight, tour, animals, audio, achievements, perf HUD) | ✅ `c37f632` |
| Creative voxel asset forge — 157 builders, 4 gauntlet lanes (see `quality/ASSETS.md`) | ✅ `01d67a6` |
| Beta hardening: live weather→3D plumbing, single-sun lighting, REST API seam (`VITE_API_BASE_URL`), automated smoke gate (`tools/appshot.mjs`) | ✅ `e6e4031` · `quality/MISSION-BETA.md` |
| Blueprint power tools + full asset wiring: ghost/fill/line/pick/5×5, spacing & companion overlays, layer toggles, zoom cluster, starter templates, barn/livestock wake-up, region-merge structures, dressing props | ✅ `2c29eb9` · `quality/MISSION-BLUEPRINT.md` |

Working tree is clean. Dead code removed: `src/three/groundTexture.ts` (the
baked ground-plane texture, superseded by the creative voxel-tile ground
`src/three/ground.ts`) was deleted in the 2026-09-04 cleanup pass — build
re-verified, three.js still its own lazy chunk.

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

## Editor code map (post-decomposition, post power-tools mission)

- `src/components/designer/usePlanEditor.ts` (~1,300 lines) — ALL editor state:
  plan/viewport/drag refs, undo/redo, autosave, pointer+pinch+wheel handlers,
  zoom API (`applyZoom`/`stepZoomLadder` shared by wheel AND buttons), ghost
  memo, pick/fill/line ops (fill = BFS flood ≤5,000 cells; line = Bresenham via
  the ghost preview channel), overlay/layer prefs (`ff-pro:*` localStorage),
  spacing/companions derivations, stats/pairings, exports, data fetching.
  **This hook is THE mutation seam — every write path snapshots once + one
  debounced autosave.** Exports `sowWindow()` for SelectionPanel/CSV reuse.
- `src/components/designer/BlueprintCanvas.tsx` — canvas element + zoom/layer
  cluster overlay + rect HUD chip + focus-scoped keyboard handling.
- `DesignerToolbar.tsx` — tools Select(V)/Brush(B)/Rect(R)/Asset(A)/Erase(E)/
  Pick(I)/Fill(G)/Line(L), brush sizes 1×1/3×3/5×5 (`[` `]` cycles), mode
  pickers, Spacing + Companions overlay toggles, history/export/settings.
- `CropPalette.tsx` / `AssetPalette.tsx` — palettes with search + recently-used
  rings (`ff-pro:recent-crops` / `ff-pro:recent-assets`).
- `TemplatesCard.tsx` (+ data in `src/data/templates.ts`) — four starter plans;
  apply = confirm → one `replacePlan(..., {save:true})` → one undo entry.
- `SelectionPanel.tsx`, `StatsPanel.tsx`, `PairingsPanel.tsx` — presentational;
  rail order: Templates → CropPalette → AssetPalette → Selection → Stats →
  Pairings.
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
   crops — plans persist cropIds in localStorage. Template data stores crop
   NAMES and resolves them to ids at apply time.
6. **TS strict + noUnusedLocals/noUnusedParameters**: unused imports fail the
   build. `npm run lint` is broken repo-wide (no ESLint installed);
   `npm run typecheck` is the gate.
7. **React 18, not 19** — this is why R3F is off the table (decision 1).
   A React 19 bump is a separate, deliberate project.
8. **`drawPlan` has three consumers** (interactive canvas, PNG export, 3D
   ground tiles path): any new visual layer MUST be an opt-in `RenderOptions`
   flag defaulting OFF or it leaks into exports/world. Overlays shipped this
   way (`ghost`, `spacingViolations`, `companionHalos`, `layers`).
9. **Query params go BEFORE the hash**: `?ffview=world#/farms/1/map`. Params
   inside the hash fragment break wouter matching (renders NotFound). The seed
   ships demo farms 1–7 (see `src/data/seed.ts`; demo-farms pass 2026-09-03).
10. **Headless world-route captures race plan loading**: structures may build
    from an empty ground map under virtual time, so world PNG bytes cannot
    arbitrate scene content — use GATE + Node-side runtime probes instead
    (see MISSION-BLUEPRINT Verification Log).

## Verification gates (run before calling anything done)

1. `npm run typecheck` — clean at handoff.
2. `npm run build` — clean as of 2026-09-04 (main chunk ~533 kB / ~157 kB gzip;
   the chunk-size warning is recharts and is expected — but three.js must
   land in its own lazy chunk, not here).
3. Automated smoke (replaces ad-hoc Playwright): dev server up, then
   `node tools/appshot.mjs "<url>" <out.png> [WxH] --gate [--expect "<text>"]`
   per route (~40 s/shot; Chrome killed on timeout BY DESIGN — trust the
   GATE/EXPECT lines + PNG bytes, not exit codes). Showcase pages assert
   `--expect "showcase-ready N"` (boot probe not mounted there). Scratch
   PNGs go in `$TMPDIR/<dir>/` (never `/tmp`, never the repo unless archiving
   evidence); create target dirs first — Chrome won't mkdir.
4. Dashboard network tab must show NO three.js chunk until the World toggle
   is clicked.

## Suggested skills for the next session

- `webapp-testing` or `browse` — interactive checks that need real clicks
  (the headless harness cannot synthesize trusted events).
- `investigate` — if a regression appears, root-cause before patching.
- `qa` / `qa-only` — end-of-phase sweep across viewports using appshot.

## Workflow the user asked for (keep honoring it)

Orchestrator plans and verifies; **Opus** for heavy design reasoning;
**Sonnet** workers implement under precise specs; **Haiku** for all git
operations. Commit after each completed phase (message style as in
`336959d`). **Never** put Claude/Anthropic/co-author references in commits or
any project file. Keep `implementation-notes.md` updated as you go.
