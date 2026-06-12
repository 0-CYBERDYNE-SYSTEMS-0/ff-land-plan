import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { assetBySlug, assetLibrary } from '@/data/assets';
import { apiFetch } from '@/lib/api';
import {
  canPlantAt,
  cellKey,
  clampPlan,
  computeStats,
  conflictCellSet,
  createDefaultPlan,
  findPairings,
  parseKey,
  planCols,
  planRows,
  type PlanPairing,
  type PlanStats,
} from '@/lib/plan';
import { drawPlan, renderPlanToPng } from '@/lib/renderPlan';
import { useFarm } from '@/hooks/useFarms';
import { useTheme } from '@/hooks/useTheme';
import type { Crop, GardenAsset, PlanState } from '@/types';

export type Tool = 'select' | 'brush' | 'rect' | 'asset' | 'erase';
export type EraseLayer = 'plants' | 'ground';
export type RectMode = 'plants' | 'asset';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface Viewport {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  viewW: number;
  viewH: number;
}

interface DragState {
  kind: 'paint' | 'rect' | 'pan' | 'gesture' | null;
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
const MIN_DIM_M = 2;
const MAX_DIM_M = 60;
const AUTOSAVE_MS = 600;
const HISTORY_LIMIT = 50;

const clonePlan = (plan: PlanState): PlanState => ({
  ...plan,
  planting: { ...plan.planting },
  ground: { ...plan.ground },
});

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
  for (const key of Object.keys(planting)) {
    if (!canPlantAt(plan, key)) delete planting[key];
  }
  return { ...plan, planting };
}

function sameCell(a: string | null, b: string | null) {
  return a === b;
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

function sowWindow(crop: Crop): string {
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
  const initializedFarmRef = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [activeCropId, setActiveCropId] = useState<number | null>(null);
  const [activeAssetSlug, setActiveAssetSlug] = useState(assetLibrary[0]?.slug ?? '');
  const [brushSize, setBrushSize] = useState<1 | 3>(1);
  const [eraseLayer, setEraseLayer] = useState<EraseLayer>('plants');
  const [rectMode, setRectMode] = useState<RectMode>('plants');
  const [cropSearch, setCropSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [rectPreview, setRectPreview] = useState<{ x0: number; y0: number; x1: number; y1: number; color: string } | null>(null);
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

  const updateStats = useCallback((plan: PlanState) => {
    setStats(computeStats(plan, crops));
    setPairings(findPairings(plan, crops));
  }, [crops]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const plan = planRef.current;
    if (!canvas || !plan) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const viewport = viewportRef.current;
    drawPlan(ctx, plan, {
      ...viewport,
      cropById,
      conflictCells,
      hoverKey,
      rectPreview,
      theme,
    });
  }, [conflictCells, cropById, hoverKey, rectPreview, theme]);

  const fitToView = useCallback(() => {
    const plan = planRef.current;
    if (!plan) return;
    const viewport = viewportRef.current;
    const cols = planCols(plan);
    const rows = planRows(plan);
    const fitPx = Math.max(4, Math.min((viewport.viewW - 48) / cols, (viewport.viewH - 48) / rows));
    const level = ZOOM_LEVELS.reduce((best, levelPx) =>
      Math.abs(levelPx - fitPx) < Math.abs(best - fitPx) ? levelPx : best,
    ZOOM_LEVELS[0]);
    const cellPx = Math.max(4, Math.min(36, Math.min(level, fitPx)));
    viewportRef.current = {
      ...viewport,
      cellPx,
      offsetX: Math.round((viewport.viewW - cols * cellPx) / 2),
      offsetY: Math.round((viewport.viewH - rows * cellPx) / 2),
    };
    setViewportVersion((v) => v + 1);
  }, []);

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

  const mutateCell = useCallback((x: number, y: number): boolean => {
    const plan = planRef.current;
    if (!plan || x < 0 || y < 0 || x >= planCols(plan) || y >= planRows(plan)) return false;
    const key = cellKey(x, y);
    if (tool === 'brush') {
      if (!activeCropId || !canPlantAt(plan, key) || plan.planting[key] === activeCropId) return false;
      plan.planting[key] = activeCropId;
      return true;
    }
    if (tool === 'erase') {
      if (eraseLayer === 'plants') {
        if (!plan.planting[key]) return false;
        delete plan.planting[key];
        return true;
      }
      if (!plan.ground[key]) return false;
      delete plan.ground[key];
      if (!canPlantAt(plan, key)) delete plan.planting[key];
      return true;
    }
    if (tool === 'asset' && activeAsset) {
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
          changed = true;
        } else if (activeAsset) {
          if (plan.ground[key] !== activeAsset.slug) {
            plan.ground[key] = activeAsset.slug;
            changed = true;
          }
          if (!activeAsset.plantable && plan.planting[key]) {
            delete plan.planting[key];
            changed = true;
          }
        }
      }
    }
    return changed;
  }, [activeAsset, activeCropId, rectMode]);

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
    const endCell = event ? getCellFromEvent(event) : null;
    const endKey = endCell?.key ?? hoverKey;
    if (drag.kind === 'rect' && plan && endKey) {
      const [endX, endY] = parseKey(endKey);
      drag.changed = applyRect(drag.startX, drag.startY, endX, endY) || drag.changed;
      setRectPreview(null);
      if (drag.changed) {
        updateStats(plan);
        setPlanVersion((v) => v + 1);
      }
    }
    if (drag.changed && drag.before && plan) {
      undoRef.current = [...undoRef.current, drag.before].slice(-HISTORY_LIMIT);
      redoRef.current = [];
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
  }, [applyRect, getCellFromEvent, hoverKey, scheduleAutosave, updateStats]);

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
      if (drag.kind === 'paint' || drag.kind === 'rect') {
        if (drag.before) {
          planRef.current = drag.before;
          updateStats(drag.before);
          setPlanVersion((v) => v + 1);
        }
        setRectPreview(null);
      }
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
      return;
    }
    if (!cell) return;
    if (tool === 'select') {
      setSelectedKey(cell.key);
      return;
    }
    const before = clonePlan(plan);
    dragRef.current = {
      kind: tool === 'rect' ? 'rect' : 'paint',
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
    } else {
      applyBrushAt(cell.x, cell.y);
    }
  }, [activeAsset, activeCrop, applyBrushAt, getCellFromEvent, rectMode, tool, updateStats]);

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
  }, [activeAsset, activeCrop, applyBrushAt, getCellFromEvent, rectMode]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const plan = planRef.current;
    const canvas = canvasRef.current;
    if (!plan || !canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvas.width / rect.width);
    const py = (event.clientY - rect.top) * (canvas.height / rect.height);
    const viewport = viewportRef.current;
    const oldCellPx = viewport.cellPx;
    const oldIndex = ZOOM_LEVELS.reduce((best, level, index) =>
      Math.abs(level - oldCellPx) < Math.abs(ZOOM_LEVELS[best] - oldCellPx) ? index : best,
    0);
    const nextIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, oldIndex + (event.deltaY < 0 ? 1 : -1)));
    const nextCellPx = ZOOM_LEVELS[nextIndex];
    if (nextCellPx === oldCellPx) return;
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

  const applySettings = useCallback(() => {
    const current = planRef.current;
    if (!current) return;
    const before = clonePlan(current);
    const next = stripInvalidPlants(clampPlan({
      ...current,
      widthM: clampMeters(draftWidth),
      heightM: clampMeters(draftHeight),
      allowOutsideBeds: draftAllowOutsideBeds,
    }));
    replacePlan(next, { save: true, recordHistory: before });
    setSettingsOpen(false);
    fitToView();
  }, [draftAllowOutsideBeds, draftHeight, draftWidth, fitToView, replacePlan]);

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
      if (event.code === 'Space') {
        event.preventDefault();
        spaceHeldRef.current = true;
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'v') setTool('select');
      if (key === 'b') setTool('brush');
      if (key === 'r') setTool('rect');
      if (key === 'a') setTool('asset');
      if (key === 'e') setTool('erase');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [redo, undo]);

  useEffect(() => () => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
  }, []);

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

    // derived
    cropById,
    activeCrop,
    activeAsset,
    conflictCells,
    selectedInfo,
    zoomLabel,
    antagonists,
    companions,

    // operations
    mutateCell,
    applyBrushAt,
    applyRect,
    finishStroke,
    handlePointerDown,
    handlePointerMove,
    handleWheel,
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
