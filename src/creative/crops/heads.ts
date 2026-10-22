/**
 * Archetypes: leafy-head (lettuce/cabbage/cauliflower), brassica (broccoli/kale),
 * greens-open (spinach/arugula/chard). Rosette builders sharing one leaf language:
 * spoon-shaped blade leaves radiating from a crown; heads/curds swell late.
 *
 * Maturity silhouette law (critic contract): leafy-head = SMOOTH + GROUND-
 * HUGGING (flat wrapper collar, round wrapped globe — a cabbage cannonball);
 * brassica = TALL + LUMPY (thick stalk lifting a beaded floret crown on leaf
 * wings). The two must be nameable from silhouette alone, palette or no.
 */
import { PALETTE, Voxel, mixColor, rng } from '@/creative/voxel';
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

  // s4/s5 — firm head. Silhouette language: SMOOTH + GROUND-HUGGING. The
  // wrapper collar presses flat against the soil while the head firms from a
  // squat stepped drum (s4) into one round globe (s5) — a cabbage
  // cannonball. Lumpy beaded crowns belong to brassica; never trade.
  const firmed = stage === 5;
  DIRS8.forEach(([dx, dz], i) => {
    // wrapper collar: still cupping at s4, pressed flat under the finished head
    blade(sway, 0, 0.6, 0, dx, dz, 3, 3, firmed ? 0.07 : 0.38, firmed ? 0.02 : 0.05,
      i % 2 ? shade(f, pal.dark, 0.3) : shade(f, pal.dark, 0.16), vein, edge, 50 + i * 5);
  });
  if (!firmed) {
    // s4 drum: squat stepped barrel, crown still folded into a dimple
    blob(sway, 0, 1.55, 0, 1.85, 1.05, 1.85, pal.unripe, shade(pal.unripe, pal.light, 0.16), { seed: 11 });
    blob(sway, 0, 2.5, 0, 1.4, 0.75, 1.4, shade(pal.unripe, pal.light, 0.2), shade(pal.unripe, pal.light, 0.36), { seed: 12 });
    put(sway, 0, 3.3, 0, shade(pal.unripe, pal.dark, 0.28), 0.9); // fold dimple
    return finishPlant(stat, sway);
  }
  // s5 cannonball: stacked wrap layers firmed into one round mass — widest
  // at the equator, lightening toward the domed crown. Latitude layer seams
  // read WRAPPED (cabbage folds) while the silhouette stays smooth; lumpy
  // bumps belong to brassica.
  blob(sway, 0, 1.05, 0, 1.9, 0.95, 1.9, pal.fruit, shade(pal.fruit, 0xffffff, 0.08), { seed: 11 });
  blob(sway, 0, 1.95, 0, 2.0, 0.95, 2.0, shade(pal.fruit, 0xffffff, 0.1), shade(pal.fruit, 0xffffff, 0.2), { seed: 12 });
  blob(sway, 0, 2.85, 0, 1.55, 0.9, 1.55, shade(pal.fruit, 0xffffff, 0.22), shade(pal.fruit, 0xffffff, 0.36), { seed: 13 });
  // wrapper corners peel off the collar — harvest-ready split at the base line
  DIRS8.slice(4).forEach(([dx, dz]) => {
    put(sway, dx * 2.4, 0.85, dz * 2.4, edge, 0.7);
  });
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
  fruit: mixColor(PALETTE.leafDark, PALETTE.water, 0.4), // dark blue-green floret head
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

  if (stage === 3) {
    // button stage: low leafy rosette on a stubby stem, tight pale knot on top
    vline(stat, 0, 0, 0, 0, 1, 0, pal.stem);
    [[1, 0, 4], [-1, 0, 4], [0, 1, 3], [0, -1, 3], [1, 1, 2], [-1, -1, 2]].forEach(([dx, dz, len], i) => {
      blade(sway, 0, 1, 0, dx, dz, len, 3, 0.24, 0.06, f, vein, edge, 60 + i * 4);
    });
    // button: low tight knot of tiny buds, pale enough to spot
    blob(sway, 0, 1.85, 0, 1.35, 0.62, 1.35, pal.unripe, shade(pal.unripe, 0xffffff, 0.25), { seed: 21 });
    put(sway, 0, 2.5, 0, shade(pal.unripe, 0xffffff, 0.4), 0.5);
    return finishPlant(stat, sway);
  }

  // s4/s5 — broccoli. Silhouette language: TALL + LUMPY. A thick stalk
  // lifts a dark blue-green floret crown clear above a narrow leaf skirt,
  // with leaves arching out from under the crown. Smooth ground-hugging
  // globes belong to leafy-head; never trade.
  const H = stage === 4 ? 4 : 5;
  // thick tapering stalk (static — it carries the crown)
  vline(stat, 0, 0, 0, 0, H, 0, pal.stem);
  vline(stat, 1, 0, 0, 1, H - 1, 0, shade(pal.stem, pal.dark, 0.16));
  vline(stat, -1, 0, 0, -1, H - 1, 0, shade(pal.stem, pal.dark, 0.16));
  vline(stat, 0, 0, 1, 0, H - 1, 1, shade(pal.stem, pal.dark, 0.22));
  vline(stat, 0, 0, -1, 0, H - 1, -1, shade(pal.stem, pal.dark, 0.22));
  // low leaf skirt: narrow blades lifting off the soil, then slumping back
  DIRS8.slice(0, 4).forEach(([dx, dz], i) => {
    blade(sway, 0, 0.7, 0, dx, dz, 3, 2, 0.3, 0.06, i % 2 ? f : shade(f, pal.dark, 0.2), vein, edge, 70 + i * 6);
  });
  // mid wings arch outward from under the crown, tips falling back toward it
  DIRS8.slice(0, 4).forEach(([dx, dz], i) => {
    blade(sway, 0, H - 2, 0, dx, dz, 3, 2, 0.8, 0.16, i % 2 ? shade(f, pal.dark, 0.15) : f, vein, edge, 92 + i * 7);
  });
  // floret crown: dark blue-green dome lifted on the stalk, ringed by
  // separate floret beads (air between them) so the top reads lumpy
  const domeR = stage === 5 ? 1.9 : 1.5;
  const domeY = H + 1.9;
  blob(sway, 0, domeY, 0, domeR, domeR * 0.75, domeR, pal.fruit, shade(pal.fruit, pal.dark, 0.26), { seed: 33 });
  const nBeads = stage === 5 ? 7 : 6;
  const beadRing = stage === 5 ? domeR + 0.45 : domeR - 0.1;
  for (let i = 0; i < nBeads; i++) {
    const a = (i / nBeads) * Math.PI * 2 + 0.45;
    const bx = Math.round(Math.cos(a) * beadRing);
    const bz = Math.round(Math.sin(a) * beadRing);
    const br = stage === 5 ? 0.8 : 0.62;
    blob(sway, bx, domeY - (stage === 5 ? 0.35 : 0.1), bz, br, br * 0.8, br,
      shade(pal.fruit, pal.dark, 0.12), shade(pal.fruit, pal.dark, 0.38), { seed: 40 + i });
  }
  // bead caps ON the dome skin — bright tips make individual bumps read;
  // each dot is placed on the ellipsoid surface (+0.25 proud), never floating
  const rnd = rng(88 + stage);
  for (let i = 0; i < 10 + stage * 2; i++) {
    const a = rnd() * Math.PI * 2;
    const fr = rnd() * 0.95;
    const yy = domeY + domeR * 0.75 * Math.sqrt(Math.max(0.04, 1 - fr * fr)) + 0.25;
    put(sway, Math.round(Math.cos(a) * fr * domeR), yy, Math.round(Math.sin(a) * fr * domeR),
      rnd() < 0.4 ? shade(pal.fruit, 0xffffff, 0.32) : shade(pal.fruit, pal.dark, 0.45), 0.5);
  }
  if (stage === 5) {
    // side shoots hugging the stalk on stubby stalklets — the
    // "cut and come again" signal (beads overlap their stalklets: attached)
    vline(sway, 1, H - 0.9, 0.5, 1.7, H - 0.2, 0.8, pal.stem);
    blob(sway, 2.0, H + 0.25, 0.9, 0.55, 0.45, 0.55, shade(pal.fruit, pal.dark, 0.1), shade(pal.fruit, pal.dark, 0.35), { seed: 51 });
    vline(sway, -1, H - 1.1, -0.4, -1.7, H - 0.4, -0.7, shade(pal.stem, pal.dark, 0.2));
    blob(sway, -2.0, H - 0.15, -0.8, 0.5, 0.42, 0.5, shade(pal.fruit, pal.dark, 0.15), shade(pal.fruit, pal.dark, 0.4), { seed: 52 });
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

  if (stage === 5) {
    // HARVEST FOUNTAIN — no head at all. Six colored petioles fan out of the
    // crown at different heights and reaches; each blade arches up, then
    // droops at the tip, so the rosette stays open and airy (never a ball).
    // [dx, dz, reach, petioleTop, len, arcA, arcB]
    const fan: Array<[number, number, number, number, number, number, number]> = [
      [1, 0, 1, 1.8, 6, 1.0, 0.1],
      [-1, 0, 1, 1.2, 6, 0.6, 0.08],
      [0, 1, 1, 2.8, 5, 0.8, 0.12],
      [0, -1, 1, 1.5, 6, 0.7, 0.1],
      [-1, 0, 2, 3.4, 4, 0.7, 0.14],
      [0, -1, 0, 3.6, 4, 0.6, 0.12],
    ];
    fan.forEach(([dx, dz, reach, h, len, arcA, arcB], i) => {
      const ox = dx * reach, oz = dz * reach;
      vline(sway, 0, 0.45, 0, ox, h, oz, petiole);
      blade(sway, ox, h, oz, dx, dz, len, 2, arcA, arcB,
        i % 3 === 2 ? shade(f, pal.dark, 0.25) : f, vein, edge, 50 + i * 5);
    });
    put(sway, 0, 0.9, 0, shade(f, pal.light, 0.4), 0.75); // crown heart
    return finishPlant(stat, sway);
  }

  const counts = [0, 0, 6, 8, 9];
  const lens = [0, 0, 2, 3, 4];
  const lifts = [0, 0, 0.2, 0.34, 0.5];
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
