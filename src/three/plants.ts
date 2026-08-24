import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanState, Crop } from '@/types';
import { parseKey } from '@/lib/plan';
import { makeCropFor } from '@/creative/crops/map';

/**
 * Plant rendering — one THREE.InstancedMesh per (crop, stage) template.
 *
 * The creative voxel assets are vertex-colored with position/normal/color
 * attributes (same layout ground.ts relies on), so each template's meshes can
 * be merged into ONE BufferGeometry and every planted cell of that template is
 * a single instance. A 200-cell wheat field at one stage costs 1 draw call
 * instead of hundreds.
 *
 * Trade-off: the old per-cell 'sway' child-group wind animation does not
 * survive instancing (instances share one geometry; per-cell group transforms
 * are gone). Per-cell sway is DROPPED for beta; swayPlants keeps its signature
 * and applies a gentle whole-batch tilt to the batch group instead so wind
 * still reads at a glance.
 *
 * The procedural fallback path (no voxel asset for a crop name) keeps the old
 * clone-per-cell approach unchanged.
 */

/** Owns the GPU resources for one (crop, stage) or fallback plant. */
interface PlantTemplate {
  /** Instanced mesh for the voxel path (one per template). */
  instancedMesh?: THREE.InstancedMesh;
  /** Merged template geometry (voxel path) — disposed once per template. */
  geometry?: THREE.BufferGeometry;
  /** Non-shared fallback resources (procedural path). */
  root?: THREE.Object3D;
  material?: THREE.Material;
}

export interface PlantBatch {
  group: THREE.Group;
  count: number;
  cropId: number;
  templates: PlantTemplate[];
  /** Sway amplitude multiplier by crop category (cached for the frame loop). */
  swayAmount: number;
}

// Height ranges (meters) by crop category: [min, max] — scaled for world visibility
const HEIGHT_RANGE: Record<string, [number, number]> = {
  vegetable: [0.7, 1.4],
  herb: [0.35, 0.7],
  fruit: [1.4, 2.6],
  grain: [0.8, 1.5],
  flower: [0.5, 1.6],
  cover_crop: [0.2, 0.45],
};

const DEFAULT_HEIGHT_RANGE: [number, number] = [0.7, 1.4];

/** Map growthDays into a height range for a given crop category. */
function getPlantHeight(crop: Crop): number {
  const [minH, maxH] = HEIGHT_RANGE[crop.category] ?? DEFAULT_HEIGHT_RANGE;
  // Normalize growthDays (clamp 50-100) to 0-1, then lerp.
  const t = Math.max(0, Math.min(1, (crop.growthDays - 50) / 50));
  return minH + t * (maxH - minH);
}

/** Compute growth scale (0-1) for a crop at a given date. */
function getGrowthScale(crop: Crop, plantedAt: string | undefined, currentDate: Date): number {
  if (!plantedAt) {
    // No planting date: show full-grown for visual appeal
    return 1;
  }
  const planted = new Date(plantedAt);
  const daysSince = (currentDate.getTime() - planted.getTime()) / 86_400_000;
  const maturityDays = crop.growthDays ?? 60;
  return Math.max(0, Math.min(1, daysSince / maturityDays));
}

/** Map a growth scale (0-1) to a discrete voxel-asset stage 0..5. */
function stageForScale(scale: number): number {
  return Math.max(0, Math.min(5, Math.round(scale * 5)));
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

/** Shared vertex-colored material for all instanced plant batches. */
let sharedPlantMaterial: THREE.MeshLambertMaterial | null = null;

function getPlantMaterial(): THREE.MeshLambertMaterial {
  if (!sharedPlantMaterial) {
    sharedPlantMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  return sharedPlantMaterial;
}

/** Build InstancedMesh batches: one draw call per (crop, stage) template. */
export function buildPlants(
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  currentDate?: Date,
): PlantBatch[] {
  // Group cells by crop id.
  const cellsByCropId = new Map<number, string[]>();
  for (const key of Object.keys(plan.planting)) {
    const cropId = plan.planting[key];
    const arr = cellsByCropId.get(cropId);
    if (arr) arr.push(key);
    else cellsByCropId.set(cropId, [key]);
  }

  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const now = currentDate ?? new Date();
  const plantedAtMap = plan.plantedAt ?? {};

  const batches: PlantBatch[] = [];

  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;

    const fullHeight = getPlantHeight(crop);
    const group = new THREE.Group();
    group.name = `plants:${crop.name}`;

    const templates = new Map<number, PlantTemplate>();

    // Sway amount cached per batch (mirrors the old category table).
    let swayAmount = 0;
    switch (crop.category) {
      case 'grain':
      case 'flower':
        swayAmount = 0.04;
        break;
      case 'vegetable':
      case 'fruit':
        swayAmount = 0.015;
        break;
      default:
        swayAmount = 0.005;
    }

    const getTemplate = (stage: number): PlantTemplate | null => {
      const existing = templates.get(stage);
      if (existing) return existing;

      const growthT = stage / 5;
      const targetHeight = fullHeight * (0.15 + 0.85 * growthT);

      // Preferred path: creative voxel asset merged into one instanced mesh.
      const voxelRoot = buildNormalizedVoxelRoot(crop, stage, targetHeight);
      if (voxelRoot) {
        const geometry = mergeTemplateGeometry(voxelRoot);
        if (geometry) {
          const mesh = new THREE.InstancedMesh(geometry, getPlantMaterial(), Math.max(keys.length, 1));
          mesh.name = `plants-inst:${crop.name}:s${stage}`;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.count = 0; // filled in below; shrink to actual usage at the end
          mesh.frustumCulled = false; // instances span the whole plan
          group.add(mesh);
          const tpl: PlantTemplate = { instancedMesh: mesh, geometry };
          templates.set(stage, tpl);
          return tpl;
        }
        // Asset existed but produced no mergeable static geometry — fall through.
      }

      // Fallback: procedural merged geometry (one shared geometry + material),
      // cloned per cell as before.
      const geometry = buildPlantGeometry(crop, targetHeight);
      const material = new THREE.MeshBasicMaterial({ color: crop.colorHex });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const holder = new THREE.Group();
      holder.add(mesh);
      const tpl: PlantTemplate = { root: holder, geometry, material };
      templates.set(stage, tpl);
      return tpl;
    };

    // Track per-template instance write index.
    const writeIndex = new Map<PlantTemplate, number>();
    let anyPlaced = false;

    for (const key of keys) {
      const [cellX, cellY] = parseKey(key);
      const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
      const y = 0.01; // sit on ground plane

      const growthScale = currentDate ? getGrowthScale(crop, plantedAtMap[key], now) : 1;
      const stage = stageForScale(growthScale);

      const tpl = getTemplate(stage);
      if (!tpl) continue;

      const jitter = jitterForCell(cellX, cellY, plan.cellM);

      if (tpl.instancedMesh) {
        const dummy = new THREE.Object3D();
        dummy.rotation.y = jitter.rotY;
        // Template geometry is sized so its bbox height == target height at
        // unit scale, base baked at local y=0. Per-cell vertical jitter scales
        // uniformly around the base.
        dummy.scale.setScalar(jitter.scaleY);
        dummy.position.set(x + jitter.offsetX, y, z + jitter.offsetZ);
        dummy.updateMatrix();

        const idx = writeIndex.get(tpl) ?? 0;
        tpl.instancedMesh.setMatrixAt(idx, dummy.matrix);
        writeIndex.set(tpl, idx + 1);
        anyPlaced = true;
        continue;
      }

      // Procedural fallback path: clone shares geometry/materials.
      if (!tpl.root) continue;
      const inst = tpl.root.clone(true);
      inst.name = `plant:${crop.name}:${key}`;
      inst.rotation.y = jitter.rotY;
      inst.scale.setScalar(jitter.scaleY);
      inst.position.set(x + jitter.offsetX, y, z + jitter.offsetZ);
      group.add(inst);
      anyPlaced = true;
    }

    if (!anyPlaced) continue;

    // Trim each instanced mesh down to the instances actually written.
    for (const tpl of templates.values()) {
      const mesh = tpl.instancedMesh;
      if (!mesh) continue;
      const written = writeIndex.get(tpl) ?? 0;
      if (written === 0) {
        mesh.removeFromParent();
        mesh.dispose();
        tpl.geometry?.dispose();
        continue;
      }
      mesh.count = written;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    group.castShadow = false;
    group.receiveShadow = false;
    scene.add(group);
    batches.push({
      group,
      count: keys.length,
      cropId,
      templates: Array.from(templates.values()),
      swayAmount,
    });
  }

  return batches;
}

/** Rebuild plant batches from scratch when the plan or crop data changes. */
export function updatePlants(
  batches: PlantBatch[],
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  currentDate?: Date,
): PlantBatch[] {
  disposePlants(batches);
  return buildPlants(plan, cropById, scene, currentDate);
}

/**
 * Apply gentle batch-level wind motion. Per-cell 'sway' child groups no longer
 * exist under instancing (dropped for beta), so this tilts each batch group
 * slightly — enough that gusts still read across a field.
 */
export function swayPlants(batches: PlantBatch[], _crops: Map<number, Crop>, time: number, windStrength: number): void {
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const amp = batch.swayAmount * windStrength;
    if (amp <= 0) continue;

    const phase = time * 1.5 + batch.cropId;
    batch.group.rotation.z = Math.sin(phase) * amp;
    batch.group.rotation.x = Math.cos(time * 1.3 + batch.cropId * 0.7) * amp * 0.6;
  }
}

/** Dispose all geometry and materials held by plant batches (once per template). */
export function disposePlants(batches: PlantBatch[]): void {
  for (const batch of batches) {
    batch.group.removeFromParent();

    // Dispose shared GPU resources exactly once, per template.
    for (const tpl of batch.templates) {
      if (tpl.geometry) tpl.geometry.dispose();
      if (tpl.material) tpl.material.dispose();
      if (tpl.instancedMesh) {
        // Disposes instance buffers; the shared geometry/material are handled
        // above (material is module-shared and disposed below).
        tpl.instancedMesh.dispose();
      }
      if (tpl.root) {
        tpl.root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) {
            for (const m of mat) m.dispose();
          } else if (mat) {
            mat.dispose();
          }
        });
      }
    }
  }
  batches.length = 0;
}
