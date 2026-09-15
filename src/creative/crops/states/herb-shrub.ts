/**
 * Lifecycle state builders for the `herb-shrub` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: brown-grey dried skeleton — bare splayed woody stems snapped at
 *    uneven heights, sparse shrivelled leaves clinging to the low nodes.
 *    Structure keeps ~0.6 height (default dead factor reads fine).
 *  - harvested: topiary cut — a neat tight rounded ball on the woody frame
 *    with pale shear faces where the clippers passed. heightFactor 0.48
 *    keeps the trimmed ball near the healthy footprint (a trimmed rosemary
 *    keeps its width, only its height).
 *  - overripe: overgrown and leggy — tall splayed stems bare and woody on
 *    the inner third, sparse yellowing needle whorls above, few faded
 *    pal.accent flowers left on the tips.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, blob, soilPad, finishPlant, flowerDot,
} from '../shared';
import type { ArchetypeStates } from '../shared';

const wood = (pal: { stem: number }): number => shade(PALETTE.woodDark, pal.stem, 0.25);

export const herbShrubStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 666);

    const deadT = pal.dead ?? STATE_TONES.dead;
    const deadLo = shade(deadT, PALETTE.shadow, 0.3);
    const greyWood = shade(wood(pal), deadT, 0.5);

    // dried woody base persists
    put(stat, 0, 0.5, 0, greyWood, 1);
    put(stat, 0.6, 0.4, 0.4, greyWood, 0.75);
    put(stat, -0.6, 0.4, -0.3, greyWood, 0.75);

    // bare splayed dead stems, snapped at uneven heights — the shrub skeleton
    // keeps most of the healthy spread (a dried rosemary still fills its spot)
    const skel: Array<[number, number, number, number]> = [
      [1, 0, 5.0, 0.7], [-1, 0, 4.5, 0.7], [0, 1, 4.1, 0.6], [0, -1, 3.7, 0.6],
      [1, 1, 3.3, 0.85], [-1, -1, 3.0, 0.85], [1, -1, 2.6, 0.95], [-1, 1, 2.4, 0.95],
    ];
    skel.forEach(([dx, dz, sh, lean], i) => {
      vline(stat, dx * 0.4, 0.4, dz * 0.4,
        dx * (0.4 + lean * sh * 0.4), sh, dz * (0.4 + lean * sh * 0.4),
        i % 2 ? greyWood : shade(greyWood, deadLo, 0.4));
      // shrivelled leaves cling to the lower nodes of every stem
      put(sway, dx * 0.9, 1.3, dz * 0.9, deadT, 0.55);
      put(sway, dx * (0.9 + lean) - dz * 0.3, 1.9, dz * (0.9 + lean) + dx * 0.3, deadLo, 0.48);
      if (i % 2 === 0) put(sway, dx * (1.1 + lean), 2.6, dz * (1.1 + lean), deadT, 0.42);
    });

    // snapped branch fallen right across the mound + dried needle litter
    vline(stat, 2.3, 0.7, -1.4, -0.6, 0.7, 1.8, shade(greyWood, deadLo, 0.4));
    put(stat, 1.5, 0.75, -1.2, greyWood, 0.7);
    put(stat, 0.9, 0.7, -1.6, greyWood, 0.55);
    const rnd = rng(88);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.8 + rnd() * 1.4;
      put(sway, Math.cos(a) * r, 0.4 + rnd() * 0.3, Math.sin(a) * r,
        rnd() < 0.5 ? deadT : deadLo, 0.4);
    }
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 666);

    const f = shade(pal.mature, pal.light, 0.18);        // fresh trimmed coat
    const fLo = shade(pal.mature, pal.dark, 0.25);
    const cutFace = shade(pal.light, 0xffffff, 0.28);    // pale sheared face

    // woody frame the ball was cut back to
    put(stat, 0, 0.6, 0, wood(pal), 1);
    put(stat, 0.5, 0.4, 0.3, wood(pal), 0.7);
    put(stat, -0.5, 0.4, -0.3, wood(pal), 0.7);

    // neat rounded topiary ball, tight two-tone
    blob(sway, 0, 1.9, 0, 2.3, 1.35, 2.3, f, fLo, { seed: 61 });
    // pale shear faces — flat patches where the clippers passed (top + one side)
    put(sway, 0, 3.15, 0, cutFace, 0.85);
    put(sway, 0.9, 3.05, 0, cutFace, 0.8);
    put(sway, -0.85, 3.0, 0.1, cutFace, 0.8);
    put(sway, 0, 3.05, 0.85, cutFace, 0.8);
    put(sway, 2.15, 1.9, 0, cutFace, 0.8);
    put(sway, 1.95, 2.2, 0.25, cutFace, 0.7);

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.48;
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 666);

    const stressT = pal.stress ?? STATE_TONES.stress;
    const f = shade(pal.mature, pal.light, 0.1);
    const needle = shade(pal.mature, pal.dark, 0.18);
    const innerWood = shade(f, wood(pal), 0.55);   // woody inner stems showing
    const tipYell = shade(f, stressT, 0.65);       // yellowing tips
    const tipDry = shade(stressT, PALETTE.straw, 0.25);

    // thick older woody base
    put(stat, 0, 0.5, 0, wood(pal), 1);
    put(stat, 0.5, 0.4, 0.4, wood(pal), 0.75);
    put(stat, -0.5, 0.4, -0.3, wood(pal), 0.75);
    put(stat, 0, 1.2, 0, innerWood, 0.8);

    const stems: Array<[number, number, number, number]> = [
      [1, 0, 7.0, 0.6], [-1, 0, 6.6, 0.6], [0, 1, 6.2, 0.55], [0, -1, 5.8, 0.55],
      [1, 1, 5.4, 0.7], [-1, -1, 5.1, 0.7], [1, -1, 4.7, 0.75], [-1, 1, 4.4, 0.75],
    ];
    stems.forEach(([dx, dz, sh, lean], i) => {
      let x = dx * 0.4;
      let z = dz * 0.4;
      for (let k = 0; k <= sh; k++) {
        x = dx * (0.4 + lean * k * 0.4);
        z = dz * (0.4 + lean * k * 0.4);
        // bare woody lower third, then sparse whorls every other node
        const bare = k < sh * 0.35;
        put(stat, x, 0.4 + k, z, bare ? innerWood : shade(f, wood(pal), 0.3));
        if (bare || k % 2 === 1) continue;
        const px = -(dz || 1);
        const pz = dx || -1;
        const yellowing = k > sh * 0.7;
        put(sway, x + px, 0.4 + k, z + pz, yellowing ? tipYell : needle, 0.68);
        put(sway, x - px * 0.8, 0.5 + k, z - pz * 0.8,
          yellowing ? tipDry : shade(needle, pal.light, 0.18), 0.6);
      }
      // sparse faded flowers left on the leggy tips
      if (i % 3 === 0) {
        flowerDot(sway, x, 0.4 + sh + 0.7, z, shade(pal.accent, stressT, 0.25), 0.45);
        if (i === 0) flowerDot(sway, x + 0.4, 0.4 + sh + 0.95, z, pal.accent, 0.38);
      }
    });
    return finishPlant(stat, sway);
  },
};
