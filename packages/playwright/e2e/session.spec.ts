import { expect, test } from './support/test';

test.describe.configure({ mode: 'serial' });

test.describe('session fixture', () => {
  test.beforeEach(async ({ session, server }) => {
    session.define('admin', async (page) => {
      await page.goto(`${server}/login`);
    });
  });

  test('as() logs in a fresh context (cookie + localStorage)', async ({ session, page, server }) => {
    await session.as('admin');
    await page.goto(`${server}/whoami`);
    await expect(page.locator('#who')).toHaveText('cookie:tok-1');
  });

  test('second test reuses the cached session (login endpoint hit once)', async ({ session, page, server, api }) => {
    await session.as('admin');
    await page.goto(`${server}/whoami`);
    await expect(page.locator('#who')).toHaveText('cookie:tok-1');
    const count = await api.get(`${server}/login-count`);
    expect(count.jsonPath('$.count')).toBe(1);
  });

  test('without as() the page is anonymous', async ({ page, server }) => {
    await page.goto(`${server}/whoami`);
    await expect(page.locator('#who')).toHaveText('no-cookie:no-token');
  });

  test('unknown role throws TF_SESSION_PROVIDER_MISSING', async ({ session }) => {
    await expect(session.as('ghost')).rejects.toMatchObject({ code: 'TF_SESSION_PROVIDER_MISSING' });
  });

  test('failing setup throws TF_SESSION_SETUP_FAILED', async ({ session }) => {
    session.define('broken', async () => {
      throw new Error('login form changed');
    });
    await expect(session.as('broken')).rejects.toMatchObject({ code: 'TF_SESSION_SETUP_FAILED' });
  });
});
