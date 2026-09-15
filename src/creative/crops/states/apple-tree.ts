/**
 * Lifecycle state builders for the `apple-tree` archetype
 * (SPEC-GROWTH-VISUAL §2.2 Tier 2). Perennial semantics — the tree keeps its
 * full footprint/height in EVERY state (heightFactor 1 on all three); only its
 * condition changes:
 *  - dead: bare skeletal tree — trunk + spreading scaffold limbs + bare twigs,
 *    NO canopy leaves, grey-brown bark, one withered fruit still hanging.
 *  - harvested: "picked this week" — alive but clearly post-harvest: canopy
 *    ~15-20% thinner/patchier than stage 5, foliage slightly dulled, pale
 *    stem scars where the crop hung, a few early-turned edge leaves, and
 *    two fallen fruit under the rim (one with a leaf attached).
 *  - overripe: full canopy yellowing at the edges + darker over-ripe fruit
 *    (pal.fruit toward dark maroon), a few with a soft dark spot, some
 *    dropped beneath the canopy.
 *
 * Same kit + scaffold math as makeAppleTree stage 5 (bushes.ts).
 * Deterministic: seeded rng only, never Math.random. Canopy/fruit in sway.
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  ArchetypeStates, CropPalette, STATE_TONES,
  foliage, shade, put, vline, blob, soilPad, finishPlant, flowerDot,
} from '../shared';

const TRUNK_H = 6;
const CANOPY_R = 5;
const CANOPY_CY = TRUNK_H + CANOPY_R * 0.8;

/** Healthy scaffold wood (stage-5 tone). */
const woodTone = (): number => shade(PALETTE.woodDark, PALETTE.wood, 0.22);

/** Trunk with basal flare + 5 radiating scaffold limbs (stage-5 math). */
function drawScaffold(stat: Voxel[], wood: number): void {
  for (let y = 0; y <= TRUNK_H; y++) {
    const t = 1 - y / (TRUNK_H + 2);
    put(stat, 0, y, 0, wood);
    if (y <= 1) {
      put(stat, 0.7 * t + 0.4, y, 0, wood, 0.85);
      put(stat, -0.4, y, 0.7 * t + 0.4, wood, 0.8);
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    vline(stat, 0, TRUNK_H - 1, 0,
      Math.round(Math.cos(a) * CANOPY_R * 0.85),
      TRUNK_H + Math.round(CANOPY_R * 0.55),
      Math.round(Math.sin(a) * CANOPY_R * 0.85),
      wood);
  }
}

/** Two overlapping off-center canopy shells + interior dapple (stage-5 seeds). */
function drawCanopy(sway: Voxel[], pal: CropPalette, base: number): void {
  const edge = shade(base, pal.dark, 0.38);
  blob(sway, 0, CANOPY_CY, 0, CANOPY_R, CANOPY_R * 0.72, CANOPY_R, base, edge, { shell: true, seed: 75 });
  blob(sway, CANOPY_R * 0.5, CANOPY_CY + CANOPY_R * 0.3, -CANOPY_R * 0.35,
    CANOPY_R * 0.58, CANOPY_R * 0.46, CANOPY_R * 0.58, shade(base, pal.light, 0.2), edge, { shell: true, seed: 85 });
  const rnd = rng(335);
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * CANOPY_R * 0.7;
    put(sway, Math.round(Math.cos(a) * r), CANOPY_CY + Math.round((rnd() - 0.3) * CANOPY_R * 0.7),
      Math.round(Math.sin(a) * r), rnd() < 0.5 ? edge : shade(base, pal.dark, 0.15), 0.7);
  }
}

/**
 * Picked canopy — the stage-5 shell trimmed ~8% in radius (≈15% surface)
 * with four small carved eye-gaps and a lighter interior dapple: the same
 * living tree, distinctly patchier than healthy. Used only by `harvested`.
 */
function drawPickedCanopy(sway: Voxel[], pal: CropPalette, base: number): void {
  const R = CANOPY_R * 0.92;
  const RY = CANOPY_R * 0.66;
  const edge = shade(base, pal.dark, 0.4);

  // seeded eye-gap centers sitting ON the shell (t = ellipsoid height fraction)
  const gr = rng(511);
  const gaps: Array<[number, number, number]> = [];
  for (let i = 0; i < 4; i++) {
    const a = gr() * Math.PI * 2;
    const t = (gr() - 0.5) * 1.2;
    const ring = Math.sqrt(1 - t * t);
    gaps.push([Math.cos(a) * R * ring, CANOPY_CY + t * RY, Math.sin(a) * R * ring]);
  }
  const inGap = (x: number, y: number, z: number): boolean =>
    gaps.some((gp) => {
      const dx = x - gp[0], dy = y - gp[1], dz = z - gp[2];
      return dx * dx + dy * dy + dz * dz < 1.3;
    });

  const shell = (cx: number, cy: number, cz: number,
    rx: number, ry: number, rz: number, cA: number, seed: number): void => {
    const inside = (x: number, y: number, z: number): boolean => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
      return dx * dx + dy * dy + dz * dz <= 1;
    };
    const rnd = rng(seed);
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          if (!inside(x, y, z)) continue;
          if (inside(x + 1, y, z) && inside(x - 1, y, z) &&
            inside(x, y + 1, z) && inside(x, y - 1, z) &&
            inside(x, y, z + 1) && inside(x, y, z - 1)) continue;
          if (inGap(x, y, z)) continue; // the patchiness
          put(sway, x, y, z, rnd() < 0.45 ? edge : cA);
        }
  };

  shell(0, CANOPY_CY, 0, R, RY, R, base, 611);
  shell(CANOPY_R * 0.46, CANOPY_CY + CANOPY_R * 0.28, -CANOPY_R * 0.32,
    CANOPY_R * 0.53, CANOPY_R * 0.42, CANOPY_R * 0.53, shade(base, pal.light, 0.2), 612);

  // lighter interior dapple (healthy keeps 30) so gaps read patchy, not hollow
  const rnd = rng(513);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * CANOPY_R * 0.62;
    put(sway, Math.round(Math.cos(a) * r), CANOPY_CY + Math.round((rnd() - 0.3) * CANOPY_R * 0.62),
      Math.round(Math.sin(a) * r), rnd() < 0.5 ? edge : shade(base, pal.dark, 0.15), 0.7);
  }
}

export const appleTreeStates: ArchetypeStates = {
  /* dead — bare skeleton: trunk + limbs + twigs, no canopy, one withered fruit */
  dead: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3.5, 890);

    const deadC = pal.dead ?? STATE_TONES.dead;
    const bark = shade(PALETTE.woodDark, deadC, 0.5);       // grey-brown bark
    const barkDark = shade(bark, PALETTE.shadow, 0.3);
    const rnd = rng(952);

    // trunk with basal flare, one voxel taller/ganglier than the living tree
    for (let y = 0; y <= TRUNK_H + 1; y++) {
      const t = 1 - y / (TRUNK_H + 3);
      put(stat, 0, y, 0, y % 3 === 2 ? barkDark : bark);
      if (y <= 1) {
        put(stat, 0.7 * t + 0.4, y, 0, bark, 0.85);
        put(stat, -0.4, y, 0.7 * t + 0.4, bark, 0.8);
      }
    }

    // skeletal limbs: longer + flatter reach, bare twigs, nothing to hide under
    const LIMBS = 6;
    for (let i = 0; i < LIMBS; i++) {
      const a = (i / LIMBS) * Math.PI * 2 + 0.6;
      const dx = Math.cos(a), dz = Math.sin(a);
      const reach = 5.2;
      const lx = Math.round(dx * reach), lz = Math.round(dz * reach);
      const ly = TRUNK_H + 1 + (i % 2);
      vline(stat, 0, TRUNK_H - 1, 0, lx, ly, lz, i % 2 ? bark : barkDark);
      // bare twig off the limb mid — the spiky dead-crown read
      const mx = Math.round(dx * reach * 0.55), mz = Math.round(dz * reach * 0.55);
      vline(stat, mx, ly - 1, mz, mx + Math.round(dx * 1.8), ly + 1, mz + Math.round(dz * 1.2), bark);
      if (i % 2 === 0) {
        const ox = lx - Math.round(dx * 2), oz = lz - Math.round(dz * 2);
        vline(stat, ox, ly, oz, ox - Math.round(dz * 1.4), ly + 1, oz + Math.round(dx * 1.4), barkDark);
      }
      // bark crack flecks riding the limbs
      for (let k = 0; k < 2; k++) {
        const t = 0.3 + rnd() * 0.5;
        put(stat, dx * reach * t, (TRUNK_H - 1) + t * (ly - TRUNK_H + 1) + (rnd() - 0.4) * 0.5,
          dz * reach * t, deadC, 0.36);
      }
    }

    // one withered fruit still hanging from limb 0 (passes through ~(2, 7, 1.5))
    const wf = shade(pal.fruit, 0x1f1210, 0.62);
    put(sway, 2, 6.2, 1.5, wf, 0.5);
    put(sway, 2, 6.7, 1.5, barkDark, 0.22); // dry stalk

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1;
    return g;
  },

  /* harvested — "picked this week": alive but post-harvest — thinned dulled
     canopy, pale stem scars, early-turned edge leaves, fallen fruit below */
  harvested: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3.5, 890);

    const stress = pal.stress ?? STATE_TONES.stress;
    const base = shade(foliage(pal, 5), stress, 0.17); // green, slightly dulled
    drawScaffold(stat, woodTone());
    drawPickedCanopy(sway, pal, base);

    const rnd = rng(517);
    // pale stem scars riding the shell where the crop hung
    const scar = shade(pal.stubble ?? STATE_TONES.stubble, 0xffffff, 0.5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.45;
      const t = rnd() - 0.45;
      const ring = Math.sqrt(1 - t * t) * 1.04;
      flowerDot(sway, Math.cos(a) * CANOPY_R * 0.92 * ring, CANOPY_CY + t * CANOPY_R * 0.66,
        Math.sin(a) * CANOPY_R * 0.92 * ring, scar, 0.32);
    }

    // three early-turned leaves at the canopy edge (yellow-green, not autumn)
    const turn = shade(foliage(pal, 5), stress, 0.55);
    const edgeLeaves: Array<[number, number, number]> = [
      [3.9, CANOPY_CY + 1.6, 1.5], [-4.4, CANOPY_CY + 0.6, -1.1], [1.0, CANOPY_CY + 2.4, -3.3],
    ];
    for (const [tx, ty, tz] of edgeLeaves) {
      put(sway, tx, ty, tz, turn, 0.52);
      put(sway, tx + 0.35, ty + 0.15, tz + 0.3, shade(turn, pal.light, 0.25), 0.34);
    }

    // fallen fruit channel: two apples under the rim, one with a leaf attached
    put(stat, 5.0, 0.4, 1.9, pal.fruit, 0.72);
    put(stat, 5.15, 0.66, 1.9, shade(pal.fruit, 0xffffff, 0.35), 0.2);          // gloss
    put(stat, 5.0, 0.82, 1.9, pal.stem, 0.2);                                    // stalk
    put(stat, 5.55, 0.52, 2.35, shade(foliage(pal, 5), pal.light, 0.2), 0.42);   // leaf
    put(stat, 5.9, 0.64, 2.6, shade(foliage(pal, 5), pal.dark, 0.1), 0.3);
    put(stat, -4.1, 0.35, -4.2, shade(pal.fruit, pal.dark, 0.12), 0.68);
    put(stat, -4.1, 0.74, -4.2, pal.stem, 0.18);                                 // stalk

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1;
    return g;
  },

  /* overripe — canopy yellowing at edges + dark soft-spotted fruit, some dropped */
  overripe: (pal: CropPalette) => {
    const stat: Voxel[] = [];
    const sway: Voxel[] = [];
    soilPad(stat, 3.5, 890);

    const base = shade(foliage(pal, 5), STATE_TONES.stress, 0.14); // dulled green
    drawScaffold(stat, woodTone());
    drawCanopy(sway, pal, base);

    const rnd = rng(936);
    // autumnal scatter riding the shell surface — edges going yellow
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = 0.95 + rnd() * 0.14;
      flowerDot(sway, Math.cos(a) * CANOPY_R * rr, CANOPY_CY + (rnd() - 0.35) * CANOPY_R * 1.05,
        Math.sin(a) * CANOPY_R * rr,
        rnd() < 0.5 ? shade(base, STATE_TONES.stress, 0.5) : shade(base, PALETTE.straw, 0.5), 0.55);
    }

    // over-ripe hanging fruit: darker, slightly oversize, some with a soft dark spot
    const dark = shade(pal.fruit, 0x2a1216, 0.42);
    const darker = shade(pal.fruit, 0x1a0c10, 0.58);
    const spot = shade(dark, 0x1c0e0a, 0.55);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rnd() * 0.5;
      const r = CANOPY_R * (0.9 + rnd() * 0.12);
      const ax = Math.cos(a) * r, az = Math.sin(a) * r;
      const ay = CANOPY_CY + (rnd() - 0.55) * CANOPY_R * 1.05;
      const c = i % 3 === 2 ? darker : dark;
      put(sway, ax, ay - 0.45, az, c, 0.84);
      put(sway, ax, ay + 0.05, az, shade(base, pal.dark, 0.38), 0.24); // stalk
      if (i % 2 === 0) put(sway, ax + 0.26, ay - 0.55, az, spot, 0.24);
    }

    // dropped fruit beneath / just outside the canopy rim
    put(stat, 3.4, 0.35, -4.2, dark, 0.66);
    put(stat, -4.8, 0.35, 2.6, darker, 0.62);
    put(stat, 0.6, 0.32, 5.4, dark, 0.66);

    const g = finishPlant(stat, sway);
    g.userData.heightFactor = 1;
    return g;
  },
};
