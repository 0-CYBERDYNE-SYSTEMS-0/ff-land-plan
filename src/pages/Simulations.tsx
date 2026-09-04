import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Sprout,
  Leaf,
  Droplets,
  DollarSign,
  Thermometer,
  Wind,
  TrendingUp,
  Zap,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell as RadarCell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiFetch } from '@/lib/api';
import { useFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ScenarioType, Simulation, SimulationResults } from '@/types';
import type { SimCropResult, SimProvenance, YieldRange } from '@/lib/sim';

type ParsedResults = SimulationResults & { perCrop?: SimCropResult[]; provenance?: SimProvenance; range?: YieldRange };

const PRESETS: { type: ScenarioType; label: string; desc: string; icon: typeof Sprout; tempDelta: number; precip: number; fert: number }[] = [
  { type: 'baseline', label: 'Current Conditions', desc: "Simulate with today's data", icon: Sprout, tempDelta: 0, precip: 1, fert: 0 },
  { type: 'drought', label: 'Drought Stress', desc: '50% less precipitation', icon: Wind, tempDelta: 2, precip: 0.5, fert: 0 },
  { type: 'heat_stress', label: 'Heat Stress', desc: '+3°C temperature', icon: Thermometer, tempDelta: 3, precip: 0.9, fert: 0 },
  { type: 'optimal', label: 'Optimal Input', desc: 'Best irrigation + fertilizer', icon: TrendingUp, tempDelta: 0, precip: 1.2, fert: 2 },
  { type: 'climate_change', label: 'Climate +2°C', desc: 'Climate change scenario', icon: Zap, tempDelta: 2, precip: 0.8, fert: 0 },
];

const SCHEMA = z.object({
  name: z.string().min(1),
  durationDays: z.coerce.number().min(1).max(365),
  tempDeltaC: z.coerce.number().min(-10).max(10),
  precipMultiplier: z.coerce.number().min(0).max(3),
  fertilizerBoost: z.coerce.number().min(0).max(5),
  scenarioType: z.enum(['baseline', 'drought', 'heat_stress', 'optimal', 'climate_change']),
});
type FormValues = z.infer<typeof SCHEMA>;

const SCENARIO_COLOR: Record<ScenarioType, string> = {
  baseline: 'text-blue-600',
  drought: 'text-orange-600',
  heat_stress: 'text-red-600',
  optimal: 'text-green-600',
  climate_change: 'text-purple-600',
};

function SimulationCard({ sim }: { sim: Simulation }) {
  const results: ParsedResults | null = sim.results ? JSON.parse(sim.results) : null;
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch.deleteSimulation(sim.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simulations', sim.farmId] });
      toast.success('Simulation deleted');
    },
  });

  const radarData = results
    ? [
        { metric: 'Yield', value: Math.min(100, (results.yieldTonHa / 20) * 100) },
        { metric: 'Water Eff.', value: Math.min(100, Math.max(0, 100 - results.waterUseMm / 10)) },
        { metric: 'Carbon', value: Math.min(100, (results.carbonKgHa / 1000) * 100) },
        { metric: 'Profit', value: Math.min(100, Math.max(0, (results.profitUsdHa + 500) / 15)) },
        { metric: 'Stress', value: results.stressScore },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{sim.name}</CardTitle>
            <Badge variant="outline" className={`text-xs mt-1 ${SCENARIO_COLOR[sim.scenarioType] ?? ''}`}>
              {sim.scenarioType.replace('_', ' ')}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={sim.status === 'complete' ? 'default' : 'secondary'} className="text-xs">
              {sim.status}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => del.mutate()}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {results && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Sprout, label: 'Yield', val: `${results.yieldTonHa} t/ha`, color: 'text-green-600' },
              { icon: Droplets, label: 'Water Use', val: `${results.waterUseMm} mm`, color: 'text-blue-600' },
              { icon: Leaf, label: 'Carbon', val: `${results.carbonKgHa} kg/ha`, color: 'text-emerald-600' },
              { icon: DollarSign, label: 'Est. Profit', val: `$${results.profitUsdHa}/ha`, color: results.profitUsdHa > 0 ? 'text-green-600' : 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="bg-muted rounded-md p-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                  <s.icon className="w-3 h-3" /> {s.label}
                </div>
                <div className={`text-sm font-semibold ${s.color}`}>{s.val}</div>
              </div>
            ))}
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={1.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {results.provenance && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[10px]">
                {results.provenance.weather === 'live-forecast' ? 'live forecast' : 'climate model'}
              </Badge>
              {results.provenance.climate === 'era5-normals' && (
                <Badge variant="secondary" className="text-[10px]">ERA5 normals</Badge>
              )}
              {results.provenance.climate === 'era5-ensemble' && (
                <Badge variant="secondary" className="text-[10px]">ERA5 ensemble</Badge>
              )}
              {results.provenance.cmip6Model && (
                <Badge variant="secondary" className="text-[10px]">CMIP6 2040s</Badge>
              )}
              <Badge variant={results.provenance.plan === 'plan-aware' ? 'default' : 'outline'} className="text-[10px]">
                {results.provenance.plan === 'plan-aware' ? 'plan-aware' : 'fallow'}
              </Badge>
            </div>
          )}
          {results.range && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Range</span>
              <Badge variant="outline" className="text-[10px] text-green-700">
                {results.range.lowYieldTonHa}–{results.range.highYieldTonHa} t/ha
              </Badge>
              <Badge variant="outline" className="text-[10px]">median {results.range.medianYieldTonHa}</Badge>
              <Badge variant="outline" className="text-[10px]">{results.range.years} seasons</Badge>
            </div>
          )}
          {results.perCrop && results.perCrop.length > 0 && (
            <div className="space-y-0.5">
              {results.perCrop.map((c) => (
                <div key={c.cropId} className="flex items-center justify-between text-xs">
                  <span className="truncate">
                    {c.name} <span className="text-muted-foreground">×{c.cells}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-green-600 font-medium">{c.yieldTonHa} t</span>
                    <span className={c.stressScore > 50 ? 'text-red-500' : 'text-muted-foreground'}>
                      stress {Math.round(c.stressScore)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground italic">{results.summary}</p>
        </CardContent>
      )}
    </Card>
  );
}

export function Simulations({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm } = useFarm(farmId);
  const { data: sims = [], isLoading } = useQuery({
    queryKey: ['simulations', farmId],
    queryFn: () => apiFetch.listSimulations(farmId),
  });
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(SCHEMA),
    defaultValues: {
      name: 'New Simulation',
      scenarioType: 'baseline',
      durationDays: 90,
      tempDeltaC: 0,
      precipMultiplier: 1,
      fertilizerBoost: 0,
    },
  });

  const create = useMutation({
    mutationFn: (v: FormValues) => apiFetch.createSimulation(farmId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['simulations', farmId] });
      toast.success('Simulation complete');
      setOpen(false);
      form.reset();
    },
    onError: () => toast.error('Error running simulation'),
  });

  const applyPreset = (p: typeof PRESETS[number]) => {
    form.setValue('scenarioType', p.type);
    form.setValue('name', p.label);
    form.setValue('tempDeltaC', p.tempDelta);
    form.setValue('precipMultiplier', p.precip);
    form.setValue('fertilizerBoost', p.fert);
  };

  const chartData = sims
    .filter((s) => s.status === 'complete' && s.results)
    .map((s) => {
      const r = JSON.parse(s.results!) as SimulationResults;
      return { name: s.name.slice(0, 12), yield: r.yieldTonHa, profit: r.profitUsdHa, water: r.waterUseMm };
    });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <PageHeader
          title="What-If Simulations"
          subtitle={`${farm?.name ?? 'Farm'} — model crop outcomes under different scenarios`}
          actions={
            <Button size="sm" onClick={() => setOpen((v) => !v)} className="gap-1.5" data-testid="btn-new-simulation">
              <Plus className="w-4 h-4" /> New Scenario
            </Button>
          }
        />
      </div>

      {open && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" /> Configure Scenario
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick presets:</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <p.icon className="w-3.5 h-3.5" /> {p.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Scenario Name</Label>
                  <Input {...form.register('name')} className="h-8 text-sm" data-testid="input-sim-name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    className="h-8 text-sm"
                    data-testid="input-duration"
                    {...form.register('durationDays', { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>Temp delta</span>
                    <span className="font-semibold text-orange-600">
                      {form.watch('tempDeltaC') > 0 ? '+' : ''}
                      {form.watch('tempDeltaC')}°C
                    </span>
                  </div>
                  <Slider
                    min={-10}
                    max={10}
                    step={0.5}
                    value={[form.watch('tempDeltaC')]}
                    onValueChange={([v]) => form.setValue('tempDeltaC', v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>Precipitation</span>
                    <span className="font-semibold text-blue-600">{Math.round(form.watch('precipMultiplier') * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={3}
                    step={0.1}
                    value={[form.watch('precipMultiplier')]}
                    onValueChange={([v]) => form.setValue('precipMultiplier', v)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>Fertilizer boost</span>
                    <span className="font-semibold text-green-600">+{form.watch('fertilizerBoost')}×</span>
                  </div>
                  <Slider
                    min={0}
                    max={5}
                    step={0.5}
                    value={[form.watch('fertilizerBoost')]}
                    onValueChange={([v]) => form.setValue('fertilizerBoost', v)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" size="sm" disabled={create.isPending} className="gap-1.5" data-testid="btn-run-simulation">
                  <FlaskConical className="w-4 h-4" /> {create.isPending ? 'Running…' : 'Run Simulation'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart className="w-4 h-4" /> Scenario Comparison — Yield (t/ha)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="yield" radius={[3, 3, 0, 0]}>
                  {chartData.map((_, i) => (
                    <RadarCell key={i} fill={`hsl(var(--chart-${(i % 5) + 1}))`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : sims.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="w-10 h-10 text-muted-foreground" />}
          title="No simulations yet"
          description="Create a scenario to model crop outcomes."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sims.map((s) => (
            <SimulationCard key={s.id} sim={s} />
          ))}
        </div>
      )}
    </div>
  );
}
