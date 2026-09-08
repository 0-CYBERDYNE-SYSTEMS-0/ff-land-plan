import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Sprout,
  CloudRain,
  Droplets,
  Sun,
  Trash2,
  Map as MapIcon,
  AlertTriangle,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { SCENARIOS } from '@/lib/growth';
import { isoDayNumber, isoFromDayNumber } from '@/lib/sim';
import type { RunRecord, RunSummary } from '@/lib/sim/types';
import type { ScenarioType, Simulation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';

const SCENARIO_COLOR: Record<ScenarioType, string> = {
  baseline: 'text-blue-600',
  drought: 'text-orange-600',
  heat_stress: 'text-red-600',
  optimal: 'text-green-600',
  climate_change: 'text-purple-600',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function dateRange(run: RunRecord): string {
  const start = run.config.startDate;
  const end = isoFromDayNumber(isoDayNumber(start) + Math.max(0, run.config.dayCount - 1));
  return `${start} → ${end}`;
}

/** Honest summary tiles — raw RunSummary numbers, no arbitrary scaling. */
function SummaryTiles({ summary }: { summary: RunSummary }) {
  const tiles: { icon: typeof Sprout; label: string; val: string }[] = [
    { icon: Sprout, label: 'Yield', val: `${summary.totalYieldKg} kg` },
    { icon: CloudRain, label: 'Rain', val: `${summary.rainMm} mm` },
    { icon: Droplets, label: 'Irrigated', val: `${summary.irrigatedMm} mm` },
    { icon: Sun, label: 'ET0', val: `${summary.etoMmTotal} mm` },
    { icon: AlertTriangle, label: 'Stress', val: `${summary.stressCellDays} cell-days` },
    {
      icon: FlaskConical,
      label: 'Mature',
      val: `${summary.matureCells} / ${summary.cellCount} cells`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-md bg-muted p-2">
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <t.icon className="h-3 w-3" /> {t.label}
          </div>
          <div className="text-sm font-semibold tabular-nums">{t.val}</div>
        </div>
      ))}
    </div>
  );
}

function RunCard({ run }: { run: RunRecord }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const del = useMutation({
    mutationFn: () => apiFetch.deleteSimRun(run.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sim-runs', run.farmId] });
      toast.success('Run deleted');
    },
  });

  const openInWorld = () => {
    // Query param BEFORE the hash (wouter hash routing — see HANDOFF trap 9).
    window.location.href = `/?ffrun=${encodeURIComponent(run.id)}#/farms/${run.farmId}/map`;
  };

  const ready =
    run.summary.harvestReadyDay !== null
      ? `day ${run.summary.harvestReadyDay}`
      : 'never';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm" title={run.label}>
              {run.label}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`text-xs ${SCENARIO_COLOR[run.config.scenario] ?? ''}`}>
                {run.config.scenario.replace('_', ' ')}
              </Badge>
              <span className="text-xs tabular-nums text-muted-foreground">{dateRange(run)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={run.status === 'complete' ? 'default' : 'secondary'} className="text-xs">
              {run.status}
            </Badge>
            {confirming ? (
              <span className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => del.mutate()}
                  disabled={del.isPending}
                >
                  {del.isPending ? '…' : 'Confirm'}
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirming(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:text-destructive"
                aria-label={`Delete run ${run.label}`}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <SummaryTiles summary={run.summary} />
        <p className="text-xs italic text-muted-foreground">
          First harvest-ready: {ready} · {run.summary.daysSimulated} days simulated · seed {run.config.seed}
        </p>
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={openInWorld}>
          <MapIcon className="h-3.5 w-3.5" /> Open in world
        </Button>
      </CardContent>
    </Card>
  );
}

function LegacySimulationRow({ sim }: { sim: Simulation }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => apiFetch.deleteSimulation(sim.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulations', sim.farmId] }),
  });
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{sim.name}</span>
      <span className="shrink-0 text-muted-foreground/70">{sim.scenarioType.replace('_', ' ')}</span>
      <span className="shrink-0 text-muted-foreground/70 tabular-nums">{sim.durationDays}d</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 hover:text-destructive"
        aria-label={`Delete legacy simulation ${sim.name}`}
        onClick={() => del.mutate()}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function Simulations({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm } = useFarm(farmId);
  const qc = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['sim-runs', farmId],
    queryFn: () => apiFetch.listSimRuns(farmId),
  });
  // Pre-engine records (read-only legacy of the old slider arithmetic).
  const { data: legacy = [] } = useQuery({
    queryKey: ['simulations', farmId],
    queryFn: () => apiFetch.listSimulations(farmId),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState(todayISO);
  const [dayCount, setDayCount] = useState(90);
  const [scenario, setScenario] = useState<ScenarioType>('baseline');
  const [tempDeltaC, setTempDeltaC] = useState(0);
  const [precipMultiplier, setPrecipMultiplier] = useState(1);
  const [seed, setSeed] = useState(1);

  const create = useMutation({
    mutationFn: () =>
      apiFetch.createSimRun({
        farmId,
        label: label.trim() || undefined,
        startDate,
        dayCount,
        scenario,
        tempDeltaC,
        precipMultiplier,
        seed,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sim-runs', farmId] });
      toast.success('Run created — open it in the world to watch it play');
      setFormOpen(false);
    },
    onError: () => toast.error('Could not create the run'),
  });

  const applyPreset = (s: ScenarioType) => {
    const p = SCENARIOS[s];
    setScenario(s);
    setTempDeltaC(p.tempDeltaC);
    setPrecipMultiplier(p.precipMultiplier);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title="Simulation Runs"
          subtitle={`${farm?.name ?? 'Farm'} — deterministic runs over this farm's plan, weather and soil`}
          actions={
            <Button size="sm" onClick={() => setFormOpen((v) => !v)} className="gap-1.5" data-testid="btn-new-simulation">
              <Plus className="h-4 w-4" /> New Run
            </Button>
          }
        />
      </div>

      {formOpen && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" /> Configure Run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Scenario presets:</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SCENARIOS) as ScenarioType[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => applyPreset(s)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:bg-primary/5 ${
                      scenario === s ? 'border-primary bg-primary/10 font-medium' : 'border-border'
                    }`}
                  >
                    {SCENARIOS[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`${SCENARIOS[scenario].label} · ${dayCount}d`}
                  className="h-8 text-sm"
                  data-testid="input-sim-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Days (60–365)</Label>
                <Input
                  type="number"
                  min={60}
                  max={365}
                  value={dayCount}
                  onChange={(e) => setDayCount(Math.min(365, Math.max(60, Number(e.target.value) || 60)))}
                  className="h-8 text-sm"
                  data-testid="input-duration"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Seed</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={seed}
                  onChange={(e) => setSeed(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>Temp delta</span>
                  <span className="font-semibold text-orange-600">
                    {tempDeltaC > 0 ? '+' : ''}
                    {tempDeltaC}°C
                  </span>
                </div>
                <Slider min={-10} max={10} step={0.5} value={[tempDeltaC]} onValueChange={([v]) => setTempDeltaC(v)} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>Precipitation</span>
                  <span className="font-semibold text-blue-600">{Math.round(precipMultiplier * 100)}%</span>
                </div>
                <Slider min={0} max={3} step={0.1} value={[precipMultiplier]} onValueChange={([v]) => setPrecipMultiplier(v)} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                size="sm"
                disabled={create.isPending}
                className="gap-1.5"
                data-testid="btn-run-simulation"
                onClick={() => create.mutate()}
              >
                <FlaskConical className="h-4 w-4" /> {create.isPending ? 'Running…' : 'Create Run'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The run forks the current plan and freezes a daily environment series (real archive weather →
              ERA5 normals → documented fallbacks), then replays it day by day in the world.
            </p>
          </CardContent>
        </Card>
      )}

      {runs.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Run Comparison</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Run</th>
                  <th className="py-1.5 pr-3 font-medium">Scenario</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Days</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Yield (kg)</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rain (mm)</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Irrigated (mm)</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Stress (cell-days)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[180px] truncate py-1.5 pr-3" title={r.label}>
                      {r.label}
                    </td>
                    <td className={`py-1.5 pr-3 ${SCENARIO_COLOR[r.config.scenario] ?? ''}`}>
                      {r.config.scenario.replace('_', ' ')}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.daysSimulated}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.totalYieldKg}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.rainMm}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.irrigatedMm}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.stressCellDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-10 w-10 text-muted-foreground" />}
          title="No runs yet"
          description="Create a run to simulate this farm's season, then open it in the world."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}

      {legacy.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Legacy what-if simulations (read-only estimates)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {legacy.map((s) => (
              <LegacySimulationRow key={s.id} sim={s} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
