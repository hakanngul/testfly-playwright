import { MockClient, MockServer } from '../clients/mock';
import { coreTest } from './core';

/** Fixtures of {@link mockTest}. @public */
export interface MockFixtures {
  /** Network mocking helper for the current page; routes are reset after each test. */
  mock: MockClient;
  /**
   * Real HTTP stub server for tests without a page (`mockServer.url`, `get/post/...`, `expectRequest`).
   * One server per worker; stubs and history are reset after each test.
   */
  mockServer: MockServer;
}

/** Worker-scoped fixtures of {@link mockTest}. @internal */
export interface MockWorkerFixtures {
  _mockServerWorker: MockServer;
}

/**
 * Network mocking fixture set (`mock`, `mockServer`).
 * @public
 */
export const mockTest = coreTest.extend<MockFixtures, MockWorkerFixtures>({
  mock: async ({ page }, use) => {
    const client = new MockClient(page);
    try {
      await use(client);
    } finally {
      await client.reset();
    }
  },

  _mockServerWorker: [
    async ({}, use) => {
      const server = await new MockServer().start();
      try {
        await use(server);
      } finally {
        await server.stop();
      }
    },
    { scope: 'worker' },
  ],

  mockServer: async ({ _mockServerWorker }, use) => {
    _mockServerWorker.reset();
    try {
      await use(_mockServerWorker);
    } finally {
      _mockServerWorker.reset();
    }
  },
});
