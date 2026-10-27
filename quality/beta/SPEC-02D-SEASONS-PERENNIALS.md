# BETA-02D — Crop cycles, rotations and perennial production

Status: development-ready; implementation pending. Owner: lifecycle/model engineer; independent validator. Depends on 02A–C frozen state and experiment contracts.

## Outcome

A site/world can be followed across crop cycles, seasons, rotations and multiple years. Annual harvest/reset behavior must not erase perennial age, roots or the next season's state. Build on the existing campaign/close-season flow; do not introduce parallel season storage or a separate growth engine.

## Required behavior

- Define explicit crop lifecycle types for annual single harvest, repeated-cut/indeterminate production, biennial and perennial cases. Distinguish development stage, standing biomass, harvestable organs, reserves, harvested mass, age and alive/dead status. A single `harvested` boolean cannot represent every lifecycle.
- Use sourced species/default and selected-cultivar parameters for establishment, maturity endpoint, photoperiod/vernalization/chilling/dormancy where relevant, regrowth and repeated yields. Represent unavailable traits explicitly with limitations; a generic fruit crop cannot inherit an invented orchard yield curve. Model at least a documented representative annual, repeat-harvest leafy/herb, fruiting vegetable and perennial case. Fungi have their own supported substrate/flush lifecycle or an explicit unvalidated boundary.
- Distinguish sowing/transplanting/established initial state; document initial age/reserves and units. Daily/subdaily development and initial conditions agree with 02A. Time/year boundary alone does not reset state.
- Support a bounded, documented multi-year horizon throughout API validation, weather-series generation, playback and persistence; the baseline single-run 365-day cap cannot silently truncate a perennial experiment. Freeze each year's actual driver dates/provenance, handle leap years and hemisphere/season differences, and measure runtime/storage limits. Do not loop one weather year without labelling that experiment assumption.
- Carry soil/media moisture, supported N/OM/inoculum/root/reserve states and shared resources according to their actual model. Separate observed corrections from estimated carryover; no claim that the current coarse OM carry is validated carbon sequestration or complete soil chemistry.
- A season is a reporting/management boundary; closing it records a checkpoint, harvest observations and the next-plan transition. Explicit plough-out, crop removal, replanting and reset actions have scoped consequences with confirmation/history. Reopening/repeating close-season is idempotent.
- Harvest transactions withdraw from available harvestable state; repeated cuts reduce biomass/reserves appropriately and may regrow from modeled inputs. No duplicated auto/manual/observed harvest payout. Observed harvest corrections retain the original prediction and measurement provenance, not an unexplained overwritten result.
- Rotation and perennial establishment are scoped to stable world/target identities and dated transitions. Moving/reducing racks or deleting worlds cannot silently reassign their carryover. Site totals sum each harvest once across cycles/worlds/years.
- Freeze lifecycle/parameter versions and state in checkpoints/backups; old annual runs preserve original semantics. Use compatible model dispatch or an explicit unsupported-reader path.

## Acceptance

| ID | Case | Required result |
|---|---|---|
| L-01 | Annual cycle and next-season rotation | Explicit end/replant state, scoped soil carry and no phantom old crop. |
| L-02 | Repeat-harvest crop with multiple cuts | Available mass decreases, regrowth requires modeled resources, cumulative yield counted once. |
| L-03 | Perennial establishment → winter/dormancy → following production years | Age/reserves/root/lifecycle persist; source-consistent timing/production and no annual reset. |
| L-04 | Cross-year/non-calendar season, leap date and northern/southern cases | Continuous correct dates and forcing, no fixed Northern calendar assumption. |
| L-05 | Observed harvest correction, close season twice, reload/fork | Original prediction retained, explicit correction and idempotent transitions. |
| L-06 | Multiple worlds/tiers across site seasons | Identity isolation and reconciled totals; changed topology requires explicit disposition. |
| L-07 | Published independent multicycle/perennial fixture and synthetic boundaries | Source-qualified report separates measured error from synthetic invariants; limited traits remain labelled estimates. |

Deliver lifecycle/state-transition diagram/table, parameter sources and holdout fixtures, carryover unit/balance accounting, year-spanning replay and backup fixtures, UI explanation and existing campaign migration tests. Do not claim all perennial cultivars are validated from one representative species. Missing external evidence is recorded for the specific claim; do not erase the required lifecycle functionality to obtain a green report.
