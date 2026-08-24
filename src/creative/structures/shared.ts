/**
 * Lane C shared construction helpers — weathered plank tones, proud posts,
 * stepped gable roofs, stone foundations, hardware. Every helper is
 * deterministic: all randomness flows through the seeded rng handed in.
 * Scale language: 1 voxel = 10 cm; ground plane at y = 0.
 */
import * as THREE from 'three';
import {
  PALETTE,
  Voxel,
  buildVoxelGeometry,
  mixColor,
  rng,
} from '@/creative/voxel';

export type Rand = () => number;

// --- precomputed accent tones (module-load mixes are deterministic) ----------
export const C = {
  // barn / shed cladding
  barnRed: mixColor(PALETTE.pepperRed, PALETTE.black, 0.16),
  barnRedMid: mixColor(PALETTE.pepperRed, PALETTE.black, 0.3),
  barnRedDark: mixColor(PALETTE.pepperRed, PALETTE.black, 0.46),
  trimWhite: mixColor(PALETTE.white, PALETTE.cream, 0.5),
  trimShadow: mixColor(PALETTE.cream, PALETTE.black, 0.18),
  shingle: mixColor(PALETTE.charcoal, PALETTE.stoneDark, 0.55),
  shingleLight: mixColor(PALETTE.stoneDark, PALETTE.gravel, 0.5),
  shingleDark: mixColor(PALETTE.charcoal, PALETTE.black, 0.4),
  roofPlank: mixColor(PALETTE.woodDark, PALETTE.charcoal, 0.35),
  roofPlankDark: mixColor(PALETTE.woodDark, PALETTE.black, 0.3),
  postWood: mixColor(PALETTE.woodDark, PALETTE.black, 0.12),
  postWoodLight: mixColor(PALETTE.wood, PALETTE.woodDark, 0.3),
  plankWeathered: mixColor(PALETTE.plank, PALETTE.woodDark, 0.25),
  plankGrey: mixColor(PALETTE.plank, PALETTE.gravelDark, 0.45),
  coopWall: mixColor(PALETTE.plank, PALETTE.wood, 0.55),
  coopRoof: mixColor(PALETTE.woodDark, PALETTE.charcoal, 0.45),
  frameWhite: mixColor(PALETTE.white, PALETTE.gravel, 0.22),
  filmWhite: PALETTE.polyFilm,
  glassPane: mixColor(PALETTE.glass, PALETTE.glassDim, 0.35),
  waterTint: mixColor(PALETTE.waterLight, PALETTE.water, 0.5),
  pipeBlack: mixColor(PALETTE.black, PALETTE.charcoal, 0.5),
  strawDark: mixColor(PALETTE.hay, PALETTE.mulch, 0.35),
  shirtRed: mixColor(PALETTE.tomato, PALETTE.pepperRed, 0.5),
  shirtBlue: mixColor(PALETTE.berryBlue, PALETTE.metal, 0.35),
} as const;

/** Pick a tone from weighted [color, weight] pairs given r in 0..1. */
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

/**
 * Weathered plank pick — three-tone weighted choice for horizontal board runs
 * so walls read as individual boards without random noise.
 */
export function plankTone(rand: Rand, mid = C.barnRed, dark = C.barnRedDark, light = C.barnRed): number {
  return weighted(
    [
      [dark, 0.2],
      [mid, 0.56],
      [light, 0.24],
    ],
    rand(),
  );
}

/** Solid box fill with a per-cell color callback (return null to skip). */
export function boxFn(
  out: Voxel[],
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number,
  fn: (x: number, y: number, z: number) => number | null,
): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
        const c = fn(x, y, z);
        if (c !== null) out.push({ x, y, z, color: c });
      }
}

/** Stone foundation course under a wall ring — dithered rubble, proud corners. */
export function stoneFoundation(
  out: Voxel[],
  rand: Rand,
  x0: number, x1: number,
  z0: number, z1: number,
  yTop = 1,
  yBase = 0,
): void {
  const rubble = (): number =>
    weighted(
      [
        [PALETTE.stoneDark, 0.34],
        [PALETTE.stone, 0.42],
        [PALETTE.stoneLight, 0.16],
        [PALETTE.gravelDark, 0.08],
      ],
      rand(),
    );
  for (let y = yBase; y <= yTop; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        out.push({ x, y, z, s: 1.05 + (y === yBase ? 0.03 : 0), color: rubble() });
      }
  // quoin stones at the four corners read as bigger footings
  for (const cx of [x0, x1])
    for (const cz of [z0, z1])
      out.push({ x: cx, y: yBase, z: cz, s: 1.22, color: PALETTE.stone });
}

/**
 * Stepped gable profile: symmetric staircase of `run`-wide treads rising
 * toward the center. `ovl`/`ovr` are eave-overhang columns kept at step 0
 * so the roof lands exactly on the wall tops (no floating gaps).
 * Returns step index per column, 0 at both wall lines, peaking at center.
 */
export function steppedProfile(total: number, run: number, ovl = 0, ovr = 0): { idx: number[]; steps: number } {
  const cap = Math.ceil((total - ovl - ovr) / (2 * run));
  const idx: number[] = [];
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const l = Math.min(cap, Math.max(0, Math.floor((i - ovl) / run)));
    const r = Math.min(cap, Math.max(0, Math.floor((total - 1 - i - ovr) / run)));
    const v = Math.min(l, r);
    idx.push(v);
    if (v > peak) peak = v;
  }
  return { idx, steps: peak };
}

/**
 * Watertight stepped gable roof shell across the X axis, sloping in Z.
 * The profile rises along Z toward the ridge; slabs run the full X span.
 * Paints barge/fascia boards via `edgeTone` on the two gable-end columns.
 */
export function steppedGableRoof(
  out: Voxel[],
  rand: Rand,
  opts: {
    x0: number; x1: number;          // slab run incl. gable overhang
    zProfileFrom: number;            // first profile column (eave side)
    profile: number[];               // step index per column (from eave)
    baseY: number;                   // slab height at step 0
    rise: number;
    tone?: (step: number, r: number) => number;
    riserTone?: number;              // shadow tone for the vertical step faces
    edgeTone?: number;               // barge boards at x0/x1 ends
    fasciaTone?: number;             // eave fascia under step-0 outer edge
  },
): void {
  const tone =
    opts.tone ??
    ((step: number, r: number) => {
      void step;
      return r < 0.16 ? C.shingleDark : r > 0.94 ? C.shingleLight : C.shingle;
    });
  const riserTone = opts.riserTone ?? C.shingleDark;
  for (let i = 0; i < opts.profile.length; i++) {
    const z = opts.zProfileFrom + i;
    const topY = opts.baseY + opts.profile[i] * opts.rise;
    const prevTop = i > 0 ? opts.baseY + opts.profile[i - 1] * opts.rise : topY;
    for (let x = opts.x0; x <= opts.x1; x++) {
      for (let y = prevTop; y <= topY; y++) {
        const isEdge = x === opts.x0 || x === opts.x1;
        const isRiser = y < topY;
        const c = isEdge && opts.edgeTone !== undefined
          ? opts.edgeTone
          : isRiser
            ? riserTone
            : tone(opts.profile[i], rand());
        out.push({ x, y, z, color: c });
      }
    }
  }
  if (opts.fasciaTone !== undefined) {
    const zEave = opts.zProfileFrom;
    for (let x = opts.x0; x <= opts.x1; x++)
      out.push({ x, y: opts.baseY - 1, z: zEave, color: opts.fasciaTone });
  }
}

/** Ridge cap running along X over the peak — proud, dark, slightly oversized. */
export function ridgeCapX(out: Voxel[], x0: number, x1: number, zCenterA: number, zCenterB: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    out.push({ x, y, z: zCenterA, s: 1.12, color: C.shingleDark });
    if (zCenterB !== zCenterA) out.push({ x, y, z: zCenterB, s: 1.12, color: C.shingleDark });
    out.push({ x, y: y + 0.62, z: (zCenterA + zCenterB) / 2, s: 1.04, color: mixColor(C.shingleDark, PALETTE.black, 0.3) });
  }
}

/**
 * Proud corner post with pale end-grain cap. `s` sizes the post so it
 * stands proud of the wall plane; posts run past the eaves and get capped.
 */
export function cornerPost(out: Voxel[], rand: Rand, x: number, z: number, y0: number, y1: number, size = 1.28): void {
  for (let y = y0; y <= y1; y++) {
    const c = y % 3 === 0 ? mixColor(C.postWood, PALETTE.black, 0.12) : rand() < 0.2 ? C.postWood : C.postWoodLight;
    out.push({ x, y, z, s: size, color: c });
  }
  out.push({ x, y: y1 + 0.58, z, s: size * 0.92, color: PALETTE.plankLight });
}

/** Horizontal plank-band wall between two wall planes, rng-dithered runs. */
export function plankBandWall(
  out: Voxel[],
  rand: Rand,
  cells: number[],                  // wall-plane cell coordinates along the wall
  y0: number, y1: number,
  fixed: (cell: number) => { x: number; z: number }, // map cell → position
  bandHeight = 2,
  palette: 'barn' | 'timber' = 'barn',
): void {
  const bands = Math.ceil((y1 - y0 + 1) / bandHeight);
  const tones: number[] = [];
  for (let b = 0; b < bands; b++)
    tones.push(palette === 'barn' ? plankTone(rand) : plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank));
  for (const cell of cells) {
    const { x, z } = fixed(cell);
    for (let y = y0; y <= y1; y++) {
      const band = Math.floor((y - y0) / bandHeight);
      let c = tones[band] ?? tones[tones.length - 1];
      const r = rand();
      if (r < 0.07) c = mixColor(c, PALETTE.black, 0.22);
      else if (r > 0.94) c = mixColor(c, PALETTE.cream, 0.16);
      out.push({ x, y, z, color: c });
    }
  }
}

/** Iron strap hinge — two dark plates + pintle knobs, proud of the surface. */
export function strapHinge(out: Voxel[], x: number, y: number, z: number, along: 'x' | 'z', len = 3): void {
  for (let i = 0; i < len; i++) {
    const px = along === 'x' ? x + i : x;
    const pz = along === 'z' ? z + i : z;
    out.push({ x: px, y, z: pz, s: 1.06, color: i === len - 1 ? PALETTE.metal : PALETTE.ironDark });
  }
  out.push({ x, y: y + 0.45, z, s: 0.6, color: PALETTE.metalDark });
}

/** Merged mesh for opaque voxel batches. */
export function solidMesh(voxels: Voxel[]): THREE.Mesh {
  return new THREE.Mesh(buildVoxelGeometry(voxels), new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Translucent panel mesh (glass / poly film). Vertex colors are ignored — flat tint. */
export function paneMesh(voxels: Voxel[], opacity: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    buildVoxelGeometry(voxels),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

/** Deterministic seed helper so every maker can pin its own stream. */
export const seeded = (seed: number): Rand => rng(seed);
