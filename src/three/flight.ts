import * as THREE from 'three';
import type { Engine } from './engine';
import { setInputMode } from '@/lib/inputArbiter';

export type FlightMode = 'fly' | 'walk';

export interface FlightCamera {
  active: boolean;
  mode: FlightMode;
  update: (dt: number) => void;
  activate: (mode?: FlightMode) => void;
  deactivate: () => void;
  dispose: () => void;
}

export interface FlightCameraOptions {
  onEnd?: () => void;
  /** Live camera bounds (re-read every frame so plan/farm changes clamp). */
  getBounds?: () => { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Interior ceiling cap in metres; null/absent keeps the open-sky limits. */
  getCeilingM?: () => number | null;
  /** Standing eye height for walk mode (metres). */
  getEyeHeightM?: () => number;
}

interface FlightState {
  pitch: number;   // radians
  yaw: number;     // radians
  roll: number;    // radians
  speed: number;   // m/s forward
  altitude: number;
  velocity: THREE.Vector3;
  position: THREE.Vector3;
}

export const WALK_SPEED = 2.6;   // m/s — a brisk indoor walk
export const WALK_SPRINT = 5.5;  // m/s — shift
const FLY_FLOOR_ALT = 1.5;
const OPEN_SKY_CEILING = 100;
const INTERIOR_FLY_FLOOR = 0.35;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * One camera-controls escape hatch with two navigation modes:
 *
 * - `fly`  — the original WASD drone (throttle, altitude, roll). Inside an
 *   enclosed shell its bounds/ceiling come from `getBounds`/`getCeilingM`, so
 *   a drone cannot leave the environment it belongs to.
 * - `walk` — an eye-height first-person walk: mouse look, W/S forward/back,
 *   A/D strafe, shift to hurry, movement locked to the ground plane and the
 *   camera height pinned to the environment's standing eye height. This is the
 *   interior navigation mode for greenhouse/hoophouse/tent/room/warehouse
 *   worlds.
 *
 * Pointer lock, key capture, pre-flight orbit restore and the Esc exit path are
 * shared by both modes.
 */
export function createFlightCamera(
  engine: Engine,
  options: FlightCameraOptions = {},
): FlightCamera {
  const { onEnd, getBounds, getCeilingM, getEyeHeightM } = options;
  const camera = engine.camera;
  const canvas = engine.canvas;
  let active = false;
  let mode: FlightMode = 'fly';

  // Pre-flight orbit state so exit restores exactly where the camera was.
  let savedCamera: {
    position: THREE.Vector3;
    target: THREE.Vector3;
    azimuth: number;
    polar: number;
    distance: number;
  } | null = null;

  const state: FlightState = {
    pitch: -0.1,
    yaw: 0,
    roll: 0,
    speed: 5,
    altitude: 10,
    velocity: new THREE.Vector3(),
    position: new THREE.Vector3(),
  };

  const keys = new Set<string>();
  let mouseX = 0;
  let mouseY = 0;
  const mouseSensitivity = 0.002;
  let pointerLocked = false;

  // Space would otherwise activate the focused Fly button on keyup, and the
  // arrows would scroll the page, while flight owns the keyboard.
  const capturedKeys = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

  function onKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (capturedKeys.has(key)) e.preventDefault();
    keys.add(key);
    if (e.key === 'Escape' && active) {
      deactivate();
      onEnd?.();
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (capturedKeys.has(key)) e.preventDefault();
    keys.delete(key);
  }
  function onMouseMove(e: MouseEvent) {
    if (!pointerLocked) return;
    mouseX += e.movementX;
    mouseY += e.movementY;
  }
  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    // The ESC keypress that exits pointer lock is consumed by the browser and
    // never reaches onKeyDown, so lock-loss-while-active IS the exit path.
    if (active && !pointerLocked) {
      deactivate();
      onEnd?.();
    }
  }

  function activate(nextMode: FlightMode = 'fly') {
    if (active) return;

    // Save pre-flight orbit state BEFORE switching modes, so deactivate can
    // put the camera back exactly where the orbit controls left it.
    savedCamera = {
      position: camera.position.clone(),
      target: engine.controls.getTarget(new THREE.Vector3()),
      azimuth: engine.controls.azimuthAngle,
      polar: engine.controls.polarAngle,
      distance: engine.controls.distance,
    };
    setInputMode(nextMode === 'walk' ? 'walk' : 'flight');

    active = true;
    mode = nextMode;

    // Reset flight orientation from current camera. The yaw is the angle that
    // reproduces this look direction from `-Z` rotated about +Y, so entering a
    // nav mode never spins the view around.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    state.yaw = Math.atan2(-forward.x, -forward.z);
    state.position.copy(camera.position);
    state.altitude = camera.position.y;
    state.speed = nextMode === 'walk' ? WALK_SPEED : 5;
    state.pitch = nextMode === 'walk' ? 0 : -0.1;
    state.roll = 0;

    if (nextMode === 'walk') {
      // Drop straight to standing height — a walk starts on the floor, not
      // wherever the orbit camera happened to be hovering.
      state.position.y = getEyeHeightM?.() ?? 1.65;
    }

    // Disable orbit controls
    engine.controls.enabled = false;

    // Lock pointer for mouselook. Chrome returns a promise from
    // requestPointerLock; a rejected re-lock (browser cooldown after ESC)
    // must not strand a zombie flight or raise an unhandled rejection.
    const lockRequest = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    lockRequest?.catch(() => {
      deactivate();
      onEnd?.();
    });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
  }

  function deactivate() {
    if (!active) return;
    active = false;

    engine.controls.enabled = true;
    setInputMode('default');
    document.exitPointerLock();

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);

    keys.clear();
    mouseX = 0;
    mouseY = 0;

    // Restore the pre-flight orbit state (same pattern as engine resetView).
    if (savedCamera) {
      const saved = savedCamera;
      savedCamera = null;
      engine.controls.setPosition(saved.position.x, saved.position.y, saved.position.z, false);
      engine.controls.setTarget(saved.target.x, saved.target.y, saved.target.z, false);
      engine.controls.azimuthAngle = saved.azimuth;
      engine.controls.polarAngle = saved.polar;
      engine.controls.distance = saved.distance;
      engine.controls.update(0);
    }
  }

  function update(dt: number) {
    if (!active) return;

    const dtClamped = Math.min(dt, 0.1); // prevent huge jumps
    const walking = mode === 'walk';

    // Mouse look
    state.yaw -= mouseX * mouseSensitivity;
    state.pitch -= mouseY * mouseSensitivity;
    const pitchLimit = walking ? Math.PI / 3.2 : Math.PI / 3;
    state.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, state.pitch));
    mouseX = 0;
    mouseY = 0;

    // Auto-level roll
    state.roll *= 0.9;

    // Rudder (Q/E) — flight only; a walker never banks.
    if (!walking) {
      if (keys.has('q')) state.roll += 0.02;
      if (keys.has('e')) state.roll -= 0.02;
    }

    // Throttle (min 0 — full stop must be possible). Walk mode has no
    // throttle: W/S are direct movement (see below).
    if (!walking) {
      if (keys.has('w') || keys.has('arrowup')) state.speed += dtClamped * 8;
      if (keys.has('s') || keys.has('arrowdown')) state.speed -= dtClamped * 8;
      state.speed = Math.max(0, Math.min(30, state.speed));

      // Pitch from up/down
      if (keys.has('arrowup') && !keys.has('w')) state.pitch -= dtClamped * 0.5;
      if (keys.has('arrowdown') && !keys.has('s')) state.pitch += dtClamped * 0.5;

      // Yaw from left/right
      if (keys.has('arrowleft') || keys.has('a')) state.yaw -= dtClamped * 0.8;
      if (keys.has('arrowright') || keys.has('d')) state.yaw += dtClamped * 0.8;
    } else {
      // Arrows still turn; the mouse is the primary look control.
      if (keys.has('arrowleft')) state.yaw -= dtClamped * 0.9;
      if (keys.has('arrowright')) state.yaw += dtClamped * 0.9;
    }

    // Build rotation from pitch/yaw/roll
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, state.yaw);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.roll);
    const rotation = new THREE.Quaternion().multiplyQuaternions(yawQ, pitchQ).multiply(rollQ);

    camera.quaternion.copy(rotation);

    if (walking) {
      // Ground-plane movement: pitch tilts the view, never the walk vector.
      const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      let ahead = 0;
      let side = 0;
      if (keys.has('w') || keys.has('arrowup')) ahead += 1;
      if (keys.has('s') || keys.has('arrowdown')) ahead -= 1;
      if (keys.has('d')) side += 1;
      if (keys.has('a')) side -= 1;
      if (ahead !== 0 || side !== 0) {
        const speed = keys.has('shift') || keys.has('control') ? WALK_SPRINT : WALK_SPEED;
        const step = speed * dtClamped;
        state.position.addScaledVector(forward, ahead * step);
        state.position.addScaledVector(right, side * step);
      }
    } else if (state.speed >= 0.05) {
      // Move forward. Dead zone below 0.05 m/s: a stopped drone must not creep
      // by float error. Altitude (Space/Shift) still applies while stopped.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
      const movement = forward.multiplyScalar(state.speed * dtClamped);

      state.position.add(movement);
    }

    // Clamp into the live bounds (getter, not a snapshot — the bounds
    // can change while a flight is in progress).
    const bounds = getBounds?.();
    if (bounds) {
      state.position.x = Math.min(bounds.maxX, Math.max(bounds.minX, state.position.x));
      state.position.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, state.position.z));
    }

    // Altitude limits. Inside an enclosed environment the shell ceiling caps a
    // drone so it cannot rise through the roof, and a walk stays pinned to the
    // environment's standing eye height.
    const ceiling = getCeilingM?.() ?? null;
    const minAlt = ceiling !== null ? INTERIOR_FLY_FLOOR : FLY_FLOOR_ALT;
    const maxAlt = ceiling !== null ? Math.max(minAlt + 0.2, ceiling) : OPEN_SKY_CEILING;
    if (walking) {
      state.position.y = getEyeHeightM?.() ?? 1.65;
    } else {
      // Pitch up/down affects altitude slightly
      state.position.y += (keys.has(' ') ? 1 : 0) * dtClamped * 8;
      state.position.y += (keys.has('shift') || keys.has('control') ? -1 : 0) * dtClamped * 8;
    }
    state.position.y = Math.max(minAlt, Math.min(maxAlt, state.position.y));

    camera.position.copy(state.position);
  }

  function dispose() {
    deactivate();
  }

  // Live getters: `active`/`mode` are closure state, and plain properties would
  // snapshot their construction-time values forever, freezing out the rAF
  // gating and the exit button.
  return {
    get active() { return active; },
    get mode() { return mode; },
    update,
    activate,
    deactivate,
    dispose,
  };
}
