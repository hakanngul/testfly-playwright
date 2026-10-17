import { test as base } from '@playwright/test';
import { test as testflyTest, TestFlyError, type MobileOptions, type TestFlyOptions } from '@testfly/playwright';
import type { Device, LaunchOptions, MobilewrightDriver, Screen } from 'mobilewright';
import { buildMobileLocator, type MobileLocateFn } from './locate';
import { loadMobilewright, loadMobilewrightCore } from './runtime';

/** Test-scoped fixtures of {@link mobileTest}. @public */
export interface MobileFixtures {
  /** The Mobilewright device of this test (launched from `testfly.mobile`, closed afterwards). */
  device: Device;
  /**
   * `device.screen`: `getByRole`, `getByText`, `getByTestId`, … (Mobilewright's `screen`; renamed because
   * Playwright already has a built-in `screen` option, the viewport size of web contexts).
   */
  mobileScreen: Screen;
  /** Resolve a YAML locator key to a Mobilewright locator for `testfly.mobile.platform`. */
  mobileLocate: MobileLocateFn;
  /**
   * Custom Mobilewright driver handed to the launcher (`test.use({ mobileDriver })`). Default: none,
   * so Mobilewright talks to mobilecli. Useful for fakes and device clouds.
   */
  mobileDriver: MobilewrightDriver | undefined;
}

function requireMobile(testfly: TestFlyOptions): MobileOptions {
  if (!testfly.mobile) {
    throw new TestFlyError('TF_CONFIG_MISSING', 'A mobile fixture was used but testfly.mobile is not configured.', {
      hint: "Add testfly: { mobile: { platform: 'ios', bundleId: 'com.example.app' } } to playwright.config.ts.",
    });
  }
  return testfly.mobile;
}

/** `testfly.mobile` → Mobilewright `LaunchOptions`. @internal */
export function toLaunchOptions(mobile: MobileOptions, driver?: MobilewrightDriver): LaunchOptions {
  const t = mobile.timeouts;
  return {
    bundleId: mobile.bundleId,
    autoAppLaunch: mobile.autoAppLaunch,
    installApps: mobile.installApps,
    deviceId: mobile.deviceId,
    deviceName: mobile.deviceName !== undefined ? new RegExp(mobile.deviceName) : undefined,
    url: mobile.url,
    autoStart: mobile.autoStart,
    animations: mobile.animations,
    timeout: t.connect,
    actionTimeout: t.action,
    expectTimeout: t.expect,
    appLaunchTimeout: t.appLaunch,
    installTimeout: t.install,
    ...(driver ? { driver } : {}),
  };
}

/**
 * Native mobile fixture set built on Mobilewright (which drives devices through mobilecli):
 * `device`, `mobileScreen`, `mobileLocate`, plus every TestFly fixture. Mobilewright is an optional peer
 * (`pnpm add -D mobilewright`).
 *
 * @public
 */
export const mobileTest = testflyTest.extend<MobileFixtures>({
  mobileDriver: [undefined, { option: true }],

  device: [
    async ({ testfly, mobileDriver }, use, testInfo) => {
      const mobile = requireMobile(testfly);
      const mw = await loadMobilewright();
      const core = await loadMobilewrightCore();
      // Mobilewright's default soft handler throws; record the failure on the Playwright test instead.
      core?.setSoftFailureHandler((error) => {
        const info = base.info() as unknown as { _failWithError?: (e: Error) => void };
        if (typeof info._failWithError !== 'function') throw error;
        info._failWithError(error);
      });

      let device: Device;
      try {
        device = await mw[mobile.platform].launch(toLaunchOptions(mobile, mobileDriver));
      } catch (error) {
        if (error instanceof TestFlyError) throw error;
        throw new TestFlyError('TF_MOBILE_LAUNCH_FAILED', `Could not launch the ${mobile.platform} device: ${(error as Error)?.message ?? String(error)}`, {
          hint: 'Check that mobilecli is installed and a simulator/emulator/device is available (`mobilecli devices`).',
          details: { platform: mobile.platform, bundleId: mobile.bundleId, deviceId: mobile.deviceId },
          cause: error,
        });
      }
      testInfo.annotations.push({ type: 'mobile-device', description: `${mobile.platform} ${device.id}${mobile.bundleId ? ` (${mobile.bundleId})` : ''}` });
      device.setStepFn((title, fn, location) => base.step(title, fn, location ? { location } : undefined));

      try {
        await use(device);
      } finally {
        try {
          if (mobile.screenshotOnFailure && (testInfo.status === 'failed' || testInfo.status === 'timedOut')) {
            const shot = await device.screen.screenshot().catch(() => undefined);
            if (shot) await testInfo.attach('mobile-screenshot', { body: shot, contentType: 'image/png' });
          }
        } finally {
          await device.close();
        }
      }
    },
    { timeout: 0 },
  ],

  mobileScreen: async ({ device }, use) => {
    await use(device.screen);
  },

  mobileLocate: async ({ mobileScreen, locators, testfly }, use) => {
    const platform = requireMobile(testfly).platform;
    await use((key) => buildMobileLocator(mobileScreen, locators, key, platform));
  },
});
