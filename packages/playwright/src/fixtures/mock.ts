import { MockClient } from '../clients/mock';
import { coreTest } from './core';

/** Fixtures of {@link mockTest}. @public */
export interface MockFixtures {
  /** Network mocking helper for the current page; routes are reset after each test. */
  mock: MockClient;
}

/**
 * Network mocking fixture set (`mock`).
 * @public
 */
export const mockTest = coreTest.extend<MockFixtures>({
  mock: async ({ page }, use) => {
    const client = new MockClient(page);
    try {
      await use(client);
    } finally {
      await client.reset();
    }
  },
});
