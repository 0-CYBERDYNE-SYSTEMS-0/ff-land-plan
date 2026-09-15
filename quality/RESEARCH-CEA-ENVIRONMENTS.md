# CEA & Indoor Growing — Domain Research for Voxel Asset Design

**Date:** 2026-09-13
**Purpose:** Inform voxel game assets (1 voxel = 10 cm) for recognizable, technically plausible indoor/protected growing environments that users of a farm-planning app (grid ≈ 1 m cells, i.e. 10×10 voxels per cell) can place and plant crops inside.
**Scale convention used below:** dimensions given in real-world meters/feet, then voxel counts at 10 cm/voxel, plus a note where an item is smaller than one 1 m grid cell. "Grid cells" always refers to 1 m planning cells.

**Sources verified by fetch during this research** (other figures are flagged "industry-typical" where they are standard planning ranges rather than a single fetched document):

- Cornell CEA Program — Hydroponic Lettuce Handbook (Both, Albright et al.) — https://cea.cals.cornell.edu/files/2019/06/Cornell-CEA-Lettuce-Handbook-.pdf
- Cornell CEA Program — A Guide to Home Hydroponics for Leafy Greens (Ronzoni & Mattson 2020) — https://cea.cals.cornell.edu/files/2020/05/Guide-To-Home-Hydroponics-For-Leafy-Greens.pdf
- Cornell CEA Program site — https://cea.cals.cornell.edu/ (program scope; spinach handbook uses NFT, 24/18°C day/night, 16 h photoperiod)
- Penn State Extension — "Microgreens" — https://extension.psu.edu/microgreens
- Cornell Small Farms Program — "Mushrooms" — https://smallfarms.cornell.edu/resources/mushrooms/
- NMSU/ACES Circular 680 — Important Water Quality Parameters in Aquaponics — https://pubs.nmsu.edu/_circulars/CR680.pdf
- Freight Farms — Greenery container farm — https://www.freightfarms.com/greenery
- AC Infinity — grow tent catalog with dimensions — https://www.acinfinity.com/grow-tents/
- Wikipedia (secondary, for structure history/behavior): Polytunnel — https://en.wikipedia.org/wiki/High_tunnel; Greenhouse — https://en.wikipedia.org/wiki/Greenhouse; Cold frame — https://en.wikipedia.org/wiki/Cold_frame; Fungiculture — https://en.wikipedia.org/wiki/Fungiculture
- USDA NASS — Census of Horticultural Specialties survey program — https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Census_of_Horticultural_Specialties/ (2024 census forms went to ~40,000 operations; results due Dec 2025)

---

## PART A — Environment Archetypes (14)

### A1. Lean-to hobby greenhouse
- **(a) Footprint/height:** 2–3 m wide × 3–6 m long (typical 6×10 to 10×20 ft kits, industry-typical); clear height 2.0–2.5 m at the tall wall sloping to 1.5–1.8 m at the low eave. Voxels: 20–30 × 30–60 plan, 15–25 tall. Grid: 3×4 to 3×6 cells (attachable to a house wall).
- **(b) Crop surface:** ground beds along the front + one 75–90 cm bench along the house wall.
- **(c) Equipment:** single-slope frame bolted to house wall; glass or 6–8 mm twin-wall polycarbonate glazing (glazing options per Wikipedia Greenhouse); roof/side vent with wax-cylinder auto opener; hose bib; optional 1.5–2 kW thermostatic electric heater; shade cloth in summer.
- **(d) Crops:** salad greens, culinary herbs, spring seedling starts, summer tomatoes/peppers in the bed, overwintered tender potted plants.
- **(e) Visual signatures:** 1) single-pitch shed roof leaning against a taller house wall; 2) dutch door at one gable end; 3) glazed panels with visible mullions + one propped roof vent; 4) brick/siding house wall forming the back of the structure; 5) rain gutter + downspout at the low eave.
- **(f) Climate:** passive solar. Sunny days run well above outdoor temp; nights fall to near outdoor unless the small heater runs (plastic/glass coverings insulate poorly, ~R-2, per Wikipedia Greenhouse). Natural daylength only; humidity spikes at night, vent to prevent Botrytis. Season extension roughly a month either side of frost dates (industry-typical).

### A2. Freestanding hobby greenhouse (glass/polycarbonate)
- **(a):** 2.4–3.7 m wide × 3.0–4.9 m long; ridge 2.4–2.9 m, eaves 1.5–1.7 m (industry-typical kit sizes). Voxels: 24–37 × 30–49 plan, ~29 tall. Grid: 3×3 to 4×5 cells.
- **(b):** perimeter ground beds + central/north bench 75–90 cm tall (aluminum slat or cedar), one flood tray for potted plants.
- **(c):** aluminum or wood A-frame/gothic frame; glass or twin-wall polycarbonate; 1–2 automatic roof vents; circulation fan; 2–3 kW heater; mist bench for cuttings; shade cloth; water butts at corners.
- **(d):** tomatoes/cucumbers trained vertically, peppers, herbs, seedlings, potted figs/citrus.
- **(e):** 1) crisp symmetric A-frame or gothic-arch silhouette; 2) white/green aluminum frame grid; 3) dutch door + weathervane or ridge finial; 4) wax-cylinder roof vents slightly open; 5) polycarbonate's striped translucent panels (or glittering glass); 6) orange porch-light glow of a heater at night.
- **(f):** passive solar + minimal heat. Day: +10–20°C over outdoor in sun; night: near-outdoor unheated (R-2 covering, Wikipedia Greenhouse). RH high at night; supplemental lighting rare — mainly seed-start fluorescent. Frost-free with heater; full production spring–fall.

### A3. Commercial gutter-connected production greenhouse
- **(a):** bays 6.4–12.8 m wide (21/32/42 ft, industry-typical) × 30–100+ m long; gutter height 3–4.5 m (up to 5–6 m for vine crops); ridge ~1:2 pitch above gutter. Total 0.2–1+ ha. Voxels: one bay 64–128 wide × 300+ long, 30–45 eave. Grid: 7–13 cells per bay width; a 30×96 ft house = 9×29 cells.
- **(b):** ground-level "production floor" — either in-ground/soilless beds, rockwool slabs or Dutch buckets on grow gutters, or rolling/elevated benches for potted crops; motorized container benches in propagation houses.
- **(c):** steel truss frame at gutters; double-poly (air-inflated) or glass/structured polycarbonate roof (Wikipedia Greenhouse); computer-controlled roof/ridge vents + insect mesh; thermal/shade screen (can cut heat demand ~8%, Wikipedia); hot-water pipe heating on rails; HPS or LED top-lighting; CO2 enrichment from flue gas or burners (enrichment to ~1,100 ppm, Wikipedia); drip/boom irrigation; fertigation room.
- **(d):** tomatoes, peppers, cucumbers on hanging gutters/wires; lettuce, basil, strawberries on ponds or NFT; potted plants.
- **(e):** 1) repeating arch or sawtooth bays meeting at a straight gutter line with support posts; 2) overhead crop wires and vertical strings with V-trained vines; 3) a white/pale thermal screen fabric "ceiling" partially drawn; 4) HPS orange or LED magenta/white glow striping the glass; 5) heating pipes snaking along rows at floor level; 6) vent racks/motors on the ridge.
- **(f):** fully conditioned: day 18–26°C / night 16–18°C setpoints (vine-crop typical; Cornell lettuce program runs 24/19°C — Lettuce Handbook); RH 60–75%; CO2 800–1,500 ppm (Cornell: 1,500 ppm while lights on); supplemental light in winter to hold 16–17 mol/m²/day (Cornell), i.e., 6–16 h/day of lamps; essentially season-independent, only solar input varies.

### A4. Hoop house / high tunnel
- **(a):** 3.0–9.1 m wide × 9.1–30.5 m long; sidewall 1.2–1.8 m; peak 2.7–3.7 m (standard "30×96 ft" = 9.1×29.3 m; industry-typical). Voxels: 30–91 wide × 91–305 long, peak 27–37. Grid: 3–9 cells wide × 10–30 long.
- **(b):** in-ground raised beds with drip tape — "high tunnels differ from greenhouses: passive ventilation, no permanent heating, crops in ground soil, no hydroponics" (Penn State Extension).
- **(c):** galvanized steel gothic or round hoops on ground posts; single or air-inflated double 6-mil poly film skin (film 4+ yr life; Wikipedia Polytunnel); wiggle-wire track; roll-up sides with T-bars; wooden end walls + hinged or sliding door; drip irrigation manifold; optional shade over top in summer.
- **(d):** tomatoes, peppers, cucumbers, salad greens, cut flowers, strawberries, ginger in warm climates.
- **(e):** 1) long white quonset tube silhouette; 2) horizontal crease lines of rolled-up sidewalls; 3) wooden/gabled end wall with a plain door; 4) anchor baseboards and visible hoop legs every 1.2–1.5 m; 5) poly sag/wrinkles + condensation sheen; 6) no gutters, no heaters, no mullions.
- **(f):** passive solar: +5–15°C above ambient in sun (Wikipedia Polytunnel); nights within a couple degrees of outdoor (row covers/thermal mass buy a few more); high humidity and condensation drip; ventilation = roll sides + doors; natural light only; extends season 4–8 weeks each side, and winter greens survive in mild zones (spinach held above 6°C in US zone 6, Wikipedia Polytunnel).

### A5. Cold frame
- **(a):** 0.6–1.0 m wide × 1.2–2.4 m long; back wall 0.3–0.5 m, front 0.2–0.3 m (typical 3×6 ft kits, industry-typical). Voxels: 6–10 × 12–24 plan, 2–5 tall. Grid: sub-cell to 1×2 cells.
- **(b):** the ground soil itself, sown in rows.
- **(c):** plank/brick/composite box; hinged glazed lid (old window sash or twin-wall poly); prop stick; optionally a hot bed of fresh manure below (historic practice, Wikipedia Cold frame).
- **(d):** winter spinach, mâche, claytonia; hardening-off seedlings in spring; late-fall sowings.
- **(e):** 1) knee-high glass-topped box tilted toward the sun; 2) lid propped open with a notched stick on sunny days; 3) brick courses or horizontal plank siding; 4) frost-fogged glass; 5) dark crumbly soil rows inside.
- **(f):** passive solar + soil thermal mass; days +10–15°C over outside in sun, nights only 1–3°C above; must be vented manually or plants cook; condensation humidity; no lights; purely shifts the season window, weather-coupled.

### A6. Residential grow tent
- **(a):** verified catalog spans (AC Infinity): propagation 24×24×36 in (61×61×92 cm) up to 10×10×80 in (305×305×203 cm); common mid sizes 48×48×80 in (122×122×203 cm) and 96×48×80 in (244×122×203 cm). Voxels: 4×4×9 (small) to 31×31×20 (largest); the classic 4×4 = 12×12×20. Grid: 1×1 cell (2×2 for playability) up to 3×3.
- **(b):** tent floor — fabric pots on trays, or a DWC tote / small flood table.
- **(c):** 2000D reflective Mylar canvas on 1-in poles (AC Infinity); LED quantum board or 315–600 W lamp; 4–6 in inline duct fan + carbon filter + flex duct; clip-on circulation fan; timer/controller; hygrometer.
- **(d):** peppers and tomatoes (1–2 plants per 4×4), basil, salad greens, dwarf fruiting crops.
- **(e):** 1) black fabric box with visible zipper door and round duct stubs exiting the roof; 2) cylindrical carbon filter hanging inside; 3) silver reflective interior visible through opened flap; 4) magenta/pink or warm-white LED glow leaking at zipper seams; 5) floor-level tray and small reservoir with air-pump bubbles.
- **(f):** fully conditioned microclimate: 22–28°C lights-on / 18–22°C lights-off; RH 40–60%; 12–18 h photoperiod; white noise of the fan; completely season-independent, weather-independent.

### A7. Indoor grow room (spare room / basement)
- **(a):** a real room — 2.4–3.6 × 2.4–3.6 m, ceiling 2.1–2.4 m (basements often 1.9–2.1 m). Voxels: 24–36 per side, 19–24 tall. Grid: 2–4 cells square.
- **(b):** floor or tables: 4×8 ft flood tables, soil beds framed on the floor, or rows of totes.
- **(c):** panda-film/mylar wall liners; one 400–1000 W HPS or LED per 1.2×1.2 m footprint (12 W/ft² rule of thumb, Cornell Home Hydroponics guide); exhaust fan ducted outdoors via a wall louver; carbon filter; dehumidifier; window AC or mini-split; mechanical timer → simple controller; nutrient reservoirs + air pumps.
- **(d):** salad greens and herbs at scale (Cornell home guide sizes bins for 35-day lettuce to 150 g), peppers, seedling propagation for an outdoor garden.
- **(e):** 1) blackout-curtained doorway with light-trap flap and glowing seams; 2) ducting "spaghetti" running to a wall vent; 3) rows of identical glowing tables/totes; 4) power strips and timer boxes on the wall; 5) blue reservoir barrels + bubbling air stones.
- **(f):** fully conditioned, riding on house insulation: holds 20–25°C day / 16–19°C night regardless of outside; RH actively dried to 45–65%; lights 14–16 h/day (Cornell home guide: LED ~16 h, T5 up to 24 h); year-round, weather-blind.

### A8. Home grow shelf / rack (consumer kitchen-garden scale)
- **(a):** verified: home-hydroponics racks ~20×16×72 in (51×41×183 cm) with 2–3 shelves (Cornell Home Hydroponics guide); microgreens racks 20×8×70 in (51×20×178 cm) with adjustable shelves (Penn State Microgreens). Voxels: ~5×4×18. Grid: sub-cell (about half a cell wide) — snap to 1×1.
- **(b):** rack tiers holding 1020 trays (10×20 in) or small hydro bins.
- **(c):** wire shelving; T5HO or LED shop bars per tier (12 W/ft² rule, Cornell); plug timers; humidity domes + heat mats for germination; watering can; optional tote DWC with airstone per shelf.
- **(d):** microgreens, seedlings for the garden, cut-and-come-again salad greens, basil, propagation cuttings.
- **(e):** 1) silver/chrome wire rack with 3 glowing shelves; 2) neat rows of identical trays under each light bar; 3) clear domes fogged with condensation; 4) timer power strips dangling at the side; 5) foil/mylar backdrop taped to the wall behind.
- **(f):** sheltered indoor climate: 18–24°C room temp, +1–2°C under lights; RH 40–60 in room, 90–100% under domes; lights on 12–16 h/day (Cornell); completely season-independent — this is where January gardening happens.

### A9. Warehouse vertical farm (multi-tier racks + aisles)
- **(a):** building 1,000–10,000 m² (converted warehouse, dock-height doors); internal clear height 4–8 m; racks ~30.5×61×122–244 cm to multi-bay rows 12–24 m long (Penn State rack dims; warehouse row lengths industry-typical). Grid: a small farm might be 20×40 cells of racks+aisles.
- **(b):** rack tiers (4–9 per rack, industry-typical) with NFT channels, ebb-flood trays, or grow felt; a dedicated propagation tier; aisles 0.9–1.2 m between rack rows.
- **(c):** LED bars on every tier (12–17 mol/m²/day for greens, Cornell); fertigation room with dosing pumps + UV water treatment; HVAC + dedicated dehumidification; optional CO2 enrichment to 800–1,200 ppm; sensor/controller network; nursery racks with domes (Penn State).
- **(d):** leafy greens (lettuce to 150 g heads in ~35 days, Cornell), basil, microgreens, increasingly strawberries.
- **(e):** 1) dark hall punctuated by parallel glowing rack canyons (pink/white stripes); 2) reflective aisle floor with tape lines and zone markings; 3) vertical duct/fan columns and hanging dehumidifiers between racks; 4) flat carpets of identical greens receding in rows; 5) wall of monitors/environment dashboards near the door.
- **(f):** sealed and fully conditioned: 20–24°C constant day/night, 16–18 h LED photoperiod, RH 60–70%; constant HVAC hum; weather-independent (only extreme heat waves stress the cooling plant); no solar input at all.

### A10. Shipping-container farm
- **(a):** verified (Freight Farms Greenery): standard 40-ft high-cube container — 12.2 × 2.4 m footprint, ~2.6–2.9 m high; ~320 ft² (≈30 m²) of growing capacity in LED-lit vertical racks; racks ~6.5 ft (198 cm) tall production racks plus a ~3.75-ft (114 cm) nursery rack. Voxels: 122×24×~27 exterior. Grid: 12–13 × 2–3 cells (interior aisle ~0.6–0.8 m).
- **(b):** rack tiers on both walls: nursery racks (seedling channels) near the door, production racks (vertical panel/gully tiers) down the length.
- **(c):** insulated corrugated steel shell with interior insulated panels; LED strips on each tier; nutrient dosing system + water storage tanks (verified features); climate control/HVAC module; greywater-safe water recycling; controller tablet at the door.
- **(d):** lettuce, other greens, basil, some roots/radish.
- **(e):** 1) rust-toned or vinyl-wrapped ISO container with corner castings and forklift pockets; 2) rooftop condenser/HVAC stack and cable umbilical; 3) double doors opening to a wall of pink-lit racks with one narrow aisle; 4) blue dosing barrels and slim tanks at the entry end; 5) glowing door outline at night in a yard.
- **(f):** fully conditioned: 18–24°C inside regardless of outside (insulated shell, verified), 15–16 h LED day; RH managed 55–70%; water use tiny (closed loop); completely season-independent; power hookup is the lifeline.

### A11. NFT hydroponic greenhouse
- **(a):** greenhouse shell 8–15 m wide × 30–60 m (often a gutter-connected bay); crop zone height ~2 m above benches. Voxels: bench top at 8–9; gutters/channels occupy 70–80 cm band. Grid: runs of channels 4–6 cells wide × building length.
- **(b):** sloped NFT channels on benches or tiered A-frames; plants in 2.5–5 cm net pots in round holes. Cornell home guide (garden-scale): 8 in (20 cm) hole spacing, 10 L/h water per plant, 1–4% channel slope, ¼ in supply lines off a ½–1 in manifold. Commercial gullies ~10 cm wide × 5 cm tall, 2.5–6 m runs (industry-typical).
- **(c):** white gully channels + end caps + collector; reservoir + pump + filter; EC/pH dosing; fans + shade; winter top-up lights; 20–22°C water (chiller if needed).
- **(d):** lettuce, basil, bok choy, kale, herbs, strawberry gutters.
- **(e):** 1) long parallel white ribbed channels, slightly tilted, receding in perspective; 2) plants in a perfectly even 20 cm lattice sitting in round holes; 3) thin film of water glinting at channel ends into collector pipes; 4) blue/black barrel reservoirs with pump hum; 5) manifold pipes running the aisle's length.
- **(f):** greenhouse: passive solar + fans; Cornell CEA setpoints 24°C day / 19°C night, 17 mol/m²/day with winter lamps, CO2 1,500 ppm while lit (Lettuce Handbook — the Cornell spinach NFT handbook uses 24/18°C, 16 h); humidity moderate; season-independent with lights+heat, cheaper in shoulder seasons.

### A12. DWC / aquaponics greenhouse (raft tanks + fish tanks)
- **(a):** greenhouse 9–30 m wide × 30–60 m; DWC ponds/tanks on grade 20–30 cm deep (8–12 in, Cornell home guide) with rafts floating on them; rafts typically 1.2 × 2.4 m boards (industry-typical); fish room annex with circular tanks 1–3 m diameter (industry-typical).
- **(b):** floating rafts on aerated ponds — Cornell: 1-in insulation-board rafts; plant densities 97 plants/m² (≈10 cm) at transplant re-spaced to 38 plants/m² (≈16 cm) final; rule of thumb 2 gal (7.6 L) reservoir per plant; pure oxygen injected to keep dissolved oxygen ≈7 ppm (Lettuce Handbook). Home scale: restaurant bus tubs 21×17×7 in (53×43×18 cm = 5×4×2 voxels) at 3.5 plants/ft² (6.5 in spacing), 1 gal/plant (Home Hydroponics guide).
- **(c):** lined ponds + air blowers/diffusers (or oxygen injection); fish tanks, solids filter/swirl separator, biofilter, sump; pumps; heaters; greenhouse shell with vents; fish feeder.
- **(d):** raft crops: lettuce, basil, kale, bok choy; fish: tilapia, catfish, koi; NMSU aquaponics targets: tilapia water 27–29°C, DO > 5 ppm, pH 6.8–7.0, nitrate 5–150 ppm, TAN < 1 ppm; rule of thumb 1 lb fish per 2 gal water in suspended-solids style systems (NMSU CR680).
- **(e):** 1) big royal-blue round fish tanks with central drain and pipework; 2) long white/blue rafts forming a flush carpet of lettuce you can walk between on boards; 3) bubble streams roiling the water edges; 4) swirl-filter cylinders and plumbing racks; 5) sacks of fish feed and green nets.
- **(f):** semi-conditioned: warm fish water heats the greenhouse (water 24–29°C, air 20–24°C); very high humidity (70–85%) from open water — fogging in cold mornings; supplemental light in winter; year-round with heat, since fish can't freeze.

### A13. Microgreens / propagation room
- **(a):** dedicated room 3–6 m × 3–6 m or a corner of a headhouse; racks 51×20×178 cm up to warehouse racks (Penn State); ceiling 2.7–4 m. Grid: 3–6 cells square, or racks as sub-cell props inside a larger structure.
- **(b):** 1020 trays (26 × 53 cm — Penn State) on rack shelves; glass or wire shelving with 24 in (60 cm) spacing, which "can be doubled" for tall crops, LEDs ~10 cm above canopy (Penn State); germination area with domes + heat mats at 21–24°C media temperature (industry-typical; Cornell lettuce germ room runs 20°C with 24 h low light, then 25°C/250 µmol — Lettuce Handbook).
- **(c):** racks + T5/LED bars; 1020 trays, domes, heat mats; mist line or spray wand; stack of lids; harvest knife/scissors + scale; sanitizer tub.
- **(d):** microgreens (broccoli, radish, pea, sunflower — sown much more densely than field crops, harvest in ~7–14 days, Penn State/industry), plus seedling propagation on 200-cell trays; lettuce transplanted to main systems at day ~11 (Cornell home guide).
- **(e):** 1) chrome racks of flat vivid-green carpets at staggered heights; 2) clear domes fogged with condensation; 3) heat mats with dangling cords under trays; 4) towers of stacked empty black trays; 5) spray bottle, scissors, and kitchen scale on a steel table.
- **(f):** fully conditioned: 18–24°C room, RH 50–70 (90–100% under domes), 12–16 h lights/day; weather-independent; crop turnover so fast the room's "season" is measured in days.

### A14. Mushroom fruiting house
- **(a):** windowless insulated rooms (purpose-built since the mid-20th century, Wikipedia Fungiculture) typically 6–12 m × 4–8 m × 3–4 m (industry-typical); inside: shelf/tray beds ~1.2–1.5 m wide in 4–6 tiers (Dutch shelf systems, Wikipedia Fungiculture; dims industry-typical). Grid: 6–12 × 4–8 cells.
- **(b):** wooden/aluminum shelf tiers or trays filled with ~20–25 cm of pasteurized compost, cased with peat (tray growing is "the most common commercial technique," Wikipedia Fungiculture).
- **(c):** insulated panel walls; humidifiers (RH ~95–100% optimal, substrate moisture 50–75%, Wikipedia); fresh-air ducting/dampers (CO2 dropped from ~0.08% to ~0.04% ambient to trigger pinning); small dim lights as fruiting signal; cooling for fruiting; steam pasteurization room next door.
- **(d):** Agaricus (white button/cremini/portobello), oyster and shiitake on sterilized sawdust/straw in bags and buckets (Cornell Small Farms — bags, buckets, tubs; spawn, substrate terminology).
- **(e):** 1) dark doorway into a dim, damp room; 2) rack tiers of dark "soil" beds dotted with white mycelium fuzz and mushroom clusters; 3) mist hanging in flashlight beams; 4) wet concrete floor with drains; 5) silver ducts and hanging humidifier units; 6) stacked substrate bags with filter patches (specialty mushrooms).
- **(f):** fully conditioned, two climate zones per crop: spawn run 14–21 days at 24–27°C, then fruiting cooler (Agaricus ~15–18°C, industry-typical) with fresh air and light; harvest flushes repeat every 7–10 days (Wikipedia Fungiculture); total ~45–62 days spawning→first harvest; RH always 90–100%; completely weather-independent — these are literally caves rebuilt indoors.

---

## PART B — Cross-cutting Equipment Glossary (36 entries)

Format: **item** — one-line purpose. Typical size (m) → voxels (10 cm each) → grid-cell note.

**Grow lights**
1. **LED bar** — slim strip fixture for shelf/tier or greenhouse intracanopy lighting. 1.1 × 0.05 × 0.05 m → 11×~1×1 voxels. Sub-cell linear prop; mount under each tier.
2. **LED quantum board** — high-efficiency white/magenta panel for tents and grow rooms. 0.6 × 0.6 × 0.05 m → 6×6×1 voxels. About ⅓ of a cell; hangs from a rafter bar.
3. **HPS lamp + reflector** — warm-orange high-intensity lamp, greenhouse top-lighting and flowering rooms. Lamp unit 0.6 × 0.5 × 0.25 m (6×5×2 voxels) + remote ballast box 0.3 × 0.25 × 0.25 (3×3×3). Roughly one cell of light "footprint."
4. **Fluorescent T5 (4 ft, 4-tube)** — low-profile seedling/microgreens fixture; run up to 24 h/day (Cornell home guide). 1.22 × 0.28 × 0.08 m → 12×3×1 voxels. Spans a rack tier.

**Climate**
5. **Mini-split heat pump** — ductless room heating/cooling for grow rooms/container farms. Indoor unit 0.9 × 0.3 × 0.22 m (9×3×2); outdoor condenser 0.8 × 0.3 × 0.6 m (8×3×6). Wall prop + yard prop.
6. **Exhaust fan + shutter louver** — wall-mounted fan that pulls air through the building; the louver flaps open with flow. 0.45–0.61 m square (24 in fan) → 4–6 voxels across, mounted in a 1-voxel wall opening.
7. **Oscillating circulation fan** — keeps air moving to prevent tipburn/fungus (Cornell uses aggressive vertical airflow — 140 cfm/ft² paddle fans in lettuce ponds). 0.4 m head → ~4 voxels + pole; clip-on sub-cell variant.
8. **Dehumidifier** — dries dense crop air (tent/room/vertical farm). 0.35 × 0.35 × 0.6 m → 4×4×6 voxels. Sub-cell floor prop with a drip bucket.
9. **Unit heater** — hung gas/oil-fired box heater for greenhouses. 0.5 × 0.4 × 0.4 m → 5×4×4 voxels + flue pipe (1-voxel cylinder through roof).
10. **Evaporative cooler pad** — wet corrugated wall that cools incoming air (paired with exhaust fans). 1.2 m wide × 1.5 m tall × 0.1 m thick sections → 12×15×1 voxels per section; an end-wall skin.

**Controls / sensors**
11. **Timer / smart power strip** — switches lights and pumps on schedules. 0.3 × 0.1 × 0.06 m → 3×1×1 voxels. Sub-cell wall prop.
12. **Thermostat** — basic heat/vent setpoint dial. 0.15 × 0.1 × 0.05 m → 2×1 voxels. Sub-cell wall decal.
13. **Environmental controller** — integrator box that stages heaters, vents, screens, CO2. 0.3 × 0.25 × 0.1 m → 3×2×1 voxels with a tiny screen face; sub-cell.
14. **Temp/RH probe** — aspirated sensor hanging at canopy height. 0.15 m box on a wire → 1–2 voxels. Hangs 2 voxels below a light bar.
15. **CO2 sensor** — monitors enrichment level. 0.15 × 0.1 × 0.05 m → 1–2 voxels. Sub-cell.

**Irrigation / hydroponics**
16. **Drip emitters + manifold** — pressure-regulated spaghetti lines to each plant. Manifold pipe 1–2 m (10–20 voxels) with 1/4 in lines (sub-voxel threads); emitters = 1-voxel nubs at each plant.
17. **Ebb-and-flood table** — watertight tray flooded 2–4×/day for ~15 min (Cornell). 2.5 × 1.3 × 0.15 m tray (Cornell: 8 × 4 ft benches) on legs → 25×13×2 voxels ≈ 1 × 2.5 grid cells.
18. **NFT channel (gully)** — sloped trough carrying a thin nutrient film past roots; 1–4% slope, ~10 L/h per plant, 20 cm hole spacing (Cornell home guide). 3 m × 0.1 × 0.05 m per run → 30×1×1 voxels. A 3-cell-long prop; 1 plant per 2 voxels of channel.
19. **DWC tote / raft** — static oxygenated reservoir with a floating board. Home tote 0.53 × 0.43 × 0.18 m → 5×4×2 voxels (sub-cell); commercial raft panel 1.2 × 2.4 m → 12×24 voxels sheet floating on a pond.
20. **Nutrient reservoir + pump** — fertile water heart of every hydro system; home bins 25–27 L (Cornell). Drum 0.6 m dia × 0.9 m → 6×9 voxels; IBC tote 1.2 × 1.0 × 1.16 m → 12×10×12 voxels ≈ 1+ cell tall.
21. **Misting line** — overhead pipe with fogger nozzles for propagation. 3–6 m pipe (30–60 voxels) + sub-voxel nozzles; mist = particle layer.
22. **Capillary mat** — wet fabric under pots for passive bottom-watering. 1.2 × 2.4 m flat → 12×24 voxels, zero height — a texture on a bench.

**Nursery**
23. **1020 propagation tray** — the industry-standard 10 × 20 in open flat. 0.26 × 0.53 × 0.06 m (Penn State) → 5×3×1 voxels. Sub-cell: ~7 fit in one grid cell.
24. **Humidity dome** — clear lid that turns a tray into a 90–100% RH chamber. Same footprint, 0.15–0.3 m tall → 5×3×2–3 voxels.
25. **Seedling heat mat** — waterproof warming pad under trays (germination 20–25°C, Cornell). 0.53 × 0.25 × 0.01 m → 5×3 voxels, flat.
26. **Grow rack** — multi-tier light+shelf unit, the backbone of nursery/vertical rooms. 0.51 × 0.41 × 1.83 m → 5×4×18 voxels (Cornell/PSU). Sub-cell width; ~2 tiers minimum, shelves at 60 cm (PSU).

**Structure / infrastructure**
27. **Poly film (greenhouse skin)** — 6-mil UV-treated stretched covering, 4+ year life (Wikipedia Polytunnel). A skin material, not a prop — walls/roof 1 voxel thick.
28. **Twin-wall polycarbonate** — rigid insulated glazing panel (8–10 mm) for walls/roof of better greenhouses. Standard sheets ~2.1 × 6 m; rendered as 1-voxel walls with a "striped" translucent texture.
29. **Shade cloth** — 30–70% shade fabric (often aluminized) pulled over roofs/tiers in summer. Sheet over structure, sub-voxel thickness.
30. **Thermal/insect curtain** — motorized fabric ceiling that traps heat at night (≈8% heat saving, Wikipedia Greenhouse); insect mesh caps vents (sub-voxel apertures). Render the screen as a taut pale "second ceiling" plane at gutter height.
31. **Benches/tables** — rolling or fixed growing tables. 1.5–1.8 × 0.6–0.76 m top at 0.76–0.9 m height (industry-typical) → 15–18 × 6–8 × 8 voxels. Occupies ~1 × 2 cells.
32. **Trellis wires + crop strings** — overhead wire at 2–3 m with vertical drop strings for tomatoes/cukes. Wire/string = 1-voxel lines; the wire row runs the bay length.
33. **CO2 burner or tank** — enrichment to 1,000–1,500 ppm (Cornell 1,500 ppm lit). Burner 0.6 × 0.3 × 0.3 m (6×3×3, hung); 20 lb tank 0.3 m dia × 0.9 m (3×9, cylinder prop).
34. **Water storage tank** — buffer/irrigation store (Freight Farms lists water storage as core). IBC 12×10×12 voxels; vertical silo tanks 1.5–2 m dia × 2–3 m → 15–20 × 20–30 voxels ≈ 2×2 cells and taller than a player block.
35. **Nutrient dosing barrels** — concentrated A/B fertilizer jugs feeding dosing pumps. 2–4 drums 0.6 dia × 0.9 m → 6×9 voxels each, usually in a colored cluster.
36. **Power panel / standby generator** — the electrical spine (fans+pumps are life support). Panel 0.6 × 0.2 × 1.2 m → 6×2×12; genset 1.5 × 0.7 × 1.0 m → 15×7×10 ≈ 2×1 cells.

---

## PART C — Planting-Surface Taxonomy

| Surface | Where it appears | Typical spacing on the surface | Voxel/grid mapping (10 cm voxels, 1 m cells) |
|---|---|---|---|
| **In-ground bed** | Lean-to, hobby GH, high tunnel, cold frame | Row crops 30–45 cm in-row; tomatoes 45–60; greens 15–20; carrots/radish 5 | Direct: 1 plant per grid cell ≈ a 3×3-voxel patch of visible plants; keep rows as lines of 1-voxel plants |
| **Raised bench** | Hobby/commercial GH, propagation | Pots 15–30 cm; seedling trays on 1020s | Bench surface 1–2 cells wide, 8–9 voxels high; trays tile 7 per cell |
| **Flood (ebb-and-flood) table** | Propagation, commercial pot crops, vertical farms | Pots/trays as above; Cornell floods 2–4×/day, 15 min | 1 × 2.5 cells; water = flat animated plane 1 voxel deep |
| **Rack tier** | Home rack, microgreens room, warehouse, container farm | Microgreens: broadcast (no grid); greens transplants 10–15 cm; PSU rack shelves at 60 cm pitch (doublable) | Each tier = sub-cell width strip; place plants on a 1–2 voxel lattice, 5–6 voxels tall clearance |
| **NFT channel** | NFT GH, vertical farms | Lettuce 20 cm (8 in) holes verified Cornell; basil 10 cm (4 in) | 1 plant per 2 voxels along a channel; channel = 1-voxel-wide ribbed run, 30+ voxels long |
| **DWC raft** | Raft GH, aquaponics, home totes | Lettuce 10 cm initial → 16 cm final (97 → 38 plants/m², Cornell); basil 10 cm (4 in) | Raft sheet with plants on a 1–2 voxel lattice floating on a 2–3-voxel-deep water plane |
| **Vertical panel/tower** | Container farms, warehouse walls, A-frame NFT | Greens/herbs 15–20 cm per pocket | A 1-voxel-thick wall panel with plant voxels protruding 2–3 voxels in a staggered lattice |
| **Hanging basket** | Retail/commercial GH perimeters | 30–40 cm pots on 0.6–1 m centers, overhead grid of wires | 1 basket per cell, hung 15–20 voxels up; good "green chandelier" filler for tall bays |

**Vertical stacking rules (what stacks, how high):**
- Home grow racks: 2–3 tiers on a 72-in rack (Cornell home guide) — tier pitch ~45–60 cm.
- Microgreens racks: adjustable, 60 cm between shelves, doubled for tall crops; LEDs 10 cm over canopy (Penn State).
- Warehouse vertical farms: 4–9 tiers, 45–60 cm pitch per tier (industry-typical; Freight Farms container racks reach ~198 cm total with multiple gully tiers; nursery rack ~114 cm).
- Trellised vine crops stack a different way — one plant per cell trained up a string to an overhead wire at 20–30 voxels (2–3 m).
- DWC/NFT/benches/cold frames do not stack (ground-based), but NFT appears in 2–3-sided A-frames in some greenhouses.

**Grid-mapping cheat sheet for the app:**
- Dense leafy greens (15–20 cm): game-level 1 plant/cell is realistic at "miniature diorama" scale; at true voxel scale 25 plants/cell (5×5 lattice).
- Basil/herbs (10 cm): 2× the greens density.
- Tomatoes/peppers/cucumbers (45–60 cm): exactly 1 plant/cell; add string + overhead wire.
- Strawberries (15–20 cm): 1/cell or 5×5 lattice like greens.
- Microgreens: no plant grid — the tray (5×3 voxels) is the unit; ~7 trays/cell.
- Seedlings in 1020s: trays are the unit; a nursery rack tier holds 2×2 trays.
- Mushrooms: clusters of 3–5 fruiting bodies scattered on a bed surface, ~15 cm apart — 1 "cluster" per 1–2 voxels looks right.
