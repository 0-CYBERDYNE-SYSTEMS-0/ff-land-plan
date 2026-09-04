/**
 * Lane D shared build helpers — thin conveniences over the voxel kit for
 * assembling articulated creatures (named, pivotable parts) from voxels.
 * All randomness flows through rng(seed) at build time; ticks never allocate.
 */
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMesh, type Voxel } from '@/creative/voxel';

/** Base internal grid for creatures/tools: 5 cm — half of the 10 cm tile voxel. */
export const U = 0.05;

export type Rig = Record<string, THREE.Object3D>;

/** Push one voxel. */
export function put(out: Voxel[], x: number, y: number, z: number, color: number, s = 1): void {
  out.push({ x, y, z, color, s });
}

/** Run a placement fn for both +1 and -1 x-signs (symmetric pairs). */
export function mirr(fn: (sgn: number) => void): void {
  fn(1);
  fn(-1);
}

/** Mesh from voxels, scaled so 1 voxel unit = `unit` world units. */
export function meshOf(voxels: Voxel[], unit: number = U): THREE.Mesh {
  const m = voxelMesh(voxels);
  m.scale.setScalar(unit);
  return m;
}

/**
 * Named pivotable part. The group sits at the joint (px,py,pz in voxel units)
 * and the mesh is offset back so voxel coords stay in the PARENT's frame —
 * for root-level parts that is whole-body space, and rotating the group
 * pivots the part around its joint. IMPORTANT: for parts nested inside
 * another part (ears on a head, jaw on a head…), pass voxel coords and the
 * pivot in the PARENT part's local frame (whole-body minus parent pivot),
 * otherwise the parent's offset is applied twice and the part floats away.
 */
export function part(
  name: string,
  voxels: Voxel[],
  px: number,
  py: number,
  pz: number,
  unit: number = U,
): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(px * unit, py * unit, pz * unit);
  const m = meshOf(voxels, unit);
  m.position.set(-px * unit, -py * unit, -pz * unit);
  g.add(m);
  return g;
}

/** Like `part` but with a translucent material (insect wings). */
export function ghostPart(
  name: string,
  voxels: Voxel[],
  px: number,
  py: number,
  pz: number,
  unit: number = U,
  opacity = 0.5,
): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(px * unit, py * unit, pz * unit);
  const geo = buildVoxelGeometry(voxels);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false }),
  );
  m.scale.setScalar(unit);
  m.position.set(-px * unit, -py * unit, -pz * unit);
  g.add(m);
  return g;
}

export interface PoseNums {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
}

/** Snapshot base transforms of every node so ticks can assign absolute values. */
export function savePoses(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.userData.pose = {
      px: o.position.x, py: o.position.y, pz: o.position.z,
      rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
      sx: o.scale.x, sy: o.scale.y, sz: o.scale.z,
    } satisfies PoseNums;
  });
}

export function pose(o: THREE.Object3D): PoseNums {
  return o.userData.pose as PoseNums;
}

/** Store the named-part map on a freshly built root. */
export function setRig(root: THREE.Object3D, rig: Rig): void {
  root.userData.rig = rig;
}

/** Ticks may receive the showcase pivot OR an embedded creature root. */
export function rigOf(pivotObj: THREE.Object3D): Rig {
  const own = pivotObj.userData.rig as Rig | undefined;
  if (own) return own;
  const root = pivotObj.children[0];
  return ((root && root.userData.rig) ?? {}) as Rig;
}

/**
 * Smooth 0..1 pulse that fires once per cycle of `sin(t*freq+phase)` —
 * used for occasional actions (pecks, flicks) inside an endless loop.
 */
export function pulse(t: number, freq: number, phase = 0): number {
  const s = Math.sin(t * freq + phase);
  return s <= 0 ? 0 : s * s * s * s;
}
