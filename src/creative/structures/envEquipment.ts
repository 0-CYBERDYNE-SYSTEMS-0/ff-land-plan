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
import { C, paneMesh, solidMesh } from './shared';
import { makeCo2Tank, makeDehumidifier, makeDwcRaft } from '../environments/interior';

/**
 * Round fish tank, 1.2 m dia × ~1 m — faceted glass ring on a four-leg stand.
 * Rim ring breaks the box silhouette; translucent water ring + surface disc,
 * centre drain, koi silhouettes, aeration bubbles, inlet drop and outlet pump.
 */
export function makeFishTankAsset(): THREE.Object3D {
  const R = 6;
  const SEG = 32;
  const solid: Voxel[] = [];
  const glass: Voxel[] = [];
  const water: Voxel[] = [];
  // faceted circle of cubes at radius r (adjacent cubes overlap → no gaps)
  const ring = (out: Voxel[], r: number, y: number, s: number, color: number): void => {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, s, color });
    }
  };

  // four-leg stand + plate under the tank floor
  for (const lx of [-3, 3]) for (const lz of [-3, 3]) for (let y = 0; y <= 2; y++)
    solid.push({ x: lx, y, z: lz, color: C.postWood });
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++)
    if (x * x + z * z <= R * R) solid.push({ x, y: 3, z, color: C.plankWeathered });

  // centre drain standpipe + outlet pipe under the plate to a pump box
  for (let y = 4; y <= 9; y++) solid.push({ x: 0, y, z: 0, s: 0.8, color: PALETTE.metalDark });
  for (let x = 0; x <= R + 2; x++) solid.push({ x, y: 2, z: 0, s: 0.7, color: C.pipeBlack });
  solid.push({ x: R + 3, y: 2, z: 0, s: 1.6, color: PALETTE.charcoal });

  // inlet: feed pipe through the back-left wall, dropping down the wall to the stand
  for (let x = -R - 3; x <= -R; x++) solid.push({ x, y: 9, z: 2, s: 0.7, color: C.pipeBlack });
  for (let y = 2; y <= 8; y++) solid.push({ x: -R - 3, y, z: 2, s: 0.7, color: C.pipeBlack });

  // glass walls, translucent water inside them, rim ring on top
  for (let y = 4; y <= 12; y++) ring(glass, R, y, 1.2, PALETTE.glass);
  for (let y = 4; y <= 10; y++) ring(water, R - 1, y, 1.0, PALETTE.water);
  ring(solid, R + 0.2, 13, 1.2, PALETTE.ironDark);

  // water surface plane, just inside the rim
  for (let x = -R + 1; x <= R - 1; x++) for (let z = -R + 1; z <= R - 1; z++)
    if (x * x + z * z <= (R - 1) * (R - 1)) solid.push({ x, y: 11, z, color: PALETTE.waterLight });

  // aeration ring: air-stone bubbles rising in three staggered layers
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + layer * 0.3;
      solid.push({ x: Math.cos(a) * 3.4, y: 4.6 + layer * 1.6, z: Math.sin(a) * 3.4, s: 0.4, color: PALETTE.white });
    }

  // two koi silhouettes swimming in the upper water
  const koi = PALETTE.flowerOrange;
  const koiTail = mixColor(PALETTE.flowerOrange, PALETTE.black, 0.2);
  for (const x of [1, 2, 3]) solid.push({ x, y: 9, z: -2, s: 0.85, color: koi });
  solid.push({ x: 0, y: 9, z: -2, s: 0.7, color: koiTail });
  for (const z of [2, 3, 4]) solid.push({ x: -2.5, y: 9.4, z, s: 0.85, color: koi });
  solid.push({ x: -2.5, y: 9.4, z: 1, s: 0.7, color: koiTail });

  return group([solidMesh(solid), paneMesh(glass, 0.3, PALETTE.glass), paneMesh(water, 0.45, PALETTE.water)]);
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
