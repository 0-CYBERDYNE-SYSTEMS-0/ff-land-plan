/**
 * Lifecycle state builders for the `allium` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: brown tubes kinked flat to the pad in a star around a greyed
 *    neck — the bulb rotted in place, tops collapsed.
 *  - harvested: PULLED/CUT — short cut-tube stubble row, two papery bulbs
 *    lying on the soil (unripe × stubble skins) + a small pull hole.
 *  - overripe: tops-down at maturity — yellowed tubes FLOPPED hard from the
 *    neck, bulb swollen proud of the soil with split-skin cracks, one dry
 *    seed-head scape.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): deterministic seeded
 * builders, single pose, soil/bulbs in `stat`, tube foliage in `sway`.
 */
import { PALETTE, Voxel, mixColor } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, blob, soilPad, finishPlant, tubeLeaf, umbel,
  type ArchetypeStates, type CropPalette,
} from '../shared';

export const alliumStates: ArchetypeStates = {
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2, 808);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const darkC = shade(deadC, PALETTE.shadow, 0.35);
    const dry = shade(deadC, 0xffffff, 0.13);

    // greyed neck of the bulb left rotting in the ground
    put(stat, 0, 0.45, 0, darkC, 0.8);
    put(stat, 0.55, 0.5, 0.25, shade(darkC, dry, 0.35), 0.5);

    // tubes bent to the ground: rise a little, kink, lie flat pointing out
    const tubes: Array<[[number, number], [number, number]]> = [
      [[0, 0], [1, 0]], [[0, 0], [-1, 0]], [[0, 0], [0, 1]], [[0, 0], [0, -1]],
      [[1, 0], [1, 1]], [[-1, 0], [-1, -1]],
    ];
    for (let i = 0; i < tubes.length; i++) {
      const [[bx, bz], [dx, dz]] = tubes[i];
      const up = i % 3 === 0 ? 2 : 1;
      vline(sway, bx, 0.45, bz, bx + dx * 0.5, 0.45 + up, bz + dz * 0.5, i % 2 ? deadC : shade(deadC, darkC, 0.45));
      vline(sway, bx + dx * 0.5, 0.45 + up, bz + dz * 0.5, bx + dx * 1.8, 0.55, bz + dz * 1.8, shade(deadC, darkC, 0.3));
      put(sway, Math.round(bx + dx * 2.4), 0.5, Math.round(bz + dz * 2.4), dry, 0.8);
      put(sway, Math.round(bx + dx * 2.9), 0.5, Math.round(bz + dz * 2.9), darkC, 0.65); // withered opening
    }
    // one snapped tube lying detached on the pad
    vline(sway, -2.3, 0.5, 1.5, -1.3, 0.5, 2.0, shade(deadC, dry, 0.35));
    return finishPlant(stat, sway);
  },

  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2, 808);

    const stubble = pal.stubble ?? STATE_TONES.stubble;
    const tubeCut = mixColor(pal.mature, stubble, 0.6);     // cut green going tan
    const skin = mixColor(pal.unripe, stubble, 0.3);        // papery cured skin
    const skinDark = shade(skin, PALETTE.shadow, 0.2);

    // short cut-tube stubble where the row was topped (pale cut faces)
    const bases: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < bases.length; i++) {
      const [bx, bz] = bases[i];
      tubeLeaf(sway, bx, 0.4, bz, 1, (i - 2) * 0.15, 0, tubeCut, shade(tubeCut, 0xffffff, 0.3));
    }

    // a couple of papery bulbs lying on top of the soil
    const bulb = (x: number, z: number, dx: number, dz: number, c: number, seed: number): void => {
      blob(stat, x, 0.6, z, 1.0, 0.78, 1.0, c, skinDark, { seed });
      put(stat, x + dx, 0.45, z + dz, shade(c, PALETTE.straw, 0.4), 0.5);  // root tuft
      put(stat, x - dx * 0.9, 0.8, z - dz * 0.9, shade(c, 0xffffff, 0.2), 0.55); // neck stub
    };
    bulb(2.2, 1.2, 0.9, 0.5, skin, 61);
    bulb(-2.1, -1.1, -0.8, -0.9, shade(skin, PALETTE.straw, 0.18), 62);
    blob(stat, -0.6, 0.5, 1.9, 0.62, 0.5, 0.62, shade(skin, 0xffffff, 0.12), skinDark, { seed: 63 }); // stray small bulb

    // pull hole where a fourth bulb was yanked + blown papery scraps
    put(stat, 1.4, 0.55, -1.6, PALETTE.shadow, 0.9);
    put(stat, 1.4, 0.25, -1.6, PALETTE.black, 0.55);
    put(stat, 0.9, 0.62, -1.5, PALETTE.soilDark, 0.5);
    put(stat, 1.95, 0.6, -1.7, PALETTE.soilDark, 0.5);
    put(stat, 2.9, 0.52, -0.3, shade(skin, 0xffffff, 0.25), 0.5);
    put(stat, -0.9, 0.52, 2.5, skin, 0.4);
    return finishPlant(stat, sway);
  },

  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2, 808);

    const body = mixColor(pal.mature, pal.stress ?? STATE_TONES.stress, 0.6); // yellowed tubes

    // bulb swollen proud of the soil, skin taut and starting to split
    const overB = shade(pal.fruit, PALETTE.soilDark, 0.12);
    blob(stat, 0, 1.15, 0, 2.2, 1.45, 2.2, overB, shade(overB, pal.dark, 0.25), { seed: 56 });
    blob(stat, 0, 2.5, 0, 1.0, 0.5, 1.0, shade(overB, 0xffffff, 0.3), null);
    put(stat, 0, 3.1, 0, shade(body, PALETTE.shadow, 0.2), 0.7); // neck
    put(stat, 1.6, 1.75, 0.4, shade(overB, PALETTE.shadow, 0.5), 0.5);  // split cracks
    put(stat, -1.2, 1.7, -0.9, shade(overB, PALETTE.shadow, 0.5), 0.45);

    // tops-down: yellowed tubes flopped hard from the neck, wider than s5
    const arcs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (let i = 0; i < arcs.length; i++) {
      const [dx, dz] = arcs[i];
      const c = i % 2 ? body : shade(body, 0xffffff, 0.1);
      vline(sway, 0, 3.05, 0, dx * 1.1, 3.3, dz * 1.1, c);
      vline(sway, dx * 1.1, 3.3, dz * 1.1, dx * 3.6, 1.1, dz * 3.6, shade(c, PALETTE.shadow, 0.18));
      vline(sway, dx * 3.6, 1.1, dz * 3.6, dx * 4.9, 0.35, dz * 4.9, shade(body, PALETTE.shadow, 0.34));
    }
    // one scape that bolted to seed — dry parchment head
    vline(sway, 0, 3.05, 0, 0.3, 3.9, -0.2, shade(body, PALETTE.straw, 0.35));
    umbel(sway, 0.3, 4.2, -0.2, 1, shade(pal.accent, STATE_TONES.stubble, 0.55));
    return finishPlant(stat, sway);
  },
};
