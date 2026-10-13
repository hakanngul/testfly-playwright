import { test as base } from '../../src/index';

export { expect } from '../../src/index';

/** The TestFly `test` plus the base URL of the local app server. */
export const test = base.extend<{ server: string }>({
  server: async ({}, use) => {
    const url = process.env.E2E_SERVER;
    if (!url) throw new Error('E2E_SERVER is not set (global setup did not run)');
    await use(url);
  },
});
