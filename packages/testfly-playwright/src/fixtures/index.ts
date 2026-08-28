import { test as base } from 'playwright-bdd';
import { ApiClient } from '../client/ApiClient';
import { DbClient } from '../db/DbClient';
import { MailClient } from '../mail/MailClient';
import { StepLogger } from '../steps/StepLogger';
import { AuthManager } from '../auth/AuthManager';
import { A11yClient } from '../a11y/A11yClient';
import { MockClient } from '../mock/MockClient';
import { PerformanceClient } from '../performance/PerformanceClient';
import { VisualClient } from '../visual/VisualClient';
import { FakerClient } from '../faker/FakerClient';
import { MobileClient } from '../mobile/MobileClient';
import { MobileScreen } from '../mobile/MobileScreen';
import { TestContext } from '../context/TestContext';
import { TestDataManager } from '../context/TestDataManager';

import { apiFixture } from './api.fixture';
import { dbFixture } from './db.fixture';
import { mailFixture } from './mail.fixture';
import { stepFixture } from './step.fixture';
import { authFixture } from './auth.fixture';
import { a11yFixture } from './a11y.fixture';
import { mockFixture } from './mock.fixture';
import { performanceFixture } from './performance.fixture';
import { visualFixture } from './visual.fixture';
import { fakerFixture } from './faker.fixture';
import { mobileFixture } from './mobile.fixture';
import { contextFixture } from './context.fixture';

export interface TestFlyFixtures {
  api: ApiClient;
  db: DbClient;
  mail: MailClient;
  step: StepLogger;
  auth: AuthManager;
  a11y: A11yClient;
  mock: MockClient;
  performance: PerformanceClient;
  visual: VisualClient;
  faker: FakerClient;
  data: FakerClient;
  mobile: MobileClient;
  screen: MobileScreen;
  scenarioContext: TestContext;
  testContext: TestContext;
  state: TestContext;
  testData: TestDataManager;
}

export const test = base.extend<TestFlyFixtures>({
  api: apiFixture,
  db: dbFixture,
  mail: mailFixture,
  step: stepFixture,
  auth: authFixture,
  a11y: async ({ page }, use) => {
    const a11yClient = new A11yClient(page);
    await use(a11yClient);
  },
  mock: async ({ page }, use) => {
    const mockClient = new MockClient(page);
    await use(mockClient);
    await mockClient.reset();
  },
  performance: async ({ page }, use) => {
    const performanceClient = new PerformanceClient(page);
    await use(performanceClient);
  },
  visual: async ({ page }, use) => {
    const visualClient = new VisualClient(page);
    await use(visualClient);
  },
  faker: async ({}, use) => {
    const fakerClient = new FakerClient();
    await use(fakerClient);
  },
  data: async ({}, use) => {
    const fakerClient = new FakerClient();
    await use(fakerClient);
  },
  mobile: async ({}, use) => {
    const mobileClient = new MobileClient();
    await use(mobileClient);
  },
  screen: async ({}, use) => {
    const mobileClient = new MobileClient();
    await use(mobileClient.screen);
  },
  scenarioContext: async ({}, use) => {
    const testContext = new TestContext();
    await use(testContext);
  },
  testContext: async ({}, use) => {
    const testContext = new TestContext();
    await use(testContext);
  },
  state: async ({}, use) => {
    const testContext = new TestContext();
    await use(testContext);
  },
  testData: async ({}, use) => {
    const testDataManager = new TestDataManager();
    await use(testDataManager);
  },
});


export { expect } from '@playwright/test';
export * from './api.fixture';
export * from './db.fixture';
export * from './mail.fixture';
export * from './step.fixture';
export * from './auth.fixture';
export * from './a11y.fixture';
export * from './mock.fixture';
export * from './performance.fixture';
export * from './visual.fixture';
export * from './faker.fixture';
export * from './mobile.fixture';
export * from './context.fixture';





