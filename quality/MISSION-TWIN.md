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

- New `src/lib/soil.ts`: ISRIC SoilGrids v2 point query
  (`https://rest.isric.org/soilgrids/v2.0/properties/query?lat=..&lon=..&property=pH,texture_class...`
  — verify exact property list against docs during implementation: pH, sand,
  silt, clay, organic carbon, nitrogen, CEC at 0–5 cm and 5–15 cm depths).
  Values arrive in depth-weighted means with scale factors (e.g. pH×10,
  cg/cm³) — convert to conventional units and document.
- Derive a `SoilType` classification from sand/silt/clay fractions (USDA
  triangle, simplified: clay/sandy/silt/loam) so a farm's `soilType` can be
  suggested from data.
- localStorage cache keyed `ff-pro:soil:<lat>,<lng>` (soil doesn't change —
  cache ~forever, refresh button only). Return `null` + never throw on
  failure; show "soil data unavailable (offline)" state.
- UI: "Soil Profile" card on the Weather page (it already shows live soil
  temp/moisture from the forecast model — the card adds the ground truth:
  texture bars, pH, organic carbon, CEC, derived classification). Small
  "ISRIC SoilGrids" attribution line. Card is skeleton-while-loading and
  hides cleanly when data is unavailable.

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

## Appendix — Open-data source verification (research lane)

> Pending: background research agent is verifying keyless/CORS status of
> Open-Meteo Archive/CMIP6/Air-Quality, NASA POWER, SoilGrids, USDA SDA,
> elevation, and crop-nutrient references. This section is finalized before
> WS-C/WS-D workers dispatch; worker specs embed the verified endpoints.

## Verification Log

> Filled at close-out.
