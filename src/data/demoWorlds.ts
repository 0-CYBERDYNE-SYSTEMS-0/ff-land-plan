import { cropLibrary } from '@/data/crops';
import { templates } from '@/data/templates';
import { archetypes } from '@/creative/archetypes';
import { environmentForTemplate } from '@/lib/template-plan';
import { growingTargetKey } from '@/lib/growingTargets';
import { makeEnvironment, siteForEnvironments } from '@/lib/environment-model';
import type { ArchetypeId, Environment, EnvironmentAssetInstance, GrowingSpace, GrowingTargetPlan, PlanState, SitePlan } from '@/types';
import { ARCHETYPE_FOR_SURFACE } from '@/creative/archetypes';
import { seedPlans } from '@/data/seed';

const DEMO_PREFIX = 'demo:v3';
const RACK_GROUND_ASSETS = new Set([
  'plant-rack', 'grow-light', 'clip-fan', 'hvac-unit', 'co2-tank', 'seedling-tray',
  'hydro-raft', 'crate-stack',
]);
const SPACE_ASSETS: Record<string, GrowingSpace['kind']> = {
  'plant-rack': 'rack',
  'grow-bench': 'bench',
  'hydro-channel': 'hydro',
  'inground-bed': 'bed',
};
const EQUIPMENT_ASSETS = new Set([
  'grow-light', 'clip-fan', 'hvac-unit', 'co2-tank', 'seedling-tray', 'hydro-raft',
  'crate-stack', 'water-tap', 'ibc-tote', 'signpost', 'irrigation-line',
]);

/**
 * Saved level elevations are the actual crop support surfaces of the fixture
 * that renders the space: rack decks on the rack ladder, the grow-bench deck
 * top (voxel 6 → 0.6 m), the NFT channel top band mid-slope (~0.3 m of its
 * 0.26–0.33 m run) and grade for in-ground beds.
 */
const SUPPORT_ELEVATIONS_M: Record<GrowingSpace['kind'], number[]> = {
  rack: [0.2, 0.65, 1.1, 1.55],
  bench: [0.6],
  hydro: [0.3],
  bed: [0],
};

function cleanPlan(plan: PlanState): PlanState {
  const next = structuredClone(plan);
  delete next.surface;
  return next;
}

function seededEnvironment(
  farmId: number,
  id: string,
  label: string,
  archetype: ArchetypeId,
  sourcePlan: PlanState,
): Environment {
  const plan = cleanPlan(sourcePlan);
  const environment = makeEnvironment(farmId, {
    archetype,
    label,
    widthM: plan.widthM,
    heightM: plan.heightM,
    cellM: plan.cellM,
  }, id, plan.updatedAt);
  // Existing demo canvases are legacy interiors. Their exact painted cells
  // stay usable; new worlds created from profiles receive access defaults.
  delete environment.layout;
  return { ...environment, plan };
}

/**
 * Group the ground cells of one slug into contiguous rectangles (top-left,
 * size and member cells). Exported so tests can derive layout expectations from
 * the shipped plan instead of hard-coding coordinates.
 */
export function groundRectangles(plan: PlanState, slug: string) {
  const remaining = new Set(Object.entries(plan.ground).filter(([, value]) => value === slug).map(([key]) => key));
  const rectangles: Array<{ cells: string[]; x: number; y: number; width: number; height: number }> = [];
  while (remaining.size > 0) {
    const start = [...remaining].sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ay! - by! || ax! - bx!;
    })[0]!;
    const cells: string[] = [];
    const queue = [start];
    remaining.delete(start);
    while (queue.length > 0) {
      const key = queue.pop()!;
      cells.push(key);
      const [x, y] = key.split(',').map(Number);
      for (const neighbor of [`${x! - 1},${y}`, `${x! + 1},${y}`, `${x},${y! - 1}`, `${x},${y! + 1}`]) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    const coords = cells.map((key) => key.split(',').map(Number));
    const x = Math.min(...coords.map(([column]) => column!));
    const y = Math.min(...coords.map(([, row]) => row!));
    const maxX = Math.max(...coords.map(([column]) => column!));
    const maxY = Math.max(...coords.map(([, row]) => row!));
    rectangles.push({ cells, x, y, width: maxX - x + 1, height: maxY - y + 1 });
  }
  return rectangles;
}

function enrichSeededEnvironment(farmId: number, environment: Environment, sourcePlan: PlanState): Environment {
  if (![5, 6, 7, 8].includes(farmId)) return environment;
  const plan = cleanPlan(sourcePlan);
  const spaces: GrowingSpace[] = [];
  const targets: Record<string, GrowingTargetPlan> = {};
  const instances: EnvironmentAssetInstance[] = [];
  const cellM = plan.cellM;
  const hasGrowLights = Object.values(plan.ground).includes('grow-light');
  let spaceIndex = 0;
  let instanceIndex = 0;
  const addSpace = (slug: string, rect: ReturnType<typeof groundRectangles>[number]) => {
    const kind = SPACE_ASSETS[slug]!;
    const id = `${DEMO_PREFIX}:${farmId}:space:${slug}:${++spaceIndex}`;
    const rack = kind === 'rack';
    const levels = SUPPORT_ELEVATIONS_M[kind].map((elevationM, index) => ({
      id: `${id}:level:${index + 1}`,
      label: rack ? `Level ${index + 1}` : kind === 'bench' ? 'Bench top' : kind === 'hydro' ? 'Channel' : 'Bed',
      elevationM,
    }));
    const space: GrowingSpace = {
      id,
      label: `${kind === 'rack' ? 'Rack' : kind === 'bench' ? 'Bench' : kind === 'hydro' ? 'Hydro channel' : 'Soil bed'} ${spaceIndex}`,
      kind,
      x: rect.x * cellM,
      y: rect.y * cellM,
      widthM: rect.width * cellM,
      depthM: rect.height * cellM,
      levels,
    };
    spaces.push(space);
    addInstance(instances, `${id}:structure`, slug, space.x, space.y, space.widthM, space.depthM, { kind: 'floor' });
    for (const key of rect.cells) {
      delete plan.ground[key];
      const cropId = plan.planting[key];
      if (cropId === undefined) continue;
      delete plan.planting[key];
      const [, localRow] = key.split(',').map(Number);
      const level = rack ? levels[(localRow! - rect.y) % 2 === 0 ? 0 : 2]! : levels[0]!;
      const targetRef = { kind: 'growing-level' as const, growingSpaceId: id, levelId: level.id };
      const targetKey = growingTargetKey(targetRef);
      const target = targets[targetKey] ?? (targets[targetKey] = { growingSpaceId: id, levelId: level.id, planting: {} });
      target.planting[key] = cropId;
      const plantedAt = sourcePlan.plantedAt?.[key];
      if (plantedAt) (target.plantedAt ??= {})[key] = plantedAt;
      delete plan.plantedAt?.[key];
    }
    if (hasGrowLights && (rack || kind === 'bench' || kind === 'hydro')) {
      for (const level of levels) {
        if (rack || Object.values(targets).some((target) => target.growingSpaceId === id && target.levelId === level.id)) {
          const lightsPerLevel = Math.ceil((space.widthM * space.depthM) / 0.5);
          const segmentWidthM = space.widthM / lightsPerLevel;
          for (let lightIndex = 0; lightIndex < lightsPerLevel; lightIndex += 1) {
          addInstance(
            instances,
            `${id}:light:${level.id}:${lightIndex + 1}`,
            'grow-light',
            space.x + lightIndex * segmentWidthM,
            space.y,
            segmentWidthM,
            space.depthM,
            { kind: 'growing-level', growingSpaceId: id, levelId: level.id },
          );
          }
        }
      }
    }
    return rect;
  };

  for (const slug of Object.keys(SPACE_ASSETS)) {
    for (const rect of groundRectangles(plan, slug)) addSpace(slug, rect);
  }
  for (const slug of EQUIPMENT_ASSETS) {
    for (const rect of groundRectangles(plan, slug)) {
      for (const key of rect.cells) delete plan.ground[key];
      if (slug === 'grow-light') continue;
      addInstance(
        instances,
        `${DEMO_PREFIX}:${farmId}:instance:${slug}:${++instanceIndex}`,
        slug,
        rect.x * cellM,
        rect.y * cellM,
        rect.width * cellM,
        rect.height * cellM,
        { kind: slug === 'clip-fan' || slug === 'hvac-unit' || slug === 'co2-tank' || slug === 'signpost' ? 'environment' : 'floor' },
      );
    }
  }
  plan.targets = targets;
  return {
    ...environment,
    plan,
    layout: { access: [], reservations: [], growingSpaces: spaces },
    instances,
  };
}

function baseDemoEnvironment(farmId: number, plan: PlanState): Environment {
  const archetype = ARCHETYPE_FOR_SURFACE[plan.surface ?? 'outdoor'];
  const environment = seededEnvironment(farmId, `${DEMO_PREFIX}:${farmId}:base`, archetypes[archetype].label, archetype, plan);
  return enrichSeededEnvironment(farmId, environment, plan);
}

function templateEnvironment(
  farmId: number,
  id: string,
  label: string,
  archetype: ArchetypeId,
  templateId: string,
): Environment {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) throw new Error(`Missing demo template: ${templateId}`);
  const environment = makeEnvironment(farmId, {
    archetype,
    label,
    widthM: template.widthM ?? archetypes[archetype].defaultFootprint.wM,
    heightM: template.heightM ?? archetypes[archetype].defaultFootprint.hM,
    cellM: 0.25,
  }, id);
  return environmentForTemplate(environment, template, cropLibrary).environment;
}

function addInstance(
  instances: EnvironmentAssetInstance[],
  id: string,
  slug: string,
  x: number,
  y: number,
  widthM: number,
  depthM: number,
  mount: EnvironmentAssetInstance['mount'],
): void {
  instances.push({ id, slug, x, y, widthM, depthM, mount });
}

/**
 * The relocated DWC raft: one clear aisle stall in the first bay, sized to the
 * seeded raft crop block. Kept as data so the demo test can assert against it.
 */
export const WAREHOUSE_RAFT = {
  x: 7,
  y: 3,
  widthM: 2.4,
  depthM: 1.2,
  levelElevationM: 0.22,
  cropColumns: 4,
} as const;

/**
 * The vertical-farm hall: every contiguous rack run painted in the seed plan
 * becomes a rack growing space, and the clear gap between the two runs of a row
 * becomes the hall's aisle reservation. Spaces therefore follow the shipped
 * layout at any canvas size (3 x 2 bays = 36 x 20 m) instead of being pinned to
 * one 12 m hall, and no seeded crop is dropped.
 */
function tieredWarehouse(): Environment {
  const farmId = 9;
  const source = seedPlans[farmId]!;
  const plan = cleanPlan(source);
  const cellM = plan.cellM;

  const rackRects = groundRectangles(plan, 'plant-rack');
  const spaces: GrowingSpace[] = [];
  const targets: NonNullable<PlanState['targets']> = {};
  const instances: EnvironmentAssetInstance[] = [];
  const rackCellKeys = new Set<string>();
  const reservations: NonNullable<Environment['layout']>['reservations'] = [];
  let instanceIndex = 0;

  rackRects.forEach((rect, rectIndex) => {
    for (const key of rect.cells) rackCellKeys.add(key);
    const id = `${DEMO_PREFIX}:9:rack:${rectIndex + 1}`;
    const levels = SUPPORT_ELEVATIONS_M.rack.map((elevationM, index) => ({
      id: `${id}:level:${index + 1}`,
      label: `Level ${index + 1}`,
      elevationM,
    }));
    // Alternating target levels keep the runs visually distinct, as before.
    const targetLevel = levels[rectIndex % 2 === 0 ? 0 : 2]!;
    const space: GrowingSpace = {
      id,
      label: `Rack run ${rectIndex + 1}`,
      kind: 'rack',
      x: rect.x * cellM,
      y: rect.y * cellM,
      widthM: rect.width * cellM,
      depthM: rect.height * cellM,
      levels,
    };
    spaces.push(space);
    addInstance(instances, `${id}:equipment`, 'plant-rack', space.x, space.y, space.widthM, space.depthM, { kind: 'floor' });
    for (const level of levels) {
      const lightsPerLevel = Math.ceil((space.widthM * space.depthM) / 0.5);
      const segmentWidthM = space.widthM / lightsPerLevel;
      for (let lightIndex = 0; lightIndex < lightsPerLevel; lightIndex += 1) {
        addInstance(
          instances,
          `${id}:led:${level.id}:${lightIndex + 1}`,
          'grow-light',
          space.x + lightIndex * segmentWidthM,
          space.y,
          segmentWidthM,
          space.depthM,
          { kind: 'growing-level', growingSpaceId: id, levelId: level.id },
        );
      }
    }

    // Every seeded crop on this run moves onto its target level.
    const planting: Record<string, number> = {};
    const plantedAt: Record<string, string> = {};
    for (const key of rect.cells) {
      const cropId = plan.planting[key];
      if (cropId === undefined) continue;
      planting[key] = cropId;
      const at = plan.plantedAt?.[key];
      if (at) plantedAt[key] = at;
    }
    if (Object.keys(planting).length > 0) {
      targets[growingTargetKey({ kind: 'growing-level', growingSpaceId: id, levelId: targetLevel.id })] = {
        growingSpaceId: id,
        levelId: targetLevel.id,
        planting,
        ...(Object.keys(plantedAt).length > 0 ? { plantedAt } : {}),
      };
    }
  });

  // The gap between the two rack runs of a row is the walkway down that row.
  const runsByRow = new Map<number, typeof rackRects>();
  for (const rect of rackRects) {
    const row = runsByRow.get(rect.y);
    if (row) row.push(rect);
    else runsByRow.set(rect.y, [rect]);
  }
  for (const [y, runs] of runsByRow) {
    const sorted = [...runs].sort((a, b) => a.x - b.x);
    for (let index = 0; index + 1 < sorted.length; index += 2) {
      const left = sorted[index]!;
      const right = sorted[index + 1]!;
      const gapCells = right.x - (left.x + left.width);
      if (gapCells <= 0) continue;
      reservations.push({
        id: `${DEMO_PREFIX}:9:aisle:${y}:${index / 2 + 1}`,
        kind: 'aisle',
        x: (left.x + left.width) * cellM,
        y: y * cellM,
        widthM: gapCells * cellM,
        depthM: left.height * cellM,
      });
    }
  }

  // Everything that was not on a rack row is the seeded raft bed; it moves onto
  // the relocated DWC raft in the first bay.
  const raftSpaceId = `${DEMO_PREFIX}:9:hydro-raft`;
  const raftLevelId = `${raftSpaceId}:level:1`;
  const raftCrops = Object.entries(plan.planting)
    .filter(([key]) => !rackCellKeys.has(key))
    .map(([key, cropId]) => ({ key, cropId, plantedAt: plan.plantedAt?.[key] }))
    .sort((a, b) => {
      const [ax, ay] = a.key.split(',').map(Number);
      const [bx, by] = b.key.split(',').map(Number);
      return ay! - by! || ax! - bx!;
    });
  const originX = Math.round(WAREHOUSE_RAFT.x / cellM);
  const originY = Math.round(WAREHOUSE_RAFT.y / cellM);
  const raftPlanting: Record<string, number> = {};
  const raftPlantedAt: Record<string, string> = {};
  raftCrops.forEach((entry, index) => {
    const key = `${originX + (index % WAREHOUSE_RAFT.cropColumns)},${originY + Math.floor(index / WAREHOUSE_RAFT.cropColumns)}`;
    raftPlanting[key] = entry.cropId;
    if (entry.plantedAt) raftPlantedAt[key] = entry.plantedAt;
  });
  if (Object.keys(raftPlanting).length > 0) {
    targets[growingTargetKey({ kind: 'growing-level', growingSpaceId: raftSpaceId, levelId: raftLevelId })] = {
      growingSpaceId: raftSpaceId,
      levelId: raftLevelId,
      planting: raftPlanting,
      ...(Object.keys(raftPlantedAt).length > 0 ? { plantedAt: raftPlantedAt } : {}),
    };
  }

  const raftSpace: GrowingSpace = {
    id: raftSpaceId,
    label: 'Deep-water raft',
    kind: 'hydro',
    x: WAREHOUSE_RAFT.x,
    y: WAREHOUSE_RAFT.y,
    widthM: WAREHOUSE_RAFT.widthM,
    depthM: WAREHOUSE_RAFT.depthM,
    // Raft boards float at 0.22 m — crops root through the board top, not
    // the pond liner below it.
    levels: [{ id: raftLevelId, label: 'Raft surface', elevationM: WAREHOUSE_RAFT.levelElevationM }],
  };
  const raftLightCount = Math.ceil((raftSpace.widthM * raftSpace.depthM) / 0.5);
  const raftLightWidth = raftSpace.widthM / raftLightCount;
  for (let index = 0; index < raftLightCount; index += 1) {
    addInstance(
      instances,
      `${raftSpaceId}:light:${index + 1}`,
      'grow-light',
      raftSpace.x + index * raftLightWidth,
      raftSpace.y,
      raftLightWidth,
      raftSpace.depthM,
      { kind: 'growing-level', growingSpaceId: raftSpaceId, levelId: raftLevelId },
    );
  }
  addInstance(instances, `${DEMO_PREFIX}:9:raft`, 'hydro-raft', raftSpace.x, raftSpace.y, raftSpace.widthM, raftSpace.depthM, { kind: 'floor' });

  // Wall and service equipment derived from the painted equipment rectangles:
  // fans, HVAC and CO2 keep their mounts (environment) and floors stay floors.
  const environmentMounted = new Set(['clip-fan', 'hvac-unit', 'co2-tank', 'signpost']);
  for (const slug of EQUIPMENT_ASSETS) {
    if (slug === 'grow-light') continue; // per-level lights, built above
    if (slug === 'hydro-raft') continue; // the relocated raft, built above
    for (const rect of groundRectangles(plan, slug)) {
      addInstance(
        instances,
        `${DEMO_PREFIX}:9:instance:${slug}:${++instanceIndex}`,
        slug,
        rect.x * cellM,
        rect.y * cellM,
        rect.width * cellM,
        rect.height * cellM,
        { kind: environmentMounted.has(slug) ? 'environment' : 'floor' },
      );
    }
  }

  // The plan itself becomes an empty hall floor: ground equipment and crops
  // live on growing levels now.
  for (const [key, slug] of Object.entries(plan.ground)) {
    if (RACK_GROUND_ASSETS.has(slug)) delete plan.ground[key];
  }
  for (const key of Object.keys(plan.planting)) delete plan.planting[key];
  delete plan.plantedAt;
  plan.targets = targets;

  const environment = makeEnvironment(farmId, {
    archetype: 'warehouse-vertical',
    label: 'Vertical Greens Warehouse',
    widthM: plan.widthM,
    heightM: plan.heightM,
    usableHeightM: 4,
    cellM: plan.cellM,
  }, `${DEMO_PREFIX}:9:warehouse-tiered`, plan.updatedAt);
  return {
    ...environment,
    plan,
    layout: {
      ...environment.layout!,
      growingSpaces: [...spaces, raftSpace],
      reservations,
    },
    instances,
  };
}

const farm3Updates = [
  templateEnvironment(3, `${DEMO_PREFIX}:3:garden`, 'Backyard Garden Beds', 'garden-beds', 'salad-garden'),
  templateEnvironment(3, `${DEMO_PREFIX}:3:greenhouse`, 'Backyard Glasshouse', 'greenhouse-glass', 'greenhouse-benches'),
  templateEnvironment(3, `${DEMO_PREFIX}:3:cold-frame`, 'Backyard Cold Frame', 'cold-frame', 'cold-frame-salads'),
];

const farm9Updates = [
  tieredWarehouse(),
  templateEnvironment(9, `${DEMO_PREFIX}:9:container`, 'Container Farm Greens', 'container-farm', 'container-farm-greens'),
];

export const updatedDemoWorlds: Record<number, Environment[]> = {
  3: farm3Updates,
  5: [baseDemoEnvironment(5, seedPlans[5]!)],
  6: [baseDemoEnvironment(6, seedPlans[6]!)],
  7: [baseDemoEnvironment(7, seedPlans[7]!)],
  8: [baseDemoEnvironment(8, seedPlans[8]!)],
  9: farm9Updates,
};

/** Missing, versioned demo worlds only. Existing world content is never replaced. */
export function missingUpdatedDemoWorlds(farmId: number, site: SitePlan | null | undefined): Environment[] {
  const existing = new Set(site?.environments.map((environment) => environment.id) ?? []);
  const right = Math.max(0, ...(site?.environments.map((environment) => environment.x + environment.widthM) ?? []));
  let x = right > 0 ? right + 0.25 : 0;
  return (updatedDemoWorlds[farmId] ?? [])
    .filter((environment) => !existing.has(environment.id))
    .map((environment) => {
      const placed = { ...structuredClone(environment), x, y: 0 };
      x += placed.widthM + 0.25;
      return placed;
    });
}

export function seedDemoSites(): Record<number, SitePlan> {
  const environmentsByFarm = new Map<number, Environment[]>();
  for (const [key, plan] of Object.entries(seedPlans)) {
    const farmId = Number(key);
    if (farmId === 9) continue;
    environmentsByFarm.set(farmId, [baseDemoEnvironment(farmId, plan)]);
  }
  const backyard = environmentsByFarm.get(3)![0]!;
  let nextBackyardX = backyard.x + backyard.widthM + 0.25;
  environmentsByFarm.set(3, [
    structuredClone(backyard),
    ...farm3Updates.map((environment) => {
      const placed = { ...structuredClone(environment), x: nextBackyardX, y: 0 };
      nextBackyardX += placed.widthM + 0.25;
      return placed;
    }),
  ]);
  // Farm 9 holds the vertical-farm hall plus the container farm beside it; the
  // container's x follows the hall's real width so a bigger hall cannot overlap.
  const warehouse = tieredWarehouse();
  environmentsByFarm.set(9, [
    warehouse,
    { ...structuredClone(farm9Updates[1]!), x: warehouse.x + warehouse.widthM + 0.25, y: 0 },
  ]);

  return Object.fromEntries([...environmentsByFarm].map(([farmId, environments]) => [
    farmId,
    siteForEnvironments(farmId, environments),
  ]));
}
