---
name: tfp-review
description: Review a TestFly Playwright diff for correctness bugs, public API and config breakage, packaging problems, missing tests and doc drift, and report ranked findings with evidence. Use for code review of a branch, commit range or working-tree diff; read-only.
---

# TestFly Playwright review

Review the diff (`git diff <base>...HEAD` or the working tree), then read the surrounding code. Do not edit files.

## Checklist

1. **Correctness:** trace each changed path from a real caller. Check edge cases, error paths, async/await and cleanup in fixture teardown (`finally`).
2. **Public API:** removed or renamed exports in `src/index.ts`/`src/entries/*`, changed `testfly` config keys or defaults, new `TF_*` codes documented.
3. **Packaging:** optional peers loaded with `importOptional`; no top-level import of a peer; tsup `external` up to date; CJS `import()` gotcha; changeset present for public packages.
4. **Consistency:** names and semantics match the existing API (a method called `type` must behave like the existing `type`).
5. **Tests:** a test that fails without the change; e2e for fixtures; no real network; parallel-safe; no hidden sleeps.
6. **Docs:** README ↔ README_tr parity; no unverified claims.
7. **Security:** no secrets, no unsafe shell or path handling, remote endpoints opt-in.

## Report

Findings, most severe first. Each one has `file:line`, what is wrong, a concrete failure scenario (input → wrong result) and a suggested fix. Mark each as **blocking** or **optional**. Say "no findings" when there are none. Do not pad the list with style nits.
