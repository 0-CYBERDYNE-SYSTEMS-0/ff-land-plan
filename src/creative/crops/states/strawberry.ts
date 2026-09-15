/**
 * Lifecycle state builders for the `strawberry` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2).
 *
 *  - dead: brown shriveled crown — petioles collapsed flat around a burnt-out
 *    heart, dead runner with a shriveled plantlet.
 *  - harvested: picked — a healthy-ish crown back in flower (heightFactor 0.8
 *    override: only the berries are gone, the plant remains), calyx scars
 *    where they were pulled, one runner heading out. NO red berries.
 *  - overripe: dark maroon-blackened berries (`pal.fruit` mixed toward
 *    shadow), slightly oversize and sagging low, foliage dulled, no gloss.
 *
 * Contract (quality/QUALITY_BAR.md Lane B + shared.ts): single pose,
 * deterministic (no rng needed — pure loops), fruit/flower hues derived from
 * pal fields, assembled via finishPlant.
 */
import { PALETTE, Voxel } from '@/creative/voxel';
import type { ArchetypeStates } from '../shared';
import {
  STATE_TONES, foliage, shade, put, vline, flowerDot,
  soilPad, finishPlant,
} from '../shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

export const strawberryStates: ArchetypeStates = {
  dead: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 444);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const petDead = shade(deadC, PALETTE.soilDark, 0.2);
    const leafDead = shade(deadC, PALETTE.shadow, 0.3);

    // shriveled crown: petioles collapsed flat around the dead heart
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[i % 8];
      vline(sway, 0, 0.5, 0, dx * 1.6, 0.35, dz * 1.6, petDead);
      put(sway, dx * 1.6, 0.5, dz * 1.6, deadC, 0.5);
      put(sway, dx * 1.6 + (dz ? 0.8 : 0.6), 0.38, dz * 1.6 + (dx ? 0.8 : 0.6), leafDead, 0.38);
    }
    put(sway, 0, 0.62, 0, leafDead, 0.5); // burnt-out crown heart

    // dead runner with a shriveled plantlet
    vline(sway, 0, 0.4, 2.2, 4, 0.4, 2.8, petDead);
    put(sway, 4, 0.5, 2.8, leafDead, 0.42);
    put(stat, 4, 0.15, 2.8, PALETTE.soilDark, 0.4);
    return finishPlant(stat, sway); // default dead factor 0.55
  },

  harvested: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 444);

    const f = foliage(pal, 4);
    const edge = shade(f, pal.dark, 0.36);
    const vein = shade(f, pal.light, 0.42);

    // healthy-ish trifoliate crown (same leaf DNA as the stage builder)
    const triLeaf = (dx: number, dz: number, len: number): void => {
      const ex = Math.round(dx * len);
      const ez = Math.round(dz * len);
      vline(sway, 0, 0.6, 0, ex, 0.6 + len * 0.4, ez, vein);
      const ty = 0.6 + len * 0.4;
      put(sway, ex, ty + 0.5, ez, f, 0.8);
      put(sway, ex + (dz ? 1 : 0.8), ty, ez + (dx ? 1 : 0.8), edge, 0.65);
      put(sway, ex - (dz ? 1 : 0.8), ty, ez - (dx ? 1 : 0.8), edge, 0.65);
    };
    for (let i = 0; i < 7; i++) {
      const [dx, dz] = R8[i % 8];
      triLeaf(dx, dz, i % 2 ? 2 : 1);
    }
    put(sway, 0, 1.4, 0, shade(f, pal.light, 0.4), 0.6); // crown bud

    // back in flower — the berries are all picked (bigger-than-seed blooms so
    // the white reads at map distance)
    for (let i = 0; i < 3; i++) {
      const [dx, dz] = R8[(i * 3 + 1) % 8];
      const bx = dx * 2.1;
      const bz = dz * 2.1;
      flowerDot(sway, bx, 1.45, bz, PALETTE.flowerYellow, 0.4);
      flowerDot(sway, bx + 0.66, 1.45, bz, pal.accent, 0.52);
      flowerDot(sway, bx - 0.66, 1.45, bz, pal.accent, 0.52);
      flowerDot(sway, bx, 1.45, bz + 0.66, pal.accent, 0.52);
      flowerDot(sway, bx, 1.45, bz - 0.66, pal.accent, 0.52);
    }

    // calyx scars on short stubs where berries were pulled
    for (let i = 0; i < 3; i++) {
      const [dx, dz] = R8[(i * 4 + 2) % 8];
      vline(sway, dx * 1.8, 0.55, dz * 1.8, dx * 2.05, 1.0, dz * 2.05, pal.stem);
      flowerDot(sway, dx * 2.05, 1.1, dz * 2.05, shade(f, pal.dark, 0.25), 0.34);
    }

    // one runner heading out
    vline(sway, 0, 0.55, 2.2, -4, 0.55, 2.8, pal.stem);
    put(sway, -4, 0.95, 2.8, shade(f, pal.young, 0.4), 0.65);
    put(sway, -4.6, 0.7, 2.8, shade(f, pal.young, 0.2), 0.5);
    put(stat, -4, 0.15, 2.8, PALETTE.soilDark, 0.4); // rooting node

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.8; // only the berries are gone — crown remains
    return g;
  },

  overripe: (pal) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 444);

    const stressC = pal.stress ?? STATE_TONES.stress;
    const f = shade(foliage(pal, 5), stressC, 0.22); // dulled foliage
    const edge = shade(f, pal.dark, 0.36);
    const vein = shade(f, pal.light, 0.42);

    const triLeaf = (dx: number, dz: number, len: number): void => {
      const ex = Math.round(dx * len);
      const ez = Math.round(dz * len);
      vline(sway, 0, 0.55, 0, ex, 0.5 + len * 0.32, ez, vein);
      const ty = 0.5 + len * 0.32;
      put(sway, ex, ty + 0.45, ez, f, 0.78);
      put(sway, ex + (dz ? 1 : 0.8), ty, ez + (dx ? 1 : 0.8), edge, 0.62);
      put(sway, ex - (dz ? 1 : 0.8), ty, ez - (dx ? 1 : 0.8), edge, 0.62);
    };
    for (let i = 0; i < 8; i++) {
      const [dx, dz] = R8[i % 8];
      triLeaf(dx, dz, i % 2 ? 2 : 1);
    }
    put(sway, 0, 1.25, 0, shade(f, pal.dark, 0.1), 0.55); // dull crown bud

    // overripe berries — dark maroon to blackened, sagging low, matte
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[(i * 3 + 2) % 8];
      const c = shade(pal.fruit, PALETTE.shadow, 0.3 + (i % 3) * 0.14);
      const by = 0.8 - (i % 2) * 0.12;
      put(sway, dx * 2.2, by, dz * 2.2, c, 0.95);
      flowerDot(sway, dx * 2.2, by + 0.5, dz * 2.2, shade(f, pal.dark, 0.3), 0.36); // calyx
    }
    // one berry slumped right against the soil
    put(sway, 0.4, 0.55, -2.4, shade(pal.fruit, PALETTE.shadow, 0.55), 0.9);
    return finishPlant(stat, sway); // default overripe factor 0.95
  },
};
