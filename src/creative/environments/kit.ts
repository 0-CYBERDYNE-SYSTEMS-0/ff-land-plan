/**
 * Environment kit — shared tones + primitive helpers for the environments
 * lane (parametric shells, interior equipment, lane-E dioramas). Same
 * construction language as structures/shared.ts but local to this lane so
 * shells and interiors share one voice: 1 voxel = 10 cm, ground plane y = 0,
 * seeded rng only, PALETTE-derived tones, fresh meshes per call.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, buildVoxelGeometry, mixColor } from '@/creative/voxel';

export type Rand = () => number;

/** Lane tones — all derived from PALETTE at module load (deterministic). */
export const T = {
  // tent canvas + reflective lining
  canvas: mixColor(PALETTE.black, PALETTE.charcoal, 0.42),
  canvasBand: mixColor(PALETTE.charcoal, PALETTE.metalDark, 0.3),
  mylar: mixColor(PALETTE.white, PALETTE.metal, 0.16),
  mylarSeam: mixColor(PALETTE.metal, PALETTE.white, 0.45),
  // painted grow-room walls
  paintUpper: mixColor(PALETTE.wool, PALETTE.cream, 0.42),
  paintLower: mixColor(PALETTE.sand, PALETTE.wool, 0.45),
  paintTrim: mixColor(PALETTE.gravelDark, PALETTE.charcoal, 0.4),
  // glazing + screens
  glassPane: mixColor(PALETTE.glass, PALETTE.glassDim, 0.35),
  screenCloth: mixColor(PALETTE.woolWhite, PALETTE.white, 0.35),
  // steel + plastic kit
  galvDark: mixColor(PALETTE.metal, PALETTE.metalDark, 0.45),
  trayWhite: mixColor(PALETTE.woolWhite, PALETTE.white, 0.5),
  pipeBlack: mixColor(PALETTE.black, PALETTE.charcoal, 0.5),
  // warehouse shell + floors
  panelDark: mixColor(PALETTE.charcoal, PALETTE.metalDark, 0.5),
  panelSeam: mixColor(PALETTE.black, PALETTE.charcoal, 0.55),
  concrete: mixColor(PALETTE.stoneDark, PALETTE.gravelDark, 0.42),
  concreteLight: mixColor(PALETTE.stone, PALETTE.gravel, 0.55),
  tape: mixColor(PALETTE.cornGold, PALETTE.flowerYellow, 0.45),
  // container farm
  rust: mixColor(PALETTE.terracotta, PALETTE.woodDark, 0.42),
  rustDark: mixColor(PALETTE.terracotta, PALETTE.black, 0.38),
  rustLight: mixColor(PALETTE.terracotta, PALETTE.straw, 0.3),
  // unlit glow reads (MeshBasicMaterial, vertex colors only — never a light)
  glowWarm: mixColor(PALETTE.flowerYellow, PALETTE.white, 0.62),
  glowWarmHot: mixColor(PALETTE.flowerYellow, PALETTE.white, 0.85),
  glowPink: mixColor(PALETTE.flowerPink, PALETTE.white, 0.4),
  glowPinkHot: mixColor(PALETTE.flowerPink, PALETTE.white, 0.7),
  ledGreen: mixColor(PALETTE.leafLight, PALETTE.white, 0.45),
  screenGlow: PALETTE.glass,
  // water + vessels
  waterEdge: mixColor(PALETTE.waterLight, PALETTE.water, 0.4),
  tankBlue: mixColor(PALETTE.berryBlue, PALETTE.water, 0.3),
  tankBlueDark: mixColor(PALETTE.berryBlue, PALETTE.black, 0.35),
  drumBlue: mixColor(PALETTE.berryBlue, PALETTE.metal, 0.15),
  // ducting
  ductLight: mixColor(PALETTE.metal, PALETTE.white, 0.3),
  filmRoll: mixColor(PALETTE.polyFilm, PALETTE.gravelDark, 0.38),
} as const;

/** Opaque merged voxel mesh (lambert + vertex colors). Fresh per call. */
export function solidMesh(voxels: Voxel[]): THREE.Mesh {
  return new THREE.Mesh(buildVoxelGeometry(voxels), new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Translucent panel mesh (glass / poly film / domes) — flat tint. */
export function paneMesh(voxels: Voxel[], opacity: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    buildVoxelGeometry(voxels),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

/**
 * Unlit glow mesh — bright vertex colors on a basic material so LEDs read as
 * luminous without adding a single light (sky.ts owns THE light).
 */
export function glowMesh(voxels: Voxel[]): THREE.Mesh {
  return new THREE.Mesh(buildVoxelGeometry(voxels), new THREE.MeshBasicMaterial({ vertexColors: true }));
}

/**
 * Stacked-voxel vertical cylinder shell (open top and bottom), rings every
 * `step` in y. `tone(y, angle)` picks the color so callers bake sheen bands.
 */
export function cylShell(
  out: Voxel[],
  cx: number, cz: number,
  y0: number, y1: number,
  radius: number,
  tone: (y: number, a: number) => number,
  step = 1,
): void {
  // ~8-sided stacked-voxel silhouette (quality bar: no smooth cylinders);
  // dot count sized so adjacent cubes just kiss for a watertight ring
  const s = Math.max(0.55, radius * 0.85);
  const n = Math.max(8, Math.ceil((2 * Math.PI * radius) / (s * 0.95)));
  for (let y = y0; y <= y1; y += step) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({
        x: cx + Math.cos(a) * radius,
        y: y + step / 2,
        z: cz + Math.sin(a) * radius,
        s: Math.max(0.55, radius * 0.85),
        color: tone(y, a),
      });
    }
  }
}

/** Filled horizontal disc of cubes (tank water, drum caps). */
export function disc(
  out: Voxel[],
  cx: number, cz: number, y: number,
  radius: number, s: number,
  tone: (dx: number, dz: number) => number,
): void {
  const st = s * 0.95;
  for (let dx = -radius; dx <= radius; dx += st)
    for (let dz = -radius; dz <= radius; dz += st)
      if (dx * dx + dz * dz <= radius * radius)
        out.push({ x: cx + dx, y, z: cz + dz, s, color: tone(dx, dz) });
}

/** Horizontal duct run along X: rings of cubes every `step` (flex-duct read). */
export function ductX(
  out: Voxel[],
  x0: number, x1: number,
  y: number, z: number,
  radius: number,
  tone: (x: number, i: number) => number,
  step = 1.15,
): void {
  const n = Math.max(7, Math.round(radius * 5.5));
  for (let x = x0; x <= x1; x += step)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({
        x: x + step / 2,
        y: y + Math.sin(a) * radius,
        z: z + Math.cos(a) * radius,
        s: Math.max(0.5, radius * 0.8),
        color: tone(x, i),
      });
    }
}
