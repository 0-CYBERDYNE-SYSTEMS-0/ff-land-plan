/**
 * Deterministic growing-world climate prototype (Workstream B).
 *
 * This is a daily steady-state approximation, not the full hourly greenhouse
 * model in Vanthoor, B.H.E. (2011), A model-based greenhouse design method,
 * PhD thesis, Wageningen University, DOI: 10.18174/170301. Constants used
 * here follow the project contract: air heat capacity 1005 J/(kg·K), air
 * density 1.2 kg/m³, and latent heat 2.45 MJ/kg. Reference: Vanthoor, B.H.E.,
 * Stanghellini, C., van Henten, E.J. & de Visser, P.H.B. (2011). A methodology
 * for model-based greenhouse design: Part 1, a greenhouse climate model for a
 * broad range of designs and climates. Biosystems Engineering 110(4), 363–377.
 * https://doi.org/10.1016/j.biosystemseng.2011.06.001. All installed equipment is
 * passed in explicitly. Archetype setpoints alone never create a heater,
 * cooler, lamp, dehumidifier or CO₂ source.
 *
 * Climate equipment figures are model inputs until Workstream C lands its
 * single placed-asset aggregator. They are not inferred from palette assets.
 */
import { archetypes } from '@/creative/archetypes';
import type { DailyEnvironment } from './types';
import type { Environment, EnvironmentArchetype } from '@/types';

const AIR_DENSITY_KG_M3 = 1.2;
const AIR_HEAT_CAPACITY_J_KG_K = 1005;
const WATER_LATENT_HEAT_J_KG = 2.45e6;
const FLOOR_ABSORPTIVITY = 0.6;
const PAR_WM2_TO_DLI = 0.0864;
const OUTDOOR_CO2_PPM = 420;
const CO2_KG_PER_PPM_M3 = 1.84e-6;

export interface OutdoorClimateDay {
  tMinC: number;
  tMaxC: number;
  precipMm: number;
  /** Natural-light daily integral, mol/m²/day. Missing means no light input. */
  dliNaturalMol?: number;
  rhPct?: number;
  co2Ppm?: number;
}

/** Explicit climate terms. The Workstream C asset aggregator will supply these. */
export interface ClimateEquipmentInput {
  ppfdUmol: number;
  lightingW: number;
  photoperiodH: number;
  achBoost: number;
  heatingKw: number;
  coolingKw: number;
  dehumLpd: number;
  /** Installed unit capacity reaches zero below this RH. */
  dehumDerateBelowRh?: number;
  /** Optional explicit CO₂ capacity supplied by placed assets. */
  co2TargetPpm: number | null;
  co2KgDay?: number;
}

export const NO_CLIMATE_EQUIPMENT: Readonly<ClimateEquipmentInput> = {
  ppfdUmol: 0,
  lightingW: 0,
  photoperiodH: 0,
  achBoost: 0,
  heatingKw: 0,
  coolingKw: 0,
  dehumLpd: 0,
  co2TargetPpm: null,
  co2KgDay: 0,
};

export interface EnvironmentClimateDay {
  tMinC: number;
  tMaxC: number;
  rhPct: number;
  vpdKPa: number;
  dliMol: number;
  /** False when neither a natural-light input nor placed light data exists. */
  dliAvailable: boolean;
  co2Ppm: number;
  leafWetHours: number;
  etFactor: number;
  rainMm: number;
  ach: number;
  provenance: {
    source: 'model-estimate';
    derivedFrom: 'archetype' | 'equipment';
  };
}

export interface EnvironmentClimateInputs {
  /** Whole-environment transpiration estimate passed from the crop model. */
  transpirationKgDay?: number;
  /** Canopy LAI used only by the simplified CO₂ uptake term. */
  leafAreaIndex?: number;
  /** User-approved calibration terms; other archetype defaults remain fixed. */
  modelOverrides?: Partial<Pick<EnvironmentArchetype, 'coverTransmission' | 'uValueWm2K'>>;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const MAX_ENV_DIM_M = 10_000;
const MAX_OUTDOOR_DLI_MOL = 80;
const MAX_TRANSPIRATION_KG_DAY = 1e9;
const MAX_EQUIPMENT_TERM = 1e9;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function finiteBound(value: number | undefined, fallback: number, low: number, high: number): number {
  return value !== undefined && Number.isFinite(value) ? clamp(value, low, high) : fallback;
}

function nonNegative(value: number | undefined): number {
  return finiteBound(value, 0, 0, MAX_EQUIPMENT_TERM);
}

function saturationVaporPressureKPa(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

function absoluteHumidityGm3(tempC: number, rhPct: number): number {
  const vaporPressureKPa = saturationVaporPressureKPa(tempC) * clamp(rhPct, 0, 100) / 100;
  return (2167 * vaporPressureKPa) / (tempC + 273.15);
}

export type ClimateEnvironment = Pick<Environment, 'archetype' | 'widthM' | 'heightM' | 'layout' | 'setpoints'>;

function archetypeFor(environment: ClimateEnvironment): EnvironmentArchetype {
  const id: unknown = environment.archetype;
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(archetypes, id)
    ? archetypes[id as keyof typeof archetypes]
    : archetypes['open-field'];
}

/** Resolve one shared light schedule for climate and per-target DLI. An
 * environment value is an explicit override; absent values use the placed
 * light's documented schedule, then the archetype's default. */
export function effectivePhotoperiodH(
  environment: ClimateEnvironment,
  equipmentPhotoperiodH: number,
): number {
  const archetype = archetypeFor(environment);
  const assetDefault = nonNegative(equipmentPhotoperiodH);
  const archetypeDefault = nonNegative(archetype.setpoints?.photoperiodH);
  const fallback = assetDefault > 0 ? assetDefault : archetypeDefault;
  const value = environment.setpoints?.photoperiodH ?? fallback;
  return finiteBound(value, fallback, 0, 24);
}

function solveTemperature(
  outdoorC: number,
  solarW: number,
  lightHeatW: number,
  latentW: number,
  archetype: EnvironmentArchetype,
  equipment: ClimateEquipmentInput,
  baseAch: number,
  volumeM3: number,
  uaWPerK: number,
  heatSetpointC: number | undefined,
  coolSetpointC: number | undefined,
): { temperatureC: number; ach: number } {
  const passiveW = solarW + lightHeatW - latentW;
  let ach = baseAch;

  const solveAtAch = (achValue: number): number => {
    const ventilationWPerK = AIR_DENSITY_KG_M3 * AIR_HEAT_CAPACITY_J_KG_K * achValue * volumeM3 / 3600;
    const conductance = Math.max(1, uaWPerK + ventilationWPerK);
    const uncontrolledC = outdoorC + passiveW / conductance;
    const heatCapacityW = nonNegative(equipment.heatingKw) * 1000;
    const coolingCapacityW = nonNegative(equipment.coolingKw) * 1000;
    const heatW = heatSetpointC !== undefined && uncontrolledC < heatSetpointC
      ? Math.min(heatCapacityW, Math.max(0, (heatSetpointC - outdoorC) * conductance - passiveW))
      : 0;
    const coolW = coolSetpointC !== undefined && uncontrolledC > coolSetpointC
      ? Math.min(coolingCapacityW, Math.max(0, passiveW - (coolSetpointC - outdoorC) * conductance))
      : 0;
    return clamp(outdoorC + (passiveW + heatW - coolW) / conductance, -80, 80);
  };

  let temperatureC = solveAtAch(ach);
  if (archetype.kind === 'protected' && coolSetpointC !== undefined && temperatureC > coolSetpointC) {
    const ventedAch = Math.max(baseAch, archetype.achVented);
    const ventingFraction = clamp((temperatureC - coolSetpointC) / 5, 0, 1);
    ach = baseAch + (ventedAch - baseAch) * ventingFraction;
    temperatureC = solveAtAch(ach);
  }

  return { temperatureC, ach };
}

/**
 * Compute one deterministic daily climate estimate for a single environment.
 * The optional previous result carries indoor humidity and CO₂ state forward.
 * Equipment is an explicit required argument; use NO_CLIMATE_EQUIPMENT when
 * no physics-bearing items are installed.
 */
export function environmentDay(
  environment: ClimateEnvironment,
  outdoor: OutdoorClimateDay,
  equipment: ClimateEquipmentInput,
  previous?: Pick<EnvironmentClimateDay, 'rhPct' | 'co2Ppm'>
    & Partial<Pick<EnvironmentClimateDay, 'tMinC' | 'tMaxC'>>,
  inputs: EnvironmentClimateInputs = {},
): EnvironmentClimateDay {
  const baseArchetype = archetypeFor(environment);
  const archetype = {
    ...baseArchetype,
    coverTransmission: finiteBound(inputs.modelOverrides?.coverTransmission, baseArchetype.coverTransmission, 0, 1),
    uValueWm2K: finiteBound(inputs.modelOverrides?.uValueWm2K, baseArchetype.uValueWm2K, 0.01, 50),
  };
  const setpoints = { ...archetype.setpoints, ...environment.setpoints };
  const widthM = finiteBound(environment.widthM, archetype.defaultFootprint.wM, 0.1, MAX_ENV_DIM_M);
  const depthM = finiteBound(environment.heightM, archetype.defaultFootprint.hM, 0.1, MAX_ENV_DIM_M);
  const floorAreaM2 = widthM * depthM;
  const perimeterM = 2 * (widthM + depthM);
  const usableHeightM = finiteBound(
    environment.layout?.usableHeightM ?? archetype.defaultUsableHeightM ?? archetype.volumePerM2,
    2,
    0.1,
    MAX_ENV_DIM_M,
  );
  const volumeM3 = Math.max(0.01, floorAreaM2 * usableHeightM);
  const envelopeAreaM2 = 2 * floorAreaM2 + perimeterM * usableHeightM;
  const uaWPerK = archetype.uValueWm2K * envelopeAreaM2;
  const infiltrationAch = nonNegative(archetype.achInfiltration);
  const achBoost = Math.min(nonNegative(equipment.achBoost), infiltrationAch * 3);
  const baseAch = infiltrationAch + achBoost;
  const outdoorTMinC = finiteBound(outdoor.tMinC, 20, -80, 80);
  const outdoorTMaxC = Math.max(outdoorTMinC, finiteBound(outdoor.tMaxC, outdoorTMinC, -80, 80));
  const outdoorRainMm = finiteBound(outdoor.precipMm, 0, 0, 500);
  const naturalDli = finiteBound(outdoor.dliNaturalMol, 0, 0, MAX_OUTDOOR_DLI_MOL);
  const ppfdUmol = nonNegative(equipment.ppfdUmol);
  const lightingW = nonNegative(equipment.lightingW);
  const hasInstalledLight = ppfdUmol > 0 || lightingW > 0;
  const photoperiodH = hasInstalledLight ? effectivePhotoperiodH(environment, equipment.photoperiodH) : 0;
  const lightHeatW = lightingW * 0.6 * photoperiodH / 24;
  const dliMol = clamp(
    naturalDli * archetype.coverTransmission + ppfdUmol * photoperiodH * 3600 / 1e6,
    0,
    archetype.maxDliMol,
  );
  const solarW = naturalDli / PAR_WM2_TO_DLI * archetype.coverTransmission * FLOOR_ABSORPTIVITY * floorAreaM2;
  const transpirationKgDay = nonNegative(inputs.transpirationKgDay);
  const latentW = transpirationKgDay * WATER_LATENT_HEAT_J_KG / 86400;

  const min = archetype.kind === 'open'
    ? { temperatureC: outdoorTMinC, ach: 0 }
    : solveTemperature(outdoorTMinC, 0, lightHeatW, latentW, archetype, equipment, baseAch, volumeM3, uaWPerK, setpoints.heatC, setpoints.coolC);
  const max = archetype.kind === 'open'
    ? { temperatureC: outdoorTMaxC, ach: 0 }
    : solveTemperature(outdoorTMaxC, solarW, lightHeatW, latentW, archetype, equipment, baseAch, volumeM3, uaWPerK, setpoints.heatC, setpoints.coolC);
  const ach = archetype.kind === 'open' ? 0 : (min.ach + max.ach) / 2;
  const tMeanC = (min.temperatureC + max.temperatureC) / 2;

  const outdoorRhPct = finiteBound(outdoor.rhPct, 60, 0, 100);
  const outdoorAbsoluteHumidity = absoluteHumidityGm3((outdoorTMinC + outdoorTMaxC) / 2, outdoorRhPct);
  const previousAbsoluteHumidity = previous
    ? absoluteHumidityGm3(
      (finiteBound(previous.tMinC ?? outdoorTMinC, outdoorTMinC, -80, 80)
        + finiteBound(previous.tMaxC ?? outdoorTMaxC, outdoorTMaxC, -80, 80)) / 2,
      finiteBound(previous.rhPct, outdoorRhPct, 0, 100),
    )
    : outdoorAbsoluteHumidity;
  // ACH is exchanges per hour. For constant ACH and transpiration over the
  // day, solve dAH/dt = -ACH * (AH - outdoorAH) + source. The source term is
  // attenuated by the same exchange, with its zero-ACH limit kept explicit.
  const exchangePerDay = Math.min(ach, 100) * 24;
  const leakageFraction = archetype.kind === 'open' ? 1 : -Math.expm1(-exchangePerDay);
  const transpirationGm3PerDay = Math.min(MAX_TRANSPIRATION_KG_DAY, nonNegative(inputs.transpirationKgDay)) * 1000 / volumeM3;
  const transpirationRetention = archetype.kind === 'open'
    ? 0
    : exchangePerDay > 0 ? leakageFraction / exchangePerDay : 1;
  let indoorAbsoluteHumidity = previousAbsoluteHumidity
    + (outdoorAbsoluteHumidity - previousAbsoluteHumidity) * leakageFraction
    + transpirationGm3PerDay * transpirationRetention;
  const saturationHumidity = absoluteHumidityGm3(tMeanC, 100);
  // Condensed vapour leaves the air mass balance instead of being retained as
  // impossible supersaturated humidity when temperature changes overnight.
  indoorAbsoluteHumidity = Math.min(indoorAbsoluteHumidity, saturationHumidity);
  const rhBeforeDehumidification = clamp(indoorAbsoluteHumidity / Math.max(0.01, saturationHumidity) * 100, 0, 100);
  const dehumidifierLpd = nonNegative(equipment.dehumLpd);
  const derateBelowRh = finiteBound(equipment.dehumDerateBelowRh, 50, 0, 100);
  const rhMaxPct = finiteBound(setpoints.rhMaxPct, 85, derateBelowRh, 100);
  const dehumidifierRate = rhMaxPct > derateBelowRh
    ? clamp((rhBeforeDehumidification - derateBelowRh) / (rhMaxPct - derateBelowRh), 0, 1)
    : 0;
  indoorAbsoluteHumidity = Math.max(0, indoorAbsoluteHumidity - dehumidifierLpd * dehumidifierRate * 1000 / volumeM3);
  const rhPct = clamp(indoorAbsoluteHumidity / Math.max(0.01, saturationHumidity) * 100, 0, 100);
  const vpdKPa = Math.max(0, saturationVaporPressureKPa(tMeanC) * (1 - rhPct / 100));

  const outdoorCo2Ppm = finiteBound(outdoor.co2Ppm, OUTDOOR_CO2_PPM, 350, 1500);
  let co2Ppm = previous ? finiteBound(previous.co2Ppm, outdoorCo2Ppm, 350, 1500) : outdoorCo2Ppm;
  if (archetype.kind === 'sealed') {
    const co2TargetPpm = setpoints.co2Ppm === undefined
      ? equipment.co2TargetPpm
      : finiteBound(setpoints.co2Ppm, equipment.co2TargetPpm ?? outdoorCo2Ppm, 350, 1500);
    const exchangePerHour = Math.min(ach, 100);
    const exchangeDecay = Math.exp(-exchangePerHour * 24);
    const uptakePpmDay = nonNegative(inputs.leafAreaIndex) * 3;
    const solveEndOfDay = (sourcePpmDay: number): number => {
      if (exchangePerHour <= 0) return co2Ppm + sourcePpmDay - uptakePpmDay;
      const dailyExchange = 24 * exchangePerHour;
      const netRatePpmDay = sourcePpmDay - uptakePpmDay;
      return outdoorCo2Ppm
        + (co2Ppm - outdoorCo2Ppm - netRatePpmDay / dailyExchange) * exchangeDecay
        + netRatePpmDay / dailyExchange;
    };
    const noSourcePpm = solveEndOfDay(0);
    let sourcePpmDay = 0;
    const enrichmentKgDay = nonNegative(equipment.co2KgDay);
    if (co2TargetPpm !== null && enrichmentKgDay > 0 && noSourcePpm < co2TargetPpm) {
      const targetGap = co2TargetPpm - noSourcePpm;
      const sourceEffect = exchangePerHour > 0
        ? (1 - exchangeDecay) / (24 * exchangePerHour)
        : 1;
      const requiredSourcePpmDay = targetGap / sourceEffect;
      const availableSourcePpmDay = enrichmentKgDay / (CO2_KG_PER_PPM_M3 * volumeM3);
      sourcePpmDay = Math.min(requiredSourcePpmDay, availableSourcePpmDay);
    }
    co2Ppm = solveEndOfDay(sourcePpmDay);
  } else {
    co2Ppm = outdoorCo2Ppm;
  }
  co2Ppm = clamp(co2Ppm, 350, 1500);

  const leafWetHours = archetype.kind === 'open'
    ? (outdoorRainMm > 0 ? 24 : 0)
    : clamp((rhPct - 80) / 20 * 24, 0, 24);
  const etFactor = archetype.kind === 'open'
    ? 1
    : clamp(1 + 0.15 * (vpdKPa - 1) - 0.1 * (ach / 10), 0.35, 1.3);
  const equipmentAffects = lightHeatW > 0 || (ppfdUmol > 0 && photoperiodH > 0) || achBoost > 0 || nonNegative(equipment.heatingKw) > 0
    || nonNegative(equipment.coolingKw) > 0 || dehumidifierLpd > 0 || nonNegative(equipment.co2KgDay) > 0;

  return {
    tMinC: min.temperatureC,
    tMaxC: max.temperatureC,
    rhPct,
    vpdKPa,
    dliMol,
    dliAvailable: outdoor.dliNaturalMol !== undefined || (hasInstalledLight && photoperiodH > 0) || archetype.dliMode === 'supplement-only',
    co2Ppm,
    leafWetHours,
    etFactor,
    rainMm: archetype.kind === 'open' ? outdoorRainMm : 0,
    ach,
    provenance: { source: 'model-estimate', derivedFrom: equipmentAffects ? 'equipment' : 'archetype' },
  };
}

/** Apply the daily interior estimate to the frozen outdoor day. Open fields
 * keep the exact incoming object so flag-on does not perturb their outputs. */
export function withEnvironmentClimate(
  outdoor: DailyEnvironment,
  climate: EnvironmentClimateDay,
  archetype: EnvironmentArchetype,
): DailyEnvironment {
  if (archetype.kind === 'open') return outdoor;
  return {
    ...outdoor,
    tMinC: climate.tMinC,
    tMaxC: climate.tMaxC,
    precipMm: climate.rainMm,
    etoMm: round2(outdoor.etoMm * climate.etFactor),
    gddBase10C: round2(Math.max(0, (climate.tMinC + climate.tMaxC) / 2 - 10)),
    provenance: {
      ...outdoor.provenance,
      tMinC: 'model-estimate',
      tMaxC: 'model-estimate',
      precipMm: 'model-estimate',
      etoMm: 'model-estimate',
    },
    climate,
  };
}
