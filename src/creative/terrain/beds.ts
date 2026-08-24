/**
 * Lane A growing beds — the raised-bed cutaway (THE soil-strata hero) and the
 * in-ground bed with turf-blended edges. 10x10 voxel footprints, seeded rng.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import {
  Rand, WET_CLOD,
  dirtBody, turfLip, bladeTufts, addFlower, tileGroup, solidMesh,
  toneField, sampleField, grassRamp, weighted,
} from './shared';

// ---------------------------------------------------------------------------
// Raised bed — cutaway cross-section
// ---------------------------------------------------------------------------

// Warm subsoil ochres — deliberately hue-separated from the grey stony base
// so the exposed face reads as four distinct bands (never a grey smear).
const OCHRE = mixColor(PALETTE.sand, PALETTE.terracotta, 0.35);
const OCHRE_DEEP = mixColor(PALETTE.terracotta, PALETTE.sand, 0.45);

/**
 * Strata tone pickers. Each layer owns a disjoint tone family so the cut face
 * reads as four crisp ~1-voxel bands: chunky bark mulch → near-black topsoil →
 * tan/ochre subsoil → grey stony base. `pure` keeps the exposed cut face crisp
 * (and a touch deeper in the mulch so the band splits from the surface);
 * away from it, layer boundaries get slightly ragged fingers.
 */
function strataTone(y: number, rand: Rand, pure: boolean): number {
  const r0 = rand();
  const borrow = pure ? 0 : r0 < 0.12 ? -1 : r0 > 0.88 ? 1 : 0;
  const yy = Math.max(1, Math.min(4, y + borrow));
  const r = rand();
  switch (yy) {
    case 4: // chunky bark mulch — mid warm browns, clearly lighter than the topsoil
      return pure
        ? weighted(
            [
              [mixColor(PALETTE.plank, PALETTE.woodDark, 0.45), 0.32],
              [PALETTE.mulch, 0.24],
              [mixColor(PALETTE.plankLight, PALETTE.woodDark, 0.4), 0.24],
              [PALETTE.woodDark, 0.2],
            ],
            r,
          )
        : weighted(
            [
              [mixColor(PALETTE.plank, PALETTE.woodDark, 0.3), 0.3],
              [PALETTE.mulch, 0.26],
              [mixColor(PALETTE.plankLight, PALETTE.woodDark, 0.35), 0.24],
              [PALETTE.woodDark, 0.2],
            ],
            r,
          );
    case 3: // rich dark topsoil — near-black chocolate, clearly darker than the mulch
      return weighted(
        [
          [mixColor(PALETTE.soilDark, PALETTE.black, 0.45), 0.46],
          [mixColor(PALETTE.soilDark, PALETTE.black, 0.25), 0.34],
          [PALETTE.soilDark, 0.2],
        ],
        r,
      );
    case 2: // tan/ochre subsoil — the bright warm band, never grey
      return weighted(
        [
          [OCHRE, 0.32],
          [PALETTE.sand, 0.22],
          [OCHRE_DEEP, 0.26],
          [mixColor(PALETTE.sand, PALETTE.straw, 0.5), 0.2],
        ],
        r,
      );
    default: // stony base — grey family with hard stone-speck variation
      return weighted(
        [
          [PALETTE.gravelDark, 0.38],
          [PALETTE.stone, 0.3],
          [PALETTE.stoneLight, 0.14],
          [PALETTE.stoneDark, 0.18],
        ],
        r,
      );
  }
}

function makeRaisedBedCutaway(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const frame: Voxel[] = [];
  const soil: Voxel[] = [];

  // foundation under the interior
  for (let x = 1; x <= 8; x++)
    for (let z = 1; z <= 8; z++)
      soil.push({ x, y: 0, z, color: weighted([[PALETTE.soilDark, 0.6], [PALETTE.mulch, 0.4]], rand()) });

  // interior strata y=1..4 (stony base → ochre subsoil → dark topsoil → mulch);
  // the mulch surface sits one voxel below the timber rim like a real bed
  for (let x = 1; x <= 8; x++)
    for (let z = 1; z <= 8; z++)
      for (let y = 1; y <= 4; y++) {
        // the exposed cut face (z=8 slice adjacent to the removed wall) stays crisp
        soil.push({ x, y, z, color: strataTone(y, rand, z === 8) });
      }

  // bark flecks proud of the exposed mulch band — light chips against the
  // dark humus so the band reads chunky, never as holes
  for (let i = 0; i < 10; i++) {
    soil.push({
      x: 1.3 + rand() * 6.6,
      y: 3.92 + rand() * 0.42,
      z: 8.58 + rand() * 0.2,
      s: 0.28 + rand() * 0.2,
      color: weighted(
        [
          [PALETTE.plank, 0.38],
          [PALETTE.plankLight, 0.3],
          [mixColor(PALETTE.plank, PALETTE.woodDark, 0.55), 0.32],
        ],
        rand(),
      ),
    });
  }

  // ochre clods half-proud in the subsoil band
  for (let i = 0; i < 3; i++)
    soil.push({
      x: 1.7 + rand() * 6.0,
      y: 2.08 + rand() * 0.34,
      z: 8.52 + rand() * 0.16,
      s: 0.3 + rand() * 0.16,
      color: weighted([[OCHRE, 0.5], [OCHRE_DEEP, 0.5]], rand()),
    });

  // stones embedded in the exposed stony base, lumps breaking the plane
  for (let i = 0; i < 6; i++)
    soil.push({
      x: 1.4 + rand() * 6.4,
      y: 1.12 + rand() * 0.4,
      z: 8.52 + rand() * 0.2,
      s: 0.38 + rand() * 0.3,
      color: weighted(
        [
          [PALETTE.stone, 0.35],
          [PALETTE.stoneLight, 0.25],
          [PALETTE.gravel, 0.22],
          [PALETTE.stoneDark, 0.18],
        ],
        rand(),
      ),
    });

  // bark chips + clods proud of the mulch surface
  for (let i = 0; i < 8; i++) {
    const cx = 1.4 + rand() * 6.6;
    const cz = 1.4 + rand() * 6.2;
    soil.push({
      x: cx, y: 4.5, z: cz, s: 0.5 + rand() * 0.25,
      color: weighted([[PALETTE.woodDark, 0.45], [PALETTE.plank, 0.3], [WET_CLOD, 0.25]], rand()),
    });
  }

  // three tiny seedlings in the mulch (leaves overlap the stem top)
  const sprouts: Array<[number, number]> = [[2.6, 3.2], [5.4, 6.4], [7.0, 2.4]];
  for (const [sx, sz] of sprouts) {
    soil.push({ x: sx, y: 4.95, z: sz, s: 0.26, color: PALETTE.stem });
    soil.push({ x: sx - 0.26, y: 5.32, z: sz, s: 0.34, color: PALETTE.leafYoung });
    soil.push({ x: sx + 0.26, y: 5.32, z: sz, s: 0.34, color: mixColor(PALETTE.leafYoung, PALETTE.leafLight, 0.5) });
  }

  // timber walls: back (z=0), left (x=0), right (x=9); front (z=9) cut away.
  // Walls run to the ground (y=0) so the frame never floats.
  const wallVoxel = (x: number, y: number, z: number): void => {
    // horizontal board runs alternate tone; vertical seams every third column
    let c = y % 2 === 0 ? PALETTE.wood : mixColor(PALETTE.wood, PALETTE.woodDark, 0.4);
    if (y === 0) c = mixColor(PALETTE.woodDark, PALETTE.black, 0.15); // damp ground course
    if (x % 3 === 0 || z % 3 === 0) c = mixColor(c, PALETTE.black, 0.14);
    frame.push({ x, y, z, color: c });
  };
  for (let y = 0; y <= 5; y++) {
    for (let x = 0; x <= 9; x++) {
      wallVoxel(x, y, 0); // back wall
      wallVoxel(0, y, x); // left wall
      wallVoxel(9, y, x); // right wall
    }
  }
  // sawn-off front rail: one continuous low, narrow sill between the corner
  // posts so the cut face stays WIDE open — every stratum stays readable above
  let seg = 0;
  for (let rx = 0.85; rx <= 8.15; rx += 0.44, seg++) {
    frame.push({
      x: rx,
      y: 0.25,
      z: 9.2,
      s: 0.5,
      color: seg % 2 ? PALETTE.woodDark : mixColor(PALETTE.woodDark, PALETTE.wood, 0.3),
    });
  }
  // splinter nub where the rail met the left post
  frame.push({ x: 1.18, y: 0.95, z: 9.1, s: 0.5, color: PALETTE.wood });

  // corner posts, proud of the walls with pale end-grain caps
  for (const px of [0, 9])
    for (const pz of [0, 9]) {
      for (let y = 0; y <= 6; y++)
        frame.push({ x: px, y, z: pz, s: 1.12, color: y % 2 ? PALETTE.woodDark : mixColor(PALETTE.woodDark, PALETTE.wood, 0.25) });
      frame.push({ x: px, y: 6.56, z: pz, s: 1.06, color: PALETTE.plankLight });
    }

  // a little spill of topsoil over the cut edge
  soil.push({ x: 3.2, y: 4.35, z: 8.85, s: 0.55, color: PALETTE.soilDark });
  soil.push({ x: 4.0, y: 4.15, z: 9.05, s: 0.42, color: PALETTE.soil });

  return tileGroup([solidMesh(frame), solidMesh(soil)], 10);
}

export function makeBedRaisedCutaway(): THREE.Object3D {
  return makeRaisedBedCutaway(1601);
}

// ---------------------------------------------------------------------------
// In-ground bed — sunken tilled strip blending into turf
// ---------------------------------------------------------------------------

function makeIngroundBed(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];

  // common earthen base
  dirtBody(vx, rand, 0, 9, 0, 9, 2);

  const field = toneField(5, 5, rand);
  const inCore = (x: number, z: number): boolean => x >= 2 && x <= 7 && z >= 2 && z <= 7;
  const inBlend = (x: number, z: number): boolean =>
    !inCore(x, z) && (x === 1 || x === 8 || z === 1 || z === 8);

  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++) {
      if (inCore(x, z)) {
        // hand-tilled sunken strip: directional mini-furrows running
        // north–south (profile across x), rich moist tones
        const h = [2, 3, 3, 2, 2, 3][x - 2];
        let c: number;
        if (h >= 3) c = weighted([[mixColor(PALETTE.soilWet, PALETTE.soilLight, 0.3), 0.45], [PALETTE.soilWet, 0.35], [PALETTE.soil, 0.2]], rand());
        else c = weighted([[PALETTE.soilDark, 0.55], [PALETTE.mulch, 0.3], [PALETTE.soilWet, 0.15]], rand());
        // slow tonal drift along the furrow
        if (rand() < 0.15) c = mixColor(c, PALETTE.soilWet, 0.3);
        vx.push({ x, y: h, z, color: c });
        continue;
      }
      if (inBlend(x, z)) {
        // ragged transition: turf patches, bare spade-cuts, drooping sods
        const r = rand();
        if (r < 0.42) {
          vx.push({ x, y: 3, z, color: grassRamp(sampleField(field, x, z, rand)) });
        } else if (r < 0.72) {
          vx.push({ x, y: 3, z, color: weighted([[PALETTE.soil, 0.6], [PALETTE.soilDark, 0.4]], rand()) });
          if (rand() < 0.35)
            vx.push({ x, y: 3.55, z, s: 0.5, color: grassRamp(sampleField(field, x, z, rand)) }); // turf crumbs
        } else {
          vx.push({ x, y: 3, z, color: grassRamp(sampleField(field, x, z, rand)) });
          // sod hanging into the bed
          const dx = Math.sign(4.5 - x) * 0.55;
          const dz = Math.sign(4.5 - z) * 0.5;
          vx.push({ x: x + dx, y: 2.45, z: z + dz, s: 0.55, color: PALETTE.grassDark });
        }
        continue;
      }
      // outer ring: full turf cap at y=3
      vx.push({ x, y: 3, z, color: grassRamp(sampleField(field, x, z, rand)) });
    }

  // three young transplants in a row down the bed (leaves overlap stems)
  const row: Array<[number, number]> = [[3, 3], [5, 5], [7 - 1, 6]];
  for (const [sx, sz] of row) {
    vx.push({ x: sx, y: 3.6, z: sz, s: 0.28, color: PALETTE.stem });
    vx.push({ x: sx, y: 3.95, z: sz, s: 0.44, color: PALETTE.leafYoung });
  }
  // one stone + a dropped clod for honesty
  vx.push({ x: 2.5, y: 2.75, z: 7.3, s: 0.5, color: PALETTE.gravelDark });
  vx.push({ x: 6.6, y: 2.7, z: 2.6, s: 0.45, color: WET_CLOD });

  turfLip(vx, rand, 0, 9, 0, 9, 3);
  bladeTufts(vx, rand, 4, 0, 9, 0, 9, 3);
  addFlower(vx, rand, 9, 4, 3);

  return tileGroup([solidMesh(vx)], 10);
}

export function makeBedInground(): THREE.Object3D {
  return makeIngroundBed(1701);
}
