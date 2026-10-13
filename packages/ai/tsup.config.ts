import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', reporter: 'src/reporter.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node22',
  external: ['@playwright/test', '@testfly/playwright', '@testfly/reporter'],
});
