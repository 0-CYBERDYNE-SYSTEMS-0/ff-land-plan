import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:pages && npm run preview:pages',
    url: 'http://127.0.0.1:4173/ff-land-plan/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
