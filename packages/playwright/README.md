# @testfly/playwright

Zero-boilerplate, batteries-included framework on top of `@playwright/test`. It provides BDD through `playwright-bdd`, typed YAML locators with self-healing, API/DB/Redis/mail/mock/session fixtures, quality checks (axe-core, screenshots, Web Vitals) and the `testfly` CLI. It also wires [`@testfly/reporter`](../reporter/README.md) for run history, flakiness, triage, quarantine and quality gates.

> Pre-release (`0.2.0-next.0`), not yet published to npm.

## Install

```bash
npm i -D @testfly/playwright @playwright/test
npx playwright install chromium
```

Optional drivers (install only what you configure): `pg`, `mysql2`, `ioredis`, `imapflow`. Optional AI features: [`@testfly/ai`](../ai/README.md).

Or scaffold a project: `npm create testfly@latest my-tests`.

## Entry points

| Import | Contents |
| --- | --- |
| `@testfly/playwright` | `test`, `expect`, `mergeTests`, fixture sets (`coreTest`, `apiTest`, `dataTest`, `locatorTest`, `qualityTest`, `mockTest`, `sessionTest`, `quarantineTest`), `defineSession`, `TestFlyError`, `isTestFlyError`, `TestContext`, `registerHealingStrategy`, option and client types |
| `@testfly/playwright/config` | `defineConfig`, `TestFlyOptionsSchema`, config types |
| `@testfly/playwright/bdd` | `Given`, `When`, `Then`, `Step`, `Before`, `After`, `BeforeAll`, `AfterAll`, `BeforeStep`, `AfterStep`, `test`, `expect`, `createBdd`, `defineBddConfig`, `defineBddProject`, `defineParameterType`, `DataTable`, `cucumberReporter`, `mergeTests` |
| `@testfly/playwright/locators` | `LocatorParser`, `LocatorTypeGen`, `LocatorRegistry`, `createLocate`, healing types |
| `@testfly/playwright/db` | `DbClient`, `MockDb`, `RedisClient`, `MockRedis` |
| `@testfly/playwright/mail` | `MailClient`, `MockMail`, `extractCode`, `extractLinks` |

## Configure

```ts
// playwright.config.ts
import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testDir: './tests',
  testfly: {
    baseUrl: 'https://app.example.com',
    locators: { dir: 'locators' },
    healing: { mode: 'rules', fuzzyThreshold: 0.75 },
    api: { retry: { attempts: 2 } },
    db: { client: 'postgres', connectionString: '${DATABASE_URL}' },
    mail: { provider: 'mailpit', url: 'http://localhost:8025' },
    consoleErrors: { mode: 'report', ignore: ['ResizeObserver loop'] },
    reporter: {
      qualityGate: { minPassRate: 95, maxFlaky: 3 },
      notifications: { slack: '${SLACK_WEBHOOK_URL}', on: 'failure' },
    },
    features: { ai: false }, // master on/off switches
    profiles: { ci: { healing: { mode: 'off' } } },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`defineConfig` validates `testfly` with zod (`TF_CONFIG_INVALID` on error). It also:

- resolves `${VAR}` from `process.env` and `.env`,
- applies `profiles[TESTFLY_ENV ?? env]`,
- deep-merges per-project `use: { testfly: {...} }`,
- sets `use.baseURL` from `testfly.baseUrl`,
- wires `playwright-bdd` when `testfly.bdd` is set,
- appends `@testfly/reporter` unless `testfly.reporter.enabled` is `false`,
- applies the `features` panel: `healing`, `ai`, `quarantine`, `consoleErrors`, `reporter` and `notifications` are on by default; switching one off overrides its own options (for example `features.ai: false` forces `ai.mode: 'off'`). Projects can switch features per project through `use.testfly.features`.

Tests read the resolved options from the worker fixture `testfly`.

## Fixtures

| Fixture | Description |
| --- | --- |
| `testfly` | Resolved options (worker scope). |
| `ctx` | `TestContext`: `set/get/require/has`, dot paths, `interpolate('{{key}}')`, `load/loadJson/loadCsv`. |
| `step` | `step('title', body)`, `step.info/pass/warn/fail/attach`. |
| `faker` | `FakerClient` (seed with `TESTFLY_FAKER_SEED`). |
| `locate(key)` / `locators` | Typed YAML locators with fallbacks and healing. |
| `api` | `ApiClient`: `get/post/put/patch/delete/head/fetch`, `graphql`, `pollUntil`, `withBearer/withBasic/withHeader(s)/withBaseUrl/withAuth`. Responses: `status`, `data`, `durationMs`, `json()`, `jsonPath()`, `expectStatus`, `expectStatusRange`, `expectOk`, `expectHeader`, `expectJson`, `expectJsonEquals` (semantic, optional `ignoreArrayOrder`, names the first difference), `expectJsonArrayContains`, `expectSchema`, `expectDurationBelow`. |
| `db` | `DbClient`: `query`, `one`, `scalar`, `exec`, `transaction`, `expectRow`, `expectNoRow`, `expectValue`, `waitFor`. Requires `testfly.db`. |
| `redis` | `RedisClient`: `get`, `getJson`, `set`, `del`, `exists`, `keys`, `ttl`, `waitFor`, `flushAll({ confirm: true })`. Requires `testfly.redis`. |
| `mail` | `MailClient`: `list`, `latest`, `waitForEmail`, `extractCode`, `extractLinks`, `clear`. Requires `testfly.mail`. |
| `a11y` | `analyze(options)`, `assertNoViolations(options)` (axe-core). |
| `visual` | `assertSnapshot(name, options)`, `assertElementSnapshot(locatorOrSelector, name, options)`. |
| `perf` | `getVitals()`, `assertLcp(ms)`, `assertCls(score)`, `assertTtfb(ms)`. |
| `form` | `fill({ Email: 'a@b.c', 'Accept terms': true }, root?)`: finds fields by label, placeholder, name, id or test id. |
| `mock` | `get/post/put/delete/json/delay/abort`, `expectRequest`, `getHistory`, `reset`. |
| `session` | `as(role)`, `define(role, setup)`, `path(role)`, `clear(role?)`. |
| `consoleErrors` | Browser errors (uncaught exceptions and `console.error`) of every page in the test's context: `list()`, `clear()`, `expectNone()`. Collected automatically in tests that open a browser; `consoleErrors.mode: 'fail'` fails a passing test that logged errors (`TF_CONSOLE_ERRORS`), `'report'` (default) only attaches them to the dashboard. |

`db`, `redis` and `mail` are worker-scoped and created lazily. Using them without config throws `TF_DB_NOT_CONFIGURED` / `TF_MAIL_NOT_CONFIGURED`. Tests listed in `testfly-quarantine.yml` are skipped automatically.

```ts
import { test, expect } from '@testfly/playwright';

test('checkout', async ({ page, locate, api, step }) => {
  const product = await api.post('/api/products', { json: { name: 'Backpack' } });
  product.expectStatus(201);

  await page.goto(`/products/${product.jsonPath<string>('$.id')}`);
  await step('Add to cart', () => locate('product.add_to_cart').click());
  await expect(locate('cart.badge')).toHaveText('1');
});
```

## Extra matchers

The `expect` exported by `@testfly/playwright` (and `/bdd`) adds web-first matchers Playwright does not ship. They retry until the expect timeout and support `.not`.

| Matcher | Checks |
| --- | --- |
| `toBeValid()` / `toBeInvalid()` | HTML5 constraint validation (`checkValidity()`, or `aria-invalid` on custom widgets). |
| `toHaveValidationMessage(text \| RegExp)` | The browser's validation message. |
| `toBeRequired()` / `toBeReadOnly()` | `required` / `readonly` attribute, or `aria-required` / `aria-readonly`. |
| `toHaveMaxLength(n)` | `maxlength` of the field. |
| `toBePasswordHidden()` / `toBePasswordVisible()` | Whether a "show password" toggle switched the input away from `type="password"`. |
| `toHaveSelectedOption(label \| RegExp)` | Label of the selected `<option>`. |
| `toHaveCountAtLeast(n)` / `toHaveCountAtMost(n)` | Bounds on the number of matched elements. |
| `toHaveCookie(name, value?)` | Cookie of the page's browser context. |
| `toHaveLocalStorageItem(key, value?)` | `localStorage` entry of the page's origin. |
| `toHaveWindowCount(n)` | Open pages (tabs and popups) in the page's context. |

```ts
await expect(page.getByLabel('Email')).toBeInvalid();
await expect(page.getByLabel('Email')).toHaveValidationMessage(/@/);
await expect(page).toHaveCookie('session', /^eyJ/);
```

## Locators

One YAML file per page. The file name is the page and the top-level keys are locators:

```yaml
# locators/product.yaml  ->  locate('product.add_to_cart')
add_to_cart:
  role: button
  name: Add to cart
  fallbacks:
    - testid: add-to-cart
title:
  role: heading
  level: 1
price: ".price"            # string = CSS
```

Selector fields (exactly one): `role` (+ `name`, `exact`, `level`), `label`, `text`, `testid`, `placeholder`, `alt`, `title`, `css`, `xpath`. Modifiers: `nth`, `first`, `last`, `has_text`, `within`, `fallbacks`. Run `testfly locators` to generate `locators/index.d.ts`.

Healing order: primary → `fallbacks` → rules (10) → fuzzy (20) → AI (100, `healing.mode: 'ai'` with `@testfly/ai`). Heals are attached as `application/vnd.testfly.heal+json` and reported. Add your own with `registerHealingStrategy({ name, priority, heal })`.

## BDD

```ts
// playwright.config.ts
export default defineConfig({
  testfly: { bdd: { features: 'features/**/*.feature', steps: 'steps/**/*.ts' } },
});
```

```ts
// steps/cart.steps.ts
import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('I open product {string}', async ({ page }, id: string) => {
  await page.goto(`/products/${id}`);
});
When('I add it to the cart', async ({ locate }) => {
  await locate('product.add_to_cart').click();
});
Then('the cart shows {int} item(s)', async ({ locate }, count: number) => {
  await expect(locate('cart.badge')).toHaveText(String(count));
});
```

## CLI

`testfly init | doctor | locators | steps | generate --swagger <src> | test | clean | shard --total <n> --index <i> | quarantine list | report [html] | ci [github|gitlab]`. Run `testfly <command> --help` for options.

## Errors

Every failure is a `TestFlyError` with a stable `code` (`TF_*`), a `hint` and a `docsUrl`. TestFly never falls back to fake data silently. See [ADR-001](../../docs/adr/ADR-001.md) (D7).

## License

Apache-2.0
