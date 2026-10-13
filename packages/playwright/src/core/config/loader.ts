import path from 'path';
import fs from 'fs';
import { TestFlyConfig, TestFlyConfigSchema, TestFlyConfigInput } from './schema';

let activeConfig: TestFlyConfig | null = null;

export function getTestFlyConfig(): TestFlyConfig {
  if (!activeConfig) {
    activeConfig = loadTestFlyConfigSync();
  }
  return activeConfig;
}

export function setTestFlyConfig(config: TestFlyConfigInput): TestFlyConfig {
  activeConfig = TestFlyConfigSchema.parse(config);
  return activeConfig;
}

export function loadTestFlyConfigSync(customPath?: string): TestFlyConfig {
  const cwd = process.cwd();
  const possiblePaths = customPath
    ? [path.resolve(cwd, customPath)]
    : [
        path.resolve(cwd, 'testfly.config.ts'),
        path.resolve(cwd, 'testfly.config.js'),
        path.resolve(cwd, 'testfly.config.mjs'),
        path.resolve(cwd, 'testfly.config.json'),
      ];

  let rawConfig: Record<string, unknown> = {};

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      if (configPath.endsWith('.json')) {
        try {
          const content = fs.readFileSync(configPath, 'utf8');
          rawConfig = JSON.parse(content);
          break;
        } catch (e) {
          console.warn(`[TestFly] Failed to parse JSON config at ${configPath}:`, e);
        }
      } else {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require(configPath);
          rawConfig = mod.default || mod;
          break;
        } catch {
          // Could be TypeScript or ESM requiring loader, fallback to defaults + env
        }
      }
    }
  }

  // Apply environment variables overrides
  if (process.env.TESTFLY_BASE_URL) {
    rawConfig.baseUrl = process.env.TESTFLY_BASE_URL;
  }
  if (process.env.TESTFLY_API_BASE_URL) {
    rawConfig.apiBaseUrl = process.env.TESTFLY_API_BASE_URL;
  }
  if (process.env.TESTFLY_ENV) {
    rawConfig.env = process.env.TESTFLY_ENV as any;
  }

  return TestFlyConfigSchema.parse(rawConfig);
}
