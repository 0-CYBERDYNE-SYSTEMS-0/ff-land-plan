import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { plantsForArea } from '@/lib/plan';
import type { PlanEditor } from './usePlanEditor';

export function SelectionPanel({ editor }: { editor: PlanEditor }) {
  const { selectedInfo } = editor;
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
              </div>
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
