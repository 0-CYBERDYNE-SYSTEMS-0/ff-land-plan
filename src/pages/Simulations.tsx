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
import { CAMPAIGN_ENABLED, ENV_RECORDS_ENABLED, TWIN_ENABLED } from '@/lib/featureFlags';
import { archetypes, ARCHETYPE_FOR_SURFACE } from '@/creative/archetypes';
import { useFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { SCENARIOS } from '@/lib/growth';
import { isoDayNumber, isoFromDayNumber, runSummaryHasAvailableEstimates } from '@/lib/sim';
import { growingTargetKey } from '@/lib/growingTargets';
import { createTwinRunRecord } from '@/lib/sim/twin';
import type { RunRecord, RunSummary } from '@/lib/sim/types';
import type { Environment, Observation, ScenarioType, SeasonRecord, Simulation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SCENARIO_COLOR: Record<ScenarioType, string> = {
  baseline: 'text-blue-600',
  drought: 'text-orange-600',
  heat_stress: 'text-red-600',
  optimal: 'text-green-600',
  climate_change: 'text-purple-600',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const EMPTY_ENVIRONMENTS: Environment[] = [];

function dateRange(run: RunRecord): string {
  const start = run.config.startDate;
  const end = isoFromDayNumber(isoDayNumber(start) + Math.max(0, run.config.dayCount - 1));
  return `${start} → ${end}`;
}

function runWorldContext(run: RunRecord): string {
  return run.config.environment
    ? `${run.config.environment.label} · ${archetypes[run.config.environment.archetype].label}`
    : `Legacy · ${archetypes[ARCHETYPE_FOR_SURFACE[run.config.basePlan.surface ?? 'outdoor']].label}`;
}

/** Honest summary tiles — raw RunSummary numbers, no arbitrary scaling. */
function SummaryTiles({ summary }: { summary: RunSummary }) {
  const unavailable = summary.modelQualification?.status === 'unsupported';
  const tiles: { icon: typeof Sprout; label: string; val: string }[] = [
    { icon: Sprout, label: 'Yield', val: unavailable ? '—' : `${summary.totalYieldKg} kg` },
    { icon: CloudRain, label: 'Rain', val: unavailable ? '—' : `${summary.rainMm} mm` },
    { icon: Droplets, label: 'Irrigated', val: unavailable ? '—' : `${summary.irrigatedMm} mm` },
    { icon: Sun, label: 'ET0', val: unavailable ? '—' : `${summary.etoMmTotal} mm` },
    { icon: AlertTriangle, label: 'Stress', val: unavailable ? '—' : `${summary.stressCellDays} cell-days` },
    {
      icon: FlaskConical,
      label: 'Mature',
      val: unavailable ? '—' : `${summary.matureCells} / ${summary.cellCount} cells`,
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
  hasMatchingObservations,
  twinPending,
  onCreateTwin,
}: {
  run: RunRecord;
  selected: boolean;
  selectDisabled: boolean;
  onToggleSelect: () => void;
  hasMatchingObservations: boolean;
  twinPending: boolean;
  onCreateTwin: () => void;
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

  const noEstimates = run.summary.modelQualification?.status === 'unsupported';
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
                <Badge variant="outline" className="max-w-[220px] truncate text-xs" title={runWorldContext(run)}>
                  {runWorldContext(run)}
                </Badge>
                {(run.observations?.length ?? 0) > 0 && <Badge variant="secondary" className="text-xs">Twin · {run.observations!.length}</Badge>}
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
        {run.summary.modelQualification?.status === 'unsupported' && (
          <div role="status" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
            <div className="font-semibold">No crop estimates were calculated</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {run.summary.modelQualification.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
        )}
        <SummaryTiles summary={run.summary} />
        <p className="text-xs italic text-muted-foreground">
          {noEstimates
            ? `No crop estimates · seed ${run.config.seed}`
            : `First harvest-ready: ${ready} · ${run.summary.daysSimulated} days simulated · seed ${run.config.seed}`}
        </p>
        <div className={TWIN_ENABLED && run.status === 'complete' && !(run.observations?.length) ? 'grid grid-cols-2 gap-2' : ''}>
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={openInWorld}>
            <MapIcon className="h-3.5 w-3.5" /> Open in world
          </Button>
          {TWIN_ENABLED && run.status === 'complete' && !(run.observations?.length) && (
            <Button size="sm" variant="secondary" className="w-full" onClick={onCreateTwin} disabled={!hasMatchingObservations || twinPending} title={hasMatchingObservations ? 'Freeze matching measurements into a new twin run' : 'Add measurements from this world and run dates in Monitoring'}>
              {twinPending ? 'Creating…' : 'Create twin copy'}
            </Button>
          )}
        </div>
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
  const baselineAvailable = runSummaryHasAvailableEstimates(baseline.summary);
  const unavailableRuns = runs.filter((run) => !runSummaryHasAvailableEstimates(run.summary));
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
        {unavailableRuns.length > 0 && (
          <p role="status" className="mb-2 text-[10px] text-muted-foreground">
            Comparison values are unavailable for {unavailableRuns.map((run) => run.label).join(', ')}; no numeric comparison is shown for an unavailable baseline.
          </p>
        )}
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
                  {runs.map((r, i) => {
                    const unavailable = !baselineAvailable || !runSummaryHasAvailableEstimates(r.summary);
                    if (unavailable) {
                      return (
                        <td key={r.id} className="py-1.5 pr-3 text-right text-muted-foreground" title="No comparable estimate is available.">
                          —
                        </td>
                      );
                    }
                    return i === 0 ? (
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
                    );
                  })}
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
  const { data: observations = [] } = useQuery<Observation[]>({
    queryKey: ['observations', farmId],
    queryFn: () => apiFetch.listObservations(farmId),
    enabled: TWIN_ENABLED,
  });
  // Pre-engine records (read-only legacy of the old slider arithmetic).
  const { data: legacy = [] } = useQuery({
    queryKey: ['simulations', farmId],
    queryFn: () => apiFetch.listSimulations(farmId),
  });
  const { data: sitePlan, isLoading: siteLoading } = useQuery({
    queryKey: ['site-plan', farmId],
    queryFn: () => apiFetch.getSitePlan(farmId),
    enabled: ENV_RECORDS_ENABLED,
  });
  const { data: savedEnvironmentId } = useQuery({
    queryKey: ['selected-environment', farmId],
    queryFn: () => apiFetch.getSelectedEnvironmentId(farmId),
    enabled: ENV_RECORDS_ENABLED,
  });
  const { data: seasons = [] } = useQuery<SeasonRecord[]>({
    queryKey: ['seasons', farmId],
    queryFn: () => apiFetch.listSeasons(farmId),
    enabled: CAMPAIGN_ENABLED,
  });
  const environments = sitePlan?.environments ?? EMPTY_ENVIRONMENTS;
  const [runEnvironmentId, setRunEnvironmentId] = useState('');
  useEffect(() => {
    if (!ENV_RECORDS_ENABLED) return;
    if (environments.some((environment) => environment.id === runEnvironmentId)) return;
    if (savedEnvironmentId && environments.some((environment) => environment.id === savedEnvironmentId)) {
      setRunEnvironmentId(savedEnvironmentId);
      return;
    }
    if (environments.length === 1) {
      setRunEnvironmentId(environments[0]!.id);
      return;
    }
    setRunEnvironmentId('');
  }, [environments, runEnvironmentId, savedEnvironmentId]);
  const selectedEnvironment = environments.find((environment) => environment.id === runEnvironmentId) ?? null;
  const [soilCarrySeasonId, setSoilCarrySeasonId] = useState('none');
  const selectedCarrySeason = seasons.find((season) => season.id === soilCarrySeasonId) ?? null;
  const selectedCarryScopes = (selectedCarrySeason?.soil ?? []).filter((scope) => scope.environmentId === selectedEnvironment?.id);

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

  const matchingObservations = (run: RunRecord): Observation[] => {
    const runDates = new Set(run.envSeries.map((day) => day.date));
    return observations.filter((observation) => observation.farmId === run.farmId
      && (run.config.environment
        ? observation.environmentId === run.config.environment.id
        : observation.environmentId === undefined)
      && runDates.has(observation.date));
  };
  const twin = useMutation({
    mutationFn: async (parent: RunRecord) => {
      const twinRecord = createTwinRunRecord(parent, matchingObservations(parent));
      return apiFetch.saveSimRun(twinRecord);
    },
    onSuccess: (saved) => {
      qc.setQueryData<RunRecord[]>(['sim-runs', farmId], (current) =>
        [saved, ...(current ?? runs).filter((run) => run.id !== saved.id)].slice(0, 40),
      );
      toast.success('Twin run saved; the source run is unchanged');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create a twin run.'),
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
    mutationFn: () => {
      if (ENV_RECORDS_ENABLED && !selectedEnvironment) {
        throw new Error('Choose a growing world before creating a run.');
      }
      if (soilCarrySeasonId !== 'none' && selectedCarryScopes.length === 0) {
        throw new Error('The selected season has no soil carry for this growing world.');
      }
      return apiFetch.createSimRun({
        farmId,
        ...(ENV_RECORDS_ENABLED ? { environmentId: selectedEnvironment!.id } : {}),
        ...(CAMPAIGN_ENABLED && selectedCarryScopes.length > 0 ? {
          soilCarryByTarget: Object.fromEntries(selectedCarryScopes.map((scope) => [
            growingTargetKey(scope.target),
            scope.soilOut,
          ])),
        } : {}),
        label: label.trim() || undefined,
        startDate,
        dayCount,
        scenario,
        tempDeltaC,
        precipMultiplier,
        seed,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sim-runs', farmId] });
      toast.success('Run created — open it in the world to watch it play');
      setFormOpen(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create the run'),
  });

  const selectEnvironment = async (environmentId: string) => {
    setRunEnvironmentId(environmentId);
    setSoilCarrySeasonId('none');
    try {
      await apiFetch.setSelectedEnvironmentId(farmId, environmentId);
      qc.setQueryData(['selected-environment', farmId], environmentId);
    } catch {
      toast.error('The run target could not be saved. It is still selected for this run.');
    }
  };

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
          subtitle={`${farm?.name ?? 'Farm'} — deterministic runs over ${ENV_RECORDS_ENABLED ? 'a growing world' : 'this farm’s plan'}, weather and soil`}
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
            {ENV_RECORDS_ENABLED && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3">
                <Label className="text-xs">Growing world for this run</Label>
                {siteLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : environments.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Set up a growing world before creating a run.</span>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/farms/${farmId}/map`)}>
                      Set up world
                    </Button>
                  </div>
                ) : (
                  <Select value={selectedEnvironment?.id ?? ''} onValueChange={(id) => void selectEnvironment(id)}>
                    <SelectTrigger className="h-9" aria-label="Growing world for this run">
                      <SelectValue placeholder="Choose a growing world" />
                    </SelectTrigger>
                    <SelectContent>
                      {environments.map((environment) => (
                        <SelectItem key={environment.id} value={environment.id}>
                          {environment.label} · {archetypes[environment.archetype].label} ({environment.widthM} × {environment.heightM} m)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedEnvironment && (
                  <p className="text-xs text-muted-foreground">
                    This run will use {selectedEnvironment.label} ({archetypes[selectedEnvironment.archetype].label}); the run keeps this world’s frozen context if you edit or delete it later.
                  </p>
                )}
                {CAMPAIGN_ENABLED && selectedEnvironment && (
                  <div className="space-y-1.5 border-t border-border pt-2">
                    <Label className="text-xs">Soil input for this run (optional)</Label>
                    <Select value={soilCarrySeasonId} onValueChange={setSoilCarrySeasonId}>
                      <SelectTrigger className="h-9" aria-label="Campaign soil input for this run">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ordinary soil inputs</SelectItem>
                        {seasons.filter((season) => (season.soil ?? []).some((scope) => scope.environmentId === selectedEnvironment.id)).map((season) => (
                          <SelectItem key={season.id} value={season.id}>{season.label} · {season.year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedCarrySeason
                        ? `${selectedCarryScopes.length} saved soil surface(s) from this world are frozen into the run. Hydro targets and other worlds are excluded.`
                        : 'Choose a saved season to explicitly carry its matching floor and tier soil into this run. No carry is applied automatically.'}
                    </p>
                  </div>
                )}
              </div>
            )}
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
                disabled={create.isPending || (ENV_RECORDS_ENABLED && (!selectedEnvironment || siteLoading))}
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
                  <th className="py-1.5 pr-3 font-medium">Growing world</th>
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
                    <td className="max-w-[190px] truncate py-1.5 pr-3" title={runWorldContext(r)}>
                      {runWorldContext(r)}
                    </td>
                    <td className={`py-1.5 pr-3 ${SCENARIO_COLOR[r.config.scenario] ?? ''}`}>
                      {r.config.scenario.replace('_', ' ')}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.modelQualification?.status === 'unsupported' ? '—' : r.summary.daysSimulated}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.modelQualification?.status === 'unsupported' ? '—' : r.summary.totalYieldKg}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.modelQualification?.status === 'unsupported' ? '—' : r.summary.rainMm}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.modelQualification?.status === 'unsupported' ? '—' : r.summary.irrigatedMm}</td>
                    <td className="py-1.5 pr-3 text-right">{r.summary.modelQualification?.status === 'unsupported' ? '—' : r.summary.stressCellDays}</td>
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
              hasMatchingObservations={matchingObservations(r).length > 0}
              twinPending={twin.isPending && twin.variables?.id === r.id}
              onCreateTwin={() => twin.mutate(r)}
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
