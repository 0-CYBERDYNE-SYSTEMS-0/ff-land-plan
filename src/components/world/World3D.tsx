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
import { buildGroundTexture } from '@/three/groundTexture';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { buildPlants, disposePlants, type PlantBatch, swayPlants, updatePlants } from '@/three/plants';
import { createSky, type Sky } from '@/three/sky';
import { buildStructures, disposeStructures, type StructureBatch, updateStructures } from '@/three/structures';
import { createTour, generateTourWaypoints, type Tour } from '@/three/tour';
import { use3DEditor } from '@/three/use3DEditor';
import { buildWaterPlanes, disposeWaterPlanes, updateWaterPlanes, type WaterPlane } from '@/three/water';
import { createGrowthFX, type GrowthFX } from '@/three/growth-fx';
import { createPerfHUD, type PerfHUD } from '@/three/perf';
import { createWeatherFX, type WeatherFX, type WeatherData } from '@/three/weather-fx';

interface World3DProps {
  editor: PlanEditor;
}

export default function World3D({ editor }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const structureBatchesRef = useRef<StructureBatch[]>([]);
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

  const [scrubDate, setScrubDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState(0.5);
  const [autoTime, setAutoTime] = useState(true);
  const timeRef = useRef(0.5);
  const autoTimeRef = useRef(true);
  const audioOnRef = useRef(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourProgress, setTourProgress] = useState(0);
  const [weather, setWeather] = useState<WeatherCurrent | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [audioOn, setAudioOn] = useState(false);

  const achievements = useRef(createAchievementSystem());
  const flightTime = useRef(0);

  const { handlePointerDown, handlePointerMove, handlePointerUp } = use3DEditor(editor);

  // Fetch weather
  useEffect(() => {
    const farm = editor.farm;
    if (!farm) return;
    let cancelled = false;
    apiFetch.getWeather(farm.id).then((w: Weather) => {
      if (cancelled) return;
      setWeather(w.current);
    });
    return () => { cancelled = true; };
  }, [editor.farm]);

  // Initialize engine and scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const plan = editor.planRef.current;
    const cropById = editor.cropById;
    if (!plan || !cropById.size) return;
    if (engineRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const engine = createEngine(canvas, 'light');
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

    // Ground plane
    const texture = buildGroundTexture(plan, cropById);
    const groundGeo = new THREE.PlaneGeometry(plan.widthM, plan.heightM);
    const groundMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    engine.scene.add(ground);
    groundRef.current = ground;

    // Structures, plants, water
    structureBatchesRef.current = buildStructures(plan, engine.scene);
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene, new Date(scrubDate));
    waterPlanesRef.current = buildWaterPlanes(plan, engine.scene);

    // Animals
    animalsRef.current = buildAnimals(plan, engine.scene);

    // Growth FX
    growthFXRef.current = createGrowthFX(engine.scene);

    // Performance HUD
    perfHUDRef.current = createPerfHUD(canvas);

    // Audio
    audioRef.current = createAudioAtmosphere();

    // Fit camera
    const box = new THREE.Box3(
      new THREE.Vector3(-plan.widthM / 2, 0, -plan.heightM / 2),
      new THREE.Vector3(plan.widthM / 2, 5, plan.heightM / 2),
    );
    engine.controls.fitToBox(box, true, { paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 2 });

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
        ambientLight.color.copy(sky.state.ambientColor);
        ambientLight.intensity = sky.state.sunDirection.y > 0 ? 0.3 + sky.state.sunDirection.y * 0.5 : 0.15;
      }

      // Clouds
      const w = weather ?? { tempC: 15, windSpeedKmh: 5, cloudCover: 30, precipMm: 0, humidity: 50, weatherCode: 0 };
      clouds.update(dt, (w as WeatherCurrent).windSpeedKmh ?? 5, (w as WeatherCurrent).cloudCover ?? 30);

      // Weather
      weatherFX.update(dt, w as WeatherData);

      // Water planes
      updateWaterPlanes(waterPlanesRef.current, t);

      // Animals
      if (animalsRef.current) updateAnimals(animalsRef.current, dt);

      // Plant sway
      const windStr = w ? (w.windSpeedKmh ?? 5) / 20 : 0.25;
      swayPlants(plantBatchesRef.current, cropById, t, windStr);

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
          windSpeed: (w as WeatherCurrent).windSpeedKmh ?? 5,
          precipMm: (w as WeatherCurrent).precipMm ?? 0,
          tempC: (w as WeatherCurrent).tempC ?? 15,
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
      handlePointerDown(engine.camera, engine.scene, ndc.x, ndc.y);
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const ndc = getNDC(e);
      handlePointerMove(engine.camera, engine.scene, ndc.x, ndc.y);
    };
    const onPointerUp = (e: PointerEvent) => {
      handlePointerUp();
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
      texture.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      engine.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      engineRef.current = null;
      groundRef.current = null;
    };
  }, [editor.planVersion, editor.cropById, scrubDate, handlePointerDown, handlePointerMove, handlePointerUp]);

  // React to plan changes
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    const cropById = editor.cropById;
    if (!engine || !plan) return;

    // Ground texture
    const oldGround = groundRef.current;
    if (oldGround) {
      const oldMat = oldGround.material as THREE.MeshStandardMaterial;
      oldMat.map?.dispose();
      oldMat.map = buildGroundTexture(plan, cropById);
      oldMat.needsUpdate = true;
    }

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

    // Tour waypoints update
    const waypoints = generateTourWaypoints(plan, cropById);
    tourRef.current = createTour(engine, waypoints, () => {
      setTourActive(false);
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
          <div className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 shadow-sm text-xs text-muted-foreground">
            {weather.tempC}°C · 💨{weather.windSpeedKmh}km/h · 🌧{weather.precipMm}mm
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
