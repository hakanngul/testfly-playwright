import { expect, test } from './support/test';

test.describe('ctx', () => {
  test('stores values, interpolates and requires', async ({ ctx }) => {
    ctx.set('user', { name: 'Ada' }).set('n', 3);
    expect(ctx.get('user.name')).toBe('Ada');
    expect(ctx.interpolate('Hello {{user.name}} x{{n}}')).toBe('Hello Ada x3');
    expect(() => ctx.require('nope')).toThrow(/TF_CONTEXT_KEY_MISSING/);
  });

  test('is isolated per test', async ({ ctx }) => {
    expect(ctx.has('user')).toBe(false);
    expect(ctx.has('n')).toBe(false);
  });

  test('auto-loads data/*.json next to the config and loads csv', async ({ ctx }) => {
    expect(ctx.get('users.admin.email')).toBe('ada@example.com');
    const rows = ctx.load<Array<{ sku: string; qty: string }>>('data/rows.csv', 'rows');
    expect(rows).toEqual([
      { sku: 'A-1', qty: '2' },
      { sku: 'B-2', qty: '5' },
    ]);
    expect(ctx.get('rows.1.sku')).toBe('B-2');
  });
});

test.describe('step', () => {
  test('callable step returns the body result and records events', async ({ step }) => {
    const value = await step('compute', async () => 21 * 2);
    expect(value).toBe(42);
    await step.info('info message', { a: 1 });
    await step.pass('checkpoint');
    await step.warn('careful');
    await step.fail('marker only');
    const events = step.events();
    expect(events.map((e) => [e.level, e.title])).toEqual([
      ['pass', 'compute'],
      ['info', 'info message'],
      ['pass', 'checkpoint'],
      ['warn', 'careful'],
      ['fail', 'marker only'],
    ]);
    expect(events[1]!.details).toEqual({ a: 1 });
    expect(events.every((e) => e.offsetMs >= 0)).toBe(true);
  });

  test('a failing step body is recorded as fail and rethrown', async ({ step }) => {
    await expect(
      step('explodes', async () => {
        throw new Error('kaboom');
      }),
    ).rejects.toThrow('kaboom');
    expect(step.events()).toMatchObject([{ level: 'fail', title: 'explodes', details: { error: 'kaboom' } }]);
  });

  test('step attach adds a normal attachment', async ({ step }, testInfo) => {
    await step.attach('note', 'hello');
    expect(testInfo.attachments.some((a) => a.name === 'note')).toBe(true);
  });
});

test('testfly option fixture exposes resolved options', async ({ testfly, baseURL }) => {
  expect(testfly.timeouts).toEqual({ poll: 2000, pollInterval: 50 });
  expect(testfly.api.retry.attempts).toBe(0);
  expect(testfly.locators.dir).toBe('locators');
  expect(testfly.db).toBeUndefined();
  expect(baseURL).toBeUndefined();
});

test('faker fixture exposes its seed for replay', async ({ faker }) => {
  expect(Number.isInteger(faker.seed)).toBe(true);
});

test('plain Playwright fixtures still work alongside TestFly ones', async ({ page }) => {
  await page.setContent('<h1>plain</h1>');
  await expect(page.locator('h1')).toHaveText('plain');
});
