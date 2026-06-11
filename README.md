# FarmFriend — Voxel Digital Twin

A real-time voxel digital twin platform for farms and gardens. Plan, simulate, and optimize your operation with live weather, satellite data, and AI-powered insights.

> Minecraft-style farm planning meets precision agriculture. Real GPS terrain, live weather, crop simulations.

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

| Path                       | Component         | Description                          |
| -------------------------- | ----------------- | ------------------------------------ |
| `/`                        | `Dashboard`       | Farm list, weather, alerts           |
| `/farms/new`               | `FarmForm`        | Create a farm (GPS, soil, area)      |
| `/farms/:id/edit`          | `FarmForm`        | Edit farm metadata                   |
| `/farms/:id/map`           | `VoxelMap`        | CSS-grid voxel editor (paint crops)  |
| `/farms/:id/weather`       | `Weather`         | Live weather + 7-day forecast        |
| `/farms/:id/simulations`   | `Simulations`     | What-if crop simulation runs         |
| `/farms/:id/monitoring`    | `Monitoring`      | Sensors, NDVI, alerts                |
| `/crops`                   | `Crops`           | Crop library with categories         |
| `*`                        | `NotFound`        | 404 with sprout-flavored copy        |

## API contract

The app expects a backend at `/api` (proxied to `port/5000` in the legacy build). For local development without a server, the app uses an in-memory mock layer in `src/mock/`. Swap that out by pointing the `apiFetch` helper in `src/lib/api.ts` at a real server.

Endpoints consumed:

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
│   ├── components/
│   │   ├── ui/             # shadcn-style primitives
│   │   ├── layout/         # AppShell, Sidebar, Logo
│   │   ├── weather/        # WeatherIcon
│   │   ├── crops/          # CropIcon
│   │   └── shared/         # Stat, PageHeader
│   ├── pages/              # One file per route
│   ├── hooks/              # useTheme
│   ├── types/              # Shared TypeScript types
│   └── mock/               # In-memory mock data layer
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
└── tsconfig.json
```

## License

MIT — see `LICENSE`.
