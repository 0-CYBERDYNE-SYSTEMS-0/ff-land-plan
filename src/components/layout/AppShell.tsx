import { useState, type ReactNode } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-card border-r border-border flex flex-col">
            <div className="lg:hidden flex-1 overflow-y-auto">
              <SidebarMobile onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)}>
            <Menu className="w-4 h-4" />
          </Button>
          <div className="text-primary">
            <Logo size={24} />
          </div>
          <span className="font-bold text-sm">FarmFriend</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={toggle}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

import { Link, useLocation } from 'wouter';
import { ChartNoAxesColumn, CloudSun, FlaskConical, LayoutDashboard, Leaf, Map, Plus, Sprout, Activity } from 'lucide-react';
import { useFarms } from '@/hooks/useFarms';
import { cn } from '@/lib/utils';

const PRIMARY_LINKS = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crops', icon: Leaf, label: 'Crop Library' },
] as const;

function SidebarMobile({ onNavigate }: { onNavigate: () => void }) {
  const [location] = useLocation();
  const { data: farms = [] } = useFarms();
  return (
    <nav className="py-3 space-y-0.5">
      {PRIMARY_LINKS.map((link) => {
        const active = location === link.href;
        return (
          <Link key={link.href} href={link.href}>
            <a onClick={onNavigate} className={cn('flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm', active ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted')}>
              <link.icon className="w-4 h-4" />
              {link.label}
            </a>
          </Link>
        );
      })}
      <div className="mx-2 my-2 border-t border-border" />
      {farms.map((farm) => (
        <div key={farm.id} onClick={onNavigate}>
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{farm.name}</div>
          {[
            { href: `/farms/${farm.id}/map`, icon: Map, label: 'Voxel Editor' },
            { href: `/farms/${farm.id}/weather`, icon: CloudSun, label: 'Weather' },
            { href: `/farms/${farm.id}/simulations`, icon: FlaskConical, label: 'Simulations' },
            { href: `/farms/${farm.id}/monitoring`, icon: Activity, label: 'Monitoring' },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              <a onClick={onNavigate} className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">
                <link.icon className="w-4 h-4" />
                {link.label}
              </a>
            </Link>
          ))}
        </div>
      ))}
      <Link href="/farms/new">
        <a onClick={onNavigate} className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 text-sm text-primary">
          <Plus className="w-4 h-4" /> New Farm
        </a>
      </Link>
    </nav>
  );
}
