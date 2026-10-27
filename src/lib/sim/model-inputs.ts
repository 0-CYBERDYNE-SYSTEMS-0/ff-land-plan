import { cropLibrary } from '@/data/crops';
import { archetypes, LEGACY_SURFACE_FOR_ARCHETYPE } from '@/creative/archetypes';
import type { SoilProfile } from '@/lib/soil';
import type { Crop, CropStartEvent } from '@/types';
import { cropThermalParams } from '@/data/cropThermalParams';
import { targetCellKey } from '@/lib/growingTargets';
import { isoDayNumber } from './environment';
import {
  DEFAULT_OUTDOOR_CO2_PPM,
  DEFAULT_OUTDOOR_RH_PCT,
  NO_CLIMATE_EQUIPMENT,
} from './environment-climate';
import type {
  CropCanopyEstablishmentInput,
  CropEstablishmentInput,
  EnvironmentModelInputsV2,
  FrozenCropModelParametersV2,
  FrozenCropModelParametersV3,
  FrozenCropModelParametersV4,
  RunConfig,
  RunModelInputs,
  RunModelInputsV1,
  RunModelInputsV3,
  RunModelInputsV4,
} from './types';

type FrozenCropProductionParameters = FrozenCropModelParametersV2['production'] | FrozenCropModelParametersV3['production'];

export interface RunModelSource {
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> & Partial<Pick<SoilProfile, 'source'>> | null;
  crops?: Crop[];
  cropParametersV2?: FrozenCropModelParametersV2[];
  cropParametersV4?: FrozenCropModelParametersV4[];
  cropEstablishmentByCell?: Record<string, CropEstablishmentInput>;
  cropCanopyEstablishmentByCell?: Record<string, CropCanopyEstablishmentInput>;
}

export interface RunModelSupport {
  model: 'crop-model-v1' | 'crop-model-v2' | 'crop-model-v3' | 'crop-model-v4' | 'unknown';
  status: 'supported' | 'qualified' | 'unsupported';
  canReplay: boolean;
  preserveStoredSummary: boolean;
  reasons: string[];
}

/** Freeze every live environment default and equipment term consulted by environment-v2. */
export function freezeEnvironmentModelInputsV2(
  config: RunConfig,
  initialClimateState: EnvironmentModelInputsV2['initialClimateState'] = null,
): EnvironmentModelInputsV2 | undefined {
  const environment = config.environment;
  const archetype = environment ? archetypes[environment.archetype] : undefined;
  if (!environment || !archetype) return undefined;
  const matchingCalibration = config.calibration?.farmId === config.farmId
    && config.calibration.environmentId === environment.id
    ? config.calibration.parameters
    : undefined;
  return {
    model: 'environment-inputs-v2',
    archetypeId: environment.archetype,
    legacySurface: LEGACY_SURFACE_FOR_ARCHETYPE[environment.archetype],
    archetype: structuredClone(archetype),
    noEquipment: structuredClone(NO_CLIMATE_EQUIPMENT),
    climateEquipment: structuredClone(config.climateEquipment ?? NO_CLIMATE_EQUIPMENT),
    climateTargetEquipment: structuredClone(config.climateTargetEquipment ?? {}),
    outdoorDefaults: { rhPct: DEFAULT_OUTDOOR_RH_PCT, co2Ppm: DEFAULT_OUTDOOR_CO2_PPM },
    modelOverrides: {
      coverTransmission: matchingCalibration?.coverTransmission ?? null,
      uValueWm2K: matchingCalibration?.uValueWm2K ?? null,
    },
    initialClimateState: initialClimateState ? structuredClone(initialClimateState) : null,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validClimateEquipment(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const equipment = value as Record<string, unknown>;
  const nonnegative = ['ppfdUmol', 'lightingW', 'photoperiodH', 'achBoost', 'heatingKw', 'coolingKw', 'dehumLpd', 'co2KgDay'];
  if (!nonnegative.every((key) => equipment[key] === undefined
    ? key === 'co2KgDay'
    : isFiniteNumber(equipment[key]) && equipment[key] >= 0)) return false;
  if (equipment.dehumDerateBelowRh !== undefined
    && (!isFiniteNumber(equipment.dehumDerateBelowRh) || equipment.dehumDerateBelowRh < 0 || equipment.dehumDerateBelowRh > 100)) return false;
  return equipment.co2TargetPpm === null
    || (isFiniteNumber(equipment.co2TargetPpm) && equipment.co2TargetPpm >= 350 && equipment.co2TargetPpm <= 1500);
}

function environmentModelInputsV2Issues(config: RunConfig): string[] {
  const value: unknown = config.environmentModelInputs;
  const issues: string[] = [];
  if (!config.environment) issues.push('Environment-v2 requires a frozen environment snapshot.');
  if (!value || typeof value !== 'object') {
    return [...issues, 'Frozen environment-v2 inputs are missing or have an unknown version.'];
  }
  const inputs = value as Record<string, unknown>;
  if (inputs.model !== 'environment-inputs-v2') issues.push('Frozen environment-v2 inputs are missing or have an unknown version.');
  if (inputs.archetypeId !== config.environment?.archetype) issues.push('Frozen environment-v2 archetype does not match the run environment.');
  if (!['outdoor', 'greenhouse', 'hoophouse', 'tent', 'indoor', 'warehouse'].includes(String(inputs.legacySurface))) {
    issues.push('Frozen environment-v2 surface mapping is missing or invalid.');
  }
  if (!validClimateEquipment(inputs.noEquipment)) issues.push('Frozen environment-v2 no-equipment defaults are missing or invalid.');
  if (!validClimateEquipment(inputs.climateEquipment)) issues.push('Frozen environment-v2 room equipment is missing or invalid.');
  const targetEquipment = inputs.climateTargetEquipment;
  if (!targetEquipment || typeof targetEquipment !== 'object' || Array.isArray(targetEquipment)
    || !Object.values(targetEquipment).every(validClimateEquipment)) {
    issues.push('Frozen environment-v2 target equipment is missing or invalid.');
  }
  const defaults = inputs.outdoorDefaults;
  if (!defaults || typeof defaults !== 'object'
    || !isFiniteNumber((defaults as Record<string, unknown>).rhPct)
    || (defaults as Record<string, number>).rhPct < 0 || (defaults as Record<string, number>).rhPct > 100
    || !isFiniteNumber((defaults as Record<string, unknown>).co2Ppm)
    || (defaults as Record<string, number>).co2Ppm < 350 || (defaults as Record<string, number>).co2Ppm > 1500) {
    issues.push('Frozen environment-v2 outdoor climate defaults are missing or invalid.');
  }
  const overrides = inputs.modelOverrides;
  const overrideRecord = overrides && typeof overrides === 'object'
    ? overrides as Record<string, unknown>
    : undefined;
  const coverTransmission = overrideRecord?.coverTransmission;
  const uValueWm2K = overrideRecord?.uValueWm2K;
  if (!overrideRecord || !('coverTransmission' in overrideRecord) || !('uValueWm2K' in overrideRecord)
    || (coverTransmission !== null
      && (!isFiniteNumber(coverTransmission) || coverTransmission < 0 || coverTransmission > 1))
    || (uValueWm2K !== null && (!isFiniteNumber(uValueWm2K) || uValueWm2K <= 0))) {
    issues.push('Frozen environment-v2 calibration overrides are missing or invalid.');
  }
  const initialClimateState = inputs.initialClimateState;
  if (initialClimateState !== null && (!initialClimateState || typeof initialClimateState !== 'object'
    || !['tMinC', 'tMaxC', 'rhPct', 'co2Ppm', 'etFactor'].every((key) =>
      isFiniteNumber((initialClimateState as Record<string, unknown>)[key])))
    || (initialClimateState !== null && typeof initialClimateState === 'object'
      && ((initialClimateState as Record<string, number>).tMaxC < (initialClimateState as Record<string, number>).tMinC
        || (initialClimateState as Record<string, number>).rhPct < 0
        || (initialClimateState as Record<string, number>).rhPct > 100
        || (initialClimateState as Record<string, number>).co2Ppm < 350
        || (initialClimateState as Record<string, number>).co2Ppm > 1500
        || (initialClimateState as Record<string, number>).etFactor < 0))) {
    issues.push('Frozen environment-v2 initial climate state is invalid.');
  }
  const archetype = inputs.archetype as Record<string, unknown> | undefined;
  const footprint = archetype?.defaultFootprint as Record<string, unknown> | undefined;
  const setpoints = archetype?.setpoints;
  const supportedArchetype = !!archetype
    && (archetype.kind === 'protected' || archetype.kind === 'sealed')
    && !!footprint && isFiniteNumber(footprint.wM) && footprint.wM > 0
    && isFiniteNumber(footprint.hM) && footprint.hM > 0
    && isFiniteNumber(archetype.defaultUsableHeightM) && archetype.defaultUsableHeightM > 0
    && isFiniteNumber(archetype.volumePerM2) && archetype.volumePerM2 > 0
    && isFiniteNumber(archetype.coverTransmission) && archetype.coverTransmission >= 0 && archetype.coverTransmission <= 1
    && isFiniteNumber(archetype.uValueWm2K) && archetype.uValueWm2K > 0
    && isFiniteNumber(archetype.achInfiltration) && archetype.achInfiltration >= 0
    && isFiniteNumber(archetype.achVented) && archetype.achVented >= 0
    && isFiniteNumber(archetype.maxDliMol) && archetype.maxDliMol >= 0
    && isFiniteNumber(archetype.etFactor) && archetype.etFactor >= 0
    && typeof archetype.dliMode === 'string'
    && typeof archetype.rainEnters === 'boolean'
    && !!setpoints && typeof setpoints === 'object'
    && Object.values(setpoints).every(isFiniteNumber);
  if (!supportedArchetype) issues.push('Frozen environment-v2 archetype defaults are missing or invalid.');
  return [...new Set(issues)];
}

function cropIdsFor(config: RunConfig): number[] {
  const ids = new Set<number>(Object.values(config.basePlan.planting ?? {}));
  for (const target of Object.values(config.basePlan.targets ?? {})) {
    Object.values(target.planting).forEach((id) => ids.add(id));
  }
  for (const intervention of config.interventions) {
    if (intervention.kind === 'plant') ids.add(intervention.cropId);
  }
  return [...ids].sort((a, b) => a - b);
}

function usesSoillessTarget(config: RunConfig): boolean {
  if (Object.values(config.basePlan.ground ?? {}).some((slug) => slug.includes('hydro'))
    || Object.values(config.assetPhysics?.soillessCells ?? {}).some((cells) => (cells?.length ?? 0) > 0)
    || Object.values(config.assetPhysics?.hydroRequiredCells ?? {}).some((cells) => (cells?.length ?? 0) > 0)) return true;
  const hydroSpaces = new Set((config.environment?.layout?.growingSpaces ?? [])
    .filter((space) => space.kind === 'hydro')
    .map((space) => space.id));
  if (Object.values(config.basePlan.targets ?? {}).some((target) => hydroSpaces.has(target.growingSpaceId))) return true;
  return config.interventions.some((intervention) => intervention.kind === 'plant'
    && intervention.target?.kind === 'growing-level'
    && hydroSpaces.has(intervention.target.growingSpaceId));
}

function thermalParametersComplete(parameter: FrozenCropModelParametersV2['thermal']): boolean {
  if (!parameter) return false;
  if (!Array.isArray(parameter.gddToMaturityCdays) || parameter.gddToMaturityCdays.length !== 2
    || typeof parameter.accumulationMethod !== 'string'
    || typeof parameter.accumulationStart !== 'string'
    || typeof parameter.maturityEndpoint !== 'string'
    || typeof parameter.sourceCitation !== 'string'
    || typeof parameter.sourceUrl !== 'string') return false;
  if (!Array.isArray(parameter.startEvents) || parameter.startEvents.length === 0
    || !parameter.startEvents.every((event) => event === 'direct-sowing' || event === 'transplanting')) return false;
  const method = parameter.accumulationMethod.toLowerCase();
  const supportedMethod = method.includes('single sine')
    || method.includes('max–min')
    || method.includes('max-min')
    || method.includes('study thermal-time')
    || method.includes('study heat-unit');
  return Number.isFinite(parameter.tBaseC)
    && (parameter.tUpperC === undefined
      || (Number.isFinite(parameter.tUpperC) && parameter.tUpperC > parameter.tBaseC))
    && parameter.gddToMaturityCdays.every((target) => Number.isFinite(target) && target > 0)
    && parameter.gddToMaturityCdays[0] <= parameter.gddToMaturityCdays[1]
    && parameter.accumulationStart.trim().length > 0
    && parameter.maturityEndpoint.trim().length > 0
    && parameter.sourceCitation.trim().length > 0
    && parameter.sourceUrl.trim().length > 0
    && supportedMethod;
}

function productionParametersComplete(
  parameter: FrozenCropProductionParameters,
  requireInitialDryMatter = true,
): boolean {
  if (!parameter || !Array.isArray(parameter.missing)) return false;
  const evidence = parameter.evidence;
  if (!evidence || ![evidence.evidenceId, evidence.sourceCitation, evidence.sourceUrl, evidence.validDomain]
    .every((value) => typeof value === 'string' && value.trim().length > 0)) return false;
  return parameter.equationFamily === 'LINTUL-net-RUE'
    && (parameter.status === 'supported'
      || (parameter.status === 'qualified' && (parameter.limitations?.length ?? 0) > 0))
    && parameter.missing.length === 0
    && parameter.rueGPerMjInterceptedPar !== null
    && Number.isFinite(parameter.rueGPerMjInterceptedPar)
    && parameter.rueGPerMjInterceptedPar >= 0
    && (!requireInitialDryMatter || ('initialDryMatterGPerM2' in parameter
      && parameter.initialDryMatterGPerM2 !== null
      && Number.isFinite(parameter.initialDryMatterGPerM2)
      && parameter.initialDryMatterGPerM2 >= 0))
    && parameter.interceptedParFraction !== null
    && Number.isFinite(parameter.interceptedParFraction)
    && parameter.interceptedParFraction >= 0
    && parameter.interceptedParFraction <= 1
    && parameter.harvestIndex !== null
    && Number.isFinite(parameter.harvestIndex)
    && parameter.harvestIndex >= 0
    && parameter.harvestIndex <= 1;
}

function productionParametersV4Complete(parameter: FrozenCropModelParametersV4['production']): boolean {
  const evidenceComplete = (evidence: FrozenCropModelParametersV4['production']['evidence']) =>
    !!evidence && [evidence.evidenceId, evidence.sourceCitation, evidence.sourceUrl, evidence.validDomain]
      .every((value) => typeof value === 'string' && value.trim().length > 0);
  const canopy = parameter?.canopy;
  const allocation = parameter?.allocation;
  return !!parameter
    && Array.isArray(parameter.missing)
    && parameter.equationFamily === 'LINTUL-net-RUE'
    && (parameter.status === 'supported'
      || (parameter.status === 'qualified' && (parameter.limitations?.length ?? 0) > 0))
    && parameter.missing.length === 0
    && parameter.rueGPerMjInterceptedPar !== null
    && Number.isFinite(parameter.rueGPerMjInterceptedPar)
    && parameter.rueGPerMjInterceptedPar >= 0
    && evidenceComplete(parameter.evidence)
    && !!canopy
    && [canopy.kPar, canopy.specificLeafAreaM2PerKg, canopy.leafStemPartitionParameterM2PerKg]
      .every((value) => value !== null && Number.isFinite(value) && value >= 0)
    && evidenceComplete(canopy.evidence)
    && !!allocation
    && allocation.canopyShare !== null
    && Number.isFinite(allocation.canopyShare)
    && allocation.canopyShare >= 0 && allocation.canopyShare <= 1
    && allocation.harvestableShare !== null
    && Number.isFinite(allocation.harvestableShare)
    && allocation.harvestableShare >= 0 && allocation.harvestableShare <= 1
    && allocation.canopyShare + allocation.harvestableShare === 1
    && (allocation.classification === 'measured'
      || allocation.classification === 'explicit-assumption'
      || allocation.classification === 'synthetic')
    && typeof allocation.evidenceId === 'string' && allocation.evidenceId.trim().length > 0
    && typeof allocation.validDomain === 'string' && allocation.validDomain.trim().length > 0;
}

function rootDevelopmentParametersComplete(
  development: FrozenCropModelParametersV2['rootZone']['rootDevelopment'],
): boolean {
  if (development === undefined) return true;
  if (!development || typeof development !== 'object') return false;
  const evidence = development.evidence;
  if (!evidence || typeof evidence !== 'object'
    || ![evidence.evidenceId, evidence.sourceCitation, evidence.sourceUrl, evidence.validDomain]
      .every((value) => typeof value === 'string' && value.trim().length > 0)) return false;
  return development.methodVersion === 'thermal-linear-root-depth-v1'
    && development.storageExpansionMethod === 'uniform-initial-awc-fraction-v1'
    && (development.startEvent === 'direct-sowing' || development.startEvent === 'transplanting')
    && Number.isFinite(development.initialRootDepthCm)
    && development.initialRootDepthCm > 0
    && Number.isFinite(development.growthStartsAfterCdays)
    && development.growthStartsAfterCdays >= 0
    && Number.isFinite(development.growthMmPerCday)
    && development.growthMmPerCday >= 0
    && Number.isFinite(development.thermalBaseC)
    && (development.thermalUpperC === undefined
      || (Number.isFinite(development.thermalUpperC) && development.thermalUpperC > development.thermalBaseC))
    && typeof development.thermalAccumulationMethod === 'string'
    && development.thermalAccumulationMethod.toLowerCase().includes('single sine');
}

function rootZoneParametersComplete(parameter: FrozenCropModelParametersV2['rootZone']): boolean {
  if (!parameter || !Array.isArray(parameter.missing)) return false;
  const evidence = parameter.evidence;
  if (!evidence || ![evidence.evidenceId, evidence.sourceCitation, evidence.sourceUrl, evidence.validDomain]
    .every((value) => typeof value === 'string' && value.trim().length > 0)) return false;
  return parameter.method === 'FAO-56'
    && (parameter.status === 'supported'
      || (parameter.status === 'qualified' && (parameter.limitations?.length ?? 0) > 0))
    && parameter.missing.length === 0
    && parameter.effectiveRootDepthCm !== null
    && Number.isFinite(parameter.effectiveRootDepthCm)
    && parameter.effectiveRootDepthCm > 0
    && parameter.depletionFraction !== null
    && Number.isFinite(parameter.depletionFraction)
    && parameter.depletionFraction >= 0
    && parameter.depletionFraction <= 1
    && parameter.cropCoefficient !== null
    && Number.isFinite(parameter.cropCoefficient)
    && parameter.cropCoefficient >= 0
    && parameter.initialStorageFraction !== null
    && Number.isFinite(parameter.initialStorageFraction)
    && parameter.initialStorageFraction >= 0
    && parameter.initialStorageFraction <= 1
    && (parameter.rootDevelopment === undefined
      || (rootDevelopmentParametersComplete(parameter.rootDevelopment)
        && parameter.rootDevelopment.initialRootDepthCm <= parameter.effectiveRootDepthCm));
}

function soilQualificationReasons(
  soil: Extract<RunModelInputs, { model: 'run-inputs-v2' }>['soil'],
  model: 'v2' | 'v4' = 'v2',
): string[] {
  if (!soil) return [];
  const reasons: string[] = [];
  if (soil.source !== 'usda-sda' && soil.source !== 'soilgrids') {
    reasons.push(`Frozen ${model} soil AWC provenance is unknown.`);
  }
  if (soil.source === 'soilgrids' && typeof soil.awcMmPerCm === 'number' && Number.isFinite(soil.awcMmPerCm)) {
    reasons.push(`Frozen ${model} numeric soil AWC is paired with SoilGrids classification-only provenance.`);
  }
  return reasons;
}

function cropStartEventChecks(
  config: RunConfig,
  parameters: Array<Pick<FrozenCropModelParametersV2, 'cropId' | 'thermal' | 'rootZone'>>,
): {
  issues: string[];
  qualifications: string[];
} {
  const byCropId = new Map(parameters.map((parameter) => [parameter.cropId, parameter]));
  const starts: Array<{ cropId: number; event?: CropStartEvent; date?: string }> = [];
  const floor = { kind: 'floor' as const };
  for (const [cell, cropId] of Object.entries(config.basePlan.planting ?? {})) {
    const key = targetCellKey(floor, cell);
    starts.push({ cropId, event: config.cropStartEvents?.[key], date: config.basePlan.plantedAt?.[cell] });
  }
  for (const target of Object.values(config.basePlan.targets ?? {})) {
    const ref = { kind: 'growing-level' as const, growingSpaceId: target.growingSpaceId, levelId: target.levelId };
    for (const [cell, cropId] of Object.entries(target.planting)) {
      const key = targetCellKey(ref, cell);
      starts.push({ cropId, event: config.cropStartEvents?.[key], date: target.plantedAt?.[cell] });
    }
  }
  for (const intervention of config.interventions) {
    if (intervention.kind !== 'plant') continue;
    starts.push({
      cropId: intervention.cropId,
      event: intervention.startEvent,
      date: intervention.date,
    });
  }

  const issues = new Set<string>();
  const qualifications = new Set<string>();
  const runStartDay = isoDayNumber(config.startDate);
  for (const start of starts) {
    const parameter = byCropId.get(start.cropId);
    if (start.date && isoDayNumber(start.date) < runStartDay) {
      issues.add(`Crop ${start.cropId}: establishment date predates run start; frozen as-of-start crop state and prior environment are missing.`);
    }
    if (!start.event) {
      issues.add(`Crop ${start.cropId}: frozen sowing/transplanting event is missing for one or more cells.`);
      continue;
    }
    if (start.event !== 'direct-sowing' && start.event !== 'transplanting') {
      issues.add(`Crop ${start.cropId}: frozen start event is unknown.`);
      continue;
    }
    if (!parameter?.thermal?.startEvents.includes(start.event)) {
      issues.add(`Crop ${start.cropId}: frozen ${start.event} event is outside the thermal source start-event domain.`);
    }
    if (start.event === 'direct-sowing') {
      if (config.cropModelVersion !== 'crop-model-v3' && config.cropModelVersion !== 'crop-model-v4') {
        qualifications.add(`Crop ${start.cropId}: thermal, light-driven production, and root-zone transpiration start on the sowing date; emergence delay and seed reserves are not modeled.`);
      }
    }
    const rootStartEvent = parameter?.rootZone.rootDevelopment?.startEvent;
    if (rootStartEvent && rootStartEvent !== start.event) {
      qualifications.add(`Crop ${start.cropId}: root-depth reference starts at ${rootStartEvent}, while this run starts at ${start.event}; root development is outside its source event domain.`);
    }
  }
  return { issues: [...issues], qualifications: [...qualifications] };
}

function cropEstablishmentChecks(
  config: RunConfig,
  establishmentByCell: Record<string, CropEstablishmentInput>,
  parameters: Array<Pick<FrozenCropModelParametersV2, 'cropId' | 'thermal' | 'rootZone'>>,
): { issues: string[]; qualifications: string[] } {
  const byCropId = new Map(parameters.map((parameter) => [parameter.cropId, parameter]));
  const starts: Array<{
    key: string;
    cropId: number;
    event?: CropStartEvent;
    plantingDate: string;
    input?: CropEstablishmentInput;
  }> = [];
  const floor = { kind: 'floor' as const };
  for (const [cell, cropId] of Object.entries(config.basePlan.planting ?? {})) {
    const key = targetCellKey(floor, cell);
    starts.push({
      key,
      cropId,
      event: config.cropStartEvents?.[key],
      plantingDate: config.basePlan.plantedAt?.[cell] ?? config.startDate,
      input: establishmentByCell[key],
    });
  }
  for (const target of Object.values(config.basePlan.targets ?? {})) {
    const ref = { kind: 'growing-level' as const, growingSpaceId: target.growingSpaceId, levelId: target.levelId };
    for (const [cell, cropId] of Object.entries(target.planting)) {
      const key = targetCellKey(ref, cell);
      starts.push({
        key,
        cropId,
        event: config.cropStartEvents?.[key],
        plantingDate: target.plantedAt?.[cell] ?? config.startDate,
        input: establishmentByCell[key],
      });
    }
  }
  const knownKeys = new Set(starts.map((start) => start.key));
  const issues = new Set<string>();
  const qualifications = new Set<string>();
  const runStart = isoDayNumber(config.startDate);
  for (const start of starts) {
    const input = start.input;
    if (!input) {
      issues.add(`Crop ${start.cropId}: frozen per-cell emergence/transplant initial state is missing for ${start.key}.`);
      continue;
    }
    if (!start.event || input.startEvent !== start.event) {
      issues.add(`Crop ${start.cropId}: establishment state does not match its frozen ${start.event ?? 'unknown'} start event.`);
    }
    const startDay = isoDayNumber(start.plantingDate);
    const establishedDay = isoDayNumber(input.establishedAtDate);
    if (!Number.isFinite(startDay) || !Number.isFinite(establishedDay)) {
      issues.add(`Crop ${start.cropId}: frozen establishment dates are invalid.`);
      continue;
    }
    if (startDay < runStart || establishedDay < runStart) {
      issues.add(`Crop ${start.cropId}: establishment predates run start; frozen as-of-start state and prior environment are missing.`);
    }
    if (start.event === 'direct-sowing' && establishedDay < startDay) {
      issues.add(`Crop ${start.cropId}: emergence date precedes its direct-sowing date.`);
    }
    if (start.event === 'transplanting' && establishedDay !== startDay) {
      issues.add(`Crop ${start.cropId}: transplant initial state date must match the transplant event date.`);
    }
    if (!Number.isFinite(input.initialAboveGroundDryMatterGPerM2)
      || input.initialAboveGroundDryMatterGPerM2 < 0) {
      issues.add(`Crop ${start.cropId}: initial above-ground dry matter must be finite and nonnegative.`);
    }
    if (!input.evidence
      || typeof input.evidence.evidenceId !== 'string' || !input.evidence.evidenceId.trim()
      || typeof input.evidence.validDomain !== 'string' || !input.evidence.validDomain.trim()) {
      issues.add(`Crop ${start.cropId}: establishment state evidence and valid domain are required.`);
    } else if (input.evidence.classification !== 'measured'
      && input.evidence.classification !== 'explicit-assumption'
      && input.evidence.classification !== 'synthetic') {
      issues.add(`Crop ${start.cropId}: establishment evidence classification is unknown.`);
    } else if (input.evidence.classification === 'synthetic') {
      qualifications.add(`Crop ${start.cropId}: synthetic establishment state is a software fixture, not biological evidence.`);
    } else if (input.evidence.classification === 'explicit-assumption') {
      qualifications.add(`Crop ${start.cropId}: establishment dry matter is an explicit assumption, not a measured initial state.`);
    }
    if (!byCropId.get(start.cropId)?.thermal?.startEvents.includes(start.event!)) {
      issues.add(`Crop ${start.cropId}: ${start.event ?? 'unknown'} event is outside the frozen thermal-source domain.`);
    }
    const rootDevelopment = byCropId.get(start.cropId)?.rootZone.rootDevelopment;
    if (start.event === 'direct-sowing' && establishedDay > startDay && rootDevelopment) {
      issues.add(`Crop ${start.cropId}: sowing-start root development cannot be shifted to a delayed emergence date without an emergence-relative root profile.`);
    }
  }
  for (const key of Object.keys(establishmentByCell)) {
    if (!knownKeys.has(key)) issues.add(`Frozen establishment input ${key} does not reference a planted target cell.`);
  }
  for (const intervention of config.interventions) {
    if (intervention.kind !== 'plant') continue;
    const input = intervention.establishment;
    if (!input || !intervention.startEvent || input.startEvent !== intervention.startEvent
      || !('initialAboveGroundDryMatterGPerM2' in input)
      || (input.startEvent !== 'direct-sowing' && input.startEvent !== 'transplanting')) {
      issues.add(`Crop ${intervention.cropId}: plant intervention requires a matching frozen establishment initial state.`);
      continue;
    }
    const eventDay = isoDayNumber(intervention.date);
    const establishedDay = isoDayNumber(input.establishedAtDate);
    if (!Number.isFinite(eventDay) || !Number.isFinite(establishedDay)
      || establishedDay < eventDay
      || (input.startEvent === 'transplanting' && establishedDay !== eventDay)) {
      issues.add(`Crop ${intervention.cropId}: plant intervention establishment date is invalid for ${input.startEvent}.`);
    }
    if (!Number.isFinite(input.initialAboveGroundDryMatterGPerM2)
      || input.initialAboveGroundDryMatterGPerM2 < 0
      || typeof input.evidence?.evidenceId !== 'string' || !input.evidence.evidenceId.trim()
      || typeof input.evidence?.validDomain !== 'string' || !input.evidence.validDomain.trim()) {
      issues.add(`Crop ${intervention.cropId}: plant intervention initial dry matter and evidence are required.`);
    }
    if (input.evidence?.classification !== 'measured'
      && input.evidence?.classification !== 'explicit-assumption'
      && input.evidence?.classification !== 'synthetic') {
      issues.add(`Crop ${intervention.cropId}: plant intervention establishment evidence classification is unknown.`);
    } else if (input.evidence.classification === 'synthetic') {
      qualifications.add(`Crop ${intervention.cropId}: synthetic establishment state is a software fixture, not biological evidence.`);
    } else if (input.evidence.classification === 'explicit-assumption') {
      qualifications.add(`Crop ${intervention.cropId}: establishment dry matter is an explicit assumption, not a measured initial state.`);
    }
    const rootDevelopment = byCropId.get(intervention.cropId)?.rootZone.rootDevelopment;
    if (input.startEvent === 'direct-sowing' && establishedDay > eventDay && rootDevelopment) {
      issues.add(`Crop ${intervention.cropId}: sowing-start root development cannot be shifted to a delayed emergence date without an emergence-relative root profile.`);
    }
  }
  return { issues: [...issues], qualifications: [...qualifications] };
}

function cropCanopyEstablishmentChecks(
  config: RunConfig,
  establishmentByCell: Record<string, CropCanopyEstablishmentInput>,
  parameters: Array<Pick<FrozenCropModelParametersV2, 'cropId' | 'thermal' | 'rootZone'>>,
): { issues: string[]; qualifications: string[] } {
  const issues = new Set<string>();
  const toAboveGroundInput = (input: CropCanopyEstablishmentInput | CropEstablishmentInput | undefined): CropEstablishmentInput | undefined => {
    if (!input || !('initialCanopyDryMatterGPerM2' in input)) return undefined;
    const canopy = input.initialCanopyDryMatterGPerM2;
    const harvestable = input.initialHarvestableDryMatterGPerM2;
    if (!Number.isFinite(canopy) || canopy < 0 || !Number.isFinite(harvestable) || harvestable < 0) {
      issues.add('V4 initial canopy and harvestable dry-matter pools must each be finite and nonnegative.');
    }
    return {
      startEvent: input.startEvent,
      establishedAtDate: input.establishedAtDate,
      initialAboveGroundDryMatterGPerM2: canopy + harvestable,
      evidence: input.evidence,
    };
  };
  const mappedEstablishment: Record<string, CropEstablishmentInput> = {};
  for (const [key, input] of Object.entries(establishmentByCell)) {
    const mapped = toAboveGroundInput(input);
    if (mapped) mappedEstablishment[key] = mapped;
    else issues.add(`Crop establishment input ${key}: v4 canopy and harvestable pools are required.`);
  }
  const mappedConfig: RunConfig = {
    ...config,
    interventions: config.interventions.map((intervention) => intervention.kind === 'plant'
      ? { ...intervention, establishment: toAboveGroundInput(intervention.establishment) }
      : intervention),
  };
  const checked = cropEstablishmentChecks(mappedConfig, mappedEstablishment, parameters);
  checked.issues.forEach((issue) => issues.add(issue));

  return { issues: [...issues], qualifications: checked.qualifications };
}

/** Inspect replay compatibility without consulting live catalog or soil data. */
export function inspectRunModelSupport(config: RunConfig, persisted = true): RunModelSupport {
  const requiredCropIds = cropIdsFor(config);
  const inputs = config.modelInputs;
  const inputCrops = Array.isArray(inputs?.crops) ? inputs.crops : [];
  const inputCropIds = new Set(inputCrops.map((crop) => crop.id));
  const missingCropIds = requiredCropIds.filter((cropId) => !inputCropIds.has(cropId));
  const hasCompleteCropSnapshot = !!inputs && missingCropIds.length === 0;
  const climateModel = config.climateModel as string | undefined;

  if (climateModel !== undefined && climateModel !== 'environment-v1' && climateModel !== 'environment-v2') {
    return {
      model: config.cropModelVersion ?? 'crop-model-v1', status: 'unsupported', canReplay: false,
      preserveStoredSummary: persisted, reasons: [`Unknown environment model version: ${climateModel}.`],
    };
  }
  if (climateModel === 'environment-v2' && config.cropModelVersion !== 'crop-model-v4') {
    return {
      model: config.cropModelVersion ?? 'crop-model-v1', status: 'unsupported', canReplay: false,
      preserveStoredSummary: persisted,
      reasons: ['Environment-v2 requires explicit crop-model-v4 with complete run-inputs-v4.'],
    };
  }

  if (config.cropModelVersion === 'crop-model-v2') {
    if (inputs?.model !== 'run-inputs-v2' || inputs.parameterSetVersion !== 'crop-parameters-v3') {
      return {
        model: 'crop-model-v2', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v2 parameter inputs are missing or have an unknown version.'],
      };
    }
    if (!Array.isArray(inputs.crops) || !Array.isArray(inputs.cropParameters)
      || !inputs.qualification || !Array.isArray(inputs.qualification.reasons)) {
      return {
        model: 'crop-model-v2', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v2 inputs have an invalid shape.'],
      };
    }
    const parameterIds = new Set(inputs.cropParameters.map((parameter) => parameter.cropId));
    const missingParameters = requiredCropIds.filter((cropId) => !parameterIds.has(cropId));
    const invalidParameters = inputs.cropParameters.filter((parameter) =>
      !thermalParametersComplete(parameter.thermal)
      || !productionParametersComplete(parameter.production)
      || !rootZoneParametersComplete(parameter.rootZone)
      || parameter.lifecycle !== 'plant',
    );
    const startEventChecks = cropStartEventChecks(config, inputs.cropParameters);
    const reasons = [
      ...inputs.qualification.reasons,
      ...(missingCropIds.length ? [`Frozen crop records are missing for crop IDs ${missingCropIds.join(', ')}.`] : []),
      ...(missingParameters.length ? [`Frozen crop parameters are missing for crop IDs ${missingParameters.join(', ')}.`] : []),
      ...(inputs.cropParameters.length !== parameterIds.size ? ['Frozen v2 crop parameters contain duplicate crop IDs.'] : []),
      ...(inputs.soil?.awcMmPerCm === undefined || inputs.soil.awcMmPerCm === null
        || !Number.isFinite(inputs.soil.awcMmPerCm) || inputs.soil.awcMmPerCm <= 0
        ? ['Frozen v2 soil available-water capacity is missing or invalid.']
        : []),
      ...soilQualificationReasons(inputs.soil),
      ...startEventChecks.issues,
      ...startEventChecks.qualifications,
      ...(usesSoillessTarget(config) ? ['Soilless targets require the separate 02B resource model.'] : []),
      ...invalidParameters.map((parameter) => `Crop ${parameter.cropId}: one or more frozen v2 parameter values are missing, invalid, or unsupported.`),
    ];
    const complete = hasCompleteCropSnapshot
      && missingParameters.length === 0
      && inputs.cropParameters.length === parameterIds.size
      && (inputs.soil?.awcMmPerCm ?? 0) > 0
      && !usesSoillessTarget(config)
      && startEventChecks.issues.length === 0
      && (inputs.qualification.status === 'supported'
        || (inputs.qualification.status === 'qualified' && inputs.qualification.reasons.length > 0))
      && inputs.cropParameters.every((parameter) =>
        thermalParametersComplete(parameter.thermal)
        && productionParametersComplete(parameter.production)
        && rootZoneParametersComplete(parameter.rootZone)
        && parameter.lifecycle === 'plant',
      );
    if (complete) {
      return {
        model: 'crop-model-v2', status: 'qualified', canReplay: true, preserveStoredSummary: false,
        reasons: [
          ...inputs.qualification.reasons,
          'Empirical v2 crop-model accuracy remains UNVERIFIED for this parameter set.',
          'v2 dry-matter production currently applies the FAO-56 water stress coefficient; nutrient and temperature production stress factors are not parameterized.',
          'PAR interception is a fixed fraction; dynamic canopy/LAI development is not modeled.',
          ...(config.climateModel === 'environment-v1' && config.environment
            && archetypes[config.environment.archetype]?.kind !== 'open'
            ? ['Enclosed v2 climate transpiration is lagged potential ET using frozen, stage-independent root-zone Kc and the previous climate ET factor; it is not reduced by current root-zone Ks. CO₂ uptake uses thermal progress times fixed PAR interception as a qualified leaf-area proxy, not measured LAI.']
            : []),
          'Surface runoff is assumed to be 0 mm/day because the run has no frozen runoff input; infiltration and runoff uncertainty remain unmodeled.',
          ...(inputs.cropParameters.some((parameter) => parameter.rootZone.rootDevelopment)
            ? ['Root development uses a frozen source profile; new subsoil storage is added at the frozen initial available-water fraction as an explicit root-growth inflow. Vertical soil-water layering and rooting barriers are not modeled.']
            : ['Effective root depth is held at the frozen value; root growth and rooting barriers are not modeled.']),
          ...(config.environment && config.climateModel !== 'environment-v1' && config.climateModel !== 'environment-v2'
            && archetypes[config.environment.archetype]?.kind !== 'open'
            && archetypes[config.environment.archetype]?.dliMode !== 'supplement-only'
            ? ['Without an environment-v1 climate state, enclosed natural DLI uses frozen calibration cover transmission when present, otherwise the archetype default; only explicitly frozen target lighting is included.']
            : []),
          'Thermal accumulation starts on the frozen direct-sowing or transplanting event date; unmodeled seed reserves and nursery growth are excluded.',
          ...startEventChecks.qualifications,
          'Crop root-zone and enclosure transpiration stop at the frozen source maturity endpoint or harvest; v1 postharvest behavior is preserved.',
          ...soilQualificationReasons(inputs.soil),
        ],
      };
    }
    return {
      model: 'crop-model-v2',
      status: 'unsupported',
      canReplay: false,
      preserveStoredSummary: persisted,
      reasons: [...new Set(reasons)],
    };
  }

  if (config.cropModelVersion === 'crop-model-v3') {
    if (inputs?.model !== 'run-inputs-v3' || inputs.parameterSetVersion !== 'crop-parameters-v4') {
      return {
        model: 'crop-model-v3', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v3 establishment inputs are missing or have an unknown version.'],
      };
    }
    if (!Array.isArray(inputs.crops) || !Array.isArray(inputs.cropParameters)
      || !inputs.establishmentByCell || typeof inputs.establishmentByCell !== 'object'
      || !inputs.qualification
      || !['supported', 'qualified', 'unsupported'].includes(inputs.qualification.status)
      || !Array.isArray(inputs.qualification.reasons)
      || !inputs.qualification.reasons.every((reason) => typeof reason === 'string')) {
      return {
        model: 'crop-model-v3', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v3 inputs have an invalid shape.'],
      };
    }
    const parameterIds = new Set(inputs.cropParameters.map((parameter) => parameter.cropId));
    const missingParameters = requiredCropIds.filter((cropId) => !parameterIds.has(cropId));
    const invalidParameters = inputs.cropParameters.filter((parameter) =>
      !thermalParametersComplete(parameter.thermal)
      || !productionParametersComplete(parameter.production, false)
      || !rootZoneParametersComplete(parameter.rootZone)
      || parameter.lifecycle !== 'plant',
    );
    const starts = cropStartEventChecks(config, inputs.cropParameters);
    const establishment = cropEstablishmentChecks(config, inputs.establishmentByCell, inputs.cropParameters);
    const reasons = [
      ...inputs.qualification.reasons,
      ...(missingCropIds.length ? [`Frozen crop records are missing for crop IDs ${missingCropIds.join(', ')}.`] : []),
      ...(missingParameters.length ? [`Frozen crop parameters are missing for crop IDs ${missingParameters.join(', ')}.`] : []),
      ...(inputs.cropParameters.length !== parameterIds.size ? ['Frozen v3 crop parameters contain duplicate crop IDs.'] : []),
      ...(inputs.soil?.awcMmPerCm === undefined || inputs.soil.awcMmPerCm === null
        || !Number.isFinite(inputs.soil.awcMmPerCm) || inputs.soil.awcMmPerCm <= 0
        ? ['Frozen v3 soil available-water capacity is missing or invalid.']
        : []),
      ...soilQualificationReasons(inputs.soil),
      ...starts.issues,
      ...establishment.issues,
      ...(usesSoillessTarget(config) ? ['Soilless targets require the separate 02B resource model.'] : []),
      ...invalidParameters.map((parameter) => `Crop ${parameter.cropId}: one or more frozen v3 parameter values are missing, invalid, or unsupported.`),
    ];
    const complete = hasCompleteCropSnapshot
      && missingParameters.length === 0
      && inputs.cropParameters.length === parameterIds.size
      && (inputs.soil?.awcMmPerCm ?? 0) > 0
      && !usesSoillessTarget(config)
      && starts.issues.length === 0
      && establishment.issues.length === 0
      && inputs.qualification.status !== 'unsupported'
      && inputs.cropParameters.every((parameter) =>
        thermalParametersComplete(parameter.thermal)
        && productionParametersComplete(parameter.production, false)
        && rootZoneParametersComplete(parameter.rootZone)
        && parameter.lifecycle === 'plant',
      );
    if (complete) {
      return {
        model: 'crop-model-v3', status: 'qualified', canReplay: true, preserveStoredSummary: false,
        reasons: [
          ...inputs.qualification.reasons,
          ...establishment.qualifications,
          ...starts.qualifications,
          ...inputs.cropParameters
            .filter((parameter) => parameter.thermal
              && parameter.thermal.gddToMaturityCdays[0] !== parameter.thermal.gddToMaturityCdays[1])
            .map((parameter) => `Crop ${parameter.cropId}: maturity is a source target range; the endpoint uses the conservative upper target.`),
          'Empirical v3 crop-model accuracy remains UNVERIFIED for this parameter set.',
          'Direct-sown crop production, plant uptake, dynamic root growth and plant stress begin only on the frozen emergence date; the separate source-event thermal clock starts at sowing and controls the source maturity endpoint.',
          'A separate physiology thermal accumulator starts at establishment; intermediate v3 crop-stage mapping has no source support, so stage remains unavailable throughout the run, including at and after the maturity endpoint.',
          'The 3D crop mesh remains at its smallest juvenile archetype pose throughout the run, including after maturity; it is an illustrative placeholder, not crop growth or a stage estimate.',
          'No seed reserve dynamics are modeled; the explicit above-ground dry-matter state begins at emergence or transplant.',
          'The model does not predict field emergence; establishment dates and initial per-cell dry matter are frozen inputs.',
          'v3 dry-matter production uses the legacy maximum-stress response across water, heat, cold, nitrogen, known light stress, antagonists, and lagged pest pressure; these factors are not crop-calibrated.',
          'v3 terminal mortality reuses the legacy visual frost/chronic-stress thresholds; it is a qualified heuristic, not a crop-specific mortality model.',
          'PAR interception is a fixed fraction; dynamic canopy/LAI development is not modeled.',
          'Surface runoff is assumed to be 0 mm/day because the run has no frozen runoff input; infiltration and runoff uncertainty remain unmodeled.',
          ...(inputs.cropParameters.some((parameter) => parameter.rootZone.rootDevelopment)
            ? ['Root development uses the frozen profile only after its declared start event; new subsoil storage is added at the frozen initial available-water fraction as an explicit root-growth inflow. Vertical soil-water layering and rooting barriers are not modeled.']
            : ['Effective root depth is held at the frozen value; dynamic root growth and rooting barriers are not modeled.']),
          'Crop root-zone and enclosure transpiration stop at the frozen source maturity endpoint or harvest; v1/v2 replay behavior is preserved.',
          ...soilQualificationReasons(inputs.soil),
        ],
      };
    }
    return {
      model: 'crop-model-v3', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
      reasons: [...new Set(reasons)],
    };
  }

  if (config.cropModelVersion === 'crop-model-v4') {
    if (inputs?.model !== 'run-inputs-v4' || inputs.parameterSetVersion !== 'crop-parameters-v5') {
      return {
        model: 'crop-model-v4', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v4 canopy-pool inputs are missing or have an unknown version.'],
      };
    }
    if (!Array.isArray(inputs.crops) || !Array.isArray(inputs.cropParameters)
      || !inputs.establishmentByCell || typeof inputs.establishmentByCell !== 'object'
      || !inputs.qualification
      || !['supported', 'qualified', 'unsupported'].includes(inputs.qualification.status)
      || !Array.isArray(inputs.qualification.reasons)
      || !inputs.qualification.reasons.every((reason) => typeof reason === 'string')) {
      return {
        model: 'crop-model-v4', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v4 inputs have an invalid shape.'],
      };
    }
    const parameterIds = new Set(inputs.cropParameters.map((parameter) => parameter.cropId));
    const missingParameters = requiredCropIds.filter((cropId) => !parameterIds.has(cropId));
    const invalidParameters = inputs.cropParameters.filter((parameter) =>
      !thermalParametersComplete(parameter.thermal)
      || !productionParametersV4Complete(parameter.production)
      || !rootZoneParametersComplete(parameter.rootZone)
      || parameter.lifecycle !== 'plant',
    );
    const starts = cropStartEventChecks(config, inputs.cropParameters);
    const establishment = cropCanopyEstablishmentChecks(config, inputs.establishmentByCell, inputs.cropParameters);
    const environmentIssues = climateModel === 'environment-v2'
      ? environmentModelInputsV2Issues(config)
      : [];
    const reasons = [
      ...inputs.qualification.reasons,
      ...(missingCropIds.length ? [`Frozen crop records are missing for crop IDs ${missingCropIds.join(', ')}.`] : []),
      ...(missingParameters.length ? [`Frozen crop parameters are missing for crop IDs ${missingParameters.join(', ')}.`] : []),
      ...(inputs.cropParameters.length !== parameterIds.size ? ['Frozen v4 crop parameters contain duplicate crop IDs.'] : []),
      ...(inputs.soil?.awcMmPerCm === undefined || inputs.soil.awcMmPerCm === null
        || !Number.isFinite(inputs.soil.awcMmPerCm) || inputs.soil.awcMmPerCm <= 0
        ? ['Frozen v4 soil available-water capacity is missing or invalid.']
        : []),
      ...soilQualificationReasons(inputs.soil, 'v4'),
      ...starts.issues,
      ...establishment.issues,
      ...environmentIssues,
      ...(usesSoillessTarget(config) ? ['Soilless targets require the separate 02B resource model.'] : []),
      ...invalidParameters.map((parameter) => `Crop ${parameter.cropId}: one or more frozen v4 parameter values are missing, invalid, or unsupported.`),
    ];
    const complete = hasCompleteCropSnapshot
      && missingParameters.length === 0
      && inputs.cropParameters.length === parameterIds.size
      && (inputs.soil?.awcMmPerCm ?? 0) > 0
      && !usesSoillessTarget(config)
      && starts.issues.length === 0
      && establishment.issues.length === 0
      && environmentIssues.length === 0
      && inputs.qualification.status !== 'unsupported'
      && inputs.cropParameters.every((parameter) =>
        thermalParametersComplete(parameter.thermal)
        && productionParametersV4Complete(parameter.production)
        && rootZoneParametersComplete(parameter.rootZone)
        && parameter.lifecycle === 'plant',
      );
    if (complete) {
      return {
        model: 'crop-model-v4', status: 'qualified', canReplay: true, preserveStoredSummary: false,
        reasons: [
          ...inputs.qualification.reasons,
          ...establishment.qualifications,
          ...starts.qualifications,
          ...inputs.cropParameters.flatMap((parameter) => parameter.production.limitations ?? []),
          'Empirical v4 crop-model accuracy remains UNVERIFIED; this synthetic integration does not authorize predictive comparisons.',
          'Direct-sown crop production and root-zone fluxes begin only at the frozen emergence date; no seed-reserve dynamics or field-emergence prediction is modeled.',
          'A separate source-event thermal clock controls the source maturity endpoint; intermediate stage mapping remains unavailable and the 3D crop pose is an illustrative juvenile placeholder.',
          'V4 derives daily PAR interception from the beginning-of-day canopy-only DM pool, then partitions each net DM increment once into canopy and harvestable pools; the source p/SLA relation does not determine those allocation shares and no additional harvest-index multiplier is applied.',
          'Water SA K_PAR/SLA/p values are selected seasonal references; its total-solar RUE is not used in the intercepted-PAR production equation. Broccoli K_PAR differs between source Tables 5 and 6 without a resolved attribution.',
          'Canopy dry matter and net production use synthetic assumptions in the approved software fixture; crop and cultivar accuracy remain UNVERIFIED.',
          'Canopy FI_PAR is an interception input and a qualified cover proxy only; it is not a crop transpiration coefficient.',
          ...(climateModel === 'environment-v2'
            ? ['Environment-v2 reuses each unrounded FAO-56 actual-transpiration flux once for root-zone storage loss and once as the room-vapour source; potential ET uses the previous frozen room ET factor.']
            : ['Enclosure transpiration retains the existing lagged potential-ET proxy and is not coupled to current root-zone Ks.']),
          'Surface runoff is assumed to be 0 mm/day because the run has no frozen runoff input; infiltration and runoff uncertainty remain unmodeled.',
          ...(inputs.cropParameters.some((parameter) => parameter.rootZone.rootDevelopment)
            ? ['Root development uses the frozen profile only after its declared start event; new subsoil storage is added at the frozen initial available-water fraction as an explicit root-growth inflow. Vertical soil-water layering and rooting barriers are not modeled.']
            : ['Effective root depth is held at the frozen value; dynamic root growth and rooting barriers are not modeled.']),
          'Crop root-zone and enclosure transpiration stop at the frozen source maturity endpoint or harvest; v1-v3 replay behavior is preserved.',
          ...soilQualificationReasons(inputs.soil, 'v4'),
        ],
      };
    }
    return {
      model: 'crop-model-v4', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
      reasons: [...new Set(reasons)],
    };
  }

  if (config.cropModelVersion === 'crop-model-v1' || config.cropModelVersion === undefined) {
    if (inputs?.model === 'run-inputs-v1' && hasCompleteCropSnapshot) {
      return {
        model: 'crop-model-v1', status: 'supported', canReplay: true, preserveStoredSummary: false,
        reasons: [],
      };
    }
    if (!persisted) {
      return {
        model: 'crop-model-v1', status: 'qualified', canReplay: true, preserveStoredSummary: false,
        reasons: ['Transient v1 simulation uses its explicitly supplied compatibility context.'],
      };
    }
    return {
      model: 'crop-model-v1', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
      reasons: [
        ...(!inputs ? ['Historical record has no frozen model inputs.'] : []),
        ...(inputs?.model === 'run-inputs-v2' || inputs?.model === 'run-inputs-v3' || inputs?.model === 'run-inputs-v4' ? ['Model-input version and crop-model version disagree.'] : []),
        ...(missingCropIds.length ? [`Frozen crop records are missing for crop IDs ${missingCropIds.join(', ')}.`] : []),
      ],
    };
  }

  return {
    model: 'unknown', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
    reasons: [`Unknown crop model version: ${String(config.cropModelVersion)}.`],
  };
}

/** Freeze only the crop records this run can consult plus its soil-water inputs. */
export function freezeRunModelInputs(
  config: RunConfig,
  source: RunModelSource = {},
  prior?: RunModelInputs,
): RunModelInputs {
  if (config.cropModelVersion === 'crop-model-v4' || prior?.model === 'run-inputs-v4') {
    return freezeRunModelInputsV4(config, source, prior);
  }
  if (config.cropModelVersion === 'crop-model-v3' || prior?.model === 'run-inputs-v3') {
    return freezeRunModelInputsV3(config, source, prior);
  }
  if (config.cropModelVersion === 'crop-model-v2' || prior?.model === 'run-inputs-v2') {
    return freezeRunModelInputsV2(config, source, prior);
  }
  return freezeRunModelInputsV1(config, source, prior);
}

function frozenCrops(config: RunConfig, source: RunModelSource, prior?: RunModelInputs): Crop[] {
  const cropById = new Map<number, Crop>();
  for (const crop of prior?.crops ?? []) cropById.set(crop.id, structuredClone(crop));
  for (const crop of source.crops ?? cropLibrary) {
    if (!cropById.has(crop.id)) cropById.set(crop.id, structuredClone(crop));
  }
  const crops = cropIdsFor(config).flatMap((id) => {
    const crop = cropById.get(id);
    return crop ? [crop] : [];
  });
  return crops;
}

function frozenSoil(source: RunModelSource, prior?: RunModelInputs) {
  const soil = prior
    ? structuredClone(prior.soil)
    : source.soil
      ? {
          awcMmPerCm: source.soil.awcMmPerCm ?? null,
          organicMatterPct: source.soil.organicMatterPct ?? null,
        }
      : null;
  return soil;
}

function frozenSoilV2(source: RunModelSource, prior?: RunModelInputs) {
  const soil = frozenSoil(source, prior);
  if (!soil) return null;
  const priorSource = prior?.model === 'run-inputs-v2' || prior?.model === 'run-inputs-v3' || prior?.model === 'run-inputs-v4'
    ? prior.soil?.source
    : undefined;
  return {
    ...soil,
    source: prior ? priorSource ?? 'unknown' : source.soil?.source ?? 'unknown',
  };
}

function freezeRunModelInputsV1(
  config: RunConfig,
  source: RunModelSource,
  prior?: RunModelInputs,
): RunModelInputsV1 {
  return {
    model: 'run-inputs-v1',
    soil: frozenSoil(source, prior),
    crops: frozenCrops(config, source, prior),
  };
}

function parameterForCrop(
  crop: Crop,
  prior: RunModelInputs | undefined,
  source: RunModelSource,
): FrozenCropModelParametersV2 {
  const priorV3 = prior?.model === 'run-inputs-v3'
    ? prior.cropParameters.find((parameter) => parameter.cropId === crop.id)
    : undefined;
  const existing = prior?.model === 'run-inputs-v2'
    ? prior.cropParameters.find((parameter) => parameter.cropId === crop.id)
    : priorV3
      ? { ...priorV3, production: { ...priorV3.production, initialDryMatterGPerM2: null } }
      : undefined;
  const supplied = source.cropParametersV2?.find((parameter) => parameter.cropId === crop.id);
  if (existing) return structuredClone(existing);
  if (supplied) return structuredClone(supplied);
  const thermal = cropThermalParams.find((parameter) => parameter.cropId === crop.id);
  const fungal = crop.category === 'fungus';
  const productionMissing = fungal
    ? ['separate substrate/lifecycle model parameters']
    : ['crop-specific net RUE', 'initial above-ground dry matter at establishment', 'canopy PAR interception', 'harvest index'];
  const rootZoneMissing = ['effective crop root depth', 'crop depletion fraction', 'crop coefficient', 'initial root-zone storage fraction'];
  return {
    cropId: crop.id,
    thermal: thermal ? structuredClone(thermal) : null,
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: null,
      initialDryMatterGPerM2: null,
      interceptedParFraction: null,
      harvestIndex: null,
      status: 'unsupported',
      missing: productionMissing,
      evidence: { evidenceId: null, sourceCitation: null, sourceUrl: null, validDomain: null },
    },
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: null,
      depletionFraction: null,
      cropCoefficient: null,
      initialStorageFraction: null,
      status: 'unsupported',
      missing: rootZoneMissing,
      evidence: { evidenceId: null, sourceCitation: null, sourceUrl: null, validDomain: null },
    },
    lifecycle: fungal ? 'fungus' : 'plant',
  };
}

function asV3Parameters(parameter: FrozenCropModelParametersV2): FrozenCropModelParametersV3 {
  const { initialDryMatterGPerM2, ...production } = parameter.production;
  void initialDryMatterGPerM2;
  const missing = production.missing.filter((entry) => entry !== 'initial above-ground dry matter at establishment');
  const hasInitialCellState = parameter.production.initialDryMatterGPerM2 === null
    && parameter.production.missing.includes('initial above-ground dry matter at establishment');
  const hasProductionValues = production.rueGPerMjInterceptedPar !== null
    && production.interceptedParFraction !== null
    && production.harvestIndex !== null
    && !!production.evidence.evidenceId
    && !!production.evidence.sourceCitation
    && !!production.evidence.sourceUrl
    && !!production.evidence.validDomain;
  return {
    ...parameter,
    production: {
      ...production,
      missing,
      status: hasInitialCellState && hasProductionValues && missing.length === 0 ? 'qualified' : production.status,
      ...(hasInitialCellState && hasProductionValues && missing.length === 0
        ? { limitations: [...(production.limitations ?? []), 'Initial above-ground dry matter is supplied per cell by crop-model-v3 establishment inputs.'] }
        : {}),
    },
  };
}

export function freezeRunModelInputsV2(
  config: RunConfig,
  source: RunModelSource = {},
  prior?: RunModelInputs,
): Extract<RunModelInputs, { model: 'run-inputs-v2' }> {
  const crops = frozenCrops(config, source, prior);
  const cropParameters = crops.map((crop) => parameterForCrop(crop, prior, source));
  const reasons = cropParameters.flatMap((parameter) => [
    ...(parameter.thermal ? [] : [`Crop ${parameter.cropId}: missing source-backed thermal development parameters`]),
    ...parameter.production.missing.map((missing) => `Crop ${parameter.cropId}: missing ${missing}`),
    ...parameter.rootZone.missing.map((missing) => `Crop ${parameter.cropId}: missing ${missing}`),
    ...(parameter.production.limitations ?? []).map((limitation) => `Crop ${parameter.cropId}: ${limitation}`),
    ...(parameter.rootZone.limitations ?? []).map((limitation) => `Crop ${parameter.cropId}: ${limitation}`),
    ...(parameter.lifecycle === 'fungus' ? [`Crop ${parameter.cropId}: separate fungus lifecycle is unsupported`] : []),
  ]);
  const unsupported = cropParameters.some((parameter) => !parameter.thermal
    || parameter.production.missing.length > 0
    || parameter.rootZone.missing.length > 0
    || parameter.production.status === 'unsupported'
    || parameter.rootZone.status === 'unsupported'
    || parameter.lifecycle !== 'plant');
  return {
    model: 'run-inputs-v2',
    parameterSetVersion: 'crop-parameters-v3',
    soil: frozenSoilV2(source, prior),
    crops,
    cropParameters,
    qualification: {
      status: unsupported ? 'unsupported' : reasons.length > 0 ? 'qualified' : 'supported',
      reasons: [...new Set(reasons)],
    },
  };
}

export function freezeRunModelInputsV3(
  config: RunConfig,
  source: RunModelSource = {},
  prior?: RunModelInputs,
): RunModelInputsV3 {
  const priorV2: RunModelInputs | undefined = prior?.model === 'run-inputs-v3'
    ? {
        model: 'run-inputs-v2',
        parameterSetVersion: 'crop-parameters-v3',
        soil: prior.soil,
        crops: structuredClone(prior.crops),
        cropParameters: prior.cropParameters.map((parameter) => ({
          ...parameter,
          production: { ...parameter.production, initialDryMatterGPerM2: null },
        })),
        qualification: structuredClone(prior.qualification),
      }
    : prior;
  const frozen = freezeRunModelInputsV2(config, source, priorV2);
  const cropParameters = frozen.cropParameters.map(asV3Parameters);
  const establishmentByCell = source.cropEstablishmentByCell
    ? structuredClone(source.cropEstablishmentByCell)
    : prior?.model === 'run-inputs-v3'
      ? structuredClone(prior.establishmentByCell)
      : {};
  const reasons = frozen.qualification.reasons.filter((reason) =>
    !reason.includes('thermal, light-driven production, and root-zone transpiration start on the sowing date')
    && !reason.includes('missing initial above-ground dry matter at establishment'));
  const unsupported = cropParameters.some((parameter) =>
    parameter.production.missing.length > 0
    || parameter.production.status === 'unsupported'
    || parameter.rootZone.missing.length > 0
    || parameter.rootZone.status === 'unsupported'
    || !parameter.thermal
    || parameter.lifecycle !== 'plant',
  );
  return {
    model: 'run-inputs-v3',
    parameterSetVersion: 'crop-parameters-v4',
    soil: frozen.soil,
    crops: frozen.crops,
    cropParameters,
    establishmentByCell,
    qualification: {
      status: unsupported ? 'unsupported' : 'qualified',
      reasons: [...new Set(reasons)],
    },
  };
}

function priorV3FromV4(prior: RunModelInputsV4): RunModelInputsV3 {
  return {
    model: 'run-inputs-v3',
    parameterSetVersion: 'crop-parameters-v4',
    soil: structuredClone(prior.soil),
    crops: structuredClone(prior.crops),
    cropParameters: prior.cropParameters.map((parameter) => ({
      cropId: parameter.cropId,
      thermal: structuredClone(parameter.thermal),
      rootZone: structuredClone(parameter.rootZone),
      lifecycle: parameter.lifecycle,
      production: {
        equationFamily: 'LINTUL-net-RUE',
        rueGPerMjInterceptedPar: parameter.production.rueGPerMjInterceptedPar,
        interceptedParFraction: null,
        harvestIndex: null,
        status: 'unsupported',
        missing: ['v4 canopy pools cannot be interpreted as a v3 above-ground DM and harvest-index state'],
        evidence: structuredClone(parameter.production.evidence),
      },
    })),
    establishmentByCell: Object.fromEntries(Object.entries(prior.establishmentByCell).map(([key, input]) => [key, {
      startEvent: input.startEvent,
      establishedAtDate: input.establishedAtDate,
      initialAboveGroundDryMatterGPerM2: input.initialCanopyDryMatterGPerM2 + input.initialHarvestableDryMatterGPerM2,
      evidence: structuredClone(input.evidence),
    }])),
    qualification: structuredClone(prior.qualification),
  };
}

function v4ParametersWithoutCanopyReference(parameter: FrozenCropModelParametersV3): FrozenCropModelParametersV4 {
  const oldProduction = parameter.production;
  const missing = oldProduction.missing.filter((entry) =>
    !entry.includes('initial above-ground dry matter')
    && !entry.includes('canopy PAR interception')
    && !entry.includes('harvest index'));
  missing.push(
    'source-backed canopy K_PAR',
    'source-backed canopy specific leaf area',
    'source-backed canopy leaf-stem partition parameter',
    'frozen canopy allocation share',
    'frozen harvestable allocation share',
  );
  return {
    cropId: parameter.cropId,
    thermal: structuredClone(parameter.thermal),
    rootZone: structuredClone(parameter.rootZone),
    lifecycle: parameter.lifecycle,
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: oldProduction.rueGPerMjInterceptedPar,
      status: 'unsupported',
      missing,
      ...(oldProduction.limitations ? { limitations: [...oldProduction.limitations] } : {}),
      evidence: structuredClone(oldProduction.evidence),
      canopy: {
        kPar: null,
        specificLeafAreaM2PerKg: null,
        leafStemPartitionParameterM2PerKg: null,
        evidence: { evidenceId: null, sourceCitation: null, sourceUrl: null, validDomain: null },
      },
      allocation: {
        canopyShare: null,
        harvestableShare: null,
        classification: 'synthetic',
        evidenceId: '',
        validDomain: '',
      },
    },
  };
}

export function freezeRunModelInputsV4(
  config: RunConfig,
  source: RunModelSource = {},
  prior?: RunModelInputs,
): RunModelInputsV4 {
  const priorV3 = prior?.model === 'run-inputs-v4'
    ? priorV3FromV4(prior)
    : prior?.model === 'run-inputs-v3' ? prior : undefined;
  const frozen = freezeRunModelInputsV3(config, source, priorV3 ?? prior);
  const priorParameters = prior?.model === 'run-inputs-v4'
    ? new Map(prior.cropParameters.map((parameter) => [parameter.cropId, parameter]))
    : undefined;
  const suppliedParameters = new Map((source.cropParametersV4 ?? []).map((parameter) => [parameter.cropId, parameter]));
  const cropParameters = frozen.crops.map((crop) => {
    const parameter = priorParameters?.get(crop.id) ?? suppliedParameters.get(crop.id);
    if (parameter) return structuredClone(parameter);
    const base = frozen.cropParameters.find((entry) => entry.cropId === crop.id);
    return base ? v4ParametersWithoutCanopyReference(base) : null;
  }).filter((parameter): parameter is FrozenCropModelParametersV4 => parameter !== null);
  const establishmentByCell = source.cropCanopyEstablishmentByCell
    ? structuredClone(source.cropCanopyEstablishmentByCell)
    : prior?.model === 'run-inputs-v4'
      ? structuredClone(prior.establishmentByCell)
      : {};
  const starts = cropStartEventChecks(config, cropParameters);
  const establishment = cropCanopyEstablishmentChecks(config, establishmentByCell, cropParameters);
  const unsupported = cropParameters.length !== frozen.crops.length
    || cropParameters.some((parameter) => !thermalParametersComplete(parameter.thermal)
      || !productionParametersV4Complete(parameter.production)
      || !rootZoneParametersComplete(parameter.rootZone)
      || parameter.lifecycle !== 'plant')
    || starts.issues.length > 0
    || establishment.issues.length > 0
    || (frozen.soil?.awcMmPerCm ?? 0) <= 0
    || usesSoillessTarget(config);
  const reasons = [
    ...(prior?.model === 'run-inputs-v4' ? prior.qualification.reasons : []),
    ...cropParameters.flatMap((parameter) => [
      ...parameter.production.missing.map((missing) => `Crop ${parameter.cropId}: missing ${missing}`),
      ...(parameter.production.limitations ?? []).map((limitation) => `Crop ${parameter.cropId}: ${limitation}`),
      ...parameter.rootZone.missing.map((missing) => `Crop ${parameter.cropId}: missing ${missing}`),
      ...(parameter.rootZone.limitations ?? []).map((limitation) => `Crop ${parameter.cropId}: ${limitation}`),
    ]),
    ...starts.issues,
    ...establishment.issues,
    ...starts.qualifications,
    ...establishment.qualifications,
    ...soilQualificationReasons(frozen.soil, 'v4'),
    ...(usesSoillessTarget(config) ? ['Soilless targets require the separate 02B resource model.'] : []),
  ];
  return {
    model: 'run-inputs-v4',
    parameterSetVersion: 'crop-parameters-v5',
    soil: frozen.soil,
    crops: frozen.crops,
    cropParameters,
    establishmentByCell,
    qualification: {
      status: unsupported ? 'unsupported' : 'qualified',
      reasons: [...new Set(reasons)],
    },
  };
}
