import { afterEach, describe, expect, it, vi } from 'vitest';
import { freezeEnvironmentModelInputsV2 } from '@/lib/sim/model-inputs';
import type { DailyEnvironment, EnvironmentModelInputsV2, RunRecord } from '@/lib/sim/types';
import type { PlanState } from '@/types';
import { createRestApi } from './restApi';

const basePlan: PlanState = {
  farmId: 1,
  widthM: 1,
  heightM: 1,
  cellM: 0.5,
  allowOutsideBeds: false,
  ground: {},
  planting: {},
  updatedAt: '2026-10-27T00:00:00.000Z',
};

function environmentV2Record(): RunRecord {
  const environment = {
    id: 'env:1:greenhouse-rest-roundtrip',
    farmId: 1,
    archetype: 'greenhouse-glass' as const,
    label: 'Frozen greenhouse',
    x: 0,
    y: 0,
    widthM: 10,
    heightM: 10,
    cellM: 0.5,
  };
  const config = {
    farmId: 1,
    cropModelVersion: 'crop-model-v4' as const,
    climateModel: 'environment-v2' as const,
    environment,
    basePlan,
    modelInputs: {
      model: 'run-inputs-v4' as const,
      parameterSetVersion: 'crop-parameters-v5' as const,
      soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' as const },
      crops: [],
      cropParameters: [],
      establishmentByCell: {},
      qualification: { status: 'qualified' as const, reasons: [] },
    },
    startDate: '2026-10-27',
    dayCount: 2,
    seed: 1,
    scenario: 'baseline' as const,
    tempDeltaC: 0,
    precipMultiplier: 1,
    interventions: [],
  };
  const environmentModelInputs: EnvironmentModelInputsV2 = freezeEnvironmentModelInputsV2(config, {
    tMinC: 15,
    tMaxC: 20,
    rhPct: 60,
    co2Ppm: 420,
    etFactor: 1,
  })!;
  return {
    id: 'run:env2:rest-roundtrip',
    farmId: 1,
    label: 'Environment-v2 round-trip',
    createdAt: '2026-10-27T00:00:00.000Z',
    config: { ...config, environmentModelInputs },
    envSeries: solarEnvironmentSeries(),
    summary: {
      daysSimulated: 17,
      rainMm: 3.25,
      irrigatedMm: 1.5,
      etoMmTotal: 27.5,
      totalYieldKg: 42.125,
      yieldBasis: 'dry-matter',
      yieldKgByCrop: { '19': 42.125 },
      stressCellDays: 2,
      waterUseMm: 6.75,
      stressDays: { water: 1, heat: 2, cold: 3, nitrogen: 4 },
      outbreakDays: 1,
      meanNitrogenKgHa: 8.5,
      harvestReadyDay: 12,
      matureCells: 1,
      cellCount: 2,
      eventCounts: { harvested: 1 },
      modelQualification: { status: 'qualified', reasons: ['distinctive stored v2 summary'] },
    },
    status: 'complete',
  };
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function solarEnvironmentSeries(): DailyEnvironment[] {
  const base = {
    tMinC: 15,
    tMaxC: 20,
    precipMm: 0,
    etoMm: 0,
    gddBase10C: 7.5,
    provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
  } as const;
  return [
    {
      ...base,
      date: '2026-10-27',
      solarRadiationMJm2Day: 0,
      provenance: { ...base.provenance, solarRadiationMJm2Day: 'synthetic' },
    },
    {
      ...base,
      date: '2026-10-28',
      solarRadiationMJm2Day: null,
      provenance: { ...base.provenance, solarRadiationMJm2Day: 'synthetic' },
    },
  ];
}

afterEach(() => vi.unstubAllGlobals());

describe('REST sim-run API contract', () => {
  it('sends and returns environment-v2 frozen inputs and summary through PUT and list', async () => {
    const saved = environmentV2Record();
    const serverRecords = new Map<string, RunRecord>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (init?.method === 'PUT') {
        const record = JSON.parse(String(init.body)) as RunRecord;
        serverRecords.set(record.id, record);
        return new Response(JSON.stringify(record), { status: 200 });
      }
      if (url.endsWith('/farms/1/sim-runs')) {
        return new Response(JSON.stringify([...serverRecords.values()]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = createRestApi('https://example.test/api');

    const returned = await api.saveSimRun(saved);
    const listed = await api.listSimRuns(saved.farmId);
    const putBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as RunRecord;
    const jsonSaved = jsonCopy(saved);

    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://example.test/api/sim-runs/run%3Aenv2%3Arest-roundtrip');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PUT');
    expect(putBody.config.climateModel).toBe('environment-v2');
    expect(putBody.config.environmentModelInputs).toEqual(saved.config.environmentModelInputs);
    expect(putBody.summary).toEqual(saved.summary);
    expect(putBody.envSeries.map((day) => day.solarRadiationMJm2Day)).toEqual([0, null]);
    expect(returned).toEqual(jsonSaved);
    expect(listed).toEqual([jsonSaved]);
    expect(listed[0]?.config.environmentModelInputs).toEqual(jsonSaved.config.environmentModelInputs);
    expect(listed[0]?.summary).toEqual(jsonSaved.summary);
    expect(listed[0]?.envSeries.map((day) => day.solarRadiationMJm2Day)).toEqual([0, null]);
  });
});
