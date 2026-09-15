# MISSION: ENVIRONMENTS — reliable indoor growing scenes as first-class farm worlds

Branch: `indoor-environments` (off `pro-upgrade` @ d979a13). Date: 2026-09-13.

## Mission

Indoor/protected growing environments become **first-class, reliable voxel scene types** — the
"constant shell" our existing crop/equipment assets plant inside — grounded in real controlled-
environment-agriculture (CEA) practice (see `quality/RESEARCH-CEA-ENVIRONMENTS.md`), usable by
the Blueprint planner, the 3D world, and the simulation — replacing today's plain-box shells with
recognizable, researched environments. Some farms are the flat outdoor field (unchanged); others
are hoophouses, grow tents, greenhouses, grow rooms, or vertical-farm warehouses.

## What already exists (do not re-invent)

Commit `9f1bf11` shipped the architecture this mission builds on:

- `PlanSurface = 'outdoor' | 'greenhouse' | 'tent' | 'indoor'` on `PlanState.surface`
  (`src/types/index.ts:194`) — one surface per plan canvas, chosen in the plan Settings drawer.
- Whole-canvas enclosure shells (`src/three/shell.ts`) — cheap BoxGeometry "dollhouse" shells.
- Indoor equipment assets (`grow-light`, `plant-rack`, `hydro-channel`, `clip-fan`, `hvac-unit`,
  `grow-bench`) + floor tiles (`floor-mylar/concrete/greenhouse`).
- Sim shelter: `SURFACE_SHELTER` (`src/lib/growth.ts:49`), `shelteredTemps` (`src/lib/sim/drivers.ts`),
  `SimState.surface` + mid-run `surface` interventions; `SURFACE_PLANT_SCALE` (`growth.ts:61`);
  shelf-lifted plants (`SHELF_LIFTS`, `src/three/plants.ts:175`).
- Seed demo farms 5/6/7 with tent/indoor/greenhouse plans.

**The gap this mission closes:** shells are anonymous boxes, only 4 surfaces exist, none of it is
research-grounded, and there is no previewable catalog of environment scenes.

## Scope — surface taxonomy (6 surfaces)

Two NEW plan surfaces join the four existing ones (additive enum values; old plans unaffected):

| surface | Real archetype(s) | Climate semantics (research A#) | Scene read |
|---|---|---|---|
| `outdoor` | open field | full weather (existing) | island + grass |
| `greenhouse` | heated glazed house (A2/A3) | moderated, shelter 0.35 (existing) | glazed A-frame, mullions, ridge vents |
| `hoophouse` **NEW** | passive poly high tunnel (A4) | unheated film: sunny-day gain, near-outdoor nights | hoop arcs + poly, roll-up side crease, wood end wall, in-ground beds |
| `tent` | residential grow tent (A6) | fully conditioned (existing) | black canvas tent, zipper, duct stubs, carbon filter, LED glow |
| `indoor` | spare-room grow room (A7) | fully conditioned (existing) | room walls, mylar sheen, flood tables, ducting |
| `warehouse` **NEW** | vertical-farm hall (A9) | sealed + weather-blind | dark hall, glowing multi-tier rack rows, aisle markings, HVAC/duct columns |

Deferred (roadmap only, see Non-goals): `container` farm, mushroom house, lean-to, NFT/DWC/
microgreens as *surfaces* — NFT/DWC/aquaponics/nursery arrive as **equipment assets + dioramas**
instead, because they are growing systems inside a shell, not shells.

## Constants

Compiler-forced tables (`Record<PlanSurface, …>` — typecheck fails until extended):
`SURFACE_SHELTER`, `SURFACE_PLANT_SCALE` (growth.ts), `SURFACE_FLOOR` (ground.ts).
**String-keyed tables the compiler will NOT force** (manual audit required, red-team finding):
`SURFACE_AMBIENT` (World3D — currently `Record<string, number>` with a `?? 1` fallback;
RETYPE to `Record<PlanSurface, number>` and drop the fallback), `SURFACE_OPTIONS`
(DesignerToolbar — plain array), `SLUG_MAP`/`SLUG_TILES` (structures.ts/ground.ts — a missing
key silently never renders in 3D). The weather-FX gate is a positive `=== 'outdoor'` test and
needs NO change — new surfaces are gated automatically; do not rewrite it into an enumeration.

Research-justified values for the two new surfaces:

| Constant (file) | hoophouse | warehouse | Rationale |
|---|---|---|---|
| `SURFACE_SHELTER` `src/lib/growth.ts:49` | **0.55** | **0.06** | Passive film tunnel sits between the open field (1) and a heated greenhouse (0.35) — it blocks wind/rain and traps day solar but nights track outdoor (A4f). A sealed LED hall is weather-blind (A9f). |
| `SURFACE_PLANT_SCALE` `growth.ts:61` | **0.85** | **0.35** | Full-size vine crops are the hoophouse norm (A4d); warehouse greens/microgreens live on 45–60 cm tier pitch (A9b). |
| `SURFACE_AMBIENT` `src/components/world/World3D.tsx:375` | **0.92** | **0.45** | Bright diffuse poly skin (A4e); dark hall lit by glow stripes (A9e). |
| `SURFACE_FLOOR` `src/three/ground.ts:49` | **'soil-tilled-dry'** | **'floor-concrete'** | High tunnels grow in ground soil beds (A4b); warehouse = concrete + tape lines (A9e). |
| `SURFACE_BG` `src/lib/renderPlan.ts:10` | warm tan | dark slate | 2D canvas floor colors, matching floor tiles. |
| weather-FX gate `World3D.tsx:811-814` | gated off | gated off | Film/steel roof excludes rain/snow like the other enclosed surfaces. |
| `SURFACE_OPTIONS` `src/components/designer/DesignerToolbar.tsx:28` | "Hoop house" | "Warehouse farm" | Settings drawer picker. Also RENAME the existing `indoor` label "Indoor Warehouse" → "Indoor grow room" so the drawer doesn't show two warehouse-ish labels. |

## Work plan

### W1 — Creative environment kit (owner: S1 — ALL of `src/creative/**`, including the append to `src/creative/structures/registry.ts`)

1. **Parametric shell builders** (`src/creative/environments/shells.ts`), one per enclosed
   surface, consumed by both the runtime adapter and the dioramas:

   ```ts
   export interface ShellSpec { widthM: number; depthM: number }   // plan canvas size
   export function makeHoophouseShell(spec: ShellSpec): THREE.Object3D
   export function makeGreenhouseShell(spec: ShellSpec): THREE.Object3D
   export function makeTentShell(spec: ShellSpec): THREE.Object3D
   export function makeIndoorShell(spec: ShellSpec): THREE.Object3D
   export function makeWarehouseShell(spec: ShellSpec): THREE.Object3D
   ```

   Rules:
   - Meters in (1 voxel = 10 cm internally), centered at origin in XZ, ground at y=0.
   - **Dollhouse discipline** (preserve current shell.ts camera contract): default camera looks
     from the +X/+Z corner — near walls must be glass, open, or omitted so the room interior is
     always visible. Greenhouse/hoophouse roofs are translucent glazing.
   - **No lights** — sky.ts keeps owning THE light; glow reads via unlit `MeshBasicMaterial` /
     bright vertex colors only (existing pattern in shell.ts light bars).
   - Deterministic `rng(seed)`; PALETTE-only colors; merged geometries via `buildVoxelGeometry`.
   - **Fresh ownership per build** — shell makers return freshly-created geometries/materials
     every call, NO shared cached templates and NO `InstancedMesh` in their outputs (the
     `disposeShell` contract traverses and disposes everything; shared/cached geometry would be
     poisoned by the first dispose — the structures.ts clone-cache pattern is explicitly
     WRONG here).
   - **Roof policy** (red-team): greenhouse + hoophouse get translucent glazing roofs; tent,
     indoor, warehouse are OPEN-TOPPED dollhouse style — warehouse reads "hall" via 4 m far
     walls, roof truss beams + duct columns + hanging glow strips at wall height, never a solid
     ceiling (a solid slab walls off the high default camera — existing shell.ts comment).
   - **Voxel budget ≤ ~25k voxels per shell** — use scaled voxels (`Voxel.s` 2–6, i.e. 20–60 cm
     blocks) for large wall/roof planes, full-res (s=1) only for signature details (hoop legs,
     mullions, zippers, duct stubs, rack glow strips). These shells can span 30+ m — naive s=1
     fills would explode the merged geometry.
   - Visual signatures per archetype are spelled out in the research doc (Part A "(e)" lines) —
     the shells must hit those signatures (hoophouse: quonset silhouette + roll-up crease + wood
     end wall + hoop legs; greenhouse: A-frame glazing grid + ridge vents + thermal-screen hint;
     tent: black canvas + zipper + roof duct stubs; indoor: painted walls + mylar panels + door
     curtain; warehouse: dark perimeter + glowing tiered rack rows + floor tape lines + HVAC
     column).
   - Heights: tent ~2.0 m, indoor ~2.6 m, greenhouse ~2.9 m ridge, hoophouse ~3.2 m peak,
     warehouse ~4.0 m.

2. **Reusable interior equipment builders** (`src/creative/environments/interior.ts` or split) —
   benches, rack rows with trays + LED strips, DWC rafts on ponds, round fish tanks, NFT channel
   benches, ducting runs, dehumidifiers, CO2 tanks, controller panels — sized from research
   Part B. These compose into dioramas; the five that are also placeable plan assets get wired
   by S2 (see W2.4).

3. **Diorama registry** (`src/creative/environments/registry.ts`) — `AssetEntry[]`, showcase
   lane `e`. Minimum 8 entries (miniature scenes at plausible 3–8 m footprints — i.e. ~30–80
   voxels on the long side, NOT full-canvas shells; fixed seeds; a few live crops via
   `makeCropFor` for life): `env-greenhouse`, `env-hoophouse`, `env-grow-tent`, `env-grow-room`,
   `env-grow-shelf`, `env-warehouse`, `env-container-farm`, `env-aquaponics`. Stretch (only if
   quality holds): `env-nft-gully`, `env-lean-to`. Each diorama = shell builder at a plausible
   footprint + interior composition; quality bar over quantity.

4. **New equipment structure builders** (in `src/creative/structures/`, appended to its
   registry): `fish-tank`, `hydro-raft`, `dehumidifier`, `seedling-tray`, `co2-tank` — same
   `AssetEntry` contract, sizes from research Part B (#19/#20, #8, #23/#24, #33).

### W2 — Runtime integration (owner: S2; `src/three/`, `src/data/`, `src/types/`, `src/lib/`, `src/components/`, `showcase/main.ts`)

1. `PlanSurface` union += `'hoophouse' | 'warehouse'` (`src/types/index.ts:194`); let
   `npm run typecheck` enumerate every exhaustive table; fill with the constants above.
2. Rewrite `src/three/shell.ts` `buildShell` to dispatch to the creative shell makers
   (keep `ShellGroup`/`disposeShell` + the `shell:${surface}` root name; keep interior light
   bars for surfaces whose creative shell doesn't already carry them). Remove the SKINS
   box-building path it replaces. **Cache the built shell at module scope keyed
   `(surface, widthM, heightM)`** (red-team): the planVersion effect dispose/rebuilds on every
   brush dab — a 10k-voxel merged geometry rebuilt per dab is jank. Cache hit ⇒ reuse without
   dispose; key change or teardown ⇒ dispose old, build new.
3. Audit the string-keyed surface sites listed in "Constants" above (retype
   `SURFACE_AMBIENT` to `Record<PlanSurface, number>` and drop its `?? 1`; add the two
   `SURFACE_OPTIONS` entries + rename the `indoor` label). Leave the positive
   `=== 'outdoor'` weather gate alone. Also extend EXISTING equipment `surfaces` arrays in
   `src/data/assets.ts` for the new surfaces (red-team: `grow-light`, `plant-rack`,
   `hydro-channel`, `clip-fan`, `hvac-unit`, `grow-bench` += `warehouse` where sensible;
   `inground-bed`/`raised-bed`/`trellis`/`irrigation-line`/water gear += `hoophouse`; NO soil
   beds on `warehouse`) — per research Part A(b)/Part C.
4. New plan assets in `src/data/assets.ts`: `fish-tank`, `hydro-raft`, `dehumidifier`,
   `seedling-tray`, `co2-tank` (category equipment, `surfaces` gating from research — e.g.
   fish-tank/hydro-raft on greenhouse+indoor+warehouse, dehumidifier on tent+indoor+warehouse,
   seedling-tray everywhere enclosed, co2-tank greenhouse+warehouse) + `SLUG_MAP` entries in
   `src/three/structures.ts` (non-linear, one per contiguous region, sized from defaultWM/HM).
5. Templates: `GardenTemplate` gains `surface?: PlanSurface` AND optional
   `widthM`/`heightM` canvas dims (red-team trap A: a tent template stamped onto a 40×24
   canvas would wrap a 40 m tent around a corner cluster — templates must carry their canvas);
   `TemplatesCard.applyTemplate` threads all three through the single existing `replacePlan`
   seam (full `PlanState`; do NOT reuse `applySettings`). Add 3 starters:
   "Tunnel tomatoes" (hoophouse, ~10×8, inground-bed rows + trellis + tomatoes/peppers),
   "Warehouse greens" (warehouse, ~12×10, plant-rack rows + lettuce/basil),
   "Tent starters" (tent, ~5×5, grow-tent + seedling-tray + basil/peppers).
6. Seed farms: farm 8 "hoophouse" demo + farm 9 "warehouse" demo in `src/data/seed.ts`
   (follow the farms 5/6/7 pattern; verify id uniqueness).
7. Showcase lane `e` wiring in `showcase/main.ts` (import, `LANE_LABELS.e = 'Environments'`,
   `allEntries` push). No `tune()` in env entries (avoids the light-restore ordering trap).

### W3 — Docs (owner: Lead)

`quality/ASSETS.md` lane E + new equipment; `implementation-notes.md` ledger entry;
`HANDOFF.md` refresh; verification log appended below.

## Hard constraints (from repo contract — violations block merge)

- No `Math.random` under `src/creative/**`; seeded `rng()` only; same seed ⇒ identical rebuilds.
- PALETTE-only colors; ≤ ~4 base hues + deliberate accents; FACE_SHADE does the lighting.
- No new lights anywhere (sky.ts owns THE light; engine ambient only).
- `drawPlan` RenderOptions layers default OFF; renderPlan stays free of remote drawImage.
- World3D init effect stays keyed `[sceneReady, farmId]`; shells ride the planVersion rebuild.
- PlanState changes additive/optional only; all mutations via `usePlanEditor` seams.
- Custom crop ids ≥ 1000 untouched; template crop references are NAMES resolved at apply time.
- `npm run typecheck` is the gate (no ESLint); strict noUnusedLocals/Parameters.
- three.js stays in its lazy chunk.

## Non-goals (documented, deliberately out)

- Per-cell mixed surfaces in one canvas (breaks every single-surface invariant — revisit only
  with a per-cell surface resolver design).
- Real PointLights/SpotLights; photoperiod/CO2/humidity as sim state variables; yield modeling.
- `container`/mushroom surfaces (dioramas only); REST backend contract changes (PlanState
  surface field already round-trips; new enum values are data).
- Mobile/touch redesign of the Settings drawer.

## Verification gates (must all pass before "complete")

1. `npm run typecheck` clean; `npm run build` clean.
2. Showcase: `node tools/appshot.mjs "http://localhost:5173/showcase.html#lane=e&mode=sheet" <png> --expect "showcase-ready N"` where N = the ACTUAL lane-e registry length at verification time (per-lane count after filtering); big-mode shots of ≥ 4 dioramas reviewed against QUALITY_BAR by human eye.
3. Determinism: two showcase loads (`#spin=0`) produce byte-identical PNGs for one fixed diorama.
4. World: `node tools/appshot.mjs "http://localhost:5173/?ffview=world#/farms/8/map" <png> --gate` and farm 9 likewise (boot probe active; note HANDOFF trap 10 — world captures race plan loading, so gate lines outrank PNG content).
5. Blueprint: `#/farms/8/map` gate + Settings drawer shows the 6 surface options; AssetPalette
   filters equipment by surface.
6. Sim sanity: shelter math visible — same scenario on hoophouse vs outdoor produces different
   stress (spot-check via existing Simulations UI or unit-style node probe if cheap).

## Verification log

2026-09-13, branch `indoor-environments` (W1 `6f2366b`, W2 `bfed797`):

1. **Typecheck + build — PASS** (`tsc --noEmit` exit 0; `vite build` clean,
   three.js still isolated in its lazy chunk).
2. **Showcase lane e — PASS**: `--expect "showcase-ready 9"` on
   `#lane=e&mode=sheet`; all 9 dioramas render, no untextured/blown cells in
   pixel stats.
3. **Determinism — PASS**: two loads of `#only=env-greenhouse&spin=0`
   produced byte-identical PNGs (`cmp` equal).
4. **World runtime — PASS (gate-lines-outrank-PNG per HANDOFF trap 10)**:
   farms 8 + 9 `GATE PASS: zero runtime errors` at
   `?ffview=world&fftime=0.5&ffdebug=1#/farms/{8,9}/map`; `fftime` hook
   verified responsive (dawn 0.12 vs noon 0.5 luminance differential).
5. **Blueprint — PASS**: `#/farms/8/map` GATE PASS; 6 surface options +
   renamed "Indoor grow room" in the Settings drawer; equipment gating by
   surface per assets.ts arrays.
6. **Sim shelter — PASS**: headless probe of `shelteredTemps` — a 30/40 °C
   heatwave yields effective 30/40 outdoor, 25.5/35.5 hoophouse,
   23.5/33.5 greenhouse, 20.6/30.6 warehouse (monotone with research).
7. **Shell adapter probe — PASS**: headless scene-graph probe — build/attach
   `shell:hoophouse`, dispose detaches without freeing (cache), same-key
   rebuild returns the SAME group (no per-dab rebuild), key change rebuilds
   fresh `shell:warehouse`, `outdoor` returns null and frees the cache.
8. **Visual human-eye pass — DEFERRED**: image ingestion was unavailable to
   every agent this session, so the quality-bar pass ran on pixel statistics
   + code audit (which refuted the "duplicate diorama" and "no glow" alarms —
   warm-white LED palette by design, distinct builders verified in source).
   **Before merging to mainline: run `npm run dev`, open
   `showcase.html#lane=e` and farms 8/9 in World view, and eyeball against
   QUALITY_BAR.md.** Scratch renders kept at `$TMPDIR/envshot/` for review.

## Gate 8 — Visual human-eye pass (2026-09-14, merge-prep session)

Performed on the environments/audit line after merging main (Sim Core union +
dependabot majors) — the deferred blocker from 2026-09-13. Method: full gate
re-run on the merged branch, then big-mode diorama shots judged against the
QUALITY_BAR global rules (voxel discipline, silhouette-first, palette ≤ ~4
hues + accents, baked-light reads, detail-without-noise, technical health) by
a vision-capable review agent with per-image verdicts; low-confidence reads
were re-probed on the flagged image before finalizing.

1. Typecheck + build — PASS (`tsc --noEmit` exit 0, `vite build` clean, after
   `npm ci` against the merged lockfile).
2. Showcase lane e — PASS: `--expect "showcase-ready 9"`; contact sheet
   consistent (uniform scale/lighting, no broken cells).
3. Determinism — PASS: two `#only=env-greenhouse&spin=0` loads byte-identical.
4. Big-mode dioramas — PASS (7 of 7 judged): greenhouse, hoophouse, warehouse,
   grow-tent, container-farm, aquaponics, nft-gully. All silhouettes read at
   a glance; accents land on meaning (LED strips, water, greens); no
   untextured/z-fighting/floating geometry.
5. World farms 8 + 9 — PASS: gates zero-runtime-errors; farm 8 hoophouse
   shell translucent with readable interior rows + full HUD; farm 9 warehouse
   confirmed open-topped (wall-top beams, sky through) with racks, greens and
   grow lights visible; an initial "closed grey box" read was refuted on
   close inspection (interior visible, nothing broken).
6. Blueprint farm 8 — GATE PASS (Settings-drawer surface options and
   equipment gating unchanged by the merge; no re-audit needed beyond gate).
7. Gallery collateral — PASS: `gallery.html` `--expect "gallery-ready 185"`.

Non-blocking notes for future polish: glass shells slightly wash interiors
(aquaponics, nft-gully read low-contrast); an elevated camera preset would
showcase the warehouse open-top interior better; sheet mode clips the right
column at default screenshot width.

**Verdict: all 8 gates PASS — environments work is merge-ready.**
