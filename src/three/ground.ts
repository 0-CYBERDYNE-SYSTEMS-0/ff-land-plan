/**
 * Voxel terrain ground — renders Lane A's creative terrain tiles
 * (src/creative/terrain/) instead of flat colored boxes.
 *
 * Strategy: for each tile type we build ONE merged template BufferGeometry
 * (vertex-colored, baked face shading from the voxel kit), then fill an
 * InstancedMesh with one instance per plan cell. Animated pond parts
 * (shimmer plate / sparkle specks) carry no vertex colors and are skipped —
 * the static water body still renders (acceptable for beta).
 *
 * Heights come from each tile's own geometry: every tile anchors voxel y=0 to
 * the world foundation plane, so grass caps (~y4.5 voxels) sit high, paths
 * (~y3) sit slightly lower, and pond water (~y3.5) reads below turf.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlanState } from '@/types';
import {
  makeGrass01, makeGrass02, makeGrass03, makeGrassFlower,
  makeSoilTilledDry,
  makePathGravelEntry, makePathWoodchipEntry, makePathStoneEntry,
} from '@/creative/terrain/tiles';
import { makeBedRaisedCutaway, makeBedInground } from '@/creative/terrain/beds';
import { makePondCenterEntry } from '@/creative/terrain/water';

export interface GroundBatch {
  mesh: THREE.InstancedMesh;
  count: number;
}

// --- slug → tile-id mapping --------------------------------------------------
//
// Terrain slugs map to real creative tiles. Structure slugs (Lane C owns the
// structures themselves) get an underlay: tilled soil beneath cultivated /
// built plots, grass elsewhere. Unknown slugs fall back to grass.

type TileId =
  | 'grass-01' | 'grass-02' | 'grass-03' | 'grass-flower'
  | 'soil-tilled-dry'
  | 'path-gravel' | 'path-woodchip' | 'path-stone'
  | 'bed-raised' | 'bed-inground'
  | 'pond';

const GRASS_VARIANTS: TileId[] = ['grass-01', 'grass-02', 'grass-03'];

const SLUG_TILES: Record<string, TileId> = {
  'raised-bed': 'bed-raised',
  'inground-bed': 'bed-inground',
  'path-gravel': 'path-gravel',
  'path-woodchip': 'path-woodchip',
  'path-stone': 'path-stone',
  pond: 'pond',
  // structures / equipment that read as cultivated ground
  greenhouse: 'soil-tilled-dry',
  polytunnel: 'soil-tilled-dry',
  'cold-frame': 'soil-tilled-dry',
  shed: 'soil-tilled-dry',
  'compost-bin': 'soil-tilled-dry',
};

/** Slugs whose underlay is plain grass (fence, gate, trellis, fruit-tree, …)
 *  need no entry — anything unmapped resolves through resolveTileId. */

function hash2(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

function resolveTileId(slug: string | null, x: number, z: number): TileId {
  if (slug === null || slug === undefined) {
    // default grass — deterministic variant per cell, occasional flower patch
    const h = hash2(x, z);
    if (h % 19 === 0) return 'grass-flower';
    return GRASS_VARIANTS[h % GRASS_VARIANTS.length] ?? 'grass-01';
  }
  const mapped = SLUG_TILES[slug];
  if (mapped) return mapped;
  if (slug === 'grass') {
    const h = hash2(x, z);
    if (h % 19 === 0) return 'grass-flower';
    return GRASS_VARIANTS[h % GRASS_VARIANTS.length] ?? 'grass-01';
  }
  // any other slug (fence, gate, trellis, fruit-tree, beehive, chicken-coop,
  // rain-barrel, ibc-tote, water-tap, irrigation-line, …): grass underlay;
  // Lane C draws the structure on top.
  const h = hash2(x, z);
  return GRASS_VARIANTS[h % GRASS_VARIANTS.length] ?? 'grass-01';
}

// --- template cache -----------------------------------------------------------

interface TileTemplate {
  geometry: THREE.BufferGeometry;
  /** uniform scale factor mapping tile width → one plan cell */
  baseScale: number;
}

const TILE_MAKERS: Record<TileId, () => THREE.Object3D> = {
  'grass-01': makeGrass01,
  'grass-02': makeGrass02,
  'grass-03': makeGrass03,
  'grass-flower': makeGrassFlower,
  'soil-tilled-dry': makeSoilTilledDry,
  'path-gravel': makePathGravelEntry,
  'path-woodchip': makePathWoodchipEntry,
  'path-stone': makePathStoneEntry,
  'bed-raised': makeBedRaisedCutaway,
  'bed-inground': makeBedInground,
  pond: makePondCenterEntry,
};

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const templateCache = new Map<TileId, TileTemplate>();

function getMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
    });
  }
  return sharedMaterial;
}

/**
 * Build a merged, vertex-colored template geometry for a tile type.
 * Animated/translucent parts (pond shimmer plate, sparkle specks) have no
 * 'color' attribute and are skipped — the static water body remains.
 */
function buildTemplate(id: TileId, cellM: number): TileTemplate {
  const cached = templateCache.get(id);
  if (cached) return cached;

  const root = TILE_MAKERS[id]();
  root.updateMatrixWorld(true);

  const parts: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const geo = mesh.geometry;
    if (!geo.getAttribute('color')) return; // animated / non-voxel part
    const clone = geo.clone();
    clone.applyMatrix4(mesh.matrixWorld);
    parts.push(clone);
  });

  if (parts.length === 0) {
    throw new Error(`ground.ts: tile '${id}' produced no static geometry`);
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) {
    throw new Error(`ground.ts: failed to merge tile geometry for '${id}'`);
  }
  for (let i = 1; i < parts.length; i++) parts[i]?.dispose();

  // uniform scale: tile footprint → plan cell size
  merged.computeBoundingBox();
  const bb = merged.boundingBox ?? new THREE.Box3();
  const size = new THREE.Vector3();
  bb.getSize(size);
  const tileWidth = Math.max(size.x, size.z, 1e-6);
  const baseScale = cellM / tileWidth;

  const template: TileTemplate = { geometry: merged, baseScale };
  templateCache.set(id, template);
  return template;
}

// --- public API ----------------------------------------------------------------

export function buildGround(plan: PlanState, scene: THREE.Scene): GroundBatch[] {
  const cols = Math.round(plan.widthM / plan.cellM);
  const rows = Math.round(plan.heightM / plan.cellM);
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const cellM = plan.cellM;

  // Group cells by resolved tile id
  const cellsByType = new Map<TileId, { x: number; z: number }[]>();
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const slug = plan.ground[`${cx},${cz}`] ?? null;
      const id = resolveTileId(slug, cx, cz);
      const arr = cellsByType.get(id) ?? [];
      arr.push({ x: cx, z: cz });
      cellsByType.set(id, arr);
    }
  }

  const batches: GroundBatch[] = [];
  const dummy = new THREE.Object3D();

  for (const [id, cells] of cellsByType) {
    let template: TileTemplate;
    try {
      template = buildTemplate(id, cellM);
    } catch {
      continue; // a broken tile type must never take down the whole ground
    }
    const material = getMaterial();

    const count = cells.length;
    const mesh = new THREE.InstancedMesh(template.geometry, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    for (let i = 0; i < count; i++) {
      const { x, z } = cells[i];
      const wx = x * cellM + cellM / 2 + offsetX;
      const wz = z * cellM + cellM / 2 + offsetZ;
      // Tiles anchor voxel y=0 to the world foundation plane; surface relief
      // (raised beds proud, ponds sunken) comes from the tile geometry itself.
      dummy.position.set(wx, 0, wz);
      dummy.scale.setScalar(template.baseScale);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    batches.push({ mesh, count });
  }

  return batches;
}

export function updateGround(batches: GroundBatch[], plan: PlanState, scene: THREE.Scene): GroundBatch[] {
  disposeGround(batches);
  return buildGround(plan, scene);
}

export function disposeGround(batches: GroundBatch[]): void {
  for (const batch of batches) {
    batch.mesh.removeFromParent();
    // Template geometry + material are shared across instances/batches and are
    // released once below — never per-instance here.
  }
  batches.length = 0;

  if (templateCache.size > 0) {
    for (const template of templateCache.values()) {
      template.geometry.dispose();
    }
    templateCache.clear();
  }
  if (sharedMaterial) {
    sharedMaterial.dispose();
    sharedMaterial = null;
  }
}
