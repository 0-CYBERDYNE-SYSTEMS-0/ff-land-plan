import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanState, Crop, ScenarioType } from '@/types';
import { parseKey } from '@/lib/plan';
import { growthProgress, scenarioGrowthMod, stageForScale, SURFACE_PLANT_SCALE, type GrowthModCtx } from '@/lib/growth';
import { cropAssetMap, makeCropFor } from '@/creative/crops/map';
import { variationForCell, type PlantViewParams } from '@/lib/sim/view';
import { STATE_HEIGHT_FACTOR, unitPadGeometry, type PlantStateVisual } from '@/creative/crops/shared';
import { hasStateBuilder } from '@/creative/crops/states';

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
  /** World-space pad radii split out of the template (wave 4): the baked pad
   *  is stripped at build time and re-instanced per cell by reconcilePads so
   *  pads can darken with per-cell moisture. Absent ⇒ template has no pad. */
  padRx?: number;
  padRz?: number;
  padHilled?: boolean;
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
  /** Lifecycle state template axis (undefined = alive stage geometry). */
  state?: PlantStateVisual;
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
  /** Wilt channel 0..1 (droop lean + canopy squash); 0 ⇒ pre-channel matrix. */
  wilt01: number;
  /** Final per-instance color (condition tint × genetic variation). */
  tintR: number;
  tintG: number;
  tintB: number;
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
  /** Voxel-instanced path: stageKey → instanced mesh bookkeeping. */
  stages: Map<string, StageMesh>;
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
   * Run-mode per-cell tint stress ("x,y" → effective stress 0..1) — LEGACY
   * run coupling, superseded by viewByCell (which carries the tint per
   * instance). Kept as the batch-MAX fallback: when present without
   * viewByCell, the batch tint is the MAX effective stress across the batch's
   * live cells. When absent, the legacy scenarioGrowthMod().stress tint path
   * applies unchanged.
   */
  stressByCell?: Map<string, number>;
  /**
   * Run-mode per-cell view projection ("x,y" → PlantViewParams from
   * src/lib/sim/view.ts — the pure seam per SPEC-GROWTH-VISUAL §2.1). When
   * present, per-cell growth (view.growth clamps against computed exactly
   * like progressByCell), stage, the wilt matrix channel, and the per-instance
   * tint (view.tint × seeded genetic variation) all come from the projection,
   * and the batch material tint resets to white (per-instance color carries
   * stress; applying both would compound). When absent, behavior is unchanged
   * except the universal per-instance genetic variation (de-clone), which
   * applies in every mode.
   */
  viewByCell?: Map<string, PlantViewParams>;
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

/** Stage-mesh key: stage number + lifecycle-state axis (SPEC-GROWTH-VISUAL
 * §2.2 — state variants are separate templates, drawn only where present). */
const stageKey = (stage: number, state?: PlantStateVisual): string =>
  state ? `${stage}|${state}` : `${stage}`;

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
function buildNormalizedVoxelRoot(
  crop: Crop,
  stage: number,
  targetWorldHeightParam: number,
  state?: PlantStateVisual,
): THREE.Object3D | null {
  const asset = makeCropFor(crop.name, stage, state);
  if (!asset) return null;

  // State templates scale by a per-state height factor (builder override via
  // userData.heightFactor); alive stages use the passed ramp height directly.
  const targetWorldHeight = state
    ? targetWorldHeightParam *
      ((asset.userData as { heightFactor?: number } | undefined)?.heightFactor ?? STATE_HEIGHT_FACTOR[state])
    : targetWorldHeightParam;

  const bbox = new THREE.Box3().setFromObject(asset);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  let scaleFactor = 1;
  if (size.y > 1e-6) {
    scaleFactor = targetWorldHeight / size.y;
  }

  const holder = new THREE.Group();
  holder.name = state ? `voxel:${crop.name}:${state}` : `voxel:${crop.name}:s${stage}`;
  holder.add(asset);
  asset.scale.multiplyScalar(scaleFactor);
  // Shift so the (scaled) base of the plant rests at local y = 0.
  asset.position.y -= bbox.min.y * scaleFactor;

  // Pad separation (SPEC-GROWTH-VISUAL wave 4): measure the named 'pad' child
  // in world units, report it on userData, and strip it from the template —
  // pads live in the shared instanced pad meshes with per-cell moisture tint.
  const padChild = asset.children.find((c) => c.name === 'pad');
  if (padChild) {
    const padMesh = padChild as THREE.Mesh;
    padMesh.geometry.computeBoundingBox();
    const pb = padMesh.geometry.boundingBox;
    const padHilled = pb ? pb.max.y - pb.min.y > 1.5 : false; // 2 voxel layers vs 1
    holder.updateMatrixWorld(true);
    const worldBox = new THREE.Box3().setFromObject(padChild);
    const rx = Math.max(0.02, (worldBox.max.x - worldBox.min.x) / 2);
    const rz = Math.max(0.02, (worldBox.max.z - worldBox.min.z) / 2);
    (holder.userData as { pad?: { rx: number; rz: number; hilled: boolean } }).pad = { rx, rz, hilled: padHilled };
    asset.remove(padChild);
  }

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
function getVoxelTemplate(
  crop: Crop,
  stage: number,
  templateHeight: number,
  state?: PlantStateVisual,
): VoxelTemplate | null {
  const key = `${crop.name}|${stage}|${state ?? 'alive'}|${templateHeight.toFixed(3)}`;
  const cached = voxelTemplateCache.get(key);
  if (cached) return cached;

  const voxelRoot = buildNormalizedVoxelRoot(crop, stage, templateHeight, state);
  if (!voxelRoot) return null;
  const geometry = mergeTemplateGeometry(voxelRoot);
  if (!geometry) return null; // asset existed but had no mergeable static geometry

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const padMeta = (voxelRoot.userData as { pad?: { rx: number; rz: number; hilled: boolean } }).pad;
  const tpl: VoxelTemplate = {
    geometry,
    material,
    ...(padMeta ? { padRx: padMeta.rx, padRz: padMeta.rz, padHilled: padMeta.hilled } : {}),
  };
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
  // Wilt channel (SPEC-GROWTH-VISUAL §2.2 Tier 1): base-anchored lean + canopy
  // squash folded into the same matrix write. wilt01 = 0 ⇒ bit-identical to
  // the pre-channel matrix (rotation.set(0, rotY, 0), no Y squash).
  const wilt = cell.wilt01;
  const growthBase = growthScale * cell.baseScale;
  scratchObj.position.set(cell.x, cell.y, cell.z);
  scratchObj.rotation.set(wilt * 0.1, cell.rotY, wilt * 0.3);
  scratchObj.scale.set(growthBase, growthBase * (1 - wilt * 0.18), growthBase);
  scratchObj.updateMatrix();
  stageMesh.mesh.setMatrixAt(cell.slot, scratchObj.matrix);
}

const scratchColor = new THREE.Color();

/**
 * Per-instance color = condition tint × seeded genetic variation
 * (SPEC-GROWTH-VISUAL §2.2 Tier 1 — instanceColor multiplies the vertex
 * colors in three r184; zero extra draw calls). Variation applies in every
 * mode (de-clone); the tint multiplies in only when the projection provides
 * one.
 */
function cellInstanceColor(key: string, view: PlantViewParams | undefined): { r: number; g: number; b: number } {
  const v = variationForCell(key);
  if (view?.tint) {
    return { r: v.r * view.tint.r, g: v.g * view.tint.g, b: v.b * view.tint.b };
  }
  return v;
}

/** Write one cell's instance color buffer entry (lazily creates instanceColor). */
function writeCellColor(stageMesh: StageMesh, cell: CellSlot): void {
  scratchColor.setRGB(cell.tintR, cell.tintG, cell.tintB);
  stageMesh.mesh.setColorAt(cell.slot, scratchColor);
  if (stageMesh.mesh.instanceColor) stageMesh.mesh.instanceColor.needsUpdate = true;
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
    stages: new Map<string, StageMesh>(),
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
function ensureStageMesh(
  batch: PlantBatch,
  crop: Crop,
  stage: number,
  needed: number,
  state?: PlantStateVisual,
): StageMesh {
  let sm = batch.stages.get(stageKey(stage, state));
  const capacity = Math.max(needed, 8);

  if (!sm) {
    // State templates pass the FULL batch height as the base; the per-state
    // factor (builder override aware) is applied inside buildNormalizedVoxelRoot.
    const templateHeight = state ? batch.fullHeight : batch.fullHeight * templateScaleT(stage);
    const tpl = getVoxelTemplate(crop, stage, templateHeight, state);
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
    batch.stages.set(stageKey(stage, state), sm);
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
    if (sm.mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(newCap * 3).fill(1), 3);
      (mesh.instanceColor.array as Float32Array).set(
        (sm.mesh.instanceColor.array as Float32Array).subarray(0, sm.count * 3),
      );
      mesh.instanceColor.needsUpdate = true;
    }
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
  const sm = batch.stages.get(stageKey(cell.stage, cell.state));
  if (!sm) return;
  const last = sm.count - 1;
  if (cell.slot < 0 || cell.slot > last) return;
  if (cell.slot !== last) {
    sm.mesh.getMatrixAt(last, scratchMatrix);
    sm.mesh.setMatrixAt(cell.slot, scratchMatrix);
    const movedColor = sm.mesh.instanceColor;
    if (movedColor) {
      const from = last * 3;
      const to = cell.slot * 3;
      movedColor.array[to] = movedColor.array[from];
      movedColor.array[to + 1] = movedColor.array[from + 1];
      movedColor.array[to + 2] = movedColor.array[from + 2];
      movedColor.needsUpdate = true;
    }
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
    const override = opts?.viewByCell?.get(key)?.growth ?? opts?.progressByCell?.get(key);
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
    state?: PlantStateVisual;
    progress: number;
    x: number;
    y: number;
    z: number;
    rotY: number;
    baseScale: number;
    wilt01: number;
    tintR: number;
    tintG: number;
    tintB: number;
  }
  const viewByCell = opts?.viewByCell;
  const archOfCrop = cropAssetMap[crop.name]?.archetype;
  const desired = new Map<string, Desired>();
  for (const key of keys) {
    const [cellX, cellY] = parseKey(key);
    const view = viewByCell?.get(key);
    // Lifecycle state: dedicated geometry when the archetype authored it
    // (SPEC §2.2 Tier 2); otherwise the Tier-1 tint+wilt channels carry it.
    const lifecycle = view?.lifecycle;
    const state =
      lifecycle !== undefined && lifecycle !== 'alive' && hasStateBuilder(archOfCrop, lifecycle)
        ? lifecycle
        : undefined;
    const computed = currentDate ? growthProgress(crop, plantedAtMap[key], now, mod?.rate ?? 1) : 1;
    const override = view?.growth ?? opts?.progressByCell?.get(key);
    const progress = override !== undefined ? Math.max(computed, override) : computed;
    const stage = view ? view.stage : stageForScale(progress);
    // State geometry is a single authored pose: pin progress to the stage's
    // ramp point so the instance scale resolves to exactly 1 (authored
    // height), and suppress the Tier-1 tint/wilt channels — the pose and
    // baked state palette carry the read.
    const shownProgress = state ? stage / 5 : progress;
    const jitter = jitterForCell(cellX, cellY, plan.cellM);
    const liftSlugs = SHELF_LIFTS[plan.ground[key] ?? ''];
    const lift = liftSlugs ? liftSlugs[shelfForCell(cellX, cellY)]! : 0;
    const tint = cellInstanceColor(key, state ? undefined : view);
    desired.set(key, {
      stage,
      state,
      progress: shownProgress,
      x: cellX * plan.cellM + plan.cellM / 2 + offsetX + jitter.offsetX,
      y: 0.01 + lift,
      z: cellY * plan.cellM + plan.cellM / 2 + offsetZ + jitter.offsetZ,
      rotY: jitter.rotY,
      baseScale: jitter.scaleY,
      wilt01: state ? 0 : (view?.wilt ?? 0),
      tintR: tint.r,
      tintG: tint.g,
      tintB: tint.b,
    });
  }

  // Pass 2 — remove instances for cells that vanished or changed stage.
  // visualProgress of stage-changing cells is carried over so the eased size
  // is continuous across the template move (no pop at stage swaps).
  const carriedVisual = new Map<string, number>();
  for (const [key, cell] of batch.cells) {
    const want = desired.get(key);
    if (!want || want.stage !== cell.stage || want.state !== cell.state) {
      carriedVisual.set(key, cell.visualProgress);
      removeInstance(batch, cell);
      batch.cells.delete(key);
    }
  }

  // Pass 3 — patch survivors in place and add new cells.
  for (const [key, want] of desired) {
    const prev = batch.cells.get(key);
    if (prev) {
      const sm = batch.stages.get(stageKey(prev.stage, prev.state))!;
      prev.targetProgress = want.progress;
      if (
        prev.x !== want.x || prev.y !== want.y || prev.z !== want.z ||
        prev.rotY !== want.rotY || prev.baseScale !== want.baseScale ||
        prev.wilt01 !== want.wilt01
      ) {
        prev.x = want.x;
        prev.y = want.y;
        prev.z = want.z;
        prev.rotY = want.rotY;
        prev.baseScale = want.baseScale;
        prev.wilt01 = want.wilt01;
        writeCellMatrix(sm, prev);
        sm.mesh.instanceMatrix.needsUpdate = true;
      }
      if (prev.tintR !== want.tintR || prev.tintG !== want.tintG || prev.tintB !== want.tintB) {
        prev.tintR = want.tintR;
        prev.tintG = want.tintG;
        prev.tintB = want.tintB;
        writeCellColor(sm, prev);
      }
      continue;
    }
    const sm = ensureStageMesh(batch, crop, want.stage, (batch.stages.get(stageKey(want.stage, want.state))?.count ?? 0) + 1, want.state);
    const carried = carriedVisual.get(key);
    const cell: CellSlot = {
      stage: want.stage,
      state: want.state,
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
      wilt01: want.wilt01,
      tintR: want.tintR,
      tintG: want.tintG,
      tintB: want.tintB,
    };
    writeCellMatrix(sm, cell);
    writeCellColor(sm, cell);
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

// ---------------------------------------------------------------------------
// Soil pads (SPEC-GROWTH-VISUAL wave 4)
// ---------------------------------------------------------------------------

/** Radius of the shared unit pad geometry, in geometry units (unitPadGeometry). */
const PAD_UNIT_R = 3;

interface PadMesh {
  mesh: THREE.InstancedMesh;
  capacity: number;
  count: number;
  /** Reverse index slot → cellKey, for swap-with-last removal. */
  keys: (string | undefined)[];
}

interface PadState {
  flat: PadMesh;
  hilled: PadMesh;
  /** cellKey → which mesh + slot. */
  index: Map<string, { kind: 'flat' | 'hilled'; slot: number }>;
  material: THREE.MeshLambertMaterial;
}

let padState: PadState | null = null;

/** Unit pad geometries live for the session (mirrors voxelTemplateCache
 *  semantics — built once, shared by every pad-state rebuild). */
let padGeoCache: { flat: THREE.BufferGeometry; hilled: THREE.BufferGeometry } | null = null;
function padGeometries(): { flat: THREE.BufferGeometry; hilled: THREE.BufferGeometry } {
  if (!padGeoCache) padGeoCache = { flat: unitPadGeometry(false), hilled: unitPadGeometry(true) };
  return padGeoCache;
}

/** Moisture → pad tint multiplier (instanceColor × baked soil vertex colors).
 *  Bone-dry (m=0) lifts the pad toward pale dust, saturated (m=1) sinks it to
 *  wet-dark — the range is wide enough to read at game-camera distance (the
 *  first cut's ±20% was invisible under Lambert lighting; critic round 2).
 *  Null moisture = untinted (baked colors). */
function padMoistureTint(m: number | null | undefined): { r: number; g: number; b: number } {
  if (m === null || m === undefined) return { r: 1, g: 1, b: 1 };
  // Dusty-pale at m=0, wet-dark (slightly cool) at m=1 — ~2.9× end-to-end.
  return { r: 1.45 - 0.95 * m, g: 1.42 - 0.96 * m, b: 1.38 - 0.94 * m };
}

function newPadMesh(geo: THREE.BufferGeometry, material: THREE.Material, name: string): PadMesh {
  const mesh = new THREE.InstancedMesh(geo, material, 64);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.frustumCulled = false; // instances span the whole plan
  return { mesh, capacity: 64, count: 0, keys: new Array<string | undefined>(64) };
}

function ensurePadState(scene: THREE.Scene): PadState {
  if (padState) return padState;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geo = padGeometries();
  padState = {
    flat: newPadMesh(geo.flat, material, 'soil-pads:flat'),
    hilled: newPadMesh(geo.hilled, material, 'soil-pads:hilled'),
    index: new Map(),
    material,
  };
  scene.add(padState.flat.mesh, padState.hilled.mesh);
  return padState;
}

function growPadMesh(pm: PadMesh): void {
  const parent = pm.mesh.parent;
  const newCap = Math.ceil(pm.capacity * 1.5);
  const mesh = new THREE.InstancedMesh(pm.mesh.geometry, pm.mesh.material, newCap);
  mesh.name = pm.mesh.name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = pm.count;
  mesh.frustumCulled = false;
  (mesh.instanceMatrix.array as Float32Array).set(
    (pm.mesh.instanceMatrix.array as Float32Array).subarray(0, pm.count * 16),
  );
  mesh.instanceMatrix.needsUpdate = true;
  if (pm.mesh.instanceColor) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(newCap * 3).fill(1), 3);
    (mesh.instanceColor.array as Float32Array).set(
      (pm.mesh.instanceColor.array as Float32Array).subarray(0, pm.count * 3),
    );
    mesh.instanceColor.needsUpdate = true;
  }
  pm.mesh.removeFromParent();
  pm.mesh.dispose(); // instance buffers only — shared geometry/material survive
  parent?.add(mesh);
  pm.mesh = mesh;
  pm.capacity = newCap;
  pm.keys = pm.keys.slice();
  pm.keys.length = newCap;
}

function writePadInstance(pm: PadMesh, slot: number, x: number, y: number, z: number, rx: number, rz: number, tint: { r: number; g: number; b: number }): void {
  scratchObj.position.set(x, y, z);
  scratchObj.rotation.set(0, 0, 0);
  // Uniform Y scale by the SAME factor as X — geometry units are voxels, so a
  // y-scale of 1 would leave the pad ~1 m tall (the wave-4 critic catch).
  const sxz = rx / PAD_UNIT_R;
  scratchObj.scale.set(sxz, sxz, rz / PAD_UNIT_R);
  scratchObj.updateMatrix();
  pm.mesh.setMatrixAt(slot, scratchObj.matrix);
  scratchColor.setRGB(tint.r, tint.g, tint.b);
  pm.mesh.setColorAt(slot, scratchColor);
  pm.mesh.instanceMatrix.needsUpdate = true;
  if (pm.mesh.instanceColor) pm.mesh.instanceColor.needsUpdate = true;
}

function removePadInstance(key: string): void {
  const ps = padState;
  if (!ps) return;
  const entry = ps.index.get(key);
  if (!entry) return;
  const pm = ps[entry.kind];
  const last = pm.count - 1;
  if (entry.slot >= 0 && entry.slot <= last) {
    if (entry.slot !== last) {
      pm.mesh.getMatrixAt(last, scratchMatrix);
      pm.mesh.setMatrixAt(entry.slot, scratchMatrix);
      if (pm.mesh.instanceColor) {
        const from = last * 3;
        const to = entry.slot * 3;
        pm.mesh.instanceColor.array[to] = pm.mesh.instanceColor.array[from];
        pm.mesh.instanceColor.array[to + 1] = pm.mesh.instanceColor.array[from + 1];
        pm.mesh.instanceColor.array[to + 2] = pm.mesh.instanceColor.array[from + 2];
        pm.mesh.instanceColor.needsUpdate = true;
      }
      const movedKey = pm.keys[last];
      pm.keys[entry.slot] = movedKey;
      if (movedKey !== undefined) {
        const moved = ps.index.get(movedKey);
        if (moved) moved.slot = entry.slot;
      }
      pm.mesh.instanceMatrix.needsUpdate = true;
    }
    pm.keys[last] = undefined;
    pm.count--;
    pm.mesh.count = pm.count;
  }
  ps.index.delete(key);
}

/**
 * Day-keyed reconcile of the shared pad instances against the live plan:
 * one flat + one hilled InstancedMesh carry every template-path cell's pad
 * (two extra draw calls worst case), tinted per cell by the projection's
 * moisture passthrough. Fallback (procedural) cells never had baked pads and
 * keep that behavior. Runs at updatePlants cadence — never per frame.
 */
function reconcilePads(
  batches: PlantBatch[],
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  viewByCell: Map<string, PlantViewParams> | undefined,
): void {
  const ps = ensurePadState(scene);
  const batchByCrop = new Map<number, PlantBatch>();
  for (const batch of batches) batchByCrop.set(batch.cropId, batch);

  interface DesiredPad { x: number; z: number; y: number; rx: number; rz: number; hilled: boolean; tint: { r: number; g: number; b: number } }
  const desired = new Map<string, DesiredPad>();
  let dbgNoBatch = 0; let dbgNoCell = 0; let dbgNoTpl = 0; let dbgNoPad = 0; let dbgOk = 0; let dbgMoist = 0;
  for (const key of Object.keys(plan.planting)) {
    const crop = cropById.get(plan.planting[key]!);
    if (!crop) continue;
    const batch = batchByCrop.get(crop.id);
    if (!batch || batch.fallback) { dbgNoBatch++; continue; }
    const cell = batch.cells.get(key);
    if (!cell) { dbgNoCell++; continue; }
    const templateHeight = cell.state ? batch.fullHeight : batch.fullHeight * templateScaleT(cell.stage);
    const tpl = getVoxelTemplate(crop, cell.stage, templateHeight, cell.state);
    if (!tpl) { dbgNoTpl++; continue; }
    if (!tpl.padRx || !tpl.padRz) { dbgNoPad++; continue; }
    dbgOk++;
    if (viewByCell?.get(key)?.moisture != null) dbgMoist++;
    desired.set(key, {
      x: cell.x,
      y: cell.y,
      z: cell.z,
      rx: tpl.padRx,
      rz: tpl.padRz,
      hilled: tpl.padHilled ?? false,
      tint: padMoistureTint(viewByCell?.get(key)?.moisture),
    });
  }

  // Remove pads whose cell vanished (or fell back / lost its template).
  for (const key of [...ps.index.keys()]) {
    if (!desired.has(key)) removePadInstance(key);
  }

  for (const [key, want] of desired) {
    const prev = ps.index.get(key);
    const kind: 'flat' | 'hilled' = want.hilled ? 'hilled' : 'flat';
    if (prev && prev.kind === kind) {
      writePadInstance(ps[prev.kind], prev.slot, want.x, want.y, want.z, want.rx, want.rz, want.tint);
      continue;
    }
    if (prev) removePadInstance(key); // kind changed (e.g. stage move to a hilled state)
    const pm = ps[kind];
    if (pm.count >= pm.capacity) growPadMesh(pm); // mutates pm.mesh in place
    const slot = pm.count;
    writePadInstance(pm, slot, want.x, want.y, want.z, want.rx, want.rz, want.tint);
    pm.keys[slot] = key;
    pm.count++;
    pm.mesh.count = pm.count;
    ps.index.set(key, { kind, slot });
  }

  ps.flat.mesh.count = ps.flat.count;
  ps.hilled.mesh.count = ps.hilled.count;
  padDebugCounts = { ok: dbgOk, noBatch: dbgNoBatch, noCell: dbgNoCell, noTpl: dbgNoTpl, noPad: dbgNoPad, moist: dbgMoist };
}

let padDebugCounts = { ok: 0, noBatch: 0, noCell: 0, noTpl: 0, noPad: 0, moist: 0 };

/** DEV-only introspection for the #ff-env-bridge probe (wave 4). */
export function __padProbe(): { flat: number; hilled: number; sample: string; dbg: string } | null {
  if (!padState) return null;
  const sample: string[] = [];
  padState.flat.mesh.instanceColor?.array?.slice?.(0, 9).forEach((v) => sample.push(v.toFixed(2)));
  const c = padDebugCounts;
  return {
    flat: padState.flat.count,
    hilled: padState.hilled.count,
    sample: sample.join(','),
    dbg: `ok=${c.ok} noBatch=${c.noBatch} noCell=${c.noCell} noTpl=${c.noTpl} noPad=${c.noPad} moist=${c.moist}`,
  };
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
      // Run mode (viewByCell): per-instance color carries stress — reset the
      // shared template material to white so batch + instance tints don't
      // compound. Legacy paths keep the scenario / MAX-stress batch tint.
      applyStressTint(batch, opts?.viewByCell ? 0 : batchTintStress(batch, crop, plan, scenario, growthCtx, opts));
    }
    batches.push(batch);
  }

  reconcilePads(batches, plan, cropById, scene, opts?.viewByCell);
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
      // Run mode (viewByCell): per-instance color carries stress — reset the
      // shared template material to white so batch + instance tints don't
      // compound. Legacy paths keep the scenario / MAX-stress batch tint.
      applyStressTint(batch, opts?.viewByCell ? 0 : batchTintStress(batch, crop, plan, scenario, growthCtx, opts));
    }
    next.push(batch);
  }

  // Crops that left the plan entirely: free their instance buffers. The
  // module-level template cache survives by design.
  for (const batch of reusable.values()) disposeBatch(batch);

  batches.length = 0;
  batches.push(...next);
  reconcilePads(next, plan, cropById, scene, opts?.viewByCell);
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
        const sm = batch.stages.get(stageKey(cell.stage, cell.state));
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
  if (padState) {
    padState.flat.mesh.removeFromParent();
    padState.hilled.mesh.removeFromParent();
    padState.flat.mesh.dispose();
    padState.hilled.mesh.dispose();
    padState.material.dispose();
    padState = null; // unit geometry cache survives; instances rebuild on demand
  }
}
