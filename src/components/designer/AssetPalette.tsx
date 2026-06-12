import { Map as MapIcon } from 'lucide-react';

import { assetLibrary } from '@/data/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AssetCategory } from '@/types';
import type { PlanEditor } from './usePlanEditor';

const ASSET_CATEGORIES: AssetCategory[] = ['growing', 'infrastructure', 'life'];

export function AssetPalette({ editor }: { editor: PlanEditor }) {
  const { activeAssetSlug, setActiveAssetSlug, tool, setTool } = editor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapIcon className="w-4 h-4" /> Assets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ASSET_CATEGORIES.map((category) => (
          <div key={category} className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</div>
            <div className="grid grid-cols-2 gap-2">
              {assetLibrary.filter((asset) => asset.category === category).map((asset) => (
                <button
                  key={asset.slug}
                  type="button"
                  onClick={() => {
                    setActiveAssetSlug(asset.slug);
                    if (tool !== 'rect') setTool('asset');
                  }}
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
        ))}
      </CardContent>
    </Card>
  );
}
