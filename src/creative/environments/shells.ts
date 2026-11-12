/**
 * Parametric environment shells — one maker per enclosed growing-world shell type.
 * Meters in (1 voxel = 10 cm internally), centered at origin in XZ, ground
 * plane y = 0. Dollhouse discipline: the default camera looks from the +X/+Z
 * corner, so the FAR walls (-X, -Z) carry the material and the near faces are
 * glass, open or omitted. Greenhouse + hoophouse get translucent glazing
 * roofs; cold frames get a shallow glazed lid; tent / indoor / warehouse /
 * container stay open-topped (the warehouse reads "hall" via 4 m far walls +
 * truss beams — never a solid ceiling).
 *
 * Ownership: every call returns freshly built meshes (no cached templates, no
 * InstancedMesh) because the runtime disposeShell() traverses and disposes
 * everything. Voxel budget ≤ ~25k per shell — large planes use scaled blocks
 * (s 2–4), full-res s=1 only for signature details. No lights: glow reads via
 * unlit MeshBasicMaterial vertex colors. Deterministic seeds throughout.
 *
 * Small canvases: the growing-world setup accepts footprints down to 0.5 m
 * (5 voxels). shellVoxels() clamps to 5 (not 20) and derives a `scale`
 * factor so fixed construction heights shrink proportionally — a 0.5 m tent
 * is 0.5 m tall, not a 2 m tent on a 0.5 m floor. At ≥ 2 m footprints scale
 * is 1 and every maker matches the previous behaviour exactly.
 */
import * as THREE from 'three';
import { PALETTE, Voxel, group, mixColor, rng } from '@/creative/voxel';
import { C, plankTone, weighted } from '../structures/shared';
import { T, paneMesh, solidMesh } from './kit';

export interface ShellSpec {
  /** plan canvas width in meters (X extent). */
  widthM: number;
  /** plan canvas depth in meters (Z extent). */
  depthM: number;
  /**
   * Optional saved usable interior height in meters
   * (environment.layout.usableHeightM). When finite and positive, each
   * maker's principal interior height follows it (1 voxel = 10 cm), clamped
   * to a safe minimum so tiny layouts still build; fixed construction
   * details keep their footprint-proportional scale. When absent, makers
   * keep today's default construction heights exactly.
   */
  heightM?: number;
}

/**
 * Saved usable height → interior height in voxels (1 voxel = 10 cm), or
 * null when the spec carries no usable height (or a non-finite /
 * non-positive one, which keeps the default behavior). Clamped to `minV` —
 * the maker's existing safe minimum — so tiny layouts still build.
 */
function explicitHeightVoxels(spec: ShellSpec, minV: number): number | null {
  const h = spec.heightM;
  if (h === undefined || !Number.isFinite(h) || h <= 0) return null;
  return Math.max(minV, Math.round(h * 10));
}

/**
 * Spec → voxel extents + proportional scale. Clamped to 5 voxels (0.5 m) so
 * small setup footprints render at their requested size, not at a 2 m
 * minimum. `scale` = min(1, minDim / 20) shrinks fixed construction heights
 * on small canvases while leaving normal (≥ 2 m) sizes untouched.
 */
function shellVoxels(spec: ShellSpec): { wV: number; dV: number; scale: number } {
  const wV = Math.max(5, Math.round(spec.widthM * 10));
  const dV = Math.max(5, Math.round(spec.depthM * 10));
  const scale = Math.min(1, Math.min(wV, dV) / 20);
  return { wV, dV, scale };
}

/**
 * Even block layout across [-half, half]: `n = round(span/step)` blocks,
 * evenly spaced so the last block edge lands on the boundary whatever the
 * canvas size. Step-aligned spans reproduce the legacy `i*step` centers
 * exactly, so ≥ 2 m canvases keep their previous geometry; only small odd
 * footprints (5-voxel minimum) get reflowed instead of poking a block past
 * the requested footprint.
 */
function spanBlocks(
  half: number,
  step: number,
): { n: number; sp: number; at: (i: number) => number } {
  const n = Math.max(1, Math.round((half * 2) / step));
  const sp = (half * 2) / n;
  return { n, sp, at: (i: number): number => -half + (i + 0.5) * sp };
}

/**
 * Even row layout across [0, h] — the vertical counterpart of spanBlocks for
 * heights that rise from the ground plane (walls, skirts): `n = round(h/step)`
 * rows, `sp = h/n`, centers at (i+0.5)*sp, so the top row's edge lands on `h`.
 * Rows must NEVER be laid with a spanBlocks(h, step) count — that models a
 * [-h, +h] span (2h rows) and doubles the shell height.
 */
function riseBlocks(h: number, step: number): { n: number; sp: number } {
  const n = Math.max(1, Math.round(h / step));
  return { n, sp: h / n };
}

// ---------------------------------------------------------------------------
// Grow tent — 2.0 m black canvas enclosure, open-topped with zipper access (A6).
// ---------------------------------------------------------------------------

export function makeTentShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5101);
  const solid: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Wall height follows the saved usable height when present; the 4-voxel
  // (0.4 m) floor is the existing small-canvas clamp.
  const H = explicitHeightVoxels(spec, 4) ?? Math.max(4, Math.round(20 * scale));
  const st = 2;
  const canvas = (y: number): number => (Math.floor(y / 4) % 2 === 0 ? T.canvas : T.canvasBand);
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);
  const gy = riseBlocks(H, st);

  // far walls: back (-Z) + left (-X), horizontal canvas panel bands
  for (let ix = 0; ix < gx.n; ix++)
    for (let iy = 0; iy < gy.n; iy++) {
      const y = (iy + 0.5) * gy.sp;
      solid.push({ x: gx.at(ix), y, z: -hz + st / 2, s: gx.sp * 1.06, color: canvas(y) });
    }
  for (let iz = 0; iz < gz.n; iz++)
    for (let iy = 0; iy < gy.n; iy++) {
      const y = (iy + 0.5) * gy.sp;
      solid.push({ x: -hx + st / 2, y, z: gz.at(iz), s: gz.sp * 1.06, color: canvas(y) });
    }

  // reflective mylar lining on the interior faces of both far walls
  if (wV >= 10 && dV >= 10) {
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
  }

  // open top: partial lid bands at the far corner only (capping the top
  // canvas band — never crowning the shell past its H design height)
  for (let ix = 0; ix < gx.n; ix++)
    for (let iz = 0; iz < 2; iz++)
      solid.push({ x: gx.at(ix), y: H + 0.5 * scale, z: -hz + (iz + 0.5) * st, s: gx.sp * 1.06, color: canvas(H) });
  for (let iz = 2; iz < (dV * 0.5) / st; iz++)
    for (let ix = 0; ix < 1; ix++)
      solid.push({ x: -hx + (ix + 0.5) * st, y: H + 0.5 * scale, z: -hz + (iz + 0.5) * st, s: st * 1.06, color: canvas(H) });

  // zipper track up the near-right corner + slider; peeled door flap outside
  for (let y = 1; y <= H - 1; y += 0.8)
    solid.push({ x: hx - 0.75, y, z: hz - 0.55, s: 0.38, color: rand() < 0.3 ? PALETTE.metal : PALETTE.metalDark });
  solid.push({ x: hx - 0.75, y: H * 0.325, z: hz - 0.35, s: 0.55, color: PALETTE.ironDark });
  if (wV >= 10) {
    for (let iy = 0; iy < 3; iy++)
      for (let ix = 0; ix < 5; ix++)
        solid.push({
          x: -hx + 2.6 + ix * 1.6, y: 13.6 * scale - iy * 1.7 * scale, z: hz + 0.05,
          s: 1.5, color: iy === 0 ? T.canvasBand : T.canvas,
        });
  }

  // white floor tray lip just inside the walls (reads through the open mouth)
  if (wV >= 10 && dV >= 10) {
    const rim = (x: number, z: number): void => {
      solid.push({ x, y: 0.65, z, s: 1.9, color: rand() < 0.15 ? T.mylarSeam : T.mylar });
    };
    for (let ix = 0; ix < gx.n; ix++) {
      rim(gx.at(ix), -hz + 2);
      rim(gx.at(ix), hz - 2);
    }
    for (let iz = 0; iz < gz.n; iz++) {
      rim(-hx + 2, gz.at(iz));
      rim(hx - 2, gz.at(iz));
    }
  }

  // tent poles proud at the four corners
  for (const [px, pz] of [[-hx + 1, -hz + 1], [hx - 1, -hz + 1], [-hx + 1, hz - 1], [hx - 1, hz - 1]] as Array<[number, number]>)
    for (let y = 1; y <= H; y += 1)
      solid.push({ x: px, y, z: pz, s: 0.72, color: Math.round(y) % 4 === 0 ? PALETTE.metalDark : PALETTE.metal });

  return group([solidMesh(solid)]);
}

// ---------------------------------------------------------------------------
// Indoor grow room — 2.6 m painted far walls, mylar panels and blackout door.
// Open-topped; shelves and grow equipment are separate placed assets.
// ---------------------------------------------------------------------------

export function makeIndoorShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5201);
  const solid: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Wall height follows the saved usable height when present (5-voxel clamp).
  const H = explicitHeightVoxels(spec, 5) ?? Math.max(5, Math.round(26 * scale));
  const st = wV + dV > 520 ? 3 : 2;
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);
  const gy = riseBlocks(H, st);

  // painted far walls: dark baseboard, tan wainscot, pale upper — with a
  // subtle per-cell dither so the plaster reads, never noise
  const paint = (y: number): number => (y <= 1.2 ? T.paintTrim : y <= 9 * scale ? T.paintLower : T.paintUpper);
  const wallCell = (x: number, z: number, y: number, s: number): void => {
    let c = paint(y);
    const r = rand();
    if (r < 0.05) c = mixColor(c, PALETTE.black, 0.12);
    else if (r > 0.96) c = mixColor(c, PALETTE.cream, 0.14);
    solid.push({ x, y, z, s, color: c });
  };
  for (let ix = 0; ix < gx.n; ix++)
    for (let iy = 0; iy < gy.n; iy++) {
      const y = (iy + 0.5) * gy.sp;
      wallCell(gx.at(ix), -hz + st / 2, y, gy.sp * 1.06);
    }
  for (let iz = 1; iz < gz.n; iz++)
    for (let iy = 0; iy < gy.n; iy++) {
      const y = (iy + 0.5) * gy.sp;
      wallCell(-hx + st / 2, gz.at(iz), y, gy.sp * 1.06);
    }
  // top plate band closes the open-topped cut along the far walls
  for (let ix = 0; ix < gx.n; ix++)
    solid.push({ x: gx.at(ix), y: H - st * 0.45, z: -hz + st / 2, s: gx.sp * 1.12, color: T.paintTrim });
  for (let iz = 1; iz < gz.n; iz++)
    solid.push({ x: -hx + st / 2, y: H - st * 0.45, z: gz.at(iz), s: gz.sp * 1.12, color: T.paintTrim });

  // taped mylar reflector panels on the far walls (bright sheen + seams)
  const mylarPanel = (fixed: 'x' | 'z', center: number): void => {
    for (let a = 0; a < 6; a++)
      for (let b = 0; b < 6; b++) {
        const along = center - 6 + (a + 0.5) * 2;
        const y = 8 * scale + (b + 0.5) * 2 * scale;
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

  // blackout door curtain on the back wall
  const cx = Math.min(hx - 9, hx * 0.55);
  if (wV >= 16) {
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 11; b++)
        solid.push({
          x: cx + (a + 0.5) * 2, y: 1 + (b + 0.5) * 2 * scale, z: -hz + st / 2 - 0.7,
          s: 2.2, color: a === 1 ? T.canvasBand : T.canvas,
        });
    for (let x = cx - 1; x <= cx + 7; x += 1.4)
      solid.push({ x, y: H - 2.4, z: -hz + st / 2 - 0.7, s: 1.2, color: PALETTE.metalDark });
  }
  return group([solidMesh(solid)]);
}

// ---------------------------------------------------------------------------
// Greenhouse — 2.9 m ridge glazed A-frame, white mullion grid, ridge vents,
// thermal-screen hint plane (A2/A3). Translucent roof by policy.
// ---------------------------------------------------------------------------

export function makeGreenhouseShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5301);
  const solid: Voxel[] = [];
  const glass: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Ridge tracks the saved usable height when present; the eave stays
  // proportional (~55% of the ridge, matching the default 16/29 ratio) with
  // a ~4-voxel floor. Without a saved height, today's fixed defaults apply.
  const ridgeH = explicitHeightVoxels(spec, 7);
  const ridge = ridgeH ?? Math.max(7, Math.round(29 * scale));
  const eave = ridgeH !== null ? Math.max(4, Math.round(ridge * 0.55)) : Math.max(5, Math.round(16 * scale));
  const roofY = (x: number): number => eave + (ridge - eave) * (1 - Math.abs(x) / hx);
  // scale pane blocks so the merged geometry stays in budget on huge canvases
  const st = Math.min(4, Math.max(2, Math.ceil(Math.sqrt((2 * hx * dV) / 8000))));
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);

  // concrete curb ring grounding the frame
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
    solid.push({ x, y: 1, z: -hz + 1, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
    solid.push({ x, y: 1, z: hz - 1, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
  }
  for (let iz = 1; iz < gz.n; iz++) {
    const z = gz.at(iz);
    solid.push({ x: -hx + 1, y: 1, z, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
    solid.push({ x: hx - 1, y: 1, z, s: 2.15, color: weighted([[T.concrete, 0.6], [T.concreteLight, 0.4]], rand()) });
  }

  // glazed side walls — far faces only (dollhouse: the camera looks from
  // +X/+Z, so near panes are omitted); pane rows are centered over the
  // curb→eave span so the top course meets the eave ring whatever block
  // scale the canvas forced
  const rowsW = Math.max(1, Math.round((eave - 2.5) / st));
  const stepY = (eave - 2.5) / rowsW;
  const paneS = Math.max(st, stepY) * 1.05;
  for (let iy = 0; iy < rowsW; iy++) {
    const y = 2.5 + (iy + 0.5) * stepY;
    for (let ix = 0; ix < gx.n; ix++) {
      const x = gx.at(ix);
      glass.push({ x, y, z: -hz + st / 2, s: paneS, color: T.glassPane });
    }
    for (let iz = 1; iz < gz.n; iz++) {
      const z = gz.at(iz);
      glass.push({ x: -hx + st / 2, y, z, s: paneS, color: T.glassPane });
    }
  }

  // glazed gable ends filling the roof triangle
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
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
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
    if (Math.abs(x) < st * 0.75) continue; // ridge beam takes the center
    const yr = Math.round(roofY(x) * 2) / 2;
    for (let iz = 0; iz < gz.n; iz++) {
      const z = gz.at(iz);
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
  const rz = spanBlocks(hz, 2.2);
  for (let iz = 0; iz < rz.n; iz++)
    solid.push({ x: 0, y: ridge + 0.35, z: rz.at(iz), s: 1.25, color: C.frameWhite });
  for (const gz of [-hz, hz]) {
    solid.push({ x: 0, y: ridge + 1.4, z: gz, s: 0.9, color: PALETTE.metal });
    solid.push({ x: 0, y: ridge + 2.2, z: gz, s: 0.55, color: PALETTE.metalDark });
  }

  // ridge vent flaps hovering over the open slots on wax-jack posts
  // (skipped on canvases too shallow for a vent bay)
  if (hx * 0.45 > st * 2) {
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
  }
  // dutch door on the near gable: white frame, solid lower panel, glazed top
  const doorTop = Math.min(21 * scale, ridge - 4);
  if (wV >= 10) {
    for (let y = 2.5; y <= 11 * scale; y += 1.2)
      for (let x = -2.5; x <= 2.5; x += 1.25)
        solid.push({ x, y, z: hz - 0.6, s: 1.28, color: rand() < 0.15 ? mixColor(C.frameWhite, PALETTE.gravelDark, 0.2) : C.frameWhite });
    for (let y = 11 * scale; y <= doorTop; y += 1.4)
      for (let x = -2.5; x <= 2.5; x += 1.4)
        glass.push({ x, y, z: hz - 0.6, s: 1.35, color: T.glassPane });
    for (const dx of [-3.3, 3.3])
      for (let y = 2.5; y <= doorTop; y += 1.3)
        solid.push({ x: dx, y, z: hz - 0.6, s: 1.35, color: C.frameWhite });
    for (let x = -3.3; x <= 3.3; x += 1.3)
      solid.push({ x, y: doorTop + 0.7, z: hz - 0.6, s: 1.35, color: C.frameWhite });
    solid.push({ x: 2.7, y: 9.5 * scale, z: hz - 0.1, s: 0.55, color: PALETTE.metal });
  }

  // louvre vents across the far gable
  if (wV >= 10) {
    for (let x = -4; x <= 4; x += 1.2)
      for (const ly of [12.5 * scale, 14 * scale, 15.5 * scale])
        solid.push({ x, y: ly, z: -hz + 0.7, s: 1.15, color: ly === 14 * scale ? mixColor(C.frameWhite, PALETTE.gravelDark, 0.25) : C.frameWhite });
  }

  return group([
    solidMesh(solid),
    paneMesh(glass, 0.35, PALETTE.glass),
  ]);
}

// ---------------------------------------------------------------------------
// Cold frame — low timber body with a glazed, pitched lid. The shell stays
// shallow so the protected-bed archetype reads differently from a glasshouse.
// ---------------------------------------------------------------------------

export function makeColdFrameShell(spec: ShellSpec): THREE.Object3D {
  const solid: Voxel[] = [];
  const glass: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // The saved usable height drives the whole shallow profile: the timber
  // wall keeps its default ~45% share and the glazed lid rises
  // proportionally so the lid top lands on the requested height.
  const explicitH = explicitHeightVoxels(spec, 3);
  const wallH = explicitH !== null
    ? Math.max(1.5, Math.round(explicitH * 0.45))
    : Math.max(1.5, Math.round(4 * scale));
  const lidRise = explicitH !== null ? Math.max(1, explicitH - wallH) : 5 * scale;
  const lidHigh = wallH + lidRise;
  // lattice scale: the full-lid glazing grid needs coarser cubes on big
  // canvases to keep the merged geometry inside the ~25k voxel budget
  const st = wV * dV > 60000 ? 4 : wV * dV > 15000 ? 3 : 1.8;
  const wood = mixColor(PALETTE.wood, PALETTE.woodDark, 0.25);
  const woodCap = mixColor(wood, PALETTE.cream, 0.12);

  // Timber base, broken into blocks so the low structure has a clear scale.
  // Block centers clamp so no cube edge leaves the requested footprint by
  // more than ~half a voxel, whatever lattice step the canvas forced.
  const fitX = (x: number): number => Math.max(-hx - 0.45 + st / 2, Math.min(x, hx + 0.45 - st / 2));
  const fitZ = (z: number): number => Math.max(-hz - 0.45 + st / 2, Math.min(z, hz + 0.45 - st / 2));
  for (let x = -hx + 1; x < hx; x += st)
    for (let y = 0.8; y <= wallH; y += st)
      for (const z of [-hz + 0.45, hz - 0.45])
        solid.push({ x: fitX(x), y, z: fitZ(z), s: st, color: y >= wallH - 1 ? woodCap : wood });
  for (let z = -hz + 1; z < hz; z += st)
    for (let y = 0.8; y <= wallH; y += st)
      for (const x of [-hx + 0.45, hx - 0.45])
        solid.push({ x: fitX(x), y, z: fitZ(z), s: st, color: y >= wallH - 1 ? woodCap : wood });

  // Angled glazed lid: transparent panels follow the side rails from the low
  // front edge to the higher rear hinge line.
  const lidY = (x: number): number => wallH + 0.3 * lidRise + ((x + hx) / Math.max(1, wV)) * 0.7 * lidRise;
  for (let x = -hx + st / 2; x <= hx - st / 2; x += st)
    for (let z = -hz + st / 2; z <= hz - st / 2; z += st)
      glass.push({ x, y: lidY(x), z, s: st * 1.04, color: T.glassPane });
  for (let z = -hz + 0.5; z <= hz - 0.5; z += st * 1.4) {
    for (let x = -hx; x <= hx; x += st * 1.4)
      solid.push({ x, y: lidY(x) + 0.8, z, s: 0.9, color: PALETTE.metalDark });
  }
  for (let y = wallH - 0.2; y <= lidHigh; y += 1.5)
    solid.push({ x: -hx + 0.3, y, z: 0, s: 0.75, color: PALETTE.metal });
  solid.push({ x: hx - 0.3, y: wallH + 0.5, z: hz - 0.7, s: 0.7, color: PALETTE.metalDark });

  return group([solidMesh(solid), paneMesh(glass, 0.28, T.glassPane)]);
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
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Arch peak tracks the saved usable height when present; legs stay ~30%
  // of the peak (matching the default 10/32 ratio) and the roll-up crease
  // keeps its default ~41% share so the film still rolls open.
  const peakH = explicitHeightVoxels(spec, 6);
  const peak = peakH ?? Math.max(6, Math.round(32 * scale));
  const legH = peakH !== null ? Math.max(3, Math.round(peak * 0.31)) : Math.max(3, Math.round(10 * scale));
  const rollY = peakH !== null ? Math.max(4, Math.round(peak * 0.406)) : Math.max(4, Math.round(13 * scale));
  const prof = (x: number): number =>
    legH + (peak - legH) * Math.sqrt(Math.max(0, 1 - (x / hx) ** 2));
  // film block scale: big canvases need coarser cubes to stay in budget
  const st = wV * dV > 30000 ? 3 : 2;
  const rx = wV > 160 ? 2 : 1.2; // rib resolution
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);
  const gy = riseBlocks(legH, st);

  // poly film skin hugging the arch; the near (+X) side is rolled up above
  // rollY so the interior reads through the open skirt
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
    const yr = Math.round(prof(x) * 2) / 2;
    if (x > 0 && yr < rollY) continue; // rolled away below the roll bar
    for (let iz = 0; iz < gz.n; iz++)
      film.push({ x, y: yr, z: gz.at(iz), s: st * 1.18, color: PALETTE.polyFilm });
  }
  // far-side skirt: outermost columns run the film down to the baseboards
  for (let iy = 0; iy < gy.n; iy++)
    for (let iz = 0; iz < gz.n; iz++)
      film.push({
        x: -hx + st / 2, y: (iy + 0.5) * gy.sp, z: gz.at(iz),
        s: st * 1.18, color: PALETTE.polyFilm,
      });

  // roll-up crease signature: darker film band at roll height on the far side
  const xC = hx * Math.sqrt(Math.max(0, 1 - ((rollY - legH) / (peak - legH)) ** 2));
  const creaseS = Math.min(st * 1.3, Math.max(0.9, 2.6 * scale));
  const creaseX = -Math.min(xC, hx - creaseS / 2 + 0.45);
  for (let z = -hz + 2; z <= hz - 2; z += st * 1.6)
    film.push({ x: creaseX, y: rollY, z, s: creaseS, color: T.filmRoll });
  // roll bar tube + gathered film above it on the near side
  const rollBarX = Math.min(xC, hx - 0.3);
  for (let z = -hz + 2; z <= hz - 2; z += 3)
    solid.push({ x: rollBarX, y: rollY, z, s: 1.5, color: PALETTE.metalDark });
  for (let z = -hz + 3; z <= hz - 3; z += 6)
    film.push({ x: rollBarX - 0.6, y: rollY + 1.6, z, s: 2.0, color: T.filmRoll });

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

  // wooden baseboards pinning the skirt + ground pegs (centers clamped so
  // odd canvas sizes never push a block edge past the footprint)
  const boardZ = (z: number): number =>
    Math.max(-hz - 0.45 + 0.675, Math.min(z, hz + 0.45 - 0.675));
  for (let z = -hz; z <= hz; z += 2) {
    solid.push({ x: -hx + 0.7, y: 0.7, z: boardZ(z), s: 1.35, color: rand() < 0.25 ? C.postWood : mixColor(C.postWood, PALETTE.wood, 0.4) });
    solid.push({ x: hx - 0.7, y: 0.7, z: boardZ(z), s: 1.35, color: rand() < 0.25 ? C.postWood : mixColor(C.postWood, PALETTE.wood, 0.4) });
  }
  for (let z = -hz + 6; z <= hz - 6; z += 12)
    for (const px of [-hx + 0.1, hx - 0.1]) {
      solid.push({ x: px, y: 0.35, z, s: 1.1, color: weighted([[PALETTE.soilDark, 0.6], [PALETTE.soil, 0.4]], rand()) });
      solid.push({ x: px, y: 1.1, z, s: 0.4, color: PALETTE.metalDark });
    }

  // purlins + ridge tube tying the ribs together
  for (const px of [-hx * 0.62, -hx * 0.25, hx * 0.25, hx * 0.62])
    for (let z = -hz + 2; z <= hz - 2; z += 3)
      solid.push({ x: px, y: prof(px) + 0.25, z, s: 1.05, color: T.galvDark });
  for (let z = -hz; z <= hz; z += 3)
    solid.push({ x: 0, y: peak + 0.35, z: Math.max(-hz + 0.15, Math.min(z, hz - 0.15)), s: 1.2, color: T.galvDark });

  // wooden end wall at the far (-Z) gable, horizontal plank bands following
  // the arch, with a plain door cut to grade
  const ewSt = wV > 160 ? 2 : 1.5;
  const doorCut = Math.round(20 * scale);
  const doorTopY = Math.round(22 * scale);
  for (let x = -hx + 1.5; x <= hx - 1.5; x += ewSt) {
    const top = Math.round(prof(x));
    const inDoor = Math.abs(x) <= 3.2;
    for (let y = 1; y <= top; y += 2) {
      if (inDoor && y <= doorCut) continue;
      let c = plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank);
      if (rand() < 0.08) c = mixColor(c, PALETTE.black, 0.18);
      solid.push({ x, y: y + 0.6, z: -hz + 1, s: 2.1, color: c });
    }
  }
  // gable arch trim boards at both ends
  for (const gz of [-hz + 0.6, hz - 0.6])
    for (let x = -hx + 1; x <= hx - 1; x += 1.4)
      solid.push({ x, y: prof(x) + 0.1, z: gz, s: 1.35, color: C.postWood });
  // plain door: vertical boards, cross rail, black handle (proud of the
  // plank wall but kept inside the footprint)
  if (wV >= 10) {
    for (let y = 1; y <= doorCut; y += 1.4)
      for (let x = -3; x <= 3; x += 1.4)
        solid.push({ x, y: y + 0.4, z: -hz + 0.25, s: 1.4, color: plankTone(rand, C.plankWeathered, PALETTE.woodDark, PALETTE.plank) });
    for (let x = -3.2; x <= 3.2; x += 1.2) solid.push({ x, y: doorCut * 0.6, z: -hz + 0.05, s: 0.9, color: C.postWood });
    solid.push({ x: 2.6, y: doorCut * 0.525, z: -hz - 0.1, s: 0.5, color: PALETTE.metalDark });
  }
  // near end stays open: just door-frame posts + header to silhouette the cut
  if (wV >= 10) {
    for (const dx of [-3.6, 3.6])
      for (let y = 1; y <= doorTopY; y += 1.4)
        solid.push({ x: dx, y, z: hz - 1.2, s: 1.4, color: C.postWood });
    for (let x = -3.6; x <= 3.6; x += 1.4)
      solid.push({ x, y: doorTopY + 0.6, z: hz - 1.2, s: 1.4, color: C.postWood });
  }

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
// Warehouse enclosure — 4.0 m dark far walls, roof trusses and skylights.
// Lighting, HVAC and grow racks are separate placed assets (A9).
// ---------------------------------------------------------------------------

export function makeWarehouseShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5501);
  const solid: Voxel[] = [];
  const skylight: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Wall height follows the saved usable height when present (8-voxel clamp).
  const H = explicitHeightVoxels(spec, 8) ?? Math.max(8, Math.round(40 * scale));
  const st = wV + dV > 520 ? 3 : 2;
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);

  // dark far walls with vertical seam columns every 12 voxels; rows are
  // centered over 0..H so the parapet lands at the 4 m mark exactly
  const panel = (i: number): number =>
    i % 12 < st ? T.panelSeam : rand() < 0.06 ? mixColor(T.panelDark, PALETTE.black, 0.2) : T.panelDark;
  const rowsH = Math.max(1, Math.round(H / st));
  const stepH = H / rowsH;
  const wallS = Math.max(st, stepH) * 1.06;
  for (let iy = 0; iy < rowsH; iy++) {
    const y = (iy + 0.5) * stepH;
    for (let ix = 0; ix < gx.n; ix++)
      solid.push({ x: gx.at(ix), y, z: -hz + st / 2, s: wallS, color: panel(ix) });
    for (let iz = 1; iz < gz.n; iz++)
      solid.push({ x: -hx + st / 2, y, z: gz.at(iz), s: wallS, color: panel(iz) });
  }
  // concrete curb + safety yellow curb line at the wall bases
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
    solid.push({ x, y: 0.9, z: -hz + 1.4, s: 2.1, color: T.concrete });
    solid.push({ x, y: 2.3, z: -hz + 1.4, s: 1.6, color: T.tape });
  }
  for (let iz = 1; iz < gz.n; iz++) {
    const z = gz.at(iz);
    solid.push({ x: -hx + 1.4, y: 0.9, z, s: 2.1, color: T.concrete });
    solid.push({ x: -hx + 1.4, y: 2.3, z, s: 1.6, color: T.tape });
  }

  // roof trusses spanning X at intervals — beams + king posts, NO ceiling
  const tieY = H * 0.825;
  const chordY = H * 0.95;
  const postY0 = H * 0.84;
  const postY1 = H * 0.95;
  const trussStep = Math.max(24, Math.round(dV / 8));
  for (let z = -hz + trussStep; z < hz - 4; z += trussStep) {
    for (let x = -hx + 3; x <= hx - 3; x += 2.4)
      solid.push({ x, y: tieY, z, s: 2.4, color: T.galvDark }); // bottom tie
    for (let x = -hx + 6; x <= hx - 6; x += 3)
      solid.push({ x, y: chordY, z, s: 1.8, color: mixColor(PALETTE.metal, PALETTE.metalDark, 0.4) }); // top chord
    for (const px of [-hx * 0.5, 0, hx * 0.5])
      for (let y = postY0; y < postY1; y += 1.6)
        solid.push({ x: px, y, z, s: 1.5, color: PALETTE.iron }); // king posts
  }

  // dashed floor tape lines marking the aisle
  for (const lx of [-hx * 0.28, hx * 0.42]) {
    if (Math.abs(lx) > hx - 4) continue;
    for (let z = -hz + 4; z <= hz - 4; z += 2.2)
      solid.push({ x: lx, y: 0.45, z, s: 0.85, color: T.tape });
  }

  // translucent skylight strips in the truss bays — low-opacity panes so the
  // open top reads as a glazed hall roof instead of a sky hole at obliques
  const skyS = Math.max(2.2, st * 1.1);
  for (let z = -hz + trussStep / 2; z < hz - 2; z += trussStep)
    for (let x = -hx + 4; x <= hx - 4; x += skyS * 1.15)
      skylight.push({ x, y: chordY, z, s: skyS, color: T.glassPane });

  // roll-up door on the far (-X) wall: slat curtain between proud guide
  // tracks and bottom seal (curtain span clamped inside shallow walls)
  const doorW = Math.max(6, Math.min(18, Math.round(dV * 0.26)));
  const doorHalf = Math.min(doorW / 2, hz - 1.2);
  const doorTop = Math.min(24, H - 4);
  if (doorTop > 4) {
    for (let y = 3.5; y <= doorTop; y += 2)
      for (let z = -doorHalf + 1; z <= doorHalf - 1; z += 1.8)
        solid.push({ x: -hx + 2.2, y, z, s: 1.95, color: y % 6 < 2 ? T.galvDark : PALETTE.metal });
    for (let z = -doorHalf + 0.8; z <= doorHalf - 0.8; z += 1.6)
      solid.push({ x: -hx + 2.4, y: 2.8, z, s: 1.7, color: T.panelSeam }); // bottom seal
    for (const gz of [-doorHalf - 0.6, doorHalf + 0.6])
      for (let y = 2; y <= doorTop + 2.5; y += 1.7)
        solid.push({ x: -hx + 2.7, y, z: gz, s: 1.05, color: PALETTE.metalDark });
  }
  return group([solidMesh(solid), paneMesh(skylight, 0.25, PALETTE.glass)]);
}

// ---------------------------------------------------------------------------
// Container-farm shell — corrugated ISO box oriented along its long X
// dimension. Dollhouse cutaway on the near faces: the far (-Z) long wall is
// solid corrugated steel, the far (-X) short end is solid with lock rods,
// the near (+Z) long wall is cut to base/roof bands, and the near (+X) short
// end carries the door frame + one swung leaf. Vertical corrugation ribs run
// the full length of both long walls — the ISO signature. Corner castings
// and fork pockets are integral shell details (A10).
// ---------------------------------------------------------------------------

export function makeContainerShell(spec: ShellSpec): THREE.Object3D {
  const rand = rng(5601);
  const solid: Voxel[] = [];
  const { wV, dV, scale } = shellVoxels(spec);
  const hx = wV / 2;
  const hz = dV / 2;
  // Wall height follows the saved usable height when present (5-voxel clamp).
  const H = explicitHeightVoxels(spec, 5) ?? Math.max(5, Math.round(26 * scale));
  const st = 2;
  const gx = spanBlocks(hx, st);
  const gz = spanBlocks(hz, st);
  const gyN = Math.max(1, Math.round(H / st));
  const gySp = H / gyN;

  const rustTone = (): number =>
    weighted([[T.rust, 0.5], [T.rustDark, 0.28], [T.rustLight, 0.14], [PALETTE.woodDark, 0.08]], rand());
  // corrugation: alternating proud ridge columns read as vertical ribs.
  // On long walls the ribs run along Z (perpendicular to the long X axis),
  // emphasising the ISO length; on short ends they run along X.
  const corrugZ = (z: number, y: number, x: number, ridge: boolean): void => {
    solid.push({
      z: z + (ridge ? Math.sign(z) * 0.35 : 0), y, x,
      s: ridge ? 1.35 : 1.7,
      color: ridge ? rustTone() : mixColor(T.rustDark, PALETTE.black, 0.12),
    });
  };
  const corrugX = (x: number, y: number, z: number, ridge: boolean): void => {
    solid.push({
      x: x + (ridge ? Math.sign(x) * 0.35 : 0), y, z,
      s: ridge ? 1.35 : 1.7,
      color: ridge ? rustTone() : mixColor(T.rustDark, PALETTE.black, 0.12),
    });
  };

  // far (-Z) long wall: full corrugated, vertical ribs running along X
  for (let ix = 0; ix < gx.n; ix++)
    for (let iy = 0; iy < gyN; iy++) {
      const x = gx.at(ix);
      const y = (iy + 0.5) * gySp;
      corrugX(x, y, -hz + st / 2, ix % 2 === 0);
    }
  // far (-X) short end: full corrugated + lock rods
  for (let iz = 0; iz < gz.n; iz++)
    for (let iy = 0; iy < gyN; iy++) {
      const z = gz.at(iz);
      const y = (iy + 0.5) * gySp;
      corrugZ(z, y, -hx + st / 2, iz % 2 === 0);
    }
  if (wV >= 20) {
    for (const rz of [-hz + 3, -hz + 6, hz - 6, hz - 3])
      for (let y = 1; y <= H - 1; y += 1.6)
        solid.push({ x: -hx + 0.35, y, z: rz, s: 0.8, color: mixColor(PALETTE.metal, PALETTE.metalDark, 0.4) });
    for (const rz of [-hz + 3, -hz + 6, hz - 6, hz - 3]) {
      solid.push({ x: -hx + 0.35, y: 3.5, z: rz, s: 1.0, color: PALETTE.ironDark });
      solid.push({ x: -hx + 0.35, y: H - 3.5, z: rz, s: 1.0, color: PALETTE.ironDark });
    }
  }

  // near (+Z) long wall cut away: keep a base band, a roof band and a far
  // corner return so the box still reads as a container from the near side
  for (let ix = 0; ix < gx.n; ix++) {
    const x = gx.at(ix);
    for (let iy = 0; iy < 2; iy++)
      corrugX(x, (iy + 0.5) * st, hz - st / 2, ix % 2 === 0);
    for (let iy = Math.floor((H - 4) / st); iy < H / st; iy++)
      corrugX(x, (iy + 0.5) * st, hz - st / 2, ix % 2 === 0);
  }
  // far corner return on the near long wall
  for (let iy = 0; iy < gyN; iy++)
    for (let iz = 0; iz < 3; iz++) {
      const z = Math.min(-hz + (iz + 0.5) * st, hz - 0.4);
      corrugX(-hx + st / 2, (iy + 0.5) * gySp, z, iz % 2 === 0);
    }

  // near (+X) short end: door frame + one leaf swung open inward
  const doorHalf = Math.min(3, dV / 4);
  for (const dz of [-doorHalf, doorHalf])
    for (let y = 0.6; y <= H; y += 1.5)
      solid.push({ x: hx - 1.2, y, z: dz, s: 1.7, color: mixColor(T.rustDark, PALETTE.black, 0.1) });
  for (let z = -doorHalf; z <= doorHalf; z += 1.8)
    solid.push({ x: hx - 1.2, y: H + 0.4, z, s: 1.8, color: mixColor(T.rustDark, PALETTE.black, 0.1) });
  // swung door leaf: corrugated panel rotated inward along the -Z side
  if (dV >= 10) {
    for (let iz = 0; iz < Math.min(10, dV - 2) / st; iz++)
      for (let iy = 0; iy < H / st; iy++) {
        const z = Math.min(-doorHalf + 0.6 + (iz + 0.5) * st, hz - st / 2);
        const y = (iy + 0.5) * st;
        corrugZ(z, y, hx - 1.2 - (iz + 0.5) * st * 0.4, iz % 2 === 0);
      }
  }

  // roof rim + corrugated roof strip along the far edge
  for (let ix = 0; ix < gx.n; ix++)
    for (let iz = 0; iz < gz.n; iz++) {
      const x = Math.max(-hx + 0.8, Math.min(hx - 0.8, gx.at(ix)));
      const z = Math.max(-hz + 0.8, Math.min(hz - 0.8, gz.at(iz)));
      const edge = iz < 2 || ix < 2 || ix >= gx.n - 2;
      if (!edge) continue;
      solid.push({ x, y: H + 1, z, s: st * 1.06, color: mixColor(T.rustDark, PALETTE.black, 0.15) });
    }

  // corner castings at all four corners (top + bottom), slightly proud but
  // kept inside the footprint envelope
  for (const [px, pz] of [[-hx + 0.45, -hz + 0.45], [hx - 0.45, -hz + 0.45], [-hx + 0.45, hz - 0.45], [hx - 0.45, hz - 0.45]] as Array<[number, number]>)
    for (const py of [1.5, H - 1.5]) {
      solid.push({ x: px, y: py, z: pz, s: 1.8, color: mixColor(T.rustDark, PALETTE.black, 0.25) });
      solid.push({ x: px, y: py, z: pz + (pz < 0 ? -0.2 : 0.2), s: 0.9, color: PALETTE.black });
    }

  // forklift pockets in the base rail of the far end
  if (wV >= 20) {
    for (const fz of [-hz + dV * 0.28, -hz + dV * 0.62])
      for (let x = -hx; x <= -hx + 2.4; x += 1.6)
        for (let y = 1.2; y <= 3.4; y += 1.6)
          solid.push({ x: Math.max(x, -hx + 0.3), y, z: fz, s: 1.5, color: PALETTE.black });
  }

  return group([solidMesh(solid)]);
}
