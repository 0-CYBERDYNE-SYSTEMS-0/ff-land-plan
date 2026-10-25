# SPEC — Core Loop: Growing worlds and the six workstreams that make FarmFriend a simulator

Status: draft for approval · Owner: unassigned · Branch: `feat/core-loop`
Supersedes nothing; extends `SPEC-SIM-ECOSYSTEM.md` and `SPEC-ENVIRONMENTS-BETA.md`.
Read `AGENTS.md` (commands, CI, seams) and `ROADMAP.md` (what is already scheduled) first.

## Mission (one sentence)

Make the world *cause* things: places own climate, placed assets change the equations,
time can be scrubbed and forked, seasons accumulate, and observations correct the model —
one closed causal loop, shipped in six independently landable workstreams.
The planning experience begins by choosing a growing world; its physical space and growing
system determine what can be planned inside it.

## Why (the five verified gaps)

1. **Assets are cosmetic.** `engine.ts` never reads `plan.ground`. A grow light, fan,
   HVAC, dehumidifier, CO2 tank and hydro channel are all pictures. `Grep ground src/lib/sim`
   returns nothing but a comment.
2. **Enclosures have no climate.** `shelteredTemps` attenuates only the scenario delta, so a
   January greenhouse is as cold as the field minus rain. `SURFACE_ET_FACTOR` is a constant,
   not a function of VPD, and the sim has no light term at all (roadmap #53, #55).
3. **Time is half an interface.** `RunRecord` is replayable, `seekDay` scrubs, and
   `applyIntervention` refolds deterministically — but the A/B ghost (`loadGhost`) is
   session-only and cannot be saved as a fork, and the 10-year ensembles
   (`lib/ensembles.ts`) never reach the UI as uncertainty.
4. **Nothing accumulates.** One `PlanState` per farm, one run per season, soil OM and nitrogen
   reset every run. Rotation, inoculum and soil building — the reasons gardeners keep plans —
   are unrepresentable.
5. **Nothing flows back.** Sensors are manual entry (`localApi.addReading`); there is no
   observation type, no assimilation, no predicted-vs-observed error. "Twin" is aspirational.

The product thesis this spec serves: **place it → physics decides → see the consequence → do it
for real → the twin corrects itself.** Anything not on that loop is out of scope.

---

## Product contract — choose a growing world, then plan for that place

### Language and hierarchy

A **growing world** is the user-facing place selected for planning: a field, garden,
greenhouse, hoophouse, cold frame, tent, room, vertical farm or container farm. In code it is
an `Environment`, instantiated from an `EnvironmentArchetype`. It owns an independent plan
and can be revisited without replacing another world's work. “World” in the existing
**Blueprint / World** view toggle still means the 3D representation of the selected place;
changing that toggle never changes which environment is selected.

A **site** is the farm's overall footprint and location. A site may contain multiple growing
worlds. A **structure** is the enclosure of a world, when one exists; an open field has no
enclosure. An **asset** is equipment or infrastructure inside a world. A **growing system**
(soil beds, containers, hydro channels, racks) describes how crops occupy that place; it is
not interchangeable with its enclosure. A greenhouse can contain soil beds and hydroponics;
a vertical rack can be installed in a room or container. Do not encode every combination as
a new world type.

The product hierarchy is:

`Farm / site → selected growing world → growing spaces → crops and equipment → run / season`

### Required entry and return flow

1. Open the planner. An existing farm resumes its last valid selected world; a new farm shows
   **Choose your growing world**. Site overview is available without making it a mandatory
   first step. Creating a single field must be as direct as creating a single greenhouse.
2. Choose from the nine archetypes in §1.2. Each choice shows a representative preview,
   plain-language purpose, open/protected/sealed status, editable example dimensions, and
   the growing systems it supports. Previews are examples, not already-installed equipment.
3. Configure the world's name and usable floor dimensions. Enclosed worlds also expose
   interior height and access opening; vertical setups expose rack height/tier settings when
   a rack is placed. Defaults are labelled assumptions. Offer **Start empty** or a compatible
   starter layout, with an itemized list of the equipment that layout actually places.
4. Create and enter that world's interior planner. The header always identifies the farm,
   world name/type, dimensions, selected growing level, and Blueprint/World view. Show a
   breadcrumb back to the site and a world switcher; the active run must identify its world.
5. Plan using the palette, templates, planting targets, dimensions and warnings appropriate
   to that world. Switching worlds restores each one's saved plan. Switching 2D/3D retains
   the same environment, selection target, active level and simulation day.
6. Place equipment, inspect capacity and assumptions, then run the selected environment.
   A plan can be saved before it is simulation-ready. Missing lights or cooling produce
   useful warnings and honest simulated consequences; choosing an indoor type never installs
   invisible equipment or promises successful crops.

Selecting another existing world is navigation. **Changing the type of the current world**
is a separate explicit conversion action: preview incompatible equipment, growing spaces
and dimensions; preserve the original until confirmed; never silently erase or relabel it.
If conversion cannot preserve the layout, offer a new empty world of the desired type.

### What must differ by world

All worlds share the editor and crop catalog. Their planning profiles determine the valid
placement area, growing targets, compatible assets/templates, assumptions and warnings.
The following are product requirements, not just alternative backgrounds:

| World | Planning behavior | Conditions and capacity to explain |
|---|---|---|
| Open field | Direct soil painting, rows, paths, irrigation and optional beds; no enclosing shell | Outdoor weather, rain, crop spacing, planted area and seasonal suitability |
| Garden beds | Bed-oriented starter layouts; explicit bed footprints and access paths; outside-bed planting remains an explicit option | Bed area versus site area, spacing and access warnings |
| Glass greenhouse | Usable interior bounded by the shell; beds, benches or hydro spaces, door and aisle reservations | Transmitted daylight, passive solar gain, ventilation, heat and water requirements |
| Hoophouse | Tunnel-shaped enclosure read; long bed/row templates and end access; optional equipment | Outdoor-linked nights, rain exclusion and ventilation; no assumed heater |
| Cold frame | Low enclosure and small bed footprint; low-clearance crop warning | Passive protection, limited headroom, natural light; no assumed room HVAC |
| Grow tent | Compact interior; pots/beds/hydro targets, equipment reservations and front access | No natural-light credit, installed light coverage, heat, ventilation and humidity |
| Grow room | Configurable room interior with benches, pots, hydro and optional racks | Installed lighting and climate equipment; usable growing area versus service area |
| Vertical-farm warehouse | Rack placement, aisles and selectable growing tiers; crops planned on actual tier surfaces | Floor footprint versus growing area, tier occupancy, lights and equipment capacity |
| Container farm | Narrow container enclosure, editable usable dimensions, end access, service space and selectable rack tiers | Wall/floor space constraints, lit growing area, climate capacity and reservoir availability |

No blanket crop bans by world. Show suitability warnings supported by known spacing,
height or modeled climate; unknown crop height is “clearance unknown,” not a fabricated
pass/fail. No universal aisle width is claimed to be a building-code requirement.

### Boundaries, access and honest constraints

- Use metres for layout and one documented origin per environment. Site coordinates locate
  the footprint; interior coordinates locate crops/assets. They are different coordinate
  spaces and must not be added together ad hoc.
- Setup dimensions mean **usable interior floor width/depth**, not exterior manufacturer
  dimensions. Site footprints initially use that same rectangle; wall thickness and roof
  overhang are visual approximations and excluded from capacity calculations.
- A shell is rendered from the same saved dimensions used by the placement validator.
  Doors/access openings and user-reserved aisles/service areas must appear in Blueprint and
  World. They are not crop-growing area.
- Out-of-bounds placement, planting in a reserved access area, and incompatible growing-level
  targets are hard failures with a visible ghost and reason. Narrow aisles, obstructed access,
  insufficient headroom and insufficient equipment capacity are soft warnings. No pathfinding,
  evacuation certification or structural engineering is implied.
- Floor-mounted equipment cannot occupy the same reserved floor footprint as a rack or other
  blocking equipment. Mounted lights/fans can coexist above growing space through explicit
  mount metadata; a single `ground['x,y']` slug must not overwrite a rack with its light.
- Resizing, moving a rack, reducing tier count or deleting a growing space previews affected
  crops/equipment. Apply atomically with one undo step; no silent clipping or relocation.
  Navigation alone never edits a plan. A type conversion is also one undoable transaction.
- Warnings identify the affected world, space/level, cause and possible remedy. A dismissed
  warning remains inspectable. Clearly separate an estimate from an observation.

### Illustrative end-to-end stories (required acceptance journeys)

- **Field:** choose Open field → enter dimensions → paint soil rows and crops → see spacing
  counts → switch to World → run with outdoor rain. No shell or lighting requirement appears.
- **Greenhouse:** create a named greenhouse → preserve door/aisle space → add beds and crops
  → add a heater/light → inspector shows installed capacity → run shows modeled interior
  conditions. Return later and find that same greenhouse and layout.
- **Vertical:** choose warehouse → place a four-tier rack → plant lettuce on level 1 and
  basil on level 3 → inspect each independently in Blueprint and both at distinct heights in
  World. Empty levels add no crops or yield. Change one level and verify the other is intact.
- **Container:** choose container farm → start from a compatible layout → adjust its usable
  dimensions → see the narrow shell, access and service reservations → configure rack tiers,
  lights and hydro → see missing-capacity warnings before running.
- **Several worlds:** save a field and greenhouse on one site → switch between them without
  overwriting either → run each separately → compare with the existing ghost/numeric pair.
  This story does not require a multi-environment simulation.

---

## 0. Cross-cutting rules (apply to every workstream)

- **Determinism.** No `Math.random` under `src/lib/sim/` or `src/creative/`. Every new record
  that affects a run is frozen into the run (`config`, `envSeries`, `observations`).
- **Provenance.** Every new environment number is either sourced (`EnvSourceTag`) or labelled
  `model-estimate` in the UI. New derived constants get a citation or a documented approximation.
- **Replay is storage.** Persist config + inputs + summary. Never per-tick state.
- **Snapshots are the audit trail.** `src/lib/sim/__snapshots__/` changes only with a reviewed
  diff and one sentence per moved term. Run `npx vitest run -u` *after* reading the diff.
- **One mutation seam.** All plan edits stay inside `usePlanEditor.ts`. Do not fork it.
- **Land via green PRs.** `guard-main.yml` reds any non-merge commit on `main`.
- **Feature flags** (build-time `import.meta.env.VITE_FF_*`, default off in `main`):
  `ENV_RECORDS`, `ENV_CLIMATE`, `ASSET_PHYSICS`, `TIMELINE`, `CAMPAIGN`, `TWIN`.
  Each workstream must be inert with its flag off.
- **Test gate per workstream:** `npm test` + `npm run typecheck` + `npm run build`, plus
  `node tools/appshot.mjs "<url>" <out.png> 1440x900 --gate --expect "<text>"` for any UI change.

---

## 1. Workstream A — Environments as places (foundation)

### 1.1 Goal

An environment is an entity with an id, an archetype, a footprint on a site, and its own
interior plan. `PlanSurface` stops being a scalar on the canvas and becomes the archetype of a
place. Migration is mechanical and must not move a single simulation number.

### 1.2 Data model

```ts
// src/creative/archetypes.ts  (new — data, not code branches)
export type ArchetypeId =
  | 'open-field' | 'garden-beds'
  | 'greenhouse-glass' | 'hoophouse' | 'cold-frame'
  | 'grow-tent' | 'grow-room' | 'warehouse-vertical' | 'container-farm';

export type EnvKind = 'open' | 'protected' | 'sealed';

export interface EnvironmentArchetype {
  id: ArchetypeId;
  label: string;
  kind: EnvKind;
  defaultFootprint: { wM: number; hM: number };
  // climate payload — replaces the five scattered tables (see 1.3)
  coverTransmission: number;   // PAR fraction, 0..1  (glass ~0.70, film ~0.85, sealed 0)
  uValueWm2K: number;          // envelope conductance
  achInfiltration: number;     // air changes/hour, closed
  achVented: number;           // air changes/hour, vents fully open
  volumePerM2: number;         // m³ of air per m² floor (height proxy)
  thermalMassKJm2K: number;    // structure + floor
  etFactor: number;            // replaces SURFACE_ET_FACTOR
  plantScale: number;          // replaces SURFACE_PLANT_SCALE
  maxDliMol: number;           // sanity cap
  rainEnters: boolean;
  dliMode: 'natural' | 'natural+supplement' | 'supplement-only';
  floorTile: string | null;    // replaces SURFACE_FLOOR
  shell: 'none' | 'greenhouse' | 'hoophouse' | 'tent' | 'room' | 'warehouse' | 'container';
  bg: { dark: string; light: string }; // replaces SURFACE_BG
  planningProfile: PlanningProfileId; // capabilities and defaults; see §1.7
  palette: AssetCategory[];    // which palette groups this place offers
}
export const archetypes: Record<ArchetypeId, EnvironmentArchetype>;
export const ARCHETYPE_FOR_SURFACE: Record<PlanSurface, ArchetypeId>; // migration only
```

```ts
// src/types/index.ts
export interface Environment {
  id: string;                  // "env:<farmId>:<seq>"
  farmId: number;
  archetype: ArchetypeId;
  label: string;
  x: number; y: number;        // metres, top-left on the SITE canvas
  widthM: number; heightM: number;
  plan: PlanState;             // interior; `surface` field deprecated during migration
  layout?: EnvironmentLayout; // usable height, access and growing spaces; see §1.7
  setpoints?: EnvSetpoints;    // optional; absent = passive (see Workstream B)
}

export interface SitePlan {
  farmId: number;
  widthM: number; heightM: number; cellM: number;
  environments: Environment[];
  updatedAt: string;
}
```

- `PlanState` keeps `planting`, `ground`, `cellM`, `allowOutsideBeds`, `plantedAt`. Keep
  `surface?: PlanSurface` as a deprecated optional read-compatibility alias for one release;
  new writes use the environment archetype. Remove the alias only in a later explicit
  migration. New layout fields are optional/additive, consistent with `SPEC.md`.
- A site with zero environments is an empty site overview with a **Create growing world**
  action, not an implicitly plantable world. Choosing Open field explicitly creates an
  `open-field` environment. Migration creates one explicit environment for each old plan;
  it never invents an additional empty field. This resolves the former zero-environment
  open-ground exception, which conflicted with the two editor scopes.

### 1.3 Consolidation

Delete or redirect, in this order:

| today | becomes |
|---|---|
| `SURFACE_SHELTER` (`growth.ts`) | `archetype.plantScale`/`shelterFactor` retired with legacy path; sim reads climate |
| `SURFACE_PLANT_SCALE` (`growth.ts`) | `archetype.plantScale` |
| `SURFACE_ET_FACTOR` (`drivers.ts`) | `archetype.etFactor` (then derived, Workstream B) |
| `SURFACE_FLOOR` (`ground.ts`) | `archetype.floorTile` |
| `SHELL_MAKERS` (`shell.ts`) | `archetype.shell` |
| `SURFACE_BG` (`renderPlan.ts`) | `archetype.bg` |
| toolbar `Select` of surfaces | environment picker over `archetypes` |

`lib/growth.ts` (the legacy path) keeps its own copy until roadmap #54 retires it; map its
`surface` argument through `ARCHETYPE_FOR_SURFACE` so both paths agree during the transition.
Do not rewrite the legacy path in this workstream.

### 1.4 Migration

`store.ts` has **no version field today** (`AppState` is unversioned and `load()` merges over a
fresh seed). So: add `version?: 2` to `AppState`, treat absent as 1, and run
`migrate(parsed): AppState` **before** the merge/reseed. Also required: `load()`'s demo-plan
merge currently keeps only `surface` from stored demo plans — after migration it must keep the
stored **environment list**, or every demo farm snaps back to one environment on reload. v1 → v2:

```
for each farmId in plans:
  old = plans[farmId]
  site = {
    farmId, widthM: old.widthM, heightM: old.heightM, cellM: old.cellM,
    environments: [{
      id: `env:${farmId}:1`, farmId,
      archetype: ARCHETYPE_FOR_SURFACE[old.surface ?? 'outdoor'],
      label: archetype.label,
      x: 0, y: 0, widthM: old.widthM, heightM: old.heightM,
      plan: { ...old, surface: undefined },
    }],
    updatedAt: old.updatedAt,
  }
```

Must be idempotent (`migrate(migrate(x)) === migrate(x)`) and total (unknown surface →
`open-field`, never throw). `co2-tank`/`grow-light` filtered from open-field plans is **not**
part of migration — leave the paint, let the palette hide them on new edits.

**Acceptance:** `env.model.test.ts` — v1 fixture migrates; migrated plan run summary equals the
pre-migration summary exactly (0 ULP); double-migrate is a no-op; unknown surface defaults.

### 1.5 Editor: two scopes, one editor

`usePlanEditor` gains `scope: { kind: 'site' } | { kind: 'env'; id: string }`.
- Site scope: place/move/resize environments; the stampable "asset" is an archetype footprint.
- Env scope: the existing brush/rect/asset/erase/pick/fill/line tools, operating on
  `env.plan` — same code path, different `planRef` target. **No second editor.**
- `PlanState` mutations route through the same snapshot/undo/autosave functions; a `scope`
  change completes the active stroke and records its target. Navigation adds no content undo
  entry; undo/redo restores the targeted environment/level and its content atomically. History
  entries must never apply a prior environment's snapshot to the newly selected environment.
- The site canvas must not accept crop painting; the env canvas must not accept archetypes.

**Acceptance:** appshot on Blueprint at both scopes, `--expect` a DOM probe per scope; undo
across a scope change restores the prior plan byte-identically.

### 1.6 Run targeting (A stop line)

`RunConfig` gains `environment: Environment` (deep copy) and loses reliance on `surface`
internally; `SimState.surface: PlanSurface` becomes `SimState.archetype: ArchetypeId`, with
`Intervention { kind: 'surface' }` kept as a legacy climate-archetype alias mid-run. It
does not perform a structural layout conversion or move crops; new structural changes require
a new frozen run configuration. Reject aliases that cannot preserve a valid run layout.

**Stop line:** runs remain **single-environment** in this workstream. `RunConfig.basePlan` is
the chosen environment's plan. Multi-environment runs are Workstream B §2.6 and are explicitly
*gated on a real need* (cross-environment comparison in one run) — if the compare UI can work
by running two single-env runs, skip 2.6 entirely. Do not build it speculatively.

### 1.7 Planning profiles and spatial layout (required foundation)

Add data-driven planning profiles referenced by archetypes. They define supported growing
systems, default outside-bed policy, compatible templates, enclosure/access defaults and
warning rules. Profiles select behavior in the shared editor; do not create nine editor
implementations. Archetype palette membership describes compatibility, not installed gear.

The layout contract is additive (exact type names may follow existing repository style):

```ts
interface EnvironmentLayout {
  usableHeightM?: number;
  access: { id: string; edge: 'north' | 'east' | 'south' | 'west';
    offsetM: number; widthM: number }[];
  reservations: { id: string; kind: 'aisle' | 'service';
    x: number; y: number; widthM: number; depthM: number }[];
  growingSpaces: GrowingSpace[];
}
interface GrowingSpace {
  id: string;
  label: string;
  kind: 'bed' | 'bench' | 'rack' | 'hydro';
  x: number; y: number; widthM: number; depthM: number;
  levels: { id: string; label: string; elevationM: number; clearanceM?: number }[];
}
interface GrowingTargetPlan {
  growingSpaceId: string;
  levelId: string;
  planting: Record<string, number>;
  plantedAt?: Record<string, string>;
}
interface PlanState {
  planting: Record<string, number>; // floor target; legacy compatibility shape
  plantedAt?: Record<string, string>;
  targets?: Record<string, GrowingTargetPlan>; // elevated targets, keyed by stable ids
}
```

Floor crops remain in `env.plan.planting`; elevated crops live in `env.plan.targets`, keyed by
the stable `(growingSpaceId, levelId)` pair. Level cell keys use the environment grid's origin
and resolution, constrained to that space's footprint. Stable target ids distinguish two crops
at the same x/y on different levels. Every growing space has at least one level; a four-tier
rack has four independently editable levels. Do not serialize a derived merged planting map as
another source of truth. `GrowingSpaceLevel.planting` and `plantedAt` are accepted only as a
one-way migration input: normalize them into `PlanState.targets`, then remove them from layout.
This keeps `RunConfig.basePlan` as the sole frozen crop-plan snapshot; `EnvironmentSnapshot`
contains level geometry and equipment mounts but no crop maps.

`EnvironmentLayout` absent means legacy floor-only layout, with no invented door reservation
or loss of existing crop cells. New setups receive editable profile defaults. The initial
implementation uses axis-aligned rectangles and cardinal-edge openings; irregular polygons,
free-angle rotation and custom building construction are deferred. This is a deliberate
geometry limit, not permission to present a container as an undifferentiated outdoor plot.

Physics-bearing placed equipment needs stable instance identity and a mount target
(floor/environment or growing-space level), footprint, and asset slug. Introduce an optional
instance collection alongside the legacy ground map; derive legacy equipment instances
canonically from existing footprints when necessary. A migrated asset is counted from one
representation only. IDs cannot be generated during simulation or change on each load.
Ground painting remains suitable for soil/path textures; moving equipment must not depend
on reconstructing identity from a freshly flood-filled slug region after every edit.

**Phase 0 boundary:** deliver world selection/setup/switching, profiles, layout persistence,
access/reservations, valid floor editing, and the run-target adapter (§1.6). Establish the
space/level and mount identities now. Interactive tier editing and its engine/render/export
integration land together in Phase 2; do not advertise vertical/container planning as complete
before that gate passes. Early cards must label tier planning as unavailable rather than
silently flattening the user's intended layout. The first complete release of this product
contract includes Phase 2; Phase 0 alone is a foundation release.

### 1.8 Navigation, lifecycle and compatibility

- Persist the selected environment per farm as a UI preference, outside run config. If its id
  no longer exists, show the world list; do not silently create a replacement world.
- Duplicate creates new environment/space/level/equipment ids and deep-copies content. Existing
  runs keep their frozen originals. Delete explains which saved runs/seasons reference the
  place and preserves their replay inputs; never cascade-delete historical evidence.
- Moving a world on the site changes its site location, not its interior coordinates or crop
  counts. Overlapping site footprints warn; they do not merge climates or share resources.
- Environment type, layout, profiles/model version and equipment affecting a run are frozen
  into it. Viewing a historical run uses its frozen shell/layout, with a visible historical
  context; it never rewrites today's plan to match the replay.
- `getPlan`/`savePlan` compatibility must have an explicit environment target or a documented
  legacy single-environment adapter. Never let an omitted target select an arbitrary world.
  Update the `Api`, `localApi`, `restApi` and README contract together when adding site/world
  operations; a typed REST adapter is not evidence of server support.
- Templates declare compatible profiles and whether they replace the environment interior.
  Preview included equipment and affected crops; apply as one undoable edit. Templates never
  convert an unrelated world type as an incidental side effect.

### 1.9 World-planning acceptance matrix

Add `world.planning.test.ts` / editor integration coverage for profile selection, isolated
world persistence, correct-target undo/redo, bounds/reservations, destructive-edit previews,
conversion preservation, instance mount coexistence, migration and reload. All nine archetypes
must be selectable and have a profile, compatible shell (or explicitly none), palette and
empty/compatible-template path; a showcase diorama alone does not satisfy this requirement.

Phase 0: run the field, greenhouse and multi-world journeys above in Blueprint and World;
assert stable environment ids and scope probes after reload. Verify an empty site cannot
accidentally accept crop strokes. Existing migrated floor plans retain exact run summaries.
Phase 2: run vertical and container journeys, including level-specific editing, undo, reload,
3D selection, exports and run replay. Assert that painting one tier changes neither another
tier nor the floor and that active-level changes do not change the shared simulation clock.
Appshot captures representative field, greenhouse, vertical and container contexts with DOM
probes for environment id, archetype, scope, active level and run day. Pair screenshots with
interaction assertions; screenshots alone cannot prove isolation or persistence.

---

## 2. Workstream B — Real enclosure climate

### 2.1 Goal

Interior temperature, humidity, VPD, DLI and CO2 become state the run computes per environment
per day, instead of a shelter multiplier on an outdoor number. Stress math does not change —
it is fed different weather.

### 2.2 Design: daily steady-state, hourly only where a setpoint flips

Full Vanthoor (2011) is hourly with 100+ parameters and is not maintainable in a browser tick.
Implement the **steady-state energy balance** with Vanthoor-derived constants, and sub-step
hourly **only** for humidity/leaf-wetness when venting or heating toggles within the day.
Cite Vanthoor et al. (2011) in the module header and in `references/`.

```
Q_solar   = G_Wm2 * transmission * floorAbsorptivity * A_floor       [W]
Q_heat    = heatingKw * 1000            (if T_in < heatSetpoint)
Q_light   = lightingW * 0.6              (LED waste heat to air)
Q_cool    = coolingKw * 1000             (if T_in > coolSetpoint)
Q_latent  = transpiration_kg_s * 2.45e6  (from VPD and LAI)

UA        = Σ(U * A_envelope)
H_vent    = 1.2 * 1005 * ach * volume / 3600        [W/K]
T_in      = T_out + (Q_solar + Q_heat + Q_light − Q_cool − Q_latent) / (UA + H_vent)
```

- `ach` = `achInfiltration` when closed; opens toward `achVented` as `T_in` exceeds
  `coolSetpoint` (proportional, capped) — this is the thermostat behaviour a greenhouse has.
- Sealed (`kind === 'sealed'`): `transmission = 0`, `UA` small, so `T_in` follows lights and
  cooling almost entirely; this is what makes a warehouse weather-blind and a tent night-cold.
- **RH / VPD:** water mass balance over the day — transpiration in, dehumidifier out,
  condensation out when RH would exceed 100 %, leakage toward outdoor absolute humidity.
  `VPD = SVP(T_in) * (1 − RH/100)`, `SVP(T) = 0.6108·exp(17.27T/(T+237.3))`.
- **DLI:**
  `dli = (G_PAR_Wm2 * transmission * 0.0864 + ppfd_umol * photoperiod_s / 1e6)` capped at
  `maxDliMol`, where `G_PAR_Wm2` is derived from the existing `lib/light.ts` monthly DLI
  (`dli_natural_mol / 0.0864` gives average W/m² of PAR over the photoperiod).
- **CO2:** sealed only. `C_next = C + enrich − uptake·LAI − leak·(C − C_out)`, clamped
  350–1500 ppm; no enrichment ⇒ drifts to ~C_out in a vented house.
- **ET:** replace the constant with `etFactor_eff = clamp(1 + 0.15·(VPD − 1.0) − 0.10·(ach/10),
  0.35, 1.30)`; outdoor (`kind === 'open'`) returns exactly 1.0 so the open-field goldens hold.
- **Rain:** `precipMm = 0` for every enclosed archetype (already the beta behaviour); keep.
- **Light stress:** `growth.ts` already exports `DLI_NEED_MOL` = `{ fruit 20, grain 18,
  vegetable 14, herb 10, flower 10, cover_crop 8, fungus 0 }`. Those are **minimum-stress
  thresholds**, not CEA optima — port them verbatim as `DLI_MIN_MOL` and apply in `stepDay`
  (roadmap #55's "no light term"). Separately add `DLI_TARGET_MOL` for equipment sizing and the
  inspector card, carrying the published CEA bands (leafy/herb 10–17, strawberry 17–22,
  fruiting 22–30 mol/m²/day). **Do not conflate the two**: a tomato at 20 mol/m²/day is at the
  stress floor and still half its optimum.

### 2.3 Setpoints

```ts
export interface EnvSetpoints {
  heatC?: number;      // default by archetype: glass 12, hoophouse none, tent 20, room 20, warehouse 21
  coolC?: number;      // default: glass 28 (venting), sealed 24 (mechanical)
  rhMaxPct?: number;   // default 85 enclosed, undefined open
  co2Ppm?: number;     // default undefined; enrichment only if a co2-tank is placed
  photoperiodH?: number; // default 18 sealed, 0 open (natural)
}
```
Defaults live in the archetype, overridable per environment. Every default is a documented
`model-estimate`, surfaced in the UI as "assumed, edit me".

### 2.4 Plumbing

- New `src/lib/sim/environment-climate.ts`: `environmentDay(env, outdoorDay, equipment, prev) →
  { tMinC, tMaxC, rhPct, vpdKPa, dliMol, co2Ppm, leafWetHours, etFactor, rainMm }`.
  Pure, deterministic, no I/O.
- `environmentDay` replaces `effectiveEnvironmentForSurface` **inside** `stepDay`; the old
  function stays exported for the legacy path and for one-release comparison tests.
- `tMinC/tMaxC` are the interior values; `thermalStress`, `gddGain`, `stepBucketMoisture`,
  mineralization and pest pressure consume them unchanged. **No stress math changes.**
- Provenance: interior values are derived, so they carry `'model-estimate'` with a
  `derivedFrom: 'archetype' | 'equipment'` marker. The UI must not claim them as observed.

### 2.5 Acceptance

`env.climate.test.ts`:
- January at lat 45: glass house with `heatC: 12` is 4–12 °C above outdoor at night, not equal.
- Warehouses and tents show ~0 response to outdoor `tMin` shifts of 8 °C when sealed and lit.
- A 34 °C heatwave moves a tent interior < 3 °C (thermostat holds).
- DLI for glass lettuce in June lands 20–30 mol/m²/day; a lit tent with no natural light lands
  inside the placed lights' computed band.
- Rain is exactly 0 indoors; open-field run summary is byte-identical to the pre-change golden.
- Golden snapshots: `greenhouse` scenario **will** move; read the diff, name the terms
  (tMin/tMax → GDD; dli → light stress), then commit.

### 2.6 Multi-environment runs (conditional)

Only if §1.6's stop line is cleared by a real requirement. Design, if it happens:
`CellState.environmentId: string`, `SimState.environments: Record<string, EnvDay>`,
`stepDay` computes one `EnvDay` per environment per day and resolves per cell. Interventions
gain `environmentId`. Everything else is unchanged. **Do not start this without a failing
user story.**

---

## 3. Workstream C — Assets as physics terms

### 3.1 Goal

Placing an asset changes the equations. The palette stops being a sticker book and becomes
the control panel for the environment.

### 3.2 Shape: data on the asset, one aggregator

Add to `GardenAsset` (optional; assets without it contribute zero):

```ts
export type AssetPhysics =
  | { kind: 'light'; watts: number; efficacyUmolJ: number; photoperiodH?: number; footprintM2: number }
  | { kind: 'fan'; achBoost: number; mixing: number }
  | { kind: 'hvac'; heatingKw: number; coolingKw: number; electricalKw: number }
  | { kind: 'dehumidifier'; litresPerDay: number; derateBelowRh: number }
  | { kind: 'co2'; targetPpm: number; kgPerDay: number }
  | { kind: 'rack'; tiers: number }
  | { kind: 'soilless'; reservoirL: number }
  | { kind: 'water-store'; litres: number }   // rain barrel, IBC tote
  | { kind: 'nursery' };                      // seedling tray
```

One pure aggregator, `src/lib/sim/equipment.ts`:

```ts
export interface EquipmentTerms {
  ppfdUmol: number; lightingW: number; photoperiodH: number;
  achBoost: number; mixing: number;
  heatingKw: number; coolingKw: number; coolingElectricalKw: number;
  dehumLpd: number; co2TargetPpm: number | null;
  tiers: number; soilless: boolean; waterStoreL: number; nursery: boolean;
}
export function equipmentTermsFor(plan: PlanState, ar: EnvironmentArchetype): EquipmentTerms;
```

### 3.3 Aggregation rules (spatial resolution is specified in §3.7)

1. **Modeled light coverage takes `max`, not sum.** This is a documented approximation
   to avoid duplicated coverage; physical light contributions can add. Painting a row of
   `grow-light` must not multiply full-environment coverage by the number of painted cells. `ppfdUmol` = max over placed
   lights, scaled by the covered fraction of the environment footprint.
2. **Heat is per watt.** `lightingW` **does** sum (each bar draws power) even though `ppfdUmol`
   takes max. This is the one place the two diverge; test it explicitly.
3. **Fans sum, capped.** `achBoost` sums, capped at `3 × achInfiltration`; `mixing` sums,
   capped at 1.
4. **Racks multiply growing area, once.** `tiers` = max tiers of overlapping rack footprints.
   `plantsForArea(crop, cells)` is `floor(cells·CELL_AREA_M2 / (spacing·rowSpacing))`, so tiers
   must be applied **inside the same floor**, not after it (uniform full-rack shorthand only):
   `floor(cells·tiers·CELL_AREA_M2 / spacingArea)`. `floor(x)·4 ≠ floor(4x)` — applying the
   multiplier outside silently loses a plant per cell and breaks the 4× test. Introduce
   `effectivePlantingArea(crop, cells, tiers)` in `lib/plan.ts` as the **single choke point**
   and replace every direct `plantsForArea` call in `engine.ts`. A second multiplication
   anywhere is a bug. For independently planted levels, §3.7 supersedes the uniform
   multiplier: count actual occupied growing area exactly once. Empty levels yield zero.
5. **Soilless replaces the bucket.** v1 scope: soilless cells never suffer water deficit
   (irrigation assumed sufficient) but *do* suffer nutrient failure — `nitrogen` demand is
   satisfied from the reservoir, and stress appears when `waterStoreL` runs dry or when no
   hydro asset covers the cell. **Full EC/DO/pH is out of scope for v1** (see Revision log R7).
6. **Assets without physics contribute nothing.** `grow-bench`, `hut`, props, paths: zero.
   Explicitly test that adding a shed does not change a run.
7. **Water stores deplete.** Rain barrels/IBC totes hold `waterStoreL`, refilled by
   `precipMm × roofArea` for enclosed archetypes and by manual `irrigate` interventions
   otherwise. An empty store turns irrigation interventions into no-ops and emits a
   `water-short` event. This is the first failure mode a user can actually *cause*.

### 3.4 Asset defaults (auditable numbers)

| asset | physics | basis |
|---|---|---|
| `grow-light` (0.5×0.25 m bar) | 40 W, 2.6 µmol/J, 18 h | 104 µmol/s over ~0.5 m² ≈ 208 µmol/m²/s → 13.5 mol/m²/day |
| `clip-fan` | `achBoost 0.5`, `mixing 0.25` | approximation, documented |
| `hvac-unit` | heat 2.0 kW, cool 2.5 kW, 1.0 kW electrical | splits sized for ≤20 m² |
| `dehumidifier` | 20 L/day at ≥80 % RH, linear derate to 0 at 50 % | consumer unit class |
| `co2-tank` | target 1000 ppm, 2 kg/day | 1 kg ≈ 0.55 kg CO2 per m³·% |
| `plant-rack` (0.9×0.6 m) | `tiers: 4` | warehouse tier pitch 45–60 cm |
| `hydro-channel`, `hydro-raft` | `soilless: true` | root-zone swap |
| `seedling-tray` | `nursery: true` | propagation only |
| `rain-barrel` / `ibc-tote` | 200 L / 1000 L | catalogue sizes |

Every row is a `model-estimate`; put the table in the module header so the next engineer can
argue with a number instead of reverse-engineering it.

Two capacity details are explicit: `EquipmentTerms` also exposes `co2KgDay`, summed once per
installed CO₂ asset, so the climate model can distinguish a requested concentration from the
available daily dose. `hydro-channel` and `hydro-raft` are soilless, but their reservoir capacity
is `0 L` until a capacity is specified; do not infer litres from the footprint. The inspector
must disclose that external water storage is required for stored-water capacity.

### 3.5 UI

- Asset palette shows an effect line ("+13.5 DLI · 40 W · 1.2 kW heat") for physical assets.
- Environment inspector: a live "this room" card — DLI, VPD, CO2, ACH, tiers — computed by
  `equipmentTermsFor`, no sim run required. This is the single most legible thing in the
  product; it should update as you paint.
- Palettes gate by `archetype.palette`, not `surfaces`.

### 3.6 Acceptance

`assets.physics.test.ts`: DLI arithmetic for one bar matches the table; two overlapping bars
double `lightingW` but not `ppfdUmol`; four fully planted tiers quadruple growing area
(plant counts follow one floor over that area, not necessarily four times an already-floored
count); a shed changes no summary field; an empty water store turns irrigation into a no-op with a `water-short` event; soilless cells show no water stress but do show nutrient
stress when uncovered.

### 3.7 Spatial equipment and independently editable growing levels

The environment-wide `EquipmentTerms` in §3.2 is a summary, not sufficient spatial identity
for vertical planning. Preserve that inspector summary, but derive per-growing-target terms
from the frozen layout and mounted equipment. A growing target is the environment floor or
one `(growingSpaceId, levelId)` pair. `CellState`, interventions, events, observations,
selection and replay projections must identify the target when x/y alone is ambiguous.
Extend `equipmentTermsFor` to accept the environment layout/instance collection and optional
growing target; the plan-only signature above remains a legacy adapter, not a way to drop
mounted equipment from the computation. Legacy records without a target mean the floor. This remains **one environment per run**;
levels are planting surfaces inside that environment, not separate climate worlds.

- A rack's floor footprint is counted once as occupied floor area. Its available growing
  area is the sum of its level areas; planted area is the sum of occupied crop cells on those
  levels. Show all three separately. Empty tiers cannot increase yield, water use or plant
  counts. One hectare of floor cannot be displayed as four hectares of land.
- `effectivePlantingArea` becomes the single plant-count choke point for both paths. For a
  crop, aggregate actual occupied area across equivalent targets, then apply spacing and one
  floor. Do not multiply those already-enumerated levels by `tiers` again. Keep the legacy
  uniform-area multiplier only as a compatibility adapter, never in addition to level data.
  Document aggregation groups when spacing/system differs; allocate per-target yield from
  the same unrounded aggregate and round only the final summary.
- Each tier can have different crops and sowing dates. Neighbor/companion checks operate on
  the same planting surface; stacked x/y cells are not horizontal neighbors. Crop failures,
  harvests and interventions affect their addressed target only unless explicitly applied
  to all targets. The v1 inoculum/rotation index must include growing-target identity; soil
  carry applies to soil-growing targets, not automatically to hydro reservoirs.
- Mounted lights cover their assigned level/footprint. They do not illuminate every tier by
  sharing x/y coordinates. The §3.3 PPFD maximum rule is a deliberate simplified coverage
  model, not a claim that physical photons cannot add. Compute coverage unions once per
  target; use maximum modeled PPFD in overlapping coverage, not duplicated whole-room area.
  Wattage sums once per installed instance into the enclosure heat/power balance.
- Floor/level growing area receives natural DLI according to the documented model. v1 credits
  natural light to exposed floor/top growing surfaces only; lower covered rack levels receive
  zero natural-light credit unless an explicit, labelled transmission approximation is
  introduced with tests. No ray-traced shading model is required. Installed tier lighting
  supplies that tier's supplemental DLI.
- Air temperature/RH/CO2 share the enclosure's daily climate in v1. Vertical thermal gradients
  and independent tier HVAC are deferred. Transpiration, uptake and light stress use actual
  occupied level crops; summing levels must not multiply enclosure volume or ventilation.
- Hydro coverage and reservoir demand resolve by growing target. The inspector states which
  targets share a store; water is allocated in canonical target-id order if supply is short,
  with that approximation disclosed. Reservoir consumption is conserved across levels.
- Blueprint offers floor/level selection with clear labels and optional read-only outlines
  of other levels. World renders each surface at its saved elevation and maps raycast hits
  back to the same target; editing an obscured level requires explicit selection/isolation.
  Reuse the mutation seam and instanced plant/ghost disposal paths.
- PNG export includes the selected world's name and level and states whether it is a floor
  or tier plan. CSV identifies world, growing space and level; aggregate totals reconcile
  exactly with planner and run counts. Shared renderer overlays remain opt-in.

**Acceptance:** two crops at identical x/y on distinct levels survive save/reload, undo/redo,
export and deterministic replay independently. One planted tier on a four-tier rack produces
one tier's counts; four identically planted tiers use four times area before flooring.
Deleting a rack requires an affected-content preview and undo restores every level. A light
mounted over level 1 changes that level's DLI and enclosure heat once, not all four levels'
DLI. A floor crop cannot coexist with a blocking rack footprint. Baseline floor-only records
retain their prior outputs with flags off. The vertical/container journeys in the product
contract are release gates, not optional visual polish.

---

## 4. Workstream D — Time: scrub, fork, compare, bands

### 4.1 Goal

The season becomes the interface. Runs are already replayable; expose the replay as a
scrubbable, branchable object and turn ensembles into uncertainty.

### 4.2 Scrub (mostly exists — unify, don't rebuild)

- `SimRunController.seekDay(day)` **already exists**, as does `applyIntervention` (deterministic
  refold to the current `dayIndex`) and `unsavedChanges`. The work here is narrow: one clock
  shared by Blueprint, World and `SimDrawer`, and an LRU cache of replayed states per
  `(runId, dayIndex)` (64 entries) so scrubbing never re-folds from day 0.
- 3D: `historyViz.buildGhostPlants(plan, …)` builds a translucent instanced batch from **a
  PlanState**, so trail mode needs one derived `PlanState` per ghosted day (cells → `planting`
  keys, which is cheap and deterministic). Reuse the batch type and disposal path; do not write
  new geometry.
- Do not introduce a second transport. If a view needs a different day than the controller's,
  it is a bug in the view.

### 4.3 Fork

```ts
export function forkRun(
  parent: RunRecord,
  afterDayCount: number,
  patch?: Partial<Pick<RunConfig, 'interventions'>>,
  ctx?: SimRunCtx,
): RunRecord;
```

Rules:
- The in-memory divergence **already exists**: `applyIntervention` amends
  `config.interventions` on the active run and `unsavedChanges` flags it. `forkRun` is the
  *persistence promotion* of exactly that state — take the active config, truncate at the fork
  date, stamp new ids. Do not add a parallel divergence path.
- `envSeries` = parent's `envSeries` **exactly**, whole series (not sliced). The counterfactual
  is management, not weather; keeping the parent's weather is what makes the comparison causal.
- `afterDayCount` counts completed days: `0` is before the series; `N` means day indexes
  `0..N-1` are complete. `config.interventions` keeps the parent's actions through the last
  completed date, then appends **management-only** patch interventions dated after that
  boundary and inside the parent's series. Weather is frozen in `envSeries`; weather and
  structural/surface patches are rejected. `config.basePlan` is a deep copy of the parent's.
- New `id`, `label` = `<parent label> ⟂ d<afterDayCount>`, plus `parentId` and `forkedAtDay`
  on `RunRecord` (`forkedAtDay` stores the completed-day count).
- Recompute the summary using the same `SimRunCtx` (soil profile and crop catalog) as the
  parent run. Historical records do not freeze that context yet, so callers must pass the
  active run context; records without one continue to use the legacy defaults.
- `meanDailyGddC` stays the parent's. Extensions (`extendRun`) recompute only for the appended
  window and document the discontinuity.
- Forking from the live (not-yet-saved) run is allowed: `createRun` → `simulateRun`.

**Prefix identity test is mandatory:** for days `0..afterDayCount-1`, the fork's per-day `DayStats`, cell
`biomassFrac` and event list equal the parent's within `1e-9`. If this fails, the engine has
hidden mutable state — fix the engine, do not loosen the test.

### 4.4 Compare (the ghost exists; make it a number)

- `loadGhost` / `ghostRecord` / `ghostStateRef` **already exist** and World3D already renders a
  semi-transparent ghost in lockstep. Do not build a second comparison mechanism.
- New: pure `compareRuns(a, b): RunComparison` — yield, water use, stress-cell-days per term,
  harvest-ready day, outbreak days, delta with sign — and a **delta strip** in the UI. That is
  the missing piece; the visual overlay is already shipped.
- Multi-select beyond the ghost pair (3–4 runs) is optional and can ship as a table, not
  another overlay. Runs stay capped at 40 (`localApi`); selection is transient.

### 4.5 Ensembles as uncertainty

- `runEnsemble(config, years: SeasonYear[], opts) → EnsembleResult` where each year's series is
  built by the existing `lib/ensembles.ts`; returns `p10/p50/p90` for `totalYieldKg`,
  `harvestReadyDay`, `waterUseMm`.
- Runs in a **Web Worker**, one at a time, chunked with progress. Budget: p95 ≤ 2.5 s for
  2,000 cells × 90 days × 10 years on the dev machine; if exceeded, cut to 5 years and say so.
- Cache key = `hash(config without interventions dates) + years[]`; store the result (small)
  next to the run, never the per-year states.
- UI: fan chart on yield and harvest date, with the p50 labelled "typical year" and the band
  labelled "10 historical years, same management". Wording matters: this is not a forecast.

### 4.6 Acceptance

`timeline.fork.test.ts` (prefix identity, label, intervention truncation), `timeline.compare.test.ts`
(delta signs), `ensemble.bands.test.ts` (ordering, determinism, cache hit is byte-equal);
appshot gate on the World with a scrubbed run (`--expect` the day probe).

---

## 5. Workstream E — Campaign mode: seasons accumulate

### 5.1 Goal

A garden persists across years. Soil, rotation and inoculum carry forward; the plan becomes a
campaign, not a one-off run.

### 5.2 Model

```ts
export interface SoilCarry {
  organicMatterPct: number;
  nPoolKgHa: number;
  ph?: number;
  inoculum: Record<string, number>; // crop family → 0..1 pressure
}

export interface SeasonRecord {
  id: string;              // "season:<farmId>:<year>"
  farmId: number;
  year: number;
  label: string;
  startDate: string; endDate: string;
  environmentIds: string[];
  runIds: string[];        // runs that composed the season
  soilIn: SoilCarry; soilOut: SoilCarry;
  harvests: { date: string; cropId: number; kg: number; cell: string; family: string }[];
  updatedAt: string;
}
```

For multiple worlds/levels, harvest and rotation keys include environment id and growing
target (§3.7); identical local x/y coordinates must not share rotation history. Legacy cell-only
records resolve to their frozen run's floor target.

Rotation memory is **derived**, not stored twice: a `rotationIndex` built from season records
(`Record<cellKey, { year: number; family: string }[] >`, last 5 seasons) recomputed on load.

### 5.3 Engine insertion (keep the engine pure)

- `SimRunCtx` gains `carry?: SoilCarry`. `initialNitrogenKgHa` accepts an explicit pool;
  when `carry` is present it wins over the OM derivation.
- New daily term in `ecosystem.ts`: `soilbornePressure(family, inoculum)` multiplies early
  `biomassFrac` gain by `1 − 0.25·pressure` for the first 21 days, decaying to 0 by canopy
  closure. Small, one term, one test.
- `soilOut` is computed from the run summary + interventions: `nPoolKgHa` = `meanNitrogenKgHa`,
  `organicMatterPct` = `carry + 0.02·coverCropYears + 0.10·compostApps − 0.05·bareYears`,
  clamped 0.5–8.0. Documented approximation, **not** a validated SOC model — label it.
- Inoculum: `+0.35` for a family planted this season, `×0.7` decay per host-free season,
  capped 1.0.
- No new snapshot type: a season is a small summary. Replay a season by replaying its runs.

### 5.4 Storage: move runs to IndexedDB (required here, not later)

40 runs × a season `envSeries` is already the localStorage-quota driver (`localApi` comment).
Campaign mode multiplies it. In this workstream:

- `src/lib/db.ts` — tiny IndexedDB wrapper (`idb` **not** required; raw API, ~80 lines), stores
  `runs`, `seasons`, `ensembles`; localStorage keeps `plans/sites`, settings, crops.
- One-time migration copies `simRuns` out of the blob and deletes them there.
- `Api` interface unchanged — `localApi` reads/writes IndexedDB. `restApi` unchanged.
- Quota failure must be **loud**: today `store.flush()` catches the write error, leaves `dirty`
  set, and `console.warn`s exactly once — silent to the user, who keeps editing into a buffer
  that will never persist. Replace with a `storage-failed` event + banner, and never fall back
  to in-memory-only without saying so.

### 5.5 UI

- Campaign strip: year chips with yield, OM and rotation warnings per year.
- Planner hints: "tomato family here in 2024 and 2025" on hover; a soft warning (not a block)
  when planting the same family within 3 years in the same bed.
- End-of-season flow: "close season" → confirm harvests → show `soilOut` → creates next year's
  `soilIn` and a fresh plan that keeps infrastructure but clears planting.

### 5.6 Acceptance

`campaign.soil.test.ts`: OM rises under cover crops and falls under bare fallow; N carry enters
`initialNitrogenKgHa`; inoculum builds under repeat family and decays without a host; a season
with no carry is byte-identical to a non-campaign run. `campaign.storage.test.ts`: IndexedDB
migration is lossless and idempotent; quota failure surfaces.

---

## 6. Workstream F — The twin loop: observe, assimilate, score

### 6.1 Goal

Real observations correct the model and the model reports how wrong it was. The sim learns
*this* user's house.

### 6.2 Observation ingest

```ts
export type ObservationMetric =
  | 'airTempC' | 'rhPct' | 'vpdKPa' | 'co2Ppm' | 'dliMol'
  | 'soilMoistureFrac' | 'soilTempC' | 'yieldKg' | 'stage';

export interface Observation {
  id: string;                  // stable, order-defining
  farmId: number;
  environmentId?: string;
  growingSpaceId?: string; levelId?: string; // crop/root-zone metrics; absent = floor
  metric: ObservationMetric;
  value: number;
  unit: string;
  date: string;                // YYYY-MM-DD (daily resolution — the tick's resolution)
  at?: string;                 // ISO timestamp when known
  source: 'manual' | 'csv' | 'sensor' | 'lab' | 'photo';
  quality?: 'ok' | 'suspect';
}
```

v1 adapters: manual entry (exists), **CSV import** with a column-mapping UI (Ecowitt and
AC Infinity exports are both wide CSVs), and a `POST /observations` passthrough in `restApi`.
MQTT/Home Assistant is a documented next step, not in scope. Never gate on a vendor: no
AC Infinity cloud call in v1 — it is reverse-engineered and read-only at best.

Sensors gain `environmentId` so a tent probe corrects the tent.

### 6.3 Assimilation

- Observations are **frozen into the run** (`RunRecord.observations`), sorted by `(date, id)`,
  like `envSeries`. Live observation drift must never change a stored run.
- Day-boundary reducer, before `stepDay`:
  - `soilMoistureFrac`: `m += 0.5·(obs − m)`, clamp [0,1]
  - `stage`/biomass: `b += 0.3·(obs − b)`, clamp [0,1], **monotonic non-decreasing**
  - `airTempC`, `rhPct`, `vpdKPa`, `co2Ppm`, `dliMol`: drivers, not state → these feed
    **calibration** (§6.4), never a state write
- Each assimilation writes a `SimEvent { kind: 'assimilated', data: { metric, innovation } }`
  so the correction is visible, not magic.
- A run with observations is labelled `twin`; the original stays untouched.

### 6.4 Calibration (the payoff)

`FarmCalibration` per environment: fitted `{ coverTransmission, uValue, achInfiltration,
etFactor, shelterFactor }` from ≥14 days of paired sensor + outdoor data, via **bounded grid
search** (deterministic — no optimisers with random restarts). Stored versioned, shown as a
diff against archetype defaults, applied only on user approval:

> "Your greenhouse runs 3.1 °C warmer than the model. Apply? (raises cover transmission
> 0.70 → 0.78, U 4.0 → 3.2)"

This is the feature nobody else can ship, because nobody else has a parameterised model and
the user's own measurements.

### 6.5 Scorecard

`TwinScorecard { metric, n, mae, bias, windowDays }` per farm/environment, rolling 30 days.
UI: "model vs. you" — predicted vs observed sparkline, MAE, bias, and the worst-metric callout.

### 6.6 Acceptance

`twin.replay.test.ts`: identical observation sets replay byte-identically; unsorted input is
canonicalised; assimilation is bounded and monotonic; a driver observation changes no state;
`calibration.test.ts` recovers a known synthetic bias and refuses to fit on <14 days;
scorecard math is unit-tested against a hand-computed fixture.

---

## 7. Sequencing and gates

| Phase | Contents | Ships when |
|---|---|---|
| 0 | A.1–A.9 (world model, migration, selection/setup, two scopes, layout foundation and run targeting) | migrated plans run byte-identically; world isolation/reload; appshot both scopes |
| 1 | B (climate) | `env.climate.test.ts` green; greenhouse golden diff explained |
| 2 | C (asset physics + editable growing levels) | DLI/rack/water-store tests; vertical/container journeys; inspector live |
| 3 | D (time) | fork prefix identity; ensemble budget met |
| 4 | E (campaign + IndexedDB) | season carry tests; quota banner |
| 5 | F (twin) | replay + calibration tests; scorecard UI |

Each phase is a PR series behind its flag. Phase 0 must land before 1–2 touch anything
climate-shaped; 3 and 4 are independent of 1–2; 5 depends on 1 (and benefits from 2).

**Definition of done (all phases):** `npm test`, `npm run typecheck`, `npm run build`,
`npm run check:private`, appshot `--gate` on Blueprint and World, no new console errors, no
`Math.random` in sim/creative, and a one-paragraph note in `implementation-notes.md` naming
which terms moved in any golden diff.

---

## 8. Explicitly out of scope

- Marketplace / sharing / blueprints UI (needs the single-player loop first).
- Robotics (FarmBot sequences), actuator *control* writes, AC Infinity cloud calls.
- Satellite NDVI ingest and phone splat/LiDAR capture.
- Full Vanthoor hourly model, full soilless EC/DO/pH, validated SOC model.
- Permapeople-backed content (CC BY-SA 4.0, non-commercial for free API access).
- Multi-environment single runs (§2.6), unless a failing user story demands it.
- Native apps, accounts, backend beyond the existing `Api` seam.

---

## 9. Revision log

Written as v1, then reviewed against the repo and the skill's domain notes. What changed and why:

- **R1 — Split environments into A (model) and a conditional B.6 (multi-env runs).** v1 tried
  to make runs multi-environment in the foundation phase. That makes the cut line invisible and
  puts the riskiest change first. Multi-env is now conditional on a real user story.
- **R2 — Steady-state daily energy balance, not full Vanthoor.** Vanthoor is hourly with 100+
  parameters; the tick is daily. v1 implied a port. Now: Vanthoor-derived constants,
  steady-state solve, hourly only where a setpoint flips.
- **R3 — Racks multiply area exactly once, through one choke point.** v1 multiplied footprint
  area by tiers *and* kept per-cell plant counts, which double-counts yield. Now:
  `effectivePlantingArea()` is the only place tiers apply, with a test.
- **R4 — Lights take max, heat sums.** v1 summed PPFD across overlapping bars, which lets a
  painted row of lights produce 10× DLI. Photons don't add across the same footprint; watts do.
- **R5 — IndexedDB moved into Phase 4, not "later".** 40 runs × `envSeries` already presses the
  ~5 MB budget; campaigns multiply it. Deferring storage would ship a feature that eats plans.
- **R6 — Fork keeps the parent's whole `envSeries` and `meanDailyGddC`.** v1 was ambiguous
  (slice the series, recompute the mean), which breaks prefix identity and the causal claim
  that only management changed.
- **R7 — Soilless cut to "water sufficient, nutrient can fail".** v1 had EC/DO/pH in v1 scope;
  that is a second root-zone model, and honest v1 is the failure mode without the chemistry.
- **R8 — Observations frozen into the record, canonical order.** v1 said "apply observations"
  without pinning them, which breaks replay the moment a sensor posts again.
- **R9 — Added the out-of-scope list.** v1 implied marketplace, robotics and satellite by
  omission; they are stated as excluded so they don't get smuggled in as "related work".
- **R10 — Added a schema version + idempotent migration.** v1 omitted it, and `store.ts`
  currently reseeds on a corrupt blob — a silent migration failure would wipe user plans.
  (Corrected again in R15: there is no existing version field to key on.)
- **R11 — Added the `water-short` failure mode.** v1's water stores had no consequence. A
  failure the user can *cause* and then see is worth more than another stress coefficient.
- **R12 — Ensemble budget made explicit (p95 ≤ 2.5 s, 10 runs, worker).** v1 said "ensembles in
  the UI" with no cost model; 10 × 2,001 cells × 90 days on the main thread would jank.

### Corrections found by checking v2 against the repo (not by re-reading it)

- **R13 — Time workstream was over-scoped.** v1 said "no branch, no A/B comparison", which is
  false: `seekDay`, `applyIntervention` (deterministic refold) and `loadGhost` (live 3D ghost)
  all ship today. Building a second comparison mechanism would have duplicated working
  machinery. Scope now: one clock + replay LRU, promote the ghost to a persisted `forkRun`, add
  `compareRuns` + a delta strip.
- **R14 — DLI thresholds vs CEA targets split.** v1 asserted the published CEA bands were the
  existing table. They are not: `DLI_NEED_MOL` is `{fruit 20, grain 18, vegetable 14, herb 10,
  flower 10, cover 8, fungus 0}` — minimum-stress floors. Ported verbatim as `DLI_MIN_MOL`
  (behaviour-preserving) with `DLI_TARGET_MOL` added separately for sizing and the inspector.
- **R15 — Migration has no version to key on.** `AppState` is unversioned, and `load()` merges
  demo plans keeping only `surface` — after migration that silently reverts every demo farm to
  one environment on reload. Spec now adds `version?: 2`, treats absent as 1, migrates before
  the merge, and preserves the stored environment list.
- **R16 — Rack tiers must be inside the `floor`.** `plantsForArea` floors
  `cells·CELL_AREA_M2 / spacingArea`; multiplying after the floor loses a plant per cell and
  would have failed the 4× test written in the same spec.
- **R17 — Fork builds on existing divergence.** `applyIntervention` + `unsavedChanges` already
  hold the in-memory branch; v1 would have added a parallel path beside it.
- **R18 — Trail mode is not free.** `buildGhostPlants` takes a `PlanState`, and no per-day plan
  is stored (replay only). Trail needs a derived planting map per ghosted day — small, but the
  spec now says so instead of claiming reuse it doesn't have.
- **R19 — Quota behaviour stated as it is.** `store.flush()` catches the write, leaves `dirty`
  set, and `console.warn`s exactly once. There is no banner today, so the spec describes a new
  behaviour rather than citing an existing one.

### R20 — Growing worlds are the planning context (2026-10-24)

Made the user's intended flow binding: choose a field/structure/vertical/container world,
configure it, then plan within its own space and rules. Added the nine-world behavior matrix,
site/world/system vocabulary, setup and return flow, access/reservations, stable spatial and
mount identities, lifecycle/replay rules, independently editable rack levels, and acceptance
journeys. The zero-environment exception is replaced by an explicit empty-site state; the
surface alias remains additive during migration. Phase 0 now includes run targeting and the
world-selection foundation; Phase 2 must deliver real vertical/container planning. The spec
contains six workstreams, so its former “five” title/mission wording is corrected.

### R21 — Phase 0 persistence and compatibility contracts (2026-10-24)

- `Environment.cellM` is the canonical grid resolution alongside its canonical `widthM` and
  `heightM`; the nested `Environment.plan` mirrors all four identity/extent values on every
  save or resize. New saved plans omit the deprecated `surface` alias.
- A new `RunConfig` freezes `environment` metadata/layout without its `plan`; `basePlan` is the
  sole copy of the frozen floor plan. The metadata type is `Omit<Environment, 'plan'>`.
  Historical run records may have no `environment`; replay continues through their frozen
  `basePlan.surface` adapter. New runs freeze their selected environment's archetype.
- V2 site records, including each environment plan, take precedence over legacy `plans` during
  migration and demo-farm reload. V1 plans create one environment only when no saved v2 site
  exists. A one-world legacy plan call resolves that single world; an omitted target on a
  multi-world farm reads as no plan and a write fails with a choose-world message.
- The stored editor target is a navigation preference, never run input. Undo entries and
  delayed saves capture their environment id so switching worlds cannot retarget history or
  autosave work. Saving a restored environment snapshot preserves its saved plan timestamp;
  ordinary edits stamp a new timestamp before persistence.
- Environment plan coordinates use a top-left origin: x increases east/right and y increases
  south/down. A south access reservation touches `y = heightM - depthM`; north, east and west
  access reservations follow the corresponding edge. Phase 0 retains legacy surface climate
  tables as a mapped adapter so v1 run summaries remain unchanged; archetype climate becomes
  authoritative when Workstream B lands.
- `VITE_FF_ENV_RECORDS` defaults off in `main`; when off, v1 storage and the legacy plan/render
  path remain usable, while already-written v2 site data is preserved. When on, migration is
  additive and new site/world mutations are enabled.
