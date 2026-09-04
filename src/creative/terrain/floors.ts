/**
 * Lane A interior floor tiles — grow-tent mylar, warehouse concrete and a
 * bright greenhouse walkway slab. Square 24×24 voxel footprints (the ground
 * consumer normalizes the max horizontal dimension to one plan cell), LOW
 * profile: surface at y=3 in the path-height band with a thin slab skirt
 * below. Fully opaque + vertex colored so buildTemplate can merge them —
 * no animated or translucent parts. All randomness is seeded → identical
 * rebuilds every time.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng, voxelMesh } from '@/creative/voxel';

const SPAN = 24;

/** Wrap a finished tile like terrain tileGroup: centered on the origin, base at y=0. */
function finish(vx: Voxel[]): THREE.Object3D {
  const g = group([voxelMesh(vx)]);
  g.position.set(-SPAN / 2, 0, -SPAN / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Grow-tent mylar — near-black reflective sheet with panel seams
// ---------------------------------------------------------------------------

export function makeFloorMylar(): THREE.Object3D {
  const rand = rng(6701);
  const vx: Voxel[] = [];

  const SHEET_A = mixColor(PALETTE.charcoal, PALETTE.black, 0.3);
  const SHEET_B = mixColor(PALETTE.charcoal, PALETTE.black, 0.55);
  const SEAM = mixColor(PALETTE.charcoal, PALETTE.black, 0.78);
  const SLAB_A = mixColor(PALETTE.charcoal, PALETTE.black, 0.6);
  const SLAB_B = mixColor(PALETTE.charcoal, PALETTE.black, 0.8);

  // dark slab body — perimeter skirt only (interior is never visible)
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      if (!(x === 0 || x === SPAN - 1 || z === 0 || z === SPAN - 1)) continue;
      for (let y = 0; y <= 2; y++)
        vx.push({ x, y, z, color: rand() < 0.5 ? SLAB_A : SLAB_B });
    }

  // mylar sheet: two near-black grays dithered, with a 1-voxel darker seam
  // frame inset from each edge so tiling reads as panel seams
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      const seam = x === 1 || x === SPAN - 2 || z === 1 || z === SPAN - 2;
      vx.push({ x, y: 3, z, color: seam ? SEAM : rand() < 0.5 ? SHEET_A : SHEET_B });
    }

  // faint specular sheen: sparse tiny brighter speckles (still dark)
  for (let i = 0; i < 16; i++)
    vx.push({
      x: 2.4 + rand() * (SPAN - 4.8), y: 3.3, z: 2.4 + rand() * (SPAN - 4.8),
      s: 0.22 + rand() * 0.2,
      color: mixColor(SHEET_A, PALETTE.gravel, 0.4),
    });

  return finish(vx);
}

// ---------------------------------------------------------------------------
// Warehouse concrete — mid-gray screed with joint line and stains
// ---------------------------------------------------------------------------

export function makeFloorConcrete(): THREE.Object3D {
  const rand = rng(6801);
  const vx: Voxel[] = [];

  const TOP_A = PALETTE.stoneDark;
  const TOP_B = mixColor(PALETTE.stoneDark, PALETTE.gravelDark, 0.5);
  const TOP_C = mixColor(PALETTE.gravelDark, PALETTE.stone, 0.4);
  const JOINT = mixColor(PALETTE.stoneDark, PALETTE.black, 0.45);
  const SLAB_A = mixColor(PALETTE.stoneDark, PALETTE.black, 0.5);
  const SLAB_B = mixColor(PALETTE.stoneDark, PALETTE.black, 0.68);

  // dark slab body — perimeter skirt only (interior is never visible)
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      if (!(x === 0 || x === SPAN - 1 || z === 0 || z === SPAN - 1)) continue;
      for (let y = 0; y <= 2; y++)
        vx.push({ x, y, z, color: rand() < 0.5 ? SLAB_A : SLAB_B });
    }

  // mid-gray screed dither, with one straight expansion joint across z=8 so
  // adjacent tiles continue the line
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      let c: number;
      if (z === 8) {
        c = rand() < 0.85 ? JOINT : TOP_B;
      } else {
        const r = rand();
        c = r < 0.45 ? TOP_A : r < 0.8 ? TOP_B : TOP_C;
      }
      vx.push({ x, y: 3, z, color: c });
    }

  // sparse small stains: darker blotches pooled on the surface
  for (let i = 0; i < 5; i++) {
    const cx = 3 + rand() * (SPAN - 6);
    const cz = 3 + rand() * (SPAN - 6);
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++)
      vx.push({
        x: cx + (rand() - 0.5) * 2.4, y: 3.14, z: cz + (rand() - 0.5) * 2.4,
        s: 0.6 + rand() * 0.5,
        color: mixColor(TOP_A, PALETTE.black, 0.16),
      });
  }

  return finish(vx);
}

// ---------------------------------------------------------------------------
// Greenhouse floor — pale walkway with soil-toned border bands
// ---------------------------------------------------------------------------

export function makeFloorGreenhouse(): THREE.Object3D {
  const rand = rng(6901);
  const vx: Voxel[] = [];

  const WALK_A = mixColor(PALETTE.stoneLight, PALETTE.white, 0.35);
  const WALK_B = PALETTE.gravel;
  const WALK_C = mixColor(PALETTE.stoneLight, PALETTE.gravel, 0.5);
  const BORDER_A = mixColor(PALETTE.clay, PALETTE.soilLight, 0.4);
  const BORDER_B = mixColor(PALETTE.clay, PALETTE.gravelDark, 0.3);
  const SLAB_A = mixColor(PALETTE.stoneDark, PALETTE.clay, 0.35);
  const SLAB_B = mixColor(PALETTE.stoneDark, PALETTE.black, 0.55);

  // earth-tone slab body — perimeter skirt only (interior is never visible)
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      if (!(x === 0 || x === SPAN - 1 || z === 0 || z === SPAN - 1)) continue;
      for (let y = 0; y <= 2; y++)
        vx.push({ x, y, z, color: rand() < 0.5 ? SLAB_A : SLAB_B });
    }

  // pale walkway center, slightly darker soil-toned band on the north/south
  // edges — kept LIGHT so the tile reads as a bright interior
  const inBand = (z: number): boolean => z <= 3 || z >= SPAN - 4;
  for (let x = 0; x < SPAN; x++)
    for (let z = 0; z < SPAN; z++) {
      let c: number;
      if (inBand(z)) {
        c = rand() < 0.6 ? BORDER_A : BORDER_B;
      } else {
        const r = rand();
        c = r < 0.42 ? WALK_A : r < 0.75 ? WALK_C : WALK_B;
      }
      vx.push({ x, y: 3, z, color: c });
    }

  // a few tiny gravel speckles on the walkway
  for (let i = 0; i < 18; i++)
    vx.push({
      x: 1.5 + rand() * (SPAN - 3), y: 3.3, z: 4.5 + rand() * (SPAN - 9),
      s: 0.24 + rand() * 0.18,
      color: rand() < 0.5 ? PALETTE.gravelDark : PALETTE.stone,
    });

  return finish(vx);
}
