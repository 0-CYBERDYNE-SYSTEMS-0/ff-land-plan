import { useEffect, useState, type ReactNode } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { getLastStorageFailure, type StorageFailureDetail, type StorageSavedDetail } from '@/lib/db';
import { getStoreConflict, retryStorageWrite, storeRecovery } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storageFailure, setStorageFailure] = useState<StorageFailureDetail | null>(() => getLastStorageFailure());
  const [storageConflict, setStorageConflict] = useState<string | null>(() => getStoreConflict());
  const [failureDetailsOpen, setFailureDetailsOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    setStorageFailure(getLastStorageFailure());
    setStorageConflict(getStoreConflict());
    const onStorageFailure = (event: Event) => {
      setStorageFailure((event as CustomEvent<StorageFailureDetail>).detail);
    };
    const onStorageSaved = (event: Event) => {
      const { operation } = (event as CustomEvent<StorageSavedDetail>).detail;
      setStorageFailure((current) => current?.operation === operation ? null : current);
    };
    const onStorageConflict = (event: Event) => {
      setStorageConflict((event as CustomEvent<{ message: string }>).detail.message);
    };
    window.addEventListener('storage-failed', onStorageFailure);
    window.addEventListener('storage-saved', onStorageSaved);
    window.addEventListener('storage-conflict', onStorageConflict);
    return () => {
      window.removeEventListener('storage-failed', onStorageFailure);
      window.removeEventListener('storage-saved', onStorageSaved);
      window.removeEventListener('storage-conflict', onStorageConflict);
    };
  }, []);

  const retryStorage = async () => {
    setRetrying(true);
    try {
      await retryStorageWrite();
    } catch {
      // The persistent alert carries the current failure details.
    } finally {
      setRetrying(false);
    }
  };

  const downloadOriginalData = () => {
    if (storeRecovery?.raw === null || storeRecovery?.raw === undefined) return;
    const url = URL.createObjectURL(new Blob([storeRecovery.raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'farmfriend-recovery-raw.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip link (audit X-002: 110 focusables before content). The click is
          prevented — href would change the HASH ROUTE, not scroll. */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-2 focus:left-2 focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
      >
        Skip to main content
      </a>
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
        {storageFailure && (
          <div role="alert" className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Persistent storage failed · {storageFailure.operation}</div>
              <p className="text-xs">
                {storageFailure.operation === 'localStorage persist'
                  ? 'Uncommitted changes remain pending. Keep this tab open and retry after resolving the problem.'
                  : storageFailure.operation === 'plan save'
                    ? 'Uncommitted plan edits remain pending. Keep this tab open and retry the save after resolving the problem.'
                  : 'A durable storage operation failed. Keep this tab open and review the details before retrying the related action.'}
              </p>
              {failureDetailsOpen && <p className="mt-1 text-xs">{storageFailure.message}</p>}
            </div>
            {(storageFailure.operation === 'localStorage persist' || storageFailure.operation === 'plan save') && !storageConflict && !storeRecovery && (
              <Button type="button" size="sm" variant="outline" disabled={retrying} onClick={() => { void retryStorage(); }}>
                {retrying ? 'Retrying…' : 'Retry'}
              </Button>
            )}
            <button type="button" aria-expanded={failureDetailsOpen} onClick={() => setFailureDetailsOpen((open) => !open)} className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-destructive/10">
              {failureDetailsOpen ? 'Hide details' : 'Details'}
            </button>
          </div>
        )}
        {storageConflict && (
          <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <div className="font-semibold">FarmFriend data changed in another tab</div>
            <p className="text-xs">{storageConflict} Keep both tabs open and stop editing. BETA-03 will add a backup action for preserving each tab before reload; multi-tab edits are not merged.</p>
          </div>
        )}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          {storeRecovery ? (
            <section className="mx-auto my-10 max-w-2xl space-y-4 rounded-lg border border-destructive/30 bg-card p-6" role="alert">
              <h1 className="text-xl font-semibold">Your saved FarmFriend data could not be opened</h1>
              <p className="text-sm text-muted-foreground">FarmFriend is in recovery mode. It has not replaced the original data with a fresh sample profile, and editing is paused until recovery is available.</p>
              {storeRecovery.raw !== null && (
                <Button type="button" onClick={downloadOriginalData}>Download original data</Button>
              )}
              <p className="text-xs text-muted-foreground">
                {storeRecovery.raw === null
                  ? 'FarmFriend could not read the original store. Do not clear this browser profile; recovery will need access to its stored data.'
                  : storeRecovery.quarantineFailed
                    ? 'A safety copy could not be written. Download the original data before closing this tab.'
                    : 'A best-effort safety copy was attempted. Download the original data before closing this tab.'}
              </p>
              <p className="text-xs text-muted-foreground">Backup restore will be available here with BETA-03.</p>
              <details>
                <summary className="cursor-pointer text-xs font-medium">Technical detail</summary>
                <p className="mt-2 break-words text-xs text-muted-foreground">{storeRecovery.message}</p>
              </details>
            </section>
          ) : children}
        </main>
      </div>
    </div>
  );
}

import { Link, useLocation } from 'wouter';
import { CalendarDays, ChevronRight, CloudSun, FlaskConical, LayoutDashboard, Leaf, Map, Plus, Activity } from 'lucide-react';
import { useFarms } from '@/hooks/useFarms';
import { cn } from '@/lib/utils';

const PRIMARY_LINKS = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crops', icon: Leaf, label: 'Crop Library' },
] as const;

const MOBILE_FARM_LINKS = (farmId: number) => [
  { href: `/farms/${farmId}/map`, icon: Map, label: 'Plot Designer' },
  { href: `/farms/${farmId}/calendar`, icon: CalendarDays, label: 'Calendar' },
  { href: `/farms/${farmId}/weather`, icon: CloudSun, label: 'Weather' },
  { href: `/farms/${farmId}/simulations`, icon: FlaskConical, label: 'Simulations' },
  { href: `/farms/${farmId}/monitoring`, icon: Activity, label: 'Monitoring' },
];

function SidebarMobile({ onNavigate }: { onNavigate: () => void }) {
  const [location] = useLocation();
  const { data: farms = [] } = useFarms();
  return (
    <nav className="py-3 space-y-0.5">
      {PRIMARY_LINKS.map((link) => {
        const active = location === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm', active ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted')}
          >
            <link.icon className="w-4 h-4" />
            {link.label}
          </Link>
        );
      })}
      <div className="mx-2 my-2 border-t border-border" />
      {/* Same collapsible-per-farm treatment as the desktop FarmNav (audit
          OPS-001); onNavigate stays on links only so toggling a farm group
          does not close the drawer. */}
      {farms.map((farm) => {
        const links = MOBILE_FARM_LINKS(farm.id);
        const farmActive = links.some((link) => link.href === location);
        return (
          <details key={farm.id} className="group" open={farmActive}>
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
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </details>
        );
      })}
      <Link href="/farms/new" onClick={onNavigate} className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 text-sm text-primary">
        <Plus className="w-4 h-4" /> New Farm
      </Link>
    </nav>
  );
}
