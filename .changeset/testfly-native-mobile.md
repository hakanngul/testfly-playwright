---
"@testfly/playwright": minor
---

Native mobile groundwork for the experimental `@testfly/mobile` (Mobilewright):

- `testfly.mobile` options (`platform`, `bundleId`, `installApps`, `deviceId`/`deviceName`, `url`, `animations`, `timeouts`, `screenshotOnFailure`).
- YAML locators accept `ios:`, `android:` and `mobile:` blocks (previously ignored) and native-only entries; `selectPlatformDef` picks the definition for a platform. The web `locate()` rejects native-only entries with `TF_LOCATOR_INVALID`.
- `testfly.bdd.importTestFrom` points playwright-bdd at another `test` (e.g. `@testfly/mobile/bdd`).
- New error code `TF_MOBILE_LAUNCH_FAILED`.
