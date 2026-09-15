# SPEC — Environments Beta Hardening

Status: active · Owner: lead (3-specialist rotation) · Target: beta release
Branch: `feat/environments-beta-hardening`

## Mission (one sentence)

Make the environments layer beta-credible: the simulation must respect enclosures
consistently (backend↔frontend seam), shells must render efficiently and read as
real structures, and the World view must be CI-gated and crash-proof.

## Why (findings driving this spec)

Three discovery passes (2026-09-15) converged on the same conclusion: the
environment *plumbing* shipped (MISSION-ENVIRONMENTS gates all PASS), but the
seam is only skin-deep and the safety net around it is hollow.

1. **Sim shelters temperature-stress only.** `gddGain` consumes the raw
   scenario-shifted `env.gddBase10C` (`src/lib/sim/engine.ts`), so a warehouse
   under a +6 °C heatwave accumulates biomass at ~outdoor pace while its stress
   terms say "barely notices". Precipitation and ET0 are also unsheltered in the
   new engine — sealed halls collect rainfall; the legacy path
   (`simLegacy.scenarioAdjust`) shelters precip, so the two engines disagree.
2. **Shell rendering has correctness + efficiency defects.** Small canvases
   (2–4.9 m) get 5 m-minimum walls; shell meshes never cast shadows so the sun
   ignores every enclosure; the greenhouse renders all four transparent walls
   (overdraw, dollhouse-discipline violation); every brush dab detaches and
   re-attaches the cached shell; NaN dims would poison the module cache.
3. **The beta safety net is hollow.** CI never renders the World view at all
   (only the 2D map + showcase); `appshot --gate` prints GATE INCONCLUSIVE and
   **exits 0** when the probe is missing (fails open); a shell exception in the
   prod build white-screens with no ErrorBoundary anywhere; a localStorage quota
   error silently converts persistent work to in-memory-only (driven by
   unbounded `simRuns`, each holding a full season envSeries); a corrupt store
   blob silently reseeds.

## Workstream A — Sim shelter correctness (engine.ts + drivers.ts)

**Design: shelter at ingestion, once per day.** New pure helper in
`src/lib/sim/drivers.ts`:

```ts
effectiveEnvironmentForSurface(env: DailyEnvironment, surface: PlanSurface): DailyEnvironment
```

- `outdoor` → returns `env` **by reference** (zero behavior change, zero alloc).
- Enclosed → `{ ...env }` with:
  - `tMinC/tMaxC` = existing `shelteredTemps` (semantics UNCHANGED — attenuates
    scenario ΔT only; mission-compliant, frost gates keep passing);
  - `gddBase10C` recomputed from those temps with the exact `environment.ts`
    formula `max(0, (tMin+tMax)/2 − 10)` → fixes the **P0** (GDD pace now
    consistent with stress);
  - `precipMm = 0` — roofs are roofs: rain never enters an enclosure; enclosed
    runs are irrigation-driven (**design decision**, supersedes legacy
    scenario-only precip attenuation; documented divergence);
  - `etoMm × SURFACE_ET_FACTOR` (new table: outdoor 1, greenhouse 0.85,
    hoophouse 0.9, tent 0.75, indoor 0.6, warehouse 0.6 — beta approximation
    for reduced wind/VPD under enclosure, documented).
- `engine.stepDay` computes `effEnv` once and feeds **every** consumer from it:
  bucket moisture, `waterInMm`/N-leach, N-mineralization tMean, uptake demand,
  `gddGain`, pest-pressure fields, ET0 stats.
- `simulateRun` summary accumulates `rainMm`/`etoMm` from the **effective**
  env (a warehouse run reports 0 rain — the world the run lives in).

Out of scope (deferred, documented): CEA setpoints (CO₂/RH/photoperiod),
passive-solar gain term for hoophouses, restApi server-side replay parity
(unverifiable in-repo; README contract line stands).

## Workstream B — Shell rendering + memory (shell.ts, kit.ts, shells.ts, World3D.tsx)

1. `buildShell` becomes idempotent: cache hit whose root is **already attached
   to this scene** returns immediately (no detach/reattach churn per dab);
   World3D's planVersion effect drops its pre-`disposeShell` and just calls
   `buildShell`. `disposeShell` keeps unmount semantics; new `releaseShellCache()`
   fully frees the cached shell on World3D unmount (GPU memory bounded when the
   view is left).
2. NaN/zero-dim guard in `buildShell` → return null, never cache.
3. `kit.solidMesh` sets `castShadow`/`receiveShadow` — enclosure walls shade the
   interior at low sun angles (glass/film panes stay transmissive; glow meshes
   stay unlit; sky.ts still owns THE light — no new lights).
4. `shellVoxels` min clamp 50→20 vox (matches `MIN_DIM_M = 2`) so shells hug
   small canvases; makers must stay proportional — any absolute-vox assumption
   found in a maker gets made proportional or that maker keeps its clamp.
5. Greenhouse drops near-face (+X/+Z) panes per the existing dollhouse
   discipline (overdraw ↓, interior visible).
6. Warehouse: roll-up door + translucent skylight strips (reads as a hall, not
   a truss field; occludes open top at oblique angles).

Deferred: tent double-skin restyle, vertex-color light pools, interior prop
rows, camera-inside wall fading, wiring dioramas into the designer palette.

## Workstream C — Beta robustness (appshot, ci.yml, store, localApi, Weather page)

1. `tools/appshot.mjs`: `--gate` with missing probe → **exit 1** (fail closed);
   message points at dev-build requirement.
2. `ci.yml`: three World-view smoke shots — `/?ffview=world#/farms/1/map`,
   `#/farms/8/map`, `#/farms/9/map` — all `--gate --expect "Plot Designer"`.
   **Budget tuning (measured, 2026-09-15):** World3D renders continuously, so
   a large virtual-time budget (`--vt 25000`) forces thousands of
   software-GL frame sims before the DOM dump — 2-core CI runners starve
   before it arrives and the gate fails open-looking. Final design:
   `--vt 600` (~37 simulated frames, still covering the World3D init path
   where its runtime errors live), `FF_SHOT_TIMEOUT_MS=90000` (lazy
   three.js module graph load on slow runners), `FF_SHOT_SPAWN_MS=420000`
   (hard SIGKILL + process-tree reaper). Per HANDOFF trap 10, gate lines
   outrank PNG.
3. ErrorBoundary around World3D's rendered tree + try/catch around shell build
   in both effects — a shell exception degrades to a visible panel, not a white
   screen.
4. `store.ts`: corrupt JSON quarantined under `<key>:corrupt` with a loud
   `console.error` instead of a silent reseed.
5. `localApi.ts`: `simRuns` capped (newest 40), sensor readings capped per
   sensor (newest 500) — removes the main localStorage-quota driver.
6. Weather page: enclosed-surface farms get a context banner ("outdoor
   readings shown for context; sim water balance is irrigation-driven").

Deferred: quota-failure toast UI, adaptive quality tiers/LOD, live restApi
integration smoke.

## Verification gates

1. `npm run typecheck` (strict, noUnusedLocals) — primary gate.
2. `npm run build`.
3. Headless smoke (dev server): map farm 1 `--gate --expect "Plot Designer"`;
   world farms 1/8/9 `--gate --expect "Plot Designer" --vt 25000`; showcase
   `--expect "showcase-ready"`.
4. Sim sanity: warehouse run under +6 °C heatwave scenario shows GDD pace
   ≈ raw climate and 0 mm rain; outdoor run byte-identical to before (spot
   check a farm-1 sim run summary).

## Risks & rollback

- ET factors and precip-zeroing are modeling choices — single-table constants,
  trivially tunable; behavior deltas confined to enclosed surfaces.
- `castShadow` on shell walls could expose shadow-map gaps — verified via world
  shots; revert = delete two flags.
- CI world shots may flake under SwiftShader — gate lines are authoritative;
  a flaky shot is retried before blocking merge.
