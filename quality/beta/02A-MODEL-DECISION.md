# BETA-02A crop model and evidence decision record

Status: decision and evidence inventory prepared; tolerance review incorporated; implementation and candidate comparisons have not started.
Prepared: 2026-10-27
Scope: BETA-02A only. This record does not claim horticultural validation.

## Baseline inspected

The current daily reducer is deterministic and replays from `RunConfig` plus frozen `envSeries`. New records freeze used crop records and selected soil fields through `modelInputs`, but the input set has no model/parameter-set discriminator. Legacy records may omit `modelInputs`; `engine.ts` then falls back to caller context or today’s crop catalog. Existing development is run-window normalized in `drivers.ts` (`growthDays × meanDailyGddC`), biomass is `gddAccum / gddRequired`, the water bucket uses a universal 30 cm root depth, and catalog yield is paid independently of accumulated dry matter. `DailyEnvironment` may include natural DLI; enclosure climate can combine natural and installed DLI, while `dliAvailable` distinguishes unknown light from known zero.

The current `cropThermalParams.ts` has nine crop entries. It is useful source evidence, but does not yet cover production, root-zone, nutrient, cultivar, or every catalog parameter. `growth.ts` remains a second calendar-day projection path and must be labelled/kept separate until its consumers are migrated.

## Decisions

### D1. Keep a pure local daily model and use explicit model dispatch

Implement a new crop-model version in the existing TypeScript reducer. Keep `stepDay`, `simulateRun`, frozen environment series, and the existing storage/API seams. Do not add a Python runtime, server requirement, worker framework, or second run store.

Each new run must freeze both a named model version and the complete parameter/input version it consults. Dispatch is explicit:

| Stored record | Replay behavior |
|---|---|
| Explicit v1 model + frozen v1 inputs | Replay the old equations unchanged. |
| Missing model discriminator but complete v1 frozen inputs | Treat as the named legacy v1 semantics; never reinterpret it as v2. |
| Missing discriminator and missing frozen crop/model inputs | Mark historical replay unsupported/qualified, preserve the stored summary and input artifact, and do not recompute or overwrite it from the current catalog/context. |
| Explicit but unknown model/parameter version | Report unsupported with an export path; preserve the stored summary. |
| New runs | Use the new version and freeze all model-driving values, provenance, units, event/method and fallback status. |

A migration cannot invent a user’s original measurements. If current run creation or playback cannot identify this state without changing summary semantics, that migration is part of the implementation gate; do not silently substitute live context.

### D2. Separate development, dry-matter production, and harvestable yield

Phenology uses crop-specific thermal response and fixed referenced stage/maturity targets. The source-defined accumulation method, start event, cultivar range and endpoint travel together. A run-window mean must not set a crop’s thermal target.

Daily net dry matter uses the LINTUL-family radiation-use-efficiency structure:

`ΔDM = RUE × intercepted PAR × supported stress factors`

The implementation must state units for every term and convert DLI/PAR explicitly. RUE is net dry-matter efficiency under its documented reference conditions; do not also subtract an unparameterized maintenance term and double-count respiration. Where maintenance/reserve dynamics are material (especially perennial/repeated-harvest crops), expose the limitation and defer the different lifecycle state contract to 02D. Dry matter and reproductive allocation/harvest index are separate. A catalog fresh-yield ceiling is not a biomass model or a harvest index.

Known zero usable PAR yields exactly zero sustained photosynthetic dry-matter gain. Germination reserves require explicit initial reserve state, finite reserve amount and an accounting event. Unknown PAR remains unknown and cannot be silently treated as sufficient. The result must be visibly incomplete/qualified or use a documented, provenance-tagged fallback only when its parameter source and domain are recorded. Fungi use a separate substrate/lifecycle model and never plant photosynthesis.

### D3. Use FAO-56 as the soil root-zone water method, within its supported input domain

For soil-grown crops, use the FAO-56 root-zone balance as the method reference: available water is based on AWC and effective rooting depth; stress begins relative to readily available water; water entering, extracted, draining and running off must reconcile in mm. Root-depth development and depletion fraction are crop/model parameters, not a universal 30 cm constant. The run must freeze those values.

This is a single effective root-zone storage model, not a layered Richards solver. If a necessary soil/media, root-depth, runoff, or water input is unavailable, expose the estimate/fallback and uncertainty. Do not call the current coarse nitrogen pool a solution-chemistry, pH, salinity or oxygen model. Soilless resource balance requires the 02B hydro/resource contract and must not be silently mapped to a soil bucket.

### D4. Reuse methods as scientific references; do not port a framework

| Reference evaluated | Relevant method/evidence | Deployment, parameter and license fit | Decision |
|---|---|---|---|
| LINTUL / Spitters (1990) | Daily intercepted-light × net light-use efficiency, with development-stage allocation/harvest index; simple and directly prevents light-independent production. Potato cultivar study reports measured light absorption, efficiency and allocation. [Spitters 1990](https://doi.org/10.17660/ActaHortic.1990.267.42), [Spitters 1988 potato study](https://doi.org/10.17660/ActaHortic.1988.214.5) | Fits the existing daily deterministic reducer. It still needs crop/domain-specific RUE, interception and allocation values; the method paper is not a catalog parameter table. Publication code is not reused. | Select as the production equation family for v2. Parameterize only where evidence supports it; explicitly status every fallback. |
| FAO-56 | Standard ET0 and effective root-zone water balance, crop coefficients, TAW/RAW and stress coefficient. [FAO-56 (1998)](https://www.fao.org/4/x0490e/x0490e00.htm) | Provides a transparent daily method; needs AWC, effective root depth, depletion fraction, weather and crop ET coefficients. FAO publication is copyrighted; no text or code copied. | Select as the soil-water method reference, not as a complete growth model. |
| AquaCrop / AquaCrop-OSPy | Canopy → transpiration → normalized biomass water productivity → harvest index, with explicit stress response. [FAO calculation scheme](https://www.fao.org/aquacrop/overview/calculation-scheme/), [AquaCrop-OSPy paper](https://doi.org/10.1016/j.agwat.2021.106976) | Strong water-limited reference, but it requires canopy, root, WP*, HI, and stress parameters; OSPy is Python/Apache-2.0, while official FAO/KU Leuven versions and terms differ. No whole model or code port. | Use for independent structural review and future reference fixtures; do not use its water-only biomass path as the sole production equation because v2 must enforce known-zero-light behavior. |
| PCSE / WOFOST and LINTUL3 | Explicit parameter/rate/state architecture, daily photosynthesis, maintenance respiration, development-stage partitioning, water balance, and a test suite. [25 years of WOFOST](https://doi.org/10.1016/j.agsy.2018.06.018), [PCSE docs](https://pcse.readthedocs.io/en/develop/) | Broad parameter and crop implementation; Python/EUPL-1.1-or-later with framework and input conventions that do not fit a small browser-local TypeScript engine. | Reference for variable separation, respiration accounting and independent model comparison; no code or data copied. |
| DSSAT-CSM | Broad crop modules, soil/weather/management coupling, cultivar files and long-running crop-model use. [Jones et al. 2003](https://doi.org/10.1016/S1161-0301(02)00107-7), [official repository/license](https://github.com/DSSAT/dssat-csm-os) | Fortran daily framework, BSD-3-Clause source, broad calibration/input needs; whole port is an architectural change and too large for the local browser loop. | Consider as an external comparison implementation after input parity is established; do not port. |
| APSIM Next Generation | Modular crop/soil/process design and sensitivity tooling. [APSIM repository/license](https://github.com/APSIMInitiative/ApsimX/blob/master/LICENSE.md) | Custom General Use License with separate commercial-use terms; .NET runtime and extensive data/configuration model. | Architectural reference only; not selected for code reuse/runtime. |

## D5. Parameter coverage and evidence classes

`quality/beta/evidence/model-coverage.json` is the initial inventory. Every built-in catalog crop is listed. Statuses distinguish:

- literature-derived thermal reference (not a validated full crop model);
- documented legacy-only value/fallback;
- missing v2 production/root-zone parameters;
- separate fungus model required;
- measured observations, reference-model agreement, and synthetic software fixtures.

Initial values in the existing thermal table are not evidence that the current biomass/yield model is accurate. The manifest includes source artifact SHA-256 hashes for downloaded source documents, the source edition/date/license or reuse terms, all available input/endpoint/unit details, unavailable data, valid domains, and explicit `UNVERIFIED` claims. Source PDFs remain external; only hashes and small derived parameters are recorded.

Calibration and holdout are separated by metric. OSU Croptime's reported error is computed on its model-development data and is not an independent holdout. The Michelon lettuce field results are a potential production holdout only if no parameter is fitted to them; the experiment identifies cultivar Green Wave and HS50 as the 50% ETc irrigation treatment. Its reported mean DLI and thermal sum are source summaries, not daily inputs, so the missing daily weather/light and soil series currently prevent an executable comparison. Cabbage thermal values already appear in the current parameter table and are parameter references, not held-out evidence. No claim is green until a reproducible source fixture, crop/cultivar, domain, sample size, metric, held-out error and fixture IDs are present.

## Numerical tolerances — independent review incorporated

No candidate model output has been compared. The preservation, thermal transcription, lettuce plant-mass and area-yield rounding, water-closure and zero-light checks below were preregistered and reviewed by the independent validator. These tolerances cover preservation, display rounding, and numerical closure only; none establishes predictive accuracy.

| Metric/check | Recorded tolerance | Basis and limits |
|---|---:|---|
| Supported frozen historical replay | Exact equality of the replayed state and summary | Compare only a record with complete frozen inputs and a supported explicit or identified legacy model version. Replay is the storage contract. |
| Unsupported historical record | Exact preservation of the stored summary and input artifact; no regenerated result is compared | Missing critical frozen data means unsupported/qualified. Preserve the prior record and do not recompute it from today's catalog or context. |
| Reproduction of a source thermal sum printed as an integer | ±0.5 °C·day after applying the source method, endpoint and stated unit conversion | Half of the displayed C·day unit, for transcription/reproduction only. It is not model-accuracy evidence. Do not compare incompatible accumulation methods or endpoints. |
| Lettuce fresh-mass means printed as whole g/plant | ±0.5 g/plant | Approved as table-rounding tolerance only, not an acceptable predictive-error band. The article reports three replicate plots but the retrieved table does not give raw observations/variance. |
| Lettuce dry-mass means printed to 0.1 g/plant | ±0.05 g/plant | Approved as table-rounding tolerance only, not a predictive-error band. |
| Lettuce marketable area yield printed as `1.90 kg/m²` | ±0.005 kg/m² | Approved display-rounding tolerance only; half the 0.01 kg/m² display increment. It applies only to reproducing the published value, not to predictive accuracy. |
| Daily soil-water balance residual | ≤1e-6 mm per cell-day, conditional on unrounded internal pools | Use `residual = storage_start + inflow - uptake - drainage - runoff - storage_end`; include every boundary flux, retain unrounded state, report signed accumulated residual and maximum absolute daily residual separately. |
| Dry-matter state/partition closure | ≤1e-6 g DM/m²/day | Numerical-analysis check on additive mass transfers before output rounding; photosynthetic production, allocation and any explicit reserve transfer remain separately accounted. |
| Known zero usable DLI/PAR photosynthetic production increment | Exactly 0 g DM/m²/day | The production equation must return zero. Any seed or stored-reserve drawdown is a separate finite state transfer and cannot be counted as photosynthetic production. |
| Independent held-out harvest-date/yield/biomass error | No universal threshold proposed | Lock a source-specific threshold from measured precision or published independent error, then receive validator approval before comparison. Where daily inputs or variance are unavailable, mark comparison UNVERIFIED and do not invent a threshold. |

The independent validator reviewed and approved the displayed-value rounding tolerances for lettuce plant fresh/dry mass and marketable area yield, the ±0.5 °C·day transcription bound, and the water-balance bound subject to the stated unrounded-pool and residual-reporting conditions. These checks do not authorize predictive-accuracy claims. No candidate comparison has been run.

## Implementation gates after this record

1. Add explicit model and parameter version dispatch; preserve v1 and unsupported historical summaries.
2. Freeze new model inputs (units, provenance, crop parameter values/status, planting method/start event, soil/media values and model methods) into each new run.
3. Implement separate phenology, light-driven net dry matter, harvest allocation and root-zone balances in the existing reducer.
4. Add source-linked fixtures, zero/unknown-light tests, sowing/transplant tests, water/nutrient conservation/bounds, all-catalog coverage checks, replay/fallback tests and reviewed golden changes.
5. Keep measured-accuracy claims UNVERIFIED when input or independent data coverage is missing; document any intentionally unsupported crop/model combinations.

References were accessed 2026-10-27. The machine-readable source/fixture inventory is the companion `quality/beta/evidence/model-coverage.json`.
