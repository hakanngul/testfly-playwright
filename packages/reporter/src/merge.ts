import { RunRecordSchema, type RunRecord, type TestRecord } from './schema';
import { computeTotals } from './totals';

const STATUS_RANK: Record<RunRecord['status'], number> = { passed: 0, failed: 1, timedout: 2, interrupted: 3 };

/**
 * Merges the run records of several shards into one logical run. Tests are de-duplicated by id
 * (the record from the later shard wins), totals are recomputed and the duration spans the
 * earliest start to the latest end.
 *
 * @public
 */
export function mergeRuns(records: RunRecord[]): RunRecord {
  if (records.length === 0) throw new Error('[TF_MERGE_EMPTY] mergeRuns() needs at least one run record\n  → Pass the shard run files from <outputDir>/history.');
  const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);
  const first = sorted[0]!;
  const tests = new Map<string, TestRecord>();
  for (const r of sorted) for (const t of r.tests) tests.set(t.id, t);
  const merged = [...tests.values()];
  const end = Math.max(...sorted.map((r) => r.startedAt + r.durationMs));
  let status: RunRecord['status'] = 'passed';
  for (const r of sorted) if (STATUS_RANK[r.status] > STATUS_RANK[status]) status = r.status;
  const totals = computeTotals(merged);
  if (totals.failed > 0 && status === 'passed') status = 'failed';
  const total = Math.max(...sorted.map((r) => r.shard?.total ?? 1));
  return RunRecordSchema.parse({
    schemaVersion: 1,
    runId: `merged-${first.startedAt}`,
    startedAt: first.startedAt,
    durationMs: end - first.startedAt,
    status,
    env: sorted.find((r) => r.env)?.env,
    playwrightVersion: sorted.find((r) => r.playwrightVersion)?.playwrightVersion,
    testflyVersion: sorted.find((r) => r.testflyVersion)?.testflyVersion,
    shard: total > 1 ? { current: 0, total } : undefined,
    ci: sorted.find((r) => r.ci)?.ci,
    totals,
    tests: merged,
  });
}
