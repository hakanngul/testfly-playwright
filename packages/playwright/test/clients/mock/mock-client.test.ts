import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { MockClient } from '../../../src/clients/mock';
import { launchChromium } from '../../helpers/browser';
import { startServer, type TestServer } from '../../helpers/clientsHttp';

let browser: Browser;
let server: TestServer;
let page: Page;
let mock: MockClient;

beforeAll(async () => {
  browser = await launchChromium();
  server = await startServer((req, res) => {
    if (req.path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><title>t</title><body>ok</body>');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ real: true, path: req.path, method: req.method }));
  });
});
afterAll(async () => {
  await browser.close();
  await server.close();
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(server.url);
  mock = new MockClient(page);
});
afterEach(async () => {
  await page.close();
});

interface FetchResult {
  status?: number;
  ct?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
  text?: string;
  error?: string;
}
async function call(method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}): Promise<FetchResult> {
  return page.evaluate(
    async ({ method, path, init }) => {
      try {
        const r = await fetch(path, { method, body: init.body, headers: init.headers });
        const text = await r.text();
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          /* keep text */
        }
        return { status: r.status, ct: r.headers.get('content-type'), headers: Object.fromEntries(r.headers.entries()), body, text };
      } catch (e) {
        return { error: String(e) };
      }
    },
    { method, path, init },
  );
}

describe('MockClient responses', () => {
  it('get() mocks only GET; other methods reach the real server and are not recorded', async () => {
    await mock.get('**/api/user', { id: 1, name: 'Alice' });
    const ok = await call('GET', '/api/user');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: 1, name: 'Alice' });
    expect(ok.ct).toBe('application/json');
    expect(ok.headers!['access-control-allow-origin']).toBe('*');
    const real = await call('POST', '/api/user');
    expect(real.body).toMatchObject({ real: true, method: 'POST' });
    expect(mock.getHistory()).toHaveLength(1);
  });

  it('post/put/delete mock their verb', async () => {
    await mock.post('**/r', { v: 'post' }, { status: 201 });
    await mock.put('**/r', { v: 'put' }, { status: 202 });
    await mock.delete('**/r', { v: 'del' }, { status: 204 });
    // the three routes are layered on the same URL; a handler whose method does not match falls back to
    // the previously registered one (and finally to the network).
    expect(await call('POST', '/r')).toMatchObject({ status: 201, body: { v: 'post' } });
    expect(await call('PUT', '/r')).toMatchObject({ status: 202, body: { v: 'put' } });
    expect((await call('DELETE', '/r')).status).toBe(204);
    expect(await call('GET', '/r')).toMatchObject({ body: { real: true } });
    expect(mock.getHistory().map((h) => h.method)).toEqual(['POST', 'PUT', 'DELETE']);
  });

  it('json() matches any method and forces the json content type and status', async () => {
    await mock.json('**/j', { e: 'x' }, 418, { contentType: 'text/plain', headers: { 'x-extra': '1' } });
    const r = await call('PATCH', '/j');
    expect(r.status).toBe(418);
    expect(r.ct).toBe('application/json');
    expect(r.headers!['x-extra']).toBe('1');
    expect((await call('GET', '/j')).status).toBe(418);
  });

  it('string bodies are sent verbatim, objects JSON-encoded; custom content type and headers apply', async () => {
    await mock.get('**/t', '<b>raw</b>', { contentType: 'text/html', headers: { 'x-a': 'b', 'access-control-allow-origin': 'https://only.test' } });
    const r = await call('GET', '/t');
    expect(r.text).toBe('<b>raw</b>');
    expect(r.ct).toContain('text/html');
    expect(r.headers!['x-a']).toBe('b');
    expect(r.headers!['access-control-allow-origin']).toBe('https://only.test');
  });

  it('regex patterns work', async () => {
    await mock.get(/\/items\/\d+$/, { item: true });
    expect((await call('GET', '/items/42')).body).toEqual({ item: true });
    expect((await call('GET', '/items/abc')).body).toMatchObject({ real: true });
  });

  it('delay() delays the response', async () => {
    await mock.delay('**/slow', 300, { ok: 1 });
    const t0 = Date.now();
    const r = await call('GET', '/slow');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
    expect(r.body).toEqual({ ok: 1 });
  });

  it('abort() fails the request and records it', async () => {
    await mock.abort('**/dead');
    const r = await call('GET', '/dead');
    expect(r.error).toMatch(/fetch|Failed/i);
    expect(mock.expectRequest('/dead')).toHaveLength(1);
  });

  it('options.status falls back to 200', async () => {
    await mock.get('**/s', {});
    expect((await call('GET', '/s')).status).toBe(200);
  });

  it('the latest registered mock for the same URL wins', async () => {
    await mock.get('**/w', { v: 1 });
    await mock.get('**/w', { v: 2 });
    expect((await call('GET', '/w')).body).toEqual({ v: 2 });
  });
});

describe('MockClient recording', () => {
  it('records url, method, headers, timestamp and parsed JSON post data', async () => {
    await mock.post(/\/rec/, {});
    const before = Date.now();
    await call('POST', '/rec?x=1', { body: JSON.stringify({ a: [1, 2] }), headers: { 'content-type': 'application/json', 'x-trace': 'T1' } });
    const [h] = mock.getHistory();
    expect(h.url).toBe(`${server.url}/rec?x=1`);
    expect(h.method).toBe('POST');
    expect(h.headers['x-trace']).toBe('T1');
    expect(h.postData).toEqual({ a: [1, 2] });
    expect(h.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('non-JSON post data is recorded as the raw string; no body is null', async () => {
    await mock.post(/\/rec/, {});
    await mock.get(/\/rec/, {});
    await call('POST', '/rec', { body: 'plain=text&x=1', headers: { 'content-type': 'text/plain' } });
    await call('GET', '/rec');
    const [post, get] = mock.getHistory();
    expect(post.postData).toBe('plain=text&x=1');
    expect(get.postData).toBeNull();
  });

  it('getHistory filters by string / regex, returns a copy; clearHistory empties it', async () => {
    await mock.json('**/*', {});
    await call('GET', '/a/1');
    await call('GET', '/b/2');
    expect(mock.getHistory('/a/')).toHaveLength(1);
    expect(mock.getHistory(/\/b\/\d/)).toHaveLength(1);
    expect(mock.getHistory('/zzz')).toEqual([]);
    const all = mock.getHistory();
    all.pop();
    expect(mock.getHistory()).toHaveLength(2);
    mock.clearHistory();
    expect(mock.getHistory()).toEqual([]);
  });
});

describe('MockClient.expectRequest', () => {
  beforeEach(async () => {
    await mock.json('**/*', {});
    await call('GET', '/users');
    await call('GET', '/users');
    await call('POST', '/users', { body: '{"n":1}' });
    await call('GET', '/orders');
  });

  it('at least once by default (string = contains, regex, predicate) and returns the matches', () => {
    expect(mock.expectRequest('/users')).toHaveLength(3);
    expect(mock.expectRequest(/\/orders$/)).toHaveLength(1);
    expect(mock.expectRequest((r) => r.method === 'POST' && (r.postData as { n: number }).n === 1)).toHaveLength(1);
  });

  it('method filter is case-insensitive', () => {
    expect(mock.expectRequest('/users', { method: 'get' })).toHaveLength(2);
    expect(mock.expectRequest('/users', { method: 'POST' })).toHaveLength(1);
  });

  it('times demands an exact count (including 0)', () => {
    expect(mock.expectRequest('/users', { method: 'GET', times: 2 })).toHaveLength(2);
    expect(mock.expectRequest('/nothing', { times: 0 })).toEqual([]);
    expect(() => mock.expectRequest('/users', { times: 2 })).toThrowError(expect.objectContaining({ code: 'TF_MOCK_ASSERTION_FAILED' }));
    expect(() => mock.expectRequest('/orders', { times: 0 })).toThrowError(/found 1/);
  });

  it('failure lists what was actually intercepted', () => {
    let err: any;
    try {
      mock.expectRequest('/missing', { method: 'DELETE' });
    } catch (e) {
      err = e;
    }
    expect(err.code).toBe('TF_MOCK_ASSERTION_FAILED');
    expect(err.message).toContain('at least one');
    expect(err.message).toContain('/missing');
    expect(err.message).toContain('(DELETE)');
    expect(err.message).toContain('found 0');
    expect(err.message).toContain(`GET ${server.url}/users`);
    expect(err.message).toContain(`POST ${server.url}/users`);
    expect(err.message).toContain(`GET ${server.url}/orders`);
  });

  it('with nothing recorded the message says (none)', async () => {
    mock.clearHistory();
    expect(() => mock.expectRequest('/users')).toThrowError(/\(none\)/);
  });

  it('predicate failures are described as "predicate"', () => {
    expect(() => mock.expectRequest(() => false)).toThrowError(/matching predicate/);
  });
});

describe('MockClient.reset', () => {
  it('unroutes every mock (real server answers again) and clears history', async () => {
    await mock.get('**/r', { mocked: true });
    await mock.abort('**/ab');
    await mock.delay('**/d', 10, {});
    expect((await call('GET', '/r')).body).toEqual({ mocked: true });
    await mock.reset();
    expect((await call('GET', '/r')).body).toMatchObject({ real: true });
    expect((await call('GET', '/ab')).body).toMatchObject({ real: true });
    expect(mock.getHistory()).toEqual([]);
    // client stays usable after reset
    await mock.get('**/r', { again: true });
    expect((await call('GET', '/r')).body).toEqual({ again: true });
  });

  it('only removes its own routes, not the user\'s own page.route handlers', async () => {
    await page.route('**/own', (route) => route.fulfill({ status: 200, body: '"own"', contentType: 'application/json' }));
    await mock.get('**/m', {});
    await mock.reset();
    expect((await call('GET', '/own')).body).toBe('own');
  });

  it('reset twice and with no routes is a no-op', async () => {
    await mock.reset();
    await mock.reset();
  });
});
