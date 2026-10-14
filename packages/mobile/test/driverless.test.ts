import { describe, expect, it, vi } from 'vitest';
import { isTestFlyError } from '@testfly/playwright';
import { MobileClient, MobileLocator, MobileScreen } from '../src';

async function expectFeatureDisabled(action: () => Promise<unknown>): Promise<void> {
  const err = await action().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(isTestFlyError(err, 'TF_FEATURE_DISABLED'), `expected TF_FEATURE_DISABLED, got ${String(err)}`).toBe(true);
}

describe('driverless mobile API (ADR-001 D7: never silently pass)', () => {
  const screen = new MobileScreen();
  const locator = screen.getByTestId('login');

  it.each([
    ['tap', () => locator.tap()],
    ['doubleTap', () => locator.doubleTap()],
    ['longPress', () => locator.longPress(500)],
    ['fill', () => locator.fill('x')],
    ['clear', () => locator.clear()],
    ['swipe', () => locator.swipe('up')],
    ['toBeVisible', () => locator.toBeVisible()],
    ['toBeEnabled', () => locator.toBeEnabled()],
    ['nth().tap', () => locator.nth(2).tap()],
  ])('MobileLocator.%s throws TF_FEATURE_DISABLED', async (_name, action) => {
    await expectFeatureDisabled(action);
  });

  it.each([
    ['swipe', () => screen.swipe('down')],
    ['pressButton', () => screen.pressButton('BACK')],
    ['hideKeyboard', () => screen.hideKeyboard()],
    ['takeScreenshot', () => screen.takeScreenshot('s')],
  ])('MobileScreen.%s throws TF_FEATURE_DISABLED', async (_name, action) => {
    await expectFeatureDisabled(action);
  });

  it.each([
    ['launchApp', (c: MobileClient) => c.launchApp()],
    ['terminateApp', (c: MobileClient) => c.terminateApp()],
    ['installApp', (c: MobileClient) => c.installApp('/tmp/app.apk')],
    ['uninstallApp', (c: MobileClient) => c.uninstallApp()],
    ['deepLink', (c: MobileClient) => c.deepLink('app://home')],
    ['setOrientation', (c: MobileClient) => c.setOrientation('LANDSCAPE')],
  ])('MobileClient.%s throws TF_FEATURE_DISABLED', async (_name, action) => {
    await expectFeatureDisabled(() => action(new MobileClient()));
  });

  it('throws when the attached driver lacks the requested method', async () => {
    const loc = new MobileLocator('ok', 'text', {}, { tap: vi.fn() });
    await expectFeatureDisabled(() => loc.toBeVisible());
  });
});

describe('with a driver attached', () => {
  it('delegates actions and assertions to the driver', async () => {
    const driver = {
      tap: vi.fn(async () => undefined),
      isVisible: vi.fn(async () => false),
      launchApp: vi.fn(async () => undefined),
    };
    const client = new MobileClient(driver, { platform: 'ios', bundleId: 'com.example.app' });
    const loc = client.screen.getByText('Login');

    await loc.tap();
    expect(driver.tap).toHaveBeenCalledWith(loc);
    await expect(loc.toBeVisible()).resolves.toBe(false);
    await client.launchApp();
    expect(driver.launchApp).toHaveBeenCalledWith('com.example.app', {});
    expect(client.platform).toBe('ios');
    expect(client.deviceName).toBe('AutoDetected');
  });
});
