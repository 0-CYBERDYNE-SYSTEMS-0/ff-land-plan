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
