import { defineConfig } from '../src/entries/config';

// Integration suite for the TestFly fixtures. Imports the package SOURCE directly (Playwright's TS loader
// compiles it on the fly); the same code is what ships in dist/.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  globalSetup: './support/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  // The visual baselines are flat colour boxes (no text/fonts), so they render identically on every OS:
  // drop the default `{-snapshotSuffix}` (platform) so one baseline set serves linux, macOS and Windows.
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',
  use: { launchOptions: { executablePath } },
  testfly: {
    reporter: { enabled: false },
    locators: { dir: 'locators' },
    timeouts: { poll: 2000, pollInterval: 50 },
  },
  projects: [
    { name: 'main', testMatch: /(core|api|locate|quality|quarantine|session|assertions|console|mock-server|suite-context)\.spec\.ts$/ },
    {
      name: 'data',
      testMatch: /data\.spec\.ts$/,
      use: { testfly: { db: { client: 'mock' }, mail: { provider: 'mock' }, timeouts: { poll: 400, pollInterval: 50 } } },
    },
    {
      name: 'console-fail',
      testMatch: /console-fail\.spec\.ts$/,
      use: { testfly: { consoleErrors: { mode: 'fail', ignore: ['^ignored'] } } },
    },
    { name: 'load', testMatch: /load\.spec\.ts$/, use: { testfly: { load: { k6Path: process.env.K6_PATH || 'k6' } } } },
    // Every test in these specs is expected to FAIL (test.fail()); the vitest suite checks the error codes.
    { name: 'unconfigured', testMatch: /unconfigured\.spec\.ts$/ },
  ],
});
