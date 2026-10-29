import { archetypes, ARCHETYPE_FOR_SURFACE, LEGACY_SURFACE_FOR_ARCHETYPE, planningProfiles } from '@/creative/archetypes';
import { growingTargetKey } from '@/lib/growingTargets';
import type {
  ArchetypeId,
  CreateEnvironmentInput,
  Environment,
  EnvironmentLayout,
  EnvironmentSnapshot,
  PlanState,
  SitePlan,
} from '@/types';

export const DEFAULT_CELL_M = 0.25;

function isArchetypeId(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(archetypes, value);
}

export interface EnvironmentStoreShape {
  version?: number;
  plans?: Record<number, PlanState>;
  sites?: Record<number, SitePlan>;
  selectedEnvironmentIds?: Record<number, string>;
}

function planWithoutSurface(plan: PlanState): PlanState {
  const next: PlanState = {
    ...plan,
    planting: { ...plan.planting },
    ground: { ...plan.ground },
    ...(plan.targets ? { targets: structuredClone(plan.targets) } : {}),
    ...(plan.plantedAt ? { plantedAt: { ...plan.plantedAt } } : {}),
  };
  delete next.surface;
  return next;
}

export function normalizeEnvironment(environment: Environment, alignDimensions = false): Environment {
  const archetypeId = isArchetypeId(environment.archetype) ? environment.archetype : 'open-field';
  const cellM = environment.cellM > 0 ? environment.cellM : DEFAULT_CELL_M;
  const widthM = alignDimensions
    ? Math.max(cellM, Math.round(environment.widthM / cellM) * cellM)
    : environment.widthM;
  const heightM = alignDimensions
    ? Math.max(cellM, Math.round(environment.heightM / cellM) * cellM)
    : environment.heightM;
  const plan = planWithoutSurface(environment.plan);
  let layout = environment.layout ? structuredClone(environment.layout) : undefined;
  if (layout) {
    const targets = { ...plan.targets };
    layout = {
      ...layout,
      growingSpaces: layout.growingSpaces.map((space) => ({
        ...space,
        levels: space.levels.map((level) => {
          const { planting: legacyPlanting, plantedAt: legacyPlantedAt, ...geometry } = level;
          if (legacyPlanting || legacyPlantedAt) {
            const key = growingTargetKey({ kind: 'growing-level', growingSpaceId: space.id, levelId: level.id });
            const existing = targets[key];
            const planting = { ...legacyPlanting, ...existing?.planting };
            const plantedAt = { ...legacyPlantedAt, ...existing?.plantedAt };
            targets[key] = {
              growingSpaceId: space.id,
              levelId: level.id,
              planting,
              ...(Object.keys(plantedAt).length > 0 ? { plantedAt } : {}),
            };
          }
          return geometry;
        }),
      })),
    };
    if (Object.keys(targets).length > 0) plan.targets = targets;
  }
  if (layout && alignDimensions) {
    layout.access = layout.access.flatMap((item) => {
      const edgeLength = item.edge === 'north' || item.edge === 'south' ? widthM : heightM;
      const openingWidth = Math.min(item.widthM, edgeLength);
      return [{ ...item, widthM: openingWidth, offsetM: Math.min(Math.max(0, item.offsetM), edgeLength - openingWidth) }];
    });
    layout.reservations = layout.reservations.flatMap((item) => {
      const edge = item.edge;
      const x = edge === 'west' ? 0
        : edge === 'east' ? widthM - item.widthM
          : edge ? item.offsetM ?? item.x : Math.min(Math.max(0, item.x), widthM);
      const y = edge === 'north' ? 0
        : edge === 'south' ? heightM - item.depthM
          : edge ? item.offsetM ?? item.y : Math.min(Math.max(0, item.y), heightM);
      const boundedX = Math.min(Math.max(0, x), widthM);
      const boundedY = Math.min(Math.max(0, y), heightM);
      const reservationWidth = Math.min(item.widthM, widthM - boundedX);
      const depthM = Math.min(item.depthM, heightM - boundedY);
      if (reservationWidth <= 0 || depthM <= 0) return [];
      return [{ ...item, x: boundedX, y: boundedY, widthM: reservationWidth, depthM }];
    });
  }
  return {
    ...environment,
    archetype: archetypeId,
    widthM,
    heightM,
    cellM,
    plan: {
      ...plan,
      farmId: environment.farmId,
      widthM,
      heightM,
      cellM,
    },
    ...(layout ? { layout } : {}),
    ...(environment.instances ? { instances: structuredClone(environment.instances) } : {}),
    ...(environment.setpoints ? { setpoints: { ...environment.setpoints } } : {}),
  };
}

export function environmentSnapshot(environment: Environment): EnvironmentSnapshot {
  const { plan, ...metadata } = environment;
  void plan;
  return structuredClone(metadata);
}

export function legacyPlanForEnvironment(environment: Environment): PlanState {
  return {
    ...structuredClone(environment.plan),
    surface: Object.prototype.hasOwnProperty.call(LEGACY_SURFACE_FOR_ARCHETYPE, environment.archetype)
      ? LEGACY_SURFACE_FOR_ARCHETYPE[environment.archetype]
      : 'outdoor',
  };
}

function environmentForLegacyPlan(farmId: number, legacy: PlanState): Environment {
  const rawSurface = legacy.surface as string | undefined;
  const archetypeId = rawSurface && Object.prototype.hasOwnProperty.call(ARCHETYPE_FOR_SURFACE, rawSurface)
    ? ARCHETYPE_FOR_SURFACE[rawSurface as keyof typeof ARCHETYPE_FOR_SURFACE]
    : 'open-field';
  const archetype = archetypes[archetypeId];
  return normalizeEnvironment({
    id: `env:${farmId}:1`,
    farmId,
    archetype: archetype.id,
    label: archetype.label,
    x: 0,
    y: 0,
    widthM: legacy.widthM,
    heightM: legacy.heightM,
    cellM: legacy.cellM || DEFAULT_CELL_M,
    plan: { ...legacy },
  });
}

export function siteFromLegacyPlans(plans: Record<number, PlanState>): Record<number, SitePlan> {
  const sites: Record<number, SitePlan> = {};
  for (const [key, plan] of Object.entries(plans)) {
    const farmId = Number(key);
    const environment = environmentForLegacyPlan(farmId, plan);
    sites[farmId] = {
      farmId,
      widthM: environment.widthM,
      heightM: environment.heightM,
      cellM: environment.cellM,
      environments: [environment],
      updatedAt: plan.updatedAt,
    };
  }
  return sites;
}

/** Idempotent schema migration. A v2 empty site is intentional and is not
 * reconstructed from the retained legacy `plans` compatibility map. */
export function migrateEnvironmentStore<T extends EnvironmentStoreShape>(stored: T): T & {
  version: 2;
  sites: Record<number, SitePlan>;
  selectedEnvironmentIds: Record<number, string>;
} {
  if (stored.version === 2) {
    return {
      ...stored,
      version: 2,
      sites: stored.sites ?? {},
      selectedEnvironmentIds: stored.selectedEnvironmentIds ?? {},
    };
  }

  const sites = { ...siteFromLegacyPlans(stored.plans ?? {}), ...(stored.sites ?? {}) };
  const selectedEnvironmentIds = { ...(stored.selectedEnvironmentIds ?? {}) };
  for (const [key, site] of Object.entries(sites)) {
    if (selectedEnvironmentIds[Number(key)] === undefined && site.environments.length === 1) {
      selectedEnvironmentIds[Number(key)] = site.environments[0]!.id;
    }
  }
  return { ...stored, version: 2, sites, selectedEnvironmentIds };
}

function scaledLayoutDefaults(archetypeId: ArchetypeId, widthM: number, heightM: number): EnvironmentLayout {
  const archetype = archetypes[archetypeId];
  const profile = planningProfiles[archetype.planningProfile];
  const defaultWidth = archetype.defaultFootprint.wM;
  const defaultHeight = archetype.defaultFootprint.hM;
  const access = profile.accessDefaults.flatMap((item, index) => {
    const edgeLength = item.edge === 'north' || item.edge === 'south' ? widthM : heightM;
    const openingWidth = Math.min(item.widthM, edgeLength);
    const offsetM = Math.min(Math.max(0, item.offsetM * (edgeLength / (item.edge === 'north' || item.edge === 'south' ? defaultWidth : defaultHeight))), edgeLength - openingWidth);
    return [{ id: `access-${index + 1}`, edge: item.edge, offsetM, widthM: openingWidth }];
  });
  const reservations = profile.reservationDefaults.flatMap((item) => {
    const edgeScale = item.edge === 'north' || item.edge === 'south'
      ? widthM / defaultWidth
      : heightM / defaultHeight;
    const offsetM = item.offsetM === undefined ? 0 : item.offsetM * edgeScale;
    const x = item.edge === 'west' ? 0
      : item.edge === 'east' ? widthM - item.widthM
        : item.edge ? offsetM : item.x * (widthM / defaultWidth);
    const y = item.edge === 'north' ? 0
      : item.edge === 'south' ? heightM - item.depthM
        : item.edge ? offsetM : item.y * (heightM / defaultHeight);
    const rWidth = Math.min(item.widthM, widthM - x);
    const depthM = Math.min(item.depthM, heightM - y);
    if (x < 0 || y < 0 || rWidth <= 0 || depthM <= 0) return [];
    return [{ ...item, x, y, widthM: rWidth, depthM }];
  });
  return {
    ...(archetype.defaultUsableHeightM ? { usableHeightM: archetype.defaultUsableHeightM } : {}),
    access,
    reservations,
    growingSpaces: [],
  };
}

export function makeEnvironment(
  farmId: number,
  input: CreateEnvironmentInput,
  id: string,
  updatedAt = new Date().toISOString(),
): Environment {
  if (!isArchetypeId(input.archetype)) throw new Error(`Unknown growing-world archetype: ${String(input.archetype)}`);
  const archetype = archetypes[input.archetype];
  const cellM = input.cellM && input.cellM > 0 ? input.cellM : DEFAULT_CELL_M;
  const widthM = Math.max(cellM, Math.round((input.widthM ?? archetype.defaultFootprint.wM) / cellM) * cellM);
  const heightM = Math.max(cellM, Math.round((input.heightM ?? archetype.defaultFootprint.hM) / cellM) * cellM);
  const profile = planningProfiles[archetype.planningProfile];
  const plan: PlanState = {
    farmId,
    widthM,
    heightM,
    cellM,
    allowOutsideBeds: profile.allowOutsideBeds,
    planting: {},
    ground: {},
    updatedAt,
  };
  const layout = input.layout
    ? structuredClone(input.layout)
    : scaledLayoutDefaults(archetype.id, widthM, heightM);
  if (input.usableHeightM !== undefined) layout.usableHeightM = input.usableHeightM;
  return normalizeEnvironment({
    id,
    farmId,
    archetype: archetype.id,
    label: input.label?.trim() || archetype.label,
    x: input.x ?? 0,
    y: input.y ?? 0,
    widthM,
    heightM,
    cellM,
    plan,
    layout,
  });
}

export function siteForEnvironments(
  farmId: number,
  environments: Environment[],
  previous?: SitePlan | null,
): SitePlan {
  const widthM = Math.max(previous?.widthM ?? 0, ...environments.map((env) => env.x + env.widthM), 1);
  const heightM = Math.max(previous?.heightM ?? 0, ...environments.map((env) => env.y + env.heightM), 1);
  const first = environments[0];
  return {
    farmId,
    widthM,
    heightM,
    cellM: first?.cellM ?? previous?.cellM ?? DEFAULT_CELL_M,
    environments: environments.map((environment) => normalizeEnvironment(environment)),
    updatedAt: new Date().toISOString(),
  };
}
