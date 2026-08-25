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
