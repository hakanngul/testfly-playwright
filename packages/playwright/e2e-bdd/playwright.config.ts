import { defineConfig } from '../src/entries/config';

// BDD acceptance suite (playwright-bdd) for the TestFly parity features. Steps import the BUILT package
// ('@testfly/playwright/bdd'), so run `pnpm build` first; `pnpm test:bdd` does both bddgen and the run.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: { launchOptions: { executablePath } },
  testfly: {
    reporter: { enabled: false },
    bdd: { features: 'features/*.feature', steps: 'steps/*.steps.ts', outputDir: '.features-gen' },
  },
});
