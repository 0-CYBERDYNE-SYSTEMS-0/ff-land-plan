import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';

export interface WaterPlane {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  heights: Float32Array;
}

const WATER_SLUGS = new Set(['pond']);

/** Create animated water planes for water-type assets in the plan. */
export function buildWaterPlanes(plan: PlanState, scene: THREE.Scene): WaterPlane[] {
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const planes: WaterPlane[] = [];

  for (const [key, slug] of Object.entries(plan.ground)) {
    if (!WATER_SLUGS.has(slug)) continue;
    const [cellX, cellY] = parseKey(key);
    const x = cellX * plan.cellM + plan.cellM / 2 + offsetX;
    const z = cellY * plan.cellM + plan.cellM / 2 + offsetZ;

    const geo = new THREE.PlaneGeometry(plan.cellM * 0.9, plan.cellM * 0.9, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: '#4488cc',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    mesh.renderOrder = 999;
    mesh.name = 'Water';

    const heights = new Float32Array(geo.attributes.position.count);

    scene.add(mesh);
    planes.push({ mesh, material: mat, heights });
  }

  return planes;
}

/** Animate existing water planes with wave effect. */
export function updateWaterPlanes(planes: WaterPlane[], time: number): void {
  for (const plane of planes) {
    const geo = plane.mesh.geometry;
    const pos = geo.attributes.position.array as Float32Array;

    // Only update if we have the original heights stored
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 2]; // z in plane, before rotation
      pos[i * 3 + 2] = Math.sin(x * 2 + time * 0.8) * Math.cos(y * 2 + time * 0.6) * 0.03;
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

export function disposeWaterPlanes(planes: WaterPlane[]): void {
  for (const plane of planes) {
    plane.mesh.removeFromParent();
    plane.mesh.geometry.dispose();
    plane.material.dispose();
  }
}
