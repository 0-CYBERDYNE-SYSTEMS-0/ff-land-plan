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
import { ARCHETYPE_FOR_SURFACE, archetypes, planningProfiles } from '@/creative/archetypes';
import type { PlanEditor } from './usePlanEditor';

const templateCellCount = (tpl: GardenTemplate): number =>
  new Set([...Object.keys(tpl.ground), ...Object.keys(tpl.planting)]).size +
  (tpl.targets ?? []).reduce((count, target) => count + Object.keys(target.planting).length, 0);

export function TemplatesCard({ editor }: { editor: PlanEditor }) {
  const [pending, setPending] = useState<GardenTemplate | null>(null);
  const archetypeId = editor.archetype ?? ARCHETYPE_FOR_SURFACE[editor.surface];
  const profile = editor.planningProfile ?? planningProfiles[archetypes[archetypeId].planningProfile];
  const availableTemplates = templates.filter((tpl) => profile.compatibleTemplates.includes(tpl.id) &&
    tpl.archetypes.includes(archetypeId) &&
    (archetypes[archetypeId].tierPlanningAvailable || !(tpl.growingSpaces ?? []).some((space) => space.kind === 'rack' && space.levels.length > 1)) &&
    (editor.scope.kind !== 'legacy' || !(tpl.growingSpaces?.length || tpl.instances?.length || tpl.targets?.length)));

  const requestApply = (tpl: GardenTemplate) => {
    const plan = editor.planRef.current;
    const isEmpty =
      !plan ||
      (Object.keys(plan.planting).length === 0 && Object.keys(plan.ground).length === 0 &&
        Object.keys(plan.targets ?? {}).length === 0 && (editor.environment?.instances?.length ?? 0) === 0 &&
        (editor.environment?.layout?.growingSpaces.length ?? 0) === 0);
    if (isEmpty) void applyTemplate(tpl);
    else setPending(tpl);
  };

  const applyTemplate = async (tpl: GardenTemplate) => {
    if (await editor.applyTemplate(tpl)) setPending(null);
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
              <Badge variant="secondary">{templateCellCount(tpl)} {templateCellCount(tpl) === 1 ? 'cell' : 'cells'}</Badge>
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
              Your plan already has content — applying this template replaces its crops, ground,
              growing spaces and equipment. Undo (Ctrl/Cmd+Z) restores the previous plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) void applyTemplate(pending); }}>
              Apply template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
