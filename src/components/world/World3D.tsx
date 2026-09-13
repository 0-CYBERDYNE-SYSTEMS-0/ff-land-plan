import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createAchievementSystem } from '@/lib/achievements';
import { apiFetch } from '@/lib/api';
import { fetchClimateNormals } from '@/lib/climate';
import { DEFAULT_BASELINE_TEMP_C, growthProgress, scenarioGrowthMod, stageForScale, SURFACE_PLANT_SCALE, type GrowthModCtx } from '@/lib/growth';
import { makeCropFor, makeCropForCustom } from '@/creative/crops/map';
import { parseKey } from '@/lib/plan';
import { isoDayNumber, isoFromDayNumber } from '@/lib/sim/environment';
import { projectPlant, stageCountFor, type PlantViewParams } from '@/lib/sim/view';
import { envToWeatherCurrent } from '@/lib/sim/runWeather';
import type { DailyEnvironment } from '@/lib/sim/types';
import type { CellState } from '@/lib/sim/types';
import { BEES_PER_FLOWERING_CELL, BUTTERFLIES_PER_FLOWERING_CELL, isInsectPollinated } from '@/lib/sim/ecosystem';
import type { PlanState, ScenarioType, Weather, WeatherCurrent, Crop } from '@/types';
import type { RunRecord, SimEvent, SimState } from '@/lib/sim';
import {
  buildCellDiagnostics,
  buildRunProgressRows,
  runDateISO,
  runDayEnv,
  type CellDiagnosticRow,
  type RunProgressRow,
  type SimRunController,
} from '@/hooks/useSimRun';
import { buildAnimals, disposeAnimals, setFaunaPresence, updateAnimals, type AnimalSystem, type FaunaPresence } from '@/three/animals';
import { buildDressing, disposeDressing, type DressingSystem } from '@/three/dressing';
import { createAudioAtmosphere, type AudioAtmosphere } from '@/three/audio';
import { createClouds, type Clouds } from '@/three/clouds';
import { createEngine, setEngineOrbitEnabled, type Engine } from '@/three/engine';
import { createFlightCamera, type FlightCamera } from '@/three/flight';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { __padProbe, advancePlantGrowth, buildPlants, disposePlants, type PlantBatch, type PlantUpdateOptions, swayPlants, updatePlants } from '@/three/plants';
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
import { MOISTURE_BANDS, SimDrawer, type CropProgressRow, type ClimateBaselineInfo } from './SimDrawer';

/** Provenance tag for the growth model's baseline temperature (spec §3.3:
 * every number traces to its source). */
const DEFAULT_CLIMATE_BASELINE: ClimateBaselineInfo = {
  tempC: DEFAULT_BASELINE_TEMP_C,
  source: 'default-20c',
};

/** Run-mode shim: plantedAt far past any displayed date makes the closed-form
 * growthProgress compute 0, so updatePlants' max(clamp) lets the run's
 * biomassFrac override win (plants.ts contract — see applyRunGrowth). */
const FAR_FUTURE_ISO = '9999-12-31';

// ---------------------------------------------------------------------------
// Ghost-run rendering (SPEC-SIM-ECOSYSTEM §3.5 Phase 4) — the A/B "what was vs
// what if" view: a second run's plants render SEMI-TRANSPARENT beside the
// solid primary.
//
// MATERIAL LIFECYCLE — READ BEFORE TOUCHING: src/three/plants.ts owns THE
// shared session-lifetime (crop,stage) template cache, and its template
// materials are tint-mutated IN PLACE by the stress path. It does not export
// the cache, and sharing those materials with a transparency-overriding ghost
// would corrupt every real plant. The creative builders (makeCropFor) are
// DETERMINISTIC — same (name, stage) ⇒ identical geometry — so the ghost uses
// its own parallel template cache below (geometry ONLY, session lifetime,
// same normalization/merge math as plants.ts) and every ghost InstancedMesh
// gets a fresh TRANSPARENT material CLONE that is disposed on ghost
// removal/teardown. NEVER dispose or tint-mutate plants.ts's cached
// materials from here, and never put ghost materials into any shared cache.
// ---------------------------------------------------------------------------

/** Ghost opacity — kept well under the solid plants so the A/B reads at a
 * glance; depthWrite off avoids self-sorting artifacts between instances. */
const GHOST_OPACITY = 0.45;
/** Draw-cost guard: ghost batches cap at this many distinct (crop,stage)
 * templates (a plan with more is theoretically possible via custom crops;
 * catalog farms sit at ≤ ~20). Excess stages are dropped + reported. */
const GHOST_MAX_TEMPLATES = 60;

interface GhostRunBatch {
  /** `${cropId}|${stage}` */
  key: string;
  mesh: THREE.InstancedMesh;
  capacity: number;
  /** Per-cell render state; slot index == position in this array. */
  entries: GhostCellEntry[];
}

/** One ghost cell's per-instance render data (wave 4 growth easing):
 *  visualP eases toward targetP per frame (advanceGhostGrowth), carried
 *  across stage re-buckets and rebuilds via ghostVisualPByCell so a day
 *  tick never pops. */
interface GhostCellEntry {
  key: string;
  px: number;
  py: number;
  pz: number;
  rotY: number;
  /** jitter.scaleY — per-cell genetic height multiplier. */
  baseScale: number;
  /** ghostTemplateScaleT(stage) — converts biomass→height within the stage. */
  denom: number;
  targetP: number;
  visualP: number;
}

/** Last eased biomass per ghost cell — read at reconcile (carry), written by
 *  advanceGhostGrowth (per frame). Cleared when ghosts are torn down. */
const ghostVisualPByCell = new Map<string, number>();

/** Scratch writer shared by reconcile + advanceGhostGrowth (no allocation). */
const ghostDummy = new THREE.Object3D();
function writeGhostEntry(mesh: THREE.InstancedMesh, slot: number, e: GhostCellEntry): void {
  ghostDummy.position.set(e.px, e.py, e.pz);
  ghostDummy.rotation.set(0, e.rotY, 0);
  ghostDummy.scale.setScalar(((0.15 + 0.85 * e.visualP) / e.denom) * e.baseScale);
  ghostDummy.updateMatrix();
  mesh.setMatrixAt(slot, ghostDummy.matrix);
}

/** Session-lifetime ghost geometry cache (geometry only — materials are
 * per-build clones, see the lifecycle note above). */
const ghostTemplateCache = new Map<string, THREE.BufferGeometry>();

// --- Mirrors of plants.ts's non-exported normalization internals. The ghost
// must read as the SAME crop at the SAME stage/height as the solid plants, so
// these replicate plants.ts byte-for-byte; keep them in sync if plants.ts
// changes its height/scale tables.
function ghostTemplateScaleT(stage: number): number {
  return 0.15 + 0.85 * (stage / 5);
}
const GHOST_HEIGHT_RANGE: Record<string, [number, number]> = {
  vegetable: [0.7, 1.4],
  herb: [0.35, 0.7],
  fruit: [1.4, 2.6],
  grain: [0.8, 1.5],
  flower: [0.5, 1.6],
  cover_crop: [0.2, 0.45],
  fungus: [0.35, 0.9],
};
function ghostPlantHeight(crop: Crop): number {
  const [minH, maxH] = GHOST_HEIGHT_RANGE[crop.category] ?? [0.7, 1.4];
  const t = Math.max(0, Math.min(1, (crop.growthDays - 50) / 50));
  return minH + t * (maxH - minH);
}
const GHOST_SHELF_LIFTS: Record<string, [number, number, number]> = {
  'plant-rack': [0.28, 0.68, 1.08],
  'hydro-channel': [0.32, 0.64, 0.96],
  'grow-bench': [0.58, 0.58, 0.58],
};
function ghostShelfForCell(cellX: number, cellY: number): number {
  return Math.abs((cellX * 73856093 ^ cellY * 19349663) | 0) % 3;
}
function ghostJitterForCell(cellX: number, cellY: number, cellM: number): {
  rotY: number;
  scaleY: number;
  offsetX: number;
  offsetZ: number;
} {
  const seed = cellX * 73856093 ^ cellY * 19349663;
  const random = ((seed * 9301 + 49297) % 233280) / 233280;
  return {
    rotY: (random - 0.5) * 0.5,
    scaleY: 0.85 + random * 0.3,
    offsetX: (random - 0.5) * cellM * 0.3,
    offsetZ: (((random * 1.618) % 1) - 0.5) * cellM * 0.3,
  };
}

/** Cached ghost geometry for a (crop, stage, template height): the same
 * normalize (bbox height → target, base at y=0) + merge vertex-colored meshes
 * pipeline plants.ts uses. Returns null when the crop name has no creative
 * asset (procedural-fallback crops have no ghost in v1). */
function getGhostTemplate(crop: Crop, stage: number, height: number): THREE.BufferGeometry | null {
  const key = `${crop.name}|${stage}|${height.toFixed(3)}`;
  const hit = ghostTemplateCache.get(key);
  if (hit) return hit;

  const asset = makeCropFor(crop.name, stage)
    ?? makeCropForCustom(crop.name, crop.category, crop.colorHex, stage); // wave 5: custom crops get ghosts too
  if (!asset) return null;
  const bbox = new THREE.Box3().setFromObject(asset);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  let scaleFactor = 1;
  if (size.y > 1e-6) scaleFactor = height / size.y;
  const holder = new THREE.Group();
  holder.add(asset);
  asset.scale.multiplyScalar(scaleFactor);
  asset.position.y -= bbox.min.y * scaleFactor;
  holder.updateMatrixWorld(true);

  const parts: THREE.BufferGeometry[] = [];
  holder.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const geo = mesh.geometry;
    if (!geo.getAttribute('color')) return; // animated / non-voxel part
    const clone = geo.clone();
    clone.applyMatrix4(mesh.matrixWorld);
    parts.push(clone);
  });
  if (parts.length === 0) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) return null;
  for (let i = 1; i < parts.length; i++) parts[i]?.dispose();

  ghostTemplateCache.set(key, merged);
  return merged;
}

/** Fresh transparent material for one ghost batch — a per-build CLONE in
 * spirit: never shared, never cached, disposed with the batch (the cached
 * template MATERIALS in plants.ts must never be mutated or disposed here). */
function makeGhostMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
  });
}

function disposeOneGhostBatch(batch: GhostRunBatch): void {
  batch.mesh.removeFromParent();
  batch.mesh.dispose(); // instance buffers
  // Dispose ONLY the batch-owned transparent clone. The geometry lives in
  // ghostTemplateCache (session lifetime) and is intentionally kept.
  (batch.mesh.material as THREE.Material).dispose();
}

/**
 * Reconcile the ghost batches (in place, day-keyed — called once per sim-day
 * commit, never per frame): diff the wanted (crop,stage) groups against the
 * live batches, dispose stale groups, grow/recreate undersized meshes, and
 * rewrite instance matrices. Draw cost = distinct (crop,stage) in the ghost,
 * capped at GHOST_MAX_TEMPLATES. Ghosts snap per-day (no advancePlantGrowth
 * easing — documented v1 choice) and sit +0.01 above the real plants to
 * avoid z-fighting.
 */
function reconcileGhostRunBatches(
  batches: GhostRunBatch[],
  args: {
    record: RunRecord; // the GHOST record — basePlan is the ghost's own fork
    state: SimState; // ghost state at the current lockstep day
    cropById: Map<number, Crop>;
    scene: THREE.Scene;
  },
): number {
  const plan = args.record.config.basePlan;
  const cellM = plan.cellM;
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);

  // Wanted groups: ghost state cells placed on the GHOST's own plan (honest
  // fork view — cells the live plan lost still render as the what-if).
  interface Wanted {
    geometry: THREE.BufferGeometry;
    crop: Crop;
    stage: number;
    keys: string[];
  }
  const wanted = new Map<string, Wanted>();
  let templateCount = 0;
  let capped = false;
  for (const [key, cell] of Object.entries(args.state.cells)) {
    if (plan.planting[key] === undefined) continue;
    const groupKey = `${cell.cropId}|${cell.stage}`;
    let w = wanted.get(groupKey);
    if (!w) {
      if (templateCount >= GHOST_MAX_TEMPLATES) {
        capped = true;
        continue;
      }
      const crop = args.cropById.get(cell.cropId);
      if (!crop) continue;
      const fullHeight = ghostPlantHeight(crop) * SURFACE_PLANT_SCALE[plan.surface ?? 'outdoor'];
      const geometry = getGhostTemplate(crop, cell.stage, fullHeight * ghostTemplateScaleT(cell.stage));
      if (!geometry) continue; // unmapped-name crop: no ghost (documented v1 gap)
      w = { geometry, crop, stage: cell.stage, keys: [] };
      wanted.set(groupKey, w);
      templateCount++;
    }
    w.keys.push(key);
  }
  if (capped) {
    // Draw-budget guard report (spec: cap and report). Console-only: the
    // situation is a pathology, not a user action.
    console.warn(
      `[ghost] run ${args.record.label}: >${GHOST_MAX_TEMPLATES} distinct (crop,stage) templates — extra stages dropped`,
    );
  }

  // Remove stale groups.
  for (let i = batches.length - 1; i >= 0; i--) {
    const b = batches[i]!;
    if (!wanted.has(b.key)) {
      disposeOneGhostBatch(b);
      batches.splice(i, 1);
    }
  }

  for (const [groupKey, w] of wanted) {
    let b = batches.find((x) => x.key === groupKey);
    if (!b) {
      const mesh = new THREE.InstancedMesh(w.geometry, makeGhostMaterial(), Math.max(w.keys.length, 8));
      mesh.name = `ghost-run:${w.crop.name}:s${w.stage}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false; // instances span the whole plan
      mesh.count = 0;
      args.scene.add(mesh);
      b = { key: groupKey, mesh, capacity: Math.max(w.keys.length, 8), entries: [] };
      batches.push(b);
    } else if (b.capacity < w.keys.length) {
      // Grow: recreate instance buffers + the transparent clone; the cached
      // ghost geometry is shared and NEVER disposed here.
      disposeOneGhostBatch(b);
      const mesh = new THREE.InstancedMesh(w.geometry, makeGhostMaterial(), w.keys.length);
      mesh.name = `ghost-run:${w.crop.name}:s${w.stage}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      args.scene.add(mesh);
      b.mesh = mesh;
      b.capacity = w.keys.length;
    }

    const denom = ghostTemplateScaleT(w.stage);
    const entries: GhostCellEntry[] = [];
    w.keys.forEach((key, i) => {
      const [cx, cy] = parseKey(key);
      const jitter = ghostJitterForCell(cx, cy, cellM);
      const liftSlugs = GHOST_SHELF_LIFTS[plan.ground[key] ?? ''];
      const lift = liftSlugs ? liftSlugs[ghostShelfForCell(cx, cy)]! : 0;
      // Biomass → scale: the SAME template-scale math as plants.ts
      // writeCellMatrix, so a ghost that is "ahead" is visibly taller at the
      // same stage boundary. visualP carries the eased biomass across day
      // ticks (wave 4 ghost easing); cells new to the ghost start at target
      // so nothing pops in mid-grow.
      const targetP = Math.min(1, Math.max(0, args.state.cells[key]!.biomassFrac));
      const entry: GhostCellEntry = {
        key,
        px: cx * cellM + cellM / 2 + offsetX + jitter.offsetX,
        py: 0.02 + lift, // +0.01 over the real plants' y=0.01 — no z-fighting
        pz: cy * cellM + cellM / 2 + offsetZ + jitter.offsetZ,
        rotY: jitter.rotY,
        baseScale: jitter.scaleY,
        denom,
        targetP,
        visualP: ghostVisualPByCell.get(key) ?? targetP,
      };
      entries.push(entry);
      ghostVisualPByCell.set(key, entry.visualP);
      writeGhostEntry(b.mesh, i, entry);
    });
    b.entries = entries;
    b.mesh.count = w.keys.length;
    b.mesh.instanceMatrix.needsUpdate = true;
  }
  return templateCount;
}

/** Dispose every ghost batch (ghost clear / world teardown): instance
 * buffers + the per-batch transparent material CLONE only — cached ghost
 * geometry persists for the session (plants.ts cache discipline). */
/**
 * Per-frame ghost growth easing (wave 4): each ghost cell's visual biomass
 * eases toward the target captured by the last reconcile — the same contract
 * as plants.ts advancePlantGrowth (allocation-free; instance matrices are
 * rewritten only while a diff persists; zero extra draw calls). Called from
 * the rAF loop only when ghost batches exist.
 */
function advanceGhostGrowth(batches: GhostRunBatch[], dt: number, easeRate = 4): void {
  const step = Math.min(1, dt * easeRate);
  if (step <= 0) return;
  for (const batch of batches) {
    if (batch.entries.length === 0) continue;
    let touched = false;
    batch.entries.forEach((e, slot) => {
      const diff = e.targetP - e.visualP;
      if (diff > 1e-4 || diff < -1e-4) {
        e.visualP += diff * step;
        if (Math.abs(e.targetP - e.visualP) < 1e-4) e.visualP = e.targetP;
        ghostVisualPByCell.set(e.key, e.visualP);
        writeGhostEntry(batch.mesh, slot, e);
        touched = true;
      }
    });
    if (touched) batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

function disposeGhostRunBatches(batches: GhostRunBatch[]): void {
  for (const b of batches) disposeOneGhostBatch(b);
  batches.length = 0;
  ghostVisualPByCell.clear(); // ghosts are gone — no carry state to preserve
}

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
  /** Active sim run (SPEC-SIM-ECOSYSTEM Phase 1/2). When a run is active the
   * plant reconcile reads SimState biomass instead of the closed-form scrub
   * path; the legacy path stays fully intact as the no-run fallback. */
  simRun?: SimRunController | null;
  /** Other runs of this farm offered as ghost comparisons (Phase 4); the
   * active primary is filtered out before the picker renders. */
  compareRuns?: RunRecord[];
  /** Outbound notable-event sink (harvest-ready → celebrate). PlotDesigner
   * owns the ref; useSimRun fires it per stepped day. */
  runEventsRef?: { current: ((events: SimEvent[], state: SimState) => void) | null };
}

/** DEV-only #ff-env-bridge DOM probe (created lazily in the rAF loop when a
 * vis demo or the Perf HUD is active) — headless gates assert the bridged
 * weather text (wave 4). */
let bridgeProbeEl: HTMLElement | null = null;
function ensureBridgeProbe(): HTMLElement {
  if (!bridgeProbeEl) {
    bridgeProbeEl = document.createElement('span');
    bridgeProbeEl.id = 'ff-env-bridge';
    bridgeProbeEl.style.display = 'none';
    document.body.appendChild(bridgeProbeEl);
  }
  return bridgeProbeEl;
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

export default function World3D({ editor, cinema = false, onToggleCinema, simRun = null, compareRuns, runEventsRef }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundBatchesRef = useRef<GroundBatch[]>([]);
  const structureBatchesRef = useRef<StructureGroup[]>([]);
  const plantBatchesRef = useRef<PlantBatch[]>([]);
  const waterPlanesRef = useRef<WaterPlane[]>([]);
  const shellRef = useRef<ShellGroup | null>(null);
  const undoGhostsRef = useRef<GhostBatch[]>([]);
  const redoGhostsRef = useRef<GhostBatch[]>([]);
  // Ghost-run plant batches (Phase 4) — disposed on ghost clear / teardown.
  const ghostRunBatchesRef = useRef<GhostRunBatch[]>([]);

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
  // Run-env bridge (SPEC-GROWTH-VISUAL wave 4): when a sim run is active this
  // holds the run's envSeries day; the rAF loop projects it onto the live-
  // weather shape so clouds/rain/fog/wind/sun tell the run's story. Null ⇒ the
  // live-weather path runs byte-identically.
  const runEnvRef = useRef<DailyEnvironment | null>(null);
  // Day-keyed bridge output (envToWeatherCurrent of runEnvRef) — the rAF loop
  // reads this instead of projecting per frame, so the run-weather path stays
  // allocation-free. Always written together with runEnvRef.
  const runWeatherRef = useRef<WeatherCurrent | null>(null);
  // Chip-level preview of the bridged run weather (day-keyed, not per-frame):
  // when the live fetch is unavailable the weather chip shows the RUN's day
  // instead of a blank — the HUD tells the same story as the sky (wave 4).
  const [runWeatherPreview, setRunWeatherPreview] = useState<WeatherCurrent | null>(null);
  // DEV-only: per-cell water/moisture ranges of the active vis demo (probe text).
  const visStatsRef = useRef<{ n: number; wLo: number; wHi: number; mLo: number; mHi: number } | null>(null);
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
  showDebugRef.current = showDebug;
  const [audioOn, setAudioOn] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Run-mode UI state (moisture overlay is opt-in; drawer row selection).
  const [showMoisture, setShowMoisture] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  // Moisture-band overlay meshes (≤4 InstancedMesh batches, run mode only).
  const moistureRef = useRef<THREE.InstancedMesh[]>([]);

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

  // --- Run mode mirrors (SPEC-SIM-ECOSYSTEM Phase 1/2) ---
  const runActive = simRun?.record != null;
  const runRecord = simRun?.record ?? null;
  const runTickVersion = simRun?.tickVersion ?? 0;
  const runDayIndex = simRun?.dayIndex ?? 0;
  // Ghost comparison (Phase 4): stable dep values for the day-keyed ghost
  // reconcile — ghostRecord/ghostVersion only change on load/clear/(re)fold.
  const runGhostRecord = simRun?.ghostRecord ?? null;
  const runGhostVersion = simRun?.ghostVersion ?? 0;
  const simRunRef = useRef(simRun);
  simRunRef.current = simRun;
  const runActiveRef = useRef(runActive);
  runActiveRef.current = runActive;

  // DEV-only Tier-1/2 proof hooks (SPEC-GROWTH-VISUAL §4): ?ffvis=stress
  // paints a deterministic synthetic water-stress gradient; ?ffvis=lifecycle
  // additionally drives the dead/harvested/overripe state geometry — both
  // through the REAL projectPlant → viewByCell path (no sim run required).
  // Same launch-param family as ffdebug.
  const visDemo = import.meta.env.DEV ? readLaunchParams().get('ffvis') : null;
  const visStressDemo = visDemo === 'stress';
  const visLifecycleDemo = visDemo === 'lifecycle';
  const visDroughtDemo = visDemo === 'drought';
  const visRainDemo = visDemo === 'rain';

  /**
   * Run-mode plant reconcile: SimState biomass is the growth authority.
   * updatePlants clamps the per-cell override against the closed-form
   * progress (max of both), so the shim points every live plan cell's
   * plantedAt far past the displayed date — computed becomes 0 and the run's
   * biomassFrac wins. The per-frame easing in advancePlantGrowth (already in
   * the rAF closure) interpolates between sim days with zero rebuilds.
   */
  const applyRunGrowth = () => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    const run = simRunRef.current;
    const record = run?.record ?? null;
    const st = run?.simStateRef.current ?? null;
    if (!engine || !plan || !record || !st) return;
    const plantedAtShim: Record<string, string> = {};
    for (const key of Object.keys(plan.planting)) plantedAtShim[key] = FAR_FUTURE_ISO;
    const shimPlan: PlanState = { ...plan, plantedAt: plantedAtShim };
    // View projection (SPEC-GROWTH-VISUAL §2.1): per-cell growth, stage, wilt
    // and stress tint all derive from the pure seam — the aggregation (MAX of
    // the four stress terms + pest × 0.8) lives in view.ts effectiveStress.
    const viewByCell = new Map<string, PlantViewParams>();
    for (const [key, cell] of Object.entries(st.cells)) {
      if (plan.planting[key] === undefined) continue; // cell no longer in the live plan
      const crop = editor.cropById.get(cell.cropId);
      if (!crop) continue;
      viewByCell.set(
        key,
        projectPlant({ cell, crop, env: runDayEnv(record, st.dayIndex), dayIndex: st.dayIndex, cellKey: key, stageCount: stageCountFor(crop.name) }),
      );
    }
    const runDate = new Date(`${runDateISO(record, st.dayIndex)}T00:00:00`);
    plantBatchesRef.current = updatePlants(
      plantBatchesRef.current,
      shimPlan,
      editor.cropById,
      engine.scene,
      runDate,
      undefined,
      growthCtxRef.current,
      { viewByCell },
    );
  };

  // Outbound run events → harvest celebration at the harvested cells' world
  // positions (render-body assignment, same pattern as handlersRef; nulled on
  // unmount by the effect below). Particle cost is bounded by capping cells.
  if (runEventsRef) {
    runEventsRef.current = (events) => {
      const fx = growthFXRef.current;
      const plan = editor.planRef.current;
      if (!fx || !plan) return;
      const ready = events.filter((e) => e.kind === 'harvest-ready' && typeof e.cell === 'string');
      if (ready.length === 0) return;
      const offsetX = -(plan.widthM / 2);
      const offsetZ = -(plan.heightM / 2);
      const positions: THREE.Vector3[] = [];
      for (const ev of ready.slice(0, 12)) {
        const [cx, cy] = parseKey(ev.cell as string);
        positions.push(
          new THREE.Vector3(cx * plan.cellM + plan.cellM / 2 + offsetX, 0.5, cy * plan.cellM + plan.cellM / 2 + offsetZ),
        );
      }
      fx.celebrate(positions);
    };
  }

  useEffect(() => {
    if (!runEventsRef) return;
    const ref = runEventsRef;
    return () => {
      ref.current = null; // unmounted World3D must not receive run events
    };
  }, [runEventsRef]);

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
      // Paused entirely while a sim run is active — the run owns sim time.
      if (playingRef.current && !runActiveRef.current) {
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

      // Sky — use ref value for rAF, sync to state periodically. Under an
      // active sim run the env bridge also dims the sun/ambient with the run
      // day's cloud cover; the live path passes 0 (byte-identical behavior).
      // The bridged WeatherCurrent is cached day-keyed in runWeatherRef —
      // recomputing it here would allocate a fresh object every frame.
      const runWeather = runWeatherRef.current;
      sky.update(timeRef.current, runWeather ? runWeather.cloudCover / 100 : 0);
      // DEV-only env-bridge probe (?ffdebug=1): machine-assertable DOM text so
      // headless gates can prove WHICH weather the world is rendering with.
      if (import.meta.env.DEV && (visDemo !== null || showDebugRef.current)) {
        // Written every frame (display:none span — no layout cost) so
        // virtual-time headless captures can never miss it.
        const el = ensureBridgeProbe();
        const padInfo = __padProbe();
        const padTxt = padInfo ? ` ff-pads flat=${padInfo.flat} hilled=${padInfo.hilled} c=[${padInfo.sample}] ${padInfo.dbg}` : ' ff-pads none';
        const stats = visStatsRef.current;
        el.textContent = runWeather
          ? `ff-env-bridge ${runWeather.weatherDesc} c=${runWeather.cloudCover.toFixed(0)} h=${runWeather.humidity} w=${runWeather.windSpeedKmh.toFixed(1)}${stats ? ` ff-viscells n=${stats.n} wLo=${stats.wLo.toFixed(2)} wHi=${stats.wHi.toFixed(2)} mLo=${stats.mLo.toFixed(2)} mHi=${stats.mHi.toFixed(2)}` : ''}${padTxt}`
          : `ff-env-bridge off (live)${stats ? ` ff-viscells n=${stats.n} wLo=${stats.wLo.toFixed(2)} wHi=${stats.wHi.toFixed(2)} mLo=${stats.mLo.toFixed(2)} mHi=${stats.mHi.toFixed(2)}` : ''}${padTxt}`;
      }
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
      // arrives (and forever when offline); a run's env day OVERRIDES it. No
      // per-frame allocations on either path.
      const w = runWeather ?? weatherRef.current ?? DEFAULT_WEATHER;
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
      // Ghost-run plants ease under the same contract (wave 4) — no-op when
      // no ghost is loaded.
      if (ghostRunBatchesRef.current.length > 0) {
        advanceGhostGrowth(ghostRunBatchesRef.current, dt);
      }

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
      disposeGhostRunBatches(ghostRunBatchesRef.current); // Phase 4 ghost-run plants
      disposeAnimals(animalsRef.current!);
      if (dressingRef.current) disposeDressing(dressingRef.current);
      sky.dispose();
      clouds.dispose();
      weatherFX.dispose();
      growthFXRef.current?.dispose();
      growthFXRef.current = null; // late run-event callbacks become no-ops
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
    if (runActiveRef.current) {
      // Run mode owns the plant reconcile — keep run targets while the rest
      // of the scene rebuilds (next run commit would restore them anyway).
      applyRunGrowth();
    } else {
      plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene, new Date(scrubDateRef.current), scenarioRef.current, growthCtxRef.current);
    }

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
  // Skipped while a sim run is active: the run-mode effect below owns the
  // reconcile then; runActive in deps restores this projection on run end.
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    if (runActiveRef.current) return;
    // A DEV vis demo owns the plant reconcile while active: this effect's
    // async deps (ambientTempC/climateBaseline landing late) would otherwise
    // rewrite plants/pads untinted AFTER the demo applied its view — and
    // under virtual-time headless captures the demo's re-apply would never
    // get a rendered frame (the round-1/2 critic failures).
    if (visStressDemo || visLifecycleDemo || visDroughtDemo || visRainDemo) return;
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
  }, [scrubDate, scenario, ambientTempC, climateBaseline, editor.cropById, runActive]);

  // Run-mode growth reconcile: run state (per-cell biomass) is the target.
  // Separate effect — the init effect's deps stay [sceneReady, farmId], and
  // sceneReady covers the case where the world initializes AFTER a run was
  // launched via ?ffrun. advancePlantGrowth (rAF) eases between sim days.
  useEffect(() => {
    if (!runActive) {
      runEnvRef.current = null; // run ended — live weather owns the sky again
      runWeatherRef.current = null;
      setRunWeatherPreview(null);
      return;
    }
    const run = simRunRef.current;
    const env = run?.record ? runDayEnv(run.record, run.simStateRef.current?.dayIndex ?? 0) : null;
    runEnvRef.current = env;
    const bridged = env ? envToWeatherCurrent(env, DEFAULT_WEATHER) : null;
    runWeatherRef.current = bridged;
    setRunWeatherPreview(bridged);
    applyRunGrowth();
  }, [runActive, runTickVersion, sceneReady, editor.cropById, editor.planVersion]);

  // DEV-only (ffvis=stress|lifecycle|drought): deterministic synthetic cell
  // states over the live plan → REAL projectPlant → viewByCell
  // (SPEC-GROWTH-VISUAL §4 acceptance evidence). lifecycle mode drives the
  // Tier-2 state geometry (dead / harvested / overripe zones toward the far
  // corner); drought mode additionally sets runEnvRef to a scorcher env day so
  // the REAL env→weather bridge paints the sky (wave 4). Suppressed whenever a
  // real run is active.
  useEffect(() => {
    if ((!visStressDemo && !visLifecycleDemo && !visDroughtDemo && !visRainDemo) || runActive) return;
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    const keys = Object.keys(plan.planting);
    if (keys.length === 0) return;
    if (visDroughtDemo || visRainDemo) {
      runEnvRef.current = visRainDemo
        ? {
            date: '2026-06-05',
            tMinC: 14,
            tMaxC: 18,
            precipMm: 12,
            etoMm: 1.5,
            gddBase10C: 8,
            provenance: { tMinC: 'era5-normals', tMaxC: 'era5-normals', precipMm: 'era5-normals', etoMm: 'era5-normals' },
          }
        : {
            date: '2026-07-15',
            tMinC: 22,
            tMaxC: 38,
            precipMm: 0,
            etoMm: 7.5,
            gddBase10C: 28,
            provenance: { tMinC: 'era5-normals', tMaxC: 'era5-normals', precipMm: 'era5-normals', etoMm: 'era5-normals' },
          };
      const demoBridged = envToWeatherCurrent(runEnvRef.current, DEFAULT_WEATHER);
      runWeatherRef.current = demoBridged;
      setRunWeatherPreview(demoBridged);
    }
    let span = 1;
    for (const key of keys) {
      const [, cy] = parseKey(key);
      span = Math.max(span, cy);
    }
    const plantedAtShim: Record<string, string> = {};
    const viewByCell = new Map<string, PlantViewParams>();
    for (const key of keys) {
      plantedAtShim[key] = FAR_FUTURE_ISO;
      // Depth bands (cell row only, not the diagonal): the default camera
      // looks across the field, so near→far rows read as the life story
      // healthy → stressed → dead → overripe → harvested.
      const [, cy] = parseKey(key);
      const v = Math.min(1, cy / span);
      const crop = editor.cropById.get(plan.planting[key]!);
      if (!crop) continue;
      let water = visStressDemo || visDroughtDemo ? v : visRainDemo ? 0.04 : v * 0.75;
      const extra: Partial<CellState> = {};
      if (visLifecycleDemo) {
        if (v > 0.92) {
          extra.harvested = true;
          extra.readyAtDay = 45;
          water = 0.2;
        } else if (v > 0.84) {
          extra.readyAtDay = 30; // day 60 > 30 + grace ⇒ overripe
          water = 0.35;
        } else if (v > 0.76) {
          extra.stressDaysCount = 30;
          water = 0.9;
        }
      }
      const cell: CellState = {
        cropId: crop.id,
        plantedAtDay: 0,
        moistureFrac: visRainDemo ? 0.95 : visDroughtDemo ? 1 - water : 1 - water * 0.8,
        nitrogenKgHa: 120,
        gddAccumC: 950,
        biomassFrac: visLifecycleDemo ? 0.95 : 0.85,
        stage: visLifecycleDemo ? 5 : 4,
        floweringFrac: 0.2,
        pestPressure: 0,
        stress: { water, heat: 0, cold: 0, nitrogen: 0 },
        ...extra,
      };
      viewByCell.set(key, projectPlant({ cell, crop, env: null, dayIndex: 60, cellKey: key, stageCount: stageCountFor(crop.name) }));
    }
    if (import.meta.env.DEV) {
      let wLo = 1; let wHi = 0; let mLo = 1; let mHi = 0;
      for (const p of viewByCell.values()) {
        // stress demo cells: water = 1 - g of the tint (invert of stressTintMultiplier)
        const water = 1 - (p.tint ? (1 - p.tint.g) / 0.35 : 0);
        wLo = Math.min(wLo, water); wHi = Math.max(wHi, water);
        const m = p.moisture ?? 0.5;
        mLo = Math.min(mLo, m); mHi = Math.max(mHi, m);
      }
      visStatsRef.current = { n: viewByCell.size, wLo, wHi, mLo, mHi };
    }
    plantBatchesRef.current = updatePlants(
      plantBatchesRef.current,
      { ...plan, plantedAt: plantedAtShim },
      editor.cropById,
      engine.scene,
      new Date(),
      undefined,
      growthCtxRef.current,
      { viewByCell },
    );
    return () => {
      if (visDroughtDemo || visRainDemo) {
        runEnvRef.current = null;
        runWeatherRef.current = null;
        setRunWeatherPreview(null);
      }
      visStatsRef.current = null;
    };
    // scenario/ambientTempC/climateBaseline mirror the legacy scrub effect's
    // async deps: those land AFTER this demo effect first ran and the legacy
    // pass (declared above) would rewrite plants/pads untinted in the same
    // commit — re-applying here (this effect runs last per commit) keeps the
    // demo the final writer.
  }, [visStressDemo, visLifecycleDemo, visDroughtDemo, visRainDemo, runActive, sceneReady, editor.planVersion, editor.cropById, scrubDate, scenario, ambientTempC, climateBaseline]);

  // Ghost-run reconcile (spec §3.5 Phase 4): reconciles the semi-transparent
  // second-run plants beside the solid primary. Day-keyed like the moisture
  // overlay — NOT tickVersion (~5 commits/s would churn GPU buffers for a
  // per-day change); runGhostVersion covers same-day ghost loads/clears/
  // refolds, and planVersion re-applies after whole-scene rebuilds. In-place
  // batch reconcile: draw cost = distinct (crop,stage) in the ghost (≤60);
  // per-frame work is only the growth easing while diffs persist (wave 4);
  // materials are per-batch transparent clones.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const run = simRunRef.current;
    const gRec = run?.ghostRecord ?? null;
    const gState = run?.ghostStateRef.current ?? null;
    if (!runActive || !gRec || !gState) {
      // No ghost (or not folded yet): drop whatever is on screen.
      disposeGhostRunBatches(ghostRunBatchesRef.current);
      return;
    }
    reconcileGhostRunBatches(ghostRunBatchesRef.current, {
      record: gRec,
      state: gState,
      cropById: editor.cropById,
      scene: engine.scene,
    });
  }, [runActive, runGhostRecord, runGhostVersion, runDayIndex, sceneReady, editor.planVersion]);

  // Moisture overlay (spec §3.3): opt-in ground tint over planted cells,
  // bucketed into 4 moisture bands — one InstancedMesh per band (≤4 extra
  // draw calls), historyViz dispose discipline (own geometry+material each).
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    if (!engine || !plan) return;
    const disposeOverlay = () => {
      for (const mesh of moistureRef.current) {
        mesh.removeFromParent();
        (mesh.material as THREE.Material).dispose();
        mesh.geometry.dispose();
      }
      moistureRef.current = [];
    };
    const run = simRunRef.current;
    const st = run?.simStateRef.current ?? null;
    if (!runActive || !showMoisture || !st) {
      disposeOverlay();
      return;
    }
    const offsetX = -(plan.widthM / 2);
    const offsetZ = -(plan.heightM / 2);
    const byBand: string[][] = [[], [], [], []];
    for (const [key, cell] of Object.entries(st.cells)) {
      if (plan.planting[key] === undefined) continue;
      const m = cell.moistureFrac;
      const band = m < 0.25 ? 0 : m < 0.5 ? 1 : m < 0.75 ? 2 : 3;
      byBand[band]!.push(key);
    }
    const meshes: THREE.InstancedMesh[] = [];
    byBand.forEach((keys, band) => {
      if (keys.length === 0) return;
      const geometry = new THREE.BoxGeometry(plan.cellM * 0.96, 0.02, plan.cellM * 0.96);
      const material = new THREE.MeshBasicMaterial({
        color: MOISTURE_BANDS[band]!.color,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, keys.length);
      mesh.name = `moisture:band${band}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const dummy = new THREE.Object3D();
      keys.forEach((key, i) => {
        const [cx, cy] = parseKey(key);
        dummy.position.set(cx * plan.cellM + plan.cellM / 2 + offsetX, 0.02, cy * plan.cellM + plan.cellM / 2 + offsetZ);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      engine.scene.add(mesh);
      meshes.push(mesh);
    });
    moistureRef.current = meshes;
    return disposeOverlay;
    // Keyed on the sim DAY, not tickVersion: moisture evolves per sim-day, so
    // rebuilding on every throttled commit (~5/s) would just churn GPU buffers.
  }, [runActive, showMoisture, runDayIndex, sceneReady, editor.planVersion]);

  // Run-mode fauna presence (spec §3.4 "live ecosystem dressing"): pollinator
  // flock fractions come from SimState.creatures ÷ this day's flowering
  // capacity — the SAME denominators ecosystem.creaturesFromCells uses (bees:
  // Σ floweringFrac of insect-pollinated cells × BEES_PER_FLOWERING_CELL 8;
  // butterflies: Σ floweringFrac × 3), so the fraction is ≤1 by construction
  // and clamped anyway. setFaunaPresence only flips visibility flags (zero
  // allocations, no rebuilds). Keyed on the sim DAY like the moisture
  // overlay, NOT tickVersion. Deps include sceneReady (world may init after
  // the run starts) and editor.planVersion (the plan-change effect rebuilds
  // animals ABOVE this effect in the same commit — this reapplies the
  // fractions). Run-off and the run-loading window reset to full presence.
  useEffect(() => {
    const animals = animalsRef.current;
    if (!animals) return;
    const full: FaunaPresence = { bees01: 1, butterflies01: 1 };
    const st = runActive ? simRunRef.current?.simStateRef.current ?? null : null;
    if (!st) {
      setFaunaPresence(animals, full); // legacy mode, or run state not replayed yet
      return;
    }
    let beeCap = 0;
    let butterflyCap = 0;
    for (const cell of Object.values(st.cells)) {
      const f = cell.floweringFrac;
      if (f <= 0) continue;
      butterflyCap += f;
      if (isInsectPollinated(cropByIdRef.current.get(cell.cropId))) beeCap += f;
    }
    const creatures = st.creatures;
    setFaunaPresence(animals, {
      bees01: beeCap > 0 ? Math.min(1, (creatures.bees ?? 0) / (beeCap * BEES_PER_FLOWERING_CELL)) : 0,
      butterflies01:
        butterflyCap > 0
          ? Math.min(1, (creatures.butterflies ?? 0) / (butterflyCap * BUTTERFLIES_PER_FLOWERING_CELL))
          : 0,
    });
  }, [runActive, runDayIndex, sceneReady, editor.planVersion]);

  // A run activating (e.g. opened from the Simulations page) surfaces the
  // RunInspector transport so the run is visibly controllable.
  useEffect(() => {
    if (runActive) setDrawerOpen(true);
  }, [runActive]);

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
  // (legacy path only — runs end via their dayCount or the user stopping)
  useEffect(() => {
    if (!playing || runActive) return;
    monotonicProgressRef.current = null; // fresh clamp window per playback run
    matureSinceRef.current = null;
    setSeasonComplete(false);
    seasonDrawerShownRef.current = false;
  }, [playing, runActive]);

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
    if (!playing || runActive) return;
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
  }, [playing, scrubDate, scenario, editor.planVersion, runActive]);

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

  // --- Run-mode drawer payloads (spec §3.3 provenance surfaces) ---
  // Derived from live SimState at each throttled run commit; refs are read
  // inside the memos because the ref is the source of truth between commits.
  const runProgressRows = useMemo<RunProgressRow[]>(() => {
    const run = simRunRef.current;
    const rec = run?.record ?? null;
    const st = run?.simStateRef.current ?? null;
    if (!rec || !st) return [];
    return buildRunProgressRows(st, rec.config.startDate, editor.cropById);
  }, [runTickVersion, runRecord, editor.cropById]);

  const cellDiagnostics = useMemo<CellDiagnosticRow[]>(() => {
    const run = simRunRef.current;
    const rec = run?.record ?? null;
    const st = run?.simStateRef.current ?? null;
    if (!rec || !st) return [];
    return buildCellDiagnostics(st, rec, editor.cropById, runDayEnv(rec, st.dayIndex), run?.ctx?.soil);
  }, [runTickVersion, runRecord, editor.cropById]);

  // The last completed sim day produced the current state (dayIndex counts
  // completed steps) — it drives the provenance chips and the date display.
  const todayEnv = runRecord ? runDayEnv(runRecord, runDayIndex) : null;
  const displayDate = runRecord ? runDateISO(runRecord, runDayIndex) : scrubDate;
  const runEnded = simRun?.ended ?? false;
  const runPlaying = simRun?.playing ?? false;

  // Compare picker (Phase 4): the other runs of this farm as light items —
  // the drawer stays presentational. The active primary is excluded.
  const compareItems = useMemo(() => {
    if (!runActive || !compareRuns) return [];
    return compareRuns
      .filter((r) => r.id !== runRecord?.id)
      .map((r) => ({
        id: r.id,
        label: r.label,
        scenario: r.config.scenario.replace('_', ' '),
        dateRange: `${r.config.startDate} → ${isoFromDayNumber(
          isoDayNumber(r.config.startDate) + Math.max(0, r.config.dayCount - 1),
        )}`,
      }));
  }, [runActive, runRecord?.id, compareRuns]);

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
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${runActive ? (runEnded ? 'bg-green-500' : 'bg-primary') : seasonComplete ? 'bg-amber-500' : 'bg-primary'}`} />
          <span className="whitespace-nowrap">
            {new Date(`${displayDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            {seasonDay !== null && !runActive && <> · Day {Math.min(seasonDay, 365)}</>}
            {runActive && <> · Day {Math.min(runDayIndex, runRecord?.envSeries.length ?? 0)}</>}
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
            onClick={() => {
              if (runActive) {
                // Run transport: the legacy season clock stays parked.
                if (runPlaying) simRunRef.current?.pause();
                else simRunRef.current?.play();
              } else {
                setPlaying((p) => !p);
              }
            }}
            aria-pressed={runActive ? runPlaying : playing}
            title={runActive ? 'Play/pause the simulation run' : 'Play the growing season forward'}
            className={`min-w-[96px] rounded px-2 py-1 text-xs font-medium ${runActive ? (runPlaying ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground') : playing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {runActive ? (runPlaying ? '⏸ Pause' : '▶ Run') : playing ? '⏸ Pause' : '▶ Simulate'}
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
        scrubDate={displayDate}
        onScrubDate={(iso) => {
          if (runActive && runRecord) {
            // Run mode: the date input seeks the run (UTC day-number math).
            const day = isoDayNumber(iso) - isoDayNumber(runRecord.config.startDate);
            simRunRef.current?.seekDay(day);
          } else {
            setScrubDate(iso);
          }
        }}
        onToday={
          runActive
            ? () => simRunRef.current?.seekDay(0)
            : () => setScrubDate(new Date().toISOString().slice(0, 10))
        }
        seasonDay={seasonDay}
        seasonComplete={runActive ? false : seasonComplete}
        onJumpSeasonStart={() => {
          if (earliestPlantedAt) setScrubDate(earliestPlantedAt.toISOString().slice(0, 10));
        }}
        onDismissSeason={() => setSeasonComplete(false)}
        timeOfDay={timeOfDay}
        onTimeOfDay={setTimeOfDay}
        autoTime={autoTime}
        onAutoTime={setAutoTime}
        playing={runActive ? runPlaying : playing}
        simSpeed={simSpeed}
        onSimSpeed={setSimSpeed}
        scenario={scenario}
        onScenario={setScenario}
        scenarioLocked={runActive}
        weather={weather ?? runWeatherPreview}
        weatherCached={weatherCached}
        climateBaseline={climateBaseline}
        cropProgress={runActive ? runProgressRows : cropProgress}
        runLabel={runRecord?.label}
        runTimeline={simRun?.timeline ? { ...simRun.timeline, dayIndex: runDayIndex } : undefined}
        runPlaying={runPlaying}
        runEnded={runEnded}
        runSpeed={simRun?.speed ?? 1}
        onRunPlay={() => simRunRef.current?.play()}
        onRunPause={() => simRunRef.current?.pause()}
        onRunStop={() => {
          setShowMoisture(false);
          setSelectedRowKey(null);
          simRunRef.current?.stopRun();
        }}
        onRunSeek={(day) => simRunRef.current?.seekDay(day)}
        onRunSpeed={(v) => simRunRef.current?.setSpeed(v)}
        dayProvenance={todayEnv?.provenance}
        cellDiagnostics={runActive ? cellDiagnostics : undefined}
        selectedRowKey={selectedRowKey}
        onSelectRow={setSelectedRowKey}
        showMoisture={showMoisture}
        onToggleMoisture={runActive ? setShowMoisture : undefined}
        runUnsaved={simRun?.unsavedChanges ?? false}
        onAddIntervention={
          runActive
            ? (iv) => simRunRef.current?.applyIntervention(iv) ?? { ok: false, error: 'No active run.' }
            : undefined
        }
        compareRuns={compareItems.length > 0 ? compareItems : undefined}
        ghostLabel={simRun?.ghostRecord?.label}
        ghostCapped={simRun?.ghostCapped}
        onLoadGhost={(id) => {
          const rec = compareRuns?.find((x) => x.id === id);
          if (rec) simRunRef.current?.loadGhost(rec);
        }}
        onClearGhost={() => simRunRef.current?.clearGhost()}
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
