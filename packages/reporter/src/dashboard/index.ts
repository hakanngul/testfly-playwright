import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunRecord } from '../schema';
import { buildDashboardModel } from './model';
import { renderHtml } from './template';

export { buildDashboardModel, type DashboardModel, type HealLogEntry, type HistoryPoint } from './model';

/**
 * Generates the self-contained HTML dashboard (inline CSS/JS, no network access).
 * `records` are run records oldest first; the last one is the "current" run.
 * To combine shards first call `mergeRuns()`.
 *
 * @public
 */
export function generateDashboard(records: RunRecord[], outputFile: string): void {
  const html = renderHtml(buildDashboardModel(records, outputFile));
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, html);
}
