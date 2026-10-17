import { Given, When, Then, expect } from '@testfly/playwright/bdd';
import { launchApp } from '../support/app';

Given('the mobile application is launched', async ({ page, locate, step }) => {
  await step.info('Launching mobile application instance (mobile device emulation)');
  await launchApp(page);
  await expect(locate('mobile_app.welcome_title')).toBeVisible();
});

When('the user swipes {string} on the onboarding carousel', async ({ locate, step }, direction: 'left' | 'right' | 'up' | 'down') => {
  await step.info(`Swiping ${direction} on carousel`);
  const carousel = locate('mobile_app.onboarding_carousel');
  const offsets = { left: [300, 0], right: [-300, 0], up: [0, 300], down: [0, -300] } as const;
  const [dx, dy] = offsets[direction];
  // Touch swipes are not synthesized by Playwright; scroll the carousel like a swipe would.
  await carousel.evaluate((el, [x, y]) => el.scrollBy({ left: x, top: y }), [dx, dy] as const);
  if (direction === 'left') await expect.poll(() => carousel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

When('taps the {string} button', async ({ page, step }, buttonName: string) => {
  await step.info(`Tapping button: ${buttonName}`);
  await page.getByRole('button', { name: buttonName }).tap();
});

When('the user long presses the {string} button for {int} ms', async ({ page, step }, buttonName: string, durationMs: number) => {
  await step.info(`Long pressing ${buttonName} for ${durationMs}ms`);
  const box = await page.getByRole('button', { name: buttonName }).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
});

Then('the login bottom sheet should be displayed', async ({ locate, step }) => {
  await step.info('Verifying login bottom sheet is visible');
  await expect(locate('mobile_app.login_sheet')).toBeVisible();
});

Then('the action should complete successfully', async ({ locate, step }) => {
  await step.info('Verifying the long press was recognized');
  await expect(locate('mobile_app.gesture_status')).toHaveText('long-press');
});
