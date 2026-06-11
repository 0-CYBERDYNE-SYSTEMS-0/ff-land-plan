import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Leaf, Plus, Sprout, Sun, Moon } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { useFarms } from '@/hooks/useFarms';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import { FarmNav } from './FarmNav';
import { cn } from '@/lib/utils';

const PRIMARY_LINKS = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crops', icon: Leaf, label: 'Crop Library' },
] as const;

export function Sidebar() {
  const { theme, toggle } = useTheme();
  const [location] = useLocation();
  const { data: farms = [] } = useFarms();

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card flex-shrink-0">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <div className="text-primary">
          <Logo size={36} />
        </div>
        <div>
          <div className="font-bold text-sm leading-tight">FarmFriend</div>
          <div className="text-xs text-muted-foreground">Digital Twin</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="live-pulse w-2 h-2 rounded-full bg-primary block" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {PRIMARY_LINKS.map((link) => {
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
                {link.label}
              </a>
            </Link>
          );
        })}

        <div className="mx-2 my-2 border-t border-border" />

        <div className="px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">My Farms</span>
          <Link href="/farms/new">
            <a>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="btn-new-farm">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </a>
          </Link>
        </div>

        {farms.length === 0 && (
          <div className="mx-2 px-3 py-3 rounded-md border border-dashed border-border text-xs text-muted-foreground text-center">
            No farms yet.
            <br />
            Click + to add one.
          </div>
        )}

        {farms.map((farm) => (
          <FarmNav key={farm.id} farm={farm} />
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 flex items-center gap-2">
        <Sprout className="w-4 h-4 text-primary" />
        <span className="text-xs text-muted-foreground flex-1">v1.0 MVP</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggle} data-testid="btn-theme-toggle">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  );
}
