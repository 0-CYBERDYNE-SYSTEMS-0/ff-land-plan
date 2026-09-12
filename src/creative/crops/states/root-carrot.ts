/**
 * Lifecycle state builders for the `root-carrot` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: ferny tops collapsed into a brown litter star around a greyed
 *    crown stump — flat, feathery, unmistakably an ex-carrot.
 *  - harvested: PULLED — disturbed soil ring around a dark hollow, two cut
 *    root shoulders (`pal.fruit`) lying beside it plus wilted leaf scraps.
 *  - overripe: oversized cracked shoulder shouldered clear out of the soil
 *    (darker/earthier `pal.fruit`, proud lumps wider than s5's ring), tall
 *    yellowed ferns on the lifted crown.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): deterministic seeded
 * builders, single pose, soil/static in `stat`, foliage litter in `sway`.
 */
import { PALETTE, Voxel, rng, mixColor } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, blob, soilPad, finishPlant, frond, flowerDot,
  type ArchetypeStates, type CropPalette,
} from '../shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/**
 * Collapsed fern frond: kinks up from the crown, falls to the pad, trails
 * flat with sparse feathery ticks — the dead-top silhouette.
 */
function fallenFrond(
  sway: Voxel[], ox: number, oy: number, oz: number,
  dx: number, dz: number, up: number, reach: number,
  base: number, darkC: number, dry: number, seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  const kx = ox + dx * 0.9, kz = oz + dz * 0.9; // kink point
  vline(sway, ox, oy, oz, kx, oy + up, kz, base);
  vline(sway, kx, oy + up, kz, ox + dx * 1.9, oy + 0.5, oz + dz * 1.9, shade(base, darkC, 0.4));
  for (let i = 0; i <= reach; i++) {
    const lx = Math.round(ox + dx * (1.9 + i * 0.7) + (rnd() - 0.5) * 0.7);
    const lz = Math.round(oz + dz * (1.9 + i * 0.7) + (rnd() - 0.5) * 0.7);
    put(sway, lx, 0.55, lz, i === reach ? dry : shade(base, dry, 0.35), 0.7);
    if (rnd() < 0.45) put(sway, lx + px * 0.8, 0.72, lz + pz * 0.8, dry, 0.4);
  }
  // ticks on the standing kink keep the ferny read even collapsed
  put(sway, Math.round(kx + px * 0.9), Math.round(oy + up - 1), Math.round(kz + pz * 0.9), dry, 0.5);
  put(sway, Math.round(kx - px * 0.9), Math.round(oy + up * 0.5), Math.round(kz - pz * 0.9), shade(base, dry, 0.3), 0.5);
}

export const rootCarrotStates: ArchetypeStates = {
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 707);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const darkC = shade(deadC, PALETTE.shadow, 0.38);
    const dry = shade(deadC, 0xffffff, 0.16);

    // greyed crown stump — tops broke off here, root still in the ground
    put(stat, 0, 0.4, 0, darkC, 0.85);
    put(stat, 0.6, 0.5, 0.2, shade(darkC, dry, 0.3), 0.5);

    for (let i = 0; i < 7; i++) {
      const [dx, dz] = R8[i];
      fallenFrond(sway, 0, 0.5, 0, dx, dz, 1 + (i % 3 === 0 ? 1.4 : 0), 1 + (i % 2),
        i % 2 ? deadC : shade(deadC, darkC, 0.45), darkC, dry, 3010 + i * 13);
    }
    // detached litter scraps blown flat onto the pad
    const scraps: Array<[number, number]> = [[-2.4, 1.2], [2.5, -1.1], [-1.6, -2.2], [1.3, 2.3]];
    for (let i = 0; i < scraps.length; i++) {
      put(sway, scraps[i][0], 0.55, scraps[i][1], i % 2 ? dry : shade(deadC, dry, 0.4), 0.55);
    }
    return finishPlant(stat, sway);
  },

  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const rnd = rng(3002);
    soilPad(stat, 2.5, 707);

    // disturbed rim of dug soil around an open dark hollow — the pull hole
    const wet = PALETTE.soilWet;
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = R8[i];
      put(stat, dx * 1.6, 0.95, dz * 1.6, rnd() < 0.5 ? wet : shade(wet, PALETTE.soilDark, 0.45), 0.9);
      if (i % 2 === 0) put(stat, dx * 1.1, 0.75, dz * 1.1, shade(wet, PALETTE.soilDark, 0.6), 0.8);
    }
    put(stat, 0, 0.42, 0, PALETTE.shadow, 1.15);        // the open pull hole
    put(stat, 0.5, 0.35, 0.3, PALETTE.black, 0.6);      // deep pocket
    put(stat, 0.95, 0.72, 0.25, PALETTE.soilDark, 0.55);   // lip clods on the rim
    put(stat, -0.8, 0.7, -0.55, PALETTE.soilDark, 0.55);

    // cut root shoulders lying beside the hole — "something was here and is gone"
    const shoulder = (x: number, z: number, tx: number, tz: number, c: number): void => {
      put(stat, x, 0.7, z, c, 1.05);
      put(stat, x + tx, 0.55, z + tz, shade(c, PALETTE.soilDark, 0.3), 0.7);   // cut face
      put(stat, x - tx * 0.7, 0.98, z - tz * 0.7, shade(c, 0xffffff, 0.22), 0.55); // gloss
      put(sway, x, 1.35, z, mixColor(pal.mature, STATE_TONES.stubble, 0.7), 0.4); // cut-top stub
    };
    shoulder(2.1, 1.4, 0.6, 0.5, pal.fruit);
    shoulder(-1.9, -1.5, -0.55, 0.65, shade(pal.fruit, PALETTE.shadow, 0.14));

    // wilted leaf scraps + a thrown clod
    const scrap = mixColor(pal.mature, pal.stubble ?? STATE_TONES.stubble, 0.55);
    put(sway, -2.3, 0.55, 0.7, scrap, 0.55);
    put(sway, -1.8, 0.55, 1.2, shade(scrap, 0xffffff, 0.15), 0.42);
    put(sway, 2.3, 0.55, -0.9, scrap, 0.5);
    put(sway, 0.9, 0.55, 2.3, shade(scrap, PALETTE.shadow, 0.25), 0.5);
    put(stat, -2.6, 0.6, -2.0, PALETTE.soilDark, 0.6);
    return finishPlant(stat, sway);
  },

  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 707);

    // oversized root shouldered clear out of the soil — earthier + cracked
    const earthy = shade(pal.fruit, PALETTE.soilDark, 0.22);
    blob(stat, 0, 1.05, 0, 2.05, 1.05, 2.05, earthy, shade(earthy, PALETTE.shadow, 0.32), { seed: 46 });
    put(stat, 2.5, 0.7, 2.5, earthy, 0.75); // proud lumps — wider than s5's ring
    put(stat, -2.5, 0.7, -2.4, earthy, 0.75);
    put(stat, 2.6, 0.65, -2.3, shade(earthy, PALETTE.shadow, 0.18), 0.7);
    put(stat, 0, 2.45, 0, shade(earthy, 0xffffff, 0.14), 0.55);          // dull crown
    put(stat, 0.9, 2.42, 0.3, shade(earthy, PALETTE.shadow, 0.55), 0.5); // growth cracks
    put(stat, -0.8, 2.4, -0.6, shade(earthy, PALETTE.shadow, 0.55), 0.45);
    flowerDot(stat, 2.7, 0.28, 1.3, PALETTE.soilDark, 0.55);             // heaved clods
    flowerDot(stat, -2.6, 0.28, -1.4, PALETTE.soilDark, 0.55);

    // tall yellowed ferns ringing the lifted crown
    const yel = mixColor(pal.mature, pal.stress ?? STATE_TONES.stress, 0.55);
    const tipC = shade(yel, 0xffffff, 0.18);
    const sideC = shade(yel, PALETTE.shadow, 0.3);
    for (let i = 0; i < 9; i++) {
      const [dx, dz] = R8[i % 8];
      frond(sway, dx * 1.0, 2.35, dz * 1.0, dx || 1, dz, 5 - (i % 3 === 2 ? 1 : 0),
        i % 2 ? tipC : shade(tipC, PALETTE.shadow, 0.15), sideC, 3080 + i * 7);
    }
    return finishPlant(stat, sway);
  },
};
