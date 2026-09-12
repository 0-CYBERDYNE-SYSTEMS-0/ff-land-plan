/**
 * Lifecycle state builders for the `mushroom` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: dried grey-brown shrivelled caps on withered stem stubs — edges
 *    upturned in split curled rims, one collapsed husk. Default 0.55 factor
 *    lands the block at the healthy footprint.
 *  - harvested: flush sliced off — substrate block with even pale cut stem
 *    stumps and one or two tiny pins left. heightFactor 0.46 keeps the block
 *    believable (the substrate IS the crop body; caps are just gone).
 *  - overripe: mature-dark flattened caps with wavy split rims shedding
 *    spore stain onto the casing, one cap fully upturned into a gill cup.
 */
import { PALETTE, Voxel, rng, mixColor } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, blob, finishPlant,
} from '../shared';
import type { ArchetypeStates } from '../shared';

/** Substrate block shared with the stage builder — casing tones vary per state. */
function substrateBlock(stat: Voxel[], seed: number, caseA: number, caseB: number): void {
  const rand = rng(seed);
  const subA = mixColor(PALETTE.straw, PALETTE.mulch, 0.35);
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++)
      for (let y = 0; y <= 1; y++) {
        const rim = Math.max(Math.abs(x), Math.abs(z)) === 3;
        stat.push({
          x, y, z,
          color: rim ? mixColor(PALETTE.mulch, PALETTE.soilDark, 0.25) : rand() < 0.5 ? subA : PALETTE.mulch,
        });
      }
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++)
      stat.push({ x, y: 2, z, color: rand() < 0.5 ? caseA : caseB });
}

export const mushroomStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    // dried-out casing — no pale mycelium left
    substrateBlock(stat, 901, mixColor(PALETTE.straw, PALETTE.mulch, 0.6), PALETTE.mulch);

    const deadT = pal.dead ?? STATE_TONES.dead;
    const capDry = shade(pal.fruit, deadT, 0.55);           // keeps a cultivar hint
    const capDryLo = shade(capDry, PALETTE.shadow, 0.24);
    const edgeCurl = shade(capDry, PALETTE.straw, 0.38);    // curled dry rim
    const stemDry = shade(pal.stem, deadT, 0.42);

    // three shrivelled curling caps + one collapsed husk (no stem)
    const caps: Array<[number, number, number, number]> = [
      [-1.6, 0.3, 1.1, 0], [1.7, 0.8, 1.0, 0], [0.6, -1.6, 0.9, 0], [2.2, 2.0, 0.6, 1],
    ];
    caps.forEach(([cx, cz, r, husk], i) => {
      if (!husk) {
        put(sway, cx, 2.6, cz, stemDry, 0.5);
        put(sway, cx, 3.2, cz, stemDry, 0.45);
      }
      const cy = husk ? 2.9 : 3.75;
      blob(sway, cx, cy, cz, r, 0.5, r, capDry, capDryLo, { seed: 71 + i });
      // upturned split edge — lifted rim dots with gaps between
      for (let k = 0; k < 6; k++) {
        if ((k + i) % 3 === 0) continue;
        const a = (k / 6) * Math.PI * 2 + i * 0.7;
        put(sway, cx + Math.cos(a) * (r + 0.15), cy + 0.6, cz + Math.sin(a) * (r + 0.15), edgeCurl, 0.52);
      }
    });
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    substrateBlock(stat, 902, mixColor(pal.young, PALETTE.straw, 0.3), mixColor(pal.young, PALETTE.mulch, 0.35));

    const slice = shade(pal.stem, 0xffffff, 0.35);          // pale sliced face

    // cut stumps where the flush was sliced off — even faces, uneven heights
    const stumps: Array<[number, number, number]> = [
      [-2, 1, 2], [2, 1, 1], [-1, -2, 2], [2, -1, 1], [0, 0, 2], [-3, 0, 1],
    ];
    for (const [sx, sz, h] of stumps) {
      for (let k = 0; k < h; k++) put(sway, sx, 3 + k * 0.7, sz, pal.stem, 0.6);
      put(sway, sx, 3 + h * 0.7 + 0.15, sz, slice, 0.62);   // flat cut face
    }

    // one or two tiny pins left behind
    put(sway, 1, 3.15, -2, pal.unripe, 0.35);
    put(sway, -1.8, 3.1, 1.8, pal.unripe, 0.3);

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.46;
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const spore = shade(pal.fruit, pal.dark, 0.55);         // spore stain
    // spore-dusted casing
    substrateBlock(stat, 903, mixColor(pal.young, PALETTE.straw, 0.25), spore);

    const capDark = shade(pal.fruit, pal.dark, 0.45);       // mature-dark caps
    const capHi = shade(pal.fruit, pal.light, 0.2);
    const gill = shade(pal.accent, 0xffffff, 0.18);         // pale exposed gills

    const big = (sx: number, sz: number, h: number, r: number): void => {
      for (let k = 0; k <= h; k++) put(sway, sx, 3 + k, sz, pal.stem, k === h ? 0.75 : 0.62);
      // mature cap: wide, flat, dark — wavy split rim
      blob(sway, sx, 3 + h + 0.1, sz, r, 0.5, r, capDark, shade(capDark, pal.dark, 0.4),
        { seed: (sx * 13 + sz * 7 + 9) | 0 });
      for (let k = 0; k < 8; k++) {
        if (k % 4 === 3) continue;                          // splits in the rim
        const a = (k / 8) * Math.PI * 2 + sx;
        put(sway, sx + Math.cos(a) * (r + 0.1), 3 + h + 0.55, sz + Math.sin(a) * (r + 0.1),
          k % 2 ? shade(capDark, PALETTE.straw, 0.2) : capHi, 0.5);
      }
    };

    big(-2, 1, 3, 1.5);
    big(1.8, 1.4, 4, 1.6);
    big(-1, -2, 3, 1.3);
    big(2.4, -1.4, 2, 1.2);

    // one cap fully upturned — a cup of pale exposed gills on a bent stem
    vline(sway, -3, 3, 0.4, -3.4, 4.7, 1.0, pal.stem);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      put(sway, -3.4 + Math.cos(a) * 1.0, 4.9 + (k % 2) * 0.22, 1.0 + Math.sin(a) * 1.0, capDark, 0.6);
    }
    put(sway, -3.4, 4.7, 1.0, gill, 0.8);
    put(sway, -3.0, 4.65, 1.0, gill, 0.5);
    put(sway, -3.7, 4.6, 1.2, gill, 0.45);

    // spores actively shedding onto the casing
    const rnd = rng(99);
    for (let i = 0; i < 6; i++)
      put(sway, -2 + rnd() * 4, 2.75 + rnd() * 0.2, -2 + rnd() * 4, spore, 0.3);
    return finishPlant(stat, sway);
  },
};
