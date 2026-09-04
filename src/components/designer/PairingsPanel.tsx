import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlanEditor } from './usePlanEditor';

export function PairingsPanel({ editor }: { editor: PlanEditor }) {
  const { antagonists, companions, pairings } = editor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pairings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {antagonists.map((pairing) => (
          <div key={`${pairing.a.id}-${pairing.b.id}-bad`} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
            {pairing.a.name} inhibits {pairing.b.name} — keep 1 m apart.
          </div>
        ))}
        {companions.slice(0, 4).map((pairing) => (
          <div key={`${pairing.a.id}-${pairing.b.id}-good`} className="rounded-md border border-green-500/30 bg-green-500/10 p-2 text-green-700 dark:text-green-300">
            {pairing.a.name} pairs well with {pairing.b.name}.
          </div>
        ))}
        {pairings.length === 0 && <p className="text-muted-foreground">No companion or antagonist adjacencies yet.</p>}
      </CardContent>
    </Card>
  );
}
