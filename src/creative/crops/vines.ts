/**
 * Archetypes: cucurbit-vine (sprawl, big rough leaves, tendrils, blossom→fruit),
 * legume-trellis (climbing vine on poles + crossbar, hanging pods),
 * bush-bean (low mound, hanging pods), strawberry (crown, runners,
 * white flower → red berries).
 */
import { PALETTE, Voxel, rng } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, soilPadEllipse, finishPlant,
  sproutLoop, blade, tendril, flowerDot, pod, fivePetal, blob,
} from './shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/* ------------------------------------------------------------------ */
/* cucurbit-vine                                                       */
/* ------------------------------------------------------------------ */

export const CUCURBIT_PAL: CropPalette = {
  young: 0x94c95e,
  mature: 0x4c8838,
  dark: 0x35662a,
  light: 0x82bb58,
  stem: 0x5f9142,
  accent: PALETTE.flowerYellow,
  fruit: PALETTE.pumpkin,
  unripe: 0x8fae52,
};

/** Ground-hugging deterministic vine path — later stages extend the same run. */
const vineAt = (i: number): [number, number] => [
  Math.round(i * 0.62),
  Math.round(Math.sin(i * 0.85) * 1.35),
];

function cucurbitLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number,
  base: number, edge: number, vein: number, seed: number,
  len = 4, wMax = 4,
): void {
  blade(sway, x, y, z, dx, dz, len, wMax, 0.55, 0.07, base, vein, edge, seed);
  // rough texture speck
  const rnd = rng(seed);
  if (rnd() < 0.8) flowerDot(sway, x + dx * (len / 2), y + 1.05, z + dz * (len / 2), edge, 0.35);
}

/** Pumpkin/zucchini/melon/cucumber: trailing vine with blossoms and a fruit set. */
export function makeCucurbit(stage: number, pal: CropPalette = CUCURBIT_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  // the earth patch grows with the vine run so the plant never leaves its bed
  if (stage >= 2) soilPadEllipse(stat, 4 + stage * 0.7, 3 + stage * 0.35, 111);
  else soilPad(stat, 3.5, 111);

  if (stage === 0) {
    // fat cotyledon sprout — cucurbits come up chunky
    put(stat, 0, 0.5, 0, pal.stem, 0.75);
    put(sway, -0.7, 1.25, 0, pal.young, 0.8);
    put(sway, 0.7, 1.25, 0, shade(pal.young, pal.light, 0.3), 0.8);
    put(sway, 0, 1.9, 0, pal.young, 0.45);
    return finishPlant(stat, sway);
  }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.38);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    vline(sway, 0, 0.5, 0, 0, 1.2, 0, pal.stem);
    cucurbitLeaf(sway, 0, 1.2, 0, 1, 0, f, edge, vein, 121);
    cucurbitLeaf(sway, 0, 0.95, 0, 0, -1, shade(f, pal.dark, 0.15), edge, vein, 122);
    return finishPlant(stat, sway);
  }

  const runLen = [0, 0, 4, 7, 10, 12][stage];

  // vine runner along the ground
  for (let i = 0; i <= runLen; i++) {
    const [vx, vz] = vineAt(i);
    put(sway, vx, 0.65, vz, i % 3 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem, 0.85);
    // curly tendril every ~3 nodes from s2 on
    if (i > 0 && i % 3 === 0 && stage >= 2) {
      const [nx, nz] = vineAt(i - 1);
      tendril(sway, nx, 1.1, nz, Math.sign(vx - nx) || 1, 0, 3, shade(pal.stem, pal.light, 0.25));
    }
  }

  // big rough leaves alternating off the runner
  const nLeaves = [0, 0, 2, 3, 5, 6][stage];
  for (let i = 0; i < nLeaves; i++) {
    const li = 1 + i * 2;
    const [lx, lz] = vineAt(Math.min(li, runLen));
    const side = i % 2 === 0 ? 1 : -1;
    const leafLen = stage >= 3 ? 4 : 3;
    cucurbitLeaf(sway, lx, 1.15, lz, side, 0, i % 2 ? f : shade(f, pal.light, 0.18), edge, vein, 130 + i * 9, leafLen, leafLen);
    // a second smaller leaf across the runner keeps the canopy continuous
    if (stage >= 3) cucurbitLeaf(sway, lx, 0.95, lz, 0, side, shade(f, pal.dark, 0.12), edge, vein, 160 + i * 7, 3, 3);
  }

  // blossoms from s3; fruit sets s4; ripe s5
  if (stage >= 3) {
    const [bx, bz] = vineAt(runLen - 2);
    // bold trumpet blossom — full voxels so it reads at map distance
    const bell = (x: number, z: number, c: number): void => {
      put(sway, x, 1.05, z, c, 1);
      put(sway, x + 0.7, 1.45, z, c, 0.68);
      put(sway, x - 0.7, 1.45, z, c, 0.68);
      put(sway, x, 1.45, z + 0.7, c, 0.68);
      put(sway, x, 1.45, z - 0.7, c, 0.68);
      put(sway, x, 1.85, z, 0xf6d34a, 0.45); // stamen
    };
    if (stage === 3) {
      // bells sit beside the runner (z ±2) — leaves sweep along x at z −1..1
      const [bx4, bz4] = vineAt(4);
      bell(bx4, bz4 + 2, pal.accent);
      const [bx2, bz2] = vineAt(2);
      bell(bx2, bz2 + 2, shade(pal.accent, 0xffffff, 0.12));
    } else if (stage === 4) {
      // small green fruit beside the runner — bright enough to spot
      blob(sway, bx + 1, 1.1, bz + 1, 1.5, 1.2, 1.35, 0xa9c86a, shade(0xa9c86a, pal.dark, 0.3), { seed: 61 });
      flowerDot(sway, bx + 1, 2.35, bz + 1, pal.accent, 0.45); // bloom still attached
    } else {
      // THE fruit — big, ribbed by dither, sitting proud on the soil
      blob(sway, bx + 1, 1.35, bz + 1, 2.3, 1.65, 2.1, pal.fruit, shade(pal.fruit, pal.dark, 0.32), { seed: 62 });
      blob(sway, bx + 1, 2.8, bz + 1, 0.9, 0.45, 0.85, shade(pal.fruit, 0xffffff, 0.22), null); // sheen cap
      vline(sway, bx + 1, 3.2, bz + 1, bx + 1, 3.8, bz + 1, shade(pal.stem, pal.dark, 0.25)); // stalk
      flowerDot(sway, bx + 1, 3.9, bz + 1, PALETTE.soilDark, 0.35); // dried blossom
      // second small fruit keeps the vine honest
      const [fx, fz] = vineAt(3);
      blob(sway, fx, 0.95, fz + 1.2, 1.0, 0.85, 0.95, shade(pal.fruit, pal.dark, 0.15), null, { seed: 63 });
    }
  }
  return finishPlant(stat, sway);
}

export const ZUCCHINI_PAL: Partial<CropPalette> = {
  mature: 0x3f7d33,
  fruit: 0x2e6b34,   // dark green club
  unripe: 0x56854a,
};
export const MELON_PAL: Partial<CropPalette> = {
  fruit: 0xd8c48a,   // netted tan
  unripe: 0xb9c07a,
};
export const CUCUMBER_PAL: Partial<CropPalette> = {
  mature: 0x3a7a40,
  fruit: 0x2f8038,
  unripe: 0x6aa054,
};

/* ------------------------------------------------------------------ */
/* legume-trellis                                                      */
/* ------------------------------------------------------------------ */

export const LEGUME_PAL: CropPalette = {
  young: 0x96cb62,
  mature: 0x417f38,
  dark: 0x2e6028,
  light: 0x7db455,
  stem: 0x578c41,
  accent: 0xe8e4da,   // pea-flower white
  fruit: 0x6fa04c,    // pod green
  unripe: 0x8fb464,
};

/** Pole/pea: posts + crossbar trellis, twining stem, flowers → hanging pods. */
export function makeLegumeTrellis(stage: number, pal: CropPalette = LEGUME_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];

  if (stage === 0) { soilPad(stat, 2, 222); sproutLoop(stat, sway, pal, 23); return finishPlant(stat, sway); }

  // trellis: two posts + crossbar (built from s2 on)
  soilPad(stat, 3, 223);
  const postH = 11;
  for (const px of [-3, 3]) {
    vline(stat, px, 0, 0, px, postH, 0, PALETTE.wood);
    put(stat, px, postH + 0.4, 0, PALETTE.woodLight, 0.7); // capped post
  }
  vline(stat, -3, postH, 0, 3, postH, 0, PALETTE.woodDark);

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.36);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    blade(sway, 0, 2, 0, 1, 0, 2, 2, 0.5, 0.08, f, vein, edge, 131);
    blade(sway, 0, 2, 0, -1, 0, 2, 2, 0.5, 0.08, f, vein, edge, 132);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 4, 7, 10, 11][stage];
  // twining stems: two strands weaving wide enough to touch the posts
  for (let strand = 0; strand < 2; strand++) {
    const zOff = strand === 0 ? 0 : 0.8;
    const phase = strand * 1.4;
    let prevX = 0;
    for (let y = 0; y <= H; y++) {
      const wx = Math.round(Math.sin((y + phase) * 0.72) * 1.9);
      const wz = zOff + Math.round(Math.cos(y * 0.6) * 0.5);
      put(stat, wx, y, wz, y % 4 === 0 ? shade(pal.stem, pal.dark, 0.2) : pal.stem);
      if (Math.abs(wx - prevX) > 1) vline(stat, prevX, y - 1, wz, wx, y, wz, pal.stem);
      prevX = wx;
      // paired leaflets hugging the weave
      if (y >= 2 && (y + strand) % 2 === 0) {
        const dirX = wx >= 0 ? 1 : -1;
        put(sway, wx + dirX, y + 0.6, wz, f, 0.9);
        put(sway, wx + dirX * 1.8, y + 0.9, wz, edge, 0.72);
        put(sway, wx - dirX, y + 0.4, wz, shade(f, pal.dark, 0.15), 0.85);
        put(sway, wx - dirX * 1.7, y + 0.7, wz, edge, 0.6);
        if (stage >= 3 && y % 4 === 0) tendril(sway, wx, y + 1.2, wz, dirX, 0, 2, vein);
      }
    }
  }

  // flowers then pods hanging OUTSIDE the vine plane, camera-side
  if (stage === 3) {
    for (let i = 0; i < 5; i++) {
      const fy = 3 + i * 2;
      const fx = Math.round(Math.sin(fy * 0.72) * 1.9);
      fivePetal(sway, fx, fy + 0.9, 1.1, pal.accent, 0xe8c8d8);
    }
  }
  if (stage >= 4) {
    const nPods = stage === 4 ? 4 : 7;
    for (let i = 0; i < nPods; i++) {
      const py = 3 + (i % 4) * 2;
      const pxx = Math.round(Math.sin(py * 0.72) * 1.9) + (i % 2 ? 0.6 : -0.6);
      pod(sway, pxx, py + 0.5, 1.15 + (i % 3) * 0.2, stage === 5 ? 3 : 2,
        i % 3 === 2 ? shade(pal.fruit, pal.dark, 0.2) : shade(pal.fruit, pal.light, 0.15));
    }
  }
  return finishPlant(stat, sway);
}

export const PEA_PAL: Partial<CropPalette> = {
  young: 0xa5d46e,
  mature: 0x5a9448,
  accent: 0xece6f2,
  fruit: 0x86b45c,
};

/* ------------------------------------------------------------------ */
/* bush-bean                                                           */
/* ------------------------------------------------------------------ */

export const BUSHBEAN_PAL: CropPalette = {
  young: 0x93c95e,
  mature: 0x3f7d33,
  dark: 0x2d5f27,
  light: 0x79b152,
  stem: 0x558a3e,
  accent: 0xf0e4ec,
  fruit: 0x67a244,
  unripe: 0x89b564,
};

/** Bush bean: low mound, white-pink blooms, curved pods dangling at harvest. */
export function makeBushBean(stage: number, pal: CropPalette = BUSHBEAN_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 333);

  if (stage === 0) { sproutLoop(stat, sway, pal, 24); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.36);
  const vein = shade(f, pal.light, 0.4);

  if (stage === 1) {
    vline(stat, 0, 0, 0, 0, 2, 0, pal.stem);
    blade(sway, 0, 2, 0, 1, 0, 2, 2, 0.45, 0.08, f, vein, edge, 141);
    blade(sway, 0, 2, 0, -1, 0, 2, 2, 0.45, 0.08, f, vein, edge, 142);
    return finishPlant(stat, sway);
  }

  const H = [0, 0, 3, 4, 4, 5][stage];
  const nStems = [0, 0, 4, 5, 6, 7][stage];
  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    const sh = H - (i % 2);
    vline(stat, dx * 0.4, 0, dz * 0.4, dx * 1.1, sh, dz * 1.1, pal.stem);
    // opposite oval leaves at the tip and mid-stem
    blade(sway, Math.round(dx * 1.1), sh, Math.round(dz * 1.1), dx || 1, dz || 0, 2, 2, 0.5, 0.09, i % 2 ? f : shade(f, pal.light, 0.16), vein, edge, 150 + i * 7);
    if (sh >= 3) blade(sway, Math.round(dx * 0.8), sh - 1, Math.round(dz * 0.8), -(dz || 1), -(dx || 0), 2, 2, 0.42, 0.08, shade(f, pal.dark, 0.14), vein, edge, 170 + i * 5);
  }

  if (stage === 3) {
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = R8[(i * 2 + 1) % 8];
      flowerDot(sway, dx * 1.6, H + 0.4, dz * 1.6, pal.accent, 0.42);
    }
  }
  if (stage >= 4) {
    // pods dangle in open air below the canopy edge — never inside the bush
    const nPods = stage === 4 ? 4 : 7;
    for (let i = 0; i < nPods; i++) {
      const [dx, dz] = R8[(i * 5 + 2) % 8];
      pod(sway, dx * 2.4, H + 0.3 - (i % 3) * 0.4, dz * 2.4, stage === 5 ? 3 : 2,
        i % 3 === 1 ? shade(pal.fruit, pal.dark, 0.18) : shade(pal.fruit, pal.light, 0.22));
    }
  }
  return finishPlant(stat, sway);
}

/* ------------------------------------------------------------------ */
/* strawberry                                                          */
/* ------------------------------------------------------------------ */

export const STRAWBERRY_PAL: CropPalette = {
  young: 0x9ccf68,
  mature: 0x3a7c38,
  dark: 0x2a5f2a,
  light: 0x76b254,
  stem: 0x5b9044,
  accent: PALETTE.flowerWhite,
  fruit: 0xd83a44,
  unripe: 0x9ab662,
};

/** Strawberry: low trifoliate crown, 5-petal blooms, runners, berries at the crown. */
export function makeStrawberry(stage: number, pal: CropPalette = STRAWBERRY_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 444);

  if (stage === 0) { sproutLoop(stat, sway, pal, 25); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  const edge = shade(f, pal.dark, 0.36);
  const vein = shade(f, pal.light, 0.42);

  // trifoliate leaf: petiole out-low, three leaflets (center biggest)
  const triLeaf = (dx: number, dz: number, len: number, seed: number): void => {
    const ex = Math.round(dx * len), ez = Math.round(dz * len);
    vline(sway, 0, 0.6, 0, ex, 0.6 + len * 0.4, ez, vein);
    const ty = 0.6 + len * 0.4;
    put(sway, ex, ty + 0.5, ez, f, 0.8);
    put(sway, ex + (dz ? 1 : 0.8), ty, ez + (dx ? 1 : 0.8), edge, 0.65);
    put(sway, ex - (dz ? 1 : 0.8), ty, ez - (dx ? 1 : 0.8), edge, 0.65);
    void seed;
  };

  if (stage === 1) {
    triLeaf(1, 0, 1, 26);
    triLeaf(-1, 1, 1, 27);
    return finishPlant(stat, sway);
  }

  const nLeaves = [0, 0, 5, 6, 7, 8][stage];
  for (let i = 0; i < nLeaves; i++) {
    const [dx, dz] = R8[i % 8];
    triLeaf(dx, dz, stage >= 4 ? 2 : 1 + (i % 2), 180 + i * 7);
  }
  // central crown bud
  put(sway, 0, 1.4, 0, shade(f, pal.light, 0.4), 0.6);

  if (stage === 3) {
    for (let i = 0; i < 3; i++) {
      const [dx, dz] = R8[(i * 3 + 1) % 8];
      fivePetal(sway, dx * 1.9, 1.5 + (i % 2) * 0.4, dz * 1.9, pal.accent, 0xf2cf4e);
    }
  }

  // runners from s4: stolon along the ground (camera side) ending in a plantlet
  if (stage >= 4) {
    const dir = stage === 5 ? -1 : 1;
    vline(sway, 0, 0.55, 2.2, dir * 4, 0.55, 2.8, pal.stem);
    put(sway, dir * 4, 0.95, 2.8, shade(f, pal.young, 0.4), 0.65);
    put(sway, dir * 4.6, 0.7, 2.8, shade(f, pal.young, 0.2), 0.5);
    put(sway, dir * 4, 0.6, 3.3, shade(f, pal.young, 0.3), 0.5);
    put(stat, dir * 4, 0.15, 2.8, PALETTE.soilDark, 0.4); // rooting node
  }

  // berries: green s4 → glossy red s5, proud at the crown edge between leaves
  if (stage === 4) {
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = R8[(i * 4 + 2) % 8];
      flowerDot(sway, dx * 2.1, 0.95, dz * 2.1, 0xb9c86a, 0.7);
      flowerDot(sway, dx * 2.1, 1.42, dz * 2.1, shade(f, pal.dark, 0.2), 0.32); // calyx
    }
  }
  if (stage === 5) {
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[(i * 3 + 2) % 8];
      const c = i === 0 ? pal.fruit : shade(pal.fruit, i % 2 ? pal.dark : 0xffffff, i % 2 ? 0.16 : 0.1);
      flowerDot(sway, dx * 2.2, 0.95, dz * 2.2, c, 0.85);
      flowerDot(sway, dx * 2.2, 1.48, dz * 2.2, shade(f, pal.dark, 0.2), 0.36);      // calyx
      flowerDot(sway, dx * 2.2 + 0.22, 0.82, dz * 2.2, shade(c, 0xffffff, 0.4), 0.22); // gloss
    }
  }
  return finishPlant(stat, sway);
}
