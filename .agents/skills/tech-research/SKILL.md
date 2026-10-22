---
name: tech-research
description: Research an external library, tool, API, protocol or standard for TestFly Playwright (versions, licensing, APIs, limits) from primary sources and return a short, cited report. Use before adopting a dependency or when behaviour of an external system is unclear; read-only.
---

# Technical research

1. **Primary sources first:** the official docs, the source repository (README, LICENSE, CHANGELOG, source files), the npm registry (`npm view <pkg>`) and installed code under `node_modules`. Blog posts are hints, not evidence.
2. **Pin facts to a version:** the latest version and its date, the version we use, breaking changes in between.
3. **Check the license** and what it allows (redistribution, commercial use). Flag source-available licenses (FSL, BSL, SSPL).
4. **Verify in the installed code** when possible: read the actual exported types and functions, not only the docs.
5. **Separate** observed facts from inferences.

## Report (keep it under ~25 lines)

- **Answer:** one or two sentences.
- **Facts:** bullets, each with a source link or `node_modules/...:line`.
- **Risks / unknowns.**
- **Recommendation** for TestFly.
