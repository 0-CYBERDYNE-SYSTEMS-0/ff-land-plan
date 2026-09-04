// Real plan-aware simulation engine (WS-A). Pure + deterministic: identical
// inputs (+ startDate) ⇒ identical output; no Math.random, no fetch, no
// storage. Weather/climate data is passed IN by the caller (localApi wires
// forecast + climate normals). Every named constant documents its origin.

import { SURFACE_SHELTER } from '@/lib/growth';
import type { ClimateNormals } from '@/lib/climate';
import type { Crop, Farm, ForecastDay, PlanState, ScenarioType } from '@/types';

export interface SimInput {
  name: string; scenarioType: ScenarioType; durationDays: number;
  tempDeltaC: number; precipMultiplier: number; fertilizerBoost: number;
}

export interface SimCropResult {
  cropId: number; name: string; cells: number; areaHa: number;
  yieldTonHa: number; stressScore: number; waterDeficitMm: number; stressDays: number;
}

export interface SimProvenance {
  weather: 'live-forecast' | 'climate-model';
  climate: 'era5-normals' | 'none';
  plan: 'plan-aware' | 'fallow';
}

export interface SimOutcome {
  yieldTonHa: number; waterUseMm: number; carbonKgHa: number; profitUsdHa: number;
  stressScore: number; summary: string;
  perCrop: SimCropResult[]; provenance: SimProvenance;
}

export function runSimulation(args: {
  farm: Farm; plan: PlanState | null; crops: Crop[]; input: SimInput;
  forecast?: ForecastDay[]; climate?: ClimateNormals | null; startDate?: Date;
}): SimOutcome {
  const { farm, crops, input } = args;
  const plan = args.plan;
  const start = args.startDate ?? new Date();
  const surface = plan?.surface ?? 'outdoor';
  const shelter = SURFACE_SHELTER[surface];

  // --- Daily weather series (scenario-adjusted) ---
  const forecast = args.forecast ?? [];
  const weather: SimProvenance['weather'] = forecast.length > 0 ? 'live-forecast' : 'climate-model';
  const climateProv: SimProvenance['climate'] = args.climate ? 'era5-normals' : 'none';

  const days: DailyPoint[] = [];
  for (let i = 0; i < input.durationDays; i++) {
    const date = new Date(start.getTime() + i * MS_DAY);
    let pt: DailyPoint;
    if (i < forecast.length) {
      const f = forecast[i]!;
      pt = { tmeanC: (f.maxTempC + f.minTempC) / 2, precipMm: f.precipMm, et0Mm: FALLBACK_ET0_MM };
    } else if (args.climate) {
      pt = climateDaily(date, args.climate);
    } else {
      pt = { tmeanC: FALLBACK_TMEAN_C, precipMm: FALLBACK_PRECIP_MM, et0Mm: FALLBACK_ET0_MM };
    }
    // Scenario deltas attenuated by surface shelter (one source of truth in
    // growth.ts): outdoor takes the full force, a tent barely feels a heatwave.
    const tmean = pt.tmeanC + input.tempDeltaC * shelter;
    const precip =
      input.precipMultiplier < 1
        ? pt.precipMm * (1 - (1 - input.precipMultiplier) * shelter)
        : pt.precipMm * input.precipMultiplier;
    days.push({ tmeanC: tmean, precipMm: precip, et0Mm: pt.et0Mm });
  }

  // --- Inventory ---
  const cropById = new Map(crops.map((c) => [c.id, c]));
  const cellsByCrop = new Map<number, number>();
  if (plan) {
    for (const id of Object.values(plan.planting)) cellsByCrop.set(id, (cellsByCrop.get(id) ?? 0) + 1);
  }
  const cellM = plan?.cellM ?? 1;

  if (cellsByCrop.size === 0) {
    // Documented fallow outcome: bare-soil evaporation ≈ 0.5 × et0 (FAO-56
    // bare-soil stage order — exposed soil evaporates less than a canopy ET).
    const waterUseMm = round1(days.reduce((s, d) => s + d.et0Mm * BARE_SOIL_ET0_FRACTION, 0));
    const summary =
      `Fallow plot (${farm.name}): no planted cells — bare-soil water use ${waterUseMm} mm over ${input.durationDays} days` +
      ` — weather: ${weather === 'live-forecast' ? 'live forecast' : 'climate model'}` +
      `${climateProv === 'era5-normals' ? ' + ERA5 normals' : ''}`;
    return {
      yieldTonHa: 0, waterUseMm, carbonKgHa: 0, profitUsdHa: 0, stressScore: 0, summary,
      perCrop: [], provenance: { weather, climate: climateProv, plan: 'fallow' },
    };
  }

  // --- Per-crop daily loop ---
  const fertCoverage = clamp01(input.fertilizerBoost * FERT_COVERAGE_PER_UNIT);
  const perCrop: SimCropResult[] = [];
  let totalAreaHa = 0;
  let yieldPerHaSum = 0; // area-weighted
  let demandSum = 0; // area-weighted mm over the window
  let stressSum = 0; // area-weighted
  let deficitAreaSum = 0;
  let totalStressDays = 0;
  let carbonAreaSum = 0;
  let profitAreaSum = 0;

  for (const [cropIdKey, cells] of cellsByCrop) {
    const crop = cropById.get(cropIdKey);
    if (!crop) continue;
    const areaHa = (cells * cellM * cellM) / 10_000;
    const baseT = Math.min(BASE_T_CEIL_C, Math.max(BASE_T_FLOOR_C, crop.minTempC));
    let gdd = 0;
    let stressDays = 0;
    let deficitMm = 0;
    let metMm = 0;
    for (const d of days) {
      gdd += Math.max(0, d.tmeanC - baseT);
      if (d.tmeanC > crop.maxTempC || d.tmeanC < crop.minTempC) stressDays++;
      const supply = d.precipMm + d.et0Mm * IRRIGATION_COVERAGE;
      deficitMm += Math.max(0, crop.waterNeedMmDay - supply);
      metMm += Math.min(crop.waterNeedMmDay, supply);
    }
    const deficitRatio = clamp01(deficitMm / Math.max(1, crop.waterNeedMmDay * input.durationDays));
    const nutrientGap = STRESS_NUTRIENT_NEED[crop.nitrogenNeed] * (1 - fertCoverage);
    const stressScore = round2(clamp01(
      STRESS_W_THERMAL * Math.min(1, stressDays / Math.max(1, input.durationDays)) +
      STRESS_W_WATER * deficitRatio +
      STRESS_W_NUTRIENT * nutrientGap,
    ) * 100);
    const growthFactor = 1 - GROWTH_STRESS_SENSITIVITY * (stressScore / 100);
    const yieldPerHa = crop.yieldTonHa * growthFactor;
    const yieldTonHa = round2(yieldPerHa * areaHa);

    perCrop.push({
      cropId: crop.id, name: crop.name, cells, areaHa: round2(areaHa),
      yieldTonHa, stressScore, waterDeficitMm: round1(deficitMm), stressDays,
    });
    totalAreaHa += areaHa;
    yieldPerHaSum += yieldPerHa * areaHa;
    demandSum += metMm * areaHa;
    stressSum += stressScore * areaHa;
    deficitAreaSum += deficitMm * areaHa;
    totalStressDays += stressDays;
    carbonAreaSum += CARBON_RESIDUE_KGHA[crop.category] * (1 + CARBON_FERT_FACTOR * input.fertilizerBoost) * areaHa;
    profitAreaSum += (yieldPerHa * PRICE_USD_T[crop.category]
      - metMm * WATER_COST_USD_MM
      - FERT_COST_USD_PER_BOOST * input.fertilizerBoost) * areaHa;
  }

  const area = totalAreaHa > 0 ? totalAreaHa : 1;
  const yieldTonHa = round2(yieldPerHaSum / area);
  const waterUseMm = round1(demandSum / area);
  const carbonKgHa = Math.round(carbonAreaSum / area);
  const profitUsdHa = Math.round(profitAreaSum / area);
  const stressScore = round1(stressSum / area);
  const deficitMean = round1(deficitAreaSum / area);

  const weatherLabel =
    weather === 'live-forecast'
      ? `live forecast${climateProv === 'era5-normals' ? ' + ERA5 normals' : ''}`
      : climateProv === 'era5-normals' ? 'ERA5 normals' : 'generic climate model';

  const summary =
    `${perCrop.length} crop${perCrop.length === 1 ? '' : 's'} on ${Math.round(totalAreaHa * 10_000)} m²` +
    ` over ${input.durationDays} days: ${totalStressDays} stress-days, ${deficitMean} mm deficit — yield ${yieldTonHa} t/ha` +
    ` — weather: ${weatherLabel}`;

  return {
    yieldTonHa, waterUseMm, carbonKgHa, profitUsdHa, stressScore, summary,
    perCrop: perCrop.sort((a, b) => b.areaHa - a.areaHa),
    provenance: { weather, climate: climateProv, plan: 'plan-aware' },
  };
}

// --- Named constants (origin / order of magnitude) ---------------------------

const MS_DAY = 86_400_000;

// Generic temperate growing-season day when no climate normals are available
// (offline, no cache): ~18 °C / 2 mm rain / 3 mm ET0 is mid-latitude order
// (cf. ERA5 normals for Portland in June). Keeps sims deterministic.
const FALLBACK_TMEAN_C = 18;
const FALLBACK_PRECIP_MM = 2;
const FALLBACK_ET0_MM = 3;

// GDD base clamped to 0..10 °C: catalog minTempC is the crop's survival floor
// (can be negative); real agronomic bases live in 0..10 (peas 5, maize 10).
const BASE_T_FLOOR_C = 0;
const BASE_T_CEIL_C = 10;

// Supply model (stated + simple): daily water supply = effective precip +
// irrigation proxy = et0 × 0.7. 0.7 ≈ typical supplementary irrigation
// meeting ~70 % of reference ET on rain-free days (FAO-56 order).
const IRRIGATION_COVERAGE = 0.7;
const BARE_SOIL_ET0_FRACTION = 0.5;

// Carbon: residue + root biomass proxy kg CO₂e/ha by category, from crop
// residue literature orders (grain stover highest, vegetables low). Each
// fertilizer boost unit adds 10 % (N₂O + residue increase, IPCC Tier-1 order).
const CARBON_RESIDUE_KGHA: Record<Crop['category'], number> = {
  vegetable: 500, grain: 2000, fruit: 1500, herb: 400,
  cover_crop: 800, flower: 400, fungus: 100,
};
const CARBON_FERT_FACTOR = 0.1;

// Profit approximations (page's existing rough magnitudes, now documented):
// farm-gate price bands by category around a ~$60/t midpoint (premium crops
// higher, commodity grain lower); water ~$0.4 per mm applied; fertilizer
// ~$30 per boost unit per ha.
const PRICE_USD_T: Record<Crop['category'], number> = {
  vegetable: 150, fruit: 120, herb: 200, grain: 40,
  cover_crop: 20, flower: 150, fungus: 200,
};
const WATER_COST_USD_MM = 0.4;
const FERT_COST_USD_PER_BOOST = 30;

// Stress weights (sum 1, monotonic): thermal days dominate, water-deficit
// ratio second, nutrient gap last. 30 stressed days of the window saturate
// the thermal component.
const STRESS_W_THERMAL = 0.5;
const STRESS_W_WATER = 0.35;
const STRESS_W_NUTRIENT = 0.15;
// Fertilizer coverage mapping: 0.5 coverage per boost unit ⇒ boost ≥ 2
// fully covers 'high' nitrogen need, ≥ 1 covers 'medium'.
const FERT_COVERAGE_PER_UNIT = 0.5;
const STRESS_NUTRIENT_NEED: Record<Crop['nitrogenNeed'], number> = { low: 0, medium: 0.5, high: 1 };

// Growth response: Ky-style simplification (FAO-33 relative yield loss ≈
// Ky × relative stress) with Ky folded to 0.6 — bounded, monotonic.
const GROWTH_STRESS_SENSITIVITY = 0.6;

interface DailyPoint { tmeanC: number; precipMm: number; et0Mm: number }

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Climate-derived day: tmean from the date's month blended linearly with the
// adjacent month by distance to mid-month; precip/et0 ≈ monthly total / days.
function climateDaily(date: Date, climate: ClimateNormals): DailyPoint {
  const mo = date.getMonth(); // 0-based
  const m = climate.monthly[mo]!;
  const adj = climate.monthly[(mo + 1) % 12]!;
  const dim = DAYS_IN_MONTH[mo]!;
  const adjDim = DAYS_IN_MONTH[(mo + 1) % 12]!;
  const frac = Math.abs(date.getDate() - (dim + 1) / 2) / (dim / 2); // 0 mid-month → 1 edge
  return {
    tmeanC: tmean(m) * (1 - frac) + tmean(adj) * frac,
    precipMm: (m.precipMm / dim) * (1 - frac) + (adj.precipMm / adjDim) * frac,
    et0Mm: (m.et0Mm / dim) * (1 - frac) + (adj.et0Mm / adjDim) * frac,
  };
}

const tmean = (m: { tminC: number; tmaxC: number }) => (m.tminC + m.tmaxC) / 2;

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
