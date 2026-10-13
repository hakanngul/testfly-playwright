import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      bdd: 'src/entries/bdd.ts',
      config: 'src/entries/config.ts',
      locators: 'src/entries/locators.ts',
      db: 'src/entries/db.ts',
      mail: 'src/entries/mail.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    shims: true,
    target: 'node22',
    // The sub-entries share code through chunks; keep package deps external.
    splitting: true,
    external: ['@playwright/test', 'playwright-bdd', '@axe-core/playwright', '@testfly/reporter', '@testfly/ai', 'pg', 'mysql2', 'ioredis', 'imapflow'],
  },
  {
    entry: { 'cli/bin': 'src/cli/bin.ts' },
    format: ['cjs'],
    sourcemap: true,
    target: 'node22',
    external: ['@playwright/test', 'playwright-bdd', '@axe-core/playwright', '@testfly/reporter', '@testfly/ai'],
  },
]);
