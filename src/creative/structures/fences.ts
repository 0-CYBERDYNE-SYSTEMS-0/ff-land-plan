/**
 * Lane C fencing — tileable ~2 m segments with honest joinery: capped posts,
 * tenoned rails, strap hinges and latch on the gate, stepped lattice trellis.
 * Segments span 18 voxels (~1.9 m) so neighbors visually tile.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, solidMesh, weighted } from './shared';

const SEG = 17; // rail span x: 0..17 between post centers

/** Shared ground dressing: turf bump + tufts at a post base. */
function groundTuft(out: Voxel[], rand: () => number, x: number): void {
  out.push({ x, y: -0.2, z: 0, s: 1.15, color: weighted([[PALETTE.grassDark, 0.5], [PALETTE.soil, 0.5]], rand()) });
  for (let b = 0; b < 2; b++)
    out.push({
      x: x + (rand() - 0.5), y: 0.6 + b * 0.4, z: (rand() - 0.5) * 0.8, s: 0.3,
      color: rand() < 0.5 ? PALETTE.grass : PALETTE.grassDark,
    });
}

// ---------------------------------------------------------------------------
// Post-and-rail — two tenoned rails, rounded-post caps
// ---------------------------------------------------------------------------

export function makeFencePostRail(): THREE.Object3D {
  const rand = rng(3701);
  const solid: Voxel[] = [];
  const postAt = (x: number): void => {
    for (let y = 0; y <= 8; y++) {
      const c = y % 3 === 0 ? mixColor(C.postWood, PALETTE.black, 0.1) : rand() < 0.25 ? C.postWood : C.postWoodLight;
      solid.push({ x, y, z: 0, s: 1.24, color: c });
    }
    solid.push({ x, y: 8.55, z: 0, s: 1.32, color: mixColor(PALETTE.plankLight, PALETTE.plank, 0.35) });
    groundTuft(solid, rand, x);
  };
  postAt(0);
  postAt(SEG);
  // rails pass through the posts (mortise-and-tenon read)
  for (const [ry, tone] of [[3, C.plankWeathered], [6, mixColor(C.plankWeathered, PALETTE.woodDark, 0.35)]] as Array<[number, number]>)
    for (let x = 0; x <= SEG; x++) {
      let c = rand() < 0.12 ? mixColor(tone, PALETTE.black, 0.2) : tone;
      if (x === 0 || x === SEG) c = mixColor(c, PALETTE.black, 0.12); // tenon shoulder shadow
      solid.push({ x, y: ry, z: 0, s: 0.92, color: c });
    }
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Picket fence — pointed cream pickets over twin rails
// ---------------------------------------------------------------------------

export function makeFencePicket(): THREE.Object3D {
  const rand = rng(3801);
  const solid: Voxel[] = [];
  const postAt = (x: number): void => {
    for (let y = 0; y <= 9; y++)
      solid.push({ x, y, z: -0.4, s: 1.2, color: y % 3 === 0 ? C.postWood : C.postWoodLight });
    solid.push({ x, y: 9.55, z: -0.4, s: 1.28, color: C.trimWhite });
    groundTuft(solid, rand, x);
  };
  postAt(0);
  postAt(SEG);
  // rails behind the pickets
  for (const ry of [3, 6])
    for (let x = 0; x <= SEG; x++)
      solid.push({ x, y: ry, z: -0.35, s: 0.85, color: rand() < 0.15 ? C.postWood : C.postWoodLight });
  // pickets every other voxel, pointed tips
  for (let x = 2; x <= SEG + 1; x += 2) {
    if (x > SEG) break;
    for (let y = 1; y <= 7; y++) {
      const c = rand() < 0.12 ? C.trimShadow : rand() < 0.5 ? C.trimWhite : mixColor(C.trimWhite, PALETTE.gravel, 0.14);
      solid.push({ x, y, z: 0.05, s: 0.94, color: c });
    }
    solid.push({ x, y: 7.75, z: 0.05, s: 0.62, color: C.trimWhite }); // picket point
  }
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Farm gate — braced frame hung on strap hinges, latch loop opposite
// ---------------------------------------------------------------------------

export function makeGate(): THREE.Object3D {
  const rand = rng(3901);
  const solid: Voxel[] = [];
  // heavy hanging posts
  for (const px of [0, 13]) {
    for (let y = 0; y <= 10; y++) {
      const c = y % 3 === 0 ? mixColor(C.postWood, PALETTE.black, 0.12) : rand() < 0.25 ? C.postWood : C.postWoodLight;
      solid.push({ x: px, y, z: 0, s: 1.38, color: c });
    }
    solid.push({ x: px, y: 10.58, z: 0, s: 1.5, color: C.trimWhite }); // ball-ish cap
    solid.push({ x: px, y: 11.15, z: 0, s: 0.9, color: C.trimWhite });
    groundTuft(solid, rand, px);
  }
  // gate frame: stiles + top/bottom rails + diagonal brace
  const frameTone = (): number => plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
  for (const sx of [1, 12])
    for (let y = 3; y <= 8; y++)
      solid.push({ x: sx, y, z: 0, s: 0.95, color: frameTone() });
  for (let x = 1; x <= 12; x++)
    for (const ry of [3, 8]) {
      const c = frameTone();
      solid.push({ x, y: ry, z: 0, s: 0.95, color: c });
    }
  // diagonal brace bottom-hinge-side to top-latch-side
  for (let t = 0; t <= 10; t++) {
    const x = 1 + t;
    const y = 3 + Math.round((t / 10) * 5);
    solid.push({ x, y, z: 0.32, s: 0.72, color: frameTone() });
  }
  // infill pickets
  for (let x = 3; x <= 11; x += 2)
    for (let y = 4; y <= 7; y++)
      solid.push({ x, y, z: -0.28, s: 0.8, color: rand() < 0.15 ? C.trimShadow : C.trimWhite });
  // strap hinges on the right post
  for (const hy of [3.5, 7.5]) {
    solid.push({ x: 12.6, y: hy, z: 0, s: 1.02, color: PALETTE.ironDark });
    solid.push({ x: 13.2, y: hy, z: 0, s: 1.02, color: PALETTE.metalDark });
    solid.push({ x: 13.2, y: hy + 0.45, z: 0, s: 0.5, color: PALETTE.metal });
  }
  // latch bar + heart loop on the left post
  solid.push({ x: 1.4, y: 6.5, z: 0.35, s: 0.9, color: PALETTE.ironDark });
  solid.push({ x: 0.6, y: 6.5, z: 0.35, s: 0.55, color: PALETTE.metalDark });
  solid.push({ x: 1.4, y: 7.15, z: 0.35, s: 0.4, color: PALETTE.metal }); // thumb lift
  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Trellis — 15×20 lattice panel in a timber frame
// ---------------------------------------------------------------------------

export function makeTrellis(): THREE.Object3D {
  const rand = rng(4001);
  const solid: Voxel[] = [];
  const W = 14; // x: 0..14
  const H = 19; // y: 0..19

  for (const px of [0, W]) {
    for (let y = 0; y <= H; y++)
      solid.push({ x: px, y, z: 0, s: 1.22, color: y % 3 === 0 ? C.postWood : C.postWoodLight });
    solid.push({ x: px, y: H + 0.56, z: 0, s: 1.3, color: PALETTE.plankLight });
    groundTuft(solid, rand, px);
  }
  // top and bottom rails
  for (let x = 0; x <= W; x++)
    for (const ry of [1, H - 1]) {
      let c = plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
      if (x === 0 || x === W) c = C.postWood;
      solid.push({ x, y: ry, z: 0, s: 0.9, color: c });
    }
  // diamond lattice: two families of stepped diagonals
  const latticeTone = (): number =>
    weighted(
      [
        [mixColor(C.plankWeathered, PALETTE.black, 0.15), 0.5],
        [C.plankWeathered, 0.35],
        [PALETTE.wood, 0.15],
      ],
      rand(),
    );
  for (let x = 1; x < W; x++)
    for (let y = 2; y < H - 1; y++) {
      const a = (((x + y) % 4) + 4) % 4;
      const b = (((x - y) % 4) + 4) % 4;
      if (a === 0 || b === 0)
        solid.push({ x, y, z: 0, s: 1.14, color: latticeTone() });
    }
  // a curious pea tendril curling off the top corner
  solid.push({ x: W - 1.5, y: H + 0.9, z: 0.1, s: 0.34, color: PALETTE.stem });
  solid.push({ x: W - 1.1, y: H + 1.35, z: 0.1, s: 0.3, color: PALETTE.leafYoung });
  return solidMesh(solid);
}
