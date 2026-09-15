/**
 * World animals — ambient creature life built from the Lane D creative voxel
 * creatures (src/creative/creatures/animals.ts).
 *
 * Spawn rules (kept modest, ≤ ~16 active creatures):
 *  - chicken-coop cell → 3 hens + 1 rooster wandering around the coop
 *  - beehive cell      → 3 bees orbiting the hive
 *  - pond region       → 2 ducks paddling near the water
 *  - planted cells     → up to 4 butterflies drifting over the crops
 *  - barn cell         → grazing livestock: cow + pig + sheep
 *
 * Each creature is a FRESH builder instance (the creative kit stores live
 * Object3D refs in userData.rig, so clones are not safe) with its part-rig
 * driven by the kit's tick(obj, t) every frame; this module owns placement
 * and locomotion (wander / orbit).
 *
 * Creative assets assume 1 voxel = 10 cm; every creature is normalized via
 * bounding-box measurement to a real-world target size. Spawn positions are
 * deterministic (seeded RNG) so rebuilds are stable.
 */
import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';
import { rng } from '@/creative/voxel';
import {
  buildHen, tickHen,
  buildRooster, tickRooster,
  buildCow, tickCow,
  buildPig, tickPig,
  buildSheep, tickSheep,
  buildDuck, tickDuck,
  buildBee, tickBee,
  buildButterfly, tickButterfly,
} from '@/creative/creatures/animals';

export interface AnimalSystem {
  creatures: Creature[];
  /** Running animation clock in seconds. */
  t: number;
}

type CreatureKind = 'hen' | 'rooster' | 'cow' | 'pig' | 'sheep' | 'duck' | 'bee' | 'butterfly';

export interface Creature {
  kind: CreatureKind;
  obj: THREE.Object3D;
  tick: (obj: THREE.Object3D, t: number) => void;
  anchor: THREE.Vector3;
  // Wander state (ground creatures)
  wanderTarget: THREE.Vector3;
  wanderTimer: number;
  // Orbit state (bees/butterflies)
  phase: number;
  speed: number;
  radius: number;
}

const KIND_BUILDERS: Record<CreatureKind, () => THREE.Group> = {
  hen: buildHen,
  rooster: buildRooster,
  cow: buildCow,
  pig: buildPig,
  sheep: buildSheep,
  duck: buildDuck,
  bee: buildBee,
  butterfly: buildButterfly,
};

const KIND_TICKS: Record<CreatureKind, (obj: THREE.Object3D, t: number) => void> = {
  hen: tickHen,
  rooster: tickRooster,
  cow: tickCow,
  pig: tickPig,
  sheep: tickSheep,
  duck: tickDuck,
  bee: tickBee,
  butterfly: tickButterfly,
};

/**
 * Real-world target heights (metres), applied by measuring each freshly
 * built creature's bounding box and uniformly rescaling it.
 */
const KIND_HEIGHT_M: Record<CreatureKind, number> = {
  hen: 0.4,
  rooster: 0.55,
  cow: 1.4,
  pig: 0.8,
  sheep: 0.9,
  duck: 0.35,
  bee: 0.07,
  butterfly: 0.12,
};

const MAX_CREATURES = 16;

/** Uniformly rescale `obj` so its bounding-box height equals `targetM`. */
function normalizeHeight(obj: THREE.Object3D, targetM: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const height = Math.max(box.max.y - box.min.y, 1e-6);
  obj.scale.multiplyScalar(targetM / height);
  obj.updateMatrixWorld(true);
}

function makeCreature(kind: CreatureKind): Creature {
  const obj = KIND_BUILDERS[kind]();
  normalizeHeight(obj, KIND_HEIGHT_M[kind]);
  return {
    kind,
    obj,
    tick: KIND_TICKS[kind],
    anchor: new THREE.Vector3(),
    wanderTarget: new THREE.Vector3(),
    wanderTimer: 0,
    phase: 0,
    speed: 0,
    radius: 0,
  };
}

function spawn(
  system: AnimalSystem,
  kind: CreatureKind,
  x: number,
  y: number,
  z: number,
  scene: THREE.Scene,
  rand: () => number,
): void {
  if (system.creatures.length >= MAX_CREATURES) return;
  const c = makeCreature(kind);
  c.obj.position.set(x, y, z);
  c.anchor.set(x, y, z);
  c.wanderTarget.set(x, y, z);
  c.wanderTimer = 1 + rand() * 2;
  c.phase = rand() * Math.PI * 2;
  c.speed = 0.5 + rand();
  c.radius = 0.2 + rand() * 0.4;
  scene.add(c.obj);
  system.creatures.push(c);
}

// ---------------------------------------------------------------------------
// Build / update / dispose
// ---------------------------------------------------------------------------

export function buildAnimals(plan: PlanState, scene: THREE.Scene): AnimalSystem {
  const system: AnimalSystem = { creatures: [], t: 0 };
  const rand = rng(20260824); // deterministic spawns
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const jitter = (amount: number): number => (rand() - 0.5) * amount;
  const cellCenter = (key: string): [number, number] => {
    const [cx, cz] = parseKey(key);
    return [cx * plan.cellM + plan.cellM / 2 + offsetX, cz * plan.cellM + plan.cellM / 2 + offsetZ];
  };

  // Chickens around coops.
  for (const [key, slug] of Object.entries(plan.ground)) {
    if (slug !== 'chicken-coop') continue;
    const [wx, wz] = cellCenter(key);
    spawn(system, 'rooster', wx + 0.15, 0, wz - 0.1, scene, rand);
    for (let i = 0; i < 3; i++) {
      spawn(system, 'hen', wx + jitter(0.5), 0, wz + jitter(0.5), scene, rand);
    }
  }

  // Bees orbiting hives.
  for (const [key, slug] of Object.entries(plan.ground)) {
    if (slug !== 'beehive') continue;
    const [wx, wz] = cellCenter(key);
    for (let i = 0; i < 3; i++) {
      spawn(system, 'bee', wx + jitter(0.4), 0.25 + rand() * 0.25, wz + jitter(0.4), scene, rand);
    }
  }

  // Ducks at pond edges (ponds are contiguous regions; one pair on the
  // middle cell of the first region keeps placement deterministic).
  const pondKeys = Object.entries(plan.ground)
    .filter(([, slug]) => slug === 'pond')
    .map(([k]) => k)
    .sort(); // stable order regardless of key insertion order
  if (pondKeys.length > 0) {
    const [px, pz] = cellCenter(pondKeys[Math.floor(pondKeys.length / 2)]);
    spawn(system, 'duck', px + 0.1, 0.02, pz, scene, rand);
    spawn(system, 'duck', px - 0.12, 0.02, pz + 0.08, scene, rand);
  }

  // Livestock around barns.
  let barnSeen = false;
  for (const [key, slug] of Object.entries(plan.ground)) {
    if (slug !== 'barn' || barnSeen) continue;
    barnSeen = true;
    const [wx, wz] = cellCenter(key);
    spawn(system, 'cow', wx + jitter(0.6), 0, wz + 0.3, scene, rand);
    spawn(system, 'pig', wx - 0.3, 0, wz - 0.2, scene, rand);
    spawn(system, 'sheep', wx + 0.2, 0, wz - 0.4, scene, rand);
  }

  // Butterflies over planted cells.
  const plantKeys = Object.keys(plan.planting);
  if (plantKeys.length > 0) {
    const count = Math.min(4, plantKeys.length);
    for (let i = 0; i < count; i++) {
      const [bx, bz] = cellCenter(plantKeys[(i * 7) % plantKeys.length]);
      spawn(system, 'butterfly', bx, 0.35 + rand() * 0.3, bz, scene, rand);
    }
  }

  return system;
}

export function updateAnimals(system: AnimalSystem, dt: number): void {
  system.t += dt;
  const t = system.t;

  for (const c of system.creatures) {
    // Per-part idle animation from the creative kit (head/tail/wings/legs…).
    c.tick(c.obj, t);

    if (c.kind === 'bee') {
      // Orbit the hive like a swarm member.
      c.phase += dt * (1.5 + c.speed);
      const r = c.radius + Math.sin(c.phase * 0.7) * 0.1;
      c.obj.position.x = c.anchor.x + Math.cos(c.phase) * r;
      c.obj.position.z = c.anchor.z + Math.sin(c.phase * 1.3) * r;
      c.obj.position.y = c.anchor.y + Math.sin(c.phase * 2.1) * 0.08;
      c.obj.rotation.y += dt * 2;
      continue;
    }

    if (c.kind === 'butterfly') {
      // Drift in lazy loops over the crops.
      c.phase += dt * c.speed;
      c.obj.position.x = c.anchor.x + Math.cos(c.phase) * c.radius;
      c.obj.position.z = c.anchor.z + Math.sin(c.phase * 0.7) * c.radius;
      c.obj.position.y = c.anchor.y + Math.sin(c.phase * 1.5) * 0.12;
      c.obj.rotation.y += dt * 0.5;
      continue;
    }

    // Ground creatures: bounded wander around their anchor cell, facing travel.
    c.wanderTimer -= dt;
    if (c.wanderTimer <= 0) {
      c.wanderTarget.set(
        c.anchor.x + (Math.random() - 0.5) * 0.8,
        c.obj.position.y,
        c.anchor.z + (Math.random() - 0.5) * 0.8,
      );
      c.wanderTimer = 2 + Math.random() * 3;
      const dx = c.wanderTarget.x - c.obj.position.x;
      const dz = c.wanderTarget.z - c.obj.position.z;
      if (dx * dx + dz * dz > 1e-6) c.obj.rotation.y = Math.atan2(dx, dz);
    }
    const dx = c.wanderTarget.x - c.obj.position.x;
    const dz = c.wanderTarget.z - c.obj.position.z;
    c.obj.position.x += dx * dt * 0.5;
    c.obj.position.z += dz * dt * 0.5;
  }
}

/**
 * Pollinator flock presence fractions (0..1 each). Run mode wires
 * SimState.creatures ÷ flowering capacity through here; full/legacy presence
 * is `{ bees01: 1, butterflies01: 1 }` (what buildAnimals spawns by default).
 */
export interface FaunaPresence {
  bees01: number;
  butterflies01: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Modulate pollinator flock presence WITHOUT rebuilding anything: of each
 * flock's spawned members (stable spawn order), the first
 * round(fraction × count) stay visible and the rest are hidden via
 * `obj.visible` — the renderer skips hidden objects, so hiding REDUCES the
 * draw count. Zero allocations, no geometry/material changes; safe to call
 * per sim-day (day-keyed — never per frame). A 1-member flock degrades to
 * on/off (any fraction ≥ 0.5 shows it). Hidden creatures keep ticking (≤16
 * total) so re-showing them is seamless. Other species are untouched.
 */
export function setFaunaPresence(system: AnimalSystem, presence: FaunaPresence): void {
  let beeTotal = 0;
  let butterflyTotal = 0;
  for (const c of system.creatures) {
    if (c.kind === 'bee') beeTotal++;
    else if (c.kind === 'butterfly') butterflyTotal++;
  }
  const beesVisible = Math.round(clamp01(presence.bees01) * beeTotal);
  const butterfliesVisible = Math.round(clamp01(presence.butterflies01) * butterflyTotal);
  let beeIdx = 0;
  let butterflyIdx = 0;
  for (const c of system.creatures) {
    if (c.kind === 'bee') {
      c.obj.visible = beeIdx < beesVisible;
      beeIdx++;
    } else if (c.kind === 'butterfly') {
      c.obj.visible = butterflyIdx < butterfliesVisible;
      butterflyIdx++;
    }
  }
}

export function disposeAnimals(system: AnimalSystem): void {
  // Each creature owns its geometry/materials (fresh builder instances),
  // so release GPU resources while detaching from the scene.
  for (const c of system.creatures) {
    c.obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    c.obj.removeFromParent();
  }
  system.creatures.length = 0;
}
