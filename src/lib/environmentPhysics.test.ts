import { describe, expect, it } from 'vitest';

import { archetypes, planningProfiles } from '@/creative/archetypes';
import { cropLibrary } from '@/data/crops';
import { templates } from '@/data/templates';
import { updatedDemoWorlds } from '@/data/demoWorlds';
import { makeEnvironment } from '@/lib/environment-model';
import { environmentForTemplate } from '@/lib/template-plan';
import { growingTargetKey } from '@/lib/growingTargets';
import {
  auditEnvironmentGeometry,
  type EnvironmentAuditSubject,
  type EnvironmentIssue,
} from '@/lib/environmentPhysics';
import type { Environment, GrowingSpace, GrowingTargetPlan, PlanState } from '@/types';

function basePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    farmId: 1,
    widthM: 4,
    heightM: 3,
    cellM: 0.25,
    allowOutsideBeds: false,
    planting: {},
    ground: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function rackSpace(id: string, overrides: Partial<GrowingSpace> = {}): GrowingSpace {
  return {
    id,
    label: id,
    kind: 'rack',
    x: 1,
    y: 1,
    widthM: 1,
    depthM: 0.5,
    levels: [
      { id: `${id}:l1`, label: 'Level 1', elevationM: 0.2 },
      { id: `${id}:l2`, label: 'Level 2', elevationM: 0.65 },
    ],
    ...overrides,
  };
}

function fixture(overrides: Partial<EnvironmentAuditSubject> = {}): EnvironmentAuditSubject {
  return {
    widthM: 4,
    heightM: 3,
    cellM: 0.25,
    plan: basePlan(),
    layout: {
      usableHeightM: 2.6,
      access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
      reservations: [],
      growingSpaces: [],
    },
    instances: [],
    ...overrides,
  };
}

function targetPlan(spaceId: string, levelId: string, planting: Record<string, number>): GrowingTargetPlan {
  return { growingSpaceId: spaceId, levelId, planting };
}

function issuesOfCode(issues: EnvironmentIssue[], code: string): EnvironmentIssue[] {
  return issues.filter((issue) => issue.code === code);
}

describe('environment geometry audit', () => {
  it('reports no issues for a valid enclosed world with deliberate parent/child placements', () => {
    const space = rackSpace('rack-1');
    const subject = fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [{ id: 'door-service', kind: 'service', x: 0, y: 2.5, widthM: 1, depthM: 0.5 }],
        growingSpaces: [space],
      },
      instances: [
        // The rack structure and its growing spaces are one system.
        { id: 'rack-1:rack', slug: 'plant-rack', x: 1, y: 1, widthM: 1, depthM: 0.5, mount: { kind: 'floor' } },
        // Growing-level lights share the parent rack footprint by design.
        { id: 'rack-1:light:1', slug: 'grow-light', x: 1, y: 1, widthM: 0.5, depthM: 0.5, mount: { kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l1' } },
        { id: 'rack-1:light:2', slug: 'grow-light', x: 1.5, y: 1, widthM: 0.5, depthM: 0.5, mount: { kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l2' } },
        // Environment-mounted equipment hangs at a deliberate height.
        { id: 'wall-fan', slug: 'clip-fan', x: 1, y: 1, widthM: 0.3, depthM: 0.3, mount: { kind: 'environment', elevationM: 1.5 } },
      ],
      plan: basePlan({
        targets: {
          [growingTargetKey({ kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l1' })]:
            targetPlan('rack-1', 'rack-1:l1', { '4,4': 7, '5,4': 7 }),
        },
      }),
    });
    expect(auditEnvironmentGeometry(subject)).toEqual([]);
  });

  it('flags non-finite and negative dimensions and positions with a per-field subjectId', () => {
    const subject = fixture({
      widthM: -2,
      plan: basePlan({ cellM: 0 }),
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [{ id: 'res-1', kind: 'aisle', x: 0, y: 0, widthM: 1, depthM: -0.5 }],
        growingSpaces: [rackSpace('s1', { x: -0.5 })],
      },
      instances: [
        { id: 'i1', slug: 'grow-light', x: 0, y: 0, widthM: -1, depthM: 0.5, mount: { kind: 'floor' } },
      ],
    });
    expect(issuesOfCode(auditEnvironmentGeometry(subject), 'dimension-invalid').map((issue) => issue.subjectId))
      .toEqual(['environment.widthM', 'instance/i1/widthM', 'plan.cellM', 'reservation/res-1/depthM', 'space/s1/x']);
    for (const issue of issuesOfCode(auditEnvironmentGeometry(subject), 'dimension-invalid')) {
      expect(issue.severity).toBe('error');
    }
  });

  it('flags a growing space that leaves the environment footprint', () => {
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1', { x: 3.5, y: 0, widthM: 1, depthM: 0.5 })],
      },
    }));
    expect(issuesOfCode(issues, 'space-outside-footprint')).toEqual([{
      code: 'space-outside-footprint',
      severity: 'error',
      message: expect.any(String),
      subjectId: 'rack-1',
    }]);
  });

  it('flags overlapping growing spaces but not spaces that merely touch', () => {
    const overlapping = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [
          rackSpace('s1', { x: 0, y: 0, widthM: 1, depthM: 1 }),
          rackSpace('s2', { x: 0.5, y: 0, widthM: 1, depthM: 1 }),
        ],
      },
    }));
    expect(issuesOfCode(overlapping, 'space-overlap')).toEqual([{
      code: 'space-overlap',
      severity: 'error',
      message: expect.any(String),
      subjectId: 's1::s2',
    }]);

    const touching = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [
          rackSpace('s1', { x: 0, y: 0, widthM: 1, depthM: 1 }),
          rackSpace('s2', { x: 1, y: 0, widthM: 1, depthM: 1 }),
        ],
      },
    }));
    expect(issuesOfCode(touching, 'space-overlap')).toEqual([]);
  });

  it('flags planted cells outside their declared growing space and unparseable cell keys', () => {
    const key = growingTargetKey({ kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l1' });
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1')],
      },
      plan: basePlan({
        targets: {
          [key]: targetPlan('rack-1', 'rack-1:l1', { '0,0': 7, '4,4': 7, 'oops': 7 }),
        },
      }),
    }));
    expect(issuesOfCode(issues, 'target-cell-outside-space')).toEqual([{
      code: 'target-cell-outside-space',
      severity: 'error',
      message: expect.stringContaining('0,0'),
      subjectId: key,
    }]);
    expect(issuesOfCode(issues, 'target-cell-invalid').map((issue) => issue.subjectId)).toEqual([key]);
  });

  it('flags planted targets anchored to a missing growing space or level', () => {
    const missingSpace = growingTargetKey({ kind: 'growing-level', growingSpaceId: 'ghost', levelId: 'ghost:l1' });
    const missingLevel = growingTargetKey({ kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l9' });
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1')],
      },
      plan: basePlan({
        targets: {
          [missingSpace]: targetPlan('ghost', 'ghost:l1', {}),
          [missingLevel]: targetPlan('rack-1', 'rack-1:l9', {}),
        },
      }),
    }));
    expect(issuesOfCode(issues, 'target-anchor-missing').map((issue) => issue.subjectId).sort())
      .toEqual([missingLevel, missingSpace].sort());
    for (const issue of issuesOfCode(issues, 'target-anchor-missing')) {
      expect(issue.severity).toBe('error');
    }
  });

  it('flags floor-mounted instances intersecting other floor instances or reservations', () => {
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [{ id: 'res-1', kind: 'service', x: 0, y: 0, widthM: 0.5, depthM: 0.5 }],
        growingSpaces: [],
      },
      instances: [
        { id: 'i1', slug: 'co2-tank', x: 0, y: 0, widthM: 0.5, depthM: 0.5, mount: { kind: 'floor' } },
        { id: 'i2', slug: 'seedling-tray', x: 0.25, y: 0.25, widthM: 0.5, depthM: 0.5, mount: { kind: 'floor' } },
      ],
    }));
    expect(issuesOfCode(issues, 'instance-collision').map((issue) => issue.subjectId).sort())
      .toEqual(['i1::i2', 'i1::res-1', 'i2::res-1'].sort());
    for (const issue of issuesOfCode(issues, 'instance-collision')) {
      expect(issue.severity).toBe('error');
    }
  });

  it('flags growing-level equipment mounted on a missing growing space or level', () => {
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1')],
      },
      instances: [
        { id: 'light-ghost-space', slug: 'grow-light', x: 0, y: 0, widthM: 0.5, depthM: 0.5, mount: { kind: 'growing-level', growingSpaceId: 'ghost', levelId: 'ghost:l1' } },
        { id: 'light-ghost-level', slug: 'grow-light', x: 0, y: 0, widthM: 0.5, depthM: 0.5, mount: { kind: 'growing-level', growingSpaceId: 'rack-1', levelId: 'rack-1:l9' } },
      ],
    }));
    expect(issuesOfCode(issues, 'instance-mount-unresolved').map((issue) => issue.subjectId).sort())
      .toEqual(['light-ghost-level', 'light-ghost-space'].sort());
    for (const issue of issuesOfCode(issues, 'instance-mount-unresolved')) {
      expect(issue.severity).toBe('error');
    }
  });

  it('flags negative and non-increasing level elevations', () => {
    const issues = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1', {
          levels: [
            { id: 'rack-1:l1', label: 'Level 1', elevationM: -0.1 },
            { id: 'rack-1:l2', label: 'Level 2', elevationM: 0.2 },
            { id: 'rack-1:l3', label: 'Level 3', elevationM: 0.2 },
          ],
        })],
      },
    }));
    expect(issuesOfCode(issues, 'level-elevation-invalid').map((issue) => issue.subjectId))
      .toEqual(['rack-1/rack-1:l1', 'rack-1/rack-1:l3']);
    for (const issue of issuesOfCode(issues, 'level-elevation-invalid')) {
      expect(issue.severity).toBe('error');
    }
  });

  it('flags rack decks and clearances above the usable height, and skips the check without one', () => {
    const withHeight = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [
          rackSpace('rack-1', {
            levels: [
              { id: 'rack-1:l1', label: 'Level 1', elevationM: 2.8 },
              { id: 'rack-1:l2', label: 'Level 2', elevationM: 2.4, clearanceM: 0.5 },
              { id: 'rack-1:l3', label: 'Level 3', elevationM: 2.4, clearanceM: -1 },
            ],
          }),
        ],
      },
    }));
    expect(issuesOfCode(withHeight, 'level-above-usable-height').map((issue) => issue.subjectId))
      .toEqual(['rack-1/rack-1:l1']);
    expect(issuesOfCode(withHeight, 'level-above-usable-height')[0]!.severity).toBe('error');
    expect(issuesOfCode(withHeight, 'level-clearance-exceeds-height').map((issue) => issue.subjectId))
      .toEqual(['rack-1/rack-1:l2']);
    expect(issuesOfCode(withHeight, 'dimension-invalid').map((issue) => issue.subjectId))
      .toEqual(['rack-1/rack-1:l3/clearanceM']);

    const withoutHeight = auditEnvironmentGeometry(fixture({
      layout: {
        access: [{ id: 'access-1', edge: 'south', offsetM: 1.1, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [rackSpace('rack-1', {
          levels: [{ id: 'rack-1:l1', label: 'Level 1', elevationM: 5 }],
        })],
      },
    }));
    expect(issuesOfCode(withoutHeight, 'level-above-usable-height')).toEqual([]);
    expect(issuesOfCode(withoutHeight, 'level-clearance-exceeds-height')).toEqual([]);
  });

  it('warns when access-opening records are missing and errors on invalid ones', () => {
    const missing = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [],
        reservations: [],
        growingSpaces: [],
      },
    }));
    expect(issuesOfCode(missing, 'access-openings-missing')).toEqual([{
      code: 'access-openings-missing',
      severity: 'warning',
      message: expect.any(String),
      subjectId: 'layout.access',
    }]);

    const invalid = auditEnvironmentGeometry(fixture({
      layout: {
        usableHeightM: 2.6,
        access: [{ id: 'access-1', edge: 'south', offsetM: 3.5, widthM: 0.9 }],
        reservations: [],
        growingSpaces: [],
      },
    }));
    expect(issuesOfCode(invalid, 'access-opening-invalid')).toEqual([{
      code: 'access-opening-invalid',
      severity: 'error',
      message: expect.any(String),
      subjectId: 'access/access-1',
    }]);
  });

  it('audits nothing beyond dimensions when no layout data exists', () => {
    expect(auditEnvironmentGeometry(fixture({ layout: undefined }))).toEqual([]);
  });

  it('sorts deterministically by code then subjectId and round-trips as JSON', () => {
    const subject = fixture({
      widthM: -2,
      layout: {
        usableHeightM: 2.6,
        access: [],
        reservations: [{ id: 'res-1', kind: 'aisle', x: 0, y: 0, widthM: 1, depthM: -0.5 }],
        growingSpaces: [rackSpace('s1', { x: -0.5 })],
      },
    });
    const first = auditEnvironmentGeometry(subject);
    const second = auditEnvironmentGeometry(subject);
    expect(first).toEqual(second);
    const sorted = [...first].sort((a, b) => {
      if (a.code !== b.code) return a.code < b.code ? -1 : 1;
      return a.subjectId < b.subjectId ? -1 : 1;
    });
    expect(first).toEqual(sorted);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

describe('shipped enclosed starter templates', () => {
  const enclosed = Object.values(archetypes).filter((archetype) => archetype.kind !== 'open');
  const auditedTemplates = new Set<string>();

  it('audits every template compatible with an enclosed archetype without errors', () => {
    for (const archetype of enclosed) {
      const profile = planningProfiles[archetype.planningProfile];
      for (const templateId of profile.compatibleTemplates) {
        const template = templates.find((entry) => entry.id === templateId);
        expect(template, templateId).toBeDefined();
        auditedTemplates.add(templateId);
        const base = makeEnvironment(1, {
          archetype: archetype.id,
          widthM: template!.widthM ?? archetype.defaultFootprint.wM,
          heightM: template!.heightM ?? archetype.defaultFootprint.hM,
          cellM: 0.25,
        }, 'env:1:template');
        const { environment } = environmentForTemplate(base, template!, cropLibrary);
        const issues = auditEnvironmentGeometry(environment as Environment);
        expect(issues.filter((issue) => issue.severity === 'error'), `${archetype.id} + ${templateId}`)
          .toEqual([]);
      }
    }
    for (const expected of [
      'greenhouse-benches', 'tunnel-tomatoes', 'cold-frame-salads', 'tent-starters',
      'grow-room-benches', 'warehouse-greens', 'container-farm-greens',
    ]) {
      expect(auditedTemplates.has(expected), expected).toBe(true);
    }
  });
});

describe('shipped demo worlds', () => {
  const audited = new Map<string, EnvironmentIssue[]>();
  for (const environments of Object.values(updatedDemoWorlds)) {
    for (const environment of environments) {
      audited.set(environment.id, auditEnvironmentGeometry(environment));
    }
  }

  it('reports no instance collisions for the legacy hoophouse world', () => {
    const issues = audited.get('demo:v3:8:base');
    expect(issues).toBeDefined();
    expect(issues!.filter((issue) => issue.code === 'instance-collision')).toEqual([]);
  });

  it('reports no instance collisions for the tiered warehouse', () => {
    const issues = audited.get('demo:v3:9:warehouse-tiered');
    expect(issues).toBeDefined();
    expect(issues!.filter((issue) => issue.code === 'instance-collision')).toEqual([]);
  });

  it('reports the known missing access openings on legacy demo interiors as warnings', () => {
    for (const farmId of [5, 6, 7, 8]) {
      const issues = audited.get(`demo:v3:${farmId}:base`);
      expect(issues?.some((issue) => issue.code === 'access-openings-missing' && issue.severity === 'warning'),
        `farm ${farmId}`).toBe(true);
    }
  });

  it('finds no errors in the remaining shipped demo worlds', () => {
    const knownErrorWorlds = new Set(['demo:v3:8:base', 'demo:v3:9:warehouse-tiered']);
    for (const [environmentId, issues] of audited.entries()) {
      if (knownErrorWorlds.has(environmentId)) continue;
      expect(issues.filter((issue) => issue.severity === 'error'), environmentId).toEqual([]);
    }
  });
});
