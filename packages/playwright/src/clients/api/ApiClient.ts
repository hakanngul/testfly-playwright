import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { CONTENT_TYPES, toAttachment, type ApiEvent } from '@testfly/reporter/schema';
import { TestFlyError } from '../../core/errors';
import type { ApiOptions } from '../../core/config/schema';
import { ApiResponse } from './response';
import { basicAuth, bearerAuth } from './auth';
import type { AuthStrategy, PreparedRequest } from './auth';
import { buildCurl, truncate } from './curl';
import type { ApiFetchOptions, ApiRequestOptions, GraphqlOptions, PollOptions, RetryPolicy } from './types';

/** Constructor options for {@link ApiClient}. @public */
export type ApiClientOptions = ApiOptions & { baseUrl?: string };

/** State shared by all clones of one client (so events are flushed once per test). */
interface SharedState {
  request: APIRequestContext;
  options: ApiClientOptions;
  testInfo?: TestInfo;
  events: ApiEvent[];
}

interface ClientConfig {
  baseUrl?: string;
  headers: Record<string, string>;
  auth?: AuthStrategy;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * HTTP client on top of Playwright's `APIRequestContext`.
 *
 * Configuration methods (`withBaseUrl`, `withHeader`, `withBearer`, …) are immutable: they return a new
 * client and never change the receiver, so tests cannot leak state into each other.
 *
 * @public
 */
export class ApiClient {
  private readonly shared: SharedState;
  private readonly config: ClientConfig;

  constructor(request: APIRequestContext, options: ApiClientOptions, testInfo?: TestInfo);
  /** @internal */
  constructor(shared: SharedState, config: ClientConfig, _clone: true);
  constructor(a: APIRequestContext | SharedState, b: ApiClientOptions | ClientConfig, c?: TestInfo | true) {
    if (c === true) {
      this.shared = a as SharedState;
      this.config = b as ClientConfig;
      return;
    }
    const options = b as ApiClientOptions;
    this.shared = { request: a as APIRequestContext, options, testInfo: c, events: [] };
    this.config = { baseUrl: options.baseUrl, headers: lowerKeys(options.headers ?? {}) };
  }

  // ---- immutable configuration ----

  private derive(patch: Partial<ClientConfig>): ApiClient {
    return new ApiClient(this.shared, { ...this.config, ...patch }, true);
  }

  /** New client using another base URL. */
  withBaseUrl(baseUrl: string): ApiClient {
    return this.derive({ baseUrl });
  }

  /** New client with an extra default header. */
  withHeader(name: string, value: string): ApiClient {
    return this.derive({ headers: { ...this.config.headers, [name.toLowerCase()]: value } });
  }

  /** New client with extra default headers. */
  withHeaders(headers: Record<string, string>): ApiClient {
    return this.derive({ headers: { ...this.config.headers, ...lowerKeys(headers) } });
  }

  /** New client sending `Authorization: Bearer <token>`. */
  withBearer(token: string): ApiClient {
    return this.withAuth(bearerAuth(token));
  }

  /** New client using HTTP Basic auth. */
  withBasic(username: string, password: string): ApiClient {
    return this.withAuth(basicAuth(username, password));
  }

  /** New client using an auth strategy (see `bearerAuth`, `oauth2ClientCredentials`, `hmacSigner`, `digestAuth`, …). */
  withAuth(strategy: AuthStrategy): ApiClient {
    return this.derive({ auth: strategy });
  }

  // ---- HTTP verbs ----

  get<T = any>(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('GET', url, opts);
  }
  post<T = any>(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('POST', url, opts);
  }
  put<T = any>(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('PUT', url, opts);
  }
  patch<T = any>(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('PATCH', url, opts);
  }
  delete<T = any>(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('DELETE', url, opts);
  }
  head(url: string, opts?: ApiRequestOptions): Promise<ApiResponse<string>> {
    return this.send<string>('HEAD', url, opts);
  }
  fetch<T = any>(url: string, opts: ApiFetchOptions = {}): Promise<ApiResponse<T>> {
    return this.send<T>((opts.method ?? 'GET').toUpperCase(), url, opts);
  }

  /** POST a GraphQL operation (default endpoint `/graphql`). */
  graphql<T = any>(query: string, variables?: Record<string, unknown>, opts: GraphqlOptions = {}): Promise<ApiResponse<T>> {
    const { endpoint, operationName, ...rest } = opts;
    return this.send<T>('POST', endpoint ?? '/graphql', { ...rest, json: { query, variables, operationName } });
  }

  /**
   * Repeat a request until `predicate` accepts the response.
   * Throws `TF_API_POLL_TIMEOUT` (with the last response or error) when the budget is spent.
   */
  async pollUntil<T = any>(
    fn: (client: ApiClient) => Promise<ApiResponse<T>>,
    predicate: (res: ApiResponse<T>) => boolean | Promise<boolean>,
    opts: PollOptions = {},
  ): Promise<ApiResponse<T>> {
    const timeout = opts.timeout ?? 10_000;
    const interval = opts.interval ?? 500;
    const deadline = Date.now() + timeout;
    let last: ApiResponse<T> | undefined;
    let lastError: unknown;
    let attempts = 0;
    for (;;) {
      attempts++;
      try {
        last = await fn(this);
        lastError = undefined;
        if (await predicate(last)) return last;
        if (opts.failFastOn?.(last)) {
          throw new TestFlyError('TF_API_POLL_TIMEOUT', `Polling aborted by failFastOn after ${attempts} attempt(s). Last: ${describe(last)}`, {
            details: { attempts, status: last.status },
          });
        }
      } catch (err) {
        if (err instanceof TestFlyError && err.code === 'TF_API_POLL_TIMEOUT') throw err;
        lastError = err;
      }
      if (Date.now() + interval > deadline) break;
      await sleep(interval);
    }
    const lastDesc = lastError ? `error: ${(lastError as Error).message}` : last ? describe(last) : 'no response';
    throw new TestFlyError('TF_API_POLL_TIMEOUT', `Condition not met within ${timeout}ms (${attempts} attempt(s)). Last ${lastDesc}`, {
      cause: lastError,
      details: { attempts, timeout, lastStatus: last?.status },
    });
  }

  /** Attach all collected API events to the test (once). Called by the fixture teardown. */
  async flushEvents(): Promise<void> {
    const { testInfo, events } = this.shared;
    if (!testInfo || events.length === 0) return;
    const batch = events.splice(0, events.length);
    await testInfo.attach('testfly-api', toAttachment(CONTENT_TYPES.api, batch));
  }

  // ---- internals ----

  private resolveUrl(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    const base = this.config.baseUrl;
    if (!base) {
      throw new TestFlyError('TF_CONFIG_MISSING', `Cannot resolve relative API path "${endpoint}" without a base URL.`, {
        hint: 'Set testfly.api.baseUrl, use.baseURL, or call api.withBaseUrl(...).',
      });
    }
    return `${base.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
  }

  private buildBody(opts: ApiRequestOptions, headers: Record<string, string>): string | Buffer | undefined {
    if (opts.json !== undefined) {
      headers['content-type'] ??= 'application/json';
      return JSON.stringify(opts.json);
    }
    if (opts.form) {
      headers['content-type'] ??= 'application/x-www-form-urlencoded';
      return new URLSearchParams(Object.entries(opts.form).map(([k, v]) => [k, String(v)])).toString();
    }
    if (opts.data === undefined || opts.multipart) return undefined;
    if (typeof opts.data === 'string' || Buffer.isBuffer(opts.data)) return opts.data;
    headers['content-type'] ??= 'application/json';
    return JSON.stringify(opts.data);
  }

  private async send<T>(method: string, endpoint: string, opts: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { options } = this.shared;
    const policy: RetryPolicy = { ...options.retry, ...opts.retry };
    const baseUrl = this.resolveUrl(endpoint);
    const baseHeaders = { ...this.config.headers, ...lowerKeys(opts.headers ?? {}) };
    const body = this.buildBody(opts, baseHeaders);
    const maxAttempts = Math.max(0, policy.attempts) + 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isLast = attempt === maxAttempts;
      try {
        let res = await this.attempt<T>(method, baseUrl, baseHeaders, body, opts, attempt);
        if (res.status === 401 && this.config.auth?.handleChallenge) {
          res = (await this.retryAfterChallenge<T>(method, baseUrl, baseHeaders, body, opts, attempt, res)) ?? res;
        }
        if (!isLast && policy.onStatus.includes(res.status)) {
          await sleep(policy.backoffMs * 2 ** (attempt - 1));
          continue;
        }
        if (opts.failOnStatus && !res.ok) {
          throw new TestFlyError('TF_API_REQUEST_FAILED', `${method} ${res.request.url} failed with status ${res.status}.\n  body: ${truncate(res.text(), options.truncateAt)}`, {
            details: { method, url: res.request.url, status: res.status },
          });
        }
        return res;
      } catch (err) {
        if (err instanceof TestFlyError) throw err;
        lastError = err;
        if (isLast || !policy.onNetworkError) break;
        await sleep(policy.backoffMs * 2 ** (attempt - 1));
      }
    }
    throw new TestFlyError('TF_API_REQUEST_FAILED', `${method} ${baseUrl} failed: ${(lastError as Error)?.message ?? 'network error'}`, {
      cause: lastError,
      details: { method, url: baseUrl },
    });
  }

  private async retryAfterChallenge<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    opts: ApiRequestOptions,
    attempt: number,
    first: ApiResponse<T>,
  ): Promise<ApiResponse<T> | undefined> {
    const prepared = this.prepare(method, url, headers, body, opts);
    const ok = await this.config.auth!.handleChallenge!(prepared, { status: first.status, headers: first.headers });
    if (!ok) return undefined;
    return this.execute<T>(prepared, opts, attempt);
  }

  private prepare(method: string, url: string, headers: Record<string, string>, body: string | Buffer | undefined, opts: ApiRequestOptions): PreparedRequest {
    const u = new URL(url);
    for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return { method, url: u, headers: { ...headers }, body };
  }

  private async attempt<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Buffer | undefined,
    opts: ApiRequestOptions,
    attempt: number,
  ): Promise<ApiResponse<T>> {
    const prepared = this.prepare(method, url, headers, body, opts);
    await this.config.auth?.apply(prepared);
    return this.execute<T>(prepared, opts, attempt);
  }

  private async execute<T>(prepared: PreparedRequest, opts: ApiRequestOptions, attempt: number): Promise<ApiResponse<T>> {
    const { request, options } = this.shared;
    const fullUrl = prepared.url.toString();
    const start = Date.now();
    let raw: APIResponse;
    try {
      raw = await request.fetch(fullUrl, {
        method: prepared.method,
        headers: prepared.headers,
        data: opts.multipart ? undefined : prepared.body,
        multipart: opts.multipart,
        timeout: opts.timeout,
        failOnStatusCode: false,
      });
    } catch (err) {
      this.record(prepared, 0, Date.now() - start, attempt, undefined, opts);
      throw err;
    }
    const buf = await raw.body();
    const durationMs = Date.now() - start;
    const res = new ApiResponse<T>({
      status: raw.status(),
      statusText: raw.statusText(),
      headers: raw.headers(),
      body: buf,
      durationMs,
      request: { method: prepared.method, url: fullUrl },
      truncateAt: options.truncateAt,
    });
    this.record(prepared, res.status, durationMs, attempt, res.text(), opts);
    return res;
  }

  private record(prepared: PreparedRequest, status: number, durationMs: number, attempt: number, responseText: string | undefined, opts: ApiRequestOptions): void {
    const { testInfo, options, events } = this.shared;
    if (!testInfo) return;
    const bodyStr = prepared.body === undefined ? undefined : prepared.body.toString();
    const url = prepared.url.toString();
    const event: ApiEvent = {
      method: prepared.method,
      url,
      status,
      durationMs,
      attempt,
      // logBodies=false must keep request bodies out of the curl command too (they may hold secrets).
      curl: buildCurl(prepared.method, url, prepared.headers, opts.multipart || !options.logBodies ? undefined : bodyStr),
    };
    if (options.logBodies) {
      if (bodyStr) event.requestBody = truncate(bodyStr, options.truncateAt);
      if (responseText) event.responseBody = truncate(responseText, options.truncateAt);
    }
    events.push(event);
  }
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

function describe(res: ApiResponse): string {
  return `${res.request.method} ${res.request.url} → ${res.status}: ${truncate(res.text(), 300)}`;
}
