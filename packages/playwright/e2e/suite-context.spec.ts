import { expect, test } from './support/test';

// Serial so both tests run in the same worker: suiteCtx is shared per worker, ctx per test.
test.describe.configure({ mode: 'serial' });

test.describe('suiteCtx', () => {
  test('first test stores a value', async ({ suiteCtx, ctx }) => {
    suiteCtx.set('orderId', 'ORD-42');
    ctx.set('local', 'only-here');
  });

  test('second test in the same worker reads it; ctx is fresh', async ({ suiteCtx, ctx }) => {
    expect(suiteCtx.require<string>('orderId')).toBe('ORD-42');
    expect(ctx.get('local')).toBeUndefined();
  });
});
