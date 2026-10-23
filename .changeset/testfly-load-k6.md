---
"@testfly/playwright": minor
---

New `load` fixture for k6 load tests (TestFly's declarative load testing). `load.run({ url | requests | script, vus, duration | iterations, rampUp, sleepSeconds, thresholds: { p95Ms, p99Ms, errorRate } })` generates a k6 script, runs the user-installed k6 (`testfly.load.k6Path`, `testfly.load.timeoutMs`) and returns p90/p95/p99, error rate, checks rate and RPS; `result.assertPassed()` fails with `TF_LOAD_THRESHOLDS_FAILED`. The k6 summary is attached as `k6-summary`. New error codes `TF_LOAD_K6_MISSING`, `TF_LOAD_RUN_FAILED`, `TF_LOAD_THRESHOLDS_FAILED`; new `loadTest` fixture set (also merged into `test`).
