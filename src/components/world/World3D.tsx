import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createAchievementSystem } from '@/lib/achievements';
import { apiFetch } from '@/lib/api';
import { fetchClimateNormals } from '@/lib/climate';
import { DEFAULT_BASELINE_TEMP_C, growthProgress, scenarioGrowthMod, stageForScale, type GrowthModCtx } from '@/lib/growth';
import { isoDayNumber, isoFromDayNumber } from '@/lib/sim/environment';
import type { ScenarioType, Weather, WeatherCurrent } from '@/types';
import { buildAnimals, disposeAnimals, updateAnimals, type AnimalSystem } from '@/three/animals';
import { buildDressing, disposeDressing, type DressingSystem } from '@/three/dressing';
import { createAudioAtmosphere, type AudioAtmosphere } from '@/three/audio';
import { createClouds, type Clouds } from '@/three/clouds';
import { createEngine, setEngineOrbitEnabled, type Engine } from '@/three/engine';
import { createFlightCamera, type FlightCamera } from '@/three/flight';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { advancePlantGrowth, buildPlants, disposePlants, type PlantBatch, type PlantUpdateOptions, swayPlants, updatePlants } from '@/three/plants';
import { buildGround, disposeGround, updateGround, type GroundBatch } from '@/three/ground';
import { buildShell, disposeShell, type ShellGroup } from '@/three/shell';
import { createSky, type Sky } from '@/three/sky';
import { buildStructures, disposeStructures, type StructureGroup, updateStructures } from '@/three/structures';
import { createTour, generateTourWaypoints, type Tour } from '@/three/tour';
import { use3DEditor } from '@/three/use3DEditor';
import { buildWaterPlanes, disposeWaterPlanes, updateWaterPlanes, type WaterPlane } from '@/three/water';
import { createGrowthFX, type GrowthFX } from '@/three/growth-fx';
import { createPerfHUD, type PerfHUD } from '@/three/perf';
import { createWeatherFX, type WeatherFX } from '@/three/weather-fx';
import { SimDrawer, type CropProgressRow, type ClimateBaselineInfo } from './SimDrawer';

/** Provenance tag for the growth model's baseline temperature (spec §3.3:
 * every number traces to its source). */
const DEFAULT_CLIMATE_BASELINE: ClimateBaselineInfo = {
  tempC: DEFAULT_BASELINE_TEMP_C,
  source: 'default-20c',
};

/** Home camera framing — the load-in view and the dock's Reset target share
 * one source of truth so "Reset view" restores exactly the initial shot. */
function homeFrame(plan: { widthM: number; heightM: number }) {
  const dist = Math.max(plan.widthM, plan.heightM) * 0.75 + 2;
  return { dist, x: dist * 0.7, y: Math.max(dist * 0.55, 3), z: dist * 0.7 };
}

interface World3DProps {
  editor: PlanEditor;
  /** Cinema mode: persistent chrome auto-dims (PlotDesigner owns the state). */
  cinema?: boolean;
  /** Parent handler for the in-world Cinema button (PlotDesigner owns state). */
  onToggleCinema?: () => void;
}

/** Weather used by the rAF loop until live data arrives (or when offline). */
const DEFAULT_WEATHER: WeatherCurrent = {
  tempC: 15,
  feelsLikeC: 14,
  humidity: 50,
  windSpeedKmh: 5,
  precipMm: 0,
  uvIndex: 3,
  cloudCover: 30,
  soilTempC: 12,
  soilMoisture: 40,
  weatherCode: 0,
  weatherDesc: 'Clear',
};

/** Ambient-light multiplier per surface — enclosed interiors read dimmer; the
 * shell's own LED bars (see three/shell.ts) provide the "artificial" light. */
const SURFACE_AMBIENT: Record<string, number> = {
  outdoor: 1,
  greenhouse: 0.88,
  tent: 0.55,
  indoor: 0.6,
};

/**
 * Test-hook launch params, read ONCE on mount. Inert unless present.
 * Checks BOTH `?a=b` in the real query string AND inside the hash fragment
 * (`#/farms/3/map?fftime=0.05`) since the app is hash-routed.
 */
function readLaunchParams(): URLSearchParams {
  const merged = new URLSearchParams(window.location.search);
  const q = window.location.hash.indexOf('?');
  if (q !== -1) {
    new URLSearchParams(window.location.hash.slice(q + 1)).forEach((v, k) => {
      if (!merged.has(k)) merged.set(k, v);
    });
  }
  return merged;
}

type PointerHandler2 = (camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => void;
interface PointerHandlers {
  down: PointerHandler2;
  move: PointerHandler2;
  up: (camera: THREE.Camera, scene: THREE.Scene, ndcX?: number, ndcY?: number) => void;
}

export default function World3D({ editor, cinema = false, onToggleCinema }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundBatchesRef = useRef<GroundBatch[]>([]);
  const structureBatchesRef = useRef<StructureGroup[]>([]);
  const plantBatchesRef = useRef<PlantBatch[]>([]);
  const waterPlanesRef = useRef<WaterPlane[]>([]);
  const shellRef = useRef<ShellGroup | null>(null);
  const undoGhostsRef = useRef<GhostBatch[]>([]);
  const redoGhostsRef = useRef<GhostBatch[]>([]);

  // Systems
  const skyRef = useRef<Sky | null>(null);
  const cloudsRef = useRef<Clouds | null>(null);
  const weatherFXRef = useRef<WeatherFX | null>(null);
  const animalsRef = useRef<AnimalSystem | null>(null);
  const dressingRef = useRef<DressingSystem | null>(null);
  const tourRef = useRef<Tour | null>(null);
  const flightRef = useRef<FlightCamera | null>(null);
  const growthFXRef = useRef<GrowthFX | null>(null);
  const perfHUDRef = useRef<PerfHUD | null>(null);
  const audioRef = useRef<AudioAtmosphere | null>(null);

  // Live weather consumed by the rAF loop each frame (state below is only for the chip).
  const weatherRef = useRef<WeatherCurrent | null>(null);
  // Growth-model climate context fed to buildPlants/updatePlants/HUD. Starts
  // empty (legacy 20 °C baseline) and gains live ambientTempC + farm
  // baselineTempC (ERA5 normals) as their fetches land.
  const growthCtxRef = useRef<{ ambientTempC?: number; baselineTempC?: number }>({});

  // Launch params (test hooks): fftime = initial timeOfDay, ffdebug = open Perf HUD.
  const [scrubDate, setScrubDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(() => {
    const raw = readLaunchParams().get('fftime');
    if (raw === null) return 0.4;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.4;
  });
  const [autoTime, setAutoTime] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 7 | 30>(1);
  const [scenario, setScenario] = useState<ScenarioType>('baseline');
  // Season-end auto-pause: scrub date (ISO) when EVERY dated planted crop first
  // read fully mature during the current playback; null = not reached yet.
  const matureSinceRef = useRef<string | null>(null);
  const [seasonComplete, setSeasonComplete] = useState(false);
  const seasonDrawerShownRef = useRef(false);
  // Monotonic playback clamp (legacy-path stopgap until the stateful sim
  // engine): while playing, per-cell max progress so a scenario/ambient change
  // mid-playback re-rating the elapsed period can never make crops shrink.
  const monotonicProgressRef = useRef<Map<string, number> | null>(null);
  // rAF-dt sim clock: fractional sim-days accumulated since the last committed
  // integer day (replaces the old setInterval, which kept firing in hidden
  // tabs while rAF — and the whole world — was paused).
  const simDayAccumRef = useRef(0);
  const timeRef = useRef(timeOfDay);
  const autoTimeRef = useRef(false);
  const audioOnRef = useRef(false);
  const [tourActive, setTourActive] = useState(false);
  // Mirrored flight state: the live flag sits behind flightRef (mutated by the
  // button and by Escape inside flight.ts), which alone never re-renders React.
  const [flightActive, setFlightActive] = useState(false);
  const flightActiveRef = useRef(false);
  const [tourProgress, setTourProgress] = useState(0);
  const lastTourProgressRef = useRef(0);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [weatherCached, setWeatherCached] = useState(false);
  // State mirror of weatherRef.tempC so memoized growth rows recompute when
  // the live reading lands (refs alone don't trigger renders).
  const [ambientTempC, setAmbientTempC] = useState<number | null>(null);
  // Climate baseline provenance for the drawer chip: the growth model runs on
  // farm-specific ERA5 normals once fetched, until then the honest default.
  const [climateBaseline, setClimateBaseline] = useState<ClimateBaselineInfo>(DEFAULT_CLIMATE_BASELINE);
  const [showDebug, setShowDebug] = useState(() => readLaunchParams().get('ffdebug') === '1');
  const showDebugRef = useRef(showDebug); // mount-time value for the initial HUD state
  const [audioOn, setAudioOn] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Latest-value refs: the mount-once init effect and its listeners read these
  // instead of capturing render-time values.
  const cropByIdRef = useRef(editor.cropById);
  cropByIdRef.current = editor.cropById;
  const scrubDateRef = useRef(scrubDate);
  scrubDateRef.current = scrubDate;
  const scenarioRef = useRef<ScenarioType>(scenario);
  scenarioRef.current = scenario;
  // rAF-loop mirrors: the sim clock in the update closure reads these refs.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const simSpeedRef = useRef<1 | 7 | 30>(simSpeed);
  simSpeedRef.current = simSpeed;
  showDebugRef.current = showDebug;

  const achievements = useRef(createAchievementSystem());
  const flightTime = useRef(0);

  const { handlePointerDown, handlePointerMove, handlePointerUp } = use3DEditor(editor);

  // Handler identity changes whenever the picked tool/crop changes (they are
  // useCallback-wrapped over editor state). The canvas listeners are created
  // once and read the latest handlers through this ref.
  const handlersRef = useRef<PointerHandlers>({ down: handlePointerDown, move: handlePointerMove, up: handlePointerUp });
  handlersRef.current = { down: handlePointerDown, move: handlePointerMove, up: handlePointerUp };

  // Painting tools claim left-drag/one-finger for strokes; orbit stays enabled
  // only while the select tool is active. Synced render-phase like handlersRef
  // (CameraControls reads its action map when its own listeners fire).
  const toolRef = useRef(editor.tool);
  toolRef.current = editor.tool;
  if (engineRef.current) {
    setEngineOrbitEnabled(engineRef.current, editor.tool === 'select');
  }

  // Fetch weather (graceful offline: warn + keep defaults, never an unhandled rejection)
  useEffect(() => {
    const farm = editor.farm;
    if (!farm) return;
    let cancelled = false;
    apiFetch
      .getWeather(farm.id)
      .then((w: Weather) => {
        if (cancelled) return;
        weatherRef.current = w.current; // rAF loop reads this every frame
        growthCtxRef.current = { ambientTempC: w.current.tempC }; // growth model reads live ambient
        setWeather(w.current);          // footer chip
        setAmbientTempC(w.current.tempC); // growth ctx for memoized HUD rows
        setWeatherCached(Boolean(w.cached));
      })
      .catch((err: unknown) => {
        console.warn('weather unavailable, using defaults', err);
      });
    return () => { cancelled = true; };
  }, [editor.farm]);

  // Climate baseline (ERA5 normals) — kills the invisible 20 °C default by
  // feeding the growth model this farm's real growing-season mean. Direct
  // call, NOT useQuery: fetchClimateNormals caches forever, dedupes inflight
  // and never throws, and the global QueryClient's staleTime: Infinity +
  // hostile default queryFn make new casual queries a trap (HANDOFF trap 2).
  useEffect(() => {
    const farm = editor.farm;
    if (!farm) return;
    let cancelled = false;
    void fetchClimateNormals(farm.lat, farm.lng).then((normals) => {
      if (cancelled || !normals) return;
      growthCtxRef.current.baselineTempC = normals.baselineTempC; // growth model reads the ref
      setClimateBaseline({ tempC: normals.baselineTempC, source: 'era5-normals' });
    });
    return () => { cancelled = true; };
  }, [editor.farm]);

  /**
   * Initialize engine and scene — ONCE per mount.
   *
   * Deps are ONLY `sceneReady`, a boolean that flips false→true a single time
   * (when plan + crops first exist). Deliberately NOT keyed on planVersion /
   * cropById / scrubDate / pointer handlers, so a brush stroke or date scrub
   * can never tear the whole world down; those flow through the incremental
   * update effect below. All render-time values are read through refs:
   * scrubDateRef / cropByIdRef here, handlersRef in the canvas listeners.
   *
   * `farmId` is included so navigating between farms (which swaps the editor's
   * plan WITHOUT remounting this component under wouter) rebuilds the world
   * exactly once per farm — it cannot flip from brush strokes or scrubs.
   */
  const sceneReady = Boolean(editor.planRef.current && editor.cropById.size > 0);
  const farmId = editor.farm?.id;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sceneReady) return;
    if (engineRef.current) return; // StrictMode double-mount safety

    const plan = editor.planRef.current;
    if (!plan) return;
    const cropById = cropByIdRef.current;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const engine = createEngine(canvas, 'light');
    engine.scene.background = null; // sky dome handles background
    engineRef.current = engine;
    setEngineOrbitEnabled(engine, toolRef.current === 'select');

    // Sky system
    const sky = createSky(engine.scene);
    skyRef.current = sky;

    // Clouds
    const clouds = createClouds(engine.scene);
    cloudsRef.current = clouds;

    // Weather FX
    const weatherFX = createWeatherFX(engine.scene);
    weatherFXRef.current = weatherFX;

    // 3D voxel ground blocks (replaces flat texture plane)
    groundBatchesRef.current = buildGround(plan, engine.scene);

    // Enclosure shell for non-outdoor surfaces (tent / warehouse / greenhouse)
    shellRef.current = buildShell(plan, engine.scene);

    // Structures, plants, water
    structureBatchesRef.current = buildStructures(plan, engine.scene);
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene, new Date(scrubDateRef.current), scenarioRef.current, growthCtxRef.current);
    waterPlanesRef.current = buildWaterPlanes(plan, engine.scene);

    // Animals
    animalsRef.current = buildAnimals(plan, engine.scene);

    // Auto-dressing props (static tools near shed/tap/barrel/bed anchors)
    dressingRef.current = buildDressing(plan, engine.scene);

    // Growth FX
    growthFXRef.current = createGrowthFX(engine.scene);

    // Performance HUD (ffdebug=1 opens it initially)
    perfHUDRef.current = createPerfHUD(canvas);
    perfHUDRef.current.visible = showDebugRef.current;

    // Audio
    audioRef.current = createAudioAtmosphere();

    // Camera — isometric angle like Tiny World Builder. Framed for everything
    // from a 3 m tent interior to a 60 m field: pulled back + high enough to
    // look down into enclosed canvas shells. Shared with the dock's Reset.
    const home = homeFrame(plan);
    engine.camera.position.set(home.x, home.y, home.z);
    engine.camera.lookAt(0, 0, 0);
    engine.controls.setTarget(0, 0, 0);
    engine.controls.azimuthAngle = -Math.PI / 4;
    engine.controls.polarAngle = Math.PI / 3.5;
    engine.controls.distance = home.dist;
    // Clamp camera so it can't dive under the ground plane or fly into the void.
    engine.setBounds({
      minDistance: 2,
      maxDistance: home.dist * 4,
      maxPolarAngle: THREE.MathUtils.degToRad(88),
    });
    engine.controls.update(0);

    // Tour waypoints
    const waypoints = generateTourWaypoints(plan, cropById);
    tourRef.current = createTour(engine, waypoints, () => {
      setTourActive(false);
      achievements.current.check('tour_complete');
    });

    // Flight camera
    flightRef.current = createFlightCamera(engine, () => {
      achievements.current.check('flight_time');
    });

    // Ambient light from sky
    const ambientLight = engine.scene.children.find(
      (c) => c instanceof THREE.AmbientLight,
    ) as THREE.AmbientLight | undefined;

    // Main update function
    const update = (dt: number) => {
      const t = performance.now() * 0.001;

      // Sim clock — rAF-dt accumulation. rAF pauses in hidden tabs, so the
      // clock pauses with the world (the old setInterval kept ticking and
      // desynced). dt is clamped so a resume burst after a hidden tab doesn't
      // fast-forward the season. State commits only on whole sim-days.
      if (playingRef.current) {
        simDayAccumRef.current += Math.min(dt, 0.25) * simSpeedRef.current;
        if (simDayAccumRef.current >= 1) {
          const whole = Math.floor(simDayAccumRef.current);
          simDayAccumRef.current -= whole;
          // UTC day-number math (not setDate) so DST-transition nights in
          // small-positive-offset zones can't stall the clock
          const iso = isoFromDayNumber(isoDayNumber(scrubDateRef.current) + whole);
          if (iso !== scrubDateRef.current) {
            scrubDateRef.current = iso; // coherent for the next tick even pre-render
            setScrubDate(iso);          // ~≤30 commits/sec at 1×/month speed
          }
        }
      } else {
        simDayAccumRef.current = 0;
      }

      // Auto time cycle
      if (autoTimeRef.current) {
        timeRef.current = (timeRef.current + dt * 0.02) % 1;
      }

      // Sky — use ref value for rAF, sync to state periodically
      sky.update(timeRef.current);
      if (ambientLight) {
        // Sky owns the full lighting model: hue from the palette, strength
        // with a legible night floor. The single sun directional is driven
        // inside sky.update() itself (position/color/intensity). Enclosed
        // surfaces dim the ambient so the shell's LED bars carry the light.
        const surface = editor.planRef.current?.surface ?? 'outdoor';
        ambientLight.color.copy(sky.state.ambientColor);
        ambientLight.intensity = sky.state.ambientIntensity * (SURFACE_AMBIENT[surface] ?? 1);
      }

      // Clouds / weather FX / audio — live weather via ref, defaults until it
      // arrives (and forever when offline). No per-frame allocations.
      const w = weatherRef.current ?? DEFAULT_WEATHER;
      clouds.update(dt, w.windSpeedKmh, w.cloudCover);

      // Weather — rain/snow only outdoors; enclosed canvases are climate-controlled.
      if ((editor.planRef.current?.surface ?? 'outdoor') === 'outdoor') {
        weatherFX.update(dt, w);
      }

      // Water planes
      updateWaterPlanes(waterPlanesRef.current, t);

      // Animals
      if (animalsRef.current) updateAnimals(animalsRef.current, dt);

      // Plant sway
      const windStr = w.windSpeedKmh / 20;
      swayPlants(plantBatchesRef.current, cropByIdRef.current, t, windStr);

      // Smooth growth — ease each planted cell's visual progress toward the
      // target captured by the last reconcile (allocation-free, ref-reads
      // only, no scene rebuilds).
      advancePlantGrowth(plantBatchesRef.current, dt);

      // Growth FX
      growthFXRef.current?.update(dt);

      // Tour — progress drives the top bar; throttle to ~1% steps so a 60 fps
      // tour doesn't re-render the HUD every frame.
      if (tourRef.current?.active) {
        tourRef.current.update(dt);
        const p = tourRef.current.progress;
        if (Math.abs(p - lastTourProgressRef.current) > 0.01) {
          lastTourProgressRef.current = p;
          setTourProgress(p);
        }
      }

      // Flight
      if (flightRef.current?.active) {
        flightRef.current.update(dt);
        flightTime.current += dt;
        if (flightTime.current > 60) {
          achievements.current.check('flight_time');
        }
      }
      const flightNow = flightRef.current?.active ?? false;
      if (flightNow !== flightActiveRef.current) {
        flightActiveRef.current = flightNow;
        setFlightActive(flightNow);
      }

      // Perf HUD
      perfHUDRef.current?.update(engine.renderer, dt);

      // Audio
      if (audioOnRef.current && audioRef.current) {
        audioRef.current.updateParams({
          windSpeed: w.windSpeedKmh,
          precipMm: w.precipMm,
          tempC: w.tempC,
        });
      }

      // Achievement checks (time-based) — use ref for rAF-time
      if (timeRef.current > 0.2 && timeRef.current < 0.3) achievements.current.check('dawn_patrol');
      if (timeRef.current > 0.8 || timeRef.current < 0.1) achievements.current.check('night_owl');
    };

    engine.addUpdate(update);

    // Pointer events
    const getNDC = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const ndc = getNDC(e);
      handlersRef.current.down(engine.camera, engine.scene, ndc.x, ndc.y);
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const ndc = getNDC(e);
      handlersRef.current.move(engine.camera, engine.scene, ndc.x, ndc.y);
    };
    const onPointerUp = (e: PointerEvent) => {
      const ndc = getNDC(e);
      handlersRef.current.up(engine.camera, engine.scene, ndc.x, ndc.y);
      canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    // Resize
    const resize = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      engine.removeUpdate(update);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      disposeGround(groundBatchesRef.current);
      disposeStructures(structureBatchesRef.current);
      disposePlants(plantBatchesRef.current);
      disposeWaterPlanes(waterPlanesRef.current);
      disposeShell(shellRef.current);
      shellRef.current = null;
      disposeGhostPlants(undoGhostsRef.current);
      disposeGhostPlants(redoGhostsRef.current);
      disposeAnimals(animalsRef.current!);
      if (dressingRef.current) disposeDressing(dressingRef.current);
      sky.dispose();
      clouds.dispose();
      weatherFX.dispose();
      growthFXRef.current?.dispose();
      perfHUDRef.current?.dispose();
      audioRef.current?.dispose();
      tourRef.current?.dispose();
      flightRef.current?.dispose();
      engine.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      engineRef.current = null;
    };
  }, [sceneReady, farmId]); // mount-once per farm: see comment above the effect

  // React to plan changes
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    const cropById = editor.cropById;
    if (!engine || !plan) return;

    // Rebuild 3D ground blocks + enclosure shell (surface / dims may have changed)
    groundBatchesRef.current = updateGround(groundBatchesRef.current, plan, engine.scene);
    disposeShell(shellRef.current);
    shellRef.current = buildShell(plan, engine.scene);

    // Structures & plants
    structureBatchesRef.current = updateStructures(structureBatchesRef.current, plan, engine.scene);
    plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene, new Date(scrubDateRef.current), scenarioRef.current, growthCtxRef.current);

    // Water planes
    disposeWaterPlanes(waterPlanesRef.current);
    waterPlanesRef.current = buildWaterPlanes(plan, engine.scene);

    // Animals
    if (animalsRef.current) {
      disposeAnimals(animalsRef.current);
      animalsRef.current = buildAnimals(plan, engine.scene);
    }

    // Auto-dressing props rebuild alongside animals on plan changes
    if (dressingRef.current) disposeDressing(dressingRef.current);
    dressingRef.current = buildDressing(plan, engine.scene);

    // Ghosts
    disposeGhostPlants(undoGhostsRef.current);
    disposeGhostPlants(redoGhostsRef.current);
    undoGhostsRef.current = [];
    redoGhostsRef.current = [];
    if (showHistory) {
      const undoStack = editor.undoRef.current;
      const redoStack = editor.redoRef.current;
      if (undoStack.length > 0) {
        undoGhostsRef.current = buildGhostPlants(undoStack[undoStack.length - 1], cropById, engine.scene, '#22c55e', 0.25);
      }
      if (redoStack.length > 0) {
        redoGhostsRef.current = buildGhostPlants(redoStack[redoStack.length - 1], cropById, engine.scene, '#3b82f6', 0.25);
      }
    }

    // Tour waypoints update — dispose the previous tour first (no leak), and
    // keep the same completion behavior as the mount-time tour.
    tourRef.current?.dispose();
    const waypoints = generateTourWaypoints(plan, cropById);
    tourRef.current = createTour(engine, waypoints, () => {
      setTourActive(false);
      achievements.current.check('tour_complete');
    });

    // Check achievements based on plan
    if (Object.keys(plan.planting).length > 0) {
      achievements.current.check('first_plant');
    }
    const families = new Set<string>();
    let uniqueCropIds = new Set<number>();
    for (const cropId of Object.values(plan.planting)) {
      uniqueCropIds.add(cropId);
      const crop = cropById.get(cropId);
      if (crop?.family) families.add(crop.family);
    }
    if (families.size >= 5) achievements.current.check('five_families');
    if (uniqueCropIds.size >= 10) achievements.current.check('ten_crops');

    const bedSlugs = new Set(['raised-bed', 'inground-bed']);
    const bedCells = Object.entries(plan.ground).filter(([, s]) => bedSlugs.has(s));
    const plantedCells = Object.keys(plan.planting).length;
    if (bedCells.length > 0 && plantedCells >= bedCells.length * 0.5) {
      achievements.current.check('half_beds');
    }
    if (bedCells.length > 0 && plantedCells >= bedCells.length) {
      achievements.current.check('full_beds');
    }
    for (const [, slug] of Object.entries(plan.ground)) {
      if (slug === 'pond') achievements.current.check('water_feature');
      if (slug === 'beehive') achievements.current.check('beehive');
      if (slug === 'chicken-coop') achievements.current.check('chickens');
      if (slug === 'greenhouse') achievements.current.check('greenhouse');
    }
  }, [editor.planVersion, editor.cropById, showHistory]);

  // Growth-only update: advancing the sim date (or switching scenario, the
  // climate baseline landing, or the live ambient temp arriving) must NOT
  // rebuild ground/structures/animals — only the plant stages change, and
  // updatePlants now RECONCILES (diffs per-cell assignments) instead of
  // disposing + rebuilding geometry.
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    const ctx: GrowthModCtx = {
      ambientTempC: ambientTempC ?? undefined,
      baselineTempC: climateBaseline.source === 'era5-normals' ? climateBaseline.tempC : undefined,
    };

    // Monotonic playback clamp (legacy-path stopgap until the stateful sim
    // engine): while playing, each cell's progress is the max ever computed
    // for it, so a scenario/ambient change mid-playback re-rating the elapsed
    // period can't make crops shrink. Paused/manual scrubs stay a pure
    // projection of the date (clamping there would break scrubbing back).
    let opts: PlantUpdateOptions | undefined;
    if (playingRef.current) {
      const clamp = monotonicProgressRef.current ?? new Map<string, number>();
      const date = new Date(scrubDate);
      for (const [key, cropId] of Object.entries(plan.planting)) {
        const crop = editor.cropById.get(cropId);
        if (!crop) continue;
        const mod = scenarioGrowthMod(crop, scenarioRef.current, plan.surface ?? 'outdoor', ctx);
        const p = growthProgress(crop, plan.plantedAt?.[key], date, mod.rate);
        const prev = clamp.get(key);
        if (prev === undefined || p > prev) clamp.set(key, p);
      }
      monotonicProgressRef.current = clamp;
      opts = { progressByCell: clamp };
    } else {
      monotonicProgressRef.current = null;
    }

    plantBatchesRef.current = updatePlants(
      plantBatchesRef.current,
      plan,
      editor.cropById,
      engine.scene,
      new Date(scrubDate),
      scenario,
      ctx,
      opts,
    );
  }, [scrubDate, scenario, ambientTempC, climateBaseline, editor.cropById]);

  // Check rain/snow achievement
  useEffect(() => {
    if (!weather) return;
    if (weather.precipMm > 0 && weather.tempC > 2) achievements.current.check('rain_day');
    if (weather.precipMm > 0 && weather.tempC <= 2) achievements.current.check('snow_day');
  }, [weather]);

  // Sync timeRef → timeOfDay state for the slider UI (throttled)
  useEffect(() => {
    if (!autoTime) return;
    const id = setInterval(() => {
      setTimeOfDay(timeRef.current);
    }, 200);
    return () => clearInterval(id);
  }, [autoTime]);

  // Sync slider changes → timeRef
  useEffect(() => {
    timeRef.current = timeOfDay;
  }, [timeOfDay]);

  // Keep refs in sync
  useEffect(() => { autoTimeRef.current = autoTime; }, [autoTime]);
  useEffect(() => { audioOnRef.current = audioOn; }, [audioOn]);

  // Simulate playback: the sim clock lives in the rAF update closure above —
  // dt accumulation at `simSpeed` sim-days per real second (1 day / 1 week /
  // 1 month — labels stay honest), committed to scrubDate state only when the
  // integer sim-day changes. No setInterval: hidden tabs pause rAF and now
  // pause the clock with it.

  // Reset the maturity anchor + completion hint when playback (re)starts...
  useEffect(() => {
    if (!playing) return;
    monotonicProgressRef.current = null; // fresh clamp window per playback run
    matureSinceRef.current = null;
    setSeasonComplete(false);
    seasonDrawerShownRef.current = false;
  }, [playing]);

  // ...and when the growth inputs change (plan edits / scenario switch), so
  // the grace window below restarts against the new reality.
  useEffect(() => {
    matureSinceRef.current = null;
    setSeasonComplete(false);
    seasonDrawerShownRef.current = false;
  }, [scenario, editor.planVersion]);

  // Explain the season-end auto-pause: open the sim drawer once per completed
  // season (guard resets wherever seasonComplete resets above).
  useEffect(() => {
    if (!seasonComplete || seasonDrawerShownRef.current) return;
    seasonDrawerShownRef.current = true;
    setDrawerOpen(true);
  }, [seasonComplete]);

  // While playing, once EVERY dated planted crop is fully mature, let the
  // season run at most 14 more sim days, then auto-pause with a completion
  // hint. Same progress math as the cropProgress HUD rows. Cells WITHOUT a
  // plantedAt date are not countable as mature (a date-less plan must never
  // auto-pause) — growthProgress() returns 1 for them, so they are excluded
  // before the all-mature check.
  useEffect(() => {
    if (!playing) return;
    const plan = editor.planRef.current;
    if (!plan || Object.keys(plan.planting).length === 0) return;
    if (matureSinceRef.current !== null) {
      const days = Math.round((Date.parse(scrubDate) - Date.parse(matureSinceRef.current)) / 86_400_000);
      if (days >= 14) {
        matureSinceRef.current = null;
        setPlaying(false);
        setSeasonComplete(true);
      }
      return;
    }
    const date = new Date(scrubDate);
    let allMature = true;
    let datedCells = 0;
    for (const [key, cropId] of Object.entries(plan.planting)) {
      const plantedAt = plan.plantedAt?.[key];
      if (!plantedAt) continue; // no sowing date → not mature, just unknown
      datedCells++;
      const crop = cropByIdRef.current.get(cropId);
      if (!crop) continue;
      const mod = scenarioGrowthMod(crop, scenarioRef.current, plan.surface ?? 'outdoor', growthCtxRef.current);
      if (growthProgress(crop, plantedAt, date, mod.rate) < 1) {
        allMature = false;
        break;
      }
    }
    if (datedCells === 0) return; // no sowing dates anywhere → never auto-pause
    if (allMature) matureSinceRef.current = scrubDate;
  }, [playing, scrubDate, scenario, editor.planVersion]);

  // Earliest planting date in the plan, for the "Day N" season readout.
  const earliestPlantedAt = useMemo(() => {
    const plan = editor.planRef.current;
    if (!plan?.plantedAt) return null;
    const dates = Object.values(plan.plantedAt)
      .map((d) => Date.parse(d))
      .filter((n) => Number.isFinite(n));
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates));
  }, [editor.planVersion]);

  const seasonDay = useMemo(() => {
    if (!earliestPlantedAt) return null;
    return Math.max(0, Math.floor((new Date(scrubDate).getTime() - earliestPlantedAt.getTime()) / 86_400_000));
  }, [earliestPlantedAt, scrubDate]);

  // Per-crop growth stage/progress for the HUD. Rows are keyed by
  // (cropId, plantedAt) — the same crop planted on two dates is TWO crops in
  // reality (different progress); deduping by cropId alone hid the second
  // sowing. Optionally labelled "Name · Mar 2" to disambiguate the rows.
  const cropProgress = useMemo(() => {
    const plan = editor.planRef.current;
    if (!plan) return [];
    const date = new Date(scrubDate);
    const ctx: GrowthModCtx = {
      ambientTempC: ambientTempC ?? undefined,
      baselineTempC: climateBaseline.source === 'era5-normals' ? climateBaseline.tempC : undefined,
    };
    const rows: CropProgressRow[] = [];
    const seen = new Set<string>();
    for (const [key, cropId] of Object.entries(plan.planting)) {
      const plantedAt = plan.plantedAt?.[key] ?? '';
      const dedupeKey = `${cropId}|${plantedAt}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const crop = editor.cropById.get(cropId);
      if (!crop) continue;
      const mod = scenarioGrowthMod(crop, scenario, plan.surface ?? 'outdoor', ctx);
      const prog = growthProgress(crop, plan.plantedAt?.[key], date, mod.rate);
      // plantedAt may be date-only ("YYYY-MM-DD", scrub input) or full ISO
      // (seed data stores toISOString()) — parse each correctly so labels
      // never read "Invalid Date".
      let planted: Date | null = null;
      if (plantedAt) {
        planted = /^\d{4}-\d{2}-\d{2}$/.test(plantedAt)
          ? new Date(`${plantedAt}T00:00:00`)
          : new Date(plantedAt);
      }
      rows.push({
        id: cropId,
        name: crop.name,
        label: planted && !Number.isNaN(planted.getTime())
          ? `${crop.name} · ${planted.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : undefined,
        plantedAt,
        stage: stageForScale(prog),
        pct: Math.round(prog * 100),
        stress: mod.stress,
      });
    }
    return rows.sort(
      (a, b) => a.name.localeCompare(b.name) || (a.label ?? '').localeCompare(b.label ?? ''),
    );
  }, [editor.cropById, editor.planVersion, scenario, scrubDate, ambientTempC, climateBaseline]);

  // Update weather FX + audio params in the rAF loop already handles audio
  const lastAchievement = achievements.current.unlocked[achievements.current.unlocked.length - 1];
  const [achievementToast, setAchievementToast] = useState<string | null>(null);

  // Track new achievement unlocks
  const unlockedCountRef = useRef(0);
  useEffect(() => {
    const currentCount = achievements.current.stats().unlocked;
    if (currentCount > unlockedCountRef.current && unlockedCountRef.current > 0) {
      const latest = achievements.current.unlocked[achievements.current.unlocked.length - 1];
      if (latest) {
        setAchievementToast(`${latest.icon} ${latest.label} — ${latest.description}`);
      }
    }
    unlockedCountRef.current = currentCount;
  }, [lastAchievement]);

  // Auto-dismiss the toast; the cleanup guards an unmount mid-toast.
  useEffect(() => {
    if (!achievementToast) return;
    const id = window.setTimeout(() => setAchievementToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [achievementToast]);

  // Chrome dims while a showcase mode owns the view: cinema opt-in, tour, or
  // flight. Render-only — the rAF loop never reads this. Hover/focus restores.
  const dimmed = cinema || tourActive || flightActive;
  const dimCls = dimmed ? 'opacity-20 hover:opacity-100 focus-within:opacity-100' : 'opacity-100';

  const resetToHomeView = () => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    const home = homeFrame(plan);
    engine.controls.setPosition(home.x, home.y, home.z, false);
    engine.controls.setTarget(0, 0, 0, false);
    engine.controls.azimuthAngle = -Math.PI / 4;
    engine.controls.polarAngle = Math.PI / 3.5;
    engine.controls.distance = home.dist;
    engine.controls.update(0);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1"
    >
      {/* Always-mounted summary so headless asserts can target the sim
          controls while the drawer is closed. */}
      <span className="sr-only">Sim controls: date, time of day, speed, scenario, per-crop growth</span>

      {/* Top-left view cluster — top-right belongs to the perf HUD (z-100) */}
      <div className={`pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5 transition-opacity duration-300 ${dimCls}`}>
        <button
          type="button"
          onClick={onToggleCinema}
          aria-pressed={cinema}
          title="Cinema mode — dim controls and hide editor chrome (H to exit)"
          className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
        >
          ⛶ Cinema
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          aria-pressed={showHistory}
          title="Ghost overlays of the last undo/redo step"
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${showHistory ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (audioOn) {
              audioRef.current?.stop();
            } else {
              audioRef.current?.start();
            }
            setAudioOn(!audioOn);
          }}
          aria-pressed={audioOn}
          aria-label={audioOn ? 'Mute ambience' : 'Unmute ambience'}
          title="Ambience sound"
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${audioOn ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          {audioOn ? '🔊' : '🔇'}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowDebug(!showDebug);
            if (perfHUDRef.current) perfHUDRef.current.visible = !showDebug;
          }}
          aria-pressed={showDebug}
          title="Performance HUD"
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${showDebug ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          Debug
        </button>
      </div>

      {/* Bottom dock — status chip + actions. FIXED child set: labels swap in
          place so sim state changes never reflow the controls. */}
      <div className={`pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-center gap-2 transition-opacity duration-300 ${dimCls}`}>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          title="Season status — click for simulation controls"
          className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${seasonComplete ? 'bg-amber-500' : 'bg-primary'}`} />
          <span className="whitespace-nowrap">
            {new Date(`${scrubDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {seasonDay !== null && <> · Day {Math.min(seasonDay, 365)}</>}
          </span>
          {weatherCached && (
            <span
              title="Live fetch failed earlier — showing last-good cached weather"
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
            >
              cached
            </span>
          )}
        </button>

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-md bg-background/90 px-2 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
            title="Play the growing season forward"
            className={`min-w-[96px] rounded px-2 py-1 text-xs font-medium ${playing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {playing ? '⏸ Pause' : '▶ Simulate'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (tourActive) {
                tourRef.current?.stop();
                setTourActive(false);
              } else {
                tourRef.current?.start();
                setTourActive(true);
              }
            }}
            aria-pressed={tourActive}
            title="Guided flight through the planted plan"
            className={`rounded px-2 py-1 text-xs font-medium ${tourActive ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'}`}
          >
            {tourActive ? 'Stop Tour' : '▶ Tour'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (flightRef.current?.active) {
                flightRef.current.deactivate();
              } else {
                flightRef.current?.activate();
              }
            }}
            aria-pressed={flightActive}
            title="WASD fly-over camera (Escape exits)"
            className={`rounded px-2 py-1 text-xs font-medium ${flightActive ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'}`}
          >
            {flightActive ? '✈ Exit Flight' : '✈ Fly'}
          </button>
          <button
            type="button"
            onClick={resetToHomeView}
            title="Return the camera to the load-in view"
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-primary hover:text-primary-foreground"
          >
            Reset view
          </button>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            title="Date, time, speed, scenario, and per-crop growth"
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-primary hover:text-primary-foreground"
          >
            Sim ▸
          </button>
        </div>
      </div>

      <SimDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        scrubDate={scrubDate}
        onScrubDate={setScrubDate}
        onToday={() => setScrubDate(new Date().toISOString().slice(0, 10))}
        seasonDay={seasonDay}
        seasonComplete={seasonComplete}
        onJumpSeasonStart={() => {
          if (earliestPlantedAt) setScrubDate(earliestPlantedAt.toISOString().slice(0, 10));
        }}
        onDismissSeason={() => setSeasonComplete(false)}
        timeOfDay={timeOfDay}
        onTimeOfDay={setTimeOfDay}
        autoTime={autoTime}
        onAutoTime={setAutoTime}
        playing={playing}
        simSpeed={simSpeed}
        onSimSpeed={setSimSpeed}
        scenario={scenario}
        onScenario={setScenario}
        weather={weather}
        weatherCached={weatherCached}
        climateBaseline={climateBaseline}
        cropProgress={cropProgress}
      />

      {/* Tour progress bar */}
      {tourActive && (
        <div className="pointer-events-none absolute top-3 left-3 right-3">
          <div className="mx-auto h-1 w-full max-w-md overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${tourProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Achievement toast */}
      {achievementToast && (
        <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2">
          <div className="ff-toast-in rounded-lg bg-background/95 px-4 py-2 text-sm font-medium shadow-lg border border-border">
            {achievementToast}
          </div>
        </div>
      )}
    </div>
  );
}
