/**
 * Lifecycle state builders for the `cucurbit-vine` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: frost-killed collapse — black-brown vine mass slumped onto the bed,
 *    narrow shriveled leaves curling onto the soil, fruit dark and sunken.
 *  - harvested: picked-over — the sprawling vine REMAINS (heightFactor 0.5
 *    override; a cucurbit is its vine, not stubble), fruit gone, cut-stalk
 *    scars + spent blossoms marking where they sat.
 *  - overripe: one HUGE past-prime fruit (oversize vs healthy s5, coarser
 *    ribbing via stripe dither, `pal.fruit` shifted darker/yellower through
 *    the stress tone), foliage yellowing and drooping.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): single pose,
 * deterministic (seeded rng only), fruit/flower hues derived from pal fields
 * so melon/cucumber/zucchini recolors survive, assembled via finishPlant.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import type { ArchetypeStates } from '../shared';
import {
  STATE_TONES, foliage, shade, put, vline, blob, blade, tendril, flowerDot,
  soilPadEllipse, finishPlant,
} from '../shared';

/** Same deterministic vine path as the stage builder (vines.ts vineAt). */
const vineAt = (i: number): [number, number] => [
  Math.round(i * 0.62),
  Math.round(Math.sin(i * 0.85) * 1.35),
];

const RUN = 12; // mature s5 runner length

export const cucurbitVineStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPadEllipse(stat, 4 + 5 * 0.7, 3 + 5 * 0.35, 111); // the mature bed

    const deadC = pal.dead ?? STATE_TONES.dead;
    const deadDark = shade(deadC, PALETTE.shadow, 0.5);
    const stemDead = shade(deadC, PALETTE.soilDark, 0.25);

    // frost-flattened runner sunk against the soil
    for (let i = 0; i <= RUN; i++) {
      const [vx, vz] = vineAt(i);
      put(sway, vx, 0.42, vz, i % 2 ? stemDead : deadDark, 0.8);
    }

    // shriveled leaves — narrow blades curling down onto the soil
    for (let i = 0; i < 6; i++) {
      const [lx, lz] = vineAt(1 + i * 2);
      const side = i % 2 === 0 ? 1 : -1;
      blade(sway, lx, 1.0, lz, side, 0, 3, 2, 0.2, 0.16,
        i % 2 ? deadC : shade(deadC, PALETTE.soilDark, 0.18),
        shade(deadC, PALETTE.shadow, 0.2), deadDark, 610 + i * 9);
    }
    // dead curled tendrils sagging from two nodes
    const [t1x, t1z] = vineAt(3);
    tendril(sway, t1x, 0.3, t1z, 1, 0, 4, stemDead);
    const [t2x, t2z] = vineAt(9);
    tendril(sway, t2x, 0.3, t2z, -1, 0, 4, stemDead);

    // fruit dark and sunken — a collapsed dome half-buried in the bed
    const [bx, bz] = vineAt(RUN - 2);
    const fruitDead = shade(pal.fruit, deadDark, 0.6);
    blob(sway, bx + 1, 0.75, bz + 1, 2.0, 1.15, 1.8, fruitDead,
      shade(fruitDead, PALETTE.shadow, 0.35), { seed: 62 });
    const [sx, sz] = vineAt(3);
    blob(sway, sx, 0.65, sz + 1.2, 0.9, 0.6, 0.8,
      shade(fruitDead, PALETTE.shadow, 0.2), null, { seed: 63 });

    // dried leaf litter crumbled across the bed
    const rnd = rng(410);
    for (let i = 0; i < 12; i++) {
      put(stat, Math.round(rnd() * 12 - 3), 0.3, Math.round(rnd() * 8 - 4), deadDark, 0.38);
    }
    return finishPlant(stat, sway); // default dead factor 0.55
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPadEllipse(stat, 4 + 5 * 0.7, 3 + 5 * 0.35, 111);

    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = foliage(pal, 5);
    const edge = shade(f, pal.dark, 0.38);
    const vein = shade(f, pal.light, 0.4);

    // the picked-over vine keeps its runner and tendrils
    for (let i = 0; i <= RUN; i++) {
      const [vx, vz] = vineAt(i);
      put(sway, vx, 0.65, vz,
        i % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : shade(pal.stem, stressC, 0.1), 0.85);
    }
    for (const node of [3, 6, 9]) {
      const [nx, nz] = vineAt(node);
      tendril(sway, nx, 1.1, nz, node % 2 ? 1 : -1, 0, 3, shade(pal.stem, pal.light, 0.2));
    }

    // foliage remains — a touch tired and droopier than harvest day
    for (let i = 0; i < 5; i++) {
      const [lx, lz] = vineAt(2 + i * 2);
      const side = i % 2 === 0 ? 1 : -1;
      const tired = shade(f, stressC, 0.14 + (i % 2) * 0.1);
      blade(sway, lx, 1.15, lz, side, 0, 4, 4, 0.45, 0.1, tired, vein, edge, 730 + i * 9);
      if (i % 2 === 0) {
        blade(sway, lx, 0.95, lz, 0, side, 3, 3, 0.3, 0.12,
          shade(tired, pal.dark, 0.12), vein, edge, 760 + i * 7);
      }
    }

    // where the fruit sat: cut stalk stubs with pale cut faces and scar rings
    const [bx, bz] = vineAt(RUN - 2);
    vline(sway, bx + 1, 0.9, bz + 1, bx + 1, 1.8, bz + 1, shade(pal.stem, pal.dark, 0.3));
    put(sway, bx + 1, 2.0, bz + 1, stubC, 0.5);
    flowerDot(sway, bx + 1, 1.05, bz + 1, shade(pal.fruit, stubC, 0.55), 0.4);
    const [s2x, s2z] = vineAt(3);
    vline(sway, s2x, 0.8, s2z + 1.2, s2x, 1.3, s2z + 1.2, shade(pal.stem, pal.dark, 0.3));
    put(sway, s2x, 1.5, s2z + 1.2, stubC, 0.42);

    // a couple of spent blossoms browning off by the runner tip
    const spent = shade(pal.accent, stubC, 0.55);
    const [tx, tz] = vineAt(RUN);
    flowerDot(sway, tx, 1.15, tz + 1.6, spent, 0.5);
    flowerDot(sway, tx - 1, 0.55, tz + 1, shade(spent, PALETTE.shadow, 0.25), 0.4);

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.5; // the vine remains — keep most of the sprawl
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPadEllipse(stat, 4 + 5 * 0.7, 3 + 5 * 0.35, 111);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = foliage(pal, 5);
    const vein = shade(f, pal.light, 0.4);

    // runner + tendrils remain
    for (let i = 0; i <= RUN; i++) {
      const [vx, vz] = vineAt(i);
      put(sway, vx, 0.65, vz, i % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem, 0.85);
    }
    const [t1x, t1z] = vineAt(4);
    tendril(sway, t1x, 1.1, t1z, 1, 0, 3, shade(pal.stem, pal.light, 0.25));
    const [t2x, t2z] = vineAt(8);
    tendril(sway, t2x, 1.1, t2z, -1, 0, 3, shade(pal.stem, pal.light, 0.25));

    // yellowing foliage — oldest leaves deepest past-prime, tips drooping
    for (let i = 0; i < 6; i++) {
      const [lx, lz] = vineAt(1 + i * 2);
      const side = i % 2 === 0 ? 1 : -1;
      const yellow = shade(f, stressC, 0.45 - i * 0.05);
      blade(sway, lx, 1.15, lz, side, 0, 4, 4, 0.4, 0.12,
        yellow, vein, shade(yellow, pal.dark, 0.3), 820 + i * 9);
    }

    // THE over-mature fruit — huge, coarsely ribbed, past-prime skin
    const [bx, bz] = vineAt(RUN - 2);
    const past = shade(pal.fruit, stressC, 0.3); // darker/yellower past-prime
    blob(sway, bx + 1, 1.8, bz + 1, 3.3, 2.2, 3.0, past,
      shade(pal.fruit, pal.dark, 0.32), { seed: 62, stripe: true });
    blob(sway, bx + 1, 3.7, bz + 1, 1.0, 0.45, 0.9, shade(past, 0xffffff, 0.1), null); // dull sheen
    vline(sway, bx + 1, 3.85, bz + 1, bx + 1, 4.45, bz + 1, shade(pal.stem, pal.dark, 0.3)); // corky stalk
    put(sway, bx + 1.8, 4.1, bz + 1, stressC, 0.4);               // wilted leaf on the stalk
    flowerDot(sway, bx + 1, 4.55, bz + 1, PALETTE.soilDark, 0.35); // shriveled blossom end
    return finishPlant(stat, sway); // default overripe factor 0.95
  },
};
