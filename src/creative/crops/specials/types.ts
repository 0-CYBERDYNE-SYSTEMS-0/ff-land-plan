/**
 * Special builder contract (SPEC-GROWTH-VISUAL §2.5 Tier 3): a per-CROP-NAME
 * builder that overrides the archetype dispatch in makeCropFor — for
 * de-cloning catalog crops that share an archetype (pepper/eggplant on
 * tomato, sunflower on corn, the squash family) and per-crop phenology.
 *
 * Signature mirrors the archetype builders: `(stage: 0..5, pal: CropPalette)
 * => THREE.Object3D`, single plant, deterministic (seeded rng only), soil pad
 * + 'sway' group conventions per shared.ts. palette/scale overrides from
 * crops/map.ts still apply on top of the returned object.
 */
import type * as THREE from 'three';
import type { CropPalette } from '../shared';

export type SpecialBuildFn = (stage: number, pal: CropPalette) => THREE.Object3D;
