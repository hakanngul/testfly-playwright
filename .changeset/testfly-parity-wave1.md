---
"@testfly/playwright": minor
"@testfly/reporter": minor
"@testfly/ai": patch
---

TestFly (Java) parity, wave 1:

- `expect` matchers: `toBeValid`/`toBeInvalid`, `toHaveValidationMessage`, `toBeRequired`, `toBeReadOnly`, `toHaveMaxLength`, `toBePasswordHidden`/`toBePasswordVisible`, `toHaveSelectedOption`, `toHaveCountAtLeast`/`toHaveCountAtMost`, `toHaveCookie`, `toHaveLocalStorageItem`, `toHaveWindowCount`.
- `consoleErrors` fixture and `testfly.consoleErrors` options (`report` / `fail` / `off`, `ignore`, `includeConsole`); new `TF_CONSOLE_ERRORS` code and `console` attachment content type.
- `ApiResponse.expectJsonEquals` (semantic, `ignoreArrayOrder`, first-difference message), `expectJsonArrayContains`, `expectStatusRange`.
- `testfly.features` master on/off panel.
- Reporter: `report/heal-log.json` for every heal, console errors in the run record and dashboard, Slack/Teams/Discord `notifications`, AI failure analysis embedded in the run record and dashboard (`embedAnalysis`).
