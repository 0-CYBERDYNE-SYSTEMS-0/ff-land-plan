// Run lifecycle for deterministic sim runs (quality/SPEC-SIM-ECOSYSTEM §3.1
// useSimRun). This hook is the single owner of sim ticking — the
// usePlanEditor of runs: every transport mutation (play/pause/speed/seek/
// stop/start) goes through here, and the render path reads `simStateRef`
// (the weatherRef pattern: what the rAF loop reads must be a ref).
//
// Clock law (spec §3.4): real time (rAF dt, clamped ≤ 0.25 s so a resume
// burst after a hidden tab can't fast-forward) → sim time (whole-day
// accumulator) → stepDay. NEVER setInterval: rAF pauses with the hidden tab,
// so the run pauses with the world. React commits are throttled to ~5/s;
// simStateRef is the source of truth for rendering between commits.
//
// Determinism: replay folds stepDay over record.envSeries + record.config
// ONLY — no live fetches inside the tick loop. The soil/crops SimRunCtx is
// loaded once per startRun (fetchSoilProfile + apiFetch.listCrops are both
// cached and never throw) so the replay matches the summary computed at
// createSimRun time byte-for-byte.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Crop } from '@/types';
import { apiFetch } from '@/lib/api';
import { fetchSoilProfile } from '@/lib/soil';
import {
  bucketCapacityMm,
  createRun,
  gddRequiredC,
  isoDayNumber,
  isoFromDayNumber,
  soilWaterParams,
  stepDay,
} from '@/lib/sim';
import type {
  DailyEnvironment,
  EnvSourceTag,
  Intervention,
  RunRecord,
  SimEvent,
  SimRunCtx,
  SimState,
} from '@/lib/sim';

// ---------------------------------------------------------------------------
// Public types (UI-local prop shapes — lib/sim/types stays untouched)
// ---------------------------------------------------------------------------

/** Timeline for the RunInspector seek slider: intervention ticks + event dots
 * keyed by run day index. Derived ONCE per run by a deterministic full fold
 * (and re-derived after each in-session intervention amendment). */
export interface SimRunTimeline {
  days: number;
  dayIndex: number;
  interventions: {
    day: number;
    kind: string;
    /** ISO date the intervention lands on (fromDate for 'weather'). */
    date?: string;
    /** irrigate amount, mm. */
    mm?: number;
    /** fertilize amount, kg/ha N. */
    nKgHa?: number;
  }[];
  events: { day: number; kind: string }[];
}

/** Result of authoring one intervention on the ACTIVE run. The RunInspector
 * flashes this back (confirmation / reason + the past-days hint). */
export interface ApplyInterventionResult {
  ok: boolean;
  /** Set when ok is false — human-readable rejection reason. */
  error?: string;
  /** Run day index (0-based) the intervention landed on. */
  day?: number;
  /** True when the intervention date falls on an already-stepped day: the
   * refold rewrote history — EXPECTED for a digital twin (the UI says so). */
  affectsPastDays?: boolean;
}

/** One "crop · sow date" row for the drawer, aggregated from live SimState
 * (structurally compatible with SimDrawer's CropProgressRow). */
export interface RunProgressRow {
  id: number;
  name: string;
  label?: string;
  plantedAt: string;
  stage: number;
  pct: number;
  stress: number;
}

/** The "why" breakdown behind one RunProgressRow (spec §3.3): every term
 * carries its number and — where it traces to weather — its source tag. */
export interface CellDiagnosticRow {
  cropId: number;
  plantedAt: string;
  cropName: string;
  gddAccumC: number;
  gddRequiredC: number;
  moistureFrac: number;
  awcMmPerCm: number;
  rootDepthCm: number;
  awcCapMm: number;
  bucketMm: number;
  nitrogenKgHa: number;
  stress: { water: number; heat: number; cold: number; nitrogen: number };
  todayGddC: number;
  todayEtMm: number;
  todayTMinC: number;
  todayTMaxC: number;
  cropMinTempC: number;
  cropMaxTempC: number;
  sources: { temp: EnvSourceTag; precip: EnvSourceTag; eto: EnvSourceTag };
}

/** Notable-event sink: fired once per stepped sim day with that day's events
 * (harvest-ready, stress-onset, …) and the post-step state. World3D uses it
 * for the long-dead harvest celebration. */
export type SimRunEventsHandler = (events: SimEvent[], state: SimState) => void;

export interface SimRunController {
  record: RunRecord | null;
  /** Throttled mirror of simStateRef.current.dayIndex (~5 commits/s). */
  dayIndex: number;
  playing: boolean;
  /** Simulated days per real second. */
  speed: number;
  /** True once the run stepped past its last env day (or was seeked there). */
  ended: boolean;
  /** Bumped on every React-visible sim-state change; run-mode UI keys off it. */
  tickVersion: number;
  /** Soil + crops context used for the replay (null until loaded). */
  ctx: SimRunCtx | null;
  timeline: SimRunTimeline | null;
  /** THE render-path source of truth — read this from rAF/effects, not state. */
  simStateRef: RefObject<SimState | null>;
  startRun: (record: RunRecord) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (daysPerSec: number) => void;
  seekDay: (day: number) => void;
  stopRun: () => void;
  /** Author an intervention on the ACTIVE run (spec §3.2/§3.3 in-world
   * authoring): amends config.interventions IN MEMORY (sorted by date — the
   * config stays the single determinism source) and refolds deterministically
   * to the CURRENT dayIndex via replayTo. Weather interventions are baked
   * into envSeries at compose time and are rejected; everything else
   * synchronously recomputes history (that is the point of a twin). */
  applyIntervention: (iv: Intervention) => ApplyInterventionResult;
  /** True once config.interventions diverge from the stored RunRecord
   * (session-only: nothing is persisted over the record). */
  unsavedChanges: boolean;
}

const COMMIT_INTERVAL_MS = 200; // ~5 React commits/s; refs carry the rest
const MAX_SPEED_DAYS_PER_SEC = 60;
const MIN_SPEED_DAYS_PER_SEC = 0.25;

// ---------------------------------------------------------------------------
// Pure helpers shared with the run-mode surfaces (World3D / RunInspector)
// ---------------------------------------------------------------------------

/** ISO date of the run's current day (dayIndex 0 = config.startDate). */
export function runDateISO(record: RunRecord, dayIndex: number): string {
  return isoFromDayNumber(isoDayNumber(record.config.startDate) + dayIndex);
}

/** The date an intervention keys on (weather overrides use fromDate). */
function ivDateOf(iv: Intervention): string {
  return iv.kind === 'weather' ? iv.fromDate : iv.date;
}

/** The environment driving the CURRENT state: the last completed day's entry
 * (dayIndex counts completed steps). Null only for an empty series. */
export function runDayEnv(record: RunRecord, dayIndex: number): DailyEnvironment | null {
  const n = record.envSeries.length;
  if (n === 0) return null;
  return record.envSeries[Math.min(Math.max(dayIndex - 1, 0), n - 1)] ?? null;
}

interface CellAgg {
  cropId: number;
  plantedAtDay: number;
  biomass: number;
  stage: number;
  stressWater: number;
  stressHeat: number;
  stressCold: number;
  stressNitrogen: number;
  moistureSum: number;
  nitrogenSum: number;
  gddAccum: number;
  count: number;
}

function aggregateCells(state: SimState): CellAgg[] {
  const groups = new Map<string, CellAgg>();
  for (const cell of Object.values(state.cells)) {
    const key = `${cell.cropId}|${cell.plantedAtDay}`;
    const g = groups.get(key);
    if (g) {
      g.biomass = Math.max(g.biomass, cell.biomassFrac);
      g.stage = Math.max(g.stage, cell.stage);
      g.stressWater = Math.max(g.stressWater, cell.stress.water);
      g.stressHeat = Math.max(g.stressHeat, cell.stress.heat);
      g.stressCold = Math.max(g.stressCold, cell.stress.cold);
      g.stressNitrogen = Math.max(g.stressNitrogen, cell.stress.nitrogen);
      g.moistureSum += cell.moistureFrac;
      g.nitrogenSum += cell.nitrogenKgHa;
      g.gddAccum = Math.max(g.gddAccum, cell.gddAccumC);
      g.count++;
    } else {
      groups.set(key, {
        cropId: cell.cropId,
        plantedAtDay: cell.plantedAtDay,
        biomass: cell.biomassFrac,
        stage: cell.stage,
        stressWater: cell.stress.water,
        stressHeat: cell.stress.heat,
        stressCold: cell.stress.cold,
        stressNitrogen: cell.stress.nitrogen,
        moistureSum: cell.moistureFrac,
        nitrogenSum: cell.nitrogenKgHa,
        gddAccum: cell.gddAccumC,
        count: 1,
      });
    }
  }
  return [...groups.values()];
}

/** Drawer crop rows derived from live SimState (run mode). Grouped by
 * (crop, plantedAtDay) — the same crop sown on two run days is two rows. */
export function buildRunProgressRows(
  state: SimState,
  startDate: string,
  cropById: Map<number, Crop>,
): RunProgressRow[] {
  const start = isoDayNumber(startDate);
  const rows: RunProgressRow[] = [];
  for (const g of aggregateCells(state)) {
    const crop = cropById.get(g.cropId);
    if (!crop) continue;
    const plantedAt = isoFromDayNumber(start + g.plantedAtDay);
    const d = new Date(`${plantedAt}T00:00:00`);
    const stress = Math.max(g.stressWater, g.stressHeat, g.stressCold, g.stressNitrogen);
    rows.push({
      id: g.cropId,
      name: crop.name,
      label: Number.isFinite(d.getTime())
        ? `${crop.name} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : crop.name,
      plantedAt,
      stage: g.stage,
      pct: Math.round(g.biomass * 100),
      stress: Math.round(stress * 100) / 100,
    });
  }
  return rows.sort(
    (a, b) => a.name.localeCompare(b.name) || a.plantedAt.localeCompare(b.plantedAt),
  );
}

/** "Why" diagnostics per run progress row (keys align: cropId|plantedAt). */
export function buildCellDiagnostics(
  state: SimState,
  record: RunRecord,
  cropById: Map<number, Crop>,
  dayEnv: DailyEnvironment | null,
  soil: SimRunCtx['soil'],
): CellDiagnosticRow[] {
  const params = soilWaterParams(soil?.awcMmPerCm);
  const capacity = bucketCapacityMm(params);
  const env = dayEnv ?? record.envSeries[0] ?? null;
  const start = isoDayNumber(record.config.startDate);
  const rows: CellDiagnosticRow[] = [];
  for (const g of aggregateCells(state)) {
    const crop = cropById.get(g.cropId);
    if (!crop) continue;
    rows.push({
      cropId: g.cropId,
      plantedAt: isoFromDayNumber(start + g.plantedAtDay),
      cropName: crop.name,
      gddAccumC: g.gddAccum,
      gddRequiredC: gddRequiredC(crop, record.config.meanDailyGddC),
      moistureFrac: g.count > 0 ? g.moistureSum / g.count : 0,
      awcMmPerCm: params.awcMmPerCm,
      rootDepthCm: params.rootDepthCm,
      awcCapMm: capacity,
      bucketMm: (g.count > 0 ? g.moistureSum / g.count : 0) * capacity,
      nitrogenKgHa: Math.round((g.count > 0 ? g.nitrogenSum / g.count : 0) * 10) / 10,
      stress: {
        water: g.stressWater,
        heat: g.stressHeat,
        cold: g.stressCold,
        nitrogen: g.stressNitrogen,
      },
      todayGddC: env?.gddBase10C ?? 0,
      todayEtMm: env?.etoMm ?? 0,
      todayTMinC: env?.tMinC ?? 0,
      todayTMaxC: env?.tMaxC ?? 0,
      cropMinTempC: crop.minTempC,
      cropMaxTempC: crop.maxTempC,
      sources: {
        temp: env?.provenance.tMaxC ?? 'default',
        precip: env?.provenance.precipMm ?? 'default',
        eto: env?.provenance.etoMm ?? 'default',
      },
    });
  }
  return rows.sort(
    (a, b) => a.cropName.localeCompare(b.cropName) || a.plantedAt.localeCompare(b.plantedAt),
  );
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useSimRun(opts: {
  onEvents?: SimRunEventsHandler;
  /** Farm coordinates — fallback when a RunRecord lacks config.lat/lng so
   *  replay soil matches what createSimRun used (records from current writers
   *  always carry coords; this guards older/manual records). */
  farmCoords?: { lat: number; lng: number };
} = {}): SimRunController {
  // Latest-handler ref: transport callbacks stay stable across renders even
  // when the caller passes a fresh arrow function each time.
  const onEventsRef = useRef<SimRunEventsHandler | undefined>(opts.onEvents);
  onEventsRef.current = opts.onEvents;
  const farmCoordsRef = useRef(opts.farmCoords);
  farmCoordsRef.current = opts.farmCoords;

  const [record, setRecord] = useState<RunRecord | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(7); // days per real second
  const [ended, setEnded] = useState(false);
  const [tickVersion, setTickVersion] = useState(0);
  const [ctx, setCtx] = useState<SimRunCtx | null>(null);
  const [timeline, setTimeline] = useState<SimRunTimeline | null>(null);
  // Session-only divergence marker: the amended config lives in memory, the
  // stored RunRecord is never rewritten by authoring (see applyIntervention).
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Refs — the render path and the rAF loop read THESE.
  const simStateRef = useRef<SimState | null>(null);
  const recordRef = useRef<RunRecord | null>(null);
  const ctxRef = useRef<SimRunCtx | null>(null);
  const dayIndexRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(speed);
  const rafRef = useRef<number | null>(null);
  const accumRef = useRef(0); // fractional sim-days since the last whole step
  const lastCommitRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null); // seek before ctx landed
  const loadIdRef = useRef(0); // supersedes in-flight ctx loads

  const maybeCommit = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - lastCommitRef.current < COMMIT_INTERVAL_MS) return;
    lastCommitRef.current = now;
    setDayIndex(dayIndexRef.current);
    setTickVersion((v) => v + 1);
  }, []);

  // Advance exactly one sim day. Returns false when the run cannot continue
  // (no record/state, series exhausted, or just ended).
  const stepOnce = useCallback((): boolean => {
    const rec = recordRef.current;
    const st = simStateRef.current;
    if (!rec || !st) return false;
    const env = rec.envSeries[dayIndexRef.current];
    if (!env) return false;
    const { state, events } = stepDay(st, env, rec.config, ctxRef.current ?? {});
    simStateRef.current = state;
    dayIndexRef.current = state.dayIndex;
    if (events.length > 0) onEventsRef.current?.(events, state);
    if (state.dayIndex >= rec.envSeries.length) {
      playingRef.current = false;
      setPlaying(false);
      setEnded(true);
      maybeCommit(true);
      return false;
    }
    return true;
  }, [maybeCommit]);

  const stopTicking = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    accumRef.current = 0;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    let last = performance.now();
    const loop = (now: number) => {
      rafRef.current = null;
      if (!playingRef.current) return;
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      accumRef.current += dt * speedRef.current;
      let stepped = false;
      while (accumRef.current >= 1) {
        accumRef.current -= 1;
        stepped = true;
        if (!stepOnce()) {
          accumRef.current = 0; // run ended mid-burst
          break;
        }
      }
      if (stepped) maybeCommit();
      if (playingRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [maybeCommit, stepOnce]);

  /** Deterministic re-fold from day 0 to `targetDay` (milliseconds for a
   * season). Seeking never fires onEvents — celebrations are for live steps. */
  const replayTo = useCallback(
    (targetDay: number) => {
      const rec = recordRef.current;
      if (!rec) return;
      const runCtx = ctxRef.current ?? {};
      const n = Math.min(Math.max(0, Math.round(targetDay)), rec.envSeries.length);
      let st = createRun(rec.config, runCtx);
      for (let i = 0; i < n; i++) {
        st = stepDay(st, rec.envSeries[i]!, rec.config, runCtx).state;
      }
      simStateRef.current = st;
      dayIndexRef.current = st.dayIndex;
      accumRef.current = 0;
      setEnded(n >= rec.envSeries.length);
      if (playingRef.current && n >= rec.envSeries.length) stopTicking();
      maybeCommit(true);
    },
    [maybeCommit, stopTicking],
  );

  const startRun = useCallback(
    (rec: RunRecord) => {
      stopTicking();
      loadIdRef.current += 1;
      const loadId = loadIdRef.current;
      recordRef.current = rec;
      setRecord(rec);
      setEnded(false);
      setUnsavedChanges(false);
      simStateRef.current = null;
      dayIndexRef.current = 0;
      pendingSeekRef.current = null;
      setTimeline(null);
      setDayIndex(0);
      maybeCommit(true);
      // Replay context (soil AWC/OM + full crop list incl. custom crops) —
      // the SAME inputs createSimRun used, so the fold matches its summary.
      // Both calls are cached-forever + never-throw.
      void Promise.all([
        fetchSoilProfile(
          rec.config.lat ?? farmCoordsRef.current?.lat ?? 0,
          rec.config.lng ?? farmCoordsRef.current?.lng ?? 0,
        ),
        apiFetch.listCrops(),
      ]).then(([soil, crops]) => {
        if (loadId !== loadIdRef.current) return; // superseded by stop/start
        const runCtx: SimRunCtx = { soil, crops };
        ctxRef.current = runCtx;
        setCtx(runCtx);
        const target = pendingSeekRef.current ?? 0;
        pendingSeekRef.current = null;
        replayTo(target);
        setTimeline(buildTimeline(rec, runCtx));
      });
    },
    [maybeCommit, replayTo, stopTicking],
  );

  const play = useCallback(() => {
    const rec = recordRef.current;
    if (!rec || !simStateRef.current) return; // not loaded yet
    if (dayIndexRef.current >= rec.envSeries.length) return; // already complete
    playingRef.current = true;
    setPlaying(true);
    setEnded(false);
    accumRef.current = 0;
    startLoop();
  }, [startLoop]);

  const pause = useCallback(() => {
    stopTicking();
  }, [stopTicking]);

  const setSpeed = useCallback((daysPerSec: number) => {
    const v = Number.isFinite(daysPerSec)
      ? Math.min(MAX_SPEED_DAYS_PER_SEC, Math.max(MIN_SPEED_DAYS_PER_SEC, daysPerSec))
      : 1;
    speedRef.current = v;
    setSpeedState(v);
  }, []);

  const seekDay = useCallback(
    (day: number) => {
      const rec = recordRef.current;
      if (!rec) return;
      if (!ctxRef.current) {
        pendingSeekRef.current = day; // applied once the replay context lands
        return;
      }
      replayTo(day);
    },
    [replayTo],
  );

  // Persistence note (intervention authoring): there is deliberately NO save
  // path here. apiFetch.createSimRun re-forks the CURRENT live plan and
  // recomposes envSeries, which would break the frozen-provenance contract
  // this run replay relies on; a dedicated `saveSimRun(amendedRecord)` seam
  // in the Api implementations is the follow-up. Until then amendments are
  // session-only, surfaced by `unsavedChanges`.

  /** Amend the ACTIVE run's interventions and deterministically refold to the
   * CURRENT day (dayIndex never visually resets; the moisture overlay and
   * why-panel update via the tickVersion commit replayTo forces). Env series
   * is untouched: 'weather' interventions were baked in at compose time and
   * are rejected here. replayTo fires no onEvents, so refolded history never
   * triggers celebrations — those stay live-step-only. */
  const applyIntervention = useCallback((iv: Intervention): ApplyInterventionResult => {
    const rec = recordRef.current;
    if (!rec) return { ok: false, error: 'No active run.' };
    if (iv.kind === 'weather') {
      return {
        ok: false,
        error: 'Weather overrides are baked into this run’s environment series and cannot be authored here.',
      };
    }
    if (iv.kind !== 'irrigate' && iv.kind !== 'fertilize') {
      return { ok: false, error: 'Only irrigate and fertilize interventions can be authored here.' };
    }
    const amount = iv.kind === 'irrigate' ? iv.mm : iv.nKgHa;
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        error: iv.kind === 'irrigate'
          ? 'Irrigation needs a positive mm amount.'
          : 'Fertilizing needs a positive kg/ha N amount.',
      };
    }
    const runCtx = ctxRef.current;
    if (!runCtx) return { ok: false, error: 'Run context still loading — try again in a moment.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iv.date)) {
      return { ok: false, error: 'Pick a date inside the run season.' };
    }
    const start = isoDayNumber(rec.config.startDate);
    const dayNum = isoDayNumber(iv.date);
    const end = start + rec.envSeries.length - 1;
    if (dayNum < start) {
      return { ok: false, error: `${iv.date} is before this run starts (${rec.config.startDate}).` };
    }
    if (dayNum > end) {
      return { ok: false, error: `${iv.date} is after this run ends (${isoFromDayNumber(end)}).` };
    }

    // Amend IN MEMORY and re-fold to the SAME day: identical configs replay
    // byte-identically (stable sort keeps same-day insertion order fixed).
    const amended: RunRecord = {
      ...rec,
      config: {
        ...rec.config,
        interventions: [...rec.config.interventions, iv].sort(
          (a, b) => isoDayNumber(ivDateOf(a)) - isoDayNumber(ivDateOf(b)),
        ),
      },
    };
    const targetDay = dayIndexRef.current;
    recordRef.current = amended;
    setRecord(amended);
    setUnsavedChanges(true);
    replayTo(targetDay);
    setTimeline(buildTimeline(amended, runCtx));
    return {
      ok: true,
      day: dayNum - start,
      affectsPastDays: dayNum - start < targetDay,
    };
  }, [replayTo]);

  const stopRun = useCallback(() => {
    loadIdRef.current += 1;
    stopTicking();
    recordRef.current = null;
    ctxRef.current = null;
    simStateRef.current = null;
    dayIndexRef.current = 0;
    pendingSeekRef.current = null;
    setRecord(null);
    setCtx(null);
    setTimeline(null);
    setEnded(false);
    setUnsavedChanges(false);
    setDayIndex(0);
    maybeCommit(true);
  }, [maybeCommit, stopTicking]);

  // Cancel the loop + in-flight load on unmount.
  useEffect(() => {
    return () => {
      loadIdRef.current += 1;
      playingRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return useMemo<SimRunController>(
    () => ({
      record,
      dayIndex,
      playing,
      speed,
      ended,
      tickVersion,
      ctx,
      timeline,
      simStateRef,
      startRun,
      play,
      pause,
      setSpeed,
      seekDay,
      stopRun,
      applyIntervention,
      unsavedChanges,
    }),
    [record, dayIndex, playing, speed, ended, tickVersion, ctx, timeline, startRun, play, pause, setSpeed, seekDay, stopRun, applyIntervention, unsavedChanges],
  );
}

/** Full deterministic fold collecting per-day events + intervention days for
 * the RunInspector timeline. Runs once per startRun, after ctx lands. */
function buildTimeline(rec: RunRecord, ctx: SimRunCtx): SimRunTimeline {
  const start = isoDayNumber(rec.config.startDate);
  const days = rec.envSeries.length;
  const interventions: SimRunTimeline['interventions'] = [];
  for (const iv of rec.config.interventions) {
    const iso = ivDateOf(iv);
    const day = isoDayNumber(iso) - start;
    interventions.push({
      day: Math.min(days, Math.max(0, day)),
      kind: iv.kind,
      date: iso,
      ...(iv.kind === 'irrigate' ? { mm: iv.mm } : {}),
      ...(iv.kind === 'fertilize' ? { nKgHa: iv.nKgHa } : {}),
    });
  }
  interventions.sort((a, b) => a.day - b.day);

  const events: { day: number; kind: string }[] = [];
  let st = createRun(rec.config, ctx);
  for (let i = 0; i < days; i++) {
    const res = stepDay(st, rec.envSeries[i]!, rec.config, ctx);
    st = res.state;
    for (const ev of res.events) events.push({ day: ev.dayIndex, kind: ev.kind });
  }
  // dayIndex here is always overridden by the live controller value at the
  // call site ({...timeline, dayIndex}); 0 keeps the initial shape honest.
  return { days, dayIndex: 0, interventions, events };
}
