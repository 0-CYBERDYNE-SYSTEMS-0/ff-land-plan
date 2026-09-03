import { dateFromMonthDay, isValidMonthDay, monthDayToDoy } from '@/lib/frost';
import type { Crop, Farm, PlanState } from '@/types';

export type CalendarActionType = 'sow_indoor' | 'transplant' | 'direct_sow' | 'harvest';

export interface CalendarAction {
  crop: Crop;
  type: CalendarActionType;
  label: string;
  start: Date;
  end: Date;
  startDoy: number;
  endDoy: number;
  frostRisk: boolean;
}

const MS_DAY = 86_400_000;

const ACTION_LABELS: Record<CalendarActionType, string> = {
  sow_indoor: 'Sow indoors',
  transplant: 'Transplant',
  direct_sow: 'Direct sow',
  harvest: 'Harvest',
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function doy(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.max(1, Math.min(365, Math.round((date.getTime() - start.getTime()) / MS_DAY)));
}

function makeAction(crop: Crop, type: CalendarActionType, start: Date, end: Date, firstFrost: Date | null): CalendarAction {
  return {
    crop,
    type,
    label: ACTION_LABELS[type],
    start,
    end,
    startDoy: doy(start),
    endDoy: doy(end),
    frostRisk: !!firstFrost && start <= firstFrost && end >= addDays(firstFrost, -7),
  };
}

function uniquePlanCrops(plan: PlanState, crops: Crop[]): Crop[] {
  const ids = new Set(Object.values(plan.planting));
  const byId = new Map(crops.map((crop) => [crop.id, crop]));
  return [...ids].map((id) => byId.get(id)).filter((crop): crop is Crop => !!crop);
}

function actionSortKey(action: CalendarAction, today: Date): number {
  if (action.end >= today) return action.start.getTime();
  return action.start.getTime() + 365 * MS_DAY;
}

export function buildPlantingCalendar(farm: Farm, plan: PlanState, crops: Crop[], year = new Date().getFullYear()): CalendarAction[] {
  const planCrops = uniquePlanCrops(plan, crops);
  const today = new Date();
  // Treat malformed stored frost strings (legacy free-form input) as absent
  // rather than feeding NaN months into date math.
  const lastFrost = farm.lastFrost && isValidMonthDay(farm.lastFrost) ? dateFromMonthDay(farm.lastFrost, year) : null;
  const firstFrost = farm.firstFrost && isValidMonthDay(farm.firstFrost) ? dateFromMonthDay(farm.firstFrost, year) : null;
  const actions: CalendarAction[] = [];

  for (const crop of planCrops) {
    const hasCalendarAnchor =
      crop.sowIndoorsWeeksBeforeLastFrost !== null && crop.sowIndoorsWeeksBeforeLastFrost !== undefined ||
      crop.transplantWeeksAfterLastFrost !== null && crop.transplantWeeksAfterLastFrost !== undefined ||
      crop.directSowStartWeeks !== null && crop.directSowStartWeeks !== undefined;
    if (!hasCalendarAnchor) continue;

    if (!lastFrost) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      actions.push(makeAction(crop, 'direct_sow', start, end, firstFrost));
      actions.push(makeAction(crop, 'harvest', addDays(start, crop.growthDays), end, firstFrost));
      continue;
    }

    const outdoorStarts: Date[] = [];
    if (crop.sowIndoorsWeeksBeforeLastFrost !== null && crop.sowIndoorsWeeksBeforeLastFrost !== undefined) {
      const start = addDays(lastFrost, -crop.sowIndoorsWeeksBeforeLastFrost * 7);
      actions.push(makeAction(crop, 'sow_indoor', start, addDays(start, 14), firstFrost));
    }

    if (crop.transplantWeeksAfterLastFrost !== null && crop.transplantWeeksAfterLastFrost !== undefined) {
      const start = addDays(lastFrost, crop.transplantWeeksAfterLastFrost * 7);
      outdoorStarts.push(start);
      actions.push(makeAction(crop, 'transplant', start, addDays(start, 14), firstFrost));
    }

    if (crop.directSowStartWeeks !== null && crop.directSowStartWeeks !== undefined) {
      const start = addDays(lastFrost, crop.directSowStartWeeks * 7);
      const end = addDays(lastFrost, (crop.directSowEndWeeks ?? crop.directSowStartWeeks + 2) * 7);
      outdoorStarts.push(start);
      actions.push(makeAction(crop, 'direct_sow', start, end, firstFrost));
    }

    const firstOutdoor = outdoorStarts.sort((a, b) => a.getTime() - b.getTime())[0] ?? lastFrost;
    if (outdoorStarts.length === 0) continue;
    const harvestStart = addDays(firstOutdoor, crop.growthDays);
    const harvestEnd = addDays(harvestStart, crop.harvestWindowDays ?? 21);
    actions.push(makeAction(crop, 'harvest', harvestStart, harvestEnd, firstFrost));
  }

  return actions.sort((a, b) => {
    const aKey = actionSortKey(a, today);
    const bKey = actionSortKey(b, today);
    return aKey === bKey ? a.crop.name.localeCompare(b.crop.name) : aKey - bKey;
  });
}

export function actionsThisWeek(actions: CalendarAction[], today = new Date()): CalendarAction[] {
  const weekEnd = addDays(today, 7);
  return actions.filter((action) => action.start <= weekEnd && action.end >= today);
}

export function monthDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function calendarPercent(doyValue: number): number {
  return Math.min(100, Math.max(0, (doyValue / 365) * 100));
}

export function frostDoy(farm: Farm): { last: number | null; first: number | null } {
  return {
    last: farm.lastFrost && isValidMonthDay(farm.lastFrost) ? monthDayToDoy(farm.lastFrost) : null,
    first: farm.firstFrost && isValidMonthDay(farm.firstFrost) ? monthDayToDoy(farm.firstFrost) : null,
  };
}
