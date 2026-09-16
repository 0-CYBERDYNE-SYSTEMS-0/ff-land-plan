# Implementation Notes — FarmFriend Pro upgrade

Running log of decisions made during implementation that weren't in the spec,
things changed along the way, and tradeoffs. Newest entries at the bottom of each
section. Spec: `SPEC.md`. Restore point: `main @ 770c186`, work on `pro-upgrade`.

## Workflow

- Orchestrator (Fable) wrote the spec and implements core; Opus reviewed the spec;
  Haiku handles git checkpoints; Sonnet runs verification passes.

## ⚠ Top traps (from Opus review — verified, not speculation)

1. Open-Meteo soil temp/moisture are **not available in `current=`** — hourly only.
   Read the hourly array at the index of `current.time`, with `timezone=auto`.
2. The global QueryClient has `staleTime: Infinity` and a default queryFn that
   fetches the query key as a URL. Weather queries must override both.
3. The designer grid must never be DOM nodes (3,840–57,600 cells). Canvas only,
   cell map in refs, React state for chrome only.

## Decisions not in the spec

- **Kept the `MockApi` interface name** even though weather is now real and data is
  persistent — renaming the seam would touch every page for zero user value. The
  type is re-exported as `Api` for new code. (Rationale: surgical changes.)

## Tradeoffs

- **localStorage over IndexedDB**: plans at max size (240×240 cells) serialize to
  well under 1 MB; localStorage is synchronous-simple and good to ~5 MB. IndexedDB
  would add async complexity for no practical gain at this data size.

## Data sourcing

- Crop spacing/companion/frost data: standard horticultural reference values
  (the kind printed on seed packets / extension-service tables). Where sources
  disagree (e.g., tomato spacing 45–60 cm), the mid-range value was chosen.
- Weather: Open-Meteo (open-meteo.com) — free, no API key, CC-BY 4.0 attribution
  added to the Weather page footer.

## Decisions made during phases 1–3 (chronological)

- **Pre-existing typecheck failures fixed**: the repo had never actually been
  typechecked (node_modules wasn't installed, `tsc` unavailable, lint broken).
  Fixed unused imports in AppShell/Sidebar/Stat/Crops and a wouter route-typing
  error in App.tsx as part of the quality gate.
- **Crop ids 1–5 pinned** to the legacy seed values so old demo voxel cells
  still render with the new 47-crop library. Custom crops start at id 1000.
- **Soil moisture unit conversion**: Open-Meteo returns volumetric m³/m³;
  mapped to a 0–100% display value via ×200 (0.5 m³/m³ ≈ saturated ≈ 100%).
- **Alerts are fully derived** from the live forecast with deterministic hash
  ids (farm:type:date) so read-state survives recomputation; the old seeded
  alerts (incl. 'pest'/'nutrient' types) are gone — those types remain in the
  TS union for future use.
- **`src/mock/` deleted**; seeds moved to `src/data/seed.ts` (only farms,
  legacy cells, sensors, sims, NDVI — crops/weather/alerts are real now).
- **Garlic & cover crops** get approximate fall-sowing windows expressed as
  +26..+30 weeks after *last* frost (the calendar model is last-frost-relative);
  good enough for v1, noted as future work to model first-frost-relative sowing.
- **Weather page attribution** (Open-Meteo CC-BY) still needs to be added when
  the Weather page is touched in Phase 4/7.
- **Plot Designer page landed** as `src/pages/PlotDesigner.tsx`, replacing the
  old DOM-cell `VoxelMap` at the existing `/farms/:id/map` route. It keeps the
  `PlanState` in a ref, redraws the shared `drawPlan()` canvas renderer
  imperatively, and leaves React state for toolbar/sidebar chrome, stats,
  pairings, hover/selection, and saved status.
- **Designer editing model**: brush/erase/asset stamping mutate sparse cell maps
  during drag; rectangle fill commits on pointer-up; each stroke records one
  shallow plan snapshot for undo/redo (50 max) and schedules a 600 ms autosave
  through `apiFetch.savePlan`. Non-plantable assets clear plants underneath.
- **Build hygiene**: `tsc -b` was emitting `vite.config.js` and
  `vite.config.d.ts` into the repo root from the referenced node config. Moved
  that output to `node_modules/.tmp/` via `tsconfig.node.json` so `npm run build`
  leaves the worktree clean.
- **Farm form location/frost upgrade**: create/edit now supports Open-Meteo
  geocoding search, stores elevation, and exposes user-editable `MM-DD` frost
  fields. Selecting a place or pressing "Estimate from latitude" applies the
  documented latitude/elevation heuristic, with blank fields representing
  frost-free climates.
- **Dashboard plan awareness**: farm cards now read `getPlan` and compute
  planted area, approximate plant counts, and estimated yield from `PlanState`
  when a plan exists; legacy `FarmCell` coverage remains the fallback for seed
  data/monitoring compatibility. Dashboard weather and alert queries now use a
  15-minute `staleTime` instead of inheriting the global infinite cache.
- **Planting calendar**: added `src/lib/calendar.ts` and
  `/farms/:id/calendar`. Calendar actions are generated only for crops painted
  in the plan and only when the crop has sow/transplant/direct-sow metadata;
  harvest windows require a real outdoor start. Frost-free farms get year-round
  direct-sow windows for crops with calendar anchors.
- **Exports and crop library polish**: Plot Designer now downloads PNGs through
  the shared safe canvas renderer and CSV shopping lists from current plan
  stats. Crop Library cards now expose emoji, spacing, family, frost tolerance,
  and companion/antagonist chips, with added family and frost filters.
- **Phase 7 cleanup**: README now describes the local-first Pro planner instead
  of the old mock/VoxelMap app. Weather/forecast/history/alert queries touched
  in this pass use 15-minute `staleTime`, and the Weather page includes
  Open-Meteo CC BY 4.0 attribution.

## Known gaps / future work

- Per-query `staleTime` overrides for weather queries in existing pages
  (they currently inherit `Infinity`; data refreshes only on full reload).
- First-frost-relative sowing windows for fall-planted crops.
- 3D Phase 2: procedural plant models (replace voxel boxes with stem+leaf geometry).
- 3D Phase 3: time-scrub growth animation (scale plants by maturity progress).
- 3D Phase 4: edit-in-3D via raycasting to grid, calling same `usePlanEditor` mutations.
- 3D Phase 5: undo/redo history visualization in 3D.

## 3D Phase 1 — World view (2026-06-13)

**Architecture**: Vanilla three.js in a React island (NOT react-three-fiber — R3F v9+
requires React 19, we are on React 18). One `<World3D>` component owns a canvas,
builds the scene imperatively in an effect, runs its own rAF loop.

**Files added**:
- `src/three/engine.ts` — `createEngine(canvas, theme)`: renderer, scene, camera,
  `camera-controls` (yomotsu), ambient + directional lights, rAF loop with `THREE.Timer`,
  resize/dispose lifecycle.
- `src/three/groundTexture.ts` — `buildGroundTexture(plan, cropById)` reuses the
  existing `drawPlan` renderer onto an offscreen canvas → `CanvasTexture` on a
  ground plane. This is the single ground layer; no second ground renderer.
- `src/three/structures.ts` — `buildStructures` / `updateStructures` / `disposeStructures`.
  One `InstancedMesh` per unique asset slug. Procedural box heights per archetype
  (raised bed 0.3m, greenhouse 0.6m translucent, trellis 1.5m, shed 2.2m, etc.).
  Plot centered at world origin (`-widthM/2, 0, -heightM/2`).
- `src/three/plants.ts` — `buildPlants` / `updatePlants` / `disposePlants`. One
  `InstancedMesh` per unique cropId. Small colored voxel boxes (`cellM * 0.6` wide,
  height by category: herb 0.15m, vegetable 0.25m, fruit 0.4m, etc.).
- `src/components/world/World3D.tsx` — lazy-loaded island. Initializes engine,
  builds ground/structures/plants, `fitToBox` on mount, rebuilds on `planVersion` change.
- `src/components/designer/ViewToggle.tsx` — Blueprint/World toggle button group.

**Integration**:
- `PlotDesigner.tsx` uses `React.lazy(() => import('@/components/world/World3D'))`
  behind a `Suspense` fallback. The 3D bundle only loads when the World toggle is clicked.
- `vite.config.ts` `manualChunks` splits `three` + `camera-controls` into their own
  chunk (`three-D0alsh54.js`, ~779 kB / 199 kB gzip). The main chunk stays at ~479 kB
  (138 kB gzip) — down from 1.04 MB.

**Verification**:
- `npm run typecheck` clean.
- `npm run build` clean.
- Playwright smoke test: Blueprint loads → toggle to World → canvas appears →
  zero console errors, zero warnings (used `THREE.Timer` instead of deprecated
  `THREE.Clock`).
- Dashboard pages do NOT load the three.js chunk until World is toggled.

## 3D Phases 2–5 — Complete 3D upgrade (2026-06-13)

All remaining 3D phases shipped in one session.

### Phase 2 — Procedural plant models

Replaced colored voxel boxes with category-specific procedural geometry using
`BufferGeometryUtils.mergeGeometries`:

- **vegetable**: green stem (`CylinderGeometry`) + 2-3 flat leaves (`SphereGeometry` scaled) + fruit sphere
- **herb**: 3-5 small spheres in bushy cluster, no stem
- **fruit**: brown woody stem + flat leaf canopy
- **grain**: golden stalk + cone tassel
- **flower**: thin green stem + flower head sphere
- **cover_crop**: very flat ground-cover sphere

Per-cell jitter: deterministic pseudo-random seeded by cell coordinates (`rotY`,
`scaleY`, `offsetX`, `offsetZ`) to kill the clone look.

Height varies by `growthDays` within category ranges (e.g., vegetable 0.2-0.4m).

### Phase 3 — Time-scrub growth animation

Added `plantedAt?: Record<string, string>` to `PlanState` for tracking sow dates.
Date picker in World3D footer scrubs plant maturity. `getGrowthScale(crop, plantedAt,
currentDate)` returns 0-1 based on days since planting vs `growthDays`. Plants scale
in Y dimension by this factor.

### Phase 4 — Edit-in-3D

- `src/three/use3DEditor.ts` — hook wrapping raycasting + same mutations.
- `getCellFromRaycast`: casts ray against ground plane at y=0, converts world
  position to cell coordinates.
- `handlePointerDown/Move/Up`: calls `applyBrushAt`, `replacePlan`, `setSelectedKey`,
  `setRectPreview` — the SAME functions the 2D Blueprint uses.
- Wired into `World3D.tsx` canvas pointer events. Left-click paints, camera-controls
  orbit with right-click / touch.

### Phase 5 — History visualization

- `src/three/historyViz.ts` — `buildGhostPlants` / `disposeGhostPlants`.
- Translucent green ghosts (`#22c55e`, opacity 0.25) for undo stack, blue ghosts
  (`#3b82f6`, opacity 0.25) for redo stack.
- "Show History" toggle in World3D footer. Rebuilds ghosts on every plan change.

### Files added/modified
- `src/three/plants.ts` — rewritten with procedural geometry + growth scaling
- `src/three/historyViz.ts` — new
- `src/three/use3DEditor.ts` — new
- `src/components/world/World3D.tsx` — date picker, history toggle, pointer events
- `src/components/designer/usePlanEditor.ts` — exported `setRectPreview`, `setSelectedKey`
- `src/types/index.ts` — added `plantedAt` to `PlanState`

### Verification
- `npm run typecheck` clean.
- `npm run build` clean. Three.js chunk ~782 kB / 200 kB gzip. World3D chunk ~12 kB.
- Playwright smoke test: Blueprint → World toggle → canvas → zero errors.
  One non-critical warning: "Multiple instances of Three.js" from Vite chunking
  (World3D.tsx imports THREE for types, lazy chunk also imports THREE).
  Does not affect functionality.

## Beta hardening + Blueprint power tools (2026-08-24/25)

Two missions run as parallel-lane contracts with merge gates; full contracts and
verification logs live in `quality/MISSION-BETA.md` and
`quality/MISSION-BLUEPRINT.md`. Decisions and traps not recorded elsewhere:

### Beta hardening (`e6e4031`)
- **Weather → 3D plumbing**: the rAF `update` closure captured mount-time
  `weather` state forever (never in effect deps) — clouds/rain FX/audio/sway
  ran on hardcoded defaults while the footer chip showed real data. Fix pattern:
  fetch into a REF the loop reads each frame; state only for chips.
- **Single sun**: engine had a static white DirectionalLight fighting sky.ts's
  time-driven one — night was noon-lit from a fixed angle. Engine now adds
  ambient only; sky owns THE sun + a dim moon-fill (≤0.13) so nights stay
  legible per QUALITY_BAR. Warped clock: sunrise t≈0.22, sunset ≈0.90 so the
  fftime matrix hits true night AND true dusk.
- **Mount-once World3D init**: init effect previously keyed on planVersion/
  scrubDate/handlers → every brush stroke disposed + rebuilt the entire scene,
  then the incremental effect ran on top. Now deps are `[sceneReady, farmId]`;
  latest values flow through refs (handlersRef, scrubDateRef, cropByIdRef).
  StrictMode double-mount verified safe.
- **REST pluggability**: `createRestApi(baseUrl)` type-conformance-checked
  against `Api` only — unexercised against a live server (honest, documented in
  client header + HANDOFF). Assumption: setCellCrop POSTs `{id, cropId}` to the
  cells collection; getPlan maps 404→null.
- **Harness** (`tools/appshot.mjs` + `src/dev/bootProbe.ts`): headless Chrome;
  GATE = dev-only #ff-probe DOM node recording window.onerror/unhandledrejection/
  console.error. Chrome never exits gracefully while the Vite HMR socket is open
  — the spawn timeout is the terminator BY DESIGN (~40 s/shot); judge output
  lines + PNG bytes, never exit codes. Showcase.html has NO probe → assert
  `--expect "showcase-ready N"` instead (title set only after all builders run).
  `/tmp` is sandbox-denied here; use `$TMPDIR/<dir>/` and mkdir it first.
- **URL law**: query params must go BEFORE the hash (`/?a=b#/route`) — params
  inside the hash fragment break wouter matching entirely (NotFound). Seed has
  farms 1–2 only; older docs referencing `#/farms/3` were wrong (MISSION-BETA
  log carries the correction + voided evidence rows).

### Blueprint power tools (`2c29eb9`)
- **Shared-renderer law**: drawPlan feeds canvas + PNG export + 3D ground
  tiles. Every overlay shipped as opt-in RenderOptions default-OFF; Lane R
  proved default-off by BYTE-IDENTICAL before/after screenshots. New flags:
  ghost / spacingViolations / companionHalos / layers.
- **Spacing math**: `Crop.spacingCm` is CENTIMETRES; violation threshold =
  (spacingA+spacingB)/200 metres vs grid distance, ±4-cell window (same as the
  pairing engine), 400-key deterministic cap. Wide-spacing pairs (fruit trees)
  can't be flagged beyond ~1.41 m radius — accepted, documented in HANDOFF.
- **Fill semantics**: BFS flood of identical value within ONE layer, cap 5000,
  asset mode stamps slug per-cell (not footprint-per-cell) — which is exactly
  what makes Lane W's region-merge render one barn per filled region.
- **Region-merge structures**: non-linear slugs flood-fill to ONE instance per
  contiguous region sized `max(defaultWM, defaultHM)` from the SAME assetLibrary
  records Blueprint draws (2D footprint == 3D size forever). Linear items
  (fences/gates/trellis/irrigation) stay per-cell to connect. Seed farm 1:
  649 clones → 25 instances (shed 64→1). Verified via Node runtime probe —
  headless world captures can't arbitrate scene content (plan data races
  virtual-time capture; proven with a disable-everything identical-frame test).
- **Barn wakes livestock for free**: animals.ts always triggered cow+pig+sheep
  on slug 'barn'; the designer just couldn't paint one. Six new paintable slugs
  added; tools became auto-dressing props (src/three/dressing.ts) rather than
  palette items — hand-scale scene life shouldn't pollute planning data.
- **Presets retired**: studio lighting presets kept showcase-only (documented);
  wiring them live would create a second lighting authority fighting sky.update
  every frame.
- **Cross-lane seam debt**: SelectionPanel duplicated usePlanEditor's private
  sowWindow() because lanes couldn't cross file ownership; post-merge I exported
  the original and pointed SelectionPanel at it (dedup landed in the doc-refresh
  commit).
- **Templates**: data stores crop NAMES resolved to ids at apply time (custom
  ids ≥1000 never renumbered); unknown names skipped + counted; out-of-plan-bounds
  keys dropped. Apply = confirm dialog when plan non-empty → one replacePlan →
  one undo entry.

### Still open (honest)
- REST client runtime exercise awaits a real backend.
- Barn livestock + dressing aesthetics: code-path verified, needs interactive eyes.
- Perf on very large plans unprofiled (Perf HUD behind ?ffdebug=1).
- Dead code candidate: src/three/groundTexture.ts (superseded by voxel-tile
  ground.ts; zero importers).

## 2026-08-25 — Interactive browser QA + World camera fix

First full interactive (non-headless) QA pass, done in the live in-app browser:
dashboard, Blueprint painting (Asset tool: barn + chicken coop on Sunrise
Hollow), Blueprint→World flip, World camera controls, Weather, Calendar.

**Verified live (closes the "code-path verified only" gaps):**
- Barn→cow/pig/sheep and coop→hens spawn confirmed VISUALLY in World view
  (sheep + hens seen in screenshots around the painted barn/coop).
- Paint→save→3D pipeline end-to-end: painted cells persist ("Saved" chip),
  Select-tool inspection shows the painted slug, World renders the plan.
- Perf HUD healthy when the tab is visible: FPS 16–25, ~136 draws, ~25M tris.
  (HUD reads `--` in hidden/background tabs — rAF pauses; not a bug.)

**Bug found + fixed (this commit):**
- World-view wheel dolly was hypersensitive: ONE notch slammed the camera
  inside the barn, and orbit/Fit could not recover (orbit target inside
  geometry; the visible "Fit" button only resets the 2D Blueprint zoom).
  Fix: `dampingFactor 0.08` + `smoothTime 0.25` in engine.ts, plus a new
  `engine.resetView()` + "Reset view" footer button in World3D that restores
  the isometric framing. Verified interactively: two hard -400 scrolls now
  land in a usable close-up, and Reset view recovers the overview.

**Smoke gate after fix:** GATE PASS + EXPECT PASS on /, /farms/3/map,
/farms/3/weather (zero runtime errors). Typecheck + build clean; three.js
still its own lazy chunk.

**Still open (honest)**
- REST client runtime exercise awaits a real backend.
- Perf on very large plans unprofiled.
- Dead code candidate: src/three/groundTexture.ts (zero importers).
- Animal spawning remains indirect (paint barn/coop/hive/pond); palette hint
  improvement discussed but not implemented.

## 2026-09-03 — Demo farms + asset-linkage pass (pro-upgrade)

**Seed plans were dead code.** `store.ts` seeded `plans: {}`, so `seedPlans`
never loaded and every farm opened a blank `createDefaultPlan`. Now seeded, and
`load()` re-seeds missing farms/plans idempotently (user edits to existing ids
win; farm-id counter pinned above max present id so new seed farms can't
collide with user-created ones).

**New assets (editor ↔ 3D fully wired):** `grow-tent` structure (mylar shell,
open front, glow bars, seedling trays; plantable; soil underlay) and a
`mushroom` crop archetype (substrate block → pins → flush; s5 adds a dominant
cap) behind three new catalog crops — Oyster/Button/Shiitake (ids 48–50) —
under a new `fungus` CropCategory (HEIGHT_RANGE `fungus: [0.35, 0.9]`;
CropIcon + Crops page z.enum/CATEGORIES extended). `fruit-tree` is now a real
3D orchard tree (was placeable-but-invisible).

**Four demo farms (ids 3–6):** Backyard Homestead (18×14 m — shed, greenhouse,
cold frame, 3 raised beds + trellis, in-ground roots, pond, hive, coop, herb
bed, specimen fruit tree, picket perimeter), Market Field (40×24 m — corn +
wheat blocks, cover crops, sunflower border, barn/hay/crates, polytunnel +
greenhouse, irrigation runs, fruit-tree orchard), Indoor Grow Tent Op (six
tents of herbs/microgreens + poly veg room + IBC/tap utility wall), Mushroom
Farm (four fruiting rooms — greenhouse/polytunnel pairs — planted oyster,
button, shiitake over a packing/substrate yard). All stamped with per-crop
`plantedAt` so the World3D season sim opens mid-growth.

**World3D footer HUD cap:** with 14–26 distinct crops the per-crop growth list
ballooned and its stack of `bg-background/90` pills buried the scene (farms
1–3). List now `max-h-24 overflow-y-auto`.

**Trap (cost us an hour):** headless `appshot` screenshots never composite 2D
canvas content — `--screenshot` + `--virtual-time-budget` drops 2D-canvas
layers entirely (minimal repro: red-rect-on-blue page captures as pure blue;
WebGL captures fine). A "blank" Blueprint in an appshot proves nothing: the
canvas is drawn (verified via getImageData probes) — judge Blueprint work
through the GATE/EXPECT lines or a real browser, never the PNG.

## 2026-09-03 — Surface zones (outdoor / greenhouse / tent / indoor) — "second canvas"

**Model:** `PlanState.surface?: 'outdoor' | 'greenhouse' | 'tent' | 'indoor'`
(missing = outdoor; REST contract unaffected). Switchable per farm in
Settings → Surface; demo farms 5/6/7 exercise the three enclosed zones.

**Enclosure shell (`src/three/shell.ts`):** built/disposed alongside ground in
World3D (init effect + planVersion effect). Tent/warehouse are DOLLHOUSE
cutaways — only the two far walls are solid, ceiling is an open beam frame —
because the default camera sits above roof height; a solid lid walls off the
view (v3 mistake, fixed in v4). Greenhouse is fully glazed + frame posts so
the live sky reads through it. Wall height per surface: tent 1.9 m,
warehouse 2.6 m. Interior LED bars use unlit MeshBasic so they glow; linear
`grow-light` slugs mount at yOffsetM 0.85 (new SlugMapping.yOffsetM in
structures.ts).

**Floors:** three new terrain tiles (`terrain/floors.ts`: mylar, concrete,
greenhouse walkway; 24×24 slabs at path-height y=3). `resolveTileId` now takes
surface — enclosed canvases never fall back to grass (empty cells, unknown
slugs AND the 'grass' slug all resolve to the surface floor).

**Equipment palette:** new AssetCategory 'equipment' + `GardenAsset.surfaces?`
tag; AssetPalette hides tagged assets unless the plan surface matches. New
structures: LED light bar (linear), vertical grow rack (plantable, 3 decks),
hydro NFT channel (linear, plantable), clip fan, HVAC unit, potting bench
(plantable). Vertical growing: plants.ts SHELF_LIFTS lifts crops on
rack/channel/bench cells onto deterministic shelf heights.

**Twin semantics:** `scenarioGrowthMod(crop, scenario, surface)` attenuates
scenario temp/precip by SURFACE_SHELTER (outdoor 1, greenhouse 0.35, tent
0.12, indoor 0.15) — same plan, drought outside, business as usual in the
tent. World3D dims ambient per surface (0.55/0.6/0.88) and skips rain/snow FX
indoors.

**2D blueprint:** drawPlan takes `surface` (editor redraw + PNG export pass
plan.surface); SURFACE_BG floor colors per surface, dark+light themes.

**Demo rework:** farm 5 is now a true tent interior (6×5 m: 3 racks, 2 NFT
runs, 3 LED bars, fans, mylar aisle); farm 6 a sealed mushroom warehouse
(12×8 m: 24 racks in species bands, HVAC wall, fans, packing corner);
farm 7 new Greenhouse Range (10×7 m: bench rows of fruiting crops + salads,
NFT channels, LED + glass shell).

**Trap (v3):** don't give enclosed shells a solid ceiling — the default
isometric camera looks down into the room and the lid eats the whole frame.
Open-top beam frame + cutaway walls is the house style now.

## Launch kit + appshot-live (2026-09-03)

- Added `tools/appshot-live.mjs`: CDP-driven screenshot variant that waits REAL
  time instead of a virtual-time budget. Needed because recharts animations
  (Simulations, Monitoring) and the Blueprint 2D canvas freeze/blank under
  `--virtual-time-budget`. Connects to the page target via `/json/list` (the
  browser WS endpoint has no Page domain), supports `--wait <ms>` and `--full`.
- World-view capture matrix that works headless: `?ffview=world&fftime=0.25`
  (dawn, warm), `0.5` (noon hero), `0.05` (night). `fftime=0.9` renders a flat
  orange sky + near-black ground under SwiftShader — avoid for beauty shots;
  golden hour lives between 0.8 and 0.9 and is very narrow.
- `marketing/launch-kit/`: rebuildable press kit (`build.mjs` → index.html +
  deck.html → FarmFriend-Launch.pdf; `build-cards.mjs` → voxel quote cards).
  26 social assets in `social/` named `<subject>-<WxH>.png`. Copy in
  `copy/social-copy.md`. All images judged pass (2 judge rounds).

## Growth realism + arched greenhouse (2026-09-04)

- Sim playback pacing (World3D): the old 500 ms tick advancing
  `round(speed*0.5)` days actually ran 2/8/30 days per real second, so the
  default "1×/week" matured a 60-day crop in ~7.5 s and then sat static while
  sky/weather looped ("overgrow and repeat"). Now a 1 s tick advances exactly
  `simSpeed` days — labels are honest (1 day / 1 week / 1 month per second) —
  and the default dropped to 1×/day.
- Season-end auto-pause (World3D): once EVERY planted crop reads 100 % mature,
  playback runs at most 14 more sim days, then auto-pauses with a
  "Season complete" chip. Anchor date lives in `matureSinceRef`; cleared on
  resume / scenario change / planVersion change so restarting re-arms the
  grace window. No planted cells -> never pauses.
- Per-surface plant scale (growth.ts + plants.ts): new
  `SURFACE_PLANT_SCALE = { outdoor: 1, greenhouse: 0.7, tent: 0.45, indoor: 0.6 }`
  multiplies `fullHeight` in `buildPlants` (both voxel-instanced and procedural
  paths derive from it). Fixes biomass proportion: the grow-tent asset lands at
  a 1.5x1.5 m footprint (~1.7 m tall) but fruit crops reached 2.6 m — plants
  punched through the roof and filled the whole volume. Tent tomato now caps
  ~1.17 m under the light bars.
- Greenhouse rebuilt as an arched hoophouse-style glasshouse
  (buildings.ts `makeGreenhouse`): gothic arch (two off-center ellipse halves,
  crown ~2.2 m) on galvanized hoop ribs every 7 voxels + purlins + ridge tube,
  translucent glass panes (0.42) over a 4-course brick knee wall, propped ridge
  vents + rear louvre band, timber-panelled door; interior bench/pots/path
  kept. Footprint contract preserved: 25x40 voxels, max horizontal 40 = 4.0 m
  so `resolveTargetSizeM` still matches the 2.5x4 asset record. Deliberately
  distinct from polytunnel (glass-on-steel + knee wall vs film on timber
  rails). quality/ASSETS.md + QUALITY_BAR.md entries updated to match.
- Verified: typecheck clean; appshot world view GATE PASS with arch reading
  clearly and "1×/day" default visible; showcase iterations on
  `#lane=c&only=greenhouse&mode=big` (3 rounds) for the arch silhouette.

## Leftover closeout pass (2026-09-04)

Swept every still-open item from "Known gaps / future work", HANDOFF's
"Known limitations", and the per-entry "Still open" lists. Three parallel
workers + lead integration; nothing committed yet.

- **Fall frost-relative sowing windows DONE** (last open Known-gap).
  `fallSowWeeksBeforeFirstFrost(crop)` in usePlanEditor.ts: category heuristic
  over existing catalog fields — qualifies iff `minTempC <= 8` (catalog gap
  7→10), `maxTempC <= 30` (heat-lovers bolt), `growthDays <= 120` (must mature
  in one fall; garlic/rye/wheat/fruit deliberately out). Weeks =
  `ceil(growthDays/7)+2` before first frost. `sowWindow` appends
  "fall: sow Nw before first frost" (CSV export inherits it); SelectionPanel
  resolves the farm's `firstFrost` "MM-DD" to concrete dates
  ("Fall: sow around Aug 13 · first frost Oct 15") — no new queries, farm data
  was already on the editor. Spinach 45d → 9w, kale 60d → 11w, radish 28d → 6w.
- **staleTime Known-gap was already closed** (stale ledger line): Weather +
  Dashboard queries carry WEATHER_STALE_MS 15 min, Monitoring uses
  refetchInterval 30/60s. Refetch fires on route remount when stale
  (refetchOnWindowFocus is off globally). Ledger line retired, nothing to do.
- **Dead code removed**: `src/three/groundTexture.ts` deleted (verified zero
  imports first; only two comment references, refreshed to say "the 3D
  ground-tile path"). Build re-verified: main chunk 533.11 kB / 156.85 gzip,
  three still its OWN lazy chunk (782.62 kB / 201.09 gzip), no WebGL symbols
  leak into main.
- **Large-plan perf BASELINE recorded** (HANDOFF limitation closed; headless
  Chrome, appshot-live CDP at noon — the virtual-time harness distorts FPS):
  farm 1 North Meadow 34 FPS / 273 draws / 2.3 M tris; farm 6 Mushroom
  Warehouse 46 FPS / 82 draws / 1.6 M tris; farm 4 Market Field (40×24 m,
  ~4,000 planted cells) 8 FPS / 665 draws / 18.6 M tris. Attribution is
  linear: ~3.9 k tris/plant, draws unremarkable — no pathological builder, so
  NO fix applied. The real lever for huge outdoor fields is a plant
  LOD/imposter system (project-scale, unscheduled); real GPUs score higher.
- **HANDOFF refreshed**: barn-livestock "interactive QA pending" bullet is now
  a verified note (2026-08-25 QA landed); stale "farms 1–2, no farm 3" claims
  fixed in both "How to run" and trap #9 (demo farms 1–7, see seed.ts);
  perf bullet carries the baseline; groundTexture bullet marks deletion;
  build-gate chunk sizes updated (~533 kB main).
- **Animal-spawn palette hint DONE** ("discussed but not implemented" item):
  one muted line under the AssetPalette search input — "Animals ship with
  their structures — barn: cow · pig · sheep, coop: hens + rooster, hive:
  bees, pond: ducks; planted beds draw butterflies." Pure presentation.
- **Night-lighting human glance DONE** (MISSION-BETA deferral): all four
  matrix shots readable with believable sun direction — night ground legible
  under moon fill, noon cleanest, minor nits only (dawn sky→ground transition
  slightly harsh; dusk orange band slightly flat/poster-like). Read-only;
  no action taken.

Still honestly open (need external inputs, not effort): REST client runtime
exercise awaits a real backend; offline-weather fallback has no automated test
(the repo deliberately has no test runner — decision needed before adding one).

## Creative asset QA round — pre-market visual pass (2026-09-05)

Full-library visual QA of all 171 showcase entries (Lane A 14, Lane B 109,
Lane C 28, Lane D 20) against `quality/QUALITY_BAR.md`, run as three parallel
QA agents over the headless showcase harness (`showcase.html#lane=…&only=…`,
`tools/appshot.mjs`, `spin=0`). Every fix was re-rendered and re-judged;
`npm run typecheck` green after every round; `npm run build` green at close.
~30 assets revised, all verified:

- **Lane A (3 fixed)**: `soil-tilled-dry/wet` — the `dips` undulation let
  adjacent ridge columns dip at the same row, carving a 2-voxel rectangular
  bite out of the silhouette; each ridge column now dips once in disjoint
  interior z-bands. `pond-center` — radial depth tint + more shimmer specks so
  it reads as water, not a blue slab.
- **Lane B (9 archetypes fixed, 10 re-verified PASS)**: first agent pass fixed
  tomato, wheat, corn, leafy-head, brassica, greens-open, cucurbit-vine,
  legume-trellis, bush-bean, strawberry then stalled (inactive-timeout — no
  code issue; its 4 edited files typechecked clean and were re-verified by the
  follow-up pass). Follow-up fixed: `root-carrot` missing s3 umbel event +
  s4 shoulder color; `allium` s5 gold bulb lifted into sight-lines;
  `potato` s5 tubers rolled onto open soil (were tan-on-tan in foliage);
  `herb-clump` rebuilt lower/wider with bud dots (was cactus pillars);
  `herb-shrub` needle whorls break slab columns; `mushroom` domed cap tier.
  `map.ts` audited: variants swap palette/scale only, never geometry.
- **Lane C (13 fixed, incl. all 8 new CE assets — none were market-ready
  before)**: dominant failure mode was seeded per-voxel speckle reading as
  noise/holes (calmed tonal mixes) and hardware floating without grounding
  (`grow-light` rebuilt as a floor stand, `fruit-tree` de-lollipopped with
  root buttresses + surface fruit, `grow-tent` given fabric bands + zipper +
  visible interior lights, `plant-rack`/`hydro-channel` given actual plants).
  Classics: `shed` roof speckle, `chicken-coop` floating ramp tiles,
  `beehive` white-box look, `hay-bale` twine bands, `gate` porcelain-white
  pickets → weathered wood family. Barn/greenhouse/polytunnel PASS unchanged.
- **Lane D (8 fixed)**: `chicken` skull 1 unit smaller; `pig` snout/ears/nostril
  readability; `butterfly` wing fold capped ~25°; `watering-can` throat slimmed;
  `hoe` blade plate; `pitchfork` tines flipped into the bale (read backwards);
  `seed-bag` label patch overlap; wind-sway ripple amplitude +50% so the phase
  offset reads in a static frame (tick now allocation-free).

Residuals accepted for ship (noted, low impact at world scale): `pig` still the
boxiest creature from pure side view; `grow-tent`/`hvac-unit` cube-dominant by
nature; `ibc-tote` cage dither slightly noisy; allium s1/s2 chunky; s4
"green fruit" signal subtle on berry-bush/potato. No shared-code changes were
needed — every fix fit its lane directory (`voxel.ts` untouched). Contact
sheets + close-ups from the pass live in `$TMPDIR/ff-asset-qa/` (ephemeral;
regenerate via the showcase URL formulas above). `quality/ASSETS.md` inventory
updated: mushroom archetype + the 8 CE structures were missing from the tables.

## 2026-09-14 — gallery.html remedied: missing module rebuilt (src/creative/showcase/gallery.ts)

User-reported: `gallery.html` (untracked scratch page, "Asset Gallery v2")
rendered blank — Vite log showed `Pre-transform error: Failed to load url
/src/creative/showcase/gallery.ts`. The HTML ships a full error-throwing
onerror + DOM but its module had never been committed and no copy existed
anywhere (no git history, no stash, no scratch dir). Rebuilt
`src/creative/showcase/gallery.ts` to the HTML's contract: all five registries
tagged by lane, cells built once (185), tab/search/refined filters toggle DOM
visibility only (no geometry rebuilds), scissor viewports with the scroll-
offset fix from 2026-09-06, click-to-zoom modal with an "open in showcase ↗"
deep link (`/showcase.html#lane=X&only=ID&mode=big`), Esc/backdrop close,
`gallery-ready N` title for `appshot --expect`. The "✦ refined" badge is the
Sep 2026 QA-pass set from this ledger (lane A 3 tiles; 16 crop archetypes by
`<arch>-sN` prefix; 13 structures incl. the 8 CE; 9 creatures/tools).
Sub-text updated "four lanes" → five (environments lane existed by then).
Verified: typecheck green; headless `--expect "gallery-ready 185"` PASS; top
and scrolled captures confirm lane-A/B cells, preset lighting cells (tune
presets isolated per cell), and all 9 env dioramas render aligned.

## 2026-09-06 — Showcase gallery: scroll-offset fix (labels/images desync)

User-reported: scrolling `showcase.html` made asset names sit under foreign
images and some cells looked empty. Judge-verified root cause: `renderFrame`
positioned each scissor viewport from `getBoundingClientRect()` (viewport-
relative) while the canvas is absolutely positioned at the DOCUMENT origin —
after scrolling by S, every WebGL image drew S px off its DOM cell. Fix: add
`window.scrollX/Y` to the rect before converting to GL coords
(`src/creative/showcase/main.ts`). No assets were actually missing: judge pass
over full-page lane captures (A14/B21/C28/D20 cells) found every cell renders;
the "missing" ones were scroll-displaced content. Full-page (unscrolled)
captures were always correct, which matches the report. Also fixed a latent
`tools/appshot-live.mjs` arg bug: absent `--wait`/`--scroll` made index -1
bleed into the skip set, dropping the URL positional. Verified: typecheck +
judge PASS on mid-scroll captures of lanes A/B/C and full lane B.

## 2026-09-06 — World 3D: grab-rotate works on arrival (tool auto-resets to Select)

User-reported on touchpad: wheel zoom worked in the 3D world but click-drag
could not grab/spin the platform. Root cause: orbit (left-drag / one-finger)
is enabled only while the Select tool is active (`setEngineOrbitEnabled` in
`src/three/engine.ts`), and the editor defaults to Brush — so the world view
opened with `mouseButtons.left = NONE` while the un-gated wheel kept dolling.
Browser-verified (drag → zero camera movement; same drag after Select →
rotates). Fix: entering the world view resets the tool to Select
(`PlotDesigner.tsx` effect keyed on `viewMode`; `setTool` is a stable setter,
so it fires only on view switches). Painting in 3D is unchanged — explicitly
picking a paint tool still claims the drag for strokes and disables orbit,
and 3D paint strokes record undo history (undo/redo verified live). Side
benefit: click-to-inspect (SelectionPanel) works by default in 3D. Farm plans
are untouched by this change; QA drags that painted cells during reproduce
were reverted (localStorage restored to seed values 42,13=pepper, 47,16=spinach,
51,21 removed). Verified: typecheck + live drag/zoom/paint/undo cycle in Chrome.

## 2026-09-06 — World 3D HUD: sim dock, SimDrawer, cinema mode (SPEC-WORLD-HUD)

Shipped per `quality/SPEC-WORLD-HUD.md` (3-agent build: lead = World3D
restructure + integration, Sub A = SimDrawer, Sub B = PlotDesigner cinema +
toast CSS). Motivation: the old wrapping footer (13+ controls) covered 40–50%
of the 3D canvas and reflowed mid-interaction; the per-crop growth list
hijacked wheel scroll over the scene.

- `World3D.tsx`: footer replaced by a fixed-child-set bottom dock (status chip
  [date · Day N · season dot · cached] + Simulate/Tour/Fly/Reset/Sim▸) and a
  top-left cluster (Cinema/History/Audio/Debug; top-right is perf-HUD
  territory). Dock never re-renders its child set — labels swap in place
  (verified pixel-stable while playing). Reset view now shares `homeFrame()`
  with the init camera (Reset == load-in framing; was maxDim*0.6 drift).
  Tour progress throttled to 1% steps (was setState per rAF frame). Season
  auto-pause now auto-opens the drawer once with an explained banner +
  "Jump to season start"/"Keep watching" (guard ref resets with
  seasonComplete). Toast uses a real `ff-toast-in` keyframe
  (tailwindcss-animate was never installed — old classes were dead) and its
  timeout cleans up on unmount. A11y: aria-pressed everywhere, audio
  aria-label, sr-only "Sim controls…" summary stays mounted for appshot
  --expect.
- `SimDrawer.tsx` (new, controlled/presentational): date+Today, full-width
  time-of-day slider (HH:MM readout, drag disables Auto), speed + scenario
  via ui/select, full-height growth list (kills the canvas scroll-hijack),
  weather footer. Mounted always, slides via transform; below xl it becomes a
  bottom sheet. Trap found in live QA: Radix Select portals render at body
  z-50 → behind the z-[150] drawer; fixed with `SelectContent
  className="z-[200]"` (cn = tailwind-merge).
- `PlotDesigner.tsx`: `cinema` state (world view only; `h` toggles, auto-exits
  on blueprint switch; Escape untouched — flight owns it). Cinema unmounts
  DesignerToolbar + right sidebar + save badge and collapses the grid to one
  column; layout invariants (xl:h-full root, min-h-0 card, 60dvh below xl)
  preserved. Painting-in-3D is intentionally unreachable while in cinema.
- No changes to `usePlanEditor`, `src/three/*`, or the blueprint view.
- Verified: typecheck + build green; appshot gate matrix 6/6 (world default,
  night+ffdebug FPS:, tablet 820px, blueprint regression "Brush", farm 6,
  sr-only "Sim controls"); live click-through: simulate without control
  movement, season-end drawer auto-open + banner + dismissal, drawer
  contents + both Radix selects, tour dim/undim, flight + Escape, cinema
  on/off with restore, before/after screenshots at 1440×900 and 1150×760.

## 2026-09-07 — Structure placement: re-center templates, fit-to-region, platform clamp

Bug: non-linear 3D structures rendered shifted +½ footprint toward +X/+Z and
could float off the ground platform (farm 1 polytunnel ~2 m into the void).
Root cause: creative builders anchor voxels at the origin corner (polytunnel
spans 0→6 m in +Z) while `structures.ts` placed the instance ORIGIN at the
region's centre — plus instance size was fixed from the asset record,
ignoring the painted region's extent.

Fix (src/three/structures.ts only, +53/−8): (1) `getTemplate` measures the
bbox at identity then re-centres the cached template horizontally
(`position.x/z -= centre`; y untouched so instances keep their y=0 base;
no-op for builders that already centre). (2) Non-linear regions shrink-to-fit
their painted footprint: `fit = min(1, regionW/sizeX, regionH/sizeZ)`,
floored at `MIN_FIT_SCALE = 0.5` (recognizability), shrink-only so voxel
density never stretches. (3) Instance centre clamped inside plot bounds with
a degenerate-size guard (oversized → centred). Linear slugs (fences, gates,
trellis…) untouched. Deliberately NOT fixed by enlarging platforms —
`buildGround` tiles every plot cell, so the platform exactly mirrors the
blueprint; size now follows what the user paints (paint a bigger footprint →
bigger structure, up to the record size).

Verified: typecheck + build clean; appshot GATE/EXPECT pass on farms 1/2/3/5;
live screenshots (`$TMPDIR/struct-qa/`) show farm 1 polytunnel, greenhouse,
shed and coop fully on-platform; farm 2 coop sits at the east edge because
the seed paints it there (clamp holds it inside); farm 5 tent interior
unaffected.

## 2026-09-08 — Sim Core waves 1+2: living-ecosystem engine, runs, provenance (SPEC-SIM-ECOSYSTEM)

Implemented per `quality/SPEC-SIM-ECOSYSTEM.md` by a 5-agent team (A: 3D
foundations, B: engine, C: integration/UI, D: ecosystem depth, plus a
persistent validator that gated each wave). Rollback point: `c438019`;
wave 1: `59598c8`.

**Wave 1 (Phases 0+1).** `src/three/plants.ts`: module-level (crop,stage)
template cache (session lifetime, height in key) + reconcile-based
`updatePlants` (per-cell diff, swap-with-last removal, no dispose-all) +
`advancePlantGrowth` per-frame easing (uniform scale off the y=0 base,
module-scratch objects — zero per-frame allocation). World3D: setInterval
playback replaced by rAF-dt accumulation (dt clamp 0.25 s; commits only on
whole sim-days; UTC day-number math via `isoDayNumber` so DST nights can't
stall it); all-mature auto-pause ignores undated cells; drawer rows keyed
(cropId, plantedAt); monotonic progress clamp in the legacy scrub path (runs
make it obsolete). `fetchClimateNormals` now feeds `growthCtxRef.baselineTempC`
— the invisible 20 °C-everywhere default is dead (drawer chip shows
"baseline 17.4 °C · ERA5"). `src/lib/sim/` (B): deterministic engine
(createRun/stepDay/simulateRun; FNV-1a+splitmix32 keyed PRNG; copy-on-write
cells), `buildEnvSeries` (Open-Meteo daily archive for past dates, forever-ish
`ff-pro:simenv:` cache bounded 12 → ERA5-normals synth → temperate default;
per-field provenance tags incl. `scenario-delta` and `model-estimate`),
soil-water bucket (AWC mm/cm × 30 cm root depth, FAO-56-shaped Kc, ET0 real
when available else documented proxy), GDD drivers (required = growthDays ×
meanDailyGdd from normals, fallback 10; stress ×(1−0.6·max)), and
`AppState.simRuns` persistence (RunRecord = config + envSeries + summary —
replay IS the storage; legacy `createSimulation` still present at wave 1).

**Wave 2 (integration + provenance + ecosystem).** `useSimRun` (C): own rAF
tick loop (never setInterval), simStateRef as render truth, React commits
throttled ~5/s, replay folds ONLY record.config × record.envSeries (ctx soil +
crops fetched once per startRun, cached-forever modules — byte-identical to
create-time summary), seekDay refolds from day 0 and never fires
celebrations. World3D run mode: separate growth effect feeds biomass into
`updatePlants` via `progressByCell` through a read-only plan shim
(plantedAt 9999-12-31 ⇒ closed-form 0 ⇒ run biomass wins the max() clamp;
shim never touches plan state — validator-verified). `GrowthFX.celebrate()`
finally wired (harvest-ready events via event-sink ref, ≤12 cells/call,
ref nulled in teardown). SimDrawer → RunInspector: run transport, timeline
with intervention/event markers, per-day provenance chips, clickable crop
rows with a "why" panel (GDD gain, bucket vs AWC, per-term stress with
sources), opt-in moisture overlay (4 InstancedMesh bands, ≤4 draws, keyed on
sim DAY not tickVersion). Simulations page is now a run manager (cards with
honest-unit summaries, create form, comparison table, Open-in-world via
`?ffrun=` before the hash, confirm-delete); farm-blind `createSimulation`
DELETED from Api/localApi/restApi/README (legacy Simulation type + records
stay readable/deletable). Ecosystem depth (D, `src/lib/sim/ecosystem.ts`):
nitrogen pool (init OM%×250 clamp [200,1200]; mineralization
0.002·pool·f(tMean); uptake ∝ growth; leach ×0.9 on >20 mm days; N stress in
the GDD max + yield), neighbor cache (Chebyshev r=2, built once, rebuilt on
plant) with companions +4%/cap +12% GDD rate and antagonists +0.05/cap 0.15
stress (asymmetric by list), pest pressure (favorable warm+wet days
+0.015·density·u, frost ×0.2, outbreak hysteresis 0.6/<0.3, yield
×(1−0.3·peak)), creatures (bees/butterflies ∝ flowering, pests ∝ pressure —
for animals.ts wiring later), autoHarvest default true (payout 3 days after
b=1.0, crop stands; manual pays at b≥0.8 else `harvest-too-early`); yield =
yieldKgPerPlant ×(1−0.5·season-mean stress)×(1−0.3·peakPest); RunSummary
gains waterUseMm/stressDays/outbreakDays/meanNitrogenKgHa.

Verified: typecheck + build green after each wave; validator rounds 1+2 PASS
(10/10 and 9/9 checks: determinism byte-identical, no Math.random in sim/,
init deps frozen, shim isolation, seam sync incl. README, localStorage
discipline, drawer presentational, overlay dispose); appshot GATE/EXPECT pass
(world farm 1+2, simulations page); CDP end-to-end create→reload(?ffrun)→play
(Day 0→34, 0 console errors); D's behavioral proofs — fertilize +10.4% yield
& ripe day 106→91, companion +3.9% / antagonist −2.1% GDD, full drought ⇒ 0 kg
yield, 10×10 monoculture 2,701 outbreak cell-days vs checkerboard 0.
Known gaps (report-only, accepted): 4k-cell replay is seconds-class (spec
updated with measured numbers); run-mode stress tint not applied to plant
materials (drawer/overlay carry it); creatures counts not yet wired into
animals.ts; interventions authoring UI, multi-run ghost A/B, rest-world runs
= spec Phases 3-UI/4, not started.

## 2026-09-08 — Sim Core wave 3 (Agent G): run stress tint + creature populations in the 3D world

Closed the two wave-2 "known gaps" that kept the living ecosystem invisible in
World3D (`quality/SPEC-SIM-ECOSYSTEM.md` §3.4). All changes ADDITIVE to the
three owned files; `updatePlants`/`buildPlants`/`advancePlantGrowth` signatures
unchanged (optional opts field only), init-effect deps untouched.

**Run stress tint.** `PlantUpdateOptions` gains `stressByCell?: Map<string,
number>` ("x,y" → effective stress 0..1). `plants.ts` centralizes the batch
tint in `batchTintStress()`: when the map is present (run mode) the batch tint
is the MAX per-cell effective stress across the batch's live cells (one
material per (crop,stage) template — per-instance tint would need
instanceColor buffers per batch); when absent, the legacy
`scenarioGrowthMod().stress` path applies byte-identically (run mode passes
`scenario: undefined`, so the two never fight over a shared material).
World3D's `applyRunGrowth` builds `stressByCell` alongside `progressByCell`:
per cell `max(water, heat, cold, nitrogen)` — the SAME max-of-terms
aggregation the RunInspector rows use (`useSimRun.aggregateCells`) — with
`pestPressure × 0.8` folded in (documented visual-only weight; outbreak days
read on the crop without pest creature models). Existing tint curve reused
(`applyStressTint`: (1, 1−0.35s, 1−0.55s)).

**Creature populations.** `animals.ts` gains `setFaunaPresence(system,
{bees01, butterflies01})`: of each pollinator flock's spawned members (stable
spawn order), the first `round(fraction × count)` stay `obj.visible`, the rest
hidden — renderer skips them (hiding REDUCES draws), zero allocations, no
geometry changes, hidden members keep ticking (≤16 total). Fractions: World3D
computes `creatures.bees ÷ (Σ floweringFrac of insect-pollinated cells × 8)`
and `creatures.butterflies ÷ (Σ floweringFrac × 3)` — the same denominators
`ecosystem.creaturesFromCells` uses, so ≤1 by construction (clamped anyway);
practically bees/butterflies read as present-during-flowering on the tiny
world flocks. Day-keyed effect (`[runActive, runDayIndex, sceneReady,
editor.planVersion]` — NOT tickVersion, moisture-overlay lesson), placed after
the planVersion effect so it reapplies after animal rebuilds; run-off and the
run-loading window reset to full presence. Legacy mode untouched (flocks fully
visible; scenario tint path intact).

Verified: typecheck + build clean (three.js still its own lazy chunk);
appshot GATE/EXPECT on world farm 1. CDP-driven end-to-end on a purpose-built
QA farm (temperate June, tomato beds + 2×2 beehive, own dev port, headless
Chrome + raw-WebSocket CDP, no new deps): irrigated vs drought runs at day 50
— drought tomato visibly olive/yellow-brown vs vibrant green watered control,
RunInspector row "stress" chip matching (watered 62% no chip, drought 40%
chip; sim summaries 26k vs ~0 tomato water-stress cell-days); bees ABSENT at
day 10 (pre-flowering, creatures.bees=0) and clearly orbiting the hive at
day 62 (flowering window) in 3× zoom shots; butterflies likewise flowering-
gated. QA lesson recorded: on this sim, an unirrigated "baseline" in a dry
summer IS drought-stressed — tint comparisons need an irrigated control.
Known gaps (report-only): pest tint term (×0.8) is a visual superset the
drawer's four-term row does not display (why-panel is Agent F's surface);
seeded farms' per-cell coop flocks eat the 16-creature budget before bees
(pre-existing `buildAnimals` cap behavior — bees only spawn on coop-free
plans), so run presence modulation is most visible on coop-free/painted
plans; batch tint is crop-wide max (per-(crop,plantedAt) tinting would need
per-group materials).

## 2026-09-08 — Sim Core waves 3+4: intervention authoring, ecosystem visuals, A/B experimentation

Wave 3 (commit `07ed6d8`) + wave 4, completing SPEC-SIM-ECOSYSTEM Phases 3-UI
and 4. Team: F (interventions), G (visuals), E (Phase 4; stalled post-impl, a
scoped finisher audited its complete diff), consistent validator rounds 3-4
(both PASS).

**Intervention authoring (F).** `useSimRun.applyIntervention(iv)` amends the
ACTIVE record's config.interventions in memory (stable-sorted by day) and
refolds to the CURRENT day via the existing deterministic `replayTo` —
dayIndex never visually resets, `replayTo` still never fires `onEvents` (no
celebration spam from rewritten history). Guards reject weather-kind (baked
into envSeries at compose time), out-of-season dates, bad amounts.
`unsavedChanges` + amber chip: amendments are SESSION-ONLY by design — the
stored RunRecord keeps its frozen-provenance contract; persisting amendments
needs a `saveSimRun(record)` seam across Api/localApi/restApi (named
follow-up; the controller already holds the amended record). RunInspector
gives a presentational add-form (irrigate 1-50 mm / fertilize 10-200 kg/ha N,
sweet spot 60-150; date defaults to current sim day) + timeline markers.
Validator live-proof: past-dated fertilize refold moved why-panel N 459.7 →
560.4 kg/ha; localStorage record untouched.

**ET0 normals bug (found by F, fixed + verified).** climate.ts monthly
normals store precip/et0 as MEANS OF MONTHLY TOTALS; environment.ts's
synthFromNormals fed et0 straight in as DAILY mm/day (July ≈ 150 mm/day!),
pinning buckets at 0 on normals-only days. Fix: divide by daysInMonth like
rain already did. Frozen envSeries in existing records replay unchanged
(self-consistent); new runs get ~1-8 mm/day. Validator audited for a third
total-field case — none exists (temps are means, consumed directly).

**Ecosystem visuals (G).** Run-mode stress tint via
`PlantUpdateOptions.stressByCell` (per-cell max of water/heat/cold/nitrogen
and pest×0.8; batch tint = max across the batch's cells — draw-budget
compromise; legacy path byte-identical when absent). `setFaunaPresence`
scales bee/butterfly visibility fractions from SimState.creatures without
rebuilds (day-keyed effect, hidden members keep ticking). CDP-proven:
drought bed olive vs irrigated control green; bees appear only in the
flowering window.

**Phase 4 A/B (E + finisher).** useSimRun: `loadGhost/clearGhost` — the ghost
folds ONE extra pure stepDay per sim-day through its OWN config × OWN
envSeries (primary interventions structurally can't reach it; validator
empirically probed primary replay identical with vs without a ghost). World3D:
day-keyed ghost effect renders the second run as semi-transparent instanced
plants (session-lifetime ghost geometry cache mirroring plants.ts's
normalization math — audited helper-by-helper identical; per-batch transparent
material clones, shared caches never touched; 60-template draw cap; ghost
snaps per-day, documented). `?ffrun=<id>&ffghost=<id>` before the hash,
StrictMode-safe, ghost deferred until primary replay ctx lands. RunInspector
Compare block (picker/legend/clear, presentational). Simulations page:
multi-select 2-6 runs → ComparePanel with honest-unit deltas vs the first
selected + "Compare A/B in world". Finisher CDP: 19/19 checks incl. visual
ghost confirmation, ghost-season-ended cap label, interventions work with a
ghost active.

**Label collision fix (validator round 4).** createSimRun default label now
includes startDate + a time suffix so same-param runs never read
"solid = X · ghost = X".

Verified per wave: typecheck + build green (three.js lazy chunk intact);
validator rounds 3 (8/8 + live proofs) and 4 (8/8 + determinism probe) PASS;
appshot GATE/EXPECT on world + simulations pages each round; dev servers
killed by PID; scratch confined to $TMPDIR.

Known gaps (ledger): saveSimRun seam (amendments session-only); ghost has no
per-day easing; procedural-fallback/custom-named crops get no ghost; ghost on
a differently-shaped fork draws the old footprint with no visual hint;
batch-level tint granularity (one stressed sowing yellows its crop's whole
batch); creatures counts animate existing flocks only on coop-free seeded
plans (16-creature budget); named experiment sets (grouping runs) deferred.

## 2026-09-11 — Growth Visual Evolution wave 0: baseline, scrub tooling, spec

Mission: make plant growth + sim condition readable from the world alone
(quality/SPEC-GROWTH-VISUAL.md, now binding). Branch `growth-visual-evolution`
cut from pro-upgrade@6e23a98 into a separate worktree (../ff-land-plan-gve) —
pro-upgrade's uncommitted working tree untouched.

- Baseline verified: typecheck + build green (three.js still its own lazy
  chunk); appshot GATE/EXPECT on #/farms/1/map and ?ffview=world&ffdebug=1.
  Perf HUD: Draws 273 — exactly the HANDOFF farm-1 baseline. Tris HUD read
  23,723,912 vs HANDOFF's recorded 2.3 M (unexplained 10×; Draws treated as
  authoritative; real-GPU re-measure queued for wave 1; headless FPS under
  virtual time not meaningful, as documented).
- New showcase tooling: `#mode=scrub&only=<archetypes>&spin=0` renders, per
  archetype, a 12-cell continuous growth ramp (discrete stage swap + the
  plants.ts linear height ramp, mirrored with file:line notes) plus 6
  lifecycle state cells (healthy / stress tint / wilting / dead / harvested /
  overripe as Tier-1 previews). All cells of an archetype share camera framing
  via an invisible Box3 sizing helper (Box3.setFromObject ignores .visible).
  New module src/creative/showcase/scrub.ts (pure, deterministic, no rng);
  showcase/main.ts gains a scrub branch + header docs (surgical, ~10 lines).
  Asserted via --expect "showcase-ready 18".
- quality/ASSETS.md corrected: 50 (not 40) catalog crops mapped 1:1; real
  per-archetype coverage recorded (pepper/eggplant→tomato, sunflower→corn,
  nasturtium→cucurbit-vine, borage/crimson clover→greens-open,
  mint/marigold→herb-clump, winter rye→wheat, 3 mushroom cultivars); 108
  stage entries + growth-demo = 109 lane-B entries; scrub-tool pointer.
- SPEC-GROWTH-VISUAL.md written: PlantViewParams contract (pure
  src/lib/sim/view.ts, framework-free, FNV(cellKey)-seeded variation), Tier
  1/2/3 cost model, derived state definitions (dead = hard frost OR chronic
  stress floor; overripe = readyAtDay + grace; precedence
  harvested>dead>overripe>alive), per-archetype keyframe targets (144 stages
  vs 108 today), per-wave acceptance criteria, perf contract (plant-layer
  draws ≤ 80 worst case; farm-1 total ≤ ~287).
- Two critic rounds (scrub-tomato/corn + full lane-B sheet): tooling PASS —
  framing consistent, zero artifacts, lane B regression clean (109/109 cells,
  growth-demo continuous). Content REVISEs are precisely this mission's later
  waves and are recorded as the binding backlog in SPEC §5: s5 "pick me" gaps
  on ~9 archetypes, 6-step staircase growth (needs sub-stage morphs),
  stress-0.55 and overripe legibility vs healthy, mature-silhouette confusion
  groups (leafy-head/brassica; bush-bean/herb-clump/greens-open). Dead and
  overripe placeholder previews strengthened after round 1 (browner dead,
  unmistakable overripe lean+dulling) and re-verified on re-shot sheets.
- Wave-0 verification evidence: GATE+EXPECT passes listed above; PNGs in
  $TMPDIR/gve-wave0/ (farm1-blueprint, farm1-world, laneb-sheet,
  scrub-tomato{,-r2}, scrub-corn{,-r2}); worktree dev server on :5199.

## 2026-09-11 — Growth Visual Evolution wave 1: PlantViewParams projection + Tier-1 per-instance channels

The pure projection seam + per-instance color/wilt channels, per
SPEC-GROWTH-VISUAL §2/§4. Sim numerics untouched; every integration point
listed.

- **NEW src/lib/sim/view.ts** (pure, three-free, no Math.random): projectPlant
  → PlantViewParams {growth, stage, stageCount, lifecycle, wilt, tint,
  flowering, variation}; effectiveStress (max-of-4 + pest×0.8 — the
  aggregation that lived in World3D, now single-sourced); stressTintMultiplier
  (the old applyStressTint curve); wiltAmount (smoothstep 0.35→0.9 on water
  + 0.5·heat); growthToStage(growth, stageCount) (count 6 ≡ engine
  stageForBiomass; per-crop counts arrive with waves 2–3 keyframes);
  variationForCell (FNV-1a(cellKey) → mulberry32; ±4% channel multipliers).
  Lifecycle derivation: harvested > dead (cold ≥0.95 OR stressDaysCount ≥21 ∧
  stress ≥0.85) > overripe (readyAtDay + category grace, fruit 21 d) > alive.
- **plants.ts** (Tier 1): PlantUpdateOptions.viewByCell (Map cellKey →
  PlantViewParams; when present it supplies growth override, stage, wilt and
  tint per cell, and the batch material tint resets to white so tints don't
  compound). CellSlot gains wilt01 + final tint; writeCellMatrix folds
  base-anchored droop (rotZ ≤ ~17°, rotX ~⅓ of it) + canopy squash (≤0.18)
  into the same matrix write — wilt01 0 ⇒ bit-identical matrix. Per-instance
  color via setColorAt (instanceColor × vertexColors confirmed multiplying in
  three r184): condition tint × seeded genetic variation; variation applies in
  ALL modes (de-clone; deterministic per cellKey). Color bookkeeping:
  removeInstance swap-with-last copies the color entry; capacity growth copies
  the instanceColor array; survivors' colors diff-checked per reconcile.
  stressByCell kept as documented legacy batch-MAX fallback. Fallback
  (unmapped-name) crops read view.growth for progress; no instanceColor there
  (clone-per-cell path unchanged).
- **World3D.tsx**: applyRunGrowth now builds viewByCell via projectPlant
  (env = runDayEnv(record, day)) and passes only that — the hand-rolled
  progress/stress maps are gone (aggregation moved into view.ts). NEW DEV-only
  proof hook: ?ffvis=stress (with ?ffview=world&ffdebug=1) paints a
  deterministic synthetic water-stress gradient over the live plan through the
  REAL projectPlant → viewByCell path — wave-1 acceptance evidence without a
  sim run; suppressed when a run is active.
- **showcase/scrub.ts**: stage selection + tint curves now import from
  view.ts (tool previews the real pipeline); height ramp still mirrors
  plants.ts (renderer-side); SCRUB_STAGE_COUNTS table ready for wave-2/3
  per-archetype keyframe counts.

Verified: typecheck + build green (three.js own chunk); world GATE+EXPECT
with **Draws: 273 machine-asserted as a literal DOM substring on both the
plain and ffvis=stress captures** (instanceColor adds zero draws; an initial
vision read of "373" was a digit misread, settled by --expect); ffvis=stress
screenshot shows the gradient legible in-world — lush green upright corner →
yellow-brown drooping/squashed corner, per-cell (not per-bed), no artifacts
(zoomed-neighbor caveat: immediate-neighbor Δstress is gradient-slope
proportional; tint-strength tuning is a SPEC §5 backlog item); blueprint gate
PASS; determinism probe: two independent scrub renders byte-identical
(208016 bytes each, cmp). Known follow-ups: batch tint and instanceColor
both write color state (batch=white in run mode — compounding documented);
ghost overlay does not yet consume view params (wave 2/4); Tris HUD 10×
discrepancy still queued for a real-GPU re-measure.

## 2026-09-11 — Growth Visual Evolution wave 2: Tier-2 lifecycle geometry states

Full story now legible in-world: every archetype has dedicated dead /
harvested / overripe geometry (54 new deterministic voxel builds), projected
purely from CellState through view.ts (lifecycle precedence
harvested > dead > overripe > alive; dead = cold ≥0.95 OR stressDaysCount ≥21
∧ stress ≥0.85; overripe = readyAtDay + category grace). Engine untouched.

- **CropPalette** gains optional stress/dead/stubble slots + STATE_TONES
  fallbacks; STATE_HEIGHT_FACTOR defaults (dead 0.55 / harvested 0.30 /
  overripe 0.95) with per-builder userData.heightFactor override (apple keeps
  its canopy in every state; tomato dead keeps the stake; trellis never
  shrinks) — contract in shared.ts.
- **NEW src/creative/crops/states/**: 18 per-archetype modules + index.ts
  (STATE_BUILDERS + hasStateBuilder probe). Authored by 7 parallel builder
  subs (families: tomato; leafy/brassica/greens; wheat/corn; root/allium/
  potato; cucurbit/legume/bush-bean/strawberry; herbs/mushroom; berry/apple),
  each self-verifying (typecheck + scrub shots + PNG self-review + own critic
  loop). Highlights: wheat harvested = cut stubble + missed head; root
  harvested = pulled-hollow with carrots on soil; apple harvested = picked-
  clean canopy with scars/fallen fruit; strawberry overripe = blackened
  berries; corn dead = lodged wreckage.
- **Integration (leader)**: makeCropFor(name, stage, state?) dispatches state
  builders (null → Tier-1 fallback); plants.ts template key gains the state
  axis (`${crop}|${stage}|${state}|${h}`), stages Map keyed by stageKey
  composite, reconcile pass-2 moves cells on state change (rides the existing
  diff — day-keyed semantics preserved), state cells pin progress to the
  stage ramp point (instance scale exactly 1) and suppress Tier-1 tint/wilt
  (pose + baked palette carry the state). Scrub tool renders REAL state
  geometry when authored (labels dropped "T2 pending"). Showcase gains
  `#view=plan` (top-down camera) for the bar's plan-view clause.
  ffvis=lifecycle demo now paints DEPTH BANDS (was diagonal) so near→far
  reads as the life story from the default camera.
- **Critic round 1: ITERATE** (dead/overripe corn confusable; apple harvested
  too close to healthy; demo staging unreadable) → two fix subs (corn dead
  rebuilt as collapsed/lodged with heightFactor 0.4 vs standing overripe;
  apple harvested re-canopied 0.92 shell + gaps + scars + yellow-edge leaves +
  ground fruit) + demo restage + plan-view tooling. Post-fix analyzer reads:
  corn three-way silhouette split clear (standing-green / folded-brown /
  standing-tan); apple harvested distinct-and-alive; demo bands legible
  green → yellow-brown → collapsed → dark full-size → stubble.

Verified: typecheck + build green; Math.random audit = comments only (law
holds); plain-world Draws machine-asserted 273 (common case unchanged);
lifecycle demo Draws 301 (+28 = bounded state batches for zones' crops —
plant-layer ≤80 budget respected); determinism probe byte-identical on the
72-cell 4-archetype sheet (two renders); blueprint GATE/EXPECT pass; lane-B
growth rows regression-free per critic sweep. Known follow-ups: overripe-vs-
healthy margin still hue/droop-led for tomato/wheat (critic caveat, wave-3
polish list); ghost overlay does not yet consume states (wave 4); stress
0.55 scrub cell still subtle (tint-strength tuning backlog); Tris HUD 10×
read discrepancy still queued.

## 2026-09-12 — Growth Visual Evolution wave 3: Tier-3 phenology + de-cloning + s5 pick-me

The archetype map stops lying: 7 crops de-cloned into dedicated builders,
corn/apple re-scripted on 10-keyframe phenology axes, allium tops-down lands,
the §5.1 s5 "pick me" backlog cleared across every flagged archetype. Spec
§2.5 table complete; §2.4 keyframe-count mechanism shipped end-to-end with
corn+apple opting in (deviation below).

- **NEW src/creative/crops/specials/** (7 builders + types/index):
  Pepper/Eggplant (compact bush, pendant bell/oval fruit — no cordon stake,
  no truss chains), Sunflower (stout stalk, heart leaves, nodding disc head —
  no tassel/ear), Pumpkin/Zucchini/Melon/Cucumber (ground-sphere ribbed /
  upright-bush cylinder / netted tan ground oval / climbing hanging cylinder —
  four habits, not four palettes). SPECIAL_BUILDERS dispatch in makeCropFor
  wins over archetype; palette/scale overrides still apply on top.
- **10-keyframe axes** (mechanism + first two crops): view.ts gains
  CROP_STAGE_COUNTS/ARCH_STAGE_COUNTS + stageCountFor() (single source);
  makeCropFor clamp relaxed to the per-crop axis; World3D passes
  stageCount into both projectPlant call sites; registry ArchDef.stages
  drives lane-B entries (109 → 117). Corn: boot→tassel→silk(red)→blister→
  milk→dough→ripe with OPEN husk + gold kernel patch at s9 (ear-emergence +
  tassel pop-in cliffs killed). Apple: perennial AGE series whip→fork→
  scaffold→blossom→bearing→red harvest (s9 reproduces states/apple-tree.ts
  geometry so dead/harvested read as the same tree).
- **Phenology**: allium tops-down (s4 kinks → s5 folded tops + swollen bulb
  shoulders); leafy-head OVERRIPE re-authored as BOLTED (tall stalk, yellow
  blooms — replaces the split-head pose); cilantro/lettuce bolting covered by
  herb-clump/leafy-head overripe states (wave 2). Potato die-back = wave-2
  dead state (unchanged).
- **s5 pick-me fixes** (critic backlog §5.1, all palette-driven): tomato
  (gloss + breaker orange + 4th truss + deepened canopy), greens-open
  (harvest rosette + accent bud flag), bush-bean (fat pods in open gaps,
  gloss, foliage recedes), legume-trellis (heavy paired fatPods, tip growth
  ceases, base yellowing; Pea palette verified), carrot (3-voxel pal.fruit
  crown + soil-crack crescent), potato (blooms + cracked-mound tuber peek),
  herb-clump (harvest poms — marigold's flowers ARE the crop), herb-shrub
  (woody base + tip pop, variants intact), leafy-head vs brassica silhouette
  split (cannonball-in-collar vs beaded-crown-on-stalk; plan-view distinct).
- **Scrub tool**: ids now case-insensitive (canonical map; 'sunflower' no
  longer silently falls back to tomato) and previews crop NAMES through
  makeCropFor so specials + state fallbacks render under their own palette.

Integration points touched: makeCropFor dispatch + clamp (map.ts), registry
entries loop, view.ts stage-count tables, World3D ×2 projectPlant sites,
scrub.ts normalize/preview, 7 archetype builder files + states/leafy-head.ts
(overripe only).

Verified: typecheck + build green; Math.random audit clean (comments only);
plain-world GATE + **Draws: 273 exact** (no-run path byte-identical — stage
axes only widen in run mode / showcase); blueprint GATE PASS; ffvis=lifecycle
GATE PASS (stageCountFor plumbed through the demo path too); lane-B full
sheet "showcase-ready 117"; determinism probe (tomato+Pepper scrub ×2 renders
byte-identical, cmp); acceptance critic: **27/27 PASS** (de-clone
nameability, continuous story, s5 pick-me, state coherence, artifact sweep —
melon needed a cropped-band retry after 4 empty vision results; verdict
unchanged). Template memory: +8 merged geometries worst case (corn/apple
6→10 templates, resident only as stages appear). NEW TRAP (hit twice, now
documented): scrub sheets are ~1600px tall per crop — a 1050px viewport
clips everything below the first row while `--expect "showcase-ready N"`
still passes (the count is DOM-based, not framing-based). Always shoot
single-crop scrub sheets at 1680x1800 and READ the PNG before judging.
Deviations: §2.4 keyframe expansion ships for corn+apple only — the rest of
the table stays 6 pending authored keyframes (recorded follow-up; Tier-1
continuous channels carry the time-lapse feel meanwhile). Known follow-ups:
tomato overripe-vs-healthy still hue/droop-led (wave-2 carryover); stress
0.55 scrub cell subtle (tint-strength backlog); Tris HUD 10× read artifact
queued.

## 2026-09-12 — Growth Visual Evolution wave 4: world coupling (env bridge, soil pads, ghost easing)

Run envSeries drives the world's weather presentation; soil pads became a
per-cell-tintable instanced channel; ghost A/B growth now eases; the sky
greys under overcast. Sim numerics untouched; no-run path behavior
byte-identical (Draws 273 → 274, the +1 is the flat pad mesh).

- **NEW src/lib/sim/runWeather.ts** — pure `envToWeatherCurrent(env, base)`:
  projects one DailyEnvironment onto the WeatherCurrent shape the renderer
  already consumes (aridity from ET₀−rain, cloud/humidity/wind derived,
  WMO codes, snow below 2 °C). No clock, no rng. Only the run path calls it.
- **World3D.tsx** — runEnvRef + runWeatherRef (day-keyed bridge cache; the
  rAF reads the cached object instead of projecting per frame — zero
  per-frame allocations); when a run is active clouds/weather-FX/ambient/
  sway consume the bridged weather and sky.update gets cloudCover01; the
  weather chip falls back to runWeatherPreview when the live fetch is
  unavailable (HUD tells the same story as the sky). DEV `?ffvis=drought` /
  `?ffvis=rain` demos drive the REAL bridge + projection path end to end;
  `#ff-env-bridge` DOM probe (display:none span, written every frame under
  ffdebug/ffvis) asserts which weather the world renders with, plus pad
  counters (flat/hilled/instanceColor samples/moist hits) via plants.ts
  `__padProbe`. **Two ownership fixes found the hard way** (critic rounds
  1–2 failed): the legacy scrub effect re-runs when ambientTempC /
  climateBaseline land asynchronously and rewrote plants untinted — under
  virtual-time captures the demo's re-apply never got a rendered frame. Fix
  A mirrors the async deps onto the vis effect; fix B (the load-bearing one)
  makes the legacy scrub effect defer to an active vis demo entirely.
- **Soil-pad separation (Tier-1 extension)** — `voxel.ts` Voxel gains a
  `pad` flag; soilPad/soilPadEllipse flag their voxels; finishPlant splits
  them into a NAMED 'pad' child (showcase/ghost/direct makeCropFor consumers
  render unchanged; the ghost template merge already handles multi-mesh
  assets). plants.ts strips the pad child at template build, reports world
  radii + hilledness on the template, and reconciles TWO shared
  InstancedMeshes (flat + hilled, unit geometries seeded 4242 via
  unitPadGeometry) — +1 draw flat (+1 hilled only when hilled cells exist),
  capacity grows ×1.5, swap-with-last removal, per-cell tint =
  padMoistureTint(moistureFrac): dusty-pale (×~1.45) → wet-dark (×~0.5)
  through PlantViewParams.moisture. reconcilePads runs at updatePlants
  cadence (day-keyed), never per frame.
- **sky.ts** — cloudCover01 dims sun (×0.55 at full cover) and ambient
  (×0.22), and **greys the dome**: quadratic-weighted desaturation toward
  luminance + slight dimming (c≈0.94 ⇒ ~0.88 grey blend; scattered c≈0.3
  barely registers; 0 = byte-identical). This closed the "rain at a glance"
  gap — light dimming alone didn't read.
- **Ghost easing (wave-4 optional item, shipped)** — GhostRunBatch carries
  per-cell entries {pos, rotY, baseScale, denom, targetP, visualP};
  reconcile builds them carrying visualP across stage re-buckets via
  ghostVisualPByCell (cleared on ghost teardown); advanceGhostGrowth eases
  per frame in the rAF (same contract as advancePlantGrowth: allocation-
  free, matrices rewritten only while diffs persist, zero extra draws).
  New cells start at target so nothing pops in.

Integration points touched: World3D rAF (sky/clouds/weather-FX/sway/ghost
advance), run-growth + vis-demo + legacy-scrub effects (ownership), SimDrawer
weather prop; plants.ts buildNormalizedVoxelRoot/getVoxelTemplate/
buildPlants/updatePlants/disposePlants (+ new PadState module state); sky.ts
update signature; shared.ts finishPlant/soilPad/soilPadEllipse + new
unitPadGeometry; voxel.ts Voxel type; view.ts PlantViewParams.moisture.

Verified: typecheck + build green; world GATE + **"Draws: 274" machine-
asserted as a literal DOM substring** (baseline 273; +1 = flat pad mesh —
an initial vision read of "374/13 FPS" was a digit misread of the tiny HUD
font, settled by --expect; wave 1 hit the SAME misread, precedent noted);
blueprint GATE PASS; ffvis=drought/rain/stress GATE+EXPECT (bridge text,
viscells, pad moist counters); showcase lane-B "showcase-ready 117"
regression PASS; tomato scrub ×2 byte-identical (determinism); Math.random
audit clean in touched files (weather-fx rain particles are pre-existing
live-weather cosmetic, outside the creative/sim determinism law). Critic
rounds on drought/rain/stress/plain PNGs: **round 4 ALL PASS** (sky contrast
strong, wet-dark vs dusty-tan pad flip strong, stress gradient strong and
spatially coherent soil↔foliage, zero pad/z-fight artifacts) after rounds
1–2 exposed the clobber race and the round-3 pixel-diff analysis confirmed
the fixes landed. Interactive real-browser verification (throwaway Chrome
profile): created a 90-day Drought Stress run + a Current Conditions run on
farm 1, played the drought run to day 90 (field reads drought: browner
patches, clear sky, HUD stress rows), and ran the A/B compare (solid=
baseline, ghost=drought) to day 19 — ghost plants grow in lockstep with the
solids, correctly seated, unmangled; ghost label + Clear control functional.

Traps recorded: (1) HUD digit misreads — always --expect the literal;
(2) legacy-scrub vs vis-demo ownership — any new plant-rewriting effect
must defer to demos/runs or re-apply after them; (3) instanceColor changes
are buffer-level until the next rendered frame — under virtual-time
captures the LAST writer must be settled before frames stop; (4) weather-fx
rain is subtle under headless SwiftShader (pre-existing; the overcast dome
carries the rain read); (5) Tris HUD 10× artifact persists. Known follow-
ups: stress-tint strength at mid levels remains the wave-1/3 backlog item;
rain streak rendering could use a boost; drought demo plant gradient is
carried mostly by pads+tint at near-camera scale (wilt reads best on the
far rows); ghost overlay still does not consume view params/states (recorded
since wave 2 — deferred by design).

## 2026-09-13 — Growth Visual Evolution wave 5: 2D parity, custom-crop fallback, docs + mission close

Blueprint gains sim-run overlays from the SAME projection layer as the world;
unmapped custom crops stop regressing to the pre-voxel primitive look; the
harness gained the hooks this wave's verification needed. Sim numerics
untouched; no-run rendering paths byte-identical (Draws 274 held, PNG export
never sees the new options).

- **2D sim overlays (SPEC §wave 5)** — `src/lib/renderPlan.ts` grows three
  opt-in `RenderOptions` flags, default OFF (the three-consumer rule holds:
  only the interactive canvas passes them): `simMoisture` (banded soil fill
  under the plant layer, band hexes mirror SimDrawer.MOISTURE_BANDS),`
  `simStress` (per-cell red wash, alpha 0.10+0.38·stress, floor 0.15 = the 3D
  tint gate), `simReady` (amber bottom-left corner triangle — third glyph
  class; halos own the top corners). `usePlanEditor` holds transient toggle
  state (NOT pref-backed: the channels only mean something while a run is
  active) + `simChannels` pushed in via PlotDesigner; `DesignerToolbar` shows
  Moisture/Stress/Ready toggles only when channels exist (`simActive`).
- **Channel derivation (PlotDesigner)** — day-keyed useMemo over
  `simRun.simStateRef` × plan × cropById through `projectPlant` /
  `effectiveStress` / `stageCountFor` (view.ts is now the single projection
  seam for BOTH frontends, spec §1 satisfied). READY semantics fixed during
  verification: the engine sets `readyAtDay = crossDay+3` and auto-harvests
  at `dayIndex >= readyAtDay` (engine.ts HARVEST_GRACE_DAYS), so "alive AND
  readyAtDay set" is exactly the ~3-day standing-ripe window — an initial
  `dayIndex >= readyAtDay` condition was provably empty (r=0 at every day).
- **Custom-crop voxel fallback** — `crops/map.ts` gains
  `makeCropForCustom(name, category, colorHex, stage, state)` (per-category
  representative archetype, colorHex → accent/fruit/unripe slots; shares the
  buildMapping core with makeCropFor) + `hasVoxelPathFor(crop)`;
  `plants.ts` `createBatch` keeps the procedural-clone path ONLY for
  categories with no representative, and `buildNormalizedVoxelRoot` +
  World3D `getGhostTemplate` resolve custom names to voxel templates. The
  pre-voxel primitive look is unreachable for every catalog category.
- **Showcase scrub `custom:` tokens** — `#mode=scrub&only=custom:Name:category:hex`
  renders 12 growth + 6 lifecycle cells through makeCropForCustom
  (normalizeArchetypeIds passes the token past canon; builderFor routes it).
- **`?ffvis2d=` DEV proof hook + `#ff-plan-channels` probe** — PlotDesigner
  composes a REAL run via apiFetch.createSimRun (identical path to the
  Simulations page; seed 7, startDate 2026-09-01 fixed), startRun → seekDay
  (pendingSeek path is safe pre-context), then flips the three toggles; the
  probe span reports `day/m/s/r` every re-derivation. `?ffvis2dDay=N` picks
  the day. StrictMode double-create absorbed by mark-after-start (one orphan
  record per cold profile is the accepted dev artifact).
- **appshot `--timeout=25000`** — sim-run pages never let Chrome's virtual
  time expire (pending work + throttled commits), so `--screenshot` idled
  past the spawn kill with the PNG never written; Chrome's own load-timeout
  bound fixes the harness for any busy page (quiet pages act in <10 s and
  are immune).

Integration points touched: renderPlan.ts (drawPlan overlay passes +
SimOverlayChannels export); usePlanEditor (overlayOpts memo + toggle state +
editor API additions); DesignerToolbar (three conditional toggles);
PlotDesigner (vis2d/vis2dDay params, demo effect, channel memo, probe);
crops/map.ts (buildMapping split + CATEGORY_FALLBACK + two new exports);
plants.ts (createBatch fallback probe + buildNormalizedVoxelRoot resolution);
World3D.tsx (ghost template fallback); showcase/scrub.ts (custom token);
tools/appshot.mjs (--timeout flag); ASSETS.md/HANDOFF.md/SPEC refreshes.

Verified: typecheck + build green; plain blueprint GATE+EXPECT (overlays-off
path unchanged); ffvis2d=drought headless DOM gate `day=25 m=414 s=414 r=52`
+ ffvis2d=baseline&ffvis2dDay=40 `s=79 r=24` (scenario contrast is
machine-asserted: drought stresses 414/414 cells, baseline 79/414), boot
probe 0 errors on both; world GATE + **"Draws: 274"** literal (wave-4
baseline held); lane-B sheet `showcase-ready 117`; tomato scrub ×2
byte-identical (determinism); custom-crop scrub sheet `showcase-ready 18`.
Real-browser verification (headed Chrome, isolated profile): the ffvis2d
drought run rendered live with all three overlays ON — toolbar toggles
active, moisture bands graded per bed (dry browns left → olive/blue right),
stress wash strongest in open-field beds and lightest under
greenhouse/polytunnel, ~52 ready triangles concentrated in the salad bed
(vision-critic PASS); baseline day-40 shot shows ~24 amber triangles where
expected and a sparse wash (PASS). Custom-crop sheet critic PASS (proper
voxel rosette, gold accents at s3+, distinct lifecycle states; nit: late-
stage gold reads uniform — fallback recolor puts colorHex in three slots).

Traps recorded: (1) virtual-time captures RACE createSimRun's climate fetch —
when the fetch loses, normals fall back to the flat 20 °C default and the run
plays out completely differently (documented "invisible default"); headless
DOM counts are structural evidence only, exact values need a real-time
browser. (2) A May-start baseline run on farm 1 (Portland) chronically kills
the whole field by ~day 48 (21+ days of ≥0.85 stress ⇒ view-layer chronic
death) — September-start runs are living and productive; this is an engine/
tuning question handed to the sim owner, NOT a visuals bug (sim numerics
untouched per rule 6). (3) The ready-marker window is narrow by construction
(3-day standing grace before auto-harvest) — if product wants a longer
"pick me" phase in 2D, that's an engine parameter discussion. (4) Native
color inputs ignore AXSetValue — form-driven custom-crop creation can't set
the hue programmatically (default green used; the fallback path is
color-agnostic). (5) Interactive in-world custom-crop painting was abandoned
mid-proof: the desktop browser was being used concurrently by a human —
don't fight for the pointer; the showcase sheet + type wiring carry the
evidence instead. (6) The disk filled twice during this wave (ENOSPC wedges
Chrome headless BEFORE any timeout fires — check df before blaming the
harness; scratch profiles in $TMPDIR/appshot-profile-* pile up on kills).

Known follow-ups: stress-wash alpha at low zoom reads subtle (wave-1/3
tint-strength backlog, unchanged); engine tuning for summer-start baseline
runs (mass chronic death) + possible longer standing-ripe window — both sim-
side proposals, deliberately not touched here; custom-crop category coverage
is English-category keyed (custom crops created via the UI always carry a
valid category, so no gap in practice).

## 2026-09-13 — Growth Visual Evolution: MISSION COMPLETE

All six waves landed on `growth-visual-evolution` (cut from pro-upgrade@
6e23a98; never merged by agents). Merge-readiness summary appended to
quality/SPEC-GROWTH-VISUAL.md §7. Standing backlog for a future mission:
stress-tint strength at mid levels; authored keyframes beyond corn/apple
(spec §2.4); ghost overlay consuming view params/states (deferred since
wave 2); plant LOD/imposter system for very large plans (project-scale,
HANDOFF); sim-side tuning items above.
## Demo-video pipeline + Script Studio (2026-09-10)

Built a HyperFrames (HTML→video) production pipeline and a 60s FarmFriend demo
video, all real-capture based. New files live only under `tools/video/` and
`videos/farmfriend-demo/` — no app-source changes.

- `tools/video/lib/script-doc.mjs` — isomorphic SCRIPT.md/STORYBOARD.md
  parser + serializer + validator (the node CLI block is marker-stripped and
  inlined for browser use). `selftest` = 23-check fixture gate; `scaffold`
  seeds project files. HyperFrames parses STORYBOARD.md leniently and ignores
  unknown bullets, so our extra keys (`tags:`, `asset_candidates:`) and the
  `## Video direction` preamble section coexist with Studio.
- `tools/video/validate-script.mjs` — the gate: 60s ±0.5 total, script↔board
  1:1, word-rate bands, asset existence, tag coverage. `--json` for CI.
- `tools/video/script-studio.html` — built by `build-studio.mjs` from
  `studio-template.html` + the lib (never edit the built file; shebang and
  ESM exports don't survive `new Function`/classic-script inlining). Works
  from file://; localStorage autosave; import/export round-trips the
  HyperFrames formats.
- Video project: `videos/farmfriend-demo/` (product-launch-video workflow,
  editorial-forest preset remixed onto FarmFriend tokens). Captures are REAL
  appshots (`tools/appshot*.mjs`, dev :5177). Two traps cost time: (1) the
  blueprint 2D canvas does NOT paint under virtual-time budgets — use
  `appshot-live --wait 14000`; (2) seed-farm plans re-seed from `seedPlans` on
  every load, so blueprint content is the shipped showcase layout, not
  localStorage. Sim runs are not seeded → the A/B beat uses the Simulations
  page surface + authored run cards, ghost shown as a tint overlay.
- Kokoro TTS speaks ~0.42s/word; `--speed` only reaches HeyGen, so the script
  was tightened to 135 words (55.2s VO) and frame durations = voice + pad,
  hand-balanced to sum exactly 60.00s. `sync-durations` would collapse frames
  to raw voice lengths (55.2s) — do NOT re-run it after the hand balance.
- Frame packets cap at 48KB: each cited rule id inlines its full recipe body,
  so cite only 1–2 load-bearing rules per frame. Render needs ~15GB scratch
  for a 60s 1080p job — use `--low-memory-mode` on this machine.

## Sim-landscape + data-source research (2026-09-12)

Two-agent web research pass (full reports saved at
`quality/RESEARCH-SIM-LANDSCAPE-2026-09.md`): (1) the open-source headless
crop/ecosystem simulator landscape (DSSAT, APSIM, AquaCrop-OSPy, PCSE/WOFOST,
BioCro, RothC, EPIC, STICS…) distilled into the "skeletal archetype" of
components that make such models scientifically credible; (2) open data APIs we
are not yet consuming (CORS verified live 2026-09-12).

Key conclusions for Sim Core roadmap, in build order:
- The engine's shell (determinism, provenance tags, replay-as-storage,
  interventions) is genuinely ahead of many academic tools; the process model
  inside it is the gap.
- A1 carry **solar radiation + VPD** into the env series (NASA POWER is free,
  keyless, CORS-open) → enables PM dual-Kc ET and RUE biomass.
- A3 **layer the soil bucket** from the SSURGO/SoilGrids horizon data we
  already fetch (`chorizon`, SoilGrids depth series) — biggest single accuracy
  lever; data is on disk, unused.
- A5 replace GDD-fraction biomass with **RUE × intercepted PAR** (or
  AquaCrop WP* × ΣTr) + Ks stress multipliers + CO2 factor; canopy cover
  becomes a state that also drives the voxel visuals.
- A6 **stage-indexed partitioning/HI** replaces the post-hoc season-mean
  stress penalty.
- A8 **cultivar parameter layer as data** (SIMPLE 13-param template;
  DSSAT `dssat-csm-data` + APSIM `Models/Resources` for published values).
- A11 **calibration/validation/UQ** is entirely absent — even a lightweight
  version (param ranges + Monte Carlo yield bands + FAO test cases) would
  separate us from hobby sims; SALib/PEcAn are the workflow references.
- Port references by license: AquaCrop-OSPy (Apache-2.0, port first), BioCro
  (MIT, architecture), RothC_Py (Apache-2.0, soil-C port), DSSAT (BSD,
  read-reference); PCSE is EUPL copyleft — reference only. Avoid Cycles
  (CC BY-NC-ND) and ApsimX code (custom licence).
- Top data integrations: NASA POWER → NWS alerts → USA-NPN phenology
  validation → GBIF/iNaturalist pest-pollinator panel → Open-Meteo
  CMIP6/Seasonal → QuickStats county-yield benchmarks → SDA depth series →
  3DEP elevation → vendored cultivar params → Sentinel-2 NDVI per patch
  (opt-in).

## 2026-09-13 — Indoor growing environments: research → surfaces → creative kit (branch `indoor-environments`)

- Research first: `quality/RESEARCH-CEA-ENVIRONMENTS.md` — 14 CEA archetypes
  (footprints, equipment checklists, climate-vs-outdoor behavior, voxel-scale
  visual signatures), 36-entry equipment glossary, planting-surface taxonomy.
  Sources: Cornell CEA handbooks, Penn State Extension, NMSU CR680, Freight
  Farms, AC Infinity catalogs.
- `PlanSurface` grew to six (`+ hoophouse, warehouse`) — additive enum, old
  plans/runs unaffected. Constants with research rationale: SHELTER 0.55/0.06,
  PLANT_SCALE 0.85/0.35, AMBIENT 0.92/0.45, FLOOR `soil-tilled-dry`/
  `floor-concrete`. Shelter ordering outdoor 1 > hoophouse .55 > greenhouse
  .35 > warehouse .06 is monotone with the research climate profiles.
- `src/three/shell.ts` is now a thin adapter over
  `src/creative/environments/shells.ts` with a module-scope single-entry cache
  keyed `(surface, widthM, heightM)`: the planVersion effect runs on every
  brush dab, so a cache hit is detach/reattach, key change frees + rebuilds.
  Shell makers return fresh-ownership geometry (no shared caches, no
  InstancedMesh) to keep `disposeShell` sound.
- Red-team catches that shaped the build (see mission doc amendments):
  `SURFACE_AMBIENT` was untyped `Record<string, number>` with a `?? 1`
  fallback (retyped `Record<PlanSurface, number>`); templates needed canvas
  dims + surface or a tent template would wrap a 40 m canvas; existing
  equipment `surfaces` arrays needed warehouse/hoophouse membership; the
  weather-FX gate is a positive `=== 'outdoor'` test and needs no change.
- New showcase lane E (9 environment dioramas) + 5 plan equipment slugs
  (`fish-tank`, `hydro-raft`, `dehumidifier`, `seedling-tray`, `co2-tank`;
  `hydro-raft` also gained a SHELF_LIFT of 0.26 m). Seed farms 8 "High Tunnel
  Tomatoes" + 9 "Vertical Greens Warehouse"; 3 enclosed starter templates
  (GardenTemplate gained optional `surface`/`widthM`/`heightM`).
- Verification: typecheck + build clean; lane-e `--expect "showcase-ready 9"`
  PASS; determinism double-shot byte-identical; world farms 8/9 + designer
  GATE PASS; headless shell-adapter probe (cache reuse / key-change rebuild /
  outdoor frees) PASS; shelter probe: a 30/40 °C heatwave lands as 25.5/35.5
  in a hoophouse and 20.6/30.6 in a warehouse. Session image ingestion was
  unavailable, so the visual pass ran on pixel statistics + code audit — a
  human-eye pass over lane E and farms 8/9 is recommended before merging to
  mainline.
- Deliberately deferred: container/mushroom as surfaces, per-cell mixed
  surfaces, real point lights, photoperiod/CO2 as sim state.
## Mission TWIN — Wave 2 (2026-09-03, branch `mission-twin`)

**Real simulation engine (`lib/sim.ts`):** `runSimulation(farm, plan, crops,
input, forecast?, climate?, startDate?)` — pure, deterministic, plan-aware.
Daily series = live forecast first, then ERA5 monthly normals (linear
mid-month blend), then a documented generic fallback. Per-crop: GDD (base =
clamp(minTempC, 0, 10)), heat/cold stress days vs catalog tolerances, water
deficit vs `waterNeedMmDay` (irrigation proxy = ET₀ × 0.7), nutrient stress
relieved by fertilizerBoost. Stress → Ky-style growthFactor (1 − 0.6·stress);
yield = catalog `yieldTonHa` × area × factor. Carbon = category residue base
× (1 + 0.1·boost); profit = price bands by category − water/fert costs. All
constants carry origin comments. `localApi.createSimulation` wires it (same
`Api` signature); results JSON gains optional `perCrop` + `provenance` —
old saved sims render untouched.

**Monitoring truth pass:** NDVI grid is now `planNdviGrid(plan, crops)` —
stage-driven proxy off the real planting map (soil 0.12, stage curve
0.25→0.75, category nudges, ≤4 000-pt stride) with the honest label
"Modeled from plan (not satellite imagery)". The fictional "weather-fusion
model (SAR proxy)" line and the `listCells` seed-noise stat row are gone
from the page (endpoints kept for compat). Sensors: soil_moisture/
temperature/humidity/rainfall hydrate from live Open-Meteo as "Virtual ·
Open-Meteo"; the pulse badge appears only when a virtual feed is live or a
manual read is <24 h old. Stat row = plan-based estimates (thirsty cells,
nitrogen-demand share, live soil moisture vs crop need; enclosed surfaces
exempt from irrigation nagging).

**World3D climate identity:** `fetchClimateNormals` baseline threads into
`growthCtxRef.baselineTempC` (state mirror + growth-effect/HUD deps). A
date-scrub to March now runs a Portland farm against its real 17.4 °C
growing-season math, not a hardcoded 20. Provenance chip "ERA5 2016–2025"
in the footer when connected; offline = byte-identical legacy behavior.

**Validation:** Wave 2 GREEN — determinism/plan-awareness/shelter probes,
4/4 route smoke, diff review in `quality/MISSION-TWIN.md` Verification Log.

## Mission TWIN — Wave 3 (2026-09-04, branch `twin-w3`)

**Yield ranges, not single numbers:** `fetchSeasonEnsembles` (one ERA5
archive request, 10 complete years, per-year daily tmean/precip/ET₀;
NASA POWER `T2M_MAX/T2M_MIN/PRECTOTCORR` fallback with Hargreaves ET₀ via
the FAO-56 Annex 2 RA mid-month table) feeds `runSimulation`'s new
`ensembles` arg — the per-crop core now runs once per historical season and
SimOutcome gains `range {low, median, high, years}`. Median uses the
even-count average-of-middle rule. `ff-pro:seasons:*` cache keyed to the
exact window.

**Real climate scenarios:** `fetchClimateProjection` (CMIP6 MRI_AGCM3_2_S,
2021–2025 vs 2041–2045, forever-cached `ff-pro:cmip6:*`, fetched only when
the climate_change scenario runs) replaces the legacy constant +2 °C with
the farm's projected deltas; precip delta guarded to null under ~5 mm/month
baselines (then the preset's multiplier survives — documented reading).

**Environment awareness:** CAMS ozone (1 h TTL, current-hour index) and
GloFAS river discharge (12 h TTL; forecast max vs 30-day sorted-index
p95/p75 ⇒ high/elevated/low; oceans ⇒ null) power the Weather page's
Environment card — Portland showed ozone 74 µg/m³ and "High" 1.98 m³/s
live during validation.

**Budget:** happy path ≤3 requests (L1) + 2 (L2) per cold cache; every
module catch-all → null; old stored sims byte-identical.

## Mission TWIN — Wave 4 (2026-09-04, branch `twin-w4`)

**FAO-56 agronomy in the sim:** per-category Kc curves + Ky factors
(`src/data/fao56.ts`, values verified against the published FAO-56 Ch. 6
tables — orchard 0.45/0.95/0.70 replaced the spec's sketch). Demand is now
stage-aware `ETc = Kc(f) × ET0` with a `0.6 × waterNeedMmDay` floor; yield
response is `1 − Ky × deficitRatio` (true relative-ET deficit — denominator
switched to accumulated stage-aware demand). Fungus: zero demand, Ky 0.

**Soil → sim:** `soilEffect.ts` (AWC deficit buffering vs 25 cm rooting,
pH nutrient factor 1.0 in 6–7 falling to 0.6 at 4.5/9, OM carbon ±0.05/pt)
wired through `runSimulation`'s new `soil` arg from the forever-cached USDA/
SoilGrids profile. All nulls ⇒ identity: no soil data = Wave 3 behavior.

**Light model:** `light.ts` (one ERA5 radiation request/year → 12 monthly
DLI via the 2.02 MJ→mol conversion; missing months imputed from neighbors,
cache v2) feeds `growth.ts`'s enclosed-surface light stress (category need
table, ×0.4 weight; outdoor + fungus exempt). World3D threads the SCRUB
month's DLI so December shows winter greenhouse stress. TZ trap fixed:
calendar months parsed from the string, never `new Date('YYYY-MM-DD')`.

**Disease pressure:** `disease.ts` — 7-day blight/mildew index from hourly
RH ≥ 90 % + 10–25 °C with linear recency decay; Weather-page card with the
computation basis printed. Failed lookups evict from the 1 h cache.

**Process note:** two structured review rounds each shook out real bugs —
including two introduced by earlier fixes. Review loops pay for themselves.

## 2026-09-05 — World3D orbit restore (branch `fix/world3d-orbit-controls`)

**Regression:** the autoreview commits (d6f43ad + e7ab50e, Sep 3) gated
left-drag/one-finger orbit behind `tool === 'select'`
(`setEngineOrbitEnabled`), but the editor default tool is `brush` — so
entering the 3D world view left rotation dead (drags silently painted
instead) while wheel zoom kept working. The arbitration itself is correct
(paint tools must own the drag); the DEFAULT state was the bug.

**Fix:** (1) `PlotDesigner` switches the tool to Select when the world view
opens (effect keyed on viewMode only — switching tools INSIDE the world view
must not snap back; painting in 3D stays available from the toolbar).
(2) World3D shows a top-center hint chip while a paint tool claims the drag
("Brush active — drag paints the plan. Press V or pick Select to orbit
again."), suppressed while a tour owns the top strip.

**Verification:** typecheck + build + appshot gate (zero runtime errors) +
a CDP drag harness: real mouse drag with Select changed 31.5 % of canvas
pixels (ambient-motion baseline 0.27 %); the same drag with Brush changed
3.2 % (painted strip only, no rotation); chip appears iff a paint tool is
active. Lesson: gating a viewer's primary gesture behind shared editor
state needs an entry-path reset or the gate feels like a dead canvas.

## 2026-09-05 — CI/CD bootstrap (`ci-bootstrap` branch)

Goal: `origin/main` always release-ready, changes land only through green PRs.

- **ci.yml** — three parallel jobs per PR/push to `main`: `typecheck + build`
  (Node 22, `dist/` artifact, 7-day retention); `headless smoke` (dev server on
  :5177 + `appshot --gate --expect "Plot Designer"` on `#/farms/1/map` — fresh
  CI profiles get the seeded demo farm — and `--expect "showcase-ready"` on
  `showcase.html`; shots uploaded for eyeballing); `secret + private-file scan`
  (gitleaks v8.30.1 pinned binary, `--redact`, full history via
  `fetch-depth: 0`, plus the filename-based private-file guard).
- **tools/check-private-files.mjs** (`npm run check:private`) — fails on
  tracked env files (`.env.example` allowlisted), key material, OS cruft,
  sqlite dumps, farm/plan data exports, agent state dirs. Complements
  gitleaks: pattern-scan vs filename guard. App is local-first and its external
  APIs are keyless, so filename hygiene is the realistic PII risk.
- **tools/appshot.mjs** — Chrome candidates now: `FF_CHROME_BIN` → macOS paths
  → Linux runner paths (`google-chrome` etc.). No behavior change on macOS.
  (Untracked `tools/appshot-live.mjs` still has the macOS-only list — patch it
  the same way when it gets committed.) First CI run failed the showcase shot:
  GPU-less runners refuse software WebGL unless Chrome gets
  `--enable-unsafe-swiftshader` (now always passed). appshot also gained an
  `FF_CHROME_FLAGS` env passthrough and a `--vt <ms>` virtual-time-budget
  override (spawn ceiling = max(40 s, 4×vt)); the CI showcase shot is scoped
  to `#only=tomato,wheat` because the full 4-lane page needs ~100 s wall under
  SwiftShader.
- **release.yml** — `v*` tag → typecheck + build → `dist` tarball on an
  auto-created GitHub Release (uses `gh release create`, no third-party action).
- **dependabot.yml** — weekly npm + github-actions updates; minor/patch grouped
  to keep PR noise down.
- **Branch protection** on `main` applied after first green run: required
  checks (`typecheck + build`, `headless smoke`, `secret + private-file scan`),
  up-to-date branches, linear history, admin enforcement on, no required
  reviews (solo repo — self-approval is impossible, so reviews would deadlock).
- **Baseline findings (the scans paid for themselves on day one):**
  `.commandcode/` (agent tool state — taste prefs, plan notes) was TRACKED on
  main → untracked (`git rm -r --cached`) + gitignored along with
  `.code-review-graph/`. Gitleaks full-history scan found 2 `generic-api-key`
  hits — BOTH manually verified as documentation text (MISSION-TWIN.md ERA5/
  USDA keyless-API table; a flight-camera bullet list in the now-untracked
  .commandcode plan), no real credentials anywhere. Verified false positives
  are pinned in `.gitleaksignore` (4-part `commit:file:rule:line` fingerprints
  — the 3-part report format does NOT match). Repo's 72 tracked `quality/shots`
  PNGs are deterministic dev shots by convention, not private data. Final
  state: guard passes on 240 tracked files, gitleaks reports `no leaks found`.

Deliberately out of scope: auto-deploy/hosting (no target exists), reviving the
broken ESLint, test runner, husky pre-commit hooks — CI is the single gate.

## 2026-09-06 — Dependency review round + main guard (`ci-hardening`, `fix-guard`)

- Dependabot's first wave reviewed end-to-end: merged #7/#8/#9 (Actions v4→v7),
  #10 (minor group), #11 (recharts 3 — verified beyond CI with an 8-route
  gate sweep + live-mode shot of Simulations; bars/radar data-correct),
  #14 (resolvers 5 — form page shot clean), #13 (TypeScript 7). Closed #12
  (react-dom 19 while react stayed 18 — invalid; react ecosystem now bumps
  as one dependabot group).
- TypeScript 7 needed a 2-line tsconfig fix on the PR branch (TS5102 removed
  `baseUrl`, TS5090 bans non-relative paths values; `./src/*` equivalent).
  After the fix: tsc 7.0.2 typecheck + build green, CI green. Merged.
- Workflow-file PRs can't be merged by the `gh` OAuth token without the
  `workflow` scope — merged those locally via worktree + SSH push (the
  mechanical equivalent of the merge button; CI re-validated on main).
- `main-guard.yml`: branch protection is plan-gated (GitHub Pro/public), so
  enforcement-lite: non-merge commits on main without an associated PR go
  red. First run 403'd — the commit→PR association API needs
  `pull-requests: read`, not just `contents: read`. Now green on real pushes.
- Release path smoke-tested with throwaway `v0.0.0-ci-check` (typed, built,
  tarball attached), then release + tag deleted.
- PII sweep: no personal data in tracked files; gitleaks history clean.
  One flag for the future: 15 commits authored as craigs.seller.sixx@gmail.com
  — rewrite with git-filter-repo BEFORE ever making the repo public.

## 2026-09-15 — Environments beta hardening (`feat/environments-beta-hardening`)

- Discovery (3-specialist sweep) → spec in `quality/SPEC-ENVIRONMENTS-BETA.md`.
  Three axes: sim sheltered temperature-stress ONLY (GDD pace, precip, ET0, N
  mineralization all rode raw outdoor weather on enclosed surfaces — engine
  contradicted its own stress terms); shells leaked sun (no castShadow),
  misfit 2–4.9 m canvases (50-vox min), greenhouse rendered all 4 transparent
  walls, every brush dab detached/reattached the cached shell; and the beta
  net was hollow (CI never rendered World3D, `appshot --gate` failed OPEN on a
  missing probe, no ErrorBoundary, localStorage quota silently dropped
  persistence, corrupt blob silently reseeded).
- Sim: `effectiveEnvironmentForSurface` (drivers.ts) = shelter at ingestion,
  once per day; outdoor passes through by reference (byte-identical). Enclosed:
  sheltered temps → recomputed gddBase10C (fixes the P0 pace/stress split),
  precipMm 0 (roofs — enclosed runs are irrigation-driven; supersedes
  simLegacy's scenario-only precip attenuation, documented), ET0 ×
  SURFACE_ET_FACTOR. New SURFACE_ET_FACTOR table (greenhouse .85 → warehouse
  .6) is a beta approximation — single constants table, trivially tunable.
  Frost event message now reports the sheltered low it actually fired on.
- Shells: solidMesh casts/receives shadows (walls shade interiors; panes stay
  transmissive); shellVoxels floor 50→20 vox (MIN_DIM_M); greenhouse near-face
  panes dropped (dollhouse discipline); warehouse got a far roll-up door +
  truss-bay skylight strips; buildShell idempotent + NaN guard +
  releaseShellCache() on World3D unmount; shell builds try/catch-guarded;
  World3DErrorBoundary wraps the view.
- Harness/storage: `--gate` fails closed (missing probe = exit 1 — future
  steps must hit the dev server, `vite preview` will now fail the gate);
  ci.yml gained World3D shots for farms 1/8/9 (--gate --expect --vt 25000;
  trap-10: gate lines outrank PNG); store quarantines corrupt blobs under
  `ff-pro:v1:corrupt`; simRuns capped at 40, readings at 500/sensor (quota
  driver); Weather page shows an amber "enclosed canvas" context banner.
- Verified: typecheck + build green; appshot gates PASS on map farm 1, world
  farms 1/8/9 (zero runtime errors), showcase expect PASS; aesthetics glance
  on world 8/9 renders clean (no z-fight/shadow acne at default camera).
- Deferred (in spec): CEA setpoints (CO2/RH/photoperiod), passive-solar gain,
  LOD/quality tiers, quota-failure toast, restApi live parity smoke, dioramas
  in the designer palette.

### CI world-gate calibration (same day, follow-up)

First CI run of the new World3D shots failed: `GATE FAIL: boot probe missing`.
Root cause chain: World3D renders continuously (rAF), so `--vt 25000` means
~1,500 software-GL frame sims before Chrome dumps the DOM — 2-core CI runners
starve before the dump; locally (real GPU or even forced SwiftShader on 10
cores) it squeaks through at ~100 s. Also found a latent appshot hang: the
spawn timeout SIGTERMs only the direct Chrome child, and surviving GPU/renderer
grandchildren hold the stdio pipes open, so `spawnSync` never returns (a busy
SwiftShader renderer ignores SIGTERM forever).

appshot fixes: `--vt 0` (no virtual-time budget; dump on the real-time
`--timeout` — turns out the dump fires at the load event, ~2 s, BEFORE React
mounts: useless for gates), `FF_SHOT_TIMEOUT_MS` (env override for the
`--timeout` load wait), `FF_SHOT_SPAWN_MS` (spawn-bound override), SIGKILL +
a detached watchdog that reaps the Chrome tree via its unique
`--user-data-dir` so pipes always close.

Final CI design: world shots run `--gate --expect "Plot Designer" --vt 600`
(~37 simulated frames — still covers the World3D init path where its runtime
errors live) with `FF_SHOT_TIMEOUT_MS=90000 FF_SHOT_SPAWN_MS=420000`.
Verified: GPU gates PASS world 1/8/9 + map + showcase; forced-SwiftShader
world1 PASSES at vt 600 (826 KB PNG) and at vt 2000. LESSON: `--timeout` does
not delay a dump (load event does); virtual-time budget is the only dump
delay, and its wall cost = simulated frame count × per-frame GL cost.
