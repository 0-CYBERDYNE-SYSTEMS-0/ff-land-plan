/**
 * Lifecycle state builders for the `wheat` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts):
 *  - `(pal: CropPalette) => THREE.Group`, single pose, no stage axis.
 *  - Deterministic: parity/index dithering only, never Math.random.
 *  - All tones derive from pal fields + STATE_TONES (recolor-safe).
 *
 * States:
 *  - dead: storm-beaten grey-brown straw — tillers knee over part-way up and
 *    the tops fold to the ground (lodged), only spent empty husks at the tips.
 *  - harvested: the iconic cut field — one even, level-cut stubble row across
 *    the whole pad, straw tan, plus a single missed golden head on the ground.
 *  - overripe: still standing but past grace — lankier stems, darkened grain
 *    heads hanging heavily down beside each stem, awns splayed wide, and a few
 *    shattered grains already on the pad.
 */
import type { Voxel } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, soilPad, finishPlant, flowerDot,
  type ArchetypeStates,
} from '../shared';

/** Same tiller anchor ring as the stage builder (grains.ts RING). */
const RING: Array<[number, number]> = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [1, -2], [-2, 1]];

export const wheatStates: ArchetypeStates = {
  /** Lodged grey-brown straw: ~0.55 height, mass beaten outward and down. */
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.8, 505);
    const deadC = pal.dead ?? STATE_TONES.dead;
    const stemA = deadC;
    const stemB = shade(deadC, pal.dark, 0.28);
    for (let i = 0; i < 7; i++) {
      const [bx, bz] = RING[i];
      // storm bias: most tillers fold the same way, a couple beaten back
      const lean = i % 3 === 2 ? -1 : 1;
      // one last strand still reaching; the rest kneel at a third of the height
      const peak = i === 0 ? 7 : 3 + (i % 3);
      const mx = bx + lean;
      const mz = bz + (i % 3 === 1 ? 1 : 0);
      vline(sway, bx, 0, bz, mx, peak, mz, i % 2 ? stemA : stemB);
      // lodged: the top half folds out and down until the tip rests on the pad
      const tx = mx + lean;
      const tz = mz + (i % 3 === 1 ? 1 : 0);
      vline(sway, mx, peak, mz, tx, 1 + (i % 2), tz, i % 2 ? stemB : stemA);
      // spent, empty husk at the tip — nothing here worth harvesting
      put(sway, tx + 0.3, 1.9 + (i % 2) * 0.5, tz, shade(stemB, pal.dark, 0.3), 0.5);
    }
    // loose beaten straw lying flat on the pad
    put(sway, -1.6, 0.6, 1.8, stemB, 0.55);
    put(sway, -0.8, 0.55, 2.1, stemA, 0.5);
    put(sway, 1.9, 0.6, -1.6, stemB, 0.5);
    return finishPlant(stat, sway);
  },

  /** Even cut stubble row (straw tan) + one missed golden head on the ground. */
  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.8, 505);
    const stub = pal.stubble ?? STATE_TONES.stubble;
    const stalkA = stub;
    const stalkB = shade(stub, pal.dark, 0.14);
    const cutTop = shade(stub, pal.accent, 0.4); // bleached cut face
    for (let i = 0; i < RING.length; i++) {
      const [bx, bz] = RING[i];
      vline(sway, bx, 1, bz, bx, 3, bz, i % 2 ? stalkA : stalkB);
      // every stalk cut to the same level — the combine line
      put(sway, bx, 3.55, bz, cutTop, 0.72);
    }
    // the tell: one missed head lying in the stubble, gold against the straw
    for (let k = 0; k < 4; k++) {
      const grainC = k === 1 || k === 2 ? shade(pal.fruit, pal.unripe, 0.3) : pal.fruit;
      put(sway, -1.35 + k * 0.62, 0.72, -1.8, grainC, 0.68);
    }
    flowerDot(sway, -1.9, 0.85, -1.95, pal.accent, 0.3); // awns off the butt end
    flowerDot(sway, 1.35, 0.8, -1.7, pal.accent, 0.3);
    return finishPlant(stat, sway);
  },

  /** Standing shatter-risk crop: shepherd's-crook necks, heads hanging down
   *  beside the stems, darkened grain, shattered grains on the pad. */
  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 2.8, 505);
    const deadT = pal.dead ?? STATE_TONES.dead;
    // harvest-gold straw dried past grace toward grey-brown
    const stemC = shade(shade(pal.stem, pal.fruit, 0.55), deadT, 0.35);
    const headC = shade(pal.fruit, deadT, 0.5); // darkened grain tone
    const H = 12; // lankier than the s5 harvest peak
    for (let i = 0; i < RING.length; i++) {
      const [ox, oz] = RING[i];
      const lean = i % 2 ? 1 : -1;
      const stemCol = i % 2 ? stemC : shade(stemC, pal.dark, 0.15);
      vline(sway, ox, 0, oz, ox + lean, H - 2, oz, stemCol);
      // shepherd's-crook neck: the last span kicks out before the head falls
      const nx = ox + lean * 2;
      vline(sway, ox + lean, H - 2, oz, nx, H - 0.6, oz, stemCol);
      // heavy droop: the head arcs out from the neck and hangs down beside
      // the stem (ends ~4 below the tip) — unmistakable vs the healthy s5,
      // whose heads sit upright on top of each stem
      let hx = nx + 0.35;
      let hy = H - 0.9;
      for (let k = 0; k < 5; k++) {
        put(sway, hx, hy, oz + (k % 2 ? 0.4 : -0.4), headC, 0.85);
        put(sway, hx - 0.25, hy + 0.2, oz + (k % 2 ? -0.35 : 0.35), shade(headC, pal.light, 0.22), 0.6);
        // awns splayed wide, sweeping down along the hanging head
        flowerDot(sway, hx + (k % 2 ? 0.55 : -0.4), hy + (k < 2 ? 0.5 : -0.15), oz + 0.55, pal.accent, 0.28);
        hx += 0.5;
        hy -= 0.8;
      }
    }
    // shattered grains already on the pad — the shatter-risk read
    flowerDot(sway, -1.2, 0.45, 1.6, shade(headC, pal.dark, 0.2), 0.3);
    flowerDot(sway, 0.9, 0.42, 2.0, headC, 0.3);
    flowerDot(sway, 2.1, 0.45, -0.9, shade(headC, pal.dark, 0.2), 0.3);
    return finishPlant(stat, sway);
  },
};
