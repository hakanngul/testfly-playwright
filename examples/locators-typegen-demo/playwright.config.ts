import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    baseUrl: 'https://www.saucedemo.com',
    // YAML locator catalog; run `testfly locators` to regenerate locators/index.d.ts.
    locators: { dir: 'locators' },
    bdd: {
      features: 'features/*.feature',
      steps: 'steps/*.steps.ts',
    },
  },
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  use: {
    // SauceDemo marks elements with `data-test="..."` (used by `testid:` locators).
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    {
      name: 'bdd-tests',
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
