import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { computeFlakiness } from '../flakiness';
import type { FlakinessEntry, HealEvent, RunRecord, TestRecord } from '../schema';
import { passRate } from '../totals';

const MAX_BODY = 4000;
const MAX_STACK = 6000;

/** Aggregated heal log entry (a to-do item: fix the brittle locator). @public */
export interface HealLogEntry {
  key: string;
  original: string;
  healed: string;
  strategy: string;
  avgConfidence: number;
  count: number;
  lastSeen: number;
  url?: string;
  tests: string[];
}

/** Compact per-run data for the History tab. @public */
export interface HistoryPoint {
  runId: string;
  startedAt: number;
  durationMs: number;
  status: RunRecord['status'];
  passRate: number;
  totals: RunRecord['totals'];
  branch?: string;
  shard?: string;
}

/** Everything the dashboard needs, embedded as JSON in the HTML. @public */
export interface DashboardModel {
  generatedAt: number;
  latest: RunRecord;
  history: HistoryPoint[];
  flakiness: FlakinessEntry[];
  heals: HealLogEntry[];
}

function clip(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? `${text.slice(0, max)}… [truncated ${text.length - max} chars]` : text;
}

function slimTest(t: TestRecord, reportDir: string, outputBase: string): TestRecord & { artifacts: Array<TestRecord['artifacts'][number] & { href: string }> } {
  return {
    ...t,
    error: t.error
      ? { message: clip(t.error.message, MAX_STACK) ?? '', stack: clip(t.error.stack, MAX_STACK), snippet: clip(t.error.snippet, MAX_STACK) }
      : undefined,
    api: t.api.map((a) => ({ ...a, requestBody: clip(a.requestBody, MAX_BODY), responseBody: clip(a.responseBody, MAX_BODY) })),
    artifacts: t.artifacts.map((a) => {
      const abs = isAbsolute(a.path) ? a.path : resolve(outputBase, a.path);
      return { ...a, href: encodeURI(relative(reportDir, abs).split('\\').join('/')) };
    }),
  };
}

function aggregateHeals(records: RunRecord[]): HealLogEntry[] {
  const map = new Map<string, HealLogEntry & { confSum: number }>();
  for (const run of records) {
    for (const t of run.tests) {
      for (const h of t.heals as HealEvent[]) {
        const k = `${h.key}\u0000${h.original}\u0000${h.healed}`;
        const e = map.get(k) ?? { key: h.key, original: h.original, healed: h.healed, strategy: h.strategy, avgConfidence: 0, confSum: 0, count: 0, lastSeen: 0, url: h.url, tests: [] };
        e.count += 1;
        e.confSum += h.confidence;
        if (h.timestamp >= e.lastSeen) {
          e.lastSeen = h.timestamp;
          e.strategy = h.strategy;
          e.url = h.url ?? e.url;
        }
        if (!e.tests.includes(t.title)) e.tests.push(t.title);
        map.set(k, e);
      }
    }
  }
  return [...map.values()]
    .map(({ confSum, ...e }) => ({ ...e, avgConfidence: Math.round((confSum / e.count) * 100) / 100, tests: e.tests.slice(0, 10) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Builds the dashboard data model from run records (oldest first, current run last).
 * `outputFile` is used to resolve artifact links relative to the HTML file; artifact paths that
 * are not absolute are interpreted relative to the parent of the report directory (the outputDir).
 *
 * @public
 */
export function buildDashboardModel(records: RunRecord[], outputFile: string): DashboardModel {
  if (records.length === 0) throw new Error('[TF_DASHBOARD_EMPTY] generateDashboard() needs at least one run record\n  → Run the tests first or pass run files from <outputDir>/history.');
  const latest = records[records.length - 1]!;
  const reportDir = dirname(resolve(outputFile));
  const outputBase = dirname(reportDir);
  const slim = { ...latest, tests: latest.tests.map((t) => slimTest(t, reportDir, outputBase)) } as RunRecord;
  return {
    generatedAt: Date.now(),
    latest: slim,
    history: records.map((r) => ({
      runId: r.runId,
      startedAt: r.startedAt,
      durationMs: r.durationMs,
      status: r.status,
      passRate: Math.round(passRate(r.totals) * 10) / 10,
      totals: r.totals,
      branch: r.ci?.branch,
      shard: r.shard ? `${r.shard.current}/${r.shard.total}` : undefined,
    })),
    flakiness: computeFlakiness(records),
    heals: aggregateHeals(records),
  };
}
