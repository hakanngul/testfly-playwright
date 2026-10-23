import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '../src';

// Runs real k6 (K6_PATH, see the 'load' project); skipped where k6 is not installed.
test.skip(!process.env.K6_PATH, 'set K6_PATH to a k6 binary to run the load fixture end to end');

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.statusCode = req.url === '/broken' ? 500 : 200;
    res.end('ok');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test('load.run measures a relative URL and attaches the k6 summary', async ({ load }, testInfo) => {
  const result = await load.run({ url: '/products', baseUrl, vus: 2, iterations: 40, thresholds: { p95Ms: 1000, errorRate: 0.01 } });
  result.assertPassed();
  expect(result.requests).toBe(40);
  expect(result.errorRate).toBe(0);
  expect(testInfo.attachments.map((a) => a.name)).toContain('k6-summary');
});

test('load.run reports crossed thresholds', async ({ load }) => {
  const result = await load.run({ requests: [{ url: `${baseUrl}/broken` }], iterations: 10, thresholds: { errorRate: 0.01 } });
  expect(result.passed).toBe(false);
  expect(result.errorRate).toBe(1);
  expect(() => result.assertPassed()).toThrow(/TF_LOAD_THRESHOLDS_FAILED/);
});
