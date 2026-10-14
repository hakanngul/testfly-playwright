import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';
import { cucumberReporter } from '@testfly/playwright/bdd';

const reporters: any[] = [
  ['html', { outputFolder: 'reports/playwright', open: 'never' }],
  ['list'],
  cucumberReporter('html', { outputFile: 'reports/cucumber/index.html' }),
  cucumberReporter('json', { outputFile: 'reports/cucumber/report.json' }),
];

try {
  require.resolve('allure-playwright');
  reporters.push(['allure-playwright', { resultsDir: 'reports/allure-results', detail: true, suiteTitle: true }]);
} catch {
  // allure-playwright not installed
}

export default defineConfig({
  testfly: {
    baseUrl: 'https://www.saucedemo.com',
    env: 'local',
    api: { baseUrl: 'https://api.escuelajs.co' },
    bdd: {
      features: 'features/*.feature',
      steps: ['steps/*.steps.ts', 'steps/**/*.steps.ts'],
    },
  },
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  reporter: reporters,
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
