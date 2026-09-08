# SPEC: Living-Ecosystem Simulation Engine ("Sim Core")

Status: **PROPOSAL** (analysis + architecture; nothing here is implemented yet).
Authored 2026-09-08 from a two-agent deep audit of all sim/growth logic and the
3D world + data seams. Companion to `SPEC-WORLD-HUD.md`; binds to the traps in
`HANDOFF.md` and `implementation-notes.md`.

---

## 0. Product thesis (why this spec exists)

The program is a **digital twin of an exact farm built for experimentation**.
That thesis implies four hard requirements, and today's code satisfies none of
them end-to-end:

1. **Farm-anchored** — sim outcomes must derive from THIS farm's real data
   (plan, location weather, soil, climate), not generic arithmetic.
2. **Massively manipulable** — the user can perturb anything (weather, water,
   nutrients, genetics, management, surfaces) at global, zone, and cell level.
3. **Visually legible provenance** — every number shown traces to its source;
   the user can always answer "why did this happen?".
4. **Alive in the 3D world** — growth and ecosystem dynamics play out over
   minutes of real time (days of sim time), continuously observable.

---

## 1. Grounding: what actually runs today (audit findings)

### 1.1 There are two "simulations" and they don't know each other

- **Simulations page** (`src/pages/Simulations.tsx` + `createSimulation` in
  `src/lib/localApi.ts:235-274`) is **farm-blind slider arithmetic**: hardcoded
  `baseYield = 30`, no read of `state.plans`, crop catalog, or lat/lng. Two
  different farms produce byte-identical results. Radar-chart axes use
  arbitrary normalizations (`(profit+500)/15`). This was flagged as F2 in
  `quality/MISSION-TWIN.md` and is still true.
- **World3D playback** (`src/components/world/World3D.tsx:607-672` +
  `SimDrawer.tsx`) is the real seed of the twin: a scrub clock ticking 1/7/30
  sim-days per real second, driving discrete stage swaps through instanced
  plant meshes, with a per-crop progress drawer and live-weather footer.

### 1.2 The growth model is memoryless closed-form

`src/lib/growth.ts` — progress = `(now − plantedAt) × rate / growthDays`
clamped to 0..1; stage = `round(progress×5)`. Rate/stress from sheltered
scenario ΔT + precip multiplier + fertilizer units. Consequences:

- **Nothing accumulates.** No GDD sum, no water bucket, no biomass, no
  nitrogen pool, no pest pressure. The world has no memory; droughts don't
  carry over; soil can't deplete. A "living ecosystem" is impossible in this
  shape — it must be re-derived, not grown.
- **Rate is applied retroactively** (scenario flip mid-playback makes crops
  visibly *shrink*; progress is non-monotonic).
- **Weather inside playback is fake**: scrubbing to any date reuses *today's*
  ambient temp; there is no daily environment series.

### 1.3 Expensive real-world data is built but dead in the sim path

| Module | Contents | Consumed by sims today |
|---|---|---|
| `src/lib/climate.ts` (ERA5 normals) | growing-season baseline temp, **annual GDD base-10**, annual precip, median frost dates | **No callers exist.** Baseline silently defaults to 20 °C for every farm on Earth (`growth.ts` `DEFAULT_BASELINE_TEMP_C`) |
| `src/lib/soil.ts` (USDA SDA/SSURGO + SoilGrids) | texture, pH, OM%, CEC, **AWC mm/cm** | Weather-page card only. No model reads pH/AWC → no water-bucket model is possible without wiring this |
| `src/lib/weather.ts` (Open-Meteo) | real soil temp/moisture, hourly history, 7-day forecast | Only `ambientTempC` reaches the stress term; moisture/forecast are display-only |
| catalog agronomy fields | `nitrogenNeed`, `yieldKgPerPlant`/`yieldTonHa`, `frostTolerance`, companions/antagonists | Ignored by growth; companions are blueprint-overlay only |

Soil/climate cache forever in localStorage and never throw — they are ready to
be consumed by a sim engine with zero new fetch machinery.

### 1.4 Persistence & state seams favor replay over snapshots

- `clonePlan` (`usePlanEditor.ts:98-103`) is copy-on-write of the sparse maps
  → **forking a what-if plan branch is nearly free** (proven by the 50-entry
  undo stack). But `farmId` is the storage key and the `Api` seam has no fork
  endpoints; persisted forks need an out-of-band store (`simRuns`).
- One localStorage blob `ff-pro:v1`, full `JSON.stringify` per persist,
  ~5 MB budget → **never store tick-by-tick state; store inputs + seed +
  environment series and replay deterministically** (a season replay is
  milliseconds of arithmetic). Demo farms re-seed every load — run records
  must not live inside seeded plans.
- No `Math.random` in sim code today (only visual FX) — keep it that way;
  determinism is what makes replay-as-storage work.

### 1.5 3D render path constraints (perf-critical)

- Any edit → `planVersion` effect rebuilds **everything** below the sky;
  the growth effect (`World3D.tsx:564-577`) rebuilds only plants — but
  `updatePlants` is still **dispose-all + rebuild-all**, and its (crop,stage)
  template cache is per-build, so every tick re-merges voxel geometry
  (`plants.ts:488-499`). Affordable at today's 1 Hz ticks; it will **collapse**
  under a multi-tick-per-second living sim. Measured ceiling: 4,000-cell farm
  = 8 FPS / 18.6 M tris (`HANDOFF.md:82-90`).
- What makes continuous growth cheap: geometry templates are **base-anchored
  at y=0** (`plants.ts:429-433`), so per-instance matrix scale grows a plant
  smoothly from the ground with **zero rebuilds**. Day/night cycling already
  runs rebuild-free every frame via `timeRef` + sky.
- rAF-loop law: everything the loop reads must be a ref (`weatherRef`
  pattern); init effect deps are frozen at `[sceneReady, farmId]`; hidden tabs
  pause rAF while `setInterval` keeps firing (today's clock desyncs).
- Ground template cache is destroyed by every `disposeGround` call
  (`ground.ts:263-272`) — unlike structures, whose template cache survives.
  Plants deserve the structures treatment.

### 1.6 Smaller verified defects worth fixing on the way

- `GrowthFX.celebrate()` is **never called** (dead harvest moment).
- Season auto-pause false-positives: cells without `plantedAt` read as mature
  (`growthProgress` returns 1) → "all mature" fires on first tick for
  date-less plans (`World3D.tsx:647-672`).
- Drawer progress rows dedupe by cropId → same crop planted on two dates shows
  only the first cell's progress (`World3D.tsx:697-699`).
- `SCENARIOS` (`growth.ts:13-19`) and `PRESETS` (`Simulations.tsx:50-56`) are
  duplicate tables kept in sync by comment.
- Monitoring's soil-moisture/nitrogen stats read legacy seeded noise
  (`data/seed.ts`), disconnected from anything.

---

## 2. Design space — two candidate architectures (designed twice)

**Candidate A — "Projection" (memoryless, declarative).** Keep growth
closed-form; add a `SimClock`, a daily `EnvironmentSeries` composer, and a
provenance layer. The world remains a pure projection:
`world(date) = f(plan, env(date), scenario)`. Cheapest; preserves today's
mental model; trivial scrubbing in both directions. **Fatal flaw vs the
thesis:** no state ⇒ no memory ⇒ no depletion, carryover, hysteresis,
populations, or nutrient dynamics. It is a time-lapse *viewer*, not a living
ecosystem. Rejected as the end state.

**Candidate B — "Integrated runs" (stateful, event-sourced).** A
deterministic daily tick engine holds living state (per-cell water bucket,
GDD accumulators, nitrogen pool, stress memories, creature populations) and
integrates it day by day under a composed environment series and an explicit
intervention schedule. Runs are forked experiments over a cloned plan;
persistence = config + seed + environment series + summary, replayed on load.
**Cost:** new state lifecycle, fork management, renderer reconcile path.
**This is the only candidate that satisfies "living ecosystem."**

**Synthesis decision: B's engine, A's discipline.** The *renderer* stays a
pure projection — it never owns sim state, it reads `simStateRef` (the
`weatherRef` pattern) and reconciles. The closed-form model survives as a
compatibility shim for non-run surfaces (Calendar, blueprint overlays) until
they migrate. Quick slider what-ifs become *presets that spawn runs*, so the
farm-blind `createSimulation` arithmetic is deleted rather than parallel-kept.

---

## 3. Architecture

### 3.1 Layering (module map)

```
src/lib/sim/
  types.ts         SimState, CellState, DailyEnvironment, Intervention,
                   RunConfig, RunRecord, SimEvent, EnvSourceTag
  environment.ts   envFor(date): real archive/forecast → ERA5 normals →
                   scenario deltas → defaults; every value carries an
                   EnvSourceTag; composes + persists the run's daily series
  engine.ts        createRun / stepDay — pure reducer, seeded PRNG keyed
                   (seed, dayIndex, cellKey); NO Math.random; structural
                   sharing; returns events per day
  soil-water.ts    daily bucket: precip + irrigation − ET(Kc by stage, temp)
                   clamped by AWC from SoilProfile; drought carryover
  nutrients.ts     N pool: OM mineralization (soil OM%) + fertilizer
                   interventions − crop nitrogenNeed uptake; deficit stress
  drivers.ts       GDD accumulation → stage/biomass; stress aggregation;
                   companion/antagonist neighbor term; flowering fraction
src/hooks/useSimRun.ts        run lifecycle: fork plan, tick from rAF dt,
                              simStateRef, play/pause/speed/scrub, events
src/three/plants.ts           reconcile path: persistent (crop,stage)
                              template cache + per-instance diff + per-frame
                              Y-scale interpolation (see 3.4)
src/components/world/SimDrawer.tsx → RunInspector (transport + provenance)
AppState.simRuns: RunRecord[] (additive; store.ts load() merges shape)
```

### 3.2 Core data model (sketch — caller's usage first)

```ts
// USAGE:
//   const run  = createRun({ farmId, basePlan: clonePlan(plan), startDate,
//                            seed: 1, scenario, interventions });
//   // hook ticks from rAF dt (never setInterval):
//   const { state, events } = stepDay(run.state, envFor(date), run.config, { soil });
//   simStateRef.current = state;              // rAF + inspector read this
//   reconcilePlants(state);                   // 3D, diff-based, no rebuild
//   // persistence: saveRunRecord({ config, envSeries, summary }) → replay on load

export type EnvSourceTag = 'open-meteo-archive' | 'open-meteo-forecast'
                         | 'era5-normals' | 'scenario-delta' | 'default';

export interface DailyEnvironment {
  date: string; tMinC: number; tMaxC: number; precipMm: number; etoMm: number;
  gddBase10C: number;
  provenance: { tMinC: EnvSourceTag; tMaxC: EnvSourceTag; precipMm: EnvSourceTag };
}

export type Intervention =
  | { kind: 'irrigate';  date: string; cells?: string[]; zone?: string; mm: number }
  | { kind: 'fertilize'; date: string; zone?: string; nKgHa: number }
  | { kind: 'plant';     date: string; cell: string; cropId: number }
  | { kind: 'harvest';   date: string; cell: string }
  | { kind: 'surface';   date: string; surface: PlanSurface }   // greenhouse etc.
  | { kind: 'weather';   fromDate: string; tempDeltaC?: number; precipMul?: number };

export interface CellState {
  cropId?: number; plantedAtDay?: number;
  moistureFrac: number;          // 0..1 of AWC bucket  ← the living memory
  nitrogenKgHa: number;
  gddAccumC: number; biomassFrac: number; stage: number;
  floweringFrac: number; pestPressure: number;
  stress: { water: number; heat: number; cold: number; nitrogen: number };
}

export interface SimState {
  dayIndex: number;
  cells: Record<string, CellState>;      // sparse, planted cells only
  creatures: Record<string, number>;     // pollinators/pests/birds populations
  events: SimEvent[];                    // day-stamped: harvest-ready, stress
                                         // onset, outbreak, frost hit, …
}

export interface RunRecord {              // what localStorage holds — tiny
  id: string; farmId: string; label: string;
  config: RunConfig;                      // forked plan + scenario + interventions + seed
  envSeries: DailyEnvironment[];          // frozen provenance artifact ⇒ stable replay
  summary: RunSummary;                    // yields, water used, stress-days, events
  status: 'running' | 'complete';
}
```

**Why envSeries is persisted:** forecast-backed runs replayed next week would
otherwise read different data for the same dates. Freezing the composed daily
series makes replay exact *and* doubles as the provenance record.

### 3.3 Provenance as a first-class surface (requirement 3)

- Every driver value carries an `EnvSourceTag`; UI renders it as the chip
  pattern that already exists (weather "cached" badge, `SoilProfileCard`
  source badge) — nothing new to invent, just applied everywhere.
- **RunInspector** (evolution of `SimDrawer`): timeline with intervention +
  event markers; click a crop/cell → a "why" card: today's GDD gain, bucket
  level vs AWC, N pool, and each stress term with the causing number
  ("34 °C > max 32 °C → heat +0.2").
- Overlay layers follow the `RenderOptions` opt-in flag precedent:
  moisture heat-tint, stress tint (exists), GDD progress. Overlays render via
  merged geometry per value bucket to respect the draw budget (<80 draws
  standing decision, `HANDOFF.md:143-147`).
- Run summary charts replace the radar's arbitrary normalizations; cards link
  "Open in world" instead of persisting opaque JSON.

### 3.4 3D time-lapse (requirement 4) — the three clock rule

- **Real time** (rAF dt) → **sim time** (day accumulator in the hook; pausing
  with the tab, killing the setInterval desync) → **visual time** (per-frame
  interpolation *within* a stage via instance-matrix Y-scale; stage swaps stay
  discrete).
- Plants get the structures treatment: a **persistent (crop, stage) template
  cache** that survives rebuilds, and `reconcilePlants(state)` that diffs
  per-cell stage assignments and rewrites only changed instance matrices.
  This is the hard prerequisite — without Phase 0 it, any ticked sim falls
  off the measured perf cliff.
- Sim state reaches rAF exclusively via `simStateRef`; HUD chrome via
  throttled state sync (200 ms pattern already in place).
- Live ecosystem dressing (bees at floweringFrac, birds, rain response) plugs
  into the existing animals/weather-FX update hooks, population counts from
  `SimState.creatures` — no new per-frame allocations.

### 3.5 What becomes of the old model

- `growth.ts` closed-form stays for Calendar + blueprint overlays (shim), but
  the twin, the drawer, and run summaries read run state. GDD replaces
  calendar-days as the progression driver (climate.ts already computes it).
- `createSimulation` slider arithmetic is **deleted**; the Simulations page
  becomes a run manager (presets spawn runs; comparison reads run summaries).
- The season auto-pause/all-mature logic is replaced by run lifecycle events
  (harvest-ready events, run end at season boundary or user stop).

---

## 4. Phasing (each phase shippable, typecheck-gated)

- **Phase 0 — Perf & clock foundations (prerequisite).** Persistent plant
  template cache + `reconcilePlants`; sim clock from rAF dt; wire climate
  baseline into growthCtx (kills the invisible 20 °C-everywhere default);
  fix retroactive-shrink by making playback monotonic; fix all-mature false
  positive + drawer dedupe. No user-visible behavior change beyond correctness.
- **Phase 1 — Engine + runs.** `environment.ts` composer, `engine.ts` with
  GDD + water bucket (soil.ts AWC wired in), `useSimRun`, RunInspector
  transport, `simRuns` persistence via envSeries replay. Stage progression
  now integrates daily reality instead of calendar arithmetic.
- **Phase 2 — Provenance UX.** Source chips everywhere, "why" cards,
  intervention timeline, moisture/stress overlay layers, run summary charts.
- **Phase 3 — Ecosystem depth.** Nitrogen pool + fertilizer interventions,
  companion/antagonist neighbor terms, flowering→pollinator populations,
  pest pressure, harvest events (finally firing `celebrate()`), yield
  accounting into summaries + Calendar.
- **Phase 4 — Experimentation.** Multi-run A/B with ghost overlay of a branch
  in the world (historyViz precedent), side-by-side comparisons, experiment
  = named set of runs sharing a base plan.

## 5. Traps this design must respect (audit-verified)

| Trap | Design response |
|---|---|
| Init effect deps frozen; whole-scene rebuild per planVersion | Sim state flows through refs; runs fork plans at start, never edit live plans |
| `updatePlants` dispose-all per tick | Phase 0 reconcile path is a hard prerequisite |
| Hidden tabs: rAF pauses, setInterval doesn't | Sim clock accumulates rAF dt only |
| localStorage ~5 MB, whole-blob rewrites | Persist config + envSeries + summary; replay for state |
| Single-sun law (sky.ts owns directional) | Ecosystem lighting effects must be non-directional or won't ship |
| No `Math.random` in sim code | Seeded PRNG keyed (seed, dayIndex, cellKey) |
| All plan writes through `usePlanEditor` | Interventions mutate SimState inside the run, never PlanState |
| QueryClient `staleTime: Infinity` + hostile default queryFn | New env queries pass explicit queryFn + staleness |
| Custom crop ids ≥1000 never renumbered; templates map by NAME | Run records store cropIds; unmapped names fall to procedural geometry (existing fallback) |
| Api seam has 3 implementations to keep in sync | `simRuns` endpoints added to the `Api` interface + localApi + restApi together (README contract) |

## 6. Open questions (user decisions, not blockers for Phase 0–1)

1. Granularity: per-cell living state vs per-bed/zone buckets first (perf vs
   fidelity)? Sketch assumes per-cell sparse; zone aggregation is a small
   later change.
2. Retire the Simulations page's instant mode entirely (recommended: yes) or
   keep it clearly labeled as a rough estimate?
3. Multi-season/rotation remains out of scope (SPEC.md:159-162) — confirm the
   perennial story (apple = 3 seasons of accumulation) is acceptable for v1.
4. Rest-world data (restApi) — do server-backed runs matter soon, or does the
   localStorage seam own runs for now (recommended: local-first, mirror later)?
