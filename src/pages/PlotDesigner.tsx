import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BoxSelect,
  Brush,
  Check,
  Download,
  Eraser,
  FileSpreadsheet,
  Hand,
  Leaf,
  Map as MapIcon,
  MousePointer2,
  Redo2,
  Ruler,
  Search,
  Settings,
  Sprout,
  Undo2,
} from 'lucide-react';

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
  plantsForArea,
  planCols,
  planRows,
  type PlanPairing,
  type PlanStats,
} from '@/lib/plan';
import { drawPlan, renderPlanToPng } from '@/lib/renderPlan';
import { useFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AssetCategory, Crop, GardenAsset, PlanState } from '@/types';

type Tool = 'select' | 'brush' | 'rect' | 'asset' | 'erase';
type EraseLayer = 'plants' | 'ground';
type RectMode = 'plants' | 'asset';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Viewport {
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

const TOOL_OPTIONS: { tool: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { tool: 'brush', label: 'Brush', key: 'B', icon: Brush },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: BoxSelect },
  { tool: 'asset', label: 'Asset', key: 'A', icon: MapIcon },
  { tool: 'erase', label: 'Erase', key: 'E', icon: Eraser },
];

const ASSET_CATEGORIES: AssetCategory[] = ['growing', 'infrastructure', 'life'];

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

export function PlotDesigner({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
  };

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

  const applySettings = () => {
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
  };

  const exportPng = async () => {
    const plan = planRef.current;
    if (!plan) return;
    try {
      const blob = await renderPlanToPng(plan, crops, `${farm?.name ?? 'Farm'} Plot Plan`);
      downloadBlob(blob, `${(farm?.name ?? 'farm').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-plot.png`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportCsv = () => {
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
  };

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

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-[75vh] w-full" /></div>;
  }
  if (!farm) return <div className="p-6">Farm not found.</div>;
  const currentPlan = planRef.current;
  if (!currentPlan) return <div className="p-6">Plan not found.</div>;

  return (
    <div className="flex flex-col p-4 lg:p-6 space-y-4 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-primary" /> Plot Designer
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {farm.name} · {currentPlan.widthM} m × {currentPlan.heightM} m · 25 cm cells
          </p>
        </div>
        <Badge variant={saveState === 'error' ? 'destructive' : 'secondary'} className="gap-1">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? `Saved ${savedAt ?? ''}` : saveState === 'dirty' ? 'Unsaved' : 'Ready'}
          {saveState === 'saved' && <Check className="w-3 h-3" />}
        </Badge>
      </div>

      <div className="grid gap-4 xl:flex-1 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border p-0.5">
              {TOOL_OPTIONS.map((option) => (
                <Button
                  key={option.tool}
                  variant={tool === option.tool ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs"
                  title={`${option.label} (${option.key})`}
                  onClick={() => setTool(option.tool)}
                >
                  <option.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{option.label}</span>
                </Button>
              ))}
            </div>
            {(tool === 'brush' || tool === 'erase') && (
              <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                <Button variant={brushSize === 1 ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 text-xs" onClick={() => setBrushSize(1)}>1×1</Button>
                <Button variant={brushSize === 3 ? 'secondary' : 'ghost'} size="sm" className="h-8 px-2 text-xs" onClick={() => setBrushSize(3)}>3×3</Button>
              </div>
            )}
            {tool === 'erase' && (
              <Select value={eraseLayer} onValueChange={(v) => setEraseLayer(v as EraseLayer)}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plants">Plants</SelectItem>
                  <SelectItem value="ground">Ground</SelectItem>
                </SelectContent>
              </Select>
            )}
            {tool === 'rect' && (
              <Select value={rectMode} onValueChange={(v) => setRectMode(v as RectMode)}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plants">Plants</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={undo} disabled={undoRef.current.length === 0} title="Undo">
                <Undo2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Undo</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={redo} disabled={redoRef.current.length === 0} title="Redo">
                <Redo2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Redo</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={fitToView} title="Fit">
                <Ruler className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Fit</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={exportPng} title="Export PNG">
                <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PNG</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={exportCsv} disabled={!stats || stats.perCrop.length === 0} title="Export CSV">
                <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setSettingsOpen((o) => !o)} title="Settings">
                <Settings className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Settings</span>
              </Button>
            </div>
          </div>

          {settingsOpen && (
            <div className="grid gap-3 border-b border-border bg-muted/40 p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Width (m)</Label>
                <Input type="number" min={MIN_DIM_M} max={MAX_DIM_M} step="0.25" value={draftWidth} onChange={(e) => setDraftWidth(Number(e.target.value))} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height (m)</Label>
                <Input type="number" min={MIN_DIM_M} max={MAX_DIM_M} step="0.25" value={draftHeight} onChange={(e) => setDraftHeight(Number(e.target.value))} className="h-8" />
              </div>
              <label className="flex items-center gap-2 pt-5 text-sm">
                <input
                  type="checkbox"
                  checked={draftAllowOutsideBeds}
                  onChange={(e) => setDraftAllowOutsideBeds(e.target.checked)}
                />
                Allow planting outside beds
              </label>
              <Button size="sm" className="mt-5 h-8" onClick={applySettings}>Apply</Button>
            </div>
          )}

          <div ref={shellRef} className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1">
            <canvas
              ref={canvasRef}
              className={cn('block h-full w-full touch-none', spaceHeldRef.current || dragRef.current.kind === 'pan' ? 'cursor-grabbing' : 'cursor-crosshair')}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onPointerLeave={() => setHoverKey(null)}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <span className="flex items-center gap-1"><Hand className="w-3 h-3" /> Space/middle drag pans</span>
              <span>Wheel zooms around cursor</span>
              <span>{zoomLabel}</span>
              {hoverKey && activeCrop && (tool === 'brush' || (tool === 'rect' && rectMode === 'plants')) && (
                <span className="text-foreground">Painting {activeCrop.name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sprout className="w-4 h-4" /> Crop Palette
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={cropSearch} onChange={(e) => setCropSearch(e.target.value)} placeholder="Search crops…" className="h-8 pl-7 text-sm" />
              </div>
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {filteredCrops.map((crop) => (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => {
                      setActiveCropId(crop.id);
                      if (tool === 'asset') setTool('brush');
                    }}
                    className={cn(
                      'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted',
                      activeCropId === crop.id ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: crop.colorHex + '33' }}>
                      {crop.emoji ?? <Leaf className="w-3 h-3" />}
                    </span>
                    <span className="truncate">{crop.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapIcon className="w-4 h-4" /> Assets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ASSET_CATEGORIES.map((category) => (
                <div key={category} className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {assetLibrary.filter((asset) => asset.category === category).map((asset) => (
                      <button
                        key={asset.slug}
                        type="button"
                        onClick={() => {
                          setActiveAssetSlug(asset.slug);
                          if (tool !== 'rect') setTool('asset');
                        }}
                        className={cn(
                          'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted',
                          activeAssetSlug === asset.slug ? 'border-primary bg-primary/10' : 'border-border',
                        )}
                        title={asset.description}
                      >
                        <span className="h-4 w-4 rounded-sm" style={{ background: asset.colorHex }} />
                        <span className="truncate">{asset.emoji} {asset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Plan Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {stats && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Planted" value={`${stats.plantedAreaM2.toFixed(1)} m²`} />
                    <Metric label="Beds" value={`${stats.bedAreaM2.toFixed(1)} m²`} />
                    <Metric label="Paths/infra" value={`${stats.infrastructureAreaM2.toFixed(1)} m²`} />
                    <Metric label="Yield" value={`${stats.totalYieldKg.toFixed(0)} kg`} />
                    <Metric label="Water" value={`${stats.totalWaterLDay.toFixed(0)} L/day`} />
                    <Metric label="Families" value={String(stats.families.length)} />
                  </div>
                  <div className="space-y-2">
                    {stats.perCrop.map((stat) => (
                      <div key={stat.crop.id} className="rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 font-medium">
                            <span className="mr-1">{stat.crop.emoji}</span>{stat.crop.name}
                          </div>
                          <Badge variant="secondary">≈{stat.plants} plants</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {stat.areaM2.toFixed(1)} m² · {stat.yieldKg.toFixed(1)} kg yield · {stat.waterLDay.toFixed(1)} L/day
                        </div>
                      </div>
                    ))}
                    {stats.perCrop.length === 0 && <p className="text-xs text-muted-foreground">No crops painted yet.</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pairings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {antagonists.map((pairing) => (
                <div key={`${pairing.a.id}-${pairing.b.id}-bad`} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                  {pairing.a.name} inhibits {pairing.b.name} — keep 1 m apart.
                </div>
              ))}
              {companions.slice(0, 4).map((pairing) => (
                <div key={`${pairing.a.id}-${pairing.b.id}-good`} className="rounded-md border border-green-500/30 bg-green-500/10 p-2 text-green-700 dark:text-green-300">
                  {pairing.a.name} pairs well with {pairing.b.name}.
                </div>
              ))}
              {pairings.length === 0 && <p className="text-muted-foreground">No companion or antagonist adjacencies yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Selection</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {selectedInfo ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Cell {selectedInfo.x}, {selectedInfo.y}</div>
                  <div>Crop: {selectedInfo.crop ? `${selectedInfo.crop.emoji ?? ''} ${selectedInfo.crop.name}` : 'None'}</div>
                  {selectedInfo.crop && (
                    <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">
                        {selectedInfo.crop.scientificName ?? selectedInfo.crop.family ?? selectedInfo.crop.category}
                      </div>
                      <div>
                        Spacing {selectedInfo.crop.spacingCm ?? 30} cm × {selectedInfo.crop.rowSpacingCm ?? selectedInfo.crop.spacingCm ?? 30} cm
                        {' '}· this cell contributes ≈{plantsForArea(selectedInfo.crop, 1)} plant
                      </div>
                      <div>
                        Family {selectedInfo.crop.family ?? 'Unknown'} · {selectedInfo.crop.frostTolerance ?? 'unknown'} frost tolerance
                      </div>
                    </div>
                  )}
                  <div>Ground: {selectedInfo.asset ? `${selectedInfo.asset.emoji} ${selectedInfo.asset.label}` : 'Bare soil'}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedInfo.plantable ? 'Planting allowed here.' : 'This ground blocks planting.'}
                  </div>
                  {selectedInfo.companions.length > 0 && (
                    <div className="text-xs text-green-700 dark:text-green-300">
                      Nearby companions: {selectedInfo.companions.map((crop) => crop.name).join(', ')}
                    </div>
                  )}
                  {selectedInfo.antagonists.length > 0 && (
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      Nearby conflicts: {selectedInfo.antagonists.map((crop) => crop.name).join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Use Select (V) and click a cell to inspect it.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
