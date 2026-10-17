# TestFly Playwright

> Zero-boilerplate, type-safe, batteries-included TypeScript framework on top of `@playwright/test`: BDD, typed YAML locators with self-healing, API/DB/mail fixtures, quality checks and stability analytics.

[English](./README.md) | [Türkçe](./README_tr.md)

> **Status:** pre-release (`0.2.0-next.0`). The packages are not yet published to npm. APIs may still change before 1.0.

---

## Packages

This repository is a pnpm monorepo (`packages/*`):

| Package | Description |
| :--- | :--- |
| [`@testfly/playwright`](./packages/playwright/README.md) | Core framework: `defineConfig`, fixtures (`ctx`, `step`, `faker`, `api`, `db`, `redis`, `mail`, `locate`, `a11y`, `visual`, `perf`, `form`, `mock`, `session`), BDD entry point, `testfly` CLI. |
| [`@testfly/reporter`](./packages/reporter/README.md) | Standalone Playwright reporter: run history, Flakiness Radar, rule-based failure triage, quarantine, quality gates, LPT sharding, HTML dashboard. |
| [`@testfly/ai`](./packages/ai/README.md) | Optional AI layer: `ai.act()`, `ai.byIntent()`, `toSatisfyAi` / `toViolateAi`, AI healing strategy, opt-in failure analysis reporter, record/replay cache. |
| [`create-testfly`](./packages/create-testfly/README.md) | Project scaffolder: `npm create testfly@latest`. |
| [`@testfly/mobile`](./packages/mobile/README.md) | **Experimental, private, not published.** Native iOS/Android testing on [Mobilewright](https://mobilewright.dev) (devices driven by mobilecli): `device`, `mobileScreen`, `mobileLocate` fixtures. Not part of the supported API. |

Design decisions are recorded in [`docs/adr/`](./docs/adr/) ([ADR-001](./docs/adr/ADR-001.md), [ADR-002](./docs/adr/ADR-002.md)).

---

## Principles

- **Native Playwright.** Everything is a Playwright fixture or config helper. BDD scenarios are compiled by [`playwright-bdd`](https://github.com/vitalets/playwright-bdd) into ordinary Playwright tests, so Trace Viewer, UI mode, sharding and worker isolation work unchanged.
- **Config lives in `playwright.config.ts`.** `defineConfig` from `@testfly/playwright/config` validates a `testfly` key with zod and hands the result to tests as the worker fixture `testfly`. There is no separate config file and no global singleton.
- **Honest failures.** Every TestFly failure is a `TestFlyError` with a stable `code` (`TF_*`), a message and usually a `hint`. Missing configuration or optional dependencies throw; TestFly never silently falls back to fake data. In-memory `mock` DB/mail backends exist but are only used when you select them explicitly.
- **One data contract.** Workers talk to the reporter only through Playwright attachments with versioned content types (`@testfly/reporter/schema`).

---

## Quickstart

### 1. Create a project

```bash
npm create testfly@latest my-tests          # add --bdd for a features/steps example
cd my-tests
npm install
npx playwright install chromium
npx testfly locators                        # generate typed locator keys
npm test                                    # runs `testfly test`
```

Or add TestFly to an existing project:

```bash
npm i -D @testfly/playwright @playwright/test
npx testfly init                            # config, example test, locators, BDD example (--no-bdd to skip)
```

### 2. Configure (`playwright.config.ts`)

```ts
import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testDir: './tests',
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc', // also becomes use.baseURL
    env: 'local',                                   // or TESTFLY_ENV
    healing: { mode: 'rules' },                     // off | rules | ai
    reporter: { qualityGate: { minPassRate: 95 } }, // @testfly/reporter is added automatically
    profiles: { ci: { healing: { mode: 'off' } } }, // deep-merged when env / TESTFLY_ENV is "ci"
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`defineConfig` also resolves `${VAR}` placeholders from `process.env` and `.env`, deep-merges per-project `use: { testfly: {...} }` overrides, wires `playwright-bdd` when `testfly.bdd` is set, and appends `@testfly/reporter` unless `testfly.reporter.enabled` is `false`.

### 3. Define locators (`locators/login.yaml`)

Each file is one page; the **file name is the page name** and every **top-level key is a locator**. The key used in tests is `<file name>.<key>`.

```yaml
# locators/login.yaml  ->  locate('login.username'), locate('login.submit'), ...
username:
  role: textbox
  name: Username
password:
  label: Password
submit:
  role: button
  name: Login
  fallbacks:                 # tried in order when the primary selector finds nothing
    - testid: login-submit
    - css: "#login-btn"
error_banner: ".alert-error" # a plain string is a CSS selector
```

Each definition uses exactly one selector field: `role` (with optional `name`, `exact`, `level`), `label`, `text`, `testid`, `placeholder`, `alt`, `title`, `css` or `xpath`. Modifiers: `nth`, `first`, `last`, `has_text`, `within` (key of a parent locator) and `fallbacks`. A `web:` key is accepted as an alias for the definition. `ios:`, `android:` and `mobile:` blocks hold native definitions for [`@testfly/mobile`](./packages/mobile/README.md); the web `locate()` does not use them.

Generate typed keys for IDE autocompletion (writes `locators/index.d.ts`). Any string is still accepted at compile time; an unknown key fails at runtime with `TF_LOCATOR_NOT_FOUND`:

```bash
npx testfly locators
```

### 4. Write a test

```ts
import { test, expect } from '@testfly/playwright';

test('login', { tag: '@smoke' }, async ({ page, locate, step }) => {
  await page.goto('/login');

  await step('Fill credentials', async () => {
    await locate('login.username').fill('standard_user');
    await locate('login.password').fill('secret_sauce');
  });
  await locate('login.submit').click();

  await expect(page).toHaveURL(/inventory/);
});
```

### 5. Or write BDD

```ts
// playwright.config.ts
export default defineConfig({
  testfly: {
    baseUrl: 'https://example.com',
    bdd: { features: 'features/**/*.feature', steps: 'steps/**/*.ts' },
  },
});
```

```gherkin
# features/login.feature
Feature: Login
  @smoke
  Scenario: Successful login
    Given I open the login page
    When I log in as "standard_user"
    Then the inventory is visible
```

```ts
// steps/login.steps.ts
import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('I open the login page', async ({ page }) => {
  await page.goto('/login');
});

When('I log in as {string}', async ({ locate }, user: string) => {
  await locate('login.username').fill(user);
  await locate('login.password').fill('secret_sauce');
  await locate('login.submit').click();
});

Then('the inventory is visible', async ({ page }) => {
  await expect(page).toHaveURL(/inventory/);
});
```

Step definitions receive every TestFly fixture. Run with `npx testfly test` (it runs `bddgen` first when BDD is configured).

---

## Fixtures

All fixtures are available on `test` from `@testfly/playwright` (and in BDD steps). Individual sets (`coreTest`, `apiTest`, `dataTest`, `locatorTest`, `qualityTest`, `mockTest`, `sessionTest`, `quarantineTest`) can be combined with `mergeTests` for a leaner setup.

| Fixture | Scope | Purpose |
| :--- | :--- | :--- |
| `testfly` | worker | Resolved TestFly options. |
| `ctx` | test | Key/value store with dot paths, `{{key}}` interpolation, JSON/CSV loading (`ctx.load`, `ctx.loadJson`, `ctx.loadCsv`). |
| `step` | test | `step('title', body)` plus `step.info/pass/warn/fail/attach`; feeds the reporter. |
| `faker` | test | Fake data (`TESTFLY_FAKER_SEED` for reproducible values). |
| `locate` / `locators` | test / worker | Typed YAML locators with fallbacks and self-healing. |
| `api` | test | HTTP client: retries, auth helpers, `graphql`, `pollUntil`, fluent response assertions. |
| `db`, `redis`, `mail` | worker | Postgres/MySQL, Redis and mailbox clients (require config and the optional driver package). |
| `a11y`, `visual`, `perf`, `form` | test | axe-core audits, screenshot comparison, Web Vitals, smart form fill. |
| `mock` | test | Route mocking and request assertions. |
| `session` | test | Cached per-role login (`defineSession` + `session.as(role)`). |

### Full-stack example

```ts
import { test, expect } from '@testfly/playwright';

test('registration with e-mail OTP', async ({ api, db, mail, page, ctx }) => {
  const email = `user-${Date.now()}@example.test`;

  const res = await api.post('/api/register', { json: { email, name: 'Ada' } });
  res.expectStatus(201);
  ctx.set('userId', res.jsonPath('$.id'));

  const message = await mail.waitForEmail({ to: email, subject: /verification code/i, timeout: 30_000 });
  const code = mail.extractCode(message);

  await page.goto('/verify');
  await page.getByLabel('Code').fill(code!);
  await page.getByRole('button', { name: 'Verify' }).click();

  await db.expectValue('SELECT status FROM users WHERE id = $1', [ctx.require('userId')], 'ACTIVE');
});
```

Required config for this example:

```ts
testfly: {
  api: { baseUrl: 'https://api.example.com' },
  db: { client: 'postgres', connectionString: '${DATABASE_URL}' }, // needs `pg` installed
  mail: { provider: 'mailpit', url: 'http://localhost:8025' },
}
```

Database clients: `postgres` (`pg`), `mysql` (`mysql2`) or an explicit in-memory `mock`. Redis needs `ioredis`; IMAP mail needs `imapflow`. Mail providers: `mailpit`, `mailtrap`, `imap`, `mock`.

### Quality checks

```ts
import { test } from '@testfly/playwright';

test('home page quality', async ({ page, a11y, visual, perf }) => {
  await page.goto('/');

  await a11y.assertNoViolations({ tags: ['wcag2a', 'wcag2aa'] });
  await visual.assertSnapshot('home', { mask: ['.ad-banner'] });
  await perf.assertLcp(2500);
  await perf.assertCls(0.1);
  await perf.assertTtfb(600);
});
```

`perf.getVitals()` returns `ttfb`, `domContentLoaded`, `loadTime`, `fcp`, `lcp`, `cls`; a metric the browser cannot report is `null` (LCP/CLS are Chromium-only) and asserting it throws `TF_QUALITY_UNSUPPORTED`.

### Sessions

```ts
import { test, defineSession } from '@testfly/playwright';

defineSession('admin', async (page) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
});

test('admin dashboard', async ({ page, session }) => {
  await session.as('admin'); // storage state is created once and cached under .testfly/sessions
  await page.goto('/admin');
});
```

---

## Self-healing locators

`locate(key)` resolves in this order:

1. the primary definition from YAML,
2. the YAML `fallbacks`,
3. registered healing strategies by ascending priority: rules (10), fuzzy (20), AI (100, only with `healing.mode: 'ai'` and `@testfly/ai` installed).

Every successful heal is attached to the test and shown by the reporter. Use `testfly.reporter.qualityGate.failOnHeal` to fail the run when anything healed. Custom strategies can be added with `registerHealingStrategy`.

---

## Reporter and stability analytics

`@testfly/reporter` is added by `defineConfig` automatically (or can be used in any Playwright project). After a run open `.testfly/report/index.html` (`npx testfly report`). It provides:

- run history (`.testfly/history/run-*.v1.json`) and the **Flakiness Radar** (`STABLE` / `WATCH` / `HIGH`),
- **rule-based failure triage** (`SYSTEM_FLAKY`, `TEST_BUG`, `APPLICATION_BUG`, `NEEDS_INVESTIGATION`); zero tokens, no LLM,
- **quarantine** via `testfly-quarantine.yml` (tests are skipped and annotated),
- **quality gates** (`minPassRate`, `maxFlaky`, `failOnHighFlakiness`, `failOnHeal`),
- **duration-balanced sharding** from history (`npx testfly shard --total 4 --index 1`).

LLM-based root-cause analysis is available separately and opt-in through the `@testfly/ai/reporter` reporter (writes `.testfly/report/ai-analysis.json`). See [`packages/ai/README.md`](./packages/ai/README.md).

---

## CLI

The `testfly` binary ships with `@testfly/playwright`.

| Command | Description |
| :--- | :--- |
| `testfly init [--force] [--no-bdd]` | Scaffold config, example tests, locators and `.gitignore` entries. |
| `testfly doctor` | Check Node, Playwright, config, locators and BDD steps. |
| `testfly locators [-d <dir>] [-o <file>]` | Generate typed locator keys (`locators/index.d.ts`). |
| `testfly steps [--scaffold] [-f <features>] [-t <steps>]` | List feature steps without a definition; `--scaffold` writes stubs to `steps/unmapped.steps.ts`. |
| `testfly generate --swagger <pathOrUrl> [-o <dir>]` | Generate BDD features and API steps from an OpenAPI/Swagger document. |
| `testfly test [args...]` | Run `bddgen` (if BDD is configured) and `playwright test`. Options: `--clean`, `--ui`, `--headed`, `-p`, `-g`, `-r`, `-c`, `-w`, `--no-bdd`; extra args are passed through. |
| `testfly clean [--all]` | Remove `.features-gen`, `test-results` and reports; `--all` also removes run history. |
| `testfly shard --total <n> --index <i>` | Print the files of one duration-balanced shard (`--format files\|json`). |
| `testfly quarantine list [-f <file>]` | List active and expired quarantine entries. |
| `testfly report [html] [-o <dir>]` | Open the TestFly dashboard, or the Playwright HTML report with `html`. |
| `testfly ci [github\|gitlab] [--pm <pm>] [--shards <n>] [--force]` | Write a CI pipeline. |

---

## Mobile

`@testfly/mobile` adds **experimental** native iOS/Android testing on [Mobilewright](https://mobilewright.dev), which drives simulators, emulators and real devices through mobilecli (no Appium). It is private, not published and not covered by the supported API. `mobilewright` is an optional peer dependency.

```ts
// playwright.config.ts → testfly
mobile: { platform: 'ios', bundleId: 'com.example.app' },
```

```ts
import { test, expect } from '@testfly/mobile';

test('sign in', async ({ mobileLocate }) => {
  await mobileLocate('login.username').fill('ada');   // the YAML ios:/android:/mobile: block
  await mobileLocate('login.signIn').tap();
  await expect(mobileLocate('home.greeting')).toHaveText('Hello, ada');
});
```

BDD steps import from `@testfly/mobile/bdd` (set `testfly.bdd.importTestFrom: '@testfly/mobile/bdd'`). Details: [`packages/mobile/README.md`](./packages/mobile/README.md), [ADR-002](./docs/adr/ADR-002.md).

---

## Development

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

Requires Node.js >= 22 and pnpm 10.

## Documentation

- [ADR-001: foundation decisions](./docs/adr/ADR-001.md)
- [ADR-002: native mobile testing on Mobilewright](./docs/adr/ADR-002.md)
- [Architecture (`ARCHITECTURE.md`, Turkish)](./ARCHITECTURE.md)
- [MVP specification (`MVP_SPEC.md`, Turkish)](./MVP_SPEC.md)
- [Roadmap (`ROADMAP.md`, Turkish)](./ROADMAP.md)

## License

Apache-2.0
