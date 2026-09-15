# SPEC — World 3D HUD: Sim Pill, Sim Drawer, Cinema Mode

Status: APPROVED for implementation · 2026-09-06 · Branch `pro-upgrade`
Owners: lead (World3D restructure + integration), Sub A (SimDrawer), Sub B (PlotDesigner cinema + toast CSS)

## 1. Problem

The 3D world view buries the scene under chrome:

- One wrapping bottom bar (`World3D.tsx:704-922`) holds 13+ controls and covers
  40–50% of the canvas; wraps to 2–3 bands below 1440px.
- The bar **reflows during use** (Season-complete chip, Day N, async weather chip,
  Simulate label swap shift every button under the cursor).
- The per-crop growth list (`max-h-24 overflow-y-auto`, 15 rows) **hijacks wheel
  scroll** over the canvas bottom-center.
- Blueprint-only controls (Fit/PNG/CSV/Spacing/Companions) and the full designer
  sidebar stay visible while the user is watching the world.
- "Season complete" auto-pause is unexplained (title-only tooltip) with no
  recovery affordance; "Reset view" does not restore the load-in camera framing
  (`maxDim*0.6`/`d*0.5` vs init `maxDim*0.75+2`/`max(d*0.55,3)`).
- Tour progress drives `setTourProgress` **every rAF frame** (60 re-renders/s of
  the footer). Achievement toast animation classes are dead
  (`tailwindcss-animate` not installed). Audio button has no `aria-label`.

## 2. Goals / Non-goals

**Goals**: the 3D scene is the spotlight; every existing capability stays ≤ 2
clicks; zero state-change reflow of the persistent chrome; blueprint view and
all test hooks (`?ffview`, `?fftime`, `?ffdebug`, appshot `--expect`) unchanged.

**Non-goals**: radial wheel menu (rejected: 250–400 lines, poor fit for sim
detail controls, touch/a11y cost); localStorage persistence of HUD prefs (future);
new npm dependencies; any change to `usePlanEditor`, `src/three/*`, `renderPlan`,
or the blueprint view.

## 3. Target UX (World3D canvas container)

```
┌──────────────────────────────────────────────────────────┐
│ ⛶ Cinema  History  🔊  Debug   ← top-left cluster        │
│                 [tour progress bar / toast: top-center]  │
│                                                          │
│                    3 D  S C E N E                        │
│                                                          │
│              ┌──────────────────────────────┐            │
│              │ ● Sep 6 · Day 42 │ ▶Simulate │            │
│              │  (status btn)    │ ▶Tour ✈Fly│            │
│              │                  │ Reset Sim▸│            │
│              └──── bottom dock ─────────────┘            │
│                                          ┌─Sim drawer────┤
│                                          │ (320px right  │
│                                          │  slide-over;  │
│                                          │  bottom sheet │
│                                          │  below xl)    │
└──────────────────────────────────────────────────────────┘
```

1. **Bottom dock** — ONE `absolute bottom-3 inset-x-3 flex flex-wrap items-end
   justify-center gap-2` wrapper (pointer-events-none) containing two
   pointer-events-auto groups. **Fixed child set — never add/remove children on
   state change**; labels swap in place (`min-w` on Simulate to stop jitter).
   - Status button (chip style): `Sep 6 · Day 42` + season dot
     (green=growing, amber=`seasonComplete`); weather-cached appends a muted
     "cached" chip. Click → opens drawer.
   - Action group: `▶ Simulate/⏸ Pause` · `▶ Tour/Stop Tour` · `✈ Fly/✈ Exit
     Flight` · `Reset view` · `Sim ▸` (opens drawer).
2. **Top-left cluster** — `Cinema` (aria-pressed), `Show/Hide History`,
   audio toggle (glyph 🔊/🔇 + `aria-label="Ambience sound"`), `Debug`
   (aria-pressed + visible active state). Top-LEFT because the perf HUD owns
   top-right (`perf.ts` zIndex 100).
3. **Sim drawer** (Sub A) — controlled, presentational. Desktop: right
   slide-over 320px, `z-[150]` (above perf HUD), inside the canvas container.
   Below xl: bottom sheet `inset-x-0 bottom-0 max-h-[55dvh]`. Closes via X and
   a transparent backdrop (z-[140]). Contents top→bottom: season banner
   (seasonComplete only; explanation + `Jump to season start` + `Keep
   watching`), date row (native date input + `Today`), time-of-day (`ui/slider`
   full-width + Auto/Manual toggle), speed select (`ui/select`: 1×/day, 1×/week,
   1×/month), scenario select (`ui/select` from `SCENARIOS`), per-crop growth
   list (`flex-1 overflow-y-auto`, one row per unique crop: name, ●●●●●○
   stage dots, %, "stress" hint >0.2), weather footer (desc, temp, wind,
   precip, humidity, cloud + cached badge). Drawer stays MOUNTED, slides via
   `transition-transform`; closed = `pointer-events-none` + off-canvas
   transform (`translate-x-full` / `max-xl:translate-y-full`).
4. **Dim rule** — `dimmed = cinema || tourActive || flightActive`. Dock and
   top-left cluster get `transition-opacity duration-300` +
   `opacity-15 hover:opacity-100 focus-within:opacity-100` when dimmed. Tour
   progress bar, toast, and drawer are NEVER dimmed.
5. **Season-complete flow** — dot turns amber; drawer auto-opens ONCE per
   completion (ref-guarded; guard resets wherever `seasonComplete` resets:
   `playing` restart and `scenario`/`planVersion` effects).

## 4. Contracts

### World3DProps (lead, pre-wired before subs spawn)

```ts
interface World3DProps {
  editor: PlanEditor;
  /** Cinema mode: persistent chrome auto-dims (PlotDesigner owns the state). */
  cinema?: boolean;
  /** Parent handler for the in-world Cinema button (PlotDesigner owns state). */
  onToggleCinema?: () => void;
}
```

## 4b. Integration amendments (as shipped)

- `onToggleCinema` added to `World3DProps` (above): the ⛶ Cinema button lives
  in the world top-left cluster AND needs to flip PlotDesigner state; PlotDesigner
  passes `onToggleCinema={() => setCinema((c) => !c)}`.
- Dim class uses `opacity-20` (not 15 — outside the default Tailwind scale).
- Drawer Radix `SelectContent` carries `className="z-[200]"`: Radix portals to
  `document.body` at z-50, which rendered **behind** the z-[150] drawer panel —
  found in live QA, fixed at the call site (`cn` = tailwind-merge).
- Status chip ships INSIDE the bottom dock container (chip button + action
  group as siblings under one fixed-set wrapper) rather than as a separate
  bottom-left element, so narrow widths wrap as one unit and can never collide.
- SimDrawer keeps `playing`/`seasonDay` on the props contract (unused in the
  drawer body to satisfy `noUnusedLocals`) so the parent wiring stays stable.

### SimDrawerProps (Sub A — new file `src/components/world/SimDrawer.tsx`)

```ts
import type { ScenarioType, WeatherCurrent } from '@/types';

export interface CropProgressRow {
  id: number;
  name: string;
  stage: number;   // 0..5
  pct: number;     // 0..100
  stress: number;  // 0..1
}

export interface SimDrawerProps {
  open: boolean;
  onClose: () => void;
  scrubDate: string;               // ISO yyyy-mm-dd
  onScrubDate: (iso: string) => void;
  onToday: () => void;
  seasonDay: number | null;        // null = nothing planted
  seasonComplete: boolean;
  onJumpSeasonStart: () => void;   // rendered only when seasonComplete
  onDismissSeason: () => void;     // "Keep watching"
  timeOfDay: number;               // 0..1
  onTimeOfDay: (v: number) => void;
  autoTime: boolean;
  onAutoTime: (v: boolean) => void;
  playing: boolean;
  simSpeed: 1 | 7 | 30;
  onSimSpeed: (v: 1 | 7 | 30) => void;
  scenario: ScenarioType;
  onScenario: (s: ScenarioType) => void;
  weather: WeatherCurrent | null;
  weatherCached: boolean;
  cropProgress: CropProgressRow[];
}
```

State ownership: ALL sim state stays in World3D (`scrubDate`, `timeOfDay`,
`autoTime`, `playing`, `simSpeed`, `scenario`, `showHistory`, `audioOn`,
`showDebug`, `drawerOpen`, `seasonComplete`). SimDrawer is fully controlled —
no state, no effects, no api imports. Drawer label strings keep the appshot
contract: visible text `Simulate`, `Tour`, `Reset view` in the dock; an
always-mounted `sr-only` line in World3D: `Sim controls: date, time of day,
speed, scenario, per-crop growth` (assertable via `--expect "Sim controls"`).

### PlotDesigner (Sub B)

- `const [cinema, setCinema] = useState(false)`; auto-exit cinema when
  `viewMode` leaves `'world'`.
- `h` key toggles cinema ONLY while `viewMode === 'world'`; ignore events from
  typing targets (input/textarea/select/contentEditable) and any modifier.
  Never use Escape (flight owns it).
- While `cinema && viewMode==='world'`: hide `DesignerToolbar`, the right
  sidebar column, and the save Badge. Keep back button, title, ViewToggle.
  Grid collapses to one column. Root/card layout invariants preserved:
  root `flex flex-col … xl:h-full xl:min-h-0`, canvas card
  `flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card`.
- Pass `cinema={cinema}` to `World3D`.

### index.css (Sub B)

Add real toast entrance (replaces dead `animate-in slide-in-from-top-2`):

```css
@keyframes ff-toast-in {
  from { opacity: 0; transform: translate(-50%, -8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
.ff-toast-in { animation: ff-toast-in 200ms ease-out; }
```

`translate(-50%, …)` is baked in because the toast container uses
`-translate-x-1/2`. Lead applies `ff-toast-in` in World3D.

## 5. Lead — World3D.tsx restructure checklist

- Delete the entire old footer (lines ~709-899) incl. date pill, time pill,
  simulate panel, growth list, weather chip.
- Build dock + top-left cluster per §3 with dim rule; wire SimDrawer (mounted
  always, `open={drawerOpen}`).
- `resetToHomeView()` helper replicates INIT framing exactly
  (`dist = maxDim*0.75 + 2`; pos `(dist*0.7, max(dist*0.55,3), dist*0.7)`;
  target origin; azimuth `-PI/4`; polar `PI/3.5`); used by the dock Reset
  button. Optionally reuse in the init effect so there is ONE source of truth.
- Throttle tour progress: only `setTourProgress` when `|p − last| > 0.01`.
- Season-complete: amber dot, auto-open drawer once (ref guard, reset in the
  two existing reset effects).
- A11y: `aria-pressed` on all toggle buttons; audio `aria-label`; `title`
  tooltips on dock buttons; Simulate `min-w-[96px]`.
- Toast: `ff-toast-in` class + `clearTimeout` on effect cleanup.
- Keep: mount-once init effect deps `[sceneReady, farmId]`; ref-mirror pattern
  for anything rAF reads; tour progress bar; achievement toast; all existing
  state/effects/logic untouched.

## 6. Traps (all agents)

1. Test hooks read ONCE on mount — do not move `readLaunchParams` logic.
2. appshot `--expect` matches serialized DOM: dock keeps visible text
   `Simulate`/`Tour`/`Reset view`; sr-only drawer summary stays always-mounted;
   CSS-hidden OK, unmounted NOT.
3. No plan mutations outside `usePlanEditor` — HUD owns zero plan writes.
4. Anything rAF reads goes through a ref (dim flag is render-only; safe).
5. Never key the init effect on anything new; do not add HUD state to its deps.
6. Perf HUD owns top-right z-100; drawer z-[150], backdrop z-[140].
7. Escape is flight's; `h` is cinema's; tool hotkeys v/b/r/l/g/i/a/e and
   `[`/`]` must keep working.
8. Canvas sizing invariants below xl: `h-[60dvh] min-h-[320px]` stays.
9. TS strict + noUnusedLocals/Parameters — unused imports fail the build.
10. `tailwindcss-animate` is NOT installed — never use `animate-in` classes.

## 7. Verification gates (lead, after integration)

```bash
npm run typecheck
npm run build
mkdir -p "$TMPDIR/ff-hud-qa"
node tools/appshot.mjs "http://localhost:5173/?ffview=world&fftime=0.4#/farms/1/map" "$TMPDIR/ff-hud-qa/world-pill.png" 1440x900 --gate --expect "Simulate"
node tools/appshot.mjs "http://localhost:5173/?ffview=world&fftime=0.05&ffdebug=1#/farms/1/map" "$TMPDIR/ff-hud-qa/world-night-debug.png" 1440x900 --gate --expect "FPS:"
node tools/appshot.mjs "http://localhost:5173/?ffview=world#/farms/1/map" "$TMPDIR/ff-hud-qa/world-tablet.png" 820x1180 --gate --expect "Simulate"
node tools/appshot.mjs "http://localhost:5173/#/farms/1/map" "$TMPDIR/ff-hud-qa/blueprint-regression.png" 1440x900 --gate --expect "Brush"
node tools/appshot.mjs "http://localhost:5173/?ffview=world#/farms/6/map" "$TMPDIR/ff-hud-qa/world-farm6.png" 1440x900 --gate --expect "Simulate"
```

(appshot Chrome exit codes are meaningless by design — trust GATE/EXPECT lines.)

Live click-through (in-app browser): simulate w/o control movement; season-end
drawer auto-open once + recovery CTAs; tour dims chrome, undims on hover/end;
`h` cinema toggle; Escape exits flight only; wheel zooms everywhere (no list
hijack); paint a cell in 3D + undo; blueprint identical; before/after screenshots
at 1440×900 and 1150×760 via `tools/appshot-live.mjs`.

Acceptance: all gates green + every checklist item verified visually.
