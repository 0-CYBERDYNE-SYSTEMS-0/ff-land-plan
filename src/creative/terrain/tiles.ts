/**
 * Lane A ground tiles — meadow grass, tilled farmland, paths and the island
 * rim cliff. Each tile spans a 10x10 voxel footprint (1 voxel = 10 cm), with
 * 3-6 voxels of body below the surface. All randomness is seeded → identical
 * rebuilds every time.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import {
  Rand, DUST, DRY_CLOD, WET_CLOD, WET_RIDGE, WET_SLOPE, clamp,
  dirtBody, turfLip, bladeTufts, addFlower, tileGroup, solidMesh,
  toneField, sampleField, grassRamp, weighted,
} from './shared';

// ---------------------------------------------------------------------------
// Meadow grass
// ---------------------------------------------------------------------------

function makeGrassTile(seed: number, variant: 0 | 1 | 2): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];

  // earthen body with stone specks
  dirtBody(vx, rand, 0, 9, 0, 9, 3);

  // mottled grass cap (coarse patches + jitter → organic meadow mottling)
  const field = toneField(5, 5, rand);
  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++)
      vx.push({ x, y: 4, z, color: grassRamp(sampleField(field, x, z, rand)) });

  // serrated turf lip around all four edges
  turfLip(vx, rand, 0, 9, 0, 9, 4);

  // per-variant character
  if (variant === 0) {
    // classic meadow
    bladeTufts(vx, rand, 7, 1, 8, 1, 8, 4);
    if (rand() < 0.8) addFlower(vx, rand, Math.round(2 + rand() * 6), Math.round(2 + rand() * 6), 4);
    // one pebble peeking through the sward
    vx.push({ x: 6.2, y: 4.35, z: 2.4, s: 0.62, color: PALETTE.gravel });
    vx.push({ x: 6.85, y: 4.28, z: 2.75, s: 0.45, color: PALETTE.stoneDark });
  } else if (variant === 1) {
    // tufty — heavy tussocks + clover flecks
    bladeTufts(vx, rand, 12, 1, 8, 1, 8, 4);
    for (let p = 0; p < 3; p++) {
      const px = Math.round(1 + rand() * 8);
      const pz = Math.round(1 + rand() * 8);
      for (let k = 0; k < 3; k++)
        vx.push({
          x: px + Math.floor(rand() * 2), y: 4.52, z: pz + Math.floor(rand() * 2),
          s: 0.42, color: PALETTE.leafYoung,
        });
    }
    if (rand() < 0.6) addFlower(vx, rand, Math.round(2 + rand() * 6), Math.round(2 + rand() * 6), 4);
  } else {
    // stony lean — a gravel outcrop + more flowers
    bladeTufts(vx, rand, 8, 1, 8, 1, 8, 4);
    vx.push({ x: 2.4, y: 4.45, z: 6.6, s: 0.8, color: PALETTE.stoneLight });
    vx.push({ x: 3.15, y: 4.35, z: 6.9, s: 0.55, color: PALETTE.stoneDark });
    vx.push({ x: 2.0, y: 4.3, z: 7.25, s: 0.42, color: PALETTE.gravelDark });
    addFlower(vx, rand, 6, 2, 4);
    addFlower(vx, rand, 8, 7, 4);
    addFlower(vx, rand, 4, 8, 4);
  }

  return tileGroup([solidMesh(vx)], 10);
}

/** Flowering meadow patch — blossom drifts scattered over rich sward. */
function makeFloweringMeadow(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];
  dirtBody(vx, rand, 0, 9, 0, 9, 3);
  const field = toneField(5, 5, rand);
  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++)
      vx.push({ x, y: 4, z, color: grassRamp(sampleField(field, x, z, rand)) });
  turfLip(vx, rand, 0, 9, 0, 9, 4);
  bladeTufts(vx, rand, 6, 1, 8, 1, 8, 4);

  // two dense drifts + loose singles, like a self-seeded wildflower patch
  const drifts: Array<[number, number]> = [
    [2.5, 2.5],
    [7, 6.5],
  ];
  for (const [dx, dz] of drifts) {
    for (let f = 0; f < 3; f++) {
      const fx = Math.max(1, Math.min(8, Math.round(dx + (rand() - 0.5) * 3)));
      const fz = Math.max(1, Math.min(8, Math.round(dz + (rand() - 0.5) * 3)));
      addFlower(vx, rand, fx, fz, 4);
    }
  }
  addFlower(vx, rand, 5, 4, 4);
  addFlower(vx, rand, 8, 1, 4);
  addFlower(vx, rand, 1, 7, 4);

  return tileGroup([solidMesh(vx)], 10);
}

export function makeGrass01(): THREE.Object3D {
  return makeGrassTile(1101, 0);
}
export function makeGrass02(): THREE.Object3D {
  return makeGrassTile(1102, 1);
}
export function makeGrass03(): THREE.Object3D {
  return makeGrassTile(1103, 2);
}
export function makeGrassFlower(): THREE.Object3D {
  return makeFloweringMeadow(1201);
}

// ---------------------------------------------------------------------------
// Tilled farmland
// ---------------------------------------------------------------------------

/**
 * Furrow cross-profile across x (rows run along z): flat valley floors at
 * y=2, one-voxel shoulders, broad ridge crests at y=4 that catch the light.
 * Relief is a honest 2 voxels so the tile reads as a prepared seedbed —
 * deep enclosed slots would read as canyon walls from orbit view.
 */
const FURROW = [2, 3, 4, 4, 3, 2, 3, 4, 4, 3];

// Ridge-top highlight for the wet tile — 1-2 tone steps brighter than WET_RIDGE
// so crests catch the light while the tile still reads deep-chocolate wet.
const WET_CREST = mixColor(PALETTE.soilWet, PALETTE.soilLight, 0.85);

function makeTilled(seed: number, wet: boolean): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];

  // gentle row undulation: each ridge column dips exactly once, well inside
  // the tile, and neighbouring crest columns dip at disjoint depths so the
  // break never spans two columns (an aligned pair read as a rectangular
  // bite taken out of the ridge)
  const dipBands: Array<[number, number]> = [[2, 4], [6, 8], [1, 3], [5, 7]];
  const dips = new Map<number, number[]>();
  let dipBand = 0;
  for (let x = 0; x <= 9; x++)
    if (FURROW[x] === 4) {
      const [lo, hi] = dipBands[dipBand % dipBands.length];
      dipBand++;
      dips.set(x, [lo + Math.floor(rand() * (hi - lo + 1))]);
    }
  const rowHeight = (x: number, z: number): number =>
    dips.get(x)?.includes(z) ? 3 : FURROW[x];

  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++) {
      const h = rowHeight(x, z);
      for (let y = 0; y <= h; y++) {
        let c: number;
        if (y < h) {
          // buried earth darkens with depth
          c =
            y >= h - 2
              ? weighted([[PALETTE.soil, 0.55], [PALETTE.soilDark, 0.45]], rand())
              : weighted([[PALETTE.soilDark, 0.6], [PALETTE.mulch, 0.2], [PALETTE.soil, 0.2]], rand());
        } else {
          const r = rand();
          if (h === 4) {
            // ridge crest catches the light
            c = wet
              ? weighted([[WET_CREST, 0.4], [WET_RIDGE, 0.34], [PALETTE.soilWet, 0.26]], r)
              : weighted([[PALETTE.soilLight, 0.46], [DUST, 0.34], [PALETTE.soil, 0.2]], r);
          } else if (h === 3) {
            // shoulder slope between crest and floor
            c = wet
              ? weighted([[PALETTE.soilWet, 0.52], [WET_SLOPE, 0.3], [PALETTE.soilDark, 0.18]], r)
              : weighted([[PALETTE.soil, 0.5], [PALETTE.soilLight, 0.28], [PALETTE.soilDark, 0.22]], r);
          } else {
            // valley floor stays dark and collects moisture — wet floors sink
            // an extra step toward black-chocolate so the relief stays legible
            c = wet
              ? weighted(
                  [
                    [PALETTE.soilDark, 0.5],
                    [mixColor(PALETTE.soilDark, PALETTE.black, 0.3), 0.26],
                    [PALETTE.mulch, 0.24],
                  ],
                  r,
                )
              : weighted([[PALETTE.soilDark, 0.5], [PALETTE.mulch, 0.3], [PALETTE.soil, 0.2]], r);
          }
          // slow tonal drift along the furrow so ridges never read as banded
          if (rand() < 0.16) c = mixColor(c, wet ? PALETTE.soilWet : DUST, 0.3);
        }
        vx.push({ x, y, z, color: c });
      }
    }

  if (wet) {
    // moisture sheen: glints pooled in the valley floors (FURROW===2 at x=0,5)
    // plus faint catch-lights along a couple of ridge crests — barely-blue
    // chocolate, never saturated cubes
    const glint = (t: number): number => mixColor(PALETTE.soilWet, PALETTE.waterLight, t);
    for (let i = 0; i < 7; i++) {
      const gx = i % 2 === 0 ? 0 : 5;
      const gz = Math.floor(rand() * 10);
      vx.push({
        x: gx + (rand() - 0.5) * 0.36,
        y: rowHeight(gx, gz) + 0.3,
        z: gz + (rand() - 0.5) * 0.36,
        s: 0.28 + rand() * 0.16,
        color: glint(0.16 + rand() * 0.14),
      });
    }
    for (let i = 0; i < 3; i++) {
      const gx = [2, 7, 8][i];
      const gz = Math.floor(rand() * 10);
      vx.push({
        x: gx + (rand() - 0.5) * 0.4,
        y: rowHeight(gx, gz) + 0.32,
        z: gz + (rand() - 0.5) * 0.4,
        s: 0.24 + rand() * 0.12,
        color: glint(0.1 + rand() * 0.1),
      });
    }
  }

  // embedded clods sitting proud of the surface
  const clodColor = wet ? WET_CLOD : DRY_CLOD;
  const clods: Array<[number, number]> = [
    [2 + Math.floor(rand() * 2), Math.floor(rand() * 9)],
    [7 + Math.floor(rand() * 2), Math.floor(rand() * 9)],
    [Math.floor(rand() * 10), 2 + Math.floor(rand() * 6)],
    [Math.floor(rand() * 10), 7],
    [3 + Math.floor(rand() * 4), Math.floor(rand() * 10)],
  ];
  for (const [cx, cz] of clods) {
    vx.push({ x: cx, y: rowHeight(cx, cz) + 0.34, z: cz, s: 0.64, color: clodColor });
    if (rand() < 0.55)
      vx.push({
        x: cx + 0.72,
        y: rowHeight(cx, cz) + 0.22,
        z: cz + (rand() < 0.5 ? 0.5 : -0.5),
        s: 0.46,
        color: mixColor(clodColor, PALETTE.soilDark, 0.4),
      });
  }

  // half-buried stones in the valley floors
  vx.push({ x: 0.4, y: 2.2, z: 3 + Math.floor(rand() * 4), s: 0.72, color: PALETTE.gravelDark });
  vx.push({ x: 5.2, y: 2.25, z: Math.floor(rand() * 9), s: 0.58, color: PALETTE.stoneDark });

  return tileGroup([solidMesh(vx)], 10);
}

export function makeSoilTilledDry(): THREE.Object3D {
  return makeTilled(1301, false);
}
export function makeSoilTilledWet(): THREE.Object3D {
  return makeTilled(1302, true);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Shared path base: packed earth surface at y=3, worn irregular edges that
 * blend into turf, plus a few tufts on the grassy corners.
 */
function pathBase(
  seed: number,
  surfaceColor: (rand: Rand) => number,
  edgeGrassChance: number,
): { vx: Voxel[]; rand: Rand } {
  const rand = rng(seed);
  const vx: Voxel[] = [];
  dirtBody(vx, rand, 0, 9, 0, 9, 2);
  const field = toneField(5, 5, rand);
  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++) {
      const onEdge = x === 0 || x === 9 || z === 0 || z === 9;
      const corner = (x === 0 || x === 9) && (z === 0 || z === 9);
      const grassChance = corner ? edgeGrassChance + 0.25 : edgeGrassChance;
      if (onEdge && rand() < grassChance) {
        vx.push({ x, y: 3, z, color: grassRamp(sampleField(field, x, z, rand)) });
      } else {
        vx.push({ x, y: 3, z, color: surfaceColor(rand) });
      }
    }
  return { vx, rand };
}

function makePathGravel(seed: number): THREE.Object3D {
  const packed = (rand: Rand): number =>
    weighted([[PALETTE.gravelDark, 0.55], [PALETTE.soil, 0.28], [PALETTE.gravel, 0.17]], rand());
  const { vx, rand } = pathBase(seed, packed, 0.4);
  turfLip(vx, rand, 0, 9, 0, 9, 3);

  // proud pebbles — varied sizes and tones, never uniform
  for (let i = 0; i < 20; i++) {
    const px = 0.6 + rand() * 8.8;
    const pz = 0.6 + rand() * 8.8;
    const s = 0.5 + rand() * 0.45;
    const c = weighted(
      [
        [PALETTE.gravel, 0.34],
        [PALETTE.stoneLight, 0.22],
        [PALETTE.stoneDark, 0.22],
        [PALETTE.sand, 0.22],
      ],
      rand(),
    );
    vx.push({ x: px, y: 3.42 + rand() * 0.08, z: pz, s, color: c });
  }
  // half-sunk pebbles flush with the packing
  for (let i = 0; i < 6; i++)
    vx.push({
      x: rand() * 10, y: 3.18, z: rand() * 10, s: 0.5,
      color: rand() < 0.5 ? PALETTE.gravelDark : PALETTE.gravel,
    });

  bladeTufts(vx, rand, 3, 0, 9, 0, 9, 3);
  return tileGroup([solidMesh(vx)], 10);
}

function makePathWoodchip(seed: number): THREE.Object3D {
  const darkEarth = (rand: Rand): number =>
    weighted([[PALETTE.soilDark, 0.62], [PALETTE.mulch, 0.38]], rand());
  const { vx, rand } = pathBase(seed, darkEarth, 0.42);
  turfLip(vx, rand, 0, 9, 0, 9, 3);

  // chunky chip flakes: 2-long slabs built from paired sub-voxel plates
  const chipColor = (): number =>
    weighted(
      [
        [PALETTE.plank, 0.32],
        [PALETTE.woodLight, 0.26],
        [PALETTE.hay, 0.18],
        [PALETTE.woodDark, 0.24],
      ],
      rand(),
    );
  for (let i = 0; i < 13; i++) {
    const alongX = rand() < 0.5;
    const cx = 0.8 + rand() * 8.4;
    const cz = 0.8 + rand() * 8.4;
    const y = 3.38 + rand() * 0.1;
    const c = chipColor();
    const j = 0.5;
    if (alongX) {
      vx.push({ x: cx - j / 2, y, z: cz, s: j, color: c });
      vx.push({ x: cx + j / 2, y, z: cz, s: j, color: mixColor(c, PALETTE.woodDark, 0.12) });
    } else {
      vx.push({ x: cx, y, z: cz - j / 2, s: j, color: c });
      vx.push({ x: cx, y, z: cz + j / 2, s: j, color: mixColor(c, PALETTE.woodDark, 0.12) });
    }
  }
  // single chips + a few doubled-up flakes
  for (let i = 0; i < 7; i++)
    vx.push({ x: rand() * 10, y: 3.4, z: rand() * 10, s: 0.62, color: chipColor() });
  for (let i = 0; i < 3; i++) {
    const cx = 1 + rand() * 8;
    const cz = 1 + rand() * 8;
    const c = chipColor();
    vx.push({ x: cx, y: 3.4, z: cz, s: 0.6, color: c });
    vx.push({ x: cx + 0.15, y: 3.75, z: cz + 0.1, s: 0.5, color: mixColor(c, PALETTE.woodLight, 0.25) });
  }

  bladeTufts(vx, rand, 3, 0, 9, 0, 9, 3);
  return tileGroup([solidMesh(vx)], 10);
}

function makeFlagstonePath(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];
  dirtBody(vx, rand, 0, 9, 0, 9, 2);

  // wandering joint paths — a lazy random walk keeps flags irregular, nothing
  // perfectly rectangular. Two horizontal joints + one vertical per band
  // carve the tile into six differently-sized flags.
  const walk = (start: number, lo: number, hi: number): number[] => {
    const out = [start];
    for (let i = 1; i <= 9; i++) {
      const step = rand() < 0.72 ? (rand() < 0.5 ? -1 : 1) : 0;
      out.push(clamp(out[i - 1] + step, lo, hi));
    }
    return out;
  };
  const hA = walk(3, 2, 4); // upper horizontal joint, per column
  const hB = walk(7, 6, 8); // lower horizontal joint, per column
  const vTop = walk(3, 2, 4); // vertical joint in the top band, per row
  const vMid = walk(6, 5, 7); // vertical joint in the middle band, per row
  const vBot = walk(4, 2, 6); // vertical joint in the bottom band, per row

  const bandOf = (z: number, x: number): number => (z < hA[x] ? 0 : z < hB[x] ? 1 : 2);
  const vJoint = (band: number, z: number): number =>
    band === 0 ? vTop[z] : band === 1 ? vMid[z] : vBot[z];
  // per-flag base/mix tone pairs — neighbours always contrast
  const flagBase = [PALETTE.stoneLight, PALETTE.stone, PALETTE.stone, PALETTE.stoneDark, PALETTE.stone, PALETTE.stoneLight];
  const flagMix = [PALETTE.stone, PALETTE.stoneLight, PALETTE.stoneDark, PALETTE.stone, PALETTE.stoneLight, PALETTE.stoneDark];

  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++) {
      const band = bandOf(z, x);
      const vxj = vJoint(band, z);
      const isJoint = z === hA[x] || z === hB[x] || x === vxj;
      if (isJoint) {
        const r = rand();
        if (r < 0.16) vx.push({ x, y: 2.78, z, color: PALETTE.leafDark }); // moss in the joint
        else if (r < 0.28) vx.push({ x, y: 2.78, z, color: PALETTE.gravelDark });
        else vx.push({ x, y: 2.78, z, color: weighted([[PALETTE.soil, 0.55], [PALETTE.soilDark, 0.45]], rand()) });
        continue;
      }
      const fid = band * 2 + (x < vxj ? 0 : 1);
      let c = weighted([[flagBase[fid], 0.62], [flagMix[fid], 0.38]], rand());
      // bevel shading where a flag meets its joint
      const nearJoint =
        (z === hA[x] - 1 || z === hA[x] + 1 || z === hB[x] - 1 || z === hB[x] + 1 || x === vxj - 1 || x === vxj + 1);
      if (nearJoint) c = mixColor(c, PALETTE.black, 0.13);
      // hairline crack across the north-west flag
      if (fid === 0 && x === 1 && z <= 1 && rand() < 0.85) c = mixColor(PALETTE.stone, PALETTE.charcoal, 0.4);
      vx.push({ x, y: 3, z, color: c });
    }

  // worn turf creeping over two corners + lip (clamped inside the footprint —
  // no stray sods floating past the tile edge)
  for (let i = 0; i < 5; i++) {
    const cx = rand() < 0.5 ? 0 : 9;
    const cz = rand() < 0.5 ? 0 : 9;
    const px = clamp(cx + Math.round(rand()), 0, 9);
    const pz = clamp(cz + Math.round(rand()), 0, 9);
    vx.push({ x: px, y: 3.05, z: pz, s: 0.8, color: grassRamp(rand()) });
  }
  turfLip(vx, rand, 0, 9, 0, 9, 3);
  bladeTufts(vx, rand, 3, 0, 9, 0, 9, 3);

  return tileGroup([solidMesh(vx)], 10);
}

export function makePathGravelEntry(): THREE.Object3D {
  return makePathGravel(1401);
}
export function makePathWoodchipEntry(): THREE.Object3D {
  return makePathWoodchip(1402);
}
export function makePathStoneEntry(): THREE.Object3D {
  return makeFlagstonePath(1403);
}

// ---------------------------------------------------------------------------
// Island rim — turf cliff block
// ---------------------------------------------------------------------------

function makeCliffBlock(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const cap: Voxel[] = [];
  const body: Voxel[] = [];

  // grass cap, full 10x10 footprint at y=6
  const field = toneField(5, 5, rand);
  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++)
      cap.push({ x, y: 6, z, color: grassRamp(sampleField(field, x, z, rand)) });

  // exposed strata walls: 9x9 ring inset half a voxel under the cap overhang
  // (ring spans 0.5..9.5 under the 0..10 cap → even ½-voxel turf overhang)
  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) {
      const onWall = i === 0 || i === 8 || j === 0 || j === 8;
      if (!onWall) continue;
      const x = i + 1;
      const z = j + 1;
      for (let y = 0; y <= 5; y++) {
        // ragged rocky foot — occasional missing voxel at the base
        if (y === 0 && rand() < 0.16) continue;
        let c: number;
        if (y === 5) c = weighted([[PALETTE.soilDark, 0.65], [PALETTE.soil, 0.35]], rand());
        else if (y >= 3) c = weighted([[PALETTE.soil, 0.4], [PALETTE.clay, 0.35], [PALETTE.soilLight, 0.25]], rand());
        else c = weighted([[PALETTE.gravelDark, 0.45], [PALETTE.stone, 0.33], [PALETTE.stoneLight, 0.16], [PALETTE.soilDark, 0.06]], rand());
        body.push({ x, y, z, color: c });
      }
    }

  // woody root snaking down the south face (half-embedded in the wall)
  const root: Array<[number, number]> = [
    [3.0, 5.3],
    [3.5, 4.4],
    [3.5, 3.4],
    [4.0, 2.4],
  ];
  for (let k = 0; k < root.length; k++) {
    const [rx, ry] = root[k];
    body.push({ x: rx, y: ry, z: 9.5, s: 0.55, color: k % 2 ? PALETTE.woodDark : PALETTE.wood });
  }

  // protruding stone chunk on the east face
  body.push({ x: 9.75, y: 1.9, z: 5.5, s: 1.2, color: PALETTE.stone });
  body.push({ x: 9.95, y: 2.6, z: 5.7, s: 0.6, color: PALETTE.stoneLight });

  // cap dressing
  turfLip(cap, rand, 0, 9, 0, 9, 6);
  bladeTufts(cap, rand, 6, 1, 8, 1, 8, 6);
  addFlower(cap, rand, 3, 7, 6);
  cap.push({ x: 7.3, y: 6.4, z: 2.6, s: 0.55, color: PALETTE.gravel });

  return tileGroup([solidMesh(body), solidMesh(cap)], 10);
}

export function makeEdgeCliff(): THREE.Object3D {
  return makeCliffBlock(1501);
}
