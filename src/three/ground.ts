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
import { archetypes } from '@/creative/archetypes';
import type { ArchetypeId, PlanState, PlanSurface } from '@/types';
import {
  makeGrass01, makeGrass02, makeGrass03, makeGrassFlower,
  makeSoilTilledDry,
  makePathGravelEntry, makePathWoodchipEntry, makePathStoneEntry,
} from '@/creative/terrain/tiles';
import { makeBedRaisedCutaway, makeBedInground } from '@/creative/terrain/beds';
import { makePondCenterEntry } from '@/creative/terrain/water';
import { makeFloorMylar, makeFloorConcrete, makeFloorGreenhouse } from '@/creative/terrain/floors';

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
  | 'pond'
  | 'floor-mylar' | 'floor-concrete' | 'floor-greenhouse';

const GRASS_VARIANTS: TileId[] = ['grass-01', 'grass-02', 'grass-03'];

/**
 * Interior floor tiles are a surface sheet over a slab skirt that only exists
 * so a diorama shows its cut edge. An enclosed world renders that skirt once
 * per plan cell and can never show it, so it bakes the surface layer alone
 * (see VoxelCullOptions.floorOnly).
 */
const FLOOR_ONLY_TILES: ReadonlySet<TileId> = new Set<TileId>([
  'floor-mylar', 'floor-concrete', 'floor-greenhouse',
]);

/** Default underlay tile per plan surface — enclosed canvases never show grass.
 * Hoophouse grows in ground soil beds (tilled dry); warehouse is a concrete
 * hall floor (tape lines come from the shell/props, not the tile). */
const SURFACE_FLOOR: Record<PlanSurface, TileId | null> = {
  outdoor: null,
  greenhouse: 'floor-greenhouse',
  hoophouse: 'soil-tilled-dry',
  tent: 'floor-mylar',
  indoor: 'floor-concrete',
  warehouse: 'floor-concrete',
};

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
  'grow-tent': 'soil-tilled-dry',
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

function resolveTileId(
  slug: string | null,
  x: number,
  z: number,
  surface: PlanSurface = 'outdoor',
  floorOverride?: TileId | null,
): TileId {
  const floor = floorOverride !== undefined
    ? floorOverride
    : Object.prototype.hasOwnProperty.call(SURFACE_FLOOR, surface) ? SURFACE_FLOOR[surface] : null;
  if (slug === null || slug === undefined) {
    // Enclosed surfaces tile their own floor; outdoors it's grass.
    if (floor) return floor;
    // default grass — deterministic variant per cell, occasional flower patch
    const h = hash2(x, z);
    if (h % 19 === 0) return 'grass-flower';
    return GRASS_VARIANTS[h % GRASS_VARIANTS.length] ?? 'grass-01';
  }
  const mapped = SLUG_TILES[slug];
  if (mapped) return mapped;
  if (slug === 'grass' && !floor) {
    const h = hash2(x, z);
    if (h % 19 === 0) return 'grass-flower';
    return GRASS_VARIANTS[h % GRASS_VARIANTS.length] ?? 'grass-01';
  }
  // Any other unmapped slug: enclosed surfaces keep their floor underlay;
  // outdoors it's grass and Lane C draws the structure on top.
  return floor ?? (GRASS_VARIANTS[hash2(x, z) % GRASS_VARIANTS.length] ?? 'grass-01');
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
  'floor-mylar': makeFloorMylar,
  'floor-concrete': makeFloorConcrete,
  'floor-greenhouse': makeFloorGreenhouse,
};

let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const templateCache = new Map<string, TileTemplate>();

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

/** Face order produced by buildVoxelGeometry: +X, -X, +Y, -Y, +Z, -Z. */
const VOXEL_FACE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
/** buildVoxelGeometry emits 6 quads of 4 unique corners per voxel. */
const VOXEL_VERTEX_COUNT = 24;
const GRID_EPSILON = 1e-3;

export interface VoxelCullOptions {
  /**
   * Keep only the tile's top surface layer.
   *
   * The interior floor tiles model a surface sheet over a perimeter skirt that
   * exists so a diorama shows the slab's cut edge. An enclosed plan renders
   * that skirt once per plan cell (thousands of copies of a 3 cm edge nobody
   * can walk under) and never shows it: the shell stands on grade and the
   * camera is held above the floor. Dropping it keeps the visible surface
   * pixel-identical.
   */
  floorOnly?: boolean;
}

/**
 * Bake a voxel tile down to the faces that can actually be seen.
 *
 * Tiles are built as one box per voxel with no shared vertices and no
 * neighbour awareness, so a voxel pressed against another still contributes
 * both of the coincident quads between them. This pass rebuilds the geometry
 * from the voxel grid, drops every face that borders another grid voxel inside
 * the same tile, and optionally drops everything below the surface layer.
 *
 * Only exact matches count: a face is dropped when its own voxel and the voxel
 * one unit along that face are both full-size and grid-aligned. Decorations
 * (fractional voxels, off-grid detail) never cull and are never culled.
 *
 * Exported for the ground geometry-budget test; production callers go through
 * buildTemplate.
 */
export function cullVoxelFaces(
  source: THREE.BufferGeometry,
  options: VoxelCullOptions = {},
): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const color = source.getAttribute('color');
  const index = source.getIndex();
  if (!index || !position || !normal || !color) return source;

  const vertexCount = position.count;
  if (vertexCount === 0 || vertexCount % VOXEL_VERTEX_COUNT !== 0) return source;
  const boxCount = vertexCount / VOXEL_VERTEX_COUNT;

  // Voxel bounds: [minX, maxX, minY, maxY, minZ, maxZ] per voxel.
  const bounds = new Float32Array(boxCount * 6);
  const isGrid = new Uint8Array(boxCount);
  const gridFaces = new Uint8Array(boxCount);
  for (let box = 0; box < boxCount; box++) {
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    for (let v = box * VOXEL_VERTEX_COUNT; v < (box + 1) * VOXEL_VERTEX_COUNT; v++) {
      const x = position.getX(v);
      const y = position.getY(v);
      const z = position.getZ(v);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const base = box * 6;
    bounds[base] = minX; bounds[base + 1] = maxX;
    bounds[base + 2] = minY; bounds[base + 3] = maxY;
    bounds[base + 4] = minZ; bounds[base + 5] = maxZ;
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const centreZ = (minZ + maxZ) / 2;
    const unit = Math.abs(maxX - minX - 1) < GRID_EPSILON
      && Math.abs(maxY - minY - 1) < GRID_EPSILON
      && Math.abs(maxZ - minZ - 1) < GRID_EPSILON;
    const aligned = Math.abs(centreX - Math.round(centreX)) < GRID_EPSILON
      && Math.abs(centreY - Math.round(centreY)) < GRID_EPSILON
      && Math.abs(centreZ - Math.round(centreZ)) < GRID_EPSILON;
    isGrid[box] = unit && aligned ? 1 : 0;
    gridFaces[box] = isGrid[box]!;
  }

  const kept = new Uint8Array(boxCount).fill(1);
  if (options.floorOnly) {
    let topY = -Infinity;
    for (let box = 0; box < boxCount; box++) {
      if (!isGrid[box]) continue;
      const centreY = (bounds[box * 6 + 2]! + bounds[box * 6 + 3]!) / 2;
      if (centreY > topY) topY = centreY;
    }
    if (Number.isFinite(topY)) {
      for (let box = 0; box < boxCount; box++) {
        if (!isGrid[box]) continue;
        const centreY = (bounds[box * 6 + 2]! + bounds[box * 6 + 3]!) / 2;
        if (centreY < topY - GRID_EPSILON) kept[box] = 0;
      }
    }
  }

  const occupied = new Set<string>();
  for (let box = 0; box < boxCount; box++) {
    if (!kept[box] || !isGrid[box]) continue;
    const base = box * 6;
    occupied.add(`${(bounds[base]! + bounds[base + 1]!) / 2},${(bounds[base + 2]! + bounds[base + 3]!) / 2},${(bounds[base + 4]! + bounds[base + 5]!) / 2}`);
  }

  const emitFace = new Uint8Array(boxCount * 6).fill(1);
  for (let box = 0; box < boxCount; box++) {
    if (!kept[box] || !isGrid[box]) continue; // decorations keep every face
    const base = box * 6;
    const centreX = (bounds[base]! + bounds[base + 1]!) / 2;
    const centreY = (bounds[base + 2]! + bounds[base + 3]!) / 2;
    const centreZ = (bounds[base + 4]! + bounds[base + 5]!) / 2;
    for (let face = 0; face < VOXEL_FACE_DIRS.length; face++) {
      const dir = VOXEL_FACE_DIRS[face]!;
      if (occupied.has(`${centreX + dir[0]},${centreY + dir[1]},${centreZ + dir[2]}`)) emitFace[base + face] = 0;
    }
  }

  const idx = index.array;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const remap = new Map<number, number>();
  let droppedAnything = false;
  const mapVertex = (v: number): number => {
    const existing = remap.get(v);
    if (existing !== undefined) return existing;
    const next = positions.length / 3;
    positions.push(position.getX(v), position.getY(v), position.getZ(v));
    normals.push(normal.getX(v), normal.getY(v), normal.getZ(v));
    colors.push(color.getX(v), color.getY(v), color.getZ(v));
    remap.set(v, next);
    return next;
  };

  for (let tri = 0; tri < idx.length / 3; tri++) {
    const a = idx[tri * 3]!;
    const b = idx[tri * 3 + 1]!;
    const c = idx[tri * 3 + 2]!;
    const box = Math.floor(a / VOXEL_VERTEX_COUNT);
    const face = Math.floor((a % VOXEL_VERTEX_COUNT) / 4);
    const sameBox = Math.floor(b / VOXEL_VERTEX_COUNT) === box && Math.floor(c / VOXEL_VERTEX_COUNT) === box;
    const sameFace = sameBox
      && Math.floor((b % VOXEL_VERTEX_COUNT) / 4) === face
      && Math.floor((c % VOXEL_VERTEX_COUNT) / 4) === face;
    if (sameFace) {
      if (!kept[box] || !emitFace[box * 6 + face]) {
        droppedAnything = true;
        continue;
      }
    } else if (!kept[box]) {
      droppedAnything = true;
      continue;
    }
    indices.push(mapVertex(a), mapVertex(b), mapVertex(c));
  }
  if (!droppedAnything) return source;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  return out;
}

/**
 * Build a merged, vertex-colored template geometry for a tile type.
 * Animated/translucent parts (pond shimmer plate, sparkle specks) have no
 * 'color' attribute and are skipped — the static water body remains.
 */
function buildTemplate(id: TileId, cellM: number, floorOnly: boolean): TileTemplate {
  const cacheKey = floorOnly ? `${id}|floor` : id;
  const cached = templateCache.get(cacheKey);
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

  const culled = cullVoxelFaces(merged, { floorOnly });
  if (culled !== merged) merged.dispose();

  // uniform scale: tile footprint → plan cell size
  culled.computeBoundingBox();
  const bb = culled.boundingBox ?? new THREE.Box3();
  const size = new THREE.Vector3();
  bb.getSize(size);
  const tileWidth = Math.max(size.x, size.z, 1e-6);
  const baseScale = cellM / tileWidth;

  const template: TileTemplate = { geometry: culled, baseScale };
  templateCache.set(cacheKey, template);
  return template;
}

// --- public API ----------------------------------------------------------------

export function buildGround(plan: PlanState, scene: THREE.Scene, archetypeId?: ArchetypeId | null): GroundBatch[] {
  const cols = Math.round(plan.widthM / plan.cellM);
  const rows = Math.round(plan.heightM / plan.cellM);
  const offsetX = -(plan.widthM / 2);
  const offsetZ = -(plan.heightM / 2);
  const cellM = plan.cellM;

  // Group cells by resolved tile id
  const surface = plan.surface ?? 'outdoor';
  const archetype = archetypeId && Object.prototype.hasOwnProperty.call(archetypes, archetypeId)
    ? archetypes[archetypeId]
    : undefined;
  const floorOverride = archetype?.floorTile === null ? null
    : typeof archetype?.floorTile === 'string' && Object.prototype.hasOwnProperty.call(TILE_MAKERS, archetype.floorTile)
      ? archetype.floorTile as TileId
      : undefined;
  const cellsByType = new Map<TileId, { x: number; z: number }[]>();
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const slug = plan.ground[`${cx},${cz}`] ?? null;
      const id = resolveTileId(slug, cx, cz, surface, floorOverride);
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
      template = buildTemplate(id, cellM, FLOOR_ONLY_TILES.has(id));
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

export function updateGround(
  batches: GroundBatch[],
  plan: PlanState,
  scene: THREE.Scene,
  archetypeId?: ArchetypeId | null,
): GroundBatch[] {
  disposeGround(batches);
  return buildGround(plan, scene, archetypeId);
}

export function disposeGround(batches: GroundBatch[]): void {
  for (const batch of batches) {
    batch.mesh.removeFromParent();
    batch.mesh.dispose(); // frees the per-instance matrix buffer; geometry/material stay shared
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
