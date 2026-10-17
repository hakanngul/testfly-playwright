import { expect, test } from './support/test';

// Runs in the "console-fail" project: consoleErrors.mode = 'fail', ignore = ['^ignored'].

test('fail mode fails a passing test that logged errors', async ({ page }) => {
  // Expected to FAIL with TF_CONSOLE_ERRORS (checked by test/fixtures/e2e.test.ts).
  test.fail();
  await page.setContent('<script>setTimeout(() => { throw new Error("uncaught kaboom"); }, 0)</script>');
  await page.waitForTimeout(200);
});

test('ignored messages do not fail the test', async ({ page, consoleErrors }) => {
  await page.setContent('<script>console.error("ignored: known third-party noise")</script>');
  await page.waitForTimeout(200);
  expect(consoleErrors.list()).toEqual([]);
});

test('fail mode keeps a clean test green', async ({ page }) => {
  await page.setContent('<p>fine</p>');
});
