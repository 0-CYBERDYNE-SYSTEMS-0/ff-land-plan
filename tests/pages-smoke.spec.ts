import { expect, test, type Page } from '@playwright/test';
import { cropLibrary } from '../src/data/crops';
import { cropThermalParams } from '../src/data/cropThermalParams';
import { targetCellKey } from '../src/lib/growingTargets';
import { freezeEnvironmentModelInputsV2, freezeRunModelInputsV4 } from '../src/lib/sim/model-inputs';
import type { FrozenCropModelParametersV4, RunConfig, RunRecord } from '../src/lib/sim/types';

const previewOrigin = 'http://127.0.0.1:4173';
const unsupportedRunId = 'run:1:a08-environment-v2-unsupported';
const unsupportedRunLabel = 'A-08 unsupported environment-v2 fixture';
const storedSummaryYield = '42.42 kg DM';
const storedSummaryDays = '73 days simulated';

async function readStoredRunSummary(page: Page, runId: string): Promise<RunRecord['summary'] | null> {
  return page.evaluate(async (id) => {
    if (localStorage.getItem('ff-pro:idb-runs-authoritative:v1') === null) {
      const store = JSON.parse(localStorage.getItem('ff-pro:v1') ?? '{}') as {
        simRuns?: Array<{ id: string; summary: RunRecord['summary'] }>;
      };
      return store.simRuns?.find((record) => record.id === id)?.summary ?? null;
    }

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ff-pro-data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains('runs')) return null;
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = database.transaction('runs', 'readonly').objectStore('runs').getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
      const record = records.find((candidate) => (
        !!candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === id
      )) as { summary?: RunRecord['summary'] } | undefined;
      return record?.summary ?? null;
    } finally {
      database.close();
    }
  }, runId);
}

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

function unsupportedLifecycleRunRecord(): RunRecord {
  const base = unsupportedEnvironmentRunRecord();
  const crop = cropLibrary.find((entry) => entry.slug === 'broccoli')!;
  const cellKey = targetCellKey({ kind: 'floor' }, '0,0');
  const config: RunConfig = {
    ...base.config,
    basePlan: { ...base.config.basePlan, planting: { '0,0': crop.id } },
    cropStartEvents: { [cellKey]: 'transplanting' },
  };
  const evidence = {
    evidenceId: 'a08-unsupported-lifecycle-browser-fixture',
    sourceCitation: 'Synthetic browser fixture; no crop-performance claim',
    sourceUrl: 'test-only:a08-unsupported-lifecycle',
    validDomain: 'software browser test only',
  };
  const parameter: FrozenCropModelParametersV4 = {
    cropId: crop.id,
    thermal: cropThermalParams.find((entry) => entry.cropId === crop.id)!,
    rootZone: {
      method: 'FAO-56',
      effectiveRootDepthCm: 20,
      depletionFraction: 0.5,
      cropCoefficient: 1,
      initialStorageFraction: 0.7,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic root-zone inputs isolate software support handling.'],
      evidence,
    },
    lifecycle: 'unsupported',
    production: {
      equationFamily: 'LINTUL-net-RUE',
      rueGPerMjInterceptedPar: 2,
      status: 'qualified',
      missing: [],
      limitations: ['Synthetic production inputs isolate software support handling.'],
      evidence,
      canopy: {
        kPar: 0.65,
        specificLeafAreaM2PerKg: 20,
        leafStemPartitionParameterM2PerKg: 1,
        evidence,
      },
      allocation: {
        canopyShare: 0.7,
        harvestableShare: 0.3,
        classification: 'synthetic',
        evidenceId: evidence.evidenceId,
        validDomain: evidence.validDomain,
      },
    },
  };
  const modelInputs = freezeRunModelInputsV4(config, {
    soil: { awcMmPerCm: 1.5, organicMatterPct: 5, source: 'usda-sda' },
    crops: [crop],
    cropParametersV4: [parameter],
    cropCanopyEstablishmentByCell: {
      [cellKey]: {
        startEvent: 'transplanting',
        establishedAtDate: config.startDate,
        initialCanopyDryMatterGPerM2: 10,
        initialHarvestableDryMatterGPerM2: 5,
        evidence: { classification: 'synthetic', evidenceId: evidence.evidenceId, validDomain: evidence.validDomain },
      },
    },
  });
  const environmentModelInputs = freezeEnvironmentModelInputsV2(config);
  if (!environmentModelInputs) throw new Error('Expected frozen environment-v2 browser inputs');

  return {
    ...base,
    id: 'run:1:a08-unsupported-lifecycle',
    label: 'A-08 unsupported lifecycle fixture',
    config: { ...config, modelInputs, environmentModelInputs },
    summary: {
      ...base.summary,
      modelQualification: {
        status: 'unsupported',
        reasons: ['Synthetic stored-summary sentinel; not a model result.'],
      },
    },
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

test('unsupported v4 crop lifecycle is explained in World and retains its stored summary', async ({ page }) => {
  test.setTimeout(180_000);
  const run = unsupportedLifecycleRunRecord();
  const lifecycleCropId = run.config.modelInputs?.model === 'run-inputs-v4'
    ? run.config.modelInputs.cropParameters[0]?.cropId
    : undefined;
  if (lifecycleCropId === undefined) throw new Error('Expected the frozen lifecycle crop parameter');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(({ record }) => {
    if (sessionStorage.getItem('ff-a08-lifecycle-run-seeded') === '1') return;
    localStorage.removeItem('ff-pro:idb-runs-authoritative:v1');
    localStorage.setItem('ff-pro:v1', JSON.stringify({ simRuns: [record] }));
    sessionStorage.setItem('ff-a08-lifecycle-run-seeded', '1');
  }, { record: run });

  await page.goto('/ff-land-plan/#/farms/1/simulations', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(run.label)).toBeVisible();
  await expect(page.getByText(storedSummaryYield, { exact: true })).toHaveCount(0);
  await expect(page.getByText(new RegExp(storedSummaryDays))).toHaveCount(0);
  await expect.poll(() => readStoredRunSummary(page, run.id)).toEqual(run.summary);

  await page.getByRole('button', { name: 'Open in world' }).click();
  await expect(page).toHaveURL((url) =>
    url.pathname === '/ff-land-plan/' &&
    url.searchParams.get('ffrun') === run.id &&
    url.searchParams.get('ffview') === 'world' &&
    url.hash === '#/farms/1/map',
  );
  const worldMode = page.getByRole('button', { name: 'World', exact: true });
  await expect(worldMode).toBeVisible({ timeout: 30_000 });
  await expect(worldMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Loading 3D world…')).toHaveCount(0);

  const simulationDrawer = page.getByRole('dialog', { name: 'Simulation controls' });
  await expect(simulationDrawer).toBeVisible();
  const unsupportedStatus = simulationDrawer.getByRole('status');
  await expect(unsupportedStatus).toContainText(
    `Crop ${lifecycleCropId}: lifecycle 'unsupported' cannot use crop-model-v4 plant canopy interception, dry-matter production, or canopy/harvestable-pool allocation calculations.`,
  );
  await expect(unsupportedStatus).not.toContainText('Frozen environment-v2 inputs are missing or have an unknown version.');
  await expect(unsupportedStatus).not.toContainText('one or more frozen v4 parameter values are missing, invalid, or unsupported.');
  await expect(page.getByRole('button', { name: 'Replay unavailable', exact: true })).toBeDisabled();
  await expect(simulationDrawer.getByRole('button', { name: /play/i })).toHaveCount(0);
  await expect(simulationDrawer.getByRole('slider', { name: 'Seek to run day' })).toHaveCount(0);

  await page.goto('/ff-land-plan/#/farms/1/simulations', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(run.label)).toBeVisible();
  await expect(page.getByText(storedSummaryYield, { exact: true })).toHaveCount(0);
  await expect(page.getByText(new RegExp(storedSummaryDays))).toHaveCount(0);
  await expect.poll(() => readStoredRunSummary(page, run.id)).toEqual(run.summary);
  expect(pageErrors).toEqual([]);
});
