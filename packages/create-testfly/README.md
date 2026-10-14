# create-testfly

Scaffold a new [TestFly Playwright](../../README.md) project.

> Pre-release (`0.2.0-next.0`), not yet published to npm.

## Usage

```bash
npm create testfly@latest my-tests
# or
pnpm create testfly my-tests
yarn create testfly my-tests
```

| Option | Description |
| --- | --- |
| `<directory>` | Target directory (required). Use `.` for the current directory. It must be empty or not exist yet. |
| `--bdd` | Also add a BDD example (`features/todo.feature`, `steps/todo.steps.ts`) and a BDD-enabled `playwright.config.ts`. |
| `--pm <npm\|pnpm\|yarn>` | Package manager used in the printed next steps (default: detected from `npm_config_user_agent`). |
| `-h, --help` | Show help. |

## What you get

```
my-tests/
├── .gitignore
├── package.json          # scripts: test, test:ui, report, locators, doctor
├── playwright.config.ts  # defineConfig from '@testfly/playwright/config'
├── tsconfig.json
├── locators/todo.yaml    # typed YAML locators (page "todo")
├── tests/example.spec.ts # uses locate('todo.new_todo') and step()
├── features/todo.feature # --bdd only
└── steps/todo.steps.ts   # --bdd only, imports from '@testfly/playwright/bdd'
```

The generated `package.json` lists `@testfly/playwright` (at the same version as `create-testfly`), `@playwright/test`, `@types/node` and `typescript` as dev dependencies.

Next steps (also printed by the tool):

```bash
cd my-tests
npm install
npx playwright install chromium
npx testfly locators
npm test
```

The templates target `https://demo.playwright.dev/todomvc`. Change `testfly.baseUrl` in `playwright.config.ts` to point at your application.

To add TestFly to an existing project instead, use `npx testfly init` from `@testfly/playwright`.

## License

Apache-2.0
