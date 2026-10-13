import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      bdd: 'src/bdd.ts',
      config: 'src/core/config/index.ts',
      locators: 'src/locators/index.ts',
      db: 'src/clients/db/index.ts',
      mail: 'src/clients/mail/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    shims: true,
    target: 'node22',
    external: ['@playwright/test', 'playwright-bdd', '@testfly/reporter', '@testfly/ai', 'pg', 'mysql2', 'ioredis', 'imapflow'],
  },
  {
    entry: { 'cli/bin': 'src/cli/bin.ts' },
    format: ['cjs'],
    sourcemap: true,
    target: 'node22',
    external: ['@playwright/test', 'playwright-bdd', '@testfly/reporter', '@testfly/ai'],
  },
]);
