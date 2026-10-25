import { Hand, Layers, Sprout } from 'lucide-react';

import { effectivePlantingArea } from '@/lib/plan';
import { cn } from '@/lib/utils';
import { assetBySlug } from '@/data/assets';
import { Button } from '@/components/ui/button';
import type { PlanEditor } from './usePlanEditor';

export function BlueprintCanvas({ editor }: { editor: PlanEditor }) {
  const {
    canvasRef,
    shellRef,
    planRef,
    viewportRef,
    viewportVersion,
    planVersion,
    environment,
    activeTarget,
    placementMessage,
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
  const plan = planRef.current;
  const layout = environment?.layout;
  const meterScale = plan ? viewportRef.current.cellPx / plan.cellM : 1;

  // P1-10: rect HUD chip — reuses the shared area/plants helpers.
  let rectHud: string | null = null;
  if (rectPreview) {
    const w = Math.abs(rectPreview.x1 - rectPreview.x0) + 1;
    const h = Math.abs(rectPreview.y1 - rectPreview.y0) + 1;
    const cells = w * h;
    const cellM = plan?.cellM ?? 0.25;
    const areaM2 = Number((cells * cellM * cellM).toFixed(2));
    if (rectMode === 'plants' && activeCrop) {
      rectHud = `${w}×${h} · ${areaM2} m² · ≈${effectivePlantingArea(activeCrop, [{ cells, cellM }])} plants`;
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

      {plan && layout && (
        <svg
          key={`${planVersion}:${viewportVersion}`}
          viewBox={`0 0 ${viewportRef.current.viewW} ${viewportRef.current.viewH}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <g transform={`translate(${viewportRef.current.offsetX} ${viewportRef.current.offsetY}) scale(${meterScale})`}>
            {layout.growingSpaces.map((space) => {
              const selected = activeTarget.kind === 'growing-level' && activeTarget.growingSpaceId === space.id;
              const selectedLevel = selected ? space.levels.find((level) => level.id === activeTarget.levelId) : null;
              return (
                <g key={space.id}>
                  <rect
                    x={space.x}
                    y={space.y}
                    width={space.widthM}
                    height={space.depthM}
                    fill={selected ? '#8b5cf6' : '#64748b'}
                    fillOpacity={selected ? '.12' : '.05'}
                    stroke={selected ? '#7c3aed' : '#475569'}
                    strokeDasharray={selected ? '.08 .04' : '.04 .06'}
                    strokeWidth={plan.cellM * .08}
                  />
                  <text x={space.x + .05} y={space.y + .16} fill={selected ? '#6d28d9' : '#334155'} fontSize={plan.cellM * .42}>
                    {space.label}{selectedLevel ? ` · ${selectedLevel.label} (${selectedLevel.elevationM.toFixed(2)} m)` : ''}
                  </text>
                </g>
              );
            })}
            {(environment?.instances ?? [])
              .filter((instance) => instance.mount.kind === 'environment' ||
                (activeTarget.kind === 'floor' && instance.mount.kind === 'floor') ||
                (activeTarget.kind === 'growing-level' && instance.mount.kind === 'growing-level' &&
                  instance.mount.growingSpaceId === activeTarget.growingSpaceId && instance.mount.levelId === activeTarget.levelId))
              .map((instance) => {
                const asset = assetBySlug(instance.slug);
                if (!asset) return null;
                return (
                  <g key={instance.id}>
                    <rect
                      x={instance.x}
                      y={instance.y}
                      width={instance.widthM}
                      height={instance.depthM}
                      fill={asset.colorHex}
                      fillOpacity=".22"
                      stroke={asset.colorHex}
                      strokeWidth={plan.cellM * .08}
                    />
                    <text x={instance.x + .04} y={instance.y + Math.min(instance.depthM, .18)} fill="#0f172a" fontSize={plan.cellM * .38}>
                      {asset.emoji} {asset.label}
                    </text>
                  </g>
                );
              })}
            {layout.reservations.map((reservation) => (
              <g key={reservation.id}>
                <rect
                  x={reservation.x}
                  y={reservation.y}
                  width={reservation.widthM}
                  height={reservation.depthM}
                  fill="#f59e0b"
                  fillOpacity=".18"
                  stroke="#b45309"
                  strokeOpacity=".8"
                  strokeDasharray=".12 .08"
                  strokeWidth=".025"
                />
              </g>
            ))}
            {layout.access.map((access) => {
              const horizontal = access.edge === 'north' || access.edge === 'south';
              const x = horizontal ? access.offsetM : access.edge === 'east' ? environment!.widthM : 0;
              const y = horizontal ? access.edge === 'south' ? environment!.heightM : 0 : access.offsetM;
              return (
                <line
                  key={access.id}
                  x1={x}
                  y1={y}
                  x2={x + (horizontal ? access.widthM : 0)}
                  y2={y + (horizontal ? 0 : access.widthM)}
                  stroke="#dc2626"
                  strokeWidth={plan.cellM * .7}
                  strokeOpacity=".85"
                />
              );
            })}
          </g>
        </svg>
      )}

      {/* P1-10: rectangle-drag HUD */}
      {rectHud && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-border bg-background/90 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground shadow-sm">
          {rectHud}
        </div>
      )}

      {placementMessage && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-amber-600/40 bg-background/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm dark:text-amber-200">
          {placementMessage}
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
