import { describe, it, expect, vi } from 'vitest';
import { MockClient } from '../src/clients/mock/MockClient';


describe('MockClient', () => {
  it('should manage route interception and history tracking', async () => {
    let routeHandler: any = null;
    const mockPage: any = {
      route: vi.fn((pattern, handler) => {
        routeHandler = handler;
      }),
      unroute: vi.fn(),
    };

    const mockClient = new MockClient(mockPage);

    await mockClient.get('/api/v1/user', { id: 1, name: 'Alice' }, { status: 200 });
    expect(mockPage.route).toHaveBeenCalledWith('/api/v1/user', expect.any(Function));

    // Simulate route trigger
    const mockRequest: any = {
      url: () => 'https://example.com/api/v1/user',
      method: () => 'GET',
      headers: () => ({ authorization: 'Bearer token' }),
      postData: () => null,
      postDataJSON: () => null,
    };

    const mockRoute: any = {
      fulfill: vi.fn(),
      continue: vi.fn(),
    };

    await routeHandler(mockRoute, mockRequest);

    expect(mockRoute.fulfill).toHaveBeenCalledWith({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ id: 1, name: 'Alice' }),
    });

    const history = mockClient.getHistory('/api/v1/user');
    expect(history).toHaveLength(1);
    expect(history[0].method).toBe('GET');

    await mockClient.reset();
    expect(mockPage.unroute).toHaveBeenCalled();
    expect(mockClient.getHistory()).toHaveLength(0);
  });
});
