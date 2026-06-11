import { Link, useLocation } from 'wouter';
import { ChevronRight, CloudSun, FlaskConical, Map, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Farm } from '@/types';

const farmLinks = (farmId: number) => [
  { href: `/farms/${farmId}/map`, icon: Map, label: 'Voxel Editor' },
  { href: `/farms/${farmId}/weather`, icon: CloudSun, label: 'Weather' },
  { href: `/farms/${farmId}/simulations`, icon: FlaskConical, label: 'Simulations' },
  { href: `/farms/${farmId}/monitoring`, icon: Activity, label: 'Monitoring' },
];

export function FarmNav({ farm }: { farm: Farm }) {
  const [location] = useLocation();
  const links = farmLinks(farm.id);

  return (
    <div className="mt-1">
      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
        {farm.name}
      </div>
      {links.map((link) => {
        const active = location === link.href;
        return (
          <Link key={link.href} href={link.href}>
            <a
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
            </a>
          </Link>
        );
      })}
    </div>
  );
}
