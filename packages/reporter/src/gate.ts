import type { FlakinessEntry, RunRecord } from './schema';
import { passRate } from './totals';

/** Quality gate thresholds. @public */
export interface QualityGateOptions {
  /** Minimum pass rate in percent (0-100) over executed tests. */
  minPassRate?: number;
  /** Maximum number of tests that passed only after a retry. */
  maxFlaky?: number;
  /** Fail when any test executed in this run has HIGH flakiness risk. */
  failOnHighFlakiness?: boolean;
  /** Fail when any locator was healed (forces brittle locators to be fixed). */
  failOnHeal?: boolean;
}

/** Outcome of {@link evaluateGate}. @public */
export interface GateResult {
  passed: boolean;
  violations: string[];
}

/** Evaluates the quality gate for a run. @public */
export function evaluateGate(run: RunRecord, flakiness: FlakinessEntry[], gate: QualityGateOptions | undefined): GateResult {
  const violations: string[] = [];
  if (!gate) return { passed: true, violations };
  const rate = passRate(run.totals);
  if (gate.minPassRate !== undefined && rate < gate.minPassRate) {
    violations.push(`Pass rate ${rate.toFixed(1)}% is below the minimum of ${gate.minPassRate}%`);
  }
  if (gate.maxFlaky !== undefined && run.totals.flaky > gate.maxFlaky) {
    violations.push(`${run.totals.flaky} flaky test(s) exceed the maximum of ${gate.maxFlaky}`);
  }
  if (gate.failOnHighFlakiness) {
    const executed = new Set(run.tests.filter((t) => t.status !== 'skipped' && !t.quarantined).map((t) => t.id));
    const high = flakiness.filter((f) => f.risk === 'HIGH' && executed.has(f.id));
    if (high.length > 0) {
      violations.push(`${high.length} test(s) have HIGH flakiness risk: ${high.slice(0, 5).map((h) => h.title).join(', ')}${high.length > 5 ? ', ...' : ''}`);
    }
  }
  if (gate.failOnHeal && run.totals.healed > 0) {
    violations.push(`${run.totals.healed} test(s) healed locators (failOnHeal is enabled) - update the YAML locators`);
  }
  return { passed: violations.length === 0, violations };
}
