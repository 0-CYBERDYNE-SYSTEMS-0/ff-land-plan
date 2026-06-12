import { ArrowLeft, Check, Map as MapIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigation } from '@/hooks/useNavigation';
import { AssetPalette } from '@/components/designer/AssetPalette';
import { BlueprintCanvas } from '@/components/designer/BlueprintCanvas';
import { CropPalette } from '@/components/designer/CropPalette';
import { DesignerToolbar } from '@/components/designer/DesignerToolbar';
import { PairingsPanel } from '@/components/designer/PairingsPanel';
import { SelectionPanel } from '@/components/designer/SelectionPanel';
import { StatsPanel } from '@/components/designer/StatsPanel';
import { usePlanEditor } from '@/components/designer/usePlanEditor';

export function PlotDesigner({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const editor = usePlanEditor(farmId);
  const { farm, isLoading, planRef, saveState, savedAt } = editor;

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-[75vh] w-full" /></div>;
  }
  if (!farm) return <div className="p-6">Farm not found.</div>;
  const currentPlan = planRef.current;
  if (!currentPlan) return <div className="p-6">Plan not found.</div>;

  return (
    <div className="flex flex-col p-4 lg:p-6 space-y-4 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-primary" /> Plot Designer
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {farm.name} · {currentPlan.widthM} m × {currentPlan.heightM} m · 25 cm cells
          </p>
        </div>
        <Badge variant={saveState === 'error' ? 'destructive' : 'secondary'} className="gap-1">
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? `Saved ${savedAt ?? ''}` : saveState === 'dirty' ? 'Unsaved' : 'Ready'}
          {saveState === 'saved' && <Check className="w-3 h-3" />}
        </Badge>
      </div>

      <div className="grid gap-4 xl:flex-1 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <DesignerToolbar editor={editor} />
          <BlueprintCanvas editor={editor} />
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <CropPalette editor={editor} />
          <AssetPalette editor={editor} />
          <StatsPanel editor={editor} />
          <PairingsPanel editor={editor} />
          <SelectionPanel editor={editor} />
        </div>
      </div>
    </div>
  );
}
