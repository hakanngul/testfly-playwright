import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bdd: 'src/bdd.ts',
    'config/index': 'src/config/index.ts',
    'fixtures/index': 'src/fixtures/index.ts',
    'client/index': 'src/client/index.ts',
    'db/index': 'src/db/index.ts',
    'mail/index': 'src/mail/index.ts',
    'steps/index': 'src/steps/index.ts',
    'cli/bin': 'src/cli/bin.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: ['@playwright/test', 'playwright-bdd'],
});
