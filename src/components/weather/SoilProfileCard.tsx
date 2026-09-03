import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { clearSoilCache, fetchSoilProfile } from '@/lib/soil';

const SOURCE_LABEL = {
  'usda-sda': 'USDA NRCS Soil Data Access',
  soilgrids: 'ISRIC SoilGrids',
} as const;

function TextureBar({ label, pct, barClass }: { label: string; pct: number; barClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SoilStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export function SoilProfileCard({ lat, lng }: { lat: number; lng: number }) {
  const queryClient = useQueryClient();
  const soil = useQuery({
    queryKey: ['soil-profile', lat, lng],
    queryFn: () => fetchSoilProfile(lat, lng),
    staleTime: Infinity,
  });

  if (soil.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  const p = soil.data;
  if (!p) return null; // no ground-truth data available — hide the card entirely

  const t = p.texture;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Soil Profile
          {p.soilType && (
            <Badge variant="secondary" className="capitalize">
              {p.soilType}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto w-7 h-7"
            aria-label="Refresh soil profile"
            disabled={soil.isFetching}
            onClick={() => {
              clearSoilCache(lat, lng);
              void queryClient.invalidateQueries({ queryKey: ['soil-profile', lat, lng] });
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${soil.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm font-medium">{p.name}</div>
        {t ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
            <TextureBar label="Sand" pct={t.sandPct} barClass="bg-amber-400" />
            <TextureBar label="Silt" pct={t.siltPct} barClass="bg-stone-400" />
            <TextureBar label="Clay" pct={t.clayPct} barClass="bg-orange-700" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            No texture data for this unit — classification name only.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SoilStat label="pH (1:1 H₂O)" value={p.ph === null ? '—' : p.ph.toFixed(1)} />
          <SoilStat
            label="Organic matter"
            value={p.organicMatterPct === null ? '—' : `${p.organicMatterPct.toFixed(1)}%`}
          />
          <SoilStat
            label="CEC (cmol⁺/kg)"
            value={p.cecCmolKg === null ? '—' : p.cecCmolKg.toFixed(1)}
          />
          <SoilStat
            label="AWC (mm/cm)"
            value={p.awcMmPerCm === null ? '—' : p.awcMmPerCm.toFixed(2)}
          />
        </div>
        <div className="text-xs text-muted-foreground">Source: {SOURCE_LABEL[p.source]}</div>
      </CardContent>
    </Card>
  );
}
