/**
 * Interior equipment builders for the environments lane — benches, flood
 * tables, rack rows, DWC rafts, fish tanks, NFT benches, ducting, climate and
 * control boxes — sized from quality/RESEARCH-CEA-ENVIRONMENTS.md Part B.
 * Every maker returns a fresh THREE.Object3D centered at the origin in XZ
 * with the ground plane at y = 0 (1 voxel = 10 cm), built from seeded rng +
 * PALETTE-derived tones + merged voxel geometry. No lights, no caches, no
 * InstancedMesh; glow reads via unlit basic-material vertex colors.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, weighted } from '../structures/shared';
import { T, cylShell, disc, ductX, glowMesh, paneMesh, solidMesh } from './kit';

// ---------------------------------------------------------------------------
// Cedar/aluminum growing bench — 0.7 m deep top at 0.8 m (#31)
// ---------------------------------------------------------------------------

export function makeBench({ wM = 1.8 }: { wM?: number } = {}): THREE.Object3D {
  const rand = rng(6101);
  const solid: Voxel[] = [];
  const L = Math.max(12, Math.round(wM * 10));
  const D = 7;
  const x0 = -L / 2;

  // aluminum legs with feet
  for (const [lx, lz] of [[x0 + 1, 1], [x0 + L - 1, 1], [x0 + 1, D - 1], [x0 + L - 1, D - 1]] as Array<[number, number]>)
    for (let y = 0.5; y <= 7.2; y += 1)
      solid.push({ x: lx, y, z: lz - D / 2, s: 0.85, color: y % 3 === 0 ? PALETTE.metalDark : PALETTE.metal });

  // cedar slat top with air gaps (rows along x)
  for (let x = x0 + 0.5; x <= x0 + L - 0.5; x += 1.5)
    for (let z = -D / 2 + 0.7; z <= D / 2 - 0.7; z += 1.5)
      solid.push({ x, y: 8, z, s: 1.45, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
  // rim rails
  for (let x = x0 + 0.5; x <= x0 + L - 0.5; x += 1.5)
    for (const z of [-D / 2 + 0.7, D / 2 - 0.7])
      solid.push({ x, y: 8.55, z, s: 1.0, color: C.postWood });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Ebb-and-flood table — 2.5 × 1.3 m watertight tray on legs (#17)
// ---------------------------------------------------------------------------

export function makeFloodTable({ wM = 2.5 }: { wM?: number } = {}): THREE.Object3D {
  const rand = rng(6201);
  const solid: Voxel[] = [];
  const L = Math.max(14, Math.round(wM * 10));
  const D = Math.max(6, Math.min(13, Math.round(L * 0.52)));
  const x0 = -L / 2;

  // slim legs
  for (const lx of [x0 + 2, x0 + L - 2])
    for (const lz of [-D / 2 + 2, D / 2 - 2])
      for (let y = 0.5; y <= 6; y += 1)
        solid.push({ x: lx, y, z: lz, s: 0.9, color: y % 3 === 0 ? PALETTE.metalDark : PALETTE.metal });

  // white tray: floor + raised rim walls
  for (let x = x0 + 0.6; x <= x0 + L - 0.6; x += 1.4)
    for (let z = -D / 2 + 1; z <= D / 2 - 1; z += 1.4)
      solid.push({ x, y: 7, z, s: 1.35, color: rand() < 0.1 ? mixColor(T.trayWhite, PALETTE.gravel, 0.14) : T.trayWhite });
  for (let x = x0 + 0.6; x <= x0 + L - 0.6; x += 1.4)
    for (const z of [-D / 2 + 1, D / 2 - 1])
      solid.push({ x, y: 7.7, z, s: 1.35, color: T.trayWhite });
  for (let z = -D / 2 + 1.6; z <= D / 2 - 1.6; z += 1.4)
    for (const x of [x0 + 0.6, x0 + L - 0.6])
      solid.push({ x, y: 7.7, z, s: 1.35, color: T.trayWhite });
  // flood water glinting across the floor + drain fitting
  for (let x = x0 + 2.4; x <= x0 + L - 2.4; x += 2.2)
    for (let z = -D / 2 + 2.6; z <= D / 2 - 2.6; z += 2.2)
      if (rand() < 0.5)
        solid.push({ x, y: 7.5, z, s: 1.1, color: T.waterEdge });
  solid.push({ x: x0 + 1.6, y: 7.6, z: 0, s: 0.8, color: PALETTE.metalDark });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Multi-tier rack row — posts, decks, 1020 trays, LED strips, greens carpet
// (#26, PSU 60 cm tier pitch)
// ---------------------------------------------------------------------------

export interface RackOpts {
  wM?: number;
  tiers?: number;
  glow?: 'pink' | 'warm';
  canopy?: boolean;
}

export function makeRackRow({ wM = 2.4, tiers = 4, glow = 'warm', canopy = true }: RackOpts = {}): THREE.Object3D {
  const rand = rng(6301);
  const solid: Voxel[] = [];
  const lit: Voxel[] = [];
  const L = Math.max(12, Math.round(wM * 10));
  const D = 6;
  const nT = Math.max(2, Math.min(6, tiers));
  const topY = 3 + (nT - 1) * 5.5 + 2.5;
  const x0 = -L / 2;

  // uprights at the ends and every ~1.2 m
  const postXs: number[] = [x0 + 0.9];
  for (let x = x0 + 12; x < x0 + L - 5; x += 12) postXs.push(x);
  if (x0 + L - 0.9 - postXs[postXs.length - 1] > 4) postXs.push(x0 + L - 0.9);
  for (const px of postXs)
    for (const pz of [-D / 2 + 0.9, D / 2 - 0.9])
      for (let y = 0.5; y <= topY; y += 1.1)
        solid.push({ x: px, y, z: pz, s: 1.05, color: Math.round(y * 10) % 33 < 11 ? PALETTE.metalDark : PALETTE.iron });

  for (let k = 0; k < nT; k++) {
    const y = 3 + k * 5.5;
    // slatted deck
    for (let x = x0 + 0.5; x <= x0 + L - 0.5; x += 1.6)
      for (let z = -D / 2 + 0.6; z <= D / 2 - 0.6; z += 1.6)
        solid.push({ x, y, z, s: 1.5, color: rand() < 0.15 ? PALETTE.metalDark : PALETTE.metal });
    // LED strip under the deck above the canopy
    const hot = glow === 'pink' ? T.glowPinkHot : T.glowWarmHot;
    const mild = glow === 'pink' ? T.glowPink : T.glowWarm;
    let gi = 0;
    for (let x = x0 + 1.2; x <= x0 + L - 1.2; x += 2.2, gi++)
      lit.push({ x, y: y - 0.6, z: 0, s: 1.3, color: gi % 3 === 1 ? hot : mild });
    // trays + greens lattice
    for (let x = x0 + 2; x <= x0 + L - 5; x += 6.4)
      for (const tz of [-D / 2 + 1.7, D / 2 - 1.7]) {
        for (let ix = 0; ix < 5; ix++)
          for (let iz = 0; iz < 2; iz++)
            solid.push({ x: x + ix * 1.05, y: y + 0.45, z: tz - 0.5 + iz, s: 1.0, color: T.trayWhite });
        if (canopy)
          for (let ix = 0; ix < 4; ix++)
            for (let iz = 0; iz < 2; iz++)
              if (rand() < 0.85)
                solid.push({
                  x: x + 0.5 + ix * 1.3, y: y + 1.15, z: tz - 0.5 + iz * 1.4, s: 0.95,
                  color: weighted([[PALETTE.leaf, 0.5], [PALETTE.leafLight, 0.3], [PALETTE.leafYoung, 0.2]], rand()),
                });
      }
  }
  // top rail + a small driver box
  for (let z = -D / 2 + 0.6; z <= D / 2 - 0.6; z += 1.6)
    solid.push({ x: x0 + 1.5, y: topY + 1, z, s: 1.2, color: PALETTE.metalDark });

  return group([solidMesh(solid), glowMesh(lit)]);
}

// ---------------------------------------------------------------------------
// DWC raft pond — liner rim, water plane, floating white rafts with lettuce
// holes, bubble streams (#19, Cornell raft dims)
// ---------------------------------------------------------------------------

export function makeDwcRaft({ wM = 2.4, dM = 1.2 }: { wM?: number; dM?: number } = {}): THREE.Object3D {
  const rand = rng(6401);
  const solid: Voxel[] = [];
  const W = Math.max(14, Math.round(wM * 10));
  const D = Math.max(10, Math.round(dM * 10));

  // pond liner rim
  for (let ix = 0; ix < W / 2; ix++)
    for (const z of [-D / 2 + 1, D / 2 - 1]) {
      const x = -W / 2 + (ix + 0.5) * 2;
      solid.push({ x, y: 1.2, z, s: 2.1, color: weighted([[PALETTE.soilDark, 0.5], [PALETTE.black, 0.3], [PALETTE.mulch, 0.2]], rand()) });
    }
  for (let iz = 1; iz < D / 2; iz++)
    for (const x of [-W / 2 + 1, W / 2 - 1]) {
      const z = -D / 2 + (iz + 0.5) * 2;
      solid.push({ x, y: 1.2, z, s: 2.1, color: weighted([[PALETTE.soilDark, 0.5], [PALETTE.black, 0.3], [PALETTE.mulch, 0.2]], rand()) });
    }
  // water surface, deeper toward the middle
  for (let ix = 1; ix < W / 2 - 1; ix++)
    for (let iz = 1; iz < D / 2 - 1; iz++) {
      const x = -W / 2 + (ix + 0.5) * 2;
      const z = -D / 2 + (iz + 0.5) * 2;
      const deep = Math.abs(x) < W * 0.22 && Math.abs(z) < D * 0.2;
      solid.push({ x, y: 1.5, z, s: 2.05, color: deep ? PALETTE.waterDeep : PALETTE.water });
    }

  // floating rafts: 1.2 × 0.6 m boards tiling most of the pond, leaving an
  // open-water band at the corners where the diffusers bubble
  for (let rx = -W / 2 + 2.4; rx <= W / 2 - 8; rx += 13.5)
    for (let rz = -D / 2 + 1.8; rz + 3 <= D / 2 - 1.2; rz += 4) {
      for (let ix = 0; ix < 6; ix++)
        for (let iz = 0; iz < 3; iz++)
          solid.push({ x: rx + ix * 1.15, y: 2.2, z: rz + iz * 1.15, s: 1.2, color: T.trayWhite });
      for (let ix = 0; ix < 5; ix++)
        for (let iz = 0; iz < 2; iz++) {
          const hx2 = rx + 0.6 + ix * 1.15;
          const hz2 = rz + 0.6 + iz * 1.15 + 0.5;
          solid.push({ x: hx2, y: 2.5, z: hz2, s: 0.7, color: PALETTE.soilDark }); // net pot
          solid.push({
            x: hx2, y: 3.0, z: hz2, s: 0.95,
            color: weighted([[PALETTE.leafLight, 0.45], [PALETTE.leaf, 0.4], [PALETTE.leafYoung, 0.15]], rand()),
          });
        }
    }
  // bubble streams roiling at the open-water corners (aerated ponds)
  for (const [bx, bz] of [[-(W / 2 - 2.2), D / 2 - 2.2], [W / 2 - 2.2, -(D / 2 - 2.2)]] as Array<[number, number]>)
    for (let y = 0.6; y <= 1.5; y += 0.45)
      solid.push({ x: bx + (Math.round(y * 10) % 3 - 1) * 0.35, y, z: bz, s: 0.4, color: PALETTE.waterLight });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Round fish tank — royal blue, central drain standpipe, pipework (A12)
// ---------------------------------------------------------------------------

export function makeFishTank({ diaM = 1.2 }: { diaM?: number } = {}): THREE.Object3D {
  const rand = rng(6501);
  const solid: Voxel[] = [];
  const r = Math.max(5, Math.round(diaM * 5));
  const H = Math.max(8, Math.round(r * 0.85));

  // wall rings with a sun-side sheen + darker base band
  cylShell(solid, 0, 0, 0.4, H - 0.4, r, (y, a) => {
    if (y > H - 1.6) return T.tankBlueDark;
    if (y < 1.8) return mixColor(T.tankBlue, PALETTE.black, 0.32);
    return Math.cos(a) > 0.35 ? mixColor(T.tankBlue, PALETTE.waterLight, 0.28) : T.tankBlue;
  }, 1);
  // rim lip (kissing cubes so the ring reads solid)
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    solid.push({ x: Math.cos(ang) * (r + 0.35), y: H, z: Math.sin(ang) * (r + 0.35), s: 2.6, color: T.tankBlueDark });
  }
  // water disc + central drain standpipe
  disc(solid, 0, 0, H - 1.3, r - 0.8, 1.6, (dx, dz) => (dx * dx + dz * dz < (r - 3) ** 2 ? PALETTE.waterDeep : PALETTE.water));
  cylShell(solid, 0, 0, H - 1.4, H + 1.8, 0.75, () => PALETTE.metalDark, 1);
  solid.push({ x: 0, y: H + 2.1, z: 0, s: 1.0, color: PALETTE.metal });
  // outlet pipework to a small pump box
  for (let x = r - 0.5; x <= r + 4; x += 1)
    solid.push({ x, y: H - 3, z: 0, s: 0.85, color: T.pipeBlack });
  solid.push({ x: r + 5.2, y: H - 3.6, z: 0, s: 2.0, color: PALETTE.charcoal });
  solid.push({ x: r + 5.2, y: H - 2.9, z: 0, s: 0.5, color: T.ledGreen });
  // fish-food sprinkle hint on the water
  for (let i = 0; i < 5; i++)
    solid.push({
      x: (rand() - 0.5) * (r - 2), y: H - 0.9, z: (rand() - 0.5) * (r - 2),
      s: 0.35, color: PALETTE.straw,
    });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// NFT channel bench — sloped white gullies, lettuce lattice, collector +
// reservoir drum under the low end (#18)
// ---------------------------------------------------------------------------

export function makeNftBench({ wM = 2.4, rows = 3 }: { wM?: number; rows?: number } = {}): THREE.Object3D {
  const rand = rng(6601);
  const solid: Voxel[] = [];
  const L = Math.max(16, Math.round(wM * 10));
  const nR = Math.max(1, Math.min(4, rows));
  const x0 = -L / 2;

  // bench legs + cross frame
  for (const lx of [x0 + 2, 0, x0 + L - 2])
    for (const lz of [-3.5, 3.5])
      for (let y = 0.5; y <= 6; y += 1)
        solid.push({ x: lx, y, z: lz, s: 0.85, color: y % 3 === 0 ? PALETTE.metalDark : PALETTE.metal });
  for (const lz of [-3.5, 3.5])
    for (let x = x0 + 1; x <= x0 + L - 1; x += 1.6)
      solid.push({ x, y: 6.4, z: lz, s: 1.1, color: PALETTE.metalDark });

  // gently sloped channels (≈1% fall) with plants on a 20 cm lattice
  for (let r2 = 0; r2 < nR; r2++) {
    const z = (r2 - (nR - 1) / 2) * 2.8;
    const yTop = (x: number): number => 7.5 - ((x - x0) / L) * 0.7;
    for (let x = x0 + 0.6; x <= x0 + L - 0.6; x += 1.1) {
      const t = yTop(x);
      solid.push({ x, y: t - 0.55, z, s: 1.1, color: rand() < 0.2 ? mixColor(T.trayWhite, PALETTE.gravel, 0.16) : T.trayWhite });
      for (const rz of [-0.62, 0.62])
        solid.push({ x, y: t, z: z + rz, s: 0.62, color: T.trayWhite });
    }
    for (let x = x0 + 1.6; x <= x0 + L - 1.6; x += 2) {
      const t = yTop(x);
      solid.push({ x, y: t + 0.1, z, s: 0.6, color: PALETTE.soilDark }); // net pot hole
      solid.push({
        x, y: t + 0.5, z, s: 0.85,
        color: weighted([[PALETTE.leafLight, 0.45], [PALETTE.leaf, 0.4], [PALETTE.leafYoung, 0.15]], rand()),
      });
      if (rand() < 0.4) solid.push({ x, y: t + 0.95, z, s: 0.5, color: PALETTE.leaf });
    }
  }

  // collector pipe at the low end + drop to a reservoir drum + pump
  for (let z = -3.6; z <= 3.6; z += 1.1)
    solid.push({ x: x0 + L + 0.4, y: 7.2, z, s: 1.0, color: T.pipeBlack });
  cylShell(solid, x0 + L - 2.4, 0, 0.5, 6.2, 2.1, (y) => (Math.floor(y) % 4 === 0 ? mixColor(T.drumBlue, PALETTE.black, 0.25) : T.drumBlue), 1.1);
  disc(solid, x0 + L - 2.4, 0, 6.5, 1.7, 1.5, () => PALETTE.waterDeep);
  solid.push({ x: x0 + L - 2.4, y: 7.1, z: 0, s: 0.9, color: PALETTE.charcoal });
  solid.push({ x: x0 + L - 5, y: 0.9, z: 3.4, s: 1.4, color: PALETTE.charcoal });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Flex duct run — silver segmented tube, hanging straps, louver end plate
// ---------------------------------------------------------------------------

export function makeDuctRun({ wM = 2 }: { wM?: number } = {}): THREE.Object3D {
  const L = Math.max(10, Math.round(wM * 10));
  const solid: Voxel[] = [];
  ductX(solid, -L / 2 + 0.8, L / 2 - 0.8, 0, 0, 1.5, (x, i) => {
    void x;
    return i % 4 === 0 ? PALETTE.metal : T.ductLight;
  }, 1.15);
  // hanging straps rising to a ceiling that isn't there (dollhouse)
  for (const sx of [-L / 2 + 3, 0, L / 2 - 3])
    for (let y = 1.3; y <= 5.6; y += 0.8)
      solid.push({ x: sx, y, z: 0, s: 0.3, color: PALETTE.metalDark });
  // wall louver plate at one end
  for (let y = -1.6; y <= 1.6; y += 0.9)
    for (let z = -1.6; z <= 1.6; z += 0.9)
      solid.push({ x: L / 2 + 0.2, y, z, s: 0.9, color: mixColor(PALETTE.metal, PALETTE.white, 0.35) });
  for (let y = -1.2; y <= 1.2; y += 0.8)
    solid.push({ x: L / 2 + 0.8, y, z: 0, s: 0.7, color: T.panelSeam });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Dehumidifier — 0.35 × 0.35 × 0.6 m floor unit with drip bucket (#8)
// ---------------------------------------------------------------------------

export function makeDehumidifier(): THREE.Object3D {
  const rand = rng(6701);
  const solid: Voxel[] = [];
  const caseTone = (): number => (rand() < 0.12 ? mixColor(C.frameWhite, PALETTE.gravel, 0.25) : C.frameWhite);

  // case shell (open back not visible), front = +Z
  for (let x = -1.9; x <= 1.9; x += 1)
    for (let y = 0.5; y <= 5.8; y += 1)
      for (let z = -1.9; z <= 1.9; z += 1) {
        const shell = x < -1.4 || x > 1.4 || y < 1 || y > 5.4 || z < -1.4 || z > 1.4;
        if (shell) solid.push({ x, y, z, s: 0.95, color: caseTone() });
      }
  // intake grille across the front + top outlet
  for (let x = -1.4; x <= 1.4; x += 0.6) {
    solid.push({ x, y: 3.4, z: 2.1, s: 0.45, color: T.panelSeam });
    solid.push({ x, y: 4.1, z: 2.1, s: 0.45, color: T.panelSeam });
    solid.push({ x, y: 5.9, z: 0.7, s: 0.45, color: T.panelSeam });
  }
  // drip bucket poking out of the front bottom + handle
  for (let x = -1.1; x <= 1.1; x += 0.85)
    for (let y = 0.6; y <= 1.8; y += 0.85)
      solid.push({ x, y, z: 2.6, s: 0.8, color: mixColor(PALETTE.glassDim, PALETTE.metal, 0.3) });
  solid.push({ x: 0, y: 2.3, z: 2.7, s: 0.5, color: PALETTE.metalDark });
  // hose trailing to a drain + status LED
  for (let i = 0; i < 6; i++)
    solid.push({ x: -2.4 - i * 0.7, y: 0.5, z: 1.4 + i * 0.5, s: 0.32, color: PALETTE.black });
  solid.push({ x: 1.5, y: 4.6, z: 2.1, s: 0.35, color: T.ledGreen });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// CO2 tank — 20 lb cylinder + brass regulator + gauges (#33)
// ---------------------------------------------------------------------------

export function makeCo2Tank(): THREE.Object3D {
  const solid: Voxel[] = [];
  // cylinder with a vertical highlight column
  cylShell(solid, 0, 0, 0.9, 9.4, 1.5, (_y, a) => {
    const c = Math.cos(a);
    if (c > 0.72) return mixColor(PALETTE.metal, PALETTE.white, 0.4);
    if (c < -0.75) return PALETTE.ironDark;
    return PALETTE.iron;
  }, 1);
  // base ring + neck + valve
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    solid.push({ x: Math.cos(ang) * 1.75, y: 0.45, z: Math.sin(ang) * 1.75, s: 1.05, color: PALETTE.ironDark });
  }
  cylShell(solid, 0, 0, 9.4, 10.6, 0.7, () => PALETTE.metalDark, 1);
  // brass regulator block + two gauges + outlet stub
  solid.push({ x: 0, y: 11.3, z: 0, s: 1.6, color: PALETTE.copper });
  solid.push({ x: -1.1, y: 11.6, z: 0.5, s: 0.75, color: PALETTE.white });
  solid.push({ x: 1.1, y: 11.6, z: 0.5, s: 0.75, color: PALETTE.white });
  solid.push({ x: 0, y: 10.4, z: 1.1, s: 0.5, color: PALETTE.copper });
  // slim line dropping to a solenoid box at the base
  for (let y = 10.2; y >= 2.4; y -= 0.9)
    solid.push({ x: 1.9, y, z: 0.6, s: 0.3, color: T.pipeBlack });
  solid.push({ x: 1.9, y: 1.6, z: 0.6, s: 1.1, color: PALETTE.charcoal });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Controller panel — wall box with a glowing screen face (#13)
// ---------------------------------------------------------------------------

export function makeControllerPanel(): THREE.Object3D {
  const solid: Voxel[] = [];
  const glow: Voxel[] = [];
  // enclosure (front = +Z), conduit up and down
  for (let x = -1.4; x <= 1.4; x += 0.9)
    for (let y = -1; y <= 1; y += 0.9)
      solid.push({ x, y, z: 0.4, s: 0.9, color: PALETTE.charcoal });
  glow.push({ x: -0.3, y: 0.25, z: 0.95, s: 1.1, color: T.screenGlow });
  glow.push({ x: 0.9, y: -0.4, z: 0.95, s: 0.45, color: T.ledGreen });
  solid.push({ x: 0.9, y: 0.4, z: 0.95, s: 0.4, color: PALETTE.metalDark });
  for (let y = 1.2; y <= 3.4; y += 0.8)
    solid.push({ x: -1, y, z: 0, s: 0.5, color: T.panelSeam });
  for (let y = -1.4; y >= -2.6; y -= 0.8)
    solid.push({ x: -1, y, z: 0, s: 0.5, color: T.panelSeam });
  return group([solidMesh(solid), glowMesh(glow)]);
}

// ---------------------------------------------------------------------------
// Swirl separator — blue cone-bottom filter for aquaponics (A12)
// ---------------------------------------------------------------------------

export function makeSwirlFilter(): THREE.Object3D {
  const solid: Voxel[] = [];
  // cylinder body + tapering cone rings toward the drain
  cylShell(solid, 0, 0, 4.2, 10.8, 2.6, (_y, a) => (Math.cos(a) > 0.3 ? mixColor(T.tankBlue, PALETTE.waterLight, 0.2) : T.tankBlue), 1.1);
  for (let y = 0.8; y <= 4; y += 0.9) {
    const r = 1.1 + ((y - 0.8) / 3.2) * 1.5;
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      solid.push({ x: Math.cos(ang) * r, y, z: Math.sin(ang) * r, s: 1.0, color: T.tankBlueDark });
    }
  }
  // rim + inlet elbow from above + low outlet with a valve wheel
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    solid.push({ x: Math.cos(ang) * 2.85, y: 11.2, z: Math.sin(ang) * 2.85, s: 1.5, color: T.tankBlueDark });
  }
  for (let x = -5.4; x <= -2.4; x += 1)
    solid.push({ x, y: 12.2, z: 0, s: 0.85, color: T.pipeBlack });
  solid.push({ x: -2.4, y: 11.6, z: 0, s: 1.0, color: T.pipeBlack });
  for (let x = 2.4; x <= 5; x += 1)
    solid.push({ x, y: 2.4, z: 0, s: 0.85, color: T.pipeBlack });
  solid.push({ x: 5.4, y: 3.1, z: 0, s: 0.9, color: PALETTE.metalDark });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Nutrient dosing barrels — A/B concentrate drums + pump box (#35)
// ---------------------------------------------------------------------------

export function makeDosingBarrels({ count = 3 }: { count?: number } = {}): THREE.Object3D {
  const rand = rng(6801);
  const solid: Voxel[] = [];
  const n = Math.max(1, Math.min(4, count));
  const tones = [T.drumBlue, mixColor(PALETTE.black, PALETTE.charcoal, 0.3), C.frameWhite];
  const caps = [PALETTE.flowerYellow, PALETTE.pepperRed, PALETTE.leafLight];
  for (let i = 0; i < n; i++) {
    const cx = (i - (n - 1) / 2) * 7.2;
    cylShell(solid, cx, 0, 0.5, 8.6, 2.9, (y) => (Math.floor(y) % 3 === 0 ? mixColor(tones[i], PALETTE.black, 0.18) : tones[i]), 1.1);
    disc(solid, cx, 0, 9.0, 2.5, 1.5, () => mixColor(tones[i], PALETTE.black, 0.1));
    solid.push({ x: cx, y: 9.6, z: 0, s: 1.0, color: caps[i] }); // colored cap code
    // drip tray under each drum (flat plate, four thin cubes)
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as Array<[number, number]>)
      solid.push({ x: cx + dx, y: 0.3, z: dz, s: 3.0, color: T.panelSeam });
    if (rand() < 0.8) solid.push({ x: cx + 1.2, y: 9.3, z: 1.2, s: 0.4, color: PALETTE.metalDark });
  }
  // dosing pump box + tube runs between drums
  solid.push({ x: 0, y: 1.4, z: 5.4, s: 2.6, color: PALETTE.charcoal });
  solid.push({ x: 0, y: 2.3, z: 5.9, s: 0.5, color: T.ledGreen });
  for (const tx of [-(n - 1) / 2 * 7.2, ((n - 1) / 2) * 7.2])
    for (let z = 2.6; z <= 5; z += 0.8)
      solid.push({ x: tx, y: 2.4, z, s: 0.3, color: PALETTE.black });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Slim storage tank — white vertical silo for container-farm water stores
// ---------------------------------------------------------------------------

export function makeStorageTank(): THREE.Object3D {
  const solid: Voxel[] = [];
  cylShell(solid, 0, 0, 0.5, 15.4, 2.2, (y, a) => {
    if (Math.floor(y) % 5 === 0) return mixColor(C.frameWhite, PALETTE.gravelDark, 0.3);
    return Math.cos(a) > 0.5 ? mixColor(C.frameWhite, PALETTE.white, 0.4) : C.frameWhite;
  }, 1.1);
  disc(solid, 0, 0, 15.9, 1.9, 1.4, () => mixColor(C.frameWhite, PALETTE.gravel, 0.2));
  solid.push({ x: 0, y: 16.5, z: 0, s: 1.0, color: PALETTE.metalDark });
  solid.push({ x: 2.6, y: 1.4, z: 0, s: 0.8, color: T.pipeBlack });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Wire grow shelf — consumer chrome rack, 3 glowing tiers, domes, timer
// strip (A8)
// ---------------------------------------------------------------------------

export function makeWireShelf(): THREE.Object3D {
  const rand = rng(6901);
  const solid: Voxel[] = [];
  const dome: Voxel[] = [];
  const lit: Voxel[] = [];
  const W = 5;
  const D = 4;
  const H = 18;

  // chrome posts + castors
  for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]] as Array<[number, number]>) {
    solid.push({ x: px, y: 0.3, z: pz, s: 0.7, color: PALETTE.metalDark });
    for (let y = 1; y <= H; y += 0.9)
      solid.push({ x: px, y, z: pz, s: 0.55, color: mixColor(PALETTE.metal, PALETTE.white, 0.45) });
  }
  // wire shelves: slim slats with air gaps between
  for (const y of [4.5, 10, 15.5]) {
    for (let x = -W / 2 + 0.4; x <= W / 2 - 0.4; x += 1.2)
      for (let z = -D / 2 + 0.4; z <= D / 2 - 0.4; z += 1.2)
        solid.push({ x, y, z, s: 1.05, color: mixColor(PALETTE.metal, PALETTE.white, 0.3) });
    // trays with greens on every tier
    for (const tz of [-1, 1]) {
      for (let ix = 0; ix < 4; ix++)
        for (let iz = 0; iz < 2; iz++)
          solid.push({ x: -2 + ix * 1.05, y: y + 0.4, z: tz - 0.5 + iz, s: 1.0, color: T.trayWhite });
      for (let ix = 0; ix < 4; ix++)
        for (let iz = 0; iz < 2; iz++)
          if (rand() < 0.85)
            solid.push({
              x: -2 + ix * 1.05, y: y + 1.05, z: tz - 0.5 + iz, s: 0.8,
              color: weighted([[PALETTE.leafLight, 0.4], [PALETTE.leafYoung, 0.35], [PALETTE.leaf, 0.25]], rand()),
            });
    }
    // LED shop bar under each shelf
    let gi = 0;
    for (let x = -W / 2 + 0.8; x <= W / 2 - 0.8; x += 1.6, gi++)
      lit.push({ x, y: y - 0.35, z: 0, s: 1.1, color: gi % 2 === 0 ? T.glowWarmHot : T.glowWarm });
  }
  // clear humidity dome fogged on the lowest tier
  for (let iy = 0; iy < 3; iy++) {
    const w = [2.4, 2.0, 1.0][iy];
    for (let x = -w; x <= w; x += 1)
      for (let z = -w * 0.6; z <= w * 0.6; z += 1)
        dome.push({ x, y: 5.4 + iy * 0.8, z, s: 0.95, color: T.glassPane });
  }
  // timer power strip dangling at the side + cord
  solid.push({ x: W / 2 + 0.9, y: 12.5, z: 0, s: 1.5, color: PALETTE.charcoal });
  solid.push({ x: W / 2 + 0.9, y: 12.5, z: 0.95, s: 0.7, color: T.screenGlow });
  for (let y = 12; y >= 5; y -= 0.9)
    solid.push({ x: W / 2 + 0.9, y, z: 0.4, s: 0.28, color: PALETTE.black });
  for (let y = 4.6; y >= 1; y -= 0.9)
    solid.push({ x: W / 2 + 0.7, y, z: 1.2, s: 0.28, color: PALETTE.black });

  return group([solidMesh(solid), paneMesh(dome, 0.42, PALETTE.glass), glowMesh(lit)]);
}

// ---------------------------------------------------------------------------
// Fabric pot — black felt grow bag with soil + starter plant (A6b)
// ---------------------------------------------------------------------------

export function makeFabricPot({ size = 1 }: { size?: number } = {}): THREE.Object3D {
  const rand = rng(7001 + Math.round(size * 10));
  const solid: Voxel[] = [];
  const r = 2.4 * size;
  const H = 3.6 * size;
  // tapered wall rings, felt read via two-tone dither
  for (let iy = 0; iy < H; iy += 1) {
    const rr = r * (0.82 + 0.18 * (iy / H));
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      solid.push({
        x: Math.cos(ang) * rr, y: iy + 0.5, z: Math.sin(ang) * rr,
        s: 1.3, color: rand() < 0.3 ? mixColor(PALETTE.black, PALETTE.charcoal, 0.5) : PALETTE.charcoal,
      });
    }
  }
  // soil crown + handles
  disc(solid, 0, 0, H - 0.3, r * 0.78, 1.1, () => weighted([[PALETTE.soilDark, 0.6], [PALETTE.soil, 0.4]], rand()));
  for (const hx of [-r - 0.5, r + 0.5])
    solid.push({ x: hx, y: H - 1, z: 0, s: 0.6, color: mixColor(PALETTE.black, PALETTE.charcoal, 0.4) });
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Diorama floor plate — soil / concrete / gravel / mylar styles
// ---------------------------------------------------------------------------

export type FloorStyle = 'soil' | 'concrete' | 'gravel' | 'mylar';

export function makeFloorPlate({ wM, dM, style }: { wM: number; dM: number; style: FloorStyle }): THREE.Object3D {
  const seeds: Record<FloorStyle, number> = { soil: 7101, concrete: 7102, gravel: 7103, mylar: 7104 };
  const rand = rng(seeds[style]);
  const solid: Voxel[] = [];
  const wV = Math.max(10, Math.round(wM * 10));
  const dV = Math.max(10, Math.round(dM * 10));
  const st = wV * dV > 24000 ? 3 : 2;
  for (let ix = 0; ix < Math.ceil(wV / st); ix++)
    for (let iz = 0; iz < Math.ceil(dV / st); iz++) {
      const x = -wV / 2 + (ix + 0.5) * st;
      const z = -dV / 2 + (iz + 0.5) * st;
      let c: number;
      switch (style) {
        case 'soil':
          c = weighted([[PALETTE.soilDark, 0.45], [PALETTE.soil, 0.4], [PALETTE.mulch, 0.15]], rand());
          if ((x + wV / 2) % 6 < st) c = mixColor(c, PALETTE.black, 0.18); // furrow rows
          break;
        case 'concrete':
          c = weighted([[T.concrete, 0.55], [T.concreteLight, 0.3], [PALETTE.gravelDark, 0.15]], rand());
          if ((x + wV / 2) % 14 < st || (z + dV / 2) % 14 < st) c = mixColor(T.concrete, PALETTE.black, 0.25);
          break;
        case 'gravel':
          c = weighted([[PALETTE.gravel, 0.4], [PALETTE.gravelDark, 0.35], [PALETTE.stone, 0.25]], rand());
          break;
        case 'mylar':
          c = rand() < 0.2 ? T.mylarSeam : T.mylar;
          if ((x + wV / 2) % 10 < st || (z + dV / 2) % 10 < st) c = PALETTE.metal;
          break;
      }
      solid.push({ x, y: st * 0.42, z, s: st, color: c });
    }
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Floor tape lines — dashed aisle markings (A9e)
// ---------------------------------------------------------------------------

export function makeTapeLines({ wM, dM }: { wM: number; dM: number }): THREE.Object3D {
  const solid: Voxel[] = [];
  for (let z = -dM * 5 + 2; z <= dM * 5 - 2; z += 2.2)
    solid.push({ x: 0, y: 0.5, z, s: 0.85, color: T.tape });
  for (let x = -wM * 5 + 2; x <= wM * 5 - 2; x += 2.2)
    solid.push({ x, y: 0.5, z: 0, s: 0.85, color: T.tape });
  return solidMesh(solid);
}
