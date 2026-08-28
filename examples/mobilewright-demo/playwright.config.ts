import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from '@testfly/playwright';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/*.steps.ts'],
  importTestFrom: require.resolve('@testfly/playwright'),
  disableWarnings: { importTestFrom: true },
});

export default defineConfig({
  testDir,
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
    {
      name: 'mobile-bdd',
      testDir,
    },
    {
      name: 'mobile-specs',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
