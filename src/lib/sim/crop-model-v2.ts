import type { CropThermalParam } from '@/data/cropThermalParams';

/** Horticultural conversion used by light.ts: 4.5 mol PAR per MJ PAR. */
export const PAR_MOL_PER_MJ = 4.5;

export type ThermalAccumulationMethod =
  | 'mean-base'
  | 'max-min-horizontal-cutoff'
  | 'single-sine-horizontal-cutoff';

export interface DailyProductionInput {
  dliMolParM2: number | null | undefined;
  interceptedParFraction: number | null | undefined;
  rueGPerMjInterceptedPar: number | null | undefined;
  stressFactor: number | null | undefined;
}

export type DailyProductionResult =
  | { status: 'supported'; interceptedParMjM2: number; dryMatterGainGM2: number }
  | { status: 'unsupported'; reason: string };

/** Daily net dry matter, before allocation: RUE × intercepted PAR × stress. */
export function dailyDryMatterProduction(input: DailyProductionInput): DailyProductionResult {
  const dli = input.dliMolParM2;
  if (dli === 0) return { status: 'supported', interceptedParMjM2: 0, dryMatterGainGM2: 0 };
  if (dli === undefined || dli === null || !Number.isFinite(dli)) {
    return { status: 'unsupported', reason: 'Daily usable DLI is unknown.' };
  }
  if (dli < 0) return { status: 'unsupported', reason: 'Daily DLI must be nonnegative.' };
  const intercepted = input.interceptedParFraction;
  if (intercepted === 0) return { status: 'supported', interceptedParMjM2: 0, dryMatterGainGM2: 0 };
  if (intercepted === null || intercepted === undefined || !Number.isFinite(intercepted) || intercepted < 0 || intercepted > 1) {
    return { status: 'unsupported', reason: 'PAR interception fraction is missing or outside 0..1.' };
  }
  const rue = input.rueGPerMjInterceptedPar;
  if (rue === null || rue === undefined || !Number.isFinite(rue) || rue < 0) {
    return { status: 'unsupported', reason: 'Net RUE is missing or invalid.' };
  }
  const stress = input.stressFactor;
  if (stress === null || stress === undefined || !Number.isFinite(stress) || stress < 0 || stress > 1) {
    return { status: 'unsupported', reason: 'Supported stress factor is missing or outside 0..1.' };
  }
  const interceptedParMjM2 = (dli / PAR_MOL_PER_MJ) * intercepted;
  const dryMatterGainGM2 = rue * interceptedParMjM2 * stress;
  return { status: 'supported', interceptedParMjM2, dryMatterGainGM2 };
}

function meanDailyTemperatureAbove(tMinC: number, tMaxC: number, thresholdC: number): number {
  const mean = (tMinC + tMaxC) / 2;
  const amplitude = (tMaxC - tMinC) / 2;
  if (amplitude <= 0) return Math.max(0, mean - thresholdC);
  const x = (thresholdC - mean) / amplitude;
  if (x <= -1) return mean - thresholdC;
  if (x >= 1) return 0;
  const angle = Math.asin(x);
  return Math.max(0, ((mean - thresholdC) * (Math.PI / 2 - angle) + amplitude * Math.cos(angle)) / Math.PI);
}

/** Daily thermal units for the frozen source method; returns null if unknown. */
export function dailyThermalUnits(
  tMinC: number,
  tMaxC: number,
  param: Pick<CropThermalParam, 'tBaseC' | 'tUpperC' | 'accumulationMethod'>,
): number | null {
  if (![tMinC, tMaxC, param.tBaseC].every(Number.isFinite) || tMaxC < tMinC) return null;
  if (param.tUpperC !== undefined
    && (!Number.isFinite(param.tUpperC) || param.tUpperC <= param.tBaseC)) return null;
  const method = param.accumulationMethod.toLowerCase();
  if (method.includes('single sine')) {
    const baseUnits = meanDailyTemperatureAbove(tMinC, tMaxC, param.tBaseC);
    const aboveUpper = param.tUpperC === undefined ? 0 : meanDailyTemperatureAbove(tMinC, tMaxC, param.tUpperC);
    return Math.max(0, baseUnits - aboveUpper);
  }
  if (method.includes('max–min') || method.includes('max-min')) {
    const cap = param.tUpperC ?? Number.POSITIVE_INFINITY;
    const low = Math.max(param.tBaseC, Math.min(tMinC, cap));
    const high = Math.max(param.tBaseC, Math.min(tMaxC, cap));
    return Math.max(0, (low + high) / 2 - param.tBaseC);
  }
  if (method.includes('study thermal-time') || method.includes('study heat-unit')) {
    return Math.max(0, (tMinC + tMaxC) / 2 - param.tBaseC);
  }
  return null;
}

/** Preserve published cultivar/variety target ranges without inventing a midpoint. */
export function thermalDevelopmentRange(
  accumulatedCdays: number,
  targetCdays: readonly [minimum: number, maximum: number],
): readonly [minimumProgress: number, maximumProgress: number] {
  if (!Number.isFinite(accumulatedCdays) || accumulatedCdays < 0
    || !targetCdays.every((target) => Number.isFinite(target) && target > 0)) return [0, 0];
  const [minimumTarget, maximumTarget] = targetCdays;
  return [
    Math.max(0, Math.min(1, accumulatedCdays / maximumTarget)),
    Math.max(0, Math.min(1, accumulatedCdays / minimumTarget)),
  ];
}

export interface RootZoneState {
  waterMm: number;
  residualAccumulatedMm?: number;
}

export interface RootZoneParams {
  awcMmPerCm: number;
  effectiveRootDepthCm: number;
  depletionFraction: number;
}

export interface RootZoneFluxes {
  precipMm: number;
  irrigationMm: number;
  capillaryRiseMm?: number;
  runoffMm?: number;
  /** Water in the newly reached subsoil slice, based on the frozen profile assumption. */
  rootGrowthStorageMm?: number;
  potentialTranspirationMm: number;
}

export interface RootZoneStepResult {
  state: RootZoneState;
  capacityMm: number;
  totalAvailableWaterMm: number;
  readilyAvailableWaterMm: number;
  depletionMm: number;
  stressCoefficient: number;
  actualTranspirationMm: number;
  deepDrainageMm: number;
  rootGrowthStorageMm: number;
  residualMm: number;
}

export interface RootDevelopmentParams {
  initialRootDepthCm: number;
  maximumRootDepthCm: number;
  growthStartsAfterCdays: number;
  growthMmPerCday: number;
}

/** Source-based effective root-depth trajectory, with the source domain's explicit cap. */
export function effectiveRootDepthCmAtThermalTime(
  accumulatedCdays: number,
  params: RootDevelopmentParams,
): number {
  const values = [accumulatedCdays, params.initialRootDepthCm, params.maximumRootDepthCm,
    params.growthStartsAfterCdays, params.growthMmPerCday];
  if (!values.every(Number.isFinite) || accumulatedCdays < 0
    || params.initialRootDepthCm <= 0 || params.maximumRootDepthCm < params.initialRootDepthCm
    || params.growthStartsAfterCdays < 0 || params.growthMmPerCday < 0) {
    throw new RangeError('Root-development inputs must be finite and physically bounded.');
  }
  const growingCdays = Math.max(0, accumulatedCdays - params.growthStartsAfterCdays);
  return Math.min(
    params.maximumRootDepthCm,
    params.initialRootDepthCm + growingCdays * params.growthMmPerCday / 10,
  );
}

/** FAO-56 p adjustment around the reference ETc of 5 mm/day. */
export function fao56AdjustedDepletionFraction(pAt5MmDay: number, etcMmDay: number): number {
  if (![pAt5MmDay, etcMmDay].every(Number.isFinite)
    || pAt5MmDay < 0 || pAt5MmDay > 1 || etcMmDay < 0) {
    throw new RangeError('FAO-56 depletion adjustment inputs must be finite and within their physical bounds.');
  }
  return Math.max(0.1, Math.min(0.8, pAt5MmDay + 0.04 * (5 - etcMmDay)));
}

/** FAO-56 single effective root-zone balance with explicit boundary fluxes. */
export function stepFao56RootZone(
  state: RootZoneState,
  params: RootZoneParams,
  fluxes: RootZoneFluxes,
): RootZoneStepResult {
  const values = [params.awcMmPerCm, params.effectiveRootDepthCm, params.depletionFraction,
    state.waterMm, fluxes.precipMm, fluxes.irrigationMm, fluxes.capillaryRiseMm ?? 0,
    fluxes.runoffMm ?? 0, fluxes.rootGrowthStorageMm ?? 0, fluxes.potentialTranspirationMm];
  if (!values.every(Number.isFinite)
    || params.awcMmPerCm <= 0 || params.effectiveRootDepthCm <= 0
    || params.depletionFraction < 0 || params.depletionFraction > 1
    || fluxes.precipMm < 0 || fluxes.irrigationMm < 0
    || (fluxes.capillaryRiseMm ?? 0) < 0 || (fluxes.runoffMm ?? 0) < 0
    || (fluxes.rootGrowthStorageMm ?? 0) < 0
    || fluxes.potentialTranspirationMm < 0) {
    throw new RangeError('FAO-56 root-zone inputs must be finite and within their physical bounds.');
  }
  const capacityMm = params.awcMmPerCm * params.effectiveRootDepthCm;
  if (state.waterMm < 0 || state.waterMm > capacityMm) {
    throw new RangeError('Root-zone water storage must be within 0..TAW.');
  }
  const rootGrowthStorageMm = fluxes.rootGrowthStorageMm ?? 0;
  const inflowMm = fluxes.precipMm + fluxes.irrigationMm + (fluxes.capillaryRiseMm ?? 0) + rootGrowthStorageMm;
  const runoffMm = fluxes.runoffMm ?? 0;
  if (runoffMm > inflowMm) throw new RangeError('Runoff cannot exceed daily water inflow.');
  const beforeDrainage = state.waterMm + inflowMm - runoffMm;
  const deepDrainageMm = Math.max(0, beforeDrainage - capacityMm);
  const afterDrainage = Math.min(capacityMm, beforeDrainage);
  const totalAvailableWaterMm = capacityMm;
  const readilyAvailableWaterMm = params.depletionFraction * totalAvailableWaterMm;
  const depletionBeforeTranspirationMm = capacityMm - afterDrainage;
  const stressCoefficient = depletionBeforeTranspirationMm <= readilyAvailableWaterMm
    ? 1
    : Math.max(0, Math.min(1, (totalAvailableWaterMm - depletionBeforeTranspirationMm)
      / Math.max(1e-12, totalAvailableWaterMm - readilyAvailableWaterMm)));
  const actualTranspirationMm = Math.min(afterDrainage, fluxes.potentialTranspirationMm * stressCoefficient);
  const waterMm = afterDrainage - actualTranspirationMm;
  const depletionMm = capacityMm - waterMm;
  const residualMm = state.waterMm + inflowMm - runoffMm - deepDrainageMm - actualTranspirationMm - waterMm;
  return {
    state: { waterMm, residualAccumulatedMm: (state.residualAccumulatedMm ?? 0) + residualMm },
    capacityMm,
    totalAvailableWaterMm,
    readilyAvailableWaterMm,
    depletionMm,
    stressCoefficient,
    actualTranspirationMm,
    deepDrainageMm,
    rootGrowthStorageMm,
    residualMm,
  };
}
