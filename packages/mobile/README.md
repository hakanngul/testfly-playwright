# @testfly/mobile

> **Experimental — private, not published.** The API may change. See [ADR-002](../../docs/adr/ADR-002.md).

Native iOS and Android testing for TestFly, built on [Mobilewright](https://mobilewright.dev).
Mobilewright drives simulators, emulators and real devices through [mobilecli](https://github.com/mobile-next/mobilecli), without Appium.
`mobilewright` is an optional peer dependency. It installs mobilecli.

```bash
npm i -D @testfly/playwright @testfly/mobile mobilewright
```

mobilecli needs Xcode for iOS simulators (macOS) and the Android SDK (`adb`) for Android. Run `npx mobilewright doctor` to check the setup.

## Configure

```ts
// playwright.config.ts
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    locators: { dir: 'locators' },
    mobile: {
      platform: 'ios',                  // 'ios' | 'android'
      bundleId: 'com.example.app',      // iOS bundle id / Android package, relaunched before each test
      // installApps: './build/App.app', // installed before the test
      // deviceName: 'iPhone 16',        // regex; or deviceId: '<udid/serial>'
      // animations: 'off',
      // timeouts: { connect, action, expect, appLaunch, install },
      // screenshotOnFailure: true,
    },
  },
});
```

Use one Playwright project per platform when the same tests run on both:
`projects: [{ name: 'ios', use: { testfly: { mobile: { platform: 'ios', … } } } }, { name: 'android', … }]`.

## Write a test

```ts
import { test, expect } from '@testfly/mobile';

test('sign in', async ({ mobileScreen, mobileLocate }) => {
  await mobileLocate('login.username').fill('ada');
  await mobileLocate('login.password').fill('secret');
  await mobileScreen.getByRole('button', { name: 'Sign in' }).tap();
  await expect(mobileLocate('home.greeting')).toHaveText('Hello, ada');
});
```

| Fixture | |
| --- | --- |
| `device` | Mobilewright `Device` for this test (launched from `testfly.mobile`, closed afterwards): `launchApp`, `terminateApp`, `openUrl`, `setOrientation`, … |
| `mobileScreen` | `device.screen`: `getByRole`, `getByText`, `getByTestId`, `getByLabel`, `getByPlaceholder`, `getByType`, `screenshot`. Playwright already has a `screen` option (viewport size), so the name is different. |
| `mobileLocate(key)` | YAML locator key → Mobilewright locator for the configured platform. |
| `mobileDriver` | Option: a custom Mobilewright driver (`test.use({ mobileDriver })`), e.g. a fake or a device cloud. |

Every TestFly fixture (`ctx`, `api`, `faker`, `locators`, …) is available as well.

`expect` sends Mobilewright locators to the mobile matchers (`toBeVisible`, `toBeHidden`, `toBeEnabled`, `toBeDisabled`, `toBeSelected`, `toBeFocused`, `toBeChecked`, `toHaveText`, `toContainText`, `toHaveCount`, `toBeEmpty`, `toHaveValue`, `.not`). Everything else goes to the TestFly/Playwright `expect`. `expect.soft` records the failure and the test continues.

Actions appear as steps in the Playwright report. Each test gets a `mobile-device` annotation. A failed test gets a `mobile-screenshot` attachment.

## YAML locators

One catalog serves web and native. Add `ios:`, `android:` or `mobile:` (both platforms) blocks:

```yaml
username:
  css: "#username"          # web
  ios: username             # a plain string is a test id (accessibility identifier)
  android:
    placeholder: Username
password:
  mobile: { label: Password }
signIn:                      # no platform block: the shared definition is used on devices too
  role: button
  name: Sign in
```

A block takes one of `role` (+ `name`, `exact`), `label`, `text`, `testid`, `placeholder`, `type` (native element type), plus `nth`, `first`, `last`, `has_text`, `within`, `fallbacks`. Lookup order: platform block → `mobile:` → shared definition, if it only uses fields that exist on mobile. A key with no usable definition fails with `TF_LOCATOR_NOT_FOUND`.

## BDD

```ts
// playwright.config.ts → testfly.bdd
bdd: { features: 'features/*.feature', steps: 'steps/*.ts', importTestFrom: '@testfly/mobile/bdd' },
```

```ts
// steps/login.steps.ts
import { Given, When, Then, expect } from '@testfly/mobile/bdd';

When('I sign in as {string}', async ({ mobileLocate }, user: string) => {
  await mobileLocate('login.username').fill(user);
  await mobileLocate('login.signIn').tap();
});
```

## Errors

| Code | When |
| --- | --- |
| `TF_OPTIONAL_DEPENDENCY_MISSING` | `mobilewright` is not installed. |
| `TF_CONFIG_MISSING` | A mobile fixture is used without `testfly.mobile`. |
| `TF_MOBILE_LAUNCH_FAILED` | No device found, connection failed, or the app could not be installed or launched. The original error is the `cause`. |
| `TF_LOCATOR_NOT_FOUND` / `TF_LOCATOR_INVALID` | A YAML key has no definition for the platform / a circular `within` chain. |

## pnpm and Playwright versions

`mobilewright` depends on its own `playwright` version. With pnpm, that copy can be hoisted and picked up by playwright-bdd. Keep one Playwright version, the one of your `@playwright/test`:

```json
{ "pnpm": { "overrides": { "playwright": "1.64.0", "playwright-core": "1.64.0" } } }
```

## Other helpers

`DeviceDetector` lists Android devices/emulators (`adb devices -l`) and iOS simulators (`xcrun simctl`).

## Development

The tests need no device: they run Mobilewright against an in-memory fake driver (`test/support/fakeDriver.ts`).

```bash
pnpm test        # vitest (unit + runs the e2e suite)
pnpm test:e2e    # Playwright suite (ios, android, expected errors)
pnpm test:bdd    # playwright-bdd suite (run `pnpm build` first)
```

## License

Apache-2.0. Mobilewright is Apache-2.0. mobilecli has its own license and is installed by `mobilewright`; it is not bundled here.
