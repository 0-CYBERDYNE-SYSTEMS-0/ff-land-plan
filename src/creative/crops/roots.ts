/**
 * Archetypes: root-carrot (ferny tops, colored shoulder at harvest),
 * allium (tube leaves, bulb swell, tops-down fold at harvest), potato
 * (bushy mound, flowers, hilled soil cracked open at harvest).
 */
import { PALETTE, Voxel } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, frond, tubeLeaf, flowerDot, blob, umbel,
} from './shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/* ------------------------------------------------------------------ */
/* root-carrot                                                         */
/* ------------------------------------------------------------------ */

export const CARROT_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x3f7d33,
  dark: 0x2c5c24,
  light: 0x74ad52,
  stem: 0x55913f,
  accent: PALETTE.flowerWhite,
  fruit: PALETTE.carrot,
  unripe: 0xd99a56,
};

/** Carrot/radish/beet: feathery fern crowns; the root "telegraphs" at s4–s5. */
export function makeRootCarrot(stage: number, pal: CropPalette = CARROT_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 707);

  if (stage === 0) { sproutLoop(stat, sway, pal, 17); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  // s5 ferns stay full but bronze at the edges — the harvest-ready tint
  const tipC = stage === 5 ? shade(f, PALETTE.straw, 0.32) : shade(f, pal.light, 0.28);
  const sideC = shade(f, pal.dark, 0.22);

  if (stage === 1) {
    for (let i = 0; i < 3; i++) frond(sway, 0, 0.5, 0, i % 2 ? 1 : -1, i % 2 ? -1 : 1, 2, tipC, sideC, 71 + i);
    return finishPlant(stat, sway);
  }

  const nFronds = [0, 3, 6, 9, 11, 12][stage];
  const len = [0, 2, 3, 4, 5, 5][stage];
  // s5 lifts the crown so the ripening shoulder stays visible under the ferns
  const crownY = stage === 5 ? 1.15 : 0.5;
  for (let i = 0; i < nFronds; i++) {
    const [dx, dz] = R8[i % 8];
    const l = len - (i % 3 === 2 ? 1 : 0);
    frond(sway, Math.round(dx * (i % 3 === 0 ? 1 : 0)), crownY, Math.round(dz * (i % 4 === 0 ? 1 : 0)), dx || 1, dz, l, i % 2 ? tipC : shade(tipC, pal.dark, 0.18), sideC, 80 + i * 7 + stage);
  }

  // s3 bloom: white umbel on a tall scape — the carrot-family signature
  if (stage === 3) {
    vline(sway, 0, crownY, 0, 0, 6, 0, shade(f, pal.stem, 0.5));
    umbel(sway, 0, 6.6, 0, 1, pal.accent);
  }

  // root telegraphing: colored shoulder pushing at the soil
  if (stage === 4) {
    blob(stat, 0, 0.75, 0, 1.6, 0.7, 1.6, mixShoulder(pal), shade(mixShoulder(pal), PALETTE.soilDark, 0.35), { seed: 44 });
    put(stat, 0, 1.5, 0, shade(mixShoulder(pal), 0xffffff, 0.25), 0.55);
  }
  if (stage === 5) {
    // harvest-ready: the root has heaved the crust open — 2–3 voxels of fat
    // pal.fruit crown stand clear of the crack, showing the root's girth
    blob(stat, 0, 1.0, 0, 1.85, 1.05, 1.85, pal.fruit, shade(pal.fruit, PALETTE.shadow, 0.25), { seed: 45 });
    put(stat, 0, 2.15, 0, shade(pal.fruit, 0xffffff, 0.3), 0.65);    // glossy crown
    put(stat, 1.3, 1.8, 0.3, shade(pal.fruit, 0xffffff, 0.18), 0.5); // shoulder glints
    put(stat, -1.1, 1.75, -0.9, shade(pal.fruit, 0xffffff, 0.14), 0.45);
    // the pulled-aside crack: a wet dark crescent arcs around the crown
    const crack: Array<[number, number]> = [[2.3, 0.6], [1.7, 1.7], [0.5, 2.3], [-1.2, 2.0], [-2.2, 0.9]];
    for (let i = 0; i < crack.length; i++) {
      put(stat, crack[i][0], 0.4, crack[i][1], i % 2 ? PALETTE.soilWet : PALETTE.soilDark, 0.75);
    }
    put(stat, 2.5, 0.85, 1.0, PALETTE.soilDark, 0.85);   // heaved clods on the crack lip
    put(stat, -2.4, 0.8, -1.4, PALETTE.soilDark, 0.8);
    flowerDot(stat, 1.3, 0.6, -2.2, PALETTE.soilDark, 0.6);
  }
  return finishPlant(stat, sway);
}

const mixShoulder = (pal: CropPalette): number => shade(pal.unripe, pal.fruit, 0.7);

export const RADISH_PAL: Partial<CropPalette> = {
  mature: 0x4a8a3a,
  fruit: PALETTE.radish,
  unripe: 0xe08aa0,
};
export const BEET_PAL: Partial<CropPalette> = {
  mature: 0x3a6e38,
  dark: 0x274f26,
  accent: 0xc25070,
  fruit: PALETTE.beet,
  unripe: 0xa85a72,
};

/* ------------------------------------------------------------------ */
/* allium                                                              */
/* ------------------------------------------------------------------ */

export const ALLIUM_PAL: CropPalette = {
  young: 0x9ec96a,
  mature: 0x4f8746,
  dark: 0x39682f,
  light: 0x86b95e,
  stem: 0x5b9147,
  accent: 0xf0e6d0,     // papery white bloom
  fruit: 0xd9c893,      // cured bulb gold
  unripe: 0xe3dcc2,
};

/** Onion/garlic/leek: tube leaves → scape & bud → first kinks → swollen bulb, tops down. */
export function makeAllium(stage: number, pal: CropPalette = ALLIUM_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2, 808);

  if (stage === 0) { sproutLoop(stat, sway, pal, 18); return finishPlant(stat, sway); }

  const body = foliage(pal, stage);
  const tip = shade(body, pal.dark, 0.45);   // tube openings read darker

  if (stage === 1) {
    tubeLeaf(sway, 0, 0, 0, 2, 0.6, 0, body, tip);
    tubeLeaf(sway, 1, 0, 0, 2, -0.5, 0.5, body, tip);
    return finishPlant(stat, sway);
  }

  const nTubes = [0, 0, 5, 6, 7, 7][stage];
  const h = [0, 0, 4, 7, 8, 8][stage];

  if (stage <= 4) {
    // tube bases spread on distinct cells so each column stays readable
    const bases: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (let i = 0; i < nTubes; i++) {
      const [bx, bz] = bases[i % bases.length];
      const a = (i / nTubes) * Math.PI * 2;
      const leanX = Math.cos(a) * 0.5, leanZ = Math.sin(a) * 0.5;
      const c = i % 2 ? body : shade(body, pal.light, 0.2);
      if (stage === 4 && i >= nTubes - 2) {
        // first weakness: the last two tubes kink past mid-height and sag
        // outward — the fold that says the bulb underneath is nearly ripe
        const ux = Math.sign(bx), uz = Math.sign(bz);
        const kH = i === nTubes - 2 ? h - 2 : h - 3;
        vline(sway, bx, 0, bz, bx + ux, kH, bz + uz, c);
        vline(sway, bx + ux, kH, bz + uz, bx + ux * 2.8, kH - 2.5, bz + uz * 2.8, shade(c, pal.dark, 0.12));
        vline(sway, bx + ux * 2.8, kH - 2.5, bz + uz * 2.8, bx + ux * 3.8, kH - 3.6, bz + uz * 3.8, shade(c, PALETTE.straw, 0.4));
      } else {
        tubeLeaf(sway, bx, 0, bz, h - (i % 3 === 2 ? 1 : 0), leanX, leanZ, c, tip);
      }
    }
    if (stage === 3 || stage === 4) {
      // central scape with bud / opening bloom
      vline(sway, 0, 0, 0, 0, h + 1, 0, shade(body, pal.stem, 0.4));
      if (stage === 3) flowerDot(sway, 0, h + 1.8, 0, shade(pal.accent, pal.dark, 0.2), 0.6);
      else umbel(sway, 0, h + 2, 0, 1, pal.accent);
    }
  }

  if (stage === 5) {
    // HARVEST-READY — the allium read: bulb swollen with shoulders proud of
    // the soil line, and MOST tops kinked at mid-height, pouring out and down
    blob(stat, 0, 1.1, 0, 2.0, 1.3, 2.0, pal.fruit, shade(pal.fruit, pal.dark, 0.22), { seed: 55 });
    blob(stat, 0, 2.4, 0, 0.95, 0.5, 0.95, shade(pal.fruit, 0xffffff, 0.32), null); // taut shoulder sheen
    put(stat, 0, 2.95, 0, shade(body, pal.dark, 0.2), 0.7); // neck
    put(stat, 2.3, 0.35, 0.7, PALETTE.soilDark, 0.6);       // crust heaved aside by the swell
    put(stat, -0.8, 0.35, -2.3, PALETTE.soilDark, 0.6);
    // six tubes fold: rise off the neck, kink at mid-height, pour to the pad
    const arcs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < arcs.length; i++) {
      const [dx, dz] = arcs[i];
      const c = i % 2 ? body : shade(body, pal.light, 0.18);
      const kY = 4.9 - (i % 3) * 0.55;             // kinks fan over a band, not one point
      const r1 = 1.1 + (i % 2) * 0.25, r2 = 3.2 - (i % 3) * 0.2;
      vline(sway, 0, 2.95, 0, dx * r1, kY, dz * r1, c);                                        // rise to the kink
      vline(sway, dx * r1, kY, dz * r1, dx * r2, kY - 2.4, dz * r2, shade(c, pal.dark, 0.12)); // the pour
      vline(sway, dx * r2, kY - 2.4, dz * r2, dx * 4.1, 0.9, dz * 4.1, shade(body, pal.dark, 0.28));
      if (i >= arcs.length - 2) {
        // a couple of tips have browned off — harvest day is here
        vline(sway, dx * 4.1, 0.9, dz * 4.1, dx * 4.85, 0.45, dz * 4.85, shade(body, PALETTE.straw, 0.62));
      } else {
        vline(sway, dx * 4.1, 0.9, dz * 4.1, dx * 4.75, 0.5, dz * 4.75, tip); // dark tube opening
      }
    }
    // one late tube still reaching — not every top folds the same week
    tubeLeaf(sway, 0, 3.4, 0, 4, 0.5, -0.35, shade(body, pal.light, 0.12), tip);
  }
  return finishPlant(stat, sway);
}

export const GARLIC_PAL: Partial<CropPalette> = {
  mature: 0x54854a,
  fruit: 0xefe8dc,
  unripe: 0xe8e2d0,
};
export const LEEK_PAL: Partial<CropPalette> = {
  mature: 0x468049,
  dark: 0x33602f,
  fruit: 0xefe9da,   // long white shank
  unripe: 0xe6e0cf,
};

/* ------------------------------------------------------------------ */
/* potato                                                              */
/* ------------------------------------------------------------------ */

export const POTATO_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x3e7a37,
  dark: 0x2b5c27,
  light: 0x71ab50,
  stem: 0x558a42,
  accent: PALETTE.flowerWhite,
  fruit: PALETTE.potato,
  unripe: 0xb09468,
};

/** Potato leaf: short stalk with paired oval leaflets (smaller than tomato's). */
function potatoLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, seed: number,
): void {
  const px = -dz, pz = dx;
  let lx = x, ly = y, lz = z;
  for (let i = 1; i <= len; i++) {
    lx = x + dx * i; lz = z + dz * i; ly = y + Math.round(i * 0.62);
    put(sway, lx, ly, lz, base);
    if (i < len) {
      put(sway, lx + px, ly, lz + pz, edge, 0.8);
      put(sway, lx - px, ly, lz - pz, edge, 0.8);
    } else {
      put(sway, lx, ly + 1, lz, base, 0.85);
    }
    void seed;
  }
}

/** Potato: mound of pinnate foliage → blooms → berries → green vines + cracked hill. */
export function makePotato(stage: number, pal: CropPalette = POTATO_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 909, stage >= 3 ? 1 : 0);

  if (stage === 0) { sproutLoop(stat, sway, pal, 19); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);

  if (stage === 1) {
    potatoLeaf(sway, 0, 1, 0, 1, 0, 2, f, shade(f, pal.dark, 0.35), 91);
    potatoLeaf(sway, 0, 1, 0, 0, 1, 2, f, shade(f, pal.dark, 0.35), 92);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 3, 4, 5, 4][stage];   // s5 settles slightly — vines stay green, energy in the tubers
  const nStems = [0, 0, 5, 6, 7, 7][stage];
  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    const sh = H - (i % 2);
    const sx = dx * (i > 3 ? 0.8 : 0.4), sz = dz * (i > 3 ? 0.8 : 0.4);
    const tipX = sx * (1 + sh * 0.2), tipZ = sz * (1 + sh * 0.2);
    vline(stat, sx * 0.4, 0.8, sz * 0.4, tipX, 1 + sh, tipZ, pal.stem);

    const [ldx, ldz] = [[dx, dz], [-dx, -dz], [dz, dx]][i % 3] as [number, number];
    // two pinnate pairs per stem — dense mound, never a candelabra
    potatoLeaf(sway, Math.round(tipX), 1 + Math.max(1, sh - 1), Math.round(tipZ),
      ldx, ldz, stage >= 3 ? 3 : 2, f, shade(f, pal.dark, 0.35), 93 + i * 5);
    potatoLeaf(sway, Math.round(sx), 2, Math.round(sz),
      -ldx, -ldz, 2, shade(f, pal.light, 0.12), shade(f, pal.dark, 0.35), 123 + i * 3);
  }

  if (stage === 3) {
    // white bloom clusters
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[(i * 2 + 1) % 8];
      flowerDot(sway, dx * 2, 1 + H + 0.5, dz * 2, pal.accent, 0.5);
      flowerDot(sway, dx * 2, 1 + H + 0.95, dz * 2, 0xf7e27a, 0.26); // yellow eye
    }
  }
  if (stage === 4) {
    // flowers fading to a few green berries
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = R8[(i * 3) % 8];
      flowerDot(sway, dx * 2.2, 1 + H - 0.2, dz * 2.2, 0x8fae52, 0.5);
    }
  }
  if (stage === 5) {
    // still flowering — small pale blooms over the vigorous green vines
    const blooms: Array<[number, number]> = [[1.9, 0.7], [-1.6, 1.3], [0.5, -2.0], [-0.9, -1.6]];
    for (let i = 0; i < blooms.length; i++) {
      const [bx, bz] = blooms[i];
      flowerDot(sway, bx, 1 + H + 0.5, bz, pal.accent, 0.45);
      flowerDot(sway, bx, 1 + H + 0.85, bz, 0xf7e27a, 0.22); // yellow eye
    }
    // the pick-me: the hilled mound has cracked — one or two pale tuber
    // crowns peek through, still planted, ready to dig
    put(stat, 1, 1.5, -1, pal.fruit, 0.9);
    put(stat, 1, 2.0, -1, shade(pal.fruit, 0xffffff, 0.18), 0.5);  // crown glint
    put(stat, 0, 1.18, -1, PALETTE.soilDark, 0.65);               // crack lips
    put(stat, 1, 1.18, 0, PALETTE.soilDark, 0.6);
    put(stat, 2, 0.7, -1.2, PALETTE.soilDark, 0.6);
    put(stat, -1, 1.45, 1, shade(pal.fruit, PALETTE.soilDark, 0.1), 0.65); // second peek
    put(stat, -2, 0.65, 1.2, PALETTE.soilDark, 0.5);
  }
  return finishPlant(stat, sway);
}
