import { test as base } from '@playwright/test';
import { PerformanceClient } from '../performance/PerformanceClient';

export interface PerformanceFixture {
  performance: PerformanceClient;
}

export const performanceFixture = base.extend<PerformanceFixture>({
  performance: async ({ page }, use) => {
    const performanceClient = new PerformanceClient(page);
    await use(performanceClient);
  },
});
