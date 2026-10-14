import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    bdd: {
      features: 'features/*.feature',
      steps: 'steps/*.steps.ts',
    },
  },
  outputDir: 'reports/test-results',
  // Keep visual baselines outside the generated (git-ignored) BDD directory.
  snapshotPathTemplate: 'snapshots/{projectName}/{arg}{ext}',
  timeout: 30000,
  fullyParallel: true,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    {
      name: 'quality-bdd',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'quality-specs',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
