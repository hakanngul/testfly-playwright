import { describe, expect, it } from 'vitest';
import { evaluateGate } from '../src/gate';
import type { FlakinessEntry } from '../src/schema';
import { computeTotals, passRate } from '../src/totals';
import { heal, makeRun, makeTest } from './helpers/records';

const fl = (id: string, risk: FlakinessEntry['risk'], title = id): FlakinessEntry => ({ id, title, runs: 10, failures: 5, flakyRuns: 0, failureRate: 0.5, risk, avgDurationMs: 1 });

describe('evaluateGate', () => {
  const run = makeRun([makeTest({ id: 'a', title: 'a' }), makeTest({ id: 'b', title: 'b', status: 'failed' })]);

  it('passes when no gate is configured', () => {
    expect(evaluateGate(run, [], undefined)).toEqual({ passed: true, violations: [] });
  });

  it('passes with an empty gate object', () => {
    expect(evaluateGate(run, [], {})).toEqual({ passed: true, violations: [] });
  });

  it('minPassRate: fails below, passes at/above', () => {
    const r = evaluateGate(run, [], { minPassRate: 90 });
    expect(r.passed).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toContain('50.0%');
    expect(r.violations[0]).toContain('90%');
    expect(evaluateGate(run, [], { minPassRate: 50 }).passed).toBe(true);
    expect(evaluateGate(run, [], { minPassRate: 0 }).passed).toBe(true);
  });

  it('minPassRate ignores skipped and quarantined tests', () => {
    const r = makeRun([makeTest({ id: 'a' }), makeTest({ id: 'q', status: 'failed', quarantined: true }), makeTest({ id: 's', status: 'skipped' })]);
    expect(evaluateGate(r, [], { minPassRate: 100 }).passed).toBe(true);
  });

  it('maxFlaky: strictly greater fails', () => {
    const r = makeRun([makeTest({ id: 'a', flaky: true }), makeTest({ id: 'b', flaky: true })]);
    expect(evaluateGate(r, [], { maxFlaky: 2 }).passed).toBe(true);
    const bad = evaluateGate(r, [], { maxFlaky: 1 });
    expect(bad.passed).toBe(false);
    expect(bad.violations[0]).toContain('2 flaky');
    expect(evaluateGate(r, [], { maxFlaky: 0 }).passed).toBe(false);
  });

  it('failOnHighFlakiness: only HIGH tests that executed in this run count', () => {
    const r = makeRun([makeTest({ id: 'a', title: 'A' }), makeTest({ id: 'sk', title: 'SK', status: 'skipped' }), makeTest({ id: 'q', title: 'Q', quarantined: true })]);
    const res = evaluateGate(r, [fl('a', 'HIGH', 'A'), fl('sk', 'HIGH', 'SK'), fl('q', 'HIGH', 'Q'), fl('gone', 'HIGH', 'GONE'), fl('w', 'WATCH')], { failOnHighFlakiness: true });
    expect(res.passed).toBe(false);
    expect(res.violations[0]).toContain('1 test(s)');
    expect(res.violations[0]).toContain('A');
    expect(res.violations[0]).not.toContain('SK');
  });

  it('failOnHighFlakiness passes when only WATCH/STABLE', () => {
    const r = makeRun([makeTest({ id: 'a' })]);
    expect(evaluateGate(r, [fl('a', 'WATCH')], { failOnHighFlakiness: true }).passed).toBe(true);
    expect(evaluateGate(r, [fl('a', 'HIGH')], { failOnHighFlakiness: false }).passed).toBe(true);
  });

  it('failOnHighFlakiness truncates the list at 5 with ellipsis', () => {
    const tests = Array.from({ length: 7 }, (_, i) => makeTest({ id: `t${i}`, title: `T${i}` }));
    const res = evaluateGate(makeRun(tests), tests.map((t) => fl(t.id, 'HIGH', t.title)), { failOnHighFlakiness: true });
    expect(res.violations[0]).toContain('7 test(s)');
    expect(res.violations[0]).toContain('...');
    expect(res.violations[0]).toContain('T4');
    expect(res.violations[0]).not.toContain('T5');
  });

  it('failOnHeal: fails if any test healed', () => {
    const r = makeRun([makeTest({ id: 'a', heals: [heal() as never] })]);
    const res = evaluateGate(r, [], { failOnHeal: true });
    expect(res.passed).toBe(false);
    expect(res.violations[0]).toContain('1 test(s) healed');
    expect(evaluateGate(run, [], { failOnHeal: true }).passed).toBe(true);
    expect(evaluateGate(r, [], { failOnHeal: false }).passed).toBe(true);
  });

  it('collects all violations', () => {
    const r = makeRun([makeTest({ id: 'a', flaky: true, heals: [heal() as never] }), makeTest({ id: 'b', status: 'failed' })]);
    const res = evaluateGate(r, [fl('a', 'HIGH')], { minPassRate: 100, maxFlaky: 0, failOnHighFlakiness: true, failOnHeal: true });
    expect(res.violations).toHaveLength(4);
    expect(res.passed).toBe(false);
  });
});

describe('totals', () => {
  it('computeTotals categorizes statuses; quarantined takes precedence over status', () => {
    const t = computeTotals([
      makeTest({ id: '1' }),
      makeTest({ id: '2', status: 'failed' }),
      makeTest({ id: '3', status: 'timedOut' }),
      makeTest({ id: '4', status: 'interrupted' }),
      makeTest({ id: '5', status: 'skipped' }),
      makeTest({ id: '6', status: 'failed', quarantined: true }),
      makeTest({ id: '7', flaky: true }),
      makeTest({ id: '8', heals: [heal() as never] }),
    ]);
    expect(t).toEqual({ total: 8, passed: 3, failed: 3, flaky: 1, skipped: 1, quarantined: 1, healed: 1 });
  });

  it('passRate is 100 when nothing executed and a percentage otherwise', () => {
    expect(passRate(computeTotals([]))).toBe(100);
    expect(passRate(computeTotals([makeTest({ status: 'skipped' })]))).toBe(100);
    expect(passRate(computeTotals([makeTest({ id: 'a' }), makeTest({ id: 'b', status: 'failed' }), makeTest({ id: 'c' }), makeTest({ id: 'd' })]))).toBe(75);
  });
});
