/**
 * Lane C buildings — shed, greenhouse, polytunnel, cold frame, chicken coop.
 * All grounded at y=0, deterministic seeds, 1 voxel = 10 cm.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng } from '@/creative/voxel';
import {
  C, plankTone, solidMesh, paneMesh, steppedGableRoof,
  steppedProfile, weighted,
} from './shared';

// ---------------------------------------------------------------------------
// Garden shed — 25×20 voxels (2.5×2 m)
// ---------------------------------------------------------------------------

export function makeShed(): THREE.Object3D {
  const rand = rng(3201);
  const solid: Voxel[] = [];
  const W = 25;
  const D = 20;

  // stone piers under the corners and wall mids
  for (const [px, pz] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1], [12, 0], [12, D - 1]] as Array<[number, number]>)
    solid.push({ x: px, y: 0, z: pz, s: 1.3, color: rand() < 0.5 ? PALETTE.stone : PALETTE.stoneDark });
  // timber sill frame
  for (let x = 0; x <= W - 1; x++) for (const z of [0, D - 1]) solid.push({ x, y: 1, z, color: C.postWood });
  for (let z = 1; z < D - 1; z++) for (const x of [0, W - 1]) solid.push({ x, y: 1, z, color: C.postWood });

  // plank walls, horizontal runs
  const wallCells: Array<[number, number]> = [];
  for (let x = 1; x < W - 1; x++) { wallCells.push([x, 0]); wallCells.push([x, D - 1]); }
  for (let z = 1; z < D - 1; z++) { wallCells.push([0, z]); wallCells.push([W - 1, z]); }
  const bands = Math.ceil(18 / 2);
  const tones: number[] = [];
  for (let b = 0; b < bands; b++) tones.push(plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank));
  for (const [x, z] of wallCells)
    for (let y = 2; y <= 19; y++) {
      let c = tones[Math.floor((y - 2) / 2)];
      if (rand() < 0.08) c = mixColor(c, PALETTE.black, 0.2);
      solid.push({ x, y, z, color: c });
    }

  // proud corner posts
  const post = (x: number, z: number): void => {
    for (let y = 1; y <= 20; y++)
      solid.push({ x, y, z, s: 1.32, color: y % 3 === 0 ? C.postWood : C.postWoodLight });
    solid.push({ x, y: 20.58, z, s: 1.2, color: PALETTE.plankLight });
  };
  post(0, 0); post(W - 1, 0); post(0, D - 1); post(W - 1, D - 1);

  // --- door on the front gable (+X) ---
  for (let z = 7; z <= 12; z++)
    for (let y = 2; y <= 13; y++) solid.push({ x: W - 1, y, z, color: C.trimShadow });
  for (let z = 7; z <= 12; z++)
    for (let y = 2; y <= 13; y++) {
      const border = z === 7 || z === 12 || y === 2 || y === 13;
      solid.push({
        x: W, y, z, s: 0.94,
        color: border ? C.trimWhite : plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank),
      });
    }
  // Z-brace
  for (let t = 0; t <= 11; t++) {
    const y = 3 + t;
    solid.push({ x: W + 0.36, y, z: 8 + Math.round((t / 10) * 3), s: 0.78, color: C.postWood });
    solid.push({ x: W + 0.36, y, z: 11 - Math.round((t / 10) * 3), s: 0.78, color: C.postWood });
  }
  // iron hinges + ring pull
  for (const hy of [4, 11])
    for (let i = 0; i < 2; i++) solid.push({ x: W + 0.1, y: hy, z: 7 + i, s: 1.04, color: PALETTE.ironDark });
  solid.push({ x: W + 0.42, y: 7.5, z: 11, s: 0.55, color: PALETTE.metal });
  solid.push({ x: W + 0.42, y: 6.7, z: 11, s: 0.4, color: PALETTE.metalDark });
  // cream door surround
  for (let y = 1; y <= 14; y++) for (const z of [6, 13]) solid.push({ x: W - 1, y, z, s: 1.05, color: C.trimWhite });
  for (let z = 6; z <= 13; z++) for (const yy of [1, 14]) solid.push({ x: W - 1, y: yy, z, s: 1.05, color: C.trimWhite });

  // window on the sunny south wall
  for (let x = 5; x <= 9; x++)
    for (let y = 9; y <= 13; y++)
      solid.push({
        x, y, z: D - 1, s: 0.98,
        color: y === 9 || y === 13 || x === 5 || x === 9 ? C.trimShadow : C.glassPane,
      });
  for (let x = 4; x <= 10; x++) {
    solid.push({ x, y: 8, z: D - 1, s: 1.05, color: C.trimWhite });
    solid.push({ x, y: 14, z: D - 1, s: 1.05, color: C.trimWhite });
    solid.push({ x, y: 11, z: D - 0.82, s: 0.42, color: C.trimWhite }); // center mullion
  }
  for (const yy of [10, 11, 12]) {
    solid.push({ x: 7, y: yy, z: D - 0.82, s: 0.42, color: C.trimWhite });
    solid.push({ x: 4, y: yy, z: D - 1, s: 1.05, color: C.trimWhite });
    solid.push({ x: 10, y: yy, z: D - 1, s: 1.05, color: C.trimWhite });
  }
  // small front-gable window
  for (let z = 15; z <= 17; z++)
    for (let y = 8; y <= 10; y++)
      solid.push({
        x: W - 1, y, z, s: 0.98,
        color: y === 8 || y === 10 || z === 15 || z === 17 ? C.trimShadow : C.glassPane,
      });

  // --- gable infills + stepped roof ------------------------------------------
  const { idx } = steppedProfile(D + 4, 2, 2, 2); // z=-2..21
  const gableTop = (z: number): number => 20 + idx[z + 2] - 1;
  for (const gx of [0, W - 1])
    for (let z = 0; z < D; z++) {
      const top = gableTop(z);
      const colTone = plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
      for (let y = 20; y <= top; y++)
        solid.push({ x: gx, y, z, color: rand() < 0.12 ? mixColor(colTone, PALETTE.black, 0.18) : colTone });
      solid.push({ x: gx, y: top, z, s: 1.04, color: C.trimWhite });
    }
  steppedGableRoof(solid, rand, {
    x0: -1, x1: W,
    zProfileFrom: -2,
    profile: idx,
    baseY: 20,
    rise: 1,
    riserTone: C.roofPlankDark,
    tone: (_step, r) => {
      void _step;
      return r < 0.14 ? C.roofPlankDark : r > 0.93 ? mixColor(C.roofPlank, C.postWoodLight, 0.2) : C.roofPlank;
    },
    edgeTone: C.trimWhite,
    fasciaTone: C.trimWhite,
  });
  for (let x = -1; x <= W; x++) solid.push({ x, y: 19, z: D + 2, color: C.trimWhite });
  const peakY = 20 + idx[11];
  for (let x = -1; x <= W; x++) {
    solid.push({ x, y: peakY + 1, z: 9, s: 1.12, color: C.roofPlankDark });
    solid.push({ x, y: peakY + 1, z: 10, s: 1.12, color: C.roofPlankDark });
  }

  // firewood stack against the west wall
  const logTones = [PALETTE.wood, PALETTE.woodDark, C.postWoodLight];
  for (let row = 0; row < 3; row++)
    for (let zz = 0; zz < 5; zz++) {
      const lz = 4 + zz;
      if (row === 2 && (zz === 1 || zz === 3)) continue; // uneven top
      solid.push({ x: -1.2, y: 0.6 + row, z: lz, s: 0.92, color: logTones[(zz + row) % 3] });
      solid.push({ x: -1.2, y: 0.6 + row, z: lz, s: 0.45, color: PALETTE.plankLight }); // sawn end
    }
  // grass tufts at the piers
  for (let i = 0; i < 8; i++)
    solid.push({
      x: rand() < 0.5 ? -0.8 : W + 0.8, y: 0.5 + rand(), z: rand() * D, s: 0.32,
      color: rand() < 0.5 ? PALETTE.grass : PALETTE.grassDark,
    });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Greenhouse — 25×40 voxels (2.5×4 m): arched hoophouse-style house on a
// brick knee wall. Galvanized hoop ribs + purlins carry translucent glazing
// that follows the arch; framed gables with glazed door + louvre. Ridge
// along Z; 40 voxels stays the largest horizontal dimension (footprint
// contract with the 2.5×4 m designer record).
// ---------------------------------------------------------------------------

export function makeGreenhouse(): THREE.Object3D {
  const rand = rng(3301);
  const solid: Voxel[] = []; // knee wall, ribs, purlins, frames, door, bench…
  const glass: Voxel[] = []; // translucent glazing following the arch
  const W = 25; // x: 0..24 — arch spans X
  const D = 40; // z: 0..39 — ridge along Z
  const A = 18; // arch rise above the spring line → crown ≈ 2.2 m
  const SPRING = 4; // first arch row, landing on the knee-wall cap

  /** Crown height per column: slightly gothic arch — two off-center ellipse
   * halves meeting at a subtle peak, near-vertical leaving the eaves. */
  const h: number[] = [];
  for (let x = 0; x < W; x++) {
    const dx = x - (W - 1) / 2;
    const adx = Math.abs(dx);
    if (adx >= 12) { h.push(SPRING); continue; }
    const t = (adx + 3) / 15; // half-width 12 + 3 gothic offset
    h.push(SPRING + Math.round(A * Math.sqrt(1 - t * t)));
  }
  const ribTone = (): number =>
    weighted(
      [
        [mixColor(PALETTE.metal, PALETTE.metalDark, 0.35), 0.5],
        [mixColor(PALETTE.metal, PALETTE.metalDark, 0.65), 0.5],
      ],
      rand(),
    );

  // --- brick knee wall ring: footing, two brick courses, stone cap -----------
  const brick = (): number =>
    weighted(
      [
        [PALETTE.terracotta, 0.56],
        [mixColor(PALETTE.terracotta, PALETTE.black, 0.32), 0.36],
        [mixColor(PALETTE.terracotta, PALETTE.cream, 0.22), 0.08],
      ],
      rand(),
    );
  const doorXs = new Set([10, 11, 12, 13, 14]);
  const kneeCell = (x: number, z: number): void => {
    for (let y = 0; y <= 3; y++)
      solid.push({
        x, y, z,
        s: y === 0 ? 1.14 : y === 3 ? 1.2 : 1.04,
        color: y === 0
          ? mixColor(PALETTE.terracotta, PALETTE.black, 0.4)
          : y === 3
            ? weighted([[PALETTE.stone, 0.6], [PALETTE.stoneLight, 0.4]], rand())
            : brick(),
      });
  };
  for (let x = 0; x < W; x++)
    for (const z of [0, D - 1]) {
      if (z === D - 1 && doorXs.has(x)) continue; // doorway cut to grade
      kneeCell(x, z);
    }
  for (let z = 1; z < D - 1; z++)
    for (const x of [0, W - 1]) kneeCell(x, z);
  // aluminum threshold across the doorway
  for (let x = 10; x <= 14; x++)
    solid.push({ x, y: 0.12, z: D - 1, s: 0.82, color: PALETTE.metalDark });

  // --- glazing shell: stepped pane bands tiling the arch, per column --------
  const inRidgeVent = (x: number, z: number): boolean =>
    x >= 10 && x <= 14 && ((z >= 7 && z <= 12) || (z >= 21 && z <= 26));
  for (let x = 0; x < W; x++) {
    const bottom = x === 0 || x === 24 ? SPRING : x < 12 ? h[x - 1] : x > 12 ? h[x + 1] : h[12];
    for (let z = 1; z < D - 1; z++)
      for (let y = bottom; y <= h[x]; y++) {
        if (y === h[x] && inRidgeVent(x, z)) continue; // propped-open slot
        glass.push({ x, y, z, s: 0.97, color: C.glassPane });
      }
  }

  // galvanized hoop ribs crowning the shell every 7 voxels
  for (const rz of [6, 13, 20, 27, 34])
    for (let x = 0; x < W; x++)
      solid.push({ x, y: h[x] + 0.05, z: rz, s: 1.07, color: ribTone() });
  // two longitudinal purlins + the ridge tube
  for (const px of [6, 18])
    for (let z = 1; z < D - 1; z++)
      solid.push({ x: px, y: h[px] + 0.07, z, s: 0.9, color: mixColor(PALETTE.metal, PALETTE.metalDark, 0.3) });
  for (let z = 0; z < D; z++)
    solid.push({ x: 12, y: h[12] + 0.32, z, s: 1.18, color: weighted([[PALETTE.metalDark, 0.6], [PALETTE.metal, 0.4]], rand()) });

  // ridge vent flaps hovering over the open slots, on jack props
  for (const bz of [7, 21])
    for (let z = bz; z <= bz + 5; z++)
      for (let x = 10; x <= 14; x++)
        glass.push({ x, y: h[x] + 0.72, z, s: 0.94, color: C.glassPane });
  for (const pz of [8, 11, 22, 25]) {
    solid.push({ x: 12, y: h[12] + 0.34, z: pz, s: 0.5, color: PALETTE.metal });
    solid.push({ x: 12, y: h[12] - 0.24, z: pz, s: 0.5, color: PALETTE.metalDark });
  }

  // --- framed end walls: perimeter arch, glazing bars, transom ---------------
  const barXs = new Set([4, 8, 16, 20]);
  for (const gz of [0, D - 1]) {
    const front = gz === D - 1;
    for (let x = 0; x < W; x++) {
      const top = h[x];
      solid.push({ x, y: top + 0.05, z: gz, s: 1.07, color: ribTone() }); // end arch
      for (let y = SPRING; y <= top; y++) {
        if (front && doorXs.has(x) && y <= 18) continue; // door assembled below
        if (front && (x === 9 || x === 15) && y <= 18) {
          solid.push({ x, y, z: gz, s: 1.12, color: C.frameWhite }); // door surround
          continue;
        }
        if (barXs.has(x)) {
          solid.push({ x, y, z: gz, s: 1.06, color: C.frameWhite }); // glazing bar
          continue;
        }
        if (!front && x >= 8 && x <= 16 && y >= 14 && y <= 16) {
          glass.push({ x, y, z: gz, s: 0.7, color: C.glassPane }); // behind louvre
          continue;
        }
        if (y === 13 && top >= 14) {
          solid.push({ x, y, z: gz, s: 1.02, color: C.frameWhite }); // transom
          continue;
        }
        glass.push({ x, y, z: gz, s: 0.97, color: C.glassPane });
      }
    }
  }

  // --- door on the front gable: dark reveal, solid panel, glazed upper -------
  for (let x = 10; x <= 14; x++)
    for (let y = 1; y <= 17; y++)
      solid.push({ x, y, z: D - 1, color: C.trimShadow }); // reveal
  for (let x = 10; x <= 14; x++) {
    for (let y = 1; y <= 8; y++)
      solid.push({
        x, y, z: D - 0.5, s: 0.9,
        color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, C.postWoodLight),
      }); // timber lower panel
    for (const ry of [9, 17])
      solid.push({ x, y: ry, z: D - 0.5, s: 0.9, color: C.frameWhite }); // rails
  }
  for (let x = 11; x <= 13; x++)
    for (let y = 10; y <= 16; y++)
      glass.push({ x, y, z: D - 0.5, s: 0.9, color: C.glassPane }); // glazed upper
  solid.push({ x: 14.55, y: 9.5, z: D - 0.25, s: 0.52, color: PALETTE.metal }); // handle

  // operable louvre vents across the back gable
  for (let x = 9; x <= 15; x++)
    for (const ly of [14, 15, 16])
      solid.push({
        x, y: ly, z: 0.62, s: 0.5,
        color: ly === 15 ? mixColor(C.frameWhite, PALETTE.gravelDark, 0.2) : C.frameWhite,
      });

  // --- interior: gravel path, potting bench, pots ------------------------------
  for (let z = 1; z <= D - 2; z++)
    for (let x = 11; x <= 13; x++)
      solid.push({ x, y: 0.35, z, s: 0.7, color: weighted([[PALETTE.gravel, 0.6], [PALETTE.gravelDark, 0.4]], rand()) });
  // potting bench along the west wall
  for (const bz of [5, 14, 23]) {
    for (const bx of [2, 7]) solid.push({ x: bx, y: 5, z: bz, s: 0.9, color: C.postWood });
    solid.push({ x: 2, y: 5, z: bz + 3, s: 0.9, color: C.postWood });
    solid.push({ x: 7, y: 5, z: bz + 3, s: 0.9, color: C.postWood });
  }
  for (let bz = 5; bz <= 26; bz++)
    for (let bx = 2; bx <= 7; bx++)
      solid.push({ x: bx, y: 6, z: bz, s: 0.95, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
  // terracotta pots with seedlings on the bench + floor
  const potAt = (px: number, py: number, pz: number, big: boolean): void => {
    const s = big ? 1.1 : 0.9;
    solid.push({ x: px, y: py + 0.3, z: pz, s, color: PALETTE.terracotta });
    solid.push({ x: px, y: py + 0.85, z: pz, s: s * 1.12, color: mixColor(PALETTE.terracotta, PALETTE.black, 0.18) });
    solid.push({ x: px, y: py + 1.35, z: pz, s: 0.5, color: PALETTE.stem });
    solid.push({ x: px - 0.3, y: py + 1.7, z: pz, s: 0.55, color: PALETTE.leafYoung });
    solid.push({ x: px + 0.3, y: py + 1.65, z: pz, s: 0.5, color: PALETTE.leaf });
  };
  potAt(3, 6, 8, false); potAt(5, 6, 13, false); potAt(4, 6, 19, false); potAt(6, 6, 24, false);
  potAt(19, 0, 9, true); potAt(20, 0, 21, true); potAt(18, 0, 31, true);
  // seed trays under the bench
  for (const tz of [11, 20])
    solid.push({ x: 4.5, y: 4.4, z: tz, s: 1.4, color: mixColor(PALETTE.terracotta, PALETTE.black, 0.35) });

  return group([solidMesh(solid), paneMesh(glass, 0.42, PALETTE.glass)]);
}

// ---------------------------------------------------------------------------
// Polytunnel — 30×60 voxels (3×6 m), hoop ribs under translucent film
// ---------------------------------------------------------------------------

export function makePolytunnel(): THREE.Object3D {
  const rand = rng(3401);
  const solid: Voxel[] = [];
  const film: Voxel[] = [];
  const W = 30; // x: 0..29
  const D = 60; // z: 0..59
  const H = 20;

  // half-ellipse hoop; the virtual half-width sits just past the last column
  // so the skirt lands low on the ground
  const archH = (x: number): number => {
    const dx = x - (W - 1) / 2;
    const v = 1 - (dx * dx) / (14.8 * 14.8);
    return Math.max(1, Math.round(H * Math.sqrt(Math.max(0, v))));
  };

  // film skin: one crowned strip per column, full length
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      film.push({ x, y: archH(x), z, s: 0.97, color: C.filmWhite });

  // tied-down end walls; zip-door opening on the near end
  for (const z of [0, D - 1])
    for (let x = 0; x < W; x++)
      for (let y = 1; y <= archH(x); y++) {
        const inDoor = z === D - 1 && x >= 11 && x <= 18 && y <= 13;
        if (!inDoor) film.push({ x, y, z, s: 0.97, color: C.filmWhite });
      }

  // slim hoop ribs reading through the film
  for (const rz of [3, 12, 21, 30, 39, 48, 56])
    for (let x = 0; x < W; x++)
      solid.push({ x, y: archH(x) + 0.03, z: rz, s: 1.04, color: rand() < 0.3 ? PALETTE.metal : mixColor(PALETTE.metal, PALETTE.metalDark, 0.35) });

  // wooden base rails pinning the skirt
  for (let z = 0; z < D; z++)
    for (const x of [0, W - 1])
      solid.push({ x, y: 0.45, z, s: 0.95, color: rand() < 0.2 ? C.postWood : mixColor(C.postWood, PALETTE.wood, 0.4) });

  // tie-down clumps + pegs every ten voxels
  for (let z = 5; z < D; z += 10)
    for (const x of [-0.6, W - 0.4]) {
      solid.push({ x, y: 0.3, z, s: 0.9, color: weighted([[PALETTE.soilDark, 0.6], [PALETTE.soil, 0.4]], rand()) });
      solid.push({ x, y: 1, z, s: 0.3, color: PALETTE.metalDark });
    }

  // rolled flap above the door + zip strips
  for (let x = 11; x <= 18; x++)
    solid.push({ x, y: 14, z: D - 1.4, s: 0.72, color: mixColor(C.filmWhite, PALETTE.gravelDark, 0.4) });
  for (const xz of [10, 19])
    for (let y = 1; y <= 13; y++)
      solid.push({ x: xz, y, z: D - 1, s: 0.55, color: PALETTE.charcoal });

  // vent flaps peeled at the top corners of the far end
  for (const vx of [5, 24])
    for (let t = 0; t < 3; t++)
      film.push({ x: vx + t, y: archH(vx + t) + 0.8, z: 0.8, s: 0.85, color: mixColor(C.filmWhite, PALETTE.white, 0.4) });

  // crop rows silhouetted inside
  for (let z = 3; z <= D - 4; z += 3)
    for (const bx of [7, 22]) {
      solid.push({ x: bx, y: 0.9, z, s: 0.85, color: rand() < 0.5 ? PALETTE.leaf : PALETTE.leafDark });
      if (rand() < 0.5) solid.push({ x: bx, y: 1.5, z, s: 0.5, color: PALETTE.leafYoung });
    }

  return group([solidMesh(solid), paneMesh(film, 0.32, PALETTE.polyFilm)]);
}

// ---------------------------------------------------------------------------
// Cold frame — 8×13 voxels, timber box + propped glazed lid
// ---------------------------------------------------------------------------

export function makeColdFrame(): THREE.Object3D {
  const rand = rng(3501);
  const solid: Voxel[] = [];
  const glass: Voxel[] = [];
  const W = 8; // x: 0..7
  const D = 13; // z: 0..12 (z=0 back)

  const sideH = (z: number): number => 5 - Math.round((z / (D - 1)) * 2); // 5 → 3

  // timber box: back high, front low
  for (let z = 0; z < D; z++) {
    const h = sideH(z);
    for (let y = 1; y <= h; y++)
      for (const x of [0, W - 1])
        solid.push({
          x, y, z,
          color: rand() < 0.12 ? mixColor(C.plankWeathered, PALETTE.black, 0.2) : C.plankWeathered,
        });
  }
  for (let x = 0; x <= W - 1; x++) {
    for (let y = 1; y <= 5; y++) solid.push({ x, y, z: 0, color: rand() < 0.12 ? mixColor(C.plankWeathered, PALETTE.black, 0.2) : C.plankWeathered });
    for (let y = 1; y <= 3; y++) solid.push({ x, y, z: D - 1, color: rand() < 0.12 ? mixColor(C.plankWeathered, PALETTE.black, 0.2) : C.plankWeathered });
  }
  // proud corner posts
  for (const [px, pz] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]] as Array<[number, number]>) {
    for (let y = 1; y <= sideH(pz === 0 ? 0 : D - 1); y++)
      solid.push({ x: px, y, z: pz, s: 1.26, color: C.postWood });
    solid.push({ x: px, y: (pz === 0 ? 5 : 3) + 0.58, z: pz, s: 1.15, color: PALETTE.plankLight });
  }

  // soil + hardening-off stock inside
  for (let x = 1; x < W - 1; x++)
    for (let z = 1; z < D - 1; z++)
      solid.push({ x, y: 3, z, color: weighted([[PALETTE.soilDark, 0.55], [PALETTE.soil, 0.45]], rand()) });
  for (let i = 0; i < 6; i++) {
    const sx = 1.5 + rand() * 5;
    const sz = 1.5 + rand() * 10;
    solid.push({ x: sx, y: 3.8, z: sz, s: 0.55, color: rand() < 0.5 ? PALETTE.leafYoung : PALETTE.leaf });
    solid.push({ x: sx, y: 4.25, z: sz, s: 0.3, color: PALETTE.stem });
  }

  // propped glazed lid: hinged at the back rail, front lifted just past level
  for (let z = 0; z < D; z++) {
    const ly = 6 + Math.round((z / (D - 1)) * 1.4); // 6 → 7, near-flat when open
    for (let x = 0; x <= W - 1; x++) {
      const border = x === 0 || x === W - 1 || z === 0 || z === D - 1;
      const target = border ? solid : glass;
      target.push({ x, y: ly, z, s: 0.98, color: border ? C.postWood : C.glassPane });
    }
  }
  // hinges on the back rail, tying lid to box
  for (const hx of [1, 6]) solid.push({ x: hx, y: 5.7, z: 0, s: 1.08, color: PALETTE.ironDark });
  // prop sticks standing on the soil, reaching the lifted front edge
  for (const px of [2, 5]) {
    solid.push({ x: px, y: 4.3, z: D - 1.6, s: 0.62, color: C.postWoodLight });
    solid.push({ x: px, y: 5.3, z: D - 1.6, s: 0.58, color: C.postWoodLight });
    solid.push({ x: px, y: 6.3, z: D - 1.55, s: 0.54, color: C.postWoodLight });
  }

  return group([solidMesh(solid), paneMesh(glass, 0.45, PALETTE.glass)]);
}

// ---------------------------------------------------------------------------
// Chicken coop — 15×15 envelope: raised house, nest box, ramp, run hint
// ---------------------------------------------------------------------------

export function makeChickenCoop(): THREE.Object3D {
  const rand = rng(3601);
  const solid: Voxel[] = [];
  const HW = 11; // house x: 0..10
  const HD = 9;  // house z: 0..8

  // legs + floor frame
  for (const [lx, lz] of [[0, 0], [HW - 1, 0], [0, HD - 1], [HW - 1, HD - 1], [5, 0], [5, HD - 1]] as Array<[number, number]>)
    for (let y = 0; y <= 5; y++)
      solid.push({ x: lx, y, z: lz, s: 1.22, color: rand() < 0.3 ? C.postWood : mixColor(C.postWood, PALETTE.black, 0.15) });
  for (let x = 0; x <= HW - 1; x++)
    for (const z of [0, HD - 1]) solid.push({ x, y: 5.5, z, s: 1.05, color: C.postWood });
  for (let z = 1; z < HD - 1; z++)
    for (const x of [0, HW - 1]) solid.push({ x, y: 5.5, z, s: 1.05, color: C.postWood });
  for (let x = 1; x < HW - 1; x++)
    for (let z = 1; z < HD - 1; z++)
      solid.push({ x, y: 6, z, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });

  // walls — tops follow the skillion profile so the roof lands flush
  const roofYAt = (z: number): number => 14 + Math.max(0, Math.floor((z + 1) / 4)); // slab height over each wall line
  const wallCells: Array<[number, number]> = [];
  for (let x = 1; x < HW - 1; x++) { wallCells.push([x, 0]); wallCells.push([x, HD - 1]); }
  for (let z = 1; z < HD - 1; z++) { wallCells.push([0, z]); wallCells.push([HW - 1, z]); }
  for (const [x, z] of wallCells) {
    const top = Math.min(15, roofYAt(z) - 1);
    for (let y = 7; y <= top; y++) {
      let c = (Math.floor((y - 7) / 2) % 2 === 0) ? C.coopWall : mixColor(C.coopWall, PALETTE.woodDark, 0.35);
      if (rand() < 0.08) c = mixColor(c, PALETTE.black, 0.2);
      solid.push({ x, y, z, color: c });
    }
  }
  for (const [px, pz] of [[0, 0], [HW - 1, 0], [0, HD - 1], [HW - 1, HD - 1]] as Array<[number, number]>) {
    for (let y = 6; y <= 14; y++)
      solid.push({ x: px, y, z: pz, s: 1.28, color: y % 3 === 0 ? C.postWood : C.postWoodLight });
  }

  // pop door on the sunny front (+Z) + perch stub
  for (let x = 4; x <= 6; x++)
    for (let y = 8; y <= 11; y++) solid.push({ x, y, z: HD - 1, color: C.trimShadow });
  for (const dx of [3, 7]) for (let y = 7; y <= 11; y++) solid.push({ x: dx, y, z: HD - 1, s: 1.06, color: C.frameWhite });
  for (let x = 3; x <= 7; x++) {
    solid.push({ x, y: 7, z: HD - 1, s: 1.06, color: C.frameWhite });
    solid.push({ x, y: 11, z: HD - 1, s: 1.06, color: C.frameWhite });
  }
  solid.push({ x: 5, y: 8, z: HD - 0.3, s: 0.5, color: C.postWoodLight }); // perch stick
  // tiny window + vents
  for (let x = 1; x <= 2; x++)
    for (let y = 10; y <= 11; y++)
      solid.push({ x, y, z: HD - 1, s: 0.98, color: x === 1 || x === 2 || y === 10 || y === 11 ? C.trimShadow : C.glassPane });
  for (let x = 8; x <= 9; x++) solid.push({ x, y: 13, z: HD - 1, s: 0.6, color: C.trimShadow });

  // skillion roof, high over the front door, stepping down to the back
  for (let i = 0; i < 12; i++) {
    const z = -1 + i;
    const ry = 14 + Math.floor(i / 4); // 14 back → 16 front overhang
    const prev = i > 0 ? 14 + Math.floor((i - 1) / 4) : ry;
    for (let x = -1; x <= HW; x++)
      for (let y = prev; y <= ry; y++)
        solid.push({
          x, y, z,
          color: x === -1 || x === HW
            ? C.trimWhite
            : y < ry
              ? mixColor(C.coopRoof, PALETTE.black, 0.25) // riser shadow
              : x % 3 === 0
                ? mixColor(C.coopRoof, PALETTE.black, 0.16) // plank seam lines
                : rand() < 0.1 ? mixColor(C.coopRoof, PALETTE.black, 0.2) : C.coopRoof,
        });
  }
  for (let x = -1; x <= HW; x++) {
    solid.push({ x, y: 16, z: HD + 2, color: C.trimWhite }); // high front fascia
    solid.push({ x, y: 14, z: -2, color: C.trimWhite });     // low back fascia
  }

  // nest box protruding on the east face
  for (let x = HW; x <= HW + 2; x++)
    for (let z = 2; z <= 6; z++)
      for (let y = 8; y <= 12; y++) {
        const shell = x === HW + 2 || z === 2 || z === 6 || y === 8;
        if (shell && !(x > HW && y >= 9 && y <= 10 && z >= 3 && z <= 5))
          solid.push({ x, y, z, color: rand() < 0.12 ? mixColor(C.coopWall, PALETTE.black, 0.2) : C.coopWall });
      }
  // dark entry hole + landing lip
  for (let z = 3; z <= 5; z++)
    for (let y = 9; y <= 10; y++) solid.push({ x: HW + 2, y, z, color: C.trimShadow });
  solid.push({ x: HW + 2.6, y: 8.7, z: 4, s: 0.8, color: C.postWoodLight });
  // ajar lid with hinges + latch
  for (let z = 2; z <= 6; z++) {
    const ly = z <= 3 ? 13.4 : 13;
    solid.push({ x: HW + 1, y: ly, z, s: 1.1, color: C.coopRoof });
  }
  solid.push({ x: HW, y: 12.6, z: 2, s: 0.8, color: PALETTE.ironDark });
  solid.push({ x: HW, y: 12.6, z: 6, s: 0.8, color: PALETTE.ironDark });
  solid.push({ x: HW + 2.2, y: 13.2, z: 4, s: 0.5, color: PALETTE.metal });

  // ramp with cleats down from the pop door, stringers + riser fill so it
  // reads as a solid little stair, touching the ground
  for (let i = 0; i < 7; i++) {
    const z = HD + i;
    const ry = 7.6 - i * 1.15;
    for (let x = 4; x <= 6; x++) {
      solid.push({ x, y: ry, z, s: 1.02, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
      if (i < 6) {
        const ryNext = 7.6 - (i + 1) * 1.15;
        for (let y = ryNext; y < ry; y++)
          solid.push({ x, y, z: z + 0.5, s: 0.98, color: mixColor(C.plankWeathered, PALETTE.black, 0.18) });
      }
      if (i % 2 === 0) solid.push({ x, y: ry + 0.55, z: z + 0.3, s: 0.42, color: C.postWood }); // cleat
    }
    for (const sx of [3.35, 6.65])
      solid.push({ x: sx, y: ry + 0.1, z, s: 0.55, color: C.postWood }); // side stringers
  }
  // feed grains scattered at the ramp foot
  for (let i = 0; i < 7; i++)
    solid.push({
      x: 3.5 + rand() * 3, y: 0.2, z: HD + 5 + rand() * 2.5, s: 0.3,
      color: rand() < 0.6 ? PALETTE.cornGold : PALETTE.straw,
    });

  // run-fence hint off the front corner
  for (let i = 0; i < 4; i++) {
    const pz = HD + 1 + i * 2;
    for (let y = 0; y <= 7; y++)
      solid.push({ x: HW + 3, y, z: pz, s: 1.05, color: y === 7 ? C.postWoodLight : C.plankWeathered });
    solid.push({ x: HW + 3, y: 7.6, z: pz, s: 0.8, color: C.postWoodLight });
  }
  for (const ry of [3, 6])
    for (let z = HD + 1; z <= HD + 7; z++)
      solid.push({ x: HW + 3, y: ry, z, s: 0.8, color: C.plankWeathered });

  // grass tufts at the leg bases
  for (let i = 0; i < 10; i++)
    solid.push({
      x: rand() * (HW + 3), y: 0.5 + rand() * 0.6, z: rand() * (HD + 7), s: 0.32,
      color: rand() < 0.5 ? PALETTE.grass : PALETTE.grassDark,
    });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Indoor grow tent — mylar grow room: black shell, open front, glow bars
// ---------------------------------------------------------------------------

export function makeGrowTent(): THREE.Object3D {
  const rand = rng(3701);
  const solid: Voxel[] = [];
  const W = 20; // x: 0..19
  const D = 20; // z: 0..19, open front at z = D-1
  const H = 23;

  const shell = mixColor(PALETTE.charcoal, PALETTE.black, 0.35);
  const shellLight = mixColor(shell, PALETTE.metalDark, 0.3);
  // fabric reads as horizontal panel bands with a rare lighter weave fleck
  const wall = (y: number): number => {
    const band = Math.floor(y / 3) % 2 === 0 ? shell : shellLight;
    return rand() < 0.05 ? mixColor(band, PALETTE.metalDark, 0.2) : band;
  };

  // reflective white floor tray
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      solid.push({ x, y: 0, z, s: 0.98, color: rand() < 0.18 ? mixColor(C.frameWhite, PALETTE.gravel, 0.18) : C.frameWhite });

  // black shell: back wall, both side walls, ceiling (front left open)
  for (let z = 0; z < 1; z++)
    for (let x = 0; x < W; x++)
      for (let y = 1; y <= H - 1; y++) solid.push({ x, y, z, color: wall(y) });
  for (const x of [0, W - 1])
    for (let z = 1; z < D; z++)
      for (let y = 1; y <= H - 1; y++) solid.push({ x, y, z, color: wall(y) });
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      solid.push({ x, y: H, z, color: wall(H) });

  // reflective mylar inner lining (bright) on the interior faces
  for (let z = 1; z < D - 1; z++)
    for (let y = 1; y <= H - 1; y++) {
      solid.push({ x: 1, y, z, s: 0.96, color: C.frameWhite });
      solid.push({ x: W - 2, y, z, s: 0.96, color: C.frameWhite });
    }
  for (let x = 1; x < W - 1; x++)
    for (let y = 1; y <= H - 1; y++)
      solid.push({ x, y, z: 1, s: 0.96, color: C.frameWhite });

  // front opening trim (door frame around the open face)
  for (let y = 1; y <= H - 1; y++)
    for (const x of [0, W - 1]) solid.push({ x, y, z: D - 1, s: 1.05, color: wall(y) });
  for (let x = 0; x < W; x++) solid.push({ x, y: H, z: D - 1, s: 1.05, color: wall(H) });
  // frame corner connectors at the two front-top corners
  solid.push({ x: 0, y: H + 0.18, z: D - 1, s: 1.35, color: PALETTE.metalDark });
  solid.push({ x: W - 1, y: H + 0.18, z: D - 1, s: 1.35, color: PALETTE.metalDark });

  // zipper track up the right-front edge, slider at hand height
  for (let y = 1.2; y <= H - 1.2; y += 0.5)
    solid.push({ x: W - 0.45, y, z: D - 0.85, s: 0.34, color: rand() < 0.3 ? PALETTE.metalDark : PALETTE.metal });
  solid.push({ x: W - 0.45, y: 6, z: D - 0.7, s: 0.5, color: PALETTE.ironDark });
  solid.push({ x: W - 0.4, y: 5.5, z: D - 0.4, s: 0.3, color: PALETTE.metalDark });

  // hanging grow-light bars (two rows), lowered so they read through the mouth
  const glow = mixColor(PALETTE.flowerYellow, PALETTE.white, 0.55);
  for (const lx of [5, 14])
    for (let lz = 3; lz < D - 3; lz++)
      solid.push({ x: lx, y: H - 5, z: lz, s: 1.05, color: glow });
  for (const lx of [5, 14])
    for (const lz of [4, D - 4])
      for (let ry = H - 4.6; ry <= H - 1.2; ry += 0.55)
        solid.push({ x: lx, y: ry, z: lz, s: 0.25, color: PALETTE.metalDark }); // suspension

  // seedling trays on the floor
  for (let x = 3; x <= 16; x += 2)
    for (let z = 4; z <= 15; z += 2) {
      solid.push({ x, y: 0.9, z, s: 0.9, color: mixColor(PALETTE.terracotta, PALETTE.black, 0.2) });
      solid.push({ x, y: 1.5, z, s: 0.5, color: PALETTE.leafYoung });
      solid.push({ x, y: 1.9, z, s: 0.3, color: PALETTE.leaf });
    }

  // roof exhaust duct + fan
  for (let i = 0; i < 4; i++) solid.push({ x: 9, y: H + 1 + i, z: 9, s: 1.1, color: PALETTE.metalDark });
  solid.push({ x: 9, y: H + 4.4, z: 9, s: 1.3, color: PALETTE.metal });
  solid.push({ x: 9, y: H + 4.4, z: 9.4, s: 0.5, color: PALETTE.iron });

  return solidMesh(solid);
}
