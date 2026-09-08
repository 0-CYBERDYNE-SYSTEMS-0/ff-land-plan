/**
 * Lane D creatures — procedural voxel farm animals with idle animations.
 *
 * Built on the shared voxel kit at a 5 cm internal grid (half of the 10 cm
 * tile voxel) so faces, combs and eyes can be placed with intent. Every
 * creature is nested groups (body / head / tail / wings / legs / ears …)
 * named accordingly; `tick` animates part transforms only — nothing slides,
 * nothing whole-body rotates. All randomness is seeded.
 *
 * Convention: creature faces +Z. Eyes are small proud voxels chosen to
 * contrast hard against the surrounding fur/feather color.
 */
import * as THREE from 'three';
import { PALETTE, mixColor, fill, rng, type Voxel } from '@/creative/voxel';
import { put, mirr, part, ghostPart, savePoses, setRig, rigOf, pose, pulse } from './build';

// ---------------------------------------------------------------------------
// CHICKEN (hen)
// ---------------------------------------------------------------------------

function legVoxels(xSign: number, tall: number): Voxel[] {
  const v: Voxel[] = [];
  const orange = PALETTE.chickenOrange;
  const dark = mixColor(PALETTE.chickenOrange, PALETTE.black, 0.35);
  // shin + foot + toe
  put(v, xSign * 0.8, 0.7 + tall * 0.5, 0, orange, 0.55);
  if (tall > 1) put(v, xSign * 0.8, 1.5 + tall * 0.25, 0.05, orange, 0.6);
  put(v, xSign * 0.8, 0.32, 0.12, orange, 0.62);
  put(v, xSign * 0.8, 0.24, 0.68, dark, 0.42); // toe claw nub
  return v;
}

function wingVoxels(xSign: number, buffTip: boolean): Voxel[] {
  const v: Voxel[] = [];
  const base = PALETTE.chickenWhite;
  for (let z = -2; z <= 1; z++) {
    const yTop = z === 1 ? 4 : 2;
    for (let y = yTop; y <= 4; y++) {
      const tip = buffTip && z === -2;
      put(v, xSign * 2.45, y, z, tip ? mixColor(base, PALETTE.chickenOrange, 0.35) : base, 1.0);
    }
  }
  return v;
}

export function buildHen(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'hen';
  const rand = rng(11);
  const white = PALETTE.chickenWhite;

  // -- body: plump oval, chest forward, back rising into the tail root
  const bodyVox: Voxel[] = [];
  fill(bodyVox, -1, 1, -2, 1, 1, 2, white);
  for (let y = 2; y <= 3; y++)
    for (let x = -2; x <= 2; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 2 && Math.abs(z) === 3) continue;
        put(bodyVox, x, y, z, rand() > 0.88 ? mixColor(white, PALETTE.cream, 0.5) : white);
      }
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) {
      if (Math.abs(x) === 2 && Math.abs(z) === 2) continue;
      put(bodyVox, x, 4, z, white);
    }
  for (let x = -1; x <= 1; x++) for (let z = -3; z <= 0; z++) put(bodyVox, x, 5, z, white);
  // chest keel slightly proud at the front
  mirr((s) => put(bodyVox, s * 1.2, 2.5, 3.15, white, 0.9));

  const body = part('body', bodyVox, 0, 3, 0);
  root.add(body);

  // -- head: cube on a short neck, comb + wattle + beak placed with intent.
  // Skull kept two units tall — a full three-unit cube reads bull-necked.
  const headVox: Voxel[] = [];
  fill(headVox, -1, 4.6, 2, 1, 5.6, 3, white); // neck bridge, overlapping body AND skull
  fill(headVox, -1, 6, 2, 1, 7, 4, white);
  put(headVox, 0, 6.85, 4.72, PALETTE.chickenOrange, 0.82); // beak
  put(headVox, 0, 5.9, 4.55, PALETTE.chickenRed, 0.55); // wattle
  // serrated comb: three teeth, middle tallest — rooted in the skull top
  put(headVox, 0, 7.66, 2.45, PALETTE.chickenRed, 0.66);
  put(headVox, 0, 7.95, 3.25, PALETTE.chickenRed, 0.86);
  put(headVox, 0, 7.66, 4.05, PALETTE.chickenRed, 0.6);
  // eyes: black on white, set just above the beak line
  mirr((s) => put(headVox, s * 1.33, 6.6, 3.35, PALETTE.black, 0.52));

  const head = part('head', headVox, 0, 5.8, 2.4);
  root.add(head);

  // -- tail: upright fan of short feathers
  const tailVox: Voxel[] = [];
  const buff = mixColor(PALETTE.chickenWhite, PALETTE.chickenOrange, 0.3);
  const strand = (x: number, top: number): void => {
    const steps = Math.round(top);
    for (let i = 0; i <= steps; i++)
      put(tailVox, x * (1 + i * 0.06), 5.3 + i * 0.85, -2.75 - i * 0.34, i === steps ? buff : PALETTE.chickenWhite, 0.82 - i * 0.04);
  };
  strand(0, 2.4);
  strand(0.75, 1.7);
  strand(-0.75, 1.7);
  strand(1.45, 1.0);
  strand(-1.45, 1.0);
  const tail = part('tail', tailVox, 0, 5, -2.2);
  root.add(tail);

  // -- wings + legs
  const wingL = part('wingL', wingVoxels(1, true), 2.0, 3, 0);
  const wingR = part('wingR', wingVoxels(-1, true), -2.0, 3, 0);
  const legL = part('legL', legVoxels(1, 1), 0.8, 1.4, 0);
  const legR = part('legR', legVoxels(-1, 1), -0.8, 1.4, 0);
  root.add(wingL, wingR, legL, legR);

  setRig(root, { body, head, tail, wingL, wingR, legL, legR });
  savePoses(root);
  return root;
}

export function tickHen(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.8;
  const head = r.head, tail = r.tail, body = r.body;
  if (head) {
    const pk = pulse(t, 0.45, 1.3);
    head.rotation.x = pose(head).rx + Math.sin(t * 2.1) * 0.04 + pk * pk * 0.58;
    head.rotation.y = pose(head).ry + Math.sin(t * 0.37) * 0.1;
  }
  if (tail) {
    tail.rotation.x = pose(tail).rx + Math.sin(t * 1.8) * 0.07 + Math.sin(t * 4.9) * 0.02;
    tail.rotation.y = pose(tail).ry + Math.sin(t * 0.77) * 0.07;
  }
  if (body) {
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.022;
    body.position.x = pose(body).px + Math.sin(ws) * 0.004;
    body.position.y = pose(body).py + Math.max(0, Math.sin(ws * 2)) * 0.003;
  }
  const lift = pulse(t, 0.33, 2.1);
  if (r.wingL) r.wingL.rotation.z = pose(r.wingL).rz - (lift * (0.35 + 0.3 * Math.sin(t * 27)) + 0.018 * Math.sin(t * 1.4));
  if (r.wingR) r.wingR.rotation.z = pose(r.wingR).rz + (lift * (0.35 + 0.3 * Math.sin(t * 27)) + 0.018 * Math.sin(t * 1.4));
  if (r.legL) r.legL.position.y = pose(r.legL).py + Math.max(0, Math.sin(ws)) * 0.008;
  if (r.legR) r.legR.position.y = pose(r.legR).py + Math.max(0, -Math.sin(ws)) * 0.008;
}

// ---------------------------------------------------------------------------
// ROOSTER
// ---------------------------------------------------------------------------

export function buildRooster(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rooster';
  const rand = rng(23);
  const white = PALETTE.chickenWhite;
  const hackle = mixColor(PALETTE.straw, PALETTE.chickenOrange, 0.45);

  // -- body: deeper chest, taller stance than the hen
  const bodyVox: Voxel[] = [];
  fill(bodyVox, -1, 2, -3, 1, 2, 2, white);
  for (let y = 3; y <= 6; y++)
    for (let x = -2; x <= 2; x++)
      for (let z = -4; z <= 3; z++) {
        if (Math.abs(x) === 2 && Math.abs(z) >= 3 && !(y >= 4 && y <= 6 && z === 3)) continue;
        if (Math.abs(x) === 2 && z === -4 && y !== 5) continue;
        put(bodyVox, x, y, z, rand() > 0.9 ? mixColor(white, PALETTE.cream, 0.5) : white);
      }
  for (let x = -2; x <= 2; x++) for (let z = -4; z <= 1; z++) put(bodyVox, x, 7, z, white);
  for (let x = -1; x <= 1; x++) for (let z = -4; z <= 0; z++) put(bodyVox, x, 8, z, white);
  const body = part('body', bodyVox, 0, 5, 0);
  root.add(body);

  // -- head held high with hackle cape, big comb, proud wattle, browed eyes
  const headVox: Voxel[] = [];
  fill(headVox, -1, 6.4, 2, 1, 9, 3, white); // neck, overlapping body AND skull
  fill(headVox, -1, 9, 2, 1, 12, 4, white); // skull
  // golden hackle cape: contiguous shawl of overlapping feathers down the neck
  mirr((s) => {
    for (let i = 0; i < 5; i++) put(headVox, s * 1.22, 7.3 + i * 0.58, 2.15 + i * 0.1, hackle, 0.8);
    put(headVox, s * 0.72, 9.7, 1.7, hackle, 0.78);
  });
  put(headVox, 0, 10.0, 1.65, hackle, 0.78);
  // beak + wattle
  put(headVox, 0, 10.1, 4.75, PALETTE.chickenOrange, 0.9);
  put(headVox, 0, 9.1, 4.6, PALETTE.chickenRed, 0.62);
  put(headVox, 0, 8.55, 4.35, PALETTE.chickenRed, 0.5);
  // tall serrated comb (4 teeth) rooted in the skull top
  put(headVox, 0, 12.72, 2.2, PALETTE.chickenRed, 0.62);
  put(headVox, 0, 13.08, 2.9, PALETTE.chickenRed, 0.8);
  put(headVox, 0, 13.32, 3.6, PALETTE.chickenRed, 0.9);
  put(headVox, 0, 12.98, 4.25, PALETTE.chickenRed, 0.62);
  // fierce little brows over the eyes
  mirr((s) => {
    put(headVox, s * 1.36, 10.85, 3.3, PALETTE.black, 0.52);
    put(headVox, s * 1.22, 11.45, 3.3, mixColor(white, PALETTE.charcoal, 0.25), 0.62);
  });
  const head = part('head', headVox, 0, 8.8, 2.4);
  root.add(head);

  // -- iconic sickle tail: broad plumes fanning up-and-back, green sheen.
  // Each feather gets its OWN arc (outer ones sweep lower + further back)
  // so the silhouette fans in profile instead of merging into one column.
  const tailVox: Voxel[] = [];
  const rndT = rng(29);
  for (let k = -3; k <= 3; k++) {
    const len = 7.5 - Math.abs(k) * 1.05;
    const rise = 1.02 - Math.abs(k) * 0.16; // per-step climb
    const back = 0.26 + Math.abs(k) * 0.17; // per-step rearward sweep
    for (let i = 0; i <= len; i += 0.75) {
      const tip = i / len;
      const sheen = mixColor(PALETTE.charcoal, PALETTE.leaf, 0.22 + rndT() * 0.16);
      const c = tip > 0.82 ? mixColor(sheen, PALETTE.leafLight, 0.35) : sheen;
      put(
        tailVox,
        k * 0.62 + k * 0.1 * tip,
        8.0 + rise * i,
        -3.1 - back * i - tip * tip * 0.9,
        c,
        Math.max(0.78, 1.35 - tip * 0.6),
      );
    }
  }
  // short white covert feathers layering the fan's base into the body
  for (let k = -2; k <= 2; k++)
    for (let i = 0; i <= 2.2; i += 0.75)
      put(tailVox, k * 0.62, 7.6 + i * 0.9, -2.9 - i * 0.5, PALETTE.chickenWhite, 1.05 - i * 0.12);
  const tail = part('tail', tailVox, 0, 7.5, -3);
  root.add(tail);

  // -- wings (slightly longer than hen's) + tall legs with spur
  const wingL = part('wingL', wingVoxels(1, false), 2.0, 5, -0.5);
  const wingR = part('wingR', wingVoxels(-1, false), -2.0, 5, -0.5);
  const legVoxL = legVoxels(1, 2);
  put(legVoxL, 1.15, 1.9, 0.25, PALETTE.chickenOrange, 0.3); // spur
  const legVoxR = legVoxels(-1, 2);
  put(legVoxR, -1.15, 1.9, 0.25, PALETTE.chickenOrange, 0.3);
  const legL = part('legL', legVoxL, 0.9, 2.4, 0);
  const legR = part('legR', legVoxR, -0.9, 2.4, 0);
  root.add(wingL, wingR, legL, legR);

  setRig(root, { body, head, tail, wingL, wingR, legL, legR });
  savePoses(root);
  return root;
}

export function tickRooster(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.74;
  const head = r.head, tail = r.tail, body = r.body;
  if (head) {
    // proud scanning + occasional crow-stretch of the neck
    const crow = pulse(t, 0.21, 0.4);
    head.rotation.y = pose(head).ry + Math.sin(t * 0.31) * 0.22;
    head.rotation.x = pose(head).rx + Math.sin(t * 1.6) * 0.03 - crow * crow * 0.22;
  }
  if (tail) {
    tail.rotation.z = pose(tail).rz + Math.sin(t * 0.9) * 0.06;
    tail.rotation.x = pose(tail).rx + Math.sin(t * 1.3) * 0.045;
  }
  if (body) {
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.02;
    body.position.x = pose(body).px + Math.sin(ws) * 0.004;
  }
  const flap = pulse(t, 0.27, 3.4);
  if (r.wingL) r.wingL.rotation.z = pose(r.wingL).rz - flap * (0.5 + 0.4 * Math.sin(t * 24));
  if (r.wingR) r.wingR.rotation.z = pose(r.wingR).rz + flap * (0.5 + 0.4 * Math.sin(t * 24));
  if (r.legL) r.legL.position.y = pose(r.legL).py + Math.max(0, Math.sin(ws)) * 0.007;
  if (r.legR) r.legR.position.y = pose(r.legR).py + Math.max(0, -Math.sin(ws)) * 0.007;
}

// ---------------------------------------------------------------------------
// COW
// ---------------------------------------------------------------------------

export function buildCow(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'cow';
  const rand = rng(41);
  const white = PALETTE.cowWhite;
  const brown = PALETTE.cowBrown;
  // distinctly darker warm pink so the muzzle patch reads against the white head
  const muzzleC = mixColor(PALETTE.pigPink, PALETTE.terracotta, 0.45);

  // deterministic brown patches (ellipsoid zones + dithered edges)
  interface Zone { cx: number; cy: number; cz: number; rx: number; ry: number; rz: number }
  const zones: Zone[] = [
    { cx: 2.6, cy: 11.8, cz: -6.5, rx: 3.8, ry: 3.1, rz: 3.2 },  // rump patch (kept below the dome ridge)
    { cx: -3.8, cy: 11.5, cz: 1.5, rx: 3.0, ry: 3.4, rz: 3.8 },  // left barrel
    { cx: 2.4, cy: 16.4, cz: 12.6, rx: 2.2, ry: 2.0, rz: 1.9 },  // poll/ear patch
    { cx: -1.4, cy: 14.4, cz: -1.5, rx: 2.0, ry: 1.2, rz: 2.2 }, // back spot (below the spine line)
  ];
  const patchColor = (x: number, y: number, z: number): number => {
    let best = 99;
    for (const p of zones) {
      const d =
        ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 + ((z - p.cz) / p.rz) ** 2;
      if (d < best) best = d;
    }
    if (best < 0.92) return brown;
    if (best < 1.35) return rand() > 0.5 ? brown : white;
    return white;
  };

  // -- torso: ONE broad rounded chest/barrel mass — deep flat belly, full
  // width through the chest, smoothly domed back via per-column heights
  // (no stacked slabs, no terraced steps)
  const bodyVox: Voxel[] = [];
  for (let x = -5; x <= 5; x++)
    for (let z = -10; z <= 9; z++) {
      const pn = (x / 5.6) ** 2 + ((z + 0.5) / 10.4) ** 2;
      if (pn >= 1) continue;
      const top = Math.round(11.6 + 4.4 * Math.sqrt(1 - pn));
      for (let y = 6; y <= top; y++) put(bodyVox, x, y, z, patchColor(x, y, z));
    }
  // udder hint between the hind legs
  put(bodyVox, 0, 5.9, -4, PALETTE.pigPink, 1.7);
  mirr((s) => put(bodyVox, s * 0.95, 5.55, -2.9, PALETTE.pigPink, 1.0));

  const body = part('body', bodyVox, 0, 11, 0);
  root.add(body);

  // -- legs (four separate parts for weight shift), dark hooves —
  // they reach UP INTO the barrel so the joint is buried and welded
  const legPart = (xSign: number, zc: number, name: string): THREE.Group => {
    const v: Voxel[] = [];
    const x0 = xSign > 0 ? 3 : -5;
    fill(v, x0, 1.2, zc - 1, x0 + 2, 8.2, zc + 1, patchColor(x0 + 1, 4, zc));
    put(v, x0 + 1, 0.5, zc, PALETTE.cowDark, 1.85); // hoof band
    return part(name, v, x0 + 1, 6, zc);
  };
  const legFL = legPart(1, 6, 'legFL');
  const legFR = legPart(-1, 6, 'legFR');
  const legHL = legPart(1, -7, 'legHL');
  const legHR = legPart(-1, -7, 'legHR');
  root.add(legFL, legFR, legHL, legHR);

  // -- head: LARGE, protruding well ahead of the chest; broad skull, big
  // contrasting muzzle block, horn nubs, sideways ears, eyes PROUD of the
  // surface (front pair past the brow face, cheek pair past the skull side)
  const headVox: Voxel[] = [];
  fill(headVox, -2.5, 10, 8, 2.5, 15.5, 12, white); // thick neck root, buried in the chest
  fill(headVox, -3, 9.5, 11, 3, 16, 17, white); // broad protruding skull
  fill(headVox, -2, 16.3, 11.5, 2, 16.3, 16, white); // brow round-over
  fill(headVox, -2.5, 9.5, 16.5, 2.5, 12.5, 19, muzzleC); // big proud muzzle block
  put(headVox, 0, 9.4, 19.3, mixColor(muzzleC, PALETTE.cowDark, 0.45), 0.8); // mouth
  mirr((s) => {
    put(headVox, s * 0.95, 11.05, 19.05, PALETTE.cowDark, 0.42); // nostrils
    put(headVox, s * 2.55, 14.4, 17.75, PALETTE.black, 0.62); // front eyes, proud of the face
    put(headVox, s * 3.55, 13.9, 15.4, PALETTE.black, 0.58); // cheek eyes, proud of the skull side
  });
  const head = part('head', headVox, 0, 14, 11);
  root.add(head);

  // horns + ears attach to the head so they move together —
  // coords are HEAD-LOCAL (whole-body minus the head pivot 0,14,11),
  // every voxel overlapping the skull/brow or its neighbour
  const hornVox: Voxel[] = [];
  mirr((s) => {
    put(hornVox, s * 2.1, 3.3, 0.9, PALETTE.goatGrey, 0.8);
    put(hornVox, s * 2.1, 3.9, 0.75, PALETTE.stoneLight, 0.5);
  });
  head.add(part('horns', hornVox, 0, 3, 0.9));

  const earMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    put(v, s * 3.35, 2.4, -0.4, PALETTE.cowBrown, 1.2); // rooted over the skull edge
    put(v, s * 4.2, 2.1, -0.55, mixColor(PALETTE.cowBrown, PALETTE.black, 0.25), 0.95);
    return part(nm, v, s * 3.0, 2.2, -0.4);
  };
  head.add(earMake(1, 'earL'), earMake(-1, 'earR'));

  // -- tail with dark tuft: one welded chain from the rump top
  const tailVox: Voxel[] = [];
  for (let i = 0; i < 5; i++) put(tailVox, 0, 13.6 - i * 0.92, -10.8 - i * 0.22, PALETTE.cowBrown, 0.85);
  put(tailVox, 0, 8.9, -11.9, PALETTE.cowDark, 1.25);
  const tail = part('tail', tailVox, 0, 13.5, -10.5);
  root.add(tail);

  setRig(root, { body, head, tail, earL: head.getObjectByName('earL') ?? head, earR: head.getObjectByName('earR') ?? head, legFL, legFR, legHL, legHR });
  savePoses(root);
  return root;
}

export function tickCow(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.55;
  const head = r.head, tail = r.tail, body = r.body;
  if (head) {
    // slow graze cycle + idle chewing while down
    const graze = pulse(t, 0.19, 0.8);
    head.rotation.x = pose(head).rx + Math.sin(t * 1.1) * 0.02 + graze * graze * 0.52;
    head.rotation.y = pose(head).ry + Math.sin(t * 0.23) * 0.08;
    head.rotation.z = pose(head).rz + graze * Math.sin(t * 6.4) * 0.02;
  }
  if (tail) {
    const flick = pulse(t, 1.4, 2.6);
    tail.rotation.y = pose(tail).ry + Math.sin(t * 0.85) * 0.32 + Math.sin(t * 7) * 0.12 * flick;
    tail.rotation.x = pose(tail).rx + Math.sin(t * 0.6) * 0.05;
  }
  if (body) {
    body.scale.y = pose(body).sy * (1 + 0.006 * Math.sin(t * 1.25)); // breathing
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.016;
    body.position.x = pose(body).px + Math.sin(ws) * 0.005;
  }
  const ef = pulse(t, 0.9, 0.3) * 0.55;
  const ef2 = pulse(t, 1.1, 3.9) * 0.55;
  if (r.earL) r.earL.rotation.z = pose(r.earL).rz - ef;
  if (r.earR) r.earR.rotation.z = pose(r.earR).rz + ef2;
  const sw = Math.sin(ws);
  if (r.legFL) r.legFL.position.y = pose(r.legFL).py + Math.max(0, sw) * 0.006;
  if (r.legFR) r.legFR.position.y = pose(r.legFR).py + Math.max(0, -sw) * 0.006;
  if (r.legHL) r.legHL.position.y = pose(r.legHL).py + Math.max(0, -sw) * 0.006;
  if (r.legHR) r.legHR.position.y = pose(r.legHR).py + Math.max(0, sw) * 0.006;
}

// ---------------------------------------------------------------------------
// PIG
// ---------------------------------------------------------------------------

export function buildPig(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'pig';
  const pink = PALETTE.pigPink;
  const dark = PALETTE.pigDark;
  const snoutC = mixColor(PALETTE.pigPink, PALETTE.white, 0.42);

  // -- low, long, chubby body
  const bodyVox: Voxel[] = [];
  fill(bodyVox, -3, 1, -4, 3, 1, 5, pink); // belly sag
  for (let x = -4; x <= 4; x++) for (let z = -5; z <= 6; z++) put(bodyVox, x, 2, z, pink);
  for (let y = 3; y <= 6; y++)
    for (let x = -4; x <= 4; x++)
      for (let z = -6; z <= 7; z++) {
        if (Math.abs(x) === 4 && Math.abs(z) >= 7 && !(y >= 4 && y <= 5)) continue;
        put(bodyVox, x, y, z, pink);
      }
  for (let x = -3; x <= 3; x++) {
    for (let z = -6; z <= -1; z++) put(bodyVox, x, 7, z, pink);
    for (let z = 4; z <= 6; z++) put(bodyVox, x, 7, z, pink);
  } // mid-back dip breaks the loaf line between hip and shoulder
  const body = part('body', bodyVox, 0, 4, 0.5);
  root.add(body);

  // -- distinct head: narrower + taller than the body, big proud snout disc
  const headVox: Voxel[] = [];
  fill(headVox, -2.5, 3.4, 8, 2.5, 7.6, 12.5, pink);
  fill(headVox, -1.7, 7.9, 9, 1.7, 7.9, 12, pink); // crown round-over
  fill(headVox, -1.5, 4.1, 12.6, 1.5, 6.3, 14.3, snoutC); // snout disc, proud
  put(headVox, 0, 3.5, 12.9, mixColor(snoutC, dark, 0.3), 1.6); // jaw hint under the snout
  mirr((s) => {
    put(headVox, s * 0.72, 5.2, 14.45, dark, 0.66); // nostrils
    put(headVox, s * 2.15, 6.7, 11.4, PALETTE.black, 0.56); // eyes wide-set above snout
  });
  const head = part('head', headVox, 0, 6, 8.5);
  root.add(head);

  // -- upright ears w/ dark tips (head-local coords)
  const earMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    put(v, s * 2.1, 2.6, 0.9, pink, 1.45);
    put(v, s * 2.1, 3.9, 1.25, dark, 1.0);
    return part(nm, v, s * 2.1, 1.5, 0.9);
  };
  const earL = earMake(1, 'earL');
  const earR = earMake(-1, 'earR');
  head.add(earL, earR);

  // -- curly tail hint: tiny stepped zigzag, rooted in the rump
  const tailVox: Voxel[] = [];
  put(tailVox, 0, 6.2, -7.45, pink, 0.85);
  put(tailVox, 0.5, 6.85, -7.75, pink, 0.62);
  put(tailVox, -0.05, 7.4, -7.35, dark, 0.55);
  const tail = part('tail', tailVox, 0, 6.5, -7.0);
  root.add(tail);

  // -- stubby legs w/ darker hooves
  const legPart = (xSign: number, zc: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    const x0 = xSign > 0 ? 1 : -3;
    fill(v, x0, 0.7, zc - 0.5, x0 + 1.6, 2.4, zc + 1, pink);
    put(v, x0 + 0.8, 0.35, zc + 0.25, dark, 1.5);
    return part(nm, v, x0 + 0.8, 2.2, zc + 0.25);
  };
  const legFL = legPart(1, 5.5, 'legFL');
  const legFR = legPart(-1, 5.5, 'legFR');
  const legHL = legPart(1, -5, 'legHL');
  const legHR = legPart(-1, -5, 'legHR');
  root.add(legFL, legFR, legHL, legHR);

  setRig(root, { body, head, tail, earL, earR, legFL, legFR, legHL, legHR });
  savePoses(root);
  return root;
}

export function tickPig(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.7;
  const head = r.head, tail = r.tail, body = r.body;
  if (head) {
    const sniff = pulse(t, 0.6, 1.7);
    head.rotation.x = pose(head).rx + Math.sin(t * 1.6) * 0.03 + sniff * sniff * 0.1;
    head.rotation.y = pose(head).ry + Math.sin(t * 0.29) * 0.12;
  }
  if (tail) {
    const wig = pulse(t, 0.5, 2.2);
    tail.rotation.y = pose(tail).ry + Math.sin(t * 9) * 0.2 * wig + Math.sin(t * 1.1) * 0.06;
  }
  if (body) {
    body.scale.y = pose(body).sy * (1 + 0.007 * Math.sin(t * 1.5)); // happy jiggle-breath
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.02;
    body.position.x = pose(body).px + Math.sin(ws) * 0.004;
  }
  const ef = pulse(t, 0.83, 0.6) * 0.5;
  const ef2 = pulse(t, 1.05, 4.2) * 0.5;
  if (r.earL) r.earL.rotation.z = pose(r.earL).rz - ef;
  if (r.earR) r.earR.rotation.z = pose(r.earR).rz + ef2;
  const sw = Math.sin(ws);
  if (r.legFL) r.legFL.position.y = pose(r.legFL).py + Math.max(0, sw) * 0.005;
  if (r.legFR) r.legFR.position.y = pose(r.legFR).py + Math.max(0, -sw) * 0.005;
  if (r.legHL) r.legHL.position.y = pose(r.legHL).py + Math.max(0, -sw) * 0.005;
  if (r.legHR) r.legHR.position.y = pose(r.legHR).py + Math.max(0, sw) * 0.005;
}

// ---------------------------------------------------------------------------
// SHEEP
// ---------------------------------------------------------------------------

export function buildSheep(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sheep';
  const woolA = PALETTE.wool;
  const woolB = PALETTE.woolWhite;
  const woolShade = mixColor(PALETTE.wool, PALETTE.clay, 0.22);
  const faceC = mixColor(PALETTE.clay, PALETTE.black, 0.32); // dark face
  const legC = mixColor(PALETTE.goatGrey, PALETTE.black, 0.38); // dark legs
  const hoofC = mixColor(PALETTE.goatGrey, PALETTE.black, 0.6);
  // seeded three-tone dither — breaks the smooth cake-slab read
  const woolPick = (r: () => number): number => {
    const v = r();
    return v < 0.38 ? woolA : v < 0.76 ? woolB : woolShade;
  };

  // -- fluffy dithered wool body, bigger than the frame inside
  const bodyVox: Voxel[] = [];
  const rLo = rng(56);
  fill(bodyVox, -2, 3, -5, 2, 3, 5, woolA);
  for (let y = 4; y <= 5; y++)
    for (let x = -3; x <= 3; x++)
      for (let z = -6; z <= 6; z++) {
        if (Math.abs(x) === 3 && Math.abs(z) === 6) continue;
        put(bodyVox, x, y, z, rLo() > 0.34 ? woolA : woolB);
      }
  const rb = rng(57);
  for (let y = 6; y <= 8; y++)
    for (let x = -4; x <= 4; x++)
      for (let z = -7; z <= 7; z++) {
        if (Math.abs(x) === 4 && Math.abs(z) === 7) continue;
        put(bodyVox, x, y, z, woolPick(rb));
      }
  for (let x = -3; x <= 3; x++)
    for (let z = -6; z <= 5; z++) put(bodyVox, x, 9, z, woolPick(rb));
  for (let x = -2; x <= 2; x++) for (let z = -5; z <= 3; z++) put(bodyVox, x, 10, z, woolPick(rb));
  // proud fleece tufts so the silhouette shingles instead of slabbing
  const rt = rng(59);
  const tufts: Array<[number, number, number]> = [
    [3.35, 9.3, -2.5], [-3.35, 9.1, 2.5], [4.35, 7.2, -3.0], [-4.35, 7.4, 3.0],
    [1.6, 10.45, 1.5], [-1.5, 10.45, -3.5], [0, 10.75, -0.5], [4.3, 6.6, 4.8],
    [-4.3, 8.6, -5.5],
  ];
  for (const [tx, ty, tz] of tufts) put(bodyVox, tx, ty, tz, rt() > 0.5 ? woolB : woolA, 0.95);
  const body = part('body', bodyVox, 0, 6.5, 0);
  root.add(body);

  // -- narrow dark face poking forward, wool cap flush with the back line
  const headVox: Voxel[] = [];
  fill(headVox, -1, 5, 7, 1, 8.4, 10, faceC);
  fill(headVox, -0.8, 4.6, 9.4, 0.8, 5.9, 10.9, mixColor(faceC, PALETTE.black, 0.25)); // muzzle
  fill(headVox, -1.25, 8.4, 6.8, 1.25, 10.2, 9.8, woolB); // wool cap over the head
  put(headVox, 0, 9.9, 10.1, woolB, 0.85); // forelock tuft
  mirr((s) => {
    put(headVox, s * 0.82, 7.3, 10.35, PALETTE.black, 0.52); // eyes on the face front
  });
  const head = part('head', headVox, 0, 7, 7);
  root.add(head);

  // drooping ears (head-local coords, rooted into the wool cap)
  const earMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    put(v, s * 2.05, 0.9, 0.6, faceC, 1.05);
    put(v, s * 2.9, 0.55, 0.5, mixColor(faceC, PALETTE.black, 0.22), 0.8);
    return part(nm, v, s * 1.4, 0.9, 0.6);
  };
  const earL = earMake(1, 'earL');
  const earR = earMake(-1, 'earR');
  head.add(earL, earR);

  // -- wool tail nub
  const tailVox: Voxel[] = [];
  put(tailVox, 0, 7.2, -7.7, woolB, 1.2);
  const tail = part('tail', tailVox, 0, 7, -6.6);
  root.add(tail);

  // -- darker slender legs
  const legPart = (xSign: number, zc: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    const x0 = xSign > 0 ? 1 : -2;
    fill(v, x0, 0.8, zc - 0.5, x0 + 1, 3.6, zc + 1, legC);
    put(v, x0 + 0.5, 0.4, zc + 0.25, hoofC, 1.15);
    return part(nm, v, x0 + 0.5, 3.4, zc + 0.25);
  };
  const legFL = legPart(1, 4.5, 'legFL');
  const legFR = legPart(-1, 4.5, 'legFR');
  const legHL = legPart(1, -4.5, 'legHL');
  const legHR = legPart(-1, -4.5, 'legHR');
  root.add(legFL, legFR, legHL, legHR);

  setRig(root, { body, head, tail, earL, earR, legFL, legFR, legHL, legHR });
  savePoses(root);
  return root;
}

export function tickSheep(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.5;
  const head = r.head, tail = r.tail, body = r.body;
  const graze = pulse(t, 0.16, 2.2);
  if (head) {
    head.rotation.x = pose(head).rx + Math.sin(t * 0.9) * 0.03 + graze * graze * 0.64;
    head.rotation.z = pose(head).rz + graze * Math.sin(t * 7.2) * 0.028; // chewing
    head.rotation.y = pose(head).ry + Math.sin(t * 0.21) * 0.09;
  }
  if (tail) tail.rotation.y = pose(tail).ry + Math.sin(t * 2.2) * 0.14;
  if (body) {
    body.scale.y = pose(body).sy * (1 + 0.006 * Math.sin(t * 1.1)); // woolly breath
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.015;
  }
  const ef = pulse(t, 0.77, 1.1) * 0.45;
  const ef2 = pulse(t, 0.95, 3.7) * 0.45;
  if (r.earL) r.earL.rotation.z = pose(r.earL).rz - ef;
  if (r.earR) r.earR.rotation.z = pose(r.earR).rz + ef2;
  const sw = Math.sin(ws);
  if (r.legFL) r.legFL.position.y = pose(r.legFL).py + Math.max(0, sw) * 0.005;
  if (r.legFR) r.legFR.position.y = pose(r.legFR).py + Math.max(0, -sw) * 0.005;
  if (r.legHL) r.legHL.position.y = pose(r.legHL).py + Math.max(0, -sw) * 0.005;
  if (r.legHR) r.legHR.position.y = pose(r.legHR).py + Math.max(0, sw) * 0.005;
}

// ---------------------------------------------------------------------------
// DUCK
// ---------------------------------------------------------------------------

export function buildDuck(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'duck';
  const white = PALETTE.duckWhite;
  const bill = PALETTE.duckBill;
  const wingEdge = mixColor(PALETTE.duckWhite, PALETTE.gravel, 0.45);

  // -- horizontal body with keeled tail rising at the rear
  const bodyVox: Voxel[] = [];
  fill(bodyVox, -2, 2, -3, 2, 2, 3, white);
  for (let y = 3; y <= 4; y++)
    for (let x = -2; x <= 2; x++)
      for (let z = -4; z <= 4; z++) {
        if (Math.abs(x) === 2 && Math.abs(z) === 4) continue;
        put(bodyVox, x, y, z, white);
      }
  for (let x = -2; x <= 2; x++) for (let z = -4; z <= 3; z++) put(bodyVox, x, 5, z, white);
  for (let x = -1; x <= 1; x++) for (let z = -4; z <= 2; z++) put(bodyVox, x, 6, z, white);
  put(bodyVox, 0, 6.55, -4.5, white, 0.9); // keel rise
  put(bodyVox, 0, 7.15, -5.25, white, 0.68); // keel point
  const body = part('body', bodyVox, 0, 4, 0);
  root.add(body);

  // -- neck-forward head, broad two-part bill
  const headVox: Voxel[] = [];
  fill(headVox, -1, 6, 2, 1, 9, 4, white); // neck
  fill(headVox, -1, 9, 2, 1, 11, 5, white); // head
  fill(headVox, -0.7, 11.5, 2.6, 0.7, 11.9, 4.4, white); // crown round-over
  fill(headVox, -1.2, 9.9, 5.0, 1.2, 10.65, 7.0, bill); // broad upper bill
  put(headVox, 0, 10.3, 7.3, mixColor(bill, PALETTE.black, 0.3), 0.55); // bill nail
  mirr((s) => {
    put(headVox, s * 1.32, 10.55, 4.15, PALETTE.black, 0.5); // eyes
    put(headVox, s * 0.55, 10.8, 6.0, mixColor(bill, PALETTE.black, 0.2), 0.26); // nostrils
  });
  const head = part('head', headVox, 0, 8.5, 3);
  root.add(head);

  // lower bill as its own part so it can quack open (head-local coords)
  const jawVox: Voxel[] = [];
  fill(jawVox, -1.15, 0.5, 1.6, 1.15, 0.95, 3.5, mixColor(bill, PALETTE.black, 0.18));
  const jaw = part('jaw', jawVox, 0, 0.9, 1.6);
  head.add(jaw);

  // -- folded wings with grey tips
  const wingMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    for (let z = -3; z <= 1; z++)
      for (let y = 3; y <= 5; y++) {
        if (y === 3 && z === 1) continue;
        put(v, s * 2.5, y, z, z <= -2 ? wingEdge : white, 1.0);
      }
    return part(nm, v, s * 2.0, 4, -1);
  };
  const wingL = wingMake(1, 'wingL');
  const wingR = wingMake(-1, 'wingR');
  root.add(wingL, wingR);

  // -- short orange legs, webbed feet (shin reaches up into the belly)
  const legMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    put(v, s * 1.1, 1.2, 0, bill, 0.7);
    put(v, s * 1.1, 0.3, 0.25, bill, 0.95);
    put(v, s * 1.1, 0.22, 0.95, mixColor(bill, PALETTE.black, 0.25), 0.48);
    return part(nm, v, s * 1.1, 1.6, 0);
  };
  const legL = legMake(1, 'legL');
  const legR = legMake(-1, 'legR');
  root.add(legL, legR);

  setRig(root, { body, head, jaw, wingL, wingR, legL, legR });
  savePoses(root);
  return root;
}

export function tickDuck(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const ws = t * 0.85;
  const head = r.head, jaw = r.jaw, body = r.body;
  if (head) {
    const shake = pulse(t, 0.28, 1.1);
    head.rotation.x = pose(head).rx + Math.sin(t * 1.9) * 0.05;
    head.rotation.y = pose(head).ry + Math.sin(t * 13) * 0.24 * shake; // water-shake wobble
  }
  if (jaw) {
    const quack = pulse(t, 0.4, 3);
    jaw.rotation.x = pose(jaw).rx + quack * (0.22 + 0.08 * Math.sin(t * 9));
  }
  if (body) {
    const wag = pulse(t, 0.33, 0.5);
    body.rotation.y = pose(body).ry + Math.sin(t * 8) * 0.16 * wag + Math.sin(t * 1.4) * 0.05; // tail wag via rear keel
    body.rotation.z = pose(body).rz + Math.sin(ws) * 0.024;
    body.position.x = pose(body).px + Math.sin(ws) * 0.004;
  }
  const flap = pulse(t, 0.36, 2.6);
  if (r.wingL) r.wingL.rotation.z = pose(r.wingL).rz - flap * (0.3 + 0.3 * Math.sin(t * 25));
  if (r.wingR) r.wingR.rotation.z = pose(r.wingR).rz + flap * (0.3 + 0.3 * Math.sin(t * 25));
  if (r.legL) r.legL.position.y = pose(r.legL).py + Math.max(0, Math.sin(ws)) * 0.007;
  if (r.legR) r.legR.position.y = pose(r.legR).py + Math.max(0, -Math.sin(ws)) * 0.007;
}

// ---------------------------------------------------------------------------
// BEE — chunky Minecraft-style, fully voxel (no spheres, no toruses)
// ---------------------------------------------------------------------------

export function buildBee(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'bee';
  const yellow = PALETTE.beeYellow;
  const black = PALETTE.beeBlack;
  const fuzz = mixColor(yellow, black, 0.38);

  const bodyVox: Voxel[] = [];
  // abdomen: alternating stripe rings, tapering to a stinger
  fill(bodyVox, -2, -1, -1, 2, 1, 0, yellow);
  fill(bodyVox, -2, -1, -2, 2, 1, -2, black);
  fill(bodyVox, -2, -1, -3, 2, 1, -3, yellow);
  fill(bodyVox, -1, -1, -4, 1, 1, -4, black);
  fill(bodyVox, -1, 0, -4.6, 1, 1, -4.2, yellow);
  put(bodyVox, 0, 0.5, -5.4, black, 0.8); // stinger
  // fuzzy thorax
  const rf = rng(71);
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = 1; z <= 2; z++) put(bodyVox, x, y, z, rf() > 0.4 ? fuzz : black);
  // head: bright yellow face for eye contrast
  fill(bodyVox, -1, 0, 3, 1, 2, 4, yellow);
  fill(bodyVox, -1, 2.1, 3, 1, 2.6, 4, fuzz); // fuzzy crown
  mirr((s) => {
    put(bodyVox, s * 1.12, 1.2, 4.35, black, 0.78); // big friendly eyes
    // antennae: welded two-segment chain + club tip rising off the crown
    put(bodyVox, s * 0.45, 2.68, 4.25, black, 0.36);
    put(bodyVox, s * 0.6, 2.96, 4.4, black, 0.36);
    put(bodyVox, s * 0.85, 3.3, 4.55, black, 0.42); // club tips
  });
  // dangling legs (bees trail them in flight) — contiguous segments
  mirr((s) => {
    for (let i = 0; i < 3; i++) put(bodyVox, s * 1.35, -1.3 - i * 0.34, 2 - i * 0.25, black, 0.44);
  });
  const body = part('body', bodyVox, 0, 0.5, 0);
  body.position.set(0, 0.16, 0);
  root.add(body);

  // translucent double wings per side — rooted INTO the thorax top
  const wingMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    for (let zx = 0.4; zx <= 2.0; zx += 0.8)
      for (let xi = 1.4; xi <= 3.4; xi += 1.0) put(v, s * xi, 1.62, zx, PALETTE.white, 0.55);
    for (let xi = 1.4; xi <= 2.4; xi += 1.0) put(v, s * xi, 1.56, -0.4, PALETTE.white, 0.5);
    return ghostPart(nm, v, s * 0.9, 1.0, 1.2);
  };
  const wingL = wingMake(1, 'wingL');
  const wingR = wingMake(-1, 'wingR');
  body.add(wingL, wingR);

  setRig(root, { body, wingL, wingR });
  savePoses(root);
  return root;
}

export function tickBee(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const body = r.body;
  if (!body) return;
  // hover bob + gentle bank — a bee's idle IS hovering
  body.position.y = pose(body).py + Math.sin(t * 2.7) * 0.028;
  body.rotation.z = pose(body).rz + Math.sin(t * 1.35) * 0.06;
  body.rotation.x = pose(body).rx + Math.sin(t * 1.05) * 0.045;
  const f = 0.2 + 0.45 * Math.abs(Math.sin(t * 26));
  if (r.wingL) r.wingL.rotation.z = pose(r.wingL).rz - f;
  if (r.wingR) r.wingR.rotation.z = pose(r.wingR).rz + f;
}

// ---------------------------------------------------------------------------
// BUTTERFLY — monarch-plate wings, folded flaps, dotted accents
// ---------------------------------------------------------------------------

export function buildButterfly(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'butterfly';
  const dark = PALETTE.charcoal;
  const wing = PALETTE.flowerOrange;
  const dot = PALETTE.flowerWhite;

  const bodyVox: Voxel[] = [];
  put(bodyVox, 0, 0, -1, dark, 1.1);
  put(bodyVox, 0, -0.05, -1.95, dark, 0.95);
  put(bodyVox, 0, -0.1, -2.85, dark, 0.8); // tapered abdomen, overlapping segments
  put(bodyVox, 0, 0.15, 0.4, mixColor(dark, PALETTE.beeYellow, 0.2), 1.15); // thorax
  put(bodyVox, 0, 0.35, 1.4, dark, 0.95); // head
  mirr((s) => {
    put(bodyVox, s * 0.55, 0.6, 1.85, PALETTE.flowerYellow, 0.38); // glinting eyes
    // antennae: welded two-segment chain + club tip off the head
    put(bodyVox, s * 0.34, 0.95, 1.8, dark, 0.26);
    put(bodyVox, s * 0.5, 1.22, 1.95, dark, 0.26);
    put(bodyVox, s * 0.68, 1.5, 2.1, dark, 0.32); // club tip
  });
  const body = part('body', bodyVox, 0, 0.3, 0);
  body.position.set(0, 0.22, 0);
  root.add(body);

  // monarch fore+hind wing plates with charcoal borders and white dots
  const wingMake = (s: number, nm: string): THREE.Group => {
    const v: Voxel[] = [];
    const cells: Array<[number, number]> = [
      // [z, xExtent] rows from leading edge back — fore wing
      [3.1, 2.2], [2.1, 3.2], [1.1, 4.2], [0.1, 3.6],
      // hind wing
      [-0.9, 2.8], [-1.9, 1.8],
    ];
    cells.forEach(([z, xe], row) => {
      const steps = Math.ceil(xe / 0.9);
      for (let i = 0; i <= steps; i++) {
        const x = 0.85 + i * 0.85;
        if (x > xe) break;
        const edge = i === steps || row === 0 || row === cells.length - 1;
        let c: number = edge ? dark : wing;
        if (!edge && ((row === 2 && i % 2 === 1) || (row === 1 && i === 1))) c = dot;
        put(v, s * x, 0, z, c, 0.92);
      }
    });
    return part(nm, v, s * 0.7, 0.25, 0.5);
  };
  const wingL = wingMake(1, 'wingL');
  const wingR = wingMake(-1, 'wingR');
  body.add(wingL, wingR);

  setRig(root, { body, wingL, wingR });
  savePoses(root);
  return root;
}

export function tickButterfly(pivotObj: THREE.Object3D, t: number): void {
  const r = rigOf(pivotObj);
  const body = r.body;
  if (!body) return;
  // gentle fold oscillation that never closes past ~25° — mid-flap frames
  // must still read as an open-winged butterfly, not a folded origami tangle
  const f = 0.12 + 0.34 * (0.5 + 0.5 * Math.sin(t * 1.9)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.7)));
  if (r.wingL) r.wingL.rotation.z = pose(r.wingL).rz - f;
  if (r.wingR) r.wingR.rotation.z = pose(r.wingR).rz + f;
  body.position.y = pose(body).py + Math.sin(t * 1.8) * 0.018;
  body.rotation.z = pose(body).rz + Math.sin(t * 0.8) * 0.08;
}
