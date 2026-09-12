/**
 * Special builders: the SQUASH FAMILY (de-cloned beyond palette+scale,
 * SPEC-GROWTH-VISUAL §2.5 Tier 3). Wired through SPECIAL_BUILDERS so
 * makeCropFor prefers these over the cucurbit-vine archetype dispatch.
 *
 * Target: each nameable from s4 alone — distinct FRUIT SHAPE + HABIT + LEAF,
 * never hue alone:
 *  - PUMPKIN: big sprawling vine of coarse 3-lobed leaves and curled tendrils;
 *    a huge deeply-ribbed orange sphere beside the crown (s5 = one giant prize
 *    fruit + a smaller sibling).
 *  - ZUCCHINI: UPRIGHT BUSH — no runners; a compact fountain of big lobed
 *    leaves on stout petioles, ridged club fruit pointing up/out from the
 *    crown base, edible male-flower trumpets (pal.accent) on the fruit tips.
 *  - MELON: spreading vine of smaller rounded leaves; netted SUTURED sphere
 *    fruit — net-dither skin with dark meridian seams dividing the sphere
 *    into segments (s5 = two full-size melons).
 *  - CUCUMBER: vine climbing a simple twig A-frame trellis, many small
 *    leaves, LONG slender cylindrical fruit in hanging PAIRS with a bumpy
 *    dither skin.
 *
 * Shared family DNA (chunky cotyledon sprout, trumpet blossoms, tendrils)
 * keeps the six-stage rows one continuous life cycle per QUALITY_BAR Lane B.
 * Palette strictly from pal fields (trellis wood = PALETTE material tones),
 * seeded rng only — NEVER Math.random — soil pad + 'sway' conventions per
 * shared.ts, plan-view readable.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, blade, tendril, flowerDot,
  soilPad, soilPadEllipse, finishPlant, blossomBell,
} from '../shared';
import type { SpecialBuildFn } from './types';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/** Axis-aligned leaf direction from any (incl. diagonal) ring direction. */
const leafDir = (dx: number, dz: number): [number, number] =>
  (dx !== 0 ? [Math.sign(dx), 0] : [0, Math.sign(dz) || 1]);

/** Family sprout: fat cotyledons — cucurbits come up chunky (shared DNA). */
function cucurbitSprout(stat: Voxel[], sway: Voxel[], pal: CropPalette, seed: number): ReturnType<typeof finishPlant> {
  soilPad(stat, 3.5, seed);
  put(stat, 0, 0.5, 0, pal.stem, 0.75);
  put(sway, -0.7, 1.25, 0, pal.young, 0.8);
  put(sway, 0.7, 1.25, 0, shade(pal.young, pal.light, 0.3), 0.8);
  put(sway, 0, 1.9, 0, pal.young, 0.45);
  return finishPlant(stat, sway);
}

/**
 * Coarse cucurbit leaf: main oval blade + two flanking lobes + rough speck.
 * sideLen 2 = big 3-lobed pumpkin/zucchini leaf, 1 = shallow-lobed rounder
 * melon/cucumber leaf, 0 = plain rounded blade.
 */
function lobedLeaf(
  out: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number, sideLen: number,
  base: number, vein: number, edge: number, seed: number,
): void {
  blade(out, x, y, z, dx, dz, len, len, 0.55, 0.07, base, vein, edge, seed);
  if (sideLen > 0) {
    const mid = Math.round(len * 0.45);
    const mx = x + dx * mid, mz = z + dz * mid;
    const [px, pz] = leafDir(dz, dx); // perpendicular, axis-aligned
    const lobeC = shade(base, edge, 0.28);
    if (sideLen >= 2) {
      // two 2-column lobes flanking the mid-rib — reads 3-lobed from above
      blade(out, mx - px, y - 0.35, mz - pz, px, pz, 1, 1, 0.3, 0.1, lobeC, vein, edge, seed + 1);
      blade(out, mx + px, y - 0.35, mz + pz, px, pz, 1, 1, 0.3, 0.1, shade(base, edge, 0.16), vein, edge, seed + 2);
    } else {
      // shallow lobing: single flanking dots, rounder silhouette
      put(out, mx - px, y - 0.3, mz - pz, lobeC, 0.7);
      put(out, mx + px, y - 0.3, mz + pz, shade(base, edge, 0.16), 0.7);
    }
  }
  const rnd = rng(seed);
  if (rnd() < 0.8) flowerDot(out, x + dx * (len / 2), y + 1.05, z + dz * (len / 2), edge, 0.35);
}

/** Bold full-voxel trumpet bloom (the family's big cucurbit flower). */
function bigBell(out: Voxel[], x: number, y: number, z: number, petal: number, stamen: number): void {
  put(out, x, y, z, petal, 1);
  put(out, x + 0.7, y + 0.45, z, petal, 0.68);
  put(out, x - 0.7, y + 0.45, z, petal, 0.68);
  put(out, x, y + 0.45, z + 0.7, petal, 0.68);
  put(out, x, y + 0.45, z - 0.7, petal, 0.68);
  put(out, x, y + 0.9, z, stamen, 0.45);
}

/**
 * Deeply-ribbed sphere (pumpkin fruit): lobed silhouette pulled in between
 * ribs, dark crevice seams, lighter shoulder sheen, stem well + thick stalk.
 * Oblate (ry = 0.82 r); pass cy ≈ 0.82r so it sits flush on the soil.
 */
function ribbedSphere(
  out: Voxel[], cx: number, cy: number, cz: number, r: number,
  skin: number, crevice: number, sheen: number,
  ribs: number, seed: number, stalkC: number,
): void {
  const rnd = rng(seed);
  const ry = r * 0.82;
  const depth = Math.max(0.8, r * 0.18);
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const ang = Math.atan2(z - cz, x - cx);
        const lobe = Math.abs(Math.cos((ang * ribs) / 2));
        const rr = r - (1 - lobe) * depth;
        const nx = (x - cx) / rr, nz = (z - cz) / rr, ny = (y - cy) / ry;
        if (nx * nx + nz * nz + ny * ny > 1) continue;
        const ax = Math.hypot(x - cx, z - cz);
        if (y > cy + ry - 1.3 && ax < r * 0.3) continue; // stem well
        let c = lobe < 0.34 ? crevice : skin;
        if (lobe >= 0.34 && rnd() < 0.15) c = shade(skin, crevice, 0.45);
        if (y > cy + ry * 0.45 && lobe >= 0.34) c = shade(c, sheen, 0.26);
        put(out, x, y, z, c);
      }
  // thick stalk rooted in the well + a curl beside it
  vline(out, cx, cy + ry - 2, cz, cx, cy + ry + 1.1, cz, stalkC);
  put(out, cx + 0.55, cy + ry + 0.9, cz, stalkC, 0.55);
}

/**
 * Netted sutured melon: net-dither skin (skin⇄net), two dark meridian seams
 * dividing the sphere into segments, top dimple + bent stalk button.
 * Callers keep cx/cz integer so the seams stay one voxel wide.
 */
function nettedMelon(
  out: Voxel[], cx: number, cy: number, cz: number, r: number,
  skin: number, net: number, suture: number, stalkC: number, seed: number,
): void {
  const rnd = rng(seed);
  const ry = r * 0.88;
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const d = ((x - cx) ** 2) / (r * r) + ((y - cy) ** 2) / (ry * ry) + ((z - cz) ** 2) / (r * r);
        if (d > 1) continue;
        const seam = Math.abs(x - cx) < 0.6 || Math.abs(z - cz) < 0.6;
        let c = rnd() < 0.42 ? net : skin;
        if (seam && d > 0.3) c = suture;
        else if (y > cy + ry * 0.5) c = shade(c, net, 0.25);
        else if (y < cy - ry * 0.45) c = shade(c, suture, 0.2); // soil-contact shade
        put(out, x, y, z, c);
      }
  put(out, cx, cy + ry + 0.2, cz, stalkC, 0.6);       // stem button in the dimple
  put(out, cx + 0.5, cy + ry + 0.55, cz, stalkC, 0.45); // bent stalk
}

/** Zucchini fruit: tapered ridged club from (x0..) to (x1..) with pale
 *  lengthwise ridge streaks and a calyx scar at the stem end. */
function club(
  out: Voxel[], x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  cMain: number, cLight: number, cDark: number, seed: number,
): void {
  void seed;
  const steps = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0, z1 - z0)));
  const vertical = Math.abs(y1 - y0) >= Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const fx = vertical ? 0.34 : 0; // flank offsets perpendicular to the run
  const fz = vertical ? 0 : 0.34;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    put(out, x, y, z, i % 2 ? shade(cMain, cDark, 0.22) : cMain, 0.95 - 0.3 * t);
    if (i >= steps - 1) continue;
    put(out, x + fx, y, z + fz, shade(cMain, cLight, 0.5), 0.3);
    put(out, x - fx, y, z - fz, shade(cMain, cLight, 0.5), 0.3);
  }
  put(out, x0, y0 - 0.3, z0, shade(cMain, cDark, 0.5), 0.4);
}

/** A pair of long slender bumpy cucumbers hanging from one node. */
function cukePair(
  out: Voxel[], x: number, y: number, z: number,
  lenA: number, lenB: number,
  cMain: number, cBump: number, tipC: number, seed: number,
): void {
  const offs: Array<[number, number]> = [[-0.65, lenA], [0.65, lenB]];
  offs.forEach(([ox, len], k) => {
    // peduncle arcs out from the node before the fruit drops
    put(out, x + ox * 0.5, y - 0.4, z, shade(cMain, cBump, 0.35), 0.45);
    const rnd = rng(seed + k * 17);
    for (let i = 0; i < len; i++) {
      const xx = x + ox + (rnd() < 0.3 ? 0.3 : 0);
      const yy = y - 1 - i;
      put(out, xx, yy, z, i % 2 ? shade(cMain, cBump, 0.3) : cMain, 0.85);
      // bumpy dither specks — spiny cucumber skin
      if (rnd() < 0.55) put(out, xx + 0.32, yy + 0.25, z + 0.2, cBump, 0.22);
      if (rnd() < 0.35) put(out, xx - 0.3, yy - 0.25, z - 0.2, cBump, 0.18);
    }
    flowerDot(out, x + ox, y - 1 - len, z, tipC, 0.3); // faded blossom end
  });
}

/* ------------------------------------------------------------------ */
/* PUMPKIN — sprawling vine, huge deeply-ribbed sphere                 */
/* ------------------------------------------------------------------ */

/** Ground-hugging pumpkin sprawl — coarser and longer than the melon run. */
const sprawlAt = (i: number): [number, number] => [
  Math.round(i * 0.62),
  Math.round(Math.sin(i * 0.8) * 1.5),
];

export const buildPumpkin: SpecialBuildFn = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) return cucurbitSprout(stat, sway, pal, 311);

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    soilPad(stat, 3.5, 312);
    vline(sway, 0, 0.5, 0, 0, 1.2, 0, pal.stem);
    lobedLeaf(sway, 0, 1.2, 0, 1, 0, 3, 2, f, vein, edge, 321);
    lobedLeaf(sway, 0, 0.95, 0, 0, -1, 3, 2, shade(f, pal.dark, 0.15), edge, vein, 322);
    return finishPlant(stat, sway);
  }

  const runLen = [0, 0, 4, 7, 10, 12][stage];
  soilPadEllipse(stat, 5 + stage * 0.9, 3.2 + stage * 0.55, 310);

  // thick sprawling runner with big curled tendrils every ~3 nodes
  for (let i = 0; i <= runLen; i++) {
    const [vx, vz] = sprawlAt(i);
    put(sway, vx, 0.65, vz, i % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem, 0.9);
    if (i > 0 && i % 3 === 0) {
      const [nx, nz] = sprawlAt(i - 1);
      tendril(sway, nx, 1.1, nz, Math.sign(vx - nx) || 1, 0, 4, shade(pal.stem, pal.light, 0.25));
    }
  }

  // coarse big 3-lobed leaves along the run (biggest foliage of the family)
  const nLeaves = [0, 0, 3, 5, 7, 8][stage];
  for (let i = 0; i < nLeaves; i++) {
    const li = Math.min(Math.round(1 + i * 1.7), runLen);
    const [lx, lz] = sprawlAt(li);
    const side = i % 2 === 0 ? 1 : -1;
    const leafLen = stage >= 4 ? 5 : stage === 3 ? 4 : 3;
    lobedLeaf(sway, lx, 1.15, lz, side, 0, leafLen, 2,
      i % 2 ? f : shade(f, pal.light, 0.18), vein, edge, 330 + i * 9);
    if (stage >= 3) lobedLeaf(sway, lx, 0.95, lz, 0, side, 3, 2, shade(f, pal.dark, 0.12), vein, edge, 360 + i * 7);
  }

  const stamen = shade(pal.accent, pal.light, 0.6);
  if (stage === 3) {
    // bold trumpet blossoms held above the canopy
    const [bx1, bz1] = sprawlAt(runLen - 2);
    bigBell(sway, bx1, 1.6, bz1 + 2, pal.accent, stamen);
    const [bx2, bz2] = sprawlAt(2);
    bigBell(sway, bx2, 1.6, bz2 + 2, shade(pal.accent, pal.light, 0.18), stamen);
  }
  if (stage === 4) {
    // fruit set beside the crown: still green, ribs forming, bloom attached
    ribbedSphere(sway, -2, 1.3, 2, 2.0,
      shade(pal.unripe, pal.fruit, 0.12), shade(pal.unripe, pal.dark, 0.4),
      shade(pal.unripe, pal.light, 0.5), 8, 62, shade(pal.stem, pal.dark, 0.3));
    bigBell(sway, -2, 3.4, 2, pal.accent, stamen);
    // crown foliage keeps the young fruit company
    lobedLeaf(sway, 0, 1.1, 0, 0, 1, 3, 2, shade(f, pal.dark, 0.1), vein, edge, 382);
    lobedLeaf(sway, 0, 1.0, -0.5, 0, -1, 3, 2, shade(f, pal.light, 0.14), vein, edge, 383);
  }
  if (stage === 5) {
    // THE prize fruit — huge deeply-ribbed sphere beside the crown...
    ribbedSphere(sway, -4, 3.3, 1, 4.4,
      pal.fruit, shade(pal.fruit, pal.dark, 0.42), shade(pal.fruit, pal.accent, 0.35),
      8, 63, shade(pal.stem, pal.dark, 0.3));
    // ...plus a smaller sibling set mid-run
    ribbedSphere(sway, 5, 1.55, -1.5, 2.3,
      shade(pal.fruit, pal.dark, 0.1), shade(pal.fruit, pal.dark, 0.45),
      shade(pal.fruit, pal.accent, 0.3), 8, 64, shade(pal.stem, pal.dark, 0.3));
  }
  return finishPlant(stat, sway);
};

/* ------------------------------------------------------------------ */
/* ZUCCHINI — upright bush, club fruit on the crown                    */
/* ------------------------------------------------------------------ */

export const buildZucchini: SpecialBuildFn = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) return cucurbitSprout(stat, sway, pal, 351);

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    soilPad(stat, 3.5, 352);
    vline(sway, 0, 0.5, 0, 0, 1.4, 0, pal.stem);
    lobedLeaf(sway, 0, 1.4, 0, 1, 0, 3, 2, f, vein, edge, 361);
    lobedLeaf(sway, 0, 1.1, 0, 0, -1, 3, 2, shade(f, pal.dark, 0.15), edge, vein, 362);
    return finishPlant(stat, sway);
  }

  // UPRIGHT BUSH: stout petioles fountaining from a compact crown — no runners
  soilPad(stat, 3.5 + stage * 0.3, 350);
  const tipH = [0, 0, 2.5, 3.5, 4, 4.5][stage];
  const nPet = [0, 0, 5, 6, 7, 8][stage];
  for (let i = 0; i < nPet; i++) {
    const [rdx, rdz] = R8[i % 8];
    const [ldx, ldz] = leafDir(rdx, rdz);
    const lean = 1.0 + (i % 3) * 0.35;
    const tx = rdx * lean, tz = rdz * lean;
    const ty = tipH - (i % 2) * 0.7;
    vline(sway, rdx * 0.3, 0.5, rdz * 0.3, tx, ty - 1, tz, i % 2 ? pal.stem : shade(pal.stem, pal.dark, 0.18));
    lobedLeaf(sway, tx, ty - 1, tz, ldx, ldz, stage >= 4 ? 4 : 3, 2,
      i % 3 === 1 ? shade(f, pal.light, 0.15) : f, vein, edge, 370 + i * 7);
  }
  // crown heart — newest leaves pushing at the center
  put(sway, 0, 1.3, 0, shade(f, pal.light, 0.4), 0.6);
  put(sway, 0.5, 1.7, 0.3, shade(f, pal.light, 0.55), 0.45);

  const stamen = shade(pal.accent, pal.light, 0.6);
  if (stage === 3) {
    // big edible blooms held above the crown on stout peduncles
    for (let i = 0; i < 3; i++) {
      const [rdx, rdz] = R8[(i * 3 + 1) % 8];
      bigBell(sway, rdx * 1.1, 2.4, rdz * 1.1,
        i ? pal.accent : shade(pal.accent, pal.light, 0.15), stamen);
    }
  }
  if (stage >= 4) {
    // ridged clubs pointing up/out through the crown gaps, flower on the tip —
    // biased to the camera side and above the leaf line so the fruit READS
    const clubs: Array<[number, number, number, number, number, number]> = stage === 4
      ? [[1.0, 0.6, 1.6, 2.3, 4.5, 2.5], [-1.7, 0.6, 1.1, -3.1, 3.9, 1.9]]
      : [[1.0, 0.6, 1.6, 2.4, 4.8, 2.6], [-1.7, 0.6, 1.1, -3.2, 4.1, 1.9], [0.5, 0.6, -1.7, 1.1, 3.7, -3.1]];
    clubs.forEach(([x0, y0, z0, x1, y1, z1], i) => {
      club(sway, x0, y0, z0, x1, y1, z1, pal.fruit, pal.light, pal.dark, 390 + i * 9);
      if (i < 2) bigBell(sway, x1, y1 + 0.5, z1, pal.accent, stamen);
    });
  }
  return finishPlant(stat, sway);
};

/* ------------------------------------------------------------------ */
/* MELON — spreading vine, netted sutured spheres                      */
/* ------------------------------------------------------------------ */

/** Finer melon run — shorter than the pumpkin sprawl. */
const melonRunAt = (i: number): [number, number] => [
  Math.round(i * 0.7),
  Math.round(Math.sin(i * 0.75) * 1.3),
];

export const buildMelon: SpecialBuildFn = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) return cucurbitSprout(stat, sway, pal, 411);

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    soilPad(stat, 3.5, 412);
    vline(sway, 0, 0.5, 0, 0, 1.2, 0, pal.stem);
    // rounded, only shallowly lobed seedling leaves — melon DNA
    lobedLeaf(sway, 0, 1.2, 0, 1, 0, 2, 1, f, vein, edge, 421);
    lobedLeaf(sway, 0, 0.95, 0, 0, -1, 2, 1, shade(f, pal.dark, 0.15), edge, vein, 422);
    return finishPlant(stat, sway);
  }

  const runLen = [0, 0, 4, 6, 8, 9][stage];
  soilPadEllipse(stat, 4 + stage * 0.8, 3 + stage * 0.45, 410);

  // spreading runner + tendrils
  for (let i = 0; i <= runLen; i++) {
    const [vx, vz] = melonRunAt(i);
    put(sway, vx, 0.65, vz, i % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem, 0.85);
    if (i > 0 && i % 3 === 0) {
      const [nx, nz] = melonRunAt(i - 1);
      tendril(sway, nx, 1.1, nz, Math.sign(vx - nx) || 1, 0, 3, shade(pal.stem, pal.light, 0.25));
    }
  }

  // smaller rounded, shallowly-lobed leaves — finer texture than the pumpkin
  const nLeaves = [0, 0, 3, 5, 7, 8][stage];
  for (let i = 0; i < nLeaves; i++) {
    const li = Math.min(Math.round(1 + i * 1.6), runLen);
    const [lx, lz] = melonRunAt(li);
    const side = i % 2 === 0 ? 1 : -1;
    lobedLeaf(sway, lx, 1.1, lz, side, 0, 3, 1,
      i % 2 ? f : shade(f, pal.light, 0.18), vein, edge, 430 + i * 8);
    if (stage >= 3) lobedLeaf(sway, lx, 0.9, lz, 0, side, 2, 1, shade(f, pal.dark, 0.12), vein, edge, 460 + i * 6);
  }

  if (stage === 3) {
    // small yellow blossoms — finer than the pumpkin's bold trumpets
    const [bx, bz] = melonRunAt(runLen - 2);
    blossomBell(sway, bx, 1.4, bz + 2, pal.accent, shade(pal.accent, pal.light, 0.6));
    const [bx2, bz2] = melonRunAt(2);
    blossomBell(sway, bx2, 1.4, bz2 + 2, shade(pal.accent, pal.light, 0.15), shade(pal.accent, pal.light, 0.6));
  }
  const stalkC = shade(pal.stem, pal.dark, 0.3);
  if (stage === 4) {
    // one netted green melon swelling beside the run
    nettedMelon(sway, 3, 1.4, 2, 2.0,
      pal.unripe, shade(pal.unripe, pal.light, 0.2), shade(pal.unripe, pal.dark, 0.5), stalkC, 71);
  }
  if (stage === 5) {
    // harvest: TWO full-size netted melons at different nodes — sutured tan
    nettedMelon(sway, 4, 2.0, 1, 2.7,
      pal.fruit, shade(pal.fruit, pal.light, 0.22), shade(pal.fruit, pal.dark, 0.55), stalkC, 72);
    nettedMelon(sway, 6, 1.8, -2, 2.4,
      shade(pal.fruit, pal.unripe, 0.2), shade(pal.fruit, pal.light, 0.18),
      shade(pal.fruit, pal.dark, 0.6), stalkC, 73);
  }
  return finishPlant(stat, sway);
};

/* ------------------------------------------------------------------ */
/* CUCUMBER — vine on a twig A-frame, hanging fruit pairs              */
/* ------------------------------------------------------------------ */

export const buildCucumber: SpecialBuildFn = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) return cucurbitSprout(stat, sway, pal, 511);

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    soilPad(stat, 3, 512);
    vline(sway, 0, 0.5, 0, 0, 1.4, 0, pal.stem);
    lobedLeaf(sway, 0, 1.4, 0, 1, 0, 2, 1, f, vein, edge, 521);
    lobedLeaf(sway, 0, 1.1, 0, 0, -1, 2, 1, shade(f, pal.dark, 0.15), edge, vein, 522);
    return finishPlant(stat, sway);
  }

  // simple twig A-frame trellis (thinner than the legume posts + crossbar)
  soilPad(stat, 3.5, 510);
  vline(stat, -2, 0, -0.6, 0, 8, 0, PALETTE.wood);
  vline(stat, 2, 0, 0.6, 0, 8, 0, PALETTE.woodDark);
  vline(stat, -1.4, 2.8, 0, 1.4, 2.8, 0, PALETTE.woodLight); // cross twig to tie onto
  put(stat, 0, 8.4, 0, PALETTE.woodLight, 0.7);              // lashed apex

  // climbing vine weaving between the stakes
  const H = [0, 0, 3, 5, 7, 8][stage];
  const nodeX = (y: number): number => Math.round(Math.sin(y * 0.8) * 1.5);
  const nodeZ = (y: number): number => Math.round(Math.cos(y * 0.8) * 0.7);
  for (let y = 0; y <= H; y++) {
    const wx = nodeX(y), wz = nodeZ(y);
    put(sway, wx, y + 0.4, wz, y % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem, 0.8);
    // MANY small leaves alternating along the weave
    if (y >= 1 && y % 2 === 1) {
      const side = ((y >> 1) % 2) ? 1 : -1;
      lobedLeaf(sway, wx, y + 0.4, wz, side, 0, 2, 1,
        y % 4 === 3 ? shade(f, pal.light, 0.15) : f, vein, edge, 530 + y * 5);
    }
    // tendrils gripping the stakes
    if (y > 0 && y % 3 === 0) tendril(sway, wx, y + 1, wz, wx >= 0 ? 1 : -1, 0, 2, vein);
  }
  // crown foliage at the trellis foot
  lobedLeaf(sway, 0, 0.8, 0.5, 0, 1, 2, 1, shade(f, pal.dark, 0.12), vein, edge, 528);
  if (stage >= 4) lobedLeaf(sway, nodeX(H), H + 0.6, nodeZ(H), 0, 1, 2, 1, shade(f, pal.light, 0.2), vein, edge, 529);

  if (stage === 3) {
    // small yellow blooms at the climbing nodes, camera side
    blossomBell(sway, nodeX(3) + 0.5, 3.8, nodeZ(3) + 1.2, pal.accent, shade(pal.accent, pal.light, 0.6));
    blossomBell(sway, nodeX(5) - 0.5, 5.8, nodeZ(5) + 1.2, shade(pal.accent, pal.light, 0.15), shade(pal.accent, pal.light, 0.6));
  }
  if (stage >= 4) {
    // LONG slender cylindrical fruit in PAIRS hanging on the camera side
    const cMain = stage === 4 ? pal.unripe : pal.fruit;
    const cBump = shade(cMain, pal.light, 0.55);
    const tipC = shade(pal.accent, pal.dark, 0.35);
    const anchors: Array<[number, number, number]> = stage === 4
      ? [[5.5, 4, 3]]
      : [[7.5, 6, 5], [5, 4, 3]];
    for (const [ay, lenA, lenB] of anchors) {
      cukePair(sway, nodeX(ay), ay, nodeZ(ay) + 1.1, lenA, lenB, cMain, cBump, tipC, 540 + ay * 7);
    }
  }
  return finishPlant(stat, sway);
};
