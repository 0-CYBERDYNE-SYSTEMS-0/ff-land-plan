import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FarmCalibration } from '@/lib/sim/types';
import type { ObservationInput } from '@/types';
import { createRestApi } from './restApi';

afterEach(() => vi.unstubAllGlobals());

describe('REST twin API contract', () => {
  it('filters observation reads by world and posts mapped observations to /observations', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const path = String(input);
      const body = path.includes('/observations?')
        ? [{ id: 'obs:1', farmId: 4, environmentId: 'env:4:2', metric: 'airTempC', value: 18, unit: '°C', date: '2026-10-24', source: 'csv' }]
        : { id: 'obs:new', farmId: 4, environmentId: 'env:4:2', metric: 'airTempC', value: 18, unit: '°C', date: '2026-10-24', source: 'csv' };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = createRestApi('https://example.test/api');
    const input: ObservationInput = {
      farmId: 4,
      environmentId: 'env:4:2',
      metric: 'airTempC',
      value: 18,
      unit: '°C',
      date: '2026-10-24',
      source: 'csv',
    };

    await expect(api.listObservations(4, input.environmentId)).resolves.toHaveLength(1);
    await expect(api.addObservation(input)).resolves.toMatchObject({ id: 'obs:new' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://example.test/api/farms/4/observations?environmentId=env%3A4%3A2');
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://example.test/api/observations');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual(input);
  });

  it('patches sensor world associations and persists approved calibration revisions', async () => {
    const calibration: FarmCalibration = {
      version: 'farm-calibration-v1',
      revision: 2,
      farmId: 4,
      environmentId: 'env:4:2',
      fittedAt: '2026-10-24T12:00:00.000Z',
      pairedDays: 14,
      parameters: { coverTransmission: 0.78 },
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Response(JSON.stringify(calibration), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createRestApi('https://example.test/api');

    await api.updateSensor(13, { environmentId: 'env:4:2' });
    await expect(api.saveFarmCalibration(calibration)).resolves.toEqual(calibration);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://example.test/api/sensors/13');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://example.test/api/calibrations/env%3A4%3A2');
    expect(fetchMock.mock.calls[1]![1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual(calibration);
  });

  it('patches observation values and associations', async () => {
    const observation = {
      id: 'obs:1',
      farmId: 4,
      metric: 'airTempC',
      value: 19,
      unit: '°C',
      date: '2026-10-25',
      source: 'manual',
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Response(JSON.stringify(observation), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = createRestApi('https://example.test/api');
    const patch = { value: 19, date: '2026-10-25', environmentId: null };

    await expect(api.updateObservation('obs:1', patch)).resolves.toEqual(observation);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://example.test/api/observations/obs%3A1');
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PATCH');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual(patch);
  });
});
