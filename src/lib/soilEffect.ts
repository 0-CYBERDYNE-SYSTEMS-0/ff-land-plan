// Pure soil→simulation effect functions (Wave-4 L2). Inputs mirror the
// nullable fields of `SoilProfile` in `src/lib/soil.ts`
// (`awcMmPerCm`, `ph`, `organicMatterPct`): absent data ⇒ identity behavior,
// never a penalty, never a throw. No Math.random, no side effects.

// Generic annual-vegetable effective root-zone depth (cm) assumed when no
// crop-specific rooting depth is supplied.
const DEFAULT_ROOTING_CM = 25;

// Plant-available water capacity relief: a water deficit is relieved by the
// plant-available water held in the root zone. Returns the amount RELIEVED
// (not the new deficit): min(deficit, buffer). Null AWC ⇒ 0 (no relief).
export function awcBufferMm(deficitMm: number, awcMmPerCm: number | null, rootingCm?: number): number {
  if (awcMmPerCm === null) return 0;
  const buffer = awcMmPerCm * (rootingCm ?? DEFAULT_ROOTING_CM);
  return Math.min(deficitMm, buffer);
}

// Nutrient availability vs pH. Extension-service guidance (e.g. most US
// land-grant charts) puts near-full N-P-K availability roughly pH 6.0–7.0,
// declining toward acid (≈4.5) and alkaline (≈9.0) extremes. 1.0 across
// 6.0–7.0; linear falloff to 0.6 at 4.5 and at 9.0; clamped at 0.6 outside.
export function phNutrientFactor(ph: number | null): number {
  if (ph === null) return 1;
  const BEST_LO = 6.0;
  const BEST_HI = 7.0;
  const EDGE_LO = 4.5;
  const EDGE_HI = 9.0;
  const EDGE = 0.6;
  if (ph >= BEST_LO && ph <= BEST_HI) return 1;
  if (ph < BEST_LO) {
    const t = Math.max(0, (ph - EDGE_LO) / (BEST_LO - EDGE_LO));
    return EDGE + (1 - EDGE) * t;
  }
  const t = Math.max(0, (EDGE_HI - ph) / (EDGE_HI - BEST_HI));
  return EDGE + (1 - EDGE) * t;
}

// Carbon/nitrogen supply vs organic matter. Higher OM ⇒ more soil carbon and
// mineralizable N (directionally supported by extension agronomy), so yield
// scales ±0.05 per percentage point away from a 2 % baseline, clamped to
// [0.8, 1.3].
export function omCarbonFactor(omPct: number | null): number {
  if (omPct === null) return 1;
  const BASE = 2;
  const PER_POINT = 0.05;
  const MIN = 0.8;
  const MAX = 1.3;
  return Math.min(MAX, Math.max(MIN, 1 + (omPct - BASE) * PER_POINT));
}
