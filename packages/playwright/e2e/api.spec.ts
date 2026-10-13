import { expect, test } from './support/test';

test.describe('api fixture', () => {
  test('GET with status/header/json assertions', async ({ api, server }) => {
    const res = await api.get(`${server}/json`);
    res.expectOk().expectStatus(200).expectHeader('x-test', 'yes').expectJson('$.hello', 'world');
    expect(res.jsonPath('$.items[*].id')).toEqual([1, 2]);
    expect(res.data).toMatchObject({ hello: 'world' });
  });

  test('base URL, headers, bearer and clones are immutable', async ({ api, server }) => {
    const scoped = api.withBaseUrl(server).withBearer('tok').withHeader('x-custom', 'c');
    const res = await scoped.get('/auth');
    expect(res.data).toEqual({ authorization: 'Bearer tok', custom: 'c' });
    const plain = await api.get(`${server}/auth`);
    expect(plain.data).toEqual({ authorization: null, custom: null });
  });

  test('relative URL without a base URL throws TF_CONFIG_MISSING', async ({ api }) => {
    await expect(api.get('/json')).rejects.toMatchObject({ code: 'TF_CONFIG_MISSING' });
  });

  test('POST json, form and query params', async ({ api, server }) => {
    const json = await api.post(`${server}/echo`, { json: { a: 1 }, params: { q: 'x' } });
    expect(json.jsonPath('$.method')).toBe('POST');
    expect(json.jsonPath('$.contentType')).toBe('application/json');
    expect(JSON.parse(json.jsonPath<string>('$.body'))).toEqual({ a: 1 });
    expect(json.jsonPath('$.query.q')).toBe('x');
    const form = await api.post(`${server}/echo`, { form: { a: '1', b: 'two' } });
    expect(form.jsonPath('$.body')).toBe('a=1&b=two');
    expect(form.jsonPath('$.contentType')).toBe('application/x-www-form-urlencoded');
  });

  test('retries on 5xx according to the policy and then succeeds', async ({ api, server }) => {
    const res = await api.get(`${server}/flaky?key=${test.info().testId}`, { retry: { attempts: 3, backoffMs: 5 } });
    expect(res.status).toBe(200);
    expect(res.jsonPath('$.attempt')).toBe(3);
  });

  test('does not retry by default (attempts: 0)', async ({ api, server }) => {
    const res = await api.get(`${server}/flaky?key=${test.info().testId}-none`);
    expect(res.status).toBe(503);
  });

  test('non-2xx is returned, failOnStatus throws TF_API_REQUEST_FAILED, expectStatus throws TF_API_ASSERTION_FAILED', async ({ api, server }) => {
    const res = await api.get(`${server}/missing`);
    expect(res.status).toBe(404);
    expect(() => res.expectOk()).toThrow(/TF_API_ASSERTION_FAILED/);
    expect(() => res.expectStatus(201)).toThrow(/TF_API_ASSERTION_FAILED/);
    await expect(api.get(`${server}/missing`, { failOnStatus: true })).rejects.toMatchObject({ code: 'TF_API_REQUEST_FAILED' });
  });

  test('pollUntil waits for the condition and times out with TF_API_POLL_TIMEOUT', async ({ api, server }) => {
    const key = test.info().testId;
    const res = await api.pollUntil((c) => c.get(`${server}/poll?key=${key}`), (r) => r.jsonPath('$.ready') === true, { interval: 20, timeout: 5000 });
    expect(res.jsonPath('$.n')).toBe(3);
    await expect(api.pollUntil((c) => c.get(`${server}/poll?key=${key}-never`), () => false, { interval: 20, timeout: 150 })).rejects.toMatchObject({
      code: 'TF_API_POLL_TIMEOUT',
    });
  });

  test('unreachable host surfaces a TestFlyError, not a silent fallback', async ({ api }) => {
    await expect(api.get('http://127.0.0.1:1/x', { timeout: 2000 })).rejects.toMatchObject({ name: 'TestFlyError', code: 'TF_API_REQUEST_FAILED' });
  });
});
