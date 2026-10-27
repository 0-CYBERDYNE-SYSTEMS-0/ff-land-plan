# BETA-02C — Reproducible experiments, site simulation and 3D consequences

Status: development-ready; implementation pending. Owner: simulation orchestration/3D engineer with independent validator. Depends on 02A/B; extends the original single-world run boundary.

## Outcome

Users configure designs in Blueprint, run independent worlds or a coordinated site, change crops/layout/equipment/management before or during a grow, and inspect outcomes/comparisons in World. The same frozen simulation state drives every biological display.

Read `useSimRun`, `timeline.ts`, run persistence/API, PlotDesigner deep-link effects, World3D/plants/view projection and current historical context. At baseline, forks retain weather and management changes, but do not generally model dated equipment/layout changes; run growth may project onto today's selected world. Fix these paths in place.

## Experiment and replay contracts

- A run snapshots its site/world/target identity, physical layout, crop/cultivar initial state, model/parameter versions, equipment/settings, resource topology, environmental drivers and observation set. Historical playback uses those frozen dimensions/shell/targets, not the live editor selection or today's catalog/cache. Show the current plan separately only through an explicit labelled comparison.
- Editing the current plan does not mutate a saved run. A changed design creates a new experiment record; preserving historical results must not depend on the current live world continuing to exist.
- Define typed, dated events for crop changes/planting/harvest, layout/equipment installation/removal/moves/capacity/schedules, management and settings. Structural changes use explicit crop-state disposition (retain with identity, move, remove/harvest with accounting, or reject). Preview affected state and require confirmation for destructive changes. Never teleport or reset crops silently.
- Specify start-of-day/event/substep/end-of-day ordering, timezone/calendar semantics, stable event IDs and deterministic collision rules. Validate target references and past/future ranges. Same-day changes cannot spend a resource twice.
- A fork at a completed-day boundary has an identical prefix and preserves all unchanged inputs, including the full weather driver. New dated interventions alter only the suffix. Layout/equipment changes that invalidate prefix identity create a new baseline experiment or explicit boundary event, not a silently rewritten past.
- Expose a coherent pending-work snapshot interface for BETA-03: unsaved scenario/fork inputs, dated interventions, crop/layout/equipment drafts, target identities, model versions and valid checkpoint identity, with revision/durable status. Coordinate mutation pause/capture and worker-generation cancellation with restore. A partial asynchronous computation is incomplete work, not a completed successful run; stale worker completions cannot overwrite a restored workspace or newer revision. BETA-01's pending plan interface alone does not cover simulator session state.
- Support both matched counterfactual comparisons and cross-world/design benchmarks. Show changed inputs and comparable horizon/units/scope. Label comparisons with differing weather, crop, area or model version; raw differences alone cannot claim a single causal effect. Reject incompatible metrics rather than representing missing values as zero.
- Retire divergent biological timing from `growth.ts` consumers in World/Monitoring/calendar/exports. One simulation authority drives crop stage, stress, harvest and weather date. Pure UI interpolation is allowed between engine snapshots, without changing model outcomes.

## Coordinated site simulation

Keep single-world runs. Add a site orchestrator composing the same world/target model, not a duplicate biology engine. Freeze participating worlds and named shared resources. Default worlds remain independent unless the user explicitly connects a supply.

Define a synchronous step: collect demands from the same pre-step state → deterministically allocate constrained supplies → advance each world/target with its allocations → reconcile shared balances. Select and document allocation (e.g. configured priority or proportional sharing), tie-breaks and shortage handling; show the rule. Iteration, when necessary for coupled climate demand, has a bounded convergence rule and error path. Array order cannot change outcomes.

Use stable site/world/space/level/cell keys. Shared power, water/reservoir and other explicitly modeled supplies have capacity, storage, units and topology. Do not imply separate enclosed worlds share air unless physically connected and modeled. Demand/power limits have consequences (curtailment/control/shortage), not merely a warning badge. Plant counts/yield aggregate actual targets once; kWh, litres and kg are not added to unlike rates. Scope normalization is explicit for area-based comparisons. Resource examples beyond implemented supported types stay qualified.

Checkpoint/seek/fork/site persistence freeze all participating states and supplies. Prevent partial success: a failed participant model cannot become a successful aggregate. Expose the failure and preserve the reproducible inputs. Benchmark performance at representative site size; avoid freezing the UI through long main-thread runs.

## World interface

Ordinary UI exposes run/create/open, play/pause/seek/speed, target/level inspection, change/fork/compare and source/limiting-factor explanation. Every view identifies site/world/target, run/model version and simulation date. A historical deep link restores the correct frozen scene; switching worlds cannot retarget the run. Site playback synchronizes world dates and provides scoped totals. Ghost overlays distinguish baseline/alternative and display context differences. Existing orbit/tour/editor functionality remains compatible.

## Acceptance

| ID | Case | Required result |
|---|---|---|
| X-01 | Save run → edit/delete/switch current world → reopen deep link | Original frozen shell, crop placements, equipment, targets and replay restored. |
| X-02 | Before-start crop/layout/equipment alternatives | Distinct immutable runs; unchanged inputs retained and differences explained. |
| X-03 | Mid-grow crop/equipment/settings/management event fork | Identical prefix; deterministic suffix, correct affected targets and state disposition. |
| X-04 | Seek/reload/export all views | Identical biological state/totals at same date; no independent no-run crop clock. |
| X-05 | Two uncoupled worlds, separate versus site run | Per-world outputs equal within declared numerical tolerance; aggregate no double count. |
| X-06 | Shared supply sufficient/insufficient with reversed world ordering | Conserved allocation, deterministic shortage consequences and visible policy; sufficient case matches uncoupled supply. |
| X-07 | Cross-world/model/weather comparison | Context changes visible; incompatible values unavailable, causal claims limited to matched experiments. |
| X-08 | Failure, invalid event/target, worker cancellation, save/reopen | No partial successful site summary or mutated originals; BETA-01 persistence holds. |

Deliver event/site schema and ordering decision record, replay fixtures, comparison semantics, actual production 2D/3D journey evidence, resource accounting and performance report. Update Api/localApi/restApi/README consistently without claiming an unimplemented remote backend works. Coordinate BETA-03 schema/extensions before landing new stores.
