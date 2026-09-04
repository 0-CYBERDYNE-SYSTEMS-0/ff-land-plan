# SPEC — FarmFriend Pro: Real Land & Garden Planning

Branch: `pro-upgrade` · Restore point: `main @ 770c186`

## Mission

Turn the voxel-twin demo into a **professional, genuinely useful, fun** land & garden
planning tool. Three pillars:

1. **Real data** — a real horticultural crop dataset and a real garden asset library.
   No fake numbers where real ones exist.
2. **Real planning power** — a scale-accurate plot designer with spacing math,
   companion intelligence, and a planting calendar.
3. **Real weather** — live conditions and forecasts from Open-Meteo (free, keyless,
   CORS-enabled), with real frost/heat alerts derived from the actual forecast.

---

## P0 — Core (must ship)

### 1. Real crop dataset (`src/data/crops.ts`)

Replace the 8 thin seed crops with **~40 real garden crops**, each carrying real
horticultural data:

| Field | Example (Tomato) |
| --- | --- |
| `name`, `scientificName`, `category` | Tomato, *Solanum lycopersicum*, vegetable |
| `family` (botanical, for rotation/companions) | Solanaceae |
| `spacingCm` / `rowSpacingCm` | 50 / 90 |
| `sowDepthCm` | 0.6 |
| `daysToMaturity` | 75 |
| `frostTolerance` | `tender` \| `half-hardy` \| `hardy` |
| `sowIndoorsWeeksBeforeLastFrost` | 6 (null if not started indoors) |
| `transplantWeeksAfterLastFrost` / `directSowWindow` | 1 / null |
| `harvestWindowDays` | 60 (length of picking season) |
| `companions` / `antagonists` (crop slugs) | basil, carrot / fennel, brassicas |
| `sunRequirement`, `waterNeedMmDay`, `nitrogenNeed` | full, 5.5, high |
| `yieldKgPerPlant` | 4.5 |
| `colorHex`, `emoji` | #D4380D, 🍅 |

Coverage: the common kitchen-garden canon — tomatoes, peppers, lettuce, carrots,
beets, onions, garlic, potatoes, brassicas (broccoli, cabbage, kale, cauliflower),
cucurbits (cucumber, zucchini, squash, pumpkin, melon), legumes (bush/pole beans,
peas), corn, herbs (basil, parsley, cilantro, dill, thyme, rosemary, sage, oregano,
chives, mint), fruit (strawberry, raspberry, blueberry, apple), salads (spinach,
arugula, chard, radish), plus cover crops (crimson clover, winter rye) and
pollinator flowers (marigold, nasturtium, sunflower, borage).

### 2. Garden asset library (`src/data/assets.ts`)

Real placeable objects for the twin, each with a real-world footprint (meters),
render style, and metadata:

- **Growing**: raised bed (1.2×2.4 m default, resizable), in-ground bed, greenhouse,
  polytunnel, cold frame, trellis, fruit tree (canopy circle)
- **Infrastructure**: path (gravel/woodchip/stone variants), fence, gate, shed,
  compost bin (3-bay), rain barrel, IBC tote, water tap, irrigation line, pond
- **Life**: beehive, chicken coop + run

Each asset: `{ slug, label, category, defaultWMeters, defaultHMeters, resizable,
colorHex, pattern ('solid'|'stripes'|'dots'|'cross'), emoji, blocksPlanting }`.

### 3. Plot Designer (replaces VoxelMap, same route `/farms/:id/map`)

Scale-accurate grid editor. **Cell = 25 cm × 25 cm** (garden resolution). Plan
dimensions configurable per farm (default 20 m × 12 m → 80×48 cells), max 60×60 m.

Two layers:
- **Ground layer**: assets/objects painted as rectangles (beds, paths, structures).
- **Planting layer**: crops painted onto cells; only valid on bed cells (or bare soil
  — configurable "allow planting outside beds" toggle, default on for fields).

Tools (toolbar + keyboard):
- **Select/inspect (V)** — click a cell/object → side panel shows details (crop info,
  spacing, plant count contribution, companions present nearby).
- **Plant brush (B)** — drag-paint crops. Brush size 1×1 / 3×3.
- **Rectangle (R)** — drag a rectangle to fill (crop or asset).
- **Asset placement (A)** — pick from asset palette, drag footprint onto grid.
- **Erase (E)** — drag-erase (per-layer: erase plants or erase objects).
- **Pan/zoom** — wheel zoom (4 levels), drag-pan with space/middle-mouse; at high
  zoom show crop emoji per cell, at low zoom solid colors.

Intelligence (live, always-on):
- **Plant counts**: contiguous painted region area × real spacing → "≈ 14 tomato
  plants". Shown per crop in side panel.
- **Companion check**: for every crop region, scan adjacent (8-neighborhood within
  1 m) regions; antagonist adjacency → amber outline + warning list ("Fennel
  inhibits tomato — keep 1 m apart"). Companions → subtle green glow note.
- **Stats bar**: planted area, bed area, path area, est. total yield (kg), water
  demand (L/day), biodiversity (distinct families).

Editing affordances:
- **Undo/redo** (Cmd/Ctrl+Z, Shift+Cmd+Z), 50-step history.
- Autosave to localStorage (debounced 500 ms) — no Save button anxiety; show
  "Saved ✓" indicator.
- Plan settings dialog: dimensions (m), planting-outside-beds toggle.

### 4. Real weather (`src/lib/weather.ts`)

Open-Meteo, keyless:
- `GET api.open-meteo.com/v1/forecast` — current: temp, apparent temp, humidity,
  wind, precip, cloud cover, WMO code; hourly: soil temp 0 cm, soil moisture 0–1 cm,
  UV; daily 7-day: min/max temp, precip sum, WMO code.
- Map into the existing `Weather`/`ForecastDay` types (WMO codes already match).
- Cache per farm coordinates for 15 min (TanStack Query staleTime).
- Graceful offline fallback: last-good response persisted to localStorage,
  shown with a "stale" badge.

**Real alerts** derived from the live forecast (computed client-side, replacing seed
alerts): frost (min ≤ 2 °C within 72 h → severity by ≤ 0/−4), heat (max ≥ 35 °C),
heavy rain (≥ 25 mm/day), dry spell (7-day precip < 5 mm). Alerts reference the
forecast day. Read/unread state persisted locally.

### 5. Persistence (`src/lib/store.ts`)

All user data (farms, plans, custom crops, alert read-state) lives in
localStorage (`ff-pro:v1`), loaded at boot, written debounced. The existing
`MockApi` surface stays — its implementation becomes the persistent store + real
weather client, so pages keep working through the same seam (`src/lib/api.ts`).
Refresh no longer wipes work. Seed data loads only on first run.

### 6. FarmForm upgrades

- **Location search**: Open-Meteo geocoding API (keyless) — type a town name →
  pick a result → lat/lng + elevation auto-filled. Manual lat/lng still editable.
- **Frost dates**: last/first frost date fields, defaulted from a latitude-based
  estimate (documented heuristic), user-overridable. Drives the calendar.

## P1 — High value (ship if P0 lands cleanly)

### 7. Planting calendar (`/farms/:id/calendar`)

For every crop in the farm's plan: horizontal timeline (Jan–Dec) bars for
**sow indoors → transplant → direct sow window → harvest window**, computed from
the farm's frost dates + crop data. Today marker. Sorted by next actionable date.
"This week" panel: what to sow/transplant/harvest right now.

### 8. Exports

- **PNG**: render the plan grid to `<canvas>` (legend + scale bar + title) → download.
- **Shopping list CSV**: crop, variety, plants needed, spacing, seeds est.
  (plants × 1.5 safety), sow window.

### 9. Crops page upgrade

Library cards show spacing, family, frost tolerance, companions/antagonists chips,
emoji. Search + family/category/frost filters.

## P2 — Stretch

- JSON backup export/import of all data.
- Print-friendly plan summary page.
- Dashboard "garden pulse": next 3 calendar actions + live frost risk.

## Out of scope (explicitly)

- Backend/server, auth, multi-user.
- True 3-D rendering (stay 2-D top-down voxel; it's the charm).
- Crop rotation history across seasons (data model allows later: plantings carry
  `plantedYear`).
- Removing Sensors/NDVI/Simulations pages — they stay as-is this round.

## Amendments (post Opus review — binding)

1. **Renderer**: the Plot Designer grid is a single `<canvas>`, never DOM cells.
   Grid data lives in refs with imperative redraw; React state holds only UI chrome
   (tool, crop, stats). The same draw routine powers the PNG export.
2. **Plan model**: new sparse `PlanState` — `{ widthM, heightM, cellM: 0.25,
   planting: Record<"x,y", {cropId}>, ground: Record<"x,y", {assetSlug}> }` —
   replaces `FarmCell` for the designer. Legacy `FarmCell` methods stay on the API
   surface untouched (other pages may read them); new `getPlan`/`savePlan` added.
3. **Plant counts**: per-crop summed cell area (no flood-fill / region detection).
   `plants = floor(cells × 0.0625 / (spacing × rowSpacing in m²))` — area is
   additive, regions are invisible to the user.
4. **Companion check**: crop-pair level. For each painted cell, check a radius-4
   cell box (1 m) against antagonist crops' cell `Set<"x,y">`. No region scan.
5. **Open-Meteo soil data is hourly-only**: request `soil_temperature_0cm`,
   `soil_moisture_0_to_1cm` in `hourly=`, locate `current.time` in `hourly.time`,
   read that index. Always pass `&timezone=auto`.
6. **Weather query**: must set its own `queryFn` and `staleTime: 15 min`
   (global default is `Infinity` + a URL-joining default queryFn — both wrong here).
7. **Undo/redo**: snapshot per stroke (mousedown→mouseup), 50 snapshots max.
   This and the asset layer are the de-scope cut line if budget runs short.
8. **Frost heuristic** (documented): `L = clamp(|lat|, 0, 67)`;
   `season = clamp(365 − 6.4·L, 30, 365)`; midpoint = day 203 (N) / day 21 (S);
   last frost = mid − season/2, first frost = mid + season/2 (mod 365);
   if `L < 10` → no frost dates (null) and the calendar treats everything as
   direct-sow year-round. Elevation: shrink season by ~2 days per 100 m.
9. **Approved cheap wins**: live plant-count readout while painting; "frost risk
   this week" badge on calendar actions; zoom-to-fit button + 1 m gridlines.
10. **Build order**: canvas+zoom/pan → brush/erase+autosave → assets+rect tool →
    stats/counts → companions → undo/redo → weather → form → calendar → exports.

## Quality gates

- `npm run typecheck` clean; `npm run build` clean.
- Every page loads and functions with no console errors (verified via browser QA).
- No regressions: dashboard, farm CRUD, crops, weather, monitoring, simulations
  all still work.
- README updated; `implementation-notes.md` kept current throughout.

## Verification plan

1. Typecheck + build after each phase.
2. Browser smoke test: create farm via geocoded location → real weather renders →
   design a plot (beds, paths, crops) → see counts/conflicts → refresh → plan
   persists → calendar shows sensible dates → export PNG + CSV.

## Scope addendum (2026-08-25 — post-original-spec missions, binding)

The original P0/P1/P2 scope shipped in full. Two later efforts extended the
product beyond that spec; both were run as mission contracts with verification
logs and are now part of the product surface:

1. **3D World & creative asset library** (`01d67a6` + predecessors): vanilla
   three.js World view; `src/creative/` procedural voxel library (157
   builders: terrain tiles, crops ×6 growth stages for all 47 catalog crops,
   20 structures, creatures/tools/atmosphere) wired into the live renderer via
   thin adapters; fun-UX game layer (sky/clouds/weather FX/flight/tour/animals/
   audio/achievements/perf HUD). Asset quality governed by
   `quality/QUALITY_BAR.md` ("best Minecraft farm build" standard).
2. **Beta hardening** (`e6e4031`, `quality/MISSION-BETA.md`): live weather
   drives the 3D world (graceful offline); single-sun lighting; typed REST
   backend swap (`VITE_API_BASE_URL` → `src/lib/restApi.ts`, default stays
   local-first); automated headless smoke gate (`tools/appshot.mjs`).
3. **Blueprint power tools** (`2c29eb9`, `quality/MISSION-BLUEPRINT.md`):
   Pick/Fill/Line tools, ghost previews, spacing-violation + companion
   overlays (real catalog math), layer toggles, zoom controls, starter
   templates, recently-used palettes; barn/hay-bale/signpost/scarecrow/
   crate-stack/picket-fence paintable (barn wakes livestock); structures
   render one instance per contiguous region sized from their planning
   footprint; tool props auto-dress scenes.

Still true from the original spec: local-first persistence, no backend
required, Open-Meteo as the weather source, `npm run typecheck` as the gate.
New standing laws introduced since: RenderOptions overlays default OFF (shared
renderer), zero PlanState schema changes without optional/additive fields, all
plan mutations through `usePlanEditor`.
