# MISSION CONTROL — Beta-Ready 3D World

Goal: for beta testers, painting a plan in the Plot Designer and switching to **World** must render the real
voxel asset library (`src/creative/`) — crops at correct growth stages, terrain tiles, structures, living
creatures — not the old placeholder boxes/blobs. Mock API stays. No new feature scope.

## Root cause (established)
`src/creative/` (4 lanes: terrain, crops ×6 stages, structures, creatures) was validated only via the
standalone showcase (`showcase.html`, `src/creative/showcase/main.ts`). The live renderer
`src/components/world/World3D.tsx` still builds from the old first-gen modules
`src/three/{plants,ground,structures,animals}.ts`. Nothing outside `src/creative/` imports it.

## Lane contracts (parallel-safe: disjoint files)
All lanes: TypeScript strict, `noUnusedLocals`/`noUnusedParameters` (unused imports fail the build).
Keep the public function signatures of the module you rewrite IDENTICAL so `World3D.tsx` keeps compiling.
Deterministic builders only. Dispose geometry/materials on teardown. Verify with
`npx tsc --noEmit` — ignore errors in files owned by OTHER lanes; your files must be clean.

### Lane 1 — Crops (owns `src/three/plants.ts`)
- Delegate to `makeCropFor(crop.name, stage)` from `src/creative/crops/map.ts` (maps every catalog crop name
  → archetype/palette/scale; returns null if unmapped).
- Growth stage 0–5 = `Math.round(growthScale * 5)` where growthScale comes from the existing
  date-scrub logic (`getGrowthScale`); no plantedAt → full-grown (stage 5).
- Keep old procedural geometry as fallback when `makeCropFor` returns null.
- Wind: new builders put foliage in child groups named `'sway'` — sway those, not the root.
- Keep exports: `PlantBatch`, `buildPlants`, `updatePlants`, `swayPlants`, `disposePlants`.

### Lane 2 — Terrain & Structures (owns `src/three/ground.ts`, `src/three/structures.ts`)
- Ground: use lane-A tile builders (`src/creative/terrain/`) keyed by `plan.ground` slug
  (grass variants, tilled soil, beds, paths, pond). Scale each tile to the plan's `cellM`.
  Batch per type; deterministic seeding per cell so tiles vary (grass-01/02/03 mix).
- Structures: pull from `src/creative/structures/registry.ts` — ids match designer slugs 1:1.
- Keep exports: `GroundBatch`, `buildGround`, `updateGround`, `disposeGround`;
  `StructureGroup`, `buildStructures`, `updateStructures`, `disposeStructures`.

### Lane 3 — Creatures & Scene (owns `src/three/animals.ts`; may patch `World3D.tsx` minimally)
- Rebuild `AnimalSystem` on lane-D builders (`buildHen/buildCow/…` + their `tick`s) from
  `src/creative/creatures/`. Keep exports `AnimalSystem`, `buildAnimals`, `updateAnimals`, `disposeAnimals`.
- Verify scene lighting suits the voxel palette (lit materials, not MeshBasic); normalize asset scale
  (creative assumes 1 voxel = 10 cm) via a bounding-box → target-size helper.
- Only touch `World3D.tsx` if wiring genuinely requires it (e.g. creature ticks, lighting tweak).

## Verification gate (mission control, after lanes merge)
1. `npm run typecheck` clean.
2. Browser: Sunrise Hollow (#/farms/3/map) → World view; tomatoes render as real tomato voxel plants;
   paint shed/fence/beehive → structures render; creatures visible/animated; date scrub changes growth stage.
3. Screenshot before/after evidence in quality/shots/.

## Status: LANES MERGED & VERIFIED (beta candidate)
- `npm run typecheck` — clean at repo root.
- Live-verified in browser on Sunrise Hollow: voxel tomato plants (stage-5, fruit visible), varied grass
  tiles + flowering patches, tilled-soil tiles, raised-bed structures, wheat stalks, props, and creatures
  near the coop all render from `src/creative/`. Evidence screenshots in `quality/shots/` (session artifacts).

## Remaining gaps / known risks (post-merge)
- Perf: creative assets are multi-mesh groups; large plans may need geometry merging (follow-up if frame
  time suffers; Perf HUD available via Debug toggle).
- Unmapped future crops fall back to old geometry (acceptable).
- Night lighting for new materials unverified — check time-of-day slider.
