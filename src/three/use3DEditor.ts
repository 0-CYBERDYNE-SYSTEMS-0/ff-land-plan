import { useCallback, useRef } from 'react';
import * as THREE from 'three';

import { bresenhamCells, type PlanEditor } from '@/components/designer/usePlanEditor';
import type { PlanState } from '@/types';
import { cellKey, planCols, planRows } from '@/lib/plan';

interface RaycastResult {
  x: number;
  y: number;
  key: string;
}

// Module-level scratch set: exactly one raycaster/ground-plane/NDC/hit point
// reused by every pointer event (there is one 3D world per app), so the
// hover + paint path allocates nothing per move.
const sharedRaycaster = new THREE.Raycaster();
const sharedGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const sharedNDC = new THREE.Vector2();
const sharedHitPoint = new THREE.Vector3();

export function use3DEditor(
  editor: PlanEditor,
  onHoverCell?: (cell: { x: number; y: number; key: string } | null) => void,
) {
  const {
    planRef,
    tool,
    activeAsset,
    applyBrushAt,
    applyRect,
    applyLineCells,
    applyFillAt,
    pickAt,
    replacePlan,
    setRectPreview,
    setSelectedKey,
  } = editor;
  const dragRef = useRef<{
    kind: 'paint' | 'rect' | 'line' | null;
    before: PlanState | null;
    changed: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>({ kind: null, before: null, changed: false, startX: 0, startY: 0, lastX: 0, lastY: 0 });

  // Latest hover callback behind a ref (mirrors the canvas handlersRef
  // pattern) plus the last reported key so the callback fires once per cell
  // change — and exactly one null when the pointer leaves the plan.
  const onHoverCellRef = useRef(onHoverCell);
  onHoverCellRef.current = onHoverCell;
  const lastHoverKeyRef = useRef<string | null>(null);

  const getCellFromRaycast = useCallback((camera: THREE.Camera, _scene: THREE.Scene, ndcX: number, ndcY: number): RaycastResult | null => {
    const plan = planRef.current;
    if (!plan) return null;

    sharedRaycaster.setFromCamera(sharedNDC.set(ndcX, ndcY), camera);

    // Virtual ground plane at y=0 for raycasting. The shared hit point would
    // hold a stale cell after a miss (parallel/away ray), so the null return
    // is authoritative.
    if (!sharedRaycaster.ray.intersectPlane(sharedGroundPlane, sharedHitPoint)) return null;

    // Convert world position to cell coordinates
    const offsetX = -(plan.widthM / 2);
    const offsetZ = -(plan.heightM / 2);
    const cellM = plan.cellM;
    const x = Math.floor((sharedHitPoint.x - offsetX) / cellM);
    const y = Math.floor((sharedHitPoint.z - offsetZ) / cellM);

    const cols = planCols(plan);
    const rows = planRows(plan);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;

    return { x, y, key: cellKey(x, y) };
  }, [planRef]);

  const rectPreviewColor = () =>
    editor.rectMode === 'asset' && activeAsset ? activeAsset.colorHex : editor.activeCrop?.colorHex ?? '#22c55e';

  const handlePointerDown = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => {
    const plan = planRef.current;
    if (!plan) return;
    const cell = getCellFromRaycast(camera, scene, ndcX, ndcY);
    if (!cell) return;

    if (tool === 'select') {
      setSelectedKey(cell.key);
      return;
    }
    if (tool === 'pick') {
      pickAt(cell.key);
      return;
    }
    if (tool === 'fill') {
      // Flood fill commits itself (history + autosave), same as blueprint.
      applyFillAt(cell.x, cell.y);
      return;
    }

    // Clone every mutated map — sharing plantedAt would let post-snapshot
    // stamp/erase mutations leak into the undo baseline.
    const before = { ...plan, planting: { ...plan.planting }, ground: { ...plan.ground }, plantedAt: { ...plan.plantedAt } };
    dragRef.current = {
      kind: tool === 'rect' ? 'rect' : tool === 'line' ? 'line' : 'paint',
      before,
      changed: false,
      startX: cell.x,
      startY: cell.y,
      lastX: cell.x,
      lastY: cell.y,
    };

    // The stroke owns the pointer from here: clear any hover readout so it
    // cannot freeze on the drag-start cell for the whole drag.
    if (lastHoverKeyRef.current !== null) {
      lastHoverKeyRef.current = null;
      onHoverCellRef.current?.(null);
    }

    if (tool === 'rect') {
      setRectPreview({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, color: rectPreviewColor(), kind: 'rect' });
    } else if (tool === 'line') {
      setRectPreview({
        x0: cell.x,
        y0: cell.y,
        x1: cell.x,
        y1: cell.y,
        color: rectPreviewColor(),
        kind: 'line',
        cells: bresenhamCells(cell.x, cell.y, cell.x, cell.y),
      });
    } else {
      applyBrushAt(cell.x, cell.y);
      dragRef.current.changed = true;
    }
  }, [planRef, tool, activeAsset, setSelectedKey, setRectPreview, editor.rectMode, editor.activeCrop, applyBrushAt, applyFillAt, pickAt, getCellFromRaycast]);

  const handlePointerMove = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => {
    const drag = dragRef.current;
    if (!drag.kind) {
      // Hover tracking (only outside drags): raycast + key-dedupe so the
      // consumer sees one callback per cell change and one null on leave.
      const hovered = getCellFromRaycast(camera, scene, ndcX, ndcY);
      if (!hovered) {
        if (lastHoverKeyRef.current !== null) {
          lastHoverKeyRef.current = null;
          onHoverCellRef.current?.(null);
        }
        return;
      }
      if (hovered.key !== lastHoverKeyRef.current) {
        lastHoverKeyRef.current = hovered.key;
        onHoverCellRef.current?.(hovered);
      }
      return;
    }
    const cell = getCellFromRaycast(camera, scene, ndcX, ndcY);
    if (!cell) return;

    drag.lastX = cell.x;
    drag.lastY = cell.y;

    if (drag.kind === 'paint') {
      applyBrushAt(cell.x, cell.y);
      drag.changed = true;
    }
    if (drag.kind === 'rect') {
      setRectPreview({ x0: drag.startX, y0: drag.startY, x1: cell.x, y1: cell.y, color: rectPreviewColor(), kind: 'rect' });
    }
    if (drag.kind === 'line') {
      setRectPreview({
        x0: drag.startX,
        y0: drag.startY,
        x1: cell.x,
        y1: cell.y,
        color: rectPreviewColor(),
        kind: 'line',
        cells: bresenhamCells(drag.startX, drag.startY, cell.x, cell.y),
      });
    }
  }, [applyBrushAt, setRectPreview, editor.rectMode, editor.activeCrop, activeAsset, getCellFromRaycast]);

  const handlePointerUp = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX?: number, ndcY?: number) => {
    const drag = dragRef.current;
    const plan = planRef.current;

    if (drag.kind === 'rect' || drag.kind === 'line') {
      const released = ndcX !== undefined && ndcY !== undefined
        ? getCellFromRaycast(camera, scene, ndcX, ndcY)
        : null;
      // Fall back to the last dragged cell when the release lands off-plan.
      const endX = released?.x ?? drag.lastX;
      const endY = released?.y ?? drag.lastY;
      if (drag.kind === 'rect') {
        drag.changed = applyRect(drag.startX, drag.startY, endX, endY) || drag.changed;
      } else {
        drag.changed = applyLineCells(drag.startX, drag.startY, endX, endY) || drag.changed;
      }
      // Cleared unconditionally — rectPreview is shared editor state that
      // outlives this view, and a stale 3D drag must never bleed into the
      // 2D blueprint as a phantom rectangle.
      setRectPreview(null);
    }

    if (drag.changed && drag.before && plan) {
      replacePlan({ ...plan, planting: { ...plan.planting }, ground: { ...plan.ground } }, { save: true, recordHistory: drag.before });
    }

    dragRef.current = { kind: null, before: null, changed: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
  }, [planRef, applyRect, applyLineCells, replacePlan, setRectPreview, getCellFromRaycast]);

  // Pointer left the canvas entirely — drop the hover readout and highlight.
  const handlePointerLeave = useCallback(() => {
    if (lastHoverKeyRef.current !== null) {
      lastHoverKeyRef.current = null;
      onHoverCellRef.current?.(null);
    }
  }, []);

  return {
    getCellFromRaycast,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
  };
}
