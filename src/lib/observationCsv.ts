import type { Observation, ObservationMetric } from '@/types';

export interface ParsedObservationCsv {
  headers: string[];
  rows: string[][];
}

export interface ObservationCsvMetricColumn {
  column: number;
  metric: ObservationMetric;
  unit: string;
}

export interface ObservationCsvMapping {
  dateColumn: number;
  timeColumn?: number;
  environmentId?: string;
  metricColumns: ObservationCsvMetricColumn[];
}

export interface ObservationCsvResult {
  observations: Omit<Observation, 'id'>[];
  errors: string[];
  skippedValues: number;
}

const METRIC_LABELS: Record<ObservationMetric, string> = {
  airTempC: 'Air temperature',
  rhPct: 'Relative humidity',
  vpdKPa: 'VPD',
  co2Ppm: 'CO₂',
  dliMol: 'DLI',
  soilMoistureFrac: 'Soil moisture',
  soilTempC: 'Soil temperature',
  yieldKg: 'Yield',
  stage: 'Stage / biomass fraction',
};

export const OBSERVATION_METRICS = Object.keys(METRIC_LABELS) as ObservationMetric[];

export function observationMetricLabel(metric: ObservationMetric): string {
  return METRIC_LABELS[metric];
}

export function observationUnits(metric: ObservationMetric): string[] {
  switch (metric) {
    case 'airTempC':
    case 'soilTempC': return ['°C', '°F'];
    case 'rhPct': return ['%', 'fraction'];
    case 'vpdKPa': return ['kPa', 'hPa', 'Pa'];
    case 'co2Ppm': return ['ppm'];
    case 'dliMol': return ['mol/m²/day'];
    case 'soilMoistureFrac':
    case 'stage': return ['fraction', '%'];
    case 'yieldKg': return ['kg', 'g', 'tonne'];
  }
}

function splitCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n' && char !== ' ' && char !== '\t') {
      throw new Error(`Unexpected text after a quoted CSV value near character ${index + 1}.`);
    }
    if (char === '"') {
      if (field.trim() !== '' || afterQuote) throw new Error(`Unexpected quote near character ${index + 1}.`);
      field = '';
      inQuotes = true;
    } else if (char === ',') {
      finishField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      finishRow();
    } else if (!afterQuote) {
      field += char;
    }
  }

  if (inQuotes) throw new Error('The CSV ends inside a quoted value.');
  if (field !== '' || row.length > 0 || afterQuote) finishRow();
  return rows;
}

/** Parse a wide, header-first CSV while honoring RFC 4180 quoted cells and line breaks. */
export function parseObservationCsv(text: string): ParsedObservationCsv {
  const rows = splitCsv(text);
  if (rows.length === 0) throw new Error('The CSV has no header row.');
  const headers = rows[0]!.map((value) => value.trim());
  if (headers.length === 0 || headers.every((header) => header === '')) throw new Error('The CSV header row is empty.');

  const dataRows = rows.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length) throw new Error(`CSV row ${rowIndex + 2} has more cells than the header row.`);
    return [...values, ...Array.from({ length: headers.length - values.length }, () => '')];
  });
  return { headers, rows: dataRows };
}

function normalizedHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function guessObservationMetric(header: string): ObservationMetric | null {
  const value = normalizedHeader(header);
  if (/soil.*(moisture|water)|moisture.*soil/.test(value)) return 'soilMoistureFrac';
  if (/vpd|vapor pressure deficit|vapour pressure deficit/.test(value)) return 'vpdKPa';
  if (/\bco2\b|carbon dioxide/.test(value)) return 'co2Ppm';
  if (/\bdli\b|daily light integral/.test(value)) return 'dliMol';
  if (/soil.*(temp|temperature)|ground.*(temp|temperature)/.test(value)) return 'soilTempC';
  if (/\b(rh|humidity)\b|relative humidity/.test(value)) return 'rhPct';
  if (/\b(yield|harvest weight)\b/.test(value)) return 'yieldKg';
  if (/\b(stage|biomass fraction|growth fraction)\b/.test(value)) return 'stage';
  if (/\b(temp|temperature)\b/.test(value)) return 'airTempC';
  return null;
}

export function guessObservationUnit(header: string, metric: ObservationMetric): string {
  if (/°\s*f\b|\bfahrenheit\b/i.test(header)) return metric === 'airTempC' || metric === 'soilTempC' ? '°F' : observationUnits(metric)[0]!;
  if (/\b(?:hpa|mbar)\b/i.test(header)) return metric === 'vpdKPa' ? 'hPa' : observationUnits(metric)[0]!;
  if (/\bpa\b/i.test(header) && metric === 'vpdKPa') return 'Pa';
  if (/\b(?:grams?|g)\b/i.test(header) && metric === 'yieldKg') return 'g';
  if (/\btonnes?\b/i.test(header) && metric === 'yieldKg') return 'tonne';
  if (/\b(?:fraction|0\s*[-–]\s*1)\b/i.test(header) && (metric === 'soilMoistureFrac' || metric === 'stage' || metric === 'rhPct')) return 'fraction';
  if (/%|percent/i.test(header) && (metric === 'soilMoistureFrac' || metric === 'stage' || metric === 'rhPct')) return metric === 'rhPct' ? '%' : '%';
  if (metric === 'soilMoistureFrac') return '%';
  return observationUnits(metric)[0]!;
}

function validIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseDate(value: string): { date: string; at?: string } | null {
  const raw = value.trim();
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ](.+))?$/.exec(raw);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (!validIsoDate(date)) return null;
    const timestamp = iso[4] ? `${date}T${iso[4]}` : '';
    const at = timestamp && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) && Number.isFinite(Date.parse(timestamp))
      ? new Date(timestamp).toISOString()
      : undefined;
    return { date, ...(at ? { at } : {}) };
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    if (first <= 12 && second <= 12) return null;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    const date = `${slash[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return validIsoDate(date) ? { date } : null;
  }

  return null;
}

function combineTime(date: { date: string; at?: string }, rawTime: string): { date: string; at?: string } | null {
  const time = rawTime.trim();
  if (!time) return date;
  if (!/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(time)) return null;
  if (date.at || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time)) return date;
  const timestamp = `${date.date}T${time}`;
  return Number.isFinite(Date.parse(timestamp)) ? { date: date.date, at: new Date(timestamp).toISOString() } : null;
}

function parseNumber(value: string): number | null {
  const raw = value.trim().replace(/,(?=\d{3}(?:\D|$))/g, '');
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*[A-Za-z°%/·²_-]+)?$/.exec(raw);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function normalizeValue(value: number, metric: ObservationMetric, unit: string): { value: number; unit: string } | null {
  let normalized = value;
  let canonicalUnit: string;
  switch (metric) {
    case 'airTempC':
    case 'soilTempC':
      normalized = unit === '°F' ? (value - 32) * 5 / 9 : value;
      canonicalUnit = '°C';
      break;
    case 'rhPct':
      normalized = unit === 'fraction' ? value * 100 : value;
      canonicalUnit = '%';
      break;
    case 'vpdKPa':
      normalized = unit === 'Pa' ? value / 1000 : unit === 'hPa' ? value / 10 : value;
      canonicalUnit = 'kPa';
      break;
    case 'co2Ppm':
      canonicalUnit = 'ppm';
      break;
    case 'dliMol':
      canonicalUnit = 'mol/m²/day';
      break;
    case 'soilMoistureFrac':
    case 'stage':
      normalized = unit === '%' ? value / 100 : value;
      if (normalized < 0 || normalized > 1) return null;
      canonicalUnit = 'fraction';
      break;
    case 'yieldKg':
      normalized = unit === 'g' ? value / 1000 : unit === 'tonne' ? value * 1000 : value;
      canonicalUnit = 'kg';
      break;
  }
  if ((metric === 'rhPct' && (normalized < 0 || normalized > 100))
    || (metric === 'vpdKPa' && normalized < 0)
    || (metric === 'dliMol' && normalized < 0)
    || (metric === 'yieldKg' && normalized < 0)) return null;
  return { value: normalized, unit: canonicalUnit };
}

/** Convert mapped columns into canonical observations; invalid rows are reported, never guessed. */
export function mapObservationCsv(
  csv: ParsedObservationCsv,
  farmId: number,
  mapping: ObservationCsvMapping,
): ObservationCsvResult {
  if (!csv.headers[mapping.dateColumn]) throw new Error('Choose a date column.');
  if (mapping.metricColumns.length === 0) throw new Error('Map at least one measurement column.');
  const usedColumns = new Set<number>([mapping.dateColumn]);
  if (mapping.timeColumn !== undefined) {
    if (!csv.headers[mapping.timeColumn]) throw new Error('Choose a valid time column.');
    if (usedColumns.has(mapping.timeColumn)) throw new Error('Date and time columns must be different.');
    usedColumns.add(mapping.timeColumn);
  }
  for (const column of mapping.metricColumns) {
    if (!csv.headers[column.column]) throw new Error('A mapped measurement column is missing.');
    if (usedColumns.has(column.column)) throw new Error('The date column and measurement columns must be different.');
    usedColumns.add(column.column);
    if (!observationUnits(column.metric).includes(column.unit)) throw new Error(`Unsupported unit ${column.unit} for ${column.metric}.`);
  }

  const observations: Omit<Observation, 'id'>[] = [];
  const errors: string[] = [];
  let skippedValues = 0;
  csv.rows.forEach((row, rowIndex) => {
    const parsedDate = parseDate(row[mapping.dateColumn] ?? '');
    const date = parsedDate && mapping.timeColumn !== undefined
      ? combineTime(parsedDate, row[mapping.timeColumn] ?? '')
      : parsedDate;
    if (!date) {
      errors.push(`Row ${rowIndex + 2}: date is missing, invalid, or ambiguous; use YYYY-MM-DD or an unambiguous date.`);
      return;
    }
    for (const column of mapping.metricColumns) {
      const raw = row[column.column] ?? '';
      if (raw.trim() === '') {
        skippedValues += 1;
        continue;
      }
      const parsed = parseNumber(raw);
      const normalized = parsed === null ? null : normalizeValue(parsed, column.metric, column.unit);
      if (!normalized) {
        errors.push(`Row ${rowIndex + 2}, ${csv.headers[column.column]}: value is invalid for ${observationMetricLabel(column.metric)} (${column.unit}).`);
        continue;
      }
      observations.push({
        farmId,
        ...(mapping.environmentId ? { environmentId: mapping.environmentId } : {}),
        metric: column.metric,
        value: normalized.value,
        unit: normalized.unit,
        date: date.date,
        ...(date.at ? { at: date.at } : {}),
        source: 'csv',
      });
    }
  });
  return { observations, errors, skippedValues };
}
