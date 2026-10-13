import { test as base } from '@playwright/test';
import { TestFlyOptionsSchema, type TestFlyOptions } from '../core/config/schema';
import { TestContext } from '../core/context';
import { StepLogger, type StepApi } from '../core/steps';
import { FakerClient } from '../clients/faker';
import { configBaseDir } from './paths';

/** Test-scoped fixtures of {@link coreTest}. @public */
export interface CoreFixtures {
  /** Per-test key/value store with data loading and `{{key}}` interpolation. */
  ctx: TestContext;
  /** Named steps and structured logging that feed the TestFly reporter. */
  step: StepApi;
  /** Fake data generator (seed with `TESTFLY_FAKER_SEED` for reproducible data). */
  faker: FakerClient;
}

/** Worker-scoped fixtures of {@link coreTest}. @public */
export interface CoreWorkerFixtures {
  /** Resolved TestFly options (set through `defineConfig({ testfly })` or `test.use({ testfly })`). */
  testfly: TestFlyOptions;
}

const defaultOptions: TestFlyOptions = TestFlyOptionsSchema.parse({});

/**
 * Base fixture set: `testfly`, `ctx`, `step`, `faker`.
 * @public
 */
export const coreTest = base.extend<CoreFixtures, CoreWorkerFixtures>({
  testfly: [defaultOptions, { option: true, scope: 'worker' }],

  ctx: async ({}, use, testInfo) => {
    await use(new TestContext({ baseDir: configBaseDir(testInfo.config) }));
  },

  step: async ({}, use, testInfo) => {
    const logger = new StepLogger(testInfo);
    await use(logger.toApi());
    await logger.flush();
  },

  faker: async ({}, use) => {
    const raw = process.env.TESTFLY_FAKER_SEED;
    const seed = raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    await use(new FakerClient(seed));
  },
});
