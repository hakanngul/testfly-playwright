import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { TestFlyError } from '../../core/errors';

/** A request received by {@link MockServer}. @public */
export interface MockServerRequest {
  method: string;
  /** Path without the query string. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Raw body as text. */
  body: string;
  /** Parsed JSON body, or `undefined` when the body is not JSON. */
  json: unknown;
  /** Whether a stub answered it (`false` means the server replied 404). */
  matched: boolean;
  timestamp: number;
}

/** Response of a stub. @public */
export interface MockServerResponse {
  status?: number;
  headers?: Record<string, string>;
  /** JSON body (sets `content-type: application/json`). */
  json?: unknown;
  /** Raw body. */
  body?: string | Buffer;
  /** Delay before answering, in ms. */
  delay?: number;
}

/** A static response or one computed from the request. @public */
export type MockServerReply = MockServerResponse | ((request: MockServerRequest) => MockServerResponse | Promise<MockServerResponse>);

/** Options of {@link MockServer.stub}. @public */
export interface MockStubOptions {
  /** Answer only the first `times` matching requests (default: unlimited). */
  times?: number;
}

/** Options of {@link MockServer.expectRequest} and {@link MockServer.waitForRequest}. @public */
export interface MockRequestMatch {
  /** Exact number of matching requests (default: at least one). */
  times?: number;
  /** Only requests whose JSON body contains these key/values (shallow). */
  body?: Record<string, unknown>;
}

interface Stub {
  method: string;
  path: RegExp;
  reply: MockServerReply;
  remaining: number;
}

/** `'/users/*'` → regex; RegExp passes through. */
function toPathMatcher(path: string | RegExp): RegExp {
  if (path instanceof RegExp) return path;
  const escaped = path.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Real HTTP stub server for tests without a page (API, contract or service tests) — the TestFly
 * `ApiMockServer` counterpart. Point the system under test at {@link MockServer.url}, declare stubs,
 * then assert on the requests it received. Unmatched requests get `404` and are recorded with
 * `matched: false`.
 *
 * @public
 */
export class MockServer {
  private server?: http.Server;
  private stubs: Stub[] = [];
  private requests: MockServerRequest[] = [];
  private baseUrl = '';

  /** Base URL, e.g. `http://127.0.0.1:53211` (after {@link start}). */
  get url(): string {
    if (!this.baseUrl) throw new TestFlyError('TF_INTERNAL', 'MockServer is not started.', { hint: 'Use the `mockServer` fixture or call start() first.' });
    return this.baseUrl;
  }

  async start(): Promise<this> {
    if (this.server) return this;
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.baseUrl = '';
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** Declare a stub. Later stubs win over earlier ones for the same request. Path: exact, `*` glob or RegExp. */
  stub(method: string, path: string | RegExp, reply: MockServerReply, options: MockStubOptions = {}): this {
    this.stubs.unshift({ method: method.toUpperCase(), path: toPathMatcher(path), reply, remaining: options.times ?? Infinity });
    return this;
  }

  get(path: string | RegExp, reply: MockServerReply, options?: MockStubOptions): this {
    return this.stub('GET', path, reply, options);
  }
  post(path: string | RegExp, reply: MockServerReply, options?: MockStubOptions): this {
    return this.stub('POST', path, reply, options);
  }
  put(path: string | RegExp, reply: MockServerReply, options?: MockStubOptions): this {
    return this.stub('PUT', path, reply, options);
  }
  patch(path: string | RegExp, reply: MockServerReply, options?: MockStubOptions): this {
    return this.stub('PATCH', path, reply, options);
  }
  delete(path: string | RegExp, reply: MockServerReply, options?: MockStubOptions): this {
    return this.stub('DELETE', path, reply, options);
  }

  /** Every request received so far (matched and unmatched), oldest first. */
  history(): MockServerRequest[] {
    return [...this.requests];
  }

  /** Remove all stubs and forget the request history. */
  reset(): void {
    this.stubs = [];
    this.requests = [];
  }

  /** Assert (now) that matching requests were received; throws `TF_MOCK_ASSERTION_FAILED`. */
  expectRequest(method: string, path: string | RegExp, match: MockRequestMatch = {}): MockServerRequest[] {
    const hits = this.find(method, path, match);
    if (!this.satisfies(hits.length, match)) throw this.mismatch(method, path, match, hits.length);
    return hits;
  }

  /** Like {@link expectRequest} but waits up to `timeout` ms for the requests to arrive. */
  async waitForRequest(method: string, path: string | RegExp, match: MockRequestMatch & { timeout?: number } = {}): Promise<MockServerRequest[]> {
    const deadline = Date.now() + (match.timeout ?? 5_000);
    for (;;) {
      const hits = this.find(method, path, match);
      if (this.satisfies(hits.length, match)) return hits;
      if (Date.now() > deadline) throw this.mismatch(method, path, match, hits.length);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /** Fail when the server received requests that no stub answered. */
  expectNoUnmatched(): void {
    const unmatched = this.requests.filter((r) => !r.matched);
    if (unmatched.length) {
      throw new TestFlyError('TF_MOCK_ASSERTION_FAILED', `MockServer received ${unmatched.length} unmatched request(s):\n${unmatched.map((r) => `    - ${r.method} ${r.path}`).join('\n')}`, {
        hint: 'Add a stub for them or check the URL the system under test calls.',
      });
    }
  }

  // ---------------------------------------------------------------- internals

  private find(method: string, path: string | RegExp, match: MockRequestMatch): MockServerRequest[] {
    const m = method.toUpperCase();
    const re = toPathMatcher(path);
    return this.requests.filter(
      (r) =>
        r.method === m &&
        re.test(r.path) &&
        (!match.body || (typeof r.json === 'object' && r.json !== null && Object.entries(match.body).every(([k, v]) => JSON.stringify((r.json as Record<string, unknown>)[k]) === JSON.stringify(v)))),
    );
  }

  private satisfies(count: number, match: MockRequestMatch): boolean {
    return match.times === undefined ? count > 0 : count === match.times;
  }

  private mismatch(method: string, path: string | RegExp, match: MockRequestMatch, count: number): TestFlyError {
    const want = match.times === undefined ? 'at least 1' : String(match.times);
    const seen = this.requests.map((r) => `    - ${r.method} ${r.path}${r.matched ? '' : ' (unmatched)'}`).join('\n') || '    (none)';
    return new TestFlyError('TF_MOCK_ASSERTION_FAILED', `Expected ${want} ${method.toUpperCase()} ${String(path)} request(s)${match.body ? ` with body ${JSON.stringify(match.body)}` : ''} but got ${count}.\n  Received:\n${seen}`);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url ?? '/', 'http://localhost');
    let json: unknown;
    try {
      json = body ? JSON.parse(body) : undefined;
    } catch {
      json = undefined;
    }
    const record: MockServerRequest = {
      method: (req.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')])),
      body,
      json,
      matched: false,
      timestamp: Date.now(),
    };
    this.requests.push(record);

    const stub = this.stubs.find((s) => s.remaining > 0 && s.method === record.method && s.path.test(record.path));
    if (!stub) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'No MockServer stub matches this request', method: record.method, path: record.path }));
      return;
    }
    stub.remaining--;
    record.matched = true;
    try {
      const out = typeof stub.reply === 'function' ? await stub.reply(record) : stub.reply;
      if (out.delay) await new Promise((r) => setTimeout(r, out.delay));
      const headers: Record<string, string> = { ...(out.headers ?? {}) };
      let payload: string | Buffer = '';
      if (out.json !== undefined) {
        headers['content-type'] ??= 'application/json';
        payload = JSON.stringify(out.json);
      } else if (out.body !== undefined) {
        payload = out.body;
      }
      res.writeHead(out.status ?? 200, headers);
      res.end(payload);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(`MockServer reply failed: ${(err as Error).message}`);
    }
  }
}
