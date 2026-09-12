/**
 * Showcase scrub mode — continuous growth + lifecycle-state preview cells.
 *
 * Tooling for quality/SPEC-GROWTH-VISUAL.md. For each requested crop archetype
 * this module synthesizes showcase cells for
 *   (1) the continuous growth range: GROWTH_SAMPLES cells across biomass 0..1,
 *       each showing the discrete stage geometry the renderer swaps plus the
 *       linear height ramp plants.ts applies between keyframes, and
 *   (2) the lifecycle state channels (healthy / stress tint / wilting / dead /
 *       harvested / overripe) as Tier-1-style previews (tint + droop + squash).
 *
 * The height-scale math mirrors the live renderer (plants.ts, noted per
 * function); stage selection and tint curves come from the REAL projection
 * module (src/lib/sim/view.ts) so the tool previews actual pipeline math.
 *
 * Deterministic: pure functions of the seeded archetype builders — no rng, no
 * Math.random. Showcase-only; nothing here is imported by the app.
 */
import * as THREE from 'three';
import type { AssetEntry } from '@/creative/registry-types';
import { ARCHETYPES } from '@/creative/crops/registry';
import { growthToStage, stressTintMultiplier } from '@/lib/sim/view';

export const GROWTH_SAMPLES = 12;

/** Mirrors templateScaleT (src/three/plants.ts:166) — the linear height ramp
 * (renderer-side math; view.ts owns the projection channels). */
function templateScaleT(progress: number): number {
  return 0.15 + 0.85 * progress;
}

/** Per-archetype visual keyframe counts (SPEC-GROWTH-VISUAL §2.4) — bump as
 * waves 2–3 add builder keyframes; 6 = today's library. */
const SCRUB_STAGE_COUNTS: Record<string, number> = {};

function stageCountFor(archId: string): number {
  return SCRUB_STAGE_COUNTS[archId] ?? 6;
}

/** Real stress tint from the projection seam (view.ts), as a tuple. */
function tintTuple(stress: number): [number, number, number] {
  const m = stressTintMultiplier(stress);
  return [m.r, m.g, m.b];
}

interface ViewState {
  tint: [number, number, number] | null;
  droopRad: number;
  squashY: number;
  uniformScale: number;
}

interface LifecycleState extends ViewState {
  id: string;
  label: string;
}

const NEUTRAL: ViewState = { tint: null, droopRad: 0, squashY: 1, uniformScale: 1 };

const LIFECYCLE_STATES: LifecycleState[] = [
  { id: 'healthy', label: 'healthy', ...NEUTRAL },
  { id: 'stressed', label: 'stress tint 0.55', tint: tintTuple(0.55), droopRad: 0.04, squashY: 0.97, uniformScale: 1 },
  { id: 'wilting', label: 'wilting · water 0.8', tint: tintTuple(0.8), droopRad: 0.22, squashY: 0.88, uniformScale: 1 },
  { id: 'dead', label: 'dead · desiccated (T2 pending)', tint: [0.62, 0.52, 0.38], droopRad: 0.34, squashY: 0.78, uniformScale: 0.92 },
  { id: 'harvested', label: 'harvested · stubble (T2 pending)', tint: [0.86, 0.79, 0.62], droopRad: 0.02, squashY: 0.5, uniformScale: 0.72 },
  { id: 'overripe', label: 'overripe · past grace', tint: [0.9, 0.76, 0.5], droopRad: 0.15, squashY: 0.93, uniformScale: 1 },
];

const HELPER_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

function builderFor(archId: string) {
  const arch = ARCHETYPES.find((a) => a.id === archId);
  if (!arch) throw new Error(`scrub: unknown crop archetype "${archId}"`);
  return arch;
}

const stageHeightCache = new Map<string, number>();

/** Raw builder height of a stage (builders sit base-anchored at y=0). Cached per session. */
function rawStageHeight(archId: string, stage: number): number {
  const key = `${archId}|${stage}`;
  const hit = stageHeightCache.get(key);
  if (hit !== undefined) return hit;
  const obj = builderFor(archId).build(stage);
  const box = new THREE.Box3().setFromObject(obj);
  const h = Math.max(0.01, box.max.y - box.min.y);
  stageHeightCache.set(key, h);
  return h;
}

/**
 * Invisible sizing helper: every scrub cell of an archetype carries one so all
 * its cells share the camera framing of the healthy harvest-ready silhouette
 * (Box3.setFromObject ignores .visible, so the hidden box still drives layout).
 */
function makeFrameHelper(frameBox: THREE.Box3): THREE.Mesh {
  const size = frameBox.getSize(new THREE.Vector3());
  const center = frameBox.getCenter(new THREE.Vector3());
  const helper = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), HELPER_MATERIAL);
  helper.position.copy(center);
  helper.visible = false;
  return helper;
}

/** Healthy s5 silhouette normalized by the renderer's height ramp, for framing. */
function healthyFrameBox(archId: string): THREE.Box3 {
  const rawH5 = rawStageHeight(archId, 5);
  const obj = builderFor(archId).build(5);
  const box = new THREE.Box3().setFromObject(obj);
  box.min.multiplyScalar(templateScaleT(1) / rawH5);
  box.max.multiplyScalar(templateScaleT(1) / rawH5);
  return box;
}

function tintMaterials(root: THREE.Object3D, tint: [number, number, number]): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const cloneMaterial = (m: THREE.Material): THREE.Material => {
      const clone = m.clone();
      const colored = clone as THREE.Material & { color?: THREE.Color };
      if (colored.color) colored.color.setRGB(tint[0], tint[1], tint[2]);
      return clone;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(cloneMaterial)
      : cloneMaterial(node.material);
  });
}

/**
 * One scrub cell object: the stage geometry for `progress`, scaled exactly the
 * way plants.ts composes template normalization × per-instance growth scale
 * (final height ∝ templateScaleT(progress)), with the state channel's tint,
 * base-anchored droop/lean and Y squash applied on top.
 */
function makeScrubObject(archId: string, progress: number, state: ViewState, frameBox: THREE.Box3): THREE.Group {
  const stage = growthToStage(progress, stageCountFor(archId));
  const plant = builderFor(archId).build(stage);
  const rawH = rawStageHeight(archId, stage);
  const scale = (templateScaleT(progress) / rawH) * state.uniformScale;
  plant.scale.set(scale, scale * state.squashY, scale);
  plant.rotation.z = state.droopRad;
  plant.rotation.x = state.droopRad * 0.35;
  if (state.tint) tintMaterials(plant, state.tint);
  const root = new THREE.Group();
  root.add(plant, makeFrameHelper(frameBox));
  return root;
}

function normalizeArchetypeIds(requested: string[]): string[] {
  const valid = new Set(ARCHETYPES.map((a) => a.id));
  const ids = [
    ...new Set(
      requested
        .map((raw) => raw.trim().toLowerCase().replace(/-s\d+$/, ''))
        .filter((id) => valid.has(id)),
    ),
  ];
  return ids.length > 0 ? ids : ['tomato'];
}

/** Scrub cells for the requested archetypes: 12 growth samples + 6 lifecycle states each. */
export function makeScrubEntries(requested: string[]): AssetEntry[] {
  const entries: AssetEntry[] = [];
  for (const archId of normalizeArchetypeIds(requested)) {
    const frameBox = healthyFrameBox(archId);
    for (let i = 0; i < GROWTH_SAMPLES; i++) {
      const t = i / (GROWTH_SAMPLES - 1);
      const stage = growthToStage(t, stageCountFor(archId));
      entries.push({
        id: `scrub-${archId}-g${String(i).padStart(2, '0')}`,
        label: `${archId} · growth ${t.toFixed(2)} · stage ${stage}`,
        make: () => makeScrubObject(archId, t, NEUTRAL, frameBox),
      });
    }
    for (const state of LIFECYCLE_STATES) {
      entries.push({
        id: `scrub-${archId}-x-${state.id}`,
        label: `${archId} · ${state.label}`,
        make: () => makeScrubObject(archId, 1, state, frameBox),
      });
    }
  }
  return entries;
}
