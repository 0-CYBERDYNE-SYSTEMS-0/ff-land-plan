/**
 * Physical mounting of catalog-backed Environment.instances: floor mounts sit
 * on the floor, growing-level mounts attach exactly at their saved level
 * elevation, and environment mounts honour an explicit elevationM (or the
 * deliberate per-slug default). Deck positions are verified against real
 * built geometry (vertex bands + Box3), not re-derived from scale math.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { buildEnvironmentAssets } from '@/three/structures';
import { makeGrowBench, makeHydroChannel } from '@/creative/structures/equipment';
import { makeHydroRaftAsset } from '@/creative/structures/envEquipment';
import { seedDemoSites } from '@/data/demoWorlds';
import type {
  Environment,
  EnvironmentAssetInstance,
  GrowingSpace,
  GrowingSpaceLevel,
  PlanState,
} from '@/types';

const LEVEL_ELEVATIONS_M = [0.2, 0.65, 1.1, 1.55];

const plan: PlanState = {
  farmId: 9,
  widthM: 4,
  heightM: 4,
  cellM: 0.25,
  allowOutsideBeds: false,
  planting: {},
  ground: {},
  updatedAt: '2026-10-25T00:00:00.000Z',
};

const rackLevels: GrowingSpaceLevel[] = LEVEL_ELEVATIONS_M.map((elevationM, index) => ({
  id: `rack:level:${index + 1}`,
  label: `Level ${index + 1}`,
  elevationM,
}));

function makeEnvironment(
  instances: EnvironmentAssetInstance[],
  growingSpace?: GrowingSpace,
): Environment {
  const space: GrowingSpace = growingSpace ?? {
    id: 'rack',
    label: 'Rack',
    kind: 'rack',
    x: 0.25,
    y: 0.25,
    widthM: 3.5,
    depthM: 0.5,
    levels: rackLevels,
  };
  return {
    id: 'env:mounting',
    farmId: 9,
    archetype: 'warehouse-vertical',
    label: 'Mounting test',
    x: 0,
    y: 0,
    widthM: plan.widthM,
    heightM: plan.heightM,
    cellM: plan.cellM,
    plan,
    layout: {
      access: [],
      reservations: [],
      growingSpaces: [space],
    },
    instances,
  };
}

function buildRoots(environment: Environment) {
  const scene = new THREE.Scene();
  const groups = buildEnvironmentAssets(environment, plan, scene);
  const roots = new Map<string, THREE.Object3D>();
  for (const group of groups) {
    for (const root of group.roots) roots.set(root.name, root);
  }
  return roots;
}

function findRoot(roots: Map<string, THREE.Object3D>, id: string, slug: string): THREE.Object3D {
  const root = roots.get(`asset-instance:${id}:${slug}`);
  expect(root, `scene root for ${id}`).toBeDefined();
  return root!;
}

// --- real-geometry helpers ---------------------------------------------------

interface WorldVertices {
  ys: number[];
  xs: number[];
}

function collectWorldVertices(root: THREE.Object3D): WorldVertices {
  root.updateWorldMatrix(true, true);
  const ys: number[] = [];
  const xs: number[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      v.applyMatrix4(child.matrixWorld);
      xs.push(v.x);
      ys.push(v.y);
    }
  });
  return { ys, xs };
}

interface BandStats {
  count: number;
  span: number;
  width: number;
}

function bandStats(vertices: WorldVertices, bbox: THREE.Box3, targetY: number, windowM = 0.05): BandStats {
  let count = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < vertices.ys.length; i++) {
    if (Math.abs(vertices.ys[i]! - targetY) > windowM) continue;
    count++;
    minX = Math.min(minX, vertices.xs[i]!);
    maxX = Math.max(maxX, vertices.xs[i]!);
  }
  const size = new THREE.Vector3();
  bbox.getSize(size);
  return { count, span: count === 0 ? 0 : maxX - minX, width: size.x };
}

/**
 * A deck is a dense slat band spanning (almost) the whole footprint at the
 * saved elevation; uprights only contribute slim columns. Both facts come
 * from the built geometry — no re-derivation from scale factors.
 */
function expectDeckBandAt(vertices: WorldVertices, bbox: THREE.Box3, elevationM: number, label: string): void {
  const band = bandStats(vertices, bbox, elevationM);
  expect(band.count, `${label} deck band vertices at ${elevationM} m`).toBeGreaterThan(300);
  expect(band.span / band.width, `${label} deck band x-span at ${elevationM} m`).toBeGreaterThan(0.8);
}

/** Horizontal vertex runs at a height — uprights read as separated clusters. */
function xRunsAt(vertices: WorldVertices, targetY: number, windowM = 0.05): number {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < vertices.ys.length; i++) {
    if (Math.abs(vertices.ys[i]! - targetY) <= windowM) pairs.push([vertices.xs[i]!, vertices.ys[i]!]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  let runs = 0;
  let last: number | null = null;
  for (const [x] of pairs) {
    if (last === null || x - last > 0.5) runs++;
    last = x;
  }
  return runs;
}

function geometryVertexCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const position = child.geometry.getAttribute('position');
      if (position) count += position.count;
    }
  });
  return count;
}

function overlapsRect(
  a: { x: number; y: number; widthM: number; depthM: number },
  b: { x: number; y: number; widthM: number; depthM: number },
): boolean {
  return a.x < b.x + b.widthM && a.x + a.widthM > b.x && a.y < b.y + b.depthM && a.y + a.depthM > b.y;
}

describe('buildEnvironmentAssets physical mounting', () => {
  it('places floor mounts on the floor and preserves their physical footprint', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'rack:equipment', slug: 'plant-rack', x: 0.25, y: 0.25, widthM: 3.5, depthM: 0.5, mount: { kind: 'floor' } },
      { id: 'floor:tank', slug: 'co2-tank', x: 3, y: 3, widthM: 0.5, depthM: 0.5, mount: { kind: 'floor' } },
    ]));

    const rack = findRoot(roots, 'rack:equipment', 'plant-rack');
    expect(rack.position.y).toBe(0);
    // The rack Y scale keeps the raw voxel→metre factor so the authored
    // shelves land exactly on the saved level elevations.
    expect(rack.scale.y).toBeCloseTo(0.1, 5);

    const tank = findRoot(roots, 'floor:tank', 'co2-tank');
    expect(tank.position.y).toBe(0);
  });

  it('keeps every rack deck exactly on its saved level elevation', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'rack:equipment', slug: 'plant-rack', x: 0.25, y: 0.25, widthM: 3.5, depthM: 0.5, mount: { kind: 'floor' } },
    ]));
    const rack = findRoot(roots, 'rack:equipment', 'plant-rack');
    const bbox = new THREE.Box3().setFromObject(rack);
    const vertices = collectWorldVertices(rack);

    // Each saved elevation carries a dense full-width slat band in the built
    // geometry — decks render exactly where the levels say, not on the
    // legacy tier ladder.
    for (const elevationM of LEVEL_ELEVATIONS_M) {
      expectDeckBandAt(vertices, bbox, elevationM, 'rack');
    }
    // Rack stays a physical ~2.1 m tall unit, not a 10× squash or stretch.
    expect(bbox.max.y - bbox.min.y).toBeGreaterThan(1.5);
    expect(bbox.max.y - bbox.min.y).toBeLessThan(2.5);
  });

  it('renders nonuniform saved levels exactly and posts long stretched bays', () => {
    // Interactive saved levels need not follow the rack ladder: decks must
    // land wherever they were saved (0.7 m and 0.9 m are off-ladder).
    const nonuniform = [0.25, 0.7, 0.9, 1.6];
    const space: GrowingSpace = {
      id: 'rack',
      label: 'Container rack',
      kind: 'rack',
      x: 0.25,
      y: 0.25,
      widthM: 9,
      depthM: 0.5,
      levels: nonuniform.map((elevationM, index) => ({
        id: `rack:level:${index + 1}`,
        label: `Level ${index + 1}`,
        elevationM,
      })),
    };
    const roots = buildRoots(makeEnvironment([
      { id: 'rack:equipment', slug: 'plant-rack', x: 0.25, y: 0.25, widthM: 9, depthM: 0.5, mount: { kind: 'floor' } },
    ], space));
    const rack = findRoot(roots, 'rack:equipment', 'plant-rack');
    const bbox = new THREE.Box3().setFromObject(rack);
    const vertices = collectWorldVertices(rack);

    for (const elevationM of nonuniform) {
      expectDeckBandAt(vertices, bbox, elevationM, 'container rack');
    }
    // Physical height stays proportional to the top level (1.6 m + header).
    expect(bbox.max.y - bbox.min.y).toBeGreaterThan(1.8);
    expect(bbox.max.y - bbox.min.y).toBeLessThan(2.6);

    // A 9 m bay must not span without posts: between two decks only the
    // uprights reach, and a posted bay shows ~6 separated x clusters
    // (4 corners + intermediate supports) while an unposted one shows 2.
    const midGapY = (nonuniform[1]! + nonuniform[2]!) / 2;
    expect(xRunsAt(vertices, midGapY)).toBeGreaterThanOrEqual(5);
  });

  it('attaches growing-level mounts exactly at their saved level elevation, on every tier', () => {
    const lights: EnvironmentAssetInstance[] = rackLevels.map((level, index) => ({
      id: `rack:light:${index + 1}`,
      slug: 'grow-light',
      x: 0.25,
      y: 0.25,
      widthM: 0.875,
      depthM: 0.5,
      mount: { kind: 'growing-level', growingSpaceId: 'rack', levelId: level.id },
    }));
    const roots = buildRoots(makeEnvironment(lights));

    for (const [index, level] of rackLevels.entries()) {
      const light = findRoot(roots, `rack:light:${index + 1}`, 'grow-light');
      expect(light.position.y, `light on ${level.label}`).toBeCloseTo(level.elevationM, 6);
    }
  });

  it('mounts growing-level lights as compact tier bars that never cross another deck', () => {
    const lights: EnvironmentAssetInstance[] = rackLevels.map((level, index) => ({
      id: `rack:light:${index + 1}`,
      slug: 'grow-light',
      x: 0.25,
      y: 0.25,
      widthM: 0.875,
      depthM: 0.5,
      mount: { kind: 'growing-level', growingSpaceId: 'rack', levelId: level.id },
    }));
    const roots = buildRoots(makeEnvironment(lights));

    for (const [index, level] of rackLevels.entries()) {
      const light = findRoot(roots, `rack:light:${index + 1}`, 'grow-light');
      const bbox = new THREE.Box3().setFromObject(light);
      // Compact suspended bar — not the ~0.87 m floor stand that crossed the
      // shelf above on 0.45 m tier spacing.
      expect(bbox.max.y - bbox.min.y, `light on ${level.label} height`).toBeLessThan(0.45);
      const nextDeck = rackLevels[index + 1]?.elevationM;
      if (nextDeck !== undefined) {
        expect(bbox.max.y, `light on ${level.label} clears the ${nextDeck} m deck`).toBeLessThan(nextDeck - 0.02);
      }
    }
  });

  it('keeps floor and environment grow-lights on the freestanding floor stand', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'floor:light', slug: 'grow-light', x: 2, y: 2, widthM: 0.6, depthM: 0.3, mount: { kind: 'floor' } },
      { id: 'env:light', slug: 'grow-light', x: 1, y: 1, widthM: 0.5, depthM: 0.25, mount: { kind: 'environment' } },
    ]));

    const floorLight = findRoot(roots, 'floor:light', 'grow-light');
    // Floor light bars keep their deliberate 0.85 m hover mount.
    expect(floorLight.position.y).toBeCloseTo(0.85, 6);
    // The freestanding asset keeps its tall floor stand for floor/showcase use.
    const floorBbox = new THREE.Box3().setFromObject(floorLight);
    expect(floorBbox.max.y - floorBbox.min.y).toBeGreaterThan(0.6);

    const envLight = findRoot(roots, 'env:light', 'grow-light');
    expect(envLight.position.y).toBe(1.2);
  });

  it('honours explicit elevationM on environment mounts', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'env:fan', slug: 'clip-fan', x: 0, y: 1.5, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment', elevationM: 1.5 } },
      { id: 'env:hvac', slug: 'hvac-unit', x: 0, y: 3, widthM: 1, depthM: 0.4, mount: { kind: 'environment', elevationM: 1.8 } },
    ]));

    expect(findRoot(roots, 'env:fan', 'clip-fan').position.y).toBe(1.5);
    expect(findRoot(roots, 'env:hvac', 'hvac-unit').position.y).toBe(1.8);
  });

  it('uses deliberate per-slug defaults for environment mounts without an explicit elevation', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'env:fan', slug: 'clip-fan', x: 0, y: 1.5, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment' } },
      { id: 'env:hvac', slug: 'hvac-unit', x: 0, y: 3, widthM: 1, depthM: 0.4, mount: { kind: 'environment' } },
      { id: 'env:co2', slug: 'co2-tank', x: 3, y: 3, widthM: 0.5, depthM: 0.5, mount: { kind: 'environment' } },
      { id: 'env:light', slug: 'grow-light', x: 1, y: 1, widthM: 0.5, depthM: 0.25, mount: { kind: 'environment' } },
    ]));

    expect(findRoot(roots, 'env:fan', 'clip-fan').position.y).toBe(1.2); // canopy height
    expect(findRoot(roots, 'env:hvac', 'hvac-unit').position.y).toBe(1.8); // wall mounted
    expect(findRoot(roots, 'env:co2', 'co2-tank').position.y).toBe(0); // floor level
    expect(findRoot(roots, 'env:light', 'grow-light').position.y).toBe(1.2); // above canopy
  });

  it('preserves physical scale: mounted equipment keeps its authored proportions, not a blanket Y squash', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'env:hvac', slug: 'hvac-unit', x: 0, y: 3, widthM: 1, depthM: 0.4, mount: { kind: 'environment', elevationM: 1.8 } },
      { id: 'env:fan', slug: 'clip-fan', x: 0, y: 1.5, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment', elevationM: 1.5 } },
    ]));

    const hvac = findRoot(roots, 'env:hvac', 'hvac-unit');
    // HVAC authored at a 1 m footprint: x scale is the ~0.1 voxel→metre
    // factor, and Y follows the footprint fit instead of a forced 0.1.
    expect(hvac.scale.x).toBeCloseTo(0.1, 1);
    expect(hvac.scale.y).not.toBe(0.1);
    expect(hvac.scale.y).toBeGreaterThan(0.08);
    expect(hvac.scale.y).toBeLessThan(0.12);
    // Rendered height stays near the authored 0.44 m box.
    const bbox = new THREE.Box3().setFromObject(hvac);
    expect(bbox.max.y - bbox.min.y).toBeGreaterThan(0.3);
    expect(bbox.max.y - bbox.min.y).toBeLessThan(0.6);

    const fan = findRoot(roots, 'env:fan', 'clip-fan');
    // The fan head rides ~1 m above its mount: the built fan stands roughly
    // 0.55–1.1 m tall above the 1.5 m mount point, not the old blanket 0.1
    // Y squash (~0.09 m), and it still fills its saved 0.3 m footprint.
    const fanBbox = new THREE.Box3().setFromObject(fan);
    const fanSize = new THREE.Vector3();
    fanBbox.getSize(fanSize);
    expect(fanSize.y).toBeGreaterThan(0.55);
    expect(fanSize.y).toBeLessThan(1.1);
    expect(fanSize.x).toBeCloseTo(0.3, 1);
    expect(fanSize.z).toBeCloseTo(0.3, 1);
  });

  it('renders planner fixtures without decorative crops', () => {
    const roots = buildRoots(makeEnvironment([
      { id: 'fx:channel', slug: 'hydro-channel', x: 0.25, y: 0.25, widthM: 1.2, depthM: 0.5, mount: { kind: 'floor' } },
      { id: 'fx:bench', slug: 'grow-bench', x: 2, y: 0.25, widthM: 1.2, depthM: 0.6, mount: { kind: 'floor' } },
      { id: 'fx:raft', slug: 'hydro-raft', x: 0.5, y: 1.5, widthM: 2.4, depthM: 1.2, mount: { kind: 'floor' } },
    ]));

    const channel = findRoot(roots, 'fx:channel', 'hydro-channel');
    const bench = findRoot(roots, 'fx:bench', 'grow-bench');
    const raft = findRoot(roots, 'fx:raft', 'hydro-raft');
    const plantedChannel = geometryVertexCount(makeHydroChannel());
    const plantedBench = geometryVertexCount(makeGrowBench());
    const plantedRaft = geometryVertexCount(makeHydroRaftAsset());

    // Planner fixtures drop the baked lettuce / pots / seed trays entirely.
    expect(geometryVertexCount(channel)).toBeLessThan(plantedChannel);
    expect(geometryVertexCount(channel)).toBe(geometryVertexCount(makeHydroChannel(false)));
    expect(geometryVertexCount(bench)).toBeLessThan(plantedBench);
    expect(geometryVertexCount(bench)).toBe(geometryVertexCount(makeGrowBench(false)));
    expect(geometryVertexCount(raft)).toBeLessThan(plantedRaft);
    expect(geometryVertexCount(raft)).toBe(geometryVertexCount(makeHydroRaftAsset(false)));

    // The clean fixtures keep their full structure: the bench still stands
    // ~0.68 m tall with deck and legs, and the channel keeps its sloped body.
    const benchBbox = new THREE.Box3().setFromObject(bench);
    expect(benchBbox.max.y - benchBbox.min.y).toBeGreaterThan(0.55);
    const channelBbox = new THREE.Box3().setFromObject(channel);
    expect(channelBbox.max.y).toBeGreaterThan(0.25);

    // The planner raft is clean at the deck: real merged geometry has no
    // vertices above the net pots (foliage tops out at ~0.35 m voxel world
    // scale; a planted raft reaches ~0.3475 m, the clean one stops at the
    // net pot ~0.285 m). The default showcase maker still bakes foliage.
    const raftVertices = collectWorldVertices(raft);
    const maxPlannerRaftY = Math.max(...raftVertices.ys);
    expect(maxPlannerRaftY, 'planner raft has no foliage above the net pots').toBeLessThan(0.3);
    const showcaseRaft = makeHydroRaftAsset();
    const showcaseBbox = new THREE.Box3().setFromObject(showcaseRaft);
    expect(showcaseBbox.max.y, 'showcase raft still carries decorative lettuce above the deck')
      .toBeGreaterThan(0.31);
    // The clean planner raft still keeps its water, rafts and net-pot holes:
    // the raft deck band sits at the authored 0.22–0.28 m board height.
    expect(maxPlannerRaftY, 'planner raft keeps its raft boards and net pots').toBeGreaterThan(0.22);
  });

  it('lands shipped farm 5/7/8/9 crop decks exactly on their saved level elevations', () => {
    const deckSlugs = ['plant-rack', 'grow-bench', 'hydro-channel', 'hydro-raft'];
    for (const farmId of ['5', '7', '8', '9']) {
      for (const environment of seedDemoSites()[Number(farmId)]!.environments) {
        if (!environment.layout) continue;
        const scene = new THREE.Scene();
        const groups = buildEnvironmentAssets(environment, environment.plan, scene);
        const roots = new Map<string, THREE.Object3D>();
        for (const group of groups) {
          for (const root of group.roots) roots.set(root.name, root);
        }
        for (const space of environment.layout.growingSpaces) {
          const plantedLevelIds = new Set(Object.values(environment.plan.targets ?? {})
            .filter((target) => target.growingSpaceId === space.id && Object.keys(target.planting).length > 0)
            .map((target) => target.levelId));
          for (const level of space.levels) {
            if (!plantedLevelIds.has(level.id)) continue;
            if (space.kind === 'bed') {
              // In-ground beds plant at grade — no lifted crops.
              expect(level.elevationM, `${environment.id} ${space.label} bed at grade`).toBe(0);
              continue;
            }
            const fixture = (environment.instances ?? []).find((instance) =>
              deckSlugs.includes(instance.slug) && overlapsRect(space, instance));
            expect(fixture, `fixture under ${environment.id}/${space.label}`).toBeDefined();
            const root = roots.get(`asset-instance:${fixture!.id}:${fixture!.slug}`);
            expect(root, `built root for ${fixture!.id}`).toBeDefined();
            const bbox = new THREE.Box3().setFromObject(root!);
            const vertices = collectWorldVertices(root!);
            if (fixture!.slug === 'hydro-channel') {
              // NFT channel tops slope 0.26–0.33 m: the channel walls must
              // bracket the saved mid-slope level, and the level must sit on
              // built geometry (within one slope step).
              expect(Math.max(...vertices.ys), `${environment.id} channel top`).toBeGreaterThan(level.elevationM + 0.03);
              expect(Math.max(...vertices.ys), `${environment.id} channel top`).toBeLessThan(level.elevationM + 0.08);
              expect(vertices.ys.some((y) => Math.abs(y - level.elevationM) <= 0.01), `${environment.id} channel surface at level`).toBe(true);
            } else {
              expectDeckBandAt(vertices, bbox, level.elevationM, `${environment.id}/${space.label}`);
            }
          }
        }
      }
    }
  });
});
