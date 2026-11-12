import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { entries } from './registry';

/**
 * Composition gates for the lane-E environment dioramas. Everything here
 * measures real THREE.Box3 bounds of built geometry (voxel units × 0.1 m):
 * no test recomputes the placement formula that produced the layout.
 */
const VOXEL_M = 0.1;

/** Shell footprints mirrored from the compose() calls in registry.ts. */
const FOOTPRINTS: Record<string, [number, number]> = {
  'env-greenhouse': [4.2, 6.4],
  'env-hoophouse': [4.2, 7],
  'env-grow-tent': [2.8, 2.8],
  'env-grow-room': [4, 4],
  'env-grow-shelf': [3, 2.6],
  'env-warehouse': [6, 8],
  'env-container-farm': [6.4, 2.4],
  'env-aquaponics': [5, 6],
  'env-nft-gully': [3.2, 5],
};

/** Slack for shell cladding that intentionally kisses the footprint edge
 *  (measured overshoot ≤ 0.08 m: door curtains, hoop ribs, canvas seams). */
const FIT_TOL_M = 0.15;

function build(id: string): THREE.Object3D {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`missing registry entry ${id}`);
  return entry.make();
}

function boxOf(obj: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(obj);
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
}

/** Children whose real bounds match a long narrow rack row (rotated 90°). */
function rackRows(diorama: THREE.Object3D): THREE.Object3D[] {
  return diorama.children.filter((child) => {
    const size = boxOf(child).getSize(new THREE.Vector3()).multiplyScalar(VOXEL_M);
    return size.z >= 4 && size.x <= 0.8;
  });
}

describe('environment diorama composition (registry)', () => {
  it('keeps every diorama inside its shell footprint plus a small tolerance', () => {
    for (const entry of entries) {
      const [wM, dM] = FOOTPRINTS[entry.id];
      const obj = build(entry.id);
      const box = boxOf(obj);
      const min = box.min.clone().multiplyScalar(VOXEL_M);
      const max = box.max.clone().multiplyScalar(VOXEL_M);
      expect(min.x, `${entry.id} min x ${min.x.toFixed(3)}`).toBeGreaterThanOrEqual(-wM / 2 - FIT_TOL_M);
      expect(max.x, `${entry.id} max x ${max.x.toFixed(3)}`).toBeLessThanOrEqual(wM / 2 + FIT_TOL_M);
      expect(min.z, `${entry.id} min z ${min.z.toFixed(3)}`).toBeGreaterThanOrEqual(-dM / 2 - FIT_TOL_M);
      expect(max.z, `${entry.id} max z ${max.z.toFixed(3)}`).toBeLessThanOrEqual(dM / 2 + FIT_TOL_M);
      expect(min.y, `${entry.id} min y`).toBeGreaterThanOrEqual(-0.2);
      disposeTree(obj);
    }
  });

  it('builds identical geometry for identical calls (deterministic layouts)', () => {
    for (const entry of entries) {
      const a = boxOf(build(entry.id));
      const b = boxOf(build(entry.id));
      expect(a.min.toArray(), `${entry.id} bounds min`).toEqual(b.min.toArray());
      expect(a.max.toArray(), `${entry.id} bounds max`).toEqual(b.max.toArray());
    }
  });

  it('warehouse has ≥3 parallel rack rows with aisles in the 0.9–1.2 m spec band', () => {
    const obj = build('env-warehouse');
    const rows = rackRows(obj)
      .map((row) => boxOf(row))
      .sort((a, b) => (a.min.x + a.max.x) / 2 - (b.min.x + b.max.x) / 2);
    expect(rows.length, 'rack rows found by long-narrow bounds').toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rows.length; i++) {
      const gapM = (rows[i].min.x - rows[i - 1].max.x) * VOXEL_M;
      expect(gapM, `aisle ${i - 1}→${i}: ${gapM.toFixed(3)} m`).toBeGreaterThanOrEqual(0.9);
      expect(gapM, `aisle ${i - 1}→${i}: ${gapM.toFixed(3)} m`).toBeLessThanOrEqual(1.2);
    }
    disposeTree(obj);
  });

  it('container farm: shell long axis X, two rack walls along X, 0.6–0.8 m aisle', () => {
    const obj = build('env-container-farm');
    // whole-diorama bounds read long in X — the ISO container orientation
    const size = boxOf(obj).getSize(new THREE.Vector3()).multiplyScalar(VOXEL_M);
    expect(
      size.x,
      `long axis X: x ${size.x.toFixed(2)} m vs z ${size.z.toFixed(2)} m`,
    ).toBeGreaterThan(size.z * 2);
    const rows = obj.children
      .filter((child) => {
        const s = boxOf(child).getSize(new THREE.Vector3()).multiplyScalar(VOXEL_M);
        return s.x >= 3.4 && s.z <= 0.8;
      })
      .map((row) => boxOf(row))
      .sort((a, b) => (a.min.z + a.max.z) / 2 - (b.min.z + b.max.z) / 2);
    expect(rows.length, 'rack walls found by long-X narrow bounds').toBe(2);
    const aisleM = (rows[1].min.z - rows[0].max.z) * VOXEL_M;
    expect(aisleM, `container aisle: ${aisleM.toFixed(3)} m`).toBeGreaterThanOrEqual(0.6);
    expect(aisleM, `container aisle: ${aisleM.toFixed(3)} m`).toBeLessThanOrEqual(0.8);
    // rack backs kiss the long ±Z walls of the shell
    const dM = FOOTPRINTS['env-container-farm'][1];
    expect(-rows[0].min.z * VOXEL_M, 'far rack backs the -Z wall').toBeGreaterThanOrEqual(dM / 2 - 0.25);
    expect(rows[1].max.z * VOXEL_M, 'near rack backs the +Z wall').toBeGreaterThanOrEqual(dM / 2 - 0.25);
    disposeTree(obj);
  });

  it('grow room leaves a walkable aisle between its flood tables (≥0.5 m)', () => {
    const obj = build('env-grow-room');
    const tables = obj.children
      .filter((child) => {
        const size = boxOf(child).getSize(new THREE.Vector3()).multiplyScalar(VOXEL_M);
        return size.x >= 2.4 && size.x <= 2.9 && size.z >= 1.0 && size.z <= 1.5;
      })
      .map((t) => boxOf(t))
      .sort((a, b) => (a.min.z + a.max.z) / 2 - (b.min.z + b.max.z) / 2);
    expect(tables.length, 'flood tables found by 2.6×1.3 m bounds').toBe(2);
    const gapM = (tables[1].min.z - tables[0].max.z) * VOXEL_M;
    expect(gapM, `grow-room aisle: ${gapM.toFixed(3)} m`).toBeGreaterThanOrEqual(0.5);
    disposeTree(obj);
  });

  it('greenhouse bench crops rest on the bench surface (within 0.12 m)', () => {
    const obj = build('env-greenhouse');
    const benches = obj.children.filter((child) => {
      if (child.name === 'crop') return false;
      const size = boxOf(child).getSize(new THREE.Vector3()).multiplyScalar(VOXEL_M);
      return size.z >= 3.2 && size.z <= 3.6 && size.x >= 0.55 && size.x <= 0.9;
    });
    expect(benches.length, 'cedar benches found by 3.4×0.7 m bounds').toBe(2);
    const benchTopM = Math.max(...benches.map((b) => boxOf(b).max.y)) * VOXEL_M;
    const benchCrops = obj.children.filter(
      (child) =>
        child.name === 'crop' && Math.abs(child.position.x) > 10 && child.position.y * VOXEL_M > 0.5,
    );
    expect(benchCrops.length, 'elevated bench crops found').toBe(4);
    for (const crop of benchCrops) {
      const baseM = boxOf(crop).min.y * VOXEL_M;
      const liftM = baseM - benchTopM;
      expect(
        Math.abs(liftM),
        `bench crop at x=${crop.position.x} z=${crop.position.z.toFixed(1)}: base ${baseM.toFixed(3)} vs bench top ${benchTopM.toFixed(3)}`,
      ).toBeLessThanOrEqual(0.12);
    }
    disposeTree(obj);
  });
});
