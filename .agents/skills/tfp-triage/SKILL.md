---
name: tfp-triage
description: Diagnose failing, flaky, hanging or environment-dependent tests and CI runs in TestFly Playwright and find the root cause before proposing a fix. Use when a test, build or CI job is red or unstable.
---

# TestFly Playwright triage

1. **Reproduce.** Run the single failing test or package with the exact CI command. Note the Node, pnpm and Playwright versions.
2. **Isolate.** Is it red on the base branch too, without your change? Does it fail alone or only in the full run (ordering, parallel workers, shared files)?
3. **Find the root cause.** "Flake" is not a cause. Retry only to confirm a suspicion, at most once.
4. **Fix minimally**, add a regression test, and rerun the gate from `tfp-verify`.

## Known causes in this repo

| Symptom | Cause | Fix |
|---|---|---|
| `bddTestData not found for test` | a second `playwright` (e.g. 1.63 from mobilewright) hoisted in `node_modules/.pnpm/node_modules` | root `pnpm.overrides` for `playwright` and `playwright-core`, then `pnpm install` |
| `Cannot find module '/@fs/.../dist/schema.mjs'` on the first vitest run after a rebuild | vite cache vs. new chunk hashes | rerun without rebuilding |
| `Executable doesn't exist` / no browser | Playwright 1.64 cannot find Chromium in the container | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` |
| ESM-only peer fails under CJS | tsup split CJS turned `import()` into `require()` | see `tfp-change`, build gotchas |
| Stale BDD specs | `.features-gen` from an old build | rebuild the package, delete `.features-gen` |

Report: the failing command, the root cause with evidence (log line, file:line), the fix, and the verification that ran.
