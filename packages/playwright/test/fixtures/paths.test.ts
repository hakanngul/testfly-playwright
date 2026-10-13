import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configBaseDir } from '../../src/fixtures/paths';

describe('configBaseDir', () => {
  it('is the directory of the config file', () => {
    expect(configBaseDir({ configFile: '/proj/e2e/playwright.config.ts' })).toBe(path.dirname('/proj/e2e/playwright.config.ts'));
  });
  it('falls back to cwd without a config file', () => {
    expect(configBaseDir({ configFile: undefined })).toBe(process.cwd());
  });
});
