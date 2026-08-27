import { test as base } from '@playwright/test';
import { A11yClient } from '../a11y/A11yClient';

export interface A11yFixture {
  a11y: A11yClient;
}

export const a11yFixture = base.extend<A11yFixture>({
  a11y: async ({ page }, use) => {
    const a11yClient = new A11yClient(page);
    await use(a11yClient);
  },
});
