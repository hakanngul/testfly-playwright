import { ApiClient } from '../clients/api';
import { coreTest } from './core';

/** Fixtures of {@link apiTest}. @public */
export interface ApiFixtures {
  /** HTTP client with retries, auth helpers and request logging. */
  api: ApiClient;
}

/**
 * HTTP API fixture set (`api`).
 * @public
 */
export const apiTest = coreTest.extend<ApiFixtures>({
  api: async ({ request, testfly }, use, testInfo) => {
    const client = new ApiClient(request, { ...testfly.api, baseUrl: testfly.api.baseUrl ?? testfly.baseUrl }, testInfo);
    try {
      await use(client);
    } finally {
      await client.flushEvents();
    }
  },
});
