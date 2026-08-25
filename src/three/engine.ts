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

  // --- rAF loop -----------------------------------------------------------
  const timer = new THREE.Timer();
  let rafId = 0;
  let disposed = false;
  const updateFns = new Set<(dt: number) => void>();

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    timer.update();
    const delta = timer.getDelta();
    controls.update(delta);
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
  };
}
