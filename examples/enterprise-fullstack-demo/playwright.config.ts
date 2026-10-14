import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    api: { baseUrl: 'https://api.escuelajs.co/api/v1' },
    // The demo runs against the EXPLICIT in-memory stores (`db.mock`, `mail.mock`) so it works without services.
    // For real services use e.g. db: { client: 'postgres', connectionString: '${DATABASE_URL}' },
    // mail: { provider: 'mailpit', url: '${MAILPIT_URL:-http://localhost:8025}' } and redis: { url: '${REDIS_URL}' }.
    db: { client: 'mock' },
    mail: { provider: 'mock' },
    timeouts: { poll: 3000, pollInterval: 100 },
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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    {
      name: 'enterprise-bdd',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'enterprise-specs',
      testDir: './tests',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
