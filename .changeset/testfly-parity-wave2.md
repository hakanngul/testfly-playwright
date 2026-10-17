---
"@testfly/playwright": minor
"@testfly/reporter": minor
"@testfly/ai": minor
---

TestFly (Java) parity, wave 2:

- API: `api.batch(tasks, { concurrency })` with per-entry results, `withInterceptor({ onRequest, onResponse })`, `ApiResponse.contentType` / `charset` (charset-aware decoding) / `saveTo(file)`.
- `ApiResponse.expectJsonSchema(schema)` and `expectOpenApi(spec, options)` (OpenAPI 3.x, `$ref`s, status ranges); optional peer `ajv`.
- `mockServer` fixture: a real HTTP stub server for tests without a page.
- `ctx.loadExcel(file, { sheet, namespace })` (optional peer `exceljs`) and the worker-scoped `suiteCtx` fixture.
- Reporter `testManagement`: TestRail (`@C1234`) and Xray Cloud (`@PROJ-123`) result sync.
- `@testfly/ai/reporter` `patches` / `maxPatches`: validated remediation patches (Auto-PR) in `.testfly/remediations/`.
