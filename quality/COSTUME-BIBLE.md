# COSTUME BIBLE — Groundwork (the FarmFriend pro planning costume)

Status: MODE A foundation, locked 2026-09-19 from product truth in `SPEC.md`,
`README.md`, `HANDOFF.md`. Binding for all outbound artifacts; in-product
migration is phased (see §7 type tokens).

## ASSUMPTIONS (inferred, not confirmed — flag any that are wrong)

1. **Market.** The commercial target is small commercial growing operations
   (market gardens, CSA, nursery and greenhouse, indoor/CEA) plus serious land
   planners. Hobbyist consumers belong to the house's warmer register, not
   this costume.
2. **Proof.** No customer logos or case studies exist. The proof stack is
   product truth only; nothing is invented. This is treated as a feature.
3. **House.** FarmFriend is the family name (per repo and SPEC title
   "FarmFriend Pro"). The pro line may stand alone.
4. **Units.** Metric-first, because the codebase is metric (25 cm cells,
   meters, L/day). Imperial is a product TODO, never a copy convention.
5. **Jev.** The advice engine's internal name (OpenRouter-hosted model,
   `ff.cellAdvice.v0` contract) ships as the advisor's name.
6. **Regulatory.** No certification claims (organic, etc.) anywhere; none are
   planned.

---

## 0. Working title

The repo carries three names: `FarmFriend` (house), `FarmFriend Pro` (SPEC
title), `ff-voxel-twin` (package). None owns the pro buying moment.

| Option | Read | Verdict |
| --- | --- | --- |
| **Groundwork** | The grower's own word for this exact work; sits naturally next to "plot planning software" on a procurement form | **Recommended** |
| FarmFriend Groundwork | House-attached form, if recognition lives in the house | Fallback |
| Plotline | Plot of land, but reads like film tooling | No |
| Frostline | Evocative (frost dates drive the calendar) but too narrow for CEA surfaces where frost never comes | No |

Recommendation: **Groundwork**, standalone. The advice engine keeps its name:
**Jev**.

## 1. Category name

**Plot-level crop planning software.** Short form in prose: *spatial crop
planning*. The digital twin is named as the mechanism in body copy ("a scale
model of your ground"), never as the category.

Anti-category, refused: "AI garden planner." Also refused: "smart farming
platform," "digital agriculture solution."

## 2. Spine

- **Positioning (one sentence).** Groundwork turns a piece of ground into a
  measured, rehearsed, printable plan before the season spends it.
- **Visual hook.** The plan sheet: margin coordinate ticks, a title block
  (SHEET · REV · DATE · SCALE), the 25 cm grid, and small vermilion flags
  marking decisions. Everything Groundwork ships wears the conventions of a
  survey plate.
- **Verbal posture.** The dry extension agent: speaks in meters, weeks before
  last frost, and liters per day; cites sources inline; never hypes.
- **Cover-the-logo test.** Vellum ground, survey-blue ink, vermilion flag
  accents, coordinate ticks and title blocks, tabular numerals, the 25 cm
  grid. Remove the logo from any artifact and it still reads Groundwork.

## 3. Worldview

Each belief constrains real decisions. Decoration fails the bar.

1. **A plan is a measurement, not a mood board.** Every plan figure carries a
   scale bar, north arrow, date, and revision. No image ships without one.
2. **Weather is the opponent; the calendar is the weapon.** Frost dates and
   live forecasts drive claims; we show the alert logic (thresholds, windows),
   not just the alert.
3. **Software must work where the signal doesn't reach.** Local-first is a
   headline capability, not a footnote. Offline fallback is demonstrated, not
   apologized for.
4. **Advice advises; the grower decides.** Jev output is typed, labeled with
   source and confidence, and never gates an edit. This is a product fact
   (the seam is read-only by contract); it is also a brand stance.
5. **Determinism is trust.** Same inputs, same run. We publish how runs
   replay and what is never stored (per-tick state is rebuilt, not kept).

## 4. Buying committee

| Reader | Fears | Needs to believe | Proof that moves them | Enters at |
| --- | --- | --- | --- | --- |
| Owner / GM (economic buyer) | A lost season; input spend wasted on a badly planned block | Planning protects revenue weeks and cuts seed, water, and labor waste | Plant counts and water demand computed from catalog spacing; yield math with visible assumptions | Hero, one proof figure |
| Head grower / production lead (operational owner, feels the pain daily) | The notebook of bed maps that doesn't survive contact with weather | The tool models their real ground: beds, surfaces (greenhouse, tunnel, tent, indoor, warehouse), companions, frost dates | Spacing-violation overlay, companion halos, calendar generated from frost dates, "this week" panel | Map and calendar sections, the interactive sheet |
| Farm systems / IT (technical evaluator) | Data hostage-taking; vendor lock-in | Data is exportable, the contract is typed, the thing runs without a server | Published endpoint contract, JSON/CSV exports, local-first store, REST seam | Data-handling and docs pages |
| Investor / partner (occasional) | A wedge that is demo-ware | Claims are honest and the engine is real | Deterministic sim engine; the public known-limits page | Twin evidence, roadmap honesty |

The head grower is the daily pain and owns the hero register. The owner is
routed via the proof figure. The evaluator is routed to docs. Nobody is
shouted at.

## 5. Message architecture

**Headline territories**

1. PRIMARY — Rehearsal: **"Walk the season before you plant it."**
2. Resolution: "Your ground, at 25 centimetres."
3. Accountability: "Plans that survive contact with weather."

**Value pillars (3, each tied to an operational proof)**

1. **Measured ground.** Scale-accurate grid and real spacing math. Proof:
   "≈14 tomato plants on 12.5 m², computed from catalog spacing (50 × 90 cm),
   not guessed."
2. **Rehearsed season.** Deterministic what-if runs on a forked plan, and a
   calendar generated from frost dates. Proof: same inputs replay the same
   run; per-tick state is never stored, it is rebuilt by replay.
3. **Carried-out work.** Printable plan sheets, seed lists with a safety
   factor, data that leaves easily. Proof: PNG sheet with legend and scale
   bar; CSV at plants × 1.5 seed safety; typed REST contract in the README.

**Proof stack**

- Exists: 50-crop catalog with real agronomy fields (amended 2026-09-20; was
  47 at lock); live Open-Meteo weather and derived frost/heat/rain/dry
  alerts; deterministic sim engine; six surfaces from outdoor to warehouse;
  local-first persistence; PNG/CSV exports; typed REST seam; opt-in Jev
  advice with labeled fallback.
- Promised (say so, or say nothing): multi-user, rotation history across
  seasons, live sensor integrations at scale.

**Words we use:** bed, block, stand, succession, window, surface, frost date,
plan sheet, revision, run, replay, spacing, cell, margin note.

**Words we ban:** AI-powered, smart garden, green thumb, seamless, unlock,
supercharge, revolutionize, cutting-edge, next-gen, robust, "solutions."

**Claims policy**

- Yield figures only with the catalog row cited.
- Weather attributed to Open-Meteo, staleness shown ("cached" is honest;
  keep it).
- Jev verdicts carry source and confidence, advisory phrasing only ("Jev
  reads this bed as tight (0.85)").
- No uptime or SLA claims until a hosted backend exists.
- Provider keys never ship client-side (the current OpenRouter key is
  local-dev by design; the server-side proxy is a stated requirement, not an
  implementation detail).
- Promised features are labeled as not built or omitted.

## 6. Verbal identity

**Voice attributes**

1. **Land-literate.** Do: use the grower's units and calendar (m², weeks
   before last frost, L/day, stand). Don't: model-speak ("optimize your farm
   with computer vision") or generic agtech abstraction.
2. **Dry and specific.** Do: let numbers carry the persuasion; understate;
   write short declaratives. Don't: adjectives doing the work of evidence;
   exclamation marks; "Not X. Y." as a repeated construction.
3. **Accountable.** Do: cite sources inline; show fallbacks and limits; name
   what is not built yet. Don't: claims without an operational referent;
   invented logos or metrics.

**Sentence design.** 8–16 word declaratives. Second person to the operator.
Present tense for how it works; past tense for what was verified (the
verification-log register already in `quality/` is the model). Agronomy
jargon is welcome and defined at first use; ML jargon is banned. Em dashes
rare; at most one per sentence.

**How we talk about AI.** The word "AI" appears only in legal or technical
contexts. Jev is "the advisory engine," or margin notes: described by what it
reads (the plan, the catalog, the forecast) and what it returns (typed
verdicts with confidence). The model is never the subject of a sentence.

**Failure, limits, human review.** First-class content, in the product's own
words: "If a live advice call fails, the scan falls back to local heuristics
and is labeled as such on the sheet." Known limits get a public page, past
tense, with measurements (the HANDOFF honest-limits list is the seed of it).

**Channel translations**

- Web hero: one claim, one live proof figure, the sheet. ("Walk the season
  before you plant it. 20 × 12 m, 412 plants, 38 L/day — computed, not
  estimated.")
- Docs: contract-first. Schemas, field tables, units in mono, sample payloads
  from the real contract (`ff.cellAdvice.v0`).
- Email: operational. "This week at North Meadow: sow kale indoors, 6 weeks
  before last frost. Frost risk Saturday, 1 °C. Two beds ready to pick."
- PDF: a plan sheet. Title block, legend, scale, revision, numbers in the
  margin.
- Cold outreach: three sentences. One number true of their operation, one
  mechanism, one ask. No adjectives.
- Legal-safe: advisory not directive; weather attributed; no outcome
  guarantees; data portability stated plainly.

## 7. Visual identity

**Aesthetic family: Cartographic Ops.** Chosen because the product IS a
scale-accurate map: the survey plate is the domain's native artifact and
carries authority without novelty-seeking. (Field Manual rejected: too
militaristic for CEA buyers. Control-Room Editorial rejected: implies 24/7
telemetry we do not have. Warehouse Typography rejected: belongs to
fulfillment, not growing.)

**Why it fits this product's physics.** The ground is gridded at 25 cm; the
export already carries a legend and scale bar; determinism and revision
tracking are engineering facts of the codebase. The costume ships the truth
the product already is.

**Color tokens**

| Token | Hex | Usage |
| --- | --- | --- |
| Ground / Vellum | `#F4F3EE` | All light surfaces; the default field. Grayed paper, deliberately not cream; the beige + rust + italic-serif combo is explicitly refused |
| Ink / Survey | `#1B2A32` | Type, plan line work, hairlines at 18% opacity |
| Accent / Flag | `#D8481F` | Vermilion, used like flagging tape: small, functional, marking decisions, CTAs, the current revision. Never a wash, never a gradient |
| Environment / Stand | `#3E6B3A` | Green restricted to living data: planted area, companion halos, harvest bars. Green is evidence, not decoration |
| Support / Surface | `#EAE9E1` | Alt rows, panels |
| Support / Alert amber | `#B7791F` | Only where the product uses it: spacing violations, ready markers |
| Support / Stress red | `#B3261E` | Only for sim stress washes |

**Type**

- Display: **Archivo** (variable). Widths 110–125 in caps are reserved for
  plate labels and section heads.
- Body: **Source Serif 4** (400/600). The only italics in the entire system
  are Latin binomials (*Solanum lycopersicum*). That rule is absolute; it is
  also a horticultural convention we are honoring, not inventing.
- Mono: **IBM Plex Mono** (400/500) for IDs, coordinates, measurements,
  schema names, code. Tabular numerals wherever numbers are compared.
- No third display face, ever.

**Radius / density / grid / measure.** Corners: 0 on sheets, tables, and
figures; 2px on buttons and inputs; 6px on modals and popovers; nothing
between. 8pt grid; 12-column web with 24px gutters; PDF margins 15 mm with
tick marks every 10 mm; body measure 60–68 characters; UI density high
(spec-sheet density, not marketing air).

**Texture and material.** Paper grain at ≤3% opacity on large vellum areas;
the feel of printed matter, ink slightly warm on paper. No glass, no glow, no
noise over text; shadows never heavier than a printed page (0/1/2px, low
alpha).

**Imagery rules.** Show: (1) the sheet, the 2D blueprint with its real
overlays; (2) the twin, World 3D renders as evidence shots captioned like
plates (farm, date, scale); (3) annotated frames with leader lines, mono
labels, and confidence dots on Jev notes. Never: stock people, floating
holograms, drone heroics, faces in heroes, decorative crops unconnected to a
plan. The ground is the subject. If a person appears, they are working and
unglamorous.

**Icon and diagram language.** 1.5px line weight; 45° leader lines; small-caps
mono labels; every plan figure carries the stamp: N ↑ · scale · date · REV.
Overlay semantics are inherited from the product and never re-colored:
amber = spacing violation or ready; green halo = companion; red wash =
stress; corner dots = Jev confidence.

**Motion.** 120–200 ms, cubic-bezier(0.2, 0, 0, 1). Only three things may
move: the growth scrub, environmental FX inside the twin, and a plan drawing
itself in a single pass (≤300 ms). Nothing loops outside the twin; nothing
pulses; no parallax; "live" pills are banned.

**In-product brand moments.** Empty state = a blank sheet ("Sheet 1 —
20 × 12 m. Nothing planted. Draw the first bed."). Alerts render as field
notices with stamped severity. The Jev panel sits in the margin as an
agronomist's pencil notes, never a popup. The PNG export already has legend +
scale + title: finish the title block (REV, sheet number, source stamps).

## 8. Graphic system

**The hook at five scales**

- 16px: vermilion flag marker on a vellum chip (favicon, app icon).
- UI: spec-sheet density; mono measurements; 18%-ink hairlines; zero-radius
  sheets.
- Web hero: a real plan sheet drawing itself at 1:200, margin ticks, one
  vermilion revision flag; headline in Archivo, body in serif, numbers in
  mono.
- PDF cover: full title block (sheet no., farm, area, scale, date, REV,
  source stamps) over a 40%-tint of the plan line work.
- Booth/poster: a 2 × 3 m printed plan sheet of a real farm at 1:50, margin
  ticks, a physical vermilion flag pinned at the current revision. People
  gather around maps; give them one.

**Diagram grammar.** The 25 cm cell is the base unit of every diagram; any
diagram reduces to grid + overlay + callout. Time is always a horizontal
strip in the calendar idiom: sow indoors → transplant → direct sow →
harvest.

**Do plates:** scale bar present; sources stamped; verdicts shown with
confidence; serif body with binomial italics; mono numbers.

**Don't plates:** a crop photo without a plan; a number without units or
source; green outside living data; rounded hero cards with drop shadows;
tracked-out all-caps outside plate-label semantics.

## 9. House vs. costume

Assumed: FarmFriend is the house (warmer register, consumer-facing family);
Groundwork is the pro planning costume.

- **Shared (never changes):** the claims policy; Jev's voice and labeling
  rules; mono for all data; Flag vermilion as the single accent;
  title-block discipline on anything printed.
- **Local (this costume may change):** the paper-light palette, serif body,
  cartographic plate layouts, and the dry register. The house may be warmer.
- **Collision rules:** house mascot and emoji marks never appear on pro
  artifacts. Consumer "fresh/organic" greens never touch Stand; Stand is data
  only. A sibling product gets its own costume under the same house law, not
  a recolor of Groundwork.

## 10. Anti-references

Five looks we get accused of if we get lazy, and the difference:

1. **AI agtech keynote** (dark navy, neon green, drone footage). We are
   paper-light with no glow; the twin is evidence, not spectacle.
2. **Craft-farm Instagram** (beige, rust, giant italic serif, dried flowers).
   We are grayed vellum, no display italics, vermilion as tape, not wash.
3. **SaaS dashboard template** (Inter, uniform 16px cards, three-column icon
   grids). We run plate layouts, serif body, mono tabular numbers, no uniform
   card grids.
4. **Minecraft gamification** (pixel fonts, bouncy UI). Voxels appear only
   inside product evidence, never as typography or decoration.
5. **Agritech brochure** (sun-washed stock people holding tablets in fields).
   No stock people; the ground is the subject.

Legitimate references to aim beside (not copy): USGS quadrangle sheets; USDA
soil survey plates; the John Deere Operations Center's operational sobriety.

## 11. Quality bar

**Ship checklist**

- Every plan image: scale bar, north, date, REV.
- Every number: unit and source (catalog row, Open-Meteo, sim run id).
- Every Jev verdict: source label, confidence, advisory phrasing.
- Every PDF: complete title block.
- Offline behavior stated wherever data loads.
- Banned-word scan clean; "AI" never the subject of a sentence; binomial
  italics only.
- Green appears only on living data.
- Mono for all IDs, coordinates, and measurements.

**Kill criteria.** An artifact that would survive a logo swap onto a generic
AI startup or a fintech is killed and rebuilt. A hero without a proof figure
is killed. A claim without an operational referent is killed.

## 12. Agent kit

```yaml
costume:
  name: Groundwork
  house: FarmFriend
  category: plot-level crop planning software (short form: spatial crop planning)
  spine: turn ground into a measured, rehearsed, printable plan before the season spends it
  voice:
    attributes: [land-literate, dry-and-specific, accountable]
    ban: [AI-powered, smart garden, green thumb, seamless, unlock, supercharge,
          revolutionize, cutting-edge, next-gen, robust, solutions,
          "Not X. Y." tic, AI as sentence subject]
  visual:
    family: Cartographic Ops
    colors:
      ground: "#F4F3EE"      # vellum
      ink: "#1B2A32"         # survey blue-black; hairlines at 18%
      accent: "#D8481F"      # flag vermilion; tape usage only
      environment: "#3E6B3A" # stand green; living data only
      support:
        surface: "#EAE9E1"
        alert_amber: "#B7791F"
        stress_red: "#B3261E"
    type:
      display: Archivo            # wdth 110-125 caps for plate labels only
      body: Source Serif 4        # italics reserved for Latin binomials
      mono: IBM Plex Mono         # IDs, units, coordinates, schemas
    hook: the plan sheet - margin ticks, title block, 25 cm grid, vermilion revision flags
    radius: { sheets: 0, controls: "2px", modals: "6px" }
    motion:
      ms: "120-200"
      easing: "cubic-bezier(0.2, 0, 0, 1)"
      allowed: [growth-scrub, twin-env-fx, single-pass-plan-draw]
  claims_policy:
    - yields cite the catalog row
    - weather attributed to Open-Meteo with staleness shown
    - advice uses advisory phrasing with source label and confidence; never gates an edit
    - no uptime or SLA claims until a hosted backend ships
    - provider keys never ship client-side
    - promised features labeled not-built or omitted
  deliverable_rules:
    web:
      - hero is one claim plus one live proof figure plus the sheet
      - trust, deployment, and data-handling are first-class pages
      - every plan figure stamped with north, scale, date, REV
    docs:
      - contract-first; schemas and units in mono
      - sample payloads from real contracts (ff.cellAdvice.v0)
      - known-limits page in past tense with measurements
    email:
      - operational register: this week's sow, transplant, harvest, frost risk
      - no adjectives in subject lines
    pdf:
      - every page descends from the plan sheet: title block, legend, scale, REV
      - body serif; numbers mono, tabular
    outreach:
      - three sentences: one true number, one mechanism, one ask
      - reference the recipient's actual crop mix; no adjectives
```

---

## Amendments

- **2026-09-20 — Name ruling.** The pro line ships as **FarmFriend: LandPlan**
  (house-attached form). "Groundwork" remains this costume's internal codename
  and the name of the superseded Rev A draft (moved to
  `marketing/archive/groundwork-announcement-rev-a.html`). Every binding rule
  in this bible applies unchanged to LandPlan artifacts. The announcement
  deliverable of record is `marketing/landplan-announcement.html`, Rev 1.0.
- **2026-09-20 — Proof-stack refresh.** Catalog is now 50 crops and starter
  templates number 8 (Salad Garden → Tent Starters). Verified against
  `src/data/crops.ts` and `src/data/templates.ts`.
