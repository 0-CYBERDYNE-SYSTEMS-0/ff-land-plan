/**
 * Archetype: tomato — indeterminate staked vine. HERO asset.
 * Anatomy: stake + straw twine figure-8 ties, twisting main stem with side
 * shoots, flat pinnate compound leaves, hanging trusses (flower → green → red).
 * Heights: 2 → 4 → 7 → 10 → 13 → 14.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, flowerDot,
} from './shared';

export const TOMATO_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x3d6e2e,
  dark: 0x2c5423,
  light: 0x6fa84c,
  stem: 0x5d9942,
  accent: PALETTE.flowerYellow,
  fruit: PALETTE.tomato,
  unripe: 0xa8c46a,
};

/**
 * Pinnate compound leaf: stalk arcs out-and-over (droop) with paired flat
 * leaflet plates and a 3-wide terminal leaflet — reads "tomato" any angle.
 */
function tomatoLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, vein: number, seed: number,
  droop = 0.045,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  put(sway, x, y, z, vein);
  for (let i = 1; i <= len; i++) {
    const lx = x + dx * i, lz = z + dz * i;
    const ly = y + Math.max(0, Math.round(i * 0.55 - droop * i * i));
    put(sway, lx, ly, lz, vein);
    if (i < len) {
      // paired leaflets — flat plate + drooping tiplet
      put(sway, lx + px, ly, lz + pz, rnd() < 0.25 ? edge : base);
      put(sway, lx + px, ly - 1, lz + pz, edge, 0.8);
      put(sway, lx - px, ly, lz - pz, rnd() < 0.25 ? edge : base);
      put(sway, lx - px, ly - 1, lz - pz, edge, 0.8);
    } else {
      // terminal leaflet — wider plate
      put(sway, lx, ly + 1, lz, base);
      put(sway, lx + px, ly + 1, lz + pz, base);
      put(sway, lx - px, ly + 1, lz - pz, base);
      put(sway, lx + px, ly, lz + pz, edge, 0.85);
      put(sway, lx - px, ly, lz - pz, edge, 0.85);
    }
  }
}

/** Hanging truss pushed clear of the foliage: peduncle out, fruit cluster down. */
function truss(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number,
  kind: 'flower' | 'green' | 'ripe',
  pal: CropPalette, seed: number,
): void {
  const rnd = rng(seed);
  const mx = x + dx * 3, mz = z + dz * 3;
  const ex = x + dx * 4, ez = z + dz * 4;
  vline(sway, x, y, z, mx, y, mz, pal.stem);            // peduncle out
  vline(sway, mx, y, mz, ex, y - 2, ez, pal.stem);      // elbow sweeping down
  if (kind === 'flower') {
    for (let i = 0; i < 6; i++)
      flowerDot(sway, ex + (rnd() * 2 - 1) * 0.9, y - 2.2 - rnd() * 1.1, ez + (rnd() * 2 - 1) * 0.9, pal.accent, 0.5);
    return;
  }
  const n = kind === 'ripe' ? 6 : 4;
  const cMain = kind === 'green' ? pal.unripe : pal.fruit;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed * 0.13;
    const fx = ex + Math.cos(a) * 0.75;
    const fz = ez + Math.sin(a) * 0.75;
    const fy = y - 2.6 - (i % 2) * 0.75;
    let c = cMain;
    if (kind === 'ripe' && rnd() < 0.2) c = shade(pal.unripe, pal.fruit, 0.4); // a few still turning
    put(sway, fx, fy, fz, c, 1.0);
    put(sway, fx, fy + 0.66, fz, shade(c, 0xffffff, 0.38), 0.26); // gloss speck
  }
}

/** Straw twine figure-8: visible band wrapping stem + stake. */
function twine(stat: Voxel[], y: number): void {
  const s = 0.42;
  flowerDot(stat, 0, y, 0.75, PALETTE.straw, s);
  flowerDot(stat, 0, y, -0.75, PALETTE.hay, s);
  flowerDot(stat, 1, y, 0.75, PALETTE.hay, s);
  flowerDot(stat, 1, y, -0.75, PALETTE.straw, s);
  flowerDot(stat, 0.5, y, 0, PALETTE.straw, 0.36); // cinch between stem and stake
  flowerDot(stat, 0.5, y - 0.45, 0.3, PALETTE.straw, 0.3); // knot tail
}

export function makeTomato(stage: number, pal: CropPalette = TOMATO_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 101);

  if (stage === 0) {
    sproutLoop(stat, sway, pal, 11);
    return finishPlant(stat, sway);
  }

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 3, 0, pal.stem);
    const f1 = foliage(pal, 1);
    tomatoLeaf(sway, 0, 2, 0, 1, 0, 2, f1, shade(f1, pal.dark, 0.4), shade(f1, pal.light, 0.45), 21);
    tomatoLeaf(sway, 0, 1, 0, -1, 0, 2, f1, shade(f1, pal.dark, 0.4), shade(f1, pal.light, 0.45), 22);
    return finishPlant(stat, sway);
  }

  // --- staked stages (s2–s5) ------------------------------------------------
  const heights = [0, 0, 6, 9, 12, 13];
  const H = heights[stage];
  const stakeH = [0, 0, 8, 11, 14, 15][stage];

  // stake — woodDark pole, pointed cap
  vline(stat, 1, 0, 0, 1, stakeH, 0, PALETTE.woodDark);
  put(stat, 1, stakeH + 0.6, 0, shade(PALETTE.woodDark, PALETTE.woodLight, 0.4), 0.6);

  // twisting main stem; s5 leans onto the stake at the top under fruit load
  for (let y = 0; y <= H; y++) {
    const wig = Math.sin(y * 1.15);
    const sx = stage === 5 && y > H - 4 ? 1 : wig > 0.25 ? 1 : wig < -0.25 ? -1 : 0;
    put(stat, sx, y, Math.round(Math.cos(y * 0.9) * 0.3), y === H ? shade(pal.stem, pal.dark, 0.2) : pal.stem);
  }

  // pinnate foliage distributed along the whole cordon
  const leafDirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nLeaves = [0, 0, 5, 6, 7, 8][stage];
  for (let i = 0; i < nLeaves; i++) {
    const y = 1 + Math.round((i * (H - 3)) / Math.max(1, nLeaves - 1));
    const [dx, dz] = leafDirs[i % 4];
    const f = foliage(pal, stage);
    // lower leaves run longer and droop harder — classic cordon profile
    const droop = 0.02 + 0.006 * (nLeaves - i);
    tomatoLeaf(sway, 0, y, 0, dx, dz, stage >= 4 ? 4 : 3, f, shade(f, pal.dark, 0.38), shade(f, pal.light, 0.42), 40 + i * 7, droop);
  }

  // twine ties once the plant is established
  if (stage >= 3) {
    const ties = stage === 3 ? [4] : stage === 4 ? [4, 8] : [3, 7, 11];
    for (const ty of ties) twine(stat, ty);
  }

  // trusses — strictly s3 flowers, s4 green, s5 ripe; hung on the camera side
  if (stage >= 3) {
    const kind = stage === 3 ? 'flower' : stage === 4 ? 'green' : 'ripe';
    const dirs: Array<[number, number]> = stage === 3 ? [[1, 0], [0, 1]] : [[1, 0], [0, 1], [1, 0]];
    const ys = stage === 3 ? [6, 8] : stage === 4 ? [5, 8, 10] : [5, 8, 11];
    ys.forEach((ty, i) => {
      const [dx, dz] = dirs[i % dirs.length];
      truss(sway, 0, ty, 0, dx, dz, kind as 'flower' | 'green' | 'ripe', pal, 90 + i * 13 + stage);
    });
  }

  // s5 harvest signal: one side shoot flopping with the load
  if (stage === 5) {
    vline(sway, 0, 9, 0, -2, 8, 1, pal.stem);
    const f5 = foliage(pal, 5);
    tomatoLeaf(sway, -2, 8, 1, 0, 1, 3, shade(f5, pal.dark, 0.15), shade(f5, pal.dark, 0.45), shade(f5, pal.light, 0.3), 66);
  }
  return finishPlant(stat, sway);
}
