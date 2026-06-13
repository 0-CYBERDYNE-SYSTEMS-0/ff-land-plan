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
  const { planRef, tool, activeCropId, activeAsset, eraseLayer, applyBrushAt, replacePlan, setRectPreview, setSelectedKey } = editor;
  const dragRef = useRef<{ kind: 'paint' | 'rect' | null; before: PlanState | null; changed: boolean; startX: number; startY: number }>({ kind: null, before: null, changed: false, startX: 0, startY: 0 });

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

  const handlePointerDown = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => {
    const plan = planRef.current;
    if (!plan) return;
    const cell = getCellFromRaycast(camera, scene, ndcX, ndcY);
    if (!cell) return;

    if (tool === 'select') {
      setSelectedKey(cell.key);
      return;
    }

    const before = { ...plan, planting: { ...plan.planting }, ground: { ...plan.ground } };
    dragRef.current = {
      kind: tool === 'rect' ? 'rect' : 'paint',
      before,
      changed: false,
      startX: cell.x,
      startY: cell.y,
    };

    if (tool === 'rect') {
      setRectPreview({ x0: cell.x, y0: cell.y, x1: cell.x, y1: cell.y, color: editor.rectMode === 'asset' && activeAsset ? activeAsset.colorHex : editor.activeCrop?.colorHex ?? '#22c55e' });
    } else {
      applyBrushAt(cell.x, cell.y);
      dragRef.current.changed = true;
    }
  }, [planRef, tool, activeCropId, activeAsset, eraseLayer, setSelectedKey, setRectPreview, editor.rectMode, editor.activeCrop, applyBrushAt, getCellFromRaycast]);

  const handlePointerMove = useCallback((camera: THREE.Camera, scene: THREE.Scene, ndcX: number, ndcY: number) => {
    const drag = dragRef.current;
    const plan = planRef.current;
    if (!plan) return;
    const cell = getCellFromRaycast(camera, scene, ndcX, ndcY);

    if (drag.kind === 'paint' && cell) {
      applyBrushAt(cell.x, cell.y);
      drag.changed = true;
    }
    if (drag.kind === 'rect' && cell) {
      setRectPreview({ x0: drag.startX, y0: drag.startY, x1: cell.x, y1: cell.y, color: editor.rectMode === 'asset' && activeAsset ? activeAsset.colorHex : editor.activeCrop?.colorHex ?? '#22c55e' });
    }
  }, [planRef, applyBrushAt, setRectPreview, editor.rectMode, editor.activeCrop, activeAsset, getCellFromRaycast]);

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    const plan = planRef.current;
    if (!plan) return;

    if (drag.kind === 'rect' && drag.before) {
      // For 3D rect, we need the end cell from the last move - simplified for now
      setRectPreview(null);
    }

    if (drag.changed && drag.before) {
      replacePlan({ ...plan, planting: { ...plan.planting }, ground: { ...plan.ground } }, { save: true, recordHistory: drag.before });
    }

    dragRef.current = { kind: null, before: null, changed: false, startX: 0, startY: 0 };
  }, [planRef, replacePlan, setRectPreview]);

  return {
    getCellFromRaycast,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
