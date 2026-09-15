# Creative Asset Inventory — Voxel Farm Digital Twin

Scope: **visual/creative assets only** (models, growth stages, terrain, creatures, props,
lighting, simple animation). No simulation engine, no backend, no non-visual tooling.

Every asset is a deterministic procedural voxel builder built on `src/creative/voxel.ts`
(palette, baked per-face shading, PRNG, fill helpers). Assets are previewed via
`showcase.html` and registered in a per-lane registry file.

Quality bar for every asset: `quality/QUALITY_BAR.md` (read together with this file).

---

## Lane A — Terrain & Soil (`src/creative/terrain/`) — registry: `terrain/registry.ts`

Ground tiles are the planning canvas. Each tile is one cell, top surface readable from
above (plan view) AND attractive in 3D orbit view.

| id | asset | notes |
|---|---|---|
| `grass-01/02/03` | meadow grass tiles | 3 deterministic variants; occasional tiny flowers |
| `grass-flower` | flowering meadow patch | scattered blossoms on grass base |
| `soil-tilled-dry` | tilled farmland, dry | visible furrow rows + clods |
| `soil-tilled-wet` | tilled farmland, moist | darker, richer; same furrows |
| `bed-raised-cutaway` | raised bed cross-section | wood frame + visible soil strata (mulch/top/sub) |
| `bed-inground` | in-ground bed | sunken tilled strip, edge blend to grass |
| `path-gravel` | gravel path tile | pebble scatter, worn edges |
| `path-woodchip` | woodchip path tile | chunky chip flakes |
| `path-stone` | flagstone path tile | cut stones + joints |
| `pond-center` | pond water tile | animated shimmer (tick hook), depth tint |
| `pond-edge` | pond shoreline tile | grass→mud→water transition |
| `edge-cliff` | island rim turf block | grass cap + exposed soil/stone strata sides |

## Lane B — Crops & Growth Stages (`src/creative/crops/`) — registry: `crops/registry.ts`

Six stages each: `s0` sprout → `s1` seedling → `s2` vegetative → `s3` flowering/bud →
`s4` fruiting/heading → `s5` harvest-ready (visibly "pick me"). Stage entries generated
per archetype as `<archetype>-s0..s5`. All 40 catalog crops map onto these archetypes
with palette variants in `crops/map.ts`.

| archetype | covers catalog crops |
|---|---|
| `tomato` | Tomato (stake + twine, fruit clusters green→red) |
| `leafy-head` | Lettuce, Cabbage, Cauliflower (rosette→tight head) |
| `wheat` | Wheat (tillers→golden ears) |
| `corn` | Sweet Corn (stalk, tassel, ear w/ silk) |
| `root-carrot` | Carrot, Radish, Beet (ferny tops, colored shoulders at harvest) |
| `allium` | Onion, Garlic, Leek (tube leaves, bulb swell, seed heads) |
| `potato` | Potato (bushy mound, flowers, hilled soil) |
| `brassica` | Broccoli, Kale (open leaves→curd/florets) |
| `greens-open` | Spinach, Arugula, Swiss Chard (open leaf cluster, chard stems) |
| `cucurbit-vine` | Pumpkin, Zucchini, Melon, Cucumber (sprawl, big blossom, fruit) |
| `legume-trellis` | Pole Bean, Pea (climb trellis, hanging pods) |
| `bush-bean` | Bush Bean (low mound, hanging pods) |
| `strawberry` | Strawberry (crown, runners, white flower→red berries) |
| `herb-clump` | Basil, Parsley, Cilantro, Dill (soft leaf clump; dill feathery) |
| `herb-shrub` | Rosemary, Thyme, Sage, Oregano, Chives (woody shrub / chive spears) |
| `berry-bush` | Raspberry, Blueberry (canes/bush, berry clusters) |
| `apple-tree` | Fruit Tree / Apple (trunk, scaffold limbs, canopy, fruit) — also the `fruit-tree` placeable |
| `mushroom` | Mushroom (domed caps on stems, cluster habits; feeds the Mushroom Warehouse farm theme) |

Also in lane B: `growth-demo` — one row showing all six stages of tomato side by side
(the canonical "how growth reads" exhibit).

## Lane C — Structures & Infrastructure (`src/creative/structures/`) — registry: `structures/registry.ts`

Matches the designer's asset library (`src/data/assets.ts`) slugs 1:1, plus iconic extras.

| id | asset | notes |
|---|---|---|
| `barn` | classic red barn | icon of the set: plank walls, gable roof, big doors, hay loft |
| `shed` | garden shed | small timber, pitched roof, door + window |
| `greenhouse` | glass greenhouse | arched hoophouse-style house: brick knee wall, gothic arch of glazed panes on galvanized ribs + purlins, framed gables, door, ridge vents, louvre, interior benches hint |
| `polytunnel` | polytunnel | hoop ribs + translucent film, tied ends |
| `cold-frame` | cold frame | low angled glazed lid over timber box |
| `chicken-coop` | chicken coop | raised house, ramp, run fence hint, nest box |
| `fence-post-rail` | post-and-rail fence segment | 2 rails, repeatable |
| `fence-picket` | picket fence segment | repeatable |
| `gate` | farm gate | hangs between fence posts, hinges + latch |
| `trellis` | flat trellis panel | lattice for climbers |
| `compost-bin` | compost bin | slatted timber, fill line, fresh/dark layers |
| `rain-barrel` | rain barrel | barrel + lid + tap + downpipe elbow |
| `ibc-tote` | IBC water tote | caged tank on pallet |
| `water-tap` | standpipe tap | post + spout + drip puddle |
| `irrigation-line` | irrigation drip line | low line + emitters (reads in plan view) |
| `beehive` | beehive | stacked boxes + landing board (+ static bees ok) |
| `hay-bale` | square hay bale | flaked sides, twine bands |
| `crate-stack` | harvest crates | stacked slatted crates |
| `signpost` | plot signpost | post + board + carved arrow |
| `scarecrow` | scarecrow | pole cross, straw head, patched shirt |
| `grow-tent` | indoor grow tent | fabric panels + frame connectors, zippered edge, interior glow bars over seedling trays |
| `fruit-tree` | orchard fruit tree placeable | flared trunk, root buttresses, scaffold limbs, lobe canopy with fruit on the surface |
| `grow-light` | LED grow light bar | grounded floor stand (T-feet), LED underside strip + side glow, driver box, cable to plug |
| `plant-rack` | vertical grow rack | metal shelving with joint bands, seedling trays per shelf, LED bar under top shelf, castors |
| `hydro-channel` | hydro NFT channel | sloped channel on legs, lettuce in every hole, inlet fitting, feed line |
| `clip-fan` | clip-on fan | 16-segment ring cage, pitched blades, clamp jaws + wing screw, tilt joint |
| `hvac-unit` | HVAC unit | louvered case, grid-aligned elliptical fan intake (ring + spokes + hub) |
| `grow-bench` | potting bench | continuous rim lip, calm deck dither, seed tray with cuttings + spare pot |

## Lane D — Creatures, Tools & Atmosphere (`src/creative/creatures/`, `src/creative/studio/`) — registry: `creatures/registry.ts`

Creatures (voxel-built, correct proportions, cute-but-natural, idle tick hooks):
`chicken`, `rooster`, `cow`, `pig`, `sheep`, `duck` — plus refined `bee` and
`butterfly`. Each gets an idle animation (head bob, tail flick, wing flutter) via
`tick`.

Tools & props: `watering-can`, `wheelbarrow`, `hoe`, `pitchfork`, `seed-bag`,
`bucket`.

Atmosphere:
- `studio/presets.ts` — SHOWCASE-ONLY: superseded in the app by `src/three/sky.ts`
  (single-sun system); entries stay functional for showcase diorama cells only.
  Lighting presets `dawn`, `noon`, `dusk`, `night`, `overcast`
  (hemisphere+key light colors/intensities/fog), exported as data + applied via
  registry `tune()` demo entries `preset-dawn` … so they can be judged visually.
- `wind-sway-demo` — row of wheat + tomato swaying (canonical wind animation).
- water shimmer util shared with Lane A's pond.

---

## Out of scope (explicitly)

Simulation engine logic, backend/mock API changes, UI panels, audio synthesis beyond
what exists, World3D rewiring (integration happens after assets are final).
