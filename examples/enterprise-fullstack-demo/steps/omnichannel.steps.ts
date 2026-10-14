import { Given, When, Then, expect } from '@testfly/playwright/bdd';
import { MockRedis } from '@testfly/playwright/db';

// Explicit in-memory Redis stand-in. With a real Redis, configure testfly.redis and use the `redis` fixture instead.
const cache = new MockRedis();

Given('a new user is registered via API with email {string}', async ({ db, step, ctx }, email: string) => {
  await step.info(`Registering user via API: ${email}`);

  // The demo has no backend: persist the user in the explicit in-memory store (testfly.db.client = 'mock').
  const user = await db.mock!.table('users').create({ email, status: 'PENDING' });

  // Store user data in the per-scenario context
  ctx.set('userEmail', email);
  ctx.set('userId', user.id);

  expect(ctx.get('userId')).toBeDefined();
});

When('the temporary authentication token is verified in Redis cache', async ({ step, ctx }) => {
  await step.info('Verifying Redis session token');
  const userId = ctx.require<number>('userId');

  await cache.set(`session:${userId}`, 'temp_token_xyz', 60);
  const token = await cache.get(`session:${userId}`);
  expect(token).toBe('temp_token_xyz');
});

When('the activation email is received with a 6-digit OTP code', async ({ mail, step, ctx }) => {
  await step.info('Capturing OTP from email service');
  const emailAddr = ctx.require<string>('userEmail');

  // Simulate the backend sending the mail (only possible with the explicit mock mailbox).
  mail.mock!.deliver({
    to: [emailAddr],
    from: 'no-reply@testfly.dev',
    subject: 'Your Verification Code',
    text: 'Welcome! Your 6-digit verification code is: 849201. It will expire in 10 minutes.',
  });

  const email = await mail.waitForEmail({
    to: emailAddr,
    subject: /Verification Code/,
    timeout: 3000,
  });

  const otpCode = mail.extractCode(email, { length: 6 });
  expect(otpCode).toBeTruthy();
  ctx.set('otpCode', otpCode!);
});

Then('the user enters the OTP code on the verification UI', async ({ page, db, step, ctx }) => {
  await step.info(`Submitting OTP ${ctx.get('otpCode')} in web interface`);
  await page.goto('/');

  // A real backend would activate the account after a valid OTP.
  await db.mock!.table('users').update(ctx.require<number>('userId'), { status: 'ACTIVE' });
});

Then('the user status in database should be {string}', async ({ db, step, ctx }, expectedStatus: string) => {
  const userId = ctx.require<number>('userId');
  await step.info(`Asserting database status for user ${userId}`);
  const user = await db.mock!.table('users').findById(userId);
  expect(user?.status).toBe(expectedStatus);
});
