/**
 * Archetypes: berry-bush (raspberry/blueberry canes → berry clusters)
 * and apple-tree (sapling whip → scaffold limbs → blossoming canopy → fruit).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, blade, flowerDot, blob,
} from './shared';

/* ------------------------------------------------------------------ */
/* berry-bush                                                          */
/* ------------------------------------------------------------------ */

export const BERRYBUSH_PAL: CropPalette = {
  young: 0x8fc45e,
  mature: 0x396f33,
  dark: 0x285226,
  light: 0x71a94f,
  stem: 0x8a6a44,     // woody cane
  accent: PALETTE.flowerWhite,
  fruit: 0xc2384f,    // raspberry
  unripe: 0x93aa58,
};

/** Raspberry/blueberry: upright canes → arching canes hung with berry clusters. */
export function makeBerryBush(stage: number, pal: CropPalette = BERRYBUSH_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 777);

  if (stage === 0) { sproutLoop(stat, sway, pal, 31); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.36);
  const vein = shade(f, pal.light, 0.42);

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 3, 0, pal.stem);
    blade(sway, 0, 3, 0, 1, 0, 2, 2, 0.45, 0.08, f, vein, edge, 201);
    blade(sway, 0, 3, 0, -1, 0, 2, 2, 0.45, 0.08, f, vein, edge, 202);
    return finishPlant(stat, sway);
  }

  const nCanes = [0, 0, 3, 4, 5, 5][stage];
  const H = [0, 0, 4, 6, 8, 9][stage];
  const rnd = rng(320 + stage);
  const caneC = shade(pal.stem, PALETTE.woodLight, 0.35);

  for (let i = 0; i < nCanes; i++) {
    const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]][i] as [number, number];
    const sh = Math.max(3, H - (i % 3) * 2);
    // cane base spread on distinct cells — canes never merge into a tower
    const bx = dx * (i === 4 ? 1.5 : 1.2), bz = dz * (i === 4 ? 1.5 : 1.2);
    const midX = bx + dx * 0.6, midZ = bz + dz * 0.6;
    const tipX = bx + dx * 1.6, tipZ = bz + dz * 1.6;

    // rise, then arch outward (heavier arch when fruit-laden)
    const midY = Math.floor(sh * 0.65);
    vline(stat, bx, 0, bz, midX, midY, midZ, caneC);
    if (stage === 5) {
      vline(stat, midX, midY, midZ, tipX, midY + 2, tipZ, caneC);
      vline(stat, tipX, midY + 2, tipZ, tipX + dx * 1.4, midY + 1, tipZ + dz * 1.4, caneC);
    } else {
      vline(stat, midX, midY, midZ, tipX, sh, tipZ, caneC);
    }
    const topY = stage === 5 ? midY + 1 : sh;
    const topX2 = stage === 5 ? tipX + dx * 1.4 : tipX;
    const topZ2 = stage === 5 ? tipZ + dz * 1.4 : tipZ;

    // leaf pairs attached along the cane (flat plates, alternating)
    const px = -dz, pz = dx;
    const leafTop = stage === 5 ? midY + 2 : sh;
    for (let y = 2; y <= leafTop; y += 2) {
      // interpolate along the cane for leaf anchor
      const lx = y <= midY ? bx + (midX - bx) * (y / Math.max(1, midY)) : midX + (topX2 - midX) * ((y - midY) / Math.max(1, leafTop - midY));
      const lz = y <= midY ? bz + (midZ - bz) * (y / Math.max(1, midY)) : midZ + (topZ2 - midZ) * ((y - midY) / Math.max(1, leafTop - midY));
      put(sway, lx + px, y + 0.5, lz + pz, i % 2 ? f : shade(f, pal.light, 0.16), 0.85);
      put(sway, lx + px * 1.7, y + 0.7, lz + pz * 1.7, edge, 0.6);
      put(sway, lx - px, y + 0.2, lz - pz, shade(f, pal.dark, 0.14), 0.8);
    }

    // reproductive phase per cane
    if (stage === 3) {
      flowerDot(sway, topX2, topY + 0.8, topZ2, pal.accent, 0.5);
    } else if (stage === 4) {
      // green berries forming at two joints
      flowerDot(sway, topX2 - px, topY - 0.4, topZ2 - pz, pal.unripe, 0.6);
      flowerDot(sway, topX2 - px * 0.4, topY - 1.1, topZ2 - pz * 0.4, pal.unripe, 0.5);
    } else if (stage === 5) {
      // heavy hanging clusters — the pick-me
      for (let b = 0; b < 3; b++) {
        const by = topY - 0.3 - b * 0.75;
        const bc = b === 2 ? shade(pal.fruit, pal.dark, 0.18) : shade(pal.fruit, 0xffffff, b === 1 ? 0.12 : 0);
        put(sway, topX2 - px * 0.7, by, topZ2 - pz * 0.7, bc, 0.62);
      }
      // second cluster mid-cane
      const mx2 = bx + (tipX - bx) * 0.45, mz2 = bz + (tipZ - bz) * 0.45;
      put(sway, mx2 + px * 0.7, midY - 0.6, mz2 + pz * 0.7, pal.fruit, 0.6);
      put(sway, mx2 + px * 0.7, midY - 1.3, mz2 + pz * 0.7, shade(pal.fruit, pal.dark, 0.15), 0.55);
      void rnd;
    }
  }
  return finishPlant(stat, sway);
}

export const BLUEBERRY_PAL: Partial<CropPalette> = {
  mature: 0x41703f,
  accent: PALETTE.flowerWhite,
  fruit: PALETTE.berryBlue,
  unripe: 0x9db2b8,
};

/* ------------------------------------------------------------------ */
/* apple-tree                                                          */
/* ------------------------------------------------------------------ */

export const APPLETREE_PAL: CropPalette = {
  young: 0x96c95e,
  mature: 0x3d7c34,
  dark: 0x2b5c27,
  light: 0x74ad52,
  stem: PALETTE.woodDark,
  accent: PALETTE.flowerPink,
  fruit: PALETTE.tomato,
  unripe: 0xa8c25c,
};

/** Trunk column with basal flare — g < 1 reads as a sapling's slim stem. */
function appleTrunk(stat: Voxel[], H: number, wood: number, g: number): void {
  for (let y = 0; y <= H; y++) {
    const t = 1 - y / (H + 2);
    put(stat, 0, y, 0, wood, g);
    if (y <= 1 && g >= 0.82) {
      put(stat, 0.7 * t + 0.4, y, 0, wood, 0.85 * g);
      put(stat, -0.4, y, 0.7 * t + 0.4, wood, 0.8 * g);
    }
  }
}

/** Scaffold limbs radiating from the trunk top (states/apple-tree.ts math). */
function appleLimbs(stat: Voxel[], n: number, trunkH: number, R: number, wood: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.6;
    vline(stat, 0, trunkH - 1, 0,
      Math.round(Math.cos(a) * R * 0.85), trunkH + Math.round(R * 0.55), Math.round(Math.sin(a) * R * 0.85),
      wood);
  }
}

/** Two overlapping off-center canopy shells + interior dapple. seed 75 /
 *  dappleSeed 335 reproduce the states/apple-tree.ts healthy crown exactly. */
function appleCanopy(
  sway: Voxel[], pal: CropPalette, baseC: number, cy: number, R: number, ryK: number,
  dapple: number, seed: number, dappleSeed: number,
): void {
  const edge = shade(baseC, pal.dark, 0.38);
  blob(sway, 0, cy, 0, R, R * ryK, R, baseC, edge, { shell: true, seed });
  blob(sway, R * 0.5, cy + R * 0.3, -R * 0.35, R * 0.58, R * 0.46, R * 0.58,
    shade(baseC, pal.light, 0.2), edge, { shell: true, seed: seed + 10 });
  const rnd = rng(dappleSeed);
  for (let i = 0; i < dapple; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * R * 0.7;
    put(sway, Math.round(Math.cos(a) * r), cy + Math.round((rnd() - 0.3) * R * 0.7), Math.round(Math.sin(a) * r),
      rnd() < 0.5 ? edge : shade(baseC, pal.dark, 0.15), 0.7);
  }
}

/** Pale-pink blossom frost riding the canopy shell — an even staggered ring
 *  plus seeded scatter so the whole crown reads dusted, never clumped. */
function appleBlossom(sway: Voxel[], n: number, cy: number, R: number, seed: number, pink: number): void {
  const rnd = rng(seed);
  const dot = (x: number, y: number, z: number): void =>
    flowerDot(sway, x, y, z, rnd() < 0.6 ? pink : PALETTE.flowerWhite, 0.56);
  const ring = Math.ceil(n / 2);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const t = (i % 3) / 2 - 0.5; // staggered heights around the ring
    const rr = 0.95 + (i % 2) * 0.12;
    dot(Math.cos(a) * R * rr, cy + t * R * 0.9, Math.sin(a) * R * rr);
  }
  for (let i = ring; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = 0.9 + rnd() * 0.24;
    dot(Math.cos(a) * R * rr, cy + (rnd() - 0.25) * R * 1.15, Math.sin(a) * R * rr);
  }
}

/** Fruit ring riding the canopy shell — color/size/gloss per stage script. */
function appleFruit(
  sway: Voxel[], n: number, cy: number, R: number, seed: number, size: number,
  colorFor: (i: number) => number, stalkC: number, glossEvery: number,
): void {
  const rnd = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const r = R * (0.93 + rnd() * 0.13);
    const ax = Math.cos(a) * r, az = Math.sin(a) * r;
    const ay = cy + (rnd() - 0.55) * R * 1.05;
    const c = colorFor(i);
    put(sway, ax, ay - 0.45, az, c, size);
    put(sway, ax, ay + 0.05, az, stalkC, 0.24);
    if (glossEvery > 0 && i % glossEvery === 0)
      flowerDot(sway, ax + 0.24, ay - 0.55, az + 0.1, shade(c, 0xffffff, 0.45), 0.24);
  }
}

/**
 * Apple tree as a 10-keyframe AGE series — a perennial, so stages are tree
 * years, not one season (SPEC-GROWTH-VISUAL §2.5 "apple age progression
 * young→scaffold→bearing"):
 *   s0 germinated seed · s1 year-1 whip · s2 whip forks, first limbs headed ·
 *   s3 young open vase · s4 structural tree, canopy fills · s5 FIRST BLOSSOM ·
 *   s6 young bearing (green set + petal-fall) · s7 bearing, dense crown ·
 *   s8 fruit coloring (red blush over green) · s9 harvest-ready (shiny red,
 *   fallen fruit). Trunk/limbs thicken, the crown opens as a vase then rounds
 *   off dense, height ramps continuously. s9 mirrors states/apple-tree.ts
 *   (trunk 6, canopy R 5, seeds 75/85/335) so the Tier-2 state trees read as
 *   this same tree.
 */
export function makeAppleTree(stage: number, pal: CropPalette = APPLETREE_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  // s0 — germinated seed: loop sprout with seed-husk hint
  if (stage === 0) { soilPad(stat, 1.5, 888); sproutLoop(stat, sway, pal, 32); return finishPlant(stat, sway); }

  // foliage() saturates at mature from s5 (stageT clamps at 1) — past s5 the
  // crown instead deepens a little per bearing year.
  const base = stage <= 5 ? foliage(pal, stage) : shade(foliage(pal, 5), pal.dark, 0.03 * (stage - 5));
  const edge = shade(base, pal.dark, 0.38);
  const vein = shade(base, pal.light, 0.4);
  const wood = shade(PALETTE.woodDark, PALETTE.wood, 0.22);
  const sapling = shade(wood, PALETTE.woodLight, 0.3);

  if (stage === 1) {
    // year-1 slender whip: slim stem, alternate leaves, fat terminal bud
    soilPad(stat, 2, 889);
    appleTrunk(stat, 5, sapling, 0.7);
    const leafY = [2.2, 3, 3.8, 4.6];
    for (let i = 0; i < leafY.length; i++)
      put(sway, i % 2 ? 0.75 : -0.75, leafY[i], i % 3 === 1 ? 0.4 : -0.2, i % 2 ? base : edge, 0.62);
    put(sway, 0, 5.6, 0, vein, 0.5);
    put(sway, 0.35, 5.2, 0.3, base, 0.45);
    return finishPlant(stat, sway);
  }

  if (stage === 2) {
    // the whip forks — two first scaffold limbs, headed (cut back to buds)
    soilPad(stat, 2.5, 890);
    appleTrunk(stat, 4, sapling, 0.78);
    vline(stat, 0, 3, 0, 2, 5, 1, sapling);
    vline(stat, 0, 3, 0, -2, 5, -1, sapling);
    const tips: Array<[number, number, number]> = [[2, 5, 1], [-2, 5, -1], [0, 4, 0]];
    for (const [tx, ty, tz] of tips) {
      put(sway, tx, ty + 0.8, tz, base, 0.68);
      put(sway, tx + 0.5, ty + 0.4, tz, edge, 0.6);
      put(sway, tx - 0.4, ty + 0.9, tz + 0.4, vein, 0.5);
      put(sway, tx, ty + 1.5, tz, vein, 0.42);
    }
    put(sway, 0.7, 2.6, 0, edge, 0.55);
    put(sway, -0.7, 1.9, 0.3, base, 0.5);
    return finishPlant(stat, sway);
  }

  if (stage === 3) {
    // young open tree: a vase of 4 scaffold limbs, leaf clumps at the tips
    soilPad(stat, 2.8, 890);
    const w = shade(wood, PALETTE.woodLight, 0.18);
    appleTrunk(stat, 4, w, 0.85);
    appleLimbs(stat, 4, 4, 2.6, w);
    const rnd = rng(333);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const tx = Math.round(Math.cos(a) * 2.6 * 0.85), tz = Math.round(Math.sin(a) * 2.6 * 0.85);
      blob(sway, tx, 6.2, tz, 1.5, 1.25, 1.5, base, edge, { seed: 90 + i });
      put(sway, tx + (rnd() - 0.5), 7.4, tz + (rnd() - 0.5), vein, 0.5);
    }
    // small leader tuft + stray leaves — still airy, no central mass
    blob(sway, 0, 5.4, 0, 1.1, 0.9, 1.1, shade(base, pal.light, 0.12), edge, { seed: 95 });
    put(sway, 1.4, 3.4, 0.6, edge, 0.5);
    put(sway, -1.2, 2.8, -0.8, base, 0.5);
    return finishPlant(stat, sway);
  }

  if (stage === 4) {
    // structural tree: trunk thickens, the vase fills into a young crown
    soilPad(stat, 3.2, 890);
    const w = shade(wood, PALETTE.woodLight, 0.08);
    appleTrunk(stat, 5, w, 0.92);
    appleLimbs(stat, 4, 5, 3.2, w);
    const cy = 5 + 3.2 * 0.8;
    appleCanopy(sway, pal, base, cy, 3.2, 0.7, 16, 74, 334);
    // tip clumps remain as shoulder bumps — the vase closing over
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      blob(sway, Math.cos(a) * 2.7, cy + 0.6, Math.sin(a) * 2.7, 1.3, 1, 1.3,
        shade(base, pal.light, 0.15), edge, { seed: 96 + i });
    }
    return finishPlant(stat, sway);
  }

  if (stage === 5) {
    // FIRST BLOSSOM — the whole crown frosted pale pink
    soilPad(stat, 3.4, 890);
    appleTrunk(stat, 5, wood, 0.96);
    appleLimbs(stat, 4, 5, 3.8, wood);
    const cy = 5 + 3.8 * 0.8;
    appleCanopy(sway, pal, base, cy, 3.8, 0.72, 22, 73, 335);
    appleBlossom(sway, 40, cy, 3.8, 341, pal.accent);
    // deep-pink bud dots tucked among the open blooms
    const rnd = rng(342);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      flowerDot(sway, Math.cos(a) * 3.8 * 0.9, cy + (rnd() - 0.35) * 3.8, Math.sin(a) * 3.8 * 0.9,
        shade(pal.accent, pal.fruit, 0.25), 0.4);
    }
    return finishPlant(stat, sway);
  }

  if (stage === 6) {
    // young bearing: first small green set + petal-fall specks
    soilPad(stat, 3.5, 890);
    appleTrunk(stat, 6, wood, 1);
    appleLimbs(stat, 5, 6, 4.3, wood);
    const cy = 6 + 4.3 * 0.8;
    appleCanopy(sway, pal, base, cy, 4.3, 0.72, 26, 76, 336);
    appleFruit(sway, 6, cy, 4.3, 343, 0.62,
      (i) => (i % 2 ? shade(pal.unripe, 0xffffff, 0.12) : shade(pal.unripe, pal.light, 0.24)), edge, 0);
    // petal-fall: last pale petals on the crown, fallen ones on the pad
    const rnd = rng(344);
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.9 + rnd() * 0.15;
      flowerDot(sway, Math.cos(a) * 4.3 * rr, cy + (rnd() - 0.4) * 4.3, Math.sin(a) * 4.3 * rr,
        PALETTE.flowerWhite, 0.3);
    }
    const petal = shade(pal.accent, 0xffffff, 0.55);
    put(stat, 1.8, 0.3, 2.4, petal, 0.3);
    put(stat, 2.9, 0.28, 1.2, petal, 0.26);
    put(stat, -2.2, 0.3, -1.8, petal, 0.28);
    put(stat, -1.1, 0.26, 2.9, PALETTE.flowerWhite, 0.24);
    return finishPlant(stat, sway);
  }

  if (stage === 7) {
    // bearing: crown full and dense, green fruit sizing up
    soilPad(stat, 3.5, 890);
    appleTrunk(stat, 6, wood, 1);
    appleLimbs(stat, 5, 6, 4.6, wood);
    const cy = 6 + 4.6 * 0.8;
    appleCanopy(sway, pal, base, cy, 4.6, 0.75, 32, 77, 337);
    blob(sway, -4.6 * 0.25, cy + 4.6 * 0.42, 4.6 * 0.15, 4.6 * 0.32, 4.6 * 0.3, 4.6 * 0.32,
      shade(base, pal.light, 0.15), edge, { shell: true, seed: 87 });
    appleFruit(sway, 10, cy, 4.6, 345, 0.72,
      (i) => (i % 3 === 2 ? pal.unripe : shade(pal.unripe, 0xffffff, 0.22)), edge, 0);
    return finishPlant(stat, sway);
  }

  if (stage === 8) {
    // fruit coloring: reds blush over green, the set goes heavy
    soilPad(stat, 3.5, 890);
    appleTrunk(stat, 6, wood, 1);
    appleLimbs(stat, 5, 6, 4.8, wood);
    const cy = 6 + 4.8 * 0.8;
    appleCanopy(sway, pal, base, cy, 4.8, 0.74, 34, 78, 338);
    blob(sway, -4.8 * 0.22, cy + 4.8 * 0.45, 4.8 * 0.14, 4.8 * 0.34, 4.8 * 0.3, 4.8 * 0.34,
      shade(base, pal.light, 0.15), edge, { shell: true, seed: 88 });
    appleFruit(sway, 12, cy, 4.8, 346, 0.76,
      (i) => shade(pal.unripe, pal.fruit, 0.3 + ((i * 7) % 10) * 0.05), edge, 4);
    return finishPlant(stat, sway);
  }

  // s9 — HARVEST-READY: heavy with shiny red apples, a couple dropped
  soilPad(stat, 3.5, 890);
  appleTrunk(stat, 6, wood, 1);
  appleLimbs(stat, 5, 6, 5, wood);
  const cy = 6 + 5 * 0.8;
  appleCanopy(sway, pal, base, cy, 5, 0.72, 30, 75, 335); // states-exact crown
  appleFruit(sway, 13, cy, 5, 347, 0.82,
    (i) => (i % 4 === 3 ? shade(pal.fruit, pal.dark, 0.16) : shade(pal.fruit, 0xffffff, i % 2 ? 0.08 : 0)),
    edge, 2);
  // one low bough bent by the load
  vline(stat, 0, 6, 0, 3, 7, 2, wood);
  put(sway, 3.6, 6.4, 2.4, pal.fruit, 0.72);
  flowerDot(sway, 3.82, 6.66, 2.4, shade(pal.fruit, 0xffffff, 0.4), 0.22);
  // fallen fruit flanking the trunk — the unmistakable pick-me
  put(stat, 4.6, 0.4, 2.2, pal.fruit, 0.74);
  flowerDot(stat, 4.75, 0.68, 2.2, shade(pal.fruit, 0xffffff, 0.35), 0.22);
  put(stat, 4.6, 0.84, 2.2, pal.stem, 0.18);
  put(stat, -4.4, 0.36, 2.7, shade(pal.fruit, pal.dark, 0.12), 0.72);
  put(stat, -4.4, 0.76, 2.7, pal.stem, 0.16);
  return finishPlant(stat, sway);
}
