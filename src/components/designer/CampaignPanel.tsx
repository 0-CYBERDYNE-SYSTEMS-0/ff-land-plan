import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { archetypes } from '@/creative/archetypes';
import { campaignScopeKey } from '@/lib/campaign';
import { CAMPAIGN_ENABLED } from '@/lib/featureFlags';
import { growingTargetKey } from '@/lib/growingTargets';
import { yieldMassUnit } from '@/lib/sim';
import type { RunRecord } from '@/lib/sim/types';
import type { GrowingTargetRef, SeasonHarvest, SeasonRecord, SeasonSoilCarry } from '@/types';

export interface CampaignCloseInput {
  year: number;
  label: string;
  startDate: string;
  endDate: string;
  runIds: string[];
  compostAppsByScope: Record<string, number>;
}

export interface CampaignPreview {
  harvests: SeasonHarvest[];
  soil: SeasonSoilCarry[];
  runIds: string[];
  environmentIds: string[];
}

export interface CampaignScopeOption {
  key: string;
  label: string;
  environmentId: string;
  target: GrowingTargetRef;
}

export interface CampaignRotationHint {
  message: string;
  warning: boolean;
}

function runDates(run: RunRecord): string {
  return `${run.config.startDate} · ${run.config.dayCount} days`;
}

function seasonOm(season: SeasonRecord): string {
  const values = (season.soil ?? []).map((entry) => entry.soilOut.organicMatterPct);
  if (values.length === 0) return 'OM unavailable';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `OM ${min.toFixed(2)}%` : `OM ${min.toFixed(2)}–${max.toFixed(2)}%`;
}

function seasonYield(season: SeasonRecord): number {
  return season.harvests.reduce((total, harvest) => total + harvest.kg, 0);
}

function scopesInRuns(runs: RunRecord[]): CampaignScopeOption[] {
  const scopes = new Map<string, CampaignScopeOption>();
  for (const run of runs.filter((item) => item.status === 'complete')) {
    const environment = run.config.environment;
    if (!environment) continue;
    const targets = new Map<string, GrowingTargetRef>();
    if (Object.keys(run.config.basePlan.planting ?? {}).length > 0 || run.config.soilCarryByTarget?.floor) {
      targets.set('floor', { kind: 'floor' });
    }
    for (const plan of Object.values(run.config.basePlan.targets ?? {})) {
      const target = { kind: 'growing-level' as const, growingSpaceId: plan.growingSpaceId, levelId: plan.levelId };
      const space = environment.layout?.growingSpaces.find((entry) => entry.id === plan.growingSpaceId);
      if (space?.kind === 'hydro') continue;
      targets.set(growingTargetKey(target), target);
    }
    for (const intervention of run.config.interventions) {
      if (intervention.kind !== 'plant') continue;
      const target = intervention.target ?? { kind: 'floor' as const };
      if (target.kind === 'growing-level' && environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId)?.kind === 'hydro') continue;
      targets.set(growingTargetKey(target), target);
    }
    for (const target of targets.values()) {
      const key = campaignScopeKey(environment.id, target);
      const space = target.kind === 'growing-level'
        ? environment.layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId)
        : undefined;
      const level = target.kind === 'growing-level'
        ? space?.levels.find((entry) => entry.id === target.levelId)
        : undefined;
      scopes.set(key, {
        key,
        environmentId: environment.id,
        target,
        label: `${environment.label} · ${archetypes[environment.archetype].label} · ${target.kind === 'floor' ? 'Floor' : `${space?.label ?? 'Growing space'} · ${level?.label ?? 'Level'}`}`,
      });
    }
  }
  return [...scopes.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function CampaignPanel({
  enabled = CAMPAIGN_ENABLED,
  runs,
  seasons,
  rotationHint,
  rotationWarnings = {},
  onPreview,
  onSaveSeason,
  onStartNextPlan,
}: {
  enabled?: boolean;
  runs: RunRecord[];
  seasons: SeasonRecord[];
  rotationHint?: CampaignRotationHint | null;
  rotationWarnings?: Record<string, number>;
  onPreview: (input: CampaignCloseInput) => Promise<CampaignPreview>;
  onSaveSeason: (input: CampaignCloseInput, preview: CampaignPreview) => Promise<SeasonRecord>;
  onStartNextPlan: (season: SeasonRecord) => Promise<void>;
}) {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [label, setLabel] = useState(`${new Date().getFullYear()} season`);
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [compostApps, setCompostApps] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [previewInput, setPreviewInput] = useState<CampaignCloseInput | null>(null);
  const [savedSeason, setSavedSeason] = useState<SeasonRecord | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startingNext, setStartingNext] = useState(false);
  const previewRequestRef = useRef(0);
  const previewPendingRef = useRef(false);

  const orderedSeasons = useMemo(
    () => [...seasons].sort((a, b) => a.year - b.year || a.label.localeCompare(b.label)),
    [seasons],
  );
  const selectedSeason = orderedSeasons.find((season) => season.id === selectedSeasonId) ?? null;
  const selectedRuns = runs.filter((run) => selectedRunIds.includes(run.id));
  const scopeOptions = scopesInRuns(selectedRuns);
  const existingSeasonForYear = orderedSeasons.find((season) => season.year === year) ?? null;
  const unavailableRunIds = new Set(orderedSeasons
    .filter((season) => season.id !== existingSeasonForYear?.id)
    .flatMap((season) => season.runIds));
  const selectableRuns = runs.filter((run) => !unavailableRunIds.has(run.id));
  const editableHarvests = preview?.harvests ?? [];

  if (!enabled) return null;

  const invalidatePreview = () => {
    previewRequestRef.current += 1;
    if (previewPendingRef.current) {
      previewPendingRef.current = false;
      setBusy(false);
    }
    setPreview(null);
    setPreviewInput(null);
  };

  const toggleRun = (id: string) => {
    setSelectedRunIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    invalidatePreview();
    setSavedSeason(null);
  };

  const inputForPreview = (): CampaignCloseInput => ({
    year,
    label: label.trim() || `${year} season`,
    startDate,
    endDate,
    runIds: selectedRunIds,
    compostAppsByScope: Object.fromEntries(scopeOptions.map((scope) => [scope.key, compostApps[scope.key] ?? 0])),
  });

  const createPreview = async () => {
    if (selectedRunIds.length === 0) {
      toast.error('Select at least one completed run to close a season.');
      return;
    }
    if (startDate > endDate) {
      toast.error('The season end date must be on or after its start date.');
      return;
    }
    if (!/^\d{4}$/.test(yearInput) || Number(yearInput) < 1900 || Number(yearInput) > 2200) {
      toast.error('Enter a calendar year from 1900 to 2200.');
      return;
    }
    if (startDate.slice(0, 4) !== String(year) || endDate.slice(0, 4) !== String(year)) {
      toast.error('The season dates must fall within its selected calendar year.');
      return;
    }
    const requestId = ++previewRequestRef.current;
    previewPendingRef.current = true;
    setBusy(true);
    try {
      const input = inputForPreview();
      const result = await onPreview(input);
      if (requestId !== previewRequestRef.current) return;
      if (result.runIds.length === 0) {
        toast.error('This selection has no completed runs to close.');
        setPreview(null);
        setPreviewInput(null);
        return;
      }
      setPreviewInput(input);
      setPreview(result);
      setSavedSeason(null);
    } catch (error) {
      if (requestId === previewRequestRef.current) {
        toast.error(error instanceof Error ? error.message : 'Could not preview this season.');
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        previewPendingRef.current = false;
        setBusy(false);
      }
    }
  };

  const saveSeason = async () => {
    if (!preview || !previewInput) return;
    if (yearInput !== String(year) || JSON.stringify(inputForPreview()) !== JSON.stringify(previewInput)) {
      invalidatePreview();
      toast.error('Season details changed. Prepare a new preview before saving.');
      return;
    }
    if (existingSeasonForYear && !replaceExisting) {
      toast.error(`Confirm replacement of the existing ${year} season first.`);
      return;
    }
    setBusy(true);
    try {
      const saved = await onSaveSeason(previewInput, preview);
      setSavedSeason(saved);
      setSelectedSeasonId(saved.id);
      setPreview(null);
      setPreviewInput(null);
      setFormOpen(false);
      toast.success(`${saved.label} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this season.');
    } finally {
      setBusy(false);
    }
  };

  const editHarvest = (index: number, kg: number) => {
    setPreview((current) => current ? {
      ...current,
      harvests: current.harvests.map((harvest, itemIndex) => itemIndex === index ? { ...harvest, kg } : harvest),
    } : current);
  };

  const startNextPlan = async () => {
    const season = savedSeason ?? selectedSeason;
    if (!season) return;
    setStartingNext(true);
    try {
      await onStartNextPlan(season);
      setStartingNext(false);
      setSavedSeason(null);
      toast.success(`Planting cleared for ${season.year + 1}; infrastructure is preserved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the next plan.');
      setStartingNext(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-3" aria-label="Campaign seasons">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Campaign</h2>
          <p className="text-[11px] text-muted-foreground">Saved seasons keep soil and rotation history by world and growing level.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => {
          setFormOpen((open) => !open);
          invalidatePreview();
          setSavedSeason(null);
          setStartingNext(false);
          setSelectedRunIds([]);
          setReplaceExisting(false);
        }}>
          {formOpen ? 'Cancel' : 'Close season'}
        </Button>
      </div>

      {orderedSeasons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Saved campaign years">
          {orderedSeasons.map((season) => {
            const warnings = rotationWarnings[season.id] ?? 0;
            return (
              <button
                key={season.id}
                type="button"
                onClick={() => {
                  setSelectedSeasonId(season.id);
                  setSavedSeason(null);
                  setStartingNext(false);
                }}
                aria-pressed={selectedSeasonId === season.id}
                title={`${season.label} · ${seasonYield(season).toFixed(1)} kg · ${seasonOm(season)} · ${warnings} rotation warnings`}
                className={`rounded-md border px-2 py-1 text-left text-[10px] ${selectedSeasonId === season.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/60'}`}
              >
                <span className="block font-medium">{season.year} · {seasonYield(season).toFixed(1)} kg</span>
                <span className="text-muted-foreground">{seasonOm(season)}{warnings > 0 ? ` · ${warnings} rotation warnings` : ''}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">No seasons saved yet.</p>
      )}

      {selectedSeason && (
        <div className="mt-2 rounded-md bg-muted/40 p-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{selectedSeason.label}</span>
            <Badge variant="outline" className="text-[9px]">{selectedSeason.startDate} → {selectedSeason.endDate}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{selectedSeason.runIds.length} runs · {selectedSeason.environmentIds.length} worlds · {selectedSeason.harvests.length} harvest records · {seasonOm(selectedSeason)}</p>
          {(selectedSeason.soil ?? []).map((scope) => (
            <p key={`${scope.environmentId}:${scope.target.kind}:${scope.target.kind === 'growing-level' ? `${scope.target.growingSpaceId}:${scope.target.levelId}` : 'floor'}`} className="mt-1 text-muted-foreground">
              Soil output · {scope.environmentId} · {scope.target.kind === 'floor' ? 'Floor' : 'Growing level'}: OM {scope.soilOut.organicMatterPct.toFixed(2)}%, N {scope.soilOut.nPoolKgHa.toFixed(1)} kg/ha
            </p>
          ))}
          <p className="mt-1 text-[10px] italic text-muted-foreground">Soil organic matter is a documented estimate, not a validated soil-carbon model.</p>
          <div className="mt-2 flex justify-end">
            {!savedSeason && <Button size="sm" variant="outline" onClick={() => { setSavedSeason(selectedSeason); setStartingNext(true); }}>
              Start {selectedSeason.year + 1} plan
            </Button>}
          </div>
        </div>
      )}

      {rotationHint && (
        <p role={rotationHint.warning ? 'alert' : 'status'} className={`mt-2 rounded px-2 py-1.5 text-[11px] ${rotationHint.warning ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'bg-muted/40 text-muted-foreground'}`}>
          {rotationHint.message}
        </p>
      )}

      {formOpen && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="campaign-year" className="text-[10px]">Year</Label>
              <Input id="campaign-year" type="text" inputMode="numeric" value={yearInput} onChange={(event) => {
                const input = event.target.value;
                setYearInput(input);
                if (!/^\d{4}$/.test(input)) {
                  invalidatePreview();
                  return;
                }
                const value = Number(input);
                if (value < 1900 || value > 2200) {
                  invalidatePreview();
                  return;
                }
                setYear(value);
                setLabel(`${value} season`);
                setStartDate(`${value}-01-01`);
                setEndDate(`${value}-12-31`);
                setReplaceExisting(false);
                setSelectedRunIds([]);
                invalidatePreview();
              }} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campaign-label" className="text-[10px]">Season label</Label>
              <Input id="campaign-label" value={label} onChange={(event) => { setLabel(event.target.value); invalidatePreview(); }} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campaign-start" className="text-[10px]">Start</Label>
              <Input id="campaign-start" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); invalidatePreview(); }} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campaign-end" className="text-[10px]">End</Label>
              <Input id="campaign-end" type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); invalidatePreview(); }} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium">Runs to include</p>
            <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded border border-border p-1.5">
              {selectableRuns.length === 0 ? <p className="px-1 py-2 text-[10px] text-muted-foreground">No unclosed runs are available for this farm and year.</p> : selectableRuns.map((run) => (
                <label key={run.id} className={`flex items-start gap-2 rounded px-1 py-1 ${run.summary.yieldBasis === 'dry-matter' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50'}`}>
                  <input type="checkbox" checked={selectedRunIds.includes(run.id)} disabled={run.status !== 'complete' || run.summary.yieldBasis === 'dry-matter'} onChange={() => toggleRun(run.id)} className="mt-0.5 h-3.5 w-3.5 accent-primary disabled:opacity-40" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-medium">{run.label}</span>
                    <span className="block text-[9px] text-muted-foreground">{runDates(run)} · {run.summary.totalYieldKg.toFixed(1)} {yieldMassUnit(run.summary.yieldBasis)}{run.summary.yieldBasis === 'dry-matter' ? ' · not eligible for fresh-mass campaign' : ''} · {run.status}{unavailableRunIds.has(run.id) ? ' · already closed' : ''}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">Only the checked runs are included. Soil inputs come from each run’s frozen settings; carry is never inferred across worlds or levels.</p>
          </div>

          <div>
            <p className="text-[11px] font-medium">Compost applications</p>
            <div className="mt-1 space-y-1">
              {scopeOptions.map((scope) => (
                <label key={scope.key} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate">{scope.label}</span>
                  <Input
                    aria-label={`Compost applications for ${scope.label}`}
                    type="number"
                    min="0"
                    step="1"
                    value={compostApps[scope.key] ?? 0}
                    onChange={(event) => {
                      setCompostApps((current) => ({ ...current, [scope.key]: Math.max(0, Math.round(Number(event.target.value) || 0)) }));
                      invalidatePreview();
                    }}
                    className="h-7 w-16 text-right text-[10px]"
                  />
                </label>
              ))}
              {scopeOptions.length === 0 && <p className="text-[10px] text-muted-foreground">Choose runs to show soil-growing targets.</p>}
            </div>
            <p className="mt-1 text-[9px] text-muted-foreground">Compost count is explicit. Fertilizer interventions are not counted as compost.</p>
          </div>

          <Button size="sm" className="w-full" onClick={() => void createPreview()} disabled={busy || selectedRunIds.length === 0}>
            {busy ? 'Preparing preview…' : `Preview ${selectedRuns.length} selected run${selectedRuns.length === 1 ? '' : 's'}`}
          </Button>
          {existingSeasonForYear && (
            <label className="flex items-start gap-2 text-[10px] text-amber-800 dark:text-amber-200">
              <input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-primary" />
              <span>Replace {existingSeasonForYear.label}; its saved harvest and soil summary will be overwritten.</span>
            </label>
          )}
        </div>
      )}

      {preview && previewInput && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Close-season preview</h3>
            <Badge variant="outline" className="text-[9px]">{preview.harvests.length} harvests</Badge>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Review or correct reported harvest weights before saving.</p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {editableHarvests.map((harvest, index) => (
              <div key={`${harvest.date}:${harvest.environmentId ?? ''}:${harvest.cropId}:${harvest.target.kind}:${harvest.cell}:${index}`} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 rounded bg-muted/30 px-2 py-1">
                <span className="min-w-0 truncate text-[10px]" title={`${harvest.date} · ${harvest.environmentId ?? 'Legacy'} · ${harvest.cell}`}>
                  {harvest.date} · crop #{harvest.cropId} · {harvest.environmentId ?? 'Legacy'} · {harvest.target.kind === 'floor' ? 'Floor' : 'Tier'} · {harvest.cell}
                </span>
                <Input
                  aria-label={`Reported harvest kg for crop ${harvest.cropId} at ${harvest.cell}`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={harvest.kg}
                  onChange={(event) => editHarvest(index, Math.max(0, Number(event.target.value) || 0))}
                  className="h-7 text-right text-[10px]"
                />
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">
            <p className="text-[10px] font-medium">Next soil input, by soil-growing scope</p>
            {preview.soil.map((scope) => (
              <p key={`${scope.environmentId}:${scope.target.kind}:${scope.target.kind === 'growing-level' ? `${scope.target.growingSpaceId}:${scope.target.levelId}` : 'floor'}`} className="text-[10px] text-muted-foreground">
                {scope.environmentId} · {scope.target.kind === 'floor' ? 'Floor' : 'Tier'}: OM {scope.soilOut.organicMatterPct.toFixed(2)}%, N {scope.soilOut.nPoolKgHa.toFixed(1)} kg/ha
              </p>
            ))}
            <p className="text-[9px] italic text-muted-foreground">Organic matter change uses the documented campaign approximation.</p>
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>Back</Button>
            <Button size="sm" onClick={() => void saveSeason()} disabled={busy || (!!existingSeasonForYear && !replaceExisting) || preview.harvests.some((harvest) => !Number.isFinite(harvest.kg) || harvest.kg < 0)}>
              {busy ? 'Saving…' : existingSeasonForYear ? 'Confirm and replace season' : 'Confirm and save season'}
            </Button>
          </div>
        </div>
      )}

      {savedSeason && !formOpen && (
        <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px]">
          {savedSeason.id.startsWith('season:') && !seasons.some((season) => season.id === savedSeason.id)
            ? `Saved ${savedSeason.label}. The next plan uses its soil output only when you select that carry for a new run.`
            : `Selected ${savedSeason.label}. The next plan uses its soil output only when you select that carry for a new run.`}
          {startingNext ? (
            <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2">
              <p className="text-[11px]">Clear planting in {savedSeason.environmentIds.length} saved world(s) for {savedSeason.year + 1}? Floors and every tier are cleared; ground, layout, and installed equipment stay.</p>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setStartingNext(false)}>Cancel</Button>
                <Button size="sm" onClick={() => void startNextPlan()} disabled={busy}>Confirm clear planting</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setStartingNext(true)}>
              Start {savedSeason.year + 1} plan
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
