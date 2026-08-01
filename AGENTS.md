# AGENTS.md

This file provides guidance to AI coding agents (ZCode / Codex) when working with code in this repository.

## Project

FarmFriend Voxel Digital Twin — a React 18 + TypeScript + Vite SPA for farm planning (voxel crop map, weather, sensors, simulations). The directory is `ff-land-plan` but the package name is `ff-voxel-twin`; both refer to this project.

## Commands

```bash
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build on port 4173
npm run typecheck  # tsc --noEmit — the primary verification gate
```

Caveats:
- `npm run lint` is defined but broken — ESLint is not installed and there is no config. Use `npm run typecheck` instead.
- There are no tests and no test runner.

## Architecture

**Mock API layer is intentional and is the app's data backbone — do not remove it.** The entire app runs with no backend:

- `src/lib/api.ts` exports `apiFetch`, which is currently the in-memory mock from `src/mock/api.ts`. This single export is the swap point for a real backend.
- `src/mock/api.ts` holds mutable in-memory state seeded from `src/mock/seed.ts`. State resets on page refresh by design. Its method surface (`MockApi` interface) mirrors the REST contract listed in README.md (`/api/farms`, `/api/sensors`, etc.), so a `fetch`-based client can drop in without touching pages.
- `src/types/index.ts` defines the domain types (`Farm`, `Weather`, `Sensor`, `Alert`, `Simulation`, …). Field names match the original backend's API contract — keep them in sync with the mock and README endpoint list when changing the data model.

**Data fetching:** TanStack Query v5. Hooks in `src/hooks/` (e.g., `useFarms.ts`) wrap `apiFetch` calls with explicit `queryFn`s and handle cache invalidation on mutations. `src/lib/queryClient.ts` also defines a default `queryFn` that joins the query key into a URL and `fetch`es it — that path is only exercised once a real backend exists; mock-backed hooks always pass their own `queryFn`. Queries use `staleTime: Infinity` and no retries.

**Routing:** Wouter in **hash mode** (`useHashLocation`) — URLs look like `#/farms/3/map`. Routes are declared in `src/App.tsx`; one page component per route in `src/pages/`. Farm-scoped pages receive `farmId` as a number prop parsed from the route param. Navigate via the `useNavigation()` shim in `src/hooks/useNavigation.ts`, not `useLocation()[1]` directly.

**Layout/providers:** `App.tsx` nests QueryClientProvider → ThemeProvider → Router → AppShell. `AppShell` (`src/components/layout/`) renders the sidebar, mobile header, and theme toggle. Theme is dark/light via a `dark` class on `<html>`, persisted to localStorage under `ff-voxel-twin:theme`.

**UI components:** `src/components/ui/` contains shadcn/ui-style primitives (local copies built on Radix; not managed by the shadcn CLI). Styling is Tailwind with design tokens in `src/index.css`; `cn()` from `src/lib/utils.ts` merges classes. Forms use react-hook-form + Zod; toasts use Sonner; charts use Recharts.

**Path alias:** `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.json`).

TypeScript is strict, with `noUnusedLocals`/`noUnusedParameters` enabled — unused imports fail the build.

## Related docs (read before changing sensitive areas)

- `README.md` — REST endpoint contract (`/api/farms`, `/api/sensors`, …). Keep mock + types aligned.
- `SPEC.md` — product spec / scope. Consult before scope-level changes.
- `HANDOFF.md` — current handoff notes (recently rewritten for the voxel 3D initiative — `src/three/`).
- `CLAUDE.md` — short companion guidance for Claude-style agents.
- `implementation-notes.md` — incremental implementation notes; useful for tribal context, not authoritative.
