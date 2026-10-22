# Creative Asset Gauntlet — 2026-10 (bar A: official Minecraft renders)

Orchestrated run against `quality/QUALITY_BAR.md`. Three haiku-5.5 builder
sessions (disjoint file ownership) plus fresh-context blind critics. Every
verdict below is from a label-free render compared against a named, fetched
reference — not from reading the code.

## Method

- Harness: `showcase.html#only=<ids>&spin=0` via `tools/appshot.mjs`, sliced to
  380×300 tiles with the label band and the in-tile slug flooded out.
- **Bar A**: official renders from minecraft.wiki — `Potatoes_Age_7_JE8`,
  `Carrots_Age_7_JE9`, `Wheat_Age_7_JE5`, `Chicken_JE2_BE2`, `Water_JE16`,
  `Cauldron_JE8`, `Rail_JE3_BE2`, `Wooden_Hoe_JE3_BE3`. Each fetched once,
  verified openable, cached.
- Two blind tests per asset: forced naming (no label, no menu) and a side-by-side
  "which is more instantly recognizable at equal on-screen size" against the
  reference with panels randomized and labels stripped.
- Gates: `npm run typecheck`, `npm test` (15), `npm run build`, plus a
  determinism check (two `spin=0` renders byte-identical:
  `27a4b91b…8fb`).

## What the measurement taught us (read this before trusting any score)

1. **The first "blind" tiles were not blind.** The showcase paints the entry
   slug inside each viewport's bottom-right corner (`.id-tag::after`). At 380 px
   the critic could read it, which inflated results (7/8 and 11/12 passes).
   Every score taken before the corner flood is discarded; the numbers here are
   all from corrected tiles.
2. **Species-level naming at small size is not a usable gate.** Run on
   Minecraft's own official renders as a control: 6/13 correct at 96 px, 9/13 at
   160 px, 8/13 at 380 px in a mixed set, and 1/3 at 380 px in a crops-only set
   (it swapped potato and carrot). A test that fails shipped Minecraft art
   cannot fail our art meaningfully. Naming is kept only as a diagnostic.
3. **The usable gate is the blind A/B.** Same subject, same on-screen size, two
   panels: the critic picks one, and names the single biggest gap. Judge
   variance measured on unchanged assets across runs is ±2 of 13, so a single
   pair flip is noise; a repeated loss is a real defect.

## Result

Blind A/B at 300 px panels, ours vs the bar: **9/13** (baseline before the run
was 6/13 at 96 px panels; the pre-run 380 px numbers are contaminated, see
above).

Beat the reference: potato, root-carrot, allium, brassica, duck, fish-tank, hoe,
pond-center, rooster.
Lost: bush-bean (twice, "flat umbrella canopy", "dense blob with grey knobs"),
chicken (twice, "stacked blocky feathers and odd head", "muddy tan body"),
greens-open (once; it won the other run), irrigation-line (once; it won the other
run).

`grow-light`, `grow-tent`, `pitchfork`, `env-warehouse`, `env-grow-tent`,
`env-nft-gully` have no honest Minecraft analogue, so they were judged on
naming plus construction only — no A/B was invented for them.

## Files touched (11, +716/−339)

| lane | file | assets |
|---|---|---|
| B | `crops/roots.ts` | potato, root-carrot, allium |
| B | `crops/vines.ts` | bush-bean |
| B | `crops/heads.ts` | brassica, greens-open |
| C | `structures/props.ts` | irrigation-line |
| C | `structures/envEquipment.ts` | fish-tank |
| C | `structures/equipment.ts` | grow-light |
| C | `structures/buildings.ts` | grow-tent |
| D | `creatures/animals.ts` | chicken, rooster, duck |
| D | `creatures/tools.ts` | hoe, pitchfork |
| A | `terrain/water.ts` | pond-center |
| E | `environments/registry.ts` | env-warehouse, env-grow-tent, env-nft-gully |

`voxel.ts`, `shared.ts`, every registry, and all docs were leader-owned and are
untouched by builders. No `Math.random` was introduced (grep clean), no lights
added, no exported signature changed.

## Open items

1. **bush-bean** and **chicken** lost the A/B in both measured rounds. Both need
   a different approach rather than another pass: bush-bean's canopy needs real
   holes and a pod that hangs clear of it; chicken needs the head/neck to read
   as a bird at 300 px, which its current block stack does not.
2. **greens-open** and **irrigation-line** flip between runs. Likely a real
   ambiguity (open rosette vs low mound; trough vs line) rather than noise, but
   it is below the resolution of this test.
3. The lane-state files (`quality/state/lane-*.json`) still describe the
   August beta pass and were deliberately not rewritten.
