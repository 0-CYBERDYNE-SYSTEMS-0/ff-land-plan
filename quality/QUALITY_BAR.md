# Quality Bar — "Best Minecraft Farm Build" Standard

This is the contract every asset must beat. Critics judge screenshots against the
per-asset reference descriptions below plus the global rules. **PASS requires the
critic to be genuinely wowed** — as good as the best hand-built Minecraft farm
showcase renders, expressed in clean procedural voxel form.

## Global rules (all lanes)

1. **Voxel discipline.** Everything snaps to a voxel grid. No arbitrary-angle floats,
   no smooth cylinders/spheres where a stacked-voxel silhouette is expected. Sub-voxel
   detail (half/quarter steps) allowed sparingly for caps, rims and thin plates.
2. **Silhouette first.** Each asset must be identifiable from its outline alone at a
   glance — in close orbit view AND from above (plan view drives garden planning).
   Test: squint. If it becomes a blob, redo proportions.
3. **Palette discipline.** Use `PALETTE` from `src/creative/voxel.ts`. Max ~4 base hues
   per asset + deliberate accents. Saturation like Minecraft: earthy mid-tones, bright
   accents only where meaning lives (ripe fruit, flowers). Deterministic dithering
   (`fillDither`, seeded) for texture — never random noise per frame.
4. **Baked light logic.** Face shading comes from the kit (`buildVoxelGeometry`).
   Assets must read correctly under the showcase rig AND in flat light: top faces
   brightest, north darkest, crisp color steps between planes.
5. **Detail density without noise.** Hero assets (barn, greenhouse, animals, tomato)
   carry fine detail (trim, hinges, twine, feathers); background tiles stay calm.
   Detail must describe structure (boards, strata, joints), never sprinkle.
6. **Determinism.** Same seed → identical rebuilds. All randomness via `rng(seed)`.
7. **Performance sanity.** Merged geometries via the kit; no per-frame allocations;
   animation through `tick(obj, t, dt)` mutating transforms only.
8. **Scale language.** One voxel = 10 cm world scale for tiles/crops; creatures and
   buildings may use finer internal grids but must sit convincingly next to a 1 m tile
   and a 2 m fence.

## Lane A — Terrain & Soil

Reference standard: the ground should look like a lovingly-dressed Minecraft farm
diorama floor. Judges see top-down AND 3/4 views.

- `grass-*`: layered look — darker dirt sides with scattered stone specks, bright
  grass cap with 2–3 tone checker/dither, occasional blade tufts or tiny flowers
  rising 1–2 voxels; edges show a thin lip so neighboring tiles read as separate cuts.
- `soil-tilled-*`: furrows run one direction, 2–3 voxels deep, ridge tops catch light,
  valley floors dark; dry = dusty mid-brown mix, wet = deep chocolate with faint
  sheen specks; a few embedded clods/stones.
- `bed-raised-cutaway`: THE soil-strata hero — timber frame (corner posts proud,
  visible plank ends), cut-away face exposing distinct mulch / dark topsoil / lighter
  subsoil / stony base layers, each 1–2 voxels with mixed tones.
- paths: material identity obvious at plan view (pebble dots vs chips vs large flags);
  edges worn into the surrounding turf, no perfect rectangles.
- `pond-*`: water reads as water — depth-tinted center, lighter shore blend, animated
  subtle surface shimmer; edge tile transitions grass→mud→water in believable bands.
- `edge-cliff`: grass cap overhanging ½ voxel, exposed strata sides (soil→stone),
  occasional root or stone chunk.

## Lane B — Crops & Growth Stages

Reference standard: instantly readable crop identity per stage; growth sequence feels
like time-lapse footage. This lane carries the product — be ruthless.

- Every stage must differ in **silhouette, height AND color**, not just scale:
  s0 single sprout loop w/ seed husk hint → s1 paired true leaves → s2 structural
  foliage (crop-specific architecture appears) → s3 flowers/bud or heading start →
  s4 fruit/head clearly forming (green fruit / pale curd / green ears) → s5 harvest
  signal (ripe color pop, slight droop/shine, biggest mass).
- Crop anatomy correct: tomato has stake + twine + pinnate leaves + truss clusters;
  corn has broad arching blades + tassel + husked ear w/ silk; carrot tops are ferny
  and feathery; allium leaves are tubes; cucurbits sprawl with big rough leaves and
  tendrils; wheat develops tillers then golden heads with awns.
- Harvest-ready (s5) must trigger "pick me" at a glance — ripe accent colors from the
  palette, often with a slight lean or open husk.
- Plan-view readability: mature crops should read as distinct shapes from directly
  above (corn rosette vs tomato sprawl vs wheat grain mass).
- The six-stage row (`growth-demo`) must look like one continuous life cycle — shared
  DNA across stages, no jumps in leaf style or hue logic.

## Lane C — Structures & Infrastructure

Reference standard: clean Minecraft-build architecture — real construction logic,
no floating blocks, no flat texture walls.

- `barn`: red plank walls w/ darker corner posts & wall trim, white trim accents,
  big X-brace doors, hay loft door up top, gabled roof with stepped eaves and ridge,
  stone foundation course, weathered tone variation per plank run. This is the icon —
  spend detail here.
- `greenhouse`: arched hoophouse-style glasshouse — brick knee wall base, slightly
  gothic arch (near-vertical eaves, subtle crown peak) of translucent panes,
  galvanized hoop ribs + purlins reading through the glass, framed end walls with
  glazed door and louvre, ridge vent flaps propped open, interior bench + pots
  silhouetted through glass. Must stay visually distinct from `polytunnel`
  (glass panels on steel over a knee wall, not a sheet of film on timber rails).
- `polytunnel`: rounded hoop ribs visible through translucent film, film sagging
  subtly between ribs, tied-down ends with vent flaps.
- `chicken-coop`: raised on legs, ramp with cleats, nest box protruding, roof
  overhang, small perch door; reads adorable and functional.
- Fences/gate/trellis: joinery logic — posts capped, rails tenoned into posts, gate
  hangs with visible hinges + latch; segments visually tileable.
- Compost/rain/water props: function visible (fill line & layers, tap + drip puddle,
  downpipe), slats and bands give material truth.
- Every structure grounds correctly: blob shadow or foundation contact, nothing
  hovering.

## Lane D — Creatures, Tools & Atmosphere

Reference standard: Minecraft-animal charm with better proportions — head/body/leg
ratios believable, faces have character (eyes placed with intent).

- Creatures: correct species silhouette (chicken: plump body, upright tail, comb &
  wattle; cow: broad chest, muzzle patch, horn nubs, tail w/ tuft; pig: snout disc,
  curly tail hint, stubby legs; sheep: wool cap over head, fluffy body w/ darker
  legs/face; duck: bill + keeled tail). Eyes always contrast against surrounding
  voxels.
- Idle animations subtle & looping: head bob, tail flick, wing shuffle, weight shift.
  Nothing slides around or rotates whole-body like a toy.
- Tools: honest construction — watering can spout+rose+handle, wheelbarrow tray+wheel
 +legs+handles, hoe/pitchfork heads shaped like the tool; wood/metal palette split.
- Lighting presets: each preset must produce a distinctly different mood while keeping
  assets legible (noon crisp, dawn warm-pink low key, dusk amber-blue, night cool +
  brighter ambient than realistic, overcast soft-flat).
- Wind sway demo: gentle phase-offset ripple along a row (not uniform tilt); amplitude
  scales with plant height; zero jitter.

## Verdict protocol (critics)

Compare the screenshots side-by-side against these written reference specs. PASS only
if the asset could be featured in a premium voxel-farming-game trailer without
embarrassment. Otherwise REVISE with the single biggest gap first.
