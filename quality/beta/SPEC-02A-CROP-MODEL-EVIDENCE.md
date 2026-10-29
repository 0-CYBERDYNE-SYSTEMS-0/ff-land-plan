# BETA-02A — Credible crop development, production and evidence

Status: development-ready; implementation pending. Owner: crop-model engineer; independent validator reviews assumptions, equations and fixtures. Depends on BETA-01; first BETA-02 model stage.

## Outcome and boundaries

Repair the existing deterministic engine so crop choice, cultivar, planting event, season, light, root-zone water and nutrients cause defensible consequences. Keep its replay/editor/view seams. Choose reference methods through engineering research and a short decision record; the user is not responsible for selecting equations. No universal agronomic-accuracy claim follows from software tests.

Read `drivers.ts`, `engine.ts`, `soil-water.ts`, `ecosystem.ts`, `model-inputs.ts`, `types.ts`, `cropThermalParams.ts`, `growth.ts`, existing tests, and the repo research survey. Opening historical status in old docs may be stale; compare code.

## Required contracts

1. Version equations and crop/soil parameter sets in frozen runs. New runs freeze the complete inputs they consult: units, provenance, stage/planting event, method/version, cultivar/default/fallback status and material soil/media values. Replaying an older record must use its old semantics through explicit version dispatch, or safely report that its version is unsupported; no silent re-simulation or overwritten summary. Migration cannot invent missing original measurements. Reuse immutable records, not a second run framework.
2. Separate phenological development, productive biomass and harvestable yield. Biomass is not simply a thermal-progress ratio. Specify a sourced radiation/transpiration-driven production approach, respiration/maintenance where material, allocation/harvest index and crop stress effects. Document units, daily/subdaily assumptions and conservation. Development cannot manufacture harvestable mass without its modeled inputs.
3. Use crop-specific thermal bases/upper thresholds and fixed referenced totals. Preserve accumulation method (daily average/single sine/etc.), sow/transplant starting event, endpoint and cultivar range. Do not average incompatible references or scale maturity thresholds by this run's weather. Use the existing thermal table as source evidence, not arbitrary midpoint truth. Species defaults and selected cultivar values are explicit; missing coverage has a documented researched fallback and unvalidated status.
4. Known zero usable light produces no sustained photosynthetic biomass/harvest gain. Any germination/seed reserve or pre-existing biomass exception requires explicit initial state, finite reserves and accounting. Fungi use a separate substrate/lifecycle contract; do not apply plant photosynthesis to fungi. Unknown light is unknown, not zero and not silently sufficient. Non-finite/missing necessary inputs cannot yield an apparently verified success.
5. Replace the universal fixed root-depth bucket where crop/media differences matter: parameterized root development, effective root-zone depth, water holding/depletion, drainage/runoff and uptake limits with unit-consistent input/output accounting. Soil and soilless media require explicit models/limits; do not claim a coarse N pool models solution chemistry, salinity, pH or oxygen. Model parameters affecting results are frozen and inspectable.
6. Inventory every published output and its actual causes: harvest amount/date, biomass/stage, water/N uptake/stress, pests/companions, crop suitability. Repair or label unsupported heuristic effects. A crop height/maturity trait cannot be fabricated to fill a warning. CO₂/VPD effects are integrated in 02B with no double application.

## Reference selection and independent evidence

Before retuning, commit a decision record and evidence manifest. Evaluate primary sources and existing implementations (e.g. FAO-56 water balance, PCSE/WOFOST/LINTUL, AquaCrop-OSPy, DSSAT) for crop/domain coverage, parameter requirements, numerical method, license/attribution and browser/local deployment fit. Select/reuse/adapt components with a written rationale; do not port a whole framework solely because it exists. A new backend or runtime is an architectural change to justify, not an implicit dependency.

Each benchmark records stable ID, source URL/DOI, retrieved version/date/digest/license, crop/cultivar, environment, inputs, units, start/end events, measured versus reference-model versus synthetic classification, expected metric/range, missing data and valid domain. Record any adaptation and its effect on comparability. Maintain separate calibration and holdout cases; do not fit and report accuracy on the same records.

Before executing the candidate comparison, set each metric's numerical tolerance and rationale from measurement precision, published error or numerical analysis. An independent validator reviews these choices. Do not choose tolerances after seeing failure, invent a universal error percentage, or call the model's own generated output external evidence. Software/numerical review is not a fabricated horticultural expert sign-off.

Create `quality/beta/evidence/model-coverage.json` (or equivalent documented manifest) during implementation: every catalog crop has parameter/fallback status; each validated claim names crop/cultivar, environment/domain, metric, sample size, held-out error and source fixture IDs. Only independently measured coverage may show empirically validated accuracy. Reference-model agreement and sensitivity ranges retain separate labels. No unavailable data turns a required case green; continue engineering and report UNVERIFIED claim coverage for release review.

## Acceptance

| ID | Fixture | Required result |
|---|---|---|
| A-01 | Same frozen inputs, changed current catalog/defaults/cache | Identical historical replay under its model version; new version creates a distinct record. |
| A-02 | Same crop in cold/warm windows and different locations | Fixed thermal target; appropriate crop-specific rate and no circular season normalization. |
| A-03 | Same thermal state, known zero/low/sufficient light | Documented reserves only; no invented productive gain at zero; defensible response below/above limits; fungi separately tested. |
| A-04 | Sowing versus transplanting; species default versus supported cultivar | Correct initial state, reference starting event and maturity endpoint; no double counting pre-transplant development. |
| A-05 | Water/N inputs, dry-down, drainage, root-depth/media variants | Bounds and balance residuals meet predeclared tolerance; impossible uptake cannot occur; shortage affects production. |
| A-06 | Independent measured/reference datasets with holdout cases | Reproducible report distinguishes agreement, measured error and unverified assumptions; no hidden tuning or fabricated confidence. |
| A-07 | Existing spacing, mortality, management, target and golden suites | Deliberate reviewed changes; plant counts and harvest mass reconcile; finite deterministic replay. |
| A-08 | Missing critical inputs and unsupported crop trait | Useful explanation and qualified result; no fabricated pass/observed claim. |

Deliver equation/parameter decision record, source manifest, fixtures and acquisition/reproduction instructions, coverage/error report, reviewed golden diff and model dispatch/migration handoff to 02B–E and BETA-03. Preserve old model semantics deliberately; historical defects can be labelled without rewriting a user's original experiment.
