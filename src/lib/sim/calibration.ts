import { archetypes } from '@/creative/archetypes';
import type { EnvironmentSnapshot, Observation } from '@/types';
import {
  effectivePhotoperiodH,
  environmentDay,
  NO_CLIMATE_EQUIPMENT,
  type ClimateEquipmentInput,
} from './environment-climate';
import type { DailyEnvironment, FarmCalibration } from './types';
import { canonicalizeObservations } from './observations';

export type { FarmCalibration } from './types';

const MIN_PAIRED_DAYS = 14;
const COVER_STEP = 0.01;
const U_VALUE_MIN = 0.1;
const U_VALUE_MAX = 20;
const U_VALUE_STEP = 0.1;

export type CalibrationParameter = 'coverTransmission' | 'uValueWm2K';

export interface CalibrationChange {
  parameter: CalibrationParameter;
  from: number;
  to: number;
}

export interface CalibrationProposal {
  calibration: FarmCalibration;
  defaults: Pick<Record<CalibrationParameter, number>, CalibrationParameter>;
  changes: CalibrationChange[];
}

export type CalibrationFitResult =
  | { status: 'fitted'; pairedDays: number; proposal: CalibrationProposal }
  | { status: 'insufficient-data'; pairedDays: number; minimumPairedDays: number }
  | { status: 'not-identifiable'; pairedDays: number; reason: string };

export interface FitFarmCalibrationInput {
  farmId: number;
  environment: EnvironmentSnapshot;
  envSeries: readonly DailyEnvironment[];
  observations: readonly Observation[];
  existing?: FarmCalibration;
  equipment?: ClimateEquipmentInput;
}

interface PairedDay {
  environment: DailyEnvironment;
  observations: Observation[];
}

function hasFloorScope(observation: Observation): boolean {
  return observation.growingSpaceId === undefined && observation.levelId === undefined;
}

function matchesEnvironment(observation: Observation, input: FitFarmCalibrationInput): boolean {
  return observation.farmId === input.farmId
    && observation.environmentId === input.environment.id
    && hasFloorScope(observation)
    && observation.quality !== 'suspect';
}

function hasSupportedUnit(observation: Observation): boolean {
  if (observation.metric === 'dliMol') {
    return observation.unit === 'mol/m²/day' || observation.unit === 'mol/m2/day';
  }
  if (observation.metric === 'airTempC') return observation.unit === '°C' || observation.unit === 'C';
  return true;
}

function pairedDaysFor(
  input: FitFarmCalibrationInput,
  metric: Observation['metric'],
): PairedDay[] {
  const days = new Map(input.envSeries.map((day) => [day.date, day]));
  const observations = new Map<string, Observation[]>();
  for (const observation of input.observations) {
    if (observation.metric !== metric || !matchesEnvironment(observation, input) || !hasSupportedUnit(observation)) continue;
    const environment = days.get(observation.date);
    if (!environment) continue;
    if (!observations.has(observation.date)) observations.set(observation.date, []);
    observations.get(observation.date)!.push(observation);
  }
  return [...observations.entries()]
    .map(([date, entries]) => ({ environment: days.get(date)!, observations: entries }))
    .sort((a, b) => a.environment.date < b.environment.date ? -1 : a.environment.date > b.environment.date ? 1 : 0);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dailyDliObservation(day: PairedDay): number {
  return mean(day.observations.map((observation) => observation.value));
}

function squaredError(values: Array<{ observed: number; predicted: number }>): number {
  return values.reduce((sum, pair) => sum + (pair.observed - pair.predicted) ** 2, 0);
}

function fitCoverTransmission(
  input: FitFarmCalibrationInput,
  days: PairedDay[],
): number | undefined {
  const archetype = archetypes[input.environment.archetype];
  if (archetype.dliMode === 'supplement-only') return undefined;
  const equipment = input.equipment ?? NO_CLIMATE_EQUIPMENT;
  const photoperiodH = effectivePhotoperiodH(input.environment, equipment.photoperiodH);
  const supplementalDli = equipment.ppfdUmol * photoperiodH * 3600 / 1e6;
  const usableDays = days.filter(({ environment }) =>
    Number.isFinite(environment.dliNaturalMol) && environment.dliNaturalMol! > 0,
  );
  if (usableDays.length < MIN_PAIRED_DAYS) return undefined;
  const coverResponse = mean(usableDays.map(({ environment }) =>
    Math.min(archetype.maxDliMol, environment.dliNaturalMol! + supplementalDli)
      - Math.min(archetype.maxDliMol, supplementalDli),
  ));
  if (coverResponse < 0.2) return undefined;

  let bestValue = archetype.coverTransmission;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let value = 0; value <= 1 + 1e-9; value += COVER_STEP) {
    const coverTransmission = Math.round(value * 100) / 100;
    const pairs = usableDays.map(({ environment, observations }) => ({
      observed: dailyDliObservation({ environment, observations }),
      predicted: Math.min(
        archetype.maxDliMol,
        environment.dliNaturalMol! * coverTransmission + supplementalDli,
      ),
    }));
    const score = squaredError(pairs);
    const distance = Math.abs(coverTransmission - archetype.coverTransmission);
    const bestDistance = Math.abs(bestValue - archetype.coverTransmission);
    if (score < bestScore - 1e-10 || (Math.abs(score - bestScore) <= 1e-10 && distance < bestDistance)) {
      bestScore = score;
      bestValue = coverTransmission;
    }
  }
  return bestValue;
}

function predictedMeanTemperature(
  input: FitFarmCalibrationInput,
  day: DailyEnvironment,
  coverTransmission: number,
  uValueWm2K: number,
): number {
  const climate = environmentDay(
    input.environment,
    {
      tMinC: day.tMinC,
      tMaxC: day.tMaxC,
      precipMm: day.precipMm,
      ...(day.dliNaturalMol !== undefined ? { dliNaturalMol: day.dliNaturalMol } : {}),
    },
    input.equipment ?? NO_CLIMATE_EQUIPMENT,
    undefined,
    { modelOverrides: { coverTransmission, uValueWm2K } },
  );
  return (climate.tMinC + climate.tMaxC) / 2;
}

function fitUValue(
  input: FitFarmCalibrationInput,
  days: PairedDay[],
  coverTransmission: number,
): number | undefined {
  const usableDays = days.filter(({ environment }) =>
    environment.tMinC !== undefined && environment.tMaxC !== undefined,
  );
  if (usableDays.length < MIN_PAIRED_DAYS) return undefined;

  const response = mean(usableDays.map(({ environment }) => Math.abs(
    predictedMeanTemperature(input, environment, coverTransmission, U_VALUE_MIN)
      - predictedMeanTemperature(input, environment, coverTransmission, U_VALUE_MAX),
  )));
  if (response < 0.2) return undefined;

  let bestValue = archetypes[input.environment.archetype].uValueWm2K;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let value = U_VALUE_MIN; value <= U_VALUE_MAX + 1e-9; value += U_VALUE_STEP) {
    const uValueWm2K = Math.round(value * 10) / 10;
    const pairs = usableDays.flatMap(({ environment, observations }) =>
      observations.map((observation) => ({
        observed: observation.value,
        predicted: predictedMeanTemperature(input, environment, coverTransmission, uValueWm2K),
      })),
    );
    const score = squaredError(pairs);
    const defaultDistance = Math.abs(uValueWm2K - archetypes[input.environment.archetype].uValueWm2K);
    const bestDistance = Math.abs(bestValue - archetypes[input.environment.archetype].uValueWm2K);
    if (score < bestScore - 1e-10 || (Math.abs(score - bestScore) <= 1e-10 && defaultDistance < bestDistance)) {
      bestScore = score;
      bestValue = uValueWm2K;
    }
  }
  return bestValue;
}

function fittedAtFor(observations: readonly Observation[]): string {
  const latest = observations
    .filter((observation) => observation.at !== undefined)
    .map((observation) => observation.at!)
    .sort()
    .at(-1);
  if (latest) return latest;
  const latestDate = observations.map((observation) => observation.date).sort().at(-1);
  return `${latestDate ?? '1970-01-01'}T00:00:00.000Z`;
}

/** Fit only measurable, bounded parameters from paired outdoor and sensor days. */
export function fitFarmCalibration(source: FitFarmCalibrationInput): CalibrationFitResult {
  const input: FitFarmCalibrationInput = {
    ...source,
    observations: canonicalizeObservations(source.observations),
  };
  const dliDays = pairedDaysFor(input, 'dliMol');
  const temperatureDays = pairedDaysFor(input, 'airTempC');
  const coverTransmission = fitCoverTransmission(input, dliDays);
  const knownCoverTransmission = coverTransmission
    ?? (input.existing?.farmId === input.farmId
      && input.existing.environmentId === input.environment.id
      ? input.existing.parameters.coverTransmission
      : undefined);
  const uValueWm2K = knownCoverTransmission === undefined
    ? undefined
    : fitUValue(input, temperatureDays, knownCoverTransmission);
  const fittedParameters = {
    ...(coverTransmission !== undefined ? { coverTransmission } : {}),
    ...(uValueWm2K !== undefined ? { uValueWm2K } : {}),
  };

  if (Object.keys(fittedParameters).length === 0) {
    const dliUsableDays = dliDays.filter(({ environment }) =>
      Number.isFinite(environment.dliNaturalMol) && environment.dliNaturalMol! > 0,
    );
    const pairedDays = Math.max(dliUsableDays.length, temperatureDays.length);
    if (dliUsableDays.length < MIN_PAIRED_DAYS && temperatureDays.length < MIN_PAIRED_DAYS) {
      return { status: 'insufficient-data', pairedDays, minimumPairedDays: MIN_PAIRED_DAYS };
    }
    return {
      status: 'not-identifiable',
      pairedDays,
      reason: knownCoverTransmission === undefined
        ? 'Cover transmission needs at least 14 paired natural-DLI days with non-zero outdoor DLI.'
        : 'The measured temperature response does not identify U value for this environment.',
    };
  }

  const archetype = archetypes[input.environment.archetype];
  const existingParameters = input.existing?.farmId === input.farmId
    && input.existing.environmentId === input.environment.id
    ? input.existing.parameters
    : {};
  const parameters = { ...existingParameters, ...fittedParameters };
  const changes: CalibrationChange[] = [];
  if (parameters.coverTransmission !== undefined
    && Math.abs(parameters.coverTransmission - archetype.coverTransmission) >= COVER_STEP / 2) {
    changes.push({ parameter: 'coverTransmission', from: archetype.coverTransmission, to: parameters.coverTransmission });
  }
  if (parameters.uValueWm2K !== undefined
    && Math.abs(parameters.uValueWm2K - archetype.uValueWm2K) >= U_VALUE_STEP / 2) {
    changes.push({ parameter: 'uValueWm2K', from: archetype.uValueWm2K, to: parameters.uValueWm2K });
  }
  const pairedDays = Math.max(
    coverTransmission !== undefined
      ? dliDays.filter(({ environment }) => Number.isFinite(environment.dliNaturalMol) && environment.dliNaturalMol! > 0).length
      : 0,
    uValueWm2K !== undefined ? temperatureDays.length : 0,
  );
  const calibration: FarmCalibration = {
    version: 'farm-calibration-v1',
    revision: input.existing?.revision ? input.existing.revision + 1 : 1,
    farmId: input.farmId,
    environmentId: input.environment.id,
    fittedAt: fittedAtFor(input.observations.filter((observation) => matchesEnvironment(observation, input))),
    pairedDays,
    parameters,
  };
  return {
    status: 'fitted',
    pairedDays,
    proposal: {
      calibration,
      defaults: {
        coverTransmission: archetype.coverTransmission,
        uValueWm2K: archetype.uValueWm2K,
      },
      changes,
    },
  };
}
