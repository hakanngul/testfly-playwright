# Agent Guidelines for TestFly Playwright Projects

This repository uses **TestFly Playwright**, an enterprise-grade BDD and Test Automation framework.

## 🎯 Core Rule: BDD-First Agentic Workflow
When implementing new features, modifying existing flows, or writing automated tests:

1. **Never write code immediately.** Always propose a Gherkin `.feature` scenario diff first (`Given / When / Then`).
2. **Review & Iterate**: Refine scenario wording with the user until approved.
3. **Implement**:
   - Write/update step definitions in `steps/*.steps.ts` importing from `@testfly/playwright`.
   - Use built-in fixtures: `{ page, api, db, mail, step }`.
   - Write standard Playwright spec tests in `tests/*.spec.ts` when testing technical/API unit flows.
4. **Clean & Verify**:
   - Clean artifacts: `npx testfly clean` (or `npm run clean`)
   - Run tests: `npx testfly test` (or `npm test`)
   - Open reports: `npx testfly report --allure` (or `npm run test:report:allure`)
