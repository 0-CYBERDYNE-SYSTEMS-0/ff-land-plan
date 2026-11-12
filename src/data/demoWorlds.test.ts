import { describe, expect, it } from 'vitest';

import { ARCHETYPE_FOR_SURFACE, archetypes, planningProfiles } from '@/creative/archetypes';
import { cropLibrary } from '@/data/crops';
import { seedPlans } from '@/data/seed';
import { templates } from '@/data/templates';
import { environmentForTemplate } from '@/lib/template-plan';
import { auditEnvironmentGeometry } from '@/lib/environmentPhysics';
import { growingTargetKey, planForTarget } from '@/lib/growingTargets';
import { makeEnvironment, normalizeEnvironment } from '@/lib/environment-model';
import { groundRectangles, missingUpdatedDemoWorlds, seedDemoSites, updatedDemoWorlds, WAREHOUSE_RAFT } from './demoWorlds';
import type { Environment, GrowingSpace, PlanState } from '@/types';

function targetCropCount(plan: PlanState): number {
  return Object.values(plan.targets ?? {}).reduce((count, target) => count + Object.keys(target.planting).length, 0);
}

function cropCounts(plan: PlanState): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const id of [...Object.values(plan.planting), ...Object.values(plan.targets ?? {}).flatMap((target) => Object.values(target.planting))]) {
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

function overlaps(a: { x: number; y: number; widthM: number; depthM: number }, b: { x: number; y: number; widthM: number; depthM: number }): boolean {
  return a.x < b.x + b.widthM && a.x + a.widthM > b.x && a.y < b.y + b.depthM && a.y + a.depthM > b.y;
}

function reserved(environment: Environment, rect: { x: number; y: number; widthM: number; depthM: number }): boolean {
  const layout = environment.layout!;
  if (layout.reservations.some((area) => overlaps(rect, area))) return true;
  return layout.access.some((access) => {
    const strip = environment.cellM;
    const area = access.edge === 'north' ? { x: access.offsetM, y: 0, widthM: access.widthM, depthM: strip }
      : access.edge === 'south' ? { x: access.offsetM, y: environment.heightM - strip, widthM: access.widthM, depthM: strip }
        : access.edge === 'west' ? { x: 0, y: access.offsetM, widthM: strip, depthM: access.widthM }
          : { x: environment.widthM - strip, y: access.offsetM, widthM: strip, depthM: access.widthM };
    return overlaps(rect, area);
  });
}

describe('versioned demo environments', () => {
  it('provides an archetype-compatible starter for all nine growing worlds', () => {
    for (const [id, archetype] of Object.entries(archetypes)) {
      const compatible = templates.filter((template) => template.archetypes.includes(id as keyof typeof archetypes) &&
        planningProfiles[archetype.planningProfile].compatibleTemplates.includes(template.id));
      expect(compatible.length, id).toBeGreaterThan(0);
      for (const template of compatible) {
        const levelIds = new Set((template.growingSpaces ?? []).flatMap((space) => space.levels.map((level) => `${space.id}/${level.id}`)));
        for (const target of template.targets ?? []) {
          expect(levelIds.has(`${target.growingSpaceId}/${target.levelId}`), `${id}/${template.id}`).toBe(true);
        }
        const instanceIds = (template.instances ?? []).map((instance) => instance.id);
        expect(new Set(instanceIds).size, `${id}/${template.id} equipment IDs`).toBe(instanceIds.length);
        for (const instance of template.instances ?? []) {
          if (instance.mount.kind === 'growing-level') {
            expect(levelIds.has(`${instance.mount.growingSpaceId}/${instance.mount.levelId}`), `${id}/${template.id}/${instance.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('fits each compatible starter inside its profile layout and reserved service areas', () => {
    for (const template of templates) {
      for (const archetypeId of template.archetypes) {
        const archetype = archetypes[archetypeId];
        const floorKeys = [...Object.keys(template.ground), ...Object.keys(template.planting)];
        const widthM = Math.max(archetype.defaultFootprint.wM, template.widthM ?? 0,
          ...floorKeys.map((key) => (Number(key.split(',')[0]) + 1) * 0.25),
          ...(template.growingSpaces ?? []).map((space) => space.x + space.widthM),
          ...(template.instances ?? []).map((instance) => instance.x + instance.widthM));
        const heightM = Math.max(archetype.defaultFootprint.hM, template.heightM ?? 0,
          ...floorKeys.map((key) => (Number(key.split(',')[1]) + 1) * 0.25),
          ...(template.growingSpaces ?? []).map((space) => space.y + space.depthM),
          ...(template.instances ?? []).map((instance) => instance.y + instance.depthM));
        const environment = makeEnvironment(1, { archetype: archetypeId, widthM, heightM }, `fit:${template.id}:${archetypeId}`);
        for (const key of floorKeys) {
          const [x, y] = key.split(',').map(Number);
          expect(x! >= 0 && y! >= 0 && !reserved(environment, { x: x! * 0.25, y: y! * 0.25, widthM: 0.25, depthM: 0.25 }), `${template.id}/${archetypeId}/${key}`).toBe(true);
        }
        for (const space of template.growingSpaces ?? []) {
          expect(space.x + space.widthM <= environment.widthM && space.y + space.depthM <= environment.heightM).toBe(true);
          expect(reserved(environment, space), `${template.id}/${archetypeId}/${space.id}`).toBe(false);
        }
        for (const instance of template.instances ?? []) {
          expect(instance.x + instance.widthM <= environment.widthM && instance.y + instance.depthM <= environment.heightM).toBe(true);
          if (instance.mount.kind === 'floor') expect(reserved(environment, instance), `${template.id}/${archetypeId}/${instance.id}`).toBe(false);
        }
      }
    }
  });

  it('seeds equipped tent, mushroom, greenhouse and tunnel demos into growing spaces and mounted instances', () => {
    const first = seedDemoSites();
    const second = seedDemoSites();
    const physicalGround = new Set([
      'plant-rack', 'grow-light', 'grow-bench', 'hydro-channel', 'clip-fan', 'hvac-unit',
      'co2-tank', 'seedling-tray', 'water-tap', 'ibc-tote', 'crate-stack', 'signpost', 'irrigation-line',
    ]);
    for (const farmId of [5, 6, 7, 8]) {
      const environment = first[farmId]!.environments[0]!;
      const again = second[farmId]!.environments[0]!;
      expect(environment.layout?.growingSpaces.length, `farm ${farmId} spaces`).toBeGreaterThan(0);
      expect(environment.instances?.length, `farm ${farmId} installed equipment`).toBeGreaterThan(0);
      expect(Object.keys(environment.plan.planting), `farm ${farmId} floor crops`).toHaveLength(0);
      expect(targetCropCount(environment.plan), `farm ${farmId} target crops`).toBe(Object.keys(seedPlans[farmId]!.planting).length);
      expect(cropCounts(environment.plan), `farm ${farmId} crop identities`).toEqual(cropCounts(seedPlans[farmId]!));
      expect(Object.values(environment.plan.ground).some((slug) => physicalGround.has(slug)), `farm ${farmId} legacy equipment`).toBe(false);
      expect(again.id).toBe(environment.id);
      expect(again.layout?.growingSpaces.map((space) => space.id)).toEqual(environment.layout?.growingSpaces.map((space) => space.id));
      expect(again.instances?.map((instance) => instance.id)).toEqual(environment.instances?.map((instance) => instance.id));
    }
    expect(first[6]!.environments[0]!.layout!.growingSpaces.every((space) => space.kind === 'rack')).toBe(true);
    expect(first[8]!.environments[0]!.layout!.growingSpaces.every((space) => space.kind === 'bed')).toBe(true);
  });

  it('keeps every warehouse crop on a real rack level or the relocated hydro raft', () => {
    const warehouse = seedDemoSites()[9]!.environments[0]!;
    expect(cropCounts(warehouse.plan)).toEqual(cropCounts(seedPlans[9]!));
    expect(Object.keys(warehouse.plan.planting)).toHaveLength(0);
    // Every contiguous rack run in the seed plan becomes one rack space.
    const rackRuns = groundRectangles(seedPlans[9]!, 'plant-rack');
    const rackSpaces = warehouse.layout!.growingSpaces.filter((space) => space.kind === 'rack');
    expect(rackSpaces).toHaveLength(rackRuns.length);
    expect(rackSpaces.every((space) => space.levels.length === 4)).toBe(true);
    expect(new Set(Object.values(warehouse.plan.targets!).map((target) => target.levelId).filter((id) => id.endsWith('level:1') || id.endsWith('level:3')).map((id) => id.split(':').at(-1))).size).toBe(2);
    expect(warehouse.layout!.growingSpaces.find((space) => space.kind === 'hydro')).toMatchObject({
      x: WAREHOUSE_RAFT.x,
      y: WAREHOUSE_RAFT.y,
      widthM: WAREHOUSE_RAFT.widthM,
    });
    const raftKey = `${Math.round(WAREHOUSE_RAFT.x / 0.25)},${Math.round(WAREHOUSE_RAFT.y / 0.25)}`;
    expect(Object.values(warehouse.plan.targets ?? {}).some((target) => target.planting[raftKey] !== undefined)).toBe(true);
    expect(warehouse.instances!.filter((instance) => instance.slug === 'grow-light').length).toBeGreaterThan(0);
    expect(new Set(warehouse.instances!.map((instance) => instance.id)).size).toBe(warehouse.instances!.length);
  });

  it('saves every planted demo level at its fixture\'s real support-surface elevation', () => {
    // Support surfaces: rack decks on the rack ladder, grow-bench deck top
    // (voxel 6 → 0.6 m), NFT channel top band mid-slope (~0.3 m), DWC raft
    // board top (0.22 m) and grade for in-ground beds.
    const RACK_LADDER_M = [0.2, 0.65, 1.1, 1.55];
    const supportFor = (environment: Environment, space: GrowingSpace): number[] => {
      if (space.kind === 'rack') return RACK_LADDER_M;
      if (space.kind === 'bench') return [0.6];
      if (space.kind === 'bed') return [0];
      const isRaft = (environment.instances ?? []).some((instance) => instance.slug === 'hydro-raft' && overlaps(space, instance));
      return [isRaft ? 0.22 : 0.3];
    };
    const sites = seedDemoSites();
    for (const farmId of [5, 6, 7, 8, 9]) {
      for (const environment of sites[farmId]!.environments) {
        for (const space of environment.layout?.growingSpaces ?? []) {
          const plantedLevelIds = new Set(Object.values(environment.plan.targets ?? {})
            .filter((target) => target.growingSpaceId === space.id && Object.keys(target.planting).length > 0)
            .map((target) => target.levelId));
          const support = supportFor(environment, space);
          for (const level of space.levels) {
            if (!plantedLevelIds.has(level.id)) continue;
            expect(support, `${environment.id}/${space.label} level ${level.label}`).toContain(level.elevationM);
          }
        }
      }
    }
    // Starter templates plant benches at the same deck-top surface.
    for (const template of templates) {
      for (const space of template.growingSpaces ?? []) {
        for (const level of space.levels) {
          if (space.kind === 'bench') expect(level.elevationM, `${template.id} bench top`).toBe(0.6);
          if (space.kind === 'rack') expect(RACK_LADDER_M, `${template.id} rack levels`).toContain(level.elevationM);
        }
      }
    }
  });

  it('attaches the garden, greenhouse and cold frame to the backyard while preserving the old plot', () => {
    const sites = seedDemoSites();
    const backyard = sites[3]!;
    const original = backyard.environments.find((environment) => environment.id === 'demo:v3:3:base')!;
    expect(original.plan.ground).toEqual(seedPlans[3]!.ground);
    expect(original.plan.planting).toEqual(seedPlans[3]!.planting);
    expect(backyard.environments.map((environment) => environment.archetype)).toContain('garden-beds');
    expect(backyard.environments.map((environment) => environment.archetype)).toContain('greenhouse-glass');
    expect(backyard.environments.map((environment) => environment.archetype)).toContain('cold-frame');
    expect(sites[2]!.environments).toHaveLength(1);
    for (let left = 0; left < backyard.environments.length; left += 1) {
      for (let right = left + 1; right < backyard.environments.length; right += 1) {
        const a = backyard.environments[left]!;
        const b = backyard.environments[right]!;
        expect(a.x + a.widthM <= b.x || b.x + b.widthM <= a.x).toBe(true);
      }
    }
  });

  it('adds only missing demo worlds to an old saved site and is safe to repeat', () => {
    const seed = seedDemoSites()[3]!;
    const savedOriginal: Environment = structuredClone(seed.environments[0]!);
    savedOriginal.label = 'User-edited backyard';
    savedOriginal.plan.planting = { ...savedOriginal.plan.planting, '2,2': cropLibrary[0]!.id };
    const oldSite = { ...seed, environments: [savedOriginal] };
    const additions = missingUpdatedDemoWorlds(3, oldSite);
    expect(additions.map((environment) => environment.id)).toEqual([
      'demo:v3:3:garden', 'demo:v3:3:greenhouse', 'demo:v3:3:cold-frame',
    ]);
    expect(oldSite.environments[0]).toEqual(savedOriginal);
    const refreshed = { ...oldSite, environments: [...oldSite.environments, ...additions] };
    expect(missingUpdatedDemoWorlds(3, refreshed)).toEqual([]);
    expect(refreshed.environments[0]).toEqual(savedOriginal);
    expect(additions.every((environment) => environment.x >= savedOriginal.x + savedOriginal.widthM)).toBe(true);
  });

  it('offers enriched versions of older tent, mushroom, greenhouse and tunnel demo plots additively', () => {
    for (const farmId of [5, 6, 7, 8]) {
      const source = seedPlans[farmId]!;
      const archetype = archetypes[ARCHETYPE_FOR_SURFACE[source.surface ?? 'outdoor']];
      const saved = makeEnvironment(farmId, {
        archetype: archetype.id,
        widthM: source.widthM,
        heightM: source.heightM,
      }, `env:${farmId}:1`);
      saved.plan = structuredClone(source);
      const oldSite = {
        farmId,
        widthM: saved.widthM,
        heightM: saved.heightM,
        cellM: saved.cellM,
        environments: [saved],
        updatedAt: saved.plan.updatedAt,
      };
      const additions = missingUpdatedDemoWorlds(farmId, oldSite);
      expect(additions).toHaveLength(1);
      expect(additions[0]!.id).toBe(`demo:v3:${farmId}:base`);
      expect(additions[0]!.layout!.growingSpaces.length).toBeGreaterThan(0);
      expect(cropCounts(additions[0]!.plan)).toEqual(cropCounts(source));
      expect(oldSite.environments[0]!.plan).toEqual(source);
      const refreshed = { ...oldSite, environments: [...oldSite.environments, ...additions] };
      expect(missingUpdatedDemoWorlds(farmId, refreshed)).toEqual([]);
    }
  });

  it('materializes a starter as a reloadable floor plan, bench targets and mounted lighting', () => {
    const template = templates.find((entry) => entry.id === 'greenhouse-benches')!;
    const empty = makeEnvironment(7, { archetype: 'greenhouse-glass', widthM: 8, heightM: 6 }, 'test:greenhouse');
    const materialized = environmentForTemplate(empty, template, cropLibrary, new Date('2026-10-25T00:00:00.000Z')).environment;
    const saved = normalizeEnvironment(materialized);
    const firstTarget = template.targets![0]!;
    const ref = { kind: 'growing-level' as const, growingSpaceId: firstTarget.growingSpaceId, levelId: firstTarget.levelId };
    const key = growingTargetKey(ref);
    expect(saved.layout!.growingSpaces).toHaveLength(2);
    expect(Object.keys(saved.plan.targets![key]!.planting).length).toBeGreaterThan(0);
    expect(planForTarget(saved.plan, ref).planting).toEqual(saved.plan.targets![key]!.planting);
    expect(saved.instances!.some((instance) => instance.slug === 'grow-light' && instance.mount.kind === 'growing-level' &&
      instance.mount.growingSpaceId === ref.growingSpaceId && instance.mount.levelId === ref.levelId)).toBe(true);
  });
});

describe('demo environment geometry readiness', () => {
  const enclosedEnvironments = new Map<string, Environment>();
  for (const environments of Object.values(updatedDemoWorlds)) {
    for (const environment of environments) {
      if (archetypes[environment.archetype].kind !== 'open') enclosedEnvironments.set(environment.id, environment);
    }
  }
  for (const site of Object.values(seedDemoSites())) {
    for (const environment of site.environments) {
      if (archetypes[environment.archetype].kind !== 'open') enclosedEnvironments.set(environment.id, environment);
    }
  }

  it('audits every enclosed demo environment with zero error-severity issues', () => {
    expect(enclosedEnvironments.size, 'enclosed demo environments audited').toBeGreaterThan(0);
    for (const [id, environment] of enclosedEnvironments) {
      const issues = auditEnvironmentGeometry(environment);
      expect(issues.filter((issue) => issue.severity === 'error'), id).toEqual([]);
    }
  });

  it('keeps the relocated hoophouse water tap on a clear in-footprint floor cell', () => {
    const hoophouse = enclosedEnvironments.get('demo:v3:8:base')!;
    const tap = hoophouse.instances!.find((instance) => instance.slug === 'water-tap' && instance.mount.kind === 'floor');
    expect(tap).toBeDefined();
    expect(tap!.x).toBeGreaterThanOrEqual(0);
    expect(tap!.y).toBeGreaterThanOrEqual(0);
    expect(tap!.x + tap!.widthM).toBeLessThanOrEqual(hoophouse.widthM);
    expect(tap!.y + tap!.depthM).toBeLessThanOrEqual(hoophouse.heightM);
  });

  it('keeps the relocated warehouse nursery tray on a clear in-footprint floor cell', () => {
    const warehouse = enclosedEnvironments.get('demo:v3:9:warehouse-tiered')!;
    const tray = warehouse.instances!.find((instance) => instance.slug === 'seedling-tray' && instance.mount.kind === 'floor');
    expect(tray).toBeDefined();
    expect(tray!.x).toBeGreaterThanOrEqual(0);
    expect(tray!.y).toBeGreaterThanOrEqual(0);
    expect(tray!.x + tray!.widthM).toBeLessThanOrEqual(warehouse.widthM);
    expect(tray!.y + tray!.depthM).toBeLessThanOrEqual(warehouse.heightM);
  });
});
