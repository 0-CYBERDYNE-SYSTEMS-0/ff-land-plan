/**
 * Lane D atmosphere demos.
 *
 * buildPresetDiorama(): a small farm vignette (grass pedestal, hay bale,
 * fence post, tufts + a living chicken) reused identically for every lighting
 * preset so the five moods compare like-for-like. The preset's background
 * color is applied to the cell Scene each tick — the showcase owns the Scene
 * and ticks reach it through obj.parent (a physical backdrop plane would
 * wreck the auto-framing camera and swing with the turntable).
 *
 * buildWindDemo(): a tilled row of 5 wheat stalks + 2 staked tomato plants;
 * tick applies a phase-offset ripple sway (each plant its own sine phase),
 * amplitude scaled to plant height. Zero jitter — pure sines, no noise.
 */
import * as THREE from 'three';
import { PALETTE, mixColor, fillDither, rng, type Voxel } from '@/creative/voxel';
import type { LightPreset } from '@/creative/studio/presets';
import { mirr, part, savePoses } from './build';
import { buildHen, tickHen } from './animals';

const DU = 0.05; // diorama unit

// ---------------------------------------------------------------------------
// Shared vignette geometry
// ---------------------------------------------------------------------------

function grassPedestal(): Voxel[] {
  const v: Voxel[] = [];
  const rg = rng(211);
  for (let x = -9; x <= 9; x++)
    for (let z = -9; z <= 9; z++) {
      if ((Math.abs(x) === 9 || Math.abs(z) === 9) && rg() > 0.55) continue; // worn corners
      const c = rg() > 0.86 ? PALETTE.grassLight : rg() > 0.5 ? PALETTE.grass : PALETTE.grassDark;
      v.push({ x, y: 0, z, color: c });
    }
  // soil skirt so the pedestal reads as a cut turf block
  fillDither(v, -8, -0.9, -9, 8, -0.2, -9, PALETTE.soilDark, PALETTE.soil, 213);
  fillDither(v, -8, -0.9, 9, 8, -0.2, 9, PALETTE.soilDark, PALETTE.soil, 214);
  fillDither(v, -9, -0.9, -8, -9, -0.2, 8, PALETTE.soilDark, PALETTE.soil, 215);
  fillDither(v, 9, -0.9, -8, 9, -0.2, 8, PALETTE.soilDark, PALETTE.soil, 216);
  return v;
}

function hayBale(dx: number, dz: number): Voxel[] {
  const v: Voxel[] = [];
  const rb = rng(217);
  for (let x = -2; x <= 2; x++)
    for (let y = 1; y <= 4; y++)
      for (let z = -2; z <= 2; z++) {
        if (y === 4 && Math.abs(x) === 2 && Math.abs(z) === 2) continue;
        v.push({ x: dx + x, y, z: dz + z, color: rb() > 0.48 ? PALETTE.hay : PALETTE.straw });
      }
  // twine bands around the bale
  for (let y = 1; y <= 4; y++)
    for (let z = -2; z <= 2; z++) {
      v.push({ x: dx - 1, y, z: dz + z, color: PALETTE.woodDark });
      v.push({ x: dx + 1, y, z: dz + z, color: PALETTE.woodDark });
    }
  // flake seam across the top
  const rs = rng(219);
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) if (rs() > 0.4) v.push({ x: dx + x, y: 4.35, z: dz + z, color: PALETTE.mulch, s: 0.45 });
  return v;
}

function fencePost(px: number, pz: number): Voxel[] {
  const v: Voxel[] = [];
  fillDither(v, px, 1, pz, px, 7, pz, PALETTE.wood, PALETTE.woodDark, 221);
  v.push({ x: px, y: 7.6, z: pz, color: PALETTE.plankLight, s: 1.5 }); // capped post
  // rail running toward the back edge of the pedestal
  for (let z = pz + 2; z <= 8; z++) v.push({ x: px, y: 4.6, z, color: PALETTE.wood, s: 0.85 });
  return v;
}

function tuftsAndFlowers(): Voxel[] {
  const v: Voxel[] = [];
  const rt = rng(223);
  const spots: Array<[number, number]> = [
    [-6, 4], [5, 1], [-2, -6], [7, -6], [-7, -2], [2, 6],
  ];
  spots.forEach(([x, z], i) => {
    if (rt() > 0.25) {
      // grass tuft: two stacked blades
      v.push({ x, y: 0.75, z, color: PALETTE.grassLight, s: 0.42 });
      v.push({ x: x + 0.18, y: 1.15, z: z - 0.12, color: PALETTE.stem, s: 0.3 });
    }
    if (i % 3 === 0) {
      // tiny flower on a stem
      const bloom = i === 0 ? PALETTE.flowerPink : i === 3 ? PALETTE.flowerYellow : PALETTE.flowerWhite;
      v.push({ x: x - 0.5, y: 0.65, z: z + 0.4, color: PALETTE.stem, s: 0.22 });
      v.push({ x: x - 0.5, y: 1.05, z: z + 0.4, color: bloom, s: 0.4 });
    }
  });
  return v;
}

export function buildPresetDiorama(preset: LightPreset): THREE.Group {
  const root = new THREE.Group();
  root.name = `diorama-${preset.id}`;

  root.add(part('ground', grassPedestal(), 0, 0, 0, DU));
  root.add(part('hay', hayBale(-5, -4), 0, 0, 0, DU));
  root.add(part('post', fencePost(6, -5), 0, 0, 0, DU));
  root.add(part('flora', tuftsAndFlowers(), 0, 0, 0, DU));

  const hen = buildHen();
  hen.name = 'creature';
  hen.rotation.y = -0.55; // three-quarter pose toward the default camera
  hen.position.set(1.6 * DU, 0, 2.2 * DU);
  root.add(hen);

  root.userData.presetId = preset.id;
  root.userData.hen = hen;
  savePoses(root);
  return root;
}

/**
 * Per-frame driver for a preset cell: keeps the scene background pinned to
 * the preset sky and animates the resident chicken. Runs after the showcase
 * has reset light defaults and re-applied tune(), every frame.
 */
export function makePresetTick(preset: LightPreset) {
  return (pivotObj: THREE.Object3D, t: number): void => {
    const scene = pivotObj.parent as THREE.Scene | null;
    if (scene) {
      if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(preset.background);
      else scene.background.setHex(preset.background);
    }
    const root = pivotObj.children[0];
    const hen = root && (root.userData.hen as THREE.Group | undefined);
    if (hen) tickHen(hen, t);
  };
}

// ---------------------------------------------------------------------------
// Wind-sway demo — 5 wheat + 2 tomato, phase-offset ripple along the row
// ---------------------------------------------------------------------------

interface SwayPlant {
  node: THREE.Object3D;
  amp: number; // radians at full sine peak — scales with plant height
}

function wheatStalk(seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wheat';
  const rw = rng(seed);
  const stemC = mixColor(PALETTE.wheatGreen, PALETTE.wheat, 0.45);
  const v: Voxel[] = [];
  // main culm
  for (let y = 1; y <= 7; y++) v.push({ x: 0, y, z: 0, color: stemC, s: 0.55 });
  // tillers
  mirr((s) => {
    for (let y = 1.4; y <= 4.2; y += 0.9) v.push({ x: s * 0.75, y, z: 0.15, color: mixColor(stemC, PALETTE.leafDark, 0.25), s: 0.42 });
  });
  // arcing blade leaves (drooping steps)
  mirr((s) => {
    v.push({ x: s * 1.25, y: 4.6, z: 0, color: PALETTE.leaf, s: 0.42 });
    v.push({ x: s * 1.85, y: 5.45, z: 0.05, color: PALETTE.leafLight, s: 0.36 });
    v.push({ x: s * 2.25, y: 6.15, z: 0.1, color: mixColor(PALETTE.leafLight, PALETTE.wheatGreen, 0.5), s: 0.3 });
  });
  // dense grain head with awns — center spike + paired grains per level
  for (let y = 7.6; y <= 10; y += 0.8) {
    v.push({ x: 0, y: y + 0.35, z: 0, color: rw() > 0.5 ? PALETTE.wheat : mixColor(PALETTE.wheat, PALETTE.cornGold, 0.4), s: 0.52 });
    mirr((s) => v.push({ x: s * 0.3 * (1 + (y - 7.6) * 0.8), y, z: 0, color: rw() > 0.4 ? PALETTE.wheat : mixColor(PALETTE.wheat, PALETTE.cornGold, 0.4), s: 0.58 }));
  }
  v.push({ x: 0, y: 10.4, z: 0, color: PALETTE.cornGold, s: 0.55 });
  mirr((s) => {
    v.push({ x: s * 0.22, y: 11.15, z: 0.08, color: PALETTE.straw, s: 0.24 });
    v.push({ x: s * 0.3, y: 11.85, z: -0.06, color: PALETTE.straw, s: 0.2 });
  });

  const body = part('stalk', v, 0, 1, 0);
  g.add(body);
  savePoses(g);
  return g;
}

function tomatoPlant(seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'tomato';
  const rr = rng(seed);
  const v: Voxel[] = [];

  // wooden stake
  for (let y = 0; y <= 13; y++) v.push({ x: 0.55, y, z: 0.3, color: y % 4 === 0 ? PALETTE.woodDark : PALETTE.wood, s: 0.6 });
  // main stem
  for (let y = 1; y <= 9; y += 0.9) v.push({ x: 0, y, z: 0, color: PALETTE.stem, s: 0.62 });

  // branches with dense leaf clusters
  const branch = (sSign: number, yBase: number): void => {
    v.push({ x: sSign * 0.9, y: yBase + 0.5, z: 0.15, color: PALETTE.stem, s: 0.5 });
    v.push({ x: sSign * 1.7, y: yBase + 1.05, z: 0.25, color: PALETTE.stem, s: 0.45 });
    const leafCols = [PALETTE.leaf, PALETTE.leafDark, PALETTE.leafLight];
    for (let i = 0; i < 7; i++)
      v.push({
        x: sSign * (1.15 + rr() * 1.7),
        y: yBase + 0.9 + rr() * 1.8,
        z: 0.2 + (rr() - 0.5) * 1.3,
        color: leafCols[Math.floor(rr() * 3)],
        s: 0.8 + rr() * 0.2,
      });
  };
  branch(1, 3); branch(-1, 4.6); branch(1, 6.2); branch(-1, 7.8);

  // fruit trusses — green→ripe story
  const fruit = (fx: number, fy: number, fz: number, ripe: boolean): void => {
    v.push({ x: fx, y: fy, z: fz, color: ripe ? PALETTE.tomato : mixColor(PALETTE.tomato, PALETTE.leafDark, 0.55), s: 1.15 });
    v.push({ x: fx, y: fy + 0.62, z: fz, color: PALETTE.stem, s: 0.4 });
  };
  fruit(1.9, 4.1, 0.5, true);
  fruit(-1.8, 6.1, 0.4, true);
  fruit(1.4, 8.1, 0.4, false);

  // twine ties to the stake
  v.push({ x: 0.3, y: 4.8, z: 0.28, color: PALETTE.straw, s: 0.32 });
  v.push({ x: 0.3, y: 7.2, z: 0.28, color: PALETTE.straw, s: 0.32 });

  const body = part('plant', v, 0, 1, 0);
  g.add(body);
  savePoses(g);
  return g;
}

export function buildWindDemo(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'wind-sway-demo';

  // grass pad + tilled strip with furrows running along the row
  const padVox: Voxel[] = [];
  fillDither(padVox, -10, 0, -3, 10, 0, 3, PALETTE.grass, PALETTE.grassDark, 231);
  const rfur = rng(233);
  for (let x = -8; x <= 8; x++)
    for (let z = -2; z <= 2; z++) {
      const furrow = z === -2 || z === 0 || z === 2;
      padVox.push({
        x, y: furrow ? -0.18 : 0.14, z,
        color: furrow ? PALETTE.soilWet : rfur() > 0.78 ? PALETTE.soilLight : PALETTE.soil,
      });
    }
  root.add(part('bed', padVox, 0, 0, 0, DU));

  // the row: 5 wheat then 2 tomato, evenly spaced along X
  const plants: SwayPlant[] = [];
  const xs = [-6.5, -4.5, -2.5, -0.5, 1.5, 4.2, 6.6];
  xs.forEach((x, i) => {
    const isTomato = i >= 5;
    const plant = isTomato ? tomatoPlant(240 + i) : wheatStalk(230 + i);
    plant.position.set(x * DU, 0.14 * DU, 0);
    root.add(plant);
    // amplitude scales with height: taller plants travel further at the tip
    plants.push({ node: plant, amp: isTomato ? 0.095 : 0.065 });
  });

  root.userData.sway = plants;
  savePoses(root);
  return root;
}

export function tickWindDemo(pivotObj: THREE.Object3D, t: number): void {
  const root = pivotObj.children[0];
  const plants = root && (root.userData.sway as SwayPlant[] | undefined);
  if (!plants) return;
  // ripple travels down the row; secondary cross-breeze on a faster clock.
  // Plain indexed loop — no closure allocation per frame.
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    p.node.rotation.z = Math.sin(t * 1.5 - i * 0.68) * p.amp;
    p.node.rotation.x = Math.sin(t * 2.3 - i * 0.41) * p.amp * 0.3;
  }
}
