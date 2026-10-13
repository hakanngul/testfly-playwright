/**
 * File templates shared by `testfly init`. The same files live under
 * `packages/create-testfly/templates` (plain files) for `npm create testfly`.
 */

/** Options for {@link projectTemplates}. @internal */
export interface TemplateOptions {
  /** Include BDD (features, steps and the bdd project). */
  bdd: boolean;
}

const BDD_CONFIG = `import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    env: 'local',
    bdd: {
      features: 'features/**/*.feature',
      steps: 'steps/**/*.ts',
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inherits the generated BDD test directory.
    { name: 'bdd', use: { ...devices['Desktop Chrome'] } },
    { name: 'e2e', testDir: './tests', use: { ...devices['Desktop Chrome'] } },
  ],
});
`;

const PLAIN_CONFIG = `import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testDir: './tests',
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc',
    env: 'local',
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
`;

const FEATURE = `Feature: TodoMVC

  @smoke
  Scenario: Add a todo
    Given I open the todo app
    When I add the todo "Write tests with TestFly"
    Then the todo list shows "Write tests with TestFly"
`;

const STEPS = `import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('I open the todo app', async ({ page }) => {
  await page.goto('/');
});

When('I add the todo {string}', async ({ locate, step }, title: string) => {
  await step(\`Add "\${title}"\`, async () => {
    const input = locate('todo.new_todo');
    await input.fill(title);
    await input.press('Enter');
  });
});

Then('the todo list shows {string}', async ({ locate }, title: string) => {
  await expect(locate('todo.items')).toHaveText(title);
});
`;

const SPEC = `import { test, expect } from '@testfly/playwright';

test('add and complete a todo', { tag: '@smoke' }, async ({ page, locate, step }) => {
  await page.goto('/');

  await step('Add a todo', async () => {
    await locate('todo.new_todo').fill('Buy milk');
    await locate('todo.new_todo').press('Enter');
  });

  await expect(locate('todo.items')).toHaveText('Buy milk');
  await page.getByRole('checkbox', { name: 'Toggle Todo' }).check();
  await expect(page.locator('.todo-list li')).toHaveClass('completed');
});
`;

const LOCATORS = `# Page "todo": keys are used as locate('todo.<name>').
# Selector fields: role (+name), label, text, testid, placeholder, css, xpath. Add "fallbacks:" for self-healing.
new_todo:
  placeholder: What needs to be done?
  fallbacks:
    - css: ".new-todo"

items:
  css: ".todo-list li label"
`;

const GITIGNORE_BLOCK = `# TestFly / Playwright
node_modules/
test-results/
playwright-report/
.features-gen/
.testfly/history/
.testfly/report/
.testfly/sessions/
.env
.env.local
`;

/** Entries appended to an existing .gitignore by init. @internal */
export const GITIGNORE_ENTRIES = GITIGNORE_BLOCK.split('\n').filter((line) => line && !line.startsWith('#'));

/** Return `relative path -> content` for a new project. @internal */
export function projectTemplates({ bdd }: TemplateOptions): Record<string, string> {
  const files: Record<string, string> = {
    'playwright.config.ts': bdd ? BDD_CONFIG : PLAIN_CONFIG,
    'tests/example.spec.ts': SPEC,
    'locators/todo.yaml': LOCATORS,
  };
  if (bdd) {
    files['features/todo.feature'] = FEATURE;
    files['steps/todo.steps.ts'] = STEPS;
  }
  return files;
}

/** Full .gitignore content for brand new projects. @internal */
export const GITIGNORE_TEMPLATE = GITIGNORE_BLOCK;
