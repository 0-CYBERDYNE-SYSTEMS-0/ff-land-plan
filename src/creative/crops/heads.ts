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
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, blade, blob, flowerDot,
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
  // lifts a domed crown of clustered floret beads well above the leaf
  // skirt, with leaf wings riding the stalk. Smooth ground-hugging globes
  // belong to leafy-head; never trade.
  const H = stage === 4 ? 3 : 4;
  // thick tapering stalk (static — it carries the crown)
  vline(stat, 0, 0, 0, 0, H, 0, pal.stem);
  vline(stat, 1, 0, 0, 1, H - 1, 0, shade(pal.stem, pal.dark, 0.16));
  vline(stat, -1, 0, 0, -1, H - 1, 0, shade(pal.stem, pal.dark, 0.16));
  vline(stat, 0, 0, 1, 0, H - 1, 1, shade(pal.stem, pal.dark, 0.22));
  vline(stat, 0, 0, -1, 0, H - 1, -1, shade(pal.stem, pal.dark, 0.22));
  // leaf skirt arches out from the stalk base and slumps back to the soil
  for (let i = 0; i < 6; i++) {
    const [dx, dz] = DIRS8[i];
    blade(sway, 0, 0.7, 0, dx, dz, 3, 3, 0.36, 0.09, i % 2 ? f : shade(f, pal.dark, 0.2), vein, edge, 70 + i * 6);
  }
  // leaf wings ride the stalk, tips reaching well above the skirt
  const wingY = stage === 5 ? H - 1.7 : H - 1.2;
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dx, dz], i) => {
    blade(sway, 0, wingY + (i % 2) * 0.5, 0, dx, dz, stage === 5 ? 3 : 2, 2, 0.6, 0.02,
      i % 2 ? f : shade(f, pal.dark, 0.15), vein, edge, 92 + i * 7);
  });
  // beaded crown: central dome ringed by clustered floret bumps — bumps
  // stay SEPARATE (air between them at s5) so the silhouette reads lumpy
  const domeR = stage === 5 ? 1.55 : 1.35;
  const domeY = H + domeR * 0.8;
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
    // HARVEST ROSETTE — maximum spread with an unmistakable pick-me crown:
    // outer leaves arch wide and droop at the tips (harvest-ready curl), the
    // inner crown rises bright and glossy toward pal.fruit, and a bud-index
    // knob (pal.fruit dithered pal.accent — clover's red bloom, borage's
    // blue, chard's magenta) flags readiness from across the field.
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = DIRS8[i];
      const diag = dx !== 0 && dz !== 0;
      const ox = Math.round(dx * 1.1), oz = Math.round(dz * 1.1);
      // long splayed petiole, then a wide blade that curls down at the tip
      vline(sway, 0, 0.45, 0, ox, 1.05, oz, petiole);
      blade(sway, ox, 1.05, oz, dx, dz, diag ? 5 : 6, 3, 0.55, 0.09,
        i % 4 === 3 ? shade(f, pal.dark, 0.25) : f, vein, edge, 50 + i * 5);
    }
    // bright glossy crown leaves pulled toward the harvest tone
    const crownBase = shade(f, pal.fruit, 0.35);
    const crownVein = shade(pal.fruit, 0xffffff, 0.3);
    const crownEdge = shade(pal.fruit, pal.dark, 0.22);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], i) => {
      vline(sway, 0, 0.45, 0, Math.round(dx * 0.5), 1.45, Math.round(dz * 0.5), petiole);
      blade(sway, Math.round(dx * 0.5), 1.45, Math.round(dz * 0.5), dx, dz, 2, 2, 0.5, 0.02,
        crownBase, crownVein, crownEdge, 95 + i * 6);
    });
    put(sway, 0, 1.6, 0, pal.fruit, 0.8); // glossy heart
    // bud-index standard: a bud crown lifted a full voxel of air CLEAR above
    // the leaf cluster on a thin colored pedicel (reads as a flag on a pole,
    // never as another leaf head) — pal.fruit body speckled pal.accent plus
    // an accent dot ring; the unmistakable ready signal, palette-driven only
    vline(sway, 0, 1.8, 0, 0, 3.5, 0, petiole);
    blob(sway, 0, 4.15, 0, 0.85, 0.7, 0.85, pal.fruit, pal.accent, { seed: 61 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      flowerDot(sway, Math.cos(a) * 1.0, 4.95, Math.sin(a) * 1.0, pal.accent, 0.65);
    }
    put(sway, 0, 5.1, 0, shade(pal.fruit, 0xffffff, 0.35), 0.55);
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
