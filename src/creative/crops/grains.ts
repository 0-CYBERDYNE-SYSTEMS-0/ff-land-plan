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

/** Sweet corn: stalk, alternating arching blades, tassel, husked ear with silk. */
export function makeCorn(stage: number, pal: CropPalette = CORN_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 606);

  if (stage === 0) { sproutLoop(stat, sway, pal, 16, false); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const bladeBase = shade(f, pal.light, 0.18);
  const bladeEdge = shade(f, pal.dark, 0.38);

  if (stage === 1) {
    blade(sway, 0, 0, 0, 1, 0, 2, 2, 0.55, 0.1, bladeBase, pal.light, bladeEdge, 61);
    blade(sway, 0, 0, 0, 0, -1, 2, 2, 0.55, 0.1, bladeBase, pal.light, bladeEdge, 62);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 5, 9, 12, 13][stage];

  // stalk: sturdy column with darker node bands + brace roots at the base
  for (let y = 0; y <= H; y++) {
    put(stat, 0, y, 0, y % 3 === 0 ? shade(pal.stem, pal.dark, 0.3) : pal.stem);
  }
  put(stat, 0.8, 0, 0.3, shade(pal.stem, pal.dark, 0.25), 0.6);
  put(stat, -0.5, 0, -0.7, shade(pal.stem, pal.dark, 0.25), 0.6);

  // arching blades alternating around the stalk, lower ones longest —
  // blades launch at the stalk and arc up-and-over so the plant never
  // reads as a conifer
  const nBlades = [0, 0, 5, 6, 7, 8][stage];
  const dirs: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let i = 0; i < nBlades; i++) {
    const [dx, dz] = dirs[i % dirs.length];
    const by = 1 + Math.floor((i / Math.max(1, nBlades)) * (H - 3));
    const len = Math.max(4, (stage >= 4 ? 8 : 6) - Math.floor(i / 3));
    blade(sway, 0, by, 0, dx, dz, len, stage >= 4 ? 3 : 2, 1.05, 0.135, bladeBase, pal.light, bladeEdge, 80 + i * 11);
  }

  // tassel from the crown — airy 1-wide gold spikes, never a chunk
  if (stage >= 3) {
    const tasselC = stage === 3 ? shade(pal.accent, pal.stem, 0.45) : pal.accent;
    vline(sway, 0, H, 0, 0, H + 2, 0, tasselC); // central spike
    const rays: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    rays.forEach(([dx, dz], i) => {
      const L = stage >= 4 ? 2 + (i % 2) : 1;
      vline(sway, 0, H + 1, 0, dx * L, H + 1 + L, dz * L, i % 2 ? tasselC : shade(tasselC, pal.fruit, 0.35));
      flowerDot(sway, dx * (L + 0.3), H + 1 + L + 0.5, dz * (L + 0.3), shade(tasselC, pal.fruit, 0.5), 0.3);
    });
  }

  // ear: husked cob angling up on the open diagonal between blade whorls,
  // silk tuft at the tip (the diagonal keeps it clear of the 4 blade axes)
  if (stage >= 4) {
    const ey = Math.round(H * 0.42);
    const ripe = stage === 5;
    const earLen = stage === 5 ? 4 : 3;
    // ripe husk dries toward straw so the cob reads against green blades
    const huskC = ripe ? shade(f, PALETTE.straw, 0.45) : shade(f, pal.dark, 0.05);
    put(sway, 0.6, ey, 0.6, shade(pal.stem, pal.dark, 0.2), 0.7); // shank to the stalk
    for (let k = 0; k < earLen; k++) {
      const ex = 1.1 + k * 0.55;
      const eyy = ey + Math.round(k * 0.7);
      put(sway, ex, eyy, ex, k === earLen - 1 ? shade(huskC, pal.light, 0.35) : huskC, 1);
      // flanking wrapper leaves give the cob real girth
      if (k >= 1) {
        put(sway, ex + 0.6, eyy, ex - 0.6, shade(huskC, pal.dark, 0.3), 0.62);
        put(sway, ex - 0.6, eyy, ex + 0.6, shade(huskC, pal.light, 0.18), 0.55);
      }
    }
    // silk streaming from the tip (pale fresh → browned ripe)
    const silkC = ripe ? PALETTE.hay : shade(SILK_PALE, pal.light, 0.4);
    for (let s = 0; s < 4; s++)
      flowerDot(sway, 1.1 + earLen * 0.55 + 0.3 + s * 0.3, ey + earLen * 0.7 - 0.2 + (s % 2) * 0.5, 1.1 + earLen * 0.55 + 0.2 + (s % 2) * 0.3, silkC, 0.36);
    // flag leaf above the ear + kernel glimpse where the husk opens (s5)
    blade(sway, 1, ey + Math.round(earLen * 0.7) + 1, 1, 1, 0, 3, 2, 0.7, 0.09, bladeBase, pal.light, bladeEdge, 99);
    if (ripe) {
      const tx = 1.1 + (earLen - 1) * 0.55 + 0.4;
      flowerDot(sway, tx, ey + Math.round((earLen - 1) * 0.7) + 0.3, tx, pal.fruit, 0.62);
      flowerDot(sway, tx, ey + Math.round((earLen - 1) * 0.7) - 0.4, tx, shade(pal.fruit, PALETTE.hay, 0.35), 0.5);
    }
  }
  return finishPlant(stat, sway);
}
