import { useMemo, useState } from 'react';
import { Map as MapIcon, Search } from 'lucide-react';

import { assetBySlug, assetLibrary } from '@/data/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AssetCategory, GardenAsset } from '@/types';
import type { PlanEditor } from './usePlanEditor';

// Recently-used ring: last 6 selections, persisted as a JSON array of slugs.
// Slugs that no longer exist in the library drop out of the ring gracefully.
const RECENT_ASSETS_KEY = 'ff-pro:recent-assets';
const RECENT_CAP = 6;

function loadRecentAssetSlugs(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ASSETS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string').slice(0, RECENT_CAP)
      : [];
  } catch {
    return [];
  }
}

const ASSET_CATEGORIES: AssetCategory[] = ['growing', 'equipment', 'infrastructure', 'life'];

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  growing: 'Growing',
  equipment: 'Equipment (indoor)',
  infrastructure: 'Infrastructure',
  life: 'Life',
};

export function AssetPalette({ editor }: { editor: PlanEditor }) {
  const { activeAssetSlug, setActiveAssetSlug, tool, setTool, surface } = editor;
  const [assetSearch, setAssetSearch] = useState('');
  const [recentSlugs, setRecentSlugs] = useState<string[]>(loadRecentAssetSlugs);

  const selectAsset = (slug: string) => {
    setActiveAssetSlug(slug);
    if (tool !== 'rect') setTool('asset');
    // Dedupe + most-recent-first, capped at 6, mirrored to localStorage.
    const next = [slug, ...recentSlugs.filter((value) => value !== slug)].slice(0, RECENT_CAP);
    setRecentSlugs(next);
    try {
      localStorage.setItem(RECENT_ASSETS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — ring still works for the session.
    }
  };

  const query = assetSearch.trim().toLowerCase();
  const filteredAssets = useMemo(() => {
    // Surface-aware palette: assets tagged with `surfaces` only appear when the
    // plan canvas matches (e.g. grow lights on tent/indoor/greenhouse).
    const onSurface = assetLibrary.filter(
      (asset) => !asset.surfaces || asset.surfaces.includes(surface),
    );
    if (!query) return onSurface;
    return onSurface.filter((asset) =>
      asset.label.toLowerCase().includes(query) ||
      asset.slug.toLowerCase().includes(query) ||
      asset.description.toLowerCase().includes(query),
    );
  }, [query, surface]);

  const recentAssets = recentSlugs
    .map((slug) => assetBySlug(slug))
    .filter((asset): asset is GardenAsset => !!asset && (!asset.surfaces || asset.surfaces.includes(surface)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapIcon className="w-4 h-4" /> Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentAssets.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
            <div className="flex flex-wrap gap-1">
              {recentAssets.map((asset) => (
                <button
                  key={asset.slug}
                  type="button"
                  onClick={() => selectAsset(asset.slug)}
                  title={asset.description}
                  className={cn(
                    'flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted',
                    activeAssetSlug === asset.slug ? 'border-primary bg-primary/10' : 'border-border bg-muted/40',
                  )}
                >
                  <span>{asset.emoji}</span>
                  <span className="max-w-20 truncate">{asset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Search assets…" className="h-8 pl-7 text-sm" />
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Animals ship with their structures — barn: cow · pig · sheep, coop: hens + rooster,
          hive: bees, pond: ducks; planted beds draw butterflies.
        </p>
        {ASSET_CATEGORIES.map((category) => {
          const entries = filteredAssets.filter((asset) => asset.category === category);
          if (entries.length === 0) return null;
          return (
            <div key={category} className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[category]}</div>
              <div className="grid grid-cols-2 gap-2">
                {entries.map((asset) => (
                  <button
                    key={asset.slug}
                    type="button"
                    onClick={() => selectAsset(asset.slug)}
                    className={cn(
                      'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted',
                      activeAssetSlug === asset.slug ? 'border-primary bg-primary/10' : 'border-border',
                    )}
                    title={asset.description}
                  >
                    <span className="h-4 w-4 rounded-sm" style={{ background: asset.colorHex }} />
                    <span className="truncate">{asset.emoji} {asset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filteredAssets.length === 0 && (
          <p className="text-xs text-muted-foreground">No assets match “{assetSearch}”.</p>
        )}
      </CardContent>
    </Card>
  );
}
