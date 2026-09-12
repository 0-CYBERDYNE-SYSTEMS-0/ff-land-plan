/**
 * Lifecycle state builders for the `corn` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2). Also backs Sunflower via recolor — every
 * tone derives from pal fields + STATE_TONES only, never PALETTE constants.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts):
 *  - `(pal: CropPalette) => THREE.Group`, single pose, no stage axis.
 *  - Deterministic: fixed blade seeds + index dithering, never Math.random.
 *
 * States:
 *  - dead: storm-lodged collapse (wheat-style) — only the bottom third of the
 *    stalk still stands, braced at the roots; everything above breaks at
 *    mid-height and folds toward the ground into a near-horizontal brown
 *    mass, papery leaves hanging limp off the wreckage, tassel dragging near
 *    the soil, shriveled ear drooping under the fallen stalk. heightFactor
 *    0.4 — a collapsed plant must read INSTANTLY shorter than overripe.
 *  - harvested: stalks cut to stumps — three flat-cut stumps with pale cut
 *    faces + hollow pith dots, shredded husks littering the pad.
 *  - overripe: dent-corn dry-down — still fully STANDING (the contrast with
 *    dead is orientation, not just hue): upright tan stalk, leaves arcing
 *    down but attached, straw tassel flared flat, hero ear hanging heavy with
 *    husks peeled back exposing dark dent kernels and browned silk, a second
 *    smaller ear up-stalk, one ear already dropped on the pad.
 */
import type { Voxel } from '@/creative/voxel';
import {
  STATE_TONES, shade, put, vline, soilPad, finishPlant, flowerDot, blade,
  type ArchetypeStates,
} from '../shared';

const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export const cornStates: ArchetypeStates = {
  /** Lodged wreckage: bottom third stands braced, the rest folds to the soil. */
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 606);
    const deadC = pal.dead ?? STATE_TONES.dead;
    const stalkC = shade(pal.stem, deadC, 0.7);
    const stalkD = shade(stalkC, pal.dark, 0.3);
    // wheat-style lodging: only the bottom third of the healthy 13-voxel
    // stalk still stands, node-banded, brace roots still gripping the soil
    const H = 4;
    for (let y = 0; y <= H; y++) put(stat, 0, y, 0, y % 3 === 0 ? stalkD : stalkC);
    put(stat, 0.8, 0, 0.3, stalkD, 0.6);
    put(stat, -0.5, 0, -0.7, stalkD, 0.6);
    put(stat, -0.7, 0.35, 0.8, stalkD, 0.55);
    // the break: the stalk kinks just above the stump and everything above
    // folds out and down — a descending run, then near-horizontal with the
    // tip dragging on the pad (unmistakably NOT a standing plant)
    vline(sway, 0, H + 1, 0, 3, H, 1, stalkD);
    vline(sway, 3, H, 1, 7, 2, 2, stalkC);
    vline(sway, 7, 2, 2, 10, 1, 3, stalkD);
    // papery dead leaves hang LIMP off the wreckage — anchored on the fallen
    // run and the standing stump, each drapes down to near the soil
    const leafC = shade(deadC, pal.dark, 0.15);
    const leafV = shade(leafC, STATE_TONES.stubble, 0.3);
    const leafE = shade(deadC, pal.dark, 0.42);
    blade(sway, 2, H, 1, 0, 1, 3, 2, 0.15, 0.38, leafC, leafV, leafE, 410);
    blade(sway, 5, 3, 1, 0, -1, 3, 2, 0.12, 0.3, leafC, leafV, leafE, 423);
    blade(sway, 6, 2, 2, 0, 1, 3, 2, 0.1, 0.2, leafC, leafV, leafE, 436);
    blade(sway, 8, 1, 2, 0, -1, 2, 2, 0.08, 0.12, leafC, leafV, leafE, 449);
    blade(sway, 1, H + 1, 0, -1, 0, 3, 2, 0.05, 0.3, shade(leafC, deadC, 0.2), leafV, leafE, 462);
    blade(sway, 0, 2, 0, 1, 0, 3, 2, 0.12, 0.2, leafC, leafV, leafE, 475);
    blade(sway, 0, 3, 0, 0, -1, 2, 2, 0.1, 0.18, leafC, leafV, leafE, 488);
    // shriveled ear drooping on its dry shank off the UNDERSIDE of the run
    const cobC = shade(pal.fruit, deadC, 0.55);
    put(sway, 5.2, 2.4, 1.3, shade(stalkD, pal.dark, 0.1), 0.55);
    put(sway, 5.5, 1.5, 1.8, cobC, 0.75);
    put(sway, 5.9, 0.9, 2.3, shade(cobC, pal.dark, 0.3), 0.65);
    flowerDot(sway, 6.2, 0.55, 2.7, shade(cobC, pal.dark, 0.45), 0.45);
    // bleached tassel dragging near the soil at the tip of the fallen stalk
    const tasselC = shade(pal.accent, STATE_TONES.stubble, 0.55);
    put(sway, 10.4, 0.9, 3.3, tasselC, 0.6);
    flowerDot(sway, 10.9, 0.7, 3.8, shade(tasselC, pal.unripe, 0.3), 0.35);
    flowerDot(sway, 10.6, 0.55, 4.3, tasselC, 0.3);
    flowerDot(sway, 11.3, 0.6, 3.1, shade(tasselC, pal.unripe, 0.3), 0.28);
    // loose papery fragments beaten off onto the pad
    put(sway, -1.8, 0.5, 1.4, leafE, 0.5);
    put(sway, -1.1, 0.45, -1.9, leafC, 0.45);
    put(sway, 2.2, 0.5, -1.6, leafE, 0.45);
    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.4; // a lodged mass — far below overripe's 0.95
    return g;
  },

  /** Cut-to-stumps field: flat-cut stumps with pale faces + husk shreds. */
  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 606);
    const stub = pal.stubble ?? STATE_TONES.stubble;
    const stalkA = stub;
    const stalkB = shade(stub, pal.dark, 0.16);
    const cutTop = shade(stub, pal.accent, 0.35); // bleached cut face
    const pith = shade(stub, pal.dark, 0.45);     // hollow stalk center
    // main stalk + two suckers, all cut — reads as a harvested stand at a glance
    const stumps: Array<[number, number, number]> = [[0, 0, 4], [2, -1, 3], [-1, 2, 2]];
    stumps.forEach(([sx, sz, sh], i) => {
      const c = i % 2 ? stalkB : stalkA;
      for (let y = 0; y <= sh; y++) put(stat, sx, y, sz, y % 3 === 0 ? stalkB : c);
      put(stat, sx, sh + 0.55, sz, cutTop, 0.78);
      put(stat, sx, sh + 0.95, sz, pith, 0.32);
    });
    // shredded husk debris littering the pad
    put(sway, 2.4, 0.55, 1.4, shade(stub, pal.accent, 0.25), 0.6);
    put(sway, -2.3, 0.5, -1.2, shade(stub, pal.dark, 0.2), 0.55);
    put(sway, -0.6, 0.55, 2.4, shade(stub, pal.accent, 0.35), 0.5);
    put(sway, 0.9, 0.5, -2.5, stalkB, 0.5);
    return finishPlant(stat, sway);
  },

  /** Dent-corn dry-down: fully STANDING tan plant, hero ear, husks peeled. */
  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 606);
    const deadT = pal.dead ?? STATE_TONES.dead;
    const stub = pal.stubble ?? STATE_TONES.stubble;
    const stalkC = shade(pal.stem, stub, 0.6); // whole plant gone tan
    const stalkD = shade(stalkC, pal.dark, 0.28);
    const H = 13; // still fully upright — dry-down, never a collapse
    for (let y = 0; y <= H; y++) put(stat, 0, y, 0, y % 3 === 0 ? stalkD : stalkC);
    put(stat, 0.8, 0, 0.3, stalkD, 0.6);
    put(stat, -0.5, 0, -0.7, stalkD, 0.6);
    // leaves drooping-but-ATTACHED: each still launches off its node, arcs
    // over, and hands its tip back down — sagging, never collapsed (the
    // dead state's leaves lie limp on a fallen mass instead)
    const leafC = shade(pal.mature, stub, 0.55);
    const leafV = shade(leafC, pal.light, 0.3);
    const leafE = shade(leafC, deadT, 0.35);
    const blades: Array<{ by: number; len: number; d: number }> = [
      { by: 3, len: 6, d: 0 }, { by: 4, len: 6, d: 1 }, { by: 5, len: 7, d: 2 },
      { by: 7, len: 8, d: 3 }, { by: 8, len: 8, d: 0 }, { by: 10, len: 8, d: 1 },
    ];
    blades.forEach(({ by, len, d }, i) => {
      const arcA = 0.65;                  // a real launch off the node
      const drop = by <= 5 ? 1.5 : 2.4;   // tip hands back down, stays aloft
      const arcB = (arcA * len + drop) / (len * len);
      blade(sway, 0, by, 0, DIRS[d][0], DIRS[d][1], len, 3, arcA, arcB, leafC, leafV, leafE, 520 + i * 17);
    });
    // straw-bleached tassel with rays flared flat (healthy rays rise by L)
    const tasselC = shade(shade(pal.accent, stub, 0.5), deadT, 0.2);
    vline(sway, 0, H, 0, 0, H + 2, 0, tasselC);
    DIRS.forEach(([dx, dz], i) => {
      const L = 2 + (i % 2);
      const rayY = H + 1 + Math.round(L * 0.25);
      vline(sway, 0, H + 1, 0, dx * L, rayY, dz * L, i % 2 ? tasselC : shade(tasselC, pal.fruit, 0.3));
      flowerDot(sway, dx * (L + 0.3), rayY + 0.35, dz * (L + 0.3), shade(tasselC, pal.fruit, 0.45), 0.3);
    });
    // HERO ear: heavy and long, angled out and drooping on the open diagonal,
    // husks peeled back at the base, dark dent kernels exposed, browned silk
    const ey = 5;
    const huskC = shade(pal.mature, stub, 0.7);
    const cobC = shade(pal.fruit, deadT, 0.45);
    const kernelD = shade(cobC, pal.dark, 0.4);
    put(sway, 0.6, ey, 0.6, shade(stalkD, pal.dark, 0.1), 0.7); // dry shank
    const pts: Array<[number, number, number]> = [
      [1.1, ey + 0.5, 1.1], [1.65, ey + 0.55, 1.65], [2.2, ey + 0.35, 2.2],
      [2.75, ey - 0.1, 2.75], [3.3, ey - 0.7, 3.3], [3.8, ey - 1.4, 3.8],
    ];
    pts.forEach(([ex, eyy, ez], k) => {
      const c = k === 0 ? huskC : k === 1 ? shade(cobC, huskC, 0.35) : cobC;
      put(sway, ex, eyy, ez, c, 1);
      // flanking wrapper gives the fat-cob girth
      put(sway, ex + 0.55, eyy, ez - 0.55, k <= 1 ? huskC : shade(cobC, huskC, 0.4), 0.6);
    });
    // dark dry kernel pips studding the exposed upper face — the hero read
    flowerDot(sway, 2.55, ey + 0.55, 2.55, kernelD, 0.42);
    flowerDot(sway, 3.1, ey + 0.05, 3.1, kernelD, 0.42);
    flowerDot(sway, 3.65, ey - 0.55, 3.65, kernelD, 0.4);
    flowerDot(sway, 4.05, ey - 1.2, 4.05, kernelD, 0.38);
    // husks peeled back: flared wings + a hanging tail chained to the base
    put(sway, 0.85, ey + 1.1, 1.45, huskC, 0.7);
    put(sway, 1.45, ey + 1.15, 0.85, huskC, 0.65);
    put(sway, 0.8, ey + 0.4, 1.7, shade(huskC, deadT, 0.25), 0.6);
    put(sway, 0.75, ey - 0.3, 1.85, shade(huskC, deadT, 0.3), 0.55);
    // browned silk streaming off the drooping tip corner (chained, anchored)
    const silkC = shade(pal.accent, deadT, 0.55);
    flowerDot(sway, 4.15, ey - 1.7, 4.05, silkC, 0.32);
    flowerDot(sway, 4.35, ey - 1.95, 4.15, silkC, 0.3);
    flowerDot(sway, 4.5, ey - 2.15, 4.3, silkC, 0.28);
    // a second, smaller dry ear on the opposite diagonal — heavy dry-down read
    put(sway, -0.6, 8, -0.6, shade(stalkD, pal.dark, 0.1), 0.6);
    put(sway, -1.2, 8.1, -1.2, huskC, 0.8);
    put(sway, -1.75, 7.75, -1.75, cobC, 0.85);
    put(sway, -2.2, 7.25, -2.2, shade(cobC, pal.dark, 0.25), 0.75);
    flowerDot(sway, -2.05, 7.5, -2.05, kernelD, 0.35);
    // one ear already dropped on the pad — lying flat, kernels skyward
    put(sway, 2.1, 0.5, -1.5, huskC, 0.85);
    put(sway, 2.75, 0.45, -1.2, cobC, 0.85);
    put(sway, 3.4, 0.5, -0.9, shade(cobC, pal.dark, 0.2), 0.8);
    flowerDot(sway, 2.45, 1.0, -1.35, kernelD, 0.35);
    flowerDot(sway, 3.05, 0.95, -1.05, kernelD, 0.35);
    // a couple of kernels already shelled onto the pad
    flowerDot(sway, 1.6, 0.45, 1.9, kernelD, 0.32);
    flowerDot(sway, 1.2, 0.4, 2.4, shade(kernelD, pal.dark, 0.25), 0.3);
    // flag leaf above the ear, arcing over like the rest
    blade(sway, 1, ey + 3, 1, 1, 0, 3, 2, 0.7, 0.12, leafC, leafV, leafE, 599);
    return finishPlant(stat, sway);
  },
};
