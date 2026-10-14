import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('the user navigates to the application landing page', async ({ page, step }) => {
  await step.info('Navigating to application landing page');
  await page.goto('/');
});

When('an automated Axe accessibility audit is performed for {string}', async ({ a11y, step, ctx }, tagsStr: string) => {
  const tags = tagsStr.split(',').map((t) => t.trim());
  await step.info(`Running Axe A11y audit with tags: ${tags.join(', ')}`);

  const results = await a11y.analyze({ tags });
  await step.info(`Violations: ${results.violations.map((v) => `${v.id} (${v.impact})`).join(', ') || 'none'}`);
  ctx.set('a11yViolationsCount', results.violations.length);
});

Then('there should be at most {int} accessibility violations', async ({ step, ctx }, budget: number) => {
  const count = ctx.require<number>('a11yViolationsCount');
  await step.info(`Verifying a11y violations count: ${count} (budget: ${budget})`);
  expect(count).toBeLessThanOrEqual(budget);
});

Then('the page layout should match the visual snapshot {string}', async ({ visual, step }, snapshotName: string) => {
  await step.info(`Comparing visual snapshot: ${snapshotName}`);
  // The first run records the baseline (run once with `--update-snapshots`).
  await visual.assertSnapshot(snapshotName);
});

When('performance metrics are collected from the browser', async ({ perf, step, ctx }) => {
  await step.info('Extracting Core Web Vitals');
  const vitals = await perf.getVitals();
  ctx.set('vitals', vitals);
});

Then('the Largest Contentful Paint should be under {int} ms', async ({ perf, step }, maxMs: number) => {
  await step.info(`Verifying LCP threshold: max ${maxMs}ms`);
  await perf.assertLcp(maxMs);
});

Then('the Cumulative Layout Shift should be under {float}', async ({ perf, step }, maxScore: number) => {
  await step.info(`Verifying CLS threshold: max ${maxScore}`);
  await perf.assertCls(maxScore);
});

Then('the Time to First Byte should be under {int} ms', async ({ perf, step }, maxMs: number) => {
  await step.info(`Verifying TTFB threshold: max ${maxMs}ms`);
  await perf.assertTtfb(maxMs);
});
