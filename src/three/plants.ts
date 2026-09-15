import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanState, Crop, ScenarioType } from '@/types';
import { parseKey } from '@/lib/plan';
import { growthProgress, scenarioGrowthMod, stageForScale, SURFACE_PLANT_SCALE, type GrowthModCtx } from '@/lib/growth';
import { cropAssetMap, makeCropFor } from '@/creative/crops/map';

/**
 * Plant rendering — one THREE.InstancedMesh per (crop, stage) template.
 *
 * The creative voxel assets are vertex-colored with position/normal/color
 * attributes (same layout ground.ts relies on), so each template's meshes can
 * be merged into ONE BufferGeometry and every planted cell of that template is
 * a single instance. A 200-cell wheat field at one stage costs 1 draw call
 * instead of hundreds.
 *
 * Templates are cached at MODULE level (the structures.ts treatment): merged
 * geometry + material survive every rebuild and unmount, so the per-tick
 * update path is a RECONCILE — diff per-cell (crop, stage, placement)
 * assignments and rewrite only changed instance matrices. Disposal on plan
 * edits only frees the InstancedMesh instance buffers; the cached template is
 * never disposed during the session (engine context loss frees GPU copies).
 *
 * MEMORY BOUND: the cache holds at most (crops ≈ 50) × (stages 6) × distinct
 * normalized template heights — a few hundred small merged geometries worst
 * case, typically ≈ crops × 6. Templates persist for the session lifetime BY
 * DESIGN; this is the price of tick-rebuild-free sim playback (a multi-tick
 * sim would otherwise re-merge voxel geometry every tick and fall off the
 * 4,000-cell = 8 FPS perf cliff, see HANDOFF.md perf ceiling).
 *
 * Trade-off: the old per-cell 'sway' child-group wind animation does not
 * survive instancing (instances share one geometry; per-cell group transforms
 * are gone). Per-cell sway is DROPPED for beta; swayPlants keeps its signature
 * and applies a gentle whole-batch tilt to the batch group instead so wind
 * still reads at a glance.
 *
 * Smooth growth: template geometry is base-anchored at y=0 and normalized to
 * its stage's canonical height, so per-instance Y scale grows a plant from the
 * ground with zero rebuilds. advancePlantGrowth (called per frame from
 * World3D's rAF closure) eases each cell's visual progress toward its target
 * and rewrites the instance matrix — no scene rebuilds, no allocations.
 *
 * The procedural fallback path (no voxel asset for a crop name) keeps the old
 * clone-per-cell approach; its per-stage resources are batch-owned (not
 * module-cached) and rebuild per update — unmapped crops are rare and small.
 */

// ---------------------------------------------------------------------------
// Module-level template cache (persistent for the session — see header note)
// ---------------------------------------------------------------------------

interface VoxelTemplate {
  /** Merged, base-anchored geometry normalized to the template height. */
  geometry: THREE.BufferGeometry;
  /** Per-template material; stress tint is applied in place per update. */
  material: THREE.MeshLambertMaterial;
}

// Key: `${cropName}|${stage}|${templateHeight.toFixed(3)}`. Height (not
// surface) is part of the key so a surface switch or crop-definition edit
// naturally resolves to different templates. Same-name crops share templates —
// builders key off the name, so their geometry is identical anyway; a shared
// material means the last-updated crop's stress tint wins (documented,
// cosmetic, and only reachable via custom crops duplicating a catalog name).
const voxelTemplateCache = new Map<string, VoxelTemplate>();

/** Owns the GPU instance buffers for one (crop, stage) of one batch. */
interface StageMesh {
  mesh: THREE.InstancedMesh;
  capacity: number;
  /** Instances actually used (mesh.count is synced after reconcile). */
  count: number;
  /** Reverse index slot → cellKey, for swap-with-last removal. */
  slotKeys: (string | undefined)[];
  /** True when the geometry is batch-owned (procedural fallback instances)
   * and must be freed with the batch rather than living in the cache. */
  ownsGeometry?: boolean;
}

/** Per-cell reconcile record (assigned slot + placement + growth progress). */
interface CellSlot {
  stage: number;
  /** Instance index inside the stage's InstancedMesh. */
  slot: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Deterministic per-cell jitter scale (multiplies the growth scale). */
  baseScale: number;
  /** Progress 0..1 the cell should display (already clamp-applied). */
  targetProgress: number;
  /** Progress 0..1 currently displayed (eased per frame; starts at target). */
  visualProgress: number;
}

/** Fallback (procedural clone) resources — owned by the batch, never cached. */
interface FallbackStage {
  root: THREE.Object3D;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface FallbackBatch {
  stages: Map<number, FallbackStage>;
  /** cellKey → live clone + its stage. */
  instances: Map<string, { stage: number; obj: THREE.Object3D }>;
}

export interface PlantBatch {
  group: THREE.Group;
  count: number;
  cropId: number;
  /** Sway amplitude multiplier by crop category (cached for the frame loop). */
  swayAmount: number;
  /** fullHeight this batch was built for (surface × crop table). */
  fullHeight: number;
  /** Voxel-instanced path: stage → instanced mesh bookkeeping. */
  stages: Map<number, StageMesh>;
  /** Voxel-instanced path: cellKey → placement/progress record. */
  cells: Map<string, CellSlot>;
  /** Set when the crop has no voxel asset (procedural clone path). */
  fallback?: FallbackBatch;
}

export interface PlantUpdateOptions {
  /**
   * Per-cell growth-progress override ("x,y" → 0..1). When present for a cell
   * it is clamped against the computed progress (max of both) — World3D uses
   * this to keep playback monotonic when a scenario/ambient change re-rates
   * the elapsed period (legacy-path stopgap until the stateful sim engine).
   */
  progressByCell?: Map<string, number>;
  /**
   * Run-mode per-cell tint stress ("x,y" → effective stress 0..1). World3D
   * computes each cell as `max(water, heat, cold, nitrogen)` — the same
   * max-of-terms aggregation the RunInspector rows use — with pest pressure
   * folded in at a documented 0.8 weight. When present, the batch tint is the
   * MAX effective stress across the batch's live cells (one material per
   * (crop,stage) template is shared by every instance, so per-instance tint
   * would need instanceColor buffers per batch — too costly for the draw
   * budget). When absent, the legacy scenarioGrowthMod().stress tint path
   * applies unchanged.
   */
  stressByCell?: Map<string, number>;
}

// Height ranges (meters) by crop category: [min, max] — scaled for world visibility
const HEIGHT_RANGE: Record<string, [number, number]> = {
  vegetable: [0.7, 1.4],
  herb: [0.35, 0.7],
  fruit: [1.4, 2.6],
  grain: [0.8, 1.5],
  flower: [0.5, 1.6],
  cover_crop: [0.2, 0.45],
  fungus: [0.35, 0.9],
};

const DEFAULT_HEIGHT_RANGE: [number, number] = [0.7, 1.4];

/**
 * Canonical height fraction per growth stage: stage k's template is normalized
 * to `fullHeight * templateScaleT(k)`. Growth interpolation assumes this exact
 * curve (see advancePlantGrowth).
 */
function templateScaleT(stage: number): number {
  return 0.15 + 0.85 * (stage / 5);
}

/**
 * Vertical-growing ground slugs lift planted crops onto shelf decks (y in
 * metres). A deterministic per-cell pick spreads instances across the levels
 * so a painted rack reads as a full vertical wall of crops.
 */
const SHELF_LIFTS: Record<string, [number, number, number]> = {
  'plant-rack': [0.28, 0.68, 1.08],
  'hydro-channel': [0.32, 0.64, 0.96],
  'grow-bench': [0.58, 0.58, 0.58],
};

/** Deterministic shelf pick (0..2) for a cell. */
function shelfForCell(cellX: number, cellY: number): number {
  return Math.abs((cellX * 73856093 ^ cellY * 19349663) | 0) % 3;
}

/** Map growthDays into a height range for a given crop category. */
function getPlantHeight(crop: Crop): number {
  const [minH, maxH] = HEIGHT_RANGE[crop.category] ?? DEFAULT_HEIGHT_RANGE;
  // Normalize growthDays (clamp 50-100) to 0-1, then lerp.
  const t = Math.max(0, Math.min(1, (crop.growthDays - 50) / 50));
  return minH + t * (maxH - minH);
}

/** Deterministic pseudo-random jitter seeded by cell coordinates. */
function jitterForCell(cellX: number, cellY: number, cellM: number): {
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

// ---------------------------------------------------------------------------
// Procedural geometry builders per category (fallback when no voxel asset)
// ---------------------------------------------------------------------------

function buildVegetableGeometry(crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem
  const stem = new THREE.CylinderGeometry(0.06, 0.09, height, 5);
  stem.translate(0, height / 2, 0);
  parts.push(stem);

  // 2-3 leaves
  const leafCount = 2 + (Math.round(crop.growthDays) % 2); // 2 or 3
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.SphereGeometry(0.25, 4, 4);
    leaf.scale(1, 0.3, 1);
    const angle = (i / leafCount) * Math.PI * 2;
    const y = height * 0.5 + (i / leafCount) * height * 0.4;
    leaf.translate(Math.cos(angle) * 0.18, y, Math.sin(angle) * 0.18);
    parts.push(leaf);
  }

  // Fruit near top
  const fruit = new THREE.SphereGeometry(0.15, 4, 4);
  fruit.translate(0, height * 0.85, 0);
  parts.push(fruit);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildHerbGeometry(crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const clusterCount = 3 + (Math.round(crop.growthDays) % 3); // 3-5
  for (let i = 0; i < clusterCount; i++) {
    const sphere = new THREE.SphereGeometry(0.18, 4, 4);
    const angle = (i / clusterCount) * Math.PI * 2;
    const r = 0.12 + (i % 2) * 0.12;
    const y = height * 0.4 + (i % 2) * height * 0.3;
    sphere.translate(Math.cos(angle) * r, y, Math.sin(angle) * r);
    parts.push(sphere);
  }

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildFruitGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Woody stem
  const stemH = height * 0.6;
  const stem = new THREE.CylinderGeometry(0.05, 0.07, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  parts.push(stem);

  // Leaf canopy
  const canopy = new THREE.SphereGeometry(0.35, 5, 5);
  canopy.scale(1, 0.4, 1);
  canopy.translate(0, height * 0.8, 0);
  parts.push(canopy);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildGrainGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stalk
  const stalk = new THREE.CylinderGeometry(0.05, 0.06, height, 4);
  stalk.translate(0, height / 2, 0);
  parts.push(stalk);

  // Tassel
  const tassel = new THREE.ConeGeometry(0.12, 0.3, 4);
  tassel.translate(0, height + 0.15, 0);
  parts.push(tassel);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildFlowerGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem
  const stemH = height * 0.7;
  const stem = new THREE.CylinderGeometry(0.03, 0.05, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  parts.push(stem);

  // Flower head
  const head = new THREE.SphereGeometry(0.2, 5, 5);
  head.translate(0, height, 0);
  parts.push(head);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildCoverCropGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const patch = new THREE.SphereGeometry(0.3, 4, 4);
  patch.scale(1, 0.15, 1);
  patch.translate(0, height / 2, 0);
  parts.push(patch);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildPlantGeometry(crop: Crop, height: number): THREE.BufferGeometry {
  switch (crop.category) {
    case 'vegetable':
      return buildVegetableGeometry(crop, height);
    case 'herb':
      return buildHerbGeometry(crop, height);
    case 'fruit':
      return buildFruitGeometry(crop, height);
    case 'grain':
      return buildGrainGeometry(crop, height);
    case 'flower':
      return buildFlowerGeometry(crop, height);
    case 'cover_crop':
      return buildCoverCropGeometry(crop, height);
    default:
      return buildVegetableGeometry(crop, height);
  }
}

// ---------------------------------------------------------------------------
// Voxel-asset templates → merged geometry + InstancedMesh batching
// ---------------------------------------------------------------------------

/**
 * Build the raw voxel asset for a (crop, stage), normalized the same way as
 * before: scaled so its bounding-box height matches `targetWorldHeight`
 * metres with its base resting at local y=0. Returns null when the crop has
 * no creative asset.
 */
function buildNormalizedVoxelRoot(crop: Crop, stage: number, targetWorldHeight: number): THREE.Object3D | null {
  const asset = makeCropFor(crop.name, stage);
  if (!asset) return null;

  const bbox = new THREE.Box3().setFromObject(asset);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  let scaleFactor = 1;
  if (size.y > 1e-6) {
    scaleFactor = targetWorldHeight / size.y;
  }

  const holder = new THREE.Group();
  holder.name = `voxel:${crop.name}:s${stage}`;
  holder.add(asset);
  asset.scale.multiplyScalar(scaleFactor);
  // Shift so the (scaled) base of the plant rests at local y = 0.
  asset.position.y -= bbox.min.y * scaleFactor;

  return holder;
}

/**
 * Merge all vertex-colored meshes under `root` (world transforms baked) into
 * one BufferGeometry — the same technique ground.ts uses for terrain tiles.
 * Non-vertex-colored parts (animated/translucent extras) are skipped, exactly
 * like ground.ts skips the pond shimmer plate.
 */
function mergeTemplateGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);

  const parts: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
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

  return merged;
}

/**
 * Module-cached template for a (crop, stage, templateHeight): merged geometry
 * + vertex-colored material, built once and reused across every rebuild for
 * the session (never disposed with batches — see header memory-bound note).
 */
function getVoxelTemplate(crop: Crop, stage: number, templateHeight: number): VoxelTemplate | null {
  const key = `${crop.name}|${stage}|${templateHeight.toFixed(3)}`;
  const cached = voxelTemplateCache.get(key);
  if (cached) return cached;

  const voxelRoot = buildNormalizedVoxelRoot(crop, stage, templateHeight);
  if (!voxelRoot) return null;
  const geometry = mergeTemplateGeometry(voxelRoot);
  if (!geometry) return null; // asset existed but had no mergeable static geometry

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tpl: VoxelTemplate = { geometry, material };
  voxelTemplateCache.set(key, tpl);
  return tpl;
}

/** Apply the stress tint to a batch's cached template materials IN PLACE —
 * persistent materials must never be recreated per update. ≤0.2 = untinted.
 * Batch-owned procedural geometry keeps its plain crop color (as before). */
function applyStressTint(batch: PlantBatch, stress: number): void {
  if (batch.fallback) return;
  const r = 1;
  const g = 1 - stress * 0.35;
  const b = 1 - stress * 0.55;
  for (const stageMesh of batch.stages.values()) {
    if (stageMesh.ownsGeometry) continue;
    const mat = stageMesh.mesh.material as THREE.MeshLambertMaterial;
    mat.color.setRGB(r, g, b);
  }
}

/**
 * Batch tint stress: run mode (opts.stressByCell present) → MAX per-cell
 * effective stress across the batch's live cells, so a suffering crop LOOKS
 * suffering (max matches the RunInspector row aggregation — one stressed
 * sowing yellows the crop's field); legacy mode → scenarioGrowthMod().stress,
 * byte-identical to the pre-run behavior. Run mode passes scenario undefined,
 * so the two sources never fight over the same material.
 */
function batchTintStress(
  batch: PlantBatch,
  crop: Crop,
  plan: PlanState,
  scenario: ScenarioType | undefined,
  growthCtx: GrowthModCtx | undefined,
  opts: PlantUpdateOptions | undefined,
): number {
  const byCell = opts?.stressByCell;
  if (byCell) {
    let max = 0;
    for (const key of batch.cells.keys()) {
      const s = byCell.get(key);
      if (s !== undefined && s > max) max = s;
    }
    return max;
  }
  return scenario ? scenarioGrowthMod(crop, scenario, plan.surface ?? 'outdoor', growthCtx).stress : 0;
}

// --- Scratch objects (module-level: the per-frame path must not allocate) ---

const scratchObj = new THREE.Object3D();
const scratchMatrix = new THREE.Matrix4();

/**
 * Compose one cell's instance matrix. Growth interpolation: the template is
 * normalized to `fullHeight × templateScaleT(stage)` at unit scale, so
 * displaying progress p inside stage k means scaling by
 * `templateScaleT-of-p / templateScaleT(k)` — continuous across stage swaps
 * (both sides resolve to the same world height at the boundary) and exactly
 * the pre-interpolation look when p sits on the stage center (scale 1).
 */
function writeCellMatrix(stageMesh: StageMesh, cell: CellSlot): void {
  const growthScale = (0.15 + 0.85 * cell.visualProgress) / templateScaleT(cell.stage);
  scratchObj.position.set(cell.x, cell.y, cell.z);
  scratchObj.rotation.set(0, cell.rotY, 0);
  scratchObj.scale.setScalar(growthScale * cell.baseScale);
  scratchObj.updateMatrix();
  stageMesh.mesh.setMatrixAt(cell.slot, scratchObj.matrix);
}

// ---------------------------------------------------------------------------
// Batch lifecycle + reconcile
// ---------------------------------------------------------------------------

function swayAmountFor(crop: Crop): number {
  switch (crop.category) {
    case 'grain':
    case 'flower':
      return 0.04;
    case 'vegetable':
    case 'fruit':
      return 0.015;
    default:
      return 0.005;
  }
}

/** Create an empty batch (voxel or fallback) for a crop and add it to the scene. */
function createBatch(
  cropId: number,
  crop: Crop,
  _plan: PlanState,
  fullHeight: number,
  scene: THREE.Scene,
): PlantBatch {
  const group = new THREE.Group();
  group.name = `plants:${crop.name}`;
  group.castShadow = false;
  group.receiveShadow = false;
  scene.add(group);

  const batch: PlantBatch = {
    group,
    count: 0,
    cropId,
    swayAmount: swayAmountFor(crop),
    fullHeight,
    stages: new Map<number, StageMesh>(),
    cells: new Map<string, CellSlot>(),
  };

  // Fallback probe: the creative library is keyed by NAME (cropAssetMap),
  // so novel custom-crop names get the procedural clone path.
  if (!(crop.name in cropAssetMap)) {
    batch.fallback = { stages: new Map<number, FallbackStage>(), instances: new Map() };
  }
  return batch;
}

/** Allocate (or grow) the InstancedMesh for a stage, instancing a cached template. */
function ensureStageMesh(batch: PlantBatch, crop: Crop, stage: number, needed: number): StageMesh {
  let sm = batch.stages.get(stage);
  const capacity = Math.max(needed, 8);

  if (!sm) {
    const templateHeight = batch.fullHeight * templateScaleT(stage);
    const tpl = getVoxelTemplate(crop, stage, templateHeight);
    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;
    let ownsGeometry = false;
    if (tpl) {
      geometry = tpl.geometry;
      material = tpl.material;
    } else {
      // Rare: the asset exists but produced no mergeable static geometry for
      // this stage (merge failed) — instance the procedural geometry instead
      // of dropping the plants. Batch-owned resources, freed with the batch.
      geometry = buildPlantGeometry(crop, templateHeight);
      material = new THREE.MeshBasicMaterial({ color: crop.colorHex });
      ownsGeometry = true;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `plants-inst:${crop.name}:s${stage}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    mesh.frustumCulled = false; // instances span the whole plan
    batch.group.add(mesh);
    sm = { mesh, capacity, count: 0, slotKeys: new Array<string | undefined>(capacity), ...(ownsGeometry ? { ownsGeometry } : {}) };
    batch.stages.set(stage, sm);
    return sm;
  }

  if (sm.capacity < needed) {
    // Grow: new InstancedMesh sharing the SAME cached geometry/material, copy
    // live instances, free only the old instance buffers.
    const newCap = Math.max(needed, Math.ceil(sm.capacity * 1.5));
    const mesh = new THREE.InstancedMesh(sm.mesh.geometry, sm.mesh.material, newCap);
    mesh.name = sm.mesh.name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = sm.count;
    mesh.frustumCulled = false;
    (mesh.instanceMatrix.array as Float32Array).set(
      (sm.mesh.instanceMatrix.array as Float32Array).subarray(0, sm.count * 16),
    );
    mesh.instanceMatrix.needsUpdate = true;
    sm.mesh.removeFromParent();
    sm.mesh.dispose(); // instance buffers only — geometry/material are cached
    batch.group.add(mesh);
    const slotKeys = sm.slotKeys.slice();
    slotKeys.length = newCap;
    sm.mesh = mesh;
    sm.capacity = newCap;
    sm.slotKeys = slotKeys;
  }
  return sm;
}

/**
 * Remove one cell's instance from its stage mesh (swap-with-last so no
 * compaction is needed). Updates the moved occupant's slot in `batch.cells`.
 */
function removeInstance(batch: PlantBatch, cell: CellSlot): void {
  const sm = batch.stages.get(cell.stage);
  if (!sm) return;
  const last = sm.count - 1;
  if (cell.slot < 0 || cell.slot > last) return;
  if (cell.slot !== last) {
    sm.mesh.getMatrixAt(last, scratchMatrix);
    sm.mesh.setMatrixAt(cell.slot, scratchMatrix);
    const movedKey = sm.slotKeys[last];
    sm.slotKeys[cell.slot] = movedKey;
    if (movedKey !== undefined) {
      const moved = batch.cells.get(movedKey);
      if (moved && moved.stage === cell.stage) moved.slot = cell.slot;
    }
  }
  sm.slotKeys[last] = undefined;
  sm.count--;
}

/** Build the per-stage clone prototype for the procedural fallback path. */
function ensureFallbackStage(batch: PlantBatch, crop: Crop, stage: number, fullHeight: number): FallbackStage {
  const existing = batch.fallback?.stages.get(stage);
  if (existing) return existing;
  const fb = batch.fallback!;
  const targetHeight = fullHeight * templateScaleT(stage);
  const geometry = buildPlantGeometry(crop, targetHeight);
  const material = new THREE.MeshBasicMaterial({ color: crop.colorHex });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const holder = new THREE.Group();
  holder.add(mesh);
  const stageTpl: FallbackStage = { root: holder, geometry, material };
  fb.stages.set(stage, stageTpl);
  return stageTpl;
}

/** Rebuild a fallback batch's clones from the given cell keys. */
function reconcileFallbackBatch(
  batch: PlantBatch,
  crop: Crop,
  plan: PlanState,
  keys: string[],
  currentDate: Date | undefined,
  scenario: ScenarioType | undefined,
  growthCtx: GrowthModCtx | undefined,
  opts: PlantUpdateOptions | undefined,
): void {
  const fb = batch.fallback!;
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const now = currentDate ?? new Date();
  const plantedAtMap = plan.plantedAt ?? {};
  const mod = scenario ? scenarioGrowthMod(crop, scenario, plan.surface ?? 'outdoor', growthCtx) : null;

  const wanted = new Map<string, number>(); // key → stage
  for (const key of keys) {
    const computed = currentDate ? growthProgress(crop, plantedAtMap[key], now, mod?.rate ?? 1) : 1;
    const override = opts?.progressByCell?.get(key);
    const progress = override !== undefined ? Math.max(computed, override) : computed;
    wanted.set(key, stageForScale(progress));
  }

  // Remove clones that vanished or changed stage (clone = per-stage geometry).
  for (const [key, inst] of fb.instances) {
    const stage = wanted.get(key);
    if (stage !== inst.stage) {
      inst.obj.removeFromParent();
      fb.instances.delete(key);
    }
  }

  // Add missing clones.
  for (const [key, stage] of wanted) {
    if (fb.instances.has(key)) continue;
    const stageTpl = ensureFallbackStage(batch, crop, stage, batch.fullHeight);
    const [cellX, cellY] = parseKey(key);
    const jitter = jitterForCell(cellX, cellY, plan.cellM);
    const liftSlugs = SHELF_LIFTS[plan.ground[key] ?? ''];
    const lift = liftSlugs ? liftSlugs[shelfForCell(cellX, cellY)]! : 0;
    const inst = stageTpl.root.clone(true);
    inst.name = `plant:${crop.name}:${key}`;
    inst.rotation.y = jitter.rotY;
    inst.scale.setScalar(jitter.scaleY);
    inst.position.set(
      cellX * plan.cellM + plan.cellM / 2 + offsetX + jitter.offsetX,
      0.01 + lift,
      cellY * plan.cellM + plan.cellM / 2 + offsetZ + jitter.offsetZ,
    );
    batch.group.add(inst);
    fb.instances.set(key, { stage, obj: inst });
  }

  batch.count = keys.length;
}

/**
 * Diff-and-patch one voxel-instanced batch against the desired per-cell
 * assignment. Only changed cells touch GPU buffers; templates never rebuild.
 */
function reconcileVoxelBatch(
  batch: PlantBatch,
  crop: Crop,
  plan: PlanState,
  keys: string[],
  currentDate: Date | undefined,
  scenario: ScenarioType | undefined,
  growthCtx: GrowthModCtx | undefined,
  opts: PlantUpdateOptions | undefined,
): void {
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const now = currentDate ?? new Date();
  const plantedAtMap = plan.plantedAt ?? {};
  const mod = scenario ? scenarioGrowthMod(crop, scenario, plan.surface ?? 'outdoor', growthCtx) : null;

  // Pass 1 — desired assignment per cell (plain records; update-time
  // allocation is fine, only the per-frame path must be allocation-free).
  interface Desired {
    stage: number;
    progress: number;
    x: number;
    y: number;
    z: number;
    rotY: number;
    baseScale: number;
  }
  const desired = new Map<string, Desired>();
  for (const key of keys) {
    const [cellX, cellY] = parseKey(key);
    const computed = currentDate ? growthProgress(crop, plantedAtMap[key], now, mod?.rate ?? 1) : 1;
    const override = opts?.progressByCell?.get(key);
    const progress = override !== undefined ? Math.max(computed, override) : computed;
    const jitter = jitterForCell(cellX, cellY, plan.cellM);
    const liftSlugs = SHELF_LIFTS[plan.ground[key] ?? ''];
    const lift = liftSlugs ? liftSlugs[shelfForCell(cellX, cellY)]! : 0;
    desired.set(key, {
      stage: stageForScale(progress),
      progress,
      x: cellX * plan.cellM + plan.cellM / 2 + offsetX + jitter.offsetX,
      y: 0.01 + lift,
      z: cellY * plan.cellM + plan.cellM / 2 + offsetZ + jitter.offsetZ,
      rotY: jitter.rotY,
      baseScale: jitter.scaleY,
    });
  }

  // Pass 2 — remove instances for cells that vanished or changed stage.
  // visualProgress of stage-changing cells is carried over so the eased size
  // is continuous across the template move (no pop at stage swaps).
  const carriedVisual = new Map<string, number>();
  for (const [key, cell] of batch.cells) {
    const want = desired.get(key);
    if (!want || want.stage !== cell.stage) {
      carriedVisual.set(key, cell.visualProgress);
      removeInstance(batch, cell);
      batch.cells.delete(key);
    }
  }

  // Pass 3 — patch survivors in place and add new cells.
  for (const [key, want] of desired) {
    const prev = batch.cells.get(key);
    if (prev) {
      const sm = batch.stages.get(prev.stage)!;
      prev.targetProgress = want.progress;
      if (
        prev.x !== want.x || prev.y !== want.y || prev.z !== want.z ||
        prev.rotY !== want.rotY || prev.baseScale !== want.baseScale
      ) {
        prev.x = want.x;
        prev.y = want.y;
        prev.z = want.z;
        prev.rotY = want.rotY;
        prev.baseScale = want.baseScale;
        writeCellMatrix(sm, prev);
        sm.mesh.instanceMatrix.needsUpdate = true;
      }
      continue;
    }
    const sm = ensureStageMesh(batch, crop, want.stage, (batch.stages.get(want.stage)?.count ?? 0) + 1);
    const carried = carriedVisual.get(key);
    const cell: CellSlot = {
      stage: want.stage,
      slot: sm.count,
      x: want.x,
      y: want.y,
      z: want.z,
      rotY: want.rotY,
      baseScale: want.baseScale,
      targetProgress: want.progress,
      // Brand-new plants start AT their target (no grow-in); stage-changing
      // plants continue from their eased visual size.
      visualProgress: carried ?? want.progress,
    };
    writeCellMatrix(sm, cell);
    sm.slotKeys[sm.count] = key;
    sm.count++;
    sm.mesh.instanceMatrix.needsUpdate = true;
    batch.cells.set(key, cell);
  }

  // Pass 4 — sync draw counts. needsUpdate unconditionally: removals swap
  // matrices (removeInstance) without touching flags themselves.
  for (const sm of batch.stages.values()) {
    sm.mesh.count = sm.count;
    sm.mesh.instanceMatrix.needsUpdate = true;
  }
  batch.count = keys.length;
}

/**
 * Build InstancedMesh batches: one draw call per (crop, stage) template.
 * Templates come from the module-level persistent cache; this is only
 * expensive the first time each (crop, stage) is seen.
 */
export function buildPlants(
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  currentDate?: Date,
  scenario?: ScenarioType,
  growthCtx?: GrowthModCtx,
  opts?: PlantUpdateOptions,
): PlantBatch[] {
  const batches: PlantBatch[] = [];
  const cellsByCropId = new Map<number, string[]>();
  for (const key of Object.keys(plan.planting)) {
    const cropId = plan.planting[key]!;
    const arr = cellsByCropId.get(cropId);
    if (arr) arr.push(key);
    else cellsByCropId.set(cropId, [key]);
  }

  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;
    const fullHeight = getPlantHeight(crop) * SURFACE_PLANT_SCALE[plan.surface ?? 'outdoor'];
    const batch = createBatch(cropId, crop, plan, fullHeight, scene);
    if (batch.fallback) {
      reconcileFallbackBatch(batch, crop, plan, keys, currentDate, scenario, growthCtx, opts);
    } else {
      reconcileVoxelBatch(batch, crop, plan, keys, currentDate, scenario, growthCtx, opts);
      applyStressTint(batch, batchTintStress(batch, crop, plan, scenario, growthCtx, opts));
    }
    batches.push(batch);
  }

  return batches;
}

/**
 * Reconcile plant batches with the plan: keep per-cell→template assignments,
 * diff them, and rewrite only what changed (moved stages, moved cells, new /
 * removed plants, stress tint). Geometry is NEVER re-merged on this path —
 * batches whose template height changed (surface switch, crop edit) are
 * re-instanced from the persistent template cache; a crop leaving the plan
 * disposes its batch (instance buffers) but NOT the cached templates.
 */
export function updatePlants(
  batches: PlantBatch[],
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  currentDate?: Date,
  scenario?: ScenarioType,
  growthCtx?: GrowthModCtx,
  opts?: PlantUpdateOptions,
): PlantBatch[] {
  const cellsByCropId = new Map<number, string[]>();
  for (const key of Object.keys(plan.planting)) {
    const cropId = plan.planting[key]!;
    const arr = cellsByCropId.get(cropId);
    if (arr) arr.push(key);
    else cellsByCropId.set(cropId, [key]);
  }

  const reusable = new Map<number, PlantBatch>();
  for (const batch of batches) reusable.set(batch.cropId, batch);

  const next: PlantBatch[] = [];
  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;

    const fullHeight = getPlantHeight(crop) * SURFACE_PLANT_SCALE[plan.surface ?? 'outdoor'];
    let batch = reusable.get(cropId);
    reusable.delete(cropId);

    if (batch && (batch.fullHeight !== fullHeight || batch.fallback)) {
      // Template height changed (surface / crop-definition edit) — or the
      // fallback clone path, which rebuilds per update. Re-instance from the
      // persistent template cache (cheap; no geometry re-merge for voxels).
      disposeBatch(batch);
      batch = undefined;
    }

    if (!batch) {
      batch = createBatch(cropId, crop, plan, fullHeight, scene);
    }

    if (batch.fallback) {
      reconcileFallbackBatch(batch, crop, plan, keys, currentDate, scenario, growthCtx, opts);
    } else {
      reconcileVoxelBatch(batch, crop, plan, keys, currentDate, scenario, growthCtx, opts);
      applyStressTint(batch, batchTintStress(batch, crop, plan, scenario, growthCtx, opts));
    }
    next.push(batch);
  }

  // Crops that left the plan entirely: free their instance buffers. The
  // module-level template cache survives by design.
  for (const batch of reusable.values()) disposeBatch(batch);

  batches.length = 0;
  batches.push(...next);
  return batches;
}

/**
 * Per-frame growth interpolation. Eases every planted cell's visual progress
 * toward the target captured by the last updatePlants call, rewriting only
 * instance matrices of still-moving cells. Zero allocations (module scratch
 * objects), no scene rebuilds, reads only what the batches already hold —
 * safe to call from the rAF update closure every frame.
 */
export function advancePlantGrowth(batches: PlantBatch[], dt: number, easeRate = 4): void {
  const step = Math.min(1, dt * easeRate);
  if (step <= 0) return;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    if (batch.fallback || batch.cells.size === 0) continue;
    for (const cell of batch.cells.values()) {
      const diff = cell.targetProgress - cell.visualProgress;
      if (diff > 1e-4 || diff < -1e-4) {
        cell.visualProgress += diff * step;
        if (Math.abs(cell.targetProgress - cell.visualProgress) < 1e-4) {
          cell.visualProgress = cell.targetProgress;
        }
        const sm = batch.stages.get(cell.stage);
        if (!sm) continue;
        writeCellMatrix(sm, cell);
        sm.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

/**
 * Apply gentle batch-level wind motion. Per-cell 'sway' child groups no longer
 * exist under instancing (dropped for beta), so this tilts each batch group
 * slightly — enough that gusts still read across a field.
 */
export function swayPlants(batches: PlantBatch[], _crops: Map<number, Crop>, time: number, windStrength: number): void {
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]!;
    const amp = batch.swayAmount * windStrength;
    if (amp <= 0) continue;

    const phase = time * 1.5 + batch.cropId;
    batch.group.rotation.z = Math.sin(phase) * amp;
    batch.group.rotation.x = Math.cos(time * 1.3 + batch.cropId * 0.7) * amp * 0.6;
  }
}

/** Free one batch's GPU instance buffers / batch-owned resources. The
 * module-level template cache is NEVER touched here (session-lifetime). */
function disposeBatch(batch: PlantBatch): void {
  batch.group.removeFromParent();

  for (const sm of batch.stages.values()) {
    // Frees the instanceMatrix/instanceColor buffers only; shared geometry +
    // material live in voxelTemplateCache and persist. Batch-owned procedural
    // geometry (ownsGeometry) is freed here too.
    sm.mesh.dispose();
    if (sm.ownsGeometry) {
      sm.mesh.geometry.dispose();
      (sm.mesh.material as THREE.Material).dispose();
    }
  }
  batch.stages.clear();
  batch.cells.clear();

  const fb = batch.fallback;
  if (fb) {
    for (const stage of fb.stages.values()) {
      stage.geometry.dispose();
      stage.material.dispose();
    }
    fb.stages.clear();
    fb.instances.clear();
    batch.fallback = undefined;
  }
}

/**
 * Dispose plant batches (on scene teardown or when a crop leaves the plan).
 * Only instance buffers and fallback resources are freed — cached template
 * geometry/materials persist for the session (structures.ts treatment).
 */
export function disposePlants(batches: PlantBatch[]): void {
  for (const batch of batches) disposeBatch(batch);
  batches.length = 0;
}
