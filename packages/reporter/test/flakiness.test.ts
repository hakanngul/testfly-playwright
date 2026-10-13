import { describe, expect, it } from 'vitest';
import { computeFlakiness, riskFor, RISK_THRESHOLDS } from '../src/flakiness';
import type { TestRecord } from '../src/schema';
import { makeRun, makeTest } from './helpers/records';

/** n runs of one test; `outcomes` is a list of 'p' | 'f' | 'x' (flaky) | 's' (skipped) | 'q' (quarantined). */
function runsOf(outcomes: string, over: Partial<TestRecord> = {}) {
  return [...outcomes].map((o, i) => {
    const t = makeTest({
      ...over,
      status: o === 'f' ? 'failed' : o === 's' ? 'skipped' : 'passed',
      flaky: o === 'x',
      quarantined: o === 'q',
      durationMs: 100 * (i + 1),
    });
    return makeRun([t], { startedAt: 1000 + i });
  });
}

describe('riskFor boundaries', () => {
  it('uses documented thresholds', () => {
    expect(RISK_THRESHOLDS).toEqual({ watch: 0.1, high: 0.33 });
  });
  it.each([
    [0, 'STABLE'], [0.0999, 'STABLE'], [0.1, 'WATCH'], [0.15, 'WATCH'], [0.3299, 'WATCH'],
    [0.33, 'HIGH'], [0.5, 'HIGH'], [1, 'HIGH'],
  ] as const)('rate %s → %s', (rate, risk) => expect(riskFor(rate)).toBe(risk));
});

describe('computeFlakiness', () => {
  it('returns [] for no runs', () => expect(computeFlakiness([])).toEqual([]));

  it('stable test: all passes', () => {
    const [e] = computeFlakiness(runsOf('pppppppppp'));
    expect(e).toMatchObject({ runs: 10, failures: 0, flakyRuns: 0, failureRate: 0, risk: 'STABLE' });
  });

  it('1 failure in 10 runs is exactly the WATCH boundary (10%)', () => {
    const [e] = computeFlakiness(runsOf('fpppppppp' + 'p'));
    expect(e).toMatchObject({ failures: 1, failureRate: 0.1, risk: 'WATCH' });
  });

  it('1 in 11 runs stays STABLE (9.1%)', () => {
    expect(computeFlakiness(runsOf('f' + 'p'.repeat(10)))[0]!.risk).toBe('STABLE');
  });

  it('33 failures in 100 runs is HIGH; 32 in 100 is WATCH', () => {
    expect(computeFlakiness(runsOf('f'.repeat(33) + 'p'.repeat(67)))[0]).toMatchObject({ failureRate: 0.33, risk: 'HIGH' });
    expect(computeFlakiness(runsOf('f'.repeat(32) + 'p'.repeat(68)))[0]).toMatchObject({ failureRate: 0.32, risk: 'WATCH' });
  });

  it('1 in 3 (33.3%) is HIGH', () => {
    expect(computeFlakiness(runsOf('fpp'))[0]).toMatchObject({ failureRate: 0.333, risk: 'HIGH' });
  });

  it('flaky runs count as unstable and are tracked separately', () => {
    const [e] = computeFlakiness(runsOf('xxpppppppp'));
    expect(e).toMatchObject({ runs: 10, failures: 0, flakyRuns: 2, failureRate: 0.2, risk: 'WATCH' });
  });

  it('failures and flaky runs add up', () => {
    const [e] = computeFlakiness(runsOf('fxpp'));
    expect(e).toMatchObject({ failures: 1, flakyRuns: 1, failureRate: 0.5, risk: 'HIGH' });
  });

  it('timedOut and interrupted statuses count as failures', () => {
    const runs = [
      makeRun([makeTest({ status: 'timedOut' })], { startedAt: 1 }),
      makeRun([makeTest({ status: 'interrupted' })], { startedAt: 2 }),
    ];
    expect(computeFlakiness(runs)[0]).toMatchObject({ failures: 2, runs: 2 });
  });

  it('skipped runs are ignored entirely (not counted in runs)', () => {
    const [e] = computeFlakiness(runsOf('pssssf'));
    expect(e).toMatchObject({ runs: 2, failures: 1, failureRate: 0.5 });
  });

  it('a test that is only ever skipped produces no entry', () => {
    expect(computeFlakiness(runsOf('sss'))).toEqual([]);
  });

  it('quarantined executions are ignored', () => {
    const [e] = computeFlakiness(runsOf('qqpp'));
    expect(e!.runs).toBe(2);
  });

  it('averages duration (rounded) and keeps the latest title', () => {
    const runs = [
      makeRun([makeTest({ id: 'same', title: 'old title', durationMs: 100 })], { startedAt: 1 }),
      makeRun([makeTest({ id: 'same', title: 'new title', durationMs: 201 })], { startedAt: 2 }),
    ];
    expect(computeFlakiness(runs)[0]).toMatchObject({ title: 'new title', avgDurationMs: 151 });
  });

  it('sorts by failure rate desc then id asc', () => {
    const mk = (id: string, status: 'passed' | 'failed', at: number) => makeRun([makeTest({ id, title: id, status })], { startedAt: at });
    const out = computeFlakiness([mk('b', 'failed', 1), mk('a', 'passed', 2), mk('c', 'failed', 3), mk('d', 'passed', 4)]);
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('tracks several tests across a run independently', () => {
    const run = makeRun([makeTest({ id: 'x', title: 'x', status: 'failed' }), makeTest({ id: 'y', title: 'y' })]);
    const out = computeFlakiness([run]);
    expect(out.find((e) => e.id === 'x')!.risk).toBe('HIGH');
    expect(out.find((e) => e.id === 'y')!.risk).toBe('STABLE');
  });
});
