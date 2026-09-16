import { Link, useLocation } from 'wouter';
import { CalendarDays, ChevronRight, CloudSun, FlaskConical, Map, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Farm } from '@/types';

const farmLinks = (farmId: number) => [
  { href: `/farms/${farmId}/map`, icon: Map, label: 'Plot Designer' },
  { href: `/farms/${farmId}/calendar`, icon: CalendarDays, label: 'Calendar' },
  { href: `/farms/${farmId}/weather`, icon: CloudSun, label: 'Weather' },
  { href: `/farms/${farmId}/simulations`, icon: FlaskConical, label: 'Simulations' },
  { href: `/farms/${farmId}/monitoring`, icon: Activity, label: 'Monitoring' },
];

export function FarmNav({ farm }: { farm: Farm }) {
  const [location] = useLocation();
  const links = farmLinks(farm.id);
  const farmActive = links.some((link) => link.href === location);

  return (
    // Collapsible per farm (audit OPS-001: 9 seeded farms × 5 always-expanded
    // links read as a rendering bug). The active farm starts expanded; the
    // user's manual open/closed choice persists across re-renders.
    <details className="mt-1 group" open={farmActive}>
      <summary className="mx-2 px-3 py-1.5 flex items-center justify-between gap-2 rounded-md text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted list-none [&::-webkit-details-marker]:hidden">
        <span className="truncate">{farm.name}</span>
        <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-60 transition-transform group-open:rotate-90" />
      </summary>
      {links.map((link) => {
        const active = location === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm transition-colors',
              active
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <link.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{link.label}</span>
            {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
          </Link>
        );
      })}
    </details>
  );
}
