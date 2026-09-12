/**
 * Lifecycle state builders for the `berry-bush` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2). Perennial semantics — the cane STRUCTURE
 * persists in every state; only its condition changes:
 *  - dead: leafless brown-grey brittle canes, bark cracked, one cane snapped,
 *    no berries; keeps most of the silhouette (heightFactor 0.85).
 *  - harvested: healthy-green bush, canes + foliage fully intact, every berry
 *    picked — dry stem stubs where the clusters hung, one missed berry low
 *    and hidden (heightFactor 0.95).
 *  - overripe: full bush sagging under heavy DARK berries (pal.fruit mixed
 *    toward near-black so the blueberry recolor survives), shriveled raisin
 *    hints, foliage slightly dulled (heightFactor 1).
 *
 * Same kit + cane layout math as makeBerryBush stage 5 (bushes.ts).
 * Deterministic: seeded rng only, never Math.random. Foliage/fruit in sway.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, CropPalette, STATE_TONES,
  foliage, shade, put, vline, soilPad, finishPlant,
} from '../shared';

/** Mature cane layout (makeBerryBush stage 5): 5 canes on distinct base
 *  cells, each rising to midY then arching outward. */
interface Cane {
  dx: number; dz: number;
  bx: number; bz: number;
  midX: number; midZ: number; midY: number;
  tipX: number; tipZ: number;
}

const CANES: Cane[] = (() => {
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]];
  return dirs.map(([dx, dz], i) => {
    const sh = Math.max(3, 9 - (i % 3) * 2);
    const bx = dx * (i === 4 ? 1.5 : 1.2), bz = dz * (i === 4 ? 1.5 : 1.2);
    return {
      dx, dz, bx, bz,
      midX: bx + dx * 0.6, midZ: bz + dz * 0.6, midY: Math.floor(sh * 0.65),
      tipX: bx + dx * 1.6, tipZ: bz + dz * 1.6,
    };
  });
})();

/** Healthy cane color (stage-5 woody tone). */
const caneTone = (pal: CropPalette): number => shade(pal.stem, PALETTE.woodLight, 0.35);

export const berryBushStates: ArchetypeStates = {
  /* dead — bare brittle skeleton, bark cracked, one snapped cane, no fruit */
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 777);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const caneC = shade(deadC, PALETTE.woodDark, 0.3);
    const crack = shade(deadC, PALETTE.shadow, 0.4);
    const rnd = rng(941);

    CANES.forEach((c, i) => {
      vline(stat, c.bx, 0, c.bz, c.midX, c.midY, c.midZ, i % 2 ? deadC : caneC);
      if (i === 2) {
        // snapped short: jagged stub + the fallen tip piece on the ground
        vline(stat, c.midX, c.midY, c.midZ, c.tipX, c.midY + 1, c.tipZ, caneC);
        put(stat, c.tipX + 1.1, 0.35, c.tipZ + 0.4, crack, 0.5);
        put(stat, c.tipX + 1.8, 0.3, c.tipZ + 0.9, deadC, 0.42);
      } else {
        const sag = i === 4 ? -1 : 1; // one cane badly drooped
        vline(stat, c.midX, c.midY, c.midZ, c.tipX, c.midY + 2, c.tipZ, caneC);
        vline(stat, c.tipX, c.midY + 2, c.tipZ, c.tipX + c.dx * 1.4, c.midY + sag, c.tipZ + c.dz * 1.4, deadC);
      }
      // bark crack flecks along the wood
      for (let k = 0; k < 3; k++) {
        const t = 0.25 + rnd() * 0.6;
        put(stat,
          c.bx + (c.tipX - c.bx) * t + (rnd() - 0.5) * 0.4,
          Math.max(1, c.midY * t + rnd() * 2),
          c.bz + (c.tipZ - c.bz) * t + (rnd() - 0.5) * 0.4,
          crack, 0.36);
      }
      // a couple of curled dry husks — leafless but still "this bush"
      if (i === 1 || i === 3) put(sway, c.midX + 0.7, c.midY + 0.4, c.midZ + 0.5, deadC, 0.3);
    });

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.85;
    return g;
  },

  /* harvested — intact healthy bush, berries picked, one missed low */
  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 777);

    const f = foliage(pal, 5);
    const edge = shade(f, pal.dark, 0.36);
    const caneC = caneTone(pal);
    const stubC = shade(pal.stem, PALETTE.straw, 0.45); // dry picked-stem nubs

    CANES.forEach((c, i) => {
      vline(stat, c.bx, 0, c.bz, c.midX, c.midY, c.midZ, caneC);
      vline(stat, c.midX, c.midY, c.midZ, c.tipX, c.midY + 2, c.tipZ, caneC);
      const topX = c.tipX + c.dx * 1.4, topZ = c.tipZ + c.dz * 1.4, topY = c.midY + 1;
      vline(stat, c.tipX, c.midY + 2, c.tipZ, topX, topY, topZ, caneC);

      // healthy leaf pairs along the cane (same anchoring as the stage builder)
      const px = -c.dz, pz = c.dx;
      for (let y = 2; y <= c.midY + 2; y += 2) {
        const frac = Math.min(1, y / (c.midY + 2));
        const lx = c.bx + (topX - c.bx) * frac;
        const lz = c.bz + (topZ - c.bz) * frac;
        put(sway, lx + px, y + 0.5, lz + pz, i % 2 ? f : shade(f, pal.light, 0.16), 0.85);
        put(sway, lx + px * 1.7, y + 0.7, lz + pz * 1.7, edge, 0.6);
        put(sway, lx - px, y + 0.2, lz - pz, shade(f, pal.dark, 0.14), 0.8);
      }

      // empty fruit-stem stubs exactly where the clusters hung — picked clean
      put(sway, topX, topY + 0.5, topZ, stubC, 0.3);
      put(sway, topX - px * 0.7, topY - 0.2, topZ - pz * 0.7, stubC, 0.34);
      put(sway, topX - px * 0.7, topY - 0.9, topZ - pz * 0.7, stubC, 0.3);
      const mx = c.bx + (c.tipX - c.bx) * 0.45, mz = c.bz + (c.tipZ - c.bz) * 0.45;
      put(sway, mx + px * 0.7, c.midY - 0.6, mz + pz * 0.7, stubC, 0.3);
    });

    // one missed berry, low and hidden against a cane base
    const hide = CANES[3];
    put(sway, hide.bx + 0.5, 1.15, hide.bz + 0.6, pal.fruit, 0.44);
    put(sway, hide.bx + 0.1, 1.5, hide.bz + 0.25, shade(f, pal.dark, 0.2), 0.7);

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 0.95;
    return g;
  },

  /* overripe — full bush sagging under dark berries, raisin hints */
  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3, 777);

    const f = shade(foliage(pal, 5), STATE_TONES.stress, 0.22); // dulled foliage
    const edge = shade(f, pal.dark, 0.36);
    const caneC = caneTone(pal);
    const dark = shade(pal.fruit, 0x20101a, 0.5);
    const raisin = shade(pal.fruit, 0x140a10, 0.65);

    CANES.forEach((c, i) => {
      vline(stat, c.bx, 0, c.bz, c.midX, c.midY, c.midZ, caneC);
      vline(stat, c.midX, c.midY, c.midZ, c.tipX, c.midY + 2, c.tipZ, caneC);
      // heavier arch — tips sag one lower under the load
      const topX = c.tipX + c.dx * 1.6, topZ = c.tipZ + c.dz * 1.6, topY = c.midY;
      vline(stat, c.tipX, c.midY + 2, c.tipZ, topX, topY, topZ, caneC);

      const px = -c.dz, pz = c.dx;
      for (let y = 2; y <= c.midY + 2; y += 2) {
        const frac = Math.min(1, y / (c.midY + 2));
        const lx = c.bx + (topX - c.bx) * frac;
        const lz = c.bz + (topZ - c.bz) * frac;
        put(sway, lx + px, y + 0.5, lz + pz, i % 2 ? f : shade(f, pal.light, 0.14), 0.85);
        put(sway, lx + px * 1.7, y + 0.7, lz + pz * 1.7, edge, 0.6);
        put(sway, lx - px, y + 0.2, lz - pz, shade(f, pal.dark, 0.14), 0.8);
      }

      // heavy hanging clusters of dark berries — the past-prime read
      for (let b = 0; b < 4; b++) {
        const by = topY - 0.35 - b * 0.72;
        const shriveled = b === 3;
        put(sway, topX - px * 0.7, by, topZ - pz * 0.7, shriveled ? raisin : dark, shriveled ? 0.44 : 0.62);
      }
      // mid-cane pair: one dark, one raisin
      const mx = c.bx + (c.tipX - c.bx) * 0.45, mz = c.bz + (c.tipZ - c.bz) * 0.45;
      put(sway, mx + px * 0.7, c.midY - 0.7, mz + pz * 0.7, dark, 0.6);
      put(sway, mx + px * 0.7, c.midY - 1.4, mz + pz * 0.7, raisin, 0.46);
    });

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1;
    return g;
  },
};
