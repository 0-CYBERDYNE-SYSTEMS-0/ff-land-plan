import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assetBySlug } from '@/data/assets';
import { templates, type GardenTemplate } from '@/data/templates';
import { archetypes, planningProfiles } from '@/creative/archetypes';
import { makeEnvironment } from '@/lib/environment-model';
import { layoutWithAccessOnEdge } from './layoutEditing';
import type { ArchetypeId, CreateEnvironmentInput, SiteEdge } from '@/types';

const ARCHETYPE_ORDER: ArchetypeId[] = [
  'open-field', 'garden-beds', 'greenhouse-glass', 'hoophouse', 'cold-frame',
  'grow-tent', 'grow-room', 'warehouse-vertical', 'container-farm',
];

const ICONS: Record<ArchetypeId, string> = {
  'open-field': '🌱',
  'garden-beds': '🪴',
  'greenhouse-glass': '🏡',
  hoophouse: '⛺',
  'cold-frame': '🪟',
  'grow-tent': '💡',
  'grow-room': '🌿',
  'warehouse-vertical': '🏭',
  'container-farm': '🚚',
};

function templateMinimum(tpl: GardenTemplate): { widthM: number; heightM: number } {
  let maxX = -1;
  let maxY = -1;
  for (const key of [...Object.keys(tpl.ground), ...Object.keys(tpl.planting)]) {
    const [x, y] = key.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const cellM = 0.25;
  return {
    widthM: Math.max(tpl.widthM ?? 0, (maxX + 1) * cellM),
    heightM: Math.max(tpl.heightM ?? 0, (maxY + 1) * cellM),
  };
}

function placedItems(tpl: GardenTemplate): string[] {
  const counts = new Map<string, number>();
  for (const slug of Object.values(tpl.ground)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, cells]) => {
      const asset = assetBySlug(slug);
      const area = (cells * 0.25 * 0.25).toFixed(2).replace(/\.00$/, '');
      return `${asset?.label ?? slug}: ${area} m² (${cells} cells)`;
    });
}

function plantedItems(tpl: GardenTemplate): string[] {
  const counts = new Map<string, number>();
  for (const crop of Object.values(tpl.planting)) counts.set(crop, (counts.get(crop) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([crop, cells]) => `${crop}: ${cells} cells`);
}

function WorldPreview({ id, previewAssetId }: { id: ArchetypeId; previewAssetId: string }) {
  const background = id === 'open-field' || id === 'garden-beds' ? '#dce9d2' : '#e7ece8';
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border bg-muted/30" data-preview-asset-id={previewAssetId} aria-label={`${archetypes[id].label} preview`}>
      <svg viewBox="0 0 240 76" className="block h-16 w-full" role="img" aria-hidden="true">
        <rect width="240" height="76" fill={background} />
        <path d="M0 62H240" stroke="#596b52" strokeOpacity=".25" strokeWidth="2" />
        {id === 'open-field' && <>
          {[14, 28, 42, 56].map((y) => <g key={y}><path d={`M8 ${y}H232`} stroke="#8a704e" strokeWidth="8" /><path d={`M10 ${y - 6}H230`} stroke="#62814e" strokeWidth="2" /></g>)}
          {[30, 75, 120, 165, 210].map((x) => <circle key={x} cx={x} cy="11" r="3" fill="#4f7b41" />)}
        </>}
        {id === 'garden-beds' && <>
          {[22, 42].map((y) => <g key={y}><rect x="28" y={y} width="184" height="9" rx="2" fill="#795d42" /><path d={`M32 ${y + 3}H208`} stroke="#6f9a4d" strokeWidth="3" /></g>)}
          <path d="M20 17V60M220 17V60" stroke="#b89d78" strokeWidth="3" strokeDasharray="3 3" />
        </>}
        {id === 'greenhouse-glass' && <>
          <path d="M25 62V28L120 8L215 28V62" fill="#a6c9ca" fillOpacity=".4" stroke="#526d6d" strokeWidth="3" />
          <path d="M25 28H215M120 8V62M48 49H98M142 49H192" stroke="#698275" strokeWidth="2" />
          <path d="M45 58H105M135 58H195" stroke="#765f42" strokeWidth="6" />
        </>}
        {id === 'hoophouse' && <>
          <path d="M20 62V44C20 20 64 10 120 10S220 20 220 44V62" fill="#b9d4d0" fillOpacity=".4" stroke="#536f68" strokeWidth="4" />
          <path d="M53 62V31M96 62V14M144 62V14M187 62V31" stroke="#78938c" strokeWidth="2" />
          <path d="M38 54H202" stroke="#765f42" strokeWidth="7" />
        </>}
        {id === 'cold-frame' && <>
          <path d="M46 61V42L183 25L196 61Z" fill="#b8d4dd" fillOpacity=".8" stroke="#637d82" strokeWidth="3" />
          <path d="M63 55H180M79 48L180 35" stroke="#688453" strokeWidth="3" />
        </>}
        {id === 'grow-tent' && <>
          <path d="M68 62V19H172V62" fill="#42444f" stroke="#747783" strokeWidth="4" />
          <path d="M80 26H160" stroke="#ffe59a" strokeWidth="5" />
          <path d="M92 54V39M120 54V34M148 54V40" stroke="#82a960" strokeWidth="7" />
          <path d="M76 63H164" stroke="#8b8c96" strokeWidth="3" />
        </>}
        {id === 'grow-room' && <>
          <path d="M38 62V17H202V62" fill="#cbd0d1" stroke="#626a70" strokeWidth="3" />
          <path d="M51 34H189M51 49H189" stroke="#717a80" strokeWidth="3" />
          {[66, 105, 144, 180].map((x) => <path key={x} d={`M${x} 31V24M${x} 46V39M${x} 61V53`} stroke="#6d9655" strokeWidth="7" />)}
        </>}
        {id === 'warehouse-vertical' && <>
          <path d="M20 62V19L120 6L220 19V62" fill="#c5c9cc" stroke="#555d65" strokeWidth="3" />
          {[38, 64, 90, 150, 176, 202].map((x) => <path key={x} d={`M${x} 58V25M${x} 34H${x + 10}M${x} 45H${x + 10}M${x} 56H${x + 10}`} stroke="#66737c" strokeWidth="3" />)}
          <path d="M120 24V62" stroke="#f4c76f" strokeWidth="9" strokeOpacity=".7" />
        </>}
        {id === 'container-farm' && <>
          <rect x="28" y="24" width="184" height="38" rx="4" fill="#89939a" stroke="#4f5961" strokeWidth="3" />
          {[42, 60, 78, 96, 114, 132, 150, 168, 186, 204].map((x) => <path key={x} d={`M${x} 27V59`} stroke="#65717a" strokeWidth="2" />)}
          <path d="M43 50H183" stroke="#a4bd89" strokeWidth="5" />
          <rect x="29" y="28" width="12" height="30" fill="#6d777e" />
        </>}
      </svg>
    </div>
  );
}

export interface GrowingWorldSetupProps {
  farmId: number;
  onCreate: (input: CreateEnvironmentInput, template?: GardenTemplate) => Promise<void>;
  onCancel?: () => void;
  creating?: boolean;
  initialArchetype?: ArchetypeId;
}

export function GrowingWorldSetup({ farmId, onCreate, onCancel, creating = false, initialArchetype = 'open-field' }: GrowingWorldSetupProps) {
  const [archetypeId, setArchetypeId] = useState<ArchetypeId>(initialArchetype);
  const [label, setLabel] = useState(archetypes[initialArchetype].label);
  const [widthM, setWidthM] = useState(archetypes[initialArchetype].defaultFootprint.wM);
  const [heightM, setHeightM] = useState(archetypes[initialArchetype].defaultFootprint.hM);
  const [usableHeightM, setUsableHeightM] = useState(archetypes[initialArchetype].defaultUsableHeightM ?? 2.4);
  const [accessEdge, setAccessEdge] = useState<SiteEdge>(planningProfiles[archetypes[initialArchetype].planningProfile].accessDefaults[0]?.edge ?? 'south');
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const archetype = archetypes[archetypeId];
  const profile = planningProfiles[archetype.planningProfile];
  const setupWidthM = Math.round(widthM / 0.25) * 0.25;
  const setupDepthM = Math.round(heightM / 0.25) * 0.25;
  const compatibleTemplates = useMemo(
    () => profile.compatibleTemplates
      .map((id) => templates.find((tpl) => tpl.id === id))
      .filter((tpl): tpl is GardenTemplate => tpl !== undefined)
      .filter((tpl) => archetype.tierPlanningAvailable || !Object.values(tpl.ground).includes('plant-rack')),
    [archetype.tierPlanningAvailable, profile.compatibleTemplates],
  );
  const template = compatibleTemplates.find((item) => item.id === templateId);
  const min = template ? templateMinimum(template) : { widthM: 0, heightM: 0 };
  const templateFits = !template || (setupWidthM >= min.widthM && setupDepthM >= min.heightM);
  const defaultAccessEdge = profile.accessDefaults[0]?.edge;
  const setupPreview = useMemo(() => makeEnvironment(farmId, {
    archetype: archetypeId,
    widthM: setupWidthM,
    heightM: setupDepthM,
    ...(archetype.shell !== 'none' ? { usableHeightM } : {}),
    cellM: 0.25,
  }, 'setup-preview'), [archetype.shell, archetypeId, farmId, setupDepthM, setupWidthM, usableHeightM]);
  const selectedAccessLayout = layoutWithAccessOnEdge(setupPreview, accessEdge);
  const selectedAccess = selectedAccessLayout?.access[0];

  useEffect(() => {
    setLabel(archetypes[archetypeId].label);
    setWidthM(archetypes[archetypeId].defaultFootprint.wM);
    setHeightM(archetypes[archetypeId].defaultFootprint.hM);
    setUsableHeightM(archetypes[archetypeId].defaultUsableHeightM ?? 2.4);
    setAccessEdge(planningProfiles[archetypes[archetypeId].planningProfile].accessDefaults[0]?.edge ?? 'south');
    setTemplateId('');
    setError(null);
  }, [archetypeId]);

  const create = async () => {
    if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM < 0.5 || heightM < 0.5 || widthM > 60 || heightM > 60) {
      setError('Enter usable width and depth from 0.5 m to 60 m.');
      return;
    }
    if (archetype.shell !== 'none' && (!Number.isFinite(usableHeightM) || usableHeightM < 0.25 || usableHeightM > 20)) {
      setError('Enter usable interior height from 0.25 m to 20 m.');
      return;
    }
    if (!templateFits) {
      setError(`“${template?.name}” needs at least ${min.widthM.toFixed(2)} m × ${min.heightM.toFixed(2)} m to fit.`);
      return;
    }
    setError(null);
    try {
      const input: CreateEnvironmentInput = {
        archetype: archetypeId,
        label: label.trim() || archetype.label,
        widthM: setupWidthM,
        heightM: setupDepthM,
        ...(archetype.shell !== 'none' ? { usableHeightM } : {}),
        cellM: 0.25,
      };
      if (defaultAccessEdge && accessEdge !== defaultAccessEdge && selectedAccessLayout) input.layout = selectedAccessLayout;
      await onCreate(input, template);
    } catch (e) {
      setError((e as Error).message || 'Could not create this growing world.');
    }
  };

  return (
    <Card className="border-primary/40 shadow-sm" data-testid="growing-world-setup">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Choose your growing world</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Pick a place first, then set its usable floor size.</p>
          </div>
          {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ARCHETYPE_ORDER.map((id) => {
            const item = archetypes[id];
            const selected = archetypeId === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setArchetypeId(id)}
                className={`rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/60'}`}
              >
                <WorldPreview id={id} previewAssetId={item.previewAssetId} />
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-xl" aria-hidden="true">{ICONS[id]}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.kind}</span>
                </div>
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block min-h-9 text-xs leading-snug text-muted-foreground">{item.purpose}</span>
                <span className="mt-2 block text-[10px] text-muted-foreground">
                  {planningProfiles[item.planningProfile].supportedSystems.join(' · ').replaceAll('-', ' ')}
                </span>
                {!item.tierPlanningAvailable && (id === 'warehouse-vertical' || id === 'container-farm') && (
                  <span className="mt-2 block rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
                    Tier planning unavailable. This setup plans its floor only.
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="world-name" className="text-xs">World name</Label>
            <Input id="world-name" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="world-width" className="text-xs">Usable floor width (m)</Label>
            <Input id="world-width" type="number" min="0.5" max="60" step="0.25" value={widthM} onChange={(e) => setWidthM(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="world-depth" className="text-xs">Usable floor depth (m)</Label>
            <Input id="world-depth" type="number" min="0.5" max="60" step="0.25" value={heightM} onChange={(e) => setHeightM(Number(e.target.value))} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Growing system</Label>
            <div className="min-h-9 rounded-md border border-input bg-background px-3 py-2 text-xs">
              {profile.supportedSystems.map((system) => system.replaceAll('-', ' ')).join(' · ')}
            </div>
          </div>
          {archetype.shell !== 'none' && (
            <div className="space-y-1">
              <Label htmlFor="world-height" className="text-xs">Usable interior height (m)</Label>
              <Input id="world-height" type="number" min="0.25" max="20" step="0.25" value={usableHeightM} onChange={(e) => setUsableHeightM(Number(e.target.value))} className="h-9" />
              <p className="text-[10px] text-muted-foreground">Default is a labelled model assumption; adjust it to match your space.</p>
            </div>
          )}
          {selectedAccess && (
            <div className="space-y-1">
              <Label className="text-xs">Access opening</Label>
              <Select value={accessEdge} onValueChange={(edge) => setAccessEdge(edge as SiteEdge)}>
                <SelectTrigger className="h-9 text-xs" aria-label="Access opening edge"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['north', 'east', 'south', 'west'] as SiteEdge[]).map((edge) => (
                    <SelectItem key={edge} value={edge}>{edge[0]!.toUpperCase() + edge.slice(1)} edge</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {selectedAccess.widthM.toFixed(2)} m opening, {selectedAccess.offsetM.toFixed(2)} m from the {accessEdge === 'north' || accessEdge === 'south' ? 'west' : 'north'} end; its profile reservation moves with it.
              </p>
            </div>
          )}
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">Starter layout</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={templateId === '' ? 'secondary' : 'outline'} onClick={() => setTemplateId('')}>Start empty</Button>
              {compatibleTemplates.map((item) => (
                <Button key={item.id} type="button" size="sm" variant={templateId === item.id ? 'secondary' : 'outline'} onClick={() => setTemplateId(item.id)}>
                  {item.name}
                </Button>
              ))}
              {compatibleTemplates.length === 0 && <span className="self-center text-xs text-muted-foreground">No compatible starter layout is available yet.</span>}
            </div>
          </div>
        </div>

        {template && (
          <div className="rounded-lg border border-border p-3" aria-live="polite">
            <div className="text-sm font-medium">{template.name}</div>
            <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Placed layout elements</div>
                <ul className="space-y-0.5 text-xs">
                  {placedItems(template).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Crops</div>
                <ul className="space-y-0.5 text-xs">
                  {plantedItems(template).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            {!templateFits && <p className="mt-2 text-xs font-medium text-destructive">Increase dimensions to at least {min.widthM.toFixed(2)} m × {min.heightM.toFixed(2)} m. Nothing will be clipped.</p>}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Dimensions are usable interior floor area. Equipment is placed only when it is listed in the selected starter layout; the world preview does not install gear.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button onClick={() => void create()} disabled={creating || !templateFits}>
            {creating ? 'Creating…' : template ? `Create with ${template.name}` : 'Create growing world'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
