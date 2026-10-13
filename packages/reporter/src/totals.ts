import type { TestRecord, RunRecord } from './schema';

/** Computes the `totals` block of a run from its tests. @public */
export function computeTotals(tests: TestRecord[]): RunRecord['totals'] {
  const totals = { total: tests.length, passed: 0, failed: 0, flaky: 0, skipped: 0, quarantined: 0, healed: 0 };
  for (const t of tests) {
    if (t.quarantined) totals.quarantined++;
    else if (t.status === 'skipped') totals.skipped++;
    else if (t.status === 'passed') totals.passed++;
    else totals.failed++;
    if (t.flaky) totals.flaky++;
    if (t.heals.length > 0) totals.healed++;
  }
  return totals;
}

/** Pass rate (0..100) over executed tests (passed + failed); 100 when nothing executed. @public */
export function passRate(totals: RunRecord['totals']): number {
  const executed = totals.passed + totals.failed;
  return executed === 0 ? 100 : (totals.passed / executed) * 100;
}
