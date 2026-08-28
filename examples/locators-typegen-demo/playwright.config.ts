import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from '@testfly/playwright';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/*.steps.ts'],
  importTestFrom: require.resolve('@testfly/playwright'),
  disableWarnings: { importTestFrom: true },
});

export default defineConfig({
  testDir,
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  use: {
    baseURL: 'https://www.saucedemo.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'bdd-tests',
      testDir,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'spec-tests',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
