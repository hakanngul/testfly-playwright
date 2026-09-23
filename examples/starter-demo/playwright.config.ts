import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from '@testfly/playwright';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/*.steps.ts', 'steps/**/*.steps.ts'],
  importTestFrom: require.resolve('@testfly/playwright'),
  disableWarnings: { importTestFrom: true },
});

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
  testDir,
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  reporter: reporters,
  use: {
    baseURL: 'https://www.saucedemo.com',
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
