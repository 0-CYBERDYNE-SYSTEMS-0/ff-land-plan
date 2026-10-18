import type { PlanState, PlanSurface } from '@/types';

const FORMAT = 'farmfriend-plan';
const VERSION = 1;
const SURFACES = new Set<PlanSurface>(['outdoor', 'greenhouse', 'hoophouse', 'tent', 'indoor', 'warehouse']);
const CELL_KEY = /^-?\d+,-?\d+$/;

interface PlanFile {
  format: typeof FORMAT;
  version: typeof VERSION;
  plan: PlanState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function copyStringMap(value: unknown, field: string, keyPattern?: RegExp): Record<string, string> {
  if (!isRecord(value)) throw new Error(`Invalid plan JSON: ${field} must be an object.`);
  const entries: Array<[string, string]> = [];
  for (const [key, entry] of Object.entries(value)) {
    if ((keyPattern && !keyPattern.test(key)) || typeof entry !== 'string') {
      throw new Error(`Invalid plan JSON: ${field} contains an invalid entry.`);
    }
    entries.push([key, entry]);
  }
  return Object.fromEntries(entries);
}

function copyPlanting(value: unknown): Record<string, number> {
  if (!isRecord(value)) throw new Error('Invalid plan JSON: planting must be an object.');
  const entries: Array<[string, number]> = [];
  for (const [key, cropId] of Object.entries(value)) {
    if (!CELL_KEY.test(key) || typeof cropId !== 'number' || !Number.isInteger(cropId) || cropId <= 0) {
      throw new Error('Invalid plan JSON: planting contains an invalid cell or crop id.');
    }
    entries.push([key, cropId]);
  }
  return Object.fromEntries(entries);
}

/** Encode a plan as a versioned, portable JSON document. */
export function serializePlanJson(plan: PlanState): string {
  const file: PlanFile = { format: FORMAT, version: VERSION, plan };
  return JSON.stringify(file, null, 2);
}

/** Parse an exported plan and bind it to the farm currently being edited. */
export function parsePlanJson(json: string, farmId: number): PlanState {
  if (!Number.isInteger(farmId) || farmId <= 0) throw new Error('Invalid target farm.');

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isRecord(value) || value.format !== FORMAT || value.version !== VERSION || !isRecord(value.plan)) {
    throw new Error('Unsupported plan file. Choose a FarmFriend plan JSON export.');
  }

  const source = value.plan;
  const { widthM, heightM, cellM, allowOutsideBeds, updatedAt } = source;
  if (
    typeof widthM !== 'number' || !Number.isFinite(widthM) || widthM < 2 || widthM > 60 ||
    typeof heightM !== 'number' || !Number.isFinite(heightM) || heightM < 2 || heightM > 60 ||
    typeof cellM !== 'number' || !Number.isFinite(cellM) || cellM <= 0 ||
    typeof allowOutsideBeds !== 'boolean' || typeof updatedAt !== 'string' ||
    !Number.isInteger(source.farmId) || (source.farmId as number) <= 0
  ) {
    throw new Error('Invalid plan JSON: plan settings are incomplete or out of range.');
  }
  if (source.surface !== undefined && (typeof source.surface !== 'string' || !SURFACES.has(source.surface as PlanSurface))) {
    throw new Error('Invalid plan JSON: unknown surface.');
  }

  let plantedAt: Record<string, string> | undefined;
  if (source.plantedAt !== undefined) {
    plantedAt = copyStringMap(source.plantedAt, 'plantedAt', CELL_KEY);
  }
  return {
    farmId,
    widthM,
    heightM,
    cellM,
    allowOutsideBeds,
    ...(source.surface ? { surface: source.surface as PlanSurface } : {}),
    planting: copyPlanting(source.planting),
    ground: copyStringMap(source.ground, 'ground', CELL_KEY),
    updatedAt,
    ...(plantedAt ? { plantedAt } : {}),
  };
}
