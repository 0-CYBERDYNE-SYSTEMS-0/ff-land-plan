import * as THREE from 'three';

export interface WeatherFX {
  rainGroup: THREE.Group;
  snowGroup: THREE.Group;
  update: (dt: number, weather: WeatherData) => void;
  dispose: () => void;
}

export interface WeatherData {
  precipMm: number;
  cloudCover: number;
  tempC: number;
  humidity: number;
  windSpeedKmh: number;
  weatherCode: number;
}

const RAIN_COUNT = 500;
const SNOW_COUNT = 300;
const RAIN_AREA = 40; // spread in meters
const RAIN_HEIGHT = 20;

function createRainMaterial(): THREE.PointsMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 16);
  gradient.addColorStop(0, 'rgba(180,200,255,0.1)');
  gradient.addColorStop(0.4, 'rgba(180,200,255,0.6)');
  gradient.addColorStop(1, 'rgba(180,200,255,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 16);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xaaccff,
    size: 0.3,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  });
  return material;
}

function createSnowMaterial(): THREE.PointsMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 8);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xffffff,
    size: 0.4,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    opacity: 0,
  });
  return material;
}

export function createWeatherFX(scene: THREE.Scene): WeatherFX {
  const rainGroup = new THREE.Group();
  rainGroup.name = 'RainFX';
  scene.add(rainGroup);

  // Rain particles
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(RAIN_COUNT * 3);
  const rainVelocities: number[] = [];
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
    rainPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    rainVelocities.push(0.5 + Math.random() * 0.3);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = createRainMaterial();
  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainGroup.add(rainPoints);

  // Rain splash rings (stored on the rainGroup for disposal)
  const splashGeo = new THREE.TorusGeometry(0.05, 0.01, 4, 8);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xaaccff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const splashMeshes: THREE.Mesh[] = [];
  const splashTimers: number[] = [];

  for (let i = 0; i < 30; i++) {
    const mesh = new THREE.Mesh(splashGeo, splashMat);
    mesh.visible = false;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -999, 0);
    rainGroup.add(mesh);
    splashMeshes.push(mesh);
    splashTimers.push(0);
  }

  // Snow particles
  const snowGroup = new THREE.Group();
  snowGroup.name = 'SnowFX';
  scene.add(snowGroup);

  const snowGeo = new THREE.BufferGeometry();
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  const snowDrifts: number[] = [];
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowPositions[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
    snowPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    snowPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    snowDrifts.push((Math.random() - 0.5) * 0.3);
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMat = createSnowMaterial();
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowGroup.add(snowPoints);

  // Track last weather state to smooth transitions
  let lastPrecip = 0;
  let lastTemp = 15;

  function update(dt: number, weather: WeatherData) {
    const precip = weather.precipMm;
    const temp = weather.tempC;
    const wind = weather.windSpeedKmh / 10; // scaled for visual

    // Smooth transition for rain
    lastPrecip += (precip - lastPrecip) * Math.min(dt * 3, 1);
    const rainIntensity = temp > 2 ? Math.min(lastPrecip / 3, 1) : 0;

    // Rain
    const pos = rainGeo.attributes.position.array as Float32Array;
    const rainActive = rainIntensity > 0.05;

    // Interpolate opacity toward the intensity target so particles fade out
    // when precipitation ends instead of freezing at the last opacity.
    const rainTarget = rainActive ? rainIntensity * 0.6 : 0;
    rainMat.opacity += (rainTarget - rainMat.opacity) * Math.min(dt * 3, 1);
    rainMat.opacity = Math.max(0, Math.min(0.6, rainMat.opacity));

    if (rainActive) {
      for (let i = 0; i < RAIN_COUNT; i++) {
        const idx = i * 3;
        // Fall
        pos[idx + 1] -= rainVelocities[i] * dt * 8;
        // Wind drift
        pos[idx] += wind * dt * 0.3;

        // Reset at bottom
        if (pos[idx + 1] < -0.1) {
          pos[idx + 1] = RAIN_HEIGHT;
          pos[idx] = (Math.random() - 0.5) * RAIN_AREA;
          pos[idx + 2] = (Math.random() - 0.5) * RAIN_AREA;

          // Spawn splash
          const splashIdx = i % splashMeshes.length;
          splashMeshes[splashIdx].position.set(pos[idx], 0.02, pos[idx + 2]);
          splashMeshes[splashIdx].visible = true;
          splashMeshes[splashIdx].scale.setScalar(0);
          splashTimers[splashIdx] = 0.5;
        }

        // Wrap horizontal
        if (Math.abs(pos[idx]) > RAIN_AREA / 2) pos[idx] = (Math.random() - 0.5) * RAIN_AREA;
        if (Math.abs(pos[idx + 2]) > RAIN_AREA / 2) pos[idx + 2] = (Math.random() - 0.5) * RAIN_AREA;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    // Splash animation
    for (let i = 0; i < splashMeshes.length; i++) {
      if (splashTimers[i] > 0) {
        splashTimers[i] -= dt;
        const t = 1 - splashTimers[i] / 0.5;
        splashMeshes[i].scale.setScalar(t * 0.8);
        (splashMeshes[i].material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.4;
        if (splashTimers[i] <= 0) splashMeshes[i].visible = false;
      }
    }

    // Snow
    lastTemp += (temp - lastTemp) * Math.min(dt * 3, 1);
    const snowIntensity = lastTemp <= 2 && precip > 0.1 ? Math.min(precip / 3, 1) : 0;
    const snowActive = snowIntensity > 0.05;

    const snowTarget = snowActive ? snowIntensity * 0.5 : 0;
    snowMat.opacity += (snowTarget - snowMat.opacity) * Math.min(dt * 3, 1);
    snowMat.opacity = Math.max(0, Math.min(0.5, snowMat.opacity));

    if (snowActive) {
      const snowArr = snowGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const idx = i * 3;
        snowArr[idx + 1] -= dt * 1.2; // slow fall
        snowArr[idx] += snowDrifts[i] * dt + wind * dt * 0.1;
        snowArr[idx + 2] += wind * dt * 0.05;

        if (snowArr[idx + 1] < -0.1) {
          snowArr[idx + 1] = RAIN_HEIGHT;
          snowArr[idx] = (Math.random() - 0.5) * RAIN_AREA;
          snowArr[idx + 2] = (Math.random() - 0.5) * RAIN_AREA;
        }
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    // Fog
    if (weather.humidity > 70) {
      const fogIntensity = (weather.humidity - 70) / 30;
      if (!scene.fog) {
        scene.fog = new THREE.FogExp2(0xaaaacc, 0);
      }
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = 0.0008 * fogIntensity;
      }
    } else {
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density = 0;
      }
    }
  }

  function dispose() {
    rainGeo.dispose();
    rainMat.map?.dispose();
    rainMat.dispose();
    splashGeo.dispose();
    splashMat.dispose();
    rainGroup.removeFromParent();
    scene.remove(rainGroup);

    snowGeo.dispose();
    snowMat.map?.dispose();
    snowMat.dispose();
    snowGroup.removeFromParent();
    scene.remove(snowGroup);
  }

  return { rainGroup, snowGroup, update, dispose };
}
