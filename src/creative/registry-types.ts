import * as THREE from 'three';

/** Per-cell studio light rig handed to an entry's optional `tune` hook. */
export interface StudioRig {
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

/**
 * One showcaseable asset. `make()` must return a fresh object each call and be
 * deterministic. Optional `tick(obj, tSec, dtSec)` runs every frame for idle
 * animation (mutate transforms only — no allocations). Optional `tune(rig)`
 * adjusts this cell's lights once at setup (lighting presets, moods).
 */
export interface AssetEntry {
  id: string;
  label: string;
  make: () => THREE.Object3D;
  tick?: (obj: THREE.Object3D, t: number, dt: number) => void;
  tune?: (rig: StudioRig) => void;
}
