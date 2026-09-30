// Literature-backed thermal targets for representative catalog crops.
// Reference data only: the sim does not consume this table yet.
// GDD totals are Celsius degree-days. OSU Extension Fahrenheit degree-day
// totals are converted with ×5/9; source-specific methods and endpoints are
// retained because the totals are not interchangeable across models.

export interface CropThermalParam {
  readonly cropId: number;
  readonly cropSlug: string;
  /** Lower development threshold (°C). */
  readonly tBaseC: number;
  /** Upper threshold (°C), when specified by the source model. */
  readonly tUpperC?: number;
  /** Source cultivar range [minimum, maximum] in °C·days; points repeat. */
  readonly gddToMaturityCdays: readonly [minimum: number, maximum: number];
  readonly accumulationStart: string;
  readonly maturityEndpoint: string;
  readonly accumulationMethod: string;
  readonly sourceCitation: string;
  readonly sourceUrl: string;
}

const OSU_CROPTIME =
  'https://extension.oregonstate.edu/catalog/em-9305-vegetable-degree-day-models-introduction-farmers-gardeners';

export const cropThermalParams = [
  {
    cropId: 1,
    cropSlug: 'tomato',
    tBaseC: 7.2,
    tUpperC: 33.3,
    gddToMaturityCdays: [1024, 1117],
    accumulationStart: 'Transplanting at 3–5 true leaves',
    maturityEndpoint: 'First ripe harvest (four or more fruits show ripe color)',
    accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 6',
    sourceCitation:
      'Andrews et al., OSU Extension EM 9305, Tomato degree-days, Table 6 (four cultivars; 1844–2010 °F·days).',
    sourceUrl: OSU_CROPTIME,
  },
  {
    cropId: 2,
    cropSlug: 'lettuce',
    tBaseC: 4,
    gddToMaturityCdays: [662, 731],
    accumulationStart: 'Transplanting',
    maturityEndpoint: 'Harvest',
    accumulationMethod: 'Study thermal-time accumulation; base 4 °C',
    sourceCitation:
      'Michelon et al. (2020), “Strategies for Improved Water Use Efficiency (WUE) of Field-Grown Lettuce,” Agronomy 10(5), 668.',
    sourceUrl: 'https://doi.org/10.3390/agronomy10050668',
  },
  {
    cropId: 6,
    cropSlug: 'pepper',
    tBaseC: 11.1,
    tUpperC: 37.8,
    gddToMaturityCdays: [934, 1110],
    accumulationStart: 'Transplanting at 4–7 true leaves',
    maturityEndpoint: 'First ripe harvest (four or more fruits show ripe color)',
    accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 5',
    sourceCitation:
      'Andrews et al., OSU Extension EM 9305, Sweet pepper degree-days, Table 5 (four cultivars; 1682–1998 °F·days).',
    sourceUrl: OSU_CROPTIME,
  },
  {
    cropId: 19,
    cropSlug: 'broccoli',
    tBaseC: 0,
    tUpperC: 21.1,
    gddToMaturityCdays: [1168, 1324],
    accumulationStart: 'Transplanting at 2–4 true leaves',
    maturityEndpoint: 'First harvest at approximately 6-inch head diameter',
    accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 1',
    sourceCitation:
      'Andrews et al., OSU Extension EM 9305, Broccoli degree-days, Table 1 (four cultivars; 2103–2383 °F·days).',
    sourceUrl: OSU_CROPTIME,
  },
  {
    cropId: 20,
    cropSlug: 'cabbage',
    tBaseC: 10,
    gddToMaturityCdays: [1000, 1050],
    accumulationStart: 'Field establishment (direct seeded or transplanted)',
    maturityEndpoint: 'Storage-cabbage market maturity (head density 0.72–0.80)',
    accumulationMethod: 'Study heat-unit accumulation; base 10 °C',
    sourceCitation:
      'Isenberg et al. (1975), “The Use of Weight, Density, Heat Units, and Solar Radiation to Predict the Maturity of Cabbage for Storage,” Journal of the American Society for Horticultural Science 100(3), 313–316.',
    sourceUrl: 'https://doi.org/10.21273/JASHS.100.3.313',
  },
  {
    cropId: 22,
    cropSlug: 'cucumber',
    tBaseC: 10,
    tUpperC: 32.2,
    gddToMaturityCdays: [447, 673],
    accumulationStart: 'Direct seeding or transplanting at 2 true leaves',
    maturityEndpoint: 'First harvest at market size',
    accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 2',
    sourceCitation:
      'Andrews et al., OSU Extension EM 9305, Cucumber degree-days, Table 2 (direct-seeded and transplanted cultivars; 805–1211 °F·days).',
    sourceUrl: OSU_CROPTIME,
  },
  {
    cropId: 26,
    cropSlug: 'corn',
    tBaseC: 10,
    tUpperC: 30,
    gddToMaturityCdays: [855, 855],
    accumulationStart: 'Planting',
    maturityEndpoint: 'Mature for fresh market',
    accumulationMethod: 'Max–min (source recommendation: single sine); horizontal cutoff',
    sourceCitation:
      'Coop, Croft & Drapek (1993), sweet corn field model, reported by UC IPM; mature fresh market = 855 °C·days.',
    sourceUrl: 'https://ipm.ucanr.edu/weather/phenology-models-description/sweet-corn/',
  },
  {
    cropId: 27,
    cropSlug: 'bush-bean',
    tBaseC: 4.4,
    tUpperC: 32.2,
    gddToMaturityCdays: [906, 1003],
    accumulationStart: 'Direct seeding',
    maturityEndpoint: 'Snap-bean harvest at 3.5–4 inches',
    accumulationMethod: 'Single sine with horizontal cutoff; OSU Table 3',
    sourceCitation:
      'Andrews et al., OSU Extension EM 9305, Snap bean degree-days, Table 3 (three cultivars; 1630–1805 °F·days).',
    sourceUrl: OSU_CROPTIME,
  },
  {
    cropId: 29,
    cropSlug: 'pea',
    tBaseC: 2.9,
    gddToMaturityCdays: [1370, 1450],
    accumulationStart: 'Sowing',
    maturityEndpoint: 'Green-pea maturity at tenderometer reading 130',
    accumulationMethod: 'Study thermal-time accumulation; base 2.9 °C',
    sourceCitation:
      '“Thermal time requirements for the development of green pea (Pisum sativum L.)” (1998), Field Crops Research 56(3), 301–307.',
    sourceUrl: 'https://doi.org/10.1016/S0378-4290(97)00097-X',
  },
] as const satisfies readonly CropThermalParam[];
