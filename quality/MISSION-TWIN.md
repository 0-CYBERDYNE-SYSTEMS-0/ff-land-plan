# MISSION TWIN — Make the Simulation a Real Digital Twin

Goal: close the gap between "farm app with a weather feed" and "digital twin":
the What-If simulation must simulate **THE farm** (its plan, crops, location,
live + historical weather), the 3D growth model must run on the farm's actual
climate instead of a hardcoded constant, soil baselines must come from real
open soil data, and Monitoring must stop presenting decorative numbers as
instrument readings.

Written by mission control 2026-09-03, from source inspection at HEAD
`9f1bf11` on `pro-upgrade`. Every gap below was **verified in source**, not
speculated. Companion research (open-data API verification) lands in the
Appendix at the bottom.

---

## Digital-twin fidelity audit (evidence)

### What is genuinely real today

| Capability | Evidence | Verdict |
|---|---|---|
| Live weather (current, hourly soil temp/moisture, 7-day forecast) | `src/lib/weather.ts` — Open-Meteo, keyless, CORS; 15-min memo + last-good localStorage cache | REAL |
| Weather-derived alerts | `deriveAlerts()` in `weather.ts` — frost/heat/flood/drought thresholds over the real forecast | REAL |
| Live weather drives 3D atmosphere (clouds, rain FX, audio, plant sway) | `src/three/weather-fx.ts`, ref-plumbed rAF (beta mission) | REAL (visual) |
| Growth-stage model uses real catalog agronomy | `src/lib/growth.ts` — per-crop minTempC/maxTempC/waterNeedMmDay/growthDays; surface shelter factors | REAL MODEL, WRONG INPUTS (see F1) |
| Frost-date defaults | `src/lib/frost.ts` — documented latitude heuristic, user-overridable | HONEST HEURISTIC (upgradeable, see F4) |

### The fake / disconnected layer

**F1 — Growth baseline is a constant, not the farm's climate.**
`src/lib/growth.ts:22` — `BASELINE_TEMP_C = 20`. Every scenario temperature is
`20 + tempDelta × shelter`, regardless of whether the farm sits in Oslo or
Seville. The live weather we already fetch never modulates plant growth: a
heatwave, a cold snap, or a drought week in the REAL forecast leaves the twin's
plants untouched. The world's "simulation HUD" (`World3D.tsx:582-604`) and the
plant-stage instancing (`plants.ts:336-414`) both consume this constant-baseline
model. **The twin ignores its own weather feed for growth.**

**F2 — The What-If simulation is not a simulation.**
`src/lib/localApi.ts:235-257` (`createSimulation`): yield is `30 − |ΔT|·3 −
precip penalties + fert·1.5`, water is `days × 4.5 × precip`, carbon/profit are
linear slider arithmetic. It never reads `state.plans[farmId]`, the crop
catalog, the farm coordinates, or any weather data. Two completely different
farms produce byte-identical results for the same slider inputs. The page even
promises "model crop outcomes" (`Simulations.tsx:207`). This is the single
biggest digital-twin failure.

**F3 — Monitoring presents decoration as instrumentation.**
- NDVI grid is a seeded sine/cosine pattern (`src/data/seed.ts:876`), and the
  panel copy claims a nonexistent source: *"FarmFriend weather-fusion model
  (SAR proxy)"* (`Monitoring.tsx:241`).
- Legacy cell moisture is `30 + ((i*7) % 40)` (`seed.ts:734`) and cell nitrogen
  is seed noise; the Monitoring page's "Soil Moisture / Nitrogen Level / Dry
  Cells" stat row (`Monitoring.tsx:310-315`) is computed from those constants —
  **disconnected from the actual plan** (`PlanState`), which the Monitoring page
  never reads.
- Sensors render a pulsing "Live" badge (`Monitoring.tsx:113`) but readings are
  manual-only (`localApi.addReading`). Meanwhile Open-Meteo already delivers
  real soil moisture, soil temperature, humidity and rainfall that we could bind
  virtual sensors to.

**F4 — Frost/calendar/climate inputs are latitude folk-math.**
`frost.ts` is a documented heuristic (fine as fallback), but Open-Meteo's
Historical Weather API (ERA5 archive) can compute real local frost dates,
growing-degree-day accumulations, and monthly climate normals from ~80 years of
daily data — which would also give F1 a real baseline and F2 a real climate
history. Nothing fetches it today.

**F5 — No soil identity beyond a label.**
`Farm.soilType` is a user/seed string (`'loam'`, `'clay'`). No pH, texture
fractions, organic carbon, or nitrogen exist anywhere, yet crops carry
`nitrogenNeed` and SimulationResults implies nutrient effects. ISRIC SoilGrids
offers exactly these properties, keyless, for any lat/lng.

### What a real digital twin needs (mission bar)

1. Same plan + same location + same weather ⇒ same, explainable simulation
   outcome; changing the plan changes the outcome; moving the farm changes the
   outcome.
2. The 3D world's growth responds to the farm's actual climate (live weather
   now, climate normals as seasonal context).
3. Soil baselines (texture, pH, organic carbon) fetched from open data with
   cache + graceful offline, and exposed where agronomy decisions are made.
4. Monitoring shows plan-derived or weather-derived values, honestly labeled —
   no fictional data-source claims, no "Live" badges on manual inputs.
5. Everything degrades gracefully offline (last-good caches, defaults), never
   throws into the UI, never breaks PNG export or the render seams.

---

## Workstreams (implementation specs)

Sequencing: **Wave 1** = WS-B, WS-C, WS-D (independent files, parallel);
**Wave 2** = WS-A, WS-E (consume Wave 1 modules). Orchestrator commits after
each validated workstream. All work on `pro-upgrade`; **nothing merges to main
until the whole mission is green** (typecheck + build + route smoke).

### WS-C — Climate archive module (`src/lib/climate.ts`) — WAVE 1

Open-Meteo Archive API (ERA5), keyless + CORS. New module, zero existing-file
edits (callers land in WS-A/WS-B):

- `fetchClimateNormals(lat, lng)` → last ~10 full years of daily
  `temperature_2m_max/min, precipitation_sum`; derives: monthly mean min/max
  temps, monthly precip totals, real last-spring/first-fall frost dates
  (0 °C threshold over the window), mean annual GDD (base 10 °C), and a
  `baselineTempC` (growing-season Apr–Sep N-hemisphere / Oct–Mar S-hemisphere
  mean).
- Cache the derived blob in `localStorage` (`ff-pro:climate:<lat>,<lng>`) with
  the fetched year range — this is a one-time ~10-year daily pull (~3,650
  rows), so persist aggressively and never refetch inside a session unless the
  key is missing.
- Graceful failure: return `null` on fetch error (caller decides fallback);
  never throw past the module boundary.
- Export a `ClimateNormals` type; document units inline.

### WS-B — Location-aware growth baseline (`growth.ts` + `World3D.tsx` + `plants.ts`) — WAVE 1

- `scenarioGrowthMod(crop, scenario, surface, baselineTempC?)`: new optional
  4th param, default `20` (legacy behavior for any un-migrated caller).
  All internal math uses the passed baseline. Also accept optional
  `ambientTempC?` — when provided, blend: the scenario's effective temperature
  starts from the real current ambient instead of the seasonal baseline
  (scenario ΔT still applies on top, still sheltered by surface).
- `World3D.tsx` and `plants.ts` call sites thread the farm's live
  `weather.current.tempC` (already available in both files' plumbing) and the
  climate baseline when `useClimate()` (WS-C) has data. Fall back silently to
  the constant when weather is unavailable — growth must never crash offline.
- HUD: the per-crop growth rows should show stress sourced from real ambient
  temp when connected (e.g. a 34 °C heatwave day visibly stresses
  cool-season crops in the HUD instead of showing perfect health).

### WS-D — Soil profile from open data (`src/lib/soil.ts` + Weather page card) — WAVE 1

- New `src/lib/soil.ts`. **Primary source: USDA Soil Data Access (SDA)** —
  live-verified keyless with open CORS on 2026-09-03 (OPTIONS/200/400 all send
  `ACAO: *`). `POST https://sdmdataaccess.nrcs.usda.gov/Tabular/SDMTabularService/post.rest`
  body `format=JSON&query=<urlencoded SQL>`; point→map unit via
  `SELECT mukey, muname FROM mapunit WHERE mukey IN (SELECT * FROM
  SDA_Get_Mukey_from_intersection_with_WktWgs84('point(<lng> <lat>)'))`
  (WKT is `point(lon lat)`), then a component/chorizon join for sand/silt/clay
  totals, `ph1to1h2o_r`, `om_r`, `cec7_r`, `awc_r`. US-only coverage; errors
  come back as XML even when JSON was requested — parse defensively.
- **Fallback for non-US (or SDA failure): ISRIC SoilGrids**
  `https://rest.isric.org/soilgrids/v2.0/classification/query?lat=..&lon=..&number=5`
  (verified still working; gives WRB + USDA class names). The SoilGrids
  `properties/query` endpoint is **verifiably paused (all values null as of
  2026-09-03)** — attempt it only behind null-guards with a short timeout so
  it lights up automatically if ISRIC restores it; one property per call
  (comma lists 500), divide values by the response's `unit_measure.d_factor`.
- Shape: `{ source: 'usda-sda' | 'soilgrids' | null, name, texture:
  {sand,silt,clay}, ph, organicMatterPct, cec, awc, soilType }` where
  `soilType` derives from texture fractions (simplified USDA triangle:
  clay/sandy/silt/loam). Return `null` + never throw on failure.
- localStorage cache keyed `ff-pro:soil:<lat2>,<lng2>` (soil doesn't change —
  cache ~forever, refresh button only).
- UI: "Soil Profile" card on the Weather page (which already shows live soil
  temp/moisture from the forecast model — the card adds ground truth: texture
  bars, pH, organic matter, CEC/AWC, derived classification, map-unit name).
  Attribution line ("USDA NRCS Soil Data Access" / "ISRIC SoilGrids"). Card is
  skeleton-while-loading and hides cleanly when data is unavailable.

### WS-A — Real simulation engine (`src/lib/sim.ts` + `localApi.ts`) — WAVE 2

Replace the slider arithmetic in `localApi.createSimulation` with a genuine
plan-aware engine. **The `Api` interface signature stays unchanged** (input =
the existing form fields; farmId already passed) so `restApi.ts` and all pages
keep compiling.

- New `src/lib/sim.ts`, `runSimulation(farm, plan, crops, input, weather, climate)`:
  1. **Inventory**: crop cells from `plan.planting` (id → count, area via
     `cellM²`; fenced zones respect `plan.surface` per canvas when present).
  2. **Climate series**: WS-C normals when cached (or a fresh fetch), else
     forecast-only. Build a `durationDays` daily series: temp = daily mean +
     `tempDeltaC` (scenario), precip = daily sum × `precipMultiplier`.
     Outdoor takes the full series; enclosed surfaces attenuate via
     `SURFACE_SHELTER` (reuse from growth.ts — one source of truth).
  3. **Per-crop loop**: GDD accumulation (base = max(0, minTempC adjusted
     category floor — document choice)), water-balance stress (deficit =
     `waterNeedMmDay − effective precip`, cumulated), heat/frost stress days
     vs `minTempC/maxTempC`, `fertilizerBoost` reduces nitrogen-stress only
     for crops with `nitrogenNeed !== 'low'` (nutritional realism).
  4. **Outcomes**: `yieldTonHa` = area-weighted catalog `yieldTonHa` × growth
     factor from the stressors (bounded, monotonic, explainable);
     `waterUseMm` = actual ET-proxy demand met/shortfall;
     `carbonKgHa` = residue + input model (documented simple factors by
     category, fertilizer-responsive); `profitUsdHa` = yield × price band by
     category − water/fertilizer cost factors; `stressScore` 0–100 from the
     computed stress days. Every constant gets a named, commented origin.
  5. **Summary text** references the plan ("1,240 cells across 6 crops, 3
     stress days, 41 mm deficit") — never canned per-scenario strings.
- `SimulationResults` JSON shape unchanged (optional new fields appended are
  fine — the results JSON is opaque to the UI except for the known keys);
  Simulations page may surface per-crop breakdown if WS-A adds a structured
  extra key (UI work optional, only if it stays small).
- Offline/no-plan: farm with no plan simulates a documented fallow baseline;
  no weather + no cache ⇒ deterministic climate-default series (labeled in
  summary), never a rejection.
- **Fixture discipline**: identical inputs ⇒ identical outputs (no
  Math.random anywhere in sim code — same rule as `src/creative/voxel.ts`).

### WS-E — Monitoring truth pass (`Monitoring.tsx`, `localApi.ts`, `seed.ts`) — WAVE 2

1. **Plan-derived NDVI proxy**: `getNdvi` computes a grid from the farm's
   `PlanState` (cell resolution ~1 m → downsample): planted cell in growth
   stage s ⇒ NDVI proxy curve (bare soil ≈ 0.1, young ≈ 0.3, dense ≈ 0.7+,
   by category); structures/paths ⇒ low; empty ground ⇒ soil value. Copy
   becomes "Modeled from plan (not satellite)" — the fictional "SAR proxy /
   weather-fusion" line dies.
2. **Virtual sensors**: soil_moisture / temperature / humidity / rainfall
   sensors get a "Virtual (Open-Meteo)" mode automatically: when the farm
   weather query is fresh, their lastValue/lastUnit and a trailing reading
   series hydrate from the live feed (soil moisture from the hourly soil
   series we already fetch). Manual "Log" stays available for real probes;
   badge shows "Live · virtual" vs "Live" only for sensors with real manual
   reads in the last 24 h. No fake pulse on manual-only sensors.
3. **Stat row honesty**: Soil Moisture / Nitrogen / Dry Cells recompute from
   the plan + live weather (moisture = live farm soil moisture vs crop
   `waterNeedMmDay` buckets; nitrogen = demand-weighted `nitrogenNeed`
   coverage), labeled "plan-based estimate". Remove seed-noise dependence:
   `seedCells` stays for backward compat but stops feeding the stat row.
4. FarmCell/setCellCrop endpoints stay (HANDOFF: legacy kept on purpose) —
   they just stop being the source of headline numbers.

### Docs lane — close-out

`HANDOFF.md` status + traps (soil/climate caches keys, archive API trap),
`README.md` data-source contract additions, `implementation-notes.md` ledger
entries per workstream, this file's Appendix finalized + Verification Log
populated. SPEC scope addendum if the simulation contract changes shape.

---

## Verification gates (whole mission)

1. `npm run typecheck` clean; `npm run build` clean (three.js stays in its own
   lazy chunk).
2. Route smoke via `tools/appshot.mjs --gate --expect` on: dashboard, map,
   weather, simulations, monitoring (scratch PNGs in `$TMPDIR`).
3. **Twin determinism**: two runs of the same simulation produce identical
   results; changing plan/precip/temp changes results in the right direction
   (worker asserts via a temporary probe or Node-side re-derivation).
4. Offline honesty: with weather fetch failing, every new surface renders a
   labeled fallback — no unhandled rejections (GATE catches), no "Live" lies.
5. Export/world seams untouched: `renderPlan.ts` gains no remote `drawImage`;
   no new render layer without an opt-in `RenderOptions` flag.

## Rules every worker must honor (from HANDOFF traps)

- TS strict + `noUnusedLocals` — unused imports fail the build.
- QueryClient defaults are hostile: new queries pass explicit `queryFn` and
  weather-adjacent queries override `staleTime`.
- Query params BEFORE the hash for test URLs.
- localStorage merge is additive-optional only; new persisted keys must
  degrade when absent (old blobs must keep loading).
- Never add a second sun; never write `planRef.current` outside snapshot
  paths; no `Math.random` in deterministic modules.
- No Claude/Anthropic/co-author references in commits or files.

---

## Appendix — Open-data source verification (research lane, 2026-09-03)

All CORS claims below were **live-tested with `Origin` headers** against the
real endpoints on 2026-09-03 — not recalled from docs.

| Source | Keyless | CORS | Status / notes |
|---|---|---|---|
| Open-Meteo Archive (ERA5, 1940→) | ✅ | ✅ `*` | **Adopted (WS-C/A).** Daily tmin/tmax/precip/**ET₀**; hourly soil temp/moisture (layer names differ from forecast API: `soil_temperature_0_to_7cm` etc. — normalize in the seam). Free tier: 10k calls/day, non-commercial. |
| Open-Meteo Climate (CMIP6, 1950→2050) | ✅ | ✅ `*` | Verified; heavy weighted calls — cache aggressively. Future: model-based scenario sims. |
| Open-Meteo Air Quality (CAMS) | ✅ | ✅ `*` | Verified. Ozone/NH₃/pollen — future leaf-damage + pollinator modifiers. |
| Open-Meteo Geocoding / Elevation / Flood (GloFAS) / Marine | ✅ | ✅ `*` | All verified. Elevation = Copernicus DEM 90 m (≤100 pts/call). Flood = river discharge 1984→+210 d. |
| NASA POWER (AG daily, 1981→) | ✅ | ✅ `*` | Verified working, keyless. Solar `ALLSKY_SFC_SW_DWN` MJ/m²/day (FAO-56 Rₛ), T2M, RH2M, `PRECTOTCORR` (no `PRECCIP` — corrected name only), −9999 sentinels. Blocks same-cell hammering — permanent per-farm cache. Not adopted this mission (independent-source sanity layer, future). |
| **USDA SDA (SSURGO)** | ✅ | ✅ `*` (**new — outdated lore says blocked**) | **Adopted (WS-D primary).** `POST …/post.rest`, `format=JSON&query=<SQL>`; `SDA_Get_Mukey_from_intersection_with_WktWgs84('point(lon lat)')`. US-only; XML error bodies; be polite, cache. |
| **ISRIC SoilGrids** | ✅ | ✅ `*` | ⚠️ **properties/query PAUSED — every value null (verified at 3 global sites; ISRIC notice 2026-09).** classification/query still works → WS-D fallback only, properties behind null-guards. |
| Open-Elevation | ✅ | ✅ | Works but community-hosted, outage-prone — not adopted. **OpenTopoData FAILS CORS** (200, no ACAO header) — do not use. |
| FAO-56 Kc/Ky tables | n/a | n/a | Free HTML (fao.org/4/x0490e/). Correct client-side move = one-time transcription into a TS data file. **Out of scope this mission** — WS-A uses archive ET₀ + catalog waterNeedMmDay instead; Kc refinement is a follow-up. |
| GBIF occurrences | ✅ | ✅ `*` | Verified. Future pollinator/companion hints. |
| NOAA CO-OPS tides | ✅ | ✅ `*` | Verified, US coastal only. Not adopted. |

Free-tier reality: the whole Open-Meteo family is non-commercial, ≤10k
calls/day, 5k/hour, 600/min — every adopted source is cached in localStorage
and memoized per session accordingly.

## Verification Log

### Wave 1 — GREEN (validated 2026-09-03, HEAD `975b72c`)

Scope: `e7ab50e` (WS-B), `3961094` (WS-C), `975b72c` (WS-D). Independent
validation agent; all gates PASS, zero findings attributable to the mission.

1. **Typecheck** — exit 0 both on the working tree AND on a `git archive HEAD`
   extraction (mission commits without the third-party in-flight files) —
   clean attribution in both directions.
2. **Build** — exit 0; three.js lazy chunk byte-identical pre/post mission
   (782.62 kB); main index +6.4 kB (+1.2%, soil card + growth ctx).
3. **Code review** — no `Math.random`; `climate.ts`/`soil.ts` never reject
   (catch-all → null, failed lookups un-memoized for retry); versioned
   `ff-pro:climate|soil:<lat2dp>,<lng2dp>` caches, corrupt-blob safe;
   zero `any`; `growthCtxRef` never in a dep array (no rebuild loop), init
   effect still `[sceneReady, farmId]`, ambient landing triggers a
   plants-only rebuild; `Api`/`Simulations`/`localApi` untouched.
   Non-blocking: `deriveClimateNormals` export awaits its WS-A consumer.
4. **Determinism probe** — bundled growth model: lettuce at ambient 34 °C
   outdoor → `{rate 0.46, stress 0.9}`; undefined ctx → `{1, 0}`;
   34 °C in a tent → `{1, 0}` (shelter 0.12); repeat calls byte-identical.
5. **Route smoke 5/5** — map / weather / simulations / monitoring / world
   (`?ffview=world&fftime=0.5` before the hash): every GATE line "zero
   runtime errors", real PNG renders. The new **Soil Profile card rendered
   with live data** on the weather route: "Luvisols · ISRIC SoilGrids" for
   demo farm 1 (Portland Urban-land map unit → SDA-no-horizon → SoilGrids
   fallback, exactly the documented degradation), alongside live Open-Meteo
   readings. (One infra flake: the dev server died mid-suite on HMR churn
   from the *third-party* session's edits — passed clean on retry.)
6. **Offline honesty** — `?? undefined` fallbacks confirmed at both ambient
   call sites; undefined-ctx algebra is byte-identical to the pre-mission
   constant-baseline formula.

### Wave 2 — GREEN (validated 2026-09-03, branch `mission-twin`, base `5e27890`)

Scope: `499f506` (WS-A engine + stitch), `de30a7d` (WS-E monitoring truth),
`09447db` (World3D ERA5 baseline). Independent validation agent; all gates
PASS; `git status` scoped to exactly the six mission files; `types/index.ts`
untouched.

1. **Typecheck/build** — exit 0 both; three.js lazy chunk byte-identical
   (782.62 kB).
2. **Diff review** — no `Math.random` (documented `startDate`/`sampledAt`
   anchors only); every sim constant carries an origin comment; `Api`
   interface untouched (diff = imports + createSimulation body); old saved
   sims render untouched (optional intersection keys, all guarded);
   zero residual `getNdvi`/`listCells`/"SAR proxy" in Monitoring; every new
   query has explicit queryFn + overridden staleTime; `growthCtxRef` never
   in a dep array; init effect still `[sceneReady, farmId]`.
3. **Determinism + twin semantics probe** (bundled engine): identical runs
   byte-identical; different plan ⇒ different outcome; drought stress
   outdoor 26.7 vs tent 17.4 (shelter works); fallow path provenance
   `plan:'fallow'`.
4. **Route smoke 4/4** — simulations/monitoring/weather/world on a
   strict-port worktree dev server, every GATE line "zero runtime errors"
   (one Chrome-hang infra flake on first weather attempt, clean on retry —
   matches the Wave 1 precedent).
5. **API stitch trace** — `localApi.createSimulation`: farm → forecast
   (try/catch) → ERA5 normals → `runSimulation(farm, plan, crops, input,
   forecast, climate)` → outcome JSON persisted; `SimOutcome` structurally
   satisfies `SimulationResults`.

**Mission complete.** The What-If simulation now simulates THE farm; the
3D twin grows on the farm's real climate; soil identity comes from USDA
SDA/SoilGrids; Monitoring numbers are plan- or weather-derived and honestly
labeled. Known deferred polish: FAO-56 Kc stage tables (ET₀ currently
uncorrected), CMIP6 scenario sims, soil data feeding the sim engine's
nutrient model directly.

---

# WAVE 3 — Tier-2 Data Wiring (spec written 2026-09-04, branch `twin-w3`)

Goal: simulation outputs become distributions instead of single numbers, the
climate-change scenario becomes real projected data, and the twin gains
environmental awareness (ozone stress, flood risk). Two lanes, disjoint files:

| Lane | Owns | Delivers |
|---|---|---|
| L1 "Seasons & Scenarios" | `src/lib/ensembles.ts` (new), `src/lib/cmip6.ts` (new), `src/lib/sim.ts`, `src/pages/Simulations.tsx` | Per-year yield ranges (ERA5 ensembles w/ NASA POWER fallback), CMIP6-driven climate scenario |
| L2 "Environment" | `src/lib/airquality.ts` (new), `src/lib/flood.ts` (new), `src/pages/Weather.tsx` | CAMS ozone card + GloFAS flood-risk chip on the Weather page |

Deferred this wave (recorded, not forgotten): DLI/radiation light model for
enclosed surfaces (#9 — needs World3D threading of radiation data; separate
small effort), NASA POWER as a *primary* source (used only as L1's resilience
fallback), ozone/flood feeding the growth model (L2 ships display + data; the
sim-integration stitch follows the same orchestrator pattern as Wave 2).

## L1 spec — Seasons & Scenarios

- `src/lib/ensembles.ts`:
  ```ts
  export interface SeasonYear { year: number; daily: { tmeanC: number; precipMm: number; et0Mm: number }[] }
  export interface SeasonEnsembles { years: SeasonYear[]; source: 'era5' | 'nasa-power' }
  export function fetchSeasonEnsembles(lat: number, lng: number): Promise<SeasonEnsembles | null>
  ```
  ONE archive request (same 10-complete-years window as climate.ts — reuse
  the window logic, not the module's privates): daily tmean/precip/ET₀ arrays
  split per calendar year, values rounded to 2 dp. ERA5 primary
  (`archive-api.open-meteo.com/v1/archive`, verified keyless/CORS); on
  failure, per-year NASA POWER daily (`power.larc.nasa.gov/api/temporal/daily/point`,
  params `T2M_MAX,T2M_MIN,PRECTOTCORR`, `community=AG`, dates `YYYYMMDD`,
  −9999 sentinels → skip day). POWER has no ET₀ variable: derive it with the
  documented Hargreaves proxy `et0 = 0.0023 × RA × (tmeanC + 17.8) ×
  sqrt(max(0, tmax − tmin))`, where RA (extraterrestrial radiation, MJ/m²/day)
  comes from a small exported latitude×month lookup table (12 values, mid-month
  day-of-year, standard table — cite FAO-56 Annex). Deterministic, commented.
  POWER source
  ⇒ `source: 'nasa-power'`. Cache `ff-pro:seasons:<lat2dp>,<lng2dp>`
  (versioned; ~10 y × 365 × 3 ≈ small). Never throw; <3 usable years ⇒ null.
- `src/lib/cmip6.ts`:
  ```ts
  export interface ClimateProjection { model: string; horizon: string; deltaTempC: number; deltaPrecipPct: number }
  export function fetchClimateProjection(lat: number, lng: number): Promise<ClimateProjection | null>
  ```
  `climate-api.open-meteo.com/v1/climate` (verified keyless/CORS; weighted
  calls are heavy — keep it to TWO short windows: 2021–2025 vs 2041–2045,
  single model `MRI_AGCM3_2_S`, daily `temperature_2m_mean,precipitation_sum`).
  Deltas: tmean difference; precip % change GUARDED — if either window's
  mean monthly precip < 5 mm, set deltaPrecipPct to null (type:
  `number | null`) and the sim applies the temperature delta only. Cache FOREVER
  (`ff-pro:cmip6:<lat2dp>,<lng2dp>`; projections don't change). Never throw.
- `src/lib/sim.ts` (extension, backward-compatible):
  - `runSimulation` args gain `ensembles?: SeasonEnsembles | null` and
    `projection?: ClimateProjection | null`.
  - Refactor the daily-series core so the whole per-crop outcome computation
    can run against ANY daily series (already nearly true); run it once per
    ensemble year → `SimOutcome.range?: { lowYieldTonHa; medianYieldTonHa;
    highYieldTonHa; years: number }` (median = for an even
    year count, the average of the two middle sorted values (documented, keeps
    determinism unambiguous); fewer than 3 usable years ⇒ omit range).
  - `climate_change` scenario: when `projection` present, apply
    `deltaTempC`/`deltaPrecipPct` (converted to the same shelter/attenuation
    path as `tempDeltaC`/`precipMultiplier` — document the mapping) INSTEAD
    of the legacy constant +2 °C; fallback unchanged.
  - `SimProvenance.climate` union extends with `'era5-ensemble'` (set when a
    range was computed) — existing values stay valid; old stored sims keep
    rendering.
  - Summary line appends range when present: "yield range 5.1–9.8 t/ha
    (median 7.2, 10 seasons)".
- `src/pages/Simulations.tsx`: render `range` as a compact
  low–median–high line/chips in SimulationCard; provenance chip
  "CMIP6 2040s" when the climate_change run used a projection. Absent keys
  degrade silently. All testids intact.

## L2 spec — Environment

- `src/lib/airquality.ts`:
  ```ts
  export interface AirQuality { ozoneUgM3: number | null; fetchedAt: string }
  export function fetchAirQuality(lat: number, lng: number): Promise<AirQuality | null>
  ```
  `air-quality-api.open-meteo.com/v1/air-quality` (verified keyless/CORS),
  `hourly=ozone`, `forecast_days=3`, current-hour index (same hourly-index
  pattern as weather.ts — reuse the approach). 1 h TTL cache +
  in-flight dedupe. Never throw.
- `src/lib/flood.ts`:
  ```ts
  export interface FloodRisk { dischargeM3s: number; riskLevel: 'low' | 'elevated' | 'high'; fetchedAt: string }
  export function fetchFloodRisk(lat: number, lng: number): Promise<FloodRisk | null>
  ```
  `flood-api.open-meteo.com/v1/flood` (verified keyless/CORS),
  `daily=river_discharge` over a window of `past_days`-equivalent 30 d
  history + 7 d forecast (GloFAS supports arbitrary start/end; pick the
  smallest pair of calls that yields both). Risk = forecast-window max vs
  the 30-day distribution: ≥ p95 'high', ≥ p75 'elevated', else 'low'
  (documented heuristic — no absolute thresholds exist in GloFAS). 12 h TTL
  cache + dedupe. Never throw. Coastal points with no river ⇒ nulls/empty
  array ⇒ null (hidden UI).
- `src/pages/Weather.tsx`: additive "Environment" card below Soil Profile:
  ozone μg/m³ with documented threshold chip (≥ 100 μg/m³ ⇒ "leaf-damage
  risk for sensitive crops", EU target value ≈ 120 — cite in comment),
  flood chip when 'elevated'/'high' with discharge figure, skeleton loading,
  hide-when-null, attribution "CAMS · Copernicus" / "GloFAS · Copernicus",
  explicit queryFn + sane staleTime (hostile defaults trap).

## Verification gates (Wave 3)

Same suite as Wave 2: typecheck/build (three.js chunk byte-identical),
determinism probes (ensembles: same inputs ⇒ byte-identical range; projection
path deterministic), route smoke on simulations + weather routes, diff review
scoped to the five files, backward-compat (old sims, old provenance values,
no new required localStorage keys), never-throw module boundaries, 10k/day
free-tier discipline (count requests per cache miss: L1 ≤ 3, L2 ≤ 2).

### Wave 3 — GREEN (validated 2026-09-04, branch `twin-w3`, base `16d7815`)

Scope: two lanes + orchestrator stitch across eight files. All gates PASS;
three.js chunk byte-identical; `Api` interface unchanged; old stored sims
proven byte-identical (no `range` key, same provenance) — the sim refactor
(`simulateOnSeries`/`scenarioAdjust`) is a pure extraction verified against
the base commit's inline algebra.

- **Determinism/range probes**: identical ensemble runs byte-identical;
  4-year even-count median correct; CMIP6 path with `deltaPrecipPct: null`
  applies temperature only; a synthetic 20 °C/−50 % projection moves yield
  8.59 → 5.9 t/ha (monotonic, explainable).
- **Live route smoke**: Environment card rendered REAL data — ozone
  74 µg/m³, flood risk "High" at 1.98 m³/s (Johnson Creek), CAMS/GloFAS
  attribution — exercising all four never-throw fetch modules on the
  network with zero console errors.
- **Request budget**: cold-cache happy path = 1 (ensembles) + 0–2 (CMIP6,
  climate_change-only, forever-cached) + 1 (air) + 1 (flood) — within spec.
  POWER fallback verified dormant on the ERA5 success path.
- Non-blocking notes for the record: (1) when the CMIP6 precip guard fires,
  the climate_change preset's −20 % precip multiplier survives alongside the
  projected temperature delta (defensible under the spec's INSTEAD clause;
  commented in code); (2) cmip6.ts lacks in-flight dedupe (forever-cache +
  single caller make it moot).

---

# WAVE 4 — Remaining Tier 2/3 to Verifiable Completion (spec 2026-09-04, branch `twin-w4`)

Four worker lanes (disjoint files) + orchestrator stitches + validator +
skill-based review. **Blocked on credentials (documented, not faked):**
Sentinel-2 ground-truth NDVI (needs a free Copernicus Data Space account) and
USDA NASS market prices (free key) — both recorded here; neither is wired.

| Lane | Owns | Delivers |
|---|---|---|
| L1 "FAO-56 agronomy" | `src/data/fao56.ts` (new), `src/lib/sim.ts` | Stage-aware crop ET (Kc curve) + Ky yield response replacing the flat fold |
| L2 "Soil→sim" | `src/lib/soilEffect.ts` (new, pure) | AWC water buffering, pH nutrient gating, OM carbon factor — pure fns + probe; orchestrator stitches into sim/localApi |
| L3 "Light model" | `src/lib/light.ts` (new), `src/lib/growth.ts`, `src/components/world/World3D.tsx` | Monthly DLI per farm; enclosed-surface light stress in the growth model; World3D threads it (scrub-date month aware) |
| L4 "Disease pressure" | `src/lib/disease.ts` (new), `src/pages/Weather.tsx` | 7-day blight/mildew pressure index from hourly temp+RH (own small request, 1 h TTL); Weather-page card |

## L1 — FAO-56 Kc/Ky (`fao56.ts` + sim.ts)

- `src/data/fao56.ts`: per-`CropCategory` Kc curves `KcCurve { ini; mid; end;
  iniFrac; devFrac; midFrac }` (stage-length fractions of total season,
  defaults ~0.2/0.3/0.35/0.15, adjusted per category per FAO-56 Table 11
  norms) + single `Ky` yield-response factor per category. Values
  transcribed from FAO-56 Table 12 representative crops per category
  (vegetable≈tomato, grain≈maize, fruit≈citrus/orchard, herb≈small, flower,
  cover_crop≈grass; fungus ⇒ 0 demand, no curve). Each number block gets a
  citation comment ("FAO-56 Table 12, tomato").
- `sim.ts`: water demand becomes stage-aware `ETc = Kc(stageFrac) × day.et0Mm`
  (interpolate ini→mid→end linearly across the season fraction; legacy
  `waterNeedMmDay` remains the floor — demand = max(ETc, need×0.6), documented)
  and the yield fold becomes Ky-based:
  `1 − Ky × deficitRatio` (clamped, defaulting to the current 0.6 behavior
  per category via its Ky). growthDays drives stage fraction. Determinism +
  monotonicity preserved; old stored sims render unchanged (shape untouched).

## L2 — Soil→sim pure functions (`soilEffect.ts`)

```ts
export function awcBufferMm(deficitMm, awcMmPerCm | null, rootingCm?): number  // deficit relieved by plant-available water, capped (default rooting 25 cm, documented)
export function phNutrientFactor(ph: number | null): number  // 1.0 in 6.0–7.0; linear falloff to 0.6 at 4.5/9.0 (documented, cited extension-service ranges)
export function omCarbonFactor(omPct: number | null): number // 1.0 at 2% OM; ±0.05 per % point, clamped 0.8–1.3
```
All null-safe ⇒ identity when data absent. Node probe with the real Boring OR
numbers from the Wave-1 log (silt loam, pH 5.6, OM 5, AWC 2.3). Orchestrator
stitches: sim args gain `soil?`, deficit/nutrient/carbon paths consume the
factors; localApi passes `fetchSoilProfile` (forever cache, one localStorage
read after first fetch).

## L3 — Light model (`light.ts` + growth.ts + World3D)

- `src/lib/light.ts`: ONE archive request (last full calendar year, daily
  `shortwave_radiation_sum`) → `monthlyDliMol: number[12]` via the documented
  conversion `DLI_mol ≈ MJ × 2.02` (≈45% PAR fraction × 4.5 mol/MJ PAR — cite
  horticultural lighting norms). Cache `ff-pro:light:<lat2dp>,<lng2dp>`
  (versioned; yearly refresh check). Never throw ⇒ null.
- `growth.ts`: `GrowthModCtx` gains `dliMol?: number` + `month?: number`;
  new light-stress term applies ONLY to enclosed surfaces (outdoor takes full
  sun by definition): crop DLI need per category table (documented: fruiting
  ≈20, vegetable ≈14, herb/flower ≈10, grain ≈18, cover_crop ≈8, fungus ⇒
  never light-stressed); stress += deficit-fraction when `dliMol` present and
  below need (terse doc: supplemental LEDs can cover the gap — this models
  the *unlit* case). Undefined ctx fields ⇒ byte-identical legacy behavior.
- `World3D.tsx`: fetch `monthlyDliMol` in the existing climate fetch path;
  store in a ref + state mirror (EXACT pattern of climateBaselineC — no
  effect-deps refs); thread `dliMol` from the SCRUB DATE's month (date-scrub
  to December shows winter greenhouse light stress) into the growth ctx at
  the existing three call sites. Optional tiny chip extension if trivial.

## L4 — Disease pressure (`disease.ts` + Weather.tsx)

- `src/lib/disease.ts`: ONE request
  `hourly=temperature_2m,relative_humidity_2m`, 7-day forecast window →
  documented blight/mildew pressure index: hourly risk when RH ≥ 90 % and
  10 °C ≤ T ≤ 25 °C (cite classic late-blight Hjärne-type thresholds);
  daily score → 7-day index 0–100; riskLevel low/moderate/high. 1 h TTL
  cache + dedupe; never throw ⇒ null. Probe against live Portland data.
- `Weather.tsx`: "Disease pressure" card under Environment — index, level
  chip, one-line guidance ("scout for blight on solanaceae" at high),
  skeleton/hide-when-null/attribution "computed from Open-Meteo hourly
  forecast". Explicit queryFn + sane staleTime.

## Verification gates (Wave 4)

Standard suite: typecheck/build (three.js byte-identical), per-lane Node
probes (determinism, monotonicity: more deficit ⇒ less yield with Ky; AWC
buffer relieves deficit; pH 5.6 factor < pH 6.5; December DLI < June at
Portland), route smoke (weather + world + simulations), backcompat probes
(undefined ctx / no soil / no light ⇒ legacy outputs), request budget
(+1 archive, +1 hourly per cold cache). Orchestrator stitches
localApi+sim-soil AFTER L1/L2 land; validator runs last; skill-based
code review precedes commit.
