import * as THREE from 'three';

export interface GrowthFX {
  celebrate: (positions: THREE.Vector3[]) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const PARTICLE_COUNT = 30;
const PARTICLE_LIFETIME = 1.5;

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

export function createGrowthFX(scene: THREE.Scene): GrowthFX {
  const particles: Particle[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  const geometry = new THREE.OctahedronGeometry(0.04, 0);

  const colors = [
    new THREE.Color('#FFD700'), // gold
    new THREE.Color('#FF6347'), // tomato
    new THREE.Color('#32CD32'), // lime green
    new THREE.Color('#FF69B4'), // hot pink
    new THREE.Color('#87CEEB'), // sky blue
  ];

  function celebrate(positions: THREE.Vector3[]) {
    for (const pos of positions) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const colorIdx = i % colors.length;
        const material = new THREE.MeshBasicMaterial({
          color: colors[colorIdx],
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        mesh.position.y += 0.1 + Math.random() * 0.3;
        scene.add(mesh);

        particles.push({
          position: pos.clone(),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            1.0 + Math.random() * 2.0,
            (Math.random() - 0.5) * 1.5,
          ),
          life: PARTICLE_LIFETIME,
          maxLife: PARTICLE_LIFETIME,
          color: colors[colorIdx],
        });
        materials.push(material);
        meshes.push(mesh);
      }
    }
  }

  function update(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        meshes[i].removeFromParent();
        meshes[i].geometry !== geometry && meshes[i].geometry.dispose();
        materials[i].dispose();
        meshes.splice(i, 1);
        materials.splice(i, 1);
        particles.splice(i, 1);
        continue;
      }

      p.velocity.y -= dt * 2; // gravity
      meshes[i].position.x += p.velocity.x * dt;
      meshes[i].position.y += p.velocity.y * dt;
      meshes[i].position.z += p.velocity.z * dt;

      const t = p.life / p.maxLife;
      meshes[i].scale.setScalar(t);
      materials[i].opacity = t;
      meshes[i].rotation.x += dt * 3;
      meshes[i].rotation.y += dt * 2;
    }
  }

  function dispose() {
    for (let i = particles.length - 1; i >= 0; i--) {
      meshes[i].removeFromParent();
      materials[i].dispose();
    }
    meshes.length = 0;
    materials.length = 0;
    particles.length = 0;
  }

  return { celebrate, update, dispose };
}
