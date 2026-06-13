import * as THREE from 'three';
import CameraControls from 'camera-controls';

export interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  canvas: HTMLCanvasElement;
  dispose: () => void;
  resize: (width: number, height: number) => void;
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
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  scene.add(dirLight);

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

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    timer.update();
    const delta = timer.getDelta();
    controls.update(delta);
    renderer.render(scene, camera);
  }

  animate();

  // --- Resize handler -----------------------------------------------------
  function resize(newWidth: number, newHeight: number) {
    renderer.setSize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
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
    dispose,
    resize,
  };
}
