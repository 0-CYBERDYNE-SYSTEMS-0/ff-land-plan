import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  makeTentShell,
  makeIndoorShell,
  makeGreenhouseShell,
  makeColdFrameShell,
  makeHoophouseShell,
  makeWarehouseShell,
  makeContainerShell,
  type ShellSpec,
} from './shells';

/** Makers return geometry in 10 cm voxels — meters = voxels × 0.1. */
const VOXEL_M = 0.1;

interface MakerEntry {
  name: string;
  make: (spec: ShellSpec) => THREE.Object3D;
  /** Typical registry/setup footprint (widthM × depthM in meters). */
  typical: [number, number];
}

const MAKERS: MakerEntry[] = [
  { name: 'tent', make: makeTentShell, typical: [2.8, 2.8] },
  { name: 'indoor', make: makeIndoorShell, typical: [4, 4] },
  { name: 'greenhouse', make: makeGreenhouseShell, typical: [4.2, 6.4] },
  { name: 'cold frame', make: makeColdFrameShell, typical: [2, 1.5] },
  { name: 'hoophouse', make: makeHoophouseShell, typical: [4.2, 7] },
  { name: 'warehouse', make: makeWarehouseShell, typical: [6, 8] },
  { name: 'container', make: makeContainerShell, typical: [6.4, 2.4] },
];

/** Small (0.5 m floor) and large (runtime max 60 m) plus a mid footprint. */
const SMALL: [number, number] = [0.5, 0.5];
const MID: [number, number] = [12, 10];
const LARGE: [number, number] = [60, 30];

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

/** Build, measure, dispose. Bounds in meters (voxel units × 0.1). */
function measure(
  make: (spec: ShellSpec) => THREE.Object3D,
  widthM: number,
  depthM: number,
  heightM?: number,
): { box: THREE.Box3; size: THREE.Vector3 } {
  const obj = make(heightM === undefined ? { widthM, depthM } : { widthM, depthM, heightM });
  const box = new THREE.Box3().setFromObject(obj);
  const scaled = new THREE.Box3(
    box.min.clone().multiplyScalar(VOXEL_M),
    box.max.clone().multiplyScalar(VOXEL_M),
  );
  const scaledSize = scaled.getSize(new THREE.Vector3());
  disposeTree(obj);
  return { box: scaled, size: scaledSize };
}

/** Stable geometry fingerprint: mesh order, vertex counts, position hash. */
function fingerprint(obj: THREE.Object3D): string {
  const parts: string[] = [];
  let meshIndex = 0;
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    let hash = 0;
    for (let i = 0; i < pos.array.length; i++) hash = (hash * 31 + Math.round(pos.array[i] * 8)) | 0;
    parts.push(`${meshIndex}:${pos.count}:${hash}`);
    meshIndex++;
  });
  return parts.join('|');
}

describe('parametric environment shells', () => {
  it('lands shells at their absolute design heights (no systematic inflation)', () => {
    // Measured as Box3 size (includes the ~0.03 m below-grade skirt dip).
    // A vertical-span regression (rows laid across [-H, +H]) doubles these.
    const tent = measure(makeTentShell, 2.8, 2.8);
    expect(tent.size.y, `tent height ${tent.size.y.toFixed(3)} m (~2.0 m canvas)`).toBeGreaterThanOrEqual(1.8);
    expect(tent.size.y, 'tent height').toBeLessThanOrEqual(2.2);

    const indoor = measure(makeIndoorShell, 4, 4);
    expect(indoor.size.y, `indoor height ${indoor.size.y.toFixed(3)} m (~2.6 m walls)`).toBeGreaterThanOrEqual(2.3);
    expect(indoor.size.y, 'indoor height').toBeLessThanOrEqual(2.9);

    const hoop = measure(makeHoophouseShell, 4.2, 7);
    expect(hoop.size.y, `hoophouse height ${hoop.size.y.toFixed(3)} m (~3.2 m arch peak)`).toBeGreaterThanOrEqual(2.9);
    expect(hoop.size.y, 'hoophouse height').toBeLessThanOrEqual(3.5);
    // the film skirt must never rise ~2x past the arch
    expect(hoop.size.y, 'hoophouse must not reach ~2x its arch peak').toBeLessThan(4.5);

    // small footprints shrink with the canvas: a 0.5 m tent is ~0.5 m tall
    const tentSmall = measure(makeTentShell, 0.5, 0.5);
    expect(tentSmall.size.y, `0.5 m tent height ${tentSmall.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(0.35);
    expect(tentSmall.size.y, '0.5 m tent height').toBeLessThanOrEqual(0.65);
  });

  it('follows an explicit saved usable height (1 voxel = 10 cm)', () => {
    // Wall height tracks heightM within the tolerance of the lid/rim trim
    // that caps the shell — sampled from real Box3 geometry, not formulas.
    const tent = measure(makeTentShell, 2.8, 2.8, 3);
    expect(tent.size.y, `tent heightM 3: ${tent.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(2.75);
    expect(tent.size.y, 'tent heightM 3').toBeLessThanOrEqual(3.25);

    const warehouse = measure(makeWarehouseShell, 6, 8, 6);
    expect(warehouse.size.y, `warehouse heightM 6: ${warehouse.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(5.75);
    expect(warehouse.size.y, 'warehouse heightM 6').toBeLessThanOrEqual(6.25);

    const indoor = measure(makeIndoorShell, 4, 4, 4);
    expect(indoor.size.y, `indoor heightM 4: ${indoor.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(3.75);
    expect(indoor.size.y, 'indoor heightM 4').toBeLessThanOrEqual(4.25);

    // Proportional makers: hoophouse peak tracks heightM (legs ~30%),
    // greenhouse ridge tracks heightM (eave ~55%).
    const hoop = measure(makeHoophouseShell, 4.2, 7, 4);
    expect(hoop.size.y, `hoophouse heightM 4: ${hoop.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(3.75);
    expect(hoop.size.y, 'hoophouse heightM 4').toBeLessThanOrEqual(4.35);

    const greenhouse = measure(makeGreenhouseShell, 4.2, 6.4, 4);
    expect(greenhouse.size.y, `greenhouse heightM 4: ${greenhouse.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(3.7);
    expect(greenhouse.size.y, 'greenhouse heightM 4').toBeLessThanOrEqual(4.45);

    const container = measure(makeContainerShell, 2.6, 6.4, 3);
    expect(container.size.y, `container heightM 3: ${container.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(2.75);
    expect(container.size.y, 'container heightM 3').toBeLessThanOrEqual(3.25);

    const coldFrame = measure(makeColdFrameShell, 2, 1.5, 0.8);
    expect(coldFrame.size.y, `cold frame heightM 0.8: ${coldFrame.size.y.toFixed(3)} m`).toBeGreaterThanOrEqual(0.55);
    expect(coldFrame.size.y, 'cold frame heightM 0.8').toBeLessThanOrEqual(1.05);

    // Explicit heights still respect the requested footprint.
    for (const [make, w, d, h] of [
      [makeTentShell, 2.8, 2.8, 3],
      [makeWarehouseShell, 6, 8, 6],
      [makeHoophouseShell, 4.2, 7, 4],
    ] as Array<[MakerEntry['make'], number, number, number]>) {
      const { size } = measure(make, w, d, h);
      expect(Math.abs(size.x - w), 'explicit-height width').toBeLessThanOrEqual(0.1);
      expect(Math.abs(size.z - d), 'explicit-height depth').toBeLessThanOrEqual(0.1);
    }
  });

  it('clamps an absurdly small saved height to a safe minimum and stays bounded', () => {
    for (const { name, make, typical } of MAKERS) {
      const { size } = measure(make, typical[0], typical[1], 0.01);
      expect(size.y, `${name} clamped height`).toBeGreaterThan(0);
      // Vertex budget is unchanged by the height clamp on a normal footprint.
      const obj = make({ widthM: typical[0], depthM: typical[1], heightM: 0.01 });
      let vertices = 0;
      obj.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) vertices += mesh.geometry.getAttribute('position').count;
      });
      expect(vertices, `${name} vertex budget with clamped height: ${vertices}`).toBeLessThan(1_200_000);
      disposeTree(obj);
    }
  });

  it('renders every maker at its requested footprint within one voxel', () => {
    for (const { name, make, typical } of MAKERS) {
      for (const [widthM, depthM] of [SMALL, typical, MID, LARGE] as Array<[number, number]>) {
        const { size } = measure(make, widthM, depthM);
        expect(
          Math.abs(size.x - widthM),
          `${name} ${widthM}×${depthM} width: ${size.x.toFixed(3)} m`,
        ).toBeLessThanOrEqual(0.1);
        expect(
          Math.abs(size.z - depthM),
          `${name} ${widthM}×${depthM} depth: ${size.z.toFixed(3)} m`,
        ).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('keeps construction heights nonzero and proportional to the footprint', () => {
    for (const { name, make, typical } of MAKERS) {
      const small = measure(make, ...SMALL);
      const mid = measure(make, ...typical);
      const large = measure(make, ...LARGE);

      expect(small.size.y, `${name} small height`).toBeGreaterThan(0);
      expect(mid.size.y, `${name} typical height`).toBeGreaterThan(0);
      // Small footprints shrink construction heights (a 0.5 m tent is not 2 m
      // tall) and huge footprints never balloon past the typical silhouette.
      expect(small.size.y, `${name} small height ${small.size.y.toFixed(2)} vs typical ${mid.size.y.toFixed(2)}`)
        .toBeLessThanOrEqual(mid.size.y);
      expect(
        large.size.y,
        `${name} large height ${large.size.y.toFixed(2)} vs typical ${mid.size.y.toFixed(2)}`,
      ).toBeLessThanOrEqual(mid.size.y + 0.6);
    }
  });

  it('builds identical geometry for identical specs (determinism)', () => {
    for (const { name, make, typical } of MAKERS) {
      const a = make({ widthM: typical[0], depthM: typical[1] });
      const b = make({ widthM: typical[0], depthM: typical[1] });
      const boxA = new THREE.Box3().setFromObject(a);
      const boxB = new THREE.Box3().setFromObject(b);
      expect(boxA.min.toArray(), `${name} bounds min`).toEqual(boxB.min.toArray());
      expect(boxA.max.toArray(), `${name} bounds max`).toEqual(boxB.max.toArray());
      const fpA = fingerprint(a);
      const fpB = fingerprint(b);
      expect(fpA, `${name} geometry fingerprint`).toBe(fpB);
      disposeTree(a);
      disposeTree(b);
    }
  });

  it('keeps merged geometry bounded on the largest supported footprint', () => {
    for (const { name, make } of MAKERS) {
      const obj = make({ widthM: LARGE[0], depthM: LARGE[1] });
      let vertices = 0;
      obj.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) vertices += mesh.geometry.getAttribute('position').count;
      });
      // ~25k voxels × 24 verts is the documented budget ceiling; allow the
      // pane/rim overdraw but nothing approaching O(n²) growth.
      expect(vertices, `${name} vertex budget at 60×30 m: ${vertices}`).toBeLessThan(1_200_000);
      disposeTree(obj);
    }
  });
});
