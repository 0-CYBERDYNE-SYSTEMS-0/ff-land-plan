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
