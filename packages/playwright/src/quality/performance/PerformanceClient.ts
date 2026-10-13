import type { Page } from '@playwright/test';
import { TestFlyError } from '../../core/errors';

/**
 * Measured page metrics in milliseconds (CLS is unitless). A metric the browser cannot report
 * (for example LCP/CLS outside Chromium) is `null` – values are never estimated.
 *
 * @public
 */
export interface WebVitals {
  /** Time to first byte. */
  ttfb: number | null;
  /** DOMContentLoaded relative to navigation start. */
  domContentLoaded: number | null;
  /** Load event end relative to navigation start. */
  loadTime: number | null;
  /** First Contentful Paint. */
  fcp: number | null;
  /** Largest Contentful Paint. */
  lcp: number | null;
  /** Cumulative Layout Shift. */
  cls: number | null;
}

/**
 * Web Vitals collection and assertions. Exposed as the `perf` fixture.
 * @public
 */
export class PerformanceClient {
  constructor(private readonly page: Page) {}

  /** Read navigation timings plus buffered paint, LCP and layout-shift entries of the current page. */
  async getVitals(): Promise<WebVitals> {
    return this.page.evaluate(async (): Promise<WebVitals> => {
      const round = (n: number): number => Math.max(0, Math.round(n));
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];

      const observe = (type: string): Promise<PerformanceEntry[] | null> =>
        new Promise((resolve) => {
          if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return resolve(null);
          const seen: PerformanceEntry[] = [];
          const observer = new PerformanceObserver((list) => seen.push(...list.getEntries()));
          observer.observe({ type, buffered: true });
          setTimeout(() => {
            seen.push(...observer.takeRecords());
            observer.disconnect();
            resolve(seen);
          }, 50);
        });

      const [lcpEntries, shifts] = await Promise.all([observe('largest-contentful-paint'), observe('layout-shift')]);
      const lcpLast = lcpEntries && lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : undefined;
      const cls = shifts
        ? Number(
            shifts
              .filter((e) => !(e as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput)
              .reduce((sum, e) => sum + ((e as PerformanceEntry & { value?: number }).value ?? 0), 0)
              .toFixed(4),
          )
        : null;

      return {
        ttfb: nav ? round(nav.responseStart - nav.startTime) : null,
        domContentLoaded: nav ? round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        loadTime: nav && nav.loadEventEnd > 0 ? round(nav.loadEventEnd - nav.startTime) : null,
        fcp: fcpEntry ? round(fcpEntry.startTime) : null,
        lcp: lcpLast ? round(lcpLast.startTime) : null,
        cls,
      };
    });
  }

  /** Assert LCP is at most `maxMs` (default 2500, "good" threshold). */
  async assertLcp(maxMs = 2500): Promise<void> {
    await this.assertMetric('lcp', maxMs, 'ms');
  }

  /** Assert CLS is at most `maxScore` (default 0.1, "good" threshold). */
  async assertCls(maxScore = 0.1): Promise<void> {
    await this.assertMetric('cls', maxScore, '');
  }

  /** Assert TTFB is at most `maxMs` (default 800, "good" threshold). */
  async assertTtfb(maxMs = 800): Promise<void> {
    await this.assertMetric('ttfb', maxMs, 'ms');
  }

  private async assertMetric(metric: 'lcp' | 'cls' | 'ttfb', max: number, unit: string): Promise<void> {
    const vitals = await this.getVitals();
    const value = vitals[metric];
    if (value === null) {
      throw new TestFlyError('TF_QUALITY_UNSUPPORTED', `${metric.toUpperCase()} is not available in this browser or page.`, {
        hint: 'LCP and CLS are only reported by Chromium-based browsers, after the page has rendered.',
      });
    }
    if (value > max) {
      throw new TestFlyError('TF_QUALITY_ASSERTION_FAILED', `${metric.toUpperCase()} is ${value}${unit}, above the allowed ${max}${unit}.`, {
        details: { metric, value, max },
      });
    }
  }
}
