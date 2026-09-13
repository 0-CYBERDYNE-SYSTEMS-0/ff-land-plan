# SPEC: Growth Visual Evolution — plant life stories readable from the world

Status: **BINDING** from wave 0 (branch `growth-visual-evolution`, cut from
`pro-upgrade@6e23a98` on 2026-09-11). Companion to `quality/SPEC-SIM-ECOSYSTEM.md`
(the engine this projects from) and `quality/QUALITY_BAR.md` (the bar every new
stage/state must beat). Mission: a user watching a simulation run reads each
plant's life (sprout → canopy → flower → fruit → ripe → finished) and condition
(thriving, thirsty, hungry, heat-hit, pest-bitten, dead) **from the world alone**.

## 0. Hard laws (non-negotiable)

1. **No sim numerics changes.** `stepDay`, stress formulas, yield math, stored
   run semantics are frozen. All new visuals are derived channels computed in a
   pure view-projection layer. If a wave thinks it needs an engine change, it
   writes a proposal instead.
2. **Determinism.** No `Math.random` in `src/creative/`, `src/lib/sim/`, or any
   new view module. All variation from `rng(seed)` (mulberry32, `voxel.ts:178`)
   or FNV/splitmix hashing of `(cellKey, dayIndex, salt)`. Same inputs ⇒
   byte-identical output, forever.
3. **Perf contract.** Farm 1 world baseline (wave 0, headless, `?ffview=world&ffdebug=1`):
   **273 draws** (matches the HANDOFF profiling session). Guards: plant-layer
   draws ≤ 80 worst case (the standing architecture budget); farm-1 total draws
   must not grow by more than ~5% (≈ +14) in the no-run common case; state
   batches only exist for states present in the field. Measure every wave via
   the Perf HUD (`--expect "Draws:"`); FPS under headless virtual time is not
   meaningful (documented artifact). Wave-0 caveat: HUD Tris read 23,723,912 vs
   HANDOFF's recorded 2.3 M — a 10× discrepancy assumed to be a HUD-read/render-
   count artifact; Draws is the authoritative metric until a real-GPU re-measure
   lands (wave 1 follow-up).
4. **Mergeable footprint.** New modules preferred; edits to shared files stay
   surgical and every touched integration point is listed in the wave report.
   Never commit to `pro-upgrade`/`main`; never merge (human-only, later).
5. **Quality bar.** Every new keyframe/state passes `quality/QUALITY_BAR.md`
   Lane B judged via deterministic showcase shots (`#spin=0`): differs in
   silhouette AND height AND color; s5 says "pick me"; premium-trailer standard.

## 1. Ground truth (verified 2026-09-11, file:line)

| Fact | Where |
|---|---|
| 18 crop archetypes × 6 stages (`<arch>-s0..s5`), 108 stage entries + `growth-demo` | `src/creative/crops/registry.ts:25-74` |
| 50 catalog crops mapped 1:1 with palette/scale/variant overrides | `src/creative/crops/map.ts:97-162`, `src/data/crops.ts` |
| `CropPalette`: young/mature/dark/light/stem/accent/fruit/unripe — NO stress/dead slots | `src/creative/crops/shared.ts:17-34` |
| Foliage ramp `foliage()` = mix(young, mature, stage/5); no in-builder stage interpolation | `shared.ts:36-41` |
| Template cache key `${cropName}|${stage}|${height.toFixed(3)}`, session-lifetime | `src/three/plants.ts:407` |
| One `InstancedMesh` per (crop, stage) template = 1 draw; material `MeshLambertMaterial({vertexColors:true})` shared per template | `plants.ts:411-416, 537-567` |
| Stress tint is BATCH-level: `applyStressTint` sets the shared material color from MAX cell stress | `plants.ts:425-463` |
| Per-instance Y growth via matrix (`growthScale`), batch tilt only (per-cell sway dropped) | `plants.ts:166-168, 478-485, 953-963` |
| `instanceColor` unused today; three r184 multiplies material.color × vertexColor × instanceColor (verified vs shader chunk order) | `package.json` (three 0.184.0) |
| `stageForBiomass = round(biomass×5)`; `gddGain = gdd×(1−0.6·maxStress)×(1+companionBonus)` | `src/lib/sim/drivers.ts:70-104` |
| `CellState`: moistureFrac, nitrogenKgHa, gddAccumC, biomassFrac, stage, floweringFrac, pestPressure, peakPestPressure, readyAtDay?, harvested?, stressSum?, stressDaysCount?, stress{water,heat,cold,nitrogen} | `src/lib/sim/types.ts:88-117` |
| Run growth coupling: `applyRunGrowth` builds progressByCell/stressByCell (max-of-terms + pest×0.8) | `src/components/world/World3D.tsx:528-562` |
| Moisture overlay (4 bands, day-keyed), fauna gating (floweringFrac), harvest particles, ghost overlay (snaps per day) | `World3D.tsx:1130-1226, 567-585, 209-323` |
| Weather FX/sky read the LIVE weather ref only — no run-env path exists | `World3D.tsx:616-634, 795-814` |
| Unmapped crop names fall back to legacy clone-per-cell procedural geometry | `plants.ts:528-532, 638-694` |
| Showcase: shell `showcase.html` + `src/creative/showcase/main.ts`; `showcase-ready N` after first frame; `#spin=0` deterministic | `main.ts:39-47, 196-205` |

## 2. Architecture — the projection pipeline

```
CellState + Crop + DailyEnvironment + dayIndex + cellKey
  →  PlantViewParams          (PURE — src/lib/sim/view.ts, no THREE imports)
  →  renderer consumes it in three cost tiers:
      Tier 1  per-instance channels   matrix (droop/lean, Y-scale) + instanceColor
      Tier 2  geometry state variants wilted-severe / dead / harvested / overripe
      Tier 3  per-crop phenology      bolting, die-back, tassel timing, age series
```

### 2.1 `PlantViewParams` contract

```ts
export type PlantLifecycle = 'alive' | 'dead' | 'harvested' | 'overripe';

export interface PlantViewParams {
  growth: number;        // continuous 0..1 (biomassFrac, possibly phenology-remapped)
  stage: number;         // resolved keyframe index 0..stageCount-1
  stageCount: number;    // per-archetype keyframe count (§2.4)
  lifecycle: PlantLifecycle;
  wilt: number;          // 0..1 → droop angle + canopy squash (Tier 1 matrix channel)
  tint: { r: number; g: number; b: number } | null;  // condition tint multiplier
  flowering: number;     // passthrough of floweringFrac (pollinator gating)
  variation: { hue01: number; bright01: number; lean01: number; scale01: number };
}

export function projectPlant(input: {
  cell: CellState; crop: Crop; env: DailyEnvironment;
  dayIndex: number; cellKey: string;
}): PlantViewParams;
```

Laws: pure (no globals, no clock, no engine writes); deterministic (`variation`
seeded from FNV-1a(cellKey) → mulberry32); framework-free (2D `renderPlan`
overlays reuse it in wave 5); total function over any CellState (missing
optional fields must not throw).

### 2.2 Tier model

- **Tier 1 — per-instance channels (zero extra draws).** `instanceColor` via
  `setColorAt` carries per-cell stress tint, maturity variation, genetic hue/
  brightness jitter; the instance matrix carries wilt droop/lean + squash on
  top of the existing growth Y-scale. Verified prerequisite: r184 multiplies
  `material.color × vertexColor × instanceColor`. **Migration rule:** when
  per-cell tint is active in run mode, the batch `applyStressTint` must reset
  template `material.color` to white (else tints compound); the legacy
  no-`stressByCell` path stays byte-identical.
- **Tier 2 — geometry state variants.** Coarse per-archetype poses —
  `wilted` (severe), `dead` (desiccated), `harvested` (stubble/empty),
  `overripe` (past-grace fruit) — as lazily-built templates keyed
  `${cropName}|${stage}|${state}|${height}`. States do NOT multiply every
  keyframe: each state is authored at the stages where it occurs (dead/harvest
  typically at final stage); reconcile is day-keyed like the moisture overlay.
- **Tier 3 — per-crop phenology specials.** Override table keyed by crop name
  (§2.5): extra keyframes, re-timed events, alternate silhouettes.

### 2.3 State definitions (derived channels — engine untouched)

| State | Derivation (provisional; tuned only in view.ts) |
|---|---|
| stress tint | effective stress `s = clamp01(max(water, heat, cold, nitrogen) + 0.8·pestPressure·(1−s))` mirroring `applyRunGrowth`; tint `(1, 1−0.35s, 1−0.55s)` |
| wilt | `wilt = smoothstep(0.35, 0.9, clamp01(water + 0.5·heat))` → droop angle 0…~14° + canopy squash 1…0.85 |
| dead | `cold ≥ 0.95` (hard frost) OR (`stressDaysCount ≥ 21` AND current effective stress ≥ 0.85) |
| overripe | `readyAtDay` defined AND `dayIndex > readyAtDay + graceDays` (default 7; tree fruit 21) |
| harvested | `cell.harvested === true` |
| precedence | harvested > dead > overripe > alive |

### 2.4 Keyframe counts (targets — "more keyframes, per-archetype")

The 6-stage global script becomes per-archetype. `growthToStage(arch, growth) =
round(growth × (count−1))`; the engine's 0..5 `stage` field is untouched (view
remaps biomassFrac onto the extended axis).

| archetype | count | archetype | count | archetype | count |
|---|---|---|---|---|---|
| tomato | 10 | cucurbit-vine | 10 | herb-clump | 6 |
| leafy-head | 8 | legume-trellis | 8 | herb-shrub | 6 |
| wheat | 8 | bush-bean | 8 | berry-bush | 8 |
| corn | 10 | strawberry | 8 | apple-tree | 10 |
| root-carrot | 8 | greens-open | 6 | mushroom | 6 |
| allium | 8 | brassica | 8 | potato | 8 |

Total 144 stage geometries vs 108 today (+33% crop-template memory; every wave
reports the resident-template delta). New keyframes must land where the wave-0
critics found cliffs: tomato stake/twine/flower pop-in (g03→g06), corn
sprout→stalk and tassel pop-in (g01→g06), all near-duplicate within-stage pairs.

### 2.5 Phenology override table (wave 3 scope)

Lettuce/cilantro bolting (flower stalk on leafy-head + herb-clump); potato
die-back as a STATE not a stage; allium tops-down at maturity; apple age
progression (young→scaffold→bearing); corn tassel/silk timing; de-clones —
pepper/eggplant vs tomato (fruit habit, architecture), sunflower vs corn
(head not tassel), squash-family fruit shape/ribbing + leaf lobing + vine habit.

## 3. Showcase scrub tool (shipped wave 0)

`showcase.html#mode=scrub&only=<arch,...>&spin=0` → per archetype: 12 growth
cells (continuous ramp: discrete stage swap + linear height scale, mirroring
plants.ts) + 6 state cells (healthy/stress/wilting/dead/harvested/overripe as
Tier-1 previews), sheet geometry, `showcase-ready 18·archetypes`. Implementation:
`src/creative/showcase/scrub.ts` (pure, deterministic, mirrors renderer math
with file:line notes). **Wave 1 replaces the local mirror with imports from
`src/lib/sim/view.ts`** so the tool previews the real pipeline, not a copy.

## 4. Waves & acceptance criteria

- **Wave 0 (this commit).** Branch cut; baseline gates green (typecheck/build/
  appshot); ASSETS.md corrected (50 crops, real coverage, scrub tool);
  scrub tool + this spec shipped; critic pass: tooling PASS (framing, no
  artifacts, lane B regression clean 109/109). Content REVISE items recorded
  below as wave 1–3 targets.
- **Wave 1 — projection + Tier 1.** `view.ts` pure module + tests-by-
  construction (determinism probe: same input twice ⇒ deep-equal); plants.ts
  consumes it; per-instance color (stress tint per cell + seeded variation)
  replacing batch-MAX tint in run mode; wilt matrix channel. Accept: two
  adjacent cells with different stress look obviously different in-world
  (screenshot evidence); plant-layer draws unchanged; determinism intact;
  farm-1 total draws ≤ ~287; scrub tool imports view.ts; legacy path
  byte-identical without run.
- **Wave 2 — Tier 2 states.** `CropPalette` stress/death slots; coarse
  geometry variants; state axis in template keys; day-keyed reconcile.
  Accept: full-run story legible end-to-end (day 0 / mid / harvest-ready /
  post-grace / harvested screenshots); critic PASS on new states (dead reads
  desiccated-brown BY HUE, overripe unmistakable vs healthy — the two wave-0
  failures); draw delta ≤ distinct (crop,state) pairs present; template-memory
  delta reported.
- **Wave 3 — phenology + de-cloning.** §2.5 table. Accept: a farmer can name
  the crop from the s4 silhouette alone (critic test on de-cloned crops);
  lifecycle reads as one continuous story per de-cloned crop (scrub sheets);
  QUALITY_BAR Lane B full pass including the s5 "pick me" fixes (corn blade
  arch + ear visibility, greens-open/potato/herbs/carrot/legume accents).
- **Wave 4 — world coupling.** Run `envSeries` day drives weather FX, sky
  mood, sway; bloom gated by floweringFrac; soil-pad separation (pad tint from
  moistureFrac via instanceColor); ghost easing if within perf contract.
  Accept: drought run looks like drought; day-by-day scrub coherent;
  live-weather fallback byte-identical when no run active.
- **Wave 5 — 2D parity + docs.** Blueprint overlays as opt-in RenderOptions
  flags default OFF; unmapped-crop fallback improved (kill the clone-per-cell
  regression); ASSETS/HANDOFF-style refresh; final full-lane critic pass;
  merge-readiness report.

## 5. Wave-0 critic findings carried forward (binding backlog)

1. **s5 "pick me" pass** (~9 archetypes): greens-open (no signal), potato,
   both herbs, bush-bean (green-on-green pods), carrot (shoulder sliver),
   legume-trellis (low-contrast pods), leafy-head/brassica (value-only shift +
   mutual confusion), corn (ear lost in pagoda column — needs arching blades
   AND open husk), tomato (muted red pop).
2. **Kill the staircase**: sub-stage morphs (leaf count, fruit size ramp,
   green→breaker→ripe fruit color) so growth reads as time-lapse, not 6 steps.
3. **State legibility floors** (Tier-1 placeholders set the bar): dead/harvested
   read instantly; stress 0.55 and overripe currently FAIL vs healthy — wave 1
   tint strength and wave 2 overripe geometry must clear "distinguishable at a
   glance in a field".
4. Confusion groups to separate at maturity: leafy-head vs brassica;
   bush-bean vs herb-clump vs greens-open.

## 6. Verification gates (every wave)

1. `npm run typecheck` && `npm run build` (three.js stays its own lazy chunk).
2. appshot GATE on `#/farms/1/map` and `/?ffview=world&ffdebug=1#/farms/1/map`
   (`--expect "Draws:"`); record Draws vs baseline 273.
3. Showcase: lane B sheet (`--expect "showcase-ready 109"`) regression + scrub
   sheets for every touched archetype; PNGs under `$TMPDIR/<wave-dir>/`.
4. Critic subagent PASS on all new/changed assets (verdict protocol per
   QUALITY_BAR.md §Verdict).
5. Determinism spot-probe for any new seeded channel.
6. Append dated `implementation-notes.md` entry; commit with descriptive
   message; report touched integration points.

## 7. Mission close — merge-readiness summary (2026-09-13)

All six waves green on `growth-visual-evolution` (cut from `pro-upgrade@6e23a98`,
five commits + wave 5). This branch is READY FOR HUMAN-DRIVEN MERGE; no agent
merges it.

**Merges cleanly into `pro-upgrade`** (expect zero textual conflicts if
`pro-upgrade` has not moved since `6e23a98`; if it has, the risk concentrates
in the shared files listed below):

- New modules (no merge risk): `src/lib/sim/view.ts`, `src/lib/sim/runWeather.ts`,
  `src/creative/crops/states/*` (18 files), `src/creative/crops/specials/*`
  (8 files), `src/creative/showcase/scrub.ts`.
- Shared-file edits the merger must expect (all surgical, per-wave diffs):
  `src/three/plants.ts` (largest: template state axis, per-instance color/
  wilt channels, pad instancing, custom-crop resolution), `src/three/sky.ts`
  (cloudCover01 in update), `src/components/world/World3D.tsx` (run weather
  bridge, vis demos, ghost easing, ghost template fallback),
  `src/components/designer/usePlanEditor.ts` + `DesignerToolbar.tsx` +
  `src/pages/PlotDesigner.tsx` (sim overlay channels/toggles + ffvis2d hook),
  `src/lib/renderPlan.ts` (three opt-in RenderOptions flags, default OFF),
  `src/creative/crops/map.ts` (buildMapping split + custom fallback),
  `src/creative/voxel.ts` + `crops/shared.ts` (pad flag + unit pad geometry),
  `tools/appshot.mjs` (Chrome `--timeout=25000` — keep it, it fixes busy-page
  captures), showcase/main.ts, quality/ASSETS.md + HANDOFF.md +
  implementation-notes.md (append-only entries).

**Behavioral contract the merger should verify after merge** (all
machine-assertable, commands in §6): no-run Draws stays 274; lane-B sheet
`showcase-ready 117`; blueprint PNG export unchanged (no sim overlays);
tomato scrub byte-identical ×2; `?ffvis2d=drought` probe reads
`ff-plan-channels day=25 m=414 s=414 r=52`.

**Deliberately left out** (recorded, not forgotten): authored >6-keyframe
axes beyond corn/apple (§2.4 table stays 6 for the rest — Tier-1 continuous
channels carry the time-lapse feel); ghost overlay still renders solid-stage
geometry (no view params/states — deferred since wave 2); stress-tint
strength at mid levels (backlog since wave 1); plant LOD/imposter system
(project-scale, see HANDOFF known limitations); sim-side tuning proposals
(summer-start baseline mass death, standing-ripe window length) — engine
numerics were never touched per the mission rules.
