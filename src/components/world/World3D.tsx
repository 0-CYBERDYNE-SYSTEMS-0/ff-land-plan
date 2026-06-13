import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createEngine, type Engine } from '@/three/engine';
import { buildGroundTexture } from '@/three/groundTexture';
import { buildGhostPlants, disposeGhostPlants, type GhostBatch } from '@/three/historyViz';
import { buildPlants, disposePlants, type PlantBatch, updatePlants } from '@/three/plants';
import { buildStructures, disposeStructures, type StructureBatch, updateStructures } from '@/three/structures';
import { use3DEditor } from '@/three/use3DEditor';

interface World3DProps {
  editor: PlanEditor;
}

export default function World3D({ editor }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const structureBatchesRef = useRef<StructureBatch[]>([]);
  const plantBatchesRef = useRef<PlantBatch[]>([]);
  const undoGhostsRef = useRef<GhostBatch[]>([]);
  const redoGhostsRef = useRef<GhostBatch[]>([]);
  const [scrubDate, setScrubDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);
  const { handlePointerDown, handlePointerMove, handlePointerUp } = use3DEditor(editor);

  // Initialize engine and scene when plan data is available.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const plan = editor.planRef.current;
    const cropById = editor.cropById;
    if (!plan || !cropById.size) return;
    if (engineRef.current) return; // already initialized

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const engine = createEngine(canvas, 'light');
    engineRef.current = engine;

    // Ground plane with baked plan texture.
    const texture = buildGroundTexture(plan, cropById);
    const groundGeo = new THREE.PlaneGeometry(plan.widthM, plan.heightM);
    const groundMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    engine.scene.add(ground);
    groundRef.current = ground;

    // Structures and plants.
    structureBatchesRef.current = buildStructures(plan, engine.scene);
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene, new Date(scrubDate));

    // Fit camera to plot bounding box.
    const box = new THREE.Box3(
      new THREE.Vector3(-plan.widthM / 2, 0, -plan.heightM / 2),
      new THREE.Vector3(plan.widthM / 2, 5, plan.heightM / 2),
    );
    engine.controls.fitToBox(box, true);

    // Pointer events for 3D editing
    const getNDC = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // only left click
      const ndc = getNDC(e);
      handlePointerDown(engine.camera, engine.scene, ndc.x, ndc.y);
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const ndc = getNDC(e);
      handlePointerMove(engine.camera, engine.scene, ndc.x, ndc.y);
    };
    const onPointerUp = (e: PointerEvent) => {
      handlePointerUp();
      canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    // Resize observer.
    const resize = () => {
      const rect = container.getBoundingClientRect();
      engine.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      disposeStructures(structureBatchesRef.current);
      disposePlants(plantBatchesRef.current);
      disposeGhostPlants(undoGhostsRef.current);
      disposeGhostPlants(redoGhostsRef.current);
      texture.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      engine.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      engineRef.current = null;
      groundRef.current = null;
    };
  }, [editor.planVersion, editor.cropById, scrubDate, handlePointerDown, handlePointerMove, handlePointerUp]);

  // React to plan changes (rebuild structures/plants, update ground texture, update history ghosts).
  useEffect(() => {
    const engine = engineRef.current;
    const plan = editor.planRef.current;
    const cropById = editor.cropById;
    if (!engine || !plan) return;

    // Update ground texture.
    const oldGround = groundRef.current;
    if (oldGround) {
      const oldMat = oldGround.material as THREE.MeshStandardMaterial;
      oldMat.map?.dispose();
      const newTexture = buildGroundTexture(plan, cropById);
      oldMat.map = newTexture;
      oldMat.needsUpdate = true;
    }

    // Rebuild structures and plants.
    structureBatchesRef.current = updateStructures(structureBatchesRef.current, plan, engine.scene);
    plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene, new Date(scrubDate));

    // Update history ghosts
    disposeGhostPlants(undoGhostsRef.current);
    disposeGhostPlants(redoGhostsRef.current);
    undoGhostsRef.current = [];
    redoGhostsRef.current = [];
    if (showHistory) {
      const undoStack = editor.undoRef.current;
      const redoStack = editor.redoRef.current;
      if (undoStack.length > 0) {
        const lastUndo = undoStack[undoStack.length - 1];
        undoGhostsRef.current = buildGhostPlants(lastUndo, cropById, engine.scene, '#22c55e', 0.25);
      }
      if (redoStack.length > 0) {
        const lastRedo = redoStack[redoStack.length - 1];
        redoGhostsRef.current = buildGhostPlants(lastRedo, cropById, engine.scene, '#3b82f6', 0.25);
      }
    }
  }, [editor.planVersion, editor.cropById, scrubDate, showHistory]);

  return (
    <div
      ref={containerRef}
      className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1"
    >
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-center gap-3">
        <div className="pointer-events-auto rounded-md bg-background/90 px-3 py-2 shadow-sm">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Date:</span>
            <input
              type="date"
              value={scrubDate}
              onChange={(e) => setScrubDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className={`pointer-events-auto rounded-md px-3 py-2 text-xs font-medium shadow-sm ${showHistory ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-muted-foreground'}`}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </button>
      </div>
    </div>
  );
}
