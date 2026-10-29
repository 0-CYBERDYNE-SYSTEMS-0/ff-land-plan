import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { ArchetypeId, PlanState } from '@/types';
import { fitCameraToBounds, worldFrameBounds } from '@/three/cameraFrame';
import { buildShell, releaseShellCache } from '@/three/shell';

const plan: PlanState = {
  farmId: 1,
  widthM: 2,
  heightM: 1.5,
  cellM: 0.25,
  allowOutsideBeds: false,
  planting: {},
  ground: {},
  updatedAt: '2026-10-24T00:00:00.000Z',
};

afterEach(() => releaseShellCache());

function expectFits(bounds: THREE.Box3, aspect: number): void {
  const frame = fitCameraToBounds(bounds, aspect);
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
  camera.position.copy(frame.position);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.83);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.83);
      }
}

describe('world camera home framing', () => {
  it('fits the actual shell and floor bounds for short, tall, and narrow worlds', () => {
    const cases: Array<[ArchetypeId, number, number, number]> = [
      ['greenhouse-glass', 8, 6, 1.1],
      ['cold-frame', 2, 1.5, 0.9],
      ['warehouse-vertical', 12, 10, 1.2],
      ['container-farm', 11.5, 2.25, 1.1],
    ];

    for (const [archetype, widthM, depthM, aspect] of cases) {
      const scene = new THREE.Scene();
      const shell = buildShell({ ...plan, widthM, heightM: depthM }, scene, archetype);
      const bounds = worldFrameBounds(widthM, depthM, shell?.root);
      expectFits(bounds, aspect);
    }
  });

  it('fits the full floor extent of a large open plan in a narrow viewport', () => {
    expectFits(worldFrameBounds(60, 24), 0.72);
  });
});
