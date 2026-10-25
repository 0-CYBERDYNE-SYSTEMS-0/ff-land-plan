import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';

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
import { archetypes } from '@/creative/archetypes';
import type { PlanEditor } from './usePlanEditor';

const templateCellCount = (tpl: GardenTemplate): number =>
  new Set([...Object.keys(tpl.ground), ...Object.keys(tpl.planting)]).size;

export function TemplatesCard({ editor }: { editor: PlanEditor }) {
  const [pending, setPending] = useState<GardenTemplate | null>(null);
  const racksAvailable = editor.archetype ? archetypes[editor.archetype].tierPlanningAvailable : true;
  const availableTemplates = editor.planningProfile
    ? templates.filter((tpl) => editor.planningProfile!.compatibleTemplates.includes(tpl.id) &&
      (racksAvailable || !Object.values(tpl.ground).includes('plant-rack')))
    : templates;

  const requestApply = (tpl: GardenTemplate) => {
    const plan = editor.planRef.current;
    const isEmpty =
      !plan ||
      (Object.keys(plan.planting).length === 0 && Object.keys(plan.ground).length === 0);
    if (isEmpty) applyTemplate(tpl);
    else setPending(tpl);
  };

  const applyTemplate = (tpl: GardenTemplate) => {
    if (editor.applyTemplate(tpl)) setPending(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4" /> Starter Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {availableTemplates.length === 0 && (
          <p className="text-xs text-muted-foreground">No floor starter is available for this profile yet.</p>
        )}
        {availableTemplates.map((tpl) => (
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
