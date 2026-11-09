# BETA-02B — Nine environments, placed equipment and constrained resources

Status: development-ready; implementation pending. Owner: enclosure/resource model engineer; independent validator. Depends on 02A model/input/version contracts.

## Outcome

All nine world types have physically meaningful differences. Installed equipment and growing systems affect crops through environmental/resource inputs; a selected archetype does not install invisible equipment. Retain the existing daily enclosure and equipment modules, replacing approximations where the required causal cases cannot pass.

Primary seams: `environment-climate.ts`, `equipment.ts`, engine climate/target bridge, `creative/archetypes.ts`, `data/assets.ts`, environment layout/instances and growing targets. Follow the original spatial/mount contracts; one room balance, explicit target planes, actual occupied crop area.

## Required behavior

- Document each world's open/protected/sealed status, usable geometry, transmission, heat transfer, infiltration/ventilation, rainfall access and supported soil/soilless systems. Dimensions/shell/placement and model capacity agree. Access/service areas are not crop area.
- Compute room climate and target light consistently from weather, geometry, installed capacities and schedules. Preserve provenance. Tents/rooms without natural light or lamps cannot receive outdoor daylight by fallback. Unknown exterior radiation is not a claimed measured zero.
- Select a justified time resolution. Daily crop reporting may use subdaily enclosure/control calculations where day/night switching or energy accounting requires them; never add full CFD or hourly complexity without a failing requirement. Freeze solver/version/time semantics in run inputs.
- Lighting uses documented fixture power, photon efficacy, coverage/distribution, mount/height assumptions and photoperiod. Overlap rules conserve modeled photons and avoid repeated area credit. State simplified shading assumptions and test covered/uncovered targets, rack tiers and top/bottom planes. Electrical watts enter heat exactly once with documented conversion; no arbitrary max/sum rule replaces a justified calculation.
- Heating/cooling, vents/fans, dehumidification and CO₂ supply have bounded capacities and resource costs. Setpoints alone supply nothing. Crop effects of light, temperature, VPD/humidity and CO₂ are connected to the chosen crop-production model where supported; output-only variables are labelled as such until integrated. Avoid applying the same stress or energy term in both room and crop passes.
- Water/reservoir/nutrient systems record supply, storage, delivery, uptake, loss and refill with consistent units. Document recirculation assumptions; no implicit unlimited supply. Hydro shortages affect addressed crops. Electricity demand and energy consumption are distinct (kW versus kWh); configurable tariff/currency assumptions yield estimated cost, never a fabricated local tariff. If a process is outside the model, identify it rather than credit capacity silently.
- Each growing plane uses only actual planted cells; racks do not multiply plant/yield counts twice. Lights/mounted assets affect the addressed target; shared room HVAC and reservoir effects remain room/shared effects.
- Before-run and in-run diagnostics identify limiting resources and affected worlds/targets; users may save incomplete plans and run explicit failure experiments. Warnings explain assumptions/remedies without guaranteeing success.

## Nine-world fixture matrix

Use stable synthetic layouts plus independent published climate/crop cases under the evidence rules of 02A. Every row is required before beta; exact dimensions/crop/inputs and expected direction/bounds are committed with the fixture.

| World | Mandatory representative paired case |
|---|---|
| Open field | Rain/irrigation versus drought with outdoor radiation and water accounting. |
| Garden beds | Bed/root-zone depth/media and occupied area versus paths; spacing/area totals reconcile. |
| Glass greenhouse | Transmitted daylight, solar gain, night loss, added heat and vent/cooling capacity. |
| Hoophouse | Passive night/weather coupling, rain exclusion and ventilation with no assumed heater. |
| Cold frame | Low enclosure/clearance, passive protection and daylight without room-scale hidden HVAC. |
| Grow tent | Zero light versus installed light; heat/vent/RH consequences and finite water supply. |
| Grow room | Bounded lights/HVAC/dehumidification/CO₂ with environmental inputs influencing crops. |
| Vertical warehouse | Different crops on occupied tiers, unplanted tiers zero, per-tier lighting and shared room heat. |
| Container farm | Narrow usable/service space, mounted lights/hydro and reservoir/power shortage effects. |

Fungus cases use appropriate substrate/lifecycle inputs rather than photosynthetic light rules. Do not claim all crop/environment combinations are independently validated because one example per world passes.

## Acceptance

| ID | Check | Result |
|---|---|---|
| E-01 | All nine paired fixtures | Expected causes, bounds and source-qualified outcomes; no cosmetic-only world differences. |
| E-02 | No equipment, insufficient capacity, sufficient capacity | Setpoints cannot create supplies; actual capacity changes environmental/crop outcomes. |
| E-03 | Lamp overlap/mounts/tier occupancy | Correct light target, actual planted area, photon/heat accounting; empty tiers zero yield. |
| E-04 | Water/power/CO₂ depletion/refill and controls | Conservation residuals within predeclared numerical tolerance; finite stores cannot oversupply. |
| E-05 | Day/night/season changes and solver boundaries | Appropriate response and deterministic scheduling; no unstable temperature or NaN. |
| E-06 | Blueprint/3D/inspector/stats/export | Same dimensions, targets, installed capacity and units; assumptions inspectable. |
| E-07 | Published climate/crop holdouts | Separate measured-error and reference-agreement reports; no false observed/validated label. |

Deliver capacity/solver/unit documentation, paired fixtures, conservation tables, source/coverage manifest, warnings and performance measurements. Handoff resource supply/demand and world-step interfaces to 02C; do not implement a second site resource allocator here.
