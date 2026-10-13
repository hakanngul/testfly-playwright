import { A11yClient } from '../quality/a11y';
import { VisualClient } from '../quality/visual';
import { PerformanceClient } from '../quality/performance';
import { FormClient } from '../quality/form';
import { coreTest } from './core';

/** Fixtures of {@link qualityTest}. @public */
export interface QualityFixtures {
  /** axe-core accessibility audits. */
  a11y: A11yClient;
  /** Screenshot comparison helpers. */
  visual: VisualClient;
  /** Real Web Vitals (TTFB, FCP, LCP, CLS) with assertions. */
  perf: PerformanceClient;
  /** Fill forms by label, placeholder, name, id or test id. */
  form: FormClient;
}

/**
 * Quality fixture set (`a11y`, `visual`, `perf`, `form`).
 * @public
 */
export const qualityTest = coreTest.extend<QualityFixtures>({
  a11y: async ({ page }, use, testInfo) => {
    await use(new A11yClient(page, testInfo));
  },
  visual: async ({ page }, use) => {
    await use(new VisualClient(page));
  },
  perf: async ({ page }, use) => {
    await use(new PerformanceClient(page));
  },
  form: async ({ page }, use) => {
    await use(new FormClient(page));
  },
});
