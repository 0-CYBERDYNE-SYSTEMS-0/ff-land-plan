/**
 * Archetypes: wheat (tillers → golden awned heads) and corn
 * (broad arching blades + tassel + husked ear with silk).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, blade, flowerDot,
} from './shared';

/* ------------------------------------------------------------------ */
/* wheat                                                               */
/* ------------------------------------------------------------------ */

export const WHEAT_PAL: CropPalette = {
  young: 0x8fc45a,
  mature: PALETTE.wheatGreen,
  dark: 0x6f9440,
  light: 0xb2cc66,
  stem: PALETTE.wheatGreen,
  accent: PALETTE.straw,
  fruit: PALETTE.wheat,
  unripe: 0xaebd62,
};

const RING: Array<[number, number]> = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [1, -2], [-2, 1]];

/** Wheat life cycle: grass blades → separated tillers → golden awned heads. */
export function makeWheat(stage: number, pal: CropPalette = WHEAT_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.8, 505);

  if (stage === 0) { sproutLoop(stat, sway, pal, 15, false); return finishPlant(stat, sway); }

  const rnd = rng(600 + stage * 17);
  const f = foliage(pal, Math.min(stage, 3));
  const bladeC = shade(f, pal.light, 0.25);
  const edgeC = shade(f, pal.dark, 0.35);

  if (stage === 1) {
    // grassy seedling: thin arcing blades of varied length — never a flat cross
    const dirs6: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = dirs6[i];
      blade(sway, 0, 0, 0, dx, dz, 2 + (i % 3), 1, 0.85, 0.05, bladeC, pal.light, edgeC, 65 + i * 3);
    }
    return finishPlant(stat, sway);
  }

  const nTillers = [0, 0, 7, 8, 9, 9][stage];
  const stemH = [0, 0, 4, 7, 9, 10][stage];
  const stemC = stage >= 5 ? shade(pal.stem, pal.fruit, 0.55) : pal.stem;

  for (let i = 0; i < nTillers; i++) {
    const [ox, oz] = RING[i % RING.length];
    const lean = ox === 0 && oz === 0 ? 0 : (rnd() < 0.5 ? 1 : -1);
    const h = Math.max(2, stemH - (i % 3 === 2 && stage < 4 ? 1 : 0));
    const topX = ox + (h > 4 ? lean : 0);

    // thin tiller stem, leaning out at the top
    vline(sway, ox, 0, oz, topX, h, oz, i % 2 ? stemC : shade(stemC, pal.dark, 0.15));

    if (stage <= 2) {
      // young tiller: grassy blades at the tip and mid-stem
      blade(sway, topX, Math.max(1, h - 2), oz, i % 2 ? 1 : -1, 0, 3, 1, 0.8, 0.06, bladeC, pal.light, edgeC, 70 + i * 3);
      blade(sway, ox, Math.max(0, h - 3), oz, i % 2 ? -1 : 1, 0, 2, 1, 0.75, 0.07, shade(bladeC, pal.dark, 0.12), pal.light, edgeC, 75 + i * 5);
      continue;
    }

    // headed stages: distinct tight zigzag spike + fine awns
    const headC = stage === 3 ? pal.unripe : stage === 4 ? shade(pal.unripe, pal.fruit, 0.6) : pal.fruit;
    const headLen = stage === 3 ? 3 : 4;
    for (let k = 0; k < headLen; k++) {
      put(sway, topX, h + 1 + k, oz + (k % 2 ? 0.5 : -0.5), headC, 0.85);
      put(sway, topX, h + 1 + k, oz + (k % 2 ? -0.35 : 0.35), shade(headC, pal.light, 0.25), 0.6);
      // awns — hair-fine spikes rising straight off each grain (anchored, no float)
      flowerDot(sway, topX + 0.35, h + 1.5 + k * 0.95, oz + (k % 2 ? 0.8 : -0.2), stage >= 4 ? pal.accent : shade(headC, pal.light, 0.3), 0.28);
    }
    if (stage >= 4) {
      // one fine awn bristle rising from the spike tip (anchored)
      put(sway, topX + 0.3, h + headLen + 0.5, oz + 0.5, pal.accent, 0.26);
    }
    // nodding heads at harvest
    if (stage === 5) {
      put(sway, topX + lean, h + headLen, oz + 1, headC, 0.85);
      put(sway, topX + lean * 2, h + headLen - 1, oz + 1.4, shade(headC, pal.light, 0.3), 0.8);
    }
  }
  return finishPlant(stat, sway);
}

/* ------------------------------------------------------------------ */
/* corn                                                                */
/* ------------------------------------------------------------------ */

export const CORN_PAL: CropPalette = {
  young: 0x93c95c,
  mature: 0x5f9440,
  dark: 0x47742e,
  light: 0xa8cd6a,
  stem: 0x6f9c48,
  accent: 0xd9c05a,   // tassel gold-green
  fruit: PALETTE.cornGold,
  unripe: 0xb8bd68,
};

const SILK_PALE = 0xe8e0be;
const SILK_RED = 0xc0794f;

/** Sweet corn — 10-keyframe phenology axis (SPEC-GROWTH-VISUAL §2.4/§2.5):
 *  s0 flag-leaf sprout · s1 seedling blades · s2 knee-high whorl ·
 *  s3 tall vegetative, blades arching out · s4 boot (tassel just piercing
 *  the whorl point) · s5 tassel fully out w/ anthers + first pale silks on
 *  an ear bump · s6 blister (fresh red silks, ear filling) · s7 milk (heavy
 *  ear, blades beginning to droop) · s8 dough (ear dragging the crown, lower
 *  blades yellowing) · s9 harvest-ready (dry pale tassel, brown silks,
 *  arched blades, husk tip peeled open on shiny gold kernels). */
export function makeCorn(stage: number, pal: CropPalette = CORN_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 606);

  const S = Math.min(9, Math.max(0, Math.round(stage)));
  // foliage() saturates past 5 of its 0..5 contract — normalize the 10-keyframe
  // axis onto it so the green keeps deepening through s9 instead of cloning
  // mid-story.
  const f = foliage(pal, (S * 5) / 9);
  const bladeBase = shade(f, pal.light, 0.18);
  const bladeEdge = shade(f, pal.dark, 0.38);

  if (S === 0) {
    // sprout: coleoptile loop + the first flag leaf unrolling skyward
    sproutLoop(stat, sway, pal, 16, false);
    blade(sway, 0, 0.5, 0, 1, 0, 2, 1, 1.0, 0.05, shade(f, pal.light, 0.25), pal.light, shade(f, pal.dark, 0.3), 59);
    return finishPlant(stat, sway);
  }

  if (S === 1) {
    // seedling: two true blades crossed + a third just unrolling
    blade(sway, 0, 0, 0, 1, 0, 2, 2, 0.7, 0.08, bladeBase, pal.light, bladeEdge, 61);
    blade(sway, 0, 0, 0, 0, -1, 2, 2, 0.7, 0.08, bladeBase, pal.light, bladeEdge, 62);
    blade(sway, 0, 0, 0, 0, 1, 1, 1, 0.95, 0.05, shade(bladeBase, pal.light, 0.15), pal.light, bladeEdge, 63);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 4, 7, 9, 11, 12, 13, 13, 13][S];
  const nBlades = [0, 0, 4, 5, 6, 7, 7, 8, 8, 8][S];
  const lenMax = [0, 0, 3, 5, 6, 6, 7, 7, 8, 8][S];
  // blade arch: launch steepness + how far the tip hangs below its node
  // (negative = whorl blades still reaching up; grows as the ear loads)
  const archA = [0, 0, 1.15, 1.1, 1.0, 1.0, 0.95, 0.9, 0.85, 0.8][S];
  const hang = [0, 0, -2.0, -0.8, 0.2, 0.6, 1.2, 1.8, 2.5, 3.4][S];
  // dry-down: lower blades yellow toward straw first (s8 hint, s9 loud)
  const dry = S === 8 ? 0.38 : S === 9 ? 0.55 : 0;

  // stalk: sturdy column with darker node bands + brace roots at the base;
  // dry-down tans it from s8
  const stemC = S >= 8 ? shade(pal.stem, PALETTE.straw, S === 9 ? 0.3 : 0.18) : pal.stem;
  for (let y = 0; y <= H; y++) {
    put(stat, 0, y, 0, y % 3 === 0 ? shade(stemC, pal.dark, 0.3) : stemC);
  }
  put(stat, 0.8, 0, 0.3, shade(stemC, pal.dark, 0.25), 0.6);
  put(stat, -0.5, 0, -0.7, shade(stemC, pal.dark, 0.25), 0.6);

  // arching blades alternating around the stalk — plan view reads as a blade
  // cross. Whorl stages keep the tips up; from s6 the filling ear drags them
  // down (upper blades hang hardest, lowest never touch the soil).
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < nBlades; i++) {
    const [dx, dz] = dirs[i % dirs.length];
    const by = 1 + Math.floor((i / Math.max(1, nBlades)) * (H - 3));
    const len = Math.max(3, lenMax - Math.floor(i / 3));
    const hangI = hang < 0 ? hang : Math.min(hang * (0.35 + 0.65 * (by / H)), by - 0.6);
    const arcB = (archA * len + hangI) / (len * len);
    const dryI = dry * (1 - by / (H + 1)); // lowest blades dry hardest
    const bc = dryI > 0.06 ? shade(bladeBase, PALETTE.straw, dryI) : bladeBase;
    blade(sway, 0, by, 0, dx, dz, len, S >= 4 ? 3 : 2, archA, arcB, bc, pal.light,
      dryI > 0.06 ? shade(bladeEdge, PALETTE.straw, dryI * 0.5) : bladeEdge, 80 + i * 11);
  }

  // tassel. s4 = boot: a tight gold-green nub just piercing the whorl point
  // (never the full fan). s5+ fans into airy 1-wide spikes w/ anther pips,
  // then dries pale and flares flat by s8/s9; the loaded ear leans the crown
  // toward itself from s8.
  if (S === 4) {
    const tasselC = shade(pal.accent, pal.stem, 0.5);
    vline(sway, 0, H, 0, 0, H + 1, 0, tasselC);
    flowerDot(sway, 0.45, H + 0.55, 0.2, shade(tasselC, pal.light, 0.3), 0.4);
    flowerDot(sway, -0.4, H + 0.4, -0.3, tasselC, 0.34);
  } else if (S >= 5) {
    const tasselC = S >= 9 ? shade(pal.accent, PALETTE.straw, 0.55)
      : S >= 8 ? shade(pal.accent, PALETTE.straw, 0.3)
      : S >= 6 ? shade(pal.accent, pal.fruit, 0.18)
      : pal.accent;
    const lean = S >= 8 ? 0.35 : 0; // ear weight bends the crown
    vline(sway, 0, H, 0, lean, H + 2, lean, tasselC); // central rachis
    // 8-ray fan (4 cardinal + 4 diagonal) — branches TAPER to sub-voxel
    // anther pips so the tassel stays airy, never a chunk; dry tassels
    // flare flat, fresh ones rise
    const rays: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    rays.forEach(([dx, dz], i) => {
      const diag = dx !== 0 && dz !== 0;
      const L = diag ? 1.4 : 2 + (i % 2);
      const rise = S >= 8 ? 0.22 : 0.85;
      const rc = i % 2 ? tasselC : shade(tasselC, pal.fruit, 0.3);
      // sparse sub-voxel pips chained along each ray — airy, never a chunk
      put(sway, lean + dx * L * 0.55, H + 1 + rise * L * 0.45, lean + dz * L * 0.55, rc, 0.6);
      put(sway, lean + dx * L * 0.95, H + 1 + rise * L * 0.8, lean + dz * L * 0.95, rc, 0.45);
      flowerDot(sway, lean + dx * (L + 0.25), H + 1 + rise * L + 0.3, lean + dz * (L + 0.25), shade(tasselC, pal.fruit, 0.5), S >= 8 ? 0.26 : 0.34);
    });
  }

  // ear: shanked on the open diagonal between blade whorls (keeps it clear of
  // the 4 blade axes). Bump at s5, filling s6, heavy and tilting down s7+;
  // at s9 the husk tip peels OPEN on shiny gold kernels — the pick-me signal.
  if (S >= 5) {
    const ey = Math.round(H * 0.42);
    const earLen = [0, 0, 0, 0, 0, 3, 3, 4, 4, 5][S];
    const tilt = [0, 0, 0, 0, 0, 0.6, 0.5, 0.35, 0.15, 0.05][S]; // up young → dragged down heavy
    const ripe = S === 9;
    // husk dries toward straw from s8 so the cob reads against the blades
    const huskC = S >= 8 ? shade(f, PALETTE.straw, ripe ? 0.45 : 0.3) : shade(f, pal.dark, 0.05);
    put(sway, 0.6, ey - 0.2, 0.6, shade(stemC, pal.dark, 0.2), 0.75); // shank to the stalk
    const spacing = 0.62; // pushes the cob clear of the blade column
    for (let k = 0; k < earLen; k++) {
      const ex = 1.15 + k * spacing;
      const eyy = ey + k * tilt;
      const tip = k === earLen - 1;
      // s9: the husk tip is peeled back — bare cob w/ a gold kernel patch
      const c = tip && ripe ? pal.fruit : tip ? shade(huskC, pal.light, 0.35) : huskC;
      put(sway, ex, eyy, ex, c, 1);
      // flanking wrapper leaves + a top ridge give the cob real girth
      if (k >= 1) {
        put(sway, ex + 0.65, eyy, ex - 0.65, shade(huskC, pal.dark, 0.3), 0.7);
        put(sway, ex - 0.65, eyy, ex + 0.65, shade(huskC, pal.light, 0.18), 0.6);
        if (k <= earLen - 2) put(sway, ex, eyy + 0.7, ex - 0.3, shade(huskC, pal.light, 0.25), 0.55);
      }
    }
    const tipX = 1.15 + (earLen - 1) * spacing;
    const tipY = ey + (earLen - 1) * tilt;
    // silk at the tip: pale first strands (s5) → fresh red (s6) → browning
    // (s7/s8) → dry brown tuft (s9)
    const silkC = S === 5 ? shade(SILK_PALE, pal.light, 0.4)
      : S === 6 ? SILK_RED
      : S === 7 ? shade(SILK_RED, PALETTE.hay, 0.45)
      : S === 8 ? PALETTE.hay
      : shade(PALETTE.hay, PALETTE.soilDark, 0.25);
    const nSilk = [0, 0, 0, 0, 0, 3, 5, 5, 4, 3][S];
    for (let s = 0; s < nSilk; s++)
      flowerDot(sway, tipX + 0.3 + s * 0.28, tipY + 0.2 + (s % 2) * 0.45, tipX + 0.15 + (s % 2) * 0.35, silkC, 0.36);
    // flag leaf above the ear, arcing over (yellows with dry-down)
    blade(sway, 1, Math.round(tipY) + 1, 1, 1, 0, 3, 2, 0.7, S >= 7 ? 0.13 : 0.09,
      dry > 0 ? shade(bladeBase, PALETTE.straw, dry * 0.4) : bladeBase, pal.light, bladeEdge, 99);
    if (ripe) {
      // peeled husk wings flaring back + shiny kernel pips on the bare tip
      put(sway, tipX - 0.6, tipY + 0.85, tipX + 0.4, shade(huskC, PALETTE.straw, 0.3), 0.6);
      put(sway, tipX + 0.45, tipY + 0.7, tipX - 0.35, shade(huskC, PALETTE.straw, 0.2), 0.55);
      flowerDot(sway, tipX + 0.1, tipY + 0.6, tipX + 0.1, shade(pal.fruit, PALETTE.cream, 0.35), 0.5);
      flowerDot(sway, tipX + 0.5, tipY + 0.35, tipX + 0.35, pal.fruit, 0.55);
      flowerDot(sway, tipX - 0.2, tipY + 0.8, tipX + 0.4, shade(pal.fruit, PALETTE.flowerYellow, 0.3), 0.45);
    }
  }
  return finishPlant(stat, sway);
}
