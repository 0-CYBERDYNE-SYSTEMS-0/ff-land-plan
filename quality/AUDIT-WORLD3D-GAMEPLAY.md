# AUDIT — World3D Gameplay & the Game Layer

**Auditor:** Senior PM review (3D simulation / spatial tools / systems games lens)
**Date:** 2026-09-14 · **Branch audited:** `indoor-environments` @ `6392789`
**Audit branch:** `audit/world3d-gameplay` (this doc + evidence shots only; no product code touched)
**Method:** Full read of `src/components/world/World3D.tsx`, `SimDrawer.tsx`, `src/three/{engine,flight,tour,use3DEditor,growth-fx,plants}.ts`, `PlotDesigner.tsx` wiring, `usePlanEditor` hotkey paths; HANDOFF/SPEC/AGENTS framing; live headless evidence via `tools/appshot.mjs` (shots in `quality/shots/audit-2026-09-14/`).

**Scope:** the 3D world as a *working instrument* — camera, interaction, the sim/gameplay loop, HUD, and where "game" helps or hurts. Not a code-quality audit, not a 2D-designer audit except where the two views meet.

---

## A. Executive verdict

FarmFriend's World3D is a legitimately serious garden/market-garden-scale planning twin with an unusually honest data-provenance culture, wearing an excellent voxel skin. The simulation half of the "game" is ahead of the interaction half: time scrubbing, stateful runs, interventions, ghost A/B compares, per-cell agronomic diagnostics, and source-tagged provenance are better than tools ten times the size — while the spatial layer still can't answer "what am I pointing at?", can't orbit while painting, shows no selection marker in-world, and hosts a flight mode that can't hover and fights the tool hotkeys. The biggest risk is not the toy risk the team worries about; it is the **gap between what the world shows (beautiful, alive) and what an operator can do through it (paint, and watch)** — compounded by a documented performance cliff (8 FPS at ~4,000 planted cells) that caps the "real land planning" ambition until plant LOD exists.

| Dimension | Score | One-line justification |
| --- | --- | --- |
| Spatial UX | 6/10 | Disciplined camera bounds and a shared home frame, but no hover inspect, no in-world selection feedback, no measure/compass/scale/georef, orbit lost while painting. |
| Voxel craft | 8/10 | 170+ deterministic builders at a real "best Minecraft farm build" bar; cutaway soil strata and wet/dry furrow tiles show genuine material literacy. |
| Simulation readability | 7.5/10 | Provenance chips, GDD/bucket/ET0 diagnostics, moisture legend, event-dotted timeline are exemplary; stress tint is a MAX across a whole crop's cells (one suffering cell yellows the field), and uncertainty is absent. |
| Operator loop | 6/10 | inspect→understand→intervene→simulate→compare exists, but "intervene" is a 320 px drawer form, not an in-world act; the inspect step is broken without hover. |
| Professional trust | 8/10 | `ERA5 archive / forecast / estimate / scenario` tags on numbers, "cached" weather chip, honest empty states, documented tradeoffs in-code. Rare and valuable. |
| Performance-at-scale readiness | 4/10 | Linear ~3.9k tris/plant, 665 draws at 4k cells, 8 FPS headless; LOD/imposter unscheduled; fine at homestead scale, untenable at field scale. |
| Delight-without-toyishness | 6.5/10 | The living world (bees from flowering capacity, sway from live wind, rain only outdoors) is delight in service of truth; achievements (`night_owl`, `rain_day`) are delight divorced from it. |

**Net:** ~7/10 as a product direction. The foundation is the right one — the fastest win is not more world, it is making the existing world *answerable*.

## B. What is working

Concrete, evidence-backed strengths:

1. **Provenance is a UI citizen, not a footnote.** Every environment number carries a source chip (`ERA5 archive`, `forecast`, `ERA5 normals`, `estimate`, `scenario`) with title-text explaining exactly what it is (`SimDrawer.tsx:37-65`). The growth model's baseline chip reads `baseline 12.3 °C · ERA5` vs `default` — the invisible-default kill is explicit (`World3D.tsx:645-655`). The `cached` weather chip appears both in the dock and drawer. This is the single most trust-building thing in the product.
2. **Time is a playable axis, with guardrails.** Date scrub, `▶ Simulate` at 1 day/week/month per real second, season-end auto-pause after a 14-day maturity grace with an in-drawer explainer ("Every planted crop has matured — playback paused…", `SimDrawer.tsx:334-354`), a monotonic progress clamp so mid-playback scenario changes can't make crops shrink (`World3D.tsx:1061-1082`), and an rAF-dt clock that pauses with hidden tabs. The clock was clearly burned before and learned.
3. **Stateful runs with interventions are the real twin loop.** Run transport with a seekable timeline, intervention ticks, amber/green event dots (`stress-onset` / `harvest-ready`), and intervention authoring that clamps to season bounds and tells the truth: "past dates rewrite history — that's the point of a twin" (`SimDrawer.tsx:653-658`). Session-only amendments carry an `unsaved` chip rather than silently forking the stored record.
4. **A/B compare as a first-class world mechanic.** The ghost run renders semi-transparent beside the solid primary *on the ghost's own plan* ("cells the live plan lost still render as the what-if"), with draw-cost caps, a `ghost season ended` honesty state, and a legend line "solid = X · ghost = Y" (`World3D.tsx:57-332`, `SimDrawer.tsx:488-539`). This is the compare-and-contrast principle done right.
5. **Per-cell diagnostics are real agronomy.** Selecting a growth row reveals GDD accumulated/required/today, soil bucket mm against AWC × root depth, ET0 and rain source, nitrogen kg/ha, and each stress term with its triggering threshold ("heat stress 0.4 · tMax 34.1 °C > max 30 °C") — or the honest "no stress — weather inside the crop's bands" (`SimDrawer.tsx:183-227`).
6. **The world embodies sim state.** Bee/butterfly flock fractions are computed from SimState flowering capacity against the same denominators the ecosystem model uses (`World3D.tsx:1205-1230`); plant sway scales with live wind; rain/snow render only outdoors because enclosed surfaces are climate-controlled; enclosed surfaces dim ambient (`SURFACE_AMBIENT`, `World3D.tsx:377-384`) so the shells' LED strips carry the light. Decoration that is *driven by the model* is the correct kind of game feel for a twin.
7. **Camera discipline.** Exactly one sun (sky-owned; engine deliberately adds none), a legible night floor, damped dolly with a documented rationale (one notched zoom used to trap the camera inside geometry), max polar 88° so you can't dive underground, and "Reset view" sharing `homeFrame()` with load-in so reset restores *exactly* the initial shot (`engine.ts:62-71`, `World3D.tsx:333-338`, `1469-1480`).
8. **3D painting rides the same mutation seam as 2D.** Brush/rect/line/fill/pick/erase in 3D all route through `usePlanEditor` (`use3DEditor.ts`), so undo/redo/autosave/history behave identically in both views. No forked mutation logic — the architecture held.
9. **Perf is observable.** A Perf HUD behind `Debug` / `?ffdebug=1`, and HANDOFF records actual numbers (farm 4: 8 FPS / 665 draws / 18.6 M tris). Profiling honesty is rare; keep it.
10. **Voxel craft clears the bar.** Evidence: `quality/shots/audit-2026-09-14/showcase-crops.png` — meadow variants, dry vs wet tilled furrows, a raised-bed **cutaway with visible soil strata**, three path materials, pond shimmer. Wet/dry and strata as *tile language* is exactly the right instinct for soil-state readability.

## C. Critical issues

Ordered by severity. Each: observation → why it fails operators → impact → root cause → fix direction.

### C1. You cannot orbit while painting — the world fights its own authoring loop
- **Observation:** Orbit is bound to left-drag only, and paint tools set left-drag to `NONE` (`engine.ts:24-29`). Right-drag is truck; there is no orbit binding left in paint mode. Entering World force-resets the tool to Select *specifically because* the default Brush would leave the world unrotatable (`PlotDesigner.tsx:106-115` — the comment admits the trap).
- **Why it fails:** Planting a long row means placing, rotating the camera to see the far end, and re-selecting the tool each time. Camera manipulation is the most frequent action in any 3D tool; gating it behind a mode switch multiplies gestures per stroke by ~3.
- **Impact:** Every authoring session; the #1 felt friction for any non-gamer who has used any 3D or map tool.
- **Root cause:** A drag-ownership rule (paint vs orbit) solved at the wrong granularity — whole tools own the button instead of arbitrating per-gesture.
- **Fix direction:** Remap per-mode: Select tool → left orbit (status quo); paint tools → **right-drag orbit**, middle-drag pan, wheel dolly (camera-controls supports full per-button remap). Two-finger touch already zoom-trucks. Document in a one-line hint chip ("Right-drag to orbit") that appears only while a paint tool is active.

### C2. The world cannot answer "what am I pointing at?" — no hover inspection
- **Observation:** The pointer-move handler returns immediately unless a drag is in progress (`use3DEditor.ts:111-114`); there is no hover raycast, no hover highlight, no cursor-anchored readout anywhere in World3D. The 2D canvas has hover ghost previews; 3D has none.
- **Why it fails:** Pointing is the primary interrogation gesture in every spatial instrument (GIS, CAD, BIM). Without it, identifying a crop means: press V, click, look 360 px away at the SelectionPanel. Crop identity at whole-farm zoom is visually ambiguous (see evidence `world-day.png` — bushy greens are indistinguishable at distance by design of voxel silhouettes).
- **Impact:** The inspect step of the core loop is slow and off-surface; new users cannot build the color↔crop mapping; the 3D view remains a *diorama you visit* rather than an instrument you read.
- **Root cause:** The 3D editor was built gesture-first (paint) not query-first (inspect); the raycaster exists but is only invoked for edits.
- **Fix direction:** Throttled hover raycast (already exists as `getCellFromRaycast`) → a small cursor chip: crop name, sow date, stage %, moisture band in run mode; plus a subtle cell-edge highlight quad. Reuse the moisture-overlay instancing pattern; one extra draw.

### C3. Selection has no in-world representation
- **Observation:** Select-tool click sets `selectedKey` (`use3DEditor.ts:74-77`), but nothing in the scene consumes it — no ring, outline, marker, or camera assist (grep of `src/three/` + `src/components/world/` finds no 3D consumer). Feedback lives only in the side panel.
- **Why it fails:** "I clicked *somewhere*; which plant is selected?" is unanswerable on the canvas. In dense beds the click target is ambiguous; in enclosed shells it's worse.
- **Impact:** Selection feels disconnected from the world; errors of attention (wrong bed edited) become likely — the classic wrong-layer-edit failure state the audit brief warns about.
- **Root cause:** Selection state was designed 2D-first; 3D renders state but not *focus*.
- **Fix direction:** A flat selection ring/marker at the selected cell (plus pulse on change), and "F to frame" camera focus on selection. Cheap, highest feedback-per-line-of-code in this list.

### C4. Rect/line gestures in 3D are blind — preview state is set with no 3D consumer
- **Observation:** Rect drag updates `rectPreview` state in 3D (`use3DEditor.ts:102,125`) but no 3D code reads `editor.rectPreview` — the 2D canvas consumes it, 3D does not. Line tool explicitly documents "No drag preview in 3D; the stroke commits on pointer-up" (`use3DEditor.ts:103-104`).
- **Why it fails:** A drag gesture with zero visual feedback until commit is a silent failure state: the operator cannot see extent, cannot abort precisely, and learns to distrust gestures. SPEC gives 2D ghost previews; 3D silently doesn't.
- **Impact:** Authoring errors (over-wide beds, wrong diagonal), especially at oblique camera angles where cell math is hard to eyeball.
- **Root cause:** Preview rendering was implemented in `drawPlan` (2D) only; the 3D world never got the opt-in equivalent.
- **Fix direction:** One thin translucent extruded box (or cell-slab instancing) covering preview cells, colored by the pending crop/asset, disposed on commit — same lifecycle discipline as `historyViz` ghosts.

### C5. Performance cliff caps the product's stated ambition
- **Observation:** HANDOFF's own profiling: farm 4 (40×24 m, ~4,000 planted cells) = 8 FPS / 665 draws / 18.6 M tris headless, ~3.9k tris/plant, linear scaling; "the real lever … is a plant LOD/imposter system (project-scale, not yet scheduled)." SPEC allows plans to 60×60 m (240×240 cells at 25 cm ≈ up to 57.6k cells).
- **Why it fails:** A planning tool that drops to single-digit FPS at a mid-size market garden cannot demo, present, or iterate at the scale its own spec permits. Frame drops also break the playback illusion (time-as-axis) exactly when fields are fullest.
- **Impact:** Hard ceiling on the "real land planning" pillar; farm-4-like plans become second-class citizens.
- **Root cause:** Full voxel geometry per plant with no distance-based representation; draw count scales with distinct (crop,stage) and instance count scales with cells.
- **Fix direction:** Two-tier: (a) billboard/imposter swap beyond a distance threshold or cell-count budget, (b) per-(crop,stage) single-geometry merge for far LOD. Acceptance: 4k-cell plan ≥ 30 FPS on integrated graphics at the home framing. This is the one "Later"-sized item that belongs at the top of Next quarter.

### C6. Flight mode is a game pastiche that fails as an inspection tool
- **Observation:** `Fly` pointer-locks and takes WASD/arrows; throttle clamps to **min 2 m/s** — you can never stop and look (`flight.ts:125`); horizontal position is unbounded (fly into the void; only Escape-then-"Reset view" recovers, `flight.ts:147-154` clamps only y); and the editor's window-level hotkeys are not suppressed, so flight's `e` (rudder) also switches the tool to Erase, `a` to Asset, `v` to Select (`usePlanEditor.ts:1184-1191` has only an `isTypingTarget` guard).
- **Why it fails:** Non-gamers find pointer lock disorienting on entry (the view snaps to mouselook with no explanation); "always moving" is the opposite of what an inspector needs (hover/stare); silent tool-switching mid-flight corrupts the next paint gesture after exit.
- **Impact:** The mode most likely to produce a "this is a toy" first impression is the one labeled like a professional function.
- **Root cause:** Flight was built from game conventions (dogfight throttle + pointer lock) rather than from the inspection job.
- **Fix direction:** Min speed 0 with an explicit brake (S to stop); soft horizontal bounds = plan bbox + margin with gentle pushback; while `flightActive`, editor hotkeys are suppressed (one flag check in the `usePlanEditor` keydown); exit restores the exact pre-flight camera (save `controls` state on activate); show a 3-line controls card for the first 5 seconds. Keep it — an aerial check pass is a genuinely useful verb — but make it a *drone*, not a plane.

### C7. Tool hotkeys fire globally in World view with mode-mismatched UI present
- **Observation:** The same window-level hotkeys (V/B/R/L/G/I/A/E, `[`/`]`) are live in World view; the full 2D toolbar (Select…Erase, Spacing, Companions, Fit, PNG, CSV) stays visible above the 3D canvas (`PlotDesigner.tsx:165-166`). Spacing-violation and Companions overlays are `drawPlan` 2D-only flags — toggling them in World mode changes nothing on screen.
- **Why it fails:** Controls that appear active but do nothing are worse than absent controls; and a stray `b`/`e` keystroke silently changes what the next click does in 3D.
- **Impact:** Mode confusion; the exact "hidden state changes behind your back" failure the brief calls out.
- **Fix direction:** Either scope the toolbar to what works in 3D (tool group + Undo/Redo; hide Spacing/Companions/Fit/PNG/CSV or grey them with tooltips "Blueprint only"), or make the overlays work in 3D (spacing tint is a per-cell color remap — feasible as an overlay batch). Also add a visible active-tool readout in the world dock.

### C8. Delight is pointed at novelty, not mastery
- **Observation:** The achievement set includes `dawn_patrol` (look at dawn), `night_owl`, `rain_day`, `snow_day`, `flight_time` (60 s airborne), plus emoji toasts (`World3D.tsx:875-877, 1239-1243, 1441-1462`); the genuinely useful milestones (`first_plant`, `tour_complete`) exist alongside.
- **Why it fails:** SPEC explicitly demands "fun," so celebration belongs here — but rewarding weather-watching teaches nothing and trains users to ignore toasts, which poisons the channel the harvest celebration needs.
- **Impact:** Erosion of the professional frame the rest of the UI works so hard for; toast fatigue.
- **Root cause:** Achievements were implemented as presence badges (have you seen X) rather than skill milestones (can you do Y).
- **Fix direction:** Re-skin the same system as **guided mastery missions**: "Run your first season" (▶ Simulate to maturity), "Save a failing crop" (intervene on a stress-onset event), "Compare two futures" (load a ghost), "Find the thirstiest bed" (moisture overlay + diagnostics). Keep weather-poetry achievements, but demote to silent stats, not toasts.

## D. Deep systems audit

### Camera and navigation
- **Orbit/pan/zoom:** damped orbit (0.08), right-drag truck, damped wheel dolly, `dollyToCursor` off with a documented rationale. Bounds: `minDistance 2`, `maxDistance home.dist×4`, polar ≤88°. Reset shares the load-in frame — good.
- **Gaps:** no zoom-to-cursor (the CAD-grade default; disabled due to the camera-in-geometry bug — fix by clamping the controls target to the plan bbox instead of disabling the feature); no saved/bookmarked views; no top-down ortho mode (plan-check parity with Blueprint); no keyboard orbit nudge; no compass/north; no scale bar (the only scale cue is the page subtitle "18 m × 12 m · 25 cm cells"); no georef readout though the farm has lat/lng (used for weather).
- **Flight/tour:** see C6; the tour is a fixed 5 s/segment Catmull-Rom path (`tour.ts:95`) whose waypoints use only structure locations — `_cropById` is literally unused (`tour.ts:27`) — so the tour never mentions what you're flying over. No speed control, no pause-on-waypoint, labels like "Crop Fields" / "Growing Area" (two near-identical center-of-plot waypoints).
- **The void:** the plan floats as an island in sky (`world-day.png`). Charming diorama, weak twin. There is no context plane (even a neutral ground disc or soft fog fade) to anchor scale at the edges.

### Voxel representation and layer model
- One voxel = 10 cm; plan cells 25 cm; surfaces 25 cm slabs; the world is **flat** — no topography, no terrain height, terraces, or slope. Soil state = one moisture bucket + nitrogen per cell; the raised-bed *cutaway strata tile* proves the kit can express horizons, but the data model has no layers. This is a 2.5D twin with 3D dressing — fine for gardens, and the honest framing should be maintained (don't market "soil profile modeling" yet).
- False-precision risk: 25 cm voxels imply survey accuracy, but weather is a single point sample per farm and moisture is a uniform bucket — acceptable at this scale, but the provenance chips are what keep this honest. Keep that pairing (precision ↑ ⇒ provenance ↑) as a rule.
- Multi-layer states that exist (ground vs planting) are legible; **underground is not first-class** — no section cut, no moisture volume, no root depth visualization (root depth appears only as a number in diagnostics). The moisture overlay (4 bands, tinted slabs, legend in drawer) is the right primitive — it should generalize into a *layer stack* (moisture / nitrogen / GDD-progress / stress) rather than staying a one-off.

### Selection / authoring tools
- Full 2D tool parity in 3D (V/B/R/L/G/I/A/E, brush 1/3/5) through the shared mutation seam — genuinely good architecture. Gaps: no hover (C2), no preview (C4), no selection marker (C3), no move/rotate of placed assets (erase+repaint only), no multi-select/lasso, no row/bed grouping (a bed is a run of ground slugs, not an object with identity — so "irrigate this bed" or "clear this bed" are not addressable verbs), raycast hits an infinite y=0 plane so structures never occlude picking (mostly benign at garden scale; will matter when hover highlights arrive — hover must show what a click would *hit*, not what a ray through a roof would *paint*).

### Time, simulation, and scenario compare
- Two coexisting systems: legacy closed-form scrub/playback (scenario deltas, ambient temp, monotonic clamp) and stateful daily-lockstep runs (env series with provenance, interventions with history re-fold, creatures). Run mode parks the legacy clock and locks the scenario — the arbitration is explicit and clean.
- Missing for the operator: **uncertainty** (deterministic single-path runs from reanalysis/normals — a spread band or ensemble would prevent over-trust); **multi-scenario compare** beyond one ghost (the ghost mechanic is excellent; a third overlay or a diff-tint "primary vs ghost delta" map would make it analytical); **yield/cost surfaces** (the crop data has `yieldKgPerPlant` — the world never totals it per bed or season, so the twin doesn't yet answer "is this plan worth it"); frost dates / season markers on the run timeline (events show stress/harvest but not last-frost).
- Playback ↔ run seam risk: both paths write plant batches; the code documents the handoff well (`applyRunGrowth` shim, FAR_FUTURE_ISO trick) — this is clever but fragile; treat the shim as debt to retire when the stateful engine subsumes the closed-form path.

### HUD, legends, and world-space affordances
- The dock (date chip · `▶ Simulate` · `▶ Tour` · `✈ Fly` · `Reset view` · `Sim ▸`) is tight, with fixed child set so state changes don't reflow — nice detail. The `Sim ▸` drawer is 320 px and overlays the canvas; opening it hides a third of the world and it cannot pin/translucent — for a monitoring use ("leave the moisture overlay up all afternoon") there is no dockable surface.
- Time-of-day lives only in the drawer; the dock shows date but not time, so the gorgeous sky work is controlled from behind two clicks. Weather lives in the drawer footer only.
- No legend anywhere in-world for crop colors (identity is click-to-discover); moisture legend is in the drawer (good) but not near the world when the overlay is on.
- Cinema mode (H) + auto-dim during tour/flight with hover-restore is a thoughtful presentation story.

### Onboarding and expert acceleration
- First-run: user lands on Dashboard, must find farm → Plot Designer → toggle `World`. Starter Templates with plain-language descriptions ("Two 1 m raised beds and a gravel path — cut-and-come-again salads ready in weeks") and cell counts are the best onboarding surface — they are pre-built *simulatable* plans.
- Expert acceleration exists invisibly: hotkeys work in 3D (accidentally, per C7), Perf HUD, `?ffview/?fftime/?ffdebug` hooks, showcase lanes. None of it is surfaced in-product; there is no shortcut cheat sheet, no first-run guided path, and the tour (the natural teacher) is content-free (see Camera).
- The tester checklist lives in HANDOFF.md — i.e., onboarding is currently written for developers, not operators.

### Multiplayer / collaboration
- None. Single-operator localStorage; runs and plans are local. For the current beta positioning this is honest, but the *vocabulary* is already right for it: runs behave like branches (fork, ghost-merge for compare). A "share this view" (static PNG exists; a bookmarkable camera+date+overlay state would be the 20% version) is the cheapest first step. Multi-user editing needs a server story first — out of scope here, noted as a positioning question.

## E. Enhancement roadmap

### Now (2–6 weeks) — make the world answerable
1. **Hover inspector + selection marker** (fixes C2, C3)
   - *Problem solved:* inspect loop is broken; identity is click-hunt.
   - *Design:* throttled raycast → cursor chip (crop · sow date · stage % · stress flag · moisture band in runs) + one-cell edge highlight; selection ring mesh + `F` frames camera on selection.
   - *Why game-PM smart:* pointing-as-query is the lowest-friction verb in any spatial tool; it converts the diorama into an instrument with ~2 components.
   - *Acceptance:* hover any planted cell → chip < 50 ms; select → ring visible from home framing; no regression in paint gestures.
   - *Risks:* hover raycast cost on large plans (throttle to pointer-move frames only); chip occlusion near screen edges (clamp).
2. **Orbit-while-painting + restore zoom-to-cursor** (fixes C1)
   - *Design:* paint tools → right-drag orbit / middle-drag pan; clamp controls target to plan bbox; re-enable `dollyToCursor`.
   - *Why:* removes the #1 felt friction; zoom-to-cursor is how every map/CAD tool anchors spatial literacy.
   - *Acceptance:* paint a 10 m line with zero tool switches; wheel zoom centers under cursor at all distances; no camera-in-geometry regressions on the greenhouse/hoophouse shells (regression-test the original bug).
   - *Risks:* right-drag context menu (suppress on canvas); muscle-memory conflict for existing users (ship as a one-line release note + hint chip).
3. **3D gesture previews** (fixes C4)
   - *Design:* translucent slab set over rect/line preview cells, tinted with the pending crop/asset color; erase = red tint. Reuse ghost-material discipline.
   - *Acceptance:* rect drag shows live extent from any camera angle; Esc cancels cleanly; no z-fighting with ground slabs (+0.02 lift like the moisture overlay).
   - *Risks:* rebuild cost per move event — cap by preview-cell count, reuse instancing.
4. **Flight-as-drone + hotkey arbitration** (fixes C6, part of C7)
   - *Design:* min speed 0 + brake; soft horizontal bounds (plan bbox + 10 m); suppress editor hotkeys while `flightActive`; restore pre-flight camera on exit; 5 s controls card on first activation.
   - *Acceptance:* come to a full hover over a bed, inspect, resume; `e` mid-flight never changes the active tool; exit returns to the exact entry view.
   - *Risks:* pointer-lock browser quirks (Safari permission prompt) — keep the click-to-lock gesture explicit.
5. **World dock: time + weather + active tool** (partially C7)
   - *Design:* extend the date chip to `Sep 15 · 14:20 · 22 °C 💨 12` (data already in refs/state); show active tool glyph; hint chip "Right-drag to orbit" while a paint tool is active.
   - *Why:* kills two drawer round-trips per session; the sky system stops being hidden.
   - *Acceptance:* time-of-day adjustable without opening the drawer (mini-slider on chip click).
6. **Re-skin achievements as mastery missions** (fixes C8)
   - *Design:* keep the system; replace the toast set with the five missions in C8; weather-poetry moves to a silent stats line in the drawer.
   - *Acceptance:* a new user's first three toasts each teach a core verb.

### Next (quarter) — structural upgrades
7. **Plant LOD / imposter system** (fixes C5) — billboard swap beyond distance/count threshold + merged far-geometry per (crop,stage). *Acceptance:* 4k-cell plan ≥ 30 FPS integrated GPU at home framing; visual delta at swap distance imperceptible in a side-by-side capture. *Risks:* impression mismatch for large-framed crops (corn vs lettuce silhouette) — tune per category; ghost-run must respect the same LOD path.
8. **Layer stack generalization** — promote the moisture overlay into a selectable stack (moisture / nitrogen / GDD % / stress max / spacing violations in 3D), one legend, ≤ N batches. This also absorbs C7's Spacing/Companions question properly (make them work in 3D rather than hide them).
9. **Tour as field report** — waypoints per crop block with live provenance labels ("Tomatoes · sown Mar 2 · 62% GDD · water stress 0.2"), pause-on-waypoint, speed control, "export tour as PNG sequence" for stakeholder updates. Uses data that already exists (`cropProgress`).
10. **Bookmarkable views + presentation mode** — named camera+date+overlay presets ("Spring plan", "July stress check"); cinema mode gains a turntable and HUD whitelist. *Why:* the board-meeting job is real and currently served by ad-hoc screen recordings.
11. **Scenario diff overlay** — when a ghost is loaded, optional tint mode: cells colored by primary-vs-ghost biomass delta (diverging palette), turning the ghost from a shape comparison into an analytical one.
12. **Uncertainty, phase 1** — run timeline gains a band for normals-derived spread on temperature-driven days; diagnostics already tag `estimate` sources — surface "this week is synthesized from normals, not observed" as a timeline shading, not just a chip.

### Later (platform) — differentiators
13. **Georeference surface** — the farm already has lat/lng: place the plan on a true-north-aligned ground context (neutral tile or imported ortho/GeoJSON boundary), drive the sun from real coordinates, show a coordinate readout. Converts "diorama island" into "place."
14. **In-world intervention authoring** — click a bed → "Irrigate 20 mm today" inline (drawer form stays for precision). Closes the loop spatially: act where you see the stress.
15. **Yield & cost layer** — per-bed and per-season harvest projections from existing `yieldKgPerPlant` + harvest windows; a "bin tally" HUD mode. Makes the twin answer "what is this plan worth," which is the board-room question.
16. **Subsurface as exploded layer** — soil horizons per bed (the cutaway tile already exists as language), root-depth bars, probe fusion API. This is the roadmap item that would make "digital twin" literally true below grade.
17. **Share states, then presence** — bookmarked view URLs first; multi-user presence/locking only after a server story exists. Runs-as-branches is the right conceptual model to extend.

## F. UX / interaction proposals

**Default vs expert vs field-operator variants:** defaults ship with hint chips on (orbit hint, tool glyph) and drawer-closed; experts get hotkey parity (`[`/`]`, `F` frame, `G`/`Shift-G` layer cycle) and a cheat-sheet (`?` overlay); a field operator preset (tablet, sunlight) needs: max zoom-out legibility mode (imposters always on, oversaturated bands, larger HUD), moisture layer as a one-tap toggle, and read-only by default with an explicit "edit" latch — none of this exists today; the Cinema button is the seed of it.

**Proposed HUD wireframe (World view, non-cinema):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⛶ Cinema  👁 Inspect   │  ↑N   ⊢── 10 m ──⊣   43.65°N 79.38°W       │
│                                                                      │
│                                            ┌───────────────────────┐ │
│                 ( 3D world )                │ 🍅 Tomato · Mar 2      │ │
│                                            │ Stage ●●●●○ 62% · GDD │ │
│                                            │ 💧 48% · stress 0.2 ⚠ │ │
│                                            └───────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ ● Sep 15 · 14:20 · 22°C 💨12 ☀0mm   [▶ Simulate] [1 day/s ▾]   │   │
│ │ [◀ ▶] [Tour] [Fly] [Reset]   Layers: 💧 🌡 🌱   Tool: ✋ Select │   │
│ └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

**Day-in-the-life flows:**

- *Spring planting plan (today vs proposed):* Today — paint beds in 2D, toggle World to admire, toggle back to fix the row you couldn't see, repeat; orbit requires V each time. Proposed — paint in 3D with right-drag orbit and live rect slabs; `F` frames each bed as you finish it; spacing overlay available in-world; "Plant all" from a template then walk the tour, which reads each block back with sow dates.
- *Drought stress diagnosis (run mode):* Proposed — play week/s until a `stress-onset` dot; open moisture layer; the cursor chip over the worst cell reads "💧18% · water stress 0.4"; hover-scan the bed; click bed → "Irrigate 25 mm today" inline; timeline re-folds; the amber dots downstream turn green; ghost the pre-intervention run to see what you saved. Every step in-world except the numbers panel.
- *Harvest logistics:* run to maturity; `harvest-ready` celebrations mark actual cells; a per-bed bin tally (roadmap 15) sums kg; bookmark "Harvest week Aug" view for the crew board. Today only the celebration exists.
- *Board presentation:* Cinema (H) + bookmarked "Season arc" tour with provenance captions + PNG export. Today: screen recording of a tour that says "Crop Fields."

**Before/after interaction sequences:**

- Identify a plant: `V → click → read side panel` ⇒ `hover → read chip` (4 gestures ⇒ 1).
- Reposition while painting: `Esc-ish (tool switch V) → drag orbit → B → resume` ⇒ `right-drag orbit` (3 actions ⇒ 1, no state change).
- See a rect before committing: `drag → commit blind → undo if wrong` ⇒ `drag → see slabs → adjust → commit`.

## G. Gameplay-quality principles to adopt (professional form)

- **Readable verbs in the world:** currently the world *shows* (sway, rain, bees) but *verbs* live in panels. Hover/chip, click/inspect, drag/paint, right-drag/orbit — make each verb legible at the cursor.
- **Fast reset and safe experiment:** already strong (undo ghosts, `Reset view`, session-only interventions, `unsaved` chips). Extend with bookmarked views so "go back to where I was" survives camera wandering.
- **Compare-and-contrast as a first-class mechanic:** the ghost run is the model citizen — generalize it (diff tint, layer-stack presets A/B).
- **Mastery through tools, not tutorials:** convert achievements to missions; surface the cheat-sheet; let the tour teach content, not camera moves.
- **The map as an instrument, not a diorama:** the single organizing principle for C2/C3/C4 and the void/georef work. Every pixel of world should be *readable* or *actionable*; decoration earns its place by being model-driven (the bees pass this test; `night_owl` does not).
- **Time as a playable axis:** already the product's best system; protect it (the rAF-dt clock, the clamp, the auto-pause are all load-bearing) and deepen it (frost markers, uncertainty bands).
- **Uncertainty visualized, never hidden:** the provenance chips are 80% of this. Finish it with timeline shading for synthesized days and spread bands before stakeholders over-trust a single deterministic line.

## H. Anti-recommendations

Do **not**:

- **XP, levels, currency, or unlocks.** The mission system should confer competence, not status. No "level 5 Agronomist" badge frames.
- **Cartoon mascots or character guides.** The world's voice is the provenance chip — dry, honest, specific. A talking scarecrow would spend trust the data layer earned.
- **Click-to-collect harvest gamification.** Harvest should read as an outcome of the model (`harvest-ready` events, bin tallies), never as a tappable sparkle loop.
- **Post-FX juice on data mutations.** No confetti on planting, no screen shake on fertilizer. The harvest celebration (bounded, at the actual cells) is the right ceiling; growth FX belong to *milestones*, not *inputs*.
- **Idle/farm-game timers.** Nothing real-time-gated; the sim clock is a scrubbing instrument, not a waiting game.
- **Weather as RNG spectacle** (storm events for drama). Weather arrives from data with a source tag, or not at all.
- **Mobile-game virtual joysticks in Flight.** A drone preset with tap-waypoints, yes; twin-stick joysticks on a planning tool, no.
- **Bloom/DOF/film-grain default-on.** Color-accurate readability is agronomic function (stress tints, moisture bands must stay truthful); keep heavy FX opt-in and off in presentation defaults.
- **Turning the void island into a literal game skybox biome.** Context should come from *place* (georef, north, ortho underlay), not from decorating the void with mountains.

## I. Open questions / missing evidence

1. **Target operator mix & field-size ceiling.** SPEC says 60×60 m max plans; is the ambition market garden (≤2 acres, current fit) or whole-farm (multi-hectare, needs C5 + georef + tiling)? This gate-sorts the entire Next column.
2. **Real-GPU perf numbers.** All profiled figures are headless SwiftShader; farm-4 FPS on integrated/real GPUs is the decision input for scheduling LOD. One manual pass with the Perf HUD on target hardware would settle it.
3. **The blank Blueprint canvas in the headless 2D shot** (`designer-2d.png` renders an empty canvas at 86% Fit while the same farm renders in World): possibly a headless-only canvas-sizing artifact (the `isLoading`-keyed sizing effect), possibly a real first-paint bug. Needs one human browser check; not counted as a finding.
4. **Dusk legibility on target screens.** `world-dusk.png` shows outdoor crops going murky at 0.85 time-of-day; the night floor was tuned via the lighting matrix (MISSION-BETA), but dusk specifically may need the documented nudge ("dusk orange band reads slightly flat"). Verify on a low-glare laptop.
5. **Who is the presentation audience** (board? CSA members? agronomy consultants?) — decides how far bookmarked views/presentation mode (E10) should go, and whether PNG export or live-cinema is the deliverable.
6. **Sim tick economics** — `runSpeed` supports 1/7/30 day/s with throttled commits (~5/s); is there a budget for 2× run concurrency (primary + live ghost stepping together) or must compare stay fold-on-demand?
7. **Multi-user intent** — is collaboration a real near-term need (then the localStorage ceiling and run-as-branch model need a server plan now) or a later-platform item (then E17 ordering stands)?

---

### Evidence inventory

- `quality/shots/audit-2026-09-14/world-day.png` — home framing, full farm, dock/toolbar as shipped; crop identity ambiguity at distance; island-in-void.
- `quality/shots/audit-2026-09-14/world-dusk.png` — fftime 0.85; outdoor legibility drop; sky dome flatness.
- `quality/shots/audit-2026-09-14/showcase-crops.png` — lane A terrain sheet; cutaway strata; wet/dry furrow language.
- `quality/shots/audit-2026-09-14/showcase-structures.png` — lane D asset sheet.
- `quality/shots/audit-2026-09-14/designer-2d.png` — the anomalous blank-canvas capture (see I.3).
- Capture command: `node tools/appshot.mjs "<url>" <out.png> 1600x900 --expect "<text>"` against `npm run dev`; all five `EXPECT PASS`.

*End of audit. No product code was modified on this branch.*

---

## Implementation addendum (2026-09-14, branch `feat/world3d-gameplay-now`)

The six "Now" items were implemented and reviewed by a three-specialist pass
(correctness-adversary review, 9 findings, all fixed pre-landing). Deviations
and notes:

- **E2 zoom-to-cursor is deliberately NOT shipped.** camera-controls 3.1.2's
  `dollyToCursor` converges the orbit target onto ground/structures at grazing
  angles — exactly the camera-inside-geometry regression the original comment
  documents. Shipped instead: a per-frame controls-target clamp
  (`Engine.setTargetBounds`, plan bbox + 2 m, y ≥ 0) as the guardrail, with the
  orbit remap (right-drag orbits while paint tools own left-drag). Revisit
  cursor-dolly only behind a custom cursor-ray dolly.
- **camera-controls 3.1.2 has no writable public `controls.target`** — the
  clamp goes through `getTarget`/`setTarget(…, false)` and is skipped while
  flight owns the camera (`controls.enabled` false).
- **Flight exits on pointer-lock loss** (the ESC keypress that leaves pointer
  lock is consumed by the browser and never reaches a keydown handler), the
  `requestPointerLock()` promise rejection is caught, and exit restores the
  exact pre-flight orbit camera. Min speed 0 (full stop), soft horizontal
  bounds from the live plan, and window-level editor/cinema hotkeys are
  suppressed while flight owns input (`src/lib/inputArbiter.ts`).
- **Hover/selection**: fixed-position readout chip above the dock (never
  cursor-following), one reusable highlight slab, one selection ring
  (mount-scoped creation, reposition-only on plan edits). Hover freezes during
  flight/tour and clears on pointer-leave.
- **Previews**: rect/line drag previews render as a single InstancedMesh keyed
  on a content signature (never per-pointermove rebuilds); `RectPreview`
  gained optional `kind`/`cells` so 2D is untouched.
- **Missions**: `check()` returns the newly unlocked achievement; toasts fire
  at call sites (the old count-watcher swallowed the first unlock of a
  session); weather/flight badges persist silently; four new mastery missions
  (`first_run`, `first_intervention`, `first_compare`, `moisture_lens`).
- **Audit item C5 (perf/LOD) remains open** — it is Next-quarter scope and the
  gating risk for field-scale plans.
