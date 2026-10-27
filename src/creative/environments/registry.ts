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
import { PALETTE, Voxel, group, mixColor } from '@/creative/voxel';
import {
  makeContainerShell, makeGreenhouseShell, makeHoophouseShell, makeIndoorShell,
  makeTentShell, makeWarehouseShell,
} from './shells';
import * as I from './interior';
import { T, cylShell, disc, ductX, glowMesh, solidMesh } from './kit';

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

// --- warehouse dressing (shell coords, y=0 ground): corrugated back wall,
// taped aisle, ducting riser, twin light rails over the glow lanes ---------
function warehouseDressing(): THREE.Object3D {
  const solid: Voxel[] = [];
  const HX = 30;
  const HZ = 40;
  // corrugated back-wall ribs above the rack tiers, plus one seam course
  for (let i = 0; i < 20; i++) {
    const x = -HX + 3 + i * 3;
    for (let y = 25.5; y <= 39.5; y += 1)
      solid.push({ x, y, z: -HZ + 2.3, s: 0.6, color: i % 2 === 0 ? T.panelDark : mixColor(T.panelDark, PALETTE.metal, 0.22) });
  }
  for (let x = -HX + 2; x <= HX - 2; x += 1)
    solid.push({ x, y: 32, z: -HZ + 2.4, s: 0.5, color: T.panelSeam });
  // same rhythm on the side wall, clear of the roll-up door
  for (let z = -HZ + 3; z <= HZ - 3; z += 3) {
    if (Math.abs(z) < 11) continue;
    for (let y = 0.5; y <= 39.5; y += 1)
      solid.push({ x: -HX + 2.3, y, z, s: 0.6, color: Math.round(z / 3) % 2 === 0 ? T.panelDark : mixColor(T.panelDark, PALETTE.metal, 0.22) });
  }
  // taped aisle: continuous gold run down the floor (the shell's own tape is buried)
  for (let z = -36; z <= 36; z += 0.5)
    solid.push({ x: -9, y: 1.95, z, s: 0.5, color: T.tape });
  // ducting riser with a lateral branch into the back wall
  cylShell(solid, 22, 14, 0.5, 36, 1.9, (y) => (Math.floor(y / 6) % 2 === 0 ? T.ductLight : PALETTE.metal), 1.4);
  solid.push({ x: 22, y: 37, z: 14, s: 2.3, color: PALETTE.metalDark });
  ductX(solid, 22, 27, 30, 14, 1.3, (x) => (Math.floor(x) % 2 === 0 ? T.ductLight : PALETTE.metal), 1.15);
  // ceiling light rails: twin channels straddling each glow lane
  for (const lx of [-16.5, 0, 16.5])
    for (let z = -35; z <= 35; z += 0.5)
      for (const dx of [-0.95, 0.95])
        solid.push({ x: lx + dx, y: 36.5, z, s: 0.5, color: PALETTE.metalDark });
  return solidMesh(solid);
}

// --- grow-tent dressing (shell coords): stitched seams, zippered near door
// with a half-open flap and interior glow, duct port with a short stub -----
function tentDressing(): THREE.Object3D {
  const solid: Voxel[] = [];
  const glow: Voxel[] = [];
  const HX = 14;
  const HZ = 14;
  // stitched seam bands across both far walls, proud of the mylar
  for (const y of [9, 17]) {
    for (let x = -HX + 2; x <= HX - 1; x += 0.8)
      solid.push({ x, y, z: -HZ + 3.4, s: 0.5, color: T.canvasBand });
    for (let z = -HZ + 2; z <= HZ - 1; z += 0.8)
      solid.push({ x: -HX + 3.4, y, z, s: 0.5, color: T.canvasBand });
  }
  // duct port through the left wall: flange ring + short flex stub into the room
  const py = 12;
  const pz = -4;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    solid.push({ x: -HX + 3.6, y: py + Math.sin(ang) * 2.2, z: pz + Math.cos(ang) * 2.2, s: 0.6, color: PALETTE.metalDark });
  }
  ductX(solid, -HX + 3.6, -HX + 7.6, py, pz, 1.6, (_x, i) => (i % 2 === 0 ? PALETTE.metal : PALETTE.metalDark), 1.0);
  // zippered door on the near side: jambs, zipper teeth, flap swung out on the left
  const zD = HZ + 0.6;
  for (let y = 0.5; y <= 19; y += 0.6)
    solid.push({ x: HX - 3.2, y, z: zD, s: 0.4, color: Math.round(y / 0.6) % 2 === 0 ? PALETTE.metal : PALETTE.metalDark });
  for (let y = 0.5; y <= 20; y += 1)
    solid.push({ x: HX - 0.4, y, z: zD, s: 0.8, color: PALETTE.metalDark });
  for (let x = HX - 9; x <= HX - 3.6; x += 1.6)
    for (let y = 0.8; y <= 19.2; y += 1.6) {
      const outward = x > HX - 6 ? 1 : 0; // the flap steps outward toward its free edge
      solid.push({ x, y, z: zD + outward, s: 1.6, color: Math.round(y / 4) % 2 === 0 ? T.canvas : T.canvasBand });
    }
  // warm lamp glow just inside the open part of the door
  for (let x = HX - 3; x <= HX - 1; x += 1.2)
    for (let y = 2; y <= 17; y += 1.5)
      glow.push({ x, y, z: HZ - 2.2, s: 1.2, color: T.glowWarm });
  return group([solidMesh(solid), glowMesh(glow)]);
}

// --- NFT gully channels (local: y=0 floor, placed at FLOOR_Y) -------------
const NFT_L = 36; // channel length along z; the low end is +z
const nftTop = (z: number): number => 6.4 - ((z + NFT_L / 2) / NFT_L) * 1.4;

function nftBanks(): THREE.Object3D {
  const solid: Voxel[] = [];
  const zA = -NFT_L / 2;
  const zB = NFT_L / 2;
  for (const cx of [-13, -10, -7, 7, 10, 13]) {
    // legs at both ends of each trough
    for (const lz of [zA + 1, zB - 1])
      for (let y = 0.5; y <= nftTop(lz) - 1.4; y += 1)
        solid.push({ x: cx, y, z: lz, s: 0.8, color: y % 3 === 0 ? PALETTE.ironDark : PALETTE.iron });
    for (let z = zA; z <= zB; z += 1) {
      const t = nftTop(z);
      // white trough: floor + side walls, sloping down toward +z
      for (const dx of [-0.9, 0, 0.9]) solid.push({ x: cx + dx, y: t - 0.9, z, s: 1.0, color: T.trayWhite });
      for (const dx of [-1.4, 1.4]) solid.push({ x: cx + dx, y: t - 0.4, z, s: 1.0, color: T.trayWhite });
      // flowing water down the gully, bright highlight every third cell
      solid.push({ x: cx, y: t - 0.3, z, s: 0.7, color: z % 3 === 0 ? PALETTE.waterLight : PALETTE.water });
    }
    // end caps at both ends
    for (const [ez, t] of [[zA - 1, nftTop(zA)], [zB + 1, nftTop(zB)]] as Array<[number, number]>)
      for (const dx of [-0.9, 0, 0.9])
        for (const dy of [-0.9, -0.4, 0.1])
          solid.push({ x: cx + dx, y: t + dy, z: ez, s: 1.0, color: T.trayWhite });
    // round net-pot cups with a lettuce in every one, spaced so water shows between
    for (let z = zA + 2; z <= zB - 2; z += 4) {
      const t = nftTop(z);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          solid.push({ x: cx + dx, y: t + 0.2, z: z + dz, s: 0.5, color: T.trayWhite });
        }
      solid.push({ x: cx, y: t + 0.25, z, s: 0.5, color: PALETTE.black });
      solid.push({ x: cx, y: t + 0.8, z, s: 0.7, color: PALETTE.leafLight });
      for (const [dx, dz] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]] as Array<[number, number]>)
        solid.push({ x: cx + dx, y: t + 0.7, z: z + dz, s: 0.5, color: PALETTE.leaf });
      solid.push({ x: cx, y: t + 1.25, z, s: 0.5, color: PALETTE.leafYoung });
    }
  }

  // header pipe down the aisle on posts, with a riser and feed hoses to every trough
  const headY = 3.4;
  for (const hz of [zA - 1, 0, 15])
    for (let y = 0.5; y <= 2.9; y += 1)
      solid.push({ x: 0, y, z: hz, s: 0.8, color: PALETTE.metalDark });
  for (let z = zA - 1; z <= 19; z += 1)
    solid.push({ x: 0, y: headY, z, s: 1.0, color: T.pipeBlack });
  for (let y = 3.9; y <= nftTop(zA) + 1; y += 0.8)
    solid.push({ x: 0, y, z: zA - 1, s: 0.8, color: T.pipeBlack });
  for (const cx of [-13, -10, -7, 7, 10, 13])
    ductX(solid, Math.min(0, cx), Math.max(0, cx), nftTop(zA) + 1, zA - 1, 0.45, () => T.pipeBlack, 1.0);

  // reservoir drum at the low end with a dark water lid, and a pump beside it
  const TZ = 21.5;
  cylShell(solid, 0, TZ, 0.5, 6.5, 2.0, (y) => (Math.floor(y) % 3 === 0 ? T.tankBlueDark : T.tankBlue), 1.0);
  disc(solid, 0, TZ, 7.0, 2.0, 1.0, () => PALETTE.waterDeep);
  solid.push({ x: -4.5, y: 1.2, z: TZ, s: 1.6, color: PALETTE.charcoal });
  ductX(solid, -3.4, -2.2, 2.4, TZ, 0.5, () => T.pipeBlack, 1.15);
  return solidMesh(solid);
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
  put(tentDressing(), 0, 0, 0);
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
  put(warehouseDressing(), 0, 0, 0);
  put(I.makeRackRow({ wM: 5.2, tiers: 4 }), -17, FLOOR_Y, 0, Math.PI / 2);
  put(I.makeRackRow({ wM: 5.2, tiers: 4 }), 10, FLOOR_Y, 0, Math.PI / 2);
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
  put(nftBanks(), 0, FLOOR_Y, 0);
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
