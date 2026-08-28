import { test, expect } from '@testfly/playwright';

test.describe('Mobilewright Native Mobile Spec Tests', () => {
  test('should launch mobile app and perform touch gestures', async ({ mobile, screen, locate }) => {
    await mobile.launchApp();

    const title = locate('mobile_app.welcome_title');
    expect(title).toBeDefined();

    const getStartedBtn = screen.getByText('Get Started');
    await getStartedBtn.tap();
  });
});
