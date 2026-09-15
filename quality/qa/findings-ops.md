# QA findings — OP lane (Ops Pages, Data & Integrations)

Repo: `ff-land-plan` (ff-voxel-twin) · Date: 2026-09-07 · Dev server: `http://localhost:5173` (pre-running, untouched)
Evidence dir: `/var/folders/pr/ny57nkls6_3cdvtsdrcr2rpm0000gn/T/ffqa-ops/` (7 gated PNGs + 1 live PNG)
Read-only discipline held: no writes outside `quality/qa/findings-ops.{json,md}`.

## Verdict

The ops lane is **ready to ship — no P0/P1 found**. All seven gated pages boot with zero console errors and render real, live data (Open-Meteo current/forecast/history, derived alerts, soil fallback chain). The data layer is coherent: the `Api` seam, localStorage store, and REST parity client line up, custom-crop ids (library max 50 vs custom start 1000) can't collide, and every offline path degrades deliberately (cached badge → "unavailable" card → hidden soil card). The findings that remain are quality bar items: the dashboard alerts banner only looks at the first farm (OP-1), the frost-date heuristic that seeds every farm's calendar is weeks wrong for maritime climates (OP-2), and one fully dead module (`climate.ts`) plus one dead Api method (`setCellCrop`) that should be wired or deleted (OP-4/OP-5). Nothing here blocks the in-flight HUD/creative/sim work from committing.

## Checks run

| # | Probe | How | Result |
|---|-------|-----|--------|
| 1a | Dashboard cards: coverage %, yield, weather pills, links | gate shot `#/` + code trace | **PASS** — 7 farms, live temps, coverage bars (`dash.png`) |
| 1b | Dashboard delete with confirm; add-farm `btn-add-farm` | code trace (Dashboard.tsx:178-206, 300) | **PASS (trace)** — confirm dialog wired; live click NOT TESTED (mutates store) |
| 1c | ActiveAlertsBanner + "Mark all read" | gate shot + trace | **PASS with findings** — banner renders & button refreshes (OP-3), but farms[0]-only scope (OP-1) |
| 2 | FarmForm: place search fills lat/lng; frost estimate; create round-trip; edit prefill; validation | code trace (FarmForm.tsx, geocode.ts, frost.ts) | **PASS (trace)** — geocode→applyPlace→frost chain sound; name/area validation real; edit prefill effect keyed on farm id. Live search click + save round-trip NOT TESTED (network+mutation); store merge logic (`store.ts:81-93`) confirms user farms survive reload |
| 3 | Calendar windows / This week / today marker / empty-plan CTA; Dec-31 wrap | gate shot `#/farms/1/calendar` + trace | **PASS with finding** — 44 windows, markers, CTA present (`calendar1.png`); wrap renders as sliver (OP-9) |
| 4a | Weather: current, Cached badge, 24-history, 7-day forecast | gate shot `#/farms/1/weather` | **PASS** — live 20.8°C, history chart, "7-Day Forecast" present (`weather1.png`) |
| 4b | Offline data risks: cached:true / no-cache / DEFAULT_WEATHER | code trace | **PASS** — cached badge path real (`weather.ts:103-106`); no-cache → page shows "Weather data unavailable" (`Weather.tsx:214-220`); DEFAULT_WEATHER fake-good exists ONLY in World3D.tsx:45,342 (World lane), not on this page. Pill residual: OP-8 |
| 4c | soil.ts USDA→SoilGrids, never throws, Refresh refetches | gate shot + trace | **PASS** — screenshot shows live SoilGrids fallback "Luvisols" (SDA returned nothing for Portland coords) with name-only copy (`SoilProfileCard.tsx:101-103`); refresh path clears cache + inflight (`soil.ts:177,184-191`) |
| 4d | climate.ts cache keyed incl. years; never throws | code trace | **PASS but MOOT** — module has zero consumers (OP-4) |
| 5 | Simulations: presets, inputs, Run, results + radar, delete; mock math sanity | live shot (no gate — recharts) + math trace | **PASS** — 3 seeded sims render charts/radar (`sim.png`); per-preset math computed and monotonic (see below); delete invalidates. Run click NOT TESTED (mutates store) |
| 6 | Monitoring: add sensor, readings, delete, dismiss alerts, refresh, NDVI | gate shot `#/farms/1/monitoring` + trace | **PASS with findings** — "North Probe" renders; alert rules = sane weather-derived thresholds (`weather.ts:196-217`); unit bug OP-7, NDVI empty-grid OP-10 |
| 7 | Crops: search, chips, detail cards, custom crop add + id ≥1000 seam | gate shot `#/crops` + trace | **PASS** — "Add Custom Crop" renders (`crops.png`); ids: library max **50**, custom counter starts **1000** (`store.ts:60`) → no collision; `listCrops` = `[...cropLibrary, ...customCrops]` feeds designer palette (seam for lane 1: custom crop will appear there, no renumbering anywhere) |
| 8 | Routing: Sidebar/FarmNav links farms 1 & 6; bad hash; `#/` redirect; theme; hamburger | gates 4/6/7 + trace | **PASS** — farm 6 weather gate PASS; bad hash → NotFound gate PASS; `App.tsx:42-44` forces `#/`; theme toggle + mobile drawer traced (`AppShell.tsx:19-46, SidebarMobile`) |
| 9 | Dead seam setCellCrop | grep | **FAIL (dead code)** — OP-5 |
| 10 | Headless gates (7 of 8 budget) | `tools/appshot.mjs --gate --expect` | **7/7 PASS** (table below) |

### Gate / live-shot results

| Shot | URL | Expect | Gate | PNG |
|------|-----|--------|------|-----|
| 1 | `#/` | "North Meadow" | PASS (0 errors) | dash.png |
| 2 | `#/farms/1/weather` | "7-Day Forecast" | PASS | weather1.png |
| 3 | `#/farms/1/calendar` | "Last frost" | PASS | calendar1.png |
| 4 | `#/farms/1/monitoring` | "North Probe" | PASS | monitoring1.png |
| 5 | `#/crops` | "Add Custom Crop" | PASS | crops.png |
| 6 | `#/nope/bogus` | "Page not found" | PASS | notfound.png |
| 7 | `#/farms/6/weather` | "Mushroom Warehouse" | PASS | weather6.png |
| live | `#/farms/1/simulations` | — (live-clock tool, no gate per plan) | n/a | sim.png (134 KB, recharts rendered) |

### Seed-id discrepancy resolution (probe 8)

`src/data/seed.ts` defines **7 farms, ids 1–7** (1 North Meadow … 6 Mushroom Warehouse at :68-77, 7 Greenhouse Range at :78-87), and `store.load()` (`store.ts:81-85`) re-seeds all demo farms on every load, so even a stale profile shows 7. The explorer's "ids 1–5" and HANDOFF's "1–7" — current code agrees with HANDOFF; "1–5" is stale. Farm 6 route verified live (gate 7).

### Simulations mock-math sanity (probe 5, computed from `localApi.ts:235-274`, 90 d default)

| Preset | yield t/ha | water mm | carbon | profit $/ha | stress |
|--------|-----------|----------|--------|-------------|--------|
| baseline (0°, ×1.0, +0) | 30 | 405 | 700 | 1638 | 0 |
| drought (+2°, ×0.5) | 14.5 | 203 | 700 | 789 | 37 |
| heat_stress (+3°, ×0.9) | 24 | 364 | 700 | 1277 | 24 |
| optimal (0°, ×1.2, +2) | 33 | 486 | 820 | 1726 | 0 |
| climate_change (+2°, ×0.8) | 22 | 324 | 700 | 1074 | 22 |

Monotonic and directionally right per scenario; scenario type only changes the summary string, sliders drive the math — consistent. Numbers are a generic farm-wide mock (not per-crop from the plan); the seeded cards use hand-written values (28.4/17.1/36.8) that don't match a fresh run of the same preset (30/14.5/33) — cosmetic, seed data only. Radar normalizations clamp to 100 for nearly all real values (Yield/20, Profit/15) — cosmetic.

## Findings

### P2

- **OP-1 · ActiveAlertsBanner reads only farms[0]'s alerts; "Mark all read" covers farm 1 only.** `Dashboard.tsx:213-217` binds `useFarmAlerts(farms[0].id)` and `markAllAlertsRead(first.id)`. Repro: `dash.png` — banner shows 1 alert (farm 1) while all 7 cards show "1 alerts" badges; other farms' alerts are invisible in the banner and can't be cleared from the dashboard. Fix: aggregate across farms or loop mark-all per farm.
- **OP-2 · Frost-date heuristic materially wrong at mid latitudes, seeded as every farm's default.** `frost.ts:46` `365 − 6.4·L` gives Portland (45.52°N) a 74-day frost-free season → "06-15 → 08-28" (verified live in `calendar1.png`; real ≈ mid-Apr → late-Oct). Drives calendar badge/markers/frost-risk (every action on farm 1 flagged "frost risk" — over-flagging) and FarmForm defaults. Documented heuristic + user-overridable keeps it P2, not P1. Fix: soften slope and/or wire the orphaned ERA5 normals (OP-4).

### P3

- **OP-3 · markAll onSuccess empty stub; refresh works only via onClick invalidation.** `Dashboard.tsx:216-221` vs `:238-241`. Verified: list DOES refresh, NO double-invalidation. Trap for future `markAll.mutate()` callers; Monitoring does it right (`Monitoring.tsx:284-287`).
- **OP-4 · `src/lib/climate.ts` (296 lines) fully orphaned.** Zero consumers. The probed Jan-1 cache-invalidation concern (`:44-62`) is real in code but has no consumer impact while unused. Fix: wire (best frost estimator available) or delete.
- **OP-5 · `Api.setCellCrop` dead in both clients.** `localApi.ts:212`, `restApi.ts:113`, README:73+91 — no page/hook calls it. Dead code + doc surface that must stay in sync.
- **OP-6 · Weather page Refresh is a no-op within the 15-min memo.** `Weather.tsx:116` → `localApi.ts:42-52` memo returns the same promise. (Soil Refresh genuinely refetches — `soil.ts:177`.)
- **OP-7 · Reading units/ranges wrong for 3 of 5 sensor types.** `Monitoring.tsx:84` labels humidity/rainfall/ndvi readings "°C"; `isInRange` (`:40-44`) can never flag them.
- **OP-8 · Dashboard weather pill stuck on "Loading weather…" when weather fails.** `Dashboard.tsx:63-65` has no error branch (offline + no cache only). Weather page itself degrades correctly; DEFAULT_WEATHER fake-good is World3D-only.
- **OP-9 · Calendar windows crossing Dec 31 render as 1.5% slivers; SH frost marker plots off-grid.** `calendar.ts` doy wrap + `Calendar.tsx:149-151` width math; dates/tooltip/This-week stay correct.
- **OP-10 · NDVI panel shows a confident 0.00 for farms 3–7 (empty grid).** `localApi.ts:219-223` + `Monitoring.tsx:186` — "Modeled" badge mitigates.
- **OP-11 · Cleared lat/lng fields save as 0/0.** `FarmForm.tsx:25-26` `z.coerce.number()` of `''` → 0 passes; name/area are properly guarded.

## Verified wired ✅

- Dashboard: 7 farm cards with live weather pills, coverage % from `computeStats`, yield, alert badges; Add Farm button; delete confirm dialog wired to `useDeleteFarm` + cache invalidation.
- "Mark all read" end-to-end (despite OP-3 placement): `markAllAlertsRead` persists `alertReads` keyed by deterministic hash ids (`weather.ts:164-194`), so read-state survives forecast recomputation.
- Alerts derivation from the real 7-day forecast: frost/heat/flood 3-day windows + weekly drought rule — thresholds sane, screenshot shows live "Dry week ahead: only 2.2 mm".
- FarmForm: Open-Meteo place search → fills lat/lng/elevation/name + re-estimates frost; "Estimate from latitude" button; zod validation on name/area/frost format (`MM-DD` strict-checked, `frost.ts:19-26`); edit prefill effect; create → prepended to farms, survives reload (`store.ts:81-93` keeps user farms, farm counter kept above max id).
- Calendar: 44 windows on farm 1 derived from plan crops × frost anchors; This-week filter; Today/Last-frost/First-frost markers; empty-plan CTA to designer; malformed frost strings guarded (`isValidMonthDay`).
- Weather: current conditions card, 4 stat tiles, agricultural indicators, 24-reading history chart, 7-day forecast, Cached badge on offline-with-cache, "Weather data unavailable" on total failure, attribution line.
- SoilProfileCard: USDA SDA → SoilGrids fallback verified live (Luvisols, name-only nulls rendered honestly), never throws, Refresh truly refetches, card hidden on null.
- Simulations: preset buttons fill sliders + name; duration/name inputs; Run → instant consistent results (table above); comparison bar chart + per-card radar + delete.
- Monitoring: add/delete sensor, log readings (30 s poll), per-alert mark read + "All read" (correct onSuccess), weather-derived alert list, NDVI buckets for seeded farms.
- Crops: search across name/scientific/family, category chips with counts, family + frost selects, expandable detail cards with companion/antagonist slug→name resolution, custom crop form → id 1000+ (`store.ts:60`), `listCrops` union feeds designer palette (lane-1 seam intact).
- Routing: all Sidebar/FarmNav targets resolve for farms 1 and 6; bad hash → NotFound; `#/` first-load redirect; theme toggle (sidebar + mobile header); mobile hamburger drawer closes on navigate.
- Store: debounced persist + flush on tab hide; quota failures degrade to in-memory with one console warning; seed demo farms/plans re-seed per load (intentional showcase behavior — user edits to demo farms are reverted by design, documented `store.ts:77-85`).

## Api-method → consumer coverage

| Api method | Consumers | Status |
|---|---|---|
| listFarms / getFarm | Dashboard, Sidebar, AppShell, useFarm→all farm pages | wired |
| createFarm / updateFarm / deleteFarm | FarmForm / FarmForm / Dashboard | wired |
| getWeather / getForecast / getWeatherHistory | Dashboard pill; Weather ×3 | wired |
| listAlerts / markAlertRead / markAllAlertsRead | Dashboard banner+cards; Monitoring ×2 (+Dashboard markAll) | wired (OP-1/OP-3 caveats) |
| listSensors / createSensor / deleteSensor | Monitoring | wired |
| listReadings / addReading | Monitoring | wired (OP-7 unit nit) |
| listCells | Dashboard (legacy fallback), Monitoring | wired |
| **setCellCrop** | **none** | **ORPHAN (OP-5)** |
| getNdvi | Monitoring | wired (OP-10 empty-grid nit) |
| getPlan / savePlan | Dashboard, Calendar / usePlanEditor | wired |
| listSimulations / createSimulation / deleteSimulation | Simulations ×3 | wired |
| listCrops / createCrop | Crops, Dashboard, Calendar, designer palette / Crops | wired |

Orphan modules: `src/lib/climate.ts` (whole file, OP-4). Everything else in the lane's data layer has live consumers.

## Could NOT test

- Live click-throughs that mutate the persistent store (farm create/delete, simulation Run, sensor add) — traced only, to keep the audit read-only in spirit; store/hook logic verified by code.
- Open-Meteo geocode round-trip in a real browser session (network path verified by code + the weather/soil gates prove outbound network works headless).
- Actual offline/cached-badge behavior (would require killing the network) — verified by trace only.
- World3D DEFAULT_WEATHER behavior in-app (World lane's scope; noted here only to scope probe 4b).
