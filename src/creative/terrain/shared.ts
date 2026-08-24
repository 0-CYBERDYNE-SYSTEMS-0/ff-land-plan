/**
 * Lane A shared construction helpers — tonal fields, turf, soil bodies,
 * blade tufts, flowers and edge lips. Every helper is deterministic: all
 * randomness flows through the seeded rng handed in by the caller.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, mixColor, voxelMesh } from '@/creative/voxel';

export type Rand = () => number;

// --- precomputed accent tones (module-load mixes are deterministic) ----------
export const DUST = mixColor(PALETTE.soilLight, PALETTE.sand, 0.3);
export const DRY_CLOD = mixColor(PALETTE.soilLight, PALETTE.terracotta, 0.4);
export const WET_RIDGE = mixColor(PALETTE.soilWet, PALETTE.soilLight, 0.42);
export const WET_SLOPE = mixColor(PALETTE.soilWet, PALETTE.soilDark, 0.45);
export const WET_CLOD = mixColor(PALETTE.clay, PALETTE.soilWet, 0.5);
export const SHEEN = mixColor(PALETTE.soilWet, PALETTE.waterLight, 0.3);
export const DEEP_WATER = mixColor(PALETTE.waterDeep, PALETTE.black, 0.16);
export const SHALLOW_WATER = mixColor(PALETTE.water, PALETTE.waterLight, 0.55);

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Pick a color from weighted [color, weight] pairs given r in 0..1. */
export function weighted(colors: Array<[number, number]>, r: number): number {
  let total = 0;
  for (const [, w] of colors) total += w;
  let t = r * total;
  for (const [c, w] of colors) {
    t -= w;
    if (t <= 0) return c;
  }
  return colors[colors.length - 1][0];
}

/** Coarse tonal field (values 0..1) — one cell per 2x2 voxels for organic clumps. */
export function toneField(cols: number, rows: number, rand: Rand): number[][] {
  const f: number[][] = [];
  for (let cx = 0; cx < cols; cx++) {
    const col: number[] = [];
    for (let cz = 0; cz < rows; cz++) col.push(rand());
    f.push(col);
  }
  return f;
}

/** Sample the coarse field with per-voxel jitter. */
export function sampleField(f: number[][], x: number, z: number, rand: Rand, jitter = 0.32): number {
  const cx = clamp(x >> 1, 0, f.length - 1);
  const rz = f[cx] ?? [0.5];
  const cz = clamp(z >> 1, 0, rz.length - 1);
  const base = rz[cz] ?? 0.5;
  return base + (rand() - 0.5) * jitter;
}

/** Three-step ramp pick. */
export function ramp3(v: number, c0: number, c1: number, c2: number): number {
  return v < 0.36 ? c0 : v < 0.72 ? c1 : c2;
}

export function grassRamp(v: number): number {
  return ramp3(v, PALETTE.grassDark, PALETTE.grass, PALETTE.grassLight);
}

/**
 * Dithered earthen body with depth strata (lighter near surface, dark at depth)
 * and scattered stone specks. Covers x0..x1, z0..z1, yBot..yTop inclusive.
 */
export function dirtBody(
  out: Voxel[],
  rand: Rand,
  x0: number, x1: number, z0: number, z1: number,
  yTop: number, yBot = 0,
): void {
  const span = Math.max(1, yTop - yBot);
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++)
      for (let y = yBot; y <= yTop; y++) {
        const depth = (yTop - y) / span;
        const r = rand();
        let c: number;
        if (r < 0.045) {
          c = rand() < 0.5 ? PALETTE.stoneDark : PALETTE.gravelDark;
        } else if (depth > 0.62) {
          c = weighted([[PALETTE.soilDark, 0.55], [PALETTE.soil, 0.45]], rand());
        } else if (depth > 0.28) {
          c = weighted([[PALETTE.soil, 0.5], [PALETTE.soilDark, 0.28], [PALETTE.soilLight, 0.22]], rand());
        } else {
          c = weighted([[PALETTE.soilLight, 0.4], [PALETTE.soil, 0.44], [PALETTE.clay, 0.16]], rand());
        }
        out.push({ x, y, z, color: c });
      }
}

/**
 * Serrated turf lip: half-sunk grass voxels hanging just below the cap edge so
 * neighbouring tiles read as separate turf cuts. Call AFTER the cap exists.
 */
export function turfLip(
  out: Voxel[],
  rand: Rand,
  x0: number, x1: number, z0: number, z1: number,
  yTop: number,
): void {
  const yo = yTop - 0.18;
  const lip = (): number => weighted([[PALETTE.grassDark, 0.6], [PALETTE.grass, 0.4]], rand());
  for (let z = z0; z <= z1; z++) {
    if (rand() < 0.55) out.push({ x: x0 - 0.32, y: yo, z, s: 0.6, color: lip() });
    if (rand() < 0.55) out.push({ x: x1 + 0.32, y: yo, z, s: 0.6, color: lip() });
  }
  for (let x = x0; x <= x1; x++) {
    if (rand() < 0.55) out.push({ x, y: yo, z: z0 - 0.32, s: 0.6, color: lip() });
    if (rand() < 0.55) out.push({ x, y: yo, z: z1 + 0.32, s: 0.6, color: lip() });
  }
}

/**
 * Blade tufts: clusters of thin 1-2 voxel grass blades rising from the surface.
 * Slim sub-voxel columns keep them reading as blades, not cubes.
 */
export function bladeTufts(
  out: Voxel[],
  rand: Rand,
  count: number,
  x0: number, x1: number, z0: number, z1: number,
  yBase: number,
): void {
  const clusters = Math.max(1, Math.round(count / 3));
  for (let ci = 0; ci < clusters; ci++) {
    const cx = Math.round(x0 + rand() * (x1 - x0));
    const cz = Math.round(z0 + rand() * (z1 - z0));
    const n = 2 + Math.floor(rand() * 3);
    for (let bi = 0; bi < n; bi++) {
      const bx = clamp(cx + Math.floor(rand() * 3) - 1, x0, x1);
      const bz = clamp(cz + Math.floor(rand() * 3) - 1, z0, z1);
      const tall = rand() < 0.42;
      const s = 0.26 + rand() * 0.18;
      const base = weighted([[PALETTE.leafLight, 0.4], [PALETTE.stem, 0.32], [PALETTE.leafDark, 0.28]], rand());
      out.push({ x: bx, y: yBase + 0.5, z: bz, s, color: base });
      // tall second segment overlaps the first so blades never read as dashed
      if (tall) out.push({ x: bx, y: yBase + 0.5 + s * 0.85, z: bz, s: s * 0.78, color: PALETTE.leafYoung });
    }
  }
}

/** Tiny wildflower: contiguous stem + rounded blossom head seated on top. */
export function addFlower(out: Voxel[], rand: Rand, x: number, z: number, yBase: number): void {
  const h = rand() < 0.5 ? 2 : 1;
  for (let k = 0; k < h; k++) out.push({ x, y: yBase + 0.4 + k * 0.4, z, s: 0.4, color: PALETTE.stem });
  const head = weighted(
    [
      [PALETTE.flowerWhite, 0.3],
      [PALETTE.flowerYellow, 0.3],
      [PALETTE.flowerPink, 0.24],
      [PALETTE.flowerRed, 0.16],
    ],
    rand(),
  );
  const stemTop = yBase + 0.4 * h + 0.2;
  out.push({ x, y: stemTop + 0.16, z, s: 0.48 + rand() * 0.16, color: head });
}

/** Wrap builder meshes into a group centered near the origin (base at y=0). */
export function tileGroup(meshes: THREE.Object3D[], span: number): THREE.Group {
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  g.position.set(-span / 2, 0, -span / 2);
  return g;
}

/** Standard opaque voxel mesh. */
export function solidMesh(voxels: Voxel[]): THREE.Mesh {
  return voxelMesh(voxels);
}
