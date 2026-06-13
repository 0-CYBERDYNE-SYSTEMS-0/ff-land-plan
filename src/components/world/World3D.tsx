import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import type { PlanEditor } from '@/components/designer/usePlanEditor';
import { createEngine, type Engine } from '@/three/engine';
import { buildGroundTexture } from '@/three/groundTexture';
import { buildPlants, disposePlants, type PlantBatch, updatePlants } from '@/three/plants';
import { buildStructures, disposeStructures, type StructureBatch, updateStructures } from '@/three/structures';

interface World3DProps {
  editor: PlanEditor;
}

export default function World3D({ editor }: World3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const structureBatchesRef = useRef<StructureBatch[]>([]);
  const plantBatchesRef = useRef<PlantBatch[]>([]);
  const planRef = useRef(editor.planRef.current);
  const cropByIdRef = useRef(editor.cropById);

  // Keep refs in sync with the latest editor values.
  useEffect(() => {
    planRef.current = editor.planRef.current;
    cropByIdRef.current = editor.cropById;
  });

  // Initialize engine and scene on mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const engine = createEngine(canvas, 'light');
    engineRef.current = engine;

    const plan = planRef.current;
    const cropById = cropByIdRef.current;
    if (!plan) return;

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
    plantBatchesRef.current = buildPlants(plan, cropById, engine.scene);

    // Fit camera to plot bounding box.
    const box = new THREE.Box3(
      new THREE.Vector3(-plan.widthM / 2, 0, -plan.heightM / 2),
      new THREE.Vector3(plan.widthM / 2, 5, plan.heightM / 2),
    );
    engine.controls.fitToBox(box, true);

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
      disposeStructures(structureBatchesRef.current);
      disposePlants(plantBatchesRef.current);
      texture.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      engine.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      engineRef.current = null;
      groundRef.current = null;
    };
  }, []);

  // React to plan changes (rebuild structures/plants, update ground texture).
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
    plantBatchesRef.current = updatePlants(plantBatchesRef.current, plan, cropById, engine.scene);
  }, [editor.planVersion, editor.cropById]);

  return (
    <div
      ref={containerRef}
      className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1"
    />
  );
}
