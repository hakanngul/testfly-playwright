import { readHistory } from './history';

/** Result of {@link planShards}. @public */
export interface ShardPlan {
  /** Files assigned to the requested shard. */
  files: string[];
  estimatedMs: number;
  /** Full plan for all shards (index is 1-based, like Playwright's `--shard=1/3`). */
  plan: Array<{ index: number; files: string[]; estimatedMs: number }>;
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2);
}

/**
 * LPT (Longest Processing Time first) bin-packing of test FILES into `total` shards.
 * Durations are the average per-file total across runs in `historyDir`; files without history
 * get the median of known files (or `defaultDurationMs`, default 30000). Deterministic:
 * ties are broken by file name, then by lowest shard index.
 *
 * @param args.index 1-based shard index (as in Playwright `--shard=index/total`).
 * @public
 */
export function planShards(args: {
  historyDir: string;
  total: number;
  index: number;
  testFiles: string[];
  defaultDurationMs?: number;
}): ShardPlan {
  const total = Math.max(1, Math.floor(args.total));
  const index = Math.min(Math.max(1, Math.floor(args.index)), total);

  // Per-file duration per run, then averaged over the runs the file appeared in.
  const sums = new Map<string, { sum: number; runs: number }>();
  for (const run of readHistory(args.historyDir)) {
    const perFile = new Map<string, number>();
    for (const t of run.tests) {
      if (t.status === 'skipped' || t.quarantined) continue;
      const f = norm(t.file);
      perFile.set(f, (perFile.get(f) ?? 0) + t.durationMs);
    }
    for (const [f, d] of perFile) {
      const e = sums.get(f) ?? { sum: 0, runs: 0 };
      e.sum += d;
      e.runs += 1;
      sums.set(f, e);
    }
  }
  const known = [...sums.entries()].map(([f, e]) => [f, e.sum / e.runs] as const);

  const lookup = (file: string): number | undefined => {
    const n = norm(file);
    const direct = sums.get(n);
    if (direct) return direct.sum / direct.runs;
    // History stores paths relative to the project root; test files may be absolute.
    let best: { len: number; avg: number } | undefined;
    for (const [h, avg] of known) {
      if ((n.endsWith('/' + h) || h.endsWith('/' + n)) && (!best || h.length > best.len)) best = { len: h.length, avg };
    }
    return best?.avg;
  };

  const unique = [...new Set(args.testFiles)];
  const resolved = unique.map((file) => ({ file, ms: lookup(file) }));
  const fallback = median(resolved.flatMap((r) => (r.ms === undefined ? [] : [r.ms]))) ?? args.defaultDurationMs ?? 30_000;
  const items = resolved
    .map((r) => ({ file: r.file, ms: Math.round(r.ms ?? fallback) }))
    .sort((a, b) => b.ms - a.ms || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  const bins = Array.from({ length: total }, (_, i) => ({ index: i + 1, files: [] as string[], estimatedMs: 0 }));
  for (const item of items) {
    let target = bins[0]!;
    for (const b of bins) if (b.estimatedMs < target.estimatedMs) target = b;
    target.files.push(item.file);
    target.estimatedMs += item.ms;
  }
  for (const b of bins) b.files.sort();
  const mine = bins[index - 1]!;
  return { files: mine.files, estimatedMs: mine.estimatedMs, plan: bins };
}
