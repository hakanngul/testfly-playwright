# @testfly/reporter

A standalone Playwright reporter: run history, **Flakiness Radar**, zero-token **smart triage**, **quarantine**, **quality gates**, **LPT test sharding** and a self-contained **HTML dashboard** (inline CSS/JS, no network, light/dark).

It does not depend on `@testfly/playwright`; any Playwright project can use it.

## Usage

Plain Playwright:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  retries: 1,
  reporter: [['list'], ['@testfly/reporter', { historySize: 20, qualityGate: { minPassRate: 95, maxFlaky: 3 } }]],
});
```

With `@testfly/playwright` the same reporter is configured through `defineConfig`; test workers additionally attach heal/step/API/AI events (see `@testfly/reporter/schema`) that appear in the dashboard.

After a run open `.testfly/report/index.html`.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `outputDir` | `.testfly` | Holds `history/` and `report/` (relative to the current working directory). |
| `quarantineFile` | `testfly-quarantine.yml` | Quarantine list, relative to the Playwright config dir. The fixture skips matching tests; the reporter also marks them quarantined, so without the fixture their failures neither count as failed nor fail the run/gate (see below). |
| `historySize` | `20` | Run files kept; also the window of the Flakiness Radar. |
| `env` | `$TESTFLY_ENV` | Environment label stored with the run. |
| `qualityGate.minPassRate` | - | Minimum pass rate in percent (0-100) over executed tests. |
| `qualityGate.maxFlaky` | - | Maximum tests that passed only after a retry. |
| `qualityGate.failOnHighFlakiness` | `false` | Fail if an executed test has HIGH flakiness risk. |
| `qualityGate.failOnHeal` | `false` | Fail if any locator was healed. |
| `dashboard` | `true` | Write `report/index.html`. |
| `printSummary` | `true` | Print a console summary (honors `NO_COLOR`; no colors on `CI`). |

A violated gate prints the reasons and makes Playwright exit with status `failed`.

Outputs: `history/run-<timestamp>-<shard>.v1.json`, `report/flakiness.json`, `report/summary.json`, `report/index.html`.

## Flakiness Radar

Per test over the last N runs, a run counts as unstable when the test failed or passed only after a retry. Risk: `STABLE` < 10%, `WATCH` 10-33%, `HIGH` >= 33%. The dashboard recommends quarantining HIGH tests.

## Smart triage

`triageFailure()` classifies failures with an ordered rule table (`TRIAGE_RULES` in `src/triage.ts`, first match wins): `SYSTEM_FLAKY` (timeouts, `net::ERR`, `ECONNRESET`, closed browser, 5xx, passed on retry), `TEST_BUG` (locator not found, strict mode violation, TypeError/ReferenceError, `TF_LOCATOR`), `APPLICATION_BUG` (assertion mismatch), otherwise `NEEDS_INVESTIGATION` (also heal-related failures).

Triage is purely rule-based: no LLM, zero tokens. LLM root-cause analysis is a separate opt-in reporter in `@testfly/ai` (`@testfly/ai/reporter`, writes `<outputDir>/report/ai-analysis.json`). The dashboard does not embed that file yet.

## Quarantine file

```yaml
quarantine:
  - tests/checkout.spec.ts                          # whole file
  - "tests/login.spec.ts › Login › expired session" # file + title path (case-insensitive)
  - "@flaky-payment"                                # tag
  - test: "features/payment.feature › Payment › 3D secure"
    reason: "JIRA-123"
    project: chromium      # optional
    until: 2026-12-31      # optional; expired entries are ignored with a warning
```

```ts
import { loadQuarantine, matchQuarantine } from '@testfly/reporter';
const list = loadQuarantine('testfly-quarantine.yml'); // missing file => empty; invalid => [TF_QUARANTINE_INVALID]
matchQuarantine(list, { file, titlePath, tags, project }); // { reason? } | null
```

Quarantined tests are recognised by an annotation of type `quarantine` (added by the `@testfly/playwright` auto-fixture).

## Sharding (LPT)

```ts
import { planShards } from '@testfly/reporter';
const { files, estimatedMs, plan } = planShards({ historyDir: '.testfly/history', total: 4, index: 1, testFiles });
```

Files are bin-packed by average historical duration (longest first); unknown files get the median. `index` is 1-based like `--shard`. The CLI wraps this: `testfly shard --total 4 --index 1`.

## Merging shard results

```ts
import { readHistory, mergeRuns, generateDashboard } from '@testfly/reporter';
generateDashboard([mergeRuns(shardRecords)], 'merged/report/index.html');
```
