/**
 * World dressing — ambient tool props scattered near their real-world anchors,
 * built from the Lane D creative voxel tools (src/creative/creatures/tools.ts).
 *
 * Scene life, NOT planning data: dressing never writes to the plan and never
 * sits on planted cells. Spawn rules (deterministic — every pick is a hash or
 * a sorted-order scan, zero Math.random, rebuilds are stable):
 *  - shed door side      → wheelbarrow parked outside, pitchfork leaning on the wall
 *  - water-tap cells     → watering can + bucket close by
 *  - rain-barrel regions → watering can + bucket when no tap exists
 *  - bed edges           → seed bag / hoe alternately, resting against the bed
 *
 * Tools are STATIC still-lifes (the creative kit gives them no tick rig), so
 * unlike animals.ts we can cache one template per kind, `Object3D.clone()` per
 * placement (clones share geometry/materials) and dispose everything on
 * rebuild. Each template is bbox-measured and uniformly rescaled to honest
 * real-world dimensions (1 voxel = 10 cm in the kit):
 *   wheelbarrow 1.2 m · hoe/pitchfork 1.5 m (leaning ~15°) ·
 *   watering-can 0.35 m · bucket 0.28 m · seed-bag 0.45 m.
 */
import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';
import {
  buildWateringCan,
  buildWheelbarrow,
  buildHoe,
  buildPitchfork,
  buildSeedBag,
  buildBucket,
} from '@/creative/creatures/tools';

export interface DressingSystem {
  /** Placed static props (clones owned by this system). */
  props: THREE.Object3D[];
}

type PropKind = 'wheelbarrow' | 'pitchfork' | 'watering-can' | 'bucket' | 'seed-bag' | 'hoe';

const PROP_BUILDERS: Record<PropKind, () => THREE.Group> = {
  'wheelbarrow': buildWheelbarrow,
  'pitchfork': buildPitchfork,
  'watering-can': buildWateringCan,
  'bucket': buildBucket,
  'seed-bag': buildSeedBag,
  'hoe': buildHoe,
};

/** Real-world target size (metres) for each prop's largest dimension. */
const PROP_SIZE_M: Record<PropKind, number> = {
  'wheelbarrow': 1.2,
  'pitchfork': 1.5,
  'hoe': 1.5,
  'watering-can': 0.35,
  'bucket': 0.28,
  'seed-bag': 0.45,
};

const LEANING_KINDS = new Set<PropKind>(['hoe', 'pitchfork']);
const LEAN_RAD = THREE.MathUtils.degToRad(15);

const MAX_PROPS = 12;

/** Slugs props may rest on besides bare ground — walkable surfaces only. */
const WALKABLE_SLUGS = new Set(['path-gravel', 'path-woodchip', 'path-stone']);

/** Bed slugs whose edges attract tools. */
const BED_SLUGS = new Set(['raised-bed', 'inground-bed']);

/** Deterministic small hash (same construction as src/three/structures.ts). */
function hashCell(x: number, z: number): number {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

/**
 * Group matching ground cells into 4-connected contiguous regions.
 * Deterministic: anchors visited in lexicographically-sorted key order.
 */
function regionsOf(plan: PlanState, match: (slug: string) => boolean): string[][] {
  const keys = Object.entries(plan.ground)
    .filter(([, slug]) => match(slug))
    .map(([k]) => k)
    .sort();
  const remaining = new Set(keys);
  const regions: string[][] = [];
  for (const anchor of keys) {
    if (!remaining.has(anchor)) continue;
    remaining.delete(anchor);
    const region: string[] = [];
    const queue: string[] = [anchor];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      region.push(key);
      const [cx, cz] = parseKey(key);
      for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
        const nk = `${nx},${nz}`;
        if (remaining.has(nk)) {
          remaining.delete(nk);
          queue.push(nk);
        }
      }
    }
    regions.push(region.sort());
  }
  return regions.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

interface RegionBox {
  minCx: number; maxCx: number; minCz: number; maxCz: number;
}

function regionBox(region: string[]): RegionBox {
  let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;
  for (const key of region) {
    const [cx, cz] = parseKey(key);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cz < minCz) minCz = cz;
    if (cz > maxCz) maxCz = cz;
  }
  return { minCx, maxCx, minCz, maxCz };
}

interface Ctx {
  plan: PlanState;
  cols: number;
  rows: number;
  cellM: number;
  offsetX: number;
  offsetZ: number;
  occupied: Set<string>;
}

/**
 * A cell props may rest on: in bounds, never planted, never pond/bed/structure.
 * Paths and bare (unpainted) ground are fine.
 */
function isFreeSpot(ctx: Ctx, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= ctx.cols || cz >= ctx.rows) return false;
  const key = `${cx},${cz}`;
  if (ctx.plan.planting[key] !== undefined) return false;
  if (ctx.occupied.has(key)) return false;
  const slug = ctx.plan.ground[key];
  if (slug === undefined) return true;
  return WALKABLE_SLUGS.has(slug);
}

function claim(ctx: Ctx, wx: number, wz: number): void {
  const cx = Math.floor((wx - ctx.offsetX) / ctx.cellM);
  const cz = Math.floor((wz - ctx.offsetZ) / ctx.cellM);
  ctx.occupied.add(`${cx},${cz}`);
}

/** Cell-centre world coordinates (matches animals.ts / structures.ts math). */
function cellCenter(ctx: Ctx, cx: number, cz: number): [number, number] {
  return [cx * ctx.cellM + ctx.cellM / 2 + ctx.offsetX, cz * ctx.cellM + ctx.cellM / 2 + ctx.offsetZ];
}

// ---------------------------------------------------------------------------
// Build / update / dispose
// ---------------------------------------------------------------------------

interface PropTemplate {
  obj: THREE.Object3D;
}

/**
 * Build (once per DressingSystem), rescale and re-centre a template so its
 * origin sits at bottom-centre — clones then place cleanly on the ground and
 * lean around their base without sinking.
 */
function getPropTemplate(kind: PropKind, templates: Map<PropKind, PropTemplate>): PropTemplate {
  const cached = templates.get(kind);
  if (cached) return cached;

  const obj = PROP_BUILDERS[kind]();
  obj.updateMatrixWorld(true);
  // Normalize to the real-world target using the LARGEST bbox dimension.
  const pre = new THREE.Box3().setFromObject(obj);
  const preSize = new THREE.Vector3();
  pre.getSize(preSize);
  const maxDim = Math.max(preSize.x, preSize.y, preSize.z) || 1;
  obj.scale.setScalar(PROP_SIZE_M[kind] / maxDim);
  obj.updateMatrixWorld(true);
  // Re-centre so origin = bottom centre (stable pivot for leaning).
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box.min.y, -center.z);

  const tpl: PropTemplate = { obj };
  templates.set(kind, tpl);
  return tpl;
}

export function buildDressing(plan: PlanState, scene: THREE.Scene): DressingSystem {
  const system: DressingSystem = { props: [] };
  const templates = new Map<PropKind, PropTemplate>();
  const ctx: Ctx = {
    plan,
    cols: Math.max(1, Math.round(plan.widthM / plan.cellM)),
    rows: Math.max(1, Math.round(plan.heightM / plan.cellM)),
    cellM: plan.cellM,
    offsetX: -(plan.widthM / 2),
    offsetZ: -(plan.heightM / 2),
    occupied: new Set<string>(),
  };

  /**
   * Clone-place one prop. `yaw` turns the model (its "front" is local +z);
   * leaning kinds tilt top-first toward local −z by ~15° (against a wall /
   * into a bed). Returns false when the cap or spot checks reject the pick.
   */
  const place = (kind: PropKind, wx: number, wz: number, yaw: number): boolean => {
    if (system.props.length >= MAX_PROPS) return false;
    const cx = Math.floor((wx - ctx.offsetX) / ctx.cellM);
    const cz = Math.floor((wz - ctx.offsetZ) / ctx.cellM);
    if (!isFreeSpot(ctx, cx, cz)) return false;
    const inst = getPropTemplate(kind, templates).obj.clone();
    inst.rotation.order = 'YXZ'; // yaw outermost, lean in the prop's own frame
    inst.rotation.set(LEANING_KINDS.has(kind) ? -LEAN_RAD : 0, yaw, 0);
    inst.position.set(wx, 0, wz);
    scene.add(inst);
    // Lift any post-lean dip below grade (cheap: ≤12 props per build).
    inst.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst);
    if (box.min.y < -0.002) inst.position.y -= box.min.y;
    ctx.occupied.add(`${cx},${cz}`);
    system.props.push(inst);
    return true;
  };

  // Cardinal sides: outward normal + yaw that faces a model's front (+z local)
  // AWAY from the anchor, plus the wall-tangent axis for sliding along it.
  type Side = 'N' | 'E' | 'S' | 'W';
  const SIDES: ReadonlyArray<Side> = ['N', 'E', 'S', 'W'];
  const sideYaw: Record<Side, number> = { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 };
  const sideNormal: Record<Side, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

  /** Outward world-space point just past a region-box edge, at its midpoint. */
  const edgeMidpoint = (box: RegionBox, side: Side, outM: number): [number, number] => {
    let wx: number, wz: number;
    if (side === 'N') { wx = ((box.minCx + box.maxCx + 1) / 2) * ctx.cellM + ctx.offsetX; wz = box.minCz * ctx.cellM + ctx.offsetZ - outM; }
    else if (side === 'S') { wx = ((box.minCx + box.maxCx + 1) / 2) * ctx.cellM + ctx.offsetX; wz = (box.maxCz + 1) * ctx.cellM + ctx.offsetZ + outM; }
    else if (side === 'W') { wx = box.minCx * ctx.cellM + ctx.offsetX - outM; wz = ((box.minCz + box.maxCz + 1) / 2) * ctx.cellM + ctx.offsetZ; }
    else { wx = (box.maxCx + 1) * ctx.cellM + ctx.offsetX + outM; wz = ((box.minCz + box.maxCz + 1) / 2) * ctx.cellM + ctx.offsetZ; }
    return [wx, wz];
  };

  /** True when at least one cell just beyond the box edge is a free spot. */
  const sideHasSpace = (box: RegionBox, side: Side): boolean => {
    if (side === 'N' || side === 'S') {
      const cz = side === 'N' ? box.minCz - 1 : box.maxCz + 1;
      for (let cx = box.minCx; cx <= box.maxCx; cx++) if (isFreeSpot(ctx, cx, cz)) return true;
      return false;
    }
    const cx = side === 'W' ? box.minCx - 1 : box.maxCx + 1;
    for (let cz = box.minCz; cz <= box.maxCz; cz++) if (isFreeSpot(ctx, cx, cz)) return true;
    return false;
  };

  /** First side (fixed N,E,S,W priority, hash-rotatable) with space beyond it. */
  const pickSide = (box: RegionBox, hx: number, hz: number): Side | null => {
    const start = hashCell(hx, hz) % 4;
    for (let i = 0; i < 4; i++) {
      const side = SIDES[(start + i) % 4];
      if (sideHasSpace(box, side)) return side;
    }
    return null;
  };

  // --- Sheds: wheelbarrow parked at the door, pitchfork against the wall ----
  for (const region of regionsOf(plan, (s) => s === 'shed')) {
    if (system.props.length >= MAX_PROPS) break;
    const box = regionBox(region);
    // Door = first side (N,E,S,W priority — barn aisles usually face a path)
    // whose strip beyond the footprint offers standing room.
    let door: Side | null = null;
    for (const side of SIDES) {
      if (sideHasSpace(box, side)) { door = side; break; }
    }
    if (!door) continue;

    const [nx, nz] = sideNormal[door];
    const [bx, bz] = edgeMidpoint(box, door, 0.55);
    if (place('wheelbarrow', bx, bz, sideYaw[door])) claim(ctx, bx + nx * 0.3, bz + nz * 0.3);

    // Pitchfork: slid 0.9 m along the wall tangent, hugged close to the wall.
    const tangent: [number, number] = nx === 0 ? [1, 0] : [0, 1];
    const fx = bx + tangent[0] * 0.9 + nx * 0.28;
    const fz = bz + tangent[1] * 0.9 + nz * 0.28;
    place('pitchfork', fx, fz, sideYaw[door]);
  }

  // --- Water anchors: tap cells first, then rain-barrel regions -------------
  const tapKeys = Object.entries(plan.ground)
    .filter(([, s]) => s === 'water-tap')
    .map(([k]) => k)
    .sort();
  const waterAnchors: Array<[number, number]> = tapKeys.map((k) => {
    const [cx, cz] = parseKey(k);
    return cellCenter(ctx, cx, cz);
  });
  for (const region of regionsOf(plan, (s) => s === 'rain-barrel')) {
    const box = regionBox(region);
    waterAnchors.push(edgeMidpoint(box, 'S', 0.4));
  }
  // First anchor hosts can + bucket side by side; later ones alternate.
  waterAnchors.forEach(([ax, az], i) => {
    if (system.props.length >= MAX_PROPS) return;
    const jx = (hashCell(Math.round(ax * 100), Math.round(az * 100)) % 3 - 1) * 0.18;
    if (i === 0) {
      place('watering-can', ax + 0.34 + jx, az + 0.14, hashCell(i, 7) % 4 * (Math.PI / 2));
      place('bucket', ax - 0.32 + jx, az + 0.22, hashCell(i, 11) % 4 * (Math.PI / 2));
    } else if (i % 2 === 1) {
      place('watering-can', ax + 0.34 + jx, az + 0.14, hashCell(i, 7) % 4 * (Math.PI / 2));
    } else {
      place('bucket', ax - 0.32 + jx, az + 0.22, hashCell(i, 11) % 4 * (Math.PI / 2));
    }
  });

  // --- Bed edges: seed bag / hoe alternately, resting against the border ----
  let bedIndex = 0;
  for (const region of regionsOf(plan, (s) => BED_SLUGS.has(s))) {
    if (system.props.length >= MAX_PROPS) break;
    const box = regionBox(region);
    const side = pickSide(box, box.minCx, box.minCz);
    if (!side) continue;
    const kind: PropKind = bedIndex % 2 === 0 ? 'seed-bag' : 'hoe';
    const [ex, ez] = edgeMidpoint(box, side, 0.3);
    const yaw = sideYaw[side]; // front away from the bed; lean tips INTO it
    if (place(kind, ex, ez, yaw)) bedIndex++;
  }

  return system;
}

/**
 * API symmetry with updateAnimals/updateStructures — dressing is static
 * (tools carry no tick rig), so there is nothing to advance per frame.
 * Rebuilds happen through dispose + build in World3D's plan-change effect.
 */
export function updateDressing(_system: DressingSystem): void {
  /* intentionally empty */
}

export function disposeDressing(system: DressingSystem): void {
  // Clones share this system's template geometry/materials; releasing them
  // here frees every GPU resource the system owns (fresh builds re-make them).
  for (const prop of system.props) {
    prop.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    prop.removeFromParent();
  }
  system.props.length = 0;
}
