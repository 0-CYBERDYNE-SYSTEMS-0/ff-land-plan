/**
 * Enclosure shells for non-outdoor plan surfaces — the visual "you are
 * inside" read for grow tents, warehouses and greenhouses.
 *
 * One root group per build; disposeShell() frees everything it created.
 * Walls/ceiling are plain boxes (shell surfaces are flat by design), interior
 * light bars use an unlit basic material so they read as luminous. The
 * greenhouse shell is translucent glass + frame posts so the live sky, clouds
 * and sun stay visible through it (sky.ts keeps owning THE light — the shell
 * only occludes, it never adds lights).
 */
import * as THREE from 'three';
import type { PlanState, PlanSurface } from '@/types';

export interface ShellGroup {
  root: THREE.Group;
  surface: PlanSurface;
}

interface SurfaceSkin {
  wall: number;
  trim: number;
  ceiling: number | null; // null = glass ceiling (greenhouse)
  glass: boolean;
  /** Interior LED rows for fully enclosed skins. */
  lightRows: number;
}

const SKINS: Partial<Record<PlanSurface, SurfaceSkin>> = {
  tent: { wall: 0x2c2c31, trim: 0x1f1f23, ceiling: 0x26262b, glass: false, lightRows: 2 },
  indoor: { wall: 0xb7bcc2, trim: 0x8b9096, ceiling: 0x64696f, glass: false, lightRows: 3 },
  greenhouse: { wall: 0x9aa2a8, trim: 0x5b6770, ceiling: null, glass: true, lightRows: 0 },
};

const THICK = 0.06;

/** Wall height per surface — tents are snug, warehouses tall. */
function wallHeightFor(surface: PlanSurface): number {
  if (surface === 'tent') return 1.9;
  if (surface === 'indoor') return 2.6;
  return 2.3;
}

export function buildShell(plan: PlanState, scene: THREE.Scene): ShellGroup | null {
  const surface = plan.surface ?? 'outdoor';
  const skin = SKINS[surface];
  if (!skin) return null;

  const root = new THREE.Group();
  const WH = wallHeightFor(surface);
  root.name = `shell:${surface}`;

  const w = plan.widthM;
  const d = plan.heightM;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const box = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    geos.push(mesh.geometry as THREE.BufferGeometry);
    root.add(mesh);
  };

  const wallMat = skin.glass
    ? new THREE.MeshLambertMaterial({ color: 0xbfe3ef, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshLambertMaterial({ color: skin.wall });
  const trimMat = new THREE.MeshLambertMaterial({ color: skin.trim });
  mats.push(wallMat, trimMat);

  // Perimeter walls. Tent/warehouse build "dollhouse style": only the two FAR
  // walls are solid so the default camera (looking from the +X/+Z corner)
  // always sees into the room; the greenhouse is fully glazed instead.
  const wy = WH / 2;
  const nearWalls = !skin.glass;
  box(wallMat, w + THICK * 2, WH, THICK, 0, wy, -d / 2);
  box(wallMat, THICK, WH, d, -w / 2, wy, 0);
  if (!nearWalls) {
    box(wallMat, w + THICK * 2, WH, THICK, 0, wy, d / 2);
    box(wallMat, THICK, WH, d, w / 2, wy, 0);
  }
  for (const z of [-d / 2, d / 2]) box(trimMat, w + THICK * 2, 0.1, THICK * 1.6, 0, 0.05, z);
  for (const x of [-w / 2, w / 2]) box(trimMat, THICK * 1.6, 0.1, d, x, 0.05, 0);

  // Frame posts on enclosed skins (every ~2.5 m) so big walls read structured.
  if (!skin.glass) {
    for (let x = -w / 2 + 1.25; x < w / 2; x += 2.5) {
      box(trimMat, 0.08, WH, 0.08, x, wy, -d / 2 + THICK);
    }
  } else {
    for (let x = -w / 2 + 2.5; x < w / 2; x += 2.5) {
      box(trimMat, 0.07, WH, 0.07, x, wy, -d / 2);
      box(trimMat, 0.07, WH, 0.07, x, wy, d / 2);
    }
    for (let z = -d / 2 + 2.5; z < d / 2; z += 2.5) {
      box(trimMat, 0.07, WH, 0.07, -w / 2, wy, z);
      box(trimMat, 0.07, WH, 0.07, w / 2, wy, z);
    }
  }

  // Ceiling: greenhouse gets a glazed roof (see-through, so it frames the sky).
  // Tent/warehouse stay open-topped dollhouse-style with just a beam frame —
  // a solid slab would wall off the high default camera.
  if (skin.ceiling !== null && !skin.glass) {
    box(trimMat, w + THICK * 2, 0.1, 0.12, 0, WH + 0.05, -d / 2);
    box(trimMat, w + THICK * 2, 0.1, 0.12, 0, WH + 0.05, d / 2);
    for (let x = -w / 2 + 2.5; x < w / 2; x += 2.5) {
      box(trimMat, 0.1, 0.08, d, x, WH + 0.05, 0);
    }
  } else {
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe3ef, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    mats.push(glassMat);
    box(glassMat, w + THICK * 2, THICK, d + THICK * 2, 0, WH + THICK / 2, 0);
    // ridge beam + half-hip hint
    box(trimMat, w + THICK * 2, 0.1, 0.12, 0, WH + 0.14, 0);
  }

  // Interior light bars (enclosed skins only) — unlit bright material.
  if (skin.lightRows > 0) {
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    mats.push(lightMat);
    const hangMat = new THREE.MeshLambertMaterial({ color: 0x3f464b });
    mats.push(hangMat);
    for (let r = 0; r < skin.lightRows; r++) {
      const z = d * ((r + 1) / (skin.lightRows + 1)) - d / 2;
      const barLen = Math.max(0.6, w - 0.5);
      box(hangMat, 0.03, 0.35, 0.03, -barLen / 4, WH - 0.32, z);
      box(hangMat, 0.03, 0.35, 0.03, barLen / 4, WH - 0.32, z);
      box(lightMat, barLen / 2, 0.06, 0.12, -barLen / 4, WH - 0.52, z);
      box(lightMat, barLen / 2, 0.06, 0.12, barLen / 4, WH - 0.52, z);
    }
  }

  scene.add(root);
  return { root, surface };
}

export function disposeShell(shell: ShellGroup | null): void {
  if (!shell) return;
  shell.root.removeFromParent();
  shell.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      mesh.geometry.dispose();
    }
  });
  const mats = new Set<THREE.Material>();
  shell.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      const m = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((x) => mats.add(x));
      else if (m) mats.add(m);
    }
  });
  for (const m of mats) m.dispose();
}
