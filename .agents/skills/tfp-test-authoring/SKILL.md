---
name: tfp-test-authoring
description: Write or revise tests in TestFly Playwright - vitest unit tests, Playwright fixture e2e specs, playwright-bdd features and steps, and fakes for external systems. Use when adding coverage for a change or reproducing a bug as a test.
---

# TestFly Playwright test authoring

## Pick the layer

| Layer | Where | Use for |
|---|---|---|
| Unit (vitest) | `packages/<pkg>/test/**/*.test.ts` | pure logic, parsers, schema, error codes |
| Fixture e2e (Playwright) | `packages/playwright/e2e/*.spec.ts`, `packages/mobile/e2e/` | fixtures inside a real Playwright run |
| Data contract | `packages/playwright/test/fixtures/e2e.test.ts` | runs e2e with the JSON reporter; checks attachments and error codes of expected failures |
| BDD | `packages/*/e2e-bdd/features/*.feature` + `steps/*.steps.ts` | user-level behaviour (BDD-first, see `testfly-bdd`) |

## Rules

- Reproduce a bug as a failing test first, then fix it.
- Expected failures: use the declarative `test.fail('title', async () => ...)`. A `test.fail()` call inside the body does not run when a fixture fails in setup. Assert the `TF_*` code from a vitest harness that reads the JSON report.
- Worker-scoped options cannot be overridden by `test.use` inside a `describe`; add a Playwright project instead.
- Fake external systems in process. Do not call real services: local `http.createServer`, `mockServer` fixture, or a fake driver like `packages/mobile/test/support/fakeDriver.ts`, which implements the Mobilewright driver interface.
- Each test sets up its own data; no ordering between tests; parallel-safe (`fullyParallel: true`).
- Timing: assert with retrying `expect` and generous budgets; never `waitForTimeout`.

Run the new tests and the affected gates with `tfp-verify`.
