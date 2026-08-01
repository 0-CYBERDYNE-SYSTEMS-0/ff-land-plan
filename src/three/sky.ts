import * as THREE from 'three';

export interface SkyState {
  timeOfDay: number; // 0-1 (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
}

export interface Sky {
  mesh: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  state: SkyState;
  update: (timeOfDay: number) => void;
  dispose: () => void;
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunSize;
  uniform float uSunGlow;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float t = max(dir.y, 0.0);
    vec3 skyColor = mix(uBottomColor, uTopColor, t);

    // Sun glow
    float sunDot = dot(dir, normalize(uSunDirection));
    float sunDisc = smoothstep(uSunSize, uSunSize * 0.7, sunDot);
    float sunGlow = exp(sunDot * uSunGlow) * 0.15;
    vec3 sunContribution = (sunDisc + sunGlow) * uSunColor;

    gl_FragColor = vec4(skyColor + sunContribution, 1.0);
  }
`;

const SKY_RADIUS = 200;

/** Color palette for different times of day. */
function colorsForTimeOfDay(t: number): {
  top: THREE.Color;
  bottom: THREE.Color;
  sun: THREE.Color;
  ambient: THREE.Color;
  sunDir: THREE.Vector3;
} {
  // t=0 midnight, t=0.25 sunrise, t=0.5 noon, t=0.75 sunset
  const angle = t * Math.PI * 2 - Math.PI / 2; // sun starts at east (-PI/2)

  const sunDir = new THREE.Vector3(
    Math.cos(angle),
    Math.sin(angle),
    0.3,
  );

  // Altitude factor: 0 = below horizon, 1 = overhead
  const alt = Math.max(0, sunDir.y);

  if (t < 0.2 || t > 0.8) {
    // Night: dark blue to black
    return {
      top: new THREE.Color('#0a0a1a'),
      bottom: new THREE.Color('#111133'),
      sun: new THREE.Color('#000000'),
      ambient: new THREE.Color('#111122'),
      sunDir,
    };
  }

  if (t < 0.3 || t > 0.7) {
    // Dawn/dusk: orange-pink to deep blue
    const fade = t < 0.3 ? (t - 0.2) / 0.1 : (0.8 - t) / 0.1;
    return {
      top: new THREE.Color('#334488').lerp(new THREE.Color('#5577cc'), fade),
      bottom: new THREE.Color('#ff8844').lerp(new THREE.Color('#ffcc88'), fade),
      sun: new THREE.Color('#ffaa44'),
      ambient: new THREE.Color('#332211').lerp(new THREE.Color('#554433'), fade),
      sunDir,
    };
  }

  // Day: sky blue to pale blue
  const dayPos = (t - 0.3) / 0.4; // 0 at 0.3 (morning), 1 at 0.7 (late afternoon)
  const topColor = new THREE.Color('#4488cc').lerp(new THREE.Color('#6699dd'), dayPos);
  const bottomColor = new THREE.Color('#aaccee').lerp(new THREE.Color('#bbddff'), dayPos);
  const sunColor = new THREE.Color('#fffbe6').lerp(new THREE.Color('#ffeecc'), dayPos);

  return {
    top: topColor,
    bottom: bottomColor,
    sun: sunColor,
    ambient: new THREE.Color('#ffffff').multiplyScalar(0.3 + alt * 0.7),
    sunDir,
  };
}

export function createSky(scene: THREE.Scene): Sky {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTopColor: { value: new THREE.Color('#4488cc') },
      uBottomColor: { value: new THREE.Color('#aaccee') },
      uSunColor: { value: new THREE.Color('#fffbe6') },
      uSunDirection: { value: new THREE.Vector3(0.7, 0.6, 0.3) },
      uSunSize: { value: 0.97 },
      uSunGlow: { value: 8.0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.name = 'SkyDome';
  scene.add(mesh);

  // Sun light (casts shadows, moves with sun)
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.castShadow = true;
  sunLight.name = 'SunLight';
  scene.add(sunLight);

  const state: SkyState = {
    timeOfDay: 0.5,
    sunDirection: new THREE.Vector3(0.7, 0.6, 0.3),
    sunColor: new THREE.Color('#fffbe6'),
    ambientColor: new THREE.Color('#ffffff'),
  };

  function update(timeOfDay: number) {
    const t = Math.max(0, Math.min(1, timeOfDay));
    const colors = colorsForTimeOfDay(t);

    material.uniforms.uTopColor.value.copy(colors.top);
    material.uniforms.uBottomColor.value.copy(colors.bottom);
    material.uniforms.uSunColor.value.copy(colors.sun);
    material.uniforms.uSunDirection.value.copy(colors.sunDir);

    sunLight.position.copy(colors.sunDir.clone().multiplyScalar(50));
    sunLight.color.copy(colors.sun);
    sunLight.intensity = colors.sunDir.y > 0 ? 0.3 + colors.sunDir.y * 0.7 : 0.1;

    state.timeOfDay = t;
    state.sunDirection.copy(colors.sunDir);
    state.sunColor.copy(colors.sun);
    state.ambientColor.copy(colors.ambient);
  }

  update(0.5);

  function dispose() {
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
    sunLight.removeFromParent();
  }

  return { mesh, sunLight, state, update, dispose };
}
