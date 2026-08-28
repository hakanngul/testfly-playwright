import { test as base } from 'playwright-bdd';
import { ApiClient } from '../clients/api/ApiClient';
import { DbClient } from '../clients/db/DbClient';
import { MailClient } from '../clients/mail/MailClient';
import { StepLogger } from '../core/steps/StepLogger';
import { AuthManager } from '../clients/auth/AuthManager';
import { A11yClient } from '../quality/a11y/A11yClient';
import { MockClient } from '../clients/mock/MockClient';
import { PerformanceClient } from '../quality/performance/PerformanceClient';
import { VisualClient } from '../quality/visual/VisualClient';
import { FakerClient } from '../clients/faker/FakerClient';
import { MobileClient } from '../clients/mobile/MobileClient';
import { MobileScreen } from '../clients/mobile/MobileScreen';
import { TestContext } from '../core/context/TestContext';
import { TestDataManager } from '../core/context/TestDataManager';
import { LocatorRegistry } from '../locators/LocatorRegistry';
import { TypedLocatorKey } from '../locators/types';
import { Locator } from '@playwright/test';


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
import { locatorsFixture, locateFixture } from './locator.fixture';

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
  locators: LocatorRegistry;
  locate: (key: TypedLocatorKey) => Locator;
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
  locators: locatorsFixture,
  locate: locateFixture,
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
export * from './locator.fixture';






