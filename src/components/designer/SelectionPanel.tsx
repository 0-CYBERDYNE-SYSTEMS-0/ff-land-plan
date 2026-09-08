import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { plantsForArea } from '@/lib/plan';
import { dateFromMonthDay, isValidMonthDay } from '@/lib/frost';
import { monthDayLabel } from '@/lib/calendar';
import type { Crop } from '@/types';
import { fallSowWeeksBeforeFirstFrost, sowWindow } from './usePlanEditor';
import type { PlanEditor } from './usePlanEditor';

const SUN_LABELS: Record<Crop['sunRequirement'], string> = {
  full: 'Full sun',
  partial: 'Partial sun',
  shade: 'Shade',
};

const NITROGEN_LABELS: Record<Crop['nitrogenNeed'], string> = {
  low: 'N: low',
  medium: 'N: medium',
  high: 'N: high',
};

export function SelectionPanel({ editor }: { editor: PlanEditor }) {
  const { selectedInfo } = editor;
  const crop = selectedInfo?.crop ?? null;
  const fallWeeks = crop ? fallSowWeeksBeforeFirstFrost(crop) : null;
  // Bonus: resolve the fall window to calendar dates from the farm's
  // first-frost date (already loaded via usePlanEditor — no new queries).
  // Aim at the upcoming first frost; roll to next year once it has passed.
  let fallSowLabel: string | null = null;
  const firstFrost = editor.farm?.firstFrost;
  if (fallWeeks !== null && firstFrost && isValidMonthDay(firstFrost)) {
    const today = new Date();
    let frost = dateFromMonthDay(firstFrost, today.getFullYear());
    if (frost.getTime() < today.getTime()) frost = dateFromMonthDay(firstFrost, today.getFullYear() + 1);
    const sowBy = new Date(frost);
    sowBy.setDate(sowBy.getDate() - fallWeeks * 7);
    fallSowLabel = `around ${monthDayLabel(sowBy)} · first frost ${monthDayLabel(frost)}`;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Selection</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {selectedInfo ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Cell {selectedInfo.x}, {selectedInfo.y}</div>
            <div>Crop: {selectedInfo.crop ? `${selectedInfo.crop.emoji ?? ''} ${selectedInfo.crop.name}` : 'None'}</div>
            {selectedInfo.crop && (
              <>
                <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">
                    {selectedInfo.crop.scientificName ?? selectedInfo.crop.family ?? selectedInfo.crop.category}
                  </div>
                  <div>
                    Spacing {selectedInfo.crop.spacingCm ?? 30} cm × {selectedInfo.crop.rowSpacingCm ?? selectedInfo.crop.spacingCm ?? 30} cm
                    {' '}· this cell contributes ≈{plantsForArea(selectedInfo.crop, 1)} plant
                  </div>
                  <div>
                    Family {selectedInfo.crop.family ?? 'Unknown'} · {selectedInfo.crop.frostTolerance ?? 'unknown'} frost tolerance
                  </div>
                  <div>~{selectedInfo.crop.growthDays} days to harvest</div>
                  <div>Sow: {sowWindow(selectedInfo.crop)}</div>
                  {fallSowLabel && <div>Fall: sow {fallSowLabel}</div>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[11px]">☀️ {SUN_LABELS[selectedInfo.crop.sunRequirement]}</Badge>
                  <Badge variant="secondary" className="text-[11px]">💧 {selectedInfo.crop.waterNeedMmDay} mm/day</Badge>
                  <Badge variant="secondary" className="text-[11px]">🧪 {NITROGEN_LABELS[selectedInfo.crop.nitrogenNeed]}</Badge>
                </div>
              </>
            )}
            <div>Ground: {selectedInfo.asset ? `${selectedInfo.asset.emoji} ${selectedInfo.asset.label}` : 'Bare soil'}</div>
            <div className="text-xs text-muted-foreground">
              {selectedInfo.plantable ? 'Planting allowed here.' : 'This ground blocks planting.'}
            </div>
            {selectedInfo.companions.length > 0 && (
              <div className="text-xs text-green-700 dark:text-green-300">
                Nearby companions: {selectedInfo.companions.map((crop) => crop.name).join(', ')}
              </div>
            )}
            {selectedInfo.antagonists.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-300">
                Nearby conflicts: {selectedInfo.antagonists.map((crop) => crop.name).join(', ')}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Use Select (V) and click a cell to inspect it.</p>
        )}
      </CardContent>
    </Card>
  );
}
