import * as THREE from 'three';
import type { PlanState, Crop } from '@/types';
import { parseKey } from '@/lib/plan';

export interface GhostBatch {
  mesh: THREE.InstancedMesh;
  count: number;
}

/** Build ghost (translucent) plant batches for a historical plan state. */
export function buildGhostPlants(
  plan: PlanState,
  cropById: Map<number, Crop>,
  scene: THREE.Scene,
  color: string,
  opacity: number,
): GhostBatch[] {
  const cellsByCropId = new Map<number, string[]>();
  for (const key of Object.keys(plan.planting)) {
    const cropId = plan.planting[key];
    const arr = cellsByCropId.get(cropId);
    if (arr) arr.push(key);
    else cellsByCropId.set(cropId, [key]);
  }

  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const batches: GhostBatch[] = [];

  for (const [cropId, keys] of cellsByCropId) {
    const crop = cropById.get(cropId);
    if (!crop) continue;

    const height = 0.15; // fixed small height for ghosts
    const geometry = new THREE.BoxGeometry(plan.cellM * 0.5, height, plan.cellM * 0.5);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
    });

    const count = keys.length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [cellX, cellY] = parseKey(keys[i]);
      const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
      const y = height / 2 + 0.01;
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

export function disposeGhostPlants(batches: GhostBatch[]): void {
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
