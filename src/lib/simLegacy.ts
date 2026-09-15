// LEGACY twin-wave simulation engine (MISSION-TWIN waves 2–4: plan-aware
// what-ifs, FAO-56 Kc/Ky, ensembles/CMIP6 yield ranges). Superseded as the
// product path by the Sim Core deterministic run engine in src/lib/sim/
// (SPEC-SIM-ECOSYSTEM); kept verbatim as the reference for re-wiring the
// ensembles/CMIP6 scenario data into sim runs. Renamed from src/lib/sim.ts
// in the pro-upgrade←main merge so '@/lib/sim' resolves to the Sim Core
// engine index rather than this file (file would shadow the directory).

// Real plan-aware simulation engine (WS-A). Pure + deterministic: identical
// inputs (+ startDate) ⇒ identical output; no Math.random, no fetch, no
// storage. Weather/climate data is passed IN by the caller (localApi wires
// forecast + climate normals). Every named constant documents its origin.

import { SURFACE_SHELTER } from '@/lib/growth';
import { kcAtFraction, kcForCategory, kyForCategory } from '@/data/fao56';
import type { ClimateNormals } from '@/lib/climate';
import type { SeasonEnsembles } from '@/lib/ensembles';
import type { ClimateProjection } from '@/lib/cmip6';
import { awcBufferMm, omCarbonFactor, phNutrientFactor } from '@/lib/soilEffect';
import type { SoilProfile } from '@/lib/soil';
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
  climate: 'era5-normals' | 'era5-ensemble' | 'none'; // 'era5-ensemble' = a yield range was computed (Wave 3)
  plan: 'plan-aware' | 'fallow';
  cmip6Model?: string; // set when the climate_change scenario ran on a CMIP6 projection (old sims lack it — guarded render)
}

export interface YieldRange {
  lowYieldTonHa: number; medianYieldTonHa: number; highYieldTonHa: number; years: number;
}

export interface SimOutcome {
  yieldTonHa: number; waterUseMm: number; carbonKgHa: number; profitUsdHa: number;
  stressScore: number; summary: string;
  perCrop: SimCropResult[]; provenance: SimProvenance;
  range?: YieldRange; // per-year ensemble spread — absent when ensembles were not supplied or <3 usable years
}

export function runSimulation(args: {
  farm: Farm; plan: PlanState | null; crops: Crop[]; input: SimInput;
  forecast?: ForecastDay[]; climate?: ClimateNormals | null; startDate?: Date;
  ensembles?: SeasonEnsembles | null; projection?: ClimateProjection | null;
  soil?: SoilProfile | null;
}): SimOutcome {
  const { farm, crops, input } = args;
  const plan = args.plan;
  const start = args.startDate ?? new Date();
  const surface = plan?.surface ?? 'outdoor';
  const shelter = SURFACE_SHELTER[surface];

  // --- Effective scenario deltas ---
  // climate_change + projection ⇒ the CMIP6 deltas REPLACE the legacy preset
  // (+2 °C / −20 % precip from the page). Mapping to the manual paths:
  // deltaTempC → tempDeltaC (same shelter attenuation), deltaPrecipPct →
  // multiplier 1 + pct/100 fed through the SAME precipMultiplier attenuation
  // (drying is sheltered like manual reduction; wetter simply multiplies).
  const useProjection = input.scenarioType === 'climate_change' && args.projection != null;
  const effTempDelta = useProjection ? args.projection!.deltaTempC : input.tempDeltaC;
  const effPrecipMult =
    useProjection && args.projection!.deltaPrecipPct !== null
      ? 1 + args.projection!.deltaPrecipPct / 100
      : input.precipMultiplier;

  // --- Daily weather series (scenario-adjusted) ---
  const forecast = args.forecast ?? [];
  const weather: SimProvenance['weather'] = forecast.length > 0 ? 'live-forecast' : 'climate-model';
  let climateProv: SimProvenance['climate'] = args.climate ? 'era5-normals' : 'none';

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
    days.push(scenarioAdjust(pt, effTempDelta, effPrecipMult, shelter));
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
      perCrop: [], provenance: { weather, climate: climateProv, plan: 'fallow', ...(useProjection ? { cmip6Model: args.projection!.model } : {}) },
    };
  }

  // --- Per-crop daily loop (extracted so any daily series can be scored —
  // ensemble years reuse the exact same core; Wave 3) ---
  const fertCoverage = clamp01(input.fertilizerBoost * FERT_COVERAGE_PER_UNIT);
  const core = simulateOnSeries(days, {
    cropById, cellsByCrop, cellM,
    durationDays: input.durationDays,
    fertCoverage,
    fertilizerBoost: input.fertilizerBoost,
    soil: args.soil,
  });
  const perCrop = core.perCrop;

  // --- Ensemble range (Wave 3): run the identical core once per historical
  // year with the same effective scenario deltas; median uses the documented
  // even-count rule (average of the two middle sorted values) so output stays
  // deterministic. <3 usable years ⇒ no range. ---
  let range: YieldRange | undefined;
  const ensYears = [...(args.ensembles?.years ?? [])].sort((a, b) => a.year - b.year);
  if (ensYears.length >= 3) {
    const yields: number[] = [];
    for (const y of ensYears) {
      const series = y.daily.slice(0, input.durationDays).map((pt) => scenarioAdjust(pt, effTempDelta, effPrecipMult, shelter));
      if (series.length === 0) continue;
      yields.push(simulateOnSeries(series, { cropById, cellsByCrop, cellM, durationDays: series.length, fertCoverage, fertilizerBoost: input.fertilizerBoost, soil: args.soil }).yieldTonHa);
    }
    if (yields.length >= 3) {
      const s = [...yields].sort((a, b) => a - b);
      const mid = s.length >> 1;
      const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
      range = {
        lowYieldTonHa: s[0]!,
        medianYieldTonHa: round2(median),
        highYieldTonHa: s[s.length - 1]!,
        years: s.length,
      };
      climateProv = 'era5-ensemble';
    }
  }

  const weatherLabel =
    weather === 'live-forecast'
      ? `live forecast${climateProv === 'era5-normals' ? ' + ERA5 normals' : ''}`
      : climateProv === 'era5-normals' ? 'ERA5 normals' : 'generic climate model';

  const summary =
    `${perCrop.length} crop${perCrop.length === 1 ? '' : 's'} on ${Math.round(core.totalAreaHa * 10_000)} m²` +
    ` over ${input.durationDays} days: ${core.totalStressDays} stress-days, ${core.deficitMean} mm deficit — yield ${core.yieldTonHa} t/ha` +
    ` — weather: ${weatherLabel}` +
    (range ? ` — yield range ${range.lowYieldTonHa}–${range.highYieldTonHa} t/ha (median ${range.medianYieldTonHa}, ${range.years} seasons)` : '');

  return {
    yieldTonHa: core.yieldTonHa, waterUseMm: core.waterUseMm, carbonKgHa: core.carbonKgHa,
    profitUsdHa: core.profitUsdHa, stressScore: core.stressScore, summary,
    perCrop: perCrop.sort((a, b) => b.areaHa - a.areaHa),
    provenance: {
      weather, climate: climateProv, plan: 'plan-aware',
      ...(useProjection ? { cmip6Model: args.projection!.model } : {}),
    },
    ...(range ? { range } : {}),
  };
}

// Scenario deltas attenuated by surface shelter (one source of truth in
// growth.ts): outdoor takes the full force, a tent barely feels a heatwave.
// Precip reduction is sheltered; increase (multiplier ≥ 1) applies in full.
function scenarioAdjust(pt: DailyPoint, tempDeltaC: number, precipMultiplier: number, shelter: number): DailyPoint {
  return {
    tmeanC: pt.tmeanC + tempDeltaC * shelter,
    precipMm:
      precipMultiplier < 1
        ? pt.precipMm * (1 - (1 - precipMultiplier) * shelter)
        : pt.precipMm * precipMultiplier,
    et0Mm: pt.et0Mm,
  };
}

// Core per-crop scoring over ANY daily series — the single computation both
// the primary run and every ensemble year go through (deterministic, pure).
function simulateOnSeries(
  days: readonly DailyPoint[],
  ctx: { cropById: Map<number, Crop>; cellsByCrop: Map<number, number>; cellM: number; durationDays: number; fertCoverage: number; fertilizerBoost: number; soil?: SoilProfile | null },
): {
  perCrop: SimCropResult[]; totalAreaHa: number; totalStressDays: number; deficitMean: number;
  yieldTonHa: number; waterUseMm: number; carbonKgHa: number; profitUsdHa: number; stressScore: number;
} {
  const { cropById, cellsByCrop, cellM, durationDays, fertCoverage, fertilizerBoost, soil } = ctx;
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
    const kcCurve = kcForCategory(crop.category);
    const ky = kyForCategory(crop.category);
    let gdd = 0;
    let stressDays = 0;
    let deficitMm = 0;
    let metMm = 0;
    let demandMm = 0; // stage-aware FAO-56 demand total (for deficitRatio)
    for (let di = 0; di < days.length; di++) {
      const d = days[di]!;
      gdd += Math.max(0, d.tmeanC - baseT);
      if (d.tmeanC > crop.maxTempC || d.tmeanC < crop.minTempC) stressDays++;
      // Stage-aware demand (Wave 4 L1, FAO-56): ETc = Kc(f) × ET0 with the
      // season fraction f = elapsed/growthDays driving the Kc curve. The
      // catalog floor (waterNeedMmDay × 0.6) is kept so the catalog value
      // stays meaningful on low-ET0 days and legacy sims remain sane —
      // Kc × ET0 alone can dip near zero in a cool week, which would make
      // demand (and thus deficitRatio) collapse to noise.
      const f = clamp01((di + 1) / Math.max(1, crop.growthDays));
      const etc = kcAtFraction(kcCurve, f) * d.et0Mm;
      const useKc =
        Number.isFinite(d.et0Mm) && d.et0Mm >= 0 &&
        !(crop.category === 'fungus');
      // fungus: no Kc curve and zero transpiration demand (FAO-56 has no
      // curve for mushrooms — they do not transpire); legacy fallback keeps
      // the catalog floor when ET0 data is unusable.
      const demand = useKc
        ? Math.max(etc, crop.waterNeedMmDay * DEMAND_FLOOR_FRACTION)
        : crop.category === 'fungus' ? 0 : crop.waterNeedMmDay;
      demandMm += demand;
      const supply = d.precipMm + d.et0Mm * IRRIGATION_COVERAGE;
      deficitMm += Math.max(0, demand - supply);
      metMm += Math.min(demand, supply);
    }
    // Soil effects (Wave 4): plant-available water in the root zone relieves
    // accumulated deficit (AWC × rooting depth, capped at the deficit); pH
    // outside the 6-7 band degrades fertilizer effectiveness and lifts the
    // unmet-nutrient gap (availability falloff, extension-service ranges);
    // null soil ⇒ identity factors, legacy behavior.
    const effDeficit = deficitMm - awcBufferMm(deficitMm, soil?.awcMmPerCm ?? null);
    const phFactor = phNutrientFactor(soil?.ph ?? null);
    const deficitRatio = clamp01(effDeficit / Math.max(1, demandMm));
    const nutrientGap =
      STRESS_NUTRIENT_NEED[crop.nitrogenNeed] * (1 - fertCoverage * phFactor) * (2 - phFactor);
    const stressScore = round2(clamp01(
      STRESS_W_THERMAL * Math.min(1, stressDays / Math.max(1, durationDays)) +
      STRESS_W_WATER * deficitRatio +
      STRESS_W_NUTRIENT * nutrientGap,
    ) * 100);
    // Ky yield response (Wave 4 L1, FAO-56 Annex / FAO-33):
    // 1 − Ya/Ym = Ky × (1 − ETa/ETm) ⇒ yieldFactor = 1 − Ky × deficitRatio,
    // clamped 0..1. Monotonic in deficit (more deficit ⇒ ≤ yield).
    // stressScore keeps its own (unchanged) formula for the UI.
    const yieldFactor = clamp01(1 - ky * deficitRatio);
    const yieldPerHa = crop.yieldTonHa * yieldFactor;
    const yieldTonHa = round2(yieldPerHa * areaHa);

    perCrop.push({
      cropId: crop.id, name: crop.name, cells, areaHa: round2(areaHa),
      yieldTonHa, stressScore, waterDeficitMm: round1(effDeficit), stressDays,
    });
    totalAreaHa += areaHa;
    yieldPerHaSum += yieldPerHa * areaHa;
    demandSum += metMm * areaHa;
    stressSum += stressScore * areaHa;
    deficitAreaSum += effDeficit * areaHa;
    totalStressDays += stressDays;
    carbonAreaSum +=
      CARBON_RESIDUE_KGHA[crop.category] *
      (1 + CARBON_FERT_FACTOR * fertilizerBoost) *
      omCarbonFactor(soil?.organicMatterPct ?? null) *
      areaHa;
    profitAreaSum += (yieldPerHa * PRICE_USD_T[crop.category]
      - metMm * WATER_COST_USD_MM
      - FERT_COST_USD_PER_BOOST * fertilizerBoost) * areaHa;
  }

  const area = totalAreaHa > 0 ? totalAreaHa : 1;
  return {
    perCrop,
    totalAreaHa,
    totalStressDays,
    deficitMean: round1(deficitAreaSum / area),
    yieldTonHa: round2(yieldPerHaSum / area),
    waterUseMm: round1(demandSum / area),
    carbonKgHa: Math.round(carbonAreaSum / area),
    profitUsdHa: Math.round(profitAreaSum / area),
    stressScore: round1(stressSum / area),
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

// Stage-aware demand floor (Wave 4 L1): on low-ET0 days Kc × ET0 can dip
// near zero; keeping 60 % of the catalog waterNeedMmDay as the minimum
// demand keeps deficitRatio meaningful and legacy numbers in range.
const DEMAND_FLOOR_FRACTION = 0.6;

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
