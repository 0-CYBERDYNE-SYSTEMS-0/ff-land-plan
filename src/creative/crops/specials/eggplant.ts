/**
 * Special builder: EGGPLANT (de-cloned from the tomato archetype,
 * SPEC-GROWTH-VISUAL §2.5 Tier 3).
 *
 * Distinct architecture — nameable from the s4 silhouette alone, NOT a
 * recolored tomato:
 *  - upright OPEN frame: taller than pepper, ~tomato height but sparse.
 *    Stout stems with purple-brown tinting (pal.stem mixed toward
 *    pal.fruit), a flared base + node bulges; a few well-spaced branches;
 *    NO stake, NO twine, NO cordon.
 *  - LARGE broad drooping leaves: ovate 3-wide blades with lobed side
 *    points and a pale midrib, arching over then hanging at the tip —
 *    clearly bigger blades than tomato's pinnate plates or pepper's
 *    rounded dots.
 *  - OVAL GLOSSY fruit pointing UP/OUT on short stout green CALYX STARS
 *    (sepals ride up the fruit side) — never pendant tomato trusses.
 *    s3 purple blooms with a yellow stamen eye (pal.fruit petals,
 *    pal.accent eye); s4 2-3 pale fruit (pal.unripe); s5 4-5 deep glossy
 *    pal.fruit with one branch sagging under the load.
 * Heights: 2 → 3 → 6 → 8 → 10 → 12.
 */
import { Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, flowerDot,
} from '../shared';
import type { SpecialBuildFn } from './types';

/** Tip-droop arc per blade length: arch over, then hang below the branch. */
const LEAF_ARC: Record<number, number[]> = {
  3: [1, 1, 0],
  4: [1, 2, 1, -1],
  5: [1, 2, 2, 0, -2],
  6: [1, 2, 2, 1, -1, -2],
};

/**
 * Broad arching eggplant leaf: stout petiole, 3-wide ovate blade with a pale
 * midrib, lobed side points and a shadowed underside, tip drooping below the
 * branch — the biggest blade of the nightshade trio.
 */
function eggLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, vein: number, petC: number, seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  const pet = len >= 4 ? 2 : 1; // petiole
  for (let i = 1; i <= pet; i++) put(sway, x + dx * i, y, z + dz * i, petC, 0.7);
  const bx = x + dx * pet, bz = z + dz * pet;
  const arc = LEAF_ARC[len] ?? LEAF_ARC[5];
  for (let i = 1; i <= len; i++) {
    const ly = y + arc[i - 1];
    const cx = bx + dx * i, cz = bz + dz * i;
    const tip = i === len;
    const hw = tip || i === 1 ? 0 : 1;
    put(sway, cx, ly, cz, hw ? shade(base, vein, 0.5) : base, tip ? 0.85 : 1);
    for (let o = -hw; o <= hw; o++) {
      if (o === 0) continue;
      const sx = cx + px * o, sz = cz + pz * o;
      put(sway, sx, ly, sz, rnd() < 0.3 ? edge : base, 0.95);
      if (i === 2 || i === 3) put(sway, sx, ly - 1, sz, edge, 0.8); // underside shadow
    }
    // lobed side points at the widest stations — reads "broad rough leaf"
    if (i === 2 || i === 3) {
      put(sway, cx + px * 2, ly, cz + pz * 2, edge, 0.6);
      put(sway, cx - px * 2, ly, cz - pz * 2, edge, 0.6);
    }
  }
}

/** Nodding purple bloom with a yellow stamen eye. */
function eggFlower(sway: Voxel[], x: number, y: number, z: number, pal: CropPalette): void {
  const petal = shade(pal.fruit, pal.unripe, 0.55);
  flowerDot(sway, x, y, z, pal.accent, 0.45); // yellow eye
  flowerDot(sway, x + 0.58, y - 0.15, z, petal, 0.5);
  flowerDot(sway, x - 0.58, y - 0.15, z, petal, 0.5);
  flowerDot(sway, x, y - 0.15, z + 0.58, petal, 0.5);
  flowerDot(sway, x, y - 0.15, z - 0.58, petal, 0.5);
  flowerDot(sway, x, y - 0.52, z, shade(petal, pal.fruit, 0.4), 0.44);
}

/**
 * Oval glossy eggfruit pointing UP/OUT from a spiky green calyx star:
 * cup + star points at the attachment end, sepals riding the fruit side,
 * ovate body widest at the middle, gloss highlights on the upper shoulder.
 */
function eggFruit(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, pal: CropPalette, c: number, big: boolean, seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  const calyx = shade(pal.stem, pal.dark, 0.15);
  // calyx cup + star at the base
  put(sway, x, y, z, calyx, 0.85);
  flowerDot(sway, x + 0.7, y - 0.1, z, calyx, 0.5);
  flowerDot(sway, x - 0.7, y - 0.1, z, calyx, 0.5);
  flowerDot(sway, x, y - 0.1, z + 0.7, calyx, 0.5);
  flowerDot(sway, x, y - 0.1, z - 0.7, calyx, 0.5);
  // ovate body climbing out and up at ~60 degrees
  const g = big ? 1.2 : 1;
  const P = (t: number, oy: number, s: number, wide: boolean): void => {
    const fx = x + dx * t, fz = z + dz * t, fy = y + oy;
    put(sway, fx, fy, fz, c, s);
    if (wide) {
      put(sway, fx + px * 0.85, fy, fz + pz * 0.85, c, s * 0.9);
      put(sway, fx - px * 0.85, fy, fz - pz * 0.85, c, s * 0.9);
    }
  };
  P(0.7 * g, 0.9, 0.9, false);
  P(1.3 * g, 1.8, 0.95, true);
  P(1.8 * g, 2.8, 0.85, big);
  if (big) P(2.2 * g, 3.7, 0.6, false);
  // sepal spikes riding up the fruit side — the eggplant signature
  flowerDot(sway, x + dx * 0.8 + px * 0.7, y + 1.3, z + dz * 0.8 + pz * 0.7, calyx, 0.38);
  flowerDot(sway, x + dx * 1.1 - px * 0.7, y + 1.9, z + dz * 1.1 - pz * 0.7, calyx, 0.34);
  // glossy highlights on the upper shoulder
  put(sway, x + dx * 1.5 + px * 0.3, y + 2.5, z + dz * 1.5 + pz * 0.3, shade(c, pal.unripe, 0.5), 0.3);
  if (rnd() < 0.8) put(sway, x + dx * 0.9 + px * 0.3, y + 1.6, z + dz * 0.9 + pz * 0.3, shade(c, pal.unripe, 0.4), 0.24);
}

export const buildEggplant: SpecialBuildFn | null = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 111);

  if (stage === 0) {
    sproutLoop(stat, sway, pal, 12);
    return finishPlant(stat, sway);
  }

  const H = [0, 3, 6, 8, 10, 12][stage];
  // purple-brown tinting deepens as the stems thicken
  const stemC = shade(pal.stem, pal.fruit, stage <= 1 ? 0.12 : stage === 2 ? 0.2 : 0.32);
  const stemDark = shade(stemC, pal.dark, 0.25);
  const f = foliage(pal, stage);
  const base = f;
  const edge = shade(f, pal.dark, 0.4);
  const vein = shade(f, pal.light, 0.45);

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 3, 0, stemC);
    put(stat, 0, 0.45, 0, stemDark, 1.3); // flared stout base
    eggLeaf(sway, 0, 2, 0, 1, 0, 3, base, edge, vein, stemC, 21);
    eggLeaf(sway, 0, 1, 0, -1, 0, 3, base, edge, vein, stemC, 22);
    return finishPlant(stat, sway);
  }

  // --- upright open frame (s2-s5) ------------------------------------------
  // slight zig column; s5 top leans toward the camera under fruit load
  const colX = (yy: number): number =>
    stage === 5 && yy > H - 3 ? Math.round((yy - (H - 3)) / 2)
      : Math.sin(yy * 1.05) > 0.45 ? 1 : 0;
  for (let yy = 0; yy <= H; yy++) {
    put(stat, colX(yy), yy, 0, yy === H ? stemDark : stemC);
  }
  // stout trunk foot + flares — thick purple-brown base reads at distance
  put(stat, 0, 0.45, 0, stemDark, 1.4);
  put(stat, 0, 1.4, 0, stemDark, 1.15);
  for (let yy = 0; yy <= 2; yy++) put(stat, 0, yy, 1, stemDark);

  // side branches — sparse, well spaced, SHORT reach (open habit). [fromY, ex, ey, ez]
  const branches: Array<[number, number, number, number]> =
    stage === 2 ? [[3, 2, 5, 1], [4, -2, 6, -1]]
      : stage === 3 ? [[3, 2, 5, 1], [5, -2, 7, -1]]
        : stage === 4 ? [[4, 2, 6, 1], [6, -2, 8, -1], [7, 1, 9, 1]]
          : [[4, 2, 6, 1], [6, -2, 8, -1], [8, 2, 10, 1], [5, -3, 5, -2]]; // last sags under load
  for (const [fy, ex, ey, ez] of branches) {
    vline(stat, colX(fy), fy, 0, ex, ey, ez, stemC);
    put(stat, colX(fy) + 0.4, fy + 0.3, 0.35, stemDark, 0.5); // node bulge
    // one big leaf crowning the branch tip, pointing outward
    eggLeaf(sway, ex, ey - 1, ez, Math.sign(ex) || 1, 0, stage >= 4 ? 5 : 4, base, edge, vein, stemC, 200 + fy * 3);
  }

  // main-stem leaves — FEW but HUGE, in widely spaced tiers so the open
  // frame shows between them (never a leafy wall like the pepper dome)
  const stemLeaves: Array<[number, number, number]> = // [y, dx, dz]
    stage === 2 ? [[2, 1, 0], [5, -1, 0]]
      : stage === 3 ? [[2, 1, 0], [5, -1, 0], [7, 0, 1]]
        : stage === 4 ? [[2, 1, 0], [5, -1, 0], [8, 0, 1]]
          : [[2, 1, 0], [6, -1, 0], [10, 0, 1]];
  const leafLen = stage === 2 ? 4 : stage === 5 ? 6 : 5;
  for (const [ly, dx, dz] of stemLeaves) {
    eggLeaf(sway, colX(ly), ly, 0, dx, dz, leafLen, base, edge, vein, stemC, 31 + ly * 4);
  }

  if (stage === 3) {
    // purple blooms: crown + branch tips, plus buds
    eggFlower(sway, colX(H), H, 0, pal);
    eggFlower(sway, 2, 5, 1, pal);
    eggFlower(sway, -2, 7, -1, pal);
    flowerDot(sway, 0, H - 2, 0.4, shade(pal.fruit, pal.unripe, 0.55), 0.42);
    flowerDot(sway, 1, 4, 0.4, shade(pal.fruit, pal.unripe, 0.55), 0.42);
  }

  if (stage === 4) {
    // first pale fruit, pointing UP/OUT on calyx stars
    eggFruit(sway, colX(H), H, 0, 1, 0, pal, pal.unripe, true, 81);
    eggFruit(sway, 2, 6, 1, 1, 0, pal, pal.unripe, false, 82);
    eggFruit(sway, -2, 8, -1, -1, 0, pal, pal.unripe, false, 83);
  }
  if (stage === 5) {
    // harvest mass: deep glossy fruit held clear of the foliage + the
    // sagging loaded branch (pick-me)
    eggFruit(sway, colX(H), H, 0, 1, 0, pal, pal.fruit, true, 84);
    eggFruit(sway, 2, 6, 1, 1, 0, pal, pal.fruit, true, 85);
    eggFruit(sway, -2, 8, -1, -1, 0, pal, pal.fruit, true, 86);
    eggFruit(sway, 2, 10, 1, 0, 1, pal, pal.fruit, true, 87);
    eggFruit(sway, -3, 5, -2, -1, 0, pal, shade(pal.fruit, pal.dark, 0.15), true, 88); // the sagging one
  }
  return finishPlant(stat, sway);
};
