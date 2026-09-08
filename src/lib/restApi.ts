// Reference REST client for the `Api` seam, mirroring the logical endpoint
// table in README.md ("Data" section). Selected via VITE_API_BASE_URL in
// src/lib/api.ts; when unset, the app stays local-first on localApi.
//
// Honesty note: this client is type-conformance-verified against `Api` at
// compile time only — it ships unexercised against a live server. Endpoint
// shapes follow the README contract; assumptions are called out inline where
// the table left room for interpretation.
//
// Dependency-free: plain fetch, JSON in/out. Non-ok responses throw
// `new Error("<status>: <body text>")` (body best-effort). `baseUrl` should
// include any API prefix, e.g. `http://localhost:8787/api`.

import type {
  Alert,
  Crop,
  Farm,
  FarmCell,
  ForecastDay,
  NdviEstimate,
  PlanState,
  Sensor,
  SensorReading,
  Simulation,
  Weather,
  WeatherHistoryPoint,
} from '@/types';
import type { Api } from '@/lib/localApi';
import type { RunRecord } from '@/lib/sim/types';

export function createRestApi(baseUrl: string): Api {
  const base = baseUrl.replace(/\/+$/, '');

  async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${base}${path}`, { ...init, headers });
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await requestRaw(path, init);
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // body text is best-effort for error reporting only
    }
    if (!res.ok) throw new Error(`${res.status}: ${bodyText}`);
    if (!bodyText.trim()) return undefined as T; // e.g. 204 No Content
    try {
      return JSON.parse(bodyText) as T;
    } catch {
      throw new Error(`Invalid JSON from ${path}: ${bodyText.slice(0, 200)}`);
    }
  }

  // Local defaults mirror localApi (history 24h, readings 20) so parity holds
  // even if a caller omits the limit.
  function limitQuery(limit: number | undefined, fallback: number): string {
    return `?limit=${limit ?? fallback}`;
  }

  return {
    // Farms -------------------------------------------------------------------
    listFarms: () => request<Farm[]>('/farms'),
    getFarm: (id) => request<Farm>(`/farms/${id}`),
    createFarm: (input) =>
      request<Farm>('/farms', { method: 'POST', body: JSON.stringify(input) }),
    updateFarm: (id, patch) =>
      request<Farm>(`/farms/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteFarm: async (id) => {
      await request<void>(`/farms/${id}`, { method: 'DELETE' });
    },

    // Weather -----------------------------------------------------------------
    getWeather: (farmId) => request<Weather>(`/farms/${farmId}/weather`),
    getForecast: (farmId) => request<ForecastDay[]>(`/farms/${farmId}/forecast`),
    getWeatherHistory: (farmId, limit) =>
      request<WeatherHistoryPoint[]>(
        `/farms/${farmId}/weather/history${limitQuery(limit, 24)}`,
      ),

    // Alerts ------------------------------------------------------------------
    listAlerts: (farmId) => request<Alert[]>(`/farms/${farmId}/alerts`),
    markAlertRead: (id) =>
      request<Alert>(`/alerts/${id}/read`, { method: 'PATCH' }),
    markAllAlertsRead: (farmId) =>
      request<{ updated: number }>(`/farms/${farmId}/alerts/read-all`, {
        method: 'POST',
      }),

    // Sensors + readings ------------------------------------------------------
    listSensors: (farmId) => request<Sensor[]>(`/farms/${farmId}/sensors`),
    createSensor: (farmId, input) =>
      request<Sensor>(`/farms/${farmId}/sensors`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    deleteSensor: async (id) => {
      await request<void>(`/sensors/${id}`, { method: 'DELETE' });
    },
    listReadings: (sensorId, limit) =>
      request<SensorReading[]>(`/sensors/${sensorId}/readings${limitQuery(limit, 20)}`),
    addReading: (sensorId, value, unit) =>
      request<SensorReading>(`/sensors/${sensorId}/readings`, {
        method: 'POST',
        body: JSON.stringify({ value, unit }),
      }),

    // Legacy voxel cells / NDVI -------------------------------------------------
    listCells: (farmId) => request<FarmCell[]>(`/farms/${farmId}/cells`),
    setCellCrop: (farmId, cellId, cropId) =>
      // Assumption: the README endpoint table defines only GET/POST on
      // `/farms/:id/cells`, so the crop assignment posts to that collection
      // with the cell id in the body (`{ id, cropId }`) — POST-with-existing-id
      // acts as an upsert of the cell's crop. A dedicated PATCH route would be
      // more RESTful but would invent an undocumented endpoint.
      request<FarmCell>(`/farms/${farmId}/cells`, {
        method: 'POST',
        body: JSON.stringify({ id: cellId, cropId }),
      }),
    getNdvi: (farmId) => request<NdviEstimate>(`/farms/${farmId}/ndvi-estimate`),

    // Plot plans ----------------------------------------------------------------
    getPlan: (farmId) =>
      request<PlanState | null>(`/farms/${farmId}/plan`).catch((err: unknown) => {
        // No plan yet is a normal state (the interface allows null), so map a
        // 404 from our own error format to null instead of surfacing an error.
        if (err instanceof Error && err.message.startsWith('404:')) return null;
        throw err;
      }),
    savePlan: (plan) =>
      request<PlanState>(`/farms/${plan.farmId}/plan`, {
        method: 'POST',
        body: JSON.stringify(plan),
      }),

    // Simulations (legacy records only — creation was deleted with the
    // farm-blind slider arithmetic; the run manager owns new simulations) ---
    listSimulations: (farmId) => request<Simulation[]>(`/farms/${farmId}/simulations`),
    deleteSimulation: async (id) => {
      await request<void>(`/simulations/${id}`, { method: 'DELETE' });
    },

    // Sim runs (deterministic engine runs — README contract) --------------------
    listSimRuns: (farmId) => request<RunRecord[]>(`/farms/${farmId}/sim-runs`),
    createSimRun: (input) =>
      request<RunRecord>(`/farms/${input.farmId}/sim-runs`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    deleteSimRun: async (id) => {
      await request<void>(`/sim-runs/${id}`, { method: 'DELETE' });
    },

    // Crops ---------------------------------------------------------------------
    listCrops: () => request<Crop[]>('/crops'),
    createCrop: (input) =>
      request<Crop>('/crops', { method: 'POST', body: JSON.stringify(input) }),
  };
}
