/**
 * Enclosure shells for non-outdoor plan surfaces — the visual "you are
 * inside" read for grow tents, hoophouses, greenhouses, grow rooms and
 * vertical-farm warehouses.
 *
 * Thin runtime adapter over the creative environment kit
 * (src/creative/environments/shells.ts): the makers own all the geometry
 * (glow reads included — tent/indoor/warehouse carry unlit LED strips, so no
 * legacy light-bar code remains here; sky.ts keeps owning THE light).
 * Makers return fresh meshes sized in meters, centered at origin in XZ with
 * ground at y=0 — the same anchor the old box shell used (walls at
 * ±widthM/2, ±heightM/2), so no repositioning is needed.
 *
 * MODULE-SCOPE CACHE (red-team): the World3D planVersion effect calls
 * buildShell on EVERY brush dab, and a shell is a ~10k-voxel merged geometry.
 * One cached shell keyed (surface, widthM, heightM): a cache hit whose root is
 * already attached to the scene is a no-op (callers need not pre-dispose); a
 * key change (or a surface with no shell) frees the old root and builds fresh.
 * disposeShell only DETACHES the cache-owned root — any shell the cache no
 * longer backs is fully freed; releaseShellCache() frees the cached shell on
 * view unmount, so GPU memory stays bounded to one shell while mounted and
 * zero after.
 */
import * as THREE from 'three';
import type { PlanState, PlanSurface } from '@/types';
import {
  makeTentShell,
  makeIndoorShell,
  makeGreenhouseShell,
  makeHoophouseShell,
  makeWarehouseShell,
  type ShellSpec,
} from '@/creative/environments/shells';

export interface ShellGroup {
  root: THREE.Group;
  surface: PlanSurface;
}

const SHELL_MAKERS: Partial<Record<PlanSurface, (spec: ShellSpec) => THREE.Object3D>> = {
  greenhouse: makeGreenhouseShell,
  hoophouse: makeHoophouseShell,
  tent: makeTentShell,
  indoor: makeIndoorShell,
  warehouse: makeWarehouseShell,
};

// --- module-scope cache (single entry) ----------------------------------------

interface CachedShell {
  key: string;
  group: ShellGroup;
}

let cachedShell: CachedShell | null = null;

function shellKey(surface: PlanSurface, widthM: number, depthM: number): string {
  return `${surface}|${widthM}|${depthM}`;
}

/** Free every geometry/material under the group (the makers never share any). */
function freeGroup(group: ShellGroup): void {
  group.root.removeFromParent();
  group.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      mesh.geometry.dispose();
    }
  });
  const mats = new Set<THREE.Material>();
  group.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      const m = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((x) => mats.add(x));
      else if (m) mats.add(m);
    }
  });
  for (const m of mats) m.dispose();
}

export function buildShell(plan: PlanState, scene: THREE.Scene): ShellGroup | null {
  const surface = plan.surface ?? 'outdoor';
  const maker = SHELL_MAKERS[surface];
  if (!maker) {
    // No shell for this surface (outdoor): release the cached shell so
    // switching canvases doesn't strand one in GPU memory.
    if (cachedShell) {
      freeGroup(cachedShell.group);
      cachedShell = null;
    }
    return null;
  }

  const key = shellKey(surface, plan.widthM, plan.heightM);
  if (cachedShell && cachedShell.key === key) {
    // Idempotent: an already-attached root returns immediately (no re-add), so
    // callers can buildShell on every plan change without pre-disposing.
    if (cachedShell.group.root.parent !== scene) scene.add(cachedShell.group.root);
    return cachedShell.group;
  }

  if (cachedShell) {
    freeGroup(cachedShell.group);
    cachedShell = null;
  }

  // NaN/zero/negative dims would poison the cache key and the makers — bail
  // WITHOUT caching so a later good plan rebuilds cleanly.
  if (!Number.isFinite(plan.widthM) || !Number.isFinite(plan.heightM) || plan.widthM <= 0 || plan.heightM <= 0) {
    return null;
  }

  const root = new THREE.Group();
  root.name = `shell:${surface}`;
  root.add(maker({ widthM: plan.widthM, depthM: plan.heightM }));
  scene.add(root);

  const group: ShellGroup = { root, surface };
  cachedShell = { key, group };
  return group;
}

export function disposeShell(shell: ShellGroup | null): void {
  if (!shell) return;
  shell.root.removeFromParent();
  // The module cache still owns this shell (same key may be rebuilt on the
  // very next plan change) — keep its resources; everything else is fully freed.
  if (cachedShell && cachedShell.group === shell) return;
  freeGroup(shell);
}

/**
 * Fully free the cached shell, if any (World3D unmount). disposeShell alone
 * keeps cache-owned GPU resources alive for the next plan change — this is
 * the bounded-teardown half of that bargain.
 */
export function releaseShellCache(): void {
  if (cachedShell) {
    freeGroup(cachedShell.group);
    cachedShell = null;
  }
}
