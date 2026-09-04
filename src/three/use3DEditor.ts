import { useCallback, useRef } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import type { PlanState } from '@/types';
import { cellKey, planCols, planRows } from '@/lib/plan';

interface RaycastResult {
  x: number;
  y: number;
  key: string;
}

export function use3DEditor(editor: PlanEditor) {
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

  const getCellFromRaycast = useCallback((camera: THREE.Camera, _scene: THREE.Scene, ndcX: number, ndcY: number): RaycastResult | null => {
    const plan = planRef.current;
    if (!plan) return null;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Create a virtual ground plane at y=0 for raycasting
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectPoint);
    if (!intersectPoint) return null;

    // Convert world position to cell coordinates
    const offsetX = -(plan.widthM / 2);
    const offsetZ = -(plan.heightM / 2);
    const cellM = plan.cellM;
    const x = Math.floor((intersectPoint.x - offsetX) / cellM);
    const y = Math.floor((intersectPoint.z - offsetZ) / cellM);

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

    if (tool === 'rect') {
      setRectPreview({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, color: rectPreviewColor() });
    } else if (tool === 'line') {
      // No drag preview in 3D; the stroke commits on pointer-up.
    } else {
      applyBrushAt(cell.x, cell.y);
      dragRef.current.changed = true;
    }
  }, [planRef, tool, activeAsset, setSelectedKey, setRectPreview, editor.rectMode, editor.activeCrop, applyBrushAt, applyFillAt, pickAt, getCellFromRaycast]);

  const handlePointerMove = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => {
    const drag = dragRef.current;
    if (!drag.kind) return;
    const cell = getCellFromRaycast(camera, scene, ndcX, ndcY);
    if (!cell) return;

    drag.lastX = cell.x;
    drag.lastY = cell.y;

    if (drag.kind === 'paint') {
      applyBrushAt(cell.x, cell.y);
      drag.changed = true;
    }
    if (drag.kind === 'rect') {
      setRectPreview({ x0: drag.startX, y0: drag.startY, x1: cell.x, y1: cell.y, color: rectPreviewColor() });
    }
  }, [applyBrushAt, setRectPreview, editor.rectMode, editor.activeCrop, activeAsset, getCellFromRaycast]);

  const handlePointerUp = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX?: number, ndcY?: number) => {
    const drag = dragRef.current;
    const plan = planRef.current;
    if (!plan) return;

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
      setRectPreview(null);
    }

    if (drag.changed && drag.before) {
      replacePlan({ ...plan, planting: { ...plan.planting }, ground: { ...plan.ground } }, { save: true, recordHistory: drag.before });
    }

    dragRef.current = { kind: null, before: null, changed: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
  }, [planRef, applyRect, applyLineCells, replacePlan, setRectPreview, getCellFromRaycast]);

  return {
    getCellFromRaycast,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
