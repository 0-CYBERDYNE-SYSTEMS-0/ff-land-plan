import * as THREE from 'three';
import type { PlanState, Crop } from '@/types';
import { drawPlan } from '@/lib/renderPlan';
import { planCols, planRows } from '@/lib/plan';

/**
 * Build a CanvasTexture from a plan by drawing it offscreen via drawPlan.
 *
 * @param plan      - The farm plan state.
 * @param cropById  - Map of cropId -> Crop for the planting layer.
 * @returns A THREE.CanvasTexture ready to apply to a ground plane.
 */
export function buildGroundTexture(plan: PlanState, cropById: Map<number, Crop>): THREE.CanvasTexture {
  const cols = planCols(plan);
  const rows = planRows(plan);

  // Choose a cell resolution that keeps the texture reasonably sized
  // while still showing detail (emojis appear at >= 16 px).
  const cellPx = 12;

  const width = cols * cellPx;
  const height = rows * cellPx;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not obtain 2D context for offscreen canvas');
  }

  // Draw the full plan with no offset and no interactive overlays.
  drawPlan(ctx, plan, {
    cellPx,
    offsetX: 0,
    offsetY: 0,
    cropById,
    viewW: width,
    viewH: height,
    theme: 'light',
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmaps for a pixel-sharp ground texture.
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return texture;
}
