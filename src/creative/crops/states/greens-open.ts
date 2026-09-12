/**
 * Lifecycle state builders for the `greens-open` archetype
 * (spinach/arugula/chard — SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * Single pose per state, same kit as makeGreensOpen (heads.ts): colored
 * petioles out of a crown, open blades — never a closed head. Default height
 * factors (dead 0.55 / harvested 0.3 / overripe 0.95) fit — no overrides.
 *  - dead: flat brown shriveled litter patch on the pad — no upright mass,
 *    asymmetric with gaps (thinned patch, not a tidy rosette).
 *  - harvested: sheared stubble row of pale cut petiole stubs. Stub faces use
 *    pal.stem/pal.light so chard's pale stumps recolor with the catalog.
 *  - overripe: yellowed, leggy, thinner leaves pushed high on long petioles
 *    with a hint of flower dots at the crown (bolt stalks are a later wave).
 */
import { Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, STATE_TONES, foliage, shade,
  put, vline, blade, soilPad, finishPlant,
} from '../shared';

const DIRS8: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const greensOpenStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 451);
    const dead = pal.dead ?? STATE_TONES.dead;
    const char = shade(dead, pal.dark, 0.42);
    const bone = shade(dead, pal.light, 0.2);
    // dead crown stub
    put(stat, 0, 0.4, 0, dead, 0.65);
    // shriveled litter: flat scattered blades, jittered origins, gaps
    DIRS8.forEach(([dx, dz], i) => {
      if (i === 2 || i === 5) return; // the patch has thinned
      const ox = dx * (0.2 + (i % 3) * 0.3);
      const oz = dz * (0.2 + ((i + 1) % 3) * 0.3);
      blade(sway, ox, 0.45, oz, dx, dz, 2, i % 2 ? 2 : 1, 0.12, 0.02,
        i % 3 ? dead : char, bone, char, 62 + i * 5);
    });
    // curled husks that still hold a little height
    put(sway, 0.9, 1.0, -0.6, char, 0.6);
    put(sway, -0.8, 0.8, 0.7, dead, 0.5);
    // crumb specks across the pad
    const rnd = rng(64);
    for (let i = 0; i < 6; i++) {
      put(sway, (rnd() - 0.5) * 5.2, 0.35, (rnd() - 0.5) * 5.2, rnd() < 0.5 ? dead : char, 0.4);
    }
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 452);
    const stubble = pal.stubble ?? STATE_TONES.stubble;
    const pale = shade(pal.stem, pal.light, 0.55);       // pale cut petioles
    const paleBody = shade(pal.stem, pal.light, 0.2);
    const cutTop = shade(pal.light, pal.stem, 0.2);       // near-white sheared face
    // sheared stubble row: staggered petiole stumps at varying cut heights
    const stumps: Array<[number, number, number]> = [
      [-1.7, 0.9, 0.4], [-0.7, 1.3, -0.3], [0.3, 0.8, 0.5],
      [1.3, 1.15, -0.2], [0.9, 0.7, 1.3], [-1.2, 0.8, -1.2],
    ];
    stumps.forEach(([sx, sh, sz], i) => {
      vline(sway, sx, 0.3, sz, sx, sh, sz, i % 2 ? pale : paleBody);
      put(sway, sx, sh + 0.32, sz, cutTop, 0.6);
    });
    // dry scraps left lying after the cut
    put(sway, -2.3, 0.4, 1.2, stubble, 0.5);
    put(sway, 2.4, 0.38, -0.9, shade(stubble, pal.dark, 0.2), 0.45);
    return finishPlant(stat, sway);
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 453);
    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = foliage(pal, 5);
    const yellow = shade(f, stressC, 0.5);
    const edge = shade(yellow, pal.dark, 0.45);
    const vein = shade(yellow, pal.light, 0.3);
    const petiole = pal.accent ?? pal.stem;
    // leggy: thinner blades pushed high on long petioles, little sprawl left
    const legs: Array<[number, number, number]> = [
      [1, 0, 2.5], [-1, 0, 2.6], [0, 1, 2.3], [0, -1, 2.45],
      [1, 1, 2.7], [-1, -1, 2.35], [1, -1, 2.1], [-1, 1, 2.2],
    ];
    legs.forEach(([dx, dz, ph], i) => {
      const bx = Math.round(dx * 0.8), bz = Math.round(dz * 0.8);
      vline(sway, 0, 0.4, 0, bx, ph, bz, shade(petiole, pal.dark, 0.15));
      blade(sway, bx, ph, bz, dx, dz, 2, i % 2 ? 2 : 1, 0.55, 0.1,
        i % 3 === 0 ? shade(yellow, f, 0.35) : yellow, vein, edge, 80 + i * 4);
    });
    // past-prime crown + a hint of tiny flower dots (bolt stalks come later)
    put(sway, 0, 2.85, 0, pal.accent, 0.42);
    put(sway, 0.45, 2.55, 0.3, pal.accent, 0.36);
    put(sway, -0.4, 2.65, -0.3, pal.accent, 0.36);
    return finishPlant(stat, sway);
  },
};
