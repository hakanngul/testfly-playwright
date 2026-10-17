import { describe, expect, it } from 'vitest';
import { LocatorRegistry } from '@testfly/playwright/locators';
import { expect as mobileExpect } from '../src/expect';
import { toLaunchOptions } from '../src/fixtures';
import { buildMobileLocator } from '../src/locate';
import { loadMobilewright, loadMobilewrightCore, loadedMobilewright } from '../src/runtime';
import { createFakeDriver, FAKE_BUNDLE_ID, FAKE_DEVICE_ID } from './support/fakeDriver';

async function launch() {
  const mw = await loadMobilewright();
  const driver = createFakeDriver();
  const device = await mw.ios.launch({ driver, bundleId: FAKE_BUNDLE_ID, expectTimeout: 1_000, actionTimeout: 1_000 });
  return { mw, driver, device };
}

const registry = () =>
  new LocatorRegistry()
    .register('login.username', { label: 'Username', ios: 'username', android: { placeholder: 'Username' } })
    .register('login.signIn', { role: 'button', name: 'Sign in' })
    .register('login.webOnly', { css: '#sign-in' })
    .register('home.greeting', { mobile: { testid: 'greeting' } })
    .register('home.list', { ios: { type: 'Window' } })
    .register('home.orders', { ios: { text: 'Orders', within: 'home.list' } })
    .register('home.menu', { mobile: { testid: 'nope', fallbacks: [{ text: 'Settings' }] } })
    .register('loop.a', { mobile: { text: 'a', within: 'loop.b' } })
    .register('loop.b', { mobile: { text: 'b', within: 'loop.a' } });

describe('runtime', () => {
  it('loads mobilewright once and finds @mobilewright/core next to it', async () => {
    const mw = await loadMobilewright();
    expect(await loadMobilewright()).toBe(mw);
    expect(loadedMobilewright()).toBe(mw);
    expect(typeof mw.ios.launch).toBe('function');
    expect(typeof (await loadMobilewrightCore())?.setSoftFailureHandler).toBe('function');
  });
});

describe('toLaunchOptions', () => {
  it('maps testfly.mobile to Mobilewright launch options', () => {
    const driver = createFakeDriver();
    const opts = toLaunchOptions(
      {
        platform: 'android',
        bundleId: 'com.acme',
        autoAppLaunch: false,
        installApps: ['app.apk'],
        deviceName: 'Pixel.*',
        autoStart: true,
        animations: 'off',
        timeouts: { connect: 1, action: 2, expect: 3, appLaunch: 4, install: 5 },
        screenshotOnFailure: true,
      },
      driver,
    );
    expect(opts).toMatchObject({
      bundleId: 'com.acme',
      autoAppLaunch: false,
      installApps: ['app.apk'],
      deviceName: /Pixel.*/,
      animations: 'off',
      timeout: 1,
      actionTimeout: 2,
      expectTimeout: 3,
      appLaunchTimeout: 4,
      installTimeout: 5,
      driver,
    });
    expect('driver' in toLaunchOptions({ platform: 'ios', autoAppLaunch: true, autoStart: true, timeouts: {}, screenshotOnFailure: true })).toBe(false);
  });
});

describe('the fake driver behind the Mobilewright launcher', () => {
  it('picks the online device, connects, relaunches the app', async () => {
    const { driver, device } = await launch();
    expect(device.id).toBe(FAKE_DEVICE_ID);
    expect(driver.calls.slice(0, 4)).toEqual(['listDevices', `connect:${FAKE_DEVICE_ID}`, `terminate:${FAKE_BUNDLE_ID}`, `launch:${FAKE_BUNDLE_ID}`]);
    await device.close();
    expect(driver.calls).toContain('disconnect');
  });
});

describe('buildMobileLocator', () => {
  it('resolves platform blocks, shared defs, within chains and fallbacks', async () => {
    const { device } = await launch();
    const reg = registry();
    const at = (key: string, platform: 'ios' | 'android' = 'ios') => buildMobileLocator(device.screen, reg, key, platform);

    await at('login.username').fill('ada');
    await mobileExpect(at('login.username')).toHaveValue('ada');
    await mobileExpect(at('login.username', 'android')).toHaveValue('ada');
    await at('login.signIn').tap();
    await mobileExpect(at('home.greeting')).toHaveText('Hello, ada');
    await mobileExpect(at('home.orders')).toBeVisible();
    await mobileExpect(at('home.menu')).toHaveText('Settings');
    await device.close();
  });

  it('fails clearly for keys without a platform definition and for circular chains', async () => {
    const { device } = await launch();
    const reg = registry();
    expect(() => buildMobileLocator(device.screen, reg, 'login.webOnly', 'ios')).toThrow(/TF_LOCATOR_NOT_FOUND.*no ios definition/);
    expect(() => buildMobileLocator(device.screen, reg, 'home.list', 'android')).toThrow(/no android definition/);
    expect(() => buildMobileLocator(device.screen, reg, 'loop.a', 'ios')).toThrow(/TF_LOCATOR_INVALID.*Circular/);
    await device.close();
  });
});

describe('expect dispatch', () => {
  it('sends Mobilewright locators to the mobile matchers and everything else to Playwright', async () => {
    const { device } = await launch();
    const signIn = device.screen.getByRole('button', { name: 'Sign in' });
    await mobileExpect(signIn).toBeDisabled();
    await mobileExpect(signIn).not.toBeEnabled();
    await expect(mobileExpect(signIn).toBeEnabled({ timeout: 200 })).rejects.toThrow();
    mobileExpect(42).toBe(42);
    mobileExpect({ a: 1 }).toEqual({ a: 1 });
    expect(() => mobileExpect(1).toBe(2)).toThrow();
    await device.close();
  });
});
