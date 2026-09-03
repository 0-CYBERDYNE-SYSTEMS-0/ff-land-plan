// Persistent app store. All user data lives in one localStorage blob
// (`ff-pro:v1`), loaded synchronously at boot and written debounced. Plans are
// sparse maps, so even max-size plots serialize small. Quota errors degrade to
// in-memory with a console warning instead of crashing autosave.

import type {
  Crop,
  Farm,
  FarmCell,
  NdviEstimate,
  PlanState,
  Sensor,
  SensorReading,
  Simulation,
} from '@/types';
import {
  seedCells,
  seedFarms,
  seedNdvi,
  seedPlans,
  seedReadings,
  seedSensors,
  seedSimulations,
} from '@/data/seed';
import { estimateFrostDates } from '@/lib/frost';

const STORAGE_KEY = 'ff-pro:v1';

export interface AppState {
  farms: Farm[];
  customCrops: Crop[];
  cells: FarmCell[]; // legacy voxel cells (Monitoring still reads them)
  sensors: Sensor[];
  readings: Record<number, SensorReading[]>;
  simulations: Simulation[];
  ndvi: Record<number, NdviEstimate>;
  plans: Record<number, PlanState>;
  alertReads: Record<number, true>;
  counters: { farm: number; crop: number; sensor: number; reading: number; sim: number };
}

function seedState(): AppState {
  const farms = seedFarms.map((f) => ({
    ...f,
    elevationM: null,
    ...estimateFrostDates(f.lat),
  }));
  return {
    farms,
    customCrops: [],
    cells: [...seedCells],
    sensors: [...seedSensors],
    readings: { ...seedReadings },
    simulations: [...seedSimulations],
    ndvi: { ...seedNdvi },
    plans: { ...seedPlans },
    alertReads: {},
    counters: {
      farm: farms.length + 1,
      crop: 1000, // custom crops start above the static library range
      sensor: seedSensors.length + 1,
      reading: 100,
      sim: seedSimulations.length + 1,
    },
  };
}

function load(): AppState {
  const fresh = seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as AppState;
    // Forward-compat: merge over a fresh seed shape so missing keys get defaults.
    const merged = { ...fresh, ...parsed };
    // Idempotently re-seed farms/plans this version adds but a saved blob lacks,
    // WITHOUT clobbering user edits to farms/plans that already exist.
    for (const farm of fresh.farms) {
      if (!merged.farms.some((f) => f.id === farm.id)) merged.farms.push(farm);
    }
    for (const [key, plan] of Object.entries(fresh.plans)) {
      const id = Number(key);
      if (!(id in merged.plans)) merged.plans[id] = plan;
    }
    // Keep the farm-id counter ahead of every present farm so newly-added seed
    // farms can never collide with future user-created farms.
    const maxFarmId = merged.farms.reduce((m, f) => Math.max(m, f.id), 0);
    merged.counters.farm = Math.max(merged.counters.farm, maxFarmId + 1);
    return merged;
  } catch {
    return fresh;
  }
}

export const state: AppState = load();

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let warnedQuota = false;

export function persist(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      if (!warnedQuota) {
        warnedQuota = true;
        console.warn('FarmFriend: localStorage write failed; changes are in-memory only.', err);
      }
    }
  }, 500);
}

export function persistNow(): void {
  if (writeTimer) clearTimeout(writeTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* see persist() */
  }
}

// Flush pending writes when the tab is hidden or closing.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
}
