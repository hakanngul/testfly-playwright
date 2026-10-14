import { test, expect } from '@testfly/playwright';
import { launchApp } from '../support/app';

test.describe('Mobile Web (Device Emulation) Spec Tests', () => {
  test('should launch the mobile app and perform touch gestures', async ({ page, locate }) => {
    await launchApp(page);

    await expect(locate('mobile_app.welcome_title')).toBeVisible();

    await locate('mobile_app.get_started_btn').tap();
    await expect(locate('mobile_app.login_sheet')).toBeVisible();
  });
});
