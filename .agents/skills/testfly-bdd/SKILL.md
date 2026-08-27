---
name: testfly-bdd
description: Implements the BDD-first agentic workflow using TestFly Playwright. Use whenever adding or modifying features, user flows, or automated tests to propose Gherkin .feature scenarios first before writing implementation code.
---

# TestFly BDD Agent Workflow

This skill guides AI agents in following a **Behavior-Driven Development (BDD)** first workflow using `@testfly/playwright`.

## 🧠 Core Philosophy
1. **Behavior First**: Before writing any implementation code or step definitions, define the expected behavior in Gherkin format (`.feature` file).
2. **Reviewable Diff**: The `.feature` diff serves as the agreement and contract between the developer and the AI agent.
3. **Executable Contract**: The approved `.feature` scenario directly becomes the automated end-to-end regression test.

---

## 🔄 Agent Execution Steps

### Step 1: Propose Scenario First (Guardrail)
When requested to implement a new feature, fix a bug, or create test automation:
- **DO NOT** jump directly into writing application code, page objects, or step definitions.
- Propose a clean, declarative scenario diff in `features/<feature-name>.feature`.

#### Gherkin Guidelines:
- **Given**: Initial context / starting state (e.g. `Given kullanıcı giriş sayfasına gider`)
- **When**: Action taken by user (e.g. `When kullanıcı geçerli bilgilerle giriş yapar`)
- **Then**: Observable outcome (e.g. `Then kullanıcı ürün kataloğunu görür`)
- **Rule of thumb**: Write scenarios as if explaining the feature to a colleague. Keep it high-level and avoid excessive UI button-state noise.

### Step 2: Await Approval / Refinement
- Present the `.feature` scenario diff clearly to the user.
- Allow the user to refine step phrasing or scenario scope before proceeding.

### Step 3: Implement Step Definitions & Application Code
Once the scenario is approved:
1. Implement or update the feature/application code.
2. Implement corresponding step definitions in `steps/<name>.steps.ts`.

#### Step Definition Rules:
- Always import from `@testfly/playwright`:
  ```typescript
  import { Given, When, Then, expect } from '@testfly/playwright';
  ```
- Use TestFly built-in fixtures:
  - `{ page }`: Playwright page object for UI actions.
  - `{ api }`: Built-in REST API client (`api.get()`, `api.post()`, etc.).
  - `{ db }`: Database client with fluent table assertions (`db.users.create()`, etc.).
  - `{ mail }`: Email inbox / OTP verification client.
  - `{ step }`: Rich step logging for reports (`await step.info('...')`).

- Keep step functions concise (preferably 1–3 lines):
  ```typescript
  When('kullanıcı sepete {string} ürününü ekler', async ({ page, step }, product: string) => {
    await step.info(`Ürün sepete ekleniyor: ${product}`);
    await page.locator(`[data-test="add-to-cart-${product}"]`).click();
  });
  ```

### Step 4: Validate via TestFly CLI
Run the tests using TestFly CLI:
- Run all tests: `npx testfly test`
- Run tagged tests: `npx testfly test --grep @smoke`
- Clean artifacts if needed: `npx testfly clean`
- View reports: `npx testfly report --allure`
