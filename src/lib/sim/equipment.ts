/**
 * Placed-asset physics aggregation.
 *
 * Values are model estimates from the asset catalogue. Light output uses a
 * deliberately simple square coverage footprint whose area is the catalogue
 * `footprintM2`; overlapping fixtures take max PPFD while wattage sums. A
 * legacy ground-map rectangle is one physical asset, not one per cell. Mounted
 * instances are keyed by id and counted once. Hydro channels have an explicit
 * zero litre reservoir until a capacity is specified; water stores must be
 * placed separately.
 */
import { assetLibrary } from '@/data/assets';
import { growingTargetKey } from '@/lib/growingTargets';
import type {
  AssetPhysics,
  Environment,
  EnvironmentAssetInstance,
  EnvironmentAssetMount,
  EnvironmentArchetype,
  EnvironmentLayout,
  GrowingTargetRef,
  PlanState,
} from '@/types';

export interface EquipmentTerms {
  ppfdUmol: number;
  lightingW: number;
  photoperiodH: number;
  achBoost: number;
  mixing: number;
  heatingKw: number;
  coolingKw: number;
  coolingElectricalKw: number;
  dehumLpd: number;
  dehumDerateBelowRh: number;
  co2TargetPpm: number | null;
  /** Additive bridge to ClimateEquipmentInput; each installed cylinder sums. */
  co2KgDay: number;
  tiers: number;
  soilless: boolean;
  waterStoreL: number;
  nursery: boolean;
}

export type EquipmentEnvironment = Partial<Pick<Environment, 'layout' | 'instances'>>;

interface Rect {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
}

interface Placement {
  slug: string;
  physics: AssetPhysics;
  mount: EnvironmentAssetMount;
  rect: Rect;
}

interface LightPlacement extends Placement {
  physics: Extract<AssetPhysics, { kind: 'light' }>;
}

interface Bounds {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
}

const assetsBySlug = new Map(assetLibrary.map((asset) => [asset.slug, asset]));

function freshTerms(): EquipmentTerms {
  return {
    ppfdUmol: 0,
    lightingW: 0,
    photoperiodH: 0,
    achBoost: 0,
    mixing: 0,
    heatingKw: 0,
    coolingKw: 0,
    coolingElectricalKw: 0,
    dehumLpd: 0,
    dehumDerateBelowRh: 50,
    co2TargetPpm: null,
    co2KgDay: 0,
    tiers: 1,
    soilless: false,
    waterStoreL: 0,
    nursery: false,
  };
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function parseCell(key: string): { x: number; y: number } | null {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Split the sparse legacy canvas into deterministic asset footprints. */
function legacyPlacements(plan: PlanState, slug: string, physics: AssetPhysics): Placement[] {
  const asset = assetsBySlug.get(slug);
  if (!asset) return [];
  const cellM = Number.isFinite(plan.cellM) && plan.cellM > 0 ? plan.cellM : 0.25;
  const cols = Math.max(1, Math.round(asset.defaultWM / cellM));
  const rows = Math.max(1, Math.round(asset.defaultHM / cellM));
  const cells = Object.keys(plan.ground)
    .filter((key) => plan.ground[key] === slug)
    .map((key) => {
      const position = parseCell(key);
      return position ? { key, ...position } : null;
    })
    .filter((cell): cell is { key: string; x: number; y: number } => cell !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const remaining = new Set(cells.map((cell) => cell.key));
  const placements: Placement[] = [];

  for (const anchor of cells) {
    if (!remaining.has(anchor.key)) continue;
    const candidate: string[] = [];
    for (let y = anchor.y; y < anchor.y + rows; y += 1) {
      for (let x = anchor.x; x < anchor.x + cols; x += 1) candidate.push(cellKey(x, y));
    }
    const complete = candidate.every((key) => remaining.has(key));
    const consumed = complete ? candidate : [anchor.key];
    for (const key of consumed) remaining.delete(key);
    placements.push({
      slug,
      physics,
      mount: { kind: 'floor' },
      rect: {
        x: anchor.x * cellM,
        y: anchor.y * cellM,
        widthM: (complete ? cols : 1) * cellM,
        depthM: (complete ? rows : 1) * cellM,
      },
    });
  }
  return placements;
}

function instancePlacements(instances: readonly EnvironmentAssetInstance[] = []): Placement[] {
  const seen = new Set<string>();
  const placements: Placement[] = [];
  for (const instance of instances) {
    if (instance.id && seen.has(instance.id)) continue;
    if (instance.id) seen.add(instance.id);
    const physics = assetsBySlug.get(instance.slug)?.physics;
    if (!physics) continue;
    placements.push({
      slug: instance.slug,
      physics,
      mount: instance.mount,
      rect: { x: instance.x, y: instance.y, widthM: instance.widthM, depthM: instance.depthM },
    });
  }
  return placements;
}

function mountApplies(mount: EnvironmentAssetMount, target?: GrowingTargetRef, kind?: AssetPhysics['kind']): boolean {
  if (!target) return true;
  // Environment mounts participate in the shared room balance; for target
  // PPFD they are assigned to the floor and cannot leak onto every tier.
  if (mount.kind === 'environment') return kind !== 'light' || target.kind === 'floor';
  if (target.kind === 'floor') return mount.kind === 'floor';
  return mount.kind === 'growing-level'
    && mount.growingSpaceId === target.growingSpaceId
    && mount.levelId === target.levelId;
}

function targetBounds(
  plan: PlanState,
  layout: EnvironmentLayout | undefined,
  target: GrowingTargetRef,
): Bounds | null {
  if (target.kind === 'floor') return { x: 0, y: 0, widthM: plan.widthM, depthM: plan.heightM };
  const space = layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
  if (space?.levels.some((level) => level.id === target.levelId)) {
    return { x: space.x, y: space.y, widthM: space.widthM, depthM: space.depthM };
  }

  const targetPlan = plan.targets?.[growingTargetKey(target)];
  const positions = Object.keys(targetPlan?.planting ?? {})
    .map(parseCell)
    .filter((position): position is { x: number; y: number } => position !== null);
  if (positions.length === 0) return null;
  const cellM = Number.isFinite(plan.cellM) && plan.cellM > 0 ? plan.cellM : 0.25;
  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxX = Math.max(...positions.map((position) => position.x));
  const maxY = Math.max(...positions.map((position) => position.y));
  return { x: minX * cellM, y: minY * cellM, widthM: (maxX - minX + 1) * cellM, depthM: (maxY - minY + 1) * cellM };
}

function clippedRect(rect: Rect, bounds: Bounds): Rect | null {
  const x0 = Math.max(rect.x, bounds.x);
  const y0 = Math.max(rect.y, bounds.y);
  const x1 = Math.min(rect.x + rect.widthM, bounds.x + bounds.widthM);
  const y1 = Math.min(rect.y + rect.depthM, bounds.y + bounds.depthM);
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, widthM: x1 - x0, depthM: y1 - y0 };
}

/** Exact union area for the small axis-aligned light footprints in one room/target. */
function rectangleUnionArea(rects: readonly Rect[]): number {
  const xs = [...new Set(rects.flatMap((rect) => [rect.x, rect.x + rect.widthM]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index + 1 < xs.length; index += 1) {
    const x0 = xs[index]!;
    const x1 = xs[index + 1]!;
    if (!(x1 > x0)) continue;
    const intervals = rects
      .filter((rect) => rect.x < x1 && rect.x + rect.widthM > x0)
      .map((rect) => [rect.y, rect.y + rect.depthM] as const)
      .sort((a, b) => a[0] - b[0]);
    let coveredY = 0;
    let start = Number.NaN;
    let end = Number.NaN;
    for (const [y0, y1] of intervals) {
      if (!Number.isFinite(start)) {
        start = y0;
        end = y1;
      } else if (y0 <= end) {
        end = Math.max(end, y1);
      } else {
        coveredY += end - start;
        start = y0;
        end = y1;
      }
    }
    if (Number.isFinite(start)) coveredY += end - start;
    area += (x1 - x0) * coveredY;
  }
  return area;
}

function coverageRect(placement: LightPlacement): Rect {
  const area = positive(placement.physics.footprintM2);
  const aspect = placement.rect.widthM > 0 && placement.rect.depthM > 0
    ? placement.rect.widthM / placement.rect.depthM
    : 1;
  const widthM = Math.sqrt(area * aspect);
  const depthM = widthM > 0 ? area / widthM : 0;
  const centerX = placement.rect.x + placement.rect.widthM / 2;
  const centerY = placement.rect.y + placement.rect.depthM / 2;
  return { x: centerX - widthM / 2, y: centerY - depthM / 2, widthM, depthM };
}

function lightScopeKey(mount: EnvironmentAssetMount, target?: GrowingTargetRef): string {
  return target ? growingTargetKey(target) : mount.kind === 'environment' ? 'environment' : growingTargetKey(mount);
}

function lightBounds(
  plan: PlanState,
  layout: EnvironmentLayout | undefined,
  mount: EnvironmentAssetMount,
  target?: GrowingTargetRef,
): Bounds | null {
  if (target) return targetBounds(plan, layout, target);
  if (mount.kind === 'growing-level') return targetBounds(plan, layout, mount);
  return { x: 0, y: 0, widthM: plan.widthM, depthM: plan.heightM };
}

function ppfdForLights(
  lights: readonly LightPlacement[],
  plan: PlanState,
  layout: EnvironmentLayout | undefined,
  target?: GrowingTargetRef,
): number {
  const groups = new Map<string, { bounds: Bounds | null; lights: LightPlacement[] }>();
  for (const light of lights) {
    const key = lightScopeKey(light.mount, target);
    let group = groups.get(key);
    if (!group) {
      group = { bounds: lightBounds(plan, layout, light.mount, target), lights: [] };
      groups.set(key, group);
    }
    group.lights.push(light);
  }

  let maxPpfd = 0;
  for (const group of groups.values()) {
    const bounds = group.bounds;
    const area = bounds ? positive(bounds.widthM * bounds.depthM) : 0;
    if (!bounds || area <= 0) continue;
    const coverage = group.lights
      .map(coverageRect)
      .map((rect) => clippedRect(rect, bounds))
      .filter((rect): rect is Rect => rect !== null);
    const coveredFraction = Math.min(1, rectangleUnionArea(coverage) / area);
    const maxLocalPpfd = Math.max(...group.lights.map((light) => {
      const footprintM2 = positive(light.physics.footprintM2);
      return footprintM2 > 0
        ? positive(light.physics.watts) * positive(light.physics.efficacyUmolJ) / footprintM2
        : 0;
    }));
    maxPpfd = Math.max(maxPpfd, maxLocalPpfd * coveredFraction);
  }
  return maxPpfd;
}

function applyPhysics(terms: EquipmentTerms, physics: AssetPhysics): void {
  switch (physics.kind) {
    case 'light':
      terms.lightingW += positive(physics.watts);
      terms.photoperiodH = Math.max(terms.photoperiodH, positive(physics.photoperiodH ?? 18));
      break;
    case 'fan':
      terms.achBoost += positive(physics.achBoost);
      terms.mixing += positive(physics.mixing);
      break;
    case 'hvac':
      terms.heatingKw += positive(physics.heatingKw);
      terms.coolingKw += positive(physics.coolingKw);
      terms.coolingElectricalKw += positive(physics.electricalKw);
      break;
    case 'dehumidifier': {
      const capacity = positive(physics.litresPerDay);
      const threshold = positive(physics.derateBelowRh);
      if (capacity > 0) {
        terms.dehumDerateBelowRh = terms.dehumLpd > 0
          ? (terms.dehumDerateBelowRh * terms.dehumLpd + threshold * capacity) / (terms.dehumLpd + capacity)
          : threshold;
        terms.dehumLpd += capacity;
      }
      break;
    }
    case 'co2':
      terms.co2TargetPpm = Math.max(terms.co2TargetPpm ?? 0, positive(physics.targetPpm));
      terms.co2KgDay += positive(physics.kgPerDay);
      break;
    case 'rack':
      terms.tiers = Math.max(terms.tiers, positive(physics.tiers));
      break;
    case 'soilless':
      terms.soilless = true;
      terms.waterStoreL += positive(physics.reservoirL);
      break;
    case 'water-store':
      terms.waterStoreL += positive(physics.litres);
      break;
    case 'nursery':
      terms.nursery = true;
      break;
  }
}

/**
 * Aggregate only explicitly placed, physics-bearing assets. The third
 * argument accepts an EnvironmentSnapshot (or just its layout/instances).
 * Supplying a target returns that plane's terms; omitting it returns one
 * room-wide summary. Legacy records without instances use their floor map.
 */
export function equipmentTermsFor(
  plan: PlanState,
  archetype: EnvironmentArchetype,
  environment: EquipmentEnvironment = {},
  target?: GrowingTargetRef,
): EquipmentTerms {
  const terms = freshTerms();
  const placements: Placement[] = [];
  for (const asset of assetLibrary) {
    if (!asset.physics) continue;
    placements.push(...legacyPlacements(plan, asset.slug, asset.physics));
  }
  placements.push(...instancePlacements(environment.instances));

  const applicable = placements.filter((placement) => mountApplies(placement.mount, target, placement.physics.kind));
  const lights = applicable.filter((placement): placement is LightPlacement => placement.physics.kind === 'light');
  const nonLights = applicable.filter((placement) => placement.physics.kind !== 'light');
  for (const placement of lights) applyPhysics(terms, placement.physics);
  for (const placement of nonLights) applyPhysics(terms, placement.physics);

  terms.ppfdUmol = ppfdForLights(lights, plan, environment.layout, target);
  if (target) {
    // A target already identifies one growing plane; multiplying its plants by
    // rack tiers again would count the same vertical area twice.
    terms.tiers = 1;
  } else {
    const rackLevels = environment.layout?.growingSpaces
      .filter((space) => space.kind === 'rack')
      .map((space) => space.levels.length) ?? [];
    terms.tiers = Math.max(1, terms.tiers, ...rackLevels);
  }
  terms.achBoost = Math.min(terms.achBoost, positive(archetype.achInfiltration) * 3);
  terms.mixing = Math.min(terms.mixing, 1);
  return terms;
}
