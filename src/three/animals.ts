import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';

export interface AnimalSystem {
  bees: BeeSwarm[];
  chickens: Chicken[];
  butterflies: Butterfly[];
  update: (dt: number) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// Bees — small yellow/black spheres that swarm around beehive assets
// ---------------------------------------------------------------------------
interface BeeSwarm {
  center: THREE.Vector3;
  bees: THREE.Mesh[];
}

function createBee(): THREE.Mesh {
  const group = new THREE.Group();

  // Body — yellow sphere
  const bodyGeo = new THREE.SphereGeometry(0.08, 4, 4);
  const bodyMat = new THREE.MeshBasicMaterial({ color: '#FFD700' });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Stripes — flat black discs
  for (let i = 0; i < 3; i++) {
    const stripeGeo = new THREE.TorusGeometry(0.05, 0.015, 4, 8);
    const stripeMat = new THREE.MeshBasicMaterial({ color: '#111111' });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = -0.03 + i * 0.03;
    group.add(stripe);
  }

  // Tiny wings
  for (const side of [-1, 1]) {
    const wingGeo = new THREE.PlaneGeometry(0.06, 0.04);
    const wingMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.05, 0.04, 0);
    group.add(wing);
  }

  // Wrap in a mesh directly (simpler for batch animation)
  const proxyGeo = new THREE.SphereGeometry(0.001, 2, 2);
  const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial({ visible: false }));
  proxy.add(group);
  return proxy;
}

// ---------------------------------------------------------------------------
// Chickens — tiny birds around chicken-coop assets
// ---------------------------------------------------------------------------
interface Chicken {
  mesh: THREE.Mesh;
  home: THREE.Vector3;
  wanderTarget: THREE.Vector3;
  wanderTimer: number;
  peckTimer: number;
}

function createChicken(): THREE.Mesh {
  const group = new THREE.Group();

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.1, 4, 4);
  bodyGeo.scale(1, 0.7, 1.2);
  const bodyMat = new THREE.MeshBasicMaterial({ color: '#F5DEB3' });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.15;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.06, 4, 4);
  const headMat = new THREE.MeshBasicMaterial({ color: '#FFDAB9' });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.22, 0.1);
  group.add(head);

  // Comb
  const combGeo = new THREE.ConeGeometry(0.03, 0.04, 3);
  const combMat = new THREE.MeshBasicMaterial({ color: '#FF4444' });
  const comb = new THREE.Mesh(combGeo, combMat);
  comb.position.set(0, 0.26, 0.1);
  group.add(comb);

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.015, 0.04, 3);
  beakGeo.rotateX(-Math.PI / 2);
  const beakMat = new THREE.MeshBasicMaterial({ color: '#FF8C00' });
  const beak = new THREE.Mesh(beakGeo, beakMat);
  beak.position.set(0, 0.22, 0.16);
  group.add(beak);

  const proxyGeo = new THREE.SphereGeometry(0.001, 2, 2);
  const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial({ visible: false }));
  proxy.add(group);
  return proxy;
}

// ---------------------------------------------------------------------------
// Butterflies — colorful sprites near flower crops
// ---------------------------------------------------------------------------
interface Butterfly {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  phase: number;
  speed: number;
  radius: number;
}

function createButterfly(color: string): THREE.Mesh {
  const group = new THREE.Group();

  const wingGeo = new THREE.PlaneGeometry(0.08, 0.05);
  const wingMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(side * 0.04, 0, 0);
    group.add(wing);
  }

  const proxyGeo = new THREE.SphereGeometry(0.001, 2, 2);
  const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial({ visible: false }));
  proxy.add(group);
  return proxy;
}

// ---------------------------------------------------------------------------
// Build all animal systems based on the plan
// ---------------------------------------------------------------------------
export function buildAnimals(plan: PlanState, scene: THREE.Scene): AnimalSystem {
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const bees: BeeSwarm[] = [];
  const chickens: Chicken[] = [];
  const butterflies: Butterfly[] = [];

  for (const [key, slug] of Object.entries(plan.ground)) {
    const [cellX, cellY] = parseKey(key);
    const wx = cellX * plan.cellM + plan.cellM / 2 + offsetX;
    const wz = cellY * plan.cellM + plan.cellM / 2 + offsetZ;
    const center = new THREE.Vector3(wx, 0.4, wz);

    if (slug === 'beehive') {
      const beeCount = 8;
      const swarm: THREE.Mesh[] = [];
      for (let i = 0; i < beeCount; i++) {
        const bee = createBee();
        bee.position.set(
          wx + (Math.random() - 0.5) * 2,
          0.3 + Math.random() * 1.5,
          wz + (Math.random() - 0.5) * 2,
        );
        scene.add(bee);
        swarm.push(bee);
      }
      bees.push({ center: center.clone(), bees: swarm });
    }

    if (slug === 'chicken-coop') {
      const chickenCount = 4;
      for (let i = 0; i < chickenCount; i++) {
        const chicken = createChicken();
        const startX = wx + (Math.random() - 0.5) * 1.5;
        const startZ = wz + (Math.random() - 0.5) * 2;
        chicken.position.set(startX, 0, startZ);
        scene.add(chicken);
        chickens.push({
          mesh: chicken,
          home: center.clone(),
          wanderTarget: new THREE.Vector3(startX, 0, startZ),
          wanderTimer: 1 + Math.random() * 3,
          peckTimer: 0,
        });
      }
    }
  }

  // Butterflies near planted areas
  if (Object.keys(plan.planting).length > 0) {
    const plantKeys = Object.keys(plan.planting);
    const butterflyCount = Math.min(15, plantKeys.length);
    const colors = ['#FF69B4', '#FFD700', '#FF6347', '#7B68EE', '#00CED1'];

    for (let i = 0; i < butterflyCount; i++) {
      const key = plantKeys[Math.floor(Math.random() * plantKeys.length)];
      const [cellX, cellY] = parseKey(key);
      const bx = cellX * plan.cellM + plan.cellM / 2 + offsetX;
      const bz = cellY * plan.cellM + plan.cellM / 2 + offsetZ;

      const butterfly = createButterfly(colors[i % colors.length]);
      butterfly.position.set(bx, 0.3 + Math.random() * 1, bz);
      scene.add(butterfly);
      butterflies.push({
        mesh: butterfly,
        center: new THREE.Vector3(bx, 0.5, bz),
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
        radius: 0.3 + Math.random() * 1.2,
      });
    }
  }

  return { bees, chickens, butterflies, update: () => {}, dispose: () => {} };
}

// Animate all animals.
export function updateAnimals(system: AnimalSystem, dt: number): void {
  const t = performance.now() * 0.001;

  // Bees
  for (const swarm of system.bees) {
    for (let i = 0; i < swarm.bees.length; i++) {
      const bee = swarm.bees[i];
      const phase = t * 2 + i * 0.5;
      const r = 0.5 + Math.sin(phase * 0.7) * 0.3;
      const angle = phase + i * (Math.PI * 2 / swarm.bees.length);

      bee.position.x = swarm.center.x + Math.cos(angle) * r;
      bee.position.z = swarm.center.z + Math.sin(angle) * r;
      bee.position.y = swarm.center.y + 0.5 + Math.sin(phase * 1.3) * 0.4;
      bee.rotation.y += dt * 2;
      bee.rotation.z = Math.sin(phase) * 0.2;
    }
  }

  // Chickens — wander + peck
  for (const chicken of system.chickens) {
    const m = chicken.mesh;
    chicken.wanderTimer -= dt;
    chicken.peckTimer -= dt;

    if (chicken.wanderTimer <= 0) {
      chicken.wanderTarget.set(
        chicken.home.x + (Math.random() - 0.5) * 2,
        0,
        chicken.home.z + (Math.random() - 0.5) * 2,
      );
      chicken.wanderTimer = 2 + Math.random() * 3;
      // Face the direction of movement
      const dx = chicken.wanderTarget.x - m.position.x;
      const dz = chicken.wanderTarget.z - m.position.z;
      m.rotation.y = Math.atan2(dx, dz);
    }

    // Move toward target
    const dx = chicken.wanderTarget.x - m.position.x;
    const dz = chicken.wanderTarget.z - m.position.z;
    m.position.x += dx * dt * 0.5;
    m.position.z += dz * dt * 0.5;

    // Peck animation
    if (chicken.peckTimer <= 0 && Math.random() < dt * 0.5) {
      chicken.peckTimer = 0.4;
    }
    if (chicken.peckTimer > 0) {
      // Bob head
      const peckPhase = 1 - chicken.peckTimer / 0.4;
      const bob = Math.sin(peckPhase * Math.PI) * 0.06;
      m.children[0]?.position.setY(bob); // move whole group slightly
    }
  }

  // Butterflies
  for (const bf of system.butterflies) {
    bf.phase += dt * bf.speed;
    bf.mesh.position.x = bf.center.x + Math.cos(bf.phase) * bf.radius;
    bf.mesh.position.z = bf.center.z + Math.sin(bf.phase * 0.7) * bf.radius;
    bf.mesh.position.y = bf.center.y + Math.sin(bf.phase * 1.5) * 0.5 + 0.3;
    bf.mesh.rotation.y += dt * 0.5;
    // Wing flap: scale group slightly
    bf.mesh.children[0]?.scale.setScalar(1 + Math.sin(bf.phase * 10) * 0.1);
  }
}

export function disposeAnimals(system: AnimalSystem): void {
  for (const swarm of system.bees) {
    for (const bee of swarm.bees) {
      bee.removeFromParent();
    }
  }
  for (const chicken of system.chickens) {
    chicken.mesh.removeFromParent();
  }
  for (const bf of system.butterflies) {
    bf.mesh.removeFromParent();
  }
}
