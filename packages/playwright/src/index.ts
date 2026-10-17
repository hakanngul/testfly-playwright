/**
 * @testfly/playwright — public API.
 *
 * Entry points: `@testfly/playwright` (this file), `/bdd`, `/config`, `/locators`, `/db`, `/mail`.
 */

// Test & fixtures
export {
  test,
  expect,
  mergeTests,
  coreTest,
  apiTest,
  dataTest,
  locatorTest,
  qualityTest,
  mockTest,
  sessionTest,
  quarantineTest,
  consoleTest,
} from './fixtures';
export type {
  TestFlyFixtures,
  CoreFixtures,
  CoreWorkerFixtures,
  ApiFixtures,
  DataWorkerFixtures,
  LocatorFixtures,
  LocatorWorkerFixtures,
  QualityFixtures,
  MockFixtures,
  SessionFixtures,
  ConsoleFixtures,
  ConsoleErrorsApi,
} from './fixtures';

// Extra matchers (already registered on `expect`)
export { testflyMatchers } from './assertions/matchers';
export type { TestFlyMatchers, MatcherTimeout } from './assertions/matchers';

// Sessions
export { defineSession } from './clients/auth';
export type { SessionApi, SessionSetup } from './clients/auth';

// Errors
export { TestFlyError, isTestFlyError } from './core/errors';
export type { TestFlyErrorCode, TestFlyErrorOptions } from './core/errors';

// Options (types only — use `defineConfig` from '@testfly/playwright/config')
export type {
  TestFlyOptions,
  TestFlyOptionsInput,
  AiOptions,
  ApiOptions,
  DbOptions,
  MailOptions,
  HealingOptions,
  ReporterOptions,
  SessionOptions,
  ConsoleErrorsOptions,
  FeatureFlags,
  MobileOptions,
} from './core/config/schema';

// Helpers handed to tests (types only)
export { TestContext } from './core/context';
export type { TypedContext, TestContextOptions, ExcelLoadOptions } from './core/context';
export type { StepApi, StepLevel } from './core/steps';
export type { ApiClient, ApiResponse, JsonEqualityOptions, ApiInterceptor, ApiBatchTask, ApiBatchResult, ApiBatchOptions, JsonSchemaSource, OpenApiSource, OpenApiMatchOptions } from './clients/api';
export type { DbClient, RedisClient } from './clients/db';
export type { MailClient } from './clients/mail';
export type { MockClient, MockServer, MockServerRequest, MockServerResponse, MockServerReply, MockStubOptions, MockRequestMatch } from './clients/mock';
export type { FakerClient } from './clients/faker';
export type { LocatorRegistry, TypedLocatorKey, LocateFn, HealingStrategy, HealContext, HealResult } from './locators';
export { registerHealingStrategy } from './locators';
export type { A11yClient, A11yOptions, AxeResults, AxeViolation } from './quality/a11y';
export type { VisualClient, VisualSnapshotOptions } from './quality/visual';
export type { PerformanceClient, WebVitals } from './quality/performance';
export type { FormClient, SmartFormFieldMap } from './quality/form';
