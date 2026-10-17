import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, type APIRequestContext } from '@playwright/test';
import { ApiClient, type ApiClientOptions } from '../../../src/clients/api';
import { ApiOptionsSchema } from '../../../src/core/config/schema';
import { json, startServer, type TestServer } from '../../helpers/clientsHttp';
import { cleanupTmp, makeTmp } from '../../helpers/tmp';

let server: TestServer;
let ctx: APIRequestContext;
let inFlight = 0;
let peak = 0;

beforeAll(async () => {
  server = await startServer(async (req, res) => {
    if (req.path.startsWith('/slow/')) {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight--;
      json(res, 200, { id: Number(req.path.split('/')[2]) });
      return;
    }
    if (req.path === '/echo') {
      json(res, 200, { headers: req.headers, url: req.path });
      return;
    }
    if (req.path === '/latin1') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=ISO-8859-1' });
      res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9])); // "café" in latin1
      return;
    }
    if (req.path === '/file') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(Buffer.from('%PDF-1.4 fake'));
      return;
    }
    json(res, 404, { error: 'nope' });
  });
  ctx = await request.newContext();
});

afterAll(async () => {
  await ctx.dispose();
  await server.close();
  cleanupTmp();
});

function make(): ApiClient {
  const options = { ...ApiOptionsSchema.parse({}), baseUrl: server.url } as ApiClientOptions;
  options.retry = { ...options.retry, attempts: 0 };
  return new ApiClient(ctx, options);
}

describe('ApiClient.batch', () => {
  it('returns results in input order and respects the concurrency limit', async () => {
    peak = 0;
    const ids = [1, 2, 3, 4, 5, 6];
    const results = await make().batch(ids.map((id) => (c) => c.get(`/slow/${id}`)), { concurrency: 2 });
    expect(results.map((r) => r.ok && r.response.data.id)).toEqual(ids);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('reports failures per entry without cancelling the others', async () => {
    const results = await make().batch([
      (c) => c.get('/slow/1'),
      (c) => c.get('/missing', { failOnStatus: true }),
      async (c) => (await c.get('/slow/3')).expectStatus(500),
    ]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false });
    expect((results[1] as { error: Error }).error.message).toContain('TF_API_REQUEST_FAILED');
    expect((results[2] as { error: Error }).error.message).toContain('TF_API_ASSERTION_FAILED');
  });

  it('an empty batch resolves to an empty list', async () => {
    expect(await make().batch([])).toEqual([]);
  });
});

describe('ApiClient interceptors', () => {
  it('onRequest can add headers and onResponse sees every response, in registration order', async () => {
    const seen: string[] = [];
    const api = make()
      .withInterceptor({ name: 'corr', onRequest: (r) => void (r.headers['x-correlation-id'] = 'abc-1'), onResponse: (res) => void seen.push(`a:${res.status}`) })
      .withInterceptor({ onResponse: (res, req) => void seen.push(`b:${req.method}`) });
    const res = await api.get('/echo');
    expect(res.data.headers['x-correlation-id']).toBe('abc-1');
    expect(seen).toEqual(['a:200', 'b:GET']);
  });

  it('interceptors are immutable per client', async () => {
    const base = make();
    base.withInterceptor({ onRequest: (r) => void (r.headers['x-only'] = '1') });
    const res = await base.get('/echo');
    expect(res.data.headers['x-only']).toBeUndefined();
  });

  it('onRequest can rewrite the URL', async () => {
    const api = make().withInterceptor({ onRequest: (r) => void (r.url.pathname = '/echo') });
    expect((await api.get('/anything')).data.url).toBe('/echo');
  });
});

describe('ApiResponse content type, charset and saveTo', () => {
  it('decodes the body with the declared charset', async () => {
    const res = await make().get('/latin1');
    expect(res.contentType).toBe('text/plain');
    expect(res.charset).toBe('iso-8859-1');
    expect(res.text()).toBe('café');
  });

  it('saveTo writes the raw bytes and creates directories', async () => {
    const res = await make().get('/file');
    const file = res.saveTo(path.join(makeTmp(), 'nested', 'out.pdf'));
    expect(path.isAbsolute(file)).toBe(true);
    expect(fs.readFileSync(file).toString()).toBe('%PDF-1.4 fake');
    expect(res.contentType).toBe('application/pdf');
    expect(res.charset).toBe('utf-8');
  });
});
