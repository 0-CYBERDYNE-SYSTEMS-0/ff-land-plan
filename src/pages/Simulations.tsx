import { useEffect, useMemo, useState } from 'react';
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

function RunCard({
  run,
  selected,
  selectDisabled,
  onToggleSelect,
}: {
  run: RunRecord;
  selected: boolean;
  selectDisabled: boolean;
  onToggleSelect: () => void;
}) {
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
    window.location.href = openInWorldUrl(run);
  };

  const ready =
    run.summary.harvestReadyDay !== null
      ? `day ${run.summary.harvestReadyDay}`
      : 'never';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              disabled={!selected && selectDisabled}
              aria-label={`Select ${run.label} for comparison`}
              title={
                selectDisabled && !selected
                  ? 'Up to 6 runs can be compared'
                  : 'Select for the comparison panel'
              }
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
            />
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

/** Max runs in one comparison (checkboxes disable past this). */
const MAX_COMPARE = 6;

function openInWorldUrl(run: RunRecord): string {
  // Query params BEFORE the hash (wouter hash routing — see HANDOFF trap 9).
  return `/?ffrun=${encodeURIComponent(run.id)}#/farms/${run.farmId}/map`;
}

/** A/B launch: primary = first selected, ghost = second (Phase 4). */
function compareABUrl(a: RunRecord, b: RunRecord): string {
  return `/?ffrun=${encodeURIComponent(a.id)}&ffghost=${encodeURIComponent(b.id)}#/farms/${a.farmId}/map`;
}

/** Comparison metrics — raw RunSummary fields with honest units, each run's
 * delta vs the FIRST selected (baseline) run. No invented normalization; the
 * delta color direction is documented per metric (yield: more is better;
 * water/stress/outbreak: less is better; residual N: neutral). */
const COMPARE_METRICS: {
  key: string;
  label: string;
  unit: string;
  get: (s: RunSummary) => number;
  better: 'higher' | 'lower' | 'neutral';
  digits: number;
}[] = [
  { key: 'yield', label: 'Yield', unit: 'kg', get: (s) => s.totalYieldKg, better: 'higher', digits: 2 },
  { key: 'water', label: 'Water use', unit: 'mm', get: (s) => s.waterUseMm, better: 'lower', digits: 1 },
  {
    key: 'stress',
    label: 'Stress cell-days',
    unit: 'cell-days',
    // Same aggregation as the run card (max-of-4 per cell-day). Summing the
    // four counters double-counts multi-stress cell-days and disagreed with
    // the card (audit OPS-007: 15534 vs 16140).
    get: (s) => s.stressCellDays,
    better: 'lower',
    digits: 0,
  },
  { key: 'outbreak', label: 'Outbreak cell-days', unit: 'pest ≥ 0.6', get: (s) => s.outbreakDays, better: 'lower', digits: 0 },
  { key: 'nitrogen', label: 'Residual nitrogen', unit: 'kg/ha N', get: (s) => s.meanNitrogenKgHa, better: 'neutral', digits: 1 },
];

function MetricCell({ value, baseline, better, digits }: {
  value: number;
  baseline: number;
  better: 'higher' | 'lower' | 'neutral';
  digits: number;
}) {
  const d = value - baseline;
  const isBetter = better === 'higher' ? d > 0 : better === 'lower' ? d < 0 : false;
  const isWorse = better === 'higher' ? d < 0 : better === 'lower' ? d > 0 : false;
  return (
    <td className="py-1.5 pr-3 text-right whitespace-nowrap">
      <span className="tabular-nums">{value.toFixed(digits)}</span>
      {Math.abs(d) > 1e-9 && (
        <span className={`ml-1 tabular-nums ${isBetter ? 'text-green-600' : isWorse ? 'text-red-600' : 'text-muted-foreground'}`}>
          {d > 0 ? '+' : '−'}
          {Math.abs(d).toFixed(digits)}
        </span>
      )}
    </td>
  );
}

function ComparePanel({ runs }: { runs: RunRecord[] }) {
  const baseline = runs[0]!;
  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="compare-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Comparing {runs.length} runs — deltas vs {baseline.label}
          </CardTitle>
          {runs.length >= 2 && (
            <Button
              size="sm"
              className="gap-1.5"
              title="Open the world with the first selected run solid and the second as a ghost overlay"
              onClick={() => {
                window.location.href = compareABUrl(baseline, runs[1]!);
              }}
            >
              <MapIcon className="h-3.5 w-3.5" /> Compare A/B in world
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Primary = first selected ({baseline.label}), ghost = second ({runs[1]?.label ?? '—'})
          {runs.length > 2 ? `; the other ${runs.length - 2} stay in this table only` : ''}.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 font-medium">Metric</th>
              {runs.map((r, i) => (
                <th key={r.id} className="py-1.5 pr-3 font-medium text-right">
                  <span className="block max-w-[160px] truncate" title={r.label}>
                    {i === 0 && <span className="mr-1 rounded bg-primary/15 px-1 text-[10px] uppercase text-primary">base</span>}
                    {r.label}
                  </span>
                  <a
                    href={openInWorldUrl(r)}
                    className="text-[10px] font-normal text-primary hover:underline"
                  >
                    Open in world
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {COMPARE_METRICS.map((m) => {
              const baseVal = m.get(baseline.summary);
              return (
                <tr key={m.key} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-3" title={m.unit || undefined}>
                    {m.label}
                    {m.unit && <span className="ml-1 text-[10px] text-muted-foreground">{m.unit}</span>}
                  </td>
                  {runs.map((r, i) =>
                    i === 0 ? (
                      <td key={r.id} className="py-1.5 pr-3 text-right tabular-nums">
                        {baseVal.toFixed(m.digits)}
                      </td>
                    ) : (
                      <MetricCell
                        key={r.id}
                        value={m.get(r.summary)}
                        baseline={baseVal}
                        better={m.better}
                        digits={m.digits}
                      />
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          Deltas are colored by direction, not judgment: green = better (more yield; less water, stress or
          outbreak), red = worse, gray = neutral (residual nitrogen has no inherent good direction).
          Stress cell-days = one cell under stress for one day, summed over the four stress terms.
        </p>
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

  // Multi-select comparison (Phase 4): selection ORDER matters — the first
  // selected run is the baseline, the second becomes the A/B ghost. Capped at
  // MAX_COMPARE; pruned when runs disappear (delete). The prune must return
  // the SAME array when nothing changed: `runs` defaults to a fresh [] each
  // render while the query loads, so an unconditional setState here would
  // re-render (and re-fire) forever.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    setSelectedIds((ids) => {
      const next = ids.filter((id) => runs.some((r) => r.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [runs]);
  const selectedRuns = useMemo(
    () => selectedIds.map((id) => runs.find((r) => r.id === id)).filter((r) => r !== undefined),
    [selectedIds, runs],
  );
  const toggleSelect = (id: string) => {
    setSelectedIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= MAX_COMPARE) return ids; // cap: no silent replacement
      return [...ids, id];
    });
  };

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

      {selectedRuns.length >= 2 && <ComparePanel runs={selectedRuns} />}
      {selectedRuns.length === 1 && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          1 run selected — pick {Math.min(MAX_COMPARE, Math.max(runs.length - 1, 1)) > 1 ? 'one or more' : 'another'}{' '}
          run{selectedRuns.length === 1 && runs.length > 2 ? 's' : ''} to compare (up to {MAX_COMPARE}; the first
          selected is the baseline, the second opens as the A/B ghost in the world).
        </p>
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
            <RunCard
              key={r.id}
              run={r}
              selected={selectedIds.includes(r.id)}
              selectDisabled={selectedIds.length >= MAX_COMPARE}
              onToggleSelect={() => toggleSelect(r.id)}
            />
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
