import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockServer } from '../../../src/clients/mock';
import { TestFlyError } from '../../../src/core/errors';

const server = new MockServer();
beforeAll(async () => {
  await server.start();
});
afterAll(() => server.stop());
beforeEach(() => server.reset());

const call = (path: string, init: RequestInit = {}) => fetch(`${server.url}${path}`, init);

describe('MockServer', () => {
  it('answers stubs with JSON, status, headers and delay', async () => {
    server.get('/users/1', { status: 200, json: { id: 1 }, headers: { 'x-mock': 'yes' } });
    const res = await call('/users/1');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-mock')).toBe('yes');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ id: 1 });
  });

  it('supports * globs, RegExp paths and dynamic replies from the request', async () => {
    server.get('/items/*', (req) => ({ json: { path: req.path, q: req.query.q } }));
    server.post(/^\/orders$/, (req) => ({ status: 201, json: { echo: req.json } }));
    expect(await (await call('/items/42?q=x')).json()).toEqual({ path: '/items/42', q: 'x' });
    const created = await call('/orders', { method: 'POST', body: JSON.stringify({ sku: 'A' }), headers: { 'content-type': 'application/json' } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ echo: { sku: 'A' } });
  });

  it('later stubs win and `times` limits a stub', async () => {
    server.get('/flaky', { status: 200, body: 'ok' });
    server.get('/flaky', { status: 503 }, { times: 1 });
    expect((await call('/flaky')).status).toBe(503);
    expect((await call('/flaky')).status).toBe(200);
  });

  it('unmatched requests get 404, are recorded and fail expectNoUnmatched', async () => {
    const res = await call('/nope');
    expect(res.status).toBe(404);
    expect(server.history()).toMatchObject([{ method: 'GET', path: '/nope', matched: false }]);
    expect(() => server.expectNoUnmatched()).toThrow(TestFlyError);
  });

  it('expectRequest checks method, path, times and body; the error lists what was received', async () => {
    server.post('/events', { status: 202 });
    await call('/events', { method: 'POST', body: JSON.stringify({ type: 'login', user: 'ada' }) });
    await call('/events', { method: 'POST', body: JSON.stringify({ type: 'logout' }) });
    expect(server.expectRequest('POST', '/events', { times: 2 })).toHaveLength(2);
    expect(server.expectRequest('POST', '/events', { body: { type: 'login' } })).toHaveLength(1);
    const err = (() => {
      try {
        server.expectRequest('GET', '/events');
      } catch (e) {
        return e as TestFlyError;
      }
      throw new Error('expected a throw');
    })();
    expect(err.code).toBe('TF_MOCK_ASSERTION_FAILED');
    expect(err.message).toContain('POST /events');
  });

  it('waitForRequest waits for late requests and times out with TF_MOCK_ASSERTION_FAILED', async () => {
    server.post('/hook', { status: 204 });
    setTimeout(() => void call('/hook', { method: 'POST' }), 100);
    await expect(server.waitForRequest('POST', '/hook', { timeout: 2_000 })).resolves.toHaveLength(1);
    await expect(server.waitForRequest('POST', '/never', { timeout: 100 })).rejects.toMatchObject({ code: 'TF_MOCK_ASSERTION_FAILED' });
  });

  it('reset clears stubs and history', async () => {
    server.get('/a', { body: 'a' });
    await call('/a');
    server.reset();
    expect(server.history()).toEqual([]);
    expect((await call('/a')).status).toBe(404);
  });

  it('url throws before start', () => {
    expect(() => new MockServer().url).toThrow(/not started/);
  });
});
