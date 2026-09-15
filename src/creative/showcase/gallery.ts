/**
 * Asset Gallery v2 — every registry asset in one browsable grid (gallery.html).
 *
 * One WebGL context, one scissor viewport per cell (same technique as
 * showcase/main.ts, including the scroll-offset fix: cell rects are
 * viewport-relative but the canvas sits at the document origin, so add
 * window.scrollX/Y before converting to GL coords).
 *
 * All cells are built once up front; the tab / search / refined filters only
 * toggle DOM visibility, so switching filters never rebuilds geometry.
 * Clicking a tile opens a close-up modal that re-renders the same scene.
 */
import * as THREE from 'three';
import type { AssetEntry, StudioRig } from '@/creative/registry-types';
import { entries as terrainEntries } from '@/creative/terrain/registry';
import { entries as cropsEntries } from '@/creative/crops/registry';
import { entries as structuresEntries } from '@/creative/structures/registry';
import { entries as creaturesEntries } from '@/creative/creatures/registry';
import { entries as environmentsEntries } from '@/creative/environments/registry';

type Lane = 'a' | 'b' | 'c' | 'd' | 'e';

const LANES: { id: Lane; label: string }[] = [
  { id: 'a', label: 'Terrain & Soil' },
  { id: 'b', label: 'Crops & Growth' },
  { id: 'c', label: 'Structures' },
  { id: 'd', label: 'Creatures & Tools' },
  { id: 'e', label: 'Environments' },
];

interface TaggedEntry extends AssetEntry {
  lane: Lane;
}

const allEntries: TaggedEntry[] = [
  ...terrainEntries.map((e) => ({ ...e, lane: 'a' as const })),
  ...cropsEntries.map((e) => ({ ...e, lane: 'b' as const })),
  ...structuresEntries.map((e) => ({ ...e, lane: 'c' as const })),
  ...creaturesEntries.map((e) => ({ ...e, lane: 'd' as const })),
  ...environmentsEntries.map((e) => ({ ...e, lane: 'e' as const })),
];

// Assets rebuilt or reworked in the Sep 2026 pre-market QA pass
// (implementation-notes.md "Creative asset QA round"). Crop archetypes own
// six stage ids (`<arch>-s0…s5`), so they match by prefix.
const REFINED_IDS = new Set([
  // Lane A
  'soil-tilled-dry', 'soil-tilled-wet', 'pond-center',
  // Lane C — 5 classics + all 8 CE structures fixed in the pass
  'shed', 'chicken-coop', 'beehive', 'hay-bale', 'gate',
  'grow-light', 'fruit-tree', 'grow-tent', 'plant-rack', 'hydro-channel',
  'clip-fan', 'hvac-unit', 'grow-bench',
  // Lane D
  'chicken', 'pig', 'bee', 'butterfly', 'watering-can', 'hoe', 'pitchfork',
  'seed-bag', 'wind-sway-demo',
]);
const REFINED_ARCHETYPES = new Set([
  'tomato', 'wheat', 'corn', 'leafy-head', 'brassica', 'greens-open',
  'cucurbit-vine', 'legume-trellis', 'bush-bean', 'strawberry',
  'root-carrot', 'allium', 'potato', 'herb-clump', 'herb-shrub', 'mushroom',
]);

function isRefined(entry: TaggedEntry): boolean {
  if (REFINED_IDS.has(entry.id)) return true;
  const m = /^([a-z-]+)-s\d$/.exec(entry.id);
  return m !== null && REFINED_ARCHETYPES.has(m[1]);
}

const CELL = { w: 380, h: 280 };

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const tabsNav = document.getElementById('tabs') as HTMLElement;
const searchInput = document.getElementById('q') as HTMLInputElement;
const refinedChip = document.getElementById('refined') as HTMLButtonElement;
const countEl = document.getElementById('count') as HTMLElement;

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
  visible: boolean;
}

function makeCell(entry: TaggedEntry, index: number): Cell {
  const wrapper = document.createElement('div');
  wrapper.className = 'cell';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = entry.label;
  const vp = document.createElement('div');
  vp.className = 'viewport id-tag';
  vp.dataset.id = entry.id;
  vp.style.width = `${CELL.w}px`;
  vp.style.height = `${CELL.h}px`;
  if (isRefined(entry)) {
    const badge = document.createElement('div');
    badge.className = 'refined';
    badge.textContent = '✦ refined';
    vp.appendChild(badge);
  }
  wrapper.append(label, vp);
  app.appendChild(wrapper);

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
  const camera = new THREE.PerspectiveCamera(fov, CELL.w / CELL.h, 0.01, Math.max(100, dist * 4));
  const elev = (28 * Math.PI) / 180;
  const azim = (33 * Math.PI) / 180;
  camera.position.set(
    dist * Math.cos(elev) * Math.sin(azim),
    dist * Math.sin(elev) + vRadius * 0.15,
    dist * Math.cos(elev) * Math.cos(azim),
  );
  camera.lookAt(0, 0, 0);

  const rig: StudioRig = { key, fill, hemi };
  entry.tune?.(rig);

  const cell: Cell = {
    entry,
    el: vp,
    scene,
    camera,
    pivot,
    rig,
    defaultKey: { color: key.color.getHex(), intensity: key.intensity },
    defaultHemi: { sky: hemi.color.getHex(), ground: hemi.groundColor.getHex(), intensity: hemi.intensity },
    spinBase: (index * 137.5 * Math.PI) / 180,
    visible: true,
  };
  vp.addEventListener('click', () => openModal(cell));
  return cell;
}

const cells = allEntries.map(makeCell);

// empty-state row (CSS ships in gallery.html; the element is created here)
const emptyEl = document.createElement('div');
emptyEl.id = 'empty';
emptyEl.hidden = true;
emptyEl.textContent = 'no assets match — clear the search or filters';
app.appendChild(emptyEl);

// --- filters ----------------------------------------------------------------
let activeTab: Lane | 'all' = 'all';
let refinedOnly = false;

function tabButton(id: Lane | 'all', label: string, n: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tab';
  b.dataset.tab = id;
  b.textContent = `${label} (${n})`;
  if (id === activeTab) b.classList.add('active');
  b.addEventListener('click', () => {
    activeTab = id;
    for (const t of tabsNav.querySelectorAll('button')) t.classList.toggle('active', t.dataset.tab === id);
    applyFilter();
  });
  return b;
}

tabsNav.appendChild(tabButton('all', 'All', cells.length));
for (const lane of LANES) {
  tabsNav.appendChild(tabButton(lane.id, lane.label, cells.filter((c) => c.entry.lane === lane.id).length));
}

searchInput.addEventListener('input', applyFilter);
refinedChip.addEventListener('click', () => {
  refinedOnly = !refinedOnly;
  refinedChip.classList.toggle('on', refinedOnly);
  applyFilter();
});

function applyFilter(): void {
  const q = searchInput.value.trim().toLowerCase();
  let shown = 0;
  for (const cell of cells) {
    const { entry } = cell;
    const ok =
      (activeTab === 'all' || entry.lane === activeTab) &&
      (!refinedOnly || isRefined(entry)) &&
      (q === '' || entry.id.includes(q) || entry.label.toLowerCase().includes(q));
    cell.visible = ok;
    (cell.el.parentElement as HTMLElement).style.display = ok ? '' : 'none';
    if (ok) shown++;
  }
  countEl.textContent = `showing ${shown} of ${cells.length}`;
  emptyEl.hidden = shown !== 0;
  syncCanvasSize();
}

// --- renderer ---------------------------------------------------------------
let pageH = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;

function syncCanvasSize(): void {
  const w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  pageH = h;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
window.addEventListener('resize', syncCanvasSize);

function renderFrame(timeMs: number): void {
  const t = timeMs / 1000;
  for (const cell of cells) {
    if (!cell.visible && cell !== modalCell) continue;
    cell.entry.tick?.(cell.pivot, t, 1 / 60);
    cell.pivot.rotation.y = cell.spinBase + t * 0.3;
    // restore studio defaults so per-entry tune() never leaks between cells
    cell.rig.key.color.setHex(cell.defaultKey.color);
    cell.rig.key.intensity = cell.defaultKey.intensity;
    cell.rig.hemi.color.setHex(cell.defaultHemi.sky);
    cell.rig.hemi.groundColor.setHex(cell.defaultHemi.ground);
    cell.rig.hemi.intensity = cell.defaultHemi.intensity;
    cell.entry.tune?.(cell.rig);

    const rect = cell.el.getBoundingClientRect();
    if (rect.width === 0) continue;
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY;
    const glY = pageH - (top + rect.height);
    renderer.setViewport(left, glY, rect.width, rect.height);
    renderer.setScissor(left, glY, rect.width, rect.height);
    renderer.render(cell.scene, cell.camera);
  }
  if (modalCell && modalRenderer && modalCam) {
    modalRenderer.render(modalCell.scene, modalCam);
  }
}

let first = true;
function loop(timeMs: number): void {
  renderFrame(timeMs);
  if (first) {
    first = false;
    (window as unknown as { __ready: boolean }).__ready = true;
    document.title = `gallery-ready ${cells.length}`;
  }
  requestAnimationFrame(loop);
}

applyFilter();
requestAnimationFrame(loop);

// --- close-up modal ----------------------------------------------------------
const MODAL_W = 920;
const MODAL_H = 640;
const modal = document.getElementById('modal') as HTMLElement;
let modalCell: Cell | null = null;
let modalRenderer: THREE.WebGLRenderer | null = null;
let modalCam: THREE.PerspectiveCamera | null = null;

function openModal(cell: Cell): void {
  modalCell = cell;
  const card = document.createElement('div');
  card.className = 'modal-card';

  const cv = document.createElement('canvas');
  cv.width = MODAL_W;
  cv.height = MODAL_H;

  const meta = document.createElement('div');
  meta.className = 'modal-meta';
  const who = document.createElement('div');
  const mLabel = document.createElement('div');
  mLabel.className = 'm-label';
  mLabel.textContent = cell.entry.label;
  const mId = document.createElement('div');
  mId.className = 'm-id';
  mId.textContent = cell.entry.id;
  who.append(mLabel, mId);
  const actions = document.createElement('div');
  actions.className = 'm-actions';
  const link = document.createElement('a');
  link.href = `/showcase.html#lane=${cell.entry.lane}&only=${cell.entry.id}&mode=big`;
  link.textContent = 'open in showcase ↗';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'close';
  close.addEventListener('click', closeModal);
  actions.append(link, close);
  meta.append(who, actions);

  card.append(cv, meta);
  modal.replaceChildren(card);
  modal.hidden = false;

  if (modalRenderer) modalRenderer.dispose();
  // fresh renderer bound to this modal's canvas — one live context at a time
  modalRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  modalRenderer.setPixelRatio(1);
  modalRenderer.outputColorSpace = THREE.SRGBColorSpace;
  modalRenderer.setSize(MODAL_W, MODAL_H, false);
  modalCam = cell.camera.clone();
  modalCam.aspect = MODAL_W / MODAL_H;
  modalCam.updateProjectionMatrix();
}

function closeModal(): void {
  modal.hidden = true;
  modal.replaceChildren();
  if (modalRenderer) {
    modalRenderer.dispose();
    modalRenderer = null;
  }
  modalCam = null;
  modalCell = null;
}

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});
