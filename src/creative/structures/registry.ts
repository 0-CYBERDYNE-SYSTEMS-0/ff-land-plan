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
import {
  makeGrowLight, makePlantRack, makeHydroChannel, makeClipFan, makeHvacUnit, makeGrowBench,
} from './equipment';
import {
  makeFishTankAsset, makeHydroRaftAsset, makeDehumidifierAsset, makeSeedlingTrayAsset, makeCo2TankAsset,
} from './envEquipment';

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
  // Lane C equipment — indoor canvases (tent / warehouse / greenhouse).
  { id: 'grow-light', label: 'LED Light Bar', make: makeGrowLight },
  { id: 'plant-rack', label: 'Vertical Grow Rack', make: makePlantRack },
  { id: 'hydro-channel', label: 'Hydro NFT Channel', make: makeHydroChannel },
  { id: 'clip-fan', label: 'Clip Fan', make: makeClipFan },
  { id: 'hvac-unit', label: 'HVAC Unit', make: makeHvacUnit },
  { id: 'grow-bench', label: 'Potting Bench', make: makeGrowBench },
  // Environment equipment — hydro / climate plan assets (research Part B).
  { id: 'fish-tank', label: 'Round Fish Tank', make: makeFishTankAsset },
  { id: 'hydro-raft', label: 'DWC Hydro Raft Pond', make: makeHydroRaftAsset },
  { id: 'dehumidifier', label: 'Dehumidifier', make: makeDehumidifierAsset },
  { id: 'seedling-tray', label: 'Seedling Tray + Dome', make: makeSeedlingTrayAsset },
  { id: 'co2-tank', label: 'CO2 Tank + Regulator', make: makeCo2TankAsset },
];
