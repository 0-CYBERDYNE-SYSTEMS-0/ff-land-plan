/**
 * Lane C hero — the classic red barn. 60×40 voxels (6×4 m at 10 cm/voxel).
 * Real construction logic: stone foundation course, proud corner posts,
 * rng-dithered plank runs, stepped gable roof with overhang + ridge cap,
 * X-brace double doors, hay loft door with hoist beam, louvered cupola.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import {
  C, plankTone, ridgeCapX, solidMesh,
  steppedGableRoof, steppedProfile, stoneFoundation, strapHinge, weighted,
} from './shared';

const W = 60; // x: 0..59 — long axis, ridge runs along X
const D = 40; // z: 0..39 — gable walls at x=0 and x=59
const EAVE = 25; // first roof slab height (wall tops at y=24)
const RISE = 1;

function buildBarn(): THREE.Object3D {
  const rand = rng(3101);
  const solid: Voxel[] = [];

  // --- stone foundation -----------------------------------------------------
  stoneFoundation(solid, rand, 0, W - 1, 0, D - 1, 1, 0);
  // threshold step in front of the big doors
  for (let z = 13; z <= 26; z++)
    solid.push({ x: 60, y: 0.4, z, s: 1.06, color: rand() < 0.5 ? PALETTE.stoneLight : PALETTE.stone });

  // --- long walls (z=0 north, z=39 south), horizontal plank runs -------------
  const longCells: number[] = [];
  for (let x = 1; x < W - 1; x++) longCells.push(x);
  for (const zw of [0, D - 1]) {
    const bands = Math.ceil(23 / 2);
    const tones: number[] = [];
    for (let b = 0; b < bands; b++) tones.push(plankTone(rand));
    for (const x of longCells)
      for (let y = 2; y <= 24; y++) {
        let c = tones[Math.floor((y - 2) / 2)];
        const r = rand();
        if (r < 0.07) c = mixColor(c, PALETTE.black, 0.22);
        else if (r > 0.95) c = mixColor(c, PALETTE.cream, 0.14);
        solid.push({ x, y, z: zw, color: c });
      }
  }

  // windows on the sunny south wall: cream frame, glass, mullions, sill, lintel
  const windowAt = (wx: number): void => {
    for (let x = wx; x <= wx + 3; x++)
      for (let y = 10; y <= 14; y++) {
        const border = y === 10 || y === 14 || x === wx || x === wx + 3;
        solid.push({
          x, y, z: D - 1, s: 0.98,
          color: border ? C.trimShadow : C.glassPane,
        });
      }
    // white casing around the opening, on the wall plane
    for (let x = wx - 1; x <= wx + 4; x++)
      for (const wy of [9, 15]) solid.push({ x, y: wy, z: D - 1, s: 1.04, color: C.trimWhite });
    for (const wy of [10, 11, 12, 13, 14])
      for (const wxo of [wx - 1, wx + 4]) solid.push({ x: wxo, y: wy, z: D - 1, s: 1.04, color: C.trimWhite });
    // cross mullions proud of the glass
    solid.push({ x: wx + 1.5, y: 12, z: D - 0.8, s: 1, color: C.trimWhite });
    for (let x = wx; x <= wx + 3; x++) solid.push({ x, y: 12, z: D - 0.8, s: 0.42, color: C.trimWhite });
    // sill + lintel
    for (let x = wx - 1; x <= wx + 4; x++)
      solid.push({ x, y: 8.55, z: D - 0.85, s: 0.7, color: C.trimWhite });
    for (let x = wx - 1; x <= wx + 4; x++)
      solid.push({ x, y: 16, z: D - 1, color: C.postWood });
  };
  windowAt(11);
  windowAt(44);

  // small vent window on the shaded north wall
  for (let x = 27; x <= 32; x++)
    for (let y = 12; y <= 17; y++) {
      const border = y === 12 || y === 17 || x === 27 || x === 32;
      solid.push({ x, y, z: 0, s: 0.98, color: border ? C.trimShadow : C.glassPane });
    }

  // --- gable walls (x=0 back, x=59 front) -----------------------------------
  const { idx } = steppedProfile(D + 6, 2, 3, 3); // columns z=-3..42
  const gableTop = (z: number): number => EAVE + idx[z + 3] * RISE - 1;
  for (const gx of [0, W - 1]) {
    for (let z = 0; z < D; z++) {
      const top = gableTop(z);
      let colTone = plankTone(rand, C.barnRedMid, C.barnRedDark, C.barnRed);
      if ((z >> 1) % 2 === 0) colTone = mixColor(colTone, PALETTE.black, 0.08);
      for (let y = 2; y <= top; y++) {
        const c = rand() < 0.1 ? mixColor(colTone, PALETTE.black, 0.18) : colTone;
        solid.push({ x: gx, y, z, color: c });
      }
      // white vergeboard following the rake
      solid.push({ x: gx, y: top, z, s: 1.04, color: C.trimWhite });
    }
  }

  // --- proud corner posts ----------------------------------------------------
  const post = (x: number, z: number): void => {
    for (let y = 2; y <= 25; y++) {
      const c = y % 3 === 0 ? mixColor(C.postWood, PALETTE.black, 0.12) : rand() < 0.25 ? C.postWood : C.postWoodLight;
      solid.push({ x, y, z, s: 1.35, color: c });
    }
    solid.push({ x, y: 25.58, z, s: 1.22, color: PALETTE.plankLight });
  };
  post(0, 0);
  post(0, D - 1);
  post(W - 1, 0);
  post(W - 1, D - 1);

  // --- stepped gable roof ----------------------------------------------------
  steppedGableRoof(solid, rand, {
    x0: -1, x1: W,
    zProfileFrom: -3,
    profile: idx,
    baseY: EAVE,
    rise: RISE,
    edgeTone: C.trimWhite, // barge boards down both rakes
    fasciaTone: C.trimWhite,
  });
  // north eave fascia (the helper covers the south one)
  for (let x = -1; x <= W; x++) solid.push({ x, y: EAVE - 1, z: D + 3, color: C.trimWhite });
  const peakY = EAVE + idx[22] * RISE; // slab height at the plateau
  ridgeCapX(solid, -1, W, 19, 20, peakY + 1);

  // moss specks on the shady north slope
  for (let i = 0; i < 7; i++) {
    const mx = Math.floor(rand() * W);
    const mz = Math.floor(rand() * 14);
    solid.push({
      x: mx, y: EAVE + idx[mz] * RISE + 0.51, z: mz, s: 0.55,
      color: rand() < 0.6 ? PALETTE.leafDark : PALETTE.grassDark,
    });
  }

  // --- big X-brace double doors on the front gable (x=59 → face +X) ----------
  for (let z = 13; z <= 26; z++)
    for (let y = 2; y <= 21; y++) solid.push({ x: W - 1, y, z, color: C.trimShadow }); // dark reveal
  const doorLeaf = (zLo: number, zHi: number, hingeHi: boolean): void => {
    for (let z = zLo; z <= zHi; z++)
      for (let y = 2; y <= 21; y++) {
        const border = z === zLo || z === zHi || y === 2 || y === 21;
        let c: number;
        if (border) c = C.trimWhite;
        else {
          c = plankTone(rand, C.barnRedMid, C.barnRedDark, C.barnRed);
          if ((y + z) % 7 === 0) c = mixColor(c, PALETTE.black, 0.12);
        }
        solid.push({ x: 60, y, z, s: 0.94, color: c });
      }
    // X-brace in cream across the field
    const span = zHi - zLo;
    for (let t = 0; t <= 19; t++) {
      const y = 2 + t;
      const off = Math.round((t / 19) * span);
      for (const zz of [zLo + off, zHi - off]) {
        if (zz > zLo && zz < zHi && y > 2 && y < 21)
          solid.push({ x: 60.38, y, z: zz, s: 0.78, color: C.trimWhite });
      }
    }
    const hz = hingeHi ? zHi : zLo;
    strapHinge(solid, 60, 5, hz, 'z', 2);
    strapHinge(solid, 60, 17, hz, 'z', 2);
  };
  doorLeaf(13, 19, false);
  doorLeaf(20, 26, true);
  // center latch
  solid.push({ x: 60.42, y: 11, z: 20, s: 0.86, color: PALETTE.ironDark });
  solid.push({ x: 60.42, y: 12.45, z: 20, s: 0.42, color: PALETTE.metal });
  // cream surround
  for (let y = 1; y <= 23; y++)
    for (const z of [12, 27]) solid.push({ x: W - 1, y, z, s: 1.05, color: C.trimWhite });
  for (let z = 12; z <= 27; z++)
    for (const yy of [1, 23]) solid.push({ x: W - 1, y: yy, z, s: 1.05, color: C.trimWhite });

  // --- hay loft door + hoist beam up in the front gable ----------------------
  for (let z = 16; z <= 24; z++)
    for (let y = 27; y <= 33; y++) solid.push({ x: W - 1, y, z, color: C.trimShadow }); // opening
  for (let z = 17; z <= 23; z++)
    for (let y = 28; y <= 32; y++) {
      const border = z === 17 || z === 23 || y === 28 || y === 32;
      solid.push({
        x: 60, y, z, s: 0.94,
        color: border ? C.trimWhite : plankTone(rand, C.barnRedMid, C.barnRedDark, C.barnRed),
      });
    }
  for (let t = 0; t <= 4; t++)
    solid.push({ x: 60.38, y: 29 + t, z: 18 + t, s: 0.78, color: C.trimWhite }); // Z-brace
  strapHinge(solid, 60, 29, 17, 'z', 2);
  for (let y = 26; y <= 34; y++)
    for (const z of [15, 25]) solid.push({ x: W - 1, y, z, s: 1.05, color: C.trimWhite });
  for (let z = 15; z <= 25; z++)
    for (const yy of [26, 34]) solid.push({ x: W - 1, y: yy, z, s: 1.05, color: C.trimWhite });
  // hoist beam, knee brace, pulley and rope
  for (let bx = 61; bx <= 64; bx++) solid.push({ x: bx, y: 34.5, z: 19.5, s: 0.9, color: C.plankWeathered });
  solid.push({ x: 61, y: 33.2, z: 20, s: 0.85, color: C.postWood });
  solid.push({ x: 63, y: 33.6, z: 19.5, s: 0.6, color: PALETTE.metalDark });
  for (let ry = 29; ry <= 33; ry++) solid.push({ x: 63, y: ry, z: 19.5, s: 0.34, color: PALETTE.charcoal });

  // matching loft vent on the rear gable
  for (let z = 18; z <= 21; z++)
    for (let y = 30; y <= 34; y++) {
      const edge = z === 18 || z === 21 || y === 30 || y === 34;
      solid.push({ x: 0, y, z, s: 0.99, color: edge ? C.trimWhite : C.trimShadow });
    }

  // --- louvered cupola on the ridge ------------------------------------------
  for (let cx = 27; cx <= 32; cx++)
    for (let cz = 17; cz <= 22; cz++)
      for (let cy = peakY + 2; cy <= peakY + 4; cy++) {
        const shell = cx === 27 || cx === 32 || cz === 17 || cz === 22;
        if (!shell) continue;
        let c = C.trimWhite;
        if ((cz === 17 || cz === 22) && cy === peakY + 3) c = C.trimShadow; // louver slots
        solid.push({ x: cx, y: cy, z: cz, s: 0.98, color: c });
      }
  for (let cx = 26; cx <= 33; cx++)
    for (let cz = 16; cz <= 23; cz++) solid.push({ x: cx, y: peakY + 5, z: cz, color: C.shingleDark });
  for (let cx = 28; cx <= 31; cx++)
    for (let cz = 18; cz <= 21; cz++) solid.push({ x: cx, y: peakY + 6, z: cz, color: C.shingleDark });
  solid.push({ x: 29.5, y: peakY + 6.9, z: 19.5, s: 0.9, color: C.postWoodLight });
  solid.push({ x: 29.5, y: peakY + 7.7, z: 19.5, s: 0.45, color: PALETTE.copper });

  // --- grounding details ------------------------------------------------------
  // gravel splash under the north eave drip line
  for (let i = 0; i < 14; i++)
    solid.push({
      x: Math.floor(rand() * W), y: 0.15, z: -1 - Math.floor(rand() * 2), s: 0.5,
      color: weighted([[PALETTE.gravel, 0.5], [PALETTE.gravelDark, 0.5]], rand()),
    });
  // grass tufts by the foundation corners
  for (const [tx, tz] of [[-1.5, 4], [-1.5, 36], [W + 0.5, 6], [W + 0.5, 34]] as Array<[number, number]>)
    for (let b = 0; b < 3; b++)
      solid.push({
        x: tx + (rand() - 0.5), y: 1.6 + b * 0.45, z: tz + (rand() - 0.5), s: 0.34,
        color: rand() < 0.5 ? PALETTE.grass : PALETTE.grassDark,
      });

  return solidMesh(solid);
}

export function makeBarn(): THREE.Object3D {
  return buildBarn();
}
