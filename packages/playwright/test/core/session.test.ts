import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Browser } from '@playwright/test';
import { createSessionApi, defineSession, SessionStore } from '../../src/clients/auth/SessionManager';
import { SessionOptionsSchema } from '../../src/core/config/schema';
import { TestFlyError } from '../../src/core/errors';
import { launchChromium } from '../helpers/browser';
import { startServer, type TestServer } from '../helpers/server';
import { cleanupTmp, makeTmp } from '../helpers/tmp';

let browser: Browser;
let server: TestServer;

beforeAll(async () => {
  browser = await launchChromium();
  server = await startServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'sid=abc123; Path=/' });
      res.end('<html><body>login<script>localStorage.setItem("token","tok-1")</script></body></html>');
    } else if (req.url === '/whoami') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><script>document.title = localStorage.getItem("token") || "none"</script></body></html>');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>ok</body></html>');
    }
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

afterEach(cleanupTmp);

const options = (over: Partial<ReturnType<typeof SessionOptionsSchema.parse>> = {}) => SessionOptionsSchema.parse({ dir: '.sessions', ...over });

describe('SessionStore / session api', () => {
  it('define + as: runs setup once, caches storage state and restores cookies + localStorage', async () => {
    const base = makeTmp();
    const store = new SessionStore(browser, options(), base);
    const setup = vi.fn(async (page: import('@playwright/test').Page) => {
      await page.goto(`${server.url}/login`);
    });
    store.define('admin', setup);

    const contextOptions = { baseURL: server.url };
    const ctx1 = await browser.newContext(contextOptions);
    const api1 = createSessionApi(store, ctx1, contextOptions);
    await api1.as('admin');
    expect(setup).toHaveBeenCalledTimes(1);

    const file = api1.path('admin');
    expect(file).toBe(path.join(base, '.sessions', 'admin.json'));
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(state.cookies.find((c: { name: string }) => c.name === 'sid')?.value).toBe('abc123');
    expect(state.origins[0].localStorage).toEqual([{ name: 'token', value: 'tok-1' }]);

    const page1 = await ctx1.newPage();
    await page1.goto(`${server.url}/whoami`);
    expect(await page1.title()).toBe('tok-1');
    expect((await ctx1.cookies()).some((c) => c.name === 'sid' && c.value === 'abc123')).toBe(true);
    await ctx1.close();

    // Second as() in a fresh context reuses the cached file.
    const ctx2 = await browser.newContext(contextOptions);
    const api2 = createSessionApi(store, ctx2, contextOptions);
    await api2.as('admin');
    expect(setup).toHaveBeenCalledTimes(1);
    const page2 = await ctx2.newPage();
    await page2.goto(`${server.url}/whoami`);
    expect(await page2.title()).toBe('tok-1');
    await ctx2.close();
  });

  it('applies state to pages that are already open', async () => {
    const base = makeTmp();
    const store = new SessionStore(browser, options(), base);
    store.define('u', async (page) => {
      await page.goto(`${server.url}/login`);
    });
    const ctx = await browser.newContext();
    const open = await ctx.newPage();
    await open.goto(`${server.url}/other`);
    await createSessionApi(store, ctx, {}).as('u');
    expect(await open.evaluate(() => localStorage.getItem('token'))).toBe('tok-1');
    await ctx.close();
  });

  it('serializes concurrent as() calls for the same role', async () => {
    const store = new SessionStore(browser, options(), makeTmp());
    let calls = 0;
    store.define('r', async (page) => {
      calls++;
      await page.goto(`${server.url}/login`);
    });
    const ctxs = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    await Promise.all(ctxs.map((c) => createSessionApi(store, c, {}).as('r')));
    expect(calls).toBe(1);
    await Promise.all(ctxs.map((c) => c.close()));
  });

  it('recreates a session older than maxAgeMinutes and reuses a younger one', async () => {
    const base = makeTmp();
    const setup = vi.fn(async (page: import('@playwright/test').Page) => {
      await page.goto(`${server.url}/login`);
    });
    const store = new SessionStore(browser, options({ maxAgeMinutes: 10 }), base);
    store.define('m', setup);
    const ctx = await browser.newContext();
    const api = createSessionApi(store, ctx, {});
    await api.as('m');
    expect(setup).toHaveBeenCalledTimes(1);

    // fresh store (new worker) with a young file: reuse
    const young = new SessionStore(browser, options({ maxAgeMinutes: 10 }), base);
    young.define('m', setup);
    await createSessionApi(young, ctx, {}).as('m');
    expect(setup).toHaveBeenCalledTimes(1);

    // age the file beyond maxAge: recreate
    const file = api.path('m');
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(file, old, old);
    const stale = new SessionStore(browser, options({ maxAgeMinutes: 10 }), base);
    stale.define('m', setup);
    await createSessionApi(stale, ctx, {}).as('m');
    expect(setup).toHaveBeenCalledTimes(2);
    expect(fs.statSync(file).mtimeMs).toBeGreaterThan(old.getTime() + 60_000);
    await ctx.close();
  });

  it('with maxAgeMinutes=0 only reuses sessions created in this run', async () => {
    const base = makeTmp();
    const setup = vi.fn(async (page: import('@playwright/test').Page) => {
      await page.goto(`${server.url}/login`);
    });
    const file = path.join(base, '.sessions', 'old.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ cookies: [], origins: [] }));
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(file, past, past);
    const prev = process.env.TESTFLY_RUN_STARTED;
    process.env.TESTFLY_RUN_STARTED = String(Date.now() - 1000);
    try {
      const store = new SessionStore(browser, options(), base);
      store.define('old', setup);
      const ctx = await browser.newContext();
      await createSessionApi(store, ctx, {}).as('old');
      expect(setup).toHaveBeenCalledTimes(1);
      await ctx.close();
    } finally {
      if (prev === undefined) delete process.env.TESTFLY_RUN_STARTED;
      else process.env.TESTFLY_RUN_STARTED = prev;
    }
  });

  it('clear() drops one role or all roles', async () => {
    const store = new SessionStore(browser, options(), makeTmp());
    const setup = vi.fn(async (page: import('@playwright/test').Page) => {
      await page.goto(`${server.url}/login`);
    });
    store.define('a', setup);
    store.define('b', setup);
    const ctx = await browser.newContext();
    const api = createSessionApi(store, ctx, {});
    await api.as('a');
    await api.as('b');
    expect(fs.existsSync(api.path('a'))).toBe(true);
    await api.clear('a');
    expect(fs.existsSync(api.path('a'))).toBe(false);
    expect(fs.existsSync(api.path('b'))).toBe(true);
    await api.as('a');
    expect(setup).toHaveBeenCalledTimes(3);
    await api.clear();
    expect(fs.existsSync(api.path('a'))).toBe(false);
    expect(fs.existsSync(api.path('b'))).toBe(false);
    await ctx.close();
  });

  it('sanitizes role names for file paths', () => {
    const store = new SessionStore(browser, options(), '/base');
    expect(store.fileFor('team/admin user')).toBe(path.join('/base', '.sessions', 'team_admin_user.json'));
  });

  it('throws TF_SESSION_PROVIDER_MISSING listing known roles', async () => {
    const store = new SessionStore(browser, options(), makeTmp());
    store.define('known', async () => undefined);
    const ctx = await browser.newContext();
    const error = await createSessionApi(store, ctx, {})
      .as('ghost')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TestFlyError);
    expect((error as TestFlyError).code).toBe('TF_SESSION_PROVIDER_MISSING');
    expect((error as TestFlyError).message).toContain('ghost');
    expect((error as TestFlyError).details?.known).toContain('known');
    await ctx.close();
  });

  it('wraps setup failures in TF_SESSION_SETUP_FAILED, leaves no cache file and does not poison later attempts', async () => {
    const store = new SessionStore(browser, options(), makeTmp());
    let attempt = 0;
    store.define('flaky', async (page) => {
      attempt++;
      if (attempt === 1) throw new Error('bad password');
      await page.goto(`${server.url}/login`);
    });
    const ctx = await browser.newContext();
    const api = createSessionApi(store, ctx, {});
    const error = (await api.as('flaky').catch((e: unknown) => e)) as TestFlyError;
    expect(error.code).toBe('TF_SESSION_SETUP_FAILED');
    expect(error.message).toContain('bad password');
    expect((error.cause as Error).message).toBe('bad password');
    expect(fs.existsSync(api.path('flaky'))).toBe(false);
    expect(fs.existsSync(`${api.path('flaky')}.lock`)).toBe(false);
    await api.as('flaky');
    expect(attempt).toBe(2);
    expect(fs.existsSync(api.path('flaky'))).toBe(true);
    await ctx.close();
  });

  it('defineSession registers a global provider usable by any store', async () => {
    defineSession('global-role', async (page) => {
      await page.goto(`${server.url}/login`);
    });
    const store = new SessionStore(browser, options(), makeTmp());
    const ctx = await browser.newContext();
    await createSessionApi(store, ctx, {}).as('global-role');
    expect((await ctx.cookies(server.url)).some((c) => c.name === 'sid')).toBe(true);
    await ctx.close();
  });

  it('local providers take precedence over global ones', async () => {
    defineSession('prec', async () => {
      throw new Error('global should not run');
    });
    const store = new SessionStore(browser, options(), makeTmp());
    store.define('prec', async (page) => {
      await page.goto(`${server.url}/login`);
    });
    const ctx = await browser.newContext();
    await createSessionApi(store, ctx, {}).as('prec');
    await ctx.close();
  });

  it('removes a stale lock file instead of waiting forever', async () => {
    const base = makeTmp();
    const store = new SessionStore(browser, options(), base);
    store.define('locked', async (page) => {
      await page.goto(`${server.url}/login`);
    });
    const lock = `${store.fileFor('locked')}.lock`;
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(lock, old, old);
    const ctx = await browser.newContext();
    await createSessionApi(store, ctx, {}).as('locked');
    expect(fs.existsSync(store.fileFor('locked'))).toBe(true);
    await ctx.close();
  });
});
