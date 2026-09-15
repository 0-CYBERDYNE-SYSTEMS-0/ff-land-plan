/**
 * World structures — renders plan.ground asset slugs using the Lane C creative
 * voxel structure builders (src/creative/structures, 1 voxel = 10 cm).
 *
 * Strategy:
 *  - Each structure type's template object is built ONCE (lazily, cached at
 *    module scope). Instances are `Object3D.clone()`s which share the
 *    template's geometry and materials, so cloning is cheap and we never
 *    dispose shared geometry per instance.
 *  - Templates are authored at ~1 m footprints (1 voxel = 10 cm). Each slug
 *    maps to a target world size for its largest horizontal dimension; the
 *    template's bounding box is measured once and scaled uniformly to hit
 *    that target. At cache time each template is RE-CENTRED so its footprint
 *    centre sits at the origin (builders anchor voxels at a corner, e.g. the
 *    polytunnel spans 0..+Z); clones inherit that offset. y is untouched so
 *    instances keep sitting at y=0 base.
 *
 *  - Region merge (audit finding A6): NON-linear slugs emit ONE instance per
 *    CONTIGUOUS REGION of same-slug cells (deterministic BFS flood fill,
 *    anchor = lexicographically-first cell), centred on the region's bounding
 *    box. Before this fix one instance was placed PER CELL, so a painted
 *    footprint rendered dozens–hundreds of overlapping copies (seed farm 1:
 *    64 overlapping sheds). Target sizes for non-linear slugs are DERIVED
 *    from the designer record (`assetLibrary`: Math.max(defaultWM, defaultHM))
 *    as an upper bound, then SHRUNK-TO-FIT the painted region's actual
 *    footprint (floored at 0.5 so tiny paintings stay recognizable) and the
 *    instance centre CLAMPED inside the plot bounds — structures may overlap
 *    paths and beds, but never float off the platform into the void.
 *  - LINEAR slugs (fence, picket-fence, gate, trellis, irrigation-line) KEEP
 *    per-cell placement at connective sizes (~0.5–0.55 m) so adjacent
 *    segments visually tile into continuous runs.
 *  - Instances sit at y=0 base. Linear items get a deterministic hash-based
 *    0/90/180/270° rotation variety; everything else stays axis-aligned.
 *  - `pond` is skipped here entirely: the pond tile (src/creative/terrain/water.ts,
 *    rendered by src/three/ground.ts) already draws depth-tinted water, mud banks
 *    and cattail reeds, so the old procedural rock-ring fallback was removed — it
 *    only cluttered the shoreline. `fruit-tree` renders a dedicated orchard tree.
 */
import * as THREE from 'three';
import type { PlanState } from '@/types';
import { parseKey } from '@/lib/plan';
import { assetBySlug } from '@/data/assets';
import { entries as structureEntries } from '@/creative/structures/registry';

export interface StructureGroup {
  /** Root objects added to the scene (one per linear cell / merged region). */
  roots: THREE.Object3D[];
}

// ---------------------------------------------------------------------------
// Slug → creative maker + world scale mapping
// ---------------------------------------------------------------------------

interface SlugMapping {
  /** Registry entry id in src/creative/structures/registry.ts. */
  entryId: string;
  /**
   * Connective per-cell size in metres — ONLY set for linear slugs, whose
   * segments must overlap slightly to read as one run (~0.5–0.55 m).
   * Non-linear slugs omit it: their target size is derived from the designer
   * record in `assetLibrary` (Math.max(defaultWM, defaultHM)) as an upper
   * bound; instances then shrink to fit the painted region (see
   * buildStructures).
   */
  targetSizeM?: number;
  /**
   * Linear items (fences, gate, trellis, irrigation lines) stay PER CELL so
   * segments visually connect; everything else merges into regions.
   */
  linear?: boolean;
  /** Mount height above the floor (mounted equipment, e.g. LED bars). */
  yOffsetM?: number;
}

const SLUG_MAP: Record<string, SlugMapping> = {
  // Non-linear — one instance per contiguous region, sized from assetLibrary.
  shed:            { entryId: 'shed' },
  greenhouse:      { entryId: 'greenhouse' },
  polytunnel:      { entryId: 'polytunnel' },
  'cold-frame':    { entryId: 'cold-frame' },
  'chicken-coop':  { entryId: 'chicken-coop' },
  barn:            { entryId: 'barn' },
  'hay-bale':      { entryId: 'hay-bale' },
  'crate-stack':   { entryId: 'crate-stack' },
  signpost:        { entryId: 'signpost' },
  scarecrow:       { entryId: 'scarecrow' },
  'compost-bin':   { entryId: 'compost-bin' },
  'rain-barrel':   { entryId: 'rain-barrel' },
  'ibc-tote':      { entryId: 'ibc-tote' },
  'water-tap':     { entryId: 'water-tap' },
  beehive:         { entryId: 'beehive' },
  'grow-tent':     { entryId: 'grow-tent' },
  'fruit-tree':    { entryId: 'fruit-tree' },
  // Equipment — light bars & NFT channels are linear so rows tile; racks,
  // benches, fans and HVAC are one instance per contiguous region.
  'grow-light':    { entryId: 'grow-light', targetSizeM: 0.6, linear: true, yOffsetM: 0.85 },
  'plant-rack':    { entryId: 'plant-rack' },
  'hydro-channel': { entryId: 'hydro-channel', targetSizeM: 0.55, linear: true },
  'clip-fan':      { entryId: 'clip-fan' },
  'hvac-unit':     { entryId: 'hvac-unit' },
  'grow-bench':    { entryId: 'grow-bench' },
  // Environment equipment — one instance per contiguous region (research Part B).
  'fish-tank':     { entryId: 'fish-tank' },
  'hydro-raft':    { entryId: 'hydro-raft' },
  'dehumidifier':  { entryId: 'dehumidifier' },
  'seedling-tray': { entryId: 'seedling-tray' },
  'co2-tank':      { entryId: 'co2-tank' },
  // Linear — connective per-cell placement so runs read continuously.
  fence:           { entryId: 'fence-post-rail', targetSizeM: 0.55, linear: true },
  'picket-fence':  { entryId: 'fence-picket', targetSizeM: 0.55, linear: true },
  gate:            { entryId: 'gate', targetSizeM: 0.5, linear: true },
  trellis:         { entryId: 'trellis', targetSizeM: 0.5, linear: true },
  'irrigation-line': { entryId: 'irrigation-line', targetSizeM: 0.55, linear: true },
};

/** Slugs whose per-cell rotation varies by hash; everything else stays axis-aligned. */
const ROTATED_SLUGS = new Set(['fence', 'picket-fence', 'gate', 'trellis', 'irrigation-line']);

/** Deterministic small hash for per-cell rotation picks. */
function hashCell(x: number, z: number): number {
  let h = x * 374761393 + z * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

/** Fallback when a designer record is missing (should not happen). */
const FALLBACK_SIZE_M = 0.5;

/**
 * Floor for region shrink-to-fit: a very small painting shrinks its structure
 * at most to half the record-derived size so it stays recognizable.
 */
const MIN_FIT_SCALE = 0.5;

/** Target world size for a slug: explicit for linear items, else the designer record. */
function resolveTargetSizeM(slug: string, mapping: SlugMapping): number {
  if (mapping.targetSizeM !== undefined) return mapping.targetSizeM;
  const record = assetBySlug(slug);
  if (!record) return FALLBACK_SIZE_M;
  const derived = Math.max(record.defaultWM, record.defaultHM);
  return derived > 0 ? derived : FALLBACK_SIZE_M;
}

/**
 * Group same-slug cell keys into 4-connected contiguous regions.
 * Deterministic: anchors are visited in lexicographically-sorted key order,
 * so the partition (and root order) is stable regardless of plan insertion
 * order. Returns regions as lists of "x,y" keys.
 */
function contiguousRegions(keys: string[]): string[][] {
  const remaining = new Set(keys);
  const regions: string[][] = [];
  const anchors = [...keys].sort();
  for (const anchor of anchors) {
    if (!remaining.has(anchor)) continue;
    remaining.delete(anchor);
    const region: string[] = [];
    const queue: string[] = [anchor];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      region.push(key);
      const [cx, cz] = parseKey(key);
      for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
        const nk = `${nx},${nz}`;
        if (remaining.has(nk)) {
          remaining.delete(nk);
          queue.push(nk);
        }
      }
    }
    regions.push(region.sort());
  }
  return regions.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Template cache (shared geometry/materials)
// ---------------------------------------------------------------------------

interface Template {
  obj: THREE.Object3D;
  /** Per-axis bbox size of the un-scaled template, in metres. */
  size: THREE.Vector3;
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
  // Measure FIRST (object at identity), then re-centre: builders anchor voxels
  // at a corner (e.g. the polytunnel spans 0..+Z with tie-down pegs at −x), but
  // instances are placed at a region's centre, so the template's footprint
  // CENTRE must sit at the origin. y is untouched — instances sit at y=0 base
  // (yOffsetM lifts at placement). No-op for builders that already centre.
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  const sizeM = Math.max(size.x, size.z) || 1;
  const tpl = { obj, size, sizeM };
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

  const placeRoot = (root: THREE.Object3D, cxWorld: number, czWorld: number, yWorld = 0): void => {
    root.position.set(cxWorld, yWorld, czWorld);
    scene.add(root);
    roots.push(root as THREE.Group);
  };

  // Index ground cells by mapped slug in ONE pass (order-independent).
  const keysBySlug = new Map<string, string[]>();
  for (const [key, slug] of Object.entries(plan.ground)) {
    if (!SLUG_MAP[slug]) continue;
    let list = keysBySlug.get(slug);
    if (!list) {
      list = [];
      keysBySlug.set(slug, list);
    }
    list.push(key);
  }

  for (const [slug, mapping] of Object.entries(SLUG_MAP)) {
    const keys = keysBySlug.get(slug);
    if (!keys || keys.length === 0) continue;
    const tpl = getTemplate(mapping.entryId);
    if (!tpl) continue;

    const scaleBase = resolveTargetSizeM(slug, mapping) / tpl.sizeM;

    if (mapping.linear) {
      // Connective per-cell placement — segments must visually tile.
      for (const key of keys.sort()) {
        const [cx, cz] = parseKey(key);
        const wx = cx * cellM + cellM / 2 + offsetX;
        const wz = cz * cellM + cellM / 2 + offsetZ;
        const inst = tpl.obj.clone();
        inst.scale.setScalar(scaleBase);
        if (ROTATED_SLUGS.has(slug) && slug !== 'gate') {
          // Deterministic quarter-turn variety; gates stay aligned to paths.
          inst.rotation.y = (hashCell(cx, cz) % 4) * (Math.PI / 2);
        }
        placeRoot(inst, wx, wz, mapping.yOffsetM);
      }
    } else {
      // ONE instance per contiguous region, centred on the region's bbox.
      for (const region of contiguousRegions(keys)) {
        let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;
        for (const key of region) {
          const [cx, cz] = parseKey(key);
          if (cx < minCx) minCx = cx;
          if (cx > maxCx) maxCx = cx;
          if (cz < minCz) minCz = cz;
          if (cz > maxCz) maxCz = cz;
        }
        const wx = ((minCx + maxCx + 1) / 2) * cellM + offsetX;
        const wz = ((minCz + maxCz + 1) / 2) * cellM + offsetZ;
        const inst = tpl.obj.clone();
        // Shrink-to-fit: scaleBase ignores the painted region's actual size,
        // so a small painting of a big structure would overflow. Shrink only
        // (never grow above the record-derived size — keeps voxel density
        // crisp), floored at MIN_FIT_SCALE.
        const regionW = (maxCx - minCx + 1) * cellM;
        const regionH = (maxCz - minCz + 1) * cellM;
        const fit = Math.min(
          1,
          regionW / (tpl.size.x * scaleBase),
          regionH / (tpl.size.z * scaleBase)
        );
        const scale = scaleBase * Math.max(fit, MIN_FIT_SCALE);
        inst.scale.setScalar(scale);
        // Clamp the centre so the scaled bbox stays on the platform. If the
        // instance is wider than the plot itself, centre it instead.
        const halfX = (tpl.size.x * scale) / 2;
        const halfZ = (tpl.size.z * scale) / 2;
        const px = 2 * halfX >= plan.widthM
          ? offsetX + plan.widthM / 2
          : Math.min(Math.max(wx, offsetX + halfX), -offsetX - halfX);
        const pz = 2 * halfZ >= plan.heightM
          ? offsetZ + plan.heightM / 2
          : Math.min(Math.max(wz, offsetZ + halfZ), -offsetZ - halfZ);
        placeRoot(inst, px, pz, mapping.yOffsetM);
      }
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
