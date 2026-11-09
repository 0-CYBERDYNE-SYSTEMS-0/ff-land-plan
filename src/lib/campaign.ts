import type {
  Environment,
  GrowingTargetKey,
  GrowingTargetRef,
  SeasonHarvest,
  SeasonRecord,
  SeasonSoilCarry,
  SoilCarry,
} from '@/types';
import { cropLibrary } from '@/data/crops';
import { growingTargetKey, parseTargetCellKey } from '@/lib/growingTargets';
import { initialNitrogenKgHa } from '@/lib/sim/ecosystem';
import { simulateRun } from '@/lib/sim/engine';
import { inspectRunModelSupport } from '@/lib/sim/model-inputs';
import type { RunRecord } from '@/lib/sim/types';

export type CampaignScopeKey = string;
export type RotationCellKey = string;
export type RotationIndex = Record<RotationCellKey, { year: number; family: string }[]>;

export interface SeasonPreview {
  harvests: SeasonHarvest[];
  soil: SeasonSoilCarry[];
  runIds: string[];
  environmentIds: string[];
}

export interface SeasonMeta {
  farmId: number;
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
}

export interface BuildSeasonPreviewOptions {
  /** Explicit carry-in values keyed by environment and growing target. */
  soilIn?: SeasonSoilCarry[];
  /** Manual compost applications per target; fertilizer events are not compost. */
  compostAppsByScope?: Record<CampaignScopeKey, number>;
}

function assertNoOverlappingRuns(runs: RunRecord[]): void {
  const byEnvironment = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const environmentId = run.config.environment?.id ?? '';
    const group = byEnvironment.get(environmentId) ?? [];
    group.push(run);
    byEnvironment.set(environmentId, group);
  }

  for (const environmentRuns of byEnvironment.values()) {
    environmentRuns.sort((a, b) => a.config.startDate.localeCompare(b.config.startDate));
    let latestEnd = '';
    for (const run of environmentRuns) {
      if (latestEnd && run.config.startDate <= latestEnd) {
        throw new Error('Choose one alternative run per overlapping period in the same world.');
      }
      const endDate = run.envSeries.at(-1)?.date ?? run.config.startDate;
      if (endDate > latestEnd) latestEnd = endDate;
    }
  }
}

interface ScopeWork {
  environmentId: string;
  target: GrowingTargetRef;
  soilIn: SoilCarry;
  latestNitrogen: number | null;
  families: Set<string>;
  hasCoverCrop: boolean;
  hasAnyCrop: boolean;
}

const DEFAULT_OM_PCT = 2;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function cloneSoil(carry: SoilCarry): SoilCarry {
  return {
    ...carry,
    inoculum: { ...carry.inoculum },
  };
}

function baseSoilForRun(run: RunRecord): SoilCarry {
  const organicMatterPct = run.config.modelInputs?.soil?.organicMatterPct ?? DEFAULT_OM_PCT;
  return {
    organicMatterPct,
    nPoolKgHa: initialNitrogenKgHa(organicMatterPct),
    inoculum: {},
  };
}

function soilTarget(run: RunRecord, target: GrowingTargetRef): boolean {
  if (target.kind === 'floor') return true;
  const space = run.config.environment?.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
  return !!space && space.kind !== 'hydro';
}

function soilCell(run: RunRecord, target: GrowingTargetRef, cell: string): boolean {
  if (!soilTarget(run, target)) return false;
  const key = growingTargetKey(target);
  const assets = run.config.assetPhysics;
  return !assets?.soillessCells[key]?.includes(cell)
    && !assets?.hydroRequiredCells[key]?.includes(cell);
}

function frozenSoilForTarget(run: RunRecord, target: GrowingTargetRef): SoilCarry | undefined {
  const carry = run.config.soilCarryByTarget?.[growingTargetKey(target)];
  return carry ? cloneSoil(carry) : undefined;
}

function familyForCrop(run: RunRecord, cropId: number): { family: string; category?: string } {
  const crop = run.config.modelInputs?.crops.find((entry) => entry.id === cropId)
    ?? cropLibrary.find((entry) => entry.id === cropId);
  return crop
    ? { family: crop.family || crop.name || String(cropId), category: crop.category }
    : { family: String(cropId) };
}

function encodedScopeKey(environmentId: string, target: GrowingTargetRef): CampaignScopeKey {
  return JSON.stringify([environmentId, growingTargetKey(target)]);
}

function scopedCellKey(environmentId: string, target: GrowingTargetRef, cell: string): RotationCellKey {
  return JSON.stringify([environmentId || 'legacy', growingTargetKey(target), cell]);
}

function targetsInRun(run: RunRecord): GrowingTargetRef[] {
  const targets = new Map<GrowingTargetKey, GrowingTargetRef>();
  if (Object.keys(run.config.basePlan.planting ?? {}).length > 0 || run.config.soilCarryByTarget?.floor) {
    targets.set('floor', { kind: 'floor' });
  }
  for (const target of Object.values(run.config.basePlan.targets ?? {})) {
    const ref: GrowingTargetRef = {
      kind: 'growing-level',
      growingSpaceId: target.growingSpaceId,
      levelId: target.levelId,
    };
    targets.set(growingTargetKey(ref), ref);
  }
  for (const intervention of run.config.interventions) {
    if (intervention.kind !== 'plant') continue;
    const target = intervention.target ?? { kind: 'floor' as const };
    targets.set(growingTargetKey(target), target);
  }
  for (const key of Object.keys(run.config.soilCarryByTarget ?? {})) {
    if (key === 'floor') {
      targets.set('floor', { kind: 'floor' });
      continue;
    }
    const target = parseTargetCellKey(`${key}|0,0`).target;
    if (target.kind === 'growing-level' && growingTargetKey(target) === key) {
      targets.set(key, target);
    }
  }
  return [...targets.values()];
}

export function campaignScopeKey(environmentId: string, target: GrowingTargetRef): CampaignScopeKey {
  return encodedScopeKey(environmentId, target);
}

export function rotationCellKey(
  environmentId: string | undefined,
  target: GrowingTargetRef,
  cell: string,
): RotationCellKey {
  return scopedCellKey(environmentId ?? '', target, cell);
}

/** Replay selected runs and derive one target-scoped soil summary per soil surface. */
export function buildSeasonPreview(
  selectedRuns: RunRecord[],
  options: BuildSeasonPreviewOptions = {},
): SeasonPreview {
  const runs = [...selectedRuns]
    .filter((run) => run.status === 'complete')
    .sort((a, b) => a.config.startDate.localeCompare(b.config.startDate)
      || a.createdAt.localeCompare(b.createdAt)
      || a.id.localeCompare(b.id));
  const farmIds = new Set(runs.map((run) => run.farmId));
  if (farmIds.size > 1) throw new Error('A season preview can only include runs from one farm.');
  assertNoOverlappingRuns(runs);
  for (const run of runs) {
    const support = inspectRunModelSupport(run.config);
    if (!support.canReplay) {
      throw new Error(`Cannot build a season preview from run ${run.id}: ${support.reasons.join(' ')}`);
    }
    if (run.summary.yieldBasis === 'dry-matter') {
      throw new Error(`Cannot build a season preview from run ${run.id}: campaign harvest summaries require fresh-matter yield.`);
    }
  }

  const explicitSoil = new Map((options.soilIn ?? []).map((entry) => [
    encodedScopeKey(entry.environmentId, entry.target),
    cloneSoil(entry.soilIn),
  ]));
  const scopes = new Map<CampaignScopeKey, ScopeWork>();
  const harvests: SeasonHarvest[] = [];
  const environmentIds = new Set<string>();

  for (const run of runs) {
    const environmentId = run.config.environment?.id;
    if (environmentId) environmentIds.add(environmentId);
    const replay = simulateRun(run.config, run.envSeries, {}, run.observations ?? []);
    const cropFamilies = new Map<number, { family: string; category?: string }>();

    for (const target of targetsInRun(run)) {
      if (!soilTarget(run, target) || !environmentId) continue;
      const key = encodedScopeKey(environmentId, target);
      const carry = frozenSoilForTarget(run, target) ?? explicitSoil.get(key) ?? baseSoilForRun(run);
      const current = scopes.get(key);
      if (!current) {
        scopes.set(key, {
          environmentId,
          target,
          soilIn: cloneSoil(carry),
          latestNitrogen: null,
          families: new Set(),
          hasCoverCrop: false,
          hasAnyCrop: false,
        });
      }
    }

    const nitrogenByScope = new Map<CampaignScopeKey, { sum: number; count: number }>();
    for (const [encodedCell, cellState] of Object.entries(replay.finalState.cells)) {
      const parsed = parseTargetCellKey(encodedCell);
      const scope = environmentId ? scopes.get(encodedScopeKey(environmentId, parsed.target)) : undefined;
      const cropInfo = familyForCrop(run, cellState.cropId);
      cropFamilies.set(cellState.cropId, cropInfo);
      if (scope && soilCell(run, parsed.target, parsed.localCellKey)) {
        const values = nitrogenByScope.get(encodedScopeKey(environmentId!, parsed.target)) ?? { sum: 0, count: 0 };
        values.sum += cellState.nitrogenKgHa;
        values.count += 1;
        nitrogenByScope.set(encodedScopeKey(environmentId!, parsed.target), values);
        scope.families.add(cropInfo.family);
        scope.hasAnyCrop = true;
        scope.hasCoverCrop ||= cropInfo.category === 'cover_crop';
      }
    }

    for (const [key, values] of nitrogenByScope) {
      const scope = scopes.get(key);
      if (scope && values.count > 0) scope.latestNitrogen = values.sum / values.count;
    }

    for (const event of replay.events) {
      if (event.kind !== 'harvested' || event.cell === undefined || event.cropId === undefined) continue;
      const parsed = parseTargetCellKey(event.cell);
      const target = event.target ?? parsed.target;
      const cropInfo = cropFamilies.get(event.cropId) ?? familyForCrop(run, event.cropId);
      const yieldKg = event.data?.yieldKg;
      harvests.push({
        date: event.date,
        cropId: event.cropId,
        kg: typeof yieldKg === 'number' ? yieldKg : 0,
        cell: parsed.localCellKey,
        family: cropInfo.family,
        ...(environmentId ? { environmentId } : {}),
        target,
      });
    }
  }

  for (const prior of options.soilIn ?? []) {
    const matchingRun = runs.find((run) => run.config.environment?.id === prior.environmentId);
    if (!matchingRun || !soilTarget(matchingRun, prior.target)) continue;
    const key = encodedScopeKey(prior.environmentId, prior.target);
    if (!scopes.has(key)) {
      scopes.set(key, {
        environmentId: prior.environmentId,
        target: structuredClone(prior.target),
        soilIn: cloneSoil(prior.soilIn),
        latestNitrogen: null,
        families: new Set(),
        hasCoverCrop: false,
        hasAnyCrop: false,
      });
    }
  }

  const soil = [...scopes.values()]
    .sort((a, b) => a.environmentId.localeCompare(b.environmentId)
      || growingTargetKey(a.target).localeCompare(growingTargetKey(b.target)))
    .map((scope): SeasonSoilCarry => {
      const key = encodedScopeKey(scope.environmentId, scope.target);
      const compostApps = Math.max(0, Number.isFinite(options.compostAppsByScope?.[key])
        ? Math.floor(options.compostAppsByScope![key]!)
        : 0);
      const organicMatterPct = Math.min(8, Math.max(0.5,
        scope.soilIn.organicMatterPct
        + (scope.hasCoverCrop ? 0.02 : 0)
        + 0.10 * compostApps
        - (scope.hasAnyCrop ? 0 : 0.05)));
      const inoculum: Record<string, number> = {};
      const allFamilies = new Set([...Object.keys(scope.soilIn.inoculum), ...scope.families]);
      for (const family of allFamilies) {
        const pressure = scope.soilIn.inoculum[family] ?? 0;
        const next = scope.families.has(family) ? pressure + 0.35 : pressure * 0.7;
        inoculum[family] = round4(Math.min(1, Math.max(0, next)));
      }
      return {
        environmentId: scope.environmentId,
        target: structuredClone(scope.target),
        soilIn: cloneSoil(scope.soilIn),
        soilOut: {
          organicMatterPct,
          nPoolKgHa: scope.latestNitrogen ?? scope.soilIn.nPoolKgHa,
          ...(scope.soilIn.ph !== undefined ? { ph: scope.soilIn.ph } : {}),
          inoculum,
        },
      };
    });

  return {
    harvests: harvests.sort((a, b) => a.date.localeCompare(b.date)
      || (a.environmentId ?? '').localeCompare(b.environmentId ?? '')
      || growingTargetKey(a.target).localeCompare(growingTargetKey(b.target))
      || a.cell.localeCompare(b.cell)),
    soil,
    runIds: runs.map((run) => run.id),
    environmentIds: [...environmentIds].sort(),
  };
}

export function makeSeasonRecord(meta: SeasonMeta, preview: SeasonPreview): SeasonRecord {
  return {
    id: `season:${meta.farmId}:${meta.year}`,
    farmId: meta.farmId,
    year: meta.year,
    label: meta.label,
    startDate: meta.startDate,
    endDate: meta.endDate,
    environmentIds: [...preview.environmentIds],
    runIds: [...preview.runIds],
    soil: structuredClone(preview.soil),
    harvests: structuredClone(preview.harvests),
    updatedAt: meta.updatedAt,
  };
}

/** Read adapter for pre-target-scoped season records; it never invents a world id. */
export function normalizeSeasonRecord(record: SeasonRecord): SeasonRecord {
  const legacy = record as SeasonRecord & { soilIn?: SoilCarry; soilOut?: SoilCarry };
  const environmentIds = Array.isArray(record.environmentIds) ? record.environmentIds : [];
  let soil = Array.isArray(record.soil) ? record.soil : [];
  if (soil.length === 0 && legacy.soilIn && legacy.soilOut && environmentIds.length === 1) {
    soil = [{
      environmentId: environmentIds[0]!,
      target: { kind: 'floor' },
      soilIn: cloneSoil(legacy.soilIn),
      soilOut: cloneSoil(legacy.soilOut),
    }];
  }
  const harvests = (Array.isArray(record.harvests) ? record.harvests : []).map((harvest) => ({
    ...harvest,
    target: harvest.target ?? { kind: 'floor' as const },
  }));
  return {
    ...record,
    environmentIds,
    runIds: Array.isArray(record.runIds) ? record.runIds : [],
    soil,
    harvests,
    updatedAt: record.updatedAt ?? record.endDate ?? '',
  };
}

/** Build a fresh crop-free plan while preserving the world's ground and equipment. */
export function clearEnvironmentPlanting(environment: Environment): Environment {
  const next = structuredClone(environment);
  next.plan.planting = {};
  delete next.plan.plantedAt;
  delete next.plan.targets;
  return next;
}

/** Rotation is derived from the last five saved seasons, including legacy floors. */
export function rotationIndexFromSeasons(seasons: SeasonRecord[], runs: RunRecord[] = []): RotationIndex {
  const runEnvironment = new Map(runs.map((run) => [run.id, run.config.environment?.id]));
  const recent = [...seasons].sort((a, b) => b.year - a.year).slice(0, 5);
  const index: RotationIndex = {};
  for (const rawSeason of recent) {
    const season = normalizeSeasonRecord(rawSeason);
    for (const harvest of season.harvests ?? []) {
      const environmentId = harvest.environmentId
        ?? season.runIds.map((runId) => runEnvironment.get(runId)).find((id): id is string => !!id)
        ?? (season.environmentIds.length === 1 ? season.environmentIds[0] : '')
        ?? '';
      const target = harvest.target ?? { kind: 'floor' as const };
      const key = scopedCellKey(environmentId, target, harvest.cell);
      (index[key] ??= []).push({ year: season.year, family: harvest.family });
    }
  }
  for (const records of Object.values(index)) {
    records.sort((a, b) => a.year - b.year || a.family.localeCompare(b.family));
  }
  return index;
}

export interface RotationHint {
  family: string;
  priorYears: number[];
  warning: boolean;
  message: string;
}

export function rotationHint(
  index: RotationIndex,
  environmentId: string | undefined,
  target: GrowingTargetRef,
  cell: string,
  family: string,
  currentYear: number,
): RotationHint | null {
  const priorYears = (index[scopedCellKey(environmentId ?? '', target, cell)] ?? [])
    .filter((entry) => entry.family === family && entry.year < currentYear)
    .map((entry) => entry.year)
    .sort((a, b) => b - a);
  if (priorYears.length === 0) return null;
  const warning = priorYears.some((year) => currentYear - year <= 3);
  const years = priorYears.join(', ');
  return {
    family,
    priorYears,
    warning,
    message: `${family} was grown here in ${years}${warning ? '; rotation is under 3 years' : ''}`,
  };
}
