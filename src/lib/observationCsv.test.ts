import { describe, expect, it } from 'vitest';
import {
  guessObservationMetric,
  guessObservationUnit,
  mapObservationCsv,
  parseObservationCsv,
} from './observationCsv';

describe('wide observation CSV mapping', () => {
  it('parses quoted commas, escaped quotes, embedded newlines, BOM, and CRLF', () => {
    const parsed = parseObservationCsv('\uFEFFDate,Sensor,Outside Temp (°F),Note\r\n2026-06-01,Ecowitt,68,"west, side"\r\n2026-06-02,AC Infinity,69,"row says ""steady""\nand dry"');
    expect(parsed.headers).toEqual(['Date', 'Sensor', 'Outside Temp (°F)', 'Note']);
    expect(parsed.rows).toEqual([
      ['2026-06-01', 'Ecowitt', '68', 'west, side'],
      ['2026-06-02', 'AC Infinity', '69', 'row says "steady"\nand dry'],
    ]);
  });

  it('maps multiple wide columns to canonical values and keeps explicit sensor world scope', () => {
    const parsed = parseObservationCsv('Timestamp,Outdoor Temp (°F),RH %,Soil Moisture (%)\n2026-06-01T12:30:00-07:00,68,55,40');
    const temp = guessObservationMetric(parsed.headers[1]!);
    const humidity = guessObservationMetric(parsed.headers[2]!);
    const soil = guessObservationMetric(parsed.headers[3]!);
    expect(temp).toBe('airTempC');
    expect(humidity).toBe('rhPct');
    expect(soil).toBe('soilMoistureFrac');
    const result = mapObservationCsv(parsed, 3, {
      dateColumn: 0,
      environmentId: 'env:3:2',
      metricColumns: [
        { column: 1, metric: temp!, unit: guessObservationUnit(parsed.headers[1]!, temp!) },
        { column: 2, metric: humidity!, unit: guessObservationUnit(parsed.headers[2]!, humidity!) },
        { column: 3, metric: soil!, unit: guessObservationUnit(parsed.headers[3]!, soil!) },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.observations).toEqual([
      { farmId: 3, environmentId: 'env:3:2', metric: 'airTempC', value: 20, unit: '°C', date: '2026-06-01', at: '2026-06-01T19:30:00.000Z', source: 'csv' },
      { farmId: 3, environmentId: 'env:3:2', metric: 'rhPct', value: 55, unit: '%', date: '2026-06-01', at: '2026-06-01T19:30:00.000Z', source: 'csv' },
      { farmId: 3, environmentId: 'env:3:2', metric: 'soilMoistureFrac', value: 0.4, unit: 'fraction', date: '2026-06-01', at: '2026-06-01T19:30:00.000Z', source: 'csv' },
    ]);
  });

  it('rejects ambiguous dates, out-of-range fractions, and malformed CSV quotes', () => {
    const parsed = parseObservationCsv('Date,Stage (%)\n06/07/2026,50\n2026-06-08,105\n2026-06-09,50');
    const result = mapObservationCsv(parsed, 1, {
      dateColumn: 0,
      metricColumns: [{ column: 1, metric: 'stage', unit: '%' }],
    });
    expect(result.observations).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(() => parseObservationCsv('Date,Value\n2026-01-01,"unterminated')).toThrow('ends inside a quoted value');
  });

  it('accepts separate date and time columns while keeping timezone-free readings daily', () => {
    const parsed = parseObservationCsv('Date,Time,Temperature\n2026-06-01,12:30:00,20\n2026-06-02,12:30:00-07:00,21');
    const result = mapObservationCsv(parsed, 1, {
      dateColumn: 0,
      timeColumn: 1,
      metricColumns: [{ column: 2, metric: 'airTempC', unit: '°C' }],
    });
    expect(result.errors).toEqual([]);
    expect(result.observations.map(({ date, at }) => ({ date, at }))).toEqual([
      { date: '2026-06-01', at: undefined },
      { date: '2026-06-02', at: '2026-06-02T19:30:00.000Z' },
    ]);
  });
});
