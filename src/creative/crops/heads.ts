/**
 * Archetypes: leafy-head (lettuce/cabbage/cauliflower), brassica (broccoli/kale),
 * greens-open (spinach/arugula/chard). Rosette builders sharing one leaf language:
 * spoon-shaped blade leaves radiating from a crown; heads/curds swell late.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, blade, blob,
} from './shared';

/* ------------------------------------------------------------------ */
/* leafy-head                                                          */
/* ------------------------------------------------------------------ */

export const LEAFYHEAD_PAL: CropPalette = {
  young: PALETTE.leafYoung,
  mature: PALETTE.leaf,
  dark: PALETTE.leafDark,
  light: PALETTE.grassLight,
  stem: PALETTE.stem,
  accent: PALETTE.flowerYellow,
  fruit: 0xbcd48a,   // tight pale-green heart
  unripe: 0xa9c877,
};

const DIRS8: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Lettuce/cabbage life cycle: open rosette → curling heart → firm head. */
export function makeLeafyHead(stage: number, pal: CropPalette = LEAFYHEAD_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 202);

  if (stage === 0) { sproutLoop(stat, sway, pal, 12); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.45);

  if (stage === 1) {
    // paired rounded seedling leaves
    put(stat, 0, 0.5, 0, pal.stem, 0.6);
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      put(sway, sx * 0.7, 1.1, sz * 0.7, f, 0.72);
      put(sway, sx * 1.25, 0.95, sz * 1.25, edge, 0.55);
    }
    return finishPlant(stat, sway);
  }

  if (stage === 2) {
    // open rosette: 8 spoon leaves flat on the ground + bright center bud
    DIRS8.forEach(([dx, dz], i) => {
      blade(sway, 0, 0.6, 0, dx, dz, 2 + (i % 2), i % 2 ? 3 : 2, 0.18, 0.02, f, vein, edge, 30 + i * 3);
    });
    put(sway, 0, 1.15, 0, shade(f, pal.light, 0.5), 0.75); // tiny heart
    return finishPlant(stat, sway);
  }

  if (stage === 3) {
    // cupping: outer leaves flat, inner leaves rise, pale bud appears
    DIRS8.forEach(([dx, dz], i) => {
      const inner = i >= 4;
      blade(sway, inner ? 0 : Math.sign(dx) * 0, 0.6, inner ? 0 : Math.sign(dz) * 0, dx, dz, inner ? 2 : 3, 3, inner ? 0.62 : 0.16, 0.03, f, vein, edge, 40 + i * 5);
    });
    vline(sway, 0, 0.6, 0, 0, 1.4, 0, vein);
    blob(sway, 0, 2.1, 0, 1.1, 0.95, 1.1, pal.unripe, shade(pal.unripe, pal.light, 0.35), { seed: 7 });
    return finishPlant(stat, sway);
  }

  // s4/s5 — firm head: stepped dome wrapped in outer leaves (never a box)
  const headR = stage === 4 ? 1.6 : 1.9;
  const headC = stage === 4 ? pal.unripe : pal.fruit;
  DIRS8.forEach(([dx, dz], i) => {
    if (i < 4) blade(sway, 0, 0.6, 0, dx, dz, 3, 3, 0.5, 0.04, shade(f, pal.dark, 0.18), vein, edge, 50 + i * 5);
    else blade(sway, 0, 0.9, 0, dx, dz, 2, 2, 0.5, 0.05, f, vein, edge, 56 + i * 3);
  });
  vline(sway, 0, 0.6, 0, 0, 1.6, 0, vein);
  // wide base + narrower crown read as a rounded head from every angle
  blob(sway, 0, 1.9, 0, headR, 1.0, headR, headC, shade(headC, pal.light, 0.28), { seed: 11 });
  blob(sway, 0, 3.0, 0, headR * 0.62, 0.72, headR * 0.62, shade(headC, pal.light, 0.22), shade(headC, pal.light, 0.5), { seed: 12 });
  if (stage === 5) {
    // harvest signal: wrapper leaves split slightly at the base line
    put(sway, 2, 0.5, 1, edge, 0.8);
    put(sway, -2, 0.5, -1, edge, 0.8);
  }
  return finishPlant(stat, sway);
}

export const CAULIFLOWER_PAL: Partial<CropPalette> = {
  mature: PALETTE.leaf,
  fruit: PALETTE.cream,     // white curd
  unripe: 0xd9d4bc,
};

export const CABBAGE_PAL: Partial<CropPalette> = {
  young: 0x7fae4a,
  mature: 0x3f7a2e,
  dark: 0x2c5c20,
  fruit: 0x9fc46a,
};

/* ------------------------------------------------------------------ */
/* brassica (broccoli / kale)                                          */
/* ------------------------------------------------------------------ */

export const BRASSICA_PAL: CropPalette = {
  young: 0x86a94f,
  mature: 0x4a7c46,   // waxy blue-green
  dark: 0x33582f,
  light: 0x7ba36a,
  stem: 0x5f8a52,
  accent: PALETTE.flowerYellow,
  fruit: 0x86bd6a,    // floret green — clearly paler than wrapper leaves
  unripe: 0x9cc878,
};

/** Broccoli/kale: raised rosette, waxy leaves, bumpy floret dome late. */
export function makeBrassica(stage: number, pal: CropPalette = BRASSICA_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 303);

  if (stage === 0) { sproutLoop(stat, sway, pal, 13); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.42);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    put(stat, 0, 0.5, 0, pal.stem, 0.6);
    put(sway, 0.8, 1.2, 0, f, 0.75);
    put(sway, -0.8, 1.0, 0.3, edge, 0.65);
    put(sway, 0, 1.5, -0.8, f, 0.6);
    return finishPlant(stat, sway);
  }

  if (stage === 2) {
    // raised open rosette — cupped leaves on a stubby stem
    vline(stat, 0, 0, 0, 0, 1, 0, pal.stem);
    [[1, 0, 4], [-1, 0, 4], [0, 1, 3], [0, -1, 3], [1, 1, 2], [-1, -1, 2]].forEach(([dx, dz, len], i) => {
      blade(sway, 0, 1, 0, dx, dz, len, 3, 0.22, 0.03, f, vein, edge, 60 + i * 4);
    });
    put(sway, 0, 1.9, 0, shade(f, pal.light, 0.5), 0.6);
    return finishPlant(stat, sway);
  }

  // s3–s5: florets tighten into a dome
  const stemH = stage === 3 ? 1 : 2;
  vline(stat, 0, 0, 0, 0, stemH, 0, pal.stem);
  const nWrap = stage === 3 ? 5 : 6;
  for (let i = 0; i < nWrap; i++) {
    const [dx, dz] = DIRS8[i % 8];
    blade(sway, 0, stemH, 0, dx, dz, stage >= 4 ? 4 : 3, 3, 0.24, 0.06, i % 2 ? f : shade(f, pal.dark, 0.2), vein, edge, 70 + i * 6);
  }
  if (stage === 3) {
    // button: low tight knot of tiny buds, pale enough to spot
    blob(sway, 0, stemH + 0.85, 0, 1.35, 0.62, 1.35, pal.unripe, shade(pal.unripe, 0xffffff, 0.25), { seed: 21 });
    put(sway, 0, stemH + 1.5, 0, shade(pal.unripe, 0xffffff, 0.4), 0.5);
  } else {
    const r = stage === 4 ? 1.7 : 2.2;
    const rnd = rng(88 + stage);
    // bumpy curd: base dome + speckled floretlets (light AND dark for texture)
    blob(sway, 0, stemH + r * 0.75, 0, r, r * 0.78, r, pal.fruit, shade(pal.fruit, pal.dark, 0.35), { seed: 33 });
    for (let i = 0; i < 12 + stage * 4; i++) {
      const a = rnd() * Math.PI * 2, rad = rnd() * r * 0.9;
      put(sway, Math.round(Math.cos(a) * rad), stemH + r * 0.75 + Math.round(rnd() * r * 0.65), Math.round(Math.sin(a) * rad),
        rnd() < 0.45 ? shade(pal.fruit, 0xffffff, 0.3) : shade(pal.fruit, pal.dark, 0.45), 0.55);
    }
    if (stage === 5) {
      // side shoots — the "cut and come again" signal
      put(sway, r + 0.8, stemH + 0.8, 1, shade(pal.fruit, pal.dark, 0.2), 0.6);
      put(sway, -(r + 0.8), stemH + 0.7, -1, shade(pal.fruit, pal.dark, 0.2), 0.55);
    }
  }
  return finishPlant(stat, sway);
}

export const KALE_PAL: Partial<CropPalette> = {
  mature: 0x2e5c33,
  dark: 0x1f421f,
  light: 0x5e8a54,
  fruit: 0x39653a,   // loose green buds instead of a tight curd
  unripe: 0x477343,
};

/* ------------------------------------------------------------------ */
/* greens-open (spinach / arugula / chard)                             */
/* ------------------------------------------------------------------ */

export const GREENS_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x2f7a35,
  dark: 0x1f5726,
  light: 0x74b356,
  stem: 0x5f9948,
  accent: 0x5f9948,  // green petioles by default; chard overrides to magenta
  fruit: 0x74b356,
  unripe: 0x8bc37a,
};

/** Open leaf cluster on visible petioles — never a closed head. */
export function makeGreensOpen(stage: number, pal: CropPalette = GREENS_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 404);

  if (stage === 0) { sproutLoop(stat, sway, pal, 14); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.42);
  const vein = shade(f, pal.light, 0.42);
  const petiole = pal.accent ?? pal.stem;

  if (stage === 1) {
    put(stat, 0, 0.5, 0, pal.stem, 0.6);
    blade(sway, 0, 1, 0, 1, 0, 2, 2, 0.3, 0.05, f, vein, edge, 41);
    blade(sway, 0, 1, 0, -1, 0, 2, 2, 0.3, 0.05, f, vein, edge, 42);
    return finishPlant(stat, sway);
  }

  const counts = [0, 0, 6, 8, 9, 10];
  const lens = [0, 0, 2, 3, 4, 5];
  const lifts = [0, 0, 0.2, 0.34, 0.5, 0.62];
  for (let i = 0; i < counts[stage]; i++) {
    const diag = i % 2 === 1;
    const [dx, dz] = DIRS8[i % 8];
    const len = Math.max(2, lens[stage] - (diag ? 1 : 0) - (i % 4 === 3 ? 1 : 0));
    const petioleH = stage >= 4 ? 1.2 : 0.8;
    // short colored petiole stub out of the crown, then the blade
    vline(sway, 0, 0.5, 0, Math.round(dx * 0.9), 0.5 + petioleH, Math.round(dz * 0.9), petiole);
    blade(
      sway, Math.round(dx * 0.9), 0.5 + petioleH, Math.round(dz * 0.9),
      dx, dz, len, 2,
      lifts[stage], 0.06,
      i % 4 === 3 ? shade(f, pal.dark, 0.25) : f, vein, edge, 50 + i * 5 + stage,
    );
  }
  // crown heart stays visible between the petioles
  put(sway, 0, 0.9, 0, shade(f, pal.light, 0.4), 0.75);
  return finishPlant(stat, sway);
}

export const CHARD_PAL: Partial<CropPalette> = {
  mature: 0x356e2e,
  dark: 0x244f1f,
  accent: 0xd84a6b,  // rainbow chard magenta ribs
};
