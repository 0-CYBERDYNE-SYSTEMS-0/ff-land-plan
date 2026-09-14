/**
 * Lane E — Environments: miniature dioramas of the indoor/protected growing
 * archetypes at plausible 3–8 m footprints (~30–80 voxels on the long side —
 * NOT full-canvas shells). Each entry composes a parametric shell + interior
 * equipment + a few live crops via makeCropFor, all deterministically (fixed
 * seeds, no Math.random anywhere in the lane). Positions are in VOXELS
 * (1 voxel = 10 cm). No tune() (avoids the studio light-restore ordering
 * trap); tick omitted — nothing here needs motion.
 */
import * as THREE from 'three';
import type { AssetEntry } from '@/creative/registry-types';
import { makeCropFor } from '@/creative/crops/map';
import {
  makeContainerShell, makeGreenhouseShell, makeHoophouseShell, makeIndoorShell,
  makeTentShell, makeWarehouseShell,
} from './shells';
import * as I from './interior';

/** top face of a 2-step diorama floor plate (see makeFloorPlate) */
const FLOOR_Y = 1.85;

function compose(): { g: THREE.Group; put: (o: THREE.Object3D | null, x: number, y: number, z: number, ry?: number) => void } {
  const g = new THREE.Group();
  const put = (o: THREE.Object3D | null, x: number, y: number, z: number, ry = 0): void => {
    if (!o) return;
    o.position.set(x, y, z);
    if (ry) o.rotation.y = ry;
    g.add(o);
  };
  return { g, put };
}

// --- glass greenhouse: gravel floor, side benches, trained tomatoes (A2) ---
function envGreenhouse(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 4.2, dM: 6.4, style: 'gravel' }), 0, 0, 0);
  put(makeGreenhouseShell({ widthM: 4.2, depthM: 6.4 }), 0, 0, 0);
  put(I.makeBench({ wM: 3.4 }), -11.5, 0, -9, Math.PI / 2);
  put(I.makeBench({ wM: 3.4 }), 11.5, 0, -9, Math.PI / 2);
  const by = FLOOR_Y + 8.6; // bench top ≈ 0.86 m over the floor plate
  put(makeCropFor('Lettuce', 4), -11.5, by, -19);
  put(makeCropFor('Lettuce', 3), -11.5, by, -5);
  put(makeCropFor('Basil', 4), 11.5, by, -21);
  put(makeCropFor('Basil', 3), 11.5, by, -7);
  put(makeCropFor('Tomato', 5), 8.5, FLOOR_Y, 20);
  put(makeCropFor('Pepper', 4), -8.5, FLOOR_Y, 20);
  put(I.makeControllerPanel(), 17.5, 12.5, -29.6);
  return g;
}

// --- high tunnel: soil floor, in-ground beds with vine crops (A4) ---------
function envHoophouse(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 4.2, dM: 7, style: 'soil' }), 0, 0, 0);
  put(makeHoophouseShell({ widthM: 4.2, depthM: 7 }), 0, 0, 0);
  put(makeCropFor('Tomato', 5), -10, FLOOR_Y, -16);
  put(makeCropFor('Tomato', 4), -10, FLOOR_Y, 6);
  put(makeCropFor('Pepper', 4), 10, FLOOR_Y, -14);
  put(makeCropFor('Pepper', 3), 10, FLOOR_Y, 8);
  put(makeCropFor('Basil', 4), 10, FLOOR_Y, 24);
  put(makeCropFor('Lettuce', 4), -10, FLOOR_Y, 24);
  return g;
}

// --- grow tent: mylar floor, fabric pots, flood tray (A6) ------------------
function envGrowTent(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 2.8, dM: 2.8, style: 'mylar' }), 0, 0, 0);
  put(makeTentShell({ widthM: 2.8, depthM: 2.8 }), 0, 0, 0);
  put(I.makeFabricPot({ size: 1.1 }), 0, FLOOR_Y, -7);
  put(makeCropFor('Pepper', 4), 0, FLOOR_Y + 4, -7);
  put(I.makeFabricPot({ size: 0.85 }), -8, FLOOR_Y, -5);
  put(makeCropFor('Basil', 3), -8, FLOOR_Y + 3.1, -5);
  put(I.makeFabricPot({ size: 0.85 }), 8, FLOOR_Y, -5);
  put(makeCropFor('Basil', 4), 8, FLOOR_Y + 3.1, -5);
  put(I.makeFloodTable({ wM: 1.2 }), -5, FLOOR_Y, 6);
  put(makeCropFor('Lettuce', 2), -8, FLOOR_Y + 7.9, 6);
  put(makeCropFor('Lettuce', 3), -1, FLOOR_Y + 7.9, 6);
  return g;
}

// --- spare-room grow room: flood tables, ducting, barrels (A7) -------------
function envGrowRoom(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 4, dM: 4, style: 'concrete' }), 0, 0, 0);
  put(makeIndoorShell({ widthM: 4, depthM: 4 }), 0, 0, 0);
  put(I.makeFloodTable({ wM: 2.6 }), -3.5, FLOOR_Y, -11.5);
  put(I.makeFloodTable({ wM: 2.6 }), -3.5, FLOOR_Y, 3.5);
  const ty = FLOOR_Y + 7.9; // tray floor level
  put(makeCropFor('Lettuce', 4), -11, ty, -11.5);
  put(makeCropFor('Lettuce', 3), -1, ty, -11.5);
  put(makeCropFor('Lettuce', 4), 6, ty, -11.5);
  put(makeCropFor('Basil', 4), -10, ty, 3.5);
  put(makeCropFor('Basil', 3), 2, ty, 3.5);
  put(I.makeDuctRun({ wM: 3 }), -16, 18.5, -3, Math.PI / 2);
  put(I.makeDehumidifier(), 15, FLOOR_Y, 15);
  put(I.makeDosingBarrels({ count: 2 }), 12, FLOOR_Y, -15.5);
  put(I.makeControllerPanel(), -4, 13, -18);
  return g;
}

// --- home grow shelf corner: wire racks under a wall backdrop (A8) ---------
function envGrowShelf(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 3, dM: 2.6, style: 'concrete' }), 0, 0, 0);
  put(makeIndoorShell({ widthM: 3, depthM: 2.6 }), 0, 0, 0);
  put(I.makeWireShelf(), -11, FLOOR_Y, -5.5, Math.PI / 2);
  put(I.makeWireShelf(), -11, FLOOR_Y, 5.5, Math.PI / 2);
  put(I.makeWireShelf(), 7.5, FLOOR_Y, -8.5);
  put(makeCropFor('Basil', 2), -11, FLOOR_Y + 16.5, 5.5);
  put(I.makeFabricPot({ size: 0.8 }), 12.5, FLOOR_Y, 7);
  return g;
}

// --- vertical farm warehouse: rack canyons + tape + HVAC (A9) --------------
function envWarehouse(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 6, dM: 8, style: 'concrete' }), 0, 0, 0);
  put(makeWarehouseShell({ widthM: 6, depthM: 8 }), 0, 0, 0);
  put(I.makeRackRow({ wM: 5.2, tiers: 4 }), -17, FLOOR_Y, 0, Math.PI / 2);
  put(I.makeCo2Tank(), 21, FLOOR_Y, -26);
  put(I.makeControllerPanel(), -27.4, 12, 6, Math.PI / 2);
  put(I.makeDehumidifier(), 23, FLOOR_Y, 29);
  return g;
}

// --- shipping-container farm: pink-lit rack walls + dosing (A10) -----------
function envContainerFarm(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 2.6, dM: 6.4, style: 'concrete' }), 0, 0, 0);
  put(makeContainerShell({ widthM: 2.6, depthM: 6.4 }), 0, 0, 0);
  put(I.makeRackRow({ wM: 4.4, tiers: 4, glow: 'pink' }), -9.5, FLOOR_Y, -4, Math.PI / 2);
  put(I.makeRackRow({ wM: 4.4, tiers: 4, glow: 'pink' }), 9.5, FLOOR_Y, -4, Math.PI / 2);
  put(I.makeDosingBarrels({ count: 2 }), -5.5, FLOOR_Y, 26);
  put(I.makeStorageTank(), 7.5, FLOOR_Y, 25.5);
  put(I.makeControllerPanel(), 9.8, 11, 12, -Math.PI / 2);
  return g;
}

// --- aquaponics greenhouse: fish tanks + raft pond + swirl (A12) -----------
function envAquaponics(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 5, dM: 6, style: 'gravel' }), 0, 0, 0);
  put(makeGreenhouseShell({ widthM: 5, depthM: 6 }), 0, 0, 0);
  put(I.makeDwcRaft({ wM: 2.8, dM: 1.5 }), 9, FLOOR_Y, 8);
  put(I.makeFishTank({ diaM: 1.2 }), -15.5, FLOOR_Y, -18);
  put(I.makeFishTank({ diaM: 1.2 }), -15.5, FLOOR_Y, -3.5);
  put(I.makeSwirlFilter(), -15.5, FLOOR_Y, 13);
  const ry = FLOOR_Y + 2.6; // raft-board level
  put(makeCropFor('Lettuce', 4), 2, ry, 4);
  put(makeCropFor('Lettuce', 3), 12, ry, 7);
  put(makeCropFor('Basil', 4), 18, ry, 4);
  return g;
}

// --- NFT gully greenhouse: sloped channels + reservoirs (A11) --------------
function envNftGully(): THREE.Object3D {
  const { g, put } = compose();
  put(I.makeFloorPlate({ wM: 3.2, dM: 5, style: 'concrete' }), 0, 0, 0);
  put(makeGreenhouseShell({ widthM: 3.2, depthM: 5 }), 0, 0, 0);
  put(I.makeNftBench({ wM: 3.6, rows: 3 }), -7.5, FLOOR_Y, 0, Math.PI / 2);
  put(I.makeNftBench({ wM: 3.6, rows: 3 }), 7.5, FLOOR_Y, 0, Math.PI / 2);
  put(makeCropFor('Basil', 4), 0, FLOOR_Y, 20);
  return g;
}

export const entries: AssetEntry[] = [
  { id: 'env-greenhouse', label: 'Glass Greenhouse Grow', make: envGreenhouse },
  { id: 'env-hoophouse', label: 'High-Tunnel Hoophouse', make: envHoophouse },
  { id: 'env-grow-tent', label: 'Residential Grow Tent', make: envGrowTent },
  { id: 'env-grow-room', label: 'Spare-Room Grow Room', make: envGrowRoom },
  { id: 'env-grow-shelf', label: 'Home Grow Shelf Corner', make: envGrowShelf },
  { id: 'env-warehouse', label: 'Vertical Farm Warehouse', make: envWarehouse },
  { id: 'env-container-farm', label: 'Shipping-Container Farm', make: envContainerFarm },
  { id: 'env-aquaponics', label: 'Aquaponics Greenhouse', make: envAquaponics },
  { id: 'env-nft-gully', label: 'NFT Gully Greenhouse', make: envNftGully },
];
