import { Hand } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PlanEditor } from './usePlanEditor';

export function BlueprintCanvas({ editor }: { editor: PlanEditor }) {
  const {
    canvasRef,
    shellRef,
    dragRef,
    spaceHeldRef,
    handlePointerDown,
    handlePointerMove,
    finishStroke,
    setHoverKey,
    hoverKey,
    activeCrop,
    tool,
    rectMode,
    zoomLabel,
  } = editor;

  return (
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
  );
}
