/**
 * Special builder: PEPPER (de-cloned from the tomato archetype,
 * SPEC-GROWTH-VISUAL §2.5 Tier 3).
 *
 * Distinct architecture — a farmer names it from the s4 silhouette alone,
 * NOT a recolored tomato:
 *  - compact BUSH: no cordon, no tall central stake. A short crown forking
 *    LOW into 4-7 arching branches that dome into a rounded canopy wider
 *    than tall (~60-70% of tomato height). s4+ gets short dig-in twig
 *    stakes at the bush edge — support twigs, never a tomato pole.
 *  - dense smallish ROUNDED leaves with bright gloss specks (vs tomato
 *    pinnate compound plates).
 *  - BELL fruit: blocky 2x2 bodies with 3-4 lobe bumps at the tip, hanging
 *    DOWN in clusters of 2-3 at branch forks — never tomato truss chains.
 *    s3 white nodding blooms (pal.accent); s4 green (pal.unripe) turning to
 *    s5 ripe (pal.fruit) with gloss.
 * Heights: 2 → 3 → 6 → 7 → 8 → 9.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, flowerDot,
} from '../shared';
import type { SpecialBuildFn } from './types';

/** Rounded glossy leaf: thin stalk, 3-wide pointed-oval plate, bright specks. */
function pepperLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, gloss: number, seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  put(sway, x, y, z, edge, 0.7); // stalk
  for (let i = 1; i <= len; i++) {
    const cx = x + dx * i, cz = z + dz * i;
    const tip = i === len;
    put(sway, cx, y + 1, cz, tip ? shade(base, edge, 0.3) : base);
    if (!tip) {
      put(sway, cx + px, y + 1, cz + pz, rnd() < 0.28 ? edge : base, 0.9);
      put(sway, cx - px, y + 1, cz - pz, rnd() < 0.28 ? edge : base, 0.9);
    }
  }
  // gloss highlights riding the blade surface
  put(sway, x + dx, y + 1.55, z + dz, gloss, 0.3);
  if (len >= 3) put(sway, x + dx * 2, y + 1.55, z + dz * 2, gloss, 0.24);
}

/** Pendant bell fruit: bent pedicel, blocky 2x2 body, 3-4 lobe bumps at tip. */
function pepperFruit(
  sway: Voxel[], x: number, y: number, z: number,
  pal: CropPalette, c: number, big: boolean, seed: number,
): void {
  const rnd = rng(seed);
  // pedicel elbows so the fruit hangs plumb below the fork
  put(sway, x, y, z, pal.stem, 0.6);
  put(sway, x + (rnd() < 0.5 ? 0.32 : -0.32), y - 0.7, z, pal.stem, 0.5);
  const layers = big ? 3 : 2;
  const fy = y - 1.6;
  for (let l = 0; l < layers; l++) {
    const yy = fy - l * 0.95;
    put(sway, x - 0.42, yy, z - 0.42, c, 0.92);
    put(sway, x + 0.42, yy, z - 0.42, c, 0.92);
    put(sway, x - 0.42, yy, z + 0.42, c, 0.92);
    put(sway, x + 0.42, yy, z + 0.42, c, 0.92);
  }
  // lobed tip: 3-4 bumps with a dimple gap between them (the bell pepper read)
  const ty = fy - (layers - 1) * 0.95 - 0.8;
  const lobes: Array<[number, number]> = [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]];
  const nLobes = rnd() < 0.5 ? 3 : 4;
  for (let i = 0; i < nLobes; i++) put(sway, x + lobes[i][0], ty, z + lobes[i][1], c, 0.45);
  put(sway, x + 0.28, fy + 0.38, z + 0.28, shade(c, pal.accent, 0.45), 0.26); // gloss
}

/** Cluster of 2-3 pendant fruit hanging at a branch fork. */
function pepperCluster(
  sway: Voxel[], x: number, y: number, z: number,
  pal: CropPalette, c: number, n: number, seed: number, allBig = false,
): void {
  const offs: Array<[number, number]> = [[0, 0], [0.95, 0.3], [-0.85, -0.45]];
  for (let i = 0; i < n; i++) {
    // siblings ripen unevenly — the big king fruit leads
    const ci = i === 0 ? c : shade(c, pal.unripe, i === 1 ? 0.3 : 0.55);
    pepperFruit(sway, x + offs[i][0], y, z + offs[i][1], pal, ci, i === 0 || allBig, seed + i * 7);
  }
}

/** Nodding white bloom: warm center eye, white petal dots facing out-down. */
function pepperFlower(sway: Voxel[], x: number, y: number, z: number, pal: CropPalette): void {
  flowerDot(sway, x, y, z, shade(pal.accent, pal.fruit, 0.45), 0.34);
  flowerDot(sway, x + 0.55, y - 0.12, z, pal.accent, 0.42);
  flowerDot(sway, x - 0.55, y - 0.12, z, pal.accent, 0.42);
  flowerDot(sway, x, y - 0.12, z + 0.55, pal.accent, 0.42);
  flowerDot(sway, x, y - 0.12, z - 0.55, pal.accent, 0.42);
  flowerDot(sway, x, y - 0.5, z, shade(pal.accent, pal.fruit, 0.2), 0.4);
}

/** Short dig-in twig stake (s4+ bush support — never the tomato's tall pole). */
function twigStake(stat: Voxel[], x: number, z: number, lx: number, lz: number, h: number): void {
  vline(stat, x, 0, z, x + lx, h, z + lz, PALETTE.wood);
  put(stat, x + lx * 0.85, h + 0.45, z + lz * 0.85, shade(PALETTE.wood, PALETTE.woodDark, 0.45), 0.5);
}

interface Branch { ex: number; ey: number; ez: number; }

/** Bush branch tables (s2-s5): fork LOW, arch out, dome into a rounded crown. */
const BRANCHES: Record<number, Branch[]> = {
  2: [{ ex: 3, ey: 4, ez: 1 }, { ex: -3, ey: 4, ez: -1 }, { ex: 1, ey: 4, ez: -3 }, { ex: -1, ey: 5, ez: 3 }],
  3: [{ ex: 4, ey: 5, ez: 1 }, { ex: -4, ey: 5, ez: -1 }, { ex: 1, ey: 5, ez: -4 }, { ex: -1, ey: 5, ez: 4 }, { ex: 2, ey: 6, ez: -2 }],
  4: [{ ex: 4, ey: 6, ez: 1 }, { ex: -4, ey: 6, ez: -1 }, { ex: 1, ey: 6, ez: -4 }, { ex: -1, ey: 6, ez: 4 }, { ex: 3, ey: 7, ez: -3 }, { ex: -3, ey: 6, ez: 3 }],
  5: [{ ex: 5, ey: 8, ez: 2 }, { ex: -5, ey: 7, ez: -2 }, { ex: 2, ey: 7, ez: -5 }, { ex: -2, ey: 8, ez: 5 }, { ex: 4, ey: 8, ez: -3 }, { ex: -4, ey: 7, ez: 3 }, { ex: 3, ey: 8, ez: 0 }],
};

/** One arching branch: stem line, leaf stations, optional Y sub-fork at tip. */
function bushBranch(
  stat: Voxel[], sway: Voxel[],
  forkY: number, b: Branch, stemC: number,
  leafLen: number, base: number, edge: number, gloss: number,
  seed: number, tips: boolean, sag: number,
): void {
  vline(stat, 0, forkY, 0, b.ex, b.ey - sag, b.ez, stemC);
  const stations = [0.4, 0.68, 0.92];
  const ox = Math.sign(b.ex) || 1, oz = Math.sign(b.ez) || 1;
  const alongX = Math.abs(b.ex) >= Math.abs(b.ez);
  for (let s = 0; s < stations.length; s++) {
    const t = stations[s];
    const lx = Math.round(b.ex * t);
    const ly = Math.round(forkY + (b.ey - forkY) * t);
    const lz = Math.round(b.ez * t);
    // alternate outward / perpendicular leaf axes (axis-aligned only)
    const dir: [number, number] = s % 2 === 0
      ? (alongX ? [ox, 0] : [0, oz])
      : (alongX ? [0, oz] : [ox, 0]);
    pepperLeaf(sway, lx, ly, lz, dir[0], dir[1], Math.max(2, leafLen - (s === 2 ? 1 : 0)), base, edge, gloss, seed + s * 11);
  }
  if (tips) {
    // short Y fork at the tip — where flowers and fruit set
    const tx = alongX ? 1 : 0, tz = alongX ? 0 : 1;
    const ey = b.ey - sag;
    vline(stat, b.ex, ey, b.ez, b.ex + tx, ey + 1, b.ez + tz, stemC);
    vline(stat, b.ex, ey, b.ez, b.ex - tx, ey + 1, b.ez - tz, stemC);
  }
}

export const buildPepper: SpecialBuildFn | null = (stage, pal) => {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 101);

  if (stage === 0) {
    sproutLoop(stat, sway, pal, 11);
    return finishPlant(stat, sway);
  }

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    const f1 = foliage(pal, 1);
    const base = shade(f1, pal.light, 0.1);
    const edge = shade(f1, pal.dark, 0.38);
    const gloss = shade(f1, pal.light, 0.6);
    pepperLeaf(sway, 0, 2, 0, 1, 0, 2, base, edge, gloss, 21);
    pepperLeaf(sway, 0, 1, 0, -1, 0, 2, base, edge, gloss, 22);
    pepperLeaf(sway, 0, 2, 0, 0, 1, 1, base, edge, gloss, 23);
    return finishPlant(stat, sway);
  }

  // --- bush stages (s2-s5) --------------------------------------------------
  const forkY = stage >= 4 ? 3 : 2;
  const f = foliage(pal, stage);
  const base = shade(f, pal.light, 0.1);       // brighter than tomato — glossier
  const edge = shade(f, pal.dark, 0.38);
  const gloss = shade(f, pal.light, 0.6);
  const branchC = shade(pal.stem, pal.dark, 0.18);

  // short main crown with a flared woody base
  vline(stat, 0, 0, 0, 0, forkY, 0, pal.stem);
  put(stat, 0, 0.45, 0, shade(branchC, pal.dark, 0.2), 1.25);

  const branches = BRANCHES[stage] ?? BRANCHES[5];
  const leafLen = stage >= 4 ? 3 : 2;
  branches.forEach((b, i) => {
    // the camera-side branch sags one voxel at s5 — fruit load "pick me"
    bushBranch(stat, sway, forkY, b, branchC, leafLen, base, edge, gloss, 40 + i * 7, stage >= 3, stage === 5 && i === 0 ? 1 : 0);
  });

  // crown filler leaves so the dome reads dense, not spokes
  if (stage >= 4) {
    pepperLeaf(sway, 0, forkY + 1, 0, 1, 0, leafLen, base, edge, gloss, 71);
    pepperLeaf(sway, 0, forkY + 2, 0, 0, 1, leafLen, base, edge, gloss, 72);
    if (stage === 5) pepperLeaf(sway, 0, forkY + 3, 0, -1, 0, leafLen, base, edge, gloss, 73);
  }

  if (stage === 3) {
    // white blooms at branch tips + a couple of buds
    pepperFlower(sway, 4, 6, 1, pal);
    pepperFlower(sway, -1, 6, 4, pal);
    pepperFlower(sway, 2, 7, -2, pal);
    flowerDot(sway, -4, 6, -1, pal.accent, 0.36);
    flowerDot(sway, 1, 6, -4, pal.accent, 0.36);
  }

  if (stage >= 4) {
    // pendant clusters at branch forks — green turning to ripe
    if (stage === 4) {
      // s4 fruit lifted toward pal.light so green reads against green foliage,
      // hung low so the blocks clear the canopy skirt
      const unripeShow = shade(pal.unripe, pal.light, 0.42);
      pepperCluster(sway, 3, 4, 1, pal, unripeShow, 2, 91, true);
      pepperCluster(sway, -1, 4, 3, pal, unripeShow, 3, 92, true);
      pepperCluster(sway, 2, 4, -2, pal, unripeShow, 2, 93, true);
      twigStake(stat, 3.1, 2.2, 0.6, 0.4, 3.2);
      twigStake(stat, -2.9, -2.0, -0.6, -0.4, 3.0);
    } else {
      pepperCluster(sway, 3, 6, 1, pal, pal.fruit, 3, 94);
      pepperCluster(sway, -1, 6, 3, pal, pal.fruit, 3, 95);
      pepperCluster(sway, 2, 6, -2, pal, pal.fruit, 3, 96);
      pepperCluster(sway, -2, 5, 2, pal, pal.fruit, 2, 97);
      twigStake(stat, 3.1, 2.2, 0.6, 0.4, 3.2);
      twigStake(stat, -2.9, -2.0, -0.6, -0.4, 3.0);
      twigStake(stat, 2.2, -2.6, 0.4, -0.5, 2.6);
    }
  }
  return finishPlant(stat, sway);
};
