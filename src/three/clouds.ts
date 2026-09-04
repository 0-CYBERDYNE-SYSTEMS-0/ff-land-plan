import * as THREE from 'three';

export interface CloudLayer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  speed: number;
  altitude: number;
  initialOffset: number;
}

export interface Clouds {
  layers: CloudLayer[];
  update: (dt: number, windSpeed: number, cloudCover: number) => void;
  dispose: () => void;
}

const CLOUD_RADIUS = 80;

function generateCloudTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  // Paint soft fluffy clouds using layered circles
  const cloudCount = 12;
  for (let i = 0; i < cloudCount; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = size * (0.08 + Math.random() * 0.15);

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.0)');

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Small companion puff nearby
    const cx2 = cx + (Math.random() - 0.5) * r * 2;
    const cy2 = cy + (Math.random() - 0.5) * r * 2;
    const r2 = r * (0.5 + Math.random() * 0.3);
    const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
    g2.addColorStop(0, 'rgba(255,255,255,0.6)');
    g2.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g2.addColorStop(1, 'rgba(255,255,255,0.0)');

    ctx.beginPath();
    ctx.arc(cx2, cy2, r2, 0, Math.PI * 2);
    ctx.fillStyle = g2;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  texture.needsUpdate = true;
  return texture;
}

export function createClouds(scene: THREE.Scene): Clouds {
  const layers: CloudLayer[] = [];

  // High cirrus layer
  const cirrusTex = generateCloudTexture(512);
  const cirrusMat = new THREE.MeshBasicMaterial({
    map: cirrusTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.3,
  });
  const cirrusGeo = new THREE.PlaneGeometry(CLOUD_RADIUS * 2, CLOUD_RADIUS * 2);
  const cirrusMesh = new THREE.Mesh(cirrusGeo, cirrusMat);
  cirrusMesh.rotation.x = Math.PI / 2;
  cirrusMesh.position.y = 35;
  cirrusMesh.name = 'Clouds-Cirrus';
  cirrusMesh.renderOrder = 1;
  scene.add(cirrusMesh);
  layers.push({ mesh: cirrusMesh, material: cirrusMat, speed: 0.3, altitude: 35, initialOffset: Math.random() * 100 });

  // Low cumulus layer
  const cumulusTex = generateCloudTexture(512);
  const cumulusMat = new THREE.MeshBasicMaterial({
    map: cumulusTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    opacity: 0.45,
  });
  const cumulusGeo = new THREE.PlaneGeometry(CLOUD_RADIUS * 2, CLOUD_RADIUS * 2);
  const cumulusMesh = new THREE.Mesh(cumulusGeo, cumulusMat);
  cumulusMesh.rotation.x = Math.PI / 2;
  cumulusMesh.position.y = 18;
  cumulusMesh.name = 'Clouds-Cumulus';
  cumulusMesh.renderOrder = 2;
  scene.add(cumulusMesh);
  layers.push({ mesh: cumulusMesh, material: cumulusMat, speed: 0.6, altitude: 18, initialOffset: Math.random() * 100 });

  function update(dt: number, windSpeed: number, cloudCover: number) {
    const coverFactor = cloudCover / 100; // 0-1

    for (const layer of layers) {
      // Drift clouds with wind
      layer.material.map!.offset.x += dt * layer.speed * (1 + windSpeed * 0.1) * 0.02;
      layer.material.map!.offset.x %= 1;

      // Opacity scales with cloud cover
      layer.material.opacity = layer.material === layers[0].material
        ? 0.1 + coverFactor * 0.3 // cirrus: subtle
        : 0.15 + coverFactor * 0.4; // cumulus: more visible
    }
  }

  function dispose() {
    for (const layer of layers) {
      layer.mesh.removeFromParent();
      layer.mesh.geometry.dispose();
      layer.material.map?.dispose();
      layer.material.dispose();
    }
  }

  return { layers, update, dispose };
}
