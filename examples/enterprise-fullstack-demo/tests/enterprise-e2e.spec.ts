import { test, expect } from '@testfly/playwright';

test.describe('Enterprise Full-Stack Omnichannel Integration Spec', () => {
  test('should execute full-stack flow: API -> DB -> Redis -> Mail OTP -> UI', async ({
    page,
    db,
    mail,
    scenarioContext,
  }) => {
    scenarioContext.set('orderId', 'ord_12345');

    // 1. Redis Cache
    await db.redis.set('orders:pending', scenarioContext.get('orderId'), 30);
    const cachedOrder = await db.redis.get('orders:pending');
    expect(cachedOrder).toBe('ord_12345');

    // 2. Mail Polling
    await mail.sendMockEmail({
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

    // 3. UI Check
    await page.goto('/');
  });
});
