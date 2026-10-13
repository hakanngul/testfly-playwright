import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeRun } from '../src/history';
import { planShards } from '../src/sharder';
import { makeRun, makeTest } from './helpers/records';
import { useTmpDirs } from './helpers/tmp';

const tmp = useTmpDirs();

function seed(durations: Record<string, number>, startedAt = 1_000_000, perTestSplit = 1) {
  const dir = join(tmp(), 'history');
  const tests = Object.entries(durations).flatMap(([file, ms]) =>
    Array.from({ length: perTestSplit }, (_, i) => makeTest({ file, title: `t${i}`, durationMs: ms / perTestSplit })),
  );
  writeRun(dir, makeRun(tests, { startedAt }));
  return dir;
}

const plan = (dir: string, files: string[], total: number, index = 1, extra: object = {}) => planShards({ historyDir: dir, total, index, testFiles: files, ...extra });
const makespan = (p: ReturnType<typeof planShards>) => Math.max(...p.plan.map((b) => b.estimatedMs));

describe('planShards', () => {
  const D = { 'a.spec.ts': 9000, 'b.spec.ts': 8000, 'c.spec.ts': 7000, 'd.spec.ts': 6000, 'e.spec.ts': 5000, 'f.spec.ts': 4000 };

  it('LPT yields the optimal makespan on a known instance (3 shards → 13000 each)', () => {
    const p = plan(seed(D), Object.keys(D), 3);
    expect(p.plan.map((b) => b.estimatedMs)).toEqual([13000, 13000, 13000]);
    expect(makespan(p)).toBe(13000);
  });

  it('LPT makespan is within the 4/3 bound and beats naive round-robin on a skewed instance', () => {
    const skew = { 'huge.ts': 100_000, 's1.ts': 10_000, 's2.ts': 10_000, 's3.ts': 10_000, 's4.ts': 10_000, 's5.ts': 10_000, 's6.ts': 10_000, 's7.ts': 10_000, 's8.ts': 10_000, 's9.ts': 10_000, 's10.ts': 10_000 };
    const files = Object.keys(skew);
    const p = plan(seed(skew), files, 2);
    // optimal: huge alone (100k) vs nine*... 10 smalls = 100k
    expect(makespan(p)).toBe(100_000);
    const roundRobin = [0, 0];
    files.forEach((f, i) => { roundRobin[i % 2]! += skew[f as keyof typeof skew]; });
    expect(makespan(p)).toBeLessThanOrEqual(Math.max(...roundRobin));
  });

  it('every file is assigned exactly once across shards', () => {
    const files = Object.keys(D);
    const p = plan(seed(D), files, 4);
    const all = p.plan.flatMap((b) => b.files).sort();
    expect(all).toEqual([...files].sort());
  });

  it('index is 1-based and selects the matching bin', () => {
    const dir = seed(D);
    const files = Object.keys(D);
    for (let i = 1; i <= 3; i++) {
      const p = plan(dir, files, 3, i);
      expect(p.plan[i - 1]!.index).toBe(i);
      expect(p.files).toEqual(p.plan[i - 1]!.files);
      expect(p.estimatedMs).toBe(p.plan[i - 1]!.estimatedMs);
    }
    expect(plan(dir, files, 3, 1).plan.map((b) => b.index)).toEqual([1, 2, 3]);
  });

  it('largest file goes to shard 1 (lowest index wins ties)', () => {
    expect(plan(seed(D), Object.keys(D), 3, 1).files).toContain('a.spec.ts');
  });

  it('is deterministic regardless of input order', () => {
    const dir = seed(D);
    const files = Object.keys(D);
    const a = plan(dir, files, 3);
    const b = plan(dir, [...files].reverse(), 3);
    const c = plan(dir, [...files].sort(() => 0.5 - Math.random()), 3);
    expect(b.plan).toEqual(a.plan);
    expect(c.plan).toEqual(a.plan);
  });

  it('ties between equal durations break by file name', () => {
    const dir = seed({ 'z.ts': 1000, 'y.ts': 1000, 'x.ts': 1000, 'w.ts': 1000 });
    const p = plan(dir, ['z.ts', 'y.ts', 'x.ts', 'w.ts'], 2);
    expect(p.plan[0]!.files).toEqual(['w.ts', 'y.ts']);
    expect(p.plan[1]!.files).toEqual(['x.ts', 'z.ts']);
  });

  it('total=1 puts everything in one shard', () => {
    const files = Object.keys(D);
    const p = plan(seed(D), files, 1, 1);
    expect(p.files).toEqual([...files].sort());
    expect(p.plan).toHaveLength(1);
    expect(p.estimatedMs).toBe(39000);
  });

  it('more shards than files leaves empty shards', () => {
    const p = plan(seed(D), ['a.spec.ts', 'b.spec.ts'], 5, 4);
    expect(p.plan).toHaveLength(5);
    expect(p.plan.filter((b) => b.files.length === 0)).toHaveLength(3);
    expect(p.files).toEqual([]);
    expect(p.estimatedMs).toBe(0);
  });

  it('clamps invalid total/index', () => {
    const dir = seed(D);
    expect(plan(dir, Object.keys(D), 0, 1).plan).toHaveLength(1);
    expect(plan(dir, Object.keys(D), 3, 99).files).toEqual(plan(dir, Object.keys(D), 3, 3).files);
    expect(plan(dir, Object.keys(D), 3, 0).files).toEqual(plan(dir, Object.keys(D), 3, 1).files);
  });

  it('empty file list yields empty plan', () => {
    const p = plan(seed(D), [], 2);
    expect(p.files).toEqual([]);
    expect(p.plan.map((b) => b.estimatedMs)).toEqual([0, 0]);
  });

  it('duplicate files are de-duplicated', () => {
    const p = plan(seed(D), ['a.spec.ts', 'a.spec.ts'], 2);
    expect(p.plan.flatMap((b) => b.files)).toEqual(['a.spec.ts']);
  });

  it('files without history get the median of known files', () => {
    const dir = seed({ 'a.ts': 10_000, 'b.ts': 30_000, 'c.ts': 20_000 });
    const p = plan(dir, ['a.ts', 'b.ts', 'c.ts', 'unknown.ts'], 4);
    const unknown = p.plan.find((b) => b.files.includes('unknown.ts'))!;
    expect(unknown.estimatedMs).toBe(20_000);
  });

  it('median of an even number of known files is the rounded mean of the middle two', () => {
    const dir = seed({ 'a.ts': 10_000, 'b.ts': 21_000 });
    const p = plan(dir, ['a.ts', 'b.ts', 'u.ts'], 3);
    expect(p.plan.find((b) => b.files.includes('u.ts'))!.estimatedMs).toBe(15_500);
  });

  it('without any history unknown files get defaultDurationMs (default 30000)', () => {
    const empty = join(tmp(), 'none');
    expect(plan(empty, ['a.ts', 'b.ts'], 1).estimatedMs).toBe(60_000);
    expect(plan(empty, ['a.ts', 'b.ts'], 1, 1, { defaultDurationMs: 1000 }).estimatedMs).toBe(2000);
  });

  it('matches absolute test file paths to relative paths stored in history', () => {
    const dir = seed({ 'tests/a.spec.ts': 5000, 'tests/b.spec.ts': 1000 });
    const p = plan(dir, ['/work/proj/tests/a.spec.ts', '/work/proj/tests/b.spec.ts'], 2);
    expect(p.plan.map((b) => b.estimatedMs).sort((x, y) => x - y)).toEqual([1000, 5000]);
  });

  it('averages file durations over runs and sums tests within a run', () => {
    const dir = join(tmp(), 'h');
    writeRun(dir, makeRun([makeTest({ file: 'a.ts', title: '1', durationMs: 1000 }), makeTest({ file: 'a.ts', title: '2', durationMs: 1000 })], { startedAt: 1 }));
    writeRun(dir, makeRun([makeTest({ file: 'a.ts', title: '1', durationMs: 4000 })], { startedAt: 2 }));
    expect(plan(dir, ['a.ts'], 1).estimatedMs).toBe(3000); // (2000 + 4000) / 2
  });

  it('skipped and quarantined tests do not contribute durations', () => {
    const dir = join(tmp(), 'h');
    writeRun(dir, makeRun([
      makeTest({ file: 'a.ts', title: '1', durationMs: 1000 }),
      makeTest({ file: 'a.ts', title: '2', durationMs: 99_000, status: 'skipped' }),
      makeTest({ file: 'a.ts', title: '3', durationMs: 99_000, quarantined: true }),
    ]));
    expect(plan(dir, ['a.ts'], 1).estimatedMs).toBe(1000);
  });

  it('normalizes ./ and backslashes in test file names', () => {
    const dir = seed({ 'tests/a.ts': 7000 });
    expect(plan(dir, ['./tests\\a.ts'], 1).estimatedMs).toBe(7000);
  });
});
