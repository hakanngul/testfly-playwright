import type { RunRecord, TestRecord } from '../../src/schema';
import { computeTotals } from '../../src/totals';

export function makeTest(over: Partial<TestRecord> = {}): TestRecord {
  const title = over.title ?? 'works';
  const file = over.file ?? 'tests/a.spec.ts';
  const project = over.project ?? 'chromium';
  return {
    id: over.id ?? `${project}::${file}::${title}`,
    title,
    titlePath: [title],
    file,
    project,
    tags: [],
    status: 'passed',
    flaky: false,
    quarantined: false,
    retries: 0,
    durationMs: 100,
    heals: [],
    steps: [],
    api: [],
    ai: [],
    console: [],
    artifacts: [],
    ...over,
  };
}

export function makeRun(tests: TestRecord[], over: Partial<RunRecord> = {}): RunRecord {
  return {
    schemaVersion: 1,
    runId: over.runId ?? `r-${over.startedAt ?? 1000}`,
    startedAt: 1000,
    durationMs: 5000,
    status: 'passed',
    totals: computeTotals(tests),
    tests,
    ...over,
  };
}

export const heal = (over: Record<string, unknown> = {}) => ({
  key: 'login.button',
  original: '#old',
  healed: '#new',
  strategy: 'text',
  confidence: 0.9,
  timestamp: 1,
  ...over,
});
