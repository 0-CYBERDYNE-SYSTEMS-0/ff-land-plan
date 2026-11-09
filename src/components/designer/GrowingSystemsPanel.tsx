import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { archetypes } from '@/creative/archetypes';
import { fetchMonthlyDli } from '@/lib/light';
import { equipmentTermsFor } from '@/lib/sim/equipment';
import { effectivePhotoperiodH, environmentDay } from '@/lib/sim/environment-climate';
import { canPlantInEnvironment, type PlanEditor } from './usePlanEditor';
import { growingTargetKey } from '@/lib/growingTargets';
import { planCols, planRows, cellKey } from '@/lib/plan';
import { ASSET_PHYSICS_ENABLED, ENV_CLIMATE_ENABLED } from '@/lib/featureFlags';
import type { ClimateEquipmentInput } from '@/lib/sim/environment-climate';
import type { Environment, GrowingTargetRef, PlanState } from '@/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function floorAreaForPlan(environment: Environment, plan: PlanState): number {
  const cellM = plan.cellM;
  const occupied = new Set<string>();
  for (let y = 0; y < planRows(plan); y += 1) {
    for (let x = 0; x < planCols(plan); x += 1) {
      const key = cellKey(x, y);
      if (canPlantInEnvironment(environment, key, plan, { kind: 'floor' })) occupied.add(key);
    }
  }
  // Ground-level bed/bench/hydro surfaces are part of the floor plane. Add
  // only their cells that the outside-bed rule would otherwise exclude.
  for (const space of environment.layout?.growingSpaces ?? []) {
    for (const level of space.levels) {
      if (level.elevationM > 0) continue;
      const x0 = Math.max(0, Math.floor(space.x / cellM));
      const y0 = Math.max(0, Math.floor(space.y / cellM));
      const x1 = Math.min(planCols(plan), Math.ceil((space.x + space.widthM) / cellM));
      const y1 = Math.min(planRows(plan), Math.ceil((space.y + space.depthM) / cellM));
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const x0M = x * cellM;
          const y0M = y * cellM;
          if (x0M < space.x + space.widthM && x0M + cellM > space.x &&
              y0M < space.y + space.depthM && y0M + cellM > space.y) {
            occupied.add(cellKey(x, y));
          }
        }
      }
    }
  }
  return occupied.size * cellM * cellM;
}

function plantedAreaForPlan(plan: PlanState): number {
  const cells = Object.keys(plan.planting).length + Object.values(plan.targets ?? {})
    .reduce((total, target) => total + Object.keys(target.planting).length, 0);
  return cells * plan.cellM * plan.cellM;
}

function growingSurfaceArea(environment: Environment, plan: PlanState): number {
  const floor = floorAreaForPlan(environment, plan);
  const elevated = (environment.layout?.growingSpaces ?? []).reduce((area, space) =>
    area + space.levels.reduce((sum, level) => sum + (level.elevationM > 0 ? space.widthM * space.depthM : 0), 0), 0);
  return floor + elevated;
}

function climateEquipment(terms: ReturnType<typeof equipmentTermsFor>): ClimateEquipmentInput {
  return {
    ppfdUmol: terms.ppfdUmol,
    lightingW: terms.lightingW,
    photoperiodH: terms.photoperiodH,
    achBoost: terms.achBoost,
    heatingKw: terms.heatingKw,
    coolingKw: terms.coolingKw,
    dehumLpd: terms.dehumLpd,
    dehumDerateBelowRh: terms.dehumDerateBelowRh,
    co2TargetPpm: terms.co2TargetPpm,
    co2KgDay: terms.co2KgDay,
  };
}

function naturalLightTarget(environment: Environment, target: GrowingTargetRef): boolean {
  if (target.kind === 'floor') return true;
  const space = environment.layout?.growingSpaces.find((item) => item.id === target.growingSpaceId);
  if (!space) return false;
  const top = [...space.levels].sort((a, b) => b.elevationM - a.elevationM || a.id.localeCompare(b.id))[0];
  return top?.id === target.levelId;
}

function targetDli(
  environment: Environment,
  target: GrowingTargetRef,
  naturalDli: number | null,
  ppfdUmol: number,
  photoperiodH: number,
): { value: number; supplementalOnly: boolean } | null {
  const archetype = archetypes[environment.archetype];
  const targetGetsNatural = naturalDli !== null && naturalLightTarget(environment, target) && archetype.dliMode !== 'supplement-only';
  const natural = targetGetsNatural
    ? naturalDli * archetype.coverTransmission
    : 0;
  const hasLight = ppfdUmol > 0 && photoperiodH > 0;
  if (naturalDli === null && archetype.dliMode !== 'supplement-only' && !hasLight) return null;
  return {
    value: Math.min(archetype.maxDliMol, natural + ppfdUmol * photoperiodH * 3600 / 1_000_000),
    supplementalOnly: naturalDli === null && archetype.dliMode !== 'supplement-only' && hasLight,
  };
}

type SetpointKey = keyof NonNullable<Environment['setpoints']>;
type SetpointDraft = Record<SetpointKey, string>;

const SETPOINT_FIELDS: Array<{
  key: SetpointKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'heatC', label: 'Heat target', unit: '°C', min: 0, max: 45, step: 0.5 },
  { key: 'coolC', label: 'Cooling target', unit: '°C', min: 0, max: 50, step: 0.5 },
  { key: 'rhMaxPct', label: 'RH maximum', unit: '%', min: 5, max: 100, step: 1 },
  { key: 'co2Ppm', label: 'CO₂ target', unit: 'ppm', min: 350, max: 1500, step: 10 },
  { key: 'photoperiodH', label: 'Photoperiod', unit: 'h/day', min: 0, max: 24, step: 1 },
];

function makeSetpointDraft(setpoints?: Environment['setpoints']): SetpointDraft {
  return {
    heatC: setpoints?.heatC?.toString() ?? '',
    coolC: setpoints?.coolC?.toString() ?? '',
    rhMaxPct: setpoints?.rhMaxPct?.toString() ?? '',
    co2Ppm: setpoints?.co2Ppm?.toString() ?? '',
    photoperiodH: setpoints?.photoperiodH?.toString() ?? '',
  };
}

function setpointAssumption(
  key: SetpointKey,
  environment: Environment,
  archetype: (typeof archetypes)[keyof typeof archetypes],
  equipmentPhotoperiodH: number,
  co2TargetPpm: number | null,
): string {
  if (key === 'photoperiodH') {
    const inherited = effectivePhotoperiodH({
      ...environment,
      setpoints: { ...environment.setpoints, photoperiodH: undefined },
    }, equipmentPhotoperiodH);
    return `${inherited.toFixed(0)} h/day inherited`;
  }
  if (key === 'co2Ppm') {
    return co2TargetPpm === null
      ? '420 ppm background; passive without a source'
      : `${co2TargetPpm.toFixed(0)} ppm from placed source`;
  }
  const value = archetype.setpoints?.[key];
  if (value === undefined) return 'No archetype target; passive';
  const unit = key === 'rhMaxPct' ? '%' : '°C';
  return `${value.toFixed(0)} ${unit} archetype assumption`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ThisRoomInspector({ editor }: { editor: PlanEditor }) {
  const environment = editor.environment!;
  const plan = editor.canonicalPlanRef.current ?? environment.plan;
  const archetype = archetypes[environment.archetype];
  const roomTerms = useMemo(() => ASSET_PHYSICS_ENABLED
    ? equipmentTermsFor(plan, archetype, environment)
    : null, [archetype, environment, plan]);
  const selectedTerms = useMemo(() => ASSET_PHYSICS_ENABLED
    ? equipmentTermsFor(plan, archetype, environment, editor.activeTarget)
    : null, [archetype, editor.activeTarget, environment, plan]);
  const { data: weather, isError } = useQuery({
    queryKey: ['growing-world-weather', editor.farm?.id],
    queryFn: () => apiFetch.getWeather(editor.farm!.id),
    enabled: !!editor.farm && ASSET_PHYSICS_ENABLED && ENV_CLIMATE_ENABLED,
    staleTime: 5 * 60 * 1000,
  });
  const [monthlyDli, setMonthlyDli] = useState<number[] | null>(null);
  const [setpointDraft, setSetpointDraft] = useState(() => makeSetpointDraft(environment.setpoints));
  const [savingSetpoints, setSavingSetpoints] = useState(false);
  useEffect(() => {
    setSetpointDraft(makeSetpointDraft(environment.setpoints));
  }, [environment.id, environment.setpoints]);
  useEffect(() => {
    if (!editor.farm || !ASSET_PHYSICS_ENABLED || !ENV_CLIMATE_ENABLED) {
      setMonthlyDli(null);
      return;
    }
    let cancelled = false;
    void fetchMonthlyDli(editor.farm.lat, editor.farm.lng).then((values) => {
      if (!cancelled) setMonthlyDli(values);
    });
    return () => { cancelled = true; };
  }, [editor.farm?.lat, editor.farm?.lng]);

  const estimate = useMemo(() => {
    if (!ASSET_PHYSICS_ENABLED || !ENV_CLIMATE_ENABLED || !roomTerms || !selectedTerms) return null;
    const natural = monthlyDli?.[new Date().getMonth()] ?? null;
    const photoperiodH = effectivePhotoperiodH(environment, selectedTerms.photoperiodH);
    const dli = targetDli(environment, editor.activeTarget, natural, selectedTerms.ppfdUmol, photoperiodH);
    const current = weather?.current;
    const climate = current ? environmentDay(environment, {
      tMinC: current.tempC,
      tMaxC: current.tempC,
      precipMm: current.precipMm,
      rhPct: current.humidity,
      ...(natural !== null ? { dliNaturalMol: natural } : {}),
    }, climateEquipment(roomTerms)) : null;
    return { roomTerms, dli, climate, natural };
  }, [editor.activeTarget, environment, monthlyDli, roomTerms, selectedTerms, weather?.current]);

  const rackLevels = environment.layout?.growingSpaces
    .filter((space) => space.kind === 'rack')
    .map((space) => space.levels.length) ?? [];
  const tiers = rackLevels.length > 0 ? (estimate?.roomTerms.tiers ?? Math.max(...rackLevels)) : null;
  const climate = estimate?.climate;
  const inheritedPhotoperiod = effectivePhotoperiodH({
    ...environment,
    setpoints: { ...environment.setpoints, photoperiodH: undefined },
  }, selectedTerms?.photoperiodH ?? 0);
  const inheritedCo2Target = roomTerms?.co2TargetPpm ?? null;

  const saveSetpoints = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: NonNullable<Environment['setpoints']> = {};
    for (const field of SETPOINT_FIELDS) {
      const raw = setpointDraft[field.key].trim();
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isFinite(value)) next[field.key] = value;
    }
    setSavingSetpoints(true);
    void editor.updateEnvironmentSetpoints(next)
      .then(() => toast.success('Room setpoints saved'))
      .catch((error) => toast.error((error as Error).message))
      .finally(() => setSavingSetpoints(false));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span>This room</span>
          {(ASSET_PHYSICS_ENABLED && ENV_CLIMATE_ENABLED) && <Badge variant="secondary" className="text-[9px]">Model estimate</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!ASSET_PHYSICS_ENABLED || !ENV_CLIMATE_ENABLED ? (
          <p className="text-xs text-muted-foreground">
            Live climate estimates are unavailable while asset physics or environment climate is off. Saved levels and equipment remain visible.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label={`DLI · ${editor.activeTargetLabel}`} value={estimate?.dli === null || estimate?.dli === undefined ? 'Unavailable' : `${estimate.dli.supplementalOnly ? '≥' : ''}${estimate.dli.value.toFixed(1)} mol/m²/day`} />
              <Metric label="VPD · current weather input" value={climate ? `${climate.vpdKPa.toFixed(2)} kPa` : 'Unavailable'} />
              <Metric label="CO₂ · modeled" value={climate ? `≈${Math.round(climate.co2Ppm)} ppm` : 'Unavailable'} />
              <Metric label="ACH · modeled today" value={climate ? (archetype.kind === 'open' ? 'Open air' : `${climate.ach.toFixed(1)} h⁻¹`) : 'Unavailable'} />
              <Metric label="Configured rack tiers" value={tiers === null ? 'None' : String(tiers)} />
              <Metric label="Installed lighting" value={`${estimate?.roomTerms.lightingW ?? 0} W`} />
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Uses current outdoor weather, the current month’s historical DLI and explicitly placed equipment. Indoor readings are not available; CO₂ background assumes 420 ppm. {weather?.cached ? 'Outdoor weather is cached. ' : ''}
              {estimate?.dli?.supplementalOnly && 'DLI shows the known supplemental-light lower bound because natural-light data is unavailable. '}
              {isError && 'Current outdoor weather is unavailable, so VPD, CO₂ and ACH are omitted.'}
            </p>
          </>
        )}
        {ENV_CLIMATE_ENABLED ? (
          <details className="rounded-md border border-border px-2 py-1.5">
            <summary className="cursor-pointer text-xs font-medium">Edit room setpoints</summary>
            <form className="mt-2 space-y-2" onSubmit={saveSetpoints}>
              <div className="grid grid-cols-2 gap-2">
                {SETPOINT_FIELDS.map((field) => {
                  const override = environment.setpoints?.[field.key];
                  const assumed = setpointAssumption(field.key, environment, archetype, inheritedPhotoperiod, inheritedCo2Target);
                  return (
                    <label key={field.key} className="space-y-1 text-[10px] text-muted-foreground">
                      <span className="block font-medium text-foreground">{field.label} ({field.unit})</span>
                      <Input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={setpointDraft[field.key]}
                        placeholder="Inherit"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSetpointDraft((current) => ({ ...current, [field.key]: value }));
                        }}
                        className="h-8"
                      />
                      <span className="block">
                        {override !== undefined ? `Override saved · ${override} ${field.unit}` : `Assumed: ${assumed}`}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Leave blank to clear an override and inherit the model assumption. Setpoints do not install equipment; modeled effects depend on placed capacity.
              </p>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={savingSetpoints}>
                {savingSetpoints ? 'Saving…' : 'Save setpoints'}
              </Button>
            </form>
          </details>
        ) : (
          <p className="rounded bg-muted px-2 py-1.5 text-[10px] text-muted-foreground">
            Setpoint editing is off while environment climate is disabled.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function GrowingSystemsPanel({ editor }: { editor: PlanEditor }) {
  const [removeId, setRemoveId] = useState<string | null>(null);
  const environment = editor.environment;
  if (!editor.featureEnabled || editor.scope.kind !== 'env' || !environment) return null;

  const plan = editor.canonicalPlanRef.current ?? environment.plan;
  const spaces = environment.layout?.growingSpaces ?? [];
  const removal = removeId ? editor.growingSpaceRemovalPreview(removeId) : null;
  const floorFootprint = environment.widthM * environment.heightM;
  const growingArea = growingSurfaceArea(environment, plan);
  const plantedArea = plantedAreaForPlan(plan);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Growing area</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Floor footprint" value={`${floorFootprint.toFixed(1)} m²`} />
            <Metric label="Growing surface" value={`${growingArea.toFixed(1)} m²`} />
            <Metric label="Planted" value={`${plantedArea.toFixed(1)} m²`} />
          </div>
          <p className="text-[10px] text-muted-foreground">Floor footprint counts once. Growing surface includes accessible floor area and each saved elevated level; planted area counts occupied cells across all levels.</p>
        </CardContent>
      </Card>

      <ThisRoomInspector editor={editor} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span>Growing systems</span>
            {!ASSET_PHYSICS_ENABLED && spaces.some((space) => space.kind === 'rack') && (
              <Badge variant="outline" className="text-[9px]">Tier editing off</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {spaces.length === 0 ? (
            <p className="text-xs text-muted-foreground">No growing systems placed. Add a bed, hydro surface or rack from Assets.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Choose a level to edit its separate crop map. Undo and redo follow the last edited target.</p>
              {!ASSET_PHYSICS_ENABLED && spaces.some((space) => space.kind === 'rack') && (
                <p role="status" className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  Existing rack levels are visible for inspection. Enable asset physics to paint levels or change rack equipment.
                </p>
              )}
              {spaces.map((space) => (
                <div key={space.id} className="rounded-md border border-border p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{space.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {space.widthM} × {space.depthM} m · {space.levels.length} level{space.levels.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{space.kind}</Badge>
                  </div>
                  <div className="space-y-1">
                    {space.levels.map((level) => {
                      const target = { kind: 'growing-level' as const, growingSpaceId: space.id, levelId: level.id };
                      const key = growingTargetKey(target);
                      const cells = Object.keys(plan.targets?.[key]?.planting ?? {}).length;
                      return (
                        <div key={level.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                          <button type="button" className="min-w-0 truncate text-left text-xs hover:underline" onClick={() => editor.selectTarget(key)}>
                            {level.label} · {level.elevationM.toFixed(2)} m
                          </button>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{cells} crop cells</span>
                        </div>
                      );
                    })}
                  </div>
                  {space.kind === 'rack' && (
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!ASSET_PHYSICS_ENABLED} onClick={() => setRemoveId(space.id)}>Remove rack</Button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeId !== null} onOpenChange={(open) => { if (!open) setRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {spaces.find((space) => space.id === removeId)?.label ?? 'growing system'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {removal?.cropCells ?? 0} planted crop cell{removal?.cropCells === 1 ? '' : 's'} and {removal?.equipment ?? 0} mounted item{removal?.equipment === 1 ? '' : 's'} from the saved world. Undo restores the rack and its levels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRemoveId(null)}>Keep rack</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (removeId) void editor.removeGrowingSpace(removeId).catch((error) => toast.error((error as Error).message));
              setRemoveId(null);
            }}>Remove rack</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
