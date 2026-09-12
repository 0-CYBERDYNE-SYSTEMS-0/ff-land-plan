/**
 * Lifecycle state builders for the `bush-bean` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: brown collapsed mound — stems arc out and flop onto the soil,
 *    crumpled heart, shriveled pods still dangling off the dead stems.
 *  - harvested: picked-spent low bush (heightFactor 0.55 override — a bean
 *    bush after picking is a sparse half-bush, not ground stubble): bent
 *    stems, few tired leaves, NO pods, empty bloom remnants.
 *  - overripe: pod-heavy bush dragging under fat over-scale fibrous pods
 *    (`pal.fruit` toward tan), foliage dark-yellowing.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): single pose,
 * deterministic (seeded rng only), fruit/flower hues derived from pal fields,
 * assembled via finishPlant.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import type { ArchetypeStates } from '../shared';
import {
  STATE_TONES, foliage, shade, put, vline, blade, flowerDot, pod,
  soilPad, finishPlant,
} from '../shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export const bushBeanStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 333);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const deadDark = shade(deadC, PALETTE.shadow, 0.4);
    const stemDead = shade(deadC, PALETTE.soilDark, 0.22);

    // collapsed mound: stems arc out and flop onto the soil
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[i];
      vline(stat, dx * 0.35, 0.7, dz * 0.35, dx * 1.2, 1.5, dz * 1.2, stemDead);
      blade(sway, Math.round(dx * 1.2), 1.4, Math.round(dz * 1.2), dx || 1, dz || 0, 2, 2, 0.15, 0.2,
        i % 2 ? deadC : shade(deadC, PALETTE.soilDark, 0.15),
        shade(deadC, PALETTE.shadow, 0.2), deadDark, 910 + i * 7);
    }
    // crumpled heart of the mound
    put(sway, 0, 1.1, 0, deadDark, 0.7);
    put(sway, 0.6, 1.45, 0.4, deadC, 0.55);
    put(sway, -0.5, 1.3, -0.5, deadC, 0.5);

    // shriveled pods still dangling off the collapsed stems
    const podDead = shade(pal.fruit, deadDark, 0.55);
    pod(sway, 1.7, 1.0, 1.4, 3, podDead);
    pod(sway, -1.9, 0.9, -0.9, 2, shade(podDead, PALETTE.shadow, 0.25));

    // dried leaf litter around the mound
    const rnd = rng(940);
    for (let i = 0; i < 8; i++) {
      put(stat, Math.round(rnd() * 5 - 2.5), 0.3, Math.round(rnd() * 5 - 2.5), deadDark, 0.35);
    }
    return finishPlant(stat, sway); // default dead factor 0.55
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 333);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const f = foliage(pal, 4);
    const edge = shade(f, pal.dark, 0.36);
    const vein = shade(f, pal.light, 0.4);
    const tired = shade(f, stressC, 0.2);

    // picked-spent stems: bent lower, still holding the bush shape
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[(i * 3 + 1) % 8];
      const sh = 3 - (i % 2);
      vline(stat, dx * 0.4, 0, dz * 0.4, dx * 1.1, sh, dz * 1.1, shade(pal.stem, stressC, 0.14));
      if (i % 2 === 0) {
        blade(sway, Math.round(dx * 1.1), sh, Math.round(dz * 1.1), dx || 1, dz || 0, 2, 2, 0.35, 0.12,
          tired, vein, edge, 970 + i * 7);
      }
    }

    // a few empty bloom remnants where flowers had set pods
    const spent = shade(pal.accent, stubC, 0.55);
    for (let i = 0; i < 3; i++) {
      const [dx, dz] = R8[(i * 5 + 2) % 8];
      flowerDot(sway, dx * 1.9, 2.6, dz * 1.9, spent, 0.4);
    }

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.55; // a spent half-bush, not ground stubble
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 333);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const f = shade(foliage(pal, 5), stressC, 0.26); // dark-yellowing foliage
    const edge = shade(f, pal.dark, 0.36);
    const vein = shade(f, pal.light, 0.4);

    const H = 5;
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = R8[i % 8];
      const sh = H - (i % 2);
      vline(stat, dx * 0.4, 0, dz * 0.4, dx * 1.1, sh, dz * 1.1, pal.stem);
      blade(sway, Math.round(dx * 1.1), sh, Math.round(dz * 1.1), dx || 1, dz || 0, 2, 2, 0.4, 0.12,
        i % 2 ? f : shade(f, pal.light, 0.1), vein, edge, 990 + i * 7);
    }

    // pod-heavy: fat over-scale fibrous pods dragging the bush down
    const overC = shade(pal.fruit, stubC, 0.4); // green gone tan/fibrous
    const fibC = shade(pal.fruit, pal.dark, 0.24);
    for (let i = 0; i < 9; i++) {
      const [dx, dz] = R8[(i * 5 + 2) % 8];
      const px = dx * 2.3;
      const pz = dz * 2.3;
      const py = H + 0.2 - (i % 3) * 0.5;
      for (let k = 0; k < 4; k++) {
        put(sway, px + (k === 3 ? 0.3 : 0), py - k * 0.8, pz + (k % 2 ? 0.14 : 0),
          k % 2 ? fibC : overC, 0.85);
      }
      put(sway, px + 0.42, py - 1.1, pz, overC, 0.48); // swollen seed bulge
    }
    return finishPlant(stat, sway); // default overripe factor 0.95
  },
};
