import { Page, Route, Request } from '@playwright/test';

export interface MockResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
  delay?: number;
}

export interface InterceptedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: any;
  timestamp: number;
}

export class MockClient {
  private interceptedRequests: InterceptedRequest[] = [];
  private activeRoutes: (string | RegExp)[] = [];

  constructor(private page: Page) {}

  /**
   * Mock a GET request
   */
  async get(
    urlOrPattern: string | RegExp,
    body: any,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('GET', urlOrPattern, body, options);
  }

  /**
   * Mock a POST request
   */
  async post(
    urlOrPattern: string | RegExp,
    body: any,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('POST', urlOrPattern, body, options);
  }

  /**
   * Mock a PUT request
   */
  async put(
    urlOrPattern: string | RegExp,
    body: any,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('PUT', urlOrPattern, body, options);
  }

  /**
   * Mock a DELETE request
   */
  async delete(
    urlOrPattern: string | RegExp,
    body: any,
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('DELETE', urlOrPattern, body, options);
  }

  /**
   * Mock a JSON response for any or specific HTTP method
   */
  async json(
    urlOrPattern: string | RegExp,
    data: any,
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
    body: any = {},
    options: MockResponseOptions = {}
  ): Promise<void> {
    await this.mockRoute('*', urlOrPattern, body, { ...options, delay: delayMs });
  }

  /**
   * Abort network request with specific failure code (e.g. failed, timedout, connectionreset)
   */
  async abort(urlOrPattern: string | RegExp, errorCode: string = 'failed'): Promise<void> {
    this.activeRoutes.push(urlOrPattern);
    await this.page.route(urlOrPattern, (route) => {
      route.abort(errorCode as any);
    });
  }

  /**
   * Core routing and request interceptor handler
   */
  private async mockRoute(
    expectedMethod: string,
    urlOrPattern: string | RegExp,
    body: any,
    options: MockResponseOptions = {}
  ): Promise<void> {
    this.activeRoutes.push(urlOrPattern);

    await this.page.route(urlOrPattern, async (route: Route, request: Request) => {
      if (expectedMethod !== '*' && request.method().toUpperCase() !== expectedMethod.toUpperCase()) {
        await route.continue();
        return;
      }

      // Record request in history
      let parsedPostData: any = null;
      try {
        parsedPostData = request.postDataJSON() || request.postData();
      } catch {
        parsedPostData = request.postData();
      }

      this.interceptedRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: parsedPostData,
        timestamp: Date.now(),
      });

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
    for (const route of this.activeRoutes) {
      try {
        await this.page.unroute(route);
      } catch {
        // Ignore if already unrouted
      }
    }
    this.activeRoutes = [];
    this.interceptedRequests = [];
  }
}
