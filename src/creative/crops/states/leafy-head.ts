/**
 * Lifecycle state builders for the `leafy-head` archetype
 * (lettuce/cabbage/cauliflower — SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * Single pose per state, same kit as makeLeafyHead (heads.ts): spoon blades
 * radiating from a crown, heads as stepped blobs. Default height factors
 * (dead 0.55 / harvested 0.3 / overripe 0.95) fit — no overrides.
 *  - dead: collapsed rosette of desiccated grey-brown leaves slumped flat on
 *    the pad, crispy flakes blown past the rim.
 *  - harvested: head CUT — short fat stump with a flat pale cut face, sheared
 *    wrapper butts and stale head-colored leaf scraps (cut cabbage stump).
 *  - overripe: overgrown head split into two parting lobes over a dark
 *    crevice, yellowed splayed wrappers (bolt stalks are a later wave).
 */
import { Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, STATE_TONES, foliage, shade,
  put, vline, blade, blob, soilPad, finishPlant,
} from '../shared';

const DIRS8: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const leafyHeadStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 251);
    const dead = pal.dead ?? STATE_TONES.dead;
    const char = shade(dead, pal.dark, 0.42);
    const bone = shade(dead, pal.light, 0.22);
    // collapsed rosette: outer leaves slump flat, inner ones arch once and fall
    DIRS8.forEach(([dx, dz], i) => {
      const inner = i >= 4;
      blade(sway, 0, inner ? 0.8 : 0.6, 0, dx, dz, inner ? 2 : 3, i % 2 ? 3 : 2,
        inner ? 0.55 : 0.3, inner ? 0.14 : 0.1,
        i % 3 ? dead : char, bone, char, 210 + i * 7);
    });
    // hollowed heart — low lumpy remnant of the head
    blob(sway, 0, 0.85, 0, 1.25, 0.5, 1.25, dead, char, { seed: 27 });
    // crispy flakes blown past the rim
    const rnd = rng(28);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2 + rnd() * 1.2;
      put(sway, Math.round(Math.cos(a) * r), 0.42, Math.round(Math.sin(a) * r), rnd() < 0.5 ? dead : char, 0.5);
    }
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 252);
    const stub = pal.stubble ?? STATE_TONES.stubble;
    const stumpC = shade(pal.stem, stub, 0.55);          // drying stem, not green
    const cut = shade(pal.light, pal.stem, 0.18);        // near-white cut face
    // classic cut-cabbage stump: short fat stem capped by a flat pale face
    blob(stat, 0, 0.75, 0, 1.35, 0.7, 1.35, stumpC, shade(stub, pal.dark, 0.12), { seed: 29 });
    put(stat, 0, 1.66, 0, cut, 1.0);
    put(stat, 0.95, 1.46, 0, cut, 0.85);
    put(stat, -0.95, 1.46, 0, cut, 0.85);
    put(stat, 0, 1.46, 0.95, cut, 0.85);
    put(stat, 0, 1.46, -0.95, cut, 0.85);
    // sheared wrapper butts ringing the stump base — dry straw
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz], i) => {
      blade(sway, 0, 0.5, 0, dx, dz, 1, 2, 0.12, 0, stub, shade(stub, pal.light, 0.25), shade(stub, pal.dark, 0.4), 230 + i);
    });
    // dropped scraps from the taken head — stale, bruised head color
    const scrap = shade(pal.fruit, STATE_TONES.stress, 0.55);
    put(sway, 2.1, 0.42, 0.8, scrap, 0.65);
    put(sway, -1.9, 0.4, -1.3, shade(scrap, pal.dark, 0.35), 0.55);
    put(sway, 0.9, 0.38, -2.2, shade(scrap, pal.dark, 0.2), 0.5);
    put(sway, -2.4, 0.4, 1.5, shade(stub, pal.dark, 0.25), 0.5);
    put(sway, 1.5, 0.9, -1.5, scrap, 0.45);   // one scrap leaning against the stump
    return finishPlant(stat, sway);
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 253);
    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = foliage(pal, 5);
    const yellow = shade(f, stressC, 0.55);
    const edge = shade(yellow, pal.dark, 0.45);
    const vein = shade(yellow, pal.light, 0.35);
    // wrappers splay looser than harvest-ready: half flat, half lifting
    DIRS8.forEach(([dx, dz], i) => {
      const lift = i % 2 === 0;
      blade(sway, 0, 0.7, 0, dx, dz, 3, 3, lift ? 0.55 : 0.3, 0.05,
        i % 3 === 0 ? shade(yellow, f, 0.4) : yellow, vein, edge, 250 + i * 5);
    });
    vline(sway, 0, 0.6, 0, 0, 1.7, 0, vein);
    // overgrown head split into two lobes parting over a dark crevice
    const headC = shade(pal.fruit, stressC, 0.3);
    blob(sway, -1.35, 2.45, 0.15, 1.2, 1.0, 1.2, headC, shade(headC, pal.light, 0.25), { seed: 31 });
    blob(sway, 1.35, 2.3, -0.1, 1.15, 0.95, 1.15, shade(headC, pal.dark, 0.15), shade(headC, pal.light, 0.35), { seed: 32 });
    const crevice = shade(pal.dark, STATE_TONES.dead, 0.35);
    put(sway, 0, 3.2, 0, crevice, 0.85);
    put(sway, 0, 2.5, 0, crevice, 0.8);
    // one yellowed flap pulling loose from the split
    blade(sway, 0, 2.1, 0.6, 0, 1, 2, 2, 0.4, 0.18, yellow, vein, edge, 254);
    return finishPlant(stat, sway);
  },
};
