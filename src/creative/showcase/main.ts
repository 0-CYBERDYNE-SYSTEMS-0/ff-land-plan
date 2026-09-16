/**
 * Asset showcase renderer — one WebGL context, many scenes via scissor viewports.
 *
 * URL options (hash params):
 *   #lane=a|b|c|d|e      only show one lane's registry
 *   #only=id1,id2        only show these entry ids (scrub mode: crop archetype ids)
 *   #mode=sheet|big|scrub  sheet: 4-col contact grid; big: 2-col close-ups;
 *                         scrub: per-archetype growth ramp (12 cells) + lifecycle
 *                         state channels (see ./scrub.ts; sheet geometry applies,
 *                         18 cells per archetype)
 *   #spin=0              freeze turntable (for perfectly deterministic shots)
 *
 * Screenshot geometry (must match --window-size):
 *   sheet → W = 4*396+16 = 1600, H = ceil(n/4)*344 + 24
 *   big   → W = 2*712+16 = 1440, H = ceil(n/2)*524 + 24
 */
import * as THREE from 'three';
import type { AssetEntry, StudioRig } from '@/creative/registry-types';
import { entries as terrainEntries } from '@/creative/terrain/registry';
import { entries as cropsEntries } from '@/creative/crops/registry';
import { entries as structuresEntries } from '@/creative/structures/registry';
import { entries as creaturesEntries } from '@/creative/creatures/registry';
import { entries as environmentsEntries } from '@/creative/environments/registry';
import { makeScrubEntries } from './scrub';

const LANE_LABELS: Record<string, string> = {
  a: 'Terrain & Soil',
  b: 'Crops & Growth',
  c: 'Structures',
  d: 'Creatures & Atmosphere',
  e: 'Environments',
};

interface TaggedEntry extends AssetEntry {
  lane: string;
}

const allEntries: TaggedEntry[] = [
  ...terrainEntries.map((e) => ({ ...e, lane: 'a' })),
  ...cropsEntries.map((e) => ({ ...e, lane: 'b' })),
  ...structuresEntries.map((e) => ({ ...e, lane: 'c' })),
  ...creaturesEntries.map((e) => ({ ...e, lane: 'd' })),
  ...environmentsEntries.map((e) => ({ ...e, lane: 'e' })),
];

// Merge QUERY (?only=…&mode=big) and HASH (#lane=b) params — both styles are
// documented; previously only the hash was parsed, so query-style variant URLs
// were silently ignored (audit X-007).
const rawParams = `${location.search.replace(/^\?/, '')}&${location.hash.replace(/^#/, '')}`;
const params = new URLSearchParams(rawParams);
const laneFilter = params.get('lane');
const onlyList = params.get('only')?.split(',').map((s) => s.trim()) ?? null;
const mode = params.get('mode') ?? 'sheet';
const spinEnabled = params.get('spin') !== '0';
/** plan: top-down camera (the QUALITY_BAR plan-view clause needs evidence). */
const planView = params.get('view') === 'plan';

// Same-document hash navigation (e.g. clicking a #lane=d link) can't re-run
// this module — reload so the new params apply immediately instead of showing
// the stale lane until a manual refresh (audit X-007's 3-6 s lag class).
window.addEventListener('hashchange', () => window.location.reload());

let visible = allEntries;
if (mode === 'scrub') {
  visible = makeScrubEntries(onlyList ?? ['tomato']).map((e) => ({ ...e, lane: 'b' }));
} else {
  if (laneFilter) visible = visible.filter((e) => e.lane === laneFilter);
  if (onlyList) visible = onlyList.map((id) => visible.find((e) => e.id === id)).filter((e): e is TaggedEntry => !!e);
}

// --- layout constants -------------------------------------------------------
const SHEET = { cols: 4, cellW: 380, cellH: 300, gap: 16, pad: 8 };
const BIG = { cols: 2, cellW: 696, cellH: 460, gap: 16, pad: 8 };
const LAYOUT = mode === 'big' ? BIG : SHEET;

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const headerHeight = 30;
const rows = Math.ceil(visible.length / LAYOUT.cols);
const pageW = LAYOUT.cols * (LAYOUT.cellW + LAYOUT.gap) + LAYOUT.gap;
const pageH = headerHeight + rows * (LAYOUT.cellH + 26 + LAYOUT.gap) + LAYOUT.gap;

document.body.style.width = `${pageW}px`;
document.body.style.height = `${pageH}px`;
canvas.style.width = `${pageW}px`;
canvas.style.height = `${pageH}px`;

const title = document.createElement('h1');
title.textContent =
  `VOXEL FARM ASSET SHOWCASE — ${laneFilter ? LANE_LABELS[laneFilter] ?? `Lane ${laneFilter}` : 'All lanes'} — ${visible.length} assets (${mode})`;
app.appendChild(title);

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(pageW, pageH, false);
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;

interface Cell {
  entry: TaggedEntry;
  el: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  rig: StudioRig;
  defaultKey: { color: number; intensity: number };
  defaultHemi: { sky: number; ground: number; intensity: number };
  spinBase: number;
}

function makeCell(entry: TaggedEntry, index: number): Cell {
  const el = document.createElement('div');
  el.className = 'cell';
  el.style.width = `${LAYOUT.cellW}px`;
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = entry.label;
  const vp = document.createElement('div');
  vp.className = 'viewport id-tag';
  vp.dataset.id = entry.id;
  vp.style.width = `${LAYOUT.cellW}px`;
  vp.style.height = `${LAYOUT.cellH}px`;
  el.appendChild(label);
  el.appendChild(vp);
  app.appendChild(el);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdcd8ca);

  const hemi = new THREE.HemisphereLight(0xeaf2ff, 0xb09a72, 1.05);
  const key = new THREE.DirectionalLight(0xfff3e0, 1.35);
  key.position.set(5, 9, 6);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
  fill.position.set(-6, 4, -5);
  scene.add(hemi, key, fill);

  const obj = entry.make();
  const pivot = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  obj.position.sub(center);
  pivot.add(obj);
  scene.add(pivot);

  // blob shadow disc under the asset for grounding
  const radius = Math.max(size.x, size.z) * 0.62;
  if (radius > 0.01 && size.y > 0.02) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: 0x57503f, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -(size.y / 2) - 0.001;
    scene.add(shadow);
  }

  const fov = 30;
  const vRadius = box.getBoundingSphere(new THREE.Sphere()).radius || 0.6;
  const dist = (vRadius / Math.sin((fov * Math.PI) / 360)) * 1.12;
  const camera = new THREE.PerspectiveCamera(fov, LAYOUT.cellW / LAYOUT.cellH, 0.01, Math.max(100, dist * 4));
  const elev = planView ? (89 * Math.PI) / 180 : (28 * Math.PI) / 180;
  const azim = planView ? 0 : (33 * Math.PI) / 180;
  camera.position.set(
    dist * Math.cos(elev) * Math.sin(azim),
    dist * Math.sin(elev) + vRadius * 0.15,
    dist * Math.cos(elev) * Math.cos(azim),
  );
  camera.lookAt(0, 0, 0);

  const rig: StudioRig = { key, fill, hemi };
  entry.tune?.(rig);

  return {
    entry,
    el: vp,
    scene,
    camera,
    pivot,
    rig,
    defaultKey: { color: key.color.getHex(), intensity: key.intensity },
    defaultHemi: { sky: hemi.color.getHex(), ground: hemi.groundColor.getHex(), intensity: hemi.intensity },
    spinBase: (index * 137.5 * Math.PI) / 180,
  };
}

const cells = visible.map(makeCell);

function renderFrame(timeMs: number): void {
  const t = timeMs / 1000;
  for (const cell of cells) {
    cell.entry.tick?.(cell.pivot, t, 1 / 60);
    if (spinEnabled) cell.pivot.rotation.y = cell.spinBase + t * 0.3;
    // restore studio defaults so per-entry tune() never leaks between cells
    cell.rig.key.color.setHex(cell.defaultKey.color);
    cell.rig.key.intensity = cell.defaultKey.intensity;
    cell.rig.hemi.color.setHex(cell.defaultHemi.sky);
    cell.rig.hemi.groundColor.setHex(cell.defaultHemi.ground);
    cell.rig.hemi.intensity = cell.defaultHemi.intensity;
    cell.entry.tune?.(cell.rig);

    // rect is viewport-relative but the canvas sits at the document origin,
    // so add the scroll offset or every image drifts by the scroll amount
    // once the page scrolls (labels end up over foreign images).
    const rect = cell.el.getBoundingClientRect();
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY;
    const glY = pageH - (top + rect.height);
    renderer.setViewport(left, glY, rect.width, rect.height);
    renderer.setScissor(left, glY, rect.width, rect.height);
    renderer.render(cell.scene, cell.camera);
  }
}

let first = true;
function loop(timeMs: number): void {
  renderFrame(timeMs);
  if (first) {
    first = false;
    (window as unknown as { __ready: boolean }).__ready = true;
    document.title = `showcase-ready ${cells.length}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
