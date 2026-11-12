import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { ArchetypeId, PlanState } from '@/types';
import {
  cameraLimits,
  fitCameraToBounds,
  interiorBounds,
  interiorEyeHeightM,
  interiorFrame,
  interiorFramingAvailable,
  isEnclosedSurface,
  worldFrameBounds,
} from '@/three/cameraFrame';
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

describe('interior-first environment framing', () => {
  it('classifies surfaces and refuses an interior camera in a cold frame', () => {
    expect(isEnclosedSurface('warehouse')).toBe(true);
    expect(isEnclosedSurface('hoophouse')).toBe(true);
    expect(isEnclosedSurface('tent')).toBe(true);
    expect(isEnclosedSurface('outdoor')).toBe(false);
    expect(isEnclosedSurface(null)).toBe(false);

    // Cold frame: 2 x 1.5 m, 0.45 m tall — no standing room.
    expect(interiorFramingAvailable(2, 1.5, 0.45)).toBe(false);
    // The narrow container hall qualifies on its 11.5 m run.
    expect(interiorFramingAvailable(11.5, 2.25, 2.3)).toBe(true);
    expect(interiorFramingAvailable(6, 5, 2.2)).toBe(true);
    expect(interiorFramingAvailable(12, 10, 1.2)).toBe(false);
  });

  it('keeps the eye below the ceiling and monotone in headroom', () => {
    expect(interiorEyeHeightM(2)).toBeLessThan(2 - 0.3);
    expect(interiorEyeHeightM(2.6)).toBeLessThan(2.6 - 0.3);
    expect(interiorEyeHeightM(4)).toBeLessThan(4 - 0.3);
    expect(interiorEyeHeightM(4)).toBeGreaterThanOrEqual(interiorEyeHeightM(2.6));
    expect(interiorEyeHeightM(0.45)).toBeGreaterThan(0);
  });

  it('stands inside the shell looking down its long axis', () => {
    const cases: Array<[number, number, number]> = [
      [12, 10, 4], // warehouse
      [30, 12, 3.2], // long tunnel
      [11.5, 2.25, 2.3], // container
      [6, 5, 2.2], // grow tent
      [12, 24, 2.6], // long axis on Z
    ];

    for (const [widthM, depthM, heightM] of cases) {
      const frame = interiorFrame(widthM, depthM, heightM);
      expect(Math.abs(frame.position.x), `x inside ${widthM}x${depthM}`).toBeLessThan(widthM / 2);
      expect(Math.abs(frame.position.z), `z inside ${widthM}x${depthM}`).toBeLessThan(depthM / 2);
      expect(frame.position.y).toBeLessThan(heightM - 0.25);
      expect(frame.position.y).toBeGreaterThan(0.5);
      expect(Math.abs(frame.target.x)).toBeLessThan(widthM / 2);
      expect(Math.abs(frame.target.z)).toBeLessThan(depthM / 2);
      expect(frame.target.y).toBeLessThan(frame.position.y);

      // The look direction crosses the room rather than pinning into a wall.
      const look = frame.target.clone().sub(frame.position).normalize();
      if (widthM >= depthM) expect(Math.abs(look.x)).toBeGreaterThan(Math.abs(look.z));
      else expect(Math.abs(look.z)).toBeGreaterThan(Math.abs(look.x));
      expect(frame.distance).toBeGreaterThan(1);
    }
  });

  it('confines navigation to the environment footprint and below its ceiling', () => {
    const bounds = interiorBounds(30, 12, 3.2);
    expect(bounds.minX).toBeGreaterThan(-15);
    expect(bounds.maxX).toBeLessThan(15);
    expect(bounds.minZ).toBeGreaterThan(-6);
    expect(bounds.maxZ).toBeLessThan(6);
    expect(bounds.ceilingM).toBeLessThan(3.2);

    // A tiny footprint must still leave a non-inverted rect.
    const tiny = interiorBounds(0.5, 0.4, 1);
    expect(tiny.maxX).toBeGreaterThan(tiny.minX);
    expect(tiny.maxZ).toBeGreaterThan(tiny.minZ);
  });

  it('trades the outer void for an interior-scale zoom range on enclosed surfaces', () => {
    const enclosed = cameraLimits('warehouse', 12, 40);
    expect(enclosed.near).toBeLessThan(0.1);
    expect(enclosed.minDistance).toBeLessThan(1);
    expect(enclosed.maxDistance).toBe(40); // stop at the whole-environment fit

    const open = cameraLimits('outdoor', 12, 40);
    expect(open.near).toBeCloseTo(0.1);
    expect(open.minDistance).toBe(2);
    expect(open.maxDistance).toBe(48); // unchanged 4x behavior outside
  });
});
