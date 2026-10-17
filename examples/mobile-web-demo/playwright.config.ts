import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

// Mobile WEB via Playwright device emulation (iPhone 15 viewport, touch, user agent).
// Native iOS/Android automation is not available yet (@testfly/mobile is experimental).
export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev',
    locators: { dir: 'locators' },
    bdd: {
      features: 'features/*.feature',
      steps: 'steps/*.steps.ts',
    },
  },
  outputDir: 'reports/test-results',
  timeout: 45000,
  fullyParallel: true,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  use: {
    ...devices['iPhone 15'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    {
      name: 'mobile-bdd',
    },
    {
      name: 'mobile-specs',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
