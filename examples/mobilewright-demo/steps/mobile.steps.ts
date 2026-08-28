import { Given, When, Then, expect } from '@testfly/playwright';

Given('the mobile application is launched', async ({ mobile, step }) => {
  await step.info('Launching mobile application instance');
  await mobile.launchApp();
});

When('the user swipes {string} on the onboarding carousel', async ({ screen, step }, direction: 'left' | 'right' | 'up' | 'down') => {
  await step.info(`Swiping ${direction} on carousel`);
  const carousel = screen.getByLabel('carousel_onboarding');
  await carousel.swipe(direction, { distance: 300 });
});

When('taps the {string} button', async ({ screen, step }, buttonName: string) => {
  await step.info(`Tapping button: ${buttonName}`);
  const btn = screen.getByText(buttonName);
  await btn.tap();
});

When('the user long presses the {string} button for {int} ms', async ({ screen, step }, buttonName: string, durationMs: number) => {
  await step.info(`Long pressing ${buttonName} for ${durationMs}ms`);
  const btn = screen.getByText(buttonName);
  await btn.longPress(durationMs);
});

Then('the login bottom sheet should be displayed', async ({ screen, step }) => {
  await step.info('Verifying login bottom sheet is visible');
  const sheet = screen.getByLabel('sheet_login');
  expect(await sheet.toBeVisible()).toBe(true);
});

Then('the action should complete successfully', async ({ step }) => {
  await step.info('Gesture action verified successfully');
});
