import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScript, parseSummary, runK6 } from '../../src/core/load/k6';
import { TestFlyError } from '../../src/core/errors';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tf-load-'));

/** A fake `k6` that writes `summary` (if any) to --summary-export and exits with `code`. */
function fakeK6(code: number, summary?: unknown): string {
  const dir = tmp();
  const bin = path.join(dir, 'k6');
  const write = summary === undefined ? '' : `fs.writeFileSync(out, ${JSON.stringify(JSON.stringify(summary))});`;
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node\nconst fs = require('fs');\nconst a = process.argv;\nconst out = a[a.indexOf('--summary-export') + 1];\n${write}\nconsole.error('fake k6 output');\nprocess.exit(${code});\n`,
  );
  fs.chmodSync(bin, 0o755);
  return bin;
}

const SUMMARY = {
  metrics: {
    http_req_duration: { avg: 12, min: 1, med: 10, max: 80, 'p(90)': 20, 'p(95)': 30, 'p(99)': 70, thresholds: { 'p(95)<500': false } },
    http_req_failed: { passes: 0, fails: 100, value: 0, thresholds: { 'rate<0.01': false } },
    http_reqs: { count: 100, rate: 50 },
    checks: { passes: 100, fails: 0, value: 1 },
  },
};

describe('buildScript', () => {
  it('turns requests, load shape and thresholds into a k6 script', () => {
    const script = buildScript({
      requests: [
        { url: 'https://api.example/products' },
        { url: 'https://api.example/orders', method: 'POST', body: { sku: 'A1' }, headers: { 'X-Trace': '1' } },
      ],
      vus: 5,
      duration: '30s',
      sleepSeconds: 1,
      thresholds: { p95Ms: 500, p99Ms: 900, errorRate: 0.01 },
    });
    expect(script).toContain(`import http from 'k6/http';`);
    expect(script).toContain('"vus": 5');
    expect(script).toContain('"duration": "30s"');
    expect(script).toContain('"http_req_duration": [\n      "p(95)<500",\n      "p(99)<900"');
    expect(script).toContain('"rate<0.01"');
    expect(script).toContain(`http.request("GET", "https://api.example/products", null`);
    expect(script).toContain(`http.request("POST", "https://api.example/orders", "{\\"sku\\":\\"A1\\"}", { headers: {"Content-Type":"application/json","X-Trace":"1"}`);
    expect(script).toContain('sleep(1);');
  });

  it('uses iterations or a ramp-up instead of a fixed duration', () => {
    expect(buildScript({ requests: [{ url: 'http://x/' }], iterations: 20, vus: 2 })).toContain('"iterations": 20');
    const ramp = buildScript({ requests: [{ url: 'http://x/' }], vus: 10, rampUp: '5s', duration: '20s' });
    expect(ramp).toContain('"stages"');
    expect(ramp).toContain('"target": 10');
  });
});

describe('parseSummary', () => {
  it('reads the k6 summary export', () => {
    const r = parseSummary(SUMMARY, 0);
    expect(r).toMatchObject({ passed: true, failedThresholds: [], requests: 100, requestsPerSecond: 50, errorRate: 0, checksRate: 1 });
    expect(r.durationMs).toEqual({ avg: 12, min: 1, med: 10, max: 80, p90: 20, p95: 30, p99: 70 });
    expect(() => r.assertPassed()).not.toThrow();
  });

  it('reports crossed thresholds and fails assertPassed', () => {
    const crossed = structuredClone(SUMMARY);
    crossed.metrics.http_req_duration.thresholds = { 'p(95)<5': true };
    const r = parseSummary(crossed, 99);
    expect(r.passed).toBe(false);
    expect(r.failedThresholds).toEqual(['http_req_duration: p(95)<5']);
    expect(() => r.assertPassed()).toThrow(/TF_LOAD_THRESHOLDS_FAILED.*http_req_duration: p\(95\)<5/s);
  });
});

describe('runK6 with a fake k6', () => {
  const script = () => {
    const f = path.join(tmp(), 'load.js');
    fs.writeFileSync(f, '// script');
    return f;
  };

  it('returns the summary for exit codes 0 and 99', async () => {
    expect((await runK6(fakeK6(0, SUMMARY), script(), {}, 10_000)).passed).toBe(true);
    expect((await runK6(fakeK6(99, SUMMARY), script(), {}, 10_000)).passed).toBe(false);
  });

  it('fails clearly when k6 is missing, crashes or leaves no summary', async () => {
    await expect(runK6('/nonexistent/k6', script(), {}, 10_000)).rejects.toMatchObject({ code: 'TF_LOAD_K6_MISSING' });
    const crash = runK6(fakeK6(107), script(), {}, 10_000);
    await expect(crash).rejects.toBeInstanceOf(TestFlyError);
    await expect(runK6(fakeK6(107), script(), {}, 10_000)).rejects.toThrow(/TF_LOAD_RUN_FAILED.*code 107.*fake k6 output/s);
  });
});

// Real k6: set K6_PATH (e.g. a downloaded release binary) to run it against a local server.
describe.skipIf(!process.env.K6_PATH)('runK6 with real k6', () => {
  let server: http.Server;
  let url: string;
  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const run = (thresholds: object) => {
    const f = path.join(tmp(), 'load.js');
    fs.writeFileSync(f, buildScript({ requests: [{ url }], vus: 2, iterations: 50, thresholds }));
    return runK6(process.env.K6_PATH!, f, {}, 60_000);
  };

  it('passes when the thresholds hold', async () => {
    const r = await run({ p95Ms: 1000, errorRate: 0.01 });
    expect(r.passed).toBe(true);
    expect(r.requests).toBe(50);
    expect(r.errorRate).toBe(0);
    expect(r.checksRate).toBe(1);
    expect(r.durationMs.p95).toBeGreaterThan(0);
  }, 60_000);

  it('fails when a threshold is crossed', async () => {
    const r = await run({ p95Ms: 0.000001 });
    expect(r.passed).toBe(false);
    expect(r.failedThresholds).toEqual(['http_req_duration: p(95)<0.000001']);
  }, 60_000);
});
