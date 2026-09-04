import { useState } from 'react';
import { useNavigation } from '@/hooks/useNavigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Droplets,
  Eye,
  Plus,
  Satellite,
  Thermometer,
  Trash2,
} from 'lucide-react';
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

import { apiFetch } from '@/lib/api';
import { useFarm } from '@/hooks/useFarms';
import { planNdviGrid } from '@/lib/ndvi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/shared/Stat';
import { EmptyState } from '@/components/shared/EmptyState';
import { ndviColor, ndviLabel } from '@/components/ndvi/ndviColor';
import type { Alert, Crop, PlanState, Sensor, SensorType, Weather, WeatherHistoryPoint } from '@/types';

const SENSOR_ICON: Record<SensorType, typeof Droplets> = {
  soil_moisture: Droplets,
  temperature: Thermometer,
  humidity: Droplets,
  ndvi_proxy: Eye,
  rainfall: Droplets,
};

function isInRange(sensor: Sensor, v: number): boolean {
  if (sensor.sensorType === 'soil_moisture') return v > 25 && v < 80;
  if (sensor.sensorType === 'temperature') return v > 5 && v < 35;
  return true;
}

// Weather-derived virtual reading for a sensor slot, or null when offline /
// unsupported type. series is null for rainfall (no history field for it).
function virtualReading(
  sensor: Sensor,
  weather: Weather | null,
  history: WeatherHistoryPoint[] | undefined,
): { value: number; unit: string; series: { i: number; value: number }[] | null } | null {
  if (!weather) return null;
  const c = weather.current;
  switch (sensor.sensorType) {
    case 'soil_moisture':
      return { value: c.soilMoisture, unit: '%', series: history?.map((h, i) => ({ i, value: h.soilMoisture })) ?? [] };
    case 'temperature':
      return { value: c.tempC, unit: '°C', series: history?.map((h, i) => ({ i, value: h.tempC })) ?? [] };
    case 'humidity':
      return { value: c.humidity, unit: '%', series: history?.map((h, i) => ({ i, value: h.humidity })) ?? [] };
    case 'rainfall':
      return { value: c.precipMm, unit: 'mm', series: null };
    default:
      return null;
  }
}

const MS_24H = 24 * 60 * 60 * 1000;

function AlertItem({ alert, onRead }: { alert: Alert; onRead: (id: number) => void }) {
  const variant = alert.severity === 'critical' ? 'destructive' : alert.severity === 'warning' ? 'secondary' : 'outline';
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
        alert.isRead ? 'opacity-60' : 'bg-yellow-500/5 border border-yellow-500/20'
      }`}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">{alert.message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{new Date(alert.createdAt).toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant={variant} className="text-xs capitalize">
          {alert.severity}
        </Badge>
        {!alert.isRead && (
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => onRead(alert.id)}>
            Mark read
          </Button>
        )}
      </div>
    </div>
  );
}

function SensorCard({
  sensor,
  farmId,
  weather,
  history,
}: {
  sensor: Sensor;
  farmId: number;
  weather: Weather | null;
  history: WeatherHistoryPoint[] | undefined;
}) {
  const qc = useQueryClient();
  const { data: readings = [] } = useQuery({
    queryKey: ['readings', sensor.id],
    queryFn: () => apiFetch.listReadings(sensor.id, 20),
    refetchInterval: 30_000,
  });
  const [value, setValue] = useState('');
  const Icon = SENSOR_ICON[sensor.sensorType] ?? Activity;

  const addReading = useMutation({
    mutationFn: (v: number) => apiFetch.addReading(sensor.id, v, sensor.sensorType === 'soil_moisture' ? '%' : '°C'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['readings', sensor.id] });
      qc.invalidateQueries({ queryKey: ['sensors', farmId] });
      toast.success('Reading recorded');
    },
  });
  const del = useMutation({
    mutationFn: () => apiFetch.deleteSensor(sensor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors', farmId] });
      toast.success('Sensor removed');
    },
  });

  // Truth pass: manual reading is authoritative only when fresh (< 24 h);
  // otherwise a weather-fed virtual reading takes over, honestly badged.
  const manualFresh = sensor.lastReadingAt !== null && Date.now() - new Date(sensor.lastReadingAt).getTime() < MS_24H;
  const virtual = manualFresh ? null : virtualReading(sensor, weather, history);
  const shownValue = manualFresh ? sensor.lastValue : virtual ? virtual.value : null;
  const shownUnit = manualFresh ? sensor.lastUnit : virtual ? virtual.unit : sensor.lastUnit;
  const chartData =
    manualFresh || virtual?.series === null
      ? [...readings].reverse().map((r, i) => ({ i, value: r.value }))
      : virtual?.series ?? [];
  const inRange = shownValue !== null && sensor.sensorType !== 'rainfall' ? isInRange(sensor, shownValue) : shownValue !== null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <CardTitle className="text-sm">{sensor.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {virtual ? (
              // Pulse only when the virtual feed is actually hydrating the card.
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="live-pulse w-2 h-2 rounded-full bg-blue-500 block" /> Virtual · Open-Meteo
              </span>
            ) : manualFresh ? (
              <span className="text-xs text-green-600">Live</span>
            ) : !sensor.isActive ? (
              <Badge variant="secondary" className="text-xs">
                Offline
              </Badge>
            ) : null}
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => del.mutate()}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold">{shownValue !== null ? shownValue.toFixed(1) : '—'}</span>
            <span className="text-sm text-muted-foreground ml-1">{shownUnit ?? ''}</span>
          </div>
          {shownValue !== null &&
            (inRange ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-yellow-500" />)}
        </div>
        {chartData.length > 1 && (
          <div className="h-12 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -40 }}>
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8 }} hide />
                <Tooltip contentStyle={{ fontSize: 10, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.1"
            placeholder="Enter reading"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-xs flex-1"
            data-testid={`input-sensor-reading-${sensor.id}`}
          />
          <Button
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => {
              if (value) {
                addReading.mutate(parseFloat(value));
                setValue('');
              }
            }}
            disabled={!value || addReading.isPending}
            data-testid={`btn-add-reading-${sensor.id}`}
          >
            Log
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {manualFresh && sensor.lastReadingAt
            ? `Last manual: ${new Date(sensor.lastReadingAt).toLocaleTimeString()}`
            : virtual
              ? 'From live Open-Meteo weather'
              : 'No readings yet'}
        </p>
      </CardContent>
    </Card>
  );
}

interface NdviData {
  cells: { x: number; y: number; ndvi: number }[];
  sampledAt: string;
  note: string;
}

function NdviPanel({
  farmId,
  plan,
  crops,
}: {
  farmId: number;
  plan: PlanState | null | undefined;
  crops: Crop[] | undefined;
}) {
  const qc = useQueryClient();
  const cropById = new Map((crops ?? []).map((c) => [c.id, c]));
  const { data, isFetching, refetch } = useQuery<NdviData>({
    queryKey: ['ndvi-modeled', farmId, plan?.updatedAt, crops?.length],
    queryFn: () => {
      if (!plan) return { cells: [], sampledAt: new Date().toISOString(), note: 'No plan yet' };
      return planNdviGrid(plan, cropById);
    },
    enabled: !!plan,
    staleTime: 60_000,
  });
  const grid = data?.cells ?? [];
  const avg = grid.length > 0 ? grid.reduce((s, c) => s + c.ndvi, 0) / grid.length : 0;
  const buckets = [
    { label: '< 0.2 (Bare)', count: grid.filter((c) => c.ndvi < 0.2).length, color: '#D4380D' },
    { label: '0.2–0.4 (Sparse)', count: grid.filter((c) => c.ndvi >= 0.2 && c.ndvi < 0.4).length, color: '#FFAE00' },
    { label: '0.4–0.6 (Moderate)', count: grid.filter((c) => c.ndvi >= 0.4 && c.ndvi < 0.6).length, color: '#7DC900' },
    { label: '> 0.6 (Dense)', count: grid.filter((c) => c.ndvi >= 0.6).length, color: '#006B3C' },
  ];
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Satellite className="w-4 h-4 text-primary" /> NDVI Analysis
            <Badge variant="secondary" className="text-xs">
              Modeled
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['ndvi-modeled', farmId] });
              refetch();
            }}
            disabled={isFetching}
          >
            <Activity className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold" style={{ color: ndviColor(avg) }}>
              {avg.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Average NDVI</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">{grid.length > 0 ? ndviLabel(avg) : 'No plan yet'}</div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>0.0</span>
            <span>NDVI</span>
            <span>1.0</span>
          </div>
          <div className="relative ndvi-bar h-3 rounded">
            <div
              className="absolute top-0 w-2 h-3 rounded bg-white border border-black/20"
              style={{ left: `${avg * 100}%`, transform: 'translateX(-50%)' }}
            />
          </div>
        </div>
        <div className="space-y-1">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
              <span className="text-muted-foreground flex-1">{b.label}</span>
              <span className="font-medium">{b.count} cells</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.note ?? 'No plan yet'}.{' '}
          {data ? `Updated ${new Date(data.sampledAt).toLocaleTimeString()}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}

export function Monitoring({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm } = useFarm(farmId);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ name: string; sensorType: SensorType }>({ name: '', sensorType: 'soil_moisture' });

  const { data: sensors = [], isLoading } = useQuery({
    queryKey: ['sensors', farmId],
    queryFn: () => apiFetch.listSensors(farmId),
  });
  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ['alerts', farmId],
    queryFn: () => apiFetch.listAlerts(farmId),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 60_000,
  });
  // Plan + catalog drive the stat row (replaces the legacy seed-noise cells).
  const { data: plan } = useQuery<PlanState | null>({
    queryKey: ['plan', farmId],
    queryFn: () => apiFetch.getPlan(farmId),
  });
  const { data: crops } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });
  // Live weather: explicit queryFn + overridden staleTime (global defaults are
  // hostile: staleTime Infinity + URL-joining queryFn).
  const { data: weather } = useQuery<Weather>({
    queryKey: ['weather', farmId],
    queryFn: () => apiFetch.getWeather(farmId),
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
  const { data: history } = useQuery<WeatherHistoryPoint[]>({
    queryKey: ['weather-history', farmId],
    queryFn: () => apiFetch.getWeatherHistory(farmId, 24),
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  const addSensor = useMutation({
    mutationFn: () => apiFetch.createSensor(farmId, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensors', farmId] });
      toast.success('Sensor added');
      setAddOpen(false);
      setDraft({ name: '', sensorType: 'soil_moisture' });
    },
  });
  const markRead = useMutation({
    mutationFn: (id: number) => apiFetch.markAlertRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', farmId] }),
  });
  const markAll = useMutation({
    mutationFn: () => apiFetch.markAllAlertsRead(farmId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', farmId] }),
  });

  // --- Plan-derived stat row (honest estimates, not telemetry) --------------
  const cropById = new Map((crops ?? []).map((c) => [c.id, c]));
  const plantedEntries = Object.entries(plan?.planting ?? {});
  const plantedCount = plantedEntries.length;
  const moisture = weather?.current.soilMoisture ?? null;

  const needsIrrigation =
    moisture !== null &&
    plantedEntries.some(([, id]) => {
      const crop = cropById.get(id);
      return crop && crop.waterNeedMmDay > 4 && moisture < 30 && !(plan?.surface && plan.surface !== 'outdoor');
    });
  const thirstyCount = plantedEntries.filter(([, id]) => (cropById.get(id)?.waterNeedMmDay ?? 0) > 4).length;
  const demandingShare =
    plantedCount > 0
      ? plantedEntries.filter(([, id]) => {
          const need = cropById.get(id)?.nitrogenNeed;
          return need === 'high' || need === 'medium';
        }).length / plantedCount
      : 0;

  const unreadAlerts = alerts.filter((a) => !a.isRead).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{farm?.name} — sensors, alerts &amp; plant health</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)} className="gap-1.5" data-testid="btn-add-sensor">
          <Plus className="w-4 h-4" /> Add Sensor
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Plan-based estimates — not sensor telemetry</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Soil Moisture"
          value={moisture !== null ? `${moisture.toFixed(0)}%` : '—'}
          sub={moisture === null ? (plantedCount === 0 ? 'No plan yet' : 'Weather unavailable') : needsIrrigation ? 'Irrigation needed' : 'Adequate'}
          progress={moisture ?? 0}
        />
        <Stat
          label="Nitrogen Level"
          value={plantedCount > 0 ? `${Math.round(demandingShare * 100)}%` : '—'}
          sub={plantedCount === 0 ? 'No plan yet' : demandingShare >= 0.5 ? 'Supplement recommended' : 'Adequate'}
          progress={demandingShare * 100}
        />
        <Stat
          label="Thirsty Cells"
          value={thirstyCount}
          sub={plantedCount === 0 ? 'No plan yet' : `of ${plantedCount} planted cells`}
          progress={(thirstyCount / Math.max(plantedCount, 1)) * 100}
        />
        <Stat label="Active Alerts" value={unreadAlerts} sub={unreadAlerts > 0 ? 'Needs attention' : 'All clear'} progress={Math.min(100, unreadAlerts * 20)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {addOpen && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-semibold">Add IoT Sensor</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Sensor name (e.g. North Field Probe)" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="h-8 text-sm" data-testid="input-sensor-name" />
                  <Select value={draft.sensorType} onValueChange={(v) => setDraft((d) => ({ ...d, sensorType: v as SensorType }))}>
                    <SelectTrigger className="h-8 text-sm" data-testid="select-sensor-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soil_moisture">Soil Moisture (%)</SelectItem>
                      <SelectItem value="temperature">Temperature (°C)</SelectItem>
                      <SelectItem value="humidity">Humidity (%)</SelectItem>
                      <SelectItem value="ndvi_proxy">NDVI Proxy</SelectItem>
                      <SelectItem value="rainfall">Rainfall (mm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => addSensor.mutate()} disabled={!draft.name || addSensor.isPending} data-testid="btn-save-sensor">
                    Add Sensor
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" /> IoT Sensors ({sensors.length})
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-44" />
                ))}
              </div>
            ) : sensors.length === 0 ? (
              <EmptyState
                icon={<Activity className="w-8 h-8 text-muted-foreground" />}
                title="No sensors added yet"
                description="Add FarmBot, soil probes, or LoRa sensors."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sensors.map((s) => (
                  <SensorCard key={s.id} sensor={s} farmId={farmId} weather={weather ?? null} history={history} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <NdviPanel farmId={farmId} plan={plan} crops={crops} />
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Alerts{' '}
                  {unreadAlerts > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 h-4">
                      {unreadAlerts}
                    </Badge>
                  )}
                </CardTitle>
                {unreadAlerts > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => markAll.mutate()}>
                    All read
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">No alerts. Refresh weather to check conditions.</p>
                </div>
              ) : (
                alerts.slice(0, 10).map((a) => (
                  <AlertItem key={a.id} alert={a} onRead={(id) => markRead.mutate(id)} />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
