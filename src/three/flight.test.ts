import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createFlightCamera, WALK_SPEED, WALK_SPRINT } from '@/three/flight';

/**
 * Flight lives on the shared camera and owns window/document listeners, so the
 * test stubs those globals instead of pulling a DOM environment into the suite
 * (the vitest config runs everything on node).
 */
type Listener = (event: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

function addListener(key: string, listener: Listener) {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
}
function removeListener(key: string, listener: Listener) {
  listeners.get(key)?.delete(listener);
}
function emit(key: string, event: unknown) {
  for (const listener of listeners.get(key) ?? []) listener(event);
}

const stubWindow = {
  addEventListener: (type: string, listener: Listener) => addListener(`window:${type}`, listener),
  removeEventListener: (type: string, listener: Listener) => removeListener(`window:${type}`, listener),
};
const stubDocument = {
  pointerLockElement: null as unknown,
  addEventListener: (type: string, listener: Listener) => addListener(`document:${type}`, listener),
  removeEventListener: (type: string, listener: Listener) => removeListener(`document:${type}`, listener),
  exitPointerLock: vi.fn(),
};

function stubEngine(position: THREE.Vector3, target: THREE.Vector3) {
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.05, 500);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const controls = {
    enabled: true,
    azimuthAngle: 0,
    polarAngle: 1.2,
    distance: 12,
    setPosition: vi.fn(),
    setTarget: vi.fn(),
    update: vi.fn(),
    getTarget: (out: THREE.Vector3) => out.set(0, 0, 0),
    setLookAt: vi.fn(),
  };
  return {
    camera,
    canvas: { requestPointerLock: () => undefined },
    controls,
  } as unknown as Parameters<typeof createFlightCamera>[0];
}

/** Direction the camera is actually looking, as a unit vector. */
function lookDirection(camera: THREE.PerspectiveCamera): THREE.Vector3 {
  return camera.getWorldDirection(new THREE.Vector3()).normalize();
}

const INTERIOR = { minX: -6, maxX: 6, minZ: -4, maxZ: 4 };

function makeFlight(overrides: Partial<Parameters<typeof createFlightCamera>[1]> = {}) {
  const engine = stubEngine(new THREE.Vector3(-5, 1.7, -1), new THREE.Vector3(5, 1.2, 0.5));
  const onEnd = vi.fn();
  const flight = createFlightCamera(engine, {
    onEnd,
    getBounds: () => INTERIOR,
    getCeilingM: () => 3,
    getEyeHeightM: () => 1.7,
    ...overrides,
  });
  return { engine, flight, onEnd };
}

describe('flight and walk cameras', () => {
  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('window', stubWindow);
    vi.stubGlobal('document', stubDocument);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps looking the same way when fly mode starts', () => {
    const { engine, flight } = makeFlight();
    const before = lookDirection(engine.camera);
    flight.activate('fly');
    flight.update(0.016);
    expect(lookDirection(engine.camera).dot(before)).toBeGreaterThan(0.99);
  });

  it('keeps looking the same way when a walk starts, at standing height', () => {
    const { engine, flight } = makeFlight();
    const before = lookDirection(engine.camera);
    flight.activate('walk');
    flight.update(0.016);
    const after = lookDirection(engine.camera);
    expect(after.dot(before)).toBeGreaterThan(0.99);
    expect(engine.camera.position.y).toBeCloseTo(1.7, 5);
  });

  it('walks W forwards along the ground plane and holds eye height', () => {
    const { engine, flight } = makeFlight();
    flight.activate('walk');
    flight.update(0.016);
    const before = engine.camera.position.clone();
    const forwards = lookDirection(engine.camera).setY(0).normalize();

    emit('window:keydown', { key: 'w', preventDefault() {} });
    for (let step = 0; step < 10; step += 1) flight.update(0.1);
    const moved = engine.camera.position.clone().sub(before);

    expect(moved.length()).toBeCloseTo(WALK_SPEED * 1, 1);
    expect(moved.clone().setY(0).normalize().dot(forwards)).toBeGreaterThan(0.99);
    expect(engine.camera.position.y).toBeCloseTo(1.7, 5);
  });

  it('sprints with shift and never leaves the environment bounds', () => {
    const { engine, flight } = makeFlight();
    flight.activate('walk');
    emit('window:keydown', { key: 'w', preventDefault() {} });
    emit('window:keydown', { key: 'Shift', preventDefault() {} });
    for (let step = 0; step < 40; step += 1) flight.update(0.1);
    const sprinted = engine.camera.position.clone();
    expect(sprinted.x).toBeLessThanOrEqual(INTERIOR.maxX);
    expect(sprinted.x).toBeGreaterThanOrEqual(INTERIOR.minX);
    expect(sprinted.z).toBeLessThanOrEqual(INTERIOR.maxZ);
    expect(sprinted.z).toBeGreaterThanOrEqual(INTERIOR.minZ);
    // Held to the wall instead of leaving the environment.
    expect(sprinted.x).toBeCloseTo(INTERIOR.maxX, 5);
    expect(engine.camera.position.y).toBeCloseTo(1.7, 5);
    // Sprint covered more ground than a walk would have in the same steps.
    expect(sprinted.distanceTo(new THREE.Vector3(-5, 1.7, -1))).toBeGreaterThan(WALK_SPEED * 2);
    expect(WALK_SPRINT).toBeGreaterThan(WALK_SPEED);
  });

  it('caps a drone under the environment ceiling and lets W fly forward', () => {
    const { engine, flight } = makeFlight({ getEyeHeightM: undefined });
    flight.activate('fly');
    emit('window:keydown', { key: ' ', preventDefault() {} });
    for (let step = 0; step < 60; step += 1) flight.update(0.1);
    expect(engine.camera.position.y).toBeLessThanOrEqual(3);
    const before = engine.camera.position.clone();
    emit('window:keyup', { key: ' ', preventDefault() {} });
    emit('window:keydown', { key: 'w', preventDefault() {} });
    for (let step = 0; step < 10; step += 1) flight.update(0.1);
    expect(engine.camera.position.distanceTo(before)).toBeGreaterThan(1);
  });

  it('reports its mode and ends on Escape', () => {
    const { flight, onEnd } = makeFlight();
    expect(flight.active).toBe(false);
    flight.activate('walk');
    expect(flight.active).toBe(true);
    expect(flight.mode).toBe('walk');
    emit('window:keydown', { key: 'Escape', preventDefault() {} });
    expect(flight.active).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
