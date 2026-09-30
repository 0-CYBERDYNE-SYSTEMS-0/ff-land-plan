# Roadmap — from simulator to digital twin

Status as of 2026-09-30 (`main` @ `7a7640d`). Written for incoming developer
teams: what the system honestly is today, and the gaps to close next, in
priority order. File references are clickable entry points, not the whole
story — read `CONTRIBUTING.md` and `AGENTS.md` first.

## Where we are

FarmFriend is a strong **farm planner + deterministic crop simulator** with a
polished 3D voxel world. It is **not yet a digital twin**: nothing observed on
the farm flows back into the model. The only real-world inputs today are
public weather/climate/soil APIs.

### Sim mode and twin mode: one engine

The sim and the twin are not two codebases. The twin is the same deterministic
engine with an observation layer on top:

- **Sim mode (today).** `(config, envSeries)` → run. Used for planning and
  what-if scenarios (drought, planting date, greenhouse). Already built.
- **Twin mode (not built).** Observations (sensors, field logs, optional
  Sentinel-2 NDVI) correct the model's state, and predicted-vs-observed error
  is tracked per farm. A farm with no observations simply runs as plain sim.
- **Seams that exist.** Field-log style events (`irrigate`, `fertilize`,
  `plant`, `harvest`) are already replayable `Intervention`s
  (`src/lib/sim/types.ts`), so ingesting field logs mostly means feeding that
  list. Nothing in `src/` yet handles observations or state correction
  (soil moisture, crop stage); that needs a new event kind plus a documented
  reducer rule, and must keep "same inputs ⇒ same run" (observations are
  stored data, like config and weather).
- **Order matters.** Correcting an uncredible model is not meaningful, so the
  P2 model work (#52–#54) comes before P3 assimilation (#57).

### Solid foundations (build on these)

- **Architecture.** One `PlanState`, one data seam (`src/lib/api.ts`), one
  mutation seam (`usePlanEditor.ts`), a pure daily-tick sim reducer
  (`src/lib/sim/engine.ts`). Replay is the storage: same config + env series ⇒
  byte-identical run. No `Math.random` in sim/creative code.
- **Real environmental inputs.** Open-Meteo forecast + ERA5 archive for past
  dates, 10-year climate normals for future dates, labelled synthetic
  fallback offline. Every env day carries a source tag.
- **Legitimate simple crop model.** FAO-56-shaped soil water bucket per cell,
  GDD-driven growth, nitrogen pool (mineralization/uptake/leaching),
  keyed-random pest pressure, companion/antagonist neighbor effects.
- **Honest UI.** Monitoring and NDVI are labelled as plan-based model
  estimates, not telemetry.

## Gaps to close (priority order)

### P0 — Correctness bugs · complete

1. **Yield ignored plant spacing — fixed 2026-09-30 (#49, PR #59).**
   `stepDay` (`src/lib/sim/engine.ts`) now spreads each crop's whole-area
   `plantsForArea` count (`src/lib/plan.ts`) over its occupied cells, on both
   the manual and auto-harvest paths. Per-cell payouts stay unrounded and only
   the aggregate is rounded, so 100 ready tomato cells total 58.5 kg and 100
   garlic cells 17.5 kg (`engine.yield.test.ts`).
2. **NaN on cold-window runs — fixed 2026-09-30 (#50, PR #61).** `gddRequiredC`
   (`src/lib/sim/drivers.ts`) floors required GDD at 1 °C·day when the window's
   climatological mean is 0 (`engine.cold.test.ts`).

### P1 — Test harness · complete

3. **Sim test harness — added 2026-09-30 (#51, PR #61).** Vitest
   (`npm test`, `vitest.config.ts`) runs in CI. `engine.golden.test.ts` holds
   fixed-output snapshots (`src/lib/sim/__snapshots__/`) for the baseline,
   drought, greenhouse and cold-window scenarios on synthetic weather (no
   network). Model changes must show up as a reviewed snapshot diff
   (`npx vitest run -u`, then read the diff), never as a silent regeneration.
   Still untested: the offline weather fallback.

### P2 — Model credibility · `help wanted: model`

4. **Growth timing is circular (#52).** GDD required = catalog days × the site's
   *average* daily GDD, so every crop matures on its catalog schedule in an
   average year anywhere, any season. It can show deviation from normal, not
   site suitability. Base 10 °C is used for every crop (wrong for cool-season
   crops like lettuce, peas, brassicas). Fix: per-crop base temperature + GDD
   totals from agronomic literature, validated for 5–10 key crops. A cited
   reference table now exists (`src/data/cropThermalParams.ts`, 9 crops, PR
   #60) but is **not wired into the sim yet**; the wiring plan is in
   `implementation-notes.md` (2026-09-30). Expect golden-snapshot changes.
5. **Enclosed surfaces have no climate (#53).** `shelteredTemps`
   (`src/lib/sim/drivers.ts`) only attenuates the *scenario* ΔT, not the
   ambient climate — a January greenhouse is as cold as the field, minus rain.
   Need heating/cooling setpoints, a light (DLI) model, and humidity for
   greenhouse / indoor / warehouse surfaces.
6. **Two growth models disagree (#54).** The default 3D view, NDVI and Monitoring
   use `src/lib/growth.ts` (calendar + fixed offset); sim runs use
   `src/lib/sim/`. Retire `growth.ts` or drive it from the sim engine so every
   view agrees.
7. **Known simplifications (#55)** worth revisiting: fixed 30 cm root depth for all
   crops; ET0 proxy without radiation when archive ET0 is missing; no light
   term in the sim; "May-start baseline runs chronically kill the field"
   (tuning, see `HANDOFF.md`).

### P3 — Close the loop (what makes it a twin) · `help wanted: twin data`

8. **Observation ingestion (#56).** Sensor readings, field logs (planted on,
   harvested X kg, irrigated Y mm), optionally Sentinel-2 NDVI. Today sensors
   are manual entry only (`localApi.addReading`).
9. **Data assimilation (#57).** Use observations to reset model state (soil
   moisture, crop stage) and track predicted-vs-observed error per farm.
10. **Backend (#58).** All state is one localStorage blob; `src/lib/restApi.ts`
    exists behind `VITE_API_BASE_URL` but has never run against a live
    server. Needed once observations exist (durable storage, multi-device).
    Keep the `Api` interface, localApi, restApi and README endpoint list in
    sync.

### Also open

- Performance: plant LOD/imposters for large plans (Market Field: 8 FPS,
  18.6 M tris — see `HANDOFF.md`).
- Offline weather fallback has no automated test (Vitest is now available).
- No linter configured (`npm run typecheck` is the gate).

## Proposing data sources

Use the **Data source proposal** issue template. Sources must be keyless or
self-hostable, CORS-friendly (or proxied by the backend), and license-compatible;
record attribution in `README.md`. Note Open-Meteo's free API is
non-commercial only.
