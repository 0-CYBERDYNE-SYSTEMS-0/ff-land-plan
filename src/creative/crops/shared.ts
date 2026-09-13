/**
 * Lane B shared crop kit — types, palette ramps and voxel-shape helpers
 * built on top of src/creative/voxel.ts.
 *
 * Conventions:
 *  - 1 voxel = 10 cm. Plants sit on a dithered soil pad whose top face is y=0;
 *    everything grows upward from there.
 *  - Builders are `(stage: number, pal?: CropPalette) => THREE.Group`,
 *    fully deterministic via seeded rng.
 *  - Foliage/fruit go into `swayV` (a child group named 'sway' so the future
 *    wind system can animate them); stems/stakes/trellis/soil stay static.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, voxelMesh, mixColor, rng } from '@/creative/voxel';

/** Per-crop recolorable fields. Archetypes ship a default; map.ts overrides. */
export interface CropPalette {
  /** s0–s1 foliage (bright yellow-green) */
  young: number;
  /** mature foliage base (deep) */
  mature: number;
  /** shadow tone for leaf edges / underside texture */
  dark: number;
  /** highlight tone — veins, gloss tips */
  light: number;
  /** stems & petioles */
  stem: number;
  /** flowers */
  accent: number;
  /** ripe fruit / head color ("pick me") */
  fruit: number;
  /** unripe fruit / early head color */
  unripe: number;
  /** OPTIONAL severe-stress foliage tone (STATE_TONES.stress fallback) */
  stress?: number;
  /** OPTIONAL desiccated/dead foliage tone (STATE_TONES.dead fallback) */
  dead?: number;
  /** OPTIONAL harvest stubble tone (STATE_TONES.stubble fallback) */
  stubble?: number;
}

/* ------------------------------------------------------------------ */
/* lifecycle state geometry (SPEC-GROWTH-VISUAL §2.2 Tier 2)            */
/* ------------------------------------------------------------------ */

/** Lifecycle states that may get dedicated geometry (single pose each). */
export type PlantStateVisual = 'dead' | 'harvested' | 'overripe';

/**
 * State builder contract: one pose per state (no stage axis — a dead plant
 * reads "finished" regardless of the stage it reached). Same rules as stage
 * builders: deterministic (seeded rng only), soil pad optional, foliage in a
 * 'sway' child, plan-view readable.
 *
 * Height: the renderer normalizes state geometry to
 * `fullHeight × (group.userData.heightFactor ?? STATE_HEIGHT_FACTOR[state])` —
 * set `userData.heightFactor` (0..1) on the returned group when the default
 * factor is wrong for the crop (e.g. a fruit tree's "harvested" keeps the
 * full canopy: heightFactor 1).
 */
export type StateBuilder = (pal: CropPalette) => THREE.Group;

/** Per-archetype optional state builders (empty object = not authored yet). */
export interface ArchetypeStates {
  dead?: StateBuilder;
  harvested?: StateBuilder;
  overripe?: StateBuilder;
}

/**
 * Canonical height factors for state templates — the renderer normalizes
 * state geometry to `fullHeight × factor` so every crop's states read at
 * consistent relative sizes (dead collapses, harvested is ground-hugging).
 */
export const STATE_HEIGHT_FACTOR: Record<PlantStateVisual, number> = {
  dead: 0.55,
  harvested: 0.3,
  overripe: 0.95,
};

/** Fallback lifecycle tones for palettes without explicit slots. */
export const STATE_TONES = {
  /** severe-stress foliage: dry yellow-brown */
  stress: 0xb39b4a,
  /** desiccated dead foliage: grey-brown */
  dead: 0x8d7a58,
  /** cut stubble / harvest residue: straw tan */
  stubble: 0xc4a86a,
} as const;

export const stageT = (s: number): number => Math.min(1, Math.max(0, s / 5));

/** Foliage base color at a stage — bright seedling green deepens with age. */
export function foliage(pal: CropPalette, s: number): number {
  return mixColor(pal.young, pal.mature, stageT(s));
}
export const shade = (c: number, toward: number, k: number): number => mixColor(c, toward, k);

/* ------------------------------------------------------------------ */
/* low-level voxel painting                                            */
/* ------------------------------------------------------------------ */

export function put(out: Voxel[], x: number, y: number, z: number, c: number, s?: number): void {
  if (s === undefined) out.push({ x, y, z, color: c });
  else out.push({ x, y, z, color: c, s });
}

const key = (x: number, y: number, z: number): number =>
  (x + 512) + (y + 512) * 1024 + (z + 512) * 1048576;

/** 3D voxel line (Bresenham-style sampling, deduped). */
export function vline(
  out: Voxel[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  c: number,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2 + 1;
  const seen = new Set<number>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    const k = key(x, y, z);
    if (!seen.has(k)) { seen.add(k); put(out, x, y, z, c); }
  }
}

export interface BlobOpts {
  shell?: boolean;      // only the outer surface (canopies)
  seed?: number;        // two-tone dither seed
  stripe?: boolean;     // vertical darker stripes (pumpkin ribs)
}

/** Ellipsoid blob, optionally shelled and/or two-tone dithered. */
export function blob(
  out: Voxel[],
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number,
  cA: number, cB: number | null,
  opts: BlobOpts = {},
): void {
  const rnd = rng(opts.seed ?? 1);
  const inside = (x: number, y: number, z: number): boolean => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
    return dx * dx + dy * dy + dz * dz <= 1;
  };
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        if (!inside(x, y, z)) continue;
        if (opts.shell &&
          inside(x + 1, y, z) && inside(x - 1, y, z) &&
          inside(x, y + 1, z) && inside(x, y - 1, z) &&
          inside(x, y, z + 1) && inside(x, y, z - 1)) continue;
        let c = cA;
        if (cB !== null && rnd() < 0.45) c = cB;
        if (opts.stripe && ((x % 2 === 0 && z % 3 !== 0) || (z % 2 === 0 && x % 3 === 0))) c = mixColor(cA, PALETTE.soilDark, 0.28);
        put(out, x, y, z, c);
      }
}

/**
 * Tapered arcing blade leaf. (dx,dz) axis-aligned ints, exactly one non-zero.
 * arcA lifts per step, arcB pulls the tip down (corn arch). Vein lighter, edge darker.
 */
export function blade(
  out: Voxel[],
  ox: number, oy: number, oz: number,
  dx: number, dz: number,
  len: number, wMax: number,
  arcA: number, arcB: number,
  base: number, veinC: number, edgeC: number,
  seed: number,
): void {
  const rnd = rng(seed);
  for (let t = 0; t <= len; t++) {
    const f = t / len;
    const y = oy + Math.round(arcA * t - arcB * t * t);
    const w = wMax * Math.pow(Math.sin(Math.PI * Math.min(0.999, f)), 0.62);
    const hw = Math.max(0, Math.floor(w / 2));
    const x = ox + dx * t, z = oz + dz * t;
    for (let o = -hw; o <= hw; o++) {
      const px = dx !== 0 ? x : x + o;
      const pz = dx !== 0 ? z + o : z;
      let c = base;
      if (o === 0 && hw > 0) c = mixColor(base, veinC, 0.55);
      else if (Math.abs(o) === hw || rnd() < 0.16) c = edgeC;
      put(out, px, y, pz, c);
    }
  }
}

/** Feathery fern frond (carrot/dill) — thin wisp with sparse alternating side ticks. */
export function frond(
  out: Voxel[],
  ox: number, oy: number, oz: number,
  dx: number, dz: number,
  len: number,
  tipC: number, sideC: number,
  seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  let x = ox, y = oy, z = oz;
  put(out, x, y, z, sideC);
  for (let i = 1; i <= len; i++) {
    y += 1;
    if (rnd() < 0.45) x += dx;
    if (rnd() < 0.3) z += dz === 0 ? (rnd() < 0.5 ? 1 : -1) : dz;
    put(out, x, y, z, i >= len - 1 ? tipC : sideC);
    // single alternating wisp — keeps the silhouette feathery, never slabby
    if (i % 2 === 0) put(out, x + px, y, z + pz, tipC, 0.8);
    else put(out, x - px, y, z - pz, tipC, 0.8);
    if (i > 1 && i < len && rnd() < 0.4) put(out, x, y + 0.6, z, tipC, 0.55);
  }
}

/** Hollow tube leaf (allium/chives) — rises, leans outward, dark opening at tip. */
export function tubeLeaf(
  out: Voxel[],
  ox: number, oy: number, oz: number,
  h: number, leanX: number, leanZ: number,
  body: number, tip: number,
): void {
  for (let i = 0; i <= h; i++) {
    const f = Math.pow(i / Math.max(1, h), 1.7);
    const x = ox + Math.round(leanX * f);
    const z = oz + Math.round(leanZ * f);
    put(out, x, oy + i, z, i === h ? tip : body);
  }
}

/** Coiling cucumber tendril. */
export function tendril(
  out: Voxel[],
  ox: number, oy: number, oz: number,
  dx: number, dz: number, len: number, c: number,
): void {
  for (let i = 0; i < len; i++) {
    const a = i * 2.3;
    const x = Math.round(ox + dx * i + Math.cos(a) * 0.9);
    const y = Math.round(oy + 0.6 + Math.sin(a) * 0.9);
    const z = Math.round(oz + dz * i + Math.sin(a * 0.6) * 0.5);
    put(out, x, y, z, c);
  }
}

/* ------------------------------------------------------------------ */
/* flowers & small details                                             */
/* ------------------------------------------------------------------ */

/** Tiny sub-voxel flower dot. */
export const flowerDot = (out: Voxel[], x: number, y: number, z: number, c: number, s = 0.55): void =>
  put(out, x, y, z, c, s);

/** Five-petal bloom (strawberry/bean) — petal dots around a center dot. */
export function fivePetal(out: Voxel[], x: number, y: number, z: number, petal: number, center: number): void {
  flowerDot(out, x, y, z, center, 0.42);
  flowerDot(out, x + 0.62, y, z, petal, 0.46);
  flowerDot(out, x - 0.62, y, z, petal, 0.46);
  flowerDot(out, x, y, z + 0.62, petal, 0.46);
  flowerDot(out, x, y, z - 0.62, petal, 0.46);
}

/** Flat-topped umbel (carrot/dill/cilantro bloom). */
export function umbel(out: Voxel[], x: number, y: number, z: number, r: number, c: number): void {
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++)
      if (dx * dx + dz * dz <= r * r + r * 0.4)
        flowerDot(out, x + dx, y + (Math.abs(dx) + Math.abs(dz) > r ? -0.15 : 0.12), z + dz, c, 0.5);
}

/** Trumpet blossom of cucurbits — bright bell with stamen. */
export function blossomBell(out: Voxel[], x: number, y: number, z: number, petal: number, stamen: number): void {
  put(out, x, y, z, petal, 0.8);
  flowerDot(out, x + 0.55, y, z, petal, 0.55);
  flowerDot(out, x - 0.55, y, z, petal, 0.55);
  flowerDot(out, x, y, z + 0.55, petal, 0.55);
  flowerDot(out, x, y, z - 0.55, petal, 0.55);
  flowerDot(out, x, y + 0.75, z, stamen, 0.5);
}

/** Round pom-pom flower head (chives/allium, marigold). */
export function pompom(out: Voxel[], x: number, y: number, z: number, r: number, cA: number, cB: number, seed: number): void {
  blob(out, x, y, z, r, r, r, cA, cB, { seed });
}

/** Hanging pod (beans/peas) — two stacked sub-voxels with a slight offset. */
export function pod(out: Voxel[], x: number, y: number, z: number, len: number, c: number): void {
  for (let i = 0; i < len; i++) put(out, x + (i === len - 1 ? 0.25 : 0), y - i * 0.78, z + (i % 2 ? 0.12 : 0), c, 0.66);
}

/* ------------------------------------------------------------------ */
/* grounding & assembly                                                */
/* ------------------------------------------------------------------ */

/** Dithered soil pad centered at origin; raise=1 adds a hilled dome ring (potato). */
export function soilPad(out: Voxel[], r: number, seed: number, raise = 0): void {
  const rnd = rng(seed);
  for (let x = -r; x <= r; x++)
    for (let z = -r; z <= r; z++) {
      const d2 = x * x + z * z;
      if (d2 > r * r + r * 0.6) continue;
      const rim = d2 >= (r - 0.9) * (r - 0.9);
      let c: number = rnd() < 0.52 ? PALETTE.soil : PALETTE.soilDark;
      if (rim) c = mixColor(c, PALETTE.shadow, 0.22);
      if (raise > 0 && d2 <= (r - 1.4) * (r - 1.4)) out.push({ x, y: 1, z, color: rnd() < 0.5 ? PALETTE.soilLight : PALETTE.soil, pad: true });
      out.push({ x, y: 0, z, color: c, pad: true });
    }
}

/** Elliptical soil pad for sprawlers (cucurbits) — grows with the vine run. */
export function soilPadEllipse(out: Voxel[], rx: number, rz: number, seed: number): void {
  const rnd = rng(seed);
  for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++)
    for (let z = -Math.ceil(rz); z <= Math.ceil(rz); z++) {
      const d = (x * x) / (rx * rx) + (z * z) / (rz * rz);
      if (d > 1.1) continue;
      const rim = d > 0.74;
      let c: number = rnd() < 0.52 ? PALETTE.soil : PALETTE.soilDark;
      if (rim) c = mixColor(c, PALETTE.shadow, 0.22);
      out.push({ x, y: 0, z, color: c, pad: true });
    }
}

/**
 * Assemble a plant: static voxels + foliage group named 'sway'. Pad-flagged
 * static voxels assemble into a NAMED 'pad' child (SPEC-GROWTH-VISUAL wave 4)
 * so the instanced renderer can strip them from plant templates and instance
 * pads separately with per-cell moisture tinting; every other consumer
 * (showcase, ghost overlays, direct makeCropFor use) renders them unchanged.
 */
export function finishPlant(stat: Voxel[], sway: Voxel[]): THREE.Group {
  const root = new THREE.Group();
  root.name = 'crop';
  let solid: Voxel[] | null = null;
  let pad: Voxel[] | null = null;
  for (const v of stat) {
    if (v.pad) (pad ??= []).push(v);
    else (solid ??= []).push(v);
  }
  if (solid) root.add(voxelMesh(solid));
  if (pad) {
    const padMesh = voxelMesh(pad);
    padMesh.name = 'pad';
    root.add(padMesh);
  }
  if (sway.length) {
    const g = new THREE.Group();
    g.name = 'sway';
    g.add(voxelMesh(sway));
    root.add(g);
  }
  return root;
}

/**
 * Shared unit pad geometry (radius 3 voxel units) the renderer instances and
 * scales per cell — flat disc, or hilled dome ring for raised crops (potato).
 * Built with the same deterministic dither recipe as soilPad (seed 4242).
 */
export function unitPadGeometry(hilled: boolean): THREE.BufferGeometry {
  const vox: Voxel[] = [];
  soilPad(vox, 3, 4242, hilled ? 1 : 0);
  const mesh = voxelMesh(vox);
  const geo = mesh.geometry;
  (mesh.material as THREE.Material).dispose(); // geometry is handed to the caller
  return geo;
}

/** Standard sprout loop w/ seed-husk hint (s0 of most archetypes). */
export function sproutLoop(stat: Voxel[], sway: Voxel[], pal: CropPalette, seed: number, husk = true): void {
  put(stat, 0, 0.35, 0, pal.stem, 0.7);
  put(sway, -0.45, 1.15, 0, pal.young, 0.62);
  put(sway, 0.45, 1.15, 0, pal.young, 0.62);
  put(sway, 0, 1.7, 0, shade(pal.young, pal.light, 0.4), 0.4);
  if (husk) flowerDot(stat, 0.55, 0.25, 0.3, PALETTE.straw, 0.34);
  void seed;
}
