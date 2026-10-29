/**
 * Ohayou spring-control daily net dry matter from total solar radiation.
 * Source: https://www.jstage.jst.go.jp/article/hortj/92/1/92_QH-022/_html/-char/en
 * K = 1.09; RUE = 1.16 g DM per MJ intercepted total solar radiation.
 */
const OHAYOU_SPRING_CONTROL_K_SOLAR = 1.09;
const OHAYOU_SPRING_CONTROL_RUE_G_DM_PER_MJ_INTERCEPTED_SOLAR = 1.16;

export interface OhayouSpringControlDailyProductionInput {
  /** Total solar radiation (MJ/m²/day), not PAR or DLI. */
  solarRadiationMJm2Day: number | null | undefined;
  /** Leaf area index (m² leaf/m² ground). */
  leafAreaIndexM2PerM2: number | null | undefined;
  extinctionCoefficientK?: number;
  rueGPerMjInterceptedTotalSolar?: number;
  stressFactor?: number;
}

export type OhayouSpringControlDailyProductionResult =
  | {
    status: 'calculated';
    interceptedSolarRadiationMJPerM2Day: number;
    dryMatterGainGPerM2Day: number;
  }
  | { status: 'unavailable'; reason: string };

/**
 * Calculates daily dry matter gain in g DM/m²/day using the study's total
 * solar-radiation basis: RUE × solar radiation × (1 − exp(−K × LAI)).
 */
export function ohayouSpringControlDailyProduction(
  input: OhayouSpringControlDailyProductionInput,
): OhayouSpringControlDailyProductionResult {
  const solarRadiation = input.solarRadiationMJm2Day;
  if (solarRadiation === null || solarRadiation === undefined || !Number.isFinite(solarRadiation)) {
    return { status: 'unavailable', reason: 'Daily total solar radiation is missing or non-finite.' };
  }
  if (solarRadiation < 0) {
    return { status: 'unavailable', reason: 'Daily total solar radiation must be nonnegative.' };
  }

  const lai = input.leafAreaIndexM2PerM2;
  if (lai === null || lai === undefined || !Number.isFinite(lai)) {
    return { status: 'unavailable', reason: 'Leaf area index is missing or non-finite.' };
  }
  if (lai < 0) {
    return { status: 'unavailable', reason: 'Leaf area index must be nonnegative.' };
  }

  const extinctionCoefficientK = input.extinctionCoefficientK ?? OHAYOU_SPRING_CONTROL_K_SOLAR;
  const rueGPerMjInterceptedTotalSolar = input.rueGPerMjInterceptedTotalSolar
    ?? OHAYOU_SPRING_CONTROL_RUE_G_DM_PER_MJ_INTERCEPTED_SOLAR;
  const stressFactor = input.stressFactor ?? 1;
  if (!Number.isFinite(extinctionCoefficientK) || extinctionCoefficientK < 0) {
    return { status: 'unavailable', reason: 'Total-solar extinction coefficient must be nonnegative and finite.' };
  }
  if (!Number.isFinite(rueGPerMjInterceptedTotalSolar) || rueGPerMjInterceptedTotalSolar < 0) {
    return { status: 'unavailable', reason: 'Total-solar RUE must be nonnegative and finite.' };
  }
  if (!Number.isFinite(stressFactor) || stressFactor < 0 || stressFactor > 1) {
    return { status: 'unavailable', reason: 'Production stress factor must be between zero and one.' };
  }

  const interceptedSolarRadiationMJPerM2Day = solarRadiation
    * (1 - Math.exp(-extinctionCoefficientK * lai));
  if (!Number.isFinite(interceptedSolarRadiationMJPerM2Day)) {
    return { status: 'unavailable', reason: 'Calculated intercepted solar radiation is non-finite.' };
  }
  const dryMatterGainGPerM2Day = rueGPerMjInterceptedTotalSolar
    * interceptedSolarRadiationMJPerM2Day * stressFactor;
  if (!Number.isFinite(dryMatterGainGPerM2Day)) {
    return { status: 'unavailable', reason: 'Calculated dry-matter gain is non-finite.' };
  }
  return {
    status: 'calculated',
    interceptedSolarRadiationMJPerM2Day,
    dryMatterGainGPerM2Day,
  };
}
