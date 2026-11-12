import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';

import type { ArchetypeId, PlanState } from '@/types';
import { buildShell, releaseShellCache, type ShellGroup } from '@/three/shell';

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

  it('rebuilds the shell when the saved usable height changes and reuses it when unchanged', () => {
    const scene = new THREE.Scene();
    const boundsOf = (shell: ShellGroup): THREE.Vector3 => {
      shell.root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(shell.root).getSize(new THREE.Vector3());
    };

    const base = buildShell(plan, scene, 'grow-tent');
    expect(base, 'base tent shell').not.toBeNull();
    const baseRoot = base!.root;
    const baseSize = boundsOf(base!);

    // Non-finite / non-positive heights behave like no height at all (same
    // default key), so they hit the default shell's cache entry.
    const nanHit = buildShell(plan, scene, 'grow-tent', { usableHeightM: Number.NaN });
    expect(nanHit!.root).toBe(baseRoot);

    // A changed usable height is a cache miss: a fresh, taller group replaces
    // the cached one in the scene.
    const taller = buildShell(plan, scene, 'grow-tent', { usableHeightM: 3 });
    expect(taller, 're-built tent shell').not.toBeNull();
    expect(taller!.root, 'changed height must rebuild, not reuse').not.toBe(baseRoot);
    expect(scene.children).toContain(taller!.root);
    expect(scene.children).not.toContain(baseRoot);
    const tallerSize = boundsOf(taller!);
    expect(
      tallerSize.y - baseSize.y,
      `height-driven size change ${baseSize.y.toFixed(3)} → ${tallerSize.y.toFixed(3)} m`,
    ).toBeGreaterThan(0.3);

    // The same context is a cache hit: the identical group object, re-attached
    // if needed, with no rebuild.
    const again = buildShell(plan, scene, 'grow-tent', { usableHeightM: 3 });
    expect(again!.root).toBe(taller!.root);

    // release frees the cached shell from the scene.
    releaseShellCache();
    expect(scene.children).not.toContain(taller!.root);
  });
});
