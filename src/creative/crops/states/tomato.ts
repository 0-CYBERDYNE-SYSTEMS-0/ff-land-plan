/**
 * Lifecycle state builders for the `tomato` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2) — HERO asset of the lane.
 *
 * Pepper / eggplant inherit these builds via palette recolors, so every
 * crop-tissue color is derived from `pal` fields (fruit, foliage, optional
 * dead/stubble/stress tones); only neutral wood/straw/soil come from the
 * master PALETTE, exactly like the stage builder. Deterministic: seeded rng
 * only, never Math.random. Geometry DNA mirrors src/creative/crops/tomato.ts:
 * stake + straw twine ties + pinnate compound leaves + hanging trusses.
 *
 *  - dead: frost-killed — the bare stake OUTLIVES the vine (heightFactor 1.0,
 *    the 0.55 default would shrink the stake itself), brown-grey vines
 *    collapsed off the lower ties, desiccated leaf curls, shriveled dark
 *    mummy-fruit remnants (`pal.dead ?? STATE_TONES.dead` family).
 *  - harvested: picked clean — pale-faced cut stumps in stubble tone, the
 *    stake snapped off and left leaning, one fallen pinnate leaf, disturbed
 *    soil flecks; ground-hugging (default factor 0.3).
 *  - overripe: full s5-mass staked plant PAST PRIME — deep over-ripe fruit
 *    (pal.fruit darkened), oversize sagging trusses hung a voxel lower,
 *    dropped fruit on the pad, dull yellowing lower foliage, heavier droop
 *    everywhere (default factor 0.95).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, CropPalette, STATE_TONES,
  foliage, shade, put, vline, soilPad, finishPlant, flowerDot,
} from '../shared';

/**
 * Pinnate compound leaf (copy of the stage builder's tomatoLeaf — the crop's
 * DNA): stalk arcs out-and-over with paired flat leaflet plates and a 3-wide
 * terminal leaflet. droop is per-step sag; high values make the leaf leave
 * the stem flat/falling — used for the overripe heavy hang.
 */
function pinnateLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, vein: number, seed: number,
  droop = 0.045,
): void {
  const rnd = rng(seed);
  const px = -dz, pz = dx;
  put(sway, x, y, z, vein);
  for (let i = 1; i <= len; i++) {
    const lx = x + dx * i, lz = z + dz * i;
    const ly = y + Math.max(0, Math.round(i * 0.55 - droop * i * i));
    put(sway, lx, ly, lz, vein);
    if (i < len) {
      // paired leaflets — flat plate + drooping tiplet
      put(sway, lx + px, ly, lz + pz, rnd() < 0.25 ? edge : base);
      put(sway, lx + px, ly - 1, lz + pz, edge, 0.8);
      put(sway, lx - px, ly, lz - pz, rnd() < 0.25 ? edge : base);
      put(sway, lx - px, ly - 1, lz - pz, edge, 0.8);
    } else {
      // terminal leaflet — wider plate
      put(sway, lx, ly + 1, lz, base);
      put(sway, lx + px, ly + 1, lz + pz, base);
      put(sway, lx - px, ly + 1, lz - pz, base);
      put(sway, lx + px, ly, lz + pz, edge, 0.85);
      put(sway, lx - px, ly, lz - pz, edge, 0.85);
    }
  }
}

/** Straw twine figure-8 tie (copy of the stage builder's twine). */
function twine(stat: Voxel[], y: number): void {
  const s = 0.42;
  flowerDot(stat, 0, y, 0.75, PALETTE.straw, s);
  flowerDot(stat, 0, y, -0.75, PALETTE.hay, s);
  flowerDot(stat, 1, y, 0.75, PALETTE.hay, s);
  flowerDot(stat, 1, y, -0.75, PALETTE.straw, s);
  flowerDot(stat, 0.5, y, 0, PALETTE.straw, 0.36); // cinch between stem and stake
  flowerDot(stat, 0.5, y - 0.45, 0.3, PALETTE.straw, 0.3); // knot tail
}

/** Overripe truss: peduncle out, elbow sagging a full voxel deeper than the
 * healthy build, oversize deep-toned fruit with dull sheen and a split spot. */
function trussOver(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, pal: CropPalette, seed: number,
): void {
  const rnd = rng(seed);
  const overFruit = shade(pal.fruit, PALETTE.shadow, 0.45);
  const overDark = shade(pal.fruit, PALETTE.shadow, 0.62);
  const mx = x + dx * 3, mz = z + dz * 3;
  const ex = x + dx * 4, ez = z + dz * 4;
  vline(sway, x, y, z, mx, y, mz, pal.stem);        // peduncle out
  vline(sway, mx, y, mz, ex, y - 3, ez, pal.stem);  // elbow swept low by the load
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed * 0.13;
    const fx = ex + Math.cos(a) * 0.85;
    const fz = ez + Math.sin(a) * 0.85;
    const fy = y - 3.7 - (i % 2) * 0.85;
    const c = rnd() < 0.3 ? overDark : overFruit;
    put(sway, fx, fy, fz, c, 1.22); // oversize past-prime fruit
    if (rnd() < 0.5) put(sway, fx, fy + 0.85, fz, shade(c, 0xffffff, 0.14), 0.24); // dull sheen
    if (i === 2) put(sway, fx + 0.45, fy - 0.1, fz + 0.3, overDark, 0.34); // split/bruise
  }
}

export const tomatoStates: ArchetypeStates = {
  /* ---------------------------------------------------------------- */
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const deadC = pal.dead ?? STATE_TONES.dead;
    const dDark = shade(deadC, PALETTE.shadow, 0.38);
    const dLight = shade(deadC, PALETTE.hay, 0.28);
    const deadStem = shade(deadC, PALETTE.woodDark, 0.4);
    const mummy = shade(pal.fruit, dDark, 0.6);

    soilPad(stat, 2.5, 101);

    // the stake outlives the vine — full height, weathered cap (as s5)
    vline(stat, 1, 0, 0, 1, 15, 0, PALETTE.woodDark);
    put(stat, 1, 15.6, 0, shade(PALETTE.woodDark, PALETTE.woodLight, 0.35), 0.6);

    // collapsed vine: kinked stem rises, then flops off the stake in three directions
    vline(stat, 0, 0, 0, 0, 6, 0, deadStem);
    vline(stat, 0, 6, 0, 3, 1.6, 2, deadStem);
    vline(stat, 3, 1.6, 2, 4.6, 0.5, 1.2, deadStem);
    vline(stat, 0, 3, 0, -2.4, 0.7, -1.1, deadStem);
    vline(stat, 0, 5, 0, 1.5, 0.7, -2.0, deadStem);
    // burnt side-shoot stubs along the standing section
    put(stat, 0.55, 2.2, 0.35, deadStem, 0.66);
    put(stat, 0.95, 2.75, 0.5, dDark, 0.5);
    put(stat, -0.55, 4.2, -0.3, deadStem, 0.66);
    put(stat, -0.9, 4.7, -0.5, dDark, 0.5);

    // surviving ties (subset of the s5 ties at 3/7/11 — the top one rotted off)
    twine(stat, 3);
    twine(stat, 7);
    // broken vine stub still pinned at the high tie
    put(stat, 0, 7, 0, deadStem, 0.9);
    put(stat, 0.1, 7.8, 0.15, dDark, 0.65);
    put(sway, 0.35, 8.6, 0.2, dLight, 0.5); // curl remnant on the pinned stub

    // desiccated leaf curls hanging off the flopped vines
    const curls: Array<[number, number, number]> = [
      [1.4, 4.4, 0.8], [2.4, 2.8, 1.3], [3.5, 1.2, 1.6], [-1.5, 1.5, -0.6], [0.9, 1.8, -1.3],
    ];
    for (const [cx, cy, cz] of curls) {
      put(sway, cx, cy + 0.55, cz, dLight, 0.65);
      put(sway, cx + 0.3, cy + 1.0, cz + 0.1, dDark, 0.48);
    }

    // shriveled fruit remnants: two mummies on the vine, one dropped
    put(sway, 1.9, 3.0, 1.2, mummy, 0.62);
    put(sway, 1.9, 3.45, 1.2, shade(mummy, PALETTE.shadow, 0.3), 0.28);
    put(sway, 3.3, 0.9, 1.7, mummy, 0.58);
    put(sway, -1.7, 0.42, 1.6, shade(mummy, dDark, 0.35), 0.55);

    // leaf litter flat on the pad
    put(sway, -2.3, 0.45, -0.6, dLight, 0.5);
    put(sway, 0.9, 0.45, 2.1, dDark, 0.45);
    put(sway, 2.2, 0.45, -1.8, deadC, 0.5);
    put(sway, -0.6, 0.45, -2.0, dLight, 0.42);

    const g = finishPlant(stat, sway);
    // the bare stake outlives the vine — keep the full frame height instead of
    // shrinking the pole to the dead 0.55 factor (same class as the fruit-tree
    // canopy exception in shared.ts).
    g.userData.heightFactor = 1;
    return g;
  },

  /* ---------------------------------------------------------------- */
  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const stubC = pal.stubble ?? STATE_TONES.stubble;
    const stubDark = shade(stubC, PALETTE.shadow, 0.35);
    const cutTop = shade(stubC, PALETTE.cream, 0.5);
    const deadC = pal.dead ?? STATE_TONES.dead;

    soilPad(stat, 2.5, 101);

    // harvest disturbance: wet/dug flecks where boots and bins landed
    put(stat, 1.6, 0.5, -1.3, PALETTE.soilWet, 0.55);
    put(stat, -1.5, 0.48, 1.6, PALETTE.mulch, 0.5);
    put(stat, -0.8, 0.5, -1.8, PALETTE.soilWet, 0.42);

    // cut stumps: main stem + two side shoots, pale cut faces up
    vline(stat, 0, 0, 0, 0, 3.0, 0, stubC);
    put(stat, 0, 3.5, 0, cutTop, 0.62);
    put(stat, 0.42, 2.7, 0.1, stubDark, 0.5); // leaf scar
    vline(stat, -1.3, 0, 0.3, -1.6, 1.4, 0.5, stubC);
    put(stat, -1.6, 1.85, 0.5, cutTop, 0.48);
    vline(stat, 1.25, 0, -0.7, 1.55, 1.1, -0.85, stubC);
    put(stat, 1.55, 1.5, -0.85, cutTop, 0.44);

    // the stake, snapped off and left leaning
    vline(stat, 1, 0, 0.9, 1.9, 4.6, 1.4, PALETTE.woodDark);
    put(stat, 2.15, 5.05, 1.5, PALETTE.woodDark, 0.68); // splintered tip
    put(stat, 1.75, 5.3, 1.25, shade(PALETTE.woodDark, PALETTE.woodLight, 0.35), 0.38);

    // one fallen pinnate leaf resting flat on the pad
    const rnd = rng(31);
    const lBase = shade(deadC, stubC, 0.35);
    const lVein = shade(lBase, PALETTE.hay, 0.3);
    vline(sway, -0.4, 0.42, 1.9, 1.9, 0.42, 1.3, lVein);
    for (let i = 0; i < 3; i++) {
      const lx = 0.15 + i * 0.6, lz = 1.72 - i * 0.18;
      put(sway, lx, 0.42, lz + 0.72, rnd() < 0.3 ? lVein : lBase, 0.58);
      put(sway, lx, 0.42, lz - 0.72, rnd() < 0.3 ? lVein : lBase, 0.58);
    }
    put(sway, 2.1, 0.42, 1.2, lBase, 0.62); // terminal triplet
    put(sway, 2.1, 0.42, 1.95, lBase, 0.55);
    put(sway, 2.1, 0.42, 0.45, lBase, 0.55);

    return finishPlant(stat, sway);
  },

  /* ---------------------------------------------------------------- */
  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    const stressC = pal.stress ?? STATE_TONES.stress;
    const f5 = foliage(pal, 5);
    const overFruit = shade(pal.fruit, PALETTE.shadow, 0.45);
    const overDark = shade(pal.fruit, PALETTE.shadow, 0.62);

    soilPad(stat, 2.5, 101);

    // stake + weathered cap (as s5)
    vline(stat, 1, 0, 0, 1, 15, 0, PALETTE.woodDark);
    put(stat, 1, 15.6, 0, shade(PALETTE.woodDark, PALETTE.woodLight, 0.4), 0.6);

    // main stem H=13, leaning onto the stake from y>7 under the load (s5 leans
    // only in the top 4) — the whole cordon bows earlier
    for (let y = 0; y <= 13; y++) {
      const wig = Math.sin(y * 1.15);
      const sx = y > 7 ? 1 : wig > 0.25 ? 1 : wig < -0.25 ? -1 : 0;
      put(stat, sx, y, Math.round(Math.cos(y * 0.9) * 0.3), y === 13 ? shade(pal.stem, pal.dark, 0.25) : pal.stem);
    }

    // pinnate foliage: lower leaves graduated to strong yellowing (stress
    // tone), upper leaves mature-but-dull; every leaf droops harder than the
    // healthy build so the silhouette visibly sags
    const leafDirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < 8; i++) {
      const y = 1 + Math.round((i * 12) / 7);
      const [dx, dz] = leafDirs[i % 4];
      const lower = i < 4;
      const yellowK = i <= 1 ? 0.78 : i <= 3 ? 0.5 : 0;
      const base = lower ? shade(shade(f5, stressC, yellowK), pal.dark, 0.12) : shade(f5, pal.dark, 0.22);
      const edge = shade(base, pal.dark, 0.45);
      const vein = lower ? shade(base, stressC, 0.3) : shade(f5, pal.light, 0.2);
      const droop = (lower ? 0.09 : 0.055) + 0.009 * (8 - i);
      pinnateLeaf(sway, 0, y, 0, dx, dz, 4, base, edge, vein, 61 + i * 7, droop);
    }

    // twine ties as s5 — the cordon is still held
    twine(stat, 3);
    twine(stat, 7);
    twine(stat, 11);

    // four sagging oversize trusses on the camera side; the lowest hangs its
    // fruit nearly to the pad — unmistakably lower than the healthy plant
    trussOver(sway, 0, 5.5, 0, 1, 0, pal, 71);
    trussOver(sway, 0, 8.5, 0, 0, 1, pal, 84);
    trussOver(sway, 0, 11, 0, 1, 0, pal, 97);
    trussOver(sway, 0, 12.5, 0, 0, 1, pal, 110);

    // dropped fruit on the pad — the clearest "past grace" signal
    put(stat, 1.9, 0.5, -0.8, overDark, 0.95);
    put(stat, 1.9, 0.92, -0.8, shade(overDark, 0xffffff, 0.12), 0.24);
    put(stat, -2.0, 0.46, 0.6, overFruit, 0.9);
    put(stat, -2.0, 0.86, 0.6, shade(overFruit, 0xffffff, 0.12), 0.22);
    put(stat, -0.6, 0.44, 2.0, overDark, 0.85);

    // side shoot flopping under the load, harder and yellower than the s5 flop
    vline(sway, 0, 9, 0, -2.5, 6.9, 1.2, pal.stem);
    const flopBase = shade(shade(f5, stressC, 0.45), pal.dark, 0.15);
    pinnateLeaf(sway, -2.5, 6.9, 1.2, 0, 1, 3, flopBase, shade(flopBase, pal.dark, 0.45), shade(flopBase, stressC, 0.25), 66, 0.12);

    // blind yellowing growing tip instead of fresh green
    put(sway, 1, 13.6, 0.3, shade(f5, stressC, 0.7), 0.5);
    put(sway, 1.3, 14.15, 0.15, stressC, 0.38);

    return finishPlant(stat, sway);
  },
};
