import { X } from 'lucide-react';
import { SCENARIOS } from '@/lib/growth';
import type { ScenarioType, WeatherCurrent } from '@/types';
import type { DailyEnvironment, EnvSourceTag } from '@/lib/sim';
import type { CellDiagnosticRow, SimRunTimeline } from '@/hooks/useSimRun';
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

/** Moisture-band tint shared by the 3D overlay and this legend (spec §3.3:
 * overlays respect the draw budget — one batch per band, ≤4 draws). */
export const MOISTURE_BANDS: { maxFrac: number; color: string; label: string }[] = [
  { maxFrac: 0.25, color: '#92400e', label: 'dry < 25%' },
  { maxFrac: 0.5, color: '#ca8a04', label: '25–50%' },
  { maxFrac: 0.75, color: '#65a30d', label: '50–75%' },
  { maxFrac: 1.01, color: '#2563eb', label: 'wet > 75%' },
];

/** Short provenance labels for environment source tags (chip pattern). */
const TAG_LABEL: Record<EnvSourceTag, string> = {
  'open-meteo-archive': 'ERA5 archive',
  'open-meteo-forecast': 'forecast',
  'era5-normals': 'ERA5 normals',
  'model-estimate': 'estimate',
  'scenario-delta': 'scenario',
  default: 'default',
};

const TAG_TITLE: Record<EnvSourceTag, string> = {
  'open-meteo-archive': 'Observed ERA5 reanalysis value (Open-Meteo archive)',
  'open-meteo-forecast': 'Forecast-backed day',
  'era5-normals': 'Synthesized from ERA5 climate normals (monthly means)',
  'model-estimate': 'Documented v1 proxy formula',
  'scenario-delta': 'Run scenario applied on top of the raw source',
  default: 'Built-in documented fallback (no site data)',
};

function SourceTag({ tag }: { tag: EnvSourceTag }) {
  return (
    <span
      title={TAG_TITLE[tag]}
      className="ml-1 inline-block rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground"
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;

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
  /** Run mode pins the scenario (it is baked into the RunRecord). */
  scenarioLocked?: boolean;
  weather: WeatherCurrent | null;
  weatherCached: boolean;
  /** Optional provenance chip: seasonal baseline temp the growth model uses. */
  climateBaseline?: ClimateBaselineInfo;
  cropProgress: CropProgressRow[];
  // --- Run transport (RunInspector, spec §3.3) — all presentational ---
  runLabel?: string;
  runTimeline?: SimRunTimeline;
  runPlaying?: boolean;
  runEnded?: boolean;
  /** Simulated days per real second while a run plays. */
  runSpeed?: number;
  onRunPlay?: () => void;
  onRunPause?: () => void;
  onRunStop?: () => void;
  onRunSeek?: (day: number) => void;
  onRunSpeed?: (daysPerSec: number) => void;
  /** Env provenance for the day that produced the current state. */
  dayProvenance?: DailyEnvironment['provenance'];
  /** Per-row driver breakdown, keyed cropId|plantedAt (run mode). */
  cellDiagnostics?: CellDiagnosticRow[];
  selectedRowKey?: string | null;
  onSelectRow?: (key: string | null) => void;
  /** Moisture-band overlay toggle (run mode, ≤4 extra draw calls). */
  showMoisture?: boolean;
  onToggleMoisture?: (v: boolean) => void;
}

function formatTimeOfDay(t: number): string {
  const hours = Math.floor(t * 24);
  const minutes = Math.floor(((t * 24) % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function DiagnosticsPanel({ diag }: { diag: CellDiagnosticRow }) {
  const s = diag.stress;
  const stressed = s.water > 0 || s.heat > 0 || s.cold > 0 || s.nitrogen > 0;
  const gddPct = Math.round((diag.gddAccumC / Math.max(1, diag.gddRequiredC)) * 100);
  return (
    <div className="mt-1 rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-relaxed">
      <div className="font-medium text-foreground">{diag.cropName} — drivers today</div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        <li>
          GDD {r1(diag.gddAccumC)} / {r1(diag.gddRequiredC)} °C·day ({gddPct}%)
          · +{r1(diag.todayGddC)} today
          <SourceTag tag={diag.sources.temp} />
        </li>
        <li>
          bucket {r1(diag.bucketMm)} / {r1(diag.awcCapMm)} mm
          · AWC {diag.awcMmPerCm} mm/cm × {diag.rootDepthCm} cm ({Math.round(diag.moistureFrac * 100)}%)
        </li>
        <li>
          ET0 {r1(diag.todayEtMm)} mm
          <SourceTag tag={diag.sources.eto} />
          · rain source
          <SourceTag tag={diag.sources.precip} />
        </li>
        <li>nitrogen {r1(diag.nitrogenKgHa)} kg/ha</li>
        {s.heat > 0 && (
          <li className="text-amber-600">
            heat stress {r1(s.heat)} · tMax {r1(diag.todayTMaxC)} °C &gt; max {diag.cropMaxTempC} °C
          </li>
        )}
        {s.cold > 0 && (
          <li className="text-sky-600">
            cold stress {r1(s.cold)} · tMin {r1(diag.todayTMinC)} °C &lt; min {diag.cropMinTempC} °C
          </li>
        )}
        {s.water > 0 && (
          <li className="text-amber-600">
            water stress {r1(s.water)} · bucket {Math.round(diag.moistureFrac * 100)}% full
          </li>
        )}
        {s.nitrogen > 0 && <li className="text-amber-600">nitrogen stress {r1(s.nitrogen)}</li>}
        {!stressed && <li className="text-muted-foreground/80">no stress — weather inside the crop's bands</li>}
      </ul>
    </div>
  );
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
  scenarioLocked,
  weather,
  weatherCached,
  climateBaseline,
  cropProgress,
  runLabel,
  runTimeline,
  runPlaying,
  runEnded,
  runSpeed,
  onRunPlay,
  onRunPause,
  onRunStop,
  onRunSeek,
  onRunSpeed,
  dayProvenance,
  cellDiagnostics,
  selectedRowKey,
  onSelectRow,
  showMoisture,
  onToggleMoisture,
}: SimDrawerProps) {
  const handleTimeOfDay = ([v]: number[]) => {
    onTimeOfDay(v);
    onAutoTime(false);
  };

  const days = Math.max(1, runTimeline?.days ?? 1);
  const eventDots = (runTimeline?.events ?? []).filter(
    (e) => e.kind === 'stress-onset' || e.kind === 'harvest-ready',
  );

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

          {runTimeline && (
            <div className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold" title={runLabel}>
                  {runLabel ?? 'Simulation run'}
                </span>
                {runEnded ? (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    complete
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                    run
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={runPlaying ? onRunPause : onRunPlay}
                  disabled={runEnded}
                  title={runEnded ? 'Run complete' : runPlaying ? 'Pause the run' : 'Play the run'}
                  className={cn(
                    'min-w-[72px] rounded px-2 py-1 text-xs font-medium',
                    runEnded
                      ? 'bg-muted text-muted-foreground/60'
                      : runPlaying
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground',
                  )}
                >
                  {runPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  type="button"
                  onClick={onRunStop}
                  title="Exit the run — back to the live season projection"
                  className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  ⏹ Exit
                </button>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  Day {Math.min(runTimeline.dayIndex, runTimeline.days)} of {runTimeline.days}
                </span>
              </div>
              <div className="relative mt-3">
                <Slider
                  aria-label="Seek to run day"
                  value={[Math.min(runTimeline.dayIndex, runTimeline.days)]}
                  min={0}
                  max={runTimeline.days}
                  step={1}
                  onValueChange={(v) => onRunSeek?.(v[0] ?? 0)}
                />
                <div className="pointer-events-none absolute inset-x-2 top-1/2 h-0 -translate-y-1/2">
                  {runTimeline.interventions.map((m, i) => (
                    <span
                      key={`iv-${i}`}
                      title={`Day ${m.day}: ${m.kind}`}
                      style={{ left: `${(Math.min(m.day, days) / days) * 100}%` }}
                      className="absolute h-2 w-px -translate-x-1/2 bg-foreground/40"
                    />
                  ))}
                  {eventDots.map((m, i) => (
                    <span
                      key={`ev-${i}`}
                      title={`Day ${m.day}: ${m.kind.replace('-', ' ')}`}
                      style={{ left: `${(Math.min(m.day, days) / days) * 100}%` }}
                      className={cn(
                        'absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background',
                        m.kind === 'harvest-ready' ? 'bg-green-500' : 'bg-amber-500',
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span id="ff-run-speed-label" className="shrink-0 text-xs text-muted-foreground">
                  Speed
                </span>
                <Select
                  value={String(runSpeed != null && runSpeed >= 15 ? 30 : runSpeed != null && runSpeed >= 4 ? 7 : 1)}
                  onValueChange={(v) => onRunSpeed?.(Number(v))}
                >
                  <SelectTrigger
                    aria-labelledby="ff-run-speed-label"
                    title="Simulated days per real second"
                    className="h-7 min-w-0 flex-1 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  {/* Portal renders at body level: lift above the z-[150] drawer */}
                  <SelectContent className="z-[200]">
                    <SelectItem value="1">1 day/s</SelectItem>
                    <SelectItem value="7">1 week/s</SelectItem>
                    <SelectItem value="30">1 month/s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {onToggleMoisture && (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Moisture overlay</span>
                    <button
                      type="button"
                      onClick={() => onToggleMoisture(!showMoisture)}
                      aria-pressed={showMoisture}
                      title="Tint planted cells by soil-water bucket fill (4 bands)"
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        showMoisture ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {showMoisture ? 'On' : 'Off'}
                    </button>
                  </div>
                  {showMoisture && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {MOISTURE_BANDS.map((b) => (
                        <span key={b.label} className="flex items-center gap-0.5">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ backgroundColor: b.color }}
                          />
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              {runTimeline ? 'Start' : 'Today'}
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

          {!runTimeline && (
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
          )}

          {!runTimeline && (
            <div className="flex shrink-0 items-center gap-2">
              <span id="ff-sim-scenario-label" className="w-20 shrink-0 text-xs text-muted-foreground">
                Scenario
              </span>
              <Select value={scenario} onValueChange={(v) => onScenario(v as ScenarioType)} disabled={scenarioLocked}>
                <SelectTrigger
                  aria-labelledby="ff-sim-scenario-label"
                  title={scenarioLocked ? 'Fixed by the active run' : 'Stress scenario'}
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
          )}

          {dayProvenance && (
            <div className="shrink-0">
              <span className="text-xs text-muted-foreground">Today's environment</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    ['tmin', dayProvenance.tMinC],
                    ['tmax', dayProvenance.tMaxC],
                    ['rain', dayProvenance.precipMm],
                    ['ET0', dayProvenance.etoMm],
                  ] as [string, EnvSourceTag][]
                ).map(([label, tag]) => (
                  <span
                    key={label}
                    title={`${label}: ${TAG_TITLE[tag]}`}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
                  >
                    {label} · {TAG_LABEL[tag]}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Crop growth{runTimeline ? ' (run state)' : ''}
              </span>
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
                <div className="flex flex-col gap-0.5">
                  {cropProgress.map((row) => {
                    const rowKey = `${row.id}|${row.plantedAt ?? ''}|${row.label ?? ''}`;
                    const diagKey = `${row.id}|${row.plantedAt ?? ''}`;
                    const selected = selectedRowKey === rowKey;
                    const diag = cellDiagnostics?.find((d) => `${d.cropId}|${d.plantedAt}` === diagKey);
                    return (
                      <div key={rowKey}>
                        <button
                          type="button"
                          onClick={() => onSelectRow?.(selected ? null : rowKey)}
                          title={cellDiagnostics ? 'Click for the driver breakdown' : undefined}
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
                        >
                          <span className="min-w-0 flex-1 truncate">{row.label ?? row.name}</span>
                          <span className="tracking-tighter text-foreground">
                            {'●'.repeat(row.stage)}{'○'.repeat(5 - row.stage)}
                          </span>
                          <span className="tabular-nums">{row.pct}%</span>
                          {row.stress > 0.2 && <span className="text-amber-500">stress</span>}
                        </button>
                        {selected && diag && <DiagnosticsPanel diag={diag} />}
                      </div>
                    );
                  })}
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
