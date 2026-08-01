import * as THREE from 'three';
import type { Engine } from './engine';

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

export function createFlightCamera(engine: Engine, onEnd?: () => void): FlightCamera {
  let camera = engine.camera;
  const canvas = engine.canvas;
  let active = false;

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

  function onKeyDown(e: KeyboardEvent) {
    keys.add(e.key.toLowerCase());
    if (e.key === 'Escape' && active) {
      deactivate();
      onEnd?.();
    }
  }
  function onKeyUp(e: KeyboardEvent) { keys.delete(e.key.toLowerCase()); }
  function onMouseMove(e: MouseEvent) {
    if (!pointerLocked) return;
    mouseX += e.movementX;
    mouseY += e.movementY;
  }
  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
  }

  function activate() {
    if (active) return;
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

    // Lock pointer for mouselook
    canvas.requestPointerLock();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
  }

  function deactivate() {
    if (!active) return;
    active = false;

    engine.controls.enabled = true;
    document.exitPointerLock();

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);

    keys.clear();
    mouseX = 0;
    mouseY = 0;
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

    // Throttle
    if (keys.has('w') || keys.has('arrowup')) state.speed += dtClamped * 8;
    if (keys.has('s') || keys.has('arrowdown')) state.speed -= dtClamped * 8;
    state.speed = Math.max(2, Math.min(30, state.speed));

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

    // Move forward
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation);
    const movement = forward.multiplyScalar(state.speed * dtClamped);

    state.position.add(movement);

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

  return { active, update, activate, deactivate, dispose };
}
