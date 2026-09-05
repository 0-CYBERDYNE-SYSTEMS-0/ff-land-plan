import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createAchievementSystem } from '@/lib/achievements';
import { apiFetch } from '@/lib/api';
import { fetchClimateNormals } from '@/lib/climate';
import { SCENARIOS, growthProgress, scenarioGrowthMod, stageForScale } from '@/lib/growth';
import { fetchMonthlyDli } from '@/lib/light';
import type { ScenarioType, Weather, WeatherCurrent } from '@/types';
import { buildAnimals, disposeAnimals, updateAnimals, type AnimalSystem } from '@/three/animals';
import { buildDressing, disposeDressing, type DressingSystem } from '@/three/dressing';
import { createAudioAtmosphere, type AudioAtmosphere } from '@/three/audio';
import { createClouds, type Clouds } from '@/three/clouds';
import { createEngine, setEngineOrbitEnabled, type Engine } from '@/three/engine';
import { createFlightCamera, type FlightCamera } from '@/three/flight';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { buildPlants, disposePlants, type PlantBatch, swayPlants, updatePlants } from '@/three/plants';
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

interface World3DProps {
  editor: PlanEditor;
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

/** Display names for the tools that claim left-drag for painting in here;
 * used by the orbit hint chip so the gate never feels like a dead canvas. */
const TOOL_LABELS: Record<string, string> = {
  brush: 'Brush',
  rect: 'Rect',
  asset: 'Asset',
  erase: 'Erase',
  pick: 'Pick',
  fill: 'Fill',
  line: 'Line',
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

export default function World3D({ editor }: World3DProps) {
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
  // Growth-model climate context fed to buildPlants/updatePlants/HUD; empty
  // (legacy 20 °C baseline) until live weather / climate normals arrive.
  const growthCtxRef = useRef<{ ambientTempC?: number; baselineTempC?: number; dliMol?: number }>({});
  // Latest monthly DLI (mol/m²/day, index 0 = January) consumed via helper
  // below by the ref-based plant builders; mirrors climateBaselineC's
  // ref+state pattern (refs never appear in dep arrays).
  const monthlyDliRef = useRef<number[] | null>(null);

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
  const [simSpeed, setSimSpeed] = useState<1 | 7 | 30>(7);
  const [scenario, setScenario] = useState<ScenarioType>('baseline');
  const timeRef = useRef(timeOfDay);
  const autoTimeRef = useRef(false);
  const audioOnRef = useRef(false);
  const [tourActive, setTourActive] = useState(false);
  // Mirrored flight state: the live flag sits behind flightRef (mutated by the
  // button and by Escape inside flight.ts), which alone never re-renders React.
  const [flightActive, setFlightActive] = useState(false);
  const flightActiveRef = useRef(false);
  const [tourProgress, setTourProgress] = useState(0);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [weatherCached, setWeatherCached] = useState(false);
  // State mirror of weatherRef.tempC so memoized growth rows recompute when
  // the live reading lands (refs alone don't trigger renders).
  const [ambientTempC, setAmbientTempC] = useState<number | null>(null);
  // State mirror of the farm's ERA5 climate-normals baseline (null = offline /
  // not yet fetched → growth falls back to the legacy 20 °C constant).
  const [climateBaselineC, setClimateBaselineC] = useState<number | null>(null);
  // State mirror of monthlyDliRef so the growth-only effect and the HUD memo
  // recompute when the DLI series lands (refs alone don't trigger renders).
  const [monthlyDli, setMonthlyDli] = useState<number[] | null>(null);
  const [climateLabel, setClimateLabel] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(() => readLaunchParams().get('ffdebug') === '1');
  const showDebugRef = useRef(showDebug); // mount-time value for the initial HUD state
  const [audioOn, setAudioOn] = useState(false);

  // Latest-value refs: the mount-once init effect and its listeners read these
  // instead of capturing render-time values.
  const cropByIdRef = useRef(editor.cropById);
  cropByIdRef.current = editor.cropById;
  const scrubDateRef = useRef(scrubDate);
  scrubDateRef.current = scrubDate;
  const scenarioRef = useRef<ScenarioType>(scenario);
  scenarioRef.current = scenario;
  showDebugRef.current = showDebug;

  // Growth ctx for the ref-based plant builders (mount-once init + plan-change
  // effects): the latest climate ctx plus the DLI of the SCRUB DATE's month,
  // so a December scrub shows winter light stress even on later plan edits.
  const growthCtxForBuilders = (): typeof growthCtxRef.current => {
    const dli = monthlyDliRef.current;
    const m = Number(scrubDateRef.current.slice(5, 7)); // calendar month from the string — new Date('YYYY-MM-DD') parses UTC and shifts the day in TZ behind UTC
    return { ...growthCtxRef.current, dliMol: dli ? (dli[m - 1] ?? undefined) : undefined }; // m is 1..12; MonthlyDli is 0-based
  };

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
    // Stale-data guard: switching farms must not keep serving the previous
    // farm's DLI until a replacement arrives.
    monthlyDliRef.current = null;
    setMonthlyDli(null);
    apiFetch
      .getWeather(farm.id)
      .then((w: Weather) => {
        if (cancelled) return;
        weatherRef.current = w.current; // rAF loop reads this every frame
        growthCtxRef.current = { ambientTempC: w.current.tempC }; // growth model reads live ambient
        setWeather(w.current);          // footer chip
        setAmbientTempC(w.current.tempC); // growth ctx for memoized HUD rows
        setWeatherCached(Boolean(w.cached));
        // Seasonal climate identity: fire-and-forget (localStorage-cached, so
        // usually instant; resolves null offline — never rejects).
        fetchClimateNormals(farm.lat, farm.lng)
          .then((n) => {
            if (cancelled || !n || typeof n.baselineTempC !== 'number') return;
            growthCtxRef.current = { ...growthCtxRef.current, baselineTempC: n.baselineTempC };
            setClimateBaselineC(n.baselineTempC);
            setClimateLabel(`ERA5 ${n.startYear}–${n.endYear}`);
          })
          .catch(() => {});
      })
      .catch((err: unknown) => {
        console.warn('weather unavailable, using defaults', err);
      });
    // Monthly light (DLI): fetched independently of the weather request so a
    // weather failure (offline, no cache) can't suppress it; localStorage-
    // cached, resolves null offline, never rejects.
    fetchMonthlyDli(farm.lat, farm.lng)
      .then((dli) => {
        if (cancelled || !dli) return;
        monthlyDliRef.current = dli;
        setMonthlyDli(dli);
      })
      .catch(() => {});
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
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene, new Date(scrubDateRef.current), scenarioRef.current, growthCtxForBuilders());
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
    // look down into enclosed canvas shells.
    const maxDim = Math.max(plan.widthM, plan.heightM);
    const dist = maxDim * 0.75 + 2;
    engine.camera.position.set(dist * 0.7, Math.max(dist * 0.55, 3), dist * 0.7);
    engine.camera.lookAt(0, 0, 0);
    engine.controls.setTarget(0, 0, 0);
    engine.controls.azimuthAngle = -Math.PI / 4;
    engine.controls.polarAngle = Math.PI / 3.5;
    engine.controls.distance = dist;
    // Clamp camera so it can't dive under the ground plane or fly into the void.
    engine.setBounds({
      minDistance: 2,
      maxDistance: dist * 4,
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

      // Growth FX
      growthFXRef.current?.update(dt);

      // Tour
      if (tourRef.current?.active) {
        tourRef.current.update(dt);
        setTourProgress(tourRef.current.progress);
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
    plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene, new Date(scrubDateRef.current), scenarioRef.current, growthCtxForBuilders());

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

  // Scrub month 1..12 — memo-friendly integer derived where scrubDate is
  // already a dep; feeds the DLI lookup at every growth-ctx construction.
  const scrubMonth = useMemo(() => Number(scrubDate.slice(5, 7)), [scrubDate]); // 1..12, parsed from the calendar string (UTC-parse safe)
  const scrubDliMol = useMemo(
    () => (monthlyDli ? (monthlyDli[scrubMonth - 1] ?? undefined) : undefined),
    [monthlyDli, scrubMonth],
  );

  // Growth-only update: advancing the sim date (or switching scenario, or the
  // live ambient temp landing) must NOT rebuild ground/structures/animals —
  // only the plant stages change.
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    plantBatchesRef.current = updatePlants(
      plantBatchesRef.current,
      plan,
      editor.cropById,
      engine.scene,
      new Date(scrubDate),
      scenario,
      {
        ambientTempC: ambientTempC ?? undefined,
        baselineTempC: climateBaselineC ?? undefined,
        dliMol: scrubDliMol,
      },
    );
  }, [scrubDate, scenario, ambientTempC, climateBaselineC, scrubDliMol, editor.cropById]);

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

  // Simulate playback: advance the calendar day-by-day while playing.
  useEffect(() => {
    if (!playing) return;
    const daysPerTick = Math.max(1, Math.round(simSpeed * 0.5));
    const id = window.setInterval(() => {
      setScrubDate((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + daysPerTick);
        return next.toISOString().slice(0, 10);
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [playing, simSpeed]);

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

  // Per-crop growth stage/progress for the HUD.
  const cropProgress = useMemo(() => {
    const plan = editor.planRef.current;
    if (!plan) return [];
    const date = new Date(scrubDate);
    const rows: { id: number; name: string; stage: number; pct: number; stress: number }[] = [];
    const seen = new Set<number>();
    for (const [key, cropId] of Object.entries(plan.planting)) {
      if (seen.has(cropId)) continue;
      seen.add(cropId);
      const crop = editor.cropById.get(cropId);
      if (!crop) continue;
      const mod = scenarioGrowthMod(crop, scenario, plan.surface ?? 'outdoor', {
        ambientTempC: ambientTempC ?? undefined,
        baselineTempC: climateBaselineC ?? undefined,
        dliMol: scrubDliMol,
      });
      const prog = growthProgress(crop, plan.plantedAt?.[key], date, mod.rate);
      rows.push({
        id: cropId,
        name: crop.name,
        stage: stageForScale(prog),
        pct: Math.round(prog * 100),
        stress: mod.stress,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [editor.cropById, editor.planVersion, scenario, scrubDate, scrubDliMol, ambientTempC, climateBaselineC]);

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
        setTimeout(() => setAchievementToast(null), 3000);
      }
    }
    unlockedCountRef.current = currentCount;
  }, [lastAchievement]);

  return (
    <div
      ref={containerRef}
      className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1"
    >
      {/* Orbit hint: paint tools claim left-drag for strokes in here too, so
       * tell the user how to get rotation back instead of leaving the drag
       * feeling dead. Suppressed while a tour owns the top-center strip. */}
      {editor.tool !== 'select' && !tourActive && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <span className="font-medium text-foreground">{TOOL_LABELS[editor.tool] ?? editor.tool}</span>
          {' '}active — drag paints the plan. Press{' '}
          <kbd className="rounded border border-border bg-muted px-1 font-sans">V</kbd>
          {' '}or pick Select to orbit again.
        </div>
      )}

      {/* Footer controls */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-2">
        {/* Date scrub */}
        <div className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 shadow-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Date:</span>
            <input
              type="date"
              value={scrubDate}
              onChange={(e) => setScrubDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
        </div>

        {/* Time of day */}
        <div className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 shadow-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Time:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={timeOfDay}
              onChange={(e) => { setTimeOfDay(Number(e.target.value)); setAutoTime(false); }}
              className="w-16"
            />
            <button
              type="button"
              onClick={() => setAutoTime(!autoTime)}
              className={`text-[10px] rounded px-1.5 py-0.5 ${autoTime ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
            >
              {autoTime ? 'Auto' : 'Manual'}
            </button>
          </label>
        </div>

        {/* Simulate: play a growing season with an optional stress scenario */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-background/90 px-3 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className={`rounded px-2 py-1 text-xs font-medium ${playing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {playing ? '⏸ Pause' : '▶ Simulate'}
          </button>
          <select
            value={simSpeed}
            onChange={(e) => setSimSpeed(Number(e.target.value) as 1 | 7 | 30)}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
            title="Simulation speed"
          >
            <option value={1}>1×/day</option>
            <option value={7}>1×/week</option>
            <option value={30}>1×/month</option>
          </select>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScenarioType)}
            className="rounded border border-border bg-background px-1.5 py-1 text-xs"
            title="Stress scenario"
          >
            {(Object.keys(SCENARIOS) as ScenarioType[]).map((s) => (
              <option key={s} value={s}>{SCENARIOS[s].label}</option>
            ))}
          </select>
          {seasonDay !== null && (
            <span className="text-xs text-muted-foreground">Day {Math.min(seasonDay, 365)}</span>
          )}
          <div className="flex max-h-24 flex-col gap-0.5 overflow-y-auto border-l border-border pl-2" title="Per-crop growth stage at the scrubbed date (scroll for more)">
            {cropProgress.map((r) => (
              <div key={r.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-20 truncate">{r.name}</span>
                <span className="tracking-tighter text-foreground">
                  {'●'.repeat(r.stage)}{'○'.repeat(5 - r.stage)}
                </span>
                <span>{r.pct}%</span>
                {r.stress > 0.2 && <span className="text-amber-500">stress</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Reset camera — escapes geometry after a bad zoom/orbit */}
        <button
          type="button"
          onClick={() => {
            const engine = engineRef.current;
            if (!engine) return;
            const plan = editor.planRef.current;
            const dist = plan ? Math.max(plan.widthM, plan.heightM) * 0.6 : 12;
            engine.resetView({ distance: dist });
          }}
          className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
        >
          Reset view
        </button>

        {/* History */}
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${showHistory ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </button>

        {/* Tour */}
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
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${tourActive ? 'bg-destructive text-destructive-foreground' : 'bg-background/90 text-muted-foreground hover:bg-primary hover:text-primary-foreground'}`}
        >
          {tourActive ? 'Stop Tour' : '▶ Tour'}
        </button>

        {/* Audio */}
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
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${audioOn ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          {audioOn ? '🔊' : '🔇'}
        </button>

        {/* Flight toggle */}
        <button
          type="button"
          onClick={() => {
            if (flightRef.current?.active) {
              flightRef.current.deactivate();
            } else {
              flightRef.current?.activate();
            }
          }}
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${flightActive ? 'bg-destructive text-destructive-foreground' : 'bg-background/90 text-muted-foreground hover:bg-primary hover:text-primary-foreground'}`}
        >
          {flightActive ? '✈ Exit Flight' : '✈ Fly'}
        </button>

        {/* Weather info */}
        {weather && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-2 shadow-sm text-xs text-muted-foreground">
            <span>{weather.tempC}°C · 💨{weather.windSpeedKmh}km/h · 🌧{weather.precipMm}mm</span>
            {climateBaselineC !== null && climateLabel && (
              <span
                title={`Farm climate baseline ${climateBaselineC.toFixed(1)} °C (growing-season mean, Open-Meteo ${climateLabel} normals)`}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              >
                {climateLabel}
              </span>
            )}
            {weatherCached && (
              <span
                title="Live fetch failed earlier — showing last-good cached weather"
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              >
                cached
              </span>
            )}
          </div>
        )}

        {/* Debug toggle */}
        <button
          type="button"
          onClick={() => {
            setShowDebug(!showDebug);
            if (perfHUDRef.current) perfHUDRef.current.visible = !showDebug;
          }}
          className="pointer-events-auto rounded-md bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
        >
          Debug
        </button>
      </div>

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
          <div className="animate-in slide-in-from-top-2 rounded-lg bg-background/95 px-4 py-2 text-sm font-medium shadow-lg border border-border">
            {achievementToast}
          </div>
        </div>
      )}
    </div>
  );
}
