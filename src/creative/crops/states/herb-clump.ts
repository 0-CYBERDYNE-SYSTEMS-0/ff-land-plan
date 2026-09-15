/**
 * Lifecycle state builders for the `herb-clump` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: brown shrivelled collapse — brittle bare stems splayed out of a
 *    dried two-tone core, one snapped stem left pointing up.
 *  - harvested: basil regrowth cut — an even band of cut stubble across the
 *    clump base with pale sliced faces and a few tiny young-green regrowth
 *    dots between the stumps.
 *  - overripe: gone to seed — leggy yellowed bolt stems, bare below, ragged
 *    pal.accent flower columns with browning spent heads (marigold reads
 *    distinctly ragged because the foliage yellows around spent heads).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, blob, soilPad, finishPlant, flowerDot,
} from '../shared';
import type { ArchetypeStates } from '../shared';

export const herbClumpStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 555);

    const deadT = pal.dead ?? STATE_TONES.dead;
    const deadHi = shade(deadT, PALETTE.straw, 0.26);
    const deadLo = shade(deadT, PALETTE.shadow, 0.34);
    const stemDry = shade(deadT, PALETTE.soilDark, 0.45);

    // collapsed shrivelled core — wide, flat, two-tone
    blob(sway, 0, 1.25, 0, 1.9, 1.0, 1.9, deadT, deadLo, { seed: 41 });

    // brittle bare stems splayed out and down from the core
    const splay: Array<[number, number, number]> = [
      [1.6, 0.8, 1.2], [-1.5, 0.6, 1.0], [1.3, 0.5, -1.5], [-1.4, 0.9, -1.3], [0.2, 0.7, 1.7],
    ];
    for (const [tx, ty, tz] of splay) vline(stat, 0, 1.3, 0, tx, ty, tz, stemDry);
    // one snapped stem still pointing at the sky
    vline(stat, 0, 1.3, 0, 0.4, 3.2, -0.2, stemDry);

    // shrivelled curled leaf husks littering the core
    const rnd = rng(77);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.9 + rnd() * 1.0;
      put(sway, Math.cos(a) * r, 1.5 + rnd() * 0.7, Math.sin(a) * r,
        rnd() < 0.45 ? deadHi : deadLo, 0.5);
    }
    return finishPlant(stat, sway);
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 555);

    const stub = pal.stubble ?? STATE_TONES.stubble;
    const stubHi = shade(stub, PALETTE.straw, 0.4);
    const stubLo = shade(stub, PALETTE.soilDark, 0.3);

    // even cut-back stubble across the clump base (one shear band)
    const spots: Array<[number, number]> = [
      [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [2, 0], [-2, 0], [0, 2], [0, -2],
    ];
    spots.forEach(([sx, sz], i) => {
      const h = 1.0 + (i % 3) * 0.28;
      vline(stat, sx, 0.3, sz, sx, h, sz, i % 2 ? stub : stubLo);
      put(stat, sx, h + 0.35, sz, stubHi, 0.6); // pale sliced face
      // some stumps keep a second cut stalk beside them
      if (i % 3 === 0) put(stat, sx + 0.55, h - 0.25, sz, stubLo, 0.55);
    });

    // a few tiny young-green regrowth dots peeking between the stubble
    const regrow: Array<[number, number]> = [[0.7, -0.8], [-0.8, 0.6], [1.6, 0.9]];
    regrow.forEach(([rx, rz], i) => {
      put(sway, rx, 1.8 + (i % 2) * 0.3, rz, pal.young, 0.42);
    });
    return finishPlant(stat, sway);
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.5, 555);

    const stressT = pal.stress ?? STATE_TONES.stress;
    const bolt = shade(pal.stem, stressT, 0.55);           // yellowed bolt stems
    const leafLo = shade(pal.mature, stressT, 0.55);       // yellowing foliage
    const leafHi = shade(pal.mature, pal.light, 0.25);     // last healthy growth
    const spent = shade(pal.accent, PALETTE.soilDark, 0.5); // browning spent heads

    // leggy bolted stems — taller and sparser than harvest stage, leaning out
    const stems: Array<[number, number, number]> = [
      [0.5, 7.2, 0.2], [-0.4, 6.6, -0.5], [1.6, 5.9, 1.1], [-1.7, 5.6, 0.9],
      [1.2, 5.2, -1.5], [-1.1, 6.1, 1.4], [0.2, 4.6, -1.8],
    ];
    stems.forEach(([tx, sh, tz], i) => {
      vline(stat, 0, 0.4, 0, tx, sh, tz, bolt);
      // sparse yellowed leaves on the lower half only (bolting goes bare below)
      const leaves = 2 + (i % 2);
      for (let k = 0; k < leaves; k++) {
        put(sway, tx * (0.3 + 0.2 * k) + 0.5, 1.0 + k * 0.9, tz * (0.3 + 0.2 * k),
          k === 0 ? leafHi : leafLo, 0.7 - k * 0.12);
      }
      // ragged flower column climbing the tip, some heads already spent
      const rndS = rng(500 + i);
      for (let r = 0; r < 4; r++) {
        flowerDot(sway, tx * (0.85 + 0.05 * r), sh - 2.4 + 0.65 * r, tz * (0.85 + 0.05 * r),
          r === 1 && i % 2 === 0 ? spent : pal.accent, 0.38 + rndS() * 0.08);
      }
      flowerDot(sway, tx + 0.2, sh + 0.4, tz, i % 3 === 0 ? spent : pal.accent, 0.45);
    });

    // dropped spent petals littering the pad
    flowerDot(stat, -1.9, 0.45, 1.3, spent, 0.4);
    flowerDot(stat, 2.1, 0.45, -0.9, shade(spent, PALETTE.shadow, 0.3), 0.35);
    return finishPlant(stat, sway);
  },
};
