import { useMemo, useState } from 'react';
import { useNavigation } from '@/hooks/useNavigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Brush,
  Eraser,
  Save,
  Sprout,
  Trash2,
  Map as MapIcon,
  Grid3x3,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useFarm } from '@/hooks/useFarms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CropIcon } from '@/components/crops/CropIcon';
import { cn } from '@/lib/utils';
import type { Crop, FarmCell } from '@/types';

const GRID_W = 16;
const GRID_H = 8;

export function VoxelMap({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm, isLoading } = useFarm(farmId);
  const { data: cells = [] } = useQuery({
    queryKey: ['cells', farmId],
    queryFn: () => apiFetch.listCells(farmId),
  });
  const { data: crops = [] } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });
  const qc = useQueryClient();
  const [tool, setTool] = useState<'paint' | 'erase'>('paint');
  const [activeCropId, setActiveCropId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, number | null>>({});

  const setCell = useMutation({
    mutationFn: ({ cellId, cropId }: { cellId: number; cropId: number | null }) =>
      apiFetch.setCellCrop(farmId, cellId, cropId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cells', farmId] }),
  });

  const effectiveCell = (cell: FarmCell): FarmCell => {
    if (cell.id in draft) {
      return { ...cell, cropId: draft[cell.id] };
    }
    return cell;
  };

  const handleClick = (cell: FarmCell) => {
    if (tool === 'erase' || activeCropId === null) {
      setDraft((d) => ({ ...d, [cell.id]: null }));
    } else {
      setDraft((d) => ({ ...d, [cell.id]: activeCropId }));
    }
  };

  const handleCommit = async () => {
    const pending = Object.entries(draft);
    if (pending.length === 0) {
      toast.info('No changes to save');
      return;
    }
    try {
      await Promise.all(
        pending.map(([cellId, cropId]) =>
          setCell.mutateAsync({ cellId: Number(cellId), cropId }),
        ),
      );
      setDraft({});
      toast.success(`Saved ${pending.length} cell${pending.length !== 1 ? 's' : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleReset = () => setDraft({});

  const coverage = useMemo(() => {
    const merged = cells.map(effectiveCell);
    const planted = merged.filter((c) => c.cropId).length;
    return merged.length > 0 ? Math.round((planted / merged.length) * 100) : 0;
  }, [cells, draft]);

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!farm) return <div className="p-6">Farm not found.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-primary" /> Voxel Editor
          </h1>
          <p className="text-sm text-muted-foreground">{farm.name} — paint crops onto the 16×8 grid</p>
        </div>
        <Badge variant="secondary" className="text-xs">Coverage {coverage}%</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Grid3x3 className="w-4 h-4" />
            Toolbar
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              variant={tool === 'paint' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTool('paint')}
            >
              <Brush className="w-3.5 h-3.5 mr-1" /> Paint
            </Button>
            <Button
              variant={tool === 'erase' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setTool('erase')}
            >
              <Eraser className="w-3.5 h-3.5 mr-1" /> Erase
            </Button>
          </div>

          <div className="w-56">
            <Select
              value={activeCropId ? String(activeCropId) : ''}
              onValueChange={(v) => setActiveCropId(Number(v))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select crop…" />
              </SelectTrigger>
              <SelectContent>
                {crops.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="flex items-center gap-2">
                      <CropIcon category={c.category} className="w-3.5 h-3.5" style={{ color: c.colorHex }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleReset} disabled={Object.keys(draft).length === 0}>
              <Trash2 className="w-3.5 h-3.5" /> Discard
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleCommit}
              disabled={Object.keys(draft).length === 0 || setCell.isPending}
            >
              <Save className="w-3.5 h-3.5" />
              {setCell.isPending ? 'Saving…' : `Save (${Object.keys(draft).length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 pb-6">
          <div
            className="grid gap-1 p-2 rounded-md bg-muted/40 max-w-3xl mx-auto"
            style={{ gridTemplateColumns: `repeat(${GRID_W}, minmax(0, 1fr))` }}
            role="grid"
            aria-label="Voxel crop grid"
          >
            {cells.map((cell) => {
              const eff = effectiveCell(cell);
              const crop = eff.cropId ? crops.find((c) => c.id === eff.cropId) : null;
              const dirty = cell.id in draft;
              return (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => handleClick(cell)}
                  className={cn(
                    'aspect-square rounded-sm border border-black/10 transition-transform hover:scale-105',
                    dirty && 'ring-2 ring-primary ring-offset-1',
                  )}
                  style={{
                    background: crop ? crop.colorHex : 'rgba(0,0,0,0.05)',
                  }}
                  title={crop ? `${crop.name} (${cell.x}, ${cell.y})` : `Empty (${cell.x}, ${cell.y})`}
                  aria-label={crop ? crop.name : 'empty'}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
            <Sprout className="w-3 h-3" /> {coverage}% of the {GRID_W * GRID_H} cells are planted
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
