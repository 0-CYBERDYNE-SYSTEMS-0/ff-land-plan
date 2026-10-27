/**
 * Lane D tools & props — honest voxel construction: every tool reads as the
 * real object (spout+rose+handle, tray+wheel+legs+handles, shaped tool heads)
 * with a wood/metal palette split. Static still-lifes; the showcase adds a
 * grounding blob shadow.
 */
import * as THREE from 'three';
import { PALETTE, mixColor, fill, rng, type Voxel } from '@/creative/voxel';
import { put, mirr, meshOf, savePoses } from './build';

function rootOf(name: string, ...meshes: THREE.Object3D[]): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  for (const m of meshes) root.add(m);
  savePoses(root);
  return root;
}

// ---------------------------------------------------------------------------
// Watering can — galvanized body, stepped spout + perforated rose, wood grips
// ---------------------------------------------------------------------------

export function buildWateringCan(): THREE.Group {
  const v: Voxel[] = [];
  const metal = PALETTE.metal;
  const iron = PALETTE.ironDark;
  const wood = PALETTE.wood;

  // body: squat cylinder-ish with a shoulder step and dark base band
  fill(v, -2, 1, -2, 2, 4, 2, metal);
  fill(v, -1, 5, -1, 1, 6, 1, metal);
  fill(v, -2, 1, -2, 2, 1, 2, iron);
  const sparkle = mixColor(metal, PALETTE.white, 0.3);
  const rd = rng(101);
  for (let y = 2; y <= 6; y++)
    for (const s of [1, -1]) {
      if (rd() > 0.82) put(v, s * 2.56, y + 0.3, 0, sparkle, 0.3);
      if (rd() > 0.82) put(v, 0, y + 0.7, s * 2.56, sparkle, 0.3);
    }
  // filler rim + dark throat — kept slim so the can's top reads as an
  // opening, not a heavy dark slab capping the silhouette
  put(v, 0, 6.85, 0, iron, 2.1);
  put(v, 0, 7.3, 0, PALETTE.charcoal, 0.95);
  // top bow handle with a turned-wood grip — posts rooted IN the throat rim,
  // every link overlapping the next (nothing floats)
  put(v, -1.15, 7.95, 0, iron, 0.62);
  put(v, 1.15, 7.95, 0, iron, 0.62);
  put(v, -0.6, 8.55, 0, iron, 0.58);
  put(v, 0.6, 8.55, 0, iron, 0.58);
  put(v, 0, 8.95, 0, wood, 1.0);
  // rear transverse grip — brackets anchored into the can shoulder, then the
  // wood grip overlapping both bracket tops
  mirr((s) => {
    put(v, s * 0.95, 6.05, -1.75, metal, 0.62);
    put(v, s * 1.15, 6.65, -2.25, metal, 0.62);
  });
  put(v, 0, 7.35, -2.6, wood, 1.9);
  // stepped spout climbing above the rim — overlapping voxels form a
  // continuous tube, rose (sprinkler head) capping the tip
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    put(v, 2.6 + f * 2.8, 2.0 + f * 5.6, 1.5 - f * 1.1, metal, 1.05 - f * 0.35);
  }
  // rose: wide cap plate with bright "hole" speckles
  put(v, 5.55, 8.15, 0.3, iron, 1.15);
  const rr = rng(103);
  for (let i = 0; i < 7; i++)
    put(v, 5.55 + (rr() - 0.5) * 0.7, 8.65, 0.3 + (rr() - 0.5) * 0.7, sparkle, 0.22);

  return rootOf('watering-can', meshOf(v));
}

// ---------------------------------------------------------------------------
// Wheelbarrow — plank tray w/ steel rim, spoked wheel, legs + long handles
// ---------------------------------------------------------------------------

export function buildWheelbarrow(): THREE.Group {
  const v: Voxel[] = [];
  const plank = PALETTE.plank;
  const plankL = PALETTE.plankLight;
  const iron = PALETTE.ironDark;
  const steel = PALETTE.metal;

  // tray: two stacked sections (taper look), dithered planks
  const rt = rng(113);
  for (let x = -2; x <= 2; x++)
    for (let z = -4; z <= 3; z++)
      for (let y = 4; y <= 5; y++) put(v, x, y, z, rt() > 0.72 ? plankL : plank);
  for (let x = -3; x <= 3; x++)
    for (let z = -5; z <= 4; z++)
      for (let y = 6; y <= 8; y++) {
        const rimRow = y === 8 && (Math.abs(x) === 3 || Math.abs(z) === 4 || z === -5);
        put(v, x, y, z, rimRow ? iron : rt() > 0.72 ? plankL : plank);
      }
  // steel corner straps
  mirr((s) => {
    fill(v, s * 3, 4, -5, s * 3, 8, -5, steel);
    fill(v, s * 3, 4, 4, s * 3, 8, 4, steel);
  });
  // handles: twin rails back to grips
  mirr((s) => {
    fill(v, s * 2, 5, -5, s * 2, 5, -8, PALETTE.wood);
    put(v, s * 2, 5.6, -8.6, PALETTE.plankLight, 0.95);
    // rear legs
    fill(v, s * 1.6, 0, -3.4, s * 1.6, 3.8, -3.4, PALETTE.woodDark, );
  });
  // wheel: octagon tire ring, plank spokes, hub, axle forks
  put(v, 0, 2.5, 5.5, PALETTE.plank, 1.3); // hub
  const ring: Array<[number, number]> = [[0, 2.4], [1.7, 1.7], [2.4, 0], [1.7, -1.7], [0, -2.4], [-1.7, -1.7], [-2.4, 0], [-1.7, 1.7]];
  for (const [rx, ry] of ring) put(v, rx, 2.5 + ry, 5.5, PALETTE.charcoal, 1.0);
  for (const [rx, ry] of [[1.15, 1.15], [-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15]] as Array<[number, number]>)
    put(v, rx, 2.5 + ry, 5.5, plankL, 0.55);
  put(v, 0, 2.5, 6.05, iron, 0.6); // axle
  mirr((s) => put(v, s * 0.95, 2.5, 5.1, steel, 0.7)); // forks

  return rootOf('wheelbarrow', meshOf(v));
}

// ---------------------------------------------------------------------------
// Hoe — planted in a soil mound; shaft, D-grip, L-shaped blade
// ---------------------------------------------------------------------------

export function buildHoe(): THREE.Group {
  const v: Voxel[] = [];
  // long wooden handle on a shallow diagonal: the top end rises to the upper left
  // and the lower end runs into a short socket just above the blade
  const top = [-18, 12, -4];
  const socket = [2, 2, 0];
  const n = 22;
  const rg = rng(137);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(top[0] + (socket[0] - top[0]) * t);
    const y = Math.round(top[1] + (socket[1] - top[1]) * t);
    const z = Math.round(top[2] + (socket[2] - top[2]) * t);
    // last two cells are the dark iron socket gripping the handle foot
    if (i >= n - 1) put(v, x, y, z, PALETTE.ironDark);
    else put(v, x, y, z, PALETTE.wood);
    if (i < n - 1 && rg() > 0.7) put(v, x, y + 0.5, z, PALETTE.woodDark, 0.3);
  }
  // short neck drops from the socket onto the blade
  put(v, 2, 1, 0, PALETTE.metalDark);
  // flat rectangular blade lying across the handle at ~90 degrees: 3 wide along
  // the handle, 9 long across it. Far column is the cutting edge (lit steel);
  // the column nearest the handle is the dark back
  for (let bx = 1; bx <= 3; bx++)
    for (let bz = -4; bz <= 4; bz++) {
      let c: number = PALETTE.metal;
      if (bx === 3) c = mixColor(PALETTE.metal, PALETTE.white, 0.5);
      else if (bx === 1) c = PALETTE.ironDark;
      put(v, bx, 0, bz, c);
    }

  return rootOf('hoe', meshOf(v));
}

// ---------------------------------------------------------------------------
// Pitchfork — standing tines-up in a flaked hay bale
// ---------------------------------------------------------------------------

export function buildPitchfork(): THREE.Group {
  const v: Voxel[] = [];
  // hay bale base with twine bands + flake seam
  const rb = rng(149);
  for (let x = -3; x <= 3; x++)
    for (let y = 0; y <= 3; y++)
      for (let z = -4; z <= 0; z++) put(v, x, y, z, rb() > 0.5 ? PALETTE.hay : PALETTE.straw);
  for (let y = 0; y <= 3; y++) {
    fill(v, -1, y, -4, -1, y, 0, PALETTE.woodDark);
    fill(v, 1, y, -4, 1, y, 0, PALETTE.woodDark);
  }
  const rs = rng(151);
  for (let x = -3; x <= 3; x++)
    for (let z = -4; z <= 0; z++) if (rs() > 0.5) put(v, x, 1.8 + rs() * 0.3, z, PALETTE.mulch, 0.5);
  // crossbar head on the bale face: a bar with a socket rising from its middle
  for (let x = -2; x <= 2; x++) put(v, x, 8, 0, PALETTE.metalDark, 1.0);
  put(v, 0, 9, 0, PALETTE.ironDark, 1.2); // socket collar
  // shaft welded up into the D-grip, socket seated on the crossbar
  fill(v, 0, 10, 0, 0, 20.8, 0, PALETTE.wood);
  mirr((s) => {
    put(v, s * 0.72, 21.0, 0, PALETTE.woodDark, 0.75);
    put(v, s * 0.78, 21.62, 0, PALETTE.woodDark, 0.72);
  });
  put(v, 0, 22.2, 0, PALETTE.wood, 1.9);
  // four separated tines dropping from the crossbar into the bale, each
  // tapering to a point; wide dark gaps between them
  for (const tx of [-2.1, -0.7, 0.7, 2.1]) {
    for (let ty = 7.5; ty >= 1.5; ty -= 0.5) put(v, tx, ty, 0, PALETTE.metal, 0.55);
    put(v, tx, 1.0, 0, PALETTE.metal, 0.4);
    put(v, tx, 0.6, 0, PALETTE.iron, 0.25); // point
  }

  return rootOf('pitchfork', meshOf(v));
}

// ---------------------------------------------------------------------------
// Seed bag — cinched burlap sack, stitched label, spill of seed corn
// ---------------------------------------------------------------------------

export function buildSeedBag(): THREE.Group {
  const v: Voxel[] = [];
  const cloth = mixColor(PALETTE.clay, PALETTE.sand, 0.45);
  const shade = mixColor(cloth, PALETTE.soil, 0.4);
  const rs = rng(163);
  fill(v, -2, 0, -1, 2, 1, 2, shade);
  for (let y = 2; y <= 5; y++)
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        if (y > 4 && Math.abs(x) === 2 && Math.abs(z) === 2) continue;
        put(v, x, y, z, rs() > 0.82 ? shade : cloth);
      }
  fill(v, -1, 6, -1, 1, 6, 1, cloth); // neck gather
  fill(v, -1, 7.5, -1, 1, 8.1, 1, shade); // rolled fold
  put(v, 0, 8.85, 0, PALETTE.straw, 0.8); // tie band
  put(v, 0.45, 9.45, 0.2, PALETTE.straw, 0.5); // knot tail
  // stitched label patch on the front face (overlapping voxels — gaps would
  // read as a window lattice)
  for (let x = -1; x <= 1; x++) for (let y = 3; y <= 5; y++) put(v, x, y, 2.14, PALETTE.cream, 1.05);
  for (const [sx, sy] of [[-1, 3], [1, 3], [-1, 5], [1, 5]] as Array<[number, number]>)
    put(v, sx, sy, 2.2, PALETTE.clay, 0.2);
  put(v, 0, 4, 2.24, PALETTE.stem, 0.34); // little seedling mark
  // spilled seeds at the base corner
  const rsp = rng(167);
  for (let i = 0; i < 16; i++)
    put(v, 2.6 + rsp() * 1.6, 0.25 + rsp() * 0.5, 0.6 + rsp() * 2.2, rsp() > 0.5 ? PALETTE.cornGold : PALETTE.wheat, 0.38);

  return rootOf('seed-bag', meshOf(v));
}

// ---------------------------------------------------------------------------
// Bucket — galvanized taper, banded rims, water surface, bail w/ wood grip
// ---------------------------------------------------------------------------

export function buildBucket(): THREE.Group {
  const v: Voxel[] = [];
  const metal = PALETTE.metal;
  const iron = PALETTE.ironDark;
  fill(v, -1, 0, -1, 1, 2, 1, metal); // narrow base
  fill(v, -1, 0, -1, 1, 0.6, 1, iron);
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++)
      for (let y = 2; y <= 5; y++) {
        if (Math.abs(x) !== 2 && Math.abs(z) !== 2) continue;
        put(v, x, y, z, metal);
      }
  // water surface sits clearly BELOW the rim: deep tone + small light glint
  put(v, 0, 3.5, 0, PALETTE.waterDeep, 3.4);
  put(v, 0.3, 5.0, 0.2, PALETTE.waterLight, 0.55);
  // rolled top rim: one continuous dark ring, plus a mid band
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) !== 2 && Math.abs(z) !== 2) continue;
      put(v, x, 5.35, z, iron, 0.9);
    }
  for (const t of [-2, 2]) {
    put(v, t, 2.8, 2.02, iron, 0.7);
    put(v, t, 2.8, -2.02, iron, 0.7);
  }
  // bail: ears + a welded link chain meeting the wood slide grip
  mirr((s) => {
    put(v, s * 2.3, 5.5, 0, iron, 0.55); // ear
    put(v, s * 2.15, 6.0, 0, iron, 0.66);
    put(v, s * 1.6, 6.5, 0, iron, 0.66);
    put(v, s * 1.05, 6.85, 0, iron, 0.66);
  });
  put(v, 0, 7.0, 0, PALETTE.wood, 1.5); // slide grip

  return rootOf('bucket', meshOf(v));
}
