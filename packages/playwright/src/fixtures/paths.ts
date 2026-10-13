import path from 'node:path';
import type { FullConfig } from '@playwright/test';

/**
 * Directory relative paths from TestFly options are resolved against: the directory of the
 * Playwright config file (falls back to `process.cwd()`).
 *
 * @internal
 */
export function configBaseDir(config: Pick<FullConfig, 'configFile'>): string {
  return config.configFile ? path.dirname(config.configFile) : process.cwd();
}
