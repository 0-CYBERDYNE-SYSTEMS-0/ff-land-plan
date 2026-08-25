import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { templates, type GardenTemplate } from '@/data/templates';
import { parseKey, planCols, planRows } from '@/lib/plan';
import type { PlanState } from '@/types';
import type { PlanEditor } from './usePlanEditor';

const templateCellCount = (tpl: GardenTemplate): number =>
  new Set([...Object.keys(tpl.ground), ...Object.keys(tpl.planting)]).size;

export function TemplatesCard({ editor }: { editor: PlanEditor }) {
  const [pending, setPending] = useState<GardenTemplate | null>(null);

  const requestApply = (tpl: GardenTemplate) => {
    const plan = editor.planRef.current;
    const isEmpty =
      !plan ||
      (Object.keys(plan.planting).length === 0 && Object.keys(plan.ground).length === 0);
    if (isEmpty) applyTemplate(tpl);
    else setPending(tpl);
  };

  // Single seam crossing: ONE replacePlan call carries the prior plan as the
  // history snapshot (one undo entry restores it) and `save: true` routes the
  // write through the standard autosave debounce. Never touches planRef.
  const applyTemplate = (tpl: GardenTemplate) => {
    const plan = editor.planRef.current;
    if (!plan) return;
    const before: PlanState = {
      ...plan,
      planting: { ...plan.planting },
      ground: { ...plan.ground },
      ...(plan.plantedAt ? { plantedAt: { ...plan.plantedAt } } : {}),
    };
    // Resolve crop NAME -> catalog id at apply time; custom crops and catalog
    // edits can never invalidate the data file. Unknown names are skipped.
    const nameToId = new Map(editor.crops.map((crop) => [crop.name.toLowerCase(), crop.id]));
    const cols = planCols(plan);
    const rows = planRows(plan);
    const inBounds = (key: string) => {
      const [x, y] = parseKey(key);
      return x >= 0 && y >= 0 && x < cols && y < rows;
    };
    const plantedAtIso = new Date().toISOString();
    const planting: Record<string, number> = {};
    const ground: Record<string, string> = {};
    const plantedAt: Record<string, string> = {};
    let skippedCrops = 0;
    for (const [key, slug] of Object.entries(tpl.ground)) {
      if (!inBounds(key)) continue;
      ground[key] = slug;
    }
    for (const [key, cropName] of Object.entries(tpl.planting)) {
      if (!inBounds(key)) continue;
      const id = nameToId.get(cropName.toLowerCase());
      if (id === undefined) {
        skippedCrops += 1;
        continue;
      }
      planting[key] = id;
      plantedAt[key] = plantedAtIso;
    }
    const next: PlanState = {
      ...plan,
      planting,
      ground,
      plantedAt,
      updatedAt: new Date().toISOString(),
    };
    editor.replacePlan(next, { save: true, recordHistory: before });
    setPending(null);
    toast.success(
      skippedCrops > 0
        ? `Applied “${tpl.name}” · ${skippedCrops} unknown crop${skippedCrops === 1 ? '' : 's'} skipped`
        : `Applied “${tpl.name}”`,
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4" /> Starter Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.map((tpl) => (
          <div key={tpl.id} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm font-medium">{tpl.name}</div>
              <Badge variant="secondary">{templateCellCount(tpl)} cells</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{tpl.description}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 w-full"
              onClick={() => requestApply(tpl)}
            >
              Apply
            </Button>
          </div>
        ))}
      </CardContent>
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your current plan with “{pending?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Your plan already has content — applying this template replaces its planting and
              ground layout. Undo (Ctrl/Cmd+Z) restores the previous plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && applyTemplate(pending)}>
              Apply template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
