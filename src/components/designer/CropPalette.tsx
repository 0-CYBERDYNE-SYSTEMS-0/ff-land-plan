import { Leaf, Search, Sprout } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PlanEditor } from './usePlanEditor';

export function CropPalette({ editor }: { editor: PlanEditor }) {
  const { cropSearch, setCropSearch, filteredCrops, activeCropId, setActiveCropId, tool, setTool } = editor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sprout className="w-4 h-4" /> Crop Palette
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={cropSearch} onChange={(e) => setCropSearch(e.target.value)} placeholder="Search crops…" className="h-8 pl-7 text-sm" />
        </div>
        <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
          {filteredCrops.map((crop) => (
            <button
              key={crop.id}
              type="button"
              onClick={() => {
                setActiveCropId(crop.id);
                if (tool === 'asset') setTool('brush');
              }}
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
