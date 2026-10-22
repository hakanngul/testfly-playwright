---
name: tfp-docs
description: Write or audit TestFly Playwright documentation - root README and README_tr, package READMEs, ADRs, ROADMAP and changeset text - keeping English and Turkish in sync and every claim backed by code. Use for documentation-only changes or the docs part of a feature.
---

# TestFly Playwright documentation

- **Sources of truth:** current source, tests and `package.json`. Report a doc/code conflict; do not copy stale claims.
- **Locales:** `README.md` ↔ `README_tr.md` stay in sync: same sections, keys, defaults and limits. `ROADMAP.md` and `ARCHITECTURE.md` are Turkish; package READMEs and ADRs are English.
- **Where:**
  - user-facing usage → root READMEs and `packages/<pkg>/README.md`;
  - design decisions → `docs/adr/ADR-00N.md` (status, context, decisions, consequences);
  - release notes → `.changeset/*.md`.
- **Claims:** experimental or private packages (`@testfly/mobile`) are labelled so. Never claim real-device, external-service or network verification that was not executed.
- **Examples:** TypeScript, importing from the public entry points (`@testfly/playwright`, `/bdd`, `/config`). Prefer snippets that exist in `e2e/` or `e2e-bdd/`.
- **Style:** short sentences, tables for options, no marketing words.

Check: links resolve, code names match the source, and both locales were updated.
