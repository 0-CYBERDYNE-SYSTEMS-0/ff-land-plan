import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanState, Crop } from '@/types';
import { parseKey } from '@/lib/plan';

export interface PlantBatch {
  mesh: THREE.InstancedMesh;
  count: number;
  cropId: number;
}

// Height ranges (meters) by crop category: [min, max]
const HEIGHT_RANGE: Record<string, [number, number]> = {
  vegetable: [0.2, 0.4],
  herb: [0.1, 0.2],
  fruit: [0.15, 0.3],
  grain: [0.3, 0.6],
  flower: [0.15, 0.5],
  cover_crop: [0.05, 0.1],
};

const DEFAULT_HEIGHT_RANGE: [number, number] = [0.2, 0.4];

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
// Procedural geometry builders per category
// ---------------------------------------------------------------------------

function buildVegetableGeometry(crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem
  const stem = new THREE.CylinderGeometry(0.01, 0.015, height, 5);
  stem.translate(0, height / 2, 0);
  parts.push(stem);

  // 2-3 leaves
  const leafCount = 2 + (Math.round(crop.growthDays) % 2); // 2 or 3
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.SphereGeometry(0.04, 4, 4);
    leaf.scale(1, 0.3, 1);
    const angle = (i / leafCount) * Math.PI * 2;
    const y = height * 0.5 + (i / leafCount) * height * 0.4;
    leaf.translate(Math.cos(angle) * 0.03, y, Math.sin(angle) * 0.03);
    parts.push(leaf);
  }

  // Fruit near top
  const fruit = new THREE.SphereGeometry(0.025, 4, 4);
  fruit.translate(0, height * 0.85, 0);
  parts.push(fruit);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildHerbGeometry(crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const clusterCount = 3 + (Math.round(crop.growthDays) % 3); // 3-5
  for (let i = 0; i < clusterCount; i++) {
    const sphere = new THREE.SphereGeometry(0.03, 4, 4);
    const angle = (i / clusterCount) * Math.PI * 2;
    const r = 0.02 + (i % 2) * 0.02;
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
  const stem = new THREE.CylinderGeometry(0.008, 0.012, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  parts.push(stem);

  // Leaf canopy
  const canopy = new THREE.SphereGeometry(0.06, 5, 5);
  canopy.scale(1, 0.4, 1);
  canopy.translate(0, height * 0.8, 0);
  parts.push(canopy);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildGrainGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stalk
  const stalk = new THREE.CylinderGeometry(0.008, 0.01, height, 4);
  stalk.translate(0, height / 2, 0);
  parts.push(stalk);

  // Tassel
  const tassel = new THREE.ConeGeometry(0.02, 0.05, 4);
  tassel.translate(0, height + 0.025, 0);
  parts.push(tassel);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildFlowerGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem
  const stemH = height * 0.7;
  const stem = new THREE.CylinderGeometry(0.005, 0.008, stemH, 4);
  stem.translate(0, stemH / 2, 0);
  parts.push(stem);

  // Flower head
  const head = new THREE.SphereGeometry(0.035, 5, 5);
  head.translate(0, height, 0);
  parts.push(head);

  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function buildCoverCropGeometry(_crop: Crop, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const patch = new THREE.SphereGeometry(0.05, 4, 4);
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
// Instanced batching
// ---------------------------------------------------------------------------

/** Build InstancedMesh batches for every unique cropId in plan.planting. */
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
  const plantedAt = plan.plantedAt ?? {};

  const batches: PlantBatch[] = [];

  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;

    const fullHeight = getPlantHeight(crop);
    const geometry = buildPlantGeometry(crop, fullHeight);
    const material = new THREE.MeshBasicMaterial({ color: crop.colorHex });

    const count = keys.length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [cellX, cellY] = parseKey(keys[i]);
      const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
      const y = 0.01; // sit on ground plane

      const jitter = jitterForCell(cellX, cellY, plan.cellM);
      const scale = currentDate ? getGrowthScale(crop, plantedAt[keys[i]], now) : 1;

      dummy.position.set(x + jitter.offsetX, y, z + jitter.offsetZ);
      dummy.rotation.set(0, jitter.rotY, 0);
      dummy.scale.set(1, jitter.scaleY * scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    batches.push({ mesh, count, cropId });
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

/** Apply gentle wind sway to plant batches based on crop category. */
export function swayPlants(batches: PlantBatch[], crops: Map<number, Crop>, time: number, windStrength: number): void {
  for (const batch of batches) {
    const crop = crops.get(batch.cropId);
    if (!crop) continue;

    // Only tall crops sway noticeably
    let swayAmount = 0;
    switch (crop.category) {
      case 'grain':
      case 'flower':
        swayAmount = 0.04 * windStrength;
        break;
      case 'vegetable':
      case 'fruit':
        swayAmount = 0.015 * windStrength;
        break;
      default:
        swayAmount = 0.005 * windStrength;
    }

    if (swayAmount > 0) {
      const sway = Math.sin(time * 1.5 + batch.cropId) * swayAmount;
      batch.mesh.rotation.z = sway;
      batch.mesh.rotation.x = Math.cos(time * 1.3 + batch.cropId * 0.7) * swayAmount * 0.6;
    }
  }
}

/** Dispose all geometry and materials held by plant batches. */
export function disposePlants(batches: PlantBatch[]): void {
  for (const batch of batches) {
    batch.mesh.removeFromParent();
    batch.mesh.geometry.dispose();
    const mat = batch.mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else {
      mat.dispose();
    }
  }
  batches.length = 0;
}
