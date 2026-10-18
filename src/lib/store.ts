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
import type { RunRecord } from '@/lib/sim/types';
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
const DEMO_SEEDS_VERSION = 1;

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
  /** Deterministic sim engine runs (SPEC-SIM-ECOSYSTEM). Each RunRecord holds
   * config + frozen envSeries + summary only — state is rebuilt by replay,
   * never stored per-tick. Not seeded, not re-seeded with demo content. */
  simRuns: RunRecord[];
  /** Version of the one-time demo farm/plan seed migration applied to this store. */
  demoSeedsVersion: number;
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
    simRuns: [],
    demoSeedsVersion: DEMO_SEEDS_VERSION,
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

    // Seed demo farms/plans only when initializing this version of the store.
    // Existing records always win, including demo farms/plans edited by users;
    // later launches must not restore a deleted demo or overwrite its changes.
    const storedFarms = Array.isArray(parsed.farms) ? parsed.farms : fresh.farms;
    const storedPlans =
      typeof parsed.plans === 'object' && parsed.plans !== null ? parsed.plans : fresh.plans;
    const seedFarmIds = new Set(fresh.farms.map((f) => f.id));
    const storedFarmById = new Map(storedFarms.map((farm) => [farm.id, farm]));
    if ((parsed.demoSeedsVersion ?? 0) < DEMO_SEEDS_VERSION) {
      merged.farms = [
        ...fresh.farms.map((farm) => storedFarmById.get(farm.id) ?? farm),
        ...storedFarms.filter((farm) => !seedFarmIds.has(farm.id)),
      ];
      merged.plans = { ...fresh.plans, ...storedPlans };
      merged.demoSeedsVersion = DEMO_SEEDS_VERSION;
    } else {
      merged.farms = storedFarms;
      merged.plans = storedPlans;
    }

    // Sim runs are additive user data (never seeded): keep the stored list
    // as-is; missing/corrupt key degrades to empty.
    merged.simRuns = parsed.simRuns ?? [];

    // Keep the farm-id counter ahead of every present farm so it can never
    // collide with the seed range or itself.
    const maxFarmId = merged.farms.reduce((m, f) => Math.max(m, f.id), 0);
    merged.counters.farm = Math.max(merged.counters.farm, maxFarmId + 1);
    return merged;
  } catch (err) {
    // Quarantine the corrupt blob (best-effort) so the data survives for
    // inspection instead of being silently overwritten by the reseed.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) localStorage.setItem(`${STORAGE_KEY}:corrupt`, raw);
    } catch {
      /* quarantine is best-effort; the reset below proceeds regardless */
    }
    console.error('FarmFriend: stored data was corrupt — quarantined and reset.', err);
    return fresh;
  }
}

export const state: AppState = load();

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let warnedQuota = false;
let dirty = false;

function flush(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!dirty) return; // nothing changed since the last committed write
  try {
    // ONE atomic setItem of ONE snapshot key — never clear+write or split
    // across keys: a partially-applied commit is how storage ends up
    // re-seeding over user data (dogfood CRIT-001 evidence).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    dirty = false;
  } catch (err) {
    // Leave `dirty` set: a transient quota failure (e.g. a same-origin tab
    // momentarily filling storage) gets retried on the next flush.
    if (!warnedQuota) {
      warnedQuota = true;
      console.warn('FarmFriend: localStorage write failed; changes are in-memory only.', err);
    }
  }
}

export function persist(): void {
  dirty = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 500);
}

export function persistNow(): void {
  flush();
}

// Flush pending writes when the tab is hidden or closing. pagehide/beforeunload
// cover actual document unloads, which visibilitychange alone misses.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow);
  window.addEventListener('beforeunload', persistNow);
}
