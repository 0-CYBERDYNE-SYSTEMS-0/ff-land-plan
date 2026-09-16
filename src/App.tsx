import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/hooks/useTheme';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { FarmForm } from '@/pages/FarmForm';
import { PlotDesigner } from '@/pages/PlotDesigner';
import { Calendar } from '@/pages/Calendar';
import { Weather } from '@/pages/Weather';
import { Simulations } from '@/pages/Simulations';
import { Monitoring } from '@/pages/Monitoring';
import { Crops } from '@/pages/Crops';
import { NotFound } from '@/pages/NotFound';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <AppShell>
            <Routes />
          </AppShell>
        </Router>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ duration: 4000 }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Audit X-004: every route shares index.html's title otherwise. First match
// wins; the fallback covers the 404 route.
const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/crops/, 'Crop Library'],
  [/^\/farms\/new$/, 'Add a Farm'],
  [/^\/farms\/\d+\/edit$/, 'Edit Farm'],
  [/^\/farms\/\d+\/map$/, 'Plot Designer'],
  [/^\/farms\/\d+\/calendar$/, 'Planting Calendar'],
  [/^\/farms\/\d+\/weather$/, 'Weather'],
  [/^\/farms\/\d+\/simulations$/, 'Simulations'],
  [/^\/farms\/\d+\/monitoring$/, 'Monitoring'],
];

function Routes() {
  // Force the hash to "#/" on first load, matching the legacy build.
  const [location] = useLocation();
  if (!window.location.hash) {
    window.location.hash = '#/';
  }

  useEffect(() => {
    const title = ROUTE_TITLES.find(([re]) => re.test(location))?.[1] ?? 'Page Not Found';
    document.title = `${title} — FarmFriend`;
  }, [location]);

  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      {/* Keyed by mode/id (audit X-006): without it, client-side nav between
          edit and create reuses the same FarmForm instance and leaks the
          edited farm's values into the create form. */}
      <Route path="/farms/new">{() => <FarmForm key="new" />}</Route>
      <Route path="/farms/:id/edit">
        {(params) => <FarmForm key={params.id} farmId={Number(params.id)} />}
      </Route>
      <Route path="/farms/:id/map">
        {(params) => <PlotDesigner farmId={Number(params.id)} />}
      </Route>
      <Route path="/farms/:id/calendar">
        {(params) => <Calendar farmId={Number(params.id)} />}
      </Route>
      <Route path="/farms/:id/weather">
        {(params) => <Weather farmId={Number(params.id)} />}
      </Route>
      <Route path="/farms/:id/simulations">
        {(params) => <Simulations farmId={Number(params.id)} />}
      </Route>
      <Route path="/farms/:id/monitoring">
        {(params) => <Monitoring farmId={Number(params.id)} />}
      </Route>
      <Route path="/crops" component={Crops} />
      <Route>
        <NotFound location={location} />
      </Route>
    </Switch>
  );
}
