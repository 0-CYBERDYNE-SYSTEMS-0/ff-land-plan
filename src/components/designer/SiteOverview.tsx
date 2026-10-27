import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assetBySlug } from '@/data/assets';
import { archetypes, LEGACY_SURFACE_FOR_ARCHETYPE } from '@/creative/archetypes';
import { layoutWithAccessOnEdge, layoutWithinBounds } from './layoutEditing';
import type { ArchetypeId, Environment, SiteEdge, SitePlan } from '@/types';

interface Position { x: number; y: number }
interface Drag { id: string; startX: number; startY: number; origin: Position; moved: boolean; position?: Position }

export interface SiteOverviewProps {
  site: SitePlan | null;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  runCounts?: Record<string, number>;
  onAddWorld: (archetype?: ArchetypeId) => void;
  onEnterWorld: (environmentId: string) => void;
  onMoveWorld: (environmentId: string, x: number, y: number) => Promise<void>;
  onSaveWorld: (environment: Environment) => Promise<void>;
  onDuplicateWorld: (environmentId: string) => Promise<void>;
  onDeleteWorld: (environmentId: string) => Promise<void>;
}

function cropCellCount(environment: Environment) {
  return Object.keys(environment.plan.planting).length + Object.values(environment.plan.targets ?? {})
    .reduce((total, target) => total + Object.keys(target.planting).length, 0);
}

function floorCellsOutside(environment: Environment, widthM: number, heightM: number, layout = environment.layout) {
  const cols = Math.round(widthM / environment.cellM);
  const rows = Math.round(heightM / environment.cellM);
  const outside = (key: string) => {
    const [x, y] = key.split(',').map(Number);
    return !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= cols || y >= rows;
  };
  let crops = Object.keys(environment.plan.planting).filter(outside).length;
  for (const target of Object.values(environment.plan.targets ?? {})) {
    const space = layout?.growingSpaces.find((entry) => entry.id === target.growingSpaceId);
    if (!space || !space.levels.some((level) => level.id === target.levelId)) {
      crops += Object.keys(target.planting).length;
      continue;
    }
    for (const cell of Object.keys(target.planting)) {
      const [x, y] = cell.split(',').map(Number);
      const x0 = x * environment.cellM;
      const y0 = y * environment.cellM;
      if (outside(cell) || !Number.isFinite(x) || !Number.isFinite(y) ||
          x0 < space.x || y0 < space.y || x0 + environment.cellM > space.x + space.widthM || y0 + environment.cellM > space.y + space.depthM) crops += 1;
    }
  }
  const ground = Object.keys(environment.plan.ground).filter(outside).length;
  const equipment = (environment.instances ?? []).filter((instance) => {
    const mount = instance.mount;
    return instance.x + instance.widthM > widthM || instance.y + instance.depthM > heightM ||
      (mount.kind === 'growing-level' && !layout?.growingSpaces.some((space) =>
        space.id === mount.growingSpaceId && space.levels.some((level) => level.id === mount.levelId),
      ));
  }).length;
  return { crops, ground, equipment };
}

function snappedDimension(value: number, cellM: number): number {
  return Math.max(cellM, Math.round(value / cellM) * cellM);
}

function contentInReservations(environment: Environment): { crops: number; ground: number; equipment: number } {
  const layout = environment.layout;
  if (!layout) return { crops: 0, ground: 0, equipment: 0 };
  const cellReserved = (key: string) => {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const x0 = x * environment.cellM;
    const y0 = y * environment.cellM;
    const x1 = x0 + environment.cellM;
    const y1 = y0 + environment.cellM;
    if (layout.reservations.some((r) => x0 < r.x + r.widthM && x1 > r.x && y0 < r.y + r.depthM && y1 > r.y)) return true;
    const strip = environment.cellM;
    return layout.access.some((a) =>
      a.edge === 'north' ? y0 < strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM
        : a.edge === 'south' ? y1 > environment.heightM - strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM
          : a.edge === 'west' ? x0 < strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM
            : x1 > environment.widthM - strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM,
    );
  };
  const instanceReserved = (item: NonNullable<Environment['instances']>[number]) => {
    if (item.mount.kind !== 'floor') return false;
    const x0 = item.x;
    const y0 = item.y;
    const x1 = x0 + item.widthM;
    const y1 = y0 + item.depthM;
    if (layout.reservations.some((r) => x0 < r.x + r.widthM && x1 > r.x && y0 < r.y + r.depthM && y1 > r.y)) return true;
    const strip = environment.cellM;
    return layout.access.some((a) =>
      a.edge === 'north' ? y0 < strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM
        : a.edge === 'south' ? y1 > environment.heightM - strip && x0 < a.offsetM + a.widthM && x1 > a.offsetM
          : a.edge === 'west' ? x0 < strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM
            : x1 > environment.widthM - strip && y0 < a.offsetM + a.widthM && y1 > a.offsetM,
    );
  };
  return {
    crops: Object.keys(environment.plan.planting).filter(cellReserved).length,
    ground: Object.keys(environment.plan.ground).filter(cellReserved).length,
    equipment: (environment.instances ?? []).filter(instanceReserved).length,
  };
}

function incompatibleGroundCells(environment: Environment, archetypeId: ArchetypeId): number {
  const archetype = archetypes[archetypeId];
  return Object.values(environment.plan.ground).filter((slug) => {
    const asset = assetBySlug(slug);
    return !asset || !archetype.palette.includes(asset.category) ||
      !!asset.surfaces && !asset.surfaces.includes(LEGACY_SURFACE_FOR_ARCHETYPE[archetypeId]);
  }).length;
}

function overlaps(a: Environment, b: Environment) {
  return a.x < b.x + b.widthM && a.x + a.widthM > b.x &&
    a.y < b.y + b.heightM && a.y + a.heightM > b.y;
}

export function SiteOverview({
  site,
  environments,
  selectedEnvironmentId,
  runCounts = {},
  onAddWorld,
  onEnterWorld,
  onMoveWorld,
  onSaveWorld,
  onDuplicateWorld,
  onDeleteWorld,
}: SiteOverviewProps) {
  const dragRef = useRef<Drag | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, Position>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = environments.find((env) => env.id === editingId) ?? null;
  const deleting = environments.find((env) => env.id === deleteId) ?? null;
  const [editLabel, setEditLabel] = useState('');
  const [editWidth, setEditWidth] = useState(0);
  const [editDepth, setEditDepth] = useState(0);
  const [editUsableHeight, setEditUsableHeight] = useState(2.4);
  const [editArchetype, setEditArchetype] = useState<ArchetypeId>('open-field');
  const [editAccessEdge, setEditAccessEdge] = useState<SiteEdge>('south');
  const [confirmResize, setConfirmResize] = useState(false);
  const dimensionsValid = !!editing && Number.isFinite(editWidth) && Number.isFinite(editDepth) &&
    editWidth >= 0.5 && editDepth >= 0.5 && editWidth <= 60 && editDepth <= 60;
  const previewWidth = editing && dimensionsValid ? snappedDimension(editWidth, editing.cellM) : editing?.widthM ?? 0;
  const previewDepth = editing && dimensionsValid ? snappedDimension(editDepth, editing.cellM) : editing?.heightM ?? 0;
  const previewLayout = editing
    ? layoutWithinBounds(layoutWithAccessOnEdge({ ...editing, widthM: previewWidth, heightM: previewDepth }, editAccessEdge), previewWidth, previewDepth)
    : undefined;
  const previewEnvironment = editing
    ? { ...editing, widthM: previewWidth, heightM: previewDepth, layout: previewLayout }
    : null;
  const accessEdgeChanged = !!editing?.layout?.access.length && editAccessEdge !== editing.layout.access[0]?.edge;
  const layoutChanged = !!editing && (previewWidth !== editing.widthM || previewDepth !== editing.heightM || accessEdgeChanged);
  const outside = editing ? floorCellsOutside(editing, previewWidth, previewDepth, previewLayout) : { crops: 0, ground: 0, equipment: 0 };
  const newlyReserved = layoutChanged && previewEnvironment ? contentInReservations(previewEnvironment) : { crops: 0, ground: 0, equipment: 0 };
  const affected = {
    crops: outside.crops + newlyReserved.crops,
    ground: outside.ground + newlyReserved.ground,
    equipment: outside.equipment + newlyReserved.equipment,
  };
  const typeChanged = !!editing && editArchetype !== editing.archetype;
  const incompatibleCells = editing && typeChanged ? incompatibleGroundCells(editing, editArchetype) : 0;

  const bounds = useMemo(() => {
    const right = Math.max(1, ...environments.map((env) => env.x + env.widthM));
    const bottom = Math.max(1, ...environments.map((env) => env.y + env.heightM));
    return {
      width: Math.max(site?.widthM ?? 0, right, 12),
      height: Math.max(site?.heightM ?? 0, bottom, 8),
    };
  }, [environments, site?.heightM, site?.widthM]);

  const collisions = useMemo(() => {
    const pairs: Array<[Environment, Environment]> = [];
    for (let i = 0; i < environments.length; i++) {
      for (let j = i + 1; j < environments.length; j++) {
        if (overlaps(environments[i]!, environments[j]!)) pairs.push([environments[i]!, environments[j]!]);
      }
    }
    return pairs;
  }, [environments]);

  const startDrag = (event: PointerEvent<SVGGElement>, environment: Environment) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: environment.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: environment.x, y: environment.y },
      moved: false,
    };
  };

  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * bounds.width;
    const dy = ((event.clientY - drag.startY) / rect.height) * bounds.height;
    if (Math.abs(dx) + Math.abs(dy) > 0.15) drag.moved = true;
    if (!drag.moved) return;
    drag.position = {
      x: Math.max(0, Math.round((drag.origin.x + dx) * 4) / 4),
      y: Math.max(0, Math.round((drag.origin.y + dy) * 4) / 4),
    };
    setDragPositions((positions) => ({ ...positions, [drag.id]: drag.position! }));
  };

  const finishDrag = async () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const position = drag.position;
    setDragPositions((positions) => {
      const next = { ...positions };
      delete next[drag.id];
      return next;
    });
    if (!drag.moved || !position) {
      onEnterWorld(drag.id);
      return;
    }
    setBusy(true);
    try {
      await onMoveWorld(drag.id, position.x, position.y);
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (environment: Environment) => {
    setEditingId(environment.id);
    setEditLabel(environment.label);
    setEditWidth(environment.widthM);
    setEditDepth(environment.heightM);
    setEditUsableHeight(environment.layout?.usableHeightM ?? archetypes[environment.archetype].defaultUsableHeightM ?? 2.4);
    setEditArchetype(environment.archetype);
    setEditAccessEdge(environment.layout?.access[0]?.edge ?? 'south');
    setConfirmResize(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (typeChanged) {
      onAddWorld(editArchetype);
      setEditingId(null);
      setConfirmResize(false);
      return;
    }
    if (!dimensionsValid || (editing.layout?.usableHeightM !== undefined &&
      (!Number.isFinite(editUsableHeight) || editUsableHeight < 0.25 || editUsableHeight > 20))) return;
    if (affected.crops + affected.ground + affected.equipment > 0 && !confirmResize) {
      setConfirmResize(true);
      return;
    }
    setBusy(true);
    try {
      await onSaveWorld({
        ...editing,
        label: editLabel.trim() || archetypes[editing.archetype].label,
        widthM: previewWidth,
        heightM: previewDepth,
        layout: previewLayout ? { ...previewLayout, ...(editing.layout?.usableHeightM !== undefined ? { usableHeightM: editUsableHeight } : {}) } : undefined,
      });
      setEditingId(null);
      setConfirmResize(false);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await onDeleteWorld(deleting.id);
      setDeleteId(null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4" data-testid="site-scope">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Site overview</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Drag a world to move its site footprint. Click a world to plan inside it.</p>
          </div>
          <Button size="sm" onClick={() => onAddWorld()}>Add growing world</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {environments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <div className="text-sm font-medium">No growing worlds yet</div>
              <p className="mt-1 text-xs text-muted-foreground">Choose a field, garden, greenhouse or other place to start planning.</p>
              <Button className="mt-4" onClick={() => onAddWorld()}>Create your first growing world</Button>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                <svg
                  viewBox={`0 0 ${bounds.width} ${bounds.height}`}
                  className="block max-h-[58dvh] min-h-[280px] w-full touch-none"
                  role="img"
                  aria-label="Site plan showing draggable growing world footprints"
                  onPointerMove={moveDrag}
                  onPointerUp={() => void finishDrag()}
                  onPointerCancel={() => void finishDrag()}
                >
                  <defs>
                    <pattern id="site-grid" width="1" height="1" patternUnits="userSpaceOnUse">
                      <path d="M 1 0 L 0 0 0 1" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth=".025" />
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width={bounds.width} height={bounds.height} fill="url(#site-grid)" />
                  {environments.map((environment) => {
                    const archetype = archetypes[environment.archetype];
                    const position = dragPositions[environment.id] ?? environment;
                    const selected = selectedEnvironmentId === environment.id;
                    const fill = archetype.kind === 'open' ? '#86a76b' : archetype.kind === 'protected' ? '#83b3a6' : '#7c8795';
                    return (
                      <g
                        key={environment.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${environment.label}, ${archetype.label}, ${environment.widthM} by ${environment.heightM} metres`}
                        onPointerDown={(event) => startDrag(event, environment)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEnterWorld(environment.id); } }}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <rect
                          x={position.x}
                          y={position.y}
                          width={environment.widthM}
                          height={environment.heightM}
                          rx=".12"
                          fill={fill}
                          fillOpacity={selected ? '.52' : '.35'}
                          stroke={selected ? '#2563eb' : '#334155'}
                          strokeWidth={selected ? '.12' : '.06'}
                        />
                        {environment.layout?.reservations.map((reservation) => (
                          <rect
                            key={reservation.id}
                            x={position.x + reservation.x}
                            y={position.y + reservation.y}
                            width={reservation.widthM}
                            height={reservation.depthM}
                            fill="#f59e0b"
                            fillOpacity=".25"
                            stroke="#b45309"
                            strokeOpacity=".65"
                            strokeDasharray=".16 .1"
                            strokeWidth=".035"
                          />
                        ))}
                        {environment.layout?.access.map((access) => {
                          const horizontal = access.edge === 'north' || access.edge === 'south';
                          const x = horizontal ? position.x + access.offsetM : position.x + (access.edge === 'east' ? environment.widthM : 0);
                          const y = horizontal ? position.y + (access.edge === 'south' ? environment.heightM : 0) : position.y + access.offsetM;
                          return <line key={access.id} x1={x} y1={y} x2={x + (horizontal ? access.widthM : 0)} y2={y + (horizontal ? 0 : access.widthM)} stroke="#dc2626" strokeWidth=".18" />;
                        })}
                        <text x={position.x + .2} y={position.y + .45} fontSize=".32" fontWeight="600" fill="#111827" pointerEvents="none">{environment.label}</text>
                        <text x={position.x + .2} y={position.y + .82} fontSize=".22" fill="#1f2937" pointerEvents="none">{environment.widthM} × {environment.heightM} m · {archetype.kind}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span className="rounded border border-border px-2 py-1">Dashed amber: aisle/service reservation</span>
                <span className="rounded border border-border px-2 py-1">Red edge: access opening</span>
                {collisions.length > 0 && <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-300">{collisions.length} overlapping footprint{collisions.length === 1 ? '' : 's'} — they remain separate worlds.</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {collisions.length > 0 && (
        <div className="rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200" role="status">
          Overlapping site footprints do not merge climate or plans. Move a world if the overlap is unintended.
        </div>
      )}

      {environments.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Growing worlds</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {environments.map((environment) => {
              const archetype = archetypes[environment.archetype];
              const selected = selectedEnvironmentId === environment.id;
              return (
                <div key={environment.id} className={`rounded-md border p-3 ${selected ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEnterWorld(environment.id)}>
                      <span className="block truncate text-sm font-medium">{environment.label}</span>
                      <span className="block text-xs text-muted-foreground">{archetype.label} · {environment.widthM} × {environment.heightM} m</span>
                    </button>
                    <Badge variant="outline" className="text-[10px]">{archetype.kind}</Badge>
                    {runCounts[environment.id] ? <Badge variant="secondary" className="text-[10px]">{runCounts[environment.id]} saved run{runCounts[environment.id] === 1 ? '' : 's'}</Badge> : null}
                    <Button size="sm" variant="outline" className="h-7" onClick={() => beginEdit(environment)}>Edit</Button>
                    <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void onDuplicateWorld(environment.id)}>Duplicate</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setDeleteId(environment.id)}>Delete</Button>
                  </div>
                  {editingId === environment.id && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="max-w-sm space-y-1">
                        <Label className="text-xs">World type</Label>
                        <Select value={editArchetype} onValueChange={(value) => setEditArchetype(value as ArchetypeId)}>
                          <SelectTrigger className="h-8 text-xs" aria-label="World type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.values(archetypes).map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {typeChanged ? (
                        <>
                          <div className="rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-xs" role="status">
                            <p className="font-medium">Changing type starts a separate world; this world stays unchanged.</p>
                            <p className="mt-1">This world keeps {cropCellCount(environment)} crop cells across its floor and growing levels, {Object.keys(environment.plan.ground).length} ground cells and {environment.instances?.length ?? 0} equipment instances. {incompatibleCells} ground cells use assets unavailable in {archetypes[editArchetype].label}. The new world will use its profile dimensions and access layout; content will not move.</p>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setConfirmResize(false); }}>Cancel</Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveEdit()}>Set up separate {archetypes[editArchetype].label}</Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8" /></div>
                            <div className="space-y-1"><Label className="text-xs">Usable width (m)</Label><Input type="number" min="0.5" max="60" step={environment.cellM} value={editWidth} onChange={(e) => setEditWidth(Number(e.target.value))} className="h-8" /></div>
                            <div className="space-y-1"><Label className="text-xs">Usable depth (m)</Label><Input type="number" min="0.5" max="60" step={environment.cellM} value={editDepth} onChange={(e) => setEditDepth(Number(e.target.value))} className="h-8" /></div>
                            {environment.layout?.usableHeightM !== undefined && (
                              <div className="space-y-1"><Label className="text-xs">Usable interior height (m)</Label><Input type="number" min="0.25" max="20" step="0.25" value={editUsableHeight} onChange={(e) => setEditUsableHeight(Number(e.target.value))} className="h-8" /></div>
                            )}
                            {!!environment.layout?.access.length && (
                              <div className="space-y-1">
                                <Label className="text-xs">Access opening edge</Label>
                                <Select value={editAccessEdge} onValueChange={(value) => { setEditAccessEdge(value as SiteEdge); setConfirmResize(false); }}>
                                  <SelectTrigger className="h-8 text-xs" aria-label="Access opening edge"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(['north', 'east', 'south', 'west'] as SiteEdge[]).map((edge) => <SelectItem key={edge} value={edge}>{edge[0]!.toUpperCase() + edge.slice(1)} edge</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          {(!dimensionsValid || (environment.layout?.usableHeightM !== undefined && (!Number.isFinite(editUsableHeight) || editUsableHeight < 0.25 || editUsableHeight > 20))) && (
                            <p className="text-xs text-destructive" role="alert">Use width and depth from 0.5–60 m, and interior height from 0.25–20 m. Dimensions snap to {environment.cellM} m cells.</p>
                          )}
                          {confirmResize && (
                            <div className="rounded-md border border-amber-600/40 bg-amber-500/10 p-2 text-xs" role="alert">
                              This change removes {affected.crops} crop cells, {affected.ground} ground cells and {affected.equipment} equipment footprints outside the new bounds or in the updated access reservation. Apply together as one undoable change?
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setConfirmResize(false); }}>Cancel</Button>
                            <Button size="sm" onClick={() => void saveEdit()} disabled={busy || !dimensionsValid || (environment.layout?.usableHeightM !== undefined && (!Number.isFinite(editUsableHeight) || editUsableHeight < 0.25 || editUsableHeight > 20))}>Save world</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the world from the current site. {runCounts[deleting?.id ?? ''] ?? 0} saved run(s) keep their frozen replay context and are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep world</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} disabled={busy}>Delete world</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
