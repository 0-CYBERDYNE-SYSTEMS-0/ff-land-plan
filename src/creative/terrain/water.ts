/**
 * Lane A pond tiles — center water (depth-tinted, animated shimmer via tick)
 * and the shoreline transition (grass → mud → shallow → deep water).
 * Animation mutates transforms/opacity only; zero per-frame allocations.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
import {
  Rand, DEEP_WATER, SHALLOW_WATER,
  bladeTufts, addFlower, tileGroup, solidMesh,
  toneField, sampleField, grassRamp, weighted,
} from './shared';

const SHEEN = mixColor(PALETTE.soilWet, PALETTE.waterLight, 0.22);

// --- shared shimmer plumbing -------------------------------------------------

interface Speck {
  mesh: THREE.Mesh;
  bx: number;
  bz: number;
  phase: number;
}

function makeShimmerPlate(w: number, d: number, cx: number, cz: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, 0.16, d);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.waterLight,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const plate = new THREE.Mesh(geo, mat);
  // NOTE: tileGroup() shifts children by (-span/2, 0, -span/2), so local
  // (cx, cz) must be the tile-space center of the water region (0..10 grid).
  plate.position.set(cx, 3.58, cz);
  return plate;
}

function makeSpecks(rand: Rand, count: number, x0: number, x1: number, z0 = 0.7, z1 = 9.3): Speck[] {
  const specks: Speck[] = [];
  const geo = new THREE.BoxGeometry(0.2, 0.06, 0.2);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: mixColor(PALETTE.waterLight, PALETTE.white, 0.55),
      transparent: true,
      opacity: 0.75,
    });
    const m = new THREE.Mesh(geo, mat);
    const bx = x0 + rand() * (x1 - x0);
    const bz = z0 + rand() * (z1 - z0);
    m.position.set(bx, 3.68, bz);
    specks.push({ mesh: m, bx, bz, phase: rand() * Math.PI * 2 });
  }
  return specks;
}

/** Shared idle animation for both pond tiles (reads refs from group userData). */
export function pondTick(obj: THREE.Object3D, t: number): void {
  const g = obj.children[0] as THREE.Group | undefined;
  if (!g) return;
  const plate = g.userData.shimmer as THREE.Mesh | undefined;
  if (plate) {
    plate.position.y = 3.58 + Math.sin(t * 1.6) * 0.05;
    (plate.material as THREE.MeshLambertMaterial).opacity = 0.32 + Math.sin(t * 2.3) * 0.07;
  }
  const specks = g.userData.specks as Speck[] | undefined;
  if (specks) {
    for (const sp of specks)
      sp.mesh.position.x = sp.bx + Math.sin(t * 0.45 + sp.phase) * 0.35;
  }
}

// ---------------------------------------------------------------------------
// Pond center
// ---------------------------------------------------------------------------

function makePondCenter(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];

  // solid water block; tone stratifies with depth AND darkens toward the middle
  for (let x = 0; x <= 9; x++)
    for (let z = 0; z <= 9; z++) {
      const radial = Math.max(Math.abs(x - 4.5), Math.abs(z - 4.5)) / 4.5;
      for (let y = 0; y <= 3; y++) {
        let c: number;
        if (y === 0) c = weighted([[DEEP_WATER, 0.65], [PALETTE.waterDeep, 0.35]], rand());
        else if (y === 1)
          c = weighted([[PALETTE.waterDeep, 0.6], [mixColor(PALETTE.waterDeep, PALETTE.water, 0.5), 0.4]], rand());
        else if (y === 2)
          c = weighted([[mixColor(PALETTE.waterDeep, PALETTE.water, 0.55), 0.6], [PALETTE.water, 0.4]], rand());
        else {
          c = weighted([[PALETTE.water, 0.55], [SHALLOW_WATER, 0.38], [PALETTE.waterLight, 0.07]], rand());
          // surface depth tint: deepens toward the middle of the pond, pales
          // into a shallow rim at the edges so the top face carries a gradient
          c = mixColor(c, PALETTE.waterDeep, 0.52 * (1 - radial));
          if (radial > 0.78) c = mixColor(c, SHALLOW_WATER, 0.35);
        }
        // subsurface darkening under the middle
        if (y < 3 && radial < 0.42) c = mixColor(c, PALETTE.waterDeep, 0.4 - radial * 0.5);
        vx.push({ x, y, z, color: c });
      }
    }

  const water = solidMesh(vx);
  const plate = makeShimmerPlate(9.72, 9.72, 5, 5);
  const specks = makeSpecks(rand, 9, 0.8, 9.2);

  const g = tileGroup([water, plate], 10);
  for (const sp of specks) g.add(sp.mesh);
  g.userData.shimmer = plate;
  g.userData.specks = specks;
  return g;
}

export function makePondCenterEntry(): THREE.Object3D {
  return makePondCenter(1801);
}

// ---------------------------------------------------------------------------
// Pond edge — grass bank → mud → shallow → deep
// ---------------------------------------------------------------------------

/** One-cell wet earthen column under the turf cap. */
function wetColumn(vx: Voxel[], rand: Rand, x: number, z: number): void {
  for (let y = 0; y <= 3; y++)
    vx.push({
      x, y, z,
      color:
        y === 3
          ? weighted([[PALETTE.soilDark, 0.55], [PALETTE.soilWet, 0.25], [PALETTE.soil, 0.2]], rand())
          : weighted([[PALETTE.soil, 0.45], [PALETTE.soilDark, 0.4], [PALETTE.clay, 0.15]], rand()),
    });
}

function makePondEdge(seed: number): THREE.Object3D {
  const rand = rng(seed);
  const vx: Voxel[] = [];
  const bankTone = toneField(5, 5, rand);

  // wandering band boundaries (per-row jitter keeps them organic)
  const gm = [3, 2, 3, 3, 2, 3, 3, 2, 3, 3]; // grass|mud boundary
  const mw = [6, 5, 5, 6, 5, 4, 5, 5, 6, 5]; // mud|water boundary

  // wet earthen column: dark saturated cap over mixed sub-soil
  const mudFlat = (x: number, z: number, waterline: boolean): void => {
    for (let y = 0; y <= 2; y++)
      vx.push({
        x, y, z,
        color: weighted([[PALETTE.soilDark, 0.5], [PALETTE.soilWet, 0.35], [PALETTE.soil, 0.15]], rand()),
      });
    const c = waterline
      ? weighted([[mixColor(PALETTE.sand, PALETTE.soilWet, 0.55), 0.6], [PALETTE.soilWet, 0.4]], rand())
      : weighted([[PALETTE.soilWet, 0.5], [PALETTE.mulch, 0.3], [SHEEN, 0.2]], rand());
    vx.push({ x, y: 3, z, color: c });
  };

  for (let z = 0; z <= 9; z++)
    for (let x = 0; x <= 9; x++) {
      if (x < gm[z]) {
        // grass bank — sits above the waterline
        wetColumn(vx, rand, x, z);
        vx.push({ x, y: 4, z, color: grassRamp(sampleField(bankTone, x, z, rand)) });
        continue;
      }
      if (x < mw[z]) {
        // mud flat between turf and water
        mudFlat(x, z, x === mw[z] - 1);
        continue;
      }
      // full mud ring along the north/south edges (plus ragged toes one row
      // in) so neighbouring turf never meets the waterline directly
      if (z === 0 || z === 9 || ((z === 1 || z === 8) && rand() < 0.4)) {
        mudFlat(x, z, true);
        continue;
      }
      // water — shallows lighten toward the shore, deepens eastward
      const depthIn = x - mw[z];
      for (let y = 0; y <= 3; y++) {
        let c: number;
        if (depthIn < 2) c = weighted([[SHALLOW_WATER, 0.55], [PALETTE.water, 0.45]], rand());
        else if (depthIn < 4)
          c = weighted([[PALETTE.water, 0.6], [mixColor(PALETTE.water, PALETTE.waterDeep, 0.5), 0.4]], rand());
        else
          c = weighted([[mixColor(PALETTE.water, PALETTE.waterDeep, 0.55), 0.55], [PALETTE.waterDeep, 0.45]], rand());
        if (y <= 1 && depthIn >= 3) c = mixColor(c, DEEP_WATER, 0.45);
        vx.push({ x, y, z, color: c });
      }
    }

  // turf lip only along the landy west edge
  for (let z = 0; z <= 9; z++)
    if (rand() < 0.6)
      vx.push({
        x: -0.32, y: 3.82, z, s: 0.6,
        color: weighted([[PALETTE.grassDark, 0.6], [PALETTE.grass, 0.4]], rand()),
      });

  // bank dressing: tufts + one flower on the grass strip
  bladeTufts(vx, rand, 4, 0, 2, 0, 9, 4);
  addFlower(vx, rand, 1, Math.floor(rand() * 9), 4);

  // cattail reeds at the mud line — contiguous stems, warm heads seated on top
  let heads = 0;
  for (const rz of [1, 4, 7]) {
    const rx = gm[rz] + Math.floor(rand() * Math.max(1, mw[rz] - gm[rz]));
    const h = 3 + Math.floor(rand() * 3); // 3..5 stem segments
    for (let k = 0; k < h; k++)
      vx.push({ x: rx, y: 3.65 + k * 0.3, z: rz, s: 0.28, color: k === h - 1 ? PALETTE.leafDark : PALETTE.stem });
    if (heads < 2) {
      const top = 3.65 + (h - 1) * 0.3 + 0.14;
      vx.push({ x: rx, y: top + 0.17, z: rz, s: 0.32, color: mixColor(PALETTE.mulch, PALETTE.wood, 0.45) }); // cattail head
      heads++;
    }
  }

  const land = solidMesh(vx);
  // shimmer plate covers just the water region inside the mud ring
  // (tile-space x ≈ 4.1..9.9, z ≈ 1.4..8.6)
  const plate = makeShimmerPlate(5.8, 7.2, 7, 5);
  const specks = makeSpecks(rand, 3, 5.4, 9.2, 1.8, 8.2);

  const g = tileGroup([land, plate], 10);
  for (const sp of specks) g.add(sp.mesh);
  g.userData.shimmer = plate;
  g.userData.specks = specks;
  return g;
}

export function makePondEdgeEntry(): THREE.Object3D {
  return makePondEdge(1901);
}
