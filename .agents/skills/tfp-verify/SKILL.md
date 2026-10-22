---
name: tfp-verify
description: Choose and run the TestFly Playwright verification gates (pnpm check, per-package vitest, Playwright e2e, playwright-bdd suites, package lint) and report results honestly. Use before handing off any change in this repository.
---

# TestFly Playwright verification

Run from the repository root. Start narrow, finish with `pnpm check`.

| Gate | Command |
|---|---|
| One package, unit | `pnpm --filter <pkg> test` (vitest) |
| One package, types | `pnpm --filter <pkg> typecheck` |
| Everything | `pnpm check` = build, typecheck, test, lint:package (publint + attw) |
| Fixture e2e | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm --filter @testfly/playwright test:e2e` |
| BDD suite | `pnpm --filter <pkg> build` first, then `PW_CHROMIUM_PATH=... pnpm --filter <pkg> test:bdd` (packages: `@testfly/playwright`, `@testfly/mobile`) |
| Mobile e2e (fake device) | `pnpm --filter @testfly/mobile test:e2e` |

Notes:
- Browser suites need `PW_CHROMIUM_PATH` in the cloud container (Playwright 1.64 with the preinstalled Chromium).
- BDD steps import the **built** package. Rebuild before `test:bdd`; delete `.features-gen` if specs look stale.
- Known flake: the first vitest run after a rebuild can fail with ``Cannot find module '/@fs/.../dist/schema.mjs'``. Rerun once without rebuilding. A second failure is real.
- `bddTestData not found` means two Playwright versions are installed (`node_modules/.pnpm/node_modules/playwright` must point to the `@playwright/test` version). See `tfp-triage`.

Report the exact commands, the pass/fail counts, and every gate you could not run (missing browser, service or network). An unavailable gate is not a pass.
