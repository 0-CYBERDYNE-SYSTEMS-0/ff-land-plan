/**
 * World structures — renders plan.ground asset slugs using the Lane C creative
 * voxel structure builders (src/creative/structures, 1 voxel = 10 cm).
 *
 * Strategy:
 *  - Each structure type's template object is built ONCE (lazily, cached at
 *    module scope). Per-cell instances are `Object3D.clone()`s which share the
 *    template's geometry and materials, so cloning is cheap and we never
 *    dispose shared geometry per instance.
 *  - Templates are authored at ~1 m footprints (1 voxel = 10 cm); plan cells
 *    are typically 0.25 m. Each slug maps to a target world size for its
 *    largest horizontal dimension; the template's bounding box is measured
 *    once and scaled uniformly to hit that target (see TARGET_SIZE_M).
 *  - Instances sit at the cell centre, y=0 base, with a deterministic
 *    hash-based 0/90/180/270° rotation (linear items like fences vary;
 *    gates stay aligned).
 *  - `pond` and `fruit-tree` are skipped here entirely: the pond tile
 *    (src/creative/terrain/water.ts, rendered by src/three/ground.ts) already
 *    draws depth-tinted water, mud banks and cattail reeds, so the old
 *    procedural rock-ring fallback was removed — it only cluttered the
 *    shoreline. Fruit trees are rendered by the crop system.
 */
import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';
import { entries as structureEntries } from '@/creative/structures/registry';

export interface StructureGroup {
  /** Root objects added to the scene (one per placed cell). */
  roots: THREE.Object3D[];
}

// ---------------------------------------------------------------------------
// Slug → creative maker + world scale mapping
// ---------------------------------------------------------------------------

interface SlugMapping {
  /** Registry entry id in src/creative/structures/registry.ts. */
  entryId: string;
  /**
   * Target world size (metres) for the template's largest horizontal
   * dimension after scaling. Plan cells are ~0.25 m:
   *  - big buildings span ~3–4 cells,
   *  - mid props ~2 cells,
   *  - small props ~1–1.5 cells,
   *  - linear items (fence/gate/trellis/irrigation) run ~2 cells so adjacent
   *    fence cells visually connect.
   */
  targetSizeM: number;
}

const SLUG_MAP: Record<string, SlugMapping> = {
  shed:            { entryId: 'shed',           targetSizeM: 0.85 },
  greenhouse:      { entryId: 'greenhouse',     targetSizeM: 1.0 },
  polytunnel:      { entryId: 'polytunnel',     targetSizeM: 0.9 },
  'cold-frame':    { entryId: 'cold-frame',     targetSizeM: 0.5 },
  'chicken-coop':  { entryId: 'chicken-coop',   targetSizeM: 0.75 },
  fence:           { entryId: 'fence-post-rail', targetSizeM: 0.55 },
  gate:            { entryId: 'gate',           targetSizeM: 0.5 },
  trellis:         { entryId: 'trellis',        targetSizeM: 0.5 },
  'compost-bin':   { entryId: 'compost-bin',    targetSizeM: 0.5 },
  'rain-barrel':   { entryId: 'rain-barrel',    targetSizeM: 0.3 },
  'ibc-tote':      { entryId: 'ibc-tote',       targetSizeM: 0.4 },
  'water-tap':     { entryId: 'water-tap',      targetSizeM: 0.3 },
  'irrigation-line': { entryId: 'irrigation-line', targetSizeM: 0.55 },
  beehive:         { entryId: 'beehive',        targetSizeM: 0.3 },
};

/** Slugs whose per-cell rotation varies by hash; everything else stays axis-aligned. */
const ROTATED_SLUGS = new Set(['fence', 'gate', 'trellis', 'irrigation-line']);

/** Deterministic small hash for per-cell rotation picks. */
function hashCell(x: number, z: number): number {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

// ---------------------------------------------------------------------------
// Template cache (shared geometry/materials)
// ---------------------------------------------------------------------------

interface Template {
  obj: THREE.Object3D;
  /** Largest horizontal dimension of the un-scaled template, in metres. */
  sizeM: number;
}

const templateCache = new Map<string, Template>();

function getTemplate(entryId: string): Template | null {
  const cached = templateCache.get(entryId);
  if (cached) return cached;

  const entry = structureEntries.find((e) => e.id === entryId);
  if (!entry) return null;

  const obj = entry.make();
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const sizeM = Math.max(size.x, size.z) || 1;
  const tpl = { obj, sizeM };
  templateCache.set(entryId, tpl);
  return tpl;
}

// ---------------------------------------------------------------------------
// Public API (signature-compatible with the previous implementation)
// ---------------------------------------------------------------------------

export function buildStructures(plan: PlanState, scene: THREE.Scene): StructureGroup[] {
  const cellM = plan.cellM;
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const roots: THREE.Group[] = [];

  const placeRoot = (root: THREE.Object3D, cxWorld: number, czWorld: number): void => {
    root.position.set(cxWorld, 0, czWorld);
    scene.add(root);
    roots.push(root as THREE.Group);
  };

  // Creative-backed slugs — one instance per contiguous cell of that slug.
  for (const [slug, mapping] of Object.entries(SLUG_MAP)) {
    const tpl = getTemplate(mapping.entryId);
    if (!tpl) continue;

    for (const [key] of Object.entries(plan.ground)) {
      if (plan.ground[key] !== slug) continue;
      const [cx, cz] = parseKey(key);
      const wx = cx * cellM + cellM / 2 + offsetX;
      const wz = cz * cellM + cellM / 2 + offsetZ;

      const inst = tpl.obj.clone();
      const scale = mapping.targetSizeM / tpl.sizeM;
      inst.scale.setScalar(scale);
      if (ROTATED_SLUGS.has(slug)) {
        // Deterministic quarter-turn variety; gates stay aligned to paths.
        if (slug !== 'gate') inst.rotation.y = (hashCell(cx, cz) % 4) * (Math.PI / 2);
      }
      placeRoot(inst, wx, wz);
    }
  }

  // 'pond' is intentionally not placed here — the terrain pond tile from
  // src/three/ground.ts covers it (see header note).

  return [{ roots }];
}

export function updateStructures(batches: StructureGroup[], plan: PlanState, scene: THREE.Scene): StructureGroup[] {
  disposeStructures(batches);
  return buildStructures(plan, scene);
}

export function disposeStructures(batches: StructureGroup[]): void {
  for (const batch of batches) {
    for (const root of batch.roots) {
      // Clones share geometry/materials with the cached templates, so we only
      // detach them from the scene.
      root.removeFromParent();
    }
    batch.roots.length = 0;
  }
}
