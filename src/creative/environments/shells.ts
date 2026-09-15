/**
 * Parametric environment shells — one maker per enclosed plan surface.
 * Meters in (1 voxel = 10 cm internally), centered at origin in XZ, ground
 * plane y = 0. Dollhouse discipline: the default camera looks from the +X/+Z
 * corner, so the FAR walls (-X, -Z) carry the material and the near faces are
 * glass, open or omitted. Greenhouse + hoophouse get translucent glazing
 * roofs; tent / indoor / warehouse stay open-topped (the warehouse reads
 * "hall" via 4 m far walls + truss beams + duct columns + hanging glow
 * strips — never a solid ceiling).
 *
 * Ownership: every call returns freshly built meshes (no cached templates, no
 * InstancedMesh) because the runtime disposeShell() traverses and disposes
 * everything. Voxel budget ≤ ~25k per shell — large planes use scaled blocks
 * (s 2–4), full-res s=1 only for signature details. No lights: glow reads via
 * unlit MeshBasicMaterial vertex colors. Deterministic seeds throughout.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, weighted } from '../structures/shared';
import { T, cylShell, ductX, glowMesh, paneMesh, solidMesh } from './kit';

export interface ShellSpec {
  /** plan canvas width in meters (X extent). */
  widthM: number;
  /** plan canvas depth in meters (Z extent). */
  depthM: number;
}

/** Spec → voxel extents, clamped so tiny canvases stay buildable (≥ 5 m). */
function shellVoxels(spec: ShellSpec): { wV: number; dV: number } {
  return {
    wV: Math.max(50, Math.round(spec.widthM * 10)),
    dV: Math.max(50, Math.round(spec.depthM * 10)),
  };
}

// ---------------------------------------------------------------------------
// Grow tent — 2.0 m black canvas box, open-topped, zipper + roof duct stubs +
// hanging carbon filter + warm LED glow (A6).
// ---------------------------------------------------------------------------

export function makeTentShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5101);
  const solid: Voxel[] = [];
  const glow: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const H = 20;
  const st = 2;
  const canvas = (y: number): number => (Math.floor(y / 4) % 2 === 0 ? T.canvas : T.canvasBand);

  // far walls: back (-Z) + left (-X), horizontal canvas panel bands
  for (let ix = 0; ix < wV / st; ix++)
    for (let iy = 0; iy < H / st; iy++) {
      const y = (iy + 0.5) * st;
      solid.push({ x: -hx + (ix + 0.5) * st, y, z: -hz + st / 2, s: st * 1.06, color: canvas(y) });
    }
  for (let iz = 0; iz < dV / st; iz++)
    for (let iy = 0; iy < H / st; iy++) {
      const y = (iy + 0.5) * st;
      solid.push({ x: -hx + st / 2, y, z: -hz + (iz + 0.5) * st, s: st * 1.06, color: canvas(y) });
    }

  // reflective mylar lining on the interior faces of both far walls
  for (let ix = 0; ix < (wV - 4) / 3; ix++)
    for (let iy = 0; iy < (H - 2) / 3; iy++)
      solid.push({
        x: -hx + 2.2 + ix * 3, y: 1.6 + iy * 3, z: -hz + 2.15,
        s: 2.0, color: ix % 3 === 0 ? T.mylarSeam : T.mylar,
      });
  for (let iz = 0; iz < (dV - 4) / 3; iz++)
    for (let iy = 0; iy < (H - 2) / 3; iy++)
      solid.push({
        x: -hx + 2.15, y: 1.6 + iy * 3, z: -hz + 2.2 + iz * 3,
        s: 2.0, color: iz % 3 === 0 ? T.mylarSeam : T.mylar,
      });

  // open top: partial lid bands at the far corner only (duct stubs live here)
  for (let ix = 0; ix < wV / st; ix++)
    for (let iz = 0; iz < 2; iz++)
      solid.push({ x: -hx + (ix + 0.5) * st, y: H + 1, z: -hz + (iz + 0.5) * st, s: st * 1.06, color: canvas(H) });
  for (let iz = 2; iz < (dV * 0.5) / st; iz++)
    for (let ix = 0; ix < 1; ix++)
      solid.push({ x: -hx + (ix + 0.5) * st, y: H + 1, z: -hz + (iz + 0.5) * st, s: st * 1.06, color: canvas(H) });

  // roof duct stubs exiting the lid band (+ cowl rings)
  cylShell(solid, -hx + 5.5, -hz + 2.2, 20.4, 24, 1.5, (_y, a) => (Math.cos(a) > 0.3 ? PALETTE.metal : PALETTE.metalDark), 1);
  solid.push({ x: -hx + 5.5, y: 24.5, z: -hz + 2.2, s: 1.9, color: PALETTE.metalDark });
  cylShell(solid, -hx + 2.2, -hz + 8, 20.4, 22.8, 1.1, () => PALETTE.metalDark, 1);

  // hanging carbon filter cylinder inside the back corner, strapped to the lid
  ductX(solid, -hx + 4.6, -hx + 10.4, 16.5, -hz + 3.6, 1.7, (_x, i) => (i % 3 === 0 ? PALETTE.charcoal : PALETTE.metalDark), 1.25);
  for (const sx of [-hx + 5.6, -hx + 9.4])
    for (let y = 17.6; y <= 20.6; y += 0.7)
      solid.push({ x: sx, y, z: -hz + 3.6, s: 0.3, color: PALETTE.black });

  // warm LED glow bar hanging mid-tent (unlit bright read, never a light)
  let gi = 0;
  for (let z = -hz + 4; z <= hz - 4; z += 2.5, gi++)
    glow.push({ x: -hx * 0.35, y: 14.5, z, s: 1.5, color: gi % 2 === 0 ? T.glowWarmHot : T.glowWarm });
  for (const hz2 of [-hz + 5, hz - 5])
    for (let y = 15.2; y <= 19.8; y += 0.7)
      solid.push({ x: -hx * 0.35, y, z: hz2, s: 0.3, color: PALETTE.metalDark });

  // zipper track up the near-right corner + slider; peeled door flap outside
  for (let y = 1; y <= 19; y += 0.8)
    solid.push({ x: hx - 0.75, y, z: hz - 0.55, s: 0.38, color: rand() < 0.3 ? PALETTE.metal : PALETTE.metalDark });
  solid.push({ x: hx - 0.75, y: 6.5, z: hz - 0.35, s: 0.55, color: PALETTE.ironDark });
  for (let iy = 0; iy < 3; iy++)
    for (let ix = 0; ix < 5; ix++)
      solid.push({
        x: -hx + 2.6 + ix * 1.6, y: 13.6 - iy * 1.7, z: hz + 0.95,
        s: 1.7, color: iy === 0 ? T.canvasBand : T.canvas,
      });

  // white floor tray lip just inside the walls (reads through the open mouth)
  const rim = (x: number, z: number): void => {
    solid.push({ x, y: 0.65, z, s: 1.9, color: rand() < 0.15 ? T.mylarSeam : T.mylar });
  };
  for (let ix = 0; ix < wV / st; ix++) {
    rim(-hx + (ix + 0.5) * st, -hz + 2);
    rim(-hx + (ix + 0.5) * st, hz - 2);
  }
  for (let iz = 0; iz < dV / st; iz++) {
    rim(-hx + 2, -hz + (iz + 0.5) * st);
    rim(hx - 2, -hz + (iz + 0.5) * st);
  }

  // tent poles proud at the four corners
  for (const [px, pz] of [[-hx + 1, -hz + 1], [hx - 1, -hz + 1], [-hx + 1, hz - 1], [hx - 1, hz - 1]] as Array<[number, number]>)
    for (let y = 1; y <= 20; y += 1)
      solid.push({ x: px, y, z: pz, s: 0.72, color: Math.round(y) % 4 === 0 ? PALETTE.metalDark : PALETTE.metal });

  return group([solidMesh(solid), glowMesh(glow)]);
}

// ---------------------------------------------------------------------------
// Indoor grow room — 2.6 m painted far walls, mylar panels, blackout door
// curtain with a glowing seam, wire-shelf hint (A7). Open-topped.
// ---------------------------------------------------------------------------

export function makeIndoorShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5201);
  const solid: Voxel[] = [];
  const glow: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const H = 26;
  const st = wV + dV > 520 ? 3 : 2;

  // painted far walls: dark baseboard, tan wainscot, pale upper — with a
  // subtle per-cell dither so the plaster reads, never noise
  const paint = (y: number): number => (y <= 1.2 ? T.paintTrim : y <= 9 ? T.paintLower : T.paintUpper);
  const wallCell = (x: number, z: number, y: number): void => {
    let c = paint(y);
    const r = rand();
    if (r < 0.05) c = mixColor(c, PALETTE.black, 0.12);
    else if (r > 0.96) c = mixColor(c, PALETTE.cream, 0.14);
    solid.push({ x, y, z, s: st * 1.06, color: c });
  };
  for (let ix = 0; ix < wV / st; ix++)
    for (let iy = 0; iy < H / st; iy++) {
      const y = (iy + 0.5) * st;
      wallCell(-hx + (ix + 0.5) * st, -hz + st / 2, y);
    }
  for (let iz = 1; iz < dV / st; iz++)
    for (let iy = 0; iy < H / st; iy++) {
      const y = (iy + 0.5) * st;
      wallCell(-hx + st / 2, -hz + (iz + 0.5) * st, y);
    }
  // top plate band closes the open-topped cut along the far walls
  for (let ix = 0; ix < wV / st; ix++)
    solid.push({ x: -hx + (ix + 0.5) * st, y: H - st * 0.45, z: -hz + st / 2, s: st * 1.12, color: T.paintTrim });
  for (let iz = 1; iz < dV / st; iz++)
    solid.push({ x: -hx + st / 2, y: H - st * 0.45, z: -hz + (iz + 0.5) * st, s: st * 1.12, color: T.paintTrim });

  // taped mylar reflector panels on the far walls (bright sheen + seams)
  const mylarPanel = (fixed: 'x' | 'z', center: number): void => {
    for (let a = 0; a < 6; a++)
      for (let b = 0; b < 6; b++) {
        const along = center - 6 + (a + 0.5) * 2;
        const y = 8 + (b + 0.5) * 2;
        const c = a === 0 || b === 0 ? T.mylarSeam : T.mylar;
        if (fixed === 'x') solid.push({ x: -hx + st / 2 + 0.75, y, z: along, s: 2.15, color: c });
        else solid.push({ x: along, y, z: -hz + st / 2 + 0.75, s: 2.15, color: c });
      }
  };
  if (dV >= 30) {
    mylarPanel('x', -hz * 0.45);
    mylarPanel('x', hz * 0.3);
  }
  if (wV >= 30) mylarPanel('z', hx * 0.35);

  // blackout door curtain on the back wall with a leaking glow seam
  const cx = Math.min(hx - 9, hx * 0.55);
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 11; b++)
      solid.push({
        x: cx + (a + 0.5) * 2, y: 1 + (b + 0.5) * 2, z: -hz + st / 2 - 0.7,
        s: 2.2, color: a === 1 ? T.canvasBand : T.canvas,
      });
  for (let x = cx - 1; x <= cx + 7; x += 1.4)
    solid.push({ x, y: 23.6, z: -hz + st / 2 - 0.7, s: 1.2, color: PALETTE.metalDark });
  for (let y = 2; y <= 22; y += 1.4)
    glow.push({ x: cx + 3, y, z: -hz - 0.15, s: 0.6, color: T.glowWarm });

  // wire shelving hint along the left wall: slats, brackets, trays, LED strip
  if (dV >= 34) {
    for (let z = -hz + 7; z <= -hz + 19; z += 1.4)
      solid.push({ x: -hx + 3.6, y: 12, z, s: 1.15, color: PALETTE.metal });
    for (const bz of [-hz + 7, -hz + 13, -hz + 19]) {
      solid.push({ x: -hx + 1.6, y: 11, z: bz, s: 0.8, color: PALETTE.metalDark });
      solid.push({ x: -hx + 2.6, y: 11.5, z: bz, s: 0.7, color: PALETTE.ironDark });
    }
    for (const tz of [-hz + 9.5, -hz + 15.5]) {
      for (let a = 0; a < 5; a++)
        for (let b = 0; b < 3; b++)
          solid.push({ x: -hx + 3.6 + b * 1.0 - 1, y: 12.55, z: tz + a * 1.1 - 2.2, s: 1.0, color: T.trayWhite });
      for (let a = 0; a < 4; a++)
        if (rand() < 0.85)
          solid.push({
            x: -hx + 3.6 + (rand() < 0.5 ? -0.6 : 0.6), y: 13.2, z: tz + a * 1.3 - 2,
            s: 0.7, color: rand() < 0.5 ? PALETTE.leafLight : PALETTE.leafYoung,
          });
    }
    for (let z = -hz + 8; z <= -hz + 18; z += 2.2)
      glow.push({ x: -hx + 3.6, y: 11.35, z, s: 1.2, color: T.glowWarm });
  }

  // timer box + dangling cord on the back wall
  solid.push({ x: -hx * 0.35, y: 15.5, z: -hz + 1.6, s: 2.4, color: PALETTE.charcoal });
  solid.push({ x: -hx * 0.35, y: 15.5, z: -hz + 2.9, s: 1.2, color: T.screenGlow });
  solid.push({ x: -hx * 0.35, y: 15.1, z: -hz + 2.9, s: 0.4, color: T.ledGreen });
  for (let y = 14; y >= 2; y -= 1.1)
    solid.push({ x: -hx * 0.35, y, z: -hz + 1.9, s: 0.26, color: PALETTE.black });

  return group([solidMesh(solid), glowMesh(glow)]);
}

// ---------------------------------------------------------------------------
// Greenhouse — 2.9 m ridge glazed A-frame, white mullion grid, ridge vents,
// thermal-screen hint plane (A2/A3). Translucent roof by policy.
// ---------------------------------------------------------------------------

export function makeGreenhouseShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5301);
  const solid: Voxel[] = [];
  const glass: Voxel[] = [];
  const screen: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const eave = 16;
  const ridge = 29;
  const roofY = (x: number): number => eave + (ridge - eave) * (1 - Math.abs(x) / hx);
  // scale pane blocks so the merged geometry stays in budget on huge canvases
  const st = Math.min(4, Math.max(2, Math.ceil(Math.sqrt((2 * hx * dV) / 8000))));

  // concrete curb ring grounding the frame
  for (let ix = 0; ix < wV / 2; ix++) {
    const x = -hx + (ix + 0.5) * 2;
    solid.push({ x, y: 1, z: -hz + 1, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
    solid.push({ x, y: 1, z: hz - 1, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
  }
  for (let iz = 1; iz < dV / 2; iz++) {
    const z = -hz + (iz + 0.5) * 2;
    solid.push({ x: -hx + 1, y: 1, z, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
    solid.push({ x: hx - 1, y: 1, z, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
  }

  // glazed side walls (translucent — near sides included, glass is allowed);
  // pane rows are centered over the curb→eave span so the top course meets
  // the eave ring whatever block scale the canvas forced
  const rowsW = Math.max(1, Math.round((eave - 2.5) / st));
  const stepY = (eave - 2.5) / rowsW;
  const paneS = Math.max(st, stepY) * 1.05;
  for (let iy = 0; iy < rowsW; iy++) {
    const y = 2.5 + (iy + 0.5) * stepY;
    for (let ix = 0; ix < wV / st; ix++) {
      const x = -hx + (ix + 0.5) * st;
      glass.push({ x, y, z: -hz + st / 2, s: paneS, color: T.glassPane });
      glass.push({ x, y, z: hz - st / 2, s: paneS, color: T.glassPane });
    }
    for (let iz = 1; iz < dV / st; iz++) {
      const z = -hz + (iz + 0.5) * st;
      glass.push({ x: -hx + st / 2, y, z, s: paneS, color: T.glassPane });
      glass.push({ x: hx - st / 2, y, z, s: paneS, color: T.glassPane });
    }
  }

  // glazed gable ends filling the roof triangle
  for (let ix = 0; ix < wV / st; ix++) {
    const x = -hx + (ix + 0.5) * st;
    const top = roofY(x);
    for (let y = eave; y <= top; y += st) {
      glass.push({ x, y: y + st / 2, z: -hz + st / 2, s: st * 1.05, color: T.glassPane });
      glass.push({ x, y: y + st / 2, z: hz - st / 2, s: st * 1.05, color: T.glassPane });
    }
  }

  // roof planes: stepped panes following the slope on both sides of the ridge
  const ventBands: Array<[number, number]> = [
    [-hz + dV * 0.24, -hz + dV * 0.34],
    [-hz + dV * 0.62, -hz + dV * 0.72],
  ];
  const inVent = (x: number, z: number): boolean => {
    if (x < st || x > hx * 0.45) return false;
    return ventBands.some(([za, zb]) => z >= za && z <= zb);
  };
  for (let ix = 0; ix < wV / st; ix++) {
    const x = -hx + (ix + 0.5) * st;
    if (Math.abs(x) < st * 0.75) continue; // ridge beam takes the center
    const yr = Math.round(roofY(x) * 2) / 2;
    for (let iz = 0; iz < dV / st; iz++) {
      const z = -hz + (iz + 0.5) * st;
      if (inVent(x, z)) continue; // propped-open vent slots
      glass.push({ x, y: yr, z, s: st * 1.12, color: T.glassPane });
    }
  }

  // white mullion grid: vertical wall posts + eave ring + ridge + roof bars
  const mullStep = Math.max(10, Math.round(wV / 12));
  const mullXs: number[] = [];
  for (let x = -hx + mullStep; x < hx - 2; x += mullStep) mullXs.push(x);
  for (const mx of mullXs)
    for (const wz of [-hz + 1, hz - 1])
      for (let y = 2.5; y <= eave; y += 2)
        solid.push({ x: mx, y, z: wz, s: 1.05, color: C.frameWhite });
  for (const wz of [-hz + 1, hz - 1])
    for (let x = -hx + 2; x <= hx - 2; x += 2.2)
      solid.push({ x, y: eave + 0.3, z: wz, s: 1.1, color: C.frameWhite });
  for (const mx of [-hx + 1, hx - 1])
    for (let z = -hz + 2; z <= hz - 2; z += 2.2)
      solid.push({ x: mx, y: eave + 0.3, z, s: 1.1, color: C.frameWhite });
  // roof glazing bars running DOWN the slope, spaced along the ridge (the
  // A-frame grid signature — kept sparse so big canvases stay in budget)
  const barStepZ = Math.max(10, Math.round(dV / 12));
  for (let z = -hz + barStepZ; z < hz - 4; z += barStepZ)
    for (let x = -hx + 2; Math.abs(x) < hx - 1; x += 3)
      solid.push({ x, y: Math.round(roofY(x) * 2) / 2 + 0.4, z, s: 1.0, color: C.frameWhite });
  // ridge beam + finials at both gable peaks
  for (let z = -hz; z <= hz; z += 2.2)
    solid.push({ x: 0, y: ridge + 0.35, z, s: 1.25, color: C.frameWhite });
  for (const gz of [-hz, hz]) {
    solid.push({ x: 0, y: ridge + 1.4, z: gz, s: 1.0, color: PALETTE.metal });
    solid.push({ x: 0, y: ridge + 2.2, z: gz, s: 0.55, color: PALETTE.metalDark });
  }

  // ridge vent flaps hovering over the open slots on wax-jack posts
  for (const [za, zb] of ventBands)
    for (let ix = 0; ix < (hx * 0.45) / st; ix++) {
      const x = st + (ix + 0.5) * st;
      const yr = Math.round(roofY(x) * 2) / 2;
      for (let z = za + st / 2; z <= zb; z += st)
        glass.push({ x, y: yr + 1.5, z, s: st * 1.05, color: T.glassPane });
    }
  for (const [za] of ventBands)
    for (const pz of [za + 1.5, za + (ventBands[0][1] - ventBands[0][0]) - 1.5]) {
      const yr = Math.round(roofY(st * 2) * 2) / 2;
      solid.push({ x: st * 2, y: yr + 0.2, z: pz, s: 0.55, color: PALETTE.metal });
    }
  // vent rack motor box on the ridge above the forward vent
  solid.push({ x: st * 2, y: ridge + 1.1, z: -hz + dV * 0.28, s: 1.6, color: PALETTE.metalDark });

  // thermal-screen hint: a taut pale second ceiling half-drawn over the far side
  for (let x = -hx + 3; x <= -hx * 0.12; x += 4)
    for (let z = -hz + 3; z <= hz * 0.15; z += 4)
      screen.push({ x, y: 17.5, z, s: 4.15, color: T.screenCloth });

  // dutch door on the near gable: white frame, solid lower panel, glazed top
  const doorTop = Math.min(21, ridge - 4);
  for (let y = 2.5; y <= 11; y += 1.2)
    for (let x = -2.5; x <= 2.5; x += 1.25)
      solid.push({ x, y, z: hz - 0.6, s: 1.28, color: rand() < 0.15 ? mixColor(C.frameWhite, PALETTE.gravelDark, 0.2) : C.frameWhite });
  for (let y = 11; y <= doorTop; y += 1.4)
    for (let x = -2.5; x <= 2.5; x += 1.4)
      glass.push({ x, y, z: hz - 0.6, s: 1.35, color: T.glassPane });
  for (const dx of [-3.3, 3.3])
    for (let y = 2.5; y <= doorTop; y += 1.3)
      solid.push({ x: dx, y, z: hz - 0.6, s: 1.35, color: C.frameWhite });
  for (let x = -3.3; x <= 3.3; x += 1.3)
    solid.push({ x, y: doorTop + 0.7, z: hz - 0.6, s: 1.35, color: C.frameWhite });
  solid.push({ x: 2.7, y: 9.5, z: hz - 0.1, s: 0.55, color: PALETTE.metal });

  // louvre vents across the far gable
  for (let x = -4; x <= 4; x += 1.2)
    for (const ly of [12.5, 14, 15.5])
      solid.push({ x, y: ly, z: -hz + 0.7, s: 1.15, color: ly === 14 ? mixColor(C.frameWhite, PALETTE.gravelDark, 0.25) : C.frameWhite });

  return group([
    solidMesh(solid),
    paneMesh(glass, 0.35, PALETTE.glass),
    paneMesh(screen, 0.5, T.screenCloth),
  ]);
}

// ---------------------------------------------------------------------------
// Hoophouse — 3.2 m quonset hoop arcs on visible legs, translucent poly film,
// roll-up side crease, wooden end wall with a plain door, in-ground bed hint
// (A4). Gothic-ish profile: straight legs then a half-ellipse.
// ---------------------------------------------------------------------------

export function makeHoophouseShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5401);
  const solid: Voxel[] = [];
  const film: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const legH = 10;
  const peak = 32;
  const rollY = 13;
  const prof = (x: number): number =>
    legH + (peak - legH) * Math.sqrt(Math.max(0, 1 - (x / hx) ** 2));
  // film block scale: big canvases need coarser cubes to stay in budget
  const st = wV * dV > 30000 ? 3 : 2;
  const rx = wV > 160 ? 2 : 1.2; // rib resolution

  // poly film skin hugging the arch; the near (+X) side is rolled up above
  // rollY so the interior reads through the open skirt
  for (let ix = 0; ix < wV / st; ix++) {
    const x = -hx + (ix + 0.5) * st;
    const yr = Math.round(prof(x) * 2) / 2;
    if (x > 0 && yr < rollY) continue; // rolled away below the roll bar
    for (let iz = 0; iz < dV / st; iz++)
      film.push({ x, y: yr, z: -hz + (iz + 0.5) * st, s: st * 1.18, color: PALETTE.polyFilm });
  }
  // far-side skirt: outermost columns run the film down to the baseboards
  for (let iy = 0; iy < legH / st; iy++)
    for (let iz = 0; iz < dV / st; iz++)
      film.push({
        x: -hx + st / 2, y: (iy + 0.5) * st, z: -hz + (iz + 0.5) * st,
        s: st * 1.18, color: PALETTE.polyFilm,
      });

  // roll-up crease signature: darker film band at roll height on the far side
  const xC = hx * Math.sqrt(Math.max(0, 1 - ((rollY - legH) / (peak - legH)) ** 2));
  for (let z = -hz + 2; z <= hz - 2; z += st * 1.6)
    film.push({ x: -xC, y: rollY, z, s: st * 1.3, color: T.filmRoll });
  // roll bar tube + gathered film above it on the near side
  for (let z = -hz + 2; z <= hz - 2; z += 3)
    solid.push({ x: xC, y: rollY, z, s: 1.5, color: PALETTE.metalDark });
  for (let z = -hz + 3; z <= hz - 3; z += 6)
    film.push({ x: xC - 0.6, y: rollY + 1.6, z, s: 2.0, color: T.filmRoll });

  // galvanized hoop ribs every ~1.2–1.5 m, on the full arch (ribs stay put
  // when the film rolls up — that's the read)
  const ribStep = Math.max(12, Math.round(dV / 14));
  const ribTone = (): number => (rand() < 0.35 ? mixColor(PALETTE.metal, PALETTE.metalDark, 0.35) : PALETTE.metal);
  for (let z = -hz + 4; z <= hz - 4; z += ribStep) {
    for (let x = -hx + 1; x <= hx - 1; x += rx)
      solid.push({ x, y: Math.round(prof(x) * 2) / 2 + 0.3, z, s: rx * 1.02, color: ribTone() });
    for (const lx of [-hx + 0.9, hx - 0.9])
      for (let y = 0.5; y <= prof(hx - 1); y += 1.2)
        solid.push({ x: lx, y, z, s: 1.15, color: ribTone() }); // visible hoop legs
  }

  // wooden baseboards pinning the skirt + ground pegs
  for (let z = -hz; z <= hz; z += 2) {
    solid.push({ x: -hx + 0.7, y: 0.7, z, s: 1.35, color: rand() < 0.25 ? C.postWood : mixColor(C.postWood, PALETTE.wood, 0.4) });
    solid.push({ x: hx - 0.7, y: 0.7, z, s: 1.35, color: rand() < 0.25 ? C.postWood : mixColor(C.postWood, PALETTE.wood, 0.4) });
  }
  for (let z = -hz + 6; z <= hz - 6; z += 12)
    for (const px of [-hx - 0.5, hx + 0.5]) {
      solid.push({ x: px, y: 0.35, z, s: 1.1, color: weighted([[PALETTE.soilDark, 0.6], [PALETTE.soil, 0.4]], rand()) });
      solid.push({ x: px, y: 1.1, z, s: 0.4, color: PALETTE.metalDark });
    }

  // purlins + ridge tube tying the ribs together
  for (const px of [-hx * 0.62, -hx * 0.25, hx * 0.25, hx * 0.62])
    for (let z = -hz + 2; z <= hz - 2; z += 3)
      solid.push({ x: px, y: prof(px) + 0.25, z, s: 1.05, color: T.galvDark });
  for (let z = -hz; z <= hz; z += 3)
    solid.push({ x: 0, y: peak + 0.35, z, s: 1.2, color: T.galvDark });

  // wooden end wall at the far (-Z) gable, horizontal plank bands following
  // the arch, with a plain door cut to grade
  const ewSt = wV > 160 ? 2 : 1.5;
  for (let x = -hx + 1.5; x <= hx - 1.5; x += ewSt) {
    const top = Math.round(prof(x));
    const inDoor = Math.abs(x) <= 3.2;
    for (let y = 1; y <= top; y += 2) {
      if (inDoor && y <= 20) continue;
      let c = plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
      if (rand() < 0.08) c = mixColor(c, PALETTE.black, 0.18);
      solid.push({ x, y: y + 0.6, z: -hz + 1, s: 2.1, color: c });
    }
  }
  // gable arch trim boards at both ends
  for (const gz of [-hz + 0.6, hz - 0.6])
    for (let x = -hx + 1; x <= hx - 1; x += 1.4)
      solid.push({ x, y: prof(x) + 0.1, z: gz, s: 1.35, color: C.postWood });
  // plain door: vertical boards, cross rail, black handle
  for (let y = 1; y <= 20; y += 1.4)
    for (let x = -3; x <= 3; x += 1.4)
      solid.push({ x, y: y + 0.4, z: -hz - 0.4, s: 1.5, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
  for (let x = -3.2; x <= 3.2; x += 1.2) solid.push({ x, y: 12, z: -hz - 0.4, s: 1.1, color: C.postWood });
  solid.push({ x: 2.6, y: 10.5, z: -hz - 1.1, s: 0.55, color: PALETTE.metalDark });
  // near end stays open: just door-frame posts + header to silhouette the cut
  for (const dx of [-3.6, 3.6])
    for (let y = 1; y <= 22; y += 1.4)
      solid.push({ x: dx, y, z: hz - 1.2, s: 1.4, color: C.postWood });
  for (let x = -3.6; x <= 3.6; x += 1.4)
    solid.push({ x, y: 22.6, z: hz - 1.2, s: 1.4, color: C.postWood });

  // in-ground bed hint: two dithered soil strips running the length (block
  // scale grows with the canvas so huge tunnels stay inside the voxel budget)
  if (wV >= 26) {
    const bedSt = wV > 160 ? 4 : 2;
    for (const [b0, b1] of [[-0.55 * hx, -0.18 * hx], [0.18 * hx, 0.55 * hx]] as Array<[number, number]>)
      for (let x = b0; x <= b1; x += bedSt)
        for (let z = -hz + 4; z <= hz - 4; z += bedSt)
          solid.push({
            x, y: bedSt * 0.44, z, s: bedSt * 1.04,
            color: weighted([[PALETTE.soilDark, 0.45], [PALETTE.soil, 0.4], [PALETTE.mulch, 0.15]], rand()),
          });
  }

  return group([solidMesh(solid), paneMesh(film, 0.3, PALETTE.polyFilm)]);
}

// ---------------------------------------------------------------------------
// Warehouse vertical farm — 4.0 m dark far walls, roof trusses + duct columns
// + hanging glow strips at wall height (never a solid ceiling), coarse
// glowing rack row along the far wall, dashed floor tape, HVAC column (A9).
// ---------------------------------------------------------------------------

export function makeWarehouseShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5501);
  const solid: Voxel[] = [];
  const glow: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const H = 40;
  const st = wV + dV > 520 ? 3 : 2;

  // dark far walls with vertical seam columns every 12 voxels; rows are
  // centered over 0..H so the parapet lands at the 4 m mark exactly
  const panel = (i: number): number =>
    i % 12 < st ? T.panelSeam : rand() < 0.06 ? mixColor(T.panelDark, PALETTE.black, 0.2) : T.panelDark;
  const rowsH = Math.max(1, Math.round(H / st));
  const stepH = H / rowsH;
  const wallS = Math.max(st, stepH) * 1.06;
  for (let iy = 0; iy < rowsH; iy++) {
    const y = (iy + 0.5) * stepH;
    for (let ix = 0; ix < wV / st; ix++)
      solid.push({ x: -hx + (ix + 0.5) * st, y, z: -hz + st / 2, s: wallS, color: panel(ix) });
    for (let iz = 1; iz < dV / st; iz++)
      solid.push({ x: -hx + st / 2, y, z: -hz + (iz + 0.5) * st, s: wallS, color: panel(iz) });
  }
  // concrete curb + safety yellow curb line at the wall bases
  for (let ix = 0; ix < wV / 2; ix++) {
    const x = -hx + (ix + 0.5) * 2;
    solid.push({ x, y: 0.9, z: -hz + 1.4, s: 2.1, color: T.concrete });
    solid.push({ x, y: 2.3, z: -hz + 1.4, s: 1.6, color: T.tape });
  }
  for (let iz = 1; iz < dV / 2; iz++) {
    const z = -hz + (iz + 0.5) * 2;
    solid.push({ x: -hx + 1.4, y: 0.9, z, s: 2.1, color: T.concrete });
    solid.push({ x: -hx + 1.4, y: 2.3, z, s: 1.6, color: T.tape });
  }

  // roof trusses spanning X at intervals — beams + king posts, NO ceiling
  const trussStep = Math.max(24, Math.round(dV / 8));
  for (let z = -hz + trussStep; z < hz - 4; z += trussStep) {
    for (let x = -hx + 3; x <= hx - 3; x += 2.4)
      solid.push({ x, y: 33, z, s: 2.4, color: T.galvDark }); // bottom tie
    for (let x = -hx + 6; x <= hx - 6; x += 3)
      solid.push({ x, y: 38, z, s: 1.8, color: mixColor(PALETTE.metal, PALETTE.metalDark, 0.4) }); // top chord
    for (const px of [-hx * 0.5, 0, hx * 0.5])
      for (let y = 33.5; y < 38; y += 1.6)
        solid.push({ x: px, y, z, s: 1.5, color: PALETTE.iron }); // king posts
  }

  // hanging glow strips at wall height (unlit bright bars down the lanes)
  const lanes = [-hx * 0.55, 0, hx * 0.55].filter((lx) => Math.abs(lx) < hx - 4);
  let li = 0;
  for (const lx of lanes) {
    for (let z = -hz + 5; z <= hz - 5; z += 3)
      glow.push({ x: lx, y: 36.5, z, s: 1.6, color: (li + Math.round(z / 3)) % 3 === 1 ? T.glowWarmHot : T.glowWarm });
    for (let z = -hz + 10; z <= hz - 10; z += 14)
      for (let y = 37.2; y <= 38.2; y += 0.8)
        solid.push({ x: lx, y, z, s: 0.35, color: PALETTE.metalDark });
    li++;
  }

  // vertical duct columns along the far wall
  for (const cz of [-hz + dV * 0.28, hz - dV * 0.3]) {
    cylShell(solid, -hx + 4, cz, 0.5, 36, 1.9, (y) => (Math.floor(y / 6) % 2 === 0 ? T.ductLight : PALETTE.metal), 1.4);
    solid.push({ x: -hx + 4, y: 37, z: cz, s: 2.3, color: PALETTE.metalDark });
  }

  // HVAC column near the far corner: louvered box + top fan + status light
  const hcx = -hx + 7.5;
  const hcz = -hz + 7.5;
  for (let y = 1.3; y <= 28; y += 2.2)
    for (let dx = -3.5; dx <= 3.5; dx += 2.2)
      for (let dz = -3.5; dz <= 3.5; dz += 2.2) {
        if (dx > -3 && dx < 3 && dz > -3 && dz < 3 && y < 27) continue;
        solid.push({ x: hcx + dx, y, z: hcz + dz, s: 2.25, color: rand() < 0.08 ? T.panelSeam : T.panelDark });
      }
  for (let y = 6; y <= 24; y += 5)
    for (let d = -3.2; d <= 3.2; d += 1.5) {
      solid.push({ x: hcx + d, y, z: hcz + 3.9, s: 1.4, color: T.panelSeam });
      solid.push({ x: hcx + 3.9, y, z: hcz + d, s: 1.4, color: T.panelSeam });
    }
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    solid.push({ x: hcx + Math.cos(ang) * 2.6, y: 29.4, z: hcz + Math.sin(ang) * 2.6, s: 1.15, color: T.panelSeam });
  }
  solid.push({ x: hcx, y: 29.6, z: hcz, s: 1.6, color: PALETTE.metalDark });
  glow.push({ x: hcx + 3.2, y: 26.5, z: hcz + 3.9, s: 0.6, color: T.ledGreen });

  // coarse glowing multi-tier rack row along the far (-Z) wall
  const rackL = dV - 12;
  const rackX0 = -rackL / 2;
  for (const ty of [5, 11, 17, 23]) {
    for (let x = rackX0; x <= rackX0 + rackL; x += 2)
      for (let z = -hz + 3; z <= -hz + 8; z += 2)
        solid.push({ x, y: ty, z, s: 2.05, color: rand() < 0.15 ? PALETTE.metalDark : mixColor(PALETTE.metal, PALETTE.metalDark, 0.3) });
    for (let x = rackX0 + 1; x <= rackX0 + rackL - 1; x += 2.5)
      glow.push({ x, y: ty + 1.9, z: -hz + 5.5, s: 1.3, color: Math.round(x / 2.5) % 2 === 0 ? T.glowWarmHot : T.glowWarm });
    for (let x = rackX0; x <= rackX0 + rackL; x += 2)
      if (rand() < 0.72)
        solid.push({
          x, y: ty + 1.1, z: -hz + 5.5, s: 1.5,
          color: weighted([[PALETTE.leaf, 0.5], [PALETTE.leafLight, 0.3], [PALETTE.leafDark, 0.2]], rand()),
        });
  }
  for (let x = rackX0; x <= rackX0 + rackL; x += 12)
    for (const pz of [-hz + 3.5, -hz + 7.5])
      for (let y = 0.5; y <= 24; y += 1.4)
        solid.push({ x, y, z: pz, s: 1.35, color: y % 4 < 1.4 ? PALETTE.metalDark : PALETTE.iron });

  // dashed floor tape lines marking the aisle
  for (const lx of [-hx * 0.28, hx * 0.42]) {
    if (Math.abs(lx) > hx - 4) continue;
    for (let z = -hz + 4; z <= hz - 4; z += 2.2)
      solid.push({ x: lx, y: 0.45, z, s: 0.85, color: T.tape });
  }

  return group([solidMesh(solid), glowMesh(glow)]);
}

// ---------------------------------------------------------------------------
// Shipping container shell (diorama support) — corrugated ISO box cut away
// dollhouse-style on the near faces: solid far end + far wall, near end open
// with one swung door leaf, near wall reduced to base/roof bands. Corner
// castings, fork pockets, rooftop condenser stack + cable umbilical (A10).
// ---------------------------------------------------------------------------

export function makeContainerShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5601);
  const solid: Voxel[] = [];
  const { wV, dV } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  const H = 26;
  const st = 2;

  const rustTone = (): number =>
    weighted([[T.rust, 0.5], [T.rustDark, 0.28], [T.rustLight, 0.14], [PALETTE.woodDark, 0.08]], rand());
  // corrugation: alternating proud ridge columns read as vertical ribs
  const corrug = (x: number, y: number, z: number, ridge: boolean): void => {
    solid.push({
      x: x + (ridge ? Math.sign(x) * 0.35 : 0), y, z,
      s: ridge ? 1.35 : 1.7,
      color: ridge ? rustTone() : mixColor(T.rustDark, PALETTE.black, 0.12),
    });
  };

  // far (-X) long wall: full corrugated
  for (let iz = 0; iz < dV / st; iz++)
    for (let iy = 0; iy < H / st; iy++) {
      const z = -hz + (iz + 0.5) * st;
      const y = (iy + 0.5) * st;
      corrug(-hx + st / 2, y, z, iz % 2 === 0);
    }
  // far (-Z) end wall: full corrugated + four lock rods
  for (let ix = 0; ix < wV / st; ix++)
    for (let iy = 0; iy < H / st; iy++) {
      const x = -hx + (ix + 0.5) * st;
      const y = (iy + 0.5) * st;
      corrug(x, y, -hz + st / 2, ix % 2 === 0);
    }
  for (const rx2 of [-hx + 6, -hx + 12, hx - 12, hx - 6])
    for (let y = 1; y <= H - 1; y += 1.6)
      solid.push({ x: rx2, y, z: -hz - 0.6, s: 0.8, color: mixColor(PALETTE.metal, PALETTE.metalDark, 0.4) });
  for (const rx2 of [-hx + 6, -hx + 12, hx - 12, hx - 6]) {
    solid.push({ x: rx2, y: 3.5, z: -hz - 1.1, s: 1.0, color: PALETTE.ironDark });
    solid.push({ x: rx2, y: H - 3.5, z: -hz - 1.1, s: 1.0, color: PALETTE.ironDark });
  }

  // near (+X) long wall cut away: keep a base band, a roof band and a corner
  // return so the box still reads as a container
  for (let iz = 0; iz < dV / st; iz++) {
    const z = -hz + (iz + 0.5) * st;
    for (let iy = 0; iy < 2; iy++)
      corrug(hx - st / 2, (iy + 0.5) * st, z, iz % 2 === 0);
    for (let iy = Math.floor((H - 4) / st); iy < H / st; iy++)
      corrug(hx - st / 2, (iy + 0.5) * st, z, iz % 2 === 0);
  }
  for (let iy = 0; iy < H / st; iy++)
    for (let ix = 0; ix < 3; ix++) {
      const z = -hz + (ix + 0.5) * st;
      corrug(hx - st / 2, (iy + 0.5) * st, z, ix % 2 === 0); // far corner return
    }

  // near (+Z) end: door frame + one leaf swung open flat along the +X side
  for (const dx of [-hx + 1.2, hx - 1.2])
    for (let y = 0.6; y <= H; y += 1.5)
      solid.push({ x: dx, y, z: hz - 1.2, s: 1.7, color: mixColor(T.rustDark, PALETTE.black, 0.1) });
  for (let x = -hx + 1; x <= hx - 1; x += 1.8)
    solid.push({ x, y: H + 0.4, z: hz - 1.2, s: 1.8, color: mixColor(T.rustDark, PALETTE.black, 0.1) });
  for (let iz = 0; iz < 10 / st; iz++)
    for (let iy = 0; iy < H / st; iy++) {
      const z = hz + 1.2 + (iz + 0.5) * st;
      const y = (iy + 0.5) * st;
      corrug(hx + 1.2 + (iz + 0.5) * st - st / 2, y, z, iz % 2 === 0); // swung leaf along +X
    }

  // roof rim + corrugated roof strip along the far edge
  for (let ix = 0; ix < wV / st; ix++)
    for (let iz = 0; iz < dV / st; iz++) {
      const x = -hx + (ix + 0.5) * st;
      const z = -hz + (iz + 0.5) * st;
      const edge = iz < 2 || ix < 2 || ix >= wV / st - 2;
      if (!edge) continue;
      solid.push({ x, y: H + 1, z, s: st * 1.06, color: mixColor(T.rustDark, PALETTE.black, 0.15) });
    }

  // corner castings at all four corners (top + bottom), slightly proud
  for (const [px, pz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]] as Array<[number, number]>)
    for (const py of [1.5, H - 1.5]) {
      solid.push({ x: px, y: py, z: pz, s: 3.1, color: mixColor(T.rustDark, PALETTE.black, 0.25) });
      solid.push({ x: px, y: py, z: pz + (pz < 0 ? -1.1 : 1.1), s: 1.6, color: PALETTE.black });
    }

  // forklift pockets in the base rail of the far end
  for (const fx of [-hx + wV * 0.28, -hx + wV * 0.62])
    for (let z = -hz - 0.4; z <= -hz + 2.4; z += 1.6)
      for (let y = 1.2; y <= 3.4; y += 1.6)
        solid.push({ x: fx, y, z, s: 1.5, color: PALETTE.black });

  // rooftop condenser stack + cable umbilical down to a junction box
  for (let y = H + 2; y <= H + 5.5; y += 1.8)
    for (let dx = -4; dx <= 4; dx += 2.2)
      for (let dz = -2.6; dz <= 2.6; dz += 2.2) {
        if (Math.abs(dx) < 3 && Math.abs(dz) < 2 && y < H + 5) continue;
        solid.push({ x: -hx + 8 + dx, y, z: -hz + 6 + dz, s: 2.2, color: T.panelDark });
      }
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    solid.push({ x: -hx + 8 + Math.cos(ang) * 2.2, y: H + 6.2, z: -hz + 6 + Math.sin(ang) * 2.2, s: 1.1, color: T.panelSeam });
  }
  for (let y = H + 1; y >= 4; y -= 1.6)
    solid.push({ x: -hx - 0.8, y, z: -hz + 6, s: 0.5, color: PALETTE.black });
  solid.push({ x: -hx - 0.8, y: 3, z: -hz + 6, s: 2.2, color: PALETTE.charcoal });

  return group([solidMesh(solid)]);
}
