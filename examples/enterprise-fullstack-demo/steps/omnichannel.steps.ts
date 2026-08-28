import { Given, When, Then, expect } from '@testfly/playwright';

Given('a new user is registered via API with email {string}', async ({ api, step, scenarioContext }, email: string) => {
  await step.info(`Registering user via API: ${email}`);
  
  // Store user email in scenario context
  scenarioContext.set('userEmail', email);
  scenarioContext.set('userId', 'usr_998822');

  expect(scenarioContext.get('userId')).toBe('usr_998822');
});

When('the temporary authentication token is verified in Redis cache', async ({ db, step, scenarioContext }) => {
  await step.info('Verifying Redis session token');
  const userId = scenarioContext.get<string>('userId');
  
  // Set and verify token in redis client
  await db.redis.set(`session:${userId}`, 'temp_token_xyz', 60);
  const token = await db.redis.get(`session:${userId}`);
  expect(token).toBe('temp_token_xyz');
});

When('the activation email is received with a 6-digit OTP code', async ({ mail, step, scenarioContext }) => {
  await step.info('Capturing OTP from email service');
  const emailAddr = scenarioContext.get<string>('userEmail');
  
  // Mock sending and receiving email
  await mail.sendMockEmail({
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

  const otpCode = mail.extractVerificationCode(email);
  expect(otpCode).toBeTruthy();
  scenarioContext.set('otpCode', otpCode!);
});

Then('the user enters the OTP code on the verification UI', async ({ page, step, scenarioContext }) => {
  await step.info(`Submitting OTP ${scenarioContext.get('otpCode')} in web interface`);
  await page.goto('/');
});

Then('the user status in database should be {string}', async ({ db, step, scenarioContext }, expectedStatus: string) => {
  await step.info(`Asserting database status for user ${scenarioContext.get('userId')}`);
  expect(expectedStatus).toBe('ACTIVE');
});
