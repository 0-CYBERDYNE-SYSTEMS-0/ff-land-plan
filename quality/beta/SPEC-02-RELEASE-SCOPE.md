# BETA-02 — Complete and expose the full growing-world simulator

Status: user direction recorded; development-ready contract, not implementation/release completion.
Accountable owner: simulator lead with independent model/frontend review.
Depends on BETA-01 durability. Replaces the earlier planner-only profile proposal.

## Outcome and scope

A user chooses any of the nine growing worlds, configures physical space/crops/equipment, runs a reproducible simulation, changes the design or management before/during the grow, and compares outcomes in 3D. Independent worlds and coordinated site runs are supported. Seasons, rotations and perennial production carry explicit state. Observation imports enable a growing twin. Species defaults and selected sourced cultivars provide researched estimates; independently measured confidence is specific to the crop, environment, metric and domain tested.

Blueprint supplies precise setup and editing. World supplies simulation playback, comparison and causal explanation. Keep the functioning planner/3D/engine and repair/extend their seams. Removing simulator/indoor/campaign/twin workflows, restricting all users to outdoor plots, or making World a static-only substitute does not satisfy this contract.

## Evidence from inspected baseline

At `8962bef`, the daily reducer, frozen weather/crop inputs, named growing targets, explicit equipment, forks, comparisons, campaigns and manual/CSV twin layers exist. Important gaps: `drivers.ts` derives required GDD from the run-window mean and every crop uses base 10; `cropThermalParams.ts` is unused; biomass follows thermal progress and known zero DLI only applies bounded stress. Enclosure climate computes RH/VPD/CO₂ beyond what crop growth consumes. Root-zone/N assumptions remain coarse. A second no-run growth path remains in `growth.ts`/World3D. Historical run projection can use a live, changed world. Current runs are single-world; existing forks change management, not arbitrary dated equipment/layout/crop configurations. These are baseline findings, not claims all referenced code will remain at these lines.

## Assignable implementation contracts

Read and implement [02A](SPEC-02A-CROP-MODEL-EVIDENCE.md) → [02B](SPEC-02B-ENVIRONMENTS-RESOURCES.md) → [02C](SPEC-02C-EXPERIMENTS-SITE-3D.md) → [02D](SPEC-02D-SEASONS-PERENNIALS.md) → [02E](SPEC-02E-OBSERVATIONS-SYNTHETIC-CSV.md), one reviewed stage at a time. Early synthetic fixture preparation can parallel model work. Each has explicit acceptance; none can be replaced by enabling six flags.

Primary seams: `src/lib/sim/`, `src/data/cropThermalParams.ts`, `src/creative/archetypes.ts`, `src/data/assets.ts`, environment/growing-target types, `localApi`/`restApi` contract, `useSimRun`, `PlotDesigner`, World3D and associated panels. Preserve existing editor and data seams; coordinate ownership before editing shared files.

## Product build and consistent behavior

- Implement `VITE_FF_SIMULATOR_BETA=true` with `dev:beta` and `build:beta`. Default false for standard/internal commands; preserve standard/demo behavior until explicitly migrated with regression evidence.
- Beta requires all six existing core-loop capabilities true: environment records, enclosure climate, asset physics, timeline, campaign and twin. Beta scripts explicitly set them and `VITE_API_BASE_URL` empty for the initial local workspace. Vite build validation rejects conflicting effective flags/remote configuration; do not silently override unknown deployment configuration. Add a small central profile module, not a permissions service.
- Core work is reachable through ordinary UI, not developer query hooks. The beta manifest in BETA-05 records effective flags, model versions, reader versions, API mode and interactive 3D role.
- World selection, run targeting and historical playback are explicit. Frozen historical runs cannot change when today's plan, selected world, weather cache, catalog or code defaults change. Unsupported historical model versions show a safe explanation/export path rather than a silent rerun.
- All map overlays, 3D growth, run statistics, Monitoring, calendars claiming simulation output and exports reconcile to one engine authority and explicit scope/date. A planning thumbnail may be illustrative only when labelled; it cannot advance a conflicting biological clock.
- Keep sample examples distinct from personal worlds; labelled defaults are assumptions. Dimensions mean usable metres. Preserve existing larger/multiworld data; derive the supported performance envelope from measured fixtures rather than the withdrawn 10×10 m restriction.
- Show estimated versus observed versus synthetic values, units, source/time, parameter coverage and validation status beside relevant outputs. Weather freshness is weather provenance, not evidence of measured crop health. Retain useful numerical outputs; qualify claims according to their evidence.
- Capacity warnings identify the world/target, limiting input and consequence. Zero/absent inputs are distinct. Missing equipment must not be silently supplied by the selected archetype. Unknown properties produce explicit uncertainty, not a fabricated pass.
- Predictions remain planning support. Explain known limits, uncertainty and failed/unsupported calculations; no guaranteed harvest or invented accuracy labels.

## Acceptance matrix

| ID | Production case | Pass condition |
|---|---|---|
| S-01 | New user configures each of nine world types with a representative crop/system | Saved physical space, targets and equipment match Blueprint/3D and actually influence the run; no developer URLs needed. |
| S-02 | Normal run UI, `ffrun`/`ffghost`, saved historical run, changed active world | Exact frozen scope/context restored; replay produces no hidden new record; missing/incompatible inputs explained. |
| S-03 | Standard/demo/beta and conflicting config builds | Distinct, documented profiles; beta six flags true/local API; conflicts fail; manifest matches actual behavior. |
| S-04 | Prior v1/v2/rack/equipment/runs plus later schemas | No loss/retargeting/reseeding; old model replay remains reproducible or explicitly unsupported with export. |
| S-05 | Blueprint setup → 3D run → seek → dated change → fork → compare | One state/date/target authority; matched comparisons preserve unchanged drivers and show changed ones. |
| S-06 | Independent worlds versus combined site with sufficient/insufficient supply | Same results when uncoupled; shared limits and conservation alter only affected consumers; no tier/room double count. |
| S-07 | Crop/season/cultivar and light/temperature/water/equipment benchmarks | 02A/B suites pass, evidence-specific confidence visible; missing light never becomes productive zero-light photosynthesis. |
| S-08 | Crop cycles, rotations, winter/year boundary, perennial/repeated harvest | 02D state persists/replays; correct lifecycle and accounting, no automatic annual reset or duplicate harvest. |
| S-09 | Synthetic CSV → preview/import → compare/correct → replay/backup | 02E provenance remains visible and frozen; synthetic input cannot earn measured-accuracy status. |
| S-10 | Published measured/reference fixtures and catalog gaps | Reproducible source/method/domain/tolerance report; validated claims match measured coverage; unvalidated entries remain identified estimates. |
| S-11 | Offline provider/cache/failed save and target switch during work | Sources/errors honest; editing, backup and BETA-01 latest pending work survive; no false live/observed/Saved status. |

## Delivery

Deliver model/schema decisions, effective flag table, 02A–E acceptance evidence, nine-world coverage matrix, reviewed equation/golden diffs, frozen historical-run fixtures, production journey captures and explicit limits. Synthetic replay/property tests and external model agreement are recorded separately from independent measured-trial validation. An absent published case remains UNVERIFIED for its claim; record work to acquire/reproduce it, never fabricate a reviewer approval. BETA-05 owns final release recommendation for the exact artifact.
