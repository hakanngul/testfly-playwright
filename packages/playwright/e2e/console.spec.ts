import { expect, test } from './support/test';

const BROKEN = '<html><body><script>console.error("boom from console"); setTimeout(() => { throw new Error("uncaught kaboom"); }, 0);</script></body></html>';

test.describe('consoleErrors (report mode)', () => {
  test('collects uncaught exceptions and console.error without failing the test', async ({ page, consoleErrors }) => {
    await page.setContent(BROKEN);
    await expect.poll(() => consoleErrors.list().length).toBe(2);
    const types = consoleErrors.list().map((e) => e.type).sort();
    expect(types).toEqual(['console', 'pageerror']);
    expect(consoleErrors.list().find((e) => e.type === 'pageerror')?.message).toContain('uncaught kaboom');
  });

  test('clear() forgets expected errors and expectNone() then passes', async ({ page, consoleErrors }) => {
    await page.setContent(BROKEN);
    await expect.poll(() => consoleErrors.list().length).toBe(2);
    expect(() => consoleErrors.expectNone()).toThrow(/TF_CONSOLE_ERRORS/);
    consoleErrors.clear();
    consoleErrors.expectNone();
  });

  test('errors from popups of the same context are collected too', async ({ context, consoleErrors }) => {
    const popup = await context.newPage();
    await popup.setContent('<script>console.error("from popup")</script>');
    await expect.poll(() => consoleErrors.list().map((e) => e.message)).toContain('from popup');
  });

  test('a clean page records nothing', async ({ page, consoleErrors }) => {
    await page.setContent('<p>fine</p>');
    expect(consoleErrors.list()).toEqual([]);
  });
});
