import * as THREE from 'three';

/**
 * Stylized day length: sunrise at t≈0.22, sunset at t≈0.90. Stretching the
 * afternoon/evening puts `?fftime=0.9` inside a real amber-blue dusk and keeps
 * `?fftime=0.05` in true darkness (verification lighting matrix).
 */
const DAY_START = 0.22;
const DAY_LENGTH = 0.68;

/** Width of the warm band around the horizon (dawn/dusk glow falloff). */
const HORIZON_WARM = 0.18;

/** Distance at which the sun directional light is parked (inside the dome). */
const SUN_DISTANCE = 120;

export interface SkyState {
  timeOfDay: number; // 0-1 stylized clock (0=midnight, 0.25=dawn, 0.5=noon, 0.9=dusk)
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
  /** Directional strength of THE sun light: ≈0 at night, warm rim at dawn/dusk, ~1.15 noon. */
  sunIntensity: number;
  /** Strength the scene ambient light should use (applied by World3D). */
  ambientIntensity: number;
  /** Faint cool moon-fill strength so nights stay legible (QUALITY_BAR). */
  moonIntensity: number;
}

export interface Sky {
  mesh: THREE.Mesh;
  /** THE single sun directional light for the whole scene. */
  sunLight: THREE.DirectionalLight;
  /** Fixed, very dim bluish night fill (NOT a competing sun: ≤0.13, cool, shadowless). */
  moonLight: THREE.DirectionalLight;
  state: SkyState;
  /** cloudCover01 (0..1) dims the sun/ambient like an overcast sky — only
   *  passed by the run-env bridge (SPEC-GROWTH-VISUAL wave 4); default 0 keeps
   *  the live-weather presentation byte-identical. */
  update: (timeOfDay: number, cloudCover01?: number) => void;
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

    vec3 sunDir = normalize(uSunDirection);
    // Hide disc/glow once the sun drops below the horizon (clean night sky).
    float sunVis = smoothstep(-0.08, 0.05, sunDir.y);

    float sunDot = dot(dir, sunDir);
    // Ascending edges (disc core → rim): GLSL smoothstep is undefined when
    // edge0 >= edge1, and the previous reversed call dropped the disc entirely.
    float sunDisc = smoothstep(uSunSize * 0.7, uSunSize, sunDot);
    float sunGlow = exp(sunDot * uSunGlow) * 0.15;
    vec3 sunContribution = (sunDisc + sunGlow) * uSunColor * sunVis;

    gl_FragColor = vec4(skyColor + sunContribution, 1.0);
  }
`;

const SKY_RADIUS = 200;

interface PaletteKeys {
  top: THREE.Color;
  bottom: THREE.Color;
  ambient: THREE.Color;
  sun: THREE.Color;
}

function pal(top: string, bottom: string, ambient: string, sun: string): PaletteKeys {
  return { top: new THREE.Color(top), bottom: new THREE.Color(bottom), ambient: new THREE.Color(ambient), sun: new THREE.Color(sun) };
}

// Key palettes blended continuously by the update() weights below.
const PAL_NIGHT: PaletteKeys = pal('#0a0a1a', '#111133', '#46598f', '#10182e');
const PAL_MORN: PaletteKeys = pal('#4a5fa8', '#ff9a5e', '#8a6f5a', '#ff9e78'); // dawn: warm pink
const PAL_EVE: PaletteKeys = pal('#3d4f96', '#ff8f4c', '#6b6280', '#ffb054'); // dusk: amber-blue
const PAL_DAY: PaletteKeys = pal('#6699dd', '#bbddff', '#fff3e2', '#fffbe6'); // noon: crisp

// Module-scratch objects: update() mutates these in place — zero per-frame allocations.
const scratch = {
  sunDir: new THREE.Vector3(),
  top: new THREE.Color(),
  bottom: new THREE.Color(),
  ambient: new THREE.Color(),
  sun: new THREE.Color(),
};
/** Reused target for the overcast desaturation (wave 4). */
const overcastGrey = new THREE.Color();

/** Weighted 4-way color blend written into `out` (no allocation). */
function blendInto(
  out: THREE.Color,
  a: THREE.Color, wa: number,
  b: THREE.Color, wb: number,
  c: THREE.Color, wc: number,
  d: THREE.Color, wd: number,
): void {
  out.setRGB(
    a.r * wa + b.r * wb + c.r * wc + d.r * wd,
    a.g * wa + b.g * wb + c.g * wc + d.g * wd,
    a.b * wa + b.b * wb + c.b * wc + d.b * wd,
  );
}

export function createSky(scene: THREE.Scene): Sky {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTopColor: { value: PAL_DAY.top.clone() },
      uBottomColor: { value: PAL_DAY.bottom.clone() },
      uSunColor: { value: PAL_DAY.sun.clone() },
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

  // THE sun — the only directional that tracks the sky (engine creates none).
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.castShadow = true;
  sunLight.name = 'SunLight';
  scene.add(sunLight);

  // Moon fill: fixed dim bluish directional so night scenes stay readable
  // (brighter-than-realistic night per QUALITY_BAR) without faking daylight.
  const moonLight = new THREE.DirectionalLight(0xa9bce8, 0);
  moonLight.position.set(-38, 62, -26);
  moonLight.castShadow = false;
  moonLight.name = 'MoonFill';
  scene.add(moonLight);

  const state: SkyState = {
    timeOfDay: 0.5,
    sunDirection: new THREE.Vector3(0.7, 0.6, 0.3),
    sunColor: new THREE.Color('#fffbe6'),
    ambientColor: new THREE.Color('#fff3e2'),
    sunIntensity: 1.0,
    ambientIntensity: 0.5,
    moonIntensity: 0,
  };

  function update(timeOfDay: number, cloudCover01 = 0) {
    const t = Math.max(0, Math.min(1, timeOfDay));

    // Warped clock: sun elevation follows sin(u·π) so the daylight window is
    // [DAY_START, DAY_START + DAY_LENGTH] with a long golden-hour tail.
    const u = (t - DAY_START) / DAY_LENGTH;
    const theta = u * Math.PI;
    scratch.sunDir.set(Math.cos(theta), Math.sin(theta), 0.35).normalize();
    const yn = scratch.sunDir.y;
    const alt = Math.max(0, yn);

    const dayF = THREE.MathUtils.smoothstep(alt, 0.0, 0.45);
    const glow = Math.exp(-(yn * yn) / (HORIZON_WARM * HORIZON_WARM)); // peaks AT the horizon
    const wDay = dayF;
    const wTwil = (1 - dayF) * glow;
    const wMorn = t < 0.5 ? wTwil : 0;
    const wEve = t < 0.5 ? 0 : wTwil;
    const wNight = Math.max(0, 1 - wDay - wTwil);

    blendInto(scratch.top, PAL_NIGHT.top, wNight, PAL_MORN.top, wMorn, PAL_EVE.top, wEve, PAL_DAY.top, wDay);
    blendInto(scratch.bottom, PAL_NIGHT.bottom, wNight, PAL_MORN.bottom, wMorn, PAL_EVE.bottom, wEve, PAL_DAY.bottom, wDay);
    blendInto(scratch.ambient, PAL_NIGHT.ambient, wNight, PAL_MORN.ambient, wMorn, PAL_EVE.ambient, wEve, PAL_DAY.ambient, wDay);
    blendInto(scratch.sun, PAL_NIGHT.sun, wNight, PAL_MORN.sun, wMorn, PAL_EVE.sun, wEve, PAL_DAY.sun, wDay);

    // Overcast mood (wave 4): heavy cloud greys the dome — desaturate toward
    // the blended color's luminance and dim it slightly. Quadratic weight so
    // scattered clouds (c≈0.3, k≈0.09) barely register while a storm
    // (c≈0.94, k≈0.88) reads at a glance. cloudCover01 = 0 (live default)
    // leaves the palette byte-identical.
    if (cloudCover01 > 0.01) {
      const k = cloudCover01 * cloudCover01 * (1 - 0.15 * cloudCover01);
      for (const c of [scratch.top, scratch.bottom] as const) {
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        overcastGrey.setRGB(lum, lum, lum);
        c.lerp(overcastGrey, Math.min(0.92, k * 1.1));
      }
    }

    material.uniforms.uTopColor.value.copy(scratch.top);
    material.uniforms.uBottomColor.value.copy(scratch.bottom);
    material.uniforms.uSunColor.value.copy(scratch.sun);
    material.uniforms.uSunDirection.value.copy(scratch.sunDir);

    // Single-sun intensity curve: ramps with altitude to a crisp ~1.15 at noon,
    // keeps a warm ~0.3 rim right at the horizon (dawn pink / dusk amber),
    // reaches exactly 0 once the sun is below the horizon. No night sun.
    const sunI = Math.max(1.15 * dayF, 0.3 * glow * glow) * (1 - 0.55 * cloudCover01);
    // Ambient hue comes from the palette; strength has a deliberate night floor
    // (0.40) so nights stay legible, rising to 0.56 under full daylight.
    // Overcast dims it less than the sun — clouds diffuse, they don't eclipse.
    const ambientI = (0.4 + 0.16 * dayF) * (1 - 0.22 * cloudCover01);
    // Cool moon-fill: fully on in deep night, gone well before mid-morning.
    const moonI = 0.13 * (1 - THREE.MathUtils.smoothstep(yn, -0.12, 0.1));

    sunLight.position.copy(scratch.sunDir).multiplyScalar(SUN_DISTANCE);
    sunLight.color.copy(scratch.sun);
    sunLight.intensity = sunI;
    moonLight.intensity = moonI;

    state.timeOfDay = t;
    state.sunDirection.copy(scratch.sunDir);
    state.sunColor.copy(scratch.sun);
    state.ambientColor.copy(scratch.ambient);
    state.sunIntensity = sunI;
    state.ambientIntensity = ambientI;
    state.moonIntensity = moonI;
  }

  update(0.5);

  function dispose() {
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
    sunLight.removeFromParent();
    moonLight.removeFromParent();
  }

  return { mesh, sunLight, moonLight, state, update, dispose };
}
