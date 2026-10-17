# @testfly/mobile

> **Experimental — not published until post-1.0.** This package ships **no mobile driver**.

Driver-agnostic helpers for mobile testing with TestFly:

- `DeviceDetector` — lists connected Android devices/emulators (`adb devices -l`) and iOS simulators (`xcrun simctl list devices --json`).
- `MobileClient` / `MobileScreen` / `MobileLocator` — a Playwright-like API (`getByText`, `getByTestId`, `tap`, `fill`, `toBeVisible`, …) that delegates every call to a driver object you provide.

## Honesty principle

Following ADR-001 D7, nothing here silently passes. Calling an action or assertion
without an attached driver — or on a driver that lacks the method — throws a
`TestFlyError` with code `TF_FEATURE_DISABLED`.

```ts
import { MobileClient, DeviceDetector } from '@testfly/mobile';

const devices = DeviceDetector.getActiveDevices();

const client = new MobileClient(myDriver, { platform: 'android', bundleId: 'com.example.app' });
await client.launchApp();
await client.screen.getByTestId('login').tap();
```

A driver is any object whose methods match the calls you use
(`tap(locator)`, `fill(locator, text)`, `isVisible(locator)`, `launchApp(bundleId, options)`, …).

## License

Apache-2.0
