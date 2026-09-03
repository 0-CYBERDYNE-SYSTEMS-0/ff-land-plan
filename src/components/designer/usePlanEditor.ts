import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { assetBySlug, assetLibrary } from '@/data/assets';
import { apiFetch } from '@/lib/api';
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
import { drawPlan, renderPlanToPng, type RenderOptions } from '@/lib/renderPlan';
import { useFarm } from '@/hooks/useFarms';
import { useTheme } from '@/hooks/useTheme';
import type { Crop, GardenAsset, PlanState, PlanSurface } from '@/types';

export type Tool = 'select' | 'brush' | 'rect' | 'asset' | 'erase' | 'pick' | 'fill' | 'line';
export type BrushSize = 1 | 3 | 5;
export type EraseLayer = 'plants' | 'ground';
export type RectMode = 'plants' | 'asset' | 'erase';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

// Assets tagged with `surfaces` may only be painted on matching canvases; the
// palette filters on this and every asset-writing mutation re-checks it.
function assetAllowedOnSurface(asset: GardenAsset, plan: PlanState): boolean {
  return !asset.surfaces || asset.surfaces.includes(plan.surface ?? 'outdoor');
}

export interface Viewport {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  viewW: number;
  viewH: number;
}

interface DragState {
  kind: 'paint' | 'rect' | 'line' | 'pan' | 'gesture' | null;
  before: PlanState | null;
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
const BRUSH_SIZES: BrushSize[] = [1, 3, 5];
const ERASE_GHOST_COLOR = '#ef4444';

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

function sameCell(a: string | null, b: string | null) {
  return a === b;
}

// P1-3: integer Bresenham walk, inclusive of both endpoints.
function bresenhamCells(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
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
  const { data: storedPlan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', farmId],
    queryFn: () => apiFetch.getPlan(farmId),
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const planRef = useRef<PlanState | null>(null);
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
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; midX: number; midY: number } | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const undoRef = useRef<PlanState[]>([]);
  const redoRef = useRef<PlanState[]>([]);
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
  const [rectPreview, setRectPreview] = useState<{ x0: number; y0: number; x1: number; y1: number; color: string } | null>(null);
  const [lineDraft, setLineDraft] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
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

  const cropById = useMemo(() => new Map(crops.map((crop) => [crop.id, crop])), [crops]);
  const activeCrop = activeCropId ? cropById.get(activeCropId) ?? null : null;
  const activeAsset = assetBySlug(activeAssetSlug) ?? assetLibrary[0];
  const conflictCells = useMemo(() => conflictCellSet(pairings), [pairings]);

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
      plantable: canPlantAt(plan, selectedKey),
      companions,
      antagonists,
    };
  }, [cropById, planVersion, selectedKey]);

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
      return { cells: squareCells(brushSize), colorHex: activeCrop.colorHex };
    }
    if (tool === 'asset' && activeAsset) {
      const fp = footprintCells(activeAsset, plan);
      const cells: Array<[number, number]> = [];
      for (let y = hy; y < hy + fp.rows; y++) {
        for (let x = hx; x < hx + fp.cols; x++) {
          if (inBounds(x, y)) cells.push([x, y]);
        }
      }
      return { cells, colorHex: activeAsset.colorHex };
    }
    if (tool === 'erase') {
      return { cells: squareCells(brushSize), colorHex: ERASE_GHOST_COLOR };
    }
    return null;
  }, [activeAsset, activeCrop, brushSize, hoverKey, isPanning, lineDraft, planVersion, rectMode, spaceHeld, tool]);

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
    }),
    [companionHalos, ghost, showGround, showPlants, spacingViolations],
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
      surface: plan.surface ?? 'outdoor',
      ...overlayOpts,
    };
    drawPlan(ctx, plan, opts);
  }, [conflictCells, cropById, hoverKey, overlayOpts, rectPreview, theme]);

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

  const scheduleAutosave = useCallback((nextPlan: PlanState) => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    setSaveState('dirty');
    autosaveRef.current = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        const saved = await apiFetch.savePlan(nextPlan);
        planRef.current = clonePlan(saved);
        setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        setSaveState('saved');
        queryClient.setQueryData(['plan', farmId], saved);
      } catch (err) {
        setSaveState('error');
        toast.error((err as Error).message);
      }
    }, AUTOSAVE_MS);
  }, [farmId, queryClient]);

  const replacePlan = useCallback((nextPlan: PlanState, options: { save?: boolean; recordHistory?: PlanState } = {}) => {
    planRef.current = nextPlan;
    updateStats(nextPlan);
    setPlanVersion((v) => v + 1);
    if (options.recordHistory) {
      undoRef.current = [...undoRef.current, options.recordHistory].slice(-HISTORY_LIMIT);
      redoRef.current = [];
    }
    if (options.save) scheduleAutosave(nextPlan);
  }, [scheduleAutosave, updateStats]);

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
      if (!activeCropId || !canPlantAt(plan, key) || plan.planting[key] === activeCropId) return false;
      plan.planting[key] = activeCropId;
      stampPlantedAt(plan, key);
      return true;
    }
    if (mode === 'erase') {
      if (eraseLayer === 'plants') {
        if (!plan.planting[key]) return false;
        delete plan.planting[key];
        clearPlantedAt(plan, key);
        return true;
      }
      if (!plan.ground[key]) return false;
      delete plan.ground[key];
      if (!canPlantAt(plan, key)) {
        delete plan.planting[key];
        clearPlantedAt(plan, key);
      }
      return true;
    }
    if (mode === 'asset' && activeAsset && assetAllowedOnSurface(activeAsset, plan)) {
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
  }, [activeAsset, activeCropId, eraseLayer, tool]);

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
      updateStats(planRef.current);
      setPlanVersion((v) => v + 1);
    }
  }, [brushSize, mutateCell, tool, updateStats]);

  const applyRect = useCallback((x0: number, y0: number, x1: number, y1: number): boolean => {
    const plan = planRef.current;
    if (!plan) return false;
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(planCols(plan) - 1, Math.max(x0, x1));
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(planRows(plan) - 1, Math.max(y0, y1));
    let changed = false;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const key = cellKey(x, y);
        if (rectMode === 'plants') {
          if (!activeCropId || !canPlantAt(plan, key) || plan.planting[key] === activeCropId) continue;
          plan.planting[key] = activeCropId;
          stampPlantedAt(plan, key);
          changed = true;
        } else if (rectMode === 'asset' && activeAsset && assetAllowedOnSurface(activeAsset, plan)) {
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
      }
    }
    return changed;
  }, [activeAsset, activeCropId, rectMode]);

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

    const before = clonePlan(plan); // ONE undo snapshot for the whole fill
    let changed = false;
    for (const [x, y] of region) {
      if (rectMode === 'asset') {
        // Asset fill assigns the slug per cell (rect-style) instead of
        // stamping a full footprint per region cell.
        const key = cellKey(x, y);
        if (activeAsset && assetAllowedOnSurface(activeAsset, plan)) {
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
    undoRef.current = [...undoRef.current, before].slice(-HISTORY_LIMIT);
    redoRef.current = [];
    if (planRef.current) updateStats(planRef.current);
    setPlanVersion((v) => v + 1);
    scheduleAutosave(clonePlan(plan)); // one autosave through the 600 ms debounce
  }, [activeAsset, mutateCell, rectMode, scheduleAutosave, updateStats]);

  // P0-4: Escape cancels any in-flight stroke (restoring its before-snapshot
  // without a history entry), clears the rect/line previews and the selection.
  const cancelStroke = useCallback(() => {
    const drag = dragRef.current;
    if ((drag.kind === 'paint' || drag.kind === 'rect' || drag.kind === 'line') && drag.before) {
      planRef.current = drag.before;
      updateStats(drag.before);
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
  }, [updateStats]);

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
    if (drag.changed && drag.before && plan) {
      // History push FIRST, then the version bump — the very render triggered
      // by this bump already sees the enabled Undo button (P0-4).
      undoRef.current = [...undoRef.current, drag.before].slice(-HISTORY_LIMIT);
      redoRef.current = [];
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
  }, [applyLineCells, applyRect, getCellFromEvent, hoverKey, scheduleAutosave, updateStats]);

  const undo = useCallback(() => {
    const current = planRef.current;
    const previous = undoRef.current.pop();
    if (!current || !previous) return;
    redoRef.current = [...redoRef.current, clonePlan(current)].slice(-HISTORY_LIMIT);
    replacePlan(clonePlan(previous), { save: true });
  }, [replacePlan]);

  const redo = useCallback(() => {
    const current = planRef.current;
    const next = redoRef.current.pop();
    if (!current || !next) return;
    undoRef.current = [...undoRef.current, clonePlan(current)].slice(-HISTORY_LIMIT);
    replacePlan(clonePlan(next), { save: true });
  }, [replacePlan]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const plan = planRef.current;
    if (!plan) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const drag = dragRef.current;
      if (drag.kind === 'paint' || drag.kind === 'rect' || drag.kind === 'line') {
        if (drag.before) {
          planRef.current = drag.before;
          updateStats(drag.before);
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
    if (drag.kind === 'paint') applyBrushAt(cell.x, cell.y);
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

  const applySettings = useCallback(() => {
    const current = planRef.current;
    if (!current) return;
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
  }, [draftAllowOutsideBeds, draftHeight, draftSurface, draftWidth, fitToView, replacePlan]);

  const exportPng = useCallback(async () => {
    const plan = planRef.current;
    if (!plan) return;
    try {
      const blob = await renderPlanToPng(plan, crops, `${farm?.name ?? 'Farm'} Plot Plan`);
      downloadBlob(blob, `${(farm?.name ?? 'farm').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-plot.png`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [crops, farm?.name]);

  const exportCsv = useCallback(() => {
    if (!stats) return;
    const rows = [
      ['crop', 'variety', 'plants_needed', 'spacing_cm', 'row_spacing_cm', 'seeds_est', 'sow_window'],
      ...stats.perCrop.map((stat) => [
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
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase}-shopping-list.csv`);
  }, [farm?.name, stats]);

  const isLoading = farmLoading || cropsLoading || planLoading || !planRef.current;

  useEffect(() => {
    if (planLoading || cropsLoading) return;
    if (initializedFarmRef.current === farmId) return;
    const plan = storedPlan ? clonePlan(storedPlan) : createDefaultPlan(farmId);
    initializedFarmRef.current = farmId;
    planRef.current = plan;
    setDraftWidth(plan.widthM);
    setDraftHeight(plan.heightM);
    setDraftAllowOutsideBeds(plan.allowOutsideBeds);
    setDraftSurface(plan.surface ?? 'outdoor');
    updateStats(plan);
    setPlanVersion((v) => v + 1);
    didInitialFitRef.current = false;
    if (canvasRef.current && shellRef.current) {
      fitToView();
      didInitialFitRef.current = true;
    }
  }, [cropsLoading, farmId, fitToView, planLoading, storedPlan, updateStats]);

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

  useEffect(() => () => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
  }, []);

  const toggleSpacing = useCallback(() => setShowSpacing((v) => !v), []);
  const toggleCompanions = useCallback(() => setShowCompanions((v) => !v), []);
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

    // refs
    canvasRef,
    shellRef,
    planRef,
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
    draftWidth,
    setDraftWidth,
    draftHeight,
    setDraftHeight,
    draftAllowOutsideBeds,
    setDraftAllowOutsideBeds,
    draftSurface,
    setDraftSurface,
    /** Current plan surface ('outdoor' when unset) — palettes filter on this. */
    surface: (planRef.current?.surface ?? 'outdoor') as PlanSurface,
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

    // derived
    cropById,
    activeCrop,
    activeAsset,
    conflictCells,
    selectedInfo,
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
    getCellFromEvent,
    exportPng,
    exportCsv,
    updateStats,
  };
}

export type PlanEditor = ReturnType<typeof usePlanEditor>;
