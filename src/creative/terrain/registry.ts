import type { AssetEntry } from '@/creative/registry-types';
import {
  makeGrass01, makeGrass02, makeGrass03, makeGrassFlower,
  makeSoilTilledDry, makeSoilTilledWet,
  makePathGravelEntry, makePathWoodchipEntry, makePathStoneEntry,
  makeEdgeCliff,
} from './tiles';
import { makeBedRaisedCutaway, makeBedInground } from './beds';
import { makePondCenterEntry, makePondEdgeEntry, pondTick } from './water';

/**
 * Lane A — Terrain & Soil.
 * Ground tiles are the planning canvas: every tile is a ~10x10 voxel cell
 * (1 voxel = 10 cm) that must read from above AND in 3/4 orbit view.
 * All builders are deterministic (seeded rng inside each maker).
 */
export const entries: AssetEntry[] = [
  {
    id: 'grass-01',
    label: 'Meadow Grass · Classic',
    make: makeGrass01,
  },
  {
    id: 'grass-02',
    label: 'Meadow Grass · Tufty',
    make: makeGrass02,
  },
  {
    id: 'grass-03',
    label: 'Meadow Grass · Stoney',
    make: makeGrass03,
  },
  {
    id: 'grass-flower',
    label: 'Flowering Meadow Patch',
    make: makeGrassFlower,
  },
  {
    id: 'soil-tilled-dry',
    label: 'Tilled Soil · Dry Furrows',
    make: makeSoilTilledDry,
  },
  {
    id: 'soil-tilled-wet',
    label: 'Tilled Soil · Wet Furrows',
    make: makeSoilTilledWet,
  },
  {
    id: 'bed-raised-cutaway',
    label: 'Raised Bed · Cutaway Strata',
    make: makeBedRaisedCutaway,
  },
  {
    id: 'bed-inground',
    label: 'In-Ground Bed · Turf Blend',
    make: makeBedInground,
  },
  {
    id: 'path-gravel',
    label: 'Gravel Path',
    make: makePathGravelEntry,
  },
  {
    id: 'path-woodchip',
    label: 'Woodchip Path',
    make: makePathWoodchipEntry,
  },
  {
    id: 'path-stone',
    label: 'Flagstone Path',
    make: makePathStoneEntry,
  },
  {
    id: 'pond-center',
    label: 'Pond Water · Center (shimmer)',
    make: makePondCenterEntry,
    tick: pondTick,
  },
  {
    id: 'pond-edge',
    label: 'Pond Shoreline · Grass→Mud→Water',
    make: makePondEdgeEntry,
    tick: pondTick,
  },
  {
    id: 'edge-cliff',
    label: 'Island Rim · Turf Cliff Strata',
    make: makeEdgeCliff,
  },
];
