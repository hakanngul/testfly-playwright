import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';
import { cucumberReporter } from '@testfly/playwright/bdd';

export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    env: 'local',
    api: { baseUrl: 'https://jsonplaceholder.typicode.com' },
    // Explicit in-memory table store (`db.mock`); switch to postgres/mysql for a real database.
    db: { client: 'mock' },
    // Redis is optional: set REDIS_URL (and install ioredis) to enable the redis spec.
    ...(process.env.REDIS_URL ? { redis: { url: process.env.REDIS_URL } } : {}),
    bdd: {
      features: 'features/*.feature',
      steps: ['steps/*.steps.ts', 'steps/**/*.steps.ts'],
    },
  },
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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    {
      name: 'bdd-tests',
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
