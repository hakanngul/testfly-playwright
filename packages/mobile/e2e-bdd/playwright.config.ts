import { defineConfig } from '@testfly/playwright/config';

// BDD suite for @testfly/mobile (playwright-bdd) on a fake device. The steps import the BUILT package
// ('@testfly/mobile/bdd'), so run `pnpm build` first; `pnpm test:bdd` does both bddgen and the run.
export default defineConfig({
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  testfly: {
    reporter: { enabled: false },
    locators: { dir: 'locators' },
    mobile: { platform: 'ios', bundleId: 'dev.testfly.demo', timeouts: { action: 2000, expect: 2000, appLaunch: 2000 } },
    // A real project would use '@testfly/mobile/bdd'; this suite swaps in the fake device first.
    bdd: { features: 'features/*.feature', steps: 'steps/*.steps.ts', outputDir: '.features-gen', importTestFrom: 'steps/fixtures.ts' },
  },
});
