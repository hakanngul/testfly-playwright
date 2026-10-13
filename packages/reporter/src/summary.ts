import { relative } from 'node:path';
import type { GateResult } from './gate';
import type { FlakinessEntry, RunRecord } from './schema';
import { passRate } from './totals';

interface SummaryInput {
  record: RunRecord;
  gate: GateResult;
  gateConfigured: boolean;
  flakiness: FlakinessEntry[];
  dashboardFile?: string;
  warnings: number;
}

function colorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY) && !process.env.CI;
}

/** Prints the concise console summary. @internal */
export function printSummary(input: SummaryInput, write: (line: string) => void = (l) => console.log(l)): void {
  const on = colorsEnabled();
  const paint = (code: number, s: string): string => (on ? `\u001b[${code}m${s}\u001b[0m` : s);
  const { record, gate, flakiness } = input;
  const t = record.totals;
  const high = flakiness.filter((f) => f.risk === 'HIGH').length;
  const parts = [
    paint(32, `${t.passed} passed`),
    t.failed ? paint(31, `${t.failed} failed`) : '0 failed',
    t.flaky ? paint(33, `${t.flaky} flaky`) : '0 flaky',
    `${t.healed} healed`,
    `${t.quarantined} quarantined`,
    `${t.skipped} skipped`,
  ];
  write('');
  write(`${paint(1, 'TestFly')}  ${parts.join('  ')}  (${passRate(t).toFixed(1)}% pass rate, ${(record.durationMs / 1000).toFixed(1)}s)`);
  if (high > 0) write(paint(33, `  Flakiness Radar: ${high} test(s) at HIGH risk - consider quarantining them`));
  if (input.gateConfigured) {
    if (gate.passed) write(paint(32, '  Quality gate: passed'));
    else {
      write(paint(31, '  Quality gate: FAILED'));
      for (const v of gate.violations) write(paint(31, `    - ${v}`));
    }
  }
  if (input.warnings > 0) write(paint(33, `  ${input.warnings} reporter warning(s)`));
  if (input.dashboardFile) write(`  Dashboard: ${relative(process.cwd(), input.dashboardFile) || input.dashboardFile}`);
}
