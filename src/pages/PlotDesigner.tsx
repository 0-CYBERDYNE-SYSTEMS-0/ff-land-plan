import { ArrowLeft, Check, Map as MapIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { isInputCaptured } from '@/lib/inputArbiter';
import type { SimEvent, SimState } from '@/lib/sim';
import { runDayEnv } from '@/hooks/useSimRun';
import { effectiveStress, projectPlant, stageCountFor } from '@/lib/sim/view';
import type { SimOverlayChannels } from '@/lib/renderPlan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigation } from '@/hooks/useNavigation';
import { useSimRun } from '@/hooks/useSimRun';
import { AssetPalette } from '@/components/designer/AssetPalette';
import { BlueprintCanvas } from '@/components/designer/BlueprintCanvas';
import { CropPalette } from '@/components/designer/CropPalette';
import { DesignerToolbar } from '@/components/designer/DesignerToolbar';
import { AdvicePanel } from '@/components/designer/AdvicePanel';
import { PairingsPanel } from '@/components/designer/PairingsPanel';
import { SelectionPanel } from '@/components/designer/SelectionPanel';
import { StatsPanel } from '@/components/designer/StatsPanel';
import { TemplatesCard } from '@/components/designer/TemplatesCard';
import { ViewToggle } from '@/components/designer/ViewToggle';
import type { AdviceDot } from '@/lib/advice';
import { FILL_CONFIRM_THRESHOLD, usePlanEditor } from '@/components/designer/usePlanEditor';
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

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function PlotDesigner({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const editor = usePlanEditor(farmId);
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
    const moisture = new Map<string, number>();
    const stress = new Map<string, number>();
    const ready = new Set<string>();
    const env = runDayEnv(rec, st.dayIndex);
    for (const [key, cell] of Object.entries(st.cells)) {
      if (plan.planting[key] === undefined) continue;
      const crop = editor.cropById.get(cell.cropId);
      if (!crop) continue;
      const view = projectPlant({ cell, crop, env, dayIndex: st.dayIndex, cellKey: key, stageCount: stageCountFor(crop.name) });
      if (view.moisture !== null) moisture.set(key, view.moisture);
      const s = effectiveStress(cell);
      if (s > 0.15) stress.set(key, s);
      // Ripe = biomass already crossed 1.0 (readyAtDay is set at crossing)
      // and still standing: the engine auto-harvests at readyAtDay, so the
      // alive window IS the pick-me window (engine.ts HARVEST_GRACE_DAYS).
      if (view.lifecycle === 'alive' && cell.readyAtDay !== undefined) {
        ready.add(key);
      }
    }
    return { moisture, stress, ready };
  }, [simRun.record, simRun.dayIndex, simRun.simStateRef, editor.planVersion, editor.cropById, editor.planRef]);

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

  // Advice overlay dots (SPEC-JEV-ADVICE): AdvicePanel owns the scan; this
  // page just relays its "Show on map" result into the editor's overlay pipe
  // (same setSimChannels-shaped seam). Null unless the panel pushes a scan,
  // so flag-off behaviour is byte-identical to main.
  const [adviceDots, setAdviceDots] = useState<Map<string, AdviceDot> | null>(null);
  useEffect(() => {
    editor.setAdviceDots(adviceDots);
  }, [adviceDots, editor.setAdviceDots]);

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
    let cancelled = false;
    apiFetch
      .createSimRun({
        farmId,
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
  }, []);

  // Run list for the in-world Compare picker (Phase 4): explicit queryFn —
  // the QueryClient's hostile default + staleTime:Infinity make casual
  // queries a trap (HANDOFF trap). Shares the Simulations page's cache key,
  // so a run created there appears here on the next mount.
  const { data: allRuns = [] } = useQuery({
    queryKey: ['sim-runs', farmId],
    queryFn: () => apiFetch.listSimRuns(farmId),
  });

  const [viewMode, setViewMode] = useState<'blueprint' | 'world'>(() => {
    // Test hook for headless verification (tools/appshot.mjs): ?ffview=world
    // opens the 3D view immediately, no click required. Harmless in normal use.
    if (new URLSearchParams(window.location.search).get('ffview') === 'world') return 'world';
    return 'blueprint';
  });

const [cinema, setCinema] = useState(false);

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
            <MapIcon className="w-5 h-5 text-primary" /> Plot Designer
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {farm.name} · {currentPlan.widthM} m × {currentPlan.heightM} m · 25 cm cells
            {cinemaOn && ' · Cinema (H to exit)'}
          </p>
        </div>
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
            <SelectionPanel editor={editor} />
            <StatsPanel editor={editor} />
            <PairingsPanel editor={editor} />
            <AdvicePanel editor={editor} onAdviceDotsChange={setAdviceDots} />
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
