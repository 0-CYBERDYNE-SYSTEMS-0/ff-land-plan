/**
 * Lane C equipment — indoor growing hardware: LED grow-light bar, vertical
 * plant rack, NFT hydroponic channel, clip fan, HVAC unit, potting bench.
 * The grow light and hydro channel are sized to butt into continuous rows.
 * Every maker is deterministic (unique seeded rng); 1 voxel = 10 cm, ground
 * plane at y = 0 (the grow light hangs, its ceiling plates sit at y≈8.6).
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, solidMesh, weighted } from './shared';

// --- precomputed accent tones (module-load mixes are deterministic) ----------
const LED_GLOW = mixColor(PALETTE.white, 0xe6d9ff, 0.55);
const LED_HOT = mixColor(PALETTE.white, 0xe6d9ff, 0.78);
const HOUSING = mixColor(PALETTE.charcoal, PALETTE.black, 0.25);
const HOUSING_DARK = mixColor(PALETTE.charcoal, PALETTE.black, 0.5);
const GRILLE_DARK = mixColor(PALETTE.charcoal, PALETTE.black, 0.45);
const GALV_LIGHT = mixColor(PALETTE.metal, PALETTE.white, 0.4);
const CHANNEL_WHITE = mixColor(PALETTE.woolWhite, PALETTE.white, 0.5);
const LED_GREEN = mixColor(PALETTE.leafLight, PALETTE.white, 0.35);

// ---------------------------------------------------------------------------
// Grow light — LED bar that tiles into continuous rows over benches
// ---------------------------------------------------------------------------

export function makeGrowLight(): THREE.Object3D {
  const rand = rng(6101);
  const solid: Voxel[] = [];

  // slender extrusion: two charcoal rails + dark spine, LED strip underneath
  for (let x = 0; x <= 13; x++) {
    for (const z of [-0.5, 0.5])
      solid.push({ x, y: 7.1, z, s: 0.95, color: rand() < 0.2 ? HOUSING_DARK : HOUSING });
    solid.push({ x, y: 7.1, z: 0, s: 0.7, color: HOUSING_DARK });
    // bright emissive-LOOKING underside strip (vertex colors only)
    solid.push({ x, y: 6.55, z: 0, s: 0.85, color: x % 4 === 2 ? LED_HOT : LED_GLOW });
  }
  // end caps close the extrusion
  for (const x of [-0.12, 13.12])
    for (const z of [-0.5, 0, 0.5])
      solid.push({ x, y: 7.1, z, s: 0.9, color: HOUSING_DARK });

  // two thin hanger rods + small ceiling-mount plates with fixing bolts
  for (const hx of [2.5, 10.5]) {
    for (let y = 7.45; y <= 8.4; y += 0.48)
      solid.push({ x: hx, y, z: 0, s: 0.3, color: rand() < 0.3 ? PALETTE.metalDark : PALETTE.metal });
    solid.push({ x: hx, y: 8.62, z: 0, s: 1.15, color: PALETTE.metal });
    solid.push({ x: hx, y: 8.88, z: 0, s: 0.45, color: PALETTE.metalDark });
  }

  // tiny driver box + cable stub on top of the bar
  solid.push({ x: 6.5, y: 7.75, z: 0, s: 1.25, color: HOUSING });
  solid.push({ x: 6.5, y: 8.45, z: 0, s: 0.5, color: HOUSING_DARK });
  solid.push({ x: 7.3, y: 7.8, z: 0, s: 0.3, color: PALETTE.black });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Plant rack — open vertical shelving unit on castors
// ---------------------------------------------------------------------------

export function makePlantRack(): THREE.Object3D {
  const rand = rng(6201);
  const solid: Voxel[] = [];
  const X1 = 8; // x: 0..8 → 0.9 m
  const Z1 = 5; // z: 0..5 → 0.6 m
  const postTone = (): number => (rand() < 0.3 ? PALETTE.ironDark : PALETTE.iron);

  // castors + slim metal corner posts
  for (const [px, pz] of [[0, 0], [X1, 0], [0, Z1], [X1, Z1]] as Array<[number, number]>) {
    solid.push({ x: px, y: 0.28, z: pz, s: 0.78, color: PALETTE.metalDark });
    solid.push({ x: px, y: 0.62, z: pz, s: 0.55, color: PALETTE.black });
    for (let y = 1; y <= 11; y++)
      solid.push({ x: px, y, z: pz, s: 0.7, color: postTone() });
    solid.push({ x: px, y: 11.6, z: pz, s: 0.8, color: PALETTE.metal }); // top cap
  }

  // three shelf levels: slatted tray decks with a raised lip, left OPEN so
  // plants placed on them read through from every side
  for (const L of [2, 6, 10]) {
    for (let x = 0; x <= X1; x++)
      for (let z = 0; z <= Z1; z++) {
        if (z % 2 === 1) continue; // air gaps between the tray slats
        solid.push({ x, y: L, z, s: 0.96, color: rand() < 0.25 ? PALETTE.metalDark : PALETTE.metal });
      }
    for (let x = 0; x <= X1; x++)
      for (const z of [0, Z1]) solid.push({ x, y: L + 0.42, z, s: 0.66, color: PALETTE.iron });
    for (let z = 1; z < Z1; z++)
      for (const x of [0, X1]) solid.push({ x, y: L + 0.42, z, s: 0.66, color: PALETTE.iron });
  }

  // small power cord running down one post to a plug
  for (let y = 9.8; y >= 1.4; y -= 0.6)
    solid.push({ x: X1 + 0.42, y, z: Z1, s: 0.2, color: PALETTE.black });
  solid.push({ x: X1 + 0.42, y: 1, z: Z1, s: 0.42, color: PALETTE.charcoal });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Hydro channel — NFT segment that tiles into sloped rows
// ---------------------------------------------------------------------------

export function makeHydroChannel(): THREE.Object3D {
  const rand = rng(6301);
  const solid: Voxel[] = [];
  const LEN = 10; // x: 0..10 → 1.1 m segment

  // gentle fall along the run — NFT channels slope a steady ~1 %
  const yTop = (x: number): number => 3.3 - (x / LEN) * 0.7;

  for (let x = 0; x <= LEN; x++) {
    const t = yTop(x);
    // channel body: flat floor, sloped side walls, proud top rails
    solid.push({ x, y: t - 1.15, z: 0, s: 1.25, color: rand() < 0.2 ? PALETTE.gravel : CHANNEL_WHITE });
    for (const z of [-0.72, 0.72])
      solid.push({
        x, y: t - 0.55, z, s: 0.9,
        color: rand() < 0.25 ? mixColor(CHANNEL_WHITE, PALETTE.gravel, 0.3) : CHANNEL_WHITE,
      });
    for (const z of [-0.72, 0.72])
      solid.push({ x, y: t, z, s: 0.62, color: CHANNEL_WHITE });
  }
  // end caps close the profile at both ends of the segment
  solid.push({ x: -0.15, y: yTop(0) - 0.6, z: 0, s: 1.3, color: CHANNEL_WHITE });
  solid.push({ x: LEN + 0.15, y: yTop(LEN) - 0.6, z: 0, s: 1.3, color: CHANNEL_WHITE });

  // two short legs (the far one shorter — the run steps downhill)
  for (const lx of [1.5, 8.5]) {
    solid.push({ x: lx, y: 0.22, z: 0, s: 1.15, color: PALETTE.metalDark });
    for (let y = 0.45; y <= yTop(lx) - 1.7; y += 0.45)
      solid.push({ x: lx, y, z: 0, s: 0.6, color: rand() < 0.3 ? PALETTE.ironDark : PALETTE.iron });
  }

  // round plant holes at regular intervals, sprout nubs in some of them
  for (let x = 1; x <= LEN - 1; x += 2) {
    const t = yTop(x);
    solid.push({ x, y: t + 0.08, z: 0, s: 0.6, color: GRILLE_DARK });
    if (rand() < 0.5) {
      solid.push({ x, y: t + 0.38, z: 0, s: 0.42, color: PALETTE.sprout });
      if (rand() < 0.5) solid.push({ x, y: t + 0.68, z: 0, s: 0.3, color: PALETTE.leafLight });
    }
  }

  // thin feed line hugging one side, with an emitter nudging each hole
  for (let x = -0.2; x <= LEN + 0.2; x += 0.5)
    solid.push({ x, y: yTop(x) - 1.4, z: 1.35, s: 0.3, color: C.pipeBlack });
  for (const ex of [1, 3, 5, 7, 9])
    solid.push({ x: ex, y: yTop(ex) - 1.0, z: 0.9, s: 0.26, color: PALETTE.black });

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Clip fan — spring-clamp stand fan for tent corners
// ---------------------------------------------------------------------------

export function makeClipFan(): THREE.Object3D {
  const rand = rng(6401);
  const solid: Voxel[] = [];

  // spring clamp base: two jaws + pivot coil + wing lever
  solid.push({ x: 0, y: 0.3, z: 0, s: 1.35, color: PALETTE.charcoal });
  solid.push({ x: 0, y: 1.45, z: 0, s: 1.2, color: HOUSING });
  solid.push({ x: 0, y: 0.88, z: 0, s: 0.8, color: PALETTE.metalDark });
  solid.push({ x: 0.85, y: 1.15, z: 0, s: 0.4, color: PALETTE.metal });

  // slim stem
  for (let y = 1.9; y <= 5.6; y += 0.45)
    solid.push({ x: 0, y, z: 0, s: 0.42, color: rand() < 0.3 ? PALETTE.ironDark : PALETTE.iron });

  // circular head: tilted dark ring cage…
  const CY = 7.2;
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    const ry = Math.sin(ang) * 1.7;
    solid.push({
      x: Math.cos(ang) * 1.7, y: CY + ry, z: 0.85 - ry * 0.16, s: 0.5,
      color: a % 2 === 0 ? PALETTE.charcoal : HOUSING_DARK,
    });
  }
  // …inner blades in lighter gray, each vane pitched slightly differently
  for (let b = 0; b < 4; b++) {
    const ang = (b / 4) * Math.PI * 2 + 0.4;
    for (let rr = 0.45; rr <= 1.15; rr += 0.35)
      solid.push({
        x: Math.cos(ang + rr * 0.5) * rr, y: CY + Math.sin(ang + rr * 0.5) * rr,
        z: 0.5 + b * 0.05, s: 0.44,
        color: mixColor(PALETTE.metal, PALETTE.white, 0.35),
      });
  }
  solid.push({ x: 0, y: CY, z: 0.62, s: 0.72, color: PALETTE.metalDark }); // hub
  solid.push({ x: 0, y: CY, z: 0.98, s: 0.3, color: PALETTE.metal });      // hub cap

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// HVAC unit — wall/ceiling climate box with grille + status LED
// ---------------------------------------------------------------------------

export function makeHvacUnit(): THREE.Object3D {
  const rand = rng(6501);
  const solid: Voxel[] = [];
  const X1 = 9;
  const Y1 = 3;
  const Z1 = 3; // 10×4×4 voxels = 1×0.4×0.4 m
  const caseTone = (): number =>
    rand() < 0.22 ? mixColor(C.frameWhite, PALETTE.gravel, 0.25) : C.frameWhite;

  // off-white case shell — the front (z=Z1) is a full face with a flap opening
  for (let x = 0; x <= X1; x++)
    for (let y = 0; y <= Y1; y++)
      for (let z = 0; z <= Z1; z++) {
        const isFront = z === Z1;
        const inFlap = isFront && x >= 3 && x <= 6 && y <= 1;
        const shell = x === 0 || x === X1 || y === 0 || y === Y1 || z === 0 || isFront;
        if (!shell || inFlap) continue;
        solid.push({ x, y, z, s: 0.99, color: caseTone() });
      }

  // slightly recessed vent flap sitting behind the front opening
  for (let x = 2.6; x <= 6.4; x += 0.95)
    for (let y = 0.25; y <= 1.15; y += 0.45)
      solid.push({ x, y, z: 2.72, s: 0.85, color: mixColor(C.frameWhite, PALETTE.gravelDark, 0.3) });

  // dark intake grille lines along the front + green status LED
  for (const gy of [2.15, 2.55])
    for (let x = 0.7; x <= 8.3; x += 0.6)
      solid.push({ x, y: gy, z: 3.62, s: 0.42, color: GRILLE_DARK });
  solid.push({ x: 8.55, y: 2.35, z: 3.62, s: 0.3, color: LED_GREEN });

  // mounting bracket lugs on top
  for (const lx of [1.5, 7.5]) {
    solid.push({ x: lx, y: Y1 + 0.45, z: 1.5, s: 0.95, color: PALETTE.metal });
    solid.push({ x: lx, y: Y1 + 0.95, z: 1.5, s: 0.4, color: PALETTE.metalDark });
  }

  return solidMesh(solid);
}

// ---------------------------------------------------------------------------
// Grow bench — greenhouse potting bench, galvanized top + slatted shelf
// ---------------------------------------------------------------------------

export function makeGrowBench(): THREE.Object3D {
  const rand = rng(6601);
  const solid: Voxel[] = [];
  const X1 = 11; // x: 0..11 → 1.2 m
  const Z1 = 5; // z: 0..5 → 0.6 m

  // galvanized metal top: light-gray dithered deck with a raised rim
  for (let x = 0; x <= X1; x++)
    for (let z = 0; z <= Z1; z++)
      solid.push({
        x, y: 6, z, s: 0.98,
        color: weighted(
          [
            [GALV_LIGHT, 0.55],
            [PALETTE.metal, 0.3],
            [mixColor(PALETTE.metal, PALETTE.gravelDark, 0.35), 0.15],
          ],
          rand(),
        ),
      });
  for (let x = 0; x <= X1; x++)
    for (const z of [0, Z1]) solid.push({ x, y: 6.42, z, s: 0.7, color: PALETTE.metal });
  for (let z = 1; z < Z1; z++)
    for (const x of [0, X1]) solid.push({ x, y: 6.42, z, s: 0.7, color: PALETTE.metal });

  // four metal legs up to the deck
  for (const [lx, lz] of [[1, 1], [X1 - 1, 1], [1, Z1 - 1], [X1 - 1, Z1 - 1]] as Array<[number, number]>)
    for (let y = 0; y <= 5; y++)
      solid.push({ x: lx, y: y + 0.5, z: lz, s: 0.8, color: y % 3 === 0 ? PALETTE.ironDark : PALETTE.iron });

  // lower slatted shelf on two cross rails, weathered boards with air gaps
  for (const rx of [3, 8])
    for (let z = 1; z <= Z1 - 1; z++)
      solid.push({ x: rx, y: 1.6, z, s: 0.7, color: PALETTE.ironDark });
  for (let x = 1; x <= X1 - 1; x++)
    for (let z = 1; z <= Z1 - 1; z++) {
      if (z % 2 === 1) continue;
      solid.push({ x, y: 2, z, s: 0.94, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
    }

  // a couple of small pots on the shelf, one with a seedling up
  for (const [px, pz] of [[3, 2], [8, 4]] as Array<[number, number]>) {
    solid.push({ x: px, y: 2.85, z: pz, s: 1.05, color: PALETTE.terracotta });
    solid.push({ x: px, y: 3.45, z: pz, s: 0.8, color: mixColor(PALETTE.terracotta, PALETTE.black, 0.2) });
    solid.push({ x: px, y: 3.66, z: pz, s: 0.55, color: PALETTE.soilDark });
  }
  solid.push({ x: 8, y: 3.98, z: 4, s: 0.4, color: PALETTE.sprout });

  return solidMesh(solid);
}
