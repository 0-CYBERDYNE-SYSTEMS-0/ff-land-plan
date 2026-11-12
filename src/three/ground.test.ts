import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVoxelGeometry } from '@/creative/voxel';
import { makeFloorConcrete, makeFloorGreenhouse, makeFloorMylar } from '@/creative/terrain/floors';
import { makeGrass01 } from '@/creative/terrain/tiles';
import { cullVoxelFaces, buildGround } from '@/three/ground';
import { seedPlans } from '@/data/seed';

function triangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return index ? index.count / 3 : geometry.getAttribute('position').count / 3;
}

/** Merge a tile maker's voxel parts exactly like buildTemplate does, unculled. */
function bake(maker: () => THREE.Object3D): THREE.BufferGeometry {
  const root = maker();
  root.updateMatrixWorld(true);
  let geometry: THREE.BufferGeometry | null = null;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if (!mesh.geometry.getAttribute('color')) return;
    geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
  });
  if (!geometry) throw new Error('maker produced no voxel geometry');
  return geometry;
}

function box3(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.clone();
}

/**
 * The ground layer is ~95% of every plan's triangle budget (one instanced tile
 * per plan cell), so these tests pin both the cull's exactness and the budget
 * the enlarged demo worlds are allowed to spend.
 */
describe('ground voxel culling', () => {
  it('drops the faces between neighbours and nothing else', () => {
    for (const count of [1, 2, 3, 5]) {
      const voxels = Array.from({ length: count }, (_, x) => ({ x, y: 0, z: 0, color: 0x445566 }));
      const source = buildVoxelGeometry(voxels);
      const culled = cullVoxelFaces(source);
      // Each neighbour boundary hides two quads (4 triangles).
      expect(triangles(culled), `${count} adjacent voxels`).toBe(12 * count - 4 * (count - 1));
      expect(box3(culled)).toEqual(box3(source));
    }
  });

  it('leaves a lone voxel and off-grid decorations untouched', () => {
    const lone = buildVoxelGeometry([{ x: 0, y: 0, z: 0, color: 0x445566 }]);
    expect(cullVoxelFaces(lone)).toBe(lone);

    const decorated = buildVoxelGeometry([
      { x: 0, y: 0, z: 0, color: 0x445566 },
      { x: 0.4, y: 0.4, z: 0.4, s: 0.5, color: 0x998877 },
    ]);
    const culled = cullVoxelFaces(decorated);
    // The decoration keeps all six faces; the grid voxel keeps all six too.
    expect(triangles(culled)).toBe(24);
    expect(box3(culled)).toEqual(box3(decorated));
  });

  it('keeps a solid slab surface-exact while removing its interior', () => {
    const voxels = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) voxels.push({ x, y, z, color: 0x445566 });
    const source = buildVoxelGeometry(voxels);
    const culled = cullVoxelFaces(source);
    // A 3 x 3 x 3 block has 3 axes x 2 x 3 x 3 = 54 voxel adjacencies, and each
    // adjacency hides two quads (4 triangles) — leaving the 54 surface quads.
    expect(triangles(source)).toBe(324);
    expect(triangles(culled)).toBe(324 - 54 * 4);
    expect(triangles(culled)).toBe(54 * 2);
    expect(box3(culled)).toEqual(box3(source));
  });

  it('drops the below-surface skirt in floorOnly mode without moving the surface', () => {
    const stack = buildVoxelGeometry([
      { x: 0, y: 0, z: 0, color: 0x445566 },
      { x: 0, y: 1, z: 0, color: 0x778899 },
    ]);
    const culled = cullVoxelFaces(stack, { floorOnly: true });
    expect(triangles(culled)).toBe(12);
    const before = box3(stack);
    const after = box3(culled);
    expect(after.max.y).toBe(before.max.y);
    expect(after.min.y).toBe(before.min.y + 1);
    expect(after.min.x).toBe(before.min.x);
    expect(after.max.x).toBe(before.max.x);
  });

  it.each([
    ['floor-concrete', makeFloorConcrete],
    ['floor-mylar', makeFloorMylar],
    ['floor-greenhouse', makeFloorGreenhouse],
  ])('cuts the %s tile at least threefold and keeps its footprint and top', (_label, maker) => {
    const source = bake(maker);
    const culled = cullVoxelFaces(source, { floorOnly: true });
    expect(triangles(culled) * 3).toBeLessThan(triangles(source));
    const before = box3(source);
    const after = box3(culled);
    expect(after.max.y).toBeCloseTo(before.max.y, 4);
    expect(after.min.x).toBeCloseTo(before.min.x, 4);
    expect(after.max.x).toBeCloseTo(before.max.x, 4);
    expect(after.min.z).toBeCloseTo(before.min.z, 4);
    expect(after.max.z).toBeCloseTo(before.max.z, 4);
    expect(after.min.y).toBeGreaterThan(before.min.y);
  });

  it('keeps terrain tiles lossless in every direction', () => {
    const source = bake(makeGrass01);
    const culled = cullVoxelFaces(source);
    expect(triangles(culled)).toBeLessThan(triangles(source));
    expect(box3(culled)).toEqual(box3(source));
  });
});

describe('ground geometry budget', () => {
  const budget = new Map<number, number>([
    [5, 1_500_000],
    [6, 19_000_000],
    [7, 14_000_000],
    [8, 11_000_000],
    [9, 36_000_000],
  ]);

  it.each([5, 6, 7, 8, 9])('keeps the enclosed demo world %i inside its triangle budget', (farmId) => {
    const plan = seedPlans[farmId]!;
    const scene = new THREE.Scene();
    const batches = buildGround(plan, scene);
    const total = batches.reduce((sum, batch) => sum + triangles(batch.mesh.geometry) * batch.count, 0);
    expect(total).toBeLessThan(budget.get(farmId)!);
    expect(batches.reduce((sum, batch) => sum + batch.count, 0)).toBe(
      Math.round(plan.widthM / plan.cellM) * Math.round(plan.heightM / plan.cellM),
    );
  });
});
