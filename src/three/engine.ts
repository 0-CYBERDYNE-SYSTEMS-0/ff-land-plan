import * as THREE from 'three';
import CameraControls from 'camera-controls';

export interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  canvas: HTMLCanvasElement;
  addUpdate: (fn: (dt: number) => void) => void;
  removeUpdate: (fn: (dt: number) => void) => void;
  dispose: () => void;
  resize: (width: number, height: number) => void;
  setBounds: (options: { minDistance?: number; maxDistance?: number; maxPolarAngle?: number }) => void;
  setTargetBounds: (bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null) => void;
  resetView: (opts?: { distance?: number }) => void;
}

interface TargetBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Hoisted scratch for the per-frame target clamp — no allocation in animate().
const tmpTarget = new THREE.Vector3();
const TARGET_CLAMP_EPSILON = 1e-4;

/**
 * Two-mode mouse remap. Select tool (enabled): left=ROTATE, right=TRUCK.
 * Paint tools (disabled): the stroke owns the left drag (left=NONE) and the
 * camera stays reachable mid-paint via right=ROTATE. One-finger touch follows
 * the same boolean so painting gestures are never hijacked by the camera.
 */
export function setEngineOrbitEnabled(engine: Engine, enabled: boolean): void {
  engine.controls.mouseButtons.left = enabled ? CameraControls.ACTION.ROTATE : CameraControls.ACTION.NONE;
  engine.controls.mouseButtons.right = enabled ? CameraControls.ACTION.TRUCK : CameraControls.ACTION.ROTATE;
  engine.controls.touches.one = enabled ? CameraControls.ACTION.TOUCH_ROTATE : CameraControls.ACTION.NONE;
}

/**
 * Create a three.js engine with camera-controls, lights, and a rAF loop.
 *
 * @param canvas - The canvas element to render into.
 * @param theme  - 'light' or 'dark' to set the scene background.
 */
export function createEngine(canvas: HTMLCanvasElement, theme: 'light' | 'dark'): Engine {
  // --- Renderer -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Initial size (caller should resize immediately after creation).
  const width = canvas.clientWidth || 1;
  const height = canvas.clientHeight || 1;
  renderer.setSize(width, height);

  // --- Camera -------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);

  // --- Scene --------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme === 'dark' ? '#1a1f2e' : '#e8f4f8');

  // --- Lights -------------------------------------------------------------
  // Ambient only. THE directional sun is owned by createSky() (time-driven);
  // engine deliberately adds NO static directional so there is exactly one
  // sun in the scene (night used to be blasted by a fixed white light here).
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // --- Controls -----------------------------------------------------------
  CameraControls.install({ THREE });
  const controls = new CameraControls(camera, canvas);
  controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
  controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
  controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
  // Dampen the wheel dolly: one notch used to jump the camera inside
  // structures, after which orbit/Fit could not recover (target inside
  // geometry). Slower dolly + smooth damping keeps zooms readable.
  // dollyToCursor stays FALSE: cursor-targeted dolly re-introduces that
  // camera-inside-geometry regression; setTargetBounds + the per-frame clamp
  // below are the guardrail for truck/rotate instead.
  controls.dollyToCursor = false;
  controls.smoothTime = 0.25;

  // --- rAF loop -----------------------------------------------------------
  const timer = new THREE.Timer();
  let rafId = 0;
  let disposed = false;
  const updateFns = new Set<(dt: number) => void>();
  let targetBounds: TargetBounds | null = null;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    timer.update();
    const delta = timer.getDelta();
    controls.update(delta);
    // Target clamp guardrail. Skipped while flight owns the camera:
    // controls.enabled is false then, and flight.ts clamps via its own bounds.
    if (controls.enabled && targetBounds) {
      controls.getTarget(tmpTarget);
      const cx = Math.min(targetBounds.maxX, Math.max(targetBounds.minX, tmpTarget.x));
      const cy = Math.max(0, tmpTarget.y);
      const cz = Math.min(targetBounds.maxZ, Math.max(targetBounds.minZ, tmpTarget.z));
      if (
        Math.abs(cx - tmpTarget.x) > TARGET_CLAMP_EPSILON ||
        Math.abs(cy - tmpTarget.y) > TARGET_CLAMP_EPSILON ||
        Math.abs(cz - tmpTarget.z) > TARGET_CLAMP_EPSILON
      ) {
        controls.setTarget(cx, cy, cz, false);
      }
      // No direct camera.position floor here: controls.update() rewrites the
      // camera from its internal spherical each frame, so a one-frame write
      // never accumulates. The below-ground floor is owned by maxPolarAngle /
      // minDistance in World3D's setBounds.
    }
    for (const fn of updateFns) fn(delta);
    renderer.render(scene, camera);
  }

  animate();

  // --- Resize handler -----------------------------------------------------
  function resize(newWidth: number, newHeight: number) {
    renderer.setSize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
  }

  // --- Camera bounds ------------------------------------------------------
  function setBounds(options: { minDistance?: number; maxDistance?: number; maxPolarAngle?: number }) {
    if (options.minDistance !== undefined) controls.minDistance = options.minDistance;
    if (options.maxDistance !== undefined) controls.maxDistance = options.maxDistance;
    if (options.maxPolarAngle !== undefined) controls.maxPolarAngle = options.maxPolarAngle;
    controls.update(0);
  }

  // World-rect guardrail consumed by the animate() clamp; null disables it.
  function setTargetBounds(bounds: TargetBounds | null) {
    targetBounds = bounds;
  }

  // Escape hatch when the camera ends up inside geometry: restore the default
  // isometric framing around the world origin.
  function resetView(opts?: { distance?: number }) {
    const d = opts?.distance ?? 12;
    controls.setPosition(d * 0.7, d * 0.5, d * 0.7, false);
    controls.setTarget(0, 0, 0, false);
    controls.azimuthAngle = -Math.PI / 4;
    controls.polarAngle = Math.PI / 3.5;
    controls.distance = d;
    controls.update(0);
  }

  // --- Dispose ------------------------------------------------------------
  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    controls.dispose();
    renderer.dispose();

    // Remove any remaining event listeners camera-controls may have attached.
    // The controls.dispose() call above removes most, but we also clear the
    // canvas reference to be safe.
    renderer.forceContextLoss();
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    canvas,
    addUpdate: (fn) => { updateFns.add(fn); },
    removeUpdate: (fn) => { updateFns.delete(fn); },
    dispose,
    resize,
    setBounds,
    setTargetBounds,
    resetView,
  };
}
