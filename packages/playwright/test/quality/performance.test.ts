import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { PerformanceClient, type WebVitals } from '../../src/quality/performance';
import { TestFlyError } from '../../src/core/errors';
import { launchChromium } from '../helpers/browser';
import { startServer, type TestServer } from '../helpers/server';

let browser: Browser;
let server: TestServer;
let page: Page;

beforeAll(async () => {
  browser = await launchChromium();
  server = await startServer((req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><h1>slow</h1>');
      }, 300);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><body><h1>Hello performance</h1><p>Some content that paints.</p></body></html>');
  });
  page = await browser.newPage();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** Page double whose `evaluate` returns fixed vitals, for threshold logic. */
const fakePage = (vitals: Partial<WebVitals>): Page =>
  ({ evaluate: async () => ({ ttfb: null, domContentLoaded: null, loadTime: null, fcp: null, lcp: null, cls: null, ...vitals }) }) as unknown as Page;

describe('PerformanceClient.getVitals (real browser)', () => {
  it('reports measured navigation and paint metrics, never fabricated values', async () => {
    await page.goto(server.url);
    await page.waitForLoadState('load');
    const vitals = await new PerformanceClient(page).getVitals();
    expect(vitals.ttfb).toBeGreaterThanOrEqual(0);
    expect(vitals.ttfb).toBeLessThan(5000);
    expect(vitals.domContentLoaded).toBeGreaterThan(0);
    expect(vitals.loadTime).toBeGreaterThan(0);
    for (const key of ['fcp', 'lcp', 'cls'] as const) {
      expect(vitals[key] === null || typeof vitals[key] === 'number').toBe(true);
    }
    expect(vitals.cls === null || vitals.cls >= 0).toBe(true);
  });

  it('measures a deliberately slow TTFB', async () => {
    await page.goto(`${server.url}/slow`);
    const vitals = await new PerformanceClient(page).getVitals();
    expect(vitals.ttfb).toBeGreaterThanOrEqual(250);
    await expect(new PerformanceClient(page).assertTtfb(100)).rejects.toMatchObject({ code: 'TF_QUALITY_ASSERTION_FAILED' });
    await expect(new PerformanceClient(page).assertTtfb(10_000)).resolves.toBeUndefined();
  });

  it('returns null metrics for about:blank instead of inventing numbers', async () => {
    const blank = await browser.newPage();
    await blank.goto('about:blank');
    const vitals = await new PerformanceClient(blank).getVitals();
    expect(vitals.fcp).toBeNull();
    expect(vitals.lcp).toBeNull();
    await blank.close();
  });
});

describe('PerformanceClient assertions', () => {
  it('passes at and below the threshold', async () => {
    const client = new PerformanceClient(fakePage({ lcp: 1200, cls: 0.02, ttfb: 120 }));
    await expect(client.assertLcp(2500)).resolves.toBeUndefined();
    await expect(client.assertLcp(1200)).resolves.toBeUndefined();
    await expect(client.assertCls()).resolves.toBeUndefined();
    await expect(client.assertTtfb()).resolves.toBeUndefined();
  });

  it('throws TF_QUALITY_ASSERTION_FAILED with the measured value and details', async () => {
    const client = new PerformanceClient(fakePage({ lcp: 1200, cls: 0.5, ttfb: 900 }));
    const lcp = (await client.assertLcp(1000).catch((e: unknown) => e)) as TestFlyError;
    expect(lcp.code).toBe('TF_QUALITY_ASSERTION_FAILED');
    expect(lcp.message).toContain('LCP is 1200ms, above the allowed 1000ms');
    expect(lcp.details).toEqual({ metric: 'lcp', value: 1200, max: 1000 });
    await expect(client.assertCls(0.1)).rejects.toThrow(/CLS is 0\.5, above the allowed 0\.1\./);
    await expect(client.assertTtfb()).rejects.toThrow(/TTFB is 900ms, above the allowed 800ms/);
  });

  it('throws TF_QUALITY_UNSUPPORTED when the metric is unavailable', async () => {
    const client = new PerformanceClient(fakePage({}));
    for (const call of [() => client.assertLcp(), () => client.assertCls(), () => client.assertTtfb()]) {
      await expect(call()).rejects.toMatchObject({ code: 'TF_QUALITY_UNSUPPORTED' });
    }
  });
});
