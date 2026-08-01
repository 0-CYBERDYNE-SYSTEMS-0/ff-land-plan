import * as THREE from 'three';
import type { Engine } from './engine';
import type { PlanState } from '@/types';
import type { Crop } from '@/types';

export interface TourWaypoint {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  label?: string;
}

export interface Tour {
  active: boolean;
  progress: number; // 0-1
  waypoints: TourWaypoint[];
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  update: (dt: number) => void;
  dispose: () => void;
}

/** Generate waypoints for a farm tour based on the plan layout. */
export function generateTourWaypoints(
  plan: PlanState,
  _cropById: Map<number, Crop>,
): TourWaypoint[] {
  const cx = 0; // plot center
  const cz = 0;
  const w = plan.widthM;
  const h = plan.heightM;
  const waypoints: TourWaypoint[] = [];

  // 1. Overview from above
  waypoints.push({
    position: new THREE.Vector3(cx, Math.max(w, h) * 0.8, cz + Math.max(w, h) * 0.5),
    lookAt: new THREE.Vector3(cx, 0, cz),
    label: 'Farm Overview',
  });

  // 2. Sweep left to right over crops
  if (Object.keys(plan.planting).length > 0) {
    waypoints.push({
      position: new THREE.Vector3(cx - w * 0.3, 5, cz + h * 0.3),
      lookAt: new THREE.Vector3(cx, 0, cz),
      label: 'Crop Fields',
    });
    waypoints.push({
      position: new THREE.Vector3(cx + w * 0.3, 5, cz - h * 0.3),
      lookAt: new THREE.Vector3(cx, 0, cz),
      label: 'Growing Area',
    });
  }

  // 3. Hover near structures (greenhouse, shed, etc.)
  const structures = Object.entries(plan.ground);
  const specialSlugs = ['greenhouse', 'shed', 'beehive', 'chicken-coop', 'pond', 'trellis'];
  for (const slug of specialSlugs) {
    const cells = structures.filter(([, s]) => s === slug);
    if (cells.length > 0) {
      const key = cells[0][0];
      const [cellX, cellY] = key.split(',').map(Number);
      const sx = cellX * plan.cellM + plan.cellM / 2 - plan.widthM / 2;
      const sz = cellY * plan.cellM + plan.cellM / 2 - plan.heightM / 2;
      waypoints.push({
        position: new THREE.Vector3(sx + 3, 3, sz + 3),
        lookAt: new THREE.Vector3(sx, 0.5, sz),
        label: slug.charAt(0).toUpperCase() + slug.slice(1).replace('-', ' '),
      });
    }
  }

  // 4. Final overview
  waypoints.push({
    position: new THREE.Vector3(cx, Math.max(w, h) * 0.8, cz + Math.max(w, h) * 0.5),
    lookAt: new THREE.Vector3(cx, 0, cz),
    label: 'Tour Complete',
  });

  return waypoints;
}

export function createTour(
  engine: Engine,
  waypoints: TourWaypoint[],
  onEnd?: () => void,
): Tour {
  const { camera, controls } = engine;
  let active = false;
  let progress = 0;
  let currentIdx = 0;
  let curve: THREE.CatmullRomCurve3 | null = null;
  let segmentProgress = 0;
  const segmentDuration = 5; // seconds per segment
  let segmentElapsed = 0;

  function buildCurve(idx: number): THREE.CatmullRomCurve3 {
    const wp = waypoints[idx];
    const next = waypoints[Math.min(idx + 1, waypoints.length - 1)];

    const start = wp.position.clone();
    const end = next.position.clone();

    // Add a slight arc to the path
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y += 2; // arch upward

    return new THREE.CatmullRomCurve3([start, mid, end]);
  }

  function start() {
    if (waypoints.length === 0) return;
    active = true;
    currentIdx = 0;
    segmentElapsed = 0;
    segmentProgress = 0;
    progress = 0;
    curve = buildCurve(0);

    controls.enabled = false;

    const p = curve.getPoint(0);
    camera.position.copy(p);
    camera.lookAt(waypoints[0].lookAt);
  }

  function stop() {
    active = false;
    controls.enabled = true;
    curve = null;
  }

  function next() {
    if (currentIdx < waypoints.length - 1) {
      currentIdx++;
      segmentElapsed = 0;
      segmentProgress = 0;
      curve = buildCurve(currentIdx);
    } else {
      stop();
      onEnd?.();
    }
  }

  function prev() {
    if (currentIdx > 0) {
      currentIdx--;
      segmentElapsed = 0;
      segmentProgress = 0;
      curve = buildCurve(currentIdx);
    }
  }

  function update(dt: number) {
    if (!active || !curve) return;

    segmentElapsed += dt;
    segmentProgress = Math.min(segmentElapsed / segmentDuration, 1);

    const pt = curve.getPoint(segmentProgress);
    camera.position.copy(pt);

    // Smooth lookAt interpolation between current and next waypoint
    const currentWP = waypoints[currentIdx];
    const nextWP = waypoints[Math.min(currentIdx + 1, waypoints.length - 1)];
    const lookTarget = currentWP.lookAt.clone().lerp(nextWP.lookAt, segmentProgress);
    camera.lookAt(lookTarget);

    // Overall progress
    const totalSegments = waypoints.length - 1;
    progress = totalSegments > 0 ? (currentIdx + segmentProgress) / totalSegments : 0;

    if (segmentProgress >= 1) {
      next();
    }
  }

  function dispose() {
    stop();
  }

  return { active, progress, waypoints, start, stop, next, prev, update, dispose };
}
