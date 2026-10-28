import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SimDrawer, type SimDrawerProps } from './SimDrawer';

const timeline = {
  dayIndex: 2,
  days: 5,
  events: [],
  interventions: [],
} as NonNullable<SimDrawerProps['runTimeline']>;

function renderDrawer(canReplay?: boolean, runPlaying = false): string {
  const runModelSupport = canReplay === undefined ? undefined : {
    model: 'crop-model-v2',
    status: canReplay ? 'qualified' : 'unsupported',
    canReplay,
    preserveStoredSummary: !canReplay,
    reasons: [],
  } as NonNullable<SimDrawerProps['runModelSupport']>;
  const props: SimDrawerProps = {
    open: true,
    onClose: () => {},
    scrubDate: '2026-10-02',
    onScrubDate: () => {},
    onToday: () => {},
    seasonDay: null,
    seasonComplete: false,
    onJumpSeasonStart: () => {},
    onDismissSeason: () => {},
    timeOfDay: 0.5,
    onTimeOfDay: () => {},
    autoTime: false,
    onAutoTime: () => {},
    playing: false,
    simSpeed: 1,
    onSimSpeed: () => {},
    scenario: 'baseline',
    onScenario: () => {},
    weather: null,
    weatherCached: false,
    cropProgress: [],
    runLabel: 'Synthetic run label',
    runModelSupport,
    runTimeline: timeline,
    runPlaying,
    runEnded: false,
    runSpeed: 7,
    onRunPlay: () => {},
    onRunPause: () => {},
    onRunStop: () => {},
    onRunSeek: () => {},
    onRunSpeed: () => {},
  };

  return renderToStaticMarkup(<SimDrawer {...props} />);
}

function expectTimelineControls(markup: string): void {
  expect(markup).toContain('▶ Play');
  expect(markup).toContain('aria-label="Seek to run day"');
  const runSpeedTrigger = markup.match(/<button\b[^>]*>/g)?.find((button) =>
    button.includes('aria-labelledby="ff-run-speed-label"'));
  expect(runSpeedTrigger).toBeDefined();
  expect(runSpeedTrigger).toContain('role="combobox"');
}

describe('SimDrawer run transport support', () => {
  it('hides unsupported run transport while preserving status and exit context', () => {
    for (const runPlaying of [false, true]) {
      const markup = renderDrawer(false, runPlaying);

      expect(markup).not.toMatch(/\b(?:Play|Pause)\b/);
      expect(markup).not.toContain('aria-label="Seek to run day"');
      expect(markup).not.toContain('id="ff-run-speed-label"');
      expect(markup).toContain('Synthetic run label');
      expect(markup).toContain('Day 2 of 5');
      expect(markup).toContain('⏹ Exit');
    }
  });

  it('keeps transport controls for supported and legacy runs', () => {
    expectTimelineControls(renderDrawer(true));
    expectTimelineControls(renderDrawer());
  });
});
