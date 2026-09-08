import { X } from 'lucide-react';
import { SCENARIOS } from '@/lib/growth';
import type { ScenarioType, WeatherCurrent } from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

export interface CropProgressRow {
  id: number;
  name: string;
  /** Optional display label disambiguating sow dates, e.g. "Tomato · Mar 2". */
  label?: string;
  /** Raw sow date ("" when undated); part of the React key so same-name rows stay unique. */
  plantedAt?: string;
  stage: number;
  pct: number;
  stress: number;
}

/** Provenance for the growth model's seasonal baseline temperature. */
export interface ClimateBaselineInfo {
  tempC: number;
  source: 'era5-normals' | 'default-20c';
}

export interface SimDrawerProps {
  open: boolean;
  onClose: () => void;
  scrubDate: string;
  onScrubDate: (iso: string) => void;
  onToday: () => void;
  seasonDay: number | null;
  seasonComplete: boolean;
  onJumpSeasonStart: () => void;
  onDismissSeason: () => void;
  timeOfDay: number;
  onTimeOfDay: (v: number) => void;
  autoTime: boolean;
  onAutoTime: (v: boolean) => void;
  playing: boolean;
  simSpeed: 1 | 7 | 30;
  onSimSpeed: (v: 1 | 7 | 30) => void;
  scenario: ScenarioType;
  onScenario: (s: ScenarioType) => void;
  weather: WeatherCurrent | null;
  weatherCached: boolean;
  /** Optional provenance chip: seasonal baseline temp the growth model uses. */
  climateBaseline?: ClimateBaselineInfo;
  cropProgress: CropProgressRow[];
}

function formatTimeOfDay(t: number): string {
  const hours = Math.floor(t * 24);
  const minutes = Math.floor(((t * 24) % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function SimDrawer({
  open,
  onClose,
  scrubDate,
  onScrubDate,
  onToday,
  seasonComplete,
  onJumpSeasonStart,
  onDismissSeason,
  timeOfDay,
  onTimeOfDay,
  autoTime,
  onAutoTime,
  simSpeed,
  onSimSpeed,
  scenario,
  onScenario,
  weather,
  weatherCached,
  climateBaseline,
  cropProgress,
}: SimDrawerProps) {
  const handleTimeOfDay = ([v]: number[]) => {
    onTimeOfDay(v);
    onAutoTime(false);
  };

  return (
    <>
      {open && (
        <div
          className="absolute inset-0 z-[140] bg-black/20"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        role="dialog"
        aria-label="Simulation controls"
        aria-hidden={!open}
        className={cn(
          'absolute inset-y-0 right-0 z-[150] flex w-[320px] max-w-[85%] flex-col border-l border-border bg-background/95 shadow-lg backdrop-blur-sm transition-transform duration-200',
          'max-xl:inset-x-0 max-xl:top-auto max-xl:max-h-[55dvh] max-xl:w-full max-xl:rounded-t-xl max-xl:border-l-0 max-xl:border-t',
          open
            ? 'pointer-events-auto translate-x-0 max-xl:translate-y-0'
            : 'pointer-events-none translate-x-full max-xl:translate-x-0 max-xl:translate-y-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Simulation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close simulation controls"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {seasonComplete && (
            <div className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p>Every planted crop has matured — playback paused 14 sim days after full maturity.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onJumpSeasonStart}
                  className="flex-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
                >
                  Jump to season start
                </button>
                <button
                  type="button"
                  onClick={onDismissSeason}
                  className="flex-1 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Keep watching
                </button>
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="ff-sim-date" className="w-20 shrink-0 text-xs text-muted-foreground">
              Date
            </label>
            <input
              id="ff-sim-date"
              type="date"
              value={scrubDate}
              onChange={(e) => onScrubDate(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              onClick={onToday}
              className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Today
            </button>
          </div>

          <div className="shrink-0">
            <div className="flex items-center justify-between">
              <span id="ff-sim-time-label" className="text-xs text-muted-foreground">
                Time of day
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTimeOfDay(timeOfDay)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Slider
                aria-labelledby="ff-sim-time-label"
                value={[timeOfDay]}
                onValueChange={handleTimeOfDay}
                min={0}
                max={1}
                step={0.01}
              />
              <button
                type="button"
                onClick={() => onAutoTime(!autoTime)}
                aria-pressed={autoTime}
                title={autoTime ? 'Time follows the simulation clock' : 'Time set manually'}
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  autoTime ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {autoTime ? 'Auto' : 'Manual'}
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span id="ff-sim-speed-label" className="w-20 shrink-0 text-xs text-muted-foreground">
              Speed
            </span>
            <Select value={String(simSpeed)} onValueChange={(v) => onSimSpeed(Number(v) as 1 | 7 | 30)}>
              <SelectTrigger
                aria-labelledby="ff-sim-speed-label"
                title="Simulated days per real second"
                className="h-8 min-w-0 flex-1 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              {/* Portal renders at body level: lift above the z-[150] drawer */}
              <SelectContent className="z-[200]">
                <SelectItem value="1">1×/day</SelectItem>
                <SelectItem value="7">1×/week</SelectItem>
                <SelectItem value="30">1×/month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span id="ff-sim-scenario-label" className="w-20 shrink-0 text-xs text-muted-foreground">
              Scenario
            </span>
            <Select value={scenario} onValueChange={(v) => onScenario(v as ScenarioType)}>
              <SelectTrigger
                aria-labelledby="ff-sim-scenario-label"
                title="Stress scenario"
                className="h-8 min-w-0 flex-1 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {(Object.keys(SCENARIOS) as ScenarioType[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCENARIOS[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Crop growth</span>
              {climateBaseline && (
                <span
                  title="Seasonal baseline temperature the growth model uses for this farm"
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
                >
                  baseline {climateBaseline.tempC.toFixed(climateBaseline.source === 'era5-normals' ? 1 : 0)} °C ·{' '}
                  {climateBaseline.source === 'era5-normals' ? 'ERA5' : 'default'}
                </span>
              )}
            </div>
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-2">
              {cropProgress.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing planted yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {cropProgress.map((row) => (
                    <div key={`${row.id}|${row.plantedAt ?? ''}|${row.label ?? ''}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{row.label ?? row.name}</span>
                      <span className="tracking-tighter text-foreground">
                        {'●'.repeat(row.stage)}{'○'.repeat(5 - row.stage)}
                      </span>
                      <span className="tabular-nums">{row.pct}%</span>
                      {row.stress > 0.2 && <span className="text-amber-500">stress</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {weather && (
          <div className="shrink-0 border-t border-border px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {weather.weatherDesc} {weather.tempC}°C
              </span>
              {weatherCached && (
                <span
                  title="Live fetch failed earlier — showing last-good cached weather"
                  className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  cached
                </span>
              )}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>💨 {weather.windSpeedKmh} km/h</span>
              <span>🌧 {weather.precipMm} mm</span>
              <span>💧 {weather.humidity}%</span>
              <span>☁ {weather.cloudCover}%</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
