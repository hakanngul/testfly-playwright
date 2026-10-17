import { expect, test } from './support/test';

// API-only tests: no page is opened, the mockServer fixture stands in for a downstream service.
test.describe('mockServer fixture', () => {
  test('stubs a service and verifies the calls the client made', async ({ api, mockServer }) => {
    mockServer.get('/users/*', (req) => ({ json: { id: Number(req.path.split('/').pop()), name: 'Ada' } }));
    mockServer.post('/audit', { status: 202 });

    const svc = api.withBaseUrl(mockServer.url);
    const user = await svc.get('/users/7');
    user.expectStatus(200).expectJsonEquals({ id: 7, name: 'Ada' });
    await svc.post('/audit', { json: { action: 'viewed', user: 7 } });

    mockServer.expectRequest('GET', '/users/7', { times: 1 });
    mockServer.expectRequest('POST', '/audit', { body: { action: 'viewed' } });
    mockServer.expectNoUnmatched();
  });

  test('each test starts with a clean server (no stubs, no history)', async ({ api, mockServer }) => {
    expect(mockServer.history()).toEqual([]);
    const res = await api.withBaseUrl(mockServer.url).get('/users/7');
    expect(res.status).toBe(404);
  });

  test('batch + interceptor against the mock server', async ({ api, mockServer }) => {
    mockServer.get('/n/*', (req) => ({ json: { n: Number(req.path.split('/').pop()), corr: req.headers['x-corr'] } }));
    const svc = api.withBaseUrl(mockServer.url).withInterceptor({ onRequest: (r) => void (r.headers['x-corr'] = 'run-1') });
    const results = await svc.batch([1, 2, 3].map((n) => (c) => c.get(`/n/${n}`)), { concurrency: 2 });
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => (r.ok ? r.response.data : null))).toEqual([1, 2, 3].map((n) => ({ n, corr: 'run-1' })));
  });
});
