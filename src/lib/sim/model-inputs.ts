import { cropLibrary } from '@/data/crops';
import { archetypes } from '@/creative/archetypes';
import type { SoilProfile } from '@/lib/soil';
import type { Crop } from '@/types';
import { cropThermalParams } from '@/data/cropThermalParams';
import type { FrozenCropModelParametersV2, RunConfig, RunModelInputs, RunModelInputsV1 } from './types';

export interface RunModelSource {
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> & Partial<Pick<SoilProfile, 'source'>> | null;
  crops?: Crop[];
  cropParametersV2?: FrozenCropModelParametersV2[];
}

export interface RunModelSupport {
  model: 'crop-model-v1' | 'crop-model-v2' | 'unknown';
  status: 'supported' | 'qualified' | 'unsupported';
  canReplay: boolean;
  preserveStoredSummary: boolean;
  reasons: string[];
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

function productionParametersComplete(parameter: FrozenCropModelParametersV2['production']): boolean {
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
    && parameter.interceptedParFraction !== null
    && Number.isFinite(parameter.interceptedParFraction)
    && parameter.interceptedParFraction >= 0
    && parameter.interceptedParFraction <= 1
    && parameter.harvestIndex !== null
    && Number.isFinite(parameter.harvestIndex)
    && parameter.harvestIndex >= 0
    && parameter.harvestIndex <= 1;
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
): string[] {
  if (!soil) return [];
  const reasons: string[] = [];
  if (soil.source !== 'usda-sda' && soil.source !== 'soilgrids') {
    reasons.push('Frozen v2 soil AWC provenance is unknown.');
  }
  if (soil.source === 'soilgrids' && typeof soil.awcMmPerCm === 'number' && Number.isFinite(soil.awcMmPerCm)) {
    reasons.push('Frozen v2 numeric soil AWC is paired with SoilGrids classification-only provenance.');
  }
  return reasons;
}

/** Inspect replay compatibility without consulting live catalog or soil data. */
export function inspectRunModelSupport(config: RunConfig, persisted = true): RunModelSupport {
  const requiredCropIds = cropIdsFor(config);
  const inputs = config.modelInputs;
  const inputCrops = Array.isArray(inputs?.crops) ? inputs.crops : [];
  const inputCropIds = new Set(inputCrops.map((crop) => crop.id));
  const missingCropIds = requiredCropIds.filter((cropId) => !inputCropIds.has(cropId));
  const hasCompleteCropSnapshot = !!inputs && missingCropIds.length === 0;

  if (config.cropModelVersion === 'crop-model-v2') {
    if (inputs?.model !== 'run-inputs-v2' || inputs.parameterSetVersion !== 'crop-parameters-v2') {
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
      ...(usesSoillessTarget(config) ? ['Soilless targets require the separate 02B resource model.'] : []),
      ...invalidParameters.map((parameter) => `Crop ${parameter.cropId}: one or more frozen v2 parameter values are missing, invalid, or unsupported.`),
    ];
    const complete = hasCompleteCropSnapshot
      && missingParameters.length === 0
      && inputs.cropParameters.length === parameterIds.size
      && (inputs.soil?.awcMmPerCm ?? 0) > 0
      && !usesSoillessTarget(config)
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
          ...(config.environment && config.climateModel !== 'environment-v1'
            && archetypes[config.environment.archetype]?.kind !== 'open'
            && archetypes[config.environment.archetype]?.dliMode !== 'supplement-only'
            ? ['Without an environment-v1 climate state, enclosed natural DLI uses frozen calibration cover transmission when present, otherwise the archetype default; only explicitly frozen target lighting is included.']
            : []),
          'Thermal accumulation starts on the frozen plantedAt day; separate sowing/transplant event acceptance remains outstanding.',
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
        ...(inputs?.model === 'run-inputs-v2' ? ['Model-input version and crop-model version disagree.'] : []),
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
  const priorSource = prior?.model === 'run-inputs-v2' ? prior.soil?.source : undefined;
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
  const existing = prior?.model === 'run-inputs-v2'
    ? prior.cropParameters.find((parameter) => parameter.cropId === crop.id)
    : undefined;
  const supplied = source.cropParametersV2?.find((parameter) => parameter.cropId === crop.id);
  if (existing) return structuredClone(existing);
  if (supplied) return structuredClone(supplied);
  const thermal = cropThermalParams.find((parameter) => parameter.cropId === crop.id);
  const fungal = crop.category === 'fungus';
  const productionMissing = fungal
    ? ['separate substrate/lifecycle model parameters']
    : ['crop-specific net RUE', 'canopy PAR interception', 'harvest index'];
  const rootZoneMissing = ['effective crop root depth', 'crop depletion fraction', 'crop coefficient', 'initial root-zone storage fraction'];
  return {
    cropId: crop.id,
    thermal: thermal ? structuredClone(thermal) : null,
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: null,
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
    parameterSetVersion: 'crop-parameters-v2',
    soil: frozenSoilV2(source, prior),
    crops,
    cropParameters,
    qualification: {
      status: unsupported ? 'unsupported' : reasons.length > 0 ? 'qualified' : 'supported',
      reasons: [...new Set(reasons)],
    },
  };
}
