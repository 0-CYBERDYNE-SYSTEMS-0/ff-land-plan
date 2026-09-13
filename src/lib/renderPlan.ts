// Shared plan renderer: the interactive designer canvas and the PNG export
// both draw through here. Pure text/vector drawing only — never drawImage from
// a remote URL, or the export canvas taints and toBlob() throws.

import type { Crop, GardenAsset, PlanState, PlanSurface } from '@/types';
import { assetBySlug } from '@/data/assets';
import { cellKey, parseKey, planCols, planRows } from '@/lib/plan';

/** Plan-canvas floor colors per surface (2D blueprint + PNG export). */
export const SURFACE_BG: Record<PlanSurface, { dark: string; light: string }> = {
  outdoor: { dark: '#1a2419', light: '#efe9df' },
  greenhouse: { dark: '#20302a', light: '#e8eee4' },
  tent: { dark: '#26232c', light: '#d4d0da' },
  indoor: { dark: '#282a2d', light: '#d8dadb' },
};

export interface RenderOptions {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  cropById: Map<number, Crop>;
  conflictCells?: Set<string>;
  hoverKey?: string | null;
  rectPreview?: { x0: number; y0: number; x1: number; y1: number; color: string } | null;
  viewW: number;
  viewH: number;
  theme: 'light' | 'dark';
  /** Plan canvas surface — picks the floor color. Default 'outdoor'. */
  surface?: PlanSurface;
  // --- Opt-in overlays (risk #1, shared-renderer leakage) ---------------------
  // Every field below defaults to OFF/undefined so drawPlan's pixels are
  // byte-identical for callers that don't pass it:
  //   • BlueprintCanvas (interactive, Lane E): may pass ALL of them —
  //     `ghost` hover/brush/asset footprint preview, `spacingViolations`
  //     spacing toggle, `companionHalos` companions toggle, `layers` visibility.
  //   • renderPlanToPng (PNG export, below): passes NONE — exports stay clean.
  //   • the 3D ground-tile path (src/three/ground.ts): passes NONE — do not add.
  /** Ghost footprint preview: per-cell 35% fill + solid 1px union outline. */
  ghost?: { cells: Array<[number, number]>; colorHex: string } | null;
  /** 'x,y' keys drawn as a ~28% red tint BEHIND plant emoji/icons. */
  spacingViolations?: Set<string> | null;
  /** Small corner triangles: good = green top-left, bad = red top-right. */
  companionHalos?: { good?: Set<string>; bad?: Set<string> } | null;
  /** false skips a layer entirely; undefined = visible (current behaviour). */
  layers?: { plants?: boolean; ground?: boolean };
  // --- Sim-run overlays (SPEC-GROWTH-VISUAL wave 5, opt-in, default OFF) ------
  // Fed by the same projection layer as the 3D world (src/lib/sim/view.ts);
  // only the interactive canvas passes them, only while a run is active.
  /** cellKey → moistureFrac 0..1: banded soil tint under the plant layer. */
  simMoisture?: Map<string, number> | null;
  /** cellKey → effective stress 0..1: severity tint under the plant layer. */
  simStress?: Map<string, number> | null;
  /** Harvest-ready cellKeys: amber corner triangle over the plant layer. */
  simReady?: Set<string> | null;
}

/** 2D moisture band fills — mirror SimDrawer.MOISTURE_BANDS (keep in sync). */
const SIM_MOISTURE_BAND_HEX = ['#92400e', '#ca8a04', '#65a30d', '#2563eb'];

export interface SimOverlayChannels {
  moisture?: Map<string, number> | null;
  stress?: Map<string, number> | null;
  ready?: Set<string> | null;
}

const EMOJI_MIN_PX = 16;

function drawAssetPattern(
  ctx: CanvasRenderingContext2D,
  asset: GardenAsset,
  px: number,
  py: number,
  size: number,
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  switch (asset.pattern) {
    case 'stripes':
      ctx.beginPath();
      ctx.moveTo(px, py + size);
      ctx.lineTo(px + size, py);
      ctx.stroke();
      break;
    case 'dots':
      ctx.beginPath();
      ctx.arc(px + size / 2, py + size / 2, Math.max(1, size / 8), 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cross':
      ctx.beginPath();
      ctx.moveTo(px + size / 2, py + 2);
      ctx.lineTo(px + size / 2, py + size - 2);
      ctx.moveTo(px + 2, py + size / 2);
      ctx.lineTo(px + size - 2, py + size / 2);
      ctx.stroke();
      break;
    case 'solid':
      break;
  }
  ctx.restore();
}

export function drawPlan(ctx: CanvasRenderingContext2D, plan: PlanState, opts: RenderOptions): void {
  const { cellPx, offsetX, offsetY, cropById, conflictCells, viewW, viewH, theme } = opts;
  const surface = opts.surface ?? plan.surface ?? 'outdoor';
  const cols = planCols(plan);
  const rows = planRows(plan);
  const dark = theme === 'dark';

  ctx.clearRect(0, 0, viewW, viewH);

  // Plot background — the surface floor.
  const planW = cols * cellPx;
  const planH = rows * cellPx;
  const bg = SURFACE_BG[surface] ?? SURFACE_BG.outdoor;
  ctx.fillStyle = dark ? bg.dark : bg.light;
  ctx.fillRect(offsetX, offsetY, planW, planH);

  // Layer visibility (opt-in `layers`): hiding the ground layer leaves a
  // neutral flat base so plants stay readable without bed/path colours.
  const showGround = opts.layers?.ground !== false;
  if (!showGround) {
    ctx.fillStyle = dark ? '#242e24' : '#e8e0d0';
    ctx.fillRect(offsetX, offsetY, planW, planH);
  }

  // Visible cell range only.
  const x0 = Math.max(0, Math.floor(-offsetX / cellPx));
  const y0 = Math.max(0, Math.floor(-offsetY / cellPx));
  const x1 = Math.min(cols - 1, Math.ceil((viewW - offsetX) / cellPx));
  const y1 = Math.min(rows - 1, Math.ceil((viewH - offsetY) / cellPx));

  // Ground layer.
  if (showGround) {
    const drawPatterns = cellPx >= 10;
    for (const key of Object.keys(plan.ground)) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const asset = assetBySlug(plan.ground[key]);
      if (!asset) continue;
      const px = offsetX + x * cellPx;
      const py = offsetY + y * cellPx;
      ctx.fillStyle = asset.colorHex;
      ctx.fillRect(px, py, cellPx, cellPx);
      if (drawPatterns) drawAssetPattern(ctx, asset, px, py, cellPx);
    }
  }

  // Spacing-violation tint (opt-in): translucent red UNDER the plant layer so
  // emoji/icons stay readable on top of it.
  if (opts.spacingViolations && opts.spacingViolations.size > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
    for (const key of opts.spacingViolations) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.fillRect(offsetX + x * cellPx, offsetY + y * cellPx, cellPx, cellPx);
    }
    ctx.restore();
  }

  // Sim-run overlays (SPEC-GROWTH-VISUAL wave 5) — UNDER the plant layer like
  // the spacing tint: moisture as banded soil color (same bands as the 3D
  // overlay legend), stress as a severity-weighted red wash on top of it.
  if (opts.simMoisture && opts.simMoisture.size > 0) {
    ctx.save();
    for (const [key, m] of opts.simMoisture) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const band = m < 0.25 ? 0 : m < 0.5 ? 1 : m < 0.75 ? 2 : 3;
      ctx.fillStyle = SIM_MOISTURE_BAND_HEX[band]!;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(offsetX + x * cellPx, offsetY + y * cellPx, cellPx, cellPx);
    }
    ctx.restore();
  }
  if (opts.simStress && opts.simStress.size > 0) {
    ctx.save();
    for (const [key, s] of opts.simStress) {
      if (s <= 0.15) continue; // floor: match the 3D tint gate
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.fillStyle = `rgba(220, 38, 38, ${(0.10 + 0.38 * Math.min(1, s)).toFixed(3)})`;
      ctx.fillRect(offsetX + x * cellPx, offsetY + y * cellPx, cellPx, cellPx);
    }
    ctx.restore();
  }

  // Planting layer.
  if (opts.layers?.plants !== false) {
    const emoji = cellPx >= EMOJI_MIN_PX;
    if (emoji) {
      ctx.font = `${Math.floor(cellPx * 0.62)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    const inset = Math.max(0.5, cellPx * 0.06);
    for (const key of Object.keys(plan.planting)) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const crop = cropById.get(plan.planting[key]);
      if (!crop) continue;
      const px = offsetX + x * cellPx;
      const py = offsetY + y * cellPx;
      ctx.fillStyle = crop.colorHex;
      ctx.beginPath();
      const r = Math.min(3, cellPx * 0.18);
      ctx.roundRect(px + inset, py + inset, cellPx - inset * 2, cellPx - inset * 2, r);
      ctx.fill();
      if (emoji && crop.emoji) {
        ctx.fillText(crop.emoji, px + cellPx / 2, py + cellPx / 2 + cellPx * 0.04);
      }
    }
  }

  // Conflict highlights (amber outline).
  if (conflictCells && conflictCells.size > 0) {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.5, cellPx * 0.1);
    for (const key of conflictCells) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.strokeRect(
        offsetX + x * cellPx + 1,
        offsetY + y * cellPx + 1,
        cellPx - 2,
        cellPx - 2,
      );
    }
    ctx.restore();
  }

  // Companion halos (opt-in): small filled corner triangles — green top-left
  // = helpful neighbour, red top-right = antagonistic neighbour. Deliberately
  // a different glyph class from the amber full-cell OUTLINE of conflictCells.
  const halos = opts.companionHalos;
  if (halos && ((halos.good && halos.good.size > 0) || (halos.bad && halos.bad.size > 0))) {
    const t = Math.max(3, Math.round(cellPx * 0.3));
    const drawHalo = (set: Set<string>, color: string, topRight: boolean) => {
      ctx.fillStyle = color;
      for (const key of set) {
        const [x, y] = parseKey(key);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const px = offsetX + x * cellPx;
        const py = offsetY + y * cellPx;
        ctx.beginPath();
        if (topRight) {
          ctx.moveTo(px + cellPx - t, py);
          ctx.lineTo(px + cellPx, py);
          ctx.lineTo(px + cellPx, py + t);
        } else {
          ctx.moveTo(px, py);
          ctx.lineTo(px + t, py);
          ctx.lineTo(px, py + t);
        }
        ctx.closePath();
        ctx.fill();
      }
    };
    if (halos.good && halos.good.size > 0) drawHalo(halos.good, '#16a34a', false);
    if (halos.bad && halos.bad.size > 0) drawHalo(halos.bad, '#dc2626', true);
  }

  // Harvest-ready markers (opt-in, wave 5): amber BOTTOM-left corner triangle
  // — a third glyph class (halos own the top corners, conflicts the outline).
  if (opts.simReady && opts.simReady.size > 0) {
    const t = Math.max(3, Math.round(cellPx * 0.3));
    ctx.fillStyle = '#f59e0b';
    for (const key of opts.simReady) {
      const [x, y] = parseKey(key);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const px = offsetX + x * cellPx;
      const py = offsetY + y * cellPx;
      ctx.beginPath();
      ctx.moveTo(px, py + cellPx);
      ctx.lineTo(px + t, py + cellPx);
      ctx.lineTo(px, py + cellPx - t);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Grid: faint cell lines at high zoom, 1 m lines always (every 4 cells).
  ctx.save();
  if (cellPx >= 10) {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      ctx.moveTo(offsetX + x * cellPx, Math.max(offsetY, 0));
      ctx.lineTo(offsetX + x * cellPx, Math.min(offsetY + planH, viewH));
    }
    for (let y = y0; y <= y1 + 1; y++) {
      ctx.moveTo(Math.max(offsetX, 0), offsetY + y * cellPx);
      ctx.lineTo(Math.min(offsetX + planW, viewW), offsetY + y * cellPx);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / 4) * 4; x <= x1 + 1; x += 4) {
    ctx.moveTo(offsetX + x * cellPx, Math.max(offsetY, 0));
    ctx.lineTo(offsetX + x * cellPx, Math.min(offsetY + planH, viewH));
  }
  for (let y = Math.ceil(y0 / 4) * 4; y <= y1 + 1; y += 4) {
    ctx.moveTo(Math.max(offsetX, 0), offsetY + y * cellPx);
    ctx.lineTo(Math.min(offsetX + planW, viewW), offsetY + y * cellPx);
  }
  ctx.stroke();
  ctx.restore();

  // Plot border.
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(offsetX, offsetY, planW, planH);

  // Hover highlight.
  if (opts.hoverKey) {
    const [hx, hy] = parseKey(opts.hoverKey);
    if (hx >= 0 && hy >= 0 && hx < cols && hy < rows) {
      ctx.strokeStyle = dark ? '#86efac' : '#16a34a';
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX + hx * cellPx, offsetY + hy * cellPx, cellPx, cellPx);
    }
  }

  // Rectangle-tool preview.
  if (opts.rectPreview) {
    const { x0: rx0, y0: ry0, x1: rx1, y1: ry1, color } = opts.rectPreview;
    const px = offsetX + Math.min(rx0, rx1) * cellPx;
    const py = offsetY + Math.min(ry0, ry1) * cellPx;
    const pw = (Math.abs(rx1 - rx0) + 1) * cellPx;
    const ph = (Math.abs(ry1 - ry0) + 1) * cellPx;
    ctx.save();
    ctx.fillStyle = color + '55';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(px, py, pw, ph);
    ctx.restore();
  }

  // Ghost footprint (opt-in) — drawn AFTER everything so it always reads as a
  // placement preview. Per-cell 35% alpha fill plus a solid 1px outline around
  // the UNION footprint: only outer edges are stroked, internal shared edges
  // get a single pass (via the pure half-pixel snap below, shared endpoints
  // round identically so collinear segments never gap). Coordinates snap to
  // the .5 grid for crisp 1px lines at any px/cell.
  const ghost = opts.ghost;
  if (ghost && ghost.cells.length > 0) {
    const members = new Set<string>(ghost.cells.map(([gx, gy]) => cellKey(gx, gy)));
    const snap = (v: number) => Math.round(v) + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ghost.colorHex;
    for (const gk of members) {
      const [gx, gy] = parseKey(gk);
      if (gx < x0 - 1 || gx > x1 + 1 || gy < y0 - 1 || gy > y1 + 1) continue;
      ctx.fillRect(offsetX + gx * cellPx, offsetY + gy * cellPx, cellPx, cellPx);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ghost.colorHex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const gk of members) {
      const [gx, gy] = parseKey(gk);
      if (gx < x0 - 1 || gx > x1 + 1 || gy < y0 - 1 || gy > y1 + 1) continue;
      const left = offsetX + gx * cellPx;
      const top = offsetY + gy * cellPx;
      const right = left + cellPx;
      const bottom = top + cellPx;
      if (!members.has(cellKey(gx, gy - 1))) {
        ctx.moveTo(snap(left), snap(top));
        ctx.lineTo(snap(right), snap(top));
      }
      if (!members.has(cellKey(gx, gy + 1))) {
        ctx.moveTo(snap(left), snap(bottom));
        ctx.lineTo(snap(right), snap(bottom));
      }
      if (!members.has(cellKey(gx - 1, gy))) {
        ctx.moveTo(snap(left), snap(top));
        ctx.lineTo(snap(left), snap(bottom));
      }
      if (!members.has(cellKey(gx + 1, gy))) {
        ctx.moveTo(snap(right), snap(top));
        ctx.lineTo(snap(right), snap(bottom));
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}

// --- PNG export ---------------------------------------------------------------

export function renderPlanToPng(
  plan: PlanState,
  crops: Crop[],
  title: string,
): Promise<Blob> {
  const cols = planCols(plan);
  const rows = planRows(plan);
  const cellPx = Math.max(8, Math.min(24, Math.floor(1600 / cols)));
  const margin = 40;
  const headerH = 64;

  const cropById = new Map(crops.map((c) => [c.id, c]));
  const usedCropIds = new Set(Object.values(plan.planting));
  const usedAssets = new Set(Object.values(plan.ground));
  const legendEntries = [
    ...[...usedCropIds].map((id) => cropById.get(id)).filter((c): c is Crop => !!c)
      .map((c) => ({ color: c.colorHex, label: `${c.emoji ?? ''} ${c.name}`.trim() })),
    ...[...usedAssets].map((slug) => assetBySlug(slug)).filter((a) => !!a)
      .map((a) => ({ color: a!.colorHex, label: `${a!.emoji} ${a!.label}` })),
  ];
  const legendRows = Math.ceil(legendEntries.length / 4);
  const legendH = legendEntries.length > 0 ? legendRows * 26 + 24 : 0;

  const planW = cols * cellPx;
  const planH = rows * cellPx;
  const W = planW + margin * 2;
  const H = headerH + planH + legendH + 48 + margin;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D unavailable'));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Title + meta.
  ctx.fillStyle = '#1a2e1a';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, margin, 34);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#5a6b5a';
  ctx.fillText(
    `${plan.widthM} m × ${plan.heightM} m · ${new Date().toLocaleDateString()} · FarmFriend`,
    margin,
    54,
  );

  drawPlan(ctx, plan, {
    cellPx,
    offsetX: margin,
    offsetY: headerH,
    cropById,
    viewW: W,
    viewH: headerH + planH + 2,
    theme: 'light',
    surface: plan.surface ?? 'outdoor',
  });

  // Scale bar: 1 m.
  const sbY = headerH + planH + 22;
  ctx.strokeStyle = '#1a2e1a';
  ctx.fillStyle = '#1a2e1a';
  ctx.lineWidth = 2;
  const oneMeter = cellPx * 4;
  ctx.beginPath();
  ctx.moveTo(margin, sbY);
  ctx.lineTo(margin + oneMeter, sbY);
  ctx.moveTo(margin, sbY - 4);
  ctx.lineTo(margin, sbY + 4);
  ctx.moveTo(margin + oneMeter, sbY - 4);
  ctx.lineTo(margin + oneMeter, sbY + 4);
  ctx.stroke();
  ctx.font = '12px sans-serif';
  ctx.fillText('1 m', margin + oneMeter + 8, sbY + 4);

  // Legend.
  legendEntries.forEach((entry, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const lx = margin + col * ((W - margin * 2) / 4);
    const ly = sbY + 24 + row * 26;
    ctx.fillStyle = entry.color;
    ctx.beginPath();
    ctx.roundRect(lx, ly, 16, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#1a2e1a';
    ctx.font = '13px sans-serif';
    ctx.fillText(entry.label, lx + 22, ly + 13);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}
