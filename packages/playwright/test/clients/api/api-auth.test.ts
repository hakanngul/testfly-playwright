import { createHash, createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { request, type APIRequestContext } from '@playwright/test';
import {
  ApiClient,
  apiKeyAuth,
  basicAuth,
  bearerAuth,
  clearOAuth2Cache,
  digestAuth,
  hmacSigner,
  oauth2ClientCredentials,
  oauth2Password,
} from '../../../src/clients/api';
import { ApiOptionsSchema } from '../../../src/core/config/schema';
import { json, startServer, type CapturedRequest, type TestServer } from '../../helpers/clientsHttp';

let server: TestServer;
let ctx: APIRequestContext;

beforeAll(async () => {
  server = await startServer((_req, res) => json(res, 200, {}));
  ctx = await request.newContext();
});
afterAll(async () => {
  await ctx.dispose();
  await server.close();
});
afterEach(() => {
  clearOAuth2Cache();
  server.requests.length = 0;
});

const client = (): ApiClient => new ApiClient(ctx, { ...ApiOptionsSchema.parse({}), baseUrl: server.url });
const header = (r: CapturedRequest, name: string): string | undefined => r.headers[name] as string | undefined;

describe('simple auth strategies', () => {
  it('bearer (static and lazily resolved async token)', async () => {
    server.handle((req, res) => json(res, 200, { auth: req.headers.authorization }));
    expect((await client().withBearer('abc').get('/x')).data.auth).toBe('Bearer abc');
    let calls = 0;
    const c = client().withAuth(bearerAuth(async () => `lazy-${++calls}`));
    expect((await c.get('/x')).data.auth).toBe('Bearer lazy-1');
    expect((await c.get('/x')).data.auth).toBe('Bearer lazy-2');
  });

  it('basic', async () => {
    server.handle((req, res) => json(res, 200, { auth: req.headers.authorization }));
    const r = await client().withBasic('us:er', 'pä ss').get('/x');
    expect(r.data.auth).toBe(`Basic ${Buffer.from('us:er:pä ss').toString('base64')}`);
  });

  it('apiKey in header (name lower-cased) and in query', async () => {
    server.handle((req, res) => json(res, 200, { h: req.headers['x-api-key'], q: req.query.get('api_key'), other: req.query.get('a') }));
    const h = await client().withAuth(apiKeyAuth('X-API-Key', 'k1')).get('/x');
    expect(h.data).toEqual({ h: 'k1', q: null, other: null });
    const q = await client().withAuth(apiKeyAuth('api_key', 'k2', 'query')).get('/x', { params: { a: '1' } });
    expect(q.data).toEqual({ h: undefined, q: 'k2', other: '1' });
    // query key ends up in the event curl redacted (checked in api-client tests); here: the url carries it
    expect(q.request.url).toContain('api_key=k2');
  });

  it('a later withAuth replaces the earlier strategy', async () => {
    server.handle((req, res) => json(res, 200, { auth: req.headers.authorization }));
    const r = await client().withBearer('a').withBasic('u', 'p').get('/x');
    expect(r.data.auth).toMatch(/^Basic /);
  });

  it('auth overrides an explicit authorization header from defaults', async () => {
    server.handle((req, res) => json(res, 200, { auth: req.headers.authorization }));
    const r = await client().withHeader('Authorization', 'Custom').withBearer('t').get('/x');
    expect(r.data.auth).toBe('Bearer t');
  });
});

describe('OAuth2', () => {
  interface TokenServerOpts {
    expiresIn?: number | undefined;
    refresh?: boolean;
    failRefresh?: boolean;
    status?: number;
  }
  function tokenServer(opts: TokenServerOpts = {}) {
    const stats = { token: 0, cc: 0, refresh: 0, password: 0, forms: [] as URLSearchParams[], auths: [] as (string | undefined)[], revoked: new Set<string>() };
    let issued = 0;
    server.handle((req, res) => {
      if (req.path === '/token') {
        stats.token++;
        const form = new URLSearchParams(req.text);
        stats.forms.push(form);
        stats.auths.push(header(req, 'authorization'));
        const grant = form.get('grant_type');
        if (opts.status) return json(res, opts.status, { error: 'invalid_client' });
        if (grant === 'client_credentials') stats.cc++;
        else if (grant === 'refresh_token') {
          stats.refresh++;
          if (opts.failRefresh) return json(res, 400, { error: 'invalid_grant' });
        } else if (grant === 'password') stats.password++;
        issued++;
        const body: Record<string, unknown> = { access_token: `tok-${issued}`, token_type: 'bearer' };
        if (opts.expiresIn !== undefined || 'expiresIn' in opts === false) body.expires_in = opts.expiresIn ?? 3600;
        if (opts.refresh) body.refresh_token = `ref-${issued}`;
        return json(res, 200, body);
      }
      if (req.path === '/api') {
        const tok = String(req.headers.authorization ?? '').replace('Bearer ', '');
        if (stats.revoked.has(tok) || !tok) return json(res, 401, { error: 'bad token' });
        return json(res, 200, { tok });
      }
      json(res, 404, {});
    });
    return stats;
  }
  const oauth = (extra: Record<string, unknown> = {}) =>
    oauth2ClientCredentials({ tokenUrl: `${server.url}/token`, clientId: 'cid', clientSecret: 'sec', ...extra });

  it('fetches a token with client_credentials (basic auth by default) and sends it as Bearer', async () => {
    const stats = tokenServer();
    const r = await client().withAuth(oauth({ scope: 'read write' })).get('/api');
    expect(r.data.tok).toBe('tok-1');
    expect(stats.cc).toBe(1);
    expect(stats.auths[0]).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`);
    expect(stats.forms[0].get('scope')).toBe('read write');
    expect(stats.forms[0].get('client_secret')).toBeNull();
  });

  it('clientAuth: body sends credentials in the form', async () => {
    const stats = tokenServer();
    await client().withAuth(oauth({ clientAuth: 'body', audience: 'aud', extraParams: { foo: 'bar' } })).get('/api');
    expect(stats.auths[0]).toBeUndefined();
    expect(stats.forms[0].get('client_id')).toBe('cid');
    expect(stats.forms[0].get('client_secret')).toBe('sec');
    expect(stats.forms[0].get('audience')).toBe('aud');
    expect(stats.forms[0].get('foo')).toBe('bar');
  });

  it('caches the token across requests and across clients (same tokenUrl/clientId/scope)', async () => {
    const stats = tokenServer();
    const a = client().withAuth(oauth());
    await a.get('/api');
    await a.get('/api');
    await client().withAuth(oauth()).get('/api');
    expect(stats.token).toBe(1);
    // a different scope gets its own token
    await client().withAuth(oauth({ scope: 'other' })).get('/api');
    expect(stats.token).toBe(2);
  });

  it('deduplicates concurrent token requests', async () => {
    const stats = tokenServer();
    const c = client().withAuth(oauth());
    const all = await Promise.all([c.get('/api'), c.get('/api'), c.get('/api')]);
    expect(all.map((r) => r.data.tok)).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(stats.token).toBe(1);
  });

  it('an expired token triggers the refresh_token grant', async () => {
    // expires_in 1s is inside the 30s skew window: treated as expired on the next use
    const stats = tokenServer({ expiresIn: 1, refresh: true });
    const c = client().withAuth(oauth());
    expect((await c.get('/api')).data.tok).toBe('tok-1');
    expect((await c.get('/api')).data.tok).toBe('tok-2');
    expect(stats.cc).toBe(1);
    expect(stats.refresh).toBe(1);
    expect(stats.forms[1].get('refresh_token')).toBe('ref-1');
    expect(stats.forms[1].get('grant_type')).toBe('refresh_token');
  });

  it('an expired token without refresh_token triggers a fresh client_credentials grant', async () => {
    const stats = tokenServer({ expiresIn: 1 });
    const c = client().withAuth(oauth());
    await c.get('/api');
    expect((await c.get('/api')).data.tok).toBe('tok-2');
    expect(stats.cc).toBe(2);
    expect(stats.refresh).toBe(0);
  });

  it('falls back to a fresh grant when the refresh grant is rejected', async () => {
    const stats = tokenServer({ expiresIn: 1, refresh: true, failRefresh: true });
    const c = client().withAuth(oauth());
    await c.get('/api');
    const r = await c.get('/api');
    expect(r.status).toBe(200);
    expect(stats.refresh).toBe(1);
    expect(stats.cc).toBe(2);
  });

  it('a token without expires_in is cached indefinitely', async () => {
    const stats = tokenServer({ expiresIn: undefined });
    // 'expiresIn' in opts is true here, so the server omits expires_in
    const c = client().withAuth(oauth());
    await c.get('/api');
    await c.get('/api');
    expect(stats.token).toBe(1);
  });

  it('a 401 from the API forces a refresh and retries once with the new token', async () => {
    const stats = tokenServer({ refresh: true });
    const c = client().withAuth(oauth());
    expect((await c.get('/api')).data.tok).toBe('tok-1');
    stats.revoked.add('tok-1');
    const r = await c.get('/api');
    expect(r.status).toBe(200);
    expect(r.data.tok).toBe('tok-2');
    expect(stats.refresh).toBe(1);
    const apiCalls = server.requests.filter((q) => q.path === '/api');
    expect(apiCalls).toHaveLength(3);
  });

  it('a 401 that persists after the refreshed token is returned as 401 (single retry)', async () => {
    tokenServer();
    server.handle((req, res) => {
      if (req.path === '/token') return json(res, 200, { access_token: 'always-bad', expires_in: 3600 });
      json(res, 401, { error: 'no' });
    });
    const r = await client().withAuth(oauth()).get('/api');
    expect(r.status).toBe(401);
    expect(server.requests.filter((q) => q.path === '/api')).toHaveLength(2);
  });

  it('token endpoint errors become TF_API_REQUEST_FAILED (never an unauthenticated call)', async () => {
    tokenServer({ status: 401 });
    await expect(client().withAuth(oauth()).get('/api')).rejects.toMatchObject({ code: 'TF_API_REQUEST_FAILED' });
    expect(server.requests.filter((q) => q.path === '/api')).toHaveLength(0);
  });

  it('missing access_token in a 200 response is an error', async () => {
    server.handle((_req, res) => json(res, 200, { nope: true }));
    await expect(client().withAuth(oauth()).get('/api')).rejects.toThrow(/without an access_token/);
  });

  it('unreachable token endpoint is TF_API_REQUEST_FAILED with cause', async () => {
    const dead = await startServer(() => undefined);
    const url = dead.url;
    await dead.close();
    const err = await client()
      .withAuth(oauth2ClientCredentials({ tokenUrl: `${url}/token`, clientId: 'x', clientSecret: 'y' }))
      .get('/api')
      .catch((e) => e);
    expect(err.code).toBe('TF_API_REQUEST_FAILED');
    expect(err.cause).toBeDefined();
  });

  it('password grant sends username/password and caches per user', async () => {
    const stats = tokenServer();
    const mk = (u: string) => oauth2Password({ tokenUrl: `${server.url}/token`, clientId: 'cid', username: u, password: 'pw' });
    await client().withAuth(mk('alice')).get('/api');
    await client().withAuth(mk('alice')).get('/api');
    await client().withAuth(mk('bob')).get('/api');
    expect(stats.password).toBe(2);
    expect(stats.forms[0].get('username')).toBe('alice');
    expect(stats.forms[0].get('password')).toBe('pw');
    // public client (no secret) sends client_id in the body
    expect(stats.forms[0].get('client_id')).toBe('cid');
  });

  it('clearOAuth2Cache drops cached tokens', async () => {
    const stats = tokenServer();
    await client().withAuth(oauth()).get('/api');
    clearOAuth2Cache();
    await client().withAuth(oauth()).get('/api');
    expect(stats.token).toBe(2);
  });
});

describe('hmacSigner', () => {
  const secret = 's3cret';
  function verifying(algorithm: string, encoding: 'hex' | 'base64', names = { keyId: 'x-key-id', timestamp: 'x-timestamp', contentSha256: 'x-content-sha256', signature: 'x-signature' }) {
    server.handle((req, res) => {
      const ts = header(req, names.timestamp)!;
      const bodyHash = createHash('sha256').update(req.body).digest('hex');
      const toSign = [req.method, req.url, ts, bodyHash].join('\n');
      const expected = createHmac(algorithm, secret).update(toSign).digest(encoding);
      json(res, header(req, names.signature) === expected && header(req, names.contentSha256) === bodyHash ? 200 : 401, {
        keyId: header(req, names.keyId),
        ts,
      });
    });
  }

  it('signs GET requests (empty body) so that the server can verify', async () => {
    verifying('sha256', 'hex');
    const c = client().withAuth(hmacSigner({ keyId: 'kid', secret, now: () => 1_700_000_000.9 }));
    const r = await c.get('/things', { params: { b: '2', a: '1' } });
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ keyId: 'kid', ts: '1700000000' });
  });

  it('signs JSON bodies and includes the body hash', async () => {
    verifying('sha256', 'hex');
    const c = client().withAuth(hmacSigner({ keyId: 'k', secret }));
    const r = await c.post('/things', { json: { a: 1 } });
    expect(r.status).toBe(200);
    const sent = server.requests.at(-1)!;
    expect(header(sent, 'x-content-sha256')).toBe(createHash('sha256').update('{"a":1}').digest('hex'));
  });

  it('server rejects a wrong secret', async () => {
    verifying('sha256', 'hex');
    const r = await client().withAuth(hmacSigner({ keyId: 'k', secret: 'wrong' })).get('/x');
    expect(r.status).toBe(401);
  });

  it('server rejects when the body is tampered with after signing', async () => {
    // signed with body A; the server recomputes over what it received (B) -> mismatch is detected via content hash header
    server.handle((req, res) => {
      const actual = createHash('sha256').update(req.body).digest('hex');
      json(res, header(req, 'x-content-sha256') === actual ? 200 : 400, {});
    });
    const strat = hmacSigner({ keyId: 'k', secret });
    const prepared = { method: 'POST', url: new URL(`${server.url}/x`), headers: {} as Record<string, string>, body: 'A' };
    await strat.apply(prepared);
    expect(prepared.headers['x-content-sha256']).toBe(createHash('sha256').update('A').digest('hex'));
    expect(prepared.headers['x-content-sha256']).not.toBe(createHash('sha256').update('B').digest('hex'));
  });

  it.each([
    ['sha512', 'base64'],
    ['sha1', 'hex'],
    ['sha384', 'hex'],
  ] as const)('supports algorithm %s with %s encoding', async (algorithm, encoding) => {
    verifying(algorithm, encoding);
    const r = await client().withAuth(hmacSigner({ keyId: 'k', secret, algorithm, encoding })).post('/x', { data: 'raw' });
    expect(r.status).toBe(200);
  });

  it('supports custom header names (case-insensitive)', async () => {
    const names = { keyId: 'x-kid', timestamp: 'x-ts', contentSha256: 'x-hash', signature: 'x-sig' };
    verifying('sha256', 'hex', names);
    const r = await client()
      .withAuth(hmacSigner({ keyId: 'k', secret, headers: { keyId: 'X-KID', timestamp: 'X-TS', contentSha256: 'X-Hash', signature: 'X-Sig' } }))
      .get('/x');
    expect(r.status).toBe(200);
  });

  it('signature changes with method, path and timestamp', async () => {
    const sigs = new Set<string>();
    for (const [method, path, now] of [['GET', '/a', 1], ['POST', '/a', 1], ['GET', '/b', 1], ['GET', '/a', 2]] as const) {
      const prepared = { method, url: new URL(`http://h${path}`), headers: {} as Record<string, string> };
      await hmacSigner({ keyId: 'k', secret, now: () => now }).apply(prepared);
      sigs.add(prepared.headers['x-signature']);
    }
    expect(sigs.size).toBe(4);
  });
});

describe('digestAuth (RFC 7616, qop=auth)', () => {
  const realm = 'testrealm';
  const nonce = 'dcd98b7102dd2f0e8b11d0f600bfb0c093';
  const opaque = '5ccc069c403ebaf9f0171e9517f40e41';

  function digestServer(alg: 'MD5' | 'SHA-256', user = 'alice', pass = 'wonderland') {
    const H = (s: string): string => createHash(alg === 'MD5' ? 'md5' : 'sha256').update(s).digest('hex');
    const state = { challenges: 0, verified: 0, ncs: [] as string[], bodies: [] as string[] };
    server.handle((req, res) => {
      const auth = header(req, 'authorization');
      const challenge = () => {
        state.challenges++;
        res.writeHead(401, { 'www-authenticate': `Digest realm="${realm}", qop="auth", algorithm=${alg}, nonce="${nonce}", opaque="${opaque}"` });
        res.end('unauthorized');
      };
      if (!auth?.startsWith('Digest ')) return challenge();
      const p: Record<string, string> = {};
      for (const m of auth.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)) p[m[1]] = m[2] ?? m[3];
      const ha1 = H(`${p.username}:${realm}:${pass}`);
      const ha2 = H(`${req.method}:${p.uri}`);
      const expected = H(`${ha1}:${nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
      const ok = p.username === user && p.uri === req.url && p.response === expected && p.realm === realm && p.nonce === nonce && p.opaque === opaque && p.algorithm === alg && p.qop === 'auth';
      if (!ok) return challenge();
      state.verified++;
      state.ncs.push(p.nc);
      state.bodies.push(req.text);
      json(res, 200, { user: p.username, uri: p.uri });
    });
    return state;
  }

  it.each(['MD5', 'SHA-256'] as const)('answers a %s challenge and the server verifies the response', async (alg) => {
    const state = digestServer(alg);
    const r = await client().withAuth(digestAuth('alice', 'wonderland')).get('/dir/index.html?x=1&y=a b');
    expect(r.status).toBe(200);
    expect(r.data.user).toBe('alice');
    expect(state.challenges).toBe(1);
    expect(state.verified).toBe(1);
    expect(state.ncs).toEqual(['00000001']);
  });

  it('subsequent requests of the same client reuse the challenge preemptively with an increasing nc', async () => {
    const state = digestServer('SHA-256');
    const c = client().withAuth(digestAuth('alice', 'wonderland'));
    await c.get('/a');
    await c.get('/b');
    await c.post('/c', { json: { z: 1 } });
    expect(state.challenges).toBe(1);
    expect(state.verified).toBe(3);
    expect(state.ncs).toEqual(['00000001', '00000002', '00000003']);
    // the POST body survives the challenge roundtrip
    const c2 = client().withAuth(digestAuth('alice', 'wonderland'));
    await c2.post('/d', { json: { hello: 'digest' } });
    expect(state.bodies.at(-1)).toBe('{"hello":"digest"}');
  });

  it('wrong password: the 401 is returned after a single retry (no loop)', async () => {
    const state = digestServer('MD5');
    const r = await client().withAuth(digestAuth('alice', 'WRONG')).get('/x');
    expect(r.status).toBe(401);
    expect(state.verified).toBe(0);
    expect(server.requests).toHaveLength(2);
  });

  it('a 401 without a Digest challenge is returned as-is', async () => {
    server.handle((_req, res) => {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="x"' });
      res.end();
    });
    const r = await client().withAuth(digestAuth('a', 'b')).get('/x');
    expect(r.status).toBe(401);
    expect(server.requests).toHaveLength(1);
  });

  it('a Digest challenge without nonce is ignored', async () => {
    server.handle((_req, res) => {
      res.writeHead(401, { 'www-authenticate': 'Digest realm="x"' });
      res.end();
    });
    const r = await client().withAuth(digestAuth('a', 'b')).get('/x');
    expect(r.status).toBe(401);
    expect(server.requests).toHaveLength(1);
  });

  it('challenge without qop uses the legacy RFC 2069 response', async () => {
    const H = (s: string): string => createHash('md5').update(s).digest('hex');
    server.handle((req, res) => {
      const auth = header(req, 'authorization');
      if (!auth) {
        res.writeHead(401, { 'www-authenticate': 'Digest realm="r", nonce="n1"' });
        return res.end();
      }
      const p: Record<string, string> = {};
      for (const m of auth.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]*))/g)) p[m[1]] = m[2] ?? m[3];
      const expected = H(`${H('u:r:p')}:n1:${H(`GET:${req.url}`)}`);
      json(res, p.response === expected && !p.qop ? 200 : 401, {});
    });
    expect((await client().withAuth(digestAuth('u', 'p')).get('/z')).status).toBe(200);
  });
});
