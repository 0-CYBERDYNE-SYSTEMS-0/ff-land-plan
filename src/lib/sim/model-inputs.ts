import { cropLibrary } from '@/data/crops';
import type { SoilProfile } from '@/lib/soil';
import type { Crop } from '@/types';
import type { RunConfig, RunModelInputs } from './types';

export interface RunModelSource {
  soil?: Pick<SoilProfile, 'awcMmPerCm' | 'organicMatterPct'> | null;
  crops?: Crop[];
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

/** Freeze only the crop records this run can consult plus its soil-water inputs. */
export function freezeRunModelInputs(
  config: RunConfig,
  source: RunModelSource = {},
  prior?: RunModelInputs,
): RunModelInputs {
  const cropById = new Map<number, Crop>();
  for (const crop of prior?.crops ?? []) cropById.set(crop.id, structuredClone(crop));
  for (const crop of source.crops ?? cropLibrary) {
    if (!cropById.has(crop.id)) cropById.set(crop.id, structuredClone(crop));
  }
  const crops = cropIdsFor(config).flatMap((id) => {
    const crop = cropById.get(id);
    return crop ? [crop] : [];
  });
  const soil = prior
    ? structuredClone(prior.soil)
    : source.soil
      ? {
          awcMmPerCm: source.soil.awcMmPerCm ?? null,
          organicMatterPct: source.soil.organicMatterPct ?? null,
        }
      : null;
  return { model: 'run-inputs-v1', soil, crops };
}
