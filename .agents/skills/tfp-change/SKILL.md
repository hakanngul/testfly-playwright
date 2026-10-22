---
name: tfp-change
description: Implement or review changes to the TestFly Playwright packages (playwright, reporter, ai, mobile, create-testfly) - public exports, testfly config options, fixtures, error codes, optional peers, build and changesets. Use for any TypeScript source change in packages/; not for docs-only or test-only work.
---

# TestFly Playwright change workflow

## Map the change first

| Package | Role | Key files |
|---|---|---|
| `packages/playwright` | core: config, fixtures, locators, clients, CLI, BDD entry | `src/index.ts` (public API), `src/entries/*.ts` (`/bdd`, `/config`, `/locators`, `/db`, `/mail`), `src/fixtures/`, `src/core/` |
| `packages/reporter` | data contract + Playwright reporter | `src/schema.ts` (content types, zod schemas) |
| `packages/ai` | optional AI layer | depends on reporter; peer `@testfly/playwright` |
| `packages/mobile` | experimental, private: Mobilewright fixtures | see the `tfp-mobile` skill |
| `packages/create-testfly` | scaffolder | templates |

Read the symbol, its callers, its tests and the package's public entry before editing.

## Contracts to preserve

- **Public API** = what `src/index.ts` and `src/entries/*` export, plus `testfly` config keys. Removing, renaming or narrowing them is a breaking change. Additive changes get a `minor` changeset.
- **Config:** options live under the `testfly` key, validated by zod in `src/core/config/schema.ts` and resolved by `defineConfig` (`src/core/config/define.ts`). Defaults go in the schema (`.default()`, `.prefault({})`), never in consumers. Projects override with `use.testfly` (deep-merged).
- **Errors:** throw `TestFlyError(code, message, { hint, details, cause })` with a `TF_*` code from `src/core/errors.ts`. Add a new code there; never fail silently or fall back to fake data.
- **Optional peers** (pg, mysql2, ioredis, imapflow, ajv, exceljs, mobilewright, @testfly/ai): load lazily with `importOptional(name, feature)`. A missing peer throws `TF_OPTIONAL_DEPENDENCY_MISSING`. Never import them at module top level.
- **Fixtures:** build with `test.extend<Test, Worker>()` and combine with `mergeTests`. Worker-scoped options use `{ scope: 'worker', option: true }`. No process-global mutable state.
- **Reporter data:** telemetry goes to the reporter as attachments with `application/vnd.testfly.*+json` content types from `@testfly/reporter/schema`. A new type needs a schema there and a reporter test.

## Build gotchas

- tsup with `splitting: true` in CJS output rewrites `import()` to `require()`, which cannot load ESM-only packages. ESM-only optional peers need a native `import()` with splitting off, or a shared state on `globalThis`.
- Keep package deps in tsup `external`.
- `@playwright/test` is a peer. Never add a second copy. The workspace pins `playwright` and `playwright-core` with `pnpm.overrides`.

## Changesets

Every user-visible package change gets a `.changeset/*.md`. The fixed group is `@testfly/playwright`, `reporter`, `ai` and `create-testfly`; the repo is in pre mode (`next`). Private packages (`@testfly/mobile`) need none.

## Hand off

Run the `tfp-verify` gates. Report the changed public API, config keys, error codes and changesets.
