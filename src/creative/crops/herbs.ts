/**
 * Archetypes: herb-clump (basil/parsley/cilantro/dill — soft leaf clump,
 * dill feathery) and herb-shrub (rosemary/thyme/sage/oregano/chives —
 * woody needle shrub / low mat / chive spear tubes).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, blade, frond, tubeLeaf, flowerDot, pompom,
} from './shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export interface HerbOpts { variant?: 'broad' | 'feathery' | 'shrub' | 'mat' | 'tubes' }

/* ------------------------------------------------------------------ */
/* herb-clump                                                          */
/* ------------------------------------------------------------------ */

export const HERBCLUMP_PAL: CropPalette = {
  young: 0x9ed06a,
  mature: 0x357a34,   // basil-deep
  dark: 0x255c26,
  light: 0x7cb754,
  stem: 0x54883e,
  accent: 0xe8dff0,   // basil spike
  fruit: 0x8fbf62,
  unripe: 0xa5cc74,
};

/** Soft clump of opposite-paired leaves on short stems; flower spikes late. */
export function makeHerbClump(stage: number, pal: CropPalette = HERBCLUMP_PAL, opts: HerbOpts = {}): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 555);

  if (stage === 0) { sproutLoop(stat, sway, pal, 28); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.36);
  const vein = shade(f, pal.light, 0.42);
  const feathery = opts.variant === 'feathery';

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    blade(sway, 0, 2, 0, 1, 0, 2, 2, 0.42, 0.08, f, vein, edge, 181);
    blade(sway, 0, 2, 0, -1, 0, 2, 2, 0.42, 0.08, f, vein, edge, 182);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 2, 3, 4, 4][stage];
  const nStems = [0, 0, 5, 6, 7, 8][stage];

  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    const sh = Math.max(2, H - (i % 3));
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    // i === 0 rises through the clump core; the rest lean outward
    const tx = i === 0 ? 0 : sx, tz = i === 0 ? 0 : sz;
    vline(stat, tx * 0.4, 0, tz * 0.4, tx, sh, tz, pal.stem);

    if (feathery) {
      // dill — umbrella wisps instead of broad leaves
      frond(sway, tx, sh - 1, tz, dx || 1, dz || -1, 2 + (i % 2), shade(f, pal.light, 0.25), shade(f, pal.dark, 0.2), 190 + i * 9);
      continue;
    }

    // opposite leaf pairs climbing the stem, offsets alternating per level
    // so the clump reads knobby-leafy rather than slabby columns (basil habit)
    for (let k = 0; k <= sh; k++) {
      const y = sh - k + sh * 0.15;
      const o = k % 2;
      const scale = k === sh ? 1 : 0.78;
      put(sway, tx + (sz ? o : 0), y, tz + (sx ? o : 0),
        (i + k) % 2 ? f : shade(f, pal.light, 0.16), 0.9 * scale + 0.1);
      put(sway, tx - (sz ? o : 0), y + 0.3, tz - (sx ? o : 0), shade(f, pal.dark, 0.14), 0.85 * scale);
    }
    // tip pair
    put(sway, tx * 1.8, sh + 0.7, tz * 1.8, vein, 0.85);
    put(sway, tx * 1.2 - (sz || 0), sh + 0.9, tz * 1.2 - (sx || 0), f, 0.75);
  }

  // s3: buds tightening at the tips (the spikes open from s4)
  if (stage === 3) {
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = R8[(i * 2 + 1) % 8];
      flowerDot(sway, Math.round(dx * 0.8), H + 0.9, Math.round(dz * 0.8), shade(pal.accent, pal.dark, 0.25), 0.42);
    }
  }

  // flower spikes from s4 (pinch them and the leaves keep coming)
  if (stage >= 4) {
    const spikes = stage === 4 ? 3 : 5;
    for (let i = 0; i < spikes; i++) {
      const [dx, dz] = R8[(i * 2 + 1) % 8];
      const bx = Math.round(dx * 0.8), bz = Math.round(dz * 0.8);
      const spikeH = H + 1 + (i % 2) + (stage === 5 ? 1 : 0);
      vline(sway, bx, H - 1, bz, bx, spikeH, bz, pal.stem);
      for (let r = 0; r < 4; r++)
        flowerDot(sway, bx + (r % 2 ? 0.32 : -0.32), H + r * 0.6, bz + ((r + 1) % 2 ? 0.32 : -0.32),
          r >= 2 ? pal.accent : shade(pal.accent, pal.light, 0.2), 0.4);
      flowerDot(sway, bx, spikeH + 0.5, bz, pal.accent, 0.42); // tip bud
    }
  }
  return finishPlant(stat, sway);
}

export const DILL_PAL: Partial<CropPalette> = {
  young: 0xb2d476,
  mature: 0x6fa24a,
  accent: 0xf0e68a,
};
export const PARSLEY_PAL: Partial<CropPalette> = {
  mature: 0x2f7030,
  dark: 0x215423,
};

/* ------------------------------------------------------------------ */
/* herb-shrub                                                          */
/* ------------------------------------------------------------------ */

export const HERBSHRUB_PAL: CropPalette = {
  young: 0x9ec46e,
  mature: 0x537f4a,   // grey-green rosemary
  dark: 0x3b6036,
  light: 0x86ab64,
  stem: 0x6b543a,     // woody
  accent: 0x9a86c9,   // mauve whorls
  fruit: 0x6f9a58,
  unripe: 0x84aa66,
};

/**
 * Woody herb. Default: upright needle stems (rosemary/sage).
 * Variants: 'mat' = prostrate thyme mat; 'tubes' = chive spears with pom heads.
 */
export function makeHerbShrub(stage: number, pal: CropPalette = HERBSHRUB_PAL, opts: HerbOpts = {}): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 666);

  if (stage === 0) { sproutLoop(stat, sway, pal, 29); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const needle = shade(f, pal.dark, 0.18);
  const wood = shade(PALETTE.woodDark, pal.stem, 0.25);

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    put(sway, 0.6, 2.4, 0, f, 0.7);
    put(sway, -0.6, 2.1, 0.3, needle, 0.6);
    put(sway, 0, 2.8, -0.6, shade(f, pal.light, 0.3), 0.55);
    put(sway, -0.2, 1.4, 0.6, needle, 0.6);
    return finishPlant(stat, sway);
  }

  /* --- chives: hollow spear tubes + purple pom-poms --------------------- */
  if (opts.variant === 'tubes') {
    const body = foliage(pal, stage);
    const tip = shade(body, pal.dark, 0.45);
    if (stage === 1) {
      tubeLeaf(sway, 0, 0, 0, 2, 0.3, 0, body, tip);
      tubeLeaf(sway, 0, 0, 0, 2, -0.3, 0.4, body, tip);
      return finishPlant(stat, sway);
    }
    const nTubes = [0, 0, 5, 7, 8, 9][stage];
    const h = [0, 0, 4, 6, 7, 8][stage];
    for (let i = 0; i < nTubes; i++) {
      const a = (i / nTubes) * Math.PI * 2;
      tubeLeaf(sway, Math.round(Math.cos(a) * 0.7), 0, Math.round(Math.sin(a) * 0.7), h - (i % 3), Math.cos(a) * 0.7, Math.sin(a) * 0.7,
        i % 2 ? body : shade(body, pal.light, 0.18), tip);
    }
    if (stage >= 4) {
      const nPoms = stage === 4 ? 2 : 4;
      for (let i = 0; i < nPoms; i++) {
        const a = (i / Math.max(1, nPoms)) * Math.PI * 2;
        vline(sway, Math.round(Math.cos(a)), 0, Math.round(Math.sin(a)), Math.round(Math.cos(a) * 1.2), h + 1, Math.round(Math.sin(a) * 1.2), shade(body, pal.stem, 0.4));
        pompom(sway, Math.round(Math.cos(a) * 1.2), h + 1.9, Math.round(Math.sin(a) * 1.2), 0.95, pal.accent, shade(pal.accent, 0xffffff, 0.3), 91 + i);
      }
    }
    return finishPlant(stat, sway);
  }

  /* --- thyme: prostrate fragrant mat ------------------------------------ */
  if (opts.variant === 'mat') {
    const spread = [0, 0, 2, 2.5, 3, 3.5][stage];
    const hMax = [0, 0, 1, 2, 2, 2][stage];
    const rnd = rng(300 + stage);
    for (let i = 0; i < 10 + stage * 4; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * spread;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      const y = rnd() < 0.65 ? 0.6 : 1.3 + (hMax > 1 && rnd() < 0.3 ? 0.6 : 0);
      put(sway, x, y, z, y > 1 ? f : needle, 0.72);
    }
    if (stage >= 4) {
      const nBloom = stage === 4 ? 3 : 6;
      for (let i = 0; i < nBloom; i++) {
        const a = (i / nBloom) * Math.PI * 2 + stage;
        flowerDot(sway, Math.round(Math.cos(a) * spread * 0.7), 1.9, Math.round(Math.sin(a) * spread * 0.7), pal.accent, 0.4);
      }
    }
    return finishPlant(stat, sway);
  }

  /* --- default: mounded needle shrub (rosemary / sage / oregano) -------- */
  const H = [0, 0, 3, 4, 5, 6][stage];
  const nStems = [0, 0, 5, 6, 7, 8][stage];
  // short gnarled wood at the base only
  put(stat, 0, 0.5, 0, wood, 1);
  if (stage >= 3) { put(stat, 0.5, 0.4, 0.4, wood, 0.7); put(stat, -0.5, 0.4, -0.3, wood, 0.7); }

  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    // mound profile: center stems tallest, edge stems short and outward
    const ringR = i < 4 ? 0 : 1;
    const sh = Math.max(2, H - ringR - (i % 2));
    const sx = Math.round(dx * ringR * 0.7), sz = Math.round(dz * ringR * 0.7);
    const stemC = shade(f, wood, 0.3); // green-grey stems, wood reads only at the base
    let x = sx, y = 0, z = sz;
    for (let k = 0; k <= sh; k++) {
      x = sx + Math.round(dx * 0.38 * k); z = sz + Math.round(dz * 0.38 * k); y = k + (ringR ? 0 : 0);
      put(stat, x, y, z, k < 1 && i % 2 === 0 ? wood : stemC);
      // needle whorls alternate sides per level so columns never slab
      const px = -(dz || 1), pz = dx || -1;
      if (k % 2 === 0) {
        put(sway, x + px, y, z + pz, k % 4 === 0 ? shade(needle, pal.light, 0.2) : needle, 0.75);
        put(sway, x - px, y + 0.35, z - pz, needle, 0.7);
      } else {
        put(sway, x, y + 0.2, z + pz, needle, 0.72);
        put(sway, x + px, y + 0.3, z, shade(needle, pal.light, 0.18), 0.7);
      }
      if (k >= 2) put(sway, x, y + 0.55, z, shade(needle, pal.light, 0.28), 0.55);
    }
    // bud then bloom whorl at the tips
    if (stage === 3) flowerDot(sway, x, y + 0.7, z, shade(pal.accent, pal.dark, 0.35), 0.45);
    if (stage >= 4) {
      const bloom = shade(pal.accent, 0xffffff, stage === 5 ? 0.12 : 0.02);
      flowerDot(sway, x, y + 0.8, z, bloom, 0.5);
      flowerDot(sway, x + 0.4, y + 1.05, z, bloom, 0.4);
      flowerDot(sway, x - 0.4, y + 1.0, z, shade(bloom, pal.dark, 0.2), 0.4);
    }
  }
  return finishPlant(stat, sway);
}

export const SAGE_PAL: Partial<CropPalette> = {
  mature: 0x8a9b76,
  dark: 0x67795a,
  light: 0xb3c39a,
  accent: 0x9a86c9,
};
export const THYME_PAL: Partial<CropPalette> = {
  mature: 0x6f9a58,
  accent: 0xe884a8,
};
export const CHIVES_PAL: Partial<CropPalette> = {
  mature: 0x4c8446,
  accent: 0xc06ac9,
};
