/**
 * Archetypes: root-carrot (ferny tops, colored shoulder at harvest),
 * allium (tube leaves, bulb swell, tops-down fold at harvest), potato
 * (bushy mound, flowers, hilled soil cracked open at harvest).
 */
import { PALETTE, Voxel } from '@/creative/voxel';
import {
  CropPalette, foliage, shade, put, vline, soilPad, finishPlant,
  sproutLoop, frond, flowerDot, blob, umbel,
} from './shared';

const R8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/* ------------------------------------------------------------------ */
/* root-carrot                                                         */
/* ------------------------------------------------------------------ */

export const CARROT_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x3f7d33,
  dark: 0x2c5c24,
  light: 0x74ad52,
  stem: 0x55913f,
  accent: PALETTE.flowerWhite,
  fruit: PALETTE.carrot,
  unripe: 0xd99a56,
};

/** Carrot/radish/beet: feathery fern crowns; the root "telegraphs" at s4–s5. */
export function makeRootCarrot(stage: number, pal: CropPalette = CARROT_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2.5, 707);

  if (stage === 0) { sproutLoop(stat, sway, pal, 17); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);
  // s5 ferns stay full but bronze at the edges — the harvest-ready tint
  const tipC = stage === 5 ? shade(f, PALETTE.straw, 0.32) : shade(f, pal.light, 0.28);
  const sideC = shade(f, pal.dark, 0.22);

  if (stage === 1) {
    for (let i = 0; i < 3; i++) frond(sway, 0, 0.5, 0, i % 2 ? 1 : -1, i % 2 ? -1 : 1, 2, tipC, sideC, 71 + i);
    return finishPlant(stat, sway);
  }

  const nFronds = [0, 3, 6, 9, 11, 12][stage];
  const len = [0, 2, 3, 4, 5, 5][stage];
  // s5 lifts the crown so the ripening shoulder stays visible under the ferns
  const crownY = stage === 5 ? 1.15 : 0.5;
  for (let i = 0; i < nFronds; i++) {
    const [dx, dz] = R8[i % 8];
    const l = len - (i % 3 === 2 ? 1 : 0);
    frond(sway, Math.round(dx * (i % 3 === 0 ? 1 : 0)), crownY, Math.round(dz * (i % 4 === 0 ? 1 : 0)), dx || 1, dz, l, i % 2 ? tipC : shade(tipC, pal.dark, 0.18), sideC, 80 + i * 7 + stage);
  }

  // s3 bloom: white umbel on a tall scape — the carrot-family signature
  if (stage === 3) {
    vline(sway, 0, crownY, 0, 0, 6, 0, shade(f, pal.stem, 0.5));
    umbel(sway, 0, 6.6, 0, 1, pal.accent);
  }

  // root shoulders: s4 three roots colouring just under the crust; s5 four roots
  // lifted 2–3 voxels proud of the soil line and at full girth, green crown on each
  if (stage >= 4) {
    const roots: Array<[number, number]> = stage === 5
      ? [[1.8, 0.3], [-0.4, 1.8], [-1.6, -0.9], [0.9, -1.7]]
      : [[1.7, 0.4], [-0.5, 1.6], [-1.5, -0.8]];
    const lift = stage === 5 ? 2.2 : 0.9;
    const rad = stage === 5 ? 1.05 : 0.85;
    const c = stage === 5 ? pal.fruit : mixShoulder(pal);
    const earthy = shade(c, PALETTE.soilDark, 0.35);
    roots.forEach(([x, z], i) => {
      blob(stat, x, lift, z, rad, rad, rad, c, earthy, { seed: 44 + i });
      put(stat, x, lift + rad + 0.5, z, shade(pal.stem, pal.light, 0.3), 0.6);
    });
  }
  if (stage === 5) {
    // harvest-ready: the pulled-aside crack, a wet dark crescent on the soil
    const crack: Array<[number, number]> = [[2.3, 0.6], [1.7, 1.7], [0.5, 2.3], [-1.2, 2.0], [-2.2, 0.9]];
    for (let i = 0; i < crack.length; i++) {
      put(stat, crack[i][0], 0.4, crack[i][1], i % 2 ? PALETTE.soilWet : PALETTE.soilDark, 0.75);
    }
    put(stat, 2.5, 0.85, 1.0, PALETTE.soilDark, 0.85);   // heaved clods on the crack lip
    put(stat, -2.4, 0.8, -1.4, PALETTE.soilDark, 0.8);
    flowerDot(stat, 1.3, 0.6, -2.2, PALETTE.soilDark, 0.6);
  }
  return finishPlant(stat, sway);
}

const mixShoulder = (pal: CropPalette): number => shade(pal.unripe, pal.fruit, 0.7);

export const RADISH_PAL: Partial<CropPalette> = {
  mature: 0x4a8a3a,
  fruit: PALETTE.radish,
  unripe: 0xe08aa0,
};
export const BEET_PAL: Partial<CropPalette> = {
  mature: 0x3a6e38,
  dark: 0x274f26,
  accent: 0xc25070,
  fruit: PALETTE.beet,
  unripe: 0xa85a72,
};

/* ------------------------------------------------------------------ */
/* allium                                                              */
/* ------------------------------------------------------------------ */

export const ALLIUM_PAL: CropPalette = {
  young: 0x9ec96a,
  mature: 0x4f8746,
  dark: 0x39682f,
  light: 0x86b95e,
  stem: 0x5b9147,
  accent: 0xf0e6d0,     // papery white bloom
  fruit: 0xd9c893,      // cured bulb gold
  unripe: 0xe3dcc2,
};

/* allium tubes: plus-shaped half-voxel section sampled every third step, so a fan reads as one rounded surface */
const TUBE_CELLS: Array<[number, number]> = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]];

/** Tube leaf along a polyline: cells every third step, tip cell in `tip`. */
function tubePath(out: Voxel[], pts: Array<[number, number, number]>, body: number, tip: number): void {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, ay, az] = pts[s];
    const [bx, by, bz] = pts[s + 1];
    const steps = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)) * 3));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (const [ox, oz] of TUBE_CELLS) put(out, x + ox, y, z + oz, body, 0.5);
    }
  }
  const [tx, ty, tz] = pts[pts.length - 1];
  for (const [ox, oz] of TUBE_CELLS) put(out, tx + ox, ty, tz + oz, tip, 0.5);
}

/** One upright tube leaf: leans out from the neck at angle `a`, bending toward its tip. */
function fanTube(out: Voxel[], a: number, h: number, lean: number, body: number, tip: number): void {
  const ux = Math.cos(a), uz = Math.sin(a);
  tubePath(out, [
    [0, 0.3, 0],
    [ux * lean * 0.2, h * 0.5, uz * lean * 0.2],
    [ux * lean * 0.7, h * 0.85, uz * lean * 0.7],
    [ux * lean, h, uz * lean],
  ], body, tip);
}

/** Round seed head of half-voxel cells, two tones checkered like papery florets. */
function seedHead(out: Voxel[], x: number, y: number, z: number, r: number, cA: number, cB: number): void {
  const n = Math.ceil(r * 2);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (let k = -n; k <= n; k++) {
        if ((i * i + j * j + k * k) * 0.25 > r * r) continue;
        put(out, x + i * 0.5, y + j * 0.5, z + k * 0.5, (i + j + k) % 2 ? cA : cB, 0.5);
      }
}

/** Onion/garlic/leek: tube leaves → scape & bud → first kinks → swollen bulb, tops down. */
export function makeAllium(stage: number, pal: CropPalette = ALLIUM_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 2, 808);

  if (stage === 0) { sproutLoop(stat, sway, pal, 18); return finishPlant(stat, sway); }

  const body = foliage(pal, stage);
  const tip = shade(body, pal.dark, 0.45);   // tube openings read darker

  if (stage === 1) {
    for (let i = 0; i < 3; i++) fanTube(sway, i * 2.1, 2.5, 0.6, i % 2 ? body : shade(body, pal.light, 0.2), tip);
    return finishPlant(stat, sway);
  }

  const nTubes = [0, 0, 6, 8, 9, 9][stage];
  const h = [0, 0, 4, 7, 8, 8][stage];

  if (stage <= 4) {
    // tubes fan evenly round the neck at varied heights
    for (let i = 0; i < nTubes; i++) {
      const a = (i / nTubes) * Math.PI * 2 + 0.4;
      const c = i % 2 ? body : shade(body, pal.light, 0.2);
      if (stage === 4 && i >= nTubes - 2) {
        // first weakness: the last two tubes kink past mid-height and sag
        // outward — the fold that says the bulb underneath is nearly ripe
        const ux = Math.cos(a), uz = Math.sin(a);
        tubePath(sway, [[0, 0.3, 0], [ux * 0.5, h - 2, uz * 0.5], [ux * 2.6, h - 4.5, uz * 2.6]], c, tip);
      } else {
        fanTube(sway, a, h - (i % 3 === 2 ? 1.5 : 0), 0.9 + (i % 2) * 0.35, c, tip);
      }
    }
    if (stage === 3 || stage === 4) {
      // central scape with bud / seed head
      const scape = shade(body, pal.stem, 0.4);
      tubePath(sway, [[0, 0.3, 0], [0, h + 1, 0]], scape, scape);
      if (stage === 3) flowerDot(sway, 0, h + 1.8, 0, shade(pal.accent, pal.dark, 0.2), 0.6);
      else seedHead(sway, 0, h + 2.2, 0, 1.2, pal.accent, shade(pal.accent, PALETTE.straw, 0.25));
    }
  }

  if (stage === 4) {
    // bulb swelling under the tubes: a smaller pale mass on the soil
    blob(stat, 0, 1.6, 0, 1.9, 1.2, 1.9, shade(pal.fruit, PALETTE.white, 0.5), shade(pal.fruit, PALETTE.soilDark, 0.25), { seed: 54 });
  }
  if (stage === 5) {
    // HARVEST-READY — one wide, pale, round bulb is the first read: sitting on
    // the soil, darker lower band for the shoulder line, then five straight
    // tube leaves rising from its neck and a seed head on top
    const bulb = shade(pal.fruit, PALETTE.white, 0.5);
    const band = shade(pal.fruit, PALETTE.soilDark, 0.25);
    blob(stat, 0, 2.0, 0, 2.7, 1.9, 2.7, bulb, band, { seed: 55 });
    put(stat, 0, 3.9, 0, shade(body, pal.dark, 0.2), 0.8); // neck
    put(stat, 2.3, 0.35, 0.7, PALETTE.soilDark, 0.6);       // crust heaved aside by the swell
    put(stat, -0.8, 0.35, -2.3, PALETTE.soilDark, 0.6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const ux = Math.cos(a), uz = Math.sin(a);
      const c = i % 2 ? body : shade(body, pal.light, 0.18);
      tubePath(sway, [[0, 3.6, 0], [ux * 0.5, 5.2, uz * 0.5], [ux * 1.2, 6.6, uz * 1.2]], c, tip);
    }
    // one scape bolted to seed — dry parchment head on top
    const scape = shade(body, PALETTE.straw, 0.35);
    tubePath(sway, [[0, 3.6, 0], [0.25, 5.4, -0.15], [0.5, 7.0, -0.35]], scape, scape);
    seedHead(sway, 0.5, 7.6, -0.35, 1.1, shade(pal.accent, PALETTE.straw, 0.45), shade(pal.accent, PALETTE.straw, 0.25));
  }
  return finishPlant(stat, sway);
}

export const GARLIC_PAL: Partial<CropPalette> = {
  mature: 0x54854a,
  fruit: 0xefe8dc,
  unripe: 0xe8e2d0,
};
export const LEEK_PAL: Partial<CropPalette> = {
  mature: 0x468049,
  dark: 0x33602f,
  fruit: 0xefe9da,   // long white shank
  unripe: 0xe6e0cf,
};

/* ------------------------------------------------------------------ */
/* potato                                                              */
/* ------------------------------------------------------------------ */

export const POTATO_PAL: CropPalette = {
  young: PALETTE.sprout,
  mature: 0x3e7a37,
  dark: 0x2b5c27,
  light: 0x71ab50,
  stem: 0x558a42,
  accent: PALETTE.flowerWhite,
  fruit: PALETTE.potato,
  unripe: 0xb09468,
};

/** Potato leaf: short stalk with paired oval leaflets (smaller than tomato's). */
function potatoLeaf(
  sway: Voxel[], x: number, y: number, z: number,
  dx: number, dz: number, len: number,
  base: number, edge: number, seed: number,
): void {
  const px = -dz, pz = dx;
  let lx = x, ly = y, lz = z;
  for (let i = 1; i <= len; i++) {
    lx = x + dx * i; lz = z + dz * i; ly = y + Math.round(i * 0.62);
    put(sway, lx, ly, lz, base);
    if (i < len) {
      put(sway, lx + px, ly, lz + pz, edge, 0.8);
      put(sway, lx - px, ly, lz - pz, edge, 0.8);
    } else {
      put(sway, lx, ly + 1, lz, base, 0.85);
    }
    void seed;
  }
}

/** Potato: mound of pinnate foliage → blooms → berries → green vines + cracked hill. */
export function makePotato(stage: number, pal: CropPalette = POTATO_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  soilPad(stat, 3, 909);

  if (stage === 0) { sproutLoop(stat, sway, pal, 19); return finishPlant(stat, sway); }

  const f = foliage(pal, stage);

  if (stage === 1) {
    potatoLeaf(sway, 0, 1, 0, 1, 0, 2, f, shade(f, pal.dark, 0.35), 91);
    potatoLeaf(sway, 0, 1, 0, 0, 1, 2, f, shade(f, pal.dark, 0.35), 92);
    return finishPlant(stat, sway);
  }

  // hilled mound from s3: low hill forming → cracked hill → heaped, lighter hill
  const ry = [0, 0, 0, 1.2, 1.8, 2.6][stage];
  const hillR = 2.1;
  if (stage >= 3) {
    const dome: Voxel[] = [];
    blob(dome, 0, 0, 0, hillR, ry, hillR, stage === 5 ? PALETTE.soilLight : PALETTE.soil, PALETTE.soilDark, { seed: 909 + stage });
    for (const v of dome) if (v.y >= 1) stat.push(v);
  }

  const H = [0, 0, 3, 4, 4, 2][stage];   // s5 vines flatten over the hill — energy in the tubers, crowns in view
  const nStems = [0, 0, 5, 6, 7, 7][stage];
  for (let i = 0; i < nStems; i++) {
    const [dx, dz] = R8[i % 8];
    const sh = H - (i % 2);
    // s4+: stems rise off the hill flanks so the summit and tuber crowns stay open
    const sr = stage >= 4 ? 1.3 : (i > 3 ? 0.8 : 0.4);
    const sx = dx * sr, sz = dz * sr;
    const tipX = sx * (1 + sh * 0.2), tipZ = sz * (1 + sh * 0.2);
    vline(stat, sx * 0.4, 0.8, sz * 0.4, tipX, 1 + sh, tipZ, pal.stem);

    const [ldx, ldz] = [[dx, dz], [-dx, -dz], [dz, dx]][i % 3] as [number, number];
    // two pinnate pairs per stem — dense mound, never a candelabra
    potatoLeaf(sway, Math.round(tipX), 1 + Math.max(1, sh - 1), Math.round(tipZ),
      ldx, ldz, stage >= 3 ? 3 : 2, f, shade(f, pal.dark, 0.35), 93 + i * 5);
    potatoLeaf(sway, Math.round(sx), 2, Math.round(sz),
      -ldx, -ldz, 2, shade(f, pal.light, 0.12), shade(f, pal.dark, 0.35), 123 + i * 3);
  }

  if (stage === 3) {
    // white bloom clusters
    for (let i = 0; i < 6; i++) {
      const [dx, dz] = R8[(i * 2 + 1) % 8];
      flowerDot(sway, dx * 2, 1 + H + 0.5, dz * 2, pal.accent, 0.5);
      flowerDot(sway, dx * 2, 1 + H + 0.95, dz * 2, 0xf7e27a, 0.26); // yellow eye
    }
  }
  if (stage === 4) {
    // flowers fading to a few green berries
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = R8[(i * 3) % 8];
      flowerDot(sway, dx * 2.2, 1 + H - 0.2, dz * 2.2, 0x8fae52, 0.5);
    }
  }
  if (stage === 5) {
    // still flowering — small pale blooms over the vigorous green vines
    const blooms: Array<[number, number]> = [[1.9, 0.7], [-1.6, 1.3], [0.5, -2.0], [-0.9, -1.6]];
    for (let i = 0; i < blooms.length; i++) {
      const [bx, bz] = blooms[i];
      flowerDot(sway, bx, 1 + H + 0.5, bz, pal.accent, 0.45);
      flowerDot(sway, bx, 1 + H + 0.85, bz, 0xf7e27a, 0.22); // yellow eye
    }
  }

  // pale tuber crowns pushed proud of the dome: s4 one peeks through a crack,
  // s5 three crowns read clearly against the dark soil, each with a crack lip
  if (stage >= 4) {
    const pale = shade(pal.fruit, 0xffffff, 0.45);
    // crowns sit between the stem directions (22.5° gaps) so the vines don't cover them
    const crowns: Array<[number, number]> = stage === 5
      ? [[1.57, -0.65], [-0.65, 1.57], [-0.65, -1.57]]
      : [[1.57, -0.65]];
    for (const [x, z] of crowns) {
      const y = ry * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (hillR * hillR))) + 0.5; // sits on the dome flank
      put(stat, x, y, z, pale, 1.2);
      put(stat, x + 0.35, y + 0.7, z + 0.2, shade(pal.fruit, 0xffffff, 0.7), 0.5); // crown glint
      put(stat, x - 0.9, y - 0.2, z + 0.6, PALETTE.soilDark, 0.6);                 // crack lip
    }
  }
  return finishPlant(stat, sway);
}
