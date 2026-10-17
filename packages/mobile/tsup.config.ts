import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', bdd: 'src/bdd.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node22',
  // No code splitting: tsup's split CommonJS output rewrites `import()` to `require()`, which cannot load
  // the ESM-only mobilewright (an optional peer, imported at runtime). Shared state lives on globalThis.
  external: ['@playwright/test', '@testfly/playwright', 'playwright-bdd', 'mobilewright'],
});
