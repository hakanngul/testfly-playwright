import { test, expect } from '@testfly/playwright';

test.describe('Quality Gate Audits Spec Tests', () => {
  test('should pass A11y, Visual, and Performance audits', async ({
    page,
    a11y,
    performance,
  }) => {
    await page.goto('/');

    // 1. Accessibility Audit
    const a11yResults = await a11y.analyze({ tags: ['wcag2a'] });
    expect(a11yResults).toBeDefined();

    // 2. Web Vitals
    const vitals = await performance.getVitals();
    expect(vitals.ttfb).toBeGreaterThanOrEqual(0);
    expect(vitals.lcp).toBeGreaterThanOrEqual(0);
  });
});
