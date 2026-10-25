import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { assetBySlug, assetLibrary } from '@/data/assets';
import { apiFetch } from '@/lib/api';
import { archetypes, LEGACY_SURFACE_FOR_ARCHETYPE, planningProfiles } from '@/creative/archetypes';
import type { GardenTemplate } from '@/data/templates';
import { ASSET_PHYSICS_ENABLED, CAMPAIGN_ENABLED, ENV_CLIMATE_ENABLED, ENV_RECORDS_ENABLED } from '@/lib/featureFlags';
import { clearEnvironmentPlanting } from '@/lib/campaign';
import { layoutWithinBounds } from './layoutEditing';
import {
  canPlantAt,
  cellKey,
  clampPlan,
  companionSetsFor,
  computeStats,
  conflictCellSet,
  createDefaultPlan,
  findPairings,
  parseKey,
  planCols,
  planRows,
  spacingViolationSet,
  type PlanPairing,
  type PlanStats,
} from '@/lib/plan';
import { growingTargetKey, planForTarget, planWithTarget } from '@/lib/growingTargets';
import { drawPlan, renderPlanToPng, type RenderOptions, type SimOverlayChannels } from '@/lib/renderPlan';
import { isInputCaptured } from '@/lib/inputArbiter';
import { useFarm } from '@/hooks/useFarms';
import { useTheme } from '@/hooks/useTheme';
import type {
  CreateEnvironmentInput,
  Crop,
  Environment,
  GardenAsset,
  GrowingTargetKey,
  GrowingTargetRef,
  PlanState,
  PlanSurface,
  SitePlan,
} from '@/types';

export type Tool = 'select' | 'brush' | 'rect' | 'asset' | 'erase' | 'pick' | 'fill' | 'line';
export type BrushSize = 1 | 3 | 5;
export type EraseLayer = 'plants' | 'ground' | 'equipment';
export type RectMode = 'plants' | 'asset' | 'erase';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type EditorScope = { kind: 'legacy' } | { kind: 'site' } | { kind: 'env'; id: string };

type HistoryEntry =
  | { kind: 'environment'; id: string; snapshot: Environment; target?: GrowingTargetRef }
  | { kind: 'site'; snapshot: SitePlan; selectedEnvironmentId: string | null }
  | { kind: 'legacy'; snapshot: PlanState };

function cloneEnvironment(environment: Environment): Environment {
  return structuredClone(environment);
}

function cloneSite(site: SitePlan): SitePlan {
  return structuredClone(site);
}

function emptySite(farmId: number): SitePlan {
  return { farmId, widthM: 12, heightM: 8, cellM: 0.25, environments: [], updatedAt: new Date().toISOString() };
}

function assetAllowedOnEnvironment(asset: GardenAsset, environment: Environment): boolean {
  const archetype = archetypes[environment.archetype];
  if (asset.physics && !ASSET_PHYSICS_ENABLED) return false;
  if (asset.slug === 'plant-rack' && !archetype.tierPlanningAvailable) return false;
  if (!archetype.palette.includes(asset.category)) return false;
  return !asset.surfaces || asset.surfaces.includes(LEGACY_SURFACE_FOR_ARCHETYPE[environment.archetype]);
}

function cellOverlapsReservedArea(environment: Environment, key: string): boolean {
  const layout = environment.layout;
  if (!layout) return false;
  const [x, y] = parseKey(key);
  const x0 = x * environment.cellM;
  const y0 = y * environment.cellM;
  const x1 = x0 + environment.cellM;
  const y1 = y0 + environment.cellM;
  for (const reservation of layout.reservations) {
    if (x0 < reservation.x + reservation.widthM && x1 > reservation.x &&
        y0 < reservation.y + reservation.depthM && y1 > reservation.y) return true;
  }
  const strip = environment.cellM;
  for (const access of layout.access) {
    if (access.edge === 'north' && y0 < strip && x0 < access.offsetM + access.widthM && x1 > access.offsetM) return true;
    if (access.edge === 'south' && y1 > environment.heightM - strip && x0 < access.offsetM + access.widthM && x1 > access.offsetM) return true;
    if (access.edge === 'west' && x0 < strip && y0 < access.offsetM + access.widthM && y1 > access.offsetM) return true;
    if (access.edge === 'east' && x1 > environment.widthM - strip && y0 < access.offsetM + access.widthM && y1 > access.offsetM) return true;
  }
  return false;
}

function cellOverlapsRack(environment: Environment, key: string): boolean {
  const [x, y] = parseKey(key);
  const cell = { x: x * environment.cellM, y: y * environment.cellM, widthM: environment.cellM, depthM: environment.cellM };
  return (environment.layout?.growingSpaces ?? []).some((space) =>
    space.kind === 'rack' && rectangleOverlaps(cell, space),
  );
}

function instanceAtTargetCell(environment: Environment, key: string, target: GrowingTargetRef) {
  const [column, row] = parseKey(key);
  const x = column * environment.cellM;
  const y = row * environment.cellM;
  const cell = { x, y, widthM: environment.cellM, depthM: environment.cellM };
  for (let index = (environment.instances?.length ?? 0) - 1; index >= 0; index--) {
    const instance = environment.instances![index]!;
    const mount = instance.mount;
    const visible = mount.kind === 'environment' ||
      (target.kind === 'floor' && mount.kind === 'floor') ||
      (target.kind === 'growing-level' && mount.kind === 'growing-level' &&
        mount.growingSpaceId === target.growingSpaceId && mount.levelId === target.levelId);
    if (visible && rectangleOverlaps(cell, instance)) return instance;
  }
  return null;
}

function rectangleOverlaps(a: { x: number; y: number; widthM: number; depthM: number }, b: { x: number; y: number; widthM: number; depthM: number }): boolean {
  return a.x < b.x + b.widthM && a.x + a.widthM > b.x &&
    a.y < b.y + b.depthM && a.y + a.depthM > b.y;
}

function instanceOverlapsReservedArea(environment: Environment, item: NonNullable<Environment['instances']>[number]): boolean {
  if (item.mount.kind !== 'floor' || !environment.layout) return false;
  const x0 = item.x;
  const y0 = item.y;
  const x1 = x0 + item.widthM;
  const y1 = y0 + item.depthM;
  if (environment.layout.reservations.some((r) => x0 < r.x + r.widthM && x1 > r.x && y0 < r.y + r.depthM && y1 > r.y)) return true;
  return environment.layout.access.some((a) => {
    const strip = environment.cellM;
    if (a.edge === 'north') return y0 < strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM;
    if (a.edge === 'south') return y1 > environment.heightM - strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM;
    if (a.edge === 'west') return x0 < strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM;
    return x1 > environment.widthM - strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM;
  });
}

export function canPlantInEnvironment(
  environment: Environment,
  key: string,
  plan = environment.plan,
  target: GrowingTargetRef = { kind: 'floor' },
): boolean {
  if (target.kind === 'floor') {
    if (cellOverlapsReservedArea(environment, key)) return false;
    if (cellOverlapsRack(environment, key)) return false;
    if (canPlantAt(plan, key)) return true;
    const [x, y] = parseKey(key);
    const x0 = x * environment.cellM;
    const y0 = y * environment.cellM;
    return (environment.instances ?? []).some((instance) => {
      if (instance.mount.kind !== 'floor' || assetBySlug(instance.slug)?.physics?.kind !== 'soilless') return false;
      return x0 >= instance.x && y0 >= instance.y &&
        x0 + environment.cellM <= instance.x + instance.widthM &&
        y0 + environment.cellM <= instance.y + instance.depthM;
    });
  }
  const space = environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
  const level = space?.levels.find((entry) => entry.id === target.levelId);
  if (!space || !level) return false;
  const [x, y] = parseKey(key);
  const x0 = x * environment.cellM;
  const y0 = y * environment.cellM;
  return x0 >= space.x && y0 >= space.y &&
    x0 + environment.cellM <= space.x + space.widthM &&
    y0 + environment.cellM <= space.y + space.depthM;
}

export interface Viewport {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  viewW: number;
  viewH: number;
}

// Ghost preview payload for rect drags; `kind`/`cells` are additive for the
// line-tool variant (Bresenham cells precomputed at set time).
export interface RectPreview {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  kind?: 'rect' | 'line';
  cells?: Array<[number, number]>;
}

interface DragState {
  kind: 'paint' | 'rect' | 'line' | 'pan' | 'gesture' | null;
  before: PlanState | null;
  beforeEnvironment?: Environment;
  targetBefore?: GrowingTargetRef;
  environmentChanged?: boolean;
  changed: boolean;
  startX: number;
  startY: number;
  panClientX: number;
  panClientY: number;
  panOffsetX: number;
  panOffsetY: number;
}

const ZOOM_LEVELS = [4, 8, 12, 18, 26, 36];
const ZOOM_BASE_PX = 12; // reference for the zoom-percentage display
const MIN_FIT_PX = 6; // P0-3: fit-to-view never drops below legible mobile floor
const MIN_DIM_M = 2;
const MAX_DIM_M = 60;
const AUTOSAVE_MS = 600;
const HISTORY_LIMIT = 50;
const FLOOD_CAP = 5000; // P1-2: fill tool safety ceiling
let assetInstanceSequence = 0;
/** Audit DES-009: fills larger than this ask for confirmation — replacing
 * hundreds of cells on one unconfirmed click is more destructive than a
 * template apply, which already confirms. */
export const FILL_CONFIRM_THRESHOLD = 100;
const BRUSH_SIZES: BrushSize[] = [1, 3, 5];
const ERASE_GHOST_COLOR = '#ef4444';

function editorId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}:${uuid ?? `${Date.now().toString(36)}-${++assetInstanceSequence}`}`;
}

const PREF_KEYS = {
  overlaySpacing: 'ff-pro:overlay-spacing',
  overlayCompanions: 'ff-pro:overlay-companions',
  layerPlants: 'ff-pro:layer-plants',
  layerGround: 'ff-pro:layer-ground',
} as const;

function readPref(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    return value === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage unavailable (private mode etc.) — preference stays session-local.
  }
}

// -------------------------------------------------------------------------------

const clonePlan = (plan: PlanState): PlanState => ({
  ...plan,
  planting: { ...plan.planting },
  ground: { ...plan.ground },
  ...(plan.targets ? { targets: Object.fromEntries(Object.entries(plan.targets).map(([key, target]) => [key, {
    ...target,
    planting: { ...target.planting },
    ...(target.plantedAt ? { plantedAt: { ...target.plantedAt } } : {}),
  }])) } : {}),
  ...(plan.plantedAt ? { plantedAt: { ...plan.plantedAt } } : {}),
});

const stampPlantedAt = (plan: PlanState, key: string) => {
  if (!plan.plantedAt) plan.plantedAt = {};
  plan.plantedAt[key] = new Date().toISOString();
};

const clearPlantedAt = (plan: PlanState, key: string) => {
  if (plan.plantedAt) delete plan.plantedAt[key];
};

const clampMeters = (value: number) => Math.min(MAX_DIM_M, Math.max(MIN_DIM_M, value));

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function footprintCells(asset: GardenAsset, plan: PlanState) {
  return {
    cols: Math.max(1, Math.round(asset.defaultWM / plan.cellM)),
    rows: Math.max(1, Math.round(asset.defaultHM / plan.cellM)),
  };
}

function stripInvalidPlants(plan: PlanState): PlanState {
  const planting = { ...plan.planting };
  const plantedAt = plan.plantedAt ? { ...plan.plantedAt } : undefined;
  for (const key of Object.keys(planting)) {
    if (!canPlantAt({ ...plan, planting }, key)) {
      delete planting[key];
      if (plantedAt) delete plantedAt[key];
    }
  }
  return { ...plan, planting, ...(plantedAt ? { plantedAt } : {}) };
}

function pruneTargetsForLayout(plan: PlanState, layout: Environment['layout']): PlanState {
  if (!plan.targets) return plan;
  const cols = planCols(plan);
  const rows = planRows(plan);
  const targets: NonNullable<PlanState['targets']> = {};
  for (const [key, targetPlan] of Object.entries(plan.targets)) {
    const space = layout?.growingSpaces.find((entry) => entry.id === targetPlan.growingSpaceId);
    if (!space || !space.levels.some((level) => level.id === targetPlan.levelId)) continue;
    const planting: Record<string, number> = {};
    const plantedAt: Record<string, string> = {};
    for (const [cell, cropId] of Object.entries(targetPlan.planting)) {
      const [x, y] = parseKey(cell);
      const x0 = x * plan.cellM;
      const y0 = y * plan.cellM;
      if (x < 0 || y < 0 || x >= cols || y >= rows ||
          x0 < space.x || y0 < space.y || x0 + plan.cellM > space.x + space.widthM || y0 + plan.cellM > space.y + space.depthM) continue;
      planting[cell] = cropId;
      if (targetPlan.plantedAt?.[cell]) plantedAt[cell] = targetPlan.plantedAt[cell]!;
    }
    if (Object.keys(planting).length > 0) {
      targets[key] = {
        ...targetPlan,
        planting,
        ...(Object.keys(plantedAt).length > 0 ? { plantedAt } : {}),
      };
    }
  }
  return { ...plan, ...(Object.keys(targets).length > 0 ? { targets } : { targets: undefined }) };
}

function cropCellCount(plan: PlanState): number {
  return Object.keys(plan.planting).length + Object.values(plan.targets ?? {}).reduce((total, target) => total + Object.keys(target.planting).length, 0);
}

function sameCell(a: string | null, b: string | null) {
  return a === b;
}

// P1-3: integer Bresenham walk, inclusive of both endpoints.
export function bresenhamCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
  return cells;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Fall direct-sow window relative to FIRST frost, as a category-level
 * heuristic over existing catalog fields (no per-crop data): only
 * cool-tolerant crops that can mature within a single fall season qualify.
 * Formula: sow ceil(growthDays/7)+2 weeks before first frost so harvest
 * lands just ahead of the freeze. Warm-season (tender) crops, heat-lovers,
 * and slow overwinter/perennial crops return null.
 */
export function fallSowWeeksBeforeFirstFrost(crop: Crop): number | null {
  // Catalog minTempC values jump from 7 (hardy greens/roots) to 10 (tender
  // warm-season); 8 sits in the gap.
  if (crop.minTempC > 8) return null;
  // Heat-lovers (ceiling > 30°C) stress or bolt in fall beds.
  if (crop.maxTempC > 30) return null;
  // Must mature before frost — overwinter/perennial crops (garlic, rye,
  // wheat, fruit) are out of scope for this formula.
  if (crop.growthDays > 120) return null;
  return Math.ceil(crop.growthDays / 7) + 2;
}

/** Human-readable sow window for a crop (CSV export + SelectionPanel inspector). */
export function sowWindow(crop: Crop): string {
  const parts: string[] = [];
  if (crop.sowIndoorsWeeksBeforeLastFrost !== null && crop.sowIndoorsWeeksBeforeLastFrost !== undefined) {
    parts.push(`${crop.sowIndoorsWeeksBeforeLastFrost}w before frost indoors`);
  }
  if (crop.transplantWeeksAfterLastFrost !== null && crop.transplantWeeksAfterLastFrost !== undefined) {
    parts.push(`${crop.transplantWeeksAfterLastFrost}w after frost transplant`);
  }
  if (crop.directSowStartWeeks !== null && crop.directSowStartWeeks !== undefined) {
    parts.push(`${crop.directSowStartWeeks}-${crop.directSowEndWeeks ?? crop.directSowStartWeeks}w after frost direct`);
  }
  const fallWeeks = fallSowWeeksBeforeFirstFrost(crop);
  if (fallWeeks !== null) {
    parts.push(`fall: sow ${fallWeeks}w before first frost`);
  }
  return parts.join('; ') || 'Not specified';
}

export const DESIGNER_CONSTANTS = {
  ZOOM_LEVELS,
  MIN_DIM_M,
  MAX_DIM_M,
};

export function usePlanEditor(farmId: number) {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { data: farm, isLoading: farmLoading } = useFarm(farmId);
  const { data: crops = [], isLoading: cropsLoading } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });
  const { data: storedPlan, isLoading: planLoading } = useQuery<PlanState | null>({
    queryKey: ['plan', farmId],
    queryFn: () => apiFetch.getPlan(farmId),
    enabled: !ENV_RECORDS_ENABLED,
  });
  const { data: storedSite, isLoading: siteLoading } = useQuery<SitePlan | null>({
    queryKey: ['site-plan', farmId],
    queryFn: () => apiFetch.getSitePlan(farmId),
    enabled: ENV_RECORDS_ENABLED,
  });
  const { data: storedSelection, isLoading: selectionLoading } = useQuery<string | null>({
    queryKey: ['selected-environment', farmId],
    queryFn: () => apiFetch.getSelectedEnvironmentId(farmId),
    enabled: ENV_RECORDS_ENABLED,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  /** Selected target adapter consumed by the 2D editor; its plan maps remain canonical in canonicalPlanRef. */
  const planRef = useRef<PlanState | null>(null);
  const canonicalPlanRef = useRef<PlanState | null>(null);
  const siteRef = useRef<SitePlan | null>(null);
  const environmentRef = useRef<Environment | null>(null);
  const activeTargetRef = useRef<GrowingTargetRef>({ kind: 'floor' });
  const scopeRef = useRef<EditorScope>(ENV_RECORDS_ENABLED ? { kind: 'site' } : { kind: 'legacy' });
  const viewportRef = useRef<Viewport>({ cellPx: 12, offsetX: 24, offsetY: 24, viewW: 800, viewH: 520 });
  const dragRef = useRef<DragState>({
    kind: null,
    before: null,
    changed: false,
    startX: 0,
    startY: 0,
    panClientX: 0,
    panClientY: 0,
    panOffsetX: 0,
    panOffsetY: 0,
  });
  const didInitialFitRef = useRef(false);
  // Last cell a paint gesture stamped (audit DES-002): pointermove samples can
  // skip cells at high zoom, so strokes interpolate between samples.
  const lastPaintRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ environmentId: string | null; plan: PlanState } | null>(null);
  const environmentMutationRef = useRef<Promise<Environment> | null>(null);
  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const spaceHeldRef = useRef(false);
  const canvasFocusedRef = useRef(false);
  const initializedFarmRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [activeCropId, setActiveCropId] = useState<number | null>(null);
  const [activeAssetSlug, setActiveAssetSlug] = useState(assetLibrary[0]?.slug ?? '');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [eraseLayer, setEraseLayer] = useState<EraseLayer>('plants');
  const [rectMode, setRectMode] = useState<RectMode>('plants');
  const [cropSearch, setCropSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [rectPreview, setRectPreview] = useState<RectPreview | null>(null);
  const [lineDraft, setLineDraft] = useState<{ x: number; y: number } | null>(null);
  // DES-009: oversized fills wait here for the PlotDesigner confirm dialog.
  const [pendingFill, setPendingFill] = useState<{ region: Array<[number, number]> } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<EditorScope>(ENV_RECORDS_ENABLED ? { kind: 'site' } : { kind: 'legacy' });
  const [sitePlan, setSitePlan] = useState<SitePlan | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [activeTarget, setActiveTarget] = useState<GrowingTargetRef>({ kind: 'floor' });
  const [rackTierCount, setRackTierCount] = useState(4);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [staleSelectionId, setStaleSelectionId] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [pendingResize, setPendingResize] = useState<{ widthM: number; heightM: number; crops: number; ground: number; equipment: number } | null>(null);
  const [stats, setStats] = useState<PlanStats | null>(null);
  const [pairings, setPairings] = useState<PlanPairing[]>([]);
  const [planVersion, setPlanVersion] = useState(0);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftWidth, setDraftWidth] = useState(20);
  const [draftHeight, setDraftHeight] = useState(12);
  const [draftAllowOutsideBeds, setDraftAllowOutsideBeds] = useState(true);
  const [draftSurface, setDraftSurface] = useState<PlanSurface>('outdoor');
  // P0-4: interaction cursors derive from STATE so re-renders track them live.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // P0-5 / P1-7 / P1-8: overlay + layer visibility preferences (localStorage-backed).
  const [showSpacing, setShowSpacing] = useState(() => readPref(PREF_KEYS.overlaySpacing, true));
  const [showCompanions, setShowCompanions] = useState(() => readPref(PREF_KEYS.overlayCompanions, false));
  const [showPlants, setShowPlants] = useState(() => readPref(PREF_KEYS.layerPlants, true));
  const [showGround, setShowGround] = useState(() => readPref(PREF_KEYS.layerGround, true));
  // Sim-run 2D overlays (SPEC-GROWTH-VISUAL wave 5): transient (not pref-
  // backed — they only mean something while a run is active). The channel
  // data is pushed in by PlotDesigner (which owns the run controller) via
  // setSimChannels; toggles gate which channels reach the canvas.
  const [showSimMoisture, setShowSimMoisture] = useState(false);
  const [showSimStress, setShowSimStress] = useState(false);
  const [showSimReady, setShowSimReady] = useState(false);
  const [simChannels, setSimChannels] = useState<SimOverlayChannels | undefined>(undefined);

  scopeRef.current = scope;
  siteRef.current = sitePlan;
  environmentRef.current = environment;
  activeTargetRef.current = activeTarget;

  const syncCanonicalPlan = useCallback((viewPlan: PlanState) => {
    if (ENV_RECORDS_ENABLED && scopeRef.current.kind === 'env' && environmentRef.current) {
      const current = environmentRef.current;
      const canonical = planWithTarget(current.plan, activeTargetRef.current, viewPlan);
      canonicalPlanRef.current = canonical;
      const updated = { ...current, plan: canonical };
      environmentRef.current = updated;
      setEnvironment(updated);
      return canonical;
    }
    canonicalPlanRef.current = viewPlan;
    return viewPlan;
  }, []);

  const canPaintCrop = useCallback((key: string, plan = planRef.current) => {
    if (!plan) return false;
    if (!ENV_RECORDS_ENABLED || scopeRef.current.kind === 'legacy') return canPlantAt(plan, key);
    const activeEnvironment = environmentRef.current;
    if (activeTargetRef.current.kind === 'growing-level' && !ASSET_PHYSICS_ENABLED) return false;
    return !!activeEnvironment && canPlantInEnvironment(activeEnvironment, key, plan, activeTargetRef.current);
  }, []);

  const assetAllowed = useCallback((asset: GardenAsset, plan = planRef.current) => {
    if (!plan) return false;
    if (!ENV_RECORDS_ENABLED || scopeRef.current.kind === 'legacy') {
      return !asset.surfaces || asset.surfaces.includes(plan.surface ?? 'outdoor');
    }
    const activeEnvironment = environmentRef.current;
    return !!activeEnvironment && assetAllowedOnEnvironment(asset, activeEnvironment);
  }, []);

  const usableHeightM = environment?.layout?.usableHeightM ?? (environment ? archetypes[environment.archetype].defaultUsableHeightM ?? 2.4 : 2.4);
  const maxRackTiers = Math.max(1, Math.min(8, Math.floor((usableHeightM - 0.7) / 0.45) + 1));
  const assetValidAt = useCallback((asset: GardenAsset, x: number, y: number, plan = planRef.current) => {
    if (!plan || !assetAllowed(asset, plan)) return false;
    if (!ENV_RECORDS_ENABLED || scopeRef.current.kind !== 'env') return true;
    const activeEnvironment = environmentRef.current;
    if (!activeEnvironment) return false;
    if (asset.physics && !ASSET_PHYSICS_ENABLED) return false;
    const fp = footprintCells(asset, plan);
    if (x < 0 || y < 0 || x + fp.cols > planCols(plan) || y + fp.rows > planRows(plan)) return false;
    const target = activeTargetRef.current;
    if (asset.physics?.kind === 'rack' && (target.kind !== 'floor' || rackTierCount > maxRackTiers)) return false;
    if (target.kind === 'growing-level') {
      const space = activeEnvironment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
      if (!space) return false;
      const x0 = x * plan.cellM;
      const y0 = y * plan.cellM;
      if (x0 < space.x || y0 < space.y || x0 + fp.cols * plan.cellM > space.x + space.widthM || y0 + fp.rows * plan.cellM > space.y + space.depthM) return false;
    } else {
      const footprint = { x: x * plan.cellM, y: y * plan.cellM, widthM: fp.cols * plan.cellM, depthM: fp.rows * plan.cellM };
      if (asset.physics?.kind !== 'light' && (activeEnvironment.layout?.growingSpaces ?? []).some((space) =>
        space.kind === 'rack' && rectangleOverlaps(footprint, space),
      )) return false;
      for (let yy = y; yy < y + fp.rows; yy++) {
        for (let xx = x; xx < x + fp.cols; xx++) {
          if (cellOverlapsReservedArea(activeEnvironment, cellKey(xx, yy))) return false;
          if ((asset.physics?.kind === 'rack' || asset.physics?.kind === 'soilless') &&
              (plan.planting[cellKey(xx, yy)] !== undefined || plan.ground[cellKey(xx, yy)] !== undefined)) return false;
        }
      }
      if (asset.physics?.kind === 'rack') {
        const footprint = { x: x * plan.cellM, y: y * plan.cellM, widthM: asset.defaultWM, depthM: asset.defaultHM };
        if ((activeEnvironment.instances ?? []).some((instance) => instance.mount.kind === 'floor' && rectangleOverlaps(footprint, instance))) return false;
      }
    }
    return true;
  }, [assetAllowed, maxRackTiers, rackTierCount, usableHeightM]);

  const cropById = useMemo(() => new Map(crops.map((crop) => [crop.id, crop])), [crops]);
  const activeCrop = activeCropId ? cropById.get(activeCropId) ?? null : null;
  const activeAsset = assetBySlug(activeAssetSlug) ?? assetLibrary[0];
  const conflictCells = useMemo(() => conflictCellSet(pairings), [pairings]);
  const targetOptions = useMemo(() => [
    { key: growingTargetKey({ kind: 'floor' }), target: { kind: 'floor' } as GrowingTargetRef, label: 'Floor' },
    ...(environment?.layout?.growingSpaces.flatMap((space) => space.levels.map((level) => ({
      key: growingTargetKey({ kind: 'growing-level', growingSpaceId: space.id, levelId: level.id }),
      target: { kind: 'growing-level', growingSpaceId: space.id, levelId: level.id } as GrowingTargetRef,
      label: `${space.label} · ${level.label}`,
    }))) ?? []),
  ], [environment]);
  const activeTargetKey = growingTargetKey(activeTarget);
  const activeTargetLabel = targetOptions.find((option) => option.key === activeTargetKey)?.label ?? 'Floor';
  const placementMessage = useMemo(() => {
    if (!ENV_RECORDS_ENABLED || scope.kind !== 'env' || !environment || !hoverKey) return null;
    if (tool === 'brush' && activeCrop && !canPaintCrop(hoverKey)) {
      if (activeTarget.kind === 'growing-level' && !ASSET_PHYSICS_ENABLED) return 'Tier planting is unavailable while asset physics is off.';
      if (cellOverlapsReservedArea(environment, hoverKey)) return 'This cell is reserved for access, an aisle or service space.';
      if (cellOverlapsRack(environment, hoverKey)) return 'This floor cell is occupied by a rack. Choose one of its growing tiers to plant.';
      const groundSlug = planRef.current?.ground[hoverKey];
      const groundAsset = groundSlug ? assetBySlug(groundSlug) : undefined;
      if (groundSlug && !groundAsset?.plantable) return `${groundAsset?.label ?? 'This floor asset'} cannot accept crops.`;
      return 'Place a compatible bed, bench or hydro surface, or enable planting outside beds in Settings.';
    }
    if (tool === 'asset' && activeAsset) {
      const [x, y] = parseKey(hoverKey);
      if (activeAsset.physics && !ASSET_PHYSICS_ENABLED) return 'Physics-enabled equipment editing is off.';
      if (activeAsset.slug === 'plant-rack' && environment.archetype && !archetypes[environment.archetype].tierPlanningAvailable) {
        return 'Rack and tier editing is not available in this world yet.';
      }
      if (!assetAllowed(activeAsset)) return `${activeAsset.label} is not available for this world type.`;
      if (!assetValidAt(activeAsset, x, y)) {
        const footprint = footprintCells(activeAsset, planRef.current!);
        const rectangle = { x: x * environment.cellM, y: y * environment.cellM, widthM: footprint.cols * environment.cellM, depthM: footprint.rows * environment.cellM };
        if (activeTarget.kind === 'floor' && activeAsset.physics?.kind !== 'light' && (environment.layout?.growingSpaces ?? []).some((space) =>
          space.kind === 'rack' && rectangleOverlaps(rectangle, space),
        )) return 'This floor footprint is occupied by a rack; choose a tier to place level-mounted equipment.';
        return 'The full equipment footprint must fit outside reserved areas.';
      }
    }
    if (tool === 'erase' && eraseLayer === 'equipment' && ASSET_PHYSICS_ENABLED) {
      const instance = instanceAtTargetCell(environment, hoverKey, activeTarget);
      if (instance?.slug === 'plant-rack') return 'Remove this rack from Growing systems so its crop loss is previewed first.';
      if (!instance) return 'Point at an installed equipment item to erase it.';
    }
    return null;
  }, [activeAsset, activeCrop, activeTarget, assetAllowed, assetValidAt, canPaintCrop, environment, eraseLayer, hoverKey, scope.kind, tool]);

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim().toLowerCase();
    if (!q) return crops;
    return crops.filter((crop) =>
      crop.name.toLowerCase().includes(q) ||
      crop.category.toLowerCase().includes(q) ||
      (crop.family ?? '').toLowerCase().includes(q),
    );
  }, [cropSearch, crops]);

  const selectedInfo = useMemo(() => {
    const plan = planRef.current;
    if (!plan || !selectedKey) return null;
    const crop = plan.planting[selectedKey] ? cropById.get(plan.planting[selectedKey]) ?? null : null;
    const asset = plan.ground[selectedKey] ? assetBySlug(plan.ground[selectedKey]) ?? null : null;
    const instance = ENV_RECORDS_ENABLED && environmentRef.current
      ? instanceAtTargetCell(environmentRef.current, selectedKey, activeTargetRef.current)
      : null;
    const [x, y] = parseKey(selectedKey);
    const nearby = new Map<number, Crop>();
    if (crop) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nearbyId = plan.planting[cellKey(x + dx, y + dy)];
          const nearbyCrop = nearbyId ? cropById.get(nearbyId) : null;
          if (nearbyCrop && nearbyCrop.id !== crop.id) nearby.set(nearbyCrop.id, nearbyCrop);
        }
      }
    }
    const nearbyCrops = [...nearby.values()];
    const companions = nearbyCrops.filter((nearbyCrop) => nearbyCrop.slug && crop?.companions?.includes(nearbyCrop.slug));
    const antagonists = nearbyCrops.filter((nearbyCrop) => nearbyCrop.slug && crop?.antagonists?.includes(nearbyCrop.slug));
    return {
      x,
      y,
      crop,
      asset,
      instance,
      instanceAsset: instance ? assetBySlug(instance.slug) ?? null : null,
      plantable: canPaintCrop(selectedKey, plan),
      companions,
      antagonists,
    };
  }, [activeTarget, canPaintCrop, cropById, environment, planVersion, selectedKey]);

  // P0-5: spacing-violation overlay source set, recomputed only when the plan,
  // the catalog map, or the toggle changes.
  const spacingViolations = useMemo(() => {
    if (!showSpacing) return null;
    const plan = planRef.current;
    if (!plan) return null;
    return spacingViolationSet(plan, cropById);
  }, [cropById, planVersion, showSpacing]);

  // P1-7: companion halos for the active crop, falling back to the selected
  // cell's crop when no palette crop is active.
  const companionHalos = useMemo(() => {
    if (!showCompanions) return null;
    const plan = planRef.current;
    if (!plan) return null;
    const fallbackCropId = selectedKey ? plan.planting[selectedKey] : undefined;
    const cropId = activeCropId ?? fallbackCropId;
    if (cropId === undefined || cropId === null) return null;
    return companionSetsFor(cropId, plan);
  }, [activeCropId, planVersion, selectedKey, showCompanions]);

  // P0-1 / P1-3: ghost preview cells — brush square, asset footprint, erase
  // targets, or the in-flight Bresenham line draft.
  const ghost = useMemo(() => {
    if (isPanning || spaceHeld) return null;
    const plan = planRef.current;
    if (!plan) return null;
    const cols = planCols(plan);
    const rows = planRows(plan);
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;

    if (lineDraft && hoverKey) {
      const [hx, hy] = parseKey(hoverKey);
      const cells = bresenhamCells(lineDraft.x, lineDraft.y, hx, hy)
        .filter(([x, y]) => inBounds(x, y));
      if (cells.length > 0) {
        const color = rectMode === 'erase'
          ? ERASE_GHOST_COLOR
          : rectMode === 'asset'
            ? activeAsset?.colorHex ?? ERASE_GHOST_COLOR
            : activeCrop?.colorHex ?? '#22c55e';
        return { cells, colorHex: color };
      }
    }

    if (!hoverKey) return null;
    const [hx, hy] = parseKey(hoverKey);
    const squareCells = (size: BrushSize) => {
      const half = Math.floor(size / 2);
      const cells: Array<[number, number]> = [];
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (inBounds(hx + dx, hy + dy)) cells.push([hx + dx, hy + dy]);
        }
      }
      return cells;
    };

    if (tool === 'brush' && activeCrop) {
      // Truthful preview (audit DES-001): the mutation path silently rejects
      // non-plantable cells (canPlantAt), so the ghost must not promise paint
      // there — an empty ghost renders nothing and the no-op click is
      // self-explanatory instead of a silent failure.
      const cells = squareCells(brushSize).filter(([x, y]) => canPaintCrop(cellKey(x, y), plan));
      return { cells, colorHex: activeCrop.colorHex };
    }
    if (tool === 'asset' && activeAsset) {
      const fp = footprintCells(activeAsset, plan);
      const cells: Array<[number, number]> = [];
      for (let y = hy; y < hy + fp.rows; y++) {
        for (let x = hx; x < hx + fp.cols; x++) {
          if (inBounds(x, y)) cells.push([x, y]);
        }
      }
      return { cells, colorHex: assetValidAt(activeAsset, hx, hy, plan) ? activeAsset.colorHex : ERASE_GHOST_COLOR };
    }
    if (tool === 'erase') {
      return { cells: squareCells(brushSize), colorHex: ERASE_GHOST_COLOR };
    }
    return null;
  }, [activeAsset, activeCrop, assetValidAt, brushSize, canPaintCrop, hoverKey, isPanning, lineDraft, planVersion, rectMode, spaceHeld, tool]);

  const updateStats = useCallback((plan: PlanState) => {
    setStats(computeStats(plan, crops));
    setPairings(findPairings(plan, crops));
  }, [crops]);

  const overlayOpts = useMemo(
    () => ({
      ghost,
      spacingViolations,
      companionHalos,
      layers: { plants: showPlants, ground: showGround },
      // Sim overlays stay OFF unless toggled AND channels were pushed in.
      simMoisture: showSimMoisture ? simChannels?.moisture ?? null : null,
      simStress: showSimStress ? simChannels?.stress ?? null : null,
      simReady: showSimReady ? simChannels?.ready ?? null : null,
    }),
    [companionHalos, ghost, showGround, showPlants, spacingViolations, showSimMoisture, showSimStress, showSimReady, simChannels],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const plan = planRef.current;
    if (!canvas || !plan) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const viewport = viewportRef.current;
    // Ghost/overlays thread through the INTERACTIVE redraw only; PNG export
    // builds its own options inside renderPlanToPng and never sees them.
    const opts: RenderOptions = {
      ...viewport,
      cropById,
      conflictCells,
      hoverKey,
      rectPreview,
      theme,
      surface: environment?.archetype ? LEGACY_SURFACE_FOR_ARCHETYPE[environment.archetype] : plan.surface ?? 'outdoor',
      ...(environment ? { background: archetypes[environment.archetype].bg } : {}),
      ...overlayOpts,
    };
    drawPlan(ctx, plan, opts);
  }, [conflictCells, cropById, environment, hoverKey, overlayOpts, rectPreview, theme]);

  const fitToView = useCallback(() => {
    const plan = planRef.current;
    if (!plan) return;
    const viewport = viewportRef.current;
    const cols = Math.max(1, planCols(plan));
    const rows = Math.max(1, planRows(plan));
    const fitPx = Math.max(MIN_FIT_PX, Math.min((viewport.viewW - 48) / cols, (viewport.viewH - 48) / rows));
    const level = ZOOM_LEVELS.reduce((best, levelPx) =>
      Math.abs(levelPx - fitPx) < Math.abs(best - fitPx) ? levelPx : best,
    ZOOM_LEVELS[0]);
    const cellPx = Math.max(MIN_FIT_PX, Math.min(36, Math.min(level, fitPx)));
    viewportRef.current = {
      ...viewport,
      cellPx,
      // Centered offsets: when the floored zoom makes the plan overflow the
      // viewport, offsets go negative symmetrically so overflow is centered.
      offsetX: Math.round((viewport.viewW - cols * cellPx) / 2),
      offsetY: Math.round((viewport.viewH - rows * cellPx) / 2),
    };
    setViewportVersion((v) => v + 1);
  }, []);

  // P0-2: single zoom primitive — every entry point (wheel, buttons, reset)
  // anchors through this so the math is identical by construction.
  const applyZoom = useCallback((nextCellPx: number, anchorX?: number, anchorY?: number) => {
    const viewport = viewportRef.current;
    const oldCellPx = viewport.cellPx;
    if (nextCellPx === oldCellPx || nextCellPx <= 0) return;
    const canvas = canvasRef.current;
    const px = anchorX ?? (canvas ? canvas.width / 2 : viewport.viewW / 2);
    const py = anchorY ?? (canvas ? canvas.height / 2 : viewport.viewH / 2);
    const worldX = (px - viewport.offsetX) / oldCellPx;
    const worldY = (py - viewport.offsetY) / oldCellPx;
    viewportRef.current = {
      ...viewport,
      cellPx: nextCellPx,
      offsetX: px - worldX * nextCellPx,
      offsetY: py - worldY * nextCellPx,
    };
    setViewportVersion((v) => v + 1);
  }, []);

  const stepZoomLadder = useCallback((direction: 1 | -1, anchorX?: number, anchorY?: number) => {
    const oldCellPx = viewportRef.current.cellPx;
    let oldIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    ZOOM_LEVELS.forEach((levelPx, index) => {
      const distance = Math.abs(levelPx - oldCellPx);
      if (distance < bestDistance) {
        bestDistance = distance;
        oldIndex = index;
      }
    });
    const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, oldIndex + direction));
    const nextCellPx = ZOOM_LEVELS[nextIndex];
    if (nextCellPx === oldCellPx) return;
    applyZoom(nextCellPx, anchorX, anchorY);
  }, [applyZoom]);

  const zoomIn = useCallback(() => stepZoomLadder(1), [stepZoomLadder]);
  const zoomOut = useCallback(() => stepZoomLadder(-1), [stepZoomLadder]);
  const zoomReset = useCallback(() => applyZoom(ZOOM_BASE_PX), [applyZoom]);
  const zoomFit = fitToView;

  const updateSiteCache = useCallback((nextSite: SitePlan | null) => {
    const copy = nextSite ? cloneSite(nextSite) : null;
    siteRef.current = copy;
    setSitePlan(copy);
    queryClient.setQueryData(['site-plan', farmId], copy);
  }, [farmId, queryClient]);

  const applySavedPlan = useCallback((environmentId: string | null, saved: PlanState) => {
    if (environmentId === null) {
      canonicalPlanRef.current = saved;
      queryClient.setQueryData(['plan', farmId], saved);
      if (scopeRef.current.kind === 'legacy' && !dragRef.current.kind) planRef.current = clonePlan(saved);
      return;
    }
    queryClient.setQueryData(['plan', farmId, environmentId], saved);
    const site = siteRef.current;
    if (!site) return;
    const source = site.environments.find((entry) => entry.id === environmentId);
    if (!source) return;
    const updated = { ...source, plan: clonePlan(saved) };
    const nextSite = { ...site, environments: site.environments.map((entry) => entry.id === environmentId ? updated : entry) };
    updateSiteCache(nextSite);
    if (environmentRef.current?.id === environmentId) {
      environmentRef.current = cloneEnvironment(updated);
      setEnvironment(cloneEnvironment(updated));
      canonicalPlanRef.current = clonePlan(saved);
      if (!dragRef.current.kind) planRef.current = clonePlan(planForTarget(saved, activeTargetRef.current));
    }
  }, [farmId, queryClient, updateSiteCache]);

  const flushAutosave = useCallback(async () => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = null;
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    try {
      setSaveState('saving');
      const saved = await apiFetch.savePlan(pending.plan, pending.environmentId ?? undefined);
      applySavedPlan(pending.environmentId, saved);
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setSaveState(pendingSaveRef.current ? 'dirty' : 'saved');
    } catch (err) {
      setSaveState('error');
      toast.error((err as Error).message);
    }
  }, [applySavedPlan]);

  const scheduleAutosave = useCallback((nextPlan: PlanState) => {
    const environmentId = scopeRef.current.kind === 'env' ? scopeRef.current.id : null;
    pendingSaveRef.current = { environmentId, plan: clonePlan(syncCanonicalPlan(nextPlan)) };
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    setSaveState('dirty');
    autosaveRef.current = window.setTimeout(() => { void flushAutosave(); }, AUTOSAVE_MS);
  }, [flushAutosave, syncCanonicalPlan]);

  const snapshotPlanHistory = useCallback((plan: PlanState): HistoryEntry | null => {
    const activeEnvironment = environmentRef.current;
    if (scopeRef.current.kind === 'env' && activeEnvironment) {
      const canonical = planWithTarget(activeEnvironment.plan, activeTargetRef.current, plan);
      return { kind: 'environment', id: activeEnvironment.id, snapshot: { ...cloneEnvironment(activeEnvironment), plan: clonePlan(canonical) }, target: activeTargetRef.current };
    }
    if (scopeRef.current.kind === 'legacy') return { kind: 'legacy', snapshot: clonePlan(plan) };
    return null;
  }, []);

  const pushUndo = useCallback((entry: HistoryEntry | null) => {
    if (!entry) return;
    undoRef.current = [...undoRef.current, entry].slice(-HISTORY_LIMIT);
    redoRef.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const commitEnvironment = useCallback(async (
    nextEnvironment: Environment,
    recordHistory = true,
    beforeOverride?: Environment,
    historyTarget: GrowingTargetRef = activeTargetRef.current,
  ) => {
    await flushAutosave();
    const currentSite = siteRef.current;
    const before = beforeOverride ?? currentSite?.environments.find((entry) => entry.id === nextEnvironment.id) ?? environmentRef.current;
    const beforeSnapshot = before ? cloneEnvironment(before) : null;
    const proposed = cloneEnvironment(nextEnvironment);
    if (recordHistory) proposed.plan.updatedAt = new Date().toISOString();
    const saved = await apiFetch.saveEnvironment(proposed);
    if (recordHistory && beforeSnapshot) pushUndo({ kind: 'environment', id: beforeSnapshot.id, snapshot: beforeSnapshot, target: historyTarget });
    const sourceSite = siteRef.current ?? emptySite(farmId);
    const nextSite = {
      ...sourceSite,
      environments: sourceSite.environments.map((entry) => entry.id === saved.id ? saved : entry),
    };
    updateSiteCache(nextSite);
    if (environmentRef.current?.id === saved.id) {
      environmentRef.current = cloneEnvironment(saved);
      setEnvironment(cloneEnvironment(saved));
      canonicalPlanRef.current = clonePlan(saved.plan);
      const view = planForTarget(saved.plan, activeTargetRef.current);
      planRef.current = clonePlan(view);
      updateStats(view);
      setPlanVersion((version) => version + 1);
    }
    return saved;
  }, [farmId, flushAutosave, pushUndo, updateSiteCache, updateStats]);

  const commitSite = useCallback(async (nextSite: SitePlan, recordHistory = true) => {
    await flushAutosave();
    const before = recordHistory ? cloneSite(siteRef.current ?? emptySite(farmId)) : null;
    const saved = await apiFetch.saveSitePlan(cloneSite(nextSite));
    if (before) pushUndo({ kind: 'site', snapshot: before, selectedEnvironmentId });
    updateSiteCache(saved);
    return saved;
  }, [farmId, flushAutosave, pushUndo, selectedEnvironmentId, updateSiteCache]);

  const replacePlan = useCallback((nextPlan: PlanState, options: { save?: boolean; recordHistory?: PlanState } = {}) => {
    planRef.current = nextPlan;
    if (environmentRef.current && scopeRef.current.kind === 'env') {
      syncCanonicalPlan(nextPlan);
    }
    // The plan under a pending fill confirm just changed (undo/redo/template)
    // — a stale region must never commit onto it.
    setPendingFill(null);
    updateStats(nextPlan);
    setPlanVersion((v) => v + 1);
    if (options.recordHistory) pushUndo(snapshotPlanHistory(options.recordHistory));
    if (options.save) scheduleAutosave(nextPlan);
  }, [pushUndo, scheduleAutosave, snapshotPlanHistory, syncCanonicalPlan, updateStats]);

  const applyTemplate = useCallback((tpl: GardenTemplate) => {
    const plan = planRef.current;
    if (!plan) return false;
    const activeEnvironment = environmentRef.current;
    const isEnvironmentScope = ENV_RECORDS_ENABLED && scopeRef.current.kind === 'env' && activeEnvironment;
    if (isEnvironmentScope) {
      const profile = planningProfiles[archetypes[activeEnvironment.archetype].planningProfile];
      if (!profile.compatibleTemplates.includes(tpl.id)) {
        toast.error(`“${tpl.name}” is not compatible with ${archetypes[activeEnvironment.archetype].label}.`);
        return false;
      }
      if (!archetypes[activeEnvironment.archetype].tierPlanningAvailable && Object.values(tpl.ground).includes('plant-rack')) {
        toast.error('This layout contains rack planting. Tier planning is unavailable for this world yet.');
        return false;
      }
      const requiredWidth = Math.max(tpl.widthM ?? 0, ...[...Object.keys(tpl.ground), ...Object.keys(tpl.planting)].map((key) => (parseKey(key)[0] + 1) * plan.cellM));
      const requiredHeight = Math.max(tpl.heightM ?? 0, ...[...Object.keys(tpl.ground), ...Object.keys(tpl.planting)].map((key) => (parseKey(key)[1] + 1) * plan.cellM));
      if (requiredWidth > plan.widthM || requiredHeight > plan.heightM) {
        toast.error(`“${tpl.name}” needs at least ${requiredWidth.toFixed(2)} m × ${requiredHeight.toFixed(2)} m. Resize the world before applying it.`);
        return false;
      }
      if ([...Object.keys(tpl.ground), ...Object.keys(tpl.planting)].some((key) => cellOverlapsReservedArea(activeEnvironment, key))) {
        toast.error(`“${tpl.name}” uses a reserved aisle, service area or access opening in this world.`);
        return false;
      }
    }
    const widthM = isEnvironmentScope ? plan.widthM : tpl.widthM ?? plan.widthM;
    const heightM = isEnvironmentScope ? plan.heightM : tpl.heightM ?? plan.heightM;
    const cols = planCols({ ...plan, widthM });
    const rows = planRows({ ...plan, heightM });
    const inBounds = (key: string) => {
      const [x, y] = parseKey(key);
      return x >= 0 && y >= 0 && x < cols && y < rows;
    };
    const nameToId = new Map(crops.map((crop) => [crop.name.toLowerCase(), crop.id]));
    const plantedAtIso = new Date().toISOString();
    const planting: Record<string, number> = {};
    const ground: Record<string, string> = {};
    const plantedAt: Record<string, string> = {};
    let skippedCrops = 0;
    for (const [key, slug] of Object.entries(tpl.ground)) {
      if (!inBounds(key)) continue;
      ground[key] = slug;
    }
    for (const [key, cropName] of Object.entries(tpl.planting)) {
      if (!inBounds(key)) continue;
      const id = nameToId.get(cropName.toLowerCase());
      if (id === undefined) {
        skippedCrops += 1;
        continue;
      }
      planting[key] = id;
      const daysAgo = tpl.plantedAtDaysAgo?.[cropName] ?? 0;
      plantedAt[key] = daysAgo > 0 ? new Date(Date.now() - daysAgo * 86_400_000).toISOString() : plantedAtIso;
    }
    const next: PlanState = {
      ...plan,
      widthM,
      heightM,
      ...(!isEnvironmentScope && tpl.surface ? { surface: tpl.surface } : {}),
      planting,
      ground,
      plantedAt,
      updatedAt: new Date().toISOString(),
    };
    replacePlan(next, { save: true, recordHistory: clonePlan(plan) });
    toast.success(skippedCrops > 0
      ? `Applied “${tpl.name}” · ${skippedCrops} unknown crop${skippedCrops === 1 ? '' : 's'} skipped`
      : `Applied “${tpl.name}”`);
    return true;
  }, [crops, replacePlan]);

  const getCellFromEvent = useCallback((event: Pick<ReactPointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY'>) => {
    const canvas = canvasRef.current;
    const plan = planRef.current;
    if (!canvas || !plan) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    const viewport = viewportRef.current;
    const x = Math.floor((px - viewport.offsetX) / viewport.cellPx);
    const y = Math.floor((py - viewport.offsetY) / viewport.cellPx);
    if (x < 0 || y < 0 || x >= planCols(plan) || y >= planRows(plan)) return null;
    return { x, y, key: cellKey(x, y), px, py };
  }, []);

  // `mode` lets the line tool reuse the exact same payload writers (brush /
  // asset footprint / erase-layer) without touching tool state.
  const mutateCell = useCallback((x: number, y: number, mode: Tool = tool): boolean => {
    const plan = planRef.current;
    if (!plan || x < 0 || y < 0 || x >= planCols(plan) || y >= planRows(plan)) return false;
    const key = cellKey(x, y);
    if (mode === 'brush') {
      if (!activeCropId || !canPaintCrop(key, plan) || plan.planting[key] === activeCropId) return false;
      plan.planting[key] = activeCropId;
      stampPlantedAt(plan, key);
      return true;
    }
    if (mode === 'erase') {
      if (eraseLayer === 'equipment') {
        const current = environmentRef.current;
        if (!ASSET_PHYSICS_ENABLED || !current || scopeRef.current.kind !== 'env') return false;
        const instance = instanceAtTargetCell(current, key, activeTargetRef.current);
        if (!instance || instance.slug === 'plant-rack') return false;
        const updated: Environment = {
          ...current,
          instances: (current.instances ?? []).filter((item) => item.id !== instance.id),
        };
        environmentRef.current = updated;
        setEnvironment(updated);
        dragRef.current.environmentChanged = true;
        return true;
      }
      if (eraseLayer === 'plants') {
        if (!plan.planting[key]) return false;
        delete plan.planting[key];
        clearPlantedAt(plan, key);
        return true;
      }
      if (!plan.ground[key]) return false;
      delete plan.ground[key];
      if (!canPaintCrop(key, plan)) {
        delete plan.planting[key];
        clearPlantedAt(plan, key);
      }
      return true;
    }
    if (mode === 'asset' && activeAsset && assetValidAt(activeAsset, x, y, plan)) {
      if (ENV_RECORDS_ENABLED && scopeRef.current.kind === 'env' && activeAsset.physics) {
        const current = environmentRef.current;
        if (!current) return false;
        const footprint = footprintCells(activeAsset, plan);
        const widthM = footprint.cols * plan.cellM;
        const depthM = footprint.rows * plan.cellM;
        const instanceId = editorId('instance');
        const target = activeTargetRef.current;
        const mount = activeAsset.physics.kind === 'rack'
          ? { kind: 'floor' as const }
          : target.kind === 'growing-level'
            ? target
            : activeAsset.physics.kind === 'soilless'
              ? { kind: 'floor' as const }
              : { kind: 'environment' as const };
        const instance = {
          id: instanceId,
          slug: activeAsset.slug,
          x: x * plan.cellM,
          y: y * plan.cellM,
          widthM,
          depthM,
          mount,
        };
        let layout = current.layout ?? { access: [], reservations: [], growingSpaces: [] };
        if (activeAsset.physics.kind === 'rack') {
          const spaceId = instanceId;
          const label = `Rack ${layout.growingSpaces.filter((space) => space.kind === 'rack').length + 1}`;
          layout = {
            ...layout,
            growingSpaces: [...layout.growingSpaces, {
              id: spaceId,
              label,
              kind: 'rack',
              x: instance.x,
              y: instance.y,
              widthM,
              depthM,
              levels: Array.from({ length: rackTierCount }, (_, index) => ({
                id: `${spaceId}:level:${index + 1}`,
                label: `Tier ${index + 1}`,
                elevationM: 0.25 + index * 0.45,
                clearanceM: 0.45,
              })),
            }],
          };
        }
        const updated: Environment = {
          ...current,
          layout,
          instances: [...(current.instances ?? []), instance],
        };
        environmentRef.current = updated;
        setEnvironment(updated);
        dragRef.current.environmentChanged = true;
        return true;
      }
      let changed = false;
      const fp = footprintCells(activeAsset, plan);
      for (let yy = y; yy < y + fp.rows; yy++) {
        for (let xx = x; xx < x + fp.cols; xx++) {
          if (xx < 0 || yy < 0 || xx >= planCols(plan) || yy >= planRows(plan)) continue;
          const k = cellKey(xx, yy);
          if (plan.ground[k] !== activeAsset.slug) {
            plan.ground[k] = activeAsset.slug;
            changed = true;
          }
          if (!activeAsset.plantable && plan.planting[k]) {
            delete plan.planting[k];
            clearPlantedAt(plan, k);
            changed = true;
          }
        }
      }
      return changed;
    }
    return false;
  }, [activeAsset, activeCropId, assetValidAt, canPaintCrop, eraseLayer, rackTierCount, setEnvironment, tool]);

  const applyBrushAt = useCallback((x: number, y: number) => {
    const radius = tool === 'brush' || tool === 'erase' ? Math.floor(brushSize / 2) : 0;
    let changed = false;
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        changed = mutateCell(xx, yy) || changed;
      }
    }
    if (changed && planRef.current) {
      dragRef.current.changed = true;
      syncCanonicalPlan(planRef.current);
      updateStats(planRef.current);
      setPlanVersion((v) => v + 1);
    }
  }, [brushSize, mutateCell, syncCanonicalPlan, tool, updateStats]);

  const applyRect = useCallback((x0: number, y0: number, x1: number, y1: number): boolean => {
    const plan = planRef.current;
    if (!plan) return false;
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(planCols(plan) - 1, Math.max(x0, x1));
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(planRows(plan) - 1, Math.max(y0, y1));
    let changed = false;
    if (rectMode === 'asset' && activeAsset?.physics) {
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) changed = mutateCell(x, y, 'asset') || changed;
      }
      return changed;
    }
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const key = cellKey(x, y);
        if (rectMode === 'plants') {
          if (!activeCropId || !canPaintCrop(key, plan) || plan.planting[key] === activeCropId) continue;
          plan.planting[key] = activeCropId;
          stampPlantedAt(plan, key);
          changed = true;
        } else if (rectMode === 'asset' && activeAsset && assetAllowed(activeAsset, plan)) {
          if (plan.ground[key] !== activeAsset.slug) {
            if (!ENV_RECORDS_ENABLED || scopeRef.current.kind !== 'env' || !environmentRef.current ||
                (!cellOverlapsReservedArea(environmentRef.current, key) && !cellOverlapsRack(environmentRef.current, key))) {
              plan.ground[key] = activeAsset.slug;
              changed = true;
            }
          }
          if (!activeAsset.plantable && plan.planting[key]) {
            delete plan.planting[key];
            clearPlantedAt(plan, key);
            changed = true;
          }
        }
      }
    }
    return changed;
  }, [activeAsset, activeCropId, assetAllowed, canPaintCrop, mutateCell, rectMode]);

  // P1-3: commit the line stroke — payload applied along the Bresenham cells.
  const applyLineCells = useCallback((x0: number, y0: number, x1: number, y1: number): boolean => {
    const plan = planRef.current;
    if (!plan) return false;
    const cols = planCols(plan);
    const rows = planRows(plan);
    const clampX = (x: number) => Math.min(cols - 1, Math.max(0, x));
    const clampY = (y: number) => Math.min(rows - 1, Math.max(0, y));
    const mode: Tool = rectMode === 'erase' ? 'erase' : rectMode === 'asset' ? 'asset' : 'brush';
    let changed = false;
    for (const [x, y] of bresenhamCells(clampX(x0), clampY(y0), clampX(x1), clampY(y1))) {
      changed = mutateCell(x, y, mode) || changed;
    }
    return changed;
  }, [mutateCell, rectMode]);

  // P1-1: eyedropper — copies the cell's content to the palette payloads and
  // switches to the matching paint tool. Purely UI state: NO history entry.
  const pickAt = useCallback((key: string) => {
    const plan = planRef.current;
    if (!plan) return;
    const cropId = plan.planting[key];
    if (cropId !== undefined) {
      setActiveCropId(cropId);
      setTool('brush');
      return;
    }
    const slug = plan.ground[key];
    if (slug) {
      setActiveAssetSlug(slug);
      setTool('asset');
    }
  }, []);

  // P1-2: flood fill — BFS over cells with an identical value WITHIN THE SAME
  // layer (planting id for plants mode, ground slug for asset mode), capped,
  // committed as ONE history snapshot + one debounced autosave.
  const applyFillRegion = useCallback((region: Array<[number, number]>) => {
    const plan = planRef.current;
    if (!plan || region.length === 0) return;
    if (rectMode === 'asset' && activeAsset?.physics) {
      toast.error('Place equipment by clicking or dragging; equipment cannot be flood-filled.');
      return;
    }
    const before = clonePlan(plan); // ONE undo snapshot for the whole fill
    let changed = false;
    for (const [x, y] of region) {
      if (rectMode === 'asset') {
        // Asset fill assigns the slug per cell (rect-style) instead of
        // stamping a full footprint per region cell.
        const key = cellKey(x, y);
        if (activeAsset && assetAllowed(activeAsset, plan) &&
            (!ENV_RECORDS_ENABLED || scopeRef.current.kind !== 'env' || !environmentRef.current ||
              (!cellOverlapsReservedArea(environmentRef.current, key) && !cellOverlapsRack(environmentRef.current, key)))) {
          if (plan.ground[key] !== activeAsset.slug) {
            plan.ground[key] = activeAsset.slug;
            changed = true;
          }
          if (!activeAsset.plantable && plan.planting[key]) {
            delete plan.planting[key];
            clearPlantedAt(plan, key);
            changed = true;
          }
        }
      } else {
        changed = mutateCell(x, y, 'brush') || changed;
      }
    }
    if (!changed) return;
    pushUndo(snapshotPlanHistory(before));
    if (planRef.current) updateStats(planRef.current);
    setPlanVersion((v) => v + 1);
    scheduleAutosave(clonePlan(plan)); // one autosave through the 600 ms debounce
  }, [activeAsset, assetAllowed, mutateCell, pushUndo, rectMode, scheduleAutosave, snapshotPlanHistory, updateStats]);

  const applyFillAt = useCallback((sx: number, sy: number) => {
    const plan = planRef.current;
    if (!plan) return;
    const cols = planCols(plan);
    const rows = planRows(plan);
    if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) return;
    const layerValue = (x: number, y: number): string =>
      rectMode === 'asset'
        ? plan.ground[cellKey(x, y)] ?? ''
        : String(plan.planting[cellKey(x, y)] ?? '');
    const target = layerValue(sx, sy);
    const seen = new Set<string>([cellKey(sx, sy)]);
    const queue: Array<[number, number]> = [[sx, sy]];
    const region: Array<[number, number]> = [];
    let head = 0;
    while (head < queue.length && region.length < FLOOD_CAP) {
      const [cx, cy] = queue[head++];
      region.push([cx, cy]);
      const neighbors: Array<[number, number]> = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nk = cellKey(nx, ny);
        if (seen.has(nk)) continue;
        if (layerValue(nx, ny) !== target) continue;
        seen.add(nk);
        queue.push([nx, ny]);
      }
    }

    // DES-009: an oversized fill waits for the confirm dialog (rendered by
    // PlotDesigner) — a single unconfirmed click must not silently replace
    // hundreds of cells.
    if (region.length > FILL_CONFIRM_THRESHOLD) {
      setPendingFill({ region });
      return;
    }
    applyFillRegion(region);
  }, [applyFillRegion, rectMode]);

  const confirmFill = useCallback(() => {
    if (pendingFill) applyFillRegion(pendingFill.region);
    setPendingFill(null);
  }, [applyFillRegion, pendingFill]);

  const cancelFill = useCallback(() => setPendingFill(null), []);

  // P0-4: Escape cancels any in-flight stroke (restoring its before-snapshot
  // without a history entry), clears the rect/line previews and the selection.
  const cancelStroke = useCallback(() => {
    const drag = dragRef.current;
    if ((drag.kind === 'paint' || drag.kind === 'rect' || drag.kind === 'line') && drag.before) {
      if (drag.environmentChanged && drag.beforeEnvironment) {
        const restored = cloneEnvironment(drag.beforeEnvironment);
        environmentRef.current = restored;
        setEnvironment(restored);
        canonicalPlanRef.current = clonePlan(restored.plan);
        planRef.current = clonePlan(planForTarget(restored.plan, drag.targetBefore ?? { kind: 'floor' }));
        activeTargetRef.current = drag.targetBefore ?? { kind: 'floor' };
        setActiveTarget(activeTargetRef.current);
        updateStats(planRef.current);
      } else {
        planRef.current = drag.before;
        syncCanonicalPlan(drag.before);
        updateStats(drag.before);
      }
      setPlanVersion((v) => v + 1);
    }
    setRectPreview(null);
    setLineDraft(null);
    setSelectedKey(null);
    setIsPanning(false);
    dragRef.current = {
      kind: null,
      before: null,
      changed: false,
      startX: 0,
      startY: 0,
      panClientX: 0,
      panClientY: 0,
      panOffsetX: 0,
      panOffsetY: 0,
    };
  }, [syncCanonicalPlan, updateStats]);

  const finishStroke = useCallback((event?: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const plan = planRef.current;
    if (event) pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (drag.kind === 'gesture') {
      if (pointersRef.current.size < 2) {
        dragRef.current = {
          kind: null,
          before: null,
          changed: false,
          startX: 0,
          startY: 0,
          panClientX: 0,
          panClientY: 0,
          panOffsetX: 0,
          panOffsetY: 0,
        };
      }
      return;
    }
    if (drag.kind === 'pan') setIsPanning(false);
    const endCell = event ? getCellFromEvent(event) : null;
    const endKey = endCell?.key ?? hoverKey;
    if (drag.kind === 'rect' || drag.kind === 'line') {
      if (plan && endKey) {
        const [endX, endY] = parseKey(endKey);
        if (drag.kind === 'rect') {
          drag.changed = applyRect(drag.startX, drag.startY, endX, endY) || drag.changed;
        } else {
          drag.changed = applyLineCells(drag.startX, drag.startY, endX, endY) || drag.changed;
        }
        if (drag.changed) updateStats(plan);
      }
      // Previews die with the gesture even when the release lands off-plan.
      setRectPreview(null);
      setLineDraft(null);
    }
    if (drag.changed && drag.before && plan && drag.environmentChanged) {
      const nextEnvironment = environmentRef.current;
      if (nextEnvironment) {
        const pending = commitEnvironment(nextEnvironment, true, drag.beforeEnvironment, drag.targetBefore);
        environmentMutationRef.current = pending;
        void pending.catch((error) => {
          if (drag.beforeEnvironment) {
            const restored = cloneEnvironment(drag.beforeEnvironment);
            environmentRef.current = restored;
            setEnvironment(restored);
            canonicalPlanRef.current = clonePlan(restored.plan);
            planRef.current = clonePlan(planForTarget(restored.plan, drag.targetBefore ?? { kind: 'floor' }));
            updateStats(planRef.current);
            setPlanVersion((version) => version + 1);
          }
          toast.error((error as Error).message);
        }).finally(() => {
          if (environmentMutationRef.current === pending) environmentMutationRef.current = null;
        });
      }
    } else if (drag.changed && drag.before && plan) {
      // History push FIRST, then the version bump — the very render triggered
      // by this bump already sees the enabled Undo button (P0-4).
      pushUndo(snapshotPlanHistory(drag.before));
      syncCanonicalPlan(plan);
      setPlanVersion((v) => v + 1);
      scheduleAutosave(clonePlan(plan));
    }
    dragRef.current = {
      kind: null,
      before: null,
      changed: false,
      startX: 0,
      startY: 0,
      panClientX: 0,
      panClientY: 0,
      panOffsetX: 0,
      panOffsetY: 0,
    };
  }, [applyLineCells, applyRect, commitEnvironment, getCellFromEvent, hoverKey, pushUndo, scheduleAutosave, snapshotPlanHistory, syncCanonicalPlan, updateStats]);

  const activateEnvironment = useCallback((nextEnvironment: Environment) => {
    const copy = cloneEnvironment(nextEnvironment);
    environmentRef.current = copy;
    setEnvironment(copy);
    canonicalPlanRef.current = clonePlan(copy.plan);
    activeTargetRef.current = { kind: 'floor' };
    setActiveTarget({ kind: 'floor' });
    planRef.current = clonePlan(planForTarget(copy.plan, { kind: 'floor' }));
    scopeRef.current = { kind: 'env', id: copy.id };
    setScope({ kind: 'env', id: copy.id });
    setDraftWidth(copy.widthM);
    setDraftHeight(copy.heightM);
    setDraftAllowOutsideBeds(copy.plan.allowOutsideBeds);
    setDraftSurface(LEGACY_SURFACE_FOR_ARCHETYPE[copy.archetype]);
    setSelectedKey(null);
    setHoverKey(null);
    setRectPreview(null);
    setLineDraft(null);
    setPendingFill(null);
    setPendingResize(null);
    updateStats(planRef.current);
    setPlanVersion((version) => version + 1);
    didInitialFitRef.current = false;
    if (canvasRef.current && shellRef.current) {
      fitToView();
      didInitialFitRef.current = true;
    }
  }, [fitToView, updateStats]);

  const selectTarget = useCallback((targetKey: GrowingTargetKey) => {
    const option = targetOptions.find((entry) => entry.key === targetKey);
    if (!option || growingTargetKey(activeTargetRef.current) === targetKey) return;
    finishStroke();
    void (async () => {
      await environmentMutationRef.current?.catch(() => undefined);
      await flushAutosave();
      const environment = environmentRef.current;
      const canonical = canonicalPlanRef.current ?? environment?.plan;
      if (!environment || !canonical) return;
      activeTargetRef.current = option.target;
      setActiveTarget(option.target);
      planRef.current = clonePlan(planForTarget(canonical, option.target));
      setSelectedKey(null);
      setHoverKey(null);
      setRectPreview(null);
      setLineDraft(null);
      updateStats(planRef.current);
      setPlanVersion((version) => version + 1);
    })().catch((error) => toast.error((error as Error).message));
  }, [finishStroke, flushAutosave, targetOptions, updateStats]);

  const growingSpaceRemovalPreview = useCallback((spaceId: string) => {
    const active = environmentRef.current;
    const space = active?.layout?.growingSpaces.find((entry) => entry.id === spaceId);
    if (!active || !space) return { cropCells: 0, equipment: 0 };
    const targetKeys = space.levels.map((level) => growingTargetKey({ kind: 'growing-level', growingSpaceId: space.id, levelId: level.id }));
    const cropCells = targetKeys.reduce((total, key) => total + Object.keys(canonicalPlanRef.current?.targets?.[key]?.planting ?? {}).length, 0);
    const equipment = (active.instances ?? []).filter((instance) =>
      instance.id === spaceId || (instance.mount.kind === 'growing-level' && instance.mount.growingSpaceId === spaceId),
    ).length;
    return { cropCells, equipment };
  }, []);

  const removeGrowingSpace = useCallback(async (spaceId: string) => {
    if (!ASSET_PHYSICS_ENABLED) return;
    const current = environmentRef.current;
    const space = current?.layout?.growingSpaces.find((entry) => entry.id === spaceId);
    if (!current || !space) return;
    const targets = { ...current.plan.targets };
    for (const level of space.levels) {
      delete targets[growingTargetKey({ kind: 'growing-level', growingSpaceId: space.id, levelId: level.id })];
    }
    const targetWasRemoved = activeTargetRef.current.kind === 'growing-level' && activeTargetRef.current.growingSpaceId === spaceId;
    const saved = await commitEnvironment({
      ...current,
      layout: { ...current.layout!, growingSpaces: current.layout!.growingSpaces.filter((entry) => entry.id !== spaceId) },
      instances: (current.instances ?? []).filter((instance) =>
        instance.id !== spaceId && !(instance.mount.kind === 'growing-level' && instance.mount.growingSpaceId === spaceId),
      ),
      plan: { ...current.plan, ...(Object.keys(targets).length ? { targets } : { targets: undefined }) },
    });
    if (targetWasRemoved) {
      activeTargetRef.current = { kind: 'floor' };
      setActiveTarget({ kind: 'floor' });
      canonicalPlanRef.current = clonePlan(saved.plan);
      planRef.current = clonePlan(planForTarget(saved.plan, { kind: 'floor' }));
      updateStats(planRef.current);
      setPlanVersion((version) => version + 1);
    }
  }, [commitEnvironment, updateStats]);

  const removeEquipmentInstance = useCallback(async (instanceId: string) => {
    if (!ASSET_PHYSICS_ENABLED) return;
    const current = environmentRef.current;
    const instance = current?.instances?.find((item) => item.id === instanceId);
    if (!current || !instance || instance.slug === 'plant-rack') return;
    await commitEnvironment({
      ...current,
      instances: (current.instances ?? []).filter((item) => item.id !== instanceId),
    });
    setSelectedKey(null);
  }, [commitEnvironment]);

  const updateEnvironmentSetpoints = useCallback(async (setpoints: NonNullable<Environment['setpoints']>) => {
    if (!ENV_RECORDS_ENABLED || !ENV_CLIMATE_ENABLED || scopeRef.current.kind !== 'env') return;
    await flushAutosave();
    const current = environmentRef.current;
    if (!current) return;
    await commitEnvironment({
      ...current,
      setpoints: Object.keys(setpoints).length > 0 ? { ...setpoints } : undefined,
    });
  }, [commitEnvironment, flushAutosave]);

  const startNextPlan = useCallback(async (environmentIds: string[]) => {
    if (!CAMPAIGN_ENABLED) throw new Error('Campaign features are disabled.');
    finishStroke();
    await environmentMutationRef.current?.catch(() => undefined);
    await flushAutosave();

    if (scopeRef.current.kind === 'legacy' && environmentIds.length === 0) {
      const current = planRef.current;
      if (!current) throw new Error('There is no plan to clear.');
      const next = { ...clonePlan(current), planting: {} };
      delete next.plantedAt;
      delete next.targets;
      replacePlan(next, { save: true, recordHistory: clonePlan(current) });
      await flushAutosave();
      return;
    }

    const site = siteRef.current;
    const selectedIds = new Set(environmentIds);
    if (!site || selectedIds.size === 0) throw new Error('This season has no saved growing-world plans to clear.');
    if ([...selectedIds].some((id) => !site.environments.some((environment) => environment.id === id))) {
      throw new Error('A growing world from this season is no longer on the site.');
    }

    const activeEnvironmentId = environmentRef.current?.id;
    const cleared = await commitSite({
      ...site,
      environments: site.environments.map((environment) => selectedIds.has(environment.id)
        ? clearEnvironmentPlanting(environment)
        : environment),
    });
    const active = activeEnvironmentId
      ? cleared.environments.find((environment) => environment.id === activeEnvironmentId)
      : undefined;
    if (active) {
      environmentRef.current = cloneEnvironment(active);
      setEnvironment(cloneEnvironment(active));
      canonicalPlanRef.current = clonePlan(active.plan);
      planRef.current = clonePlan(planForTarget(active.plan, activeTargetRef.current));
      updateStats(planRef.current);
      setPlanVersion((version) => version + 1);
    }
    setSelectedKey(null);
    setPendingFill(null);
  }, [commitSite, finishStroke, flushAutosave, replacePlan, updateStats]);

  const commitExternalEnvironmentMutation = useCallback(async (before: Environment, target: GrowingTargetRef) => {
    const current = environmentRef.current;
    if (!current || current.id !== before.id || JSON.stringify(current) === JSON.stringify(before)) return;
    const pending = commitEnvironment(cloneEnvironment(current), true, before, target);
    environmentMutationRef.current = pending;
    try {
      await pending;
    } catch (error) {
      const restored = cloneEnvironment(before);
      environmentRef.current = restored;
      setEnvironment(restored);
      canonicalPlanRef.current = clonePlan(restored.plan);
      activeTargetRef.current = target;
      setActiveTarget(target);
      planRef.current = clonePlan(planForTarget(restored.plan, target));
      updateStats(planRef.current);
      setPlanVersion((version) => version + 1);
      toast.error((error as Error).message);
      throw error;
    } finally {
      if (environmentMutationRef.current === pending) environmentMutationRef.current = null;
    }
  }, [commitEnvironment, updateStats]);

  const showSite = useCallback(() => {
    if (!ENV_RECORDS_ENABLED) return;
    finishStroke();
    void (async () => {
      await flushAutosave();
      scopeRef.current = { kind: 'site' };
      setScope({ kind: 'site' });
      environmentRef.current = null;
      setEnvironment(null);
      planRef.current = null;
      canonicalPlanRef.current = null;
      activeTargetRef.current = { kind: 'floor' };
      setActiveTarget({ kind: 'floor' });
      setSelectedKey(null);
      setHoverKey(null);
      setPendingFill(null);
      setPendingResize(null);
      setPlanVersion((version) => version + 1);
    })();
  }, [finishStroke, flushAutosave]);

  const selectEnvironment = useCallback((environmentId: string) => {
    if (!ENV_RECORDS_ENABLED) return;
    finishStroke();
    void (async () => {
      await flushAutosave();
      const environment = siteRef.current?.environments.find((entry) => entry.id === environmentId)
        ?? await apiFetch.getEnvironment(farmId, environmentId);
      if (!environment) {
        setStaleSelectionId(environmentId);
        scopeRef.current = { kind: 'site' };
        setScope({ kind: 'site' });
        environmentRef.current = null;
        setEnvironment(null);
        planRef.current = null;
        canonicalPlanRef.current = null;
        activeTargetRef.current = { kind: 'floor' };
        setActiveTarget({ kind: 'floor' });
        setPlanVersion((version) => version + 1);
        return;
      }
      await apiFetch.setSelectedEnvironmentId(farmId, environment.id);
      setSelectedEnvironmentId(environment.id);
      setStaleSelectionId(null);
      queryClient.setQueryData(['selected-environment', farmId], environment.id);
      activateEnvironment(environment);
    })().catch((error) => toast.error((error as Error).message));
  }, [activateEnvironment, farmId, finishStroke, flushAutosave, queryClient]);

  const createWorld = useCallback(async (input: CreateEnvironmentInput, starter?: GardenTemplate) => {
    if (!ENV_RECORDS_ENABLED) throw new Error('Growing worlds are disabled.');
    finishStroke();
    await flushAutosave();
    const before = cloneSite(siteRef.current ?? emptySite(farmId));
    const beforeSelection = selectedEnvironmentId;
    const created = await apiFetch.createEnvironment(farmId, input);
    pushUndo({ kind: 'site', snapshot: before, selectedEnvironmentId: beforeSelection });
    const site = await apiFetch.getSitePlan(farmId);
    updateSiteCache(site);
    setSelectedEnvironmentId(created.id);
    queryClient.setQueryData(['selected-environment', farmId], created.id);
    setStaleSelectionId(null);
    activateEnvironment(created);
    if (starter) applyTemplate(starter);
    return created;
  }, [activateEnvironment, applyTemplate, farmId, finishStroke, flushAutosave, pushUndo, queryClient, selectedEnvironmentId, updateSiteCache]);

  const moveWorld = useCallback(async (environmentId: string, x: number, y: number) => {
    const site = siteRef.current;
    if (!site) return;
    const before = site.environments.find((entry) => entry.id === environmentId);
    if (!before) return;
    const nextSite = {
      ...site,
      environments: site.environments.map((entry) => entry.id === environmentId
        ? { ...entry, x: Math.max(0, Math.round(x * 4) / 4), y: Math.max(0, Math.round(y * 4) / 4) }
        : entry),
    };
    await commitSite(nextSite);
  }, [commitSite]);

  const saveWorld = useCallback(async (proposed: Environment) => {
    const current = siteRef.current?.environments.find((entry) => entry.id === proposed.id) ?? environmentRef.current;
    if (!current) return;
    const snap = (value: number, fallback: number) => {
      const finite = Number.isFinite(value) ? value : fallback;
      return Math.max(current.cellM, Math.round(Math.min(MAX_DIM_M, Math.max(current.cellM, finite)) / current.cellM) * current.cellM);
    };
    const widthM = snap(proposed.widthM, current.widthM);
    const heightM = snap(proposed.heightM, current.heightM);
    const layout = layoutWithinBounds(proposed.layout ?? current.layout, widthM, heightM);
    const candidate = { ...current, widthM, heightM, layout };
    const layoutChanged = JSON.stringify(layout) !== JSON.stringify(current.layout);
    let plan = clampPlan({ ...current.plan, widthM, heightM });
    if (layoutChanged) {
      const ground = { ...plan.ground };
      for (const key of Object.keys(ground)) {
        if (cellOverlapsReservedArea(candidate, key)) delete ground[key];
      }
      const planting = { ...plan.planting };
      const plantedAt = plan.plantedAt ? { ...plan.plantedAt } : undefined;
      for (const key of Object.keys(planting)) {
        if (cellOverlapsReservedArea(candidate, key)) {
          delete planting[key];
          if (plantedAt) delete plantedAt[key];
        }
      }
      plan = { ...plan, ground, planting, ...(plantedAt ? { plantedAt } : {}) };
    }
    plan = pruneTargetsForLayout(plan, layout);
    const saved = await commitEnvironment({
      ...current,
      label: proposed.label.trim() || archetypes[current.archetype].label,
      widthM,
      heightM,
      plan,
      layout,
      ...(current.instances ? { instances: current.instances.filter((item) => {
        const mount = item.mount;
        return item.x + item.widthM <= widthM && item.y + item.depthM <= heightM &&
          (mount.kind !== 'growing-level' || !!layout?.growingSpaces.some((space) =>
            space.id === mount.growingSpaceId && space.levels.some((level) => level.id === mount.levelId),
          )) && (!layoutChanged || !instanceOverlapsReservedArea(candidate, item));
      }) } : {}),
    });
    setDraftWidth(saved.widthM);
    setDraftHeight(saved.heightM);
  }, [commitEnvironment]);

  const duplicateWorld = useCallback(async (environmentId: string) => {
    await flushAutosave();
    const before = cloneSite(siteRef.current ?? emptySite(farmId));
    const beforeSelection = selectedEnvironmentId;
    const duplicate = await apiFetch.duplicateEnvironment(farmId, environmentId);
    pushUndo({ kind: 'site', snapshot: before, selectedEnvironmentId: beforeSelection });
    updateSiteCache(await apiFetch.getSitePlan(farmId));
    setSelectedEnvironmentId(duplicate.id);
    queryClient.setQueryData(['selected-environment', farmId], duplicate.id);
    activateEnvironment(duplicate);
  }, [activateEnvironment, farmId, flushAutosave, pushUndo, queryClient, selectedEnvironmentId, updateSiteCache]);

  const deleteWorld = useCallback(async (environmentId: string) => {
    await flushAutosave();
    const before = cloneSite(siteRef.current ?? emptySite(farmId));
    const beforeSelection = selectedEnvironmentId;
    await apiFetch.deleteEnvironment(farmId, environmentId);
    pushUndo({ kind: 'site', snapshot: before, selectedEnvironmentId: beforeSelection });
    const nextSite = await apiFetch.getSitePlan(farmId);
    updateSiteCache(nextSite);
    const selected = await apiFetch.getSelectedEnvironmentId(farmId);
    setSelectedEnvironmentId(selected);
    queryClient.setQueryData(['selected-environment', farmId], selected);
    if (environmentRef.current?.id === environmentId) {
      environmentRef.current = null;
      setEnvironment(null);
      planRef.current = null;
      canonicalPlanRef.current = null;
      activeTargetRef.current = { kind: 'floor' };
      setActiveTarget({ kind: 'floor' });
      scopeRef.current = { kind: 'site' };
      setScope({ kind: 'site' });
      setSelectedKey(null);
      setPlanVersion((version) => version + 1);
    }
  }, [farmId, flushAutosave, pushUndo, queryClient, selectedEnvironmentId, updateSiteCache]);

  const currentEntryFor = useCallback((target: HistoryEntry): HistoryEntry | null => {
    if (target.kind === 'legacy') {
      const plan = planRef.current;
      return plan && scopeRef.current.kind === 'legacy' ? { kind: 'legacy', snapshot: clonePlan(plan) } : null;
    }
    if (target.kind === 'site') return { kind: 'site', snapshot: cloneSite(siteRef.current ?? emptySite(farmId)), selectedEnvironmentId };
    const site = siteRef.current;
    const saved = site?.environments.find((entry) => entry.id === target.id);
    if (!saved) return null;
    const current = environmentRef.current?.id === target.id ? environmentRef.current : saved;
    const plan = planRef.current && environmentRef.current?.id === target.id
      ? planWithTarget(current.plan, activeTargetRef.current, planRef.current)
      : current.plan;
    return { kind: 'environment', id: target.id, snapshot: { ...cloneEnvironment(current), plan: clonePlan(plan) }, target: activeTargetRef.current };
  }, [farmId, selectedEnvironmentId]);

  const restoreEntry = useCallback(async (entry: HistoryEntry) => {
    if (entry.kind === 'legacy') {
      const plan = clonePlan(entry.snapshot);
      planRef.current = plan;
      updateStats(plan);
      setPlanVersion((version) => version + 1);
      scheduleAutosave(plan);
      return;
    }
    if (entry.kind === 'site') {
      const saved = await apiFetch.saveSitePlan(cloneSite(entry.snapshot));
      const selected = saved.environments.some((environment) => environment.id === entry.selectedEnvironmentId)
        ? entry.selectedEnvironmentId
        : null;
      await apiFetch.setSelectedEnvironmentId(farmId, selected);
      setSelectedEnvironmentId(selected);
      setStaleSelectionId(null);
      queryClient.setQueryData(['selected-environment', farmId], selected);
      updateSiteCache(saved);
      const activeId = scopeRef.current.kind === 'env' ? scopeRef.current.id : null;
      const active = activeId ? saved.environments.find((environment) => environment.id === activeId) ?? null : null;
      if (activeId && !active) {
        environmentRef.current = null;
        planRef.current = null;
        setEnvironment(null);
        scopeRef.current = { kind: 'site' };
        setScope({ kind: 'site' });
        setSelectedKey(null);
      } else if (active) {
        environmentRef.current = cloneEnvironment(active);
        canonicalPlanRef.current = clonePlan(active.plan);
        const selectedTarget = activeTargetRef.current;
        const targetStillExists = selectedTarget.kind === 'floor' || active.layout?.growingSpaces.some((space) =>
          space.id === selectedTarget.growingSpaceId && space.levels.some((level) => level.id === selectedTarget.levelId),
        );
        const target = targetStillExists ? selectedTarget : { kind: 'floor' as const };
        activeTargetRef.current = target;
        setActiveTarget(target);
        planRef.current = clonePlan(planForTarget(active.plan, target));
        setEnvironment(cloneEnvironment(active));
        updateStats(planRef.current);
      }
      setPlanVersion((version) => version + 1);
      return;
    }
    const saved = await apiFetch.saveEnvironment(cloneEnvironment(entry.snapshot));
    const site = siteRef.current ?? emptySite(farmId);
    const nextSite = {
      ...site,
      environments: site.environments.map((environment) => environment.id === saved.id ? saved : environment),
    };
    updateSiteCache(nextSite);
    if (environmentRef.current?.id === saved.id) {
      environmentRef.current = cloneEnvironment(saved);
      canonicalPlanRef.current = clonePlan(saved.plan);
      const requestedTarget = entry.target;
      const targetExists = requestedTarget?.kind === 'floor' || (requestedTarget?.kind === 'growing-level' &&
        saved.layout?.growingSpaces.some((space) =>
          space.id === requestedTarget.growingSpaceId && space.levels.some((level) => level.id === requestedTarget.levelId),
        ));
      const target = targetExists && requestedTarget ? requestedTarget : { kind: 'floor' as const };
      activeTargetRef.current = target;
      setActiveTarget(target);
      planRef.current = clonePlan(planForTarget(saved.plan, target));
      setEnvironment(cloneEnvironment(saved));
      updateStats(planRef.current);
    }
    setPlanVersion((version) => version + 1);
  }, [farmId, queryClient, scheduleAutosave, updateSiteCache, updateStats]);

  const undo = useCallback(() => {
    void (async () => {
      await flushAutosave();
      const entry = undoRef.current.pop();
      if (!entry) return;
      const current = currentEntryFor(entry);
      if (current) redoRef.current = [...redoRef.current, current].slice(-HISTORY_LIMIT);
      try {
        await restoreEntry(entry);
        setHistoryVersion((version) => version + 1);
      } catch (error) {
        undoRef.current = [...undoRef.current, entry];
        setHistoryVersion((version) => version + 1);
        toast.error((error as Error).message);
      }
    })();
  }, [currentEntryFor, flushAutosave, restoreEntry]);

  const redo = useCallback(() => {
    void (async () => {
      await flushAutosave();
      const entry = redoRef.current.pop();
      if (!entry) return;
      const current = currentEntryFor(entry);
      if (current) undoRef.current = [...undoRef.current, current].slice(-HISTORY_LIMIT);
      try {
        await restoreEntry(entry);
        setHistoryVersion((version) => version + 1);
      } catch (error) {
        redoRef.current = [...redoRef.current, entry];
        setHistoryVersion((version) => version + 1);
        toast.error((error as Error).message);
      }
    })();
  }, [currentEntryFor, flushAutosave, restoreEntry]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const plan = planRef.current;
    if (!plan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const drag = dragRef.current;
      if (drag.kind === 'paint' || drag.kind === 'rect' || drag.kind === 'line') {
        if (drag.before) {
          if (drag.environmentChanged && drag.beforeEnvironment) {
            const restored = cloneEnvironment(drag.beforeEnvironment);
            environmentRef.current = restored;
            setEnvironment(restored);
            canonicalPlanRef.current = clonePlan(restored.plan);
            activeTargetRef.current = drag.targetBefore ?? { kind: 'floor' };
            setActiveTarget(activeTargetRef.current);
            planRef.current = clonePlan(planForTarget(restored.plan, activeTargetRef.current));
            updateStats(planRef.current);
          } else {
            planRef.current = drag.before;
            updateStats(drag.before);
          }
          setPlanVersion((v) => v + 1);
        }
        setRectPreview(null);
        setLineDraft(null);
      }
      setIsPanning(false);
      const points = [...pointersRef.current.values()];
      const [p1, p2] = points;
      pinchRef.current = {
        distance: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
      };
      dragRef.current = {
        kind: 'gesture',
        before: null,
        changed: false,
        startX: 0,
        startY: 0,
        panClientX: 0,
        panClientY: 0,
        panOffsetX: 0,
        panOffsetY: 0,
      };
      return;
    }
    const cell = getCellFromEvent(event);
    if (event.button === 1 || spaceHeldRef.current) {
      dragRef.current = {
        kind: 'pan',
        before: null,
        changed: false,
        startX: 0,
        startY: 0,
        panClientX: event.clientX,
        panClientY: event.clientY,
        panOffsetX: viewportRef.current.offsetX,
        panOffsetY: viewportRef.current.offsetY,
      };
      setIsPanning(true);
      return;
    }
    if (!cell) return;
    // P1-1: Alt-click eyedropper works from ANY tool.
    if (event.altKey) {
      event.preventDefault();
      pickAt(cell.key);
      return;
    }
    if (tool === 'select') {
      setSelectedKey(cell.key);
      return;
    }
    if (tool === 'pick') {
      pickAt(cell.key);
      return;
    }
    if (tool === 'fill') {
      applyFillAt(cell.x, cell.y);
      return;
    }
    const before = clonePlan(plan);
    dragRef.current = {
      kind: tool === 'rect' ? 'rect' : tool === 'line' ? 'line' : 'paint',
      before,
      beforeEnvironment: environmentRef.current ? cloneEnvironment(environmentRef.current) : undefined,
      targetBefore: activeTargetRef.current,
      environmentChanged: false,
      changed: false,
      startX: cell.x,
      startY: cell.y,
      panClientX: 0,
      panClientY: 0,
      panOffsetX: 0,
      panOffsetY: 0,
    };
    if (tool === 'rect') {
      const color = rectMode === 'asset' && activeAsset ? activeAsset.colorHex : activeCrop?.colorHex ?? '#22c55e';
      setRectPreview({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, color });
    } else if (tool === 'line') {
      setLineDraft({ x: cell.x, y: cell.y });
    } else {
      lastPaintRef.current = { x: cell.x, y: cell.y };
      applyBrushAt(cell.x, cell.y);
    }
  }, [activeAsset, activeCrop, applyBrushAt, applyFillAt, getCellFromEvent, pickAt, rectMode, tool, updateStats]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const drag = dragRef.current;
    if (drag.kind === 'gesture' && pointersRef.current.size >= 2) {
      const canvas = canvasRef.current;
      const plan = planRef.current;
      if (!canvas || !plan || !pinchRef.current) return;
      const points = [...pointersRef.current.values()];
      const [p1, p2] = points;
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (midX - rect.left) * scaleX;
      const py = (midY - rect.top) * scaleY;
      const viewport = viewportRef.current;
      const oldCellPx = viewport.cellPx;
      const prevDistance = pinchRef.current.distance || distance;
      const scale = distance / prevDistance;
      const nextCellPx = Math.max(4, Math.min(36, oldCellPx * scale));
      const worldX = (px - viewport.offsetX) / oldCellPx;
      const worldY = (py - viewport.offsetY) / oldCellPx;
      const panDX = (midX - pinchRef.current.midX) * scaleX;
      const panDY = (midY - pinchRef.current.midY) * scaleY;
      viewportRef.current = {
        ...viewport,
        cellPx: nextCellPx,
        offsetX: px - worldX * nextCellPx + panDX,
        offsetY: py - worldY * nextCellPx + panDY,
      };
      pinchRef.current = { distance, midX, midY };
      setViewportVersion((v) => v + 1);
      return;
    }
    const cell = getCellFromEvent(event);
    setHoverKey((current) => sameCell(current, cell?.key ?? null) ? current : cell?.key ?? null);
    if (drag.kind === 'pan') {
      viewportRef.current = {
        ...viewportRef.current,
        offsetX: drag.panOffsetX + event.clientX - drag.panClientX,
        offsetY: drag.panOffsetY + event.clientY - drag.panClientY,
      };
      setViewportVersion((v) => v + 1);
      return;
    }
    if (!cell) return;
    if (drag.kind === 'paint') {
      // Interpolate between move samples (audit DES-002): sparse pointermove
      // events at high zoom must still paint the swept path, not just the
      // final stamp.
      const last = lastPaintRef.current;
      const segment = last ? bresenhamCells(last.x, last.y, cell.x, cell.y) : [[cell.x, cell.y] as [number, number]];
      for (const [sx, sy] of last ? segment.slice(1) : segment) applyBrushAt(sx, sy);
      lastPaintRef.current = { x: cell.x, y: cell.y };
    }
    if (drag.kind === 'rect') {
      const color = rectMode === 'asset' && activeAsset ? activeAsset.colorHex : activeCrop?.colorHex ?? '#22c55e';
      setRectPreview({ x0: drag.startX, y0: drag.startY, x1: cell.x, y1: cell.y, color });
    }
    // Line drags need no explicit preview state here: hover updates drive the
    // ghost memo, which renders the dashed Bresenham preview via RenderOptions.ghost.
  }, [activeAsset, activeCrop, applyBrushAt, getCellFromEvent, rectMode]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const plan = planRef.current;
    const canvas = canvasRef.current;
    if (!plan || !canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    // Same ladder + cursor-anchored math as the zoom buttons: both funnel
    // through stepZoomLadder/applyZoom.
    stepZoomLadder(event.deltaY < 0 ? 1 : -1, px, py);
  }, [stepZoomLadder]);

  const applySettings = useCallback((confirmResize = false) => {
    const current = planRef.current;
    if (!current) return;
    if (!ENV_RECORDS_ENABLED || scopeRef.current.kind === 'legacy') {
      const before = clonePlan(current);
      const next = stripInvalidPlants(clampPlan({
        ...current,
        widthM: clampMeters(draftWidth),
        heightM: clampMeters(draftHeight),
        allowOutsideBeds: draftAllowOutsideBeds,
        surface: draftSurface,
      }));
      replacePlan(next, { save: true, recordHistory: before });
      setSettingsOpen(false);
      fitToView();
      return;
    }
    const active = environmentRef.current;
    if (!active) return;
    const snap = (value: number, fallback: number) => {
      const finite = Number.isFinite(value) ? value : fallback;
      return Math.max(active.cellM, Math.round(Math.min(MAX_DIM_M, Math.max(active.cellM, finite)) / active.cellM) * active.cellM);
    };
    const widthM = snap(draftWidth, active.widthM);
    const heightM = snap(draftHeight, active.heightM);
    const beforePlan = canonicalPlanRef.current ?? active.plan;
    const layout = layoutWithinBounds(active.layout, widthM, heightM);
    const candidate = { ...active, widthM, heightM, layout };
    let nextPlan = stripInvalidPlants(clampPlan({
      ...beforePlan,
      widthM,
      heightM,
      allowOutsideBeds: draftAllowOutsideBeds,
    }));
    const groundMap = { ...nextPlan.ground };
    const plantingMap = { ...nextPlan.planting };
    const plantedAtMap = nextPlan.plantedAt ? { ...nextPlan.plantedAt } : undefined;
    for (const key of Object.keys(groundMap)) {
      if (cellOverlapsReservedArea(candidate, key)) delete groundMap[key];
    }
    for (const key of Object.keys(plantingMap)) {
      if (cellOverlapsReservedArea(candidate, key)) {
        delete plantingMap[key];
        if (plantedAtMap) delete plantedAtMap[key];
      }
    }
    nextPlan = pruneTargetsForLayout({
      ...nextPlan,
      ground: groundMap,
      planting: plantingMap,
      ...(plantedAtMap ? { plantedAt: plantedAtMap } : {}),
    }, layout);
    const crops = cropCellCount(beforePlan) - cropCellCount(nextPlan);
    const ground = Object.keys(beforePlan.ground).length - Object.keys(nextPlan.ground).length;
    const equipment = (active.instances ?? []).filter((item) => {
      const mount = item.mount;
      return item.x + item.widthM > widthM || item.y + item.depthM > heightM ||
        (mount.kind === 'growing-level' && !layout?.growingSpaces.some((space) =>
          space.id === mount.growingSpaceId && space.levels.some((level) => level.id === mount.levelId),
        )) || instanceOverlapsReservedArea(candidate, item);
    }).length;
    if ((crops + ground + equipment > 0) && !confirmResize) {
      setPendingResize({ widthM, heightM, crops, ground, equipment });
      return;
    }
    const nextEnvironment: Environment = {
      ...active,
      widthM,
      heightM,
      plan: nextPlan,
      layout,
      ...(active.instances ? { instances: active.instances.filter((item) => {
        const mount = item.mount;
        return item.x + item.widthM <= widthM && item.y + item.depthM <= heightM &&
          (mount.kind !== 'growing-level' || !!layout?.growingSpaces.some((space) =>
            space.id === mount.growingSpaceId && space.levels.some((level) => level.id === mount.levelId),
          )) && !instanceOverlapsReservedArea(candidate, item);
      }) } : {}),
    };
    setPendingResize(null);
    void commitEnvironment(nextEnvironment).then(() => {
      setSettingsOpen(false);
      fitToView();
    }).catch((error) => toast.error((error as Error).message));
  }, [commitEnvironment, draftAllowOutsideBeds, draftHeight, draftSurface, draftWidth, fitToView, replacePlan]);

  const cancelResize = useCallback(() => setPendingResize(null), []);

  const exportPng = useCallback(async () => {
    const plan = planRef.current;
    if (!plan) return;
    try {
      const background = environment ? archetypes[environment.archetype].bg : undefined;
      const worldLabel = environment?.label ?? 'Plot';
      const title = environment
        ? `${farm?.name ?? 'Farm'} · ${worldLabel} · ${activeTargetLabel}`
        : `${farm?.name ?? 'Farm'} Plot Plan`;
      const context = environment && ENV_RECORDS_ENABLED ? { environment, target: activeTarget } : undefined;
      const blob = await renderPlanToPng(plan, crops, title, background, context);
      const fileScope = environment ? `${worldLabel}-${activeTargetLabel}` : 'plot';
      const filename = `${(farm?.name ?? 'farm').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${fileScope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      downloadBlob(blob, filename);
      // DES-006: the export used to give no feedback at all.
      toast.success(`Exported ${filename}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [activeTarget, activeTargetLabel, crops, environment, farm?.name]);

  const exportCsv = useCallback(() => {
    if (!stats) return;
    const worldLabel = environment?.label ?? 'Legacy plan';
    const rows = [
      ['growing_world', 'growing_target', 'crop', 'variety', 'plants_needed', 'spacing_cm', 'row_spacing_cm', 'seeds_est', 'sow_window'],
      ...stats.perCrop.map((stat) => [
        worldLabel,
        activeTargetLabel,
        stat.crop.name,
        stat.crop.isCustom ? 'Custom' : '',
        stat.plants,
        stat.crop.spacingCm ?? 30,
        stat.crop.rowSpacingCm ?? stat.crop.spacingCm ?? 30,
        Math.ceil(stat.plants * 1.5),
        sowWindow(stat.crop),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const fileBase = (farm?.name ?? 'farm').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const scope = `${worldLabel}-${activeTargetLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase}-${scope}-shopping-list.csv`);
  }, [activeTargetLabel, environment?.label, farm?.name, stats]);

  const recordLoading = ENV_RECORDS_ENABLED ? siteLoading || selectionLoading : planLoading;
  const isLoading = farmLoading || cropsLoading || recordLoading || initializedFarmRef.current !== farmId;

  useEffect(() => {
    if (recordLoading || cropsLoading) return;
    if (initializedFarmRef.current === farmId) return;
    initializedFarmRef.current = farmId;
    undoRef.current = [];
    redoRef.current = [];
    setHistoryVersion((version) => version + 1);
    setPendingFill(null);
    setPendingResize(null);
    setSelectedKey(null);
    setHoverKey(null);
    if (ENV_RECORDS_ENABLED) {
      const site = storedSite ? cloneSite(storedSite) : null;
      siteRef.current = site;
      setSitePlan(site);
      const selected = storedSelection ?? null;
      const active = site?.environments.find((entry) => entry.id === selected) ?? null;
      setSelectedEnvironmentId(active?.id ?? null);
      setStaleSelectionId(selected && !active ? selected : null);
      if (active) {
        activateEnvironment(active);
      } else {
        scopeRef.current = { kind: 'site' };
        setScope({ kind: 'site' });
        environmentRef.current = null;
        setEnvironment(null);
        planRef.current = null;
        canonicalPlanRef.current = null;
        activeTargetRef.current = { kind: 'floor' };
        setActiveTarget({ kind: 'floor' });
        setStats(null);
        setPairings([]);
        setPlanVersion((version) => version + 1);
      }
      return;
    }
    const plan = storedPlan ? clonePlan(storedPlan) : createDefaultPlan(farmId);
    scopeRef.current = { kind: 'legacy' };
    setScope({ kind: 'legacy' });
    siteRef.current = null;
    setSitePlan(null);
    environmentRef.current = null;
    setEnvironment(null);
    planRef.current = plan;
    canonicalPlanRef.current = plan;
    setDraftWidth(plan.widthM);
    setDraftHeight(plan.heightM);
    setDraftAllowOutsideBeds(plan.allowOutsideBeds);
    setDraftSurface(plan.surface ?? 'outdoor');
    updateStats(plan);
    setPlanVersion((version) => version + 1);
    didInitialFitRef.current = false;
    if (canvasRef.current && shellRef.current) {
      fitToView();
      didInitialFitRef.current = true;
    }
  }, [activateEnvironment, cropsLoading, farmId, fitToView, recordLoading, storedPlan, storedSelection, storedSite, updateStats]);

  useEffect(() => {
    if (!activeCropId && crops.length > 0) setActiveCropId(crops[0].id);
  }, [activeCropId, crops]);

  // Rect/fill tools have no erase payload; keep the shared mode picker sane.
  useEffect(() => {
    if ((tool === 'rect' || tool === 'fill') && rectMode === 'erase') setRectMode('plants');
  }, [rectMode, tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    const resize = () => {
      const rect = shell.getBoundingClientRect();
      canvas.width = Math.max(320, Math.floor(rect.width));
      canvas.height = Math.max(420, Math.floor(rect.height));
      viewportRef.current = { ...viewportRef.current, viewW: canvas.width, viewH: canvas.height };
      if (!didInitialFitRef.current) {
        fitToView();
        didInitialFitRef.current = true;
      } else {
        setViewportVersion((v) => v + 1);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [isLoading, fitToView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheelHandler = (event: WheelEvent) => handleWheel(event);
    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => canvas.removeEventListener('wheel', wheelHandler);
  }, [isLoading, handleWheel]);

  // P0-4: track canvas-area focus so Space is only ever hijacked while the
  // canvas itself holds focus (focused buttons keep native Space activation).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onFocus = () => { canvasFocusedRef.current = true; };
    const onBlur = () => { canvasFocusedRef.current = false; };
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);
    return () => {
      canvas.removeEventListener('focus', onFocus);
      canvas.removeEventListener('blur', onBlur);
    };
  }, [isLoading]);

  useEffect(() => {
    redraw();
  }, [hoverKey, planVersion, rectPreview, redraw, viewportVersion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      // Flight owns the keyboard (including Escape) while it has input captured.
      if (isInputCaptured()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelStroke();
        return;
      }
      if (event.code === 'Space') {
        // Only capture Space while the canvas area holds focus; otherwise the
        // browser's default activates the focused button (a11y fix).
        if (!canvasFocusedRef.current) return;
        event.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        return;
      }
      if (mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === '[' || key === ']') {
        const currentIndex = BRUSH_SIZES.indexOf(brushSize);
        const direction = key === ']' ? 1 : -1;
        const nextIndex = (currentIndex + direction + BRUSH_SIZES.length) % BRUSH_SIZES.length;
        setBrushSize(BRUSH_SIZES[nextIndex]);
        return;
      }
      if (key === 'v') setTool('select');
      else if (key === 'b') setTool('brush');
      else if (key === 'r') setTool('rect');
      else if (key === 'l') setTool('line');
      else if (key === 'g') setTool('fill');
      else if (key === 'i') setTool('pick');
      else if (key === 'a') setTool('asset');
      else if (key === 'e') setTool('erase');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [brushSize, cancelStroke, redo, undo]);

  // Preference persistence: single writer effect per flag keeps localStorage
  // in lockstep no matter how many UI surfaces flip the toggle.
  useEffect(() => { writePref(PREF_KEYS.overlaySpacing, showSpacing); }, [showSpacing]);
  useEffect(() => { writePref(PREF_KEYS.overlayCompanions, showCompanions); }, [showCompanions]);
  useEffect(() => { writePref(PREF_KEYS.layerPlants, showPlants); }, [showPlants]);
  useEffect(() => { writePref(PREF_KEYS.layerGround, showGround); }, [showGround]);

  useEffect(() => () => { void flushAutosave(); }, [flushAutosave]);

  const toggleSpacing = useCallback(() => setShowSpacing((v) => !v), []);
  const toggleCompanions = useCallback(() => setShowCompanions((v) => !v), []);
  const toggleSimMoisture = useCallback(() => setShowSimMoisture((v) => !v), []);
  const toggleSimStress = useCallback(() => setShowSimStress((v) => !v), []);
  const toggleSimReady = useCallback(() => setShowSimReady((v) => !v), []);
  const togglePlantsLayer = useCallback(() => setShowPlants((v) => !v), []);
  const toggleGroundLayer = useCallback(() => setShowGround((v) => !v), []);

  const zoomPct = useMemo(
    () => Math.round((viewportRef.current.cellPx / ZOOM_BASE_PX) * 100),
    [viewportVersion],
  );
  const zoomLabel = `${Math.round(viewportRef.current.cellPx)} px/cell`;
  const antagonists = pairings.filter((p) => p.kind === 'antagonist');
  const companions = pairings.filter((p) => p.kind === 'companion');

  return {
    // data
    farm,
    crops,
    isLoading,
    featureEnabled: ENV_RECORDS_ENABLED,
    scope,
    sitePlan,
    environments: sitePlan?.environments ?? [],
    environment,
    selectedEnvironmentId,
    staleSelectionId,
    activeTarget,
    activeTargetKey,
    activeTargetLabel,
    targetOptions,
    rackTierCount,
    setRackTierCount,
    maxRackTiers,

    // refs
    canvasRef,
    shellRef,
    planRef,
    canonicalPlanRef,
    viewportRef,
    dragRef,
    spaceHeldRef,
    undoRef,
    redoRef,

    // tool/state
    tool,
    setTool,
    activeCropId,
    setActiveCropId,
    activeAssetSlug,
    setActiveAssetSlug,
    brushSize,
    setBrushSize,
    eraseLayer,
    setEraseLayer,
    rectMode,
    setRectMode,
    cropSearch,
    setCropSearch,
    filteredCrops,
    selectedKey,
    setSelectedKey,
    hoverKey,
    setHoverKey,
    rectPreview,
    setRectPreview,
    lineDraft,
    setLineDraft,
    saveState,
    savedAt,
    stats,
    pairings,
    planVersion,
    viewportVersion,
    settingsOpen,
    setSettingsOpen,
    pendingResize,
    cancelResize,
    confirmResize: () => applySettings(true),
    draftWidth,
    setDraftWidth,
    draftHeight,
    setDraftHeight,
    draftAllowOutsideBeds,
    setDraftAllowOutsideBeds,
    draftSurface,
    setDraftSurface,
    /** Legacy renderer surface adapter; archetype is the saved source of truth when enabled. */
    surface: (environment?.archetype ? LEGACY_SURFACE_FOR_ARCHETYPE[environment.archetype] : planRef.current?.surface ?? 'outdoor') as PlanSurface,
    archetype: environment?.archetype ?? null,
    paletteCategories: environment ? archetypes[environment.archetype].palette : null,
    planningProfile: environment ? planningProfiles[archetypes[environment.archetype].planningProfile] : null,
    historyVersion,
    spaceHeld,
    isPanning,

    // overlays & layers (P0-5 / P1-7 / P1-8)
    showSpacing,
    toggleSpacing,
    showCompanions,
    toggleCompanions,
    showPlants,
    togglePlantsLayer,
    showGround,
    toggleGroundLayer,

    // sim-run overlays (SPEC-GROWTH-VISUAL wave 5) — channels present ⇒ run active
    simChannels,
    setSimChannels,
    showSimMoisture,
    toggleSimMoisture,
    showSimStress,
    toggleSimStress,
    showSimReady,
    toggleSimReady,

    // derived
    cropById,
    activeCrop,
    activeAsset,
    conflictCells,
    selectedInfo,
    placementMessage,
    zoomLabel,
    zoomPct,
    antagonists,
    companions,

    // operations
    mutateCell,
    applyBrushAt,
    applyRect,
    applyLineCells,
    applyFillAt,
    pendingFill,
    confirmFill,
    cancelFill,
    pickAt,
    cancelStroke,
    finishStroke,
    handlePointerDown,
    handlePointerMove,
    handleWheel,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomFit,
    undo,
    redo,
    fitToView,
    applySettings,
    replacePlan,
    scheduleAutosave,
    flushAutosave,
    applyTemplate,
    showSite,
    selectEnvironment,
    selectTarget,
    growingSpaceRemovalPreview,
    removeGrowingSpace,
    removeEquipmentInstance,
    updateEnvironmentSetpoints,
    startNextPlan,
    commitExternalEnvironmentMutation,
    createWorld,
    moveWorld,
    saveWorld,
    duplicateWorld,
    deleteWorld,
    getCellFromEvent,
    exportPng,
    exportCsv,
    updateStats,
  };
}

export type PlanEditor = ReturnType<typeof usePlanEditor>;
