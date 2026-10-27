import { expect, test } from '@playwright/test';

const previewOrigin = 'http://127.0.0.1:4173';

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
