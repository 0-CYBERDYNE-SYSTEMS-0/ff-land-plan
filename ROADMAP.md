# Roadmap — from simulator to digital twin

Status as of 2026-09-25 (`main` @ `8b2ad1a`). Written for incoming developer
teams: what the system honestly is today, and the gaps to close next, in
priority order. File references are clickable entry points, not the whole
story — read `CONTRIBUTING.md` and `AGENTS.md` first.

## Where we are

FarmFriend is a strong **farm planner + deterministic crop simulator** with a
polished 3D voxel world. It is **not yet a digital twin**: nothing observed on
the farm flows back into the model. The only real-world inputs today are
public weather/climate/soil APIs.

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

### P0 — Correctness bugs (small, do first) · `good first issue`

1. **Yield ignores plant spacing.** `src/lib/sim/engine.ts:296` and `:496` pay
   `yieldKgPerPlant` once per 25 cm cell. `plantsForArea`
   (`src/lib/plan.ts:86`) already converts area → plant count by spacing but
   the sim doesn't use it. Tomato (50×90 cm) is overcounted ~7×; garlic
   (5×18 cm) undercounted ~7×. Yield is the headline number.
2. **NaN on cold-window runs.** `gddRequiredC` (`src/lib/sim/drivers.ts`)
   returns `growthDays × meanDailyGddC`; a run window whose climatological
   mean GDD rounds to 0 (winter, cold site) gives `required = 0` → biomass
   `0/0 = NaN`. No guard at `src/lib/localApi.ts:289`. (Found by reading the
   code; add a failing test first to confirm.)

### P1 — Test harness · `help wanted`

3. **No tests exist.** Add Vitest and golden-output tests for the sim engine
   (baseline, drought, greenhouse, cold-window scenarios). The reducer is pure,
   so this is cheap — and it must land before any model retuning so changes
   are measurable.

### P2 — Model credibility · `help wanted: model`

4. **Growth timing is circular.** GDD required = catalog days × the site's
   *average* daily GDD, so every crop matures on its catalog schedule in an
   average year anywhere, any season. It can show deviation from normal, not
   site suitability. Base 10 °C is used for every crop (wrong for cool-season
   crops like lettuce, peas, brassicas). Fix: per-crop base temperature + GDD
   totals from agronomic literature, validated for 5–10 key crops.
5. **Enclosed surfaces have no climate.** `shelteredTemps`
   (`src/lib/sim/drivers.ts`) only attenuates the *scenario* ΔT, not the
   ambient climate — a January greenhouse is as cold as the field, minus rain.
   Need heating/cooling setpoints, a light (DLI) model, and humidity for
   greenhouse / indoor / warehouse surfaces.
6. **Two growth models disagree.** The default 3D view, NDVI and Monitoring
   use `src/lib/growth.ts` (calendar + fixed offset); sim runs use
   `src/lib/sim/`. Retire `growth.ts` or drive it from the sim engine so every
   view agrees.
7. **Known simplifications** worth revisiting: fixed 30 cm root depth for all
   crops; ET0 proxy without radiation when archive ET0 is missing; no light
   term in the sim; "May-start baseline runs chronically kill the field"
   (tuning, see `HANDOFF.md`).

### P3 — Close the loop (what makes it a twin) · `help wanted: twin data`

8. **Observation ingestion.** Sensor readings, field logs (planted on,
   harvested X kg, irrigated Y mm), optionally Sentinel-2 NDVI. Today sensors
   are manual entry only (`localApi.addReading`).
9. **Data assimilation.** Use observations to reset model state (soil
   moisture, crop stage) and track predicted-vs-observed error per farm.
10. **Backend.** All state is one localStorage blob; `src/lib/restApi.ts`
    exists behind `VITE_API_BASE_URL` but has never run against a live
    server. Needed once observations exist (durable storage, multi-device).
    Keep the `Api` interface, localApi, restApi and README endpoint list in
    sync.

### Also open

- Performance: plant LOD/imposters for large plans (Market Field: 8 FPS,
  18.6 M tris — see `HANDOFF.md`).
- Offline weather fallback has no automated test.
- No linter configured (`npm run typecheck` is the gate).

## Proposing data sources

Use the **Data source proposal** issue template. Sources must be keyless or
self-hostable, CORS-friendly (or proxied by the backend), and license-compatible;
record attribution in `README.md`. Note Open-Meteo's free API is
non-commercial only.
