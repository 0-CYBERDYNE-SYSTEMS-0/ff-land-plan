/**
 * Lane C environment equipment — five placeable plan assets bridging the
 * environments kit into the structures registry. Sizes from research Part B:
 * fish-tank / hydro-raft (#19/#20, A12), dehumidifier (#8), seedling-tray
 * (#23/#24 with dome), co2-tank (#33). Makers reuse the environment interior
 * builders where the geometry is shared; every call returns a fresh object,
 * grounded at y = 0, 1 voxel = 10 cm, deterministic seeds.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng } from '@/creative/voxel';
import { paneMesh, solidMesh } from './shared';
import { makeCo2Tank, makeDehumidifier, makeDwcRaft, makeFishTank } from '../environments/interior';

/** Round fish tank, 1.2 m dia × ~1 m — royal blue with central drain. */
export function makeFishTankAsset(): THREE.Object3D {
  return makeFishTank({ diaM: 1.2 });
}

/** DWC hydro raft — 2.4 × 1.2 m raft pond with lettuce holes + bubbles. */
export function makeHydroRaftAsset(): THREE.Object3D {
  return makeDwcRaft({ wM: 2.4, dM: 1.2 });
}

/** Dehumidifier — 0.35 × 0.35 × 0.6 m floor unit with drip bucket. */
export function makeDehumidifierAsset(): THREE.Object3D {
  return makeDehumidifier();
}

/** CO2 tank — 20 lb cylinder (0.3 m dia × 0.9 m) + brass regulator. */
export function makeCo2TankAsset(): THREE.Object3D {
  return makeCo2Tank();
}

/**
 * Seedling tray + dome — the industry-standard 1020 flat (0.26 × 0.53 m,
 * Penn State dims) on a heat mat, with a clear humidity dome and a short
 * stack of spare flats beside it (A13(e)).
 */
export function makeSeedlingTrayAsset(): THREE.Object3D {
  const rand = rng(7201);
  const solid: Voxel[] = [];
  const dome: Voxel[] = [];

  // heat mat: dark waterproof pad slightly larger than the tray, cord trailing
  for (let x = -3.2; x <= 3.2; x += 1.05)
    for (let z = -2; z <= 2; z += 1.05)
      solid.push({ x, y: 0.3, z, s: 1.05, color: rand() < 0.15 ? mixColor(PALETTE.charcoal, PALETTE.black, 0.4) : PALETTE.charcoal });
  for (let i = 0; i < 5; i++)
    solid.push({ x: 3.6 + i * 0.7, y: 0.3, z: 1.6 - i * 0.5, s: 0.32, color: PALETTE.black });

  // 1020 tray: black rim + cell grid + vivid-green seedling carpet
  for (let x = -2.6; x <= 2.6; x += 1.05)
    for (let z = -1.5; z <= 1.5; z += 1.05) {
      const rim = Math.abs(x) > 2.1 || Math.abs(z) > 1.05;
      solid.push({ x, y: 0.95, z, s: 1.0, color: rim ? mixColor(PALETTE.black, PALETTE.charcoal, 0.45) : PALETTE.soilDark });
      if (!rim)
        solid.push({
          x, y: 1.45, z, s: 0.72,
          color: rand() < 0.6 ? PALETTE.leafYoung : PALETTE.sprout,
        });
    }
  // cell seams reading through the carpet
  for (let x = -2.1; x <= 2.1; x += 1.05)
    solid.push({ x, y: 1.2, z: 0, s: 0.4, color: mixColor(PALETTE.black, PALETTE.charcoal, 0.5) });

  // clear humidity dome fogged with condensation: stepped arch + handle vent
  const domeRow = (w: number, h: number, zz: number): void => {
    for (let x = -w; x <= w; x += 1.05)
      dome.push({ x, y: h, z: zz, s: 1.0, color: rand() < 0.22 ? PALETTE.glassDim : PALETTE.glass });
  };
  for (let z = -1.5; z <= 1.5; z += 0.75) {
    domeRow(2.4, 1.9, z);
    domeRow(1.6, 2.7, z);
    if (Math.abs(z) < 0.4) domeRow(0.6, 3.3, z);
  }
  solid.push({ x: 0, y: 3.8, z: 0, s: 0.6, color: PALETTE.glassDim }); // vent knob

  // stack of two spare flats beside (inverted, dark)
  for (const sx of [5.6, 7.4])
    for (let x = sx - 1.4; x <= sx + 1.4; x += 1.1)
      for (let z = -0.9; z <= 0.9; z += 1.1)
        solid.push({
          x, y: sx === 5.6 ? 0.55 : 1.35, z, s: 1.1,
          color: rand() < 0.2 ? mixColor(PALETTE.black, PALETTE.metalDark, 0.3) : mixColor(PALETTE.black, PALETTE.charcoal, 0.4),
        });

  return group([solidMesh(solid), paneMesh(dome, 0.42, PALETTE.glass)]);
}
