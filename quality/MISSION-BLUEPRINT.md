# MISSION BLUEPRINT — Primary Editing Surface & Full Asset Wiring

Goal: make the **Blueprint** editor worthy of being the primary planning UX, and
close the asset loop so **everything built is wired and everything wired is
usable**. Written by mission control 2026-08-25 from two completed read-only
audits (Blueprint UX + asset completeness). Every finding below was verified by
those audits; nothing speculative.

---

## Architecture law (why this all works)

**Many frontends, one backend.** `PlanState` (`{ground:{'x,y':slug},
planting:{'x,y':cropId}}`) + the `usePlanEditor` mutation seam + `apiFetch` data
seam serve FOUR frontends: Blueprint canvas, World3D voxel scene, showcase
(asset browser), dashboard/calendar/weather views. Proof from this repo: the 2D
renderer draws any slug generically from its `GardenAsset` record, and the 3D
adapter normalizes registry builds by bounding box — so **adding a paintable
asset is a pure data change** that lights up every frontend at once. Every lane
below obeys this: enhancements are derived/UI-local; mutations flow only through
the sanctioned seam; zero `PlanState` schema changes required for everything
shipped here (preferences go to localStorage, never into the plan).

## Verified findings driving this mission

**Blueprint (UX audit):**
- B1. No hover ghost for brush/asset footprints (asset placement blind until commit).
- B2. Zoom is wheel-only knowledge; no −/%/+ controls; mobile fit floors at
  4 px/cell (ZOOM_LEVELS[0]) making plans illegible at 390 px.
- B3. Interaction-state bugs: pan/grab cursor keyed off refs that never re-render;
  Escape unhandled (can't cancel rect drag or deselect); Undo button enable lags;
  Space keydown unconditionally preventDefault → breaks Space-activating focused buttons (a11y).
- B4. Agronomy brain barely surfaced: pairings engine exists but canvas shows
  amber outlines only; no spacing-violation view; `growthDays` unused in inspector.
- B5. Cold start is dead: plans load empty; no templates.
- B6. Missing tools: eyedropper, fill, line, 5×5 brush; palettes lack recents/asset search.
- B7. `plantedAt` stamped per cell, read by nothing (dormant field — precedent for additive schema).

**Assets (completeness audit):**
- A1. Runtime QA: **all 157 registry entries construct error-free** (lane sheets
  14/103/20/20 + targeted close-ups; zero SHOWCASE-ERROR; determinism PASS —
  zero Math.random in src/creative). Crops coverage: all 47 catalog crops mapped,
  zero fallback crops.
- A2. Dead link: `animals.ts` spawns cow+pig+sheep only on slug `'barn'`, which
  the designer cannot paint → livestock unreachable. Adding barn fixes three species for free.
- A3. Six structures unwired: barn, fence-picket, hay-bale, crate-stack, signpost, scarecrow.
- A4. Six tools showcased-only; recommendation adopted: **auto-dressing props**
  (option b) via new `src/three/dressing.ts` — scene life, not planning data.
- A5. Studio lighting presets superseded by `src/three/sky.ts`; formal retirement
  to showcase-only with documentation (never wire a second lighting authority).
- A6. **Pre-existing adapter bug:** `buildStructures` places one instance PER CELL
  of a footprint (seed farm 1 renders 64 overlapping sheds). Fix: flood-fill → one
  instance per contiguous region at true size; LINEAR items (fence, picket-fence,
  gate, trellis, irrigation-line) stay per-cell so segments tile/connect.
- A7. Terrain leftovers (documented, out of scope this pass): soil-tilled-wet has
  no slug; pond-edge needs neighbor-awareness; edge-cliff has no app surface.

## Non-negotiable risks (every lane reads this)

1. **Shared-renderer leakage (highest risk).** `drawPlan` feeds THREE consumers:
   interactive canvas, PNG export, and `src/three/groundTexture.ts` (World 3D
   ground). EVERY new visual layer ships as an opt-in flag in `RenderOptions`,
   default OFF/undefined. Export and 3D callers must not change at all.
2. **Layout invariants (HANDOFF.md)**: page root `xl:h-full` flex column; canvas
   card `flex min-h-0 flex-col` absorbing toolbar wrap; below xl canvas
   `h-[60dvh]` with panels on page scroll; sizing effect keyed on `isLoading`.
3. **Single mutation seam.** Fill/line/templates produce ONE history snapshot +
   one autosave via `replacePlan`/existing stroke-snapshot paths. Never write
   `planRef.current` ad hoc; never bypass the 600 ms autosave debounce.
4. **Schema discipline.** Zero `PlanState` changes. Custom crop ids start at
   1000 and are never renumbered; templates resolve slugs→ids at apply time.
5. **Export taint rule**: `renderPlan.ts` stays free of remote `drawImage`;
   overlays are vector-only.
6. Harness facts: dev server :5177 (orchestrator-owned, read-only);
   `node tools/appshot.mjs <url> <out.png> [WxH] [--gate] [--expect <text>]`
   (~40 s/shot; Chrome killed by timeout BY DESIGN — judge GATE/EXPECT lines and
   PNG bytes, not exit codes). On `showcase.html` use
   `--expect "showcase-ready N"` (boot probe not mounted there); `--gate` is for
   app routes. PNG scratch space: `$TMPDIR/<name>/`, never /tmp, never the repo.
   TS strict, noUnusedLocals/Parameters — unused identifiers fail builds. Never
   commit (orchestrator does). Never add Claude/Anthropic/co-author references.

## Lane contracts (four parallel lanes, strictly disjoint files)

### Lane R — Renderer & agronomy brain (owns ONLY `src/lib/renderPlan.ts`, `src/lib/plan.ts`)
Pure functions + opt-in render flags. No React, no imports from components.
- Extend `RenderOptions` (all optional, default off):
  - `ghost?: { cells: Array<[number, number]>; colorHex: string } | null` — 35 %
    alpha fill + solid outline over the given cells.
  - `spacingViolations?: Set<string> | null` — 'x,y' keys get a red tint layer
    behind plants (subtle: ~28 % alpha).
  - `companionHalos?: { good?: Set<string>; bad?: Set<string> } | null` — green /
    red corner halos.
  - `layers?: { plants?: boolean; ground?: boolean }` — false hides that layer
    (undefined = visible). Ground hiding must keep bed/path readability of
    remaining layers sensible (plants float on neutral base).
- New exports in `plan.ts` (reuse existing pairing logic; do NOT fork it):
  - `spacingViolationSet(plan: PlanState, cropById: Map<number, Crop>): Set<string>`
    — cell pairs closer than `(spacingA + spacingB) / 200` metres (cm→m), same
    ±4-cell scan window as the pairing engine; cap output at 400 keys for perf.
  - `companionSetsFor(cropId: number, plan: PlanState): { good: Set<string>; bad: Set<string> }`
    — filtered adjacency sets for the active crop.
- Acceptance: typecheck clean; a tiny node-side reasoning note proving flags
  default off (grep callers unchanged); spacing math unit-reasoned in report
  (two tomatoes 1 cell apart at 25 cm must both appear in the set given their
  catalog spacing).

### Lane E — Editor seam, canvas & toolbar (owns ONLY `usePlanEditor.ts`, `BlueprintCanvas.tsx`, `DesignerToolbar.tsx`)
Consumes Lane R's exports exactly as specified above (they may land slightly
after you start — code against these signatures; transient tsc errors in
renderPlan.ts/plan.ts belong to Lane R, ignore them; YOUR files must be clean).
- Ghost preview (P0-1): compute ghost cells from hoverKey + brushSize square, or
  `footprintCells(activeAsset)` for the asset tool; erase tool ghosts its layer
  targets too; thread through `RenderOptions.ghost` in the redraw path only.
- Zoom controls (P0-2): expose `zoomIn()/zoomOut()/zoomPct/zoomFit` stepping the
  SAME ZOOM_LEVELS ladder with cursor-anchored math as handleWheel; render −/%/+
  /Fit cluster bottom-right over the canvas (pointer-events auto).
- Mobile floor (P0-3): `fitToView` never selects <6 px/cell; center offsets when
  the plan then overflows.
- Interaction fixes (P0-4): pan/space/drag cursor from STATE (re-renders), not
  bare refs; Escape cancels rectPreview + clears selection; undo button enables
  synchronously after finishStroke; Space preventDefault scoped to when the
  canvas area holds focus.
- Spacing overlay wiring (P0-5): memoized `spacingViolationSet` + toolbar toggle
  (default ON, label contains "Spacing"), persisted to localStorage
  (`ff-pro:overlay-spacing`), passed as `RenderOptions.spacingViolations`.
- Companion halos (P1-7): toggle group next to spacing ("Companions"), derives
  from active crop or selected cell's crop.
- New tools (P1-1/2/3/4): `'pick'` (I / Alt-click copies cell content to active
  crop/slug and switches tool), `'fill'` (G; BFS flood of identical value within
  the SAME layer, cap 5000 cells, one undo snapshot), `'line'` (L; Bresenham down→up
  cell with dashed preview like rect, commits one snapshot), 5×5 brush + `[` `]`
  cycle sizes. Toolbar buttons + keybind titles for all.
- Layer visibility (P1-8): two icon toggles (plants/ground) near zoom cluster,
  localStorage-backed, threaded as `RenderOptions.layers`.
- Rect HUD (P1-10): during rectPreview show `w×h · N m² · ≈N plants` chip using
  existing stats helpers.
- Acceptance: typecheck clean; harness shots at 1440×900 AND 390×844 with
  `--expect` hits for "Zoom", "Spacing", "Pick", "Fill", "Line", "5×5";
  fit-floor verified via DOM dump zoom label ≥6 px/cell at 390 px. Pointer-feel
  items marked code-review-verified (headless can't synthesize trusted events).

### Lane T — Panels, palettes & templates (owns ONLY `SelectionPanel.tsx`, `CropPalette.tsx`, `AssetPalette.tsx`, `PlotDesigner.tsx`, NEW `src/data/templates.ts`, NEW `src/components/designer/TemplatesCard.tsx`)
- Inspector upgrade: days-to-harvest (`crop.growthDays`), sow window (extract/
  reuse existing sow-window helper rather than duplicating), sun/water/nitrogen
  badges; reorder rail in PlotDesigner so SelectionPanel sits directly under the
  palettes (one-line move; respect layout invariants).
- Palettes: recently-used ring (last 6, localStorage `ff-pro:recent-*`) rendered
  as chips atop both palettes; mirror the existing crop search input for assets
  (`placeholder="Search assets…"`).
- Starter templates: `templates.ts` exports 4 slug-keyed sparse plans (Salad
  Garden, Salsa Bed, Pollinator Strip, Four-Bed Rotation) as data only —
  `{ ground: Record<'x,y',slug>, planting: Record<'x,y', cropName> }`; resolve
  crop NAME→catalog id at apply time (custom ids ≥1000 never hard-coded).
  TemplatesCard lists them with one-line descriptions; apply = confirm dialog if
  current plan non-empty → `replacePlan(..., { save: true })` through the seam,
  ONE history entry, undo restores prior plan.
- Acceptance: typecheck clean; `--expect "Salad"` passes on the map route;
  DOM order shows SelectionPanel above StatsPanel in the rail; search inputs
  present for BOTH palettes.

### Lane W — Asset wiring & world dressing (owns ONLY `src/data/assets.ts`, `src/three/structures.ts`, NEW `src/three/dressing.ts`, `src/components/world/World3D.tsx` (wiring only), `src/creative/studio/presets.ts` (header note), `quality/ASSETS.md` (scope note))
- Add six paintable assets (rows in `assets.ts`, category unless noted:
  infrastructure; plantable:false): `barn` 4.5×3 m 🏠 solid `#A93226`;
  `picket-fence` 0.25×4 m 🚧 stripes; `hay-bale` 0.9×0.5 m 🌾 stripes;
  `crate-stack` 0.75×0.75 m 📦 dots; `signpost` 0.25×0.25 m 🪧 solid;
  `scarecrow` 0.5×0.5 m 🪆 cross (category 'life').
- Region-merge fix (A6): `buildStructures` groups each non-linear slug's cells
  into contiguous regions (BFS flood fill, deterministic first-anchor) and emits
  ONE instance per region; LINEAR slugs (fence, picket-fence, gate, trellis,
  irrigation-line) remain per-cell so segments connect. Replace hand-tuned
  targetSizeM numbers for non-linear items by DERIVING them from the designer
  record: `targetSizeM = Math.max(defaultWM, defaultHM)` looked up from
  `assetLibrary` (single source of truth; keeps 2D footprint == 3D size forever).
  Linear items keep their connective per-cell sizes (≈0.5–0.55).
- SLUG_MAP additions for the six new slugs; add `picket-fence` (+ existing linear
  set) to ROTATED_SLUGS. Livestock then spawns with ZERO further changes
  (animals.ts already triggers on 'barn') — do not touch animals.ts.
- Auto-dressing props: new `dressing.ts` exporting `buildDressing/updateDressing/
  disposeDressing` following the creatures pattern: deterministic hash-picked
  placements NEAR anchors (bed edges, water-tap/rain-barrel, shed door side),
  NEVER on planted cells, cap 12, static clones (tools have no tick rig),
  bbox-normalized to real dims (barrow 1.2 m, hoe/fork 1.5 m leaning, can .35,
  bucket .28, bag .45), disposed/rebuilt on plan change. Wire the trio into
  World3D beside buildAnimals (init, incremental rebuild, dispose cleanup).
- Preset retirement (A5): header comment in `studio/presets.ts` marking scope
  "SHOWCASE-ONLY — superseded by src/three/sky.ts single-sun system"; mirror a
  two-line note in `quality/ASSETS.md`. No functional change.
- Acceptance: typecheck clean; showcase `--expect "showcase-ready 157"` still
  passes (registry untouched); app route farm-2 world GATE PASS before/after;
  report the region-instance count math (seed farm 1: shed regions → 1 instance
  each, fences still N segments). Livestock spawn itself is code-path verified
  (barn row exists + trigger exists) — mark runtime-paint verification as
  pending human/interactive QA.

## Verification gate (mission control, post-merge)
1. Repo-wide `npm run typecheck` + `npm run build` clean; three.js stays lazy.
2. Route matrix re-run with --gate/--expect incl. map route at 1440/1024/390.
3. Showcase sweep: lane sheets ready-N assertions unchanged (registries intact).
4. Diff review: file ownership respected; RenderOptions defaults verified OFF at
   all export/3D call sites; single-snapshot discipline on fill/line/templates.
5. Update HANDOFF Beta Notes + append Verification Log here; commit.

## Status: LANES MERGED & VERIFIED
- [x] QA discovery: Blueprint UX audit + asset completeness audit (both read-only,
  reports summarized in findings above)
- [x] Lane R renderer/agronomy brain — accepted; default-off proven BYTE-IDENTICAL
  before/after PNGs; 14/14 executed node math proofs against real catalog
- [x] Lane E editor seam/canvas/toolbar — accepted; DOM dumps prove 6 px/cell fit
  floor at 390×844 and all new controls present at both breakpoints
- [x] Lane T panels/palettes/templates — accepted; rail order proven via DOM byte
  offsets; templates apply through sanctioned replacePlan seam, one undo entry
- [x] Lane W asset wiring/dressing — accepted; Node runtime probe on real seed
  data: farm 1 structure instances 649→25 (shed 64→1), farm 2 1832→614;
  showcase-ready counts unchanged (14/103/20/20)
- [x] Merge gate: repo typecheck clean; build clean (three.js lazy chunk intact);
  sowWindow dedup (exported from usePlanEditor, SelectionPanel imports it);
  ownership audit clean; full route+showcase matrix re-run (see log)
- [x] Committed

## Verification Log

### Merge-gate matrix (mission control, 2026-08-25) — ALL PASS
Routes `--gate --expect <content>`; showcase asserts `showcase-ready N`
(boot probe not mounted there). First pass: every GATE+EXPECT passed except two
script artifacts (missing `$TMPDIR/mx` dir broke screenshot WRITES only, and a
wrong expect string — the page is "Add a Farm", not "New Farm"); both re-verified:

| Route | Expect | Result |
|---|---|---|
| `#/` | "FarmFriend" | GATE+EXPECT PASS |
| `#/crops` | "Crops" | PASS |
| `#/farms/1/map` (1440×900) | "Zoom in" | PASS · evidence `quality/shots/blueprint/bp-1440.png` |
| `#/farms/1/map` (390×844) | "Zoom"/"Spacing" | PASS · evidence `quality/shots/blueprint/bp-390.png` |
| `/?ffview=world#/farms/1/map` | "Plot Designer" | PASS · `quality/shots/blueprint/world-farm1.png` |
| `/?ffview=world&ffdebug=1#/farms/2/map` | "Plot Designer" | PASS |
| `#/farms/1/calendar` / weather / simulations / monitoring | page titles | PASS ×4 |
| `#/farms/new` | "Add a Farm" | PASS · `new.png` |
| showcase lanes a/b/c/d | ready 14 / 103 / 20 / 20 | PASS ×4 |

Merge-gate extras: repo typecheck + production build clean (three.js lazy chunk
intact); sowWindow dedup landed post-lanes (`export function sowWindow` in
usePlanEditor.ts; SelectionPanel imports it — Lane T's forced duplicate removed);
combined-diff ownership audit clean (every file maps to its lane or the two
sanctioned orchestrator fixes: tools/appshot.mjs argv bug, sowWindow export).

### Known harness limitation (recorded for future missions)
Headless virtual-time captures of world-view routes can race plan-data loading:
`buildStructures` may execute against an EMPTY ground map at capture time, so
world-route PNG bytes cannot arbitrate scene-content changes (proven by Lane W
via a disable-everything probe producing an identical frame). GATE PASS +
Node-side runtime probes are the meaningful automated signals; visual scene QA
(interactive) remains a human step.
