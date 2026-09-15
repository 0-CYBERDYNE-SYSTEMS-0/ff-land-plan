import * as THREE from 'three';
import type { Engine } from './engine';
import { setInputMode } from '@/lib/inputArbiter';

export interface FlightCamera {
  active: boolean;
  update: (dt: number) => void;
  activate: () => void;
  deactivate: () => void;
  dispose: () => void;
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

export function createFlightCamera(
  engine: Engine,
  onEnd?: () => void,
  getBounds?: () => { minX: number; maxX: number; minZ: number; maxZ: number },
): FlightCamera {
  let camera = engine.camera;
  const canvas = engine.canvas;
  let active = false;

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

  function activate() {
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
    setInputMode('flight');

    active = true;

    // Reset flight orientation from current camera
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    state.yaw = Math.atan2(forward.x, forward.z);
    state.position.copy(camera.position);
    state.altitude = camera.position.y;
    state.speed = 5;
    state.pitch = -0.1;
    state.roll = 0;

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

    // Mouse look
    state.yaw -= mouseX * mouseSensitivity;
    state.pitch -= mouseY * mouseSensitivity;
    state.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, state.pitch));
    mouseX = 0;
    mouseY = 0;

    // Auto-level roll
    state.roll *= 0.9;

    // Rudder (Q/E)
    if (keys.has('q')) state.roll += 0.02;
    if (keys.has('e')) state.roll -= 0.02;

    // Throttle (min 0 — full stop must be possible)
    if (keys.has('w') || keys.has('arrowup')) state.speed += dtClamped * 8;
    if (keys.has('s') || keys.has('arrowdown')) state.speed -= dtClamped * 8;
    state.speed = Math.max(0, Math.min(30, state.speed));

    // Pitch from up/down
    if (keys.has('arrowup') && !keys.has('w')) state.pitch -= dtClamped * 0.5;
    if (keys.has('arrowdown')&& !keys.has('s')) state.pitch += dtClamped * 0.5;

    // Yaw from left/right
    if (keys.has('arrowleft') || keys.has('a')) state.yaw -= dtClamped * 0.8;
    if (keys.has('arrowright')|| keys.has('d')) state.yaw += dtClamped * 0.8;

    // Build rotation from pitch/yaw/roll
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), state.pitch);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), state.roll);
    const rotation = new THREE.Quaternion().multiplyQuaternions(yawQ, pitchQ).multiply(rollQ);

    camera.quaternion.copy(rotation);

    // Move forward. Dead zone below 0.05 m/s: a stopped drone must not creep
    // by float error. Altitude (Space/Shift) still applies while stopped.
    if (state.speed >= 0.05) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
      const movement = forward.multiplyScalar(state.speed * dtClamped);

      state.position.add(movement);
    }

    // Clamp into the live plan bounds (getter, not a snapshot — the bounds
    // can change while a flight is in progress).
    const bounds = getBounds?.();
    if (bounds) {
      state.position.x = Math.min(bounds.maxX, Math.max(bounds.minX, state.position.x));
      state.position.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, state.position.z));
    }

    // Altitude limits
    state.position.y = Math.max(1.5, Math.min(100, state.position.y));
    // Pitch up/down affects altitude slightly
    state.position.y += (keys.has(' ') ? 1 : 0) * dtClamped * 8;
    state.position.y += (keys.has('shift') || keys.has('control') ? -1 : 0) * dtClamped * 8;
    state.position.y = Math.max(1.5, Math.min(100, state.position.y));

    camera.position.copy(state.position);
  }

  function dispose() {
    deactivate();
  }

  // Live getter: `active` is a closure flag, and a plain property would
  // snapshot `false` forever, freezing out the rAF gating and the exit button.
  return { get active() { return active; }, update, activate, deactivate, dispose };
}
