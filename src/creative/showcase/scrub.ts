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
import { ARCHETYPE_DEFAULTS, cropAssetMap, makeCropFor, makeCropForCustom } from '@/creative/crops/map';
import { STATE_BUILDERS } from '@/creative/crops/states';
import { STATE_HEIGHT_FACTOR, type CropPalette, type PlantStateVisual } from '@/creative/crops/shared';
import { growthToStage, stageCountFor, stressTintMultiplier } from '@/lib/sim/view';

export const GROWTH_SAMPLES = 12;

/** Mirrors templateScaleT (src/three/plants.ts:166) — the linear height ramp
 * (renderer-side math; view.ts owns the projection channels). */
function templateScaleT(progress: number): number {
  return 0.15 + 0.85 * progress;
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
  /** When set, use the archetype's real Tier-2 state geometry if authored
   * (falling back to the Tier-1 tint + pose preview below). */
  geom?: PlantStateVisual;
}

const NEUTRAL: ViewState = { tint: null, droopRad: 0, squashY: 1, uniformScale: 1 };

const LIFECYCLE_STATES: LifecycleState[] = [
  { id: 'healthy', label: 'healthy', ...NEUTRAL },
  { id: 'stressed', label: 'stress tint 0.55', tint: tintTuple(0.55), droopRad: 0.04, squashY: 0.97, uniformScale: 1 },
  { id: 'wilting', label: 'wilting · water 0.8', tint: tintTuple(0.8), droopRad: 0.22, squashY: 0.88, uniformScale: 1 },
  { id: 'dead', label: 'dead · desiccated', geom: 'dead', tint: [0.62, 0.52, 0.38], droopRad: 0.34, squashY: 0.78, uniformScale: 0.92 },
  { id: 'harvested', label: 'harvested · stubble', geom: 'harvested', tint: [0.86, 0.79, 0.62], droopRad: 0.02, squashY: 0.5, uniformScale: 0.72 },
  { id: 'overripe', label: 'overripe · past grace', geom: 'overripe', tint: [0.9, 0.76, 0.5], droopRad: 0.15, squashY: 0.93, uniformScale: 1 },
];

const HELPER_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });

function builderFor(archId: string): { build: (stage: number) => THREE.Object3D } {
  // Crop names (de-cloned specials, e.g. pepper/sunflower) preview through
  // makeCropFor so the tool shows the catalog crop, palette + special and all.
  if (archId in cropAssetMap) {
    return { build: (stage) => makeCropFor(archId, stage) ?? new THREE.Group() };
  }
  // Wave-5 custom-crop token: `custom:<Name>:<category>:<hex>` previews the
  // UNMAPPED-name fallback (makeCropForCustom) — plants.ts renders exactly
  // this path for user-defined crops (ids ≥ 1000), so the sheet proves the
  // fallback never regresses to the pre-voxel primitive look.
  if (archId.startsWith('custom:')) {
    const [, name, category, hex] = archId.split(':');
    return {
      build: (stage) =>
        makeCropForCustom(name ?? 'Custom', category ?? 'vegetable', hex ?? '#4caf50', stage) ?? new THREE.Group(),
    };
  }
  const arch = ARCHETYPES.find((a) => a.id === archId);
  if (!arch) throw new Error(`scrub: unknown crop/archetype "${archId}"`);
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
function makeScrubObject(archId: string, progress: number, state: ViewState & { geom?: PlantStateVisual }, frameBox: THREE.Box3): THREE.Group {
  const root = new THREE.Group();

  // Real Tier-2 state geometry when authored, normalized to the same height
  // factor the renderer uses (plants.ts STATE_HEIGHT_FACTOR). Crop names
  // resolve through makeCropFor (state axis keeps the crop's own palette and
  // applies its catalog scale on top).
  if (state.geom) {
    let plant: THREE.Object3D | null = null;
    if (archId in cropAssetMap) {
      plant = makeCropFor(archId, 5, state.geom);
    } else {
      const builder = STATE_BUILDERS[archId]?.[state.geom];
      if (builder) plant = builder((ARCHETYPE_DEFAULTS as Record<string, CropPalette>)[archId]);
    }
    if (plant) {
      const box = new THREE.Box3().setFromObject(plant);
      const rawH = Math.max(0.01, box.max.y - box.min.y);
      const factor =
        (plant.userData as { heightFactor?: number } | undefined)?.heightFactor ?? STATE_HEIGHT_FACTOR[state.geom];
      const cropScale = cropAssetMap[archId]?.scale ?? 1;
      plant.scale.setScalar((factor / rawH) * cropScale);
      root.add(plant, makeFrameHelper(frameBox));
      return root;
    }
  }

  // Tier-1 preview: stage geometry + tint/droop/squash channels.
  const stage = growthToStage(progress, stageCountFor(archId));
  const plant = builderFor(archId).build(stage);
  const rawH = rawStageHeight(archId, stage);
  const scale = (templateScaleT(progress) / rawH) * state.uniformScale;
  plant.scale.set(scale, scale * state.squashY, scale);
  plant.rotation.z = state.droopRad;
  plant.rotation.x = state.droopRad * 0.35;
  if (state.tint) tintMaterials(plant, state.tint);
  root.add(plant, makeFrameHelper(frameBox));
  return root;
}

function normalizeArchetypeIds(requested: string[]): string[] {
  // Case-insensitive canonical ids: archetype ids + catalog crop names (the
  // Tier-3 specials preview by NAME) — 'sunflower' and 'SUNFLOWER' both
  // resolve to the crop 'Sunflower', never to the tomato fallback.
  const canon = new Map<string, string>();
  for (const a of ARCHETYPES) canon.set(a.id.toLowerCase(), a.id);
  for (const name of Object.keys(cropAssetMap)) canon.set(name.toLowerCase(), name);
  const ids = [
    ...new Set(
      requested
        .map((raw) => raw.trim().replace(/-s\d+$/, ''))
        // custom:<Name>:<category>:<hex> tokens bypass canon (they preview the
        // unmapped-name fallback by construction).
        .map((raw) => (raw.startsWith('custom:') ? raw : (canon.get(raw.toLowerCase()) ?? raw)))
        .filter((id) => id.startsWith('custom:') || canon.has(id.toLowerCase())),
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
