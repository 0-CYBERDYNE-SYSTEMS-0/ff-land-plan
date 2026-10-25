import { describe, expect, it } from 'vitest';

import { archetypes, planningProfiles } from '@/creative/archetypes';
import { cropLibrary } from '@/data/crops';
import { environmentSnapshot, legacyPlanForEnvironment, makeEnvironment, migrateEnvironmentStore, normalizeEnvironment } from '@/lib/environment-model';
import { simulateRun } from '@/lib/sim/engine';
import type { DailyEnvironment, RunConfig } from '@/lib/sim/types';
import type { ArchetypeId, PlanState, PlanSurface } from '@/types';

function legacyPlan(surface: PlanSurface | string = 'greenhouse'): PlanState {
  return {
    farmId: 1,
    widthM: 4,
    heightM: 4,
    cellM: 0.25,
    allowOutsideBeds: true,
    surface: surface as PlanSurface,
    planting: { '0,0': cropLibrary.find((crop) => crop.name === 'Tomato')!.id },
    ground: { '1,1': 'raised-bed' },
    plantedAt: { '0,0': '2026-04-01' },
    updatedAt: '2026-04-01T00:00:00.000Z',
  };
}

function syntheticWeather(): DailyEnvironment[] {
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 3, 1 + index)).toISOString().slice(0, 10);
    return {
      date,
      tMinC: 11,
      tMaxC: 23,
      precipMm: 1.5,
      etoMm: 2.4,
      gddBase10C: 7,
      provenance: { tMinC: 'default', tMaxC: 'default', precipMm: 'default', etoMm: 'default' },
    };
  });
}

describe('growing-world model', () => {
  it('migrates a legacy surface into exactly one stable environment and is idempotent', () => {
    const legacy = legacyPlan('hoophouse');
    const migrated = migrateEnvironmentStore({ plans: { 1: legacy } });
    const environment = migrated.sites[1]!.environments[0]!;

    expect(migrated.version).toBe(2);
    expect(environment.id).toBe('env:1:1');
    expect(environment.archetype).toBe('hoophouse');
    expect(environment.plan.surface).toBeUndefined();
    expect(environment.plan.planting).toEqual(legacy.planting);
    expect(migrated.selectedEnvironmentIds[1]).toBe(environment.id);
    expect(migrateEnvironmentStore(migrated)).toEqual(migrated);
  });

  it('maps unknown legacy surfaces to an open field without replacing a saved site', () => {
    const savedSite = {
      farmId: 1,
      widthM: 10,
      heightM: 8,
      cellM: 0.25,
      environments: [makeEnvironment(1, { archetype: 'container-farm' }, 'env:1:keep')],
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    const migrated = migrateEnvironmentStore({
      plans: { 1: legacyPlan('future-surface') },
      sites: { 1: savedSite },
    });

    expect(migrated.sites[1]!.environments[0]!.id).toBe('env:1:keep');
    expect(migrated.sites[1]!.environments[0]!.archetype).toBe('container-farm');
    expect(migratedEnvironment('future-surface')).toBe('open-field');
    for (const malformed of ['__proto__', 'constructor', 'toString']) {
      expect(migratedEnvironment(malformed), malformed).toBe('open-field');
    }
  });

  it('aligns south and west access openings with their reserved paths', () => {
    for (const id of Object.keys(archetypes) as ArchetypeId[]) {
      const archetype = archetypes[id];
      const environment = makeEnvironment(1, { archetype: id }, `test:${id}`);
      const access = environment.layout!.access;
      const reservations = environment.layout!.reservations;
      expect(access.length).toBe(planningProfiles[archetype.planningProfile].accessDefaults.length);
      for (const opening of access) {
        const alongX = opening.edge === 'north' || opening.edge === 'south';
        const aligned = reservations.some((reservation) => {
          const opensAlong = alongX
            ? reservation.x < opening.offsetM + opening.widthM && reservation.x + reservation.widthM > opening.offsetM
            : reservation.y < opening.offsetM + opening.widthM && reservation.y + reservation.depthM > opening.offsetM;
          const touchesEdge = opening.edge === 'north' ? reservation.y === 0
            : opening.edge === 'south' ? reservation.y + reservation.depthM === environment.heightM
              : opening.edge === 'west' ? reservation.x === 0
                : reservation.x + reservation.widthM === environment.widthM;
          return opensAlong && touchesEdge;
        });
        expect(aligned, `${id} ${opening.edge} opening`).toBe(true);
      }
    }
  });

  it('keeps plan extents on the environment grid and strips the deprecated alias on save', () => {
    const environment = makeEnvironment(1, { archetype: 'cold-frame' }, 'env:1:1');
    const saved = normalizeEnvironment({ ...environment, widthM: 2.63, heightM: 1.87 }, true);

    expect(saved.widthM).toBe(2.75);
    expect(saved.heightM).toBe(1.75);
    expect(saved.plan.widthM).toBe(saved.widthM);
    expect(saved.plan.heightM).toBe(saved.heightM);
    expect(saved.plan.cellM).toBe(saved.cellM);
    expect(saved.plan.surface).toBeUndefined();
  });

  it('normalizes prototype-key archetypes without throwing or selecting an inherited value', () => {
    const environment = makeEnvironment(1, { archetype: 'open-field' }, 'env:1:1');
    for (const malformed of ['__proto__', 'constructor', 'toString']) {
      const normalized = normalizeEnvironment({ ...environment, archetype: malformed as ArchetypeId });
      expect(normalized.archetype, malformed).toBe('open-field');
      expect(legacyPlanForEnvironment({ ...environment, archetype: malformed as ArchetypeId }).surface, malformed).toBe('outdoor');
    }
  });

  it('preserves the old run summary exactly after moving surface into frozen metadata', () => {
    const before = legacyPlan('greenhouse');
    const oldConfig: RunConfig = {
      farmId: 1,
      basePlan: before,
      startDate: '2026-04-01',
      dayCount: 24,
      seed: 1,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
      meanDailyGddC: 7,
    };
    const environment = migrateEnvironmentStore({ plans: { 1: before } }).sites[1]!.environments[0]!;
    const newConfig: RunConfig = {
      ...oldConfig,
      basePlan: environment.plan,
      environment: environmentSnapshot(environment),
    };
    const weather = syntheticWeather();
    const oldSummary = simulateRun(oldConfig, weather, { crops: cropLibrary }).summary;
    const newSummary = simulateRun(newConfig, weather, { crops: cropLibrary }).summary;

    expect(newSummary).toEqual(oldSummary);
  });
});

function migratedEnvironment(surface: string): ArchetypeId {
  const migrated = migrateEnvironmentStore({ plans: { 1: legacyPlan(surface) } });
  return migrated.sites[1]!.environments[0]!.archetype;
}
