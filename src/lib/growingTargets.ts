import type { Environment, GrowingTargetKey, GrowingTargetPlan, GrowingTargetRef, PlanState } from '@/types';

export interface ParsedTargetCellKey {
  target: GrowingTargetRef;
  localCellKey: string;
}

export interface GrowingCellWorldPosition {
  target: GrowingTargetRef;
  localCellKey: string;
  column: number;
  row: number;
  x: number;
  y: number;
  z: number;
}

export function growingTargetKey(target: GrowingTargetRef): GrowingTargetKey {
  if (target.kind === 'floor') return 'floor';
  return `level/${encodeURIComponent(target.growingSpaceId)}/${encodeURIComponent(target.levelId)}`;
}

/** Floor keys retain the legacy `x,y` encoding; only elevated cells are qualified. */
export function targetCellKey(target: GrowingTargetRef, localCellKey: string): string {
  return target.kind === 'floor' ? localCellKey : `${growingTargetKey(target)}|${localCellKey}`;
}

export function parseTargetCellKey(key: string): ParsedTargetCellKey {
  const separator = key.indexOf('|');
  if (separator < 0) return { target: { kind: 'floor' }, localCellKey: key };

  const [prefix, encodedSpaceId, encodedLevelId] = key.slice(0, separator).split('/');
  if (prefix !== 'level' || !encodedSpaceId || !encodedLevelId) {
    return { target: { kind: 'floor' }, localCellKey: key };
  }
  try {
    return {
      target: {
        kind: 'growing-level',
        growingSpaceId: decodeURIComponent(encodedSpaceId),
        levelId: decodeURIComponent(encodedLevelId),
      },
      localCellKey: key.slice(separator + 1),
    };
  } catch {
    return { target: { kind: 'floor' }, localCellKey: key };
  }
}

/** Resolve a target's physical planting elevation from the environment layout. */
export function growingTargetElevationM(
  environment: Pick<Environment, 'layout'> | null | undefined,
  target: GrowingTargetRef,
): number | null {
  if (target.kind === 'floor') return 0;
  for (const space of environment?.layout?.growingSpaces ?? []) {
    if (space.id !== target.growingSpaceId) continue;
    return space.levels.find((level) => level.id === target.levelId)?.elevationM ?? null;
  }
  return null;
}

/** Convert an encoded sim/editor cell address into a finite world-space cell center. */
export function growingCellWorldPosition(
  encodedCellKey: string,
  dimensions: Pick<PlanState, 'widthM' | 'heightM' | 'cellM'>,
  environment: Pick<Environment, 'layout'> | null | undefined,
  yOffsetM = 0,
  targetOverride?: GrowingTargetRef,
): GrowingCellWorldPosition | null {
  const parsed = parseTargetCellKey(encodedCellKey);
  const target = targetOverride ?? parsed.target;
  const cell = /^(-?\d+),(-?\d+)$/.exec(parsed.localCellKey);
  if (!cell) return null;
  const column = Number(cell[1]);
  const row = Number(cell[2]);
  const { widthM, heightM, cellM } = dimensions;
  const elevationM = growingTargetElevationM(environment, target);
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 ||
      !Number.isFinite(widthM) || !Number.isFinite(heightM) || !Number.isFinite(cellM) || cellM <= 0 ||
      column * cellM >= widthM || row * cellM >= heightM || elevationM === null || !Number.isFinite(yOffsetM)) {
    return null;
  }
  const x = column * cellM + cellM / 2 - widthM / 2;
  const y = elevationM + yOffsetM;
  const z = row * cellM + cellM / 2 - heightM / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { target, localCellKey: parsed.localCellKey, column, row, x, y, z };
}

export function planForTarget(plan: PlanState, target: GrowingTargetRef): PlanState {
  if (target.kind === 'floor') return plan;
  const targetPlan = plan.targets?.[growingTargetKey(target)];
  const floorPlan = { ...plan };
  delete floorPlan.plantedAt;
  return {
    ...floorPlan,
    planting: targetPlan?.planting ?? {},
    ...(targetPlan?.plantedAt ? { plantedAt: targetPlan.plantedAt } : {}),
    ground: {},
  };
}

export function planWithTarget(plan: PlanState, target: GrowingTargetRef, view: PlanState): PlanState {
  if (target.kind === 'floor') {
    const next = {
      ...plan,
      planting: { ...view.planting },
      ground: { ...view.ground },
    };
    if (view.plantedAt) next.plantedAt = { ...view.plantedAt };
    else delete next.plantedAt;
    return next;
  }

  const key = growingTargetKey(target);
  const targets = { ...plan.targets };
  if (Object.keys(view.planting).length === 0) {
    delete targets[key];
  } else {
    const targetPlan: GrowingTargetPlan = {
      growingSpaceId: target.growingSpaceId,
      levelId: target.levelId,
      planting: { ...view.planting },
      ...(view.plantedAt ? { plantedAt: { ...view.plantedAt } } : {}),
    };
    targets[key] = targetPlan;
  }
  return { ...plan, targets };
}
