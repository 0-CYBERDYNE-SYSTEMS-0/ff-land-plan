import * as THREE from 'three';
import type { PlanSurface } from '@/types';

const HOME_AZIMUTH = -Math.PI / 4;
const HOME_POLAR = Math.PI / 3.5;
const HOME_FOV_DEG = 45;
const FRAME_MARGIN = 0.82;

/**
 * Enclosed surfaces are navigated from the INSIDE (interior-first framing and
 * a walk camera); outdoor plans keep the original exterior dollhouse fit.
 * `container` is mapped onto the warehouse surface by the archetype tables.
 */
const ENCLOSED_SURFACES: ReadonlySet<PlanSurface> = new Set<PlanSurface>([
  'greenhouse',
  'hoophouse',
  'tent',
  'indoor',
  'warehouse',
]);

/** Minimum reliable interior run/width/headroom for an inside-the-shell camera. */
const INTERIOR_MIN_RUN_M = 4;
const INTERIOR_MIN_WIDTH_M = 1.6;
const INTERIOR_MIN_HEIGHT_M = 1.5;

/** Near/far clip and orbit limits shaped for the surface being viewed. */
export interface CameraLimits {
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
}

export interface CameraFrame {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

/** Axis-aligned interior rect used to confine orbit targets, walk and flight. */
export interface InteriorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Ceiling used as the altitude cap for a drone flight inside a shell. */
  ceilingM: number;
}

export function isEnclosedSurface(surface: PlanSurface | null | undefined): boolean {
  return surface !== null && surface !== undefined && ENCLOSED_SURFACES.has(surface);
}

/** Fit an axis-aligned world bound at the normal isometric viewing angle. */
export function fitCameraToBounds(bounds: THREE.Box3, aspect: number): CameraFrame {
  const target = bounds.getCenter(new THREE.Vector3());
  const sinPolar = Math.sin(HOME_POLAR);
  const direction = new THREE.Vector3(
    Math.sin(HOME_AZIMUTH) * sinPolar,
    Math.cos(HOME_POLAR),
    Math.cos(HOME_AZIMUTH) * sinPolar,
  );
  const forward = direction.clone().negate();
  const right = new THREE.Vector3(Math.cos(HOME_AZIMUTH), 0, -Math.sin(HOME_AZIMUTH));
  const up = right.clone().cross(forward).normalize();
  const halfFov = THREE.MathUtils.degToRad(HOME_FOV_DEG / 2);
  const halfHeight = Math.tan(halfFov) * FRAME_MARGIN;
  const halfWidth = halfHeight * Math.max(0.1, aspect);
  let distance = 2;

  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const relative = new THREE.Vector3(x, y, z).sub(target);
        const towardCamera = relative.dot(direction);
        distance = Math.max(
          distance,
          towardCamera + Math.abs(relative.dot(right)) / halfWidth,
          towardCamera + Math.abs(relative.dot(up)) / halfHeight,
        );
      }

  distance += 0.05;
  const position = target.clone().addScaledVector(direction, distance);
  return { position, target, distance };
}

/** The floor and the actual built shell share a centered plan footprint. */
export function worldFrameBounds(
  widthM: number,
  depthM: number,
  shellRoot?: THREE.Object3D | null,
): THREE.Box3 {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-widthM / 2, 0, -depthM / 2),
    new THREE.Vector3(widthM / 2, 0, depthM / 2),
  );
  if (shellRoot) {
    shellRoot.updateWorldMatrix(true, true);
    bounds.union(new THREE.Box3().setFromObject(shellRoot));
  }
  return bounds;
}

/**
 * Whether an enclosed shell is roomy enough to stand inside. A cold frame
 * (0.45 m tall) or a tiny footprint keeps the exterior fit — an eye-height
 * camera in there would clip through the walls.
 */
export function interiorFramingAvailable(
  widthM: number,
  depthM: number,
  heightM: number,
): boolean {
  if (!Number.isFinite(widthM) || !Number.isFinite(depthM) || !Number.isFinite(heightM)) return false;
  return (
    Math.max(widthM, depthM) >= INTERIOR_MIN_RUN_M &&
    Math.min(widthM, depthM) >= INTERIOR_MIN_WIDTH_M &&
    heightM >= INTERIOR_MIN_HEIGHT_M
  );
}

/** Standing eye height inside a shell, kept clear of the ceiling. */
export function interiorEyeHeightM(heightM: number): number {
  const eye = THREE.MathUtils.clamp(heightM * 0.6, 1.15, 1.7);
  return Math.max(0.6, Math.min(eye, heightM - 0.45));
}

/**
 * Interior-first load-in framing: stand inside the shell near one end of its
 * long axis at eye height and look down the room, so the environment fills the
 * canvas instead of the sky above an open-topped dollhouse. The camera sits
 * slightly off the centre line for a read that still shows layout depth.
 */
export function interiorFrame(widthM: number, depthM: number, heightM: number): CameraFrame {
  const alongX = widthM >= depthM;
  const runM = alongX ? widthM : depthM;
  const crossM = alongX ? depthM : widthM;

  // Push far enough off the end wall that its opening/partition is behind the
  // camera, but never so far that a short room becomes a close-up.
  const inset = THREE.MathUtils.clamp(runM * 0.08, 0.6, 2.5);
  const nearEnd = -(runM / 2) + inset;
  const farEnd = runM / 2 - Math.max(inset * 0.6, 0.6);
  const crossOffset = Math.min(crossM * 0.2, 1.2);

  const eye = interiorEyeHeightM(heightM);
  const targetY = THREE.MathUtils.clamp(heightM * 0.32, 0.5, 1.15);

  const position = alongX
    ? new THREE.Vector3(nearEnd, eye, -crossOffset)
    : new THREE.Vector3(-crossOffset, eye, nearEnd);
  const target = alongX
    ? new THREE.Vector3(farEnd, targetY, crossOffset * 0.5)
    : new THREE.Vector3(crossOffset * 0.5, targetY, farEnd);

  return { position, target, distance: position.distanceTo(target) };
}

/**
 * Interior navigation volume: the shell footprint pulled in from the walls so
 * orbit targets, walks and flights stay inside the environment instead of
 * drifting over the empty ground outside it.
 */
export function interiorBounds(
  widthM: number,
  depthM: number,
  heightM: number,
  insetM = 0.35,
): InteriorBounds {
  const inset = Math.min(insetM, Math.max(0.1, Math.min(widthM, depthM) / 2 - 0.1));
  return {
    minX: -widthM / 2 + inset,
    maxX: widthM / 2 - inset,
    minZ: -depthM / 2 + inset,
    maxZ: depthM / 2 - inset,
    ceilingM: Math.max(0.8, heightM - 0.25),
  };
}

/**
 * Clip planes and orbit limits for a world view. Enclosed environments trade
 * the wide-open outer range for a close, interior-scale one: a small near
 * plane (the 10 cm voxel grid reads up close) and a max distance that stops at
 * the exterior fit, so zooming out frames the whole environment and never
 * pulls the camera out into the void beyond it.
 */
export function cameraLimits(
  surface: PlanSurface | null | undefined,
  homeDistanceM: number,
  exteriorDistanceM: number,
): CameraLimits {
  if (isEnclosedSurface(surface)) {
    return {
      near: 0.05,
      far: 500,
      minDistance: Math.min(0.35, Math.max(0.15, homeDistanceM * 0.25)),
      maxDistance: Math.max(homeDistanceM * 1.1, exteriorDistanceM),
      maxPolarAngle: THREE.MathUtils.degToRad(88),
    };
  }
  return {
    near: 0.1,
    far: 500,
    minDistance: 2,
    maxDistance: homeDistanceM * 4,
    maxPolarAngle: THREE.MathUtils.degToRad(88),
  };
}
