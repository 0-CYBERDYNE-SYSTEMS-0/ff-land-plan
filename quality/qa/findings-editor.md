# QA findings — Editor & Persistence (QA-1)

Lane: Blueprint 2D designer (`PlotDesigner` + `usePlanEditor` + toolbar/panels) and the plan persistence seam. Audited as-is (uncommitted working tree). Evidence: code traces with `file:line` + 3 headless gates. Interactive pointer testing is impossible headless; where a finding or pass is trace-only it is marked.

## Verdict

The designer lane is fundamentally sound and close to commit-ready. All 8 tools funnel through the single mutation seam (`usePlanEditor`) with version bumps, one-snapshot-per-stroke history, and the 600 ms debounce; overlay isolation in PNG export holds; the undo/redo disabled-state suspect resolves as NOT a bug; templates, settings, zoom, CSV, and the fall-sow date math all trace clean. 3/3 headless gates pass with zero console errors. The one real problem is persistence UX on seed farms (ED-1, P1): the store deliberately re-seeds farm 1–7 plans on every reload while the UI promises "Saved" — work on the app's primary route silently vanishes. Two P2s (error badge mislabeled "Ready"; a stale-save clobber race that only bites a remote backend) and two P3 hygiene items round it out.

## Checks run

| # | Probe | Result | How |
|---|-------|--------|-----|
| 1 | 8 tools end-to-end (V/B/L/R/G/I/A/E) | PASS (trace-only) | Every paint path ends in a `setPlanVersion` bump (applyBrushAt :627, fill :755, finishStroke :828) then `scheduleAutosave` → `queryClient.setQueryData` :531 → `store.persist` (store.ts:105-117). No tool bypasses history; Pick/Select intentionally mutate no plan (:679-695). Shortcuts :1184-1191 match DesignerToolbar.tsx:35-44. Pointer interaction itself not testable headless. |
| 2 | Undo/redo + disabled-state suspect | PASS — suspect resolved, NOT a bug (trace-only) | Every history push is paired in the same synchronous block with a state bump: replacePlan :542-546, fill :752-755, stroke end :826-828 (push BEFORE bump so the re-render sees the enabled button), undo :844-850, redo :852-858. DesignerToolbar is unmemoized and receives a fresh `editor` object each PlotDesigner render, so any planVersion/saveState change re-renders it and re-reads `undoRef.current.length` (DesignerToolbar.tsx:147-152). Refs don't trigger renders — the version bumps do. applySettings (:1026-1040) and template apply are both undoable via `recordHistory`. Redo cleared on new edit (:546, :753, :827). |
| 3 | Rect/Line/Fill payload modes | PASS | `modeOptions` (DesignerToolbar.tsx:68-69): line gets [plants, asset, erase]; rect/fill get [plants, asset]. Reset effect (usePlanEditor.ts:1098-1100) demotes a carried-over 'erase' mode to 'plants' when rect/fill is chosen — Erase can never be selected/shown for rect/fill. Only artifact: a one-frame Select value flash before the effect lands; silent mode drop is documented intent. |
| 4 | Overlay isolation in PNG export | PASS | `renderPlanToPng` (renderPlan.ts:337-380) passes only base options (cellPx/offsets/cropById/viewW/H/theme/surface) — no `ghost`, `spacingViolations`, `companionHalos`, or `layers`. Interactive `redraw` (usePlanEditor.ts:444-453) spreads `overlayOpts` built from the toggles (:425-433). Flags default OFF (renderPlan.ts:38-45). |
| 5 | Zoom (buttons/wheel/pinch/reset/fit) | PASS (trace-only) | Single primitive `applyZoom` :481-497; ladder clamps index :510; equality guard :484 stops no-op zooms at min/max; fit floors at MIN_FIT_PX=6 :62,:463 and works on an empty plan (dims are widthM/heightM-based, not content); wheel is cursor-anchored through the same ladder :1013-1024; pinch clamps 4..36 :977. |
| 6 | Templates | PASS | Name→id resolved at apply (TemplatesCard.tsx:52,70); unknown names skipped + counted in toast (:88-92); out-of-bounds cells filtered (:55-58); all ground slugs exist in assets.ts (raised-bed/inground-bed/trellis/path-gravel/compost-bin verified); one `replacePlan(next, {save:true, recordHistory: before})` (:86) ⇒ stats recompute + undo entry + autosave; overwrite confirm dialog :121-137. |
| 7 | Settings dialog | PASS (trace-only) | `applySettings` :1026-1040: `clampPlan` drops out-of-bounds cells (plan.ts:49-61), `stripInvalidPlants` drops plants on non-plantable ground; whole change is one undo entry. Surface propagates: 2D floor (renderPlan.ts:10-15), 3D plant scale `SURFACE_PLANT_SCALE[plan.surface]` (three/plants.ts:338), sims `SURFACE_SHELTER` (growth.ts:89,101). Shrink-with-crops: crops outside bounds are removed and are recoverable via undo. NaN width unreachable: type=number inputs sanitize invalid text to '' → Number('')=0 → clampMeters → 2. |
| 8 | CSV shopping list | PASS (download not executed headless) | Disabled until `stats.perCrop.length > 0` (DesignerToolbar.tsx:159). Quantities = per-plot cell counts → `plantsForArea` = floor(area/spacing²) (plan.ts:86-93, usePlanEditor.ts:1053-1070); seeds = ceil(plants×1.5); proper CSV escaping (:178-181). |
| 9 | Autosave / save-state badge | FAIL (ED-2, ED-3) | Rapid edit→undo→edit within 600 ms is safe: `scheduleAutosave` clears the prior timer (:522), snapshots are clones — single trailing save, no lost strokes, no double-save. Failed save sets 'error' (:532-535) but the badge label has no error branch → red "Ready" (ED-2). Stale-save clobber under restApi (ED-3). |
| 10 | SelectionPanel + fall-sow date | PASS | Gates (usePlanEditor.ts:191-201) match the comment: minTempC>8 excludes tender crops — catalog distribution {…,4,7,10,13,…} confirms the 7→10 gap with nothing at 8/9; maxTempC>30 excludes heat-lovers (30 stays); growthDays>120 excludes overwinter crops. Date math: Oct 15 − 6w = Sep 3 (verified: `new Date(2026,9,15-42)` → Thu Sep 03 2026); roll-to-next-year when frost passed (SelectionPanel.tsx:33-34); label "Sep 3" style via monthDayLabel (calendar.ts:129-131). |
| 11 | Not-found dead ends | FAIL (ED-4, P3) | PlotDesigner.tsx:68-70. |
| 12 | Persistence/reload/custom crops | FAIL (ED-1) / PASS for user farms | getPlan on mount (:236-239) → init effect clones stored plan, re-syncs draft settings, planVersion bump, initial fit (:1074-1091); viewport recomputed deterministically via fitToView (not persisted — acceptable). Custom crops: counter starts at 1000 (store.ts:60), ids never renumbered (localApi.ts:283), catalog merge preserves them on load. BUT seed-farm plans are re-seeded on every load (ED-1). |

Headless gates (3 of ≤8 budget used, all in `$TMPDIR/ffqa-editor/`):
- `#/farms/1/map` — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "Brush"` → bp-farm1.png (146,669 bytes)
- `#/farms/1/map` — `GATE PASS` / `EXPECT PASS: found "Starter Templates"` → bp-farm1-templates.png
- `#/farms/5/map` — `GATE PASS` / `EXPECT PASS: found "Grow Tent"` → bp-farm5.png (146,519 bytes — differs from farm 1 ⇒ distinct plan/surface rendered)

## Findings

### P1
- **ED-1 — Seed-farm plan edits silently revert on reload while the UI says "Saved".** store.ts:86-88 re-seeds plans for every seed farm id (1-7) on every boot; farm 1 is the primary route. Autosave + "Saved <time>" badge (PlotDesigner.tsx:90-93) promise persistence that the reload path contradicts. Documented as intentional demo policy in the store comment, but the user impact is silent work loss with a false success signal. See findings-editor.json for the full evidence chain.

### P2
- **ED-2 — Failed autosave shows a red badge labeled "Ready".** No 'error' branch in the label chain (PlotDesigner.tsx:91); no retry until the next edit.
- **ED-3 — Stale autosave response clobbers newer edits (remote backend only).** `planRef.current = clonePlan(saved)` (usePlanEditor.ts:528) without a version check; benign with the default synchronous localApi, real under `VITE_API_BASE_URL`. Trace-only, confidence medium (untested against a live backend).

### P3
- **ED-4 — "Farm not found."/"Plan not found." dead ends** with no link home (PlotDesigner.tsx:68-70). Bare-text early return also drops the header/back arrow.
- **ED-5 — Line+Erase payload uses the Erase tool's hidden layer state** (usePlanEditor.ts:578-591 + DesignerToolbar.tsx:99-109).

## Verified wired ✅

- All 8 tool shortcuts (V/B/L/R/G/I/A/E) wired window-level (:1184-1191) and matching the toolbar's advertised keys.
- Brush/erase with 1×1/3×3/5×5 sizes; `[`/`]` size cycling (:1177-1182).
- Rect drag with live HUD chip (area/plants estimate, BlueprintCanvas.tsx:40-53) and Bresenham line ghost preview (:374-386).
- Alt-click eyedropper from any tool (:914-919); Pick tool switches payload + tool (:681-695).
- Flood fill: layer-respecting, FLOOD_CAP 5000, one history snapshot + one debounced save (:700-757).
- Escape cancels in-flight strokes restoring the before-snapshot without a history entry (:759-783).
- Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo, redo cleared on new edits, HISTORY_LIMIT 50.
- Undo/Redo/Fit/PNG/CSV/Settings toolbar buttons all bound; CSV correctly gated on having crops.
- Overlay toggles (Spacing/Companions) and layer toggles (plants/ground) persist to localStorage prefs (:1209-1212) and feed only the interactive redraw.
- PNG export renders no overlays; legend + 1 m scale bar; no remote drawImage in the shared renderer (taint-safe).
- Zoom cluster (−/%/+/Fit), wheel cursor-anchored zoom, pinch-zoom+pan, Space/middle-drag pan gated on canvas focus (a11y fix intact).
- Templates: name→id resolution, bounds filtering, unknown-crop skip toast, single undo entry, overwrite confirm.
- Settings: clamped dims (2-60 m), out-of-bounds cleanup, undoable, surface propagates to 2D floor, 3D plant scale, and sim shelter.
- Fall-sow window math and gate thresholds (Oct 15 − 6w → Sep 3; gates match catalog data).
- Autosave debounce: single trailing save, correct snapshotting, query-cache update, quota failure degrades to in-memory with a console warning (store.ts:110-116).
- Custom crop ids start at 1000 and are never renumbered; user farms/plans survive reload untouched.

## Not tested

- Real pointer/mouse interaction (clicks, drags, pinch) — headless harness cannot click; tool behaviors above are code-trace evidence.
- PNG and CSV file downloads (bytes on disk) and `renderPlanToPng` against a tainted canvas — traced only.
- restApi (remote backend) behavior, including the ED-3 race under real latency — no backend configured.
- Undo/redo across a farm switch or 50-entry history overflow (HISTORY_LIMIT eviction) — traced, not exercised.
- Farm 5's tent plan rendering in World3D (out of lane; world lane owns it).
