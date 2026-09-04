import { useMemo } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CalendarDays,
  CloudSun,
  FlaskConical,
  Leaf,
  Map,
  Pencil,
  Plus,
  Sprout,
  Trash2,
  ChartNoAxesColumn,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { computeStats } from '@/lib/plan';
import { useDeleteFarm, useFarms } from '@/hooks/useFarms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Alert, Crop, Farm } from '@/types';

const WEATHER_STALE_MS = 15 * 60 * 1000;

function useFarmWeather(farmId: number | undefined) {
  return useQuery({
    queryKey: ['weather', farmId],
    queryFn: () => apiFetch.getWeather(farmId!),
    enabled: !!farmId,
    staleTime: WEATHER_STALE_MS,
  });
}

function useFarmAlerts(farmId: number | undefined) {
  return useQuery<Alert[]>({
    queryKey: ['alerts', farmId],
    queryFn: () => apiFetch.listAlerts(farmId!),
    enabled: !!farmId,
    staleTime: WEATHER_STALE_MS,
  });
}

function WeatherPill({ farmId }: { farmId: number }) {
  const { data } = useFarmWeather(farmId);
  if (!data) return <span className="text-xs text-muted-foreground">Loading weather…</span>;
  const c = data.current;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1">
        <WeatherIcon code={c.weatherCode} className="w-3.5 h-3.5" />
        {c.tempC.toFixed(1)}°C
      </span>
      <span className="text-muted-foreground text-xs">{c.weatherDesc}</span>
    </div>
  );
}

function FarmCard({ farm }: { farm: Farm }) {
  const { data: cells = [] } = useQuery({
    queryKey: ['cells', farm.id],
    queryFn: () => apiFetch.listCells(farm.id),
  });
  const { data: plan = null } = useQuery({
    queryKey: ['plan', farm.id],
    queryFn: () => apiFetch.getPlan(farm.id),
  });
  const { data: crops = [] } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });
  const { data: alerts = [] } = useFarmAlerts(farm.id);
  const deleteFarm = useDeleteFarm();
  const qc = useQueryClient();

  const planStats = useMemo(() => plan ? computeStats(plan, crops) : null, [crops, plan]);
  const plannedPlants = planStats?.perCrop.reduce((sum, stat) => sum + stat.plants, 0) ?? 0;
  const legacyPlanted = cells.filter((c) => c.cropId).length;
  const plantedDisplay = planStats ? `≈${plannedPlants}` : String(legacyPlanted);
  const plantedLabel = planStats ? 'plants planned' : 'legacy planted';
  const coverage = planStats && plan
    ? Math.round((planStats.plantedAreaM2 / (plan.widthM * plan.heightM)) * 100)
    : cells.length > 0 ? Math.round((legacyPlanted / cells.length) * 100) : 0;
  const unread = alerts.filter((a) => !a.isRead).length;
  const critical = alerts.filter((a) => !a.isRead && a.severity === 'critical').length;

  return (
    <Card className="group hover:shadow-md transition-shadow" data-testid={`card-farm-${farm.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{farm.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {farm.description ?? `${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}`}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {critical > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 h-5">
                {critical} critical
              </Badge>
            )}
            {unread > 0 && critical === 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 h-5">
                {unread} alerts
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <WeatherPill farmId={farm.id} />
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-muted rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-semibold">{farm.areHa}</div>
            <div className="text-xs text-muted-foreground">ha</div>
          </div>
          <div className="bg-muted rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-semibold">{plantedDisplay}</div>
            <div className="text-xs text-muted-foreground">{plantedLabel}</div>
          </div>
          <div className="bg-muted rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-semibold">{planStats ? `${planStats.totalYieldKg.toFixed(0)}` : '—'}</div>
            <div className="text-xs text-muted-foreground">kg yield</div>
          </div>
          <div className="bg-muted rounded-md px-2 py-1.5 text-center">
            <div className="text-sm font-semibold capitalize">{farm.soilType ?? 'loam'}</div>
            <div className="text-xs text-muted-foreground">soil</div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Coverage</span>
            <span className="font-medium">{coverage}%</span>
          </div>
          <Progress value={coverage} className="h-1.5" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <Link href={`/farms/${farm.id}/map`} className="flex-1">
            <Button variant="default" size="sm" className="w-full text-xs gap-1">
              <Map className="w-3.5 h-3.5" /> Design Plot
            </Button>
          </Link>
          <Link href={`/farms/${farm.id}/weather`}>
            <Button variant="outline" size="sm" className="text-xs px-2.5" data-testid={`btn-weather-${farm.id}`}>
              <CloudSun className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Link href={`/farms/${farm.id}/simulations`}>
            <Button variant="outline" size="sm" className="text-xs px-2.5">
              <FlaskConical className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Link href={`/farms/${farm.id}/edit`}>
            <Button variant="ghost" size="sm" className="text-xs px-2.5">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs px-2.5 hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {farm.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes all cells, sensors, and data. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await deleteFarm.mutateAsync(farm.id);
                    qc.invalidateQueries({ queryKey: ['alerts'] });
                    qc.invalidateQueries({ queryKey: ['cells'] });
                    qc.invalidateQueries({ queryKey: ['plan'] });
                    toast.success('Farm deleted');
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveAlertsBanner({ farms }: { farms: Farm[] }) {
  const first = farms[0];
  const { data: alerts = [] } = useFarmAlerts(first?.id);
  const markAll = useMutation({
    mutationFn: () => apiFetch.markAllAlertsRead(first.id),
    onSuccess: () => {
      // Refresh alerts on every farm
    },
  });
  const qc = useQueryClient();
  const unread = alerts.filter((a) => !a.isRead);
  if (unread.length === 0) return null;

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Active Alerts ({unread.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={async () => {
              await markAll.mutateAsync();
              qc.invalidateQueries({ queryKey: ['alerts'] });
            }}
          >
            Mark all read
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {unread.slice(0, 4).map((a) => (
          <div key={a.id} className="flex items-start gap-2 text-sm">
            {a.severity === 'critical' ? (
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            ) : a.severity === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
            )}
            <span className="text-muted-foreground">{a.message}</span>
          </div>
        ))}
        {unread.length > 4 && (
          <p className="text-xs text-muted-foreground">+ {unread.length - 4} more alerts</p>
        )}
      </CardContent>
    </Card>
  );
}

const SHORTCUTS = (farmId: number | undefined) => [
  { icon: Leaf, label: 'Crop Library', href: '/crops', color: 'text-green-600' },
  { icon: CalendarDays, label: 'Calendar', href: `/farms/${farmId}/calendar`, color: 'text-emerald-600' },
  { icon: ChartNoAxesColumn, label: 'Simulations', href: `/farms/${farmId}/simulations`, color: 'text-blue-600' },
  { icon: CloudSun, label: 'Weather', href: `/farms/${farmId}/weather`, color: 'text-orange-600' },
];

export function Dashboard() {
  const { data: farms = [], isLoading } = useFarms();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Farm Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {farms.length === 0
              ? 'Add your first farm to get started'
              : `${farms.length} farm${farms.length !== 1 ? 's' : ''} in your digital twin`}
          </p>
        </div>
        <Link href="/farms/new">
          <Button size="sm" className="gap-1.5" data-testid="btn-add-farm">
            <Plus className="w-4 h-4" /> Add Farm
          </Button>
        </Link>
      </div>

      {farms.length > 0 && <ActiveAlertsBanner farms={farms} />}

      {farms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Sprout className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Your digital farm starts here</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Import GPS coordinates to generate a real 3D terrain replica. Plant crops, simulate seasons, and monitor everything in one place.
              </p>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              {['Live weather data', 'Plot designer', 'Yield simulations', 'IoT sensor support'].map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <Link href="/farms/new">
              <Button className="gap-2" data-testid="btn-get-started">
                <Plus className="w-4 h-4" /> Add Your First Farm
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {farms.map((farm) => (
            <FarmCard key={farm.id} farm={farm} />
          ))}
          <Link href="/farms/new">
            <Card className="border-dashed cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors h-full min-h-48 flex items-center justify-center">
              <CardContent className="text-center pt-6">
                <Plus className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Add another farm</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {farms.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SHORTCUTS(farms[0]?.id).map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center gap-3">
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                  <span className="text-sm font-medium">{s.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
