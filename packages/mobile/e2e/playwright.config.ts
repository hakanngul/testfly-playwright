import { defineConfig } from '@testfly/playwright/config';

// Fixture suite for @testfly/mobile. No device needed: the specs hand Mobilewright an in-memory fake
// driver (test/support/fakeDriver.ts) through the `mobileDriver` option. Imports the package SOURCE.
const ios = { platform: 'ios', bundleId: 'dev.testfly.demo', timeouts: { action: 2000, expect: 2000, appLaunch: 2000 } } as const;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  testfly: {
    reporter: { enabled: false },
    locators: { dir: 'locators' },
  },
  projects: [
    { name: 'ios', testMatch: /mobile\.spec\.ts$/, use: { testfly: { mobile: ios } } },
    { name: 'android', testMatch: /mobile\.spec\.ts$/, use: { testfly: { mobile: { ...ios, platform: 'android' } } } },
    // Every test in these specs is expected to FAIL (test.fail()) with a TestFly error.
    { name: 'errors', testMatch: /errors\.spec\.ts$/, use: { testfly: { mobile: ios } } },
    { name: 'unconfigured', testMatch: /unconfigured\.spec\.ts$/ },
  ],
});
