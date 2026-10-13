import type { Page, Route, Request } from '@playwright/test';
import { TestFlyError } from '../../core/errors';

/** @public */
export interface MockResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
  delay?: number;
}

/** A request that matched a mock route. @public */
export interface InterceptedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: unknown;
  timestamp: number;
}

/** Options of {@link MockClient.expectRequest}. @public */
export interface ExpectRequestOptions {
  method?: string;
  /** Exact number of matching requests (default: at least one). */
  times?: number;
}

type RouteHandler = (route: Route, request: Request) => Promise<void> | void;

/**
 * Thin helper over `page.route`: declare mocked responses, record the requests that hit them and assert on them.
 * `reset()` removes every route this client registered.
 *
 * @public
 */
export class MockClient {
  private interceptedRequests: InterceptedRequest[] = [];
  private activeRoutes: { pattern: string | RegExp; handler: RouteHandler }[] = [];

  constructor(private page: Page) {}

  private async register(pattern: string | RegExp, handler: RouteHandler): Promise<void> {
    this.activeRoutes.push({ pattern, handler });
    await this.page.route(pattern, handler);
  }

  private record(request: Request): void {
    let postData: unknown = null;
    try {
      postData = request.postDataJSON() || request.postData();
    } catch {
      postData = request.postData();
    }
    this.interceptedRequests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData,
      timestamp: Date.now(),
    });
  }

  /**
   * Assert that a request matching `urlOrPredicate` was intercepted (at least once, or exactly `times`).
   * Throws `TF_MOCK_ASSERTION_FAILED`.
   */
  expectRequest(urlOrPredicate: string | RegExp | ((req: InterceptedRequest) => boolean), opts: ExpectRequestOptions = {}): InterceptedRequest[] {
    const matches = this.interceptedRequests.filter((r) => {
      if (opts.method && r.method.toUpperCase() !== opts.method.toUpperCase()) return false;
      if (typeof urlOrPredicate === 'function') return urlOrPredicate(r);
      return typeof urlOrPredicate === 'string' ? r.url.includes(urlOrPredicate) : urlOrPredicate.test(r.url);
    });
    const ok = opts.times === undefined ? matches.length > 0 : matches.length === opts.times;
    if (!ok) {
      const seen = this.interceptedRequests.map((r) => `${r.method} ${r.url}`).join('\n    ') || '(none)';
      throw new TestFlyError(
        'TF_MOCK_ASSERTION_FAILED',
        `Expected ${opts.times === undefined ? 'at least one' : opts.times} intercepted request(s) matching ${typeof urlOrPredicate === 'function' ? 'predicate' : String(urlOrPredicate)}${opts.method ? ` (${opts.method})` : ''}, but found ${matches.length}.\n  Intercepted requests:\n    ${seen}`,
      );
    }
    return matches;
  }

  /**
   * Mock a GET request
   */
  async get(
    urlOrPattern: string | RegExp,
    body: unknown,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('GET', urlOrPattern, body, options);
  }

  /**
   * Mock a POST request
   */
  async post(
    urlOrPattern: string | RegExp,
    body: unknown,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('POST', urlOrPattern, body, options);
  }

  /**
   * Mock a PUT request
   */
  async put(
    urlOrPattern: string | RegExp,
    body: unknown,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('PUT', urlOrPattern, body, options);
  }

  /**
   * Mock a DELETE request
   */
  async delete(
    urlOrPattern: string | RegExp,
    body: unknown,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('DELETE', urlOrPattern, body, options);
  }

  /**
   * Mock a JSON response for any or specific HTTP method
   */
  async json(
    urlOrPattern: string | RegExp,
    data: unknown,
    status: number = 200,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('*', urlOrPattern, data, { ...options, status, contentType: 'application/json' });
  }

  /**
   * Simulate a delayed response (latency simulation)
   */
  async delay(
    urlOrPattern: string | RegExp,
    delayMs: number,
    body: unknown = {},
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('*', urlOrPattern, body, { ...options, delay: delayMs });
  }

  /**
   * Abort network request with specific failure code (e.g. failed, timedout, connectionreset)
   */
  async abort(urlOrPattern: string | RegExp, errorCode = 'failed'): Promise<void> {
    await this.register(urlOrPattern, async (route, request) => {
      this.record(request);
      await route.abort(errorCode);
    });
  }

  /**
   * Core routing and request interceptor handler
   */
  private async mockRoute(
    expectedMethod: string,
    urlOrPattern: string | RegExp,
    body: unknown,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.register(urlOrPattern, async (route: Route, request: Request) => {
      if (expectedMethod !== '*' && request.method().toUpperCase() !== expectedMethod.toUpperCase()) {
        // fallback (not continue) so mocks registered earlier for the same URL but another method still apply.
        await route.fallback();
        return;
      }

      this.record(request);

      if (options.delay && options.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }

      const stringBody = typeof body === 'string' ? body : JSON.stringify(body);
      const headers = {
        'content-type': options.contentType || 'application/json',
        'access-control-allow-origin': '*',
        ...options.headers,
      };

      await route.fulfill({
        status: options.status || 200,
        headers,
        body: stringBody,
      });
    });
  }

  /**
   * Get all intercepted network requests matching optional pattern
   */
  getHistory(urlPattern?: string | RegExp): InterceptedRequest[] {
    if (!urlPattern) {
      return [...this.interceptedRequests];
    }
    return this.interceptedRequests.filter((req) => {
      if (typeof urlPattern === 'string') {
        return req.url.includes(urlPattern);
      }
      return urlPattern.test(req.url);
    });
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    this.interceptedRequests = [];
  }

  /**
   * Remove all active mock routes from page
   */
  async reset(): Promise<void> {
    for (const { pattern, handler } of this.activeRoutes) {
      try {
        await this.page.unroute(pattern, handler);
      } catch {
        // Ignore if already unrouted
      }
    }
    this.activeRoutes = [];
    this.interceptedRequests = [];
  }
}
