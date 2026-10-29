import * as THREE from 'three';

const HOME_AZIMUTH = -Math.PI / 4;
const HOME_POLAR = Math.PI / 3.5;
const HOME_FOV_DEG = 45;
const FRAME_MARGIN = 0.82;

export interface CameraFrame {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
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
