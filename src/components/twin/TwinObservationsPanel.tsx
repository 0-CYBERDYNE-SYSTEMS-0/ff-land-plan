import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { environmentSnapshot } from '@/lib/environment-model';
import { guessObservationMetric, guessObservationUnit, mapObservationCsv, observationMetricLabel, observationUnits, OBSERVATION_METRICS, parseObservationCsv, type ObservationCsvMetricColumn, type ParsedObservationCsv } from '@/lib/observationCsv';
import { TWIN_ENABLED } from '@/lib/featureFlags';
import { fitFarmCalibration } from '@/lib/sim/calibration';
import type { CalibrationFitResult } from '@/lib/sim/calibration';
import { inspectRunModelSupport } from '@/lib/sim/model-inputs';
import { collectRunPredictionPairs, computeTwinScorecards } from '@/lib/sim/scorecard';
import type { RunRecord } from '@/lib/sim/types';
import type { Observation, ObservationInput, ObservationMetric, ObservationPatch, SitePlan } from '@/types';

const TODAY = () => new Date().toISOString().slice(0, 10);

const CANONICAL_UNIT: Record<ObservationMetric, string> = {
  airTempC: '°C',
  rhPct: '%',
  vpdKPa: 'kPa',
  co2Ppm: 'ppm',
  dliMol: 'mol/m²/day',
  soilMoistureFrac: 'fraction',
  soilTempC: '°C',
  yieldKg: 'kg',
  stage: 'fraction',
};

function metricRangeError(metric: ObservationMetric, value: number): string | null {
  if (!Number.isFinite(value)) return 'Enter a finite number.';
  if ((metric === 'soilMoistureFrac' || metric === 'stage') && (value < 0 || value > 1)) return 'Use a fraction from 0 to 1.';
  if (metric === 'rhPct' && (value < 0 || value > 100)) return 'Relative humidity must be from 0 to 100%.';
  if ((metric === 'vpdKPa' || metric === 'dliMol' || metric === 'yieldKg') && value < 0) return 'Enter a value of 0 or more.';
  return null;
}

function validObservationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function TwinSparkline({ pairs, metric }: { pairs: ReturnType<typeof collectRunPredictionPairs>; metric: ObservationMetric }) {
  const points = pairs.filter((pair) => pair.metric === metric && pair.predicted !== null);
  if (points.length === 0) return <p className="text-[10px] text-muted-foreground">No model predictions for this metric.</p>;
  const values = points.flatMap((point) => [point.observed, point.predicted!]);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const line = (pick: (index: number) => number) => points.map((_, index) => {
    const x = points.length === 1 ? 60 : index * 120 / (points.length - 1);
    const y = 28 - (pick(index) - min) * 24 / span;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 120 32" role="img" aria-label={`${observationMetricLabel(metric)} observed and model sparkline`} className="h-8 w-28 overflow-visible">
        <path d={line((index) => points[index]!.predicted!)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" />
        <path d={line((index) => points[index]!.observed)} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" />
      </svg>
      <span className="text-[9px] text-muted-foreground">Observed / model</span>
    </div>
  );
}

function csvMappingError(parsed: ParsedObservationCsv | null, dateColumn: number, timeColumn: number, columns: ObservationCsvMetricColumn[], farmId: number, environmentId: string): ReturnType<typeof mapObservationCsv> | null {
  if (!parsed) return null;
  const metricColumns = columns.filter((column) => column.column !== dateColumn && column.column !== timeColumn);
  try {
    return mapObservationCsv(parsed, farmId, {
      dateColumn,
      ...(timeColumn >= 0 ? { timeColumn } : {}),
      ...(environmentId && environmentId !== 'site' ? { environmentId } : {}),
      metricColumns,
    });
  } catch (error) {
    return { observations: [], errors: [error instanceof Error ? error.message : 'CSV mapping is incomplete.'], skippedValues: 0 };
  }
}

export function TwinObservationsPanel({ farmId }: { farmId: number }) {
  const queryClient = useQueryClient();
  const [entryEnvironmentId, setEntryEnvironmentId] = useState('auto');
  const [scoreEnvironmentId, setScoreEnvironmentId] = useState('');
  const [metric, setMetric] = useState<ObservationMetric>('airTempC');
  const [manualValue, setManualValue] = useState('');
  const [manualDate, setManualDate] = useState(TODAY);
  const [manualQuality, setManualQuality] = useState<'ok' | 'suspect'>('ok');
  const [editingObservationId, setEditingObservationId] = useState<string | null>(null);
  const [editMetric, setEditMetric] = useState<ObservationMetric>('airTempC');
  const [editValue, setEditValue] = useState('');
  const [editDate, setEditDate] = useState(TODAY);
  const [editEnvironmentId, setEditEnvironmentId] = useState('site');
  const [editQuality, setEditQuality] = useState<'ok' | 'suspect'>('ok');
  const [targetKey, setTargetKey] = useState('floor');
  const [parsedCsv, setParsedCsv] = useState<ParsedObservationCsv | null>(null);
  const [csvFilename, setCsvFilename] = useState('');
  const [csvDateColumn, setCsvDateColumn] = useState(0);
  const [csvTimeColumn, setCsvTimeColumn] = useState(-1);
  const [csvColumns, setCsvColumns] = useState<ObservationCsvMetricColumn[]>([]);
  const [fitResult, setFitResult] = useState<CalibrationFitResult | null>(null);

  const { data: sitePlan } = useQuery<SitePlan | null>({
    queryKey: ['site-plan', farmId],
    queryFn: () => apiFetch.getSitePlan(farmId),
    enabled: TWIN_ENABLED,
  });
  const environments = sitePlan?.environments ?? [];
  const resolvedEntryEnvironmentId = entryEnvironmentId === 'auto'
    ? environments.length === 1 ? environments[0]!.id : 'site'
    : entryEnvironmentId;
  const entryEnvironment = environments.find((environment) => environment.id === resolvedEntryEnvironmentId);
  const levels = entryEnvironment?.layout?.growingSpaces.flatMap((space) => space.levels.map((level) => ({
    key: `${space.id}::${level.id}`,
    label: `${space.label} · ${level.label}`,
  }))) ?? [];

  const { data: observations = [] } = useQuery<Observation[]>({
    queryKey: ['observations', farmId],
    queryFn: () => apiFetch.listObservations(farmId),
    enabled: TWIN_ENABLED,
  });
  const { data: runs = [] } = useQuery<RunRecord[]>({
    queryKey: ['sim-runs', farmId],
    queryFn: () => apiFetch.listSimRuns(farmId),
    enabled: TWIN_ENABLED,
  });
  const { data: calibrations = [] } = useQuery({
    queryKey: ['farm-calibrations', farmId],
    queryFn: () => apiFetch.listFarmCalibrations(farmId),
    enabled: TWIN_ENABLED,
  });

  const manualNumber = Number(manualValue);
  const manualRangeError = manualValue.trim() ? metricRangeError(metric, manualNumber) : 'Enter an observation value.';
  const editNumber = Number(editValue);
  const editRangeError = editValue.trim() ? metricRangeError(editMetric, editNumber) : 'Enter an observation value.';
  const manualTarget = targetKey !== 'floor' && entryEnvironment
    ? entryEnvironment.layout?.growingSpaces.flatMap((space) => space.levels.map((level) => ({
      growingSpaceId: space.id,
      levelId: level.id,
      key: `${space.id}::${level.id}`,
    }))).find((level) => level.key === targetKey)
    : undefined;

  const addObservation = useMutation({
    mutationFn: (input: ObservationInput) => apiFetch.addObservation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['observations', farmId] });
      setManualValue('');
      toast.success('Observation saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save observation.'),
  });
  const removeObservation = useMutation({
    mutationFn: (id: string) => apiFetch.deleteObservation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['observations', farmId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not delete observation.'),
  });
  const updateObservation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ObservationPatch }) => apiFetch.updateObservation(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['observations', farmId] });
      setEditingObservationId(null);
      toast.success('Observation updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update observation.'),
  });
  const importCsv = useMutation({
    mutationFn: async (rows: Omit<Observation, 'id'>[]) => {
      let saved = 0;
      let failed = 0;
      for (let index = 0; index < rows.length; index += 25) {
        const results = await Promise.allSettled(rows.slice(index, index + 25).map((row) => apiFetch.addObservation(row)));
        saved += results.filter((result) => result.status === 'fulfilled').length;
        failed += results.length - results.filter((result) => result.status === 'fulfilled').length;
      }
      return { saved, failed };
    },
    onSuccess: ({ saved, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['observations', farmId] });
      toast.success(`${saved} observation${saved === 1 ? '' : 's'} imported${failed ? `; ${failed} failed` : ''}`);
      if (!failed) {
        setParsedCsv(null);
        setCsvFilename('');
        setCsvColumns([]);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not import CSV observations.'),
  });
  const saveCalibration = useMutation({
    mutationFn: (calibration: NonNullable<Extract<CalibrationFitResult, { status: 'fitted' }>['proposal']>['calibration']) => apiFetch.saveFarmCalibration(calibration),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['farm-calibrations', farmId] });
      setFitResult(null);
      toast.success(`Calibration revision ${saved.revision} approved`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not approve calibration.'),
  });

  const csvResult = useMemo(
    () => csvMappingError(parsedCsv, csvDateColumn, csvTimeColumn, csvColumns, farmId, resolvedEntryEnvironmentId),
    [csvColumns, csvDateColumn, csvTimeColumn, farmId, parsedCsv, resolvedEntryEnvironmentId],
  );
  const selectedScoreEnvironmentId = scoreEnvironmentId || (environments.length === 1 ? environments[0]!.id : '');
  const selectedScoreEnvironment = environments.find((environment) => environment.id === selectedScoreEnvironmentId);
  const latestTwinRun = [...runs]
    .filter((run) => run.status === 'complete' && (run.observations?.length ?? 0) > 0
      && (selectedScoreEnvironmentId === 'legacy'
        ? !run.config.environment
        : run.config.environment?.id === selectedScoreEnvironmentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  const predictionPairs = useMemo(
    () => latestTwinRun ? collectRunPredictionPairs(latestTwinRun) : [],
    [latestTwinRun],
  );
  const hasUnavailableStageObservations = !!latestTwinRun
    && (latestTwinRun.config.cropModelVersion === 'crop-model-v3' || latestTwinRun.config.cropModelVersion === 'crop-model-v4')
    && predictionPairs.some((pair) => pair.metric === 'stage' && pair.predicted === null);
  const latestTwinSupport = latestTwinRun ? inspectRunModelSupport(latestTwinRun.config) : null;
  const hasDryMatterYieldObservations = latestTwinRun?.summary.yieldBasis === 'dry-matter'
    && latestTwinRun.observations?.some((observation) => observation.metric === 'yieldKg');
  const scoreAsOfDate = latestTwinRun?.envSeries.at(-1)?.date ?? TODAY();
  const scorecards = useMemo(
    () => computeTwinScorecards(predictionPairs, scoreAsOfDate, 30),
    [predictionPairs, scoreAsOfDate],
  );
  const largestRawMae = [...scorecards].sort((a, b) => b.mae - a.mae)[0];
  const calibrationRun = [...runs]
    .filter((run) => run.status === 'complete' && run.config.environment?.id === selectedScoreEnvironmentId && run.envSeries.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  const currentCalibration = calibrations.find((calibration) => calibration.environmentId === selectedScoreEnvironmentId);
  const applyCalibrationFit = () => {
    if (!selectedScoreEnvironment || !calibrationRun) return;
    setFitResult(fitFarmCalibration({
      farmId,
      environment: environmentSnapshot(selectedScoreEnvironment),
      envSeries: calibrationRun.envSeries,
      observations,
      existing: currentCalibration,
      equipment: calibrationRun.config.climateEquipment,
    }));
  };

  if (!TWIN_ENABLED) return null;

  return (
    <Card aria-label="Twin observations and model fit" data-testid="twin-observations-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Twin observations</CardTitle>
            <p className="mt-1 text-[10px] text-muted-foreground">Measurements are stored by world and frozen into a twin run. CSV import maps columns explicitly; no vendor cloud connection is used.</p>
          </div>
          <Badge variant="outline" className="text-[10px]">{observations.length} saved</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="space-y-2 rounded-md border border-border p-3" aria-label="Manual observation entry">
          <h3 className="text-xs font-semibold">Add a measurement</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px]">Growing world</Label>
              <Select value={resolvedEntryEnvironmentId} onValueChange={setEntryEnvironmentId}>
                <SelectTrigger className="h-8 text-xs" aria-label="Observation growing world"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="site">Farm-level / outdoor reading</SelectItem>
                  {environments.map((environment) => <SelectItem key={environment.id} value={environment.id}>{environment.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Metric</Label>
              <Select value={metric} onValueChange={(value) => setMetric(value as ObservationMetric)}>
                <SelectTrigger className="h-8 text-xs" aria-label="Observation metric"><SelectValue /></SelectTrigger>
                <SelectContent>{OBSERVATION_METRICS.map((item) => <SelectItem key={item} value={item}>{observationMetricLabel(item)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Value · {CANONICAL_UNIT[metric]}</Label>
              <Input type="number" step="any" value={manualValue} onChange={(event) => setManualValue(event.target.value)} className="h-8 text-xs" aria-label="Observation value" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Date</Label>
              <Input type="date" value={manualDate} onChange={(event) => setManualDate(event.target.value)} className="h-8 text-xs" aria-label="Observation date" />
            </div>
          </div>
          {(metric === 'soilMoistureFrac' || metric === 'soilTempC' || metric === 'yieldKg' || metric === 'stage') && levels.length > 0 && (
            <div className="max-w-sm space-y-1">
              <Label className="text-[10px]">Growing target</Label>
              <Select value={targetKey} onValueChange={setTargetKey}>
                <SelectTrigger className="h-8 text-xs" aria-label="Observation growing target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="floor">Floor</SelectItem>
                  {levels.map((level) => <SelectItem key={level.key} value={level.key}>{level.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => addObservation.mutate({
              farmId,
              ...(resolvedEntryEnvironmentId !== 'site' ? { environmentId: resolvedEntryEnvironmentId } : {}),
              ...(manualTarget ? { growingSpaceId: manualTarget.growingSpaceId, levelId: manualTarget.levelId } : {}),
              metric,
              value: manualNumber,
              unit: CANONICAL_UNIT[metric],
              date: manualDate,
              source: 'manual',
              quality: manualQuality,
            })} disabled={!!manualRangeError || addObservation.isPending || !validObservationDate(manualDate)}>
              {addObservation.isPending ? 'Saving…' : 'Save measurement'}
            </Button>
            <Select value={manualQuality} onValueChange={(value) => setManualQuality(value as 'ok' | 'suspect')}>
              <SelectTrigger className="h-8 w-32 text-xs" aria-label="Measurement quality"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ok">Quality: OK</SelectItem><SelectItem value="suspect">Quality: suspect</SelectItem></SelectContent>
            </Select>
            {manualRangeError && <span className="text-[10px] text-destructive">{manualRangeError}</span>}
          </div>
        </section>

        <section className="space-y-2 rounded-md border border-border p-3" aria-label="Wide CSV observation import">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-xs font-semibold">Import wide CSV</h3><p className="text-[10px] text-muted-foreground">Choose the date and map any number of measurement columns.</p></div>
            <Input type="file" accept=".csv,text/csv" className="h-8 max-w-[260px] text-[10px]" aria-label="Observation CSV file" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const parsed = parseObservationCsv(await file.text());
                const dateIndex = Math.max(0, parsed.headers.findIndex((header) => /date|time|timestamp/i.test(header)));
                const timeIndex = parsed.headers.findIndex((header, index) => index !== dateIndex && /^time(?:\s|$)/i.test(header.trim()));
                setCsvFilename(file.name);
                setParsedCsv(parsed);
                setCsvDateColumn(dateIndex);
                setCsvTimeColumn(timeIndex);
                setCsvColumns(parsed.headers.flatMap((header, column) => {
                  const guessed = guessObservationMetric(header);
                  if (!guessed) return [];
                  return [{ column, metric: guessed, unit: guessObservationUnit(header, guessed) }];
                }));
              } catch (error) {
                setParsedCsv(null);
                setCsvFilename(file.name);
                toast.error(error instanceof Error ? error.message : 'Could not read CSV file.');
              }
              event.target.value = '';
            }} />
          </div>
          {parsedCsv && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Date or timestamp column · {csvFilename}</Label>
                  <Select value={String(csvDateColumn)} onValueChange={(value) => {
                    const next = Number(value);
                    setCsvDateColumn(next);
                    if (next === csvTimeColumn) setCsvTimeColumn(-1);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{parsedCsv.headers.map((header, index) => <SelectItem key={`${index}:${header}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Separate time column (optional)</Label>
                  <Select value={String(csvTimeColumn)} onValueChange={(value) => {
                    const next = Number(value);
                    setCsvTimeColumn(next === csvDateColumn ? -1 : next);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">No separate time column</SelectItem>
                      {parsedCsv.headers.map((header, index) => <SelectItem key={`${index}:${header}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Associate readings with</Label>
                  <Select value={resolvedEntryEnvironmentId} onValueChange={setEntryEnvironmentId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="site">Farm-level / outdoor reading</SelectItem>
                      {environments.map((environment) => <SelectItem key={environment.id} value={environment.id}>{environment.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-border p-2">
                {parsedCsv.headers.map((header, column) => {
                  if (column === csvDateColumn || column === csvTimeColumn) return <div key={column} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate">{header}</span><Badge variant="secondary" className="text-[9px]">{column === csvDateColumn ? 'Date' : 'Time'}</Badge></div>;
                  const mapping = csvColumns.find((item) => item.column === column);
                  return (
                    <div key={column} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px] items-center gap-1.5">
                      <span className="truncate text-[10px]" title={header}>{header || `Column ${column + 1}`}</span>
                      <Select value={mapping?.metric ?? 'skip'} onValueChange={(value) => {
                        setCsvColumns((current) => [
                          ...current.filter((item) => item.column !== column),
                          ...(value === 'skip' ? [] : [{
                            column,
                            metric: value as ObservationMetric,
                            unit: guessObservationUnit(header, value as ObservationMetric),
                          }]),
                        ].sort((a, b) => a.column - b.column));
                      }}>
                        <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Skip column</SelectItem>
                          {OBSERVATION_METRICS.map((item) => <SelectItem key={item} value={item}>{observationMetricLabel(item)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {mapping ? (
                        <Select value={mapping.unit} onValueChange={(unit) => setCsvColumns((current) => current.map((item) => item.column === column ? { ...item, unit } : item))}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{observationUnits(mapping.metric).map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <span className="text-[9px] text-muted-foreground">—</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] text-muted-foreground">
                  {csvResult ? `${csvResult.observations.length} values · ${csvResult.skippedValues} blank` : 'Choose a measurement column.'}
                  {csvResult?.errors.length ? <span className="ml-1 text-destructive">· {csvResult.errors.length} issue(s): {csvResult.errors.slice(0, 2).join(' ')}</span> : null}
                </div>
                <Button size="sm" onClick={() => csvResult && importCsv.mutate(csvResult.observations)} disabled={!csvResult || csvResult.errors.length > 0 || csvResult.observations.length === 0 || importCsv.isPending}>
                  {importCsv.isPending ? 'Importing…' : 'Import observations'}
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="space-y-2" aria-label="Twin scorecard">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h3 className="text-xs font-semibold">Model vs. observations</h3><p className="text-[10px] text-muted-foreground">Predictions are replayed from the latest saved twin run.</p></div>
            <Select value={selectedScoreEnvironmentId || 'none'} onValueChange={setScoreEnvironmentId}>
              <SelectTrigger className="h-8 w-56 text-xs" aria-label="Scorecard growing world"><SelectValue placeholder="Choose a world" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a growing world</SelectItem>
                {environments.map((environment) => <SelectItem key={environment.id} value={environment.id}>{environment.label}</SelectItem>)}
                {runs.some((run) => !run.config.environment && (run.observations?.length ?? 0) > 0) && <SelectItem value="legacy">Farm-level / legacy run</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {latestTwinRun ? (
            <div className="space-y-2 rounded-md border border-border p-2">
              <p className="text-[10px] text-muted-foreground">{latestTwinRun.label} · last 30 days through {scoreAsOfDate}</p>
              {hasDryMatterYieldObservations && <p className="text-[10px] text-muted-foreground">Yield observations use fresh mass; this run reports dry matter, so those values are not scored together.</p>}
              {hasUnavailableStageObservations && <p className="text-[10px] text-muted-foreground">Stage observations are saved but not assimilated or scored because this model has no source-supported intermediate-stage mapping; its biomass field marks only the source maturity endpoint.</p>}
              {scorecards.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  {latestTwinSupport && !latestTwinSupport.canReplay
                    ? `No predictions were scored: ${latestTwinSupport.reasons.join(' ')}`
                    : 'No paired metrics in this run have model predictions yet.'}
                </p>
              ) : (
                <>
                  {scorecards.map((score) => {
                    const metricPairs = predictionPairs.filter((pair) => pair.metric === score.metric && pair.predicted !== null);
                    const unit = CANONICAL_UNIT[score.metric];
                    return (
                      <div key={score.metric} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="text-[10px] font-medium">{observationMetricLabel(score.metric)} <span className="font-normal text-muted-foreground">· {score.n} pairs · MAE {score.mae.toFixed(2)} {unit} · bias {score.bias > 0 ? '+' : ''}{score.bias.toFixed(2)} {unit}</span></p>
                          <TwinSparkline pairs={metricPairs} metric={score.metric} />
                        </div>
                      </div>
                    );
                  })}
                  {largestRawMae && <p className="text-[9px] text-muted-foreground">Largest raw MAE: {observationMetricLabel(largestRawMae.metric)}. MAE uses native units, so compare within each metric.</p>}
                </>
              )}
            </div>
          ) : <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] text-muted-foreground">Create a twin copy from a completed run with matching observations to see the scorecard.</p>}
        </section>

        <section className="space-y-2 rounded-md border border-border p-3" aria-label="Environment calibration">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-xs font-semibold">Environment calibration</h3><p className="text-[10px] text-muted-foreground">Bounded fit of cover transmission and U value; approval applies the version to later runs.</p></div>
            <Button size="sm" variant="outline" onClick={applyCalibrationFit} disabled={!selectedScoreEnvironment || !calibrationRun}>Fit proposal</Button>
          </div>
          {currentCalibration && <p className="text-[10px] text-muted-foreground">Approved revision {currentCalibration.revision} · fitted {currentCalibration.fittedAt.slice(0, 10)} · {currentCalibration.pairedDays} paired days</p>}
          {!selectedScoreEnvironment && <p className="text-[10px] text-muted-foreground">Choose a growing world above to fit its calibration.</p>}
          {!calibrationRun && selectedScoreEnvironment && <p className="text-[10px] text-muted-foreground">A completed run with frozen outdoor days is required for calibration.</p>}
          {fitResult?.status === 'insufficient-data' && <p className="text-[10px] text-muted-foreground">{fitResult.pairedDays} paired days; at least {fitResult.minimumPairedDays} are required.</p>}
          {fitResult?.status === 'not-identifiable' && <p className="text-[10px] text-muted-foreground">{fitResult.reason}</p>}
          {fitResult?.status === 'fitted' && (
            <div className="space-y-2 rounded bg-muted/40 p-2">
              <p className="text-[10px]">Proposal from {fitResult.pairedDays} paired days · revision {fitResult.proposal.calibration.revision}</p>
              {fitResult.proposal.changes.length > 0 ? fitResult.proposal.changes.map((change) => (
                <p key={change.parameter} className="text-[10px] font-medium">
                  {change.parameter === 'coverTransmission' ? 'Cover transmission' : 'U value'}: {change.from.toFixed(2)} → {change.to.toFixed(2)}
                </p>
              )) : <p className="text-[10px] text-muted-foreground">The fitted values match the archetype defaults; there is no change to approve.</p>}
              <Button size="sm" onClick={() => saveCalibration.mutate(fitResult.proposal.calibration)} disabled={fitResult.proposal.changes.length === 0 || saveCalibration.isPending}>
                {saveCalibration.isPending ? 'Saving…' : 'Approve calibration'}
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-1" aria-label="Recent saved observations">
          <h3 className="text-xs font-semibold">Recent measurements</h3>
          {observations.length === 0 ? <p className="text-[10px] text-muted-foreground">No measurements saved.</p> : observations.slice(-8).reverse().map((observation) => (
            editingObservationId === observation.id ? (
              <div key={observation.id} className="space-y-2 rounded border border-border/60 p-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Metric</Label>
                    <Select value={editMetric} onValueChange={(value) => setEditMetric(value as ObservationMetric)}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Edit observation metric"><SelectValue /></SelectTrigger>
                      <SelectContent>{OBSERVATION_METRICS.map((item) => <SelectItem key={item} value={item}>{observationMetricLabel(item)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Value · {CANONICAL_UNIT[editMetric]}</Label>
                    <Input type="number" step="any" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="h-8 text-xs" aria-label="Edit observation value" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Date</Label>
                    <Input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className="h-8 text-xs" aria-label="Edit observation date" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Growing world</Label>
                    <Select value={editEnvironmentId} onValueChange={setEditEnvironmentId}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Edit observation growing world"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site">Farm-level / outdoor reading</SelectItem>
                        {observation.environmentId && !environments.some((environment) => environment.id === observation.environmentId) && <SelectItem value={observation.environmentId}>Saved world ({observation.environmentId})</SelectItem>}
                        {environments.map((environment) => <SelectItem key={environment.id} value={environment.id}>{environment.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => updateObservation.mutate({
                    id: observation.id,
                    patch: {
                      metric: editMetric,
                      value: editNumber,
                      unit: CANONICAL_UNIT[editMetric],
                      date: editDate,
                      environmentId: editEnvironmentId === 'site' ? null : editEnvironmentId,
                      quality: editQuality,
                    },
                  })} disabled={!!editRangeError || !validObservationDate(editDate) || updateObservation.isPending}>
                    {updateObservation.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Select value={editQuality} onValueChange={(value) => setEditQuality(value as 'ok' | 'suspect')}>
                    <SelectTrigger className="h-8 w-32 text-xs" aria-label="Edit measurement quality"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ok">Quality: OK</SelectItem><SelectItem value="suspect">Quality: suspect</SelectItem></SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setEditingObservationId(null)}>Cancel</Button>
                  {editRangeError && <span className="text-[10px] text-destructive">{editRangeError}</span>}
                  {!validObservationDate(editDate) && <span className="text-[10px] text-destructive">Enter a valid calendar date.</span>}
                </div>
              </div>
            ) : (
              <div key={observation.id} className="flex items-center gap-2 border-b border-border/50 py-1 text-[10px]">
                <span className="min-w-0 flex-1 truncate">{observation.date} · {observation.environmentId ?? 'Farm-level'} · {observationMetricLabel(observation.metric)} {observation.value} {observation.unit}</span>
                {observation.quality === 'suspect' && <Badge variant="secondary" className="text-[8px]">suspect</Badge>}
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => {
                  setEditingObservationId(observation.id);
                  setEditMetric(observation.metric);
                  setEditValue(String(observation.value));
                  setEditDate(observation.date);
                  setEditEnvironmentId(observation.environmentId ?? 'site');
                  setEditQuality(observation.quality ?? 'ok');
                }}>Edit</Button>
                <Button size="icon" variant="ghost" aria-label={`Delete observation ${observation.id}`} className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeObservation.mutate(observation.id)} disabled={removeObservation.isPending}>×</Button>
              </div>
            )
          ))}
        </section>
      </CardContent>
    </Card>
  );
}
