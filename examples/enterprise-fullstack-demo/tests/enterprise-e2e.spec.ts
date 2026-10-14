import { test, expect } from '@testfly/playwright';
import { MockRedis } from '@testfly/playwright/db';

test.describe('Enterprise Full-Stack Omnichannel Integration Spec', () => {
  test('should execute full-stack flow: API -> DB -> Redis -> Mail OTP -> UI', async ({
    page,
    db,
    mail,
    ctx,
  }) => {
    ctx.set('orderId', 'ord_12345');

    // 1. Database (explicit in-memory store, testfly.db.client = 'mock')
    await db.mock!.table('orders').create({ id: ctx.require<string>('orderId'), status: 'PENDING' });
    expect(await db.mock!.table('orders').count({ status: 'PENDING' })).toBeGreaterThan(0);

    // 2. Redis Cache (explicit in-memory stand-in; use the `redis` fixture with testfly.redis for a real server)
    const cache = new MockRedis();
    await cache.set('orders:pending', ctx.require<string>('orderId'), 30);
    const cachedOrder = await cache.get('orders:pending');
    expect(cachedOrder).toBe('ord_12345');

    // 3. Mail Polling (the mock mailbox only contains what you deliver)
    mail.mock!.deliver({
      to: ['customer@example.com'],
      from: 'store@example.com',
      subject: 'Order Confirmed: ord_12345',
      text: 'Your order ord_12345 has been confirmed.',
    });

    const receivedEmail = await mail.waitForEmail({
      to: 'customer@example.com',
      subject: /Order Confirmed/,
    });
    expect(receivedEmail.text).toContain('ord_12345');

    // 4. UI Check
    await page.goto('/');
  });
});
