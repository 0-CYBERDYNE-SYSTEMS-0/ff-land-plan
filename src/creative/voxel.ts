/**
 * Shared procedural voxel kit for the creative asset pipeline.
 * Pure three.js — no React. Builders compose assets from these primitives so
 * every asset in the game shares one visual language (palette, AO shading,
 * edge treatment, proportions).
 */
import * as THREE from 'three';

export type Voxel = {
  /** grid cell, integer voxel units */
  x: number;
  y: number;
  z: number;
  /** size in voxel units (defaults 1) */
  s?: number;
  color: number;
  /** true for soil-pad voxels (soilPad/soilPadEllipse) — the renderer splits
   *  these into a named 'pad' group so pads can be instanced/tinted per cell
   *  (SPEC-GROWTH-VISUAL wave 4). Showcase/ghost paths render them as ever. */
  pad?: boolean;
};

/** Curated master palette — Minecraft-adjacent saturation, slightly warmer. */
export const PALETTE = {
  soilDark: 0x3d2b1f,
  soil: 0x5a4030,
  soilLight: 0x6f5233,
  soilWet: 0x4a3423,
  mulch: 0x4e3a26,
  gravel: 0x9a938a,
  gravelDark: 0x7d766d,
  stone: 0x8f8f94,
  stoneLight: 0xa8a8ad,
  stoneDark: 0x6c6c71,
  sand: 0xd8c48a,
  wood: 0x8a5a33,
  woodDark: 0x6b4526,
  woodLight: 0xa8763f,
  plank: 0xb0854d,
  plankLight: 0xc79a5f,
  leaf: 0x4e8f3a,
  leafDark: 0x3a7029,
  leafLight: 0x67ab48,
  leafYoung: 0x8bc34a,
  sprout: 0x9ccc65,
  stem: 0x5d9942,
  grass: 0x6cae44,
  grassDark: 0x559238,
  grassLight: 0x7fc04e,
  water: 0x3f8fce,
  waterDeep: 0x2f6fa8,
  waterLight: 0x6fb4e4,
  metal: 0x9aa2a8,
  metalDark: 0x3f464b,
  iron: 0x5b6770,
  ironDark: 0x434c53,
  copper: 0xb87333,
  terracotta: 0xb0603f,
  clay: 0xa98467,
  white: 0xf2efe6,
  cream: 0xe8e2d0,
  glass: 0xbfe3ef,
  glassDim: 0x9fc9d8,
  polyFilm: 0xdceef2,
  black: 0x2a2a2e,
  charcoal: 0x3b3b40,
  straw: 0xd9b45b,
  hay: 0xc9a44a,
  woolWhite: 0xf0ece0,
  wool: 0xdcd6c4,
  chickenWhite: 0xf5f2ea,
  chickenRed: 0xc4392f,
  chickenOrange: 0xe08a2d,
  cowBrown: 0x6e4a2f,
  cowWhite: 0xe9e2d4,
  cowDark: 0x4a3220,
  pigPink: 0xdb9d97,
  pigDark: 0xc4857f,
  duckWhite: 0xf2ede0,
  duckBill: 0xe0912c,
  goatGrey: 0xb3aca2,
  beeYellow: 0xe8b62c,
  beeBlack: 0x3a3226,
  flowerRed: 0xd94f3d,
  flowerYellow: 0xf2c53d,
  flowerOrange: 0xe8842d,
  flowerPurple: 0x9a5bc4,
  flowerWhite: 0xf5f0e6,
  flowerPink: 0xe884a8,
  fruitRed: 0xd8402f,
  tomato: 0xe04b32,
  pepperRed: 0xc93a2a,
  pepperYellow: 0xe8c33a,
  eggplant: 0x4a2a6b,
  pumpkin: 0xe07826,
  carrot: 0xe0762a,
  potato: 0xc2a468,
  beet: 0x8e2f4f,
  radish: 0xd84a6b,
  cornGold: 0xe8c84a,
  wheat: 0xd4b45a,
  wheatGreen: 0x9ab84e,
  berryRed: 0xd03a3a,
  berryBlue: 0x4a5fa8,
  berryDark: 0x35244a,
  shadow: 0x2f2418,
} as const;

export const colorHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Per-face brightness multipliers for baked directional shading (no lights needed for review). */
export const FACE_SHADE = {
  px: 0.80, // +X east
  nx: 0.80, // -X west
  py: 1.0, // top
  ny: 0.55, // bottom
  pz: 0.92, // +Z south
  nz: 0.70, // -Z north
} as const;

/**
 * Build a merged BufferGeometry from voxels with baked per-face shading
 * (top brightest, north darkest) so assets read crisply even in flat light.
 * Returns geometry in voxel units — caller scales/positions the mesh.
 */
export function buildVoxelGeometry(voxels: Voxel[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = new THREE.Color();

  const faceDefs: Array<{
    dir: [number, number, number];
    corners: Array<[number, number, number]>;
    shade: number;
  }> = [
    { dir: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], shade: FACE_SHADE.px },
    { dir: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], shade: FACE_SHADE.nx },
    { dir: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], shade: FACE_SHADE.py },
    { dir: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], shade: FACE_SHADE.ny },
    { dir: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], shade: FACE_SHADE.pz },
    { dir: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], shade: FACE_SHADE.nz },
  ];

  for (const v of voxels) {
    const sx = (v.s ?? 1) / 2;
    const sy = (v.s ?? 1) / 2;
    const sz = (v.s ?? 1) / 2;
    c.set(v.color);
    for (const f of faceDefs) {
      const [dx, dy, dz] = f.dir;
      const b = c.clone().multiplyScalar(f.shade);
      const base = positions.length / 3;
      for (const [cx, cy, cz] of f.corners) {
        positions.push(v.x + cx * sx, v.y + cy * sy, v.z + cz * sz);
        normals.push(dx, dy, dz);
        colors.push(b.r, b.g, b.b);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

/** Mesh from voxels with vertex colors; material shared per-call. */
export function voxelMesh(voxels: Voxel[]): THREE.Mesh {
  const geo = buildVoxelGeometry(voxels);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

/**
 * Deterministic PRNG (mulberry32). Same seed → same asset, every rebuild.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Mix two hex colors, t=0 → a, t=1 → b. */
export function mixColor(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const out = ca.lerp(cb, t);
  return out.getHex();
}

/**
 * Growth-stage color ramp: young (bright, yellow-green) → mature (deep).
 * t = growth 0..1.
 */
export function growthLeafColor(young: number, mature: number, t: number): number {
  return mixColor(young, mature, Math.min(1, Math.max(0, t)) * 0.85);
}

/** Group a list of meshes under one Object3D, returns the group. */
export function group(meshes: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}

/**
 * Simple ground-anchored blob shadow (soft dark disc, cheap and clean).
 */
export function blobShadow(radius: number, opacity = 0.22): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.shadow,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}

/** Standard material for instanced crops/structures (vertex colors, lambert). */
export function lambert(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/** Flat-shaded water material with slight transparency. */
export function waterMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: PALETTE.water,
    transparent: true,
    opacity: 0.85,
  });
}

/** Translucent glass for greenhouse panels. */
export function glassMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: PALETTE.glass,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
}

/**
 * Voxel helper: fill a rectangular run of voxels (axis-aligned).
 * Keeps builders terse: fill(x0,y0,z0, x1,y1,z1, color).
 */
export function fill(
  out: Voxel[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  color: number,
): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        out.push({ x, y, z, color });
}

/**
 * Checker-dither a filled region between two colors (soil texture without textures).
 */
export function fillDither(
  out: Voxel[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  colorA: number, colorB: number, seed = 1,
): void {
  const rand = rng(seed);
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        out.push({ x, y, z, color: rand() > 0.5 ? colorA : colorB });
}
