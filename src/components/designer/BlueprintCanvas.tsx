import { Hand, Layers, Sprout } from 'lucide-react';

import { CELL_AREA_M2, plantsForArea } from '@/lib/plan';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PlanEditor } from './usePlanEditor';

export function BlueprintCanvas({ editor }: { editor: PlanEditor }) {
  const {
    canvasRef,
    shellRef,
    handlePointerDown,
    handlePointerMove,
    finishStroke,
    setHoverKey,
    hoverKey,
    activeCrop,
    activeAsset,
    tool,
    rectMode,
    rectPreview,
    zoomLabel,
    zoomPct,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomFit,
    showPlants,
    togglePlantsLayer,
    showGround,
    toggleGroundLayer,
    spaceHeld,
    isPanning,
  } = editor;

  // P0-4: cursor derives from STATE (re-renders live), not bare refs.
  const grabCursor = spaceHeld || isPanning;

  // P1-10: rect HUD chip — reuses the shared area/plants helpers.
  let rectHud: string | null = null;
  if (rectPreview) {
    const w = Math.abs(rectPreview.x1 - rectPreview.x0) + 1;
    const h = Math.abs(rectPreview.y1 - rectPreview.y0) + 1;
    const cells = w * h;
    const areaM2 = Number((cells * CELL_AREA_M2).toFixed(2));
    if (rectMode === 'plants' && activeCrop) {
      rectHud = `${w}×${h} · ${areaM2} m² · ≈${plantsForArea(activeCrop, cells)} plants`;
    } else if (rectMode === 'asset' && activeAsset) {
      rectHud = `${w}×${h} · ${areaM2} m² · ${activeAsset.emoji} ${activeAsset.label}`;
    } else {
      rectHud = `${w}×${h} · ${areaM2} m²`;
    }
  }

  return (
    <div ref={shellRef} className="relative h-[60dvh] min-h-[320px] bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={cn(
          'block h-full w-full touch-none outline-none',
          grabCursor ? 'cursor-grabbing' : 'cursor-crosshair',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={() => setHoverKey(null)}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* P1-10: rectangle-drag HUD */}
      {rectHud && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground shadow-sm">
          {rectHud}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <span className="flex items-center gap-1"><Hand className="w-3 h-3" /> Space/middle drag pans</span>
        <span>Wheel zooms around cursor</span>
        <span>{zoomLabel}</span>
        {hoverKey && activeCrop && (tool === 'brush' || (tool === 'rect' && rectMode === 'plants')) && (
          <span className="text-foreground">Painting {activeCrop.name}</span>
        )}
      </div>

      {/* P0-2 + P1-8: layer toggles & zoom cluster, bottom-right over the canvas */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1 rounded-md border border-border bg-background/90 p-0.5 shadow-sm">
        <Button
          variant={showPlants ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('h-7 w-7 p-0', !showPlants && 'opacity-40')}
          aria-pressed={showPlants}
          title={showPlants ? 'Hide plants layer' : 'Show plants layer'}
          onClick={togglePlantsLayer}
        >
          <Sprout className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={showGround ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('h-7 w-7 p-0', !showGround && 'opacity-40')}
          aria-pressed={showGround}
          title={showGround ? 'Hide ground layer' : 'Show ground layer'}
          onClick={toggleGroundLayer}
        >
          <Layers className="w-3.5 h-3.5" />
        </Button>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-base leading-none"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={zoomOut}
        >
          −
        </Button>
        <button
          type="button"
          className="h-7 min-w-[3rem] rounded-sm px-1 text-xs font-medium tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Reset zoom to 100%"
          onClick={zoomReset}
        >
          {zoomPct}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Fit to view"
          onClick={zoomFit}
        >
          Fit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-base leading-none"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={zoomIn}
        >
          +
        </Button>
      </div>
    </div>
  );
}
