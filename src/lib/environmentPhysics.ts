// Pure geometric readiness audit for enclosed growing worlds.
//
// The audit reads saved layout/planning records and reports actionable issues;
// it never mutates its input and never touches simulation physics. Every issue
// is a plain serializable record, sorted deterministically by code then
// subjectId so reports are stable across runs and machines.

import type {
  Environment,
  EnvironmentAssetInstance,
  EnvironmentReservation,
  GrowingSpace,
  PlanState,
  SiteEdge,
} from '@/types';

export type EnvironmentIssueSeverity = 'error' | 'warning';

export interface EnvironmentIssue {
  code: string;
  severity: EnvironmentIssueSeverity;
  message: string;
  subjectId: string;
}

export type EnvironmentAuditSubject = Pick<
  Environment,
  'widthM' | 'heightM' | 'cellM' | 'plan' | 'layout' | 'instances'
>;

/** Tolerance so touching rectangles (shared edges) are not reported as overlaps. */
const EPS = 1e-6;

const SITE_EDGES: readonly SiteEdge[] = ['north', 'east', 'south', 'west'];

const CELL_KEY_PATTERN = /^(-?\d+),(-?\d+)$/;

function fmt(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : String(value);
}

function isFiniteNonNegative(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function rectanglesIntersect(
  a: { x: number; y: number; widthM: number; depthM: number },
  b: { x: number; y: number; widthM: number; depthM: number },
): boolean {
  return (
    a.x < b.x + b.widthM - EPS &&
    b.x < a.x + a.widthM - EPS &&
    a.y < b.y + b.depthM - EPS &&
    b.y < a.y + a.depthM - EPS
  );
}

function rectIsFinite(rect: { x: number; y: number; widthM: number; depthM: number }): boolean {
  return (
    Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.widthM) && Number.isFinite(rect.depthM)
  );
}

interface Rect {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
}

function spaceRect(space: GrowingSpace): Rect {
  return { x: space.x, y: space.y, widthM: space.widthM, depthM: space.depthM };
}

function instanceRect(instance: EnvironmentAssetInstance): Rect {
  return { x: instance.x, y: instance.y, widthM: instance.widthM, depthM: instance.depthM };
}

function reservationRect(reservation: EnvironmentReservation): Rect {
  return { x: reservation.x, y: reservation.y, widthM: reservation.widthM, depthM: reservation.depthM };
}

function planSizeIsValid(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function levelSubjectId(spaceId: string, levelId: string): string {
  return `${spaceId}/${levelId}`;
}

/**
 * Audit the saved geometry of one growing world. Inputs are the environment
 * footprint dimensions/cell size, the plan (including per-level crop targets),
 * the optional layout (growing spaces, reservations, access openings) and the
 * optional mounted-equipment instances.
 *
 * Intentional parent/child placements are never flagged: a plant-rack floor
 * instance and its growing spaces form one system, and growing-level (or
 * environment-mounted) equipment deliberately shares its parent's footprint,
 * so floor-collision checks only compare floor-mounted instances with each
 * other and with access/service reservations.
 */
export function auditEnvironmentGeometry(environment: EnvironmentAuditSubject): EnvironmentIssue[] {
  const issues: EnvironmentIssue[] = [];
  const push = (code: string, severity: EnvironmentIssueSeverity, subjectId: string, message: string) => {
    issues.push({ code, severity, message, subjectId });
  };

  // --- Environment and plan dimensions ------------------------------------
  if (!planSizeIsValid(environment.widthM)) {
    push('dimension-invalid', 'error', 'environment.widthM',
      `Environment width must be a positive, finite number (got ${fmt(environment.widthM)}).`);
  }
  if (!planSizeIsValid(environment.heightM)) {
    push('dimension-invalid', 'error', 'environment.heightM',
      `Environment depth must be a positive, finite number (got ${fmt(environment.heightM)}).`);
  }
  if (!planSizeIsValid(environment.cellM)) {
    push('dimension-invalid', 'error', 'environment.cellM',
      `Cell size must be a positive, finite number (got ${fmt(environment.cellM)}).`);
  }
  const plan: PlanState = environment.plan;
  for (const field of ['widthM', 'heightM', 'cellM'] as const) {
    if (!planSizeIsValid(plan[field])) {
      push('dimension-invalid', 'error', `plan.${field}`,
        `Plan ${field} must be a positive, finite number (got ${fmt(plan[field])}).`);
    }
  }

  const footprintKnown = planSizeIsValid(environment.widthM) && planSizeIsValid(environment.heightM);
  const cellKnown = planSizeIsValid(environment.cellM);
  const layout = environment.layout;

  if (layout) {
    // --- Growing spaces ---------------------------------------------------
    const spaces = Array.isArray(layout.growingSpaces) ? layout.growingSpaces : [];
    for (const space of spaces) {
      for (const field of ['x', 'y', 'widthM', 'depthM'] as const) {
        if (!isFiniteNonNegative(space[field])) {
          push('dimension-invalid', 'error', `space/${space.id}/${field}`,
            `Growing space "${space.label}" has an invalid ${field} (got ${fmt(space[field])}).`);
        }
      }
      if (footprintKnown && rectIsFinite(spaceRect(space)) &&
          (space.x < -EPS || space.y < -EPS ||
           space.x + space.widthM > environment.widthM + EPS ||
           space.y + space.depthM > environment.heightM + EPS)) {
        push('space-outside-footprint', 'error', space.id,
          `Growing space "${space.label}" (${space.x}, ${space.y}, ${fmt(space.widthM)} × ${fmt(space.depthM)} m) extends outside the ${fmt(environment.widthM)} × ${fmt(environment.heightM)} m footprint.`);
      }
      let previousElevation: number | null = null;
      for (const level of space.levels) {
        const levelSubject = levelSubjectId(space.id, level.id);
        if (!Number.isFinite(level.elevationM) || level.elevationM < 0) {
          push('level-elevation-invalid', 'error', levelSubject,
            `Level "${level.label}" elevation must be a finite, non-negative number (got ${fmt(level.elevationM)}).`);
          previousElevation = null;
          continue;
        }
        if (previousElevation !== null && level.elevationM <= previousElevation + EPS) {
          push('level-elevation-invalid', 'error', levelSubject,
            `Level "${level.label}" elevation ${fmt(level.elevationM)} m does not increase above the previous tier (${fmt(previousElevation)} m).`);
        }
        previousElevation = level.elevationM;
        if (level.clearanceM !== undefined && (!Number.isFinite(level.clearanceM) || level.clearanceM < 0)) {
          push('dimension-invalid', 'error', `${levelSubject}/clearanceM`,
            `Level "${level.label}" clearance must be a finite, non-negative number (got ${fmt(level.clearanceM)}).`);
        }
        const usableHeightM = layout.usableHeightM;
        if (usableHeightM !== undefined && Number.isFinite(usableHeightM) && usableHeightM > 0) {
          if (level.elevationM > usableHeightM + EPS) {
            push('level-above-usable-height', 'error', levelSubject,
              `${space.kind === 'rack' ? 'Rack deck' : `Level "${level.label}"`} sits at ${fmt(level.elevationM)} m, above the ${fmt(usableHeightM)} m usable height.`);
          }
          if (level.clearanceM !== undefined && Number.isFinite(level.clearanceM) &&
              level.elevationM + level.clearanceM > usableHeightM + EPS) {
            push('level-clearance-exceeds-height', 'error', levelSubject,
              `Level "${level.label}" deck at ${fmt(level.elevationM)} m plus ${fmt(level.clearanceM)} m clearance exceeds the ${fmt(usableHeightM)} m usable height.`);
          }
        }
      }
    }
    for (let i = 0; i < spaces.length; i += 1) {
      for (let j = i + 1; j < spaces.length; j += 1) {
        const a = spaces[i]!;
        const b = spaces[j]!;
        if (rectIsFinite(spaceRect(a)) && rectIsFinite(spaceRect(b)) && rectanglesIntersect(spaceRect(a), spaceRect(b))) {
          push('space-overlap', 'error', `${a.id}::${b.id}`,
            `Growing spaces "${a.label}" and "${b.label}" overlap on the floor plan.`);
        }
      }
    }

    // --- Reservations -----------------------------------------------------
    const reservations = Array.isArray(layout.reservations) ? layout.reservations : [];
    for (const reservation of reservations) {
      for (const field of ['x', 'y', 'widthM', 'depthM'] as const) {
        if (!isFiniteNonNegative(reservation[field])) {
          push('dimension-invalid', 'error', `reservation/${reservation.id}/${field}`,
            `Reservation "${reservation.id}" has an invalid ${field} (got ${fmt(reservation[field])}).`);
        }
      }
    }

    // --- Access openings ---------------------------------------------------
    const access = layout.access;
    if (!Array.isArray(access) || access.length === 0) {
      push('access-openings-missing', 'warning', 'layout.access',
        'No access-opening records are saved for this world, so doors and service entries cannot be verified.');
    } else {
      for (const [index, opening] of access.entries()) {
        const subjectId = `access/${opening?.id ?? index}`;
        const problems: string[] = [];
        if (!opening || typeof opening !== 'object') {
          problems.push('record is missing');
        } else {
          if (!SITE_EDGES.includes(opening.edge)) {
            problems.push(`unknown edge "${String(opening.edge)}"`);
          }
          if (!isFiniteNonNegative(opening.offsetM)) {
            problems.push(`invalid offset (got ${fmt(opening.offsetM)})`);
          }
          if (!(Number.isFinite(opening.widthM) && opening.widthM > 0)) {
            problems.push(`invalid width (got ${fmt(opening.widthM)})`);
          }
          if (problems.length === 0 && Number.isFinite(opening.offsetM) && Number.isFinite(opening.widthM)) {
            const edgeLength = opening.edge === 'north' || opening.edge === 'south'
              ? environment.widthM
              : environment.heightM;
            if (Number.isFinite(edgeLength) && opening.offsetM + opening.widthM > edgeLength + EPS) {
              problems.push(`opening ends at ${fmt(opening.offsetM + opening.widthM)} m along the ${opening.edge} edge, past the ${fmt(edgeLength)} m wall`);
            }
          }
        }
        if (problems.length > 0) {
          push('access-opening-invalid', 'error', subjectId,
            `Access opening "${opening?.id ?? index}" is invalid: ${problems.join('; ')}.`);
        }
      }
    }
  }

  // --- Mounted equipment ---------------------------------------------------
  const spaceById = new Map<string, GrowingSpace>();
  if (layout && Array.isArray(layout.growingSpaces)) {
    for (const space of layout.growingSpaces) spaceById.set(space.id, space);
  }
  const instances = Array.isArray(environment.instances) ? environment.instances : [];
  const floorInstances = instances.filter((instance) => instance.mount.kind === 'floor');

  for (const instance of instances) {
    for (const field of ['x', 'y', 'widthM', 'depthM'] as const) {
      if (!isFiniteNonNegative(instance[field])) {
        push('dimension-invalid', 'error', `instance/${instance.id}/${field}`,
          `Mounted "${instance.slug}" has an invalid ${field} (got ${fmt(instance[field])}).`);
      }
    }
    if (instance.mount.kind === 'growing-level') {
      const mount = instance.mount;
      const space = spaceById.get(mount.growingSpaceId);
      const levelExists = space?.levels.some((level) => level.id === mount.levelId) ?? false;
      if (!space || !levelExists) {
        push('instance-mount-unresolved', 'error', instance.id,
          `Mounted "${instance.slug}" references ${space ? 'a missing level' : 'a missing growing space'} (${mount.growingSpaceId}/${mount.levelId}).`);
      }
    }
  }

  // Floor-collision sources are floor-mounted instances only: access/service
  // reservations may intentionally nest inside each other, and growing-level
  // or environment-mounted equipment belongs to its parent rack/space.
  const floorRects = floorInstances
    .filter((instance) => rectIsFinite(instanceRect(instance)))
    .map((instance) => ({ rect: instanceRect(instance), label: `floor-mounted "${instance.slug}"`, id: instance.id }));
  const reservationRects = (layout && Array.isArray(layout.reservations) ? layout.reservations : [])
    .filter((reservation) => rectIsFinite(reservationRect(reservation)))
    .map((reservation) => ({ rect: reservationRect(reservation), label: `${reservation.kind} reservation "${reservation.id}"`, id: reservation.id }));
  for (let i = 0; i < floorRects.length; i += 1) {
    const a = floorRects[i]!;
    for (let j = i + 1; j < floorRects.length; j += 1) {
      const b = floorRects[j]!;
      if (rectanglesIntersect(a.rect, b.rect)) {
        push('instance-collision', 'error', `${a.id}::${b.id}`,
          `${a.label} overlaps ${b.label}; floor equipment must stay clear of other floor equipment.`);
      }
    }
    for (const b of reservationRects) {
      if (rectanglesIntersect(a.rect, b.rect)) {
        push('instance-collision', 'error', `${a.id}::${b.id}`,
          `${a.label} overlaps a ${b.label}; floor equipment and access/service space must stay clear of each other.`);
      }
    }
  }

  // --- Per-level crop targets ---------------------------------------------
  const targets = plan.targets ?? {};
  for (const [targetKey, targetPlan] of Object.entries(targets)) {
    const space = spaceById.get(targetPlan.growingSpaceId);
    if (!space) {
      push('target-anchor-missing', 'error', targetKey,
        `Planted target references unknown growing space "${targetPlan.growingSpaceId}".`);
      continue;
    }
    if (!space.levels.some((level) => level.id === targetPlan.levelId)) {
      push('target-anchor-missing', 'error', targetKey,
        `Planted target references unknown level "${targetPlan.levelId}" on growing space "${space.label}".`);
    }
    if (!cellKnown || !rectIsFinite(spaceRect(space))) continue;
    const outside: string[] = [];
    const malformed: string[] = [];
    for (const cellKey of Object.keys(targetPlan.planting)) {
      const match = CELL_KEY_PATTERN.exec(cellKey);
      if (!match) {
        malformed.push(cellKey);
        continue;
      }
      const column = Number(match[1]);
      const row = Number(match[2]);
      if (
        column < 0 || row < 0 ||
        column * environment.cellM < space.x - EPS ||
        (column + 1) * environment.cellM > space.x + space.widthM + EPS ||
        row * environment.cellM < space.y - EPS ||
        (row + 1) * environment.cellM > space.y + space.depthM + EPS
      ) {
        outside.push(cellKey);
      }
    }
    for (const cellKey of malformed) {
      push('target-cell-invalid', 'error', targetKey,
        `Planted cell "${cellKey}" is not a valid "x,y" cell address.`);
    }
    if (outside.length > 0) {
      const sample = outside.slice(0, 3).join(', ');
      push('target-cell-outside-space', 'error', targetKey,
        `${outside.length} planted cell${outside.length === 1 ? '' : 's'} fall${outside.length === 1 ? 's' : ''} outside growing space "${space.label}" (${sample}${outside.length > 3 ? ', …' : ''}).`);
    }
  }

  return issues.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.subjectId !== b.subjectId) return a.subjectId < b.subjectId ? -1 : 1;
    return 0;
  });
}
