import type { AssetEntry } from '@/creative/registry-types';
import { makeBarn } from './barn';
import {
  makeShed, makeGreenhouse, makePolytunnel, makeColdFrame, makeChickenCoop,
  makeGrowTent,
} from './buildings';
import {
  makeFencePostRail, makeFencePicket, makeGate, makeTrellis,
} from './fences';
import {
  makeCompostBin, makeRainBarrel, makeIbcTote, makeWaterTap, makeIrrigationLine,
  makeBeehive, makeHayBale, makeCrateStack, makeSignpost, makeScarecrow,
  makeFruitTree,
} from './props';

/**
 * Lane C — Structures & infrastructure.
 * Procedural voxel builders at 1 voxel = 10 cm; ids match the designer asset
 * library slugs 1:1 (see quality/ASSETS.md). All makers are deterministic.
 */
export const entries: AssetEntry[] = [
  { id: 'barn', label: 'Classic Red Barn · Hero', make: makeBarn },
  { id: 'shed', label: 'Garden Shed', make: makeShed },
  { id: 'greenhouse', label: 'Glass Greenhouse', make: makeGreenhouse },
  { id: 'polytunnel', label: 'Polytunnel', make: makePolytunnel },
  { id: 'cold-frame', label: 'Cold Frame', make: makeColdFrame },
  { id: 'chicken-coop', label: 'Chicken Coop + Run Hint', make: makeChickenCoop },
  { id: 'fence-post-rail', label: 'Post-and-Rail Fence Segment', make: makeFencePostRail },
  { id: 'fence-picket', label: 'Picket Fence Segment', make: makeFencePicket },
  { id: 'gate', label: 'Farm Gate', make: makeGate },
  { id: 'trellis', label: 'Lattice Trellis Panel', make: makeTrellis },
  { id: 'compost-bin', label: 'Compost Bin', make: makeCompostBin },
  { id: 'rain-barrel', label: 'Rain Barrel + Downpipe', make: makeRainBarrel },
  { id: 'ibc-tote', label: 'IBC Water Tote', make: makeIbcTote },
  { id: 'water-tap', label: 'Standpipe Water Tap', make: makeWaterTap },
  { id: 'irrigation-line', label: 'Irrigation Drip Line', make: makeIrrigationLine },
  { id: 'beehive', label: 'Beehive', make: makeBeehive },
  { id: 'hay-bale', label: 'Square Hay Bale', make: makeHayBale },
  { id: 'crate-stack', label: 'Harvest Crate Stack', make: makeCrateStack },
  { id: 'signpost', label: 'Plot Signpost', make: makeSignpost },
  { id: 'scarecrow', label: 'Scarecrow + Crow', make: makeScarecrow },
  { id: 'grow-tent', label: 'Indoor Grow Tent', make: makeGrowTent },
  { id: 'fruit-tree', label: 'Fruit Tree', make: makeFruitTree },
];
