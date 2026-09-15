/**
 * Lifecycle state builders for the `legume-trellis` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 * The trellis is a static structure — every state keeps the posts + crossbar
 * and sets `userData.heightFactor = 1` so the renderer does not shrink it:
 * the VINE dies or gets picked, the trellis stays.
 *
 *  - dead: brown shriveled strands that climb part-way then peel off and
 *    droop to the ground; sparse shriveled leaflets; leaf litter at the base.
 *  - harvested: green-but-spent vines still fully climbing, pods GONE,
 *    papery blossom remnants where they hung, foliage yellowing at the base.
 *  - overripe: bulging, over-long pods streaked yellow/tan (`pal.fruit`
 *    toward the stubble tone) dragging the full vine, base yellowing.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): single pose,
 * deterministic (seeded rng only), fruit/flower hues derived from pal fields
 * (pea vs bean recolors survive), assembled via finishPlant.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import type { ArchetypeStates } from '../shared';
import {
  STATE_TONES, foliage, shade, put, vline, tendril, flowerDot, soilPad, finishPlant,
} from '../shared';

/** Same weave as the stage builder (vines.ts): strand x at height y. */
const weaveX = (y: number, phase: number): number => Math.round(Math.sin((y + phase) * 0.72) * 1.9);
const weaveZ = (y: number, zOff: number): number => zOff + Math.round(Math.cos(y * 0.6) * 0.5);

/** Static trellis + soil — identical to the healthy build (never shrinks). */
function trellisAndPad(stat: Voxel[]): void {
  soilPad(stat, 3, 223);
  const postH = 11;
  for (const px of [-3, 3]) {
    vline(stat, px, 0, 0, px, postH, 0, PALETTE.wood);
    put(stat, px, postH + 0.4, 0, PALETTE.woodLight, 0.7); // capped post
  }
  vline(stat, -3, postH, 0, 3, postH, 0, PALETTE.woodDark);
}

export const legumeTrellisStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    trellisAndPad(stat);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const vineDead = shade(deadC, PALETTE.soilDark, 0.22);
    const vineDark = shade(vineDead, PALETTE.shadow, 0.3);
    const leafDead = shade(deadC, PALETTE.shadow, 0.28);

    // shriveled strands: climb part-way, then peel off and droop to the ground
    for (let strand = 0; strand < 2; strand++) {
      const phase = strand * 1.4;
      const zOff = strand === 0 ? 0 : 0.8;
      const topY = 6 + strand; // one strand gives up higher than the other
      for (let y = 0; y <= topY; y++) {
        put(stat, weaveX(y, phase), y, weaveZ(y, zOff),
          y % 3 === 0 ? vineDark : vineDead);
      }
      const topX = weaveX(topY, phase);
      const dir = topX >= 0 ? 1 : -1;
      for (let t = 0; t <= 8; t++) {
        const y = topY - t * 0.72 + Math.sin(t * 0.9) * 0.3;
        if (y < 0.4) break;
        const dx = Math.round(topX + dir * t * 0.55);
        const dy = Math.round(y);
        const dz = 1.2 + strand * 0.5;
        put(sway, dx, dy, dz, t > 4 ? vineDark : vineDead, 0.8);
        // shriveled leaflets still clinging along the sag
        if (t % 2 === 0) put(sway, dx, dy + 0.4, dz + 0.4, leafDead, 0.45);
      }
      // dead tendril curls at the last living node
      tendril(sway, weaveX(topY - 2, phase), topY - 1.4, zOff, dir, 0, 3, vineDead);
    }

    // sparse shriveled leaflets clinging to the lower climb
    for (let y = 2; y <= 6; y++) {
      for (let strand = 0; strand < 2; strand++) {
        if ((y + strand) % 2) continue;
        const wx = weaveX(y, strand * 1.4);
        const wz = weaveZ(y, strand === 0 ? 0 : 0.8);
        const dirX = wx >= 0 ? 1 : -1;
        put(sway, wx + dirX, y + 0.4, wz, leafDead, 0.55);
        put(sway, wx + dirX * 1.5, y + 0.6, wz, shade(leafDead, PALETTE.shadow, 0.2), 0.42);
        put(sway, wx - dirX, y + 0.25, wz, shade(leafDead, PALETTE.shadow, 0.3), 0.42);
      }
    }

    // fallen leaf litter at the base of the posts
    const rnd = rng(510);
    for (let i = 0; i < 9; i++) {
      put(stat, Math.round(rnd() * 7 - 3.5), 0.32, Math.round(rnd() * 3.4 - 1.7), leafDead, 0.4);
    }

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1; // the trellis stays — only the vine died
    return g;
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    trellisAndPad(stat);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const f = foliage(pal, 5);
    const edge = shade(f, pal.dark, 0.36);

    // green-but-spent vines still climb the full trellis
    for (let strand = 0; strand < 2; strand++) {
      const phase = strand * 1.4;
      const zOff = strand === 0 ? 0 : 0.8;
      for (let y = 0; y <= 11; y++) {
        put(stat, weaveX(y, phase), y, weaveZ(y, zOff),
          y % 4 === 0 ? shade(pal.stem, pal.dark, 0.22) : shade(pal.stem, stressC, 0.12));
      }
    }

    // thinner foliage: leaflets drooping low, yellowing toward the base
    for (let y = 2; y <= 10; y++) {
      if (y % 4 === 1) continue; // a picked-over vine carries less leaf
      const strand = y % 2;
      const wx = weaveX(y, strand * 1.4);
      const wz = weaveZ(y, strand === 0 ? 0 : 0.8);
      const dirX = wx >= 0 ? 1 : -1;
      const leafC = shade(f, stressC, Math.max(0, (6 - y) / 10) * 0.55);
      put(sway, wx + dirX, y + 0.3, wz, leafC, 0.8);
      put(sway, wx + dirX * 1.7, y + 0.45, wz, edge, 0.6);
      put(sway, wx - dirX, y + 0.2, wz, shade(leafC, pal.dark, 0.15), 0.7);
    }

    // empty blossom remnants — papery husks where the pods hung
    const spent = shade(pal.accent, stubC, 0.6);
    for (let i = 0; i < 5; i++) {
      const py = 3 + (i % 4) * 2;
      const pxx = weaveX(py, 0) + (i % 2 ? 0.6 : -0.6);
      const pzz = 1.15 + (i % 3) * 0.2;
      flowerDot(sway, pxx, py + 0.55, pzz, spent, 0.5);
      flowerDot(sway, pxx - 0.35, py + 0.15, pzz, shade(spent, PALETTE.shadow, 0.25), 0.34);
    }

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1; // trellis + spent vines stay full size
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    trellisAndPad(stat);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const f = foliage(pal, 5);

    // full healthy weave with leaflets, yellowing only at the base
    for (let strand = 0; strand < 2; strand++) {
      const phase = strand * 1.4;
      const zOff = strand === 0 ? 0 : 0.8;
      for (let y = 0; y <= 11; y++) {
        const wx = weaveX(y, phase);
        const wz = weaveZ(y, zOff);
        put(stat, wx, y, wz, y % 4 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem);
        if (y >= 2 && (y + strand) % 2 === 0) {
          const dirX = wx >= 0 ? 1 : -1;
          const leafC = shade(f, stressC, Math.max(0, (6 - y) / 9) * 0.5);
          put(sway, wx + dirX, y + 0.5, wz, leafC, 0.85);
          put(sway, wx + dirX * 1.8, y + 0.8, wz, shade(leafC, pal.light, 0.25), 0.65);
          put(sway, wx - dirX, y + 0.35, wz, shade(leafC, pal.dark, 0.15), 0.75);
        }
      }
    }

    // bulging overripe pods — fat, over-long, yellow-streaked, hanging heavy
    const overC = shade(pal.fruit, stubC, 0.42); // pod green gone yellow/tan
    const streakC = shade(pal.fruit, pal.dark, 0.22);
    for (let i = 0; i < 8; i++) {
      const py = 3 + (i % 4) * 2;
      const pxx = weaveX(py, 0) + (i % 2 ? 0.7 : -0.7);
      const pzz = 1.15 + (i % 3) * 0.22;
      for (let k = 0; k < 4; k++) {
        put(sway, pxx + (k === 3 ? 0.3 : 0), py + 0.6 - k * 0.8, pzz + (k % 2 ? 0.14 : 0),
          k % 2 ? streakC : overC, 0.88);
      }
      // swollen seed bulges breaking the pod line
      put(sway, pxx + 0.45, py - 0.9, pzz, overC, 0.5);
      put(sway, pxx - 0.4, py - 1.5, pzz + 0.1, streakC, 0.42);
    }

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1; // trellis stays full size
    return g;
  },
};
