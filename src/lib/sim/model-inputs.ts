import { cropLibrary } from '@/data/crops';
import type { SoilProfile } from '@/lib/soil';
import type { Crop } from '@/types';
import { cropThermalParams } from '@/data/cropThermalParams';
import type { FrozenCropModelParametersV2, RunConfig, RunModelInputs, RunModelInputsV1 } from './types';

export interface RunModelSource {
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> | null;
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

/** Inspect replay compatibility without consulting live catalog or soil data. */
export function inspectRunModelSupport(config: RunConfig, persisted = true): RunModelSupport {
  const requiredCropIds = cropIdsFor(config);
  const inputs = config.modelInputs;
  const inputCropIds = new Set(inputs?.crops.map((crop) => crop.id) ?? []);
  const missingCropIds = requiredCropIds.filter((cropId) => !inputCropIds.has(cropId));
  const hasCompleteCropSnapshot = !!inputs && missingCropIds.length === 0;

  if (config.cropModelVersion === 'crop-model-v2') {
    if (inputs?.model !== 'run-inputs-v2' || inputs.parameterSetVersion !== 'crop-parameters-v2') {
      return {
        model: 'crop-model-v2', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen crop-model-v2 parameter inputs are missing or have an unknown version.'],
      };
    }
    const parameterIds = new Set(inputs.cropParameters.map((parameter) => parameter.cropId));
    const missingParameters = requiredCropIds.filter((cropId) => !parameterIds.has(cropId));
    const reasons = [
      ...inputs.qualification.reasons,
      ...(missingCropIds.length ? [`Frozen crop records are missing for crop IDs ${missingCropIds.join(', ')}.`] : []),
      ...(missingParameters.length ? [`Frozen crop parameters are missing for crop IDs ${missingParameters.join(', ')}.`] : []),
      ...inputs.cropParameters.flatMap((parameter) => parameter.thermal
        ? []
        : [`Crop ${parameter.cropId}: frozen thermal development parameters are missing.`]),
    ];
    const complete = hasCompleteCropSnapshot
      && missingParameters.length === 0
      && inputs.qualification.status === 'supported'
      && inputs.cropParameters.every((parameter) =>
        parameter.thermal !== null
        && parameter.production.status === 'supported' && parameter.rootZone.status === 'supported'
        && parameter.lifecycle === 'plant',
      );
    if (complete) {
      return {
        model: 'crop-model-v2', status: 'unsupported', canReplay: false, preserveStoredSummary: persisted,
        reasons: ['Frozen v2 parameters are complete, but the v2 daily state reducer is not enabled yet.'],
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
  const rootZoneMissing = ['effective crop root depth', 'crop depletion fraction'];
  return {
    cropId: crop.id,
    thermal: thermal ? structuredClone(thermal) : null,
    production: {
      rueGPerMjInterceptedPar: null,
      interceptedParFraction: null,
      harvestIndex: null,
      status: 'unsupported',
      missing: productionMissing,
    },
    rootZone: {
      effectiveRootDepthCm: null,
      depletionFraction: null,
      status: 'unsupported',
      missing: rootZoneMissing,
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
    ...(parameter.lifecycle === 'fungus' ? [`Crop ${parameter.cropId}: separate fungus lifecycle is unsupported`] : []),
  ]);
  return {
    model: 'run-inputs-v2',
    parameterSetVersion: 'crop-parameters-v2',
    soil: frozenSoil(source, prior),
    crops,
    cropParameters,
    qualification: {
      status: reasons.length === 0 ? 'supported' : 'unsupported',
      reasons: [...new Set(reasons)],
    },
  };
}
