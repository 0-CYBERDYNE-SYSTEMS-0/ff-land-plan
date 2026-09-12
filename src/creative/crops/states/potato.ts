/**
 * Lifecycle state builders for the `potato` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: die-back — brown/blackened vines collapsed in a sagging mass over
 *    the intact hilled mound.
 *  - harvested: DUG — the hill cracked open into a dark hollow with a
 *    thrown-up rim, pale tubers (`pal.fruit`) rolled out onto the soil,
 *    cut vine remnants.
 *  - overripe: yellow-brown spent vines still covering the mound, sagging
 *    lower than healthy; skin-set hint — tuber crowns peeking from cracks.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): deterministic seeded
 * builders, single pose, mound/tubers in `stat`, vines in `sway`.
 */
import { PALETTE, Voxel, rng, mixColor } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, soilPad, finishPlant,
  type ArchetypeStates, type CropPalette,
} from '../shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/**
 * Spent vine: rises off the mound, flops outward and down, carrying sparse
 * withered leaflet pairs along the flop line.
 */
function spentVine(
  sway: Voxel[], x0: number, z0: number,
  dx: number, dz: number, peak: number, reach: number,
  base: number, tip: number, seed: number,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  const kx = x0 + dx * 0.7, kz = z0 + dz * 0.7;
  vline(sway, x0, 0.7, z0, kx, peak, kz, base);
  vline(sway, kx, peak, kz, x0 + dx * reach, 0.55, z0 + dz * reach, shade(base, tip, 0.4));
  for (let i = 1; i <= 3; i++) {
    const t = i / 3.5;
    const lx = kx + dx * reach * t, lz = kz + dz * reach * t;
    const ly = peak + (0.55 - peak) * t;
    put(sway, lx + px * 0.75, ly, lz + pz * 0.75, tip, 0.55);
    put(sway, lx - px * 0.75, ly - 0.25, lz - pz * 0.75, shade(tip, PALETTE.shadow, 0.28), 0.5);
    if (rnd() < 0.4) put(sway, lx, ly + 0.5, lz, tip, 0.4);
  }
}

export const potatoStates: ArchetypeStates = {
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 909, 1);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const char = shade(deadC, PALETTE.charcoal, 0.5);
    const charDark = shade(char, PALETTE.shadow, 0.25);

    // blackened vines collapsed over the hilled mound
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = R8[i % 8];
      spentVine(sway, dx * 0.4, dz * 0.4, dx, dz, 1.4 + (i % 3) * 0.45, 2.4 + (i % 2) * 0.6,
        i % 2 ? deadC : shade(deadC, PALETTE.shadow, 0.25),
        i % 3 === 0 ? char : shade(deadC, char, 0.5), 5010 + i * 17);
    }
    // shriveled leaflet litter caught in the blackened mass
    put(sway, 0, 1.6, 1.1, char, 0.5);
    put(sway, -1.2, 1.55, -0.6, charDark, 0.45);
    put(sway, 1.3, 1.5, 0.4, charDark, 0.45);
    return finishPlant(stat, sway);
  },

  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const rnd = rng(5002);
    soilPad(stat, 3, 909, 0);

    // opened hill: thrown-up rim ring around the dark dug hollow
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      const rx = Math.cos(ang) * 2.1, rz = Math.sin(ang) * 2.1;
      put(stat, Math.round(rx), 0.95, Math.round(rz), rnd() < 0.5 ? PALETTE.soilDark : PALETTE.soilWet, 0.9);
      if (rnd() < 0.55) {
        put(stat, Math.round(rx) + (rnd() - 0.5) * 0.6, 1.35, Math.round(rz) + (rnd() - 0.5) * 0.6, PALETTE.soilDark, 0.55);
      }
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (dx * dx + dz * dz <= 2) {
          put(stat, dx, 0.3, dz, rnd() < 0.6 ? PALETTE.soilWet : shade(PALETTE.soilWet, PALETTE.soilDark, 0.5), 0.9);
        }

    // pale tubers rolled out of the hill onto open soil
    const tuber = (x: number, z: number, c: number): void => {
      put(stat, x, 0.78, z, c, 0.95);
      put(stat, x + 0.3, 1.22, z + 0.18, shade(c, 0xffffff, 0.15), 0.6);
      put(stat, x, 0.5, z, PALETTE.soilDark, 0.7);
    };
    tuber(2.7, 1.4, pal.fruit);
    tuber(-2.6, 1.1, shade(pal.fruit, PALETTE.shadow, 0.1));
    tuber(0.3, -2.8, shade(pal.fruit, 0xffffff, 0.1));

    // cut vine remnants left on the dug soil
    const cutC = mixColor(pal.stem, pal.stubble ?? STATE_TONES.stubble, 0.6);
    vline(sway, -0.9, 0.6, 1.7, -1.8, 0.5, 2.5, cutC);
    vline(sway, 1.5, 0.5, -0.9, 2.4, 0.42, -1.5, shade(cutC, PALETTE.shadow, 0.2));
    put(sway, 1.0, 0.55, 1.9, cutC, 0.5);
    put(sway, -2.5, 0.5, -1.2, shade(cutC, PALETTE.shadow, 0.3), 0.45);
    return finishPlant(stat, sway);
  },

  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 909, 1);

    const spent = mixColor(pal.mature, pal.stress ?? STATE_TONES.stress, 0.72);
    const spentTip = shade(spent, PALETTE.straw, 0.32);

    // yellow-brown spent vines still covering the mound, sagging low
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = R8[i % 8];
      spentVine(sway, dx * 0.35, dz * 0.35, dx, dz, 2.1 + (i % 2) * 0.45, 2.5 + (i % 3) * 0.3,
        i % 2 ? spent : shade(spent, 0xffffff, 0.1), spentTip, 5070 + i * 13);
    }

    // skin-set hint: tuber crowns peeking from cracks in the spent hill
    put(stat, 1.7, 1.5, -1.1, pal.fruit, 0.95);
    put(stat, 1.7, 2.0, -1.1, shade(pal.fruit, 0xffffff, 0.18), 0.55); // crown glint
    put(stat, 2.4, 1.42, -1.25, PALETTE.soilDark, 0.55);
    put(stat, 1.0, 1.42, -1.4, PALETTE.soilDark, 0.55);
    put(stat, -1.9, 1.48, 0.9, shade(pal.fruit, PALETTE.soilDark, 0.1), 0.8);
    put(stat, -2.55, 1.4, 1.05, PALETTE.soilDark, 0.5);
    put(stat, -1.2, 1.4, 1.65, PALETTE.soilDark, 0.45);
    return finishPlant(stat, sway);
  },
};
