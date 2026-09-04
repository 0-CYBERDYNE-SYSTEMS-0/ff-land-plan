import { Link } from 'wouter';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Leaf, Snowflake, Sprout } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import {
  actionsThisWeek,
  buildPlantingCalendar,
  calendarPercent,
  frostDoy,
  monthDayLabel,
  type CalendarAction,
} from '@/lib/calendar';
import { createDefaultPlan } from '@/lib/plan';
import { useFarm } from '@/hooks/useFarms';
import { useNavigation } from '@/hooks/useNavigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Crop } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ACTION_TONE: Record<CalendarAction['type'], string> = {
  sow_indoor: 'bg-blue-500',
  transplant: 'bg-green-600',
  direct_sow: 'bg-emerald-500',
  harvest: 'bg-amber-500',
};

const ACTION_BADGE: Record<CalendarAction['type'], 'default' | 'secondary' | 'outline'> = {
  sow_indoor: 'secondary',
  transplant: 'default',
  direct_sow: 'default',
  harvest: 'outline',
};

export function Calendar({ farmId }: { farmId: number }) {
  const navigate = useNavigation();
  const { data: farm, isLoading: farmLoading } = useFarm(farmId);
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', farmId],
    queryFn: () => apiFetch.getPlan(farmId),
  });
  const { data: crops = [], isLoading: cropsLoading } = useQuery<Crop[]>({
    queryKey: ['crops'],
    queryFn: () => apiFetch.listCrops(),
  });

  const effectivePlan = useMemo(() => farm ? plan ?? createDefaultPlan(farm.id) : null, [farm, plan]);
  const actions = useMemo(() => {
    if (!farm || !effectivePlan) return [];
    return buildPlantingCalendar(farm, effectivePlan, crops);
  }, [crops, effectivePlan, farm]);
  const weekActions = useMemo(() => actionsThisWeek(actions), [actions]);
  const frost = farm ? frostDoy(farm) : { last: null, first: null };
  const todayPercent = calendarPercent(new Date().getMonth() * 30.42 + new Date().getDate());

  if (farmLoading || planLoading || cropsLoading) {
    return <div className="p-6"><Skeleton className="h-[70vh] w-full" /></div>;
  }
  if (!farm || !effectivePlan) return <div className="p-6">Farm not found.</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Planting Calendar
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {farm.name} · {actions.length > 0 ? `${actions.length} seasonal windows` : 'No planned crops yet'}
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Snowflake className="w-3 h-3" />
          {farm.lastFrost && farm.firstFrost ? `${farm.lastFrost} → ${farm.firstFrost}` : 'Frost-free'}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sprout className="w-4 h-4" /> This week
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weekActions.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {weekActions.map((action) => (
                <ActionCard key={`${action.crop.id}-${action.type}-${action.start.toISOString()}`} action={action} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sow, transplant, or harvest windows are active this week.</p>
          )}
        </CardContent>
      </Card>

      {actions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <Leaf className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <h2 className="font-semibold">Design a plot to build a calendar</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The calendar is generated from crops painted in the Plot Designer.
              </p>
            </div>
            <Link href={`/farms/${farm.id}/map`}>
              <Button size="sm">Open Plot Designer</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Year timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            <div className="min-w-[820px] space-y-2">
              <div className="relative ml-36 h-8 border-b border-border">
                <div className="grid grid-cols-12 text-xs text-muted-foreground">
                  {MONTHS.map((month) => (
                    <div key={month} className="border-l border-border/60 pl-1 first:border-l-0">{month}</div>
                  ))}
                </div>
                <Marker left={todayPercent} label="Today" tone="bg-primary" />
                {frost.last && <Marker left={calendarPercent(frost.last)} label="Last frost" tone="bg-blue-500" />}
                {frost.first && <Marker left={calendarPercent(frost.first)} label="First frost" tone="bg-blue-500" />}
              </div>
              {actions.map((action) => (
                <div key={`${action.crop.id}-${action.type}-${action.start.toISOString()}`} className="grid grid-cols-[9rem_1fr] items-center gap-2">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">
                      <span className="mr-1">{action.crop.emoji}</span>{action.crop.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{action.label}</div>
                  </div>
                  <div className="relative h-8 rounded bg-muted">
                    <div
                      className={`absolute top-2 h-4 rounded ${ACTION_TONE[action.type]}`}
                      style={{
                        left: `${calendarPercent(action.startDoy)}%`,
                        width: `${Math.max(1.5, calendarPercent(action.endDoy) - calendarPercent(action.startDoy))}%`,
                      }}
                      title={`${action.label}: ${monthDayLabel(action.start)} - ${monthDayLabel(action.end)}`}
                    />
                    {action.frostRisk && (
                      <span className="absolute right-2 top-1.5 text-xs text-amber-700 dark:text-amber-300">frost risk</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: CalendarAction }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">
            <span className="mr-1">{action.crop.emoji}</span>{action.crop.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {monthDayLabel(action.start)} - {monthDayLabel(action.end)}
          </div>
        </div>
        <Badge variant={ACTION_BADGE[action.type]}>{action.label}</Badge>
      </div>
      {action.frostRisk && (
        <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Frost risk this week; protect tender starts.
        </div>
      )}
    </div>
  );
}

function Marker({ left, label, tone }: { left: number; label: string; tone: string }) {
  return (
    <div className="absolute top-0 h-full" style={{ left: `${left}%` }}>
      <div className={`h-full w-px ${tone}`} />
      <div className="mt-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
