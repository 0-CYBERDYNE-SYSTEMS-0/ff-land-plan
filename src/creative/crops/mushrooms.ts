/**
 * Archetype: mushroom — saprotrophic fruiting bodies on a sawdust/straw block.
 * Six stages run from a cased substrate block (s0) through pins and small caps
 * (s1–s3) to a full flush with one dominant cap (s4–s5). Recollored per cultivar
 * in map.ts (oyster → pale, button → white, shiitake → brown).
 */
import { PALETTE, Voxel, rng, mixColor } from '@/creative/voxel';
import { CropPalette, shade, put, finishPlant, blob } from './shared';

export const MUSHROOM_PAL: CropPalette = {
  young: 0xe9e3d4,      // pale mycelium / pins
  mature: 0xd9cba8,     // cap base (tan)
  dark: 0x8a7a5c,       // cap shadow / substrate dark
  light: 0xf5f0e2,      // cap highlight
  stem: 0xe0d6c2,       // pale stem
  accent: 0xcdbb92,     // gill rim
  fruit: 0xd9cba8,      // ripe cap
  unripe: 0xb9b199,     // young cap
};

export function makeMushroom(stage: number, pal: CropPalette = MUSHROOM_PAL): ReturnType<typeof finishPlant> {
  const stat: Voxel[] = [];
  const sway: Voxel[] = [];
  const rand = rng(880 + stage);

  // Substrate block — squat straw/sawdust mass, cased on top.
  const subA = mixColor(PALETTE.straw, PALETTE.mulch, 0.35);
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++)
      for (let y = 0; y <= 1; y++) {
        const rim = Math.max(Math.abs(x), Math.abs(z)) === 3;
        stat.push({ x, y, z, color: rim ? mixColor(PALETTE.mulch, PALETTE.soilDark, 0.25) : rand() < 0.5 ? subA : PALETTE.mulch });
      }
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++)
      stat.push({ x, y: 2, z, color: rand() < 0.4 ? pal.young : mixColor(pal.young, PALETTE.straw, 0.35) });

  if (stage === 0) return finishPlant(stat, sway);

  const capC = stage >= 3 ? pal.fruit : pal.unripe;
  const capLight = shade(capC, pal.light, 0.45);

  const shroom = (sx: number, sz: number, h: number, capR: number, capH: number, lean: number): void => {
    const bx = sx + Math.round(lean);
    for (let i = 0; i <= h; i++) {
      const f = i / Math.max(1, h);
      put(sway, sx + Math.round(lean * f), 3 + i, sz, pal.stem, i === h ? 0.8 : 0.68);
    }
    blob(sway, bx, 3 + h, sz, capR, capH, capR, capC, capLight, { seed: (sx * 13 + sz * 7 + 3) | 0 });
    put(sway, bx, 3 + h - 1, sz, pal.accent, capR * 0.85);
  };

  if (stage === 1) {
    put(sway, -1, 3, 0, pal.stem, 0.5);
    put(sway, 1, 3, 1, pal.stem, 0.5);
    put(sway, 0, 3, -1, pal.stem, 0.5);
    put(sway, 0, 4, 0, pal.unripe, 0.4);
    return finishPlant(stat, sway);
  }

  if (stage === 2) {
    shroom(-1, 0, 1, 0.9, 0.6, 0.3);
    shroom(1, 1, 1, 0.8, 0.5, -0.3);
    put(sway, 0, 3, -1, pal.stem, 0.5);
    return finishPlant(stat, sway);
  }

  if (stage === 3) {
    shroom(-2, 0, 1, 1.0, 0.7, 0.4);
    shroom(0, 1, 2, 1.1, 0.8, 0.0);
    shroom(2, -1, 1, 0.9, 0.6, -0.4);
    shroom(1, -2, 1, 0.8, 0.5, 0.2);
    return finishPlant(stat, sway);
  }

  // s4–s5 — full flush clusters.
  shroom(-2, 1, 2, 1.3, 0.9, 0.3);
  shroom(2, 1, 3, 1.4, 1.0, -0.2);
  shroom(-1, -2, 2, 1.1, 0.8, -0.3);
  shroom(2, -1, 2, 1.2, 0.8, 0.2);
  shroom(0, 0, 3, 1.5, 1.1, 0.0);
  shroom(-3, 0, 1, 0.8, 0.5, 0.4);
  if (stage === 5) {
    blob(sway, 0, 6.6, 0, 1.9, 1.2, 1.9, pal.fruit, shade(pal.fruit, pal.light, 0.4), { seed: 5 });
    put(sway, 0, 3, 0, pal.stem, 1.0);
    put(sway, -3, 3, -2, pal.stem, 0.45);
  }

  return finishPlant(stat, sway);
}
