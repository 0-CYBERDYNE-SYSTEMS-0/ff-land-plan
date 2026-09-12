/**
 * Lifecycle state builders for the `brassica` archetype
 * (broccoli/kale — SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * Single pose per state, same kit as makeBrassica (heads.ts): stalk in the
 * static group, coarse wrapper blades, curd as blob domes. Default height
 * factors (dead 0.55 / harvested 0.3 / overripe 0.95) fit — no overrides.
 *  - dead: coarse grey-brown leaves arched off a dead stalk then slumped,
 *    rotted crown lump, sparser than the leafy-head star (crop DNA: stalk).
 *  - harvested: crown CUT — tall bare stalk with a pale cut face, small side
 *    leaves and a pushing side bud (broccoli cut-and-come-again regrowth).
 *  - overripe: curd lofted open into separated yellowing floret lobes on
 *    visible stalklets, studded with yellow bloom dots (gone to flower).
 */
import { Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, STATE_TONES, foliage, shade,
  put, vline, blade, blob, soilPad, finishPlant, flowerDot,
} from '../shared';

const DIRS6: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];

export const brassicaStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 351);
    const dead = pal.dead ?? STATE_TONES.dead;
    const char = shade(dead, pal.dark, 0.45);
    const bone = shade(dead, pal.light, 0.22);
    // dead stalk — still standing a beat after the crown rots out
    vline(stat, 0, 0, 0, 0, 1, 0, shade(pal.stem, dead, 0.55));
    // coarse leaves arch off the stalk once, tips slumped back to the pad
    DIRS6.forEach(([dx, dz], i) => {
      blade(sway, 0, 1, 0, dx, dz, 3, 3, 0.55, 0.14, i % 3 ? dead : char, bone, char, 310 + i * 9);
    });
    // rotted crown lump where the curd collapsed
    blob(sway, 0, 1.35, 0, 0.9, 0.45, 0.9, dead, char, { seed: 36 });
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 352);
    const stalkC = shade(pal.stem, pal.dark, 0.15);
    const cut = shade(pal.stem, pal.light, 0.55);
    // tall bare stalk where the crown was sheared off, pale cut face on top
    vline(stat, 0, 0, 0, 0, 3, 0, stalkC);
    put(stat, 0, 3.4, 0, cut, 0.85);
    put(stat, 0.65, 3.1, 0.3, shade(cut, pal.light, 0.25), 0.6);
    put(stat, -0.6, 3.1, -0.35, shade(cut, pal.light, 0.25), 0.6);
    // stump regrowth: small side leaves + a pale side bud already pushing
    const f = foliage(pal, 3);
    const edge = shade(f, pal.dark, 0.42);
    const vein = shade(f, pal.light, 0.4);
    blade(sway, 0, 1.5, 0, 1, 0, 2, 2, 0.35, 0.05, f, vein, edge, 320);
    blade(sway, 0, 1.9, 0, -1, 0, 2, 2, 0.3, 0.05, shade(f, pal.dark, 0.2), vein, edge, 321);
    blade(sway, 0, 1.2, 0, 0, 1, 1, 2, 0.3, 0.04, f, vein, edge, 322);
    put(sway, 2.1, 2.3, 0, pal.unripe, 0.55);
    return finishPlant(stat, sway);
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 353);
    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = foliage(pal, 5);
    const going = shade(f, stressC, 0.4);
    const edge = shade(going, pal.dark, 0.42);
    const vein = shade(going, pal.light, 0.35);
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    // wrappers hang looser, going yellow-green at the tips
    DIRS6.forEach(([dx, dz], i) => {
      blade(sway, 0, 2, 0, dx, dz, 4, 3, 0.3, 0.05, i % 2 ? going : f, vein, edge, 330 + i * 4);
    });
    // curd lofted open: floret lobes on visible stalklets, air between them
    const lobes: Array<[number, number, number]> = [
      [0, 4.7, 0], [1.7, 4.2, 0.7], [-1.6, 4.3, -0.6], [0.8, 4.4, -1.5], [-0.9, 4.1, 1.5],
    ];
    const floret = shade(pal.fruit, stressC, 0.35);
    lobes.forEach(([lx, ly, lz], i) => {
      vline(sway, 0, 2, 0, Math.round(lx), ly - 0.7, Math.round(lz), shade(pal.fruit, pal.dark, 0.25));
      blob(sway, lx, ly, lz, 0.85, 0.6, 0.85, floret, shade(floret, pal.dark, 0.3), { seed: 40 + i });
    });
    // yellow bloom — broccoli gone to flower reads instantly
    const rnd = rng(46);
    for (let i = 0; i < 26; i++) {
      const [lx, ly, lz] = lobes[i % lobes.length];
      const spread = i < 15 ? 1.1 : 0.6;
      flowerDot(sway, lx + (rnd() - 0.5) * spread, ly + 0.6 + rnd() * 0.5, lz + (rnd() - 0.5) * spread, pal.accent, 0.55);
    }
    return finishPlant(stat, sway);
  },
};
