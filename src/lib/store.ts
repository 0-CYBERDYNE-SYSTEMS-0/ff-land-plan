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
  SitePlan,
  Simulation,
} from '@/types';
import type { RunRecord } from '@/lib/sim/types';
import { legacyPlanForEnvironment, migrateEnvironmentStore, siteFromLegacyPlans } from '@/lib/environment-model';
import { ENV_RECORDS_ENABLED } from '@/lib/featureFlags';
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
  version?: 2;
  farms: Farm[];
  customCrops: Crop[];
  cells: FarmCell[]; // legacy voxel cells (Monitoring still reads them)
  sensors: Sensor[];
  readings: Record<number, SensorReading[]>;
  simulations: Simulation[];
  ndvi: Record<number, NdviEstimate>;
  plans: Record<number, PlanState>;
  sites: Record<number, SitePlan>;
  selectedEnvironmentIds: Record<number, string>;
  alertReads: Record<number, true>;
  /** Deterministic sim engine runs (SPEC-SIM-ECOSYSTEM). Each RunRecord holds
   * config + frozen envSeries + summary only — state is rebuilt by replay,
   * never stored per-tick. Not seeded, not re-seeded with demo content. */
  simRuns: RunRecord[];
  counters: { farm: number; crop: number; sensor: number; reading: number; sim: number };
}

function seedState(): AppState {
  const farms = seedFarms.map((f) => ({
    ...f,
    elevationM: null,
    ...estimateFrostDates(f.lat),
  }));
  const sites = ENV_RECORDS_ENABLED ? siteFromLegacyPlans(seedPlans) : {};
  const selectedEnvironmentIds = ENV_RECORDS_ENABLED
    ? Object.fromEntries(Object.entries(sites).map(([farmId, site]) => [farmId, site.environments[0]!.id]))
    : {};
  return {
    ...(ENV_RECORDS_ENABLED ? { version: 2 as const } : {}),
    farms,
    customCrops: [],
    cells: [...seedCells],
    sensors: [...seedSensors],
    readings: { ...seedReadings },
    simulations: [...seedSimulations],
    ndvi: { ...seedNdvi },
    plans: { ...seedPlans },
    sites,
    selectedEnvironmentIds,
    alertReads: {},
    simRuns: [],
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
    const rawParsed = JSON.parse(raw) as Partial<AppState>;
    const migrated = ENV_RECORDS_ENABLED
      ? migrateEnvironmentStore(rawParsed)
      : {
          ...rawParsed,
          sites: rawParsed.sites ?? {},
          selectedEnvironmentIds: rawParsed.selectedEnvironmentIds ?? {},
        };
    const parsed = { ...rawParsed, ...migrated } as AppState;
    // Forward-compat: merge over a fresh seed shape so missing keys get defaults.
    const merged = { ...fresh, ...parsed };

    // Demo farms (ids shipped in seedFarms) are SHOWCASE content: re-seed their
    // records and plans on every load so demos always render their intended
    // layout, and deleting/messing up one is fixed by a reload. User-created
    // farms and plans (ids above the seed range) always win untouched.
    const seedFarmIds = new Set(fresh.farms.map((f) => f.id));
    merged.farms = [
      ...fresh.farms,
      ...parsed.farms.filter((f) => !seedFarmIds.has(f.id)),
    ];
    // V2 site records are user work, including on demo farms: keep every
    // environment and its interior plan when the seeded farm shell refreshes.
    merged.sites = ENV_RECORDS_ENABLED
      ? { ...fresh.sites, ...parsed.sites }
      : parsed.sites ?? {};
    merged.selectedEnvironmentIds = ENV_RECORDS_ENABLED
      ? { ...fresh.selectedEnvironmentIds, ...parsed.selectedEnvironmentIds }
      : parsed.selectedEnvironmentIds ?? {};
    for (const key of Object.keys(fresh.plans)) {
      const farmId = Number(key);
      const storedSite = parsed.sites?.[farmId];
      const storedPlan = parsed.plans?.[farmId];
      if (ENV_RECORDS_ENABLED && storedSite?.environments.length === 1) {
        merged.plans[farmId] = legacyPlanForEnvironment(storedSite.environments[0]!);
      } else if (!ENV_RECORDS_ENABLED && storedSite?.environments.length === 1) {
        // A v2 blob opened with the flag off keeps its stored single-world
        // plan and old surface behavior through the legacy adapter.
        merged.plans[farmId] = legacyPlanForEnvironment(storedSite.environments[0]!);
      } else if (!ENV_RECORDS_ENABLED) {
        // Preserve the legacy demo re-seed contract while the feature is off.
        merged.plans[farmId] = storedPlan?.surface != null
          ? { ...fresh.plans[farmId]!, surface: storedPlan.surface }
          : fresh.plans[farmId]!;
      }
    }

    // Sim runs are additive user data (never seeded): keep the stored list
    // as-is; missing/corrupt key degrades to empty.
    merged.simRuns = parsed.simRuns ?? [];

    // Keep the farm-id counter ahead of every present farm so it can never
    // collide with the seed range or itself.
    const maxFarmId = merged.farms.reduce((m, f) => Math.max(m, f.id), 0);
    merged.counters.farm = Math.max(merged.counters.farm, maxFarmId + 1);
    return ENV_RECORDS_ENABLED ? { ...merged, version: 2 } : merged;
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
