import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createAchievementSystem } from '@/lib/achievements';
import { apiFetch } from '@/lib/api';
import type { Weather, WeatherCurrent } from '@/types';
import { buildAnimals, disposeAnimals, updateAnimals, type AnimalSystem } from '@/three/animals';
import { createAudioAtmosphere, type AudioAtmosphere } from '@/three/audio';
import { createClouds, type Clouds } from '@/three/clouds';
import { createEngine, type Engine } from '@/three/engine';
import { createFlightCamera, type FlightCamera } from '@/three/flight';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { buildPlants, disposePlants, type PlantBatch, swayPlants, updatePlants } from '@/three/plants';
import { buildGround, disposeGround, updateGround, type GroundBatch } from '@/three/ground';
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
  up: () => void;
}

export default function World3D({ editor }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundBatchesRef = useRef<GroundBatch[]>([]);
  const structureBatchesRef = useRef<StructureGroup[]>([]);
  const plantBatchesRef = useRef<PlantBatch[]>([]);
  const waterPlanesRef = useRef<WaterPlane[]>([]);
  const undoGhostsRef = useRef<GhostBatch[]>([]);
  const redoGhostsRef = useRef<GhostBatch[]>([]);

  // Systems
  const skyRef = useRef<Sky | null>(null);
  const cloudsRef = useRef<Clouds | null>(null);
  const weatherFXRef = useRef<WeatherFX | null>(null);
  const animalsRef = useRef<AnimalSystem | null>(null);
  const tourRef = useRef<Tour | null>(null);
  const flightRef = useRef<FlightCamera | null>(null);
  const growthFXRef = useRef<GrowthFX | null>(null);
  const perfHUDRef = useRef<PerfHUD | null>(null);
  const audioRef = useRef<AudioAtmosphere | null>(null);

  // Live weather consumed by the rAF loop each frame (state below is only for the chip).
  const weatherRef = useRef<WeatherCurrent | null>(null);

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
  const timeRef = useRef(timeOfDay);
  const autoTimeRef = useRef(false);
  const audioOnRef = useRef(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourProgress, setTourProgress] = useState(0);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [weatherCached, setWeatherCached] = useState(false);
  const [showDebug, setShowDebug] = useState(() => readLaunchParams().get('ffdebug') === '1');
  const showDebugRef = useRef(showDebug); // mount-time value for the initial HUD state
  const [audioOn, setAudioOn] = useState(false);

  // Latest-value refs: the mount-once init effect and its listeners read these
  // instead of capturing render-time values.
  const cropByIdRef = useRef(editor.cropById);
  cropByIdRef.current = editor.cropById;
  const scrubDateRef = useRef(scrubDate);
  scrubDateRef.current = scrubDate;
  showDebugRef.current = showDebug;

  const achievements = useRef(createAchievementSystem());
  const flightTime = useRef(0);

  const { handlePointerDown, handlePointerMove, handlePointerUp } = use3DEditor(editor);

  // Handler identity changes whenever the picked tool/crop changes (they are
  // useCallback-wrapped over editor state). The canvas listeners are created
  // once and read the latest handlers through this ref.
  const handlersRef = useRef<PointerHandlers>({ down: handlePointerDown, move: handlePointerMove, up: handlePointerUp });
  handlersRef.current = { down: handlePointerDown, move: handlePointerMove, up: handlePointerUp };

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
        setWeather(w.current);          // footer chip
        setWeatherCached(Boolean(w.cached));
      })
      .catch((err: unknown) => {
        console.warn('weather unavailable, using defaults', err);
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

    // Structures, plants, water
    structureBatchesRef.current = buildStructures(plan, engine.scene);
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene, new Date(scrubDateRef.current));
    waterPlanesRef.current = buildWaterPlanes(plan, engine.scene);

    // Animals
    animalsRef.current = buildAnimals(plan, engine.scene);

    // Growth FX
    growthFXRef.current = createGrowthFX(engine.scene);

    // Performance HUD (ffdebug=1 opens it initially)
    perfHUDRef.current = createPerfHUD(canvas);
    perfHUDRef.current.visible = showDebugRef.current;

    // Audio
    audioRef.current = createAudioAtmosphere();

    // Camera — isometric angle like Tiny World Builder
    const maxDim = Math.max(plan.widthM, plan.heightM);
    const dist = maxDim * 0.6;
    engine.camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
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
        // inside sky.update() itself (position/color/intensity).
        ambientLight.color.copy(sky.state.ambientColor);
        ambientLight.intensity = sky.state.ambientIntensity;
      }

      // Clouds / weather FX / audio — live weather via ref, defaults until it
      // arrives (and forever when offline). No per-frame allocations.
      const w = weatherRef.current ?? DEFAULT_WEATHER;
      clouds.update(dt, w.windSpeedKmh, w.cloudCover);

      // Weather
      weatherFX.update(dt, w);

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
      handlersRef.current.up();
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
      disposeGhostPlants(undoGhostsRef.current);
      disposeGhostPlants(redoGhostsRef.current);
      disposeAnimals(animalsRef.current!);
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

    // Rebuild 3D ground blocks
    groundBatchesRef.current = updateGround(groundBatchesRef.current, plan, engine.scene);

    // Structures & plants
    structureBatchesRef.current = updateStructures(structureBatchesRef.current, plan, engine.scene);
    plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene, new Date(scrubDate));

    // Water planes
    disposeWaterPlanes(waterPlanesRef.current);
    waterPlanesRef.current = buildWaterPlanes(plan, engine.scene);

    // Animals
    if (animalsRef.current) {
      disposeAnimals(animalsRef.current);
      animalsRef.current = buildAnimals(plan, engine.scene);
    }

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
  }, [editor.planVersion, editor.cropById, scrubDate, showHistory]);

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
          className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
        >
          {flightRef.current?.active ? '✈ Exit Flight' : '✈ Fly'}
        </button>

        {/* Weather info */}
        {weather && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-md bg-background/90 px-3 py-2 shadow-sm text-xs text-muted-foreground">
            <span>{weather.tempC}°C · 💨{weather.windSpeedKmh}km/h · 🌧{weather.precipMm}mm</span>
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
