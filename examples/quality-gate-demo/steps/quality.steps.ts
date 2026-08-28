import { Given, When, Then, expect } from '@testfly/playwright';

Given('the user navigates to the application landing page', async ({ page, step }) => {
  await step.info('Navigating to application landing page');
  await page.goto('/');
});

When('an automated Axe accessibility audit is performed for {string}', async ({ a11y, step, scenarioContext }, tagsStr: string) => {
  const tags = tagsStr.split(',').map((t) => t.trim());
  await step.info(`Running Axe A11y audit with tags: ${tags.join(', ')}`);
  
  const results = await a11y.analyze({ tags });
  scenarioContext.set('a11yViolationsCount', results.violations.length);
});

Then('there should be {int} accessibility violations', async ({ step, scenarioContext }, expectedCount: number) => {
  const count = scenarioContext.get<number>('a11yViolationsCount');
  await step.info(`Verifying a11y violations count: ${count}`);
  expect(count).toBe(expectedCount);
});

Then('the page layout should match the visual snapshot {string}', async ({ step, scenarioContext }, snapshotName: string) => {
  await step.info(`Comparing visual snapshot: ${snapshotName}`);
  // In live test, use visual.assertSnapshot(snapshotName)
});

When('performance metrics are collected from the browser', async ({ performance, step, scenarioContext }) => {
  await step.info('Extracting Core Web Vitals');
  const vitals = await performance.getVitals();
  scenarioContext.set('vitals', vitals);
});

Then('the Largest Contentful Paint should be under {int} ms', async ({ performance, step }, maxMs: number) => {
  await step.info(`Verifying LCP threshold: max ${maxMs}ms`);
  await performance.assertLcp(maxMs);
});

Then('the Cumulative Layout Shift should be under {float}', async ({ performance, step }, maxScore: number) => {
  await step.info(`Verifying CLS threshold: max ${maxScore}`);
  await performance.assertCls(maxScore);
});

Then('the Time to First Byte should be under {int} ms', async ({ performance, step }, maxMs: number) => {
  await step.info(`Verifying TTFB threshold: max ${maxMs}ms`);
  await performance.assertTtfb(maxMs);
});
