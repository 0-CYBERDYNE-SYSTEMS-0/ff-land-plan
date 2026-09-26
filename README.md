# FarmFriend — Land & Garden Planner

[![CI](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/actions/workflows/ci.yml/badge.svg)](https://github.com/0-CYBERDYNE-SYSTEMS-0/ff-land-plan/actions/workflows/ci.yml)

FarmFriend is a local-first land and garden planning SPA. Design scale-accurate
plots, plan crops with real spacing data, generate planting calendars, and check
live weather/frost risk without a backend.

> Garden planning meets a lightweight digital twin: real crop data, live
> Open-Meteo weather, persistent local plans, and exportable plot maps.

## Stack

- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS 3** (Plus Jakarta Sans + JetBrains Mono)
- **Wouter** — lightweight client-side router (hash mode)
- **TanStack Query v5** — data fetching & cache
- **Recharts** — charts (Area, Bar, Line, Radar)
- **Radix UI** primitives — accessible low-level components
- **shadcn/ui**-style local components (Card, Button, Badge, …)
- **react-hook-form** + **Zod** — forms & validation
- **Sonner** — toasts
- **Lucide React** — icons

## Pages

| Path                     | Component      | Description                                      |
| ------------------------ | -------------- | ------------------------------------------------ |
| `/`                      | `Dashboard`    | Farm list, live weather, alerts, plan summaries  |
| `/farms/new`             | `FarmForm`     | Create a farm with geocoding and frost dates     |
| `/farms/:id/edit`        | `FarmForm`     | Edit farm metadata, location, and frost dates    |
| `/farms/:id/map`         | `PlotDesigner` | Canvas plot designer with stats, pairings, export |
| `/farms/:id/calendar`    | `Calendar`     | Crop calendar generated from the current plan    |
| `/farms/:id/weather`     | `Weather`      | Live Open-Meteo weather + 7-day forecast         |
| `/farms/:id/simulations` | `Simulations`  | Simulation run manager (deterministic engine runs) |
| `/farms/:id/monitoring`  | `Monitoring`   | Sensors, NDVI, alerts, legacy cells              |
| `/crops`                 | `Crops`        | Crop library with agronomy filters               |
| `*`                      | `NotFound`     | 404                                              |

## Data

The app runs without a server. `src/lib/api.ts` exports the single API seam used
by pages; it currently points at `src/lib/localApi.ts`, backed by:

- `src/lib/store.ts` — persistent localStorage state under `ff-pro:v1`.
- `src/data/crops.ts` — real crop library with spacing, frost, yield, companion,
  and rotation metadata.
- `src/data/assets.ts` — placeable garden assets with real-world footprints.
- `src/lib/weather.ts` — live Open-Meteo weather/forecast/history with local
  last-good fallback.

Legacy cell, sensor, and NDVI APIs remain for Monitoring and Dashboard. The
Simulations page is a run manager over the deterministic engine (`src/lib/sim/`):
old slider-`Simulation` records stay readable/deletable, but creation is gone —
new what-ifs are `createSimRun` runs. Plot Designer uses `getPlan`/`savePlan`
and the sparse `PlanState` model instead of legacy `FarmCell`.

The API seam mirrors these logical endpoints:

- `GET    /api/farms`
- `GET    /api/farms/:id`
- `POST   /api/farms`
- `PATCH  /api/farms/:id`
- `DELETE /api/farms/:id`
- `GET    /api/farms/:id/weather`
- `GET    /api/farms/:id/forecast`
- `GET    /api/farms/:id/weather/history?limit=24`
- `GET    /api/farms/:id/alerts`
- `PATCH  /api/alerts/:id/read`
- `POST   /api/farms/:id/alerts/read-all`
- `GET    /api/farms/:id/sensors`
- `POST   /api/farms/:id/sensors`
- `DELETE /api/sensors/:id`
- `GET    /api/sensors/:id/readings?limit=20`
- `POST   /api/sensors/:id/readings`
- `GET    /api/farms/:id/cells`
- `POST   /api/farms/:id/cells`
- `GET    /api/farms/:id/plan`
- `POST   /api/farms/:id/plan`
- `GET    /api/farms/:id/ndvi-estimate`
- `GET    /api/farms/:id/simulations` (legacy records, read-only)
- `DELETE /api/simulations/:id` (legacy records)
- `GET    /api/farms/:id/sim-runs`
- `POST   /api/farms/:id/sim-runs`
- `DELETE /api/sim-runs/:id`
- `GET    /api/crops`
- `POST   /api/crops`

### Swapping in a backend

Set `VITE_API_BASE_URL` (see `.env.example`) to a base URL serving the endpoint
contract above — including its prefix, e.g. `http://localhost:8787/api` — and
`src/lib/api.ts` swaps `apiFetch` to `createRestApi(base)` from
`src/lib/restApi.ts`: a dependency-free `fetch` client covering every seam
method (farms CRUD, weather/forecast/history, alerts, sensors + readings,
legacy cells + NDVI, plans, simulations, sim runs, crops). One mapping
assumption: assigning a cell's crop posts to `/api/farms/:id/cells` with
`{ id, cropId }`, since the table defines only GET/POST on that collection.
Sim runs (`src/lib/sim/`) are deterministic engine runs over a forked plan:
`POST /sim-runs` takes a `CreateSimRunInput` (farm, dates, scenario,
interventions — never a full plan) and the server composes + replays the run,
returning a `RunRecord` (config + frozen daily env series + summary; per-tick
state is never stored — replay rebuilds it). Local-first remains
the default — with the variable unset or empty, the local store plus live
Open-Meteo weather (`src/lib/localApi.ts`) stays exactly as before.

## Develop

Requires Node 20+.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Type-check

```bash
npm run typecheck
```

## Production build

```bash
npm run build
npm run preview
```

Build artifacts land in `dist/`. The legacy build drop is preserved at `../ff-voxel-twin-legacy/` for reference.

## Smoke-testing (headless)

With the dev server running, screenshot any route and gate on runtime errors:

```bash
node tools/appshot.mjs "http://localhost:5173/#/farms/1/map" out.png 1440x900 --gate --expect "Plot Designer"
```

`--gate` fails on console errors / unhandled rejections; `--expect` asserts page
content. Dev-only URL hooks on the map page: `?ffview=world`, `?fftime=<0..1>`,
`?ffdebug=1` — placed in the real query string BEFORE the hash.

## Project layout

```
ff-voxel-twin/
├── index.html              # Vite entry; showcase.html = voxel asset browser
├── public/                 # Static assets (favicon, etc.)
├── src/
│   ├── main.tsx            # App bootstrap (+ DEV-only boot-probe wiring)
│   ├── App.tsx             # Theme + QueryClient + router
│   ├── index.css           # Tailwind + design tokens
│   ├── lib/                # api seam (localApi ⇄ restApi), store, weather,
│   │                       #   calendar, plan helpers, renderPlan (2D canvas),
│   │                       #   queryClient, achievements, geocode, frost
│   ├── data/               # crop catalog (47), asset library (27 slugs),
│   │                       #   seed farms, starter templates
│   ├── creative/           # procedural voxel asset library: voxel kit,
│   │                       #   terrain/ crops/ structures/ creatures/
│   │                       #   studio/ registries + showcase entry
│   ├── three/              # World3D systems & adapters: engine, sky (single
│   │                       #   sun), plants/ground/structures/animals/dressing,
│   │                       #   clouds/weather-fx/water/flight/tour/audio/perf,
│   │                       #   use3DEditor, historyViz
│   ├── components/
│   │   ├── ui/             # shadcn-style primitives
│   │   ├── layout/         # AppShell, Sidebar, Logo
│   │   ├── designer/       # usePlanEditor seam + BlueprintCanvas, toolbar,
│   │   │                   #   palettes, panels, TemplatesCard, ViewToggle
│   │   ├── world/          # World3D lazy island
│   │   └── …               # weather/, crops/, shared/, dev probe in src/dev/
│   ├── pages/              # One file per route
│   ├── hooks/              # useTheme, useFarms, useNavigation
│   └── types/              # Shared TypeScript types
├── quality/                # Mission contracts & verification logs (MISSION-*.md),
│                           #   asset gauntlet docs + screenshot evidence
└── tools/                  # appshot.mjs headless smoke gate · shot.mjs
                            #   (showcase) · update-progress.mjs (dashboard)
```

## Contributing

FarmFriend welcomes contributions! See [ROADMAP.md](ROADMAP.md) for priorities and open gaps, and [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, setup, and verification steps. Our community is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md). Report security vulnerabilities via [SECURITY.md](SECURITY.md).

## Data sources & attribution

FarmFriend integrates several free, public data sources:

- **Weather, forecast, soil moisture, UV, and climate data**: [Open-Meteo](https://open-meteo.com) (CC BY 4.0)
  - The Open-Meteo free API is for non-commercial use only. Commercial deployments require an [Open-Meteo API plan](https://open-meteo.com/en/pricing).
- **Soil properties**: [ISRIC SoilGrids](https://soilgrids.org) (CC BY 4.0)
- **NASA meteorological data**: [NASA POWER](https://power.larc.nasa.gov) (public domain)
- **Soil data lookups**: [USDA NRCS Soil Data Access](https://sdmdataaccess.nrcs.usda.gov)

All APIs are keyless and accessible from the browser. Data is fetched directly in the client; no data is sent to our servers.

## License

MIT — see `LICENSE`.
