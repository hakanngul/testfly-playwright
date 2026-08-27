import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from '../src/client/ApiClient';
import type { APIRequestContext, APIResponse } from '@playwright/test';

describe('ApiClient', () => {
  const createMockResponse = (status: number, data: any, headers: Record<string, string> = {}): APIResponse => {
    return {
      status: () => status,
      statusText: () => (status === 200 ? 'OK' : 'Error'),
      ok: () => status >= 200 && status < 300,
      headers: () => ({ 'content-type': 'application/json', ...headers }),
      json: async () => data,
      text: async () => JSON.stringify(data),
      body: async () => Buffer.from(JSON.stringify(data)),
      dispose: async () => {},
      headersArray: () => [],
      url: () => 'https://api.example.com',
    } as unknown as APIResponse;
  };

  const createMockRequestContext = (handler: (url: string, opts?: any) => APIResponse): APIRequestContext => {
    return {
      get: vi.fn(async (url, opts) => handler(url, opts)),
      post: vi.fn(async (url, opts) => handler(url, opts)),
      put: vi.fn(async (url, opts) => handler(url, opts)),
      delete: vi.fn(async (url, opts) => handler(url, opts)),
      patch: vi.fn(async (url, opts) => handler(url, opts)),
      head: vi.fn(async (url, opts) => handler(url, opts)),
      fetch: vi.fn(async (url, opts) => handler(url, opts)),
      dispose: vi.fn(async () => {}),
      storageState: vi.fn(async () => ({ cookies: [], origins: [] })),
    } as unknown as APIRequestContext;
  };

  it('should perform GET request and parse JSON payload', async () => {
    const mockContext = createMockRequestContext((url) => {
      return createMockResponse(200, { id: 1, name: 'Alice' });
    });

    const client = new ApiClient(mockContext, 'https://api.example.com');
    const res = await client.get('/users/1');

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: 1, name: 'Alice' });
    expect(mockContext.get).toHaveBeenCalledWith(
      'https://api.example.com/users/1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('should manage authentication tokens and headers', async () => {
    let capturedOptions: any = null;
    const mockContext = createMockRequestContext((url, opts) => {
      capturedOptions = opts;
      return createMockResponse(201, { success: true });
    });

    const client = new ApiClient(mockContext, 'https://api.example.com');
    client.auth.setToken('secret-jwt-token-123');

    expect(client.auth.getToken()).toBe('secret-jwt-token-123');

    await client.post('/items', { data: { name: 'Book' } });

    expect(capturedOptions.headers['Authorization']).toBe('Bearer secret-jwt-token-123');
    expect(capturedOptions.data).toEqual({ name: 'Book' });
  });

  it('should support chainable builders and helpers', async () => {
    const mockContext = createMockRequestContext(() => createMockResponse(200, []));
    const client = new ApiClient(mockContext)
      .withBaseUrl('https://custom.api.io')
      .withHeader('X-Custom-Header', 'custom-value');

    await client.get('/orders');
    expect(mockContext.get).toHaveBeenCalledWith(
      'https://custom.api.io/orders',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom-Header': 'custom-value' }),
      })
    );
  });
});
