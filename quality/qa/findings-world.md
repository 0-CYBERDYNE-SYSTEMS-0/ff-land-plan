# QA findings — World3D, HUD Spec & Creative (lane "world")

Auditor: QA-2 · Date 2026-09-07 · Working tree under test: UNCOMMITTED World-HUD
restructure per `quality/SPEC-WORLD-HUD.md` · Budget used: 7 appshots (≤8), 0 live shots.

## Verdict

The HUD restructure itself is well executed: every SPEC-WORLD-HUD acceptance
criterion traces clean in code and all six named appshot gates pass with zero
runtime errors — the dock/cluster/drawer/dim/cinema/toast work is **ready to
commit**. But the lane carries **one P1 that should block the commit until a
one-line seed fix lands**: the default seed farm 1 (North Meadow) is the only
farm whose plan ships without `plantedAt`, so on the flagship demo farm the
growth sim reads every crop as 100 % mature from t=0 ("Day N" never shows) and
any Simulate run auto-pauses with a spurious amber "Season complete" banner
after 14 sim-days (≈15 s at 1×, ≈2–3 s at week/month). The new season-complete
feature works as designed everywhere else — it is the seed data that breaks it,
and the break is exactly the "normal user plan triggers spurious season
complete" scenario the audit was asked to disprove. Everything else found is
P3 hygiene. Registry coverage is complete (50/50 catalog crops mapped), the
creative lib is fully seeded-PRNG (zero `Math.random`), and determinism
spot-reads pass.

## Checks run

| # | Probe | Method | Result |
|---|-------|--------|--------|
| 1a | Bottom dock fixed child set (chip + Simulate/Tour/Fly/Reset/Sim▸) | Code trace World3D.tsx:819-903 + w1.png | PASS |
| 1b | Top-left cluster Cinema/History/audio/Debug | Code trace World3D.tsx:766-815 + w1.png | PASS |
| 1c | Dim rule cinema‖tour‖flight → opacity-20, hover/focus restores; drawer/bar/toast never dimmed | Trace :741-742, applied :767 & :819; dimCls absent from drawer (:905), tour bar (:931-941), toast (:944-950) | PASS (visual hover-restore not exercised headless — CSS `:hover` propagates from `pointer-events-auto` children to the `pointer-events-none` wrappers) |
| 1d | SimDrawer 320px slide-over, always-mounted, z-150/backdrop z-140/Select z-200, bottom sheet <xl | Trace SimDrawer.tsx:76,:86-91,:194,:214; World3D.tsx:905-929 | PASS |
| 1e | Cinema owned by PlotDesigner (`h`, typing/modifier guard, Escape untouched, auto-exit on leaving world) | Trace PlotDesigner.tsx:38,:46-63,:48,:89,:97-99,:116-125 | PASS |
| 1f | Real `ff-toast-in` keyframes (no tailwindcss-animate) | grep index.css:117-121; used World3D.tsx:946; clearTimeout cleanup :733-737 | PASS |
| 1g | Always-mounted sr-only "Sim controls:" line | Trace World3D.tsx:764 | PASS |
| 2 | Gate 1 world pill `--expect "Simulate"` | appshot 1440x900 | PASS — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "Simulate"` (w1.png 700 KB) |
| 2 | Gate 2 night+debug `--expect "FPS:"` | appshot 1440x900 | PASS — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "FPS:"` (w2.png 561 KB) — proves ffdebug AND fftime alive post-restructure |
| 2 | Gate 3 tablet 820x1180 `--expect "Simulate"` | appshot | PASS — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "Simulate"` (w3.png 615 KB) |
| 2 | Gate 4 blueprint regression `--expect "Brush"` | appshot 1440x900 | PASS — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "Brush"` (w4.png 147 KB) |
| 2 | Gate 5 farm 6 world `--expect "Simulate"` | appshot 1440x900 (farm 6 confirmed seed.ts:69) | PASS — `GATE PASS: zero runtime errors` / `EXPECT PASS: found "Simulate"` (w5.png 660 KB) |
| 3 | SimDrawer wiring (~20 props) drive real state | Trace World3D.tsx:905-929 ↔ SimDrawer.tsx; dead props below | PASS with WD-2 (P3) |
| 4 | Season auto-pause top risk | Trace seed.ts/growth.ts:121/World3D.tsx:647-672 + all planting appliers | **FAIL — WD-1 (P1)** on seed farm 1; normal user plans (brush/rect/line/fill/templates) all stamp plantedAt and are safe |
| 5 | Playback tick = simSpeed days/1000 ms; default speed | Trace World3D.tsx:131 (default 1), :607-617 (`setInterval` 1000 ms, `+simSpeed` days, UTC-safe) | PASS |
| 6 | Init gate `planRef && cropById.size>0`; farm-to-farm rebuild | Trace :223, :225-473, dispose paths :445-472, deps `[sceneReady, farmId]` :473; cropById from local static catalog (usePlanEditor.ts:297) | PASS — gate unreachable in shipped local-first mode (empty catalog only via remote backend; world would sit silently empty). Rebuild-on-farmId disposes everything exactly once per farm |
| 7 | URL params `?fftime` pins sun, `?ffdebug=1` opens Perf HUD | Gate 1/2 EXPECT results + trace :123-128, :153, :279 | PASS |
| 8 | Tour throttle 1 % | Trace :365-372 (`\|p − last\| > 0.01`) | PASS |
| 8 | Fly WASD + Escape exit | flight.ts:45-46 Escape→deactivate; mirrored flag sync World3D.tsx:382-386 → button label :881 | PASS (WASD keys not exercised headless) |
| 8 | Achievement toasts | Trace :400-402, :717-737 | PASS with WD-4 (P3, pre-existing) |
| 9 | ground.ts silent `continue` on broken tile | Trace ground.ts:216-220 | FAIL — WD-3 (P3) |
| 9 | plants.ts fallback for unmapped names / stage<0/>5 | Trace plants.ts:23-102,:240 (`makeCropFor`); map.ts:167 stage guard | PASS |
| 9 | Registry coverage: all catalog crops in cropAssetMap | grep diff of 50 names (src/data/crops.ts) vs 50 keys (crops/map.ts:97-162) | PASS — 0 misses (multi-line `Nasturtium:` entry at map.ts:147 verified by eye) |
| 10 | Determinism: no Math.random in builders | grep src/creative → 0 hits; rng = mulberry32 (voxel.ts:176-178); spot-read terrain tile (tiles.ts:19-33 `const rand = rng(seed)`) and structures (barn.ts/equipment.ts seeded rng imports, headers say "unique seeded rng") | PASS |
| 11 | Showcase lane A `--expect "showcase-ready"` | appshot 1440x900 | PASS — `EXPECT PASS: found "showcase-ready"` (laneA.png 160 KB); count emitted at showcase/main.ts:201 (`cells.length`) |
| 11 | Showcase lane D (bonus) | appshot 1440x900 | PASS — `EXPECT PASS: found "showcase-ready"` (laneD.png 100 KB). Lanes B/C NOT TESTED (budget) |

## Findings

### P1

**WD-1 — Seed farm 1 ships without `plantedAt`; Simulate on the default farm
self-pauses with a spurious "Season complete".** See JSON for the full trace.
Decisive lines: `seed.ts:112-122` (North Meadow plan has no `plantedAt` at
all) vs `seed.ts:387-410` (farm 2) and `:518/:589/:625/:663/:702` (farms 3-7)
which all stamp; `growth.ts:121` `if (!plantedAt) return 1;` makes every farm-1
crop mature instantly; `World3D.tsx:666/:671/:653-656/:637-641` complete the
auto-pause + drawer auto-open. Normal user plans are NOT affected: brush
(usePlanEditor.ts:574-575), rect (:644-645), line+fill (via mutateCell :748),
templates (TemplatesCard.tsx:59,:77) and 3D painting (use3DEditor → same
appliers) all stamp `plantedAt`. So the suspected P1 *mechanism* is real but
its reach is limited to seed data — and farm 1 is the default demo farm every
reviewer will open first. Screenshot w1.png corroborates: chip reads "Sep 7"
with no "· Day N", drawer rows would all read 100 %.

### P3

- **WD-2** — `seasonDay`/`playing` dead props on SimDrawer (spec §4b sanctions).
- **WD-3** — ground.ts:216-220 silently drops cells of a broken tile builder (no warn).
- **WD-4** — first achievement never toasts (`unlockedCountRef.current > 0` guard, World3D.tsx:723); rAF-unlocked achievements (dawn_patrol/night_owl/flight_time :378-402) surface only on the next unrelated re-render. Pre-existing, kept by spec.
- **WD-5** — cinema hides the save Badge incl. the `error` state (PlotDesigner.tsx:89-94); autosave still runs, exposure limited to storage failures.
- **WD-6** — closed SimDrawer is `aria-hidden` but its inputs/buttons stay tabbable (no `inert`), SimDrawer.tsx:84-90.
- **WD-7** — dead `animate-in` classes on ui/select.tsx:43 and ui/alert-dialog.tsx:16,:32 (plugin absent); cosmetic, pre-existing, now inherited by the drawer's Selects.

## Verified wired ✅

- Bottom dock: fixed child set, chip (`Sep 7` + season dot + cached badge, World3D.tsx:820-839) and action group (`▶ Simulate` min-w-96/:847, `▶ Tour`/`Stop Tour` :851-867, `✈ Fly`/`✈ Exit Flight` :868-882, `Reset view` :883-890, `Sim ▸` :892-901); no state-change reflow (labels swap in place).
- `resetToHomeView` shares `homeFrame` with init (single source of truth, :31-34, :287-293, :744-755) — Reset restores the exact load-in framing incl. azimuth/polar.
- Top-left cluster with aria-pressed on all four toggles, dynamic audio `aria-label` (:797) + title, Debug visible active state.
- Dim rule applies to exactly the two chrome wrappers; tour bar, toast, drawer exempt.
- SimDrawer: always-mounted, 320 px `z-[150]`, `translate-x-full`/`max-xl:translate-y-full` closed + `pointer-events-none`, backdrop `z-[140]`, `SelectContent z-[200]`; season banner with both recovery CTAs; date + Today; slider (drag sets Manual via SimDrawer.tsx:67-70); Auto/Manual; speed select (1/7/30) → tick effect; scenario select from `SCENARIOS` (growth.ts:13-19); per-crop rows (stage dots/%/stress>0.2) fed by memo World3D.tsx:691-713; weather footer with cached badge (SimDrawer.tsx:247-268).
- Season-complete flow mechanics: amber dot :826, auto-open once ref-guarded (:137, :637-641), guard resets on `playing` restart (:620-625) and on scenario/planVersion (:629-633); 14-day grace anchored at :651-671.
- Playback tick exactly `simSpeed` days per 1000 ms, default 1×/day (:131, :607-617).
- Init gate + mount-once effect keyed `[sceneReady, farmId]` with full dispose (16 dispose calls) — farm-to-farm nav rebuilds cleanly; StrictMode guard :228.
- Test hooks post-restructure: `?fftime` clamped 0..1 pins `timeOfDay` (autoTime starts false); `?ffdebug=1` pre-opens Perf HUD; sr-only assert line always mounted. All proven by gate EXPECT lines.
- Tour progress 1 % throttle; tour dispose/rebuild on plan change (:521-528); Escape reserved for flight; `h` cinema with typing/modifier guards and auto-exit when leaving world view.
- Blueprint regression gate green (toolbar/brush intact).
- Creative lib: 0 `Math.random`; mulberry32 `rng` (voxel.ts:178); terrain tiles and structures spot-reads seeded; crop registry covers all 50 catalog crops; procedural fallback path intact in plants.ts (makeCropFor null → fallback builder, stage guard map.ts:167).
- `ff-toast-in` real keyframes (index.css:117-121) + timeout cleanup.
- Showcase lanes A and D render and report `showcase-ready`.

## SPEC-WORLD-HUD acceptance checklist

| Criterion | Status |
|---|---|
| §3.1 Bottom dock fixed child set, pointer-events-none wrapper + auto groups, min-w Simulate | ✅ (World3D.tsx:819-903) |
| §3.2 Top-left cluster (Cinema aria-pressed / History / audio glyph+aria-label / Debug aria-pressed+active) | ✅ (:766-815; audio aria-label is dynamic "Mute/Unmute ambience" — better than spec's static label) |
| §3.3 SimDrawer 320 px right slide-over, z-150, bottom sheet <xl, backdrop z-140, contents order, always mounted, closed transform+pointer-events | ✅ (SimDrawer.tsx; Radix SelectContent z-200 per §4b) |
| §3.4 Dim rule `cinema||tour||flight`, transition-opacity, opacity-20 (§4b) + hover/focus-within restore; tour bar/toast/drawer never dimmed | ✅ code (:741-742,:767,:819); hover itself not headless-testable |
| §3.5 Season-complete: amber dot, drawer auto-open once, ref guard reset in both reset effects | ✅ mechanics; **❌ end-to-end on farm 1 (WD-1)** |
| §4 World3DProps `cinema` + `onToggleCinema` | ✅ (:36-42; PlotDesigner.tsx:111) |
| §4b integration amendments (opacity-20, z-200 SelectContent, chip inside dock, props contract keeps seasonDay/playing) | ✅ (WD-2 logged as sanctioned debt) |
| §4 SimDrawerProps contract (all fields, controlled, no state/effects/api) | ✅ (SimDrawer.tsx:16-66; zero state/effects/imports beyond UI) |
| §4 appshot contract text `Simulate`/`Tour`/`Reset view` + sr-only `Sim controls:` | ✅ (gates 1/3/5 + :764) |
| §PlotDesigner cinema state, `h` key guards, auto-exit on leaving world, hide toolbar/sidebar/Badge, keep back/title/ViewToggle, grid collapse, layout invariants | ✅ (PlotDesigner.tsx:38,:46-63,:74-125; root `xl:h-full xl:min-h-0` :74, canvas card :98) — Badge hidden incl. `error` state (WD-5, P3) |
| §index.css real `ff-toast-in` keyframes, translate(-50%) baked, applied + cleanup | ✅ (index.css:117-121; World3D.tsx:946,:733-737) |
| §5 lead checklist (delete old footer, throttle tour, reset helper, a11y, no new init-effect keys) | ✅ (footer gone; :365-372; :744-755; :473 deps unchanged) |
| §6 traps (test hooks once, no plan writes in HUD, refs for rAF, z-order, Escape/h split, `h-[60dvh] min-h-[320px]` :760, no animate-in, noUnusedLocals) | ✅ |
| §7 verification gates | ✅ all five re-run green by this audit (plus showcase ×2) |

Score: **14/15 criteria ✅** (season-complete flow fails end-to-end only via WD-1's seed data).

## Could not test

- Live pointer interactions (tour hover-undim, WASD flight feel, wheel-over-drawer no-hijack, 3D paint + undo) — headless harness has no input synthesis; covered by traces instead. 0 live shots used.
- Showcase lanes B and C (budget: 7/8 appshots used; A and D both pass).
- Hover/focus opacity restore on the dimmed wrappers (CSS behavior, not assertable headlessly).

Screenshots: `/var/folders/pr/ny57nkls6_3cdvtsdrcr2rpm0000gn/T/ffqa-world/{w1,w2,w3,w4,w5,laneA,laneD}.png`.
