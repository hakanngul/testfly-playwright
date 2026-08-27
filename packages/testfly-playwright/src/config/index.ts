import { TestFlyConfig, TestFlyConfigInput, TestFlyConfigSchema } from './schema';
import { getTestFlyConfig, setTestFlyConfig, loadTestFlyConfigSync } from './loader';

/**
 * Define and validate TestFly configuration with full TypeScript autocomplete and Zod validation.
 * @param config Configuration options matching TestFlyConfig
 * @returns Fully validated and defaulted TestFlyConfig
 */
export function defineTestFlyConfig(config: TestFlyConfigInput): TestFlyConfig {
  const validated = TestFlyConfigSchema.parse(config);
  setTestFlyConfig(validated);
  return validated;
}

export * from './schema';
export { getTestFlyConfig, setTestFlyConfig, loadTestFlyConfigSync };
