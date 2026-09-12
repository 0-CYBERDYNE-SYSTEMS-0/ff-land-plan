/**
 * Special builder: SUNFLOWER (de-cloned from the corn archetype,
 * SPEC-GROWTH-VISUAL §2.5 Tier 3).
 *
 * Nothing of corn's DNA survives: no tassel, no ear, no tiered arching
 * blades. Instead — one stout, dithered, hairy stalk (slightly shorter than
 * corn's), big heart-shaped rough leaves on long petioles alternating up the
 * stalk in rotating directions (4–6 of them, never corn's 8-blade whorls),
 * and THE HEAD: a tilted disc of dark seed-center pixels ringed by 2–3 rows
 * of golden petals with protruding ray tips and green back-bracts.
 *   s0 sprout w/ seed husk → s1 first heart leaves → s2 tall vegetative
 *   stalk → s3 nodding green bud on a curved neck → s4 open golden disc head
 *   tilted up/out → s5 heavy mature head nodding on a bent neck, seeded
 *   pal.fruit face, drooped lower petals, plus a small second side head.
 */
import { Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, blob, soilPad, finishPlant, sproutLoop,
  flowerDot,
} from '../shared';
import type { SpecialBuildFn } from './types';

/** Leaf directions rotate around the stalk (incl. diagonals) so the plan
 *  view is a rosette of spades, not corn's 4-axis blade cross. */
const DIRS: Array<[number, number]> = [
  [1, 1], [-1, 0], [0, 1], [-1, -1], [1, 0], [0, -1],
];

/**
 * Heart-shaped blade on a long petiole: widest at the lobed base (with the
 * petiole sinus notch), tapering to a pointed tip; light mid-vein, rough
 * dark dithering on the edges.
 */
function heartLeaf(
  out: Voxel[],
  ox: number, oy: number, oz: number,
  dx: number, dz: number,
  petiole: number, len: number, wMax: number, droop: number,
  base: number, veinC: number, edgeC: number, petC: number,
  seed: number,
): void {
  const rnd = rng(seed);
  // long petiole lifting off the stalk flank then leveling out — starts with a
  // voxel AT the attachment so the leaf never reads detached from the stalk
  put(out, ox, oy, oz, petC, 0.66);
  let px = ox, py = oy, pz = oz;
  for (let i = 0; i < petiole; i++) {
    px += dx * 0.7; pz += dz * 0.7; py += i === 0 ? 0.4 : -0.1;
    put(out, px, py, pz, petC, 0.66);
  }
  const bx = px + dx * 0.55, by = py + 0.1, bz = pz + dz * 0.55;
  const arcA = 0.22, arcB = 0.055 + droop * 0.02;
  for (let j = 0; j <= len; j++) {
    const f = j / len;
    const w = wMax * Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.16 + f * 0.84)), 0.5);
    const hw = w / 2;
    const y = by + arcA * j - arcB * j * j;
    const cxj = bx + dx * j, czj = bz + dz * j;
    for (let o = -Math.ceil(hw); o <= Math.ceil(hw); o++) {
      if (Math.abs(o) > hw + 0.12) continue;
      // heart sinus: the blade base notches around the petiole tip
      if (j === 0 && Math.abs(o) < 0.7) continue;
      let c = Math.abs(o) < 0.6 ? veinC : base;
      if (Math.abs(o) >= hw - 0.45 || rnd() < 0.16) c = edgeC;
      put(out, cxj - dz * o, y, czj + dx * o, c);
    }
    if (j === 0) {
      // basal lobes curling back around the notch — the heart read
      const lw = Math.max(1, hw - 0.2);
      put(out, cxj - dx * 0.45 - dz * lw, y, czj - dz * 0.45 + dx * lw, shade(base, edgeC, 0.25), 0.72);
      put(out, cxj - dx * 0.45 + dz * lw, y, czj - dz * 0.45 - dx * lw, shade(base, edgeC, 0.25), 0.72);
    }
  }
}

/** Stout dithered stalk with hairy flank nubs — thicker and rougher than
 *  corn's clean banded column; no node bands, no brace roots. */
function thickStalk(stat: Voxel[], H: number, pal: CropPalette, seed: number): void {
  const rnd = rng(seed);
  const hairDark = shade(pal.stem, pal.dark, 0.2);
  // keep the hairs green-dark: pale nubs near the crown read as a tassel tuft
  const hairLite = shade(pal.stem, pal.light, 0.12);
  const NUB: Array<[number, number]> = [[0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62]];
  for (let y = 0; y <= H; y++) {
    put(stat, 0, y, 0, rnd() < 0.34 ? shade(pal.stem, pal.dark, 0.3) : pal.stem);
    if (y === 0) continue;
    if (rnd() < 0.8) {
      const [sx, sz] = NUB[Math.floor(rnd() * 4)];
      put(stat, sx, y + (rnd() < 0.5 ? 0.22 : -0.22), sz, hairDark, 0.32);
    }
    if (y > 1 && y < H - 1 && rnd() < 0.3) {
      const [sx, sz] = NUB[Math.floor(rnd() * 4)];
      put(stat, sx * 1.15, y - 0.1, sz * 1.15, hairLite, 0.28);
    }
  }
  // flared base
  put(stat, 0.55, 0.25, 0.55, shade(pal.stem, pal.dark, 0.3), 0.55);
  put(stat, -0.55, 0.25, -0.55, shade(pal.stem, pal.dark, 0.3), 0.55);
}

interface HeadSpec {
  /** disc radius (face incl. golden rows, excl. ray tips) */
  r: number;
  rays: number;
  /** face pitch: z offset per disc row — negative tilts up, positive nods down */
  tilt: number;
  /** ray protrusion beyond the disc */
  rayLen: number;
  /** sag applied to the lower rays (s5 weight) */
  petalDroop: number;
  seedFace: [number, number];
  ring: [number, number];
  rayTip: number;
}

/** THE HEAD: tilted disc face (dark seed center + 2–3 golden rows, thickness
 *  + green bracts behind) ringed by protruding petal rays. */
function headDisc(
  sway: Voxel[],
  cx: number, cy: number, cz: number,
  pal: CropPalette, sp: HeadSpec, seed: number,
): void {
  const rnd = rng(seed);
  const bract = shade(pal.mature, pal.dark, 0.3);
  const r = sp.r;
  const R = Math.ceil(r + 0.3);
  for (let a = -R; a <= R; a++)
    for (let b = -R; b <= R; b++) {
      const d2 = a * a + b * b;
      if (d2 > r * r + 0.35) continue;
      const z = cz + b * sp.tilt;
      let c: number;
      if (d2 <= (r * 0.42) * (r * 0.42)) c = rnd() < 0.55 ? sp.seedFace[0] : sp.seedFace[1];
      else if (d2 <= (r * 0.72) * (r * 0.72)) c = rnd() < 0.4 ? sp.ring[1] : sp.ring[0];
      else c = sp.ring[1];
      put(sway, cx + a, cy + b, z, c);
      // thickness behind the golden band so the disc is never paper-thin
      if (d2 > (r * 0.62) * (r * 0.62)) put(sway, cx + a, cy + b, z - 0.85, bract, 0.85);
    }
  // protruding petal rays in two golds; the lower ones sag under the head
  for (let i = 0; i < sp.rays; i++) {
    const ang = (i / sp.rays) * Math.PI * 2 + 0.2;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const droop = uy < -0.25 ? sp.petalDroop : 0;
    const r1 = r + 0.35, r2 = r + sp.rayLen;
    put(sway, cx + ux * r1, cy + uy * r1 + droop * 0.4, cz + uy * r1 * sp.tilt,
      i % 2 ? sp.ring[0] : sp.ring[1], 0.8);
    put(sway, cx + ux * r2, cy + uy * r2 - droop, cz + uy * r2 * sp.tilt, sp.rayTip, 0.55);
  }
  // sepal bracts fanned behind the disc — small, never leaf-like
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.55;
    const rr = r * 0.95;
    put(sway, cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr,
      cz + Math.sin(ang) * rr * sp.tilt - 1.45, bract, 0.45);
  }
}

export const buildSunflower: SpecialBuildFn | null = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 707);

  if (stage === 0) { sproutLoop(stat, sway, pal, 17, true); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const leafBase = shade(f, pal.light, 0.22);
  const leafEdge = shade(f, pal.dark, 0.42);
  const leafVein = shade(leafBase, pal.light, 0.5);
  const petC = shade(pal.stem, pal.dark, 0.15);

  if (stage === 1) {
    // seedling: first pair of true heart leaves on the diagonal
    put(stat, 0, 0.4, 0, pal.stem, 0.7);
    heartLeaf(sway, 0.35, 1, 0.35, 1, 1, 1, 2, 2.2, 0.15, leafBase, leafVein, leafEdge, petC, 71);
    heartLeaf(sway, -0.35, 1, -0.35, -1, -1, 1, 2, 2.2, 0.15, leafBase, leafVein, leafEdge, petC, 72);
    put(sway, 0, 1.05, 0, shade(pal.young, pal.light, 0.4), 0.4);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 4, 8, 10, 11][stage];
  thickStalk(stat, H, pal, 717 + stage * 7);

  // heart leaves alternate up the stalk — fewer but far wider than corn's
  // blades; the oldest pair sags once the head starts feeding
  const nLeaves = [0, 0, 4, 5, 6, 6][stage];
  const baseLen = [0, 0, 4, 5, 5, 5][stage];
  const wMax = [0, 0, 4.2, 4.8, 5.2, 5.2][stage];
  for (let i = 0; i < nLeaves; i++) {
    const [dx, dz] = DIRS[i % DIRS.length];
    const by = 1 + Math.round((i / Math.max(1, nLeaves - 1)) * (H - 2));
    const factor = 0.72 + 0.4 * Math.sin((Math.PI * (i + 0.6)) / nLeaves);
    const droop = stage >= 4 && i < 2 ? 1 : 0.3;
    heartLeaf(sway, dx * 0.45, by, dz * 0.45, dx, dz,
      2, Math.max(3, Math.round(baseLen * factor)), Math.max(3, wMax * factor), droop,
      leafBase, leafVein, leafEdge, petC, 80 + i * 13 + stage);
  }

  const neckC = shade(pal.stem, pal.dark, 0.12);

  if (stage === 3) {
    // curved neck bows forward; the closed green bud nods below its tip
    put(sway, 0.6, H + 0.55, 0.35, neckC, 0.85);
    put(sway, 1.2, H + 0.85, 0.7, neckC, 0.85);
    put(sway, 1.75, H + 0.75, 1.1, neckC, 0.7);
    const budA = shade(f, pal.dark, 0.1);
    const budB = shade(f, pal.dark, 0.45);
    blob(sway, 2.15, H + 0.1, 1.45, 1.45, 1.0, 1.45, budA, budB, { seed: 731 });
    // sepal points splaying back along the neck
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      flowerDot(sway, 2.15 + Math.cos(a) * 1.05, H + 0.55 + Math.sin(a) * 0.35, 1.45 + Math.sin(a) * 0.55, budB, 0.45);
    }
    // pale gold seam: the first petals just peeking at the bud's tip
    flowerDot(sway, 2.5, H - 0.55, 1.8, pal.unripe, 0.4);
    flowerDot(sway, 1.8, H - 0.6, 1.9, shade(pal.unripe, pal.accent, 0.4), 0.35);
    return finishPlant(stat, sway);
  }

  if (stage === 4) {
    // the head lifts on a short neck and faces up/out toward the camera
    put(sway, 0.55, H + 0.45, 0.4, neckC, 0.85);
    put(sway, 1.15, H + 0.85, 0.8, neckC, 0.85);
    headDisc(sway, 1.95, H + 1.35, 1.35, pal, {
      r: 2.6, rays: 14, tilt: -0.5, rayLen: 0.85, petalDroop: 0,
      seedFace: [shade(pal.dark, pal.unripe, 0.3), shade(pal.dark, pal.stem, 0.15)],
      ring: [shade(pal.unripe, pal.accent, 0.45), pal.accent],
      rayTip: pal.accent,
    }, 741);
    return finishPlant(stat, sway);
  }

  // stage 5: heavy mature head nodding on a bent neck under its own weight —
  // the neck is chunky enough to visually carry the disc
  put(sway, 0.55, H + 0.4, 0.4, neckC, 0.9);
  put(sway, 1.3, H + 0.7, 0.9, neckC, 0.9);
  put(sway, 1.9, H + 0.55, 1.35, neckC, 0.8);
  put(sway, 2.45, H + 0.3, 1.7, neckC, 0.7);
  headDisc(sway, 2.7, H + 0.05, 2.0, pal, {
    r: 3.1, rays: 16, tilt: 0.42, rayLen: 1.0, petalDroop: 0.4,
    seedFace: [pal.fruit, shade(pal.fruit, pal.dark, 0.55)],
    ring: [pal.accent, shade(pal.accent, pal.fruit, 0.35)],
    rayTip: shade(pal.accent, pal.fruit, 0.3),
  }, 751);
  // secondary head on a short mid-stalk branch — extra maturity signal
  put(sway, -0.75, 6.4, -0.45, neckC, 0.8);
  put(sway, -1.5, 6.75, -0.9, neckC, 0.7);
  headDisc(sway, -2.35, 7.35, -1.35, pal, {
    r: 1.5, rays: 9, tilt: -0.5, rayLen: 0.7, petalDroop: 0,
    seedFace: [shade(pal.dark, pal.unripe, 0.3), shade(pal.dark, pal.stem, 0.15)],
    ring: [shade(pal.unripe, pal.accent, 0.45), pal.accent],
    rayTip: pal.accent,
  }, 761);
  return finishPlant(stat, sway);
};
