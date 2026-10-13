import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { historyFileName, pruneHistory, readHistory, writeRun } from '../src/history';
import { mergeRuns } from '../src/merge';
import { RunRecordSchema } from '../src/schema';
import { makeRun, makeTest } from './helpers/records';
import { useTmpDirs } from './helpers/tmp';

const tmp = useTmpDirs();

describe('history', () => {
  it('writeRun validates and writes a v1 file that round-trips', () => {
    const dir = join(tmp(), 'h');
    const run = makeRun([makeTest()], { startedAt: Date.UTC(2026, 0, 2, 3, 4, 5, 6) });
    const file = writeRun(dir, run);
    expect(file).toBe(join(dir, 'run-2026-01-02T03-04-05-006Z-all.v1.json'));
    expect(readHistory(dir)).toEqual([RunRecordSchema.parse(run)]);
  });

  it('writeRun refuses an invalid record and writes nothing', () => {
    const dir = join(tmp(), 'h');
    expect(() => writeRun(dir, { ...makeRun([]), status: 'nope' } as never)).toThrow();
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });

  it('file names contain shard info and sort chronologically', () => {
    expect(historyFileName({ startedAt: 0, shard: { current: 2, total: 4 } })).toBe('run-1970-01-01T00-00-00-000Z-2of4.v1.json');
    expect(historyFileName({ startedAt: 0 })).toMatch(/-all\.v1\.json$/);
  });

  it('readHistory returns runs oldest first regardless of write order', () => {
    const dir = join(tmp(), 'h');
    for (const at of [3000, 1000, 2000]) writeRun(dir, makeRun([makeTest()], { startedAt: at, runId: `r${at}` }));
    expect(readHistory(dir).map((r) => r.runId)).toEqual(['r1000', 'r2000', 'r3000']);
  });

  it('readHistory(limit) returns the most recent N, still oldest first', () => {
    const dir = join(tmp(), 'h');
    for (let i = 1; i <= 5; i++) writeRun(dir, makeRun([makeTest()], { startedAt: i * 1000, runId: `r${i}` }));
    expect(readHistory(dir, 2).map((r) => r.runId)).toEqual(['r4', 'r5']);
    expect(readHistory(dir, 99)).toHaveLength(5);
    expect(readHistory(dir, 0)).toHaveLength(5);
  });

  it('skips corrupt, schema-invalid and unrelated files', () => {
    const dir = join(tmp(), 'h');
    writeRun(dir, makeRun([makeTest()], { startedAt: 1000, runId: 'good' }));
    writeFileSync(join(dir, 'run-2026-01-01T00-00-00-000Z-all.v1.json'), '{ not json');
    writeFileSync(join(dir, 'run-2026-01-02T00-00-00-000Z-all.v1.json'), JSON.stringify({ schemaVersion: 2, runId: 'x' }));
    writeFileSync(join(dir, 'run-2026-01-03T00-00-00-000Z-all.v2.json'), JSON.stringify(makeRun([])));
    writeFileSync(join(dir, 'notes.txt'), 'hello');
    expect(readHistory(dir).map((r) => r.runId)).toEqual(['good']);
  });

  it('missing directory yields []', () => {
    expect(readHistory(join(tmp(), 'nope'))).toEqual([]);
    expect(pruneHistory(join(tmp(), 'nope'), 3)).toBe(0);
  });

  it('pruneHistory deletes the oldest files and keeps `keep` newest', () => {
    const dir = join(tmp(), 'h');
    for (let i = 1; i <= 6; i++) writeRun(dir, makeRun([makeTest()], { startedAt: Date.UTC(2026, 0, i), runId: `r${i}` }));
    expect(pruneHistory(dir, 3)).toBe(3);
    expect(readHistory(dir).map((r) => r.runId)).toEqual(['r4', 'r5', 'r6']);
    expect(pruneHistory(dir, 3)).toBe(0);
  });

  it('pruneHistory never deletes everything (keep is at least 1) and leaves foreign files', () => {
    const dir = join(tmp(), 'h');
    for (let i = 1; i <= 3; i++) writeRun(dir, makeRun([makeTest()], { startedAt: Date.UTC(2026, 0, i), runId: `r${i}` }));
    writeFileSync(join(dir, 'keep.me'), 'x');
    pruneHistory(dir, 0);
    expect(readHistory(dir).map((r) => r.runId)).toEqual(['r3']);
    expect(readdirSync(dir)).toContain('keep.me');
  });

  it('writing into a not-yet-existing nested directory creates it', () => {
    const dir = join(tmp(), 'a', 'b', 'history');
    mkdirSync(join(dir, '..'), { recursive: true });
    writeRun(dir, makeRun([]));
    expect(readdirSync(dir)).toHaveLength(1);
  });
});

describe('mergeRuns', () => {
  const shardRun = (n: number, total: number, tests: ReturnType<typeof makeTest>[], over = {}) =>
    makeRun(tests, { startedAt: 1000 * n, durationMs: 500, shard: { current: n, total }, runId: `s${n}`, ...over });

  it('combines tests of all shards and recomputes totals', () => {
    const a = shardRun(1, 2, [makeTest({ id: 'a' }), makeTest({ id: 'b', status: 'failed' })]);
    const b = shardRun(2, 2, [makeTest({ id: 'c', flaky: true }), makeTest({ id: 'd', status: 'skipped' }), makeTest({ id: 'e', quarantined: true })]);
    const m = mergeRuns([b, a]);
    expect(m.tests.map((t) => t.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(m.totals).toEqual({ total: 5, passed: 2, failed: 1, flaky: 1, skipped: 1, quarantined: 1, healed: 0 });
    expect(m.status).toBe('failed');
    expect(m.shard).toEqual({ current: 0, total: 2 });
    expect(m.startedAt).toBe(1000);
    expect(m.durationMs).toBe(2000 + 500 - 1000);
    expect(m.runId).toBe('merged-1000');
    expect(RunRecordSchema.safeParse(m).success).toBe(true);
  });

  it('later shard wins for duplicate ids', () => {
    const a = shardRun(1, 2, [makeTest({ id: 'x', status: 'failed' })]);
    const b = shardRun(2, 2, [makeTest({ id: 'x', status: 'passed' })]);
    const m = mergeRuns([a, b]);
    expect(m.tests).toHaveLength(1);
    expect(m.tests[0]!.status).toBe('passed');
    expect(m.totals.failed).toBe(0);
  });

  it('status is the worst of the shards; failed totals upgrade a "passed" status', () => {
    const ok = shardRun(1, 2, [makeTest({ id: 'a' })]);
    const timed = shardRun(2, 2, [makeTest({ id: 'b' })], { status: 'timedout' });
    expect(mergeRuns([ok, timed]).status).toBe('timedout');
    const sneaky = shardRun(2, 2, [makeTest({ id: 'f', status: 'failed' })], { status: 'passed' });
    expect(mergeRuns([ok, sneaky]).status).toBe('failed');
    expect(mergeRuns([ok, shardRun(2, 2, [], { status: 'interrupted' })]).status).toBe('interrupted');
  });

  it('single unsharded record: no shard in the result', () => {
    const m = mergeRuns([makeRun([makeTest()])]);
    expect(m.shard).toBeUndefined();
  });

  it('keeps first available env / versions / ci', () => {
    const a = shardRun(1, 2, [], { env: 'staging', ci: { provider: 'jenkins' } });
    const b = shardRun(2, 2, [], { playwrightVersion: '1.64.0' });
    const m = mergeRuns([a, b]);
    expect(m).toMatchObject({ env: 'staging', playwrightVersion: '1.64.0', ci: { provider: 'jenkins' } });
  });

  it('does not mutate its inputs', () => {
    const a = shardRun(2, 2, [makeTest({ id: 'a' })]);
    const b = shardRun(1, 2, [makeTest({ id: 'b' })]);
    const input = [a, b];
    mergeRuns(input);
    expect(input[0]).toBe(a);
    expect(a.totals.total).toBe(1);
  });

  it('throws TF_MERGE_EMPTY for no records', () => {
    expect(() => mergeRuns([])).toThrowError(/^\[TF_MERGE_EMPTY\]/);
  });
});
