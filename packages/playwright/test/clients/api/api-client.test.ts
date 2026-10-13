import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type APIRequestContext } from '@playwright/test';
import { CONTENT_TYPES, type ApiEvent } from '@testfly/reporter/schema';
import { ApiClient, type ApiClientOptions } from '../../../src/clients/api';
import { ApiOptionsSchema } from '../../../src/core/config/schema';
import { TestFlyError } from '../../../src/core/errors';
import { fakeTestInfo } from '../../helpers/fakeTestInfo';
import { json, startServer, type TestServer } from '../../helpers/clientsHttp';

let server: TestServer;
let ctx: APIRequestContext;

beforeAll(async () => {
  server = await startServer((req, res) => {
    if (req.path === '/echo') {
      json(res, 200, {
        method: req.method,
        query: Object.fromEntries(req.query),
        headers: req.headers,
        body: req.text,
      });
      return;
    }
    if (req.path === '/graphql') {
      const b = JSON.parse(req.text);
      json(res, 200, { data: { echoed: b } });
      return;
    }
    if (req.path === '/text') {
      res.writeHead(200, { 'content-type': 'text/plain', 'x-custom': 'yes' });
      res.end('plain text');
      return;
    }
    if (req.path === '/empty') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.path === '/404') {
      json(res, 404, { error: 'nope' });
      return;
    }
    res.writeHead(404);
    res.end('unknown');
  });
  ctx = await request.newContext();
});

afterAll(async () => {
  await ctx.dispose();
  await server.close();
});

function make(over: Partial<ApiClientOptions> = {}): ApiClient {
  const options = { ...ApiOptionsSchema.parse({}), baseUrl: server.url, ...over } as ApiClientOptions;
  options.retry = { ...options.retry, backoffMs: 1, ...(over.retry ?? {}) };
  return new ApiClient(ctx, options);
}

describe('ApiClient: verbs and request encoding', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)('%s sends the right method', async (verb) => {
    const res = await make()[verb]('/echo');
    expect(res.status).toBe(200);
    expect(res.data.method).toBe(verb.toUpperCase());
    expect(res.ok).toBe(true);
  });

  it('head returns headers without a body', async () => {
    const res = await make().head('/text');
    expect(res.status).toBe(200);
    expect(res.headers['x-custom']).toBe('yes');
    expect(res.text()).toBe('');
  });

  it('fetch uses the given method (case-insensitive) and defaults to GET', async () => {
    const c = make();
    expect((await c.fetch('/echo', { method: 'patch' })).data.method).toBe('PATCH');
    expect((await c.fetch('/echo')).data.method).toBe('GET');
  });

  it('serialises params and drops undefined ones', async () => {
    const res = await make().get('/echo', { params: { a: 1, b: 'x y', c: true, d: undefined } });
    expect(res.data.query).toEqual({ a: '1', b: 'x y', c: 'true' });
  });

  it('merges params with a query string already in the url', async () => {
    const res = await make().get('/echo?x=1', { params: { y: 2 } });
    expect(res.data.query).toEqual({ x: '1', y: '2' });
  });

  it('json body sets content-type', async () => {
    const res = await make().post('/echo', { json: { n: 1, s: 'é' } });
    expect(res.data.headers['content-type']).toBe('application/json');
    expect(JSON.parse(res.data.body)).toEqual({ n: 1, s: 'é' });
  });

  it('an explicit content-type header is not overridden by json', async () => {
    const res = await make().post('/echo', { json: { n: 1 }, headers: { 'Content-Type': 'application/vnd.api+json' } });
    expect(res.data.headers['content-type']).toBe('application/vnd.api+json');
  });

  it('form body is url-encoded', async () => {
    const res = await make().post('/echo', { form: { a: 'b c', n: 5, ok: true } });
    expect(res.data.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(res.data.body).toBe('a=b+c&n=5&ok=true');
  });

  it('multipart body is sent as multipart/form-data', async () => {
    const res = await make().post('/echo', {
      multipart: { field: 'value', file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } },
    });
    expect(res.data.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(res.data.body).toContain('name="field"');
    expect(res.data.body).toContain('filename="a.txt"');
    expect(res.data.body).toContain('hello');
  });

  it('data: string and Buffer are sent as-is, objects as JSON', async () => {
    const c = make();
    expect((await c.post('/echo', { data: 'raw-string' })).data.body).toBe('raw-string');
    expect((await c.post('/echo', { data: Buffer.from('buf') })).data.body).toBe('buf');
    const r = await c.post('/echo', { data: { k: [1, 2] } });
    expect(r.data.headers['content-type']).toBe('application/json');
    expect(JSON.parse(r.data.body)).toEqual({ k: [1, 2] });
  });

  it('default headers are lower-cased, merged and overridable per request', async () => {
    const c = make({ headers: { 'X-Default': 'one', 'X-Other': 'o' } });
    const res = await c.get('/echo', { headers: { 'X-Default': 'two' } });
    expect(res.data.headers['x-default']).toBe('two');
    expect(res.data.headers['x-other']).toBe('o');
  });

  it('non-JSON bodies are exposed as text and json() throws TF_API_ASSERTION_FAILED', async () => {
    const res = await make().get('/text');
    expect(res.data).toBe('plain text');
    expect(() => res.json()).toThrowError(expect.objectContaining({ code: 'TF_API_ASSERTION_FAILED' }));
  });

  it('empty body yields empty string data', async () => {
    const res = await make().get('/empty');
    expect(res.status).toBe(204);
    expect(res.data).toBe('');
  });

  it('a 404 is returned (not thrown) by default', async () => {
    const res = await make().get('/404');
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it('absolute urls bypass the base url (and need none)', async () => {
    const c = make({ baseUrl: undefined });
    const res = await c.get(`${server.url}/echo`);
    expect(res.status).toBe(200);
    expect(res.request.url).toBe(`${server.url}/echo`);
  });
});

describe('ApiClient: base url handling', () => {
  it('a relative path without a base url throws TF_CONFIG_MISSING', async () => {
    const c = make({ baseUrl: undefined });
    await expect(c.get('/x')).rejects.toMatchObject({ code: 'TF_CONFIG_MISSING' });
    await expect(c.get('/x')).rejects.toThrow(/\/x/);
  });

  it('joins base and path regardless of slashes', async () => {
    const a = make({ baseUrl: `${server.url}/` });
    expect((await a.get('echo')).request.url).toBe(`${server.url}/echo`);
    expect((await a.get('///echo')).request.url).toBe(`${server.url}/echo`);
  });

  it('keeps a path prefix in the base url', async () => {
    const c = make({ baseUrl: `${server.url}/prefix` });
    const res = await c.get('/echo');
    expect(res.request.url).toBe(`${server.url}/prefix/echo`);
    expect(res.status).toBe(404);
  });

  it('withBaseUrl makes a base-less client usable', async () => {
    const c = make({ baseUrl: undefined }).withBaseUrl(server.url);
    expect((await c.get('/echo')).status).toBe(200);
  });
});

describe('ApiClient: immutability of with* methods', () => {
  it('returns new instances and never mutates the receiver', async () => {
    const root = make();
    const a = root.withHeader('X-A', '1');
    const b = a.withHeaders({ 'X-B': '2' });
    const c = root.withBearer('tok');
    const d = root.withBasic('u', 'p');
    const e = root.withBaseUrl(`${server.url}/other`);

    for (const derived of [a, b, c, d, e]) expect(derived).not.toBe(root);

    const hdr = async (cl: ApiClient) => (await cl.get('/echo')).data?.headers ?? {};
    const rootHeaders = await hdr(root);
    expect(rootHeaders['x-a']).toBeUndefined();
    expect(rootHeaders['authorization']).toBeUndefined();
    expect((await hdr(a))['x-a']).toBe('1');
    expect((await hdr(a))['x-b']).toBeUndefined();
    expect((await hdr(b))['x-a']).toBe('1');
    expect((await hdr(b))['x-b']).toBe('2');
    expect((await hdr(c))['authorization']).toBe('Bearer tok');
    expect((await hdr(d))['authorization']).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect((await root.get('/echo')).request.url).toBe(`${server.url}/echo`);
  });

  it('the headers object passed to withHeaders is not retained by reference', async () => {
    const h = { 'X-Mut': 'a' };
    const c = make().withHeaders(h);
    h['X-Mut'] = 'changed';
    expect((await c.get('/echo')).data.headers['x-mut']).toBe('a');
  });
});

describe('ApiClient: retries', () => {
  it('retries 503 and then succeeds, counting attempts', async () => {
    let n = 0;
    server.handle((req, res) => {
      n++;
      if (n < 3) return json(res, 503, { try: n });
      json(res, 200, { ok: true, n });
    });
    const c = make({ retry: { attempts: 3, backoffMs: 1, onStatus: [503], onNetworkError: true } });
    const res = await c.get('/retry');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true, n: 3 });
    expect(n).toBe(3);
  });

  it('records one event per attempt with increasing attempt numbers', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, ++n < 3 ? 503 : 200, { n }));
    const info = fakeTestInfo();
    const c = new ApiClient(ctx, { ...ApiOptionsSchema.parse({ retry: { attempts: 3, backoffMs: 1 } }), baseUrl: server.url }, info);
    await c.get('/retry');
    await c.flushEvents();
    const events = JSON.parse(String(info.attachments_[0].body)) as ApiEvent[];
    expect(events.map((e) => [e.status, e.attempt])).toEqual([[503, 1], [503, 2], [200, 3]]);
  });

  it('returns the last 503 once attempts are exhausted (no throw without failOnStatus)', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 503, { n: ++n }));
    const res = await make({ retry: { attempts: 2, backoffMs: 1, onStatus: [503], onNetworkError: true } }).get('/x');
    expect(res.status).toBe(503);
    expect(n).toBe(3);
  });

  it('failOnStatus throws TF_API_REQUEST_FAILED only after retries are exhausted', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 503, { oops: ++n }));
    const c = make({ retry: { attempts: 1, backoffMs: 1, onStatus: [503], onNetworkError: true } });
    const err = await c.get('/boom', { failOnStatus: true }).catch((e) => e);
    expect(err).toBeInstanceOf(TestFlyError);
    expect(err.code).toBe('TF_API_REQUEST_FAILED');
    expect(err.message).toContain('GET');
    expect(err.message).toContain('/boom');
    expect(err.message).toContain('503');
    expect(err.message).toContain('"oops":2');
    expect(n).toBe(2);
  });

  it('does not retry statuses outside onStatus', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 500, { n: ++n }));
    const res = await make({ retry: { attempts: 3, backoffMs: 1, onStatus: [503], onNetworkError: true } }).get('/x');
    expect(res.status).toBe(500);
    expect(n).toBe(1);
  });

  it('per-request retry overrides the client policy', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, n++ < 1 ? 503 : 200, {}));
    const res = await make().get('/x', { retry: { attempts: 1, backoffMs: 1 } });
    expect(res.status).toBe(200);
    expect(n).toBe(2);
  });

  it('with attempts=0 (default) there is a single try', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 503, { n: ++n }));
    const res = await make().get('/x');
    expect(res.status).toBe(503);
    expect(n).toBe(1);
  });

  it('retries on a network error and then succeeds', async () => {
    let n = 0;
    server.handle((req, res, raw) => {
      if (++n === 1) {
        raw.socket.destroy();
        return;
      }
      json(res, 200, { n });
    });
    const res = await make({ retry: { attempts: 2, backoffMs: 1, onStatus: [], onNetworkError: true } }).get('/flaky');
    expect(res.data).toEqual({ n: 2 });
    expect(n).toBe(2);
  });

  it('throws TF_API_REQUEST_FAILED (with cause) when every attempt hits a network error', async () => {
    let n = 0;
    server.handle((_req, _res, raw) => {
      n++;
      raw.socket.destroy();
    });
    const err = await make({ retry: { attempts: 2, backoffMs: 1, onStatus: [], onNetworkError: true } })
      .get('/dead')
      .catch((e) => e);
    expect(err.code).toBe('TF_API_REQUEST_FAILED');
    expect(err.message).toContain('GET');
    expect(err.message).toContain('/dead');
    expect(err.cause).toBeDefined();
    expect(n).toBe(3);
  });

  it('does not retry network errors when onNetworkError is false', async () => {
    let n = 0;
    server.handle((_req, _res, raw) => {
      n++;
      raw.socket.destroy();
    });
    await expect(make({ retry: { attempts: 3, backoffMs: 1, onStatus: [], onNetworkError: false } }).get('/dead')).rejects.toMatchObject({
      code: 'TF_API_REQUEST_FAILED',
    });
    expect(n).toBe(1);
  });

  it('a connection refused error is wrapped in TF_API_REQUEST_FAILED', async () => {
    const dead = await startServer(() => undefined);
    const url = dead.url;
    await dead.close();
    await expect(make({ baseUrl: url }).get('/x')).rejects.toMatchObject({ code: 'TF_API_REQUEST_FAILED' });
  });

  it('per-request timeout aborts a slow response', async () => {
    server.handle(() => undefined); // never answers
    await expect(make().get('/slow', { timeout: 100 })).rejects.toMatchObject({ code: 'TF_API_REQUEST_FAILED' });
  });
});

describe('ApiClient: graphql', () => {
  it('posts query/variables/operationName to /graphql by default', async () => {
    server.handle((req, res) => {
      if (req.path === '/graphql') return json(res, 200, { data: { got: JSON.parse(req.text), ct: req.headers['content-type'] } });
      json(res, 404, {});
    });
    const res = await make().graphql('query Q($id: ID!) { u(id: $id) { id } }', { id: '1' }, { operationName: 'Q' });
    expect(res.data.data.ct).toBe('application/json');
    expect(res.data.data.got).toEqual({ query: 'query Q($id: ID!) { u(id: $id) { id } }', variables: { id: '1' }, operationName: 'Q' });
    expect(res.request.method).toBe('POST');
  });

  it('supports a custom endpoint and extra headers', async () => {
    server.handle((req, res) => json(res, 200, { path: req.path, h: req.headers['x-g'] }));
    const res = await make().graphql('{ a }', undefined, { endpoint: '/v2/gql', headers: { 'X-G': 'yes' } });
    expect(res.data).toEqual({ path: '/v2/gql', h: 'yes' });
  });
});

describe('ApiClient: pollUntil', () => {
  it('returns as soon as the predicate accepts the response', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 200, { n: ++n }));
    const c = make();
    const res = await c.pollUntil((cl) => cl.get('/p'), (r) => r.data.n >= 3, { interval: 5, timeout: 2000 });
    expect(res.data.n).toBe(3);
    expect(n).toBe(3);
  });

  it('supports async predicates', async () => {
    server.handle((_req, res) => json(res, 200, { ok: true }));
    const res = await make().pollUntil((cl) => cl.get('/p'), async (r) => r.data.ok, { interval: 5 });
    expect(res.status).toBe(200);
  });

  it('throws TF_API_POLL_TIMEOUT with attempts and the last response', async () => {
    server.handle((_req, res) => json(res, 202, { state: 'pending' }));
    const err = await make()
      .pollUntil((cl) => cl.get('/job'), (r) => r.data.state === 'done', { interval: 10, timeout: 120 })
      .catch((e) => e);
    expect(err.code).toBe('TF_API_POLL_TIMEOUT');
    expect(err.message).toContain('120ms');
    expect(err.message).toContain('/job');
    expect(err.message).toContain('202');
    expect(err.message).toContain('pending');
    expect(err.details.attempts).toBeGreaterThan(1);
    expect(err.details.lastStatus).toBe(202);
  });

  it('keeps polling through request errors and reports the last error on timeout', async () => {
    server.handle((_req, _res, raw) => raw.socket.destroy());
    const err = await make({ retry: { attempts: 0, backoffMs: 1, onStatus: [], onNetworkError: false } })
      .pollUntil((cl) => cl.get('/down'), () => true, { interval: 10, timeout: 80 })
      .catch((e) => e);
    expect(err.code).toBe('TF_API_POLL_TIMEOUT');
    expect(err.message).toContain('error:');
    expect(err.cause).toBeDefined();
  });

  it('recovers when an error is followed by a good response', async () => {
    let n = 0;
    server.handle((_req, res, raw) => {
      if (++n < 3) return raw.socket.destroy();
      json(res, 200, { n });
    });
    const res = await make({ retry: { attempts: 0, backoffMs: 1, onStatus: [], onNetworkError: false } }).pollUntil(
      (cl) => cl.get('/x'),
      (r) => r.ok,
      { interval: 5, timeout: 3000 },
    );
    expect(res.data.n).toBe(3);
  });

  it('failFastOn aborts immediately with TF_API_POLL_TIMEOUT', async () => {
    let n = 0;
    server.handle((_req, res) => json(res, 500, { n: ++n }));
    const err = await make()
      .pollUntil((cl) => cl.get('/x'), (r) => r.ok, { interval: 5, timeout: 5000, failFastOn: (r) => r.status === 500 })
      .catch((e) => e);
    expect(err.code).toBe('TF_API_POLL_TIMEOUT');
    expect(err.message).toContain('failFastOn');
    expect(n).toBe(1);
  });

  it('propagates TF_CONFIG_MISSING-style errors? no: they are swallowed as lastError and surfaced on timeout', async () => {
    const err = await make({ baseUrl: undefined })
      .pollUntil((cl) => cl.get('/x'), () => true, { interval: 5, timeout: 30 })
      .catch((e) => e);
    expect(err.code).toBe('TF_API_POLL_TIMEOUT');
    expect(err.message).toContain('Cannot resolve relative API path');
  });
});

describe('ApiClient: ApiEvent attachments', () => {
  it('flushEvents attaches all events once with the api content type', async () => {
    server.handle((_req, res) => json(res, 200, { hello: 'world' }));
    const info = fakeTestInfo();
    const c = new ApiClient(ctx, { ...ApiOptionsSchema.parse({}), baseUrl: server.url }, info);
    await c.post('/a?token=abc&x=1', { json: { password: 'p' }, headers: { Authorization: 'Bearer SECRET' } });
    await c.withHeader('x-y', '1').get('/b');
    await c.flushEvents();
    await c.flushEvents(); // second flush is a no-op
    expect(info.attachments_).toHaveLength(1);
    const att = info.attachments_[0];
    expect(att.name).toBe('testfly-api');
    expect(att.contentType).toBe(CONTENT_TYPES.api);
    const events = JSON.parse(String(att.body)) as ApiEvent[];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ method: 'POST', status: 200, attempt: 1, requestBody: '{"password":"p"}', responseBody: '{"hello":"world"}' });
    expect(events[0].url).toContain('/a?token=abc');
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0].curl).toContain("-X POST");
    expect(events[0].curl).not.toContain('SECRET');
    expect(events[0].curl).not.toContain('token=abc');
    expect(events[0].curl).toContain('authorization: ***');
    expect(events[1].curl).toContain("'x-y: 1'");
    // clones share the event list
    expect(events.map((e) => e.method)).toEqual(['POST', 'GET']);
  });

  it('truncates request and response bodies at truncateAt', async () => {
    const big = 'x'.repeat(500);
    server.handle((_req, res) => json(res, 200, { big }));
    const info = fakeTestInfo();
    const c = new ApiClient(ctx, { ...ApiOptionsSchema.parse({ truncateAt: 50 }), baseUrl: server.url }, info);
    await c.post('/t', { data: 'y'.repeat(200) });
    await c.flushEvents();
    const [ev] = JSON.parse(String(info.attachments_[0].body)) as ApiEvent[];
    expect(ev.requestBody).toMatch(/^y{50}… \[truncated 150 chars\]$/);
    expect(ev.responseBody).toContain('[truncated');
    expect(ev.responseBody!.length).toBeLessThan(120);
  });

  it('logBodies=false keeps bodies out of the events', async () => {
    server.handle((_req, res) => json(res, 200, { secret: 'data' }));
    const info = fakeTestInfo();
    const c = new ApiClient(ctx, { ...ApiOptionsSchema.parse({ logBodies: false }), baseUrl: server.url }, info);
    await c.post('/t', { json: { pw: 'hunter2' } });
    await c.flushEvents();
    const [ev] = JSON.parse(String(info.attachments_[0].body)) as ApiEvent[];
    expect(ev.requestBody).toBeUndefined();
    expect(ev.responseBody).toBeUndefined();
    expect(String(info.attachments_[0].body)).not.toContain('hunter2');
    expect(ev.status).toBe(200);
  });

  it('records a status-0 event when the request fails at the network level', async () => {
    server.handle((_req, _res, raw) => raw.socket.destroy());
    const info = fakeTestInfo();
    const c = new ApiClient(ctx, { ...ApiOptionsSchema.parse({}), baseUrl: server.url }, info);
    await c.get('/x').catch(() => undefined);
    await c.flushEvents();
    const [ev] = JSON.parse(String(info.attachments_[0].body)) as ApiEvent[];
    expect(ev.status).toBe(0);
  });

  it('without testInfo nothing is recorded and flush is a no-op', async () => {
    server.handle((_req, res) => json(res, 200, {}));
    const c = make();
    await c.get('/x');
    await expect(c.flushEvents()).resolves.toBeUndefined();
  });

  it('does not attach when no request was made', async () => {
    const info = fakeTestInfo();
    await new ApiClient(ctx, { ...ApiOptionsSchema.parse({}), baseUrl: server.url }, info).flushEvents();
    expect(info.attachments_).toHaveLength(0);
  });
});
