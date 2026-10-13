import { describe, expect, it } from 'vitest';
import type { Page } from '@playwright/test';
import { VisualClient } from '../../src/quality/visual';

// `toHaveScreenshot` needs a running Playwright test; the real comparison (baseline, diff, mask,
// element snapshot) is exercised in e2e/quality.spec.ts. Here we only check the argument plumbing.
describe('VisualClient', () => {
  it('exposes assertSnapshot and assertElementSnapshot', () => {
    const visual = new VisualClient({ locator: () => ({}) } as unknown as Page);
    expect(typeof visual.assertSnapshot).toBe('function');
    expect(typeof visual.assertElementSnapshot).toBe('function');
  });

  it('outside a Playwright test the underlying expect fails loudly instead of passing silently', async () => {
    const visual = new VisualClient({ locator: () => ({}) } as unknown as Page);
    await expect(visual.assertSnapshot('home')).rejects.toThrow();
  });
});
