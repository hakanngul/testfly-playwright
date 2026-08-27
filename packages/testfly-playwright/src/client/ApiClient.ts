import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ApiRequestOptions, ApiResponse, ApiAuthManager } from './types';
import { getTestFlyConfig } from '../config';

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

  private async wrapResponse<T>(raw: APIResponse): Promise<ApiResponse<T>> {
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

    return {
      status: raw.status(),
      statusText: raw.statusText(),
      ok: raw.ok(),
      headers: raw.headers(),
      data,
      raw,
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
    const raw = await this.request.get(url, {
      headers,
      params: options?.params,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw);
  }

  /**
   * HTTP POST
   */
  public async post<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
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
    return this.wrapResponse<T>(raw);
  }

  /**
   * HTTP PUT
   */
  public async put<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
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
    return this.wrapResponse<T>(raw);
  }

  /**
   * HTTP PATCH
   */
  public async patch<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
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
    return this.wrapResponse<T>(raw);
  }

  /**
   * HTTP DELETE
   */
  public async delete<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
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
    return this.wrapResponse<T>(raw);
  }

  /**
   * HTTP HEAD
   */
  public async head(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<any>> {
    const url = this.resolveUrl(endpoint);
    const headers = this.mergeHeaders(options?.headers);
    const raw = await this.request.head(url, {
      headers,
      params: options?.params,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse(raw);
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
    const raw = await this.request.fetch(url, {
      method: options?.method || 'GET',
      headers,
      params: options?.params,
      data: options?.data,
      form: options?.form,
      multipart: options?.multipart,
      timeout: options?.timeout,
      failOnStatusCode: options?.failOnStatusCode,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
    });
    return this.wrapResponse<T>(raw);
  }
}
