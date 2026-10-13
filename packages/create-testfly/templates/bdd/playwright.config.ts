import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    env: 'local',
    bdd: {
      features: 'features/**/*.feature',
      steps: 'steps/**/*.ts',
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    { name: 'bdd', use: { ...devices['Desktop Chrome'] } },
    { name: 'e2e', testDir: './tests', use: { ...devices['Desktop Chrome'] } },
  ],
});
