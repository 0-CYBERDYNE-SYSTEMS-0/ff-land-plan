/**
 * Archetypes: root-carrot (ferny tops, colored shoulder at harvest),
 * allium (tube leaves, bulb swell, fallen tops), potato (bushy mound,
 * flowers, hilled soil, die-back with exposed tubers).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
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
  const tipC = shade(f, pal.light, 0.28);
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

  // root telegraphing: colored shoulder pushing at the soil
  if (stage === 4) {
    blob(stat, 0, 0.45, 0, 1.2, 0.55, 1.2, mixShoulder(pal), shade(mixShoulder(pal), PALETTE.soilDark, 0.35), { seed: 44 });
    put(stat, 0, 0.95, 0, shade(mixShoulder(pal), 0xffffff, 0.25), 0.5);
  }
  if (stage === 5) {
    // harvest-ready: proud shoulder ring, soil cracked away, ferns lush
    blob(stat, 0, 0.75, 0, 1.6, 0.8, 1.6, pal.fruit, shade(pal.fruit, PALETTE.shadow, 0.25), { seed: 45 });
    put(stat, 0, 1.5, 0, shade(pal.fruit, 0xffffff, 0.3), 0.6); // glossy crown
    flowerDot(stat, 1.9, 0.2, 1.3, PALETTE.soilDark, 0.5);       // heaved clod
  }
  return finishPlant(stat, sway);
}

const mixShoulder = (pal: CropPalette): number => shade(pal.unripe, pal.fruit, 0.5);

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

/** Onion/garlic/leek: tube leaves → scape & bud → swollen bulb → fallen tops. */
export function makeAllium(stage: number, pal: CropPalette = ALLIUM_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2, 808);

  if (stage === 0) { sproutLoop(stat, sway, pal, 18); return finishPlant(stat, sway); }

  const body = foliage(pal, stage);
  const tip = shade(body, pal.dark, 0.45);   // tube openings read darker

  if (stage === 1) {
    tubeLeaf(sway, 0, 0, 0, 2, 0.4, 0, body, tip);
    tubeLeaf(sway, 0, 0, 0, 2, -0.3, 0.5, body, tip);
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
      tubeLeaf(sway, bx, 0, bz, h - (i % 3 === 2 ? 1 : 0), leanX, leanZ, i % 2 ? body : shade(body, pal.light, 0.2), tip);
    }
    if (stage === 3 || stage === 4) {
      // central scape with bud / opening bloom
      vline(sway, 0, 0, 0, 0, h + 1, 0, shade(body, pal.stem, 0.4));
      if (stage === 3) flowerDot(sway, 0, h + 1.8, 0, shade(pal.accent, pal.dark, 0.2), 0.6);
      else umbel(sway, 0, h + 2, 0, 1, pal.accent);
    }
  }

  if (stage === 5) {
    // bulb swollen and lifted, tops fallen over in smooth connected arcs
    blob(stat, 0, 0.8, 0, 1.5, 1.05, 1.5, pal.fruit, shade(pal.fruit, pal.dark, 0.3), { seed: 55 });
    blob(stat, 0, 1.75, 0, 0.9, 0.5, 0.9, shade(pal.fruit, 0xffffff, 0.32), null);
    put(stat, 0, 2.1, 0, shade(body, pal.dark, 0.2), 0.7); // neck
    const arcs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (let i = 0; i < arcs.length; i++) {
      const [dx, dz] = arcs[i];
      const c = i % 2 ? body : shade(body, pal.light, 0.2);
      vline(sway, 0, 2, 0, dx * 2, 3, dz * 2, c);
      vline(sway, dx * 2, 3, dz * 2, dx * 4, 1, dz * 4, shade(c, pal.dark, 0.18));
      vline(sway, dx * 4, 1, dz * 4, dx * 5, 0, dz * 5, shade(body, pal.dark, 0.32));
    }
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

/** Potato: mound of pinnate foliage → blooms → hilled soil → die-back + tubers. */
export function makePotato(stage: number, pal: CropPalette = POTATO_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 909, stage >= 3 ? 1 : 0);

  if (stage === 0) { sproutLoop(stat, sway, pal, 19); return finishPlant(stat, sway); }

  const rnd = rng(910 + stage);
  const f = foliage(pal, stage);

  if (stage === 1) {
    potatoLeaf(sway, 0, 1, 0, 1, 0, 2, f, shade(f, pal.dark, 0.35), 91);
    potatoLeaf(sway, 0, 1, 0, 0, 1, 2, f, shade(f, pal.dark, 0.35), 92);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 3, 4, 5, 4][stage];   // s5 is shorter: dying back
  const nStems = [0, 0, 5, 6, 7, 7][stage];
  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    const sh = H - (i % 2);
    const sx = dx * (i > 3 ? 0.8 : 0.4), sz = dz * (i > 3 ? 0.8 : 0.4);
    const tipX = sx * (1 + sh * 0.2), tipZ = sz * (1 + sh * 0.2);
    vline(stat, sx * 0.4, 0.8, sz * 0.4, tipX, 1 + sh, tipZ, pal.stem);

    // s5 die-back: foliage yellows from the base and flops outward
    const leafF = stage === 5 && rnd() < 0.75 ? shade(f, PALETTE.straw, 0.55) : f;
    const [ldx, ldz] = [[dx, dz], [-dx, -dz], [dz, dx]][i % 3] as [number, number];
    // two pinnate pairs per stem — dense mound, never a candelabra
    potatoLeaf(sway, Math.round(tipX), 1 + Math.max(1, sh - 1), Math.round(tipZ),
      ldx, ldz, stage >= 3 ? 3 : 2, leafF, shade(leafF, pal.dark, 0.35), 93 + i * 5);
    potatoLeaf(sway, Math.round(sx), 2, Math.round(sz),
      -ldx, -ldz, 2, shade(leafF, pal.light, 0.12), shade(leafF, pal.dark, 0.35), 123 + i * 3);
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
    // the pick-me: tubers pushed out of the cracked hill
    put(stat, 2.1, 0.9, 1.1, pal.fruit, 0.95);
    put(stat, -1.9, 0.8, -1.3, shade(pal.fruit, PALETTE.shadow, 0.15), 0.85);
    put(stat, 0.6, 1.0, -2.2, shade(pal.fruit, 0xffffff, 0.12), 0.8);
  }
  return finishPlant(stat, sway);
}
