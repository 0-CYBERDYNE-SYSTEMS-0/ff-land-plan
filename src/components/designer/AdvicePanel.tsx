import { useQuery } from '@tanstack/react-query';
import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  adviceDotsFor,
  adviceMarkFor,
  getAdviceProvider,
  resolveAdviceConfig,
  type AdviceDot,
  type AdviceScan,
} from '@/lib/advice';
import type { PlanEditor } from './usePlanEditor';

interface ScanResult {
  scan: AdviceScan;
  /** planVersion at scan time — a later version marks the result stale. */
  planVersion: number;
}

interface AdvicePanelProps {
  editor: PlanEditor;
  /** "Show on map" wiring: PlotDesigner holds the dots state and pushes it
   *  into usePlanEditor (same seam setSimChannels uses). */
  onAdviceDotsChange: (dots: Map<string, AdviceDot> | null) => void;
}

export function AdvicePanel({ editor, onAdviceDotsChange }: AdvicePanelProps) {
  const config = resolveAdviceConfig();
  const [showOnMap, setShowOnMap] = useState(false);
  const farmId = editor.farm?.id ?? 0;

  // Manual scan only (enabled: false): even with a live key nothing runs —
  // and nothing costs — until the user clicks Scan plan.
  const { data, isFetching, isError, refetch } = useQuery<ScanResult>({
    queryKey: ['advice-scan', farmId],
    enabled: false,
    queryFn: async () => {
      const provider = getAdviceProvider(config);
      const plan = editor.planRef.current;
      if (!provider || !plan) throw new Error('Advice seam unavailable');
      return { scan: await provider.scan(plan, editor.cropById), planVersion: editor.planVersion };
    },
  });
  const scan = data?.scan;
  const stale = data !== undefined && data.planVersion !== editor.planVersion;

  useEffect(() => {
    if (!config.enabled || !showOnMap || !scan) {
      onAdviceDotsChange(null);
      return;
    }
    onAdviceDotsChange(adviceDotsFor(scan));
  }, [config.enabled, onAdviceDotsChange, scan, showOnMap]);

  // Flag-off invariant: no env vars ⇒ no UI, no query activity, no dots.
  if (!config.enabled) return null;

  const marks = scan ? Object.values(scan.cells).map((cell) => ({ cell, mark: adviceMarkFor(cell) })) : [];
  const counts = { ok: 0, warn: 0, bad: 0 };
  for (const { mark } of marks) counts[mark.level] += 1;
  const notable = marks
    .filter(({ mark }) => mark.level !== 'ok')
    .sort((a, b) =>
      a.mark.level === b.mark.level
        ? b.mark.confidence - a.mark.confidence
        : a.mark.level === 'bad'
          ? -1
          : 1,
    )
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Advice (Jev seam)
          {scan && <Badge variant="secondary" className="text-xs">{scan.source}</Badge>}
          {stale && <Badge variant="outline" className="text-xs">stale</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <Lightbulb className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Scan plan
          </Button>
          <Button
            size="sm"
            variant={showOnMap ? 'default' : 'ghost'}
            className="h-7 text-xs"
            aria-pressed={showOnMap}
            onClick={() => setShowOnMap((v) => !v)}
            disabled={!scan}
          >
            Show on map
          </Button>
        </div>
        {isError && <p className="text-destructive">Scan failed — try again.</p>}
        {!scan && !isError && (
          <p className="text-muted-foreground">No scan yet — nothing runs until you click Scan plan.</p>
        )}
        {scan && (
          <>
            <p className="text-muted-foreground">
              {counts.ok} ok · {counts.warn} warn · {counts.bad} bad{stale ? ' · plan changed since scan' : ''}
            </p>
            {notable.length === 0 ? (
              <p className="text-muted-foreground">No flagged cells.</p>
            ) : (
              <div className="space-y-1">
                {notable.map(({ cell, mark }) => (
                  <div
                    key={cell.cellKey}
                    className={
                      mark.level === 'bad'
                        ? 'rounded-md border border-red-500/40 bg-red-500/10 p-2 text-red-700 dark:text-red-300'
                        : 'rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300'
                    }
                  >
                    {cell.x},{cell.y} — {mark.reason} ({mark.confidence.toFixed(2)})
                  </div>
                ))}
              </div>
            )}
            {scan.note && <p className="text-muted-foreground">{scan.note}</p>}
          </>
        )}
        <p className="text-muted-foreground">Advisory only — never blocks edits.</p>
      </CardContent>
    </Card>
  );
}
