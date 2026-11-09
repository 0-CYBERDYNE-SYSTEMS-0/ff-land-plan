/**
 * Primary-source lettuce parameter references for v2 integration work.
 *
 * These values are deliberately not selected as catalog defaults: the RUE
 * source is greenhouse cv. Rosalba, while the root profile is direct-seeded
 * Yuma iceberg/romaine. The separate domains are preserved for reviewers.
 */
export const lettuceRosalbaRUEReference = {
  value: 2.71,
  unit: 'g above-ground dry matter per MJ intercepted PAR',
  reported: '2.71 ± 0.030 g MJ⁻¹',
  evidenceId: 'LETTUCE-ROSALBA-GREENHOUSE-RUE-2003',
  sourceCitation: 'Beccafichi et al. (2003), Acta Horticulturae 614, 507–513, cv. Rosalba.',
  sourceUrl: 'https://doi.org/10.17660/ActaHortic.2003.614.75',
  validDomain: 'Greenhouse butterhead lettuce cv. Rosalba, Perugia, Italy; two seasons and 5–30 plants/m². Above-ground dry-matter RUE only.',
} as const;

export const lettuceYumaRootProfileReference = {
  methodVersion: 'thermal-linear-root-depth-v1',
  storageExpansionMethod: 'uniform-initial-awc-fraction-v1',
  startEvent: 'direct-sowing',
  initialRootDepthCm: 12,
  growthStartsAfterCdays: 200,
  growthMmPerCday: 1.2,
  thermalBaseC: 4.5,
  thermalUpperC: 28,
  thermalAccumulationMethod: 'Single sine with horizontal cutoff',
  maximumRootDepthCm: 90,
  depletionFractionAtEtc5MmDay: 0.4,
  evidenceId: 'LETTUCE-YUMA-ROOT-PROFILE-2024',
  sourceCitation: 'French et al. (2024), Irrigation Science 42, 1245–1272; root growth method after Thorup-Kristensen (2006).',
  sourceUrl: 'https://doi.org/10.1007/s00271-024-00921-x',
  validDomain: 'Direct-seeded Yuma field iceberg/romaine water-balance profile. The 90 cm cap is an inferred site-specific effective depth, not a generic or directly measured maximum; no transplant inference.',
} as const;
