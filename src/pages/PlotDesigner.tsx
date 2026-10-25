import { ArrowLeft, Check, Map as MapIcon, Redo2, Undo2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { buildSeasonPreview, makeSeasonRecord, rotationCellKey, rotationHint, rotationIndexFromSeasons } from '@/lib/campaign';
import { CAMPAIGN_ENABLED, ENV_RECORDS_ENABLED, TIMELINE_ENABLED } from '@/lib/featureFlags';
import { fetchSeasonEnsembles } from '@/lib/ensembles';
import { growingTargetKey, parseTargetCellKey } from '@/lib/growingTargets';
import { isInputCaptured } from '@/lib/inputArbiter';
import { ensembleConfigKey, forkRun, runEnsembleInWorker } from '@/lib/sim';
import type { Intervention, RunRecord, SimEvent, SimState } from '@/lib/sim';
import { runDateISO, runDayEnv } from '@/hooks/useSimRun';
import { effectiveStress, projectPlant, stageCountFor } from '@/lib/sim/view';
import type { SimOverlayChannels } from '@/lib/renderPlan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigation } from '@/hooks/useNavigation';
import { useSimRun } from '@/hooks/useSimRun';
import { archetypes } from '@/creative/archetypes';
import type { ArchetypeId, SeasonRecord } from '@/types';
import { AssetPalette } from '@/components/designer/AssetPalette';
import { BlueprintCanvas } from '@/components/designer/BlueprintCanvas';
import { CropPalette } from '@/components/designer/CropPalette';
import { DesignerToolbar } from '@/components/designer/DesignerToolbar';
import { PairingsPanel } from '@/components/designer/PairingsPanel';
import { SelectionPanel } from '@/components/designer/SelectionPanel';
import { StatsPanel } from '@/components/designer/StatsPanel';
import { TemplatesCard } from '@/components/designer/TemplatesCard';
import { ViewToggle } from '@/components/designer/ViewToggle';
import { FILL_CONFIRM_THRESHOLD, usePlanEditor } from '@/components/designer/usePlanEditor';
import { GrowingWorldSetup } from '@/components/designer/GrowingWorldSetup';
import { GrowingSystemsPanel } from '@/components/designer/GrowingSystemsPanel';
import { CampaignPanel, type CampaignCloseInput, type CampaignPreview } from '@/components/designer/CampaignPanel';
import { SiteOverview } from '@/components/designer/SiteOverview';
import type { RunEnsemblePanelState } from '@/components/world/SimDrawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const World3D = lazy(() => import('@/components/world/World3D'));

function interventionDate(intervention: Intervention): string {
  return intervention.kind === 'weather' ? intervention.fromDate : intervention.date;
}

function isForkManagementIntervention(intervention: Intervention): boolean {
  return intervention.kind === 'irrigate'
    || intervention.kind === 'fertilize'
    || intervention.kind === 'plant'
    || intervention.kind === 'harvest'
    || intervention.kind === 'refill-water';
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function PlotDesigner({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const editor = usePlanEditor(farmId);
  const queryClient = useQueryClient();
  const { farm, isLoading, planRef, saveState, savedAt } = editor;

  // --- Sim run lifecycle (SPEC-SIM-ECOSYSTEM Phase 1/2) ---
  // Mounted HERE because this page owns both the world and the drawer. The
  // event sink is a ref relay: useSimRun fires it from its own rAF loop and
  // World3D binds it to the harvest celebration without prop-drilling state.
  const runEventsRef = useRef<((events: SimEvent[], state: SimState) => void) | null>(null);
  const simRun = useSimRun({
    onEvents: (events, state) => runEventsRef.current?.(events, state),
    farmCoords: farm ? { lat: farm.lat, lng: farm.lng } : undefined,
  });
  const [forkSaving, setForkSaving] = useState(false);
  const [runEnsemble, setRunEnsemble] = useState<RunEnsemblePanelState>({ status: 'idle', completed: 0, total: 0 });
  const ensembleAbortRef = useRef<AbortController | null>(null);

  // DEV-only launch param (wave 5): ?ffvis2d=drought|baseline composes a REAL
  // run through the same createSimRun path the Simulations page uses, seeks it
  // to a mid-season day and switches all three blueprint sim overlays ON —
  // appshot can't seed localStorage runs, so this is the only headless way to
  // exercise the 2D overlay path end to end. Never active outside DEV.
  const vis2d = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('ffvis2d')
    : null;
  // Companion param: which day the demo seeks to (day 25 = living stressed
  // field on farm 1's September-start drought runs; default 25).
  const vis2dDay = import.meta.env.DEV
    ? Number(new URLSearchParams(window.location.search).get('ffvis2dDay')) || 25
    : 25;

  // Sim-run 2D overlay channels (SPEC-GROWTH-VISUAL wave 5): the SAME
  // projection layer as the 3D world (projectPlant), re-derived day-keyed
  // (dayIndex, not the throttled tick), then pushed into the editor for the
  // blueprint canvas's opt-in overlays. Undefined when no run is active —
  // the toolbar hides the toggles and drawPlan stays byte-identical.
  const simChannels = useMemo<SimOverlayChannels | undefined>(() => {
    const rec = simRun.record;
    const st = rec ? simRun.simStateRef.current : null;
    const plan = editor.planRef.current;
    if (!rec || !st || !plan) return undefined;
    const activeTargetKey = growingTargetKey(editor.activeTarget);
    const moisture = new Map<string, number>();
    const stress = new Map<string, number>();
    const ready = new Set<string>();
    const env = runDayEnv(rec, st.dayIndex);
    for (const [stateKey, cell] of Object.entries(st.cells)) {
      const { target, localCellKey } = parseTargetCellKey(stateKey);
      if (growingTargetKey(target) !== activeTargetKey || plan.planting[localCellKey] === undefined) continue;
      const crop = editor.cropById.get(cell.cropId);
      if (!crop) continue;
      const view = projectPlant({ cell, crop, env, dayIndex: st.dayIndex, cellKey: localCellKey, stageCount: stageCountFor(crop.name) });
      if (view.moisture !== null) moisture.set(localCellKey, view.moisture);
      const s = effectiveStress(cell);
      if (s > 0.15) stress.set(localCellKey, s);
      // Ripe = biomass already crossed 1.0 (readyAtDay is set at crossing)
      // and still standing: the engine auto-harvests at readyAtDay, so the
      // alive window IS the pick-me window (engine.ts HARVEST_GRACE_DAYS).
      if (view.lifecycle === 'alive' && cell.readyAtDay !== undefined) {
        ready.add(localCellKey);
      }
    }
    return { moisture, stress, ready };
  }, [simRun.record, simRun.dayIndex, simRun.simStateRef, editor.planVersion, editor.cropById, editor.planRef, editor.activeTarget]);

  useEffect(() => {
    editor.setSimChannels(simChannels);
    if (!vis2d) return;
    // #ff-plan-channels DOM probe (wave 5, same pattern as the world's
    // #ff-env-bridge): hidden span written whenever channels re-derive so
    // headless gates can assert run day + channel sizes machine-readably.
    let el = document.getElementById('ff-plan-channels') as HTMLSpanElement | null;
    if (!el) {
      el = document.createElement('span');
      el.id = 'ff-plan-channels';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.textContent = simChannels
      ? `ff-plan-channels day=${simRun.dayIndex} m=${simChannels.moisture?.size ?? 0} s=${simChannels.stress?.size ?? 0} r=${simChannels.ready?.size ?? 0}`
      : 'ff-plan-channels off';
  }, [simChannels, editor.setSimChannels, vis2d, simRun.dayIndex]);

  // ?ffrun=<id> launch param (BEFORE the hash, like ?ffview): load the
  // RunRecord once per mount and hand it to the run controller. The attempt
  // marker is set only AFTER the load resolves — marking synchronously would
  // swallow the run under StrictMode's effect double-invoke (first pass is
  // cancelled, second pass must still be allowed to start it).
  // ?ffghost=<id> (Phase 4, same before-the-hash pattern): with ?ffrun
  // present, also load that run as the GHOST comparison (alone it is inert —
  // ghosts exist only against an active primary run).
  const launchRunId = useMemo(() => new URLSearchParams(window.location.search).get('ffrun'), []);
  const launchGhostId = useMemo(() => new URLSearchParams(window.location.search).get('ffghost'), []);
  const launchRunDoneRef = useRef<Set<string>>(new Set());
  // Latest-controller ref (handlersRef convention): simRun's identity changes
  // every throttled commit while a run plays — it must not be an effect dep or
  // the launch load re-fires each commit.
  const simRunRef = useRef(simRun);
  simRunRef.current = simRun;
  useEffect(() => {
    const record = simRun.record;
    const cache = record?.ensembleCache;
    const result = cache?.result;
    const expectedKey = record ? ensembleConfigKey(record.config, simRun.ctx ?? undefined) : null;
    setRunEnsemble(result && cache?.configKey === expectedKey
      ? { status: 'ready', completed: result.years.length, total: result.years.length, result, persisted: true }
      : { status: 'idle', completed: 0, total: 0 });
  }, [simRun.record, simRun.ctx]);
  const runInputIdentity = simRun.record
    ? `${simRun.record.id}:${ensembleConfigKey(simRun.record.config, simRun.ctx ?? undefined)}`
    : '';
  useEffect(() => () => {
    ensembleAbortRef.current?.abort();
    ensembleAbortRef.current = null;
  }, [runInputIdentity]);
  useEffect(() => {
    if (!launchRunId && !launchGhostId) return;
    const launchKey = `${launchRunId ?? ''}|${launchGhostId ?? ''}`;
    if (launchRunDoneRef.current.has(launchKey)) return;
    if (launchRunId && simRunRef.current.record?.id === launchRunId) return; // already active
    let cancelled = false;
    apiFetch
      .listSimRuns(farmId)
      .then((runs) => {
        if (cancelled) return;
        launchRunDoneRef.current.add(launchKey); // hit or miss: one resolved attempt wins
        const rec = launchRunId ? runs.find((r) => r.id === launchRunId) : undefined;
        const ghost = launchGhostId ? runs.find((r) => r.id === launchGhostId) : undefined;
        if (rec) simRunRef.current.startRun(rec);
        // loadGhost guards identity (same farm, not the primary) and defers
        // its fold until the replay context lands inside startRun.
        if (rec && ghost && ghost.id !== rec.id) simRunRef.current.loadGhost(ghost);
      })
      .catch(() => {
        // Missing/failed run load is a silent no-op — the world stays legacy.
      });
    return () => {
      cancelled = true;
    };
  }, [launchRunId, launchGhostId, farmId]);

  // ?ffvis2d activation (DEV only): one STARTED demo per mount — the done
  // marker is set only after the create resolves, so StrictMode's cancelled
  // first pass can't swallow the second (same contract as the launch effect
  // above; the first pass's persisted record is a harmless dev artifact).
  const vis2dDoneRef = useRef(false);
  useEffect(() => {
    if (!vis2d || vis2dDoneRef.current) return;
    const environmentId = editor.scope.kind === 'env' ? editor.environment?.id : undefined;
    if (ENV_RECORDS_ENABLED && !environmentId) return;
    let cancelled = false;
    apiFetch
      .createSimRun({
        farmId,
        ...(ENV_RECORDS_ENABLED && environmentId ? { environmentId } : {}),
        scenario: vis2d === 'baseline' ? 'baseline' : 'drought',
        dayCount: 90,
        seed: 7,
        startDate: '2026-09-01',
      })
      .then((rec) => {
        if (cancelled) return;
        vis2dDoneRef.current = true;
        simRunRef.current.startRun(rec);
        // seekDay before the replay context lands is safe: the controller
        // stashes it as pendingSeek and folds when the context arrives.
        simRunRef.current.seekDay(vis2dDay);
        editor.toggleSimMoisture();
        editor.toggleSimStress();
        editor.toggleSimReady();
      })
      .catch(() => {
        // Best-effort demo: a failed compose leaves the plain blueprint.
      });
    return () => {
      cancelled = true;
    };
    // Launch params are read once per mount; the toggles are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.environment?.id, editor.scope.kind, farmId, vis2d]);

  // Run list for the in-world Compare picker (Phase 4): explicit queryFn —
  // the QueryClient's hostile default + staleTime:Infinity make casual
  // queries a trap (HANDOFF trap). Shares the Simulations page's cache key,
  // so a run created there appears here on the next mount.
  const { data: allRuns = [] } = useQuery({
    queryKey: ['sim-runs', farmId],
    queryFn: () => apiFetch.listSimRuns(farmId),
  });
  const { data: seasons = [] } = useQuery<SeasonRecord[]>({
    queryKey: ['seasons', farmId],
    queryFn: () => apiFetch.listSeasons(farmId),
    enabled: CAMPAIGN_ENABLED,
  });
  const rotationIndex = useMemo(
    () => rotationIndexFromSeasons(seasons, allRuns),
    [allRuns, seasons],
  );
  const rotationWarnings = useMemo(() => Object.fromEntries(seasons.map((season) => {
    const warnedCells = new Set<string>();
    for (const harvest of season.harvests ?? []) {
      const environmentId = harvest.environmentId ?? season.environmentIds[0] ?? '';
      const target = harvest.target ?? { kind: 'floor' as const };
      const hint = rotationHint(rotationIndex, environmentId, target, harvest.cell, harvest.family, season.year);
      if (hint?.warning) warnedCells.add(rotationCellKey(environmentId, target, harvest.cell));
    }
    return [season.id, warnedCells.size];
  })), [rotationIndex, seasons]);
  const campaignYear = Math.max(
    new Date().getUTCFullYear(),
    ...seasons.map((season) => season.year + 1),
  );
  const currentRotationHint = CAMPAIGN_ENABLED && editor.environment && editor.hoverKey && editor.activeCrop?.family
    ? rotationHint(rotationIndex, editor.environment.id, editor.activeTarget, editor.hoverKey, editor.activeCrop.family, campaignYear)
    : null;
  const previewSeason = async (input: CampaignCloseInput): Promise<CampaignPreview> => {
    if (input.startDate.slice(0, 4) !== String(input.year) || input.endDate.slice(0, 4) !== String(input.year)) {
      throw new Error('The season dates must fall within its selected calendar year.');
    }
    const selected = input.runIds.map((id) => allRuns.find((run) => run.id === id));
    if (selected.some((run) => !run)) throw new Error('A selected run is no longer available.');
    const selectedRuns = selected.filter((run): run is RunRecord => run !== undefined);
    const outsideWindow = selectedRuns.find((run) =>
      run.config.startDate < input.startDate || runDateISO(run, run.config.dayCount - 1) > input.endDate,
    );
    if (outsideWindow) throw new Error(`${outsideWindow.label} does not fit inside ${input.startDate}–${input.endDate}.`);
    return buildSeasonPreview(selectedRuns, { compostAppsByScope: input.compostAppsByScope });
  };
  const saveSeason = async (input: CampaignCloseInput, preview: CampaignPreview): Promise<SeasonRecord> => {
    if (!CAMPAIGN_ENABLED) throw new Error('Campaign features are disabled.');
    const saved = await apiFetch.saveSeason(makeSeasonRecord({
      farmId,
      year: input.year,
      label: input.label,
      startDate: input.startDate,
      endDate: input.endDate,
      updatedAt: new Date().toISOString(),
    }, preview));
    await queryClient.invalidateQueries({ queryKey: ['seasons', farmId] });
    return saved;
  };
  const startNextPlan = (season: SeasonRecord) => editor.startNextPlan(season.environmentIds);
  const cacheSavedRun = (saved: RunRecord) => {
    queryClient.setQueryData<RunRecord[]>(['sim-runs', farmId], (current) =>
      [saved, ...(current ?? allRuns).filter((run) => run.id !== saved.id)].slice(0, 40),
    );
  };
  const saveFork = async () => {
    if (!TIMELINE_ENABLED) return;
    const controller = simRunRef.current;
    const parent = controller.record;
    if (!parent) return;
    controller.pause();
    const afterDayCount = controller.simStateRef.current?.dayIndex ?? controller.dayIndex;
    const parentConfigSnapshot = JSON.stringify(parent.config);
    const firstUncompletedDate = runDateISO(parent, afterDayCount);
    const futureInterventions = parent.config.interventions.filter((intervention) =>
      isForkManagementIntervention(intervention) && interventionDate(intervention) >= firstUncompletedDate,
    );
    setForkSaving(true);
    try {
      const fork = forkRun(parent, afterDayCount, { interventions: futureInterventions }, controller.ctx ?? undefined);
      const saved = await apiFetch.saveSimRun(fork);
      cacheSavedRun(saved);
      const currentController = simRunRef.current;
      const currentParent = currentController.record;
      const currentDay = currentController.simStateRef.current?.dayIndex ?? currentController.dayIndex;
      if (currentParent?.id === parent.id && JSON.stringify(currentParent.config) === parentConfigSnapshot && currentDay === afterDayCount) {
        const ghost = currentController.ghostRecord;
        currentController.startRun(saved);
        currentController.seekDay(afterDayCount);
        if (ghost) currentController.loadGhost(ghost);
      }
      toast.success(`Saved ${saved.label}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setForkSaving(false);
    }
  };
  const calculateEnsemble = async () => {
    if (!TIMELINE_ENABLED || !farm) return;
    const controller = simRunRef.current;
    const active = controller.record;
    if (!active) return;
    ensembleAbortRef.current?.abort();
    const abortController = new AbortController();
    ensembleAbortRef.current = abortController;
    const configSnapshot = JSON.stringify(active.config);
    const activeId = active.id;
    const isCurrentRequest = () => ensembleAbortRef.current === abortController && !abortController.signal.aborted;
    const isCurrentRun = () => {
      const current = simRunRef.current.record;
      return current?.id === activeId && JSON.stringify(current.config) === configSnapshot;
    };
    setRunEnsemble({ status: 'loading-weather', completed: 0, total: 0 });
    try {
      const seasons = await fetchSeasonEnsembles(farm.lat, farm.lng);
      if (!isCurrentRequest() || !isCurrentRun()) return;
      if (!seasons) {
        if (isCurrentRun()) {
          setRunEnsemble({ status: 'unavailable', completed: 0, total: 0, message: 'Fewer than three complete historical weather windows are available for this location.' });
        }
        return;
      }
      const { key, result, unavailableReason } = await runEnsembleInWorker(active.config, seasons, {
        maxYears: 10,
        ctx: controller.ctx ?? undefined,
        signal: abortController.signal,
        onProgress: (completed, total) => {
          if (isCurrentRequest() && isCurrentRun()) {
            setRunEnsemble({ status: 'running', completed, total });
          }
        },
      });
      if (!isCurrentRequest()) return;
      if (!result) {
        if (isCurrentRun()) {
          setRunEnsemble({ status: 'unavailable', completed: 0, total: 0, message: unavailableReason ?? 'Fewer than three complete historical weather windows are available for this location.' });
        }
        return;
      }
      const current = simRunRef.current.record;
      if (!current || !isCurrentRun()) {
        if (current?.id === activeId) setRunEnsemble({ status: 'idle', completed: 0, total: 0 });
        return;
      }
      if (simRunRef.current.unsavedChanges) {
        setRunEnsemble({ status: 'ready', completed: result.years.length, total: result.years.length, result, persisted: false });
        return;
      }
      setRunEnsemble({ status: 'saving', completed: result.years.length, total: result.years.length, result });
      const saved = await apiFetch.saveSimRun({
        ...current,
        ensembleCache: { key, configKey: ensembleConfigKey(current.config, controller.ctx ?? undefined), result },
      });
      cacheSavedRun(saved);
      if (isCurrentRequest() && isCurrentRun()) {
        setRunEnsemble({ status: 'ready', completed: result.years.length, total: result.years.length, result: saved.ensembleCache?.result ?? result, persisted: true });
      }
    } catch (error) {
      if (isCurrentRequest() && isCurrentRun() && (error as Error).name !== 'AbortError') {
        setRunEnsemble({ status: 'error', completed: 0, total: 0, message: (error as Error).message });
      }
    } finally {
      if (ensembleAbortRef.current === abortController) ensembleAbortRef.current = null;
    }
  };
  const cancelEnsemble = () => {
    if (!ensembleAbortRef.current) return;
    ensembleAbortRef.current.abort();
    ensembleAbortRef.current = null;
    setRunEnsemble({ status: 'cancelled', completed: 0, total: 0 });
  };
  const runCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const run of allRuns) {
      const environmentId = run.config.environment?.id;
      if (environmentId) counts[environmentId] = (counts[environmentId] ?? 0) + 1;
    }
    return counts;
  }, [allRuns]);

  const [viewMode, setViewMode] = useState<'blueprint' | 'world'>(() => {
    // Test hook for headless verification (tools/appshot.mjs): ?ffview=world
    // opens the 3D view immediately, no click required. Harmless in normal use.
    if (new URLSearchParams(window.location.search).get('ffview') === 'world') return 'world';
    return 'blueprint';
  });

  const [cinema, setCinema] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupArchetype, setSetupArchetype] = useState<ArchetypeId>('open-field');
  const [creatingWorld, setCreatingWorld] = useState(false);

  // The 3D world claims left-drag for the camera only while the Select tool is
  // active (paint tools bind drag for strokes). The editor defaults to Brush,
  // which would leave the world view unrotatable on arrival — so entering the
  // world always resets to Select; the guard keeps an in-view tool switch from
  // being snapped back on re-render. Picking a paint tool afterwards re-claims
  // the drag for painting, in 3D as in blueprint. `setTool` is a useState
  // setter (stable), so this runs exactly on view switches.
  useEffect(() => {
    if (viewMode === 'world') {
      if (editor.tool !== 'select') editor.setTool('select');
    } else {
      setCinema(false);
    }
  }, [viewMode, editor.setTool]);

  // `h` toggles cinema in the world view; Escape stays reserved for flight.
  useEffect(() => {
    if (viewMode !== 'world') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'h') return;
      if (isTypingTarget(e.target)) return;
      if (isInputCaptured()) return; // flight owns the keyboard
      e.preventDefault();
      setCinema((c) => !c);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode]);

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-[75vh] w-full" /></div>;
  }
  if (!farm) return <div className="p-6">Farm not found.</div>;
  const currentPlan = planRef.current;
  const siteScope = editor.featureEnabled && editor.scope.kind === 'site';
  if (siteScope) {
    const empty = editor.environments.length === 0;
    const createWorld = async (input: Parameters<typeof editor.createWorld>[0], starter: Parameters<typeof editor.createWorld>[1]) => {
      setCreatingWorld(true);
      try {
        await editor.createWorld(input, starter);
        setSetupOpen(false);
        setViewMode('blueprint');
      } finally {
        setCreatingWorld(false);
      }
    };
    const openSetup = (initialArchetype: ArchetypeId = 'open-field') => {
      setSetupArchetype(initialArchetype);
      setSetupOpen(true);
    };
    return (
      <div className="flex flex-col gap-4 p-4 lg:p-6 xl:h-full xl:min-h-0" data-testid="site-planner">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-bold"><MapIcon className="h-5 w-5 text-primary" /> Site · {farm.name}</h1>
            <p className="truncate text-sm text-muted-foreground">Choose a growing world or arrange the site footprint.</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Site edit history">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={editor.undo} disabled={editor.undoRef.current.length === 0} aria-label="Undo site change" title="Undo (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" /><span>Undo</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={editor.redo} disabled={editor.redoRef.current.length === 0} aria-label="Redo site change" title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="h-3.5 w-3.5" /><span>Redo</span>
            </Button>
          </div>
          {!empty && <Button size="sm" onClick={() => openSetup()}>Add growing world</Button>}
        </div>
        {editor.staleSelectionId && (
          <div className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm" role="status">
            The previously selected world “{editor.staleSelectionId}” is no longer on this site. Choose an existing world below.
          </div>
        )}
        {empty ? (
          <GrowingWorldSetup farmId={farmId} onCreate={createWorld} creating={creatingWorld} />
        ) : (
          <>
            {setupOpen && <GrowingWorldSetup key={setupArchetype} farmId={farmId} onCreate={createWorld} onCancel={() => setSetupOpen(false)} creating={creatingWorld} initialArchetype={setupArchetype} />}
            <SiteOverview
              site={editor.sitePlan}
              environments={editor.environments}
              selectedEnvironmentId={editor.selectedEnvironmentId}
              runCounts={runCounts}
              onAddWorld={(initialArchetype) => openSetup(initialArchetype)}
              onEnterWorld={editor.selectEnvironment}
              onMoveWorld={editor.moveWorld}
              onSaveWorld={editor.saveWorld}
              onDuplicateWorld={editor.duplicateWorld}
              onDeleteWorld={editor.deleteWorld}
            />
            {!empty && (
              <CampaignPanel
                runs={allRuns}
                seasons={seasons}
                rotationWarnings={rotationWarnings}
                onPreview={previewSeason}
                onSaveSeason={saveSeason}
                onStartNextPlan={startNextPlan}
              />
            )}
          </>
        )}
      </div>
    );
  }
  if (!currentPlan) return <div className="p-6">Plan not found.</div>;
  const cinemaOn = cinema && viewMode === 'world';

  return (
    <div className="flex flex-col p-4 lg:p-6 space-y-4 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-primary" /> {editor.environment?.label ?? 'Plot Designer'}
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {editor.environment
              ? `${farm.name} · ${archetypes[editor.environment.archetype].label} · ${editor.environment.widthM} × ${editor.environment.heightM} m · ${editor.activeTargetLabel} · ${editor.environment.cellM * 100} cm cells`
              : `${farm.name} · ${currentPlan.widthM} m × ${currentPlan.heightM} m · 25 cm cells`}
            {editor.environment && !editor.environment.layout?.growingSpaces.length &&
              (editor.archetype === 'warehouse-vertical' || editor.archetype === 'container-farm') && ' · Tier planning unavailable'}
            {cinemaOn && ' · Cinema (H to exit)'}
          </p>
        </div>
        {editor.featureEnabled && editor.scope.kind === 'env' && editor.environment && (
          <>
            <Button size="sm" variant="outline" onClick={editor.showSite}>Site</Button>
            <Select value={editor.environment.id} onValueChange={editor.selectEnvironment}>
              <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Selected growing world">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editor.environments.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>{environment.label} · {archetypes[environment.archetype].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editor.activeTargetKey} onValueChange={editor.selectTarget}>
              <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Selected growing level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editor.targetOptions.map((option) => (
                  <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => { editor.showSite(); setSetupArchetype('open-field'); setSetupOpen(true); }}>Add world</Button>
          </>
        )}
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        {!cinemaOn && (
          <Badge variant={saveState === 'error' ? 'destructive' : 'secondary'} className="gap-1">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? `Saved ${savedAt ?? ''}` : saveState === 'dirty' ? 'Unsaved' : 'Ready'}
            {saveState === 'saved' && <Check className="w-3 h-3" />}
          </Badge>
        )}
      </div>

      <div className={`grid gap-4 xl:flex-1 xl:min-h-0${cinemaOn ? '' : ' xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          {!cinemaOn && <DesignerToolbar editor={editor} />}
          {viewMode === 'blueprint' ? (
            <BlueprintCanvas editor={editor} />
          ) : (
            <Suspense fallback={
              <div className="flex h-[60dvh] min-h-[320px] items-center justify-center bg-muted/30 xl:h-auto xl:min-h-0 xl:flex-1">
                <div className="text-center space-y-2">
                  <Skeleton className="mx-auto h-8 w-8 rounded-full" />
                  <p className="text-sm text-muted-foreground">Loading 3D world…</p>
                </div>
              </div>
            }>
              <World3D
                editor={editor}
                cinema={cinema}
                onToggleCinema={() => setCinema((c) => !c)}
                simRun={simRun}
                compareRuns={allRuns}
                onSaveFork={saveFork}
                forkSaving={forkSaving}
                runEnsemble={runEnsemble}
                onCalculateEnsemble={calculateEnsemble}
                onCancelEnsemble={cancelEnsemble}
                runEventsRef={runEventsRef}
              />
            </Suspense>
          )}
        </div>

        {!cinemaOn && (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <TemplatesCard editor={editor} />
            <CropPalette editor={editor} />
            <AssetPalette editor={editor} />
            <GrowingSystemsPanel editor={editor} />
            <CampaignPanel
              runs={allRuns}
              seasons={seasons}
              rotationHint={currentRotationHint}
              rotationWarnings={rotationWarnings}
              onPreview={previewSeason}
              onSaveSeason={saveSeason}
              onStartNextPlan={startNextPlan}
            />
            <SelectionPanel editor={editor} />
            <StatsPanel editor={editor} />
            <PairingsPanel editor={editor} />
          </div>
        )}
      </div>

      {/* DES-009: oversized fills confirm before committing, matching the
          template-apply bar (a 400-cell fill is more destructive than a
          24-cell template). */}
      <AlertDialog
        open={editor.pendingFill !== null}
        onOpenChange={(open) => {
          if (!open) editor.cancelFill();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fill {editor.pendingFill?.region.length ?? 0} cells?</AlertDialogTitle>
            <AlertDialogDescription>
              The flood fill touched {editor.pendingFill?.region.length ?? 0} cells — above the
              {' '}{FILL_CONFIRM_THRESHOLD}-cell confirm threshold. This replaces the whole connected
              region; Undo (Ctrl/Cmd+Z) restores it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={editor.cancelFill}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={editor.confirmFill}>Fill region</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
