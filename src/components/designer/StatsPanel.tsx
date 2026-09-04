import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlanEditor } from './usePlanEditor';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function StatsPanel({ editor }: { editor: PlanEditor }) {
  const { stats } = editor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Plan Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Planted" value={`${stats.plantedAreaM2.toFixed(1)} m²`} />
              <Metric label="Beds" value={`${stats.bedAreaM2.toFixed(1)} m²`} />
              <Metric label="Paths/infra" value={`${stats.infrastructureAreaM2.toFixed(1)} m²`} />
              <Metric label="Yield" value={`${stats.totalYieldKg.toFixed(0)} kg`} />
              <Metric label="Water" value={`${stats.totalWaterLDay.toFixed(0)} L/day`} />
              <Metric label="Families" value={String(stats.families.length)} />
            </div>
            <div className="space-y-2">
              {stats.perCrop.map((stat) => (
                <div key={stat.crop.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 font-medium">
                      <span className="mr-1">{stat.crop.emoji}</span>{stat.crop.name}
                    </div>
                    <Badge variant="secondary">≈{stat.plants} plants</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {stat.areaM2.toFixed(1)} m² · {stat.yieldKg.toFixed(1)} kg yield · {stat.waterLDay.toFixed(1)} L/day
                  </div>
                </div>
              ))}
              {stats.perCrop.length === 0 && <p className="text-xs text-muted-foreground">No crops painted yet.</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
