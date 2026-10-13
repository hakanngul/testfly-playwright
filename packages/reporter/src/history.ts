import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunRecordSchema, type RunRecord } from './schema';

const FILE_RE = /^run-.+\.v1\.json$/;

/**
 * Reads run records from `historyDir` (oldest first). Unreadable or schema-invalid files are
 * skipped. With `limit`, only the most recent `limit` runs are returned.
 *
 * @public
 */
export function readHistory(historyDir: string, limit?: number): RunRecord[] {
  let names: string[];
  try {
    names = readdirSync(historyDir).filter((n) => FILE_RE.test(n));
  } catch {
    return [];
  }
  const runs: RunRecord[] = [];
  for (const name of names) {
    try {
      const parsed = RunRecordSchema.safeParse(JSON.parse(readFileSync(join(historyDir, name), 'utf8')));
      if (parsed.success) runs.push(parsed.data);
    } catch {
      // corrupt file: ignore
    }
  }
  runs.sort((a, b) => a.startedAt - b.startedAt || a.runId.localeCompare(b.runId));
  return limit !== undefined && limit > 0 ? runs.slice(-limit) : runs;
}

/** Builds the history file name for a run: `run-<ISO timestamp safe>-<shard>.v1.json`. @internal */
export function historyFileName(run: Pick<RunRecord, 'startedAt' | 'shard'>): string {
  const ts = new Date(run.startedAt).toISOString().replace(/[:.]/g, '-');
  const shard = run.shard ? `${run.shard.current}of${run.shard.total}` : 'all';
  return `run-${ts}-${shard}.v1.json`;
}

/** Writes a validated run record into `historyDir` and returns the file path. @public */
export function writeRun(historyDir: string, run: RunRecord): string {
  const validated = RunRecordSchema.parse(run);
  mkdirSync(historyDir, { recursive: true });
  const file = join(historyDir, historyFileName(validated));
  writeFileSync(file, JSON.stringify(validated, null, 2) + '\n');
  return file;
}

/** Deletes the oldest run files so that at most `keep` remain. @public */
export function pruneHistory(historyDir: string, keep: number): number {
  let names: string[];
  try {
    names = readdirSync(historyDir).filter((n) => FILE_RE.test(n));
  } catch {
    return 0;
  }
  // File names start with a sortable ISO timestamp, so lexical order is chronological.
  names.sort();
  const excess = names.slice(0, Math.max(0, names.length - Math.max(1, keep)));
  for (const n of excess) {
    try {
      unlinkSync(join(historyDir, n));
    } catch {
      // ignore
    }
  }
  return excess.length;
}
