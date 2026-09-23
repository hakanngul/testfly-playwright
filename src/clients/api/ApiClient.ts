import { test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { ApiRequestOptions, ApiResponse, ApiAuthManager } from './types';
import { getTestFlyConfig } from '../../core/config';


export class ApiClient {
  private request: APIRequestContext;
  private defaultHeaders: Record<string, string> = {};
  private customBaseUrl: string | null = null;
  private authToken: string | null = null;
  private customAuthHeaders: Record<string, string> = {};

  constructor(request: APIRequestContext, customBaseUrl?: string) {
    this.request = request;
    if (customBaseUrl) {
      this.customBaseUrl = customBaseUrl;
    }
  }

  /**
   * Auth management for API client
   */
  public auth: ApiAuthManager = {
    setToken: (token: string) => {
      this.authToken = token;
      this.customAuthHeaders['Authorization'] = `Bearer ${token}`;
    },
    setBearerToken: (token: string) => {
      this.authToken = token;
      this.customAuthHeaders['Authorization'] = `Bearer ${token}`;
    },
    setBasicAuth: (username: string, password: string) => {
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      this.authToken = encoded;
      this.customAuthHeaders['Authorization'] = `Basic ${encoded}`;
    },
    setApiKey: (name: string, value: string) => {
      this.customAuthHeaders[name] = value;
    },
    clear: () => {
      this.authToken = null;
      this.customAuthHeaders = {};
    },
    getToken: () => this.authToken,
    getHeaders: () => ({ ...this.customAuthHeaders }),
  };

  /**
   * Dynamic endpoint helper namespace (e.g., api.cart.addItem, api.users.create)
   */
  public cart = {
    addItem: async (item: { item: string; quantity?: number }) => {
      return this.post('/api/cart/items', { data: item });
    },
    getItems: async () => {
      return this.get('/api/cart/items');
    },
    clear: async () => {
      return this.delete('/api/cart');
    },
  };

  public users = {
    create: async (userData: Record<string, unknown>) => {
      return this.post('/api/users', { data: userData });
    },
    getById: async (id: string | number) => {
      return this.get(`/api/users/${id}`);
    },
    getAll: async () => {
      return this.get('/api/users');
    },
  };

  /**
   * Set custom base URL for subsequent requests
   */
  public withBaseUrl(baseUrl: string): this {
    this.customBaseUrl = baseUrl;
    return this;
  }

  /**
   * Set default header for subsequent requests
   */
  public withHeader(key: string, value: string): this {
    this.defaultHeaders[key] = value;
    return this;
  }

  /**
   * Set Bearer token
   */
  public withBearerToken(token: string): this {
    this.auth.setBearerToken(token);
    return this;
  }

  private resolveUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const config = getTestFlyConfig();
    const base = this.customBaseUrl || config.apiBaseUrl || config.baseUrl || '';
    if (!base) return endpoint;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }

  private mergeHeaders(optionsHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...this.customAuthHeaders,
      ...(optionsHeaders || {}),
    };
  }

  private async wrapResponse<T>(
    raw: APIResponse,
    duration: number = 0,
    method?: string,
    url?: string
  ): Promise<ApiResponse<T>> {
    let data: any = null;
    const contentType = raw.headers()['content-type'] || '';

    try {
      if (contentType.includes('application/json')) {
        data = await raw.json();
      } else {
        const text = await raw.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
    } catch {
      data = null;
    }

    // Auto attachment to Playwright test report if running in test context
    try {
      const testInfo = test.info();
      if (testInfo) {
        await testInfo.attach(`API ${method || 'REQUEST'} [${raw.status()}] (${duration}ms)`, {
          body: JSON.stringify(
            {
              method,
              url,
              status: raw.status(),
              statusText: raw.statusText(),
              durationMs: duration,
              headers: raw.headers(),
              response: data,
            },
            null,
            2
          ),
          contentType: 'application/json',
        });
      }
    } catch {
      // test.info() is unavailable outside active test worker
    }

    return {
      status: raw.status(),
      statusText: raw.statusText(),
      ok: raw.ok(),
      headers: raw.headers(),
      data,
      raw,
      duration,
      responseTimeMs: duration,
      text: () => raw.text(),
      json: <R = T>() => raw.json() as Promise<R>,
      body: () => raw.body(),
    };
  }

  /**
   * HTTP GET
   */
  public async get<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.get(url, {
      headers,
      params: options?.params,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, 'GET', url);
  }

  /**
   * HTTP POST
   */
  public async post<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.post(url, {
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, 'POST', url);
  }

  /**
   * HTTP PUT
   */
  public async put<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.put(url, {
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, 'PUT', url);
  }

  /**
   * HTTP PATCH
   */
  public async patch<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.patch(url, {
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, 'PATCH', url);
  }

  /**
   * HTTP DELETE
   */
  public async delete<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.delete(url, {
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, 'DELETE', url);
  }

  /**
   * HTTP HEAD
   */
  public async head(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<any>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const start = Date.now();
    const raw = await this.request.head(url, {
      headers,
      params: options?.params,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse(raw, Date.now() - start, 'HEAD', url);
  }

  /**
   * General HTTP Fetch
   */
  public async fetch<T = any>(
    endpoint: string,
    options?: ApiRequestOptions & { method?: string }
  ): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const method = options?.method || 'GET';
    const start = Date.now();
    const raw = await this.request.fetch(url, {
      method,
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw, Date.now() - start, method, url);
  }

  /**
   * Execute GraphQL query/mutation
   */
  public async graphql<T = any>(
    query: string,
    variables?: Record<string, any>,
    options?: ApiRequestOptions & { endpoint?: string }
  ): Promise<ApiResponse<T>> {
    const endpoint = options?.endpoint || '/graphql';
    return this.post<T>(endpoint, {
      ...options,
      data: { query, variables },
    });
  }

  /**
   * Validate response data or arbitrary payload against a Zod schema or validator
   */
  public assertSchema<T>(
    dataOrResponse: ApiResponse<T> | any,
    schema: { safeParse: (data: any) => { success: boolean; error?: any; data?: any } }
  ): void {
    const targetData =
      dataOrResponse && typeof dataOrResponse === 'object' && 'data' in dataOrResponse
        ? dataOrResponse.data
        : dataOrResponse;

    const result = schema.safeParse(targetData);
    if (!result.success) {
      const formattedErrors = JSON.stringify(result.error?.issues || result.error?.format() || result.error, null, 2);
      throw new Error(`❌ API Schema Validation Failed:\n${formattedErrors}`);
    }
  }
}
