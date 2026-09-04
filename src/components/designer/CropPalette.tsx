import { useState } from 'react';
import { Leaf, Search, Sprout } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Crop } from '@/types';
import type { PlanEditor } from './usePlanEditor';

// Recently-used ring: last 6 selections per palette, persisted as a JSON array
// of crop ids. Custom crops (ids ≥ 1000) resolve through the live catalog and
// disappear from the ring gracefully if deleted.
const RECENT_CROPS_KEY = 'ff-pro:recent-crops';
const RECENT_CAP = 6;

function loadRecentCropIds(): number[] {
  try {
    const raw = localStorage.getItem(RECENT_CROPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === 'number').slice(0, RECENT_CAP)
      : [];
  } catch {
    return [];
  }
}

export function CropPalette({ editor }: { editor: PlanEditor }) {
  const { cropSearch, setCropSearch, filteredCrops, activeCropId, setActiveCropId, tool, setTool, cropById } = editor;
  const [recentIds, setRecentIds] = useState<number[]>(loadRecentCropIds);

  const selectCrop = (id: number) => {
    setActiveCropId(id);
    if (tool === 'asset') setTool('brush');
    // Dedupe + most-recent-first, capped at 6, mirrored to localStorage.
    const next = [id, ...recentIds.filter((value) => value !== id)].slice(0, RECENT_CAP);
    setRecentIds(next);
    try {
      localStorage.setItem(RECENT_CROPS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — ring still works for the session.
    }
  };

  const recentCrops = recentIds
    .map((id) => cropById.get(id))
    .filter((crop): crop is Crop => !!crop);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sprout className="w-4 h-4" /> Crop Palette
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentCrops.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
            <div className="flex flex-wrap gap-1">
              {recentCrops.map((crop) => (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => selectCrop(crop.id)}
                  title={crop.name}
                  className={cn(
                    'flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted',
                    activeCropId === crop.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/40',
                  )}
                >
                  <span>{crop.emoji ?? <Leaf className="w-3 h-3" />}</span>
                  <span className="max-w-20 truncate">{crop.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={cropSearch} onChange={(e) => setCropSearch(e.target.value)} placeholder="Search crops…" className="h-8 pl-7 text-sm" />
        </div>
        <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
          {filteredCrops.map((crop) => (
            <button
              key={crop.id}
              type="button"
              onClick={() => selectCrop(crop.id)}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted',
                activeCropId === crop.id ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: crop.colorHex + '33' }}>
                {crop.emoji ?? <Leaf className="w-3 h-3" />}
              </span>
              <span className="truncate">{crop.name}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
