import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { ArchetypeId, PlanState } from '@/types';
import { buildShell, releaseShellCache } from '@/three/shell';

const plan: PlanState = {
  farmId: 1,
  widthM: 2,
  heightM: 1.5,
  cellM: 0.25,
  allowOutsideBeds: false,
  planting: {},
  ground: {},
  updatedAt: '2026-10-24T00:00:00.000Z',
};

afterEach(() => releaseShellCache());

describe('world shell archetype adapter', () => {
  it('builds a cold-frame shell instead of treating it as a glass greenhouse', () => {
    const scene = new THREE.Scene();
    const shell = buildShell(plan, scene, 'cold-frame');

    expect(shell?.archetype).toBe('cold-frame');
    expect(shell?.surface).toBe('greenhouse');
    expect(shell?.root.name).toBe('shell:cold-frame');
    expect(shell?.root.children[0]?.children.length).toBeGreaterThanOrEqual(2);
  });

  it('uses the container interior maker and retains the warehouse legacy surface alias', () => {
    const shell = buildShell(plan, new THREE.Scene(), 'container-farm');

    expect(shell?.archetype).toBe('container-farm');
    expect(shell?.surface).toBe('warehouse');
    expect(shell?.root.name).toBe('shell:container-farm');
  });

  it('keeps the legacy surface call shape working', () => {
    const shell = buildShell({ ...plan, surface: 'hoophouse' }, new THREE.Scene());

    expect(shell?.archetype).toBe('hoophouse');
    expect(shell?.surface).toBe('hoophouse');
  });

  it('treats prototype-key legacy surfaces as invalid instead of inherited archetypes', () => {
    const shell = buildShell({ ...plan, surface: '__proto__' as PlanState['surface'] }, new THREE.Scene());

    expect(shell).toBeNull();
  });

  it('scales every shell from decimeter voxels into the requested meter footprint', () => {
    const footprints: Array<[ArchetypeId, number, number]> = [
      ['greenhouse-glass', 8, 6],
      ['hoophouse', 8, 6],
      ['cold-frame', 2, 1.5],
      ['grow-tent', 2, 2],
      ['grow-room', 4, 3],
      ['warehouse-vertical', 12, 10],
      ['container-farm', 11.5, 2.25],
    ];

    for (const [archetype, widthM, heightM] of footprints) {
      const scene = new THREE.Scene();
      const shell = buildShell({ ...plan, widthM, heightM }, scene, archetype);
      expect(shell, archetype).not.toBeNull();
      shell!.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(shell!.root);
      const size = bounds.getSize(new THREE.Vector3());

      expect(Math.abs(size.x - widthM), `${archetype} width`).toBeLessThan(0.25);
      expect(Math.abs(size.z - heightM), `${archetype} depth`).toBeLessThan(0.25);
      expect(shell!.root.scale.x).toBe(0.1);
    }
  });
});
