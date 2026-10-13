import type { FlakinessEntry, RiskLevel, RunRecord } from './schema';

/** Failure-rate thresholds of the Flakiness Radar. @public */
export const RISK_THRESHOLDS = { watch: 0.1, high: 0.33 } as const;

/** Maps an instability rate (0..1) to a risk level: STABLE <10%, WATCH 10-33%, HIGH >=33%. @public */
export function riskFor(rate: number): RiskLevel {
  if (rate >= RISK_THRESHOLDS.high) return 'HIGH';
  if (rate >= RISK_THRESHOLDS.watch) return 'WATCH';
  return 'STABLE';
}

/**
 * Computes per-test stability across the given runs (pass the last N runs).
 * A run counts as "unstable" for a test when it failed OR passed only after a retry (flaky).
 * Skipped and quarantined executions are ignored. Result is sorted by failure rate (desc), then id.
 *
 * @public
 */
export function computeFlakiness(runs: RunRecord[]): FlakinessEntry[] {
  const acc = new Map<string, { title: string; runs: number; failures: number; flakyRuns: number; duration: number }>();
  for (const run of runs) {
    for (const t of run.tests) {
      if (t.status === 'skipped' || t.quarantined) continue;
      const e = acc.get(t.id) ?? { title: t.title, runs: 0, failures: 0, flakyRuns: 0, duration: 0 };
      e.title = t.title;
      e.runs += 1;
      e.duration += t.durationMs;
      if (t.flaky) e.flakyRuns += 1;
      else if (t.status !== 'passed') e.failures += 1;
      acc.set(t.id, e);
    }
  }
  const out: FlakinessEntry[] = [];
  for (const [id, e] of acc) {
    const rate = e.runs === 0 ? 0 : (e.failures + e.flakyRuns) / e.runs;
    out.push({
      id,
      title: e.title,
      runs: e.runs,
      failures: e.failures,
      flakyRuns: e.flakyRuns,
      failureRate: Math.round(rate * 1000) / 1000,
      risk: riskFor(rate),
      avgDurationMs: e.runs === 0 ? 0 : Math.round(e.duration / e.runs),
    });
  }
  return out.sort((a, b) => b.failureRate - a.failureRate || a.id.localeCompare(b.id));
}
