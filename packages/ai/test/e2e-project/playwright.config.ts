import { defineConfig } from '@testfly/playwright/config';
import type { ReporterDescription } from '@playwright/test';

const reporters: ReporterDescription[] = [['json', { outputFile: process.env.PW_JSON_OUT ?? 'out.json' }]];
if (process.env.AI_REPORTER) reporters.push([process.env.AI_REPORTER_PATH!, { provider: 'anthropic', apiKey: 'unused-fake-key', outputDir: process.env.AI_OUTPUT_DIR }]);

export default defineConfig({
  testDir: '.',
  testMatch: process.env.PW_MATCH ?? '*.pw.ts',
  outputDir: process.env.PW_OUTPUT_DIR ?? 'test-results',
  reporter: reporters,
  workers: 1,
  retries: 0,
  testfly: { ai: { mode: (process.env.AI_MODE as 'live' | 'replay' | 'off') ?? 'live', cacheDir: process.env.AI_CACHE_DIR ?? '.testfly', apiKey: 'unused-fake-key' } },
  use: { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' } },
});
