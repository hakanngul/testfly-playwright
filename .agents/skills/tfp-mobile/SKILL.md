---
name: tfp-mobile
description: Work on @testfly/mobile, the experimental native iOS/Android layer of TestFly Playwright built on Mobilewright (mobilecli underneath) - fixtures, YAML platform locators, expect dispatch, fake-driver tests. Use for any change in packages/mobile or the mobile parts of packages/playwright.
---

# @testfly/mobile

Design: `docs/adr/ADR-002.md`. The package is private and experimental.

## Shape

- Built on the `mobilewright` runtime only (an optional peer, ESM-only). Never on `@mobilewright/test`, which pins its own `@playwright/test`.
- `src/runtime.ts`: loads mobilewright with a native `import()` and caches it on `globalThis` (the `.` and `/bdd` bundles share it). It also resolves `@mobilewright/core` next to it for `setSoftFailureHandler`.
- `src/fixtures.ts`: `mobileTest` with `device` (launched from `testfly.mobile`), `mobileScreen` (Playwright already owns `screen`), `mobileLocate(key)` and the `mobileDriver` option. It also sets the step reporting and the failure screenshot (`mobile-screenshot`).
- `src/locate.ts`: YAML key → Mobilewright locator. Lookup order: platform block → `mobile:` → shared definition. Web-only fields (`css`, `xpath`, `alt`, `title`) are ignored.
- `src/expect.ts`: one `expect`. Mobilewright locators go to Mobilewright matchers, everything else to TestFly/Playwright.
- Config: `testfly.mobile` in `packages/playwright/src/core/config/schema.ts`. YAML blocks: `selectPlatformDef` in `packages/playwright/src/locators/schema.ts`.

## Rules

- Errors: `TF_CONFIG_MISSING`, `TF_MOBILE_LAUNCH_FAILED` (with `cause`), `TF_LOCATOR_NOT_FOUND`, `TF_OPTIONAL_DEPENDENCY_MISSING`.
- tsup builds without splitting (see `tfp-change`).
- Tests never need a device: `test/support/fakeDriver.ts` implements `MobilewrightDriver` with a small login/home app. Use it in vitest, `e2e/` (projects ios, android, errors, unconfigured) and `e2e-bdd/`.
- Real-device verification is not available in the cloud container (no KVM). Never claim it.
