/**
 * Lane C props — compost bin, rain barrel, IBC tote, water tap, irrigation
 * line, beehive, hay bale, crate stack, signpost, scarecrow. Function made
 * visible: fill layers, taps + drips, downpipes, twine bands, patches.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, solidMesh, weighted } from './shared';

// ---------------------------------------------------------------------------
// Compost bin — slatted timber with visible fresh/dark layers
// ---------------------------------------------------------------------------

export function makeCompostBin(): THREE.Object3D {
  const rand = rng(4101);
  const solid: Voxel[] = [];
  const W = 12;
  const D = 12;

  // proud corner posts
  for (const [px, pz] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]] as Array<[number, number]>) {
    for (let y = 0; y <= 9; y++)
      solid.push({ x: px, y, z: pz, s: 1.26, color: y % 3 === 0 ? C.postWood : C.postWoodLight });
    solid.push({ x: px, y: 9.56, z: pz, s: 1.18, color: PALETTE.plankLight });
  }
  // slatted walls with air gaps on two courses
  const slatTone = (): number => plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
  for (let y = 0; y <= 8; y++) {
    if (y === 5 || y === 7) continue; // ventilation gaps
    for (let x = 1; x < W - 1; x++)
      for (const z of [0, D - 1]) solid.push({ x, y, z, color: slatTone() });
    for (let z = 1; z < D - 1; z++)
      for (const x of [0, W - 1]) solid.push({ x, y, z, color: slatTone() });
  }
  // fill visible through gaps + open top: layered strata
  for (let x = 1; x < W - 1; x++)
    for (let z = 1; z < D - 1; z++) {
      solid.push({ x, y: 1, z, color: weighted([[PALETTE.soilDark, 0.7], [PALETTE.black, 0.3]], rand()) });
      solid.push({ x, y: 2, z, color: weighted([[PALETTE.soilDark, 0.5], [PALETTE.mulch, 0.5]], rand()) });
      solid.push({ x, y: 3, z, color: weighted([[PALETTE.leafDark, 0.6], [PALETTE.soilDark, 0.4]], rand()) });
      if (rand() < 0.75) solid.push({ x, y: 4, z, color: weighted([[PALETTE.leaf, 0.45], [PALETTE.leafDark, 0.35], [mixColor(PALETTE.carrot, PALETTE.pumpkin, 0.5), 0.2]], rand()) });
      if (rand() < 0.5) solid.push({ x, y: 5, z, color: weighted([[PALETTE.leafYoung, 0.4], [PALETTE.grass, 0.3], [mixColor(PALETTE.pumpkin, PALETTE.carrot, 0.5), 0.3]], rand()) });
      if (rand() < 0.22) solid.push({ x, y: 5.9, z, s: 0.55, color: rand() < 0.5 ? mixColor(PALETTE.tomato, PALETTE.black, 0.15) : PALETTE.leafYoung });
    }
  // top rim boards
  for (let x = 0; x <= W - 1; x++)
    for (const z of [0, D - 1]) solid.push({ x, y: 9, z, s: 1.02, color: C.postWoodLight });
  for (let z = 1; z < D - 1; z++)
    for (const x of [0, W - 1]) solid.push({ x, y: 9, z, s: 1.02, color: C.postWoodLight });
  // steam wisp of active compost? a few dark flies instead — skip; heap spill:
  solid.push({ x: W + 0.4, y: 0.3, z: D - 4, s: 0.7, color: PALETTE.soilDark });
  solid.push({ x: W + 1.1, y: 0.2, z: D - 4.6, s: 0.5, color: PALETTE.leafDark });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Rain barrel — staved barrel, bands, lid, tap, downpipe elbow + puddle
// ---------------------------------------------------------------------------

export function makeRainBarrel(): THREE.Object3D {
  const rand = rng(4201);
  const solid: Voxel[] = [];
  const CX = 4.5;
  const CZ = 4.5;

  // bulge radius profile; circular shells give a rounded stave silhouette
  const rAt = (y: number): number => (y >= 3 && y <= 8 ? 4.45 : y === 2 || y === 9 ? 4.15 : 3.6);
  const inShell = (gx: number, gz: number, r: number): boolean => {
    const d = Math.hypot(gx - CX, gz - CZ);
    return d <= r && d >= r - 1.3;
  };
  for (let y = 0; y <= 11; y++) {
    const r = rAt(y);
    for (let gx = 0; gx <= 9; gx++)
      for (let gz = 0; gz <= 9; gz++) {
        if (!inShell(gx + 0.5, gz + 0.5, r)) continue;
        const ang = Math.atan2(gz + 0.5 - CZ, gx + 0.5 - CX);
        const sector = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 10);
        const stave = sector % 3 === 0 ? PALETTE.woodDark : sector % 3 === 1 ? C.plankWeathered : PALETTE.wood;
        solid.push({
          x: gx + 0.5, y: y + 0.5, z: gz + 0.5,
          color: rand() < 0.1 ? mixColor(stave, PALETTE.black, 0.2) : stave,
        });
      }
  }
  // iron hoops painted onto the surface (slightly proud bands)
  for (const hy of [2, 9])
    for (let gx = 0; gx <= 9; gx++)
      for (let gz = 0; gz <= 9; gz++) {
        if (!inShell(gx + 0.5, gz + 0.5, rAt(hy))) continue;
        solid.push({
          x: gx + 0.5, y: hy + 0.5, z: gz + 0.5, s: 1.07,
          color: rand() < 0.25 ? PALETTE.metalDark : PALETTE.iron,
        });
      }
  // lid: wooden rim over a dark mesh grate
  for (let gx = 0; gx <= 9; gx++)
    for (let gz = 0; gz <= 9; gz++) {
      const d = Math.hypot(gx + 0.5 - CX, gz + 0.5 - CZ);
      if (d > 4.45 || d < 3.3) continue;
      const rim = d > 3.55;
      solid.push({
        x: gx + 0.5, y: 12.1, z: gz + 0.5, s: 0.96,
        color: rim ? C.postWood : rand() < 0.7 ? PALETTE.charcoal : PALETTE.metalDark,
      });
    }
  // brass tap low on the front + cross handle
  solid.push({ x: CX, y: 2.6, z: CZ + 4.6, s: 0.75, color: PALETTE.copper });
  solid.push({ x: CX, y: 2.6, z: CZ + 5.3, s: 0.5, color: PALETTE.metalDark });
  solid.push({ x: CX, y: 3.4, z: CZ + 4.6, s: 0.4, color: PALETTE.metalDark });
  solid.push({ x: CX + 0.45, y: 3.6, z: CZ + 4.6, s: 0.26, color: PALETTE.metalDark });
  solid.push({ x: CX - 0.45, y: 3.6, z: CZ + 4.6, s: 0.26, color: PALETTE.metalDark });
  // overflow spout on the side
  solid.push({ x: CX + 4.8, y: 9.5, z: CZ, s: 0.6, color: PALETTE.copper });
  // downpipe hugging the back, elbowing into the lid
  for (let y = 6; y <= 15; y++) solid.push({ x: 8.1, y: y + 0.4, z: 0.6, s: 0.8, color: y % 4 === 0 ? PALETTE.metalDark : PALETTE.metal });
  solid.push({ x: 7.2, y: 15.8, z: 0.6, s: 0.85, color: PALETTE.metal });
  solid.push({ x: 6, y: 15.8, z: 0.6, s: 0.85, color: PALETTE.metal });
  solid.push({ x: 5, y: 14.9, z: 0.6, s: 0.8, color: PALETTE.metal });
  solid.push({ x: 4.6, y: 13.6, z: 0.6, s: 0.7, color: PALETTE.metalDark });
  solid.push({ x: 7.6, y: 10.4, z: 0.6, s: 0.5, color: PALETTE.metalDark }); // wall bracket
  // drip puddle under the tap
  solid.push({ x: CX, y: 0.12, z: CZ + 6.6, s: 1.2, color: C.waterTint });
  solid.push({ x: CX - 1, y: 0.08, z: CZ + 7.2, s: 0.8, color: PALETTE.waterLight });
  solid.push({ x: CX + 0.9, y: 0.05, z: CZ + 7.6, s: 0.5, color: PALETTE.water });
  for (const [wx, wz] of [[CX - 1.7, CZ + 5.9], [CX + 1.6, CZ + 5.8], [CX, CZ + 8.4]] as Array<[number, number]>)
    solid.push({ x: wx, y: 0.05, z: wz, s: 0.7, color: PALETTE.soilWet });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// IBC tote — caged tank on a pallet, valve at the bottom
// ---------------------------------------------------------------------------

export function makeIbcTote(): THREE.Object3D {
  const rand = rng(4301);
  const solid: Voxel[] = [];
  const W = 13;
  const Dp = 11;

  // pallet: skids + deck boards with notches
  for (const sx of [0, 5, W - 1]) for (let z = 0; z < Dp; z++) solid.push({ x: sx, y: 0.4, z, s: 0.85, color: C.postWood });
  for (let x = 0; x < W; x++)
    for (let z = 0; z < Dp; z++)
      if (!(x % 4 === 3)) solid.push({ x, y: 1.3, z, s: 0.92, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });

  // translucent tank with water-level tint banding
  for (let x = 1; x <= W - 2; x++)
    for (let z = 1; z < Dp - 1; z++)
      for (let y = 2; y <= 11; y++) {
        const shell = x === 1 || x === W - 2 || z === 1 || z === Dp - 2 || y === 11;
        if (!shell) continue;
        let c: number;
        if (y >= 9) c = weighted([[PALETTE.woolWhite, 0.8], [C.filmWhite, 0.2]], rand());
        else c = weighted([[C.waterTint, 0.65], [mixColor(PALETTE.water, PALETTE.white, 0.5), 0.35]], rand());
        solid.push({ x, y, z, s: 0.99, color: c });
      }
  // screw cap on top
  solid.push({ x: 6, y: 11.8, z: 5, s: 1.3, color: PALETTE.black });

  // steel cage: corner posts, mid bars, horizontal rings, top frame
  const bar = PALETTE.metal;
  for (const [bx, bz] of [[0, 0], [W - 1, 0], [0, Dp - 1], [W - 1, Dp - 1], [W - 1, 5], [0, 5]] as Array<[number, number]>) {
    for (let y = 1; y <= 13; y++)
      solid.push({ x: bx, y, z: bz, s: 1.06, color: y % 4 === 0 ? PALETTE.metalDark : bar });
  }
  for (const ry of [1.6, 6.5, 11.4, 13.2])
    for (const [x0, z0, hx, hz] of [[0, 0, 1, 0], [0, 0, 0, 1], [W - 1, 0, 0, 1], [0, Dp - 1, 1, 0]] as Array<[number, number, number, number]>) {
      const len = hx ? W - 1 : Dp - 1;
      for (let i = 0; i <= len; i++)
        solid.push({ x: x0 + i * hx, y: ry, z: z0 + i * hz, s: 0.82, color: rand() < 0.2 ? PALETTE.metalDark : bar });
    }
  // valve + handle + hose stub at bottom front
  solid.push({ x: 6, y: 1.2, z: Dp - 0.4, s: 0.9, color: PALETTE.metalDark });
  solid.push({ x: 6, y: 2.1, z: Dp - 0.4, s: 0.5, color: PALETTE.metal });
  solid.push({ x: 6, y: 0.6, z: Dp + 0.6, s: 0.62, color: PALETTE.charcoal });
  solid.push({ x: 6.9, y: 0.6, z: Dp + 0.9, s: 0.5, color: PALETTE.charcoal });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Water tap — standpipe post, bib tap, drip puddle with splash stones
// ---------------------------------------------------------------------------

export function makeWaterTap(): THREE.Object3D {
  const rand = rng(4401);
  const solid: Voxel[] = [];

  // stone footing + timber post
  solid.push({ x: 0, y: 0.3, z: 0, s: 1.6, color: PALETTE.stone });
  for (let y = 0; y <= 11; y++)
    solid.push({ x: 0, y: y + 0.6, z: 0, s: 1.34, color: y % 3 === 0 ? C.postWood : rand() < 0.25 ? C.postWood : C.postWoodLight });
  solid.push({ x: 0, y: 11.9, z: 0, s: 1.42, color: PALETTE.stoneLight }); // pipe cap plate

  // riser pipe up the sunny side, strapped to the post, elbow to a forward bib
  for (let y = 1; y <= 10; y++) solid.push({ x: 0.95, y: y + 0.6, z: -0.2, s: 0.78, color: PALETTE.metal });
  solid.push({ x: 0.6, y: 4.6, z: -0.2, s: 0.5, color: PALETTE.metalDark }); // pipe strap
  solid.push({ x: 0.6, y: 8.6, z: -0.2, s: 0.5, color: PALETTE.metalDark });
  solid.push({ x: 0.4, y: 11, z: -0.2, s: 0.78, color: PALETTE.metal });
  solid.push({ x: 0.2, y: 10.4, z: 0.4, s: 0.7, color: PALETTE.metal });
  // bib body + spout
  solid.push({ x: 0.2, y: 9, z: 1, s: 0.75, color: PALETTE.metal });
  solid.push({ x: 0.2, y: 8.6, z: 1.6, s: 0.55, color: PALETTE.metalDark });
  // cross handle on top of the bib
  solid.push({ x: 0.2, y: 9.8, z: 1, s: 0.42, color: PALETTE.metalDark });
  solid.push({ x: 0.75, y: 10, z: 1, s: 0.3, color: PALETTE.metalDark });
  solid.push({ x: -0.35, y: 10, z: 1, s: 0.3, color: PALETTE.metalDark });
  // hanging droplet
  solid.push({ x: 0.2, y: 7.9, z: 1.6, s: 0.32, color: PALETTE.waterLight });

  // drip puddle + wet ring + splash stones
  solid.push({ x: 0, y: 0.12, z: 2.6, s: 1.5, color: C.waterTint });
  solid.push({ x: 0.9, y: 0.08, z: 3.1, s: 0.9, color: PALETTE.waterLight });
  solid.push({ x: -0.9, y: 0.08, z: 2.4, s: 0.8, color: PALETTE.water });
  for (const [wx, wz] of [[-1.8, 1.6], [1.8, 2.2], [0.4, 4.2], [-1.2, 3.6]] as Array<[number, number]>)
    solid.push({
      x: wx, y: 0.1, z: wz, s: 0.7,
      color: rand() < 0.5 ? PALETTE.soilWet : PALETTE.gravelDark,
    });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Irrigation line — 3 m drip run with emitters and wet spots (plan-view read)
// ---------------------------------------------------------------------------

export function makeIrrigationLine(): THREE.Object3D {
  const rand = rng(4501);
  const solid: Voxel[] = [];
  const LEN = 29;

  // main black poly line
  for (let x = 0; x <= LEN; x++)
    solid.push({ x, y: 0.45, z: 0, s: 0.72, color: x % 7 === 3 ? PALETTE.charcoal : C.pipeBlack });
  // start elbow rising (to a tap) + end cap
  solid.push({ x: -0.2, y: 1.1, z: 0, s: 0.66, color: C.pipeBlack });
  solid.push({ x: -0.2, y: 1.8, z: 0, s: 0.6, color: PALETTE.metalDark });
  solid.push({ x: LEN + 0.5, y: 0.45, z: 0, s: 0.8, color: PALETTE.metalDark });

  // emitters every 5 voxels: nub + wet spot below
  for (let x = 3; x <= LEN - 2; x += 5) {
    solid.push({ x, y: 0.95, z: 0, s: 0.42, color: PALETTE.black });
    solid.push({ x, y: 0.12, z: 0.9, s: 0.95, color: PALETTE.soilWet });
    if (rand() < 0.6) solid.push({ x: x + 0.6, y: 0.1, z: 1.5, s: 0.5, color: mixColor(PALETTE.soilWet, PALETTE.black, 0.3) });
  }
  // wire ground staples holding the line
  for (const sx of [0, 8, 16, 24])
    for (const dz of [-0.55, 0.55])
      solid.push({ x: sx, y: 0.5, z: dz, s: 0.3, color: PALETTE.metalDark });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Beehive — Langstroth stack, landing board, static bees
// ---------------------------------------------------------------------------

export function makeBeehive(): THREE.Object3D {
  const rand = rng(4601);
  const solid: Voxel[] = [];
  const boxTone = (): number =>
    weighted([[PALETTE.cream, 0.6], [C.trimWhite, 0.25], [mixColor(PALETTE.cream, PALETTE.gravel, 0.3), 0.15]], rand());

  // three solid supers stacked tight; dark seam band under each joint
  const supers: Array<[number, number]> = [[0, 4], [4, 4], [8, 3]];
  for (const [y0, h] of supers)
    for (let x = 0; x <= 9; x++)
      for (let z = 0; z <= 9; z++)
        for (let y = y0; y < y0 + h; y++) {
          const shell = x === 0 || x === 9 || z === 0 || z === 9 || y === y0 || y === y0 + h - 1;
          if (!shell) continue;
          const seam = y === y0 + h - 1 && y0 > 0;
          solid.push({
            x, y: y + 0.5, z, s: 0.99,
            color: seam ? mixColor(boxTone(), PALETTE.gravelDark, 0.45) : boxTone(),
          });
        }
  // telescoping metal cover: solid slab with darker rim
  for (let gx = -0.5; gx <= 10.5; gx++)
    for (let gz = -0.5; gz <= 10.5; gz++) {
      const rim = gx === -0.5 || gx === 10.5 || gz === -0.5 || gz === 10.5;
      solid.push({
        x: gx, y: 11.7, z: gz, s: 1.02,
        color: rim ? PALETTE.metalDark : rand() < 0.12 ? PALETTE.metalDark : PALETTE.metal,
      });
    }
  // brick weight on the lid
  solid.push({ x: 7.5, y: 12.6, z: 5, s: 1.35, color: PALETTE.terracotta });
  solid.push({ x: 7.5, y: 13.4, z: 5, s: 1.1, color: mixColor(PALETTE.terracotta, PALETTE.black, 0.25) });

  // entrance slit + landing board
  for (let x = 2; x <= 7; x++) solid.push({ x, y: 0.7, z: 9.55, s: 0.8, color: PALETTE.black });
  solid.push({ x: 4.5, y: 0.3, z: 10.7, s: 2.6, color: C.postWoodLight });
  solid.push({ x: 4.5, y: 0.3, z: 11.9, s: 2, color: mixColor(C.postWoodLight, PALETTE.black, 0.15) });
  // static bees on the landing board
  for (const [bx, bz] of [[3.4, 10.5], [4.6, 11.1], [5.8, 10.7], [4.1, 11.7]] as Array<[number, number]>) {
    solid.push({ x: bx, y: 0.8, z: bz, s: 0.34, color: PALETTE.beeYellow });
    solid.push({ x: bx, y: 1, z: bz, s: 0.2, color: PALETTE.beeBlack });
  }
  // grass tufts at the base
  for (let i = 0; i < 6; i++)
    solid.push({
      x: -0.9 + rand(), y: 0.5 + rand() * 0.5, z: rand() * 10, s: 0.3,
      color: rand() < 0.5 ? PALETTE.grass : PALETTE.grassDark,
    });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Hay bale — flaked sides, twine bands, stray stalks
// ---------------------------------------------------------------------------

export function makeHayBale(): THREE.Object3D {
  const rand = rng(4701);
  const solid: Voxel[] = [];
  const W = 10;
  const H = 5;
  const D = 4;

  const flakeTone = (fx: number): number => {
    const base = fx % 3 === 0 ? PALETTE.hay : fx % 3 === 1 ? PALETTE.straw : mixColor(PALETTE.hay, PALETTE.straw, 0.5);
    return base;
  };
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++) {
        const shell = x === 0 || x === W - 1 || y === H - 1 || y === 0 || z === 0 || z === D - 1;
        if (!shell) continue;
        let c = flakeTone(Math.floor(x / 2.5));
        if (rand() < 0.14) c = mixColor(c, PALETTE.mulch, 0.3);
        else if (rand() > 0.9) c = mixColor(c, PALETTE.cornGold, 0.4);
        // twine bands squeeze two flakes together
        if (Math.abs(x - 2.5) < 0.8 || Math.abs(x - 7.5) < 0.8) c = mixColor(c, C.strawDark, 0.55);
        solid.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, s: 0.98, color: c });
      }
  // uneven top: loose flakes + stray stalks
  for (const [tx, tz] of [[2.2, 1.2], [5.4, 2.6], [7.6, 1]] as Array<[number, number]>) {
    solid.push({ x: tx, y: H + 0.35, z: tz, s: 0.7, color: PALETTE.straw });
    solid.push({ x: tx + 0.4, y: H + 0.9, z: tz + 0.2, s: 0.3, color: mixColor(PALETTE.straw, PALETTE.cornGold, 0.5) });
  }
  for (let i = 0; i < 5; i++)
    solid.push({
      x: rand() * W, y: H + 0.4 + rand() * 0.5, z: rand() * D, s: 0.22,
      color: rand() < 0.5 ? PALETTE.straw : PALETTE.hay,
    });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Crate stack — three slatted harvest crates, fruit peeking out the top
// ---------------------------------------------------------------------------

function crate(out: Voxel[], rand: () => number, ox: number, oy: number, oz: number): void {
  const S = 9;
  const Hh = 4;
  const slat = (): number => plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
  // corner posts
  for (const [px, pz] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]] as Array<[number, number]>)
    for (let y = 0; y < Hh; y++)
      out.push({ x: ox + px, y: oy + y + 0.5, z: oz + pz, s: 1.08, color: y % 2 === 0 ? C.postWood : C.postWoodLight });
  // solid bottom + two board rows with an air gap between
  for (let i = 1; i < S - 1; i++)
    for (let j = 1; j < S - 1; j++)
      out.push({ x: ox + i, y: oy + 0.5, z: oz + j, s: 0.98, color: slat() });
  for (const by of [1.5, 3.5])
    for (let i = 1; i < S - 1; i++)
      for (const e of [0, S - 1]) {
        out.push({ x: ox + i, y: oy + by, z: oz + e, color: slat() });
        out.push({ x: ox + e, y: oy + by, z: oz + i, color: slat() });
      }
}

export function makeCrateStack(): THREE.Object3D {
  const rand = rng(4801);
  const solid: Voxel[] = [];
  crate(solid, rand, 0, 0, 0);
  crate(solid, rand, 0.3, 4.2, 0.2);
  crate(solid, rand, 0.1, 8.4, 0.35);
  // harvest peeking above the top rim
  for (let i = 0; i < 10; i++)
    solid.push({
      x: 1.8 + rand() * 5.4, y: 12.3 + rand() * 0.6, z: 2.2 + rand() * 5,
      s: 0.55,
      color: weighted(
        [
          [PALETTE.tomato, 0.35],
          [mixColor(PALETTE.carrot, PALETTE.pumpkin, 0.4), 0.3],
          [PALETTE.leafDark, 0.2],
          [PALETTE.cornGold, 0.15],
        ],
        rand(),
      ),
    });
  // one tomato that rolled away
  solid.push({ x: 10.4, y: 0.45, z: 3, s: 0.8, color: PALETTE.tomato });
  solid.push({ x: 10.4, y: 0.95, z: 3, s: 0.3, color: PALETTE.stem });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Signpost — arrow-shaped board with carved label grooves
// ---------------------------------------------------------------------------

export function makeSignpost(): THREE.Object3D {
  const rand = rng(4901);
  const solid: Voxel[] = [];

  // earth mound + post
  solid.push({ x: 0, y: 0.2, z: 0, s: 1.7, color: weighted([[PALETTE.grassDark, 0.5], [PALETTE.soil, 0.5]], rand()) });
  for (let y = 0; y <= 14; y++)
    solid.push({ x: 0, y: y + 0.6, z: 0, s: 1.15, color: y % 3 === 0 ? C.postWood : rand() < 0.2 ? C.postWood : C.postWoodLight });
  solid.push({ x: 0, y: 15.3, z: 0, s: 1.05, color: mixColor(C.postWoodLight, PALETTE.plankLight, 0.5) });

  // arrow board pointing east (+X): shaft + stepped point
  const boardY = 11.5;
  for (let bx = -5; bx <= 5; bx++)
    for (const by of [boardY - 0.9, boardY + 0.9]) solid.push({ x: bx, y: by, z: 0.6, s: 0.95, color: plankTone(rand, PALETTE.plank, PALETTE.woodDark, PALETTE.plankLight) });
  for (let bx = -5; bx <= 3; bx++) solid.push({ x: bx, y: boardY, z: 0.6, s: 0.95, color: plankTone(rand, PALETTE.plank, PALETTE.woodDark, PALETTE.plankLight) });
  // stepped arrow head
  solid.push({ x: 4.4, y: boardY, z: 0.6, s: 0.95, color: PALETTE.plankLight });
  solid.push({ x: 4.4, y: boardY - 0.45, z: 0.6, s: 0.6, color: PALETTE.plankLight });
  solid.push({ x: 4.4, y: boardY + 0.45, z: 0.6, s: 0.6, color: PALETTE.plankLight });
  // carved label grooves + carved arrow glyph
  for (const gx of [-3, -1.4, 0.2])
    for (const gy of [boardY - 0.25, boardY + 0.25])
      solid.push({ x: gx, y: gy, z: 1.1, s: 0.5, color: mixColor(PALETTE.woodDark, PALETTE.black, 0.3) });
  solid.push({ x: 1.9, y: boardY, z: 1.1, s: 0.5, color: mixColor(PALETTE.woodDark, PALETTE.black, 0.3) });
  solid.push({ x: 2.4, y: boardY + 0.45, z: 1.1, s: 0.4, color: mixColor(PALETTE.woodDark, PALETTE.black, 0.3) });
  // nails
  solid.push({ x: -4.6, y: boardY, z: 1.12, s: 0.26, color: PALETTE.metalDark });
  solid.push({ x: -0.4, y: boardY, z: 1.12, s: 0.26, color: PALETTE.metalDark });

  // second small board pointing north with one groove row
  for (let bz = -4; bz >= -7; bz--)
    for (const by of [7.2, 8.6]) solid.push({ x: 0.6, y: by, z: bz, s: 0.95, color: plankTone(rand, PALETTE.plank, PALETTE.woodDark, PALETTE.plankLight) });
  for (let bz = -4; bz >= -6; bz--) solid.push({ x: 0.6, y: 7.9, z: bz, s: 0.95, color: plankTone(rand, PALETTE.plank, PALETTE.woodDark, PALETTE.plankLight) });
  solid.push({ x: 0.6, y: 7.9, z: -7.4, s: 0.6, color: PALETTE.plankLight });
  for (const gz of [-4.6, -5.9]) solid.push({ x: 1.1, y: 7.9, z: gz, s: 0.45, color: mixColor(PALETTE.woodDark, PALETTE.black, 0.3) });

  // flowers at the base
  for (const [fx, fz, fc] of [[-1.4, 1.2, PALETTE.flowerYellow], [1.3, -0.9, PALETTE.flowerWhite]] as Array<[number, number, number]>) {
    solid.push({ x: fx, y: 0.9, z: fz, s: 0.24, color: PALETTE.stem });
    solid.push({ x: fx, y: 1.3, z: fz, s: 0.4, color: fc });
  }
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Scarecrow — pole cross, patched shirt, straw head, hat, crow friend
// ---------------------------------------------------------------------------

export function makeScarecrow(): THREE.Object3D {
  const rand = rng(5001);
  const solid: Voxel[] = [];

  // pole + crossbar
  solid.push({ x: 0, y: 0.3, z: 0, s: 1.5, color: PALETTE.soilDark });
  for (let y = 0; y <= 17; y++)
    solid.push({ x: 0, y: y + 0.6, z: 0, s: 0.95, color: y % 4 === 0 ? C.postWood : mixColor(C.postWood, PALETTE.black, 0.08) });
  for (let ax = -5; ax <= 5; ax++)
    solid.push({ x: ax, y: 12.6, z: 0, s: 0.85, color: ax === 0 ? C.postWood : mixColor(C.postWood, PALETTE.black, 0.1) });

  // shirt torso: red dither with contrasting patches + buttons
  for (let x = -2; x <= 2; x++)
    for (let y = 8; y <= 11; y++) {
      let c = rand() < 0.2 ? C.shirtBlue : C.shirtRed;
      if (rand() < 0.12) c = mixColor(c, PALETTE.black, 0.25);
      if (x >= -1 && x <= 0 && y === 9) c = C.shirtBlue; // belly patch
      solid.push({ x, y, z: 0, s: 1.05, color: c });
      void c;
    }
  solid.push({ x: 0, y: 10.4, z: 0.55, s: 0.3, color: PALETTE.charcoal });
  solid.push({ x: 0, y: 9.2, z: 0.55, s: 0.3, color: PALETTE.charcoal });
  // sleeves along the crossbar + glove hands
  for (const dir of [-1, 1])
    for (let sx = 3; sx <= 4; sx++)
      solid.push({
        x: sx * dir, y: 12.6, z: 0, s: 1,
        color: sx === 4 && dir === -1 && rand() < 0.5 ? C.shirtRed : rand() < 0.25 ? C.shirtBlue : C.shirtRed,
      });
  solid.push({ x: -5.4, y: 12.6, z: 0, s: 0.8, color: PALETTE.cream });
  solid.push({ x: 5.4, y: 12.6, z: 0, s: 0.8, color: PALETTE.cream });
  // straw leaking at the waist
  for (let i = 0; i < 5; i++)
    solid.push({
      x: -2 + rand() * 4, y: 7.6, z: (rand() - 0.5), s: 0.4,
      color: rand() < 0.5 ? PALETTE.straw : PALETTE.hay,
    });

  // patched trousers on the pole + boots
  for (const dir of [-1, 1])
    for (let y = 3; y <= 7; y++)
      solid.push({
        x: dir * 1.2, y: y + 0.5, z: 0, s: 0.95,
        color: (dir === 1 && y === 5) ? PALETTE.hay : rand() < 0.2 ? mixColor(C.shirtBlue, PALETTE.black, 0.2) : C.shirtBlue,
      });
  solid.push({ x: -1.2, y: 2.4, z: 0.3, s: 1, color: PALETTE.charcoal });
  solid.push({ x: 1.2, y: 2.4, z: 0.3, s: 1, color: PALETTE.charcoal });
  // straw cuffs
  solid.push({ x: -1.2, y: 2.9, z: -0.4, s: 0.4, color: PALETTE.straw });
  solid.push({ x: 1.2, y: 2.9, z: -0.4, s: 0.4, color: PALETTE.hay });

  // burlap sack head with stitched face + straw hair
  for (let hx = -1; hx <= 1; hx++)
    for (let hy = 13; hy <= 16; hy++)
      solid.push({
        x: hx, y: hy + 0.5, z: 0, s: 1.04,
        color: rand() < 0.25 ? PALETTE.clay : mixColor(PALETTE.sand, PALETTE.clay, 0.45),
      });
  solid.push({ x: -0.6, y: 15.4, z: 0.55, s: 0.3, color: PALETTE.black }); // eyes
  solid.push({ x: 0.6, y: 15.4, z: 0.55, s: 0.3, color: PALETTE.black });
  for (const mx of [-0.3, 0.3]) solid.push({ x: mx, y: 14.2, z: 0.55, s: 0.24, color: PALETTE.black }); // stitched mouth
  for (const [hx, hy] of [[-1.6, 15.6], [1.6, 15.6], [-1.4, 16.4], [1.4, 16.4], [0, 16.9]] as Array<[number, number]>)
    solid.push({ x: hx, y: hy, z: 0, s: 0.4, color: rand() < 0.5 ? PALETTE.straw : PALETTE.hay });

  // straw hat: brim + crown + band
  for (let bx = -3; bx <= 3; bx++)
    solid.push({ x: bx, y: 17.4, z: 0, s: 0.95, color: rand() < 0.2 ? PALETTE.hay : PALETTE.straw });
  for (let cx2 = -1; cx2 <= 1; cx2++)
    for (let cy = 17.9; cy <= 19; cy++)
      solid.push({ x: cx2, y: cy, z: 0, s: 0.95, color: cy === 18.4 ? mixColor(PALETTE.hay, PALETTE.mulch, 0.4) : PALETTE.straw });

  // crow perched on the left arm
  solid.push({ x: -5.4, y: 13.9, z: 0, s: 0.9, color: PALETTE.charcoal }); // body
  solid.push({ x: -5.4, y: 14.8, z: 0, s: 0.65, color: PALETTE.black });   // head
  solid.push({ x: -5.4, y: 14.8, z: 0.5, s: 0.28, color: PALETTE.duckBill }); // beak
  solid.push({ x: -5.4, y: 15, z: 0.28, s: 0.14, color: PALETTE.white });  // eye glint
  solid.push({ x: -4.6, y: 13.4, z: 0, s: 0.4, color: PALETTE.black });    // tail flick
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Fruit tree — deciduous orchard tree: trunk, canopy, ripe fruit dots
// ---------------------------------------------------------------------------

export function makeFruitTree(): THREE.Object3D {
  const rand = rng(4501);
  const solid: Voxel[] = [];

  // trunk + a couple of lower branches
  for (let y = 0; y <= 8; y++)
    solid.push({ x: 0, y, z: 0, s: 1.15, color: y % 3 === 0 ? PALETTE.woodDark : PALETTE.wood });
  for (const [bx, bz, by] of [[1, 0, 6], [-1, 0, 5], [0, 1, 5], [0, -1, 6], [1, 1, 7], [-1, -1, 7]] as Array<[number, number, number]>)
    solid.push({ x: bx, y: by, z: bz, s: 0.7, color: PALETTE.woodDark });

  // canopy: rough sphere of leaves centered around y≈11
  const canopyR = 4;
  for (let x = -canopyR; x <= canopyR; x++)
    for (let y = 8; y <= 8 + canopyR * 2; y++)
      for (let z = -canopyR; z <= canopyR; z++) {
        const dx = x, dy = y - 11, dz = z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > canopyR * canopyR + 1) continue;
        let c: number = rand() < 0.5 ? PALETTE.leaf : PALETTE.leafDark;
        if (d2 > (canopyR - 1) * (canopyR - 1)) c = mixColor(c, PALETTE.leafLight, 0.35);
        solid.push({ x, y, z, color: c });
      }

  // ripe fruit dots scattered through the canopy
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1 + rand() * (canopyR - 1);
    solid.push({
      x: Math.round(Math.cos(a) * r),
      y: 9 + Math.round(rand() * 4),
      z: Math.round(Math.sin(a) * r),
      s: 0.6, color: PALETTE.fruitRed,
    });
  }

  // grass tuft at the base
  solid.push({ x: 0, y: 0.5, z: 0, s: 0.4, color: PALETTE.grass });

  return solidMesh(solid);
}
