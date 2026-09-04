import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  CloudRain,
  Droplets,
  MapPin,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
  Cloud,
  Sprout,
  Waves,
} from 'lucide-react';
import { useNavigation } from '@/hooks/useNavigation';

import { apiFetch } from '@/lib/api';
import { useFarm } from '@/hooks/useFarms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/shared/Stat';
import { WeatherIcon } from '@/components/weather/WeatherIcon';
import { SoilProfileCard } from '@/components/weather/SoilProfileCard';
import { fetchAirQuality } from '@/lib/airquality';
import { fetchFloodRisk } from '@/lib/flood';

const WEATHER_STALE_MS = 15 * 60 * 1000;

// Ozone leaf-injury guard: CAMS ozone in μg/m³; sustained levels ≥ 100 signal
// visible foliar injury on sensitive crops — the EU ambient-ozone target value
// for vegetation protection is ≈ 120 μg/m³ (18 h mean, Directive 2004/107/EC),
// so 100 is a conservative early-warning line below it.
const OZONE_LEAF_RISK_UG_M3 = 100;

function EnvironmentCard({ lat, lng }: { lat: number; lng: number }) {
  const air = useQuery({
    queryKey: ['air-quality', lat, lng],
    queryFn: () => fetchAirQuality(lat, lng),
    staleTime: 60 * 60 * 1000, // module caches 1 h — match it (hostile defaults trap)
  });
  const flood = useQuery({
    queryKey: ['flood-risk', lat, lng],
    queryFn: () => fetchFloodRisk(lat, lng),
    staleTime: 12 * 60 * 60 * 1000, // module caches 12 h
  });

  if (air.isLoading || flood.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
    );
  }

  const ozone = air.data?.ozoneUgM3 ?? null;
  const fr = flood.data;
  if (ozone === null && !fr) return null; // both sources unavailable — hide entirely

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wind className="w-4 h-4 text-primary" /> Environment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ozone !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Ozone</span>
            <span className="font-medium">{ozone.toFixed(0)} μg/m³</span>
            {ozone >= OZONE_LEAF_RISK_UG_M3 && (
              <Badge variant="secondary" className="text-amber-600">
                leaf-damage risk for sensitive crops
              </Badge>
            )}
          </div>
        )}
        {fr && fr.riskLevel !== 'low' && (
          <div className="flex items-center gap-2 text-sm">
            <Waves className="w-4 h-4 text-blue-500" />
            <span className="text-muted-foreground">Flood</span>
            <Badge
              variant="secondary"
              className={fr.riskLevel === 'high' ? 'text-red-600 capitalize' : 'text-amber-600 capitalize'}
            >
              {fr.riskLevel}
            </Badge>
            <span className="font-medium">{fr.dischargeM3s.toFixed(2)} m³/s river discharge</span>
          </div>
        )}
        {fr && fr.riskLevel === 'low' && (
          <div className="text-sm text-muted-foreground">No flood signal on the river forecast.</div>
        )}
        <div className="text-xs text-muted-foreground">CAMS · Copernicus / GloFAS · Copernicus</div>
      </CardContent>
    </Card>
  );
}

export function Weather({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm } = useFarm(farmId);

  const weather = useQuery({
    queryKey: ['weather', farmId],
    queryFn: () => apiFetch.getWeather(farmId),
    staleTime: WEATHER_STALE_MS,
  });
  const forecast = useQuery({
    queryKey: ['forecast', farmId],
    queryFn: () => apiFetch.getForecast(farmId),
    staleTime: WEATHER_STALE_MS,
  });
  const history = useQuery({
    queryKey: ['weather-history', farmId],
    queryFn: () => apiFetch.getWeatherHistory(farmId, 24),
    staleTime: WEATHER_STALE_MS,
  });

  const c = weather.data?.current;

  const chartData = history.data
    ? [...history.data].reverse().map((p, i) => ({ time: `${i}h`, temp: p.tempC, humidity: p.humidity, moisture: p.soilMoisture }))
    : [];

  const indicators = c
    ? [
        {
          label: 'Growing Conditions',
          score: c.tempC ? Math.max(0, Math.min(100, 100 - Math.abs((c.tempC - 22) * 3))) : 0,
          desc: c.tempC > 10 && c.tempC < 30 ? 'Favorable' : 'Stressful',
          color: 'text-green-600',
        },
        {
          label: 'Irrigation Need',
          score: c.soilMoisture ? Math.max(0, 100 - c.soilMoisture * 1.5) : 0,
          desc: c.soilMoisture > 40 ? 'Low' : 'High',
          color: c.soilMoisture < 25 ? 'text-red-500' : 'text-blue-500',
        },
        {
          label: 'Frost Risk',
          score: c.tempC < 4 ? 90 : c.tempC < 8 ? 40 : 5,
          desc: c.tempC < 2 ? 'Critical' : c.tempC < 5 ? 'Moderate' : 'Low',
          color: c.tempC < 2 ? 'text-red-500' : 'text-green-600',
        },
      ]
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Live Weather
              {weather.data?.cached && (
                <Badge variant="secondary" className="text-xs">
                  Cached
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />
              {farm?.name} — {farm?.lat.toFixed(4)}, {farm?.lng.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="live-pulse w-2 h-2 rounded-full bg-primary block" />
            Open-Meteo API
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => weather.refetch()}
            disabled={weather.isFetching}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${weather.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {weather.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : c ? (
        <>
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="py-5">
              <div className="flex items-center gap-6">
                <div className="float-anim">
                  <WeatherIcon code={c.weatherCode} className="w-14 h-14" />
                </div>
                <div>
                  <div className="text-4xl font-bold">{c.tempC.toFixed(1)}°C</div>
                  <div className="text-lg text-muted-foreground">{c.weatherDesc}</div>
                  <div className="text-sm text-muted-foreground">Feels like {c.feelsLikeC.toFixed(1)}°C</div>
                </div>
                <div className="ml-auto grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-blue-400" />
                    <span>{c.humidity.toFixed(0)}% RH</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-slate-400" />
                    <span>{c.windSpeedKmh.toFixed(0)} km/h</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CloudRain className="w-4 h-4 text-blue-500" />
                    <span>{c.precipMm.toFixed(1)} mm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-yellow-500" />
                    <span>UV {c.uvIndex.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Soil Temp" value={c.soilTempC.toFixed(1)} unit="°C" icon={<Thermometer className="w-4 h-4 text-orange-500" />} />
            <Stat
              label="Soil Moisture"
              value={c.soilMoisture.toFixed(0)}
              unit="%"
              icon={<Droplets className="w-4 h-4 text-blue-500" />}
              progress={c.soilMoisture}
            />
            <Stat
              label="Cloud Cover"
              value={c.cloudCover.toFixed(0)}
              unit="%"
              icon={<Cloud className="w-4 h-4 text-slate-400" />}
              progress={c.cloudCover}
            />
            <Stat
              label="UV Index"
              value={c.uvIndex.toFixed(1)}
              icon={<Sun className="w-4 h-4 text-yellow-500" />}
              progress={(c.uvIndex / 11) * 100}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sprout className="w-4 h-4 text-primary" /> Agricultural Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {indicators.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className={`font-medium ${m.color}`}>{m.desc}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${m.score ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Weather data unavailable
          </CardContent>
        </Card>
      )}

      {farm && <SoilProfileCard lat={farm.lat} lng={farm.lng} />}

      {farm && <EnvironmentCard lat={farm.lat} lng={farm.lng} />}

      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Temperature History (last 24 readings)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area
                  type="monotone"
                  dataKey="temp"
                  stroke="hsl(var(--chart-3))"
                  fill="hsl(var(--chart-3) / 0.1)"
                  strokeWidth={2}
                  name="Temp (°C)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {forecast.data && forecast.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">7-Day Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              {forecast.data.map((d, i) => (
                <div
                  key={d.date}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors ${
                    i === 0 ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'
                  }`}
                >
                  <span className="text-xs text-muted-foreground font-medium">
                    {i === 0
                      ? 'Today'
                      : new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <WeatherIcon code={d.weatherCode} className="w-5 h-5" />
                  <div className="text-center">
                    <div className="text-xs font-semibold">{d.maxTempC.toFixed(0)}°</div>
                    <div className="text-xs text-muted-foreground">{d.minTempC.toFixed(0)}°</div>
                  </div>
                  {d.precipMm > 0 && (
                    <span className="text-xs text-blue-500 flex items-center gap-0.5">
                      <Droplets className="w-3 h-3" />
                      {d.precipMm.toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Weather, forecast, soil, and UV data from Open-Meteo under CC BY 4.0.
      </p>
    </div>
  );
}
