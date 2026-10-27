import { expect, test } from '@playwright/test';
import type { RunRecord } from '../src/lib/sim/types';

const previewOrigin = 'http://127.0.0.1:4173';
const unsupportedRunId = 'run:1:a08-environment-v2-unsupported';
const unsupportedRunLabel = 'A-08 unsupported environment-v2 fixture';
const storedSummaryYield = '42.42 kg DM';
const storedSummaryDays = '73 days simulated';

function unsupportedEnvironmentRunRecord(): RunRecord {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const envSeries = Array.from({ length: 73 }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
      date,
      tMinC: 10,
      tMaxC: 20,
      precipMm: 0,
      etoMm: 0,
      dliNaturalMol: 0,
      gddBase10C: 10,
      provenance: {
        tMinC: 'default',
        tMaxC: 'default',
        precipMm: 'default',
        etoMm: 'default',
        dliNaturalMol: 'default',
      },
    };
  });

  return {
    id: unsupportedRunId,
    farmId: 1,
    label: unsupportedRunLabel,
    createdAt: '2026-04-01T00:00:00.000Z',
    config: {
      farmId: 1,
      cropModelVersion: 'crop-model-v4',
      climateModel: 'environment-v2',
      environment: {
        id: 'environment:1:a08-greenhouse',
        farmId: 1,
        archetype: 'greenhouse-glass',
        label: 'A-08 greenhouse',
        x: 0,
        y: 0,
        widthM: 1,
        heightM: 1,
        cellM: 0.25,
      },
      basePlan: {
        farmId: 1,
        widthM: 1,
        heightM: 1,
        cellM: 0.25,
        allowOutsideBeds: false,
        ground: {},
        planting: {},
        updatedAt: '2026-01-01',
      },
      modelInputs: {
        model: 'run-inputs-v4',
        parameterSetVersion: 'crop-parameters-v5',
        soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' },
        crops: [],
        cropParameters: [],
        establishmentByCell: {},
        qualification: { status: 'supported', reasons: [] },
      },
      startDate: '2026-01-01',
      dayCount: 73,
      seed: 8,
      scenario: 'baseline',
      tempDeltaC: 0,
      precipMultiplier: 1,
      interventions: [],
    },
    envSeries,
    summary: {
      daysSimulated: 73,
      rainMm: 1.23,
      irrigatedMm: 2.34,
      etoMmTotal: 3.45,
      totalYieldKg: 42.42,
      yieldBasis: 'dry-matter',
      yieldKgByCrop: {},
      waterUseMm: 4.56,
      stressCellDays: 7,
      stressDays: { water: 1, heat: 2, cold: 3, nitrogen: 1 },
      outbreakDays: 0,
      meanNitrogenKgHa: 8.9,
      matureCells: 1,
      cellCount: 1,
      harvestReadyDay: 12,
      eventCounts: {},
      modelQualification: { status: 'qualified', reasons: ['A-08 stored summary sentinel'] },
    },
    status: 'complete',
  };
}

test('production build boots under the GitHub Pages project base path', async ({ page }) => {
  const localAssetPaths: string[] = [];
  const localAssetFailures: string[] = [];
  const pageErrors: string[] = [];

  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== previewOrigin || !/\.(?:js|css)$/.test(url.pathname)) return;
    localAssetPaths.push(url.pathname);
    if (response.status() >= 400) localAssetFailures.push(`${response.status()} ${url.pathname}`);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/ff-land-plan/#/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Farm Dashboard' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/ff-land-plan/');
  expect(localAssetPaths.length).toBeGreaterThan(0);
  expect(localAssetPaths.every((path) => path.startsWith('/ff-land-plan/assets/'))).toBe(true);
  expect(localAssetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);

  await page.screenshot({
    path: process.env.FF_SMOKE_SCREENSHOT ?? 'test-results/pages-smoke.png',
    fullPage: true,
  });
});

test('unsupported environment-v2 run opens under Pages and retains its stored summary', async ({ page }) => {
  test.setTimeout(180_000);
  const run = unsupportedEnvironmentRunRecord();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(({ record }) => {
    if (sessionStorage.getItem('ff-a08-run-seeded') === '1') return;
    localStorage.removeItem('ff-pro:idb-runs-authoritative:v1');
    localStorage.setItem('ff-pro:v1', JSON.stringify({ simRuns: [record] }));
    sessionStorage.setItem('ff-a08-run-seeded', '1');
  }, { record: run });

  await page.goto('/ff-land-plan/#/farms/1/simulations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(unsupportedRunLabel)).toBeVisible();
  await expect(page.getByText(storedSummaryYield, { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(storedSummaryDays))).toBeVisible();

  await page.getByRole('button', { name: 'Open in world' }).click();
  await expect(page).toHaveURL((url) =>
    url.pathname === '/ff-land-plan/' &&
    url.searchParams.get('ffrun') === unsupportedRunId &&
    url.searchParams.get('ffview') === 'world' &&
    url.hash === '#/farms/1/map',
  );
  const worldUrl = new URL(page.url());
  expect(worldUrl.pathname).toBe('/ff-land-plan/');
  expect(worldUrl.searchParams.get('ffrun')).toBe(unsupportedRunId);
  expect(worldUrl.searchParams.get('ffview')).toBe('world');
  expect(worldUrl.hash).toBe('#/farms/1/map');
  const worldMode = page.getByRole('button', { name: 'World', exact: true });
  await expect(worldMode).toBeVisible({ timeout: 30_000 });
  await expect(worldMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Loading 3D world…')).toHaveCount(0);

  const simulationDrawer = page.getByRole('dialog', { name: 'Simulation controls' });
  await expect(simulationDrawer).toBeVisible();
  const unsupportedStatus = simulationDrawer.getByRole('status');
  await expect(unsupportedStatus).toContainText(
    /This model version cannot replay these frozen inputs; its saved summary is left unchanged\.[\s\S]*Frozen environment-v2 inputs are missing or have an unknown version\./,
  );
  await expect(page.getByRole('button', { name: 'Replay unavailable', exact: true })).toBeDisabled();
  await expect(simulationDrawer.getByRole('button', { name: /play/i })).toHaveCount(0);
  await expect(simulationDrawer.getByRole('slider', { name: 'Seek to run day' })).toHaveCount(0);

  await page.goto('/ff-land-plan/#/farms/1/simulations', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(unsupportedRunLabel)).toBeVisible();
  await expect(page.getByText(storedSummaryYield, { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(storedSummaryDays))).toBeVisible();
  expect(pageErrors).toEqual([]);
});
