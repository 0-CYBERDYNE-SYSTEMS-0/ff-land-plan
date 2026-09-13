# RESEARCH: Open-Source Sim Landscape + Data Sources Left on the Table

Researched 2026-09-12 via two web-research agents, grounded in the Sim Core audit
(`quality/SPEC-SIM-ECOSYSTEM.md`) and the current `src/lib/sim` engine. Purpose:
locate the gap between our daily-step engine and the "skeletal archetype" that
open-source analytical crop/ecosystem simulators treat as baseline, and inventory
the free data APIs the project is not yet consuming.

Note on CORS column: agent verified live with `GET`/`OPTIONS` requests carrying an
`Origin` header on 2026-09-12; re-verify before relying on any single endpoint.

---

## PART 1 — Open-source simulator landscape (agent report)

| Framework | Repo / URL | Language | License | Activity (2026) | Timestep & architecture | Credibility mechanisms |
|---|---|---|---|---|---|---|
| **DSSAT-CSM** | [github.com/DSSAT/dssat-csm-os](https://github.com/DSSAT/dssat-csm-os) (site: dssat.net) | Fortran | **BSD-3-Clause** | Very active — v4.8.6.0 (Aug 2026) | Daily. "Cropping System Model" orchestrator calls per-process modules: soil water, soil N, soil C (CENTURY-based option), per-crop plant modules (CERES, CROPGRO, CANEGRO, IXIM, SUBSTOR…), PEST, atmosphere | **Multi-layer tipping-bucket water balance** (Ritchie cascade w/ runoff, drainage per layer); **genetic coefficients** (species `.SPE`, ecotype `.ECO`, cultivar `.CUL`); **FAO-56 Penman-Monteith ET0**; stage-specific phenology w/ vernalization + photoperiod; leaf-level photosynthesis in CROPGRO; FileX experiment format + ICASA vocabulary; decades of global validation + AgMIP intercomparisons |
| **APSIM Next Generation** | [github.com/APSIMInitiative/ApsimX](https://github.com/APSIMInitiative/ApsimX) (apsim.info) | C#/.NET | **Custom APSIM General Use Licence** (free incl. research; *not OSI*, commercial via APSIM Initiative) | Very active — ~35k commits, pushed 2026-09-09 | Daily. Live component tree: Clock, Weather (.met), Soil (Physical/WaterBalance/Organic/Nutrient), Plant (PMF), MicroClimate, Manager (C# event scripts), Operations, Report, Sensitivity, CLEM, AgPasture, GrazPlan | **Multi-layer soil water** (curve-number runoff, cascading drainage; SWIM Richards option); **multi-pool C/N nutrient model**; **RUE biomass** with per-process stress factors (canopy expansion, RUE, phenology each stressed separately); PMF phenology phase chain with vernalization/photoperiod; **cultivar overrides**; `.met` weather format; built-in **Sensitivity module** (Morris/Sobol); rigorous validation culture + peer-reviewed change process |
| **FAO AquaCrop** (official) | [fao.org/aquacrop](https://www.fao.org/land-water/databases-and-software/aquacrop/en/) | Delphi (closed binary, free) | Free, **not open source** | v7.1 | Daily. Soil water balance + canopy cover + biomass + HI modules | Normalized **water productivity WP\*** biomass (`B = WP* × ΣTr/ET0`), explicit E/T partitioning, stress coefficients Ks(temp/steam/exp/sto/poll), HI with pre/post-anthesis stress multipliers, CO2 adjustment; FAO test-case suite |
| **AquaCrop-OSPy** | [github.com/aquacropos/aquacrop](https://github.com/aquacropos/aquacrop) (docs: [aquacropos.github.io/aquacrop](https://aquacropos.github.io/aquacrop/)) | Python (+ Numba) | **Apache-2.0** | Active — v3.1.0 (Jun 2026) | Daily. `AquaCropModel` + `Soil`/`Crop`/`InitialWaterContent`/`IrrigationManagement`/`FieldManagement` classes; `solution` submodule holds the numerics | Faithful re-implementation of FAO AquaCrop v7.1 (validated vs FAO outputs; omits fertility/salinity stress, perennials). **Multi-layer soil water balance**, CC-driven E/Tr split, WP\* biomass w/ CO2, HI stress multipliers, irrigation modes (soil-moisture-target auto-irrigation). No N, no pests — deliberately water-centric |
| **PCSE / WOFOST** | [github.com/ajwdewit/pcse](https://github.com/ajwdewit/pcse); WOFOST Fortran: [github.com/ajwdewit/WOFOST](https://github.com/ajwdewit/WOFOST); params: [github.com/ajwdewit/WOFOST_crop_parameters](https://github.com/ajwdewit/WOFOST_crop_parameters) | Python | **EUPL-1.1** (weak copyleft) | Active — pushed 2026-09-01, WOFOST 8.x in tests | Daily. Engine separates **parameters / rate variables / state variables**, pluggable I/O; crop models `wofost72/73/81`, `LINTUL3`, `LINGRA`; soil `classic_waterbalance`, `multilayer_waterbalance` (SWAP-style), `n_soil_dynamics`, `SNOMIN` (SOM/N), snow, frost (FROSTOL); **AgroManager** event system | **SUCROS canopy assimilation** (daily gross CO2 via 3-point Gauss integration), maintenance/growth respiration, **DVS phenology with vernalization + daylength reduction**, DVS-indexed partitioning tables, multi-layer water balance, parameter sets for 23 crops. Used operationally by JRC (EU MARS yields) |
| **LINTUL family** | LINTUL3 inside PCSE; LINTUL5 archive: [github.com/herman-berghuijs/LINTUL5_archive](https://github.com/herman-berghuijs/LINTUL5_archive); cassava: [github.com/cropmodels/LINTULcassava](https://github.com/cropmodels/LINTULcassava) | Python / Fortran / R | EUPL (PCSE copy) | Maintained via PCSE | Daily. Minimal crop model | The **minimal RUE archetype**: biomass = RUE × intercepted PAR × stress, GDD phenology, simple water/N balances. Pedigree: Spitters & Schapendonk |
| **SIMPLACE** | [simplace.net](https://www.simplace.net); bindings: [gk-crop/Simplace.jl](https://github.com/gk-crop/Simplace.jl), R/Python pkgs under [github.com/gk-crop](https://github.com/gk-crop) | Java | Open-source (GPL family; core hosted off-GitHub — verify on simplace.net) | Bindings active 2025–26 | Daily. "Solution" = XML-assembled graph of interchangeable components (LINTUL-family + EPIC-derived soil components) | Component swappability (same framework runs LINTUL, EPIC soil, pest modules); used by EU JRC; good worked example of **component composition** rather than monolith |
| **BioCro** | [github.com/biocro/biocro](https://github.com/biocro/biocro) (biocro.github.io) | C++ (+ R pkg) | **MIT** | Very active — pushed 2026-09-11 | Configurable (hourly typical). **Dynamical-systems module framework**: every module is a pure function of declared inputs→outputs; a solver builds the dependency graph each timestep | **Multilayer sunlit/shaded canopy photosynthesis** (Farquhar C3 / Collatz C4 with stomatal conductance), thermal-time + stage-based phenology, partitioning fractions, 2-layer soil water, atmosphere modules (VPD etc.). MIT + clean module pattern = best *architecture* reference; integrates with PEcAn for Bayesian calibration |
| **OpenSimRoot** | [gitlab.com/rootmodels/OpenSimRoot](https://gitlab.com/rootmodels/OpenSimRoot) | C++ | **GPLv3** | Active — pushed 2026-07 | Hourly/finer. Functional-structural root model: lattice of root segments, pluggable modules for C costs, water & nutrient uptake (Michaelis-Menten, depletion zones) | Root-architecture-resolved water/nutrient uptake; the scientific reference for *below-ground* mechanics; heavy compute, research niche — inspiration only |
| **Cycles** | [github.com/PSUmodeling/Cycles](https://github.com/PSUmodeling/Cycles) | C | **CC BY-NC-ND 4.0 — source visible, NO derivatives, non-commercial (not reusable code)** | Active — v1.5.20 (May 2026) | Daily. Single conceptual field; text inputs `.ctrl/.operation/.soil/.crop/.weather` | Layered water/energy balance, coupled C/N cycling, **user-definable species via generalized plant framework**, polycultures/relay cropping, grazing, irrigation; **spin-up mode** (`-s`) and **nudge calibration file** (`-n`) — a model shipping first-class calibration affordances |
| **SALUS** | [basso.ees.msu.edu/salus](https://basso.ees.msu.edu/salus/index.html) | Fortran | Free for research via MSU registration; **not OSI** (commercialized in CIBO) | Maintained (MSU) | Daily. Plant + soil + management modules, multi-season rotations | Century-derived soil C/N, cascading water balance, RUE plant growth with replant logic; validated at continental scale for rotations/residue/N management |
| **EPIC / APEX** | [epicapex.tamu.edu/apex](https://epicapex.tamu.edu/apex/) | Fortran | **Public domain** (USDA-ARS heritage) | Continuously maintained by Texas A&M | Daily. EPIC = field scale (~80 crops); APEX = whole-farm/small-watershed extension | Multi-layer soil with **erosion (USLE/MUSLE)**, GDD + vernalization + photoperiod phenology, RUE biomass with CO2 effects, N/P/C cycling, selectable ET (PM / Priestley-Taylor / Hargreaves), management scheduling; 40-year validation lineage, regulatory use |
| **DayCent** | [nrel.colostate.edu/projects/daycent](https://www.nrel.colostate.edu/projects/daycent/) | Fortran | **Not open source** — executables free; source via non-exclusive license from CSU (trademarked) | Maintained | Daily (daily-step Century). Vegetation + soil OM pools + N gas fluxes | The canonical **soil OM pool model** (2 litter + 2 SOM pools + N2O/CH4 fluxes). For an open twin, use RothC/SoilR instead |
| **RothC** | [github.com/Rothamsted-Models/RothC_Py](https://github.com/Rothamsted-Models/RothC_Py) (Apache-2.0); official Fortran: [RothC_Code](https://github.com/Rothamsted-Models/RothC_Code) | Python / Fortran | **Apache-2.0** (Py port) | Active 2025–26 | Monthly. 5-pool decomposer: DPM/RPM → BIO/HUM + CO2, rate modifiers for residue quality, moisture, temperature, cover | Small, exactly specified soil-carbon mathematics — ideal minimal soil-C reference |
| **SoilR** | [github.com/MPIBGC-TEE/SoilR](https://github.com/MPIBGC-TEE/SoilR) | R | GPL-3 | Active — pushed 2026-08 | Generalized **linear pool-network decomposition** framework (RothC/Century are special cases) | Pool-matrix formalism with transfer coefficients — cleanest theory reference for pool-based C/N |
| **SWAT+** | [github.com/swat-model/swatplus](https://github.com/swat-model/swatplus) | Fortran | **LGPL-2.1** | Very active — pushed 2026-09-08 | Daily. Watershed: landscape units → HRUs → channels/aquifers/wetlands; EPIC-derived plant growth; `.mgt/.op` management scheduling | HRU hydrology, nutrient + pesticide fate, routing; decades of global calibration, regulatory adoption. Watershed scale — overkill for sub-hectare |
| **STICS** | [stics.inrae.fr](https://stics.inrae.fr/eng/) (source on INRAE forgemia; R ecosystem [github.com/SticsRPacks](https://github.com/SticsRPacks); py wrapper [OmbreaPV/pySTICS](https://github.com/OmbreaPV/pySTICS)) | Fortran | **CeCILL-C (≈LGPL)** | Active (SticsRPacks pushed 2026-09) | Daily. Soil-plant-atmosphere at plot scale: water, C, N balances + crop growth | **Root-depth & water/N uptake dynamics, microclimate, intercrop (mixed species) support** — one of the few mainstream models with intercropping; strong French dataset calibration; open-access reference book (OAPEN) |
| **Crop2ML** | [github.com/AgriculturalModelExchangeInitiative/Crop2ML](https://github.com/AgriculturalModelExchangeInitiative/Crop2ML) (docs: crop2ml.readthedocs.io) | XML meta-language → generates Python/C++/C#/Java/Fortran | Open (license unstated in repo root; see docs) | Low — last push 2024-10 | Not a simulator: declarative **model units** (equations + params + units + test suite) transpiled across frameworks | Encourages exactly the right habit: **components as data** (equations, units, parameter ranges) with generated tests |
| **Mesa** | [github.com/projectmesa/mesa](https://github.com/projectmesa/mesa) | Python | **Apache-2.0** | Very active — 3.8k stars, 2026-09 | Agent/Model/Scheduler/DataCollector + Solara viz | Standard substrate for ag agent-based models (land-use, farmer decisions, pest spread); CoMSES Net ([comses.net](https://www.comses.net)) curates reproducible ag ABMs |
| **NetLogo** | [netlogo.org](https://www.netlogo.org/) | Java/Scala DSL | Free, open source (GPL family) | Maintained | ABM world; large models library incl. ag commons/land-use models | ODD protocol culture; reference rather than dependency |
| **PEcAn** | [github.com/PecanProject/pecan](https://github.com/PecanProject/pecan) | R | BSD-3 family | Very active — 2026-09 | Workflow not simulator: wraps models (BioCro etc.) for **Bayesian calibration, ensembles, sensitivity** | The open reference for the **calibration + UQ pipeline** we currently lack |
| **CroptimizR / CroPlotR / SticsOnR** | [github.com/SticsRPacks/CroptimizR](https://github.com/SticsRPacks/CroptimizR) | R | LGPL-3 | Active — 2026-09 | Parameter estimation against observed experiments, standardized diagnostics | Practical **calibration workflow** for crop models |
| **SALib** | [github.com/SALib/SALib](https://github.com/SALib/SALib) | Python | MIT | Active | Sobol, Morris, FAST implementations | The default **sensitivity-analysis** library; algorithms port conceptually to TS |
| **SIMPLE** (Zhao 2019) | paper: [ResearchGate](https://www.researchgate.net/publication/331446151_A_SIMPLE_crop_model); registry: [quantitative-plant.org/model/SIMPLE](https://www.quantitative-plant.org/model/SIMPLE) | Python/R impls | Paper public; impls mostly unlicensed | Paper 2019, still cited | Daily. **13-parameter universal crop model**: GDD phenology, RUE biomass, HI, one-bucket water stress | The best published **garden-scale skeleton**: nearly parameter-free, any crop, still process-correct |
| **AgMIP / ICASA standards** | [agmip.org/agdig](https://agmip.org/agdig-data-interoperability-group/); translators: [agmip.github.io/AgMIP_translators.html](https://agmip.github.io/AgMIP_translators.html) | Data schema (Excel/JSON) | Open standard | Maintained | **ICASA Master Variable List** + **ACE (AgMIP Crop Experiment)** schema; translators to DSSAT/APSIM formats | Shared language that makes experiments portable between simulators — right vocabulary for our run-config format |
| **Digital-twin ag literature** | [PMC 2024 orchestration review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11100011/) (42 crop simulators catalogued); [broadacre DT review](https://www.sciencedirect.com/science/article/pii/S2772375526006192); [open-source modular CEA DT framework (Frontiers 2026)](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2026.1864757/full); [IAAA-Lab/AgriculturalDigitalTwinPlatform](https://github.com/IAAA-Lab/AgriculturalDigitalTwinPlatform) | — | mixed | 2024–2026 | Consensus DT architecture = live sensor/weather ingest + process simulator + scenario experimentation + state re-initialization | Wageningen greenhouse-twin pilots and AgMIP/ISIMIP intercomparison protocols supply methodology (ensemble + calibration + provenance) to borrow |

Other notable discoveries: **DCaPST** (canopy photosynthesis inside ApsimX, CABBI),
**WOFOSTGym / diffWOFOST** (RL and differentiable WOFOST wrappers, 2026),
**AquaCrop-EnKF** (data assimilation onto AquaCrop), **CyMLTx** (component
transformation between DSSAT/STICS/APSIM).

---

## PART 2 — The skeletal archetype (baseline components for accuracy), mapped to our engine

Ordered by how load-bearing each component is. "FF today" = current `src/lib/sim`.

**A1. Weather driver layer with radiation and ET0.** Every credible model consumes
daily tMin/tMax/precip **plus solar radiation and vapour pressure**; ET0 by
FAO-56 Penman-Monteith (Hargreaves fallback). APSIM `.met` (tmax/tmin/rad/rain/VP)
and DSSAT `.WTH` are the de-facto interchange formats. *FF today:* Open-Meteo +
ERA5 normals with provenance tags — good — but **no radiation or VPD carried into
the sim**, so nothing downstream (RUE, PM ET) can work. Essential at any scale.

**A2. Thermal-time phenology as a stage network, with optional vernalization +
photoperiod.** Named stages gate everything else (partitioning, Kc, stress
sensitivities, HI filling). WOFOST DVS and DSSAT CERES P-stages are canonical;
APSIM PMF models phenology as an explicit phase chain. *FF today:* GDD base-10 /
required-GDD ratio is the right primitive but stages are just `round(biomass×5)`;
no stage names other components key off; no vernalization/photoperiod. Essential;
vernalization only matters for winter brassicas/cereals.

**A3. Multi-layer soil water balance.** The single biggest accuracy lever:
layer-resolved thickness + SAT/DUL/LL, infiltration with runoff (curve number),
per-layer drainage, root-depth growth and depth-distributed extraction.
*FF today:* **single-layer AWC-fraction bucket** — and the SSURGO/SoilGrids data
needed to layer it (horizon AWC, texture) is **already fetched but unused** by the
model. Essential, and the per-cell grid maps naturally (one profile per bed).
References: DSSAT SOILDYN cascade, ApsimX WaterBalance, AquaCrop-OSPy `Soil`,
PCSE `multilayer_waterbalance`.

**A4. Canopy as a state, with E/T partitioning and stress from transpiration.**
A CC or LAI state drives radiation interception, soil-evaporation vs transpiration
split, and Ks computed from actual/potential transpiration — stress enters *inside*
the growth loop, not as a post-hoc penalty. AquaCrop is the purest expression (CC
BETA curve, Ks_exp/Ks_sto/Ks_poll); APSIM MicroClimate arbitrates co-existing
canopies. *FF today:* no canopy state; biomass-fraction stands in for Kc; stress is
per-term heuristics applied in yield penalty. Essential — and canopy cover maps
beautifully onto the voxel canopy for 3D visualization.

**A5. Biomass as a resource-capture integral (RUE or WP\*), not a GDD fraction.**
Three canonical formulations in rising complexity: RUE × intercepted PAR
(LINTUL/SIMPLE/APSIM), normalized transpiration productivity `B = WP* × ΣTr/ET0`
with CO2 multiplier (AquaCrop), full assimilation-respiration (WOFOST SUCROS,
BioCro Farquhar). All apply **stress multipliers on the growth rate** and a CO2
elevation factor (C3 vs C4). *FF today:* "GDD fraction → biomass fraction" is the
main anti-pattern to replace. RUE/WP\* with A1's radiation is a small step up with
a large credibility gain. Essential; full Farquhar is a research extra.

**A6. Yield via harvest-index / stage-indexed partitioning.** Partition tables
keyed on DVS/stage (WOFOST), HI filling after a defined stage with pre/post-anthesis
stress multipliers (AquaCrop), or organ-level arbiters (APSIM PMF). *FF today:*
single season-mean stress penalty multiplier on a catalog yield constant.
Essential; vegetables especially benefit from organ-level partitioning
(fruit/leaf/root crops differ).

**A7. Soil N + C as pooled state coupled to the water balance.** Minimum credible:
2–3 OM pools (fresh/stable) with moisture/temperature-modified mineralization,
mineral N pool, **leaching proportional to drainage water flux**, uptake =
min(demand, supply). *FF today:* static OM-derived pool + mineralization − uptake −
leaching, but **not coupled to actual drainage flux or pools**. A simplified 3-pool
cycle is essential for compost/fertilizer experiments (a core FF use case); gas
fluxes are a row-crop extra. References: PCSE `snomin.py`, `RothC_Py` (portable in
an afternoon), SoilR for the pool-matrix theory.

**A8. Cultivar/parameter layer separated from code.** Species + cultivar params as
data: DSSAT `.SPE/.ECO/.CUL`, APSIM cultivar overrides, `WOFOST_crop_parameters`
(23 crops as versioned data), SIMPLE's 13 parameters. This is what makes calibration
possible at all. *FF today:* rate/gddRequired constants live in code per crop;
no parameter layer. Essential; SIMPLE-sized parameters are the right fit for the
catalog (~dozens of vegetables).

**A9. Management event language.** Dated AND condition-triggered events — sow,
transplant, irrigate (fixed/auto soil-moisture-target), fertilize (product +
fractionation), till, harvest — stored as data, replayable. PCSE AgroManager,
APSIM Manager + Operations, Cycles `.operation`, DSSAT FileX. *FF today:*
runs-as-config + envSeries replay is architecturally aligned (genuinely ahead of
many academic tools); formalizing events into an ICASA-ish vocabulary + adding
**auto (soil-moisture-target) irrigation** completes it. Essential — management is
the experiment knob.

**A10. Determinism, units discipline, standard formats.** Fixed-step loop with
explicit state/rate separation (PCSE's cleanest), seeded determinism, ICASA
variable names, soil profile format (DSSAT `.SOL`), provenance-tagged weather.
*FF today:* determinism + provenance are **already strengths** (replay-as-storage,
EnvSourceTag). Nearly free to finish.

**A11. Calibration, validation, and uncertainty workflow.** The signature of
scientific credibility: parameter estimation vs observations (CroptimizR),
spin-up (Cycles `-s`), sensitivity analysis (SALib Morris/Sobol, APSIM built-in),
Bayesian ensembles (PEcAn), validation against published test suites
(AquaCrop-OSPy reproduces FAO outputs; AgMIP intercomparisons). *FF today:*
**none** — the biggest structural gap after A3/A5. A lightweight version
(per-crop parameter ranges + Monte Carlo yield bands + a fixed FAO-style
test-case set) would put FF ahead of most hobby simulators.

**A12. Big-row-crop extras (mostly skippable at sub-hectare):** watershed
routing/HRUs (SWAT+), erosion USLE/MUSLE (EPIC/APEX), GHG N2O/CH4 (DayCent),
grazing/livestock (APSIM GrazPlan/CLEM), multi-field economics (APEX),
root-architecture FSPM (OpenSimRoot), diurnal canopy photosynthesis (BioCro/DCaPST).
Exceptions worth roadmap slots for a garden twin: **intercrop competition**
(STICS, Cycles support polyculture — directly relevant to mixed vegetable beds)
and **mulch/soil-cover effects on evaporation** (AquaCrop).

### Readable / reusable references for a TypeScript browser app

1. **AquaCrop-OSPy** — Apache-2.0 — the single best model-level port source:
   multi-layer soil water, CC growth, E/T split, WP\* biomass, HI, irrigation
   modes; validated vs FAO v7.1; small (~few kLOC in `solution/`).
2. **BioCro** — MIT — the architecture to imitate (every module a pure
   declared-inputs→outputs function; solver resolves the dependency graph).
3. **DSSAT-CSM** — BSD-3 — legally reusable authoritative reference for cascade
   water balance, stage phenology, genetic-coefficient files (read, don't port).
4. **RothC_Py** — Apache-2.0 — a few hundred lines; direct TS port for a
   compost/SOM module.
5. **PCSE** — EUPL-1.1 (copyleft — reference only, no verbatim copying) —
   cleanest state/rate structure + AgroManager events; companion
   `WOFOST_crop_parameters` (23 crops).
6. **SALib** — MIT — Morris/Sobol for parameter-uncertainty bands.
7. **Mesa** — Apache-2.0 — pattern source for any future agent layer (pests,
   animals, farmer decisions); CoMSES Net for reproducible ag ABMs.
8. **Crop2ML** — pattern source: sim components as declarative equation data
   (params with units, ranges, test cases).

Honorable mentions: **PEcAn** (calibration/ensemble workflow shape), **ICASA/ACE**
(run-config vocabulary), **STICS** (intercropping reference), **SIMPLE**
(13-parameter template for the vegetable catalog). **Avoid:** Cycles
(CC BY-NC-ND), ApsimX (custom licence, commercial restrictions), DayCent
(licensed source), SALUS (MSU registration), green-fingers (no license).

### Bottom line — build order distilled from the archetype

1. Carry **radiation/VPD** into the sim; switch ET to dual-crop-coefficient PM.
2. **Layer the soil water bucket** using the SSURGO/SoilGrids SAT/DUL/LL already
   fetched, with root-depth extraction.
3. Replace GDD-fraction biomass with **RUE × intercepted radiation** (or
   WP\* × ΣTr) + Ks stress multipliers + CO2 factor.
4. **Stage-indexed partitioning/HI** replaces the post-hoc yield penalty.
5. Formalize **management events** + cultivar parameter files (SIMPLE-sized),
   ICASA-ish names.
6. Pooled **N/C mini-cycle** (RothC/SNOMIN-derived) coupled to drainage.
7. Lightweight **sensitivity/ensemble** pass (SALib-style) for uncertainty bands.

---

## PART 3 — Data sources we're leaving on the table (agent report)

CORS verified live 2026-09-12 (`Origin`-header probes). "`*`" = browser-direct;
"proxy" = needs the existing Vite proxy seam.

| # | Source | What it gives | Resolution | Auth | CORS | License | Capability unlocked |
|---|--------|---------------|------------|------|------|---------|---------------------|
| 1 | [NASA POWER](https://power.larc.nasa.gov/) — `https://power.larc.nasa.gov/api/temporal/daily/point` | Daily 1981→ (solar 1984→): T2M/MAX/MIN, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, WS2M, GWETTOP/ROOT/PROF | 1.0°, global | None | **`*` (verified)** | NASA open, cite | **Independent ET0 cross-check** — full PM input set (rad+RH+wind) to validate Open-Meteo ET0; 40-yr normals; root-zone wetness proxy |
| 2 | [NWS api.weather.gov](https://www.weather.gov/documentation/services-web-api) — `https://api.weather.gov/points/{lat},{lon}` | Hourly/12h forecast, QPF, frost/freeze + weather alerts | ~2.5 km, US | None (User-Agent) | **`*` (verified)** | US public domain | **Official forecast cross-validation**; alerts as sim risk events |
| 3 | [USA National Phenology Network](https://www.usanpn.org/data/code) — `https://services.usanpn.org/npn_portal/observations/getObservations.ndjson` | Phenophase records (first leaf/bloom/ripe fruit) by species+location, 2009→ | Point obs, US | None (reads) | **`*` (verified)** | Free w/ attribution | **Phenology calibration/validation** — sim bloom dates vs observed |
| 4 | [GBIF](https://www.gbif.org/developer/summary) — `https://api.gbif.org/v1/occurrence/search` | Species occurrences (pests, pollinators, beneficials) | Point obs, global | None | **`*` (verified)** | CC-BY per record | **Pest/pollinator presence risk layer** — "what's recorded near this farm" |
| 5 | [iNaturalist API](https://api.inaturalist.org/v1/docs/) — `https://api.inaturalist.org/v1/observations` | Research-grade obs incl. plant health, insects | Point obs, global | None (reads, ~1 req/s) | **`*` (verified)** | CC per-obs | Photo-verified pest/disease sightings near the farm |
| 6 | [USDA NASS QuickStats](https://quickstats.nass.usda.gov/api/) | County/state yields, acres harvested, all commodities/years | County, US | Free key (email) | **proxy** | US public domain (attribution required) | **Yield benchmark calibration** — sim vs county-average t/ha |
| 7 | [NASS Cropland Data Layer / CropScape](https://nassgeodata.gmu.edu/CropScape/devhelp/cdlwms.html) | Annual crop type raster | 10 m (2021+), CONUS, annual | None | untested → proxy | US public domain | **Landscape context** — neighborhood crops (pest carryover, pollinator habitat) |
| 8 | [OpenET](https://etdata.org/api/api-documentation/) | Satellite actual ET (6-model ensemble) | ~30 m; daily 2016→; 17 western states | Free key | untested → proxy | Free w/ registration, cite | **Ground-truth actual ET** — best calibration target for the water/irrigation sim |
| 9 | [Synoptic Data / MesoWest](https://synopticdata.com/weatherapi) — `https://api.synopticdata.com/v2/stations/timeseries` | 170k+ stations, 320 networks (incl. some soil moisture) | Point, minute/hourly; US-dominant | Free token | **`*` (verified)** | Varies by network | **Hyperlocal validation** — reanalysis bias correction of tMin/tMax/precip |
| 10 | [Open-Meteo CMIP6 Climate API](https://open-meteo.com/en/docs/climate-api) — `https://climate-api.open-meteo.com/v1/climate` | Bias-corrected CMIP6 projections incl. **daily ET0** to 2050 | 10 km, global, daily | None | **`*` (verified)** | CC-BY 4.0 | **Climate-scenario sim mode** — "your farm in 2050" |
| 11 | [earth-search STAC (Element84, AWS)](https://earth-search.aws.element84.com/v1) + Sentinel-2/Landsat COGs | Sentinel-2 L2A + Landsat scene metadata + COG rasters | S2: 10 m/5-day; Landsat: 30 m/16-day; global | None | **`*` (verified)** | Copernicus free/open; Landsat public domain | **Per-patch NDVI/biomass calibration** — read 1–3 COG windows per patch in-browser via geotiff.js |
| 12 | [Copernicus Data Space Statistical API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html) | Server-side NDVI/LAI stats per polygon, full archive | 10 m, global | Free OAuth2 | yes (verified) | Copernicus free tier | Same as #11 without client raster parsing |
| 13 | [USGS 3DEP EPQS](https://epqs.nationalmap.gov/v1/json) | Elevation point query | ~10 m, US | None | **`*` (verified)** | US public domain | **Terrain microclimate** — slope/aspect → frost pockets, water routing |
| 14 | [ISRIC SoilGrids 2.0 depth series](https://www.isric.org/explore/soilgrids) — `https://api.isric.org/soilgrids/v2.0/properties/query` | 20+ properties at 6 depths to 200 cm + uncertainty quantiles | 250 m, global | None | yes (already called) | CC-BY 4.0 | **Layered soil profile** — depth-resolved AWC/pH/OC + quantiles for uncertainty display |
| 15 | [Open-Meteo Seasonal API](https://open-meteo.com/en/docs/seasonal-forecast-api) | SEAS5/CFSv2 seasonal anomalies to 7 months | ~1°, global | None | **`*` (verified)** | CC-BY | **Seasonal planning sim** with real forecast anomalies |
| 16 | [uspest.org (OSU IPPC)](https://uspest.org/wea/) + [UC IPM models](https://ipm.ucanr.edu/MODELS/) | 130+ published pest/phenology degree-day models (thresholds, biofixes) | Params + US grids | uspest API docs by request | untested | Free academic use | **Pest/event engine plug-in** — drive our GDD engine with published thresholds |
| 17 | [NCEI Data Service (GHCN-D + normals)](https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation) | Station daily obs + 1991–2020 normals | Stations, US+global | None | **`*` (verified)** | US public domain | **Station bias correction + official normals** |
| 18 | [IEM ASOS archive](https://mesonet.agron.iastate.edu/request/download.phtml) | All US airport obs, sub-hourly, decades | Stations, US | None | **`*` (verified)** | Open IEM policy | **Sub-daily validation** — hourly RH/wind for PM-ET0 checks |
| 19 | [Daymet v4 Single-Pixel](https://daymet.ornl.gov/single-pixel) | Daily station-interpolated weather incl. srad + vp, 1980→ | 1 km, North America | None | **proxy** | Free, cite ORNL DAAC | **Best 1 km historical backfill** + ET0 reconstruction for decades |
| 20 | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) | Daily true-color, 8-day NDVI/EVI tiles | 250 m, global | None | **`*` (verified)** | NASA open | **Cheap weekly greenness overlay** in the map view |
| 21 | [DSSAT cultivar files](https://github.com/DSSAT/dssat-csm-data) + [APSIM crop JSONs](https://github.com/APSIMInitiative/ApsimX/tree/master/Models/Resources) | Published cultivar/ecotype parameters (RUE, HI, base/opt temps, photoperiod) | Parameter sets | None | **`*` raw.githubusercontent (verified)** | DSSAT research licence; APSIM Initiative | **Realistic crop coefficients** — replace guessed GDD/RUE/HI with peer-reviewed values. *Cheapest scientific-accuracy jump on the list* |
| 22 | [NSRDB (NREL)](https://developer.nrel.gov/docs/solar/nsrdb/psm3-download/) | Hourly irradiance GHI/DNI/DHI, temp, wind | 4 km, 1998→, US+Americas | Free key | untested | NREL open, attribution | **Solar ground truth** for ET0/greenhouse sims |
| 23 | [CIMIS](https://cimis.water.ca.gov/) | Reference ET0, station weather | CA stations | Free key | **proxy** | CA public record | **ET0 ground truth** (CA) to tune Penman-Monteith. Peers: AZMET, NDAWN, FAWN, Kansas Mesonet |
| 24 | [MET Norway Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation) | High-quality NWP forecast | ~1–2.5 km, global | None (User-Agent mandatory) | **`*` (verified)** | CC-BY 4.0 | **Global forecast fallback** (works outside US) |
| 25 | [PRISM](https://prism.oregonstate.edu/) | Gold-standard precip/tMax/tMin/VPD | 800 m & 4 km, daily 1981→ | Free key | proxy | Non-commercial w/ citation | Elevation-aware precip normals |
| 26 | [CHIRPS v3](https://chc.ucsb.edu/data/chirps) | Satellite-gauge rainfall | 0.05°, daily, 1981→, 50S–50N | None | proxy/GEE | Public domain (CC0 waiver) | Tropical/global rainfall backfill; redundant for US |
| 27 | [SMAP SPL3SMP_E](https://nsidc.org/data/spl3smp_e/versions/6) via [AppEEARS](https://appeears.earthdatacloud.nasa.gov/api) | L-band satellite surface soil moisture | 9 km, daily, 2015→ | Free Earthdata token | server-side | NASA open | **Observed soil-moisture validation** of the water bucket |
| 28 | [FAO GAEZ v4](https://gaez.fao.org/) | Agro-climatic indicators, crop suitability, LGP | ~9 km, global, 1951–2100 | None (bulk) | flaky → download once | FAO open | **Crop-suitability prior** + rainfed attainable-yield ceiling |
| 29 | [FAOSTAT](https://www.fao.org/faostat/en/#data) | National yields worldwide | Country, annual | Now 401 w/o auth (verified); bulk CSV | bulk only | CC-BY 4.0 | Non-US only; QuickStats supersedes domestically |
| 30 | [FAO EcoCrop](https://ecocrop.fao.org/) | Crop climate tolerance envelopes | Per-crop params | None (503 during testing; CSV mirrors exist) | n/a | FAO open | Cheap suitability priors; vendor the CSV |

### Per-category notes (condensed)

- **NASA POWER** — `parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M,GWETROOT&community=AG`, JSON, no key, throttle ~5 req/s. MERRA-2 from 1981, CERES solar from 1984. The single highest-value addition: free, keyless, browser-direct, multi-year, and it supplies every PM term.
- **NWS** — `/points/{lat},{lon}` → `forecastHourly`, `forecastGridData` (QPF), `/alerts/active?point=`. Etiquette ~5 req/min. US-only.
- **ERA5-Land direct (CDS)** — not browser-callable (POST queue + GRIB/NetCDF); Open-Meteo already resells it keylessly → direct CDS access adds little; note only as provenance.
- **Sentinel-2 via AWS** — `GET /v1/collections/sentinel-2-l2a/items?bbox=..&datetime=..` then COG windows via `geotiff.js` (HTTP range). Landsat pairs to densify NDVI back to 1984.
- **SMAP** — strongest *physical* validation of the water bucket, but server-shaped (AppEEARS task queue, proxy, one-time per farm).
- **SoilGrids depth series** — upgrade from point values to the 6-depth series + Q0.05/Q0.95 quantiles (uncertainty display) to drive a layered root-zone model.
- **USDA SDA beyond basics** — `muaggatt` (AWC storage, hydrologic group), `chorizon` (per-horizon AWC/OM/Ksat → layer the profile), `comonth` (flooding flags), `mukey` polygons. Endpoint already proven CORS-safe in this codebase.
- **QuickStats** — 50k-record response cap; public domain with the required attribution line; bundle small per-state county-yield JSON snapshots to dodge the proxy.
- **Open-Meteo family extras** — CMIP6 (climate-api host), Seasonal (seasonal-api host), Ensembles (ensemble-api host) — all CORS `*`, free non-commercial; ensemble spread = forecast-uncertainty bands for risk displays.
- **GBIF** — `/species/match` for name resolution; iNaturalist ~1 req/s etiquette; both feed a "pests & pollinators within 25 km" panel.
- **NPN** — also GeoServer rasters (`geoserver.usanpn.org`) incl. first-bloom rasters; lets us calibrate species GDD base temps.
- **uspest/UC IPM** — published degree-day models (codling moth, powdery mildew, chill) map directly onto our existing daily GDD engine.
- **Synoptic** — nearest-station tMin/tMax/precip quantifies Open-Meteo bias per farm → automatic "reanalysis vs station" correction; MADIS itself is not browser-oriented (Synoptic already ingests it).
- **Weather Underground PWS / Netatmo** — effectively closed to new integrations; skip. Users with a PWS should point it at Synoptic or Open-Meteo station upload.

### Recommended top-10 integration order (client-side, no backend)

1. **NASA POWER daily point** — zero auth, CORS `*`; alternate weather provider behind the existing `Api` seam; ET0 cross-check + 40-yr normals + GWETROOT. ~1 day, biggest credibility win.
2. **api.weather.gov gridpoint + alerts** — forecast second opinion + frost/freeze badges.
3. **NPN observations + rasters** — "first bloom observed vs simulated" validation card.
4. **GBIF + iNaturalist occurrence search** — pests & pollinators within 25 km panel.
5. **Open-Meteo CMIP6 + Seasonal** — "2050 scenario" toggle + seasonal anomaly planning for free.
6. **QuickStats (key, proxy) + CropScape** — county-yield benchmarks + neighborhood crop ID.
7. **SDA depth-series upgrade (`chorizon`/`muaggatt`)** — soil inputs from 3 scalars → layered profile.
8. **3DEP EPQS** — elevation per farm corner → slope/aspect frost + ET0 adjustments.
9. **DSSAT `dssat-csm-data` + APSIM `Models/Resources` cultivar params** — vendored at build time; published base/opt/cap temps + HI for the ~20 catalog crops; cite in sim settings.
10. **Sentinel-2 NDVI via earth-search STAC + geotiff.js** (or CDSE Statistical API) — per-patch NDVI as in-season biomass calibration target; ship behind an opt-in "Connect satellite data".

Runners-up: Synoptic (station bias-correction), Daymet via proxy (pre-1985 backfill),
OpenET (western-US actual-ET truth), SMAP via AppEEARS (one-time soil-moisture truth),
NSRDB/CIMIS (radiation/ET0 audits), uspest API (published DD pest models).

**Anti-recommendations:** Weather Underground PWS API, Netatmo, FAOSTAT REST
(auth-gated), EcoCrop live service (chronically down — vendor the CSV), direct
CDS/ERA5-Land or MADIS integrations (server-shaped; Open-Meteo + Synoptic already
serve that data browser-friendly).
