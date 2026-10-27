import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const payload = {
  current: {
    time: '2026-06-01T12:00',
    temperature_2m: 21.5,
    apparent_temperature: 20,
    relative_humidity_2m: 62,
    wind_speed_10m: 8,
    precipitation: 0,
    cloud_cover: 35,
    weather_code: 2,
  },
  hourly: {
    time: ['2026-06-01T12:00'],
    temperature_2m: [21.5],
    relative_humidity_2m: [62],
    soil_temperature_0cm: [16],
    soil_moisture_0_to_1cm: [0.25],
    uv_index: [3],
  },
  daily: {
    time: Array.from({ length: 8 }, (_, i) => `2026-06-0${i + 1}`),
    temperature_2m_max: Array.from({ length: 8 }, (_, i) => 24 + i),
    temperature_2m_min: Array.from({ length: 8 }, (_, i) => 12 + i),
    precipitation_sum: Array.from({ length: 8 }, (_, i) => i),
    weather_code: Array.from({ length: 8 }, () => 2),
  },
};

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fetcher() {
  return (await import('./weather')).fetchFarmWeather;
}

describe('weather last-good cache', () => {
  it('serves the last good response after Open-Meteo rate-limits with 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const fetchFarmWeather = await fetcher();

    const fresh = await fetchFarmWeather(45.5231, -122.6765);
    const cached = await fetchFarmWeather(45.5231, -122.6765);

    expect(fresh.weather.cached).toBe(false);
    expect(cached.weather.cached).toBe(true);
    expect(cached.weather.current.tempC).toBe(21.5);
    expect(cached.forecast).toHaveLength(7);
    expect(storage.getItem('ff-pro:weather:45.52,-122.68')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the last good response after an offline network failure, but surfaces uncached failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    let fetchFarmWeather = await fetcher();

    await fetchFarmWeather(45.5231, -122.6765);
    const cached = await fetchFarmWeather(45.5231, -122.6765);
    expect(cached.weather.cached).toBe(true);

    vi.resetModules();
    const uncachedFetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', uncachedFetchMock);
    storage.clear();
    fetchFarmWeather = await fetcher();
    await expect(fetchFarmWeather(45.5231, -122.6765)).rejects.toThrow('Failed to fetch');
  });
});
