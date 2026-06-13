import * as THREE from 'three';
import type { PlanState, Crop } from '@/types';
import { parseKey } from '@/lib/plan';

export interface PlantBatch {
  mesh: THREE.InstancedMesh;
  count: number;
}

// Plant height (meters) by crop category.
const HEIGHT_BY_CATEGORY: Record<string, number> = {
  herb: 0.15,
  vegetable: 0.25,
  fruit: 0.4,
  grain: 0.35,
  cover_crop: 0.2,
  flower: 0.3,
};

const DEFAULT_PLANT_HEIGHT = 0.25;

/** Return a voxel plant height for a given crop. */
function getPlantHeight(crop: Crop): number {
  return HEIGHT_BY_CATEGORY[crop.category] ?? DEFAULT_PLANT_HEIGHT;
}

/** Build InstancedMesh batches for every unique cropId in plan.planting. */
export function buildPlants(plan: PlanState, cropById: Map<number, Crop>, scene: THREE.Scene): PlantBatch[] {
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

  const batches: PlantBatch[] = [];

  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;

    const height = getPlantHeight(crop);
    const width = plan.cellM * 0.6;
    const depth = plan.cellM * 0.6;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshBasicMaterial({
      color: crop.colorHex,
    });

    const count = keys.length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    // Plants are small decorative voxels; shadows are not critical.
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [cellX, cellY] = parseKey(keys[i]);
      const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
      const y = height / 2 + 0.01; // sit just above the ground plane

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    batches.push({ mesh, count });
  }

  return batches;
}

/** Rebuild plant batches from scratch when the plan or crop data changes. */
export function updatePlants(batches: PlantBatch[], plan: PlanState, cropById: Map<number, Crop>, scene: THREE.Scene): PlantBatch[] {
  disposePlants(batches);
  return buildPlants(plan, cropById, scene);
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
