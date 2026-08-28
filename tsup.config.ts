import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bdd: 'src/bdd.ts',
    'core/index': 'src/core/index.ts',
    'clients/index': 'src/clients/index.ts',
    'quality/index': 'src/quality/index.ts',
    'locators/index': 'src/locators/index.ts',
    'fixtures/index': 'src/fixtures/index.ts',
    'cli/bin': 'src/cli/bin.ts',

    // Backward-compatible entrypoints
    'config/index': 'src/core/config/index.ts',
    'context/index': 'src/core/context/index.ts',
    'steps/index': 'src/core/steps/index.ts',
    'client/index': 'src/clients/api/index.ts',
    'db/index': 'src/clients/db/index.ts',
    'mail/index': 'src/clients/mail/index.ts',
    'mobile/index': 'src/clients/mobile/index.ts',
    'mock/index': 'src/clients/mock/index.ts',
    'faker/index': 'src/clients/faker/index.ts',
    'visual/index': 'src/quality/visual/index.ts',
    'a11y/index': 'src/quality/a11y/index.ts',
    'performance/index': 'src/quality/performance/index.ts',
    'doctor/index': 'src/cli/doctor/index.ts',
    'scanner/index': 'src/cli/scanner/index.ts',
    'generator/index': 'src/cli/generator/index.ts',
    'notifications/index': 'src/cli/notifications/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: ['@playwright/test', 'playwright-bdd'],
});
