import { describe, it, expect, vi } from 'vitest';
import { PerformanceClient } from '../src/performance/PerformanceClient';

describe('PerformanceClient', () => {
  it('should retrieve Web Vitals from page and assert thresholds', async () => {
    const mockPage: any = {
      evaluate: vi.fn().mockResolvedValue({
        ttfb: 120,
        domContentLoaded: 350,
        loadTime: 850,
        fcp: 300,
        lcp: 1200,
        cls: 0.02,
      }),
    };

    const client = new PerformanceClient(mockPage);

    const vitals = await client.getVitals();
    expect(vitals.lcp).toBe(1200);
    expect(vitals.cls).toBe(0.02);
    expect(vitals.ttfb).toBe(120);

    await expect(client.assertLcp(2500)).resolves.not.toThrow();
    await expect(client.assertCls(0.1)).resolves.not.toThrow();
    await expect(client.assertTtfb(800)).resolves.not.toThrow();

    await expect(client.assertLcp(1000)).rejects.toThrow('Performance Assert Failed: LCP');
    await expect(client.assertCls(0.01)).rejects.toThrow('Performance Assert Failed: CLS');
  });
});
