import { test as base } from '@playwright/test';
import { TestContext } from '../context/TestContext';
import { TestDataManager } from '../context/TestDataManager';

export interface ContextFixture {
  scenarioContext: TestContext;
  testContext: TestContext;
  state: TestContext;
  testData: TestDataManager;
}

export const contextFixture = base.extend<ContextFixture>({
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

