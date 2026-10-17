# @testfly/ai

The AI layer of [TestFly Playwright](https://testfly.dev): write steps in plain language, let the model **compile them once** into deterministic Playwright actions, then **replay them for free** on every later run.

- `ai.act(goal)` — natural language → cached, deterministic action plan (Compile & Freeze)
- `ai.byIntent(intent)` — describe an element, get a plain Playwright `Locator`
- `toSatisfyAi` / `toViolateAi` — semantic assertions
- AI self-healing strategy for `locate()` (priority 100, after rules and fuzzy)
- Opt-in AI failure analysis reporter
- Providers over plain `fetch`: Anthropic, OpenAI, Gemini, any OpenAI-compatible server (Ollama, DeepSeek, Groq…). No vendor SDKs.

## Install

```bash
npm i -D @testfly/ai @testfly/playwright @playwright/test
```

```ts
// playwright.config.ts
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    ai: {
      provider: 'anthropic',          // anthropic | openai | gemini | openai-compatible
      // model: 'claude-haiku-4-5',   // defaults: gemini-2.5-flash, gpt-4.1-mini, claude-haiku-4-5
      mode: process.env.CI ? 'replay' : 'live',
      // cacheDir: '.testfly',
      // redact: ['ORDER-\\d{6}'],    // extra regexes redacted before anything is sent
    },
  },
});
```

API keys come from `ai.apiKey` or the environment: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (or `TESTFLY_AI_API_KEY` for any provider). `openai-compatible` needs `baseUrl` and `model` (key optional, e.g. Ollama: `baseUrl: 'http://localhost:11434/v1'`).

### `testfly.ai` options

| option | default | meaning |
| --- | --- | --- |
| `provider` | `anthropic` | LLM backend |
| `model` | per provider | model id (required for `openai-compatible`) |
| `apiKey` / `baseUrl` | env / provider URL | credentials / endpoint override |
| `mode` | `live` | `live`, `replay`, `off` (see below) |
| `cacheDir` | `.testfly` | where the JSON caches live |
| `timeoutMs` | `30000` | per request; one retry on 429/5xx honouring `retry-after` |
| `maxTokens` | `1024` | max output tokens |
| `maxContextChars` | `24000` | max characters of ARIA snapshot sent |
| `redact` | `[]` | extra regexes to redact |

## Live vs replay (do this on CI)

| mode | behaviour |
| --- | --- |
| `live` | cache miss → call the LLM, then write the cache. Stale plan → recompile. |
| `replay` | **no network, ever.** A miss throws `TF_AI_CACHE_MISS`. AI assertions throw `TF_FEATURE_DISABLED` (they are never cached). |
| `off` | every AI call throws `TF_FEATURE_DISABLED`. |

Workflow: develop with `live`, **commit `.testfly/*.json`**, run CI with `replay`. Runs are then deterministic, free and fast.

| file | content |
| --- | --- |
| `action-cache.json` | frozen plans, key `<urlPattern>::<normalized goal>` (`:id` replaces numeric/uuid segments; `…::intent::…` for `byIntent`) |
| `page-knowledge.json` | Auto-POM: elements learned per page (target, action, synonyms, `parentTrigger` for hover menus). Simple goals are resolved from it with zero tokens |
| `healed-locators.json` | locators healed by the AI strategy |

Files are human-readable with stable key order, written atomically and safe for parallel workers (lock + re-read/merge).

## Usage

```ts
import { test, expect } from '@testfly/ai';

test('checkout', async ({ page, ai }) => {
  await page.goto('/shop');
  await ai.act('add the blue backpack to the cart');
  await ai.act('log in as {{user}} with password {{pass}}', { user: 'ada', pass: process.env.PW! });

  const total = await ai.byIntent('the order total');   // a normal Locator
  await expect(total).toHaveText('$49.00');

  await expect(page).toSatisfyAi('the cart badge shows 1 item');
  await expect.soft(page).toViolateAi('an error banner is visible');
  await ai.assert('the checkout button is enabled');    // = expect(page).toSatisfyAi(...)
});
```

* `act` plans use semantic targets first (`getByRole`, `getByLabel`, `getByText`, `getByTestId`, `getByPlaceholder`; CSS only as last resort) and are executed with ordinary auto-waiting Playwright actions. If a cached plan fails half-way, only the **remaining** steps are recompiled (live mode).
* Use `{{placeholders}}` + params for values that must never reach the model — the model only ever sees the placeholder.
* Assertions evaluate once (no polling) and return `{ pass, reason }`; the reason is part of the failure message. Element scope (`expect(locator)`) sends only that subtree.
* Every call attaches an `application/vnd.testfly.ai+json` event (cache hit/miss/knowledge, provider, model, tokens, duration) for `@testfly/reporter` cost reporting.

### BDD

`Given/When/Then` live in `@testfly/playwright/bdd` and are bound to its BDD `test`, which has no `ai` fixture. Merge it with the `test` from `@testfly/ai` and create your own step functions:

```ts
// steps/fixtures.ts
import { createBdd, mergeTests, test as bddTest } from '@testfly/playwright/bdd';
import { test as aiTest } from '@testfly/ai';

export const test = mergeTests(bddTest, aiTest);
export const { Given, When, Then } = createBdd(test);
```

```ts
// steps/ai.steps.ts
import { When, Then } from './fixtures';

When('I {string}', async ({ ai }, goal: string) => {
  await ai.act(goal);
});
Then('the page shows {string}', async ({ ai }, what: string) => {
  await ai.assert(what);
});
```

### AI healing

```ts
import { createAiHealingStrategy } from '@testfly/ai';
// register with the TestFly healing pipeline (healing.mode = 'ai' wires it automatically)
const strategy = createAiHealingStrategy({ provider: 'anthropic', mode: 'live' });
```

The model proposes a semantic target from the ARIA snapshot; it is accepted only if it matches **exactly one** element. Results are cached by `<key>::<original locator>`.

### Failure analysis (opt-in reporter)

```ts
reporter: [['@testfly/ai/reporter', { provider: 'anthropic', maxAnalyses: 10, concurrency: 3, patches: true, maxPatches: 3 }]],
```

Analyses failed tests (final attempt) and writes `.testfly/report/ai-analysis.json` (`{ [testId]: markdown }`). It never fails the run and does nothing in `replay`/`off` (prints one line). The analyses are embedded in the `@testfly/reporter` run record and dashboard.

With `patches: true` (Auto-PR) it also asks for the smallest unified diff that fixes each analysed failure. A diff is kept only if it changes the failing spec file alone and `git apply --check` accepts it; it is written to `.testfly/remediations/<test>.patch` and never applied for you. Review it, then `git apply` it or open a PR from it.

### Custom providers

```ts
import { registerProvider } from '@testfly/ai';
registerProvider('my-gateway', (options) => ({ name: 'my-gateway', complete: async (req) => ({ text: '…', model: 'x' }) }));
```

## Cost & privacy

- **Cost:** only cache misses call the LLM. After the first recorded run, CI in `replay` mode costs nothing. A typical `act` is one small request (ARIA snapshot, trimmed to `maxContextChars`).
- **What is sent:** goal text, URL, page title and the ARIA snapshot (accessible names/roles/values — not screenshots, not HTML, not cookies, not network traffic). Password input values are not part of ARIA snapshots.
- **Redaction** runs over everything sent: JWTs, bearer tokens, API keys (`sk-…`, `AKIA…`, `ghp_…`, …), Luhn-valid card numbers, `ai.redact` regexes and the literal values of environment variables whose names match `SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE` (length ≥ 6). E-mail addresses are deliberately **not** redacted. `redact(text, patterns)` is exported and unit-testable.
- Error messages never contain API keys. For stricter environments use a self-hosted `openai-compatible` endpoint.
- Never commit secrets inside goals: use `{{params}}`.
