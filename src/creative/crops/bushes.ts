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

/** Apple tree as an age series: seedling → whip → young → blossom → fruit. */
export function makeAppleTree(stage: number, pal: CropPalette = APPLETREE_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) { soilPad(stat, 1.5, 888); sproutLoop(stat, sway, pal, 32); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);
  const wood = shade(PALETTE.woodDark, PALETTE.wood, 0.22);

  if (stage === 1) {
    // unbranched whip
    soilPad(stat, 2, 889);
    vline(stat, 0, 0, 0, 0, 4, 0, wood);
    put(sway, 0.7, 4.6, 0, f, 0.7);
    put(sway, -0.7, 4.3, 0.4, edge, 0.6);
    put(sway, 0, 4.9, -0.7, vein, 0.55);
    return finishPlant(stat, sway);
  }

  // scaffold-limb trees
  soilPad(stat, 3.5, 890, stage >= 3 ? 0 : 0);
  const trunkH = [0, 0, 4, 5, 6, 6][stage];
  const canopyR = [0, 0, 2, 3.6, 4.4, 5][stage];

  // trunk with basal flare
  for (let y = 0; y <= trunkH; y++) {
    const t = 1 - y / (trunkH + 2);
    put(stat, 0, y, 0, wood);
    if (y <= 1 && stage >= 3) {
      put(stat, 0.7 * t + 0.4, y, 0, wood, 0.85);
      put(stat, -0.4, y, 0.7 * t + 0.4, wood, 0.8);
    }
  }

  // scaffold limbs radiating under the canopy
  const nLimbs = [0, 0, 2, 4, 4, 5][stage];
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + 0.6;
    const dx = Math.cos(a), dz = Math.sin(a);
    const reach = canopyR * 0.85;
    vline(stat, 0, trunkH - 1, 0,
      Math.round(dx * reach), trunkH + Math.round(canopyR * 0.55), Math.round(dz * reach),
      wood);
  }

  // canopy: two overlapping off-center shells — organic, never a perfect ball
  const cy = trunkH + canopyR * 0.8;
  const cA = foliage(pal, stage);
  blob(sway, 0, cy, 0, canopyR, canopyR * 0.72, canopyR, cA, edge, { shell: true, seed: 70 + stage });
  blob(sway, canopyR * 0.5, cy + canopyR * 0.3, -canopyR * 0.35, canopyR * 0.58, canopyR * 0.46, canopyR * 0.58, shade(cA, pal.light, 0.2), edge, { shell: true, seed: 80 + stage });
  // interior dapple so gaps don't look hollow
  const rnd = rng(330 + stage);
  for (let i = 0; i < 10 + stage * 4; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * canopyR * 0.7;
    put(sway, Math.round(Math.cos(a) * r), cy + Math.round((rnd() - 0.3) * canopyR * 0.7), Math.round(Math.sin(a) * r),
      rnd() < 0.5 ? edge : shade(cA, pal.dark, 0.15), 0.7);
  }

  // crown events
  if (stage === 2) {
    put(sway, 0, cy + canopyR * 0.9, 0, vein, 0.7); // top bud whorl
  }
  if (stage === 3) {
    // full blossom — pink-white scatter riding the shell surface
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = 0.96 + rnd() * 0.16;
      flowerDot(sway,
        Math.cos(a) * canopyR * rr,
        cy + (rnd() - 0.3) * canopyR * 1.1,
        Math.sin(a) * canopyR * rr,
        rnd() < 0.6 ? pal.accent : PALETTE.flowerWhite, 0.52);
    }
  }
  if (stage === 4) {
    // small green apples — bright enough to read against the canopy
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2;
      const r = canopyR * 0.98;
      const ax = Math.cos(a) * r, az = Math.sin(a) * r;
      const ay = cy + (rnd() - 0.4) * canopyR;
      flowerDot(sway, ax, ay - 0.45, az, 0xb9cf6a, 0.75);
      flowerDot(sway, ax, ay + 0.12, az, edge, 0.26); // stalk stub
    }
  }
  if (stage === 5) {
    // ripe crop: big warm cluster, some apples hanging proud below the shell
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.5;
      const r = canopyR * (0.9 + rnd() * 0.12);
      const ax = Math.cos(a) * r, az = Math.sin(a) * r;
      const ay = cy + (rnd() - 0.55) * canopyR * 1.05;
      const c = i % 4 === 3 ? shade(pal.fruit, pal.dark, 0.16) : shade(pal.fruit, 0xffffff, i % 2 ? 0.08 : 0);
      put(sway, ax, ay - 0.45, az, c, 0.78);
      put(sway, ax, ay + 0.05, az, edge, 0.24);                       // stalk
      if (i % 3 === 0) flowerDot(sway, ax + 0.22, ay - 0.6, az, shade(c, 0xffffff, 0.4), 0.2); // gloss
    }
    // one low bough bent by the load
    vline(stat, 0, trunkH, 0, 3, trunkH + 1, 2, wood);
    put(sway, 3.6, trunkH + 0.4, 2.4, pal.fruit, 0.72);
  }
  return finishPlant(stat, sway);
}
