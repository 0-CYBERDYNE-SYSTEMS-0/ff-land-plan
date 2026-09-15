/**
 * Lane B — Crops & Growth Stages.
 * 18 procedural archetypes × 6 growth stages (`<arch>-s0…s5`) plus the
 * canonical `growth-demo` row (tomato life cycle side by side).
 * Every builder is deterministic; foliage lives in child groups named 'sway'
 * for the future wind system.
 */
import * as THREE from 'three';
import type { AssetEntry } from '@/creative/registry-types';
import { makeTomato } from './tomato';
import { makeLeafyHead, makeBrassica, makeGreensOpen } from './heads';
import { makeWheat, makeCorn } from './grains';
import { makeRootCarrot, makeAllium, makePotato } from './roots';
import { makeCucurbit, makeLegumeTrellis, makeBushBean, makeStrawberry } from './vines';
import { makeHerbClump, makeHerbShrub } from './herbs';
import { makeBerryBush, makeAppleTree } from './bushes';
import { makeMushroom } from './mushrooms';

export interface ArchDef {
  id: string;
  name: string;
  build: (stage: number) => THREE.Object3D;
  /** Authored keyframe count on the visual axis (SPEC-GROWTH-VISUAL §2.4);
   *  default 6 = the engine axis. Keep in sync with view.ts stageCountFor. */
  stages?: number;
}

export const ARCHETYPES: ArchDef[] = [
  { id: 'tomato', name: 'Tomato', build: (s) => makeTomato(s) },
  { id: 'leafy-head', name: 'Leafy Head', build: (s) => makeLeafyHead(s) },
  { id: 'wheat', name: 'Wheat', build: (s) => makeWheat(s) },
  { id: 'corn', name: 'Sweet Corn', build: (s) => makeCorn(s), stages: 10 },
  { id: 'root-carrot', name: 'Root Crop', build: (s) => makeRootCarrot(s) },
  { id: 'allium', name: 'Allium', build: (s) => makeAllium(s) },
  { id: 'potato', name: 'Potato', build: (s) => makePotato(s) },
  { id: 'brassica', name: 'Brassica', build: (s) => makeBrassica(s) },
  { id: 'greens-open', name: 'Open Greens', build: (s) => makeGreensOpen(s) },
  { id: 'cucurbit-vine', name: 'Cucurbit Vine', build: (s) => makeCucurbit(s) },
  { id: 'legume-trellis', name: 'Legume Trellis', build: (s) => makeLegumeTrellis(s) },
  { id: 'bush-bean', name: 'Bush Bean', build: (s) => makeBushBean(s) },
  { id: 'strawberry', name: 'Strawberry', build: (s) => makeStrawberry(s) },
  { id: 'herb-clump', name: 'Herb Clump', build: (s) => makeHerbClump(s) },
  { id: 'herb-shrub', name: 'Herb Shrub', build: (s) => makeHerbShrub(s) },
  { id: 'berry-bush', name: 'Berry Bush', build: (s) => makeBerryBush(s) },
  { id: 'apple-tree', name: 'Apple Tree', build: (s) => makeAppleTree(s), stages: 10 },
  { id: 'mushroom', name: 'Mushroom', build: (s) => makeMushroom(s) },
];

/** Canonical exhibit: one tomato through its whole life, spaced along X. */
export function makeGrowthDemo(): THREE.Object3D {
  const row = new THREE.Group();
  row.name = 'growth-demo';
  for (let s = 0; s < 6; s++) {
    const plant = makeTomato(s);
    plant.position.x = (s - 2.5) * 12;
    row.add(plant);
  }
  return row;
}

export const entries: AssetEntry[] = [];

for (const arch of ARCHETYPES) {
  for (let s = 0; s < (arch.stages ?? 6); s++) {
    entries.push({
      id: `${arch.id}-s${s}`,
      label: `${arch.name} — stage ${s}`,
      make: () => arch.build(s),
    });
  }
}

entries.push({
  id: 'growth-demo',
  label: 'Growth Demo — Tomato s0→s5',
  make: makeGrowthDemo,
});
