# Implementation Notes — FarmFriend Pro upgrade

Running log of decisions made during implementation that weren't in the spec,
things changed along the way, and tradeoffs. Newest entries at the bottom of each
section. Spec: `SPEC.md`. Restore point: `main @ 770c186`, work on `pro-upgrade`.

## Workflow

- Orchestrator (Fable) wrote the spec and implements core; Opus reviewed the spec;
  Haiku handles git checkpoints; Sonnet runs verification passes.

## ⚠ Top traps (from Opus review — verified, not speculation)

1. Open-Meteo soil temp/moisture are **not available in `current=`** — hourly only.
   Read the hourly array at the index of `current.time`, with `timezone=auto`.
2. The global QueryClient has `staleTime: Infinity` and a default queryFn that
   fetches the query key as a URL. Weather queries must override both.
3. The designer grid must never be DOM nodes (3,840–57,600 cells). Canvas only,
   cell map in refs, React state for chrome only.

## Decisions not in the spec

- **Kept the `MockApi` interface name** even though weather is now real and data is
  persistent — renaming the seam would touch every page for zero user value. The
  type is re-exported as `Api` for new code. (Rationale: surgical changes.)

## Tradeoffs

- **localStorage over IndexedDB**: plans at max size (240×240 cells) serialize to
  well under 1 MB; localStorage is synchronous-simple and good to ~5 MB. IndexedDB
  would add async complexity for no practical gain at this data size.

## Data sourcing

- Crop spacing/companion/frost data: standard horticultural reference values
  (the kind printed on seed packets / extension-service tables). Where sources
  disagree (e.g., tomato spacing 45–60 cm), the mid-range value was chosen.
- Weather: Open-Meteo (open-meteo.com) — free, no API key, CC-BY 4.0 attribution
  added to the Weather page footer.

## Decisions made during phases 1–3 (chronological)

- **Pre-existing typecheck failures fixed**: the repo had never actually been
  typechecked (node_modules wasn't installed, `tsc` unavailable, lint broken).
  Fixed unused imports in AppShell/Sidebar/Stat/Crops and a wouter route-typing
  error in App.tsx as part of the quality gate.
- **Crop ids 1–5 pinned** to the legacy seed values so old demo voxel cells
  still render with the new 47-crop library. Custom crops start at id 1000.
- **Soil moisture unit conversion**: Open-Meteo returns volumetric m³/m³;
  mapped to a 0–100% display value via ×200 (0.5 m³/m³ ≈ saturated ≈ 100%).
- **Alerts are fully derived** from the live forecast with deterministic hash
  ids (farm:type:date) so read-state survives recomputation; the old seeded
  alerts (incl. 'pest'/'nutrient' types) are gone — those types remain in the
  TS union for future use.
- **`src/mock/` deleted**; seeds moved to `src/data/seed.ts` (only farms,
  legacy cells, sensors, sims, NDVI — crops/weather/alerts are real now).
- **Garlic & cover crops** get approximate fall-sowing windows expressed as
  +26..+30 weeks after *last* frost (the calendar model is last-frost-relative);
  good enough for v1, noted as future work to model first-frost-relative sowing.
- **Weather page attribution** (Open-Meteo CC-BY) still needs to be added when
  the Weather page is touched in Phase 4/7.
- **Plot Designer page landed** as `src/pages/PlotDesigner.tsx`, replacing the
  old DOM-cell `VoxelMap` at the existing `/farms/:id/map` route. It keeps the
  `PlanState` in a ref, redraws the shared `drawPlan()` canvas renderer
  imperatively, and leaves React state for toolbar/sidebar chrome, stats,
  pairings, hover/selection, and saved status.
- **Designer editing model**: brush/erase/asset stamping mutate sparse cell maps
  during drag; rectangle fill commits on pointer-up; each stroke records one
  shallow plan snapshot for undo/redo (50 max) and schedules a 600 ms autosave
  through `apiFetch.savePlan`. Non-plantable assets clear plants underneath.
- **Build hygiene**: `tsc -b` was emitting `vite.config.js` and
  `vite.config.d.ts` into the repo root from the referenced node config. Moved
  that output to `node_modules/.tmp/` via `tsconfig.node.json` so `npm run build`
  leaves the worktree clean.
- **Farm form location/frost upgrade**: create/edit now supports Open-Meteo
  geocoding search, stores elevation, and exposes user-editable `MM-DD` frost
  fields. Selecting a place or pressing "Estimate from latitude" applies the
  documented latitude/elevation heuristic, with blank fields representing
  frost-free climates.
- **Dashboard plan awareness**: farm cards now read `getPlan` and compute
  planted area, approximate plant counts, and estimated yield from `PlanState`
  when a plan exists; legacy `FarmCell` coverage remains the fallback for seed
  data/monitoring compatibility. Dashboard weather and alert queries now use a
  15-minute `staleTime` instead of inheriting the global infinite cache.
- **Planting calendar**: added `src/lib/calendar.ts` and
  `/farms/:id/calendar`. Calendar actions are generated only for crops painted
  in the plan and only when the crop has sow/transplant/direct-sow metadata;
  harvest windows require a real outdoor start. Frost-free farms get year-round
  direct-sow windows for crops with calendar anchors.
- **Exports and crop library polish**: Plot Designer now downloads PNGs through
  the shared safe canvas renderer and CSV shopping lists from current plan
  stats. Crop Library cards now expose emoji, spacing, family, frost tolerance,
  and companion/antagonist chips, with added family and frost filters.

## Known gaps / future work

- Per-query `staleTime` overrides for weather queries in existing pages
  (they currently inherit `Infinity`; data refreshes only on full reload).
- First-frost-relative sowing windows for fall-planted crops.
- HANDOFF.md describes the exact resume point (Phase 3 page component).
