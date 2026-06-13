import * as THREE from 'three';
import { assetBySlug } from '@/data/assets';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';

export interface StructureBatch {
  mesh: THREE.InstancedMesh;
  count: number;
}

// Height defaults (meters) for each known asset slug.
const HEIGHT_MAP: Record<string, number> = {
  'raised-bed': 0.3,
  'inground-bed': 0.05,
  'greenhouse': 0.6,
  'polytunnel': 0.5,
  'cold-frame': 0.2,
  'trellis': 1.5,
  'fruit-tree': 2.5,
  'path-gravel': 0.02,
  'path-woodchip': 0.02,
  'path-stone': 0.02,
  'fence': 1.0,
  'gate': 1.0,
  'shed': 2.2,
  'compost-bin': 1.0,
  'rain-barrel': 0.8,
  'ibc-tote': 1.0,
  'water-tap': 0.5,
  'irrigation-line': 0.02,
  'pond': 0.05,
  'beehive': 0.5,
  'chicken-coop': 1.5,
};

const DEFAULT_HEIGHT = 0.25;

/** Return the default vertical height for a given asset slug. */
export function getAssetHeight(slug: string): number {
  return HEIGHT_MAP[slug] ?? DEFAULT_HEIGHT;
}

/** Determine whether an asset should be rendered with translucency. */
function isTranslucent(slug: string): boolean {
  return slug === 'greenhouse' || slug === 'polytunnel' || slug === 'pond';
}

/** Build InstancedMesh batches for every unique asset slug in plan.ground. */
export function buildStructures(plan: PlanState, scene: THREE.Scene): StructureBatch[] {
  // Group cells by asset slug.
  const cellsBySlug = new Map<string, string[]>();
  for (const key of Object.keys(plan.ground)) {
    const slug = plan.ground[key];
    if (!slug) continue;
    const arr = cellsBySlug.get(slug);
    if (arr) arr.push(key);
    else cellsBySlug.set(slug, [key]);
  }

  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);

  const batches: StructureBatch[] = [];

  for (const [slug, keys] of cellsBySlug) {
    const asset = assetBySlug(slug);
    const height = getAssetHeight(slug);
    const color = asset?.colorHex ?? '#888888';
    const translucent = isTranslucent(slug);

    // Each batch gets its own geometry so disposal is safe per-batch.
    const geometry = new THREE.BoxGeometry(plan.cellM, 1, plan.cellM);
    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: translucent,
      opacity: translucent ? 0.5 : 1.0,
      roughness: 0.8,
      metalness: 0.1,
    });

    const count = keys.length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [cellX, cellY] = parseKey(keys[i]);
      const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
      const y = height / 2;

      dummy.position.set(x, y, z);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    batches.push({ mesh, count });
  }

  return batches;
}

/** Rebuild structure batches from scratch when the plan changes. */
export function updateStructures(batches: StructureBatch[], plan: PlanState, scene: THREE.Scene): StructureBatch[] {
  disposeStructures(batches);
  return buildStructures(plan, scene);
}

/** Dispose all geometry and materials held by structure batches. */
export function disposeStructures(batches: StructureBatch[]): void {
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
