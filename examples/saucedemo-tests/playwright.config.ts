import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from '@testfly/playwright';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/*.steps.ts', 'steps/**/*.steps.ts'],
  importTestFrom: require.resolve('@testfly/playwright'),
  disableWarnings: { importTestFrom: true },
});

export default defineConfig({
  testDir,
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results', detail: true, suiteTitle: true }],
    cucumberReporter('html', { outputFile: 'reports/cucumber/index.html' }),
    cucumberReporter('json', { outputFile: 'reports/cucumber/report.json' }),
  ],
  use: {
    baseURL: 'https://demo.playwright.dev/todomvc',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'bdd-tests',
      testDir,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'spec-tests',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
