# FarmFriend — Land & Garden Planner

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
| `/farms/:id/simulations` | `Simulations`  | What-if crop simulation runs                     |
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

Legacy cell, sensor, NDVI, and simulation APIs remain for Monitoring and
Simulations. Plot Designer uses `getPlan`/`savePlan` and the sparse `PlanState`
model instead of legacy `FarmCell`.

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
- `GET    /api/farms/:id/simulations`
- `POST   /api/farms/:id/simulations`
- `DELETE /api/simulations/:id`
- `GET    /api/crops`
- `POST   /api/crops`

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

## Project layout

```
ff-voxel-twin/
├── index.html              # Vite entry, Plus Jakarta Sans + JetBrains Mono preload
├── public/                 # Static assets (favicon, etc.)
├── src/
│   ├── main.tsx            # App bootstrap
│   ├── App.tsx             # Theme + QueryClient + router
│   ├── index.css           # Tailwind + design tokens
│   ├── lib/                # utils, API client, query client
│   ├── data/               # crop, asset, and seed data
│   ├── components/
│   │   ├── ui/             # shadcn-style primitives
│   │   ├── layout/         # AppShell, Sidebar, Logo
│   │   ├── weather/        # WeatherIcon
│   │   ├── crops/          # CropIcon
│   │   └── shared/         # Stat, PageHeader
│   ├── pages/              # One file per route
│   ├── hooks/              # useTheme
│   └── types/              # Shared TypeScript types
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
└── tsconfig.json
```

## License

MIT — see `LICENSE`.
