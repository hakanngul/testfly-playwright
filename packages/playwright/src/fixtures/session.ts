import { createSessionApi, SessionStore, type SessionApi } from '../clients/auth';
import { coreTest } from './core';
import { configBaseDir } from './paths';

/** Test-scoped fixtures of {@link sessionTest}. @public */
export interface SessionFixtures {
  /** Role based login with cached storage state: `await session.as('admin')`. */
  session: SessionApi;
}

/** Worker-scoped fixtures of {@link sessionTest}. @internal */
export interface SessionWorkerFixtures {
  _sessionStore: SessionStore;
}

/**
 * Session fixture set (`session`). The cache lives in a worker-scoped store; the `session` facade
 * is test-scoped because it restores state into the test's own browser context.
 *
 * @public
 */
export const sessionTest = coreTest.extend<SessionFixtures, SessionWorkerFixtures>({
  _sessionStore: [
    async ({ browser, testfly }, use, workerInfo) => {
      await use(new SessionStore(browser, testfly.session, configBaseDir(workerInfo.config)));
    },
    { scope: 'worker' },
  ],

  session: async ({ _sessionStore, context, testfly, baseURL, ignoreHTTPSErrors, locale, timezoneId, userAgent, viewport, httpCredentials, extraHTTPHeaders }, use) => {
    const options = {
      baseURL: baseURL ?? testfly.baseUrl,
      ignoreHTTPSErrors,
      locale,
      timezoneId,
      userAgent,
      viewport,
      httpCredentials,
      extraHTTPHeaders,
    };
    await use(createSessionApi(_sessionStore, context, options));
  },
});
